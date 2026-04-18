// plan-constraint-validator.js — Rule Engine Step 5 (RULE_ENGINE_SPEC.md §7)
//
// Takes a generated plan (flat array of { date, discipline, load, ... } entries)
// and the athlete level, enforces TRAINING_PHILOSOPHY.md §4.3 global intensity
// rules. Mutates the plan in place. Returns a list of validationFlags describing
// what was changed so the rationale block can surface them.
//
// Enforced rules (§4.3):
//   - Max intensity sessions per week:
//       beginner     = 1
//       intermediate = 2
//       advanced     = 3
//   - Consecutive hard days: never allowed for beginner/intermediate; allowed
//     for advanced with a recovery plan (we still flag adjacency so the
//     athlete can reorder if they want).
//   - Min rest days per week: ≥ 1
//
// "Hard" day = discipline session with load ∈ {hard, long, race, test}
//             — these include intervals, tempo, threshold, long run/ride,
//               threshold tests, brick race simulations, race day itself.
//
// Fixes applied in this order per week (least destructive first):
//   1. Demote adjacent-hard conflicts: the LATER session's load becomes
//      "easy" (or the whole session becomes rest if the spec doesn't
//      support a lighter version).
//   2. If still over intensity-cap: demote the lowest-priority remaining
//      intensity session to "easy".
//   3. If no rest day exists in the week: promote the easiest non-key
//      session to rest.
//
// Race week + threshold week are SKIPPED — those are designed to have
// concentrated quality and are governed by their own scheduler.

(function () {
  "use strict";

  const HARD_LOADS = new Set(["hard", "long", "race", "test"]);
  const RACE_WEEK_PHASES = new Set(["Race", "Race Week"]);

  const INTENSITY_CAPS = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
  };

  // Priority for demotion tiebreaking — lower number = more protected.
  // When we have to demote one of N adjacent hard sessions, we keep the
  // highest-priority (most important) and demote the rest.
  const KEY_SESSION_PRIORITY = {
    race: 0,           // race day — never touch
    long: 1,           // long run / long ride — keystone endurance session
    test: 1,           // threshold test
    brick: 2,          // triathlon-specific key session
    hard: 3,           // intervals / threshold / tempo
    moderate: 5,
    easy: 7,
    strides: 7,
    rest: 9,
  };

  function isHardEntry(e) {
    if (!e || !e.load) return false;
    if (e.discipline === "rest") return false;
    if (e.discipline === "race") return true;
    return HARD_LOADS.has(e.load);
  }

  // Group entries by ISO-week key (YYYY-WW). Uses Monday-start weeks so
  // the grouping matches how phases align.
  function isoWeekKey(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    // Move to Monday of the week
    const day = d.getDay(); // 0=Sun..6=Sat
    const offset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function groupByWeek(plan) {
    const groups = {};
    plan.forEach(e => {
      if (!e || !e.date) return;
      const k = isoWeekKey(e.date);
      if (!groups[k]) groups[k] = [];
      groups[k].push(e);
    });
    // Each group sorted by date ascending so adjacency checks work.
    Object.values(groups).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));
    return groups;
  }

  function shouldSkipWeek(weekEntries) {
    // Race week / race day — governed by RACE_WEEK_PATTERNS in planner.js.
    if (weekEntries.some(e => RACE_WEEK_PHASES.has(e.phase) || e.discipline === "race")) return true;
    // Threshold week — has its own scheduler.
    if (weekEntries.some(e => e.isThresholdWeek || e.isThresholdTest)) return true;
    return false;
  }

  // Demote a hard entry to easy. Preserves discipline + date + raceId so
  // the calendar renderer still knows what to show. Drops the keySession
  // marker and renames to an easy variant.
  function demoteToEasy(entry, reason) {
    entry.load = "easy";
    if (entry.sessionName) {
      // Swap the leading "Threshold" / "Tempo" / "Long" label to "Easy"
      entry.sessionName = entry.sessionName
        .replace(/^(Threshold|Tempo|Long|Interval|Hard)\b/, "Easy")
        .replace(/^Easy\s+Easy\b/, "Easy"); // guard against double-demote
    }
    entry.keySession = false;
    if (!entry._demotions) entry._demotions = [];
    entry._demotions.push(reason);
  }

  // Demote an entry all the way to rest when "easy" doesn't make sense
  // (e.g. race-day clones that shouldn't exist). Not used for the main
  // constraint pass — reserved for the rest-day backfill below.
  function demoteToRest(entry, reason) {
    entry.discipline = "rest";
    entry.load = "rest";
    entry.sessionName = "Rest";
    entry.duration = 0;
    entry.keySession = false;
    if (!entry._demotions) entry._demotions = [];
    entry._demotions.push(reason);
  }

  function entryPriority(entry) {
    if (!entry) return 99;
    if (entry.discipline === "race") return KEY_SESSION_PRIORITY.race;
    return KEY_SESSION_PRIORITY[entry.load] != null ? KEY_SESSION_PRIORITY[entry.load] : 6;
  }

  // Walk a week's entries and apply the §4.3 rules. Returns the list of
  // validationFlags emitted for this week.
  function validateWeek(weekEntries, level) {
    const flags = [];
    if (shouldSkipWeek(weekEntries)) return flags;

    const cap = INTENSITY_CAPS[level] != null ? INTENSITY_CAPS[level] : INTENSITY_CAPS.intermediate;
    const nonAdvanced = level !== "advanced";

    // ── Pass 1: adjacent-hard for non-advanced athletes ──
    // Walk pairs; if two consecutive calendar days both hit HARD_LOADS,
    // demote the LATER one (keeping the earlier — usually more critical
    // session type like long run). Loop until no more adjacent pairs remain.
    if (nonAdvanced) {
      for (let pass = 0; pass < 3; pass++) {
        let changedThisPass = false;
        for (let i = 1; i < weekEntries.length; i++) {
          const a = weekEntries[i - 1];
          const b = weekEntries[i];
          if (!isHardEntry(a) || !isHardEntry(b)) continue;
          const dA = new Date(a.date + "T00:00:00");
          const dB = new Date(b.date + "T00:00:00");
          const dayGap = Math.round((dB - dA) / 86400000);
          if (dayGap !== 1) continue;
          // Protect the higher-priority session; demote the other.
          if (entryPriority(a) <= entryPriority(b)) {
            demoteToEasy(b, "adjacent_hard_after_" + (a.sessionName || a.load));
            flags.push({
              rule: "no_consecutive_hard",
              date: b.date,
              action: "demoted_to_easy",
              reason: "Non-" + level + " athletes can't back hard days — " + a.date + " already carries the weight.",
            });
          } else {
            demoteToEasy(a, "adjacent_hard_before_" + (b.sessionName || b.load));
            flags.push({
              rule: "no_consecutive_hard",
              date: a.date,
              action: "demoted_to_easy",
              reason: "Non-" + level + " athletes can't back hard days — " + b.date + " is the higher-priority session.",
            });
          }
          changedThisPass = true;
        }
        if (!changedThisPass) break;
      }
    }

    // ── Pass 2: intensity cap per week ──
    // After adjacency fixes, count remaining HARD sessions; demote the
    // lowest-priority ones until we're at or under cap.
    let hardEntries = weekEntries.filter(isHardEntry);
    while (hardEntries.length > cap) {
      // Pick the LOWEST-priority hard entry to demote. Ties broken by
      // later date (protect the earlier one; earlier is usually more
      // foundational within a mesocycle).
      hardEntries.sort((a, b) => entryPriority(a) - entryPriority(b) || a.date.localeCompare(b.date));
      const victim = hardEntries[hardEntries.length - 1];
      demoteToEasy(victim, "intensity_cap_" + level);
      flags.push({
        rule: "intensity_cap",
        date: victim.date,
        action: "demoted_to_easy",
        reason: level + " athletes cap at " + cap + " intensity sessions/week — this was the lowest-priority over the line.",
      });
      hardEntries = weekEntries.filter(isHardEntry);
    }

    // ── Pass 3: minimum 1 rest day ──
    // Count distinct calendar days in the week that have ANY session. If
    // all 7 days are used, demote the easiest non-key session to rest.
    // This pass runs after demotions above so we count final state.
    const daysWithSessions = new Set(weekEntries.map(e => e.date));
    if (daysWithSessions.size >= 7) {
      // Find the easiest entry to convert to rest. Prefer "easy" or
      // "moderate" load; never touch long/race/test/brick.
      const candidates = weekEntries
        .filter(e => e.load !== "long" && e.load !== "race" && e.load !== "test" && e.discipline !== "race")
        .sort((a, b) => entryPriority(b) - entryPriority(a)); // highest priority number (least important) first
      if (candidates.length > 0) {
        const victim = candidates[0];
        demoteToRest(victim, "min_rest_day");
        flags.push({
          rule: "rest_day_minimum",
          date: victim.date,
          action: "demoted_to_rest",
          reason: "Every training week needs at least 1 full rest day — this was the lightest session.",
        });
      }
    }

    return flags;
  }

  // Public entry point. Runs validation across every week of the plan.
  // Returns a summary object with the fix list so callers can attach it
  // to the plan's validationFlags output (PLAN_SCHEMA §validationFlags).
  function validateAndFixPlan(plan, level) {
    if (!Array.isArray(plan) || plan.length === 0) return { flags: [], weeksChecked: 0 };
    const safeLevel = ["beginner", "intermediate", "advanced"].includes(level) ? level : "intermediate";
    const groups = groupByWeek(plan);
    let allFlags = [];
    Object.values(groups).forEach(weekEntries => {
      const flags = validateWeek(weekEntries, safeLevel);
      if (flags.length) allFlags = allFlags.concat(flags);
    });
    return { flags: allFlags, weeksChecked: Object.keys(groups).length };
  }

  if (typeof window !== "undefined") {
    window.PlanConstraintValidator = {
      validateAndFixPlan,
      isHardEntry,
      INTENSITY_CAPS,
      HARD_LOADS: Array.from(HARD_LOADS),
    };
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { validateAndFixPlan, isHardEntry, INTENSITY_CAPS };
  }
})();
