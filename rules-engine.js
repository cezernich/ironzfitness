// rules-engine.js — Deterministic plan assembly from philosophy modules
// Phase 3 of the Philosophy Engine build
// Dependencies: philosophy-engine.js, exercise-selector.js, nutrition-calculator.js

/**
 * Generate a complete plan from philosophy modules + user profile.
 * NO AI call. Pure rules-based assembly.
 * Returns a plan object matching the Section 8 output schema.
 */
function generatePlanFromModules(classification, modules, profile) {
  const structure = determinePlanStructure(classification, modules);
  const weeklyTemplate = buildWeeklyTemplate(structure, classification, modules);
  const populatedWeek = populateExercises(weeklyTemplate, classification, modules, profile);
  const variedPlan = applyVariation(populatedWeek, structure, modules);
  const nutrition = calculateNutrition(classification, modules, profile);
  const hydration = calculateHydration(classification, modules, profile);
  const adaptationRules = buildAdaptationRules(classification, modules);
  const rationale = buildRationale(classification, modules, structure);

  return {
    plan_metadata: {
      generated_at: new Date().toISOString(),
      philosophy_modules_used: modules.map(m => m.id),
      module_versions: Object.fromEntries(modules.map(m => [m.id, m.version])),
      plan_version: '1.0',
      generation_source: 'rules_engine'
    },
    athlete_summary: {
      level: classification.level,
      sport_profile: classification.sportProfile,
      primary_goal: classification.primaryGoal,
      constraints: {
        days_per_week: parseInt(profile.daysPerWeek || profile.availableDaysPerWeek) || 3,
        session_duration: (profile.sessionLength || 45) + 'min',
        equipment: classification.equipmentAccess,
        injuries: profile.injuries || []
      },
      recovery_state: classification.recoveryState
    },
    plan_structure: structure,
    weekly_template: variedPlan.weeklyTemplate || populatedWeek,
    progression_logic: variedPlan.progressionLogic || buildProgressionLogic(classification, modules),
    nutrition_strategy: nutrition,
    hydration_strategy: hydration,
    adaptation_rules: adaptationRules,
    watchouts: buildWatchouts(classification, modules, profile),
    rationale: rationale,
    assumptions: buildAssumptions(classification, profile),
    disclaimer: 'This plan provides general wellness guidance and is not a substitute for professional medical advice. Consult a healthcare provider before starting any new exercise or nutrition program.'
  };
}

// ── Plan Structure ──────────────────────────────────────────────────────────

function determinePlanStructure(classification, modules) {
  const days = parseInt(classification.trainingFrequency) || 3;
  const effectiveDays = Math.min(Math.max(days, 2), 7);
  let splitType, splitRationale;

  if (['strength', 'general_fitness'].includes(classification.sportProfile)) {
    const splitTable = {
      2: { split: 'full_body', rationale: 'Maximizes frequency per muscle with limited sessions' },
      3: { split: classification.level === 'beginner' ? 'full_body' : 'upper_lower', rationale: 'Balanced frequency and recovery' },
      4: { split: classification.level === 'advanced' ? 'ppl' : 'upper_lower', rationale: 'Allows more volume per session while maintaining frequency' },
      5: { split: classification.level === 'advanced' ? 'ppl' : 'upper_lower', rationale: 'Sufficient volume with adequate recovery' },
      6: { split: 'ppl', rationale: 'Advanced split with adequate recovery — requires good recovery capacity' },
      7: { split: 'ppl', rationale: 'High-frequency training — monitor recovery closely' }
    };
    const entry = splitTable[effectiveDays] || splitTable[3];
    splitType = entry.split;
    splitRationale = entry.rationale;
  } else if (classification.sportProfile === 'endurance') {
    splitType = 'endurance';
    splitRationale = 'Built around key quality sessions with easy runs/rides filling remaining days';
  } else if (classification.sportProfile === 'hybrid') {
    splitType = 'hybrid';
    splitRationale = 'Balanced multi-sport distribution with concurrent training management';
  } else {
    splitType = effectiveDays <= 3 ? 'full_body' : 'upper_lower';
    splitRationale = 'General fitness approach balancing strength and conditioning';
  }

  return {
    duration_weeks: determineDuration(classification),
    mesocycle_length: classification.level === 'beginner' ? 4 : (classification.level === 'advanced' ? 3 : 4),
    days_per_week: effectiveDays,
    split_type: splitType,
    split_rationale: splitRationale,
    deload_frequency: determineDeloadFrequency(classification, modules)
  };
}

function determineDuration(classification) {
  const survey = getSurveyData();
  // If event-based, use event-specific durations
  if (survey && survey.raceType) {
    const eventDurations = {
      'fiveK': classification.level === 'beginner' ? 10 : 6,
      'tenK': classification.level === 'beginner' ? 12 : 8,
      'halfMarathon': 14,
      'marathon': 18,
      'ultra': 20,
      'halfIronman': 18,
      'ironman': 24,
      'olympic': 14,
      'sprint': 10
    };
    return eventDurations[survey.raceType] || 12;
  }
  // Default by level
  if (classification.level === 'beginner') return 8;
  if (classification.level === 'advanced') return 12;
  return 12;
}

function determineDeloadFrequency(classification, modules) {
  if (classification.level === 'advanced') return 'Every 3rd week (reactive — based on fatigue signals)';
  if (classification.level === 'intermediate') return 'Every 4th week (proactive deload)';
  return 'Every 4th week (reduce volume 40-50%, maintain technique)';
}

// ── Weekly Template ─────────────────────────────────────────────────────────

function buildWeeklyTemplate(structure, classification, modules) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const template = {};

  if (structure.split_type === 'endurance') {
    return buildEnduranceTemplate(structure, classification, modules);
  }
  if (structure.split_type === 'hybrid') {
    return buildHybridTemplate(structure, classification, modules);
  }

  // Strength-based splits
  const trainingDays = structure.days_per_week;
  const sessionTypes = getSessionTypesForSplit(structure.split_type, trainingDays);

  // Distribute training days with rest between hard sessions
  const schedule = distributeTrainingDays(trainingDays, days.length);

  let sessionIdx = 0;
  for (let i = 0; i < 7; i++) {
    const day = days[i];
    if (schedule[i] && sessionIdx < sessionTypes.length) {
      const sType = sessionTypes[sessionIdx];
      template[day] = {
        session_type: sType.type,
        purpose: sType.purpose,
        duration: (parseInt(classification.sessionDuration) || 45) + 'min'
      };
      sessionIdx++;
    } else {
      template[day] = {
        session_type: 'rest',
        purpose: 'Recovery and adaptation'
      };
    }
  }

  // For beginners with hybrid interest, add a mobility/cardio day
  if (classification.level === 'beginner' && trainingDays >= 3) {
    const restDays = days.filter(d => template[d].session_type === 'rest');
    if (restDays.length > 0) {
      const mobilityDay = restDays[Math.floor(restDays.length / 2)];
      template[mobilityDay] = {
        session_type: 'mobility',
        purpose: 'Active recovery, flexibility, and mobility work',
        duration: '20min'
      };
    }
  }

  return template;
}

function getSessionTypesForSplit(split, days) {
  const sessions = {
    'full_body': [
      { type: 'full_body', purpose: 'Full-body strength — compound movements' },
      { type: 'full_body', purpose: 'Full-body strength — variation emphasis' },
      { type: 'full_body', purpose: 'Full-body strength — progressive overload focus' },
    ],
    'upper_lower': [
      { type: 'upper', purpose: 'Upper body — push and pull compounds' },
      { type: 'lower', purpose: 'Lower body — squat and hinge patterns' },
      { type: 'upper', purpose: 'Upper body — hypertrophy/volume focus' },
      { type: 'lower', purpose: 'Lower body — unilateral and accessory focus' },
      { type: 'upper', purpose: 'Upper body — strength emphasis' },
    ],
    'ppl': [
      { type: 'push', purpose: 'Push — chest, shoulders, triceps' },
      { type: 'pull', purpose: 'Pull — back, biceps, rear delts' },
      { type: 'legs', purpose: 'Legs — quads, hamstrings, glutes, calves' },
      { type: 'push', purpose: 'Push — volume/hypertrophy emphasis' },
      { type: 'pull', purpose: 'Pull — strength emphasis' },
      { type: 'legs', purpose: 'Legs — unilateral and posterior chain focus' },
    ]
  };
  return (sessions[split] || sessions['full_body']).slice(0, days);
}

function distributeTrainingDays(trainingDays, totalDays) {
  // Spread training days evenly across the week
  const schedule = new Array(totalDays).fill(false);
  if (trainingDays >= totalDays) {
    schedule.fill(true);
    // Always keep at least 1 rest day
    schedule[6] = false;
    return schedule;
  }

  const defaultSchedules = {
    2: [true, false, false, true, false, false, false],    // Mon, Thu
    3: [true, false, true, false, true, false, false],     // Mon, Wed, Fri
    4: [true, true, false, true, true, false, false],      // Mon, Tue, Thu, Fri
    5: [true, true, true, true, true, false, false],       // Mon-Fri
    6: [true, true, true, true, true, true, false],        // Mon-Sat
  };
  return defaultSchedules[trainingDays] || defaultSchedules[3];
}

function buildEnduranceTemplate(structure, classification, modules) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const template = {};
  const td = structure.days_per_week;
  const sport = classification.sportProfile;
  const survey = getSurveyData();
  const isCycling = survey?.sport === 'cycling';

  if (td <= 3) {
    // Minimal endurance: 1 easy + 1 quality + 1 long
    const sched = distributeTrainingDays(td, 7);
    let idx = 0;
    const sessionOrder = [
      { session_type: isCycling ? 'endurance_ride' : 'easy_run', purpose: 'Aerobic base building (Zone 2)', zone: 'Z2', duration: '30-45min' },
      { session_type: isCycling ? 'sweet_spot_intervals' : 'tempo_run', purpose: 'Quality session — threshold development', zone: 'Z3-Z4', duration: '35-45min' },
      { session_type: isCycling ? 'long_ride' : 'long_run', purpose: 'Endurance — time on feet/saddle', zone: 'Z1-Z2', duration: '60-90min' },
    ];
    for (let i = 0; i < 7; i++) {
      if (sched[i] && idx < sessionOrder.length) {
        template[days[i]] = sessionOrder[idx];
        idx++;
      } else {
        template[days[i]] = { session_type: 'rest', purpose: 'Recovery' };
      }
    }
  } else {
    // 4+ days: 2 easy + 1-2 quality + 1 long + optional strength
    template['monday'] = { session_type: isCycling ? 'endurance_ride' : 'easy_run', purpose: 'Aerobic base (Zone 2)', zone: 'Z2', duration: '40min' };
    template['tuesday'] = td >= 5
      ? { session_type: isCycling ? 'sweet_spot_intervals' : 'interval_run', purpose: 'VO2max / speed development', zone: 'Z4-Z5', duration: '45min' }
      : { session_type: 'rest', purpose: 'Recovery' };
    template['wednesday'] = { session_type: isCycling ? 'tempo_ride' : 'tempo_run', purpose: 'Threshold development', zone: 'Z3-Z4', duration: '40-50min' };
    template['thursday'] = td >= 5
      ? { session_type: isCycling ? 'endurance_ride' : 'easy_run', purpose: 'Recovery/aerobic maintenance', zone: 'Z1-Z2', duration: '30min' }
      : { session_type: 'rest', purpose: 'Recovery' };
    template['friday'] = td >= 6
      ? { session_type: 'full_body', purpose: 'Strength — supporting endurance performance', duration: '30-40min' }
      : { session_type: 'rest', purpose: 'Recovery — prepare for long session' };
    template['saturday'] = { session_type: isCycling ? 'long_ride' : 'long_run', purpose: 'Long endurance — build aerobic capacity', zone: 'Z1-Z2', duration: '75-120min' };
    template['sunday'] = { session_type: 'rest', purpose: 'Full recovery day' };

    // Ensure at least 1 rest day
    if (td < 7) {
      const restCount = Object.values(template).filter(d => d.session_type === 'rest').length;
      if (restCount === 0) {
        template['sunday'] = { session_type: 'rest', purpose: 'Mandatory recovery day' };
      }
    }
  }

  // Apply recovery state adjustment
  if (classification.recoveryState === 'low') {
    for (const day of days) {
      if (template[day].zone && template[day].zone.includes('Z5')) {
        template[day].zone = 'Z2-Z3';
        template[day].purpose += ' (reduced intensity — recovery priority)';
      }
    }
  }

  return template;
}

function buildHybridTemplate(structure, classification, modules) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const template = {};
  const td = structure.days_per_week;
  const survey = getSurveyData();
  const isTri = survey?.sport === 'triathlon';

  if (isTri) {
    // Triathlon: swim 10-12%, bike 50-55%, run 30-35%
    if (td >= 6) {
      template['monday'] = { session_type: 'cardio_swim', purpose: 'Swim — technique and threshold', duration: '45-60min' };
      template['tuesday'] = { session_type: 'cardio_bike', purpose: 'Bike — endurance (Zone 2)', zone: 'Z2', duration: '60-90min' };
      template['wednesday'] = { session_type: 'cardio_run', purpose: 'Run — quality intervals', zone: 'Z3-Z4', duration: '45min' };
      template['thursday'] = { session_type: 'cardio_bike', purpose: 'Bike — sweet spot / threshold', zone: 'Z3-Z4', duration: '60min' };
      template['friday'] = { session_type: 'cardio_swim', purpose: 'Swim — endurance and drills', duration: '45min' };
      template['saturday'] = { session_type: 'brick', purpose: 'Brick — bike-to-run transition practice', duration: '90-120min' };
      template['sunday'] = { session_type: 'rest', purpose: 'Full recovery day' };
    } else {
      // Fewer days: compress
      template['monday'] = { session_type: 'cardio_swim', purpose: 'Swim — technique and endurance', duration: '45min' };
      template['tuesday'] = { session_type: 'rest', purpose: 'Recovery' };
      template['wednesday'] = { session_type: 'cardio_bike', purpose: 'Bike — quality session', zone: 'Z3', duration: '60min' };
      template['thursday'] = td >= 4 ? { session_type: 'cardio_run', purpose: 'Run — easy aerobic', zone: 'Z2', duration: '40min' } : { session_type: 'rest', purpose: 'Recovery' };
      template['friday'] = { session_type: 'rest', purpose: 'Recovery' };
      template['saturday'] = { session_type: 'brick', purpose: 'Brick — bike-to-run', duration: '75-90min' };
      template['sunday'] = { session_type: 'rest', purpose: 'Recovery' };
    }
  } else {
    // General hybrid: strength + cardio mix
    if (td <= 3) {
      template['monday'] = { session_type: 'full_body', purpose: 'Full-body strength', duration: '40min' };
      template['tuesday'] = { session_type: 'rest', purpose: 'Recovery' };
      template['wednesday'] = { session_type: 'cardio_run', purpose: 'Cardio — easy aerobic work', zone: 'Z2', duration: '30min' };
      template['thursday'] = { session_type: 'rest', purpose: 'Recovery' };
      template['friday'] = { session_type: 'full_body', purpose: 'Full-body strength — variation', duration: '40min' };
      template['saturday'] = { session_type: 'rest', purpose: 'Recovery' };
      template['sunday'] = { session_type: 'rest', purpose: 'Recovery' };
    } else {
      template['monday'] = { session_type: 'upper', purpose: 'Upper body strength', duration: '45min' };
      template['tuesday'] = { session_type: 'cardio_run', purpose: 'Cardio — tempo or intervals', zone: 'Z3', duration: '35min' };
      template['wednesday'] = { session_type: 'lower', purpose: 'Lower body strength', duration: '45min' };
      template['thursday'] = td >= 5 ? { session_type: 'cardio_run', purpose: 'Easy run — aerobic base', zone: 'Z2', duration: '30min' } : { session_type: 'rest', purpose: 'Recovery' };
      template['friday'] = td >= 5 ? { session_type: 'full_body', purpose: 'Full-body strength or HIIT', duration: '40min' } : { session_type: 'rest', purpose: 'Recovery' };
      template['saturday'] = td >= 6 ? { session_type: 'long_run', purpose: 'Long endurance session', zone: 'Z2', duration: '60-90min' } : { session_type: 'rest', purpose: 'Recovery' };
      template['sunday'] = { session_type: 'rest', purpose: 'Full recovery day' };
    }
  }

  return template;
}

// ── Exercise Population ─────────────────────────────────────────────────────

function populateExercises(weeklyTemplate, classification, modules, profile) {
  const populated = JSON.parse(JSON.stringify(weeklyTemplate));
  const recentExercises = [];

  for (const [day, session] of Object.entries(populated)) {
    if (session.session_type === 'rest' || session.session_type === 'mobility') continue;

    // Skip cardio sessions — they don't need exercise selection from the library
    if (['cardio_run', 'cardio_bike', 'cardio_swim', 'brick',
         'easy_run', 'tempo_run', 'interval_run', 'long_run',
         'endurance_ride', 'sweet_spot_intervals', 'tempo_ride', 'long_ride'].includes(session.session_type)) {
      continue;
    }

    // Strength session: select exercises
    if (typeof selectExercises === 'function') {
      const exercises = selectExercises(session.session_type, classification, profile, recentExercises);
      if (exercises && exercises.length > 0) {
        session.exercises = exercises;
        recentExercises.push(...exercises.map(e => e.exercise_id));
      }
    }

    // Add warm-up/cool-down guidance based on age
    session.warm_up = getWarmUpGuidance(classification);
    session.cool_down = getCoolDownGuidance(classification);
  }

  return populated;
}

function getWarmUpGuidance(classification) {
  const age = classification.ageGroup;
  if (age === '60+') return '12-15 min: joint circles, dynamic stretching, balance work, gradual cardiovascular ramp-up';
  if (age === '50-59') return '10-15 min: joint circles, dynamic stretching, progressive loading';
  if (age === '40-49') return '8-12 min: dynamic movement prep, light ramp-up sets';
  if (age === '30-39') return '5-10 min: dynamic warm-up before all sessions';
  return '5 min: dynamic movement prep and activation';
}

function getCoolDownGuidance(classification) {
  if (classification.level === 'beginner') return '5 min: light stretching, focus on muscles worked';
  return '5-10 min: static stretching (30-60s holds), foam rolling as needed';
}

// ── Variation Engine ────────────────────────────────────────────────────────

function applyVariation(weeklyTemplate, structure, modules) {
  // Build progression logic string
  let progressionLogic = '';

  if (['strength', 'general_fitness'].includes(modules[0]?.applies_when?.sport_profile || '')) {
    progressionLogic = buildStrengthProgression(structure, modules);
  } else if (modules.some(m => m.category && m.category.startsWith('sport_endurance'))) {
    progressionLogic = buildEnduranceProgression(structure, modules);
  } else {
    progressionLogic = buildGeneralProgression(structure);
  }

  return {
    weeklyTemplate,
    progressionLogic
  };
}

function buildStrengthProgression(structure, modules) {
  const mesocycle = structure.mesocycle_length || 4;
  return `${mesocycle}-week mesocycles with rep scheme undulation: ` +
    `Week 1: 4x8-10 RPE 7 (accumulation). ` +
    `Week 2: 5x5-6 RPE 8 (strength). ` +
    `Week 3: 3x10-12 RPE 8-9 (metabolic stress). ` +
    `Week ${mesocycle}: Deload — 3x8 RPE 5-6 (recovery/technique). ` +
    `Between mesocycles: swap Tier 2 compounds and all Tier 3 accessories. ` +
    `Progression method: double progression (add reps within range, then increase weight).`;
}

function buildEnduranceProgression(structure, modules) {
  return `Volume increases ${structure.days_per_week <= 3 ? '5-10%' : '10-15%'} weeks 1-3, ` +
    `cutback week ${structure.mesocycle_length} (reduce 20-30%). ` +
    `Quality sessions progress from base-building tempo to race-specific intensity across mesocycles. ` +
    `Long run/ride increases by 10-15 minutes per week with structure variation ` +
    `(all easy → tempo finish → progression → cutback easy).`;
}

function buildGeneralProgression(structure) {
  return `${structure.mesocycle_length}-week blocks: Weeks 1-3 progressive overload ` +
    `(add reps then weight), Week ${structure.mesocycle_length} deload. ` +
    `Cardio sessions progress from steady-state to more structured intervals over 4-week cycles.`;
}

function buildProgressionLogic(classification, modules) {
  if (classification.level === 'beginner') {
    return 'Linear progression: add 1-2 reps per session within target range, increase weight when top of range is hit consistently. Focus on form mastery before load progression.';
  }
  if (classification.level === 'advanced') {
    return 'RPE/RIR-based autoregulation with block periodization. Work to prescribed RPE, adjust load accordingly. Deload reactively based on fatigue signals.';
  }
  return 'Double progression: add reps within target range, increase weight when top of range is hit for all sets. RPE-guided with planned deloads every 4th week.';
}

// ── Adaptation Rules ────────────────────────────────────────────────────────

function buildAdaptationRules(classification, modules) {
  return {
    missed_session: classification.sportProfile === 'endurance'
      ? 'If quality session missed, shift to next available day or convert to easy run. Never stack two quality sessions back-to-back.'
      : 'If session missed, continue with next scheduled session. Do not try to make up missed sessions by doubling up. A missed day is not a failed week.',
    too_hard_feedback: classification.level === 'beginner'
      ? 'Reduce session volume by 1-2 exercises and intensity by 1 RPE point next week. If persists 2 weeks, reassess training days or session length.'
      : 'Reduce volume by 20% next week. If persists 2 weeks, insert an extra deload week and reassess training load.',
    too_easy_feedback: classification.level === 'advanced'
      ? 'Increase working sets by 1 per exercise or add 0.5 RPE to key sets. Consider increasing training frequency if recovery supports it.'
      : 'Increase volume by 10% (add 1 set per major exercise) or add 1-2 reps per set. Do not increase load until next mesocycle.'
  };
}

// ── Watchouts, Rationale, Assumptions ───────────────────────────────────────

function buildWatchouts(classification, modules, profile) {
  const watchouts = [];

  // Age-specific
  if (['50-59', '60+'].includes(classification.ageGroup)) {
    watchouts.push('Extended warm-up is mandatory for this age group. Monitor joint soreness closely and prioritize mobility work.');
  }
  if (classification.ageGroup === '40-49') {
    watchouts.push('Joint-friendly exercise alternatives are recommended. Include dedicated mobility work at least 2x/week.');
  }

  // Injury-related
  if (classification.injuryHistory === 'minor_current') {
    const injuries = profile.injuries || [];
    if (injuries.length > 0) {
      watchouts.push(`Current injury considerations: ${injuries.join(', ')}. Exercises have been selected to avoid aggravating these areas. Monitor for pain and stop if symptoms worsen.`);
    }
  }
  if (classification.injuryHistory === 'chronic') {
    watchouts.push('Chronic condition detected. Consider consulting with a physical therapist to create a complementary rehabilitation program.');
  }

  // Recovery
  if (classification.recoveryState === 'low') {
    watchouts.push('Recovery state is currently low. This week prioritizes recovery: intensity has been reduced and volume is conservative. Focus on sleep and nutrition.');
  }

  // Beginner-specific
  if (classification.level === 'beginner') {
    watchouts.push('Focus on learning proper form before increasing weight. RPE should stay at 6-7 (3-4 reps in reserve) for the first 4 weeks.');
  }

  // Nutrition-specific
  if (classification.primaryGoal === 'fat_loss') {
    watchouts.push('During a caloric deficit, prioritize protein intake and maintain training intensity. Reduce volume slightly if energy is consistently low.');
  }

  return watchouts;
}

function buildRationale(classification, modules, structure) {
  const parts = [];

  parts.push(`This plan uses a ${structure.split_type} structure with ${structure.days_per_week} training days per week`);

  if (structure.split_type === 'endurance') {
    parts.push(`built around polarized training (80% easy, 20% hard) for ${classification.sportProfile} development`);
  } else {
    parts.push(`optimized for ${classification.primaryGoal.replace('_', ' ')}`);
  }

  parts.push(`at the ${classification.level} level`);

  if (classification.recoveryState !== 'good') {
    parts.push(`. Current recovery state is ${classification.recoveryState}, so intensity has been moderated this week`);
  }

  const moduleCount = modules.length;
  parts.push(`. Guided by ${moduleCount} philosophy modules covering training, nutrition, and safety evidence.`);

  parts.push(' This plan provides general wellness guidance and should be adjusted based on how you feel.');

  return parts.join(' ');
}

function buildAssumptions(classification, profile) {
  const assumptions = [];

  if (classification.level === 'beginner') {
    assumptions.push('User can perform basic movement patterns (squat, hinge, push, pull) with light weight');
  }
  if (classification.sportProfile === 'endurance') {
    assumptions.push('User can sustain continuous aerobic activity for at least 20-30 minutes');
  }
  if (classification.injuryHistory === 'none') {
    assumptions.push('No current acute injuries or chronic conditions');
  }

  assumptions.push(`User has access to ${classification.equipmentAccess.replace('_', ' ')} equipment`);
  assumptions.push(`User can commit to ${classification.trainingFrequency} training sessions per week`);
  assumptions.push('Profile data (age, weight, height) is reasonably accurate');

  return assumptions;
}
