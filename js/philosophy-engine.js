// philosophy-engine.js — User classification + philosophy module retrieval
// Phase 2 of the Philosophy Engine build

let philosophyModules = null;
let philosophyModulesLoadedAt = null;

// ── Module Loading ──────────────────────────────────────────────────────────

async function loadPhilosophyModules() {
  try {
    // Try Supabase first (latest versions)
    if (typeof supabaseClient !== 'undefined') {
      const { data, error } = await supabaseClient
        .from('philosophy_modules')
        .select('*')
        .eq('is_active', true);
      if (!error && data && data.length > 0) {
        philosophyModules = data;
        localStorage.setItem('philosophy_modules_cache', JSON.stringify(data));
        localStorage.setItem('philosophy_modules_cache_at', new Date().toISOString());
        philosophyModulesLoadedAt = new Date().toISOString();
        console.log(`[IronZ] Loaded ${data.length} philosophy modules from Supabase`);
        return;
      }
    }
  } catch (e) {
    console.warn('[IronZ] Supabase module load failed, using fallback:', e.message);
    if (typeof reportCaughtError === 'function') reportCaughtError(e, { context: 'philosophy_engine', action: 'load_from_supabase' });
  }

  // Fall back to localStorage cache
  try {
    const cached = localStorage.getItem('philosophy_modules_cache');
    if (cached) {
      philosophyModules = JSON.parse(cached);
      philosophyModulesLoadedAt = localStorage.getItem('philosophy_modules_cache_at');
      console.log(`[IronZ] Loaded ${philosophyModules.length} modules from cache`);
      return;
    }
  } catch (e) {
    console.warn('[IronZ] Cache parse failed:', e.message);
    if (typeof reportCaughtError === 'function') reportCaughtError(e, { context: 'philosophy_engine', action: 'parse_cache' });
  }

  // Fall back to static JSON file
  try {
    const response = await fetch('sources-of-truth/philosophy/modules_static.json');
    if (response.ok) {
      philosophyModules = await response.json();
      philosophyModulesLoadedAt = new Date().toISOString();
      console.log(`[IronZ] Loaded ${philosophyModules.length} modules from static file`);
    }
  } catch (e) {
    console.error('[IronZ] All module loading methods failed:', e.message);
    if (typeof reportCaughtError === 'function') reportCaughtError(e, { context: 'philosophy_engine', action: 'load_static_json' });
    philosophyModules = [];
  }
}

// ── User Classification (11 Dimensions) ─────────────────────────────────────

function classifyUser(profile) {
  profile = profile || {};
  return {
    level:              profile.fitnessLevel || classifyLevelFromProfile(profile) || 'beginner',
    ageGroup:           classifyAgeGroup(profile.age),
    gender:             classifyGender(profile.gender),
    sportProfile:       deriveSportProfile(profile),
    primaryGoal:        mapGoal(profile.goal),
    trainingFrequency:  classifyFrequency(profile.daysPerWeek || profile.availableDaysPerWeek),
    sessionDuration:    classifyDuration(profile.sessionLength),
    equipmentAccess:    classifyEquipment(profile.equipment),
    injuryHistory:      classifyInjury(profile.injuries),
    recoveryState:      deriveRecoveryState(profile),
    nutritionProfile:   deriveNutritionProfile(profile)
  };
}

function classifyLevelFromProfile(profile) {
  // Fitness-level dropdown removed per SPEC_cardio_add_session_v1.md §3.3
  // and SPEC_strength_level_v1 §2. Derive from per-sport thresholds when
  // possible — prefer the highest level across all four sports (swim,
  // cycling, running, strength) so a strong lifter who doesn't do cardio
  // still gets appropriately challenging cross-training suggestions
  // (SPEC_strength_level_v1 §5).
  if (typeof window !== 'undefined' && window.SportLevels && window.SportLevels.getLevelsForUser) {
    try {
      const lv = window.SportLevels.getLevelsForUser();
      const rank = { beginner: 0, novice: 0, intermediate: 1, advanced: 2, competitive: 2 };
      const highest = Math.max(
        rank[lv.swim] || 0,
        rank[lv.cycling] || 0,
        rank[lv.running] || 0,
        rank[lv.strength] || 0,
      );
      if (highest === 2) return 'advanced';
      if (highest === 1) return 'intermediate';
    } catch (_) {}
  }
  const survey = typeof getSurveyData === 'function' ? getSurveyData() : null;
  if (survey && survey.fitnessLevel) return survey.fitnessLevel;
  return 'intermediate';
}

function classifyAgeGroup(age) {
  const a = parseInt(age);
  if (isNaN(a) || a < 18) return '30-39'; // default
  if (a <= 29) return '18-29';
  if (a <= 39) return '30-39';
  if (a <= 49) return '40-49';
  if (a <= 59) return '50-59';
  return '60+';
}

function classifyGender(gender) {
  if (!gender) return 'default';
  const g = gender.toLowerCase();
  if (g === 'male' || g === 'm') return 'male';
  if (g === 'female' || g === 'f') return 'female';
  return 'default'; // non_binary, prefer_not_to_say, etc.
}

function deriveSportProfile(profile) {
  const survey = getSurveyData();
  const sport = survey?.sport || profile.sport || '';
  const workoutTypes = profile.workoutTypes || survey?.activities || [];
  const goal = (profile.goal || '').toLowerCase();

  // Direct sport mapping
  if (sport === 'triathlon') return 'hybrid';
  if (sport === 'running') return 'endurance';
  if (sport === 'cycling') return 'endurance';
  if (sport === 'strength') return 'strength';

  // Multi-sport detection (triathlon-like)
  const enduranceSports = workoutTypes.filter(t => ['running', 'cycling', 'swimming'].includes(t));
  if (enduranceSports.length >= 2) return 'hybrid';

  // Event-based detection
  if (profile.event && ['half_ironman', 'ironman', 'olympic_tri', 'sprint_tri'].includes(profile.event)) return 'hybrid';

  // Workout type analysis
  const hasStrength = workoutTypes.some(t =>
    ['weightlifting', 'lifting', 'strength', 'bodyweight'].includes(t)
  );
  const hasEndurance = enduranceSports.length > 0;

  if (hasStrength && hasEndurance) return 'hybrid';
  if (hasStrength) return 'strength';
  if (hasEndurance) return 'endurance';

  // Goal-based inference
  if (['bulk', 'muscle_gain', 'muscle gain'].includes(goal)) return 'strength';
  if (['race', 'performance'].includes(goal)) return 'endurance';

  return 'general_fitness';
}

function mapGoal(goal) {
  if (!goal) return 'general_health';
  const g = goal.toLowerCase().replace(/[_-]/g, ' ');
  const goalMap = {
    'bulk': 'muscle_gain',
    'muscle gain': 'muscle_gain',
    'gain muscle': 'muscle_gain',
    'build muscle': 'muscle_gain',
    'cut': 'fat_loss',
    'fat loss': 'fat_loss',
    'lose weight': 'fat_loss',
    'weight loss': 'fat_loss',
    'lean out': 'fat_loss',
    'maintain': 'general_health',
    'recomp': 'general_health',
    'body recomp': 'general_health',
    'general': 'general_health',
    'general health': 'general_health',
    'stay fit': 'general_health',
    'performance': 'performance',
    'race': 'performance',
    'compete': 'performance',
    'pr': 'performance',
    'return': 'return_to_training',
    'comeback': 'return_to_training',
  };
  for (const [key, val] of Object.entries(goalMap)) {
    if (g.includes(key)) return val;
  }
  return 'general_health';
}

function classifyFrequency(days) {
  const d = parseInt(days);
  if (isNaN(d) || d <= 3) return '2-3';
  if (d <= 5) return '4-5';
  return '6-7';
}

function classifyDuration(minutes) {
  const m = parseInt(minutes);
  if (isNaN(m) || m <= 30) return '15-30';
  if (m <= 45) return '30-45';
  if (m <= 60) return '45-60';
  return '60+';
}

function classifyEquipment(equipment) {
  if (!equipment) return 'full_gym';
  if (Array.isArray(equipment)) {
    if (equipment.length === 0) return 'none';
    const hasBarbell = equipment.some(e => ['barbell', 'squat_rack', 'bench'].includes(e));
    const hasDumbbells = equipment.some(e => e === 'dumbbells');
    const hasKettlebell = equipment.some(e => e === 'kettlebell');
    if (hasBarbell) return 'full_gym';
    if (hasDumbbells && hasKettlebell) return 'home_gym';
    if (hasDumbbells) return 'dumbbells';
    if (hasKettlebell) return 'kettlebell';
    return 'none';
  }
  const e = String(equipment).toLowerCase();
  if (['full_gym', 'gym', 'full'].includes(e)) return 'full_gym';
  if (['home_gym', 'home'].includes(e)) return 'home_gym';
  if (e === 'dumbbells') return 'dumbbells';
  if (e === 'kettlebell') return 'kettlebell';
  if (e === 'none' || e === 'bodyweight') return 'none';
  return 'full_gym';
}

function classifyInjury(injuries) {
  if (!injuries || (Array.isArray(injuries) && injuries.length === 0)) return 'none';
  if (typeof injuries === 'string') injuries = [injuries];
  const chronicKeywords = ['chronic', 'recurring', 'ongoing', 'permanent'];
  const majorKeywords = ['surgery', 'torn', 'fracture', 'broken', 'severe'];
  const text = injuries.join(' ').toLowerCase();
  if (chronicKeywords.some(k => text.includes(k))) return 'chronic';
  if (majorKeywords.some(k => text.includes(k))) return 'major_past';
  return 'minor_current';
}

function deriveRecoveryState(profile) {
  // Check latest check-in data
  const checkIn = profile.latestCheckIn || getLatestCheckIn();
  if (!checkIn) return 'good';

  const sleep = checkIn.sleep_quality || checkIn.sleepQuality || '';
  const energy = checkIn.energy_level || checkIn.energyLevel || '';
  const soreness = checkIn.soreness_level || checkIn.sorenessLevel || '';

  // Low: any critical signal
  if (sleep === 'poor' || energy === 'low' || soreness === 'severe') return 'low';

  // Count moderate signals
  let moderateSignals = 0;
  if (sleep === 'fair') moderateSignals++;
  if (energy === 'moderate') moderateSignals++;
  if (soreness === 'moderate') moderateSignals++;
  if (moderateSignals >= 2) return 'low';
  if (moderateSignals >= 1) return 'moderate';

  return 'good';
}

function deriveNutritionProfile(profile) {
  const level = profile.fitnessLevel || 'beginner';
  const goal = mapGoal(profile.goal);

  if (level === 'beginner') return 'habit_building';
  if (goal === 'performance') return 'performance_fueling';
  if (goal === 'muscle_gain' || goal === 'fat_loss') return 'macro_tracking';
  return 'weight_management';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSurveyData() {
  try {
    // surveyData may be a global from survey.js
    if (typeof surveyData !== 'undefined' && surveyData) return surveyData;
    const stored = localStorage.getItem('surveyData');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return null;
}

function getLatestCheckIn() {
  try {
    const stored = localStorage.getItem('latestCheckIn');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return null;
}

// ── Module Retrieval ────────────────────────────────────────────────────────

async function retrieveModules(classification) {
  const modules = [];
  const gaps = [];

  // Define retrieval queries per dimension
  const queries = [
    { dimension: 'level', filter: { level: classification.level } },
    { dimension: 'age_group', filter: { age_group: classification.ageGroup } },
    { dimension: 'gender', filter: { gender: classification.gender } },
    { dimension: 'sport_profile', filter: { sport_profile: classification.sportProfile } },
    { dimension: 'goal', filter: { goal: classification.primaryGoal } },
    { dimension: 'nutrition', filter: { nutrition_profile: classification.nutritionProfile } },
    { dimension: 'variation', filter: { category: 'variation' } },
    { dimension: 'safety', filter: { category: 'safety' } },
    { dimension: 'hydration', filter: { category: 'hydration' } },
  ];

  // Add event-specific query if applicable
  const survey = getSurveyData();
  if (survey && survey.raceType) {
    const eventMap = {
      'fiveK': '5k', 'tenK': '10k', 'halfMarathon': 'half_marathon',
      'marathon': 'marathon', 'ultra': 'ultra',
      'halfIronman': 'half_ironman', 'ironman': 'ironman',
      'olympic': 'olympic_tri', 'sprint': 'sprint_tri'
    };
    const eventValue = eventMap[survey.raceType];
    if (eventValue) {
      queries.push({ dimension: 'event', filter: { event: eventValue } });
    }
  }

  // Add recovery state query if not good
  if (classification.recoveryState !== 'good') {
    queries.push({
      dimension: 'recovery',
      filter: { recovery_state: classification.recoveryState }
    });
  }

  // Add injury caution if applicable
  if (classification.injuryHistory !== 'none') {
    queries.push({
      dimension: 'injury',
      filter: { injury_type: classification.injuryHistory }
    });
  }

  for (const query of queries) {
    const matched = queryModulesLocal(query.filter);
    if (matched.length > 0) {
      modules.push(...matched);
    } else if (query.dimension !== 'recovery' && query.dimension !== 'injury') {
      // Recovery and injury modules are placeholders — don't log as gaps
      gaps.push({
        dimension: query.dimension,
        value: JSON.stringify(query.filter),
        timestamp: new Date().toISOString()
      });
    }
  }

  // Log gaps to Supabase if any
  if (gaps.length > 0 && typeof logPhilosophyGaps === 'function') {
    logPhilosophyGaps(gaps);
  }

  // Deduplicate modules by id
  const seen = new Set();
  const uniqueModules = [];
  for (const m of modules) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      uniqueModules.push(m);
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  uniqueModules.sort((a, b) =>
    (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1)
  );

  console.log(`[IronZ] Retrieved ${uniqueModules.length} modules, ${gaps.length} gaps`);
  return { modules: uniqueModules, gaps };
}

function queryModulesLocal(filter) {
  if (!philosophyModules || philosophyModules.length === 0) return [];
  return philosophyModules.filter(m =>
    m.is_active && matchesFilter(m.applies_when, filter)
  );
}

function matchesFilter(appliesWhen, filter) {
  if (!appliesWhen) return false;
  for (const [key, value] of Object.entries(filter)) {
    const moduleValue = appliesWhen[key];
    if (!moduleValue) continue; // dimension not in module = matches all
    if (moduleValue === 'any') continue; // explicit wildcard
    if (Array.isArray(moduleValue)) {
      if (!moduleValue.includes(value)) return false;
    } else {
      if (moduleValue !== value) return false;
    }
  }
  return true;
}

// ── Public API ──────────────────────────────────────────────────────────────

function getPhilosophyModules() {
  return philosophyModules;
}

function isPhilosophyEngineReady() {
  return philosophyModules !== null && philosophyModules.length > 0;
}
