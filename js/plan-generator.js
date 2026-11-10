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
      intensityBudgetScope:'endurance_quality_only',
      strengthBudgetPolicy:'phase_and_role_specific',
      sharedRecoveryIncludes:['endurance_quality','heavy_strength'],
      noConsecutiveHardDays: true,
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
      tooEasyResponse: 'Review completion history and recovery before proposing a change. Athlete approval and all load limits remain required.',
      lowAdherenceResponse: 'Simplify the plan: reduce session count, shorten durations, and check motivation / competing demands.',
      injuryReturnProtocol: 'Hold restricted work until applicable restrictions and return status are established. Elapsed rest time is not clearance; return progression requires athlete-specific constraints.',
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
    const profile={...snapshot.profile,weeklyTemplate:snapshot.weeklyTemplate,variationSeed:cfg.variationSeed||0,completedHistory:snapshot.history||[]};
    if(!Array.isArray(profile.selectedSports)||!profile.selectedSports.length)throw Error('Select the sports this plan should include.');
    if(!Number.isInteger(profile.availableDaysPerWeek)||profile.availableDaysPerWeek<1)throw Error('Set your available training days before generating a plan.');
    if(!Number.isFinite(profile.sessionLength)||profile.sessionLength<=0)throw Error('Set your preferred session duration before generating a plan.');
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
    // Calendar weekdays always refer to Monday-anchored weeks. Keep the
    // requested boundary separately so a partial first week adds no early work.
    const anchor=new Date(startDate+'T00:00:00Z');
    anchor.setUTCDate(anchor.getUTCDate()-((anchor.getUTCDay()+6)%7));
    const arc = arcBuilder.buildArc(classification, races, anchor.toISOString().slice(0,10));
    arc.requestedStartDate=startDate;

    // 3. Weekly plan
    const weeklyPlan = assembler.assembleWeeklyPlan(classification, arc);

    // 4 + 5. Nutrition + hydration
    const missingNutrition=['age','weight','height'].filter(key=>!Number.isFinite(profile[key])||profile[key]<=0);
    if(!['male','female'].includes(profile.gender))missingNutrition.push('gender');
    const nutritionStrategy=missingNutrition.length?{status:'insufficient_data',missing:missingNutrition}:nutrition.calculate(classification,profile);
    const hydrationStrategy=Number.isFinite(profile.weight)&&profile.weight>0?hydration.calculate(profile):{status:'insufficient_data',missing:['weight']};

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
    if(!validated.allPassed) throw Error('Generated plan failed validation: '+validated.errors.join(' '));
    validated.plan.rationale=rationale.build(classification,arc,validated.plan.weeklyPlan);
    validated.plan.rationale.disclaimer=validator._DISCLAIMER;
    validated.plan.planMetadata.generatedAt=snapshot.asOf;
    validated.plan.planMetadata.inputVersion=snapshot.version;
    validated.plan.planMetadata.readiness='shadow_only';
    return validated.plan;
  }

  async function storePlan(plan) {
    if(typeof DB==='undefined'||!DB.commitEnginePlan)throw Error('The unified engine is in evaluation mode. Plan adoption is not enabled.');
    return DB.commitEnginePlan(plan);
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
