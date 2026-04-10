// custom-plan.js — Create Your Own Plan
// Weekly template builder with AI, saved workout, manual, and rest day options per day.

function cpSwitchMode(mode) {
  const createBody = document.getElementById("cp-create-body");
  const importBody = document.getElementById("import-plan-body");
  const createBtn = document.getElementById("cp-mode-create");
  const importBtn = document.getElementById("cp-mode-import");
  if (mode === "import") {
    if (createBody) createBody.style.display = "none";
    if (importBody) importBody.style.display = "";
    if (createBtn) createBtn.classList.remove("cp-mode-btn--active");
    if (importBtn) importBtn.classList.add("cp-mode-btn--active");
    // Default import start date to same as create
    const importStart = document.getElementById("import-start-date");
    const createStart = document.getElementById("custom-plan-start");
    if (importStart && createStart && !importStart.value) importStart.value = createStart.value;
  } else {
    if (createBody) createBody.style.display = "";
    if (importBody) importBody.style.display = "none";
    if (createBtn) createBtn.classList.add("cp-mode-btn--active");
    if (importBtn) importBtn.classList.remove("cp-mode-btn--active");
  }
}

const CP_DAYS = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
];

// Stores what the user has assigned to each day of the week template.
// Key = dow (0-6), value = ARRAY of sessions. Each session has shape:
//   { id, mode: "ai"|"saved"|"manual"|"rest", data: {...} }
// A day may have 1..N sessions (e.g. AM swim + PM lift). Rest days have
// a single entry with mode "rest".
let cpWeekTemplate = {};

// ── Data-model helpers ────────────────────────────────────────────────────────

function _cpGenId() {
  return "cp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// Coerce a day slot to an array (migrates legacy single-object shape in place).
function _cpEnsureArray(dow) {
  const slot = cpWeekTemplate[dow];
  if (slot == null) {
    cpWeekTemplate[dow] = [];
  } else if (!Array.isArray(slot)) {
    // Legacy: { mode, data } — wrap as array
    cpWeekTemplate[dow] = [{ id: _cpGenId(), ...slot }];
  }
  // Ensure every entry has an id
  cpWeekTemplate[dow].forEach(s => { if (!s.id) s.id = _cpGenId(); });
  return cpWeekTemplate[dow];
}

// Walk the whole template and coerce every day to array shape.
function _cpMigrateTemplate() {
  for (const dow of Object.keys(cpWeekTemplate)) _cpEnsureArray(dow);
}

// Push a session onto a day. If adding a non-rest session to a rest day,
// clear the rest marker first. If adding a rest session, replace the day.
function _cpAddSession(dow, session) {
  const arr = _cpEnsureArray(dow);
  if (!session.id) session.id = _cpGenId();
  if (session.mode === "rest") {
    cpWeekTemplate[dow] = [session];
    return 0;
  }
  // If the day is currently a rest day, clear it first
  if (arr.length === 1 && arr[0].mode === "rest") {
    cpWeekTemplate[dow] = [session];
    return 0;
  }
  arr.push(session);
  return arr.length - 1;
}

function _cpReplaceSession(dow, idx, session) {
  const arr = _cpEnsureArray(dow);
  if (idx < 0 || idx >= arr.length) return;
  // Preserve id across edits
  if (!session.id) session.id = arr[idx].id || _cpGenId();
  arr[idx] = session;
}

function _cpRemoveSession(dow, idx) {
  const arr = _cpEnsureArray(dow);
  if (idx < 0 || idx >= arr.length) return;
  arr.splice(idx, 1);
}

function initCustomPlan() {
  // Migrate any legacy single-object shape before rendering
  _cpMigrateTemplate();
  // Only reset template if it's empty (preserve in-progress edits across tab switches)
  if (Object.keys(cpWeekTemplate).length === 0) {
    renderCustomPlanBuilder();
  } else {
    renderCustomPlanBuilder();
  }
  // Set default start date to next Monday if empty
  const startInput = document.getElementById("custom-plan-start");
  if (startInput && !startInput.value) {
    const today = new Date();
    const dow = today.getDay();
    const daysUntilMon = dow === 0 ? 1 : (8 - dow);
    const nextMon = new Date(today);
    nextMon.setDate(today.getDate() + daysUntilMon);
    startInput.value = nextMon.toISOString().slice(0, 10);
  }
}

// ── Render the weekly builder ─────────────────────────────────────────────────

function renderCustomPlanBuilder() {
  const container = document.getElementById("custom-plan-builder");
  if (!container) return;

  container.innerHTML = CP_DAYS.map(d => {
    return `
      <div class="custom-plan-day" data-day="${d.dow}">
        <div class="custom-day-header">
          <span class="custom-day-label">${d.label}</span>
          <div class="custom-day-actions">
            <button class="btn-secondary btn-sm" onclick="customPlanAddAI(${d.dow})">AI Generate</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddSaved(${d.dow})">From Saved</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddManual(${d.dow})">Manual</button>
            <button class="btn-secondary btn-sm" onclick="customPlanSetRest(${d.dow})">Rest</button>
          </div>
        </div>
        <div class="custom-day-content" id="custom-day-${d.dow}-content">
          ${renderDayContent(d.dow)}
        </div>
      </div>
    `;
  }).join("");
}

// Re-render a single day's content area (after an add/edit/remove).
function _cpRerenderDay(dow) {
  const contentEl = document.getElementById(`custom-day-${dow}-content`);
  if (contentEl) contentEl.innerHTML = renderDayContent(dow);
}

function renderDayContent(dow) {
  const sessions = _cpEnsureArray(dow);
  if (sessions.length === 0) return '<p class="empty-msg">No session planned</p>';

  return sessions.map((entry, idx) => renderSessionCard(dow, idx, entry)).join("");
}

const _CP_TRASH_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>';

function renderSessionCard(dow, idx, entry) {
  if (entry.mode === "rest") {
    return `
      <div class="cp-day-entry cp-day-rest">
        <span>Rest Day</span>
        <button class="cp-remove-btn" onclick="event.stopPropagation();customPlanRemoveSession(${dow}, ${idx})" title="Remove">${_CP_TRASH_SVG}</button>
      </div>`;
  }

  let title = "Session";
  let type = entry.data?.type || "general";
  let detail = "";

  if (entry.mode === "ai") {
    title = entry.data?.title || entry.data?.sessionName || "AI-Generated Session";
  } else if (entry.mode === "saved") {
    title = entry.data?.sessionName || entry.data?.name || "Saved Workout";
  } else if (entry.mode === "manual") {
    title = entry.data?.sessionName || "Custom Session";
  }

  const exCount = entry.data?.exercises?.length || 0;
  const ivCount = entry.data?.intervals?.length || entry.data?.aiSession?.intervals?.length || 0;
  if (exCount) detail = `<span class="cp-day-entry-detail">${exCount} exercise${exCount !== 1 ? "s" : ""}</span>`;
  else if (ivCount) detail = `<span class="cp-day-entry-detail">${ivCount} interval${ivCount !== 1 ? "s" : ""}</span>`;

  return `
    <div class="cp-day-entry cp-day-entry--tappable" onclick="customPlanEditSession(${dow}, ${idx})" title="Tap to edit">
      <div class="cp-day-entry-info">
        <span class="cp-day-entry-type">${type}</span>
        <span class="cp-day-entry-title">${_cpEsc(title)}</span>
        ${detail}
      </div>
      <button class="cp-remove-btn" onclick="event.stopPropagation();customPlanRemoveSession(${dow}, ${idx})" title="Remove">${_CP_TRASH_SVG}</button>
    </div>`;
}

// Remove a specific session from a day.
function customPlanRemoveSession(dow, idx) {
  _cpRemoveSession(dow, idx);
  _cpRerenderDay(dow);
}

// Back-compat shim: clear all sessions for a day.
function customPlanClearDay(dow) {
  cpWeekTemplate[dow] = [];
  _cpRerenderDay(dow);
}

// Dispatch tap on a session card: open the manual editor pre-populated
// with that session's data. AI/Saved sessions open in the manual editor
// too, so users can tweak any session uniformly.
function customPlanEditSession(dow, idx) {
  const arr = _cpEnsureArray(dow);
  const entry = arr[idx];
  if (!entry || entry.mode === "rest") return;
  customPlanAddManual(dow, idx);
}

// ── AI Generate for a day ─────────────────────────────────────────────────────

const CP_MUSCLES = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Core", "Calves", "Full Body"];

function customPlanAddAI(dow) {
  const dayLabel = CP_DAYS.find(d => d.dow === dow)?.label || "this day";
  const types = [
    { value: "strength", label: "Strength" },
    { value: "running", label: "Running" },
    { value: "cycling", label: "Cycling" },
    { value: "swimming", label: "Swimming" },
    { value: "hiit", label: "HIIT" },
    { value: "yoga", label: "Yoga / Mobility" },
    { value: "bodyweight", label: "Bodyweight" },
  ];

  const modal = document.getElementById("cp-ai-modal");
  if (!modal) return;
  modal.classList.add("is-open");
  modal.dataset.dow = dow;

  const list = document.getElementById("cp-ai-type-list");
  if (list) {
    list.innerHTML = types.map(t => `
      <button class="cp-type-btn" onclick="${t.value === 'strength' ? `cpShowStrengthOptions(${dow})` : `customPlanGenerateAI(${dow}, '${t.value}')`}">${t.label}</button>
    `).join("");
  }

  // Reset to type picker view
  const detailEl = document.getElementById("cp-ai-detail");
  if (detailEl) detailEl.style.display = "none";
  if (list) list.style.display = "";

  const title = document.getElementById("cp-ai-modal-title");
  if (title) title.textContent = `AI Session for ${dayLabel}`;
}

function cpShowStrengthOptions(dow) {
  const list = document.getElementById("cp-ai-type-list");
  const detailEl = document.getElementById("cp-ai-detail");
  if (list) list.style.display = "none";
  if (!detailEl) return;
  detailEl.style.display = "";

  const title = document.getElementById("cp-ai-modal-title");
  if (title) title.textContent = "Strength Session";

  detailEl.innerHTML = `
    <div style="padding:0 16px 16px">
      <div class="cp-detail-label">Which muscles are you targeting?</div>
      <div class="cp-muscle-grid">
        ${CP_MUSCLES.map(m => `
          <label class="ob-chip">
            <input type="checkbox" value="${m.toLowerCase()}" />
            <span class="ob-chip-label">${m}</span>
          </label>
        `).join("")}
      </div>
      <div class="form-row" style="margin-top:14px">
        <label for="cp-ai-level">Your Level</label>
        <select id="cp-ai-level">
          <option value="beginner">Beginner</option>
          <option value="intermediate" selected>Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
      <div class="form-row">
        <label for="cp-ai-duration">Session Length</label>
        <select id="cp-ai-duration">
          <option value="30">30 min</option>
          <option value="45" selected>45 min</option>
          <option value="60">60 min</option>
          <option value="75">75 min</option>
        </select>
      </div>
      <button class="btn-primary" style="width:100%;margin-top:8px" onclick="cpGenerateStrength(${dow})">Generate</button>
    </div>
  `;

  // Pre-select level from onboarding
  try {
    const ob = JSON.parse(localStorage.getItem("onboardingData") || "{}");
    if (ob.level) document.getElementById("cp-ai-level").value = ob.level;
  } catch {}
}

function cpGenerateStrength(dow) {
  const muscles = Array.from(document.querySelectorAll("#cp-ai-detail .ob-chip input:checked")).map(el => el.value);
  if (muscles.length === 0) { alert("Select at least one muscle group."); return; }
  const level = document.getElementById("cp-ai-level")?.value || "intermediate";
  const duration = document.getElementById("cp-ai-duration")?.value || "45";
  const muscleStr = muscles.join(", ");
  closeCustomPlanAIModal();
  customPlanGenerateAI(dow, "strength", `Target muscles: ${muscleStr}. Level: ${level}. Session length: ${duration} min.`);
}

function closeCustomPlanAIModal() {
  const modal = document.getElementById("cp-ai-modal");
  if (modal) modal.classList.remove("is-open");
}

function cpShowAskIronZ() {
  const panel = document.getElementById("cp-ask-ironz-panel");
  if (!panel) return;
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "";
  if (!isOpen) {
    // Hide the type list and detail when Ask IronZ is open
    const list = document.getElementById("cp-ai-type-list");
    if (list) list.style.display = "none";
    const detail = document.getElementById("cp-ai-detail");
    if (detail) detail.style.display = "none";
    const title = document.getElementById("cp-ai-modal-title");
    if (title) title.textContent = "Ask IronZ";
    document.getElementById("cp-ask-ironz-input")?.focus();
  } else {
    // Restore type list
    const list = document.getElementById("cp-ai-type-list");
    if (list) list.style.display = "";
    const modal = document.getElementById("cp-ai-modal");
    const dow = parseInt(modal?.dataset.dow);
    const dayLabel = CP_DAYS.find(d => d.dow === dow)?.label || "this day";
    const title = document.getElementById("cp-ai-modal-title");
    if (title) title.textContent = `AI Session for ${dayLabel}`;
  }
}

async function cpSubmitAskIronZ() {
  const input = document.getElementById("cp-ask-ironz-input");
  const prompt = (input?.value || "").trim();
  if (!prompt) return;

  const modal = document.getElementById("cp-ai-modal");
  const dow = parseInt(modal?.dataset.dow);

  closeCustomPlanAIModal();

  const contentEl = document.getElementById(`custom-day-${dow}-content`);
  if (contentEl) contentEl.innerHTML = '<div class="qe-spinner" style="margin:8px auto"></div>';

  let profileCtx = "";
  try {
    const p = JSON.parse(localStorage.getItem("profile") || "{}");
    if (p.age) profileCtx += `Age: ${p.age}. `;
    if (p.weight) profileCtx += `Weight: ${p.weight} lbs. `;
    if (p.goal) profileCtx += `Goal: ${p.goal}. `;
  } catch {}

  let avoidCtx = "";
  try {
    const prefs = JSON.parse(localStorage.getItem("trainingPreferences") || "{}");
    const avoided = prefs.avoidedExercises || [];
    if (avoided.length) avoidCtx = `NEVER include these exercises: ${avoided.join(", ")}. `;
  } catch {}

  let refCtx = "";
  try {
    const allZones = JSON.parse(localStorage.getItem("trainingZones")) || {};
    const refs = allZones.strength || null;
    if (refs) {
      const liftLabels = { bench: "Bench Press", squat: "Back Squat", deadlift: "Deadlift", ohp: "Overhead Press", row: "Barbell Row" };
      const lines = Object.entries(liftLabels)
        .filter(([k]) => refs[k]?.weight)
        .map(([k, label]) => `${label}: ${refs[k].weight} lbs`);
      if (lines.length) refCtx = `Reference lifts: ${lines.join(", ")}. `;
    }
  } catch {}

  try {
    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: `You are a personal trainer. The athlete says: "${prompt}". ${profileCtx}${refCtx}${avoidCtx}

Determine the workout type and generate an appropriate session.

Return ONLY valid JSON, no markdown:
For strength/HIIT/general workouts: {"type":"strength","title":"Session Name","exercises":[{"name":"Exercise","sets":3,"reps":10,"rest":"60s","weight":"135 lbs"}]}
For cardio (running/cycling/swimming): {"type":"running","title":"Session Name","intervals":[{"name":"Phase","duration":"10 min","effort":"Easy","details":"Description"}]}
Include 5-8 exercises or 3-5 intervals.`
      }]
    });

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const workout = JSON.parse(cleaned);

    const workoutType = workout.type || "strength";
    _cpAddSession(dow, {
      id: _cpGenId(),
      mode: "ai",
      data: {
        type: workoutType,
        title: workout.title || "IronZ Session",
        sessionName: workout.title || "IronZ Session",
        exercises: workout.exercises || null,
        aiSession: workout.intervals ? { title: workout.title, intervals: workout.intervals } : null,
      }
    });
    _cpRerenderDay(dow);
  } catch (err) {
    if (contentEl) contentEl.innerHTML = `<p class="empty-msg" style="color:var(--color-danger)">Error: ${err.message}</p>`;
  }

  // Clear the input for next time
  if (input) input.value = "";
}

async function customPlanGenerateAI(dow, workoutType, extraContext) {
  closeCustomPlanAIModal();

  // Show a spinner alongside existing sessions (don't blow them away)
  const contentEl = document.getElementById(`custom-day-${dow}-content`);
  if (contentEl) {
    const spinner = document.createElement("div");
    spinner.className = "qe-spinner cp-inline-spinner";
    spinner.style.margin = "8px auto";
    contentEl.appendChild(spinner);
  }

  let profileCtx = "";
  try {
    const p = JSON.parse(localStorage.getItem("profile") || "{}");
    if (p.age) profileCtx += `Age: ${p.age}. `;
    if (p.weight) profileCtx += `Weight: ${p.weight} lbs. `;
    if (p.goal) profileCtx += `Goal: ${p.goal}. `;
  } catch {}

  let levelCtx = "";
  try {
    const ob = JSON.parse(localStorage.getItem("onboardingData") || "{}");
    if (ob.level) levelCtx = `Experience: ${ob.level}. `;
  } catch {}

  let avoidCtx = "";
  try {
    const prefs = JSON.parse(localStorage.getItem("trainingPreferences") || "{}");
    const avoided = prefs.avoidedExercises || [];
    if (avoided.length) avoidCtx = `NEVER include these exercises: ${avoided.join(", ")}. `;
  } catch {}

  const extraCtx = extraContext ? extraContext + " " : "";
  const isCardio = ["running", "cycling", "swimming"].includes(workoutType);
  const isBodyweight = workoutType === "bodyweight";
  const bwConstraint = isBodyweight
    ? "IMPORTANT: This is a BODYWEIGHT-ONLY session. Every exercise must use ONLY bodyweight — absolutely NO dumbbells, barbells, kettlebells, cables, machines, or any external weight. All weight fields must be \"Bodyweight\". "
    : "";
  const prompt = `Generate a single ${workoutType} session. ${bwConstraint}${extraCtx}${profileCtx}${levelCtx}${avoidCtx}

Return ONLY valid JSON, no markdown:
${isCardio
  ? `{"type":"${workoutType}","title":"Session Name","intervals":[{"name":"Phase","duration":"10 min","effort":"Easy","details":"Description"}]}`
  : `{"type":"${workoutType}","title":"Session Name","exercises":[{"name":"Exercise","sets":3,"reps":10,"rest":"60s","weight":"Bodyweight"}]}`
}
Include 5-8 exercises or 3-5 intervals.`;

  try {
    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }]
    });

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const workout = JSON.parse(cleaned);

    _cpAddSession(dow, {
      id: _cpGenId(),
      mode: "ai",
      data: {
        type: workout.type || workoutType,
        title: workout.title || `${workoutType} Session`,
        sessionName: workout.title || `${workoutType} Session`,
        exercises: workout.exercises || null,
        aiSession: workout.intervals ? { title: workout.title, intervals: workout.intervals } : null,
      }
    });
  } catch (err) {
    _cpAddSession(dow, {
      id: _cpGenId(),
      mode: "ai",
      data: {
        type: workoutType,
        title: `${workoutType.charAt(0).toUpperCase() + workoutType.slice(1)} Session`,
        sessionName: `${workoutType.charAt(0).toUpperCase() + workoutType.slice(1)} Session`,
      }
    });
  }

  _cpRerenderDay(dow);
}

// ── From Saved Workouts ───────────────────────────────────────────────────────

function customPlanAddSaved(dow) {
  const saved = typeof loadSavedWorkouts === "function" ? loadSavedWorkouts() : [];
  if (saved.length === 0) {
    const contentEl = document.getElementById(`custom-day-${dow}-content`);
    if (contentEl) contentEl.innerHTML = '<p class="empty-msg">No saved workouts yet. Save workouts from your history first.</p>';
    return;
  }

  const modal = document.getElementById("cp-saved-modal");
  if (!modal) return;
  modal.classList.add("is-open");
  modal.dataset.dow = dow;

  const list = document.getElementById("cp-saved-list");
  if (list) {
    list.innerHTML = saved.map((sw, i) => `
      <button class="cp-saved-item" onclick="customPlanSelectSaved(${dow}, ${i})">
        <span class="cp-saved-name">${_cpEsc(sw.name || "Untitled")}</span>
        <span class="cp-saved-type">${sw.type || "general"}</span>
      </button>
    `).join("");
  }
}

function closeCustomPlanSavedModal() {
  const modal = document.getElementById("cp-saved-modal");
  if (modal) modal.classList.remove("is-open");
}

function customPlanSelectSaved(dow, index) {
  closeCustomPlanSavedModal();
  const saved = typeof loadSavedWorkouts === "function" ? loadSavedWorkouts() : [];
  const sw = saved[index];
  if (!sw) return;

  _cpAddSession(dow, {
    id: _cpGenId(),
    mode: "saved",
    data: {
      ...sw,
      sessionName: sw.name || "Saved Workout",
    }
  });
  _cpRerenderDay(dow);
}

// ── Manual Entry ──────────────────────────────────────────────────────────────

let _cpManualSelectedType = "";
let _cpManualRowCount = 0;
// When editing an existing session, this holds the array index. null = add mode.
let _cpManualEditIdx = null;
// When true, cpManualAddExRow suppresses the per-insert badge refresh so
// the caller can do a single refresh at the end (prevents prematurely
// clearing single-row superset groups during bulk prefill).
let _cpManualSuppressBadgeRefresh = false;

function customPlanAddManual(dow, editIdx) {
  const modal = document.getElementById("cp-manual-modal");
  if (!modal) return;
  modal.classList.add("is-open");
  modal.dataset.dow = dow;
  _cpManualSelectedType = "";
  _cpManualEditIdx = (typeof editIdx === "number") ? editIdx : null;

  // Reset form
  document.getElementById("cp-manual-name").value = "";
  document.getElementById("cp-manual-notes").value = "";

  // Update Save button label and show/hide Delete button based on mode
  const saveBtn = document.getElementById("cp-manual-save-btn");
  if (saveBtn) saveBtn.textContent = _cpManualEditIdx != null ? "Update Session" : "Save Session";
  const delBtn = document.getElementById("cp-manual-delete-btn");
  if (delBtn) delBtn.style.display = _cpManualEditIdx != null ? "" : "none";

  if (_cpManualEditIdx != null) {
    // Pre-populate from the existing session
    const arr = _cpEnsureArray(dow);
    const entry = arr[_cpManualEditIdx];
    if (entry) {
      _cpManualPrefillFromEntry(entry);
      return;
    }
  }

  cpManualShowStep(1);
}

// Pre-populate the manual modal from an existing session entry (any mode).
function _cpManualPrefillFromEntry(entry) {
  const d = entry.data || {};
  const type = d.type || "general";
  // Jump straight to step 2 with the right type selected
  _cpManualSelectedType = type;

  document.getElementById("cp-manual-name").value = d.sessionName || d.title || d.name || "";
  document.getElementById("cp-manual-notes").value = d.details || d.notes || "";

  const isCardio = ["running", "cycling", "swimming"].includes(type);
  const nameInput = document.getElementById("cp-manual-name");
  nameInput.placeholder = isCardio ? "e.g. Easy 5K, Recovery Ride" : "e.g. " + (CP_TYPE_LABELS[type] || "Custom") + " Day A";
  const notesLabel = document.querySelector('label[for="cp-manual-notes"]');
  if (notesLabel) notesLabel.textContent = isCardio ? "Session Title / Notes (optional)" : "Session Notes (optional)";
  document.getElementById("cp-manual-exercises").style.display = isCardio ? "none" : "";
  document.getElementById("cp-manual-cardio").style.display = isCardio ? "" : "none";

  if (isCardio) {
    _cpManualCardioRowCount = 0;
    document.getElementById("cp-manual-cardio-rows").innerHTML = "";
    const intervals = d.intervals || d.aiSession?.intervals || [];
    if (intervals.length === 0) {
      cpManualAddCardioRow();
    } else {
      intervals.forEach(iv => cpManualAddCardioRow(iv));
    }
  } else {
    _cpManualRowCount = 0;
    document.getElementById("cp-manual-exercise-rows").innerHTML = "";
    const exercises = d.exercises || [];
    if (exercises.length === 0) {
      cpManualAddExRow();
      cpManualAddExRow();
      cpManualAddExRow();
    } else {
      // Bulk-add without per-row badge refresh, then render badges once
      _cpManualSuppressBadgeRefresh = true;
      try {
        exercises.forEach(ex => cpManualAddExRow(ex));
      } finally {
        _cpManualSuppressBadgeRefresh = false;
      }
      _cpRefreshSsBadges();
    }
  }
  cpManualShowStep(2);
}

function cpManualShowStep(step) {
  document.getElementById("cp-manual-step-1").style.display = step === 1 ? "" : "none";
  document.getElementById("cp-manual-step-2").style.display = step === 2 ? "" : "none";
  document.getElementById("cp-manual-back").style.display = step === 2 ? "" : "none";
  const titleEl = document.getElementById("cp-manual-title");
  if (titleEl) titleEl.textContent = _cpManualEditIdx != null ? "Edit Session" : "Add Session";
  // Update step dots
  const dots = document.getElementById("cp-manual-dots");
  if (dots) dots.innerHTML = [1, 2].map(s => `<span class="qe-dot${s === step ? " active" : ""}"></span>`).join("");
}

// Delete the session currently being edited. Only visible in edit mode.
function customPlanDeleteFromModal() {
  const modal = document.getElementById("cp-manual-modal");
  const dow = parseInt(modal?.dataset.dow);
  if (isNaN(dow) || _cpManualEditIdx == null) return;
  _cpRemoveSession(dow, _cpManualEditIdx);
  _cpManualEditIdx = null;
  closeCustomPlanManualModal();
  _cpRerenderDay(dow);
}

const CP_TYPE_LABELS = {
  strength: "Strength", running: "Running", cycling: "Cycling",
  swimming: "Swimming", hiit: "HIIT", yoga: "Yoga / Mobility",
  bodyweight: "Bodyweight", general: "General"
};

function cpManualSelectType(type) {
  _cpManualSelectedType = type;
  const isCardio = ["running", "cycling", "swimming"].includes(type);
  const nameInput = document.getElementById("cp-manual-name");
  nameInput.placeholder = isCardio ? "e.g. Easy 5K, Recovery Ride" : "e.g. " + (CP_TYPE_LABELS[type] || "Custom") + " Day A";
  const notesInput = document.getElementById("cp-manual-notes");
  notesInput.placeholder = isCardio ? "e.g. Easy 5K, Recovery Ride" : "e.g. Upper body focus, felt strong";
  document.querySelector('label[for="cp-manual-notes"]').textContent = isCardio ? "Session Title / Notes (optional)" : "Session Notes (optional)";
  document.getElementById("cp-manual-exercises").style.display = isCardio ? "none" : "";
  document.getElementById("cp-manual-cardio").style.display = isCardio ? "" : "none";
  if (isCardio) {
    _cpManualCardioRowCount = 0;
    document.getElementById("cp-manual-cardio-rows").innerHTML = "";
    cpManualAddCardioRow();
  } else {
    _cpManualRowCount = 0;
    document.getElementById("cp-manual-exercise-rows").innerHTML = "";
    cpManualAddExRow();
    cpManualAddExRow();
    cpManualAddExRow();
  }
  cpManualShowStep(2);
}

// Add a strength / HIIT / bodyweight exercise row.
// Optional `prefill` is an existing exercise object — used when editing.
// Rows are draggable: drop above/below to reorder, drop into the middle
// of another row to group them as a superset.
function cpManualAddExRow(prefill) {
  _cpManualRowCount++;
  const id = _cpManualRowCount;
  const isHiit = _cpManualSelectedType === "hiit";
  const isBW = _cpManualSelectedType === "bodyweight";
  const div = document.createElement("div");
  div.className = "qe-manual-row" + (isHiit ? " hiit-row" : "");
  div.id = `cp-mrow-${id}`;
  div.draggable = true;

  const pName = prefill?.name || "";
  const pReps = (prefill?.reps != null) ? String(prefill.reps) : "";
  const pSets = (prefill?.sets != null) ? String(prefill.sets) : "";
  const pWt = _cpNormalizeWt(prefill?.weight, isBW);
  const pGroup = prefill?.supersetGroup || prefill?.supersetId || "";
  if (pGroup) div.dataset.supersetGroup = pGroup;

  const dragHandleHTML = `<span class="drag-handle" title="Drag to reorder · drop on a row to superset">⠿</span>`;

  if (isHiit) {
    div.innerHTML = `
      ${dragHandleHTML}
      <div><label>Exercise</label>
        <input type="text" id="cp-mex-${id}" placeholder="e.g. Burpees, Row 500m" value="${_cpEsc(pName)}" /></div>
      <div><label>Reps / Time / Distance</label>
        <input type="text" id="cp-mreps-${id}" placeholder="e.g. 10, 45s, 500m" value="${_cpEsc(pReps)}" /></div>
      <div><label>Weight</label>
        <input type="text" id="cp-mwt-${id}" placeholder="optional" value="${_cpEsc(pWt)}" /></div>
      <button class="remove-exercise-btn" onclick="cpManualRemoveRow(${id})">${_CP_TRASH_SVG}</button>`;
  } else {
    const wtPlaceholder = isBW ? "Bodyweight" : "lbs/kg";
    const wtValue = pWt || (isBW ? "Bodyweight" : "");
    const exPlaceholder = isBW ? "e.g. Push-ups, Pull-ups" : "e.g. Bench Press";
    div.innerHTML = `
      ${dragHandleHTML}
      <div><label>Exercise</label>
        <input type="text"   id="cp-mex-${id}"   placeholder="${exPlaceholder}" value="${_cpEsc(pName)}" /></div>
      <div><label>Sets</label>
        <input type="number" id="cp-msets-${id}" placeholder="3" min="1" max="20" value="${_cpEsc(pSets)}" onchange="cpPyramidSetsChanged(${id})" /></div>
      <div><label>Reps</label>
        <input type="text"   id="cp-mreps-${id}" placeholder="10" value="${_cpEsc(pReps)}" /></div>
      <div><label>Weight</label>
        <input type="text"   id="cp-mwt-${id}"   placeholder="${wtPlaceholder}" value="${_cpEsc(wtValue)}"${isBW ? ' readonly' : ''} /></div>
      <button class="ex-pyramid-btn" title="Per-set reps &amp; weight" onclick="cpTogglePyramid(${id})">▾</button>
      <button class="remove-exercise-btn" onclick="cpManualRemoveRow(${id})">${_CP_TRASH_SVG}</button>
      <div class="ex-pyramid-detail" id="cp-pyr-${id}" style="display:none"></div>`;
  }

  // Wire native HTML5 drag-and-drop
  div.addEventListener("dragstart", _cpRowDragStart);
  div.addEventListener("dragend", _cpRowDragEnd);
  div.addEventListener("dragover", _cpRowDragOver);
  div.addEventListener("dragleave", _cpRowDragLeave);
  div.addEventListener("drop", _cpRowDrop);

  const container = document.getElementById("cp-manual-exercise-rows");
  container.appendChild(div);

  // Touch drag support for mobile
  if (typeof TouchDrag !== "undefined") {
    TouchDrag.attach(div, container, {
      hintClasses: ["drag-insert-above", "drag-insert-below", "drag-ss-target"],
      rowSelector: ".qe-manual-row",
      handleSelector: ".drag-handle",
      onDrop(dragEl, targetEl, clientY) {
        const rect = targetEl.getBoundingClientRect();
        const pct = (clientY - rect.top) / rect.height;
        _cpClearAllDragHints();
        if (pct > 0.3 && pct < 0.7) {
          _cpGroupSupersetRows(dragEl, targetEl);
        } else {
          if (pct <= 0.3) container.insertBefore(dragEl, targetEl);
          else container.insertBefore(dragEl, targetEl.nextSibling);
          _cpRefreshSsBadges();
        }
      },
    });
  }

  if (!_cpManualSuppressBadgeRefresh) _cpRefreshSsBadges();
}

// Normalize a weight value for display in an input.
function _cpNormalizeWt(w, isBW) {
  if (w == null || w === "") return isBW ? "Bodyweight" : "";
  return String(w);
}

// ── Custom plan row drag & drop ───────────────────────────────────────────
let _cpDragEl = null;

function _cpRowDragStart(e) {
  _cpDragEl = this;
  this.classList.add("drag-active");
  e.dataTransfer.effectAllowed = "move";
}
function _cpRowDragEnd() {
  this.classList.remove("drag-active");
  _cpDragEl = null;
  _cpClearAllDragHints();
}
function _cpRowDragOver(e) {
  if (!_cpDragEl || _cpDragEl === this) return;
  e.preventDefault();
  const rect = this.getBoundingClientRect();
  const pct = (e.clientY - rect.top) / rect.height;
  this.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
  if (pct > 0.3 && pct < 0.7) {
    this.classList.add("drag-ss-target");
  } else {
    this.classList.add(pct <= 0.3 ? "drag-insert-above" : "drag-insert-below");
  }
}
function _cpRowDragLeave() {
  this.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
}
function _cpRowDrop(e) {
  e.preventDefault();
  _cpClearAllDragHints();
  if (!_cpDragEl || _cpDragEl === this) return;
  const rect = this.getBoundingClientRect();
  const pct = (e.clientY - rect.top) / rect.height;
  const container = document.getElementById("cp-manual-exercise-rows");
  if (pct > 0.3 && pct < 0.7) {
    _cpGroupSupersetRows(_cpDragEl, this);
  } else {
    if (pct <= 0.3) container.insertBefore(_cpDragEl, this);
    else container.insertBefore(_cpDragEl, this.nextSibling);
    // Dropping outside the middle ejects the drag row from any group it
    // was in — treat reordering into a new position as "leave superset".
    if (_cpDragEl.dataset.supersetGroup) {
      // Only clear if the neighbours are no longer in that group
      const group = _cpDragEl.dataset.supersetGroup;
      const above = _cpDragEl.previousElementSibling;
      const below = _cpDragEl.nextElementSibling;
      const stillInGroup =
        (above && above.dataset.supersetGroup === group) ||
        (below && below.dataset.supersetGroup === group);
      if (!stillInGroup) delete _cpDragEl.dataset.supersetGroup;
    }
    _cpRefreshSsBadges();
  }
  _cpDragEl = null;
}

function _cpClearAllDragHints() {
  document
    .querySelectorAll("#cp-manual-exercise-rows .qe-manual-row")
    .forEach(el => el.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target"));
}

// Group two rows into a superset by assigning a shared supersetGroup
// letter. Picks an existing group from either row, or the next unused
// letter if neither belongs to one.
function _cpGroupSupersetRows(dragEl, targetEl) {
  const container = document.getElementById("cp-manual-exercise-rows");
  // Move dragged row directly after target
  container.insertBefore(dragEl, targetEl.nextSibling);

  let group = targetEl.dataset.supersetGroup || dragEl.dataset.supersetGroup || "";
  if (!group) {
    // Pick the next unused letter among existing rows
    const used = new Set(
      Array.from(container.querySelectorAll(".qe-manual-row"))
        .map(r => r.dataset.supersetGroup)
        .filter(Boolean)
    );
    for (const letter of ["A", "B", "C", "D", "E", "F"]) {
      if (!used.has(letter)) { group = letter; break; }
    }
    if (!group) group = "A";
  }
  targetEl.dataset.supersetGroup = group;
  dragEl.dataset.supersetGroup = group;
  _cpRefreshSsBadges();
}

// Rebuild the A1/A2/B1 badges on every row. A row's badge is removed if
// it's no longer adjacent to another member of its group.
function _cpRefreshSsBadges() {
  const container = document.getElementById("cp-manual-exercise-rows");
  if (!container) return;
  const rows = Array.from(container.querySelectorAll(".qe-manual-row"));

  // First pass: clear groups where a row is isolated from its neighbours.
  rows.forEach((row, i) => {
    const g = row.dataset.supersetGroup;
    if (!g) return;
    const above = rows[i - 1];
    const below = rows[i + 1];
    const neighbourHasGroup =
      (above && above.dataset.supersetGroup === g) ||
      (below && below.dataset.supersetGroup === g);
    if (!neighbourHasGroup) delete row.dataset.supersetGroup;
  });

  // Second pass: render badges with A1/A2/B1 indices per group letter
  const counts = {};
  rows.forEach(row => {
    const g = row.dataset.supersetGroup;
    // Remove any stale badge
    const old = row.querySelector(".cp-ss-badge");
    if (old) old.remove();
    if (!g) return;
    counts[g] = (counts[g] || 0) + 1;
    const badge = document.createElement("span");
    badge.className = "cp-ss-badge";
    badge.textContent = `${g}${counts[g]}`;
    badge.title = "Click to ungroup";
    badge.addEventListener("click", () => {
      delete row.dataset.supersetGroup;
      _cpRefreshSsBadges();
    });
    row.appendChild(badge);
  });
}

function cpManualRemoveRow(id) {
  const row = document.getElementById(`cp-mrow-${id}`);
  if (row) row.remove();
}

function cpTogglePyramid(id) {
  const detail = document.getElementById(`cp-pyr-${id}`);
  const row = document.getElementById(`cp-mrow-${id}`);
  const btn = row?.querySelector(".ex-pyramid-btn");
  if (!detail) return;
  const isOpen = detail.style.display !== "none";
  if (isOpen) {
    detail.style.display = "none";
    if (btn) { btn.textContent = "▾"; btn.classList.remove("is-active"); }
    return;
  }
  const setsVal = parseInt(document.getElementById(`cp-msets-${id}`)?.value) || 3;
  const defaultReps = document.getElementById(`cp-mreps-${id}`)?.value || "";
  const defaultWeight = document.getElementById(`cp-mwt-${id}`)?.value || "";
  const existing = detail.querySelectorAll(".ex-pyr-row");
  if (existing.length === setsVal) {
    detail.style.display = "";
    if (btn) { btn.textContent = "▴"; btn.classList.add("is-active"); }
    return;
  }
  let html = '<div class="ex-pyr-header"><span>Set</span><span>Reps</span><span>Weight</span></div>';
  for (let i = 0; i < setsVal; i++) {
    html += `<div class="ex-pyr-row">
      <span class="ex-pyr-label">${i + 1}</span>
      <input type="text" class="ex-pyr-reps" placeholder="${defaultReps || '10'}" value="${defaultReps}" />
      <input type="text" class="ex-pyr-weight" placeholder="${defaultWeight || 'lbs'}" value="${defaultWeight}" />
    </div>`;
  }
  detail.innerHTML = html;
  detail.style.display = "";
  if (btn) { btn.textContent = "▴"; btn.classList.add("is-active"); }
}

function cpPyramidSetsChanged(id) {
  const detail = document.getElementById(`cp-pyr-${id}`);
  if (!detail || detail.style.display === "none") return;
  detail.innerHTML = "";
  cpTogglePyramid(id);
}

// ── Cardio interval rows for running/cycling/swimming ─────────────────────────

let _cpManualCardioRowCount = 0;

function cpManualAddCardioRow(prefill) {
  _cpManualCardioRowCount++;
  const id = _cpManualCardioRowCount;
  const unit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";
  const pName = prefill?.name || "";
  const pDetails = prefill?.details || "";
  const pEffort = prefill?.effort || "Z2";
  let pMode = "time", pDist = "", pMin = "";
  const dur = prefill?.duration || "";
  if (dur) {
    const distMatch = String(dur).match(/^\s*([\d.]+)\s*(mi|km|m)\b/i);
    const minMatch = String(dur).match(/^\s*([\d.]+)\s*min\b/i);
    if (distMatch) { pMode = "distance"; pDist = distMatch[1]; }
    else if (minMatch) { pMode = "time"; pMin = minMatch[1]; }
  }
  const _esel = v => pEffort === v ? " selected" : "";

  const div = document.createElement("div");
  div.className = "edit-interval-card";
  div.id = `cp-crow-${id}`;
  div.dataset.durMode = pMode;
  div.draggable = true;
  div.innerHTML = `
    <div class="eiv-header">
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <input type="text" class="eiv-phase-input" id="cp-cphase-${id}" placeholder="e.g. Warm-up" value="${_cpEsc(pName)}" />
      <button class="remove-exercise-btn" onclick="cpManualRemoveCardioRow(${id})">${_CP_TRASH_SVG}</button>
    </div>
    <div class="eiv-fields">
      <div class="eiv-field">
        <div class="qe-dur-toggle">
          <button type="button" class="qe-dur-mode-btn${pMode === "distance" ? " active" : ""}" data-mode="distance"
            onclick="setCPIntervalMode(${id},'distance')">Dist</button>
          <button type="button" class="qe-dur-mode-btn${pMode === "time" ? " active" : ""}" data-mode="time"
            onclick="setCPIntervalMode(${id},'time')">Time</button>
        </div>
        <div id="cp-dist-wrap-${id}" style="display:${pMode === "distance" ? "" : "none"}">
          <input type="number" id="cp-cdist-${id}" placeholder="e.g. 5" min="0" step="0.1" style="width:60px" value="${_cpEsc(pDist)}" />
          <span class="qe-unit-label">${unit}</span>
        </div>
        <div id="cp-time-wrap-${id}" style="display:${pMode === "time" ? "" : "none"}">
          <input type="number" id="cp-cmin-${id}" placeholder="10" min="0" style="width:60px" value="${_cpEsc(pMin)}" />
          <span class="qe-unit-label">min</span>
        </div>
      </div>
      <div class="eiv-field">
        <select id="cp-ceffort-${id}">
          <option value="RW"${_esel("RW")}>Rest / Walk</option>
          <option value="Z1"${_esel("Z1")}>Z1 Recovery</option>
          <option value="Z2"${_esel("Z2")}>Z2 Aerobic</option>
          <option value="Z3"${_esel("Z3")}>Z3 Tempo</option>
          <option value="Z4"${_esel("Z4")}>Z4 Threshold</option>
          <option value="Z5"${_esel("Z5")}>Z5 VO2 Max</option>
          <option value="Z6"${_esel("Z6")}>Z6 Sprint</option>
        </select>
      </div>
    </div>
    <div class="eiv-details">
      <input type="text" id="cp-cdetails-${id}" placeholder="e.g. 5:30/km, keep HR under 145" value="${_cpEsc(pDetails)}" />
    </div>`;

  // Drag-to-reorder + drop-in-middle to group as repeat block
  const container = document.getElementById("cp-manual-cardio-rows");
  div.addEventListener("dragstart", e => { _cpCardioDragEl = div; div.classList.add("drag-active"); e.dataTransfer.effectAllowed = "move"; });
  div.addEventListener("dragend", () => { div.classList.remove("drag-active"); _cpCardioDragEl = null; _cpClearCardioHints(); });
  div.addEventListener("dragover", e => {
    if (!_cpCardioDragEl || _cpCardioDragEl === div) return;
    e.preventDefault();
    div.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
    const pct = (e.clientY - div.getBoundingClientRect().top) / div.getBoundingClientRect().height;
    if (pct > 0.3 && pct < 0.7) div.classList.add("drag-ss-target");
    else div.classList.add(pct <= 0.3 ? "drag-insert-above" : "drag-insert-below");
  });
  div.addEventListener("dragleave", () => div.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target"));
  div.addEventListener("drop", e => {
    e.preventDefault();
    _cpClearCardioHints();
    if (!_cpCardioDragEl || _cpCardioDragEl === div) return;
    const pct = (e.clientY - div.getBoundingClientRect().top) / div.getBoundingClientRect().height;
    if (pct > 0.3 && pct < 0.7) {
      _cpCardioGroupRepeat(_cpCardioDragEl, div);
    } else {
      if (pct <= 0.3) container.insertBefore(_cpCardioDragEl, div);
      else container.insertBefore(_cpCardioDragEl, div.nextSibling);
      _cpCardioEjectIfIsolated(_cpCardioDragEl);
      _cpCardioRefreshBadges();
    }
    _cpCardioDragEl = null;
  });
  if (typeof TouchDrag !== "undefined") {
    TouchDrag.attach(div, container, {
      hintClasses: ["drag-insert-above", "drag-insert-below", "drag-ss-target"],
      rowSelector: ".edit-interval-card",
      handleSelector: ".drag-handle",
      onDrop(dragEl, targetEl, clientY) {
        _cpClearCardioHints();
        const pct = (clientY - targetEl.getBoundingClientRect().top) / targetEl.getBoundingClientRect().height;
        if (pct > 0.3 && pct < 0.7) {
          _cpCardioGroupRepeat(dragEl, targetEl);
        } else {
          if (pct <= 0.3) container.insertBefore(dragEl, targetEl);
          else container.insertBefore(dragEl, targetEl.nextSibling);
          _cpCardioEjectIfIsolated(dragEl);
          _cpCardioRefreshBadges();
        }
      },
    });
  }
  container.appendChild(div);
  _cpCardioRefreshBadges();
}

let _cpCardioDragEl = null;
function _cpClearCardioHints() {
  document.querySelectorAll("#cp-manual-cardio-rows .edit-interval-card").forEach(el =>
    el.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target", "drag-active"));
}

function _cpCardioGroupRepeat(dragEl, targetEl) {
  const container = document.getElementById("cp-manual-cardio-rows");
  container.insertBefore(dragEl, targetEl.nextSibling);
  let group = targetEl.dataset.repeatGroup || dragEl.dataset.repeatGroup || "";
  if (!group) {
    const used = new Set(Array.from(container.querySelectorAll(".edit-interval-card"))
      .map(r => r.dataset.repeatGroup).filter(Boolean));
    for (const letter of ["A","B","C","D","E","F"]) { if (!used.has(letter)) { group = letter; break; } }
    if (!group) group = "A";
  }
  targetEl.dataset.repeatGroup = group;
  dragEl.dataset.repeatGroup = group;
  _cpCardioRefreshBadges();
}

function _cpCardioEjectIfIsolated(el) {
  const g = el.dataset.repeatGroup;
  if (!g) return;
  const above = el.previousElementSibling;
  const below = el.nextElementSibling;
  if (!(above && above.dataset.repeatGroup === g) && !(below && below.dataset.repeatGroup === g))
    delete el.dataset.repeatGroup;
}

function _cpCardioRefreshBadges() {
  const container = document.getElementById("cp-manual-cardio-rows");
  if (!container) return;
  const rows = Array.from(container.querySelectorAll(".edit-interval-card"));
  rows.forEach((row, i) => {
    const g = row.dataset.repeatGroup;
    if (!g) return;
    const above = rows[i - 1], below = rows[i + 1];
    if (!(above && above.dataset.repeatGroup === g) && !(below && below.dataset.repeatGroup === g))
      delete row.dataset.repeatGroup;
  });
  const counts = {};
  rows.forEach(row => {
    const old = row.querySelector(".cp-ss-badge");
    if (old) old.remove();
    const g = row.dataset.repeatGroup;
    if (!g) return;
    counts[g] = (counts[g] || 0) + 1;
    const badge = document.createElement("span");
    badge.className = "cp-ss-badge";
    badge.textContent = `${g}${counts[g]}`;
    badge.title = "Click to ungroup";
    badge.addEventListener("click", () => { delete row.dataset.repeatGroup; _cpCardioRefreshBadges(); });
    row.querySelector(".eiv-header").appendChild(badge);
  });
}

function cpManualRemoveCardioRow(id) {
  const el = document.getElementById(`cp-crow-${id}`);
  if (el) el.remove();
}

function setCPIntervalMode(id, mode) {
  const row = document.getElementById(`cp-crow-${id}`);
  if (!row) return;
  row.dataset.durMode = mode;
  document.getElementById(`cp-dist-wrap-${id}`).style.display = mode === "distance" ? "" : "none";
  document.getElementById(`cp-time-wrap-${id}`).style.display = mode === "time" ? "" : "none";
  row.querySelectorAll(".qe-dur-mode-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.mode === mode));
}

function _cpCardioRowDuration(id) {
  const row = document.getElementById(`cp-crow-${id}`);
  const mode = row?.dataset.durMode || "time";
  if (mode === "distance") {
    const val = document.getElementById(`cp-cdist-${id}`)?.value || "";
    const unit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";
    return val ? `${val} ${unit}` : "";
  }
  const val = document.getElementById(`cp-cmin-${id}`)?.value || "";
  return val ? `${val} min` : "";
}

function closeCustomPlanManualModal() {
  const modal = document.getElementById("cp-manual-modal");
  if (modal) modal.classList.remove("is-open");
}

function customPlanSaveManual() {
  const modal = document.getElementById("cp-manual-modal");
  const dow = parseInt(modal?.dataset.dow);
  if (isNaN(dow)) return;

  const name = document.getElementById("cp-manual-name")?.value.trim() || "Custom Session";
  const type = _cpManualSelectedType || "general";
  const notes = document.getElementById("cp-manual-notes")?.value.trim() || "";

  const isCardio = ["running", "cycling", "swimming"].includes(type);
  const now = new Date().toISOString();

  let session;
  if (isCardio) {
    // Collect intervals from cardio rows
    const intervals = [];
    document.querySelectorAll("#cp-manual-cardio-rows .edit-interval-card").forEach(row => {
      const id = row.id.replace("cp-crow-", "");
      const duration = _cpCardioRowDuration(id);
      if (!duration) return;
      const iv = {
        name: document.getElementById(`cp-cphase-${id}`)?.value.trim() || `Interval ${intervals.length + 1}`,
        duration,
        effort: document.getElementById(`cp-ceffort-${id}`)?.value || "Z2",
        details: document.getElementById(`cp-cdetails-${id}`)?.value.trim() || "",
      };
      if (row.dataset.repeatGroup) iv.repeatGroup = row.dataset.repeatGroup;
      intervals.push(iv);
    });
    session = {
      mode: "manual",
      data: {
        type,
        sessionName: name,
        details: notes || undefined,
        intervals: intervals.length ? intervals : undefined,
      }
    };
  } else {
    // Collect exercises from rows
    const isHiit = type === "hiit";
    const exercises = [];
    document.querySelectorAll("#cp-manual-exercise-rows .qe-manual-row").forEach(row => {
      const id = row.id.replace("cp-mrow-", "");
      const exName = document.getElementById(`cp-mex-${id}`)?.value.trim();
      if (!exName) return;
      const ex = {
        name: exName,
        reps: document.getElementById(`cp-mreps-${id}`)?.value.trim() || "",
        weight: document.getElementById(`cp-mwt-${id}`)?.value.trim() || "",
      };
      if (!isHiit) ex.sets = document.getElementById(`cp-msets-${id}`)?.value.trim() || "";

      // Superset group from drag-to-group dataset
      ex.supersetGroup = row.dataset.supersetGroup || null;

      // Collect per-set pyramid details if expanded
      const pyrDetail = document.getElementById(`cp-pyr-${id}`);
      if (pyrDetail && pyrDetail.style.display !== "none") {
        const pyrRows = pyrDetail.querySelectorAll(".ex-pyr-row");
        if (pyrRows.length > 0) {
          const setDetails = [];
          let hasDiff = false;
          pyrRows.forEach(pr => {
            const r = pr.querySelector(".ex-pyr-reps")?.value.trim() || ex.reps;
            const w = pr.querySelector(".ex-pyr-weight")?.value.trim() || ex.weight;
            setDetails.push({ reps: r, weight: w });
            if (r !== ex.reps || w !== ex.weight) hasDiff = true;
          });
          if (hasDiff) ex.setDetails = setDetails;
        }
      }
      exercises.push(ex);
    });
    session = {
      mode: "manual",
      data: {
        type,
        sessionName: name,
        details: notes || undefined,
        exercises: exercises.length ? exercises : undefined,
      }
    };
  }

  // Edit vs. add
  if (_cpManualEditIdx != null) {
    const arr = _cpEnsureArray(dow);
    const existing = arr[_cpManualEditIdx];
    session.id = existing?.id || _cpGenId();
    session.data.createdAt = existing?.data?.createdAt || now;
    session.data.updatedAt = now;
    _cpReplaceSession(dow, _cpManualEditIdx, session);
  } else {
    session.id = _cpGenId();
    session.data.createdAt = now;
    session.data.updatedAt = now;
    _cpAddSession(dow, session);
  }
  _cpManualEditIdx = null;

  closeCustomPlanManualModal();
  _cpRerenderDay(dow);
}

// ── Rest Day ──────────────────────────────────────────────────────────────────

function customPlanSetRest(dow) {
  // Setting rest replaces the entire day with a single rest entry.
  cpWeekTemplate[dow] = [{ id: _cpGenId(), mode: "rest", data: {} }];
  _cpRerenderDay(dow);
}

// ── Copy Week ─────────────────────────────────────────────────────────────────

function customPlanCopyWeek() {
  _cpMigrateTemplate();
  let total = 0;
  for (const dow of Object.keys(cpWeekTemplate)) {
    total += (cpWeekTemplate[dow] || []).filter(e => e.mode !== "rest").length;
  }
  if (total === 0) {
    const msg = document.getElementById("custom-plan-msg");
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "No sessions to copy. Add sessions to your week first."; }
    return;
  }
  // Template is already stored in cpWeekTemplate — copying means reusing it across weeks.
  // saveCustomPlan() handles multi-week expansion by iterating the full array per day.
  const msg = document.getElementById("custom-plan-msg");
  if (msg) { msg.style.color = "var(--color-success)"; msg.textContent = `Week template saved (${total} session${total !== 1 ? "s" : ""}). It will repeat for the selected duration.`; }
  setTimeout(() => { if (msg) msg.textContent = ""; }, 3000);
}

// ── Save & Schedule ───────────────────────────────────────────────────────────

function saveCustomPlan() {
  _cpMigrateTemplate();
  // Count non-rest sessions across all days
  let nonRestCount = 0;
  for (const dowStr of Object.keys(cpWeekTemplate)) {
    const arr = cpWeekTemplate[dowStr] || [];
    nonRestCount += arr.filter(e => e.mode !== "rest").length;
  }
  if (nonRestCount === 0) {
    const msg = document.getElementById("custom-plan-msg");
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Add at least one session to your plan."; }
    return;
  }

  const startDate = document.getElementById("custom-plan-start")?.value;
  if (!startDate) {
    const msg = document.getElementById("custom-plan-msg");
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please select a start date."; }
    return;
  }

  const weeks = parseInt(document.getElementById("custom-plan-weeks")?.value || "4");
  const start = new Date(startDate + "T00:00:00");

  // Load existing schedule
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}

  // Expand the week template across the requested number of weeks
  const newEntries = [];
  for (let w = 0; w < weeks; w++) {
    for (const dowStr of Object.keys(cpWeekTemplate)) {
      const sessions = cpWeekTemplate[dowStr] || [];
      for (let si = 0; si < sessions.length; si++) {
        const entry = sessions[si];
        if (!entry || entry.mode === "rest") continue;

        const dow = parseInt(dowStr);
        const startDow = start.getDay(); // 0=Sun
        let dayOffset = (dow - startDow + 7) % 7 + w * 7;
        const date = new Date(start);
        date.setDate(date.getDate() + dayOffset);
        const dateStr = date.toISOString().slice(0, 10);

        const scheduleEntry = {
          id: `custom-${dateStr}-${entry.data?.type || "general"}-${si}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: dateStr,
          type: entry.data?.type || "general",
          sessionName: entry.data?.sessionName || entry.data?.title || "Session",
          source: "custom",
          level: "intermediate",
        };

        // Carry over exercises or intervals. For exercises, copy supersetGroup
        // to supersetId so buildExerciseTableHTML's existing superset rendering
        // picks up the grouping from custom plans.
        if (entry.data?.exercises) {
          scheduleEntry.exercises = entry.data.exercises.map(_cpExerciseToScheduleShape);
        }
        if (entry.data?.aiSession) scheduleEntry.aiSession = entry.data.aiSession;
        if (entry.data?.intervals) scheduleEntry.aiSession = { title: entry.data.sessionName || capitalize(entry.data.type) + " Session", intervals: entry.data.intervals };
        if (entry.data?.details) scheduleEntry.details = entry.data.details;

        // For cardio types without intervals, add discipline/load for rich rendering
        const _discMap = { running: "run", cycling: "bike", swimming: "swim" };
        if (_discMap[scheduleEntry.type] && !scheduleEntry.aiSession) {
          scheduleEntry.discipline = _discMap[scheduleEntry.type];
          const nm = (scheduleEntry.sessionName + " " + (scheduleEntry.details || "")).toLowerCase();
          if (/interval|speed|vo2|fartlek|repeat/.test(nm)) scheduleEntry.load = "hard";
          else if (/tempo|threshold|sweetspot|race.?pace/.test(nm)) scheduleEntry.load = "moderate";
          else if (/long|endurance|distance/.test(nm)) scheduleEntry.load = "long";
          else scheduleEntry.load = "easy";
        }

        newEntries.push(scheduleEntry);
      }
    }
  }

  // Remove old custom-plan entries in the date range to avoid duplicates
  const minDate = newEntries.length ? newEntries[0].date : startDate;
  const maxDate = newEntries.length ? newEntries[newEntries.length - 1].date : startDate;
  schedule = schedule.filter(e => !(e.source === "custom" && e.date >= minDate && e.date <= maxDate));
  schedule.push(...newEntries);

  localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();

  const msg = document.getElementById("custom-plan-msg");
  if (msg) {
    msg.style.color = "var(--color-success)";
    msg.textContent = `Plan saved! ${newEntries.length} sessions scheduled across ${weeks} week${weeks > 1 ? "s" : ""}.`;
    setTimeout(() => { msg.textContent = ""; }, 4000);
  }

  // Refresh calendar
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof selectDay === "function") selectDay(getTodayString());
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
  if (typeof renderTrainingConflicts === "function") renderTrainingConflicts();
}

// ── Util ──────────────────────────────────────────────────────────────────────

function _cpEsc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Build a schedule-ready exercise object from a template exercise.
// Copies supersetGroup → supersetId so buildExerciseTableHTML's existing
// rendering path picks up the grouping. Kept as a named helper so unit
// tests can exercise the mapping directly.
function _cpExerciseToScheduleShape(ex) {
  const out = { ...ex };
  if (ex && ex.supersetGroup && !out.supersetId) out.supersetId = ex.supersetGroup;
  return out;
}

// ── Module export (for Node test harness) ─────────────────────────────────────
// In the browser these are plain global functions. For the Node-based test
// runner (see tests/custom-plan.test.js) we also expose them as a CommonJS
// module so tests can require() and exercise the pure data-layer helpers.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    _cpGenId,
    _cpEnsureArray,
    _cpMigrateTemplate,
    _cpAddSession,
    _cpReplaceSession,
    _cpRemoveSession,
    _cpExerciseToScheduleShape,
    _cpResetTemplate: () => { for (const k of Object.keys(cpWeekTemplate)) delete cpWeekTemplate[k]; },
    _cpGetTemplate: () => cpWeekTemplate,
    _cpSetTemplate: (t) => {
      for (const k of Object.keys(cpWeekTemplate)) delete cpWeekTemplate[k];
      Object.assign(cpWeekTemplate, t);
    },
  };
}
