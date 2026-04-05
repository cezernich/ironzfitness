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
  const _cardioTypes = ["running", "cycling", "swimming", "triathlon", "general"];
  _editIsCardio = !!(w.aiSession) || (_cardioTypes.includes(w.type) && !(w.exercises && w.exercises.length));
  _editIsHiit = w.type === "hiit" || !!w.hiitMeta;

  const _cardioPlaceholders = {
    running: "e.g. Felt good, held Z3 the whole tempo block",
    cycling: "e.g. Strong ride, averaged 220W",
    swimming: "e.g. Good form, focused on catch",
    triathlon: "e.g. Brick felt solid, transitions smooth",
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
  if (_editIsHiit) {
    div.innerHTML = `
      <div><label>Exercise</label>
        <input type="text" id="edit-ex-${id}" value="${ex?.name || ""}" placeholder="e.g. Burpees, Row 500m" /></div>
      <div class="edit-summary-fields" id="edit-summary-${id}"><label>Reps / Time / Distance</label>
        <input type="text" id="edit-reps-${id}" value="${ex?.reps || ""}" placeholder="e.g. 10, 45s, 500m" /></div>
      <div class="edit-summary-fields" id="edit-summary-wt-${id}"><label>Weight</label>
        <input type="text" id="edit-wt-${id}" value="${weightVal}" placeholder="optional" /></div>
      <button class="remove-exercise-btn" title="Remove" onclick="removeEditRow(${id})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  } else {
    div.innerHTML = `
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
  document.getElementById("edit-exercise-rows").appendChild(div);
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
    if (/mi|km|m\b|yd/i.test(durStr)) {
      initMode = "distance";
      initDist = durStr.match(/[\d.]+/)?.[0] || "";
    } else {
      initMin = durStr.match(/[\d.]+/)?.[0] || "";
    }
  }
  const div = document.createElement("div");
  div.className = "qe-manual-row qe-cardio-row edit-exercise-row";
  div.id = `edit-iv-${id}`;
  div.dataset.durMode = initMode;
  div.innerHTML = `
    <div><label>Phase</label>
      <input type="text" id="edit-ivphase-${id}" value="${iv?.name || ""}" placeholder="e.g. Warm-up" /></div>
    <div class="qe-dur-col">
      <div class="qe-dur-toggle">
        <button class="qe-dur-mode-btn${initMode==="distance"?" active":""}" data-mode="distance"
          onclick="setEditIntervalMode(${id},'distance')">Distance</button>
        <button class="qe-dur-mode-btn${initMode==="time"?" active":""}" data-mode="time"
          onclick="setEditIntervalMode(${id},'time')">Time</button>
      </div>
      <div id="edit-dist-wrap-${id}" style="${initMode==="distance"?"":"display:none"}">
        <input type="number" id="edit-ivdist-${id}" value="${initDist}" placeholder="e.g. 5" min="0" step="0.1" style="width:70px" />
        <span class="qe-unit-label">${unit}</span>
      </div>
      <div id="edit-time-wrap-${id}" style="${initMode==="time"?"":"display:none"}">
        <input type="number" id="edit-ivmin-${id}" value="${initMin}" placeholder="e.g. 10" min="0" style="width:70px" />
        <span class="qe-unit-label">min</span>
      </div>
    </div>
    <div><label>Zone</label>
      <select id="edit-iveffort-${id}">
        <option value="RW" ${eff==="RW"?"selected":""}>Rest / Walk</option>
        <option value="Z1" ${eff==="Z1"||eff==="Easy"?"selected":""}>Z1 Recovery</option>
        <option value="Z2" ${eff==="Z2"||eff==="Moderate"?"selected":""}>Z2 Aerobic</option>
        <option value="Z3" ${eff==="Z3"?"selected":""}>Z3 Tempo</option>
        <option value="Z4" ${eff==="Z4"||eff==="Hard"?"selected":""}>Z4 Threshold</option>
        <option value="Z5" ${eff==="Z5"||eff==="Max"?"selected":""}>Z5 VO2 Max</option>
        <option value="Z6" ${eff==="Z6"?"selected":""}>Z6 Max Sprint</option>
      </select></div>
    <div style="flex:2"><label>Details</label>
      <input type="text" id="edit-ivdetails-${id}" value="${iv?.details || ""}" placeholder="e.g. 5:30/km, HR under 145" /></div>
    <button class="remove-exercise-btn" title="Remove" onclick="removeEditIntervalRow(${id})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
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

  const apiKey = (typeof APP_CONFIG !== "undefined") ? APP_CONFIG.anthropicApiKey : "";
  if (!apiKey || apiKey === "YOUR_ANTHROPIC_API_KEY") {
    nameEl.value = "";
    nameEl.placeholder = "Type replacement exercise";
    nameEl.focus();
    return;
  }

  const btn = nameEl.closest(".edit-exercise-row").querySelector(".swap-btn");
  if (btn) { btn.textContent = "…"; btn.disabled = true; }

  try {
    let profile = {};
    try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}
    const level = profile.fitnessLevel || "intermediate";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Suggest 3 alternative exercises to replace "${current}" for a ${level} athlete. Return ONLY a JSON array of 3 strings, no markdown: ["Exercise 1","Exercise 2","Exercise 3"]`
        }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
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
      intervals.push({
        name,
        duration: _editIntervalRowDuration(id),
        effort:   document.getElementById(`edit-iveffort-${id}`)?.value  || "Z2",
        details:  document.getElementById(`edit-ivdetails-${id}`)?.value || "",
      });
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
