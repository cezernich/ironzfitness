// js/ui/circuit-builder.js
//
// Every screen in mockups/circuit-mockup.html that isn't the already-saved card:
//   - Screen 1e: Add Circuit Session entry point (intensity / duration /
//     focus / notes → Generate or Log Manually)
//   - Screen 1f: Generated circuit preview with Save / Regenerate
//   - Screen 2:  Benchmark library with Benchmarks / My Circuits / Ask IronZ tabs
//   - Screen 3:  Manual circuit builder (drag handles omitted for MVP —
//                add/delete/edit actions, nested repeat blocks)
//   - Screen 4 / 4b: Completion modal (For Time mm:ss input + PR comparison,
//     AMRAP rounds + extra reps inputs)
//
// All six screens share the same `.circuit-modal-overlay` + `.circuit-modal`
// shell so they feel like a cohesive wizard. Opens on top of anything
// else via z-index 10070.

(function () {
  "use strict";

  function _esc(s) {
    if (s == null) return "";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  // ── Modal plumbing ──────────────────────────────────────────────────────

  function _mountModal(id, innerHtml) {
    _closeModal(id);
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "circuit-modal-overlay";
    overlay.innerHTML = `<div class="circuit-modal">${innerHtml}</div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) _closeModal(id);
    });
    return overlay;
  }

  function _closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("is-open");
    setTimeout(() => { if (el.parentNode) el.remove(); }, 200);
  }

  function _modalHeader(title, backFn) {
    const backBtn = backFn
      ? `<button class="circuit-modal-back" onclick="${backFn}">← Back</button>`
      : `<span class="circuit-modal-back-spacer"></span>`;
    return `
      <div class="circuit-modal-header">
        ${backBtn}
        <span class="circuit-modal-title">${_esc(title)}</span>
        <button class="circuit-modal-close" onclick="window.CircuitBuilder.closeAll()">✕</button>
      </div>`;
  }

  function _modalDots(current, total) {
    let html = '<div class="circuit-modal-dots">';
    for (let i = 0; i < total; i++) {
      html += `<div class="circuit-modal-dot${i === current ? " is-active" : ""}"></div>`;
    }
    html += "</div>";
    return html;
  }

  // ── Session id for the wizard state ─────────────────────────────────────
  let _currentEntryDraft = null;   // live state for entry → preview flow
  let _currentDateStr = null;
  // Unified Workout Builder (docs/BUILDER_INVENTORY.md, UNIFIED_BUILDER_SPEC.md).
  // When set via openEntryFlow(dateStr, { onSave }), the save path calls
  // this callback with the normalized workout object instead of writing
  // directly to localStorage. Falls back to saveToCalendar for Add Session
  // callers that still use the single-arg signature.
  let _onSave = null;
  let _context = "calendar"; // "calendar" | "plan-manual"

  // ── Entry screen (Screen 1e) ────────────────────────────────────────────
  function openEntryFlow(dateStr, opts) {
    opts = opts || {};
    _currentDateStr = dateStr || (new Date().toISOString().slice(0, 10));
    _onSave  = typeof opts.onSave === "function" ? opts.onSave : null;
    _context = opts.context || "calendar";

    // Edit mode: skip the entry screen and open the manual builder
    // pre-filled with the existing circuit (from cpWeekTemplate or the
    // calendar's workouts row). Keeps the same save-emit path.
    if (opts.existing) {
      const e = opts.existing;
      const src = (e.data && e.data.circuit) || e.circuit || e;
      openManualBuilder({
        name: src.name || (e.data && e.data.sessionName) || e.name || "",
        goal: src.goal || "for_time",
        goal_value: src.goal_value || null,
        steps: Array.isArray(src.steps) ? JSON.parse(JSON.stringify(src.steps)) : [],
      });
      return;
    }

    _currentEntryDraft = {
      intensity: "moderate",
      duration: 30,
      focus: "bodyweight",
      notes: "",
    };

    const intensityOptions = ["light", "moderate", "intense"];
    const durationOptions = [15, 20, 30, 45, 60];
    const focusOptions = [
      { id: "bodyweight", label: "Bodyweight" },
      { id: "barbell", label: "With Barbell" },
      { id: "kb", label: "With KB" },
      { id: "mixed", label: "Mixed" },
    ];

    const body = `
      ${_modalHeader("Circuit Session", "window.CircuitBuilder._backFromEntry()")}
      ${_modalDots(0, 3)}
      <div class="circuit-modal-body">
        <div class="builder-field">
          <div class="builder-label">Intensity</div>
          <select class="builder-input builder-select" id="circuit-entry-intensity">
            ${intensityOptions.map(i =>
              `<option value="${i}"${i === "moderate" ? " selected" : ""}>${i[0].toUpperCase() + i.slice(1)}</option>`
            ).join("")}
          </select>
        </div>

        <div class="builder-field">
          <div class="builder-label">Duration</div>
          <select class="builder-input builder-select" id="circuit-entry-duration">
            ${durationOptions.map(d =>
              `<option value="${d}"${d === 30 ? " selected" : ""}>${d} min</option>`
            ).join("")}
          </select>
        </div>

        <div class="builder-field">
          <div class="builder-label">Focus (Optional)</div>
          <div class="focus-chip-row" id="circuit-entry-focus">
            ${focusOptions.map(f =>
              `<button class="focus-chip${f.id === "bodyweight" ? " is-active" : ""}" data-focus="${f.id}">${_esc(f.label)}</button>`
            ).join("")}
          </div>
        </div>

        <div class="builder-field">
          <div class="builder-label">Notes (Optional)</div>
          <input class="builder-input" id="circuit-entry-notes" placeholder="e.g. No pull-up bar today">
        </div>
      </div>
      <div class="circuit-modal-footer circuit-modal-footer--dual">
        <button class="circuit-btn circuit-btn-primary" onclick="window.CircuitBuilder.generateFromEntry()">Generate Workout</button>
        <button class="circuit-btn circuit-btn-secondary" onclick="window.CircuitBuilder.openManualBuilder()">Log Manually</button>
      </div>`;

    _mountModal("circuit-entry-modal", body);

    // Wire focus chip toggling
    const focusRow = document.getElementById("circuit-entry-focus");
    if (focusRow) {
      focusRow.addEventListener("click", (e) => {
        const btn = e.target.closest(".focus-chip");
        if (!btn) return;
        focusRow.querySelectorAll(".focus-chip").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        _currentEntryDraft.focus = btn.dataset.focus;
      });
    }
  }

  // ── Preview (Screen 1f) ─────────────────────────────────────────────────
  function generateFromEntry() {
    // Pull current form values
    const intensity = document.getElementById("circuit-entry-intensity")?.value || "moderate";
    const duration = parseInt(document.getElementById("circuit-entry-duration")?.value, 10) || 30;
    const notes = (document.getElementById("circuit-entry-notes")?.value || "").trim();
    const focus = _currentEntryDraft?.focus || "bodyweight";

    _currentEntryDraft = { intensity, duration, focus, notes };
    const circuit = _generateCircuitLocal(intensity, duration, focus, notes);
    _openPreview(circuit);
  }

  function regenerate() {
    if (!_currentEntryDraft) return;
    const { intensity, duration, focus, notes } = _currentEntryDraft;
    const circuit = _generateCircuitLocal(intensity, duration, focus, notes);
    _openPreview(circuit);
  }

  function _openPreview(circuit) {
    _closeModal("circuit-entry-modal");
    _closeModal("circuit-preview-modal");

    const previewHtml = window.CircuitCard
      ? window.CircuitCard.render(circuit, { subtitlePrefix: "Preview" })
      : `<pre>${_esc(JSON.stringify(circuit, null, 2))}</pre>`;

    const body = `
      ${_modalHeader("Circuit Session", "window.CircuitBuilder.openEntryFlowKeepingState()")}
      ${_modalDots(2, 3)}
      <div class="circuit-modal-body">
        <div class="circuit-preview-wrap">${previewHtml}</div>
      </div>
      <div class="circuit-modal-footer circuit-modal-footer--dual">
        <button class="circuit-btn circuit-btn-primary" onclick='window.CircuitBuilder.saveGeneratedCircuit()'>Save Session</button>
        <button class="circuit-btn circuit-btn-secondary" onclick="window.CircuitBuilder.regenerate()">Regenerate</button>
      </div>`;

    _mountModal("circuit-preview-modal", body);
    _currentPreviewCircuit = circuit;
  }

  function openEntryFlowKeepingState() {
    _closeModal("circuit-preview-modal");
    openEntryFlow(_currentDateStr);
  }

  let _currentPreviewCircuit = null;
  function saveGeneratedCircuit() {
    if (!_currentPreviewCircuit) return;
    _emitSave(_currentPreviewCircuit);
    _closeModal("circuit-preview-modal");
  }

  // ── Client-side circuit generator ───────────────────────────────────────
  //
  // Simple rule-based generator. Produces a title + step tree from
  // intensity/duration/focus, randomized so Regenerate yields variation.
  function _generateCircuitLocal(intensity, duration, focus, notes) {
    const _pick = arr => arr[Math.floor(Math.random() * arr.length)];

    const nameVariants = {
      bodyweight: ["Bodyweight Burner", "No-Equipment Grinder", "Pure BW Circuit", "Calisthenics Chipper"],
      barbell:    ["Barbell Blast", "Iron Tempo", "Barbell Complex", "Heavy Lifts Circuit"],
      kb:         ["KB Flow", "Kettlebell Chipper", "Swing & Squat", "KB Strength Circuit"],
      mixed:      ["Mixed Modality", "All-In Circuit", "Hybrid Grinder", "Functional Fitness"],
    };

    // Bodyweight exercise pool (no equipment)
    const bwExercises = [
      { name: "Burpees", reps: 10 },
      { name: "Air Squats", reps: 20 },
      { name: "Push-ups", reps: 15 },
      { name: "Sit-ups", reps: 15 },
      { name: "Mountain Climbers", reps: 30, per_side: true },
      { name: "Jumping Lunges", reps: 20 },
      { name: "Plank Shoulder Taps", reps: 20 },
      { name: "V-Ups", reps: 12 },
      { name: "Jumping Jacks", reps: 40 },
    ];

    const barbellExercises = [
      { name: "Deadlifts", reps: 10, weight: intensity === "intense" ? 185 : 135, weight_unit: "lbs" },
      { name: "Front Squats", reps: 10, weight: intensity === "intense" ? 135 : 95, weight_unit: "lbs" },
      { name: "Push Press", reps: 10, weight: intensity === "intense" ? 115 : 75, weight_unit: "lbs" },
      { name: "Thrusters", reps: 12, weight: intensity === "intense" ? 95 : 65, weight_unit: "lbs" },
      { name: "Barbell Rows", reps: 12, weight: intensity === "intense" ? 115 : 85, weight_unit: "lbs" },
    ];

    const kbExercises = [
      { name: "Kettlebell Swings", reps: 20, weight: 53, weight_unit: "lbs" },
      { name: "Goblet Squats", reps: 15, weight: 53, weight_unit: "lbs" },
      { name: "KB Snatches", reps: 10, weight: 44, weight_unit: "lbs", per_side: true },
      { name: "KB Clean & Press", reps: 8, weight: 44, weight_unit: "lbs", per_side: true },
      { name: "Russian Twists", reps: 30, weight: 35, weight_unit: "lbs" },
    ];

    const mixedExercises = [
      ...bwExercises.slice(0, 4),
      ...barbellExercises.slice(0, 2),
      ...kbExercises.slice(0, 2),
    ];

    const poolByFocus = {
      bodyweight: bwExercises,
      barbell: barbellExercises,
      kb: kbExercises,
      mixed: mixedExercises,
    };
    const pool = poolByFocus[focus] || bwExercises;

    // Decide shape: rounds × exercises
    const targetMinutes = duration;
    // Rough per-round time estimate (~3 min for moderate, 4 for intense, 2 for light)
    const perRoundMin = intensity === "intense" ? 4 : intensity === "light" ? 2.5 : 3;
    const rounds = Math.max(3, Math.min(8, Math.round((targetMinutes - 4) / perRoundMin)));
    const exercisesPerRound = 4;

    // Pick 4 random exercises from the pool (no duplicates)
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, exercisesPerRound);

    // Optionally add a cardio opener/closer
    const addCardio = intensity !== "light" && targetMinutes >= 20;

    const steps = [];
    if (addCardio) {
      steps.push({ kind: "cardio", name: "Run", distance_m: 400, distance_display: "400m" });
    }
    steps.push({
      kind: "repeat",
      count: rounds,
      children: picked.map(p => ({ kind: "exercise", ...p })),
    });
    if (addCardio) {
      steps.push({ kind: "cardio", name: "Run", distance_m: 400, distance_display: "400m" });
    }

    return {
      type: "circuit",
      name: _pick(nameVariants[focus] || nameVariants.bodyweight),
      goal: "for_time",
      goal_value: null,
      benchmark_id: null,
      description: `${intensity[0].toUpperCase() + intensity.slice(1)} · ~${targetMinutes} min`,
      notes: notes || null,
      steps,
      _intensity: intensity,
      _duration: targetMinutes,
      _focus: focus,
    };
  }

  // ── Save dispatch (UNIFIED_BUILDER_SPEC.md §Save handler contract) ──────
  //
  // Builds the normalized workout object from the internal circuit struct
  // and hands it to the caller-provided _onSave. When no callback is wired
  // (legacy single-arg openEntryFlow from Add Session), falls back to
  // window.saveToCalendar which writes the same localStorage.workouts row
  // _saveCircuitToWorkouts used to write directly.
  function _emitSave(circuit) {
    const dateStr = _currentDateStr || new Date().toISOString().slice(0, 10);
    const workout = {
      discipline: "circuit",
      type: "circuit",
      name: circuit.name || "",
      notes: circuit.notes || "",
      exercises: [],
      structure: {
        goal: circuit.goal || "standard",
        goal_value: circuit.goal_value || null,
        benchmark_id: circuit.benchmark_id || null,
        steps: circuit.steps || [],
      },
      _source: "manual",
    };

    if (_onSave) {
      try { _onSave(workout); } catch (e) { console.error("[CircuitBuilder] onSave failed:", e); }
    } else if (typeof window !== "undefined" && typeof window.saveToCalendar === "function") {
      window.saveToCalendar(workout, dateStr);
    } else {
      console.warn("[CircuitBuilder] no save target; workout dropped", workout);
      return;
    }

    if (typeof _showShareToast === "function") _showShareToast("Circuit saved!");
  }

  // ── Manual builder (Screen 3) ──────────────────────────────────────────
  let _manualDraft = null; // { name, goal, steps: [...] }

  function openManualBuilder(initial) {
    _closeModal("circuit-entry-modal");
    _closeModal("circuit-preview-modal");
    _manualDraft = initial || {
      name: "",
      goal: "for_time",
      goal_value: null,
      steps: [],
    };
    _renderManualBuilder();
  }

  function _renderManualBuilder() {
    const body = `
      ${_modalHeader("Build Circuit", "window.CircuitBuilder.backFromManual()")}
      <div class="circuit-modal-body">
        <div class="builder-field">
          <div class="builder-label">Workout Name</div>
          <input class="builder-input" id="cb-name" placeholder="e.g. Monday Burner" value="${_esc(_manualDraft.name)}" oninput="window.CircuitBuilder._updateDraftName(this.value)">
        </div>

        <div class="builder-field">
          <div class="builder-label">Goal</div>
          <div class="goal-selector">
            <button class="goal-option${_manualDraft.goal === "for_time" ? " is-active" : ""}" onclick="window.CircuitBuilder.setGoal('for_time')">For Time</button>
            <button class="goal-option${_manualDraft.goal === "amrap" ? " is-active" : ""}" onclick="window.CircuitBuilder.setGoal('amrap')">AMRAP</button>
            <button class="goal-option${_manualDraft.goal === "standard" ? " is-active" : ""}" onclick="window.CircuitBuilder.setGoal('standard')">Standard</button>
          </div>
          ${_manualDraft.goal === "amrap" ? `
            <div style="margin-top:8px">
              <input class="builder-input" type="number" min="1" max="60" placeholder="Time cap (min)" id="cb-amrap-cap" value="${_esc(_manualDraft.goal_value || "")}" oninput="window.CircuitBuilder._updateDraftCap(this.value)">
            </div>` : ""}
        </div>

        <div class="builder-field">
          <div class="builder-label">Steps</div>
          ${_renderDraftSteps()}
        </div>

        <div class="action-row">
          <button class="action-btn" onclick="window.CircuitBuilder.addStep('exercise')"><span class="icon">💪</span>Exercise</button>
          <button class="action-btn" onclick="window.CircuitBuilder.addStep('cardio')"><span class="icon">🏃</span>Cardio</button>
          <button class="action-btn" onclick="window.CircuitBuilder.addStep('repeat')"><span class="icon">🔁</span>Round</button>
        </div>
      </div>
      <div class="circuit-modal-footer">
        <button class="circuit-btn circuit-btn-primary" onclick="window.CircuitBuilder.saveManualBuilder()">Save Session</button>
      </div>`;
    _mountModal("circuit-manual-modal", body);
  }

  function _renderDraftSteps() {
    if (!_manualDraft.steps.length) {
      return `<p class="builder-empty">No steps yet. Add an exercise, cardio segment, or round below.</p>`;
    }
    return _manualDraft.steps.map((step, idx) => {
      if (step.kind === "repeat") {
        return `
          <div class="builder-repeat">
            <div class="builder-repeat-header">
              <div class="left">
                <span class="drag-handle builder-repeat-handle">⠿</span>
                <span class="repeat-badge">${_esc(step.count || 1)}×</span>
                <span class="builder-repeat-label">Rounds</span>
                <button class="repeat-count-btn" onclick="window.CircuitBuilder.editRepeatCount(${idx})">Edit count</button>
              </div>
              <button class="delete-btn" onclick="window.CircuitBuilder.deleteStep(${idx})">✕</button>
            </div>
            <div class="builder-repeat-body">
              ${(step.children || []).map((c, ci) => _renderChildStepBuilder(idx, ci, c)).join("")}
              <button class="add-inside-btn" onclick="window.CircuitBuilder.addStepInside(${idx}, 'exercise')">+ Add Exercise to Round</button>
              <button class="add-inside-btn" onclick="window.CircuitBuilder.addStepInside(${idx}, 'cardio')">+ Add Cardio to Round</button>
            </div>
          </div>`;
      }
      return _renderTopStepBuilder(idx, step);
    }).join("");
  }

  function _renderTopStepBuilder(idx, step) {
    const name = step.name || (step.kind === "cardio" ? "Cardio" : "Exercise");
    const icon = step.kind === "cardio" ? "🏃" : "";
    const detail = _stepDetailString(step);
    return `
      <div class="builder-step">
        <span class="drag-handle">⠿</span>
        <div class="step-content" onclick="window.CircuitBuilder.editStep(${idx})">
          <div class="step-name">${icon ? icon + " " : ""}${_esc(name)}</div>
          <div class="step-detail">${_esc(detail)}</div>
        </div>
        <button class="delete-btn" onclick="window.CircuitBuilder.deleteStep(${idx})">✕</button>
      </div>`;
  }

  function _renderChildStepBuilder(parentIdx, childIdx, step) {
    const name = step.name || (step.kind === "cardio" ? "Cardio" : "Exercise");
    const detail = _stepDetailString(step);
    return `
      <div class="builder-step builder-step--child">
        <span class="drag-handle">⠿</span>
        <div class="step-content" onclick="window.CircuitBuilder.editChildStep(${parentIdx}, ${childIdx})">
          <div class="step-name">${_esc(name)}</div>
          <div class="step-detail">${_esc(detail)}</div>
        </div>
        <button class="delete-btn" onclick="window.CircuitBuilder.deleteChildStep(${parentIdx}, ${childIdx})">✕</button>
      </div>`;
  }

  function _stepDetailString(step) {
    if (step.kind === "cardio") {
      return step.distance_display
          || (step.distance_m ? step.distance_m + "m" : "")
          || (step.duration_sec ? Math.round(step.duration_sec / 60) + " min" : "")
          || "—";
    }
    if (step.kind === "exercise") {
      const parts = [];
      if (step.reps != null) parts.push(step.per_side ? `${step.reps}/side` : `${step.reps} reps`);
      if (step.weight != null) parts.push(`${step.weight} ${step.weight_unit || "lbs"}`);
      if (step.notes) parts.push(step.notes);
      return parts.join(" · ") || "—";
    }
    if (step.kind === "rest") return (step.duration_sec || 30) + "s rest";
    return "";
  }

  // ── Builder mutation API ────────────────────────────────────────────────

  function _updateDraftName(val) { if (_manualDraft) _manualDraft.name = val; }
  function _updateDraftCap(val) {
    if (_manualDraft) _manualDraft.goal_value = parseInt(val, 10) || null;
  }
  function setGoal(goal) {
    if (!_manualDraft) return;
    _manualDraft.goal = goal;
    _renderManualBuilder();
  }

  function addStep(kind) {
    if (!_manualDraft) return;
    if (kind === "repeat") {
      _openRepeatModal(null, (cnt) => {
        if (!cnt || cnt < 1) return;
        _manualDraft.steps.push({ kind: "repeat", count: cnt, children: [] });
        _renderManualBuilder();
      });
    } else if (kind === "exercise") {
      _openExerciseModal(null, (step) => {
        if (step) _manualDraft.steps.push(step);
        _renderManualBuilder();
      });
    } else if (kind === "cardio") {
      _openCardioModal(null, (step) => {
        if (step) _manualDraft.steps.push(step);
        _renderManualBuilder();
      });
    }
  }

  function addStepInside(parentIdx, kind) {
    if (!_manualDraft) return;
    const parent = _manualDraft.steps[parentIdx];
    if (!parent || parent.kind !== "repeat") return;
    const cb = (step) => {
      if (step) parent.children.push(step);
      _renderManualBuilder();
    };
    if (kind === "exercise") _openExerciseModal(null, cb);
    else _openCardioModal(null, cb);
  }

  function editStep(idx) {
    const step = _manualDraft.steps[idx];
    if (!step) return;
    const cb = (updated) => {
      if (updated) _manualDraft.steps[idx] = updated;
      _renderManualBuilder();
    };
    if (step.kind === "cardio") _openCardioModal(step, cb);
    else _openExerciseModal(step, cb);
  }

  function editChildStep(parentIdx, childIdx) {
    const parent = _manualDraft.steps[parentIdx];
    if (!parent || parent.kind !== "repeat") return;
    const step = parent.children[childIdx];
    if (!step) return;
    const cb = (updated) => {
      if (updated) parent.children[childIdx] = updated;
      _renderManualBuilder();
    };
    if (step.kind === "cardio") _openCardioModal(step, cb);
    else _openExerciseModal(step, cb);
  }

  function editRepeatCount(idx) {
    const step = _manualDraft.steps[idx];
    if (!step || step.kind !== "repeat") return;
    _openRepeatModal(step.count || 3, (cnt) => {
      if (cnt && cnt >= 1) step.count = cnt;
      _renderManualBuilder();
    });
  }

  function deleteStep(idx) {
    _manualDraft.steps.splice(idx, 1);
    _renderManualBuilder();
  }
  function deleteChildStep(parentIdx, childIdx) {
    const parent = _manualDraft.steps[parentIdx];
    if (!parent || parent.kind !== "repeat") return;
    parent.children.splice(childIdx, 1);
    _renderManualBuilder();
  }

  // ── Inline step modals ───────────────────────────────────────
  // These replace the native prompt() calls with full-chrome
  // modals that reuse the same _mountModal + _modalHeader shell
  // (.circuit-modal-overlay → .circuit-modal) as the main Circuit
  // Session entry flow, so the look — dark sheet, rounded Back/
  // close header, .builder-field labels, .focus-chip style chips,
  // .circuit-btn primary/secondary footer — stays consistent
  // across the whole circuit builder.

  function _openRepeatModal(existingCount, callback) {
    const initial = existingCount || 3;
    const body = `
      ${_modalHeader(existingCount ? "Edit Rounds" : "Add Rounds", null)}
      <div class="circuit-modal-body">
        <div class="builder-field">
          <div class="builder-label">Rounds</div>
          <input class="builder-input" id="cb-inline-rounds" type="number" min="1" max="50" value="${initial}" inputmode="numeric" />
        </div>
      </div>
      <div class="circuit-modal-footer circuit-modal-footer--dual">
        <button class="circuit-btn circuit-btn-primary" id="cb-inline-ok">Save</button>
        <button class="circuit-btn circuit-btn-secondary" id="cb-inline-cancel">Cancel</button>
      </div>
    `;
    _mountModal("cb-inline-modal", body);
    _wireInlineOkCancel("cb-inline-modal", (ov) => {
      const n = parseInt(ov.querySelector("#cb-inline-rounds").value, 10);
      callback(n && n >= 1 ? n : null);
    }, () => callback(null));
  }

  function _openExerciseModal(existing, callback) {
    const body = `
      ${_modalHeader(existing ? "Edit Exercise" : "Add Exercise", null)}
      <div class="circuit-modal-body">
        <div class="builder-field">
          <div class="builder-label">Exercise name</div>
          <input class="builder-input" id="cb-inline-name" type="text" value="${_esc(existing?.name || "")}" placeholder="e.g. Push-up" />
        </div>
        <div class="builder-field">
          <div class="builder-label">Reps</div>
          <input class="builder-input" id="cb-inline-reps" type="number" min="1" max="999" value="${existing?.reps || 10}" inputmode="numeric" />
        </div>
        <div class="builder-field">
          <div class="builder-label">Weight (lbs)</div>
          <input class="builder-input" id="cb-inline-weight" type="number" min="0" max="1000" value="${existing?.weight || ""}" placeholder="Bodyweight if blank" inputmode="numeric" />
        </div>
      </div>
      <div class="circuit-modal-footer circuit-modal-footer--dual">
        <button class="circuit-btn circuit-btn-primary" id="cb-inline-ok">Save</button>
        <button class="circuit-btn circuit-btn-secondary" id="cb-inline-cancel">Cancel</button>
      </div>
    `;
    _mountModal("cb-inline-modal", body);
    _wireInlineOkCancel("cb-inline-modal", (ov) => {
      const name = ov.querySelector("#cb-inline-name").value.trim();
      if (!name) {
        ov.querySelector("#cb-inline-name").focus();
        return false;
      }
      const reps = parseInt(ov.querySelector("#cb-inline-reps").value, 10) || null;
      const wStr = ov.querySelector("#cb-inline-weight").value;
      const weight = wStr ? parseInt(wStr, 10) : null;
      callback({
        kind: "exercise",
        name,
        reps,
        weight,
        weight_unit: weight ? "lbs" : null,
      });
    }, () => callback(null));
  }

  function _openCardioModal(existing, callback) {
    const CARDIO_TYPES = ["Run", "Row", "Bike", "Ski Erg", "Assault Bike", "Walk", "Swim"];
    const currentType = existing?.name || "Run";
    const chips = CARDIO_TYPES.map(t =>
      `<button type="button" class="focus-chip${t === currentType ? " is-active" : ""}" data-cb-cardio="${_esc(t)}">${_esc(t)}</button>`
    ).join("");
    const distDisplay = existing?.distance_display && !/min/.test(existing.distance_display)
      ? existing.distance_display : "";
    const durVal = existing?.duration_sec ? Math.round(existing.duration_sec / 60) : "";
    const body = `
      ${_modalHeader(existing ? "Edit Cardio" : "Add Cardio", null)}
      <div class="circuit-modal-body">
        <div class="builder-field">
          <div class="builder-label">Cardio type</div>
          <div class="focus-chip-row" id="cb-inline-cardio-row">${chips}</div>
        </div>
        <div class="builder-field">
          <div class="builder-label">Distance</div>
          <input class="builder-input" id="cb-inline-distance" type="text" value="${_esc(distDisplay)}" placeholder="400m, 1 mile — or leave blank" />
        </div>
        <div class="builder-field">
          <div class="builder-label">or Duration (min)</div>
          <input class="builder-input" id="cb-inline-duration" type="number" min="1" max="240" value="${durVal}" placeholder="5" inputmode="numeric" />
        </div>
      </div>
      <div class="circuit-modal-footer circuit-modal-footer--dual">
        <button class="circuit-btn circuit-btn-primary" id="cb-inline-ok">Save</button>
        <button class="circuit-btn circuit-btn-secondary" id="cb-inline-cancel">Cancel</button>
      </div>
    `;
    _mountModal("cb-inline-modal", body);

    // Wire chip toggling
    const chipRow = document.getElementById("cb-inline-cardio-row");
    let selectedCardio = currentType;
    if (chipRow) {
      chipRow.addEventListener("click", (ev) => {
        const btn = ev.target.closest(".focus-chip");
        if (!btn) return;
        chipRow.querySelectorAll(".focus-chip").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        selectedCardio = btn.getAttribute("data-cb-cardio");
      });
    }

    _wireInlineOkCancel("cb-inline-modal", (ov) => {
      const name = (selectedCardio || "").trim();
      if (!name) return false;
      const distance = ov.querySelector("#cb-inline-distance").value.trim();
      const durStr = ov.querySelector("#cb-inline-duration").value;
      const step = { kind: "cardio", name };
      if (distance) {
        step.distance_display = distance;
        const metersMatch = distance.match(/([\d.]+)\s*m\b/i);
        const milesMatch = distance.match(/([\d.]+)\s*mi/i);
        const kmMatch = distance.match(/([\d.]+)\s*km/i);
        if (metersMatch && !milesMatch) step.distance_m = parseFloat(metersMatch[1]);
        else if (milesMatch) step.distance_m = Math.round(parseFloat(milesMatch[1]) * 1609.34);
        else if (kmMatch) step.distance_m = Math.round(parseFloat(kmMatch[1]) * 1000);
      } else if (durStr) {
        const durMin = parseInt(durStr, 10);
        if (durMin) {
          step.duration_sec = durMin * 60;
          step.distance_display = durMin + " min";
        }
      }
      callback(step);
    }, () => callback(null));
  }

  // Shared OK/Cancel wiring for the three step modals. Focuses the
  // first input, lets Enter submit, and closes the modal after the
  // save callback unless it returns false (validation failure).
  // Also rebinds the reused _modalHeader close (X) button so it
  // only dismisses THIS step modal instead of calling closeAll(),
  // which would also tear down the underlying manual builder.
  function _wireInlineOkCancel(modalId, onOk, onCancel) {
    const ov = document.getElementById(modalId);
    if (!ov) return;
    const okBtn = ov.querySelector("#cb-inline-ok");
    const cancelBtn = ov.querySelector("#cb-inline-cancel");
    const closeHeaderBtn = ov.querySelector(".circuit-modal-close");
    if (closeHeaderBtn) {
      closeHeaderBtn.setAttribute("onclick", "");
      closeHeaderBtn.onclick = () => {
        if (typeof onCancel === "function") onCancel();
        _closeModal(modalId);
      };
    }
    if (okBtn) {
      okBtn.onclick = () => {
        const result = onOk(ov);
        if (result !== false) _closeModal(modalId);
      };
    }
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        if (typeof onCancel === "function") onCancel();
        _closeModal(modalId);
      };
    }
    ov.querySelectorAll("input").forEach(el => {
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); okBtn && okBtn.click(); }
      });
    });
    setTimeout(() => {
      const first = ov.querySelector("input:not([type=hidden])");
      if (first) first.focus();
      if (first && first.type === "text") first.select();
    }, 0);
  }

  function backFromManual() {
    _closeModal("circuit-manual-modal");
    openEntryFlow(_currentDateStr);
  }

  function saveManualBuilder() {
    if (!_manualDraft) return;
    if (!_manualDraft.name.trim()) {
      alert("Give your workout a name first.");
      return;
    }
    if (!_manualDraft.steps.length) {
      alert("Add at least one step first.");
      return;
    }
    const circuit = {
      type: "circuit",
      name: _manualDraft.name,
      goal: _manualDraft.goal,
      goal_value: _manualDraft.goal_value,
      benchmark_id: null,
      steps: _manualDraft.steps,
    };
    _emitSave(circuit);
    _closeModal("circuit-manual-modal");
  }

  // ── Library (Screen 2) ──────────────────────────────────────────────────
  function openLibrary(dateStr) {
    _currentDateStr = dateStr || _currentDateStr || (new Date().toISOString().slice(0, 10));
    _renderLibrary("benchmarks");
  }

  function _renderLibrary(activeTab) {
    const wods = (window.BENCHMARK_WODS || []);
    const classic = wods.filter(w => w.category === "classic");
    const community = wods.filter(w => w.category === "community");

    let listHtml = "";
    if (activeTab === "benchmarks") {
      listHtml = `
        <div class="library-section-header">Classic WODs</div>
        ${classic.map(_libraryCardHtml).join("")}
        <div class="library-section-header">Community</div>
        ${community.map(_libraryCardHtml).join("")}
      `;
    } else if (activeTab === "my") {
      const mine = _loadMyCircuits();
      listHtml = mine.length
        ? mine.map(_libraryCardHtml).join("")
        : `<p class="library-empty">You haven't saved any custom circuits yet. Build one from scratch to see it here.</p>`;
    } else {
      listHtml = `<p class="library-empty">Ask IronZ to design a circuit for you — coming soon. Use the Generate button in the entry flow for now.</p>`;
    }

    const body = `
      ${_modalHeader("Circuit Library", "window.CircuitBuilder.backFromLibrary()")}
      <div class="circuit-modal-body">
        <div class="circuit-tab-row">
          <button class="circuit-tab${activeTab === "benchmarks" ? " is-active" : ""}" onclick="window.CircuitBuilder.showLibraryTab('benchmarks')">Benchmarks</button>
          <button class="circuit-tab${activeTab === "my" ? " is-active" : ""}" onclick="window.CircuitBuilder.showLibraryTab('my')">My Circuits</button>
          <button class="circuit-tab${activeTab === "ai" ? " is-active" : ""}" onclick="window.CircuitBuilder.showLibraryTab('ai')">Ask IronZ</button>
        </div>
        ${listHtml}
      </div>`;
    _mountModal("circuit-library-modal", body);
  }

  function _loadMyCircuits() {
    try {
      const saved = JSON.parse(localStorage.getItem("savedCircuits") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch { return []; }
  }

  function _libraryCardHtml(wod) {
    const goal = wod.goal || "standard";
    const goalLabel = goal === "for_time" ? "For Time" : goal === "amrap" ? "AMRAP" : "Standard";
    const goalClass = goal === "for_time" ? "goal-for-time" : goal === "amrap" ? "goal-amrap" : "goal-standard";
    const equip = (wod.equipment && wod.equipment.length) ? wod.equipment.join(" · ") : "No equipment";
    return `
      <div class="library-card" onclick="window.CircuitBuilder.openLibraryWod('${_esc(wod.id)}')">
        <div class="library-card-left">
          <div class="wod-name">${_esc(wod.name)}</div>
          <div class="wod-desc">${_esc(wod.description || "")}</div>
          <div class="wod-meta">
            <span class="goal-badge ${goalClass}">${_esc(goalLabel)}</span>
            <span>~${wod.estimated_min || 20} min</span>
            <span>${_esc(equip)}</span>
          </div>
        </div>
        <div class="library-card-chevron">›</div>
      </div>`;
  }

  function openLibraryWod(id) {
    const wod = (window.BENCHMARK_WODS || []).find(w => w.id === id);
    if (!wod) return;
    _currentPreviewCircuit = { ...wod, type: "circuit" };
    _closeModal("circuit-library-modal");

    const previewHtml = window.CircuitCard
      ? window.CircuitCard.render(_currentPreviewCircuit, { subtitlePrefix: "Preview" })
      : `<pre>${_esc(JSON.stringify(wod, null, 2))}</pre>`;

    const body = `
      ${_modalHeader(wod.name, "window.CircuitBuilder.openLibrary()")}
      <div class="circuit-modal-body">
        <div class="circuit-preview-wrap">${previewHtml}</div>
        ${wod.long_description ? `<p class="wod-long-desc">${_esc(wod.long_description)}</p>` : ""}
      </div>
      <div class="circuit-modal-footer circuit-modal-footer--dual">
        <button class="circuit-btn circuit-btn-primary" onclick="window.CircuitBuilder.saveGeneratedCircuit()">Start This Workout</button>
        <button class="circuit-btn circuit-btn-secondary" onclick="window.CircuitBuilder.openLibrary()">Back to Library</button>
      </div>`;
    _mountModal("circuit-preview-modal", body);
  }

  function showLibraryTab(tab) { _renderLibrary(tab); }

  function backFromLibrary() {
    _closeModal("circuit-library-modal");
    openEntryFlow(_currentDateStr);
  }

  // ── Completion modal (Screen 4 / 4b) ────────────────────────────────────
  //
  // Called from the day detail when user taps "Log Time" on a circuit
  // card. For For Time: mm:ss inputs + PR comparison. For AMRAP:
  // rounds + extra reps inputs.
  function openCompletionModal(workoutId) {
    let workouts = [];
    try { workouts = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}
    const workout = workouts.find(w => String(w.id) === String(workoutId));
    if (!workout || !workout.circuit) return;

    const circuit = workout.circuit;
    const goal = circuit.goal || "standard";

    if (goal === "standard") {
      // Standard circuits skip the time modal and just mark complete.
      workout.circuit_result = { completed: true };
      _persistWorkouts(workouts);
      if (typeof renderCalendar === "function") renderCalendar();
      if (typeof renderDayDetail === "function") renderDayDetail(workout.date);
      return;
    }

    if (goal === "amrap") {
      _renderAmrapCompletion(workout);
    } else {
      _renderForTimeCompletion(workout);
    }
  }

  function _renderForTimeCompletion(workout) {
    const pr = window.CircuitWorkout?.getPR(workout.circuit);
    const prHtml = pr && pr.time_sec != null
      ? _forTimePRCard(pr)
      : "";

    const body = `
      ${_modalHeader("", null)}
      <div class="circuit-modal-body">
        <div class="completion-modal-inner">
          <h3 class="completion-title">⚡ ${_esc(workout.circuit.name)} Complete!</h3>
          <div class="completion-sub">Enter your finishing time</div>
          <div class="completion-time-row">
            <input class="completion-time-input" id="cc-time-mm" type="number" min="0" max="999" placeholder="00" autofocus>
            <span class="completion-time-sep">:</span>
            <input class="completion-time-input" id="cc-time-ss" type="number" min="0" max="59" placeholder="00">
          </div>
          <div id="cc-pr-slot">${prHtml}</div>
        </div>
      </div>
      <div class="circuit-modal-footer circuit-modal-footer--dual">
        <button class="circuit-btn circuit-btn-secondary" onclick="window.CircuitBuilder.closeAll()">Skip</button>
        <button class="circuit-btn circuit-btn-primary" onclick="window.CircuitBuilder.saveForTime('${_esc(workout.id)}')">Save Time</button>
      </div>`;
    _mountModal("circuit-completion-modal", body);

    // Live PR comparison update
    const mm = document.getElementById("cc-time-mm");
    const ss = document.getElementById("cc-time-ss");
    const slot = document.getElementById("cc-pr-slot");
    function _update() {
      if (!pr || pr.time_sec == null) return;
      const totalSec = window.CircuitWorkout.parseTimeInput(mm.value, ss.value);
      if (!totalSec) { slot.innerHTML = _forTimePRCard(pr); return; }
      const diff = totalSec - pr.time_sec;
      if (diff < 0) {
        slot.innerHTML = `
          <div class="completion-pr-card completion-pr-card--new">
            <div class="pr-text">🏆 New PR! Previous best: ${_esc(window.CircuitWorkout.formatTime(pr.time_sec))}</div>
          </div>`;
      } else if (diff === 0) {
        slot.innerHTML = `
          <div class="completion-pr-card">
            <div class="pr-text">Matched your PR of ${_esc(window.CircuitWorkout.formatTime(pr.time_sec))}</div>
          </div>`;
      } else {
        slot.innerHTML = `
          <div class="completion-pr-card">
            <div class="pr-text">${_esc(window.CircuitWorkout.formatTime(diff))} off your PR (${_esc(window.CircuitWorkout.formatTime(pr.time_sec))})</div>
            <div class="pr-sub">Keep pushing — you're close!</div>
          </div>`;
      }
    }
    if (mm) mm.addEventListener("input", _update);
    if (ss) ss.addEventListener("input", _update);
  }

  function _forTimePRCard(pr) {
    return `
      <div class="completion-pr-card">
        <div class="pr-text">Current PR: ${_esc(window.CircuitWorkout.formatTime(pr.time_sec))}</div>
        <div class="pr-sub">Beat it!</div>
      </div>`;
  }

  function _renderAmrapCompletion(workout) {
    const pr = window.CircuitWorkout?.getPR(workout.circuit);
    const prHtml = pr && pr.rounds != null
      ? `<div class="completion-pr-card"><div class="pr-text">Current PR: ${_esc(pr.rounds)} rds${pr.reps ? " + " + _esc(pr.reps) : ""}</div></div>`
      : "";

    const body = `
      ${_modalHeader("", null)}
      <div class="circuit-modal-body">
        <div class="completion-modal-inner">
          <h3 class="completion-title">⚡ ${_esc(workout.circuit.name)} Complete!</h3>
          <div class="completion-sub">How many rounds did you finish?</div>
          <div class="completion-amrap-row">
            <div class="completion-amrap-field">
              <div class="completion-amrap-label">Rounds</div>
              <input class="completion-time-input" id="cc-rounds" type="number" min="0" max="999" placeholder="0" autofocus>
            </div>
            <div class="completion-amrap-plus">+</div>
            <div class="completion-amrap-field">
              <div class="completion-amrap-label">Extra Reps</div>
              <input class="completion-time-input" id="cc-reps" type="number" min="0" max="999" placeholder="0">
            </div>
          </div>
          <div id="cc-pr-slot">${prHtml}</div>
        </div>
      </div>
      <div class="circuit-modal-footer circuit-modal-footer--dual">
        <button class="circuit-btn circuit-btn-secondary" onclick="window.CircuitBuilder.closeAll()">Skip</button>
        <button class="circuit-btn circuit-btn-amrap" onclick="window.CircuitBuilder.saveAmrap('${_esc(workout.id)}')">Save Score</button>
      </div>`;
    _mountModal("circuit-completion-modal", body);
  }

  function saveForTime(workoutId) {
    const mm = document.getElementById("cc-time-mm")?.value;
    const ss = document.getElementById("cc-time-ss")?.value;
    const totalSec = window.CircuitWorkout.parseTimeInput(mm, ss);
    if (!totalSec) { alert("Enter a valid time."); return; }
    _writeCompletion(workoutId, { time_sec: totalSec });
    _closeModal("circuit-completion-modal");
  }

  function saveAmrap(workoutId) {
    const rounds = parseInt(document.getElementById("cc-rounds")?.value || "0", 10);
    const reps = parseInt(document.getElementById("cc-reps")?.value || "0", 10);
    if (!rounds && !reps) { alert("Enter a score."); return; }
    _writeCompletion(workoutId, { rounds, reps });
    _closeModal("circuit-completion-modal");
  }

  function _writeCompletion(workoutId, result) {
    let workouts = [];
    try { workouts = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}
    const workout = workouts.find(w => String(w.id) === String(workoutId));
    if (!workout) return;
    workout.circuit_result = result;
    workout.completedAt = new Date().toISOString();
    _persistWorkouts(workouts);
    if (window.CircuitWorkout) window.CircuitWorkout.recordCompletion(workout.circuit || workout, result);
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof renderDayDetail === "function") renderDayDetail(workout.date);
    if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
    // Chain into the existing Strava share prompt if connected
    if (typeof promptStravaShareIfEligible === "function") {
      promptStravaShareIfEligible(workout);
    }
  }

  function _persistWorkouts(workouts) {
    localStorage.setItem("workouts", JSON.stringify(workouts));
    if (typeof DB !== "undefined" && DB.syncWorkouts) DB.syncWorkouts();
  }

  // ── Close everything ────────────────────────────────────────────────────
  function closeAll() {
    ["circuit-entry-modal", "circuit-preview-modal", "circuit-manual-modal",
     "circuit-library-modal", "circuit-completion-modal"].forEach(_closeModal);
  }

  // Back-button handler on the entry screen. Picks the right caller to
  // resume based on _context so Add Session and Build a Plan Manual
  // both return to where the user came from.
  function _backFromEntry() {
    const dateStr = _currentDateStr;
    closeAll();
    if (_context === "plan-manual") {
      // Re-open the CP Manual type picker. We don't have the dow in scope
      // here, but the modal retained dataset.dow from customPlanAddManual —
      // reopening the modal element is enough, it'll still be there.
      const modal = document.getElementById("cp-manual-modal");
      if (modal) {
        modal.classList.add("is-open");
        if (typeof cpManualShowStep === "function") cpManualShowStep(1);
      }
      return;
    }
    if (typeof openQuickEntry === "function") openQuickEntry(dateStr);
  }

  // ── Public API ──────────────────────────────────────────────────────────
  const api = {
    openEntryFlow,
    openEntryFlowKeepingState,
    openManualBuilder,
    openLibrary,
    openLibraryWod,
    showLibraryTab,
    backFromLibrary,
    openCompletionModal,
    generateFromEntry,
    regenerate,
    saveGeneratedCircuit,
    setGoal,
    addStep,
    addStepInside,
    editStep,
    editChildStep,
    editRepeatCount,
    deleteStep,
    deleteChildStep,
    saveManualBuilder,
    backFromManual,
    saveForTime,
    saveAmrap,
    closeAll,
    _backFromEntry,
    _updateDraftName,
    _updateDraftCap,
  };
  if (typeof window !== "undefined") window.CircuitBuilder = api;
})();
