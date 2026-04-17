/**
 * IronZ Rule Engine — Chunk 1: Athlete Classifier
 *
 * Pure classification logic. Derives level, riskBias, ageGroup, equipment,
 * weakness, and recovery state from profile data. No UI, no localStorage
 * writes. See sources-of-truth/TRAINING_PHILOSOPHY.md §2 and
 * sources-of-truth/RULE_ENGINE_SPEC.md Step 1.
 */
(function () {
  'use strict';

  const LBS_PER_KG = 2.20462;

  const SPORT_LEVEL_RANK = {
    // swim uses novice / intermediate / competitive
    novice: 0, intermediate: 1, competitive: 2,
    // cycling/running use beginner / intermediate / advanced
    beginner: 0, advanced: 2,
  };

  const RISK_BIAS_BY_LEVEL = {
    beginner: 'safety-first',
    intermediate: 'balanced',
    advanced: 'performance-first',
  };

  // Map swim "novice/competitive" to overall "beginner/advanced" equivalents
  // for cross-sport level comparison.
  const SWIM_TO_OVERALL = {
    novice: 'beginner',
    intermediate: 'intermediate',
    competitive: 'advanced',
  };

  function classifyAgeGroup(age) {
    if (age == null || isNaN(age)) return '18-29';
    if (age < 30) return '18-29';
    if (age < 40) return '30-39';
    if (age < 50) return '40-49';
    if (age < 60) return '50-59';
    return '60+';
  }

  function deriveSwimLevel(cssPer100m) {
    if (cssPer100m == null || isNaN(cssPer100m)) return 'intermediate';
    if (cssPer100m > 150) return 'novice';
    if (cssPer100m < 105) return 'competitive';
    return 'intermediate';
  }

  function deriveCyclingLevel(ftpWatts, weightLbs) {
    if (ftpWatts == null || isNaN(ftpWatts) || !weightLbs) return 'intermediate';
    const kg = weightLbs / LBS_PER_KG;
    if (kg <= 0) return 'intermediate';
    const wPerKg = ftpWatts / kg;
    if (wPerKg < 2.0) return 'beginner';
    if (wPerKg > 3.5) return 'advanced';
    return 'intermediate';
  }

  function deriveRunLevel(thresholdMinPerMile) {
    if (thresholdMinPerMile == null || isNaN(thresholdMinPerMile)) return 'intermediate';
    if (thresholdMinPerMile > 10.0) return 'beginner';
    if (thresholdMinPerMile < 7.5) return 'advanced';
    return 'intermediate';
  }

  function deriveOverallLevel(sportLevels) {
    const normalized = [];
    if (sportLevels.swim) normalized.push(SWIM_TO_OVERALL[sportLevels.swim] || sportLevels.swim);
    if (sportLevels.cycling) normalized.push(sportLevels.cycling);
    if (sportLevels.running) normalized.push(sportLevels.running);
    if (normalized.length === 0) return 'intermediate';
    let maxRank = -1;
    let maxLevel = 'intermediate';
    for (const lvl of normalized) {
      const rank = SPORT_LEVEL_RANK[lvl];
      if (rank != null && rank > maxRank) {
        maxRank = rank;
        maxLevel = lvl;
      }
    }
    return maxLevel;
  }

  function getRiskBias(level) {
    return RISK_BIAS_BY_LEVEL[level] || 'balanced';
  }

  function classifyEquipment(equipmentTokens) {
    if (!Array.isArray(equipmentTokens) || equipmentTokens.length === 0) return 'full_gym';
    const set = new Set(equipmentTokens);
    const onlyBodyweight = set.size === 1 && set.has('bodyweight');
    if (onlyBodyweight) return 'bodyweight';
    const hasBarbell = set.has('barbell-rack') || set.has('smith-machine') || set.has('cable-machine');
    const hasHomeKit = set.has('dumbbells') && (set.has('pull-up-bar') || set.has('bench') || set.has('band'));
    if (hasBarbell) return 'full_gym';
    if (hasHomeKit) return 'home_gym';
    if (set.has('dumbbells')) return 'dumbbells';
    return 'home_gym';
  }

  function detectWeakness(sportLevels) {
    const entries = [];
    if (sportLevels.swim) entries.push({ discipline: 'swim', rank: SPORT_LEVEL_RANK[sportLevels.swim] });
    if (sportLevels.cycling) entries.push({ discipline: 'bike', rank: SPORT_LEVEL_RANK[sportLevels.cycling] });
    if (sportLevels.running) entries.push({ discipline: 'run', rank: SPORT_LEVEL_RANK[sportLevels.running] });
    if (entries.length < 2) return { weakestDiscipline: 'none', biasApplied: 'none' };
    entries.sort((a, b) => a.rank - b.rank);
    const lowest = entries[0];
    const next = entries[1];
    if (next.rank === lowest.rank) {
      return { weakestDiscipline: 'none', biasApplied: 'none' };
    }
    return { weakestDiscipline: lowest.discipline, biasApplied: 'none' };
  }

  function deriveRecoveryState(latestCheckIn) {
    if (!latestCheckIn) return 'good';
    if (typeof latestCheckIn === 'string') {
      const v = latestCheckIn.toLowerCase();
      if (v === 'good' || v === 'moderate' || v === 'low') return v;
      return 'good';
    }
    if (latestCheckIn.recoveryState) {
      const v = String(latestCheckIn.recoveryState).toLowerCase();
      if (v === 'good' || v === 'moderate' || v === 'low') return v;
    }
    // Fall back to deriving from sleep/energy/soreness scores (1-5 scale each)
    const sleep = Number(latestCheckIn.sleepQuality);
    const energy = Number(latestCheckIn.energyLevel);
    const soreness = Number(latestCheckIn.soreness);
    if ([sleep, energy, soreness].every(n => !isNaN(n))) {
      const score = (sleep + energy + (6 - soreness)) / 3;
      if (score >= 4) return 'good';
      if (score >= 2.5) return 'moderate';
      return 'low';
    }
    return 'good';
  }

  function deriveSportProfile(profile, sportLevels) {
    if (profile.sportProfile) return profile.sportProfile;
    const selected = profile.selectedSports;
    if (Array.isArray(selected) && selected.length > 0) {
      const set = new Set(selected.map(s => String(s).toLowerCase()));
      const hasSwim = set.has('swim') || set.has('swimming');
      const hasBike = set.has('bike') || set.has('cycling');
      const hasRun = set.has('run') || set.has('running');
      const hasStrength = set.has('strength') || set.has('lifting');
      if (hasSwim && hasBike && hasRun) return 'triathlon';
      if ((hasSwim || hasBike || hasRun) && hasStrength) return 'hybrid';
      if (hasRun || hasBike || hasSwim) return 'endurance';
      if (hasStrength) return 'strength';
    }
    const hasCss = profile.cssTime != null;
    const hasFtp = profile.ftp != null;
    const hasRunThreshold = profile.thresholdPace != null;
    if (hasCss && hasFtp && hasRunThreshold) return 'triathlon';
    if ([hasCss, hasFtp, hasRunThreshold].filter(Boolean).length >= 2) return 'endurance';
    if (hasRunThreshold || hasCss || hasFtp) return 'endurance';
    return 'general_fitness';
  }

  function mapGoal(goalRaw) {
    if (!goalRaw) return 'general_health';
    const g = String(goalRaw).toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
    if (g.includes('perform')) return 'performance';
    if (g.includes('muscle') || g.includes('bulk') || g.includes('gain')) return 'muscle_gain';
    if (g.includes('fat') || g.includes('weight') || g.includes('cut') || g.includes('loss')) return 'fat_loss';
    if (g.includes('return')) return 'return_to_training';
    if (g.includes('health') || g.includes('general')) return 'general_health';
    return 'general_health';
  }

  function pickNumber(...values) {
    for (const v of values) {
      if (v != null && !isNaN(Number(v))) return Number(v);
    }
    return null;
  }

  function classify(profile) {
    const p = profile || {};

    const age = pickNumber(p.age) ?? 30;
    const weight = pickNumber(p.weight, p.weightLbs);
    const height = pickNumber(p.height, p.heightIn);
    const gender = p.gender || 'not_specified';

    const cssTime = pickNumber(p.cssTime, p.css, p.cssPer100m);
    const ftp = pickNumber(p.ftp, p.ftpWatts);
    const thresholdPace = pickNumber(p.thresholdPace, p.runThresholdPace);
    const runVDOT = pickNumber(p.runVDOT, p.vdot);

    const sportLevels = {
      swim: deriveSwimLevel(cssTime),
      cycling: deriveCyclingLevel(ftp, weight),
      running: deriveRunLevel(thresholdPace),
    };

    const overallLevel = deriveOverallLevel(sportLevels);
    const riskBias = getRiskBias(overallLevel);
    const ageGroup = classifyAgeGroup(age);
    const goal = mapGoal(p.goal);

    const daysAvailable = pickNumber(p.availableDaysPerWeek, p.daysAvailable) ?? 3;
    const sessionDurationMin = pickNumber(p.sessionLength, p.sessionDurationMin) ?? 60;

    const equipmentProfile = Array.isArray(p.equipmentProfile) ? p.equipmentProfile.slice() : [];
    const injuries = Array.isArray(p.injuries) ? p.injuries.slice() : [];

    const recoveryState = deriveRecoveryState(p.latestCheckIn || p.recentCheckIn);
    const sportProfile = deriveSportProfile(p, sportLevels);
    const weaknessProfile = detectWeakness(sportLevels);

    const thresholds = {};
    if (runVDOT != null) thresholds.runVDOT = runVDOT;
    if (thresholdPace != null) thresholds.runThresholdPace = thresholdPace;
    if (ftp != null) thresholds.ftp = ftp;
    if (ftp != null && weight != null && weight > 0) {
      thresholds.ftpWPerKg = Math.round((ftp / (weight / LBS_PER_KG)) * 100) / 100;
    }
    if (cssTime != null) thresholds.css = cssTime;

    return {
      age,
      ageGroup,
      level: overallLevel,
      sportLevels,
      riskBias,
      goal,
      sportProfile,
      daysAvailable,
      sessionDurationMin,
      thresholds,
      equipmentProfile,
      equipmentAccess: classifyEquipment(equipmentProfile),
      weaknessProfile,
      injuries,
      recoveryState,
      weight: weight,
      height: height,
      gender,
    };
  }

  window.AthleteClassifier = {
    classify,
    deriveSwimLevel,
    deriveCyclingLevel,
    deriveRunLevel,
    deriveOverallLevel,
    getRiskBias,
    classifyAgeGroup,
    classifyEquipment,
    detectWeakness,
    deriveRecoveryState,
  };
})();
