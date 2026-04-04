// custom-plan.js — Create Your Own Plan
// Weekly template builder with AI, saved workout, manual, and rest day options per day.

const CP_DAYS = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
];

// Stores what the user has assigned to each day of the week template
// Key = dow (0-6), value = { mode: "ai"|"saved"|"manual"|"rest", data: {...} }
let cpWeekTemplate = {};

function initCustomPlan() {
  // Only reset template if it's empty (preserve in-progress edits across tab switches)
  if (Object.keys(cpWeekTemplate).length === 0) {
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
    const entry = cpWeekTemplate[d.dow];
    const contentHtml = entry ? renderDayContent(d.dow, entry) : '<p class="empty-msg">No session planned</p>';

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
          ${contentHtml}
        </div>
      </div>
    `;
  }).join("");
}

function renderDayContent(dow, entry) {
  if (!entry) return '<p class="empty-msg">No session planned</p>';

  if (entry.mode === "rest") {
    return `
      <div class="cp-day-entry cp-day-rest">
        <span>Rest Day</span>
        <button class="cp-remove-btn" onclick="customPlanClearDay(${dow})" title="Remove">&times;</button>
      </div>`;
  }

  if (entry.mode === "ai") {
    const title = entry.data?.title || entry.data?.sessionName || "AI-Generated Session";
    const type = entry.data?.type || "general";
    return `
      <div class="cp-day-entry">
        <div class="cp-day-entry-info">
          <span class="cp-day-entry-type">${type}</span>
          <span class="cp-day-entry-title">${_cpEsc(title)}</span>
        </div>
        <button class="cp-remove-btn" onclick="customPlanClearDay(${dow})" title="Remove">&times;</button>
      </div>`;
  }

  if (entry.mode === "saved") {
    const name = entry.data?.name || "Saved Workout";
    const type = entry.data?.type || "general";
    return `
      <div class="cp-day-entry">
        <div class="cp-day-entry-info">
          <span class="cp-day-entry-type">${type}</span>
          <span class="cp-day-entry-title">${_cpEsc(name)}</span>
        </div>
        <button class="cp-remove-btn" onclick="customPlanClearDay(${dow})" title="Remove">&times;</button>
      </div>`;
  }

  if (entry.mode === "manual") {
    const name = entry.data?.sessionName || "Custom Session";
    const type = entry.data?.type || "general";
    const exCount = entry.data?.exercises?.length || 0;
    const exSummary = exCount ? `<span class="cp-day-entry-detail">${exCount} exercise${exCount !== 1 ? "s" : ""}</span>` : "";
    return `
      <div class="cp-day-entry">
        <div class="cp-day-entry-info">
          <span class="cp-day-entry-type">${type}</span>
          <span class="cp-day-entry-title">${_cpEsc(name)}</span>
          ${exSummary}
        </div>
        <button class="cp-remove-btn" onclick="customPlanClearDay(${dow})" title="Remove">&times;</button>
      </div>`;
  }

  return '<p class="empty-msg">No session planned</p>';
}

function customPlanClearDay(dow) {
  delete cpWeekTemplate[dow];
  const contentEl = document.getElementById(`custom-day-${dow}-content`);
  if (contentEl) contentEl.innerHTML = '<p class="empty-msg">No session planned</p>';
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

  const apiKey = (typeof APP_CONFIG !== "undefined") ? APP_CONFIG.anthropicApiKey : "";
  if (!apiKey || apiKey === "YOUR_ANTHROPIC_API_KEY") {
    const msg = document.getElementById("cp-ask-ironz-msg");
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "API key not set. Open config.js and paste your Anthropic API key."; }
    return;
  }

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
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const workout = JSON.parse(cleaned);

    const workoutType = workout.type || "strength";
    cpWeekTemplate[dow] = {
      mode: "ai",
      data: {
        type: workoutType,
        title: workout.title || "IronZ Session",
        sessionName: workout.title || "IronZ Session",
        exercises: workout.exercises || null,
        aiSession: workout.intervals ? { title: workout.title, intervals: workout.intervals } : null,
      }
    };
    if (contentEl) contentEl.innerHTML = renderDayContent(dow, cpWeekTemplate[dow]);
  } catch (err) {
    if (contentEl) contentEl.innerHTML = `<p class="empty-msg" style="color:var(--color-danger)">Error: ${err.message}</p>`;
  }

  // Clear the input for next time
  if (input) input.value = "";
}

async function customPlanGenerateAI(dow, workoutType, extraContext) {
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
  const prompt = `Generate a single ${workoutType} session. ${extraCtx}${profileCtx}${levelCtx}${avoidCtx}

Return ONLY valid JSON, no markdown:
${isCardio
  ? `{"type":"${workoutType}","title":"Session Name","intervals":[{"name":"Phase","duration":"10 min","effort":"Easy","details":"Description"}]}`
  : `{"type":"${workoutType}","title":"Session Name","exercises":[{"name":"Exercise","sets":3,"reps":10,"rest":"60s","weight":"Bodyweight"}]}`
}
Include 5-8 exercises or 3-5 intervals.`;

  try {
    const apiKey = (typeof APP_CONFIG !== "undefined") ? APP_CONFIG.anthropicApiKey : "";
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
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const workout = JSON.parse(cleaned);

    cpWeekTemplate[dow] = {
      mode: "ai",
      data: {
        type: workout.type || workoutType,
        title: workout.title || `${workoutType} Session`,
        sessionName: workout.title || `${workoutType} Session`,
        exercises: workout.exercises || null,
        aiSession: workout.intervals ? { title: workout.title, intervals: workout.intervals } : null,
      }
    };
  } catch (err) {
    cpWeekTemplate[dow] = {
      mode: "ai",
      data: {
        type: workoutType,
        title: `${workoutType.charAt(0).toUpperCase() + workoutType.slice(1)} Session`,
        sessionName: `${workoutType.charAt(0).toUpperCase() + workoutType.slice(1)} Session`,
      }
    };
  }

  if (contentEl) contentEl.innerHTML = renderDayContent(dow, cpWeekTemplate[dow]);
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

  cpWeekTemplate[dow] = {
    mode: "saved",
    data: {
      ...sw,
      sessionName: sw.name || "Saved Workout",
    }
  };

  const contentEl = document.getElementById(`custom-day-${dow}-content`);
  if (contentEl) contentEl.innerHTML = renderDayContent(dow, cpWeekTemplate[dow]);
}

// ── Manual Entry ──────────────────────────────────────────────────────────────

let _cpManualSelectedType = "";
let _cpManualRowCount = 0;

function customPlanAddManual(dow) {
  const modal = document.getElementById("cp-manual-modal");
  if (!modal) return;
  modal.classList.add("is-open");
  modal.dataset.dow = dow;
  _cpManualSelectedType = "";

  // Reset form
  document.getElementById("cp-manual-name").value = "";
  document.getElementById("cp-manual-notes").value = "";
  cpManualShowStep(1);
}

function cpManualShowStep(step) {
  document.getElementById("cp-manual-step-1").style.display = step === 1 ? "" : "none";
  document.getElementById("cp-manual-step-2").style.display = step === 2 ? "" : "none";
  document.getElementById("cp-manual-back").style.display = step === 2 ? "" : "none";
  document.getElementById("cp-manual-title").textContent = step === 1 ? "Add Session" : "Add Session";
  // Update step dots
  const dots = document.getElementById("cp-manual-dots");
  if (dots) dots.innerHTML = [1, 2].map(s => `<span class="qe-dot${s === step ? " active" : ""}"></span>`).join("");
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

function cpManualAddExRow() {
  _cpManualRowCount++;
  const id = _cpManualRowCount;
  const isHiit = _cpManualSelectedType === "hiit";
  const div = document.createElement("div");
  div.className = "qe-manual-row" + (isHiit ? " hiit-row" : "");
  div.id = `cp-mrow-${id}`;
  if (isHiit) {
    div.innerHTML = `
      <div><label>Exercise</label>
        <input type="text" id="cp-mex-${id}" placeholder="e.g. Burpees, Row 500m" /></div>
      <div><label>Reps / Time / Distance</label>
        <input type="text" id="cp-mreps-${id}" placeholder="e.g. 10, 45s, 500m" /></div>
      <div><label>Weight</label>
        <input type="text" id="cp-mwt-${id}" placeholder="optional" /></div>
      <button class="remove-exercise-btn" onclick="cpManualRemoveRow(${id})">&#10005;</button>`;
  } else {
    div.innerHTML = `
      <div><label>Exercise</label>
        <input type="text"   id="cp-mex-${id}"   placeholder="e.g. Bench Press" /></div>
      <div><label>Sets</label>
        <input type="number" id="cp-msets-${id}" placeholder="3" min="1" max="20" /></div>
      <div><label>Reps</label>
        <input type="text"   id="cp-mreps-${id}" placeholder="10" /></div>
      <div><label>Weight</label>
        <input type="text"   id="cp-mwt-${id}"   placeholder="lbs/kg" /></div>
      <button class="remove-exercise-btn" onclick="cpManualRemoveRow(${id})">&#10005;</button>`;
  }
  document.getElementById("cp-manual-exercise-rows").appendChild(div);
}

function cpManualRemoveRow(id) {
  const row = document.getElementById(`cp-mrow-${id}`);
  if (row) row.remove();
}

// ── Cardio interval rows for running/cycling/swimming ─────────────────────────

let _cpManualCardioRowCount = 0;

function cpManualAddCardioRow() {
  _cpManualCardioRowCount++;
  const id = _cpManualCardioRowCount;
  const unit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";
  const div = document.createElement("div");
  div.className = "qe-manual-row qe-cardio-row";
  div.id = `cp-crow-${id}`;
  div.dataset.durMode = "time";
  div.innerHTML = `
    <div><label>Phase</label>
      <input type="text" id="cp-cphase-${id}" placeholder="e.g. Warm-up" /></div>
    <div class="qe-dur-col">
      <div class="qe-dur-toggle">
        <button type="button" class="qe-dur-mode-btn" data-mode="distance"
          onclick="setCPIntervalMode(${id},'distance')">Distance</button>
        <button type="button" class="qe-dur-mode-btn active" data-mode="time"
          onclick="setCPIntervalMode(${id},'time')">Time</button>
      </div>
      <div id="cp-dist-wrap-${id}" style="display:none">
        <input type="number" id="cp-cdist-${id}" placeholder="e.g. 5" min="0" step="0.1" style="width:70px" />
        <span class="qe-unit-label">${unit}</span>
      </div>
      <div id="cp-time-wrap-${id}">
        <input type="number" id="cp-cmin-${id}" placeholder="e.g. 10" min="0" style="width:70px" />
        <span class="qe-unit-label">min</span>
      </div>
    </div>
    <div><label>Zone</label>
      <select id="cp-ceffort-${id}">
        <option value="RW">Rest / Walk</option>
        <option value="Z1">Z1 Recovery</option>
        <option value="Z2" selected>Z2 Aerobic</option>
        <option value="Z3">Z3 Tempo</option>
        <option value="Z4">Z4 Threshold</option>
        <option value="Z5">Z5 VO2 Max</option>
        <option value="Z6">Z6 Max Sprint</option>
      </select></div>
    <div style="flex:2"><label>Details</label>
      <input type="text" id="cp-cdetails-${id}" placeholder="e.g. 5:30/km, keep HR under 145" /></div>
    <button class="remove-exercise-btn" onclick="cpManualRemoveCardioRow(${id})">&#10005;</button>`;
  document.getElementById("cp-manual-cardio-rows").appendChild(div);
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

  if (isCardio) {
    // Collect intervals from cardio rows
    const intervals = [];
    document.querySelectorAll("#cp-manual-cardio-rows .qe-cardio-row").forEach(row => {
      const id = row.id.replace("cp-crow-", "");
      const duration = _cpCardioRowDuration(id);
      if (!duration) return;
      intervals.push({
        name: document.getElementById(`cp-cphase-${id}`)?.value.trim() || `Interval ${intervals.length + 1}`,
        duration,
        effort: document.getElementById(`cp-ceffort-${id}`)?.value || "Z2",
        details: document.getElementById(`cp-cdetails-${id}`)?.value.trim() || "",
      });
    });
    cpWeekTemplate[dow] = {
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
      exercises.push(ex);
    });
    cpWeekTemplate[dow] = {
      mode: "manual",
      data: {
        type,
        sessionName: name,
        details: notes || undefined,
        exercises: exercises.length ? exercises : undefined,
      }
    };
  }

  closeCustomPlanManualModal();
  const contentEl = document.getElementById(`custom-day-${dow}-content`);
  if (contentEl) contentEl.innerHTML = renderDayContent(dow, cpWeekTemplate[dow]);
}

// ── Rest Day ──────────────────────────────────────────────────────────────────

function customPlanSetRest(dow) {
  cpWeekTemplate[dow] = { mode: "rest", data: {} };
  const contentEl = document.getElementById(`custom-day-${dow}-content`);
  if (contentEl) contentEl.innerHTML = renderDayContent(dow, cpWeekTemplate[dow]);
}

// ── Copy Week ─────────────────────────────────────────────────────────────────

function customPlanCopyWeek() {
  const assigned = Object.keys(cpWeekTemplate).length;
  if (assigned === 0) {
    const msg = document.getElementById("custom-plan-msg");
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "No sessions to copy. Add sessions to your week first."; }
    return;
  }
  // Template is already stored in cpWeekTemplate — copying means reusing it across weeks
  // The save function handles multi-week expansion
  const msg = document.getElementById("custom-plan-msg");
  if (msg) { msg.style.color = "var(--color-success)"; msg.textContent = "Week template saved. It will repeat for the selected duration."; }
  setTimeout(() => { if (msg) msg.textContent = ""; }, 3000);
}

// ── Save & Schedule ───────────────────────────────────────────────────────────

function saveCustomPlan() {
  const assigned = Object.entries(cpWeekTemplate).filter(([_, v]) => v.mode !== "rest");
  if (assigned.length === 0) {
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
    for (const [dowStr, entry] of Object.entries(cpWeekTemplate)) {
      if (entry.mode === "rest") continue;

      const dow = parseInt(dowStr);
      const startDow = start.getDay(); // 0=Sun
      let dayOffset = (dow - startDow + 7) % 7 + w * 7;
      const date = new Date(start);
      date.setDate(date.getDate() + dayOffset);
      const dateStr = date.toISOString().slice(0, 10);

      const scheduleEntry = {
        id: `custom-${dateStr}-${entry.data?.type || "general"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: dateStr,
        type: entry.data?.type || "general",
        sessionName: entry.data?.sessionName || entry.data?.title || "Session",
        source: "custom",
        level: "intermediate",
      };

      // Carry over exercises or intervals
      if (entry.data?.exercises) scheduleEntry.exercises = entry.data.exercises;
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

  // Remove old custom-plan entries in the date range to avoid duplicates
  const minDate = newEntries.length ? newEntries[0].date : startDate;
  const maxDate = newEntries.length ? newEntries[newEntries.length - 1].date : startDate;
  schedule = schedule.filter(e => !(e.source === "custom" && e.date >= minDate && e.date <= maxDate));
  schedule.push(...newEntries);

  localStorage.setItem("workoutSchedule", JSON.stringify(schedule));

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
