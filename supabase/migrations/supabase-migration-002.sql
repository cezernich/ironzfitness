-- ============================================================================
-- IRONZ — Migration 002: Philosophy Engine + User Data + AI Usage
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Assumes Migration 001 (base tables) has already been run.
-- ============================================================================

-- ── user_data (generic key-value store for user preferences/data) ──────────

CREATE TABLE IF NOT EXISTS user_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  data_key text NOT NULL,
  data_value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, data_key)
);

CREATE INDEX IF NOT EXISTS idx_user_data_user ON user_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_data_key ON user_data(user_id, data_key);

ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own user_data"
  ON user_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own user_data"
  ON user_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own user_data"
  ON user_data FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own user_data"
  ON user_data FOR DELETE USING (auth.uid() = user_id);


-- ── philosophy_modules ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS philosophy_modules (
  id text PRIMARY KEY,
  category text NOT NULL,
  title text NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  applies_when jsonb NOT NULL,
  principles text[] DEFAULT '{}',
  plan_rules text[] DEFAULT '{}',
  hard_constraints text[] DEFAULT '{}',
  nutrition_rules text[] DEFAULT '{}',
  training_adjustments text[] DEFAULT '{}',
  coaching_tone text,
  evidence_sources text[] DEFAULT '{}',
  rationale text,
  priority text DEFAULT 'medium',
  is_active boolean DEFAULT true,
  change_log text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_philosophy_modules_category ON philosophy_modules(category);
CREATE INDEX IF NOT EXISTS idx_philosophy_modules_applies_when ON philosophy_modules USING GIN(applies_when);

ALTER TABLE philosophy_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active modules"
  ON philosophy_modules FOR SELECT USING (is_active = true);
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


-- ── exercise_library ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exercise_library (
  id text PRIMARY KEY,
  name text NOT NULL,
  movement_pattern text NOT NULL,
  muscle_groups text[] NOT NULL,
  equipment_required text[] DEFAULT '{}',
  difficulty text NOT NULL,
  tier int NOT NULL,
  sport_relevance text[] DEFAULT '{}',
  contraindications text[] DEFAULT '{}',
  substitutions text[] DEFAULT '{}',
  default_rep_range text,
  default_rest_seconds int,
  instructions text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercise_library_pattern ON exercise_library(movement_pattern);
CREATE INDEX IF NOT EXISTS idx_exercise_library_equipment ON exercise_library USING GIN(equipment_required);
CREATE INDEX IF NOT EXISTS idx_exercise_library_tier ON exercise_library(tier);

ALTER TABLE exercise_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read exercises"
  ON exercise_library FOR SELECT USING (is_active = true);
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


-- ── philosophy_gaps ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS philosophy_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension text NOT NULL,
  value text NOT NULL,
  user_count int DEFAULT 1,
  sample_user_profiles jsonb DEFAULT '[]',
  resolution_status text DEFAULT 'open',
  resolution_notes text,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_philosophy_gaps_unique ON philosophy_gaps(dimension, value);

ALTER TABLE philosophy_gaps ENABLE ROW LEVEL SECURITY;

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


-- ── module_version_history ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS module_version_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id text NOT NULL REFERENCES philosophy_modules(id),
  old_version text NOT NULL,
  new_version text NOT NULL,
  change_description text NOT NULL,
  changed_by text DEFAULT 'manual',
  changed_at timestamptz DEFAULT now()
);

ALTER TABLE module_version_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read version history"
  ON module_version_history FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can insert version history"
  ON module_version_history FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ── generated_plans ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS generated_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  plan_data jsonb NOT NULL,
  philosophy_module_ids text[] NOT NULL,
  module_versions jsonb NOT NULL,
  generation_source text NOT NULL,
  plan_version text DEFAULT '1.0',
  assumptions text[] DEFAULT '{}',
  validation_flags text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  is_outdated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_plans_user ON generated_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_plans_active ON generated_plans(user_id, is_active);

ALTER TABLE generated_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own plans"
  ON generated_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plans"
  ON generated_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plans"
  ON generated_plans FOR UPDATE USING (auth.uid() = user_id);


-- ── user_outcomes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  plan_id uuid REFERENCES generated_plans(id),
  week_number int,
  sessions_planned int,
  sessions_completed int,
  difficulty_rating text,
  energy_level text,
  sleep_quality text,
  soreness_level text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_outcomes_user ON user_outcomes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_outcomes_plan ON user_outcomes(plan_id);

ALTER TABLE user_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own outcomes"
  ON user_outcomes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own outcomes"
  ON user_outcomes FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ── ai_usage (rate limiting for AI proxy) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  request_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, usage_date)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai_usage" ON ai_usage;
CREATE POLICY "Users can view own ai_usage"
  ON ai_usage FOR SELECT USING (auth.uid() = user_id);


-- ── Module effectiveness report function ───────────────────────────────────

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


-- ============================================================================
-- Done! Verify tables in the Table Editor, then run seedReferenceData() in
-- the browser console to populate philosophy_modules and exercise_library.
-- ============================================================================
