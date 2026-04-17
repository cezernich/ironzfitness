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
  // Map generator intensity labels to the effort format the card renderer expects
  function _intensityToEffort(intensity) {
    if (!intensity) return "Z2";
    const s = String(intensity).toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (s === "z1" || s === "z1_default") return "Z1";
    if (s === "z2") return "Z2";
    if (s === "z3") return "Z3";
    if (s === "z4" || s === "z4_effort") return "Z4";
    if (s === "z5") return "Z5";
    if (s === "z6") return "Z6";
    if (/rest|rw|walk/.test(s)) return "RW";
    return "Z2";
  }

  // Convert generator phases → aiSession.intervals so the existing card
  // renderer (buildAiIntervalsList + buildIntensityStrip) can display them.
  function _phasesToIntervals(phases) {
    if (!Array.isArray(phases)) return [];
    const nameMap = {
      warmup: "Warm Up", cooldown: "Cool Down", main: "Main Set",
      main_set: "Main Set", main_cruise_intervals: "Cruise Intervals",
      optional_finish: "M-Pace Finish", optional_mp_finish: "M-Pace Finish",
    };
    return phases.map(p => {
      // Determine per-rep duration string:
      // - rep_distance (e.g. "800m") → use distance as duration label
      // - rep_duration_min (e.g. 20) → use per-rep minutes
      // - Otherwise fall back to total duration_min
      let dur;
      if (p.rep_count && p.rep_count > 1 && p.rep_distance) {
        dur = p.rep_distance;
      } else if (p.rep_duration_min) {
        dur = `${p.rep_duration_min} min`;
      } else {
        dur = p.duration_min ? `${p.duration_min} min` : (p.distance_m ? `${p.distance_m}m` : "");
      }
      // Use reps from rep_count (track) or reps (tempo)
      const repCount = p.rep_count || p.reps || 0;
      return {
        name: nameMap[p.phase] || (p.phase || "Interval").replace(/_/g, " "),
        duration: dur,
        effort: _intensityToEffort(p.intensity),
        details: p.instruction || p.target || "",
        ...(repCount > 1 ? { reps: repCount } : {}),
      };
    });
  }

  function planEntryFor(workout, dateStr, notes) {
    const intervals = _phasesToIntervals(workout.phases);
    return {
      id: "user-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36),
      date: dateStr,
      type: workout.type,
      sessionName: workout.title,
      duration: workout.estimated_duration_min,
      is_hard: workout.is_hard,
      source: "user_added",
      notes: notes || "",
      // Store as aiSession so the card renderer shows the intensity strip
      // + step list via buildAiIntervalsList / buildIntensityStrip.
      aiSession: {
        title: workout.title,
        intervals,
      },
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
  function save(generatedWorkout, dateStr, mode, notes) {
    const Planner = (typeof window !== "undefined" && window.Planner) || null;
    const entry = planEntryFor(generatedWorkout, dateStr, notes);
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

    // Save to workoutSchedule (the user-added store) — drives the calendar
    // week view and day-detail session cards.
    const schedule = _readSchedule();
    schedule.push(entry);
    _writeSchedule(schedule);

    // NOTE: previously this flow also mirror-wrote a `workouts` record with
    // isCompletion:true so newly-added sessions would appear in workout
    // history + stats. That was wrong — Add Running Session is a *planning*
    // flow (stores to workoutSchedule), so the mirror pre-marked unfinished
    // plans as completed: calendar cells turned green and stats counted
    // plans as done. The correct completion path is the normal Mark as
    // Complete / live-tracker flow, which writes its own workouts record
    // when the session is actually finished.

    // Refresh the calendar so the new entry shows immediately.
    try {
      if (typeof renderCalendar === "function") renderCalendar();
      if (typeof renderDayDetail === "function") renderDayDetail(dateStr);
      if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
      if (typeof renderStats === "function") renderStats();
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
          <label class="ars-dismiss-row">
            <input type="checkbox" id="ars-stress-dismiss" />
            <span>Don't show this warning again</span>
          </label>
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
    const dismissIfChecked = () => {
      if (overlay.querySelector("#ars-stress-dismiss")?.checked && warning.rule) {
        _dismissStressRule(warning.rule);
      }
    };
    overlay.querySelector("#ars-stress-cancel").onclick = () => { _close(id); onResolve("cancel"); };
    overlay.querySelector("#ars-stress-other-day").onclick = () => { _close(id); onResolve("pick_different_day"); };
    overlay.querySelector("#ars-stress-save").onclick = () => { dismissIfChecked(); _close(id); onResolve("save_anyway"); };
  }

  const _STRESS_DISMISS_KEY = "runStressDismissedRules";
  function _getDismissedStressRules() {
    try { return JSON.parse(localStorage.getItem(_STRESS_DISMISS_KEY)) || []; }
    catch { return []; }
  }
  function _dismissStressRule(rule) {
    const cur = new Set(_getDismissedStressRules());
    cur.add(rule);
    localStorage.setItem(_STRESS_DISMISS_KEY, JSON.stringify([...cur]));
    if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey(_STRESS_DISMISS_KEY);
  }
  function _isStressRuleDismissed(rule) {
    return _getDismissedStressRules().includes(rule);
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

  function open(initialDateStr, opts) {
    const STL = window.SessionTypeLibrary;
    const RWG = window.RunningWorkoutGenerator;
    const ZC  = window.ZoneCalculator;
    if (!STL || !RWG || !ZC) {
      console.error("[IronZ] Add Running Session: required modules not loaded.");
      return;
    }

    opts = opts || {};
    const onSave  = typeof opts.onSave === "function" ? opts.onSave : null;
    const context = opts.context || "calendar";
    // plan-manual context (Build Your Own Plan): template is per-day-of-week,
    // so a calendar date is meaningless. Hide the date row and skip the
    // hard-block / conflict / stress checks, which are all calendar-scoped.
    const isPlanManual = context === "plan-manual";

    const id = "ars-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay";
    overlay.onclick = e => { if (e.target === overlay) _close(id); };

    const types = STL.SESSION_TYPES;
    const optionsHtml = types.map(t => `<option value="${_esc(t.id)}">${_esc(t.label)}</option>`).join("");

    const dateFieldHtml = isPlanManual ? "" : `
          <label class="post-test-field">
            <span>Date</span>
            <input type="date" id="ars-date" value="${_esc(initialDateStr || _todayStr())}">
          </label>`;

    const manualBtnHtml = isPlanManual ? "" : `
          <button class="rating-skip-btn" id="ars-manual-toggle" type="button">Add Manually</button>`;

    overlay.innerHTML = `
      <div class="rating-modal post-test-modal ars-modal">
        <div class="ars-modal-header">
          <button class="qe-back-btn" id="ars-back" type="button">&larr; Back</button>
          <span class="ars-modal-title">Add Running Session</span>
          <button class="qe-close-btn" id="ars-close" type="button">&#10005;</button>
        </div>

        <!-- Generator view (default) -->
        <div class="post-test-modal-body" id="ars-body-generator">
          ${dateFieldHtml}
          <label class="post-test-field">
            <span>Session type</span>
            <select id="ars-type">${optionsHtml}</select>
          </label>
          <label class="post-test-field" id="ars-duration-row">
            <span>Duration (min) <span id="ars-duration-display"></span></span>
            <input type="range" id="ars-duration" min="20" max="180" step="5">
          </label>
          <div id="ars-preview" class="ars-preview"></div>
          <label class="post-test-field">
            <span>Notes (optional)</span>
            <textarea id="ars-notes" rows="2" placeholder="e.g. Legs felt heavy, hot weather"></textarea>
          </label>
        </div>

        <div class="post-test-modal-actions">
          ${manualBtnHtml}
          <button class="rating-save-btn" id="ars-save" type="button">Save</button>
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
    // In plan-manual context the date field is omitted; use today as the
    // fallback everywhere the existing code pulls from $date.value.
    const _dateValue = () => ($date ? $date.value : (initialDateStr || _todayStr()));

    let _variantOffset = 0;

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
      // Snap the default slider position to a multiple of 5 so long_run
      // (and every other type that uses this flow) matches the generator's
      // rounded output — otherwise the slider can land at e.g. 112.5 → 113
      // while the generated workout shows 115 min.
      const rawMid = isArrayRange ? (lo + hi) / 2 : 45;
      const mid = Math.max(5, Math.round(rawMid / 5) * 5);
      const sliderMax = Math.max(Math.round(mid * 1.5), tmpl.max_duration_min || 0);
      $dur.min = String(Math.max(15, Math.round(mid * 0.5)));
      $dur.max = String(sliderMax);
      if (!$dur.dataset.touched) $dur.value = String(mid);
      const result = RWG.generateRunWorkout({
        sessionTypeId,
        userZones: zones,
        experienceLevel: experience,
        durationOverrideMin: parseInt($dur.value, 10),
        weeksSincePlanStart: _weeksSincePlanStart(),
        variantOffset: _variantOffset
      });
      const w = result.workout;
      $durDisplay.textContent = `(${w.estimated_duration_min} min)`;
      const warnHtml = (w.warnings || []).length
        ? `<div class="ars-warnings">${w.warnings.map(x => `• ${_esc(x)}`).join("<br>")}</div>`
        : "";
      $preview.innerHTML = `
        <div class="ars-preview-header">
          <div class="ars-preview-title">${_esc(w.title)}</div>
          <button type="button" class="ars-shuffle-btn" id="ars-shuffle" title="Try a different workout"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg></button>
        </div>
        <div class="ars-preview-why">${_esc(w.why_text || "")}</div>
        <div class="ars-phases">${_renderPhasesHtml(w.phases)}</div>
        <div class="ars-meta">~${w.estimated_duration_min} min · ${w.is_hard ? "Hard" : "Easy"}</div>
        ${warnHtml}
      `;
      overlay.querySelector("#ars-shuffle").onclick = () => { _variantOffset++; refreshPreview(); };
      // Stash the current generated workout on the modal for save().
      overlay._currentWorkout = w;
    }

    $type.onchange = () => { _variantOffset = 0; delete $dur.dataset.touched; refreshPreview(); };
    $dur.oninput = () => { $dur.dataset.touched = "1"; refreshPreview(); };
    if ($date) $date.onchange = () => refreshPreview();
    refreshPreview();

    // Header: Back returns to Quick Entry type picker; X closes outright.
    // In plan-manual context we reopen cp-ai-modal instead — that's where
    // the user came from (CYOP AI type picker).
    overlay.querySelector("#ars-back").onclick = () => {
      _close(id);
      if (isPlanManual) {
        const cpModal = document.getElementById("cp-ai-modal");
        if (cpModal) cpModal.classList.add("is-open");
        return;
      }
      try {
        if (typeof window.openQuickEntry === "function") {
          window.openQuickEntry(_dateValue());
        }
      } catch {}
    };
    overlay.querySelector("#ars-close").onclick = () => _close(id);

    // "Add Manually" closes this modal and opens the Quick Entry cardio
    // manual editor (interval rows with zone selectors, drag-and-drop,
    // etc.) — the same editor used by other cardio types. Omitted in
    // plan-manual context (no QE cardio manual editor there yet).
    const manualToggle = overlay.querySelector("#ars-manual-toggle");
    if (manualToggle) {
      manualToggle.onclick = () => {
        const d = _dateValue();
        _close(id);
        if (typeof window.openQuickEntryCardioManual === "function") {
          window.openQuickEntryCardioManual(d, "running");
        }
      };
    }

    overlay.querySelector("#ars-save").onclick = () => {
      const w = overlay._currentWorkout;
      const date = _dateValue();
      const notes = (overlay.querySelector("#ars-notes")?.value || "").trim();
      if (!w || !date) return;

      // Plan-manual (CYOP) context: hand the workout to the caller's
      // onSave and close. No calendar date to conflict with, no per-week
      // stress check applicable to a template day-of-week.
      if (onSave) {
        onSave(w, date, notes);
        _close(id);
        return;
      }

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
        const activeWarnings = (c2.warnings || []).filter(w0 => !_isStressRuleDismissed(w0.rule));
        if (activeWarnings.length) {
          // Surface the highest-priority warning (weekly_hard_count first if present).
          const stress = activeWarnings.find(x => x.rule === "weekly_hard_count") || activeWarnings[0];
          _showStressCheckModal(stress, decision => {
            if (decision === "save_anyway") {
              save(w, date, mode, notes);
              _close(id);
            } else if (decision === "pick_different_day") {
              // leave the main modal open; user will change date
            } else {
              // cancel — leave the main modal open
            }
          });
        } else {
          save(w, date, mode, notes);
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
