// leveling.js — Progress tracking, level system, and achievement badges

/* =====================================================================
   LEVEL DEFINITIONS
   ===================================================================== */

const LEVEL_CRITERIA = {
  beginner: { minWorkouts: 0, minConsistentWeeks: 0, label: "Beginner", icon: "&#9733;" },
  intermediate: { minWorkouts: 30, minConsistentWeeks: 4, label: "Intermediate", icon: "&#9733;&#9733;" },
  advanced: { minWorkouts: 100, minConsistentWeeks: 12, label: "Advanced", icon: "&#9733;&#9733;&#9733;" },
};

const ACHIEVEMENTS = [
  { id: "first-workout",    name: "First Workout",    desc: "Log your first workout",                      icon: "&#128170;" },
  { id: "week-warrior",     name: "Week Warrior",     desc: "Complete all scheduled workouts in a week",    icon: "&#9876;" },
  { id: "30-day-streak",    name: "30-Day Streak",    desc: "Train 3+ times per week for 30 days",          icon: "&#128293;" },
  { id: "century-club",     name: "Century Club",     desc: "Log 100 workouts",                             icon: "&#127942;" },
  { id: "pr-machine",       name: "PR Machine",       desc: "Set 5 personal records",                       icon: "&#127941;" },
  { id: "nutrition-tracker", name: "Nutrition Tracker", desc: "Log meals for 7 consecutive days",            icon: "&#127823;" },
  { id: "plan-completer",   name: "Plan Completer",   desc: "Finish an entire training plan",               icon: "&#127937;" },
  { id: "50-workouts",      name: "Half Century",     desc: "Log 50 workouts",                              icon: "&#11088;" },
];

/* =====================================================================
   DATA GATHERING
   ===================================================================== */

function _getLevelingStats() {
  const today = getTodayString();

  // Logged workouts (past only)
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}
  const pastWorkouts = workouts.filter(w => w.date <= today && !w.isCompletion);

  // Completed session metadata
  let completionMeta = {};
  try { completionMeta = JSON.parse(localStorage.getItem("completedSessions") || "{}"); } catch {}

  // Scheduled workouts
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
  const pastSchedule = schedule.filter(w => w.date <= today);

  // Training plan entries
  let plan = [];
  try { plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]"); } catch {}
  const pastPlan = plan.filter(p => p.date <= today);

  // Meals
  let meals = [];
  try { meals = JSON.parse(localStorage.getItem("meals") || "[]"); } catch {}

  // Personal records
  let prs = {};
  try { prs = JSON.parse(localStorage.getItem("personalRecords") || "{}"); } catch {}

  return { pastWorkouts, completionMeta, pastSchedule, pastPlan, meals, prs, today };
}

/* =====================================================================
   PROGRESS SCORE (0-100)
   ===================================================================== */

function calculateProgressScore() {
  const stats = _getLevelingStats();
  const totalWorkouts = stats.pastWorkouts.length;

  // Consistency: how many of the last 4 weeks had 3+ workouts
  const consistencyScore = _calculateConsistency(stats.pastWorkouts, stats.today);

  // Volume: total workouts normalized (100 workouts = 100%)
  const volumeScore = Math.min(totalWorkouts / 100, 1) * 100;

  // Adherence: completed vs planned
  const adherenceScore = _calculateAdherence(stats);

  // Weighted composite
  return Math.round(consistencyScore * 0.4 + volumeScore * 0.3 + adherenceScore * 0.3);
}

function _calculateConsistency(workouts, today) {
  let weeksWithTarget = 0;
  const todayDate = new Date(today + "T00:00:00");

  for (let w = 0; w < 4; w++) {
    const weekEnd = new Date(todayDate);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);

    const startStr = weekStart.toISOString().slice(0, 10);
    const endStr = weekEnd.toISOString().slice(0, 10);

    const weekWorkouts = workouts.filter(wo => wo.date >= startStr && wo.date <= endStr);
    if (weekWorkouts.length >= 3) weeksWithTarget++;
  }

  return (weeksWithTarget / 4) * 100;
}

function _calculateAdherence(stats) {
  const totalPlanned = stats.pastSchedule.length + stats.pastPlan.length;
  if (totalPlanned === 0) return 100; // No plan = 100% adherence (nothing to miss)

  // Count completed scheduled/plan sessions
  let completed = 0;
  const completedIds = new Set(Object.keys(stats.completionMeta));

  stats.pastSchedule.forEach(s => {
    if (completedIds.has(`session-sw-${s.id}`)) completed++;
  });
  stats.pastPlan.forEach(p => {
    const key = `session-plan-${p.raceId}-${p.discipline}-${p.date}`;
    if (completedIds.has(key)) completed++;
  });

  return Math.min((completed / totalPlanned) * 100, 100);
}

/* =====================================================================
   LEVEL DETERMINATION
   ===================================================================== */

function getCurrentLevel() {
  const stats = _getLevelingStats();
  const totalWorkouts = stats.pastWorkouts.length;
  const consistentWeeks = _countConsistentWeeks(stats.pastWorkouts, stats.today);

  if (totalWorkouts >= LEVEL_CRITERIA.advanced.minWorkouts && consistentWeeks >= LEVEL_CRITERIA.advanced.minConsistentWeeks) {
    return "advanced";
  }
  if (totalWorkouts >= LEVEL_CRITERIA.intermediate.minWorkouts && consistentWeeks >= LEVEL_CRITERIA.intermediate.minConsistentWeeks) {
    return "intermediate";
  }
  return "beginner";
}

function _countConsistentWeeks(workouts, today) {
  const todayDate = new Date(today + "T00:00:00");
  let count = 0;

  for (let w = 0; w < 52; w++) {
    const weekEnd = new Date(todayDate);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);

    const startStr = weekStart.toISOString().slice(0, 10);
    const endStr = weekEnd.toISOString().slice(0, 10);

    const weekWorkouts = workouts.filter(wo => wo.date >= startStr && wo.date <= endStr);
    if (weekWorkouts.length >= 3) {
      count++;
    } else if (w > 0) {
      break; // Stop counting at first non-consistent week (streak-based)
    }
  }

  return count;
}

function getLevelProgress() {
  const stats = _getLevelingStats();
  const totalWorkouts = stats.pastWorkouts.length;
  const consistentWeeks = _countConsistentWeeks(stats.pastWorkouts, stats.today);
  const currentLevel = getCurrentLevel();

  if (currentLevel === "advanced") {
    return { current: "advanced", next: null, pct: 100, text: "Maximum level reached" };
  }

  const nextLevel = currentLevel === "beginner" ? "intermediate" : "advanced";
  const criteria = LEVEL_CRITERIA[nextLevel];

  const workoutPct = Math.min(totalWorkouts / criteria.minWorkouts, 1);
  const weeksPct = Math.min(consistentWeeks / criteria.minConsistentWeeks, 1);
  const pct = Math.round(((workoutPct + weeksPct) / 2) * 100);

  return {
    current: currentLevel,
    next: nextLevel,
    pct,
    text: `Progress to ${criteria.label}`,
  };
}

/* =====================================================================
   ACHIEVEMENTS
   ===================================================================== */

function getEarnedAchievements() {
  const stats = _getLevelingStats();
  const totalWorkouts = stats.pastWorkouts.length;
  const earned = [];

  // First Workout
  if (totalWorkouts >= 1) earned.push("first-workout");

  // Half Century (50 workouts)
  if (totalWorkouts >= 50) earned.push("50-workouts");

  // Century Club (100 workouts)
  if (totalWorkouts >= 100) earned.push("century-club");

  // 30-Day Streak (3+ per week for 4+ weeks)
  const consistentWeeks = _countConsistentWeeks(stats.pastWorkouts, stats.today);
  if (consistentWeeks >= 4) earned.push("30-day-streak");

  // PR Machine (5+ personal records)
  const prCount = Object.keys(stats.prs).length;
  if (prCount >= 5) earned.push("pr-machine");

  // Nutrition Tracker (7 consecutive days of meals)
  if (_hasConsecutiveMealDays(stats.meals, 7)) earned.push("nutrition-tracker");

  // Week Warrior (all scheduled workouts completed in any week)
  if (_hasCompletedFullWeek(stats)) earned.push("week-warrior");

  // Plan Completer — check if any plan's final date has passed and adherence is high
  if (_hasCompletedPlan(stats)) earned.push("plan-completer");

  return earned;
}

function _hasConsecutiveMealDays(meals, target) {
  if (meals.length === 0) return false;
  const dates = [...new Set(meals.map(m => m.date))].sort();
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + "T00:00:00");
    const curr = new Date(dates[i] + "T00:00:00");
    const diff = (curr - prev) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      streak++;
      if (streak >= target) return true;
    } else {
      streak = 1;
    }
  }
  return false;
}

function _hasCompletedFullWeek(stats) {
  // Group scheduled workouts by ISO week, check if any week has all completed
  const byWeek = {};
  stats.pastSchedule.forEach(s => {
    const d = new Date(s.date + "T00:00:00");
    const weekKey = _isoWeek(d);
    if (!byWeek[weekKey]) byWeek[weekKey] = { total: 0, completed: 0 };
    byWeek[weekKey].total++;
    if (stats.completionMeta[`session-sw-${s.id}`]) byWeek[weekKey].completed++;
  });

  return Object.values(byWeek).some(w => w.total > 0 && w.completed === w.total);
}

function _isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

function _hasCompletedPlan(stats) {
  if (stats.pastPlan.length === 0) return false;
  // Group by raceId, check if the last date of any plan has passed
  const byRace = {};
  stats.pastPlan.forEach(p => {
    if (!p.raceId) return;
    if (!byRace[p.raceId]) byRace[p.raceId] = { total: 0, completed: 0, lastDate: p.date };
    byRace[p.raceId].total++;
    if (byRace[p.raceId].lastDate < p.date) byRace[p.raceId].lastDate = p.date;
    const key = `session-plan-${p.raceId}-${p.discipline}-${p.date}`;
    if (stats.completionMeta[key]) byRace[p.raceId].completed++;
  });

  const today = stats.today;
  return Object.values(byRace).some(r => r.lastDate <= today && r.total > 0 && (r.completed / r.total) >= 0.7);
}

/* =====================================================================
   RENDERING
   ===================================================================== */

function renderLevelProgress() {
  const progress = getLevelProgress();
  const earned = getEarnedAchievements();
  const criteria = LEVEL_CRITERIA[progress.current];

  // Level badge
  const badgeText = document.getElementById("level-badge-text");
  const badgeIcon = document.getElementById("level-badge-icon");
  if (badgeText) badgeText.textContent = criteria.label;
  if (badgeIcon) badgeIcon.innerHTML = criteria.icon;

  // Progress bar
  const progressText = document.getElementById("level-progress-text");
  const progressPct = document.getElementById("level-progress-pct");
  const progressFill = document.getElementById("level-progress-fill");
  if (progressText) progressText.textContent = progress.text;
  if (progressPct) progressPct.textContent = progress.pct + "%";
  if (progressFill) progressFill.style.width = progress.pct + "%";

  // Achievements
  const grid = document.getElementById("achievements-grid");
  if (grid) {
    grid.innerHTML = ACHIEVEMENTS.map(a => {
      const isEarned = earned.includes(a.id);
      return `
        <div class="achievement-badge ${isEarned ? "earned" : "locked"}">
          <span class="achievement-icon">${a.icon}</span>
          <span class="achievement-name">${a.name}</span>
          <span class="achievement-desc">${a.desc}</span>
        </div>
      `;
    }).join("");
  }
}

/* =====================================================================
   LEVEL-UP CHECK
   ===================================================================== */

function checkLevelUp() {
  const currentLevel = getCurrentLevel();
  const storedLevel = localStorage.getItem("userLevel") || "beginner";

  if (currentLevel !== storedLevel) {
    localStorage.setItem("userLevel", currentLevel);

    // Only show celebration if leveling UP (not down)
    const order = ["beginner", "intermediate", "advanced"];
    if (order.indexOf(currentLevel) > order.indexOf(storedLevel)) {
      showLevelUpModal(currentLevel);
    }
  }
}

function showLevelUpModal(level) {
  const criteria = LEVEL_CRITERIA[level];
  const modal = document.getElementById("level-up-modal");
  if (!modal) return;

  const content = document.getElementById("level-up-content");
  if (content) {
    content.innerHTML = `
      <div class="level-up-celebration">
        <div class="level-up-stars">${criteria.icon}</div>
        <h2 class="level-up-title">Level Up!</h2>
        <p class="level-up-text">You've reached <strong>${criteria.label}</strong> level!</p>
        <p class="level-up-sub">Keep pushing. Your consistency is paying off.</p>
        <button class="btn-primary" onclick="closeLevelUpModal()" style="margin-top:16px;width:100%">Nice!</button>
      </div>
    `;
  }

  modal.style.display = "";
}

function closeLevelUpModal() {
  const modal = document.getElementById("level-up-modal");
  if (modal) modal.style.display = "none";
}
