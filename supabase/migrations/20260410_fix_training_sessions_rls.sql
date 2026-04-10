-- Fix training_sessions RLS for share preview.
-- Run this ENTIRE block in the Supabase SQL Editor.

-- Step 1: Drop ALL existing SELECT policies on training_sessions so we
-- start clean. This is a DO block because we don't know the exact names.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'training_sessions'
      AND schemaname = 'public'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON training_sessions', pol.policyname);
    RAISE NOTICE 'Dropped policy: %', pol.policyname;
  END LOOP;
END $$;

-- Step 2: Ensure RLS is enabled
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

-- Step 3: Create TWO policies:

-- 3a. Authenticated users can read their OWN training sessions
CREATE POLICY "Users can read own training sessions"
  ON training_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3b. Anyone (anon or authenticated) can read training sessions that are
-- referenced by an active shared_workouts row. This is what the share
-- preview page needs.
CREATE POLICY "Anyone can read shared training sessions"
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

-- Step 4: Verify (run this after the above, should return 1 row):
-- SELECT id, session_name FROM training_sessions
-- WHERE id = 'e9771aa3-fbcf-4c38-891d-191f11ff9eb1';
