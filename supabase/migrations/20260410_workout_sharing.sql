-- Workout Sharing Migration
-- Implements FEATURE_SPEC_2026-04-09_workout_sharing.md
--
-- Creates four tables: shared_workouts, workout_share_imports, saved_workouts,
-- pending_shares. Each has RLS so anonymous clients can SELECT a share by token
-- but cannot UPDATE / DELETE it.

-- ─── shared_workouts ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text UNIQUE NOT NULL,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Library references only — NO actual paces, NO sender VDOT/FTP/CSS.
  variant_id text NOT NULL,
  sport_id text NOT NULL CHECK (sport_id IN ('run', 'bike', 'swim', 'strength', 'hybrid')),
  session_type_id text NOT NULL,

  -- Optional sender note: 280 chars max, URLs/mentions stripped client-side.
  share_note text CHECK (share_note IS NULL OR length(share_note) <= 280),

  -- Lifecycle
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at timestamptz,

  -- Counters maintained server-side via triggers, never client writes.
  view_count int NOT NULL DEFAULT 0,
  import_count int NOT NULL DEFAULT 0,
  completion_count int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_shared_workouts_token  ON shared_workouts(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_workouts_sender ON shared_workouts(sender_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_workouts_expiry ON shared_workouts(expires_at) WHERE revoked_at IS NULL;

ALTER TABLE shared_workouts ENABLE ROW LEVEL SECURITY;

-- Anyone can read a share by token if it's still alive.
CREATE POLICY "Anyone can read live shares by token"
  ON shared_workouts FOR SELECT
  USING (expires_at > now() AND revoked_at IS NULL);

-- Only the sender can insert their own share.
CREATE POLICY "Senders insert their own shares"
  ON shared_workouts FOR INSERT
  WITH CHECK (auth.uid() = sender_user_id);

-- Only the sender can update (used exclusively to set revoked_at).
CREATE POLICY "Senders update their own shares"
  ON shared_workouts FOR UPDATE
  USING (auth.uid() = sender_user_id);

-- No DELETE from clients. Cleanup is server-side via cron.

-- ─── workout_share_imports ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workout_share_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text NOT NULL REFERENCES shared_workouts(share_token),
  receiver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  action text NOT NULL CHECK (action IN ('saved_to_library', 'scheduled', 'dismissed')),
  scheduled_for_date date,
  saved_workout_id uuid,  -- FK added after saved_workouts table is created

  imported_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completion_delta_percent numeric
);

CREATE INDEX IF NOT EXISTS idx_share_imports_receiver ON workout_share_imports(receiver_user_id, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_imports_token    ON workout_share_imports(share_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_share_imports_unique
  ON workout_share_imports(share_token, receiver_user_id)
  WHERE action != 'dismissed';

ALTER TABLE workout_share_imports ENABLE ROW LEVEL SECURITY;

-- Receiver can read their own imports.
CREATE POLICY "Receivers read their own imports"
  ON workout_share_imports FOR SELECT
  USING (auth.uid() = receiver_user_id);

-- Receiver can insert their own imports.
CREATE POLICY "Receivers insert their own imports"
  ON workout_share_imports FOR INSERT
  WITH CHECK (auth.uid() = receiver_user_id);

-- Receiver can update their own imports (e.g. to flip action or completion timestamp).
CREATE POLICY "Receivers update their own imports"
  ON workout_share_imports FOR UPDATE
  USING (auth.uid() = receiver_user_id);

-- ─── saved_workouts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  variant_id text NOT NULL,
  sport_id text NOT NULL,
  session_type_id text NOT NULL,

  source text NOT NULL CHECK (source IN ('library', 'shared')),
  shared_from_user_id uuid REFERENCES auth.users(id),
  share_token text,

  custom_name text CHECK (custom_name IS NULL OR length(custom_name) <= 80),
  saved_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_saved_workouts_user ON saved_workouts(user_id, saved_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_workouts_unique ON saved_workouts(user_id, variant_id, source);

-- Add the deferred FK from workout_share_imports.saved_workout_id.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'workout_share_imports_saved_workout_id_fkey') THEN
    ALTER TABLE workout_share_imports
      ADD CONSTRAINT workout_share_imports_saved_workout_id_fkey
      FOREIGN KEY (saved_workout_id) REFERENCES saved_workouts(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE saved_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own saved workouts"
  ON saved_workouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own saved workouts"
  ON saved_workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own saved workouts"
  ON saved_workouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own saved workouts"
  ON saved_workouts FOR DELETE
  USING (auth.uid() = user_id);

-- ─── pending_shares ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint text NOT NULL,
  share_token text NOT NULL REFERENCES shared_workouts(share_token),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by_user_id uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_pending_shares_fingerprint
  ON pending_shares(device_fingerprint) WHERE claimed_at IS NULL;

ALTER TABLE pending_shares ENABLE ROW LEVEL SECURITY;

-- Inserts come from anonymous clients (the deep link handler before auth).
CREATE POLICY "Anyone can stash a pending share"
  ON pending_shares FOR INSERT
  WITH CHECK (true);

-- A logged-in user can read pending shares for their device fingerprint.
-- Fingerprint matching happens client-side after auth.
CREATE POLICY "Authenticated users read pending shares"
  ON pending_shares FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Authenticated users can claim a pending share (set claimed_at + claimed_by_user_id).
CREATE POLICY "Authenticated users claim pending shares"
  ON pending_shares FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- ─── Cleanup function (run via cron weekly) ─────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_workout_sharing()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Drop expired/revoked shares older than 90 days (post-audit window)
  DELETE FROM shared_workouts
  WHERE (expires_at < now() - interval '60 days')
     OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '60 days');

  -- Drop unclaimed pending shares older than 7 days
  DELETE FROM pending_shares
  WHERE claimed_at IS NULL AND created_at < now() - interval '7 days';
END $$;
