-- Philosophy Engine Schema Migration
-- IronZ Philosophy Engine v1.0
-- Created: 2026-04-07

-- Philosophy Modules (the brain of the app)
CREATE TABLE philosophy_modules (
  id TEXT PRIMARY KEY,                    -- e.g., 'LEVEL_BEGINNER'
  category TEXT NOT NULL,                 -- e.g., 'athlete_level', 'sport_profile', 'goal'
  title TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  applies_when JSONB NOT NULL,            -- conditions for retrieval
  principles TEXT[] DEFAULT '{}',
  plan_rules TEXT[] DEFAULT '{}',
  hard_constraints TEXT[] DEFAULT '{}',
  nutrition_rules TEXT[] DEFAULT '{}',
  training_adjustments TEXT[] DEFAULT '{}',
  coaching_tone TEXT,
  evidence_sources TEXT[] DEFAULT '{}',
  rationale TEXT,
  priority TEXT DEFAULT 'medium',         -- high / medium / low
  is_active BOOLEAN DEFAULT TRUE,
  change_log TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_philosophy_modules_category ON philosophy_modules(category);
CREATE INDEX idx_philosophy_modules_applies_when ON philosophy_modules USING GIN(applies_when);

-- Generated Plans (every plan the app creates)
CREATE TABLE generated_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  plan_data JSONB NOT NULL,               -- full structured JSON plan (Section 8 schema)
  philosophy_module_ids TEXT[] NOT NULL,   -- which modules were used
  module_versions JSONB NOT NULL,          -- version of each module at generation time
  generation_source TEXT NOT NULL,         -- 'rules_engine' | 'ai_assisted' | 'gap_fallback'
  plan_version TEXT DEFAULT '1.0',
  assumptions TEXT[] DEFAULT '{}',
  validation_flags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  is_outdated BOOLEAN DEFAULT FALSE,      -- flagged when source modules are updated
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_generated_plans_user ON generated_plans(user_id);
CREATE INDEX idx_generated_plans_active ON generated_plans(user_id, is_active);

-- User Outcomes (feedback loop data)
CREATE TABLE user_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  plan_id UUID REFERENCES generated_plans(id),
  week_number INT,
  sessions_planned INT,
  sessions_completed INT,
  difficulty_rating TEXT,                 -- too_easy / just_right / too_hard
  energy_level TEXT,                      -- low / moderate / high
  sleep_quality TEXT,                     -- poor / fair / good
  soreness_level TEXT,                    -- none / mild / moderate / severe
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_outcomes_user ON user_outcomes(user_id);
CREATE INDEX idx_user_outcomes_plan ON user_outcomes(plan_id);

-- Philosophy Gaps (tracks where the doc is missing coverage)
CREATE TABLE philosophy_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension TEXT NOT NULL,                -- e.g., 'sport_profile', 'event_specific'
  value TEXT NOT NULL,                    -- e.g., 'rowing', 'pickleball'
  user_count INT DEFAULT 1,              -- how many users hit this gap
  sample_user_profiles JSONB DEFAULT '[]',
  resolution_status TEXT DEFAULT 'open',  -- open / in_progress / resolved
  resolution_notes TEXT,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_philosophy_gaps_unique ON philosophy_gaps(dimension, value);

-- Exercise Library (needed by rules engine for deterministic plan assembly)
CREATE TABLE exercise_library (
  id TEXT PRIMARY KEY,                    -- e.g., 'barbell_back_squat'
  name TEXT NOT NULL,
  movement_pattern TEXT NOT NULL,         -- squat / hinge / push / pull / carry / core / isolation
  muscle_groups TEXT[] NOT NULL,
  equipment_required TEXT[] DEFAULT '{}',
  difficulty TEXT NOT NULL,               -- beginner / intermediate / advanced
  tier INT NOT NULL,                      -- 1 = primary compound, 2 = secondary compound, 3 = accessory
  sport_relevance TEXT[] DEFAULT '{}',
  contraindications TEXT[] DEFAULT '{}',
  substitutions TEXT[] DEFAULT '{}',
  default_rep_range TEXT,
  default_rest_seconds INT,
  instructions TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exercise_library_pattern ON exercise_library(movement_pattern);
CREATE INDEX idx_exercise_library_equipment ON exercise_library USING GIN(equipment_required);
CREATE INDEX idx_exercise_library_tier ON exercise_library(tier);

-- Module Version History (audit trail)
CREATE TABLE module_version_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id TEXT NOT NULL REFERENCES philosophy_modules(id),
  old_version TEXT NOT NULL,
  new_version TEXT NOT NULL,
  change_description TEXT NOT NULL,
  changed_by TEXT DEFAULT 'manual',       -- 'manual' | 'sync_pipeline'
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE generated_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own plans" ON generated_plans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own plans" ON generated_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own plans" ON generated_plans
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own outcomes" ON user_outcomes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own outcomes" ON user_outcomes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Philosophy modules are public read (no auth needed)
ALTER TABLE philosophy_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active modules" ON philosophy_modules
  FOR SELECT USING (is_active = true);

-- Exercise library is public read
ALTER TABLE exercise_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read exercises" ON exercise_library
  FOR SELECT USING (is_active = true);

-- Gaps are admin-only but allow inserts from authenticated users
ALTER TABLE philosophy_gaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can insert gaps" ON philosophy_gaps
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Module effectiveness report function
CREATE OR REPLACE FUNCTION module_effectiveness_report()
RETURNS TABLE (
  module_id TEXT,
  plan_count BIGINT,
  avg_difficulty_score NUMERIC,
  avg_completion_rate NUMERIC,
  avg_energy NUMERIC
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
      THEN uo.sessions_completed::NUMERIC / uo.sessions_planned
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
