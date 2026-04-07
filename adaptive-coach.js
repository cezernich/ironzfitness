// adaptive-coach.js — Adaptive Coaching Engine
// Phase 4.1: Adjusts plans based on user behavior, feedback, and patterns.

/* =====================================================================
   BEHAVIOR ANALYSIS
   ===================================================================== */

/**
 * Analyzes recent check-in feedback to determine if intensity should change.
 * Returns: "increase" | "decrease" | "maintain"
 */
function analyzeIntensityTrend() {
  let history = [];
  try { history = JSON.parse(localStorage.getItem("checkinHistory") || "[]"); } catch {}
  if (history.length < 2) return "maintain";

  const recent = history.slice(-3);
  const feedbacks = recent.map(c => c.feedback);

  const tooHardCount = feedbacks.filter(f => f === "too-hard").length;
  const tooEasyCount = feedbacks.filter(f => f === "too-easy").length;

  if (tooHardCount >= 2) return "decrease";
  if (tooEasyCount >= 2) return "increase";
  return "maintain";
}

/**
 * Analyzes workout completion rate over recent weeks.
 * Returns { rate, suggestion }
 */
function analyzeCompletionRate() {
  const today = getTodayString();
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
  let completionMeta = {};
  try { completionMeta = JSON.parse(localStorage.getItem("completedSessions") || "{}"); } catch {}

  // Look at last 14 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recent = schedule.filter(s => s.date >= cutoffStr && s.date < today);
  if (recent.length === 0) return { rate: 0, suggestion: null };

  const completed = recent.filter(s => completionMeta[`session-sw-${s.id}`]);
  const rate = completed.length / recent.length;

  let suggestion = null;
  if (rate >= 0.9) {
    suggestion = {
      type: "progressive-overload",
      message: "You've completed ${Math.round(rate * 100)}% of sessions. Consider increasing intensity or adding a session.",
      action: "increase",
    };
  } else if (rate < 0.5) {
    suggestion = {
      type: "reduce-volume",
      message: "Completion is at ${Math.round(rate * 100)}%. Let's reduce to ${Math.max(2, recent.length - 2)} sessions/week to build consistency first.",
      action: "decrease",
    };
  }

  return { rate, suggestion };
}

/**
 * Analyzes nutrition logging frequency.
 * If logging drops off, suggest simplification.
 */
function analyzeNutritionEngagement() {
  let meals = [];
  try { meals = JSON.parse(localStorage.getItem("meals") || "[]"); } catch {}

  const today = new Date();
  const recentDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    recentDays.push(d.toISOString().slice(0, 10));
  }

  const daysLogged = new Set(meals.filter(m => recentDays.includes(m.date)).map(m => m.date)).size;

  if (daysLogged <= 2) {
    return {
      engaged: false,
      message: "You've logged meals on ${daysLogged}/7 days. Try just logging one meal per day — every bit counts.",
      suggestion: "simplify",
    };
  }

  return { engaged: true, daysLogged };
}

/* =====================================================================
   PLAN ADJUSTMENTS
   ===================================================================== */

/**
 * Apply intensity adjustment to upcoming scheduled workouts.
 * direction: "increase" or "decrease"
 */
function adjustPlanIntensity(direction) {
  const today = getTodayString();
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}

  const loadLevels = ["easy", "moderate", "hard", "long"];

  schedule.forEach(s => {
    if (s.date <= today) return; // Only adjust future sessions
    if (!s.load) return;

    const currentIdx = loadLevels.indexOf(s.load);
    if (currentIdx === -1) return;

    if (direction === "increase" && currentIdx < loadLevels.length - 1) {
      s.load = loadLevels[currentIdx + 1];
      s.adjusted = true;
    } else if (direction === "decrease" && currentIdx > 0) {
      s.load = loadLevels[currentIdx - 1];
      s.adjusted = true;
    }
  });

  localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();
}

/**
 * Reduce the number of sessions per week by removing the least critical ones.
 */
function reducePlanVolume() {
  const today = getTodayString();
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}

  // Group future sessions by week
  const futureByWeek = {};
  schedule.forEach(s => {
    if (s.date <= today) return;
    const weekStart = getWeekStartStr(s.date);
    if (!futureByWeek[weekStart]) futureByWeek[weekStart] = [];
    futureByWeek[weekStart].push(s);
  });

  // For each week with 3+ sessions, remove one (lowest priority first)
  const removedIds = new Set();
  Object.values(futureByWeek).forEach(weekSessions => {
    if (weekSessions.length >= 3) {
      // Sort: prefer removing easy/rest sessions; sessions without load go first
      const loadPriority = { easy: 0, moderate: 2, hard: 3, long: 4 };
      weekSessions.sort((a, b) => (loadPriority[a.load] ?? 1) - (loadPriority[b.load] ?? 1));
      removedIds.add(weekSessions[0].id);
    }
  });

  if (removedIds.size > 0) {
    schedule = schedule.filter(s => !removedIds.has(s.id));
    localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();
  }

  return removedIds.size;
}

function getWeekStartStr(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/* =====================================================================
   COACHING INSIGHTS (shown in day detail or stats)
   ===================================================================== */

/**
 * Generates coaching insights based on all analyses.
 * Returns array of insight objects.
 */
function getCoachingInsights() {
  const insights = [];

  // Intensity trend
  const trend = analyzeIntensityTrend();
  if (trend === "decrease" && !_isCoachingDismissed("decreaseIntensity") && !_isCoachingDismissed("intensity")) {
    insights.push({
      type: "intensity",
      icon: ICONS.warning,
      title: "Workouts Feeling Hard",
      message: "You've rated recent weeks as too hard. We can dial back intensity for next week.",
      action: { label: "Reduce Intensity", handler: "applyCoachingAction('decreaseIntensity')" },
    });
  } else if (trend === "increase" && !_isCoachingDismissed("increaseIntensity") && !_isCoachingDismissed("intensity")) {
    insights.push({
      type: "intensity",
      icon: ICONS.trendingUp,
      title: "Ready for More",
      message: "You've been crushing it! Ready to increase intensity?",
      action: { label: "Level Up", handler: "applyCoachingAction('increaseIntensity')" },
    });
  }

  // Completion rate
  if (!_isCoachingDismissed("reduceVolume") && !_isCoachingDismissed("volume")) {
    const completion = analyzeCompletionRate();
    if (completion.suggestion) {
      const msg = completion.suggestion.message
        .replace("${Math.round(rate * 100)}", Math.round(completion.rate * 100))
        .replace("${Math.max(2, recent.length - 2)}", "fewer");
      insights.push({
        type: "volume",
        icon: completion.suggestion.action === "increase" ? ICONS.trendingUp : ICONS.lightbulb,
        title: completion.suggestion.action === "increase" ? "Strong Consistency" : "Let's Simplify",
        message: msg,
        action: completion.suggestion.action === "decrease"
          ? { label: "Reduce Volume", handler: "applyCoachingAction('reduceVolume')" }
          : null,
      });
    }
  }

  // Nutrition engagement
  if (typeof isNutritionEnabled === "function" && isNutritionEnabled()) {
    const nutrition = analyzeNutritionEngagement();
    if (!nutrition.engaged) {
      const msg = nutrition.message.replace("${daysLogged}", nutrition.daysLogged || 0);
      insights.push({
        type: "nutrition",
        icon: ICONS.utensils,
        title: "Nutrition Logging",
        message: msg,
      });
    }
  }

  return insights;
}

/**
 * Renders coaching insights card for the home tab.
 */
function buildCoachingInsights() {
  const insights = getCoachingInsights();
  if (insights.length === 0) return "";

  let html = `<div class="coaching-insights">
    <div class="coaching-header">${ICONS.sparkles} Coaching Insights</div>`;

  insights.forEach((insight, i) => {
    html += `
      <div class="coaching-insight coaching-${insight.type}" id="coaching-insight-${i}">
        <button class="coaching-dismiss-btn" onclick="_dismissCoachingInsight('${insight.type}');this.closest('.coaching-insight').remove();if(!document.querySelector('.coaching-insight')){const c=document.querySelector('.coaching-insights');if(c)c.remove()}" title="Dismiss"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg></button>
        <span class="coaching-icon">${insight.icon}</span>
        <div class="coaching-body">
          <div class="coaching-title">${escHtml(insight.title)}</div>
          <div class="coaching-message">${escHtml(insight.message)}</div>
          ${insight.action ? `<button class="coaching-action-btn" onclick="${insight.action.handler}">${escHtml(insight.action.label)}</button>` : ""}
        </div>
      </div>`;
  });

  html += `</div>`;
  return html;
}

/* =====================================================================
   ACTION HANDLERS
   ===================================================================== */

function applyCoachingAction(action) {
  let msg = "";
  switch (action) {
    case "increaseIntensity":
      adjustPlanIntensity("increase");
      msg = "Intensity increased for upcoming sessions.";
      break;
    case "decreaseIntensity":
      adjustPlanIntensity("decrease");
      msg = "Intensity reduced for upcoming sessions.";
      break;
    case "reduceVolume":
      const removed = reducePlanVolume();
      msg = removed > 0
        ? `Removed ${removed} session${removed > 1 ? "s" : ""} from your upcoming weeks.`
        : "No sessions to remove — your plan is already light.";
      break;
  }

  // Persist that this action was taken today so insight doesn't reappear
  _dismissCoachingInsight(action);

  // Refresh UI
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof selectDay === "function") selectDay(getTodayString());

  // Remove the insight card and show feedback
  const insightsEl = document.querySelector(".coaching-insights");
  if (insightsEl) {
    insightsEl.innerHTML = `<div class="coaching-insights">
      <div class="coaching-header">${typeof ICONS !== "undefined" ? ICONS.sparkles : ""} Coaching Insights</div>
      <div class="coaching-insight" style="text-align:center;padding:16px">
        <span style="font-size:0.9rem">${msg}</span>
      </div>
    </div>`;
    setTimeout(() => { if (insightsEl) insightsEl.remove(); }, 3000);
  }
}

/** Persist dismissed/actioned insights so they don't reappear the same day */
function _dismissCoachingInsight(key) {
  let dismissed = {};
  try { dismissed = JSON.parse(localStorage.getItem("coachingDismissed") || "{}"); } catch {}
  dismissed[key] = getTodayString();
  localStorage.setItem("coachingDismissed", JSON.stringify(dismissed));
}

function _isCoachingDismissed(key) {
  try {
    const dismissed = JSON.parse(localStorage.getItem("coachingDismissed") || "{}");
    return dismissed[key] === getTodayString();
  } catch { return false; }
}
