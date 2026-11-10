-- Shadow workspace only. This migration does not activate an engine, replace
-- approved plans, or change the legacy user_data projection/write paths.
create schema if not exists ironz_training_private;
revoke all on schema ironz_training_private from public, anon;
grant usage on schema ironz_training_private to authenticated;

create table public.training_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision between 0 and 9007199254740990),
  input_revision bigint,
  athlete_input jsonb,
  shadow_candidate jsonb,
  candidate_status text not null default 'unvalidated_shadow' check (candidate_status = 'unvalidated_shadow'),
  latest_decision jsonb,
  updated_at timestamptz not null default now()
);
create table public.training_workspace_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  request_id uuid not null,
  expected_revision bigint not null,
  command jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, revision),
  unique (user_id, request_id)
);
alter table public.training_workspaces enable row level security;
alter table public.training_workspace_events enable row level security;
revoke all on public.training_workspaces, public.training_workspace_events from public, anon, authenticated;
grant select on public.training_workspaces, public.training_workspace_events to authenticated;
create policy training_workspace_owner_read on public.training_workspaces
  for select to authenticated using ((select auth.uid()) = user_id);
create policy training_workspace_event_owner_read on public.training_workspace_events
  for select to authenticated using ((select auth.uid()) = user_id);

-- The definer is deliberately in a non-exposed schema. Only this authenticated,
-- owner-derived command boundary can write. Expected identity binds a captured
-- request to its actor; it cannot select another owner or authorize a write.
create function ironz_training_private.apply_workspace_command(
  p_expected_user_id uuid, p_expected_revision bigint, p_request_id uuid, p_command jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_state public.training_workspaces%rowtype;
  v_prior public.training_workspace_events%rowtype;
  v_kind text;
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sign in before changing training state.';
  end if;
  if p_expected_user_id is distinct from v_uid then
    raise exception using errcode = '42501', message = 'Your account changed. Reload training state.';
  end if;
  if p_request_id is null or p_expected_revision is null
     or p_expected_revision < 0 or p_expected_revision >= 9007199254740990
     or p_command is null or jsonb_typeof(p_command) <> 'object'
     or octet_length(p_command::text) > 2097152 then
    raise exception using errcode = '22023', message = 'Invalid training command.';
  end if;
  v_kind := p_command->>'kind';
  v_payload := p_command->'payload';
  if v_kind is null or v_kind not in ('replace_inputs', 'record_shadow_candidate', 'record_decision')
     or v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Unsupported training command.';
  end if;

  insert into public.training_workspaces(user_id) values (v_uid)
    on conflict (user_id) do nothing;
  select * into v_state from public.training_workspaces where user_id = v_uid for update;
  select * into v_prior from public.training_workspace_events
    where user_id = v_uid and request_id = p_request_id;
  if found then
    if v_prior.expected_revision <> p_expected_revision or v_prior.command <> p_command then
      raise exception using errcode = '22023', message = 'Request identifier was already used for another command.';
    end if;
    return jsonb_build_object('revision', v_prior.revision, 'currentRevision', v_state.revision,
      'requestId', p_request_id, 'replayed', true);
  end if;
  if v_state.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Training state changed. Reload and review before retrying.';
  end if;

  if v_kind = 'replace_inputs' then
    if jsonb_typeof(v_payload->'input') is distinct from 'object'
       or v_payload->'input'->>'version' is distinct from 'athlete-input-v1'
       or jsonb_typeof(v_payload->'input'->'profile') is distinct from 'object'
       or jsonb_typeof(v_payload->'input'->'asOf') is distinct from 'string'
       or (v_payload->'input'->>'asOf') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
      raise exception using errcode = '22023', message = 'A normalized athlete input is required.';
    end if;
    perform (v_payload->'input'->>'asOf')::timestamptz;
    v_state.athlete_input := v_payload->'input';
    v_state.input_revision := v_state.revision + 1;
    -- Old candidates remain in immutable events, but cannot appear current.
    v_state.shadow_candidate := null;
  elsif v_kind = 'record_shadow_candidate' then
    if v_state.athlete_input is null
       or v_payload->'inputRevision' is distinct from to_jsonb(v_state.input_revision)
       or jsonb_typeof(v_payload->'candidate') is distinct from 'object'
       or v_payload->'candidate'->'planMetadata'->>'readiness' is distinct from 'shadow_only'
       or v_payload->'candidate'->'planMetadata'->>'inputVersion' is distinct from v_state.athlete_input->>'version'
       or v_payload->'candidate'->'planMetadata'->>'generatedAt' is distinct from v_state.athlete_input->>'asOf'
       or jsonb_typeof(v_payload->'candidate'->'weeklyPlan') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Candidate must reference the current input and remain shadow-only.';
    end if;
    if jsonb_array_length(v_payload->'candidate'->'weeklyPlan') = 0 then
      raise exception using errcode = '22023', message = 'An empty candidate cannot replace a previous candidate.';
    end if;
    if exists (select 1 from jsonb_array_elements(v_payload->'candidate'->'weeklyPlan') as week(value)
      where jsonb_typeof(value) is distinct from 'object'
         or jsonb_typeof(value->'sessions') is distinct from 'array') then
      raise exception using errcode = '22023', message = 'Candidate weeks need structured session arrays.';
    end if;
    -- This is envelope/storage validation, never coaching or clinical approval.
    v_state.shadow_candidate := v_payload->'candidate';
  else
    if jsonb_typeof(v_payload->'decision') is distinct from 'object'
       or v_payload->'decision'->>'kind' is null
       or v_payload->'decision'->>'kind' not in ('preference', 'athlete_response') then
      raise exception using errcode = '22023', message = 'A preference or athlete response is required.';
    end if;
    -- Recording a response does not approve or mutate a training prescription.
    v_state.latest_decision := v_payload->'decision';
  end if;

  update public.training_workspaces set revision = v_state.revision + 1,
    input_revision = v_state.input_revision, athlete_input = v_state.athlete_input,
    shadow_candidate = v_state.shadow_candidate, latest_decision = v_state.latest_decision,
    updated_at = now() where user_id = v_uid;
  insert into public.training_workspace_events(user_id, revision, request_id, expected_revision, command)
    values (v_uid, v_state.revision + 1, p_request_id, p_expected_revision, p_command);
  return jsonb_build_object('revision', v_state.revision + 1, 'currentRevision', v_state.revision + 1,
    'requestId', p_request_id, 'replayed', false);
end;
$$;
revoke all on function ironz_training_private.apply_workspace_command(uuid, bigint, uuid, jsonb) from public, anon;
grant execute on function ironz_training_private.apply_workspace_command(uuid, bigint, uuid, jsonb) to authenticated;

create function public.apply_training_workspace_command(
  p_expected_user_id uuid, p_expected_revision bigint, p_request_id uuid, p_command jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select ironz_training_private.apply_workspace_command(p_expected_user_id, p_expected_revision, p_request_id, p_command);
$$;
revoke all on function public.apply_training_workspace_command(uuid, bigint, uuid, jsonb) from public, anon;
grant execute on function public.apply_training_workspace_command(uuid, bigint, uuid, jsonb) to authenticated;
