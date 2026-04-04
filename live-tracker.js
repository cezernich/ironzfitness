// live-tracker.js — In-Workout Execution Mode

// ── State ────────────────────────────────────────────────────────────────────

let _liveTracker = null; // { sessionId, dateStr, type, steps, exercises, currentStep, startTime, stepStart, paused, elapsed, restTimer, sets }
let _liveTimerInterval = null;
let _liveWakeLock = null;

// ── Launch ───────────────────────────────────────────────────────────────────

function startLiveWorkout(sessionId, dateStr, type, stepsJson, exercisesJson) {
  const steps = stepsJson ? JSON.parse(stepsJson) : null;
  const exercises = exercisesJson ? JSON.parse(exercisesJson) : null;
  const isStrength = !!(exercises && exercises.length > 0 && !steps);

  _liveTracker = {
    sessionId,
    dateStr,
    type,
    steps: steps || [],
    exercises: exercises || [],
    isStrength,
    currentStep: 0,
    startTime: Date.now(),
    stepStart: Date.now(),
    paused: false,
    elapsed: 0,
    pausedAt: null,
    // For strength: track completed sets per exercise
    sets: isStrength ? exercises.map(ex => {
      const numSets = parseInt(String(ex.sets).match(/^\d+/)?.[0]) || 3;
      return Array.from({ length: numSets }, () => ({ done: false, reps: ex.reps || "", weight: ex.weight || "" }));
    }) : [],
    currentExercise: 0,
    currentSet: 0,
    restCountdown: 0,
    inRest: false,
  };

  _requestWakeLock();
  _renderLiveTracker();
  _startLiveTimer();
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
  if (!_liveTracker.isStrength) {
    const stepTimerEl = document.getElementById("live-step-timer");
    if (stepTimerEl && !_liveTracker.paused) {
      const stepElapsed = Date.now() - _liveTracker.stepStart;
      stepTimerEl.textContent = _formatMs(stepElapsed);
    }
  }

  // Progress bar
  const progEl = document.getElementById("live-progress-fill");
  if (progEl) {
    const pct = _liveTracker.isStrength ? _getStrengthProgress() : _getEnduranceProgress();
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

// ── Render ───────────────────────────────────────────────────────────────────

function _renderLiveTracker() {
  // Remove existing
  let overlay = document.getElementById("live-tracker-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "live-tracker-overlay";
  overlay.className = "live-tracker-overlay";

  const t = _liveTracker;
  const body = t.isStrength ? _buildStrengthView() : _buildEnduranceView();

  overlay.innerHTML = `
    <div class="live-tracker">
      <div class="live-tracker-header">
        <div class="live-header-top">
          <span class="live-timer" id="live-timer">${_formatMs(t.elapsed)}</span>
          <div class="live-header-btns">
            <button class="live-btn-pause" onclick="_toggleLivePause()">${t.paused ? "Resume" : "Pause"}</button>
            <button class="live-btn-finish" onclick="_finishLiveWorkout()">Finish</button>
          </div>
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
  let html = "";

  t.exercises.forEach((ex, ei) => {
    const sets = t.sets[ei] || [];
    const allDone = sets.every(s => s.done);
    html += `
      <div class="live-exercise${allDone ? " live-exercise--done" : ""}${ei === t.currentExercise ? " live-exercise--active" : ""}" id="live-ex-${ei}">
        <div class="live-exercise-header" onclick="_toggleLiveExercise(${ei})">
          <span class="live-exercise-name">${_escLiveHtml(ex.name)}</span>
          <span class="live-exercise-target">${ex.sets || "3"} x ${ex.reps || ""} ${ex.weight ? "@ " + ex.weight : ""}</span>
          ${allDone ? '<span class="live-done-check">&#10003;</span>' : ""}
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
  });

  return html;
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

// ── Interactions ─────────────────────────────────────────────────────────────

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

    // Start rest timer (90s default for strength)
    _liveTracker.inRest = true;
    _liveTracker.restCountdown = 90000;
    _liveTracker.restEndTime = Date.now() + 90000;
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

  if (hasUnlogged) {
    _showFinishChoiceModal();
  } else {
    _commitLiveWorkout(false);
  }
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
        exercises.push({
          name: ex.name,
          sets: String(doneSets.length),
          reps: doneSets[0].reps || ex.reps || "",
          weight: doneSets[0].weight || ex.weight || "",
          setDetails: doneSets.length > 1 ? doneSets.map(s => ({ reps: s.reps, weight: s.weight })) : undefined,
        });
      }
    });
  }

  // Save as completion
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  const workoutId = Date.now();
  workouts.unshift({
    id: workoutId,
    date: t.dateStr,
    type: t.type,
    notes: `Live tracked · ${durationMin} min`,
    exercises: exercises.length ? exercises : undefined,
    duration: String(durationMin),
    completedSessionId: t.sessionId,
    isCompletion: true,
    liveTracked: true,
  });
  localStorage.setItem("workouts", JSON.stringify(workouts));

  // Mark session as completed
  const meta = typeof loadCompletionMeta === "function" ? loadCompletionMeta() : {};
  meta[t.sessionId] = { workoutId, completedAt: new Date().toISOString() };
  localStorage.setItem("completedSessions", JSON.stringify(meta));

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
