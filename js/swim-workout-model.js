// js/swim-workout-model.js
//
// Canonical swim-workout data model + helpers.
//
// A swim workout is:
//   {
//     type: "swim",
//     title: "CSS Intervals",
//     pool_size_m: 25,            // snapshot of user setting at generation
//     pool_unit: "m"|"yd",
//     total_distance_m: 1700,     // derived from walking the step tree
//     steps: [ Step, ... ],       // ordered
//     why_text: "...",            // optional rationale
//     warnings: []                // optional
//   }
//
// A Step is one of:
//   { kind: "interval", name, distance_m, stroke, pace_target, notes? }
//   { kind: "rest",     duration_sec }          // explicit rest between steps
//   { kind: "repeat",   count, children: [Step, ...] }   // repeat N times
//
// Strokes: freestyle | backstroke | breaststroke | butterfly | im | choice
// pace_target is a free-text label like "CSS", "CSS+5", "easy", "max", "drill".

(function () {
  "use strict";

  const STROKES = ["freestyle", "backstroke", "breaststroke", "butterfly", "im", "choice"];
  const STROKE_LABELS = {
    freestyle: "Freestyle",
    backstroke: "Backstroke",
    breaststroke: "Breaststroke",
    butterfly: "Butterfly",
    im: "IM",
    choice: "Choice",
  };
  // Short-form stroke labels for tight cards.
  const STROKE_SHORT = {
    freestyle: "Free",
    backstroke: "Back",
    breaststroke: "Breast",
    butterfly: "Fly",
    im: "IM",
    choice: "Choice",
  };

  const POOL_SIZES = [
    { value: "25m",  label: "25 m",  length_m: 25, unit: "m"  },
    { value: "50m",  label: "50 m",  length_m: 50, unit: "m"  },
    { value: "25yd", label: "25 yd", length_m: 22.86, unit: "yd" },
  ];

  const DEFAULT_POOL_SIZE = "25m";

  // Read the user's pool size preference from profile, fall back to 25 m.
  // Returns { value, length_m, unit, label } so callers can use whichever
  // fields they need.
  function getUserPoolSize() {
    try {
      const raw = localStorage.getItem("profile");
      if (raw) {
        const p = JSON.parse(raw);
        const v = p && (p.pool_size || p.poolSize);
        const match = POOL_SIZES.find(s => s.value === v);
        if (match) return match;
      }
    } catch (e) {}
    return POOL_SIZES[0]; // 25 m default
  }

  // Round a target distance to a whole number of pool lengths, honoring
  // both metric and yard pools. Returns { distance_m, lengths } where
  // distance_m is the snapped distance the workout should actually prescribe.
  //
  // Strategy: find the closest integer number of lengths, but never round to
  // zero — minimum 1 length.
  function snapDistanceToPool(targetM, poolSize) {
    if (!targetM || targetM <= 0) return { distance_m: 0, lengths: 0 };
    const size = poolSize && poolSize.length_m ? poolSize : getUserPoolSize();
    const lengthsRaw = targetM / size.length_m;
    const lengths = Math.max(1, Math.round(lengthsRaw));
    return {
      distance_m: Math.round(lengths * size.length_m),
      lengths,
    };
  }

  // Walk a step tree and sum the total prescribed distance (ignoring rest).
  // Handles nested repeat blocks recursively.
  function totalDistance(steps) {
    if (!Array.isArray(steps)) return 0;
    let total = 0;
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      if (step.kind === "interval") {
        total += Number(step.distance_m) || 0;
      } else if (step.kind === "repeat") {
        const inner = totalDistance(step.children || []);
        total += inner * (Number(step.count) || 0);
      }
      // rest contributes 0 distance
    }
    return total;
  }

  // Total rest seconds across the tree. Used for quick "rest ~N min" labels.
  function totalRestSec(steps) {
    if (!Array.isArray(steps)) return 0;
    let total = 0;
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      if (step.kind === "rest") {
        total += Number(step.duration_sec) || 0;
      } else if (step.kind === "repeat") {
        const inner = totalRestSec(step.children || []);
        total += inner * (Number(step.count) || 0);
      }
    }
    return total;
  }

  // Walk + clone a step tree. Useful for writing to storage without
  // carrying derived / renderer-specific fields.
  function cloneSteps(steps) {
    if (!Array.isArray(steps)) return [];
    return steps.map(step => {
      if (!step) return step;
      if (step.kind === "repeat") {
        return {
          kind: "repeat",
          count: Number(step.count) || 1,
          children: cloneSteps(step.children || []),
        };
      }
      if (step.kind === "rest") {
        return { kind: "rest", duration_sec: Number(step.duration_sec) || 0 };
      }
      // interval
      return {
        kind: "interval",
        name: step.name || "",
        distance_m: Number(step.distance_m) || 0,
        stroke: STROKES.includes(step.stroke) ? step.stroke : "freestyle",
        pace_target: step.pace_target || "",
        notes: step.notes || "",
      };
    });
  }

  // Produce a flat list of prose lines summarizing a tree. Useful as a
  // fallback "instruction" string and for sharing/analytics.
  function prosify(steps) {
    const lines = [];
    function walk(arr, indent) {
      for (const step of arr) {
        if (!step) continue;
        if (step.kind === "interval") {
          const parts = [`${step.distance_m}m`];
          const strokeLabel = STROKE_SHORT[step.stroke] || "Free";
          parts.push(strokeLabel);
          if (step.pace_target) parts.push(`@ ${step.pace_target}`);
          lines.push(indent + (step.name ? `${step.name}: ` : "") + parts.join(" "));
        } else if (step.kind === "rest") {
          lines.push(indent + `Rest ${step.duration_sec}s`);
        } else if (step.kind === "repeat") {
          lines.push(indent + `${step.count}× {`);
          walk(step.children || [], indent + "  ");
          lines.push(indent + "}");
        }
      }
    }
    walk(steps || [], "");
    return lines.join("\n");
  }

  // Validate an AI-supplied or user-supplied workout object and coerce it
  // into the canonical shape. Returns a new object; never throws. Unknown
  // fields are dropped; invalid strokes become "freestyle"; invalid kinds
  // are discarded.
  function normalizeWorkout(raw) {
    const poolSize = (raw && raw.pool_size_m)
      ? POOL_SIZES.find(s => Math.round(s.length_m) === Math.round(raw.pool_size_m)) || getUserPoolSize()
      : getUserPoolSize();
    const steps = normalizeSteps(raw && raw.steps);
    return {
      type: "swim",
      title: (raw && raw.title) || "Swim Workout",
      pool_size_m: poolSize.length_m,
      pool_unit: poolSize.unit,
      total_distance_m: totalDistance(steps),
      steps,
      why_text: (raw && raw.why_text) || "",
      warnings: Array.isArray(raw && raw.warnings) ? raw.warnings.slice() : [],
    };
  }

  function normalizeSteps(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const s of arr) {
      if (!s || typeof s !== "object") continue;
      if (s.kind === "rest") {
        const sec = Math.max(0, Math.round(Number(s.duration_sec) || 0));
        if (sec > 0) out.push({ kind: "rest", duration_sec: sec });
      } else if (s.kind === "repeat") {
        const count = Math.max(1, Math.round(Number(s.count) || 1));
        const children = normalizeSteps(s.children);
        if (children.length) out.push({ kind: "repeat", count, children });
      } else if (s.kind === "interval" || !s.kind) {
        // bare objects without kind default to interval
        const dist = Math.max(0, Math.round(Number(s.distance_m) || 0));
        if (dist <= 0) continue;
        out.push({
          kind: "interval",
          name: String(s.name || "").slice(0, 40),
          distance_m: dist,
          stroke: STROKES.includes(s.stroke) ? s.stroke : "freestyle",
          pace_target: String(s.pace_target || "").slice(0, 40),
          notes: String(s.notes || "").slice(0, 200),
        });
      }
    }
    return out;
  }

  // Factory helpers used by builders + tests.
  function makeInterval(opts) {
    return {
      kind: "interval",
      name: opts.name || "",
      distance_m: Number(opts.distance_m) || 0,
      stroke: STROKES.includes(opts.stroke) ? opts.stroke : "freestyle",
      pace_target: opts.pace_target || "",
      notes: opts.notes || "",
    };
  }
  function makeRest(sec) {
    return { kind: "rest", duration_sec: Math.max(0, Math.round(Number(sec) || 0)) };
  }
  function makeRepeat(count, children) {
    return { kind: "repeat", count: Math.max(1, Math.round(Number(count) || 1)), children: children || [] };
  }

  const api = {
    STROKES,
    STROKE_LABELS,
    STROKE_SHORT,
    POOL_SIZES,
    DEFAULT_POOL_SIZE,
    getUserPoolSize,
    snapDistanceToPool,
    totalDistance,
    totalRestSec,
    cloneSteps,
    prosify,
    normalizeWorkout,
    normalizeSteps,
    makeInterval,
    makeRest,
    makeRepeat,
  };

  if (typeof window !== "undefined") window.SwimWorkout = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
