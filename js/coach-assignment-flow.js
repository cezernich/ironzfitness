// coach-assignment-flow.js — Phase 3A.2: Assign Workout UI
//
// Coach Portal client detail Calendar tab → "+ Assign Workout" button →
// modal with workout fields → save → conflict modal if date has content
// → INSERT into coach_assigned_workouts → trigger (Phase 3A.1) mirrors
// to client's user_data.workoutSchedule.
//
// Phase 3A.2 ships build-from-scratch only. 3B layers in
// "edit existing AI workout" by pre-filling this same form from the
// existing schedule entry. 3C bulk-assigns from the coach library
// using the same submit path.
//
// Spec: new features/COACHING_FEATURE_SPEC_2026-04-28.md
// Mirror trigger: supabase/migrations/20260429_coach_assignment_mirror.sql

(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────────────────
  let _clientId = null;
  let _clientName = "";
  let _exRowCount = 0;
  let _editingAssignmentId = null;  // 3B: present when editing an existing
                                     // coach assignment instead of inserting.
  let _libraryMode = false;          // 3C: when true, submit writes to
                                     // coach_workout_library instead of
                                     // coach_assigned_workouts.
  let _libraryEditId = null;         // 3C edit existing library item.
  // Buffer used by the conflict modal so the user's filled form doesn't
  // get re-fetched after they pick replace/stack/freeze.
  let _pendingPayload = null;

  function _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  // ── Open / close ───────────────────────────────────────────────────────
  // prefill: { date?, sessionName?, type?, exercises?, duration?, coachNote?,
  //            assignmentId? } — used by 3B edit flow + 3C library pick.
  function openAssignWorkoutModal(clientId, clientName, prefill) {
    _clientId  = clientId;
    _clientName = clientName || "";
    _editingAssignmentId = (prefill && prefill.assignmentId) || null;

    const overlay = document.getElementById("coach-assign-overlay");
    if (!overlay) return;

    _resetForm();
    _populatePrefill(prefill);
    overlay.classList.add("is-open");

    if (typeof trackEvent === "function") {
      try { trackEvent("coach_assign_opened", { editing: !!_editingAssignmentId }); } catch {}
    }
  }

  function closeAssignWorkoutModal() {
    const overlay = document.getElementById("coach-assign-overlay");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    _closeConflictModal();
    _editingAssignmentId = null;
    _libraryMode = false;
    _libraryEditId = null;
    _pendingPayload = null;
  }

  // Phase 3C entry point: re-uses the assignment modal in "save to
  // library" mode. Hides the date picker (library items aren't
  // date-bound), changes the save button to "Save to Library", and
  // writes to coach_workout_library on submit.
  function openAssignWorkoutModalForLibrary(prefill) {
    _clientId = null;
    _clientName = "";
    _libraryMode = true;
    _libraryEditId = (prefill && prefill.libraryId) || null;
    _editingAssignmentId = null;

    const overlay = document.getElementById("coach-assign-overlay");
    if (!overlay) return;

    _resetForm();
    _populatePrefill(prefill || {});

    // Hide date + duration fields (irrelevant for library entries).
    const dateRow = document.getElementById("coach-assign-date")?.closest(".form-row");
    if (dateRow) dateRow.style.display = "none";
    const subtitle = document.getElementById("coach-assign-subtitle");
    if (subtitle) subtitle.textContent = "Save to your library — assign later from the Library tab.";

    const submitBtn = document.getElementById("coach-assign-save-btn");
    if (submitBtn) submitBtn.textContent = _libraryEditId ? "Update Library" : "Save to Library";

    // Coach note field is still visible — used as the library notes
    // field. Re-label it.
    const noteLabel = document.querySelector('label[for="coach-assign-note"]');
    if (noteLabel) noteLabel.firstChild.textContent = "Library notes ";

    overlay.classList.add("is-open");
  }

  function _resetForm() {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal("coach-assign-name", "");
    setVal("coach-assign-type", "weightlifting");
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today.getTime() + 24*60*60*1000);
    setVal("coach-assign-date", tomorrow.toISOString().slice(0, 10));
    setVal("coach-assign-duration", "");
    setVal("coach-assign-note", "");
    setVal("coach-assign-error", "");
    const errEl = document.getElementById("coach-assign-error");
    if (errEl) errEl.textContent = "";

    // Reset exercise rows. Always start with one empty row so the form
    // doesn't look broken on first open.
    _exRowCount = 0;
    const rows = document.getElementById("coach-assign-ex-rows");
    if (rows) rows.innerHTML = "";
    _addExRow();

    const subtitle = document.getElementById("coach-assign-subtitle");
    if (subtitle) {
      subtitle.textContent = _clientName ? `Client: ${_clientName}` : "";
    }
    const submitBtn = document.getElementById("coach-assign-save-btn");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = _editingAssignmentId ? "Update Workout" : "Assign Workout";
    }
  }

  function _populatePrefill(prefill) {
    if (!prefill) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    if (prefill.date)        setVal("coach-assign-date", prefill.date);
    if (prefill.sessionName) setVal("coach-assign-name", prefill.sessionName);
    if (prefill.type)        setVal("coach-assign-type", prefill.type);
    if (prefill.duration)    setVal("coach-assign-duration", prefill.duration);
    if (prefill.coachNote)   setVal("coach-assign-note", prefill.coachNote);

    if (Array.isArray(prefill.exercises) && prefill.exercises.length) {
      const rows = document.getElementById("coach-assign-ex-rows");
      if (rows) rows.innerHTML = "";
      _exRowCount = 0;
      for (const ex of prefill.exercises) _addExRow(ex);
    }
  }

  // ── Exercise rows ──────────────────────────────────────────────────────
  function _addExRow(prefill) {
    _exRowCount++;
    const id = _exRowCount;
    const rows = document.getElementById("coach-assign-ex-rows");
    if (!rows) return;
    const row = document.createElement("div");
    row.className = "coach-assign-ex-row";
    row.id = `coach-assign-row-${id}`;
    row.innerHTML = `
      <input type="text" class="input coach-assign-ex-name" id="coach-assign-ex-name-${id}"
        placeholder="Exercise (e.g. Bench Press)" value="${_esc(prefill?.name || "")}" />
      <input type="number" class="input coach-assign-ex-sets" id="coach-assign-ex-sets-${id}"
        placeholder="Sets" min="1" max="20" value="${_esc(prefill?.sets || "")}" />
      <input type="text" class="input coach-assign-ex-reps" id="coach-assign-ex-reps-${id}"
        placeholder="Reps" value="${_esc(prefill?.reps || "")}" />
      <input type="text" class="input coach-assign-ex-weight" id="coach-assign-ex-weight-${id}"
        placeholder="Weight" value="${_esc(prefill?.weight || "")}" />
      <button class="admin-action-btn" aria-label="Remove exercise" title="Remove"
        onclick="coachAssignRemoveExRow(${id})">×</button>`;
    rows.appendChild(row);
  }

  function coachAssignRemoveExRow(id) {
    const row = document.getElementById(`coach-assign-row-${id}`);
    if (row) row.remove();
    // If the user nuked every row, give them an empty one back so the
    // form isn't an empty container.
    const rows = document.getElementById("coach-assign-ex-rows");
    if (rows && !rows.querySelector(".coach-assign-ex-row")) _addExRow();
  }

  function coachAssignAddExRow() { _addExRow(); }

  // ── Submit + conflict resolution ───────────────────────────────────────
  async function submitAssignWorkout() {
    const errEl = document.getElementById("coach-assign-error");
    const setErr = (m) => { if (errEl) errEl.textContent = m || ""; };
    setErr("");

    const sessionName = document.getElementById("coach-assign-name")?.value.trim();
    const type        = document.getElementById("coach-assign-type")?.value;
    const date        = document.getElementById("coach-assign-date")?.value;
    const durationRaw = document.getElementById("coach-assign-duration")?.value.trim();
    const coachNote   = document.getElementById("coach-assign-note")?.value.trim();

    if (!sessionName) return setErr("Give the workout a name (e.g. \"Push Day\").");
    if (!type)        return setErr("Pick a workout type.");
    if (!date)        return setErr("Pick a date.");

    // Collect exercise rows. Empty-name rows are skipped (the +Add Row
    // button can leave blanks in the buffer).
    const exercises = [];
    const rowEls = document.querySelectorAll("#coach-assign-ex-rows .coach-assign-ex-row");
    rowEls.forEach(r => {
      const id = r.id.replace("coach-assign-row-", "");
      const name = document.getElementById(`coach-assign-ex-name-${id}`)?.value.trim();
      if (!name) return;
      const sets   = document.getElementById(`coach-assign-ex-sets-${id}`)?.value.trim();
      const reps   = document.getElementById(`coach-assign-ex-reps-${id}`)?.value.trim();
      const weight = document.getElementById(`coach-assign-ex-weight-${id}`)?.value.trim();
      exercises.push({ name, sets: sets || "3", reps: reps || "", weight: weight || "" });
    });

    if (!exercises.length && type === "weightlifting") {
      return setErr("Add at least one exercise (or change the type to a cardio workout).");
    }

    // Phase 3C: save-to-library path bypasses date / conflict /
    // assignments tables entirely.
    if (_libraryMode) {
      return _saveLibraryItem({ sessionName, type, exercises, durationRaw, coachNote });
    }

    const duration = durationRaw ? parseInt(durationRaw, 10) || null : null;

    // Workout JSONB shape mirrors a normal workoutSchedule entry. Any
    // fields the existing renderer reads MUST be at this top level
    // (sessionName, type, exercises, duration) — the trigger merges
    // mirror-only fields (id, source, coachId, etc.) on top.
    const workoutJson = {
      sessionName,
      type,
      exercises: exercises.length ? exercises : undefined,
      ...(duration ? { duration } : {}),
      level: "intermediate",
      source: "coach_assigned",   // hint for any code that walks the
                                  // JSONB before the trigger merges its
                                  // own copy of the same field.
    };

    _pendingPayload = {
      client_id: _clientId,
      date,
      coach_note: coachNote || null,
      workout: workoutJson,
    };

    // Edit flow (Phase 3B): we already have an assignment row; UPDATE
    // it instead of asking about conflict mode (the existing row's
    // mode stands).
    if (_editingAssignmentId) {
      return _doWriteAssignment("update");
    }

    // Brand-new assignment: check for date conflicts. Reads the client's
    // workoutSchedule via the user_data RLS policy (allowed for
    // assigned coaches). If anything's there, ask the coach how to
    // resolve.
    const conflict = await _hasDateConflict(_clientId, date);
    if (conflict.found) {
      _openConflictModal(conflict.summary);
    } else {
      // No conflict — replace mode is the safe default (no-op when
      // the date is empty).
      return _doWriteAssignment("insert", "replace");
    }
  }

  async function _hasDateConflict(clientId, date) {
    const sb = window.supabaseClient;
    if (!sb) return { found: false };
    try {
      const { data } = await sb.from("user_data")
        .select("data_value")
        .eq("user_id", clientId).eq("data_key", "workoutSchedule")
        .maybeSingle();
      const arr = Array.isArray(data?.data_value) ? data.data_value : [];
      const hits = arr.filter(e => e && e.date === date);
      if (!hits.length) return { found: false };
      const first = hits[0];
      const summary = first.sessionName || _typeLabel(first.type) || "Workout";
      return { found: true, summary, count: hits.length };
    } catch (e) {
      console.warn("[coach-assign] conflict check failed:", e);
      return { found: false };
    }
  }

  function _typeLabel(t) {
    const map = { running: "Run", cycling: "Ride", swimming: "Swim",
      weightlifting: "Strength", strength: "Strength", hiit: "HIIT",
      hyrox: "Hyrox", brick: "Brick", general: "Workout", yoga: "Yoga",
      bodyweight: "Bodyweight" };
    return map[t] || t;
  }

  function _openConflictModal(summary) {
    const modal = document.getElementById("coach-conflict-overlay");
    if (!modal) return;
    const summaryEl = document.getElementById("coach-conflict-summary");
    if (summaryEl) summaryEl.textContent = `${_clientName ? _clientName + " has " : "Client has "}${summary} planned that day. What should happen?`;
    modal.classList.add("is-open");
  }

  function _closeConflictModal() {
    const modal = document.getElementById("coach-conflict-overlay");
    if (modal) modal.classList.remove("is-open");
  }

  function coachAssignConflict(mode) {
    // mode: 'replace' | 'stack' | 'freeze'
    _closeConflictModal();
    _doWriteAssignment("insert", mode);
  }

  async function _doWriteAssignment(opKind, mode) {
    const errEl = document.getElementById("coach-assign-error");
    const setErr = (m) => { if (errEl) errEl.textContent = m || ""; };
    const btn = document.getElementById("coach-assign-save-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    const sb = window.supabaseClient;
    if (!sb) { setErr("Auth client not available."); if (btn) { btn.disabled = false; btn.textContent = "Assign Workout"; } return; }
    const session = (await sb.auth.getSession())?.data?.session;
    const coachId = session?.user?.id;
    if (!coachId) { setErr("Not signed in."); if (btn) { btn.disabled = false; btn.textContent = "Assign Workout"; } return; }

    // Stamp the coach's display name onto the workout JSONB so the
    // client renders "FROM Mark" without a separate profile lookup.
    // The trigger merges this through (left side of ||) so it survives.
    // Cached after first fetch — coach name change risk is low, and
    // the cost of re-checking on every assign is wasted bandwidth.
    if (!window._coachNameCache) window._coachNameCache = {};
    let coachName = window._coachNameCache[coachId];
    if (!coachName) {
      try {
        const { data: cp } = await sb.from("profiles").select("full_name, email").eq("id", coachId).maybeSingle();
        coachName = cp?.full_name || cp?.email || "Your coach";
        window._coachNameCache[coachId] = coachName;
      } catch { coachName = "Your coach"; }
    }
    if (_pendingPayload && _pendingPayload.workout && !_pendingPayload.workout.coachName) {
      _pendingPayload.workout = { ..._pendingPayload.workout, coachName };
    }

    try {
      let res;
      if (opKind === "update") {
        res = await sb.from("coach_assigned_workouts")
          .update({
            date:          _pendingPayload.date,
            coach_note:    _pendingPayload.coach_note,
            workout:       _pendingPayload.workout,
            updated_at:    new Date().toISOString(),
          })
          .eq("id", _editingAssignmentId);
      } else {
        res = await sb.from("coach_assigned_workouts").insert({
          client_id:     _pendingPayload.client_id,
          coach_id:      coachId,
          date:          _pendingPayload.date,
          conflict_mode: mode,
          coach_note:    _pendingPayload.coach_note,
          workout:       _pendingPayload.workout,
        });
      }

      if (res?.error) throw new Error(res.error.message);

      // Success — close modal, refresh client detail so the new entry
      // appears, surface a quick toast.
      closeAssignWorkoutModal();
      _showCoachToast(opKind === "update" ? "Workout updated" : "Workout assigned");

      if (typeof window.loadCoachClientDetail === "function" && _clientId) {
        await window.loadCoachClientDetail(_clientId);
      }

      if (typeof trackEvent === "function") {
        try {
          trackEvent("coach_workout_assigned", {
            mode: opKind === "update" ? "edit" : mode,
            type: _pendingPayload.workout?.type,
          });
        } catch {}
      }
    } catch (e) {
      setErr((e && e.message) || "Couldn't save the workout — try again.");
      if (btn) { btn.disabled = false; btn.textContent = _editingAssignmentId ? "Update Workout" : "Assign Workout"; }
    }
  }

  // ── Phase 3C: save-to-library helper ──────────────────────────────────
  async function _saveLibraryItem({ sessionName, type, exercises, durationRaw, coachNote }) {
    const errEl = document.getElementById("coach-assign-error");
    const setErr = (m) => { if (errEl) errEl.textContent = m || ""; };
    const btn = document.getElementById("coach-assign-save-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    const sb = window.supabaseClient;
    if (!sb) { setErr("Auth client not available."); if (btn) { btn.disabled = false; btn.textContent = _libraryEditId ? "Update Library" : "Save to Library"; } return; }
    const sess = (await sb.auth.getSession())?.data?.session;
    const coachId = sess?.user?.id;
    if (!coachId) { setErr("Not signed in."); if (btn) { btn.disabled = false; btn.textContent = _libraryEditId ? "Update Library" : "Save to Library"; } return; }

    const duration = durationRaw ? parseInt(durationRaw, 10) || null : null;
    const workoutJson = {
      sessionName,
      type,
      exercises: exercises.length ? exercises : undefined,
      ...(duration ? { duration } : {}),
      level: "intermediate",
    };

    try {
      let res;
      if (_libraryEditId) {
        res = await sb.from("coach_workout_library")
          .update({ name: sessionName, workout: workoutJson, notes: coachNote || null })
          .eq("id", _libraryEditId);
      } else {
        res = await sb.from("coach_workout_library").insert({
          coach_id: coachId,
          name:     sessionName,
          workout:  workoutJson,
          notes:    coachNote || null,
        });
      }
      if (res?.error) throw new Error(res.error.message);

      closeAssignWorkoutModal();
      _showCoachToast(_libraryEditId ? "Library updated" : "Saved to library");
      if (typeof window.loadCoachLibrary === "function") await window.loadCoachLibrary();
    } catch (e) {
      setErr((e && e.message) || "Couldn't save — try again.");
      if (btn) { btn.disabled = false; btn.textContent = _libraryEditId ? "Update Library" : "Save to Library"; }
    }
  }

  // ── Tiny toast (no-op if the host page doesn't have a toast helper) ────
  function _showCoachToast(msg) {
    if (typeof window.showToast === "function") return window.showToast(msg);
    // Fallback: lightweight alert-y div.
    let el = document.getElementById("coach-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "coach-toast";
      el.className = "coach-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("is-visible");
    setTimeout(() => el.classList.remove("is-visible"), 1800);
  }

  // ── Public surface ─────────────────────────────────────────────────────
  window.openAssignWorkoutModal   = openAssignWorkoutModal;
  window.closeAssignWorkoutModal  = closeAssignWorkoutModal;
  window.submitAssignWorkout      = submitAssignWorkout;
  window.coachAssignAddExRow      = coachAssignAddExRow;
  window.coachAssignRemoveExRow   = coachAssignRemoveExRow;
  window.coachAssignConflict      = coachAssignConflict;
})();
