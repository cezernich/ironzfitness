// js/swim-workout-generator.js
// Pure-function swim workout generator. Uses VARIANT_LIBRARY_SWIM and CSS pace.
// NO API calls.
//
// Emits the canonical swim-workout shape (js/swim-workout-model.js):
//   { steps: [interval|rest|repeat, ...], pool_size_m, pool_unit,
//     total_distance_m, title, why_text, warnings }
//
// Back-compat: also emits the legacy `phases` array + `estimated_distance_m`
// so importers and any old consumers keep working.

(function () {
  "use strict";

  function _fmtMmSs(sec) {
    const t = Math.round(sec);
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function _resolveCssPace(token, css) {
    if (!css) return null;
    if (token === "css") return css;
    const m = String(token || "").match(/^css_(plus|minus)_(\d+)$/);
    if (!m) return css;
    const sign = m[1] === "plus" ? 1 : -1;
    return css + sign * parseInt(m[2], 10);
  }

  function _paceLabel(secPer100m) {
    if (secPer100m == null) return "easy";
    return `${_fmtMmSs(secPer100m)}/100m`;
  }

  function _resolveCount(spec, exp) {
    if (typeof spec === "number") return spec;
    if (spec && typeof spec === "object") return spec[exp] || spec.intermediate || spec.beginner;
    return null;
  }

  // Snap a target distance to a whole number of pool lengths using the
  // SwimWorkout helper when available. Returns an integer meter value.
  function _snap(targetM, pool) {
    const M = (typeof window !== "undefined" && window.SwimWorkout) || null;
    if (M && M.snapDistanceToPool) return M.snapDistanceToPool(targetM, pool).distance_m;
    return Math.round(targetM);
  }

  function _totalDistance(steps) {
    const M = (typeof window !== "undefined" && window.SwimWorkout) || null;
    if (M && M.totalDistance) return M.totalDistance(steps);
    // Minimal fallback so this module still works in Node unit tests
    let total = 0;
    for (const s of steps || []) {
      if (!s) continue;
      if (s.kind === "interval") total += s.distance_m || 0;
      else if (s.kind === "repeat") total += _totalDistance(s.children || []) * (s.count || 0);
    }
    return total;
  }

  // Estimate total time for a step subtree (in minutes) at the given
  // sec/100m pace. Used to scale the main set so the whole workout
  // lands close to the user's requested duration.
  function _stepsTimeMin(steps, paceSecPer100m) {
    let totalSec = 0;
    (function walk(arr, mult) {
      if (!Array.isArray(arr)) return;
      for (const s of arr) {
        if (!s) continue;
        if (s.kind === "interval") totalSec += mult * (s.distance_m / 100) * paceSecPer100m;
        else if (s.kind === "rest") totalSec += mult * (s.duration_sec || 0);
        else if (s.kind === "repeat") walk(s.children || [], mult * (s.count || 1));
      }
    })(steps || [], 1);
    return totalSec / 60;
  }

  // ─── Step builders ───────────────────────────────────────────────────────

  function _iv(name, distance_m, stroke, pace_target) {
    return {
      kind: "interval",
      name: name || "",
      distance_m: Math.round(distance_m),
      stroke: stroke || "freestyle",
      pace_target: pace_target || "",
    };
  }
  function _rest(sec) {
    return { kind: "rest", duration_sec: Math.max(0, Math.round(sec || 0)) };
  }
  function _repeat(count, children) {
    return { kind: "repeat", count: Math.max(1, Math.round(count || 1)), children };
  }

  // ─── Main-set builders keyed off variant.main_set.type ───────────────────

  // Default: N × dist @ pace w/ rest sec (the bread-and-butter interval set).
  function _buildStandardReps(ms, css, pool, exp) {
    const reps = _resolveCount(ms.reps, exp) || 1;
    const dist = _snap(ms.distance_m || 100, pool);
    const pace = _resolveCssPace(ms.pace_source, css);
    const rest = ms.rest_sec || 15;
    const paceLabel = ms.effort === "maximal" ? "max" : _paceLabel(pace);
    return [
      _repeat(reps, [
        _iv("Main", dist, "freestyle", paceLabel),
        _rest(rest),
      ]),
    ];
  }

  function _buildContinuous(ms, css, pool, totalDistanceHint) {
    const pace = _resolveCssPace(ms.pace_source, css);
    const dist = _snap(ms.distance_m || totalDistanceHint || 1500, pool);
    return [ _iv("Continuous", dist, "freestyle", _paceLabel(pace)) ];
  }

  function _buildContinuousWithTool(ms, css, pool) {
    const pace = _resolveCssPace(ms.pace_source, css);
    const full = _snap(ms.distance_m || 1500, pool);
    const half = _snap(full / 2, pool);
    return [
      _iv("With pull buoy", half, "freestyle", _paceLabel(pace)),
      _rest(20),
      _iv("No tools", half, "freestyle", _paceLabel(pace)),
    ];
  }

  function _buildLadder(ms, css, pool) {
    const rungs = ms.rungs_m || [50, 100, 150, 200, 150, 100, 50];
    const pace = _resolveCssPace(ms.pace_source, css);
    const rest = ms.rest_sec || 15;
    const label = _paceLabel(pace);
    const steps = [];
    rungs.forEach((m, idx) => {
      steps.push(_iv("Ladder", _snap(m, pool), "freestyle", label));
      if (idx < rungs.length - 1) steps.push(_rest(rest));
    });
    return steps;
  }

  function _buildBroken(ms, css, pool) {
    const reps = ms.reps || 4;
    const dist = _snap(ms.distance_m || 400, pool);
    const breakAt = _snap(ms.break_at_m || 100, pool);
    const breakRest = ms.break_rest_sec || 10;
    const pace = _resolveCssPace(ms.pace_source, css);
    const label = _paceLabel(pace);
    const chunks = Math.max(1, Math.round(dist / breakAt));
    // One outer rep = chunks × (breakAt + breakRest) minus trailing rest
    const inner = [];
    for (let i = 0; i < chunks; i++) {
      inner.push(_iv(i === 0 ? "Broken" : "", breakAt, "freestyle", label));
      if (i < chunks - 1) inner.push(_rest(breakRest));
    }
    inner.push(_rest(30)); // rest between outer reps
    return [_repeat(reps, inner)];
  }

  function _buildDescending(ms, css, pool) {
    const sets = Array.isArray(ms.sets) ? ms.sets : null;
    if (sets) {
      const out = [];
      sets.forEach((s, idx) => {
        const reps = s.reps || 1;
        const dist = _snap(s.distance_m || 100, pool);
        const pace = _resolveCssPace(s.pace_source, css);
        const rest = s.rest_sec || 15;
        out.push(_repeat(reps, [
          _iv("Descending", dist, "freestyle", _paceLabel(pace)),
          _rest(rest),
        ]));
        if (idx < sets.length - 1) out.push(_rest(20));
      });
      return out;
    }
    // Homogeneous descending set: label the pace as "descending"
    const reps = ms.reps || 8;
    const dist = _snap(ms.distance_m || 75, pool);
    const rest = ms.rest_sec || 20;
    return [ _repeat(reps, [
      _iv("Descending", dist, "freestyle", "descend 1→last"),
      _rest(rest),
    ])];
  }

  function _buildDrills(ms, pool) {
    const reps = ms.reps || 6;
    const dist = _snap(ms.distance_m || 100, pool);
    const drillText = (ms.drills || []).join(" / ");
    return [ _repeat(reps, [
      _iv("Drill", dist, "freestyle", drillText || "drill"),
      _rest(15),
    ])];
  }

  // ─── Warmup / cooldown variants (for variety across sessions) ───────────

  function _buildWarmup(idx, pool) {
    switch (idx) {
      case 1:
        // Mixed strokes warmup: 200 choice + 4×50 kick-drill-swim
        return [
          _iv("Warm Up", _snap(200, pool), "choice", "easy"),
          _rest(15),
          _repeat(4, [
            _iv("K/D/S", _snap(50, pool), "freestyle", "kick / drill / swim by 25"),
            _rest(15),
          ]),
        ];
      case 2:
        // Classic 300 / 4×25 build
        return [
          _iv("Warm Up", _snap(300, pool), "freestyle", "easy"),
          _rest(15),
          _repeat(4, [
            _iv("Build", _snap(25, pool), "freestyle", "build to fast"),
            _rest(10),
          ]),
        ];
      case 3:
        // Longer aerobic warmup (for longer main sets)
        return [
          _iv("Warm Up", _snap(500, pool), "freestyle", "easy aerobic"),
          _rest(20),
          _repeat(6, [
            _iv("Stroke Count", _snap(50, pool), "freestyle", "count strokes, hold form"),
            _rest(10),
          ]),
        ];
      default:
        // Variant 0 — the classic 400 + 4×50 build
        return [
          _iv("Warm Up", _snap(400, pool), "freestyle", "easy"),
          _rest(15),
          _repeat(4, [
            _iv("Build", _snap(50, pool), "freestyle", "easy → strong"),
            _rest(10),
          ]),
        ];
    }
  }

  function _buildCooldown(idx, pool) {
    switch (idx) {
      case 1:
        return [
          _iv("Cool Down", _snap(150, pool), "backstroke", "easy"),
          _rest(10),
          _iv("Easy", _snap(100, pool), "choice", "very easy"),
        ];
      case 2:
        return [ _iv("Cool Down", _snap(300, pool), "choice", "easy, long and loose") ];
      default:
        return [ _iv("Cool Down", _snap(200, pool), "choice", "easy") ];
    }
  }

  // Build a main set scaled to fit a target time budget (minutes), at a
  // given sec/100m pace. Returns null for variant types we don't know how
  // to scale safely (ladder/broken/descending) so the caller falls back
  // to the unscaled builder.
  function _buildScaledMain(ms, css, pool, paceSecPer100m, budgetMin) {
    if (budgetMin <= 0) return null;
    const pace = _resolveCssPace(ms.pace_source, css);
    const paceLabel = ms.effort === "maximal" ? "max" : _paceLabel(pace);
    if (ms.type === "continuous") {
      const distM = _snap((budgetMin * 60 / paceSecPer100m) * 100, pool);
      return [_iv("Continuous", distM, "freestyle", paceLabel)];
    }
    if (ms.type === "continuous_with_tool") {
      const totalM = (budgetMin * 60 / paceSecPer100m) * 100;
      const half = _snap(totalM / 2, pool);
      return [
        _iv("With pull buoy", half, "freestyle", paceLabel),
        _rest(20),
        _iv("No tools", half, "freestyle", paceLabel),
      ];
    }
    if (ms.reps && ms.distance_m && !ms.type) {
      const dist = _snap(ms.distance_m, pool);
      const rest = ms.rest_sec || 15;
      const repTimeSec = (dist / 100) * paceSecPer100m + rest;
      const fitReps = Math.max(1, Math.floor((budgetMin * 60) / repTimeSec));
      return [_repeat(fitReps, [
        _iv("Main", dist, "freestyle", paceLabel),
        _rest(rest),
      ])];
    }
    if (ms.drills && ms.reps && ms.distance_m) {
      const dist = _snap(ms.distance_m, pool);
      const rest = 15;
      const repTimeSec = (dist / 100) * paceSecPer100m + rest;
      const fitReps = Math.max(1, Math.floor((budgetMin * 60) / repTimeSec));
      const drillText = (ms.drills || []).join(" / ");
      return [_repeat(fitReps, [
        _iv("Drill", dist, "freestyle", drillText || "drill"),
        _rest(rest),
      ])];
    }
    return null;
  }

  // ─── Public entry point ──────────────────────────────────────────────────

  /**
   * generateSwimWorkout({ sessionTypeId, variantId, userZones, experienceLevel,
   *                       poolSize?, targetDurationMin? })
   * userZones may be { css: <sec/100m> } or { swim: { css } }.
   * poolSize is optional — falls back to the user's profile setting.
   * targetDurationMin (optional) — when supplied, the main set is scaled
   * so the whole workout lands close to this many minutes. Without it,
   * the variant's built-in distances are used unchanged.
   */
  function generateSwimWorkout(opts) {
    const { sessionTypeId, variantId, userZones, experienceLevel, targetDurationMin } = opts || {};
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

    const M = (typeof window !== "undefined" && window.SwimWorkout) || null;
    const pool = (opts && opts.poolSize) || (M && M.getUserPoolSize ? M.getUserPoolSize() : { length_m: 25, unit: "m" });

    const warnings = [];
    if (!css) warnings.push("For accurate swim pace targets, log a CSS test result.");

    // Variety: rotate warmup + cooldown shapes per variantOffset so two
    // sessions of the same type don't feel identical. Previously every
    // workout started with "400m easy + 4×50 build", every time.
    const variantOffset = (opts && typeof opts.variantOffset === "number") ? opts.variantOffset : 0;
    const warmupIdx = Math.abs(variantOffset) % 4;
    const cooldownIdx = Math.abs(variantOffset) % 3;

    const warmupSteps = _buildWarmup(warmupIdx, pool);
    const beforeMain = _rest(30);
    // Main — pick builder based on variant main_set shape
    const ms = variant.main_set || {};
    let mainSteps;
    if (ms.type === "continuous") mainSteps = _buildContinuous(ms, css, pool);
    else if (ms.type === "continuous_with_tool") mainSteps = _buildContinuousWithTool(ms, css, pool);
    else if (ms.type === "ladder") mainSteps = _buildLadder(ms, css, pool);
    else if (ms.type === "broken") mainSteps = _buildBroken(ms, css, pool);
    else if (ms.type === "descending") mainSteps = _buildDescending(ms, css, pool);
    else if (ms.drills) mainSteps = _buildDrills(ms, pool);
    else mainSteps = _buildStandardReps(ms, css, pool, exp);

    const beforeCd = _rest(30);
    const cooldownSteps = _buildCooldown(cooldownIdx, pool);

    // If the caller specified a target duration, rebuild the main set to
    // fit the remaining time budget after warmup + cooldown. Without this
    // a 30-min request lands a 50-min workout because the canonical
    // variants ship with fixed distances (e.g. continuous defaults to
    // 1500m regardless of how long the user asked for).
    if (targetDurationMin && targetDurationMin > 0) {
      const paceSecPer100m = css || 132; // fallback: ~2:12/100m
      const wuTimeMin = _stepsTimeMin(warmupSteps, paceSecPer100m) + (beforeMain.duration_sec / 60);
      const cdTimeMin = (beforeCd.duration_sec / 60) + _stepsTimeMin(cooldownSteps, paceSecPer100m);
      const mainBudgetMin = targetDurationMin - wuTimeMin - cdTimeMin;
      const scaled = _buildScaledMain(ms, css, pool, paceSecPer100m, mainBudgetMin);
      if (scaled) mainSteps = scaled;
    }

    const steps = [
      ...warmupSteps,
      beforeMain,
      ...mainSteps,
      beforeCd,
      ...cooldownSteps,
    ];

    const totalDistance = _totalDistance(steps);

    // Legacy phases (kept for back-compat with importers / old consumers).
    const legacyPhases = [
      { phase: "warmup",   distance_m: _snap(400, pool) + _snap(50, pool) * 4,
        target: "easy",    instruction: "WU 400m easy + 4x50m build." },
      { phase: "main_set", distance_m: _totalDistance(mainSteps),
        target: variant.name,
        instruction: M && M.prosify ? M.prosify(mainSteps) : variant.description || "" },
      { phase: "cooldown", distance_m: _snap(200, pool),
        target: "easy",    instruction: "CD 200m easy choice." },
    ];

    return {
      workout: {
        title: variant.name,
        type: sessionTypeId,
        variant_id: variantId,
        is_hard: sessionTypeId === "swim_css_intervals" || sessionTypeId === "swim_speed",
        // Canonical shape (new)
        pool_size_m: pool.length_m,
        pool_unit: pool.unit,
        total_distance_m: totalDistance,
        steps,
        // Legacy shape (kept for back-compat)
        estimated_distance_m: totalDistance,
        phases: legacyPhases,
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
