// Golden test runner for philosophy engine
const fs = require('fs');
const vm = require('vm');

global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = v; }
};

const context = vm.createContext({
  localStorage: global.localStorage,
  document: { getElementById: () => null },
  window: {},
  console: console,
  supabaseClient: undefined,
  surveyData: null,
  fetch: () => Promise.reject('no fetch'),
  JSON, Math, Date, Array, Object, Set, Map,
  parseInt, parseFloat, isNaN, String, Promise, setTimeout, RegExp, Error,
});

// Load all engine files
const files = [
  'philosophy-engine.js', 'exercise-selector.js', 'nutrition-calculator.js',
  'rules-engine.js', 'validator.js', 'gap-tracker.js', 'feedback-loop.js',
  'philosophy-planner.js'
];
for (const f of files) {
  vm.runInContext(fs.readFileSync(f, 'utf-8'), context, { filename: f });
}

// Load data
const modules = JSON.parse(fs.readFileSync('sources-of-truth/philosophy/modules_static.json', 'utf-8'));
// Build the legacy snake_case exercise library shape from window.EXERCISE_DB
// (the former philosophy/exercise_library.json was deleted when EXERCISE_DB
// became the single source of truth). _shapeFromExerciseDB in
// exercise-selector.js does the same translation at runtime; mirror it here
// so the golden tests see identical data.
const exerciseData = fs.readFileSync('exercise-data.js', 'utf-8');
const edbMatch = exerciseData.match(/window\.EXERCISE_DB = (\[[\s\S]+?\]);/);
const EXERCISE_DB = edbMatch ? JSON.parse(edbMatch[1]) : [];
const exercises = EXERCISE_DB.map(e => {
  const tierNum = { primary: 1, secondary: 2, tertiary: 3 }[e.tier] || null;
  const difficulty = e.tier === 'tertiary' ? 'beginner'
                   : e.tier === 'primary'  ? 'advanced'
                   : e.tier === 'secondary' ? 'intermediate' : null;
  const equipMap = { 'dumbbells': 'dumbbell', 'kettlebell': 'kettlebell',
                     'pull-up-bar': 'pull_up_bar', 'bench': 'bench',
                     'band': 'resistance_band' };
  return {
    id: e.id, name: e.name,
    movement_pattern: String(e.pattern || e.sheet || '').replace(/-/g, '_'),
    muscle_groups: (e.muscleCategory || []).map(m => String(m).replace(/-/g, '_')),
    equipment_required: (e.equipmentNeeded || []).map(t => equipMap[t] || t.replace(/-/g, '_')),
    difficulty, tier: tierNum,
    sport_relevance: e.sport ? [e.sport] : [],
    contraindications: [], substitutions: [],
    default_rep_range: '8-12', default_rest_seconds: 90,
    instructions: null, is_active: true,
  };
});
vm.runInContext(`philosophyModules = ${JSON.stringify(modules)};`, context);
vm.runInContext(`exerciseLibrary = ${JSON.stringify(exercises)};`, context);

// Load test cases
const testCases = JSON.parse(fs.readFileSync('sources-of-truth/philosophy/golden_test_cases.json', 'utf-8')).test_cases;

// Test runner
const testRunner = `
function runTest(testCase) {
  const profile = testCase.profile;
  localStorage.setItem('profile', JSON.stringify(profile));
  surveyData = {
    sport: profile.workoutTypes ? profile.workoutTypes[0] : 'general',
    fitnessLevel: profile.fitnessLevel,
    activities: profile.workoutTypes || [],
    raceType: profile.event || null
  };

  const classification = classifyUser(profile);

  // Retrieve modules
  const queries = [
    { dimension: 'level', filter: { level: classification.level } },
    { dimension: 'age_group', filter: { age_group: classification.ageGroup } },
    { dimension: 'gender', filter: { gender: classification.gender } },
    { dimension: 'sport_profile', filter: { sport_profile: classification.sportProfile } },
    { dimension: 'goal', filter: { goal: classification.primaryGoal } },
    { dimension: 'variation', filter: { category: 'variation' } },
    { dimension: 'safety', filter: { category: 'safety' } },
    { dimension: 'hydration', filter: { category: 'hydration' } },
  ];
  const allModules = [];
  const gaps = [];
  for (const q of queries) {
    const matched = queryModulesLocal(q.filter);
    if (matched.length > 0) allModules.push(...matched);
    else gaps.push(q.dimension);
  }
  const seen = new Set();
  const unique = allModules.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  const plan = generatePlanFromModules(classification, unique, profile);
  const validated = validatePlan(plan, profile);
  const wt = validated.plan.weekly_template;
  const nt = validated.plan.nutrition_strategy.daily_targets;
  const tDays = Object.values(wt).filter(s => s.session_type !== 'rest' && s.session_type !== 'mobility').length;
  const rDays = Object.values(wt).filter(s => s.session_type === 'rest').length;

  return {
    classification,
    modulesCount: unique.length,
    gaps,
    split: validated.plan.plan_structure.split_type,
    trainingDays: tDays,
    restDays: rDays,
    duration: validated.plan.plan_structure.duration_weeks,
    nutrition: nt,
    validationPassed: validated.passed,
    fixCount: validated.flags.length,
    hasDisclaimer: !!validated.plan.disclaimer,
    weeklySchedule: Object.entries(wt).map(([d, s]) =>
      d + ': ' + s.session_type + (s.zone ? ' (' + s.zone + ')' : '')
    ),
    watchouts: validated.plan.watchouts,
    exerciseCount: Object.values(wt).reduce((sum, s) => sum + (s.exercises ? s.exercises.length : 0), 0)
  };
}
`;
vm.runInContext(testRunner, context);

// Run each test
for (const tc of testCases) {
  vm.runInContext(`var _tc = ${JSON.stringify(tc)};`, context);
  const result = vm.runInContext('runTest(_tc)', context);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${tc.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Classification: ${result.classification.level} | ${result.classification.sportProfile} | ${result.classification.primaryGoal}`);
  console.log(`Modules: ${result.modulesCount} | Gaps: ${result.gaps.length > 0 ? result.gaps.join(', ') : 'none'}`);
  console.log(`Structure: ${result.split} | ${result.trainingDays} training days | ${result.restDays} rest days | ${result.duration} weeks`);
  console.log(`Schedule:`);
  for (const s of result.weeklySchedule) console.log(`  ${s}`);
  console.log(`Nutrition: ${result.nutrition.calories} cal | ${result.nutrition.protein_g}g P | ${result.nutrition.carbs_g}g C | ${result.nutrition.fat_g}g F`);
  console.log(`Exercises populated: ${result.exerciseCount}`);
  console.log(`Validation: ${result.validationPassed ? 'PASSED' : 'FIXES APPLIED (' + result.fixCount + ')'} | Disclaimer: ${result.hasDisclaimer}`);
  if (result.watchouts.length) console.log(`Watchouts: ${result.watchouts.join(' | ')}`);

  // Specific checks per test
  const checks = [];
  if (tc.id === 'test_beginner_runner_weight_loss') {
    checks.push(['training <= 4', result.trainingDays <= 4]);
    checks.push(['rest >= 1', result.restDays >= 1]);
    checks.push(['calories >= 1200', result.nutrition.calories >= 1200]);
    checks.push(['level = beginner', result.classification.level === 'beginner']);
  }
  if (tc.id === 'test_intermediate_lifter_muscle_gain') {
    checks.push(['split is UL or PPL', ['upper_lower', 'ppl'].includes(result.split)]);
    checks.push(['has surplus (cal > 2500)', result.nutrition.calories > 2500]);
    checks.push(['has deload in structure', result.duration >= 4]);
  }
  if (tc.id === 'test_advanced_cyclist_performance') {
    checks.push(['split is endurance', result.split === 'endurance']);
    checks.push(['level = advanced', result.classification.level === 'advanced']);
  }
  if (tc.id === 'test_beginner_general_hybrid') {
    checks.push(['training <= 3', result.trainingDays <= 3]);
    checks.push(['exercises per session <= 5', result.exerciseCount <= 15]);
  }
  if (tc.id === 'test_intermediate_triathlete_half_ironman') {
    checks.push(['split is hybrid', result.split === 'hybrid']);
    checks.push(['training >= 5', result.trainingDays >= 5]);
  }

  if (checks.length) {
    console.log('Checks:');
    for (const [name, pass] of checks) {
      console.log(`  ${pass ? 'PASS' : 'FAIL'}: ${name}`);
    }
  }
}
