-- 2026-05-01 — Expand coach SELECT allowlist for Training Inputs tab
--
-- The Active Training Inputs the athlete sees on their home screen
-- are derived from a handful of localStorage keys mirrored to user_data.
-- The 20260428b coach SELECT policy covers most of them (events,
-- raceEvents, thresholds, strengthSetup, selectedSports, trainingGoals)
-- but omitted three that the athlete view also reads:
--
--   strengthRole       — hybrid athlete's strength role (injury_prevention
--                        / race_performance / general / minimal). Drives
--                        rep ranges + exercise bias in the planner.
--   buildPlanTemplate  — the day-of-week → sport-bucket map saved at
--                        bp-v2-5 (Weekly Schedule). The plan generator
--                        consumes it via race.preferences.weeklyTemplate.
--   longDays           — { longRun, longRide } day-of-week picks from
--                        bp-v2-4b (Long Days).
--
-- Without these in the allowlist the coach's Training Inputs tab would
-- render an empty / partial training summary even though every other
-- input is fetched. RLS posture stays read-only — coach UPDATE is still
-- limited to the nutrition/hydration/fueling keys (see policy 4 in
-- 20260428b). Edit + delete write paths land in PR 3 and PR 4 with
-- their own SECURITY DEFINER RPCs.

DROP POLICY IF EXISTS "Coaches can view permitted client user_data" ON public.user_data;

CREATE POLICY "Coaches can view permitted client user_data"
  ON public.user_data
  FOR SELECT
  USING (
    public.is_coaching(auth.uid(), user_id)
    AND (
      data_key IN (
        'workouts', 'workoutSchedule', 'trainingPlan',
        'completedSessions', 'workoutRatings',
        'personalRecords', 'trainingZones', 'trainingZonesHistory',
        'trainingPreferences', 'trainingNotes',
        'dayRestrictions', 'equipmentRestrictions', 'equipmentProfile',
        'events', 'raceEvents', 'thresholds', 'strengthSetup',
        'strengthRole', 'buildPlanTemplate', 'longDays',
        'workoutEffortFeedback', 'calibrationSignals',
        'activePlan', 'activePlanAt', 'activePlanSource', 'activePlanId',
        'currentRecoveryState', 'latestCheckIn', 'checkinHistory',
        'userLevel', 'fitnessGoals', 'selectedSports', 'trainingGoals',
        'gear_checklists_v1', 'completedChallenges', 'activeChallenges',
        'importedPlans', 'gymStrengthEnabled', 'measurementSystem',
        'injuries',
        'nutritionEnabled', 'hydrationEnabled', 'fuelingEnabled'
      )
      OR
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
