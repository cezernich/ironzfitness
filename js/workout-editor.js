// workout-editor.js — Edit & swap exercises on any saved workout

let _editWorkoutId     = null;
let _editRowCount      = 0;
let _editIntervalCount = 0;
let _editIsCardio      = false;
let _editIsHiit        = false;
let _editDragId        = null;
let _editSsCount       = 0;
let _editSource        = "workouts"; // "workouts", "workoutSchedule", or "trainingPlan"
let _editPlanKey       = null;      // For plan entries: { date, raceId, discipline, load }
// _editSsMode and _editSsDragId removed — superset now triggered by drop zone
let _editIvSuppressBadges = false;  // suppress per-row badge refresh during bulk load

// ── Open ──────────────────────────────────────────────────────────────────────

function openEditWorkout(id, source) {
  _editSource = source || "workouts";
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem(_editSource)) || []; } catch {}
  const w = workouts.find(x => String(x.id) === String(id));
  if (!w) return;

  // Circuits live under a step tree (w.circuit.steps), NOT under aiSession
  // intervals or a flat exercises[] list. The generic editor below would
  // collapse the step tree into a single round + free-text details, losing
  // the per-exercise structure the user built in CircuitBuilder. Hand off
  // to CircuitBuilder's manual editor in edit mode so the same UI that
  // created the workout edits it too.
  if ((w.type === "circuit" || w.circuit) && typeof window !== "undefined" && window.CircuitBuilder) {
    window.CircuitBuilder.openEntryFlow(w.date, {
      existing: w,
      context: _editSource === "workoutSchedule" ? "calendar" : "calendar",
      onSave: (workout) => {
        // Replace the existing row in localStorage[_editSource]. We rewrite
        // the same row id so the calendar card swaps in place rather than
        // appending a duplicate.
        const list = JSON.parse(localStorage.getItem(_editSource) || "[]");
        const idx = list.findIndex(x => String(x.id) === String(id));
        if (idx === -1) return;
        const s = workout.structure || {};
        list[idx] = {
          ...list[idx],
          name: workout.name || list[idx].name,
          notes: workout.notes || list[idx].notes,
          circuit: {
            name: workout.name || "",
            goal: s.goal || "standard",
            goal_value: s.goal_value || null,
            benchmark_id: s.benchmark_id || null,
            steps: s.steps || [],
          },
        };
        localStorage.setItem(_editSource, JSON.stringify(list));
        if (typeof DB !== "undefined") {
          if (_editSource === "workoutSchedule") DB.syncSchedule?.();
          else DB.syncWorkouts?.();
        }
        if (typeof renderCalendar === "function") renderCalendar();
        if (typeof renderDayDetail === "function" && w.date) renderDayDetail(w.date);
      },
    });
    return;
  }

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
    _editIvSuppressBadges = true;
    try { intervals.forEach(iv => _addEditIntervalRow(iv)); }
    finally { _editIvSuppressBadges = false; }
    _editIvRefreshBadges();
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
 * Open editor for a plan entry (trainingPlan).
 * Edits are saved directly onto the plan entry as overrides.
 */
function openEditPlanSession(dateStr, raceId, discipline, load) {
  const plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]");
  const idx = plan.findIndex(e => e.date === dateStr && e.raceId === raceId && e.discipline === discipline && e.load === load);
  if (idx === -1) return;
  const entry = plan[idx];

  // Give the entry a stable id if it doesn't have one
  if (!entry.id) {
    entry.id = "plan-" + dateStr + "-" + (raceId || discipline) + "-" + load;
  }

  // If the entry doesn't have edited overrides yet, derive from SESSION_DESCRIPTIONS
  if (!entry.aiSession && !entry.exercises) {
    const session = (typeof getSessionTemplate === "function")
      ? getSessionTemplate(discipline, load, entry.weekNumber)
      : ((typeof SESSION_DESCRIPTIONS !== 'undefined' && SESSION_DESCRIPTIONS[discipline])
          ? SESSION_DESCRIPTIONS[discipline][load] : null);
    if (session && session.steps) {
      entry.aiSession = {
        title: session.name || discipline,
        intervals: session.steps.map(step => {
          var zone = step.zone || step.effort || "Z2";
          if (typeof zone === 'number') zone = "Z" + zone;
          if (typeof zone === 'string' && /^\d+$/.test(zone)) zone = "Z" + zone;
          // Templates store between-rep rest as `step.rest` (number, minutes).
          // The legacy seed read `step.restDuration` / `step.restEffort` which
          // don't exist on templates, so first-time edits silently lost the
          // rest period (5 min rest → empty field → saved as no rest).
          const _restMin = (typeof step.rest === "number" ? step.rest : null);
          return {
            name: step.label || step.name || "",
            duration: (step.duration || "") + " min",
            effort: zone,
            reps: step.reps || 1,
            restDuration: _restMin != null ? `${_restMin} min` : "",
            restEffort: "RW",
            ...(step.note ? { note: step.note } : {}),
          };
        })
      };
    }
  }

  // Set type and notes so the editor knows how to render
  const type = { running: "running", cycling: "cycling", swimming: "swimming", strength: "weightlifting" }[discipline] || "general";
  if (!entry.type) entry.type = type;
  if (!entry.notes) entry.notes = entry.sessionName || "";

  // Save the plan key so save can find the entry even if id is lost
  _editPlanKey = { date: dateStr, raceId, discipline, load };

  // Persist all changes in one write
  plan[idx] = entry;
  localStorage.setItem("trainingPlan", JSON.stringify(plan));

  openEditWorkout(entry.id, "trainingPlan");
}

function openEditScheduledWorkout(id) {
  const schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
  const w = schedule.find(x => String(x.id) === String(id));
  if (!w) return;

  // If it has a discipline + load, convert steps to intervals
  if (w.discipline && w.load) {
    const session = (typeof getSessionTemplate === "function")
      ? getSessionTemplate(w.discipline, w.load, w.weekNumber)
      : ((typeof SESSION_DESCRIPTIONS !== 'undefined' && SESSION_DESCRIPTIONS[w.discipline])
          ? SESSION_DESCRIPTIONS[w.discipline][w.load] : null);
    if (session && session.steps && !w.aiSession) {
      w.aiSession = {
        title: session.name || w.discipline,
        intervals: session.steps.map(step => {
          var zone = step.zone || step.effort || "Z2";
          if (typeof zone === 'number') zone = "Z" + zone;
          if (typeof zone === 'string' && /^\d+$/.test(zone)) zone = "Z" + zone;
          // Templates store between-rep rest as `step.rest` (number, minutes).
          // The legacy seed read `step.restDuration` / `step.restEffort` which
          // don't exist on templates, so first-time edits silently lost the
          // rest period (5 min rest → empty field → saved as no rest).
          const _restMin = (typeof step.rest === "number" ? step.rest : null);
          return {
            name: step.label || step.name || "",
            duration: (step.duration || "") + " min",
            effort: zone,
            reps: step.reps || 1,
            restDuration: _restMin != null ? `${_restMin} min` : "",
            restEffort: "RW",
            ...(step.note ? { note: step.note } : {}),
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
  _editPlanKey   = null;
}

// ── Strength row management ───────────────────────────────────────────────────

function _addEditRow(ex) {
  _editRowCount++;
  const id  = _editRowCount;
  const div = document.createElement("div");
  div.className = "ex-row qe-manual-row edit-exercise-row" + (_editIsHiit ? " hiit-row" : "");
  div.id = `edit-row-${id}`;
  const weightVal = typeof _normalizeWeightDisplay === 'function' ? _normalizeWeightDisplay(ex?.weight || '') : (ex?.weight || '');
  const existingPerSet = (ex?.perSet && ex.perSet.length) ? ex.perSet
                       : (ex?.setDetails && ex.setDetails.length) ? ex.setDetails
                       : null;
  const startExpanded = !!existingPerSet;
  const escAttr = (v) => String(v == null ? "" : v).replace(/"/g, "&quot;");
  if (_editIsHiit) {
    div.innerHTML = `
      <div class="ex-row-header">
        <span class="drag-handle" title="Drag to reorder · drop on a row to superset">⠿</span>
        <input type="text" id="edit-ex-${id}" class="ex-row-name" value="${escAttr(ex?.name)}" placeholder="e.g. Burpees, Row 500m" />
        <button type="button" class="ex-row-delete" onclick="removeEditRow(${id})" title="Remove">×</button>
      </div>
      <div class="ex-row-defaults ex-row-defaults--hiit">
        <div class="ex-row-field">
          <label>Reps / Time</label>
          <input type="text" id="edit-reps-${id}" value="${escAttr(ex?.reps)}" placeholder="e.g. 10, 45s, 500m" />
        </div>
        <div class="ex-row-field">
          <label>Weight</label>
          <input type="text" id="edit-wt-${id}" value="${escAttr(weightVal)}" placeholder="optional" />
        </div>
      </div>`;
  } else {
    div.innerHTML = `
      <div class="ex-row-header">
        <span class="drag-handle" title="Drag to reorder · drop on a row to superset">⠿</span>
        <input type="text" id="edit-ex-${id}" class="ex-row-name" value="${escAttr(ex?.name)}" placeholder="e.g. Bench Press" />
        <button type="button" class="ex-row-regen" onclick="regenerateEditRow(${id})" title="Swap for another exercise hitting the same muscle group" aria-label="Regenerate exercise">↻</button>
        <button type="button" class="ex-row-delete" onclick="removeEditRow(${id})" title="Remove">×</button>
      </div>
      <div class="ex-row-defaults">
        <div class="ex-row-field">
          <label>Sets</label>
          <input type="number" id="edit-sets-${id}" min="1" max="99" value="${escAttr(ex?.sets)}" placeholder="3" data-pyr-field="edit:sets:${id}" />
        </div>
        <div class="ex-row-field">
          <label>Reps</label>
          <input type="text" id="edit-reps-${id}" value="${escAttr(ex?.reps)}" placeholder="10" data-pyr-field="edit:default:${id}" />
        </div>
        <div class="ex-row-field">
          <label>Weight (lbs)</label>
          <input type="text" id="edit-wt-${id}" value="${escAttr(weightVal)}" placeholder="lbs" data-pyr-field="edit:default:${id}" />
        </div>
      </div>
      <button type="button" class="ex-row-customize-toggle" id="edit-pyr-toggle-${id}" data-pyr-toggle="edit:${id}">${startExpanded ? "Collapse ▴" : "Customize per set ▾"}</button>
      <div class="ex-pyramid-detail edit-set-details" id="edit-sd-${id}" style="display:${startExpanded ? "" : "none"}"></div>`;
  }
  if (startExpanded) {
    div.dataset.pendingSetDetails = JSON.stringify(existingPerSet);
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
  // If we loaded an exercise that already has per-set data, render those rows
  // now. Otherwise leave the per-set panel collapsed by default.
  if (!_editIsHiit && div.dataset.pendingSetDetails) {
    try {
      const pending = JSON.parse(div.dataset.pendingSetDetails);
      if (Array.isArray(pending) && pending.length) {
        _editRenderSetDetails(id, pending);
      }
    } catch {}
    delete div.dataset.pendingSetDetails;
  }
}

function addEditExerciseRow() { _addEditRow(); }

function removeEditRow(id) {
  const el = document.getElementById(`edit-row-${id}`);
  if (el) el.remove();
}

// Toggle the per-set customization panel for a row. Collapsed by default.
function editTogglePerSet(rowId) {
  const detailsEl = document.getElementById(`edit-sd-${rowId}`);
  const toggle = document.getElementById(`edit-pyr-toggle-${rowId}`);
  if (!detailsEl || !toggle) return;
  // Only treat "none" as hidden; set explicit "block" on expand so the
  // next toggle reliably falls into the collapse branch.
  const isHidden = detailsEl.style.display === "none";
  if (isHidden) {
    detailsEl.style.display = "block";
    toggle.textContent = "Collapse ▴";
    if (!detailsEl.querySelector(".edit-set-row")) {
      editSetCountChanged(rowId);
    }
  } else {
    detailsEl.style.display = "none";
    toggle.textContent = "Customize per set ▾";
  }
}

function _editRenderSetDetails(rowId, details) {
  const el = document.getElementById(`edit-sd-${rowId}`);
  if (!el) return;
  let html = `<div class="ex-pyr-header"><span></span><span>Reps</span><span>Weight</span></div>`;
  details.forEach((d, s) => {
    html += `<div class="edit-set-row ex-pyr-row" id="edit-sr-${rowId}-${s}">
      <span class="ex-pyr-label edit-set-label">Set ${s + 1}</span>
      <input class="ex-pyr-reps qe-edit-reps" id="edit-sd-reps-${rowId}-${s}" value="${d.reps || ""}" placeholder="reps" />
      <input class="ex-pyr-weight qe-weight-input" id="edit-sd-wt-${rowId}-${s}" value="${d.weight || ""}" placeholder="lbs" />
    </div>`;
  });
  el.innerHTML = html;
}

// Rebuild per-set rows to match the current Sets count. Only runs if the
// per-set panel is currently expanded — the panel is collapsed by default.
function editSetCountChanged(rowId) {
  const detailsEl = document.getElementById(`edit-sd-${rowId}`);
  if (!detailsEl || detailsEl.style.display === "none") return;
  const setsInput = document.getElementById(`edit-sets-${rowId}`);
  let numSets = parseInt(setsInput?.value) || 0;
  if (numSets < 1) {
    numSets = parseInt(setsInput?.placeholder) || 3;
    if (setsInput && !setsInput.value) setsInput.value = String(numSets);
  }
  const defaultReps = document.getElementById(`edit-reps-${rowId}`)?.value || "";
  const defaultWeight = document.getElementById(`edit-wt-${rowId}`)?.value || "";
  // Preserve existing values
  const existing = [];
  for (let s = 0; ; s++) {
    const r = document.getElementById(`edit-sd-reps-${rowId}-${s}`);
    if (!r) break;
    existing.push({ reps: r.value, weight: document.getElementById(`edit-sd-wt-${rowId}-${s}`)?.value || "" });
  }
  const details = [];
  for (let s = 0; s < numSets; s++) {
    const prev = existing[s];
    if (prev) {
      details.push(prev);
    } else {
      details.push({ reps: defaultReps, weight: defaultWeight });
    }
  }
  _editRenderSetDetails(rowId, details);
}

// When default reps/weight inputs change, propagate to any empty per-set cells.
// No-op if the per-set panel is collapsed.
function editDefaultsChanged(rowId) {
  const detailsEl = document.getElementById(`edit-sd-${rowId}`);
  if (!detailsEl || detailsEl.style.display === "none") return;
  const defaultReps = document.getElementById(`edit-reps-${rowId}`)?.value || "";
  const defaultWeight = document.getElementById(`edit-wt-${rowId}`)?.value || "";
  for (let s = 0; ; s++) {
    const rInp = document.getElementById(`edit-sd-reps-${rowId}-${s}`);
    if (!rInp) break;
    const wInp = document.getElementById(`edit-sd-wt-${rowId}-${s}`);
    if (!rInp.value) rInp.value = defaultReps;
    if (wInp && !wInp.value) wInp.value = defaultWeight;
  }
  if (!detailsEl.querySelector(".edit-set-row")) editSetCountChanged(rowId);
}

// Read per-set values out of the DOM. Returns null if the panel is collapsed
// or if all rows match the defaults (so the caller can save a flat entry).
function _editReadSetDetails(rowId) {
  const detailsEl = document.getElementById(`edit-sd-${rowId}`);
  if (!detailsEl || detailsEl.style.display === "none") return null;
  const defaultReps = (document.getElementById(`edit-reps-${rowId}`)?.value || "").trim();
  const defaultWeight = (document.getElementById(`edit-wt-${rowId}`)?.value || "").trim();
  const details = [];
  let hasDiff = false;
  for (let s = 0; ; s++) {
    const r = document.getElementById(`edit-sd-reps-${rowId}-${s}`);
    if (!r) break;
    const rv = (r.value || "").trim();
    const wv = (document.getElementById(`edit-sd-wt-${rowId}-${s}`)?.value || "").trim();
    details.push({ reps: rv || defaultReps, weight: wv || defaultWeight });
    if ((rv && rv !== defaultReps) || (wv && wv !== defaultWeight)) hasDiff = true;
  }
  if (!details.length || !hasDiff) return null;
  return details;
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
  div.draggable = true;
  if (iv?.repeatGroup) div.dataset.repeatGroup = iv.repeatGroup;
  if (iv?.groupSets) div.dataset.groupSets = String(iv.groupSets);
  const _trashSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>';
  div.innerHTML = `
    <div class="eiv-header">
      <span class="drag-handle" title="Drag to reorder · drop on a row to group">⠿</span>
      <input type="text" id="edit-ivphase-${id}" class="eiv-phase-input" value="${iv?.name || ""}" placeholder="e.g. Warm-up" />
      <button class="remove-exercise-btn" title="Remove" onclick="removeEditIntervalRow(${id})">${_trashSvg}</button>
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

  // Drag-to-reorder + drop-in-middle grouping
  const container = document.getElementById("edit-interval-rows");
  div.addEventListener("dragstart", e => { _editIvDragEl = div; div.classList.add("drag-active"); e.dataTransfer.effectAllowed = "move"; });
  div.addEventListener("dragend", () => { div.classList.remove("drag-active"); _editIvDragEl = null; _editIvClearHints(); });
  div.addEventListener("dragover", e => {
    if (!_editIvDragEl || _editIvDragEl === div) return;
    e.preventDefault();
    div.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
    const pct = (e.clientY - div.getBoundingClientRect().top) / div.getBoundingClientRect().height;
    if (pct > 0.3 && pct < 0.7) div.classList.add("drag-ss-target");
    else div.classList.add(pct <= 0.3 ? "drag-insert-above" : "drag-insert-below");
  });
  div.addEventListener("dragleave", () => div.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target"));
  div.addEventListener("drop", e => {
    e.preventDefault();
    _editIvClearHints();
    if (!_editIvDragEl || _editIvDragEl === div) return;
    const pct = (e.clientY - div.getBoundingClientRect().top) / div.getBoundingClientRect().height;
    if (pct > 0.3 && pct < 0.7) {
      _editIvGroupRepeat(_editIvDragEl, div);
    } else {
      if (pct <= 0.3) container.insertBefore(_editIvDragEl, div);
      else container.insertBefore(_editIvDragEl, div.nextSibling);
      _editIvEjectIfIsolated(_editIvDragEl);
      _editIvRefreshBadges();
    }
    _editIvDragEl = null;
  });
  if (typeof TouchDrag !== "undefined") {
    TouchDrag.attach(div, container, {
      hintClasses: ["drag-insert-above", "drag-insert-below", "drag-ss-target"],
      rowSelector: ".edit-interval-card",
      handleSelector: ".drag-handle",
      onDrop(dragEl, targetEl, clientY) {
        _editIvClearHints();
        const pct = (clientY - targetEl.getBoundingClientRect().top) / targetEl.getBoundingClientRect().height;
        if (pct > 0.3 && pct < 0.7) _editIvGroupRepeat(dragEl, targetEl);
        else {
          if (pct <= 0.3) container.insertBefore(dragEl, targetEl);
          else container.insertBefore(dragEl, targetEl.nextSibling);
          _editIvEjectIfIsolated(dragEl);
          _editIvRefreshBadges();
        }
      },
    });
  }
  container.appendChild(div);
  if (!_editIvSuppressBadges) _editIvRefreshBadges();
}

let _editIvDragEl = null;
function _editIvClearHints() {
  document.querySelectorAll("#edit-interval-rows .edit-interval-card").forEach(el =>
    el.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target", "drag-active"));
}
function _editIvGroupRepeat(dragEl, targetEl) {
  const container = document.getElementById("edit-interval-rows");
  container.insertBefore(dragEl, targetEl.nextSibling);
  let g = targetEl.dataset.repeatGroup || dragEl.dataset.repeatGroup || "";
  if (!g) {
    const used = new Set(Array.from(container.querySelectorAll(".edit-interval-card")).map(r => r.dataset.repeatGroup).filter(Boolean));
    for (const l of ["A","B","C","D","E","F"]) { if (!used.has(l)) { g = l; break; } }
    if (!g) g = "A";
  }
  targetEl.dataset.repeatGroup = g;
  dragEl.dataset.repeatGroup = g;
  // Set default groupSets immediately so it persists to the save path even if
  // the user never touches the rounds input. Without this, groupSets only gets
  // set on the "change" event, which never fires if the user accepts the default.
  if (!targetEl.dataset.groupSets) targetEl.dataset.groupSets = "3";
  if (!dragEl.dataset.groupSets)   dragEl.dataset.groupSets = "3";
  _editIvRefreshBadges();
}
function _editIvEjectIfIsolated(el) {
  const g = el.dataset.repeatGroup;
  if (!g) return;
  const above = el.previousElementSibling;
  const below = el.nextElementSibling;
  if (!(above && above.dataset.repeatGroup === g) && !(below && below.dataset.repeatGroup === g)) {
    delete el.dataset.repeatGroup; delete el.dataset.groupSets;
  }
}
function _editIvRefreshBadges() {
  const container = document.getElementById("edit-interval-rows");
  if (!container) return;
  const rows = Array.from(container.querySelectorAll(".edit-interval-card"));
  rows.forEach((row, i) => {
    const g = row.dataset.repeatGroup;
    if (!g) return;
    const above = rows[i - 1], below = rows[i + 1];
    if (!(above && above.dataset.repeatGroup === g) && !(below && below.dataset.repeatGroup === g))
      { delete row.dataset.repeatGroup; delete row.dataset.groupSets; }
  });
  const counts = {};
  const seen = new Set();
  rows.forEach(row => {
    row.querySelectorAll(".cp-ss-badge, .cp-ss-sets-wrap").forEach(el => el.remove());
    const g = row.dataset.repeatGroup;
    if (!g) return;
    counts[g] = (counts[g] || 0) + 1;
    const header = row.querySelector(".eiv-header");
    if (!seen.has(g)) {
      seen.add(g);
      const cur = row.dataset.groupSets || "3";
      // Persist the default to dataset so the save path always finds it,
      // even if the user never changes the rounds input.
      if (!row.dataset.groupSets) row.dataset.groupSets = cur;
      const wrap = document.createElement("span");
      wrap.className = "cp-ss-sets-wrap";
      wrap.innerHTML = `<span class="cp-ss-badge" style="cursor:default">${g}</span>` +
        `<input type="number" class="cp-ss-sets-input" min="1" max="20" value="${cur}" title="Rounds" />` +
        `<span class="cp-ss-sets-label">rounds</span>` +
        `<button class="cp-ss-ungroup-btn" title="Ungroup">×</button>`;
      wrap.querySelector("input").addEventListener("change", function () {
        rows.filter(r => r.dataset.repeatGroup === g).forEach(r => r.dataset.groupSets = this.value);
      });
      wrap.querySelector(".cp-ss-ungroup-btn").addEventListener("click", () => {
        rows.filter(r => r.dataset.repeatGroup === g).forEach(r => { delete r.dataset.repeatGroup; delete r.dataset.groupSets; });
        _editIvRefreshBadges();
      });
      header.appendChild(wrap);
    } else {
      const badge = document.createElement("span");
      badge.className = "cp-ss-badge";
      badge.textContent = `${g}${counts[g]}`;
      badge.title = "Click to ungroup";
      badge.addEventListener("click", () => { delete row.dataset.repeatGroup; delete row.dataset.groupSets; _editIvRefreshBadges(); });
      header.appendChild(badge);
    }
  });
}

function addEditIntervalRow() { _addEditIntervalRow(); }

function removeEditIntervalRow(id) {
  const el = document.getElementById(`edit-iv-${id}`);
  if (el) { el.remove(); _editIvRefreshBadges(); }
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

async function saveEditedWorkout() {
  const msg   = document.getElementById("edit-workout-msg");
  const notes = document.getElementById("edit-workout-notes").value.trim();

  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem(_editSource)) || []; } catch {}
  let idx = workouts.findIndex(x => String(x.id) === String(_editWorkoutId));
  // Fallback for plan entries: match by date/raceId/discipline/load if id lookup fails
  if (idx === -1 && _editSource === "trainingPlan" && _editPlanKey) {
    const k = _editPlanKey;
    idx = workouts.findIndex(e => e.date === k.date && e.raceId === k.raceId && e.discipline === k.discipline && e.load === k.load);
  }
  if (idx === -1) { if (msg) msg.textContent = "Workout not found."; return; }

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
      // Repeat-block grouping
      const rowEl = document.getElementById(`edit-iv-${id}`);
      if (rowEl?.dataset.repeatGroup) {
        iv.repeatGroup = rowEl.dataset.repeatGroup;
        if (rowEl.dataset.groupSets) iv.groupSets = parseInt(rowEl.dataset.groupSets) || 3;
      }
      intervals.push(iv);
    });
    // If the user didn't enter any interval rows (e.g. they only
    // changed notes), preserve the original aiSession.intervals
    // instead of wiping it to an empty array. An empty intervals
    // array makes _bodySourceForWorkout return null, which erases
    // the structured body from the Strava share preview and from
    // the day-detail render.
    const prior = workouts[idx].aiSession || {};
    const priorIntervals = Array.isArray(prior.intervals) ? prior.intervals : [];
    const finalIntervals = intervals.length > 0 ? intervals : priorIntervals;
    workouts[idx] = {
      ...workouts[idx],
      notes,
      aiSession: {
        ...prior,
        title: notes || prior.title || "",
        intervals: finalIntervals,
      },
    };
  } else {
    const exercises = [];
    document.querySelectorAll("[id^='edit-ex-']").forEach(inp => {
      const id   = inp.id.replace("edit-ex-", "");
      // Normalise casing at the write boundary. Users type "cable fly"
      // lowercase and read back "Cable Fly" everywhere else; keeping
      // everything in Title Case downstream means card renderers don't
      // need to compensate.
      const rawName = inp.value.trim();
      const name = (typeof _toExerciseTitleCase === "function") ? _toExerciseTitleCase(rawName) : rawName;
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
        const perSet = _editReadSetDetails(id);
        if (perSet) {
          ex.perSet = perSet;
          ex.setDetails = perSet; // legacy alias for existing readers
        }
      }
      if (row?.dataset.ssId) ex.supersetId = row.dataset.ssId;
      exercises.push(ex);
    });
    // Preserve original exercises if the user didn't enter any in
    // the edit modal — same reasoning as the cardio branch above.
    const priorEx = Array.isArray(workouts[idx].exercises) ? workouts[idx].exercises : [];
    const finalEx = exercises.length > 0 ? exercises : priorEx;
    workouts[idx] = { ...workouts[idx], notes, exercises: finalEx };
  }

  localStorage.setItem(_editSource, JSON.stringify(workouts));
  // Flush to Supabase synchronously so a cross-device view (or a refresh
  // on this device) picks up the edit immediately. The non-flushed
  // syncKey path debounces 200ms and relies on the page not being torn
  // down before the timer fires — not good enough for user-initiated
  // saves where they expect "Saved!" to mean "actually saved".
  if (typeof DB !== 'undefined' && DB.flushKey) {
    try {
      if (_editSource === "workouts") await DB.flushKey('workouts');
      else if (_editSource === "workoutSchedule") await DB.flushKey('workoutSchedule');
      else if (_editSource === "trainingPlan") await DB.flushKey('trainingPlan');
    } catch (e) { console.warn('[IronZ] edit save flush failed', e); }
  }

  // BUGFIX: post-save renders are best-effort. A throw inside any of
  // these (e.g. renderStats hitting unexpected exercise shape after a
  // superset edit) used to abort the function before the "Saved!"
  // confirmation, so the modal stayed open and the user thought save
  // was broken — even though localStorage had already persisted the
  // change. Wrap each in try/catch so the save always completes.
  try { if (typeof renderWorkoutHistory === "function") renderWorkoutHistory(); } catch (e) { console.warn('[IronZ] renderWorkoutHistory after edit failed', e); }
  try { if (typeof renderCalendar       === "function") renderCalendar();       } catch (e) { console.warn('[IronZ] renderCalendar after edit failed', e); }
  try {
    if (typeof selectedDate !== "undefined" && selectedDate) {
      if (typeof renderDayDetail === "function") renderDayDetail(selectedDate);
    }
  } catch (e) { console.warn('[IronZ] renderDayDetail after edit failed', e); }
  try { if (typeof renderStats === "function") renderStats(); } catch (e) { console.warn('[IronZ] renderStats after edit failed', e); }

  msg.style.color = "var(--color-success)";
  msg.textContent = "Saved!";
  setTimeout(() => closeEditWorkout(), 600);
}
