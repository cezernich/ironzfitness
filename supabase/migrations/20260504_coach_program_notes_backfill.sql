-- 2026-05-04 — Backfill coach_note on program-applied assignments
--
-- Bug: when a coach applied a multi-week program to a client, the
-- apply flow at coach-programs.js spread `library.workout` into the
-- assignment row but ignored `library.notes` (the "LIBRARY NOTES —
-- shown to client on the workout card" field on each Save-to-Library
-- workout). Result: coach-typed comments never reached the athlete's
-- calendar — coach_assigned_workouts.coach_note was null, the mirror
-- trigger had nothing to mirror, and the renderer had nothing to show.
--
-- The forward fix is in JS (coach-programs.js apply + propagate-edits
-- now copy lib.notes → coach_note). This migration retroactively
-- updates every existing program-applied assignment with a null
-- coach_note by looking up the library item the program template
-- pointed at, pulling its notes column, and writing it through.
-- The AFTER UPDATE trigger on coach_assigned_workouts auto-mirrors
-- the change into user_data.workoutSchedule, so the athlete's
-- calendar picks it up on next refresh.
--
-- Idempotent: re-running the function only touches rows where
-- coach_note IS NULL, so subsequent calls are no-ops once everything
-- is filled. The function stays in place so it can be invoked again
-- if a future apply-flow regression silently drops notes.

BEGIN;

CREATE OR REPLACE FUNCTION public.backfill_coach_assignment_notes()
RETURNS TABLE(updated INTEGER, scanned INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  -- program_day is 1-based (mon=1 .. sun=7) per the JS apply flow
  -- (d.offset + 1). PostgreSQL arrays are 1-indexed so day_keys[1]
  -- correctly resolves to 'mon' without an off-by-one.
  day_keys TEXT[] := ARRAY['mon','tue','wed','thu','fri','sat','sun'];
  slots JSONB;
  slot JSONB;
  slot_index INTEGER;
  lib_id UUID;
  lib_notes TEXT;
  cnt INTEGER := 0;
  total INTEGER := 0;
BEGIN
  FOR rec IN
    -- Multi-slot pairing: when a program day has more than one slot
    -- (rare, but the data model supports it), each slot becomes its
    -- own assignment row at apply time. Pair existing rows back to
    -- slots by created_at order so slot[0] aligns with the first row
    -- inserted, slot[1] with the second, etc. Mirrors the JS
    -- propagate-edits zip at coach-programs.js:494.
    SELECT
      caw.id,
      caw.program_id,
      caw.program_week,
      caw.program_day,
      caw.client_id,
      ROW_NUMBER() OVER (
        PARTITION BY caw.program_id, caw.program_week, caw.program_day, caw.client_id
        ORDER BY caw.created_at, caw.id
      )::INTEGER - 1 AS slot_idx
    FROM public.coach_assigned_workouts caw
    WHERE caw.coach_note IS NULL
      AND caw.program_id IS NOT NULL
      AND caw.program_day IS NOT NULL
      AND caw.program_day BETWEEN 1 AND 7
  LOOP
    total := total + 1;

    -- Pull the day's slot list off the program template.
    SELECT cp.weekly_template -> day_keys[rec.program_day]
      INTO slots
      FROM public.coach_programs cp
      WHERE cp.id = rec.program_id;

    IF slots IS NULL THEN CONTINUE; END IF;

    -- Backward-compat: legacy programs stored a single slot object
    -- per day instead of an array. Normalize to array so the index
    -- access below works either way (mirrors _slotsForDay in JS).
    IF jsonb_typeof(slots) <> 'array' THEN
      slots := jsonb_build_array(slots);
    END IF;

    IF jsonb_array_length(slots) = 0 THEN CONTINUE; END IF;

    -- Clamp slot index to array bounds — if more rows exist than
    -- slots (shouldn't happen but defensively), reuse the last slot.
    slot_index := LEAST(rec.slot_idx, jsonb_array_length(slots) - 1);
    slot := slots -> slot_index;

    IF slot IS NULL THEN CONTINUE; END IF;

    lib_id := NULLIF(slot ->> 'library_id', '')::UUID;
    IF lib_id IS NULL THEN CONTINUE; END IF;

    SELECT cwl.notes INTO lib_notes
      FROM public.coach_workout_library cwl
      WHERE cwl.id = lib_id;

    IF lib_notes IS NULL OR lib_notes = '' THEN CONTINUE; END IF;

    -- The AFTER UPDATE trigger on coach_assigned_workouts handles the
    -- user_data.workoutSchedule mirror automatically.
    UPDATE public.coach_assigned_workouts
      SET coach_note = lib_notes
      WHERE id = rec.id;

    cnt := cnt + 1;
  END LOOP;

  RETURN QUERY SELECT cnt, total;
END;
$$;

-- Run the backfill once as part of this migration. The RETURN value
-- shows up in the migration log so we can confirm the count without
-- a separate query.
SELECT * FROM public.backfill_coach_assignment_notes();

COMMIT;
