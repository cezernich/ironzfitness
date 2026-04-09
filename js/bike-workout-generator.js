// js/bike-workout-generator.js
// Pure-function bike workout generator. Mirrors running-workout-generator
// but consumes VARIANT_LIBRARY_BIKE and uses Coggan % FTP for power targets.
// NO API calls. NO randomness.

(function () {
  "use strict";

  function _clampRepCount(repSpec, experience) {
    if (typeof repSpec === "number") return repSpec;
    if (repSpec && typeof repSpec === "object") {
      return repSpec[experience] || repSpec.intermediate || repSpec.beginner;
    }
    return null;
  }

  function _formatPower(ftp, pctOrRange) {
    if (Array.isArray(pctOrRange)) {
      return `${Math.round(ftp * pctOrRange[0])}–${Math.round(ftp * pctOrRange[1])} W`;
    }
    return `${Math.round(ftp * pctOrRange)} W`;
  }

  function _formatTime(sec) {
    if (sec >= 60) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, "0")}`;
    }
    return `${sec}s`;
  }

  /**
   * generateBikeWorkout({ sessionTypeId, variantId, userZones, experienceLevel,
   *   durationOverrideMin })
   *
   * userZones is the structured zone bundle from zone-calculator.getZonesForUser()
   * with .ftp.ftp populated, OR a flat object { ftp: <int> }.
   */
  function generateBikeWorkout(opts) {
    const { sessionTypeId, variantId, userZones, experienceLevel } = opts || {};
    if (!sessionTypeId || !variantId) {
      throw new Error("generateBikeWorkout: missing sessionTypeId or variantId");
    }
    const lib = (typeof window !== "undefined" && window.VARIANT_LIBRARY_BIKE) || null;
    if (!lib) throw new Error("VARIANT_LIBRARY_BIKE not loaded");
    const variants = lib.variants[sessionTypeId];
    if (!variants) throw new Error("unknown bike session type: " + sessionTypeId);
    const variant = variants.find(v => v.id === variantId);
    if (!variant) throw new Error(`unknown bike variant: ${variantId} for ${sessionTypeId}`);

    const exp = experienceLevel || "intermediate";
    const ftp = (userZones && (userZones.ftp || (userZones.bike && userZones.bike.ftp))) || null;
    const warnings = [];
    if (!ftp) warnings.push("For accurate power targets, log an FTP test result.");

    const wuMin = sessionTypeId === "bike_endurance" ? 5 : 15;
    const cdMin = sessionTypeId === "bike_endurance" ? 5 : 10;

    const ms = variant.main_set || {};
    const phases = [];
    phases.push({
      phase: "warmup",
      duration_min: wuMin,
      target: "Z1 easy spin",
      instruction: `WU ${wuMin} min easy spin.`,
    });

    let mainText = "";
    let mainMin = 0;
    let repCount = null;

    if (ms.type === "continuous") {
      const dur = (opts.durationOverrideMin || 60);
      const power = ftp ? _formatPower(ftp, ms.power_target_pct_ftp || [0.65, 0.75]) : "Z2 effort";
      mainText = `${dur} min continuous @ ${power}.`;
      mainMin = dur;
    } else if (ms.type === "base_plus_surges") {
      const dur = (opts.durationOverrideMin || 90);
      const surges = ms.surges || {};
      const power = ftp ? _formatPower(ftp, ms.base_pct_ftp || [0.65, 0.75]) : "Z2";
      const surgePower = ftp ? _formatPower(ftp, surges.power_target_pct_ftp || 1.05) : "Z4";
      mainText = `${dur} min @ ${power} with ${surges.count || 6}x${_formatTime(surges.duration_sec || 60)} surges @ ${surgePower}.`;
      mainMin = dur;
    } else if (ms.type === "alternation_block" || ms.type === "progression") {
      // FTP over-unders / VO2 progressions: rep_count uses .reps
      const reps = _clampRepCount(ms.reps, exp);
      const repDur = ms.duration_sec || 0;
      const blocks = ms.blocks || [];
      let blockText;
      if (ms.type === "alternation_block" && blocks.length === 2) {
        const a = ftp ? _formatPower(ftp, blocks[0].power_target_pct_ftp) : "Z4";
        const b = ftp ? _formatPower(ftp, blocks[1].power_target_pct_ftp) : "Z3";
        const aDur = blocks[0].duration_sec || 60;
        const bDur = blocks[1].duration_sec || 60;
        blockText = `alternating ${_formatTime(aDur)} @ ${a} / ${_formatTime(bDur)} @ ${b}`;
      } else if (ms.type === "progression") {
        const lo = ftp ? _formatPower(ftp, ms.start_pct_ftp || 1.00) : "Z4";
        const hi = ftp ? _formatPower(ftp, ms.end_pct_ftp || 1.15) : "Z5";
        blockText = `progressing from ${lo} to ${hi}`;
      } else {
        blockText = "as prescribed";
      }
      mainText = `${reps}x${_formatTime(repDur)} ${blockText} w/ ${_formatTime(ms.rest_sec || 180)} easy.`;
      mainMin = Math.round((reps * repDur + (reps - 1) * (ms.rest_sec || 180)) / 60);
      repCount = reps;
    } else {
      // Standard interval block: reps, duration_sec, power_target_pct_ftp, rest_sec
      const reps = _clampRepCount(ms.reps, exp);
      const repDur = ms.duration_sec || 0;
      const restSec = ms.rest_sec || 180;
      const power = ftp
        ? _formatPower(ftp, ms.power_target_pct_ftp || 1.0)
        : (ms.effort === "maximal" ? "max effort" : "Z4 effort");
      mainText = `${reps}x${_formatTime(repDur)} @ ${power} w/ ${_formatTime(restSec)} easy.`;
      mainMin = Math.round((reps * repDur + (reps - 1) * restSec) / 60);
      repCount = reps;
    }

    phases.push({
      phase: "main_set",
      duration_min: mainMin,
      target: variant.name,
      rep_count: repCount,
      instruction: mainText,
    });

    phases.push({
      phase: "cooldown",
      duration_min: cdMin,
      target: "Z1 easy spin",
      instruction: `CD ${cdMin} min easy spin.`,
    });

    const totalMin = wuMin + mainMin + cdMin;
    return {
      workout: {
        title: `${variant.name}`,
        type: sessionTypeId,
        variant_id: variantId,
        is_hard: sessionTypeId !== "bike_endurance",
        estimated_duration_min: totalMin,
        phases,
        why_text: variant.description || "",
        warnings,
      },
      warnings,
    };
  }

  const api = { generateBikeWorkout };
  if (typeof window !== "undefined") window.BikeWorkoutGenerator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
