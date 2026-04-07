-- ============================================================================
-- IRONZ — Phase 1: Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

-- ── Table 1: profiles ──────────────────────────────────────────────────────
-- Created on first run; ALTER statements add columns idempotently.

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz DEFAULT now(),
  subscription_status text DEFAULT 'free',
  role text DEFAULT 'user'
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Add extended profile columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight_lbs numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS height_inches numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_goal text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fitness_level text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS measurement_system text DEFAULT 'imperial';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── Table 2: workouts ───────────────────────────────────────────────────────

CREATE TABLE workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  name text,
  type text NOT NULL,
  notes text,
  duration_minutes integer,
  avg_watts integer,
  source text DEFAULT 'manual',
  plan_session_id uuid,
  completed boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── Table 3: workout_exercises ──────────────────────────────────────────────

CREATE TABLE workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid REFERENCES workouts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  exercise_name text NOT NULL,
  sets integer,
  reps text,
  weight_lbs numeric,
  duration_seconds integer,
  notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── Table 4: workout_segments ───────────────────────────────────────────────

CREATE TABLE workout_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid REFERENCES workouts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  segment_type text,
  distance numeric,
  distance_unit text DEFAULT 'mi',
  duration_minutes numeric,
  pace text,
  intensity text,
  notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── Table 5: training_plans ─────────────────────────────────────────────────

CREATE TABLE training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text,
  type text NOT NULL,
  goal text,
  fitness_level text,
  start_date date,
  end_date date,
  weeks integer,
  days_per_week integer,
  split_type text,
  is_active boolean DEFAULT true,
  source text DEFAULT 'generated',
  raw_plan jsonb,
  created_at timestamptz DEFAULT now()
);

-- ── Table 6: training_sessions ──────────────────────────────────────────────

CREATE TABLE training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES training_plans(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scheduled_date date NOT NULL,
  week_number integer,
  day_of_week integer,
  session_type text,
  session_name text,
  description text,
  exercises jsonb,
  status text DEFAULT 'scheduled',
  completed_workout_id uuid REFERENCES workouts(id),
  created_at timestamptz DEFAULT now()
);

-- ── Table 7: plan_adherence ─────────────────────────────────────────────────

CREATE TABLE plan_adherence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES training_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scheduled_date date NOT NULL,
  action text NOT NULL,
  reason text,
  modification_notes text,
  completed_workout_id uuid REFERENCES workouts(id),
  created_at timestamptz DEFAULT now()
);

-- ── Table 8: weekly_checkins ────────────────────────────────────────────────

CREATE TABLE weekly_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_start_date date NOT NULL,
  energy_level integer CHECK (energy_level BETWEEN 1 AND 10),
  soreness_level integer CHECK (soreness_level BETWEEN 1 AND 10),
  stress_level integer CHECK (stress_level BETWEEN 1 AND 10),
  sleep_quality integer CHECK (sleep_quality BETWEEN 1 AND 10),
  sessions_completed integer,
  sessions_planned integer,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week_start_date)
);

-- ── Table 9: goals ──────────────────────────────────────────────────────────

CREATE TABLE goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type text,
  target_value numeric,
  current_value numeric,
  unit text,
  deadline date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── Table 10: race_events ───────────────────────────────────────────────────

CREATE TABLE race_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type text,
  race_date date,
  distance numeric,
  distance_unit text,
  goal_time text,
  notes text,
  created_at timestamptz DEFAULT now()
);


-- ── Table 10b: user_data (generic key-value store) ─────────────────────────
-- Covers: meals, savedWorkouts, dayRestrictions, completedSessions,
-- workoutRatings, importedPlans, personalRecords, nutritionAdjustments,
-- foodPreferences, equipmentRestrictions, trainingZones, hydrationLog,
-- checkinHistory, trainingPreferences, trainingNotes, savedMealPlans,
-- currentWeekMealPlan, hydrationSettings, fuelingPrefs, fitnessGoals,
-- completedChallenges, activeChallenges, yogaTypes, etc.

CREATE TABLE user_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  data_key text NOT NULL,
  data_value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, data_key)
);

CREATE INDEX idx_user_data_user ON user_data(user_id);
CREATE INDEX idx_user_data_key ON user_data(user_id, data_key);


-- ============================================================================
-- PHASE 2: Row Level Security
-- ============================================================================

-- ── Enable RLS on all tables ────────────────────────────────────────────────

ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_adherence ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies: user_data ────────────────────────────────────────────────

CREATE POLICY "Users can view own user_data"
  ON user_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own user_data"
  ON user_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own user_data"
  ON user_data FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own user_data"
  ON user_data FOR DELETE USING (auth.uid() = user_id);

-- ── RLS Policies: workouts ──────────────────────────────────────────────────

CREATE POLICY "Users can view own workouts"
  ON workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own workouts"
  ON workouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workouts"
  ON workouts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workouts"
  ON workouts FOR DELETE USING (auth.uid() = user_id);

-- ── RLS Policies: workout_exercises ─────────────────────────────────────────

CREATE POLICY "Users can view own workout_exercises"
  ON workout_exercises FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own workout_exercises"
  ON workout_exercises FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workout_exercises"
  ON workout_exercises FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workout_exercises"
  ON workout_exercises FOR DELETE USING (auth.uid() = user_id);

-- ── RLS Policies: workout_segments ──────────────────────────────────────────

CREATE POLICY "Users can view own workout_segments"
  ON workout_segments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own workout_segments"
  ON workout_segments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workout_segments"
  ON workout_segments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workout_segments"
  ON workout_segments FOR DELETE USING (auth.uid() = user_id);

-- ── RLS Policies: training_plans ────────────────────────────────────────────

CREATE POLICY "Users can view own training_plans"
  ON training_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own training_plans"
  ON training_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own training_plans"
  ON training_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own training_plans"
  ON training_plans FOR DELETE USING (auth.uid() = user_id);

-- ── RLS Policies: training_sessions ─────────────────────────────────────────

CREATE POLICY "Users can view own training_sessions"
  ON training_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own training_sessions"
  ON training_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own training_sessions"
  ON training_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own training_sessions"
  ON training_sessions FOR DELETE USING (auth.uid() = user_id);

-- ── RLS Policies: plan_adherence ────────────────────────────────────────────

CREATE POLICY "Users can view own plan_adherence"
  ON plan_adherence FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plan_adherence"
  ON plan_adherence FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plan_adherence"
  ON plan_adherence FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own plan_adherence"
  ON plan_adherence FOR DELETE USING (auth.uid() = user_id);

-- ── RLS Policies: weekly_checkins ───────────────────────────────────────────

CREATE POLICY "Users can view own weekly_checkins"
  ON weekly_checkins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own weekly_checkins"
  ON weekly_checkins FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own weekly_checkins"
  ON weekly_checkins FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own weekly_checkins"
  ON weekly_checkins FOR DELETE USING (auth.uid() = user_id);

-- ── RLS Policies: goals ─────────────────────────────────────────────────────

CREATE POLICY "Users can view own goals"
  ON goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals"
  ON goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals"
  ON goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals"
  ON goals FOR DELETE USING (auth.uid() = user_id);

-- ── RLS Policies: race_events ───────────────────────────────────────────────

CREATE POLICY "Users can view own race_events"
  ON race_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own race_events"
  ON race_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own race_events"
  ON race_events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own race_events"
  ON race_events FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PHILOSOPHY ENGINE TABLES (from Philosophy Engine Roadmap Phase 1)
-- ============================================================================

-- ── Table 11: philosophy_modules ────────────────────────────────────────────

CREATE TABLE philosophy_modules (
  id text PRIMARY KEY,                      -- e.g., 'LEVEL_BEGINNER'
  category text NOT NULL,                   -- e.g., 'athlete_level', 'sport_profile', 'goal'
  title text NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  applies_when jsonb NOT NULL,              -- conditions for retrieval
  principles text[] DEFAULT '{}',
  plan_rules text[] DEFAULT '{}',
  hard_constraints text[] DEFAULT '{}',
  nutrition_rules text[] DEFAULT '{}',
  training_adjustments text[] DEFAULT '{}',
  coaching_tone text,
  evidence_sources text[] DEFAULT '{}',
  rationale text,
  priority text DEFAULT 'medium',           -- high / medium / low
  is_active boolean DEFAULT true,
  change_log text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_philosophy_modules_category ON philosophy_modules(category);
CREATE INDEX idx_philosophy_modules_applies_when ON philosophy_modules USING GIN(applies_when);

-- ── Table 12: exercise_library ──────────────────────────────────────────────

CREATE TABLE exercise_library (
  id text PRIMARY KEY,                      -- e.g., 'barbell_back_squat'
  name text NOT NULL,
  movement_pattern text NOT NULL,           -- squat / hinge / push / pull / carry / core / isolation
  muscle_groups text[] NOT NULL,
  equipment_required text[] DEFAULT '{}',
  difficulty text NOT NULL,                 -- beginner / intermediate / advanced
  tier int NOT NULL,                        -- 1 = primary compound, 2 = secondary, 3 = accessory
  sport_relevance text[] DEFAULT '{}',
  contraindications text[] DEFAULT '{}',
  substitutions text[] DEFAULT '{}',
  default_rep_range text,
  default_rest_seconds int,
  instructions text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_exercise_library_pattern ON exercise_library(movement_pattern);
CREATE INDEX idx_exercise_library_equipment ON exercise_library USING GIN(equipment_required);
CREATE INDEX idx_exercise_library_tier ON exercise_library(tier);

-- ── Table 13: philosophy_gaps ───────────────────────────────────────────────

CREATE TABLE philosophy_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text NOT NULL,                  -- e.g., 'sport_profile', 'event_specific'
  value text NOT NULL,                      -- e.g., 'rowing', 'pickleball'
  user_count int DEFAULT 1,
  sample_user_profiles jsonb DEFAULT '[]',
  resolution_status text DEFAULT 'open',    -- open / in_progress / resolved
  resolution_notes text,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_philosophy_gaps_unique ON philosophy_gaps(dimension, value);

-- ── Table 14: module_version_history ────────────────────────────────────────

CREATE TABLE module_version_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id text NOT NULL REFERENCES philosophy_modules(id),
  old_version text NOT NULL,
  new_version text NOT NULL,
  change_description text NOT NULL,
  changed_by text DEFAULT 'manual',         -- 'manual' | 'sync_pipeline'
  changed_at timestamptz DEFAULT now()
);

-- ── Table 15: generated_plans ───────────────────────────────────────────────

CREATE TABLE generated_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  plan_data jsonb NOT NULL,
  philosophy_module_ids text[] NOT NULL,
  module_versions jsonb NOT NULL,
  generation_source text NOT NULL,          -- 'rules_engine' | 'ai_assisted' | 'gap_fallback'
  plan_version text DEFAULT '1.0',
  assumptions text[] DEFAULT '{}',
  validation_flags text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  is_outdated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_generated_plans_user ON generated_plans(user_id);
CREATE INDEX idx_generated_plans_active ON generated_plans(user_id, is_active);

-- ── Table 16: user_outcomes ─────────────────────────────────────────────────

CREATE TABLE user_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  plan_id uuid REFERENCES generated_plans(id),
  week_number int,
  sessions_planned int,
  sessions_completed int,
  difficulty_rating text,                   -- too_easy / just_right / too_hard
  energy_level text,                        -- low / moderate / high
  sleep_quality text,                       -- poor / fair / good
  soreness_level text,                      -- none / mild / moderate / severe
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_user_outcomes_user ON user_outcomes(user_id);
CREATE INDEX idx_user_outcomes_plan ON user_outcomes(plan_id);

-- ── RLS: Philosophy engine tables ───────────────────────────────────────────

ALTER TABLE philosophy_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE philosophy_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_version_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_outcomes ENABLE ROW LEVEL SECURITY;

-- Philosophy modules: public read (active only)
CREATE POLICY "Anyone can read active modules"
  ON philosophy_modules FOR SELECT USING (is_active = true);

-- Exercise library: public read (active only)
CREATE POLICY "Anyone can read exercises"
  ON exercise_library FOR SELECT USING (is_active = true);

-- Philosophy gaps: authenticated insert, admin read
CREATE POLICY "Authenticated users can insert gaps"
  ON philosophy_gaps FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can read gaps"
  ON philosophy_gaps FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can update gaps"
  ON philosophy_gaps FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Module version history: admin only
CREATE POLICY "Admins can read version history"
  ON module_version_history FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can insert version history"
  ON module_version_history FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Generated plans: user owns their plans
CREATE POLICY "Users can read own plans"
  ON generated_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plans"
  ON generated_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plans"
  ON generated_plans FOR UPDATE USING (auth.uid() = user_id);

-- User outcomes: user owns their outcomes
CREATE POLICY "Users can read own outcomes"
  ON user_outcomes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own outcomes"
  ON user_outcomes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin write access for philosophy modules and exercise library
CREATE POLICY "Admins can insert philosophy_modules"
  ON philosophy_modules FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can update philosophy_modules"
  ON philosophy_modules FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can delete philosophy_modules"
  ON philosophy_modules FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can insert exercise_library"
  ON exercise_library FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can update exercise_library"
  ON exercise_library FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can delete exercise_library"
  ON exercise_library FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Module effectiveness report function ────────────────────────────────────

CREATE OR REPLACE FUNCTION module_effectiveness_report()
RETURNS TABLE (
  module_id text,
  plan_count bigint,
  avg_difficulty_score numeric,
  avg_completion_rate numeric,
  avg_energy numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    unnest(gp.philosophy_module_ids) AS module_id,
    COUNT(DISTINCT gp.id) AS plan_count,
    AVG(CASE uo.difficulty_rating
      WHEN 'too_easy' THEN 0.0
      WHEN 'just_right' THEN 0.5
      WHEN 'too_hard' THEN 1.0
    END) AS avg_difficulty_score,
    AVG(CASE WHEN uo.sessions_planned > 0
      THEN uo.sessions_completed::numeric / uo.sessions_planned
      ELSE NULL END) AS avg_completion_rate,
    AVG(CASE uo.energy_level
      WHEN 'low' THEN 0.0
      WHEN 'moderate' THEN 0.5
      WHEN 'high' THEN 1.0
    END) AS avg_energy
  FROM generated_plans gp
  JOIN user_outcomes uo ON uo.plan_id = gp.id
  GROUP BY unnest(gp.philosophy_module_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Admin policies (so admin panel can see all users) ───────────────────────

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Table: ai_usage (rate limiting for AI proxy) ──────────────────────────

CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  request_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, usage_date)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Only the service role (Edge Function) writes to this table.
-- Users can read their own usage to display remaining count.
DROP POLICY IF EXISTS "Users can view own ai_usage" ON ai_usage;
CREATE POLICY "Users can view own ai_usage"
  ON ai_usage FOR SELECT USING (auth.uid() = user_id);

-- Service role bypasses RLS, so no insert/update policy needed for the Edge Function.

-- ============================================================================
-- Done! Verify tables exist in the Supabase Table Editor before proceeding.
-- ============================================================================
