-- Add workout_reminder_time to notification_preferences.
--
-- The previous design ("send a push N minutes before scheduled_time on
-- the training session") never fired in practice because nothing in
-- this app sets a clock-time on a workout — only a date. Every session
-- got skipped at check-workout-reminders/index.ts:80 with an
-- `if (!session.scheduled_time) continue;` guard. Result: zero
-- notifications, ever.
--
-- New model: each user picks a single daily reminder time. The cron
-- function fires one push per user per day if NOW is within the cron
-- window of workout_reminder_time AND the user has any incomplete
-- training session today.
--
-- reminder_minutes_before is left in place (no DROP) so older clients
-- that still read the column don't error — the new edge function and
-- UI ignore it. A follow-up migration can drop it once we're confident
-- no installs reference it.

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS workout_reminder_time TIME DEFAULT '07:00';

COMMENT ON COLUMN public.notification_preferences.workout_reminder_time IS
  'Local time-of-day at which the user wants their daily workout reminder. Replaces the (broken) reminder_minutes_before design.';
