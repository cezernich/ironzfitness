// survey.js — Onboarding survey that generates a personalized training plan

const SURVEY_SPORT_OPTIONS = [
  { value: "strength",      icon: ICONS.weights, label: "Strength",      desc: "Build muscle & hit new PRs" },
  { value: "running",       icon: ICONS.run,     label: "Running",       desc: "Road races from 5K to marathon" },
  { value: "triathlon",     icon: ICONS.swim,    label: "Triathlon",     desc: "Swim · Bike · Run events" },
  { value: "cycling",       icon: ICONS.bike,    label: "Cycling",       desc: "Gran fondos, century rides & more" },
  { value: "hyrox",         icon: ICONS.activity, label: "Hyrox",        desc: "Run + functional fitness race" },
  { value: "just-training", icon: ICONS.activity, label: "Other / Mixed Training", desc: "No race goal — mix of activities" },
];

const SURVEY_RACE_OPTIONS = [
  { value: "ironman",       sport: "triathlon",     icon: ICONS.swim,    label: "Ironman Triathlon",  desc: "2.4mi swim · 112mi bike · 26.2mi run" },
  { value: "halfIronman",   sport: "triathlon",     icon: ICONS.zap,     label: "Half Ironman 70.3",  desc: "1.2mi swim · 56mi bike · 13.1mi run" },
  { value: "olympic",       sport: "triathlon",     icon: ICONS.target,  label: "Olympic Triathlon",  desc: "1.5km swim · 40km bike · 10km run" },
  { value: "sprint",        sport: "triathlon",     icon: ICONS.wind,    label: "Sprint Triathlon",   desc: "750m swim · 20km bike · 5km run" },
  { value: "marathon",      sport: "running",       icon: ICONS.run,     label: "Marathon",           desc: "26.2 miles" },
  { value: "halfMarathon",  sport: "running",       icon: ICONS.award,   label: "Half Marathon",      desc: "13.1 miles" },
  { value: "tenK",          sport: "running",       icon: ICONS.tag,     label: "10K",                desc: "6.2 miles" },
  { value: "fiveK",         sport: "running",       icon: ICONS.star,    label: "5K",                 desc: "3.1 miles" },
  { value: "life-running",  sport: "running",       icon: ICONS.activity, label: "Training for Life", desc: "No race — just stay fit and improve" },
  { value: "centuryRide",   sport: "cycling",       icon: ICONS.bike,    label: "Century Ride",       desc: "100 miles" },
  { value: "granFondo",     sport: "cycling",       icon: ICONS.trophy,  label: "Gran Fondo",         desc: "Timed mass-start road ride" },
  { value: "life-cycling",  sport: "cycling",       icon: ICONS.activity, label: "Training for Life", desc: "No race — just stay fit and ride" },
  { value: "life-swimming", sport: "swimming",      icon: ICONS.activity, label: "Training for Life", desc: "No race — just stay fit and swim" },
  { value: "hyrox",         sport: "hyrox",         icon: ICONS.activity, label: "Hyrox",              desc: "8x 1km run + 8 functional stations" },
  { value: "hyroxDoubles",  sport: "hyrox",         icon: ICONS.activity, label: "Hyrox Doubles",      desc: "Partner Hyrox event" },
  { value: "just-training", sport: "just-training", icon: ICONS.activity, label: "Other / Mixed Training", desc: "No race goal — build strength and fitness year-round" },
];

const SURVEY_STEPS = [
  "welcome",
  "sport",
  "race-type",        // skipped for just-training
  "run-goal",         // only shown for running sport
  "injury-history",   // only shown for running sport
  "activities",       // only shown for just-training
  "yoga-types",       // only shown when yoga is selected as an activity
  "strength-goal",    // only shown for strength sport
  "race-date",        // only shown for race types
  "long-day",         // only shown for race types
  "fitness-level",
  "days-per-week",
  "strength-split",   // only shown for strength sport
  "plan-length",      // only shown for strength / effectively-strength
  "activity-days",    // only shown for just-training with 2+ activities
  "gym-strength",     // only shown for race types
  "zones",            // optional: add reference times / weights for athlete zones
  "summary",
];

const SURVEY_ACTIVITY_OPTIONS = [
  { value: "running",    icon: ICONS.run,      label: "Running",        type: "running" },
  { value: "lifting",    icon: ICONS.weights,  label: "Strength",       type: "weightlifting" },
  { value: "cycling",    icon: ICONS.bike,     label: "Cycling",         type: "cycling" },
  { value: "swimming",   icon: ICONS.swim,     label: "Swimming",        type: "swimming" },
  { value: "hiit",       icon: ICONS.flame,    label: "HIIT",            type: "hiit" },
  { value: "yoga",       icon: ICONS.yoga,     label: "Yoga / Mobility", type: "yoga" },
  { value: "bodyweight", icon: ICONS.activity, label: "Bodyweight",      type: "weightlifting" },
  { value: "general",    icon: ICONS.star,     label: "General Fitness", type: "general" },
];

let surveyStep = 0;
let surveyData = {
  sport:               null,
  raceType:            null,
  raceDate:            null,
  raceName:            "",
  longDay:             null,   // preferred DOW (0=Sun…6=Sat) for long run/ride; null = default (Sat)
  level:               null,
  daysPerWeek:         null,
  preferredDays:       null,   // array of DOW indices chosen by athlete (0=Sun…6=Sat)
  activities:          [],     // selected activity values for just-training
  gymStrength:         null,   // true = add gym/strength, false = skip
  gymDays:             2,      // how many strength days per week
  runGoal:             null,   // "finish" | "time" | "compete" — running only
  returningFromInjury: null,   // true | false — running only
  strengthGoal:        null,   // "bulk" | "cut" | "maintain" | "lose"
  strengthSplit:       null,   // "ppl" | "upper-lower" | "full-body" | "custom"
  strengthSplitDays:   null,   // array of { label, muscles[] }
  yogaTypes:           [],     // selected yoga style preferences (empty = all)
  planLength:          null,   // weeks (e.g. 8, 12, 16, 26, 52) or 0 = indefinite
  zones:               {},     // { running: {dist, h, m, s}, biking: {ftp}, swimming: {m, s}, strength: {bench, squat, ...} }
};

// Non-race types skip the race-date step entirely
function isNonRaceType() {
  return surveyData.raceType === "just-training" || surveyData.sport === "just-training" || surveyData.sport === "strength";
}

function isJustTrainingSport() {
  return surveyData.sport === "just-training" || surveyData.sport === "strength";
}

// Any plan that includes lifting should follow the strength workflow steps
function isEffectivelyStrength() {
  return surveyData.sport === "strength" ||
    (surveyData.sport === "just-training" && surveyData.activities.includes("lifting"));
}

// Returns true when we're in the "mixed" flow: just-training with 2+ activities
function _isMixedFlow() {
  return surveyData.sport === "just-training" && surveyData.activities.length > 1;
}

// Custom step order for mixed / multi-activity plans:
// activities → days-per-week → activity-days → [yoga-types] → [strength-goal] → fitness-level → [strength-split] → plan-length → summary
function _getSurveyZoneSports() {
  const sports = [];
  const s = surveyData.sport;
  if (s === "running" || s === "triathlon") sports.push("running");
  if (s === "cycling" || s === "triathlon") sports.push("biking");
  if (s === "triathlon") sports.push("swimming");
  if (s === "hyrox") { sports.push("running"); sports.push("strength"); }
  if (s === "strength" || isEffectivelyStrength()) sports.push("strength");
  // Just-training: check individual activities
  if (s === "just-training") {
    if (surveyData.activities.includes("running") && !sports.includes("running")) sports.push("running");
    if (surveyData.activities.includes("cycling") && !sports.includes("biking")) sports.push("biking");
    if (surveyData.activities.includes("swimming") && !sports.includes("swimming")) sports.push("swimming");
    if ((surveyData.activities.includes("lifting") || surveyData.activities.includes("bodyweight")) && !sports.includes("strength")) sports.push("strength");
  }
  // Gym strength add-on for race types
  if (surveyData.gymStrength && !sports.includes("strength")) sports.push("strength");

  // Filter out sports that already have zones saved
  try {
    const saved = JSON.parse(localStorage.getItem("trainingZones")) || {};
    return sports.filter(sport => {
      const data = saved[sport];
      if (!data) return true; // no zones saved — show in survey
      // Check if zones actually have meaningful data
      if (sport === "running" && data.zones) return false;
      if (sport === "biking" && data.ftp) return false;
      if (sport === "swimming" && data.zones) return false;
      if (sport === "strength" && (data.bench || data.squat || data.deadlift)) return false;
      return true;
    });
  } catch { return sports; }
}

function _getMixedFlowSteps() {
  const steps = ["activities", "days-per-week", "activity-days"];
  if (surveyData.activities.includes("yoga")) steps.push("yoga-types");
  if (isEffectivelyStrength()) steps.push("strength-goal");
  steps.push("fitness-level");
  if (isEffectivelyStrength()) steps.push("strength-split");
  steps.push("plan-length");
  if (_getSurveyZoneSports().length > 0) steps.push("zones");
  steps.push("summary");
  return steps;
}

// ── Open / Close ──────────────────────────────────────────────────────────────

function openSurvey() {
  surveyStep = 0;
  surveyData = { sport: null, raceType: null, raceDate: null, raceName: "", longDay: null, level: null, daysPerWeek: null, preferredDays: null, activityDayMap: {}, activities: [], gymStrength: null, gymDays: 2, runGoal: null, returningFromInjury: null, strengthGoal: null, strengthSplit: null, strengthSplitDays: null, planLength: null, yogaTypes: [], zones: {} };
  const overlay = document.getElementById("survey-overlay");
  if (overlay) {
    overlay.classList.add("is-open");
    renderSurveyStep();
  }
}

function closeSurvey() {
  const overlay = document.getElementById("survey-overlay");
  if (overlay) overlay.classList.remove("is-open");
}

// ── Custom plan flow (inside survey modal) ──────────────────────────────────

let _customPlanMode = null; // null | "choose" | "import" | "ironz"

function surveyGoToCustomPlan() {
  _customPlanMode = "choose";
  _renderCustomPlanStep();
}

function _renderCustomPlanStep() {
  const content = document.getElementById("survey-step-content");
  const fill    = document.getElementById("survey-progress-fill");
  const backBtn = document.getElementById("survey-back-btn");
  if (!content) return;
  if (fill) fill.style.width = "0%";
  if (backBtn) backBtn.style.display = "block";

  if (_customPlanMode === "choose") {
    content.innerHTML = `
      <div class="sv-welcome" style="padding-top:40px">
        <h1 class="sv-welcome-title" style="font-size:1.6rem">Create Your Own Plan</h1>
        <p class="sv-welcome-sub">How would you like to build your plan?</p>
        <div class="sv-option-list" style="max-width:360px;margin:24px auto 0">
          <button class="sv-option-card" onclick="_customPlanPick('import')">
            <span class="sv-option-icon">${ICONS.pencil}</span>
            <div class="sv-option-text">
              <div class="sv-option-label">Import a Plan</div>
              <div class="sv-option-desc">Paste a plan from a coach, spreadsheet, or email</div>
            </div>
          </button>
          <button class="sv-option-card" onclick="_customPlanPick('ironz')">
            <span class="sv-option-icon">${ICONS.zap}</span>
            <div class="sv-option-text">
              <div class="sv-option-label">Create on IronZ</div>
              <div class="sv-option-desc">Describe what you want and IronZ will build it</div>
            </div>
          </button>
        </div>
      </div>`;
  } else if (_customPlanMode === "import") {
    content.innerHTML = `
      <div class="sv-welcome" style="padding-top:30px">
        <h1 class="sv-welcome-title" style="font-size:1.6rem">Import a Plan</h1>
        <p class="sv-welcome-sub">Paste your training plan and we'll parse it into your calendar.</p>
        <div style="max-width:420px;margin:20px auto 0;text-align:left">
          <div class="form-row">
            <label for="sv-import-text">Training Plan</label>
            <textarea id="sv-import-text" rows="6" placeholder="Paste your training plan here...&#10;&#10;Example:&#10;Week 1&#10;Mon: 4mi easy run&#10;Tue: Bench 4x8 @ 155&#10;Wed: Rest&#10;Thu: 6x800m intervals&#10;Fri: Pull day&#10;Sat: Long run 8mi&#10;Sun: Rest" style="width:100%;box-sizing:border-box;resize:vertical"></textarea>
          </div>
          <div class="form-grid">
            <div class="form-row">
              <label for="sv-import-start">Start Date</label>
              <input type="date" id="sv-import-start" />
            </div>
            <div class="form-row">
              <label for="sv-import-repeat">Repeat</label>
              <select id="sv-import-repeat">
                <option value="1">Once (no repeat)</option>
                <option value="2">2 cycles</option>
                <option value="4">4 cycles</option>
                <option value="8">8 cycles</option>
              </select>
            </div>
          </div>
          <button class="sv-cta" style="width:100%;margin-top:12px" onclick="_customPlanImport()">Import Plan</button>
          <p id="sv-import-msg" class="save-msg"></p>
        </div>
      </div>`;
    // Default start date to next Monday
    const startEl = document.getElementById("sv-import-start");
    if (startEl) {
      const d = new Date(); d.setHours(0,0,0,0);
      const dow = d.getDay();
      const toMon = dow === 1 ? 0 : (dow === 0 ? 1 : 8 - dow);
      d.setDate(d.getDate() + toMon);
      startEl.value = d.toISOString().slice(0, 10);
    }
  } else if (_customPlanMode === "ironz") {
    // Initialize week builder state
    if (!_ironzWeekPlan) {
      _ironzWeekPlan = {};
      for (let i = 0; i < 7; i++) _ironzWeekPlan[i] = null; // null = no session
    }

    const DOW_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    let daysHtml = "";
    DOW_FULL.forEach((dayName, i) => {
      const session = _ironzWeekPlan[i];
      let sessionBody = `<div class="ironz-day-empty" id="ironz-day-body-${i}">No session planned</div>`;
      if (session) {
        if (session.type === "rest") {
          sessionBody = `<div class="ironz-day-session" id="ironz-day-body-${i}"><span class="ironz-day-rest-label">Rest Day</span></div>`;
        } else {
          const typeLabel = session.sessionType ? (session.sessionType.charAt(0).toUpperCase() + session.sessionType.slice(1)) : "";
          sessionBody = `<div class="ironz-day-session" id="ironz-day-body-${i}">
            <span class="workout-tag tag-${session.sessionType || 'general'}">${typeLabel}</span>
            <span class="ironz-day-session-name">${typeof _escapeHtml === "function" ? _escapeHtml(session.name) : session.name}</span>
            ${session.exercises ? `<span class="ironz-day-ex-count">${session.exercises.length} exercises</span>` : ""}
            <button class="delete-btn" onclick="_ironzClearDay(${i})" title="Remove" style="margin-left:auto"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>`;
        }
      }
      daysHtml += `
        <div class="ironz-day-card">
          <div class="ironz-day-header">
            <strong class="ironz-day-name">${dayName}</strong>
            <div class="ironz-day-actions">
              <button class="ironz-action-btn" onclick="_ironzAiGenerate(${i})">AI Generate</button>
              <button class="ironz-action-btn" onclick="_ironzFromSaved(${i})">From Saved</button>
              <button class="ironz-action-btn" onclick="_ironzManual(${i})">Manual</button>
              <button class="ironz-action-btn" onclick="_ironzSetRest(${i})">Rest</button>
            </div>
          </div>
          ${sessionBody}
        </div>`;
    });

    content.innerHTML = `
      <div class="sv-welcome" style="padding-top:20px">
        <h1 class="sv-welcome-title" style="font-size:1.6rem">Create on IronZ</h1>
        <p class="sv-welcome-sub">Build your weekly template day by day.</p>
        <div style="max-width:540px;margin:16px auto 0;text-align:left">
          <div class="form-grid">
            <div class="form-row">
              <label for="sv-ironz-start">Start Date</label>
              <input type="date" id="sv-ironz-start" />
            </div>
            <div class="form-row">
              <label for="sv-ironz-weeks">Duration</label>
              <select id="sv-ironz-weeks">
                <option value="4" selected>4 weeks</option>
                <option value="8">8 weeks</option>
                <option value="12">12 weeks</option>
                <option value="16">16 weeks</option>
              </select>
            </div>
          </div>
          <div id="ironz-week-builder" style="margin-top:16px">
            ${daysHtml}
          </div>
          <button class="sv-cta" style="width:100%;margin-top:16px" onclick="_ironzSavePlan()">Save Plan to Calendar</button>
          <p id="sv-ironz-msg" class="save-msg"></p>
        </div>
      </div>`;
    const startEl = document.getElementById("sv-ironz-start");
    if (startEl) {
      const d = new Date(); d.setHours(0,0,0,0);
      const dow = d.getDay();
      const toMon = dow === 1 ? 0 : (dow === 0 ? 1 : 8 - dow);
      d.setDate(d.getDate() + toMon);
      startEl.value = d.toISOString().slice(0, 10);
    }
  }
}

function _customPlanPick(mode) {
  _customPlanMode = mode;
  _renderCustomPlanStep();
}

function _customPlanImport() {
  // Reuse the existing importTrainingPlan logic but with survey-specific element IDs
  const text = (document.getElementById("sv-import-text")?.value || "").trim();
  const msg = document.getElementById("sv-import-msg");
  if (!text) { if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please paste a training plan."; } return; }

  // Copy values into the main import form and trigger the existing function
  const mainText = document.getElementById("import-plan-text");
  const mainStart = document.getElementById("custom-plan-start");
  const mainRepeat = document.getElementById("import-repeat");
  if (mainText) mainText.value = text;
  if (mainStart) mainStart.value = document.getElementById("sv-import-start")?.value || "";
  if (mainRepeat) mainRepeat.value = document.getElementById("sv-import-repeat")?.value || "1";

  if (msg) { msg.style.color = "var(--color-text-muted)"; msg.textContent = "Parsing your plan..."; }

  if (typeof importTrainingPlan === "function") {
    importTrainingPlan().then(() => {
      if (msg) { msg.style.color = "var(--color-success, #22c55e)"; msg.textContent = "Plan imported! Check your calendar."; }
      setTimeout(() => closeSurvey(), 1500);
    }).catch(err => {
      if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Error: " + err.message; }
    });
  }
}

// ── IronZ Week Builder state & actions ────────────────────────────────────────

let _ironzWeekPlan = null; // { 0: null|{type,name,...}, 1: ..., 6: ... }

function _ironzSetRest(dayIdx) {
  _ironzWeekPlan[dayIdx] = { type: "rest", name: "Rest" };
  _renderCustomPlanStep();
}

function _ironzClearDay(dayIdx) {
  _ironzWeekPlan[dayIdx] = null;
  _renderCustomPlanStep();
}

function _ironzFromSaved(dayIdx) {
  const saved = typeof loadSavedWorkouts === "function" ? loadSavedWorkouts() : [];
  if (!saved.length) { alert("No saved workouts yet. Star a workout from your history to save it."); return; }

  const bodyEl = document.getElementById(`ironz-day-body-${dayIdx}`);
  if (!bodyEl) return;

  bodyEl.innerHTML = `<div class="ironz-saved-picker">
    <select id="ironz-saved-select-${dayIdx}" class="form-input" style="width:100%;margin-bottom:8px">
      ${saved.map((s, i) => `<option value="${i}">${s.name || "Unnamed"} (${s.type || "general"})</option>`).join("")}
    </select>
    <div style="display:flex;gap:6px">
      <button class="btn-primary" style="flex:1;padding:6px" onclick="_ironzPickSaved(${dayIdx})">Add</button>
      <button class="btn-secondary" style="padding:6px" onclick="_ironzClearDay(${dayIdx});_renderCustomPlanStep()">Cancel</button>
    </div>
  </div>`;
}

function _ironzPickSaved(dayIdx) {
  const saved = typeof loadSavedWorkouts === "function" ? loadSavedWorkouts() : [];
  const idx = parseInt(document.getElementById(`ironz-saved-select-${dayIdx}`)?.value) || 0;
  const sw = saved[idx];
  if (!sw) return;
  _ironzWeekPlan[dayIdx] = {
    type: "saved",
    sessionType: sw.type || "general",
    name: sw.name || "Saved Workout",
    exercises: sw.exercises || null,
    details: sw.notes || null,
  };
  _renderCustomPlanStep();
}

function _ironzManual(dayIdx) {
  const bodyEl = document.getElementById(`ironz-day-body-${dayIdx}`);
  if (!bodyEl) return;

  bodyEl.innerHTML = `<div class="ironz-manual-entry">
    <div class="form-grid" style="gap:6px;margin-bottom:6px">
      <input type="text" id="ironz-manual-name-${dayIdx}" class="form-input" placeholder="Session name (e.g. Upper Body)" style="width:100%" />
      <select id="ironz-manual-type-${dayIdx}" class="form-input">
        <option value="weightlifting">Strength</option>
        <option value="running">Running</option>
        <option value="cycling">Cycling</option>
        <option value="swimming">Swimming</option>
        <option value="hiit">HIIT</option>
        <option value="yoga">Yoga</option>
        <option value="general">General</option>
      </select>
    </div>
    <textarea id="ironz-manual-details-${dayIdx}" class="form-input" rows="2" placeholder="Details (optional)" style="width:100%;box-sizing:border-box;resize:vertical;margin-bottom:6px"></textarea>
    <div style="display:flex;gap:6px">
      <button class="btn-primary" style="flex:1;padding:6px" onclick="_ironzSaveManual(${dayIdx})">Add</button>
      <button class="btn-secondary" style="padding:6px" onclick="_renderCustomPlanStep()">Cancel</button>
    </div>
  </div>`;
}

function _ironzSaveManual(dayIdx) {
  const name = (document.getElementById(`ironz-manual-name-${dayIdx}`)?.value || "").trim();
  const type = document.getElementById(`ironz-manual-type-${dayIdx}`)?.value || "general";
  const details = (document.getElementById(`ironz-manual-details-${dayIdx}`)?.value || "").trim();
  if (!name) { alert("Please enter a session name."); return; }
  _ironzWeekPlan[dayIdx] = { type: "manual", sessionType: type, name, details: details || null };
  _renderCustomPlanStep();
}

async function _ironzAiGenerate(dayIdx) {
  const DOW_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const bodyEl = document.getElementById(`ironz-day-body-${dayIdx}`);
  if (!bodyEl) return;

  bodyEl.innerHTML = `<div class="ironz-ai-prompt">
    <input type="text" id="ironz-ai-desc-${dayIdx}" class="form-input" placeholder="e.g. upper body hypertrophy, easy 5k run, yoga flow" style="width:100%;margin-bottom:6px" />
    <div style="display:flex;gap:6px">
      <button class="btn-primary" style="flex:1;padding:6px" onclick="_ironzRunAi(${dayIdx})">Generate</button>
      <button class="btn-secondary" style="padding:6px" onclick="_renderCustomPlanStep()">Cancel</button>
    </div>
    <p id="ironz-ai-msg-${dayIdx}" class="save-msg"></p>
  </div>`;
}

async function _ironzRunAi(dayIdx) {
  const desc = (document.getElementById(`ironz-ai-desc-${dayIdx}`)?.value || "").trim();
  const msg = document.getElementById(`ironz-ai-msg-${dayIdx}`);
  if (!desc) { if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Describe the session."; } return; }

  if (msg) { msg.style.color = "var(--color-text-muted)"; msg.textContent = "Generating..."; }

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

  try {
    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: `You are a personal trainer. Generate a single workout session. ${profileCtx}${avoidCtx}

The athlete wants: "${desc}"

Return ONLY valid JSON (no markdown):
{
  "name": "Session Name",
  "type": "weightlifting|running|cycling|swimming|hiit|yoga|general",
  "exercises": [{"name":"Exercise","sets":3,"reps":"10","weight":"135 lbs"}]
}

For cardio, use: {"name":"Session Name","type":"running","details":"description of the run/ride/swim"}
Be specific with sets, reps, and weights.` }]
    });

    const rawText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const session = JSON.parse(rawText.replace(/```json|```/g, "").trim());

    _ironzWeekPlan[dayIdx] = {
      type: "ai",
      sessionType: session.type || "general",
      name: session.name || desc,
      exercises: session.exercises || null,
      details: session.details || null,
    };
    _renderCustomPlanStep();
  } catch (err) {
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Error: " + err.message; }
  }
}

function _ironzSavePlan() {
  const startDate = document.getElementById("sv-ironz-start")?.value;
  const weeks = parseInt(document.getElementById("sv-ironz-weeks")?.value) || 4;
  const msg = document.getElementById("sv-ironz-msg");

  if (!startDate) { if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please select a start date."; } return; }

  // Check if any days have sessions
  const hasSessions = Object.values(_ironzWeekPlan).some(s => s && s.type !== "rest");
  if (!hasSessions) { if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Add at least one session to your plan."; } return; }

  const planId = (typeof generateId === "function") ? generateId("plan") : "plan_" + Date.now();
  const planName = "Custom Plan";
  const start = new Date(startDate + "T00:00:00");
  const schedule = [];
  const DOW_MAP = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 ... Sun=0

  for (let week = 0; week < weeks; week++) {
    for (let d = 0; d < 7; d++) {
      const session = _ironzWeekPlan[d];
      if (!session || session.type === "rest") continue;

      const dow = DOW_MAP[d];
      const startDow = start.getDay();
      let delta = (dow - startDow + 7) % 7 + week * 7;
      const date = new Date(start);
      date.setDate(date.getDate() + delta);
      const dateStr = date.toISOString().slice(0, 10);

      schedule.push({
        id: `ws-${dateStr}-${session.sessionType}-${d}-custom`,
        date: dateStr,
        type: session.sessionType || "general",
        level: "intermediate",
        sessionName: session.name,
        exercises: session.exercises || null,
        details: session.details || null,
        source: "generated",
        planId: planId,
      });
    }
  }

  // Save to workoutSchedule
  let existing = [];
  try { existing = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}
  const merged = [...existing, ...schedule];
  localStorage.setItem("workoutSchedule", JSON.stringify(merged)); if (typeof DB !== 'undefined') DB.syncSchedule();

  // Save plan metadata
  let plans = [];
  try { plans = JSON.parse(localStorage.getItem("importedPlans")) || []; } catch {}
  plans.push({ id: planId, name: planName, startDate, weeks, createdAt: new Date().toISOString() });
  localStorage.setItem("importedPlans", JSON.stringify(plans)); if (typeof DB !== 'undefined') DB.syncKey('importedPlans');

  if (msg) { msg.style.color = "var(--color-success, #22c55e)"; msg.textContent = `${schedule.length} sessions saved to calendar!`; }
  _ironzWeekPlan = null;

  if (typeof renderCalendar === "function") renderCalendar();
  setTimeout(() => closeSurvey(), 1500);
}

// Keep the old AI full-plan generation as a separate function
async function _customPlanIronZ() {
  const prompt = (document.getElementById("sv-ironz-prompt")?.value || "").trim();
  const msg = document.getElementById("sv-ironz-msg");
  if (!prompt) { if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please describe the plan you want."; } return; }

  const startDate = document.getElementById("sv-ironz-start")?.value || "";
  const weeks = parseInt(document.getElementById("sv-ironz-weeks")?.value) || 8;

  if (msg) { msg.style.color = "var(--color-text-muted)"; msg.textContent = "Generating your plan..."; }

  let profileCtx = "";
  try {
    const p = JSON.parse(localStorage.getItem("profile") || "{}");
    if (p.age) profileCtx += `Age: ${p.age}. `;
    if (p.weight) profileCtx += `Weight: ${p.weight} lbs. `;
    if (p.goal) profileCtx += `Goal: ${p.goal}. `;
  } catch {}

  let refCtx = "";
  try {
    const allZones = JSON.parse(localStorage.getItem("trainingZones")) || {};
    const refs = allZones.strength || null;
    if (refs) {
      const liftLabels = { bench: "Bench Press", squat: "Back Squat", deadlift: "Deadlift", ohp: "Overhead Press", row: "Barbell Row" };
      const lines = Object.entries(liftLabels).filter(([k]) => refs[k]?.weight).map(([k, label]) => `${label}: ${refs[k].weight} lbs`);
      if (lines.length) refCtx = `Reference lifts: ${lines.join(", ")}. `;
    }
  } catch {}

  let avoidCtx = "";
  try {
    const prefs = JSON.parse(localStorage.getItem("trainingPreferences") || "{}");
    const avoided = prefs.avoidedExercises || [];
    if (avoided.length) avoidCtx = `NEVER include these exercises: ${avoided.join(", ")}. `;
  } catch {}

  try {
    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `You are a personal trainer. Create a ${weeks}-week training plan. ${profileCtx}${refCtx}${avoidCtx}

The athlete says: "${prompt}"

Start date: ${startDate || "next Monday"}.

Return ONLY a parseable training plan as plain text (NOT JSON). Use this format:
Week 1
Mon: [session description]
Tue: [session description]
Wed: Rest
Thu: [session description]
Fri: [session description]
Sat: [session description]
Sun: Rest

Week 2
...

Be specific with exercises, sets, reps, weights, distances, and paces. Include warm-up and cool-down notes.`
      }]
    });

    const planText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");

    // Feed it into the import system
    const mainText = document.getElementById("import-plan-text");
    const mainStart = document.getElementById("custom-plan-start");
    const mainRepeat = document.getElementById("import-repeat");
    if (mainText) mainText.value = planText;
    if (mainStart) mainStart.value = startDate;
    if (mainRepeat) mainRepeat.value = "1";

    if (msg) { msg.style.color = "var(--color-text-muted)"; msg.textContent = "Parsing into your calendar..."; }

    if (typeof importTrainingPlan === "function") {
      await importTrainingPlan();
      if (msg) { msg.style.color = "var(--color-success, #22c55e)"; msg.textContent = "Plan created! Check your calendar."; }
      setTimeout(() => closeSurvey(), 1500);
    }
  } catch (err) {
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Error: " + err.message; }
  }
}

async function svWelcomeAskIronZ() {
  const input = document.getElementById("sv-ask-ironz-field");
  const prompt = (input?.value || "").trim();
  if (!prompt) return;

  const msg = document.getElementById("sv-welcome-ironz-msg");
  if (msg) { msg.style.color = "var(--color-text-muted)"; msg.textContent = "Generating your plan..."; }
  if (input) input.disabled = true;

  // Default start to next Monday
  const d = new Date(); d.setHours(0,0,0,0);
  const dow = d.getDay();
  const toMon = dow === 1 ? 0 : (dow === 0 ? 1 : 8 - dow);
  d.setDate(d.getDate() + toMon);
  const startDate = d.toISOString().slice(0, 10);

  let profileCtx = "";
  try {
    const p = JSON.parse(localStorage.getItem("profile") || "{}");
    if (p.age) profileCtx += `Age: ${p.age}. `;
    if (p.weight) profileCtx += `Weight: ${p.weight} lbs. `;
    if (p.goal) profileCtx += `Goal: ${p.goal}. `;
  } catch {}

  let refCtx = "";
  try {
    const allZones = JSON.parse(localStorage.getItem("trainingZones")) || {};
    const refs = allZones.strength || null;
    if (refs) {
      const liftLabels = { bench: "Bench Press", squat: "Back Squat", deadlift: "Deadlift", ohp: "Overhead Press", row: "Barbell Row" };
      const lines = Object.entries(liftLabels).filter(([k]) => refs[k]?.weight).map(([k, label]) => `${label}: ${refs[k].weight} lbs`);
      if (lines.length) refCtx = `Reference lifts: ${lines.join(", ")}. `;
    }
  } catch {}

  let avoidCtx = "";
  try {
    const prefs = JSON.parse(localStorage.getItem("trainingPreferences") || "{}");
    const avoided = prefs.avoidedExercises || [];
    if (avoided.length) avoidCtx = `NEVER include these exercises: ${avoided.join(", ")}. `;
  } catch {}

  try {
    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `You are a personal trainer. Create a training plan. ${profileCtx}${refCtx}${avoidCtx}

The athlete says: "${prompt}"

Start date: ${startDate}. If the athlete didn't specify duration, default to 8 weeks.

Return ONLY a parseable training plan as plain text (NOT JSON). Use this format:
Week 1
Mon: [session description]
Tue: [session description]
Wed: Rest
Thu: [session description]
Fri: [session description]
Sat: [session description]
Sun: Rest

Week 2
...

Be specific with exercises, sets, reps, weights, distances, and paces. Include warm-up and cool-down notes.`
      }]
    });

    const planText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");

    const mainText = document.getElementById("import-plan-text");
    const mainStart = document.getElementById("custom-plan-start");
    const mainRepeat = document.getElementById("import-repeat");
    if (mainText) mainText.value = planText;
    if (mainStart) mainStart.value = startDate;
    if (mainRepeat) mainRepeat.value = "1";

    if (msg) { msg.style.color = "var(--color-text-muted)"; msg.textContent = "Parsing into your calendar..."; }

    if (typeof importTrainingPlan === "function") {
      await importTrainingPlan();
      if (msg) { msg.style.color = "var(--color-success, #22c55e)"; msg.textContent = "Plan created! Check your calendar."; }
      setTimeout(() => closeSurvey(), 1500);
    }
  } catch (err) {
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Error: " + err.message; }
  }

  if (input) input.disabled = false;
}

// ── Navigation ────────────────────────────────────────────────────────────────

function surveyNext() {
  if (!surveyValidate()) return;

  // Mixed flow uses its own step sequence
  if (_isMixedFlow()) {
    const curStep = SURVEY_STEPS[surveyStep];
    const flow = _getMixedFlowSteps();
    const idx = flow.indexOf(curStep);
    if (idx >= 0 && idx < flow.length - 1) {
      const nextStep = flow[idx + 1];
      surveyStep = SURVEY_STEPS.indexOf(nextStep);
      renderSurveyStep();
      return;
    }
    // If current step isn't in mixed flow (e.g. welcome, sport), fall through to default
  }

  let next = surveyStep + 1;
  // Just-training / strength sport: skip race-type, auto-set raceType
  if (SURVEY_STEPS[next] === "race-type" && isJustTrainingSport()) {
    surveyData.raceType = "just-training";
    next++;
  }
  // Strength sport: pre-select lifting and skip activities step
  if (SURVEY_STEPS[next] === "activities" && surveyData.sport === "strength") {
    surveyData.activities = ["lifting"];
    next++;
  }
  // Running-only steps: skip for non-running sports
  if (SURVEY_STEPS[next] === "run-goal"       && surveyData.sport !== "running") next++;
  if (SURVEY_STEPS[next] === "injury-history" && surveyData.sport !== "running") next++;
  // Skip activities step for race types or strength sport
  if (SURVEY_STEPS[next] === "activities" && surveyData.sport === "strength") { surveyData.activities = ["lifting"]; next++; }
  if (SURVEY_STEPS[next] === "activities" && !isNonRaceType()) next++;
  if (SURVEY_STEPS[next] === "yoga-types"   && !surveyData.activities.includes("yoga")) next++;
  // Strength-only steps
  if (SURVEY_STEPS[next] === "strength-goal"  && !isEffectivelyStrength()) next++;
  if (SURVEY_STEPS[next] === "race-date"     && isNonRaceType())  next++;
  if (SURVEY_STEPS[next] === "long-day"      && isNonRaceType())  next++;
  if (SURVEY_STEPS[next] === "strength-split" && !isEffectivelyStrength()) next++;
  if (SURVEY_STEPS[next] === "plan-length"   && !isEffectivelyStrength()) next++;
  if (SURVEY_STEPS[next] === "activity-days" && !(isNonRaceType() && surveyData.activities.length > 1)) next++;
  if (SURVEY_STEPS[next] === "gym-strength"  && isNonRaceType())  next++;
  if (SURVEY_STEPS[next] === "zones"        && _getSurveyZoneSports().length === 0) next++;
  if (next < SURVEY_STEPS.length) { surveyStep = next; renderSurveyStep(); }
}

function _shouldSkipStep(step) {
  if (step === "gym-strength"   && isNonRaceType())             return true;
  if (step === "activity-days"  && !(isNonRaceType() && surveyData.activities.length > 1)) return true;
  if (step === "plan-length"    && !isEffectivelyStrength())    return true;
  if (step === "strength-split" && !isEffectivelyStrength())    return true;
  if (step === "activities"     && surveyData.sport === "strength") return true;
  if (step === "activities"     && !isNonRaceType())            return true;
  if (step === "race-type"      && isJustTrainingSport())       return true;
  if (step === "long-day"       && isNonRaceType())             return true;
  if (step === "race-date"      && isNonRaceType())             return true;
  if (step === "strength-goal"  && !isEffectivelyStrength())    return true;
  if (step === "yoga-types"     && !surveyData.activities.includes("yoga")) return true;
  if (step === "injury-history" && surveyData.sport !== "running") return true;
  if (step === "zones"          && _getSurveyZoneSports().length === 0) return true;
  if (step === "run-goal"       && surveyData.sport !== "running") return true;
  return false;
}

function surveyBack() {
  // Handle custom plan flow back navigation
  if (_customPlanMode) {
    if (_customPlanMode === "import" || _customPlanMode === "ironz") {
      _customPlanMode = "choose";
      _renderCustomPlanStep();
    } else {
      // Back from "choose" → return to welcome
      _customPlanMode = null;
      surveyStep = 0;
      renderSurveyStep();
    }
    return;
  }

  // Mixed flow uses its own step sequence
  if (_isMixedFlow()) {
    const curStep = SURVEY_STEPS[surveyStep];
    const flow = _getMixedFlowSteps();
    const idx = flow.indexOf(curStep);
    if (idx > 0) {
      const prevStep = flow[idx - 1];
      surveyStep = SURVEY_STEPS.indexOf(prevStep);
      renderSurveyStep();
      return;
    }
    // If at start of mixed flow (activities), go back to sport
    if (idx === 0) {
      surveyStep = SURVEY_STEPS.indexOf("sport");
      renderSurveyStep();
      return;
    }
  }

  if (surveyStep > 0) {
    let prev = surveyStep - 1;
    while (prev > 0 && _shouldSkipStep(SURVEY_STEPS[prev])) prev--;
    surveyStep = prev;
    renderSurveyStep();
  }
}

function surveyValidate() {
  const step = SURVEY_STEPS[surveyStep];
  const msg  = document.getElementById("survey-val-msg");
  const fail = (text) => { if (msg) msg.textContent = text; return false; };
  const ok   = ()     => { if (msg) msg.textContent = "";   return true; };

  if (step === "sport"     && !surveyData.sport)    return fail("Please choose a sport.");
  if (step === "race-type" && !surveyData.raceType) return fail("Please choose an event.");
  if (step === "race-date") {
    if (!surveyData.raceDate) return fail("Please pick a race date.");
    if (new Date(surveyData.raceDate + "T00:00:00") <= new Date()) return fail("Race date must be in the future.");
  }
  if (step === "activities"   && surveyData.activities.length === 0) return fail("Please select at least one activity.");
  if (step === "strength-goal" && !surveyData.strengthGoal) return fail("Please select a goal.");
  if (step === "fitness-level" && !surveyData.level)       return fail("Please select your fitness level.");
  if (step === "days-per-week") {
    if (!surveyData.daysPerWeek) return fail("Please select your training days.");
    const picked = (surveyData.preferredDays || []).length;
    if (picked !== surveyData.daysPerWeek) return fail(`Please select exactly ${surveyData.daysPerWeek} day${surveyData.daysPerWeek !== 1 ? "s" : ""} (${picked} selected).`);
  }
  if (step === "activity-days") {
    const allDays = surveyData.preferredDays || SURVEY_DOW_MAP[surveyData.daysPerWeek] || [1, 3, 5];
    const assignedDays = new Set(Object.values(surveyData.activityDayMap || {}).flat());
    const unassigned = allDays.filter(d => !assignedDays.has(d));
    if (unassigned.length > 0) return fail(`${unassigned.length} day${unassigned.length > 1 ? "s" : ""} still unassigned. Every training day needs at least one activity.`);
  }
  return ok();
}

// ── Render dispatcher ─────────────────────────────────────────────────────────

function renderSurveyStep() {
  const content = document.getElementById("survey-step-content");
  const fill    = document.getElementById("survey-progress-fill");
  const backBtn = document.getElementById("survey-back-btn");
  const nextBtn = document.getElementById("survey-next-btn");
  if (!content) return;

  const step = SURVEY_STEPS[surveyStep];

  // Progress bar: grows across the content steps (skip welcome & summary)
  const total = SURVEY_STEPS.length - 2;
  const pct   = surveyStep <= 1 ? 0 : Math.min(Math.round(((surveyStep - 1) / total) * 100), 95);
  if (fill)    fill.style.width = pct + "%";
  if (backBtn) backBtn.style.display = surveyStep > 0 ? "block" : "none";
  if (nextBtn) nextBtn.style.display = "none"; // navigation is inline per step

  const builders = {
    "welcome":        buildSurveyWelcome,
    "sport":          buildSurveySport,
    "race-type":      buildSurveyRaceType,
    "run-goal":       buildSurveyRunGoal,
    "injury-history": buildSurveyInjuryHistory,
    "activities":     buildSurveyActivities,
    "strength-goal":  buildSurveyStrengthGoal,
    "race-date":      buildSurveyRaceDate,
    "long-day":       buildSurveyLongDay,
    "fitness-level":  buildSurveyFitnessLevel,
    "days-per-week":  buildSurveyDaysPerWeek,
    "strength-split": buildSurveyStrengthSplit,
    "plan-length":    buildSurveyPlanLength,
    "activity-days":  buildSurveyActivityDays,
    "yoga-types":     buildSurveyYogaTypes,
    "gym-strength":   buildSurveyGymStrength,
    "zones":          buildSurveyZones,
    "summary":        buildSurveySummary,
  };

  content.innerHTML = (builders[step] || (() => ""))();
}

// ── Step builders ─────────────────────────────────────────────────────────────

function buildSurveyWelcome() {
  return `
    <div class="sv-welcome">
      <div class="sv-welcome-icon">${ICONS.zap}</div>
      <h1 class="sv-welcome-title">Build Your<br>Training Plan</h1>
      <p class="sv-welcome-sub">Answer a few questions and IronZ will create a personalised, day-by-day training schedule dropped straight into your calendar.</p>
      <div class="sv-welcome-pills">
        <span class="sv-pill">${ICONS.calendar} Day-by-day sessions</span>
        <span class="sv-pill">${ICONS.utensils} Nutrition targets matched to load</span>
        <span class="sv-pill">${ICONS.trendingUp} Base → Build → Peak → Taper phases</span>
      </div>
      <button class="sv-cta" onclick="surveyNext()">Let's go →</button>
      <div class="sv-welcome-divider"><span>or</span></div>
      <div class="sv-ask-ironz-bar">
        <div class="nl-input-wrap">
          <input type="text" id="sv-ask-ironz-field" class="nl-input-field"
            placeholder="Ask IronZ to build a plan\u2026"
            onkeydown="if(event.key==='Enter') svWelcomeAskIronZ()" />
          <button class="nl-submit-btn" onclick="svWelcomeAskIronZ()">
            ${typeof ICONS !== "undefined" ? ICONS.sparkles || ICONS.zap : "AI"}
          </button>
        </div>
        <p id="sv-welcome-ironz-msg" class="save-msg"></p>
      </div>
      <button class="sv-skip-link" onclick="surveyGoToCustomPlan()">Create your own plan</button>
    </div>`;
}

function buildSurveySport() {
  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">What are you training for?</h2>
      <p class="sv-hint">Choose the sport that fits your goal.</p>
      <div class="sv-option-list">
        ${SURVEY_SPORT_OPTIONS.map(s => `
          <button class="sv-option-card ${surveyData.sport === s.value ? "is-selected" : ""}"
            onclick="surveyData.sport='${s.value}'; surveyData.raceType=null; surveyNext()">
            <span class="sv-option-icon">${s.icon}</span>
            <div class="sv-option-text">
              <div class="sv-option-label">${s.label}</div>
              <div class="sv-option-desc">${s.desc}</div>
            </div>
            <span class="sv-check">✓</span>
          </button>`).join("")}
      </div>
    </div>`;
}

function buildSurveyRaceType() {
  const filtered = SURVEY_RACE_OPTIONS.filter(r => r.sport === surveyData.sport);
  const sportLabel = SURVEY_SPORT_OPTIONS.find(s => s.value === surveyData.sport)?.label || "Event";
  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">Which ${sportLabel} event?</h2>
      <p class="sv-hint">Select the distance that matches your goal.</p>
      <div class="sv-race-grid">
        ${filtered.map(r => `
          <button class="sv-race-card ${surveyData.raceType === r.value ? "is-selected" : ""}"
            onclick="surveyData.raceType='${r.value}'; surveyNext()">
            <span class="sv-race-icon">${r.icon}</span>
            <span class="sv-race-label">${r.label}</span>
            <span class="sv-race-desc">${r.desc}</span>
          </button>`).join("")}
      </div>
    </div>`;
}

function buildSurveyActivities() {
  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">What do you like to do?</h2>
      <p class="sv-hint">Pick everything you're interested in — we'll build a balanced mix.</p>
      <div class="sv-activity-grid">
        ${SURVEY_ACTIVITY_OPTIONS.map(a => {
          const selected = surveyData.activities.includes(a.value);
          return `
            <button class="sv-activity-card ${selected ? "is-selected" : ""}"
              onclick="svToggleActivity('${a.value}')">
              <span class="sv-activity-icon">${a.icon}</span>
              <span class="sv-activity-label">${a.label}</span>
              ${selected ? '<span class="sv-activity-check">✓</span>' : ""}
            </button>`;
        }).join("")}
      </div>
      <button class="sv-cta" onclick="surveyNext()" style="margin-top:20px">Next →</button>
    </div>`;
}

function svToggleActivity(value) {
  const idx = surveyData.activities.indexOf(value);
  if (idx === -1) surveyData.activities.push(value);
  else surveyData.activities.splice(idx, 1);
  // Re-render just the grid so selections update live
  const content = document.getElementById("survey-step-content");
  if (content) content.innerHTML = buildSurveyActivities();
}

function buildSurveyStrengthGoal() {
  const goals = [
    { value: "maintain", label: "Maintain", desc: "Stay where you are" },
    { value: "bulk",     label: "Bulk",     desc: "Build muscle & size" },
    { value: "cut",      label: "Cut",      desc: "Lean out, keep muscle" },
    { value: "lose",     label: "Lose Weight", desc: "Fat loss focused" },
  ];
  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">What's your strength goal?</h2>
      <p class="sv-hint">This shapes your sets, reps, weight, and rest periods.</p>
      <div class="plan-goal-grid">
        ${goals.map(g => `
          <button class="plan-goal-btn${surveyData.strengthGoal === g.value ? " is-active" : ""}"
            data-goal="${g.value}" onclick="surveyData.strengthGoal='${g.value}'; document.getElementById('survey-step-content').innerHTML = buildSurveyStrengthGoal();">
            <strong>${g.label}</strong><span class="plan-goal-desc">${g.desc}</span>
          </button>`).join("")}
      </div>
      <button class="sv-cta" onclick="surveyNext()" style="margin-top:20px">Next →</button>
    </div>`;
}

let _svSplitEditingDay = -1; // which day index has the muscle picker open, -1 = none

function buildSurveyStrengthSplit() {
  // In mixed flow, use strength days from activityDayMap; otherwise use total daysPerWeek
  const strengthDays = _isMixedFlow() && surveyData.activityDayMap?.weightlifting
    ? surveyData.activityDayMap.weightlifting
    : null;
  const numDays = strengthDays ? strengthDays.length : (surveyData.daysPerWeek || 3);
  const presets = [
    { value: "ppl",         label: "Push / Pull / Legs", rec: numDays >= 3 },
    { value: "upper-lower", label: "Upper / Lower",       rec: numDays === 2 },
    { value: "full-body",   label: "Full Body",            rec: numDays <= 2 },
    { value: "custom",      label: "Custom",               rec: false },
  ];
  if (!surveyData.strengthSplit) {
    surveyData.strengthSplit = numDays >= 3 ? "ppl" : numDays === 2 ? "upper-lower" : "full-body";
  }

  const splitMuscles = typeof SPLIT_MUSCLES !== "undefined" ? SPLIT_MUSCLES : {};
  const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const selectedDows = strengthDays || surveyData.preferredDays || _defaultDows(numDays);

  // Initialize per-day data if not custom or not yet set
  if (!surveyData.strengthSplitDays || surveyData.strengthSplitDays.length !== numDays || surveyData.strengthSplit !== "custom") {
    if (surveyData.strengthSplit !== "custom") {
      const splitNames = (typeof SPLIT_PRESETS !== "undefined" && SPLIT_PRESETS[surveyData.strengthSplit])
        ? SPLIT_PRESETS[surveyData.strengthSplit] : ["Push", "Pull", "Legs"];
      surveyData.strengthSplitDays = [];
      for (let i = 0; i < numDays; i++) {
        const name = splitNames[i % splitNames.length];
        surveyData.strengthSplitDays.push({ label: name, muscles: [...(splitMuscles[name] || ["full body"])] });
      }
    } else if (!surveyData.strengthSplitDays || surveyData.strengthSplitDays.length !== numDays) {
      surveyData.strengthSplitDays = [];
      for (let i = 0; i < numDays; i++) {
        surveyData.strengthSplitDays.push({ label: "Custom", muscles: ["chest", "back", "shoulders"] });
      }
    }
  }

  // Build day rows with Choose buttons
  const ALL_M = typeof ALL_MUSCLES !== "undefined" ? ALL_MUSCLES : ["chest","back","shoulders","biceps","triceps","quads","hamstrings","glutes","core","calves"];
  let dayRows = "";
  for (let i = 0; i < numDays; i++) {
    const day = surveyData.strengthSplitDays[i];
    const dowLabel = DOW_SHORT[selectedDows[i]] || `Day ${i+1}`;
    const muscleStr = day.muscles.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(", ");
    const isEditing = _svSplitEditingDay === i;
    dayRows += `<div class="plan-split-day">
      <span class="plan-split-day-label">${dowLabel}</span>
      <span class="plan-split-day-muscles"><strong>${day.label}</strong> <span style="color:var(--color-text-muted);font-size:0.72rem">(${muscleStr})</span></span>
      <button class="plan-split-day-edit" onclick="_svToggleDayEdit(${i})">${isEditing ? "Done" : "Choose"}</button>
    </div>`;
    if (isEditing) {
      dayRows += `<div class="plan-muscle-picker" id="sv-muscle-picker-${i}" style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 0 10px 46px">
        ${ALL_M.map(m => `<button class="plan-muscle-chip${day.muscles.includes(m) ? " is-active" : ""}" onclick="_svToggleDayMuscle(${i},'${m}')">${m.charAt(0).toUpperCase() + m.slice(1)}</button>`).join("")}
      </div>`;
    }
  }

  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">Choose your split</h2>
      <p class="sv-hint">How should we divide muscle groups across your ${numDays} training days?</p>
      <div class="sv-split-options">
        ${presets.map(p => `
          <button class="sv-split-btn${surveyData.strengthSplit === p.value ? " is-active" : ""}"
            onclick="_svSelectSplit('${p.value}')">
            ${p.label}${p.rec ? ' <span style="font-size:0.65rem;color:var(--color-text-muted)">(recommended)</span>' : ""}
          </button>`).join("")}
      </div>
      <div class="plan-split-preview" style="margin-top:12px">${dayRows}</div>
      <button class="sv-cta" onclick="surveyNext()" style="margin-top:20px">Next →</button>
    </div>`;
}

function _svSelectSplit(value) {
  surveyData.strengthSplit = value;
  surveyData.strengthSplitDays = null; // force rebuild from preset
  _svSplitEditingDay = -1;
  document.getElementById("survey-step-content").innerHTML = buildSurveyStrengthSplit();
}

function _svToggleDayEdit(dayIdx) {
  _svSplitEditingDay = _svSplitEditingDay === dayIdx ? -1 : dayIdx;
  document.getElementById("survey-step-content").innerHTML = buildSurveyStrengthSplit();
}

function _svToggleDayMuscle(dayIdx, muscle) {
  const day = surveyData.strengthSplitDays[dayIdx];
  if (!day) return;
  const idx = day.muscles.indexOf(muscle);
  if (idx >= 0) day.muscles.splice(idx, 1);
  else day.muscles.push(muscle);
  day.label = "Custom";
  // Switch to custom preset since they're editing
  surveyData.strengthSplit = "custom";
  document.getElementById("survey-step-content").innerHTML = buildSurveyStrengthSplit();
}

function _defaultDows(n) {
  const defaults = { 2: [1,4], 3: [1,3,5], 4: [1,2,4,5], 5: [1,2,3,4,5], 6: [1,2,3,4,5,6] };
  return defaults[n] || defaults[3];
}

function buildSurveyPlanLength() {
  const options = [
    { value: 8,  label: "8 weeks",    desc: "Short training block" },
    { value: 12, label: "12 weeks",   desc: "Standard program" },
    { value: 16, label: "16 weeks",   desc: "Full training cycle" },
    { value: 26, label: "26 weeks",   desc: "Half-year plan" },
    { value: 52, label: "52 weeks",   desc: "Full year" },
    { value: 0,  label: "Indefinite", desc: "Keep generating — no end date" },
  ];
  if (surveyData.planLength === null) surveyData.planLength = 0;

  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">Plan length</h2>
      <p class="sv-hint">How long should your training plan run?</p>
      <div class="plan-goal-grid">
        ${options.map(o => `
          <button class="plan-goal-btn${surveyData.planLength === o.value ? " is-active" : ""}"
            onclick="surveyData.planLength=${o.value}; document.getElementById('survey-step-content').innerHTML = buildSurveyPlanLength();">
            <strong>${o.label}</strong><span class="plan-goal-desc">${o.desc}</span>
          </button>`).join("")}
      </div>
      <button class="sv-cta" onclick="surveyNext()" style="margin-top:20px">Next →</button>
    </div>`;
}

function buildSurveyRaceDate() {
  const race = SURVEY_RACE_OPTIONS.find(r => r.value === surveyData.raceType);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minStr = tomorrow.toISOString().slice(0, 10);

  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">When is your ${race ? race.label : "race"}?</h2>
      <p class="sv-hint">We'll count back from race day to structure your schedule.</p>
      <input type="date" class="sv-date-input" id="sv-race-date"
        min="${minStr}" value="${surveyData.raceDate || ""}"
        onchange="surveyData.raceDate = this.value; svUpdateWeeks()" />
      <div id="sv-weeks-display" class="sv-weeks-display">${surveyData.raceDate ? svWeeksHTML() : ""}</div>
      <div class="sv-field-group">
        <label class="sv-label">Race name <span class="sv-optional">optional</span></label>
        <input type="text" class="sv-text-input" placeholder="e.g. Boston Marathon 2027"
          value="${surveyData.raceName}"
          oninput="surveyData.raceName = this.value" />
      </div>
      <button class="sv-cta" onclick="surveyNext()" style="margin-top:20px">Next →</button>
    </div>`;
}

function buildSurveyLongDay() {
  const sessionLabel = surveyData.sport === "running" ? "long run"
    : surveyData.sport === "hyrox" ? "long session"
    : "long ride";
  const days = [
    { dow: 0, label: "Sunday" },
    { dow: 1, label: "Monday" },
    { dow: 2, label: "Tuesday" },
    { dow: 3, label: "Wednesday" },
    { dow: 4, label: "Thursday" },
    { dow: 5, label: "Friday" },
    { dow: 6, label: "Saturday" },
  ];
  // Default is Saturday (6) if nothing selected yet
  const selected = surveyData.longDay !== null ? surveyData.longDay : 6;
  if (surveyData.longDay === null) surveyData.longDay = 6; // pre-select Saturday
  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">Which day for your ${sessionLabel}?</h2>
      <p class="sv-hint">Your longest session will be scheduled on this day each week.</p>
      <div class="sv-option-list">
        ${days.map(d => `
          <button class="sv-option-card ${selected === d.dow ? "is-selected" : ""}"
            onclick="surveyData.longDay=${d.dow}; surveyNext()">
            <span class="sv-option-icon sv-days-num">${d.label.slice(0, 3)}</span>
            <div class="sv-option-text">
              <div class="sv-option-label">${d.label}</div>
            </div>
            <span class="sv-check">✓</span>
          </button>`).join("")}
      </div>
    </div>`;
}

function svWeeksHTML() {
  if (!surveyData.raceDate) return "";
  const rd    = new Date(surveyData.raceDate + "T00:00:00");
  const weeks = Math.floor((rd - new Date()) / (1000 * 60 * 60 * 24 * 7));
  if (weeks < 0) return "";
  const config = RACE_CONFIGS[surveyData.raceType] || {};
  const full   = config.totalWeeks || 0;
  const note   = weeks >= full
    ? `Full ${full}-week plan will be generated`
    : `${weeks}-week condensed plan (full plan is ${full} wks)`;
  return `<span class="sv-weeks-badge">${weeks} week${weeks !== 1 ? "s" : ""} away</span>
          <span class="sv-weeks-note">${note}</span>`;
}

function svUpdateWeeks() {
  const el = document.getElementById("sv-weeks-display");
  if (el) el.innerHTML = svWeeksHTML();
}

function buildSurveyFitnessLevel() {
  const isStrength = surveyData.sport === "just-training" || surveyData.sport === "strength";
  const opts = isStrength
    ? [
        { value: "beginner",     icon: ICONS.sprout,   label: "Beginner",     desc: "New to the gym or returning after a long break" },
        { value: "intermediate", icon: ICONS.activity, label: "Intermediate", desc: "Lifting consistently for 1+ years with a solid foundation" },
        { value: "advanced",     icon: ICONS.flame,    label: "Advanced",     desc: "Several years of structured lifting with strong compound lifts" },
      ]
    : [
        { value: "beginner",     icon: ICONS.sprout,   label: "Beginner",     desc: "New to structured training or returning after a long break" },
        { value: "intermediate", icon: ICONS.activity, label: "Intermediate", desc: "Train regularly and have completed at least one race" },
        { value: "advanced",     icon: ICONS.flame,    label: "Advanced",     desc: "Experienced competitor with a solid training base" },
      ];
  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">What's your fitness level?</h2>
      <p class="sv-hint">This shapes volume and intensity across your plan.</p>
      <div class="sv-option-list">
        ${opts.map(o => `
          <button class="sv-option-card ${surveyData.level === o.value ? "is-selected" : ""}"
            onclick="surveyData.level='${o.value}'; surveyNext()">
            <span class="sv-option-icon">${o.icon}</span>
            <div class="sv-option-text">
              <div class="sv-option-label">${o.label}</div>
              <div class="sv-option-desc">${o.desc}</div>
            </div>
            <span class="sv-check">✓</span>
          </button>`).join("")}
      </div>
    </div>`;
}

// Philosophy-derived default run days based on level, goal, and injury status.
// Delegates to computeRunDaysRecommendation() in planner.js (loaded before survey.js).
function getRunDaysRecommendation() {
  return computeRunDaysRecommendation(surveyData.level, surveyData.runGoal, surveyData.returningFromInjury);
}

// Sets daysPerWeek and resets preferredDays to defaults, then re-renders the step
function svSetDayCount(n) {
  surveyData.daysPerWeek = n;
  let newDays = [...(SURVEY_DOW_MAP[n] || [1, 3, 5])];
  const longDay = surveyData.longDay;
  if (longDay !== null && !newDays.includes(longDay)) {
    newDays.pop();
    newDays.push(longDay);
    newDays.sort((a, b) => a - b);
  }
  surveyData.preferredDays = newDays;
  // Reset activity-day assignments and strength split when day count changes
  surveyData.activityDayMap = {};
  surveyData.strengthSplitDays = null;
  document.getElementById("sv-days-display") && (document.getElementById("sv-days-display").textContent = n + " days / week");
  _renderSvDayPicker();
}

// Toggles a DOW in preferredDays. Enforces the selected count.
function svToggleSurveyDay(d) {
  const count = surveyData.daysPerWeek || 3;
  let days = surveyData.preferredDays ? [...surveyData.preferredDays] : [...(SURVEY_DOW_MAP[count] || [1, 3, 5])];
  const idx = days.indexOf(d);
  const longDay = surveyData.longDay;
  if (idx === -1) {
    if (days.length >= count) {
      // Replace the first non-locked day to keep count consistent
      const firstRemovable = days.findIndex(day => day !== longDay);
      if (firstRemovable === -1) return;
      days.splice(firstRemovable, 1);
    }
    days.push(d);
    days.sort((a, b) => a - b);
  } else {
    if (days.length <= 1) return; // must keep at least 1
    if (longDay !== null && d === longDay) return; // long day is required
    days.splice(idx, 1);
  }
  surveyData.preferredDays = days;
  _renderSvDayPicker();
}

function _renderSvDayPicker() {
  const wrap = document.getElementById("sv-day-picker-wrap");
  if (!wrap) return;
  const days = surveyData.preferredDays || SURVEY_DOW_MAP[surveyData.daysPerWeek] || [1, 3, 5];
  const longDay = surveyData.longDay;
  const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  wrap.innerHTML = DOW_LABELS.map((label, i) => {
    const isLocked = longDay !== null && i === longDay;
    const isSelected = days.includes(i);
    return `<button class="sv-day-btn ${isSelected ? "is-selected" : ""} ${isLocked ? "is-locked" : ""}" onclick="svToggleSurveyDay(${i})"${isLocked ? ' title="Long day — required"' : ""}>${label}</button>`;
  }).join("");
}

function buildSurveyDaysPerWeek() {
  // Running race plans: slider with philosophy-based recommendation
  if (surveyData.sport === "running" && !isNonRaceType()) {
    const rec = getRunDaysRecommendation();

    // Pre-fill with recommendation if not yet set
    if (!surveyData.daysPerWeek) surveyData.daysPerWeek = rec;
    const current = surveyData.daysPerWeek;
    if (!surveyData.preferredDays) {
      let initDays = [...(SURVEY_DOW_MAP[current] || [1, 3, 5])];
      const _ld = surveyData.longDay;
      if (_ld !== null && !initDays.includes(_ld)) { initDays.pop(); initDays.push(_ld); initDays.sort((a, b) => a - b); }
      surveyData.preferredDays = initDays;
    }

    // Context message driven by level + modifiers
    const contextMap = {
      beginner:     "Beginners build frequency tolerance gradually. Starting at 3 days maximises recovery and reduces injury risk as your body adapts.",
      intermediate: "Intermediate runners benefit from 4 focused sessions — a long run, one quality workout, and easy days that maintain rhythm without accumulating fatigue.",
      advanced:     "Advanced runners can absorb 5 sessions consistently when quality sessions are spaced with buffer days between them.",
    };
    let context = contextMap[surveyData.level] || contextMap.intermediate;
    if (surveyData.returningFromInjury) {
      context = "Returning runners need conservative frequency to reload tissues safely. Your plan will build days gradually as tolerance improves.";
    } else if (surveyData.runGoal === "finish") {
      context = "Completion-focused runners benefit from consistent, repeatable weeks. Fewer days done well beats more days done poorly.";
    } else if (surveyData.runGoal === "compete") {
      context = "Performance-focused runners can use the extra session as a second quality day or recovery mile — provided spacing and recovery are protected.";
    }

    const marks = [3, 4, 5, 6, 7].map(n => `
      <div class="sv-slider-mark ${n === rec ? "sv-slider-mark--rec" : ""}">
        <span>${n}</span>
        ${n === rec ? '<span class="sv-slider-rec-label">Rec.</span>' : ""}
      </div>`).join("");

    setTimeout(_renderSvDayPicker, 0);

    return `
      <div class="sv-question-wrap">
        <h2 class="sv-question">How many days per week will you run?</h2>
        <p class="sv-hint">${context}</p>
        <div class="sv-slider-wrap">
          <div class="sv-slider-value" id="sv-days-display">${current} days / week</div>
          <input type="range" class="sv-slider" id="sv-days-slider"
            min="3" max="7" step="1" value="${current}"
            oninput="svSetDayCount(parseInt(this.value))" />
          <div class="sv-slider-marks">${marks}</div>
        </div>
        <div class="sv-day-picker-label">Which days work for you?</div>
        <div class="sv-day-picker" id="sv-day-picker-wrap"></div>
        <button class="sv-cta" onclick="surveyData.daysPerWeek=parseInt(document.getElementById('sv-days-slider').value); surveyNext()" style="margin-top:20px">Next →</button>
      </div>`;
  }

  // Sport-specific day recommendations
  const sportDayRecs = {
    triathlon: { beginner: 4, intermediate: 5, advanced: 6,
      context: { beginner: "Beginner triathletes should start with 4 days — enough to touch all 3 sports without burnout. You'll swim, bike, and run each once, plus one extra session.", intermediate: "5 days gives room for two sessions in your weakest discipline while covering all three sports each week.", advanced: "6 days allows double sessions in key sports and dedicated brick workouts for race-specific preparation." }},
    cycling: { beginner: 3, intermediate: 4, advanced: 5,
      context: { beginner: "3 rides per week builds a strong aerobic base while giving your body time to adapt to time in the saddle.", intermediate: "4 days adds a second quality ride (intervals or tempo) alongside your long ride and easy spins.", advanced: "5 days provides high volume with structured intensity — key for FTP development." }},
    swimming: { beginner: 3, intermediate: 4, advanced: 5,
      context: { beginner: "3 sessions per week is ideal to build technique and feel for the water without shoulder overuse.", intermediate: "4 swims adds enough frequency to develop stroke efficiency and aerobic capacity.", advanced: "5 sessions allows dedicated drill work, threshold sets, and open water practice." }},
    hyrox: { beginner: 4, intermediate: 5, advanced: 6,
      context: { beginner: "4 days covers running, functional strength, and one combined session — the essentials for Hyrox preparation.", intermediate: "5 days adds a second running session and more station-specific work to build race capacity.", advanced: "6 days allows full Hyrox simulations, dedicated running volume, and heavy functional training." }},
  };

  const sportRec = sportDayRecs[surveyData.sport];
  const recDays = sportRec ? (sportRec[surveyData.level] || sportRec.intermediate) : null;
  const recContext = sportRec?.context?.[surveyData.level] || sportRec?.context?.intermediate || "";

  // Pre-fill with recommendation if not yet set
  if (recDays && !surveyData.daysPerWeek) surveyData.daysPerWeek = recDays;

  const opts = [
    { value: 3, label: "3 days / week", desc: "Recovery-focused, manageable volume" },
    { value: 4, label: "4 days / week", desc: "Balanced training with rest days built in" },
    { value: 5, label: "5 days / week", desc: "Higher commitment, strong progression" },
    { value: 6, label: "6 days / week", desc: "High-volume, competitive preparation" },
    { value: 7, label: "7 days / week", desc: isJustTrainingSport() ? "Maximum frequency — train every day" : "Full training load — high volume every day" },
  ];

  if (!surveyData.preferredDays && surveyData.daysPerWeek) {
    let initDays = [...(SURVEY_DOW_MAP[surveyData.daysPerWeek] || [1, 3, 5])];
    const _ld = surveyData.longDay;
    if (_ld !== null && !initDays.includes(_ld)) { initDays.pop(); initDays.push(_ld); initDays.sort((a, b) => a - b); }
    surveyData.preferredDays = initDays;
  }

  const showDayPicker = !!surveyData.daysPerWeek;
  if (showDayPicker) {
    setTimeout(_renderSvDayPicker, 0);
  }

  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">How many days can you train each week?</h2>
      <p class="sv-hint">${recContext || "Be realistic — a plan you can stick to beats one you can't."}</p>
      ${recDays ? `<p class="sv-hint" style="font-weight:600;color:var(--color-accent);margin-top:4px">Recommended for ${surveyData.level || "your"} level: ${recDays} days/week</p>` : ""}
      <div class="sv-option-list">
        ${opts.map(o => `
          <button class="sv-option-card ${surveyData.daysPerWeek === o.value ? "is-selected" : ""}${o.value === recDays ? " sv-recommended" : ""}"
            onclick="svSetDayCount(${o.value}); renderSurveyStep()">
            <span class="sv-option-icon sv-days-num">${o.value}${o.value === recDays ? '<span class="sv-rec-badge">Rec</span>' : ""}</span>
            <div class="sv-option-text">
              <div class="sv-option-label">${o.label}</div>
              <div class="sv-option-desc">${o.desc}</div>
            </div>
            <span class="sv-check">✓</span>
          </button>`).join("")}
      </div>
      ${showDayPicker ? `
        <div class="sv-day-picker-label">Which days work for you?</div>
        <div class="sv-day-picker" id="sv-day-picker-wrap"></div>
        <button class="sv-cta" onclick="surveyNext()" style="margin-top:20px">Next →</button>
      ` : ""}
    </div>`;
}

function svToggleActivityDay(type, d) {
  const map = surveyData.activityDayMap || {};
  const allDays = surveyData.preferredDays || SURVEY_DOW_MAP[surveyData.daysPerWeek] || [1, 3, 5];
  let days = map[type] ? [...map[type]] : [];
  const idx = days.indexOf(d);

  // Only allow toggling days that are in the overall preferredDays pool
  if (!allDays.includes(d)) return;

  if (idx === -1) {
    days.push(d);
    days.sort((a, b) => a - b);
  } else {
    days.splice(idx, 1);
  }
  map[type] = days;
  surveyData.activityDayMap = map;
  _renderActivityDayPickers();
}

function _renderActivityDayPickers() {
  const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const allDays = surveyData.preferredDays || SURVEY_DOW_MAP[surveyData.daysPerWeek] || [1, 3, 5];
  const map = surveyData.activityDayMap || {};
  const activities = surveyData.activities.length > 0 ? surveyData.activities : ["general"];
  const types = [...new Set(activities.map(a => {
    const opt = SURVEY_ACTIVITY_OPTIONS.find(x => x.value === a);
    return opt ? opt.type : "general";
  }))];

  types.forEach(type => {
    const wrap = document.getElementById(`sv-act-days-${type}`);
    if (!wrap) return;
    const assignedDays = map[type] || [];
    wrap.innerHTML = DOW_LABELS.map((label, i) => {
      if (!allDays.includes(i)) return "";
      const isSelected = assignedDays.includes(i);
      return `<button class="sv-day-btn ${isSelected ? "is-selected" : ""}"
        onclick="svToggleActivityDay('${type}', ${i})">${label}</button>`;
    }).join("");
  });

  // Show unassigned days count
  const unassignedWrap = document.getElementById("sv-act-days-unassigned");
  if (unassignedWrap) {
    const assigned = new Set(Object.values(map).flat());
    const unassigned = allDays.filter(d => !assigned.has(d));
    unassignedWrap.textContent = unassigned.length > 0
      ? `${unassigned.length} day${unassigned.length > 1 ? "s" : ""} unassigned — drag or tap to assign`
      : "All days assigned";
  }
}

function buildSurveyActivityDays() {
  const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const allDays = surveyData.preferredDays || SURVEY_DOW_MAP[surveyData.daysPerWeek] || [1, 3, 5];
  const activities = surveyData.activities.length > 0 ? surveyData.activities : ["general"];

  // Get unique types preserving activity label
  const typeInfo = [];
  const seenTypes = new Set();
  activities.forEach(a => {
    const opt = SURVEY_ACTIVITY_OPTIONS.find(x => x.value === a);
    const type = opt ? opt.type : "general";
    if (!seenTypes.has(type)) {
      seenTypes.add(type);
      typeInfo.push({ type, label: opt ? opt.label : "General Fitness", icon: opt ? opt.icon : ICONS.activity });
    }
  });

  // Auto-assign days round-robin if map is empty
  if (!surveyData.activityDayMap || Object.keys(surveyData.activityDayMap).length === 0) {
    const map = {};
    allDays.forEach((dow, i) => {
      const info = typeInfo[i % typeInfo.length];
      if (!map[info.type]) map[info.type] = [];
      map[info.type].push(dow);
    });
    surveyData.activityDayMap = map;
  }

  const map = surveyData.activityDayMap;

  const rows = typeInfo.map(({ type, label, icon }) => {
    const assignedDays = map[type] || [];
    const btnHtml = DOW_LABELS.map((lbl, i) => {
      if (!allDays.includes(i)) return "";
      const isSelected = assignedDays.includes(i);
      return `<button class="sv-day-btn ${isSelected ? "is-selected" : ""}"
        onclick="svToggleActivityDay('${type}', ${i})">${lbl}</button>`;
    }).join("");
    return `
      <div class="sv-act-day-row">
        <div class="sv-act-day-label">${icon} <span>${label}</span></div>
        <div class="sv-day-picker" id="sv-act-days-${type}">${btnHtml}</div>
      </div>`;
  }).join("");

  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">Which days for each activity?</h2>
      <p class="sv-hint">Tap days for each activity. A day can have multiple activities — stack them if you want.</p>
      <div class="sv-act-day-list">${rows}</div>
      <p class="sv-hint" id="sv-act-days-unassigned" style="margin-top:8px"></p>
      <button class="sv-cta" onclick="surveyNext()" style="margin-top:20px">Next →</button>
    </div>`;
}

const YOGA_TYPE_OPTIONS = [
  { value: "vinyasa",     label: "Vinyasa / Flow" },
  { value: "yin",         label: "Yin / Restorative" },
  { value: "power",       label: "Power Yoga" },
  { value: "sculpt",      label: "Yoga Sculpt" },
  { value: "mobility",    label: "Mobility / Stretching" },
  { value: "balance",     label: "Balance & Breathwork" },
];

function buildSurveyYogaTypes() {
  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">What styles of yoga interest you?</h2>
      <p class="sv-hint">Pick any that appeal to you, or skip to include all styles.</p>
      <div class="sv-activity-grid">
        ${YOGA_TYPE_OPTIONS.map(y => {
          const selected = surveyData.yogaTypes.includes(y.value);
          return `
            <button class="sv-activity-card ${selected ? "is-selected" : ""}"
              onclick="svToggleYogaType('${y.value}')">
              <span class="sv-activity-icon">${ICONS.yoga}</span>
              <span class="sv-activity-label">${y.label}</span>
              ${selected ? '<span class="sv-activity-check">✓</span>' : ""}
            </button>`;
        }).join("")}
      </div>
      <button class="sv-cta" onclick="surveyNext()" style="margin-top:20px">
        ${surveyData.yogaTypes.length ? "Next →" : "Skip — include all styles →"}
      </button>
    </div>`;
}

function svToggleYogaType(value) {
  const idx = surveyData.yogaTypes.indexOf(value);
  if (idx === -1) surveyData.yogaTypes.push(value);
  else surveyData.yogaTypes.splice(idx, 1);
  const content = document.getElementById("survey-step-content");
  if (content) content.innerHTML = buildSurveyYogaTypes();
}

function buildSurveyGymStrength() {
  const recs = {
    ironman:      "Recommended: 2 strength days/week to support the long training blocks and prevent injury.",
    halfIronman:  "Recommended: 2 strength days/week for muscular balance and injury resilience.",
    olympic:      "Recommended: 2 strength days/week to boost power output across all three disciplines.",
    sprint:       "Recommended: 1–2 strength days/week for speed, power, and injury resilience.",
    marathon:     "Recommended: 2 strength days/week — lower-body focus reduces injury risk significantly.",
    halfMarathon: "Recommended: 1–2 strength days/week to improve running economy and durability.",
    tenK:         "Recommended: 1–2 strength days/week for speed, stride efficiency, and resilience.",
    fiveK:        "Recommended: 1–2 strength days/week to improve power and pace.",
    centuryRide:  "Recommended: 2 strength days/week to build sustained cycling power and reduce fatigue.",
    granFondo:    "Recommended: 1–2 strength days/week to improve sustained power output on climbs.",
  };
  const rec = recs[surveyData.raceType] || "Strength training complements any endurance plan.";
  const selected = surveyData.gymStrength;

  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">Add gym &amp; strength training?</h2>
      <p class="sv-hint">${rec}</p>
      <div class="sv-option-list">
        <button class="sv-option-card ${selected === true ? "is-selected" : ""}"
          onclick="surveyData.gymStrength=true; surveyData.gymDays=2; renderSurveyStep()">
          <span class="sv-option-icon">${ICONS.weights}</span>
          <div class="sv-option-text">
            <div class="sv-option-label">Yes, add strength</div>
            <div class="sv-option-desc">Gym sessions will be added to your calendar</div>
          </div>
          <span class="sv-check">✓</span>
        </button>
        <button class="sv-option-card ${selected === false ? "is-selected" : ""}"
          onclick="surveyData.gymStrength=false; surveyNext()">
          <span class="sv-option-icon">${ICONS.ban}</span>
          <div class="sv-option-text">
            <div class="sv-option-label">No, endurance only</div>
            <div class="sv-option-desc">Skip strength sessions for now</div>
          </div>
          <span class="sv-check">✓</span>
        </button>
      </div>
      ${selected === true ? `
      <div style="margin-top:20px">
        <p class="sv-hint">How many strength days per week?</p>
        <div class="sv-option-list">
          ${[1, 2, 3].map(d => `
            <button class="sv-option-card ${surveyData.gymDays === d ? "is-selected" : ""}"
              onclick="surveyData.gymDays=${d}; surveyNext()">
              <span class="sv-option-icon sv-days-num">${d}</span>
              <div class="sv-option-text">
                <div class="sv-option-label">${d} day${d !== 1 ? "s" : ""} / week</div>
              </div>
              <span class="sv-check">✓</span>
            </button>`).join("")}
        </div>
      </div>` : ""}
    </div>`;
}

function buildSurveyRunGoal() {
  const opts = [
    {
      value: "finish",
      icon: ICONS.flag,
      label: "Just finish",
      desc: "Complete the race comfortably — confidence and durability come first",
    },
    {
      value: "time",
      icon: ICONS.clock,
      label: "Hit a time goal",
      desc: "Working toward a specific finish time with structured training",
    },
    {
      value: "compete",
      icon: ICONS.trophy,
      label: "Compete / podium",
      desc: "Chasing a performance result — age group or overall placement",
    },
  ];
  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">What's your goal for this race?</h2>
      <p class="sv-hint">This shapes how your sessions are structured and how hard your plan pushes.</p>
      <div class="sv-option-list">
        ${opts.map(o => `
          <button class="sv-option-card ${surveyData.runGoal === o.value ? "is-selected" : ""}"
            onclick="surveyData.runGoal='${o.value}'; surveyNext()">
            <span class="sv-option-icon">${o.icon}</span>
            <div class="sv-option-text">
              <div class="sv-option-label">${o.label}</div>
              <div class="sv-option-desc">${o.desc}</div>
            </div>
            <span class="sv-check">✓</span>
          </button>`).join("")}
      </div>
    </div>`;
}

function buildSurveyInjuryHistory() {
  const opts = [
    {
      value: false,
      icon: ICONS.check,
      label: "No — training consistently",
      desc: "No significant break or injury in the last 6 months",
    },
    {
      value: true,
      icon: ICONS.alertCircle,
      label: "Yes — returning from injury or a break",
      desc: "6+ months of low or no running due to injury, illness, or life",
    },
  ];
  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">Are you returning from an injury or a significant training break?</h2>
      <p class="sv-hint">Returning athletes need slower progression and more conservative session spacing to rebuild tissue tolerance safely.</p>
      <div class="sv-option-list">
        ${opts.map(o => `
          <button class="sv-option-card ${surveyData.returningFromInjury === o.value ? "is-selected" : ""}"
            onclick="surveyData.returningFromInjury=${o.value}; surveyNext()">
            <span class="sv-option-icon">${o.icon}</span>
            <div class="sv-option-text">
              <div class="sv-option-label">${o.label}</div>
              <div class="sv-option-desc">${o.desc}</div>
            </div>
            <span class="sv-check">✓</span>
          </button>`).join("")}
      </div>
    </div>`;
}

// ── Zones step ───────────────────────────────────────────────────────────────

function buildSurveyZones() {
  const sports = _getSurveyZoneSports();
  const z = surveyData.zones || {};

  let sections = "";

  if (sports.includes("running")) {
    const distOpts = typeof ZONE_DISTANCES !== "undefined"
      ? Object.keys(ZONE_DISTANCES).map(d => `<option value="${d}" ${(z.running?.dist === d) ? "selected" : ""}>${d}</option>`).join("")
      : '<option value="5K">5K</option>';
    const needsH = (z.running?.dist === "Half Marathon" || z.running?.dist === "Marathon");
    sections += `
      <div class="sv-zone-section">
        <h3 class="sv-zone-title">${ICONS.run} Running</h3>
        <p class="sv-hint">Enter a recent race or time trial result to set your pace zones.</p>
        <div class="sv-zone-row">
          <label class="sv-zone-label">Distance</label>
          <select id="sv-zone-run-dist" class="sv-zone-input" onchange="svZonesRunDistChanged()">${distOpts}</select>
        </div>
        <div class="sv-zone-row">
          <label class="sv-zone-label">Time</label>
          <div class="sv-zone-time">
            <input type="number" id="sv-zone-run-h" min="0" max="9" placeholder="h" class="sv-zone-time-field sv-zone-time-h" style="display:${needsH ? 'inline-block' : 'none'}" value="${z.running?.h || ''}" />
            <input type="number" id="sv-zone-run-m" min="0" max="59" placeholder="mm" class="sv-zone-time-field" value="${z.running?.m || ''}" />
            <span class="sv-zone-sep">:</span>
            <input type="number" id="sv-zone-run-s" min="0" max="59" placeholder="ss" class="sv-zone-time-field" value="${z.running?.s || ''}" />
          </div>
        </div>
      </div>`;
  }

  if (sports.includes("biking")) {
    sections += `
      <div class="sv-zone-section">
        <h3 class="sv-zone-title">${ICONS.bike} Cycling</h3>
        <p class="sv-hint">FTP = average power you can sustain for ~1 hour. Use a 20-min test x 0.95 if needed.</p>
        <div class="sv-zone-row">
          <label class="sv-zone-label">FTP</label>
          <div class="sv-zone-time">
            <input type="number" id="sv-zone-bike-ftp" min="50" max="600" placeholder="e.g. 250" class="sv-zone-time-field" style="width:100px" value="${z.biking?.ftp || ''}" />
            <span class="sv-zone-sep" style="margin-left:6px">W</span>
          </div>
        </div>
      </div>`;
  }

  if (sports.includes("swimming")) {
    sections += `
      <div class="sv-zone-section">
        <h3 class="sv-zone-title">${ICONS.swim} Swimming</h3>
        <p class="sv-hint">Swim 400m at a strong, sustained effort. T-pace is derived automatically.</p>
        <div class="sv-zone-row">
          <label class="sv-zone-label">400m time</label>
          <div class="sv-zone-time">
            <input type="number" id="sv-zone-swim-m" min="0" max="59" placeholder="mm" class="sv-zone-time-field" value="${z.swimming?.m || ''}" />
            <span class="sv-zone-sep">:</span>
            <input type="number" id="sv-zone-swim-s" min="0" max="59" placeholder="ss" class="sv-zone-time-field" value="${z.swimming?.s || ''}" />
          </div>
        </div>
      </div>`;
  }

  if (sports.includes("strength")) {
    const lifts = [
      { key: "bench",    label: "Bench Press" },
      { key: "squat",    label: "Back Squat" },
      { key: "deadlift", label: "Deadlift" },
      { key: "ohp",      label: "Overhead Press" },
      { key: "row",      label: "Barbell Row" },
    ];
    const typeOpts = (sel) => ["1rm","5rm","10rm"].map(v =>
      `<option value="${v}" ${sel === v ? "selected" : ""}>${v === "1rm" ? "1-rep max" : v === "5rm" ? "5-rep max" : "10-rep max"}</option>`
    ).join("");

    const rows = lifts.map(l => {
      const d = z.strength?.[l.key] || {};
      return `<div class="sv-zone-lift-row">
        <span class="sv-zone-lift-label">${l.label}</span>
        <input type="number" id="sv-zone-str-${l.key}" placeholder="lbs" min="0" max="2000" value="${d.weight || ''}" class="sv-zone-time-field" style="width:80px" />
        <select id="sv-zone-str-type-${l.key}" class="sv-zone-input" style="width:110px">${typeOpts(d.type || "1rm")}</select>
      </div>`;
    }).join("");

    sections += `
      <div class="sv-zone-section">
        <h3 class="sv-zone-title">${ICONS.weights} Strength</h3>
        <p class="sv-hint">Reference lifts help us recommend accurate weights. Leave blank any you don't track.</p>
        ${rows}
      </div>`;
  }

  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">Do you have any reference times or weights?</h2>
      <p class="sv-hint">This is optional. It helps us set accurate training zones and intensities for your plan.</p>
      ${sections}
      <div class="sv-zone-actions">
        <button class="sv-cta" onclick="svSaveZonesAndNext()">Continue</button>
        <button class="sv-skip-btn" onclick="surveyData.zones={};surveyNext()">Skip for now</button>
      </div>
    </div>`;
}

function svZonesRunDistChanged() {
  const dist = document.getElementById("sv-zone-run-dist")?.value;
  const hEl = document.getElementById("sv-zone-run-h");
  if (hEl) hEl.style.display = (dist === "Half Marathon" || dist === "Marathon") ? "inline-block" : "none";
}

function svSaveZonesAndNext() {
  const sports = _getSurveyZoneSports();
  const z = {};

  if (sports.includes("running")) {
    const dist = document.getElementById("sv-zone-run-dist")?.value;
    const h = parseInt(document.getElementById("sv-zone-run-h")?.value) || 0;
    const m = parseInt(document.getElementById("sv-zone-run-m")?.value) || 0;
    const s = parseInt(document.getElementById("sv-zone-run-s")?.value) || 0;
    if (m > 0 || s > 0) z.running = { dist, h, m, s };
  }

  if (sports.includes("biking")) {
    const ftp = parseInt(document.getElementById("sv-zone-bike-ftp")?.value) || 0;
    if (ftp > 0) z.biking = { ftp };
  }

  if (sports.includes("swimming")) {
    const m = parseInt(document.getElementById("sv-zone-swim-m")?.value) || 0;
    const s = parseInt(document.getElementById("sv-zone-swim-s")?.value) || 0;
    if (m > 0 || s > 0) z.swimming = { m, s };
  }

  if (sports.includes("strength")) {
    const lifts = ["bench", "squat", "deadlift", "ohp", "row"];
    const str = {};
    let hasAny = false;
    lifts.forEach(key => {
      const w = parseInt(document.getElementById(`sv-zone-str-${key}`)?.value) || 0;
      const t = document.getElementById(`sv-zone-str-type-${key}`)?.value || "1rm";
      if (w > 0) { str[key] = { weight: w, type: t }; hasAny = true; }
    });
    if (hasAny) z.strength = str;
  }

  surveyData.zones = z;
  surveyNext();
}

function buildSurveySummary() {
  const race     = SURVEY_RACE_OPTIONS.find(r => r.value === surveyData.raceType);
  const levelMap = { beginner: `Beginner ${ICONS.sprout}`, intermediate: `Intermediate ${ICONS.activity}`, advanced: `Advanced ${ICONS.flame}` };
  const greeting = "You're all set!";

  let rows;
  const _planLenLabel = surveyData.planLength ? `${surveyData.planLength} weeks` : "Indefinite";
  if (surveyData.sport === "strength") {
    const goalLabels = { bulk: "Bulk", cut: "Cut", maintain: "Maintain", lose: "Lose Weight" };
    const splitLabels = { ppl: "Push / Pull / Legs", "upper-lower": "Upper / Lower", "full-body": "Full Body" };
    rows = `
      ${svSummaryRow("Goal",           goalLabels[surveyData.strengthGoal] || "—")}
      ${svSummaryRow("Split",          splitLabels[surveyData.strengthSplit] || "Custom")}
      ${svSummaryRow("Level",          levelMap[surveyData.level] || "—")}
      ${svSummaryRow("Training days",  `${surveyData.daysPerWeek} days / week`)}
      ${svSummaryRow("Plan length",    _planLenLabel)}`;
  } else if (isNonRaceType()) {
    const actLabels = surveyData.activities
      .map(v => SURVEY_ACTIVITY_OPTIONS.find(a => a.value === v))
      .filter(Boolean)
      .map(a => `${a.icon} ${a.label}`)
      .join(", ") || "General Fitness";
    rows = `
      ${svSummaryRow("Activities",     actLabels)}
      ${svSummaryRow("Level",          levelMap[surveyData.level] || "—")}
      ${svSummaryRow("Training days",  `${surveyData.daysPerWeek} days / week`)}
      ${svSummaryRow("Plan length",    isEffectivelyStrength() ? _planLenLabel : "Indefinite")}`;
  } else {
    const raceName = surveyData.raceName || (race ? race.label : "My Race");
    const dateStr  = surveyData.raceDate ? formatDisplayDate(surveyData.raceDate) : "—";
    const rd       = surveyData.raceDate ? new Date(surveyData.raceDate + "T00:00:00") : null;
    const weeks    = rd ? Math.floor((rd - new Date()) / (1000 * 60 * 60 * 24 * 7)) : 0;
    const config   = RACE_CONFIGS[surveyData.raceType] || {};
    const planWks  = Math.min(weeks, config.totalWeeks || weeks);
    const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const longDayStr = surveyData.longDay !== null ? DOW_NAMES[surveyData.longDay] : "Saturday (default)";
    const sessionLabel = surveyData.sport === "running" ? "Long run day" : "Long ride day";
    const gymRow = surveyData.gymStrength === true
      ? svSummaryRow("Strength training", `${surveyData.gymDays} day${surveyData.gymDays !== 1 ? "s" : ""} / week`)
      : "";
    const goalLabels = { finish: "Just finish", time: "Hit a time goal", compete: "Compete / podium" };
    const runGoalRow = surveyData.sport === "running" && surveyData.runGoal
      ? svSummaryRow("Race goal", goalLabels[surveyData.runGoal] || "—")
      : "";
    const injuryRow = surveyData.sport === "running" && surveyData.returningFromInjury !== null
      ? svSummaryRow("Returning from break", surveyData.returningFromInjury ? "Yes — conservative progression" : "No")
      : "";
    rows = `
      ${svSummaryRow("Race",           raceName)}
      ${svSummaryRow("Type",           race ? race.label : "—")}
      ${svSummaryRow("Date",           dateStr)}
      ${svSummaryRow(sessionLabel,     longDayStr)}
      ${svSummaryRow("Level",          levelMap[surveyData.level] || "—")}
      ${runGoalRow}
      ${injuryRow}
      ${svSummaryRow("Training days",  `${surveyData.daysPerWeek} days / week`)}
      ${gymRow}
      ${svSummaryRow("Plan length",    `${planWks} week${planWks !== 1 ? "s" : ""}`)}`;
  }

  // Zones summary
  const zKeys = Object.keys(surveyData.zones || {});
  if (zKeys.length > 0) {
    const zLabels = { running: "Running", biking: "Cycling", swimming: "Swimming", strength: "Strength" };
    const zSummary = zKeys.map(k => zLabels[k] || k).join(", ");
    rows += svSummaryRow("Zones set", zSummary);
  }

  return `
    <div class="sv-question-wrap">
      <h2 class="sv-question">${greeting}</h2>
      <p class="sv-hint">Here's what we'll build for you.</p>
      <div class="sv-summary-card">${rows}</div>
      <button class="sv-generate-btn" onclick="submitSurveyPlan()">${ICONS.zap} Generate My Plan</button>
      <p id="sv-gen-msg" class="sv-gen-msg"></p>
    </div>`;
}

function svSummaryRow(label, value) {
  return `
    <div class="sv-summary-row">
      <span class="sv-summary-label">${label}</span>
      <span class="sv-summary-value">${value}</span>
    </div>`;
}

// ── Plan generation ───────────────────────────────────────────────────────────

// Day-of-week defaults by training-days count (Mon-indexed)
const SURVEY_DOW_MAP = {
  3: [1, 3, 5],            // Mon Wed Fri
  4: [1, 2, 4, 5],         // Mon Tue Thu Fri
  5: [1, 2, 3, 4, 5],      // Mon–Fri
  6: [1, 2, 3, 4, 5, 6],   // Mon–Sat
  7: [0, 1, 2, 3, 4, 5, 6],// Sun–Sat
};

function submitSurveyPlan() {
  const finish = (count, label) => {
    // Save days/week to profile
    try {
      const profile = JSON.parse(localStorage.getItem("profile")) || {};
      profile.daysPerWeek = surveyData.daysPerWeek;
      localStorage.setItem("profile", JSON.stringify(profile));
      if (typeof DB !== 'undefined') DB.profile.save(profile).catch(() => {});
    } catch { /* ignore */ }

    localStorage.setItem("surveyComplete", "1");

    // Save athlete zones from survey
    if (surveyData.zones && Object.keys(surveyData.zones).length > 0) {
      const z = surveyData.zones;
      if (z.running && typeof computeRunningZones === "function" && typeof ZONE_DISTANCES !== "undefined") {
        const totalSec = (z.running.h || 0) * 3600 + (z.running.m || 0) * 60 + (z.running.s || 0);
        const distM = ZONE_DISTANCES[z.running.dist];
        if (totalSec > 0 && distM) {
          const zones = computeRunningZones(distM, totalSec);
          if (zones) saveTrainingZonesData("running", zones);
        }
      }
      if (z.biking && typeof computeBikingZones === "function") {
        if (z.biking.ftp > 0) {
          const zones = computeBikingZones(z.biking.ftp);
          if (zones) saveTrainingZonesData("biking", zones);
        }
      }
      if (z.swimming && typeof computeSwimmingZones === "function") {
        const totalSec = (z.swimming.m || 0) * 60 + (z.swimming.s || 0);
        if (totalSec > 0) {
          const zones = computeSwimmingZones(totalSec);
          if (zones) saveTrainingZonesData("swimming", zones);
        }
      }
      if (z.strength && typeof saveTrainingZonesData === "function") {
        const data = { ...z.strength, updatedAt: new Date().toISOString() };
        saveTrainingZonesData("strength", data);
      }
    }

    if (surveyData.yogaTypes.length > 0) {
      localStorage.setItem("yogaTypes", JSON.stringify(surveyData.yogaTypes)); if (typeof DB !== 'undefined') DB.syncKey('yogaTypes');
    }

    const msg = document.getElementById("sv-gen-msg");

    // Determine plan type for philosophy
    const _triTypes = ["ironman", "halfIronman", "olympic", "sprint"];
    const _runTypes = ["marathon", "halfMarathon", "tenK", "fiveK"];
    const _cycleTypes = ["centuryRide", "granFondo"];
    const _planType = _triTypes.includes(surveyData.raceType) ? "triathlon"
      : _runTypes.includes(surveyData.raceType) ? "running"
      : _cycleTypes.includes(surveyData.raceType) ? "cycling"
      : surveyData.sport === "hyrox" ? "general"
      : "general";

    if (msg) msg.innerHTML = `
      <div style="text-align:center;padding:8px 0">
        <div style="font-weight:700;font-size:1rem;color:var(--color-success);margin-bottom:12px">${count} ${label} added to your calendar!</div>
        <p style="color:var(--color-text-muted);font-size:0.85rem;margin:0 0 14px">Want to understand why your plan is structured this way?</p>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn-primary" onclick="closeSurvey();if(typeof showTrainingPhilosophy==='function')showTrainingPhilosophy('${_planType}')">See Training Philosophy</button>
          <button class="btn-secondary" onclick="closeSurvey()">Skip</button>
        </div>
      </div>`;

    currentWeekStart = getWeekStart(new Date());
    renderCalendar();
    selectDay(getTodayString());
    if (typeof renderRaceEvents     === "function") renderRaceEvents();
    if (typeof renderTrainingInputs === "function") renderTrainingInputs();
    if (typeof renderGreeting       === "function") renderGreeting();
    if (typeof renderZones          === "function") renderZones();
    if (typeof renderTrainingBlocksSection === "function") renderTrainingBlocksSection();
  };

  // Strength-specific: set up split data for saveWorkoutSchedule
  if (isEffectivelyStrength()) {
    if (typeof _planGoal !== "undefined") _planGoal = surveyData.strengthGoal || "maintain";
    const numDays = surveyData.daysPerWeek || 3;
    const selectedDows = surveyData.preferredDays || SURVEY_DOW_MAP[numDays] || [1, 3, 5];
    if (typeof _planSplitDays !== "undefined") {
      if (surveyData.strengthSplitDays && surveyData.strengthSplitDays.length === numDays) {
        // Use the user's customized split from the survey
        _planSplitDays = surveyData.strengthSplitDays.map((d, i) => ({
          ...d, dow: selectedDows[i],
        }));
      } else {
        // Fallback: build from preset
        const splitPreset = surveyData.strengthSplit || "ppl";
        const splitNames = (typeof SPLIT_PRESETS !== "undefined" && SPLIT_PRESETS[splitPreset])
          ? SPLIT_PRESETS[splitPreset] : ["Push", "Pull", "Legs"];
        const splitMuscles = typeof SPLIT_MUSCLES !== "undefined" ? SPLIT_MUSCLES : {};
        _planSplitDays = [];
        for (let i = 0; i < numDays; i++) {
          const splitName = splitNames[i % splitNames.length];
          _planSplitDays.push({ label: splitName, muscles: [...(splitMuscles[splitName] || ["full body"])], dow: selectedDows[i] });
        }
      }
    }
  }

  if (isNonRaceType()) {
    const allDows = surveyData.preferredDays || SURVEY_DOW_MAP[surveyData.daysPerWeek] || [1, 3, 5];
    const activities = surveyData.sport === "strength"
      ? ["lifting"]
      : (surveyData.activities.length > 0 ? surveyData.activities : ["general"]);

    // If per-activity DOW assignments were made, use them; otherwise round-robin
    const dowsByType = {};
    if (surveyData.activityDayMap && Object.keys(surveyData.activityDayMap).length > 0) {
      // User explicitly assigned days to each activity type
      Object.entries(surveyData.activityDayMap).forEach(([type, dows]) => {
        dowsByType[type] = dows;
      });
    } else {
      // Round-robin assign DOWs to activities
      // e.g. 4 days + [running, lifting, cycling] → [running, lifting, cycling, running]
      allDows.forEach((dow, i) => {
        const act = activities[i % activities.length];
        const opt = SURVEY_ACTIVITY_OPTIONS.find(a => a.value === act);
        const type = opt ? opt.type : "general";
        if (!dowsByType[type]) dowsByType[type] = [];
        dowsByType[type].push(dow);
      });
    }

    const planWeeks = (surveyData.planLength && surveyData.planLength > 0) ? surveyData.planLength : 104;

    let total = 0;
    let first = true;
    for (const [type, dows] of Object.entries(dowsByType)) {
      // First call clears existing generated entries; subsequent calls append
      if (type === "running" || type === "cycling" || type === "swimming") {
        total += saveEnduranceTrainingSchedule(type, dows, surveyData.level, getTodayString(), planWeeks, !first);
      } else {
        total += saveWorkoutSchedule(type, dows, surveyData.level, getTodayString(), planWeeks, 4, !first);
      }
      first = false;
    }
    finish(total, "sessions");
    return;
  }

  // Race-based plan
  const raceOption = SURVEY_RACE_OPTIONS.find(r => r.value === surveyData.raceType);
  const race = {
    id:                  generateId("race"),
    name:                surveyData.raceName || (raceOption ? raceOption.label : "My Race"),
    type:                surveyData.raceType,
    sport:               surveyData.sport,
    level:               surveyData.level,
    date:                surveyData.raceDate,
    longDay:             surveyData.longDay,
    runGoal:             surveyData.runGoal,
    returningFromInjury: surveyData.returningFromInjury,
    daysPerWeek:         surveyData.daysPerWeek,
    createdAt:           new Date().toISOString(),
  };

  const events = loadEvents();
  events.push(race);
  saveEvents(events);

  const newEntries   = generateTrainingPlan(race);
  const existingPlan = loadTrainingPlan().filter(e => e.raceId !== race.id);
  saveTrainingPlanData([...existingPlan, ...newEntries]);

  // Handle gym/strength toggle based on survey answer
  if (surveyData.gymStrength === true) {
    localStorage.setItem("gymStrengthEnabled", "1"); if (typeof DB !== 'undefined') DB.syncKey('gymStrengthEnabled');
    const gymDowMap = { 1: [2], 2: [2, 5], 3: [2, 4, 6] };
    const gymDows = gymDowMap[surveyData.gymDays] || [2, 5];
    if (typeof saveWorkoutSchedule === "function") {
      // Remove any existing generated weightlifting before re-adding so re-running
      // the survey never stacks duplicate sessions on the same dates.
      const ws = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
      localStorage.setItem("workoutSchedule", JSON.stringify(ws.filter(e => !(e.source === "generated" && e.type === "weightlifting")))); if (typeof DB !== 'undefined') DB.syncSchedule();
      saveWorkoutSchedule("weightlifting", gymDows, surveyData.level || "intermediate", getTodayString(), 104, 4, true);
    }
  } else {
    localStorage.setItem("gymStrengthEnabled", "0"); if (typeof DB !== 'undefined') DB.syncKey('gymStrengthEnabled');
  }
  if (typeof initGymStrengthToggle === "function") initGymStrengthToggle();

  finish(newEntries.length, "sessions");
}
