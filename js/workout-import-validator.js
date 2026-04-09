// js/workout-import-validator.js
//
// Validates a shared workout before the receiver can schedule or save it.
// Implements FEATURE_SPEC_2026-04-09_workout_sharing.md → WORKOUT_IMPORT_VALIDATOR.
//
// HARD RULE (per spec): this module MUST import rule logic from
// js/workout-validator.js — NEVER copy-paste rules.

(function () {
  "use strict";

  // ─── Variant existence — uses the same library the generator uses ──────────

  function _variantExists(sportId, sessionTypeId, variantId) {
    if (typeof window === "undefined" || !window.VariantLibraries) return false;
    const variants = window.VariantLibraries.getLibraryFor(sportId, sessionTypeId);
    if (!Array.isArray(variants) || variants.length === 0) return false;
    return variants.some(v => v && v.id === variantId);
  }

  function _resolveVariant(sportId, sessionTypeId, variantId) {
    if (typeof window === "undefined" || !window.VariantLibraries) return null;
    const variants = window.VariantLibraries.getLibraryFor(sportId, sessionTypeId);
    if (!Array.isArray(variants)) return null;
    return variants.find(v => v && v.id === variantId) || null;
  }

  // ─── Receiver context loaders ──────────────────────────────────────────────

  function _readReceiverPlan() {
    if (typeof localStorage === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("trainingPlan") || "[]"); } catch { return []; }
  }
  function _readReceiverSchedule() {
    if (typeof localStorage === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch { return []; }
  }
  function _readReceiverProfile() {
    if (typeof localStorage === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("profile") || "{}"); } catch { return {}; }
  }
  function _readReceiverHistory() {
    // Past completions for the RECENTLY_DONE rule. The spec keeps these in the
    // workouts log keyed by date.
    if (typeof localStorage === "undefined") return [];
    try {
      const log = JSON.parse(localStorage.getItem("workouts") || "[]");
      // Normalize entries that may not carry variant_id directly.
      return log.map(w => ({
        date: w.date,
        variant_id: w.variant_id || w.variantId || null,
        sessionName: w.sessionName || w.name || null,
      })).filter(w => w.date);
    } catch { return []; }
  }

  function _experienceLevel(profile) {
    const lv = profile && (profile.experience_level || profile.level || profile.runLevel);
    return ["beginner", "intermediate", "advanced"].includes(lv) ? lv : "intermediate";
  }

  // ─── Date helpers ──────────────────────────────────────────────────────────

  function _addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function _todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  // ─── Suggested-date logic ──────────────────────────────────────────────────

  function _suggestBestDate(scaledWorkout, opts) {
    const today = _todayStr();
    const startFrom = (opts && opts.fromDate) || _addDays(today, 1);
    for (let offset = 0; offset < 14; offset++) {
      const candidateDate = _addDays(startFrom, offset);
      const result = _runConstraints(scaledWorkout, candidateDate);
      if (result.hardBlocks.length === 0 && result.warnings.length === 0) {
        return candidateDate;
      }
    }
    // Fall back to "first day with no hard blocks" if no clean slot exists.
    for (let offset = 0; offset < 14; offset++) {
      const candidateDate = _addDays(startFrom, offset);
      const result = _runConstraints(scaledWorkout, candidateDate);
      if (result.hardBlocks.length === 0) return candidateDate;
    }
    return null;
  }

  function _runConstraints(scaledWorkout, targetDate) {
    const WV = (typeof window !== "undefined" && window.WorkoutValidator) || null;
    if (!WV || !WV.evaluateConstraints) {
      return { hardBlocks: [], warnings: [] };
    }
    return WV.evaluateConstraints({
      candidate: {
        type: scaledWorkout.session_type_id,
        title: scaledWorkout.title || scaledWorkout.variant_name,
        is_hard: scaledWorkout.is_hard,
        variant_id: scaledWorkout.variant_id,
      },
      dateStr: targetDate,
      plan: _readReceiverPlan(),
      schedule: _readReceiverSchedule(),
      completedHistory: _readReceiverHistory(),
      experienceLevel: _experienceLevel(_readReceiverProfile()),
      includeHistoryRule: true,
    });
  }

  // ─── Zone translation ──────────────────────────────────────────────────────
  //
  // Build a "scaled workout" object using the receiver's zones. The sender's
  // paces are NOT transmitted, NOT computable here, and never enter this code
  // path. This is the receiver's view, in their own numbers.

  function _scaleForReceiver(sharedWorkout, variant) {
    const sportId = sharedWorkout.sportId || sharedWorkout.sport_id;
    const sessionTypeId = sharedWorkout.sessionTypeId || sharedWorkout.session_type_id;
    const variantId = sharedWorkout.variantId || sharedWorkout.variant_id;

    const profile = _readReceiverProfile();
    const experience = _experienceLevel(profile);
    let workout = null;

    // Hard-classification flag — from the shared library, not from the sender.
    const isHardSet = new Set(["long_run", "tempo_threshold", "track_workout", "speed_work", "hills",
      "bike_intervals_ftp", "bike_intervals_vo2", "bike_intervals_sweet_spot", "bike_intervals_sprint",
      "swim_css_intervals", "swim_speed", "hybrid_metcon", "hybrid_amrap", "hybrid_emom", "hybrid_chipper"]);
    const is_hard = isHardSet.has(sessionTypeId);

    try {
      if (sportId === "run" && typeof window !== "undefined" && window.RunningWorkoutGenerator) {
        // Run generator currently picks from session-type-library; use the
        // existing path so paces come from the receiver's zone bundle.
        const ZC = window.ZoneCalculator;
        const zones = ZC && ZC.getZonesForUser ? ZC.getZonesForUser() : null;
        const result = window.RunningWorkoutGenerator.generateRunWorkout({
          sessionTypeId,
          userZones: zones,
          experienceLevel: experience,
          weeksSincePlanStart: 0,
        });
        workout = result && result.workout ? result.workout : null;
      } else if (sportId === "bike" && typeof window !== "undefined" && window.BikeWorkoutGenerator) {
        const ZC = window.ZoneCalculator;
        const zones = ZC && ZC.getZonesForUser ? ZC.getZonesForUser() : null;
        const ftp = (zones && zones.ftp) || (profile && (profile.ftp_watts || profile.ftp)) || null;
        const result = window.BikeWorkoutGenerator.generateBikeWorkout({
          sessionTypeId, variantId, userZones: { ftp }, experienceLevel: experience,
        });
        workout = result && result.workout ? result.workout : null;
      } else if (sportId === "swim" && typeof window !== "undefined" && window.SwimWorkoutGenerator) {
        const css = (profile && (profile.css_sec_per_100m || profile.css)) || null;
        const result = window.SwimWorkoutGenerator.generateSwimWorkout({
          sessionTypeId, variantId, userZones: { css }, experienceLevel: experience,
        });
        workout = result && result.workout ? result.workout : null;
      }
    } catch (e) {
      // Generator failure shouldn't bring down the whole import — fall through
      // to the minimal scaled object below.
      if (typeof console !== "undefined") console.warn("[workout-import-validator] generator failure:", e.message);
    }

    // Minimal scaled object the validator + UI both consume.
    return {
      variant_id: variantId,
      variant_name: (variant && variant.name) || (workout && workout.title) || "Workout",
      sport_id: sportId,
      session_type_id: sessionTypeId,
      is_hard,
      title: (workout && workout.title) || (variant && variant.name) || "Workout",
      phases: workout && workout.phases ? workout.phases : null,
      estimated_duration_min: (workout && workout.estimated_duration_min) || null,
      scaled_to_receiver: true,
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Validate a shared workout for import.
   *
   * @param {Object} opts
   * @param {Object} opts.sharedWorkout — resolved share payload
   *   { variantId, sportId, sessionTypeId, shareNote, ... }
   * @param {string|null} [opts.targetDate] — proposed schedule date YYYY-MM-DD,
   *   or null for save-only.
   * @returns {{
   *   canImport: boolean,
   *   canSave: boolean,
   *   conflicts: Array,
   *   suggestedDate: string|null,
   *   scaledWorkout: Object,
   *   error?: string
   * }}
   */
  function validateImport(opts) {
    if (!opts || !opts.sharedWorkout) {
      return { canImport: false, canSave: false, conflicts: [], scaledWorkout: null, error: "INVALID_INPUT" };
    }
    const sw = opts.sharedWorkout;
    const sportId = sw.sportId || sw.sport_id;
    const sessionTypeId = sw.sessionTypeId || sw.session_type_id;
    const variantId = sw.variantId || sw.variant_id;
    const targetDate = opts.targetDate || null;

    // Step 1: variant existence — applies to BOTH save and schedule paths.
    if (!_variantExists(sportId, sessionTypeId, variantId)) {
      return {
        canImport: false,
        canSave: false,
        conflicts: [{ rule: "INVALID_VARIANT", severity: "block",
          message: "This workout is no longer available in the library." }],
        scaledWorkout: null,
        error: "INVALID_VARIANT",
      };
    }

    const variant = _resolveVariant(sportId, sessionTypeId, variantId);
    const scaledWorkout = _scaleForReceiver(sw, variant);

    // Save path is always allowed (variant exists).
    let canSave = true;

    // No target date → save only path. canImport not applicable.
    if (!targetDate) {
      const suggestedDate = _suggestBestDate(scaledWorkout);
      return {
        canImport: false,
        canSave,
        conflicts: [],
        suggestedDate,
        scaledWorkout,
      };
    }

    // Step 2-6: run the shared rule module against the proposed date.
    const constraintResult = _runConstraints(scaledWorkout, targetDate);
    const conflicts = [...constraintResult.hardBlocks, ...constraintResult.warnings];
    const hasHardBlock = constraintResult.hardBlocks.length > 0;

    return {
      canImport: !hasHardBlock,
      canSave,
      conflicts,
      suggestedDate: _suggestBestDate(scaledWorkout),
      scaledWorkout,
    };
  }

  const api = {
    validateImport,
    _scaleForReceiver,    // exported for tests
    _runConstraints,      // exported for tests
    _suggestBestDate,     // exported for tests
  };

  if (typeof window !== "undefined") window.WorkoutImportValidator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
