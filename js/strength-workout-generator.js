// js/strength-workout-generator.js
// Strength is fundamentally different from the endurance modalities:
//
//   COMPOUND LIFTS DO NOT ROTATE.
//
// They follow the compound_lift_policy: same lift for 4-6 weeks with progressive
// overload (+2.5-5 lb/week or +1 rep/week until rep ceiling, then load bump).
// At cycle end, the next compound in the chain is selected (deterministic, NOT
// AI-picked). Only accessories use the variant rotation system.
//
// NO API calls.

(function () {
  "use strict";

  const COMPOUND_CYCLE_DEFAULT_WEEKS = 5; // mid-point of [4, 6]
  const ACCESSORY_CATEGORIES = [
    "accessory_quad",
    "accessory_hamstring_glute",
    "accessory_push",
    "accessory_pull",
    "accessory_core",
  ];

  function _readUserData() {
    try { return JSON.parse(localStorage.getItem("user_data") || "{}"); } catch { return {}; }
  }
  function _writeUserData(ud) {
    try {
      localStorage.setItem("user_data", JSON.stringify(ud));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("user_data");
    } catch {}
  }

  /**
   * Resolve which compound variant the user is currently on for a given lift.
   * Uses deterministic chain progression: at the start of every Nth cycle the
   * next link in the chain is picked. Returns the variant id (e.g. "back_squat").
   *
   * @param {string} lift — one of "squat","bench","deadlift","ohp","row"
   * @param {number} weekNumber — 0-indexed weeks since plan start
   * @param {number} [cycleWeeks=5]
   * @returns {string}
   */
  function getCompoundVariant(lift, weekNumber, cycleWeeks) {
    const cw = cycleWeeks || COMPOUND_CYCLE_DEFAULT_WEEKS;
    const lib = (typeof window !== "undefined" && window.VARIANT_LIBRARY_STRENGTH) || null;
    if (!lib || !lib.compound_chains || !lib.compound_chains[lift]) {
      return lift; // unknown chain — return the lift name as the variant
    }
    const chain = lib.compound_chains[lift];
    const cycleIdx = Math.floor((Number(weekNumber) || 0) / cw);
    return chain[cycleIdx % chain.length];
  }

  /**
   * Compute the progressive-overload week within the current cycle (1..cycleWeeks).
   */
  function getCompoundCycleWeek(weekNumber, cycleWeeks) {
    const cw = cycleWeeks || COMPOUND_CYCLE_DEFAULT_WEEKS;
    return ((Number(weekNumber) || 0) % cw) + 1;
  }

  /**
   * Build the progressive-overload load suggestion for a compound lift.
   * Strategy: start from a baseline (passed in or read from user_data) and
   * suggest +2.5-5 lb/week. Caller is responsible for actually pushing values
   * into the user's profile.
   */
  function buildCompoundProgression(lift, weekNumber, opts) {
    const cycleWeek = getCompoundCycleWeek(weekNumber, opts && opts.cycleWeeks);
    const baselineLbs = (opts && opts.baselineLbs) || 0;
    const stepLbs = (opts && opts.stepLbs) || 5;
    const suggestedLbs = baselineLbs + (cycleWeek - 1) * stepLbs;
    return {
      lift,
      variant: getCompoundVariant(lift, weekNumber, opts && opts.cycleWeeks),
      cycle_week: cycleWeek,
      sets: 4,
      reps: cycleWeek <= 3 ? "5" : "3",
      load_lbs: suggestedLbs > 0 ? suggestedLbs : null,
      progression_note: suggestedLbs > 0
        ? `Week ${cycleWeek} of cycle. Suggested load: ${suggestedLbs} lbs (+${(cycleWeek - 1) * stepLbs} from baseline).`
        : `Week ${cycleWeek} of cycle. Use a load that puts you at RPE 7-8 for the last set.`,
    };
  }

  /**
   * Generate a strength workout combining compounds + accessories.
   *
   * @param {Object} opts
   * @param {Array<string>} opts.compoundLifts — e.g. ["squat", "bench"]
   * @param {Array<{category: string, variantId: string}>} opts.accessories
   *   — caller passes the AI-selected (or deterministic) variant id per category
   * @param {number} opts.weekNumber
   * @param {string} [opts.experienceLevel]
   * @param {Object} [opts.compoundBaselines] — { squat: 225, bench: 185, ... }
   */
  function generateStrengthWorkout(opts) {
    const { compoundLifts, accessories, weekNumber, experienceLevel, compoundBaselines } = opts || {};
    if (!Array.isArray(compoundLifts)) {
      throw new Error("generateStrengthWorkout: compoundLifts is required (array)");
    }
    const lib = (typeof window !== "undefined" && window.VARIANT_LIBRARY_STRENGTH) || null;
    if (!lib) throw new Error("VARIANT_LIBRARY_STRENGTH not loaded");

    const exp = experienceLevel || "intermediate";
    const blocks = [];

    // Compound lifts — deterministic, NEVER rotated by AI.
    for (const lift of compoundLifts) {
      const baseline = compoundBaselines && compoundBaselines[lift] ? compoundBaselines[lift] : 0;
      const block = buildCompoundProgression(lift, weekNumber, { baselineLbs: baseline });
      blocks.push({ kind: "compound", ...block });
    }

    // Accessories — variant ids supplied by the caller (AI or deterministic).
    if (Array.isArray(accessories)) {
      for (const acc of accessories) {
        const cat = acc.category;
        const variants = lib.variants[cat] || [];
        const variant = variants.find(v => v.id === acc.variantId);
        if (!variant) {
          blocks.push({
            kind: "accessory",
            category: cat,
            variant_id: acc.variantId,
            name: "(unknown variant)",
            warning: `variant ${acc.variantId} not found in ${cat}`,
          });
          continue;
        }
        blocks.push({
          kind: "accessory",
          category: cat,
          variant_id: variant.id,
          name: variant.name,
          sets_reps: variant.sets_reps,
          primary_muscle: variant.primary_muscle,
          equipment: variant.equipment,
        });
      }
    }

    // Estimated duration: ~5 min per compound block, ~4 min per accessory.
    const compoundCount = blocks.filter(b => b.kind === "compound").length;
    const accessoryCount = blocks.filter(b => b.kind === "accessory").length;
    const estimated_duration_min = 10 + compoundCount * 12 + accessoryCount * 5; // warmup + work

    return {
      workout: {
        title: `Strength — Week ${weekNumber + 1}`,
        type: "strength",
        is_hard: true,
        estimated_duration_min,
        compound_lifts: blocks.filter(b => b.kind === "compound"),
        accessories: blocks.filter(b => b.kind === "accessory"),
        all_blocks: blocks,
        why_text: "Compounds drive raw strength via progressive overload; accessories rotate to keep regional hypertrophy progressing.",
        warnings: [],
      },
      warnings: [],
    };
  }

  /**
   * Should a strength session call the AI variant selector for a category?
   * Compounds NEVER call. Accessories use the rotation system.
   */
  function isAccessoryCategory(category) {
    return ACCESSORY_CATEGORIES.includes(category);
  }

  function isCompoundLift(name) {
    return ["squat", "bench", "deadlift", "ohp", "row"].includes(name);
  }

  const api = {
    generateStrengthWorkout,
    buildCompoundProgression,
    getCompoundVariant,
    getCompoundCycleWeek,
    isAccessoryCategory,
    isCompoundLift,
    ACCESSORY_CATEGORIES,
    COMPOUND_CYCLE_DEFAULT_WEEKS,
  };
  if (typeof window !== "undefined") window.StrengthWorkoutGenerator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
