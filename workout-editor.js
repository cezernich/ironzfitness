// workout-editor.js — Edit & swap exercises on any saved workout

let _editWorkoutId     = null;
let _editRowCount      = 0;
let _editIntervalCount = 0;
let _editIsCardio      = false;
let _editIsHiit        = false;
let _editDragId        = null;
let _editSsCount       = 0;
let _editSource        = "workouts"; // "workouts" or "workoutSchedule"
// _editSsMode and _editSsDragId removed — superset now triggered by drop zone

// ── Open ──────────────────────────────────────────────────────────────────────

function openEditWorkout(id, source) {
  _editSource = source || "workouts";
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem(_editSource)) || []; } catch {}
  const w = workouts.find(x => String(x.id) === String(id));
  if (!w) return;

  _editWorkoutId     = id;
  _editRowCount      = 0;
  _editIntervalCount = 0;
  const _cardioTypes = ["running", "cycling", "swimming", "triathlon", "stairstepper", "general"];
  _editIsCardio = !!(w.aiSession) || (_cardioTypes.includes(w.type) && !(w.exercises && w.exercises.length));
  _editIsHiit = w.type === "hiit" || !!w.hiitMeta;

  const _cardioPlaceholders = {
    running: "e.g. Felt good, held Z3 the whole tempo block",
    cycling: "e.g. Strong ride, averaged 220W",
    swimming: "e.g. Good form, focused on catch",
    triathlon: "e.g. Brick felt solid, transitions smooth",
    stairstepper: "e.g. 30 min, steady climb at level 8",
    general: "e.g. Good session, felt energized",
  };
  const _notesPlaceholder = _editIsCardio
    ? (_cardioPlaceholders[w.type] || "e.g. Good session")
    : "e.g. Felt strong, increased weight";

  document.getElementById("edit-workout-date").textContent        = formatDate(w.date);
  document.getElementById("edit-workout-notes").value             = w.notes || "";
  document.getElementById("edit-workout-notes").placeholder       = _notesPlaceholder;
  document.getElementById("edit-workout-msg").textContent         = "";

  const exSection = document.getElementById("edit-exercise-section");
  const ivSection = document.getElementById("edit-interval-section");

  if (_editIsCardio) {
    if (exSection) exSection.style.display = "none";
    if (ivSection) ivSection.style.display = "";
    const container = document.getElementById("edit-interval-rows");
    container.innerHTML = "";
    const intervals = w.aiSession?.intervals || [];
    intervals.forEach(iv => _addEditIntervalRow(iv));
    if (!intervals.length) _addEditIntervalRow();
  } else {
    if (exSection) exSection.style.display = "";
    if (ivSection) ivSection.style.display = "none";
    const container = document.getElementById("edit-exercise-rows");
    container.innerHTML = "";
    const exercises = w.exercises && w.exercises.length ? w.exercises : [];
    exercises.forEach(e => _addEditRow(e));
    if (!exercises.length) _addEditRow();
    // Restore superset groupings from saved data
    _editRestoreSupersets(exercises);
  }

  document.getElementById("edit-workout-overlay").classList.add("is-open");
}

/**
 * Open editor for a plan entry or scheduled workout.
 * Converts the session into a temporary workout in the "workouts" store,
 * then opens the standard editor on it.
 */
function openEditPlanSession(dateStr, raceId, discipline, load) {
  const session = (typeof SESSION_DESCRIPTIONS !== 'undefined' && SESSION_DESCRIPTIONS[discipline])
    ? SESSION_DESCRIPTIONS[discipline][load] : null;

  // Build intervals from session steps
  const intervals = [];
  if (session && session.steps) {
    session.steps.forEach(step => {
      // Normalize zone: could be number (1), string ("Z1"), or label ("Z1")
      var zone = step.zone || step.effort || "Z2";
      if (typeof zone === 'number') zone = "Z" + zone;
      if (typeof zone === 'string' && /^\d+$/.test(zone)) zone = "Z" + zone;

      intervals.push({
        name: step.label || step.name || "",
        duration: (step.duration || "") + " min",
        effort: zone,
        reps: step.reps || 1,
        restDuration: step.restDuration ? (step.restDuration + " min") : "",
        restEffort: step.restEffort ? ("Z" + step.restEffort) : "",
      });
    });
  }

  // Create a workout entry that the editor can work with
  const workoutId = "plan-edit-" + dateStr + "-" + (raceId || discipline);
  const workouts = JSON.parse(localStorage.getItem("workouts") || "[]");

  // Check if we already created an edit copy for this session
  let existing = workouts.find(w => w.id === workoutId);
  if (!existing) {
    const type = { running: "running", cycling: "cycling", swimming: "swimming", strength: "weightlifting" }[discipline] || "general";
    existing = {
      id: workoutId,
      date: dateStr,
      type: type,
      notes: session ? (session.name || "") : "",
      aiSession: intervals.length > 0 ? { title: session?.name || discipline, intervals } : null,
      exercises: [],
      fromSaved: session?.name || discipline,
      _planSource: { raceId, discipline, load },
    };
    workouts.push(existing);
    localStorage.setItem("workouts", JSON.stringify(workouts));
    if (typeof DB !== 'undefined') DB.syncWorkouts();
  }

  openEditWorkout(workoutId, "workouts");
}

function openEditScheduledWorkout(id) {
  const schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
  const w = schedule.find(x => String(x.id) === String(id));
  if (!w) return;

  // If it has a discipline + load, convert steps to intervals
  if (w.discipline && w.load) {
    const session = (typeof SESSION_DESCRIPTIONS !== 'undefined' && SESSION_DESCRIPTIONS[w.discipline])
      ? SESSION_DESCRIPTIONS[w.discipline][w.load] : null;
    if (session && session.steps && !w.aiSession) {
      w.aiSession = {
        title: session.name || w.discipline,
        intervals: session.steps.map(step => {
          var zone = step.zone || step.effort || "Z2";
          if (typeof zone === 'number') zone = "Z" + zone;
          if (typeof zone === 'string' && /^\d+$/.test(zone)) zone = "Z" + zone;
          return {
            name: step.label || step.name || "",
            duration: (step.duration || "") + " min",
            effort: zone,
            reps: step.reps || 1,
            restDuration: step.restDuration ? (step.restDuration + " min") : "",
            restEffort: step.restEffort ? ("Z" + step.restEffort) : "",
          };
        })
      };
      localStorage.setItem("workoutSchedule", JSON.stringify(schedule));
      if (typeof DB !== 'undefined') DB.syncKey('workoutSchedule');
    }
  }

  openEditWorkout(id, "workoutSchedule");
}

function closeEditWorkout() {
  document.getElementById("edit-workout-overlay").classList.remove("is-open");
  _editWorkoutId = null;
}

// ── Strength row management ───────────────────────────────────────────────────

function _addEditRow(ex) {
  _editRowCount++;
  const id  = _editRowCount;
  const div = document.createElement("div");
  div.className = "qe-manual-row edit-exercise-row" + (_editIsHiit ? " hiit-row" : "");
  div.id = `edit-row-${id}`;
  const weightVal = typeof _normalizeWeightDisplay === 'function' ? _normalizeWeightDisplay(ex?.weight || '') : (ex?.weight || '');
  const hasSetDetails = ex?.setDetails && ex.setDetails.length > 0;
  const dragHandleHTML = `<span class="drag-handle" title="Drag to reorder">⠿</span>`;
  if (_editIsHiit) {
    div.innerHTML = `
      ${dragHandleHTML}
      <div><label>Exercise</label>
        <input type="text" id="edit-ex-${id}" value="${ex?.name || ""}" placeholder="e.g. Burpees, Row 500m" /></div>
      <div class="edit-summary-fields" id="edit-summary-${id}"><label>Reps / Time</label>
        <input type="text" id="edit-reps-${id}" value="${ex?.reps || ""}" placeholder="e.g. 10, 45s, 500m" /></div>
      <div class="edit-summary-fields" id="edit-summary-wt-${id}"><label>Weight</label>
        <input type="text" id="edit-wt-${id}" value="${weightVal}" placeholder="optional" /></div>
      <button class="remove-exercise-btn" title="Remove" onclick="removeEditRow(${id})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  } else {
    div.innerHTML = `
      ${dragHandleHTML}
      <div><label>Exercise</label>
        <input type="text"   id="edit-ex-${id}"    value="${ex?.name   || ""}" placeholder="e.g. Bench Press" /></div>
      <div><label>Sets</label>
        <input type="number" id="edit-sets-${id}"  value="${ex?.sets   || ""}" placeholder="3" min="1" max="99" onchange="editSetCountChanged(${id})" /></div>
      <div class="edit-summary-fields" id="edit-summary-${id}"><label>Reps</label>
        <input type="text"   id="edit-reps-${id}"  value="${ex?.reps   || ""}" placeholder="10" /></div>
      <div class="edit-summary-fields" id="edit-summary-wt-${id}"><label>Weight</label>
        <input type="text"   id="edit-wt-${id}"    value="${weightVal}" placeholder="lbs / BW" /></div>
      <button class="remove-exercise-btn" title="Remove" onclick="removeEditRow(${id})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  }
  // Per-set detail section (skip for HIIT — rounds are at workout level)
  if (!_editIsHiit) {
    const detailWrap = document.createElement("div");
    detailWrap.className = "edit-set-detail-wrap";
    detailWrap.id = `edit-sd-wrap-${id}`;
    detailWrap.innerHTML = `<button class="edit-perset-toggle" id="edit-sd-btn-${id}" onclick="editTogglePerSet(${id})">${hasSetDetails ? "▾ Per-set details" : "▸ Edit per set"}</button>
      <div class="edit-set-details" id="edit-sd-${id}" style="display:${hasSetDetails ? "" : "none"}"></div>`;
    div.appendChild(detailWrap);
  }
  if (hasSetDetails) {
    // Store setDetails as data for later rendering (after DOM insertion)
    div.dataset.pendingSetDetails = JSON.stringify(ex.setDetails);
  }
  div.draggable = true;
  let _editHoverTimer = null;
  div.addEventListener("dragstart", (e) => { _editDragId = id; div.classList.add("drag-active"); e.dataTransfer.effectAllowed = "move"; });
  div.addEventListener("dragend",   ()  => { div.classList.remove("drag-active"); _editDragId = null; _editClearAllHints(); });
  div.addEventListener("dragover",  (e) => {
    if (_editDragId == null || _editDragId === id) return;
    e.preventDefault();
    const rect = div.getBoundingClientRect();
    const pct  = (e.clientY - rect.top) / rect.height;
    // Middle 40% = superset zone, top 30% = insert above, bottom 30% = insert below
    div.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
    if (pct > 0.3 && pct < 0.7) {
      div.classList.add("drag-ss-target");
      if (!_editHoverTimer) {
        _editHoverTimer = setTimeout(() => { /* timer just for visual confirmation */ }, 600);
      }
    } else {
      clearTimeout(_editHoverTimer); _editHoverTimer = null;
      div.classList.add(pct <= 0.3 ? "drag-insert-above" : "drag-insert-below");
    }
  });
  div.addEventListener("dragleave", () => { clearTimeout(_editHoverTimer); _editHoverTimer = null; div.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target"); });
  div.addEventListener("drop", (e) => {
    e.preventDefault();
    const rect = div.getBoundingClientRect();
    const pct  = (e.clientY - rect.top) / rect.height;
    clearTimeout(_editHoverTimer); _editHoverTimer = null;
    _editClearAllHints();
    if (pct > 0.3 && pct < 0.7) {
      _editGroupSuperset(_editDragId, id);
    } else {
      _editReorder(_editDragId, id, pct <= 0.3);
    }
    _editDragId = null;
  });
  // Touch support for mobile
  const editContainer = document.getElementById("edit-exercise-rows");
  TouchDrag.attach(div, editContainer, {
    hintClasses: ["drag-insert-above", "drag-insert-below", "drag-ss-target"],
    rowSelector: ".edit-exercise-row",
    handleSelector: ".drag-handle",
    onDrop(dragEl, targetEl, clientY) {
      const rect = targetEl.getBoundingClientRect();
      const pct = (clientY - rect.top) / rect.height;
      _editClearAllHints();
      const fromId = parseInt(dragEl.id.replace("edit-row-", ""));
      const toId   = parseInt(targetEl.id.replace("edit-row-", ""));
      if (pct > 0.3 && pct < 0.7) {
        _editGroupSuperset(fromId, toId);
      } else {
        _editReorder(fromId, toId, pct <= 0.3);
      }
    }
  });
  editContainer.appendChild(div);
  // Render pending setDetails now that the element is in the DOM
  if (hasSetDetails) {
    _editRenderSetDetails(id, ex.setDetails);
    // Hide summary reps/weight when per-set is open
    const sf1 = document.getElementById(`edit-summary-${id}`);
    const sf2 = document.getElementById(`edit-summary-wt-${id}`);
    if (sf1) sf1.style.display = "none";
    if (sf2) sf2.style.display = "none";
    delete div.dataset.pendingSetDetails;
  }
}

function addEditExerciseRow() { _addEditRow(); }

function removeEditRow(id) {
  const el = document.getElementById(`edit-row-${id}`);
  if (el) el.remove();
}

function editTogglePerSet(rowId) {
  const detailsEl = document.getElementById(`edit-sd-${rowId}`);
  const btn       = document.getElementById(`edit-sd-btn-${rowId}`);
  const sf1       = document.getElementById(`edit-summary-${rowId}`);
  const sf2       = document.getElementById(`edit-summary-wt-${rowId}`);
  if (!detailsEl) return;
  const opening = detailsEl.style.display === "none";
  detailsEl.style.display = opening ? "" : "none";
  if (btn) btn.textContent = opening ? "▾ Per-set details" : "▸ Edit per set";
  if (opening) {
    // If no rows yet, generate from current sets/reps/weight
    if (!detailsEl.querySelector(".edit-set-row")) {
      const numSets = parseInt(document.getElementById(`edit-sets-${rowId}`)?.value) || 3;
      const reps    = document.getElementById(`edit-reps-${rowId}`)?.value || "";
      const weight  = document.getElementById(`edit-wt-${rowId}`)?.value || "";
      const details = [];
      for (let s = 0; s < numSets; s++) details.push({ reps, weight });
      _editRenderSetDetails(rowId, details);
    }
    if (sf1) sf1.style.display = "none";
    if (sf2) sf2.style.display = "none";
  } else {
    if (sf1) sf1.style.display = "";
    if (sf2) sf2.style.display = "";
  }
}

function _editRenderSetDetails(rowId, details) {
  const el = document.getElementById(`edit-sd-${rowId}`);
  if (!el) return;
  let html = `<div class="edit-set-header"><span></span><span>Reps</span><span>Weight</span></div>`;
  details.forEach((d, s) => {
    html += `<div class="edit-set-row" id="edit-sr-${rowId}-${s}">
      <span class="edit-set-label">Set ${s + 1}</span>
      <input class="qe-edit-reps" id="edit-sd-reps-${rowId}-${s}" value="${d.reps || ""}" placeholder="reps" />
      <input class="qe-weight-input" id="edit-sd-wt-${rowId}-${s}" value="${d.weight || ""}" placeholder="lbs" />
    </div>`;
  });
  el.innerHTML = html;
}

function editSetCountChanged(rowId) {
  const detailsEl = document.getElementById(`edit-sd-${rowId}`);
  if (!detailsEl || detailsEl.style.display === "none") return;
  // Re-render per-set rows to match new set count
  const numSets = parseInt(document.getElementById(`edit-sets-${rowId}`)?.value) || 3;
  const existing = [];
  for (let s = 0; ; s++) {
    const r = document.getElementById(`edit-sd-reps-${rowId}-${s}`);
    if (!r) break;
    existing.push({ reps: r.value, weight: document.getElementById(`edit-sd-wt-${rowId}-${s}`)?.value || "" });
  }
  const details = [];
  for (let s = 0; s < numSets; s++) {
    details.push(existing[s] || existing[existing.length - 1] || { reps: "", weight: "" });
  }
  _editRenderSetDetails(rowId, details);
}

function _editReadSetDetails(rowId) {
  const detailsEl = document.getElementById(`edit-sd-${rowId}`);
  if (!detailsEl || detailsEl.style.display === "none") return null;
  const details = [];
  for (let s = 0; ; s++) {
    const r = document.getElementById(`edit-sd-reps-${rowId}-${s}`);
    if (!r) break;
    details.push({
      reps:   r.value || "",
      weight: document.getElementById(`edit-sd-wt-${rowId}-${s}`)?.value || "",
    });
  }
  if (!details.length) return null;
  const allSame = details.every(d => d.reps === details[0].reps && d.weight === details[0].weight);
  return allSame ? null : details;
}

function _editClearAllHints() {
  document.querySelectorAll(".edit-exercise-row").forEach(el => {
    el.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target", "drag-active");
  });
}

function _editReorder(fromId, toId, insertAbove) {
  const fromEl = document.getElementById(`edit-row-${fromId}`);
  const toEl   = document.getElementById(`edit-row-${toId}`);
  if (!fromEl || !toEl) return;
  const container = toEl.parentNode;
  if (insertAbove) container.insertBefore(fromEl, toEl);
  else             toEl.after(fromEl);
}

function _editGroupSuperset(fromId, toId) {
  const fromEl = document.getElementById(`edit-row-${fromId}`);
  const toEl   = document.getElementById(`edit-row-${toId}`);
  if (!fromEl || !toEl) return;
  toEl.after(fromEl);
  let gid = toEl.dataset.ssId;
  if (!gid) {
    _editSsCount++;
    gid = `ess-${_editSsCount}`;
    toEl.dataset.ssId = gid;
    _editAddSupersetWrap(toEl, gid);
  }
  fromEl.dataset.ssId = gid;
  fromEl.classList.add("qe-manual-ss-member");
  toEl.classList.add("qe-manual-ss-member");
  _editUpdateSupersetWrap(gid);
  // Sync sets from group input and hide member sets inputs
  const wrap = document.getElementById(`edit-ss-wrap-${gid}`);
  const groupSets = wrap?.querySelector(".qe-ss-sets-input")?.value || "3";
  [fromEl, toEl].forEach(el => {
    const inp = el.querySelector(`[id^="edit-sets-"]`);
    if (inp) inp.value = groupSets;
    _editHideSetsInput(el);
  });
}

function _editAddSupersetWrap(anchorEl, gid) {
  let wrap = document.getElementById(`edit-ss-wrap-${gid}`);
  if (!wrap) {
    const setsVal = anchorEl.querySelector(`[id^="edit-sets-"]`)?.value || "3";
    wrap = document.createElement("div");
    wrap.className = "qe-superset-group";
    wrap.id = `edit-ss-wrap-${gid}`;
    wrap.innerHTML = `<div class="qe-superset-label">Superset <span class="qe-ss-sets-wrap"><input type="number" class="qe-ss-sets-input" min="1" max="20" value="${setsVal}" onchange="_editSupersetSetsChange('${gid}', this.value)" /> sets</span><button class="qe-unsuperset-btn" onclick="_editUnsuperset('${gid}')">Remove</button></div>`;
    anchorEl.parentNode.insertBefore(wrap, anchorEl);
    wrap.appendChild(anchorEl);
    _editHideSetsInput(anchorEl);
  }
}

function _editUpdateSupersetWrap(gid) {
  const wrap = document.getElementById(`edit-ss-wrap-${gid}`);
  if (!wrap) return;
  document.querySelectorAll(`[data-ss-id="${gid}"]`).forEach(el => {
    if (!wrap.contains(el)) wrap.appendChild(el);
  });
}

function _editUnsuperset(gid) {
  const wrap = document.getElementById(`edit-ss-wrap-${gid}`);
  if (!wrap) return;
  const container = document.getElementById("edit-exercise-rows");
  wrap.querySelectorAll(".edit-exercise-row").forEach(el => {
    _editShowSetsInput(el);
    el.classList.remove("qe-manual-ss-member");
    delete el.dataset.ssId;
    container.appendChild(el);
  });
  wrap.remove();
}

function _editRestoreSupersets(exercises) {
  // Group exercises by supersetId and rebuild DOM groupings
  const seen = new Set();
  exercises.forEach((ex, idx) => {
    if (!ex.supersetId || seen.has(ex.supersetId)) return;
    seen.add(ex.supersetId);
    // Find all exercises in this superset group
    const memberIds = [];
    exercises.forEach((e2, j) => {
      if (e2.supersetId === ex.supersetId) memberIds.push(j + 1); // row IDs are 1-based
    });
    if (memberIds.length < 2) return;
    // Use the first member as anchor to create the wrap
    const anchorId = memberIds[0];
    const anchorEl = document.getElementById(`edit-row-${anchorId}`);
    if (!anchorEl) return;
    _editSsCount++;
    const gid = `ess-${_editSsCount}`;
    anchorEl.dataset.ssId = gid;
    _editAddSupersetWrap(anchorEl, gid);
    // Add remaining members
    memberIds.slice(1).forEach(mid => {
      const el = document.getElementById(`edit-row-${mid}`);
      if (!el) return;
      el.dataset.ssId = gid;
      el.classList.add("qe-manual-ss-member");
      _editHideSetsInput(el);
    });
    anchorEl.classList.add("qe-manual-ss-member");
    _editUpdateSupersetWrap(gid);
  });
}

function toggleEditSupersetMode(btn) {
  const rows = document.getElementById("edit-exercise-rows");
  if (!rows) return;
  const btns = rows.querySelectorAll(".qe-manual-ss-btn");
  const showing = btns[0]?.style.display !== "none";
  btns.forEach(b => b.style.display = showing ? "none" : "");
  btn.classList.toggle("is-active", !showing);
}

function _editHideSetsInput(rowEl) {
  const inp = rowEl.querySelector(`[id^="edit-sets-"]`);
  if (inp) { const w = inp.closest("div"); if (w) w.style.display = "none"; }
}
function _editShowSetsInput(rowEl) {
  const inp = rowEl.querySelector(`[id^="edit-sets-"]`);
  if (inp) { const w = inp.closest("div"); if (w) w.style.display = ""; }
}
function _editSupersetSetsChange(gid, value) {
  const wrap = document.getElementById(`edit-ss-wrap-${gid}`);
  if (!wrap) return;
  wrap.querySelectorAll(`[id^="edit-sets-"]`).forEach(inp => { inp.value = value; });
}

// ── Cardio interval row management ───────────────────────────────────────────

function _editIntervalRowDuration(id) {
  const row = document.getElementById(`edit-iv-${id}`);
  const mode = row?.dataset.durMode || "time";
  if (mode === "distance") {
    const val  = document.getElementById(`edit-ivdist-${id}`)?.value || "";
    const unit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";
    return val ? `${val} ${unit}` : "";
  }
  const val = document.getElementById(`edit-ivmin-${id}`)?.value || "";
  return val ? `${val} min` : "";
}

function setEditIntervalMode(id, mode) {
  const row = document.getElementById(`edit-iv-${id}`);
  if (!row) return;
  row.dataset.durMode = mode;
  document.getElementById(`edit-dist-wrap-${id}`).style.display = mode === "distance" ? "" : "none";
  document.getElementById(`edit-time-wrap-${id}`).style.display = mode === "time"     ? "" : "none";
  row.querySelectorAll(".qe-dur-mode-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.mode === mode));
}

function _addEditIntervalRow(iv) {
  _editIntervalCount++;
  const id   = _editIntervalCount;
  const eff  = iv?.effort || "Z2";
  const unit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";
  let initMode = "time", initDist = "", initMin = "";
  if (iv?.duration) {
    const durStr = String(iv.duration);
    if ((/\bmi(?:les?)?\b/i.test(durStr) && !/min/i.test(durStr)) || /\bkm\b/i.test(durStr) || /\byd\b/i.test(durStr) || (/\bm\b/.test(durStr) && !/min/i.test(durStr))) {
      initMode = "distance";
      initDist = durStr.match(/[\d.]+/)?.[0] || "";
    } else {
      initMin = durStr.match(/[\d.]+/)?.[0] || "";
    }
  }
  const initReps = iv?.reps || "";
  const initRest = iv?.restDuration ? String(iv.restDuration).match(/[\d.]+/)?.[0] || "" : "";
  const restEff = iv?.restEffort || "RW";
  const hasReps = initReps && Number(initReps) > 1;
  const div = document.createElement("div");
  div.className = "edit-interval-card";
  div.id = `edit-iv-${id}`;
  div.dataset.durMode = initMode;
  div.innerHTML = `
    <div class="eiv-header">
      <span class="eiv-phase-label">Phase</span>
      <input type="text" id="edit-ivphase-${id}" class="eiv-phase-input" value="${iv?.name || ""}" placeholder="e.g. Warm-up" />
      <button class="remove-exercise-btn" title="Remove" onclick="removeEditIntervalRow(${id})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
    </div>
    <div class="eiv-fields">
      <div class="eiv-field">
        <div class="qe-dur-toggle">
          <button class="qe-dur-mode-btn${initMode==="distance"?" active":""}" data-mode="distance"
            onclick="setEditIntervalMode(${id},'distance')">Dist</button>
          <button class="qe-dur-mode-btn${initMode==="time"?" active":""}" data-mode="time"
            onclick="setEditIntervalMode(${id},'time')">Time</button>
        </div>
        <div id="edit-dist-wrap-${id}" style="${initMode==="distance"?"":"display:none"}">
          <input type="number" id="edit-ivdist-${id}" value="${initDist}" placeholder="5" min="0" step="0.1" />
          <span class="qe-unit-label">${unit}</span>
        </div>
        <div id="edit-time-wrap-${id}" style="${initMode==="time"?"":"display:none"}">
          <input type="number" id="edit-ivmin-${id}" value="${initMin}" placeholder="10" min="0" />
          <span class="qe-unit-label">min</span>
        </div>
      </div>
      <div class="eiv-field">
        <select id="edit-iveffort-${id}">
          <option value="RW" ${eff==="RW"?"selected":""}>Rest/Walk</option>
          <option value="Z1" ${eff==="Z1"||eff==="Easy"?"selected":""}>Z1</option>
          <option value="Z2" ${eff==="Z2"||eff==="Moderate"?"selected":""}>Z2</option>
          <option value="Z3" ${eff==="Z3"?"selected":""}>Z3</option>
          <option value="Z4" ${eff==="Z4"||eff==="Hard"?"selected":""}>Z4</option>
          <option value="Z5" ${eff==="Z5"||eff==="Max"?"selected":""}>Z5</option>
          <option value="Z6" ${eff==="Z6"?"selected":""}>Z6</option>
        </select>
      </div>
      <div class="eiv-field eiv-reps-field">
        <input type="number" id="edit-ivreps-${id}" value="${initReps}" placeholder="1" min="1" max="99" />
        <span class="qe-unit-label">reps</span>
      </div>
      <div class="eiv-field eiv-rest-field" id="edit-rest-wrap-${id}" style="${hasReps?"":"display:none"}">
        <input type="number" id="edit-ivrest-${id}" value="${initRest}" placeholder="1" min="0" />
        <span class="qe-unit-label">min</span>
        <select id="edit-ivrestzone-${id}">
          <option value="RW" ${restEff==="RW"?"selected":""}>Rest</option>
          <option value="Z1" ${restEff==="Z1"?"selected":""}>Z1</option>
          <option value="Z2" ${restEff==="Z2"?"selected":""}>Z2</option>
          <option value="Z3" ${restEff==="Z3"?"selected":""}>Z3</option>
        </select>
      </div>
    </div>
    <div class="eiv-details">
      <input type="text" id="edit-ivdetails-${id}" value="${iv?.details || ""}" placeholder="Details (e.g. 5:30/km, HR under 145)" />
    </div>`;
  // Show/hide rest field when reps changes
  const repsInput = div.querySelector(`#edit-ivreps-${id}`);
  repsInput.addEventListener("input", () => {
    const restWrap = document.getElementById(`edit-rest-wrap-${id}`);
    if (restWrap) restWrap.style.display = Number(repsInput.value) > 1 ? "" : "none";
  });
  document.getElementById("edit-interval-rows").appendChild(div);
}

function addEditIntervalRow() { _addEditIntervalRow(); }

function removeEditIntervalRow(id) {
  const el = document.getElementById(`edit-iv-${id}`);
  if (el) el.remove();
}

// ── Swap (AI-powered, strength only) ──────────────────────────────────────────

async function swapExercise(rowId) {
  const nameEl = document.getElementById(`edit-ex-${rowId}`);
  if (!nameEl) return;

  const current = nameEl.value.trim();
  if (!current) { nameEl.focus(); return; }

  const btn = nameEl.closest(".edit-exercise-row").querySelector(".swap-btn");
  if (btn) { btn.textContent = "…"; btn.disabled = true; }

  try {
    let profile = {};
    try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}
    const level = profile.fitnessLevel || "intermediate";

    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Suggest 3 alternative exercises to replace "${current}" for a ${level} athlete. Return ONLY a JSON array of 3 strings, no markdown: ["Exercise 1","Exercise 2","Exercise 3"]`
      }]
    });

    const text    = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const options = JSON.parse(text.replace(/```json|```/g, "").trim());
    _showSwapPicker(rowId, current, options);
  } catch {
    nameEl.value = "";
    nameEl.placeholder = "Type replacement exercise";
    nameEl.focus();
  } finally {
    if (btn) { btn.textContent = "Swap"; btn.disabled = false; }
  }
}

function _showSwapPicker(rowId, current, options) {
  const row = document.getElementById(`edit-row-${rowId}`);
  if (!row) return;
  row.querySelector(".swap-picker")?.remove();

  const picker = document.createElement("div");
  picker.className = "swap-picker";
  picker.innerHTML = `
    <div class="swap-picker-label">Replace <strong>${current}</strong> with:</div>
    ${options.map(o => `
      <button class="swap-option" onclick="applySwap(${rowId}, '${o.replace(/'/g, "\\'")}', this.closest('.swap-picker'))">
        ${o}
      </button>`).join("")}
    <button class="swap-cancel" onclick="this.closest('.swap-picker').remove()">Cancel</button>`;
  row.appendChild(picker);
}

function applySwap(rowId, name, pickerEl) {
  const nameEl = document.getElementById(`edit-ex-${rowId}`);
  if (nameEl) nameEl.value = name;
  pickerEl?.remove();
}

// ── Save ──────────────────────────────────────────────────────────────────────

function saveEditedWorkout() {
  const msg   = document.getElementById("edit-workout-msg");
  const notes = document.getElementById("edit-workout-notes").value.trim();

  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem(_editSource)) || []; } catch {}
  const idx = workouts.findIndex(x => String(x.id) === String(_editWorkoutId));
  if (idx === -1) { msg.textContent = "Workout not found."; return; }

  if (_editIsCardio) {
    const intervals = [];
    document.querySelectorAll("[id^='edit-ivphase-']").forEach(inp => {
      const id   = inp.id.replace("edit-ivphase-", "");
      const name = inp.value.trim();
      if (!name) return;
      const iv = {
        name,
        duration: _editIntervalRowDuration(id),
        effort:   document.getElementById(`edit-iveffort-${id}`)?.value  || "Z2",
        details:  document.getElementById(`edit-ivdetails-${id}`)?.value || "",
      };
      const repsVal = parseInt(document.getElementById(`edit-ivreps-${id}`)?.value);
      if (repsVal > 1) {
        iv.reps = repsVal;
        const restVal = document.getElementById(`edit-ivrest-${id}`)?.value;
        if (restVal) iv.restDuration = `${restVal} min`;
        const restZone = document.getElementById(`edit-ivrestzone-${id}`)?.value;
        if (restZone) iv.restEffort = restZone;
      }
      intervals.push(iv);
    });
    workouts[idx] = {
      ...workouts[idx],
      notes,
      aiSession: {
        ...(workouts[idx].aiSession || {}),
        title: notes || workouts[idx].aiSession?.title || "",
        intervals,
      },
    };
  } else {
    const exercises = [];
    document.querySelectorAll("[id^='edit-ex-']").forEach(inp => {
      const id   = inp.id.replace("edit-ex-", "");
      const name = inp.value.trim();
      if (!name) return;
      const row = document.getElementById(`edit-row-${id}`);
      const ex = {
        name,
        reps:   document.getElementById(`edit-reps-${id}`)?.value || "",
        weight: document.getElementById(`edit-wt-${id}`)?.value   || "",
      };
      const setsInput = document.getElementById(`edit-sets-${id}`);
      if (setsInput) ex.sets = setsInput.value || "";
      if (!_editIsHiit) {
        const setDetails = _editReadSetDetails(id);
        if (setDetails) ex.setDetails = setDetails;
      }
      if (row?.dataset.ssId) ex.supersetId = row.dataset.ssId;
      exercises.push(ex);
    });
    workouts[idx] = { ...workouts[idx], notes, exercises };
  }

  localStorage.setItem(_editSource, JSON.stringify(workouts));

  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
  if (typeof renderCalendar       === "function") renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate) {
    if (typeof renderDayDetail === "function") renderDayDetail(selectedDate);
  }

  msg.style.color = "var(--color-success)";
  msg.textContent = "Saved!";
  setTimeout(() => closeEditWorkout(), 600);
}
