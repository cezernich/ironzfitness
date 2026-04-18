// plan-session-distribution.js — Rule Engine Step 4 (phase-aware session counts)
// Source: TRAINING_PHILOSOPHY.md §6.1 (triathlon), §6.2 (running), §6.3 (hyrox).
//
// The existing generator (planner.js _generateSingleRacePlan) stamps one weekly
// template across all weeks and varies only session LOAD by phase. Per spec,
// SESSION COUNTS should also vary: Base 9 → Build 10 → Peak 11 → Taper 6 for
// triathlon. This module runs after initial plan generation and brings the
// per-week session count into alignment with the phase target by:
//   1. Counting sessions per discipline per week
//   2. Adding missing sessions on empty (rest) days where the target calls
//      for more
//   3. Demoting excess sessions to easy or rest where Taper calls for fewer
//   4. Applying progressive overload to long sessions: long run / long ride
//      duration scales with week-within-phase. Deload every 4th week (-30%).
//
// Race Week is skipped — handled by RACE_WEEK_PATTERNS in planner.js.
// Threshold weeks are skipped — handled by threshold-week-scheduler.js.
//
// Inputs match the existing trainingPlan entry shape:
//   { date, raceId, phase, weekNumber, discipline, load, sessionName, duration }

(function () {
  "use strict";

  // ─── §6.1 / §6.2 / §6.3 session distributions ───────────────────────────────
  // Target session count per discipline per week, indexed by sportProfile + phase.
  // When the actual week has fewer, add on rest days. When it has more (Taper),
  // demote excess to easy / drop to rest.
  const PHASE_DISTRIBUTIONS = {
    triathlon: {
      Base:  { swim: 2, bike: 2, run: 3, strength: 2, brick: 0 },   // 9 total
      Build: { swim: 3, bike: 3, run: 3, strength: 1, brick: 0 },   // 10
      Peak:  { swim: 3, bike: 3, run: 3, strength: 1, brick: 1 },   // 11
      Taper: { swim: 2, bike: 2, run: 2, strength: 0, brick: 0 },   //  6
    },
    running: {
      Base:  { run: 4, strength: 2, bike: 0, swim: 0, brick: 0 },   // 4 easy+1 long = 4 runs
      Build: { run: 4, strength: 1, bike: 0, swim: 0, brick: 0 },   // 2-3 easy + 1 tempo + 1 intervals + 1 long
      Peak:  { run: 4, strength: 1, bike: 0, swim: 0, brick: 0 },
      Taper: { run: 3, strength: 0, bike: 0, swim: 0, brick: 0 },   // 2 easy + 1 opener
    },
    hyrox: {
      Base:  { run: 3, strength: 3, hyrox: 1, bike: 0, swim: 0, brick: 0 },
      Build: { run: 3, strength: 2, hyrox: 2, bike: 0, swim: 0, brick: 0 },  // includes run+station combo
      Peak:  { run: 3, strength: 1, hyrox: 2, bike: 0, swim: 0, brick: 0 },
      Taper: { run: 2, strength: 0, hyrox: 1, bike: 0, swim: 0, brick: 0 },
    },
    cycling: {
      Base:  { bike: 4, strength: 2, run: 0, swim: 0, brick: 0 },
      Build: { bike: 4, strength: 1, run: 0, swim: 0, brick: 0 },
      Peak:  { bike: 4, strength: 1, run: 0, swim: 0, brick: 0 },
      Taper: { bike: 3, strength: 0, run: 0, swim: 0, brick: 0 },
    },
  };

  // ─── §4.8 hour ceilings ─────────────────────────────────────────────────────
  // Used for warning / soft-capping. Not hard-enforced in Phase B — a future
  // pass can proportionally shrink durations when weekly hours exceed ceiling.
  const HOUR_CEILINGS = {
    triathlon: {
      sprint:      { beginner: 5, intermediate: 7,  advanced: 9 },
      olympic:     { beginner: 8, intermediate: 10, advanced: 12 },
      halfIronman: { beginner: 10, intermediate: 12, advanced: 15 },
      ironman:     { beginner: 14, intermediate: 17, advanced: 20 },
    },
    running: {
      fiveK:        { beginner: 3.5, intermediate: 5, advanced: 6.5 },
      tenK:         { beginner: 4.5, intermediate: 6, advanced: 8 },
      halfMarathon: { beginner: 6,   intermediate: 7.5, advanced: 10 },
      marathon:     { beginner: 8,   intermediate: 10, advanced: 13 },
    },
    hyrox: {
      default: { beginner: 6, intermediate: 8.5, advanced: 12 },
    },
  };

  const DOW_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const TRI_TYPES = new Set(["ironman", "halfIronman", "olympic", "sprint"]);
  const RUN_TYPES = new Set(["marathon", "halfMarathon", "tenK", "fiveK"]);
  const HYROX_TYPES = new Set(["hyrox", "hyroxDoubles"]);
  const CYCLING_TYPES = new Set(["centuryRide", "granFondo"]);

  function sportProfileForRaceType(raceType) {
    if (TRI_TYPES.has(raceType)) return "triathlon";
    if (RUN_TYPES.has(raceType)) return "running";
    if (HYROX_TYPES.has(raceType)) return "hyrox";
    if (CYCLING_TYPES.has(raceType)) return "cycling";
    return "running"; // safe default
  }

  function isoWeekKey(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function groupByWeek(plan) {
    const groups = {};
    plan.forEach(e => {
      if (!e || !e.date) return;
      if (e.discipline === "race") return;     // race day — don't touch
      if (e.phase === "Race" || e.phase === "Race Week") return;
      if (e.isThresholdWeek || e.isThresholdTest) return;
      const k = isoWeekKey(e.date);
      if (!groups[k]) groups[k] = { entries: [], mondayStr: k };
      groups[k].entries.push(e);
    });
    Object.values(groups).forEach(g => g.entries.sort((a, b) => a.date.localeCompare(b.date)));
    return groups;
  }

  // Count how many of each discipline the week already has.
  function countByDiscipline(entries) {
    const counts = { swim: 0, bike: 0, run: 0, strength: 0, brick: 0, hyrox: 0, other: 0 };
    entries.forEach(e => {
      const d = e.discipline;
      if (d === "strength" || d === "weightlifting" || d === "bodyweight") counts.strength++;
      else if (d === "brick") counts.brick++;
      else if (d === "hyrox") counts.hyrox++;
      else if (d === "swim") counts.swim++;
      else if (d === "bike") counts.bike++;
      else if (d === "run") counts.run++;
      else counts.other++;
    });
    return counts;
  }

  // Decide which day-of-week to place a new session on. Prefers days
  // with no existing session, then days with only an easy session.
  // Avoids stacking same discipline back-to-back.
  function pickSlotForDiscipline(weekEntries, mondayStr, discipline) {
    const used = new Set(weekEntries.map(e => e.date));
    const hasDiscByDate = {};
    weekEntries.forEach(e => {
      hasDiscByDate[e.date] = hasDiscByDate[e.date] || {};
      hasDiscByDate[e.date][e.discipline] = true;
    });
    const monday = new Date(mondayStr + "T00:00:00");
    // Preferred order: Wed, Fri, Tue, Thu, Sat, Mon, Sun — middle-of-week first.
    const order = [2, 4, 1, 3, 5, 0, 6];
    for (const offset of order) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + offset);
      const dateStr = d.toISOString().slice(0, 10);
      if (!used.has(dateStr)) {
        // Check no adjacent same-discipline day
        const prev = new Date(d); prev.setDate(d.getDate() - 1);
        const next = new Date(d); next.setDate(d.getDate() + 1);
        const prevStr = prev.toISOString().slice(0, 10);
        const nextStr = next.toISOString().slice(0, 10);
        const adjacent = (hasDiscByDate[prevStr] && hasDiscByDate[prevStr][discipline]) ||
                         (hasDiscByDate[nextStr] && hasDiscByDate[nextStr][discipline]);
        if (!adjacent) return dateStr;
      }
    }
    // Fallback: any empty day, even if same-discipline adjacency.
    for (const offset of order) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + offset);
      const dateStr = d.toISOString().slice(0, 10);
      if (!used.has(dateStr)) return dateStr;
    }
    return null; // week is packed; give up (caller tolerates under-count)
  }

  function addMissingSession(weekEntries, mondayStr, discipline, phaseName, raceId, weekNumber) {
    const dateStr = pickSlotForDiscipline(weekEntries, mondayStr, discipline);
    if (!dateStr) return null;
    const LOAD_NAMES = {
      swim: "Easy", bike: "Easy", run: "Easy", strength: "Moderate", brick: "Moderate", hyrox: "Moderate",
    };
    const DISC_NAMES = {
      swim: "Swim", bike: "Ride", run: "Run", strength: "Strength", brick: "Brick", hyrox: "Hyrox",
    };
    const load = discipline === "strength" ? "moderate" : "easy";
    const entry = {
      date: dateStr,
      raceId: raceId,
      phase: phaseName,
      weekNumber,
      discipline,
      load,
      sessionName: `${LOAD_NAMES[discipline] || "Easy"} ${DISC_NAMES[discipline] || discipline}`,
      duration: discipline === "strength" ? 45 : 30,
      _distributionAdded: true,
    };
    weekEntries.push(entry);
    weekEntries.sort((a, b) => a.date.localeCompare(b.date));
    return entry;
  }

  function demoteOrRemove(entry, reason) {
    // Prefer to demote to easy rather than remove the day. Matches the
    // validator's philosophy: keep the session slot, just reduce intensity.
    if (entry.load !== "rest") {
      entry.load = "easy";
      entry._demoted = reason;
    }
  }

  // ─── Progressive overload ───────────────────────────────────────────────────
  // Long run / long ride duration scales with weekInPhase. Deload week 4
  // of a 4-week mesocycle drops to ~65% of prior week's long session.
  // 10% weekly build cap (§4.1).
  function applyProgressiveOverload(weekGroups, plan) {
    // Index weeks by phase name → ordered list of week keys so we can tell
    // week-in-phase position (1-indexed, 1..phaseLen).
    const byPhase = {};
    Object.entries(weekGroups).forEach(([mondayStr, g]) => {
      const phaseName = (g.entries[0] && g.entries[0].phase) || null;
      if (!phaseName) return;
      if (!byPhase[phaseName]) byPhase[phaseName] = [];
      byPhase[phaseName].push({ mondayStr, entries: g.entries });
    });
    Object.values(byPhase).forEach(weeks => weeks.sort((a, b) => a.mondayStr.localeCompare(b.mondayStr)));

    Object.entries(byPhase).forEach(([phaseName, weeks]) => {
      weeks.forEach((wk, idx) => {
        const weekInPhase = idx + 1;
        // Deload: every 4th week within a phase. Only applies when phase is
        // long enough for it to matter.
        const isDeload = (weekInPhase % 4 === 0) && weeks.length >= 4;
        const factor = isDeload ? 0.65 : 1 + (0.10 * (weekInPhase - 1));

        wk.entries.forEach(e => {
          if (!e || typeof e.duration !== "number") return;
          if (e.load !== "long") return;            // only scale keystone long sessions
          const base = e._baseDuration != null ? e._baseDuration : e.duration;
          e._baseDuration = base;                   // remember for re-runs
          e.duration = Math.round(base * factor / 5) * 5;
          if (isDeload) e.isDeload = true;
        });
      });
    });
  }

  // ─── Main entry point ───────────────────────────────────────────────────────
  // Walks each week of the plan and aligns session counts to the phase
  // distribution target. Mutates `plan` in place. Returns a summary of
  // adjustments so the caller can log what changed.
  function applySessionDistribution(plan, raceType, athleteLevel) {
    if (!Array.isArray(plan) || plan.length === 0) return { added: 0, demoted: 0, weeksChecked: 0 };
    const sportProfile = sportProfileForRaceType(raceType);
    const dist = PHASE_DISTRIBUTIONS[sportProfile];
    if (!dist) return { added: 0, demoted: 0, weeksChecked: 0 };

    const groups = groupByWeek(plan);
    let added = 0, demoted = 0;

    Object.values(groups).forEach(g => {
      const firstEntry = g.entries[0];
      if (!firstEntry) return;
      const phaseName = firstEntry.phase;
      const target = dist[phaseName];
      if (!target) return; // unknown phase (e.g. Pre-Plan) — leave alone

      const counts = countByDiscipline(g.entries);

      // Add missing sessions, each discipline.
      ["swim", "bike", "run", "strength", "brick", "hyrox"].forEach(disc => {
        const want = target[disc] || 0;
        const have = counts[disc] || 0;
        if (have < want) {
          const missing = want - have;
          for (let i = 0; i < missing; i++) {
            const newEntry = addMissingSession(
              g.entries, g.mondayStr, disc,
              phaseName, firstEntry.raceId, firstEntry.weekNumber
            );
            if (newEntry) {
              plan.push(newEntry);
              added++;
            }
          }
        }
        // Demote excess (primarily matters in Taper where volume should drop).
        if (have > want && phaseName === "Taper") {
          // Demote the lowest-priority session(s) of this discipline to easy.
          const extras = g.entries
            .filter(e => e.discipline === disc && e.load !== "easy" && e.load !== "rest")
            .sort((a, b) => {
              const rank = { long: 0, hard: 1, moderate: 2, easy: 3, rest: 4 };
              return (rank[b.load] || 3) - (rank[a.load] || 3);
            });
          const over = have - want;
          for (let i = 0; i < over && i < extras.length; i++) {
            demoteOrRemove(extras[i], "taper_excess_" + disc);
            demoted++;
          }
        }
      });
    });

    // After counts are aligned, apply progressive overload to long sessions.
    const regroupedAfterAdd = groupByWeek(plan);
    applyProgressiveOverload(regroupedAfterAdd, plan);

    // Sort plan by date for stable downstream processing.
    plan.sort((a, b) => a.date.localeCompare(b.date));

    return { added, demoted, weeksChecked: Object.keys(groups).length };
  }

  if (typeof window !== "undefined") {
    window.PlanSessionDistribution = {
      applySessionDistribution,
      sportProfileForRaceType,
      PHASE_DISTRIBUTIONS,
      HOUR_CEILINGS,
    };
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      applySessionDistribution,
      sportProfileForRaceType,
      PHASE_DISTRIBUTIONS,
      HOUR_CEILINGS,
    };
  }
})();
