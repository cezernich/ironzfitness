// js/circuit-workout.js
//
// Circuit workout data model + helpers. The step tree is the canonical
// representation shared with swim workouts (kind: "exercise" | "cardio"
// | "rest" | "repeat"). Repeat blocks cannot nest — enforced at
// creation and rendering time.
//
// Exposes window.CircuitWorkout with:
//   STEP_KINDS         — the four allowed kinds
//   GOALS              — the three goal modes
//   flattenSteps(w)    — expands repeat blocks into an ordered list of
//                        leaf steps with roundIndex annotations
//   countExercises(w)  — number of unique exercise names across the tree
//   estimateMinutes(w) — rough duration estimate based on step counts
//                        (used for library card display)
//   equipmentList(w)   — union of equipment hints across the tree
//   buildStripSegments(w) — array of { flex, kind } for the visual strip
//   formatTime(sec)    — mm:ss formatter
//   parseTimeInput(mm, ss) — returns seconds
//   isPR(benchmarkId, time) — compares against stored PR
//   recordCompletion(workoutId, result) — writes to localStorage.circuitPRs
//   getPR(benchmarkId) — reads best time/score for a benchmark
//
// The renderer + builder modules consume everything via
// window.CircuitWorkout.* so there's no import/export dance.

(function () {
  "use strict";

  const STEP_KINDS = ["exercise", "cardio", "rest", "repeat"];
  const GOALS = ["for_time", "amrap", "standard"];

  // ── Flatten ──────────────────────────────────────────────────────────────
  //
  // Returns a flat array of leaf steps. Repeat blocks are expanded — each
  // child is emitted `count` times with a roundIndex annotation (1-based).
  // AMRAP repeats with count=null are emitted once (can't know in advance).
  function flattenSteps(workout) {
    if (!workout || !Array.isArray(workout.steps)) return [];
    const out = [];
    workout.steps.forEach((step, idx) => {
      if (step.kind === "repeat") {
        const reps = step.count || 1;
        for (let r = 1; r <= reps; r++) {
          (step.children || []).forEach(child => {
            out.push({ ...child, _parentIndex: idx, _roundIndex: r, _repeatCount: reps });
          });
        }
      } else {
        out.push({ ...step, _parentIndex: idx });
      }
    });
    return out;
  }

  // ── Count exercises ──────────────────────────────────────────────────────
  function countExercises(workout) {
    if (!workout) return 0;
    const names = new Set();
    function walk(steps) {
      (steps || []).forEach(s => {
        if (s.kind === "exercise" && s.name) names.add(s.name);
        else if (s.kind === "repeat") walk(s.children);
      });
    }
    walk(workout.steps);
    return names.size;
  }

  // ── Equipment inference ─────────────────────────────────────────────────
  //
  // Scans exercise names for equipment keywords + honors any
  // workout.equipment override the spec explicitly sets.
  const EQUIPMENT_HINTS = [
    { re: /pull-?ups?/i, item: "Pull-up bar" },
    { re: /thruster|deadlift|clean|snatch|press|squat\s*clean/i, item: "Barbell" },
    { re: /kettlebell|kb\s+swing/i, item: "Kettlebell" },
    { re: /dumbbell|\bdb\b/i, item: "Dumbbells" },
    { re: /box jump/i, item: "Box" },
    { re: /wall ball/i, item: "Wall ball" },
    { re: /rope|double.?under/i, item: "Jump rope" },
    { re: /\brow\b/i, item: "Rower" },
    { re: /ghd|back extension/i, item: "GHD" },
    { re: /ball toss|med(icine)? ball/i, item: "Medicine ball" },
    { re: /cable/i, item: "Cable machine" },
  ];
  function equipmentList(workout) {
    if (!workout) return [];
    const set = new Set(workout.equipment || []);
    function walk(steps) {
      (steps || []).forEach(s => {
        if (s.kind === "exercise" && s.name) {
          EQUIPMENT_HINTS.forEach(h => { if (h.re.test(s.name)) set.add(h.item); });
        } else if (s.kind === "cardio" && s.name) {
          if (/row/i.test(s.name)) set.add("Rower");
          if (/bike|cycle/i.test(s.name)) set.add("Bike");
        } else if (s.kind === "repeat") walk(s.children);
      });
    }
    walk(workout.steps);
    return Array.from(set);
  }

  // ── Estimate minutes ────────────────────────────────────────────────────
  //
  // Rough estimator for library cards when the benchmark doesn't have an
  // explicit estimated_min. ~3 seconds per rep for strength, ~4 min per
  // km for cardio, rest taken at face value.
  function estimateMinutes(workout) {
    if (!workout) return 0;
    if (workout.estimated_min) return workout.estimated_min;
    // AMRAP: session cap in minutes wins
    if (workout.goal === "amrap" && workout.goal_value) return workout.goal_value;

    // Per-step walker. Repeat blocks with an EMOM interval contribute
    // count × interval regardless of inner work time; a session-level
    // EMOM goal acts as the default interval for blocks that don't
    // override it. Untimed blocks use the underlying work estimate.
    const sessionInterval = workout.goal === "emom" ? (workout.goal_value || null) : null;
    let sec = 0;
    function walkSteps(steps, multiplier) {
      (steps || []).forEach(s => {
        if (s.kind === "exercise") {
          const reps = s.reps || 10;
          sec += reps * 3 * multiplier;
        } else if (s.kind === "cardio") {
          if (s.duration_sec) sec += s.duration_sec * multiplier;
          else if (s.distance_m) sec += (s.distance_m / 1000) * 4 * 60 * multiplier;
          else sec += 60 * multiplier;
        } else if (s.kind === "rest") {
          sec += (s.duration_sec || 30) * multiplier;
        } else if (s.kind === "repeat") {
          const interval = s.interval_min != null ? s.interval_min : sessionInterval;
          if (interval && Array.isArray(s.children) && s.children.length) {
            sec += (s.count || 1) * interval * 60 * multiplier;
          } else {
            walkSteps(s.children, (s.count || 1) * multiplier);
          }
        }
      });
    }
    walkSteps(workout.steps, 1);
    return Math.max(1, Math.round(sec / 60));
  }

  // ── Build visual strip segments ─────────────────────────────────────────
  //
  // Returns an array of { flex, kind } where kind is "cardio" | "exercise"
  // | "rest". Repeat blocks are expanded so the strip faithfully shows
  // "run → 20 exercise chunks → run" for Murph.
  function buildStripSegments(workout) {
    const segs = [];
    function _flexFor(step) {
      if (step.kind === "cardio") {
        if (step.distance_m) return Math.max(0.3, Math.min(4, step.distance_m / 400));
        if (step.duration_sec) return Math.max(0.3, Math.min(4, step.duration_sec / 180));
        return 1;
      }
      if (step.kind === "exercise") {
        const reps = step.reps || 10;
        return Math.max(0.2, Math.min(2.5, reps / 20));
      }
      if (step.kind === "rest") {
        return Math.max(0.1, Math.min(0.5, (step.duration_sec || 30) / 120));
      }
      return 1;
    }
    function walk(steps) {
      (steps || []).forEach(step => {
        if (step.kind === "repeat") {
          const reps = step.count || 1;
          for (let r = 0; r < reps; r++) {
            (step.children || []).forEach(child => {
              if (child.kind === "repeat") return; // no nesting
              segs.push({ flex: _flexFor(child), kind: child.kind });
            });
          }
        } else {
          segs.push({ flex: _flexFor(step), kind: step.kind });
        }
      });
    }
    walk(workout.steps);
    return segs;
  }

  // ── Time helpers ─────────────────────────────────────────────────────────
  function formatTime(totalSec) {
    const s = Math.max(0, Math.round(Number(totalSec) || 0));
    const m = Math.floor(s / 60);
    const ss = s % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }
    return `${m}:${String(ss).padStart(2, "0")}`;
  }
  function parseTimeInput(mm, ss) {
    const m = parseInt(String(mm || "0"), 10) || 0;
    const s = parseInt(String(ss || "0"), 10) || 0;
    return m * 60 + s;
  }

  // ── PR storage (localStorage.circuitPRs) ────────────────────────────────
  //
  // Shape:
  //   { [benchmarkId or workoutName]: [{ date, time_sec, rounds, reps }, ...] }
  function _readPRs() {
    try { return JSON.parse(localStorage.getItem("circuitPRs") || "{}"); }
    catch { return {}; }
  }
  function _writePRs(prs) {
    try {
      localStorage.setItem("circuitPRs", JSON.stringify(prs));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("circuitPRs");
    } catch {}
  }

  function prKey(workout) {
    return workout.benchmark_id || workout.name || "unknown";
  }

  function getPR(workoutOrKey) {
    const key = (typeof workoutOrKey === "string") ? workoutOrKey : prKey(workoutOrKey);
    const prs = _readPRs();
    const attempts = prs[key] || [];
    if (!attempts.length) return null;
    // For time → min time_sec; for AMRAP → max rounds*1000 + reps
    let best = null;
    attempts.forEach(a => {
      if (a.time_sec != null) {
        if (!best || a.time_sec < best.time_sec) best = a;
      } else if (a.rounds != null) {
        const score = (a.rounds || 0) * 1000 + (a.reps || 0);
        if (!best || score > best._score) best = { ...a, _score: score };
      }
    });
    return best;
  }

  function recordCompletion(workout, result) {
    const key = prKey(workout);
    const prs = _readPRs();
    if (!prs[key]) prs[key] = [];
    prs[key].push({
      date: new Date().toISOString(),
      time_sec: result.time_sec || null,
      rounds: result.rounds || null,
      reps: result.reps || null,
    });
    _writePRs(prs);
  }

  function isPR(workout, result) {
    const current = getPR(workout);
    if (!current) return true;
    if (result.time_sec != null && current.time_sec != null) {
      return result.time_sec < current.time_sec;
    }
    if (result.rounds != null && current.rounds != null) {
      const newScore = result.rounds * 1000 + (result.reps || 0);
      const oldScore = current.rounds * 1000 + (current.reps || 0);
      return newScore > oldScore;
    }
    return false;
  }

  // ── Public API ───────────────────────────────────────────────────────────
  const api = {
    STEP_KINDS,
    GOALS,
    flattenSteps,
    countExercises,
    estimateMinutes,
    equipmentList,
    buildStripSegments,
    formatTime,
    parseTimeInput,
    getPR,
    recordCompletion,
    isPR,
    prKey,
  };
  if (typeof window !== "undefined") window.CircuitWorkout = api;
})();
