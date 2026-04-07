// weekly-checkin.js — Weekly Check-In flow
// Shows every Sunday (configurable) with adherence summary and difficulty feedback.

function getCheckinHistory() {
  try { return JSON.parse(localStorage.getItem("checkinHistory") || "[]"); } catch { return []; }
}

function saveCheckinHistory(history) {
  localStorage.setItem("checkinHistory", JSON.stringify(history)); if (typeof DB !== 'undefined') DB.syncKey('checkinHistory');
}

/**
 * Determines if a check-in prompt should appear.
 * Shows on Sunday if no check-in exists for the current week.
 */
function shouldShowWeeklyCheckin() {
  const today = new Date();
  const dow = today.getDay(); // 0 = Sunday
  if (dow !== 0) return false;

  const weekKey = getWeekKey(today);
  const history = getCheckinHistory();
  return !history.some(c => c.weekKey === weekKey);
}

function getWeekKey(date) {
  // ISO week key: start of the week (Monday)
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute stats for the past 7 days relative to a given date.
 */
function getWeekStats(endDate) {
  const end = new Date(endDate);
  end.setHours(23, 59, 59);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  // Scheduled workouts this week
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
  const scheduledThisWeek = schedule.filter(w => w.date >= startStr && w.date <= endStr);

  // Completed sessions
  let completionMeta = {};
  try { completionMeta = JSON.parse(localStorage.getItem("completedSessions") || "{}"); } catch {}
  const completedIds = new Set(Object.keys(completionMeta));
  const completedCount = scheduledThisWeek.filter(w => {
    const cardId = `session-sw-${w.id}`;
    return completedIds.has(cardId);
  }).length;

  // Logged workouts
  let logged = [];
  try { logged = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}
  const loggedThisWeek = logged.filter(w => w.date >= startStr && w.date <= endStr);

  // Nutrition logging
  let meals = [];
  try { meals = JSON.parse(localStorage.getItem("meals") || "[]"); } catch {}
  const mealDays = new Set(meals.filter(m => m.date >= startStr && m.date <= endStr).map(m => m.date));

  // Hydration
  let hydLog = {};
  try { hydLog = JSON.parse(localStorage.getItem("hydrationLog") || "{}"); } catch {}
  const targetOz = typeof getHydrationTarget === "function" ? getHydrationTarget() : 96;
  const bottleSize = typeof getBottleSize === "function" ? getBottleSize() : 12;
  let hydDaysHit = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    const entry = hydLog[ds];
    const bottles = (typeof entry === "number") ? entry : (entry && entry.total) || 0;
    if (bottles * bottleSize >= targetOz) hydDaysHit++;
  }

  return {
    planned: scheduledThisWeek.length,
    completed: completedCount + loggedThisWeek.length,
    nutritionDaysLogged: mealDays.size,
    hydrationDaysHit: hydDaysHit,
    totalDays: 7,
  };
}

// ── Render Check-In Modal ──────────────────────────────────────────────────

function openWeeklyCheckin() {
  const today = new Date();
  const stats = getWeekStats(today);

  const workoutPct = stats.planned > 0 ? Math.round(stats.completed / stats.planned * 100) : (stats.completed > 0 ? 100 : 0);
  const nutPct = Math.round(stats.nutritionDaysLogged / 7 * 100);
  const hydPct = Math.round(stats.hydrationDaysHit / 7 * 100);

  const overlay = document.getElementById("weekly-checkin-overlay");
  if (!overlay) return;

  const content = document.getElementById("weekly-checkin-content");
  if (!content) return;

  // Encouraging message based on adherence
  let message = "";
  const avg = (workoutPct + nutPct + hydPct) / 3;
  if (avg >= 80) message = "Incredible week! You showed up consistently across the board.";
  else if (avg >= 50) message = "Solid effort this week. Every session counts.";
  else if (avg >= 20) message = "Some weeks are harder than others. The fact that you're here matters.";
  else message = "Every week is a fresh start. Let's build momentum from here.";

  content.innerHTML = `
    <h2 class="wc-title">Your Week in Review</h2>
    <p class="wc-message">${message}</p>

    <div class="wc-stats">
      ${buildCheckinStat("Workouts", stats.completed, stats.planned, workoutPct, ICONS.weights)}
      ${typeof isNutritionEnabled === "function" && isNutritionEnabled() ?
        buildCheckinStat("Nutrition Logged", stats.nutritionDaysLogged, 7, nutPct, ICONS.utensils) : ""}
      ${typeof isHydrationEnabled === "function" && isHydrationEnabled() ?
        buildCheckinStat("Hydration Goals Met", stats.hydrationDaysHit, 7, hydPct, ICONS.droplet) : ""}
    </div>

    <div class="wc-feedback">
      <label class="wc-feedback-label">How did this week feel?</label>
      <div class="wc-feedback-options">
        <button class="wc-feedback-btn" data-value="too-easy" onclick="selectCheckinFeedback(this)">Too Easy</button>
        <button class="wc-feedback-btn" data-value="just-right" onclick="selectCheckinFeedback(this)">Just Right</button>
        <button class="wc-feedback-btn" data-value="too-hard" onclick="selectCheckinFeedback(this)">Too Hard</button>
      </div>
    </div>

    <button class="btn-primary wc-submit-btn" onclick="submitWeeklyCheckin()">Save Check-In</button>
    <button class="btn-secondary wc-skip-btn" onclick="closeWeeklyCheckin()">Skip for Now</button>
  `;

  overlay.style.display = "flex";
}

function buildCheckinStat(label, current, target, pct, icon) {
  const color = pct >= 80 ? "var(--color-success)" : pct >= 40 ? "var(--color-accent)" : "var(--color-text-muted)";
  return `
    <div class="wc-stat">
      <div class="wc-stat-header">
        <span class="wc-stat-icon">${icon}</span>
        <span class="wc-stat-label">${label}</span>
        <span class="wc-stat-value">${current}/${target}</span>
      </div>
      <div class="wc-stat-bar">
        <div class="wc-stat-fill" style="width:${Math.min(pct, 100)}%;background:${color}"></div>
      </div>
    </div>`;
}

function selectCheckinFeedback(btn) {
  document.querySelectorAll(".wc-feedback-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
}

function submitWeeklyCheckin() {
  const feedback = document.querySelector(".wc-feedback-btn.selected")?.dataset.value || "just-right";
  const today = new Date();
  const weekKey = getWeekKey(today);
  const stats = getWeekStats(today);

  const checkin = {
    weekKey: weekKey,
    date: today.toISOString().slice(0, 10),
    stats: stats,
    feedback: feedback,
  };

  const history = getCheckinHistory();
  history.push(checkin);
  saveCheckinHistory(history);

  closeWeeklyCheckin();
}

function closeWeeklyCheckin() {
  const overlay = document.getElementById("weekly-checkin-overlay");
  if (overlay) overlay.style.display = "none";
}

/**
 * Build check-in trend data for the Stats tab.
 */
function buildCheckinTrend() {
  const history = getCheckinHistory();
  if (history.length < 2) return "";

  const recent = history.slice(-8);
  let html = `<div class="wc-trend">
    <h3 class="wc-trend-title">Weekly Consistency</h3>
    <div class="wc-trend-chart">`;

  recent.forEach(c => {
    const workoutPct = c.stats.planned > 0 ? Math.round(c.stats.completed / c.stats.planned * 100) : 0;
    const barH = Math.max(workoutPct, 4);
    const weekLabel = c.weekKey.slice(5); // MM-DD
    html += `
      <div class="wc-trend-bar-wrap">
        <div class="wc-trend-bar" style="height:${barH}%" title="${workoutPct}% adherence"></div>
        <span class="wc-trend-label">${weekLabel}</span>
      </div>`;
  });

  html += `</div></div>`;
  return html;
}
