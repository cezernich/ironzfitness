// js/ui/swim-builder-modal.js
//
// Garmin-style manual swim workout builder. Shown instead of the generic
// cardio manual editor when the user picks "swim" in Quick Entry.
//
// Entry point:
//   window.SwimBuilderModal.open(dateStr, opts?)
//
// opts.existingWorkoutId — edit an existing workout in localStorage instead
//   of creating a new one.
//
// On Save, writes to the `workouts` localStorage key with:
//   { id, date, type: "swimming", aiSession: <canonical swim workout> }
// plus DB.syncWorkouts() so it crosses devices.

(function () {
  "use strict";

  const OVERLAY_ID = "swim-builder-overlay";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function _todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function _genId() {
    return "wk-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ─── State ──────────────────────────────────────────────────────────────

  // One state blob per open lifetime. We use stable step IDs so the edit
  // inline form can target the right step in a nested tree.
  let _state = null;

  function _stepId() { return "s-" + Math.random().toString(36).slice(2, 8); }

  // Tag every node with a stable _uid so the inline editor can find them.
  function _tagSteps(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(s => {
      const copy = { ...s };
      if (!copy._uid) copy._uid = _stepId();
      if (copy.kind === "repeat") copy.children = _tagSteps(copy.children || []);
      return copy;
    });
  }

  function _findStep(arr, uid) {
    for (const s of arr) {
      if (!s) continue;
      if (s._uid === uid) return s;
      if (s.kind === "repeat") {
        const hit = _findStep(s.children || [], uid);
        if (hit) return hit;
      }
    }
    return null;
  }

  function _removeStep(arr, uid) {
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      if (!s) continue;
      if (s._uid === uid) { arr.splice(i, 1); return true; }
      if (s.kind === "repeat") {
        if (_removeStep(s.children || [], uid)) return true;
      }
    }
    return false;
  }

  // Strip _uid + editing flags before persisting / handing to renderer.
  function _cleanSteps(arr) {
    const M = window.SwimWorkout;
    if (!M || !M.cloneSteps) return arr;
    return M.cloneSteps(arr);
  }

  // ─── Open / close ───────────────────────────────────────────────────────

  function open(dateStr, opts) {
    opts = opts || {};
    const M = window.SwimWorkout;
    if (!M) { console.warn("[SwimBuilderModal] SwimWorkout model not loaded"); return; }
    const pool = M.getUserPoolSize();

    // Unified Workout Builder hooks (UNIFIED_BUILDER_SPEC.md §Save handler
    // contract). When opts.onSave is provided, _save() dispatches the
    // normalized workout to the caller instead of writing localStorage.
    // opts.existing may be a CP session entry ({ data: { aiSession } })
    // OR a workouts row, so we probe both shapes.
    const onSave = typeof opts.onSave === "function" ? opts.onSave : null;
    const context = opts.context || "calendar";

    let existing = null;
    if (opts.existing) {
      existing = opts.existing;
    } else if (opts.existingWorkoutId) {
      try {
        const list = JSON.parse(localStorage.getItem("workouts")) || [];
        existing = list.find(w => w.id === opts.existingWorkoutId);
      } catch {}
    }

    // Resolve aiSession from either shape
    const aiSession = existing && (existing.aiSession || (existing.data && existing.data.aiSession));
    const existingNotes = existing && (existing.notes || (existing.data && existing.data.details) || "");
    const existingId = existing && (existing.id || (existing.data && existing.data.id));

    _state = {
      mode: existing ? "edit" : "create",
      workoutId: existingId || null,
      dateStr: dateStr || (existing && existing.date) || _todayStr(),
      title: (aiSession && aiSession.title) || "Pool Workout",
      notes: existingNotes || "",
      pool,
      steps: _tagSteps((aiSession && aiSession.steps) || []),
      editing: null, // { uid, kind } when inline editor is open
      adding: null,  // "interval" | "rest" | "repeat" — when appending a new step
      addParentUid: null, // if adding inside a repeat block
      onSave,
      context,
    };

    _renderOverlay();
  }

  function close() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) {
      el.classList.remove("is-open");
      setTimeout(() => { try { el.remove(); } catch {} }, 220);
    }
    _state = null;
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  function _renderOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.className = "swim-builder-overlay";
      overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("is-open"));
    }
    _render();
  }

  function _render() {
    if (!_state) return;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const M = window.SwimWorkout;
    const totalM = M.totalDistance(_state.steps);
    const totalLabel = _state.pool.unit === "yd"
      ? `${Math.round(totalM / 0.9144)} yd`
      : `${Math.round(totalM)} m`;

    // Preserve scroll on re-render (important for long step lists)
    const prevBody = overlay.querySelector(".swim-builder-body");
    const prevScroll = prevBody ? prevBody.scrollTop : 0;

    overlay.innerHTML = `
      <div class="swim-builder" role="dialog" aria-modal="true">
        <div class="swim-builder-header">
          <button class="swim-builder-cancel" data-sb-cancel="1">Cancel</button>
          <div class="swim-builder-title">${_esc(_state.title)}</div>
          <button class="swim-builder-save" data-sb-save="1">Save</button>
        </div>

        <div class="swim-builder-totals">
          <div class="swim-total">
            <span class="swim-total-value">${_esc(totalLabel)}</span>
            <span class="swim-total-label">Total Distance</span>
          </div>
          <button type="button" class="swim-pool-badge" data-sb-pool-cycle="1"
                  aria-label="Cycle pool length"
                  title="Tap to switch pool size — 25 m / 50 m / 25 yd">
            <span class="swim-pool-badge-label">Pool</span>
            <span class="swim-pool-badge-value">${_esc(_state.pool.label)}</span>
          </button>
        </div>

        <div class="swim-builder-meta">
          <div class="swim-builder-meta-row">
            <input type="date" data-sb-date="1" value="${_esc(_state.dateStr)}" />
          </div>
        </div>

        <div class="swim-builder-body">
          ${_renderStepList(_state.steps, 0, null)}
          ${_renderAddingForm()}
          ${_state.steps.length ? "" : '<div class="swim-builder-empty">No steps yet. Tap + Add Step or + Add Repeat to start building.</div>'}
        </div>

        <div class="swim-builder-footer">
          <button class="swim-add-btn"           data-sb-add="interval">+ Add Step</button>
          <button class="swim-add-btn secondary" data-sb-add="repeat">+ Add Repeat</button>
        </div>
      </div>
    `;

    // Restore scroll
    const newBody = overlay.querySelector(".swim-builder-body");
    if (newBody && prevScroll) newBody.scrollTop = prevScroll;

    _wire(overlay);
  }

  function _renderStepList(steps, depth, parentUid) {
    if (!Array.isArray(steps) || !steps.length) return "";
    return steps.map(step => _renderOneStep(step, depth, parentUid)).join("");
  }

  function _renderOneStep(step, depth, parentUid) {
    // If this is the step currently being edited, show the inline form.
    if (_state && _state.editing && _state.editing.uid === step._uid) {
      return _renderStepForm(step, depth);
    }
    const M = window.SwimWorkout;
    const poolUnit = _state.pool.unit;
    if (step.kind === "rest") {
      return `
        <div class="swim-builder-step">
          <div class="swim-step swim-rest" style="margin-left:${depth * 12}px">
            <span class="swim-rest-dot"></span>
            <span class="swim-rest-label">Rest ${_fmtRest(step.duration_sec)}</span>
          </div>
          <button class="swim-step-edit-btn"   data-sb-edit="${step._uid}" title="Edit">✎</button>
          <button class="swim-step-delete-btn" data-sb-delete="${step._uid}" title="Delete">×</button>
        </div>
      `;
    }
    if (step.kind === "repeat") {
      const childrenHtml = _renderStepList(step.children || [], depth + 1, step._uid);
      return `
        <div class="swim-builder-step">
          <div class="swim-repeat" style="margin-left:${depth * 12}px">
            <div class="swim-repeat-label">${_esc(step.count)}× <span class="swim-repeat-text">repeat</span></div>
            <div class="swim-repeat-body">${childrenHtml}</div>
            <div style="padding:6px 6px 2px; display:flex; gap:6px">
              <button class="swim-add-btn secondary" data-sb-add-inside="${step._uid}|interval" style="flex:1;padding:6px 8px;font-size:11px">+ Step inside</button>
              <button class="swim-add-btn secondary" data-sb-add-inside="${step._uid}|rest"     style="flex:1;padding:6px 8px;font-size:11px">+ Rest inside</button>
            </div>
          </div>
          <button class="swim-step-edit-btn"   data-sb-edit="${step._uid}" title="Edit count">✎</button>
          <button class="swim-step-delete-btn" data-sb-delete="${step._uid}" title="Delete">×</button>
        </div>
      `;
    }
    // interval
    const strokeLabel = (M.STROKE_SHORT[step.stroke] || "Free");
    const distLabel = poolUnit === "yd"
      ? `${Math.round(step.distance_m / 0.9144)} yd`
      : `${Math.round(step.distance_m)} m`;
    const paceHtml = step.pace_target ? `<span class="swim-iv-pace">@ ${_esc(step.pace_target)}</span>` : "";
    const nameHtml = step.name ? `<div class="swim-iv-name">${_esc(step.name)}</div>` : "";
    return `
      <div class="swim-builder-step">
        <div class="swim-step swim-interval" style="margin-left:${depth * 12}px">
          ${nameHtml}
          <div class="swim-iv-row">
            <span class="swim-iv-distance">${distLabel}</span>
            <span class="swim-iv-stroke">${_esc(strokeLabel)}</span>
            ${paceHtml}
          </div>
        </div>
        <button class="swim-step-edit-btn"   data-sb-edit="${step._uid}" title="Edit">✎</button>
        <button class="swim-step-delete-btn" data-sb-delete="${step._uid}" title="Delete">×</button>
      </div>
    `;
  }

  function _fmtRest(sec) {
    const s = Number(sec) || 0;
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60); const r = s % 60;
    return r ? `${m}:${String(r).padStart(2, "0")}` : `${m} min`;
  }

  // Inline form for adding a new step (appended to the current parent) OR
  // editing an existing one.
  function _renderStepForm(step, depth) {
    const M = window.SwimWorkout;
    if (step.kind === "rest") {
      return `
        <div class="swim-step-form" style="margin-left:${depth * 12}px" data-sb-form="${step._uid}">
          <div class="swim-step-form-row">
            <label>Rest duration (sec)
              <input type="number" data-sb-field="duration_sec" value="${_esc(step.duration_sec || 15)}" min="0" />
            </label>
          </div>
          <div class="swim-step-form-actions">
            <button data-sb-form-cancel="1">Cancel</button>
            <button class="swim-form-save" data-sb-form-save="1">Save</button>
          </div>
        </div>
      `;
    }
    if (step.kind === "repeat") {
      return `
        <div class="swim-step-form" style="margin-left:${depth * 12}px" data-sb-form="${step._uid}">
          <div class="swim-step-form-row">
            <label>Repeat count
              <input type="number" data-sb-field="count" value="${_esc(step.count || 1)}" min="1" />
            </label>
          </div>
          <div class="swim-step-form-actions">
            <button data-sb-form-cancel="1">Cancel</button>
            <button class="swim-form-save" data-sb-form-save="1">Save</button>
          </div>
        </div>
      `;
    }
    // interval
    const strokeOpts = M.STROKES.map(s => `<option value="${s}"${step.stroke === s ? " selected" : ""}>${M.STROKE_LABELS[s]}</option>`).join("");
    return `
      <div class="swim-step-form" style="margin-left:${depth * 12}px" data-sb-form="${step._uid}">
        <div class="swim-step-form-row">
          <label>Name
            <input type="text" data-sb-field="name" value="${_esc(step.name || "")}" placeholder="e.g. Main, Warm Up" />
          </label>
        </div>
        <div class="swim-step-form-row">
          <label>Distance (m)
            <input type="number" data-sb-field="distance_m" value="${_esc(step.distance_m || 100)}" min="1" />
          </label>
          <label>Stroke
            <select data-sb-field="stroke">${strokeOpts}</select>
          </label>
        </div>
        <div class="swim-step-form-row">
          <label>Pace target
            <input type="text" data-sb-field="pace_target" value="${_esc(step.pace_target || "")}" placeholder="e.g. CSS, easy" />
          </label>
        </div>
        <div class="swim-step-form-actions">
          <button data-sb-form-cancel="1">Cancel</button>
          <button class="swim-form-save" data-sb-form-save="1">Save</button>
        </div>
      </div>
    `;
  }

  // Render the "adding a new step" inline form (separate from editing an
  // existing step because it hasn't been inserted into the tree yet).
  function _renderAddingForm() {
    if (!_state || !_state.adding) return "";
    const M = window.SwimWorkout;
    const kind = _state.adding;
    const parentUid = _state.addParentUid;
    const depth = parentUid ? 1 : 0;
    // Render a blank form. The _state.editingDraft holds the in-progress values.
    const draft = _state.editingDraft || {};
    if (kind === "rest") {
      return `
        <div class="swim-step-form" style="margin-left:${depth * 12}px" data-sb-add-form="1" data-sb-add-kind="rest" data-sb-add-parent="${parentUid || ''}">
          <div class="swim-step-form-row">
            <label>Rest duration (sec)
              <input type="number" data-sb-add-field="duration_sec" value="${_esc(draft.duration_sec || 15)}" min="0" />
            </label>
          </div>
          <div class="swim-step-form-actions">
            <button data-sb-add-cancel="1">Cancel</button>
            <button class="swim-form-save" data-sb-add-save="1">Add</button>
          </div>
        </div>
      `;
    }
    if (kind === "repeat") {
      return `
        <div class="swim-step-form" style="margin-left:${depth * 12}px" data-sb-add-form="1" data-sb-add-kind="repeat" data-sb-add-parent="${parentUid || ''}">
          <div class="swim-step-form-row">
            <label>Repeat count
              <input type="number" data-sb-add-field="count" value="${_esc(draft.count || 4)}" min="1" />
            </label>
          </div>
          <div class="swim-step-form-actions">
            <button data-sb-add-cancel="1">Cancel</button>
            <button class="swim-form-save" data-sb-add-save="1">Add</button>
          </div>
        </div>
      `;
    }
    // interval
    const strokeOpts = M.STROKES.map(s => `<option value="${s}"${(draft.stroke || "freestyle") === s ? " selected" : ""}>${M.STROKE_LABELS[s]}</option>`).join("");
    return `
      <div class="swim-step-form" style="margin-left:${depth * 12}px" data-sb-add-form="1" data-sb-add-kind="interval" data-sb-add-parent="${parentUid || ''}">
        <div class="swim-step-form-row">
          <label>Name
            <input type="text" data-sb-add-field="name" value="${_esc(draft.name || "")}" placeholder="e.g. Main, Warm Up" />
          </label>
        </div>
        <div class="swim-step-form-row">
          <label>Distance (m)
            <input type="number" data-sb-add-field="distance_m" value="${_esc(draft.distance_m || 100)}" min="1" />
          </label>
          <label>Stroke
            <select data-sb-add-field="stroke">${strokeOpts}</select>
          </label>
        </div>
        <div class="swim-step-form-row">
          <label>Pace target
            <input type="text" data-sb-add-field="pace_target" value="${_esc(draft.pace_target || "")}" placeholder="e.g. CSS, easy" />
          </label>
        </div>
        <div class="swim-step-form-actions">
          <button data-sb-add-cancel="1">Cancel</button>
          <button class="swim-form-save" data-sb-add-save="1">Add</button>
        </div>
      </div>
    `;
  }

  // ─── Event wiring ───────────────────────────────────────────────────────

  function _wire(root) {
    root.querySelector("[data-sb-cancel]")?.addEventListener("click", close);
    root.querySelector("[data-sb-save]")?.addEventListener("click", _save);
    root.querySelector("[data-sb-date]")?.addEventListener("change", e => { _state.dateStr = e.target.value; });

    // Pool length cycle — tap the POOL pill to rotate through the
    // SwimWorkout.POOL_SIZES list (25 m → 50 m → 25 yd → 25 m...).
    // Updates _state.pool live; the next render reflects the new
    // length and the totals row recomputes.
    root.querySelector("[data-sb-pool-cycle]")?.addEventListener("click", () => {
      const M = window.SwimWorkout;
      if (!M || !Array.isArray(M.POOL_SIZES) || !M.POOL_SIZES.length) return;
      const sizes = M.POOL_SIZES;
      const currentIdx = sizes.findIndex(s => s.value === _state.pool.value);
      const next = sizes[(currentIdx + 1) % sizes.length] || sizes[0];
      _state.pool = next;
      _render();
    });

    // Footer: add step / add repeat
    root.querySelectorAll("[data-sb-add]").forEach(el => {
      el.addEventListener("click", () => {
        _state.adding = el.dataset.sbAdd;
        _state.addParentUid = null;
        _state.editingDraft = {};
        _state.editing = null;
        _render();
      });
    });

    // "Add inside repeat" buttons
    root.querySelectorAll("[data-sb-add-inside]").forEach(el => {
      el.addEventListener("click", () => {
        const [parentUid, kind] = el.dataset.sbAddInside.split("|");
        _state.adding = kind;
        _state.addParentUid = parentUid;
        _state.editingDraft = {};
        _state.editing = null;
        _render();
      });
    });

    // Edit existing step
    root.querySelectorAll("[data-sb-edit]").forEach(el => {
      el.addEventListener("click", () => {
        const uid = el.dataset.sbEdit;
        const step = _findStep(_state.steps, uid);
        if (!step) return;
        _state.editing = { uid, kind: step.kind };
        _state.adding = null;
        _render();
      });
    });

    // Delete existing step
    root.querySelectorAll("[data-sb-delete]").forEach(el => {
      el.addEventListener("click", () => {
        const uid = el.dataset.sbDelete;
        _removeStep(_state.steps, uid);
        _render();
      });
    });

    // Inline edit form save / cancel
    root.querySelectorAll("[data-sb-form]").forEach(formEl => {
      const uid = formEl.dataset.sbForm;
      formEl.querySelector("[data-sb-form-cancel]")?.addEventListener("click", () => {
        _state.editing = null;
        _render();
      });
      formEl.querySelector("[data-sb-form-save]")?.addEventListener("click", () => {
        const step = _findStep(_state.steps, uid);
        if (!step) { _state.editing = null; _render(); return; }
        formEl.querySelectorAll("[data-sb-field]").forEach(inp => {
          const key = inp.dataset.sbField;
          let val = inp.value;
          if (key === "distance_m" || key === "duration_sec" || key === "count") val = parseInt(val, 10) || 0;
          step[key] = val;
        });
        _state.editing = null;
        _render();
      });
    });

    // Add form
    const addForm = root.querySelector("[data-sb-add-form]");
    if (addForm) {
      const kind = addForm.dataset.sbAddKind;
      const parentUid = addForm.dataset.sbAddParent;
      addForm.querySelector("[data-sb-add-cancel]")?.addEventListener("click", () => {
        _state.adding = null;
        _state.addParentUid = null;
        _state.editingDraft = null;
        _render();
      });
      addForm.querySelector("[data-sb-add-save]")?.addEventListener("click", () => {
        const M = window.SwimWorkout;
        const fields = {};
        addForm.querySelectorAll("[data-sb-add-field]").forEach(inp => {
          fields[inp.dataset.sbAddField] = inp.value;
        });
        let newStep;
        if (kind === "rest") {
          newStep = M.makeRest(parseInt(fields.duration_sec, 10) || 15);
        } else if (kind === "repeat") {
          newStep = M.makeRepeat(parseInt(fields.count, 10) || 4, []);
        } else {
          newStep = M.makeInterval({
            name: fields.name || "",
            distance_m: parseInt(fields.distance_m, 10) || 100,
            stroke: fields.stroke || "freestyle",
            pace_target: fields.pace_target || "",
          });
        }
        newStep._uid = _stepId();
        if (parentUid) {
          const parent = _findStep(_state.steps, parentUid);
          if (parent && parent.kind === "repeat") {
            parent.children.push(newStep);
          } else {
            _state.steps.push(newStep);
          }
        } else {
          _state.steps.push(newStep);
        }
        _state.adding = null;
        _state.addParentUid = null;
        _state.editingDraft = null;
        _render();
      });
    }
  }

  // ─── Save to workouts ───────────────────────────────────────────────────

  function _save() {
    if (!_state) return;
    const M = window.SwimWorkout;
    const cleanSteps = _cleanSteps(_state.steps);
    if (!cleanSteps.length) {
      alert("Add at least one step before saving.");
      return;
    }
    const totalM = M.totalDistance(cleanSteps);
    const aiSession = {
      title: _state.title,
      type: "swim",
      pool_size_m: _state.pool.length_m,
      pool_unit: _state.pool.unit,
      total_distance_m: totalM,
      steps: cleanSteps,
      // Legacy `intervals` so old display paths still render something
      // sensible if SwimCardRenderer isn't available for some reason.
      intervals: _legacyIntervalsFromSteps(cleanSteps),
    };

    // Unified Workout Builder path — hand a normalized workout to the
    // caller's onSave instead of touching localStorage directly.
    if (_state.onSave) {
      const workout = {
        discipline: "swim",
        type: "swimming",
        name: _state.title || "Pool Workout",
        notes: _state.notes || "",
        exercises: [],
        durationMin: 0,
        structure: {
          steps: cleanSteps,
          intervals: aiSession.intervals,
          pool: { size_m: _state.pool.length_m, unit: _state.pool.unit },
          total_distance_m: totalM,
        },
      };
      try { _state.onSave(workout); } catch (e) { console.error("[SwimBuilderModal] onSave failed:", e); }
      close();
      return;
    }

    // Legacy path — direct write to localStorage.workouts. Kept for any
    // surface that still calls open(dateStr) without onSave (edit from
    // workouts row via existingWorkoutId).
    let workouts = [];
    try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
    if (_state.mode === "edit" && _state.workoutId) {
      const idx = workouts.findIndex(w => w.id === _state.workoutId);
      if (idx >= 0) {
        workouts[idx] = {
          ...workouts[idx],
          date: _state.dateStr,
          type: "swimming",
          notes: _state.notes || workouts[idx].notes || "",
          aiSession,
        };
      }
    } else {
      const id = _genId();
      workouts.unshift({
        id, date: _state.dateStr, type: "swimming",
        notes: _state.notes || "",
        exercises: [],
        aiSession,
      });
    }
    localStorage.setItem("workouts", JSON.stringify(workouts));
    try { if (typeof DB !== "undefined" && DB.syncWorkouts) DB.syncWorkouts(); } catch {}

    close();

    // Re-render whatever was showing this workout
    try { if (typeof renderCalendar === "function") renderCalendar(); } catch {}
    try {
      if (typeof renderDayDetail === "function" && typeof selectedDate !== "undefined" && selectedDate === _state?.dateStr) {
        renderDayDetail(_state.dateStr);
      } else if (typeof renderDayDetail === "function") {
        renderDayDetail(_state.dateStr || _todayStr());
      }
    } catch {}
    try { if (typeof renderWorkoutHistory === "function") renderWorkoutHistory(); } catch {}
    try { if (typeof closeQuickEntry === "function") closeQuickEntry(); } catch {}
  }

  // Derive a legacy intervals array from a step tree so old display surfaces
  // still get *something* to show even without SwimCardRenderer.
  // Effort is inferred from pace_target so the intensity strip can paint
  // distinct zones (build/sprint reads as Z4-Z5, drills/easy as Z2,
  // cooldown as Z1). Rest carries the rep count too — without it,
  // multi-round sets compute duration with one rest instead of N.
  function _paceTargetToZone(paceTarget, name) {
    const c = (String(paceTarget || "") + " " + String(name || "")).toLowerCase();
    if (/cool ?down|very easy|long and loose/.test(c)) return "Z1";
    if (/sprint|all.?out|max|race ?pace|css.?-|build to fast/.test(c)) return "Z5";
    if (/threshold|@ ?css\b/.test(c)) return "Z4";
    if (/tempo|css.?\+ ?[1-5]\b/.test(c)) return "Z3";
    return "Z2";
  }
  function _legacyIntervalsFromSteps(steps) {
    const out = [];
    function walk(arr, reps) {
      for (const s of arr) {
        if (!s) continue;
        if (s.kind === "interval") {
          out.push({
            name: s.name || "Swim",
            duration: `${s.distance_m}m`,
            effort: _paceTargetToZone(s.pace_target, s.name),
            details: (s.pace_target ? `@ ${s.pace_target}` : ""),
            reps: reps > 1 ? reps : undefined,
          });
        } else if (s.kind === "rest") {
          out.push({
            name: "Rest",
            duration: `${s.duration_sec}s`,
            effort: "RW",
            details: "",
            reps: reps > 1 ? reps : undefined,
          });
        } else if (s.kind === "repeat") {
          walk(s.children || [], (reps || 1) * (s.count || 1));
        }
      }
    }
    walk(steps, 1);
    return out;
  }

  const api = { open, close };
  if (typeof window !== "undefined") window.SwimBuilderModal = api;
})();
