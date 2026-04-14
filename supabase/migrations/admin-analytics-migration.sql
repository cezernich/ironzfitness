-- ================================================================
-- Admin Analytics Dashboard — SELECT policies
-- ================================================================
-- MANUAL STEPS REQUIRED:
--   1. Open Supabase Dashboard → SQL Editor for project dagdpdcwqdlibxbitdgr
--   2. Paste this entire file into a new query
--   3. Run the query
--   4. Reload the app and open Admin → Analytics to verify data appears
--
-- Why this is needed:
--   analytics_events was created with only a "Users can insert own events"
--   policy. With RLS enabled, that means any SELECT returns zero rows for
--   everyone — including admins — so the dashboard in admin.js
--   (loadAdminEventAnalytics) renders as zeros.
--
-- What this does:
--   1. Adds a SELECT policy that lets users read their own events
--      (useful for per-user analytics if we add them later).
--   2. Adds a second SELECT policy that lets anyone whose profiles.role
--      = 'admin' read every row in analytics_events.
--
-- The existing INSERT policy is left untouched.
-- ================================================================

-- Users can read their own events
DROP POLICY IF EXISTS "Users can read own events" ON analytics_events;
CREATE POLICY "Users can read own events" ON analytics_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all events (join on profiles.role)
DROP POLICY IF EXISTS "Admins can read all events" ON analytics_events;
CREATE POLICY "Admins can read all events" ON analytics_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ================================================================
-- Optional hardening: the admin email self-heal in auth.js flips
-- profiles.role from 'user' to 'admin' on sign-in for the hardcoded
-- admin emails. If you want to lock that down further, revoke the
-- self-heal UPDATE privilege and manage role promotions manually:
--
--   UPDATE profiles SET role = 'admin'
--   WHERE email IN ('chase.zernich@gmail.com', 'chase.zernich@kellogg.northwestern.edu');
--
-- and then drop or restrict the profiles UPDATE policy so users can't
-- escalate themselves. For now the client-side check in auth.js is
-- sufficient because the admin email list is hardcoded.
-- ================================================================
