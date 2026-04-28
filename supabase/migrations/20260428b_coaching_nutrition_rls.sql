-- 2026-04-28 (Phase 2A) — Coaching: feature-gated nutrition + hydration RLS
--
-- Phase 1 landed a simple allowlist policy on public.user_data — coaches
-- could read training data_keys (workouts, prs, etc.) and were silently
-- blocked from everything else (meals, hydration, photos, ...). The
-- Coaching Spec update on 2026-04-28 ("Coach control of nutrition &
-- hydration settings") split that into:
--
--   • Always-allowed training data — same as Phase 1.
--   • Always-allowed feature toggle keys themselves so the coach knows
--     what's gated (nutritionEnabled, hydrationEnabled, fuelingEnabled).
--   • Conditionally-allowed nutrition/fueling/hydration SETTINGS rows —
--     coach can read/write them ONLY when the corresponding flag is true
--     for that user.
--   • Logged data (meals, hydrationLog, savedMealPlans, etc.) — STILL
--     blocked, full stop. That's the line.
--
-- ── Storage-shape audit ───────────────────────────────────────────────
-- Production data audit (run 2026-04-28 against live Supabase) showed
-- the toggle flags are stored as JSONB *numeric* 0/1, not boolean and
-- not {enabled: bool}:
--
--   user_id  data_key          data_value
--   ------   --------          ----------
--   ...      nutritionEnabled  1
--   ...      hydrationEnabled  1
--   ...      fuelingEnabled    1
--   ...      nutritionEnabled  0     ← off
--
-- The js writers (onboarding-v2.js:819) call _lsSet("nutritionEnabled",
-- "1" | "0") which JSON-encodes the value before writing to user_data.
-- Depending on whether the writer parses the string first, it can land
-- as a JSONB number or a JSONB string. The helper handles both, plus
-- the boolean and {enabled: bool} shapes the spec mentions in case
-- some path writes them too.
--
-- ── Helper: is_feature_enabled(uid, flag_key) ─────────────────────────
-- Returns TRUE when the user has the feature on (default-on when no row
-- exists, matching IronZ convention — onboarding leaves the toggle
-- unset rather than writing "1" for the default state). Returns FALSE
-- only when an explicit off-value is stored.
--
-- Syntax note: data_value #>> '{}' extracts the JSONB root as text
-- regardless of underlying type. This is the canonical way to coerce
-- a JSONB scalar to text. data_value->>0 was wrong (does array-index
-- access; returns NULL for non-array types) and would have silently
-- defaulted strings like "0" to TRUE.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. is_feature_enabled() helper
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_feature_enabled(uid UUID, flag_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT
       CASE
         -- Explicit JSON null → treat as default-on. Matches the no-row
         -- case below; if the writer somehow stored null, the user
         -- never made an explicit choice.
         WHEN data_value IS NULL THEN TRUE
         WHEN jsonb_typeof(data_value) = 'null' THEN TRUE
         WHEN jsonb_typeof(data_value) = 'boolean' THEN data_value::TEXT::BOOLEAN
         WHEN jsonb_typeof(data_value) = 'number'  THEN (data_value::TEXT)::NUMERIC <> 0
         -- (data_value #>> '{}') returns the underlying scalar as TEXT.
         -- Fixes the spec's data_value->>0 typo (that's array-index
         -- access; returns NULL for string types and would have
         -- defaulted "0" to enabled).
         WHEN jsonb_typeof(data_value) = 'string'  THEN (data_value #>> '{}') NOT IN ('0', 'false', '')
         WHEN jsonb_typeof(data_value) = 'object'  THEN COALESCE((data_value->>'enabled')::BOOLEAN, TRUE)
         ELSE TRUE
       END
     FROM public.user_data
     WHERE user_id = uid AND data_key = flag_key
     LIMIT 1),
    TRUE  -- no row at all = default-on (IronZ convention; the writer
          -- only persists the flag when the user toggles, so the
          -- absence of a row means "still at default".)
  );
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Audit-trail columns on user_data (used by Phase 3 writes)
-- ──────────────────────────────────────────────────────────────────────
-- Landed now so the schema is stable before any UI writes happen.
-- App-side write paths (both client-side and coach-side) will set these
-- on every update so the client can later see "last edited by [coach]
-- on [date]" under each setting.

ALTER TABLE public.user_data
  ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Replace the Phase 1 user_data SELECT policy with the conditional one
-- ──────────────────────────────────────────────────────────────────────
-- The old policy was a flat allowlist. The new one folds the same
-- allowlist (training keys + flag keys) AND adds three conditional
-- branches gated by is_feature_enabled. Single policy is easier to
-- reason about than two layered ones; PostgreSQL ORs multiple SELECT
-- policies which would silently broaden access if we left the old one
-- in place.

DROP POLICY IF EXISTS "Coaches can view assigned clients' training user_data" ON public.user_data;

CREATE POLICY "Coaches can view permitted client user_data"
  ON public.user_data
  FOR SELECT
  USING (
    public.is_coaching(auth.uid(), user_id)
    AND (
      -- Always-allowed training data (mirrors Phase 1 + the feature
      -- flags themselves so coach UI knows which sections are gated).
      data_key IN (
        'workouts', 'workoutSchedule', 'trainingPlan',
        'completedSessions', 'workoutRatings',
        'personalRecords', 'trainingZones', 'trainingZonesHistory',
        'trainingPreferences', 'trainingNotes',
        'dayRestrictions', 'equipmentRestrictions', 'equipmentProfile',
        'events', 'raceEvents', 'thresholds', 'strengthSetup',
        'workoutEffortFeedback', 'calibrationSignals',
        'activePlan', 'activePlanAt', 'activePlanSource', 'activePlanId',
        'currentRecoveryState', 'latestCheckIn', 'checkinHistory',
        'userLevel', 'fitnessGoals', 'selectedSports', 'trainingGoals',
        'gear_checklists_v1', 'completedChallenges', 'activeChallenges',
        'importedPlans', 'gymStrengthEnabled', 'measurementSystem',
        'injuries',
        -- Feature toggle flags — always readable so the coach UI can
        -- render "Disabled by client" instead of an empty section.
        'nutritionEnabled', 'hydrationEnabled', 'fuelingEnabled'
      )
      OR
      -- Nutrition settings — only when the user has nutrition enabled.
      (data_key = 'nutritionAdjustments'
        AND public.is_feature_enabled(user_id, 'nutritionEnabled'))
      OR
      -- Hydration settings — only when the user has hydration enabled.
      (data_key IN ('hydrationSettings', 'hydrationDailyTargetOz')
        AND public.is_feature_enabled(user_id, 'hydrationEnabled'))
      OR
      -- Fueling settings — only when the user has fueling enabled.
      (data_key = 'fuelingPrefs'
        AND public.is_feature_enabled(user_id, 'fuelingEnabled'))
    )
  );

-- ──────────────────────────────────────────────────────────────────────
-- 4. Coach UPDATE policy on user_data (used by Phase 3 edit flow)
-- ──────────────────────────────────────────────────────────────────────
-- Landing now so the RLS posture is complete after this migration. UI
-- writes don't exist yet (Phase 3) but the policy is the gate, so any
-- attempt to write before then fails closed regardless of UI state.
-- INTENTIONALLY narrower than the SELECT policy — coaches can only
-- update the conditional nutrition/hydration/fueling settings, never
-- the always-allowed training keys (those are derived from the user's
-- own logged data and the workout generator).

DROP POLICY IF EXISTS "Coaches can update permitted client settings" ON public.user_data;

CREATE POLICY "Coaches can update permitted client settings"
  ON public.user_data
  FOR UPDATE
  USING (
    public.is_coaching(auth.uid(), user_id)
    AND (
      (data_key = 'nutritionAdjustments'
        AND public.is_feature_enabled(user_id, 'nutritionEnabled'))
      OR
      (data_key IN ('hydrationSettings', 'hydrationDailyTargetOz')
        AND public.is_feature_enabled(user_id, 'hydrationEnabled'))
      OR
      (data_key = 'fuelingPrefs'
        AND public.is_feature_enabled(user_id, 'fuelingEnabled'))
    )
  )
  WITH CHECK (
    public.is_coaching(auth.uid(), user_id)
    AND (
      (data_key = 'nutritionAdjustments'
        AND public.is_feature_enabled(user_id, 'nutritionEnabled'))
      OR
      (data_key IN ('hydrationSettings', 'hydrationDailyTargetOz')
        AND public.is_feature_enabled(user_id, 'hydrationEnabled'))
      OR
      (data_key = 'fuelingPrefs'
        AND public.is_feature_enabled(user_id, 'fuelingEnabled'))
    )
  );

-- ──────────────────────────────────────────────────────────────────────
-- 5. INSERT policy for upsert path
-- ──────────────────────────────────────────────────────────────────────
-- The coach UI will frequently hit "edit a setting that doesn't have a
-- row yet" — e.g. client never customised hydrationSettings. Supabase's
-- upsert with onConflict will INSERT in that case, so the policy needs
-- an INSERT branch matching the same conditional gate. Without this,
-- the INSERT silently fails and the coach gets a "saved!" UI but the
-- write didn't land.

DROP POLICY IF EXISTS "Coaches can insert permitted client settings" ON public.user_data;

CREATE POLICY "Coaches can insert permitted client settings"
  ON public.user_data
  FOR INSERT
  WITH CHECK (
    public.is_coaching(auth.uid(), user_id)
    AND (
      (data_key = 'nutritionAdjustments'
        AND public.is_feature_enabled(user_id, 'nutritionEnabled'))
      OR
      (data_key IN ('hydrationSettings', 'hydrationDailyTargetOz')
        AND public.is_feature_enabled(user_id, 'hydrationEnabled'))
      OR
      (data_key = 'fuelingPrefs'
        AND public.is_feature_enabled(user_id, 'fuelingEnabled'))
    )
  );

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- POST-DEPLOY SMOKE TEST (run manually before any UI work in Phase 2B)
-- ══════════════════════════════════════════════════════════════════════
--
-- Goal: confirm is_feature_enabled() returns the right boolean for every
-- shape the production data could land in, AND that the SELECT/UPDATE/
-- INSERT policies enforce the gate correctly.
--
-- Setup. <coach> = a uuid that is_coach=true for the test client; the
-- existing chase.zernich@gmail.com → ironzsupport@gmail.com pair from
-- the Phase 1 smoke test still works.
--
-- ── Helper-in-isolation tests ────────────────────────────────────────
--
-- Set up a temp test row, run is_feature_enabled, repeat for every
-- shape. Cleanup at the end. Run as the service role (SQL editor
-- bypasses RLS by default; that's fine for these helper tests).
--
--   -- Numeric 1 (production format)
--   delete from public.user_data where user_id = '<client>' and data_key = 'nutritionEnabled';
--   insert into public.user_data (user_id, data_key, data_value)
--   values ('<client>', 'nutritionEnabled', '1'::jsonb);
--   select public.is_feature_enabled('<client>', 'nutritionEnabled');
--   -- expect: true
--
--   -- Numeric 0
--   update public.user_data set data_value = '0'::jsonb
--     where user_id = '<client>' and data_key = 'nutritionEnabled';
--   select public.is_feature_enabled('<client>', 'nutritionEnabled');
--   -- expect: false
--
--   -- String "1" (in case some writer JSON-encodes the string)
--   update public.user_data set data_value = '"1"'::jsonb
--     where user_id = '<client>' and data_key = 'nutritionEnabled';
--   select public.is_feature_enabled('<client>', 'nutritionEnabled');
--   -- expect: true
--
--   -- String "0"
--   update public.user_data set data_value = '"0"'::jsonb
--     where user_id = '<client>' and data_key = 'nutritionEnabled';
--   select public.is_feature_enabled('<client>', 'nutritionEnabled');
--   -- expect: false
--
--   -- Boolean true
--   update public.user_data set data_value = 'true'::jsonb
--     where user_id = '<client>' and data_key = 'nutritionEnabled';
--   select public.is_feature_enabled('<client>', 'nutritionEnabled');
--   -- expect: true
--
--   -- Boolean false
--   update public.user_data set data_value = 'false'::jsonb
--     where user_id = '<client>' and data_key = 'nutritionEnabled';
--   select public.is_feature_enabled('<client>', 'nutritionEnabled');
--   -- expect: false
--
--   -- Object {enabled: true}
--   update public.user_data set data_value = '{"enabled": true}'::jsonb
--     where user_id = '<client>' and data_key = 'nutritionEnabled';
--   select public.is_feature_enabled('<client>', 'nutritionEnabled');
--   -- expect: true
--
--   -- Object {enabled: false}
--   update public.user_data set data_value = '{"enabled": false}'::jsonb
--     where user_id = '<client>' and data_key = 'nutritionEnabled';
--   select public.is_feature_enabled('<client>', 'nutritionEnabled');
--   -- expect: false
--
--   -- No row — default-on
--   delete from public.user_data
--     where user_id = '<client>' and data_key = 'nutritionEnabled';
--   select public.is_feature_enabled('<client>', 'nutritionEnabled');
--   -- expect: true
--
-- ── End-to-end RLS test (requires switching to coach JWT) ────────────
--
-- Sign in as the coach in the app, drop into the JS console, then:
--
--   const cid = '<client-uuid>';
--   const k = (key) => supabaseClient.from('user_data')
--     .select('data_key, data_value', { count: 'exact', head: true })
--     .eq('user_id', cid).eq('data_key', key);
--
--   // Always allowed
--   await k('workoutSchedule');                  // count >= 0, no error
--   await k('nutritionEnabled');                 // count >= 0, no error
--
--   // Conditionally allowed — flip via service role between runs
--   // and confirm count alternates.
--   await k('nutritionAdjustments');             // depends on flag
--   await k('hydrationSettings');                // depends on flag
--   await k('fuelingPrefs');                     // depends on flag
--
--   // Always blocked (no policy match → 0 rows even with assignment)
--   await k('meals');                            // expect: 0
--   await k('hydrationLog');                     // expect: 0
--
-- If "always blocked" returns >0 rows, either an old policy is still in
-- place or the conditional policy accidentally matches those keys —
-- DO NOT proceed to 2B until that's resolved.
