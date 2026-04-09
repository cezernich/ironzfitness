// add-running-session-flow.js
// Add Running Session flow + modal UI.
// Wires the dropdown picker, the deterministic generator, the conflict modal,
// and the weekly stress check modal.
//
// Implements PHILOSOPHY_UPDATE_2026-04-09_run_session_types.md.
// Public surface: window.AddRunningSessionFlow.{ open, save, planEntryFor }

(function () {
  "use strict";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function _todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function _mondayOf(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const dow = d.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function _addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function _readProfile() {
    try { return JSON.parse(localStorage.getItem("profile") || "{}"); } catch { return {}; }
  }

  function _readSchedule() {
    try { return JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch { return []; }
  }
  function _writeSchedule(s) {
    localStorage.setItem("workoutSchedule", JSON.stringify(s));
    if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
  }

  function _experienceLevel(profile) {
    const lv = (profile && (profile.experience_level || profile.level || profile.runLevel)) || "intermediate";
    return ["beginner", "intermediate", "advanced"].includes(lv) ? lv : "intermediate";
  }

  function _weeksSincePlanStart() {
    // Best-effort: derive from the earliest entry in trainingPlan, else 0.
    try {
      const plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]");
      if (!plan.length) return 0;
      const dates = plan.map(p => p.date).filter(Boolean).sort();
      const start = new Date(dates[0] + "T00:00:00").getTime();
      const today = new Date().getTime();
      return Math.max(0, Math.floor((today - start) / (7 * 86400000)));
    } catch { return 0; }
  }

  /**
   * Look up the planned workout (if any) for a given date. Checks both
   * trainingPlan and workoutSchedule.
   */
  function plannedWorkoutForDate(dateStr) {
    let plan = [];
    let schedule = [];
    try { plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]"); } catch {}
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
    const fromPlan = plan.find(e => e.date === dateStr);
    if (fromPlan) return Object.assign({ source: "trainingPlan" }, fromPlan);
    const fromSched = schedule.find(e => e.date === dateStr);
    if (fromSched) return Object.assign({ source: "workoutSchedule" }, fromSched);
    return null;
  }

  /**
   * Convert a generator output to a workoutSchedule entry.
   */
  function planEntryFor(workout, dateStr) {
    return {
      id: "user-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36),
      date: dateStr,
      type: workout.type,
      sessionName: workout.title,
      duration: workout.estimated_duration_min,
      is_hard: workout.is_hard,
      source: "user_added",
      phases: workout.phases,
      why_text: workout.why_text,
      rotation_index: workout.rotation_index,
      rotation_name: workout.rotation_name,
      sub_template: workout.sub_template,
      created_at: new Date().toISOString(),
    };
  }

  // ─── Hard-constraint checks (philosophy hard rules) ──────────────────────────

  /**
   * Run all the constraint checks for a candidate save. Returns:
   *   { hardBlocks: [{ rule, message }], warnings: [{ rule, message }] }
   * `hardBlocks` are non-overridable (today only "Long Run cap = 1/week").
   * Everything else is a warning the user can override per the spec.
   */
  // Per-session scheduling rules now live in the shared js/workout-validator.js
  // module. Both this flow and js/workout-import-validator.js consume them
  // from there so changing a rule in one place changes everywhere.
  // Tiny local fallback for the rare case where workout-validator.js hasn't
  // loaded yet at module-eval time.
  const _LOCAL_HARD_TYPES = new Set(["long_run", "tempo_threshold", "track_workout", "speed_work", "hills"]);
  const _LOCAL_HARD_LOADS = new Set(["long", "hard", "moderate"]);
  function _isHardLocal(entry) {
    if (!entry) return false;
    if (entry.type && _LOCAL_HARD_TYPES.has(entry.type)) return true;
    if (entry.is_hard === true) return true;
    if (entry.load && _LOCAL_HARD_LOADS.has(entry.load)) return true;
    return false;
  }

  function evaluateConstraints(candidate, dateStr) {
    let plan = [];
    let schedule = [];
    try { plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]"); } catch {}
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
    const profile = _readProfile();
    const experience = _experienceLevel(profile);

    // Delegate to the shared rule module. This is the single source of truth
    // for per-session scheduling constraints.
    const WV = (typeof window !== "undefined" && window.WorkoutValidator) || null;
    if (WV && WV.evaluateConstraints) {
      return WV.evaluateConstraints({
        candidate,
        dateStr,
        plan,
        schedule,
        experienceLevel: experience,
      });
    }

    // Fallback: minimal Long Run cap check so the UI doesn't crash if the
    // shared module hasn't loaded. Should never trigger in practice because
    // workout-validator.js loads before add-running-session-flow.js in index.html.
    const hardBlocks = [];
    if (candidate.type === "long_run") {
      const monday = _mondayOf(dateStr);
      const dates = new Set(Array.from({ length: 7 }, (_, i) => _addDays(monday, i)));
      const weekEntries = plan.concat(schedule).filter(e => dates.has(e.date));
      const existingLong = weekEntries.find(e => (e.type === "long_run") || (e.load === "long"));
      if (existingLong) {
        hardBlocks.push({
          rule: "long_run_cap",
          severity: "block",
          message: `Long Run is capped at 1 per week, full stop. You already have a Long Run on ${existingLong.date}.`,
        });
      }
    }
    return { hardBlocks, warnings: [] };
  }

  // ─── Save paths ──────────────────────────────────────────────────────────────

  /**
   * Save a generated workout to the schedule. Pure data operation —
   * the modal layer calls this after the user has cleared the conflict +
   * stress-check modals.
   */
  function save(generatedWorkout, dateStr, mode) {
    const Planner = (typeof window !== "undefined" && window.Planner) || null;
    const entry = planEntryFor(generatedWorkout, dateStr);
    const monday = _mondayOf(dateStr);

    if (mode === "replace") {
      const existing = plannedWorkoutForDate(dateStr);
      if (existing && Planner && Planner.removeWorkout && existing.id) {
        const removed = Planner.removeWorkout(existing.id);
        if (removed && Planner.rebalanceWeek) {
          Planner.rebalanceWeek(monday, { removedDurationMin: parseFloat(removed.duration) || 0 });
        }
      } else if (existing && existing.source === "trainingPlan") {
        // Plan entries from trainingPlan may not have a stable id; remove by date.
        try {
          const plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]");
          const filtered = plan.filter(e => e.date !== dateStr);
          localStorage.setItem("trainingPlan", JSON.stringify(filtered));
          if (typeof DB !== "undefined" && DB.syncTrainingPlan) DB.syncTrainingPlan();
          if (Planner && Planner.rebalanceWeek) {
            Planner.rebalanceWeek(monday, { removedDurationMin: parseFloat(existing.duration) || 0 });
          }
        } catch (e) { console.warn("[IronZ] replace fallback failed:", e.message); }
      }
    }

    // Save to workoutSchedule (the user-added store).
    const schedule = _readSchedule();
    schedule.push(entry);
    _writeSchedule(schedule);

    // Refresh the calendar so the new entry shows immediately.
    try {
      if (typeof renderCalendar === "function") renderCalendar();
      if (typeof renderDayDetail === "function") renderDayDetail(dateStr);
    } catch {}
    return entry;
  }

  // ─── Modal: workout preview ─────────────────────────────────────────────────

  function _renderPhasesHtml(phases) {
    return phases.map((p, i) => `
      <div class="ars-phase">
        <div class="ars-phase-num">${i + 1}</div>
        <div class="ars-phase-body">
          <div class="ars-phase-name">${_esc(p.phase.replace(/_/g, " "))}</div>
          <div class="ars-phase-instr">${_esc(p.instruction || p.target || "")}</div>
        </div>
      </div>
    `).join("");
  }

  function _close(id) {
    const o = document.getElementById(id);
    if (o) {
      o.classList.remove("visible");
      setTimeout(() => o.remove(), 200);
    }
  }

  function _showConflictModal(existing, candidate, dateStr, onResolve) {
    const id = "ars-conflict-overlay";
    const existingId = existing && document.getElementById(id);
    if (existingId) existingId.remove();
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay";
    overlay.onclick = e => { if (e.target === overlay) _close(id); };
    overlay.innerHTML = `
      <div class="rating-modal post-test-modal">
        <div class="post-test-modal-title">Already a workout on this day</div>
        <div class="post-test-modal-body">
          <p>You already have <b>${_esc(existing.sessionName || existing.title || existing.type || "a planned workout")}</b> scheduled for ${_esc(dateStr)}. What do you want to do?</p>
        </div>
        <div class="post-test-modal-actions">
          <button class="rating-skip-btn" id="ars-conflict-cancel">Cancel</button>
          <button class="rating-skip-btn" id="ars-conflict-add">Add as second</button>
          <button class="rating-save-btn" id="ars-conflict-replace">Replace it</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("#ars-conflict-cancel").onclick = () => { _close(id); onResolve("cancel"); };
    overlay.querySelector("#ars-conflict-add").onclick    = () => { _close(id); onResolve("add"); };
    overlay.querySelector("#ars-conflict-replace").onclick = () => { _close(id); onResolve("replace"); };
  }

  function _showStressCheckModal(warning, onResolve) {
    const id = "ars-stress-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();
    const itemsHtml = (warning.items || []).map(it => `<li>${_esc(it.date)} — ${_esc(it.title)}</li>`).join("");
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay";
    overlay.onclick = e => { if (e.target === overlay) _close(id); };
    overlay.innerHTML = `
      <div class="rating-modal post-test-modal">
        <div class="post-test-modal-title">Heads up — stress check</div>
        <div class="post-test-modal-body">
          <p>${_esc(warning.message)}</p>
          ${itemsHtml ? `<p><b>Already this week:</b></p><ul class="ars-list">${itemsHtml}</ul>` : ""}
          <p>Are you sure you want to save?</p>
        </div>
        <div class="post-test-modal-actions">
          <button class="rating-skip-btn" id="ars-stress-cancel">Cancel</button>
          <button class="rating-skip-btn" id="ars-stress-other-day">Pick different day</button>
          <button class="rating-save-btn" id="ars-stress-save">Save anyway</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("#ars-stress-cancel").onclick = () => { _close(id); onResolve("cancel"); };
    overlay.querySelector("#ars-stress-other-day").onclick = () => { _close(id); onResolve("pick_different_day"); };
    overlay.querySelector("#ars-stress-save").onclick = () => { _close(id); onResolve("save_anyway"); };
  }

  function _showHardBlockModal(blocks) {
    const id = "ars-block-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay";
    overlay.onclick = e => { if (e.target === overlay) _close(id); };
    overlay.innerHTML = `
      <div class="rating-modal post-test-modal">
        <div class="post-test-modal-title">Can't add this session</div>
        <div class="post-test-modal-body">
          ${blocks.map(b => `<p>${_esc(b.message)}</p>`).join("")}
        </div>
        <div class="post-test-modal-actions">
          <button class="rating-save-btn" id="ars-block-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("#ars-block-ok").onclick = () => _close(id);
  }

  // ─── Top-level modal: pick type, preview, save ───────────────────────────────

  function open(initialDateStr) {
    const STL = window.SessionTypeLibrary;
    const RWG = window.RunningWorkoutGenerator;
    const ZC  = window.ZoneCalculator;
    if (!STL || !RWG || !ZC) {
      console.error("[IronZ] Add Running Session: required modules not loaded.");
      return;
    }

    const id = "ars-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay";
    overlay.onclick = e => { if (e.target === overlay) _close(id); };

    const types = STL.SESSION_TYPES;
    const optionsHtml = types.map(t => `<option value="${_esc(t.id)}">${_esc(t.label)}</option>`).join("");

    overlay.innerHTML = `
      <div class="rating-modal post-test-modal ars-modal">
        <div class="post-test-modal-title">Add Running Session</div>
        <div class="post-test-modal-body">
          <label class="post-test-field">
            <span>Date</span>
            <input type="date" id="ars-date" value="${_esc(initialDateStr || _todayStr())}">
          </label>
          <label class="post-test-field">
            <span>Session type</span>
            <select id="ars-type">${optionsHtml}</select>
          </label>
          <label class="post-test-field" id="ars-duration-row">
            <span>Duration (min) <span id="ars-duration-display"></span></span>
            <input type="range" id="ars-duration" min="20" max="180" step="5">
          </label>
          <div id="ars-preview" class="ars-preview"></div>
        </div>
        <div class="post-test-modal-actions">
          <button class="rating-skip-btn" id="ars-cancel">Cancel</button>
          <button class="rating-save-btn" id="ars-save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const $date = overlay.querySelector("#ars-date");
    const $type = overlay.querySelector("#ars-type");
    const $dur  = overlay.querySelector("#ars-duration");
    const $durDisplay = overlay.querySelector("#ars-duration-display");
    const $preview = overlay.querySelector("#ars-preview");

    function refreshPreview() {
      const profile = _readProfile();
      const experience = _experienceLevel(profile);
      const zones = ZC.getZonesForUser(profile.id);
      const sessionTypeId = $type.value;
      const tmpl = STL.getSessionTypeById(sessionTypeId);
      const range = (tmpl.experience_scaling && tmpl.experience_scaling[experience])
        || tmpl.default_duration_min || [30, 60];
      const isArrayRange = Array.isArray(range);
      const lo = isArrayRange ? range[0] : 30;
      const hi = isArrayRange ? range[1] : 90;
      // Slider bounds must match the generator's clamp range, otherwise the
      // slider can land in territory that gets silently clamped and the
      // displayed minutes won't match the slider position. Honor a per-template
      // `max_duration_min` (e.g. endurance up to 150) when present.
      const mid = isArrayRange ? Math.round((lo + hi) / 2) : 45;
      const sliderMax = Math.max(Math.round(mid * 1.5), tmpl.max_duration_min || 0);
      $dur.min = String(Math.max(15, Math.round(mid * 0.5)));
      $dur.max = String(sliderMax);
      if (!$dur.dataset.touched) $dur.value = String(mid);
      const result = RWG.generateRunWorkout({
        sessionTypeId,
        userZones: zones,
        experienceLevel: experience,
        durationOverrideMin: parseInt($dur.value, 10),
        weeksSincePlanStart: _weeksSincePlanStart()
      });
      const w = result.workout;
      $durDisplay.textContent = `(${w.estimated_duration_min} min)`;
      const warnHtml = (w.warnings || []).length
        ? `<div class="ars-warnings">${w.warnings.map(x => `• ${_esc(x)}`).join("<br>")}</div>`
        : "";
      $preview.innerHTML = `
        <div class="ars-preview-title">${_esc(w.title)}</div>
        <div class="ars-preview-why">${_esc(w.why_text || "")}</div>
        <div class="ars-phases">${_renderPhasesHtml(w.phases)}</div>
        <div class="ars-meta">~${w.estimated_duration_min} min · ${w.is_hard ? "Hard" : "Easy"}</div>
        ${warnHtml}
      `;
      // Stash the current generated workout on the modal for save().
      overlay._currentWorkout = w;
    }

    $type.onchange = () => { delete $dur.dataset.touched; refreshPreview(); };
    $dur.oninput = () => { $dur.dataset.touched = "1"; refreshPreview(); };
    $date.onchange = () => refreshPreview();
    refreshPreview();

    overlay.querySelector("#ars-cancel").onclick = () => _close(id);
    overlay.querySelector("#ars-save").onclick = () => {
      const w = overlay._currentWorkout;
      const date = $date.value;
      if (!w || !date) return;

      // 1. Hard-block evaluation (only Long Run cap today).
      const c1 = evaluateConstraints(w, date);
      if (c1.hardBlocks.length) {
        _showHardBlockModal(c1.hardBlocks);
        return;
      }

      // 2. Conflict check.
      const existing = plannedWorkoutForDate(date);
      const proceedAfterStressCheck = (mode) => {
        const c2 = evaluateConstraints(w, date);
        if (c2.warnings.length) {
          // Surface the highest-priority warning (weekly_hard_count first if present).
          const stress = c2.warnings.find(x => x.rule === "weekly_hard_count") || c2.warnings[0];
          _showStressCheckModal(stress, decision => {
            if (decision === "save_anyway") {
              save(w, date, mode);
              _close(id);
            } else if (decision === "pick_different_day") {
              // leave the main modal open; user will change date
            } else {
              // cancel — leave the main modal open
            }
          });
        } else {
          save(w, date, mode);
          _close(id);
        }
      };

      if (existing) {
        _showConflictModal(existing, w, date, decision => {
          if (decision === "cancel") return;
          if (decision === "replace" || decision === "add") {
            proceedAfterStressCheck(decision === "replace" ? "replace" : "add");
          }
        });
      } else {
        proceedAfterStressCheck("add");
      }
    };
  }

  const api = {
    open,
    save,
    plannedWorkoutForDate,
    planEntryFor,
    evaluateConstraints,
  };

  if (typeof window !== "undefined") window.AddRunningSessionFlow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
