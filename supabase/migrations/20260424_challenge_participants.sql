-- 2026-04-24 — Bug 21: real challenge leaderboards.
--
-- The previous client-side leaderboard padded results with 10 fake
-- names (FAKE_PARTICIPANTS in challenges.js, removed in the same
-- commit that adds this migration). This table replaces that with a
-- real participant list.
--
-- One row per (user, challenge). pct is the user's last-reported
-- progress; updated by the client whenever it recomputes
-- getChallengeProgress(). joined_at is informational.
--
-- display_name is denormalised onto the row so the leaderboard query
-- doesn't need to join profiles for every render. The client populates
-- it on join from profile.full_name, falling back to "Athlete" for
-- users who haven't set a name.

BEGIN;

CREATE TABLE IF NOT EXISTS public.challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS challenge_participants_challenge_pct_idx
  ON public.challenge_participants (challenge_id, pct DESC);

ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user can read participant rows for any
-- challenge they themselves are participating in. (Tighten later if
-- this proves too permissive — for now we want low friction so the
-- leaderboard works the moment the app boots.)
DROP POLICY IF EXISTS "challenge_participants_select" ON public.challenge_participants;
CREATE POLICY "challenge_participants_select"
  ON public.challenge_participants
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Write: a user can only insert/update/delete their own row.
DROP POLICY IF EXISTS "challenge_participants_insert_own" ON public.challenge_participants;
CREATE POLICY "challenge_participants_insert_own"
  ON public.challenge_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "challenge_participants_update_own" ON public.challenge_participants;
CREATE POLICY "challenge_participants_update_own"
  ON public.challenge_participants
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "challenge_participants_delete_own" ON public.challenge_participants;
CREATE POLICY "challenge_participants_delete_own"
  ON public.challenge_participants
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Auto-bump updated_at on UPDATE.
CREATE OR REPLACE FUNCTION public._touch_challenge_participants_updated_at()
  RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_challenge_participants ON public.challenge_participants;
CREATE TRIGGER trg_touch_challenge_participants
  BEFORE UPDATE ON public.challenge_participants
  FOR EACH ROW EXECUTE FUNCTION public._touch_challenge_participants_updated_at();

COMMIT;
