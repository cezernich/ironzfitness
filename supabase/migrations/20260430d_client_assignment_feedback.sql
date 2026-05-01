-- 2026-04-30 — Client → coach feedback channel on assigned workouts
--
-- The post-completion rating modal already collects a client-private
-- note ("Quick note — e.g. 'Shoulders felt tight'"). Coaches asked
-- for a second box on coach-assigned workouts whose value flows back
-- to them. Two separate fields keeps client-private journaling
-- separate from the deliberate "talk to my coach" channel.
--
-- Storage: two new columns on coach_assigned_workouts —
--   client_note         TEXT       — free-text reply directed at coach
--   client_rating       INT        — 1-5 RPE rating (mirrors private)
--   client_responded_at TIMESTAMPTZ — when the client submitted feedback
--
-- Write path: clients can't UPDATE coach_assigned_workouts directly
-- (the existing "Coaches manage their own assignments" policy is FOR
-- ALL with USING coach_id = auth.uid()), and column-level RLS isn't
-- something Postgres supports natively. So feedback writes go through
-- the SECURITY DEFINER RPC submit_assignment_feedback, which verifies
-- client_id = auth.uid() before writing — keeps coach_note and the
-- assignment payload off-limits.

ALTER TABLE public.coach_assigned_workouts
  ADD COLUMN IF NOT EXISTS client_note         TEXT,
  ADD COLUMN IF NOT EXISTS client_rating       INT  CHECK (client_rating IS NULL OR client_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS client_responded_at TIMESTAMPTZ;

-- ──────────────────────────────────────────────────────────────────────
-- RPC: client submits feedback on one of their own assignments
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_assignment_feedback(
  _assignment_id UUID,
  _note          TEXT,
  _rating        INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF _rating IS NOT NULL AND (_rating < 1 OR _rating > 5) THEN
    RAISE EXCEPTION 'rating must be 1..5 or NULL';
  END IF;

  UPDATE public.coach_assigned_workouts
     SET client_note         = NULLIF(_note, ''),
         client_rating       = _rating,
         client_responded_at = NOW()
   WHERE id        = _assignment_id
     AND client_id = _uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found or not yours';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_assignment_feedback(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_assignment_feedback(UUID, TEXT, INT) TO authenticated;
