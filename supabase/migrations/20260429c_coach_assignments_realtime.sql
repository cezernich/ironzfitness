-- 2026-04-29 — enable realtime on coach_assigned_workouts
--
-- Without this, the client app only sees newly-assigned coach workouts
-- on a hard refresh: the trigger writes to user_data.workoutSchedule,
-- but the client has no signal to re-pull. Adding the table to the
-- supabase_realtime publication lets the client subscribe to INSERT/
-- UPDATE/DELETE events filtered by client_id = auth.uid() and refresh
-- the calendar live (see js/client-coaching.js).
--
-- RLS on this table already restricts SELECT to client_id = auth.uid()
-- (see 20260428_coaching_schema.sql), so realtime will only emit events
-- the client is allowed to see.

BEGIN;

ALTER PUBLICATION supabase_realtime
  ADD TABLE public.coach_assigned_workouts;

COMMIT;
