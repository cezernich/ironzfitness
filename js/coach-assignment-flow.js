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
  let _cardioRowCount = 0;
  let _editingAssignmentId = null;  // 3B: present when editing an existing
                                     // coach assignment instead of inserting.
  let _libraryMode = false;          // 3C: when true, submit writes to
                                     // coach_workout_library instead of
                                     // coach_assigned_workouts.
  let _libraryEditId = null;         // 3C edit existing library item.
  // Buffer used by the conflict modal so the user's filled form doesn't
  // get re-fetched after they pick replace/stack/freeze.
  let _pendingPayload = null;

  // Cardio types take interval rows (phase / time-or-distance / zone /
  // details) instead of strength's exercise rows — matches custom-plan.js's
  // CARDIO_TYPES set + the brick session shape (per-interval discipline tag).
  const _CARDIO_TYPES = new Set(["running", "cycling", "swimming", "brick"]);
  function _isCardioType(t) { return _CARDIO_TYPES.has(t); }

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
    setVal("coach-assign-why", "");
    setVal("coach-assign-error", "");
    const errEl = document.getElementById("coach-assign-error");
    if (errEl) errEl.textContent = "";

    // Reset exercise rows. Always start with one empty row so the form
    // doesn't look broken on first open.
    _exRowCount = 0;
    const rows = document.getElementById("coach-assign-ex-rows");
    if (rows) rows.innerHTML = "";
    _addExRow();

    // Reset cardio rows + HIIT meta so a stale session's intervals don't
    // bleed into the next open.
    _cardioRowCount = 0;
    const cRows = document.getElementById("coach-assign-cardio-rows");
    if (cRows) cRows.innerHTML = "";
    const setVal2 = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal2("coach-assign-hiit-format", "circuit");
    setVal2("coach-assign-hiit-rounds", "3");
    setVal2("coach-assign-hiit-rest-ex", "");
    setVal2("coach-assign-hiit-rest-rnd", "");

    // Show the right block(s) for the default type ("weightlifting" → strength).
    _renderForType("weightlifting");

    const subtitle = document.getElementById("coach-assign-subtitle");
    if (subtitle) {
      subtitle.textContent = _clientName ? `Client: ${_clientName}` : "";
    }
    const submitBtn = document.getElementById("coach-assign-save-btn");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = _editingAssignmentId ? "Update Workout" : "Add Workout";
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
    const prefillWhy = prefill.whyText || prefill.why_text;
    if (prefillWhy)          setVal("coach-assign-why", prefillWhy);
    // Yoga sessions store the coach's text in `details` (no rows). Surface
    // it in the coach-note field so the editing coach sees what they wrote.
    if (!prefill.coachNote && prefill.details && prefill.type === "yoga") {
      setVal("coach-assign-note", prefill.details);
    }

    // Re-render visible blocks for the prefill's type before filling rows
    // so the right container is on screen.
    _renderForType(prefill.type || "weightlifting");

    // Cardio intervals can arrive in either shape: top-level `intervals`
    // (legacy library items, the early Phase-3A coach JSON) or wrapped
    // inside `aiSession` (the current shape both the home renderer and
    // custom-plan emit). Accept both so old assignments / library items
    // pre-fill correctly.
    const _prefillIntervals =
      Array.isArray(prefill.aiSession?.intervals) ? prefill.aiSession.intervals
      : Array.isArray(prefill.intervals)          ? prefill.intervals
      : null;
    if (_prefillIntervals && _prefillIntervals.length) {
      const cRows = document.getElementById("coach-assign-cardio-rows");
      if (cRows) cRows.innerHTML = "";
      _cardioRowCount = 0;
      for (const iv of _prefillIntervals) _addCardioRow(iv);
    } else if (Array.isArray(prefill.exercises) && prefill.exercises.length) {
      const rows = document.getElementById("coach-assign-ex-rows");
      if (rows) rows.innerHTML = "";
      _exRowCount = 0;
      for (const ex of prefill.exercises) _addExRow(ex);
    }

    if (prefill.hiitMeta && prefill.type === "hiit") {
      const m = prefill.hiitMeta;
      if (m.format) setVal("coach-assign-hiit-format", m.format);
      if (m.rounds) setVal("coach-assign-hiit-rounds", m.rounds);
      if (m.restBetweenExercises) setVal("coach-assign-hiit-rest-ex", m.restBetweenExercises);
      if (m.restBetweenRounds)    setVal("coach-assign-hiit-rest-rnd", m.restBetweenRounds);
      coachAssignOnHiitFormatChange();
    }
  }

  // ── Type-aware form rendering ──────────────────────────────────────────
  // Toggles which input block is visible based on the selected workout type.
  // Strength block (exercise rows) shows for weightlifting/bodyweight/general/
  // hiit/hyrox. Cardio block (interval rows) shows for running/cycling/swimming/
  // brick. HIIT meta block stacks under strength when type=hiit. Yoga hides
  // both row blocks — it's just name + duration + coach note.
  function _renderForType(type) {
    type = type || "weightlifting";
    const isCardio = _isCardioType(type);
    const isYoga   = type === "yoga";
    const strengthBlock = document.getElementById("coach-assign-strength-block");
    const cardioBlock   = document.getElementById("coach-assign-cardio-block");
    const hiitBlock     = document.getElementById("coach-assign-hiit-block");
    if (strengthBlock) strengthBlock.style.display = (isCardio || isYoga) ? "none" : "";
    if (cardioBlock)   cardioBlock.style.display   = isCardio ? "" : "none";
    if (hiitBlock)     hiitBlock.style.display     = type === "hiit" ? "" : "none";

    // Relabel the strength block per type so "Stations" reads naturally for
    // Hyrox and the placeholder hint stays accurate.
    const lbl = document.getElementById("coach-assign-strength-label");
    if (lbl) lbl.textContent = type === "hyrox" ? "Stations" : "Exercises";
    const addBtn = document.getElementById("coach-assign-add-ex-btn");
    if (addBtn) addBtn.textContent = type === "hyrox" ? "+ Add Station" : "+ Add Exercise";

    // Brick rows have a per-interval discipline select that's hidden for
    // other cardio types. Toggle it on existing rows when the type flips.
    document.querySelectorAll("#coach-assign-cardio-rows .coach-assign-cardio-row").forEach(row => {
      const discEl = row.querySelector(".coach-assign-cdisc");
      if (discEl) discEl.style.display = type === "brick" ? "" : "none";
      const phaseInput = row.querySelector(".coach-assign-cphase");
      if (phaseInput) phaseInput.placeholder = type === "brick" ? "e.g. Steady Ride" : "e.g. Warm-up";
    });

    // Make sure the visible row block has at least one starter row so the
    // form doesn't look empty after a type switch.
    if (isCardio) {
      const cRows = document.getElementById("coach-assign-cardio-rows");
      if (cRows && !cRows.querySelector(".coach-assign-cardio-row")) _addCardioRow();
    } else if (!isYoga) {
      const sRows = document.getElementById("coach-assign-ex-rows");
      if (sRows && !sRows.querySelector(".coach-assign-ex-row")) _addExRow();
    }
  }

  function coachAssignOnTypeChange() {
    const type = document.getElementById("coach-assign-type")?.value || "weightlifting";
    _renderForType(type);
    if (type === "hiit") coachAssignOnHiitFormatChange();
  }

  // Relabel "Rounds" and toggle "Rest b/w rounds" based on format. The same
  // numeric input drives all of these — what changes is the meaning the user
  // is supplying (count of rounds vs total minutes vs time cap).
  function coachAssignOnHiitFormatChange() {
    const fmt = document.getElementById("coach-assign-hiit-format")?.value || "circuit";
    const lbl = document.getElementById("coach-assign-hiit-rounds-label");
    const restRndWrap = document.getElementById("coach-assign-hiit-rest-rnd-wrap");
    const labels = {
      circuit: "Rounds",
      tabata:  "Bouts",
      emom:    "Total minutes",
      amrap:   "Time cap (min)",
    };
    if (lbl) lbl.textContent = labels[fmt] || "Rounds";
    // Rest b/w rounds is meaningless for AMRAP (no fixed rounds) and EMOM
    // (rest is whatever's left of the minute) — hide instead of confusing.
    if (restRndWrap) restRndWrap.style.display = (fmt === "amrap" || fmt === "emom") ? "none" : "";
  }

  // ── Exercise rows ──────────────────────────────────────────────────────
  let _ssCounter = 0;
  let _dragId = null;

  function _addExRow(prefill) {
    _exRowCount++;
    const id = _exRowCount;
    const rows = document.getElementById("coach-assign-ex-rows");
    if (!rows) return;
    const row = document.createElement("div");
    row.className = "coach-assign-ex-row";
    row.id = `coach-assign-row-${id}`;
    if (prefill?.supersetGroup) row.dataset.supersetGroup = prefill.supersetGroup;
    row.draggable = true;
    // .ex-row-name picks up the shared exercise-autocomplete dropdown
    // (js/ui/exercise-autocomplete.js attaches to that selector via
    // document-level event delegation, so dynamically-added inputs
    // work without rewiring).
    // Per-set prefill: accept either canonical perSet[] or legacy
    // setDetails[] shape (workout-editor and custom-plan both write the
    // latter for backward compat). When present, the panel auto-expands
    // so the coach sees the values they're editing.
    const existingPerSet = (Array.isArray(prefill?.perSet) && prefill.perSet.length)
      ? prefill.perSet
      : (Array.isArray(prefill?.setDetails) && prefill.setDetails.length ? prefill.setDetails : null);
    const startExpanded = !!existingPerSet;

    row.innerHTML = `
      <div class="coach-assign-ex-row-main">
        <span class="drag-handle" title="Drag to reorder · drop on a row to superset">⠿</span>
        <input type="text" class="input ex-row-name coach-assign-ex-name" id="coach-assign-ex-name-${id}"
          placeholder="Exercise (e.g. Bench Press)" value="${_esc(prefill?.name || "")}" autocomplete="off" />
        <input type="number" class="input coach-assign-ex-sets" id="coach-assign-ex-sets-${id}"
          placeholder="Sets" min="1" max="20" value="${_esc(prefill?.sets || "")}" data-pyr-field="ca:sets:${id}" />
        <input type="text" class="input coach-assign-ex-reps" id="coach-assign-ex-reps-${id}"
          placeholder="Reps" value="${_esc(prefill?.reps || "")}" data-pyr-field="ca:default:${id}" />
        <input type="text" class="input coach-assign-ex-weight" id="coach-assign-ex-weight-${id}"
          placeholder="Weight" value="${_esc(prefill?.weight || "")}" data-pyr-field="ca:default:${id}" />
        <button class="admin-action-btn" aria-label="Remove exercise" title="Remove"
          onclick="coachAssignRemoveExRow(${id})">×</button>
      </div>
      <button type="button" class="ex-row-customize-toggle" id="coach-assign-pyr-toggle-${id}" data-pyr-toggle="ca:${id}">${startExpanded ? "Collapse ▴" : "Customize per set ▾"}</button>
      <div class="ex-pyramid-detail coach-assign-set-details" id="coach-assign-sd-${id}" style="display:${startExpanded ? "block" : "none"}"></div>`;
    if (startExpanded) {
      row.dataset.pendingSetDetails = JSON.stringify(existingPerSet);
    }

    // Native HTML5 DnD — desktop. Same drop-zone math as workout-editor.js
    // (middle 40% = superset, top 30% = insert above, bottom 30% = below).
    let hoverTimer = null;
    row.addEventListener("dragstart", (e) => {
      _dragId = id;
      row.classList.add("drag-active");
      try { e.dataTransfer.effectAllowed = "move"; } catch {}
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("drag-active");
      _dragId = null;
      _clearDragHints();
    });
    row.addEventListener("dragover", (e) => {
      if (_dragId == null || _dragId === id) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const pct  = (e.clientY - rect.top) / rect.height;
      row.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
      if (pct > 0.3 && pct < 0.7) {
        row.classList.add("drag-ss-target");
        if (!hoverTimer) hoverTimer = setTimeout(() => {}, 600);
      } else {
        clearTimeout(hoverTimer); hoverTimer = null;
        row.classList.add(pct <= 0.3 ? "drag-insert-above" : "drag-insert-below");
      }
    });
    row.addEventListener("dragleave", () => {
      clearTimeout(hoverTimer); hoverTimer = null;
      row.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const pct  = (e.clientY - rect.top) / rect.height;
      clearTimeout(hoverTimer); hoverTimer = null;
      _clearDragHints();
      if (pct > 0.3 && pct < 0.7) {
        _groupSuperset(_dragId, id);
      } else {
        _reorderRow(_dragId, id, pct <= 0.3);
      }
      _dragId = null;
    });

    // Touch support for mobile — uses the existing TouchDrag helper
    // that workout-editor.js + custom-plan.js both already wire.
    if (typeof TouchDrag !== "undefined" && TouchDrag.attach) {
      TouchDrag.attach(row, rows, {
        hintClasses: ["drag-insert-above", "drag-insert-below", "drag-ss-target"],
        rowSelector: ".coach-assign-ex-row",
        handleSelector: ".drag-handle",
        onDrop(dragEl, targetEl, clientY) {
          const rect = targetEl.getBoundingClientRect();
          const pct = (clientY - rect.top) / rect.height;
          _clearDragHints();
          const fromId = parseInt(dragEl.id.replace("coach-assign-row-", ""));
          const toId   = parseInt(targetEl.id.replace("coach-assign-row-", ""));
          if (pct > 0.3 && pct < 0.7) {
            _groupSuperset(fromId, toId);
          } else {
            _reorderRow(fromId, toId, pct <= 0.3);
          }
        }
      });
    }

    rows.appendChild(row);
    if (row.dataset.pendingSetDetails) {
      try {
        const pending = JSON.parse(row.dataset.pendingSetDetails);
        if (Array.isArray(pending) && pending.length) {
          _coachAssignRenderSetDetails(id, pending);
        }
      } catch {}
      delete row.dataset.pendingSetDetails;
    }
    _refreshSupersetBadges();
  }

  // ── Per-set customize panel (mirrors workout-editor.js) ────────────────
  // The "Customize per set ▾" toggle, set-count rebuilds, default
  // propagation, and read-back on submit all share the same pattern as
  // the regular workout editor — rebuilt under "ca" scope with
  // coach-assign-* DOM ids.

  function coachAssignTogglePerSet(rowId) {
    const detailsEl = document.getElementById(`coach-assign-sd-${rowId}`);
    const toggle = document.getElementById(`coach-assign-pyr-toggle-${rowId}`);
    if (!detailsEl || !toggle) return;
    const isHidden = detailsEl.style.display === "none";
    if (isHidden) {
      detailsEl.style.display = "block";
      toggle.textContent = "Collapse ▴";
      if (!detailsEl.querySelector(".coach-assign-set-row")) {
        coachAssignSetCountChanged(rowId);
      }
    } else {
      detailsEl.style.display = "none";
      toggle.textContent = "Customize per set ▾";
    }
  }

  function _coachAssignRenderSetDetails(rowId, details) {
    const el = document.getElementById(`coach-assign-sd-${rowId}`);
    if (!el) return;
    let html = `<div class="ex-pyr-header"><span></span><span>Reps</span><span>Weight</span></div>`;
    details.forEach((d, s) => {
      html += `<div class="coach-assign-set-row ex-pyr-row" id="coach-assign-sr-${rowId}-${s}">
        <span class="ex-pyr-label">Set ${s + 1}</span>
        <input class="ex-pyr-reps" id="coach-assign-sd-reps-${rowId}-${s}" value="${_esc(d.reps || "")}" placeholder="reps" />
        <input class="ex-pyr-weight" id="coach-assign-sd-wt-${rowId}-${s}" value="${_esc(d.weight || "")}" placeholder="lbs" />
      </div>`;
    });
    el.innerHTML = html;
  }

  function coachAssignSetCountChanged(rowId) {
    const detailsEl = document.getElementById(`coach-assign-sd-${rowId}`);
    if (!detailsEl || detailsEl.style.display === "none") return;
    const setsInput = document.getElementById(`coach-assign-ex-sets-${rowId}`);
    let numSets = parseInt(setsInput?.value) || 0;
    if (numSets < 1) {
      numSets = parseInt(setsInput?.placeholder) || 3;
      if (setsInput && !setsInput.value) setsInput.value = String(numSets);
    }
    const defaultReps = document.getElementById(`coach-assign-ex-reps-${rowId}`)?.value || "";
    const defaultWeight = document.getElementById(`coach-assign-ex-weight-${rowId}`)?.value || "";
    // Preserve any values already entered in existing per-set rows.
    const existing = [];
    for (let s = 0; ; s++) {
      const r = document.getElementById(`coach-assign-sd-reps-${rowId}-${s}`);
      if (!r) break;
      existing.push({
        reps:   r.value,
        weight: document.getElementById(`coach-assign-sd-wt-${rowId}-${s}`)?.value || "",
      });
    }
    const details = [];
    for (let s = 0; s < numSets; s++) {
      details.push(existing[s] || { reps: defaultReps, weight: defaultWeight });
    }
    _coachAssignRenderSetDetails(rowId, details);
  }

  function coachAssignDefaultsChanged(rowId) {
    const detailsEl = document.getElementById(`coach-assign-sd-${rowId}`);
    if (!detailsEl || detailsEl.style.display === "none") return;
    const defaultReps = document.getElementById(`coach-assign-ex-reps-${rowId}`)?.value || "";
    const defaultWeight = document.getElementById(`coach-assign-ex-weight-${rowId}`)?.value || "";
    for (let s = 0; ; s++) {
      const rInp = document.getElementById(`coach-assign-sd-reps-${rowId}-${s}`);
      if (!rInp) break;
      const wInp = document.getElementById(`coach-assign-sd-wt-${rowId}-${s}`);
      if (!rInp.value) rInp.value = defaultReps;
      if (wInp && !wInp.value) wInp.value = defaultWeight;
    }
    if (!detailsEl.querySelector(".coach-assign-set-row")) coachAssignSetCountChanged(rowId);
  }

  function _coachAssignReadSetDetails(rowId) {
    const detailsEl = document.getElementById(`coach-assign-sd-${rowId}`);
    if (!detailsEl || detailsEl.style.display === "none") return null;
    const defaultReps = (document.getElementById(`coach-assign-ex-reps-${rowId}`)?.value || "").trim();
    const defaultWeight = (document.getElementById(`coach-assign-ex-weight-${rowId}`)?.value || "").trim();
    const details = [];
    let hasDiff = false;
    for (let s = 0; ; s++) {
      const r = document.getElementById(`coach-assign-sd-reps-${rowId}-${s}`);
      if (!r) break;
      const rv = (r.value || "").trim();
      const wv = (document.getElementById(`coach-assign-sd-wt-${rowId}-${s}`)?.value || "").trim();
      details.push({ reps: rv || defaultReps, weight: wv || defaultWeight });
      if ((rv && rv !== defaultReps) || (wv && wv !== defaultWeight)) hasDiff = true;
    }
    if (!details.length || !hasDiff) return null;
    return details;
  }

  function _clearDragHints() {
    document.querySelectorAll("#coach-assign-ex-rows .coach-assign-ex-row").forEach(el => {
      el.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target", "drag-active");
    });
  }

  function _reorderRow(fromId, toId, insertAbove) {
    const fromEl = document.getElementById(`coach-assign-row-${fromId}`);
    const toEl   = document.getElementById(`coach-assign-row-${toId}`);
    if (!fromEl || !toEl || fromEl === toEl) return;
    const container = toEl.parentNode;
    if (insertAbove) container.insertBefore(fromEl, toEl);
    else             toEl.after(fromEl);
    // Reorder may break a superset chain — drop the moving row out
    // of any group it was in unless its new neighbour is in the same
    // group (matches custom-plan.js semantics).
    const above = fromEl.previousElementSibling;
    const below = fromEl.nextElementSibling;
    const g = fromEl.dataset.supersetGroup;
    if (g) {
      const stillTouching = (above && above.dataset.supersetGroup === g)
                         || (below && below.dataset.supersetGroup === g);
      if (!stillTouching) delete fromEl.dataset.supersetGroup;
    }
    _refreshSupersetBadges();
  }

  function _groupSuperset(fromId, toId) {
    const fromEl = document.getElementById(`coach-assign-row-${fromId}`);
    const toEl   = document.getElementById(`coach-assign-row-${toId}`);
    if (!fromEl || !toEl || fromEl === toEl) return;
    // Park the source row immediately after the target.
    toEl.after(fromEl);
    let gid = toEl.dataset.supersetGroup || fromEl.dataset.supersetGroup;
    if (!gid) {
      _ssCounter++;
      gid = `ss-${_ssCounter}`;
    }
    toEl.dataset.supersetGroup = gid;
    fromEl.dataset.supersetGroup = gid;
    _refreshSupersetBadges();
  }

  function _refreshSupersetBadges() {
    const rows = Array.from(document.querySelectorAll("#coach-assign-ex-rows .coach-assign-ex-row"));
    // Strip any group whose only member is this row — happens when a
    // reorder isolates the lone tail of a former group.
    rows.forEach((row, i) => {
      const g = row.dataset.supersetGroup;
      if (!g) return;
      const above = rows[i - 1];
      const below = rows[i + 1];
      const stillInGroup = (above && above.dataset.supersetGroup === g)
                        || (below && below.dataset.supersetGroup === g);
      if (!stillInGroup) delete row.dataset.supersetGroup;
    });

    // Tag each grouped row with its position in the group (first / middle /
    // last) so CSS can render the left stripe as a bracket — top corner
    // rounded on first, bottom corner rounded on last, straight in the
    // middle. The bracket visually fuses the rows of one group and breaks
    // cleanly between adjacent groups.
    rows.forEach((row, i) => {
      const g = row.dataset.supersetGroup;
      row.classList.toggle("coach-assign-ex-row--ss", !!g);
      if (!g) {
        delete row.dataset.ssPos;
        return;
      }
      const above = rows[i - 1];
      const below = rows[i + 1];
      const aboveSame = above && above.dataset.supersetGroup === g;
      const belowSame = below && below.dataset.supersetGroup === g;
      let pos;
      if      (!aboveSame && !belowSame) pos = "only";   // pruned out earlier, but defensive.
      else if (!aboveSame)                pos = "first";
      else if (!belowSame)                pos = "last";
      else                                 pos = "middle";
      row.dataset.ssPos = pos;
    });
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

  // ── Cardio interval rows ───────────────────────────────────────────────
  // Mirrors custom-plan.js's cpManualAddCardioRow shape (phase, dist/time
  // toggle, zone, details, optional brick discipline) so the workout JSON
  // round-trips through the existing client renderer without translation.
  // Drag handle on the top row + middle-drop grouping mirrors the
  // run/bike repeat-block UI elsewhere — drop a row on the middle of
  // another to chain them as a "Repeat Nx" block; drop top/bottom to
  // reorder. Saved as { repeatGroup, groupSets } per interval.
  let _cardioDragId = null;
  let _cardioRepCounter = 0;

  function _addCardioRow(prefill) {
    _cardioRowCount++;
    const id = _cardioRowCount;
    const rows = document.getElementById("coach-assign-cardio-rows");
    if (!rows) return;
    const type = document.getElementById("coach-assign-type")?.value || "running";
    const isBrick = type === "brick";
    const unit = (typeof getDistanceUnit === "function") ? getDistanceUnit() : "mi";

    // Parse a saved duration string back into mode + value so edits round-trip.
    let mode = "time", dist = "", min = "";
    const dur = prefill?.duration || "";
    if (dur) {
      const dm = String(dur).match(/^\s*([\d.]+)\s*(mi|km|m)\b/i);
      const tm = String(dur).match(/^\s*([\d.]+)\s*min\b/i);
      if (dm)      { mode = "distance"; dist = dm[1]; }
      else if (tm) { mode = "time";     min  = tm[1]; }
    }

    const eff  = prefill?.effort || "Z2";
    const eopt = (v, label) => `<option value="${v}"${eff === v ? " selected" : ""}>${label}</option>`;
    const disc = prefill?.discipline || "bike";
    const dopt = (v, label) => `<option value="${v}"${disc === v ? " selected" : ""}>${label}</option>`;

    const row = document.createElement("div");
    row.className = "coach-assign-cardio-row";
    row.id = `coach-assign-crow-${id}`;
    row.dataset.durMode = mode;
    row.draggable = true;
    if (prefill?.repeatGroup) row.dataset.repeatGroup = prefill.repeatGroup;
    if (prefill?.groupSets)   row.dataset.groupSets   = prefill.groupSets;
    row.innerHTML = `
      <div class="coach-assign-crow-top">
        <span class="drag-handle" title="Drag to reorder · drop on a row to repeat together">⠿</span>
        <select class="input coach-assign-cdisc" style="display:${isBrick ? "" : "none"};max-width:84px;flex:0 0 auto">
          ${dopt("bike","Bike")}${dopt("transition","T")}${dopt("run","Run")}
        </select>
        <input type="text" class="input coach-assign-cphase" placeholder="${isBrick ? "e.g. Steady Ride" : "e.g. Warm-up"}" value="${_esc(prefill?.name || "")}" />
        <button class="admin-action-btn" aria-label="Remove interval" title="Remove" onclick="coachAssignRemoveCardioRow(${id})">×</button>
      </div>
      <div class="coach-assign-crow-mid">
        <div class="coach-assign-dur-toggle">
          <button type="button" class="qe-dur-mode-btn${mode === "distance" ? " active" : ""}" data-mode="distance"
            onclick="coachAssignSetCardioMode(${id},'distance')">Dist</button>
          <button type="button" class="qe-dur-mode-btn${mode === "time" ? " active" : ""}" data-mode="time"
            onclick="coachAssignSetCardioMode(${id},'time')">Time</button>
        </div>
        <div class="coach-assign-dur-input coach-assign-dur-dist" style="display:${mode === "distance" ? "" : "none"}">
          <input type="number" class="input coach-assign-cdist" min="0" step="0.1" placeholder="5" value="${_esc(dist)}" />
          <span class="coach-assign-unit">${_esc(unit)}</span>
        </div>
        <div class="coach-assign-dur-input coach-assign-dur-time" style="display:${mode === "time" ? "" : "none"}">
          <input type="number" class="input coach-assign-cmin" min="0" placeholder="10" value="${_esc(min)}" />
          <span class="coach-assign-unit">min</span>
        </div>
        <select class="input coach-assign-ceffort">
          ${eopt("RW","Rest / Walk")}${eopt("Z1","Z1 Recovery")}${eopt("Z2","Z2 Aerobic")}${eopt("Z3","Z3 Tempo")}${eopt("Z4","Z4 Threshold")}${eopt("Z5","Z5 VO2 Max")}${eopt("Z6","Z6 Sprint")}
        </select>
      </div>
      <input type="text" class="input coach-assign-cdetails" placeholder="e.g. 5:30/km, keep HR under 145" value="${_esc(prefill?.details || "")}" />`;

    // Native HTML5 DnD — desktop. Same drop-zone math as the strength
    // rows: middle 40% = group as repeat block, top 30% = insert above,
    // bottom 30% = insert below.
    row.addEventListener("dragstart", (e) => {
      _cardioDragId = id;
      row.classList.add("drag-active");
      try { e.dataTransfer.effectAllowed = "move"; } catch {}
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("drag-active");
      _cardioDragId = null;
      _clearCardioDragHints();
    });
    row.addEventListener("dragover", (e) => {
      if (_cardioDragId == null || _cardioDragId === id) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const pct  = (e.clientY - rect.top) / rect.height;
      row.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
      if (pct > 0.3 && pct < 0.7) row.classList.add("drag-ss-target");
      else                         row.classList.add(pct <= 0.3 ? "drag-insert-above" : "drag-insert-below");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const pct  = (e.clientY - rect.top) / rect.height;
      _clearCardioDragHints();
      if (pct > 0.3 && pct < 0.7) _groupCardioRepeat(_cardioDragId, id);
      else                         _reorderCardioRow(_cardioDragId, id, pct <= 0.3);
      _cardioDragId = null;
    });

    // Touch — same TouchDrag helper the rest of the app already uses.
    if (typeof TouchDrag !== "undefined" && TouchDrag.attach) {
      TouchDrag.attach(row, rows, {
        hintClasses: ["drag-insert-above", "drag-insert-below", "drag-ss-target"],
        rowSelector: ".coach-assign-cardio-row",
        handleSelector: ".drag-handle",
        onDrop(dragEl, targetEl, clientY) {
          const rect = targetEl.getBoundingClientRect();
          const pct  = (clientY - rect.top) / rect.height;
          _clearCardioDragHints();
          const fromId = parseInt(dragEl.id.replace("coach-assign-crow-", ""), 10);
          const toId   = parseInt(targetEl.id.replace("coach-assign-crow-", ""), 10);
          if (pct > 0.3 && pct < 0.7) _groupCardioRepeat(fromId, toId);
          else                         _reorderCardioRow(fromId, toId, pct <= 0.3);
        }
      });
    }

    rows.appendChild(row);
    _refreshCardioBracket();
  }

  function _clearCardioDragHints() {
    document.querySelectorAll("#coach-assign-cardio-rows .coach-assign-cardio-row").forEach(el => {
      el.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target", "drag-active");
    });
  }

  function _reorderCardioRow(fromId, toId, insertAbove) {
    const fromEl = document.getElementById(`coach-assign-crow-${fromId}`);
    const toEl   = document.getElementById(`coach-assign-crow-${toId}`);
    if (!fromEl || !toEl || fromEl === toEl) return;
    const container = toEl.parentNode;
    if (insertAbove) container.insertBefore(fromEl, toEl);
    else             toEl.after(fromEl);
    // A reorder may break a repeat chain — drop the moving row out of any
    // group it was in unless its new neighbour is in the same group.
    const above = fromEl.previousElementSibling;
    const below = fromEl.nextElementSibling;
    const g = fromEl.dataset.repeatGroup;
    if (g) {
      const stillTouching = (above && above.dataset.repeatGroup === g)
                         || (below && below.dataset.repeatGroup === g);
      if (!stillTouching) {
        delete fromEl.dataset.repeatGroup;
        delete fromEl.dataset.groupSets;
      }
    }
    _refreshCardioBracket();
  }

  function _groupCardioRepeat(fromId, toId) {
    const fromEl = document.getElementById(`coach-assign-crow-${fromId}`);
    const toEl   = document.getElementById(`coach-assign-crow-${toId}`);
    if (!fromEl || !toEl || fromEl === toEl) return;
    // Park the source row immediately after the target so they're adjacent.
    toEl.after(fromEl);
    let gid = toEl.dataset.repeatGroup || fromEl.dataset.repeatGroup;
    if (!gid) {
      _cardioRepCounter++;
      gid = `rep-${_cardioRepCounter}`;
    }
    toEl.dataset.repeatGroup   = gid;
    fromEl.dataset.repeatGroup = gid;
    // Default to 3 rounds when forming a new group; preserve any existing
    // groupSets value if either row already had one.
    const existingSets = toEl.dataset.groupSets || fromEl.dataset.groupSets || "3";
    toEl.dataset.groupSets   = existingSets;
    fromEl.dataset.groupSets = existingSets;
    _refreshCardioBracket();
  }

  // Tag each grouped cardio row with data-rep-pos="first|middle|last" so
  // the bracket CSS knows where to round corners, and render a small
  // "Repeat N×" pill on the first row of each group with an editable
  // rounds input + ungroup button. Mirrors _refreshSupersetBadges for
  // the strength rows.
  function _refreshCardioBracket() {
    const container = document.getElementById("coach-assign-cardio-rows");
    if (!container) return;
    const rows = Array.from(container.querySelectorAll(".coach-assign-cardio-row"));
    // Prune one-row groups (a reorder can isolate a row).
    rows.forEach((row, i) => {
      const g = row.dataset.repeatGroup;
      if (!g) return;
      const above = rows[i - 1];
      const below = rows[i + 1];
      const stillInGroup = (above && above.dataset.repeatGroup === g)
                        || (below && below.dataset.repeatGroup === g);
      if (!stillInGroup) {
        delete row.dataset.repeatGroup;
        delete row.dataset.groupSets;
      }
    });
    rows.forEach((row, i) => {
      // Always strip the previous pill so we re-render cleanly.
      const oldPill = row.querySelector(".coach-assign-rep-pill");
      if (oldPill) oldPill.remove();

      const g = row.dataset.repeatGroup;
      row.classList.toggle("coach-assign-cardio-row--rep", !!g);
      if (!g) {
        delete row.dataset.repPos;
        return;
      }
      const above = rows[i - 1];
      const below = rows[i + 1];
      const aboveSame = above && above.dataset.repeatGroup === g;
      const belowSame = below && below.dataset.repeatGroup === g;
      let pos;
      if      (!aboveSame && !belowSame) pos = "only";
      else if (!aboveSame)                pos = "first";
      else if (!belowSame)                pos = "last";
      else                                 pos = "middle";
      row.dataset.repPos = pos;

      // First row of the group hosts the editable rounds input + an
      // ungroup button. Drop it into the top header so it sits next to
      // the trash button.
      if (pos === "first" || pos === "only") {
        const header = row.querySelector(".coach-assign-crow-top");
        if (!header) return;
        const sets = row.dataset.groupSets || "3";
        const pill = document.createElement("span");
        pill.className = "coach-assign-rep-pill";
        pill.innerHTML =
          `<span class="coach-assign-rep-label">Repeat</span>` +
          `<input type="number" class="coach-assign-rep-rounds" min="1" max="20" value="${_esc(sets)}" title="Rounds" />` +
          `<span class="coach-assign-rep-x">×</span>` +
          `<button type="button" class="coach-assign-rep-ungroup" title="Ungroup">×</button>`;
        const input = pill.querySelector(".coach-assign-rep-rounds");
        input.addEventListener("change", function () {
          const v = parseInt(this.value, 10);
          const newVal = (isNaN(v) || v < 1) ? "3" : String(Math.min(v, 20));
          this.value = newVal;
          rows.filter(r => r.dataset.repeatGroup === g).forEach(r => r.dataset.groupSets = newVal);
        });
        pill.querySelector(".coach-assign-rep-ungroup").addEventListener("click", () => {
          rows.filter(r => r.dataset.repeatGroup === g).forEach(r => {
            delete r.dataset.repeatGroup;
            delete r.dataset.groupSets;
          });
          _refreshCardioBracket();
        });
        // Insert before the trash button so the pill sits to its left.
        const trash = header.querySelector(".admin-action-btn");
        if (trash) header.insertBefore(pill, trash);
        else header.appendChild(pill);
      }
    });
  }

  function coachAssignSetCardioMode(id, mode) {
    const row = document.getElementById(`coach-assign-crow-${id}`);
    if (!row) return;
    row.dataset.durMode = mode;
    row.querySelectorAll(".qe-dur-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    const distWrap = row.querySelector(".coach-assign-dur-dist");
    const timeWrap = row.querySelector(".coach-assign-dur-time");
    if (distWrap) distWrap.style.display = mode === "distance" ? "" : "none";
    if (timeWrap) timeWrap.style.display = mode === "time"     ? "" : "none";
  }

  function coachAssignAddCardioRow() { _addCardioRow(); }

  function coachAssignRemoveCardioRow(id) {
    const row = document.getElementById(`coach-assign-crow-${id}`);
    if (row) row.remove();
    const rows = document.getElementById("coach-assign-cardio-rows");
    if (rows && !rows.querySelector(".coach-assign-cardio-row")) _addCardioRow();
    _refreshCardioBracket();
  }

  // Walk every cardio row, format duration into the "<n> <unit>" / "<n> min"
  // string the rest of the app already understands, and emit the intervals[].
  // Brick rows include a per-interval discipline tag.
  function _collectCardioIntervals(type) {
    const intervals = [];
    const unit = (typeof getDistanceUnit === "function") ? getDistanceUnit() : "mi";
    document.querySelectorAll("#coach-assign-cardio-rows .coach-assign-cardio-row").forEach(row => {
      const mode = row.dataset.durMode || "time";
      let duration = "";
      if (mode === "distance") {
        const v = row.querySelector(".coach-assign-cdist")?.value.trim();
        if (v) duration = `${v} ${unit}`;
      } else {
        const v = row.querySelector(".coach-assign-cmin")?.value.trim();
        if (v) duration = `${v} min`;
      }
      if (!duration) return;
      const iv = {
        name:    row.querySelector(".coach-assign-cphase")?.value.trim() || `Interval ${intervals.length + 1}`,
        duration,
        effort:  row.querySelector(".coach-assign-ceffort")?.value || "Z2",
        details: row.querySelector(".coach-assign-cdetails")?.value.trim() || "",
      };
      if (type === "brick") {
        const d = row.querySelector(".coach-assign-cdisc")?.value;
        if (d) iv.discipline = d;
      }
      // Repeat-block grouping — same shape as custom-plan.js writes so the
      // existing renderer treats coach-authored repeat sets identically.
      if (row.dataset.repeatGroup) {
        iv.repeatGroup = row.dataset.repeatGroup;
        const gs = parseInt(row.dataset.groupSets, 10);
        iv.groupSets = isNaN(gs) ? 3 : gs;
      }
      intervals.push(iv);
    });
    return intervals;
  }

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
    const whyText     = document.getElementById("coach-assign-why")?.value.trim();

    if (!sessionName) return setErr("Give the workout a name (e.g. \"Push Day\").");
    if (!type)        return setErr("Pick a workout type.");
    if (!date)        return setErr("Pick a date.");

    // Collect rows or intervals based on the selected type. Cardio types
    // emit intervals[]; everything else (strength, hyrox, hiit, bodyweight,
    // general) emits exercises[]. Yoga emits neither — just sessionName +
    // duration + the coach note (carried as `details` for the renderer).
    const isCardio = _isCardioType(type);
    const isYoga   = type === "yoga";

    let exercises = [];
    let intervals = [];

    if (isCardio) {
      intervals = _collectCardioIntervals(type);
      if (!intervals.length) {
        return setErr(`Add at least one interval for this ${_typeLabel(type)} session.`);
      }
    } else if (!isYoga) {
      const rowEls = document.querySelectorAll("#coach-assign-ex-rows .coach-assign-ex-row");
      rowEls.forEach(r => {
        const id = r.id.replace("coach-assign-row-", "");
        const name = document.getElementById(`coach-assign-ex-name-${id}`)?.value.trim();
        if (!name) return;
        const sets   = document.getElementById(`coach-assign-ex-sets-${id}`)?.value.trim();
        const reps   = document.getElementById(`coach-assign-ex-reps-${id}`)?.value.trim();
        const weight = document.getElementById(`coach-assign-ex-weight-${id}`)?.value.trim();
        const exObj  = { name, sets: sets || "3", reps: reps || "", weight: weight || "" };
        const perSet = _coachAssignReadSetDetails(id);
        if (perSet) {
          exObj.perSet = perSet;
          exObj.setDetails = perSet; // legacy alias
        }
        if (r.dataset.supersetGroup) {
          // buildExerciseTableHTML keys on supersetId; supersetGroup is the
          // canonical storage name. Set both so client-side rendering picks
          // up the grouping the coach built in the form.
          exObj.supersetGroup = r.dataset.supersetGroup;
          exObj.supersetId    = r.dataset.supersetGroup;
        }
        exercises.push(exObj);
      });

      // Propagate groupSets to every member of each group from the head
      // row's sets count so the workout renderer reads a consistent
      // count regardless of which member it inspects first.
      const headSetsByGroup = {};
      for (const e of exercises) {
        if (e.supersetGroup && headSetsByGroup[e.supersetGroup] == null) {
          headSetsByGroup[e.supersetGroup] = e.sets;
        }
      }
      for (const e of exercises) {
        if (e.supersetGroup) {
          const v = parseInt(headSetsByGroup[e.supersetGroup], 10);
          e.groupSets = isNaN(v) ? 3 : v;
        }
      }

      if (!exercises.length && type === "weightlifting") {
        return setErr("Add at least one exercise (or change the type to a cardio workout).");
      }
    }

    // HIIT meta (format / rounds / rest) — only collected for type=hiit so
    // the JSON matches what Add Session emits.
    let hiitMeta = null;
    if (type === "hiit") {
      const rounds = parseInt(document.getElementById("coach-assign-hiit-rounds")?.value, 10) || 1;
      hiitMeta = {
        format: document.getElementById("coach-assign-hiit-format")?.value || "circuit",
        rounds,
      };
      const rex = document.getElementById("coach-assign-hiit-rest-ex")?.value.trim();
      const rrd = document.getElementById("coach-assign-hiit-rest-rnd")?.value.trim();
      if (rex) hiitMeta.restBetweenExercises = rex;
      if (rrd) hiitMeta.restBetweenRounds = rrd;
    }

    // Phase 3C: save-to-library path bypasses date / conflict /
    // assignments tables entirely.
    if (_libraryMode) {
      return _saveLibraryItem({ sessionName, type, exercises, intervals, hiitMeta, durationRaw, coachNote, whyText });
    }

    const duration = durationRaw ? parseInt(durationRaw, 10) || null : null;

    // Workout JSONB shape mirrors a normal workoutSchedule entry. Any
    // fields the existing renderer reads MUST be at this top level
    // (sessionName, type, exercises | aiSession.intervals, duration) — the
    // trigger merges mirror-only fields (id, source, coachId, etc.) on top.
    // Cardio types must wrap intervals inside `aiSession` because the home
    // renderer's branch at calendar.js `if (w.aiSession)` is what drives
    // the interval-card body + intensity strip — without it, the workout
    // card loaded with no body at all (matches custom-plan.js:2076).
    const workoutJson = {
      sessionName,
      type,
      ...(intervals.length ? { aiSession: { title: sessionName, intervals } } : {}),
      ...(exercises.length ? { exercises } : {}),
      ...(hiitMeta ? { hiitMeta } : {}),
      ...(type === "hyrox" ? { isHyrox: true } : {}),
      ...(isYoga && coachNote ? { details: coachNote } : {}),
      ...(duration ? { duration } : {}),
      ...(whyText ? { whyText } : {}),
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

  // Rest-day placeholders aren't workouts — assigning over them shouldn't
  // trigger the "already a workout on this day" prompt. Mirrors the
  // calendar's _calV2IsRestEntry rule (load/discipline/type/name).
  function _isRestEntry(e) {
    if (!e) return false;
    const load = String(e.load || "").toLowerCase();
    const disc = String(e.discipline || "").toLowerCase();
    const type = String(e.type || "").toLowerCase();
    const name = String(e.sessionName || e.name || "").toLowerCase();
    return load === "rest" || disc === "rest" || type === "rest" || /^\s*rest\s*$/.test(name);
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
      const hits = arr.filter(e => e && e.date === date && !_isRestEntry(e));
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

  // Race a supabase call against a timeout so a hung connection surfaces
  // as an error instead of leaving the Save button stuck on "Saving…".
  // Mirrors the admin-panel auth-prime + retry pattern.
  function _withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label || "Request"} timed out — please try again.`)), ms)
      ),
    ]);
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
    if (!sb) { setErr("Auth client not available."); if (btn) { btn.disabled = false; btn.textContent = "Add Workout"; } return; }
    let session;
    try {
      session = (await _withTimeout(sb.auth.getSession(), 3000, "Sign-in check"))?.data?.session;
    } catch {
      setErr("Couldn't verify your session — try again.");
      if (btn) { btn.disabled = false; btn.textContent = "Add Workout"; }
      return;
    }
    const coachId = session?.user?.id;
    if (!coachId) { setErr("Not signed in."); if (btn) { btn.disabled = false; btn.textContent = "Add Workout"; } return; }

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
      const writePromise = (opKind === "update")
        ? sb.from("coach_assigned_workouts")
            .update({
              date:          _pendingPayload.date,
              coach_note:    _pendingPayload.coach_note,
              workout:       _pendingPayload.workout,
              updated_at:    new Date().toISOString(),
            })
            .eq("id", _editingAssignmentId)
        : sb.from("coach_assigned_workouts").insert({
            client_id:     _pendingPayload.client_id,
            coach_id:      coachId,
            date:          _pendingPayload.date,
            conflict_mode: mode,
            coach_note:    _pendingPayload.coach_note,
            workout:       _pendingPayload.workout,
          });
      res = await _withTimeout(writePromise, 12000, "Save");

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
      if (btn) { btn.disabled = false; btn.textContent = _editingAssignmentId ? "Update Workout" : "Add Workout"; }
    }
  }

  // ── Phase 3C: save-to-library helper ──────────────────────────────────
  async function _saveLibraryItem({ sessionName, type, exercises, intervals, hiitMeta, durationRaw, coachNote, whyText }) {
    const errEl = document.getElementById("coach-assign-error");
    const setErr = (m) => { if (errEl) errEl.textContent = m || ""; };
    const btn = document.getElementById("coach-assign-save-btn");
    const resetBtn = () => { if (btn) { btn.disabled = false; btn.textContent = _libraryEditId ? "Update Library" : "Save to Library"; } };
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    // Mirror the assign-flow validation: cardio types must have at least one
    // interval. Without this, opening a saved running workout for editing and
    // hitting Save (without re-typing intervals) silently nuked the body —
    // every subsequent assignment of that library item then rendered blank.
    const isCardioSave = _isCardioType(type);
    const isYogaSave   = type === "yoga";
    if (isCardioSave && (!Array.isArray(intervals) || !intervals.length)) {
      setErr(`Add at least one interval for this ${_typeLabel(type)} session.`);
      resetBtn();
      return;
    }
    if (!isCardioSave && !isYogaSave && (!Array.isArray(exercises) || !exercises.length)) {
      setErr("Add at least one exercise (or change the type).");
      resetBtn();
      return;
    }

    const sb = window.supabaseClient;
    if (!sb) { setErr("Auth client not available."); resetBtn(); return; }
    let sess;
    try {
      sess = await _withTimeout(sb.auth.getSession(), 3000, "Sign-in check");
    } catch {
      setErr("Couldn't verify your session — try again.");
      resetBtn();
      return;
    }
    const coachId = sess?.data?.session?.user?.id;
    if (!coachId) { setErr("Not signed in."); resetBtn(); return; }

    const duration = durationRaw ? parseInt(durationRaw, 10) || null : null;
    const isYoga = type === "yoga";
    // Cardio intervals wrap into aiSession (same as the assign-to-client path)
    // — the home renderer's `if (w.aiSession)` branch is what drives the
    // interval-card body + intensity strip.
    const workoutJson = {
      sessionName,
      type,
      ...(Array.isArray(intervals) && intervals.length ? { aiSession: { title: sessionName, intervals } } : {}),
      ...(Array.isArray(exercises) && exercises.length ? { exercises } : {}),
      ...(hiitMeta ? { hiitMeta } : {}),
      ...(type === "hyrox" ? { isHyrox: true } : {}),
      ...(isYoga && coachNote ? { details: coachNote } : {}),
      ...(duration ? { duration } : {}),
      ...(whyText ? { whyText } : {}),
      level: "intermediate",
    };

    try {
      const writePromise = _libraryEditId
        ? sb.from("coach_workout_library")
            .update({ name: sessionName, workout: workoutJson, notes: coachNote || null })
            .eq("id", _libraryEditId)
        : sb.from("coach_workout_library").insert({
            coach_id: coachId,
            name:     sessionName,
            workout:  workoutJson,
            notes:    coachNote || null,
          });
      const res = await _withTimeout(writePromise, 12000, "Save");
      if (res?.error) throw new Error(res.error.message);

      closeAssignWorkoutModal();
      _showCoachToast(_libraryEditId ? "Library updated" : "Saved to library");
      if (typeof window.loadCoachLibrary === "function") await window.loadCoachLibrary();
    } catch (e) {
      setErr((e && e.message) || "Couldn't save — try again.");
      resetBtn();
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
  window.openAssignWorkoutModal             = openAssignWorkoutModal;
  window.openAssignWorkoutModalForLibrary   = openAssignWorkoutModalForLibrary;
  window.closeAssignWorkoutModal            = closeAssignWorkoutModal;
  window.submitAssignWorkout                = submitAssignWorkout;
  window.coachAssignAddExRow                = coachAssignAddExRow;
  window.coachAssignRemoveExRow             = coachAssignRemoveExRow;
  window.coachAssignAddCardioRow            = coachAssignAddCardioRow;
  window.coachAssignRemoveCardioRow         = coachAssignRemoveCardioRow;
  window.coachAssignSetCardioMode           = coachAssignSetCardioMode;
  window.coachAssignOnTypeChange            = coachAssignOnTypeChange;
  window.coachAssignOnHiitFormatChange      = coachAssignOnHiitFormatChange;
  window.coachAssignConflict                = coachAssignConflict;
  // Per-set toggle delegator (share.js _wirePerSetToggleDelegator under
  // scope "ca") routes events to these globals.
  window.coachAssignTogglePerSet            = coachAssignTogglePerSet;
  window.coachAssignSetCountChanged         = coachAssignSetCountChanged;
  window.coachAssignDefaultsChanged         = coachAssignDefaultsChanged;
})();
