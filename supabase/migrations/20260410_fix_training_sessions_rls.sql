-- Fix training_sessions RLS for share preview.
--
-- The existing policy "Anyone can read shared training sessions" uses a
-- subquery that compares variant_id to training_sessions.id but the type
-- cast or subquery structure is preventing anon reads. This replaces it
-- with a simpler policy that lets anon read any training_session whose id
-- appears in an active (non-revoked, non-expired) shared_workouts row.
--
-- Run this in the Supabase SQL Editor.

-- Drop the broken policy if it exists (name may vary)
DROP POLICY IF EXISTS "Anyone can read shared training sessions" ON training_sessions;

-- Create a clean policy: anon can SELECT training_sessions rows that are
-- referenced by a live shared_workouts entry.
-- Cast both sides to text to avoid uuid/text mismatch.
CREATE POLICY "Anon can read training sessions referenced by active shares"
  ON training_sessions
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM shared_workouts sw
      WHERE sw.variant_id = training_sessions.id::text
        AND sw.revoked_at IS NULL
        AND sw.expires_at > now()
    )
  );

-- Also ensure RLS is enabled on training_sessions
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

-- Verify: this should return the test row
-- SELECT id, session_name FROM training_sessions
-- WHERE id = 'e9771aa3-fbcf-4c38-891d-191f11ff9eb1';
