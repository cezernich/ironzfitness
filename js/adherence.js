// adherence.js — Adherence & Resilience Engine
// Phase 2.1: Missed day detection, fallback plans, adaptive rescheduling,
// consistency streaks, and welcome-back flows.

/* =====================================================================
   MISSED DAY DETECTION
   ===================================================================== */

/**
 * Scans past scheduled workouts and marks any that were not completed as missed.
 * Returns array of { date, session } objects for missed days.
 */
function detectMissedDays(lookbackDays) {
  lookbackDays = lookbackDays || 7;
  const today = getTodayString();
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
  let completionMeta = {};
  try { completionMeta = JSON.parse(localStorage.getItem("completedSessions") || "{}"); } catch {}
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}

  const loggedDates = new Set(workouts.map(w => w.date));
  const completedIds = new Set(Object.keys(completionMeta));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const missed = [];
  schedule.forEach(s => {
    if (s.date >= today || s.date < cutoffStr) return;
    const cardId = `session-sw-${s.id}`;
    const isCompleted = completedIds.has(cardId);
    const hasLoggedWorkout = loggedDates.has(s.date);
    if (!isCompleted && !hasLoggedWorkout) {
      missed.push({ date: s.date, session: s });
    }
  });

  return missed.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get the number of consecutive days since the user last engaged
 * (logged a workout, logged a meal, or logged hydration).
 */
function getDaysSinceLastActivity() {
  const today = new Date();
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}
  let meals = [];
  try { meals = JSON.parse(localStorage.getItem("meals") || "[]"); } catch {}
  let hydLog = {};
  try { hydLog = JSON.parse(localStorage.getItem("hydrationLog") || "{}"); } catch {}

  const allDates = new Set();
  workouts.forEach(w => allDates.add(w.date));
  meals.forEach(m => allDates.add(m.date));
  Object.keys(hydLog).forEach(d => { if (hydLog[d] > 0) allDates.add(d); });

  if (allDates.size === 0) return 7; // No history — treat as ~1 week gap

  const sorted = [...allDates].sort().reverse();
  const lastDate = new Date(sorted[0] + "T12:00:00");
  const diffMs = today.getTime() - lastDate.getTime();
  return Math.floor(diffMs / 86400000);
}

/* =====================================================================
   CONSISTENCY STREAK (forgiven — X of last 7 days)
   ===================================================================== */

/**
 * Calculates a "consistency score": how many of the last 7 days the user was active.
 * More forgiving than a perfect streak — you can miss a day and still maintain it.
 */
function getConsistencyStreak() {
  const today = new Date();
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}
  let completionMeta = {};
  try { completionMeta = JSON.parse(localStorage.getItem("completedSessions") || "{}"); } catch {}
  let meals = [];
  try { meals = JSON.parse(localStorage.getItem("meals") || "[]"); } catch {}
  let hydLog = {};
  try { hydLog = JSON.parse(localStorage.getItem("hydrationLog") || "{}"); } catch {}

  let activeDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);

    const hasWorkout = workouts.some(w => w.date === ds);
    const hasMeal = meals.some(m => m.date === ds);
    const hasHydration = (hydLog[ds] || 0) > 0;
    // Also count completed scheduled sessions
    const hasCompletion = Object.values(completionMeta).some(c => c.date === ds);

    if (hasWorkout || hasMeal || hasHydration || hasCompletion) {
      activeDays++;
    }
  }

  return { activeDays, outOf: 7 };
}

/**
 * Get the longest current "active streak" — consecutive days with any activity.
 */
function getCurrentStreak() {
  const today = new Date();
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}
  let meals = [];
  try { meals = JSON.parse(localStorage.getItem("meals") || "[]"); } catch {}
  let hydLog = {};
  try { hydLog = JSON.parse(localStorage.getItem("hydrationLog") || "{}"); } catch {}

  const activeDates = new Set();
  workouts.forEach(w => activeDates.add(w.date));
  meals.forEach(m => activeDates.add(m.date));
  Object.keys(hydLog).forEach(d => { if (hydLog[d] > 0) activeDates.add(d); });

  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (activeDates.has(ds)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/* =====================================================================
   FALLBACK PLANS & WELCOME BACK
   ===================================================================== */

/**
 * Generates a fallback/welcome-back plan when the user returns after missed days.
 * Returns { type, title, message, actions } or null if not applicable.
 */
function getAdherencePrompt() {
  if (isAdherenceDismissedToday()) return null;

  const daysSince = getDaysSinceLastActivity();
  const missed = detectMissedDays(7);

  // Welcome back after 3+ day gap
  if (daysSince >= 3) {
    return {
      type: "welcome-back",
      title: "Welcome Back",
      message: "Life happens. Here's an easy way back in — no pressure, just show up.",
      actions: [
        { label: "Quick Workout (20 min)", action: "quickWorkout" },
        { label: "Just Log a Meal", action: "logMeal" },
        { label: "Start with Hydration", action: "logWater" },
      ],
    };
  }

  // Missed days this week — offer to reschedule
  if (missed.length >= 2) {
    return {
      type: "reschedule",
      title: "Adjust Your Week",
      message: `You missed ${missed.length} session${missed.length > 1 ? "s" : ""} this week. Want to reschedule?`,
      actions: [
        { label: "Compress Remaining Days", action: "compress" },
        { label: "Start Fresh Next Week", action: "freshStart" },
        { label: "Keep Going As-Is", action: "dismiss" },
      ],
      missed: missed,
    };
  }

  // Single missed day — gentle nudge, but only for *yesterday's* miss.
  // Anything older is stale; we don't want to nag about a Sunday session on Tuesday.
  if (missed.length === 1) {
    const m = missed[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    if (m.date !== yesterdayStr) return null;
    return {
      type: "missed-single",
      title: "Pick Up Where You Left Off",
      message: `You had "${escHtml(m.session.sessionName)}" planned for ${formatMissedDate(m.date)}. No worries — let's keep moving.`,
      actions: [
        { label: "Do It Today", action: "moveToday", sessionId: m.session.id },
        { label: "Skip It", action: "dismiss" },
      ],
    };
  }

  return null;
}

function formatMissedDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[d.getDay()];
}

/* =====================================================================
   ADAPTIVE RESCHEDULING
   ===================================================================== */

/**
 * Compresses remaining scheduled workouts into available days this week.
 * Moves unfinished sessions forward without stacking more than 1 per day.
 */
function compressWeekSchedule() {
  const today = getTodayString();
  const todayDate = new Date();
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
  let completionMeta = {};
  try { completionMeta = JSON.parse(localStorage.getItem("completedSessions") || "{}"); } catch {}

  // Find end of current week (Sunday)
  const endOfWeek = new Date(todayDate);
  const daysToSun = 7 - todayDate.getDay();
  endOfWeek.setDate(endOfWeek.getDate() + (daysToSun === 7 ? 0 : daysToSun));
  const endStr = endOfWeek.toISOString().slice(0, 10);

  // Find incomplete sessions this week (past and future)
  const startOfWeek = new Date(todayDate);
  startOfWeek.setDate(startOfWeek.getDate() - todayDate.getDay());
  const startStr = startOfWeek.toISOString().slice(0, 10);

  const weekSessions = schedule.filter(s => s.date >= startStr && s.date <= endStr);
  const incomplete = weekSessions.filter(s => {
    const cardId = `session-sw-${s.id}`;
    return !completionMeta[cardId] && s.date < today;
  });

  if (incomplete.length === 0) return 0;

  // Find available days (today through end of week, no existing sessions)
  const scheduledDates = new Set(weekSessions.filter(s => s.date >= today).map(s => s.date));
  const availableDays = [];
  for (let d = new Date(todayDate); d <= endOfWeek; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    if (!scheduledDates.has(ds)) {
      availableDays.push(ds);
    }
  }

  // Move incomplete sessions to available days
  let moved = 0;
  incomplete.forEach(session => {
    if (availableDays.length === 0) return;
    const newDate = availableDays.shift();
    const idx = schedule.findIndex(s => s.id === session.id);
    if (idx !== -1) {
      schedule[idx].date = newDate;
      schedule[idx].rescheduled = true;
      moved++;
    }
  });

  localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();
  return moved;
}

/* =====================================================================
   UI RENDERING
   ===================================================================== */

/**
 * Renders the adherence prompt banner on the home tab.
 * Called from renderDayDetail or renderGreeting.
 */
function buildAdherencePrompt() {
  const prompt = getAdherencePrompt();
  if (!prompt) return "";

  const iconMap = {
    "welcome-back": ICONS.home,
    "reschedule": ICONS.calendar,
    "missed-single": ICONS.refreshCw,
  };

  const actionsHtml = prompt.actions.map(a => {
    let onclick = "";
    switch (a.action) {
      case "quickWorkout":
        onclick = `generateQuickWorkout(this)`;
        break;
      case "logMeal":
        onclick = `showTab('nutrition')`;
        break;
      case "logWater":
        onclick = `if(typeof logWater==='function') logWater()`;
        break;
      case "compress":
        onclick = `handleCompressWeek()`;
        break;
      case "freshStart":
        onclick = `dismissAdherencePrompt()`;
        break;
      case "moveToday":
        onclick = `moveMissedToToday('${a.sessionId}')`;
        break;
      case "dismiss":
        onclick = `dismissAdherencePrompt()`;
        break;
    }
    return `<button class="adherence-action-btn" onclick="${onclick}">${escHtml(a.label)}</button>`;
  }).join("");

  return `
    <div class="adherence-prompt adherence-${prompt.type}" id="adherence-prompt">
      <div class="adherence-header">
        <span class="adherence-icon">${iconMap[prompt.type] || ICONS.lightbulb}</span>
        <div class="adherence-text">
          <div class="adherence-title">${escHtml(prompt.title)}</div>
          <div class="adherence-message">${prompt.message}</div>
        </div>
        <button class="adherence-dismiss" onclick="dismissAdherencePrompt()" title="Dismiss"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
      </div>
      <div class="adherence-actions">${actionsHtml}</div>
    </div>`;
}

/**
 * Renders a consistency streak badge for the home greeting area.
 */
function buildConsistencyBadge() {
  const streak = getConsistencyStreak();
  const currentStreak = getCurrentStreak();

  let streakText = "";
  if (currentStreak >= 7) {
    streakText = `${currentStreak}-day streak!`;
  } else if (streak.activeDays >= 5) {
    streakText = `${streak.activeDays}/7 days active (last 7 days)`;
  } else if (streak.activeDays > 0) {
    streakText = `${streak.activeDays}/7 days active (last 7 days)`;
  } else {
    return "";
  }

  return `<span class="consistency-badge">${ICONS.flame} ${streakText}</span>`;
}

/* =====================================================================
   ACTION HANDLERS
   ===================================================================== */

function dismissAdherencePrompt() {
  const el = document.getElementById("adherence-prompt");
  if (el) el.style.display = "none";
  // Remember dismissal for today so it doesn't reappear
  localStorage.setItem("adherenceDismissed", getTodayString());
}

function handleCompressWeek() {
  const moved = compressWeekSchedule();
  if (moved > 0) {
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof selectDay === "function") selectDay(getTodayString());
  }
  dismissAdherencePrompt();
}

function moveMissedToToday(sessionId) {
  const today = getTodayString();
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
  const idx = schedule.findIndex(s => String(s.id) === String(sessionId));
  if (idx !== -1) {
    schedule[idx].date = today;
    schedule[idx].rescheduled = true;
    localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof selectDay === "function") selectDay(today);
  }
  dismissAdherencePrompt();
}

/**
 * Generate a quick 20-minute workout via Claude API based on user profile and context.
 */
async function generateQuickWorkout(btn) {
  // Show loading state
  const origText = btn.textContent;
  btn.textContent = "Generating...";
  btn.disabled = true;

  // Gather user context
  let profile = {};
  try { profile = JSON.parse(localStorage.getItem("profile") || "{}"); } catch {}
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}

  const daysSince = getDaysSinceLastActivity();
  const today = getTodayString();

  // Recent workout history (last 5)
  const recentWorkouts = workouts
    .filter(w => w.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map(w => `${w.date}: ${w.type || "general"} - ${w.name || w.sessionName || "workout"}`)
    .join("\n");

  const profileCtx = [
    profile.sport ? `Sport: ${profile.sport}` : "",
    profile.level ? `Level: ${profile.level}` : "",
    profile.age ? `Age: ${profile.age}` : "",
    profile.weight ? `Weight: ${profile.weight} ${profile.weightUnit || "lbs"}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `You are a fitness coach. Generate a quick 20-minute comeback workout for someone who hasn't trained in ${daysSince} days.

${profileCtx ? profileCtx + "\n" : ""}${recentWorkouts ? "Recent history:\n" + recentWorkouts + "\n" : ""}
Requirements:
- Exactly 20 minutes total
- Low-to-moderate intensity — this is a comeback session, not a max effort
- Include warmup and cooldown
- Keep it simple and achievable
- If the user's sport is known, make it sport-relevant; otherwise make it a general bodyweight/cardio session
- Title should be descriptive of the workout content (e.g. "Easy Comeback Run", "Bodyweight Circuit"), NOT include the number of days off

Return ONLY valid JSON, no markdown:
{"title":"Session Title","type":"easy","intervals":[{"name":"Phase name","duration":"X min","effort":"Easy|Moderate","details":"Brief instruction"}]}`;

  try {
    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    });

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse AI response");

    const workout = JSON.parse(jsonMatch[0]);

    // Save to workoutSchedule so it appears on today's calendar
    const entry = {
      id: generateId("quick"),
      date: today,
      type: profile.sport || "general",
      sessionName: workout.title || "Quick Comeback Workout",
      source: "generated",
      level: "easy",
      aiSession: {
        title: workout.title || "Quick Comeback Workout",
        intervals: (workout.intervals || []).map(i => ({
          name: i.name,
          duration: i.duration,
          effort: i.effort || "low",
          details: i.details || ""
        }))
      }
    };

    schedule.push(entry);
    localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();

    // Refresh UI
    dismissAdherencePrompt();
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof selectDay === "function") selectDay(today);
    if (typeof showTab === "function") showTab("home");

  } catch (err) {
    console.error("Quick workout generation failed:", err);
    alert("Failed to generate workout: " + err.message);
    btn.textContent = origText;
    btn.disabled = false;
  }
}

/**
 * Check if the adherence prompt was already dismissed today.
 */
function isAdherenceDismissedToday() {
  return localStorage.getItem("adherenceDismissed") === getTodayString();
}
