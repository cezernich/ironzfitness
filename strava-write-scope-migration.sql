-- ================================================================
-- Strava Push-to-Strava — add scope column to strava_tokens
-- ================================================================
-- MANUAL STEPS REQUIRED:
--   1. Open Supabase Dashboard → SQL Editor for project dagdpdcwqdlibxbitdgr
--   2. Paste this entire file into a new query
--   3. Run the query
--   4. Redeploy the affected functions:
--        supabase functions deploy strava-auth     --no-verify-jwt
--        supabase functions deploy strava-callback --no-verify-jwt
--        supabase functions deploy strava-upload   --no-verify-jwt
--   5. Existing connected users will need to disconnect + reconnect to
--      grant the new activity:write scope. The client shows a
--      "Reconnect to enable uploads" prompt on the Strava settings card
--      when their token row has scope without "activity:write".
-- ================================================================

-- Add scope column. Existing rows get NULL — the client treats NULL as
-- "read-only legacy connection" and surfaces the reconnect prompt.
ALTER TABLE strava_tokens
  ADD COLUMN IF NOT EXISTS scope text;
