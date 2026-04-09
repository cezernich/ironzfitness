// js/variant-libraries/index.js
// Re-exports all 5 libraries plus a getLibraryFor(sport, sessionType) helper.

(function () {
  "use strict";

  function _allLoaded() {
    if (typeof window === "undefined") return false;
    return !!(window.VARIANT_LIBRARY_RUN && window.VARIANT_LIBRARY_BIKE
      && window.VARIANT_LIBRARY_SWIM && window.VARIANT_LIBRARY_STRENGTH
      && window.VARIANT_LIBRARY_HYBRID);
  }

  const SPORT_TO_LIBRARY = {
    run: "VARIANT_LIBRARY_RUN",
    running: "VARIANT_LIBRARY_RUN",
    bike: "VARIANT_LIBRARY_BIKE",
    cycling: "VARIANT_LIBRARY_BIKE",
    swim: "VARIANT_LIBRARY_SWIM",
    swimming: "VARIANT_LIBRARY_SWIM",
    strength: "VARIANT_LIBRARY_STRENGTH",
    weightlifting: "VARIANT_LIBRARY_STRENGTH",
    hybrid: "VARIANT_LIBRARY_HYBRID",
    hiit: "VARIANT_LIBRARY_HYBRID",
  };

  // Map session_type_id → sport, used when callers only have a session type.
  const SESSION_TYPE_TO_SPORT = {
    track_workout: "run",
    tempo_threshold: "run",
    speed_work: "run",
    hills: "run",
    long_run: "run",
    endurance: "run",
    easy_recovery: "run",
    fun_social: "run",
    bike_intervals_ftp: "bike",
    bike_intervals_vo2: "bike",
    bike_intervals_sweet_spot: "bike",
    bike_intervals_sprint: "bike",
    bike_endurance: "bike",
    swim_css_intervals: "swim",
    swim_speed: "swim",
    swim_endurance: "swim",
    swim_technique: "swim",
    accessory_quad: "strength",
    accessory_hamstring_glute: "strength",
    accessory_push: "strength",
    accessory_pull: "strength",
    accessory_core: "strength",
    hybrid_metcon: "hybrid",
    hybrid_amrap: "hybrid",
    hybrid_emom: "hybrid",
    hybrid_chipper: "hybrid",
  };

  // Session types that NEVER call the AI variant selector.
  // - easy_recovery / fun_social: minor variation only or no variation needed
  // - compound_lifts: governed by compound_lift_policy in strength library
  const EXCLUDED_FROM_AI_SELECTION = new Set([
    "easy_recovery",
    "fun_social",
    "endurance",
    "swim_endurance",
    "swim_technique",
    "bike_endurance",
    "compound_lift",
  ]);

  function getLibrary(sport) {
    if (typeof window === "undefined") return null;
    const key = SPORT_TO_LIBRARY[sport];
    return key ? window[key] : null;
  }

  /**
   * Return the variants array for a given (sport, sessionType) pair.
   * Sport may be omitted; we'll infer it from the session type.
   */
  function getLibraryFor(sport, sessionType) {
    const inferredSport = sport || SESSION_TYPE_TO_SPORT[sessionType];
    const lib = getLibrary(inferredSport);
    if (!lib || !lib.variants) return null;
    return lib.variants[sessionType] || null;
  }

  function getRotationCadence(sport, sessionType) {
    const inferredSport = sport || SESSION_TYPE_TO_SPORT[sessionType];
    const lib = getLibrary(inferredSport);
    if (!lib || !lib.rotation_cadence_by_type) return null;
    return lib.rotation_cadence_by_type[sessionType] || null;
  }

  /**
   * Filter variants by the user's experience level.
   * Variants with no `experience_minimum` are always allowed.
   */
  function filterByExperience(variants, experienceLevel) {
    if (!Array.isArray(variants)) return [];
    const ranks = { beginner: 0, intermediate: 1, advanced: 2 };
    const userRank = ranks[experienceLevel] != null ? ranks[experienceLevel] : 1;
    return variants.filter(v => {
      if (!v.experience_minimum) return true;
      const minRank = ranks[v.experience_minimum] != null ? ranks[v.experience_minimum] : 0;
      return userRank >= minRank;
    });
  }

  function isExcludedFromAiSelection(sessionType) {
    return EXCLUDED_FROM_AI_SELECTION.has(sessionType);
  }

  const api = {
    SPORT_TO_LIBRARY,
    SESSION_TYPE_TO_SPORT,
    EXCLUDED_FROM_AI_SELECTION,
    getLibrary,
    getLibraryFor,
    getRotationCadence,
    filterByExperience,
    isExcludedFromAiSelection,
    allLoaded: _allLoaded,
  };

  if (typeof window !== "undefined") window.VariantLibraries = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    // Also re-export the libraries themselves for Node test harnesses
    try {
      module.exports.VARIANT_LIBRARY_RUN      = require("./run.js");
      module.exports.VARIANT_LIBRARY_BIKE     = require("./bike.js");
      module.exports.VARIANT_LIBRARY_SWIM     = require("./swim.js");
      module.exports.VARIANT_LIBRARY_STRENGTH = require("./strength.js");
      module.exports.VARIANT_LIBRARY_HYBRID   = require("./hybrid.js");
    } catch {}
  }
})();
