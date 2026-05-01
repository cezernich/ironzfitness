// stack.js — Stacked-Day gamification.
//
// A "Stacked Day" = all three home pillars filled on the same date:
//   1. Workouts:  every scheduled session marked complete (rest day = auto-fill)
//   2. Hydration: ≥100% of daily target oz
//   3. Nutrition: calories within goal-aware range AND protein ≥ target
//
// History is stored in localStorage `stackedDayHistory` (array of YYYY-MM-DD
// strings) and synced cross-device via DB.syncKey. The "celebrated today"
// flag lives in `stackCelebratedFor` so the animation never double-fires
// across devices.

(function () {
  "use strict";

  const HISTORY_KEY = "stackedDayHistory";
  const CELEBRATED_KEY = "stackCelebratedFor";

  function _today() {
    return (typeof getTodayString === "function") ? getTodayString() : new Date().toISOString().slice(0, 10);
  }

  function _addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function _loadHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }

  function _saveHistory(arr) {
    const dedup = Array.from(new Set(arr)).sort();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(dedup));
    if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey(HISTORY_KEY);
  }

  // ── Pillar checks ─────────────────────────────────────────────────────────

  function _workoutsFilled(dateStr) {
    if (typeof getDataForDate !== "function") return false;
    const data = getDataForDate(dateStr);
    const allSessions = (data.planEntry ? 1 : 0) + data.scheduledWorkouts.length;
    const totalSessions = allSessions + data.loggedWorkouts.length;

    // Rest day = no scheduled sessions, OR an active "remove" restriction.
    // Both count as auto-filled — rest IS the workout.
    const isRestDay = totalSessions === 0
      || (data.restriction && data.restriction.action === "remove");
    if (isRestDay) return true;

    let completed = 0;
    if (data.planEntry && typeof isSessionComplete === "function"
        && isSessionComplete(`session-plan-${dateStr}-${data.planEntry.raceId}`)) completed++;
    data.scheduledWorkouts.forEach(w => {
      if (typeof isSessionComplete === "function" && isSessionComplete(`session-sw-${w.id}`)) completed++;
    });
    data.loggedWorkouts.forEach(w => {
      if (w.fromSaved || (typeof isSessionComplete === "function" && isSessionComplete(`session-log-${w.id}`))) completed++;
    });
    return completed >= totalSessions;
  }

  function _hydrationFilled(dateStr) {
    if (typeof isHydrationEnabled === "function" && !isHydrationEnabled()) return true;
    if (typeof getHydrationBreakdownForDate !== "function") return false;
    if (typeof getEffectiveOzForDate !== "function") return false;
    try {
      const targetOz = getHydrationBreakdownForDate(dateStr).totalOz || 0;
      if (targetOz <= 0) return false;
      const eff = getEffectiveOzForDate(dateStr) || 0;
      return eff >= targetOz;
    } catch { return false; }
  }

  function _nutritionFilled(dateStr) {
    if (typeof isNutritionEnabled === "function" && !isNutritionEnabled()) return true;
    if (typeof getDailyNutritionTarget !== "function") return false;

    let meals = [];
    try {
      meals = (JSON.parse(localStorage.getItem("meals")) || []).filter(m => m.date === dateStr);
    } catch { meals = []; }
    if (!meals.length) return false;

    const target = getDailyNutritionTarget(dateStr);
    const eaten = meals.reduce((acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein:  acc.protein  + (m.protein  || 0),
    }), { calories: 0, protein: 0 });

    if (target.protein > 0 && eaten.protein < target.protein) return false;

    let profile = {};
    try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}
    const goal = (typeof _normalizeGoalForMacroBars === "function")
      ? _normalizeGoalForMacroBars(profile.goal)
      : "general_fitness";

    const pct = target.calories > 0 ? (eaten.calories / target.calories) * 100 : 0;

    // Mirror _macroBarColor: green band = stack-eligible.
    if (pct < 70) return false;
    if (goal === "fat_loss") {
      return pct >= 85 && pct <= 110;
    }
    return pct >= 100;
  }

  // ── Public ────────────────────────────────────────────────────────────────

  function getPillarState(dateStr) {
    const date = dateStr || _today();
    const workouts = _workoutsFilled(date);
    const hydration = _hydrationFilled(date);
    const nutrition = _nutritionFilled(date);
    return { date, workouts, hydration, nutrition, hit: workouts && hydration && nutrition };
  }

  function isStackHit(dateStr) {
    return getPillarState(dateStr).hit;
  }

  // Idempotent: records the date in history if hit, otherwise no-op.
  // Returns true if this call newly added the date.
  function recordStackIfHit(dateStr) {
    const date = dateStr || _today();
    if (!isStackHit(date)) return false;
    const history = _loadHistory();
    if (history.includes(date)) return false;
    history.push(date);
    _saveHistory(history);
    return true;
  }

  // Reconcile: keeps history in sync with the underlying data both
  // ways. Add when hit, remove when previously-recorded but no longer
  // hit (e.g. user deleted the meal/workout/water that completed the
  // stack). When today is revoked, also clear the celebrated flag so
  // re-completing later in the day fires the toast again.
  function reconcileStack(dateStr) {
    const date = dateStr || _today();
    const history = _loadHistory();
    const inHistory = history.includes(date);
    const hit = isStackHit(date);

    if (hit && !inHistory) {
      history.push(date);
      _saveHistory(history);
      console.log("[Stack] reconcile: added", date, "(now hit)");
      return "added";
    }
    if (!hit && inHistory) {
      const next = history.filter(d => d !== date);
      _saveHistory(next);
      if (date === _today() && _alreadyCelebrated(date)) {
        // Revoking today's stack — un-arm the celebration so it can
        // fire again if the user re-completes later. Sync the cleared
        // value to Supabase too.
        localStorage.removeItem(CELEBRATED_KEY);
        if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey(CELEBRATED_KEY);
      }
      // Tear down any persistent badge / pill rendered earlier today.
      const badge = document.getElementById("stacked-day-badge");
      if (badge) try { badge.remove(); } catch {}
      console.log("[Stack] reconcile: revoked", date, "(no longer hit)");
      return "removed";
    }
    return "unchanged";
  }

  // Walks the history backward from today; tolerates a missed-but-not-yet
  // ended state (today not yet hit, but yesterday was → streak still alive).
  function getStackStreak() {
    const history = new Set(_loadHistory());
    if (!history.size) return { current: 0, brokeAt: null, brokeFromLength: 0 };

    const today = _today();
    let cursor;
    if (history.has(today)) cursor = today;
    else if (history.has(_addDays(today, -1))) cursor = _addDays(today, -1);
    else {
      // Streak broken or never started. Compute length of most recent run
      // so the UI can show "Stack streak ended at N".
      let probe = _addDays(today, -2);
      let length = 0;
      // Search up to 60 days back — beyond that we don't show a break.
      for (let i = 0; i < 60 && history.has(probe); i++) {
        length++;
        probe = _addDays(probe, -1);
      }
      return { current: 0, brokeAt: _addDays(today, -1), brokeFromLength: length };
    }

    let current = 1;
    let walk = _addDays(cursor, -1);
    while (history.has(walk)) {
      current++;
      walk = _addDays(walk, -1);
    }
    return { current, brokeAt: null, brokeFromLength: 0 };
  }

  function getBestStackStreak() {
    const history = _loadHistory().slice().sort();
    if (!history.length) return 0;
    let best = 1, run = 1;
    for (let i = 1; i < history.length; i++) {
      if (history[i] === _addDays(history[i - 1], 1)) {
        run++;
        if (run > best) best = run;
      } else {
        run = 1;
      }
    }
    return best;
  }

  // ── Celebration ───────────────────────────────────────────────────────────

  function _alreadyCelebrated(dateStr) {
    return localStorage.getItem(CELEBRATED_KEY) === dateStr;
  }

  function _markCelebrated(dateStr) {
    localStorage.setItem(CELEBRATED_KEY, dateStr);
    if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey(CELEBRATED_KEY);
  }

  function _haptic() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
        window.Capacitor.Plugins.Haptics.impact({ style: "light" });
      } else if (navigator.vibrate) {
        navigator.vibrate(20);
      }
    } catch {}
  }

  function _runCelebrationAnimation() {
    // Two surfaces, both anchored to the viewport (not the rings) so
    // the user sees them regardless of scroll position:
    //   1. Big lightning bolt flash at center of screen — primary,
    //      brand-red, slow enough to actually register (~1.7s total).
    //   2. Toast pill at top with "Stacked Day · Day N".
    _runCelebrationFlash();
    _runCelebrationToast();
    _haptic();
  }

  function _runCelebrationFlash() {
    const existing = document.getElementById("stack-celebration-flash");
    if (existing) try { existing.remove(); } catch {}

    const flash = document.createElement("div");
    flash.id = "stack-celebration-flash";
    flash.className = "stack-flash";
    flash.setAttribute("aria-hidden", "true");
    flash.innerHTML = `
      <svg viewBox="0 0 24 24" fill="#dc2626" stroke="#dc2626" stroke-width="1" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>`;
    document.body.appendChild(flash);
    setTimeout(() => { try { flash.remove(); } catch {} }, 1800);
  }

  function _runCelebrationToast() {
    // Self-cleaning fixed-position banner. Slides down from above the
    // viewport, holds, slides back up. ~1.5s total — long enough to
    // read "Stacked Day · Day N", short enough not to interrupt the
    // logging flow that triggered it.
    const existing = document.getElementById("stack-celebration-toast");
    if (existing) try { existing.remove(); } catch {}

    const streak = getStackStreak();
    const dayN = streak.current || 1;
    const zap = (typeof ICONS !== "undefined" && ICONS.zap) ? ICONS.zap : "⚡";

    const toast = document.createElement("div");
    toast.id = "stack-celebration-toast";
    toast.className = "stack-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.innerHTML = `
      <span class="stack-toast-icon">${zap}</span>
      <span class="stack-toast-text">
        <span class="stack-toast-title">Stacked Day</span>
        <span class="stack-toast-sub">Day ${dayN}</span>
      </span>`;
    document.body.appendChild(toast);

    setTimeout(() => { toast.classList.add("stack-toast--out"); }, 1300);
    setTimeout(() => { try { toast.remove(); } catch {} }, 1700);
  }

  function _renderStackedBadge() {
    const host = document.getElementById("daily-rings");
    if (!host) return;
    if (document.getElementById("stacked-day-badge")) return;

    const streak = getStackStreak();
    const badge = document.createElement("div");
    badge.id = "stacked-day-badge";
    badge.className = "stacked-day-badge";
    const zap = (typeof ICONS !== "undefined" && ICONS.zap) ? ICONS.zap : "⚡";
    badge.innerHTML = `<span class="sd-badge-icon">${zap}</span><span class="sd-badge-text">Stacked Day · Day ${streak.current}</span>`;
    host.parentNode.insertBefore(badge, host.nextSibling);
  }

  function maybeFireStackCelebration(dateStr) {
    const date = dateStr || _today();
    if (date !== _today()) {
      console.log("[Stack] skip celebration — not today:", date);
      return false;
    }
    const state = getPillarState(date);
    if (!state.hit) {
      console.log("[Stack] skip celebration — pillars not all filled:",
        { workouts: state.workouts, hydration: state.hydration, nutrition: state.nutrition });
      return false;
    }
    if (_alreadyCelebrated(date)) {
      console.log("[Stack] already celebrated", date, "— re-rendering badge only");
      _renderStackedBadge();
      return false;
    }
    console.log("[Stack] FIRING celebration for", date);
    _markCelebrated(date);
    _runCelebrationAnimation();
    setTimeout(_renderStackedBadge, 400);
    // Refresh the streak pill so the new count is visible immediately.
    if (typeof renderGreeting === "function") {
      setTimeout(() => { try { renderGreeting(); } catch {} }, 600);
    }
    return true;
  }

  // ── Pill + history popover ────────────────────────────────────────────────

  function buildStackPill() {
    const streak = getStackStreak();
    if (streak.current <= 0 && streak.brokeFromLength <= 0) return "";
    const zap = (typeof ICONS !== "undefined" && ICONS.zap) ? ICONS.zap : "⚡";
    const label = streak.current > 0
      ? `${streak.current}-day stack`
      : `Stack streak ended at ${streak.brokeFromLength}`;
    return `<button type="button" class="stack-pill" onclick="StackUX.toggleStackHistory(this)" aria-expanded="false">${zap} ${label}</button>`;
  }

  function _renderStackHistoryDots() {
    const today = _today();
    const dots = [];
    for (let i = 13; i >= 0; i--) {
      const d = _addDays(today, -i);
      const state = getPillarState(d);
      let cls = "sd-dot-empty";
      let label = "none";
      if (state.hit) { cls = "sd-dot-full"; label = "stacked"; }
      else {
        const partial = (state.workouts ? 1 : 0) + (state.hydration ? 1 : 0) + (state.nutrition ? 1 : 0);
        if (partial > 0) { cls = "sd-dot-partial"; label = `${partial}/3 pillars`; }
      }
      const isToday = i === 0;
      const todayCls = isToday ? " sd-dot-today" : "";
      const todayLabel = isToday ? " (today)" : "";
      dots.push(`<span class="sd-dot ${cls}${todayCls}" title="${d}${todayLabel} — ${label}"></span>`);
    }
    const streak = getStackStreak();
    let footer = "";
    if (streak.current === 0 && streak.brokeFromLength > 0) {
      footer = `<div class="sd-history-break">Stack streak ended at ${streak.brokeFromLength}. New streak starts today.</div>`;
    }
    return `
      <div class="sd-history-row">${dots.join("")}</div>
      <div class="sd-history-legend">
        <span><span class="sd-dot sd-dot-full"></span> Stacked</span>
        <span><span class="sd-dot sd-dot-partial"></span> Partial</span>
        <span><span class="sd-dot sd-dot-empty"></span> None</span>
      </div>
      ${footer}`;
  }

  function toggleStackHistory(btn) {
    if (!btn) return;
    const existing = document.getElementById("stack-history-panel");
    if (existing) {
      existing.remove();
      btn.setAttribute("aria-expanded", "false");
      return;
    }
    const panel = document.createElement("div");
    panel.id = "stack-history-panel";
    panel.className = "stack-history-panel";
    panel.innerHTML = _renderStackHistoryDots();
    // Drop the panel after the greeting line so it doesn't interrupt
    // the pill row layout.
    const greeting = document.getElementById("home-greeting");
    if (greeting && greeting.parentNode) {
      greeting.parentNode.insertBefore(panel, greeting.nextSibling);
    } else {
      btn.parentNode.insertBefore(panel, btn.nextSibling);
    }
    btn.setAttribute("aria-expanded", "true");
  }

  // ── Public surface ────────────────────────────────────────────────────────

  // Debug-only: force the toast + ring pulse to play, bypassing the
  // pillar check and the once-per-day gate. Doesn't mark celebrated
  // and doesn't touch history. Useful from the console:
  //   StackUX.previewCelebration()
  function previewCelebration() {
    _runCelebrationAnimation();
  }

  window.StackUX = {
    getPillarState,
    isStackHit,
    recordStackIfHit,
    reconcileStack,
    getStackStreak,
    getBestStackStreak,
    maybeFireStackCelebration,
    buildStackPill,
    toggleStackHistory,
    previewCelebration,
  };
})();
