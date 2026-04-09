// js/workout-validator.js
//
// Shared per-session scheduling rule module. Single source of truth for the
// hard/soft constraints that apply when adding a workout to a user's plan.
// Consumed by:
//   - add-running-session-flow.js (the existing Add Session UI)
//   - js/workout-import-validator.js (the new Workout Sharing import path)
//
// Rules are PURE FUNCTIONS of (candidate, weekEntries, allEntries, profile).
// No DOM, no localStorage reads, no network. Callers pass in the data.
//
// This module exists because the spec for FEATURE_SPEC_2026-04-09_workout_sharing
// requires the import validator to import rule logic from a shared module,
// not duplicate it. If you change a rule here, both consumers update.

(function () {
  "use strict";

  // ─── Hard-entry classifier ──────────────────────────────────────────────────

  const HARD_SESSION_TYPE_IDS = new Set([
    "long_run", "tempo_threshold", "track_workout", "speed_work", "hills",
  ]);
  const HARD_LEGACY_LOADS = new Set(["long", "hard", "moderate"]);

  /**
   * Classify a plan/schedule entry as "hard" for stress-budget calculations.
   * Recognises both new session-type ids and legacy load tags.
   */
  function isHardEntry(entry) {
    if (!entry) return false;
    if (entry.type && HARD_SESSION_TYPE_IDS.has(entry.type)) return true;
    if (entry.is_hard === true) return true;
    if (entry.load && HARD_LEGACY_LOADS.has(entry.load)) return true;
    return false;
  }

  // ─── Date helpers (no DOM, no Date objects leaking out) ─────────────────────

  function _addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function _mondayOf(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const dow = d.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  // ─── Individual rules ───────────────────────────────────────────────────────
  //
  // Each rule takes a normalized context object and returns either null
  // (no problem) or { rule, severity: 'block' | 'warning', message, ... }.
  // Callers compose them via evaluateConstraints().

  function rule_long_run_cap(ctx) {
    if (ctx.candidate.type !== "long_run") return null;
    const existingLong = ctx.weekEntries.find(e => (e.type === "long_run") || (e.load === "long"));
    if (!existingLong) return null;
    return {
      rule: "long_run_cap",
      severity: "block",
      message: `Long Run is capped at 1 per week, full stop. You already have a Long Run on ${existingLong.date}.`,
      conflict_date: existingLong.date,
    };
  }

  function rule_weekly_hard_count(ctx) {
    const existingHard = ctx.weekEntries.filter(isHardEntry);
    const projected = existingHard.length + (ctx.candidateIsHard ? 1 : 0);
    if (projected <= 3) return null;
    return {
      rule: "weekly_hard_count",
      severity: "warning",
      message: `This would put ${projected} hard sessions in the week of ${ctx.weekMonday}. The recommended max is 3.`,
      items: existingHard.map(e => ({
        date: e.date,
        title: e.sessionName || e.title || e.type,
        type: e.type || e.load,
      })),
      projected,
    };
  }

  function rule_no_hard_around_long_run(ctx) {
    if (!ctx.candidateIsHard) return null;
    const adjacent = [_addDays(ctx.dateStr, -1), _addDays(ctx.dateStr, 1)];
    const longRunNearby = ctx.allEntries.find(e =>
      adjacent.includes(e.date) && ((e.type === "long_run") || (e.load === "long"))
    );
    if (!longRunNearby) return null;
    return {
      rule: "no_hard_around_long_run",
      severity: "warning",
      message: `${ctx.candidate.title || ctx.candidate.type} is within 24 hours of your Long Run on ${longRunNearby.date}. Recovery may be compromised.`,
      conflict_date: longRunNearby.date,
    };
  }

  function rule_no_back_to_back_hard(ctx) {
    if (!ctx.candidateIsHard) return null;
    const adjacent = [_addDays(ctx.dateStr, -1), _addDays(ctx.dateStr, 1)];
    const adjacentHard = ctx.weekEntries.find(e =>
      adjacent.includes(e.date) && isHardEntry(e)
    );
    if (!adjacentHard) return null;
    return {
      rule: "no_back_to_back_hard",
      severity: "warning",
      message: `Back-to-back hard sessions: ${adjacentHard.date} (${adjacentHard.sessionName || adjacentHard.type}) and ${ctx.dateStr}. Insert an Easy/Recovery day between them if possible.`,
      conflict_date: adjacentHard.date,
    };
  }

  function rule_track_plus_speed_only_advanced(ctx) {
    if (ctx.experienceLevel === "advanced") return null;
    const hasTrack = ctx.weekEntries.some(e => e.type === "track_workout");
    const hasSpeed = ctx.weekEntries.some(e => e.type === "speed_work");
    const ctype = ctx.candidate.type;
    const triggers =
      (ctype === "track_workout" && hasSpeed) ||
      (ctype === "speed_work" && hasTrack);
    if (!triggers) return null;
    return {
      rule: "track_plus_speed_only_advanced",
      severity: "warning",
      message: "Track Workout AND Speed Work in the same week is generally only programmed for advanced runners.",
    };
  }

  function rule_hills_plus_track_only_advanced(ctx) {
    if (ctx.experienceLevel === "advanced") return null;
    const hasHills = ctx.weekEntries.some(e => e.type === "hills");
    const hasTrack = ctx.weekEntries.some(e => e.type === "track_workout");
    const ctype = ctx.candidate.type;
    const triggers =
      (ctype === "track_workout" && hasHills) ||
      (ctype === "hills" && hasTrack);
    if (!triggers) return null;
    return {
      rule: "hills_plus_track_only_advanced",
      severity: "warning",
      message: "Hills substitute for Track during a hill phase. Both in the same week is generally only programmed for advanced runners.",
    };
  }

  /**
   * RECENTLY_DONE — used by the import validator. Detects when the user did
   * the same variant in the last 14 days. Soft warning, not a hard block.
   * Looks at completed workouts in the workouts log (not just plan/schedule).
   */
  function rule_recently_done(ctx) {
    if (!ctx.completedHistory || !ctx.completedHistory.length) return null;
    const variantId = ctx.candidate.variant_id || ctx.candidate.variantId;
    if (!variantId) return null;
    const cutoff = _addDays(ctx.dateStr, -14);
    const match = ctx.completedHistory.find(c => {
      if (c.variant_id !== variantId && c.variantId !== variantId) return false;
      return c.date && c.date >= cutoff && c.date <= ctx.dateStr;
    });
    if (!match) return null;
    return {
      rule: "recently_done",
      severity: "warning",
      message: `You did this variant on ${match.date}. Add it anyway?`,
      last_done_date: match.date,
    };
  }

  // ─── Constraint composer ────────────────────────────────────────────────────

  const ALL_RULES = [
    rule_long_run_cap,
    rule_weekly_hard_count,
    rule_no_hard_around_long_run,
    rule_no_back_to_back_hard,
    rule_track_plus_speed_only_advanced,
    rule_hills_plus_track_only_advanced,
  ];

  const ALL_RULES_WITH_HISTORY = [
    ...ALL_RULES,
    rule_recently_done,
  ];

  /**
   * Evaluate every rule against the proposed save and bucket the results.
   * Pure function. Caller passes in the data.
   *
   * @param {Object} opts
   * @param {Object} opts.candidate — { type, title?, is_hard?, variant_id? }
   * @param {string} opts.dateStr — proposed schedule date YYYY-MM-DD
   * @param {Array}  opts.plan — current trainingPlan entries
   * @param {Array}  opts.schedule — current workoutSchedule entries
   * @param {Array}  [opts.completedHistory] — past completed workouts (for RECENTLY_DONE)
   * @param {string} [opts.experienceLevel="intermediate"]
   * @param {boolean} [opts.includeHistoryRule=false]
   * @returns {{ hardBlocks: Array, warnings: Array }}
   */
  function evaluateConstraints(opts) {
    if (!opts || !opts.candidate || !opts.dateStr) {
      return { hardBlocks: [], warnings: [] };
    }
    const plan = Array.isArray(opts.plan) ? opts.plan : [];
    const schedule = Array.isArray(opts.schedule) ? opts.schedule : [];
    const allEntries = plan.concat(schedule);
    const monday = _mondayOf(opts.dateStr);
    const dateSet = new Set(Array.from({ length: 7 }, (_, i) => _addDays(monday, i)));
    const weekEntries = allEntries.filter(e => dateSet.has(e.date));

    const ctx = {
      candidate: opts.candidate,
      candidateIsHard: !!opts.candidate.is_hard,
      dateStr: opts.dateStr,
      weekMonday: monday,
      weekEntries,
      allEntries,
      completedHistory: opts.completedHistory || [],
      experienceLevel: opts.experienceLevel || "intermediate",
    };

    const ruleSet = opts.includeHistoryRule ? ALL_RULES_WITH_HISTORY : ALL_RULES;
    const hardBlocks = [];
    const warnings = [];
    for (const rule of ruleSet) {
      try {
        const result = rule(ctx);
        if (!result) continue;
        if (result.severity === "block") hardBlocks.push(result);
        else warnings.push(result);
      } catch (e) {
        // Don't let a buggy rule kill the whole evaluator.
        if (typeof console !== "undefined") console.warn("[workout-validator] rule error:", e.message);
      }
    }
    return { hardBlocks, warnings };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  const RULE_IDS = {
    LONG_RUN_CAP: "long_run_cap",
    WEEKLY_HARD_COUNT: "weekly_hard_count",
    NO_HARD_AROUND_LONG_RUN: "no_hard_around_long_run",
    NO_BACK_TO_BACK_HARD: "no_back_to_back_hard",
    TRACK_PLUS_SPEED_ONLY_ADVANCED: "track_plus_speed_only_advanced",
    HILLS_PLUS_TRACK_ONLY_ADVANCED: "hills_plus_track_only_advanced",
    RECENTLY_DONE: "recently_done",
  };

  const api = {
    isHardEntry,
    evaluateConstraints,
    HARD_SESSION_TYPE_IDS,
    HARD_LEGACY_LOADS,
    RULE_IDS,
    // Individual rules exported for fine-grained tests / future caller composition
    rules: {
      long_run_cap: rule_long_run_cap,
      weekly_hard_count: rule_weekly_hard_count,
      no_hard_around_long_run: rule_no_hard_around_long_run,
      no_back_to_back_hard: rule_no_back_to_back_hard,
      track_plus_speed_only_advanced: rule_track_plus_speed_only_advanced,
      hills_plus_track_only_advanced: rule_hills_plus_track_only_advanced,
      recently_done: rule_recently_done,
    },
  };

  if (typeof window !== "undefined") window.WorkoutValidator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
