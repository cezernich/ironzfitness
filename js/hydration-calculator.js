/**
 * IronZ Rule Engine — Chunk 3: Hydration Calculator
 *
 * Returns the PLAN_SCHEMA.json `hydrationStrategy` object from a profile.
 * See sources-of-truth/TRAINING_PHILOSOPHY.md §11 and
 * sources-of-truth/RULE_ENGINE_SPEC.md Step 8.
 */
(function () {
  'use strict';

  function calculate(profile) {
    const p = profile || {};
    const weightLbs = Number(p.weight) || 165;
    const dailyBaselineOz = Math.max(48, Math.round(weightLbs * 0.5));

    return {
      dailyBaselineOz,
      preSessionOz: 18,
      duringSessionOzPerHour: 25,
      postSessionNotes: '16-24 oz per pound lost during exercise. Weigh pre/post long sessions to calibrate.',
      raceDayNotes: 'Electrolyte drink, not just water. Practice your race-day hydration in training first.',
    };
  }

  window.HydrationCalculator = { calculate };
})();
