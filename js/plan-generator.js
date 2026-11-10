/**
 * IronZ Rule Engine — Chunk 3: Plan Generator (entry point)
 *
 * Wires AthleteClassifier + ArcBuilder + SessionAssembler +
 * NutritionCalculator + HydrationCalculator + PlanValidator +
 * RationaleBuilder into a single generate() call that returns a
 * PLAN_SCHEMA.json-conformant plan.
 *
 * NOT yet wired into planner.js — this runs alongside the existing
 * generateTrainingPlan() for console-based testing.
 */
(function () {
  'use strict';

  const PHILOSOPHY_VERSION = '2.5';
  const PLAN_VERSION = '1.0';
  const GENERATION_SOURCE = 'rules_engine';

  function requireDep(name, value) {
    if (!value) throw new Error(`PlanGenerator: missing dependency ${name}. Check script load order.`);
    return value;
  }

  function _readProfile() {
    if(typeof DB==='undefined'||!DB.captureAthleteInput) throw Error('Athlete input storage is unavailable.');
    return DB.captureAthleteInput().profile;
  }

  function _buildConstraints(classification) {
    const level = (classification && classification.level) || 'intermediate';
    const intensityCaps = { beginner: 1, intermediate: 2, advanced: 3 };
    return {
      maxIntensitySessionsPerWeek: intensityCaps[level] || 2,
      noConsecutiveHardDays: level !== 'advanced',
      minRestDaysPerWeek: 1,
      maxWeeklyVolumeIncreasePct: level === 'advanced' ? 15 : 10,
      maxLongRunPctOfWeekly: 30,
      strengthVolumeCapSetsPerMuscle: 4,
      deloadEveryNWeeks: level === 'advanced' ? 3 : 4,
    };
  }

  function _buildProgressionLogic(classification) {
    const level = (classification && classification.level) || 'intermediate';
    return {
      volumeProgressionPct: level === 'beginner' ? 5 : level === 'advanced' ? 10 : 7,
      strengthProgression: 'Double progression: add reps until top of the range, then add weight and reset to the bottom of the range.',
      deloadProtocol: 'Reduce training volume 40-60%; maintain intensity to preserve quality.',
    };
  }

  function _buildAdaptationRules() {
    return {
      tooHardResponse: 'Reduce volume by 10-15% and add an extra rest day. Revisit next weekly check-in.',
      tooEasyResponse: 'Increase volume by 5-10% or add one additional key intensity session.',
      lowAdherenceResponse: 'Simplify the plan: reduce session count, shorten durations, and check motivation / competing demands.',
      injuryReturnProtocol: 'Restart at 50% of previous volume, rebuild over 2-3 weeks, hold intensity cap at Z3 during return.',
    };
  }

  function _athleteProfileForPlan(classification) {
    // Strip internal-only fields; project schema-relevant fields only.
    if (!classification) return null;
    const out = {
      age: classification.age,
      ageGroup: classification.ageGroup,
      level: classification.level,
      sportLevels: classification.sportLevels,
      riskBias: classification.riskBias,
      goal: classification.goal,
      strengthRole: classification.strengthRole,
      strengthGoal: classification.strengthGoal,
      trainingGoals: classification.trainingGoals,
      sportProfile: classification.sportProfile,
      daysAvailable: classification.daysAvailable,
      preferredDays: classification.preferredDays,
      sessionDurationMin: classification.sessionDurationMin,
      thresholds: classification.thresholds,
      equipmentProfile: classification.equipmentProfile,
      weaknessProfile: classification.weaknessProfile,
      injuries: classification.injuries,
      recoveryState: classification.recoveryState,
      gender: classification.gender,
    };
    if (classification.weight != null) out.weight = classification.weight;
    if (classification.height != null) out.height = classification.height;
    return out;
  }

  function generate(config) {
    const cfg = config || {};
    const snapshot=cfg.snapshot || (cfg.profile ? window.AthleteInput.normalize(cfg) : DB.captureAthleteInput(cfg));
    const profile=snapshot.profile;
    const races=snapshot.races;
    const startDate=snapshot.startDate;

    const classifier = requireDep('AthleteClassifier', window.AthleteClassifier);
    const arcBuilder = requireDep('ArcBuilder', window.ArcBuilder);
    const assembler = requireDep('SessionAssembler', window.SessionAssembler);
    const nutrition = requireDep('NutritionCalculator', window.NutritionCalculator);
    const hydration = requireDep('HydrationCalculator', window.HydrationCalculator);
    const validator = requireDep('PlanValidator', window.PlanValidator);
    const rationale = requireDep('RationaleBuilder', window.RationaleBuilder);

    // 1 + 2. Classify + arc. Pass races through the profile so the
    // classifier can detect Hyrox / running / cycling sport profiles from
    // the race calendar when the athlete hasn't explicitly set
    // selectedSports (Philosophy §2.5 + §9.5).
    const profileForClassification = Object.assign({}, profile, { races });
    const classification = classifier.classify(profileForClassification);
    const arc = arcBuilder.buildArc(classification, races, startDate);

    // 3. Weekly plan
    const weeklyPlan = assembler.assembleWeeklyPlan(classification, arc);

    // 4 + 5. Nutrition + hydration
    const nutritionStrategy = nutrition.calculate(classification, profile);
    const hydrationStrategy = hydration.calculate(profile);

    // 6. Constraints + progression + adaptation
    const constraints = _buildConstraints(classification);
    const progressionLogic = _buildProgressionLogic(classification);
    const adaptationRules = _buildAdaptationRules();

    // 7. Rationale (built before validator; validator may append disclaimer)
    const rationaleObj = rationale.build(classification, arc, weeklyPlan);

    // 8. Assemble full plan
    const plan = {
      planMetadata: {
        generatedAt: new Date().toISOString(),
        generationSource: GENERATION_SOURCE,
        planVersion: PLAN_VERSION,
        philosophyVersion: PHILOSOPHY_VERSION,
      },
      athleteProfile: _athleteProfileForPlan(classification),
      arc,
      weeklyPlan,
      constraints,
      nutritionStrategy,
      hydrationStrategy,
      progressionLogic,
      adaptationRules,
      rationale: rationaleObj,
      validationFlags: [],
    };

    // 9. Validate + auto-fix
    const validated = validator.validate(plan, classification);
    return validated.plan;
  }

  function storePlan(plan) {
    if (!plan || typeof plan !== 'object') return false;
    try {
      localStorage.setItem('activePlan', JSON.stringify(plan));
      localStorage.setItem('activePlanSource', (plan.planMetadata && plan.planMetadata.generationSource) || GENERATION_SOURCE);
      localStorage.setItem('activePlanAt', new Date().toISOString());
    } catch (e) {
      console.warn('[IronZ] PlanGenerator.storePlan: localStorage write failed:', e && e.message);
      return false;
    }
    try {
      if (typeof window.DB !== 'undefined' && window.DB && typeof window.DB.syncKey === 'function') {
        window.DB.syncKey('activePlan');
      }
    } catch (e) {
      console.warn('[IronZ] PlanGenerator.storePlan: DB.syncKey failed:', e && e.message);
    }
    return true;
  }

  window.PlanGenerator = {
    generate,
    storePlan,
    // exposed for tests / debugging
    _readProfile,
    _buildConstraints,
    _buildProgressionLogic,
    _buildAdaptationRules,
  };
})();
