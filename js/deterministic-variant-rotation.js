// js/deterministic-variant-rotation.js
// The deterministic fallback for variant selection. Pure function. Zero deps
// beyond the variant library it's given. Used as the standalone path AND as
// the fallback when the AI variant selector fails.
//
// Implements PHILOSOPHY_UPDATE_2026-04-09_workout_diversification.md
// "deterministic_fallback" section:
//   variantIndex = weekNumber mod libraryLength
//   if the resulting variant is in recentHistory[0:2], advance index by 1 mod
//   libraryLength until a valid variant is found.

(function () {
  "use strict";

  /**
   * Pick a variant deterministically.
   *
   * @param {Object} opts
   * @param {Array} opts.variants — full library array (filtered for experience)
   * @param {number} opts.weekNumber — 0-indexed weeks since plan start
   * @param {Array<string>} opts.recentHistory — variant ids the user did recently;
   *   index 0 = most recent. The first 2 entries form the "rotation window".
   * @returns {{ variantId: string, rationale: string, fromFallback: true,
   *             fallback_reason: string }}
   */
  function pickVariant(opts) {
    const { variants, weekNumber, recentHistory } = opts || {};
    if (!Array.isArray(variants) || variants.length === 0) {
      throw new Error("deterministic-variant-rotation: empty variant library");
    }
    const recent = Array.isArray(recentHistory) ? recentHistory.slice(0, 2) : [];
    const N = variants.length;
    const startIdx = ((Number(weekNumber) || 0) % N + N) % N;

    // Try start index first; if blocked by recent history, advance by 1 mod N.
    // Stop after at most N attempts (== "library has fewer than 2 unused variants").
    let chosenIdx = startIdx;
    let advanced = 0;
    while (advanced < N) {
      const candidate = variants[chosenIdx];
      if (!recent.includes(candidate.id)) {
        return {
          variantId: candidate.id,
          rationale: advanced === 0
            ? `deterministic rotation: weekNumber ${weekNumber} mod ${N} = index ${chosenIdx}`
            : `deterministic rotation: started at index ${startIdx}, advanced ${advanced} to skip recent variants`,
          fromFallback: true,
          fallback_reason: advanced === 0 ? "deterministic" : "stale_selection",
          index: chosenIdx,
        };
      }
      chosenIdx = (chosenIdx + 1) % N;
      advanced++;
    }
    // No unused variants — every variant is in the last 2. Per spec we fall
    // through and return the start index anyway ("unless the library has fewer
    // than 2 unused variants").
    return {
      variantId: variants[startIdx].id,
      rationale: `deterministic rotation: library exhausted, returning start index ${startIdx}`,
      fromFallback: true,
      fallback_reason: "library_exhausted",
      index: startIdx,
    };
  }

  /**
   * Convenience wrapper for the standalone deterministic path. Builds a 12-week
   * rotation for a given session type. Used by the harness to verify the
   * fallback alone produces correct plans before any AI code is touched.
   *
   * @param {Array} variants
   * @param {number} totalWeeks
   * @param {Object} [opts]
   * @param {number} [opts.startWeek=0]
   * @returns {Array<{ week: number, variantId: string }>}
   */
  function rotateForWeeks(variants, totalWeeks, opts) {
    const startWeek = (opts && opts.startWeek) || 0;
    const out = [];
    const history = []; // most recent first
    for (let i = 0; i < totalWeeks; i++) {
      const week = startWeek + i;
      const result = pickVariant({ variants, weekNumber: week, recentHistory: history });
      out.push({ week, variantId: result.variantId, fallback_reason: result.fallback_reason });
      history.unshift(result.variantId);
      if (history.length > 5) history.length = 5;
    }
    return out;
  }

  const api = { pickVariant, rotateForWeeks };

  if (typeof window !== "undefined") window.DeterministicVariantRotation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
