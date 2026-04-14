// trust-center.js — Privacy & Trust Center
// Phase 3.1: Data inventory, permissions, export, deletion, consent flows.

/* =====================================================================
   DATA INVENTORY — What we collect, why, and where
   ===================================================================== */

const DATA_INVENTORY = [
  {
    category: "Profile",
    key: "profile",
    fields: "Name, age, weight, height, gender, goal",
    purpose: "Calculate nutrition targets, personalize training plans, calibrate workout difficulty",
    retention: "Until you delete it",
  },
  {
    category: "Training Data",
    key: "workoutSchedule",
    fields: "Scheduled workouts, dates, types, completion status",
    purpose: "Display your training calendar, track adherence, generate weekly stats",
    retention: "Until you delete it",
  },
  {
    category: "Workout History",
    key: "workouts",
    fields: "Logged workouts, exercises, sets, reps, weights, notes",
    purpose: "Track progress, calculate personal records, power stats dashboard",
    retention: "Until you delete it",
  },
  {
    category: "Nutrition",
    key: "meals",
    fields: "Meal names, calories, protein, carbs, fat, dates",
    purpose: "Track daily nutrition, show progress toward targets, generate meal suggestions",
    retention: "Until you delete it",
  },
  {
    category: "Hydration",
    key: "hydrationLog",
    fields: "Daily water intake, beverage types",
    purpose: "Track hydration goals, provide context-aware reminders",
    retention: "Until you delete it",
  },
  {
    category: "Food Preferences",
    key: "foodPreferences",
    fields: "Liked and disliked foods",
    purpose: "Personalize meal suggestions, improve grocery lists",
    retention: "Until you delete it",
  },
  {
    category: "Onboarding Responses",
    key: "onboardingData",
    fields: "Fitness level, workout interests, dietary restrictions, hydration habit",
    purpose: "Initial plan generation, feature customization",
    retention: "Until you delete it",
  },
  {
    category: "App Preferences",
    key: "theme",
    fields: "Theme, measurement system, notification settings",
    purpose: "Display preferences",
    retention: "Until you delete it",
  },
];

/* =====================================================================
   DATA EXPORT
   ===================================================================== */

function exportAllUserData() {
  const exportData = {};
  const allKeys = [
    "profile", "workouts", "workoutSchedule", "meals", "events", "trainingPlan",
    "foodPreferences", "onboardingData", "hydrationLog", "hydrationSettings",
    "nutritionAdjustments", "dayRestrictions", "personalRecords", "savedWorkouts",
    "completedSessions", "workoutRatings", "trainingPreferences", "checkinHistory",
    "fitnessGoals", "trainingNotes", "equipmentRestrictions",
  ];

  allKeys.forEach(key => {
    const val = localStorage.getItem(key);
    if (val) {
      try { exportData[key] = JSON.parse(val); }
      catch { exportData[key] = val; }
    }
  });

  exportData._exportMeta = {
    exportedAt: new Date().toISOString(),
    app: "IronZ",
    version: "1.1.0",
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ironz-data-export-${getTodayString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportAsCSV() {
  const rows = [["Category", "Key", "Value"]];

  const simpleKeys = ["profile", "onboardingData", "foodPreferences", "hydrationSettings"];
  simpleKeys.forEach(key => {
    try {
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      Object.entries(data).forEach(([k, v]) => {
        rows.push([key, k, String(v)]);
      });
    } catch {}
  });

  // Workouts
  try {
    const workouts = JSON.parse(localStorage.getItem("workouts") || "[]");
    workouts.forEach(w => {
      rows.push(["workout", w.date, `${w.name || w.type} — ${w.notes || ""}`]);
    });
  } catch {}

  // Meals
  try {
    const meals = JSON.parse(localStorage.getItem("meals") || "[]");
    meals.forEach(m => {
      rows.push(["meal", m.date, `${m.name} — ${m.calories}cal ${m.protein}P ${m.carbs}C ${m.fat}F`]);
    });
  } catch {}

  const csvContent = rows.map(r => r.map(cell =>
    `"${String(cell).replace(/"/g, '""')}"`
  ).join(",")).join("\n");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ironz-data-export-${getTodayString()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* =====================================================================
   GRANULAR DELETION
   ===================================================================== */

function deleteDataCategory(category) {
  const keyMap = {
    profile: ["profile"],
    training: ["workoutSchedule", "trainingPlan", "events", "completedSessions"],
    workouts: ["workouts", "workoutRatings"],
    nutrition: ["meals", "nutritionAdjustments"],
    hydration: ["hydrationLog", "hydrationSettings", "hydrationDailyTargetOz"],
    preferences: ["foodPreferences", "onboardingData", "trainingPreferences"],
    saved: ["savedWorkouts", "importedPlans"],
    goals: ["fitnessGoals", "personalRecords"],
  };

  const keys = keyMap[category];
  if (!keys) return;

  const labels = {
    profile: "profile data",
    training: "training plans and schedule",
    workouts: "workout history",
    nutrition: "meal logs and adjustments",
    hydration: "hydration logs",
    preferences: "food and training preferences",
    saved: "saved workouts and imported plans",
    goals: "goals and personal records",
  };

  if (!confirm(`Delete all ${labels[category]}? This cannot be undone.`)) return;

  keys.forEach(k => localStorage.removeItem(k));

  renderTrustCenter();

  // Refresh visible UI
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof selectDay === "function") selectDay(getTodayString());
}

/* =====================================================================
   TRUST CENTER UI
   ===================================================================== */

function renderTrustCenter() {
  const container = document.getElementById("trust-center-content");
  if (!container) return;

  let html = "";

  // Data inventory
  html += `<div class="tc-section">
    <h3 class="tc-section-title">What Data We Store</h3>
    <p class="tc-section-desc">All your data is stored locally on this device in your browser. Nothing is sent to our servers unless you use AI features (which send prompts to Anthropic's API).</p>
    <div class="tc-inventory">`;

  DATA_INVENTORY.forEach(item => {
    const hasData = !!localStorage.getItem(item.key);
    html += `
      <div class="tc-inventory-item">
        <div class="tc-inv-header">
          <span class="tc-inv-category">${escHtml(item.category)}</span>
          <span class="tc-inv-status ${hasData ? "tc-inv--active" : "tc-inv--empty"}">${hasData ? "Has data" : "Empty"}</span>
        </div>
        <div class="tc-inv-fields">${escHtml(item.fields)}</div>
        <div class="tc-inv-purpose">${escHtml(item.purpose)}</div>
      </div>`;
  });

  html += `</div></div>`;

  // AI Data Usage
  html += `<div class="tc-section">
    <h3 class="tc-section-title">AI Features & Data</h3>
    <p class="tc-section-desc">When you use AI features (workout generation, meal suggestions, photo logging), your relevant profile data and preferences are sent to Anthropic's Claude API to generate personalized responses. This data is:</p>
    <ul class="tc-list">
      <li>Not stored by Anthropic beyond the API request</li>
      <li>Not used to train AI models</li>
      <li>Transmitted over encrypted connections (HTTPS)</li>
      <li>Limited to what's needed for the specific feature</li>
    </ul>
  </div>`;

  // Export
  html += `<div class="tc-section">
    <h3 class="tc-section-title">Export Your Data</h3>
    <p class="tc-section-desc">Download a complete copy of all your data at any time.</p>
    <div class="tc-export-btns">
      <button class="btn-primary" onclick="exportAllUserData()">Export as JSON</button>
      <button class="btn-secondary" onclick="exportAsCSV()">Export as CSV</button>
    </div>
  </div>`;

  // Granular deletion
  html += `<div class="tc-section">
    <h3 class="tc-section-title">Delete Specific Data</h3>
    <p class="tc-section-desc">Remove specific categories of data without affecting the rest.</p>
    <div class="tc-delete-grid">
      ${buildDeleteButton("profile", "Profile Data")}
      ${buildDeleteButton("training", "Training Plans")}
      ${buildDeleteButton("workouts", "Workout History")}
      ${buildDeleteButton("nutrition", "Meal Logs")}
      ${buildDeleteButton("hydration", "Hydration Logs")}
      ${buildDeleteButton("preferences", "Preferences")}
      ${buildDeleteButton("saved", "Saved Workouts")}
      ${buildDeleteButton("goals", "Goals & PRs")}
    </div>
  </div>`;

  // Delete everything
  html += `<div class="tc-section tc-danger-zone">
    <h3 class="tc-section-title">Delete Everything</h3>
    <p class="tc-section-desc">Permanently remove all data from this device. This cannot be undone.</p>
    <button class="btn-danger" onclick="if(typeof clearAllData==='function') clearAllData()">Delete All Data</button>
  </div>`;

  container.innerHTML = html;
}

function buildDeleteButton(category, label) {
  return `<button class="tc-delete-btn" onclick="deleteDataCategory('${category}')">${escHtml(label)}</button>`;
}
