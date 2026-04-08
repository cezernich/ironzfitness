// onboarding.js — First-time user onboarding wizard
// Separate from the "Build Plan" survey (survey.js) which remains available anytime.

const ONBOARDING_STEPS = [
  "welcome",
  "profile",
  "goals",
  "experience",
  "workout-interests",
  "features",
  "dietary",       // conditional — only if nutrition selected
  "summary",
];

const ONBOARDING_GOALS = [
  { value: "endurance", icon: ICONS.run,      label: "Endurance",          desc: "Marathon, triathlon, long-distance" },
  { value: "strength",  icon: ICONS.weights,  label: "Strength & Power",   desc: "Build muscle, hit new PRs" },
  { value: "weight",    icon: ICONS.flame,    label: "Weight Loss",        desc: "Lose fat, improve body composition" },
  { value: "speed",     icon: ICONS.zap,      label: "Speed & Performance",desc: "Get faster, boost athletic output" },
  { value: "general",   icon: ICONS.activity, label: "General Fitness",    desc: "Stay healthy, feel great" },
];

const ONBOARDING_DIETARY = [
  { value: "none",        label: "No Restrictions" },
  { value: "vegetarian",  label: "Vegetarian" },
  { value: "vegan",       label: "Vegan" },
  { value: "gluten-free", label: "Gluten-Free" },
  { value: "dairy-free",  label: "Dairy-Free" },
  { value: "keto",        label: "Keto" },
  { value: "paleo",       label: "Paleo" },
];

let obStep = 0;
let obData = {
  name: "",
  age: "",
  weight: "",
  height: "",
  gender: "",
  units: "imperial",
  goal: null,
  level: null,
  daysPerWeek: 4,
  sessionLength: 45,
  workoutInterests: [],
  hydrationHabit: "sometimes",
  nutritionEnabled: true,
  hydrationEnabled: true,
  dietaryRestrictions: [],
  allergies: "",
  foodsLove: "",
  foodsAvoid: "",
};

// ── Open / Close ──────────────────────────────────────────────────────────────

function showOnboarding() {
  obStep = 0;
  // Full reset
  obData = {
    name: "", birthday: "", age: "", weight: "", height: "", gender: "", units: "imperial",
    goal: null, level: null, daysPerWeek: 4, sessionLength: 45,
    workoutInterests: [], hydrationHabit: "sometimes",
    nutritionEnabled: true, hydrationEnabled: true,
    dietaryRestrictions: [], allergies: "", foodsLove: "", foodsAvoid: "",
  };
  // Pre-fill name from signup if available
  try {
    const profile = JSON.parse(localStorage.getItem("profile")) || {};
    if (profile.name) obData.name = profile.name;
  } catch {}

  const overlay = document.getElementById("onboarding-overlay");
  if (overlay) {
    overlay.classList.add("is-open");
    renderOnboardingStep();
  }
}

function closeOnboarding() {
  const overlay = document.getElementById("onboarding-overlay");
  if (overlay) overlay.classList.remove("is-open");
}

// ── Navigation ────────────────────────────────────────────────────────────────

function onboardingNext() {
  if (!validateOnboardingStep()) return;
  collectOnboardingStep();

  // Find next applicable step
  obStep++;
  while (obStep < ONBOARDING_STEPS.length && shouldSkipOnboardingStep(ONBOARDING_STEPS[obStep])) {
    obStep++;
  }

  if (obStep >= ONBOARDING_STEPS.length) {
    finishOnboarding(false);
    return;
  }

  renderOnboardingStep();
}

function onboardingBack() {
  obStep--;
  while (obStep > 0 && shouldSkipOnboardingStep(ONBOARDING_STEPS[obStep])) {
    obStep--;
  }
  if (obStep < 0) obStep = 0;
  renderOnboardingStep();
}

function shouldSkipOnboardingStep(step) {
  if (step === "dietary" && !obData.nutritionEnabled) return true;
  return false;
}

// ── Progress ──────────────────────────────────────────────────────────────────

function updateOnboardingProgress() {
  const totalVisible = ONBOARDING_STEPS.filter(s => !shouldSkipOnboardingStep(s)).length;
  let currentVisible = 0;
  for (let i = 0; i <= obStep; i++) {
    if (!shouldSkipOnboardingStep(ONBOARDING_STEPS[i])) currentVisible++;
  }
  const pct = Math.min(Math.round((currentVisible / totalVisible) * 100), 100);
  const fill = document.getElementById("onboarding-progress-fill");
  if (fill) fill.style.width = pct + "%";
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateOnboardingStep() {
  const step = ONBOARDING_STEPS[obStep];
  const msg = document.getElementById("onboarding-val-msg");
  if (msg) msg.textContent = "";

  if (step === "profile") {
    const name = document.getElementById("ob-name")?.value.trim();
    const birthday = document.getElementById("ob-birthday")?.value;
    const weight = document.getElementById("ob-weight")?.value;
    if (!name) { if (msg) msg.textContent = "Please enter your name."; return false; }
    if (!birthday) { if (msg) msg.textContent = "Please enter your birthday."; return false; }
    if (!weight || weight < 50) { if (msg) msg.textContent = "Please enter your weight."; return false; }
    // Height validation: imperial (ft/in) vs metric (cm)
    const isMetric = obData.units === "metric";
    if (isMetric) {
      const height = document.getElementById("ob-height")?.value;
      if (!height || height < 100 || height > 250) { if (msg) msg.textContent = "Please enter a valid height in cm."; return false; }
    } else {
      const feet = parseInt(document.getElementById("ob-height-feet")?.value);
      const inches = parseInt(document.getElementById("ob-height-inches")?.value);
      if (isNaN(feet) || feet < 3 || feet > 8) { if (msg) msg.textContent = "Please enter valid feet (3-8)."; return false; }
      if (isNaN(inches) || inches < 0 || inches > 11) { if (msg) msg.textContent = "Please enter valid inches (0-11)."; return false; }
    }
    return true;
  }

  if (step === "goals") {
    if (!obData.goal) { if (msg) msg.textContent = "Please select a goal."; return false; }
    return true;
  }

  if (step === "experience") {
    if (!obData.level) { if (msg) msg.textContent = "Please select your experience level."; return false; }
    return true;
  }

  if (step === "workout-interests") {
    const checked = document.querySelectorAll("#ob-interests input:checked");
    if (checked.length < 1) { if (msg) msg.textContent = "Select at least one workout type."; return false; }
    return true;
  }

  return true;
}

// ── Collect Data from Current Step ────────────────────────────────────────────

function collectOnboardingStep() {
  const step = ONBOARDING_STEPS[obStep];

  if (step === "profile") {
    obData.name = document.getElementById("ob-name")?.value.trim() || "";
    obData.birthday = document.getElementById("ob-birthday")?.value || "";
    obData.age = obData.birthday ? String(_calcAgeFromBirthday(obData.birthday)) : "";
    obData.weight = document.getElementById("ob-weight")?.value || "";
    obData.gender = document.getElementById("ob-gender")?.value || "";
    // Height: convert ft/in to total inches (imperial) or store cm (metric)
    if (obData.units === "metric") {
      obData.height = document.getElementById("ob-height")?.value || "";
    } else {
      const feet = parseInt(document.getElementById("ob-height-feet")?.value) || 0;
      const inches = parseInt(document.getElementById("ob-height-inches")?.value) || 0;
      obData.height = String(feet * 12 + inches);
    }
  }

  if (step === "workout-interests") {
    obData.workoutInterests = Array.from(document.querySelectorAll("#ob-interests input:checked")).map(el => el.value);
  }

  if (step === "features") {
    obData.nutritionEnabled = document.getElementById("ob-feat-nutrition")?.checked ?? true;
    obData.hydrationEnabled = document.getElementById("ob-feat-hydration")?.checked ?? true;
    obData.fuelingEnabled = document.getElementById("ob-feat-fueling")?.checked ?? true;
    obData.hydrationHabit = document.querySelector('input[name="ob-hydration-habit"]:checked')?.value || "sometimes";
  }

  if (step === "dietary") {
    obData.dietaryRestrictions = Array.from(document.querySelectorAll("#ob-dietary input:checked")).map(el => el.value);
    obData.allergies = document.getElementById("ob-allergies")?.value.trim() || "";
    obData.foodsLove = document.getElementById("ob-foods-love")?.value.trim() || "";
    obData.foodsAvoid = document.getElementById("ob-foods-avoid")?.value.trim() || "";
  }
}

// ── Render Steps ──────────────────────────────────────────────────────────────

function renderOnboardingStep() {
  const step = ONBOARDING_STEPS[obStep];
  const content = document.getElementById("onboarding-step-content");
  const backBtn = document.getElementById("onboarding-back-btn");
  const nextBtn = document.getElementById("onboarding-next-btn");
  const msg = document.getElementById("onboarding-val-msg");
  if (msg) msg.textContent = "";

  if (backBtn) backBtn.style.display = obStep === 0 ? "none" : "";

  updateOnboardingProgress();

  switch (step) {
    case "welcome":       content.innerHTML = buildOBWelcome(); break;
    case "profile":       content.innerHTML = buildOBProfile(); break;
    case "goals":         content.innerHTML = buildOBGoals(); break;
    case "experience":    content.innerHTML = buildOBExperience(); break;
    case "workout-interests": content.innerHTML = buildOBWorkoutInterests(); break;
    case "features":      content.innerHTML = buildOBFeatures(); break;
    case "dietary":       content.innerHTML = buildOBDietary(); break;
    case "summary":       content.innerHTML = buildOBSummary(); nextBtn.style.display = "none"; return;
    default:              content.innerHTML = "";
  }

  if (step !== "summary") { nextBtn.textContent = "Continue \u2192"; nextBtn.style.display = ""; }
}

// ── Step Builders ─────────────────────────────────────────────────────────────

function buildOBWelcome() {
  const displayName = obData.name ? escOB(obData.name) : "";
  return `
    <div class="ob-welcome">
      <div class="ob-logo">IRONZ</div>
      <h1 class="ob-title">Welcome${displayName ? ", " + displayName : ""}!</h1>
      <p class="ob-subtitle">Let's personalize your experience. This takes about 2 minutes and helps us build the perfect experience for you.</p>
    </div>
  `;
}

function buildOBProfile() {
  const isMetric = obData.units === "metric";
  const weightLabel = isMetric ? "Weight (kg)" : "Weight (lbs)";
  const heightLabel = isMetric ? "Height (cm)" : "Height (in)";
  const weightPlaceholder = isMetric ? "e.g. 75" : "e.g. 165";
  const heightPlaceholder = isMetric ? "e.g. 178" : "e.g. 70";
  return `
    <h2 class="ob-step-title">About You</h2>
    <p class="ob-step-desc">This info helps us calculate accurate training targets and nutrition recommendations.</p>
    <div class="form-row" style="margin-bottom:16px">
      <label>Units</label>
      <div class="ob-units-toggle">
        <button class="ob-units-btn ${!isMetric ? "is-active" : ""}" onclick="obSetUnits('imperial')">Imperial (lbs, mi)</button>
        <button class="ob-units-btn ${isMetric ? "is-active" : ""}" onclick="obSetUnits('metric')">Metric (kg, km)</button>
      </div>
    </div>
    <div class="form-grid">
      <div class="form-row">
        <label for="ob-name">Name</label>
        <input type="text" id="ob-name" placeholder="e.g. Alex Johnson" value="${escOB(obData.name)}" />
      </div>
      <div class="form-row">
        <label for="ob-birthday">Birthday</label>
        <input type="date" id="ob-birthday" value="${escOB(obData.birthday)}" max="${new Date().toISOString().slice(0,10)}" />
      </div>
      <div class="form-row">
        <label for="ob-weight">${weightLabel}</label>
        <input type="number" id="ob-weight" placeholder="${weightPlaceholder}" min="20" value="${escOB(obData.weight)}" />
      </div>
      <div class="form-row">
        <label>${heightLabel}</label>
        ${isMetric ? `
          <input type="number" id="ob-height" placeholder="e.g. 178" min="100" max="250" value="${escOB(obData.height)}" />
        ` : `
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="number" id="ob-height-feet" min="3" max="8" placeholder="5" style="width:70px" value="${obData.height ? Math.floor(parseInt(obData.height) / 12) : ""}" />
            <span>ft</span>
            <input type="number" id="ob-height-inches" min="0" max="11" placeholder="10" style="width:70px" value="${obData.height ? parseInt(obData.height) % 12 : ""}" />
            <span>in</span>
          </div>
        `}
      </div>
    </div>
    <div class="form-row">
      <label for="ob-gender">Gender</label>
      <select id="ob-gender">
        <option value="" ${obData.gender === "" ? "selected" : ""}>Prefer not to say</option>
        <option value="male" ${obData.gender === "male" ? "selected" : ""}>Male</option>
        <option value="female" ${obData.gender === "female" ? "selected" : ""}>Female</option>
        <option value="nonbinary" ${obData.gender === "nonbinary" ? "selected" : ""}>Non-binary</option>
      </select>
    </div>
  `;
}

function obSetUnits(system) {
  // Save current values before switching
  collectOnboardingStep();
  obData.units = system;
  // Convert weight/height if values exist
  if (obData.weight) {
    const w = parseFloat(obData.weight);
    if (!isNaN(w)) {
      obData.weight = system === "metric"
        ? String(Math.round(w * 0.453592))   // lbs → kg
        : String(Math.round(w * 2.20462));    // kg → lbs
    }
  }
  if (obData.height) {
    const h = parseFloat(obData.height);
    if (!isNaN(h)) {
      obData.height = system === "metric"
        ? String(Math.round(h * 2.54))        // in → cm
        : String(Math.round(h / 2.54));       // cm → in
    }
  }
  renderOnboardingStep();
}

function buildOBGoals() {
  return `
    <h2 class="ob-step-title">What's Your Main Goal?</h2>
    <p class="ob-step-desc">This shapes your training plan, nutrition targets, and recommendations.</p>
    <div class="ob-goal-grid">
      ${ONBOARDING_GOALS.map(g => `
        <button class="ob-goal-card ${obData.goal === g.value ? "selected" : ""}" onclick="obSelectGoal('${g.value}')">
          <span class="ob-goal-icon">${g.icon}</span>
          <span class="ob-goal-label">${g.label}</span>
          <span class="ob-goal-desc">${g.desc}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function obSelectGoal(value) {
  obData.goal = value;
  document.querySelectorAll(".ob-goal-card").forEach(el => el.classList.remove("selected"));
  const card = document.querySelector(`.ob-goal-card[onclick*="'${value}'"]`);
  if (card) card.classList.add("selected");
  document.getElementById("onboarding-val-msg").textContent = "";
}

function buildOBExperience() {
  const levels = [
    { value: "beginner",     label: "Beginner",     desc: "New to structured training or returning after a long break" },
    { value: "intermediate", label: "Intermediate",  desc: "Consistent training for 6+ months, familiar with basic exercises" },
    { value: "advanced",     label: "Advanced",      desc: "2+ years of structured training, comfortable with complex programming" },
  ];
  return `
    <h2 class="ob-step-title">Experience Level</h2>
    <p class="ob-step-desc">We'll tailor workout complexity and volume to match your experience.</p>
    <div class="ob-level-grid">
      ${levels.map(l => `
        <button class="ob-level-card ${obData.level === l.value ? "selected" : ""}" onclick="obSelectLevel('${l.value}')">
          <span class="ob-level-label">${l.label}</span>
          <span class="ob-level-desc">${l.desc}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function obSelectLevel(value) {
  obData.level = value;
  document.querySelectorAll(".ob-level-card").forEach(el => el.classList.remove("selected"));
  const card = document.querySelector(`.ob-level-card[onclick*="'${value}'"]`);
  if (card) card.classList.add("selected");
  document.getElementById("onboarding-val-msg").textContent = "";
}

function buildOBWorkoutInterests() {
  const interests = [
    { value: "running",    icon: ICONS.run,      label: "Running" },
    { value: "lifting",    icon: ICONS.weights,  label: "Strength" },
    { value: "cycling",    icon: ICONS.bike,     label: "Cycling" },
    { value: "swimming",   icon: ICONS.swim,     label: "Swimming" },
    { value: "hiit",       icon: ICONS.flame,    label: "HIIT" },
    { value: "yoga",       icon: ICONS.yoga,     label: "Yoga / Mobility" },
    { value: "bodyweight", icon: ICONS.activity, label: "Bodyweight" },
  ];
  return `
    <h2 class="ob-step-title">What Types of Workouts Interest You?</h2>
    <p class="ob-step-desc">Select all that apply. This helps us prioritize options in plan building and session suggestions.</p>
    <div class="ob-interest-grid" id="ob-interests">
      ${interests.map(i => `
        <label class="ob-interest-card">
          <input type="checkbox" value="${i.value}" ${obData.workoutInterests.includes(i.value) ? "checked" : ""} />
          <span class="ob-interest-inner">
            <span class="ob-interest-icon">${i.icon}</span>
            <span class="ob-interest-label">${i.label}</span>
          </span>
        </label>
      `).join("")}
    </div>
  `;
}

function buildOBFeatures() {
  return `
    <h2 class="ob-step-title">Features</h2>
    <p class="ob-step-desc">Enable the features you're interested in. You can always change these later in Settings.</p>
    <div class="ob-feature-list">
      <div class="ob-feature-row">
        <div class="ob-feature-info">
          <span class="ob-feature-name">Nutrition Tracking</span>
          <span class="ob-feature-desc">Log meals, get AI suggestions, track macros</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="ob-feat-nutrition" ${obData.nutritionEnabled ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="ob-feature-row">
        <div class="ob-feature-info">
          <span class="ob-feature-name">Fueling During Workouts</span>
          <span class="ob-feature-desc">Get fueling plans for sessions over 60 min</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="ob-feat-fueling" ${obData.fuelingEnabled !== false ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="ob-feature-row">
        <div class="ob-feature-info">
          <span class="ob-feature-name">Hydration Tracking</span>
          <span class="ob-feature-desc">Track daily water intake with smart targets</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="ob-feat-hydration" ${obData.hydrationEnabled ? "checked" : ""} onchange="document.getElementById('ob-hydration-habit-section').style.display=this.checked?'':'none'" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    <div class="ob-hydration-habit" id="ob-hydration-habit-section" style="margin-top:20px${obData.hydrationEnabled ? "" : ";display:none"}"
      <label style="display:block;margin-bottom:8px;font-weight:600;font-size:0.9rem">How's your current hydration habit?</label>
      <div class="ob-radio-group">
        <label class="ob-radio-card">
          <input type="radio" name="ob-hydration-habit" value="rarely" ${obData.hydrationHabit === "rarely" ? "checked" : ""} />
          <span class="ob-radio-inner">
            <span class="ob-radio-label">Rarely</span>
            <span class="ob-radio-desc">I forget to drink water most days</span>
          </span>
        </label>
        <label class="ob-radio-card">
          <input type="radio" name="ob-hydration-habit" value="sometimes" ${obData.hydrationHabit === "sometimes" ? "checked" : ""} />
          <span class="ob-radio-inner">
            <span class="ob-radio-label">Sometimes</span>
            <span class="ob-radio-desc">I drink when I remember</span>
          </span>
        </label>
        <label class="ob-radio-card">
          <input type="radio" name="ob-hydration-habit" value="usually" ${obData.hydrationHabit === "usually" ? "checked" : ""} />
          <span class="ob-radio-inner">
            <span class="ob-radio-label">Usually</span>
            <span class="ob-radio-desc">I stay on top of it most days</span>
          </span>
        </label>
      </div>
    </div>
  `;
}

function buildOBDietary() {
  return `
    <h2 class="ob-step-title">Dietary Preferences</h2>
    <p class="ob-step-desc">Help us tailor meal suggestions and nutrition advice to your needs.</p>
    <div style="margin-bottom:16px">
      <label style="display:block;margin-bottom:8px;font-weight:600;font-size:0.9rem">Dietary Restrictions</label>
      <div class="ob-chip-grid" id="ob-dietary">
        ${ONBOARDING_DIETARY.map(d => `
          <label class="ob-chip">
            <input type="checkbox" value="${d.value}" ${obData.dietaryRestrictions.includes(d.value) ? "checked" : ""}
              ${d.value === "none" ? `onchange="obToggleNoDiet(this)"` : `onchange="obUncheckNone()"`} />
            <span class="ob-chip-label">${d.label}</span>
          </label>
        `).join("")}
      </div>
    </div>
    <div class="form-row">
      <label for="ob-allergies">Allergies</label>
      <input type="text" id="ob-allergies" placeholder="e.g. peanuts, shellfish" value="${escOB(obData.allergies)}" />
    </div>
    <div class="form-row">
      <label for="ob-foods-love">Foods You Love</label>
      <input type="text" id="ob-foods-love" placeholder="e.g. chicken, rice, broccoli" value="${escOB(obData.foodsLove)}" />
    </div>
    <div class="form-row">
      <label for="ob-foods-avoid">Foods to Avoid</label>
      <input type="text" id="ob-foods-avoid" placeholder="e.g. liver, tofu" value="${escOB(obData.foodsAvoid)}" />
    </div>
  `;
}

function obToggleNoDiet(el) {
  if (el.checked) {
    document.querySelectorAll('#ob-dietary input[type="checkbox"]').forEach(cb => {
      if (cb !== el) cb.checked = false;
    });
  }
}

function obUncheckNone() {
  const none = document.querySelector('#ob-dietary input[value="none"]');
  if (none) none.checked = false;
}

function buildOBSummary() {
  const goalLabel = ONBOARDING_GOALS.find(g => g.value === obData.goal)?.label || obData.goal;
  const levelLabel = obData.level ? obData.level.charAt(0).toUpperCase() + obData.level.slice(1) : "—";

  const interestLabels = {
    running: "Running", lifting: "Strength", cycling: "Cycling", swimming: "Swimming",
    hiit: "HIIT", yoga: "Yoga / Mobility", bodyweight: "Bodyweight",
  };
  const interestsList = obData.workoutInterests.map(v => interestLabels[v] || v).join(", ") || "None";

  let dietaryText = "None";
  if (obData.dietaryRestrictions.length && !obData.dietaryRestrictions.includes("none")) {
    dietaryText = obData.dietaryRestrictions.map(d => ONBOARDING_DIETARY.find(x => x.value === d)?.label || d).join(", ");
  }

  return `
    <div class="ob-welcome">
      <h1 class="ob-title">You're All Set${obData.name ? `, ${escOB(obData.name)}` : ""}!</h1>
      <p class="ob-subtitle">Here's your profile. What would you like to do next?</p>
    </div>
    <div class="ob-summary-card" style="margin-top:16px">
      <div class="ob-summary-row"><span class="ob-summary-label">Goal</span><span>${goalLabel}</span></div>
      <div class="ob-summary-row"><span class="ob-summary-label">Level</span><span>${levelLabel}</span></div>
      <div class="ob-summary-row"><span class="ob-summary-label">Interests</span><span>${interestsList}</span></div>
      ${obData.nutritionEnabled ? `<div class="ob-summary-row"><span class="ob-summary-label">Dietary</span><span>${dietaryText}</span></div>` : ""}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px">
      <button class="btn-primary" style="width:100%;padding:14px" onclick="finishOnboarding(true)">Build a Plan</button>
      <button class="btn-secondary" style="width:100%;padding:14px" onclick="finishOnboarding(false)">Just Explore IronZ</button>
    </div>
  `;
}

// ── 7-Day Starter Plan Generation ────────────────────────────────────────────

/**
 * Maps onboarding data to a 7-day workout schedule.
 * Uses user's goal, level, interests, days/week, and session length.
 * Returns array of schedule entries in the workoutSchedule format.
 */
function generateOnboardingPlan() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Start from tomorrow (give user today to settle in)
  const start = new Date(today);
  start.setDate(start.getDate() + 1);

  const entries = [];
  const days = obData.daysPerWeek || 4;
  const interests = obData.workoutInterests.length ? obData.workoutInterests : ["lifting", "running"];
  const goal = obData.goal || "general";
  const level = obData.level || "beginner";
  const sessionMin = obData.sessionLength || 45;

  // Determine which days of the 7-day window are training vs rest
  // Spread training days evenly across the week
  const trainingDays = [];
  if (days >= 7) {
    for (let i = 0; i < 7; i++) trainingDays.push(i);
  } else {
    const gap = 7 / days;
    for (let i = 0; i < days; i++) {
      trainingDays.push(Math.round(i * gap) % 7);
    }
  }

  // Session templates based on goal + interests
  const sessionPool = buildSessionPool(goal, level, interests, sessionMin);

  for (let d = 0; d < 7; d++) {
    const date = new Date(start);
    date.setDate(start.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);

    if (!trainingDays.includes(d)) continue;

    const session = sessionPool[entries.length % sessionPool.length];
    entries.push({
      id: `onboarding-${dateStr}-${session.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: dateStr,
      type: session.type,
      sessionName: session.name,
      source: "onboarding",
      level: level,
      details: session.details,
      duration: sessionMin,
    });
  }

  return entries;
}

function buildSessionPool(goal, level, interests, sessionMin) {
  const pool = [];

  // Goal-driven session templates
  const goalSessions = {
    strength: [
      { type: "strength", name: "Upper Body Strength", details: "Compound lifts focusing on chest, shoulders, and back" },
      { type: "strength", name: "Lower Body Strength", details: "Squats, deadlifts, and leg accessories" },
      { type: "strength", name: "Push Day", details: "Chest, shoulders, and triceps" },
      { type: "strength", name: "Pull Day", details: "Back, biceps, and rear delts" },
    ],
    endurance: [
      { type: "run", name: "Easy Run", details: `${sessionMin} min at conversational pace` },
      { type: "run", name: "Tempo Run", details: `Warm up, ${Math.round(sessionMin * 0.6)} min at tempo, cool down` },
      { type: "run", name: "Long Run", details: `${sessionMin + 15} min at easy pace — build base` },
      { type: "strength", name: "Cross-Training", details: "Light strength work for injury prevention" },
    ],
    weight: [
      { type: "hiit", name: "HIIT Circuit", details: `${Math.floor(sessionMin / 5)} rounds of high-intensity intervals` },
      { type: "strength", name: "Full Body Strength", details: "Compound movements for metabolic boost" },
      { type: "run", name: "Cardio Session", details: `${sessionMin} min moderate cardio — run, bike, or row` },
      { type: "strength", name: "Upper Body + Core", details: "Strength circuits with core finisher" },
    ],
    speed: [
      { type: "run", name: "Interval Training", details: `Warm up, speed intervals, cool down` },
      { type: "run", name: "Tempo Run", details: `${sessionMin} min with sustained tempo block` },
      { type: "strength", name: "Power & Plyometrics", details: "Explosive movements for speed development" },
      { type: "run", name: "Easy Run", details: `${sessionMin} min recovery pace` },
    ],
    general: [
      { type: "strength", name: "Full Body Strength", details: "Balanced compound and accessory work" },
      { type: "run", name: "Cardio Session", details: `${sessionMin} min moderate effort` },
      { type: "hiit", name: "HIIT & Core", details: "High-intensity intervals with core work" },
      { type: "yoga", name: "Mobility & Recovery", details: "Stretching, foam rolling, and yoga flow" },
    ],
  };

  // Start with goal-driven sessions
  const baseSessions = goalSessions[goal] || goalSessions.general;
  pool.push(...baseSessions);

  // Mix in user's specific interests that aren't already covered
  const coveredTypes = new Set(pool.map(s => s.type));
  const interestSessions = {
    running:    { type: "run", name: "Run", details: `${sessionMin} min run` },
    cycling:    { type: "bike", name: "Cycling", details: `${sessionMin} min ride` },
    swimming:   { type: "swim", name: "Swim Session", details: `${sessionMin} min swim` },
    hiit:       { type: "hiit", name: "HIIT Workout", details: `${sessionMin} min HIIT` },
    yoga:       { type: "yoga", name: "Yoga Flow", details: `${sessionMin} min yoga` },
    bodyweight: { type: "bodyweight", name: "Bodyweight Training", details: "No-equipment strength circuit" },
    lifting:    { type: "strength", name: "Strength Training", details: "Progressive overload session" },
  };

  for (const interest of interests) {
    if (interestSessions[interest] && !coveredTypes.has(interestSessions[interest].type)) {
      pool.push(interestSessions[interest]);
      coveredTypes.add(interestSessions[interest].type);
    }
  }

  // Adjust for level
  if (level === "beginner") {
    pool.forEach(s => {
      s.details = s.details + " — start light, focus on form";
    });
  }

  return pool;
}

/**
 * Generates HTML preview of the 7-day plan for the summary screen.
 */
function generateOnboardingWeekPreview() {
  const plan = generateOnboardingPlan();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const start = new Date();
  start.setDate(start.getDate() + 1);

  let html = '<div class="ob-week-days">';
  for (let d = 0; d < 7; d++) {
    const date = new Date(start);
    date.setDate(start.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);
    const dayName = dayNames[date.getDay()];
    const session = plan.find(e => e.date === dateStr);

    if (session) {
      html += `
        <div class="ob-week-day ob-week-day--active">
          <span class="ob-week-day-name">${dayName}</span>
          <span class="ob-week-day-icon">${getSessionIcon(session.type)}</span>
          <span class="ob-week-day-label">${escOB(session.sessionName)}</span>
        </div>`;
    } else {
      html += `
        <div class="ob-week-day ob-week-day--rest">
          <span class="ob-week-day-name">${dayName}</span>
          <span class="ob-week-day-icon">&#128164;</span>
          <span class="ob-week-day-label">Rest</span>
        </div>`;
    }
  }
  html += '</div>';

  // Nutrition + hydration summary
  if (obData.nutritionEnabled || obData.hydrationEnabled) {
    html += '<div class="ob-week-extras">';
    if (obData.nutritionEnabled) {
      html += '<div class="ob-week-extra">Nutrition targets calculated from your profile</div>';
    }
    if (obData.hydrationEnabled) {
      const hydTarget = obData.weight ? Math.round(obData.weight * 0.67) : 96;
      html += `<div class="ob-week-extra">Hydration goal: ${hydTarget} oz/day</div>`;
    }
    html += '</div>';
  }

  return html;
}

function getSessionIcon(type) {
  const icons = {
    run: typeof ICONS !== "undefined" ? ICONS.run : "&#127939;",
    strength: typeof ICONS !== "undefined" ? ICONS.weights : "&#127947;",
    bike: typeof ICONS !== "undefined" ? ICONS.bike : "&#128690;",
    swim: typeof ICONS !== "undefined" ? ICONS.swim : "&#127946;",
    hiit: typeof ICONS !== "undefined" ? ICONS.flame : "&#128293;",
    yoga: typeof ICONS !== "undefined" ? ICONS.yoga : "&#129496;",
    bodyweight: typeof ICONS !== "undefined" ? ICONS.activity : "&#128170;",
  };
  return icons[type] || icons.strength;
}

// ── Finish Onboarding ─────────────────────────────────────────────────────────

function finishOnboarding(buildPlan) {
  // 0. Save measurement system preference
  if (typeof setMeasurementSystem === "function") {
    setMeasurementSystem(obData.units || "imperial");
  } else {
    localStorage.setItem("measurementSystem", obData.units || "imperial"); if (typeof DB !== 'undefined') DB.syncKey('measurementSystem');
  }

  // 1. Save profile to localStorage — always in imperial for internal consistency
  let profileWeight = obData.weight;
  let profileHeight = obData.height;
  if (obData.units === "metric") {
    if (profileWeight) profileWeight = String(Math.round(parseFloat(profileWeight) * 2.20462));
    if (profileHeight) profileHeight = String(Math.round(parseFloat(profileHeight) / 2.54));
  }
  const profile = {
    name: obData.name,
    birthday: obData.birthday,
    age: obData.birthday ? String(_calcAgeFromBirthday(obData.birthday)) : obData.age,
    weight: profileWeight,
    height: profileHeight,
    gender: obData.gender,
    goal: obData.goal,
  };
  localStorage.setItem("profile", JSON.stringify(profile));
  if (typeof DB !== 'undefined') DB.profile.save(profile).catch(() => {});

  // 2. Save onboarding-specific data
  const onboardingData = {
    level: obData.level,
    daysPerWeek: obData.daysPerWeek,
    workoutInterests: obData.workoutInterests,
    hydrationHabit: obData.hydrationHabit,
    nutritionEnabled: obData.nutritionEnabled,
    hydrationEnabled: obData.hydrationEnabled,
    dietaryRestrictions: obData.dietaryRestrictions,
    allergies: obData.allergies,
  };
  localStorage.setItem("onboardingData", JSON.stringify(onboardingData));

  // 3. Apply feature toggles
  setNutritionEnabled(obData.nutritionEnabled);
  localStorage.setItem("hydrationEnabled", obData.hydrationEnabled ? "1" : "0"); if (typeof DB !== 'undefined') DB.syncKey('hydrationEnabled');
  localStorage.setItem("fuelingEnabled", obData.fuelingEnabled !== false ? "1" : "0"); if (typeof DB !== 'undefined') DB.syncKey('fuelingEnabled');

  // 4. Save food preferences if nutrition enabled
  if (obData.nutritionEnabled) {
    const likes = obData.foodsLove ? obData.foodsLove.split(",").map(s => s.trim()).filter(Boolean) : [];
    const dislikes = obData.foodsAvoid ? obData.foodsAvoid.split(",").map(s => s.trim()).filter(Boolean) : [];
    const existing = JSON.parse(localStorage.getItem("foodPreferences") || '{"likes":[],"dislikes":[]}');
    // Dedup likes (plain strings)
    existing.likes = [...new Set([...existing.likes, ...likes])];
    // Dedup dislikes: handle mixed formats (strings and {name, isAllergy} objects)
    const existingNames = existing.dislikes.map(d => typeof d === "string" ? d.toLowerCase() : (d.name || "").toLowerCase());
    dislikes.forEach(term => {
      if (!existingNames.includes(term.toLowerCase())) {
        existing.dislikes.push(term);
        existingNames.push(term.toLowerCase());
      }
    });

    // Add allergies as {name, isAllergy: true} objects so they're flagged for filtering
    const allergies = obData.allergies ? obData.allergies.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];
    allergies.forEach(term => {
      if (!existingNames.includes(term.toLowerCase())) {
        existing.dislikes.push({ name: term, isAllergy: true });
        existingNames.push(term.toLowerCase());
      }
    });

    localStorage.setItem("foodPreferences", JSON.stringify(existing)); if (typeof DB !== 'undefined') DB.syncKey('foodPreferences');
  }

  // 5. Set hydration target based on body weight and habit
  if (obData.hydrationEnabled && obData.weight) {
    const baseOz = Math.round(parseFloat(obData.weight) * 0.67);
    const habitMultiplier = { rarely: 0.8, sometimes: 1.0, usually: 1.1 };
    const targetOz = Math.round(baseOz * (habitMultiplier[obData.hydrationHabit] || 1.0));
    localStorage.setItem("hydrationDailyTargetOz", String(targetOz)); if (typeof DB !== 'undefined') DB.syncKey('hydrationDailyTargetOz');
  }

  // 6. Mark onboarding complete
  localStorage.setItem("hasOnboarded", "1");
  if (typeof DB !== 'undefined') DB.syncKey('hasOnboarded');

  // 7. Close overlay
  closeOnboarding();

  // 8. Refresh UI with new data
  if (typeof loadProfileIntoForm === "function") loadProfileIntoForm();
  if (typeof updateNavInitials === "function") updateNavInitials();
  if (typeof renderGreeting === "function") renderGreeting();
  if (typeof applyNutritionToggle === "function") applyNutritionToggle();
  if (typeof renderFoodPreferences === "function") renderFoodPreferences();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof selectDay === "function") selectDay(getTodayString());
  if (typeof initHydration === "function") initHydration();

  // 9. Route based on user choice
  if (buildPlan) {
    // Open the Build a Plan survey
    if (typeof openSurvey === "function") {
      openSurvey();
    } else {
      if (typeof showTab === "function") showTab("training");
    }
  } else {
    // Just explore — mark survey as skipped so it doesn't re-open on refresh
    localStorage.setItem("surveyComplete", "skipped");
    if (typeof DB !== 'undefined') DB.syncKey('surveyComplete');
    // Land on home tab
    if (typeof showTab === "function") showTab("home");
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _calcAgeFromBirthday(dateStr) {
  if (!dateStr) return 0;
  const birth = new Date(dateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function escOB(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
