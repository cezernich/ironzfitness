-- Migration: Allow anonymous reads for training_sessions and profiles
-- that are referenced by active (non-expired, non-revoked) shared_workouts.
--
-- Problem: share.html fetches training_sessions by variant_id and profiles
-- by sender_user_id using the anon key. Both tables have user-scoped RLS
-- that blocks anonymous reads, so the share preview falls back to generic
-- "Workout" / "Warm-up / Main Set / Cool-down" placeholders.

-- 1. Allow anon to read training_sessions that are linked to a live share.
CREATE POLICY "Anyone can read shared training sessions"
  ON training_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shared_workouts sw
      WHERE sw.variant_id::text = training_sessions.id::text
        AND sw.expires_at > now()
        AND sw.revoked_at IS NULL
    )
  );

-- 2. Allow anon to read the sender's profile name for live shares.
CREATE POLICY "Anyone can read shared workout sender profiles"
  ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shared_workouts sw
      WHERE sw.sender_user_id = profiles.id
        AND sw.expires_at > now()
        AND sw.revoked_at IS NULL
    )
  );
