-- 2026-04-24 — Bug 20: only IronZ-authored workouts surface in Community.
--
-- Adds an `is_official` flag to community_workouts so the app filters
-- on a stable column instead of a string match against author. Also
-- backfills the flag for existing rows where author = "IronZ Team",
-- so the migration is safe to run before the app code rolls out.
--
-- 2026-04-27 update: the table itself didn't exist in Supabase (the
-- client was reading via .from("community_workouts") and silently
-- swallowing the relation-not-found error, which is why only the
-- hardcoded JS defaults ever rendered). This migration now creates
-- the table if missing, with the columns the client actually
-- reads/writes (workouts.js _commFetchFromDb, _commAdminAddWorkout,
-- shareWorkoutToCommunity).
--
-- After this migration runs, the client filter (workouts.js
-- _commFetchFromDb) will hide any row where is_official IS NOT TRUE
-- AND author <> 'IronZ Team'. The author fallback covers the brief
-- window between this migration landing and a future write that
-- always sets is_official explicitly.

BEGIN;

-- Create the table if missing. Columns mirror the client-side `record`
-- shape in workouts.js _commAdminAddWorkout + the fields read by
-- _commFetchFromDb. id is TEXT (client mints "user-<timestamp>" /
-- "admin-<timestamp>" ids) so we don't fight the existing JS shape.
CREATE TABLE IF NOT EXISTS public.community_workouts (
  id          TEXT PRIMARY KEY,
  category    TEXT,
  name        TEXT NOT NULL,
  author      TEXT,
  difficulty  TEXT,
  type        TEXT,
  exercises   JSONB,
  segments    JSONB,
  hiit_meta   JSONB,
  hidden      BOOLEAN NOT NULL DEFAULT FALSE,
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Defensive ALTER for environments where the table existed under an
-- older schema without is_official / hidden / created_at.
ALTER TABLE public.community_workouts
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.community_workouts
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.community_workouts
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill: any row authored by the IronZ Team flips to official.
UPDATE public.community_workouts
SET is_official = TRUE
WHERE author = 'IronZ Team' AND is_official IS NOT TRUE;

-- Index for the filter the client uses on every Community tab open.
CREATE INDEX IF NOT EXISTS community_workouts_is_official_idx
  ON public.community_workouts (is_official)
  WHERE is_official = TRUE;

-- RLS: any authenticated user can read official workouts and their own
-- contributions. Only admins (profile.role = 'admin') can insert /
-- update / delete arbitrary rows. User-shared workouts are stored
-- locally (userSharedWorkouts in localStorage) — they don't write to
-- this table directly.
ALTER TABLE public.community_workouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_workouts_select" ON public.community_workouts;
CREATE POLICY "community_workouts_select"
  ON public.community_workouts
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "community_workouts_admin_write" ON public.community_workouts;
CREATE POLICY "community_workouts_admin_write"
  ON public.community_workouts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

COMMIT;
