// js/workout-save-handlers.js
//
// Unified Workout Builder save handlers — see cowork-handoff/UNIFIED_BUILDER_SPEC.md
// and docs/BUILDER_INVENTORY.md.
//
// Phase 1 extracts the two save destinations each migrated builder will
// target:
//
//   saveToCalendar(workout, dateStr)
//     Persists a workout onto the calendar for a single date
//     (localStorage.workouts). This replaces the inline save logic
//     currently duplicated across _saveCircuitToWorkouts,
//     SwimBuilderModal._save, qeSaveGeneratedCardio, saveQuickActivity,
//     qeSaveGeneratedStrength, _qeSaveStrengthWorkout, and Hyrox's
//     internal save.
//
//   saveToPlanDay(workout, planId, dayDate, opts)
//     Persists a workout onto a single day of the in-memory Build-a-Plan
//     week template (cpWeekTemplate[dow]). This replaces customPlanSaveManual's
//     dual branch. `planId` is forward-looking — Build a Plan currently
//     generates the planId only when saveCustomPlan() materializes the
//     template into workoutSchedule entries, so this arg is accepted for
//     signature stability but unused today.
//
// Builders do NOT call localStorage themselves after migration; they produce
// a normalized workout object and hand it to one of these handlers via the
// onSave callback wired by the caller (Add Session → saveToCalendar, Build
// a Plan Manual → saveToPlanDay).
//
// Normalized workout shape produced by migrated builders:
//   {
//     discipline: "strength" | "swim" | "run" | "bike" | "hyrox" | "brick"
//                | "hiit" | "circuit" | "bodyweight" | ...,
//     type:        string,           // legacy sub-type ("weightlifting",
//                                    // "running", "cycling", "swimming",
//                                    // "circuit", "hiit", "bodyweight",
//                                    // "hyrox", "brick", "walking", ...)
//     name:        string,
//     durationMin: number,           // may be 0 when unknown
//     intensity:   "low" | "medium" | "high" | "endurance" | null,
//     exercises:   Array,            // strength / hiit / bodyweight / hyrox
//     structure:   object,           // discipline-specific payload:
//                                    //   circuit  → { goal, goal_value, steps }
//                                    //   swim     → { steps, pool }
//                                    //   cardio   → { intervals }
//                                    //   hyrox    → { stations, runs }
//                                    //   hiit     → { format, rounds, restBetween* }
//     notes:       string,
//     zone:        string | null,    // "Z2" | "Z4" | …
//     targetPace:  string | null,    // "8:23 – 9:13/mi" | …
//   }
//
// Phase 1 intentionally does NOT modify any existing builder. It only
// exposes the handler surface. Phases 2–8 rewire each builder to call it.

(function () {
  "use strict";

  // ── Internals ────────────────────────────────────────────────────────────

  function _genId() {
    if (typeof generateId === "function") return generateId("workout");
    return "w-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function _readArr(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }

  // Collapse the normalized shape back to the row layout the calendar /
  // day detail / history renderers already consume. The destination
  // schema (localStorage.workouts entries) MUST NOT change — see
  // UNIFIED_BUILDER_SPEC.md §Anti-regression rules.
  function _toCalendarRow(workout, dateStr) {
    const type = workout.type || workout.discipline || "general";
    const row = {
      id: _genId(),
      date: dateStr,
      type,
      name: workout.name || "",
      notes: workout.notes || "",
      exercises: Array.isArray(workout.exercises) ? workout.exercises : [],
    };

    if (workout.durationMin) row.duration = workout.durationMin;

    const s = workout.structure || {};

    // Circuit — legacy shape lives under row.circuit
    if (type === "circuit" && (s.steps || s.goal)) {
      row.circuit = {
        name: workout.name || "",
        goal: s.goal || "standard",
        goal_value: s.goal_value || null,
        benchmark_id: s.benchmark_id || null,
        steps: s.steps || [],
      };
      row.source = workout._source || "manual";
    }

    // Swim step tree / interval list → aiSession. Shape must match what
    // SwimCardRenderer expects (pool_size_m / pool_unit flat, not nested).
    if (workout.discipline === "swim" || type === "swimming") {
      if (s.steps || s.intervals) {
        row.aiSession = {
          title: workout.name || "Pool Workout",
          type: "swim",
          ...(s.steps ? { steps: s.steps } : {}),
          ...(s.intervals ? { intervals: s.intervals } : {}),
          ...(s.pool && s.pool.size_m ? { pool_size_m: s.pool.size_m } : {}),
          ...(s.pool && s.pool.unit ? { pool_unit: s.pool.unit } : {}),
          ...(s.total_distance_m ? { total_distance_m: s.total_distance_m } : {}),
        };
      }
    }

    // Generic cardio — intervals live under aiSession
    if (!row.aiSession && s.intervals && s.intervals.length) {
      row.aiSession = {
        title: workout.name || ((type[0] || "").toUpperCase() + type.slice(1) + " Session"),
        intervals: s.intervals,
      };
    }

    // HIIT meta
    if (type === "hiit" && (s.format || s.rounds)) {
      row.hiitMeta = {
        format: s.format || "circuit",
        rounds: s.rounds || 1,
        ...(s.restBetweenExercises ? { restBetweenExercises: s.restBetweenExercises } : {}),
        ...(s.restBetweenRounds ? { restBetweenRounds: s.restBetweenRounds } : {}),
      };
    }

    // Hyrox marker — preserves the current calendar renderer's detection
    if (type === "hyrox") row.isHyrox = true;

    // Zone / targetPace bubble-up for run/bike rendering
    if (workout.zone) row.zone = workout.zone;
    if (workout.targetPace) row.targetPace = workout.targetPace;

    return row;
  }

  // Map a normalized workout to the { id, mode, data } shape
  // cpWeekTemplate expects. Matches the structure customPlanSaveManual
  // currently produces so saveCustomPlan()'s expansion logic keeps working.
  function _toPlanDaySession(workout) {
    const type = workout.type || workout.discipline || "general";
    const s = workout.structure || {};
    const data = {
      type,
      sessionName: workout.name || "Custom Session",
    };
    if (workout.notes) data.details = workout.notes;

    const hasExercises = Array.isArray(workout.exercises) && workout.exercises.length > 0;
    if (hasExercises) data.exercises = workout.exercises;

    // Cardio intervals — the existing CP expansion at saveCustomPlan()
    // looks for data.intervals first, then data.aiSession.intervals.
    if (s.intervals && s.intervals.length) data.intervals = s.intervals;

    // Swim step tree / generic aiSession payload. Mirror the calendar-row
    // shape so plan materialization → calendar rendering works unchanged.
    if (workout.discipline === "swim" || type === "swimming") {
      if (s.steps || s.intervals) {
        data.aiSession = {
          title: workout.name || "Pool Workout",
          type: "swim",
          ...(s.steps ? { steps: s.steps } : {}),
          ...(s.intervals ? { intervals: s.intervals } : {}),
          ...(s.pool && s.pool.size_m ? { pool_size_m: s.pool.size_m } : {}),
          ...(s.pool && s.pool.unit ? { pool_unit: s.pool.unit } : {}),
          ...(s.total_distance_m ? { total_distance_m: s.total_distance_m } : {}),
        };
      }
    }

    // Circuit — preserve goal/steps under a circuit key so the downstream
    // renderer can pick it up when we teach saveCustomPlan() to expand it.
    if (type === "circuit" && (s.steps || s.goal)) {
      data.circuit = {
        goal: s.goal || "standard",
        goal_value: s.goal_value || null,
        benchmark_id: s.benchmark_id || null,
        steps: s.steps || [],
      };
    }

    // HIIT meta — currently dropped by customPlanSaveManual (see
    // BUILDER_INVENTORY.md §5 bug 3). Carry it through; the Phase 4
    // migration will teach saveCustomPlan() to honor it.
    if (type === "hiit" && (s.format || s.rounds)) {
      data.hiitMeta = {
        format: s.format || "circuit",
        rounds: s.rounds || 1,
        ...(s.restBetweenExercises ? { restBetweenExercises: s.restBetweenExercises } : {}),
        ...(s.restBetweenRounds ? { restBetweenRounds: s.restBetweenRounds } : {}),
      };
    }

    if (type === "hyrox") data.isHyrox = true;
    if (workout.zone) data.zone = workout.zone;
    if (workout.targetPace) data.targetPace = workout.targetPace;

    return { mode: "manual", data };
  }

  function _dowFromDate(dayDate) {
    if (typeof dayDate === "number") return dayDate; // already a dow
    if (typeof dayDate === "string") {
      const d = new Date(dayDate + (dayDate.length === 10 ? "T00:00:00" : ""));
      if (!isNaN(d.getTime())) return d.getDay();
    }
    if (dayDate instanceof Date && !isNaN(dayDate.getTime())) return dayDate.getDay();
    return null;
  }

  // ── Public handlers ──────────────────────────────────────────────────────

  function saveToCalendar(workout, dateStr) {
    if (!workout || !dateStr) {
      console.warn("[saveToCalendar] missing workout or date", { workout, dateStr });
      return null;
    }

    // Restriction-remove confirm — preserves the prompt the per-builder
    // saves used to show. If the user dismisses, abort the save.
    let restrictions = {};
    try { restrictions = JSON.parse(localStorage.getItem("dayRestrictions")) || {}; } catch {}
    const existingR = restrictions[dateStr];
    if (existingR && existingR.action === "remove") {
      const proceed = confirm("This day has a restriction that removes all sessions.\n\nRemove the restriction and add this workout?");
      if (!proceed) return null;
      delete restrictions[dateStr];
      localStorage.setItem("dayRestrictions", JSON.stringify(restrictions));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("dayRestrictions");
    }

    const row = _toCalendarRow(workout, dateStr);

    const workouts = _readArr("workouts");
    workouts.unshift(row);
    localStorage.setItem("workouts", JSON.stringify(workouts));
    if (typeof DB !== "undefined" && DB.syncWorkouts) DB.syncWorkouts();

    if (typeof trackWorkoutLogged === "function") {
      trackWorkoutLogged({ type: row.type, date: dateStr, source: "unified_builder" });
    }

    // Re-render surfaces that read from localStorage.workouts
    try { if (typeof renderCalendar === "function") renderCalendar(); } catch {}
    try {
      if (typeof renderDayDetail === "function") {
        const sel = (typeof selectedDate !== "undefined" && selectedDate) || dateStr;
        renderDayDetail(sel);
      }
    } catch {}
    try { if (typeof renderWorkoutHistory === "function") renderWorkoutHistory(); } catch {}

    return row;
  }

  function saveToPlanDay(workout, planId, dayDate, opts) {
    opts = opts || {};
    const dow = _dowFromDate(dayDate);
    if (!workout || dow == null) {
      console.warn("[saveToPlanDay] missing workout or day", { workout, dayDate });
      return null;
    }

    // Build a Plan's session store (cpWeekTemplate) and helpers live in
    // js/custom-plan.js as module-scoped vars. We must call through the
    // helpers — direct mutation from here would miss the id / array-shape
    // migrations baked into _cpEnsureArray. These helpers are accessible
    // as globals because custom-plan.js is loaded as a plain <script>.
    const addFn     = typeof window !== "undefined" ? window._cpAddSession     : null;
    const replaceFn = typeof window !== "undefined" ? window._cpReplaceSession : null;
    const rerender  = typeof window !== "undefined" ? window._cpRerenderDay    : null;

    // custom-plan.js doesn't currently export these to window. Fall back
    // to the top-level function-declaration references which ARE global.
    const _add     = addFn     || (typeof _cpAddSession     === "function" ? _cpAddSession     : null);
    const _replace = replaceFn || (typeof _cpReplaceSession === "function" ? _cpReplaceSession : null);
    const _rerender = rerender || (typeof _cpRerenderDay    === "function" ? _cpRerenderDay    : null);

    if (!_add || !_rerender) {
      console.warn("[saveToPlanDay] custom-plan.js helpers not available");
      return null;
    }

    const session = _toPlanDaySession(workout);
    const now = new Date().toISOString();

    if (typeof opts.editIdx === "number" && _replace) {
      // Caller (in edit mode) passes the existing session's id + createdAt
      // via opts so we don't have to reach into cpWeekTemplate from here.
      // customPlanAddManual(dow, editIdx) already has the existing entry
      // in hand — wiring Phase 2+ will thread these through.
      if (opts.existingId)        session.id = opts.existingId;
      if (opts.existingCreatedAt) session.data.createdAt = opts.existingCreatedAt;
      else                        session.data.createdAt = now;
      session.data.updatedAt = now;
      _replace(dow, opts.editIdx, session);
    } else {
      session.data.createdAt = now;
      session.data.updatedAt = now;
      _add(dow, session);
    }

    _rerender(dow);

    // planId is accepted for forward compatibility; Build a Plan today
    // assigns planId only at saveCustomPlan() time. Stash it on the session
    // data so future migrations can use it without changing the signature.
    if (planId) session.data.planId = planId;

    return session;
  }

  // Expose
  if (typeof window !== "undefined") {
    window.saveToCalendar = saveToCalendar;
    window.saveToPlanDay  = saveToPlanDay;
    window.WorkoutSaveHandlers = { saveToCalendar, saveToPlanDay };
  }
})();
