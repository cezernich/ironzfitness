-- 2026-05-01 — Coach delete client's race + AI plan
--
-- SECURITY DEFINER RPC that lets a paired coach decommission a
-- client's race and the AI-generated plan tied to it. Preserves:
--
--   - coach_assigned_workouts        — coaches' deliberate per-day
--                                       assignments stay; deleting a
--                                       race shouldn't silently undo
--                                       a coach's earlier work.
--   - workouts (completed history)   — never touched.
--   - trainingPlan / workoutSchedule entries with no raceId or with
--     a raceId that doesn't match — likely belong to a different
--     race or template-only days.
--
-- Audit log entry stores the deleted race + counts of stripped
-- entries in before_value so a future undo can rebuild it (or at
-- minimum the client + support can see what happened). after_value
-- is null for delete actions (per the audit-log check constraint
-- on action='delete').
--
-- pendingPlanRegen is intentionally NOT stamped — the plan is gone
-- and there's nothing to regenerate against. The athlete sees the
-- empty state on next boot.

create or replace function public.coach_delete_client_race(
  p_client_id uuid,
  p_race_id   text
)
returns jsonb  -- { removed_plan: int, removed_schedule: int, race: jsonb }
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := auth.uid();
  v_now      timestamptz := now();
  v_race_events  jsonb;
  v_events       jsonb;
  v_training_plan jsonb;
  v_workout_schedule jsonb;
  v_race jsonb;
  v_filtered_race_events  jsonb;
  v_filtered_events       jsonb;
  v_filtered_plan         jsonb;
  v_filtered_schedule     jsonb;
  v_removed_plan      int := 0;
  v_removed_schedule  int := 0;
  v_audit_payload     jsonb;
begin
  if v_coach_id is null then
    raise exception 'unauthenticated';
  end if;
  if not public.is_coaching(v_coach_id, p_client_id) then
    raise exception 'not a coach for this client';
  end if;

  -- Load the four relevant user_data rows. Each may be missing for
  -- accounts that haven't built a plan; treat missing as empty array.
  select coalesce(data_value, '[]'::jsonb) into v_race_events
    from public.user_data where user_id = p_client_id and data_key = 'raceEvents';
  select coalesce(data_value, '[]'::jsonb) into v_events
    from public.user_data where user_id = p_client_id and data_key = 'events';
  select coalesce(data_value, '[]'::jsonb) into v_training_plan
    from public.user_data where user_id = p_client_id and data_key = 'trainingPlan';
  select coalesce(data_value, '[]'::jsonb) into v_workout_schedule
    from public.user_data where user_id = p_client_id and data_key = 'workoutSchedule';

  v_race_events    := coalesce(v_race_events, '[]'::jsonb);
  v_events         := coalesce(v_events, '[]'::jsonb);
  v_training_plan  := coalesce(v_training_plan, '[]'::jsonb);
  v_workout_schedule := coalesce(v_workout_schedule, '[]'::jsonb);

  -- Pull the race object out of whichever array it's in for the
  -- audit log payload. Race id is stored as text in the JSONB; cast
  -- both sides to text for the comparison.
  select x into v_race
    from jsonb_array_elements(v_race_events) x
    where x->>'id' = p_race_id
    limit 1;
  if v_race is null then
    select x into v_race
      from jsonb_array_elements(v_events) x
      where x->>'id' = p_race_id
      limit 1;
  end if;
  if v_race is null then
    raise exception 'race not found: %', p_race_id;
  end if;

  -- Filter the race out of both arrays — could legitimately exist in
  -- either, so always run both filters.
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_filtered_race_events
    from jsonb_array_elements(v_race_events) x
    where x->>'id' is distinct from p_race_id;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_filtered_events
    from jsonb_array_elements(v_events) x
    where x->>'id' is distinct from p_race_id;

  -- Plan + schedule: drop entries tagged with this raceId. For
  -- workoutSchedule we additionally preserve any entry sourced from
  -- coach_assigned (the coach's deliberate assignments shouldn't
  -- vanish because their parent race went away — that's the user-
  -- confirmed scope rule).
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_filtered_plan
    from jsonb_array_elements(v_training_plan) x
    where x->>'raceId' is distinct from p_race_id;
  v_removed_plan := jsonb_array_length(v_training_plan) - jsonb_array_length(v_filtered_plan);

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_filtered_schedule
    from jsonb_array_elements(v_workout_schedule) x
    where (x->>'raceId' is distinct from p_race_id)
       or (x->>'source' = 'coach_assigned');
  v_removed_schedule := jsonb_array_length(v_workout_schedule) - jsonb_array_length(v_filtered_schedule);

  -- Write back the four filtered arrays. Each upsert stamps audit
  -- columns. Idempotent — re-running with the same race id finds
  -- nothing and is a no-op (raises 'race not found' instead).
  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (p_client_id, 'raceEvents', v_filtered_race_events, v_coach_id, v_now)
  on conflict (user_id, data_key) do update
    set data_value = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;

  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (p_client_id, 'events', v_filtered_events, v_coach_id, v_now)
  on conflict (user_id, data_key) do update
    set data_value = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;

  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (p_client_id, 'trainingPlan', v_filtered_plan, v_coach_id, v_now)
  on conflict (user_id, data_key) do update
    set data_value = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;

  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (p_client_id, 'workoutSchedule', v_filtered_schedule, v_coach_id, v_now)
  on conflict (user_id, data_key) do update
    set data_value = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;

  -- Audit log: store the race object + removal counts in before_value
  -- so a future undo can rebuild from this row (the race object holds
  -- the full configuration; the workouts can be regenerated).
  v_audit_payload := jsonb_build_object(
    'race', v_race,
    'removed_plan', v_removed_plan,
    'removed_schedule', v_removed_schedule
  );
  insert into public.coach_client_audit_log
    (client_id, coach_id, data_key, before_value, after_value, action)
  values
    (p_client_id, v_coach_id, 'race:' || p_race_id, v_audit_payload, null, 'delete');

  return v_audit_payload;
end;
$$;

revoke all on function public.coach_delete_client_race(uuid, text) from public;
grant execute on function public.coach_delete_client_race(uuid, text) to authenticated;
