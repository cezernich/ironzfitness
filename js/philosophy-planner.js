// philosophy-planner.js — Philosophy-first plan generation entry point
// Phase 5 of the Philosophy Engine build
// Dependencies: philosophy-engine.js, rules-engine.js, validator.js, exercise-selector.js, nutrition-calculator.js

const PLAN_OUTPUT_SCHEMA_FIELDS = [
  'plan_metadata', 'athlete_summary', 'plan_structure', 'weekly_template',
  'progression_logic', 'nutrition_strategy', 'hydration_strategy',
  'adaptation_rules', 'watchouts', 'rationale', 'assumptions'
];

/**
 * Main plan generation entry point.
 * Decides: rules engine (standard) OR AI-assisted (freeform).
 */
async function philosophyGeneratePlan(request) {
  request = request || { type: 'standard' };

  const profile = getProfileForPhilosophy();
  const classification = classifyUser(profile);

  // Ensure modules are loaded
  if (!isPhilosophyEngineReady()) {
    await loadPhilosophyModules();
  }

  const { modules, gaps } = await retrieveModules(classification);

  // DECISION: Can the rules engine handle this?
  if (request.type === 'standard' && gaps.length === 0) {
    console.log('[IronZ] Generating plan from philosophy modules (no AI call)');
    const plan = generatePlanFromModules(classification, modules, profile);
    const validated = validatePlan(plan, profile);
    await storeGeneratedPlan(validated.plan, 'rules_engine');
    return validated;
  }

  if (request.type === 'freeform' || request.type === 'ask_ironz') {
    console.log('[IronZ] Freeform request — calling Claude with philosophy context');
    return await generateWithAI(request, classification, modules, profile);
  }

  if (gaps.length > 0) {
    console.log('[IronZ] Gap detected — using conservative fallback');
    console.log('[IronZ] Gaps:', gaps);
    const plan = generatePlanFromModules(classification, modules, profile);
    plan.plan_metadata.generation_source = 'gap_fallback';
    plan.plan_metadata.gaps_detected = gaps;
    const validated = validatePlan(plan, profile);
    await storeGeneratedPlan(validated.plan, 'gap_fallback');
    return validated;
  }

  // Default: rules engine
  const plan = generatePlanFromModules(classification, modules, profile);
  const validated = validatePlan(plan, profile);
  await storeGeneratedPlan(validated.plan, 'rules_engine');
  return validated;
}

// ── AI-Assisted Generation ──────────────────────────────────────────────────

async function generateWithAI(request, classification, modules, profile) {
  const prompt = assembleAIPrompt(request, classification, modules, profile);

  try {
    // Call Claude via Supabase Edge Function
    if (typeof supabaseClient !== 'undefined') {
      const { data, error } = await supabaseClient.functions.invoke('generate-plan', {
        body: { prompt, outputSchema: PLAN_OUTPUT_SCHEMA_FIELDS }
      });

      if (error) throw new Error(error.message || 'Edge function error');

      const plan = typeof data.plan === 'string' ? JSON.parse(data.plan) : data.plan;
      plan.plan_metadata = plan.plan_metadata || {};
      plan.plan_metadata.generation_source = 'ai_assisted';
      plan.plan_metadata.freeform_request = request.text;
      plan.plan_metadata.philosophy_modules_used = modules.map(m => m.id);
      plan.plan_metadata.module_versions = Object.fromEntries(modules.map(m => [m.id, m.version]));

      // Normalize any swim workouts in the AI response to the canonical
      // shape — coerces invalid strokes, strips unknown fields, recomputes
      // total_distance_m. No-op if SwimWorkout isn't loaded.
      _normalizeSwimWorkoutsInPlan(plan);

      const validated = validatePlan(plan, profile);
      await storeGeneratedPlan(validated.plan, 'ai_assisted');
      return validated;
    }

    // Fallback: if no Supabase edge function, fall back to rules engine
    console.warn('[IronZ] No Supabase edge function available, falling back to rules engine');
    const plan = generatePlanFromModules(classification, modules, profile);
    plan.plan_metadata.generation_source = 'rules_engine';
    plan.plan_metadata.freeform_request = request.text;
    plan.plan_metadata.note = 'AI-assisted generation unavailable — used rules engine instead';
    const validated = validatePlan(plan, profile);
    await storeGeneratedPlan(validated.plan, 'rules_engine');
    return validated;

  } catch (e) {
    console.error('[IronZ] AI generation failed:', e.message);
    // Fall back to rules engine
    const plan = generatePlanFromModules(classification, modules, profile);
    plan.plan_metadata.generation_source = 'gap_fallback';
    plan.plan_metadata.freeform_request = request.text;
    plan.plan_metadata.error = e.message;
    const validated = validatePlan(plan, profile);
    await storeGeneratedPlan(validated.plan, 'gap_fallback');
    return validated;
  }
}

/**
 * Assemble the 4-layer prompt for AI calls.
 * Claude gets constrained by philosophy modules.
 */
function assembleAIPrompt(request, classification, modules, profile) {
  // Layer 1: Immutable rules
  const layer1 = `IMMUTABLE RULES (never violate these):
- You are generating a fitness/nutrition plan for the IronZ app.
- Never diagnose, prescribe, cure, treat, or provide medical nutrition therapy.
- Calorie floors: minimum 1200 cal/day (women), 1500 cal/day (men).
- Protein floor: never suggest < 0.6 g/lb bodyweight.
- Never use prohibited phrases: "guaranteed results", "lose X lbs in Y days", "burn off that meal", "cure", "treat", "diagnose".
- Max weekly volume increase: 15% for endurance, 4 sets/muscle for strength.
- Every plan must include at least 1 full rest day per week.
- Include a wellness disclaimer.
- Plans longer than 4 weeks must include deload weeks.`;

  // Layer 2: Retrieved philosophy modules
  const layer2 = modules.map(m => `
MODULE: ${m.id} (v${m.version})
Category: ${m.category}
Principles: ${(m.principles || []).join('; ')}
Plan Rules: ${(m.plan_rules || []).join('; ')}
Hard Constraints: ${(m.hard_constraints || []).join('; ')}
Nutrition Rules: ${(m.nutrition_rules || []).join('; ')}
Coaching Tone: ${m.coaching_tone || 'Professional and encouraging'}
`).join('\n---\n');

  // Layer 2b: Endurance-specific supplementary rules (zone calc + intervals)
  let layer2b = '';
  if (['endurance', 'hybrid'].includes(classification.sportProfile)) {
    // HR zone calculation context
    const hrZones = typeof calculateHRZones === 'function' ? calculateHRZones(profile) : null;
    if (hrZones) {
      const zoneLines = Object.entries(hrZones.zones).map(([k, z]) =>
        `${k.toUpperCase()} ${z.name}: ${z.low || '<'}${z.low ? '-' : ''}${z.high} bpm`
      ).join(', ');
      layer2b += `\nHR ZONES (Tier ${hrZones.tier} — ${hrZones.method}): ${zoneLines}\n`;
    }
    layer2b += `
ZONE CALCULATION RULES:
- Tier 1 (age only): Max HR = 208 - 0.7*age. Zones as % of max HR. Standard error +/-10 bpm.
- Tier 2 (age + resting HR): Karvonen formula. Target HR = ((MaxHR - RestingHR) * pct) + RestingHR. More accurate.
- Tier 3 (LTHR): Zones as % of lactate threshold HR. Most accurate for trained runners.
- Always use the highest tier available based on user data.
- If user provides known max HR, use it instead of age-predicted formula.
`;

    // Interval session rules for time-goal runners
    const intervalGuidance = typeof getIntervalSessionGuidance === 'function'
      ? getIntervalSessionGuidance(profile, classification) : null;
    if (intervalGuidance) {
      layer2b += `
INTERVAL RULES (time-goal runner):
- One weekly interval session is NON-NEGOTIABLE for runners with a time goal.
- ${intervalGuidance.exampleSession}
- Total interval volume: ${intervalGuidance.intervalVolumeMiles} miles (5-10% of weekly mileage).
- Placement: ${intervalGuidance.placement}
- Progression: ${intervalGuidance.progression}
`;
    }

    // Offseason rules if applicable
    if (typeof isOffseason === 'function' && isOffseason(profile, classification)) {
      layer2b += `
OFFSEASON RULES:
- Volume: 50-60% of peak training volume. This is active recovery, not fitness preservation.
- No long runs exceeding 60 minutes. Most runs 30-45 min.
- Focus: speed development (strides), hill work, strength training (2-3 sessions/week).
- No structured interval or tempo work — keep running aerobic and fun.
- Coaching tone: relaxed, encouraging exploration. Reduce pressure, increase autonomy.
`;
    }

    // Marathon long run scaling if applicable
    const survey = typeof getSurveyData === 'function' ? getSurveyData() : null;
    if (survey?.raceType === 'marathon') {
      const scaling = typeof getMarathonLongRunScaling === 'function'
        ? getMarathonLongRunScaling(profile, classification) : null;
      if (scaling) {
        layer2b += `
MARATHON LONG RUN SCALING:
- 20+ mile runs in this block: ${scaling.twentyPlusMilers[0]}-${scaling.twentyPlusMilers[1]}
- Long run peak distance: ${scaling.longRunPeak}
- Marathon pace in long runs: ${scaling.marathonPaceInLongRun ? 'Yes (6-12 miles at MP)' : 'No'}
- Safety: never more than one 20+ miler per 2-week period. Min 10-14 days between.
- Note: ${scaling.note}
`;
      }
    }
  }

  // Layer 3: User profile
  const layer3 = `
USER PROFILE:
Level: ${classification.level}
Age Group: ${classification.ageGroup}
Gender: ${classification.gender}
Sport: ${classification.sportProfile}
Goal: ${classification.primaryGoal}
Days/Week: ${profile.daysPerWeek || profile.availableDaysPerWeek || 3}
Session Length: ${profile.sessionLength || 45} min
Equipment: ${classification.equipmentAccess}
Injuries: ${(profile.injuries || []).join(', ') || 'None'}
Recovery State: ${classification.recoveryState}
Weight: ${profile.weight || 'Not provided'} lbs
Height: ${profile.height || 'Not provided'} inches
`;

  // Layer 2d: Swim workout schema — only attached when the athlete's sport
  // profile could include swimming. Tells the model to return pool workouts
  // as a structured step tree (interval | rest | repeat) with real
  // distances and pool size, NOT prose time blocks.
  let layer2d = '';
  const couldSwim = ['endurance', 'hybrid', 'triathlon'].includes(classification.sportProfile)
    || (profile && (profile.sports || []).some && (profile.sports || []).some(s => /swim|tri/i.test(s)))
    || /swim|triathlon|ironman|pool/i.test(request.text || '');
  if (couldSwim) {
    const poolSize = (profile && (profile.pool_size || profile.poolSize)) || '25m';
    layer2d = `
SWIM WORKOUT SCHEMA (required for any pool swim session you generate):
- Return each swim workout with a structured step tree, not prose time blocks.
- Shape:
  {
    "type": "swim",
    "title": "CSS Intervals",
    "pool_size_m": 25,          // user's pool: ${poolSize}
    "pool_unit": "m",            // "m" or "yd"
    "steps": [
      { "kind": "interval", "name": "Warm Up", "distance_m": 400, "stroke": "freestyle", "pace_target": "easy" },
      { "kind": "rest", "duration_sec": 20 },
      { "kind": "repeat", "count": 8, "children": [
          { "kind": "interval", "name": "Main", "distance_m": 100, "stroke": "freestyle", "pace_target": "CSS" },
          { "kind": "rest", "duration_sec": 15 }
      ]},
      { "kind": "interval", "name": "Cool Down", "distance_m": 200, "stroke": "choice", "pace_target": "easy" }
    ]
  }
- Every interval step MUST have an integer distance_m rounded to whole pool lengths.
- Rest steps have duration_sec (seconds). Do NOT use "rest" as a property on interval steps — use explicit rest steps between intervals.
- Repeat blocks: use kind="repeat" with count and children. Nested repeats are allowed but keep them shallow.
- Valid strokes: freestyle | backstroke | breaststroke | butterfly | im | choice.
- pace_target is free text like "CSS", "CSS+5", "easy", "max", "drill".
- Include a Warm Up step (300–600 m easy freestyle) and a Cool Down step (150–300 m easy choice) on every session.
`;
  }

  // Layer 4: Output schema
  const layer4 = `
OUTPUT FORMAT: Return a valid JSON object matching the IronZ plan output schema.
Include: ${PLAN_OUTPUT_SCHEMA_FIELDS.join(', ')}.
The plan must include a disclaimer field with a general wellness disclaimer.`;

  // User's freeform request
  const userRequest = `
USER REQUEST: ${request.text || 'Generate a personalized training and nutrition plan'}

IMPORTANT: Your response MUST be consistent with the philosophy modules above. Do not contradict any principle, plan rule, or hard constraint. If the user's request conflicts with a hard constraint, explain why you adapted the request to stay within safety boundaries.`;

  return layer1 + '\n\n' + layer2 + (layer2b ? '\n\n' + layer2b : '') + (layer2d ? '\n\n' + layer2d : '') + '\n\n' + layer3 + '\n\n' + layer4 + '\n\n' + userRequest;
}

// ── Swim workout normalization ──────────────────────────────────────────────
//
// Walks an AI-generated plan, finds any object that looks like a swim
// workout (has type/sport "swim" or similar, or already has a steps array),
// and normalizes it through SwimWorkout.normalizeWorkout. Safe to call
// on unknown plan shapes — it only touches things that match.

function _normalizeSwimWorkoutsInPlan(plan) {
  if (!plan || typeof window === 'undefined' || !window.SwimWorkout) return;
  const norm = window.SwimWorkout.normalizeWorkout;
  const seen = new WeakSet();
  function walk(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    // Heuristic: anything with a `steps` array + a swim-ish discriminator
    // gets normalized. We accept type/sport/discipline fields.
    const tag = String(node.type || node.sport || node.discipline || '').toLowerCase();
    const isSwim = /^swim/.test(tag) || tag === 'pool';
    if (isSwim && Array.isArray(node.steps)) {
      const fixed = norm(node);
      node.pool_size_m    = fixed.pool_size_m;
      node.pool_unit      = fixed.pool_unit;
      node.total_distance_m = fixed.total_distance_m;
      node.steps          = fixed.steps;
    }
    // Recurse into children arrays and keyed objects
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else {
      for (const k of Object.keys(node)) walk(node[k]);
    }
  }
  walk(plan);
}

// ── Plan Storage ────────────────────────────────────────────────────────────

async function storeGeneratedPlan(plan, source) {
  // Local mirror — keeps reads fast and gives the app an offline-safe
  // copy. DB.syncKey('activePlan') pushes this into the generic
  // user_data table as a backup so the blob survives even if the
  // generated_plans insert fails.
  localStorage.setItem('activePlan', JSON.stringify(plan));
  localStorage.setItem('activePlanSource', source || 'unknown');
  localStorage.setItem('activePlanAt', new Date().toISOString());
  if (typeof DB !== 'undefined' && DB.syncKey) DB.syncKey('activePlan');

  // Persist the plan metadata into the canonical generated_plans table.
  // Order matters: deactivate previous rows BEFORE inserting the new
  // one, otherwise the deactivate update nukes the row we just wrote.
  // (The old code used a .neq() on a nested plan_data->plan_metadata
  // path to try to exclude the new row, which was brittle and wouldn't
  // always catch duplicates.)
  try {
    if (typeof supabaseClient === 'undefined') return;
    const { data: session } = await supabaseClient.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId) return;

    const { error: deactErr } = await supabaseClient
      .from('generated_plans')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);
    if (deactErr) {
      console.warn('[IronZ] Failed to deactivate previous plans:', deactErr.message);
    }

    const { data: inserted, error: insertErr } = await supabaseClient
      .from('generated_plans')
      .insert({
        user_id: userId,
        plan_data: plan,
        philosophy_module_ids: plan.plan_metadata?.philosophy_modules_used || [],
        module_versions: plan.plan_metadata?.module_versions || {},
        generation_source: source || 'unknown',
        plan_version: plan.plan_metadata?.plan_version || '1.0',
        assumptions: plan.assumptions || [],
        validation_flags: plan.plan_metadata?.validation_flags || [],
        is_active: true
      })
      .select('id')
      .single();
    if (insertErr) {
      console.warn('[IronZ] Failed to insert active plan:', insertErr.message);
      return;
    }
    // Stamp the plan id so any downstream writer that wants to link
    // sessions to this plan (future work) has it ready.
    if (inserted && inserted.id) {
      try { localStorage.setItem('activePlanId', inserted.id); } catch {}
    }
  } catch (e) {
    console.warn('[IronZ] Failed to store plan in Supabase:', e.message);
  }
}

async function getActivePlan(userId) {
  try {
    if (typeof supabaseClient !== 'undefined' && userId) {
      const { data } = await supabaseClient
        .from('generated_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();
      return data;
    }
  } catch { /* ignore */ }

  // Fall back to localStorage
  try {
    const stored = localStorage.getItem('activePlan');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return null;
}

// ── Profile Helper ──────────────────────────────────────────────────────────

function getProfileForPhilosophy() {
  let profile = {};
  try {
    profile = JSON.parse(localStorage.getItem('profile') || '{}');
  } catch { profile = {}; }

  // Merge survey data for richer classification
  const survey = typeof getSurveyData === 'function' ? getSurveyData() : null;
  if (survey) {
    if (!profile.fitnessLevel && survey.fitnessLevel) profile.fitnessLevel = survey.fitnessLevel;
    if (!profile.daysPerWeek && survey.daysPerWeek) profile.daysPerWeek = survey.daysPerWeek;
    if (!profile.sport && survey.sport) profile.sport = survey.sport;
    if (survey.activities && survey.activities.length > 0) profile.workoutTypes = survey.activities;
  }

  return profile;
}

// ── Plan Display Helpers ────────────────────────────────────────────────────

function getPlanRationale() {
  try {
    const plan = JSON.parse(localStorage.getItem('activePlan') || '{}');
    return plan.rationale || null;
  } catch { return null; }
}

function isPlanOutdated() {
  try {
    const plan = JSON.parse(localStorage.getItem('activePlan') || '{}');
    return plan.plan_metadata?.is_outdated || false;
  } catch { return false; }
}

function getPlanSource() {
  return localStorage.getItem('activePlanSource') || 'unknown';
}
