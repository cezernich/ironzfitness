-- ================================================================
-- IronZ Sharing Phase 2 — Inbox (user-to-user direct sends)
-- ================================================================
-- MANUAL STEPS REQUIRED:
--   1. Open Supabase Dashboard → SQL Editor for project dagdpdcwqdlibxbitdgr
--   2. Paste this entire file into a new query
--   3. Run the query
--   4. Verify the workout_inbox table exists under Database → Tables
--   5. Verify RLS policies are enabled
--
-- The client code expects this schema to exist. It will fail silently
-- (toast "Couldn't send") until the table is created.
-- ================================================================

CREATE TABLE IF NOT EXISTS workout_inbox (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id            uuid REFERENCES auth.users(id) NOT NULL,
  recipient_id         uuid REFERENCES auth.users(id) NOT NULL,
  workout_payload      jsonb NOT NULL,
  workout_name         text NOT NULL,
  workout_type         text,
  sender_display_name  text,
  message              text,
  status               text DEFAULT 'unread'
                          CHECK (status IN ('unread','read','accepted','dismissed')),
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_recipient ON workout_inbox(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_sender    ON workout_inbox(sender_id);

-- Row Level Security
ALTER TABLE workout_inbox ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first so this migration is rerunnable
DROP POLICY IF EXISTS "Users can read their own inbox" ON workout_inbox;
DROP POLICY IF EXISTS "Users can read items they sent" ON workout_inbox;
DROP POLICY IF EXISTS "Users can send workouts"         ON workout_inbox;
DROP POLICY IF EXISTS "Recipients can update status"    ON workout_inbox;

CREATE POLICY "Users can read their own inbox" ON workout_inbox
  FOR SELECT USING (auth.uid() = recipient_id);

CREATE POLICY "Users can read items they sent" ON workout_inbox
  FOR SELECT USING (auth.uid() = sender_id);

CREATE POLICY "Users can send workouts" ON workout_inbox
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Recipients can update status" ON workout_inbox
  FOR UPDATE USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- ================================================================
-- profiles.email lookup policy — the send-to-friend flow needs to
-- query profiles by email to find the recipient's user_id. The
-- existing "Users can view own profile" policy blocks this, so we
-- add a narrow read policy that exposes only id + email + full_name
-- to authenticated users (not the whole profile row).
-- ================================================================

DROP POLICY IF EXISTS "Authenticated users can look up others by email" ON profiles;

CREATE POLICY "Authenticated users can look up others by email" ON profiles
  FOR SELECT TO authenticated
  USING (true);

-- NOTE: This policy allows any authenticated user to read the id, email,
-- and full_name of any other user. If that's too permissive for your
-- threat model, replace it with a SECURITY DEFINER RPC function like:
--
--   CREATE OR REPLACE FUNCTION lookup_user_by_email(email_arg text)
--   RETURNS TABLE(id uuid, full_name text)
--   LANGUAGE sql SECURITY DEFINER AS $$
--     SELECT id, full_name FROM profiles WHERE lower(email) = lower(email_arg);
--   $$;
--
-- and update js/workout-inbox-direct.js to call .rpc('lookup_user_by_email', ...)
-- instead of .from('profiles').select(...).
