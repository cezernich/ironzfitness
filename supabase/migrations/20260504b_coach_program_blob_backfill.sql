-- 2026-05-04 — Backfill workout.coachProgram on program-applied
-- assignments.
--
-- planner.js _getCoachProgramInputs reads e.coachProgram from each
-- workoutSchedule entry to render the "COACH PLAN" tile in Active
-- Training Inputs. The apply flow at coach-programs.js stamps this
-- blob onto every workout it inserts, but assignments created before
-- that stamp landed don't carry it, so the athlete's tile renders
-- empty even when a program is fully applied.
--
-- Athletes can't read coach_programs.name directly (RLS keeps the
-- coach's library private), so we can't backfill from JS. Server-side
-- fixup walks every assignment with program_id set but no
-- workout.coachProgram, joins the program by id, and merges the blob
-- into the workout JSONB.
--
-- The AFTER UPDATE mirror trigger on coach_assigned_workouts will
-- propagate the modified workout JSONB into user_data.workoutSchedule
-- automatically; the athlete's next refresh + self-heal pass picks it
-- up and the COACH PLAN tile starts rendering.
--
-- Idempotent: only updates rows where workout->'coachProgram' IS NULL.

BEGIN;

CREATE OR REPLACE FUNCTION public.backfill_coach_program_blob()
RETURNS TABLE(updated INTEGER, scanned INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  blob JSONB;
  cnt INTEGER := 0;
  total INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT caw.id, caw.workout, cp.id AS program_id, cp.name AS program_name, cp.duration_weeks
    FROM public.coach_assigned_workouts caw
    JOIN public.coach_programs cp ON cp.id = caw.program_id
    WHERE caw.program_id IS NOT NULL
      AND (caw.workout -> 'coachProgram') IS NULL
  LOOP
    total := total + 1;
    blob := jsonb_build_object(
      'id',    rec.program_id::text,
      'name',  rec.program_name,
      'weeks', rec.duration_weeks
    );
    UPDATE public.coach_assigned_workouts
      SET workout = COALESCE(rec.workout, '{}'::jsonb) || jsonb_build_object('coachProgram', blob)
      WHERE id = rec.id;
    cnt := cnt + 1;
  END LOOP;
  RETURN QUERY SELECT cnt, total;
END;
$$;

SELECT * FROM public.backfill_coach_program_blob();

COMMIT;
