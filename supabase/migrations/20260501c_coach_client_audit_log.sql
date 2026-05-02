-- 2026-05-01 — Coach → client edit audit log + Training Inputs RPC
--
-- Three artifacts ship together so PR 3b's per-section edit forms have
-- a single backend surface to write through:
--
--   1. coach_client_audit_log — append-only history of every coach
--      edit to a client's user_data. Stores before/after JSONB snapshots
--      so the client can see what changed and revert if they want, and
--      so support can debug "my coach changed my plan and I don't know
--      what" tickets without spelunking through Supabase logs.
--
--   2. coach_update_client_training_input(p_client_id, p_data_key,
--      p_data_value) — SECURITY DEFINER RPC that wraps the write +
--      audit log + pendingPlanRegen flag in one transaction. Verifies
--      caller is a paired active coach. Allowlist of editable keys is
--      narrower than the SELECT allowlist (coaches can READ everything
--      they need but only WRITE the inputs that drive plan generation).
--
--   3. pendingPlanRegen flag (stored as user_data row) — set by every
--      RPC write so the client's app, on next boot, re-runs the plan
--      generator with the new inputs and clears the flag. This avoids
--      having to run the generator on the coach's browser (different
--      profile state, more RLS surface).
--
-- All idempotent — `if not exists` / `drop policy if exists` /
-- `create or replace function`.

-- ── 1. Audit log table ────────────────────────────────────────────────────

create table if not exists public.coach_client_audit_log (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references auth.users(id) on delete cascade,
  coach_id     uuid not null references auth.users(id) on delete cascade,
  data_key     text not null,
  before_value jsonb,
  after_value  jsonb,
  action       text not null check (action in ('update', 'delete')),
  created_at   timestamptz not null default now()
);

create index if not exists coach_client_audit_log_client_idx
  on public.coach_client_audit_log (client_id, created_at desc);
create index if not exists coach_client_audit_log_coach_idx
  on public.coach_client_audit_log (coach_id, created_at desc);

alter table public.coach_client_audit_log enable row level security;

-- Clients can read their own audit history (so a future "Coach edits"
-- timeline UI on the client side can surface changes the coach made).
drop policy if exists "Clients can view own audit log" on public.coach_client_audit_log;
create policy "Clients can view own audit log"
  on public.coach_client_audit_log
  for select
  using (auth.uid() = client_id);

-- Coaches can read entries they wrote (so coach-side "history" surfaces
-- — not built yet, but the policy lands now so it's available when
-- needed).
drop policy if exists "Coaches can view their own audit writes" on public.coach_client_audit_log;
create policy "Coaches can view their own audit writes"
  on public.coach_client_audit_log
  for select
  using (auth.uid() = coach_id);

-- INSERT happens exclusively via the SECURITY DEFINER RPC below.
-- No direct INSERT policy.

-- ── 2. RPC: coach_update_client_training_input ────────────────────────────

create or replace function public.coach_update_client_training_input(
  p_client_id uuid,
  p_data_key  text,
  p_data_value jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_before   jsonb;
  v_now      timestamptz := now();
  v_allowed_keys text[] := array[
    'selectedSports',
    'trainingGoals',
    'strengthRole',
    'strengthSetup',
    'longDays',
    'thresholds',
    'buildPlanTemplate',
    'raceEvents',
    'events'
  ];
begin
  if v_coach_id is null then
    raise exception 'unauthenticated';
  end if;

  -- Allowlist check — narrower than the SELECT allowlist by design.
  -- Coaches read more keys than they're allowed to write. New writable
  -- keys must be added here AND in the front-end's edit surface.
  if not (p_data_key = any(v_allowed_keys)) then
    raise exception 'data_key not writable by coach: %', p_data_key;
  end if;

  -- Pairing check — caller must be an active coach for this client.
  -- is_coaching() is the helper from 20260428_coaching_schema; covers
  -- both primary and sub-coach roles.
  if not public.is_coaching(v_coach_id, p_client_id) then
    raise exception 'not a coach for this client';
  end if;

  -- Snapshot the prior value (null if no row yet) for the audit log.
  select data_value into v_before
    from public.user_data
   where user_id = p_client_id and data_key = p_data_key;

  -- Upsert the new value with audit-trail columns. user_data has unique
  -- (user_id, data_key) per the existing migration.
  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (p_client_id, p_data_key, p_data_value, v_coach_id, v_now)
  on conflict (user_id, data_key) do update
    set data_value     = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;

  -- Audit log entry.
  insert into public.coach_client_audit_log
    (client_id, coach_id, data_key, before_value, after_value, action)
  values
    (p_client_id, v_coach_id, p_data_key, v_before, p_data_value, 'update');

  -- Stamp the pending-regenerate flag so the client's app re-runs the
  -- plan generator on next boot. Stored as user_data row so it syncs
  -- like everything else; client-side hook reads it, runs the generator
  -- locally, then clears it. Carries the timestamp + coach id so a
  -- future "Coach updated your plan at 3:42 PM" toast on client open
  -- can attribute the change.
  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (
    p_client_id,
    'pendingPlanRegen',
    jsonb_build_object('since', v_now, 'triggeredBy', v_coach_id, 'reason', p_data_key),
    v_coach_id,
    v_now
  )
  on conflict (user_id, data_key) do update
    set data_value     = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;
end;
$$;

revoke all on function public.coach_update_client_training_input(uuid, text, jsonb) from public;
grant execute on function public.coach_update_client_training_input(uuid, text, jsonb) to authenticated;

-- ── 3. Extend coach + client SELECT allowlist for pendingPlanRegen ────────
-- The RPC writes pendingPlanRegen on every coach edit; both coach and
-- client need to read it (client to know it must regenerate, coach to
-- see "regen pending" status). Add to the existing SELECT policy by
-- updating the allowlist — the rest of the policy stays as-is.

drop policy if exists "Coaches can view permitted client user_data" on public.user_data;

create policy "Coaches can view permitted client user_data"
  on public.user_data
  for select
  using (
    public.is_coaching(auth.uid(), user_id)
    and (
      data_key in (
        'workouts', 'workoutSchedule', 'trainingPlan',
        'completedSessions', 'workoutRatings',
        'personalRecords', 'trainingZones', 'trainingZonesHistory',
        'trainingPreferences', 'trainingNotes',
        'dayRestrictions', 'equipmentRestrictions', 'equipmentProfile',
        'events', 'raceEvents', 'thresholds', 'strengthSetup',
        'strengthRole', 'buildPlanTemplate', 'longDays',
        'workoutEffortFeedback', 'calibrationSignals',
        'activePlan', 'activePlanAt', 'activePlanSource', 'activePlanId',
        'currentRecoveryState', 'latestCheckIn', 'checkinHistory',
        'userLevel', 'fitnessGoals', 'selectedSports', 'trainingGoals',
        'gear_checklists_v1', 'completedChallenges', 'activeChallenges',
        'importedPlans', 'gymStrengthEnabled', 'measurementSystem',
        'injuries',
        'pendingPlanRegen',
        'nutritionEnabled', 'hydrationEnabled', 'fuelingEnabled'
      )
      or
      (data_key = 'nutritionAdjustments'
        and public.is_feature_enabled(user_id, 'nutritionEnabled'))
      or
      (data_key in ('hydrationSettings', 'hydrationDailyTargetOz')
        and public.is_feature_enabled(user_id, 'hydrationEnabled'))
      or
      (data_key = 'fuelingPrefs'
        and public.is_feature_enabled(user_id, 'fuelingEnabled'))
    )
  );
