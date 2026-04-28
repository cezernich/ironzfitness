-- 2026-04-28 — Coaching Feature v1 (Phase 1 foundation)
--
-- Lets a designated user (a "coach") manage other users' (their "clients")
-- training. Coach sees the client's training stack, assigns workouts in any
-- of the existing creation modes, attaches one-way notes, gets a daily
-- digest. Coach is also still a regular IronZ athlete in their own right —
-- they switch into a Coach Portal the same way admins switch into the
-- Admin Portal.
--
-- This migration covers Phase 1: schema + RLS + helper function. Coach
-- Portal UI lands in Phase 2+. The "Request a Coach" lead-gen flow ALSO
-- lives in this migration since it ships in Phase 1.
--
-- ── Data scope (locked-in spec decision) ────────────────────────────────
-- Coach can read: workouts, completions, feedback, RPE, plan, PRs,
-- strength benchmarks, races, training zones.
-- Coach CANNOT read: meals, hydration, body comp, sleep, photos, fueling
-- prefs, nutrition adjustments. Enforced at RLS level.
--
-- ── Storage layout note ─────────────────────────────────────────────────
-- IronZ uses TWO storage patterns server-side:
--   1. Dedicated tables (workouts, training_sessions, race_events, etc.) —
--      simple per-table RLS via is_coaching(auth.uid(), user_id).
--   2. user_data (generic key/value mirror of localStorage) — every
--      localStorage key for a user lives in one row keyed by data_key.
--      Coach must see SOME data_keys (workoutSchedule, prs, etc.) and not
--      others (meals, hydrationLog). Enforced via per-key allowlist in the
--      coach SELECT policy.
--
-- After this migration runs, smoke-test by:
--   select public.is_coaching('<coach-uuid>', '<client-uuid>');
-- before relying on any of the policies below.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. profiles.is_coach flag
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_coach BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS profiles_is_coach_idx
  ON public.profiles (is_coach) WHERE is_coach = TRUE;

-- ──────────────────────────────────────────────────────────────────────
-- 2. coaching_assignments — the coach <-> client relationship
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coaching_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('primary', 'sub')),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by     UUID REFERENCES auth.users(id),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at  TIMESTAMPTZ,

  CONSTRAINT coaching_no_self CHECK (client_id <> coach_id)
);

-- Indexes for the two main lookups: "all clients for this coach" and
-- "all coaches for this client". Both filtered to active relationships.
CREATE INDEX IF NOT EXISTS coaching_active_client_idx
  ON public.coaching_assignments (client_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS coaching_active_coach_idx
  ON public.coaching_assignments (coach_id) WHERE active = TRUE;

-- Each client has AT MOST ONE primary coach at a time. Sub-coaches can
-- coexist; the primary is unique. Enforced via partial unique index since
-- a CHECK constraint can't reference other rows.
CREATE UNIQUE INDEX IF NOT EXISTS coaching_one_primary_per_client
  ON public.coaching_assignments (client_id)
  WHERE role = 'primary' AND active = TRUE;

-- Prevent the same coach <-> client pair from existing twice as ACTIVE.
-- (A historical inactive row + a current active row is fine.)
CREATE UNIQUE INDEX IF NOT EXISTS coaching_unique_active_pair
  ON public.coaching_assignments (client_id, coach_id)
  WHERE active = TRUE;

ALTER TABLE public.coaching_assignments ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────
-- 3. is_coaching(coach_uid, client_uid) helper
-- ──────────────────────────────────────────────────────────────────────
-- Used in every per-table coach SELECT policy below. Marked STABLE so the
-- planner can cache the result within a single statement. Marked SECURITY
-- DEFINER so the function bypasses RLS on coaching_assignments itself —
-- otherwise a recursive RLS check would loop on the policy that consults
-- this function.

CREATE OR REPLACE FUNCTION public.is_coaching(coach_uid UUID, client_uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coaching_assignments
    WHERE coach_id = coach_uid
      AND client_id = client_uid
      AND active = TRUE
  );
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 4. coach_assigned_workouts — the workouts a coach pushes to a client
-- ──────────────────────────────────────────────────────────────────────
-- Canonical record of every coach-authored assignment. Mirrored into the
-- client's workoutSchedule (user_data row) by application code so the
-- existing render path picks them up unchanged. The `workout` JSONB has
-- the same shape as a workoutSchedule entry plus coach-attribution
-- fields (coachId, coachName, coachNote, assignedAt).

CREATE TABLE IF NOT EXISTS public.coach_assigned_workouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id        UUID NOT NULL REFERENCES auth.users(id),
  date            DATE NOT NULL,
  workout         JSONB NOT NULL,
  conflict_mode   TEXT NOT NULL CHECK (conflict_mode IN ('replace', 'stack', 'freeze')),
  coach_note      TEXT,
  program_id      UUID,  -- references coach_programs(id), wired below
  program_week    INT,
  program_day     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coach_assigned_client_date_idx
  ON public.coach_assigned_workouts (client_id, date);
CREATE INDEX IF NOT EXISTS coach_assigned_coach_date_idx
  ON public.coach_assigned_workouts (coach_id, date);

ALTER TABLE public.coach_assigned_workouts ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────
-- 5. coach_workout_library — coach's saved workouts (pickable templates)
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coach_workout_library (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  workout     JSONB NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coach_library_owner_idx
  ON public.coach_workout_library (coach_id);

ALTER TABLE public.coach_workout_library ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────
-- 6. coach_programs — multi-week templates the coach can apply to clients
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coach_programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  duration_weeks  INT NOT NULL CHECK (duration_weeks > 0),
  weekly_template JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coach_programs_owner_idx
  ON public.coach_programs (coach_id);

-- Backfill the FK on coach_assigned_workouts.program_id now that
-- coach_programs exists.
ALTER TABLE public.coach_assigned_workouts
  DROP CONSTRAINT IF EXISTS coach_assigned_workouts_program_id_fkey;
ALTER TABLE public.coach_assigned_workouts
  ADD CONSTRAINT coach_assigned_workouts_program_id_fkey
  FOREIGN KEY (program_id) REFERENCES public.coach_programs(id) ON DELETE SET NULL;

ALTER TABLE public.coach_programs ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────
-- 7. client_plan_freeze — flag that AI plan generation is paused
-- ──────────────────────────────────────────────────────────────────────
-- Set when a coach picks "Freeze AI plan from this date forward" in the
-- conflict-resolution modal. The AI generator (onboarding-v2 + plan
-- builder) consults this row before adding new sessions.

CREATE TABLE IF NOT EXISTS public.client_plan_freeze (
  client_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  frozen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frozen_by     UUID REFERENCES auth.users(id),
  unfrozen_at   TIMESTAMPTZ
);

ALTER TABLE public.client_plan_freeze ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────
-- 8. coach_digest_log — dedup table for the daily digest cron
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coach_digest_log (
  coach_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_date   DATE NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  digest_body   TEXT,
  PRIMARY KEY (coach_id, digest_date)
);

ALTER TABLE public.coach_digest_log ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────
-- 9. coach_requests — "Request a Coach" form submissions
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coach_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport           TEXT NOT NULL CHECK (sport IN (
    'running', 'cycling', 'swimming', 'triathlon',
    'strength', 'hyrox', 'general_fitness', 'other'
  )),
  goal            TEXT NOT NULL CHECK (goal IN (
    'race', 'general_fitness', 'body_comp', 'performance',
    'injury_return', 'other'
  )),
  experience      TEXT NOT NULL CHECK (experience IN (
    'beginner', 'intermediate', 'advanced'
  )),
  notes              TEXT,
  premium_at_request BOOLEAN NOT NULL DEFAULT FALSE,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'matched', 'declined', 'archived'
  )),
  matched_coach_id   UUID REFERENCES auth.users(id),
  matched_at         TIMESTAMPTZ,
  archived_reason    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coach_requests_status_idx
  ON public.coach_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_requests_user_idx
  ON public.coach_requests (user_id);

ALTER TABLE public.coach_requests ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ══════════════════════════════════════════════════════════════════════
-- Pattern per table:
--   1. Owner / direct-relationship policy (existing, unchanged).
--   2. Coach SELECT policy that calls is_coaching(auth.uid(), <user_id>).
--   3. Admin override (already covered by existing admin policies on
--      most tables; not duplicated here unless missing).
--
-- For user_data: per-key allowlist via the data_key value. Coaches see
-- training keys, never nutrition/hydration/photo keys.

-- ──── coaching_assignments ──────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins manage coaching assignments" ON public.coaching_assignments;
CREATE POLICY "Admins manage coaching assignments"
  ON public.coaching_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Coaches see their own assignments" ON public.coaching_assignments;
CREATE POLICY "Coaches see their own assignments"
  ON public.coaching_assignments
  FOR SELECT
  USING (coach_id = auth.uid());

DROP POLICY IF EXISTS "Clients see their own assignments" ON public.coaching_assignments;
CREATE POLICY "Clients see their own assignments"
  ON public.coaching_assignments
  FOR SELECT
  USING (client_id = auth.uid());

-- ──── profiles: coach-readable client profile basics ────────────────────

DROP POLICY IF EXISTS "Coaches can view assigned clients' profiles" ON public.profiles;
CREATE POLICY "Coaches can view assigned clients' profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_coaching(auth.uid(), id));

-- ──── workouts (logged sessions) ────────────────────────────────────────

DROP POLICY IF EXISTS "Coaches can view assigned clients' workouts" ON public.workouts;
CREATE POLICY "Coaches can view assigned clients' workouts"
  ON public.workouts
  FOR SELECT
  USING (public.is_coaching(auth.uid(), user_id));

-- ──── workout_exercises ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "Coaches can view assigned clients' workout exercises" ON public.workout_exercises;
CREATE POLICY "Coaches can view assigned clients' workout exercises"
  ON public.workout_exercises
  FOR SELECT
  USING (public.is_coaching(auth.uid(), user_id));

-- ──── workout_segments ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "Coaches can view assigned clients' workout segments" ON public.workout_segments;
CREATE POLICY "Coaches can view assigned clients' workout segments"
  ON public.workout_segments
  FOR SELECT
  USING (public.is_coaching(auth.uid(), user_id));

-- ──── training_plans + training_sessions (the calendar) ─────────────────

DROP POLICY IF EXISTS "Coaches can view assigned clients' training plans" ON public.training_plans;
CREATE POLICY "Coaches can view assigned clients' training plans"
  ON public.training_plans
  FOR SELECT
  USING (public.is_coaching(auth.uid(), user_id));

DROP POLICY IF EXISTS "Coaches can view assigned clients' training sessions" ON public.training_sessions;
CREATE POLICY "Coaches can view assigned clients' training sessions"
  ON public.training_sessions
  FOR SELECT
  USING (public.is_coaching(auth.uid(), user_id));

-- ──── plan_adherence + weekly_checkins (feedback) ───────────────────────

DROP POLICY IF EXISTS "Coaches can view assigned clients' plan adherence" ON public.plan_adherence;
CREATE POLICY "Coaches can view assigned clients' plan adherence"
  ON public.plan_adherence
  FOR SELECT
  USING (public.is_coaching(auth.uid(), user_id));

DROP POLICY IF EXISTS "Coaches can view assigned clients' weekly checkins" ON public.weekly_checkins;
CREATE POLICY "Coaches can view assigned clients' weekly checkins"
  ON public.weekly_checkins
  FOR SELECT
  USING (public.is_coaching(auth.uid(), user_id));

-- ──── goals + race_events ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Coaches can view assigned clients' goals" ON public.goals;
CREATE POLICY "Coaches can view assigned clients' goals"
  ON public.goals
  FOR SELECT
  USING (public.is_coaching(auth.uid(), user_id));

DROP POLICY IF EXISTS "Coaches can view assigned clients' race events" ON public.race_events;
CREATE POLICY "Coaches can view assigned clients' race events"
  ON public.race_events
  FOR SELECT
  USING (public.is_coaching(auth.uid(), user_id));

-- ──── user_data: per-key allowlist (the load-bearing one) ───────────────
-- IronZ stores most localStorage as user_data rows. Training data lives
-- under specific keys; meals/hydration/etc. live under others. The
-- coaching scope explicitly excludes meals/hydration/body comp/sleep/
-- photos — so the SELECT policy only matches training keys.
--
-- Allowed list mirrors the coaching data scope: workouts, completions,
-- feedback, RPE, plan, PRs, strength benchmarks, races. NOT meals,
-- hydrationLog, hydrationSettings, hydrationDailyTargetOz, fuelingPrefs,
-- nutritionAdjustments, foodPreferences, savedMealPlans, currentWeekMealPlan.

DROP POLICY IF EXISTS "Coaches can view assigned clients' training user_data" ON public.user_data;
CREATE POLICY "Coaches can view assigned clients' training user_data"
  ON public.user_data
  FOR SELECT
  USING (
    public.is_coaching(auth.uid(), user_id)
    AND data_key IN (
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
      'injuries'
    )
  );

-- ──── coach_assigned_workouts ───────────────────────────────────────────

DROP POLICY IF EXISTS "Coaches manage their own assignments" ON public.coach_assigned_workouts;
CREATE POLICY "Coaches manage their own assignments"
  ON public.coach_assigned_workouts
  FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "Clients can view their own coach assignments" ON public.coach_assigned_workouts;
CREATE POLICY "Clients can view their own coach assignments"
  ON public.coach_assigned_workouts
  FOR SELECT
  USING (client_id = auth.uid());

-- ──── coach_workout_library ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Coaches manage their own library" ON public.coach_workout_library;
CREATE POLICY "Coaches manage their own library"
  ON public.coach_workout_library
  FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- ──── coach_programs ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Coaches manage their own programs" ON public.coach_programs;
CREATE POLICY "Coaches manage their own programs"
  ON public.coach_programs
  FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- ──── client_plan_freeze ────────────────────────────────────────────────
-- Coaches set/clear this for their clients; clients can read their own row
-- (so the AI generator running in the client's browser can consult it).

DROP POLICY IF EXISTS "Coaches manage their clients' plan freeze" ON public.client_plan_freeze;
CREATE POLICY "Coaches manage their clients' plan freeze"
  ON public.client_plan_freeze
  FOR ALL
  USING (public.is_coaching(auth.uid(), client_id))
  WITH CHECK (public.is_coaching(auth.uid(), client_id));

DROP POLICY IF EXISTS "Clients can view their own plan freeze" ON public.client_plan_freeze;
CREATE POLICY "Clients can view their own plan freeze"
  ON public.client_plan_freeze
  FOR SELECT
  USING (client_id = auth.uid());

-- ──── coach_digest_log ──────────────────────────────────────────────────
-- Only the coach themselves and the cron's service role need access. The
-- service role bypasses RLS, so we just need the per-coach SELECT policy.

DROP POLICY IF EXISTS "Coaches see their own digest log" ON public.coach_digest_log;
CREATE POLICY "Coaches see their own digest log"
  ON public.coach_digest_log
  FOR SELECT
  USING (coach_id = auth.uid());

-- ──── coach_requests ────────────────────────────────────────────────────
-- Users insert their own requests; can read their own. Admins manage all.

DROP POLICY IF EXISTS "Users can create their own coach request" ON public.coach_requests;
CREATE POLICY "Users can create their own coach request"
  ON public.coach_requests
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view their own coach requests" ON public.coach_requests;
CREATE POLICY "Users can view their own coach requests"
  ON public.coach_requests
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage coach requests" ON public.coach_requests;
CREATE POLICY "Admins can manage coach requests"
  ON public.coach_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ══════════════════════════════════════════════════════════════════════
-- updated_at triggers (light-touch — only on tables clients write to)
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._coaching_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_assigned_workouts_touch_updated ON public.coach_assigned_workouts;
CREATE TRIGGER coach_assigned_workouts_touch_updated
  BEFORE UPDATE ON public.coach_assigned_workouts
  FOR EACH ROW EXECUTE FUNCTION public._coaching_touch_updated_at();

DROP TRIGGER IF EXISTS coach_requests_touch_updated ON public.coach_requests;
CREATE TRIGGER coach_requests_touch_updated
  BEFORE UPDATE ON public.coach_requests
  FOR EACH ROW EXECUTE FUNCTION public._coaching_touch_updated_at();

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- POST-DEPLOY SANITY CHECKS (run manually after applying)
-- ══════════════════════════════════════════════════════════════════════
--
-- 1. Helper function in isolation:
--      select public.is_coaching('<coach-uuid>', '<client-uuid>');
--    Should return false before any assignment, true after one is created.
--
-- 2. Insert a test assignment as admin:
--      insert into public.coaching_assignments (client_id, coach_id, role)
--      values ('<client-uuid>', '<coach-uuid>', 'primary');
--    Then re-run is_coaching() — should now be true.
--
-- 3. As the coach (sign in, RLS on), confirm:
--      select count(*) from public.workouts where user_id = '<client-uuid>';
--    Returns the client's workout count.
--
-- 4. As the SAME coach, confirm:
--      select count(*) from public.user_data
--      where user_id = '<client-uuid>' and data_key = 'meals';
--    Returns 0. ← This is the load-bearing assertion.
--
-- 5. As the coach, confirm:
--      select count(*) from public.user_data
--      where user_id = '<client-uuid>' and data_key = 'hydrationLog';
--    Returns 0.
--
-- 6. As the coach, confirm:
--      select count(*) from public.user_data
--      where user_id = '<client-uuid>' and data_key = 'workoutSchedule';
--    Returns the actual count (should be > 0 if client has any plan).
--
-- If 4 + 5 are non-zero, RLS is BROKEN — DO NOT proceed to UI work
-- until the data_key allowlist is fixed.
