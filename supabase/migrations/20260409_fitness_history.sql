-- Fitness History Migration
-- Added by PHILOSOPHY_UPDATE_2026-04-09_threshold_weeks.md
-- Stores VDOT/FTP/CSS/LTHR/HR snapshots so threshold-week tests have a trendline.

CREATE TABLE IF NOT EXISTS fitness_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sport TEXT NOT NULL CHECK (sport IN ('run', 'bike', 'swim')),
  metric_type TEXT NOT NULL CHECK (metric_type IN ('vdot', 'ftp_watts', 'css_sec_per_100m', 'lthr', 'max_hr', 'resting_hr')),
  value NUMERIC NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('threshold_week_test', 'manual_entry', 'race_result', 'imported')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fitness_history_user_sport_idx
  ON fitness_history(user_id, sport, recorded_at DESC);

ALTER TABLE fitness_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own fitness history"
  ON fitness_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fitness history"
  ON fitness_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);
