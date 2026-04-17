/**
 * IronZ Rule Engine — Chunk 2: Session Assembler
 *
 * Fills each week of the arc with sessions, applies global intensity
 * constraints, selects exercises for strength slots, handles deload weeks
 * and B-race micro-tapers. Consumes classification + arc from chunk 1.
 * See sources-of-truth/RULE_ENGINE_SPEC.md Steps 3–7 and
 * sources-of-truth/TRAINING_PHILOSOPHY.md §4.3, §5, §6, §7, §8, §9.
 */
(function () {
  'use strict';

  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // TRAINING_PHILOSOPHY §4.3
  const INTENSITY_CAPS = { beginner: 1, intermediate: 2, advanced: 3 };

  // TRAINING_PHILOSOPHY §8.4 — strength frequency by phase (endurance plans)
  const STRENGTH_FREQUENCY = {
    'pre-base': 2,
    base: 2,
    build: 1,
    peak: 1,
    taper: 0,
    'race-week': 0,
  };

  // TRAINING_PHILOSOPHY §8.1 — split design by strength frequency + level
  const STRENGTH_SPLIT = {
    beginner:     { 2: 'full_body', 3: 'full_body',  4: 'upper_lower', 5: 'upper_lower', 6: 'ppl' },
    intermediate: { 2: 'full_body', 3: 'upper_lower', 4: 'upper_lower', 5: 'ppl', 6: 'ppl' },
    advanced:     { 2: 'full_body', 3: 'upper_lower', 4: 'ppl', 5: 'ppl', 6: 'ppl' },
  };

  // Session distribution templates (TRAINING_PHILOSOPHY §6.1 / §6.2).
  // priority: 'long' (protected), 'intensity' (Z4+, counts vs cap), 'aerobic', 'strength', 'brick'.
  const TRIATHLON_TEMPLATES = {
    'pre-base': [
      { type: 'swim', subtype: 'technique', priority: 'aerobic' },
      { type: 'bike', subtype: 'z2_endurance', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    base: [
      { type: 'swim', subtype: 'technique', priority: 'aerobic' },
      { type: 'swim', subtype: 'endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'z2_endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'long_ride', priority: 'long' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    build: [
      { type: 'swim', subtype: 'technique', priority: 'aerobic' },
      { type: 'swim', subtype: 'css_intervals', priority: 'intensity' },
      { type: 'swim', subtype: 'endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'z2_endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'sweet_spot', priority: 'intensity' },
      { type: 'bike', subtype: 'long_ride', priority: 'long' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'tempo', priority: 'intensity' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'sport_specific', priority: 'strength' },
    ],
    peak: [
      { type: 'swim', subtype: 'technique', priority: 'aerobic' },
      { type: 'swim', subtype: 'race_pace', priority: 'intensity' },
      { type: 'swim', subtype: 'endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'z2_endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'race_pace', priority: 'intensity' },
      { type: 'bike', subtype: 'long_ride', priority: 'long' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'race_pace', priority: 'intensity' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'sport_specific', priority: 'strength' },
      { type: 'brick', subtype: 'bike_to_run', priority: 'brick' },
    ],
    taper: [
      { type: 'swim', subtype: 'technique', priority: 'aerobic' },
      { type: 'swim', subtype: 'short_race_pace', priority: 'intensity' },
      { type: 'bike', subtype: 'easy', priority: 'aerobic' },
      { type: 'bike', subtype: 'short_opener', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'short_opener', priority: 'aerobic' },
    ],
    'race-week': [
      { type: 'swim', subtype: 'openers', priority: 'aerobic' },
      { type: 'bike', subtype: 'short_with_strides', priority: 'aerobic' },
      { type: 'run', subtype: 'short_with_strides', priority: 'aerobic' },
    ],
  };

  const RUNNING_TEMPLATES = {
    'pre-base': [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    base: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'cross-training', subtype: 'optional', priority: 'aerobic' },
    ],
    build: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'tempo', priority: 'intensity' },
      { type: 'run', subtype: 'intervals', priority: 'intensity' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    peak: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'race_pace', priority: 'intensity' },
      { type: 'run', subtype: 'intervals', priority: 'intensity' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    taper: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'short_race_pace', priority: 'intensity' },
    ],
    'race-week': [
      { type: 'run', subtype: 'short_with_strides', priority: 'aerobic' },
      { type: 'run', subtype: 'short_opener', priority: 'aerobic' },
    ],
  };

  // Philosophy §4.5 + §6.2 — Running distance-specific session overrides
  // applied to Build/Peak templates. Keyed by race distance; replaces or
  // augments the generic run template.
  const RUNNING_DISTANCE_OVERRIDES = {
    '5k': {
      build: [
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'easy_with_strides', priority: 'aerobic' },
        { type: 'run', subtype: 'vo2max_intervals', priority: 'intensity' },
        { type: 'run', subtype: 'tempo', priority: 'intensity' },
        { type: 'run', subtype: 'long_run', priority: 'long' },
        { type: 'strength', subtype: 'full_body', priority: 'strength' },
      ],
      peak: [
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'easy_with_strides', priority: 'aerobic' },
        { type: 'run', subtype: 'vo2max_intervals', priority: 'intensity' },
        { type: 'run', subtype: 'race_pace_5k', priority: 'intensity' },
        { type: 'run', subtype: 'long_run', priority: 'long' },
        { type: 'strength', subtype: 'full_body', priority: 'strength' },
      ],
    },
    '10k': {
      build: [
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'cruise_intervals', priority: 'intensity' },
        { type: 'run', subtype: 'long_intervals', priority: 'intensity' },
        { type: 'run', subtype: 'long_run_progressive', priority: 'long' },
        { type: 'strength', subtype: 'full_body', priority: 'strength' },
      ],
      peak: [
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'cruise_intervals', priority: 'intensity' },
        { type: 'run', subtype: 'race_pace_10k', priority: 'intensity' },
        { type: 'run', subtype: 'long_run_progressive', priority: 'long' },
        { type: 'strength', subtype: 'full_body', priority: 'strength' },
      ],
    },
    'half-marathon': {
      build: [
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'tempo', priority: 'intensity' },
        { type: 'run', subtype: 'mp_progression', priority: 'intensity' },
        { type: 'run', subtype: 'mp_long_run', priority: 'long' },
        { type: 'strength', subtype: 'full_body', priority: 'strength' },
      ],
      peak: [
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'tempo', priority: 'intensity' },
        { type: 'run', subtype: 'race_pace_half', priority: 'intensity' },
        { type: 'run', subtype: 'mp_long_run', priority: 'long' },
        { type: 'strength', subtype: 'full_body', priority: 'strength' },
      ],
    },
    'marathon': {
      build: [
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'medium_long_run', priority: 'aerobic' },
        { type: 'run', subtype: 'progressive_tempo', priority: 'intensity' },
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'mp_long_run', priority: 'long' },
        { type: 'strength', subtype: 'full_body', priority: 'strength' },
      ],
      peak: [
        { type: 'run', subtype: 'easy', priority: 'aerobic' },
        { type: 'run', subtype: 'medium_long_run', priority: 'aerobic' },
        { type: 'run', subtype: 'progressive_tempo', priority: 'intensity' },
        { type: 'run', subtype: 'race_pace_marathon', priority: 'intensity' },
        { type: 'run', subtype: 'mp_long_run', priority: 'long' },
        { type: 'strength', subtype: 'full_body', priority: 'strength' },
      ],
    },
  };

  // Philosophy §6.3 — Hyrox session distribution by phase
  const HYROX_TEMPLATES = {
    'pre-base': [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'strength', subtype: 'hyrox_heavy', priority: 'strength' },
      { type: 'strength', subtype: 'hyrox_heavy', priority: 'strength' },
    ],
    base: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'strength', subtype: 'hyrox_heavy', priority: 'strength' },
      { type: 'strength', subtype: 'hyrox_heavy', priority: 'strength' },
      { type: 'hyrox', subtype: 'station_practice', priority: 'strength' },
      { type: 'cross-training', subtype: 'cardio', priority: 'aerobic' },
    ],
    build: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'hyrox_intervals', priority: 'intensity' },
      { type: 'hyrox', subtype: 'run_station_combo', priority: 'intensity' },
      { type: 'hyrox', subtype: 'station_circuit', priority: 'intensity' },
      { type: 'strength', subtype: 'hyrox_endurance', priority: 'strength' },
      { type: 'strength', subtype: 'hyrox_endurance', priority: 'strength' },
    ],
    peak: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'hyrox', subtype: 'race_pace_combo', priority: 'intensity' },
      { type: 'run', subtype: 'hyrox_intervals', priority: 'intensity' },
      { type: 'hyrox', subtype: 'station_circuit', priority: 'intensity' },
      { type: 'strength', subtype: 'hyrox_maintenance', priority: 'strength' },
    ],
    taper: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'hyrox', subtype: 'short_opener_combo', priority: 'intensity' },
    ],
    'race-week': [
      { type: 'run', subtype: 'short_with_strides', priority: 'aerobic' },
      { type: 'hyrox', subtype: 'short_opener_combo', priority: 'aerobic' },
    ],
  };

  // Philosophy §6.5 — Goal-based session distribution templates for
  // rolling mesocycle plans. These ignore phase; "mesocycle" reads them.
  const GOAL_MESOCYCLE_TEMPLATES = {
    speed_performance: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'tempo', priority: 'intensity' },
      { type: 'run', subtype: 'intervals', priority: 'intensity' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    endurance: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'bike', subtype: 'long_ride', priority: 'long' },
      { type: 'run', subtype: 'tempo', priority: 'intensity' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    fat_loss: [
      // Strength fills first — §2.5 critical rule.
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'circuit', subtype: 'hiit', priority: 'intensity' },
    ],
    general_fitness: [
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'bike', subtype: 'z2_endurance', priority: 'aerobic' },
      { type: 'cross-training', subtype: 'cardio', priority: 'aerobic' },
    ],
  };

  // Fallback templates for sport profiles that aren't pure endurance.
  // Strength-dominant and general-fitness users get strength frequency
  // from days available rather than phase.
  function buildGeneralTemplate(classification, phase) {
    const days = classification.daysAvailable || 3;
    const level = classification.level || 'intermediate';
    const freqMap = STRENGTH_SPLIT[level] || STRENGTH_SPLIT.intermediate;
    const split = freqMap[Math.max(2, Math.min(6, days))] || 'full_body';
    const strengthCount = Math.max(2, Math.min(days - 1, 5));
    const sessions = [];
    if (split === 'ppl') {
      const rotation = ['push_day', 'pull_day', 'leg_day'];
      for (let i = 0; i < strengthCount; i++) {
        sessions.push({ type: 'strength', subtype: rotation[i % 3], priority: 'strength' });
      }
    } else if (split === 'upper_lower') {
      const rotation = ['upper_body', 'lower_body'];
      for (let i = 0; i < strengthCount; i++) {
        sessions.push({ type: 'strength', subtype: rotation[i % 2], priority: 'strength' });
      }
    } else {
      for (let i = 0; i < strengthCount; i++) {
        sessions.push({ type: 'strength', subtype: 'full_body', priority: 'strength' });
      }
    }
    // Add light cardio for general fitness
    if (classification.sportProfile !== 'strength') {
      sessions.push({ type: 'cross-training', subtype: 'cardio', priority: 'aerobic' });
    }
    // During peak/taper phases, reduce one session
    if (phase === 'taper' || phase === 'race-week') {
      return sessions.slice(0, Math.max(2, sessions.length - 1));
    }
    return sessions;
  }

  // TRAINING_PHILOSOPHY §7.5 — slot templates keyed by strength subtype.
  // Each slot gets turned into an ExerciseDB.pick() call.
  const STRENGTH_SLOT_TEMPLATES = {
    push_day: [
      { role: 'main-horizontal-push', pattern: 'horizontal-push', tier: ['primary'] },
      { role: 'main-vertical-push', pattern: 'vertical-push', tier: ['primary'] },
      { role: 'secondary-horizontal-push', pattern: 'horizontal-push', tier: ['secondary'], diverseFromSlot: 0 },
      { role: 'accessory-vertical-push', pattern: 'vertical-push', tier: ['secondary', 'tertiary'], diverseFromSlot: 1 },
      { role: 'isolation-triceps', pattern: 'isolation-arms', specificGoal: 'triceps' },
    ],
    pull_day: [
      { role: 'main-horizontal-pull', pattern: 'horizontal-pull', tier: ['primary'] },
      { role: 'main-vertical-pull', pattern: 'vertical-pull', tier: ['primary'] },
      { role: 'secondary-horizontal-pull', pattern: 'horizontal-pull', tier: ['secondary'], diverseFromSlot: 0 },
      { role: 'accessory-vertical-pull', pattern: 'vertical-pull', tier: ['secondary', 'tertiary'], diverseFromSlot: 1 },
      { role: 'isolation-biceps', pattern: 'isolation-arms', specificGoal: 'biceps' },
    ],
    leg_day: [
      { role: 'main-squat', pattern: 'squat', tier: ['primary'] },
      { role: 'main-hinge', pattern: 'hinge', tier: ['primary'] },
      { role: 'secondary-squat', pattern: 'squat', tier: ['secondary'], diverseFromSlot: 0 },
      { role: 'accessory-hinge', pattern: 'hinge', tier: ['secondary', 'tertiary'], diverseFromSlot: 1 },
      { role: 'leg-isolation', pattern: 'isolation-legs', tier: ['secondary', 'tertiary'] },
    ],
    full_body: [
      { role: 'squat', pattern: 'squat', tier: ['primary'] },
      { role: 'hinge', pattern: 'hinge', tier: ['primary'] },
      { role: 'horizontal-push', pattern: 'horizontal-push', tier: ['primary', 'secondary'] },
      { role: 'horizontal-pull', pattern: 'horizontal-pull', tier: ['primary', 'secondary'] },
      { role: 'core-or-carry', pattern: ['core', 'carry'], tier: ['secondary', 'tertiary'] },
    ],
    upper_body: [
      { role: 'horizontal-push', pattern: 'horizontal-push', tier: ['primary'] },
      { role: 'vertical-push', pattern: 'vertical-push', tier: ['primary'] },
      { role: 'horizontal-pull', pattern: 'horizontal-pull', tier: ['primary'] },
      { role: 'vertical-pull', pattern: 'vertical-pull', tier: ['primary'] },
      { role: 'arms-isolation', pattern: 'isolation-arms', tier: ['secondary', 'tertiary'] },
    ],
    lower_body: [
      { role: 'squat', pattern: 'squat', tier: ['primary'] },
      { role: 'hinge', pattern: 'hinge', tier: ['primary'] },
      { role: 'leg-isolation-1', pattern: 'isolation-legs', tier: ['secondary', 'tertiary'] },
      { role: 'leg-isolation-2', pattern: 'isolation-legs', tier: ['secondary', 'tertiary'], diverseFromSlot: 2 },
    ],
    // For endurance athletes — same-day pairings (TRAINING_PHILOSOPHY §8.5)
    sport_specific: [
      { role: 'compound-1', pattern: ['squat', 'hinge', 'horizontal-push', 'horizontal-pull'], tier: ['primary'] },
      { role: 'compound-2', pattern: ['squat', 'hinge', 'horizontal-push', 'horizontal-pull'], tier: ['primary', 'secondary'], diverseFromSlot: 0 },
      { role: 'core-stability', pattern: 'core', tier: ['secondary', 'tertiary'] },
      { role: 'accessory', pattern: ['isolation-legs', 'isolation-arms'], tier: ['secondary', 'tertiary'] },
    ],
    // TRAINING_PHILOSOPHY §8.6 — same-day cardio + strength pairings.
    // Subtype is assigned by placeStrengthWithPairing based on which
    // cardio type the strength session ends up paired with.
    pair_run_core_hip: [
      { role: 'hip-hinge', pattern: 'hinge', tier: ['primary', 'secondary'] },
      { role: 'single-leg-squat', pattern: 'squat', tier: ['secondary', 'tertiary'] },
      { role: 'calf-raise', pattern: 'isolation-legs', specificGoal: 'calves' },
      { role: 'glute-med', pattern: 'isolation-legs', specificGoal: 'glute-medius' },
      { role: 'core-anti-rot', pattern: 'core', specificGoal: 'anti-rotation' },
    ],
    pair_swim_pull_core: [
      { role: 'vertical-pull', pattern: 'vertical-pull', tier: ['primary'] },
      { role: 'horizontal-pull', pattern: 'horizontal-pull', tier: ['primary'] },
      { role: 'rear-delt-scap', pattern: 'horizontal-pull', tier: ['secondary', 'tertiary'], specificGoal: 'rear-delts-scapular', diverseFromSlot: 1 },
      { role: 'tricep-isolation', pattern: 'isolation-arms', specificGoal: 'triceps' },
      { role: 'core-anti-rot', pattern: 'core', specificGoal: 'anti-rotation' },
    ],
    pair_bike_legs_posterior: [
      { role: 'main-squat', pattern: 'squat', tier: ['primary'] },
      { role: 'main-hinge', pattern: 'hinge', tier: ['primary'] },
      { role: 'calf-raise', pattern: 'isolation-legs', specificGoal: 'calves' },
      { role: 'glute-hinge', pattern: 'isolation-legs', specificGoal: 'glutes-hip-extension' },
      { role: 'core-stability', pattern: 'core', specificGoal: 'core-stability' },
    ],
    pair_rest_upper: [
      { role: 'horizontal-push', pattern: 'horizontal-push', tier: ['primary'] },
      { role: 'vertical-push', pattern: 'vertical-push', tier: ['primary'] },
      { role: 'horizontal-pull', pattern: 'horizontal-pull', tier: ['primary'] },
      { role: 'vertical-pull', pattern: 'vertical-pull', tier: ['primary'] },
      { role: 'arms-isolation', pattern: 'isolation-arms', tier: ['secondary', 'tertiary'] },
    ],
    // Philosophy §9.5 — Hyrox strength shifts across phases.
    // Base: heavy compounds (3-4×6-8).
    hyrox_heavy: [
      { role: 'squat-heavy', pattern: 'squat', tier: ['primary'] },
      { role: 'hinge-heavy', pattern: 'hinge', tier: ['primary'] },
      { role: 'pull-heavy', pattern: 'horizontal-pull', tier: ['primary'] },
      { role: 'press-heavy', pattern: ['vertical-push', 'horizontal-push'], tier: ['primary'] },
      { role: 'carry-lunge', pattern: ['carry', 'isolation-legs'], tier: ['secondary', 'tertiary'] },
    ],
    // Build: muscular endurance (3-4×12-16), station-specific biased.
    hyrox_endurance: [
      { role: 'lunge-loaded', pattern: 'isolation-legs', tier: ['primary', 'secondary'] },
      { role: 'squat-endurance', pattern: 'squat', tier: ['secondary'] },
      { role: 'pull-endurance', pattern: 'horizontal-pull', tier: ['secondary'] },
      { role: 'carry', pattern: 'carry', tier: ['primary', 'secondary', 'tertiary'] },
      { role: 'core-hip-flexor', pattern: 'core', tier: ['secondary', 'tertiary'] },
    ],
    // Peak/Taper: light maintenance.
    hyrox_maintenance: [
      { role: 'squat-light', pattern: 'squat', tier: ['primary', 'secondary'] },
      { role: 'hinge-light', pattern: 'hinge', tier: ['primary', 'secondary'] },
      { role: 'pull-light', pattern: 'horizontal-pull', tier: ['secondary'] },
    ],
  };

  // TRAINING_PHILOSOPHY §8.2 — sets/reps/rest by tier and level
  const SETS_REPS_REST = {
    primary: {
      beginner:     { sets: 3, reps: '8-12', restSeconds: 90 },
      intermediate: { sets: 4, reps: '6-10', restSeconds: 120 },
      advanced:     { sets: 4, reps: '3-8',  restSeconds: 150 },
    },
    secondary: {
      beginner:     { sets: 3, reps: '10-12', restSeconds: 75 },
      intermediate: { sets: 3, reps: '8-12',  restSeconds: 90 },
      advanced:     { sets: 4, reps: '6-12',  restSeconds: 120 },
    },
    tertiary: {
      beginner:     { sets: 2, reps: '12-15', restSeconds: 60 },
      intermediate: { sets: 3, reps: '10-15', restSeconds: 60 },
      advanced:     { sets: 3, reps: '10-15', restSeconds: 60 },
    },
  };

  // Preferred day slots per session kind. Used by placement heuristic.
  // 1=Mon, 7=Sun. Earlier entries are preferred; later entries are fallbacks.
  const DAY_PREFS = {
    long_run: [7, 6],
    long_ride: [6, 7],
    brick: [6, 7],
    intensity_run: [2, 4],
    intensity_bike: [4, 2],
    intensity_swim: [3, 2],
    strength_primary: [1, 4],
    strength_secondary: [4, 1],
    easy_run: [5, 3, 2],
    easy_bike: [3, 5],
    easy_swim: [2, 5, 3],
    other: [1, 3, 5, 2, 4, 6, 7],
  };

  function getSessionTemplate(sportProfile, phase, arc, classification) {
    // Rolling mesocycle: template is driven by goal, not phase.
    if (phase === 'mesocycle') {
      const goal = (arc && arc.goal) || (classification && classification.goal) || 'general_fitness';
      const map = GOAL_MESOCYCLE_TEMPLATES[goal] || GOAL_MESOCYCLE_TEMPLATES.general_fitness;
      return map.map(s => ({ ...s }));
    }

    if (sportProfile === 'triathlon') {
      const t = TRIATHLON_TEMPLATES[phase];
      return t ? t.map(s => ({ ...s })) : null;
    }

    if (sportProfile === 'hyrox') {
      const t = HYROX_TEMPLATES[phase];
      return t ? t.map(s => ({ ...s })) : null;
    }

    if (sportProfile === 'running' || sportProfile === 'endurance' || sportProfile === 'hybrid') {
      // Apply distance-specific override if available (Philosophy §6.2).
      const aRace = arc && Array.isArray(arc.races)
        ? (arc.races.find(r => r.priority === 'A') || arc.races[arc.races.length - 1])
        : null;
      const raceType = aRace && aRace.raceType;
      const override = raceType && RUNNING_DISTANCE_OVERRIDES[raceType];
      if (override && override[phase]) return override[phase].map(s => ({ ...s }));
      const t = RUNNING_TEMPLATES[phase];
      return t ? t.map(s => ({ ...s })) : null;
    }

    if (sportProfile === 'cycling') {
      // Cycling-only race plans reuse running templates with bike sessions.
      // (No dedicated cycling templates yet — conservative fallback.)
      return null;
    }

    return null;
  }

  function getWeeklyTimeBudget(weekNumber, arc, classification) {
    const ceiling = arc && arc.weeklyHoursCeiling ? arc.weeklyHoursCeiling : 10;
    const phase = getPhaseForWeek(weekNumber, arc);
    if (phase === 'mesocycle') {
      // Philosophy §4.9 — 3 progression weeks + 1 deload
      const mesocycleFactor = weekNumber === 1 ? 0.85
        : weekNumber === 2 ? 0.92
        : weekNumber === 3 ? 1.0
        : 0.50; // week 4 deload
      return Math.round(ceiling * mesocycleFactor * 60);
    }
    const phaseFactor = {
      'pre-base': 0.75,
      base: 1.0,
      build: 1.0,
      peak: 0.9,
      taper: 0.55,
      'race-week': 0.35,
    }[phase] || 1.0;
    return Math.round(ceiling * phaseFactor * 60);
  }

  function getPhaseForWeek(weekNumber, arc) {
    if (!arc || !Array.isArray(arc.phases)) return 'base';
    for (const p of arc.phases) {
      if (weekNumber >= p.startWeek && weekNumber <= p.endWeek) return p.phase;
    }
    return arc.phases[arc.phases.length - 1].phase;
  }

  function isDeloadWeek(weekNumber, level, phase, totalWeeks) {
    // Rolling mesocycle: week 4 is always the deload (Philosophy §4.9).
    if (phase === 'mesocycle') return weekNumber === 4;
    if (totalWeeks <= 4) return false;
    if (phase === 'taper' || phase === 'race-week') return false;
    // Advanced: every 3rd week; beginner/intermediate: every 4th week.
    const interval = level === 'advanced' ? 3 : 4;
    return weekNumber > 0 && weekNumber % interval === 0;
  }

  function areAdjacentDays(dayA, dayB) {
    if (dayA == null || dayB == null) return false;
    return Math.abs(dayA - dayB) === 1;
  }

  function parseIso(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  function weekDateRange(weekNumber, arc) {
    const start = parseIso(arc.startDate);
    if (!start) return null;
    const weekStart = new Date(start.getTime() + (weekNumber - 1) * 7 * MS_PER_DAY);
    const weekEnd = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
    return { start: weekStart, end: weekEnd };
  }

  function weekOverlapsBRace(weekNumber, arc) {
    const range = weekDateRange(weekNumber, arc);
    if (!range || !Array.isArray(arc.bRaceWindows)) return null;
    for (const w of arc.bRaceWindows) {
      const taper = parseIso(w.taperStartDate);
      const recovery = parseIso(w.recoveryEndDate);
      if (!taper || !recovery) continue;
      if (range.end >= taper && range.start <= recovery) return w;
    }
    return null;
  }

  // ── Placement ────────────────────────────────────────────────────────────

  function prefFor(session) {
    const { type, subtype, priority } = session;
    if (priority === 'long') {
      if (type === 'run') return DAY_PREFS.long_run;
      if (type === 'bike') return DAY_PREFS.long_ride;
    }
    if (priority === 'brick') return DAY_PREFS.brick;
    // Hyrox combo sessions belong on the weekend — they're the Hyrox
    // equivalent of a brick (long, high-stress, needs space around it).
    if (type === 'hyrox') {
      if (subtype === 'run_station_combo' || subtype === 'race_pace_combo') return DAY_PREFS.brick;
      if (subtype === 'station_circuit') return DAY_PREFS.intensity_run;
      if (subtype === 'short_opener_combo') return DAY_PREFS.intensity_run;
      return DAY_PREFS.other;
    }
    if (priority === 'intensity') {
      if (type === 'run') return DAY_PREFS.intensity_run;
      if (type === 'bike') return DAY_PREFS.intensity_bike;
      if (type === 'swim') return DAY_PREFS.intensity_swim;
    }
    if (type === 'strength') {
      return subtype && subtype.startsWith('secondary') ? DAY_PREFS.strength_secondary : DAY_PREFS.strength_primary;
    }
    if (type === 'run') return DAY_PREFS.easy_run;
    if (type === 'bike') return DAY_PREFS.easy_bike;
    if (type === 'swim') return DAY_PREFS.easy_swim;
    return DAY_PREFS.other;
  }

  function priorityWeight(session, classification) {
    const base = (() => {
      switch (session.priority) {
        case 'long': return 100;
        case 'brick': return 90;
        case 'intensity': return 80;
        case 'strength': return 55;
        case 'aerobic': return 45;
        default: return 30;
      }
    })();
    // Goal-based priority bumps for rolling mesocycle templates (Philosophy §6.5).
    const goal = classification && classification.goal;
    if (goal === 'fat_loss' && session.type === 'strength') return 110;  // above long, per §2.5 critical rule
    if (goal === 'speed_performance' && session.priority === 'intensity') return 95;
    if (goal === 'endurance' && session.priority === 'long') return 105;
    if (goal === 'general_fitness' && session.type === 'strength') return 70; // equal-ish priority
    return base;
  }

  // Cap strength frequency per phase (Philosophy §8.4). Session count
  // otherwise matches §6.1/§6.2 exactly — we do NOT trim by daysAvailable
  // because triathlon weeks legitimately have 9–11 sessions that pack into
  // fewer days via doubles.
  function capStrengthFrequency(template, phase, classification) {
    const sessions = template.map(s => ({ ...s }));
    const strengthFreq = (classification && classification.goal === 'fat_loss')
      ? Math.max(2, STRENGTH_FREQUENCY[phase] ?? 2)
      : (STRENGTH_FREQUENCY[phase] ?? 2);
    let count = sessions.filter(s => s.type === 'strength').length;
    while (count > strengthFreq) {
      let removed = false;
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (sessions[i].type === 'strength') {
          sessions.splice(i, 1);
          count--;
          removed = true;
          break;
        }
      }
      if (!removed) break;
    }
    return sessions;
  }

  // Pick the weekdays on which the athlete actually trains. Returns days
  // (1=Mon…7=Sun) ordered ascending. If the athlete chose specific long
  // days in onboarding, those days are guaranteed to be in the set.
  function selectTrainingDays(daysAvailable, longRunDay, longRideDay) {
    const d = Math.max(2, Math.min(7, daysAvailable || 3));
    let base;
    if (d >= 7) base = [1, 2, 3, 4, 5, 6, 7];
    else if (d === 6) base = [1, 2, 3, 4, 6, 7];
    else if (d === 5) base = [1, 2, 4, 6, 7];
    else if (d === 4) base = [1, 4, 6, 7];
    else if (d === 3) base = [2, 4, 7];
    else base = [4, 7];

    const required = [longRunDay, longRideDay].filter(x => x >= 1 && x <= 7);
    if (required.length === 0) return base;

    const set = new Set(base);
    for (const r of required) set.add(r);
    const days = [...set].sort((a, b) => a - b);

    // If we added required days beyond `d`, trim non-required days from
    // the list (prefer dropping weekdays farthest from the long-day cluster).
    while (days.length > d) {
      let dropIdx = -1;
      for (let i = 0; i < days.length; i++) {
        if (!required.includes(days[i])) { dropIdx = i; break; }
      }
      if (dropIdx === -1) break; // all are required; can't shrink further
      days.splice(dropIdx, 1);
    }
    return days;
  }

  // §8.6 — strength + cardio pairing subtype lookup. The placer assigns
  // these subtypes based on which cardio type ends up on the same day.
  const PAIR_SUBTYPE_BY_CARDIO = {
    swim: 'pair_swim_pull_core',
    bike: 'pair_bike_legs_posterior',
    run: 'pair_run_core_hip',
  };
  const PAIR_SUBTYPE_REST = 'pair_rest_upper';

  // Place sessions onto the 7-day week, satisfying §6.1 session counts,
  // §4.3 intensity caps, §8.6 strength pairing, and non-consecutive same-
  // discipline spacing. Returns a layout map { day: [sessions...] }.
  function assignDays(sessions, classification) {
    const layout = {};
    for (let d = 1; d <= 7; d++) layout[d] = [];

    const level = classification.level || 'intermediate';
    const trainingDays = selectTrainingDays(
      classification.daysAvailable,
      classification.longRunDay,
      classification.longRideDay
    );
    // Use training days for all non-strength placement; strength later.

    // Categorize sessions
    const longSessions = sessions.filter(s => s.priority === 'long');
    const brickSessions = sessions.filter(s => s.priority === 'brick');
    const intensitySessions = sessions.filter(s => s.priority === 'intensity');
    const strengthSessions = sessions.filter(s => s.type === 'strength');
    const aerobicSessions = sessions.filter(s =>
      s.priority !== 'long' && s.priority !== 'brick' &&
      s.priority !== 'intensity' && s.type !== 'strength'
    );

    // 1. Long sessions: honor the user's onboarding picks from
    //    classification.longRunDay / longRideDay when set; otherwise fall
    //    back to latest training day for long run, with long ride on the
    //    latest training day ≥ 2 days earlier (§4.3 — no back-to-back long
    //    days for non-advanced).
    const minGap = level === 'advanced' ? 1 : 2;
    const lastDay = pickLongRunDay(trainingDays, classification.longRunDay);
    const rideDay = pickLongRideDayPreferred(trainingDays, lastDay, minGap, classification.longRideDay);
    const longRun = longSessions.find(s => s.type === 'run');
    const longRide = longSessions.find(s => s.type === 'bike');
    const otherLongs = longSessions.filter(s => s !== longRun && s !== longRide);
    if (longRun) layout[lastDay].push(longRun);

    // Brick claims rideDay. If long ride also exists (Peak phase has both),
    // place it on the earliest training day that isn't the long-run day or
    // the brick day, so it still gets a slot.
    if (brickSessions.length > 0 && rideDay != null) {
      layout[rideDay].push(brickSessions[0]);
      if (longRide) {
        const fallback = trainingDays.find(d => d !== lastDay && d !== rideDay);
        layout[fallback != null ? fallback : rideDay].push(longRide);
      }
    } else if (longRide && rideDay != null) {
      layout[rideDay].push(longRide);
    } else if (longRide) {
      layout[lastDay].push(longRide);
    }
    // Any additional long sessions (uncommon) — place on first middle day
    for (const s of otherLongs) {
      const d = trainingDays.find(d => layout[d].length === 0) || trainingDays[0];
      layout[d].push(s);
    }

    // 2. Intensity sessions on non-long training days with spacing rules.
    //    Exclude days already holding a long or brick session.
    const longDaySet = new Set(Object.entries(layout)
      .filter(([_, list]) => list.some(s => s.priority === 'long' || s.priority === 'brick'))
      .map(([d]) => Number(d)));
    const middleDays = trainingDays.filter(d => !longDaySet.has(d));
    const intensityDayOrder = pickIntensityDays(middleDays, intensitySessions.length, level);
    intensitySessions.forEach((s, i) => {
      const d = intensityDayOrder[i] != null ? intensityDayOrder[i] : middleDays[i] || trainingDays[0];
      layout[d].push(s);
    });

    // 3. Aerobic sessions — spread disciplines, prefer empty training days first
    placeAerobicSpread(layout, aerobicSessions, trainingDays);

    // 4. Strength — pair with cardio per §8.6, prefer diverse pair types
    placeStrengthWithPairing(layout, strengthSessions, trainingDays);

    // 5. Write day numbers onto the session objects and collect
    const placed = [];
    for (let d = 1; d <= 7; d++) {
      for (const s of layout[d]) {
        s.day = d;
        placed.push(s);
      }
    }
    return placed;
  }

  // Pick the long-run day, honoring the user's onboarding pick when it
  // falls on one of their available training days. Otherwise default to
  // the latest training day (weekend).
  function pickLongRunDay(trainingDays, preferredDay) {
    if (preferredDay && trainingDays.includes(preferredDay)) return preferredDay;
    return trainingDays[trainingDays.length - 1];
  }

  // Pick the long-ride / brick day. Honors user preference when it's a
  // training day AND is ≥ minGap away from the long-run day. Otherwise
  // picks the latest training day that satisfies the gap. Falls back to
  // the second-latest training day.
  function pickLongRideDayPreferred(trainingDays, longRunDay, minGap, preferredDay) {
    if (preferredDay && trainingDays.includes(preferredDay) && preferredDay !== longRunDay
        && Math.abs(longRunDay - preferredDay) >= minGap) {
      return preferredDay;
    }
    return pickLongRideDay(trainingDays, longRunDay, minGap);
  }

  // Falls back to latest training day that is at least minGap days before
  // longRunDay. Used when the user didn't pick a preferred long ride day
  // or their pick conflicts with their long-run pick.
  function pickLongRideDay(trainingDays, longRunDay, minGap) {
    for (let i = trainingDays.length - 1; i >= 0; i--) {
      const d = trainingDays[i];
      if (d === longRunDay) continue;
      if (Math.abs(longRunDay - d) >= minGap) return d;
    }
    if (trainingDays.length >= 2) {
      return trainingDays[trainingDays.length - 2] === longRunDay
        ? trainingDays[trainingDays.length - 3] || null
        : trainingDays[trainingDays.length - 2];
    }
    return null;
  }

  function pickIntensityDays(middleDays, count, level) {
    if (count === 0) return [];
    const days = [];
    // Non-advanced: enforce gap ≥ 2 between intensity days when possible
    const minGap = level === 'advanced' ? 1 : 2;
    for (const d of middleDays) {
      if (days.every(dd => Math.abs(dd - d) >= minGap)) {
        days.push(d);
        if (days.length >= count) break;
      }
    }
    // If we couldn't fit with gap, relax
    if (days.length < count) {
      for (const d of middleDays) {
        if (!days.includes(d)) {
          days.push(d);
          if (days.length >= count) break;
        }
      }
    }
    return days;
  }

  function placeAerobicSpread(layout, aerobicSessions, trainingDays) {
    // Group by discipline to track spacing
    const byDiscipline = {};
    aerobicSessions.forEach(s => {
      (byDiscipline[s.type] = byDiscipline[s.type] || []).push(s);
    });

    // First pass: one session per discipline onto an empty training day
    for (const [discipline, list] of Object.entries(byDiscipline)) {
      for (const session of list) {
        const target = findBestAerobicDay(layout, trainingDays, discipline);
        layout[target].push(session);
      }
    }
  }

  function findBestAerobicDay(layout, trainingDays, discipline) {
    const scored = trainingDays.map(d => {
      const content = layout[d];
      const load = content.length;
      const hasLongOrBrick = content.some(s => s.priority === 'long' || s.priority === 'brick');
      const hasIntensity = content.some(s => s.priority === 'intensity');
      const hasSameDiscipline = content.some(s => s.type === discipline);
      const existingDaysOfDiscipline = trainingDays.filter(dd =>
        layout[dd].some(s => s.type === discipline)
      );
      const adjacent = existingDaysOfDiscipline.some(ed => Math.abs(ed - d) === 1);

      let score = 0;
      if (load === 0) score += 100;
      else if (load === 1) {
        // Strongly avoid stacking a second aerobic session on a long/brick day
        // (creates an unintended brick in Base phase).
        score += hasLongOrBrick ? -50 : 40;
      }
      else if (load === 2) score += 5;
      else score -= 120;
      if (hasSameDiscipline) score -= 120;  // no two of same discipline on same day
      if (adjacent) score -= 35;            // discourage adjacent same-discipline
      if (hasIntensity) score -= 20;        // don't load up intensity days
      // Slight preference for earlier training days (reserve 6/7 for long)
      score -= d * 0.3;
      return { day: d, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].day;
  }

  // Strength subtypes that represent a pre-set split (PPL or Upper/Lower)
  // chosen upstream by buildGeneralTemplate for strength-focused athletes.
  // These are preserved — the placer does not overwrite them with §8.6
  // pairing subtypes, since the athlete's plan is split-driven, not
  // cardio-pair-driven.
  const PRESET_SPLIT_SUBTYPES = new Set([
    'push_day', 'pull_day', 'leg_day', 'upper_body', 'lower_body',
    'hyrox_heavy', 'hyrox_endurance', 'hyrox_maintenance',
  ]);

  function placeStrengthWithPairing(layout, strengthSessions, trainingDays) {
    const usedPairTypes = [];
    for (const strength of strengthSessions) {
      const hasPresetSplit = PRESET_SPLIT_SUBTYPES.has(strength.subtype);

      if (hasPresetSplit) {
        // Preserve the split subtype; place on the lightest day without
        // another strength session.
        const target = pickLightestDayWithoutStrength(layout, trainingDays);
        layout[target].push(strength);
        continue;
      }

      // Endurance athletes: find a day with cardio to pair with per §8.6
      const candidates = [];
      for (const d of trainingDays) {
        const content = layout[d];
        if (content.some(s => s.type === 'strength')) continue;
        if (content.length >= 3) continue;
        const cardio = content.find(s => ['run', 'bike', 'swim'].includes(s.type));
        if (!cardio) continue;
        const hasLongOrIntensity = content.some(s => s.priority === 'long' || s.priority === 'intensity' || s.priority === 'brick');
        const load = content.length;
        let score = 0;
        if (load === 1) score += 50;
        else if (load === 2) score += 30;
        if (hasLongOrIntensity) score -= 45;
        const pairType = PAIR_SUBTYPE_BY_CARDIO[cardio.type];
        if (pairType && !usedPairTypes.includes(pairType)) score += 50;
        candidates.push({ day: d, cardioType: cardio.type, score, pairType });
      }
      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length > 0) {
        const chosen = candidates[0];
        strength.subtype = chosen.pairType;
        strength.sessionSubtype = chosen.pairType;
        layout[chosen.day].push(strength);
        usedPairTypes.push(chosen.pairType);
      } else {
        // No paired day available — place on an empty training day with "rest-day upper" pair
        const emptyDay = trainingDays.find(d => layout[d].length === 0);
        const target = emptyDay != null ? emptyDay : pickLightestDayWithoutStrength(layout, trainingDays);
        strength.subtype = PAIR_SUBTYPE_REST;
        strength.sessionSubtype = PAIR_SUBTYPE_REST;
        layout[target].push(strength);
        usedPairTypes.push(PAIR_SUBTYPE_REST);
      }
    }
  }

  function pickLightestDayWithoutStrength(layout, trainingDays) {
    let best = trainingDays[0];
    let bestLoad = Infinity;
    for (const d of trainingDays) {
      if (layout[d].some(s => s.type === 'strength')) continue;
      if (layout[d].length < bestLoad) { bestLoad = layout[d].length; best = d; }
    }
    return best;
  }

  // TRAINING_PHILOSOPHY §4.3 — cap Z4+ intensity sessions per week
  function applyIntensityConstraints(sessions, classification) {
    const level = classification.level || 'intermediate';
    const cap = INTENSITY_CAPS[level] || 2;
    const intensityIndices = sessions
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.priority === 'intensity')
      .map(x => x.i);

    // Demote excess intensity sessions to easy/aerobic
    if (intensityIndices.length > cap) {
      // Keep the first `cap` (prefer run intensity > bike > swim for retention)
      const keep = intensityIndices
        .slice()
        .sort((a, b) => sessionIntensityRetentionScore(sessions[b]) - sessionIntensityRetentionScore(sessions[a]))
        .slice(0, cap);
      const keepSet = new Set(keep);
      for (const idx of intensityIndices) {
        if (!keepSet.has(idx)) {
          demoteToEasy(sessions[idx]);
        }
      }
    }

    // No consecutive hard days for non-advanced
    if (level !== 'advanced') {
      enforceNoConsecutiveIntensity(sessions);
    }
    return sessions;
  }

  function sessionIntensityRetentionScore(s) {
    // Prefer keeping run tempo/intervals and bike threshold.
    if (s.type === 'run') return 3;
    if (s.type === 'bike') return 2;
    if (s.type === 'swim') return 1;
    return 0;
  }

  function demoteToEasy(session) {
    session.priority = 'aerobic';
    if (session.type === 'run') session.subtype = 'easy';
    else if (session.type === 'bike') session.subtype = 'z2_endurance';
    else if (session.type === 'swim') session.subtype = 'endurance';
  }

  function enforceNoConsecutiveIntensity(_sessions) {
    // New placer (assignDays) already places intensity with a 2-day gap
    // for non-advanced athletes via pickIntensityDays(). This remains as
    // a no-op for API compatibility with older callers.
  }

  // ── Duration + zones + pace ──────────────────────────────────────────────

  function assignDurations(sessions, classification, arc, phase) {
    const baseMin = classification.sessionDurationMin || 60;
    const level = classification.level || 'intermediate';
    const levelFactor = level === 'beginner' ? 0.85 : level === 'advanced' ? 1.15 : 1.0;
    for (const s of sessions) {
      let d = baseMin;
      if (s.priority === 'long') d = Math.round(baseMin * 1.8);
      else if (s.priority === 'brick') d = Math.round(baseMin * 1.5);
      else if (s.priority === 'intensity') d = Math.round(baseMin * 1.0);
      else if (s.type === 'swim' && s.subtype === 'technique') d = Math.round(baseMin * 0.7);
      else if (s.type === 'strength') d = Math.round(baseMin * 0.85);
      else if (s.subtype && s.subtype.startsWith('short')) d = Math.round(baseMin * 0.5);
      else if (phase === 'race-week') d = Math.round(baseMin * 0.4);
      else if (phase === 'taper') d = Math.round(baseMin * 0.7);
      else d = Math.round(baseMin * 0.9);
      s.durationMin = Math.max(15, Math.round(d * levelFactor));
    }
    return sessions;
  }

  function enforceHourCeiling(sessions, ceilingHours) {
    if (!ceilingHours) return sessions;
    const ceilingMin = ceilingHours * 60;
    const total = sessions.reduce((a, s) => a + (s.durationMin || 0), 0);
    if (total <= ceilingMin) return sessions;
    const scale = ceilingMin / total;
    for (const s of sessions) s.durationMin = Math.max(15, Math.round(s.durationMin * scale));
    return sessions;
  }

  // Two-way scale: adjust session durations up or down to hit targetMin.
  // Used for mesocycle progression so weeks actually differ (Philosophy §4.9).
  function scaleSessionsToBudget(sessions, targetMin) {
    if (!targetMin || targetMin <= 0) return sessions;
    const active = sessions.filter(s => s && s.type !== 'rest');
    const total = active.reduce((a, s) => a + (s.durationMin || 0), 0);
    if (total <= 0) return sessions;
    const scale = targetMin / total;
    // Don't scale extremely aggressively on a single session.
    const clamped = Math.max(0.4, Math.min(1.6, scale));
    for (const s of active) {
      s.durationMin = Math.max(15, Math.round((s.durationMin || 0) * clamped));
    }
    return sessions;
  }

  // ── Zones, pace, description, rationale ──────────────────────────────────

  const SUBTYPE_METADATA = {
    easy:                { zones: ['Z1', 'Z2'], keySession: false, label: 'Easy' },
    long_run:            { zones: ['Z2'], keySession: false, label: 'Long Run' },
    long_ride:           { zones: ['Z2'], keySession: false, label: 'Long Ride' },
    tempo:               { zones: ['Z4'], keySession: true,  label: 'Tempo Run' },
    intervals:           { zones: ['Z5'], keySession: true,  label: 'Interval Session' },
    race_pace:           { zones: ['Z4'], keySession: true,  label: 'Race-Pace Session' },
    short_race_pace:     { zones: ['Z4'], keySession: true,  label: 'Short Race-Pace Opener' },
    short_opener:        { zones: ['Z2'], keySession: false, label: 'Short Opener' },
    short_with_strides:  { zones: ['Z2'], keySession: false, label: 'Short Shakeout w/ Strides' },
    z2_endurance:        { zones: ['Z2'], keySession: false, label: 'Z2 Endurance' },
    sweet_spot:          { zones: ['Z3', 'Z4'], keySession: true,  label: 'Sweet Spot' },
    threshold:           { zones: ['Z4'], keySession: true,  label: 'Threshold' },
    technique:           { zones: ['Z1', 'Z2'], keySession: false, label: 'Technique Swim' },
    endurance:           { zones: ['Z2', 'Z3'], keySession: false, label: 'Endurance Swim' },
    css_intervals:       { zones: ['Z3', 'Z4'], keySession: true,  label: 'CSS Intervals' },
    openers:             { zones: ['Z2'], keySession: false, label: 'Race-Week Openers' },
    bike_to_run:         { zones: ['Z3'], keySession: true,  label: 'Brick: Bike → Run' },
    full_body:           { zones: [], keySession: false, label: 'Full-Body Strength' },
    upper_body:          { zones: [], keySession: false, label: 'Upper-Body Strength' },
    lower_body:          { zones: [], keySession: false, label: 'Lower-Body Strength' },
    push_day:            { zones: [], keySession: false, label: 'Push Day' },
    pull_day:            { zones: [], keySession: false, label: 'Pull Day' },
    leg_day:             { zones: [], keySession: false, label: 'Leg Day' },
    sport_specific:      { zones: [], keySession: false, label: 'Sport-Specific Strength' },
    optional:            { zones: ['Z2'], keySession: false, label: 'Optional Cross-Training' },
    cardio:              { zones: ['Z2'], keySession: false, label: 'Cardio Cross-Training' },
    // v1.4 — Running distance-specific
    easy_with_strides:      { zones: ['Z1', 'Z2'], keySession: false, label: 'Easy Run w/ Strides' },
    vo2max_intervals:       { zones: ['Z5'],       keySession: true,  label: 'VO2max Intervals (1K repeats)' },
    cruise_intervals:       { zones: ['Z4'],       keySession: true,  label: 'Cruise Intervals (mile repeats)' },
    long_intervals:         { zones: ['Z5'],       keySession: true,  label: 'Long Intervals (1200-2000m)' },
    mp_progression:         { zones: ['Z3', 'Z4'], keySession: true,  label: 'Marathon-Pace Progression' },
    progressive_tempo:      { zones: ['Z3', 'Z4'], keySession: true,  label: 'Progressive Tempo (easy → threshold)' },
    mp_long_run:            { zones: ['Z2', 'Z3'], keySession: false, label: 'MP Long Run' },
    long_run_progressive:   { zones: ['Z2', 'Z3'], keySession: false, label: 'Progressive Long Run' },
    medium_long_run:        { zones: ['Z2'],       keySession: false, label: 'Medium-Long Run' },
    race_pace_5k:           { zones: ['Z4', 'Z5'], keySession: true,  label: '5K Race-Pace Repeats' },
    race_pace_10k:          { zones: ['Z4'],       keySession: true,  label: '10K Race-Pace Efforts' },
    race_pace_half:         { zones: ['Z3', 'Z4'], keySession: true,  label: 'Half Marathon Race-Pace Segments' },
    race_pace_marathon:     { zones: ['Z3'],       keySession: true,  label: 'Marathon-Pace Segments' },
    // v1.4 — Hyrox
    hyrox_intervals:        { zones: ['Z4', 'Z5'], keySession: true,  label: 'Hyrox 1K Interval Runs' },
    run_station_combo:      { zones: ['Z3', 'Z4'], keySession: true,  label: 'Run + Station Combo (1K Sandwich)' },
    station_circuit:        { zones: ['Z4'],       keySession: true,  label: 'Hyrox Station Circuit' },
    race_pace_combo:        { zones: ['Z4'],       keySession: true,  label: 'Hyrox Race-Simulation Combo' },
    short_opener_combo:     { zones: ['Z3'],       keySession: true,  label: 'Short Hyrox Opener Combo' },
    station_practice:       { zones: ['Z2'],       keySession: false, label: 'Hyrox Station Practice' },
    hyrox_heavy:            { zones: [],           keySession: false, label: 'Hyrox Heavy Compound Strength' },
    hyrox_endurance:        { zones: [],           keySession: false, label: 'Hyrox Muscular Endurance Strength' },
    hyrox_maintenance:      { zones: [],           keySession: false, label: 'Hyrox Strength Maintenance' },
    // v1.4 — circuit/hiit
    hiit:                   { zones: ['Z4'],       keySession: true,  label: 'HIIT Circuit' },
    // §8.6 same-day pairing strength subtypes (assigned by placer)
    pair_run_core_hip:       { zones: [], keySession: false, label: 'Core + Hip Stability (run-day pair)' },
    pair_swim_pull_core:     { zones: [], keySession: false, label: 'Pull + Core (swim-day pair)' },
    pair_bike_legs_posterior:{ zones: [], keySession: false, label: 'Legs + Posterior Chain (bike-day pair)' },
    pair_rest_upper:         { zones: [], keySession: false, label: 'Upper Body + Arms (rest-day pair)' },
    // Active recovery for intermediate/advanced athletes (Core Principle #4)
    active_recovery:         { zones: ['Z1'], keySession: false, label: 'Active Recovery' },
    rest:                    { zones: [], keySession: false, label: 'Rest Day' },
  };

  function paceToStr(minPerMile) {
    if (!minPerMile || isNaN(minPerMile)) return null;
    const whole = Math.floor(minPerMile);
    const sec = Math.round((minPerMile - whole) * 60);
    return `${whole}:${String(sec).padStart(2, '0')}/mile`;
  }

  function runPaceTarget(classification, zones) {
    const thr = classification.thresholds && classification.thresholds.runThresholdPace;
    if (!thr || !zones || !zones.length) return null;
    if (zones.includes('Z5')) return paceToStr(thr - 0.5);  // intervals: faster than threshold
    if (zones.includes('Z4')) return paceToStr(thr);
    if (zones.includes('Z3')) return paceToStr(thr + 0.5);
    return paceToStr(thr + 1.0);  // Z2: ~1 min slower than threshold
  }

  function bikePowerTarget(classification, zones) {
    const ftp = classification.thresholds && classification.thresholds.ftp;
    if (!ftp) return null;
    if (zones.includes('Z5')) return `${Math.round(ftp * 1.08)}W`;
    if (zones.includes('Z4')) return `${Math.round(ftp * 0.97)}W`;
    if (zones.includes('Z3')) return `${Math.round(ftp * 0.88)}W (sweet spot)`;
    return `${Math.round(ftp * 0.70)}W`;
  }

  function swimPaceTarget(classification, zones) {
    const css = classification.thresholds && classification.thresholds.css;
    if (!css) return null;
    if (zones.includes('Z4')) return `${Math.round(css - 3)}s/100m`;
    if (zones.includes('Z3')) return `${Math.round(css)}s/100m (CSS)`;
    return `${Math.round(css + 5)}s/100m`;
  }

  function enrichSession(session, classification, phase) {
    const meta = SUBTYPE_METADATA[session.subtype] || { zones: [], keySession: session.priority === 'intensity', label: session.subtype || session.type };
    session.sessionSubtype = session.subtype;
    session.targetZones = meta.zones.slice();
    session.keySession = meta.keySession || session.priority === 'intensity';

    let targetPace = null;
    if (session.type === 'run') targetPace = runPaceTarget(classification, session.targetZones);
    else if (session.type === 'bike') targetPace = bikePowerTarget(classification, session.targetZones);
    else if (session.type === 'swim') targetPace = swimPaceTarget(classification, session.targetZones);
    if (targetPace) session.targetPace = targetPace;

    session.warmUp = buildWarmUp(session);
    session.coolDown = buildCoolDown(session);
    session.description = buildDescription(session, classification);
    session.rationale = buildRationale(session, phase);

    if (session.type === 'swim') {
      session.swimDetails = {
        totalDistance: Math.max(800, Math.round((session.durationMin || 45) * 40)),
        intensity: session.priority === 'intensity' ? 'hard' : session.subtype === 'technique' ? 'easy' : 'moderate',
      };
    }
    if (session.type === 'brick') {
      const bikeMin = Math.round((session.durationMin || 60) * 0.7);
      const runMin = Math.max(10, (session.durationMin || 60) - bikeMin);
      session.brickDetails = { leg1Type: 'bike', leg1DurationMin: bikeMin, leg2Type: 'run', leg2DurationMin: runMin };
    }

    return session;
  }

  function buildWarmUp(s) {
    if (s.type === 'strength') return '5–10 min dynamic warm-up + 1–2 ramp-up sets per main lift';
    if (s.priority === 'intensity') return '15–20 min easy + 4×20s strides';
    if (s.priority === 'long') return '10 min easy build-up';
    return '5–10 min easy';
  }

  function buildCoolDown(s) {
    if (s.type === 'strength') return '5 min walk + static stretching';
    if (s.priority === 'intensity') return '10 min easy + stretch';
    return '5 min easy + stretch';
  }

  function buildDescription(s, classification) {
    const dur = s.durationMin;
    const meta = SUBTYPE_METADATA[s.subtype] || {};
    const label = meta.label || s.subtype || s.type;

    // Hyrox-specific descriptions (Philosophy §9.5)
    if (s.type === 'hyrox') {
      if (s.subtype === 'run_station_combo') return '1K run → 1 station → 1K run → 1 station → repeat across 3–4 stations at moderate-hard effort (the "1K sandwich").';
      if (s.subtype === 'station_circuit') return 'All 8 Hyrox stations back-to-back, no running between, timed. Moderate-high intensity.';
      if (s.subtype === 'race_pace_combo') return 'Race-simulation combo: 4 × (1K run @ race pace + 1 station). Practice transitions + pacing.';
      if (s.subtype === 'short_opener_combo') return 'Abbreviated run + 3–4 stations at race pace — short, sharp, stay race-ready.';
      if (s.subtype === 'station_practice') return 'Low-intensity station technique practice — focus on form and movement quality.';
      return `${label}, ${dur} min`;
    }

    // Running distance-specific descriptions (Philosophy §6.2)
    if (s.type === 'run') {
      if (s.subtype === 'vo2max_intervals') return '15 min warm-up + 6–8 × 1000m @ Z5 with 2–3 min jog recovery + 10 min cool-down.';
      if (s.subtype === 'cruise_intervals') return '15 min warm-up + 4–6 × 1 mile @ Z4 (threshold) with 90s jog recovery + 10 min cool-down.';
      if (s.subtype === 'long_intervals') return '15 min warm-up + 4–5 × 1200–2000m @ Z5 with 3 min jog recovery + 10 min cool-down.';
      if (s.subtype === 'mp_progression') return 'Warm-up + progressive build from easy → marathon pace over the main set + cool-down.';
      if (s.subtype === 'progressive_tempo') return 'Warm-up, then progressive effort: easy → MP → threshold over ~30 min + cool-down.';
      if (s.subtype === 'mp_long_run') return `${dur}-min long run with the final 8–12 miles at marathon pace (Z3).`;
      if (s.subtype === 'long_run_progressive') return `${dur}-min long run with the final 2–3 miles at Z3.`;
      if (s.subtype === 'medium_long_run') return `Midweek medium-long run (~${dur} min, steady Z2).`;
      if (s.subtype === 'race_pace_5k' || s.subtype === 'race_pace_10k' || s.subtype === 'race_pace_half' || s.subtype === 'race_pace_marathon') {
        return `Warm-up + race-pace repeats targeting goal ${s.subtype.replace('race_pace_', '').toUpperCase()} pace + cool-down.`;
      }
      if (s.subtype === 'easy_with_strides') return `${dur}-min easy run + 6–8 × 100m strides after the run.`;
    }

    if (s.type === 'strength') {
      if (s.subtype === 'hyrox_heavy') return 'Heavy compound lifts (3–4 × 6–8): squat, deadlift, row, press, loaded lunges.';
      if (s.subtype === 'hyrox_endurance') return 'Muscular-endurance strength (3–4 × 12–16): lunges, carries, rows at moderate weight, short rest.';
      if (s.subtype === 'hyrox_maintenance') return 'Light maintenance: 2 × 8–10 on primary compounds, stay sharp without adding fatigue.';
      return `${label} — see exercise list`;
    }

    if (s.type === 'circuit' && s.subtype === 'hiit') {
      return 'Short HIIT circuit: 4–6 exercises, 40s work / 20s rest × 3–4 rounds.';
    }
    if (s.type === 'brick') return `${Math.round(dur * 0.7)} min bike @ Z3 → ${Math.max(10, dur - Math.round(dur * 0.7))} min run @ race effort`;
    if (s.priority === 'intensity' && s.type === 'run') {
      if (s.subtype === 'intervals') return `15 min warm-up, 5×1K @ Z5 w/ 2–3 min jog recovery, 10 min cool-down (${dur} min total)`;
      return `15 min warm-up, ${Math.max(15, dur - 30)} min @ threshold, 10 min cool-down`;
    }
    if (s.priority === 'intensity' && s.type === 'bike') {
      return `${Math.min(15, Math.round(dur * 0.2))} min warm-up, ${Math.max(20, Math.round(dur * 0.6))} min @ sweet-spot/threshold, easy cool-down`;
    }
    if (s.priority === 'intensity' && s.type === 'swim') {
      return `Warm-up 400m, 8–12×100m @ CSS w/ 10–15s rest, cool-down 200m`;
    }
    if (s.priority === 'long') return `Continuous ${label.toLowerCase()} at Z2 (${dur} min)`;
    if (s.type === 'swim' && s.subtype === 'technique') return 'Drill-focused swim: 400m warm-up, 8×50m drill/swim, 400m easy';
    return `${label}, ${dur} min`;
  }

  function buildRationale(s, phase) {
    // Hyrox-specific rationale (Philosophy §9.5)
    if (s.type === 'hyrox') {
      if (s.subtype === 'run_station_combo') return 'Run + station combos are the single most Hyrox-specific workout — they train your ability to run on station-fatigued legs and vice versa.';
      if (s.subtype === 'station_circuit') return 'Back-to-back stations without rest train muscular endurance and mental toughness for the race\'s middle stations.';
      if (s.subtype === 'race_pace_combo') return 'Race-simulation combos teach pacing and transitions — the skills that separate finishers from racers.';
      if (s.subtype === 'short_opener_combo') return 'Short taper-phase opener keeps movement patterns sharp without adding fatigue.';
      if (s.subtype === 'station_practice') return 'Low-intensity station practice grooves the movement patterns before adding race-level fatigue.';
    }
    if (s.type === 'strength') {
      if (s.subtype === 'hyrox_heavy') return 'Heavy compounds in Hyrox Base build the force ceiling that later translates to sled pushes and wall-ball thrusters.';
      if (s.subtype === 'hyrox_endurance') return 'Higher reps + shorter rest simulate station demands (12–20 rep range) and build the muscular endurance Hyrox rewards.';
      if (s.subtype === 'hyrox_maintenance') return 'Maintenance strength preserves force production into race week without adding fatigue.';
      if (phase === 'base') return 'Base-phase strength builds general strength that translates to race-day power and injury resilience.';
      if (phase === 'build') return 'Sport-specific strength maintains force production while cardio volume ramps.';
      return 'Maintenance strength: keep gains without adding fatigue.';
    }
    // Running distance-specific rationale (Philosophy §4.5, §9.1)
    if (s.type === 'run') {
      if (s.subtype === 'vo2max_intervals') return 'VO2max intervals are the #1 key workout for 5K — they raise the oxygen ceiling that ultimately caps 5K pace.';
      if (s.subtype === 'cruise_intervals') return 'Cruise intervals at threshold are the 10K bread-and-butter: they teach you to hold race pace under controlled fatigue.';
      if (s.subtype === 'mp_long_run') return 'Marathon-pace long runs train fat utilization and pacing discipline — the defining marathon adaptation.';
      if (s.subtype === 'mp_progression') return 'Marathon-pace progression builds the ability to negative-split on race day, when pace discipline matters most.';
      if (s.subtype === 'progressive_tempo') return 'Progressive tempo (easy → threshold) develops pacing control and extends your ability to hold marathon pace under fatigue.';
      if (s.subtype === 'long_intervals') return 'Longer intervals (1200–2000m) bridge VO2max and threshold — essential for 10K and half-marathon-specific fitness.';
      if (s.subtype === 'medium_long_run') return 'Midweek medium-long run accumulates time on feet without the recovery cost of a second long run.';
      if (s.subtype === 'easy_with_strides') return 'Easy run + strides keeps neuromuscular speed while staying in the aerobic zone.';
    }
    if (s.priority === 'long') return `Long ${s.type === 'bike' ? 'ride' : s.type} builds aerobic capacity and mental endurance — the backbone of race-day performance.`;
    if (s.priority === 'intensity') return `Quality ${s.type} workout raises the ceiling of sustainable effort — essential for race-specific fitness.`;
    if (s.priority === 'brick') return 'Bike-to-run brick trains the neuromuscular transition your race will demand.';
    if (s.subtype === 'technique') return 'Swim technique yields more return per minute than volume alone at your level.';
    return 'Easy aerobic work builds fitness at low stress and aids recovery.';
  }

  // ── Exercise selection ───────────────────────────────────────────────────

  function isExerciseDbAvailable() {
    return typeof window !== 'undefined' && window.ExerciseDB && typeof window.ExerciseDB.pick === 'function';
  }

  function pickSlot(slot, userEquip, picked) {
    if (!isExerciseDbAvailable()) return null;
    const filters = {
      pattern: slot.pattern,
      tier: slot.tier,
      equipment: userEquip && userEquip.length ? userEquip : undefined,
      excludeIds: picked.map(p => p.id),
    };
    if (slot.specificGoal) filters.specificGoal = slot.specificGoal;
    const opts = {};
    if (slot.diverseFromSlot != null && picked[slot.diverseFromSlot]) {
      opts.diverseFrom = [picked[slot.diverseFromSlot]];
    }
    let result = window.ExerciseDB.pick(filters, 1, opts);
    if (!result || !result.length) {
      // Relax tier constraint if nothing matched
      const relaxed = { ...filters, tier: undefined };
      result = window.ExerciseDB.pick(relaxed, 1, opts);
    }
    if (!result || !result.length) {
      // Relax equipment (last resort)
      const relaxed = { ...filters, tier: undefined, equipment: undefined };
      result = window.ExerciseDB.pick(relaxed, 1, opts);
    }
    return result && result.length ? result[0] : null;
  }

  function assignSetsRepsRest(exercise, tier, level) {
    const tierKey = SETS_REPS_REST[tier] ? tier : 'secondary';
    const levelKey = SETS_REPS_REST[tierKey][level] ? level : 'intermediate';
    return { ...SETS_REPS_REST[tierKey][levelKey] };
  }

  function trimExerciseSlots(slots, classification) {
    const level = classification.level || 'intermediate';
    const cap = level === 'beginner' ? 5 : level === 'intermediate' ? 7 : 8;
    return slots.slice(0, cap);
  }

  function selectExercisesForSession(session, classification) {
    if (session.type === 'hyrox') {
      // Use ExerciseDB.getHyroxStations() when available; otherwise leave
      // exercises empty (description carries the station list).
      if (typeof window !== 'undefined' && window.ExerciseDB && typeof window.ExerciseDB.getHyroxStations === 'function') {
        const stations = window.ExerciseDB.getHyroxStations() || [];
        session.exercises = stations.slice(0, 8).map(ex => ({
          exerciseId: ex.id,
          exerciseName: ex.name,
          slotRole: 'hyrox-station',
          sets: 1,
          reps: ex.targetReps || 'station distance',
          restSeconds: 0,
          usesWeights: !!ex.usesWeights,
          notes: null,
        }));
      }
      return session;
    }
    if (session.type !== 'strength' && session.type !== 'circuit' && session.type !== 'hiit') {
      return session;
    }
    const subtype = session.subtype || 'full_body';
    const template = STRENGTH_SLOT_TEMPLATES[subtype] || STRENGTH_SLOT_TEMPLATES.full_body;
    const slots = trimExerciseSlots(template, classification);
    const userEquip = Array.isArray(classification.equipmentProfile) ? classification.equipmentProfile : [];

    const picked = [];
    const exercises = [];
    for (const slot of slots) {
      const ex = pickSlot(slot, userEquip, picked);
      if (!ex) continue;
      picked.push(ex);
      const tier = ex.tier || (Array.isArray(slot.tier) ? slot.tier[0] : slot.tier) || 'secondary';
      const volume = assignSetsRepsRest(ex, tier, classification.level || 'intermediate');
      // Hyrox phase-specific volume shift (Philosophy §9.5): build/peak use
      // higher reps / shorter rest even when the slot template is "primary".
      if (subtype === 'hyrox_endurance') {
        volume.sets = 3;
        volume.reps = '12-16';
        volume.restSeconds = 75;
      } else if (subtype === 'hyrox_maintenance') {
        volume.sets = 2;
        volume.reps = '8-10';
        volume.restSeconds = 90;
      }
      exercises.push({
        exerciseId: ex.id,
        exerciseName: ex.name,
        slotRole: slot.role,
        sets: volume.sets,
        reps: volume.reps,
        restSeconds: volume.restSeconds,
        usesWeights: !!ex.usesWeights,
        notes: null,
      });
    }
    session.exercises = exercises;
    return session;
  }

  // ── Deload + B-race micro-taper ──────────────────────────────────────────

  function applyDeloadModifier(sessions) {
    // Reduce volume 40–60%, maintain intensity (TRAINING_PHILOSOPHY §12.3).
    for (const s of sessions) {
      if (s.type === 'rest' || s.subtype === 'active_recovery') continue;
      s.durationMin = Math.max(15, Math.round((s.durationMin || 30) * 0.55));
      if (s.type === 'strength' && Array.isArray(s.exercises)) {
        s.exercises = s.exercises.map(e => ({ ...e, sets: Math.max(1, e.sets - 1) }));
      }
    }
    return sessions;
  }

  function applyBRaceMicroTaper(sessions, weekNumber, arc) {
    const window = weekOverlapsBRace(weekNumber, arc);
    if (!window) return sessions;
    const raceDate = parseIso(window.raceDate);
    if (!raceDate) return sessions;
    const weekRange = weekDateRange(weekNumber, arc);
    if (!weekRange) return sessions;
    // For each session, compute its date
    for (const s of sessions) {
      if (s.type === 'rest') continue;
      const day = s.day || 1;
      const sessDate = new Date(weekRange.start.getTime() + (day - 1) * MS_PER_DAY);
      const diffDays = Math.round((sessDate - raceDate) / MS_PER_DAY);
      if (diffDays >= -3 && diffDays < 0) {
        // Pre-race taper: 3 days before race
        if (s.type === 'run') {
          s.durationMin = Math.max(15, Math.round((s.durationMin || 30) * 0.7));
          if (s.priority === 'long') {
            s.priority = 'aerobic';
            s.subtype = 'easy';
            s.keySession = false;
          }
        } else {
          s.durationMin = Math.max(15, Math.round((s.durationMin || 30) * 0.8));
        }
        s.rationale = (s.rationale || '') + ' (B-race micro-taper: volume reduced).';
      } else if (diffDays >= 0 && diffDays <= 3) {
        // Post-race recovery: easy only
        s.priority = 'aerobic';
        if (s.type === 'run') s.subtype = 'easy';
        else if (s.type === 'bike') s.subtype = 'z2_endurance';
        else if (s.type === 'swim') s.subtype = 'technique';
        s.keySession = false;
        s.targetZones = ['Z1', 'Z2'];
        s.durationMin = Math.max(15, Math.round((s.durationMin || 30) * 0.6));
        s.rationale = 'Post-B-race recovery: easy session only.';
      }
    }
    return sessions;
  }

  // ── Weakness bias (TRAINING_PHILOSOPHY §9.0) ─────────────────────────────

  function applyWeaknessBias(weeklyPlan, classification) {
    const weakest = classification.weaknessProfile && classification.weaknessProfile.weakestDiscipline;
    if (!weakest || weakest === 'none') return;
    let applied = 'none';

    // Run weakness: upgrade quality, never add frequency.
    if (weakest === 'run') {
      for (const week of weeklyPlan) {
        if (week.phase !== 'base') continue;
        const easyRun = week.sessions.find(s => s.type === 'run' && s.priority === 'aerobic' && s.subtype === 'easy');
        if (easyRun) {
          easyRun.subtype = 'tempo';
          easyRun.priority = 'intensity';
          easyRun.keySession = true;
          easyRun.targetZones = ['Z4'];
          easyRun.sessionSubtype = 'tempo';
          easyRun.rationale = 'Weakness bias: upgraded easy run to tempo — we raise run quality rather than frequency.';
          applied = 'upgraded_session';
          break;
        }
      }
    } else if (weakest === 'swim' || weakest === 'bike') {
      // Try adding a technical/quality session to one base week
      for (const week of weeklyPlan) {
        if (week.phase !== 'base') continue;
        const target = week.sessions.find(s => s.type === weakest && s.priority === 'aerobic');
        if (target) {
          if (weakest === 'swim') {
            target.subtype = 'css_intervals';
            target.priority = 'intensity';
            target.keySession = true;
            target.targetZones = ['Z3', 'Z4'];
            target.sessionSubtype = 'css_intervals';
          } else {
            target.subtype = 'sweet_spot';
            target.priority = 'intensity';
            target.keySession = true;
            target.targetZones = ['Z3', 'Z4'];
            target.sessionSubtype = 'sweet_spot';
          }
          target.rationale = `Weakness bias: upgraded ${weakest} session to quality work.`;
          applied = 'upgraded_session';
          break;
        }
      }
    }

    if (classification.weaknessProfile) {
      classification.weaknessProfile.biasApplied = applied;
    }
  }

  // ── Main entry point ─────────────────────────────────────────────────────

  function insertKeySessions(week, phase, classification, arc) {
    const template = getSessionTemplate(classification.sportProfile, phase, arc, classification)
      || buildGeneralTemplate(classification, phase);
    // Cap strength frequency per phase (§8.4) but keep full template otherwise
    // so §6.1 / §6.2 counts are preserved. Packing into fewer days happens
    // later in assignDays via 2-a-days.
    return capStrengthFrequency(template, phase, classification);
  }

  function fillAerobicVolume(week, sessions, classification, arc) {
    // Aerobic fill happens as part of trimTemplate (lower-priority items
    // come from the template itself). This hook is exposed for
    // spec-completeness but does not mutate sessions here — rest days
    // are added later in assembleWeeklyPlan.
    return sessions;
  }

  // Fill unused days with rest or active recovery. Per Core Principle #4
  // (v1.4): beginner athletes get full-rest days; intermediate and advanced
  // athletes get active-recovery days (Z1 only — easy spin, light yoga,
  // mobility work) instead of full rest.
  function addRestDays(sessions, classification) {
    const level = (classification && classification.level) || 'intermediate';
    const useActiveRecovery = level !== 'beginner';
    const occupied = new Set(sessions.map(s => s.day));
    for (let d = 1; d <= 7; d++) {
      if (occupied.has(d)) continue;
      if (useActiveRecovery) {
        sessions.push({
          day: d,
          type: 'cross-training',
          subtype: 'active_recovery',
          sessionSubtype: 'active_recovery',
          priority: 'recovery',
          durationMin: 20,
          keySession: false,
          targetZones: ['Z1'],
          description: 'Active recovery: 20 min easy spin, yoga, or mobility work (Z1 only).',
          warmUp: '',
          coolDown: '',
          rationale: 'Active recovery aids blood flow and adaptation without adding training stress. Advanced/intermediate athletes benefit more from light movement than full rest.',
        });
      } else {
        sessions.push({
          day: d,
          type: 'rest',
          subtype: 'rest',
          sessionSubtype: 'rest',
          priority: 'rest',
          durationMin: 0,
          keySession: false,
          targetZones: [],
          description: 'Full rest day — recovery is productive, not lazy.',
          warmUp: '',
          coolDown: '',
          rationale: 'Rest day enables adaptation and protects against overtraining.',
        });
      }
    }
    return sessions;
  }

  function assembleWeek(weekNumber, arc, classification) {
    const phase = getPhaseForWeek(weekNumber, arc);
    const isDeload = isDeloadWeek(weekNumber, classification.level, phase, arc.totalWeeks);
    const week = { weekNumber, phase, isDeload };

    let sessions = insertKeySessions(week, phase, classification, arc);
    sessions = assignDays(sessions, classification);
    sessions = applyIntensityConstraints(sessions, classification);
    sessions = assignDurations(sessions, classification, arc, phase);
    if (phase === 'mesocycle') {
      // For rolling mesocycles, scale sessions TO match the week's budget
      // so weeks 1→2→3 progress +5-10% (Philosophy §4.9). Week 4 deload
      // is handled by applyDeloadModifier separately — but we still honor
      // the hour ceiling.
      const weeklyMin = getWeeklyTimeBudget(weekNumber, arc, classification);
      sessions = scaleSessionsToBudget(sessions, weeklyMin);
    } else {
      sessions = enforceHourCeiling(sessions, arc.weeklyHoursCeiling);
    }
    sessions = sessions.map(s => enrichSession(s, classification, phase));
    sessions = sessions.map(s => selectExercisesForSession(s, classification));
    if (isDeload) sessions = applyDeloadModifier(sessions);
    sessions = applyBRaceMicroTaper(sessions, weekNumber, arc);
    sessions = addRestDays(sessions, classification);
    sessions.sort((a, b) => a.day - b.day);

    week.sessions = sessions;
    week.targetHours = Math.round(sessions.reduce((acc, s) => acc + (s.durationMin || 0), 0) / 6) / 10;
    return week;
  }

  function assembleWeeklyPlan(classification, arc) {
    if (!classification) throw new Error('SessionAssembler.assembleWeeklyPlan: classification is required');
    if (!arc || !arc.totalWeeks) throw new Error('SessionAssembler.assembleWeeklyPlan: arc with totalWeeks is required');
    const plan = [];
    for (let w = 1; w <= arc.totalWeeks; w++) {
      plan.push(assembleWeek(w, arc, classification));
    }
    applyWeaknessBias(plan, classification);
    return plan;
  }

  window.SessionAssembler = {
    assembleWeeklyPlan,
    getWeeklyTimeBudget,
    insertKeySessions,
    applyIntensityConstraints,
    fillAerobicVolume,
    selectExercisesForSession,
    assignSetsRepsRest,
    getSessionTemplate,
    areAdjacentDays,
    applyDeloadModifier,
    scaleSessionsToBudget,
    // extras exposed for testing / introspection
    getPhaseForWeek,
    isDeloadWeek,
    applyBRaceMicroTaper,
    applyWeaknessBias,
    _HYROX_TEMPLATES: HYROX_TEMPLATES,
    _RUNNING_DISTANCE_OVERRIDES: RUNNING_DISTANCE_OVERRIDES,
    _GOAL_MESOCYCLE_TEMPLATES: GOAL_MESOCYCLE_TEMPLATES,
  };
})();
