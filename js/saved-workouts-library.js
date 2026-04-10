// js/saved-workouts-library.js
//
// User's personal collection of workouts. Implements
// FEATURE_SPEC_2026-04-09_workout_sharing.md → SAVED_WORKOUTS_LIBRARY.

(function () {
  "use strict";

  const LOCAL_KEY = "ironz_saved_workouts_v1";
  const MAX_SAVED = 50;

  function _readLocal() {
    if (typeof localStorage === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
  }
  function _writeLocal(list) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey(LOCAL_KEY);
    } catch {}
  }

  function _genId() {
    return "saved-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  /**
   * List saved workouts, optionally filtered.
   * @param {Object} [filter] — { sport, sessionType, source }
   */
  async function listSaved(filter) {
    let list = _readLocal();
    if (filter) {
      if (filter.sport)       list = list.filter(s => s.sport_id === filter.sport);
      if (filter.sessionType) list = list.filter(s => s.session_type_id === filter.sessionType);
      if (filter.source)      list = list.filter(s => s.source === filter.source);
    }
    return list.sort((a, b) => (b.saved_at || "").localeCompare(a.saved_at || ""));
  }

  function _findExisting(list, variantId, source) {
    return list.find(s => s.variant_id === variantId && s.source === source);
  }

  /**
   * Save a variant from the built-in library. Idempotent — saving the same
   * variant twice updates saved_at but does not create a duplicate.
   */
  async function saveFromLibrary(opts) {
    if (!opts || !opts.variantId || !opts.sportId || !opts.sessionTypeId) {
      return { error: "INVALID_INPUT" };
    }
    const list = _readLocal();
    const existing = _findExisting(list, opts.variantId, "library");
    const now = new Date().toISOString();
    if (!existing && list.length >= MAX_SAVED) return { error: "LIMIT_REACHED" };
    if (existing) {
      existing.saved_at = now;
      _writeLocal(list);
      _emit("saved_from_library", { variant_id: opts.variantId, sport_id: opts.sportId, deduped: true });
      return existing;
    }
    const row = {
      id: _genId(),
      variant_id: opts.variantId,
      sport_id: opts.sportId,
      session_type_id: opts.sessionTypeId,
      source: "library",
      saved_at: now,
    };
    list.push(row);
    _writeLocal(list);
    _emit("saved_from_library", { variant_id: opts.variantId, sport_id: opts.sportId });
    return row;
  }

  /**
   * Save a workout that came in via a share. Records the share token and
   * sender id so the saved view can show "Shared by ...".
   */
  async function saveFromShare(opts) {
    if (!opts || !opts.shareToken || !opts.variantId) {
      return { error: "INVALID_INPUT" };
    }
    const list = _readLocal();
    const existing = _findExisting(list, opts.variantId, "shared");
    const now = new Date().toISOString();
    if (!existing && list.length >= MAX_SAVED) return { error: "LIMIT_REACHED" };
    if (existing) {
      existing.saved_at = now;
      existing.share_token = opts.shareToken;
      existing.shared_from_user_id = opts.senderUserId || existing.shared_from_user_id;
      _writeLocal(list);
      _emit("saved_from_share", { share_token: opts.shareToken, deduped: true });
      return existing;
    }
    const row = {
      id: _genId(),
      variant_id: opts.variantId,
      sport_id: opts.sportId,
      session_type_id: opts.sessionTypeId,
      source: "shared",
      shared_from_user_id: opts.senderUserId || null,
      share_token: opts.shareToken,
      saved_at: now,
    };
    list.push(row);
    _writeLocal(list);
    _emit("saved_from_share", { share_token: opts.shareToken });
    return row;
  }

  async function removeSaved(savedId) {
    const list = _readLocal();
    const next = list.filter(s => s.id !== savedId);
    _writeLocal(next);
  }

  async function renameSaved(savedId, customName) {
    const list = _readLocal();
    const e = list.find(s => s.id === savedId);
    if (!e) return null;
    e.custom_name = String(customName || "").slice(0, 80);
    _writeLocal(list);
    return e;
  }

  /**
   * Schedule a saved workout. Goes through the same WorkoutImportValidator as
   * the inbox path — saved is not exempt from conflict checks.
   */
  async function scheduleFromSaved(savedId, targetDate) {
    const list = _readLocal();
    const e = list.find(s => s.id === savedId);
    if (!e) return { error: "NOT_FOUND" };

    const isCustom = e.source === "custom";
    const Validator = window.WorkoutImportValidator;
    // Custom workouts may lack variant_id; skip validator if it would fail
    if (Validator && e.variant_id) {
      const result = Validator.validateImport({
        sharedWorkout: {
          variantId: e.variant_id,
          sportId: e.sport_id,
          sessionTypeId: e.session_type_id,
        },
        targetDate,
      });
      if (!result.canImport) {
        return { error: "CONFLICT", conflicts: result.conflicts, suggestedDate: result.suggestedDate };
      }
    }

    // Insert into workoutSchedule
    let schedule = [];
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
    const entry = {
      id: "saved-" + savedId + "-" + Date.now(),
      date: targetDate,
      type: e.session_type_id || e.workout_kind || "general",
      sessionName: e.custom_name || e.variant_id || "Custom Workout",
      variant_id: e.variant_id || null,
      sport_id: e.sport_id,
      source: "user_added",
      saved_workout_id: e.id,
    };
    if (isCustom && e.payload) entry.payload = e.payload;
    schedule.push(entry);
    try {
      localStorage.setItem("workoutSchedule", JSON.stringify(schedule));
      if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
    } catch {}

    e.last_used_at = new Date().toISOString();
    _writeLocal(list);
    _emit("saved_scheduled", { variant_id: e.variant_id });
    return { ok: true };
  }

  /**
   * Save a fully custom workout (exercises, segments, HIIT meta, etc.).
   * These don't reference a variant — the full workout is stored in `payload`.
   */
  async function saveCustom(opts) {
    if (!opts || !opts.name || !opts.workout_kind) return { error: "INVALID_INPUT" };
    const list = _readLocal();
    if (list.length >= MAX_SAVED) return { error: "LIMIT_REACHED" };
    const now = new Date().toISOString();
    const row = {
      id: _genId(),
      variant_id: null,
      sport_id: opts.sport_id || null,
      session_type_id: null,
      source: "custom",
      saved_at: now,
      custom_name: String(opts.name).slice(0, 80),
      workout_kind: opts.workout_kind,
      payload: {
        exercises: opts.exercises || null,
        segments: opts.segments || null,
        hiitMeta: opts.hiitMeta || null,
        notes: opts.notes || null,
        duration: opts.duration || null,
      },
    };
    list.push(row);
    _writeLocal(list);
    _emit("saved_custom", { name: opts.name, workout_kind: opts.workout_kind });
    return row;
  }

  /**
   * Edit a custom workout's details in place.
   */
  async function editCustom(savedId, updates) {
    const list = _readLocal();
    const e = list.find(s => s.id === savedId);
    if (!e || e.source !== "custom") return null;
    if (updates.name != null) e.custom_name = String(updates.name).slice(0, 80);
    if (updates.workout_kind != null) e.workout_kind = updates.workout_kind;
    if (updates.sport_id !== undefined) e.sport_id = updates.sport_id || null;
    if (!e.payload) e.payload = {};
    if (updates.exercises !== undefined) e.payload.exercises = updates.exercises;
    if (updates.segments !== undefined) e.payload.segments = updates.segments;
    if (updates.hiitMeta !== undefined) e.payload.hiitMeta = updates.hiitMeta;
    if (updates.notes !== undefined) e.payload.notes = updates.notes;
    if (updates.duration !== undefined) e.payload.duration = updates.duration;
    _writeLocal(list);
    return e;
  }

  /**
   * One-time migration: convert old "savedWorkouts" localStorage entries into
   * unified library rows with source="custom". Returns count of migrated items.
   */
  async function migrateOldSavedWorkouts() {
    const OLD_KEY = "savedWorkouts";
    let old;
    try { old = JSON.parse(localStorage.getItem(OLD_KEY) || "[]"); } catch { return 0; }
    if (!old.length) return 0;
    const list = _readLocal();
    const existingIds = new Set(list.filter(s => s._legacyId).map(s => s._legacyId));
    let count = 0;
    for (const sw of old) {
      if (list.length >= MAX_SAVED) break;
      if (existingIds.has(sw.id)) continue;
      const row = {
        id: _genId(),
        _legacyId: sw.id,
        variant_id: null,
        sport_id: _mapTypeToSport(sw.type),
        session_type_id: null,
        source: "custom",
        saved_at: new Date().toISOString(),
        custom_name: String(sw.name || "Untitled").slice(0, 80),
        workout_kind: sw.type || "general",
        payload: {
          exercises: sw.exercises || null,
          segments: sw.segments || null,
          hiitMeta: sw.hiitMeta || null,
          notes: sw.notes || null,
          duration: sw.duration || null,
        },
      };
      list.push(row);
      count++;
    }
    if (count > 0) {
      _writeLocal(list);
      localStorage.removeItem(OLD_KEY);
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey(OLD_KEY);
    }
    return count;
  }

  function _mapTypeToSport(type) {
    const map = {
      running: "run", cycling: "bike", swimming: "swim",
      triathlon: "hybrid", stairstepper: "run",
      weightlifting: "strength", bodyweight: "strength",
      hiit: "strength", general: null, other: null,
    };
    return map[type] || null;
  }

  function _emit(event, payload) {
    if (typeof window !== "undefined" && window.IronZAnalytics && window.IronZAnalytics.track) {
      try { window.IronZAnalytics.track(event, payload); } catch {}
    }
  }

  function _resetForTests() {
    if (typeof localStorage !== "undefined") {
      try { localStorage.removeItem(LOCAL_KEY); } catch {}
    }
  }

  const api = {
    listSaved,
    saveFromLibrary,
    saveFromShare,
    saveCustom,
    editCustom,
    removeSaved,
    renameSaved,
    scheduleFromSaved,
    migrateOldSavedWorkouts,
    MAX_SAVED,
    _resetForTests,
  };

  if (typeof window !== "undefined") window.SavedWorkoutsLibrary = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
