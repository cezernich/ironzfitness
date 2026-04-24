-- 2026-04-24 — Bug 20: only IronZ-authored workouts surface in Community.
--
-- Adds an `is_official` flag to community_workouts so the app filters
-- on a stable column instead of a string match against author. Also
-- backfills the flag for existing rows where author = "IronZ Team",
-- so the migration is safe to run before the app code rolls out.
--
-- After this migration runs, the client filter (workouts.js
-- _commFetchFromDb) will hide any row where is_official IS NOT TRUE
-- AND author <> 'IronZ Team'. The author fallback covers the brief
-- window between this migration landing and a future write that
-- always sets is_official explicitly.

BEGIN;

ALTER TABLE public.community_workouts
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: any row authored by the IronZ Team flips to official.
UPDATE public.community_workouts
SET is_official = TRUE
WHERE author = 'IronZ Team' AND is_official IS NOT TRUE;

-- Index for the filter the client uses on every Community tab open.
CREATE INDEX IF NOT EXISTS community_workouts_is_official_idx
  ON public.community_workouts (is_official)
  WHERE is_official = TRUE;

COMMIT;
