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
   * List saved workouts, optionally filtered. Also backfills payloads for
   * library-source entries that were saved before the variant-snapshot fix
   * landed — so old saves start showing exercise/segment details on the
   * next render.
   */
  async function listSaved(filter) {
    let list = _readLocal();
    let backfilled = false;
    for (const s of list) {
      if (s.source === "library" && s.variant_id && (!s.payload || !s.payload.exercises)) {
        const bf = _buildVariantSnapshot(s.variant_id, s.sport_id, s.session_type_id);
        if (bf) {
          s.payload = bf.payload;
          if (!s.custom_name && bf.name) s.custom_name = bf.name;
          backfilled = true;
        }
      }
    }
    if (backfilled) _writeLocal(list);
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
   *
   * Snapshots the full variant definition into `payload` so the saved card
   * can render exercises/segments without a Supabase round-trip and the
   * schedule path has everything it needs to build aiSession.intervals.
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
      // Backfill payload on re-save if it's missing (for entries saved
      // before this fix shipped).
      if (!existing.payload || !existing.payload.exercises) {
        const bf = _buildVariantSnapshot(opts.variantId, opts.sportId, opts.sessionTypeId);
        if (bf) {
          existing.payload = bf.payload;
          if (!existing.custom_name && bf.name) existing.custom_name = bf.name;
        }
      }
      _writeLocal(list);
      _emit("saved_from_library", { variant_id: opts.variantId, sport_id: opts.sportId, deduped: true });
      return existing;
    }
    const snapshot = _buildVariantSnapshot(opts.variantId, opts.sportId, opts.sessionTypeId);
    const row = {
      id: _genId(),
      variant_id: opts.variantId,
      sport_id: opts.sportId,
      session_type_id: opts.sessionTypeId,
      source: "library",
      saved_at: now,
      custom_name: snapshot ? snapshot.name : null,
      payload: snapshot ? snapshot.payload : null,
    };
    list.push(row);
    _writeLocal(list);
    _emit("saved_from_library", { variant_id: opts.variantId, sport_id: opts.sportId });
    return row;
  }

  /**
   * Look up a variant in VariantLibraries and return { name, payload } or
   * null if the variant can't be found. The payload contains:
   *   - variant: deep copy of the full variant definition
   *   - description: human-readable summary string
   *   - notes: develops/best_for combined
   *   - exercises: array of segments (cardio) or single exercise entries
   *     (strength), shaped so _slLoadDetail + scheduleFromSaved can consume
   *     them directly.
   */
  function _buildVariantSnapshot(variantId, sportId, sessionTypeId) {
    try {
      const VL = (typeof window !== "undefined" && window.VariantLibraries) || null;
      if (!VL || typeof VL.getLibraryFor !== "function") return null;
      const variants = VL.getLibraryFor(sportId, sessionTypeId);
      if (!Array.isArray(variants)) return null;
      const variant = variants.find(v => v.id === variantId);
      if (!variant) return null;

      const name = variant.name || variantId;
      const isStrength = sportId === "strength" || sportId === "weightlifting";
      const notes = [variant.develops, variant.best_for].filter(Boolean).join(" · ") || null;

      let exercises;
      if (isStrength) {
        exercises = _strengthVariantToExercises(variant);
      } else {
        exercises = _cardioVariantToSegments(variant);
      }

      return {
        name,
        payload: {
          variant: JSON.parse(JSON.stringify(variant)),
          description: variant.description || "",
          notes,
          exercises,
        },
      };
    } catch (e) {
      console.warn("[IronZ] _buildVariantSnapshot failed", e);
      return null;
    }
  }

  function _strengthVariantToExercises(variant) {
    // Strength variants are single-exercise accessories: one row with
    // the exercise name and its sets/reps text.
    const row = {
      name: variant.name || variant.id,
      sets_reps: variant.sets_reps || "",
      reps: variant.sets_reps || "",
    };
    // Try to split "3 x 12" → sets/reps
    const m = String(variant.sets_reps || "").match(/^(\d+)\s*[x×]\s*(.+)$/i);
    if (m) {
      row.sets = m[1];
      row.reps = m[2].trim();
    }
    if (variant.primary_muscle) row.details = `Targets: ${variant.primary_muscle}`;
    if (variant.equipment) {
      row.details = (row.details ? row.details + " · " : "") + `Equipment: ${variant.equipment}`;
    }
    return [row];
  }

  function _cardioVariantToSegments(variant) {
    // Build a 3-segment warmup / main set / cooldown structure. The segments
    // share the shape that _slLoadDetail and scheduleFromSaved already know
    // how to render — name/duration/intensity/details.
    const segments = [];
    segments.push({
      name: "Warm Up",
      duration: "10 min",
      intensity: "Z1",
      details: "Easy effort + dynamic mobility",
    });

    const ms = variant.main_set || {};
    let mainDuration = "";
    let mainDetails = variant.description || variant.name || "Main set";

    if (ms.rep_distance_m && ms.rep_count != null) {
      const count = _pickRepCount(ms.rep_count);
      mainDuration = `${count} × ${ms.rep_distance_m}m`;
      if (ms.rest_type === "jog_distance" && ms.rest_m) {
        mainDetails += ` · Rest: ${ms.rest_m}m jog`;
      } else if (ms.rest_type === "jog_time" && ms.rest_sec) {
        mainDetails += ` · Rest: ${Math.round(ms.rest_sec / 60)} min jog`;
      } else if (ms.rest_type === "equal_time_jog") {
        mainDetails += " · Rest: equal-time jog";
      }
    } else if (ms.rep_duration_sec && ms.rep_count != null) {
      const count = _pickRepCount(ms.rep_count);
      const minutes = Math.round(ms.rep_duration_sec / 60);
      mainDuration = `${count} × ${minutes} min`;
      if (ms.rest_sec) mainDetails += ` · ${Math.round(ms.rest_sec / 60)} min jog rest`;
    } else if (ms.type === "continuous" && ms.duration_sec) {
      mainDuration = `${Math.round(ms.duration_sec / 60)} min continuous`;
    } else if (ms.type === "ladder" && Array.isArray(ms.rungs_m)) {
      mainDuration = ms.rungs_m.map(m => `${m}m`).join(" / ");
      mainDetails = "Ladder pyramid · " + mainDetails;
    } else if (ms.type === "alternation" && Array.isArray(ms.pattern)) {
      const count = _pickRepCount(ms.cycles);
      const parts = ms.pattern.map(p => `${p.distance_m || p.duration_sec}${p.distance_m ? "m" : "s"}`).join("/");
      mainDuration = `${count} × ${parts}`;
    } else if (ms.type === "alternation_block" && Array.isArray(ms.blocks)) {
      const count = _pickRepCount(ms.reps);
      const totalSec = ms.blocks.reduce((t, b) => t + (b.duration_sec || 0), 0);
      mainDuration = `${count} × ${Math.round(totalSec / 60)} min blocks`;
    } else if (ms.interval_count && ms.interval_sec) {
      mainDuration = `${ms.interval_count} × ${Math.round(ms.interval_sec / 60)} min`;
    }

    segments.push({
      name: "Main Set",
      duration: mainDuration || "Main effort",
      intensity: "Z4",
      details: mainDetails,
    });

    segments.push({
      name: "Cool Down",
      duration: "10 min",
      intensity: "Z1",
      details: "Easy jog",
    });

    return segments;
  }

  function _pickRepCount(spec) {
    if (typeof spec === "number") return spec;
    if (spec && typeof spec === "object") {
      return spec.intermediate || spec.beginner || spec.advanced || "—";
    }
    return "—";
  }

  /**
   * Save a workout that came in via a share. Records the share token and
   * sender id so the saved view can show "Shared by ...".
   */
  async function saveFromShare(opts) {
    if (!opts || !opts.shareToken || !opts.variantId) {
      return { error: "INVALID_INPUT" };
    }
    // Resolve a display name: caller-provided name > lookup from training_sessions > friendly label > raw ID
    let displayName = opts.name || opts.sessionName || null;
    if (!displayName && opts.variantId && typeof window !== "undefined" && window.supabaseClient) {
      try {
        const { data: ts } = await window.supabaseClient
          .from("training_sessions")
          .select("session_name")
          .eq("id", opts.variantId)
          .maybeSingle();
        if (ts && ts.session_name) displayName = ts.session_name;
      } catch {}
    }
    if (!displayName) {
      const _labels = {
        track_workout: "Track Workout", tempo_threshold: "Tempo Run",
        speed_work: "Speed Work", hills: "Hill Repeats", long_run: "Long Run",
        endurance: "Endurance Run", easy_recovery: "Easy Recovery",
        running: "Running Session", cycling: "Cycling Session",
        swimming: "Swim Session", threshold: "Threshold Test",
      };
      displayName = _labels[opts.sessionTypeId] || (opts.sessionTypeId || "Shared Workout").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    }

    const list = _readLocal();
    const existing = _findExisting(list, opts.variantId, "shared");
    const now = new Date().toISOString();
    if (!existing && list.length >= MAX_SAVED) return { error: "LIMIT_REACHED" };
    if (existing) {
      existing.saved_at = now;
      existing.share_token = opts.shareToken;
      existing.shared_from_user_id = opts.senderUserId || existing.shared_from_user_id;
      if (displayName) existing.custom_name = displayName;
      _writeLocal(list);
      _emit("saved_from_share", { share_token: opts.shareToken, deduped: true });
      return existing;
    }
    const row = {
      id: _genId(),
      variant_id: opts.variantId,
      sport_id: opts.sportId,
      session_type_id: opts.sessionTypeId,
      custom_name: displayName,
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
    console.log("[IronZ] scheduleFromSaved called:", savedId, targetDate);
    const list = _readLocal();
    const e = list.find(s => s.id === savedId);
    if (!e) { console.warn("[IronZ] saved entry not found:", savedId); return { error: "NOT_FOUND" }; }

    const Validator = window.WorkoutImportValidator;
    if (Validator) {
      const result = Validator.validateImport({
        sharedWorkout: {
          variantId: e.variant_id,
          sportId: e.sport_id,
          sessionTypeId: e.session_type_id,
          source: e.source,
          sessionName: e.custom_name,
        },
        source: e.source,
        targetDate,
      });
      if (!result.canImport) {
        return { error: "CONFLICT", conflicts: result.conflicts, suggestedDate: result.suggestedDate };
      }
    }

    // Fetch exercise data to attach as aiSession.intervals so the calendar
    // renders the full colored bar + step list (same as built-in workouts).
    let intervals = [];

    // Source 1: training_sessions via Supabase — only for shared workouts,
    // whose variant_id is a real row UUID. Library variants use local IDs
    // like "track_yasso_800s" and will never hit training_sessions; skip
    // the round-trip so the offline payload path runs immediately.
    if (e.variant_id && e.source === "shared" && typeof window !== "undefined" && window.supabaseClient) {
      try {
        const { data: ts } = await window.supabaseClient
          .from("training_sessions")
          .select("session_name, exercises")
          .eq("id", e.variant_id)
          .maybeSingle();
        if (ts && ts.exercises) {
          let exArr = ts.exercises;
          if (typeof exArr === "string") { try { exArr = JSON.parse(exArr); } catch { exArr = []; } }
          intervals = exArr.map(ex => ({
            name: ex.name || "Interval",
            duration: ex.duration || "",
            effort: ex.intensity || ex.effort || "Z2",
            details: ex.details || "",
            reps: ex.reps || null,
            repeatGroup: ex.repeatGroup || ex.supersetGroup || null,
            groupSets: ex.groupSets || null,
          }));
        }
      } catch (err) { console.warn("[IronZ] training_sessions lookup failed:", err); }
    }

    // Source 2: local payload (custom workouts)
    if (!intervals.length && e.payload) {
      const p = e.payload;
      const src = p.segments || p.exercises || p.intervals || [];
      intervals = src.map(s => ({
        name: s.name || s.type || "Step",
        duration: s.duration || "",
        effort: s.effort || s.intensity || s.zone || "Z2",
        details: s.details || "",
        reps: s.reps || null,
        repeatGroup: s.repeatGroup || s.supersetGroup || null,
        groupSets: s.groupSets || null,
      }));
    }

    // Insert into workoutSchedule
    console.log("[IronZ] validation passed, inserting into workoutSchedule for", targetDate, "with", intervals.length, "intervals");
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
    // Attach exercise data as aiSession so the calendar renders the full
    // colored intensity strip + step list — same as built-in plan workouts.
    if (intervals.length) {
      entry.aiSession = {
        title: entry.sessionName,
        intervals,
      };
    }
    if (e.source === "custom" && e.payload) entry.payload = e.payload;
    schedule.push(entry);
    try {
      localStorage.setItem("workoutSchedule", JSON.stringify(schedule));
      if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
    } catch {}

    console.log("[IronZ] workoutSchedule entry added:", entry);
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
