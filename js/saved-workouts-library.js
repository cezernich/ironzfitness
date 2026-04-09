// js/saved-workouts-library.js
//
// User's personal collection of workouts. Implements
// FEATURE_SPEC_2026-04-09_workout_sharing.md → SAVED_WORKOUTS_LIBRARY.

(function () {
  "use strict";

  const LOCAL_KEY = "ironz_saved_workouts_v1";

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

    const Validator = window.WorkoutImportValidator;
    if (!Validator) return { error: "VALIDATOR_MISSING" };
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

    // Insert into workoutSchedule
    let schedule = [];
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
    schedule.push({
      id: "saved-" + savedId + "-" + Date.now(),
      date: targetDate,
      type: e.session_type_id,
      sessionName: e.custom_name || e.variant_id,
      variant_id: e.variant_id,
      sport_id: e.sport_id,
      source: "user_added",
      saved_workout_id: e.id,
    });
    try {
      localStorage.setItem("workoutSchedule", JSON.stringify(schedule));
      if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
    } catch {}

    e.last_used_at = new Date().toISOString();
    _writeLocal(list);
    _emit("saved_scheduled", { variant_id: e.variant_id });
    return { ok: true };
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
    removeSaved,
    renameSaved,
    scheduleFromSaved,
    _resetForTests,
  };

  if (typeof window !== "undefined") window.SavedWorkoutsLibrary = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
