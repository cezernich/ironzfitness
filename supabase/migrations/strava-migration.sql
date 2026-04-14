-- ================================================================
-- Strava Integration — tables + RLS
-- ================================================================
-- MANUAL STEPS REQUIRED:
--   1. Open Supabase Dashboard → SQL Editor for project dagdpdcwqdlibxbitdgr
--   2. Paste this entire file into a new query
--   3. Run the query
--   4. Set the Strava client secret as a Supabase secret:
--        supabase secrets set STRAVA_CLIENT_ID=224501
--        supabase secrets set STRAVA_CLIENT_SECRET=badd334cf44f359762e66d61cec66f6f3dd05959
--        supabase secrets set STRAVA_REDIRECT_URI=https://dagdpdcwqdlibxbitdgr.supabase.co/functions/v1/strava-callback
--        supabase secrets set STRAVA_RETURN_URL=https://ironz.fit/?strava=connected
--   5. Deploy all three edge functions WITH --no-verify-jwt:
--        supabase functions deploy strava-auth     --no-verify-jwt
--        supabase functions deploy strava-callback --no-verify-jwt
--        supabase functions deploy strava-sync     --no-verify-jwt
--      All three functions do manual JWT verification in their own code
--      (or verify the OAuth state nonce, in the callback's case). The
--      platform-level JWT pre-check is either unnecessary (callback) or
--      rejects valid session tokens before our code can run (auth, sync).
--      Manual verification is already wired up inside each function.
--   6. In the Strava API settings at https://www.strava.com/settings/api
--      set the Authorization Callback Domain to:
--        dagdpdcwqdlibxbitdgr.supabase.co
-- ================================================================

-- Strava OAuth tokens — one row per user
CREATE TABLE IF NOT EXISTS strava_tokens (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token      text NOT NULL,
  refresh_token     text NOT NULL,
  expires_at        timestamptz NOT NULL,
  athlete_id        bigint,
  athlete_firstname text,
  athlete_lastname  text,
  athlete_avatar    text,
  connected_at      timestamptz DEFAULT now(),
  last_sync_at      timestamptz
);

ALTER TABLE strava_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own strava tokens" ON strava_tokens;
CREATE POLICY "Users can read own strava tokens" ON strava_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own strava tokens" ON strava_tokens;
CREATE POLICY "Users can delete own strava tokens" ON strava_tokens
  FOR DELETE USING (auth.uid() = user_id);
-- INSERT and UPDATE are service-role only. Edge functions use the service
-- role key so RLS doesn't apply on the write path.

-- Synced Strava activities — id is the Strava activity id, not a uuid
CREATE TABLE IF NOT EXISTS strava_activities (
  id                     bigint PRIMARY KEY,
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                   text,
  type                   text,
  distance               numeric,
  moving_time            integer,
  elapsed_time           integer,
  start_date             timestamptz,
  start_date_local       timestamptz,
  average_heartrate      numeric,
  max_heartrate          numeric,
  suffer_score           numeric,
  total_elevation_gain   numeric,
  map_summary_polyline   text,
  raw                    jsonb,
  synced_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strava_activities_user_date
  ON strava_activities(user_id, start_date DESC);

ALTER TABLE strava_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own strava activities" ON strava_activities;
CREATE POLICY "Users can read own strava activities" ON strava_activities
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own strava activities" ON strava_activities;
CREATE POLICY "Users can delete own strava activities" ON strava_activities
  FOR DELETE USING (auth.uid() = user_id);

-- OAuth state nonces — written by strava-auth, consumed by strava-callback.
-- Service role only; clients never touch this.
CREATE TABLE IF NOT EXISTS strava_oauth_state (
  nonce      text PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE strava_oauth_state ENABLE ROW LEVEL SECURITY;
-- No client-facing policies — service role only. Leaving RLS on with no
-- policies means authenticated clients get zero rows on any query, which
-- is correct.
