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

// Mid-workout snapshot. Persisted after every Log / Swap / Capture so a
// refresh or crash mid-session doesn't silently discard what the user has
// already logged. Cleared on _commitLiveWorkout and _closeLiveTracker.
const _LIVE_SESSION_KEY = "ironz_live_session";
function _saveLiveState() {
  if (!_liveTracker) return;
  try {
    const snapshot = {
      sessionId:  _liveTracker.sessionId,
      dateStr:    _liveTracker.dateStr,
      type:       _liveTracker.type,
      exercises:  _liveTracker.exercises,
      sets:       _liveTracker.sets,
      isStrength: _liveTracker.isStrength,
      isHyrox:    _liveTracker.isHyrox,
      savedAt:    new Date().toISOString(),
    };
    localStorage.setItem(_LIVE_SESSION_KEY, JSON.stringify(snapshot));
  } catch {}
}
function _clearLiveState() {
  try { localStorage.removeItem(_LIVE_SESSION_KEY); } catch {}
}

// ── Step building from workout data ──────────────────────────────────────
//
// For cardio / swim / circuit workouts, translate whatever the workout
// stored in localStorage into the flat step list the endurance view
// consumes: { type, zone, duration, label, reps?, rest? }
//
// type is one of "warmup" | "main" | "cooldown" | ""
// zone is an int 1-6 for styling (defaults to 2)
// duration is a number in minutes
// label is the user-facing phase name
// reps / rest are optional extras used for "8 × 400m" type lines

function _findWorkoutBySessionId(sessionId) {
  try {
    if (!sessionId) return null;
    if (sessionId.startsWith("session-sw-")) {
      const rawId = sessionId.slice("session-sw-".length);
      const list = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
      return list.find(w => String(w.id) === rawId) || null;
    }
    if (sessionId.startsWith("session-log-")) {
      const rawId = sessionId.slice("session-log-".length);
      const list = JSON.parse(localStorage.getItem("workouts") || "[]");
      return list.find(w => String(w.id) === rawId) || null;
    }
    if (sessionId.startsWith("session-plan-")) {
      const rest = sessionId.slice("session-plan-".length);
      const dashIdx = rest.indexOf("-", 11);
      const planDate = dashIdx > 0 ? rest.slice(0, dashIdx) : rest;
      const raceId = dashIdx > 0 ? rest.slice(dashIdx + 1) : "";
      const plan = (typeof loadTrainingPlan === "function" ? loadTrainingPlan() : []);
      return plan.find(p => p.date === planDate && String(p.raceId) === raceId) || null;
    }
  } catch (e) {
    console.warn("[live-tracker] workout lookup failed:", e);
  }
  return null;
}

function _zoneNumFromString(z) {
  const s = String(z || "").toLowerCase().trim();
  const m = s.match(/^z(\d)/);
  if (m) return parseInt(m[1], 10);
  if (/easy|recovery|warm|cool/.test(s)) return 1;
  if (/aerobic|steady|moderate/.test(s)) return 2;
  if (/tempo|sweet/.test(s)) return 3;
  if (/threshold|hard/.test(s)) return 4;
  if (/vo2|sprint|max/.test(s)) return 5;
  return 2;
}

function _phaseType(name) {
  const n = String(name || "").toLowerCase();
  if (/warm|wu\b/.test(n)) return "warmup";
  if (/cool|cd\b/.test(n)) return "cooldown";
  return "main";
}

function _parseMinutes(str) {
  const s = String(str || "");
  const m = s.match(/([\d.]+)/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  return /sec/i.test(s) ? v / 60 : v;
}

// Running / cycling — convert aiSession.intervals or top-level phases
// into the flat step list.
function _buildCardioSteps(workout) {
  if (!workout) return [];
  const out = [];

  // Prefer aiSession.intervals (what the calendar renders from).
  const ai = workout.aiSession || {};
  const intervals = Array.isArray(ai.intervals) && ai.intervals.length ? ai.intervals
                  : Array.isArray(workout.intervals) && workout.intervals.length ? workout.intervals
                  : null;

  if (intervals) {
    intervals.forEach(iv => {
      const name = iv.name || "Interval";
      const dur = _parseMinutes(iv.duration || iv.duration_min);
      const reps = parseInt(iv.reps, 10) || 0;
      const rest = iv.restDuration ? _parseMinutes(iv.restDuration) : 0;
      const type = _phaseType(name);
      const zone = _zoneNumFromString(iv.effort || iv.intensity || iv.zone);

      // For repeated blocks (e.g. "4 × 10 min sweet spot"), expand into
      // N work steps interleaved with (N-1) Recovery steps so the live
      // tracker walks through each rep and rest individually. Without
      // this the whole block is one countdown that just jumps straight
      // to the next phase after a single rep — the user never sees the
      // structure.
      if (reps > 1) {
        // Strip a leading "N x M min" / "N × M" from the base name so
        // the per-rep label doesn't double up on "4 × 10 min sweet spot
        // — 1/4". Falls back to the original name if no prefix matches.
        const cleanName = String(name)
          .replace(/^\s*\d+\s*[x×]\s*\d+\s*(?:min|m|sec|s)?\s*/i, "")
          .trim() || name;
        for (let i = 1; i <= reps; i++) {
          out.push({
            type,
            zone,
            duration: dur || 1,
            label: `${cleanName} — ${i} of ${reps}`,
          });
          if (i < reps && rest > 0) {
            out.push({
              type: "main",
              zone: 1,
              duration: rest,
              label: "Recovery",
            });
          }
        }
      } else {
        out.push({
          type,
          zone,
          duration: dur || 1,
          label: name,
          ...(rest > 0 ? { rest } : {}),
        });
      }
    });
    return out;
  }

  // Fallback: top-level phases array from the running generator
  const phases = Array.isArray(workout.phases) ? workout.phases : [];
  phases.forEach(p => {
    const name = p.phase ? p.phase.replace(/_/g, " ") : "Interval";
    const dur = p.duration_min || _parseMinutes(p.duration);
    out.push({
      type: _phaseType(p.phase),
      zone: _zoneNumFromString(p.intensity),
      duration: dur || 1,
      label: p.instruction || p.target || name,
    });
  });
  return out;
}

// Swimming — walk the canonical step tree and emit one step per interval.
// Rest steps are attached as the .rest field on the preceding interval so
// the endurance view's "(Ns rest)" suffix works. Repeat blocks expand
// with a "rep N of M" label so the user can tick each round.
function _buildSwimSteps(workout) {
  if (!workout) return [];
  const ai = workout.aiSession || {};
  const tree = Array.isArray(ai.steps) ? ai.steps
             : Array.isArray(workout.steps) ? workout.steps
             : null;
  if (!tree || !tree.length) return [];
  const out = [];
  function walk(nodes, repeatPrefix) {
    for (let i = 0; i < nodes.length; i++) {
      const s = nodes[i];
      if (!s) continue;
      if (s.kind === "interval") {
        const dist = s.distance_m ? `${s.distance_m}m` : "";
        const stroke = s.stroke && s.stroke !== "freestyle" ? ` ${s.stroke}` : "";
        const pace = s.pace_target ? ` @ ${s.pace_target}` : "";
        const nameBase = s.name || "Swim";
        const fullLabel = `${repeatPrefix || ""}${nameBase}${dist ? ` — ${dist}${stroke}` : ""}${pace}`;
        // Look ahead: if the next sibling is a rest node, attach its seconds.
        const next = nodes[i + 1];
        const restMin = (next && next.kind === "rest" && next.duration_sec)
          ? next.duration_sec / 60
          : 0;
        // Rough duration estimate: 2:00/100m pace by default so the timer
        // has something sensible to compare against.
        const estMin = s.distance_m ? Math.max(0.5, s.distance_m / 100 * 2) : 1;
        out.push({
          type: _phaseType(nameBase),
          zone: 2,
          duration: Math.round(estMin * 10) / 10,
          label: fullLabel,
          ...(restMin > 0 ? { rest: Math.round(restMin * 10) / 10 } : {}),
        });
      } else if (s.kind === "repeat") {
        const count = Math.max(1, parseInt(s.count, 10) || 1);
        for (let r = 0; r < count; r++) {
          walk(s.children || [], `${repeatPrefix || ""}(Rep ${r + 1}/${count}) `);
        }
      }
      // rest nodes are consumed by the look-ahead above — no direct push.
    }
  }
  walk(tree, "");
  return out;
}

// Circuit — flatten the step tree into ordered steps. Repeat blocks are
// unrolled so each round is its own trackable step. Rest nodes become
// their own step (unlike swim where they attach to the preceding interval).
function _buildCircuitSteps(workout) {
  if (!workout) return [];
  const circuit = workout.circuit || workout;
  const tree = Array.isArray(circuit.steps) ? circuit.steps : null;
  if (!tree || !tree.length) return [];
  const out = [];
  function walk(nodes, roundPrefix) {
    nodes.forEach(s => {
      if (!s) return;
      if (s.kind === "rest") {
        const sec = s.duration_sec || 0;
        out.push({
          type: "main",
          zone: 1,
          duration: sec / 60,
          label: `${roundPrefix || ""}Rest ${sec}s`,
        });
        return;
      }
      if (s.kind === "repeat") {
        const count = Math.max(1, parseInt(s.count, 10) || 1);
        for (let r = 0; r < count; r++) {
          walk(s.children || [], `${roundPrefix || ""}Round ${r + 1}/${count} — `);
        }
        return;
      }
      // exercise / cardio
      const name = s.name || "Step";
      const parts = [];
      if (s.reps != null) parts.push(s.per_side ? `${s.reps}/side` : `${s.reps} reps`);
      if (s.distance_display) parts.push(s.distance_display);
      else if (s.distance_m) parts.push(`${s.distance_m}m`);
      if (s.weight != null) parts.push(`${s.weight} ${s.weight_unit || "lbs"}`);
      const detail = parts.length ? ` — ${parts.join(" · ")}` : "";
      // Rough minute estimate — 20s per rep default, or distance/pace for cardio
      const estMin = s.duration_sec ? s.duration_sec / 60
                   : s.reps ? Math.max(0.5, (s.reps * 2) / 60)
                   : 1;
      out.push({
        type: "main",
        zone: 3,
        duration: Math.round(estMin * 10) / 10,
        label: `${roundPrefix || ""}${name}${detail}`,
      });
    });
  }
  walk(tree, "");
  return out;
}

function _buildStepsFromSession(sessionId, type) {
  const w = _findWorkoutBySessionId(sessionId);
  if (!w) return [];
  if (type === "swim" || type === "swimming") return _buildSwimSteps(w);
  if (type === "circuit" || w.type === "circuit" || w.circuit) return _buildCircuitSteps(w);
  // Default: running / cycling / rowing / generic cardio
  return _buildCardioSteps(w);
}

// ── Launch ───────────────────────────────────────────────────────────────────

// BUGFIX 04-27 §F2: bring the live tracker's exercise shape into line with
// what the home-screen card displays. Flattens rep ranges to the upper
// bound (matches _formatRepsWithSide) and fills empty weights via the
// shared _deriveAccessoryWeight helper from workouts.js when a PR-based
// derivation is possible. Bodyweight exercises stay "BW" / unchanged.
function _resolveExerciseForTracker(ex) {
  if (!ex || typeof ex !== "object") return ex;
  let reps = ex.reps;
  if (reps != null) {
    const rangeMatch = String(reps).match(/^(\d+)\s*[-\u2013]\s*(\d+)(.*)$/);
    if (rangeMatch) reps = (rangeMatch[2] + rangeMatch[3]).trim();
  }
  let weight = ex.weight;
  const isBlank = !weight || /^(moderate|light|heavy|—)$/i.test(String(weight).trim());
  if (isBlank) {
    // Bodyweight movements: match the summary card's "BW" auto-fill so
    // a Pull-Up with no explicit weight doesn't render "BW" on the card
    // and a blank input in the tracker. Same regex as
    // workouts.js _normalizeWeightDisplay (user feedback 2026-04-29:
    // coach assigned Pull-Up at BW, summary showed BW, tracker empty).
    const n = String(ex.name || "").toLowerCase();
    if (/\b(pull[- ]?up|chin[- ]?up|push[- ]?up|dip|burpee|plank|hollow|bird[- ]?dog|superman|glute bridge|hip thrust|step[- ]?up|sit[- ]?up|crunch|mountain climber|jumping jack|air squat|lunge)\b/.test(n)) {
      weight = "BW";
    } else if (typeof window !== "undefined" && typeof window._deriveAccessoryWeight === "function") {
      const derived = window._deriveAccessoryWeight(ex.name, reps);
      if (derived) weight = derived;
    }
  }
  return { ...ex, reps, weight };
}

function startLiveWorkout(sessionId, dateStr, type, stepsJson, exercisesJson) {
  if (typeof trackEvent === "function") trackEvent("workout_started", { type, date: dateStr });
  let steps = stepsJson ? JSON.parse(stepsJson) : null;
  const rawExercises = exercisesJson ? JSON.parse(exercisesJson) : null;
  // BUGFIX 04-27 §F2: the home-screen card resolves reps + weights via
  // _formatRepsWithSide and _normalizeWeightDisplay at render time. The
  // live tracker had been reading the un-resolved exercise objects so
  // reps showed as "10-12" and weights blank. Apply the same resolution
  // here so the tracker mirrors the card.
  const exercises = rawExercises ? rawExercises.map(_resolveExerciseForTracker) : null;

  // Build steps on the fly for cardio/swim/circuit when the caller didn't
  // supply any. Before this, endurance workouts landed here with steps=null
  // and immediately rendered "All steps complete!" because t.steps[0] was
  // undefined. We look up the workout by sessionId and translate its data
  // model into the flat { type, zone, duration, label, reps, rest } step
  // shape the endurance view expects.
  if ((!steps || !steps.length) && !(exercises && exercises.length)) {
    const built = _buildStepsFromSession(sessionId, type);
    if (built && built.length) steps = built;
  }

  const isHyrox = type === "hyrox" && exercises && exercises.length > 0;
  const isStrength = !isHyrox && !!(exercises && exercises.length > 0 && !steps);

  // Look up the parent workout's metadata by sessionId so the live
  // tracker can surface the coach's top-level note. The session id
  // format is "session-sw-<scheduleEntryId>" for scheduled workouts;
  // we match on the suffix against workoutSchedule entries. Falls
  // back to "" silently when the lookup misses (self-coached
  // workouts, ad-hoc Quick Add, etc.) so the banner stays hidden.
  let _coachNoteForLive = "";
  let _coachIdForLive = "";
  let _coachNameForLive = "";
  try {
    const schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]") || [];
    const card = String(sessionId || "");
    const swIdMatch = card.match(/^session-sw-(.+)$/);
    const swId = swIdMatch ? swIdMatch[1] : null;
    const entry = schedule.find(e => e && (
      String(e.id) === swId ||
      String(e.id) === card ||
      `session-sw-${e.id}` === card
    ));
    if (entry) {
      _coachNoteForLive = entry.coachNote || entry.coach_note || "";
      _coachIdForLive   = entry.coachId   || entry.coach_id   || "";
      _coachNameForLive = entry.coachName || entry.coach_name || "";
    }
  } catch {}

  _liveTracker = {
    sessionId,
    dateStr,
    type,
    steps: steps || [],
    exercises: exercises || [],
    isStrength,
    isHyrox,
    coachNote: _coachNoteForLive,
    coachId:   _coachIdForLive,
    coachName: _coachNameForLive,
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
        // Per-set entry can have empty fields (coach typed reps but
        // skipped weight, or vice versa). Treat empty strings as "fall
        // back to the row default" so the tracker doesn't blank out a
        // value that the row-level ex.reps/ex.weight already provided.
        const sd = details && details[si];
        const sdReps   = sd && sd.reps   ? sd.reps   : "";
        const sdWeight = sd && sd.weight ? sd.weight : "";
        return {
          done: false,
          reps:   sdReps   || ex.reps   || "",
          weight: sdWeight || ex.weight || "",
        };
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
      restEl.textContent = `Rest: ${_formatMs(_liveTracker.restCountdown)}`;
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

  // Active-frame rule: follow whichever exercise the user most recently
  // interacted with (tapped Log on, focused an input of, expanded). If
  // they haven't touched anything yet this render, fall back to the
  // first exercise with unfinished sets. "Follow first unfinished"
  // alone was breaking the non-sequential-order workflow — user tapped
  // Log on bench after skipping ahead and the frame stayed on an
  // earlier unfinished exercise.
  if (typeof t.currentExercise !== "number" || t.currentExercise < 0 || t.currentExercise >= t.exercises.length) {
    t.currentExercise = t.sets.findIndex(exSets => !(exSets || []).every(s => s.done));
    if (t.currentExercise === -1) t.currentExercise = t.exercises.length; // all done
  }

  let html = "";
  // Top-level coach note (if any) above the first exercise card.
  // Reads from t.workoutMeta.coachNote (current shape) with fallback
  // to t.coachNote (legacy shape) so older logged sessions don't go
  // dark. Returns "" when no note is present so the live tracker
  // stays unchanged for self-coached workouts.
  const _coachNote = (t.workoutMeta && (t.workoutMeta.coachNote || t.workoutMeta.coach_note))
    || t.coachNote || "";
  if (_coachNote) {
    html += `<div class="live-coach-note-banner">
      <span class="live-coach-note-label">Coach note</span>
      <span class="live-coach-note-text">${_escLiveHtml(_coachNote)}</span>
    </div>`;
  }

  for (const g of groups) {
    if (g.kind === "single") {
      html += _buildLiveSingleExerciseCard(g.index);
    } else {
      html += _buildLiveSupersetCard(g);
    }
  }

  // BUGFIX 04-25 §6: tack-on exercise. Appended at the bottom (above
  // Finish in the parent overlay) so users can add a finisher mid-
  // workout — e.g. "I'll throw on pull-ups since I have time." Added
  // exercises are saved into the completion record but do NOT modify
  // the underlying planned workout — only today's actuals reflect the
  // extra work.
  html += `<button class="live-add-exercise-btn" onclick="_promptAddLiveExercise()">+ Add Exercise</button>`;

  return html;
}

// Add a free-text exercise to the live tracker. Renders its own small
// modal asking for name + sets count — the swap sheet was being reused
// here previously, but with no anchor exercise it surfaced random
// chest alternatives during a leg day (real bug 2026-05-03). Sets
// count is asked up front so the user doesn't end up with three
// pre-seeded set rows they have to delete.
function _promptAddLiveExercise() {
  if (!_liveTracker || !_liveTracker.isStrength) return;
  const t = _liveTracker;

  const _commit = (name, setsCount) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    const n = Math.max(1, Math.min(10, parseInt(setsCount, 10) || 3));
    const newIdx = t.exercises.length;
    t.exercises.push({
      name: trimmed,
      sets: String(n),
      reps: "10",
      weight: "",
      addedDuringWorkout: true,
    });
    t.sets[newIdx] = Array.from({ length: n }, () => ({ reps: "10", weight: "", done: false }));
    t._groups = null;
    t.currentExercise = newIdx;
    if (typeof _saveLiveState === "function") { try { _saveLiveState(); } catch {} }
    const body = document.getElementById("live-tracker-body");
    if (body) {
      body.innerHTML = _buildStrengthView();
      setTimeout(() => {
        const card = document.getElementById("live-ex-" + newIdx);
        if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  };

  // Inline modal — name + sets in one shot. No equipment-busy framing
  // because this is "add", not "swap".
  const overlayId = "live-add-exercise-overlay";
  document.getElementById(overlayId)?.remove();
  const overlay = document.createElement("div");
  overlay.id = overlayId;
  overlay.className = "quick-entry-overlay is-open";
  overlay.style.cssText = "display:flex;z-index:10001";
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="quick-entry-modal" style="max-width:360px;padding:20px">
      <h3 style="margin:0 0 12px">Add Exercise</h3>
      <label style="display:block;font-size:0.8rem;color:var(--color-text-muted);margin-bottom:4px">Name</label>
      <input type="text" id="live-add-ex-name" class="ex-row-name"
        placeholder="e.g. Hamstring Curl" autocomplete="off"
        style="width:100%;margin-bottom:12px" />
      <label style="display:block;font-size:0.8rem;color:var(--color-text-muted);margin-bottom:4px">Sets</label>
      <input type="number" id="live-add-ex-sets" class="ex-row-name"
        min="1" max="10" value="3" inputmode="numeric"
        style="width:100%;margin-bottom:16px" />
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" style="flex:1"
          onclick="document.getElementById('${overlayId}')?.remove()">Cancel</button>
        <button class="btn-primary" style="flex:1" id="live-add-ex-confirm">Add</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const nameInput = document.getElementById("live-add-ex-name");
  const setsInput = document.getElementById("live-add-ex-sets");
  const confirmBtn = document.getElementById("live-add-ex-confirm");
  const submit = () => {
    _commit(nameInput.value, setsInput.value);
    overlay.remove();
  };
  confirmBtn.onclick = submit;
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  setsInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  setTimeout(() => nameInput.focus(), 50);
}
if (typeof window !== "undefined") window._promptAddLiveExercise = _promptAddLiveExercise;

function _buildLiveSingleExerciseCard(ei) {
  const t = _liveTracker;
  const ex = t.exercises[ei];
  const sets = t.sets[ei] || [];
  const allDone = sets.every(s => s.done);
  // Unilateral clarity: "Bulgarian Split Squat 3 × 12 @ 175 lbs" reads
  // the same whether 12 reps means per leg or total, and whether 175 is
  // one barbell or two dumbbells. Flag unilateral exercises and append
  // the loading method so users don't double-up the weight by mistake.
  const U = typeof UnilateralDisplay !== "undefined" ? UnilateralDisplay : null;
  const isUni = U ? U.isUnilateral(ex.name) : false;
  const rawMethod = U && ex.weight ? U.getLoadingMethod(ex.name, ex.weight) : "";
  // Only surface the loading method when it carries new information:
  // unilateral exercises (most important — 175 lbs Bulgarian could mean
  // three different things) and single-implement lifts (goblet, suitcase)
  // where the name alone doesn't make one-vs-two clear. For common
  // barbell lifts the label would just be noise.
  const showMethod = !!rawMethod && (isUni || rawMethod === "single DB" || rawMethod === "single KB");
  const method = showMethod ? rawMethod : "";
  const weightLabel = U && ex.weight ? (showMethod ? U.formatWeightLabel(ex.weight, rawMethod) : ex.weight) : (ex.weight || "");
  const repsWithSide = U ? U.formatRepsLabel(ex.reps || "", ex.name) : (ex.reps || "");
  const perLabel = U && isUni ? U._perLabel(ex.name) : "";

  // BUGFIX 04-27 §F4: descriptive warmup line for compound lifts.
  const _warmupHint = (typeof window !== "undefined" && typeof window._computeWarmupText === "function")
    ? window._computeWarmupText(ex.name, ex.weight)
    : "";
  return `
    <div class="live-exercise${allDone ? " live-exercise--done" : ""}${ei === t.currentExercise ? " live-exercise--active" : ""}${isUni ? " live-exercise--unilateral" : ""}" id="live-ex-${ei}">
      <div class="live-exercise-header" onclick="_toggleLiveExercise(${ei})">
        <span class="live-exercise-name">${_escLiveHtml(ex.name)}</span>
        <span class="live-exercise-target">${ex.sets || "3"} x ${_escLiveHtml(repsWithSide)} ${weightLabel ? "@ " + _escLiveHtml(weightLabel) : ""}</span>
        ${allDone ? '<span class="live-done-check">&#10003;</span>' : ""}
        ${!allDone ? `<button class="live-swap-btn" onclick="_swapLiveExercise(${ei})" title="Swap exercise">&#8644;</button>` : ""}
      </div>
      ${_warmupHint ? `<div class="live-warmup-hint">${_escLiveHtml(_warmupHint)}</div>` : ""}
      ${ex.notes ? `<div class="live-coach-ex-note"><span class="live-coach-ex-note-label">Coach</span> ${_escLiveHtml(String(ex.notes).trim())}</div>` : ""}
      <div class="live-sets-grid" id="live-sets-${ei}">
        <div class="live-sets-header">
          <span>Set</span>
          <span>Reps${isUni ? `<span class="live-set-subhint"> · ${_escLiveHtml(perLabel)}</span>` : ""}</span>
          <span>Weight${method ? `<span class="live-set-subhint"> · ${_escLiveHtml(method)}</span>` : ""}</span>
          <span></span>
        </div>
        ${sets.map((s, si) => `
          <div class="live-set-row${s.done ? " live-set--done" : ""}" id="live-set-${ei}-${si}">
            <span class="live-set-num">${si + 1}</span>
            <input class="live-set-input" type="text" inputmode="numeric" value="${s.reps}" id="live-reps-${ei}-${si}" placeholder="${isUni ? _escLiveHtml(perLabel) : "reps"}" oninput="_onLiveInputEdit(${ei},${si})" />
            <input class="live-set-input" type="text" value="${s.weight}" id="live-wt-${ei}-${si}" placeholder="lbs" oninput="_onLiveInputEdit(${ei},${si})" />
            <button class="live-set-btn${s.done ? " live-set-btn--done" : ""}" onclick="_logLiveSet(${ei},${si})">${s.done ? "&#10003;" : "Log"}</button>
            ${sets.length > 1 ? `<button class="live-set-del-btn" onclick="_removeLiveSet(${ei},${si})" aria-label="Remove set" title="Remove set">×</button>` : ""}
          </div>
        `).join("")}
        <button class="live-add-set-btn" onclick="_addLiveSet(${ei})">+ Add Set</button>
      </div>
    </div>`;
}

// BUGFIX 04-25 §6: append a new unlogged set to an exercise. Pre-fills
// reps/weight from the previous set so the user just taps Log without
// re-entering numbers. Marks the set as not done so the Log button is
// active. Snapshot fires inside _renderLiveTracker via _saveLiveState
// (already wired) so the added set survives a refresh.
function _addLiveSet(exIdx) {
  if (!_liveTracker || !_liveTracker.isStrength) return;
  if (!Array.isArray(_liveTracker.sets[exIdx])) _liveTracker.sets[exIdx] = [];
  _captureLiveSetInputs();
  const sets = _liveTracker.sets[exIdx];
  const last = sets[sets.length - 1] || {};
  const ex = _liveTracker.exercises[exIdx] || {};
  sets.push({
    reps: last.reps || ex.reps || "",
    weight: last.weight || ex.weight || "",
    done: false,
  });
  if (typeof _saveLiveState === "function") { try { _saveLiveState(); } catch {} }
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildStrengthView();
}
if (typeof window !== "undefined") window._addLiveSet = _addLiveSet;

// Remove a single set row. Mirrors _addLiveSet's pattern: capture
// any in-progress input values into the model before mutating, then
// re-render the strength view. Last remaining set is protected at
// the renderer level (the × button only renders when sets.length > 1)
// so we don't strand an exercise with zero sets.
function _removeLiveSet(exIdx, setIdx) {
  if (!_liveTracker || !_liveTracker.isStrength) return;
  const sets = _liveTracker.sets[exIdx];
  if (!Array.isArray(sets) || sets.length <= 1) return;
  if (setIdx < 0 || setIdx >= sets.length) return;
  _captureLiveSetInputs();
  sets.splice(setIdx, 1);
  if (typeof _saveLiveState === "function") { try { _saveLiveState(); } catch {} }
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildStrengthView();
}
if (typeof window !== "undefined") window._removeLiveSet = _removeLiveSet;

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

  // Per-exercise coach notes — rendered ONCE above the rounds (rather
  // than repeated for every round row) so the live tracker stays
  // skimmable. Letter-prefixed so the user can match the note to the
  // A/B exercise.
  const memberNotes = members
    .map((ex, k) => {
      const t = String(ex?.notes || "").trim();
      if (!t) return "";
      return `<div class="live-coach-ex-note">
        <span class="live-coach-ex-note-label">Coach · ${letters[k] || "?"}</span> ${_escLiveHtml(t)}
      </div>`;
    })
    .join("");

  return `
    <div class="live-exercise live-superset-group${allDone ? " live-exercise--done" : ""}" id="live-ss-${g.gid}">
      <div class="live-exercise-header live-superset-header">
        <span class="live-superset-badge">SS</span>
        <span class="live-exercise-name">Superset · ${members.length} exercises</span>
        <span class="live-exercise-target">${g.rounds} round${g.rounds !== 1 ? "s" : ""}</span>
        ${allDone ? '<span class="live-done-check">&#10003;</span>' : ""}
      </div>
      <div class="live-superset-members">${summary}</div>
      ${memberNotes}
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
    // Rest timer is NOT extended by pause — a pause is already rest, so
    // pretending the user still owes the full rest window afterward
    // produced 5-7 min "Rest:" readouts when the user paused mid-set.
    if (_liveTracker.inRest && _liveTracker.restEndTime <= Date.now()) {
      _liveTracker.inRest = false;
      _liveTracker.restCountdown = 0;
    }
    _liveTracker.paused = false;
    _liveTracker.pausedAt = null;
  } else {
    _liveTracker.paused = true;
    _liveTracker.pausedAt = Date.now();
  }
  _renderLiveTracker();
}

function _toggleLiveExercise(idx) {
  _captureLiveSetInputs();
  _liveTracker.currentExercise = idx;
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildStrengthView();
}

// Capture reps/weight from the DOM into the live-tracker state.
//
// We iterate ALL sets, not just undone ones — done-set inputs are now
// editable (see _buildLiveSingleExerciseCard) so a user can correct a
// rep count after tapping Log without losing their intent. Empty inputs
// preserve the existing stored value so we don't clobber captured
// actuals with blanks.
function _captureLiveSetInputs() {
  if (!_liveTracker?.sets) return;
  for (let ei = 0; ei < _liveTracker.sets.length; ei++) {
    const arr = _liveTracker.sets[ei] || [];
    for (let si = 0; si < arr.length; si++) {
      const s = arr[si];
      if (!s) continue;
      const repsEl = document.getElementById(`live-reps-${ei}-${si}`);
      const wtEl = document.getElementById(`live-wt-${ei}-${si}`);
      if (repsEl && repsEl.value !== "") s.reps = repsEl.value;
      if (wtEl && wtEl.value !== "") s.weight = wtEl.value;
    }
  }
}

// BUGFIX 04-27 §F3: rep count alone over-prescribes rest for low-load
// movements. 5 pull-ups got 2:30 because the old logic assumed 5 reps =
// heavy strength. Real answer depends on exercise type:
//   - Heavy compound (squat, DL, bench, OHP): 2:30
//   - Pulling compound (rows, pull-up, chin-up): 1:30
//   - Bodyweight (push-up, dip, pull-up at low reps): 1:15
//   - Accessory press (DB bench, incline DB): 1:30
//   - Isolation (curl, kickback, lateral raise, fly, face pull): 0:45-1:00
// Fall back to the rep-based heuristic for unknowns so this never returns
// nothing.
const REST_DEFAULTS_BY_PATTERN = [
  { match: /\b(back\s*squat|front\s*squat|deadlift|barbell\s*bench|bench\s*press|overhead\s*press|military\s*press)\b/i, sec: 150 },
  { match: /\b(pull[- ]?up|chin[- ]?up|barbell\s*row|pendlay\s*row|t.?bar\s*row|lat\s*pulldown|seated\s*row)\b/i, sec: 90 },
  { match: /\b(dumbbell\s*bench|incline\s*press|push[- ]?up|dip)\b/i, sec: 75 },
  { match: /\b(face\s*pull|cable\s*row|seated\s*cable)\b/i, sec: 60 },
  { match: /\b(curl|kickback|lateral\s*raise|front\s*raise|reverse\s*fly|fly|tricep\s*pushdown|tricep\s*extension)\b/i, sec: 45 },
];

function _restSecForExercise(ex, repsHint) {
  if (ex && typeof ex.rest_default_sec === "number" && ex.rest_default_sec > 0) {
    return ex.rest_default_sec;
  }
  const name = String(ex?.name || "");
  for (const rule of REST_DEFAULTS_BY_PATTERN) {
    if (rule.match.test(name)) return rule.sec;
  }
  // Unknown — fall back to the existing rep-based heuristic.
  const reps = parseInt(String(repsHint || "").match(/\d+/)?.[0]);
  if (!reps || Number.isNaN(reps)) return 90;
  if (reps <= 5)  return 150;
  if (reps <= 8)  return 120;
  if (reps <= 12) return 90;
  return 60;
}

// Rest duration based on exercise type + just-completed set's rep count.
// Not a cap — user can always tap the rest timer to skip.
function _liveRestForSet(exIdx, setIdx) {
  const set = _liveTracker?.sets?.[exIdx]?.[setIdx];
  const ex = _liveTracker?.exercises?.[exIdx];
  return _restSecForExercise(ex, set?.reps) * 1000;
}

// oninput handler for the live set reps/weight fields. Flushes the DOM
// value into _liveTracker.sets immediately and snapshots to localStorage
// so if the user edits a number and refreshes before tapping Log, the
// correction survives. Cheap — no re-render.
function _onLiveInputEdit(exIdx, setIdx) {
  if (!_liveTracker?.sets) return;
  const s = _liveTracker.sets[exIdx]?.[setIdx];
  if (!s) return;
  const repsEl = document.getElementById(`live-reps-${exIdx}-${setIdx}`);
  const wtEl = document.getElementById(`live-wt-${exIdx}-${setIdx}`);
  if (repsEl) s.reps = repsEl.value;
  if (wtEl) s.weight = wtEl.value;
  // Active frame follows the exercise the user is currently editing.
  // Don't re-render on every keystroke though — just update state.
  _liveTracker.currentExercise = exIdx;
  _saveLiveState();
}

function _logLiveSet(exIdx, setIdx) {
  if (!_liveTracker) return;
  const set = _liveTracker.sets[exIdx]?.[setIdx];
  if (!set) return;

  _captureLiveSetInputs();

  // Tap Log on bench set 2 → active frame moves to bench even if a
  // prior exercise has unlogged sets. Lets the user work in any order.
  _liveTracker.currentExercise = exIdx;

  if (set.done) {
    // Undo
    set.done = false;
    // Cancel rest timer
    _liveTracker.inRest = false;
    _liveTracker.restCountdown = 0;
  } else {
    set.done = true;

    // Start rest timer unless disabled. Supersets rest only after the full round
    // (all exercises in the group at this round index are logged) and use a
    // shorter default (60s vs 90s for normal exercises).
    if (!_getLivePrefs().hideRestTimer) {
      const group = _findLiveGroupContaining(exIdx);
      let restMs = _liveRestForSet(exIdx, setIdx);
      let shouldRest = true;
      let inSupersetMidRound = false;
      if (group && group.kind === "superset") {
        const roundComplete = group.indices.every(ix => !!_liveTracker.sets[ix]?.[setIdx]?.done);
        shouldRest = roundComplete;
        inSupersetMidRound = !roundComplete;
        restMs = 60000;
      }
      if (shouldRest) {
        _liveTracker.inRest = true;
        _liveTracker.restCountdown = restMs;
        _liveTracker.restEndTime = Date.now() + restMs;
      } else if (inSupersetMidRound) {
        // Mid-superset-round logs (logged A, B not done yet) cancel any
        // running rest from a prior exercise. Without this, the user
        // sees a leftover countdown from the previous exercise's last
        // set even though the whole point of a superset is to flow
        // straight from A → B with no rest. Per user feedback.
        _liveTracker.inRest = false;
        _liveTracker.restCountdown = 0;
        _liveTracker.restEndTime = 0;
      }
    }
  }

  // Persist every log to localStorage immediately so a refresh or crash
  // mid-workout doesn't silently drop the user's logged sets.
  _saveLiveState();

  // Re-render the body
  const body = document.getElementById("live-tracker-body");
  if (body) body.innerHTML = _buildStrengthView();

  // BUGFIX 04-27 §F6: confetti when the user logs the final set of the
  // final exercise. Plays exactly once per workout; un-logging and re-
  // logging the same final set won't re-trigger.
  if (set.done && !_liveTracker._celebrated) {
    const allDone = _liveTracker.sets.every(exSets => exSets.every(s => s.done));
    if (allDone) {
      _liveTracker._celebrated = true;
      _saveLiveState();
      _celebrateWorkoutComplete();
    }
  }
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

// ── Celebrate ────────────────────────────────────────────────────────────────

// BUGFIX 04-27 §F6: lightning-bolt strike when the user logs the final
// set. Uses the same polygon path as the splash screen + auth logo + top-
// left header (index.html:51-62) so the celebration reads as "obviously
// IronZ" — a quick brand stamp, not a generic confetti burst. The bolt
// scales in, fills from bottom (matching the splash fill motif), flashes
// a glow ring, then fades. ~1.5s, pointer-events:none so the Finish
// button is still tappable.
function _celebrateWorkoutComplete() {
  if (document.getElementById("live-celebration-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "live-celebration-overlay";
  overlay.className = "live-celebration-overlay";
  // Same SVG path as .splash-bolt and the header logo. The clipPath id is
  // namespaced (live-bolt-clip) so it doesn't collide with the splash
  // screen's bolt-fill-clip if both ever render concurrently.
  overlay.innerHTML = `
    <div class="live-celebration-pulse"></div>
    <svg class="live-celebration-bolt" viewBox="0 0 24 24" width="120" height="120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="live-bolt-clip" clipPathUnits="userSpaceOnUse">
          <rect x="0" y="24" width="24" height="24" class="live-celebration-bolt-fill"/>
        </clipPath>
      </defs>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
        fill="none" stroke="var(--color-accent)" stroke-width="1.5"
        stroke-linejoin="round" stroke-linecap="round"/>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
        fill="var(--color-accent)" clip-path="url(#live-bolt-clip)"/>
    </svg>`;

  document.body.appendChild(overlay);
  setTimeout(() => { overlay.remove(); }, 1600);

  if (typeof trackEvent === "function") {
    try { trackEvent("live_workout_celebrated"); } catch {}
  }
}

if (typeof window !== "undefined") window._celebrateWorkoutComplete = _celebrateWorkoutComplete;

// ── Finish ───────────────────────────────────────────────────────────────────

function _finishLiveWorkout() {
  if (!_liveTracker) return;
  const t = _liveTracker;

  // BUGFIX 04-25 §4: clear any leftover finish-modal overlays from a
  // previous Finish tap that was dismissed via system back / swipe-down
  // / X button without committing. Otherwise the modal stacks or the
  // tracker enters a partial state and subsequent Finish taps no-op.
  // Idempotent — safe to call when no stale overlay exists.
  ["live-finish-choice", "live-endurance-finish", "live-hyrox-finish"].forEach(id => {
    const stale = document.getElementById(id);
    if (stale) stale.remove();
  });

  if (t.isStrength) _captureLiveSetInputs();

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
  // No tap-outside dismiss: Finish must always commit or be explicitly
  // cancelled. Silent dismiss was losing workouts.

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
  // No tap-outside dismiss. Previously tapping the dim backdrop silently
  // closed the modal without saving, so the user would hit Finish and
  // end up with nothing persisted. Force an explicit choice instead.

  overlay.innerHTML = `
    <div class="quick-entry-modal" style="max-width:360px;text-align:center;padding:24px">
      <h3 style="margin:0 0 8px">Finish Workout</h3>
      <p style="margin:0 0 20px;color:var(--color-text-muted);font-size:0.9rem">You have unlogged sets remaining.</p>
      <button class="btn-primary" style="width:100%;margin-bottom:10px" onclick="document.getElementById('live-finish-choice').remove();_commitLiveWorkout(true)">Log Everything as Planned</button>
      <button class="btn-secondary" style="width:100%;margin-bottom:10px" onclick="document.getElementById('live-finish-choice').remove();_commitLiveWorkout(false)">Save What I Completed</button>
      <button class="btn-secondary" style="width:100%;opacity:0.7" onclick="document.getElementById('live-finish-choice').remove()">Keep Going</button>
    </div>
  `;

  document.body.appendChild(overlay);
}

async function _commitLiveWorkout(logAll) {
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
        // Carry the superset grouping forward so the completed-workout
        // renderer (workouts.js buildExerciseTableHTML) can rebuild the
        // "SUPERSET — N SETS" blocks. Without these, the completion view
        // collapses into a flat list and the user can't tell what was
        // supersetted with what.
        exercises.push({
          name: ex.name,
          sets: String(doneSets.length),
          reps: mainReps,
          weight: mainWeight,
          setDetails: (!allSame && details.length > 1) ? details : undefined,
          ...(ex.supersetGroup ? { supersetGroup: ex.supersetGroup } : {}),
          ...(ex.supersetId    ? { supersetId:    ex.supersetId    } : {}),
          ...(ex.groupSets     ? { groupSets:     ex.groupSets     } : {}),
        });
      }
    });
  }

  // Look up session name from whichever source the card id points at.
  // t.sessionId is a card id like "session-sw-<id>" / "session-plan-<date>-<raceId>"
  // — strip the prefix so the match actually hits. The old code compared
  // the raw card id against s.id which never matched, so the Strava
  // upload was stuck on the "IronZ workout" fallback.
  let sessionName = "";
  try {
    const sid = String(t.sessionId || "");
    if (sid.startsWith("session-sw-")) {
      const rawId = sid.slice("session-sw-".length);
      const _sched = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
      const _sw = _sched.find(s => String(s.id) === rawId);
      if (_sw) sessionName = _sw.sessionName || "";
    } else if (sid.startsWith("session-plan-")) {
      const rest = sid.slice("session-plan-".length);
      const dashIdx = rest.indexOf("-", 11);
      const planDate = dashIdx > 0 ? rest.slice(0, dashIdx) : rest;
      const raceId   = dashIdx > 0 ? rest.slice(dashIdx + 1) : "";
      const _plan = typeof loadTrainingPlan === "function" ? loadTrainingPlan() : [];
      const _pe = _plan.find(p => p.date === planDate && String(p.raceId) === raceId);
      if (_pe) sessionName = _pe.sessionName || "";
    } else if (sid.startsWith("session-log-")) {
      const rawId = sid.slice("session-log-".length);
      const _logged = JSON.parse(localStorage.getItem("workouts") || "[]");
      const _lw = _logged.find(w => String(w.id) === rawId);
      if (_lw) sessionName = _lw.name || _lw.sessionName || "";
    }
  } catch {}
  if (!sessionName) {
    sessionName = (typeof _wTypeLabel === "function" ? _wTypeLabel(t.type) : t.type) + " Session";
  }

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

  const completedWorkout = {
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
    completedAt: new Date().toISOString(),
    isCompletion: true,
    liveTracked: true,
    isHyrox: !!t.isHyrox,
  };
  workouts.unshift(completedWorkout);
  localStorage.setItem("workouts", JSON.stringify(workouts));
  // Mark session as completed (persistent flag for the calendar's
  // "is this session done?" check).
  const meta = typeof loadCompletionMeta === "function" ? loadCompletionMeta() : {};
  meta[t.sessionId] = { workoutId, completedAt: new Date().toISOString() };
  localStorage.setItem("completedSessions", JSON.stringify(meta));
  // Finish succeeded → drop the mid-workout snapshot so we don't
  // prompt the user to resume an already-completed session.
  _clearLiveState();

  // Cross-device flush. Fire-and-forget — the pending-sync queue
  // already guarantees correctness on next load (replayPendingSyncs
  // upserts unsynced rows before refreshAllKeys), so we don't need
  // to block the UI on a network round-trip. Awaiting here was
  // hanging the Finish button when Supabase was slow or offline:
  // _closeLiveTracker never ran and the user saw nothing happen.
  if (typeof DB !== 'undefined') {
    // syncWorkouts schedules upserts into BOTH user_data (JSON blob,
    // source of truth for the athlete app) AND the structured `workouts`
    // table. Coach-client-detail reads from the structured table — without
    // this call the coach never sees live-tracked workouts as completed,
    // and matching the rating-modal's submit_assignment_feedback RPC
    // can't surface a "done" status either.
    if (DB.syncWorkouts) DB.syncWorkouts();
    if (DB.flushKey) {
      DB.flushKey('workouts').catch(e => console.warn('[IronZ] workouts flush failed', e && e.message));
      DB.flushKey('completedSessions').catch(e => console.warn('[IronZ] completedSessions flush failed', e && e.message));
    }
  }

  const dateStr = t.dateStr;
  const sessionId = t.sessionId;

  // BUGFIX 04-27 §F6: every commit path runs the celebration if it
  // hasn't already played from _logLiveSet. Covers cardio / circuit /
  // Hyrox / endurance Finish — those paths don't go through Log-set so
  // the in-line trigger never fired for them. The overlay is fixed +
  // pointer-events:none so it survives _closeLiveTracker tearing down
  // the live view; the bolt animates over the calendar as the user
  // exits.
  if (!t._celebrated) {
    t._celebrated = true;
    _celebrateWorkoutComplete();
  }

  // Tear down the live overlay BEFORE the shared finalize runs so
  // renderCalendar / renderDayDetail can rebuild the card cleanly.
  _closeLiveTracker();

  // BUGFIX 04-25 §5: shared post-commit pipeline. Same finalize call
  // saveSessionCompletion uses → guarantees Strava push, analytics,
  // render refresh, rating modal, stretch suggestion, level-up, and
  // hydration/nutrition recalc all run identically.
  if (typeof window !== "undefined" && typeof window.finalizeWorkoutCompletion === "function") {
    window.finalizeWorkoutCompletion(completedWorkout, {
      dateStr,
      sessionId,
      source: "live_tracker",
    });
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
    // Resolve the new exercise's own last-logged weight — prevents the
    // dumbbell-flye → cable-fly 35-lb carryover bug. Preserves the
    // prescribed reps so the Sets × Reps line stays coherent.
    const d = (typeof _resolveSwapDefaults === "function")
      ? _resolveSwapDefaults(newName, ex.reps)
      : { name: newName, weight: "", reps: ex.reps || "" };
    _liveTracker.exercises[exerciseIndex].name = d.name;
    _liveTracker.exercises[exerciseIndex].weight = d.weight;
    _liveTracker.exercises[exerciseIndex].reps = d.reps;
    _liveTracker.exercises[exerciseIndex].swappedFrom = oldName;
    _liveTracker.exercises[exerciseIndex].swapReason = "equipment_busy";
    // Reset per-set tracking so unlogged sets seed from the new
    // exercise's weight, not the old one. Done sets keep their logged
    // reps/weight — those are actuals the user just performed and
    // shouldn't be silently rewritten.
    const existingSets = _liveTracker.sets[exerciseIndex] || [];
    _liveTracker.sets[exerciseIndex] = existingSets.map(s => {
      if (s.done) return s;
      return { ...s, reps: d.reps, weight: d.weight };
    });
    _saveLiveState();
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
  _clearLiveState();
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
