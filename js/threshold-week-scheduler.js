// threshold-week-scheduler.js
// Deterministic scheduler for threshold weeks (deload + fitness retesting).
// Implements PHILOSOPHY_UPDATE_2026-04-09_threshold_weeks.md.
//
// Pure functions only — NO API calls. The philosophy engine is philosophy-first.
// Public surface: ThresholdWeekScheduler.* (browser global)

(function () {
  "use strict";

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const RACE_PREP_WINDOW_DAYS = 56; // 8 weeks
  const RACE_TAPER_WINDOW_DAYS = 14; // hard constraint: never inside this window
  const MIN_BUILD_WEEKS_BETWEEN = 3;

  const PHASE_DEFAULT_CADENCE = {
    race_prep: 4,
    base: 6,
    maintenance: 8,
  };

  // ─── Date helpers ────────────────────────────────────────────────────────────

  function toDate(value) {
    if (value instanceof Date) return new Date(value.getTime());
    if (typeof value === "string") return new Date(value + (value.length === 10 ? "T00:00:00" : ""));
    return null;
  }

  function toDateStr(d) {
    return d.toISOString().slice(0, 10);
  }

  function addDays(d, days) {
    const next = new Date(d.getTime());
    next.setDate(next.getDate() + days);
    return next;
  }

  function addWeeks(d, weeks) {
    return addDays(d, weeks * 7);
  }

  function diffDays(a, b) {
    return Math.round((toDate(a).getTime() - toDate(b).getTime()) / MS_PER_DAY);
  }

  // Snap a date to the Monday of its training week.
  function mondayOf(date) {
    const d = toDate(date);
    const dow = d.getDay(); // 0=Sun
    const offset = dow === 0 ? -6 : 1 - dow;
    return addDays(d, offset);
  }

  // ─── Phase detection ─────────────────────────────────────────────────────────

  /**
   * Determine the user's current training phase from their profile and goal race date.
   * Returns one of "race_prep" | "base" | "maintenance".
   */
  function detectPhase(userProfile, asOfDate) {
    const today = toDate(asOfDate || new Date());
    const raceDate = userProfile && userProfile.goal_race_date
      ? toDate(userProfile.goal_race_date)
      : null;

    if (raceDate && raceDate >= today) {
      const days = diffDays(raceDate, today);
      if (days <= RACE_PREP_WINDOW_DAYS) return "race_prep";
      return "base";
    }

    // No race scheduled. If the user has any active goal, treat as base; else maintenance.
    if (userProfile && (userProfile.active_goal || userProfile.goal)) {
      return "base";
    }
    return "maintenance";
  }

  /**
   * Resolve the cadence (in weeks) to use for this user. Phase default unless the user
   * has set an override in [4, 8].
   */
  function resolveCadence(userProfile, phase) {
    const override = userProfile && Number(userProfile.threshold_week_cadence_override);
    if (override >= 4 && override <= 8) return override;
    return PHASE_DEFAULT_CADENCE[phase] || 6;
  }

  // ─── Race window guard ───────────────────────────────────────────────────────

  /**
   * If a candidate threshold week would land within 14 days of a goal A race, push it
   * back to before the window (or return null if there's no room).
   */
  function applyRaceWindowGuard(candidateMonday, raceDate) {
    if (!raceDate) return candidateMonday;
    const race = toDate(raceDate);
    const earliestForbidden = addDays(race, -RACE_TAPER_WINDOW_DAYS);
    // The threshold *week* runs Mon..Sun. If any day of the week falls inside the
    // forbidden window, the whole week is forbidden.
    const candidateSunday = addDays(candidateMonday, 6);
    if (candidateSunday < earliestForbidden) {
      return candidateMonday; // safely before the window
    }
    if (candidateMonday > race) {
      return candidateMonday; // after the race entirely, fine
    }
    // Push back so the threshold week ends strictly before the forbidden window starts.
    const pushedMonday = mondayOf(addDays(earliestForbidden, -7));
    return pushedMonday;
  }

  // ─── Min-build-between guard ─────────────────────────────────────────────────

  /**
   * Enforce the "minimum 3 weeks of build between threshold weeks" constraint.
   * Returns the candidate Monday slid forward if necessary.
   */
  function applyMinBuildGuard(candidateMonday, lastThresholdMonday) {
    if (!lastThresholdMonday) return candidateMonday;
    const last = toDate(lastThresholdMonday);
    const minNext = addWeeks(last, MIN_BUILD_WEEKS_BETWEEN + 1); // build weeks + the threshold week itself
    return candidateMonday < minNext ? minNext : candidateMonday;
  }

  // ─── Core: when does the next threshold week fall? ───────────────────────────

  /**
   * Compute the next threshold week start date.
   * Inputs:
   *   userProfile: { goal_race_date?, threshold_week_cadence_override?, active_goal?, ... }
   *   lastThresholdWeekDate: ISO date string or Date | null
   *   currentPlanStartDate: ISO date string or Date
   *   asOfDate: optional override for "today" (used in tests)
   * Returns: { thresholdWeekStartDate: Date, cadenceUsed: number, phase: string, reason: string }
   *          or { thresholdWeekStartDate: null, ... } if no slot is available before the race.
   */
  function computeNextThresholdWeek(userProfile, lastThresholdWeekDate, currentPlanStartDate, asOfDate) {
    const phase = detectPhase(userProfile, asOfDate);
    const cadence = resolveCadence(userProfile, phase);

    let candidate;
    if (lastThresholdWeekDate) {
      candidate = mondayOf(addWeeks(toDate(lastThresholdWeekDate), cadence));
    } else {
      // First threshold week: one full build cycle into the plan, NOT week 1.
      candidate = mondayOf(addWeeks(toDate(currentPlanStartDate), cadence));
    }

    candidate = applyMinBuildGuard(candidate, lastThresholdWeekDate);

    const raceDate = userProfile && userProfile.goal_race_date
      ? toDate(userProfile.goal_race_date)
      : null;

    const guarded = applyRaceWindowGuard(candidate, raceDate);

    // If guarded was pushed back so far it's before lastThresholdWeekDate + min build,
    // there is no valid slot before the race.
    if (raceDate && lastThresholdWeekDate) {
      const minNext = addWeeks(toDate(lastThresholdWeekDate), MIN_BUILD_WEEKS_BETWEEN + 1);
      if (guarded < minNext) {
        return {
          thresholdWeekStartDate: null,
          cadenceUsed: cadence,
          phase,
          reason: "no_slot_before_race",
        };
      }
    }

    return {
      thresholdWeekStartDate: guarded,
      cadenceUsed: cadence,
      phase,
      reason: guarded.getTime() === candidate.getTime() ? "scheduled" : "shifted_by_race_window",
    };
  }

  /**
   * Build the full list of threshold week Mondays for a plan running from
   * `planStartDate` to `planEndDate`. Used by planner.js to mark weeks in advance.
   */
  function listThresholdWeeksForPlan(userProfile, planStartDate, planEndDate, lastThresholdWeekDate) {
    const start = toDate(planStartDate);
    const end = toDate(planEndDate);
    const out = [];
    let last = lastThresholdWeekDate ? toDate(lastThresholdWeekDate) : null;
    let safety = 0;
    while (safety++ < 200) {
      const next = computeNextThresholdWeek(userProfile, last, start, start);
      if (!next.thresholdWeekStartDate) break;
      if (next.thresholdWeekStartDate > end) break;
      if (next.thresholdWeekStartDate < start) {
        last = next.thresholdWeekStartDate;
        continue;
      }
      out.push(next);
      last = next.thresholdWeekStartDate;
    }
    return out;
  }

  /**
   * Decide whether a given week (identified by its Monday) is a threshold week.
   * Used inside generateTrainingWeek / generateTrainingPlan.
   */
  function shouldThisBeAThresholdWeek(weekMonday, scheduledThresholdWeeks) {
    const target = toDateStr(mondayOf(weekMonday));
    return scheduledThresholdWeeks.some(t => toDateStr(t.thresholdWeekStartDate) === target);
  }

  // ─── Skip handling ───────────────────────────────────────────────────────────

  /**
   * Mark a scheduled threshold week as skipped. Persists the skip to localStorage so
   * the next call to the scheduler treats `skipDate` as the new lastThresholdWeekDate.
   * Slide-on-skip: the next threshold week falls N weeks AFTER the skip, not N-1.
   */
  function markThresholdWeekSkipped(skipDate) {
    const ds = typeof skipDate === "string" ? skipDate : toDateStr(toDate(skipDate));
    let userData = {};
    try { userData = JSON.parse(localStorage.getItem("user_data") || "{}"); } catch {}
    const history = Array.isArray(userData.threshold_week_history) ? userData.threshold_week_history : [];
    history.push({ date: ds, status: "skipped", recorded_at: new Date().toISOString() });
    userData.threshold_week_history = history;
    userData.last_threshold_week_date = ds; // slide: treat skip as the anchor
    try {
      localStorage.setItem("user_data", JSON.stringify(userData));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("user_data");
    } catch {}
    return userData;
  }

  function recordThresholdWeekCompleted(completionDate, testsRun) {
    const ds = typeof completionDate === "string" ? completionDate : toDateStr(toDate(completionDate));
    let userData = {};
    try { userData = JSON.parse(localStorage.getItem("user_data") || "{}"); } catch {}
    const history = Array.isArray(userData.threshold_week_history) ? userData.threshold_week_history : [];
    history.push({
      date: ds,
      status: "completed",
      tests: testsRun || [],
      recorded_at: new Date().toISOString(),
    });
    userData.threshold_week_history = history;
    userData.last_threshold_week_date = ds;
    try {
      localStorage.setItem("user_data", JSON.stringify(userData));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("user_data");
    } catch {}
    return userData;
  }

  function getLastThresholdWeekDate() {
    try {
      const ud = JSON.parse(localStorage.getItem("user_data") || "{}");
      return ud.last_threshold_week_date || null;
    } catch { return null; }
  }

  // ─── Week structure templates ────────────────────────────────────────────────

  // The single-sport athlete week. Day index: 0 = Monday.
  const SINGLE_SPORT_WEEK = [
    { dayIdx: 0, type: "easy",     duration_min: 35, intensity: "Z1", note: "Easy 30-40 min Z1" },
    { dayIdx: 1, type: "easy",     duration_min: 35, intensity: "Z1", note: "Easy + 4x20s strides" },
    { dayIdx: 2, type: "rest",     duration_min: 20, intensity: "Z1", note: "Rest or 20 min Z1" },
    { dayIdx: 3, type: "test",     duration_min: 50, intensity: "all-out test", note: "5K Time Trial" },
    { dayIdx: 4, type: "easy",     duration_min: 35, intensity: "Z1", note: "Easy 30-40 min Z1" },
    { dayIdx: 5, type: "optional", duration_min: 50, intensity: "Z1", note: "Optional 45-60 min Z1 (skip if test was hard)" },
    { dayIdx: 6, type: "rest",     duration_min: 0,  intensity: "rest", note: "Rest" },
  ];

  // Triathlete week. Tests on Thursday (swim CSS), Friday (bike FTP), Saturday (run 5K).
  const TRIATHLON_WEEK = [
    { dayIdx: 0, type: "easy_swim", duration_min: 30, intensity: "Z1", note: "Easy swim 30 min Z1" },
    { dayIdx: 1, type: "easy_bike", duration_min: 45, intensity: "Z1", note: "Easy bike 45 min Z1" },
    { dayIdx: 2, type: "easy_run",  duration_min: 30, intensity: "Z1", note: "Easy run 30 min Z1" },
    { dayIdx: 3, type: "swim_test", duration_min: 40, intensity: "test", note: "CSS Test" },
    { dayIdx: 4, type: "bike_test", duration_min: 45, intensity: "test", note: "FTP Test" },
    { dayIdx: 5, type: "run_test",  duration_min: 50, intensity: "test", note: "5K Time Trial" },
    { dayIdx: 6, type: "rest",      duration_min: 0,  intensity: "rest", note: "Rest or 30 min easy spin" },
  ];

  /**
   * Resolve the threshold-week template for a given sport profile.
   * Triathletes get the multi-test template; everyone else gets the single-sport version.
   */
  function getWeekTemplate(sportProfile) {
    if (sportProfile === "triathlon" || sportProfile === "hybrid") return TRIATHLON_WEEK;
    return SINGLE_SPORT_WEEK;
  }

  /**
   * Build a concrete plan-of-the-week (Mon..Sun dated entries) from the template.
   * Returns an array of { date, dayIdx, ...templateEntry }.
   */
  function buildThresholdWeekDays(weekMonday, sportProfile) {
    const template = getWeekTemplate(sportProfile);
    const monday = mondayOf(weekMonday);
    return template.map(entry => ({
      date: toDateStr(addDays(monday, entry.dayIdx)),
      isThresholdWeek: true,
      ...entry,
    }));
  }

  // ─── Volume scaling ──────────────────────────────────────────────────────────

  /**
   * Apply the 60-70% volume target to the easy session durations of a generated week.
   * Uses 0.65 as the midpoint default.
   */
  function applyThresholdWeekVolume(durationMin, fraction) {
    const f = (fraction == null) ? 0.65 : fraction;
    return Math.max(15, Math.round(durationMin * f / 5) * 5);
  }

  // ─── Public surface ──────────────────────────────────────────────────────────

  const api = {
    // constants
    PHASE_DEFAULT_CADENCE,
    RACE_TAPER_WINDOW_DAYS,
    MIN_BUILD_WEEKS_BETWEEN,
    SINGLE_SPORT_WEEK,
    TRIATHLON_WEEK,

    // pure helpers
    detectPhase,
    resolveCadence,
    mondayOf,
    addDays,
    addWeeks,
    diffDays,
    toDateStr,

    // scheduling
    computeNextThresholdWeek,
    listThresholdWeeksForPlan,
    shouldThisBeAThresholdWeek,
    applyRaceWindowGuard,
    applyMinBuildGuard,

    // skip / completion
    markThresholdWeekSkipped,
    recordThresholdWeekCompleted,
    getLastThresholdWeekDate,

    // templates
    getWeekTemplate,
    buildThresholdWeekDays,
    applyThresholdWeekVolume,
  };

  if (typeof window !== "undefined") {
    window.ThresholdWeekScheduler = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
