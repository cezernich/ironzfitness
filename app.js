// app.js — General app initialization and tab navigation

/* =====================================================================
   COLLAPSIBLE SECTIONS
   ===================================================================== */

function toggleSection(id) {
  const section = document.getElementById(id);
  if (section) section.classList.toggle("is-collapsed");
}

/* =====================================================================
   BUILD-A-PLAN SUB-TABS
   ===================================================================== */

function switchBuildPlanTab(tabName) {
  document.querySelectorAll('.build-plan-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.build-plan-tab').forEach(b => b.classList.remove('build-plan-tab--active'));
  const panel = document.getElementById('bp-panel-' + tabName);
  if (panel) panel.style.display = '';
  const btn = document.querySelector('.build-plan-tab[data-bptab="' + tabName + '"]');
  if (btn) btn.classList.add('build-plan-tab--active');
}

function openBuildPlanTab(tabName) {
  const wrapper = document.getElementById('section-build-plan');
  if (wrapper) wrapper.classList.remove('is-collapsed');
  switchBuildPlanTab(tabName);
  if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* =====================================================================
   TAB NAVIGATION
   ===================================================================== */

function showTab(name) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-circle[data-tab]").forEach(btn => btn.classList.remove("active"));

  const tabEl = document.getElementById(`tab-${name}`);
  if (tabEl) tabEl.classList.add("active");

  const navBtn = document.querySelector(`.nav-circle[data-tab="${name}"]`);
  if (navBtn) navBtn.classList.add("active");

  localStorage.setItem("activeTab", name);

  // Refresh calendar + today panel when returning home — always jump to today
  if (name === "home") {
    if (typeof currentWeekStart !== "undefined" && typeof getWeekStart === "function") {
      currentWeekStart = getWeekStart(new Date());
    }
    if (typeof selectDay === "function") {
      selectDay(getTodayString());
    } else {
      renderCalendar();
    }
    if (typeof renderHydration === "function") renderHydration();
  }

  // Refresh race list when opening Training tab
  if (name === "training") {
    renderRaceEvents();
    if (typeof renderGoals === "function") renderGoals();
    if (typeof renderTrainingConflicts === "function") renderTrainingConflicts();
    if (typeof renderZones === "function") renderZones();
    if (typeof initCustomPlan === "function") initCustomPlan();
  }

  // Load profile values when opening settings
  if (name === "settings") {
    loadProfileIntoForm();
    updateStorageDisplay();
    renderRunningZones();
    if (typeof renderThemePicker === "function") renderThemePicker();
    applyNutritionToggle();
    applyMeasurementToggle();
    if (typeof renderNotifSettings === "function") renderNotifSettings();
    if (typeof renderTrustCenter === "function") renderTrustCenter();
    if (typeof renderSubscriptionStatus === "function") renderSubscriptionStatus();
    if (typeof renderStravaStatus === "function") renderStravaStatus();
  }

  // Refresh nutrition dashboard when opening Nutrition tab
  if (name === "nutrition") {
    if (typeof initNutritionDashboard === "function") initNutritionDashboard();
    if (typeof renderWeekMealPlanner === "function") renderWeekMealPlanner();
  }

  // Render stats when opening Stats tab
  if (name === "stats") {
    renderStats();
    if (typeof renderLevelProgress === "function") renderLevelProgress();
  }

  // Render saved workouts list
  if (name === "saved-workouts") {
    if (typeof renderSavedWorkouts === "function") renderSavedWorkouts();
  }

  // Render community workouts + challenges
  if (name === "community") {
    if (typeof renderCommunityWorkouts === "function") renderCommunityWorkouts();
    if (typeof renderChallenges === "function") renderChallenges();
  }
}

/* =====================================================================
   STATS TAB VIEW SWITCHER
   ===================================================================== */

function selectStatsView(view) {
  const statsEl   = document.getElementById("stats-view-stats");
  const histEl    = document.getElementById("stats-view-history");
  const statsBtn  = document.getElementById("stats-view-btn-stats");
  const histBtn   = document.getElementById("stats-view-btn-history");
  if (!statsEl || !histEl) return;

  if (view === "history") {
    statsEl.style.display  = "none";
    histEl.style.display   = "";
    statsBtn.classList.remove("is-active");
    histBtn.classList.add("is-active");
    if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
  } else {
    histEl.style.display   = "none";
    statsEl.style.display  = "";
    histBtn.classList.remove("is-active");
    statsBtn.classList.add("is-active");
    renderStats();
  }
}

/* =====================================================================
   PROFILE DROPDOWN NAV
   ===================================================================== */

function getNavInitials() {
  try {
    const profile = JSON.parse(localStorage.getItem("profile")) || {};
    const name = (profile.name || "").trim();
    if (!name) return "?";
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  } catch { return "?"; }
}

function updateNavInitials() {
  const el = document.getElementById("nav-initials");
  if (el) el.textContent = getNavInitials();
}

function toggleProfileDropdown() {
  const dd = document.getElementById("nav-profile-dropdown");
  if (!dd) return;
  const isOpen = dd.classList.contains("is-open");
  dd.classList.toggle("is-open", !isOpen);
}

function closeProfileDropdown() {
  const dd = document.getElementById("nav-profile-dropdown");
  if (dd) dd.classList.remove("is-open");
}

const SUPPORT_EMAIL = "ironzsupport@gmail.com";

function openSupportEmail() {
  const profile = JSON.parse(localStorage.getItem("profile") || "{}");
  const name    = profile.full_name || "";
  const subject = encodeURIComponent("IronZ Support Request");
  const body    = encodeURIComponent(`Hi IronZ Support,\n\n[Please describe your issue here]\n\n---\nName: ${name}`);
  window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

// Close dropdown when clicking outside
document.addEventListener("click", function(e) {
  const wrap = document.getElementById("nav-profile-wrap") ||
               e.target.closest?.(".nav-profile-wrap");
  if (!e.target.closest || !e.target.closest(".nav-profile-wrap")) {
    closeProfileDropdown();
  }
});


/* =====================================================================
   NUTRITION TOGGLE
   ===================================================================== */

function isNutritionEnabled() {
  return localStorage.getItem("nutritionEnabled") !== "0";
}

function setNutritionEnabled(enabled) {
  localStorage.setItem("nutritionEnabled", enabled ? "1" : "0");
  applyNutritionToggle();
  // Re-render day detail if open so nutrition sections appear/disappear immediately
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }
}

function applyNutritionToggle() {
  const enabled = isNutritionEnabled();
  const navBtn         = document.getElementById("nav-nutrition-btn");
  const summarySection = document.getElementById("section-todays-summary");
  const toggle         = document.getElementById("pref-nutrition-toggle");
  if (navBtn)         navBtn.style.display         = enabled ? "" : "none";
  if (summarySection) summarySection.style.display  = enabled ? "" : "none";
  if (toggle)         toggle.checked               = enabled;
}

function getMeasurementSystem() {
  return localStorage.getItem("measurementSystem") || "imperial";
}
function getDistanceUnit() {
  return getMeasurementSystem() === "metric" ? "km" : "mi";
}
function setMeasurementSystem(system) {
  localStorage.setItem("measurementSystem", system);
  applyMeasurementToggle();
}
function applyMeasurementToggle() {
  const sel = document.getElementById("pref-measurement-select");
  if (sel) sel.value = getMeasurementSystem();
}

/* =====================================================================
   INITIALIZATION
   ===================================================================== */

// Remove orphaned completion records at startup:
// 1. isCompletion workouts with no matching completedSessions entry
// 2. isCompletion workouts whose completedSessionId points to a session that no longer exists
// 3. completedSessions entries whose source session no longer exists
function cleanupOrphanedCompletions() {
  try {
    const meta = JSON.parse(localStorage.getItem("completedSessions") || "{}");
    const validWorkoutIds = new Set(Object.values(meta).map(e => String(e.workoutId)));

    // Build set of existing session IDs (scheduled + plan)
    const scheduled = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
    const plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]");
    const existingSessionIds = new Set();
    scheduled.forEach(s => existingSessionIds.add(`session-sw-${s.id}`));
    plan.forEach(p => existingSessionIds.add(`session-plan-${p.date}-${p.raceId}`));
    // Logged workouts are also valid completion targets
    const logged = JSON.parse(localStorage.getItem("workouts") || "[]");
    logged.forEach(w => { if (!w.isCompletion) existingSessionIds.add(`session-log-${w.id}`); });

    let workouts = JSON.parse(localStorage.getItem("workouts") || "[]");
    const before = workouts.length;
    const removedIds = [];
    workouts = workouts.filter(w => {
      if (!w.isCompletion) return true;
      // Remove if no matching completedSessions entry
      if (!validWorkoutIds.has(String(w.id))) { removedIds.push(String(w.id)); return false; }
      // Remove if the source session no longer exists
      if (w.completedSessionId && !existingSessionIds.has(w.completedSessionId)) { removedIds.push(String(w.id)); return false; }
      return true;
    });
    if (workouts.length !== before) {
      localStorage.setItem("workouts", JSON.stringify(workouts));
    }

    // Clean up ratings for removed workout IDs
    if (removedIds.length) {
      try {
        const ratings = JSON.parse(localStorage.getItem("workoutRatings") || "{}");
        let ratingsChanged = false;
        for (const id of removedIds) {
          if (ratings[id]) { delete ratings[id]; ratingsChanged = true; }
        }
        if (ratingsChanged) localStorage.setItem("workoutRatings", JSON.stringify(ratings));
      } catch {}
    }

    // Also clean up completedSessions entries for sessions that no longer exist
    let metaChanged = false;
    for (const sessionId of Object.keys(meta)) {
      if (!existingSessionIds.has(sessionId)) {
        delete meta[sessionId];
        metaChanged = true;
      }
    }
    if (metaChanged) {
      localStorage.setItem("completedSessions", JSON.stringify(meta));
    }
  } catch {}
}

function init() {
  cleanupOrphanedCompletions();
  const today = getTodayString();
  document.getElementById("log-date").value  = today;
  document.getElementById("meal-date").value = today;

  // Default plan start date to next Monday (or today if today is Monday)
  const planStartEl = document.getElementById("plan-start-date");
  if (planStartEl) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay(); // 0=Sun, 1=Mon
    const daysToMon = dow === 1 ? 0 : (dow === 0 ? 1 : 8 - dow);
    d.setDate(d.getDate() + daysToMon);
    planStartEl.value = d.toISOString().slice(0, 10);
  }

  // Default life training start date to next Monday
  const ltStartEl = document.getElementById("life-start-date");
  if (ltStartEl) {
    const lt = new Date();
    lt.setHours(0, 0, 0, 0);
    const ltDow = lt.getDay();
    const ltDaysToMon = ltDow === 1 ? 0 : (ltDow === 0 ? 1 : 8 - ltDow);
    lt.setDate(lt.getDate() + ltDaysToMon);
    ltStartEl.value = lt.toISOString().slice(0, 10);
  }

  // Default custom plan start date to next Monday
  const cpStartEl = document.getElementById("custom-plan-start");
  if (cpStartEl) {
    const cp = new Date();
    cp.setHours(0, 0, 0, 0);
    const cpDow = cp.getDay();
    const cpDaysToMon = cpDow === 1 ? 0 : (cpDow === 0 ? 1 : 8 - cpDow);
    cp.setDate(cp.getDate() + cpDaysToMon);
    cpStartEl.value = cp.toISOString().slice(0, 10);
    const importStartEl = document.getElementById("import-start-date");
    if (importStartEl) importStartEl.value = cp.toISOString().slice(0, 10);
  }

  // Initialize strength plan split preview
  if (typeof updateSplitPreview === "function") updateSplitPreview();

  addExerciseRow();
  addLogSegmentRow();

  // Log a Workout: only allow past dates (missed workouts)
  const logDateEl = document.getElementById("log-date");
  if (logDateEl) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    logDateEl.max = yesterday.toISOString().slice(0, 10);
  }

  if (typeof renderRaceForm === "function") renderRaceForm();
  if (typeof initGymStrengthToggle === "function") initGymStrengthToggle();
  if (typeof renderThemePicker === "function") renderThemePicker();

  applyNutritionToggle();
  applyMeasurementToggle();
  if (typeof initHydration === "function") initHydration();
  renderWorkoutHistory();
  if (isNutritionEnabled()) renderTodaysSummary();
  if (isNutritionEnabled()) renderNutritionHistory();
  renderFoodPreferences();
  updateNavInitials();
  renderGreeting();
  if (typeof renderTrainingConflicts === "function") renderTrainingConflicts();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
  if (typeof renderAvoidedExercisesList === "function") renderAvoidedExercisesList();
  if (typeof renderWeekMealPlanner === "function") renderWeekMealPlanner();

  // Home tab: render calendar then auto-show today's plan
  renderCalendar();
  selectDay(today); // pre-populate today's workout + nutrition panel

  // Restore last active tab (default to "home")
  const savedTab = localStorage.getItem("activeTab") || "home";
  showTab(savedTab);

  // Check for level-up on app start
  if (typeof checkLevelUp === "function") checkLevelUp();

  // Show onboarding wizard on first visit, or Build Plan survey if onboarded but no plan
  if (!localStorage.getItem("hasOnboarded")) {
    setTimeout(showOnboarding, 400);
  } else if (!localStorage.getItem("surveyComplete")) {
    setTimeout(openSurvey, 400);
  }

  // Weekly check-in prompt (Sunday)
  if (typeof shouldShowWeeklyCheckin === "function" && shouldShowWeeklyCheckin()) {
    setTimeout(openWeeklyCheckin, 800);
  }

  // Initialize notification timers
  if (typeof initNotificationTimers === "function") initNotificationTimers();

  // Check for Strava OAuth callback
  if (typeof handleStravaCallback === "function") handleStravaCallback();

  // Show API key status
  loadApiKeyStatus();
}

window.onload = init;


/* =====================================================================
   SETTINGS — PROFILE
   ===================================================================== */

function saveProfile() {
  const profile = {
    name:   document.getElementById("profile-name").value.trim(),
    age:    document.getElementById("profile-age").value,
    weight: document.getElementById("profile-weight").value,
    height: document.getElementById("profile-height").value,
    gender: document.getElementById("profile-gender").value,
    goal:   document.getElementById("profile-goal").value,
  };
  localStorage.setItem("profile", JSON.stringify(profile));
  updateNavInitials();
  renderGreeting();

  const msg = document.getElementById("profile-save-msg");
  msg.style.color = "var(--color-success)";
  msg.textContent = "Profile saved!";
  setTimeout(() => { msg.textContent = ""; }, 3000);
}

function loadProfileIntoForm() {
  try {
    const profile = JSON.parse(localStorage.getItem("profile")) || {};
    if (profile.name)   document.getElementById("profile-name").value   = profile.name;
    if (profile.age)    document.getElementById("profile-age").value    = profile.age;
    if (profile.weight) document.getElementById("profile-weight").value = profile.weight;
    if (profile.height) document.getElementById("profile-height").value = profile.height;
    if (profile.gender) document.getElementById("profile-gender").value = profile.gender;
    if (profile.goal)   document.getElementById("profile-goal").value   = profile.goal;
  } catch { /* ignore */ }
}


/* =====================================================================
   SETTINGS — API KEY
   ===================================================================== */

function saveApiKey() {
  const input = document.getElementById("setting-api-key");
  const msg = document.getElementById("api-key-msg");
  const key = (input?.value || "").trim();
  if (!key || !key.startsWith("sk-")) {
    msg.style.color = "var(--color-danger)";
    msg.textContent = "Please enter a valid API key (starts with sk-).";
    setTimeout(() => { msg.textContent = ""; }, 3000);
    return;
  }
  localStorage.setItem("anthropicApiKey", key);
  input.value = "";
  msg.style.color = "var(--color-success)";
  msg.textContent = "API key saved! AI features are now enabled.";
  setTimeout(() => { msg.textContent = ""; }, 3000);
}

function clearApiKey() {
  localStorage.removeItem("anthropicApiKey");
  document.getElementById("setting-api-key").value = "";
  const msg = document.getElementById("api-key-msg");
  msg.style.color = "var(--color-text-muted)";
  msg.textContent = "API key removed.";
  setTimeout(() => { msg.textContent = ""; }, 3000);
}

function loadApiKeyStatus() {
  const key = localStorage.getItem("anthropicApiKey");
  if (key) {
    const msg = document.getElementById("api-key-msg");
    if (msg) {
      msg.style.color = "var(--color-success)";
      msg.textContent = "Key saved (sk-..." + key.slice(-4) + ")";
    }
  }
}


/* =====================================================================
   SETTINGS — DATA MANAGEMENT
   ===================================================================== */

function _refreshAllViews() {
  if (typeof renderRaceForm       === "function") renderRaceForm();
  if (typeof renderRaceEvents     === "function") renderRaceEvents();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
  if (typeof renderTrainingConflicts === "function") renderTrainingConflicts();
  if (typeof renderCalendar       === "function") renderCalendar();
  if (typeof selectDay            === "function") selectDay(getTodayString());
  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
  if (typeof isNutritionEnabled === "function" && isNutritionEnabled() && typeof renderTodaysSummary === "function") renderTodaysSummary();
  if (typeof isNutritionEnabled === "function" && isNutritionEnabled() && typeof renderNutritionHistory === "function") renderNutritionHistory();
  if (typeof renderFoodPreferences  === "function") renderFoodPreferences();
  if (typeof renderZones          === "function") renderZones();
  if (typeof renderGreeting       === "function") renderGreeting();
  updateStorageDisplay();
}

function clearFutureWorkouts() {
  const today = getTodayString();
  const todayCompleted = typeof hasAnyCompletedSession === "function" && hasAnyCompletedSession(today);
  const cutoff = todayCompleted ? today : (() => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() - 1); return localDateStr(d); })();
  const label = todayCompleted ? "tomorrow" : "today";

  if (!confirm(`Remove all scheduled workouts from ${label} onward? This cannot be undone.`)) return;

  // workoutSchedule — keep up to cutoff
  try {
    const ws = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
    localStorage.setItem("workoutSchedule", JSON.stringify(ws.filter(w => w.date <= cutoff)));
  } catch {}

  // trainingPlan — keep up to cutoff
  try {
    const tp = JSON.parse(localStorage.getItem("trainingPlan") || "[]");
    localStorage.setItem("trainingPlan", JSON.stringify(tp.filter(p => p.date <= cutoff)));
  } catch {}

  _refreshAllViews();
  showClearMsg("Future workouts removed.");
}

function clearRacesAndPlan() {
  if (!confirm("Delete all races and training plans? This cannot be undone.")) return;
  ["events", "trainingPlan", "workoutSchedule"].forEach(k => localStorage.removeItem(k));
  if (typeof initGymStrengthToggle === "function") initGymStrengthToggle();
  _refreshAllViews();
  showClearMsg("Races and training plan cleared.");
}

function clearAllData() {
  if (!confirm("Delete ALL data (workouts, meals, races, profile)? This cannot be undone.")) return;
  ["workouts", "meals", "events", "trainingPlan", "workoutSchedule", "trainingNotes",
   "profile", "foodPreferences", "nutritionAdjustments", "surveyComplete",
   "gymStrengthEnabled", "dayRestrictions", "personalRecords", "runningZones", "trainingZones",
   "hasOnboarded", "onboardingData", "hydrationEnabled", "nutritionEnabled",
   "hydrationLog", "hydrationSettings", "hydrationDailyTargetOz", "userLevel",
   "checkinHistory", "completedSessions", "savedWorkouts", "workoutRatings",
   "trainingPreferences", "commHiddenIds", "userSharedWorkouts", "importedPlans",
   "calendarSync", "_calPkceVerifier", "equipmentRestrictions", "yogaTypes",
   "fitnessGoals", "uxLevelOverride", "measurementSystem", "activeTab",
   "theme", "notifSettings", "notifLog", "adherenceDismissed",
   "subscription", "recentScans", "stravaAuth", "stravaLastSync",
   "stravaOauthState", "savedMealPlans", "activeChallenges",
   "completedChallenges"].forEach(k => localStorage.removeItem(k));
  if (typeof initGymStrengthToggle === "function") initGymStrengthToggle();
  loadProfileIntoForm();
  _refreshAllViews();
  showClearMsg("All data cleared.");
}

function showClearMsg(text) {
  const msg = document.getElementById("settings-clear-msg");
  if (!msg) return;
  msg.style.color = "var(--color-success)";
  msg.textContent = text;
  setTimeout(() => { msg.textContent = ""; }, 3000);
}

function updateStorageDisplay() {
  try {
    let bytes = 0;
    for (const key of Object.keys(localStorage)) {
      bytes += (localStorage.getItem(key) || "").length * 2; // UTF-16
    }
    const kb = (bytes / 1024).toFixed(1);
    document.getElementById("storage-size").textContent = `${kb} KB used`;
  } catch { /* ignore */ }
}


/* =====================================================================
   DAILY GREETING
   ===================================================================== */

const DAILY_GREETINGS = [
  "Let's get after it",
  "Time to put in the work",
  "Ready to crush today",
  "Let's make today count",
  "Champions are built on days like this",
  "Your best session is ahead of you",
  "Let's build something great today",
  "Another day, another chance to improve",
  "Keep showing up — it pays off",
  "Do the work today, feel it tomorrow",
  "Every rep and every mile matters",
  "Push a little further today",
  "Consistency beats perfection",
  "No days off from becoming better",
  "You've got this",
  "Trust the process",
  "Today's effort is tomorrow's result",
  "Let's earn it today",
  "Good things come to those who train",
  "A little progress every day adds up",
  "Show up, work hard, repeat",
  "Let's go make it happen",
];

function renderGreeting() {
  const el = document.getElementById("home-greeting");
  if (!el) return;

  let name = "";
  try {
    const profile = JSON.parse(localStorage.getItem("profile")) || {};
    if (profile.name) name = `, ${profile.name}`;
  } catch { /* ignore */ }

  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const msg = DAILY_GREETINGS[dayOfYear % DAILY_GREETINGS.length];

  let greetingHtml = `<span>${escHtml(msg + name + ".")}</span>`;
  if (typeof buildConsistencyBadge === "function") {
    greetingHtml += buildConsistencyBadge();
  }
  el.innerHTML = greetingHtml;
}


/* =====================================================================
   SETTINGS — TRAINING ZONES (Running · Biking · Swimming)
   ===================================================================== */

let _activeZonesSport = "running";

// ── Running: Jack Daniels VDOT method ─────────────────────────────────────────
const ZONE_CONFIG = [
  { num: 1, name: "Recovery",  pcts: [0.59, 0.64], desc: "Warmup · Cooldown · Very easy miles" },
  { num: 2, name: "Easy",      pcts: [0.65, 0.74], desc: "Base miles · Aerobic development" },
  { num: 3, name: "Tempo",     pcts: [0.83, 0.88], desc: "Comfortably hard · RPE 6–7" },
  { num: 4, name: "Threshold", pcts: [0.95, 1.00], desc: "Hard intervals · RPE 8" },
  { num: 5, name: "Speed",     pcts: [1.05, 1.15], desc: "Short reps · Race-specific" },
];

const ZONE_DISTANCES = {
  "Mile":          1609.344,
  "5K":            5000,
  "10K":           10000,
  "Half Marathon": 21097.5,
  "Marathon":      42195,
};

// ── Biking: FTP-based power zones ─────────────────────────────────────────────
const BIKING_ZONE_CONFIG = [
  { num: 1, name: "Recovery",    ftpPcts: [0,    0.55], desc: "Active recovery · Easy spinning" },
  { num: 2, name: "Endurance",   ftpPcts: [0.55, 0.75], desc: "Aerobic base · All-day effort" },
  { num: 3, name: "Tempo",       ftpPcts: [0.75, 0.90], desc: "Sustained effort · RPE 6–7" },
  { num: 4, name: "Threshold",   ftpPcts: [0.90, 1.05], desc: "Near FTP · RPE 8" },
  { num: 5, name: "VO2 Max",     ftpPcts: [1.05, 1.20], desc: "Hard intervals · RPE 9" },
];

// ── Swimming: CSS / T-Pace method ──────────────────────────────────────────────
// T-Pace = pace you can sustain for ~1500m; zones are multiples of T-Pace (per 100m)
const SWIMMING_ZONE_CONFIG = [
  { num: 1, name: "Recovery",   factor: [1.20, 9.99], desc: "Easy technical work · Warm-up · Cool-down" },
  { num: 2, name: "Endurance",  factor: [1.08, 1.20], desc: "Comfortable aerobic effort" },
  { num: 3, name: "Tempo",      factor: [1.03, 1.08], desc: "Sustained effort · RPE 6–7" },
  { num: 4, name: "Threshold",  factor: [1.00, 1.03], desc: "Near CSS / T-Pace · RPE 8" },
  { num: 5, name: "Race",       factor: [0.90, 1.00], desc: "Race speed · High intensity" },
];

// ── Storage ────────────────────────────────────────────────────────────────────
function loadTrainingZones(sport) {
  try {
    const all = JSON.parse(localStorage.getItem("trainingZones")) || {};
    // Migrate from legacy runningZones key
    if (!all.running) {
      const old = JSON.parse(localStorage.getItem("runningZones"));
      if (old) { all.running = old; localStorage.setItem("trainingZones", JSON.stringify(all)); }
    }
    return all[sport] || null;
  } catch { return null; }
}

function saveTrainingZonesData(sport, data) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem("trainingZones")) || {}; } catch {}
  all[sport] = data;
  localStorage.setItem("trainingZones", JSON.stringify(all));
}

// Keep legacy functions so calendar.js still works
function loadRunningZones() { return loadTrainingZones("running"); }
function saveRunningZonesData(data) { saveTrainingZonesData("running", data); }

/**
 * Computes Z1–Z5 training pace ranges (min/mile) from a race performance
 * using the Jack Daniels VDOT method.
 */
function computeRunningZones(distMeters, totalSeconds) {
  const T   = totalSeconds / 60;
  const v   = distMeters / T;  // m/min
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * T) + 0.2989558 * Math.exp(-0.1932605 * T);
  const vdot = vo2 / pct;

  // Invert the VO2-velocity curve: solve 0.000104v² + 0.182258v − (4.60 + p·VDOT) = 0
  function velocityAt(p) {
    const a = 0.000104, b = 0.182258, c = -(4.60 + p * vdot);
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  }

  function toPacePerMile(vel) { return 1609.344 / vel; }

  function fmt(minPerMile) {
    const m = Math.floor(minPerMile);
    const s = Math.round((minPerMile - m) * 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  const zones = {};
  for (const z of ZONE_CONFIG) {
    // Higher % = faster pace; lower % = slower pace
    const vFast = velocityAt(z.pcts[1]);
    const vSlow = velocityAt(z.pcts[0]);
    zones[`z${z.num}`] = {
      paceRange: `${fmt(toPacePerMile(vFast))}–${fmt(toPacePerMile(vSlow))} /mi`,
    };
  }

  return { vdot: Math.round(vdot * 10) / 10, zones };
}

/** Biking: derives Z1–Z5 watt ranges from FTP */
function computeBikingZones(ftp) {
  const zones = {};
  for (const z of BIKING_ZONE_CONFIG) {
    const lo = Math.round(ftp * z.ftpPcts[0]);
    const hi = z.ftpPcts[1] >= 9 ? null : Math.round(ftp * z.ftpPcts[1]);
    zones[`z${z.num}`] = {
      wattRange: lo === 0 ? `< ${Math.round(ftp * z.ftpPcts[1])} W` :
                 hi === null ? `> ${lo} W` :
                 `${lo}–${hi} W`,
    };
  }
  return { ftp, zones };
}

/** Swimming: derives Z1–Z5 pace ranges (per 100m) from a 400m swim time */
function computeSwimmingZones(swim400Seconds) {
  // T-Pace = 400m time / 4 (seconds per 100m)
  const tPaceSec = swim400Seconds / 4;

  function fmtPace(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  const zones = {};
  for (const z of SWIMMING_ZONE_CONFIG) {
    const fast = tPaceSec * z.factor[0];
    const slow = z.factor[1] >= 9 ? null : tPaceSec * z.factor[1];
    zones[`z${z.num}`] = {
      paceRange: slow === null
        ? `> ${fmtPace(fast)} /100m`
        : `${fmtPace(fast)}–${fmtPace(slow)} /100m`,
    };
  }
  return { tPaceSec, zones };
}

function selectZonesSport(sport) {
  _activeZonesSport = sport;
  renderZones();
}

function renderRunningZones() { renderZones(); } // legacy alias

function renderZones() {
  const el = document.getElementById("zones-content");
  if (!el) return;

  const sport = _activeZonesSport;
  const sportLabels = { running: "Running", biking: "Biking", swimming: "Swimming", strength: "Strength" };

  const tabs = ["running", "biking", "swimming", "strength"].map(s => `
    <button class="zones-tab ${sport === s ? "is-active" : ""}" onclick="selectZonesSport('${s}')">${sportLabels[s]}</button>
  `).join("");

  // ── Strength tab ────────────────────────────────────────────────────────────
  if (sport === "strength") {
    const stored = loadTrainingZones("strength");
    const lifts = [
      { key: "bench",    label: "Bench Press" },
      { key: "squat",    label: "Back Squat" },
      { key: "deadlift", label: "Deadlift" },
      { key: "ohp",      label: "Overhead Press" },
      { key: "row",      label: "Barbell Row" },
    ];

    if (!stored) {
      el.innerHTML = `
        <div class="zones-tabs">${tabs}</div>
        <p class="hint" style="margin:16px 0">Enter your reference lifts so IronZ can recommend accurate weights when generating workouts.</p>
        <button class="btn-primary" onclick="openUpdateZonesForm()">Set Lifts</button>
        <div id="zones-form-area"></div>`;
      return;
    }

    const rows = lifts.map(l => {
      const d = stored[l.key];
      if (!d || !d.weight) return "";
      return `<div class="zone-row">
        <div class="zone-row-info"><span class="zone-row-name">${l.label}</span></div>
        <span class="zone-row-pace">${getMeasurementSystem() === "metric" ? (Math.round(d.weight * 0.453592 / 2) * 2) + " kg" : (Math.round(d.weight / 5) * 5) + " lbs"} &nbsp;·&nbsp; ${d.type === "1rm" ? "1-rep max" : d.type === "5rm" ? "5-rep max" : "10-rep max"}</span>
      </div>`;
    }).join("");

    const dateLabel = stored.updatedAt
      ? new Date(stored.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";

    el.innerHTML = `
      <div class="zones-tabs">${tabs}</div>
      ${dateLabel ? `<div class="zones-ref-line">Updated ${dateLabel}</div>` : ""}
      <div class="zones-table">${rows || "<p class='hint'>No lifts recorded yet.</p>"}</div>
      <button class="btn-secondary zones-update-btn" onclick="openUpdateZonesForm()">Update Lifts</button>
      <div id="zones-form-area"></div>`;
    return;
  }

  const stored = loadTrainingZones(sport);

  const emptyMsg = {
    running:  "Enter a recent race or time trial to calculate running pace zones.",
    biking:   "Enter your FTP (Functional Threshold Power) to calculate cycling power zones.",
    swimming: "Enter a 400m swim time to calculate training pace zones.",
  }[sport];

  if (!stored) {
    el.innerHTML = `
      <div class="zones-tabs">${tabs}</div>
      <p class="hint" style="margin:16px 0">${emptyMsg}</p>
      <button class="btn-primary" onclick="openUpdateZonesForm()">Set Zones</button>
      <div id="zones-form-area"></div>`;
    return;
  }

  // Build zone rows based on sport
  const configs = sport === "biking" ? BIKING_ZONE_CONFIG : sport === "swimming" ? SWIMMING_ZONE_CONFIG : ZONE_CONFIG;
  const zoneRows = configs.map(z => {
    const zData = stored.zones[`z${z.num}`] || {};
    const val = zData.paceRange || zData.wattRange || "—";
    return `
      <div class="zone-row">
        <span class="zone-row-badge zone-${z.num}">Z${z.num}</span>
        <div class="zone-row-info">
          <span class="zone-row-name">${z.name}</span>
          <span class="zone-row-desc">${z.desc}</span>
        </div>
        <span class="zone-row-pace">${val}</span>
      </div>`;
  }).join("");

  const dateLabel = stored.calculatedAt
    ? new Date(stored.calculatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  let refLine = "";
  if (sport === "running")  refLine = `Based on ${stored.referenceDist} in ${stored.referenceTime} &nbsp;·&nbsp; VDOT ${stored.vdot}`;
  if (sport === "biking")   refLine = `FTP: ${stored.ftp} W`;
  if (sport === "swimming") refLine = `T-Pace: ${stored.tPaceStr} /100m (from ${stored.referenceDist})`;
  if (dateLabel) refLine += ` &nbsp;·&nbsp; Updated ${dateLabel}`;

  el.innerHTML = `
    <div class="zones-tabs">${tabs}</div>
    <div class="zones-ref-line">${refLine}</div>
    <div class="zones-table">${zoneRows}</div>
    <button class="btn-secondary zones-update-btn" onclick="openUpdateZonesForm()">Update Zones</button>
    <div id="zones-form-area"></div>`;
}

function openUpdateZonesForm() {
  const area = document.getElementById("zones-form-area");
  if (!area) return;

  const sport = _activeZonesSport;

  if (sport === "strength") {
    const stored = loadTrainingZones("strength") || {};
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
      const d = stored[l.key] || {};
      return `<div class="strength-ref-row">
        <span class="strength-ref-label">${l.label}</span>
        <input type="number" id="sref-${l.key}" placeholder="lbs" min="0" max="2000"
          value="${d.weight || ""}" class="zones-time-field" style="width:80px" />
        <select id="sref-type-${l.key}" style="width:120px">${typeOpts(d.type || "1rm")}</select>
      </div>`;
    }).join("");

    area.innerHTML = `
      <div class="zones-form" style="margin-top:16px">
        <p class="hint" style="margin-bottom:12px">Leave blank any lifts you don't track.</p>
        ${rows}
        <div class="zones-form-actions" style="margin-top:16px">
          <button class="btn-primary" onclick="saveZonesFromForm()">Save Lifts</button>
          <button class="btn-secondary" onclick="document.getElementById('zones-form-area').innerHTML=''">Cancel</button>
        </div>
        <p id="zones-calc-msg" class="save-msg" style="margin-top:8px"></p>
      </div>`;
    return;
  }

  if (sport === "biking") {
    area.innerHTML = `
      <div class="zones-form">
        <div class="form-row">
          <label>FTP (Functional Threshold Power)</label>
          <div class="zones-time-inputs">
            <input type="number" id="zones-ftp" min="50" max="600" placeholder="e.g. 250"
              class="zones-time-field" style="width:100px" />
            <span class="zones-time-sep" style="margin-left:6px">W</span>
          </div>
          <p class="hint" style="margin-top:4px">Your average power you can sustain for ~1 hour. Use a 20-min test × 0.95 if needed.</p>
        </div>
        <div class="zones-form-actions">
          <button class="btn-primary" onclick="saveZonesFromForm()">Calculate &amp; Save</button>
          <button class="btn-secondary" onclick="document.getElementById('zones-form-area').innerHTML=''">Cancel</button>
        </div>
        <p id="zones-calc-msg" class="save-msg" style="margin-top:8px"></p>
      </div>`;
    return;
  }

  if (sport === "swimming") {
    area.innerHTML = `
      <div class="zones-form">
        <div class="form-row">
          <label>400m swim time</label>
          <div class="zones-time-inputs">
            <input type="number" id="zones-m" min="0" max="59" placeholder="mm" class="zones-time-field" />
            <span class="zones-time-sep">:</span>
            <input type="number" id="zones-s" min="0" max="59" placeholder="ss" class="zones-time-field" />
          </div>
          <p class="hint" style="margin-top:4px">Swim 400m at a strong, sustained effort. T-pace is derived automatically.</p>
        </div>
        <div class="zones-form-actions">
          <button class="btn-primary" onclick="saveZonesFromForm()">Calculate &amp; Save</button>
          <button class="btn-secondary" onclick="document.getElementById('zones-form-area').innerHTML=''">Cancel</button>
        </div>
        <p id="zones-calc-msg" class="save-msg" style="margin-top:8px"></p>
      </div>`;
    return;
  }

  // Running (default)
  const distOpts = Object.keys(ZONE_DISTANCES).map(d => `<option value="${d}">${d}</option>`).join("");
  area.innerHTML = `
    <div class="zones-form">
      <div class="form-row">
        <label>Race or time trial distance</label>
        <select id="zones-dist-select" onchange="zonesUpdateTimeFields()">${distOpts}</select>
      </div>
      <div class="form-row">
        <label>Finish time</label>
        <div class="zones-time-inputs">
          <input type="number" id="zones-h" min="0" max="9" placeholder="h"
            class="zones-time-field zones-time-field--h" style="display:none" />
          <input type="number" id="zones-m" min="0" max="59" placeholder="mm" class="zones-time-field" />
          <span class="zones-time-sep">:</span>
          <input type="number" id="zones-s" min="0" max="59" placeholder="ss" class="zones-time-field" />
        </div>
      </div>
      <div class="zones-form-actions">
        <button class="btn-primary" onclick="saveZonesFromForm()">Calculate &amp; Save</button>
        <button class="btn-secondary" onclick="document.getElementById('zones-form-area').innerHTML=''">Cancel</button>
      </div>
      <p id="zones-calc-msg" class="save-msg" style="margin-top:8px"></p>
    </div>`;
  zonesUpdateTimeFields();
}

function zonesUpdateTimeFields() {
  const dist = document.getElementById("zones-dist-select")?.value;
  const hEl  = document.getElementById("zones-h");
  if (!hEl) return;
  hEl.style.display = (dist === "Half Marathon" || dist === "Marathon") ? "inline-block" : "none";
}

function saveZonesFromForm() {
  const msg  = document.getElementById("zones-calc-msg");
  const sport = _activeZonesSport;

  if (sport === "strength") {
    const lifts = ["bench","squat","deadlift","ohp","row"];
    const data = { updatedAt: new Date().toISOString() };
    lifts.forEach(k => {
      const w = parseInt(document.getElementById(`sref-${k}`)?.value || "0");
      if (w > 0) {
        data[k] = {
          weight: w,
          type: document.getElementById(`sref-type-${k}`)?.value || "1rm",
        };
      }
    });
    saveTrainingZonesData("strength", data);
    renderZones();
    return;
  }

  if (sport === "biking") {
    const ftp = parseInt(document.getElementById("zones-ftp")?.value || "0");
    if (!ftp || ftp < 50) {
      if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please enter a valid FTP (50–600 W)."; }
      return;
    }
    const { zones } = computeBikingZones(ftp);
    saveTrainingZonesData("biking", { ftp, zones, calculatedAt: new Date().toISOString() });
    renderZones();
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof selectedDate !== "undefined" && selectedDate && typeof selectDay === "function") selectDay(selectedDate);
    return;
  }

  if (sport === "swimming") {
    const mEl = document.getElementById("zones-m");
    const sEl = document.getElementById("zones-s");
    const m = parseInt(mEl?.value || "0") || 0;
    const s = parseInt(sEl?.value || "0") || 0;
    const totalSeconds = m * 60 + s;
    if (totalSeconds < 30) {
      if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please enter a valid 400m swim time."; }
      return;
    }
    const { tPaceSec, zones } = computeSwimmingZones(totalSeconds);
    const tMin = Math.floor(tPaceSec / 60);
    const tSec = Math.round(tPaceSec % 60);
    const tPaceStr = `${tMin}:${tSec < 10 ? "0" : ""}${tSec}`;
    const mStr = String(m), sStr = String(s).padStart(2, "0");
    saveTrainingZonesData("swimming", {
      referenceDist: "400m", referenceTime: `${mStr}:${sStr}`, tPaceSec, tPaceStr, zones,
      calculatedAt: new Date().toISOString(),
    });
    renderZones();
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof selectedDate !== "undefined" && selectedDate && typeof selectDay === "function") selectDay(selectedDate);
    return;
  }

  // Running
  const dist = document.getElementById("zones-dist-select")?.value;
  const hEl  = document.getElementById("zones-h");
  const mEl  = document.getElementById("zones-m");
  const sEl  = document.getElementById("zones-s");
  if (!dist || !mEl || !sEl) return;
  const h = parseInt(hEl?.value || "0") || 0;
  const m = parseInt(mEl.value  || "0") || 0;
  const s = parseInt(sEl.value  || "0") || 0;
  const totalSeconds = h * 3600 + m * 60 + s;
  if (totalSeconds < 60) {
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please enter a valid finish time."; }
    return;
  }
  const distMeters = ZONE_DISTANCES[dist];
  if (!distMeters) return;
  const { vdot, zones } = computeRunningZones(distMeters, totalSeconds);
  const hStr = h > 0 ? `${h}:` : "";
  const mStr = h > 0 ? String(m).padStart(2, "0") : String(m);
  const sStr = String(s).padStart(2, "0");
  saveTrainingZonesData("running", {
    referenceDist: dist, referenceTime: `${hStr}${mStr}:${sStr}`, vdot, zones,
    calculatedAt: new Date().toISOString(),
  });
  renderZones();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate && typeof selectDay === "function") selectDay(selectedDate);
}
