-- 2026-04-29 (Phase 3A.1) — Mirror coach_assigned_workouts → workoutSchedule
--
-- The client app reads its calendar from user_data.workoutSchedule (an
-- array of session objects). Coach-pushed workouts are stored canonically
-- in coach_assigned_workouts but need to ALSO appear in the client's
-- workoutSchedule so the existing render path picks them up without any
-- new branches in the calendar code.
--
-- Three triggers maintain the mirror:
--   • AFTER INSERT — appends a synthetic schedule entry, applying
--     conflict_mode (replace strips same-date entries first; stack is
--     append-only; freeze appends AND sets a client_plan_freeze row).
--   • AFTER UPDATE — replaces the synthetic entry in place when the
--     coach edits the workout (same coachAssignmentId, new content).
--   • AFTER DELETE — strips the synthetic entry (cleanup when coach
--     removes an assignment).
--
-- Synthetic entry shape — anything stored in coach_assigned_workouts.
-- workout (the JSONB the coach app writes; must shape-match a normal
-- workoutSchedule entry: type, sessionName, exercises, duration, etc.)
-- merged with these mirror-only fields:
--
--   id                  : 'coach-' || coach_assigned_workouts.id
--   date                : coach_assigned_workouts.date
--   source              : 'coach_assigned'
--   coachId             : coach_assigned_workouts.coach_id
--   coachAssignmentId   : coach_assigned_workouts.id
--   coachNote           : coach_assigned_workouts.coach_note
--   assignedAt          : coach_assigned_workouts.created_at
--
-- coachName is NOT stored in the mirror (would need to be re-mirrored
-- whenever the coach's profile.full_name changes). The client app looks
-- it up from profiles by coachId at render time; Phase 3A.3 wires this.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- Helper: produce the synthetic workoutSchedule entry from a row
-- ──────────────────────────────────────────────────────────────────────
-- Pure function — same coach_assigned_workouts row always produces the
-- same JSONB. Lets the INSERT and UPDATE triggers share the same
-- shape logic without duplication.

-- Note on the parameter name: PostgreSQL's `row` is a reserved word in
-- function parameter contexts (it conflicts with the row-type construct).
-- Using `assignment` avoids the parser bug — the original deployment had
-- to be patched locally before the trigger would compile.
CREATE OR REPLACE FUNCTION public._coach_assignment_to_schedule_entry(assignment public.coach_assigned_workouts)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT
    -- Start with the coach-supplied workout JSON. The coach app is
    -- expected to populate type / sessionName / exercises / duration
    -- so the existing renderer picks the entry up natively. Keys we
    -- mirror below win via the right-hand spread (|| precedence).
    COALESCE(assignment.workout, '{}'::jsonb)
    || jsonb_build_object(
         'id',                'coach-' || assignment.id::text,
         'date',              assignment.date::text,
         'source',            'coach_assigned',
         'coachId',           assignment.coach_id::text,
         'coachAssignmentId', assignment.id::text,
         'coachNote',         assignment.coach_note,
         'assignedAt',        to_jsonb(assignment.created_at)
       );
$$;

-- ──────────────────────────────────────────────────────────────────────
-- Trigger: AFTER INSERT — append entry to workoutSchedule
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._coach_assignment_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_schedule JSONB;
  new_entry JSONB;
BEGIN
  new_entry := public._coach_assignment_to_schedule_entry(NEW);

  -- Read the client's existing workoutSchedule. Lock the row so a
  -- concurrent write can't clobber our update mid-merge. If the row
  -- doesn't exist, current_schedule stays NULL and we'll INSERT below.
  SELECT data_value INTO current_schedule
    FROM public.user_data
    WHERE user_id = NEW.client_id AND data_key = 'workoutSchedule'
    FOR UPDATE;

  IF current_schedule IS NULL OR jsonb_typeof(current_schedule) <> 'array' THEN
    current_schedule := '[]'::jsonb;
  END IF;

  -- Conflict modes:
  --   replace — strip every existing schedule entry on this date first.
  --   stack   — leave existing entries alone; new entry sits alongside.
  --   freeze  — same as stack, plus mark client_plan_freeze so the AI
  --             generator stops adding workouts to this calendar.
  IF NEW.conflict_mode = 'replace' THEN
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      INTO current_schedule
      FROM jsonb_array_elements(current_schedule) AS elem
      WHERE COALESCE(elem->>'date', '') <> NEW.date::text;
  END IF;

  IF NEW.conflict_mode = 'freeze' THEN
    INSERT INTO public.client_plan_freeze (client_id, frozen_by, frozen_at)
      VALUES (NEW.client_id, NEW.coach_id, NOW())
      ON CONFLICT (client_id) DO UPDATE
        SET frozen_by = EXCLUDED.frozen_by,
            frozen_at = EXCLUDED.frozen_at,
            unfrozen_at = NULL;
  END IF;

  current_schedule := current_schedule || jsonb_build_array(new_entry);

  -- Upsert the schedule. We keep last_edited_by / last_edited_at
  -- populated so the audit-trail (Phase 3E) works for these writes too.
  INSERT INTO public.user_data
    (user_id, data_key, data_value, last_edited_by, last_edited_at, updated_at)
    VALUES (NEW.client_id, 'workoutSchedule', current_schedule,
            NEW.coach_id, NOW(), NOW())
    ON CONFLICT (user_id, data_key)
    DO UPDATE SET
      data_value     = EXCLUDED.data_value,
      last_edited_by = EXCLUDED.last_edited_by,
      last_edited_at = EXCLUDED.last_edited_at,
      updated_at     = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_assignment_mirror_insert ON public.coach_assigned_workouts;
CREATE TRIGGER coach_assignment_mirror_insert
  AFTER INSERT ON public.coach_assigned_workouts
  FOR EACH ROW EXECUTE FUNCTION public._coach_assignment_after_insert();

-- ──────────────────────────────────────────────────────────────────────
-- Trigger: AFTER UPDATE — replace the existing entry in place
-- ──────────────────────────────────────────────────────────────────────
-- The synthetic entry is identifiable by its id ('coach-' || row.id) so
-- we can swap the old version out without touching neighbours. This
-- handles the Phase 3B "edit existing" flow: coach modifies the
-- assignment row → trigger overwrites the mirrored schedule entry.

CREATE OR REPLACE FUNCTION public._coach_assignment_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_schedule JSONB;
  new_entry JSONB;
  old_entry_id TEXT;
BEGIN
  new_entry := public._coach_assignment_to_schedule_entry(NEW);
  old_entry_id := 'coach-' || NEW.id::text;

  -- If the date changed, treat as delete-and-reinsert: strip the old
  -- entry from wherever it was, append the new one. If the date is
  -- the same, swap in place.
  SELECT data_value INTO current_schedule
    FROM public.user_data
    WHERE user_id = NEW.client_id AND data_key = 'workoutSchedule'
    FOR UPDATE;

  IF current_schedule IS NULL OR jsonb_typeof(current_schedule) <> 'array' THEN
    current_schedule := '[]'::jsonb;
  END IF;

  -- Strip the old version of THIS assignment (by synthetic id).
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    INTO current_schedule
    FROM jsonb_array_elements(current_schedule) AS elem
    WHERE COALESCE(elem->>'id', '') <> old_entry_id;

  -- If conflict_mode flipped to 'replace' on the update, strip any
  -- other entries that share the new date too.
  IF NEW.conflict_mode = 'replace' THEN
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      INTO current_schedule
      FROM jsonb_array_elements(current_schedule) AS elem
      WHERE COALESCE(elem->>'date', '') <> NEW.date::text;
  END IF;

  current_schedule := current_schedule || jsonb_build_array(new_entry);

  INSERT INTO public.user_data
    (user_id, data_key, data_value, last_edited_by, last_edited_at, updated_at)
    VALUES (NEW.client_id, 'workoutSchedule', current_schedule,
            NEW.coach_id, NOW(), NOW())
    ON CONFLICT (user_id, data_key)
    DO UPDATE SET
      data_value     = EXCLUDED.data_value,
      last_edited_by = EXCLUDED.last_edited_by,
      last_edited_at = EXCLUDED.last_edited_at,
      updated_at     = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_assignment_mirror_update ON public.coach_assigned_workouts;
CREATE TRIGGER coach_assignment_mirror_update
  AFTER UPDATE ON public.coach_assigned_workouts
  FOR EACH ROW EXECUTE FUNCTION public._coach_assignment_after_update();

-- ──────────────────────────────────────────────────────────────────────
-- Trigger: AFTER DELETE — strip the entry
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._coach_assignment_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_schedule JSONB;
  old_entry_id TEXT;
BEGIN
  old_entry_id := 'coach-' || OLD.id::text;

  SELECT data_value INTO current_schedule
    FROM public.user_data
    WHERE user_id = OLD.client_id AND data_key = 'workoutSchedule'
    FOR UPDATE;

  IF current_schedule IS NULL OR jsonb_typeof(current_schedule) <> 'array' THEN
    RETURN OLD;  -- nothing to strip
  END IF;

  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    INTO current_schedule
    FROM jsonb_array_elements(current_schedule) AS elem
    WHERE COALESCE(elem->>'id', '') <> old_entry_id;

  UPDATE public.user_data
    SET data_value     = current_schedule,
        last_edited_by = OLD.coach_id,
        last_edited_at = NOW(),
        updated_at     = NOW()
    WHERE user_id = OLD.client_id AND data_key = 'workoutSchedule';

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS coach_assignment_mirror_delete ON public.coach_assigned_workouts;
CREATE TRIGGER coach_assignment_mirror_delete
  AFTER DELETE ON public.coach_assigned_workouts
  FOR EACH ROW EXECUTE FUNCTION public._coach_assignment_after_delete();

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- POST-DEPLOY SMOKE TEST
-- ══════════════════════════════════════════════════════════════════════
--
-- Run as service role (SQL editor bypasses RLS — that's correct here;
-- the trigger runs SECURITY DEFINER anyway). Use real test UUIDs:
--   <coach>  = chase.zernich@gmail.com's user id
--   <client> = ironzsupport@gmail.com's user id
--
-- ── Test 1: replace mode, fresh calendar ─────────────────────────────
--
--   -- Make sure the client has SOMETHING on the test date so we can
--   -- prove replace strips it.
--   update public.user_data
--     set data_value = jsonb_build_array(
--       jsonb_build_object('id', 'sw-test-existing', 'date', '2026-05-15',
--                          'sessionName', 'AI Push Day', 'type', 'weightlifting'))
--     where user_id = '<client>' and data_key = 'workoutSchedule';
--
--   insert into public.coach_assigned_workouts
--     (client_id, coach_id, date, conflict_mode, coach_note, workout)
--   values ('<client>', '<coach>', '2026-05-15', 'replace',
--           'Focus on negative split.',
--           '{"sessionName":"Coach Push Day","type":"weightlifting",
--             "exercises":[{"name":"Bench Press","sets":4,"reps":"8","weight":"185 lbs"}],
--             "duration":45}'::jsonb);
--
--   select data_value from public.user_data
--     where user_id = '<client>' and data_key = 'workoutSchedule';
--   -- expect: array with ONE entry (the coach Push Day), the AI one stripped.
--   -- the entry has id='coach-<uuid>', source='coach_assigned',
--   -- coachId, coachNote, plus sessionName/type/exercises/duration.
--
-- ── Test 2: stack mode (existing entries preserved) ──────────────────
--
--   insert into public.coach_assigned_workouts
--     (client_id, coach_id, date, conflict_mode, coach_note, workout)
--   values ('<client>', '<coach>', '2026-05-15', 'stack',
--           'Add this AM to that PM run.',
--           '{"sessionName":"Easy 30","type":"running","duration":30}'::jsonb);
--
--   select jsonb_array_length(data_value) from public.user_data
--     where user_id = '<client>' and data_key = 'workoutSchedule';
--   -- expect: 2 (both coach entries on the same date).
--
-- ── Test 3: freeze mode (also writes client_plan_freeze) ─────────────
--
--   delete from public.client_plan_freeze where client_id = '<client>';
--   insert into public.coach_assigned_workouts
--     (client_id, coach_id, date, conflict_mode, coach_note, workout)
--   values ('<client>', '<coach>', '2026-05-16', 'freeze',
--           'I own the calendar from here.',
--           '{"sessionName":"Threshold Run","type":"running","duration":50}'::jsonb);
--
--   select * from public.client_plan_freeze where client_id = '<client>';
--   -- expect: one row, frozen_by = <coach>, frozen_at recent.
--
-- ── Test 4: UPDATE swaps in place ────────────────────────────────────
--
--   update public.coach_assigned_workouts
--     set workout = '{"sessionName":"Updated Push","type":"weightlifting",
--                     "exercises":[{"name":"Squat","sets":3,"reps":"5","weight":"225 lbs"}],
--                     "duration":50}'::jsonb,
--         coach_note = 'Switched to legs.'
--     where date = '2026-05-15' and coach_id = '<coach>'
--       and (workout->>'sessionName') = 'Coach Push Day';
--
--   select elem
--     from public.user_data,
--          jsonb_array_elements(data_value) as elem
--     where user_id = '<client>' and data_key = 'workoutSchedule'
--       and elem->>'sessionName' = 'Updated Push';
--   -- expect: one entry returned, sessionName='Updated Push', sets=3, weight=225.
--
-- ── Test 5: DELETE strips the mirrored entry ─────────────────────────
--
--   delete from public.coach_assigned_workouts
--     where coach_id = '<coach>' and date = '2026-05-16';
--
--   select count(*) from public.user_data,
--                       jsonb_array_elements(data_value) as elem
--     where user_id = '<client>' and data_key = 'workoutSchedule'
--       and elem->>'date' = '2026-05-16';
--   -- expect: 0.
--
-- ── Test 6: cleanup ──────────────────────────────────────────────────
--
--   delete from public.coach_assigned_workouts
--     where coach_id = '<coach>' and client_id = '<client>'
--       and date in ('2026-05-15', '2026-05-16');
--   delete from public.client_plan_freeze where client_id = '<client>';
--   -- (workoutSchedule should now have no coach-* entries for these dates)
--
-- If every assertion lands as expected, gate is green — proceed to
-- Phase 3A.2 (Assign Workout UI). If any test fails, the trigger logic
-- is wrong; DO NOT build UI on top until it's fixed.
