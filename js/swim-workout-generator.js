// js/swim-workout-generator.js
// Pure-function swim workout generator. Uses VARIANT_LIBRARY_SWIM and CSS pace.
// NO API calls.

(function () {
  "use strict";

  function _fmtMmSs(sec) {
    const t = Math.round(sec);
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Resolve a pace_source token like "css", "css_plus_5", "css_minus_5",
  // "css_plus_10", "css_plus_12" against the user's CSS (sec/100m).
  function _resolveCssPace(token, css) {
    if (!css) return null;
    if (token === "css") return css;
    const m = String(token || "").match(/^css_(plus|minus)_(\d+)$/);
    if (!m) return css;
    const sign = m[1] === "plus" ? 1 : -1;
    return css + sign * parseInt(m[2], 10);
  }

  function _formatPace(secPer100m) {
    if (secPer100m == null) return "by feel";
    return `${_fmtMmSs(secPer100m)}/100m`;
  }

  function _resolveCount(spec, exp) {
    if (typeof spec === "number") return spec;
    if (spec && typeof spec === "object") return spec[exp] || spec.intermediate || spec.beginner;
    return null;
  }

  /**
   * generateSwimWorkout({ sessionTypeId, variantId, userZones, experienceLevel })
   * userZones may be { css: <sec/100m> } or the structured zone bundle with .swim.css
   */
  function generateSwimWorkout(opts) {
    const { sessionTypeId, variantId, userZones, experienceLevel } = opts || {};
    if (!sessionTypeId || !variantId) {
      throw new Error("generateSwimWorkout: missing sessionTypeId or variantId");
    }
    const lib = (typeof window !== "undefined" && window.VARIANT_LIBRARY_SWIM) || null;
    if (!lib) throw new Error("VARIANT_LIBRARY_SWIM not loaded");
    const variants = lib.variants[sessionTypeId];
    if (!variants) throw new Error("unknown swim session type: " + sessionTypeId);
    const variant = variants.find(v => v.id === variantId);
    if (!variant) throw new Error(`unknown swim variant: ${variantId}`);

    const exp = experienceLevel || "intermediate";
    const css = (userZones && (userZones.css || (userZones.swim && userZones.swim.css))) || null;
    const warnings = [];
    if (!css) warnings.push("For accurate swim pace targets, log a CSS test result.");

    const phases = [];
    phases.push({
      phase: "warmup",
      distance_m: 400,
      target: "easy",
      instruction: "WU 400m easy + 4x50m build.",
    });

    const ms = variant.main_set || {};
    let mainText = "";
    let mainDistance = 0;

    if (ms.type === "continuous" || ms.type === "continuous_with_tool") {
      const pace = _resolveCssPace(ms.pace_source, css);
      const dist = ms.distance_m || 1500;
      mainText = `${dist}m continuous @ ${_formatPace(pace)}.`;
      mainDistance = dist;
    } else if (ms.type === "ladder") {
      const rungs = ms.rungs_m || [];
      const pace = _resolveCssPace(ms.pace_source, css);
      mainText = `Ladder ${rungs.join("/")} @ ${_formatPace(pace)} w/ ${ms.rest_sec || 15}s rest.`;
      mainDistance = rungs.reduce((a, b) => a + b, 0);
    } else if (ms.type === "broken") {
      const reps = ms.reps || 4;
      const dist = ms.distance_m || 400;
      const breakAt = ms.break_at_m || 100;
      const pace = _resolveCssPace(ms.pace_source, css);
      mainText = `${reps}x${dist}m @ ${_formatPace(pace)}, broken every ${breakAt}m w/ ${ms.break_rest_sec || 10}s rest inside each rep.`;
      mainDistance = reps * dist;
    } else if (ms.type === "descending" && Array.isArray(ms.sets)) {
      const parts = ms.sets.map(s => {
        const p = _resolveCssPace(s.pace_source, css);
        return `${s.reps}x${s.distance_m} @ ${_formatPace(p)}`;
      });
      mainText = parts.join(" → ") + ".";
      mainDistance = ms.sets.reduce((a, s) => a + s.reps * s.distance_m, 0);
    } else if (ms.drills) {
      const reps = ms.reps || 6;
      const dist = ms.distance_m || 100;
      mainText = `${reps}x${dist}m drill set: ${ms.drills.join(" / ")}.`;
      mainDistance = reps * dist;
    } else {
      // Standard reps + distance + pace
      const reps = _resolveCount(ms.reps, exp);
      const dist = ms.distance_m || 100;
      const pace = _resolveCssPace(ms.pace_source, css);
      const rest = ms.rest_sec || 15;
      const paceLabel = ms.effort === "maximal" ? "max effort" : _formatPace(pace);
      mainText = `${reps}x${dist}m @ ${paceLabel} w/ ${rest}s rest.`;
      mainDistance = reps * dist;
    }

    phases.push({
      phase: "main_set",
      distance_m: mainDistance,
      target: variant.name,
      instruction: mainText,
    });

    phases.push({
      phase: "cooldown",
      distance_m: 200,
      target: "easy",
      instruction: "CD 200m easy.",
    });

    const totalDistance = 400 + mainDistance + 200;
    return {
      workout: {
        title: variant.name,
        type: sessionTypeId,
        variant_id: variantId,
        is_hard: sessionTypeId === "swim_css_intervals" || sessionTypeId === "swim_speed",
        estimated_distance_m: totalDistance,
        phases,
        why_text: variant.description || "",
        warnings,
      },
      warnings,
    };
  }

  const api = { generateSwimWorkout };
  if (typeof window !== "undefined") window.SwimWorkoutGenerator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
