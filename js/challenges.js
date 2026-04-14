// challenges.js — Cohorts & Micro-Challenges

/* =====================================================================
   CHALLENGE DEFINITIONS
   ===================================================================== */

const AVAILABLE_CHALLENGES = [
  { id: "hydration-7",   name: "7-Day Hydration Hero",  duration: 7,  type: "hydration",   goal: "Hit hydration target every day",    icon: ICONS.droplet },
  { id: "consistency-30", name: "30-Day Iron Streak",    duration: 30, type: "consistency", goal: "Log any activity 30 days straight", icon: ICONS.flame },
  { id: "nutrition-14",  name: "14-Day Fuel Focus",      duration: 14, type: "nutrition",   goal: "Log at least one meal every day",   icon: ICONS.utensils },
  { id: "strength-7",    name: "7-Day Strength Sprint",  duration: 7,  type: "workout",     goal: "Complete all scheduled workouts",   icon: ICONS.weights },
];

const FAKE_PARTICIPANTS = [
  "Runner42", "FitMom_88", "IronWill_7", "TrailBoss", "LiftHeavy99",
  "ZenYogi_3", "SprintKing", "GymRat_22", "MileEater", "SweatFactory",
  "CoreCrusher", "PedalPush", "RepQueen_5", "BurnZone", "StridePro_11",
];

/* =====================================================================
   LOCAL STORAGE HELPERS
   ===================================================================== */

function _loadActiveChallenges() {
  try { return JSON.parse(localStorage.getItem("activeChallenges") || "[]"); } catch { return []; }
}

function _saveActiveChallenges(arr) {
  localStorage.setItem("activeChallenges", JSON.stringify(arr)); if (typeof DB !== 'undefined') DB.syncKey('activeChallenges');
}

function _loadCompletedChallenges() {
  try { return JSON.parse(localStorage.getItem("completedChallenges") || "[]"); } catch { return []; }
}

function _saveCompletedChallenges(arr) {
  localStorage.setItem("completedChallenges", JSON.stringify(arr)); if (typeof DB !== 'undefined') DB.syncKey('completedChallenges');
}

/* =====================================================================
   JOIN / COMPLETE
   ===================================================================== */

function joinChallenge(challengeId) {
  const active = _loadActiveChallenges();
  if (active.find(c => c.challengeId === challengeId)) return; // already joined

  const def = AVAILABLE_CHALLENGES.find(c => c.id === challengeId);
  if (!def) return;

  const today = typeof getTodayString === "function" ? getTodayString() : new Date().toISOString().slice(0, 10);
  active.push({
    challengeId,
    startDate: today,
    seed: Math.floor(Math.random() * 10000), // for deterministic leaderboard
  });
  _saveActiveChallenges(active);
  renderChallenges();
}

function abandonChallenge(challengeId) {
  let active = _loadActiveChallenges();
  active = active.filter(c => c.challengeId !== challengeId);
  _saveActiveChallenges(active);
  renderChallenges();
}

function completeChallenge(challengeId) {
  const active = _loadActiveChallenges();
  const entry = active.find(c => c.challengeId === challengeId);
  if (!entry) return;

  const completed = _loadCompletedChallenges();
  const today = typeof getTodayString === "function" ? getTodayString() : new Date().toISOString().slice(0, 10);
  completed.push({
    challengeId,
    startDate: entry.startDate,
    completedDate: today,
    seed: entry.seed,
  });
  _saveCompletedChallenges(completed);

  // Remove from active
  _saveActiveChallenges(active.filter(c => c.challengeId !== challengeId));

  // Award achievement in leveling system if available
  if (typeof getEarnedAchievements === "function") {
    // Trigger a re-render of leveling which picks up achievements
    if (typeof renderLevelProgress === "function") renderLevelProgress();
  }

  renderChallenges();
}

/* =====================================================================
   PROGRESS CALCULATION
   ===================================================================== */

function getChallengeProgress(challengeId) {
  const active = _loadActiveChallenges();
  const entry = active.find(c => c.challengeId === challengeId);
  if (!entry) return null;

  const def = AVAILABLE_CHALLENGES.find(c => c.id === challengeId);
  if (!def) return null;

  const today = typeof getTodayString === "function" ? getTodayString() : new Date().toISOString().slice(0, 10);
  const startDate = new Date(entry.startDate + "T00:00:00");
  const todayDate = new Date(today + "T00:00:00");

  const daysPassed = Math.floor((todayDate - startDate) / 86400000) + 1;
  const totalDays = def.duration;
  const daysToCheck = Math.min(daysPassed, totalDays);

  // Build array of dates from start
  const days = [];
  for (let i = 0; i < daysToCheck; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({ date: dateStr, completed: _checkDayForChallenge(def.type, dateStr) });
  }

  const completedCount = days.filter(d => d.completed).length;
  const isFinished = daysPassed >= totalDays;
  const isSuccess = completedCount === totalDays;

  return {
    days,
    completedCount,
    totalDays,
    daysPassed,
    isFinished,
    isSuccess,
    pct: Math.round((completedCount / totalDays) * 100),
  };
}

function _checkDayForChallenge(type, dateStr) {
  switch (type) {
    case "hydration": return _checkHydrationDay(dateStr);
    case "consistency": return _checkActivityDay(dateStr);
    case "nutrition": return _checkNutritionDay(dateStr);
    case "workout": return _checkWorkoutDay(dateStr);
    default: return false;
  }
}

function _checkHydrationDay(dateStr) {
  try {
    const log = JSON.parse(localStorage.getItem("hydrationLog") || "{}");
    const entry = log[dateStr];
    if (!entry) return false;
    // Entry may be a number or { total, beverages }
    const total = typeof entry === "number" ? entry : (entry.total || 0);
    // Consider target met if any hydration logged (>= 1 glass/cup)
    return total > 0;
  } catch { return false; }
}

function _checkActivityDay(dateStr) {
  // Any workout or completed session on this date
  try {
    const workouts = JSON.parse(localStorage.getItem("workouts") || "[]");
    if (workouts.some(w => w.date === dateStr)) return true;

    const schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
    const completionMeta = JSON.parse(localStorage.getItem("completedSessions") || "{}");
    for (const s of schedule) {
      if (s.date === dateStr && completionMeta[`session-sw-${s.id}`]) return true;
    }

    const plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]");
    for (const p of plan) {
      if (p.date === dateStr) {
        const key = `session-plan-${p.raceId}-${p.discipline}-${p.date}`;
        if (completionMeta[key]) return true;
      }
    }
  } catch {}
  return false;
}

function _checkNutritionDay(dateStr) {
  try {
    const meals = JSON.parse(localStorage.getItem("meals") || "[]");
    return meals.some(m => m.date === dateStr);
  } catch { return false; }
}

function _checkWorkoutDay(dateStr) {
  // Check if ALL scheduled workouts on this date are completed
  try {
    const schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
    const completionMeta = JSON.parse(localStorage.getItem("completedSessions") || "{}");
    const daySchedule = schedule.filter(s => s.date === dateStr);
    if (daySchedule.length === 0) return true; // no scheduled = pass
    return daySchedule.every(s => completionMeta[`session-sw-${s.id}`]);
  } catch { return false; }
}

/* =====================================================================
   LEADERBOARD (SIMULATED)
   ===================================================================== */

function generateLeaderboard(challengeId, userPct) {
  const active = _loadActiveChallenges();
  const entry = active.find(c => c.challengeId === challengeId);
  const seed = entry ? entry.seed : 42;

  // Deterministic pseudo-random from seed
  let rng = seed;
  function nextRand() {
    rng = (rng * 16807 + 0) % 2147483647;
    return (rng & 0x7fffffff) / 2147483647;
  }

  // Pick 10 random fake names
  const shuffled = [...FAKE_PARTICIPANTS].sort(() => nextRand() - 0.5);
  const participants = shuffled.slice(0, 10).map(name => ({
    name,
    pct: Math.min(100, Math.max(5, Math.round(nextRand() * 100))),
  }));

  // Add user
  participants.push({ name: "You", pct: userPct, isUser: true });

  // Sort descending by pct
  participants.sort((a, b) => b.pct - a.pct);

  return participants.map((p, i) => ({ rank: i + 1, ...p }));
}

/* =====================================================================
   RENDERING
   ===================================================================== */

function renderChallenges() {
  const container = document.getElementById("challenges-content");
  if (!container) return;

  const active = _loadActiveChallenges();
  const completed = _loadCompletedChallenges();
  const activeIds = new Set(active.map(c => c.challengeId));
  const completedIds = new Set(completed.map(c => c.challengeId));

  let html = "";

  // Active challenges
  const activeDefs = active.map(a => {
    const def = AVAILABLE_CHALLENGES.find(c => c.id === a.challengeId);
    return def ? { def, entry: a } : null;
  }).filter(Boolean);

  if (activeDefs.length > 0) {
    html += `<h3 class="ch-section-title">Active Challenges</h3>`;
    activeDefs.forEach(({ def }) => {
      const progress = getChallengeProgress(def.id);
      if (progress) {
        // Auto-complete if finished and successful
        if (progress.isFinished && progress.isSuccess) {
          completeChallenge(def.id);
          return;
        }
        // Auto-fail if finished but not successful
        if (progress.isFinished && !progress.isSuccess) {
          abandonChallenge(def.id);
          return;
        }
        html += renderChallengeCard(def, progress);
      }
    });
  }

  // Available to join
  const available = AVAILABLE_CHALLENGES.filter(c => !activeIds.has(c.id) && !completedIds.has(c.id));
  if (available.length > 0) {
    html += `<h3 class="ch-section-title">Available Challenges</h3>`;
    available.forEach(def => {
      html += `
        <div class="ch-card ch-card--available">
          <div class="ch-card-header">
            <span class="ch-card-icon">${def.icon}</span>
            <div class="ch-card-info">
              <strong>${escHtml(def.name)}</strong>
              <span class="ch-card-goal">${escHtml(def.goal)}</span>
              <span class="ch-card-duration">${def.duration} days</span>
            </div>
          </div>
          <button class="btn-primary btn-sm" onclick="joinChallenge('${def.id}')">Join Challenge</button>
        </div>`;
    });
  }

  // Completed
  if (completed.length > 0) {
    html += `<h3 class="ch-section-title">Completed</h3>`;
    completed.forEach(c => {
      const def = AVAILABLE_CHALLENGES.find(d => d.id === c.challengeId);
      if (!def) return;
      html += `
        <div class="ch-card ch-card--completed">
          <div class="ch-card-header">
            <span class="ch-card-icon">${def.icon}</span>
            <div class="ch-card-info">
              <strong>${escHtml(def.name)}</strong>
              <span class="ch-card-goal">Completed ${c.completedDate}</span>
            </div>
          </div>
          <span class="ch-badge-done">${ICONS.check} Done</span>
        </div>`;
    });
  }

  if (!html) {
    html = `<p class="hint" style="text-align:center;padding:24px 0">No challenges available right now.</p>`;
  }

  container.innerHTML = html;
}

function renderChallengeCard(def, progress) {
  const leaderboard = generateLeaderboard(def.id, progress.pct);
  const userRank = leaderboard.find(p => p.isUser);

  // Day-by-day check marks
  let daysHtml = '<div class="ch-days">';
  for (let i = 0; i < progress.totalDays; i++) {
    const day = progress.days[i];
    let cls = "ch-day";
    if (day) {
      cls += day.completed ? " ch-day--done" : " ch-day--miss";
    } else {
      cls += " ch-day--future";
    }
    daysHtml += `<span class="${cls}" title="Day ${i + 1}">${day && day.completed ? "&#10003;" : (i + 1)}</span>`;
  }
  daysHtml += "</div>";

  // Progress bar
  const progressBar = `
    <div class="ch-progress">
      <div class="ch-progress-bar">
        <div class="ch-progress-fill" style="width:${progress.pct}%"></div>
      </div>
      <span class="ch-progress-text">${progress.completedCount}/${progress.totalDays} days (${progress.pct}%)</span>
    </div>`;

  // Leaderboard top 5
  let lbHtml = `<div class="ch-leaderboard">
    <div class="ch-lb-title">Leaderboard</div>`;
  leaderboard.slice(0, 5).forEach(p => {
    const cls = p.isUser ? "ch-lb-row ch-lb-row--user" : "ch-lb-row";
    lbHtml += `<div class="${cls}">
      <span class="ch-lb-rank">#${p.rank}</span>
      <span class="ch-lb-name">${escHtml(p.name)}</span>
      <span class="ch-lb-pct">${p.pct}%</span>
    </div>`;
  });
  // Show user if not in top 5
  if (userRank && userRank.rank > 5) {
    lbHtml += `<div class="ch-lb-row ch-lb-row--user ch-lb-row--sep">
      <span class="ch-lb-rank">#${userRank.rank}</span>
      <span class="ch-lb-name">You</span>
      <span class="ch-lb-pct">${userRank.pct}%</span>
    </div>`;
  }
  lbHtml += "</div>";

  return `
    <div class="ch-card ch-card--active">
      <div class="ch-card-header">
        <span class="ch-card-icon">${def.icon}</span>
        <div class="ch-card-info">
          <strong>${escHtml(def.name)}</strong>
          <span class="ch-card-goal">${escHtml(def.goal)}</span>
        </div>
      </div>
      ${progressBar}
      ${daysHtml}
      ${lbHtml}
      <button class="btn-sm ch-abandon-btn" onclick="abandonChallenge('${def.id}')">Leave Challenge</button>
    </div>`;
}
