-- Migration: extend saved_workouts to support custom (user-created) workouts
-- Previously the table only held library/shared references. Now it also stores
-- full workout payloads for custom workouts that were created in the old
-- "Saved Workouts" UI.

-- 1. Add new columns
ALTER TABLE saved_workouts
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS workout_kind text;

-- 2. Make library-reference columns nullable (custom workouts don't have them)
ALTER TABLE saved_workouts
  ALTER COLUMN variant_id DROP NOT NULL,
  ALTER COLUMN sport_id DROP NOT NULL,
  ALTER COLUMN session_type_id DROP NOT NULL;

-- 3. Widen the source CHECK to include 'custom'
ALTER TABLE saved_workouts DROP CONSTRAINT IF EXISTS saved_workouts_source_check;
ALTER TABLE saved_workouts
  ADD CONSTRAINT saved_workouts_source_check
  CHECK (source IN ('library', 'shared', 'custom'));

-- 4. Drop the old unique index (variant_id can now be NULL for custom rows)
--    and recreate it as a partial index that only applies to non-custom rows.
DROP INDEX IF EXISTS idx_saved_workouts_unique;
CREATE UNIQUE INDEX idx_saved_workouts_unique
  ON saved_workouts(user_id, variant_id, source)
  WHERE source <> 'custom';
