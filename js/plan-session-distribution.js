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

  // ─── Level-aware phase distributions (PLAN_GENERATOR_MASTER_SPEC §4) ─────
  // Target session counts per discipline per week, indexed by
  //   sportProfile → phase → level → disciplineCounts
  //
  // Derivations:
  //   Triathlon Advanced — §4a exact day tables (Base=9, Build=10, Peak=11,
  //     Taper=6). Build is 3 swim / 3 bike / 2 run / 1 strength / 1 brick
  //     (Tempo OR Intervals + Long run = 2 run slots), NOT 3 run / 0 brick.
  //   Triathlon Beginner/Intermediate — §3a-ii "Sessions/week" column
  //     (Base 5-6/6-7/8-9, Build 5-7/6-8/9-11). Brick per §3a-ii timing:
  //     beginner "NOT until late Build", intermediate "mid-Build",
  //     advanced "early Build". Strength per §3a-ii: beginner 1-2×,
  //     intermediate 2×, advanced 2×. Counts chosen to land in the
  //     mid of each spec range.
  //   Running — §4b session-type lists (Base 6-7, Build 6-8, Peak 5-6,
  //     Taper 3-4). Level scales within the range: beginner at low end,
  //     advanced at high end.
  //   Cycling / Hyrox — spec doesn't give a per-level table. Keep the
  //     existing single row and replicate across levels so callers still
  //     get a value; tune later when the spec documents those sports.
  const PHASE_DISTRIBUTIONS_BY_LEVEL = {
    triathlon: {
      Base: {
        beginner:     { swim: 1, bike: 1, run: 2, strength: 1, brick: 0 }, //  5
        intermediate: { swim: 2, bike: 2, run: 2, strength: 1, brick: 0 }, //  7
        advanced:     { swim: 2, bike: 2, run: 3, strength: 2, brick: 0 }, //  9
      },
      Build: {
        beginner:     { swim: 2, bike: 2, run: 1, strength: 1, brick: 0 }, //  6
        intermediate: { swim: 2, bike: 2, run: 2, strength: 1, brick: 1 }, //  8
        advanced:     { swim: 3, bike: 3, run: 2, strength: 1, brick: 1 }, // 10
      },
      Peak: {
        beginner:     { swim: 2, bike: 2, run: 2, strength: 1, brick: 0 }, //  7
        intermediate: { swim: 2, bike: 3, run: 2, strength: 1, brick: 1 }, //  9
        advanced:     { swim: 3, bike: 3, run: 3, strength: 1, brick: 1 }, // 11
      },
      Taper: {
        beginner:     { swim: 2, bike: 2, run: 2, strength: 0, brick: 0 }, //  6
        intermediate: { swim: 2, bike: 2, run: 2, strength: 0, brick: 0 }, //  6
        advanced:     { swim: 2, bike: 2, run: 2, strength: 0, brick: 0 }, //  6
      },
    },
    running: {
      Base: {
        beginner:     { run: 3, strength: 1, bike: 0, swim: 0, brick: 0 }, //  4 (+ optional cross)
        intermediate: { run: 4, strength: 2, bike: 0, swim: 0, brick: 0 }, //  6
        advanced:     { run: 5, strength: 2, bike: 0, swim: 0, brick: 0 }, //  7
      },
      Build: {
        beginner:     { run: 4, strength: 1, bike: 0, swim: 0, brick: 0 }, //  5 — 1 quality max
        intermediate: { run: 5, strength: 1, bike: 0, swim: 0, brick: 0 }, //  6 — 2 quality
        advanced:     { run: 6, strength: 1, bike: 0, swim: 0, brick: 0 }, //  7 — 2-3 quality
      },
      Peak: {
        beginner:     { run: 4, strength: 1, bike: 0, swim: 0, brick: 0 }, //  5
        intermediate: { run: 4, strength: 1, bike: 0, swim: 0, brick: 0 }, //  5
        advanced:     { run: 5, strength: 1, bike: 0, swim: 0, brick: 0 }, //  6
      },
      Taper: {
        beginner:     { run: 3, strength: 0, bike: 0, swim: 0, brick: 0 }, //  3
        intermediate: { run: 3, strength: 0, bike: 0, swim: 0, brick: 0 }, //  3
        advanced:     { run: 4, strength: 0, bike: 0, swim: 0, brick: 0 }, //  4
      },
    },
    hyrox: {
      Base: {
        beginner:     { run: 2, strength: 2, hyrox: 1, bike: 0, swim: 0, brick: 0 },
        intermediate: { run: 3, strength: 3, hyrox: 1, bike: 0, swim: 0, brick: 0 },
        advanced:     { run: 3, strength: 3, hyrox: 1, bike: 0, swim: 0, brick: 0 },
      },
      Build: {
        beginner:     { run: 2, strength: 2, hyrox: 1, bike: 0, swim: 0, brick: 0 },
        intermediate: { run: 3, strength: 2, hyrox: 2, bike: 0, swim: 0, brick: 0 },
        advanced:     { run: 3, strength: 2, hyrox: 2, bike: 0, swim: 0, brick: 0 },
      },
      Peak: {
        beginner:     { run: 2, strength: 1, hyrox: 1, bike: 0, swim: 0, brick: 0 },
        intermediate: { run: 3, strength: 1, hyrox: 2, bike: 0, swim: 0, brick: 0 },
        advanced:     { run: 3, strength: 1, hyrox: 2, bike: 0, swim: 0, brick: 0 },
      },
      Taper: {
        beginner:     { run: 2, strength: 0, hyrox: 1, bike: 0, swim: 0, brick: 0 },
        intermediate: { run: 2, strength: 0, hyrox: 1, bike: 0, swim: 0, brick: 0 },
        advanced:     { run: 2, strength: 0, hyrox: 1, bike: 0, swim: 0, brick: 0 },
      },
    },
    cycling: {
      Base: {
        beginner:     { bike: 3, strength: 1, run: 0, swim: 0, brick: 0 },
        intermediate: { bike: 4, strength: 2, run: 0, swim: 0, brick: 0 },
        advanced:     { bike: 4, strength: 2, run: 0, swim: 0, brick: 0 },
      },
      Build: {
        beginner:     { bike: 3, strength: 1, run: 0, swim: 0, brick: 0 },
        intermediate: { bike: 4, strength: 1, run: 0, swim: 0, brick: 0 },
        advanced:     { bike: 4, strength: 1, run: 0, swim: 0, brick: 0 },
      },
      Peak: {
        beginner:     { bike: 3, strength: 1, run: 0, swim: 0, brick: 0 },
        intermediate: { bike: 4, strength: 1, run: 0, swim: 0, brick: 0 },
        advanced:     { bike: 4, strength: 1, run: 0, swim: 0, brick: 0 },
      },
      Taper: {
        beginner:     { bike: 3, strength: 0, run: 0, swim: 0, brick: 0 },
        intermediate: { bike: 3, strength: 0, run: 0, swim: 0, brick: 0 },
        advanced:     { bike: 3, strength: 0, run: 0, swim: 0, brick: 0 },
      },
    },
  };

  // Look up the right distribution row. Falls back to intermediate when the
  // level is unknown, and to the advanced row when intermediate is missing.
  function getDistribution(sportProfile, phaseName, level) {
    const sp = PHASE_DISTRIBUTIONS_BY_LEVEL[sportProfile];
    if (!sp) return null;
    const ph = sp[phaseName];
    if (!ph) return null;
    const lvl = String(level || "intermediate").toLowerCase();
    return ph[lvl] || ph.intermediate || ph.advanced || null;
  }

  // Back-compat: collapse the level-aware matrix into a flat phase→counts
  // view (using the intermediate row as the canonical default). Older
  // callers that read PHASE_DISTRIBUTIONS directly continue to work.
  const PHASE_DISTRIBUTIONS = (function () {
    const out = {};
    Object.keys(PHASE_DISTRIBUTIONS_BY_LEVEL).forEach(sp => {
      out[sp] = {};
      Object.keys(PHASE_DISTRIBUTIONS_BY_LEVEL[sp]).forEach(phase => {
        const row = PHASE_DISTRIBUTIONS_BY_LEVEL[sp][phase];
        out[sp][phase] = row.intermediate || row.advanced || {};
      });
    });
    return out;
  })();

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

  // ── Doubles (§3a-iii) ──────────────────────────────────────────────────────
  // When no empty days remain and the athlete's level + phase allows, place
  // the new session as a second session on an existing day. Enforces:
  //   - Max 2 sessions per day
  //   - Never stack two hard sessions (new session is never hard when
  //     doubling — this helper caps newLoad at easy/strength)
  //   - Preserve ≥1 rest day per week (spec §3a-iii)
  //   - Don't double on the day before the remaining rest day
  //   - Respect the weekly double budget per level+phase
  function maxDoublesAllowed(level, phaseName) {
    const lvl = String(level || "intermediate").toLowerCase();
    const phase = String(phaseName || "");
    if (lvl === "beginner")     return 0;
    if (lvl === "intermediate") return (phase === "Build" || phase === "Peak") ? 1 : 0;
    return 3; // advanced
  }
  function isHardLoad(load) {
    return load === "hard" || load === "moderate" || load === "long";
  }
  function emptyDatesInWeek(weekEntries, mondayStr) {
    const used = new Set(weekEntries.filter(e => e.load !== "rest").map(e => e.date));
    const monday = new Date(mondayStr + "T00:00:00");
    const empty = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const s = d.toISOString().slice(0, 10);
      if (!used.has(s)) empty.push(s);
    }
    return empty;
  }
  function sessionsByDate(weekEntries) {
    const m = {};
    weekEntries.forEach(e => {
      if (e.load === "rest") return;
      (m[e.date] = m[e.date] || []).push(e);
    });
    return m;
  }
  // Returns a viable doubling date, or null if budget exhausted / no valid day.
  function pickDoubleSlot(weekEntries, mondayStr, discipline, newLoad, level, phaseName, doublesUsed) {
    const budget = maxDoublesAllowed(level, phaseName);
    if (doublesUsed >= budget) return null;
    if (isHardLoad(newLoad) && discipline !== "strength") return null;

    const rests = emptyDatesInWeek(weekEntries, mondayStr);
    // Pre-compute "days before rest" so we can block those for doubling.
    const blockedAsPreRest = new Set();
    rests.forEach(r => {
      const d = new Date(r + "T00:00:00");
      d.setDate(d.getDate() - 1);
      blockedAsPreRest.add(d.toISOString().slice(0, 10));
    });

    const byDate = sessionsByDate(weekEntries);

    // Already-doubled days can't take a third session.
    // Same-discipline stacking is banned regardless of load — per the user's
    // own philosophy rule ("can't do the same exercise twice in a day"):
    // swim+swim, run+run, bike+bike never pair up even when the aligner
    // needs more sessions of that discipline.
    const candidates = Object.keys(byDate).filter(date => {
      const entries = byDate[date];
      if (entries.length >= 2) return false;
      if (blockedAsPreRest.has(date)) return false;
      if (entries.some(e => e.discipline === discipline)) return false;
      // Spec: at least one of the two sessions must be easy or strength.
      // newLoad is already constrained to easy or strength — so the pair
      // is valid regardless of the existing session's load.
      return true;
    });
    if (candidates.length === 0) return null;

    // Prefer days where existing session is ALREADY easy — avoids stacking
    // fatigue on quality days. Secondary preference: complementary
    // discipline pairings per spec §3a-iii (swim+strength, bike+easy run, etc.).
    const disciplinePairs = {
      swim:     { complement: ["strength", "bike"] },
      bike:     { complement: ["strength", "swim"] },
      run:      { complement: ["strength", "swim"] },
      strength: { complement: ["swim", "bike", "run"] },
    };
    const preferred = (disciplinePairs[discipline] || { complement: [] }).complement;

    candidates.sort((a, b) => {
      const aEntries = byDate[a], bEntries = byDate[b];
      const aExistingHard = aEntries.some(e => isHardLoad(e.load)) ? 1 : 0;
      const bExistingHard = bEntries.some(e => isHardLoad(e.load)) ? 1 : 0;
      if (aExistingHard !== bExistingHard) return aExistingHard - bExistingHard;
      const aPair = aEntries.some(e => preferred.includes(e.discipline)) ? 0 : 1;
      const bPair = bEntries.some(e => preferred.includes(e.discipline)) ? 0 : 1;
      if (aPair !== bPair) return aPair - bPair;
      return a.localeCompare(b); // stable tiebreak
    });
    return candidates[0];
  }

  // When we place a strength session on a day that already has a cardio
  // session, spec §3a-iii says strength goes in the AM slot and the cardio
  // becomes the PM session. We stamp timeOfDay hints on both entries so
  // downstream renders can show order — harmless for now (UI doesn't use
  // it yet) but preserves the ordering signal.
  function tagDoubleOrdering(existingEntries, newEntry) {
    if (newEntry.discipline === "strength") {
      newEntry.timeOfDay = "AM";
      existingEntries.forEach(e => { if (!e.timeOfDay) e.timeOfDay = "PM"; });
    } else if (existingEntries.some(e => e.discipline === "strength")) {
      // Existing is strength → keep strength AM, put new cardio PM.
      newEntry.timeOfDay = "PM";
      existingEntries.forEach(e => { if (e.discipline === "strength" && !e.timeOfDay) e.timeOfDay = "AM"; });
    } else {
      // Two cardios — easy precedes hard; our new session is non-hard so
      // default it to AM, existing becomes PM if still unset.
      newEntry.timeOfDay = "AM";
      existingEntries.forEach(e => { if (!e.timeOfDay) e.timeOfDay = "PM"; });
    }
  }

  function addMissingSession(weekEntries, mondayStr, discipline, phaseName, raceId, weekNumber, ctx) {
    const c = ctx || { level: "intermediate", doublesUsedRef: { n: 0 } };
    const load = discipline === "strength" ? "moderate" : "easy";

    // Fill order:
    //   1) pickSlotForDiscipline — only fills an empty day when >1 rest
    //      day remains (so we preserve at least one rest day per week,
    //      per spec §3a-iii).
    //   2) pickDoubleSlot — places this session on an existing day,
    //      subject to level+phase budget and hard-pair rules.
    let dateStr = null;
    let isDouble = false;
    const empties = emptyDatesInWeek(weekEntries, mondayStr);
    if (empties.length > 1) {
      dateStr = pickSlotForDiscipline(weekEntries, mondayStr, discipline);
    }
    if (!dateStr) {
      dateStr = pickDoubleSlot(weekEntries, mondayStr, discipline, load, c.level, phaseName, c.doublesUsedRef.n);
      if (dateStr) {
        isDouble = true;
        c.doublesUsedRef.n++;
      }
    }
    if (!dateStr) return null;

    const LOAD_NAMES = {
      swim: "Easy", bike: "Easy", run: "Easy", strength: "Moderate", brick: "Moderate", hyrox: "Moderate",
    };
    const DISC_NAMES = {
      swim: "Swim", bike: "Ride", run: "Run", strength: "Strength", brick: "Brick", hyrox: "Hyrox",
    };
    // Strength sessions need an `exercises` array and a split-aware name
    // ("Push Day" / "Pull Day" / "Full Body" …) — otherwise the injected
    // entry rendered as a blank "Moderate Strength" card with no exercises.
    // Reuse the shared helper from planner.js so the distribution-added
    // strength days match the ones _generateSingleRacePlan produces.
    let sessionName = `${LOAD_NAMES[discipline] || "Easy"} ${DISC_NAMES[discipline] || discipline}`;
    let strengthBuild = null;
    if (discipline === "strength" && typeof window !== "undefined" && typeof window._buildStrengthForPlan === "function") {
      try {
        strengthBuild = window._buildStrengthForPlan(weekNumber, phaseName);
        if (strengthBuild && strengthBuild.name) sessionName = strengthBuild.name;
      } catch (e) { strengthBuild = null; }
    }
    const entry = {
      date: dateStr,
      raceId: raceId,
      phase: phaseName,
      weekNumber,
      discipline,
      load,
      sessionName,
      duration: discipline === "strength" ? 45 : 30,
      _distributionAdded: true,
    };
    if (strengthBuild && Array.isArray(strengthBuild.exercises) && strengthBuild.exercises.length) {
      entry.type = "weightlifting";
      entry.exercises = strengthBuild.exercises;
    }
    if (isDouble) {
      entry._isDouble = true;
      // Tag AM/PM ordering on both the new entry and the existing one(s)
      // on that date so a future UI can render "AM" / "PM" columns.
      const existingOnDate = weekEntries.filter(e => e.date === dateStr);
      tagDoubleOrdering(existingOnDate, entry);
    }
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
  // Per-level weekly build cap — §0.3 of the master spec:
  //   Beginner / Intermediate → 10%
  //   Advanced                → 15%
  //   Never exceed 15%.
  // The cap applies to BOTH each individual long session week-over-week AND
  // (downstream, in applyWeeklyVolumeCap) the weekly total minutes.
  function _weeklyVolumeCap(athleteLevel) {
    const lvl = String(athleteLevel || "intermediate").toLowerCase();
    if (lvl === "advanced" || lvl === "elite") return 0.15;
    return 0.10;
  }

  function applyProgressiveOverload(weekGroups, plan, athleteLevel) {
    const cap = _weeklyVolumeCap(athleteLevel);
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

    // Key a long session by discipline so we can clamp week N's long run
    // against week N-1's long run (not against last week's long ride).
    const longKey = e => e && e.discipline;

    Object.entries(byPhase).forEach(([phaseName, weeks]) => {
      // Remember the prior week's long-session duration per discipline so
      // library swaps can be clamped — previously each week reset its own
      // _baseDuration and a swapped-in 160-min workout would overwrite a
      // 105-min workout from the prior week (52% jump, violates cap).
      const priorLongByDisc = {};
      weeks.forEach((wk, idx) => {
        const weekInPhase = idx + 1;
        const isDeload = (weekInPhase % 4 === 0) && weeks.length >= 4;
        const factor = isDeload ? 0.65 : 1 + (cap * (weekInPhase - 1));

        wk.entries.forEach(e => {
          if (!e || typeof e.duration !== "number") return;
          if (e.load !== "long") return;            // only scale keystone long sessions
          const disc = longKey(e);
          const base = e._baseDuration != null ? e._baseDuration : e.duration;
          e._baseDuration = base;                   // remember for re-runs
          // Phase ramp from the first-week base.
          let target = Math.round(base * factor / 5) * 5;
          // Library-swap clamp: if a different template got picked this week
          // and its duration (after ramp) would exceed the prior week's long
          // session by more than the per-level cap, clamp it down. Prevents
          // the 105→160 jump the user caught between Week 1 and Week 2.
          const prior = priorLongByDisc[disc];
          if (prior && !isDeload) {
            const ceiling = Math.round(prior * (1 + cap) / 5) * 5;
            if (target > ceiling) {
              e._libraryClamped = { from: target, to: ceiling, prior, cap };
              target = ceiling;
            }
          }
          e.duration = target;
          priorLongByDisc[disc] = target;
          if (isDeload) e.isDeload = true;
        });
      });
    });
  }

  // ─── Weekly total volume cap ───────────────────────────────────────────────
  // Second pass after progressive overload: walks phases week-by-week and
  // enforces "this week's total minutes ≤ prior week's total × (1 + cap)".
  // Deload weeks are allowed to drop below the cap without triggering. When
  // a week exceeds the ceiling we scale DOWN this week's non-key sessions
  // (easy / moderate, in that order) proportionally until the total fits.
  // Key sessions (long, hard) are protected so we don't silently strip the
  // quality work that makes the week worth doing.
  function applyWeeklyVolumeCap(weekGroups, athleteLevel) {
    const cap = _weeklyVolumeCap(athleteLevel);
    // Group by phase so we only compare within the same phase.
    const byPhase = {};
    Object.entries(weekGroups).forEach(([mondayStr, g]) => {
      const phaseName = (g.entries[0] && g.entries[0].phase) || null;
      if (!phaseName) return;
      if (!byPhase[phaseName]) byPhase[phaseName] = [];
      byPhase[phaseName].push({ mondayStr, entries: g.entries });
    });
    Object.values(byPhase).forEach(weeks => weeks.sort((a, b) => a.mondayStr.localeCompare(b.mondayStr)));

    const weekTotal = entries =>
      entries.reduce((s, e) => s + (typeof e.duration === "number" ? e.duration : 0), 0);

    Object.values(byPhase).forEach(weeks => {
      let priorTotal = null;
      weeks.forEach((wk, idx) => {
        const weekInPhase = idx + 1;
        const isDeload = (weekInPhase % 4 === 0) && weeks.length >= 4;
        const total = weekTotal(wk.entries);
        if (priorTotal != null && !isDeload) {
          const ceiling = priorTotal * (1 + cap);
          if (total > ceiling) {
            // How much to shave off this week, preserving key sessions.
            const overage = total - ceiling;
            // Pool of "soft" sessions we can trim, easy first then moderate.
            const trimmable = wk.entries
              .filter(e => typeof e.duration === "number" && e.duration > 0 && e.load !== "long" && e.load !== "hard" && e.load !== "rest")
              .sort((a, b) => {
                const rank = { easy: 0, recovery: 0, strides: 1, moderate: 2 };
                return (rank[a.load] || 3) - (rank[b.load] || 3);
              });
            const trimmableTotal = trimmable.reduce((s, e) => s + e.duration, 0);
            if (trimmableTotal > 0) {
              // Proportional scale-down. Cap at 40% cut per session so we
              // don't gut a session entirely — if that still doesn't fit,
              // the leftover overage is logged but accepted.
              const scale = Math.max(0.60, 1 - (overage / trimmableTotal));
              trimmable.forEach(e => {
                e._preCapDuration = e._preCapDuration != null ? e._preCapDuration : e.duration;
                e.duration = Math.max(10, Math.round(e.duration * scale / 5) * 5);
                e._weeklyCapScaled = true;
              });
            }
          }
        }
        priorTotal = weekTotal(wk.entries);
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
    if (!PHASE_DISTRIBUTIONS_BY_LEVEL[sportProfile]) return { added: 0, demoted: 0, weeksChecked: 0 };

    const groups = groupByWeek(plan);
    let added = 0, demoted = 0;

    let doubledWeeks = 0;

    Object.values(groups).forEach(g => {
      const firstEntry = g.entries[0];
      if (!firstEntry) return;
      const phaseName = firstEntry.phase;
      const target = getDistribution(sportProfile, phaseName, athleteLevel);
      if (!target) return; // unknown phase (e.g. Pre-Plan) — leave alone

      const counts = countByDiscipline(g.entries);

      // Per-week doubling context. Budget is capped by level+phase; the
      // ref object is mutated by addMissingSession as doubles accumulate.
      const weekCtx = { level: athleteLevel || "intermediate", doublesUsedRef: { n: 0 } };

      // Add missing sessions, each discipline.
      ["swim", "bike", "run", "strength", "brick", "hyrox"].forEach(disc => {
        const want = target[disc] || 0;
        const have = counts[disc] || 0;
        if (have < want) {
          const missing = want - have;
          for (let i = 0; i < missing; i++) {
            const newEntry = addMissingSession(
              g.entries, g.mondayStr, disc,
              phaseName, firstEntry.raceId, firstEntry.weekNumber, weekCtx
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

      if (weekCtx.doublesUsedRef.n > 0) doubledWeeks++;
    });

    // After counts are aligned, apply progressive overload to long sessions
    // (now level-aware: 10% cap for Beginner/Intermediate, 15% for Advanced,
    // with library-swap clamping against the prior week's long duration).
    const regroupedAfterAdd = groupByWeek(plan);
    applyProgressiveOverload(regroupedAfterAdd, plan, athleteLevel);

    // Final pass: enforce the same per-level cap on each week's total
    // minutes. Without this, a collection of valid per-session durations
    // can still compound into a >10% weekly jump.
    applyWeeklyVolumeCap(regroupedAfterAdd, athleteLevel);

    // Sort plan by date for stable downstream processing.
    plan.sort((a, b) => a.date.localeCompare(b.date));

    return { added, demoted, weeksChecked: Object.keys(groups).length, doubledWeeks };
  }

  if (typeof window !== "undefined") {
    window.PlanSessionDistribution = {
      applySessionDistribution,
      sportProfileForRaceType,
      getDistribution,
      PHASE_DISTRIBUTIONS,
      PHASE_DISTRIBUTIONS_BY_LEVEL,
      HOUR_CEILINGS,
    };
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      applySessionDistribution,
      sportProfileForRaceType,
      getDistribution,
      PHASE_DISTRIBUTIONS,
      PHASE_DISTRIBUTIONS_BY_LEVEL,
      HOUR_CEILINGS,
    };
  }
})();
