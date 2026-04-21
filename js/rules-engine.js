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

// ── Offseason Detection ────────────────────────────────────────────────────

/**
 * Detect if the user is in an offseason/transition phase.
 * Offseason = within 2-6 weeks after a goal race, or explicit training_phase.
 */
function isOffseason(profile, classification) {
  if (profile.trainingPhase === 'offseason' || profile.training_phase === 'offseason') return true;
  try {
    const events = JSON.parse(localStorage.getItem('events') || '[]');
    const now = new Date();
    const sixWeeksAgo = new Date(now);
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
    const recentCompletedRace = events.find(e => {
      if (!e.date || e.status !== 'completed') return false;
      const raceDate = new Date(e.date);
      return raceDate >= sixWeeksAgo && raceDate <= now;
    });
    if (recentCompletedRace) return true;
  } catch { /* ignore */ }
  return false;
}

/**
 * Get peak weekly volume for offseason calculation.
 */
function getPeakWeeklyVolume(profile) {
  const peakMPW = parseFloat(profile.peakWeeklyMileage || profile.peak_mpw);
  if (peakMPW && peakMPW > 0) return peakMPW;
  const currentMPW = parseFloat(profile.weeklyMileage || profile.weekly_mileage);
  if (currentMPW && currentMPW > 0) return currentMPW;
  return 30;
}

// ── Marathon Long Run Scaling ──────────────────────────────────────────────

/**
 * Determine number of 20+ mile runs for a marathon training block.
 * Based on runner experience and weekly mileage capacity.
 */
function getMarathonLongRunScaling(profile, classification) {
  const mpw = parseFloat(profile.weeklyMileage || profile.weekly_mileage) || 30;
  const marathonCount = parseInt(profile.marathonsCompleted || profile.marathons_completed) || 0;

  if (marathonCount === 0 || mpw < 35) {
    return { twentyPlusMilers: [0, 1], longRunPeak: '18-20 miles', marathonPaceInLongRun: false,
      note: 'Some beginner plans (Hansons) cap at 16 mi and rely on cumulative fatigue' };
  }
  if (marathonCount <= 2 || mpw < 45) {
    return { twentyPlusMilers: [1, 2], longRunPeak: '20 miles', marathonPaceInLongRun: false,
      note: 'One 20-miler is sufficient; second only if recovery permits' };
  }
  if (mpw < 60) {
    return { twentyPlusMilers: [2, 4], longRunPeak: '20-22 miles', marathonPaceInLongRun: true,
      note: 'Pfitzinger 55mpw plan prescribes 3x 20-milers' };
  }
  return { twentyPlusMilers: [4, 5], longRunPeak: '20-22 miles', marathonPaceInLongRun: true,
    note: 'Include 6-12 miles at marathon pace within each 20-miler for race-specific endurance' };
}

// ── Interval Session Rules for Time-Goal Runners ───────────────────────────

/**
 * Determine if the runner has a specific time goal and build interval guidance.
 */
function getIntervalSessionGuidance(profile, classification) {
  // profile.time_goal / timeGoal are legacy boolean flags from the old
  // onboarding schema. profile.goal === 'compete' is another legacy
  // signal. The new race.goal enum uses 'get_faster' and 'pr' — both
  // mean "athlete cares about time" so either counts here.
  const hasTimeGoal = profile.timeGoal || profile.time_goal
    || profile.goalType === 'time'
    || profile.goal === 'compete'
    || profile.goal === 'get_faster' || profile.goal === 'pr';
  if (!hasTimeGoal) return null;

  const mpw = parseFloat(profile.weeklyMileage || profile.weekly_mileage) || 30;
  const isAdvanced = classification.level === 'advanced';
  const intervalVolumePct = isAdvanced ? 0.10 : 0.075;
  const intervalMiles = Math.max(2, Math.round(mpw * intervalVolumePct * 10) / 10);

  const survey = typeof getSurveyData === 'function' ? getSurveyData() : null;
  const raceType = survey?.raceType || '';
  let repeatDistance, exampleSession;

  if (['fiveK'].includes(raceType)) {
    repeatDistance = '400m';
    exampleSession = '10-12 x 400m at 5K pace, 60-90s jog recovery';
  } else if (['tenK'].includes(raceType)) {
    repeatDistance = '800m-1K';
    exampleSession = '6-8 x 800m at I-pace, 2-3 min jog recovery';
  } else if (['halfMarathon'].includes(raceType)) {
    repeatDistance = '1K-1200m';
    exampleSession = '5-6 x 1K at I-pace, 2-3 min jog recovery';
  } else {
    repeatDistance = '800m-1600m';
    exampleSession = '4-5 x 1200m at T/I-pace blend, 3 min recovery';
  }

  return {
    required: true,
    repeatDistance,
    exampleSession,
    intervalVolumeMiles: intervalMiles,
    placement: 'Day following an easy day. Never after a long run or tempo.',
    progression: 'Start with shorter repeats (400-800m), progress to longer (1K-1600m) as race approaches.'
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
    // Check for offseason phase
    const profile = typeof getProfileForPhilosophy === 'function' ? getProfileForPhilosophy() : {};
    if (isOffseason(profile, classification)) {
      splitType = 'offseason_endurance';
      splitRationale = 'Offseason/transition phase: reduced volume (50-60% of peak), focus on speed, hills, and strength';
    } else {
      splitType = 'endurance';
      splitRationale = 'Built around key quality sessions with easy runs/rides filling remaining days';
    }
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

  if (structure.split_type === 'offseason_endurance') {
    return buildOffseasonTemplate(structure, classification, modules);
  }
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

  // Inject interval session for time-goal runners (replaces one easy run with intervals)
  const profile = typeof getProfileForPhilosophy === 'function' ? getProfileForPhilosophy() : {};
  const intervalGuidance = getIntervalSessionGuidance(profile, classification);
  if (intervalGuidance) {
    // Find an easy run day that follows another easy/rest day — best placement
    const daysList = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (let i = 1; i < daysList.length; i++) {
      const prevDay = daysList[i - 1];
      const thisDay = daysList[i];
      const prevType = template[prevDay]?.session_type || '';
      const thisType = template[thisDay]?.session_type || '';
      if ((prevType === 'rest' || prevType === 'easy_run' || prevType === 'endurance_ride') &&
          (thisType === 'easy_run' || thisType === 'endurance_ride')) {
        template[thisDay] = {
          session_type: 'interval_run',
          purpose: `VO2max intervals: ${intervalGuidance.exampleSession}`,
          zone: 'Z4-Z5',
          duration: '45min',
          interval_guidance: intervalGuidance
        };
        break;
      }
    }
  }

  return template;
}

/**
 * Build offseason/transition phase template.
 * Volume: 50-60% of peak. Focus: speed, hills, strength. No long runs.
 */
function buildOffseasonTemplate(structure, classification, modules) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const template = {};
  const td = structure.days_per_week;
  const profile = typeof getProfileForPhilosophy === 'function' ? getProfileForPhilosophy() : {};
  const peakVolume = getPeakWeeklyVolume(profile);
  const offseasonVolume = Math.round(peakVolume * 0.55); // 50-60% midpoint

  if (td <= 3) {
    // Minimal offseason: easy run + strides/hills + strength
    template['monday'] = { session_type: 'easy_run', purpose: `Easy aerobic run (${Math.round(offseasonVolume * 0.4)} mi target). Run without a watch if you want.`, zone: 'Z1-Z2', duration: '30-40min' };
    template['tuesday'] = { session_type: 'rest', purpose: 'Recovery' };
    template['wednesday'] = { session_type: 'full_body', purpose: 'Strength — compound lower body (squats, deadlifts, lunges) + single-leg work. Offseason = best time to prioritize gym.', duration: '45-60min' };
    template['thursday'] = { session_type: 'rest', purpose: 'Recovery' };
    template['friday'] = { session_type: 'strides_run', purpose: 'Easy run with 6-10 x 80-100m strides at near-sprint effort, full recovery between. Builds neuromuscular speed and running economy.', zone: 'Z2 + strides', duration: '30-35min' };
    template['saturday'] = { session_type: 'rest', purpose: 'Recovery' };
    template['sunday'] = { session_type: 'rest', purpose: 'Recovery' };
  } else if (td <= 5) {
    // Moderate offseason: 2 easy + strides + hills + 2 strength
    template['monday'] = { session_type: 'easy_run', purpose: 'Easy aerobic run. Enjoy it — this is your time.', zone: 'Z1-Z2', duration: '30-40min' };
    template['tuesday'] = { session_type: 'full_body', purpose: 'Strength session 1 — compound movements (squats, deadlifts, step-ups) + running-specific single-leg work.', duration: '45-60min' };
    template['wednesday'] = { session_type: 'strides_run', purpose: 'Easy run + 8-10 x 80-100m strides (near-sprint, full recovery). Neuromuscular speed development.', zone: 'Z2 + strides', duration: '30-35min' };
    template['thursday'] = td >= 5 ? { session_type: 'full_body', purpose: 'Strength session 2 — same focus, different exercise variation.', duration: '45-60min' } : { session_type: 'rest', purpose: 'Recovery' };
    template['friday'] = { session_type: 'hill_repeats', purpose: 'Hill repeats: 6-10 x 60-90s hard effort. Builds power and recruits muscle fibers flat running neglects.', zone: 'Z4', duration: '35min' };
    template['saturday'] = td >= 5 ? { session_type: 'easy_run', purpose: 'Easy run — trail or new route for fun.', zone: 'Z1-Z2', duration: '30-40min' } : { session_type: 'rest', purpose: 'Recovery' };
    template['sunday'] = { session_type: 'rest', purpose: 'Full recovery day' };
  } else {
    // High frequency offseason (6 days)
    template['monday'] = { session_type: 'easy_run', purpose: 'Easy aerobic run', zone: 'Z1-Z2', duration: '30-40min' };
    template['tuesday'] = { session_type: 'full_body', purpose: 'Strength session 1 — heavy compound movements', duration: '50-60min' };
    template['wednesday'] = { session_type: 'strides_run', purpose: 'Easy run + 8-10 strides', zone: 'Z2 + strides', duration: '35min' };
    template['thursday'] = { session_type: 'full_body', purpose: 'Strength session 2', duration: '50-60min' };
    template['friday'] = { session_type: 'hill_repeats', purpose: 'Hill repeats: 8-10 x 60-90s', zone: 'Z4', duration: '35min' };
    template['saturday'] = { session_type: 'easy_run', purpose: 'Easy run — explore a trail or do a fun 5K', zone: 'Z1-Z2', duration: '30-45min' };
    template['sunday'] = { session_type: 'rest', purpose: 'Full recovery day' };
  }

  // Add offseason metadata to structure
  structure.offseason_info = {
    peak_volume: peakVolume,
    offseason_volume: offseasonVolume,
    duration_weeks: '2-6 weeks',
    focus: 'Speed development, hill work, strength training'
  };

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

// ── Volume-to-Time Scaling ─────────────────────────────────────────────────

var VOLUME_TIME_TABLES = {
  mixed: {
    30: { min_exercises: 3, max_exercises: 4, sets_per_exercise: 3, rest_seconds: [60, 90], warmup_minutes: 5 },
    45: { min_exercises: 4, max_exercises: 6, sets_per_exercise: 3, rest_seconds: [90, 120], warmup_minutes: 6 },
    60: { min_exercises: 5, max_exercises: 7, sets_per_exercise: 3, rest_seconds: [90, 150], warmup_minutes: 8 },
    75: { min_exercises: 6, max_exercises: 8, sets_per_exercise: 4, rest_seconds: [120, 180], warmup_minutes: 8 },
    90: { min_exercises: 7, max_exercises: 10, sets_per_exercise: 4, rest_seconds: [120, 180], warmup_minutes: 10 }
  },
  compound_heavy: {
    30: { min_exercises: 2, max_exercises: 3, sets_per_exercise: 3, rest_seconds: [120, 180], warmup_minutes: 6 },
    45: { min_exercises: 3, max_exercises: 4, sets_per_exercise: 3, rest_seconds: [120, 180], warmup_minutes: 8 },
    60: { min_exercises: 4, max_exercises: 5, sets_per_exercise: 4, rest_seconds: [150, 180], warmup_minutes: 8 },
    75: { min_exercises: 4, max_exercises: 6, sets_per_exercise: 4, rest_seconds: [150, 210], warmup_minutes: 10 },
    90: { min_exercises: 5, max_exercises: 7, sets_per_exercise: 4, rest_seconds: [150, 210], warmup_minutes: 10 }
  },
  isolation_heavy: {
    30: { min_exercises: 4, max_exercises: 5, sets_per_exercise: 3, rest_seconds: [45, 75], warmup_minutes: 4 },
    45: { min_exercises: 5, max_exercises: 7, sets_per_exercise: 3, rest_seconds: [60, 90], warmup_minutes: 5 },
    60: { min_exercises: 6, max_exercises: 9, sets_per_exercise: 3, rest_seconds: [60, 90], warmup_minutes: 6 },
    75: { min_exercises: 7, max_exercises: 10, sets_per_exercise: 4, rest_seconds: [60, 90], warmup_minutes: 6 },
    90: { min_exercises: 8, max_exercises: 12, sets_per_exercise: 4, rest_seconds: [60, 90], warmup_minutes: 7 }
  }
};

/**
 * Classify a session as compound_heavy, isolation_heavy, or mixed
 * based on the session type and its required movement patterns.
 */
function classifySessionComposition(sessionType) {
  var compoundPatterns = ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull'];
  var isolationPatterns = ['isolation_arms', 'isolation_legs', 'core'];

  var patterns = typeof getRequiredPatterns === 'function'
    ? getRequiredPatterns(sessionType)
    : { required: [], optional: [] };
  var allPatterns = (patterns.required || []).concat(patterns.optional || []);
  if (allPatterns.length === 0) return 'mixed';

  var compoundCount = 0;
  var isolationCount = 0;
  for (var i = 0; i < allPatterns.length; i++) {
    if (compoundPatterns.indexOf(allPatterns[i]) !== -1) compoundCount++;
    else if (isolationPatterns.indexOf(allPatterns[i]) !== -1) isolationCount++;
  }

  var total = compoundCount + isolationCount || 1;
  if (compoundCount / total >= 0.6) return 'compound_heavy';
  if (isolationCount / total >= 0.6) return 'isolation_heavy';
  return 'mixed';
}

/**
 * Parse session duration from classification into minutes.
 * Handles strings like "45", "30-45", "45-60", "60+", or numbers.
 */
function _parseDurationMinutes(sessionDuration) {
  if (typeof sessionDuration === 'number') return sessionDuration;
  if (!sessionDuration) return 45;
  var str = String(sessionDuration).replace('min', '').trim();
  if (str.indexOf('+') !== -1) return parseInt(str) || 60;
  if (str.indexOf('-') !== -1) {
    var parts = str.split('-');
    return Math.round((parseInt(parts[0]) + parseInt(parts[1])) / 2);
  }
  return parseInt(str) || 45;
}

/**
 * Interpolate between two duration tiers for a non-standard duration.
 */
function _interpolateTier(table, duration) {
  var tiers = [30, 45, 60, 75, 90];

  // Clamp to range
  if (duration <= 30) return table[30];
  if (duration >= 90) return table[90];

  // Find bounding tiers
  var lower = 30, upper = 90;
  for (var i = 0; i < tiers.length - 1; i++) {
    if (duration >= tiers[i] && duration <= tiers[i + 1]) {
      lower = tiers[i];
      upper = tiers[i + 1];
      break;
    }
  }

  if (table[duration]) return table[duration];

  var lEntry = table[lower];
  var uEntry = table[upper];
  var ratio = (duration - lower) / (upper - lower);

  return {
    min_exercises: Math.round(lEntry.min_exercises + (uEntry.min_exercises - lEntry.min_exercises) * ratio),
    max_exercises: Math.round(lEntry.max_exercises + (uEntry.max_exercises - lEntry.max_exercises) * ratio),
    sets_per_exercise: Math.round(lEntry.sets_per_exercise + (uEntry.sets_per_exercise - lEntry.sets_per_exercise) * ratio),
    rest_seconds: [
      Math.round(lEntry.rest_seconds[0] + (uEntry.rest_seconds[0] - lEntry.rest_seconds[0]) * ratio),
      Math.round(lEntry.rest_seconds[1] + (uEntry.rest_seconds[1] - lEntry.rest_seconds[1]) * ratio)
    ],
    warmup_minutes: Math.round(lEntry.warmup_minutes + (uEntry.warmup_minutes - lEntry.warmup_minutes) * ratio)
  };
}

/**
 * Determine session volume parameters based on duration, session composition, and level.
 * Returns { min_exercises, max_exercises, sets_per_exercise, rest_seconds, warmup_minutes }
 */
function determineSessionVolume(sessionDuration, sessionComposition, level) {
  var duration = _parseDurationMinutes(sessionDuration);
  var composition = sessionComposition || 'mixed';
  var table = VOLUME_TIME_TABLES[composition] || VOLUME_TIME_TABLES.mixed;
  var params = _interpolateTier(table, duration);

  // Apply level modifiers
  if (level === 'beginner') {
    params.max_exercises = Math.min(params.min_exercises, 5);
    params.min_exercises = Math.min(params.min_exercises, 5);
    params.rest_seconds = [60, 90];
  } else if (level === 'advanced') {
    // Advanced can push upper end; for compound-heavy, allow extended rest
    if (composition === 'compound_heavy') {
      params.rest_seconds = [Math.max(params.rest_seconds[0], 180), Math.max(params.rest_seconds[1], 300)];
      // Fewer exercises due to extended rest
      params.max_exercises = Math.max(params.min_exercises, params.max_exercises - 1);
    }
  }

  // Hard constraints
  params.min_exercises = Math.max(2, params.min_exercises);
  params.max_exercises = Math.min(12, params.max_exercises);
  params.max_exercises = Math.max(params.min_exercises, params.max_exercises);

  return params;
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

    // Strength session: determine volume params and select exercises
    var sessionComposition = classifySessionComposition(session.session_type);
    var volumeParams = determineSessionVolume(
      session.duration || classification.sessionDuration,
      sessionComposition,
      classification.level
    );
    session.warmup_minutes = volumeParams.warmup_minutes;
    session.session_composition = sessionComposition;

    if (typeof selectExercises === 'function') {
      const exercises = selectExercises(session.session_type, classification, profile, recentExercises, volumeParams);
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

  if (structure.split_type === 'offseason_endurance') {
    progressionLogic = 'Offseason: maintain 50-60% of peak volume for 2-6 weeks. ' +
      'No volume progression — this is active recovery. Strength training can increase in intensity. ' +
      'Speed work (strides, hill sprints) develops neuromuscular qualities without aerobic stress. ' +
      'Transition back to base-building volume when offseason ends.';
  } else if (['strength', 'general_fitness'].includes(modules[0]?.applies_when?.sport_profile || '')) {
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

  // Marathon long run scaling
  const survey = typeof getSurveyData === 'function' ? getSurveyData() : null;
  if (survey?.raceType === 'marathon') {
    const scaling = getMarathonLongRunScaling(profile, classification);
    watchouts.push(`Marathon long run scaling: ${scaling.twentyPlusMilers[0]}-${scaling.twentyPlusMilers[1]} runs of 20+ miles in this block (peak: ${scaling.longRunPeak}). Never more than one 20+ miler per 2-week period. ${scaling.note}`);
    if (scaling.marathonPaceInLongRun) {
      watchouts.push('Include 6-12 miles at marathon pace within 20+ milers to build race-specific endurance.');
    }
  }

  // Offseason watchouts
  if (isOffseason(profile, classification)) {
    const peak = getPeakWeeklyVolume(profile);
    watchouts.push(`Offseason: target ${Math.round(peak * 0.5)}-${Math.round(peak * 0.6)} miles/week (50-60% of peak). Focus on speed, hills, and strength. No long runs exceeding 60 minutes.`);
  }

  // Interval guidance for time-goal runners
  const intervalGuidance = getIntervalSessionGuidance(profile, classification);
  if (intervalGuidance) {
    watchouts.push(`Time-goal training: one weekly interval session is non-negotiable. ${intervalGuidance.exampleSession}. ${intervalGuidance.placement}`);
  }

  return watchouts;
}

function buildRationale(classification, modules, structure) {
  const parts = [];

  parts.push(`This plan uses a ${structure.split_type} structure with ${structure.days_per_week} training days per week`);

  if (structure.split_type === 'offseason_endurance') {
    parts.push(`in offseason/transition phase at 50-60% of peak volume, focusing on speed development, hill work, and strength training`);
  } else if (structure.split_type === 'endurance') {
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
