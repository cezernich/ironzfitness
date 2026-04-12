// live-tracker.js — In-Workout Execution Mode

// ── State ────────────────────────────────────────────────────────────────────

let _liveTracker = null; // { sessionId, dateStr, type, steps, exercises, currentStep, startTime, stepStart, paused, elapsed, restTimer, sets }
let _liveTimerInterval = null;
let _liveWakeLock = null;

function _getLivePrefs() {
  try { return JSON.parse(localStorage.getItem("liveTrackerPrefs")) || {}; } catch { return {}; }
}
function _setLivePref(key, val) {
  const p = _getLivePrefs();
  p[key] = val;
  localStorage.setItem("liveTrackerPrefs", JSON.stringify(p));
}

// ── Launch ───────────────────────────────────────────────────────────────────

function startLiveWorkout(sessionId, dateStr, type, stepsJson, exercisesJson) {
  if (typeof trackEvent === "function") trackEvent("workout_started", { type, date: dateStr });
  const steps = stepsJson ? JSON.parse(stepsJson) : null;
  const exercises = exercisesJson ? JSON.parse(exercisesJson) : null;
  const isHyrox = type === "hyrox" && exercises && exercises.length > 0;
  const isStrength = !isHyrox && !!(exercises && exercises.length > 0 && !steps);

  _liveTracker = {
    sessionId,
    dateStr,
    type,
    steps: steps || [],
    exercises: exercises || [],
    isStrength,
    isHyrox,
    currentStep: 0,
    startTime: Date.now(),
    stepStart: Date.now(),
    paused: false,
    elapsed: 0,
    pausedAt: null,
    // For strength: track completed sets per exercise
    // Pre-fill per-set reps/weight from perSet (preferred) or legacy setDetails.
    sets: isStrength ? exercises.map(ex => {
      const numSets = parseInt(String(ex.sets).match(/^\d+/)?.[0]) || 3;
      const details = (ex.perSet && ex.perSet.length) ? ex.perSet
                    : (ex.setDetails && ex.setDetails.length) ? ex.setDetails
                    : null;
      return Array.from({ length: numSets }, (_, si) => {
        const sd = details && details[si];
        return { done: false, reps: sd ? sd.reps : (ex.reps || ""), weight: sd ? sd.weight : (ex.weight || "") };
      });
    }) : [],
    // Cached superset groupings (computed once at start)
    _groups: null,
    // For Hyrox: track split time per station/run
    stationTimes: isHyrox ? exercises.map(() => null) : [],
    currentExercise: 0,
    currentSet: 0,
    restCountdown: 0,
    inRest: false,
  };

  if (isStrength) _liveTracker._groups = _computeLiveGroups();

  _requestWakeLock();
  _renderLiveTracker();
  _startLiveTimer();
}

// ── Superset groupings ───────────────────────────────────────────────────────
//
// Consecutive exercises sharing the same supersetId (or supersetGroup) form one
// superset — the user performs them as alternating rounds (A1 → B1 → rest → A2 → B2).
// A lone exercise with a superset tag falls back to a single-exercise group.

function _computeLiveGroups() {
  const t = _liveTracker;
  if (!t || !t.exercises) return [];
  const gidOf = ex => ex.supersetId || ex.supersetGroup || null;
  const groups = [];
  let i = 0;
  while (i < t.exercises.length) {
    const gid = gidOf(t.exercises[i]);
    if (gid) {
      const indices = [];
      while (i < t.exercises.length && gidOf(t.exercises[i]) === gid) {
        indices.push(i);
        i++;
      }
      if (indices.length >= 2) {
        const rounds = Math.max(...indices.map(ix => (t.sets[ix] || []).length));
        groups.push({ kind: "superset", gid, indices, rounds });
        continue;
      }
      groups.push({ kind: "single", index: indices[0] });
    } else {
      groups.push({ kind: "single", index: i });
      i++;
    }
  }
  return groups;
}

function _findLiveGroupContaining(exIdx) {
  const groups = _liveTracker?._groups;
  if (!groups) return null;
  for (const g of groups) {
    if (g.kind === "single" && g.index === exIdx) return g;
    if (g.kind === "superset" && g.indices.includes(exIdx)) return g;
  }
  return null;
}

// ── Timer ────────────────────────────────────────────────────────────────────

function _startLiveTimer() {
  if (_liveTimerInterval) clearInterval(_liveTimerInterval);
  _liveTimerInterval = setInterval(() => {
    if (!_liveTracker || _liveTracker.paused) return;
    _liveTracker.elapsed = Date.now() - _liveTracker.startTime;

    // Rest countdown
    if (_liveTracker.inRest && _liveTracker.restCountdown > 0) {
      _liveTracker.restCountdown = Math.max(0, _liveTracker.restEndTime - Date.now());
      if (_liveTracker.restCountdown <= 0) {
        _liveTracker.inRest = false;
        _liveTracker.restCountdown = 0;
      }
    }

    _updateLiveTimerDisplay();
  }, 250);
}

function _updateLiveTimerDisplay() {
  if (!_liveTracker) return;
  const timerEl = document.getElementById("live-timer");
  if (timerEl) timerEl.textContent = _formatMs(_liveTracker.elapsed);

  const restEl = document.getElementById("live-rest-timer");
  if (restEl) {
    if (_liveTracker.inRest && _liveTracker.restCountdown > 0) {
      restEl.style.display = "";
      restEl.textContent = `Rest: ${Math.ceil(_liveTracker.restCountdown / 1000)}s`;
    } else {
      restEl.style.display = "none";
    }
  }

  // Update step timer for endurance
  if (!_liveTracker.isStrength && !_liveTracker.isHyrox) {
    const stepTimerEl = document.getElementById("live-step-timer");
    if (stepTimerEl && !_liveTracker.paused) {
      const stepElapsed = Date.now() - _liveTracker.stepStart;
      stepTimerEl.textContent = _formatMs(stepElapsed);
    }
  }

  // Update Hyrox station timer
  if (_liveTracker.isHyrox) {
    const hxTimerEl = document.getElementById("live-hyrox-station-timer");
    if (hxTimerEl && !_liveTracker.paused) {
      const stationElapsed = Date.now() - _liveTracker.stepStart;
      hxTimerEl.textContent = _formatMs(stationElapsed);
    }
  }

  // Progress bar
  const progEl = document.getElementById("live-progress-fill");
  if (progEl) {
    const pct = _liveTracker.isHyrox ? _getHyroxProgress() : _liveTracker.isStrength ? _getStrengthProgress() : _getEnduranceProgress();
    progEl.style.width = `${Math.min(pct, 100)}%`;
  }
}

function _formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Progress ─────────────────────────────────────────────────────────────────

function _getStrengthProgress() {
  if (!_liveTracker?.sets?.length) return 0;
  let done = 0, total = 0;
  _liveTracker.sets.forEach(exSets => {
    exSets.forEach(s => { total++; if (s.done) done++; });
  });
  return total > 0 ? (done / total) * 100 : 0;
}

function _getEnduranceProgress() {
  if (!_liveTracker?.steps?.length) return 0;
  const totalMin = _liveTracker.steps.reduce((s, st) => {
    const stepMin = st.reps ? (st.duration * st.reps + (st.rest || 0) * (st.reps - 1)) : st.duration;
    return s + stepMin;
  }, 0);
  const elapsedMin = _liveTracker.elapsed / 60000;
  return totalMin > 0 ? (elapsedMin / totalMin) * 100 : 0;
}

function _getHyroxProgress() {
  if (!_liveTracker?.exercises?.length) return 0;
  const total = _liveTracker.exercises.length;
  const done = _liveTracker.stationTimes.filter(t => t !== null).length;
  // Current station partial progress
  const partial = done < total ? 0.5 : 0;
  return ((done + partial) / total) * 100;
}

// ── Render ───────────────────────────────────────────────────────────────────

function _renderLiveTracker() {
  // Remove existing
  let overlay = document.getElementById("live-tracker-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "live-tracker-overlay";
  overlay.className = "live-tracker-overlay";

  const t = _liveTracker;
  const body = t.isHyrox ? _buildHyroxView() : t.isStrength ? _buildStrengthView() : _buildEnduranceView();
  const prefs = _getLivePrefs();
  const hideTimer = prefs.hideTimer || false;
  const hideRest = prefs.hideRestTimer || false;

  overlay.innerHTML = `
    <div class="live-tracker">
      <div class="live-tracker-header">
        <div class="live-header-top">
          <button class="live-exit-btn" onclick="_exitLiveWorkout()" title="Exit without saving"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg></button>
          <span class="live-timer" id="live-timer" style="${hideTimer ? "display:none" : ""}">${_formatMs(t.elapsed)}</span>
          <div class="live-header-btns">
            <button class="live-btn-settings" onclick="_toggleLiveSettings()" title="Settings">${typeof ICONS !== "undefined" && ICONS.settings ? ICONS.settings : "&#9881;"}</button>
            <button class="live-btn-pause" onclick="_toggleLivePause()">${t.paused ? "Resume" : "Pause"}</button>
            <button class="live-btn-finish" onclick="_finishLiveWorkout()">Finish</button>
          </div>
        </div>
        <div class="live-settings-panel" id="live-settings-panel" style="display:none">
          <label class="live-settings-toggle">
            <input type="checkbox" ${hideTimer ? "checked" : ""} onchange="_setLivePref('hideTimer',this.checked);document.getElementById('live-timer').style.display=this.checked?'none':''">
            <span>Hide elapsed timer</span>
          </label>
          <label class="live-settings-toggle">
            <input type="checkbox" ${hideRest ? "checked" : ""} onchange="_setLivePref('hideRestTimer',this.checked);_applyRestTimerPref(this.checked)">
            <span>Disable rest timer</span>
          </label>
        </div>
        <div class="live-progress-bar">
          <div class="live-progress-fill" id="live-progress-fill" style="width:0%"></div>
        </div>
        <div class="live-rest-timer" id="live-rest-timer" style="display:none"></div>
      </div>
      <div class="live-tracker-body" id="live-tracker-body">
        ${body}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
}

function _buildStrengthView() {
  const t = _liveTracker;
  const groups = t._groups || _computeLiveGroups();
  let html = "";

  for (const g of groups) {
    if (g.kind === "single") {
      html += _buildLiveSingleExerciseCard(g.index);
    } else {
      html += _buildLiveSupersetCard(g);
    }
  }

  return html;
}

function _buildLiveSingleExerciseCard(ei) {
  const t = _liveTracker;
  const ex = t.exercises[ei];
  const sets = t.sets[ei] || [];
  const allDone = sets.every(s => s.done);
  return `
    <div class="live-exercise${allDone ? " live-exercise--done" : ""}${ei === t.currentExercise ? " live-exercise--active" : ""}" id="live-ex-${ei}">
      <div class="live-exercise-header" onclick="_toggleLiveExercise(${ei})">
        <span class="live-exercise-name">${_escLiveHtml(ex.name)}</span>
        <span class="live-exercise-target">${ex.sets || "3"} x ${ex.reps || ""} ${ex.weight ? "@ " + ex.weight : ""}</span>
        ${allDone ? '<span class="live-done-check">&#10003;</span>' : ""}
        ${!allDone ? `<button class="live-swap-btn" onclick="_swapLiveExercise(${ei})" title="Swap exercise">&#8644;</button>` : ""}
      </div>
      <div class="live-sets-grid" id="live-sets-${ei}">
        <div class="live-sets-header">
          <span>Set</span><span>Reps</span><span>Weight</span><span></span>
        </div>
        ${sets.map((s, si) => `
          <div class="live-set-row${s.done ? " live-set--done" : ""}" id="live-set-${ei}-${si}">
            <span class="live-set-num">${si + 1}</span>
            <input class="live-set-input" type="text" inputmode="numeric" value="${s.reps}" id="live-reps-${ei}-${si}" placeholder="reps" ${s.done ? "disabled" : ""} />
            <input class="live-set-input" type="text" value="${s.weight}" id="live-wt-${ei}-${si}" placeholder="lbs" ${s.done ? "disabled" : ""} />
            <button class="live-set-btn${s.done ? " live-set-btn--done" : ""}" onclick="_logLiveSet(${ei},${si})">${s.done ? "&#10003;" : "Log"}</button>
          </div>
        `).join("")}
      </div>
    </div>`;
}

function _buildLiveSupersetCard(g) {
  const t = _liveTracker;
  const letters = ["A", "B", "C", "D", "E", "F"];
  const members = g.indices.map(ix => t.exercises[ix]);
  const allDone = g.indices.every(ix => (t.sets[ix] || []).every(s => s.done));
  const summary = members.map((ex, k) => `${letters[k] || "?"}: ${_escLiveHtml(ex.name)}`).join(" · ");

  let roundsHtml = "";
  for (let r = 0; r < g.rounds; r++) {
    const roundDone = g.indices.every(ix => !!t.sets[ix]?.[r]?.done);
    let rowsHtml = "";
    g.indices.forEach((ix, k) => {
      const s = t.sets[ix]?.[r];
      if (!s) return;
      const ex = t.exercises[ix];
      const target = `${ex.reps || "—"}${ex.weight ? " @ " + _escLiveHtml(ex.weight) : ""}`;
      rowsHtml += `
        <div class="live-superset-row${s.done ? " live-set--done" : ""}" id="live-set-${ix}-${r}">
          <span class="live-superset-letter">${letters[k] || "?"}</span>
          <div class="live-superset-ex-info">
            <span class="live-superset-ex-name">${_escLiveHtml(ex.name)}</span>
            <span class="live-superset-ex-target">Target: ${target}</span>
          </div>
          <input class="live-set-input" type="text" inputmode="numeric" value="${s.reps}" id="live-reps-${ix}-${r}" placeholder="reps" ${s.done ? "disabled" : ""} />
          <input class="live-set-input" type="text" value="${s.weight}" id="live-wt-${ix}-${r}" placeholder="lbs" ${s.done ? "disabled" : ""} />
          <button class="live-set-btn${s.done ? " live-set-btn--done" : ""}" onclick="_logLiveSet(${ix},${r})">${s.done ? "&#10003;" : "Log"}</button>
        </div>`;
    });
    roundsHtml += `
      <div class="live-superset-round${roundDone ? " live-superset-round--done" : ""}">
        <div class="live-superset-round-label">Round ${r + 1} of ${g.rounds}</div>
        ${rowsHtml}
      </div>`;
  }

  return `
    <div class="live-exercise live-superset-group${allDone ? " live-exercise--done" : ""}" id="live-ss-${g.gid}">
      <div class="live-exercise-header live-superset-header">
        <span class="live-superset-badge">SS</span>
        <span class="live-exercise-name">Superset · ${members.length} exercises</span>
        <span class="live-exercise-target">${g.rounds} round${g.rounds !== 1 ? "s" : ""}</span>
        ${allDone ? '<span class="live-done-check">&#10003;</span>' : ""}
      </div>
      <div class="live-superset-members">${summary}</div>
      <div class="live-superset-rounds">
        ${roundsHtml}
      </div>
    </div>`;
}

function _buildEnduranceView() {
  const t = _liveTracker;
  const step = t.steps[t.currentStep];
  if (!step) return '<div class="live-complete-msg">All steps complete!</div>';

  const SESSION_TYPE_LABELS_LOCAL = { warmup: "WARM-UP", main: "MAIN SET", cooldown: "COOL-DOWN" };
  const typeLabel = SESSION_TYPE_LABELS_LOCAL[step.type] || step.type?.toUpperCase() || "";

  let durationText;
  if (step.reps) {
    durationText = `${step.reps} x ${step.duration} min`;
    if (step.rest) durationText += ` (${step.rest} min rest)`;
  } else {
    durationText = `${step.duration} min`;
  }

  const stepIdx = t.currentStep;
  const totalSteps = t.steps.length;

  return `
    <div class="live-endurance-step">
      <div class="live-step-counter">Step ${stepIdx + 1} of ${totalSteps}</div>
      <div class="live-step-type live-step-type--z${step.zone || 2}">${typeLabel}</div>
      <div class="live-step-zone">Zone ${step.zone || 2}</div>
      <div class="live-step-duration-target">${durationText}</div>
      <div class="live-step-label">${step.label}</div>
      <div class="live-step-timer" id="live-step-timer">${_formatMs(Date.now() - t.stepStart)}</div>
      <div class="live-step-nav">
        ${stepIdx > 0 ? `<button class="live-btn-step" onclick="_liveStepPrev()">Prev</button>` : `<span></span>`}
        ${stepIdx < totalSteps - 1 ? `<button class="live-btn-step live-btn-step--next" onclick="_liveStepNext()">Next Step</button>` : `<button class="live-btn-step live-btn-step--next" onclick="_finishLiveWorkout()">Finish</button>`}
      </div>
    </div>
    <div class="live-step-list">
      ${t.steps.map((s, i) => `
        <div class="live-step-item${i === stepIdx ? " live-step-item--active" : ""}${i < stepIdx ? " live-step-item--done" : ""}" onclick="_liveGoToStep(${i})">
          <span class="live-step-item-num">${i + 1}</span>
          <span class="live-step-item-label">${s.label?.substring(0, 50) || "Step"}</span>
          <span class="live-step-item-dur">${s.duration}m</span>
        </div>
      `).join("")}
    </div>`;
}

function _buildHyroxView() {
  const t = _liveTracker;
  const idx = t.currentStep;
  const total = t.exercises.length;
  const current = t.exercises[idx];
  if (!current) return '<div class="live-complete-msg">All stations complete!</div>';

  const isRun = /^run\s/i.test(current.name);
  const stationElapsed = Date.now() - t.stepStart;

  return `
    <div class="live-hyrox-step">
      <div class="live-step-counter">Station ${idx + 1} of ${total}</div>
      <div class="live-hyrox-station-type${isRun ? " live-hyrox-run" : " live-hyrox-station"}">${isRun ? "RUN" : "STATION"}</div>
      <div class="live-hyrox-station-name">${_escLiveHtml(current.name)}</div>
      <div class="live-hyrox-station-detail">${_escLiveHtml(current.reps || "")}${current.weight ? " @ " + _escLiveHtml(current.weight) : ""}</div>
      <div class="live-hyrox-station-timer" id="live-hyrox-station-timer">${_formatMs(stationElapsed)}</div>
      <div class="live-step-nav">
        ${idx > 0 ? `<button class="live-btn-step" onclick="_liveHyroxPrev()">Prev</button>` : `<span></span>`}
        ${idx < total - 1 ? `<button class="live-btn-step live-btn-step--next" onclick="_liveHyroxNext()">Next Station</button>` : `<button class="live-btn-step live-btn-step--next" onclick="_finishLiveWorkout()">Finish</button>`}
      </div>
    </div>
    <div class="live-step-list">
      ${t.exercises.map((ex, i) => {
        const done = t.stationTimes[i] !== null;
        const timeStr = done ? _formatMs(t.stationTimes[i]) : "";
        return `
          <div class="live-step-item${i === idx ? " live-step-item--active" : ""}${done ? " live-step-item--done" : ""}" onclick="_liveHyroxGoTo(${i})">
            <span class="live-step-item-num">${i + 1}</span>
            <span class="live-step-item-label">${_escLiveHtml(ex.name)}</span>
            <span class="live-step-item-dur">${done ? timeStr : ""}</span>
          </div>`;
      }).join("")}
    </div>`;
}

// ── Hyrox Navigation ────────────────────────────────────────────────────────

function _liveHyroxNext() {
  if (!_liveTracker || _liveTracker.currentStep >= _liveTracker.exercises.length - 1) return;
  // Record split time for current station
  const elapsed = Date.now() - _liveTracker.stepStart;
  _liveTracker.stationTimes[_liveTracker.currentStep] = elapsed;
  // Advance
  _liveTracker.currentStep++;
  _liveTracker.stepStart = Date.now();
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildHyroxView();
}

function _liveHyroxPrev() {
  if (!_liveTracker || _liveTracker.currentStep <= 0) return;
  // Record current station time before going back
  const elapsed = Date.now() - _liveTracker.stepStart;
  _liveTracker.stationTimes[_liveTracker.currentStep] = elapsed;
  _liveTracker.currentStep--;
  _liveTracker.stepStart = Date.now();
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildHyroxView();
}

function _liveHyroxGoTo(idx) {
  if (!_liveTracker || idx < 0 || idx >= _liveTracker.exercises.length) return;
  // Record current station time
  const elapsed = Date.now() - _liveTracker.stepStart;
  _liveTracker.stationTimes[_liveTracker.currentStep] = elapsed;
  _liveTracker.currentStep = idx;
  _liveTracker.stepStart = Date.now();
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildHyroxView();
}

// ── Interactions ─────────────────────────────────────────────────────────────

function _toggleLiveSettings() {
  const panel = document.getElementById("live-settings-panel");
  if (panel) panel.style.display = panel.style.display === "none" ? "" : "none";
}

function _applyRestTimerPref(disabled) {
  if (!_liveTracker) return;
  if (disabled) {
    _liveTracker.inRest = false;
    _liveTracker.restCountdown = 0;
    const restEl = document.getElementById("live-rest-timer");
    if (restEl) restEl.style.display = "none";
  }
}

function _toggleLivePause() {
  if (!_liveTracker) return;
  if (_liveTracker.paused) {
    // Resume
    const pauseDuration = Date.now() - _liveTracker.pausedAt;
    _liveTracker.startTime += pauseDuration;
    _liveTracker.stepStart += pauseDuration;
    if (_liveTracker.inRest) _liveTracker.restEndTime += pauseDuration;
    _liveTracker.paused = false;
    _liveTracker.pausedAt = null;
  } else {
    _liveTracker.paused = true;
    _liveTracker.pausedAt = Date.now();
  }
  _renderLiveTracker();
}

function _toggleLiveExercise(idx) {
  _liveTracker.currentExercise = idx;
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildStrengthView();
}

function _logLiveSet(exIdx, setIdx) {
  if (!_liveTracker) return;
  const set = _liveTracker.sets[exIdx]?.[setIdx];
  if (!set) return;

  if (set.done) {
    // Undo
    set.done = false;
    set.reps = document.getElementById(`live-reps-${exIdx}-${setIdx}`)?.value || set.reps;
    set.weight = document.getElementById(`live-wt-${exIdx}-${setIdx}`)?.value || set.weight;
    // Cancel rest timer
    _liveTracker.inRest = false;
    _liveTracker.restCountdown = 0;
  } else {
    // Log the set
    set.reps = document.getElementById(`live-reps-${exIdx}-${setIdx}`)?.value || set.reps;
    set.weight = document.getElementById(`live-wt-${exIdx}-${setIdx}`)?.value || set.weight;
    set.done = true;

    // Start rest timer unless disabled. Supersets rest only after the full round
    // (all exercises in the group at this round index are logged) and use a
    // shorter default (60s vs 90s for normal exercises).
    if (!_getLivePrefs().hideRestTimer) {
      const group = _findLiveGroupContaining(exIdx);
      let restMs = 90000;
      let shouldRest = true;
      if (group && group.kind === "superset") {
        const roundComplete = group.indices.every(ix => !!_liveTracker.sets[ix]?.[setIdx]?.done);
        shouldRest = roundComplete;
        restMs = 60000;
      }
      if (shouldRest) {
        _liveTracker.inRest = true;
        _liveTracker.restCountdown = restMs;
        _liveTracker.restEndTime = Date.now() + restMs;
      }
    }
  }

  // Re-render the body
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildStrengthView();
}

function _liveStepNext() {
  if (!_liveTracker || _liveTracker.currentStep >= _liveTracker.steps.length - 1) return;
  _liveTracker.currentStep++;
  _liveTracker.stepStart = Date.now();
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildEnduranceView();
}

function _liveStepPrev() {
  if (!_liveTracker || _liveTracker.currentStep <= 0) return;
  _liveTracker.currentStep--;
  _liveTracker.stepStart = Date.now();
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildEnduranceView();
}

function _liveGoToStep(idx) {
  if (!_liveTracker || idx < 0 || idx >= _liveTracker.steps.length) return;
  _liveTracker.currentStep = idx;
  _liveTracker.stepStart = Date.now();
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildEnduranceView();
}

// ── Finish ───────────────────────────────────────────────────────────────────

function _finishLiveWorkout() {
  if (!_liveTracker) return;
  const t = _liveTracker;

  // Check if there are unlogged sets
  let hasUnlogged = false;
  if (t.isStrength) {
    t.exercises.forEach((ex, ei) => {
      const sets = t.sets[ei] || [];
      if (sets.some(s => !s.done)) hasUnlogged = true;
    });
  }

  if (t.isHyrox) {
    // Record final station time if not already captured
    if (t.stationTimes[t.currentStep] === null) {
      t.stationTimes[t.currentStep] = Date.now() - t.stepStart;
    }
    _showHyroxFinishModal();
  } else if (hasUnlogged) {
    _showFinishChoiceModal();
  } else if (!t.isStrength) {
    _showEnduranceFinishModal();
  } else {
    _commitLiveWorkout(false);
  }
}

function _showHyroxFinishModal() {
  if (!_liveTracker) return;
  const t = _liveTracker;

  // Calculate totals
  let totalRunMs = 0, totalStationMs = 0;
  const rows = t.exercises.map((ex, i) => {
    const ms = t.stationTimes[i] || 0;
    const isRun = /^run\s/i.test(ex.name);
    if (isRun) totalRunMs += ms;
    else totalStationMs += ms;
    return `<tr class="${isRun ? "hyrox-result-run" : "hyrox-result-station"}">
      <td>${_escLiveHtml(ex.name)}</td>
      <td>${_escLiveHtml(ex.reps || "")}</td>
      <td style="font-variant-numeric:tabular-nums;text-align:right">${_formatMs(ms)}</td>
    </tr>`;
  }).join("");

  const totalMs = t.elapsed;

  let overlay = document.getElementById("live-hyrox-finish");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "live-hyrox-finish";
  overlay.className = "quick-entry-overlay is-open";
  overlay.style.cssText = "display:flex;z-index:10001";
  overlay.onclick = function(e) { if (e.target === overlay) return; };

  overlay.innerHTML = `
    <div class="quick-entry-modal" style="max-width:420px;padding:24px;max-height:90vh;overflow-y:auto">
      <h3 style="margin:0 0 4px">Hyrox Results</h3>
      <div class="hyrox-result-total" style="font-size:1.8rem;font-weight:800;font-variant-numeric:tabular-nums;margin-bottom:12px">${_formatMs(totalMs)}</div>
      <div class="hyrox-result-split" style="display:flex;gap:16px;margin-bottom:16px">
        <div style="flex:1;text-align:center;padding:8px;border-radius:8px;background:rgba(59,130,246,0.12)">
          <div style="font-size:0.75rem;opacity:0.7;margin-bottom:2px">Running</div>
          <div style="font-size:1.1rem;font-weight:700;font-variant-numeric:tabular-nums">${_formatMs(totalRunMs)}</div>
        </div>
        <div style="flex:1;text-align:center;padding:8px;border-radius:8px;background:rgba(245,158,11,0.12)">
          <div style="font-size:0.75rem;opacity:0.7;margin-bottom:2px">Stations</div>
          <div style="font-size:1.1rem;font-weight:700;font-variant-numeric:tabular-nums">${_formatMs(totalStationMs)}</div>
        </div>
      </div>
      <table class="exercise-table" style="margin-bottom:16px">
        <thead><tr><th>Station</th><th>Distance</th><th style="text-align:right">Time</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button class="btn-primary" style="width:100%" onclick="_commitHyroxWorkout()">Save Workout</button>
    </div>
  `;

  document.body.appendChild(overlay);
}

function _commitHyroxWorkout() {
  document.getElementById("live-hyrox-finish")?.remove();
  _commitLiveWorkout(false);
}

function _showEnduranceFinishModal() {
  if (!_liveTracker) return;
  const t = _liveTracker;
  const isCycling = t.type === "cycling" || t.type === "bike";
  const unit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";

  let overlay = document.getElementById("live-endurance-finish");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "live-endurance-finish";
  overlay.className = "quick-entry-overlay is-open";
  overlay.style.cssText = "display:flex;z-index:10001";
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="quick-entry-modal" style="max-width:360px;padding:24px">
      <h3 style="margin:0 0 12px">Workout Details</h3>
      <div class="form-row" style="margin-bottom:10px">
        <label>Distance (${unit})</label>
        <input type="number" id="live-finish-distance" placeholder="e.g. 11" min="0" step="0.1" />
      </div>
      ${isCycling ? `<div class="form-row" style="margin-bottom:10px">
        <label>Avg Power (watts) <span class="optional-tag">optional</span></label>
        <input type="number" id="live-finish-watts" placeholder="e.g. 205" min="0" max="2000" />
      </div>` : ""}
      <button class="btn-primary" style="width:100%;margin-bottom:8px" onclick="_saveLiveEnduranceDetails()">Save</button>
      <button class="btn-secondary" style="width:100%;opacity:0.7" onclick="document.getElementById('live-endurance-finish').remove();_commitLiveWorkout(false)">Skip</button>
    </div>
  `;

  document.body.appendChild(overlay);
}

function _saveLiveEnduranceDetails() {
  if (!_liveTracker) return;
  const dist = document.getElementById("live-finish-distance")?.value || "";
  const watts = parseInt(document.getElementById("live-finish-watts")?.value) || null;
  _liveTracker._finishDistance = dist;
  _liveTracker._finishWatts = watts;
  document.getElementById("live-endurance-finish")?.remove();
  _commitLiveWorkout(false);
}

function _showFinishChoiceModal() {
  let overlay = document.getElementById("live-finish-choice");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "live-finish-choice";
  overlay.className = "quick-entry-overlay is-open";
  overlay.style.cssText = "display:flex;z-index:10001";
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="quick-entry-modal" style="max-width:360px;text-align:center;padding:24px">
      <h3 style="margin:0 0 8px">Finish Workout</h3>
      <p style="margin:0 0 20px;color:var(--color-text-muted);font-size:0.9rem">You have unlogged sets remaining.</p>
      <button class="btn-primary" style="width:100%;margin-bottom:10px" onclick="document.getElementById('live-finish-choice').remove();_commitLiveWorkout(true)">Log Everything</button>
      <button class="btn-secondary" style="width:100%;margin-bottom:10px" onclick="document.getElementById('live-finish-choice').remove();_commitLiveWorkout(false)">Log Completed Only</button>
      <button class="btn-secondary" style="width:100%;opacity:0.7" onclick="document.getElementById('live-finish-choice').remove()">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);
}

function _commitLiveWorkout(logAll) {
  if (!_liveTracker) return;
  const t = _liveTracker;
  const durationMin = Math.round(t.elapsed / 60000);

  // If logAll, mark every unlogged set as done with its preset values
  if (logAll && t.isStrength) {
    t.exercises.forEach((ex, ei) => {
      const sets = t.sets[ei] || [];
      sets.forEach(s => {
        if (!s.done) {
          s.done = true;
          if (!s.reps) s.reps = ex.reps || "";
          if (!s.weight) s.weight = ex.weight || "";
        }
      });
    });
  }

  // Build exercises data for strength
  let exercises = [];
  if (t.isStrength) {
    t.exercises.forEach((ex, ei) => {
      const sets = t.sets[ei] || [];
      const doneSets = sets.filter(s => s.done);
      if (doneSets.length > 0) {
        const details = doneSets.map(s => ({ reps: s.reps, weight: s.weight }));
        // Build range for main line reps/weight
        const rNums = details.map(d => parseInt(d.reps)).filter(n => !isNaN(n));
        const wNums = details.map(d => { const m = String(d.weight||"").match(/([\d.]+)/); return m ? parseFloat(m[1]) : NaN; }).filter(n => !isNaN(n));
        let mainReps = doneSets[0].reps || ex.reps || "";
        let mainWeight = doneSets[0].weight || ex.weight || "";
        if (rNums.length) {
          const rMin = Math.min(...rNums), rMax = Math.max(...rNums);
          mainReps = rMin === rMax ? String(rMin) : `${rMin}-${rMax}`;
        }
        if (wNums.length) {
          const wMin = Math.min(...wNums), wMax = Math.max(...wNums);
          const unit = String(doneSets[0].weight||"").replace(/[\d.]+/, "").trim() || "lbs";
          mainWeight = wMin === wMax ? `${wMin} ${unit}` : `${wMin}-${wMax} ${unit}`;
        }
        // Only save setDetails if values actually differ across sets
        const allSame = details.every(d => d.reps === details[0].reps && d.weight === details[0].weight);
        exercises.push({
          name: ex.name,
          sets: String(doneSets.length),
          reps: mainReps,
          weight: mainWeight,
          setDetails: (!allSame && details.length > 1) ? details : undefined,
        });
      }
    });
  }

  // Look up session name
  let sessionName = "";
  try {
    const _sched = JSON.parse(localStorage.getItem("workoutSchedule")) || [];
    const _sw = _sched.find(s => s.id === t.sessionId);
    if (_sw) sessionName = _sw.sessionName || "";
  } catch {}

  // Save as completion
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  const workoutId = Date.now();
  const _finishDist = t._finishDistance || null;
  const _finishWatts = t._finishWatts || null;

  // For Hyrox: attach split times to each exercise and compute run/station totals
  let hyroxData = undefined;
  if (t.isHyrox && t.exercises.length) {
    let totalRunMs = 0, totalStationMs = 0;
    exercises = t.exercises.map((ex, i) => {
      const splitMs = t.stationTimes[i] || 0;
      const isRun = /^run\s/i.test(ex.name);
      if (isRun) totalRunMs += splitMs;
      else totalStationMs += splitMs;
      return { name: ex.name, sets: ex.sets || "1", reps: ex.reps || "", weight: ex.weight || "", splitTime: splitMs };
    });
    hyroxData = { totalRunMs, totalStationMs, totalMs: t.elapsed };
  }

  workouts.unshift({
    id: workoutId,
    date: t.dateStr,
    name: sessionName,
    type: t.type,
    notes: `Live tracked · ${durationMin} min`,
    exercises: exercises.length ? exercises : undefined,
    duration: String(durationMin),
    ...(_finishDist && { distance: _finishDist }),
    ...(_finishWatts && { avgWatts: _finishWatts }),
    ...(hyroxData && { hyroxData }),
    completedSessionId: t.sessionId,
    isCompletion: true,
    liveTracked: true,
    isHyrox: !!t.isHyrox,
  });
  localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();

  // Mark session as completed
  const meta = typeof loadCompletionMeta === "function" ? loadCompletionMeta() : {};
  meta[t.sessionId] = { workoutId, completedAt: new Date().toISOString() };
  localStorage.setItem("completedSessions", JSON.stringify(meta)); if (typeof DB !== 'undefined') DB.syncKey('completedSessions');

  const dateStr = t.dateStr;

  // Clean up
  _closeLiveTracker();

  // Refresh views
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof renderDayDetail === "function") renderDayDetail(dateStr);
  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
  if (typeof renderStats === "function") renderStats();

  // Show rating modal
  if (typeof showRatingModal === "function") {
    setTimeout(() => showRatingModal(String(workoutId), dateStr), 400);
  }

  // Check for level-up
  if (typeof checkLevelUp === "function") checkLevelUp();

  // Show stretch suggestion on the session card
  if (typeof renderStretchSuggestion === "function") {
    setTimeout(() => {
      const card = document.getElementById(t.sessionId);
      if (card && !document.getElementById(`stretch-${t.sessionId}`)) {
        const div = document.createElement("div");
        div.id = `stretch-${t.sessionId}`;
        card.appendChild(div);
        renderStretchSuggestion({ type: t.type, exercises }, div);
      }
    }, 600);
  }
}

function _swapLiveExercise(exerciseIndex) {
  if (!_liveTracker || !_liveTracker.isStrength) return;
  const ex = _liveTracker.exercises[exerciseIndex];
  if (!ex) return;

  if (typeof showSwapExerciseSheet !== "function") {
    alert("Exercise swap not available.");
    return;
  }

  showSwapExerciseSheet(ex.name, function(newName) {
    const oldName = ex.name;
    _liveTracker.exercises[exerciseIndex].name = newName;
    _liveTracker.exercises[exerciseIndex].swappedFrom = oldName;
    _liveTracker.exercises[exerciseIndex].swapReason = "equipment_busy";
    // Re-render
    const body = document.getElementById("live-tracker-body");
    if (body) body.innerHTML = _buildStrengthView();
  });
}

function _exitLiveWorkout() {
  if (!_liveTracker) return;
  const t = _liveTracker;
  // Check if user has logged any data
  let hasProgress = false;
  if (t.isHyrox) {
    hasProgress = t.stationTimes.some(st => st !== null) || t.elapsed > 60000;
  } else if (t.isStrength) {
    hasProgress = t.sets.some(exSets => exSets.some(s => s.done));
  } else {
    hasProgress = t.elapsed > 60000; // more than 1 minute elapsed
  }

  if (hasProgress) {
    if (!confirm("You have unsaved workout data. Exit without saving?")) return;
  }
  _closeLiveTracker();
}

function _closeLiveTracker() {
  if (_liveTimerInterval) { clearInterval(_liveTimerInterval); _liveTimerInterval = null; }
  _releaseWakeLock();
  _liveTracker = null;
  const overlay = document.getElementById("live-tracker-overlay");
  if (overlay) {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
  }
}

// ── Wake Lock (keep screen on) ───────────────────────────────────────────────

async function _requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      _liveWakeLock = await navigator.wakeLock.request("screen");
    }
  } catch {}
}

function _releaseWakeLock() {
  try { if (_liveWakeLock) { _liveWakeLock.release(); _liveWakeLock = null; } } catch {}
}

// ── Build "Start Workout" button (called from calendar.js) ───────────────────

function buildLiveTrackerButton(sessionId, type, dateStr, steps, exercises) {
  // Only show for today
  if (dateStr !== getTodayString()) return "";
  // Don't show if already completed
  if (typeof isSessionComplete === "function" && isSessionComplete(sessionId)) return "";

  const stepsArg = steps ? _escAttr(JSON.stringify(steps)) : "";
  const exArg = exercises ? _escAttr(JSON.stringify(exercises)) : "";

  return `<button class="btn-live-start" onclick="event.stopPropagation();startLiveWorkout('${sessionId}','${dateStr}','${type}',${stepsArg ? `'${stepsArg}'` : "null"},${exArg ? `'${exArg}'` : "null"})">
    ${typeof ICONS !== "undefined" ? ICONS.zap : ""} Start Workout
  </button>`;
}

function _escAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function _escLiveHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
