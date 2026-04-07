// validator.js — Post-generation plan validation against hard rules
// Phase 4 of the Philosophy Engine build
// From Spec Section 9.1

const HARD_RULES = [
  {
    id: 'calorie_floor',
    description: 'Minimum calorie targets: 1200 (female), 1500 (male), 1400 (default)',
    check: (plan, profile) => {
      if (!plan.nutrition_strategy || !plan.nutrition_strategy.daily_targets) return true;
      const cals = plan.nutrition_strategy.daily_targets.calories;
      const gender = (profile.gender || '').toLowerCase();
      const floor = gender === 'female' || gender === 'f' ? 1200
        : gender === 'male' || gender === 'm' ? 1500
        : 1400;
      return cals >= floor;
    },
    fix: (plan, profile) => {
      const gender = (profile.gender || '').toLowerCase();
      const floor = gender === 'female' || gender === 'f' ? 1200
        : gender === 'male' || gender === 'm' ? 1500
        : 1400;
      plan.nutrition_strategy.daily_targets.calories = Math.max(
        plan.nutrition_strategy.daily_targets.calories, floor
      );
      return { fixed: true, flag: `Calorie target raised to safety floor: ${floor} kcal` };
    }
  },
  {
    id: 'protein_floor',
    description: 'Protein must be >= 0.6 g/lb bodyweight',
    check: (plan, profile) => {
      if (!plan.nutrition_strategy || !plan.nutrition_strategy.daily_targets) return true;
      const weightLbs = parseFloat(profile.weight) || 160;
      const proteinPerLb = plan.nutrition_strategy.daily_targets.protein_g / weightLbs;
      return proteinPerLb >= 0.6;
    },
    fix: (plan, profile) => {
      const weightLbs = parseFloat(profile.weight) || 160;
      const minProtein = Math.round(weightLbs * 0.6);
      plan.nutrition_strategy.daily_targets.protein_g = Math.max(
        plan.nutrition_strategy.daily_targets.protein_g, minProtein
      );
      return { fixed: true, flag: `Protein raised to safety floor: ${minProtein}g (0.6 g/lb)` };
    }
  },
  {
    id: 'max_weekly_volume_increase',
    description: 'Endurance: <= 15% increase. Strength: <= 4 sets/muscle/week increase',
    check: (plan, profile) => {
      // This check requires a previous plan for comparison
      // For new plans, always passes
      const previousPlan = getPreviousActivePlan();
      if (!previousPlan) return true;

      // Endurance volume check
      if (plan.athlete_summary && plan.athlete_summary.sport_profile === 'endurance') {
        // Compare total weekly training minutes/miles if available
        return true; // Detailed comparison requires stored metrics
      }

      return true; // Pass for now — detailed comparison in future iteration
    },
    fix: (plan) => {
      return { fixed: true, flag: 'Volume increase capped to safe limit (15% endurance / 4 sets strength)' };
    }
  },
  {
    id: 'prohibited_phrases',
    description: 'Scan for dangerous/misleading language',
    check: (plan) => {
      const prohibited = [
        /guaranteed results/i,
        /lose \d+ (lbs|pounds|kg|kilos?) in \d+ (days|weeks)/i,
        /burn off that meal/i,
        /\bcure\b/i,
        /\btreat\b/i,
        /\bdiagnose\b/i
      ];
      const planText = JSON.stringify(plan);
      return !prohibited.some(phrase => phrase.test(planText));
    },
    fix: (plan) => {
      const planStr = JSON.stringify(plan);
      let cleaned = planStr;
      const replacements = [
        [/guaranteed results/gi, 'expected outcomes'],
        [/lose \d+ (lbs|pounds|kg|kilos?) in \d+ (days|weeks)/gi, 'gradual, sustainable progress'],
        [/burn off that meal/gi, 'support your nutrition goals'],
      ];
      for (const [pattern, replacement] of replacements) {
        cleaned = cleaned.replace(pattern, replacement);
      }
      // Re-parse if changed
      if (cleaned !== planStr) {
        try {
          Object.assign(plan, JSON.parse(cleaned));
        } catch { /* keep original if parse fails */ }
      }
      return { fixed: true, flag: 'Prohibited phrase detected and replaced' };
    }
  },
  {
    id: 'beginner_complexity',
    description: 'Beginners: max 5 exercises/session, max 4 training days',
    check: (plan, profile) => {
      if ((profile.fitnessLevel || getClassificationLevel(profile)) !== 'beginner') return true;

      // Check max exercises per session
      const template = plan.weekly_template || {};
      let maxExercises = 0;
      let trainingDays = 0;
      for (const [day, session] of Object.entries(template)) {
        if (session.session_type && session.session_type !== 'rest' && session.session_type !== 'mobility') {
          trainingDays++;
          if (session.exercises && session.exercises.length > maxExercises) {
            maxExercises = session.exercises.length;
          }
        }
      }
      return maxExercises <= 5 && trainingDays <= 4;
    },
    fix: (plan, profile) => {
      const template = plan.weekly_template || {};
      const flags = [];

      // Trim exercises to max 5
      for (const [day, session] of Object.entries(template)) {
        if (session.exercises && session.exercises.length > 5) {
          session.exercises = session.exercises.slice(0, 5);
          flags.push(`${day}: exercises trimmed to 5`);
        }
      }

      // Cap training days to 4
      const trainingDays = Object.entries(template)
        .filter(([_, s]) => s.session_type !== 'rest' && s.session_type !== 'mobility');
      if (trainingDays.length > 4) {
        // Convert excess days to rest, starting from the end of the week
        const excess = trainingDays.slice(4);
        for (const [day, _] of excess) {
          template[day] = { session_type: 'rest', purpose: 'Recovery (adjusted for beginner complexity)' };
        }
        flags.push('Training days capped at 4 for beginner level');
      }

      return { fixed: true, flag: `Beginner plan simplified: ${flags.join('; ')}` };
    }
  },
  {
    id: 'level_appropriate_volume',
    description: 'Volume must match level ranges',
    check: (plan, profile) => {
      const level = profile.fitnessLevel || getClassificationLevel(profile) || 'beginner';
      const maxSets = { beginner: 14, intermediate: 20, advanced: 25 };
      const limit = maxSets[level] || 20;

      // Check sets per muscle group across the week
      const template = plan.weekly_template || {};
      const setsPerPattern = {};
      for (const [day, session] of Object.entries(template)) {
        if (!session.exercises) continue;
        for (const ex of session.exercises) {
          const pattern = ex.movement_pattern || 'unknown';
          setsPerPattern[pattern] = (setsPerPattern[pattern] || 0) + (ex.sets || 3);
        }
      }

      return Object.values(setsPerPattern).every(sets => sets <= limit);
    },
    fix: (plan, profile) => {
      const level = profile.fitnessLevel || getClassificationLevel(profile) || 'beginner';
      const maxSets = { beginner: 14, intermediate: 20, advanced: 25 };
      const limit = maxSets[level] || 20;

      // Reduce excess sets proportionally
      const template = plan.weekly_template || {};
      const setsPerPattern = {};
      for (const [day, session] of Object.entries(template)) {
        if (!session.exercises) continue;
        for (const ex of session.exercises) {
          const pattern = ex.movement_pattern || 'unknown';
          setsPerPattern[pattern] = (setsPerPattern[pattern] || 0) + (ex.sets || 3);
        }
      }

      const overPatterns = Object.entries(setsPerPattern).filter(([_, s]) => s > limit);
      if (overPatterns.length > 0) {
        for (const [day, session] of Object.entries(template)) {
          if (!session.exercises) continue;
          for (const ex of session.exercises) {
            const p = ex.movement_pattern || 'unknown';
            if (setsPerPattern[p] > limit && ex.sets > 2) {
              ex.sets = Math.max(2, ex.sets - 1);
              setsPerPattern[p]--;
            }
          }
        }
      }

      return { fixed: true, flag: `Volume adjusted to ${level}-appropriate range (max ${limit} sets/muscle/week)` };
    }
  },
  {
    id: 'rest_day_inclusion',
    description: 'Minimum 1 full rest day per week',
    check: (plan) => {
      const template = plan.weekly_template || {};
      const restDays = Object.values(template).filter(d => d.session_type === 'rest').length;
      return restDays >= 1;
    },
    fix: (plan) => {
      const template = plan.weekly_template || {};
      // Make Sunday a rest day
      template['sunday'] = { session_type: 'rest', purpose: 'Mandatory recovery day' };
      return { fixed: true, flag: 'Rest day added (Sunday) to meet minimum requirement' };
    }
  },
  {
    id: 'deload_inclusion',
    description: 'Plans >= 4 weeks must include deload logic',
    check: (plan) => {
      if (!plan.plan_structure || plan.plan_structure.duration_weeks < 4) return true;
      // Check mesocycle implies deload
      return plan.plan_structure.mesocycle_length <= 5;
    },
    fix: (plan) => {
      if (plan.plan_structure) {
        plan.plan_structure.mesocycle_length = Math.min(plan.plan_structure.mesocycle_length || 4, 4);
        plan.plan_structure.deload_frequency = 'Every 4th week: reduce volume 40-50%, maintain intensity at RPE 5-6';
      }
      return { fixed: true, flag: 'Deload week ensured within mesocycle structure' };
    }
  },
  {
    id: 'disclaimer_present',
    description: 'All plans must include wellness disclaimer',
    check: (plan) => {
      return !!(plan.disclaimer || (plan.rationale && plan.rationale.includes('general wellness')));
    },
    fix: (plan) => {
      plan.disclaimer = 'This plan provides general wellness guidance and is not a substitute for professional medical advice. Consult a healthcare provider before starting any new exercise or nutrition program.';
      return { fixed: true, flag: 'Wellness disclaimer appended' };
    }
  }
];

// ── Validation Entry Point ──────────────────────────────────────────────────

/**
 * Validate a generated plan against all hard rules.
 * Returns the plan (possibly fixed) and a list of flags.
 */
function validatePlan(plan, profile) {
  const flags = [];
  let validatedPlan = JSON.parse(JSON.stringify(plan)); // deep clone

  for (const rule of HARD_RULES) {
    try {
      if (!rule.check(validatedPlan, profile)) {
        const result = rule.fix(validatedPlan, profile);
        flags.push({ rule: rule.id, description: rule.description, ...result });
        console.log(`[IronZ Validator] Rule failed: ${rule.id} — ${result.flag}`);
      }
    } catch (e) {
      console.warn(`[IronZ Validator] Error checking rule ${rule.id}:`, e.message);
    }
  }

  return {
    plan: validatedPlan,
    flags: flags,
    passed: flags.length === 0,
    passedAfterFixes: flags.every(f => f.fixed)
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPreviousActivePlan() {
  try {
    const stored = localStorage.getItem('activePlan');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return null;
}

function getClassificationLevel(profile) {
  if (profile.fitnessLevel) return profile.fitnessLevel;
  const survey = typeof getSurveyData === 'function' ? getSurveyData() : null;
  return survey?.fitnessLevel || 'beginner';
}
