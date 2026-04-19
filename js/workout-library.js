// workout-library.js — Client query layer for the admin-curated workout pool.
// Implements §9 of PLAN_GENERATOR_MASTER_SPEC.md.
//
// Responsibilities:
//   1. Query Supabase workout_library by (sport, session_type, phase, level,
//      race_distance, race_goal) — with a local cache so the generator can
//      run without a round-trip per session.
//   2. Pick a workout from the result pool, deprioritizing recently-used ids.
//   3. Parameterize: replace zone placeholders with athlete paces, scale
//      volume_range based on week-within-phase.

(function (global) {
  "use strict";

  // ── In-memory cache ────────────────────────────────────────────────────────
  // Loaded once per session — the workout library is ~60 rows, small enough
  // to pull in a single query and filter client-side. Refreshed when the
  // admin edits / adds workouts (they can call WorkoutLibrary.refresh()).

  let _cache = null;
  let _loadPromise = null;

  function _getClient() {
    return (global.supabaseClient) || null;
  }

  async function _fetchAll() {
    const client = _getClient();
    if (!client) return [];
    try {
      const { data, error } = await client
        .from("workout_library")
        .select("*")
        .eq("status", "published");
      if (error) {
        console.warn("[WorkoutLibrary] fetch error:", error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn("[WorkoutLibrary] fetch exception:", e && e.message);
      return [];
    }
  }

  function _ensureLoaded() {
    if (_cache) return Promise.resolve(_cache);
    if (_loadPromise) return _loadPromise;
    _loadPromise = _fetchAll().then(rows => {
      _cache = rows;
      _loadPromise = null;
      return _cache;
    });
    return _loadPromise;
  }

  function refresh() {
    _cache = null;
    _loadPromise = null;
    return _ensureLoaded();
  }

  function setCache(rows) {
    _cache = Array.isArray(rows) ? rows.slice() : [];
  }

  function all() {
    return Array.isArray(_cache) ? _cache.slice() : [];
  }

  // ── Query ──────────────────────────────────────────────────────────────────
  // Filters match on arrays: a workout with phases=["base","build"] matches
  // query.phase="base" OR "build" but NOT "peak". Null race_distances /
  // race_goals arrays mean "all" so they always match.

  function _matches(workout, q) {
    if (q.sport && workout.sport !== q.sport) return false;
    if (q.sessionType && workout.session_type !== q.sessionType) return false;
    if (q.phase) {
      const phase = String(q.phase).toLowerCase();
      if (!Array.isArray(workout.phases) || !workout.phases.map(p => String(p).toLowerCase()).includes(phase)) return false;
    }
    if (q.level) {
      const lvl = String(q.level).toLowerCase();
      if (!Array.isArray(workout.levels) || !workout.levels.map(l => String(l).toLowerCase()).includes(lvl)) return false;
    }
    if (q.raceDistance && workout.race_distances && workout.race_distances.length) {
      const rd = String(q.raceDistance).toLowerCase();
      if (!workout.race_distances.map(x => String(x).toLowerCase()).includes(rd)) return false;
    }
    if (q.raceGoal && workout.race_goals && workout.race_goals.length) {
      const rg = String(q.raceGoal).toLowerCase();
      if (!workout.race_goals.map(x => String(x).toLowerCase()).includes(rg)) return false;
    }
    return true;
  }

  // Returns the filtered pool. Does NOT pick — use pick() for selection.
  async function query(q) {
    const rows = await _ensureLoaded();
    const pool = rows.filter(w => _matches(w, q || {}));
    return pool;
  }

  // Synchronous version that assumes the cache is already loaded. Useful for
  // the plan generator which prefetches once at start of a run.
  function querySync(q) {
    const rows = _cache || [];
    return rows.filter(w => _matches(w, q || {}));
  }

  // ── Selection with recency bias ────────────────────────────────────────────
  // §9d step 3: if a workout was used in the last 4 weeks, deprioritize it
  // (don't exclude entirely). `recentlyUsedIds` is a Set or array of workout
  // ids. Fresh workouts are always preferred; if the whole pool is stale we
  // pick the LEAST recently used one.

  function pick(pool, recentlyUsedIds) {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const recentSet = recentlyUsedIds instanceof Set
      ? recentlyUsedIds
      : new Set((recentlyUsedIds || []).map(x => x && x.id ? x.id : x));

    const fresh = pool.filter(w => !recentSet.has(w.id));
    if (fresh.length > 0) {
      return fresh[Math.floor(Math.random() * fresh.length)];
    }
    // Everything's been used recently → pick anything (least-recent handling
    // is optional; random across the pool is fine for small pools).
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Deterministic variant — useful for tests + reproducible plan generation.
  function pickDeterministic(pool, recentlyUsedIds, seed) {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const recentSet = recentlyUsedIds instanceof Set
      ? recentlyUsedIds
      : new Set((recentlyUsedIds || []).map(x => x && x.id ? x.id : x));
    const fresh = pool.filter(w => !recentSet.has(w.id));
    const list = fresh.length > 0 ? fresh : pool;
    const idx = Math.abs((seed | 0)) % list.length;
    return list[idx];
  }

  // ── Volume scaling (§8c) ───────────────────────────────────────────────────
  // Given a phase position, return a 0..1 interpolation factor for
  // volume_range. Week 1 → 0 (min), last week → 1 (max), deload → 0.65.
  //
  // Inputs:
  //   weekInPhase: 1-indexed week number within the phase
  //   totalWeeksInPhase: total weeks in that phase
  //   isDeload: boolean, true if this week is the phase's deload week
  function volumeFactor(weekInPhase, totalWeeksInPhase, isDeload) {
    if (isDeload) return 0.65;
    const total = Math.max(1, Number(totalWeeksInPhase) || 1);
    if (total === 1) return 0.5; // single-week phase → use midpoint
    const w = Math.max(1, Math.min(total, Number(weekInPhase) || 1));
    return (w - 1) / (total - 1);
  }

  // Scales a [min, max] range to a single value using a 0..1 factor.
  function _scaleRange(range, factor) {
    if (!Array.isArray(range) || range.length !== 2) return range;
    const [lo, hi] = range.map(Number);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return range;
    return Math.round(lo + (hi - lo) * factor);
  }

  // Walks a main_set structure and substitutes concrete values:
  //   - intervals.reps: [lo, hi] → single scaled number
  //   - effort.duration_min: [lo, hi] → single scaled number
  //   - zone: "Z3" → resolved pace/power label for this sport
  function _applyToMainSet(mainSet, sport, zones, factor) {
    if (!mainSet || typeof mainSet !== "object") return mainSet;
    const out = JSON.parse(JSON.stringify(mainSet));
    const resolve = (zoneStr) => {
      if (!zoneStr) return zoneStr;
      if (global.TrainingZones && typeof global.TrainingZones.resolveZone === "function") {
        return global.TrainingZones.resolveZone(zones, sport, zoneStr);
      }
      return zoneStr;
    };

    // Pattern 1 — repeating intervals
    if (out.intervals) {
      if (Array.isArray(out.intervals.reps)) {
        out.intervals.reps_actual = _scaleRange(out.intervals.reps, factor);
      }
      if (out.intervals.zone) {
        out.intervals.zone_pace = resolve(out.intervals.zone);
      }
    }

    // Pattern 2 — continuous effort
    if (out.effort) {
      if (Array.isArray(out.effort.duration_min)) {
        out.effort.duration_min_actual = _scaleRange(out.effort.duration_min, factor);
      }
      if (out.effort.zone) {
        out.effort.zone_pace = resolve(out.effort.zone);
      }
    }

    // Pattern 3 — ladder
    if (Array.isArray(out.steps)) {
      out.steps = out.steps.map(s => s && s.zone ? { ...s, zone_pace: resolve(s.zone) } : s);
    }
    if (Array.isArray(out.reps_range)) {
      out.reps_actual = _scaleRange(out.reps_range, factor);
    }

    // Pattern 4 — mixed blocks
    if (Array.isArray(out.blocks)) {
      out.blocks = out.blocks.map(b => {
        const nb = { ...b };
        if (Array.isArray(b.reps)) nb.reps_actual = _scaleRange(b.reps, factor);
        if (Array.isArray(b.duration_min)) nb.duration_min_actual = _scaleRange(b.duration_min, factor);
        if (b.zone) nb.zone_pace = resolve(b.zone);
        return nb;
      });
    }

    // Pattern 5 — strength exercises (no zones; scale set ranges)
    if (Array.isArray(out.exercises)) {
      out.exercises = out.exercises.map(ex => {
        const ne = { ...ex };
        if (Array.isArray(ex.sets)) ne.sets_actual = _scaleRange(ex.sets, factor);
        return ne;
      });
    }

    return out;
  }

  // Parameterize a workout — fold athlete zones, week position, and volume
  // scaling into the raw library row. Returns a new object; original is
  // untouched.
  //
  // Args:
  //   workout: row from workout_library
  //   ctx: { zones, sport, phase, weekInPhase, totalWeeksInPhase, isDeload, level }
  function parameterize(workout, ctx) {
    if (!workout) return null;
    const ctxSafe = ctx || {};
    const factor = volumeFactor(ctxSafe.weekInPhase, ctxSafe.totalWeeksInPhase, ctxSafe.isDeload);
    const sport = ctxSafe.sport || workout.sport;
    const zones = ctxSafe.zones || {};

    const mainSetRendered = _applyToMainSet(workout.main_set, sport, zones, factor);

    let durationActual = null;
    if (Array.isArray(workout.total_duration_range) && workout.total_duration_range.length === 2) {
      durationActual = _scaleRange(workout.total_duration_range, factor);
    }

    return {
      workoutId:   workout.id,
      libraryName: workout.name,
      description: workout.description,
      sport:       workout.sport,
      sessionType: workout.session_type,
      energySystem: workout.energy_system,
      phase:       ctxSafe.phase,
      warmup:      workout.warmup,
      main_set:    mainSetRendered,
      cooldown:    workout.cooldown,
      duration_min: durationActual,
      volume_factor: factor,
      parameterized_at: new Date().toISOString(),
    };
  }

  const WorkoutLibrary = {
    query,
    querySync,
    pick,
    pickDeterministic,
    parameterize,
    volumeFactor,
    refresh,
    setCache,
    all,
    _ensureLoaded,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = WorkoutLibrary;
  }
  global.WorkoutLibrary = WorkoutLibrary;
})(typeof window !== "undefined" ? window : globalThis);
