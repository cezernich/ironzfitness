/**
 * IronZ Rule Engine — Chunk 1: Arc Builder
 *
 * Builds the macro training arc (phase layout, race targets, B-race windows,
 * weekly hour ceiling) from a classification + race list. Pure logic, no
 * persistence. See sources-of-truth/TRAINING_PHILOSOPHY.md §4 and
 * sources-of-truth/RULE_ENGINE_SPEC.md Step 2.
 */
(function () {
  'use strict';

  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const PHASE_RATIOS = {
    triathlon: { base: 0.25, build: 0.30, peak: 0.25, taper: 0.15, raceWeek: 0.05 },
    running:   { base: 0.25, build: 0.35, peak: 0.20, taper: 0.15, raceWeek: 0.05 },
    // Philosophy §4.6 — Hyrox periodization
    hyrox:     { base: 0.30, build: 0.35, peak: 0.20, taper: 0.10, raceWeek: 0.05 },
  };

  const PHASE_FOCUS = {
    'pre-base':  'Return-to-training ramp: easy aerobic, habits, baseline strength',
    'base':      'Aerobic foundation, technique, strength',
    'build':     'Sport-specific intensity, race simulation',
    'peak':      'Race-pace work, sharpening',
    'taper':     'Volume reduction, maintain intensity',
    'race-week': 'Openers and race execution',
    'mesocycle': '4-week progression block: 3 weeks load + 1 week deload',
  };

  // Max hours (upper end of range) per TRAINING_PHILOSOPHY §4.8
  const HOUR_CEILINGS = {
    triathlon: {
      'sprint-tri':   { beginner: 6,  intermediate: 8,  advanced: 10 },
      'olympic-tri':  { beginner: 10, intermediate: 12, advanced: 14 },
      'half-ironman': { beginner: 12, intermediate: 15, advanced: 18 },
      'ironman':      { beginner: 16, intermediate: 20, advanced: 25 },
    },
    running: {
      '5k':            { beginner: 4,  intermediate: 6,  advanced: 8 },
      '10k':           { beginner: 5,  intermediate: 7,  advanced: 10 },
      'half-marathon': { beginner: 7,  intermediate: 9,  advanced: 12 },
      'marathon':      { beginner: 10, intermediate: 12, advanced: 16 },
      'ultra':         { beginner: 10, intermediate: 15, advanced: 25 },
    },
    // Philosophy §4.8 — Hyrox hour ceilings (level-based, not distance-based)
    hyrox: {
      'hyrox': { beginner: 7, intermediate: 10, advanced: 14 },
    },
  };

  // Philosophy §4.8 — Goal-based hour ceilings for non-race (rolling mesocycle) plans
  const GOAL_HOUR_CEILINGS = {
    speed_performance: { beginner: 6, intermediate: 9,  advanced: 12 },
    endurance:         { beginner: 7, intermediate: 10, advanced: 14 },
    fat_loss:          { beginner: 6, intermediate: 8,  advanced: 10 },
    general_fitness:   { beginner: 5, intermediate: 7,  advanced: 9  },
  };

  // Philosophy §4.5 — Running distance-specific taper overrides (in days).
  // If the percentage-based taper is longer than this, cap it and give the
  // freed weeks back to Build.
  const RUNNING_TAPER_DAYS = {
    '5k':            10,  // 7-10 days → cap at 10 days (~1.5 wk → 1 wk)
    '10k':           14,  // 10-14 days → 2 wk
    'half-marathon': 14,  // 2 weeks
    'marathon':      21,  // 3 weeks (matches default 15% for most plans)
    'ultra':         21,  // same as marathon
  };

  const TRI_RACE_TYPES = new Set(['sprint-tri', 'olympic-tri', 'half-ironman', 'ironman']);
  const RUN_RACE_TYPES = new Set(['5k', '10k', 'half-marathon', 'marathon', 'ultra']);
  const HYROX_RACE_TYPES = new Set(['hyrox']);

  function parseDate(iso) {
    if (iso instanceof Date) return new Date(iso.getTime());
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  function toIsoDate(d) {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function addDays(d, days) {
    const n = new Date(d.getTime());
    n.setUTCDate(n.getUTCDate() + days);
    return n;
  }

  function weeksBetween(startDate, endDate) {
    const startUtc = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
    const endUtc = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
    const days = Math.round((endUtc - startUtc) / MS_PER_DAY);
    return Math.max(1, Math.ceil(days / 7));
  }

  function sportProfileForRaceType(raceType) {
    if (TRI_RACE_TYPES.has(raceType)) return 'triathlon';
    if (HYROX_RACE_TYPES.has(raceType)) return 'hyrox';
    return 'running';
  }

  function runningTaperDaysForRaceType(raceType) {
    return RUNNING_TAPER_DAYS[raceType] || null;
  }

  function findARace(races) {
    if (!Array.isArray(races) || races.length === 0) return null;
    const aRaces = races.filter(r => r && r.priority === 'A');
    const pool = aRaces.length > 0 ? aRaces : races.slice();
    // Latest date among A races (or all races if no A)
    pool.sort((a, b) => new Date(a.date) - new Date(b.date));
    return pool[pool.length - 1];
  }

  function getWeeklyHoursCeiling(level, raceType) {
    const sport = sportProfileForRaceType(raceType);
    const table = HOUR_CEILINGS[sport];
    const row = table && table[raceType];
    if (row && row[level] != null) return row[level];
    // Reasonable fallback: intermediate marathon
    return HOUR_CEILINGS.running.marathon.intermediate;
  }

  // Philosophy §4.8 — Goal-Based Hour Ceilings (non-race plans)
  function getGoalBasedHoursCeiling(level, goal) {
    const row = GOAL_HOUR_CEILINGS[goal];
    if (row && row[level] != null) return row[level];
    const anyRow = GOAL_HOUR_CEILINGS.general_fitness;
    return anyRow[level] || anyRow.intermediate;
  }

  function needsPreBase(classification) {
    if (!classification) return false;
    if (classification.level === 'beginner') return true;
    if (Array.isArray(classification.injuries) && classification.injuries.length > 0) return true;
    if (classification.recoveryState === 'low') return true;
    return false;
  }

  function allocatePhases(totalWeeks, sportProfile, includePreBase, taperOverrideWeeks) {
    const ratios = PHASE_RATIOS[sportProfile] || PHASE_RATIOS.running;

    if (totalWeeks < 6) {
      return compressPhases(totalWeeks, sportProfile);
    }

    const raceWeek = Math.max(1, Math.round(totalWeeks * ratios.raceWeek));
    let taper = Math.max(1, Math.round(totalWeeks * ratios.taper));
    // Running distance-specific taper cap (Philosophy §4.5): if the caller
    // supplied a shorter taper override, use it and hand the freed weeks to
    // Build.
    let taperFreed = 0;
    if (taperOverrideWeeks != null && taperOverrideWeeks >= 1 && taperOverrideWeeks < taper) {
      taperFreed = taper - taperOverrideWeeks;
      taper = taperOverrideWeeks;
    }
    const peak = Math.max(1, Math.round(totalWeeks * ratios.peak));
    let build = Math.max(1, Math.round(totalWeeks * ratios.build)) + taperFreed;
    let base = totalWeeks - raceWeek - taper - peak - build;
    if (base < 1) {
      // Fall back to compression if rounding ate the Base phase
      return compressPhases(totalWeeks, sportProfile);
    }

    const phases = [];
    let cursor = 1;

    let preBaseWeeks = 0;
    if (includePreBase && base >= 4) {
      preBaseWeeks = 2;
      base -= preBaseWeeks;
    } else if (includePreBase && base >= 3) {
      preBaseWeeks = 1;
      base -= preBaseWeeks;
    }

    if (preBaseWeeks > 0) {
      phases.push(makePhase('pre-base', cursor, preBaseWeeks, false));
      cursor += preBaseWeeks;
    }
    phases.push(makePhase('base', cursor, base, false));
    cursor += base;
    phases.push(makePhase('build', cursor, build, false));
    cursor += build;
    phases.push(makePhase('peak', cursor, peak, false));
    cursor += peak;
    phases.push(makePhase('taper', cursor, taper, false));
    cursor += taper;
    phases.push(makePhase('race-week', cursor, raceWeek, false));

    return phases;
  }

  function compressPhases(availableWeeks, sportProfile) {
    const phases = [];
    let cursor = 1;
    const weeks = Math.max(1, availableWeeks);

    if (weeks === 1) {
      phases.push(makePhase('race-week', cursor, 1, true));
      return phases;
    }
    if (weeks === 2) {
      phases.push(makePhase('taper', cursor, 1, false));
      phases.push(makePhase('race-week', cursor + 1, 1, true));
      return phases;
    }
    if (weeks === 3) {
      phases.push(makePhase('peak', cursor, 1, true));
      phases.push(makePhase('taper', cursor + 1, 1, false));
      phases.push(makePhase('race-week', cursor + 2, 1, true));
      return phases;
    }

    // 4 or 5 weeks: skip Pre-Base + Base, distribute remaining across Build/Peak
    const raceWeek = 1;
    const taper = 1;
    let remaining = weeks - raceWeek - taper;

    const ratios = PHASE_RATIOS[sportProfile] || PHASE_RATIOS.running;
    const buildShare = ratios.build / (ratios.build + ratios.peak);
    let build = Math.max(1, Math.round(remaining * buildShare));
    let peak = remaining - build;
    if (peak < 1) { peak = 1; build = remaining - peak; }
    if (build < 1) { build = 1; peak = Math.max(1, remaining - build); }

    phases.push(makePhase('build', cursor, build, true));
    cursor += build;
    phases.push(makePhase('peak', cursor, peak, true));
    cursor += peak;
    phases.push(makePhase('taper', cursor, taper, false));
    cursor += taper;
    phases.push(makePhase('race-week', cursor, raceWeek, true));
    return phases;
  }

  function makePhase(name, startWeek, weeks, compressed) {
    return {
      phase: name,
      startWeek,
      endWeek: startWeek + weeks - 1,
      focus: PHASE_FOCUS[name] || '',
      compressed: !!compressed,
    };
  }

  function insertBRaceWindows(phases, bRaces) {
    if (!Array.isArray(bRaces) || bRaces.length === 0) return [];
    const windows = [];
    for (const race of bRaces) {
      const raceDate = parseDate(race.date);
      if (!raceDate) continue;
      const taperStart = addDays(raceDate, -3);
      const recoveryEnd = addDays(raceDate, 3);
      windows.push({
        raceName: race.name || 'B Race',
        raceDate: toIsoDate(raceDate),
        taperStartDate: toIsoDate(taperStart),
        recoveryEndDate: toIsoDate(recoveryEnd),
        adjustments: '3 days pre: reduce run volume 30%, drop long run, keep easy. 3 days post: easy recovery only.',
      });
    }
    return windows;
  }

  function normalizeRace(race) {
    if (!race) return null;
    const date = parseDate(race.date);
    if (!date) return null;
    return {
      name: race.name || 'Unnamed Race',
      date: toIsoDate(date),
      priority: race.priority || 'A',
      raceType: race.raceType || 'other',
      raceDistance: race.raceDistance || '',
    };
  }

  // Philosophy §4.9 — Rolling mesocycle arc. 4-week block, one mesocycle phase,
  // no races. Used when goal is non-race_performance and there are no races.
  function buildRollingMesocycleArc(classification, startDate, goal) {
    const start = parseDate(startDate);
    if (!start) {
      throw new Error('ArcBuilder.buildArc: invalid startDate');
    }
    const level = (classification && classification.level) || 'intermediate';
    const weeklyHoursCeiling = getGoalBasedHoursCeiling(level, goal);
    return {
      planMode: 'rolling_mesocycle',
      startDate: toIsoDate(start),
      totalWeeks: 4,
      races: [],
      phases: [
        {
          phase: 'mesocycle',
          startWeek: 1,
          endWeek: 4,
          focus: PHASE_FOCUS.mesocycle,
          compressed: false,
        },
      ],
      bRaceWindows: [],
      weeklyHoursCeiling,
      goal,
    };
  }

  function shouldUseRollingMesocycle(classification, races) {
    const hasRaces = Array.isArray(races) && races.length > 0;
    if (hasRaces) return false;
    const goal = classification && classification.goal;
    // race_performance must have a race; if it doesn't, still fall through
    // to a race-based general fitness block (existing legacy behavior).
    if (!goal || goal === 'race_performance') return false;
    return ['speed_performance', 'endurance', 'fat_loss', 'general_fitness'].includes(goal);
  }

  function buildArc(classification, races, startDate) {
    const start = parseDate(startDate);
    if (!start) {
      throw new Error('ArcBuilder.buildArc: invalid startDate');
    }
    const normalized = (Array.isArray(races) ? races : [])
      .map(normalizeRace)
      .filter(Boolean)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // v1.4: route non-race_performance goals without races to rolling mesocycle.
    if (shouldUseRollingMesocycle(classification, normalized)) {
      return buildRollingMesocycleArc(classification, startDate, classification.goal);
    }

    const aRace = findARace(normalized);
    if (!aRace) {
      // No race and goal is race_performance (or missing): build a general
      // 12-week fitness block using the athlete's sport profile.
      const fallbackSport = (classification && classification.sportProfile) || 'running';
      const sportKey = PHASE_RATIOS[fallbackSport] ? fallbackSport : 'running';
      const phases = allocatePhases(12, sportKey, needsPreBase(classification));
      return {
        planMode: 'race_based',
        startDate: toIsoDate(start),
        totalWeeks: 12,
        races: [],
        phases,
        bRaceWindows: [],
        weeklyHoursCeiling: HOUR_CEILINGS.running.marathon.intermediate,
      };
    }

    const aRaceDate = parseDate(aRace.date);
    const totalWeeks = weeksBetween(start, aRaceDate);
    const sportProfile = sportProfileForRaceType(aRace.raceType);

    const preBase = needsPreBase(classification) && totalWeeks >= 6;
    // Apply running distance-specific taper override when the A race is a run.
    let taperOverrideWeeks = null;
    if (sportProfile === 'running') {
      const days = runningTaperDaysForRaceType(aRace.raceType);
      if (days) taperOverrideWeeks = Math.max(1, Math.round(days / 7));
    }
    const phases = allocatePhases(totalWeeks, sportProfile, preBase, taperOverrideWeeks);

    const bRaces = normalized.filter(r => r.priority === 'B');
    const bRaceWindows = insertBRaceWindows(phases, bRaces);

    const level = (classification && classification.level) || 'intermediate';
    const weeklyHoursCeiling = getWeeklyHoursCeiling(level, aRace.raceType);

    return {
      planMode: 'race_based',
      startDate: toIsoDate(start),
      totalWeeks,
      races: normalized,
      phases,
      bRaceWindows,
      weeklyHoursCeiling,
    };
  }

  window.ArcBuilder = {
    buildArc,
    allocatePhases,
    compressPhases,
    insertBRaceWindows,
    getWeeklyHoursCeiling,
    getGoalBasedHoursCeiling,
    buildRollingMesocycleArc,
    shouldUseRollingMesocycle,
    runningTaperDaysForRaceType,
    sportProfileForRaceType,
    needsPreBase,
  };
})();
