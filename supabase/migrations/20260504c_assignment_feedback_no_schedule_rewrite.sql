-- 2026-05-04 — Skip schedule mirror rewrite on feedback-only updates
--
-- The AFTER UPDATE trigger on coach_assigned_workouts rebuilds the
-- client's user_data.workoutSchedule on every row update, stamping
-- the entry's date to NEW.date. This is correct when the coach edits
-- the assignment (date / workout / note), but incorrect when the
-- client submits their post-workout feedback via the
-- submit_assignment_feedback RPC: that RPC only writes client_note /
-- client_rating / client_responded_at, yet the trigger still rewrote
-- the schedule and reverted any local drag-move the client had made
-- but not yet pushed back via the date update path. Symptom: client
-- moves a coach-assigned workout to today, marks complete, the
-- rating-modal RPC fires, and the workout silently jumps back to its
-- original coach-assigned date.
--
-- Fix: short-circuit the trigger body when none of the schedule-
-- relevant columns changed. The client-feedback columns are read-only
-- from the schedule mirror's perspective, so there's nothing to
-- update in user_data.workoutSchedule for those.

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
  -- Skip the schedule rewrite when only client-feedback columns changed.
  -- client_note / client_rating / client_responded_at don't surface in
  -- the schedule mirror, so feedback updates have nothing to mirror.
  IF OLD.date          IS NOT DISTINCT FROM NEW.date
     AND OLD.workout       IS NOT DISTINCT FROM NEW.workout
     AND OLD.coach_note    IS NOT DISTINCT FROM NEW.coach_note
     AND OLD.conflict_mode IS NOT DISTINCT FROM NEW.conflict_mode
     AND OLD.client_id     IS NOT DISTINCT FROM NEW.client_id
     AND OLD.coach_id      IS NOT DISTINCT FROM NEW.coach_id
  THEN
    RETURN NEW;
  END IF;

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
