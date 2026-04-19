// planner.js — Race event management + training plan generation

// ─── Race configuration ─────────────────────────────────────────────────────
//
// Phase ratios come from TRAINING_PHILOSOPHY.md §4.4 (triathlon),
// §4.5 (running), §4.6 (hyrox). Phases scale to weeksToRace — there
// is no fixed "this race needs N weeks" rule.
//   Triathlon: Base 25% / Build 30% / Peak 25% / Taper 15% / RaceWeek 5%
//   Running:   Base 25% / Build 35% / Peak 20% / Taper 15% / RaceWeek 5%
//   Hyrox:     Base 30% / Build 35% / Peak 20% / Taper 10% / RaceWeek 5%
// Short races (5K/10K) collapse Peak into Build per distance emphasis table.
// RaceWeek is carved off the last 5% but floors at 1 week (the taper+openers
// week). The legacy hardcoded `phases` array below is retained as a fallback
// for code that pre-dates phase ratios.
const PHASE_RATIOS = {
  triathlon: { base: 0.25, build: 0.30, peak: 0.25, taper: 0.15 },
  running:   { base: 0.25, build: 0.35, peak: 0.20, taper: 0.15 },
  running_short: { base: 0.25, build: 0.55, peak: 0.00, taper: 0.15 }, // 5K/10K collapse Peak into Build
  hyrox:     { base: 0.30, build: 0.35, peak: 0.20, taper: 0.10 },
  cycling:   { base: 0.30, build: 0.35, peak: 0.20, taper: 0.10 },
};

const RACE_CONFIGS = {
  ironman: {
    label: "Ironman Triathlon",
    totalWeeks: 24,
    phaseRatios: PHASE_RATIOS.triathlon,
    phases: [
      { name: "Base", weeks: 8 },
      { name: "Build", weeks: 8 },
      { name: "Peak", weeks: 6 },
      { name: "Taper", weeks: 2 },
    ],
  },
  halfIronman: {
    label: "Half-Ironman (70.3)",
    totalWeeks: 16,
    phaseRatios: PHASE_RATIOS.triathlon,
    phases: [
      { name: "Base", weeks: 6 },
      { name: "Build", weeks: 6 },
      { name: "Peak", weeks: 3 },
      { name: "Taper", weeks: 1 },
    ],
  },
  olympic: {
    label: "Olympic Triathlon",
    totalWeeks: 12,
    phaseRatios: PHASE_RATIOS.triathlon,
    phases: [
      { name: "Base", weeks: 4 },
      { name: "Build", weeks: 6 },
      { name: "Taper", weeks: 2 },
    ],
  },
  sprint: {
    label: "Sprint Triathlon",
    totalWeeks: 10,
    phaseRatios: PHASE_RATIOS.triathlon,
    phases: [
      { name: "Base", weeks: 4 },
      { name: "Build", weeks: 4 },
      { name: "Taper", weeks: 2 },
    ],
  },
  marathon: {
    label: "Marathon",
    totalWeeks: 18,
    phaseRatios: PHASE_RATIOS.running,
    phases: [
      { name: "Base", weeks: 6 },
      { name: "Build", weeks: 8 },
      { name: "Peak", weeks: 3 },
      { name: "Taper", weeks: 1 },
    ],
  },
  halfMarathon: {
    label: "Half Marathon",
    totalWeeks: 12,
    phaseRatios: PHASE_RATIOS.running,
    phases: [
      { name: "Base", weeks: 4 },
      { name: "Build", weeks: 6 },
      { name: "Taper", weeks: 2 },
    ],
  },
  tenK: {
    label: "10K",
    totalWeeks: 8,
    phaseRatios: PHASE_RATIOS.running_short,
    phases: [
      { name: "Base", weeks: 3 },
      { name: "Build", weeks: 4 },
      { name: "Taper", weeks: 1 },
    ],
  },
  fiveK: {
    label: "5K",
    totalWeeks: 6,
    phaseRatios: PHASE_RATIOS.running_short,
    phases: [
      { name: "Base", weeks: 2 },
      { name: "Build", weeks: 3 },
      { name: "Taper", weeks: 1 },
    ],
  },
  centuryRide: {
    label: "Century Ride (100mi)",
    totalWeeks: 16,
    phaseRatios: PHASE_RATIOS.cycling,
    phases: [
      { name: "Base", weeks: 6 },
      { name: "Build", weeks: 7 },
      { name: "Peak", weeks: 2 },
      { name: "Taper", weeks: 1 },
    ],
  },
  granFondo: {
    label: "Gran Fondo",
    totalWeeks: 12,
    phaseRatios: PHASE_RATIOS.cycling,
    phases: [
      { name: "Base", weeks: 4 },
      { name: "Build", weeks: 6 },
      { name: "Peak", weeks: 1 },
      { name: "Taper", weeks: 1 },
    ],
  },
  hyrox: {
    label: "Hyrox",
    totalWeeks: 14,
    phaseRatios: PHASE_RATIOS.hyrox,
    phases: [
      { name: "Base", weeks: 4 },
      { name: "Build", weeks: 4 },
      { name: "Peak", weeks: 4 },
      { name: "Taper", weeks: 2 },
    ],
  },
  hyroxDoubles: {
    label: "Hyrox Doubles",
    totalWeeks: 12,
    phaseRatios: PHASE_RATIOS.hyrox,
    phases: [
      { name: "Base", weeks: 3 },
      { name: "Build", weeks: 4 },
      { name: "Peak", weeks: 3 },
      { name: "Taper", weeks: 2 },
    ],
  },
};

/**
 * computePhasesFromRatios(raceType, weeksAvailable)
 * Returns a phase array [{ name, weeks }, ...] computed from the race's
 * philosophy-defined ratios. weeksAvailable = full weeks from plan start
 * to race day (not including race day itself).
 *
 * Compression rules (§4.4 "Phase Compression Rules"):
 *   1. Taper — never compress, always preserve (min 1 week, 2 for long races)
 *   2. Peak — preserve for race readiness (drops to 0 only if <6 weeks total)
 *   3. Base — compress or skip first
 *   4. Build — shrinks last; always keeps ≥1 week
 *   5. <6 weeks total: skip Base entirely, Build → Peak → Taper
 *
 * Rounding: start with Math.floor for Base/Build/Peak, put the remainder
 * into the phase with the largest percentage (usually Build) so totals
 * sum exactly to weeksAvailable.
 */
function computePhasesFromRatios(raceType, weeksAvailable) {
  const cfg = RACE_CONFIGS[raceType];
  if (!cfg || !cfg.phaseRatios || weeksAvailable < 1) return null;

  const ratios = cfg.phaseRatios;
  const longRaces = new Set(["ironman", "marathon", "centuryRide"]);
  const midRaces  = new Set(["halfIronman", "halfMarathon", "olympic", "granFondo", "hyrox"]);
  const minTaper = longRaces.has(raceType) ? 2 : 1;
  // Taper cap — philosophy §4.5: "Marathon 3 weeks, Half 2 weeks, 10K 10-14 days,
  // 5K 7-10 days". Long taper creates detraining, so we clamp regardless of ratio.
  const maxTaper = longRaces.has(raceType) ? 3 : midRaces.has(raceType) ? 2 : 2;

  // Very short plans — the short-race emergency path from §4.4:
  //   <6 weeks → skip Base, compress Build → Peak → Taper.
  if (weeksAvailable < 6) {
    const taper = Math.min(minTaper, Math.max(1, Math.floor(weeksAvailable * 0.20)));
    const peak  = (ratios.peak > 0 && weeksAvailable - taper >= 3) ? 1 : 0;
    const build = Math.max(1, weeksAvailable - taper - peak);
    const out = [{ name: "Build", weeks: build }];
    if (peak > 0) out.push({ name: "Peak", weeks: peak });
    out.push({ name: "Taper", weeks: taper });
    return out;
  }

  // Normal path: allocate by ratio, then cap Taper both ways.
  let taper = Math.max(minTaper, Math.round(weeksAvailable * ratios.taper));
  taper = Math.min(taper, maxTaper);
  const trainingWeeks = weeksAvailable - taper;

  // Split training weeks across Base/Build/Peak proportional to their ratios.
  const tRatioSum = ratios.base + ratios.build + (ratios.peak || 0);
  const baseShare  = ratios.base / tRatioSum;
  const buildShare = ratios.build / tRatioSum;
  const peakShare  = (ratios.peak || 0) / tRatioSum;

  let base  = Math.max(0, Math.floor(trainingWeeks * baseShare));
  let peak  = ratios.peak > 0 ? Math.max(1, Math.floor(trainingWeeks * peakShare)) : 0;
  let build = Math.max(1, trainingWeeks - base - peak);
  // Preserve Build: if rounding ate it, pull from Base first.
  if (build < 1 && base > 0) { base -= 1; build = 1; }
  // Preserve Peak min 1 for races that have one, if weeks allow.
  if (ratios.peak > 0 && peak === 0 && build >= 2) { build -= 1; peak = 1; }

  const out = [];
  if (base > 0)  out.push({ name: "Base",  weeks: base });
  if (build > 0) out.push({ name: "Build", weeks: build });
  if (peak > 0)  out.push({ name: "Peak",  weeks: peak });
  out.push({ name: "Taper", weeks: taper });
  return out;
}

if (typeof window !== "undefined") {
  window.computePhasesFromRatios = computePhasesFromRatios;
}

/**
 * getAdaptivePhases(raceType, weeksAvailable, level, daysPerWeek)
 * Returns phase array adjusted to the athlete's actual situation.
 *
 * Rules:
 * - Taper is fixed (1-2 weeks depending on race distance)
 * - Remaining weeks split across Base/Build/Peak
 * - Beginners: longer base (~45% of remaining), shorter peak (~15%)
 * - Advanced: shorter base (~25%), longer build+peak
 * - More training days (5+) can slightly compress base (faster adaptation)
 * - If weeks < minimum viable, warn but still produce a compressed plan
 */
function getAdaptivePhases(raceType, weeksAvailable, level, daysPerWeek) {
  const config = RACE_CONFIGS[raceType];
  if (!config) return null;

  const idealWeeks = config.totalWeeks;
  const phases = config.phases;
  const hasThreePhases = phases.length === 3; // some plans skip Peak

  // If we have the ideal or more weeks, use default phases
  if (weeksAvailable >= idealWeeks) return { phases: [...phases], compressed: false };

  // Minimum viable weeks per race type
  const minWeeks = { ironman: 12, halfIronman: 10, olympic: 8, sprint: 6, marathon: 10, halfMarathon: 8, tenK: 5, fiveK: 4, centuryRide: 10, granFondo: 8, hyrox: 8, hyroxDoubles: 6 };
  const min = minWeeks[raceType] || 6;
  const weeks = Math.max(weeksAvailable, min);

  // Taper: fixed based on race distance
  const longRaces = ["ironman", "marathon", "centuryRide"];
  const medRaces = ["halfIronman", "halfMarathon", "olympic", "granFondo", "hyrox"];
  const taperWeeks = longRaces.includes(raceType) ? 2 : medRaces.includes(raceType) ? 1 : 1;

  const trainingWeeks = weeks - taperWeeks;

  // Phase ratios based on level
  let baseRatio, buildRatio, peakRatio;
  if (level === "beginner") {
    baseRatio = 0.45;
    buildRatio = 0.40;
    peakRatio = 0.15;
  } else if (level === "advanced") {
    baseRatio = 0.25;
    buildRatio = 0.40;
    peakRatio = 0.35;
  } else {
    // intermediate (default)
    baseRatio = 0.35;
    buildRatio = 0.40;
    peakRatio = 0.25;
  }

  // High frequency (5+ days) slightly compresses base
  if (daysPerWeek && daysPerWeek >= 5) {
    baseRatio -= 0.05;
    buildRatio += 0.05;
  }

  let baseWeeks = Math.max(1, Math.round(trainingWeeks * baseRatio));
  let buildWeeks = Math.max(1, Math.round(trainingWeeks * buildRatio));
  let peakWeeks = Math.max(1, trainingWeeks - baseWeeks - buildWeeks);

  // For short plans or plans without peak phase
  if (hasThreePhases || trainingWeeks < 6) {
    // Merge peak into build
    buildWeeks = trainingWeeks - baseWeeks;
    peakWeeks = 0;
  }

  const result = [
    { name: "Base", weeks: baseWeeks },
    { name: "Build", weeks: buildWeeks },
  ];
  if (peakWeeks > 0) result.push({ name: "Peak", weeks: peakWeeks });
  result.push({ name: "Taper", weeks: taperWeeks });

  return {
    phases: result,
    compressed: weeksAvailable < idealWeeks,
    idealWeeks,
    actualWeeks: weeks,
  };
}

// Weekly patterns: day-of-week (0=Sun … 6=Sat) → {discipline, load}
// Each race type has patterns per phase name.
const WEEKLY_PATTERNS = {
  // All triathlon types share the same weekly structure:
  // Mon(1)=Swim easy, Tue(2)=Interval Bike, Wed(3)=Long Run, Thu(4)=Brick,
  // Fri(5)=Swim moderate/hard, Sat(6)=Long Ride (anchor for longDay pref), Sun(0)=Interval Run
  // Base builds aerobic base with lower intensity; Build/Peak add quality sessions.
  // adjustPatternToDays trims easy sessions first when fewer than 7 days are selected.
  ironman: {
    Base: {
      1: { discipline: "swim", load: "easy" },
      2: { discipline: "bike", load: "moderate" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "easy" },
      5: { discipline: "swim", load: "easy" },
      6: { discipline: "bike", load: "long" },
    },
    Build: {
      0: { discipline: "run", load: "hard" },
      1: { discipline: "swim", load: "easy" },
      2: { discipline: "bike", load: "hard" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "moderate" },
      5: { discipline: "swim", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Peak: {
      0: { discipline: "run", load: "hard" },
      1: { discipline: "swim", load: "hard" },
      2: { discipline: "bike", load: "hard" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "hard" },
      5: { discipline: "swim", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Taper: {
      1: { discipline: "swim", load: "easy" },
      3: { discipline: "run", load: "easy" },
      6: { discipline: "bike", load: "easy" },
    },
  },
  halfIronman: {
    Base: {
      1: { discipline: "swim", load: "easy" },
      2: { discipline: "bike", load: "moderate" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "easy" },
      5: { discipline: "swim", load: "easy" },
      6: { discipline: "bike", load: "long" },
    },
    Build: {
      0: { discipline: "run", load: "hard" },
      1: { discipline: "swim", load: "easy" },
      2: { discipline: "bike", load: "hard" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "moderate" },
      5: { discipline: "swim", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Peak: {
      0: { discipline: "run", load: "hard" },
      1: { discipline: "swim", load: "hard" },
      2: { discipline: "bike", load: "hard" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "hard" },
      5: { discipline: "swim", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Taper: {
      1: { discipline: "swim", load: "easy" },
      3: { discipline: "run", load: "easy" },
      6: { discipline: "bike", load: "easy" },
    },
  },
  olympic: {
    Base: {
      1: { discipline: "swim", load: "easy" },
      2: { discipline: "bike", load: "moderate" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "easy" },
      5: { discipline: "swim", load: "easy" },
      6: { discipline: "bike", load: "long" },
    },
    Build: {
      0: { discipline: "run", load: "hard" },
      1: { discipline: "swim", load: "easy" },
      2: { discipline: "bike", load: "hard" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "moderate" },
      5: { discipline: "swim", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Peak: {
      0: { discipline: "run", load: "hard" },
      1: { discipline: "swim", load: "hard" },
      2: { discipline: "bike", load: "hard" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "hard" },
      5: { discipline: "swim", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Taper: {
      1: { discipline: "swim", load: "easy" },
      3: { discipline: "run", load: "easy" },
      6: { discipline: "bike", load: "easy" },
    },
  },
  sprint: {
    Base: {
      1: { discipline: "swim", load: "easy" },
      2: { discipline: "bike", load: "moderate" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "easy" },
      5: { discipline: "swim", load: "easy" },
      6: { discipline: "bike", load: "long" },
    },
    Build: {
      0: { discipline: "run", load: "hard" },
      1: { discipline: "swim", load: "easy" },
      2: { discipline: "bike", load: "hard" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "moderate" },
      5: { discipline: "swim", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Peak: {
      0: { discipline: "run", load: "hard" },
      1: { discipline: "swim", load: "hard" },
      2: { discipline: "bike", load: "hard" },
      3: { discipline: "run", load: "long" },
      4: { discipline: "brick", load: "hard" },
      5: { discipline: "swim", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Taper: {
      1: { discipline: "swim", load: "easy" },
      3: { discipline: "run", load: "easy" },
      6: { discipline: "bike", load: "easy" },
    },
  },
  // Running patterns are level-aware: { beginner, intermediate, advanced }
  // beginner  — mostly easy, 0–1 quality sessions (strides only in Base/Build, tempo in Peak)
  // intermediate — 1–2 quality sessions, never two hard days adjacent
  // advanced  — up to 2 quality sessions, stricter spacing enforced via buffer easy days
  marathon: {
    beginner: {
      Base: {
        1: { discipline: "run", load: "easy" },
        4: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Build: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "strides" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Peak: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        1: { discipline: "run", load: "easy" },
        4: { discipline: "run", load: "easy" },
      },
    },
    intermediate: {
      Base: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Build: {
        1: { discipline: "run", load: "easy" },
        2: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "run", load: "moderate" },
        6: { discipline: "run", load: "long" },
      },
      Peak: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "hard" },
        5: { discipline: "run", load: "moderate" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "run", load: "easy" },
      },
    },
    advanced: {
      Base: {
        1: { discipline: "run", load: "easy" },
        2: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Build: {
        1: { discipline: "run", load: "moderate" },
        2: { discipline: "run", load: "easy" },  // buffer between Mon moderate and Wed hard
        3: { discipline: "run", load: "hard" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Peak: {
        1: { discipline: "run", load: "moderate" },
        2: { discipline: "run", load: "easy" },  // buffer
        3: { discipline: "run", load: "hard" },
        5: { discipline: "run", load: "moderate" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "run", load: "easy" },
      },
    },
  },
  halfMarathon: {
    beginner: {
      Base: {
        1: { discipline: "run", load: "easy" },
        4: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Build: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "strides" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        1: { discipline: "run", load: "easy" },
        4: { discipline: "run", load: "easy" },
      },
    },
    intermediate: {
      Base: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        6: { discipline: "run", load: "long" },
      },
      Build: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "hard" },
        5: { discipline: "run", load: "moderate" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "easy" },
        5: { discipline: "run", load: "easy" },
      },
    },
    advanced: {
      Base: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Build: {
        1: { discipline: "run", load: "moderate" },
        3: { discipline: "run", load: "hard" },
        5: { discipline: "run", load: "moderate" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "run", load: "easy" },
      },
    },
  },
  tenK: {
    beginner: {
      Base: {
        1: { discipline: "run", load: "easy" },
        4: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Build: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "strides" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        1: { discipline: "run", load: "easy" },
        4: { discipline: "run", load: "easy" },
      },
    },
    intermediate: {
      Base: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        6: { discipline: "run", load: "long" },
      },
      Build: {
        1: { discipline: "run", load: "moderate" },
        3: { discipline: "run", load: "hard" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        1: { discipline: "run", load: "easy" },
        4: { discipline: "run", load: "easy" },
      },
    },
    advanced: {
      Base: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Build: {
        1: { discipline: "run", load: "moderate" },
        3: { discipline: "run", load: "hard" },
        5: { discipline: "run", load: "moderate" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        2: { discipline: "run", load: "easy" },
        5: { discipline: "run", load: "easy" },
      },
    },
  },
  fiveK: {
    beginner: {
      Base: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "easy" },
        5: { discipline: "run", load: "easy" },
      },
      Build: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "strides" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        2: { discipline: "run", load: "easy" },
        5: { discipline: "run", load: "easy" },
      },
    },
    intermediate: {
      Base: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "run", load: "easy" },
      },
      Build: {
        1: { discipline: "run", load: "moderate" },
        3: { discipline: "run", load: "hard" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        2: { discipline: "run", load: "easy" },
        5: { discipline: "run", load: "easy" },
      },
    },
    advanced: {
      Base: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "run", load: "easy" },
        6: { discipline: "run", load: "long" },
      },
      Build: {
        1: { discipline: "run", load: "moderate" },
        3: { discipline: "run", load: "hard" },
        5: { discipline: "run", load: "moderate" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        2: { discipline: "run", load: "easy" },
        5: { discipline: "run", load: "easy" },
      },
    },
  },
  centuryRide: {
    Base: {
      1: { discipline: "bike", load: "easy" },
      3: { discipline: "bike", load: "moderate" },
      5: { discipline: "run", load: "easy" },
      6: { discipline: "bike", load: "long" },
    },
    Build: {
      1: { discipline: "bike", load: "moderate" },
      2: { discipline: "run", load: "easy" },
      3: { discipline: "bike", load: "hard" },
      5: { discipline: "bike", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Peak: {
      1: { discipline: "bike", load: "hard" },
      3: { discipline: "bike", load: "hard" },
      5: { discipline: "bike", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Taper: {
      1: { discipline: "bike", load: "easy" },
      3: { discipline: "bike", load: "easy" },
      5: { discipline: "run", load: "easy" },
    },
  },
  granFondo: {
    Base: {
      1: { discipline: "bike", load: "easy" },
      3: { discipline: "bike", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Build: {
      1: { discipline: "bike", load: "moderate" },
      3: { discipline: "bike", load: "hard" },
      5: { discipline: "bike", load: "moderate" },
      6: { discipline: "bike", load: "long" },
    },
    Peak: {
      1: { discipline: "bike", load: "hard" },
      3: { discipline: "bike", load: "hard" },
      6: { discipline: "bike", load: "long" },
    },
    Taper: {
      1: { discipline: "bike", load: "easy" },
      4: { discipline: "bike", load: "easy" },
    },
  },
  hyrox: {
    // Philosophy §6.3 phase distributions. Every day in a week is a
    // distinct session type (no repeats). Day keys are 0=Sun … 6=Sat.
    // Phase-specific strength shifts per §9.5: heavy compounds (Base)
    // → muscular endurance (Build) → station simulation (Peak) →
    // light maintenance (Taper).
    beginner: {
      // 4-5 sessions/week: 3 easy runs + 1-2 strength + 1 station practice
      Base: {
        1: { discipline: "hyroxStrength", load: "base_heavy" },
        2: { discipline: "hyrox", load: "easy_run" },
        4: { discipline: "hyrox", load: "station_practice" },
        6: { discipline: "hyrox", load: "easy_run" },
      },
      // 5 sessions/week: 2 easy + 1 interval + 1 combo + 1 strength
      Build: {
        1: { discipline: "hyroxStrength", load: "build_endurance" },
        2: { discipline: "hyrox", load: "easy_run" },
        3: { discipline: "hyrox", load: "interval_run" },
        5: { discipline: "hyrox", load: "easy_run" },
        6: { discipline: "hyrox", load: "run_station_combo" },
      },
      // 5 sessions/week: 2 easy + 1 combo + 1 circuit + 1 strength
      Peak: {
        1: { discipline: "hyroxStrength", load: "peak_simulation" },
        2: { discipline: "hyrox", load: "easy_run" },
        4: { discipline: "hyrox", load: "station_circuit" },
        5: { discipline: "hyrox", load: "easy_run" },
        6: { discipline: "hyrox", load: "run_station_combo" },
      },
      // 3 sessions/week: 2 easy + 1 short opener combo
      Taper: {
        2: { discipline: "hyrox", load: "easy_run" },
        4: { discipline: "hyrox", load: "short_opener_combo" },
        5: { discipline: "hyrox", load: "recovery_run" },
      },
    },
    intermediate: {
      // 6 sessions/week: 3 easy runs + 2 heavy strength + 1 station practice
      Base: {
        1: { discipline: "hyroxStrength", load: "base_heavy" },
        2: { discipline: "hyrox", load: "easy_run" },
        3: { discipline: "hyrox", load: "easy_run" },
        4: { discipline: "hyroxStrength", load: "base_heavy" },
        5: { discipline: "hyrox", load: "station_practice" },
        6: { discipline: "hyrox", load: "easy_run" },
      },
      // 6 sessions/week: 2 easy + 1 interval + 1 circuit + 1 combo + 1 endurance-strength
      Build: {
        1: { discipline: "hyroxStrength", load: "build_endurance" },
        2: { discipline: "hyrox", load: "easy_run" },
        3: { discipline: "hyrox", load: "interval_run" },
        4: { discipline: "hyrox", load: "station_circuit" },
        5: { discipline: "hyrox", load: "easy_run" },
        6: { discipline: "hyrox", load: "run_station_combo" },
      },
      // 6 sessions/week: 2 easy + 1 race-pace combo + 1 interval + 1 circuit + 1 peak strength
      Peak: {
        1: { discipline: "hyroxStrength", load: "peak_simulation" },
        2: { discipline: "hyrox", load: "easy_run" },
        3: { discipline: "hyrox", load: "interval_run" },
        4: { discipline: "hyrox", load: "station_circuit" },
        5: { discipline: "hyrox", load: "recovery_run" },
        6: { discipline: "hyrox", load: "race_simulation" },
      },
      // 3-4 sessions/week: 2 easy + 1 short opener combo + 1 light strength
      Taper: {
        1: { discipline: "hyroxStrength", load: "taper_maintenance" },
        2: { discipline: "hyrox", load: "easy_run" },
        4: { discipline: "hyrox", load: "short_opener_combo" },
        6: { discipline: "hyrox", load: "recovery_run" },
      },
    },
    advanced: {
      // 7 sessions/week: 3 easy runs + 2 heavy strength + 1 station practice + 1 combo
      Base: {
        0: { discipline: "hyrox", load: "easy_run" },
        1: { discipline: "hyroxStrength", load: "base_heavy" },
        2: { discipline: "hyrox", load: "easy_run" },
        3: { discipline: "hyrox", load: "station_practice" },
        4: { discipline: "hyroxStrength", load: "base_heavy" },
        5: { discipline: "hyrox", load: "recovery_run" },
        6: { discipline: "hyrox", load: "run_station_combo" },
      },
      // 7 sessions/week: 2 easy + 1 interval + 2 station days + 2 strength
      Build: {
        0: { discipline: "hyrox", load: "easy_run" },
        1: { discipline: "hyroxStrength", load: "build_endurance" },
        2: { discipline: "hyrox", load: "interval_run" },
        3: { discipline: "hyrox", load: "station_circuit" },
        4: { discipline: "hyroxStrength", load: "build_endurance" },
        5: { discipline: "hyrox", load: "recovery_run" },
        6: { discipline: "hyrox", load: "run_station_combo" },
      },
      // 7 sessions/week: 2 easy + 1 interval + 1 circuit + 1 combo + 1 race sim + 1 strength
      Peak: {
        0: { discipline: "hyrox", load: "easy_run" },
        1: { discipline: "hyroxStrength", load: "peak_simulation" },
        2: { discipline: "hyrox", load: "interval_run" },
        3: { discipline: "hyrox", load: "station_circuit" },
        4: { discipline: "hyrox", load: "easy_run" },
        5: { discipline: "hyrox", load: "recovery_run" },
        6: { discipline: "hyrox", load: "race_simulation" },
      },
      // 4 sessions/week: 2 easy + 1 short opener + 1 light strength
      Taper: {
        1: { discipline: "hyroxStrength", load: "taper_maintenance" },
        2: { discipline: "hyrox", load: "easy_run" },
        4: { discipline: "hyrox", load: "short_opener_combo" },
        5: { discipline: "hyrox", load: "recovery_run" },
      },
    },
  },
  hyroxDoubles: {
    beginner: {
      Base: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "hyroxStrength", load: "easy" },
        5: { discipline: "hyrox", load: "easy" },
        6: { discipline: "run", load: "easy" },
      },
      Build: {
        1: { discipline: "run", load: "moderate" },
        3: { discipline: "hyroxStrength", load: "moderate" },
        5: { discipline: "hyrox", load: "moderate" },
        6: { discipline: "run", load: "easy" },
      },
      Peak: {
        1: { discipline: "run", load: "moderate" },
        3: { discipline: "hyroxStrength", load: "moderate" },
        5: { discipline: "hyrox", load: "hard" },
        6: { discipline: "run", load: "easy" },
      },
      Taper: {
        1: { discipline: "run", load: "easy" },
        4: { discipline: "hyrox", load: "easy" },
      },
    },
    intermediate: {
      Base: {
        1: { discipline: "run", load: "easy" },
        2: { discipline: "hyroxStrength", load: "easy" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "hyrox", load: "moderate" },
        6: { discipline: "run", load: "long" },
      },
      Build: {
        1: { discipline: "run", load: "moderate" },
        2: { discipline: "hyroxStrength", load: "moderate" },
        3: { discipline: "run", load: "hard" },
        5: { discipline: "hyrox", load: "hard" },
        6: { discipline: "run", load: "long" },
      },
      Peak: {
        1: { discipline: "run", load: "hard" },
        2: { discipline: "hyroxStrength", load: "hard" },
        3: { discipline: "run", load: "moderate" },
        5: { discipline: "hyrox", load: "hard" },
        6: { discipline: "run", load: "long" },
      },
      Taper: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "hyroxStrength", load: "easy" },
        5: { discipline: "run", load: "easy" },
      },
    },
    advanced: {
      Base: {
        0: { discipline: "run", load: "easy" },
        1: { discipline: "hyroxStrength", load: "moderate" },
        2: { discipline: "run", load: "moderate" },
        3: { discipline: "hyrox", load: "easy" },
        5: { discipline: "hyroxStrength", load: "easy" },
        6: { discipline: "hyrox", load: "moderate" },
      },
      Build: {
        0: { discipline: "run", load: "moderate" },
        1: { discipline: "hyroxStrength", load: "hard" },
        2: { discipline: "run", load: "hard" },
        3: { discipline: "hyrox", load: "moderate" },
        5: { discipline: "hyroxStrength", load: "moderate" },
        6: { discipline: "hyrox", load: "hard" },
      },
      Peak: {
        0: { discipline: "run", load: "hard" },
        1: { discipline: "hyroxStrength", load: "hard" },
        2: { discipline: "run", load: "hard" },
        3: { discipline: "hyrox", load: "hard" },
        5: { discipline: "hyroxStrength", load: "moderate" },
        6: { discipline: "hyrox", load: "hard" },
      },
      Taper: {
        1: { discipline: "run", load: "easy" },
        3: { discipline: "hyrox", load: "easy" },
        5: { discipline: "run", load: "easy" },
      },
    },
  },
};

// Structured session descriptions per discipline + load.
// Each entry: { duration (min), steps: [{ type, duration, zone, label, reps?, rest? }] }
// For interval steps reps × duration min on, rest min between each rep.
const SESSION_DESCRIPTIONS = {
  swim: {
    test: {
      duration: 40,
      name: "CSS Test",
      steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "400m easy mixed strokes — loosen up, settle breathing" },
        { type: "main",     duration: 8,  zone: 5, label: "400m ALL-OUT time trial — record your finish time" },
        { type: "rest",     duration: 5,  zone: 0, label: "5 min rest — stay in the water, easy kicking" },
        { type: "main",     duration: 4,  zone: 5, label: "200m ALL-OUT time trial — record your finish time" },
        { type: "cooldown", duration: 5,  zone: 1, label: "200m easy cool-down — long strokes, deep breaths" },
      ],
    },
    easy: {
      duration: 30,
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Easy free swim — loosen shoulders, breathe every 3 strokes" },
        { type: "main",     duration: 20, zone: 2, label: "Steady continuous laps — focus on high-elbow catch and long pull" },
        { type: "cooldown", duration: 5,  zone: 1, label: "Easy backstroke — slow the turnover, reset breathing" },
      ],
    },
    moderate: {
      duration: 45,
      steps: [
        { type: "warmup",   duration: 8,  zone: 1, label: "200m easy free + drills: catch-up, fingertip drag" },
        { type: "main",     duration: 4,  zone: 3, label: "Threshold pace — strong pull, maintain form under effort", reps: 6, rest: 1 },
        { type: "cooldown", duration: 8,  zone: 1, label: "Easy 200m — long strokes, breathe every 3" },
      ],
    },
    hard: {
      duration: 60,
      steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "400m easy + 4×25m build to race pace" },
        { type: "main",     duration: 3,  zone: 4, label: "Race pace — explosive turns, maximum effort per rep", reps: 10, rest: 1 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy 400m — relax and breathe out the effort" },
      ],
    },
    long: {
      duration: 75,
      steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "400m easy + drills: fingertip drag, single-arm" },
        { type: "main",     duration: 55, zone: 2, label: "Continuous aerobic swim at open-water pace — sight every 10 strokes" },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy 200m backstroke — stretch and breathe" },
      ],
    },
    race_week_openers: {
      duration: 25, name: "Race-Week Swim Openers",
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "300m easy free — loosen shoulders, breathe deep" },
        { type: "main",     duration: 15, zone: 2, label: "Technique + feel: 8×50m smooth freestyle w/ 10s rest, crisp catch and rotation. Finish with 4×50m at race effort (not all-out)." },
        { type: "cooldown", duration: 5,  zone: 1, label: "200m easy backstroke — reset breathing" },
      ],
    },
    race_week_shakeout: {
      duration: 15, name: "Race-Week Swim Shakeout",
      steps: [
        { type: "main", duration: 15, zone: 1, label: "500-600m easy continuous — all technique-focused. No hard sets. Feel the water." },
      ],
    },
  },

  bike: {
    test: {
      duration: 45,
      name: "FTP Test",
      steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy spin with a few openers — 3×30s building to Z3" },
        { type: "main",     duration: 20, zone: 5, label: "20 min ALL-OUT sustained effort — the highest power you can hold for the full 20 minutes. Not intervals. One continuous max effort. Record average power." },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy spin-down — let your heart rate come back" },
      ],
    },
    easy: {
      duration: 45,
      steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy spin — gradually increase cadence to 85 RPM" },
        { type: "main",     duration: 30, zone: 2, label: "Aerobic ride — 85–90 RPM, flat terrain, conversational effort" },
        { type: "cooldown", duration: 5,  zone: 1, label: "Spin down — light gear, let heart rate drop" },
      ],
    },
    moderate: {
      duration: 90,
      steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin building to Z2 — include 3×20s high-cadence bursts" },
        { type: "main",     duration: 25, zone: 3, label: "Sweetspot — 88% FTP, hold 85 RPM, controlled breathing", reps: 2, rest: 5 },
        { type: "cooldown", duration: 20, zone: 2, label: "Z2 spin-down — aerobic flush, keep legs moving" },
      ],
    },
    hard: {
      duration: 75,
      steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin to Z2 + 3×30s high-cadence bursts at 110 RPM" },
        { type: "main",     duration: 20, zone: 4, label: "Threshold interval — 95% FTP, hold steady power and form", reps: 2, rest: 5 },
        { type: "cooldown", duration: 15, zone: 1, label: "Easy spin-down — shake out the legs" },
      ],
    },
    long: {
      duration: 180,
      steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin — settle into aero, hydrate, get comfortable" },
        { type: "main",     duration: 150, zone: 2, label: "Long aerobic ride — Z2 effort, fuel every 45 min, hydrate every 20 min" },
        { type: "cooldown", duration: 15, zone: 1, label: "Spin-down — flush the legs before dismounting" },
      ],
    },
    race_week_openers: {
      duration: 30, name: "Race-Week Bike Openers",
      steps: [
        { type: "warmup",   duration: 8,  zone: 1, label: "Easy spin — build cadence to 90 RPM" },
        { type: "main",     duration: 17, zone: 2, label: "Z2 aerobic riding + 3×15s pickups at race effort with full easy recovery between — short, crisp, race-sharp" },
        { type: "cooldown", duration: 5,  zone: 1, label: "Easy spin-down" },
      ],
    },
    race_week_shakeout: {
      duration: 20, name: "Race-Week Bike Shakeout",
      steps: [
        { type: "main", duration: 20, zone: 1, label: "Very short easy spin — keep legs turning, 85-95 RPM, nothing more. No power intervals, no climbs." },
      ],
    },
  },

  run: {
    test: {
      duration: 50,
      name: "5K Time Trial",
      steps: [
        { type: "warmup",   duration: 12, zone: 1, label: "10–15 min easy jog + 4×20s strides with full recovery" },
        { type: "main",     duration: 25, zone: 5, label: "5K ALL-OUT — continuous race-pace effort, not broken into intervals. Run the full 5K as hard as possible. Record your finish time." },
        { type: "cooldown", duration: 10, zone: 1, label: "10 min easy jog — let your heart rate come down gradually" },
      ],
    },
    easy: {
      duration: 35,
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Walk + dynamic drills — leg swings, high knees, calf raises" },
        { type: "main",     duration: 25, zone: 2, label: "Easy aerobic run — fully conversational pace, RPE 4–5; if you can't hold a sentence, slow down" },
        { type: "cooldown", duration: 5,  zone: 1, label: "Walk + static stretches — hamstrings, calves, hip flexors" },
      ],
    },
    strides: {
      duration: 35,
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Easy walk/jog — relax and settle in before the run" },
        { type: "main",     duration: 20, zone: 2, label: "Easy aerobic run — comfortable, conversational effort throughout" },
        { type: "main",     duration: 8,  zone: 3, label: "4–6 strides: 20-second smooth accelerations to ~85% effort — not a sprint; walk or easy jog 60 seconds between each", reps: 5, rest: 1 },
        { type: "cooldown", duration: 2,  zone: 1, label: "Easy walk — shake out, breathe down" },
      ],
    },
    moderate: {
      duration: 50,
      steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy jog + 4×20s strides — build gradually to tempo effort" },
        { type: "main",     duration: 20, zone: 3, label: "Tempo run — comfortably hard, RPE 6–7; hold even effort throughout; if pace slips, back off before form breaks" },
        { type: "main",     duration: 10, zone: 2, label: "Recovery jog — bring heart rate back to Z2 before cooldown" },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog/walk + full-body stretch" },
      ],
    },
    hard: {
      duration: 60,
      steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy jog + drills + 4×20s build strides — arrive at the first rep ready to work, not already tired" },
        { type: "main",     duration: 5,  zone: 4, label: "Threshold repeat — strong, controlled, even splits; RPE 8; do not sprint, do not drift; quality over quantity", reps: 6, rest: 2 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog + full-body stretch — flush the legs before the next session" },
      ],
    },
    long: {
      duration: 100,
      steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy walk/jog — keep heart rate low, let the body wake up gradually" },
        { type: "main",     duration: 80, zone: 2, label: "Long easy run — Z2 throughout, RPE 4–5; fuel every 30–45 min for runs over 60 min; walk 1 min every 30 min if needed — finishing strong matters more than pace" },
        { type: "cooldown", duration: 10, zone: 1, label: "Walk + full mobility circuit — hips, hamstrings, calves" },
      ],
    },
    race_week_easy: {
      duration: 25, name: "Race-Week Easy Run",
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Walk + dynamic drills" },
        { type: "main",     duration: 15, zone: 2, label: "Z2 conversational — short and relaxed, nothing spicy" },
        { type: "cooldown", duration: 5,  zone: 1, label: "Walk + stretch" },
      ],
    },
    race_week_openers: {
      duration: 20, name: "Race-Week Run Openers",
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Walk to jog — wake the legs up" },
        { type: "main",     duration: 10, zone: 2, label: "Easy Z1-Z2 running — comfortable" },
        { type: "main",     duration: 3,  zone: 3, label: "4×15s strides at race pace with 45s easy jog between — crisp form, no strain" },
        { type: "cooldown", duration: 2,  zone: 1, label: "Walk + stretch" },
      ],
    },
    race_week_shakeout: {
      duration: 15, name: "Race-Week Run Shakeout",
      steps: [
        { type: "main", duration: 15, zone: 1, label: "Very easy jog — Z1 only, legs awake, nothing more. This is NOT training; it's a race-morning nervous-system warm-up the day before." },
      ],
    },
  },

  hyrox: {
    // ── Legacy 3-load bucket (retained for back-compat with any saved
    // plan that still references them). New Hyrox slot templates below
    // use the named session types from Philosophy §5.5 so two days in
    // the same week are never identical. ──────────────────────────────
    easy: {
      duration: 40,
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Easy jog + dynamic drills — leg swings, high knees, arm circles" },
        { type: "main",     duration: 10, zone: 2, label: "Easy run — conversational pace, focus on form" },
        { type: "main",     duration: 20, zone: 2, label: "Station practice — pick 2–3 stations, moderate weight, focus on movement quality: wall balls, sled push, farmers carry", exercise: true },
        { type: "cooldown", duration: 5,  zone: 1, label: "Walk + stretch — hamstrings, shoulders, hip flexors" },
      ],
    },
    moderate: {
      duration: 55,
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Easy jog + 4×20s strides — build to working effort" },
        { type: "main",     duration: 4,  zone: 3, label: "1 km run at race pace — practice pacing between stations", reps: 3, rest: 1 },
        { type: "main",     duration: 25, zone: 3, label: "Station circuit — SkiErg, sled push, burpee broad jumps, rowing, wall balls; race-effort intensity, minimal rest between stations", exercise: true },
        { type: "cooldown", duration: 5,  zone: 1, label: "Easy jog + full-body stretch" },
      ],
    },
    hard: {
      duration: 65,
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Easy jog + drills + 4×20s build strides" },
        { type: "main",     duration: 4,  zone: 4, label: "1 km hard run — at or above race pace", reps: 4, rest: 1 },
        { type: "main",     duration: 30, zone: 4, label: "Full station simulation — all 8 stations at race weight and pace; practice transitions and grip management", exercise: true },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy walk + full mobility — flush legs, open shoulders" },
      ],
    },

    // ── Philosophy §5.5 — 7 distinct Hyrox session types ───────────────
    // Slot templates (SLOTS.hyrox.*) route each day to one of these loads
    // per Philosophy §6.3 phase distribution so two Hyrox days in the
    // same week are fundamentally different workouts.
    easy_run: {
      duration: 40,
      name: "Easy Run",
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Dynamic drills — leg swings, A-skips, high knees" },
        { type: "main",     duration: 30, zone: 2, label: "Easy run — Z1-Z2 conversational pace. Builds the aerobic base for the 8 × 1K of running you'll face on race day." },
        { type: "cooldown", duration: 5,  zone: 1, label: "Walk + stretch — calves, hip flexors, hamstrings" },
      ],
    },
    recovery_run: {
      duration: 25,
      name: "Recovery Run",
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Walk to jog — start very easy" },
        { type: "main",     duration: 15, zone: 1, label: "Easy jog — Z1 only, ~60% max HR. Flush the legs after a hard session." },
        { type: "cooldown", duration: 5,  zone: 1, label: "Walk + foam roll — quads, calves, glutes" },
      ],
    },
    interval_run: {
      duration: 55,
      name: "Interval Run (1K repeats)",
      steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy jog + 4×20s strides — prime the nervous system" },
        { type: "main",     duration: 4,  zone: 4, label: "1 km repeat at race pace — simulates the 1K runs between Hyrox stations; hold steady form under fatigue", reps: 6, rest: 1.5 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog 5 min + stretch — hamstrings, calves, hip flexors" },
      ],
    },
    station_practice: {
      duration: 45,
      name: "Station Practice",
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Mobility + band activation — shoulders, hips, t-spine" },
        { type: "main",     duration: 35, zone: 2, label: "Technique work — low intensity, pick 3-4 stations and drill movement quality: Wall Balls 3×15 (depth + trajectory), Farmer Carry 4×40m (posture + grip), Sled Push 4×25m (drive angle), Burpee Broad Jumps 3×20m (hip extension). Rest as needed.", exercise: true },
        { type: "cooldown", duration: 5,  zone: 1, label: "Walk + stretch shoulders and hips" },
      ],
    },
    station_circuit: {
      duration: 50,
      name: "Station Circuit",
      steps: [
        { type: "warmup",   duration: 8,  zone: 2, label: "2-min row + 2-min SkiErg + dynamic drills — prime all movement patterns" },
        { type: "main",     duration: 35, zone: 4, label: "Station circuit — all 8 Hyrox movements back-to-back, NO running between: SkiErg 500m → Sled Push 25m → Sled Pull 25m → Burpee Broad Jumps 40m → Row 500m → Farmer Carry 100m → Sandbag Lunges 50m → Wall Balls 30 reps. Moderate-hard pace, minimal rest. Substitute any missing station per §9.5.", exercise: true },
        { type: "cooldown", duration: 7,  zone: 1, label: "Easy walk + mobility — forearms, hips, thoracic spine" },
      ],
    },
    run_station_combo: {
      duration: 55,
      name: "Run + Station Combo (The 1K Sandwich)",
      steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy jog 5 min + 4×20s strides — build to working effort" },
        { type: "main",     duration: 35, zone: 4, label: "The 1K Sandwich: 1K run → 1 station → repeat across 3-4 stations. Sequence: 1K run @ race pace → Sled Push 25m → 1K run → Wall Balls 25 → 1K run → Burpee Broad Jumps 30m → 1K run → Farmer Carry 100m. This is THE defining Hyrox workout: training the hand-off between running fatigue and station fatigue.", exercise: true },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog 5 min + full-body stretch" },
      ],
    },
    race_simulation: {
      duration: 75,
      name: "Race Simulation (Half-Sim)",
      steps: [
        { type: "warmup",   duration: 10, zone: 2, label: "Easy jog + drills + 2×1min openers at race pace" },
        { type: "main",     duration: 55, zone: 4, label: "Half race simulation — 4 × (1K run at race pace + 1 station at race weight). Pick 4 stations in order: Wall Balls 25 → Sandbag Lunges 50m → Farmer Carry 100m → Sled Pull 25m. Race-effort pacing, practice transitions and grip management. This is your dress rehearsal — treat it like the race.", exercise: true },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy walk + mobility — full-body flush, attention to shoulders and grip" },
      ],
    },
    short_opener_combo: {
      duration: 30,
      name: "Short Opener Combo (Taper)",
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Easy jog 3 min + dynamic drills" },
        { type: "main",     duration: 20, zone: 3, label: "Short taper opener — 2 × (500m run at race pace + 1 light station: pick Wall Balls 15 or Farmer Carry 50m or Burpee Broad Jumps 20m). Stay sharp without emptying the tank.", exercise: true },
        { type: "cooldown", duration: 5,  zone: 1, label: "Walk + stretch — keep it loose" },
      ],
    },
  },

  hyroxStrength: {
    // Legacy 3-bucket loads — retained for back-compat.
    easy: {
      duration: 40,
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Foam roll + band activation — glutes, shoulders, core" },
        { type: "main",     duration: 30, zone: 2, label: "Functional strength circuit: 3 rounds — goblet squats ×12, push-ups ×15, bent-over rows ×12, lunges ×10/side, plank 45s; 60s rest between rounds", exercise: true },
        { type: "cooldown", duration: 5,  zone: 1, label: "Stretch — hip flexors, lats, thoracic spine" },
      ],
    },
    moderate: {
      duration: 50,
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Dynamic warm-up — inchworms, world's greatest stretch, band pull-aparts" },
        { type: "main",     duration: 15, zone: 3, label: "Heavy compound work: 4×6 back squat or trap-bar deadlift, 4×8 bench press or overhead press — rest 2 min between sets; build to race-relevant strength", exercise: true },
        { type: "main",     duration: 20, zone: 3, label: "Station-specific strength: sled push/pull practice ×4, wall balls 3×20, farmers carry 4×40m, sandbag lunges 3×20 — focus on grip endurance and pacing", exercise: true },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy row 5 min + full-body stretch" },
      ],
    },
    hard: {
      duration: 60,
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Dynamic warm-up + 2×30s SkiErg to prime pulling muscles" },
        { type: "main",     duration: 20, zone: 4, label: "Heavy lifting: 5×5 deadlift, 4×6 weighted pull-ups, 4×8 front squat — race-weight or heavier; full recovery between sets", exercise: true },
        { type: "main",     duration: 25, zone: 4, label: "Race-simulation circuit under fatigue: 1 km row → 20 wall balls → sled push 25m → 20 burpee broad jumps → farmers carry 50m → 25 sandbag lunges; minimal rest, race intensity", reps: 2, rest: 3, exercise: true },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog 5 min + mobility — hips, shoulders, grip stretches" },
      ],
    },

    // ── Philosophy §9.5 — phase-specific Hyrox strength programming ────
    base_heavy: {
      duration: 55,
      name: "Hyrox Base Strength (Heavy Compound)",
      steps: [
        { type: "warmup",   duration: 8,  zone: 1, label: "Foam roll + band pull-aparts + goblet squat ×8 + inchworms ×5 — primer reps on empty bar" },
        { type: "main",     duration: 40, zone: 3, label: "Heavy compounds (3-4×6-8, 120-180s rest): Back Squat 4×6 @ 80-85% 1RM → Deadlift 3×6 @ 75-80% → Bench Press or Overhead Press 4×8 → Bent-Over Row 4×8 → Walking Lunges 3×10/side (loaded). Grit-it-out work that builds the force ceiling Hyrox stations will tap.", exercise: true },
        { type: "cooldown", duration: 7,  zone: 1, label: "Couch stretch + thoracic opener + calf stretch" },
      ],
    },
    build_endurance: {
      duration: 50,
      name: "Hyrox Build Strength (Muscular Endurance)",
      steps: [
        { type: "warmup",   duration: 6,  zone: 2, label: "3 min row + dynamic mobility — primes stations-mode movement" },
        { type: "main",     duration: 38, zone: 3, label: "Muscular endurance (3-4×12-16, 60-90s rest): Goblet Squat 4×15 → Kettlebell Swing 4×20 → Push-up 4×12 → Bent-Over Row 4×12 → Walking Lunge 3×20 steps → Farmer Carry 4×40m. Moderate weight, strict form, short rest — the station-specific rep range you'll actually race in.", exercise: true },
        { type: "cooldown", duration: 6,  zone: 1, label: "Hip flexor + lat + forearm stretches — grip will be smoked" },
      ],
    },
    peak_simulation: {
      duration: 50,
      name: "Hyrox Peak Strength (Station Simulation)",
      steps: [
        { type: "warmup",   duration: 8,  zone: 2, label: "500m row + SkiErg 30s + burpee ×5 + band pull-apart ×10 — full-body primer at race intensity" },
        { type: "main",     duration: 32, zone: 4, label: "Station simulation circuits (2-3 rounds, minimal rest): SkiErg 500m → Sled Push 25m → Wall Balls 25 → Burpee Broad Jumps 30m → Farmer Carry 100m. Race-effort pacing, treat every round like race day. If you miss a station, sub from §9.5 (battle ropes for SkiErg, wall sits for sled push, thrusters for wall balls).", reps: 2, rest: 3, exercise: true },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog 3 min + shoulder + grip mobility" },
      ],
    },
    taper_maintenance: {
      duration: 30,
      name: "Hyrox Taper Strength (Light Maintenance)",
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Mobility flow + empty-bar primer sets" },
        { type: "main",     duration: 20, zone: 2, label: "Light maintenance (2×8-10, 90s rest): Back Squat 2×8 @ 60-65% 1RM → Deadlift 2×8 @ 60% → Pull-up or Bent-Over Row 2×10. Clean reps, nothing near failure — stay sharp without fatiguing into race day.", exercise: true },
        { type: "cooldown", duration: 5,  zone: 1, label: "Stretch hips + lats — leave the gym fresher than you arrived" },
      ],
    },
  },

  brick: {
    easy: {
      duration: 60,
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Easy spin — build cadence, get comfortable in aero" },
        { type: "main",     duration: 35, zone: 2, label: "Aerobic bike — Z2 effort, practice fueling strategy" },
        { type: "main",     duration: 3,  zone: 1, label: "T1 — rack bike, change shoes, head out", note: "T1" },
        { type: "main",     duration: 17, zone: 2, label: "Brick run — fight the heavy-leg feeling, hold Z2 effort" },
      ],
    },
    moderate: {
      duration: 120,
      steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy spin — build to Z2" },
        { type: "main",     duration: 70, zone: 3, label: "Tempo ride — Z2–3, even power, aerodynamic position" },
        { type: "main",     duration: 3,  zone: 1, label: "T1 — smooth and fast transition", note: "T1" },
        { type: "main",     duration: 30, zone: 3, label: "Tempo brick run — hold race effort despite accumulated fatigue" },
        { type: "cooldown", duration: 7,  zone: 1, label: "Easy jog + stretch" },
      ],
    },
    hard: {
      duration: 165,
      steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin building to Z2 + 3×30s high-cadence bursts" },
        { type: "main",     duration: 105, zone: 4, label: "Race-intensity ride — hold goal race power or HR throughout" },
        { type: "main",     duration: 3,  zone: 1, label: "T1 — practice race-day transition speed", note: "T1" },
        { type: "main",     duration: 42, zone: 4, label: "Race-pace run — maintain goal pace under heavy fatigue" },
      ],
    },
    long: {
      duration: 240,
      steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin — settle in, hydrate, get into aero position" },
        { type: "main",     duration: 165, zone: 2, label: "Long aerobic ride — Z2 effort, fuel every 45 min, hydrate every 20 min" },
        { type: "main",     duration: 3,  zone: 1, label: "T1", note: "T1" },
        { type: "main",     duration: 57, zone: 2, label: "Aerobic run off bike — Z2 throughout, simulate race fatigue" },
      ],
    },
    // Race-week brick opener (Philosophy §6.1). Short bike + run to rehearse
    // transition feel without depleting freshness for race day.
    race_week_opener: {
      duration: 25, name: "Race-Week Brick Opener",
      steps: [
        { type: "warmup",   duration: 5,  zone: 1, label: "Easy spin — wake the legs up" },
        { type: "main",     duration: 12, zone: 2, label: "Z2 ride + 2×30s race-effort pickups, full recovery between — rehearse the feel of race pace without settling in" },
        { type: "main",     duration: 8,  zone: 2, label: "Run off the bike — 8 min easy + 2×20s pickups. Practice the transition only; nothing to prove." },
      ],
    },
  },

  // Race-week light activation / mobility (Philosophy §6.1 race-week + §4.5
  // taper rules: keep the athlete moving but NEVER fatigue on race-week
  // "rest" days). Discipline "mobility" is a walk + activation flow.
  mobility: {
    race_week_activation: {
      duration: 20, name: "Race-Week Mobility + Activation",
      steps: [
        { type: "warmup", duration: 8,  zone: 1, label: "Easy walk 8 min — get blood moving, loosen hips" },
        { type: "main",   duration: 10, zone: 1, label: "Activation flow: clamshells 2×12/side · glute bridges 2×15 · dead bugs 2×10/side · bird dogs 2×10/side · thoracic rotations 2×8/side. Bodyweight, controlled." },
        { type: "cooldown", duration: 2, zone: 1, label: "Couch stretch + calf stretch — 30s each side" },
      ],
    },
  },
};

// ─── Weekly variation of quality sessions ─────────────────────────────────────
// Each entry is an array of variants that override the default SESSION_DESCRIPTIONS
// template for a given {discipline, load}. getSessionTemplate() rotates through
// the array by weekNumber so two adjacent weeks inside the same phase render
// different workouts — faithful to the philosophy that a phase has a goal but
// the weekly stimulus should vary (threshold vs VO2 vs hills, tempo vs
// progression vs fartlek, steady vs surges vs tempo-finish, etc.).
// Rotation rule: variants[(weekNumber - 1) mod N]. If no variants are defined
// for a load, getSessionTemplate falls back to SESSION_DESCRIPTIONS unchanged.
const SESSION_VARIANTS = {
  run: {
    hard: [
      { name: "Threshold Repeats", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy jog + drills + 4×20s build strides — arrive at the first rep ready to work" },
        { type: "main",     duration: 5,  zone: 4, label: "Threshold repeat — strong, controlled, even splits; RPE 8; quality over quantity", reps: 6, rest: 2 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog + full-body stretch" },
      ]},
      { name: "Cruise Intervals", steps: [
        { type: "warmup",   duration: 12, zone: 1, label: "Easy jog + 4×20s strides — open up the stride, prime threshold effort" },
        { type: "main",     duration: 10, zone: 4, label: "Cruise interval at T-pace — longer, lower rest; lock in even splits", reps: 3, rest: 2 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog + mobility — hips, calves" },
      ]},
      { name: "VO2 Short Repeats", steps: [
        { type: "warmup",   duration: 12, zone: 1, label: "Easy jog + 6×20s strides — fully ready to run fast" },
        { type: "main",     duration: 3,  zone: 5, label: "VO2 interval at 5K pace / I-pace — hard but controlled; full jog recovery", reps: 8, rest: 2 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog + stretch" },
      ]},
      { name: "Hill Repeats", steps: [
        { type: "warmup",   duration: 12, zone: 1, label: "Easy jog to a 6-8% hill + drills + 4×20s strides" },
        { type: "main",     duration: 1.5, zone: 5, label: "90s hill repeat — strong drive, tall posture, RPE 9; easy jog down = recovery", reps: 8, rest: 2 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog on flat + stretch calves/hips" },
      ]},
    ],
    moderate: [
      { name: "Tempo Run", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy jog + 4×20s strides — build gradually to tempo effort" },
        { type: "main",     duration: 20, zone: 3, label: "Tempo run — comfortably hard, RPE 6–7; hold even effort; back off before form breaks" },
        { type: "main",     duration: 10, zone: 2, label: "Recovery jog — bring heart rate back to Z2" },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog/walk + full-body stretch" },
      ]},
      { name: "Progression Run", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy jog — settle in, relaxed form" },
        { type: "main",     duration: 10, zone: 2, label: "Steady Z2 — conversational pace, find rhythm" },
        { type: "main",     duration: 15, zone: 3, label: "Progress to Z3 — tempo effort, controlled breathing" },
        { type: "main",     duration: 5,  zone: 4, label: "Final squeeze — Z3/Z4 strong finish, hold form" },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog + stretch" },
      ]},
      { name: "Fartlek", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy jog + 4×20s strides" },
        { type: "main",     duration: 2,  zone: 4, label: "Fartlek: 2 min Z3/Z4 on / 2 min Z2 float — alternate, stay relaxed on the floats", reps: 8, rest: 2 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog + stretch" },
      ]},
    ],
    long: [
      { name: "Long Easy Run", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy walk/jog — keep HR low, wake the body gradually" },
        { type: "main",     duration: 80, zone: 2, label: "Long easy run — Z2 throughout, RPE 4–5; fuel every 30–45 min; finishing strong matters more than pace" },
        { type: "cooldown", duration: 10, zone: 1, label: "Walk + mobility: hips, hamstrings, calves" },
      ]},
      { name: "Long with Surges", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy walk/jog — wake up gradually" },
        { type: "main",     duration: 50, zone: 2, label: "Steady Z2 aerobic running — build the engine" },
        { type: "main",     duration: 1,  zone: 4, label: "60s surge at 10K pace — strong and controlled, then drop back to Z2", reps: 6, rest: 4 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog + mobility" },
      ]},
      { name: "Long with Tempo Finish", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy walk/jog — keep HR low, settle in" },
        { type: "main",     duration: 60, zone: 2, label: "Long Z2 aerobic — fuel every 30-45 min, conversational" },
        { type: "main",     duration: 15, zone: 3, label: "Tempo finish — Z3 RPE 6-7, practice running strong on tired legs" },
        { type: "cooldown", duration: 10, zone: 1, label: "Walk + full mobility — flush the legs" },
      ]},
    ],
  },
  bike: {
    hard: [
      { name: "Threshold 2×20", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin to Z2 + 3×30s high-cadence bursts at 110 RPM" },
        { type: "main",     duration: 20, zone: 4, label: "Threshold interval — 95% FTP, hold steady power and form", reps: 2, rest: 5 },
        { type: "cooldown", duration: 15, zone: 1, label: "Easy spin-down — shake out the legs" },
      ]},
      { name: "Over-Unders", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin + 3×1 min building to Z3 — prime the legs" },
        { type: "main",     duration: 12, zone: 4, label: "Over-unders: 1 min at 105% FTP / 2 min at 95% FTP × 4 cycles — ride just above/below threshold, smooth cadence", reps: 3, rest: 4 },
        { type: "cooldown", duration: 14, zone: 1, label: "Easy spin — flush legs" },
      ]},
      { name: "VO2 Short Intervals", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin + 4×20s high-cadence — ready for hard efforts" },
        { type: "main",     duration: 3,  zone: 5, label: "VO2 interval at 115–120% FTP — strong, controlled, high cadence (95+ RPM); last minute should feel near-max", reps: 6, rest: 3 },
        { type: "cooldown", duration: 14, zone: 1, label: "Easy spin — let heart rate settle" },
      ]},
      { name: "Sweet Spot 3×15", steps: [
        { type: "warmup",   duration: 12, zone: 1, label: "Easy spin building to Z2 + a few openers" },
        { type: "main",     duration: 15, zone: 3, label: "Sweet spot — 88–92% FTP, 85+ RPM, steady and powerful; aero position", reps: 3, rest: 3 },
        { type: "cooldown", duration: 9,  zone: 1, label: "Easy spin-down" },
      ]},
    ],
    moderate: [
      { name: "Sweetspot 2×25", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin building to Z2 — include 3×20s high-cadence bursts" },
        { type: "main",     duration: 25, zone: 3, label: "Sweetspot — 88% FTP, hold 85 RPM, controlled breathing", reps: 2, rest: 5 },
        { type: "cooldown", duration: 20, zone: 2, label: "Z2 spin-down — aerobic flush, keep legs moving" },
      ]},
      { name: "Tempo Block", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin + 2×1min openers — ease into tempo" },
        { type: "main",     duration: 45, zone: 3, label: "Continuous tempo — 80–85% FTP, 85+ RPM, aero position, even power" },
        { type: "cooldown", duration: 30, zone: 2, label: "Z2 spin-down" },
      ]},
      { name: "Endurance with Pushes", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin building to Z2" },
        { type: "main",     duration: 3,  zone: 3, label: "3 min Z3 push at 85% FTP — feel it, don't grind", reps: 6, rest: 4 },
        { type: "cooldown", duration: 30, zone: 2, label: "Z2 endurance spin-down" },
      ]},
    ],
    long: [
      { name: "Long Aerobic", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin — settle into aero, hydrate" },
        { type: "main",     duration: 150, zone: 2, label: "Long aerobic ride — Z2 effort, fuel every 45 min, hydrate every 20 min" },
        { type: "cooldown", duration: 15, zone: 1, label: "Spin-down — flush the legs" },
      ]},
      { name: "Long with Tempo Blocks", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin — settle in" },
        { type: "main",     duration: 60, zone: 2, label: "Z2 aerobic — conversational, in aero" },
        { type: "main",     duration: 20, zone: 3, label: "Tempo block — 80% FTP, aero, steady power", reps: 2, rest: 15 },
        { type: "main",     duration: 10, zone: 2, label: "Z2 to close — keep legs ticking" },
        { type: "cooldown", duration: 15, zone: 1, label: "Easy spin-down" },
      ]},
      { name: "Long with Climbs", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin — get comfortable" },
        { type: "main",     duration: 120, zone: 2, label: "Z2 aerobic ride — fuel every 45 min" },
        { type: "main",     duration: 8,  zone: 3, label: "Low-cadence climb simulation — 60–70 RPM, Z3 power, seated, strong core; on any hill or resistance", reps: 4, rest: 4 },
        { type: "cooldown", duration: 15, zone: 1, label: "Easy spin-down" },
      ]},
    ],
  },
  swim: {
    hard: [
      { name: "Race-Pace 100s", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "400m easy + 4×25m build to race pace" },
        { type: "main",     duration: 3,  zone: 4, label: "100m race pace — explosive turns, max effort; hold stroke length", reps: 10, rest: 1 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy 400m — relax and breathe out the effort" },
      ]},
      { name: "CSS 200s", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "300m easy + 6×50m build — find rhythm" },
        { type: "main",     duration: 4,  zone: 4, label: "200m at CSS pace — smooth, strong, consistent splits; RPE 8", reps: 6, rest: 1 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy 300m backstroke — relax shoulders" },
      ]},
      { name: "Threshold Ladder", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "400m easy + drills" },
        { type: "main",     duration: 15, zone: 4, label: "Ladder at threshold: 50/100/150/200/150/100/50 strong, 15s rest between — pacing discipline", reps: 2, rest: 2 },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy 200m — shake out" },
      ]},
    ],
    moderate: [
      { name: "Threshold 100s", steps: [
        { type: "warmup",   duration: 8,  zone: 1, label: "200m easy free + drills: catch-up, fingertip drag" },
        { type: "main",     duration: 4,  zone: 3, label: "100m threshold — strong pull, hold form under effort", reps: 6, rest: 1 },
        { type: "cooldown", duration: 8,  zone: 1, label: "Easy 200m — long strokes, breathe every 3" },
      ]},
      { name: "Pull + Swim Set", steps: [
        { type: "warmup",   duration: 8,  zone: 1, label: "200m easy + 4×50m drill (catch-up, 6-3-6)" },
        { type: "main",     duration: 3,  zone: 3, label: "100m pull (buoy+paddles) at threshold — engage lats, rotate fully", reps: 4, rest: 1 },
        { type: "main",     duration: 3,  zone: 3, label: "100m swim at threshold — transfer the feel from pull to full stroke", reps: 4, rest: 1 },
        { type: "cooldown", duration: 8,  zone: 1, label: "Easy 200m backstroke" },
      ]},
      { name: "Aerobic Ladder", steps: [
        { type: "warmup",   duration: 8,  zone: 1, label: "200m easy + 100m drill + 4×25m build" },
        { type: "main",     duration: 25, zone: 3, label: "Aerobic ladder: 400m / 300m / 200m / 100m / 200m / 300m at threshold w/ 30s rest — even splits" },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy 200m" },
      ]},
    ],
    long: [
      { name: "Open Water Simulation", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "400m easy + drills: fingertip drag, single-arm" },
        { type: "main",     duration: 55, zone: 2, label: "Continuous aerobic swim at open-water pace — sight every 10 strokes" },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy 200m backstroke — stretch and breathe" },
      ]},
      { name: "Long Pull Set", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "400m easy + 200m drill" },
        { type: "main",     duration: 45, zone: 2, label: "Long aerobic pull set — 5×400m with paddles+buoy, 30s rest, steady aerobic effort" },
        { type: "cooldown", duration: 15, zone: 1, label: "Easy 300m — long strokes" },
      ]},
      { name: "Descending 500s", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "400m easy + drills" },
        { type: "main",     duration: 50, zone: 2, label: "5×500m descending 1→5 (Z2 → Z3) with 30s rest — first two aerobic, middle tempo, last at threshold" },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy 300m — relax" },
      ]},
    ],
  },
  brick: {
    moderate: [
      { name: "Tempo Brick", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy spin — build to Z2" },
        { type: "main",     duration: 70, zone: 3, label: "Tempo ride — Z2–3, even power, aerodynamic position" },
        { type: "main",     duration: 3,  zone: 1, label: "T1 — smooth and fast transition", note: "T1" },
        { type: "main",     duration: 30, zone: 3, label: "Tempo brick run — hold race effort despite accumulated fatigue" },
        { type: "cooldown", duration: 7,  zone: 1, label: "Easy jog + stretch" },
      ]},
      { name: "Sweet Spot Brick", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy spin — settle in" },
        { type: "main",     duration: 25, zone: 3, label: "Sweet spot on bike — 88% FTP, aero, steady", reps: 2, rest: 5 },
        { type: "main",     duration: 3,  zone: 1, label: "T1 — practice transition", note: "T1" },
        { type: "main",     duration: 25, zone: 2, label: "Brick run — Z2 off the bike, find run legs, cadence 85+" },
        { type: "cooldown", duration: 7,  zone: 1, label: "Easy jog + stretch" },
      ]},
      { name: "Negative Split Brick", steps: [
        { type: "warmup",   duration: 10, zone: 1, label: "Easy spin to Z2" },
        { type: "main",     duration: 70, zone: 2, label: "Steady Z2 ride — aero, fuel practice, conserve" },
        { type: "main",     duration: 3,  zone: 1, label: "T1", note: "T1" },
        { type: "main",     duration: 15, zone: 2, label: "First 15 min off bike — Z2, find form" },
        { type: "main",     duration: 15, zone: 3, label: "Final 15 min — negative split to Z3, finish strong" },
        { type: "cooldown", duration: 7,  zone: 1, label: "Walk + stretch" },
      ]},
    ],
    hard: [
      { name: "Race-Pace Brick", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin building to Z2 + 3×30s high-cadence bursts" },
        { type: "main",     duration: 105, zone: 4, label: "Race-intensity ride — hold goal race power or HR throughout" },
        { type: "main",     duration: 3,  zone: 1, label: "T1 — practice race-day transition speed", note: "T1" },
        { type: "main",     duration: 42, zone: 4, label: "Race-pace run — maintain goal pace under heavy fatigue" },
      ]},
      { name: "Threshold Bike → Tempo Run", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin + openers" },
        { type: "main",     duration: 20, zone: 4, label: "Threshold bike — 95% FTP, steady power", reps: 3, rest: 5 },
        { type: "main",     duration: 3,  zone: 1, label: "T1", note: "T1" },
        { type: "main",     duration: 30, zone: 3, label: "Tempo brick run — Z3, practice running strong on taxed legs" },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog + stretch" },
      ]},
      { name: "Over-Under Brick", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin + openers" },
        { type: "main",     duration: 12, zone: 4, label: "Over-unders on bike: 1 min @105%/2 min @95% × 4 per block", reps: 3, rest: 5 },
        { type: "main",     duration: 3,  zone: 1, label: "T1 — fast transition", note: "T1" },
        { type: "main",     duration: 40, zone: 4, label: "Race-pace run — accept discomfort, control breathing, finish" },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog + full stretch" },
      ]},
    ],
    long: [
      { name: "Long Aerobic Brick", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin — settle in, hydrate, get into aero position" },
        { type: "main",     duration: 165, zone: 2, label: "Long aerobic ride — Z2 effort, fuel every 45 min, hydrate every 20 min" },
        { type: "main",     duration: 3,  zone: 1, label: "T1", note: "T1" },
        { type: "main",     duration: 57, zone: 2, label: "Aerobic run off bike — Z2 throughout, simulate race fatigue" },
      ]},
      { name: "Long Bike + Tempo Finish Run", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin — get aero" },
        { type: "main",     duration: 165, zone: 2, label: "Long Z2 ride — fuel practice, pacing discipline" },
        { type: "main",     duration: 3,  zone: 1, label: "T1", note: "T1" },
        { type: "main",     duration: 30, zone: 2, label: "First 30 min off bike — Z2, find run legs" },
        { type: "main",     duration: 20, zone: 3, label: "Final 20 min — Z3 tempo, race-rehearsal strong finish" },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog + stretch" },
      ]},
      { name: "Long Bike with Race-Pace Surges → Aerobic Run", steps: [
        { type: "warmup",   duration: 15, zone: 1, label: "Easy spin + 3×30s openers" },
        { type: "main",     duration: 140, zone: 2, label: "Z2 long ride — keep aero" },
        { type: "main",     duration: 5,  zone: 4, label: "5 min at race power — inject quality, don't over-cook it", reps: 5, rest: 10 },
        { type: "main",     duration: 3,  zone: 1, label: "T1", note: "T1" },
        { type: "main",     duration: 45, zone: 2, label: "Aerobic run off bike — hold Z2, keep form, smooth cadence" },
        { type: "cooldown", duration: 10, zone: 1, label: "Easy jog + stretch" },
      ]},
    ],
  },
};

/**
 * getSessionTemplate(discipline, load, weekNumber, dateStr?)
 * Returns the session template for a given {discipline, load}, rotating through
 * SESSION_VARIANTS when present so adjacent weeks in the same phase render
 * different workouts. Falls back to SESSION_DESCRIPTIONS when no variants are
 * defined for that load.
 *
 * Rotation seed priority:
 *   1. weekNumber (canonical — stamped by plan generators)
 *   2. dateStr → ISO-week-of-year (fallback for legacy entries missing weekNumber)
 *   3. 0 (last resort — always returns variant[0])
 *
 * The returned object is shallow-merged from the base template so callers that
 * read .duration / .name / .steps continue to work unchanged.
 */
function getSessionTemplate(discipline, load, weekNumber, dateStr) {
  const base = (SESSION_DESCRIPTIONS[discipline] || {})[load];
  if (!base) return null;
  const variants = (SESSION_VARIANTS[discipline] || {})[load];
  if (!Array.isArray(variants) || !variants.length) return base;
  const wn = Number(weekNumber);
  let seed;
  if (Number.isFinite(wn) && wn > 0) {
    seed = wn - 1;
  } else if (dateStr) {
    // ISO week of the year — stable across users and sessions; adjacent
    // calendar weeks always produce adjacent variants.
    const d = new Date(dateStr + "T00:00:00");
    if (!isNaN(d.getTime())) {
      const oneJan = new Date(d.getFullYear(), 0, 1);
      const weekOfYear = Math.floor(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
      seed = weekOfYear;
    } else {
      seed = 0;
    }
  } else {
    seed = 0;
  }
  const idx = ((seed % variants.length) + variants.length) % variants.length;
  const variant = variants[idx] || {};
  return {
    ...base,
    ...(variant.name ? { name: variant.name } : {}),
    ...(variant.duration != null ? { duration: variant.duration } : {}),
    ...(Array.isArray(variant.steps) ? { steps: variant.steps } : {}),
  };
}

if (typeof window !== "undefined") {
  window.getSessionTemplate = getSessionTemplate;
}

// ─── Race-week patterns (Philosophy §6.1 triathlon, §4.5 running, §4.6 hyrox) ─
// Race week never leaves a day as pure rest — every day gets something
// VERY light. Keyed by days-to-race (0=race, 1..6=days before). Discipline
// values must exist in SESSION_DESCRIPTIONS; loads must exist for that
// discipline. The generator intercepts the final 6 days before the race
// and uses these instead of the generic Taper pattern.
const RACE_WEEK_PATTERNS = {
  triathlon: {
    6: { discipline: "mobility", load: "race_week_activation" },
    5: { discipline: "swim",     load: "race_week_openers" },
    4: { discipline: "bike",     load: "race_week_openers" },
    3: { discipline: "run",      load: "race_week_openers" },
    2: { discipline: "swim",     load: "race_week_shakeout" },
    1: { discipline: "brick",    load: "race_week_opener" },
  },
  running: {
    6: { discipline: "mobility", load: "race_week_activation" },
    5: { discipline: "run",      load: "race_week_easy" },
    4: { discipline: "run",      load: "race_week_openers" },
    3: { discipline: "mobility", load: "race_week_activation" },
    2: { discipline: "run",      load: "race_week_shakeout" },
    1: { discipline: "run",      load: "race_week_shakeout" },
  },
  hyrox: {
    6: { discipline: "run",      load: "race_week_easy" },
    5: { discipline: "hyrox",    load: "short_opener_combo" },
    4: { discipline: "run",      load: "race_week_openers" },
    3: { discipline: "mobility", load: "race_week_activation" },
    2: { discipline: "run",      load: "race_week_shakeout" },
    1: { discipline: "hyrox",    load: "short_opener_combo" },
  },
  cycling: {
    6: { discipline: "mobility", load: "race_week_activation" },
    5: { discipline: "bike",     load: "race_week_openers" },
    4: { discipline: "bike",     load: "race_week_openers" },
    3: { discipline: "mobility", load: "race_week_activation" },
    2: { discipline: "bike",     load: "race_week_openers" },
    1: { discipline: "bike",     load: "race_week_shakeout" },
  },
};

function _raceWeekSportFamily(raceType) {
  const tri = new Set(["ironman", "halfIronman", "olympic", "sprint"]);
  if (tri.has(raceType)) return "triathlon";
  if (raceType === "hyrox" || raceType === "hyroxDoubles") return "hyrox";
  if (["centuryRide", "granFondo"].includes(raceType)) return "cycling";
  // marathon, halfMarathon, tenK, fiveK, etc.
  return "running";
}

// Nutrition targets per training load level
const NUTRITION_TARGETS = {
  rest:     { calories: 2000, protein: 130, carbs: 220, fat: 70 },
  easy:     { calories: 2400, protein: 150, carbs: 280, fat: 80 },
  moderate: { calories: 2800, protein: 170, carbs: 340, fat: 90 },
  hard:     { calories: 3200, protein: 185, carbs: 400, fat: 95 },
  long:     { calories: 3600, protein: 190, carbs: 460, fat: 100 },
  race:     { calories: 4000, protein: 200, carbs: 520, fat: 110 },
};

// ─── Training conflict detection ─────────────────────────────────────────────

/**
 * Maps race types and schedule workout types to a broad training category.
 * Same category = conflict (athlete can't train for two things in the same sport).
 */
const TRAINING_CATEGORY = {
  // Race types
  ironman:     "triathlon",
  halfIronman: "triathlon",
  olympic:     "triathlon",
  sprint:      "triathlon",
  marathon:    "running",
  halfMarathon:"running",
  tenK:        "running",
  fiveK:       "running",
  centuryRide: "cycling",
  granFondo:   "cycling",
  hyrox:       "hyrox",
  hyroxDoubles:"hyrox",
  // Schedule workout types (from generatePlan)
  triathlon:   "triathlon",
  running:     "running",
  cycling:     "cycling",
};

const CATEGORY_LABELS = {
  triathlon: "Triathlon",
  running:   "Running",
  cycling:   "Cycling",
  hyrox:     "Hyrox",
};

/**
 * Returns { conflicts: [{raceConflict, scheduleConflict}] }
 * A conflict exists when there is an active race event AND an active workout
 * schedule for the same training category.
 */
function detectTrainingConflicts() {
  const events   = loadEvents();
  const schedule = (() => {
    try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; }
    catch { return []; }
  })();

  const today = new Date().toISOString().slice(0, 10);

  // Active races: future A races. B races are intentionally secondary
  // goals that the A-race plan is expected to factor into its taper /
  // recovery logic for that week, so they're NOT a conflict. Without
  // this filter, dropping a B half-marathon into an Ironman plan
  // always lights up the banner — exactly what the user called out.
  const activeRaces = events.filter(e =>
    e.date > today &&
    (e.priority || "A").toUpperCase() === "A"
  );

  // UNIFIED PLAN: schedule entries tagged with an active race's id are
  // part of that race's plan, not a separate standalone block. Previously
  // this triggered "Training Conflict Detected" immediately after the
  // user built their plan because the onboarding-v2 scaffold lived in
  // workoutSchedule alongside the race. _regeneratePlanForRace now clears
  // those, but this filter is the defensive belt-and-suspenders.
  const activeRaceIds = new Set(activeRaces.map(r => String(r.id)));
  // Active schedules: has at least one entry in the future, grouped by type,
  // excluding entries that belong to an active race's unified plan.
  const activeScheduleTypes = new Set(
    schedule
      .filter(s => s.date > today)
      .filter(s => !(s.raceId && activeRaceIds.has(String(s.raceId))))
      .map(s => s.type).filter(Boolean)
  );

  const conflicts = [];
  const seen = new Set();

  for (const race of activeRaces) {
    const raceCat = TRAINING_CATEGORY[race.type];
    if (!raceCat) continue;

    for (const schedType of activeScheduleTypes) {
      const schedCat = TRAINING_CATEGORY[schedType];
      if (schedCat === raceCat && !seen.has(raceCat)) {
        seen.add(raceCat);
        conflicts.push({ raceCat, race, schedType });
      }
    }
  }

  return conflicts;
}

/**
 * Renders the conflict banner on the Training tab.
 * Should be called whenever race events or workout schedules change.
 */
function renderTrainingConflicts() {
  const banner = document.getElementById("training-conflict-banner");
  if (!banner) return;

  const conflicts = detectTrainingConflicts();
  if (conflicts.length === 0) {
    banner.style.display = "none";
    banner.innerHTML = "";
    return;
  }

  banner.style.display = "block";
  banner.innerHTML = conflicts.map(({ raceCat, race, schedType }) => {
    const catLabel = CATEGORY_LABELS[raceCat] || raceCat;
    return `
      <div class="conflict-banner">
        <div class="conflict-banner-header">
          <span class="conflict-banner-icon">${ICONS.warning}</span>
          <span class="conflict-banner-title">Training Conflict Detected — ${catLabel}</span>
        </div>
        <div class="conflict-banner-body">
          You have an active <strong>${race.name}</strong> race plan alongside a standalone
          <strong>${catLabel}</strong> workout schedule. Overlapping training blocks in the same
          sport can lead to overtraining and injury. We recommend keeping only one active
          ${catLabel.toLowerCase()} training plan at a time.
        </div>
        <div class="conflict-banner-actions">
          <button class="conflict-resolve-btn" onclick="removeConflictingSchedule('${schedType}', '${raceCat}')">
            Remove ${catLabel} Workout Schedule
          </button>
          <button class="conflict-resolve-btn" onclick="removeConflictingRace('${race.id}', '${raceCat}')">
            Remove ${race.name} Race Plan
          </button>
        </div>
      </div>`;
  }).join("");
}

/** Removes all workoutSchedule entries whose type falls in the conflicting
 *  training category. Previously this filtered on a single schedType, which
 *  only matched one of the 4 types a multi-sport Build Plan block uses
 *  (triathlon + running + swimming + cycling) — leaving the block visible
 *  with partial sessions stripped out. Now it removes every future entry
 *  whose TRAINING_CATEGORY matches the conflict's raceCat, so the Active
 *  Training Inputs card goes away too. Past-completed sessions are kept. */
function removeConflictingSchedule(schedType, raceCat) {
  const catLabel = CATEGORY_LABELS[raceCat] || raceCat;
  if (!confirm(`Remove the ${catLabel} workout schedule? This will delete every future scheduled session in this training category from your calendar. Past completed sessions are kept.`)) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const meta = typeof loadCompletionMeta === "function" ? loadCompletionMeta() : {};
  const existing = (() => {
    try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; }
    catch { return []; }
  })();

  const filtered = existing.filter(s => {
    const cat = TRAINING_CATEGORY[s.type];
    if (cat !== raceCat) return true;      // different category — keep
    if (s.date < todayStr) return true;     // past — keep
    if (s.date === todayStr) {              // today — keep if completed
      const sessionId = `session-sw-${s.id}`;
      return !!meta[sessionId];
    }
    return false;                            // future, conflicting — remove
  });
  localStorage.setItem("workoutSchedule", JSON.stringify(filtered));
  if (typeof DB !== 'undefined') DB.syncSchedule();

  renderTrainingConflicts();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
  if (typeof renderTrainingBlocksSection === "function") renderTrainingBlocksSection();
  if (typeof renderCalendar === "function") renderCalendar();
}

/** Removes a race event and its training plan (resolves race side of conflict)
 *  by delegating to deleteEvent() so the full cascade runs: plan filtering,
 *  A-race promotion for surviving races, and every relevant re-render. */
function removeConflictingRace(raceId, raceCat) {
  const race = loadEvents().find(e => e.id === raceId);
  if (!race) return;
  if (!confirm(`Remove the race "${race.name}" and its generated training plan?`)) return;
  deleteEvent(raceId);
}

// ─── Training Inputs section ──────────────────────────────────────────────────

function loadTrainingNotes() {
  try { return JSON.parse(localStorage.getItem("trainingNotes")) || []; }
  catch { return []; }
}
function saveTrainingNotes(notes) {
  localStorage.setItem("trainingNotes", JSON.stringify(notes)); if (typeof DB !== 'undefined') DB.syncKey('trainingNotes');
}

const RACE_TYPE_ICON = {
  ironman:      ICONS.swim,
  halfIronman:  ICONS.swim,
  olympic:      ICONS.swim,
  sprint:       ICONS.swim,
  marathon:     ICONS.run,
  halfMarathon: ICONS.run,
  tenK:         ICONS.run,
  fiveK:        ICONS.run,
  centuryRide:  ICONS.bike,
  granFondo:    ICONS.bike,
  hyrox:        ICONS.trophy,
  hyroxDoubles: ICONS.trophy,
};

const SCHEDULE_TYPE_ICON  = { running: ICONS.run, weightlifting: ICONS.weights, cycling: ICONS.bike, swimming: ICONS.swim, triathlon: ICONS.swim, general: ICONS.activity, hiit: ICONS.flame, bodyweight: ICONS.bodyweight, yoga: ICONS.yoga, mobility: ICONS.activity, walking: ICONS.walking, rowing: ICONS.rowing, sport: ICONS.activity, hyrox: ICONS.trophy, brick: ICONS.brick, circuit: ICONS.circuit, sauna: ICONS.thermometer };
const SCHEDULE_TYPE_LABEL = { running: "Running", weightlifting: "Strength", cycling: "Cycling", swimming: "Swimming", triathlon: "Triathlon", general: "General Fitness", hiit: "HIIT", bodyweight: "Bodyweight", yoga: "Yoga / Mobility", mobility: "Mobility", walking: "Walking", rowing: "Rowing", sport: "Sport-Specific" };

function _getScheduleInputs() {
  const schedule = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
  const todayStr = new Date().toISOString().slice(0, 10);
  const future   = schedule.filter(e => (e.source === "generated" || e.source === "custom" || e.source === "onboarding") && e.date >= todayStr && !e.planId);
  const byType   = {};
  future.forEach(e => {
    if (!e.type) return;
    if (!byType[e.type]) byType[e.type] = new Set();
    byType[e.type].add(new Date(e.date + "T00:00:00").getDay());
  });
  const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Object.entries(byType).map(([type, dowSet]) => {
    const dows = [...dowSet].sort((a, b) => a - b);
    return {
      type,
      icon:  SCHEDULE_TYPE_ICON[type]  || ICONS.activity,
      label: SCHEDULE_TYPE_LABEL[type] || type,
      freq:  dows.length,
      days:  dows.map(d => DOW_SHORT[d]).join(" · "),
    };
  });
}

// Build Plan v2 AND the legacy custom-plan builder both materialize
// sessions with a shared planId that ties every session in a block
// together. Group them into one training-input card per planId so the
// user has one Edit / Delete entry point for the whole block instead
// of one row per session type.
function _getBuildPlanInputs() {
  const schedule = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
  const todayStr = new Date().toISOString().slice(0, 10);
  const future = schedule.filter(e =>
    e && e.planId && e.date >= todayStr &&
    (e.source === "onboarding_v2" || e.source === "custom")
  );
  const byPlan = {};
  future.forEach(e => {
    if (!byPlan[e.planId]) {
      byPlan[e.planId] = { planId: e.planId, sessions: [], startDate: e.date, endDate: e.date, types: new Set(), source: e.source, planName: null, raceId: e.raceId || null };
    }
    const b = byPlan[e.planId];
    b.sessions.push(e);
    if (e.date < b.startDate) b.startDate = e.date;
    if (e.date > b.endDate)   b.endDate = e.date;
    if (e.type) b.types.add(e.type);
    if (!b.planName && e.planName) b.planName = e.planName;
    if (!b.raceId && e.raceId)    b.raceId = e.raceId;
  });
  return Object.values(byPlan).map(b => {
    const wk = Math.max(1, Math.round((new Date(b.endDate + "T00:00:00") - new Date(b.startDate + "T00:00:00")) / (7 * 864e5)) + 1);
    return {
      planId:   b.planId,
      sessions: b.sessions.length,
      weeks:    wk,
      startDate:b.startDate,
      endDate:  b.endDate,
      types:    Array.from(b.types),
      source:   b.source,
      planName: b.planName,
      raceId:   b.raceId,
    };
  });
}

function _escapeHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/**
 * checkARacePromotion()
 * If the A race has passed and there are remaining B races:
 * - If exactly one B race remains, auto-promote it to A
 * - If multiple B races remain, prompt the user to pick
 */
function checkARacePromotion() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const events = loadEvents();
  const upcoming = events.filter(e => e.date >= todayStr);
  if (upcoming.length === 0) return; // no races at all

  const plan = loadTrainingPlan();
  const hasPlanFor = id => plan.some(p => p && p.raceId === id);
  const priority = e => (e.priority || "A").toUpperCase();
  const aRaces = upcoming.filter(e => priority(e) === "A");

  if (aRaces.length > 0) {
    // A race(s) still exist. The calendar can go empty when the deleted
    // race was the one that actually drove plan generation, even though a
    // sibling A race survives (legacy data could have two A races, or the
    // original plan was attributed only to the now-deleted race's id).
    // Regenerate for any A race with no surviving plan entries.
    let regenerated = false;
    for (const a of aRaces) {
      if (!hasPlanFor(a.id)) {
        _regeneratePlanForRace(a);
        regenerated = true;
      }
    }
    if (regenerated && typeof renderCalendar === "function") renderCalendar();
    return;
  }

  // No A race left. Promote the best remaining candidate.
  const bRaces = upcoming.filter(e => priority(e) === "B");
  // Prefer B-races; fall back to anything upcoming (C or missing priority)
  // so deletion never leaves the user with races on the calendar but no
  // plan driving any of them.
  const candidates = bRaces.length > 0 ? bRaces : upcoming.slice();
  if (candidates.length === 0) return;

  if (candidates.length === 1) {
    const race = events.find(e => e.id === candidates[0].id);
    if (race) {
      race.priority = "A";
      saveEvents(events);
      _regeneratePlanForRace(race);
      if (typeof renderCalendar === "function") renderCalendar();
    }
  } else {
    _showARacePromotionModal(candidates, events);
  }
}

// Regenerates the training plan for a race and persists it. Used after
// B→A promotion (either auto or user-chosen) so the newly-primary race
// gets a full build-out instead of only its original B-race taper window.
//
// If the user has an active onboarding-v2 workout schedule that already
// covers the race arc, we skip the trainingPlan write entirely — the
// onboarding schedule is the source of truth and double-writing creates
// duplicate sessions on the calendar.
function _regeneratePlanForRace(race) {
  if (!race || typeof generateTrainingPlan !== "function") return;

  // UNIFIED PLAN MODEL: when a race exists, the race plan IS the athlete's
  // schedule. Any onboarding-v2 workoutSchedule entries tagged with this
  // raceId (or sharing the race's planId) are stale scaffolding from before
  // the race plan existed and must be cleared so we don't double-book days
  // and so the "Training Conflict Detected" warning goes away. Past entries
  // (completed workouts) are preserved.
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
    const keptSchedule = schedule.filter(e => {
      if (!e) return false;
      // Keep past sessions regardless — they're history, not future bookings.
      if (e.date < todayStr) return true;
      // Drop future entries that were the onboarding-v2 scaffold for THIS race.
      if (e.raceId && String(e.raceId) === String(race.id)) return false;
      return true;
    });
    if (keptSchedule.length !== schedule.length) {
      localStorage.setItem("workoutSchedule", JSON.stringify(keptSchedule));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("workoutSchedule");
    }
  } catch (e) {
    console.warn("[IronZ] failed to clear onboarding schedule for race plan", e);
  }

  const newEntries = generateTrainingPlan(race) || [];
  if (!newEntries.length) {
    // generateTrainingPlan returned nothing — usually because the race
    // object is missing a required field (type, date). Warn so the empty
    // calendar isn't silent, but still persist the filter so stale entries
    // for this race don't linger.
    console.warn("[IronZ] _regeneratePlanForRace produced no entries for race", race && race.id, race && race.type);
  }

  // Determine the athlete's level once so both the distribution
  // aligner (Step 4) and the constraint validator (Step 5) see the
  // same classification.
  //
  // Priority order (best signal first):
  //   1. Threshold-derived classification (5K time / FTP / CSS via
  //      TrainingZones). Most accurate — an athlete with a 19:40 5K is
  //      Advanced regardless of what "Beginner" button they tapped.
  //   2. race.level (onboarding override for this specific race)
  //   3. profile.fitnessLevel (legacy self-report)
  //   4. Default: "intermediate"
  let _level = "intermediate";
  let _levelSource = "default";
  try {
    const profile = JSON.parse(localStorage.getItem("profile") || "{}");
    const raw = profile.fitnessLevel || profile.fitness_level || profile.experience_level || profile.level;
    if (raw) { _level = String(raw).toLowerCase(); _levelSource = "profile.fitnessLevel"; }
    if (typeof window !== "undefined" && window.TrainingZones) {
      // Read from both localStorage.thresholds AND localStorage.trainingZones
      // so pre-existing users (who entered their 5K via the Training Zones
      // UI, which writes to trainingZones.running.referenceTime + vdot) get
      // classified correctly instead of falling back to "intermediate".
      const thresholds = typeof window.TrainingZones.loadFromStorage === "function"
        ? window.TrainingZones.loadFromStorage()
        : JSON.parse(localStorage.getItem("thresholds") || "{}") || {};
      const weightKg = profile.weight ? Number(profile.weight) * 0.453592 : null;
      const perSport = {
        run:  window.TrainingZones.classifyRunning(thresholds),
        bike: window.TrainingZones.classifyCycling(thresholds, weightKg),
        swim: window.TrainingZones.classifySwim(thresholds),
      };
      const derived = window.TrainingZones.overallLevel(perSport);
      if (derived) { _level = derived; _levelSource = "thresholds(" + Object.entries(perSport).filter(([,v])=>v).map(([k,v])=>`${k}=${v}`).join(",") + ")"; }
    }
  } catch {}
  if (race && race.level) { _level = String(race.level).toLowerCase(); _levelSource = "race.level"; }
  console.log("[IronZ] athlete level resolved to", _level, "via", _levelSource);

  // Rule Engine Step 4 — align session counts per week to the
  // phase's TRAINING_PHILOSOPHY.md §6.1/§6.2/§6.3 distribution.
  // Adds missing sessions on rest days; demotes Taper excess. Also
  // applies progressive overload to long sessions (+10%/week,
  // deload every 4th week).
  if (newEntries.length && typeof window !== "undefined" && window.PlanSessionDistribution) {
    try {
      // Snapshot each week's session counts BEFORE alignment so the log
      // below can show what the aligner added and why.
      const _preByWeek = {};
      newEntries.forEach(e => {
        if (e.phase === "Race" || e.phase === "Race Week") return;
        const wk = e.weekNumber;
        if (!_preByWeek[wk]) _preByWeek[wk] = { phase: e.phase, counts: { swim: 0, bike: 0, run: 0, strength: 0, brick: 0 } };
        const d = e.discipline === "weightlifting" ? "strength" : e.discipline;
        if (_preByWeek[wk].counts[d] != null) _preByWeek[wk].counts[d]++;
      });

      const summary = window.PlanSessionDistribution.applySessionDistribution(newEntries, race && race.type, _level);

      // Snapshot AFTER so the diff per week is visible in devtools.
      const _postByWeek = {};
      newEntries.forEach(e => {
        if (e.phase === "Race" || e.phase === "Race Week") return;
        const wk = e.weekNumber;
        if (!_postByWeek[wk]) _postByWeek[wk] = { phase: e.phase, counts: { swim: 0, bike: 0, run: 0, strength: 0, brick: 0 } };
        const d = e.discipline === "weightlifting" ? "strength" : e.discipline;
        if (_postByWeek[wk].counts[d] != null) _postByWeek[wk].counts[d]++;
      });

      if (summary.added || summary.demoted) {
        console.log("[IronZ] distribution aligner — added", summary.added, "sessions, demoted", summary.demoted, "across", summary.weeksChecked, "weeks, doubled", summary.doubledWeeks || 0, "weeks");
      }
      // Detailed per-week trace for the first 3 weeks so the user can see
      // what target the aligner used and what it did. Full trace available
      // via window._ironzLastDistributionTrace.
      const sportProfile = window.PlanSessionDistribution.sportProfileForRaceType(race && race.type);
      const dist = window.PlanSessionDistribution.PHASE_DISTRIBUTIONS[sportProfile] || {};
      const trace = [];
      Object.keys(_preByWeek).sort((a, b) => Number(a) - Number(b)).forEach(wk => {
        const pre = _preByWeek[wk];
        const post = _postByWeek[wk] || pre;
        const target = dist[pre.phase] || null;
        trace.push({ week: Number(wk), phase: pre.phase, target, before: pre.counts, after: post.counts });
      });
      if (typeof window !== "undefined") window._ironzLastDistributionTrace = { level: _level, levelSource: _levelSource, trace };
      trace.slice(0, 3).forEach(t => {
        const b = t.before, a = t.after, g = t.target || {};
        console.log(
          `[IronZ] week ${t.week} (${t.phase}) target swim:${g.swim||0} bike:${g.bike||0} run:${g.run||0} strength:${g.strength||0} | before swim:${b.swim} bike:${b.bike} run:${b.run} strength:${b.strength} | after swim:${a.swim} bike:${a.bike} run:${a.run} strength:${a.strength}`
        );
      });
    } catch (e) {
      console.warn("[IronZ] distribution aligner failed:", e && e.message);
    }
  }

  // Rule Engine Step 5 — apply global intensity constraints (§4.3):
  // no consecutive hard days for non-advanced, cap intensity sessions
  // per week, ensure ≥1 rest day/week. Runs AFTER the distribution
  // aligner so any added sessions are included in constraint checks.
  if (newEntries.length && typeof window !== "undefined" && window.PlanConstraintValidator) {
    try {
      const result = window.PlanConstraintValidator.validateAndFixPlan(newEntries, _level);
      if (result.flags && result.flags.length) {
        console.log("[IronZ] constraint validator adjusted", result.flags.length, "sessions across", result.weeksChecked, "weeks");
      }
    } catch (e) {
      console.warn("[IronZ] constraint validator failed:", e && e.message);
    }
  }

  const existingPlan = loadTrainingPlan().filter(e => e.raceId !== race.id);
  saveTrainingPlanData([...existingPlan, ...newEntries]);
}

if (typeof window !== "undefined") {
  window._regeneratePlanForRace = _regeneratePlanForRace;
  window.generateTrainingPlan = generateTrainingPlan;
}

function _showARacePromotionModal(bRaces, allEvents) {
  let overlay = document.getElementById("a-race-promotion-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "a-race-promotion-overlay";
  overlay.className = "quick-entry-overlay is-open";
  overlay.style.cssText = "display:flex;z-index:10001";

  const buttons = bRaces.map(r => {
    const cfg = RACE_CONFIGS[r.type];
    const label = r.name || (cfg ? cfg.label : r.type);
    const dateStr = typeof formatDisplayDate === "function" ? formatDisplayDate(r.date) : r.date;
    return `<button class="swap-alt-btn" onclick="_promoteToARace('${r.id}')">
      <span class="swap-alt-name">${_escapeHtml(label)}</span>
      <span class="swap-alt-muscles">${dateStr}</span>
    </button>`;
  }).join("");

  overlay.innerHTML = `
    <div class="quick-entry-modal" style="max-width:400px;padding:24px">
      <h3 style="margin:0 0 8px">Your A Race has passed</h3>
      <p style="margin:0 0 16px;color:var(--color-text-muted);font-size:0.85rem">Which race should be your new primary goal?</p>
      ${buttons}
    </div>
  `;

  document.body.appendChild(overlay);
}

function _promoteToARace(raceId) {
  const events = loadEvents();
  const race = events.find(e => e.id === raceId);
  if (race) {
    race.priority = "A";
    saveEvents(events);
    _regeneratePlanForRace(race);
  }
  document.getElementById("a-race-promotion-overlay")?.remove();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
  if (typeof renderRaceEvents === "function") renderRaceEvents();
  if (typeof renderTrainingBlocksSection === "function") renderTrainingBlocksSection();
  if (typeof renderCalendar === "function") renderCalendar();
}

// Open the triathlon gear checklist modal for a given race id. Resolves the
// race object from the events store and hands it to GearChecklistModal.
function _openGearChecklist(raceId) {
  try {
    const races = JSON.parse(localStorage.getItem("events") || "[]");
    const race = races.find(r => r.id === raceId);
    if (!race) return;
    if (typeof GearChecklistModal === "undefined" || !GearChecklistModal.open) {
      console.warn("[planner] GearChecklistModal not loaded");
      return;
    }
    GearChecklistModal.open(race);
  } catch (e) {
    console.warn("[planner] _openGearChecklist failed", e);
  }
}

function renderTrainingInputs() {
  const container = document.getElementById("training-inputs-list");
  if (!container) return;

  // Check if A race needs promotion
  checkARacePromotion();

  const todayStr  = new Date().toISOString().slice(0, 10);
  const races     = loadEvents().filter(e => e.date > todayStr);
  const schedules = _getScheduleInputs();
  let buildPlans  = _getBuildPlanInputs();
  const notes     = loadTrainingNotes();
  const imported  = (() => { try { return JSON.parse(localStorage.getItem("importedPlans")) || []; } catch { return []; } })()
    .filter(p => p.sessions && p.sessions.some(s => s.date >= todayStr));

  // Suppress a Build Plan card when it's clearly the plan that backs a
  // rendered race. Without this the user sees both the Race card and a
  // "Training Block" card for what is conceptually one thing.
  //
  // Matching has two tiers:
  //   1) Explicit raceId stamped on plan sessions at generation time
  //      (onboarding v2 does this for every plan it creates for a race).
  //      This is the authoritative signal.
  //   2) Heuristic fallback for plans that predate the raceId stamp:
  //      timing (plan ends within 180 days before / 3 days after the race)
  //      and discipline overlap (plan types include a sport the race uses).
  //      180 days covers long-course base blocks that finish well before
  //      race day (e.g. Ironman 12-week base 10 weeks before race).
  //
  // Each race claims at most one plan so we never hide legitimately
  // separate plans. Custom plans are never suppressed because they're
  // freeform and may not belong to a race even when timing lines up.
  if (races.length && buildPlans.length) {
    const DISC_FOR_RACE = {
      ironman: ["running","cycling","swimming"], halfIronman: ["running","cycling","swimming"],
      olympic: ["running","cycling","swimming"], sprint: ["running","cycling","swimming"],
      marathon: ["running"], halfMarathon: ["running"], tenK: ["running"], fiveK: ["running"],
      centuryRide: ["cycling"], granFondo: ["cycling"],
      hyrox: ["running","weightlifting"], hyroxDoubles: ["running","weightlifting"],
    };
    const hidden = new Set();
    const dayMs = 864e5;
    races.forEach(race => {
      // Tier 1: explicit raceId match. Highest confidence, no timing/type math.
      const byId = buildPlans.find(bp => !hidden.has(bp.planId) && bp.raceId === race.id);
      if (byId) { hidden.add(byId.planId); return; }

      // Tier 2: heuristic for untagged legacy plans.
      const discs = DISC_FOR_RACE[race.type] || [];
      if (!discs.length) return;
      const raceMs = new Date(race.date + "T00:00:00").getTime();
      let best = null, bestGap = Infinity;
      buildPlans.forEach(bp => {
        if (hidden.has(bp.planId)) return;
        if (bp.source !== "onboarding_v2") return;
        if (bp.raceId) return; // tagged plans are handled in tier 1 only
        const endMs = new Date(bp.endDate + "T00:00:00").getTime();
        const gap = Math.round((raceMs - endMs) / dayMs);
        if (gap < -3 || gap > 180) return;            // plan must end ~at or before race day
        if (!bp.types.some(t => discs.includes(t))) return;
        if (gap < bestGap) { best = bp; bestGap = gap; }
      });
      if (best) hidden.add(best.planId);
    });
    if (hidden.size) buildPlans = buildPlans.filter(bp => !hidden.has(bp.planId));
  }

  if (races.length === 0 && schedules.length === 0 && buildPlans.length === 0 && notes.length === 0 && imported.length === 0) {
    container.innerHTML = `<p class="empty-msg" style="margin-bottom:12px">No active training inputs yet. Add a race or generate a plan to see them here.</p>`;
    return;
  }

  let html = '<div class="ti-cards">';

  // ── Race cards ──
  const _goalLabels = { finish: "Finish", time: "Time goal", compete: "Compete" };
  races.forEach(race => {
    const cfg      = RACE_CONFIGS[race.type];
    const priority = (race.priority || "A").toUpperCase();
    const rd       = new Date(race.date + "T00:00:00");
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((rd - today) / (1000 * 60 * 60 * 24));
    const weeks    = Math.floor(daysLeft / 7);
    const label    = daysLeft <= 0 ? "Race day!" : weeks > 0 ? `${weeks} week${weeks !== 1 ? "s" : ""} away` : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} away`;

    // Level tag (Beginner/Intermediate/Advanced) was dropped from the race
    // card — it surfaced internal classification as a label on the
    // athlete's race, which read as judgmental rather than informative.
    const tags = [
      race.daysPerWeek ? `${race.daysPerWeek}× / week` : null,
      race.runGoal ? _goalLabels[race.runGoal] : null,
    ].filter(Boolean).map(t => `<span class="race-tag">${t}</span>`).join("");

    // Triathlon gear checklist button — only shown for triathlon race types
    let gearBtnHtml = "";
    try {
      if (typeof GearChecklist !== "undefined" && GearChecklist.isTriathlon(race)) {
        const prog = GearChecklist.progressFor(race.id);
        const progLabel = prog.total > 0 ? `${prog.checked}/${prog.total} items` : "Open checklist";
        gearBtnHtml = `
          <button class="gear-checklist-btn" onclick="_openGearChecklist('${race.id}')" title="Race day gear checklist">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>
            <span>Gear Checklist</span>
            <span class="gear-checklist-btn-count">${progLabel}</span>
          </button>`;
      }
    } catch (e) { /* module not loaded — skip the button */ }

    html += `
      <div class="race-card">
        <div class="race-card-top">
          <span class="race-priority-badge priority-${priority.toLowerCase()}">${priority} Race</span>
          <div class="ti-card-actions">
            <button class="ti-edit-btn" onclick="tiEditRace('${race.id}')" title="Edit race">Edit</button>
            <button class="delete-btn" onclick="removeTrainingInput('race','${race.id}')" title="Remove race"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>
        </div>
        <div class="race-card-name">${_escapeHtml(race.name || (cfg ? cfg.label : race.type))}</div>
        <div class="race-card-meta">${cfg ? cfg.label : race.type}</div>
        ${race.location ? `<div class="race-card-detail">${_escapeHtml(race.location)}</div>` : ""}
        ${race.elevation ? `<div class="race-card-detail">Elevation: +${race.elevation} ft</div>` : ""}
        ${race.avgTemp ? `<div class="race-card-detail">Avg Temp: ${race.avgTemp}°F</div>` : ""}
        ${race.courseNotes ? `<div class="race-card-detail" style="font-style:italic">${_escapeHtml(race.courseNotes)}</div>` : ""}
        ${tags ? `<div class="race-tags">${tags}</div>` : ""}
        ${gearBtnHtml}
        <div class="race-card-footer">
          <span class="race-date-badge">${formatDisplayDate(race.date)}</span>
          <span class="race-countdown">${label}</span>
        </div>
      </div>`;
  });

  // ── Schedule cards ──
  schedules.forEach(s => {
    html += `
      <div class="ti-card ti-card--schedule">
        <div class="race-card-top">
          <span class="ti-card-badge ti-card-badge--schedule">Schedule</span>
          <div class="ti-card-actions">
            <button class="ti-edit-btn" onclick="tiEditSchedule('${s.type}')" title="Edit in Gym &amp; Strength">Edit</button>
            <button class="delete-btn" onclick="removeTrainingInput('schedule','${s.type}')" title="Remove schedule"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>
        </div>
        <div class="race-card-name">${s.icon} ${_escapeHtml(s.label)}</div>
        <div class="race-card-meta">${s.freq}× per week${s.days ? " · " + s.days : ""}</div>
      </div>`;
  });

  // ── Build Plan v2 cards ── one per planId, grouping every session
  // the Build Plan v2 flow materialized. Edit re-opens the Build Plan
  // modal (so the user can rebuild), Delete removes all future
  // sessions with that planId.
  buildPlans.forEach(bp => {
    const rangeStart = formatDisplayDate(bp.startDate);
    const rangeEnd   = formatDisplayDate(bp.endDate);
    const typeChips  = bp.types.map(t => {
      const label = SCHEDULE_TYPE_LABEL[t] || capitalize(t);
      return `<span class="race-tag">${_escapeHtml(label)}</span>`;
    }).join("");
    // Edit routing is source-specific: onboarding_v2 plans live in the
    // Build Plan overlay (weekly template in localStorage.buildPlanTemplate);
    // custom plans live in the Custom Plan Builder (in-memory template,
    // reconstructed from workoutSchedule on open). Using the wrong handler
    // was loading a stale template and showing unrelated days.
    const editHandler = bp.source === "custom"
      ? `openCustomPlanEdit('${bp.planId}')`
      : `window.OnboardingV2 && window.OnboardingV2.openBuildPlanEdit('${bp.planId}')`;
    const badgeLabel = bp.source === "custom" ? "Custom Plan" : "Build Plan";
    const cardTitle = bp.planName ? _escapeHtml(bp.planName) : "Training Block";
    html += `
      <div class="ti-card ti-card--schedule">
        <div class="race-card-top">
          <span class="ti-card-badge ti-card-badge--schedule">${badgeLabel}</span>
          <div class="ti-card-actions">
            <button class="ti-edit-btn" onclick="${editHandler}" title="Edit schedule">Edit</button>
            <button class="delete-btn" onclick="removeTrainingInput('buildplan','${bp.planId}')" title="Remove plan"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>
        </div>
        <div class="race-card-name">${cardTitle}</div>
        <div class="race-card-meta">${bp.sessions} session${bp.sessions !== 1 ? "s" : ""} · ${bp.weeks} week${bp.weeks !== 1 ? "s" : ""}</div>
        ${typeChips ? `<div class="race-tags">${typeChips}</div>` : ""}
        <div class="race-card-footer">
          <span class="race-date-badge">${rangeStart}</span>
          <span class="race-countdown">through ${rangeEnd}</span>
        </div>
      </div>`;
  });

  // ── Imported plan cards ──
  const DOW_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  imported.forEach(plan => {
    // Group sessions by week
    const planStart = new Date(plan.startDate + "T00:00:00");
    const grouped = {};
    plan.sessions.forEach(s => {
      const wk = Math.floor((new Date(s.date + "T00:00:00") - planStart) / (7 * 864e5)) + 1;
      if (!grouped[wk]) grouped[wk] = [];
      grouped[wk].push(s);
    });
    const weekSummary = Object.entries(grouped).map(([wk, sessions]) => {
      const rows = sessions.map(s => {
        const d = new Date(s.date + "T00:00:00");
        const dayName = DOW_NAMES[d.getDay()];
        const detail = s.exerciseCount ? `${s.exerciseCount} exercises`
                     : s.intervalCount ? `${s.intervalCount} intervals`
                     : s.details || "";
        return `<tr><td>${dayName}</td><td><span class="workout-tag tag-${s.type}">${(SCHEDULE_TYPE_LABEL[s.type] || s.type)}</span></td><td>${_escapeHtml(s.sessionName)}</td><td class="import-detail-cell">${_escapeHtml(detail)}</td></tr>`;
      }).join("");
      return `<div class="import-week-group"><h4>Week ${wk}</h4><table class="exercise-table"><thead><tr><th>Day</th><th>Type</th><th>Session</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join("");

    const endDate = plan.sessions.length ? plan.sessions[plan.sessions.length - 1].date : plan.startDate;
    const daysLeft = Math.ceil((new Date(endDate + "T00:00:00") - new Date(todayStr + "T00:00:00")) / 864e5);
    const weeksLeft = Math.floor(daysLeft / 7);
    const countdown = daysLeft <= 0 ? "Completed" : weeksLeft > 0 ? `${weeksLeft} week${weeksLeft !== 1 ? "s" : ""} left` : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`;

    html += `
      <div class="ti-card ti-card--imported collapsible is-collapsed" id="ti-import-${plan.id}">
        <div class="race-card-top">
          <span class="ti-card-badge ti-card-badge--imported">Imported</span>
          <div class="ti-card-actions">
            <button class="ti-edit-btn" onclick="editImportedPlan('${plan.id}')" title="Edit plan">Edit</button>
            <button class="delete-btn" onclick="removeTrainingInput('imported','${plan.id}')" title="Remove imported plan"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>
        </div>
        <div class="race-card-name card-toggle" onclick="toggleSection('ti-import-${plan.id}')" style="cursor:pointer">
          ${_escapeHtml(plan.name)}
          <span class="card-chevron" style="float:right">▾</span>
        </div>
        <div class="imported-card-info">
          <span class="race-card-meta">${plan.sessions.length} sessions · ${plan.weekCount} week${plan.weekCount !== 1 ? "s" : ""}</span>
          <span class="imported-card-dates"><span class="race-date-badge">${formatDisplayDate(plan.startDate)}</span> <span class="race-countdown">${countdown}</span></span>
        </div>
        <div class="card-body" style="padding:0 12px 12px">${weekSummary}</div>
      </div>`;
  });

  // ── Note cards ──
  notes.forEach(note => {
    html += `
      <div class="ti-card ti-card--note" id="ti-note-${note.id}">
        <div class="race-card-top">
          <span class="ti-card-badge ti-card-badge--note">Note</span>
          <div class="ti-card-actions">
            <button class="ti-edit-btn" onclick="editTrainingNote('${note.id}')" title="Edit note">Edit</button>
            <button class="delete-btn" onclick="removeTrainingInput('note','${note.id}')" title="Remove note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>
        </div>
        <div class="race-card-name ti-note-text" id="ti-note-text-${note.id}">${_escapeHtml(note.text)}</div>
      </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

/** Open the race for editing. Prefers the full Build Plan wizard (so the
 *  user can edit their weekly schedule / sports / long days / thresholds
 *  alongside race metadata) and falls back to the legacy race-only form
 *  when onboarding-v2 isn't loaded. */
function tiEditRace(id) {
  if (typeof window !== "undefined"
      && window.OnboardingV2
      && typeof window.OnboardingV2.openBuildPlanEdit === "function") {
    window.OnboardingV2.openBuildPlanEdit(null);
    return;
  }
  editEvent(id);
}

/** Edit an imported plan — full session editor */
function editImportedPlan(planId) {
  const plans = (() => { try { return JSON.parse(localStorage.getItem("importedPlans")) || []; } catch { return []; } })();
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;

  let overlay = document.getElementById("edit-imported-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "edit-imported-overlay";
  overlay.className = "quick-entry-overlay is-open";
  overlay.style.cssText = "display:flex;z-index:10001";
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="quick-entry-modal edit-import-modal">
      <div class="edit-import-header">
        <h3 style="margin:0">Edit Plan</h3>
        <button class="delete-btn" onclick="document.getElementById('edit-imported-overlay').remove()" title="Close">&#10005;</button>
      </div>
      <div class="edit-import-fields">
        <label class="form-label">
          Plan Name
          <input type="text" id="edit-import-name" class="form-input" value="${_escapeHtml(plan.name)}" style="margin-top:4px;width:100%">
        </label>
        <label class="form-label">
          Start Date
          <input type="date" id="edit-import-start" class="form-input" value="${plan.startDate}" style="margin-top:4px;width:100%">
        </label>
      </div>
      <div class="edit-import-sessions" id="edit-import-sessions"></div>
      <div class="edit-import-footer">
        <button class="btn-secondary" onclick="document.getElementById('edit-imported-overlay').remove()">Cancel</button>
        <button class="btn-primary" onclick="_saveImportedPlanEdits('${planId}')">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _renderImportedSessions(planId);
}

function _renderImportedSessions(planId) {
  const container = document.getElementById("edit-import-sessions");
  if (!container) return;

  const schedule = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
  const sessions = schedule.filter(e => e.planId === planId).sort((a, b) => a.date.localeCompare(b.date));

  if (!sessions.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--color-text-muted);padding:16px">No sessions in this plan.</div>';
    return;
  }

  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const planStart = new Date(sessions[0].date + "T00:00:00");

  // Group by week
  const weeks = {};
  sessions.forEach(s => {
    const wk = Math.floor((new Date(s.date + "T00:00:00") - planStart) / (7 * 864e5)) + 1;
    if (!weeks[wk]) weeks[wk] = [];
    weeks[wk].push(s);
  });

  let html = '<div class="edit-import-session-label">Sessions</div>';
  Object.entries(weeks).forEach(([wk, wkSessions]) => {
    html += `<div class="edit-import-week"><div class="edit-import-week-title">Week ${wk}</div>`;
    wkSessions.forEach(s => {
      const d = new Date(s.date + "T00:00:00");
      const dayLabel = DOW[d.getDay()];
      const typeLabel = SCHEDULE_TYPE_LABEL[s.type] || s.type;
      const exCount = s.exercises ? s.exercises.length : 0;
      const ivCount = s.aiSession?.intervals ? s.aiSession.intervals.length : 0;
      const detail = exCount ? `${exCount} exercises` : ivCount ? `${ivCount} intervals` : s.details || "";
      html += `
        <div class="edit-import-session-row">
          <div class="edit-import-session-info">
            <div class="edit-import-session-top">
              <span class="edit-import-session-day">${dayLabel}</span>
              <span class="workout-tag tag-${s.type}">${typeLabel}</span>
              <span class="edit-import-session-name">${_escapeHtml(s.sessionName)}</span>
            </div>
            <div class="edit-import-session-detail">${_escapeHtml(detail)}</div>
          </div>
          <div class="edit-import-session-actions">
            <button class="ti-edit-btn" onclick="_editImportedSession('${s.id}')" title="Edit session">Edit</button>
            <button class="delete-btn" onclick="_deleteImportedSession('${planId}','${s.id}')" title="Remove session"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>
        </div>`;
    });
    html += '</div>';
  });

  container.innerHTML = html;
}

function _editImportedSession(sessionId) {
  // Close the plan editor overlay temporarily
  const overlay = document.getElementById("edit-imported-overlay");
  if (overlay) overlay.style.display = "none";

  // Open the existing workout editor on this workoutSchedule entry
  if (typeof openEditWorkout === "function") {
    openEditWorkout(sessionId, "workoutSchedule");

    // When the workout editor closes, re-show the plan editor
    const editOverlay = document.getElementById("edit-workout-overlay");
    if (editOverlay) {
      const obs = new MutationObserver(() => {
        if (!editOverlay.classList.contains("is-open")) {
          obs.disconnect();
          if (overlay) {
            overlay.style.display = "flex";
            // Re-render sessions in case they changed
            const planId = overlay.querySelector("[onclick*=_saveImportedPlanEdits]")?.getAttribute("onclick")?.match(/'([^']+)'/)?.[1];
            if (planId) _renderImportedSessions(planId);
          }
        }
      });
      obs.observe(editOverlay, { attributes: true, attributeFilter: ["class"] });
    }
  }
}

function _deleteImportedSession(planId, sessionId) {
  if (!confirm("Remove this session from the plan?")) return;

  // Remove from workoutSchedule
  const schedule = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
  localStorage.setItem("workoutSchedule", JSON.stringify(schedule.filter(e => e.id !== sessionId))); if (typeof DB !== 'undefined') DB.syncSchedule();

  // Update plan metadata
  const plans = (() => { try { return JSON.parse(localStorage.getItem("importedPlans")) || []; } catch { return []; } })();
  const plan = plans.find(p => p.id === planId);
  if (plan) {
    // Find the session date to remove from metadata
    const removed = schedule.find(e => e.id === sessionId);
    if (removed) {
      plan.sessions = plan.sessions.filter(s => s.date !== removed.date || s.sessionName !== removed.sessionName);
    }
    localStorage.setItem("importedPlans", JSON.stringify(plans)); if (typeof DB !== 'undefined') DB.syncKey('importedPlans');
  }

  _renderImportedSessions(planId);
}

function _saveImportedPlanEdits(planId) {
  const nameInput = document.getElementById("edit-import-name");
  const startInput = document.getElementById("edit-import-start");
  if (!nameInput || !startInput) return;

  const newName = nameInput.value.trim();
  const newStart = startInput.value;
  if (!newName || !newStart) return;

  const plans = (() => { try { return JSON.parse(localStorage.getItem("importedPlans")) || []; } catch { return []; } })();
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;

  const oldStart = plan.startDate;
  const shiftMs = new Date(newStart + "T00:00:00") - new Date(oldStart + "T00:00:00");
  const shiftDays = Math.round(shiftMs / 864e5);

  // Update plan metadata
  plan.name = newName;
  plan.startDate = newStart;
  if (shiftDays !== 0) {
    plan.sessions.forEach(s => {
      const d = new Date(new Date(s.date + "T00:00:00").getTime() + shiftMs);
      s.date = d.toISOString().slice(0, 10);
    });
  }
  localStorage.setItem("importedPlans", JSON.stringify(plans)); if (typeof DB !== 'undefined') DB.syncKey('importedPlans');

  // Shift workoutSchedule entries with matching planId
  if (shiftDays !== 0) {
    const schedule = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
    schedule.forEach(e => {
      if (e.planId === planId) {
        const d = new Date(new Date(e.date + "T00:00:00").getTime() + shiftMs);
        e.date = d.toISOString().slice(0, 10);
      }
    });
    localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();
  }

  // Close modal, refresh
  const overlay = document.getElementById("edit-imported-overlay");
  if (overlay) overlay.remove();
  renderTrainingInputs();
  if (typeof renderCalendar === "function") renderCalendar();
}

/** Open the Gym & Strength section so user can regenerate a schedule */
function tiEditSchedule(type) {
  openBuildPlanTab('gym');
}

function removeTrainingInput(kind, id) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const meta = typeof loadCompletionMeta === "function" ? loadCompletionMeta() : {};

  if (kind === "race") {
    if (!confirm("Remove this race and its training plan? Past completed sessions will be kept.")) return;
    const deleted = loadEvents().find(e => e.id === id);
    saveEvents(loadEvents().filter(e => e.id !== id));
    saveTrainingPlanData(loadTrainingPlan().filter(e => {
      if (e.raceId !== id) return true;       // different race — keep
      if (e.date < todayStr) return true;      // past — keep
      if (e.date === todayStr) {               // today — keep only if completed
        const sessionId = `session-plan-${e.date}-${e.raceId}`;
        return !!meta[sessionId];
      }
      return false;                            // future — remove
    }));
    // Onboarding v2 plans live in workoutSchedule (not trainingPlan) and
    // tag every session with raceId. Mirror the same past-keep/future-drop
    // cascade there so deleting the race actually removes its plan.
    try {
      const existingSched = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
      const filteredSched = existingSched.filter(e => {
        if (!e || e.raceId !== id) return true;
        if (e.date < todayStr) return true;
        if (e.date === todayStr) {
          const sessionId = `session-sw-${e.id}`;
          return !!meta[sessionId];
        }
        return false;
      });
      if (filteredSched.length !== existingSched.length) {
        localStorage.setItem("workoutSchedule", JSON.stringify(filteredSched));
        if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
      }
    } catch (e) { console.warn("[removeTrainingInput:race] workoutSchedule scrub failed", e && e.message); }
    // Scrub the Build Plan flow's raceEvents store so the deleted race
    // can't leak back through openBuildPlan's state-restore path (which
    // reads raceEvents[0] into _state.currentRace and could re-append
    // it to `events` on the next _confirmAndSavePlan).
    try {
      const raw = localStorage.getItem("raceEvents");
      if (raw) {
        const arr = JSON.parse(raw) || [];
        const filtered = arr.filter(r => {
          if (!r) return false;
          if (r.id === id) return false;
          if (deleted && r.name === deleted.name && r.date === deleted.date) return false;
          return true;
        });
        if (filtered.length !== arr.length) {
          localStorage.setItem("raceEvents", JSON.stringify(filtered));
          if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("raceEvents");
        }
      }
    } catch (e) { console.warn("[removeTrainingInput:race] raceEvents scrub failed", e && e.message); }
    // Re-run the promotion/integrity check so a surviving B race gets a
    // full rebuild (same cascade deleteEvent uses).
    checkARacePromotion();
    renderRaceEvents();
    renderTrainingConflicts();
    if (typeof renderCalendar === "function") renderCalendar();
  } else if (kind === "schedule") {
    if (!confirm("Remove this schedule and all its future sessions?")) return;
    const existing = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
    const before = existing.length;
    const filtered = existing.filter(e => {
      if (e.type !== id) return true;          // different type — keep
      if (e.date < todayStr) return true;       // past — keep
      if (e.date === todayStr) {               // today — keep only if completed
        const sessionId = `session-sw-${e.id}`;
        return !!meta[sessionId];
      }
      return false;                            // future — remove
    });
    console.log(`[removeTrainingInput] schedule type="${id}" before=${before} after=${filtered.length} removed=${before - filtered.length}`);
    localStorage.setItem("workoutSchedule", JSON.stringify(filtered)); if (typeof DB !== 'undefined') DB.syncSchedule();
    renderTrainingConflicts();
    if (typeof renderCalendar === "function") renderCalendar();
  } else if (kind === "imported") {
    if (!confirm("Remove this imported plan and all its future sessions?")) return;
    // Remove schedule entries tagged with this planId
    const existing = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
    const filtered = existing.filter(e => {
      if (e.planId !== id) return true;
      if (e.date < todayStr) return true;
      if (e.date === todayStr) {
        const sessionId = `session-sw-${e.id}`;
        return !!meta[sessionId];
      }
      return false;
    });
    localStorage.setItem("workoutSchedule", JSON.stringify(filtered)); if (typeof DB !== 'undefined') DB.syncSchedule();
    // Remove plan metadata
    const plans = (() => { try { return JSON.parse(localStorage.getItem("importedPlans")) || []; } catch { return []; } })();
    localStorage.setItem("importedPlans", JSON.stringify(plans.filter(p => p.id !== id))); if (typeof DB !== 'undefined') DB.syncKey('importedPlans');
    if (typeof renderCalendar === "function") renderCalendar();
  } else if (kind === "note") {
    saveTrainingNotes(loadTrainingNotes().filter(n => n.id !== id));
  } else if (kind === "buildplan") {
    // id is the planId — remove every future session with matching planId.
    if (!confirm("Remove this training block and all of its future sessions?")) return;
    const existing = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
    const filtered = existing.filter(e => {
      if (e.planId !== id) return true;     // different plan — keep
      if (e.date < todayStr) return true;   // past — keep
      return false;                          // future with this planId — remove
    });
    localStorage.setItem("workoutSchedule", JSON.stringify(filtered));
    if (typeof DB !== 'undefined') DB.syncSchedule();
    if (typeof renderCalendar === "function") renderCalendar();
  }
  renderTrainingInputs();
}

function addTrainingNote() {
  const input = document.getElementById("training-note-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const notes = loadTrainingNotes();
  notes.push({ id: generateId("note"), text });
  saveTrainingNotes(notes);
  input.value = "";
  renderTrainingInputs();
}

function editTrainingNote(id) {
  const textEl = document.getElementById("ti-note-text-" + id);
  if (!textEl) return;
  const current = textEl.textContent;

  const inp = document.createElement("input");
  inp.type      = "text";
  inp.value     = current;
  inp.className = "ti-edit-input";

  const save = () => {
    const newText = inp.value.trim();
    if (newText && newText !== current) {
      const notes = loadTrainingNotes();
      const n = notes.find(n => n.id === id);
      if (n) { n.text = newText; saveTrainingNotes(notes); }
    }
    renderTrainingInputs();
  };

  inp.addEventListener("blur", save);
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter")  inp.blur();
    if (e.key === "Escape") renderTrainingInputs();
  });
  textEl.replaceWith(inp);
  inp.focus();
  inp.select();
}

// ─── localStorage helpers ────────────────────────────────────────────────────

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem("events")) || [];
  } catch {
    return [];
  }
}

function saveEvents(events) {
  localStorage.setItem("events", JSON.stringify(events)); if (typeof DB !== 'undefined') DB.syncEvents();
}

function loadTrainingPlan() {
  try {
    return JSON.parse(localStorage.getItem("trainingPlan")) || [];
  } catch {
    return [];
  }
}

function saveTrainingPlanData(plan) {
  localStorage.setItem("trainingPlan", JSON.stringify(plan)); if (typeof DB !== 'undefined') DB.syncTrainingPlan();
}

/**
 * regenerateTrainingPlanFromEvents()
 * Self-healing rebuild of localStorage.trainingPlan from the user's
 * current race list. Used when the user has upcoming races on their
 * calendar but the plan has been cleared (corrupted, manually deleted,
 * or broken by a prior migration). Reads events, prepares a race
 * calendar, calls generateTrainingPlan, and writes the result.
 * Returns the number of plan entries written, or -1 if there was
 * nothing to regenerate.
 */
function regenerateTrainingPlanFromEvents() {
  const events = loadEvents();
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e && e.date && e.date >= todayStr);
  if (!upcoming.length) return -1;
  try {
    const calendar = prepareRaceCalendar(upcoming);
    const newPlan = generateTrainingPlan(calendar);
    if (!Array.isArray(newPlan) || newPlan.length === 0) return 0;
    // Replace only the entries for races that are in the current calendar;
    // keep history from other races untouched so regeneration is additive.
    const keep = loadTrainingPlan().filter(e => {
      const raceIds = calendar.all.map(r => r.id);
      return !raceIds.includes(e.raceId);
    });
    saveTrainingPlanData([...keep, ...newPlan]);
    console.info("[planner] Regenerated " + newPlan.length + " plan entries from " + calendar.all.length + " race(s)");
    return newPlan.length;
  } catch (e) {
    console.warn("[planner] regenerateTrainingPlanFromEvents failed", e);
    return -1;
  }
}

// Self-heal on script load: if there are upcoming races in events but
// trainingPlan has zero future entries, regenerate automatically. This
// recovers from a corrupted plan write without requiring manual action.
(function _autoHealTrainingPlan() {
  try {
    if (typeof localStorage === "undefined") return;
    const events = loadEvents();
    const todayStr = new Date().toISOString().slice(0, 10);
    const hasUpcomingRace = events.some(e => e && e.date && e.date >= todayStr);
    if (!hasUpcomingRace) return;
    const plan = loadTrainingPlan();
    const hasFuturePlan = plan.some(e => e && e.date && e.date >= todayStr);
    if (hasFuturePlan) return;
    // Silently regen — no user prompt. Defensive.
    regenerateTrainingPlanFromEvents();
  } catch {}
})();

// ═════════════════════════════════════════════════════════════════════════════
// Add Running Session helpers — added 2026-04-09 by
// PHILOSOPHY_UPDATE_2026-04-09_run_session_types.md
// ═════════════════════════════════════════════════════════════════════════════

// Hard session classifier — used by getWeeklyHardSessionCount and the stress check.
// Recognises BOTH the legacy load tags ("long", "hard", "moderate") and the new
// session-type ids from SESSION_TYPE_LIBRARY.
const _HARD_SESSION_TYPE_IDS = new Set([
  "long_run", "tempo_threshold", "track_workout", "speed_work", "hills"
]);
const _HARD_LEGACY_LOADS = new Set(["long", "hard", "moderate"]);

function _isHardEntry(entry) {
  if (!entry) return false;
  if (entry.type && _HARD_SESSION_TYPE_IDS.has(entry.type)) return true;
  if (entry.is_hard === true) return true;
  if (entry.load && _HARD_LEGACY_LOADS.has(entry.load)) return true;
  return false;
}

function _loadSchedule() {
  try { return JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch { return []; }
}
function _saveSchedule(s) {
  localStorage.setItem("workoutSchedule", JSON.stringify(s));
  if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
}

function _mondayOfDateStr(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function _datesInWeek(weekStartDateStr) {
  const out = [];
  const start = new Date(_mondayOfDateStr(weekStartDateStr) + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime());
    d.setDate(d.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Remove a workout from both the training plan and the schedule, by id.
 * Returns the removed entry (or null if not found).
 */
function removeWorkout(workoutId) {
  if (!workoutId) return null;
  let removed = null;

  const plan = loadTrainingPlan();
  const planIdx = plan.findIndex(e => e.id === workoutId);
  if (planIdx >= 0) {
    removed = plan[planIdx];
    plan.splice(planIdx, 1);
    saveTrainingPlanData(plan);
  }

  const schedule = _loadSchedule();
  const schedIdx = schedule.findIndex(e => e.id === workoutId);
  if (schedIdx >= 0) {
    if (!removed) removed = schedule[schedIdx];
    schedule.splice(schedIdx, 1);
    _saveSchedule(schedule);
  }
  return removed;
}

/**
 * Recalculate remaining days of the week to redistribute removed volume across
 * the easy/endurance sessions. Pure function — no API calls. Does NOT add a
 * new Long Run if one was removed (the user made an intentional choice).
 *
 * Strategy: scan trainingPlan + workoutSchedule for the given week. Compute
 * `target_total_min` from the entries that exist (sum of durations) plus an
 * implicit "missing" allowance if the week is now under the historical median
 * for the user. For v1 we keep this conservative: only re-balance when the
 * user explicitly removed a Long Run via removeWorkout, by bumping the
 * remaining easy sessions' duration up by an even share of the removed minutes.
 */
function rebalanceWeek(weekStartDateStr, opts) {
  const dates = new Set(_datesInWeek(weekStartDateStr));
  const removedMinutes = (opts && opts.removedDurationMin) || 0;
  if (removedMinutes <= 0) return { adjusted: 0, perSessionDelta: 0 };

  const plan = loadTrainingPlan();
  // Easy/endurance entries only — we never bump tempo/track/speed/hills/long.
  const easyEntries = plan.filter(e => dates.has(e.date) && !_isHardEntry(e));
  if (easyEntries.length === 0) return { adjusted: 0, perSessionDelta: 0 };

  const perSessionDelta = Math.round(removedMinutes / easyEntries.length / 5) * 5;
  if (perSessionDelta <= 0) return { adjusted: 0, perSessionDelta: 0 };

  for (const e of easyEntries) {
    e.duration = (parseFloat(e.duration) || 30) + perSessionDelta;
    e.rebalanced = true;
  }
  saveTrainingPlanData(plan);
  return { adjusted: easyEntries.length, perSessionDelta };
}

/**
 * Count the hard sessions currently scheduled in the week containing
 * `weekStartDateStr`. Used by the weekly stress check.
 *
 * Returns: { count, items: [{ date, title, type }] }
 */
function getWeeklyHardSessionCount(weekStartDateStr) {
  const dates = new Set(_datesInWeek(weekStartDateStr));
  const plan = loadTrainingPlan();
  const schedule = _loadSchedule();
  const items = [];
  for (const e of plan) {
    if (dates.has(e.date) && _isHardEntry(e)) {
      items.push({ date: e.date, title: e.sessionName || e.title || e.type || "Hard session", type: e.type || e.load });
    }
  }
  for (const e of schedule) {
    if (dates.has(e.date) && _isHardEntry(e)) {
      items.push({ date: e.date, title: e.sessionName || e.title || e.type || "Hard session", type: e.type || e.load });
    }
  }
  return { count: items.length, items };
}

if (typeof window !== "undefined") {
  // Expose the new helpers as a small Planner namespace; existing globals
  // (loadTrainingPlan, etc.) stay reachable on window as before.
  window.Planner = Object.assign(window.Planner || {}, {
    removeWorkout,
    rebalanceWeek,
    getWeeklyHardSessionCount,
    loadTrainingPlan,
    saveTrainingPlanData,
    isHardEntry: _isHardEntry,
  });
}

// ─── Training plan generation ────────────────────────────────────────────────

/**
 * Remaps the "long" load session from its default DOW to race.longDay.
 * Any session already occupying the target DOW is removed to avoid conflicts.
 */
function applyLongDayPreference(patterns, longDay, targetDiscipline) {
  if (longDay === undefined || longDay === null) return patterns;

  // Find the default DOW for the "long" session, optionally filtered by discipline
  let defaultLongDow = null;
  outer: for (const phasePattern of Object.values(patterns)) {
    for (const [dow, session] of Object.entries(phasePattern)) {
      if (session.load === "long" && (!targetDiscipline || session.discipline === targetDiscipline)) {
        defaultLongDow = parseInt(dow); break outer;
      }
    }
  }

  if (defaultLongDow === null || defaultLongDow === longDay) return patterns;

  const result = {};
  for (const [phaseName, phasePattern] of Object.entries(patterns)) {
    result[phaseName] = {};
    const longSession = phasePattern[defaultLongDow];
    for (const [dow, session] of Object.entries(phasePattern)) {
      const d = parseInt(dow);
      if (d === defaultLongDow || d === longDay) continue; // remove from old and new slot
      result[phaseName][d] = session;
    }
    if (longSession) result[phaseName][longDay] = longSession;
  }
  return result;
}

// ─── Running plan helpers ─────────────────────────────────────────────────────

/**
 * Returns the philosophy-recommended training days/week for a runner.
 * Shared between the survey slider and the race event form.
 */
function computeRunDaysRecommendation(level, runGoal, returningFromInjury) {
  const base = { beginner: 3, intermediate: 4, advanced: 5 };
  let rec = base[level] || 4;
  if (runGoal === "compete")  rec = Math.min(rec + 1, 6);
  if (runGoal === "finish")   rec = Math.max(rec - 1, 3);
  if (returningFromInjury)    rec = Math.max(rec - 1, 3);
  return rec;
}

/**
 * Trims or expands a DOW→session pattern to match the target training days.
 * Priority when trimming: long > hard/moderate/strides > easy.
 * When expanding, adds easy runs on free days while respecting quality-session buffer rules.
 */
function adjustPatternToDays(pattern, daysPerWeek, unavailableDays) {
  const unavailSet = new Set(unavailableDays || []);
  let entries = Object.entries(pattern).map(([d, s]) => [parseInt(d), s]);

  // First: remove any sessions on unavailable days, redistributing to nearby available days
  if (unavailSet.size > 0) {
    const kept = [];
    const displaced = [];
    for (const [dow, session] of entries) {
      if (unavailSet.has(dow)) displaced.push(session);
      else kept.push([dow, session]);
    }
    // Try to redistribute displaced sessions to open available days
    const usedDows = new Set(kept.map(([d]) => d));
    for (const session of displaced) {
      let placed = false;
      for (const d of [1, 2, 3, 4, 5, 6, 0]) {
        if (!unavailSet.has(d) && !usedDows.has(d)) {
          kept.push([d, session]);
          usedDows.add(d);
          placed = true;
          break;
        }
      }
      // If no open day, drop the session (respect user's constraint)
    }
    entries = kept;
  }

  if (!daysPerWeek) return Object.fromEntries(entries);

  const loadPri = { long: 0, hard: 1, moderate: 1, strides: 1, easy: 2 };
  if (entries.length > daysPerWeek) {
    entries.sort((a, b) => (loadPri[a[1].load] ?? 2) - (loadPri[b[1].load] ?? 2));
    return Object.fromEntries(entries.slice(0, daysPerWeek).map(([d, s]) => [d, s]));
  }
  if (entries.length < daysPerWeek) {
    const usedDows = new Set(entries.map(([d]) => d));
    const blockedDows = new Set();
    entries.forEach(([d, s]) => {
      if (s.load === "hard" || s.load === "moderate") {
        blockedDows.add((d + 6) % 7);
        blockedDows.add((d + 1) % 7);
      }
    });
    const result = { ...Object.fromEntries(entries) };
    let needed = daysPerWeek - entries.length;
    // First pass: prefer non-blocked days (soft buffer around hard/moderate)
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      if (needed <= 0) break;
      if (!usedDows.has(d) && !blockedDows.has(d) && !unavailSet.has(d)) {
        result[d] = { discipline: "run", load: "easy" };
        usedDows.add(d);
        needed--;
      }
    }
    // Second pass: relax quality buffer if we still need more days
    if (needed > 0) {
      for (const d of [1, 2, 3, 4, 5, 6, 0]) {
        if (needed <= 0) break;
        if (!usedDows.has(d) && !unavailSet.has(d)) {
          result[d] = { discipline: "run", load: "easy" };
          usedDows.add(d);
          needed--;
        }
      }
    }
    return result;
  }
  return Object.fromEntries(entries);
}

// ─── Progressive run session durations ───────────────────────────────────────
// Each entry: [startMin, peakMin] — duration at week 1 of base through final build week.
// Taper weeks are reduced to ~62% of peak regardless of week number.
// Progression is linear across all non-taper weeks.
// Basis: beginner long runs start short (tissue tolerance) and build conservatively;
//   intermediate/advanced assume a reasonable existing base.
const RUN_DURATION_TABLES = {
  marathon: {
    beginner:     { long: [40, 120], easy: [25, 40], strides: [30, 40], moderate: [35, 50], hard: [40, 55] },
    intermediate: { long: [60, 160], easy: [35, 50], strides: [35, 45], moderate: [45, 60], hard: [50, 65] },
    advanced:     { long: [75, 180], easy: [45, 60], strides: [40, 50], moderate: [50, 65], hard: [55, 70] },
  },
  halfMarathon: {
    beginner:     { long: [30, 90],  easy: [20, 35], strides: [25, 35], moderate: [30, 45], hard: [35, 50] },
    intermediate: { long: [45, 120], easy: [30, 45], strides: [30, 40], moderate: [40, 55], hard: [45, 60] },
    advanced:     { long: [60, 135], easy: [35, 50], strides: [35, 45], moderate: [45, 60], hard: [50, 65] },
  },
  tenK: {
    beginner:     { long: [25, 55],  easy: [20, 30], strides: [25, 30], moderate: [30, 40], hard: [30, 45] },
    intermediate: { long: [35, 70],  easy: [30, 40], strides: [30, 40], moderate: [35, 50], hard: [40, 50] },
    advanced:     { long: [45, 85],  easy: [35, 50], strides: [30, 40], moderate: [40, 55], hard: [45, 60] },
  },
  fiveK: {
    beginner:     { long: [20, 40],  easy: [20, 30], strides: [20, 30], moderate: [25, 35], hard: [30, 40] },
    intermediate: { long: [25, 55],  easy: [20, 35], strides: [25, 35], moderate: [30, 40], hard: [30, 50] },
    advanced:     { long: [30, 65],  easy: [30, 40], strides: [30, 40], moderate: [30, 50], hard: [40, 55] },
  },
};

/**
 * Returns the appropriate session duration in minutes for a running plan entry,
 * interpolating linearly from start to peak across non-taper weeks and reducing
 * during taper.
 */
function getRunSessionDuration(raceType, load, phaseName, weekNumber, totalWeeks, patternKey) {
  const table = (RUN_DURATION_TABLES[raceType] || {})[patternKey];
  if (!table) return null;
  const range = table[load];
  if (!range) return null;

  const [startMin, peakMin] = range;

  if (phaseName === "Taper") {
    return Math.round(peakMin * 0.62 / 5) * 5;
  }

  const config = RACE_CONFIGS[raceType];
  const taperWeeks = config
    ? config.phases.filter(ph => ph.name === "Taper").reduce((s, ph) => s + ph.weeks, 0)
    : 1;
  const buildWeeks = totalWeeks - taperWeeks;
  const progress = buildWeeks > 1 ? Math.min((weekNumber - 1) / (buildWeeks - 1), 1) : 1;

  return Math.round((startMin + (peakMin - startMin) * progress) / 5) * 5;
}

/**
 * Computes the pattern key (beginner | intermediate | advanced) for running race types,
 * applying runGoal and returningFromInjury modifiers from the philosophy.
 */
function getRunPatternKey(race) {
  let key = race.level || "intermediate";

  // Returning from injury/break: step down one level for safer progression
  if (race.returningFromInjury) {
    if (key === "advanced") key = "intermediate";
    else key = "beginner";
  }

  // Completion-focused goal: step down one level (durability > optimization)
  if (race.runGoal === "finish") {
    if (key === "advanced") key = "intermediate";
    else if (key === "intermediate") key = "beginner";
  }

  // Performance/compete goal: step up one level if beginner self-reported
  if (race.runGoal === "compete" && key === "beginner") {
    key = "intermediate";
  }

  return key;
}

/**
 * prepareRaceCalendar(raceEvents)
 * Normalizes a list of race events into { aRace, bRaces, all } for
 * multi-race plan generation. Enforces the one-A-race rule: if zero
 * A races exist the earliest is promoted; if multiple A races exist
 * all but the latest are demoted to B. B races that fall AFTER the
 * A race date are dropped (not relevant to the A-race plan arc).
 *
 * @param {Array} raceEvents - race objects from localStorage.events / raceEvents
 * @returns {{aRace: Object|null, bRaces: Array, all: Array}}
 */
function prepareRaceCalendar(raceEvents) {
  const list = Array.isArray(raceEvents) ? raceEvents.slice() : [];
  if (!list.length) return { aRace: null, bRaces: [], all: [] };
  // Sort by date ascending
  list.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  // Normalize priority strings
  list.forEach(r => { r.priority = String(r.priority || "A").toUpperCase() === "B" ? "B" : "A"; });
  // Enforce exactly one A race
  const aRaces = list.filter(r => r.priority === "A");
  if (aRaces.length === 0) {
    list[0].priority = "A";
  } else if (aRaces.length > 1) {
    // Keep only the LAST A race (user's biggest goal, furthest out)
    aRaces.slice(0, -1).forEach(r => { r.priority = "B"; });
  }
  const aRace = list.find(r => r.priority === "A");
  // Drop B races that fall after the A race — they belong to a
  // different training block and shouldn't influence this arc.
  const relevant = list.filter(r =>
    r.priority === "A" || String(r.date) <= String(aRace.date)
  );
  return {
    aRace,
    bRaces: relevant.filter(r => r.priority === "B"),
    all: relevant,
  };
}

/**
 * insertBRaceWindow(sessions, bRace, aRace)
 * Applies a micro-taper + race-day + recovery window around each
 * B race date, without disrupting the A race's discipline balance:
 *
 *   • 3 days before: reduce volume, drop long sessions
 *   • Race day: replace with an easy shakeout (or leave the B race
 *     itself untouched if the calendar already has a race event)
 *   • 3 days after: easy recovery for all disciplines
 *
 * Critically, disciplines OTHER than the B race's discipline are NOT
 * dropped during the window — a half-marathon B race during Ironman
 * training keeps swim+bike easy, never skipped. Sessions outside the
 * window are returned unchanged.
 *
 * @param {Array} sessions - mutable session array (modified in place)
 * @param {Object} bRace - race event with .date, .category, .type
 * @param {Object} aRace - the anchor A race (for context, unused directly)
 * @returns {Array} the same session array with taper/recovery applied
 */
function insertBRaceWindow(sessions, bRace, aRace) {
  if (!bRace || !bRace.date || !Array.isArray(sessions)) return sessions;
  const bDateMs = new Date(bRace.date + "T00:00:00").getTime();
  const TAPER_DAYS = 3;
  const RECOVER_DAYS = 3;
  const taperStartMs = bDateMs - TAPER_DAYS * 86400000;
  const recoveryEndMs = bDateMs + RECOVER_DAYS * 86400000;

  // Map race category → discipline code used by calendar sessions
  const CAT_TO_DISC = {
    running: "run", run: "run",
    cycling: "bike", bike: "bike",
    swimming: "swim", swim: "swim",
    triathlon: "run", // tri B-race primary effort is the run leg
    hyrox: "run",
    rowing: "row",
  };
  const bDisc = CAT_TO_DISC[String(bRace.category || "").toLowerCase()]
    || CAT_TO_DISC[String(bRace.type || "").toLowerCase()]
    || "run";

  sessions.forEach(s => {
    if (!s || !s.date) return;
    const sMs = new Date(s.date + "T00:00:00").getTime();
    if (isNaN(sMs)) return;
    if (sMs < taperStartMs || sMs > recoveryEndMs) return;

    const isRaceDay = sMs === bDateMs;
    const isPreRace = sMs >= taperStartMs && sMs < bDateMs;
    const isPostRace = sMs > bDateMs && sMs <= recoveryEndMs;

    // Tag every affected session so the calendar can show a B-race
    // banner and the plan-save logic can differentiate these from
    // the A-race arc.
    s.bRaceWindow = true;
    s.bRaceId = bRace.id || null;

    if (isRaceDay) {
      s.discipline = bDisc;
      s.type = bRace.category === "triathlon" ? "triathlon"
             : bDisc === "bike" ? "cycling"
             : bDisc === "swim" ? "swimming"
             : "running";
      s.sessionName = bRace.name || (bRace.type ? bRace.type + " — Race Day" : "B Race");
      s.load = "race";
      s.isBRace = true;
      s.notes = "B race — " + (bRace.name || bRace.type || "race day") + ". Race effort, then 3 easy recovery days.";
      return;
    }

    if (isPreRace) {
      const daysOut = Math.max(1, Math.round((bDateMs - sMs) / 86400000));
      // If this session is the same discipline as the B race, shrink
      // it aggressively and strip long/interval intent.
      if (s.discipline === bDisc) {
        s.load = "easy";
        s.sessionName = "Pre-race Shakeout " + _bDiscName(bDisc);
        if (typeof s.duration === "number") s.duration = Math.max(15, Math.round(s.duration * 0.5));
        s.notes = "B race in " + daysOut + " day" + (daysOut === 1 ? "" : "s") + " — easy shakeout, no intensity.";
      } else if (s.discipline !== "rest" && s.discipline !== "strength") {
        // Other endurance disciplines: trim ~25% but keep the session.
        s.load = "easy";
        if (typeof s.duration === "number") s.duration = Math.max(20, Math.round(s.duration * 0.75));
        s.notes = "B race taper window — keep it easy.";
      } else if (s.discipline === "strength") {
        // No heavy lifting in the 72 hours before a race.
        s.sessionName = "Mobility / Light Lift";
        s.load = "easy";
        if (typeof s.duration === "number") s.duration = Math.max(20, Math.round(s.duration * 0.6));
        s.notes = "B race taper — keep lifting light, no PRs.";
      }
      return;
    }

    if (isPostRace) {
      const daysBack = Math.max(1, Math.round((sMs - bDateMs) / 86400000));
      if (s.discipline === bDisc) {
        s.load = "easy";
        s.sessionName = "Recovery " + _bDiscName(bDisc);
        if (typeof s.duration === "number") s.duration = Math.min(30, s.duration);
        s.notes = "Post-B-race recovery (day " + daysBack + " of 3). Easy effort.";
      } else if (s.discipline !== "rest") {
        s.load = "easy";
        if (typeof s.duration === "number") s.duration = Math.max(20, Math.round(s.duration * 0.8));
        s.notes = "Post-B-race recovery window — keep it easy.";
      }
      return;
    }
  });

  return sessions;
}

function _bDiscName(disc) {
  return disc === "run" ? "Run"
       : disc === "bike" ? "Ride"
       : disc === "swim" ? "Swim"
       : disc === "row" ? "Row"
       : "Session";
}

/**
 * generateTrainingPlan(raceOrCalendar)
 *
 * Accepts either a single race object (back-compat, used by the
 * legacy survey.js flow) or a prepared race calendar object from
 * prepareRaceCalendar(). In either case the plan is built from the
 * A race's perspective and B races are post-processed with
 * insertBRaceWindow to apply micro-tapers without disrupting the
 * A race's discipline balance.
 *
 * @param {Object} raceOrCalendar - a race event OR { aRace, bRaces, all }
 * @returns {Array} plan entries, same shape as before
 */
function generateTrainingPlan(raceOrCalendar) {
  // Dispatch: if the caller passed a race calendar, use the A race
  // as the driver and apply B race windows after generation.
  if (raceOrCalendar && raceOrCalendar.aRace && Array.isArray(raceOrCalendar.bRaces)) {
    const calendar = raceOrCalendar;
    const plan = _generateSingleRacePlan(calendar.aRace);
    calendar.bRaces.forEach(bRace => insertBRaceWindow(plan, bRace, calendar.aRace));
    return plan;
  }
  // Legacy path: single race object passed directly.
  return _generateSingleRacePlan(raceOrCalendar);
}

/**
 * buildPatternsFromPreferences(weeklyTemplate, phases, ctx)
 * Converts the athlete's Training Inputs weekly template (day-of-week →
 * enriched codes like "swim-css", "bike-interval", "run-long", "strength-push")
 * into per-phase day-of-week → { discipline, load } patterns.
 *
 * Philosophy mapping (§6.1 session distribution):
 *   Base   — no hard days; intervals/CSS demoted to moderate; long days kept
 *   Build  — user's hard/interval day stays hard; long day stays long
 *   Peak   — hard day becomes race-pace; add 1 extra intensity if template allows
 *   Taper  — all quality cut; intervals → easy openers; long → moderate
 *
 * The "enriched code" format is "<discipline>-<variant>" from onboarding-v2.
 * Unknown codes are treated as generic discipline-easy.
 *
 * @param {Object} weeklyTemplate  { mon:[codes], tue:[codes], ..., sun:[codes] }
 * @param {Array}  phases          [{name, weeks}, ...]
 * @param {Object} ctx             { raceType, triTypes }
 * @returns {Object} { [phaseName]: { [dow0..6]: { discipline, load } } }
 */
function buildPatternsFromPreferences(weeklyTemplate, phases, ctx) {
  // Map day-name → day-of-week (0=Sun…6=Sat).
  const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  // Code variant → load mapping. "long" is a load of its own.
  const VARIANT_TO_LOAD = {
    // run
    long: "long", interval: "hard", hard: "hard", hills: "hard",
    tempo: "moderate", moderate: "moderate", recovery: "easy",
    easy: "easy", strides: "strides",
    // bike
    // "interval" / "hard" shared above; "long" shared above
    // swim
    css: "hard", threshold: "hard",
    endurance: "moderate", technique: "easy",
    // strength
    push: "moderate", pull: "moderate", legs: "moderate", upper: "moderate",
    lower: "moderate", full: "moderate", custom: "moderate",
    // brick
    brick: "moderate",
  };
  // Discipline normalization (codes use "run"/"bike"/"swim"/"strength"/"brick").
  const parseCode = (code) => {
    if (!code || typeof code !== "string" || code === "rest") return null;
    const dashIdx = code.indexOf("-");
    if (dashIdx < 0) return { discipline: code, load: "easy" };
    const discipline = code.slice(0, dashIdx);
    const variant = code.slice(dashIdx + 1);
    const load = VARIANT_TO_LOAD[variant] || "easy";
    return { discipline, load };
  };

  // Build a base weekly map: dow → list of {discipline, load} from codes.
  const baseByDow = {};
  Object.entries(weeklyTemplate || {}).forEach(([dayName, codes]) => {
    const dow = DOW[dayName];
    if (dow === undefined || !Array.isArray(codes)) return;
    baseByDow[dow] = [];
    codes.forEach(c => {
      const parsed = parseCode(c);
      if (parsed) baseByDow[dow].push(parsed);
    });
  });

  // Phase-specific load modulation. Applied to each day's primary session
  // (index 0 of that day's list — if a day has 2 sessions, only the first
  // one is modulated for now). Strength is never "hard", so it's pass-through.
  //
  // Brick substitutions (§6.1):
  //   Base   — no brick; substitute with easy bike (aerobic endurance)
  //   Build  — brick stays as brick (moderate)
  //   Peak   — brick at race intensity (hard)
  //   Taper  — no brick; substitute with easy bike opener
  const modulate = (phaseName, entry) => {
    if (!entry) return null;
    const { discipline, load } = entry;
    if (discipline === "brick") {
      if (phaseName === "Base")  return { discipline: "bike", load: "easy" };
      if (phaseName === "Build") return { discipline: "brick", load: "moderate" };
      if (phaseName === "Peak")  return { discipline: "brick", load: "hard" };
      if (phaseName === "Taper") return { discipline: "bike", load: "easy" };
      return { discipline: "brick", load: "moderate" };
    }
    if (discipline === "strength") {
      // Strength drops entirely in Taper, stays moderate otherwise.
      if (phaseName === "Taper") return null;
      return { discipline, load: "moderate" };
    }
    if (phaseName === "Base") {
      if (load === "hard") return { discipline, load: "moderate" };
      return { discipline, load };
    }
    if (phaseName === "Build") {
      return { discipline, load }; // honor the athlete's interval/long day as-is
    }
    if (phaseName === "Peak") {
      if (load === "moderate" && discipline !== "strength") return { discipline, load: "hard" };
      return { discipline, load };
    }
    if (phaseName === "Taper") {
      if (load === "hard" || load === "long") return { discipline, load: "easy" };
      if (load === "moderate") return { discipline, load: "easy" };
      return { discipline, load };
    }
    return { discipline, load };
  };

  // Compose the final per-phase pattern map. Emit an array of sessions per
  // DOW so two-a-day slots (e.g. mon=[swim, strength]) are preserved —
  // previously only entries[0] survived and the strength leg silently
  // dropped out of the generated plan. Consumers must iterate the array.
  const out = {};
  phases.forEach(phase => {
    const map = {};
    Object.entries(baseByDow).forEach(([dow, entries]) => {
      const modulatedList = entries
        .map(e => modulate(phase.name, e))
        .filter(Boolean);
      if (modulatedList.length) map[dow] = modulatedList;
    });
    out[phase.name] = map;
  });
  return out;
}

if (typeof window !== "undefined") {
  window.buildPatternsFromPreferences = buildPatternsFromPreferences;
}

/**
 * _buildStrengthForPlan(weekNumber, phaseName)
 * Returns { name, exercises } for a strength plan entry. Rotates through the
 * user's selected split (strengthSetup.split: "full" | "upper-lower" | "ppl" |
 * "custom") by weekNumber so adjacent strength days don't repeat. Falls back
 * to a generic Full Body template when no strengthSetup is saved.
 *
 * In Peak and Taper, strength drops to a maintenance template (fewer sets,
 * same exercises) — per §6.1 strength is 1×/week maintenance in Peak and
 * drops entirely in Taper (though we leave it as opt-in maintenance here).
 */
function _buildStrengthForPlan(weekNumber, phaseName) {
  const _STRENGTH_FALLBACK = {
    full: [
      { name: "Back Squat",            sets: 4, reps: "5-8",  weight: "" },
      { name: "Barbell Bench Press",   sets: 4, reps: "6-8",  weight: "" },
      { name: "Barbell Row",           sets: 3, reps: "8-10", weight: "" },
      { name: "Romanian Deadlift",     sets: 3, reps: "8",    weight: "" },
      { name: "Overhead Press",        sets: 3, reps: "8-10", weight: "" },
      { name: "Plank",                 sets: 3, reps: "45s",  weight: "Bodyweight" },
    ],
    push: [
      { name: "Barbell Bench Press",      sets: 4, reps: "6-8",   weight: "" },
      { name: "Overhead Press",           sets: 3, reps: "8-10",  weight: "" },
      { name: "Incline Dumbbell Press",   sets: 3, reps: "10",    weight: "" },
      { name: "Lateral Raise",            sets: 3, reps: "12-15", weight: "" },
      { name: "Tricep Pushdown",          sets: 3, reps: "12",    weight: "" },
    ],
    pull: [
      { name: "Deadlift",       sets: 4, reps: "5",     weight: "" },
      { name: "Barbell Row",    sets: 4, reps: "8",     weight: "" },
      { name: "Lat Pulldown",   sets: 3, reps: "10-12", weight: "" },
      { name: "Face Pull",      sets: 3, reps: "15",    weight: "Light cable" },
      { name: "Barbell Curl",   sets: 3, reps: "10",    weight: "" },
    ],
    legs: [
      { name: "Back Squat",            sets: 4, reps: "5-8",    weight: "" },
      { name: "Romanian Deadlift",     sets: 3, reps: "8",      weight: "" },
      { name: "Bulgarian Split Squat", sets: 3, reps: "10/leg", weight: "" },
      { name: "Hip Thrust",            sets: 3, reps: "10",     weight: "" },
      { name: "Standing Calf Raise",   sets: 4, reps: "15",     weight: "" },
    ],
    upper: [
      { name: "Barbell Bench Press", sets: 4, reps: "6-8",   weight: "" },
      { name: "Barbell Row",         sets: 4, reps: "8",     weight: "" },
      { name: "Overhead Press",      sets: 3, reps: "8-10",  weight: "" },
      { name: "Lat Pulldown",        sets: 3, reps: "10-12", weight: "" },
      { name: "Face Pull",           sets: 3, reps: "15",    weight: "Light cable" },
    ],
    lower: [
      { name: "Back Squat",          sets: 4, reps: "5-8",    weight: "" },
      { name: "Romanian Deadlift",   sets: 3, reps: "8",      weight: "" },
      { name: "Leg Press",           sets: 3, reps: "10",     weight: "" },
      { name: "Hip Thrust",          sets: 3, reps: "10",     weight: "" },
      { name: "Standing Calf Raise", sets: 4, reps: "15",     weight: "" },
    ],
  };

  let setup = {};
  try { setup = JSON.parse(localStorage.getItem("strengthSetup") || "{}") || {}; } catch {}

  const split = setup.split || "full";
  // Rotation order per split (§ common programming patterns).
  const rotations = {
    full:        ["full"],
    "upper-lower": ["upper", "lower"],
    ppl:         ["push", "pull", "legs"],
    custom:      ["full"], // TODO: pull customMuscles by day index
  };
  const rot = rotations[split] || rotations.full;
  const wn = Math.max(1, Number(weekNumber) || 1);
  const focus = rot[(wn - 1) % rot.length];

  // Maintenance cut in Peak/Taper: drop one set per exercise (§6.1 says
  // strength is maintenance-only in Peak and drops in Taper; if the athlete
  // keeps it, it should be brief).
  let exercises = (_STRENGTH_FALLBACK[focus] || _STRENGTH_FALLBACK.full).slice()
    .map(e => ({ ...e }));
  if (phaseName === "Peak" || phaseName === "Taper") {
    exercises = exercises.map(e => ({
      ...e,
      sets: Math.max(2, (typeof e.sets === "number" ? e.sets : parseInt(e.sets, 10) || 3) - 1),
    }));
  }

  const labels = { full: "Full Body", push: "Push Day", pull: "Pull Day", legs: "Leg Day", upper: "Upper Body", lower: "Lower Body" };
  return { name: labels[focus] || "Strength", exercises };
}

if (typeof window !== "undefined") {
  window._buildStrengthForPlan = _buildStrengthForPlan;
}

// ─── Workout Library integration (§9 of PLAN_GENERATOR_MASTER_SPEC) ─────────
// Maps (discipline, load) → library session_type. Returns null when the load
// doesn't map to a library-queryable type (e.g. "strides") so the generator
// falls back to its built-in templates.
function _mapToLibraryType(discipline, load, raceType) {
  if (discipline === "strength") {
    let role = null;
    try { role = localStorage.getItem("strengthRole"); } catch {}
    return role || "injury_prevention";
  }
  if (discipline === "run") {
    if (load === "easy") return "easy";
    if (load === "long") return "long";
    if (load === "moderate") return "tempo";
    if (load === "hard") {
      // §4b — 5K builds use VO2max intervals as the primary quality session,
      // longer races use tempo. Default to tempo for ambiguity.
      return raceType === "fiveK" || raceType === "tenK" ? "vo2max" : "tempo";
    }
    return null;
  }
  if (discipline === "bike") {
    if (load === "easy") return "easy";
    if (load === "long") return "long";
    if (load === "moderate") return "sweet_spot";
    if (load === "hard") return "threshold";
    return null;
  }
  if (discipline === "swim") {
    if (load === "easy") return "easy";
    if (load === "technique") return "technique";
    if (load === "moderate" || load === "hard") return "threshold";
    return null;
  }
  return null;
}

// Map race.type → library race_distances tag. null for non-race use.
function _mapRaceDistance(raceType) {
  const M = {
    ironman: "full_ironman", halfIronman: "half_ironman",
    olympic: "olympic_tri", sprint: "sprint_tri",
    marathon: "marathon", halfMarathon: "half",
    tenK: "10k", fiveK: "5k",
  };
  return M[raceType] || null;
}

// Pull a workout from the library for a given session slot, parameterize it
// against the athlete's zones + week-within-phase, and return the enriched
// payload ready to attach to the plan entry. Returns null if the library has
// no matching workout or the cache isn't loaded — the caller should fall
// back to the built-in session templates.
function _libraryWorkoutFor(opts) {
  if (typeof window === "undefined" || !window.WorkoutLibrary) return null;
  const {
    discipline, load, raceType, raceGoal, phaseName, level,
    weekInPhase, totalWeeksInPhase, isDeload, zones, recentlyUsedIds, seed,
  } = opts;

  const sessionType = _mapToLibraryType(discipline, load, raceType);
  if (!sessionType) return null;

  const pool = window.WorkoutLibrary.querySync({
    sport:        discipline,
    sessionType:  sessionType,
    phase:        String(phaseName || "").toLowerCase(),
    level:        level || "intermediate",
    raceDistance: _mapRaceDistance(raceType),
    raceGoal:     raceGoal || null,
  });
  if (!pool.length) return null;

  const picker = (typeof seed === "number")
    ? window.WorkoutLibrary.pickDeterministic
    : window.WorkoutLibrary.pick;
  const picked = picker(pool, recentlyUsedIds, seed);
  if (!picked) return null;

  return window.WorkoutLibrary.parameterize(picked, {
    zones, sport: discipline, phase: phaseName,
    weekInPhase, totalWeeksInPhase, isDeload, level,
  });
}

function _generateSingleRacePlan(race) {
  if (!race || !race.type || !race.date) return [];
  const config = RACE_CONFIGS[race.type];
  if (!config) return [];

  // ── Diagnostic snapshot ────────────────────────────────────────────────────
  // Logs what the generator can actually see at the moment it runs, so we
  // can catch race conditions where the survey/onboarding hasn't persisted
  // profile/thresholds/longDays/events before generation fires. If race.*
  // fields disagree with localStorage.profile.*, the caller persisted late.
  try {
    const _snap = (() => {
      let profile = {}, thresholds = {}, longDays = {}, events = [], schedule = [], template = null;
      try { profile    = JSON.parse(localStorage.getItem("profile") || "{}") || {}; } catch {}
      try { thresholds = JSON.parse(localStorage.getItem("thresholds") || "{}") || {}; } catch {}
      try { longDays   = JSON.parse(localStorage.getItem("longDays") || "{}") || {}; } catch {}
      try { events     = JSON.parse(localStorage.getItem("events") || "[]") || []; } catch {}
      try { schedule   = JSON.parse(localStorage.getItem("workoutSchedule") || "[]") || []; } catch {}
      try { template   = JSON.parse(localStorage.getItem("buildPlanTemplate") || "null"); } catch {}
      return {
        race: {
          id: race.id, type: race.type, sport: race.sport, level: race.level,
          daysPerWeek: race.daysPerWeek, preferredDays: race.preferredDays,
          longDay: race.longDay, date: race.date, goal: race.goal,
          hasPreferences: !!(race.preferences && race.preferences.weeklyTemplate),
          prefDaysPerWeek: race.preferences && race.preferences.daysPerWeek,
          prefLongDay: race.preferences && race.preferences.longDay,
          prefTemplateDayCount: race.preferences && race.preferences.weeklyTemplate
            ? Object.values(race.preferences.weeklyTemplate).filter(v => Array.isArray(v) && v.length).length
            : 0,
        },
        localStorage: {
          surveyComplete:       localStorage.getItem("surveyComplete"),
          profileLevel:         profile.fitnessLevel || profile.fitness_level || profile.level || null,
          profileDaysPerWeek:   profile.daysPerWeek == null ? null : profile.daysPerWeek,
          profilePreferredDays: profile.preferredDays || null,
          thresholdKeys:        Object.keys(thresholds),
          longDays,
          eventsCount:          Array.isArray(events) ? events.length : 0,
          workoutScheduleCount: Array.isArray(schedule) ? schedule.length : 0,
          buildPlanTemplateDayCount: template
            ? Object.values(template).filter(v => Array.isArray(v) && v.length).length
            : 0,
        },
      };
    })();
    console.log("[IronZ][plan-gen] generator input snapshot:", _snap);
    // Staleness sanity-checks — yell if the generator is seeing defaults.
    if (_snap.race.daysPerWeek && _snap.localStorage.profileDaysPerWeek != null
        && Number(_snap.race.daysPerWeek) !== Number(_snap.localStorage.profileDaysPerWeek)) {
      console.warn("[IronZ][plan-gen] race.daysPerWeek (" + _snap.race.daysPerWeek +
        ") disagrees with profile.daysPerWeek (" + _snap.localStorage.profileDaysPerWeek +
        ") — the survey/onboarding persisted profile AFTER calling the generator. Race object wins for this run.");
    }
    if (_snap.localStorage.surveyComplete !== "1") {
      console.warn("[IronZ][plan-gen] surveyComplete = '" + _snap.localStorage.surveyComplete +
        "' at generation time. Survey hasn't been marked complete yet — any downstream code that gates on surveyComplete will see the old value.");
    }
    if (!_snap.localStorage.thresholdKeys.length) {
      console.warn("[IronZ][plan-gen] thresholds localStorage is empty at generation time — running zones / FTP / CSS will fall back to defaults. Survey zone writes may not have landed yet.");
    }
  } catch (e) {
    console.warn("[IronZ][plan-gen] snapshot log failed:", e && e.message);
  }

  const raceDate = new Date(race.date + "T00:00:00");
  const _today = new Date();
  _today.setHours(0, 0, 0, 0);

  // Phase computation follows philosophy §4.4-4.6: phases scale as PERCENTAGES
  // of weeksToRace. Taper is capped but preserved; Peak/Build reduce before
  // Base. Plan always spans today→race day — no gap before the plan start.
  const _weeksToRace = Math.max(0, Math.ceil((raceDate - _today) / (86400000 * 7)));
  let _effectivePhases = (typeof computePhasesFromRatios === "function" && _weeksToRace >= 1)
    ? computePhasesFromRatios(race.type, _weeksToRace)
    : null;
  if (!_effectivePhases) {
    // Fallback: legacy fixed-weeks path for race types without phaseRatios.
    const _extraBaseWeeks = Math.max(0, _weeksToRace - config.totalWeeks);
    _effectivePhases = _extraBaseWeeks > 0
      ? (() => {
          const out = config.phases.map(p => ({ ...p }));
          const baseIdx = out.findIndex(p => p.name === "Base");
          if (baseIdx >= 0) out[baseIdx].weeks += _extraBaseWeeks;
          else out.unshift({ name: "Base", weeks: _extraBaseWeeks });
          return out;
        })()
      : config.phases.map(p => ({ ...p }));
  }
  const _effectiveTotalWeeks = _effectivePhases.reduce((s, p) => s + p.weeks, 0);

  const startDate = new Date(raceDate);
  startDate.setDate(startDate.getDate() - _effectiveTotalWeeks * 7);

  const plan = [];
  const todayStr = _today.toISOString().slice(0, 10);

  // ── WEEKLY PATTERN ────────────────────────────────────────────────────────
  // Priority: race.preferences.weeklyTemplate > WEEKLY_PATTERNS[raceType].
  // When the athlete supplied their own weekly template via Training Inputs,
  // we use their day-of-week → sport assignments as the scaffold and apply
  // phase-based LOAD modulation on top (§6.1 — Base easy/technique, Build
  // adds intensity, Peak adds race-pace, Taper drops volume).
  const rawPatterns = WEEKLY_PATTERNS[race.type] || {};
  const isLevelAware = rawPatterns.beginner || rawPatterns.intermediate || rawPatterns.advanced;
  const runPatternKey = isLevelAware ? getRunPatternKey(race) : null;
  const levelPatterns = isLevelAware
    ? (rawPatterns[runPatternKey] || rawPatterns.intermediate || {})
    : rawPatterns;
  const triTypes = new Set(["ironman", "halfIronman", "olympic", "sprint"]);
  const longDiscipline = triTypes.has(race.type) ? "bike" : null;

  let patterns;
  if (race.preferences && race.preferences.weeklyTemplate
      && typeof buildPatternsFromPreferences === "function") {
    patterns = buildPatternsFromPreferences(
      race.preferences.weeklyTemplate,
      _effectivePhases,
      { raceType: race.type, triTypes }
    );
  } else {
    const longDayPatterns = (race.longDay !== undefined && race.longDay !== null)
      ? applyLongDayPreference(levelPatterns, race.longDay, longDiscipline)
      : levelPatterns;
    const hasAdjustment = race.daysPerWeek || (race.unavailableDays && race.unavailableDays.length > 0);
    patterns = hasAdjustment
      ? Object.fromEntries(Object.entries(longDayPatterns).map(([ph, pat]) => [ph, adjustPatternToDays(pat, race.daysPerWeek, race.unavailableDays)]))
      : longDayPatterns;
  }

  // Pre-plan build-up: if plan start is in the future, add gentle sessions in the gap
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  if (isLevelAware && startDate > todayDate) {
    const prePlanDows = runPatternKey === "beginner" ? [2, 6] : [2, 4, 6]; // Tue+Sat or Tue+Thu+Sat
    const preCursor = new Date(todayDate);
    while (preCursor < startDate) {
      const dateStr = preCursor.toISOString().slice(0, 10);
      const dow = preCursor.getDay();
      if (prePlanDows.includes(dow) && dateStr >= todayStr) {
        const table = (RUN_DURATION_TABLES[race.type] || {})[runPatternKey] || {};
        const [startMin] = table.easy || [20, 30];
        plan.push({
          date: dateStr,
          raceId: race.id,
          phase: "Pre-Plan",
          weekNumber: 0,
          discipline: "run",
          load: "easy",
          sessionName: "Easy Run",
          duration: startMin,
        });
      }
      preCursor.setDate(preCursor.getDate() + 1);
    }
  }

  // Week numbers are computed from days-since-startDate, NOT from
  // Monday boundary crossings. Previously the week rolled over on
  // Mondays, so a plan that started mid-week (e.g. a Saturday) had
  // a 2-day "Week 1" (Sat+Sun) followed immediately by "Week 2" —
  // users saw Pre-Plan Week 0 jump straight to Base Week 2 with
  // no visible Week 1.
  let weekNumber = 1;
  let phaseWeekCount = 0;
  let phaseIndex = 0;
  let currentPhase = _effectivePhases[0];
  const _planStartMs = new Date(startDate).setHours(0, 0, 0, 0);
  const _weekNumberFor = (d) => {
    const ms = new Date(d).setHours(0, 0, 0, 0);
    const days = Math.floor((ms - _planStartMs) / 86400000);
    return Math.max(1, Math.floor(days / 7) + 1);
  };

  // ── WORKOUT LIBRARY CONTEXT ────────────────────────────────────────────────
  // Load thresholds + compute zones once per plan generation so every session
  // lookup reuses the same athlete context. `level` feeds library filtering;
  // `zones` drives parameterization of main_set zone placeholders.
  let _libThresholds = {};
  let _libZones = null;
  let _libLevel = "intermediate";
  let _libRaceGoal = race.goal || race.runGoal || null;
  const _libRecentIds = []; // grows as we pick workouts within this generation
  // Use loadFromStorage so we pick up the app's actual training-zones data
  // (localStorage.trainingZones.running.referenceTime + vdot) not just a
  // hypothetical localStorage.thresholds key.
  try {
    if (typeof window !== "undefined" && window.TrainingZones && window.TrainingZones.loadFromStorage) {
      _libThresholds = window.TrainingZones.loadFromStorage();
    } else {
      _libThresholds = JSON.parse(localStorage.getItem("thresholds") || "{}") || {};
    }
  } catch {}
  try {
    if (typeof window !== "undefined" && window.TrainingZones) {
      _libZones = window.TrainingZones.computeAllZones(_libThresholds);
      const perSport = {
        run:  window.TrainingZones.classifyRunning(_libThresholds),
        bike: window.TrainingZones.classifyCycling(_libThresholds, race.weightKg || (function(){
          try { const p = JSON.parse(localStorage.getItem("profile") || "{}"); return p.weight ? Number(p.weight) * 0.453592 : null; } catch { return null; }
        })()),
        swim: window.TrainingZones.classifySwim(_libThresholds),
      };
      const derived = window.TrainingZones.overallLevel(perSport);
      if (derived) _libLevel = derived;
    }
    if (race && race.level) _libLevel = String(race.level).toLowerCase();
  } catch {}

  // ── THRESHOLD WEEK SCHEDULING ──────────────────────────────────────────────
  // Added 2026-04-09 (PHILOSOPHY_UPDATE_2026-04-09_threshold_weeks.md).
  // Pure deterministic call into ThresholdWeekScheduler — no API calls.
  const _twSportProfile = triTypes.has(race.type) ? "triathlon" : "endurance";
  let _scheduledThresholdWeeks = [];
  try {
    let _profile = {};
    let _userData = {};
    try { _profile = JSON.parse(localStorage.getItem("profile") || "{}"); } catch {}
    try { _userData = JSON.parse(localStorage.getItem("user_data") || "{}"); } catch {}
    const _profileForScheduling = Object.assign({}, _profile, {
      goal_race_date: race.date,
      active_goal: race.type,
      threshold_week_cadence_override:
        _profile.threshold_week_cadence_override || _userData.threshold_week_cadence_override,
    });
    const _lastThresh = _userData.last_threshold_week_date || null;
    if (typeof window !== "undefined" && window.ThresholdWeekScheduler) {
      _scheduledThresholdWeeks = window.ThresholdWeekScheduler.listThresholdWeeksForPlan(
        _profileForScheduling, startDate, raceDate, _lastThresh
      );
    }
  } catch (e) {
    console.warn("[IronZ] threshold-week scheduling skipped:", e.message);
  }

  const cursor = new Date(startDate);

  while (cursor < raceDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const dow = cursor.getDay(); // 0=Sun … 6=Sat

    // Advance phase if needed
    if (phaseWeekCount >= currentPhase.weeks) {
      phaseIndex++;
      if (phaseIndex < _effectivePhases.length) {
        currentPhase = _effectivePhases[phaseIndex];
      }
      phaseWeekCount = 0;
    }

    const phaseName = currentPhase ? currentPhase.name : "Taper";
    const phasePattern = patterns[phaseName] || {};
    // phasePattern[dow] is either a legacy single {discipline, load} or
    // (from buildPatternsFromPreferences) an array of sessions so two-a-day
    // slots (e.g. mon=[swim, strength]) can both make it into the plan.
    const _rawPatternSession = phasePattern[dow];
    const _patternSessionList = Array.isArray(_rawPatternSession)
      ? _rawPatternSession
      : (_rawPatternSession ? [_rawPatternSession] : []);
    // `session` kept for the race-week / threshold-week overrides below,
    // which were written against the single-session legacy shape and only
    // need to know whether *any* session was scheduled. The multi-session
    // branch lower down iterates _patternSessionList directly.
    const session = _patternSessionList[0] || null;

    // ── Race-week override (Philosophy §6.1 / §4.5 / §4.6) ───────────────────
    // The last 6 days before the race get a dedicated pattern so every
    // day has a short, very light session instead of pure rest. Race day
    // itself is appended after the loop as a dedicated entry.
    const _daysToRace = Math.floor((raceDate - cursor) / 86400000);
    let _rwSession = null;
    if (_daysToRace >= 1 && _daysToRace <= 6) {
      const sportFam = _raceWeekSportFamily(race.type);
      const rwPattern = RACE_WEEK_PATTERNS[sportFam] || RACE_WEEK_PATTERNS.running;
      _rwSession = rwPattern[_daysToRace] || null;
    }

    // ── Threshold-week override ──────────────────────────────────────────────
    let _twOverride = null;
    if (!_rwSession && _scheduledThresholdWeeks.length && typeof window !== "undefined" && window.ThresholdWeekScheduler) {
      const TW = window.ThresholdWeekScheduler;
      const monday = TW.mondayOf(cursor);
      if (TW.shouldThisBeAThresholdWeek(monday, _scheduledThresholdWeeks)) {
        const days = TW.buildThresholdWeekDays(monday, _twSportProfile);
        _twOverride = days.find(d => d.date === dateStr) || null;
      }
    }

    if (_rwSession && dateStr >= todayStr) {
      const sessionDef = (SESSION_DESCRIPTIONS[_rwSession.discipline] || {})[_rwSession.load];
      const duration = sessionDef ? sessionDef.duration : undefined;
      const name = (sessionDef && sessionDef.name) || `Race-Week ${capitalize(_rwSession.discipline)}`;
      plan.push({
        date: dateStr,
        raceId: race.id,
        phase: "Race Week",
        weekNumber: _weekNumberFor(cursor),
        discipline: _rwSession.discipline,
        load: _rwSession.load,
        sessionName: name,
        ...(duration != null ? { duration } : {}),
      });
    } else if (_twOverride && dateStr >= todayStr) {
      const TW = window.ThresholdWeekScheduler;
      const isTri = _twSportProfile === "triathlon";
      const t = _twOverride.type;
      const isTestDay = t === "test" || t === "swim_test" || t === "bike_test" || t === "run_test";
      const discipline =
        t === "easy_swim" || t === "swim_test" ? "swim" :
        t === "easy_bike" || t === "bike_test" ? "bike" :
        t === "rest" ? "rest" : "run";
      const testType =
        t === "swim_test" ? "SWIM_CSS" :
        t === "bike_test" ? "BIKE_FTP_20" :
        t === "run_test"  ? "RUN_5K_TT" :
        t === "test"      ? "RUN_5K_TT" : null;
      // Apply 60-70% volume target to non-test sessions; tests keep their template length.
      const duration = isTestDay
        ? _twOverride.duration_min
        : (t === "rest" ? undefined : TW.applyThresholdWeekVolume(_twOverride.duration_min, 0.65));
      plan.push({
        date: dateStr,
        raceId: race.id,
        phase: "Threshold",
        weekNumber,
        discipline,
        load: isTestDay ? "test" : (t === "rest" ? "rest" : "easy"),
        sessionName: _twOverride.note,
        ...(duration != null ? { duration } : {}),
        isThresholdWeek: true,
        isThresholdTest: isTestDay,
        thresholdTestType: testType,
        thresholdNote: _twOverride.note,
      });
    } else if (_patternSessionList.length && dateStr >= todayStr) {
      const LOAD_NAMES = { easy: "Easy", strides: "Strides", moderate: "Tempo", hard: "Threshold", long: "Long" };
      const wNum = _weekNumberFor(cursor);
      weekNumber = wNum;
      const _phaseWeeks = (currentPhase && currentPhase.weeks) || 1;
      const _weekInPhase = phaseWeekCount + 1;
      const _isDeload = (_weekInPhase % 4 === 0);
      _patternSessionList.forEach((sessionEntry, sessionIdx) => {
        const loadName  = LOAD_NAMES[sessionEntry.load] || capitalize(sessionEntry.load);
        const duration = (sessionEntry.discipline === "run" && runPatternKey)
          ? getRunSessionDuration(race.type, sessionEntry.load, phaseName, wNum, _effectiveTotalWeeks, runPatternKey)
          : undefined;

        // Strength plan entries need an `exercises` array — the render path
        // keys off that, so an empty strength entry appears as a blank card.
        // Session label uses the strength focus (Push / Pull / Legs / Full)
        // rather than "Tempo Strength" since intensity labels don't apply to
        // lifting. The exercises list rotates through the user's selected
        // split so adjacent strength days don't repeat the same template.
        let strengthExercises = null;
        let strengthName = null;
        if (sessionEntry.discipline === "strength") {
          const built = _buildStrengthForPlan(wNum, phaseName);
          strengthExercises = built.exercises;
          strengthName = built.name;
        }

        const baseEntry = {
          date: dateStr,
          raceId: race.id,
          phase: phaseName,
          weekNumber: wNum,
          discipline: sessionEntry.discipline,
          load: sessionEntry.load,
          sessionName: sessionEntry.discipline === "strength"
            ? (strengthName || "Strength Training")
            : `${loadName} ${capitalize(sessionEntry.discipline)}`,
          ...(duration != null ? { duration } : {}),
        };
        if (strengthExercises && strengthExercises.length) {
          baseEntry.type = "weightlifting";
          baseEntry.exercises = strengthExercises;
        }

        // Workout library lookup — §9d. Seed includes the session index so
        // two-a-day slots (e.g. mon=[swim, strength]) get independent
        // library picks instead of two copies of the same workout.
        const _seedForSlot = (function(){
          const s = (race.id || "") + "|" + dateStr + "|" + sessionIdx;
          let h = 0;
          for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
          return Math.abs(h);
        })();
        const _libWorkout = _libraryWorkoutFor({
          discipline:          sessionEntry.discipline,
          load:                sessionEntry.load,
          raceType:            race.type,
          raceGoal:            _libRaceGoal,
          phaseName:           phaseName,
          level:               _libLevel,
          weekInPhase:         _weekInPhase,
          totalWeeksInPhase:   _phaseWeeks,
          isDeload:            _isDeload,
          zones:               _libZones,
          recentlyUsedIds:     _libRecentIds,
          seed:                _seedForSlot,
        });
        if (_libWorkout) {
          baseEntry.libraryWorkout = _libWorkout;
          baseEntry.sessionName = _libWorkout.libraryName || baseEntry.sessionName;
          if (_libWorkout.duration_min) baseEntry.duration = _libWorkout.duration_min;
          if (sessionEntry.discipline === "strength"
              && _libWorkout.main_set
              && Array.isArray(_libWorkout.main_set.exercises)
              && _libWorkout.main_set.exercises.length) {
            // Map library exercises into the plan-entry shape. Pipe through
            // _personalizeWeights so qualitative labels ("heavy",
            // "moderate-heavy barbell") become real pounds when the
            // athlete has entered bench/squat/deadlift/ohp/row in
            // trainingZones.strength. Without those inputs the qualitative
            // label stays as a hint.
            let _libExercises = _libWorkout.main_set.exercises.map(ex => ({
              name:   ex.name,
              sets:   Array.isArray(ex.sets) ? (ex.sets_actual || ex.sets[0]) : ex.sets,
              reps:   ex.reps,
              weight: ex.load || "",
              notes:  ex.notes || "",
            }));
            if (typeof window !== "undefined" && typeof window._personalizeWeights === "function") {
              try { _libExercises = window._personalizeWeights(_libExercises); } catch {}
            }
            baseEntry.exercises = _libExercises;
          }
          _libRecentIds.push(_libWorkout.workoutId);
          if (_libRecentIds.length > 50) _libRecentIds.splice(0, _libRecentIds.length - 50);
        }

        plan.push(baseEntry);
      });
    }

    // Advance day; phase tracking still pivots on Mondays so each
    // phase occupies complete calendar weeks.
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() === 1) {
      phaseWeekCount++;
    }
  }

  // Add race day itself
  const raceDateStr = race.date;
  plan.push({
    date: raceDateStr,
    raceId: race.id,
    phase: "Race",
    weekNumber,
    discipline: "race",
    load: "race",
    sessionName: `${ICONS.flag} ${race.name} — RACE DAY`,
    details: "Give it everything. You've earned this.",
  });

  if (typeof trackPlanGenerated === "function") {
    trackPlanGenerated({
      plan_type: "race",
      race_type: race.type,
      duration_weeks: _effectiveTotalWeeks,
      level: race.level,
    });
  }

  return plan;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

// ─── Daily nutrition target ───────────────────────────────────────────────────

// Endurance races that glycogen-deplete and benefit from carb-loading.
// Short races (sprint tri, 5K, 10K) finish before glycogen limits matter and
// are excluded so taper fuel doesn't unnecessarily spike.
const _CARB_LOAD_RACE_TYPES = new Set([
  "ironman", "halfIronman", "olympic",
  "marathon", "halfMarathon",
  "centuryRide", "granFondo",
]);

/**
 * getCarbLoadInfo(dateStr, entry)
 * Returns { isCarbLoad, daysToRace, gramsPerKg, raceType } when dateStr falls
 * in the carb-loading window of an endurance race (T-3 through T-1, with
 * T-3=8 g/kg, T-2=9 g/kg, T-1=10 g/kg). Otherwise returns null.
 *
 * Keyed off the plan entry's raceId (or the nearest upcoming event), so it
 * works even on a day that doesn't have a Race Week session.
 */
function getCarbLoadInfo(dateStr, entry) {
  try {
    const events = loadEvents();
    if (!Array.isArray(events) || !events.length) return null;

    // Prefer the race this entry belongs to — otherwise fall back to the
    // soonest upcoming endurance race whose carb-load window covers dateStr.
    let race = null;
    if (entry && entry.raceId) {
      race = events.find(e => String(e.id) === String(entry.raceId)) || null;
    }
    if (!race) {
      const candidates = events
        .filter(e => e && e.date && e.type && _CARB_LOAD_RACE_TYPES.has(e.type))
        .sort((a, b) => a.date.localeCompare(b.date));
      for (const e of candidates) {
        const diff = Math.round((new Date(e.date + "T00:00:00") - new Date(dateStr + "T00:00:00")) / 86400000);
        if (diff >= 1 && diff <= 3) { race = e; break; }
      }
    }
    if (!race || !_CARB_LOAD_RACE_TYPES.has(race.type)) return null;

    const daysToRace = Math.round(
      (new Date(race.date + "T00:00:00") - new Date(dateStr + "T00:00:00")) / 86400000
    );
    // Only T-3 through T-1 get the load. Race day itself uses the race multiplier.
    const rampByDays = { 3: 8, 2: 9, 1: 10 };
    const gramsPerKg = rampByDays[daysToRace];
    if (!gramsPerKg) return null;
    return { isCarbLoad: true, daysToRace, gramsPerKg, raceType: race.type };
  } catch {
    return null;
  }
}

/**
 * isCarbLoadDay(dateStr)
 * Public helper used by UI to label a meal-plan day as "Carb Load".
 */
function isCarbLoadDay(dateStr) {
  const plan  = (typeof loadTrainingPlan === "function") ? loadTrainingPlan() : [];
  const entry = plan.find(e => e.date === dateStr);
  const info  = getCarbLoadInfo(dateStr, entry);
  return !!(info && info.isCarbLoad);
}

/**
 * getBaseNutritionTarget(dateStr)
 * Returns macro targets personalised to the user's profile (weight, height, age, gender)
 * using the Mifflin-St Jeor BMR equation + per-load activity multipliers.
 * Falls back to generic NUTRITION_TARGETS if profile is incomplete.
 *
 * Carb-loading override: on T-3/T-2/T-1 before an endurance race, carbs are
 * pinned to 8/9/10 g/kg bodyweight, fat is reduced to ~20% of calories, and
 * protein is held at the training-day level. Total calories rise accordingly.
 */
function getBaseNutritionTarget(dateStr) {
  const plan  = loadTrainingPlan();
  const entry = plan.find(e => e.date === dateStr);
  const load  = entry ? entry.load : "rest";
  const carbLoad = getCarbLoadInfo(dateStr, entry);

  let profile = {};
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}

  const weightLbs = parseFloat(profile.weight);
  const heightIn  = parseFloat(profile.height);
  const age       = parseInt(profile.age);

  if (weightLbs > 0 && heightIn > 0 && age > 0) {
    const weightKg = weightLbs * 0.453592;
    const heightCm = heightIn  * 2.54;

    // Protein baseline — ~0.9 g per lb for athletes, held through the carb load
    // so we're not cutting recovery nutrients during taper.
    const protein = Math.round(weightLbs * 0.9 / 5) * 5;

    if (carbLoad) {
      const carbs = Math.round(weightKg * carbLoad.gramsPerKg / 5) * 5;
      // Fat at 20% of calories: cal = (proteinCal + carbCal) / 0.80; fat = 0.20*cal/9
      const nonFatCal = protein * 4 + carbs * 4;
      const calories = Math.round((nonFatCal / 0.80) / 50) * 50;
      const fat = Math.round((calories - nonFatCal) / 9 / 5) * 5;
      return {
        calories,
        protein,
        carbs: Math.max(carbs, 50),
        fat: Math.max(fat, 20),
        carbLoad: true,
        carbLoadDaysToRace: carbLoad.daysToRace,
        carbLoadGramsPerKg: carbLoad.gramsPerKg,
      };
    }

    // Mifflin-St Jeor BMR
    const bmr = profile.gender === "female"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
      : 10 * weightKg + 6.25 * heightCm - 5 * age + 5; // male / default

    const multipliers = { rest: 1.3, easy: 1.55, moderate: 1.65, hard: 1.8, long: 1.9, race: 2.1 };
    const calories = Math.round(bmr * (multipliers[load] || 1.3) / 50) * 50;

    // Fat: 28% of calories
    const fat     = Math.round(calories * 0.28 / 9 / 5) * 5;
    // Carbs: remaining calories
    const carbs   = Math.round((calories - protein * 4 - fat * 9) / 4 / 5) * 5;

    return { calories, protein, carbs: Math.max(carbs, 50), fat: Math.max(fat, 20) };
  }

  // Generic fallback — assume a 70 kg (154 lb) reference athlete for the
  // carb-load ramp so users without a profile still get appropriate targets.
  if (carbLoad) {
    const refKg = 70;
    const carbs = Math.round(refKg * carbLoad.gramsPerKg / 5) * 5;
    const protein = 140;
    const nonFatCal = protein * 4 + carbs * 4;
    const calories = Math.round((nonFatCal / 0.80) / 50) * 50;
    const fat = Math.round((calories - nonFatCal) / 9 / 5) * 5;
    return {
      calories, protein,
      carbs: Math.max(carbs, 50),
      fat: Math.max(fat, 20),
      carbLoad: true,
      carbLoadDaysToRace: carbLoad.daysToRace,
      carbLoadGramsPerKg: carbLoad.gramsPerKg,
    };
  }
  return { ...NUTRITION_TARGETS[load] || NUTRITION_TARGETS.rest };
}

if (typeof window !== "undefined") {
  window.getCarbLoadInfo = getCarbLoadInfo;
  window.isCarbLoadDay = isCarbLoadDay;
}

/**
 * getDailyNutritionTarget(dateStr)
 * Returns macro targets for a date, applying any user slider adjustments first.
 *
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {Object} { calories, protein, carbs, fat }
 */
function getDailyNutritionTarget(dateStr) {
  try {
    const adjustments = JSON.parse(localStorage.getItem("nutritionAdjustments")) || {};
    if (adjustments[dateStr]) return adjustments[dateStr];
  } catch { /* ignore */ }
  return getBaseNutritionTarget(dateStr);
}

// ─── Edit state ──────────────────────────────────────────────────────────────

// ─── Race Form (multi-step) ───────────────────────────────────────────────────

const RACE_SPORT_OPTS = [
  { value: "triathlon", icon: ICONS.swim, label: "Triathlon",  desc: "Swim · Bike · Run events" },
  { value: "running",   icon: ICONS.run,  label: "Running",    desc: "Races or training for life" },
  { value: "cycling",   icon: ICONS.bike, label: "Cycling",    desc: "Races or training for life" },
  { value: "swimming",  icon: ICONS.swim, label: "Swimming",   desc: "Training for life" },
  { value: "hyrox",     icon: ICONS.trophy, label: "Hyrox", desc: "Run + functional fitness race" },
];

let raceFormState = {
  step: 1, sport: null, type: null,
  savedName: "", savedDate: "", savedLevel: "intermediate", savedPriority: "A", savedLongDay: "",
  savedRunGoal: null, savedReturningFromInjury: null, savedDaysPerWeek: null, savedUnavailableDays: null,
  savedLifeGoal: null, savedLifeLevel: null, savedLifeStart: null, savedLifeDuration: null, savedLifeDays: null,
};

function _rfDaysRec() {
  return computeRunDaysRecommendation(
    raceFormState.savedLevel || "intermediate",
    raceFormState.savedRunGoal,
    raceFormState.savedReturningFromInjury
  );
}

function _rfSaveStep3FormState() {
  raceFormState.savedName     = document.getElementById("race-name")?.value     ?? raceFormState.savedName;
  raceFormState.savedDate     = document.getElementById("race-date")?.value     ?? raceFormState.savedDate;
  raceFormState.savedLevel    = document.getElementById("race-level")?.value    ?? raceFormState.savedLevel;
  raceFormState.savedPriority = document.getElementById("race-priority")?.value ?? raceFormState.savedPriority;
  raceFormState.savedLongDay  = document.getElementById("race-long-day")?.value ?? raceFormState.savedLongDay;
  const slider = document.getElementById("rf-days-slider");
  if (slider) raceFormState.savedDaysPerWeek = parseInt(slider.value);
}

function _rfShowError(msg) {
  const el = document.getElementById("rf-val-msg");
  if (el) el.textContent = msg;
}

function _rfValidateStep3AndNext() {
  _rfSaveStep3FormState();
  const date = raceFormState.savedDate;
  if (!date) { _rfShowError("Please set a race date to continue."); return; }
  if (new Date(date + "T00:00:00") <= new Date()) { _rfShowError("Race date must be in the future."); return; }
  if (raceFormState.savedPriority === "A") {
    const todayStr = new Date().toISOString().slice(0, 10);
    const allRaces = (() => { try { return JSON.parse(localStorage.getItem("events")) || []; } catch { return []; } })();
    const existingA = allRaces.find(r => (r.priority || "A").toUpperCase() === "A" && r.id !== _editingRaceId && r.date >= todayStr);
    if (existingA) {
      const existingName = existingA.name || existingA.type;
      const newName = raceFormState.savedName || raceFormState.type || "this race";
      const msg = `You already have an upcoming A race: ${existingName}.\n\nAdd "${newName}" as a B race instead? Your training plan will stay built around ${existingName} and will factor in ${newName} that week.\n\n(Cancel to go back and edit your existing A race first.)`;
      if (!confirm(msg)) return;
      raceFormState.savedPriority = "B";
    }
  }
  raceFormState.step = 4;
  renderRaceForm();
}

function rfSetRunGoal(value) {
  raceFormState.savedRunGoal = value;
  raceFormState.savedDaysPerWeek = null; // reset to new recommendation
  raceFormState.step = 5;
  renderRaceForm();
}

function rfSetInjury(value) {
  raceFormState.savedReturningFromInjury = value;
  raceFormState.savedDaysPerWeek = null; // reset to new recommendation
  renderRaceForm(); // re-render step 5 to update rec
}

function renderRaceForm() {
  const c = document.getElementById("race-form-container");
  if (!c) return;
  if      (raceFormState.step === 1)      c.innerHTML = _rfStep1();
  else if (raceFormState.step === 2)      c.innerHTML = _rfStep2();
  else if (raceFormState.step === "life") c.innerHTML = _rfStepLife();
  else if (raceFormState.step === 3)      c.innerHTML = _rfStep3();
  else if (raceFormState.step === 4)      c.innerHTML = raceFormState.sport === "running" ? _rfStep4() : raceFormState.sport === "triathlon" ? _rfStep4Tri() : _rfStep4General();
  else                                    c.innerHTML = _rfStep5();
}

function _rfStep1() {
  return `
    <div class="rf-step">
      <p class="hint" style="margin-bottom:14px">Build a training plan — for a race or just for life.</p>
      <div class="sv-option-list">
        ${RACE_SPORT_OPTS.map(s => `
          <button class="sv-option-card ${raceFormState.sport === s.value ? "is-selected" : ""}"
            onclick="rfSelectSport('${s.value}')">
            <span class="sv-option-icon">${s.icon}</span>
            <div class="sv-option-text">
              <div class="sv-option-label">${s.label}</div>
              <div class="sv-option-desc">${s.desc}</div>
            </div>
            <span class="sv-check">✓</span>
          </button>`).join("")}
        <button class="sv-option-card" onclick="rfOpenCustomPlan()">
          <span class="sv-option-icon">${ICONS.pencil}</span>
          <div class="sv-option-text">
            <div class="sv-option-label">Create Your Own</div>
            <div class="sv-option-desc">Build a custom weekly plan from scratch</div>
          </div>
          <span class="sv-check">✓</span>
        </button>
      </div>
    </div>`;
}

function rfOpenCustomPlan() {
  openBuildPlanTab('custom');
}

function _rfStep2() {
  const allOpts = (typeof SURVEY_RACE_OPTIONS !== "undefined" ? SURVEY_RACE_OPTIONS : [])
    .filter(r => r.sport === raceFormState.sport);
  const lifeOpts = allOpts.filter(r => r.value.startsWith("life-"));
  const raceOpts = allOpts.filter(r => !r.value.startsWith("life-"));
  const renderCard = r => `
    <button class="sv-race-card ${raceFormState.type === r.value ? "is-selected" : ""}"
      onclick="rfSelectType('${r.value}')">
      <span class="sv-race-icon">${r.icon}</span>
      <span class="sv-race-label">${r.label}</span>
      <span class="sv-race-desc">${r.desc}</span>
    </button>`;
  return `
    <div class="rf-step">
      <button class="rf-back-btn" onclick="rfBack()">← Back</button>
      ${lifeOpts.length ? `
        <div class="sv-race-grid" style="margin-top:12px">
          ${lifeOpts.map(renderCard).join("")}
        </div>
        ${raceOpts.length ? `<p style="text-align:center;color:var(--color-text-muted);font-size:0.8rem;margin:14px 0 10px">or pick a race distance</p>` : ""}
      ` : ""}
      ${raceOpts.length ? `
        <div class="sv-race-grid"${lifeOpts.length ? "" : ' style="margin-top:12px"'}>
          ${raceOpts.map(renderCard).join("")}
        </div>
      ` : ""}
    </div>`;
}

function _rfStep3() {
  const s = raceFormState;
  const longDayLabel = s.sport === "running" ? "Long Run Day" : "Long Ride Day";
  const sel = (v, cmp) => v === cmp ? "selected" : "";
  const isRunning = s.sport === "running";
  const isTri = s.sport === "triathlon";
  const ctaBtn = isRunning
    ? `<button class="btn-primary" onclick="_rfValidateStep3AndNext()" style="margin-top:16px">Next →</button>`
    : isTri
    ? `<button class="btn-primary" onclick="_rfValidateStep3AndNextTri()" style="margin-top:16px">Next →</button>`
    : `<button class="btn-primary" onclick="_rfValidateStep3AndNextGeneral()" style="margin-top:16px">Next →</button>`;
  return `
    <div class="rf-step">
      <button class="rf-back-btn" onclick="rfBack()">← Back</button>
      <input type="hidden" id="race-type" value="${s.type || ""}" />
      <div class="form-row" style="margin-top:12px">
        <label for="race-name">Race Name <span class="sv-optional">optional</span></label>
        <input type="text" id="race-name" placeholder="e.g. Boston Marathon 2026" value="${_escapeHtml(s.savedName)}" />
      </div>
      <div class="form-row">
        <label for="race-date">Race Date</label>
        <input type="date" id="race-date" value="${s.savedDate}" />
      </div>
      <div class="form-grid">
        <div class="form-row">
          <label for="race-level">Fitness Level</label>
          <select id="race-level">
            <option value="beginner" ${sel(s.savedLevel,"beginner")}>Beginner</option>
            <option value="intermediate" ${sel(s.savedLevel,"intermediate")}>Intermediate</option>
            <option value="advanced" ${sel(s.savedLevel,"advanced")}>Advanced</option>
          </select>
        </div>
        <div class="form-row">
          <label for="race-priority">Race Priority</label>
          <select id="race-priority">
            <option value="A" ${sel(s.savedPriority,"A")}>A Race — Primary goal</option>
            <option value="B" ${sel(s.savedPriority,"B")}>B Race — Secondary / tune-up</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <label for="race-long-day">${longDayLabel}</label>
        <select id="race-long-day">
          <option value="">Default (Saturday)</option>
          <option value="0" ${sel(s.savedLongDay,"0")}>Sunday</option>
          <option value="1" ${sel(s.savedLongDay,"1")}>Monday</option>
          <option value="2" ${sel(s.savedLongDay,"2")}>Tuesday</option>
          <option value="3" ${sel(s.savedLongDay,"3")}>Wednesday</option>
          <option value="4" ${sel(s.savedLongDay,"4")}>Thursday</option>
          <option value="5" ${sel(s.savedLongDay,"5")}>Friday</option>
          <option value="6" ${sel(s.savedLongDay,"6")}>Saturday</option>
        </select>
      </div>
      <p id="rf-val-msg" class="rf-val-msg"></p>
      ${ctaBtn}
    </div>`;
}

function _rfStep4() {
  const s = raceFormState;
  const opts = [
    { value: "finish",  icon: ICONS.flag,   label: "Finish",            desc: "Complete the race" },
    { value: "time",    icon: ICONS.clock,  label: "Hit a time goal",  desc: "Target a specific finishing time" },
    { value: "compete", icon: ICONS.trophy, label: "Compete / podium", desc: "Racing to win or place" },
  ];
  return `
    <div class="rf-step">
      <button class="rf-back-btn" onclick="rfBack()">← Back</button>
      <h3 class="sv-question" style="margin:12px 0 6px">What's your goal for this race?</h3>
      <p class="hint" style="margin-bottom:12px">This shapes how sessions are structured and how hard your plan pushes.</p>
      <div class="sv-option-list">
        ${opts.map(o => `
          <button class="sv-option-card ${s.savedRunGoal === o.value ? "is-selected" : ""}" onclick="rfSetRunGoal('${o.value}')">
            <span class="sv-option-icon">${o.icon}</span>
            <div class="sv-option-text">
              <div class="sv-option-label">${o.label}</div>
              <div class="sv-option-desc">${o.desc}</div>
            </div>
            <span class="sv-check">✓</span>
          </button>`).join("")}
      </div>
    </div>`;
}

function _rfStep5() {
  const s = raceFormState;
  const rec = _rfDaysRec();
  const daysValue = s.savedDaysPerWeek || rec;
  const marks = [3,4,5,6,7].map(n =>
    `<span class="sv-slider-mark ${n === rec ? "sv-slider-mark--rec" : ""}">${n}</span>`
  ).join("");
  const injuryOpts = [
    { value: false, icon: ICONS.check,       label: "No — training consistently" },
    { value: true,  icon: ICONS.alertCircle, label: "Yes — easing back in" },
  ];
  return `
    <div class="rf-step">
      <button class="rf-back-btn" onclick="rfBack()">← Back</button>
      <h3 class="sv-question" style="margin:12px 0 6px">Returning from injury or long break?</h3>
      <p class="hint" style="margin-bottom:12px">Returning athletes need slower progression to rebuild tissue tolerance safely.</p>
      <div class="sv-option-list" style="margin-bottom:24px">
        ${injuryOpts.map(o => `
          <button class="sv-option-card ${s.savedReturningFromInjury === o.value ? "is-selected" : ""}" onclick="rfSetInjury(${o.value})">
            <span class="sv-option-icon">${o.icon}</span>
            <div class="sv-option-text">
              <div class="sv-option-label">${o.label}</div>
            </div>
            <span class="sv-check">✓</span>
          </button>`).join("")}
      </div>
      <h3 class="sv-question" style="margin-bottom:6px">Training days per week?</h3>
      <p class="hint" style="margin-bottom:8px">Recommended: <strong>${rec} days</strong> based on your level and goal.</p>
      <div class="sv-slider-wrap">
        <div class="sv-slider-value" id="rf-days-display">${daysValue} days / week</div>
        <input type="range" class="sv-slider" id="rf-days-slider"
          min="3" max="7" step="1" value="${daysValue}"
          oninput="raceFormState.savedDaysPerWeek=parseInt(this.value); document.getElementById('rf-days-display').textContent=this.value+' days / week'" />
        <div class="sv-slider-marks">${marks}</div>
      </div>
      <p id="rf-val-msg" class="rf-val-msg"></p>
      <button class="btn-primary" onclick="saveRace()" style="margin-top:24px">${_editingRaceId ? "Update Race" : "Generate Plan"}</button>
      ${_editingRaceId ? `<button class="btn-secondary" onclick="_cancelEditRace()" style="margin-left:8px">Cancel Edit</button>` : ""}
    </div>`;
}

function _rfStepLife() {
  const s = raceFormState;
  const sport = (s.type || "").replace("life-", "");
  const sportLabel = sport.charAt(0).toUpperCase() + sport.slice(1);
  const sel = (v, cmp) => v === cmp ? "selected" : "";
  const lifeGoal = s.savedLifeGoal || "base-building";
  const lifeLevel = s.savedLifeLevel || "beginner";
  const lifeDuration = s.savedLifeDuration || "8";
  const lifeDays = s.savedLifeDays || [1, 3, 5]; // Mon, Wed, Fri defaults
  const lifeStart = s.savedLifeStart || new Date().toISOString().slice(0, 10);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayChips = [1,2,3,4,5,6,0].map(d =>
    `<input type="checkbox" id="rf-life-day-${d}" value="${d}" ${lifeDays.includes(d) ? "checked" : ""} /><label for="rf-life-day-${d}" class="day-chip">${dayNames[d]}</label>`
  ).join("");

  return `
    <div class="rf-step">
      <button class="rf-back-btn" onclick="rfBack()">← Back</button>
      <p class="hint" style="margin:12px 0 14px">Structured ${sportLabel.toLowerCase()} plan — no race required.</p>

      <div class="form-row">
        <label for="rf-life-goal">Goal</label>
        <select id="rf-life-goal">
          <option value="base-building" ${sel(lifeGoal,"base-building")}>Build a base (increase weekly volume)</option>
          <option value="speed" ${sel(lifeGoal,"speed")}>Get faster (speed work focus)</option>
          <option value="endurance" ${sel(lifeGoal,"endurance")}>Go longer (distance focus)</option>
          <option value="consistency" ${sel(lifeGoal,"consistency")}>Stay consistent (maintain fitness)</option>
        </select>
      </div>

      <div class="form-row">
        <label for="rf-life-level">Current Level</label>
        <select id="rf-life-level">
          <option value="beginner" ${sel(lifeLevel,"beginner")}>Beginner (just starting out)</option>
          <option value="recreational" ${sel(lifeLevel,"recreational")}>Recreational (1-3x/week casually)</option>
          <option value="intermediate" ${sel(lifeLevel,"intermediate")}>Intermediate (consistent 3-4x/week)</option>
          <option value="advanced" ${sel(lifeLevel,"advanced")}>Advanced (5+ sessions/week, structured)</option>
        </select>
      </div>

      <div class="form-row">
        <label>Days per Week</label>
        <div class="day-picker" id="rf-life-day-picker">${dayChips}</div>
      </div>

      <div class="form-grid">
        <div class="form-row">
          <label for="rf-life-start">Start Date</label>
          <input type="date" id="rf-life-start" value="${lifeStart}" />
        </div>
        <div class="form-row">
          <label for="rf-life-duration">Duration</label>
          <select id="rf-life-duration">
            <option value="4" ${sel(lifeDuration,"4")}>4 weeks</option>
            <option value="8" ${sel(lifeDuration,"8")}>8 weeks</option>
            <option value="12" ${sel(lifeDuration,"12")}>12 weeks</option>
            <option value="indefinite" ${sel(lifeDuration,"indefinite")}>Ongoing</option>
          </select>
        </div>
      </div>

      <p id="rf-life-msg" class="save-msg"></p>
      <button class="btn-primary" style="width:100%;margin-top:12px" onclick="saveLifePlanFromForm()">Generate Plan</button>
      <div id="rf-life-preview"></div>
    </div>`;
}

function saveLifePlanFromForm() {
  const sport = (raceFormState.type || "").replace("life-", "");
  const goal = document.getElementById("rf-life-goal")?.value || "base-building";
  const level = document.getElementById("rf-life-level")?.value || "beginner";
  const startDate = document.getElementById("rf-life-start")?.value || "";
  const duration = document.getElementById("rf-life-duration")?.value || "8";
  const checked = document.querySelectorAll("#rf-life-day-picker input:checked");
  const selectedDays = Array.from(checked).map(el => parseInt(el.value));

  // Save state for back navigation
  raceFormState.savedLifeGoal = goal;
  raceFormState.savedLifeLevel = level;
  raceFormState.savedLifeStart = startDate;
  raceFormState.savedLifeDuration = duration;
  raceFormState.savedLifeDays = selectedDays;

  // Delegate to generateLifePlan with params
  generateLifePlan({
    sport, goal, level, startDate, duration, selectedDays,
    msgEl: document.getElementById("rf-life-msg"),
    previewEl: document.getElementById("rf-life-preview"),
  });
}

function _rfValidateStep3AndNextTri() {
  _rfSaveStep3FormState();
  const date = raceFormState.savedDate;
  if (!date) { _rfShowError("Please set a race date to continue."); return; }
  if (new Date(date + "T00:00:00") <= new Date()) { _rfShowError("Race date must be in the future."); return; }
  if (raceFormState.savedPriority === "A") {
    const todayStr = new Date().toISOString().slice(0, 10);
    const allRaces = (() => { try { return JSON.parse(localStorage.getItem("events")) || []; } catch { return []; } })();
    const existingA = allRaces.find(r => (r.priority || "A").toUpperCase() === "A" && r.id !== _editingRaceId && r.date >= todayStr);
    if (existingA) {
      const existingName = existingA.name || existingA.type;
      const newName = raceFormState.savedName || raceFormState.type || "this race";
      const msg = `You already have an upcoming A race: ${existingName}.\n\nAdd "${newName}" as a B race instead? Your training plan will stay built around ${existingName} and will factor in ${newName} that week.\n\n(Cancel to go back and edit your existing A race first.)`;
      if (!confirm(msg)) return;
      raceFormState.savedPriority = "B";
    }
  }
  raceFormState.step = 4;
  renderRaceForm();
}

function _rfStep4Tri() {
  const s = raceFormState;
  const rec = s.savedLevel === "advanced" ? 7 : s.savedLevel === "beginner" ? 5 : 6;
  const daysValue = s.savedDaysPerWeek || rec;
  const marks = [3,4,5,6,7].map(n =>
    `<span class="sv-slider-mark ${n === rec ? "sv-slider-mark--rec" : ""}">${n}</span>`
  ).join("");
  return `
    <div class="rf-step">
      <button class="rf-back-btn" onclick="rfBack()">← Back</button>
      <h3 class="sv-question" style="margin:12px 0 6px">Training days per week?</h3>
      <p class="hint" style="margin-bottom:8px">Recommended: <strong>${rec} days</strong> based on your fitness level. Triathlon benefits from 6–7 days to balance swim, bike, run, and brick sessions.</p>
      <div class="sv-slider-wrap">
        <div class="sv-slider-value" id="rf-days-display">${daysValue} days / week</div>
        <input type="range" class="sv-slider" id="rf-days-slider"
          min="3" max="7" step="1" value="${daysValue}"
          oninput="raceFormState.savedDaysPerWeek=parseInt(this.value); document.getElementById('rf-days-display').textContent=this.value+' days / week'" />
        <div class="sv-slider-marks">${marks}</div>
      </div>
      <p id="rf-val-msg" class="rf-val-msg"></p>
      <button class="btn-primary" onclick="saveRace()" style="margin-top:24px">${_editingRaceId ? "Update Race" : "Generate Plan"}</button>
      ${_editingRaceId ? `<button class="btn-secondary" onclick="_cancelEditRace()" style="margin-left:8px">Cancel Edit</button>` : ""}
    </div>`;
}

function _rfValidateStep3AndNextGeneral() {
  _rfSaveStep3FormState();
  const date = raceFormState.savedDate;
  if (!date) { _rfShowError("Please set a race date to continue."); return; }
  if (new Date(date + "T00:00:00") <= new Date()) { _rfShowError("Race date must be in the future."); return; }
  if (raceFormState.savedPriority === "A") {
    const todayStr = new Date().toISOString().slice(0, 10);
    const allRaces = (() => { try { return JSON.parse(localStorage.getItem("events")) || []; } catch { return []; } })();
    const existingA = allRaces.find(r => (r.priority || "A").toUpperCase() === "A" && r.id !== _editingRaceId && r.date >= todayStr);
    if (existingA) {
      const existingName = existingA.name || existingA.type;
      const newName = raceFormState.savedName || raceFormState.type || "this race";
      const msg = `You already have an upcoming A race: ${existingName}.\n\nAdd "${newName}" as a B race instead? Your training plan will stay built around ${existingName} and will factor in ${newName} that week.\n\n(Cancel to go back and edit your existing A race first.)`;
      if (!confirm(msg)) return;
      raceFormState.savedPriority = "B";
    }
  }
  raceFormState.step = 4;
  renderRaceForm();
}

function _rfStep4General() {
  const s = raceFormState;
  const rec = s.savedLevel === "advanced" ? 6 : s.savedLevel === "beginner" ? 4 : 5;
  if (!s.savedDaysPerWeek) s.savedDaysPerWeek = rec;
  const daysValue = s.savedDaysPerWeek;
  const marks = [3,4,5,6,7].map(n =>
    `<span class="sv-slider-mark ${n === rec ? "sv-slider-mark--rec" : ""}">${n}</span>`
  ).join("");
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const unavail = s.savedUnavailableDays || [];
  const dayBtns = dayNames.map((name, i) => {
    const isOff = unavail.includes(i);
    return `<button class="rf-day-btn${isOff ? " rf-day-off" : ""}" data-dow="${i}" onclick="_rfToggleUnavailDay(${i})">${name}</button>`;
  }).join("");
  return `
    <div class="rf-step">
      <button class="rf-back-btn" onclick="rfBack()">← Back</button>
      <h3 class="sv-question" style="margin:12px 0 6px">Training days per week?</h3>
      <p class="hint" style="margin-bottom:8px">Recommended: <strong>${rec} days</strong> based on your fitness level.</p>
      <div class="sv-slider-wrap">
        <div class="sv-slider-value" id="rf-days-display">${daysValue} days / week</div>
        <input type="range" class="sv-slider" id="rf-days-slider"
          min="3" max="7" step="1" value="${daysValue}"
          oninput="raceFormState.savedDaysPerWeek=parseInt(this.value); document.getElementById('rf-days-display').textContent=this.value+' days / week'" />
        <div class="sv-slider-marks">${marks}</div>
      </div>
      <h3 class="sv-question" style="margin:20px 0 6px">Any days you can't train?</h3>
      <p class="hint" style="margin-bottom:8px">Tap to mark days off. We'll avoid scheduling sessions on those days.</p>
      <div class="rf-day-picker">${dayBtns}</div>
      <p id="rf-val-msg" class="rf-val-msg"></p>
      <button class="btn-primary" onclick="saveRace()" style="margin-top:24px">${_editingRaceId ? "Update Race" : "Generate Plan"}</button>
      ${_editingRaceId ? `<button class="btn-secondary" onclick="_cancelEditRace()" style="margin-left:8px">Cancel Edit</button>` : ""}
    </div>`;
}

function _rfToggleUnavailDay(dow) {
  if (!raceFormState.savedUnavailableDays) raceFormState.savedUnavailableDays = [];
  const arr = raceFormState.savedUnavailableDays;
  const idx = arr.indexOf(dow);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(dow);
  // Re-render just the buttons
  const btns = document.querySelectorAll(".rf-day-btn");
  btns.forEach(btn => {
    const d = parseInt(btn.dataset.dow);
    btn.classList.toggle("rf-day-off", arr.includes(d));
  });
}

function rfSelectSport(sport) {
  raceFormState.sport = sport;
  raceFormState.type  = null;
  if (sport === "swimming") {
    // Swimming only has life training — skip step 2
    raceFormState.type = "life-swimming";
    raceFormState.step = "life";
  } else {
    raceFormState.step = 2;
  }
  renderRaceForm();
}

function rfSelectType(type) {
  raceFormState.type = type;
  raceFormState.step = type.startsWith("life-") ? "life" : 3;
  renderRaceForm();
}

function rfBack() {
  if (raceFormState.step === 5) raceFormState.step = 4;
  else if (raceFormState.step === 4) {
    const slider = document.getElementById("rf-days-slider");
    if (slider) raceFormState.savedDaysPerWeek = parseInt(slider.value);
    raceFormState.step = 3;
  }
  else if (raceFormState.step === 3) { _rfSaveStep3FormState(); raceFormState.step = 2; }
  else if (raceFormState.step === "life") raceFormState.step = raceFormState.sport === "swimming" ? 1 : 2;
  else raceFormState.step = 1;
  renderRaceForm();
}

// ─── Gym / Strength toggle ────────────────────────────────────────────────────

const GYM_STRENGTH_TYPES = ["weightlifting", "bodyweight", "hiit", "general", "yoga"];

function loadGymStrengthEnabled() {
  const val = localStorage.getItem("gymStrengthEnabled");
  return val === null ? true : val === "1";
}

function setGymStrengthEnabled(enabled) {
  localStorage.setItem("gymStrengthEnabled", enabled ? "1" : "0"); if (typeof DB !== 'undefined') DB.syncKey('gymStrengthEnabled');
  const toggle = document.getElementById("gym-strength-toggle");
  if (toggle) toggle.checked = enabled;

  if (!enabled) {
    // Remove all generated gym/strength schedule entries
    let schedule = [];
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}
    const filtered = schedule.filter(e => !(e.source === "generated" && GYM_STRENGTH_TYPES.includes(e.type)));
    localStorage.setItem("workoutSchedule", JSON.stringify(filtered)); if (typeof DB !== 'undefined') DB.syncSchedule();
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof renderTrainingConflicts === "function") renderTrainingConflicts();
  }

  // Re-render the Gym & Strength card body to show enabled/disabled state
  _renderGymStrengthBody();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
}

function _renderGymStrengthBody() {
  // The card body content in index.html stays static; we show/hide the form via CSS class on the section
  const section = document.getElementById("section-generate-plan");
  if (!section) return;
  const enabled = loadGymStrengthEnabled();
  section.classList.toggle("gym-disabled", !enabled);
}

function initGymStrengthToggle() {
  const toggle = document.getElementById("gym-strength-toggle");
  if (toggle) toggle.checked = loadGymStrengthEnabled();
  _renderGymStrengthBody();
}

let _editingRaceId = null;

// ─── Save / delete race ───────────────────────────────────────────────────────

/**
 * saveRace()
 * Reads form inputs, validates, generates plan, persists to localStorage.
 * When _editingRaceId is set, updates the existing race instead of creating a new one.
 */
function saveRace() {
  // Step 3 DOM elements may not exist when called from step 5; fall back to raceFormState
  const name       = (document.getElementById("race-name")?.value ?? raceFormState.savedName ?? "").trim();
  const type       = document.getElementById("race-type")?.value || raceFormState.type || "";
  const level      = document.getElementById("race-level")?.value || raceFormState.savedLevel || "intermediate";
  const priority   = document.getElementById("race-priority")?.value || raceFormState.savedPriority || "A";
  const date       = document.getElementById("race-date")?.value || raceFormState.savedDate || "";
  const longDayRaw = document.getElementById("race-long-day")?.value ?? raceFormState.savedLongDay ?? "";
  const longDay    = longDayRaw !== "" ? parseInt(longDayRaw) : null;

  const msgEl = document.getElementById("race-save-msg");
  const showErr = (msg) => { _rfShowError(msg); if (msgEl) { msgEl.textContent = msg; msgEl.style.color = "var(--color-danger)"; } };

  if (!type || !date) {
    showErr("Please set a race date before generating your plan.");
    return;
  }

  const today = new Date();
  const raceDate = new Date(date + "T00:00:00");
  if (raceDate <= today) {
    showErr("Race date must be in the future.");
    return;
  }

  // A-race uniqueness: only one upcoming A race allowed at a time. If the
  // user tries to add a second A race, offer to save the new one as a B
  // race instead of rejecting outright — that way the existing A race
  // keeps its training plan as the primary build, and the new event is
  // added as a secondary goal the plan can factor into its taper /
  // recovery logic on that week. The user can still cancel and edit the
  // other race first if they really meant to swap A races.
  let effectivePriority = priority;
  if (priority === "A") {
    const todayStr = new Date().toISOString().slice(0, 10);
    const allRaces = (() => { try { return JSON.parse(localStorage.getItem("events")) || []; } catch { return []; } })();
    const existingA = allRaces.find(r => (r.priority || "A").toUpperCase() === "A" && r.id !== _editingRaceId && r.date >= todayStr);
    if (existingA) {
      const existingName = existingA.name || existingA.type;
      const newName = name || type;
      const msg = `You already have an upcoming A race: ${existingName}.\n\nAdd "${newName}" as a B race instead? Your training plan will stay built around ${existingName} and will factor in ${newName} that week.\n\n(Cancel to go back and edit your existing A race first.)`;
      if (!confirm(msg)) return;
      effectivePriority = "B";
      // Reflect the demotion in the form state so the saved race record
      // and any subsequent renders see the B priority.
      raceFormState.savedPriority = "B";
      const prioritySelect = document.getElementById("race-priority");
      if (prioritySelect) prioritySelect.value = "B";
    }
  }

  // Conflict check: warn if an active workout schedule of the same category exists
  if (!_editingRaceId) {
    const raceCat = TRAINING_CATEGORY[type];
    if (raceCat) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const schedule = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
      const conflictingType = schedule.find(s => s.date > todayStr && TRAINING_CATEGORY[s.type] === raceCat);
      if (conflictingType) {
        const catLabel = CATEGORY_LABELS[raceCat] || raceCat;
        if (!confirm(`You already have an active ${catLabel} workout schedule. Adding a race plan for the same sport may cause overtraining. Add the race anyway?`)) return;
      }
    }
  }

  // Capture current slider value before reading raceFormState
  const rfSlider = document.getElementById("rf-days-slider");
  if (rfSlider) raceFormState.savedDaysPerWeek = parseInt(rfSlider.value);
  const isRunning = raceFormState.sport === "running";

  // Collect race details (location, elevation, temp, notes)
  const raceLocation = document.getElementById("race-location")?.value?.trim() || raceFormState.savedLocation || "";
  const raceElevation = document.getElementById("race-elevation")?.value || raceFormState.savedElevation || "";
  const raceTemp = document.getElementById("race-temp")?.value || raceFormState.savedTemp || "";
  const raceCourseNotes = document.getElementById("race-notes")?.value?.trim() || raceFormState.savedCourseNotes || "";

  const race = {
    id: _editingRaceId || Date.now().toString(),
    name,
    type,
    level,
    priority: effectivePriority,
    date,
    longDay,
    ...(raceLocation && { location: raceLocation }),
    ...(raceElevation && { elevation: parseInt(raceElevation) }),
    ...(raceTemp && { avgTemp: parseInt(raceTemp) }),
    ...(raceCourseNotes && { courseNotes: raceCourseNotes }),
    ...(isRunning && raceFormState.savedRunGoal !== null       && { runGoal: raceFormState.savedRunGoal }),
    ...(isRunning && raceFormState.savedReturningFromInjury !== null && { returningFromInjury: raceFormState.savedReturningFromInjury }),
    ...(raceFormState.savedDaysPerWeek && { daysPerWeek: raceFormState.savedDaysPerWeek }),
    ...(raceFormState.savedUnavailableDays && raceFormState.savedUnavailableDays.length > 0 && { unavailableDays: raceFormState.savedUnavailableDays }),
    createdAt: new Date().toISOString(),
  };

  // Generate and save plan (always regenerate on save/update)
  const newEntries = generateTrainingPlan(race);
  const existingPlan = loadTrainingPlan().filter(e => e.raceId !== race.id);
  saveTrainingPlanData([...existingPlan, ...newEntries]);

  // Save event (replace if editing, append if new)
  const events = loadEvents().filter(e => e.id !== race.id);
  events.push(race);
  saveEvents(events);

  const verb = _editingRaceId ? "updated" : "saved";

  // Determine plan type for philosophy
  const _triRaces = ["ironman", "halfIronman", "olympic", "sprint"];
  const _runRaces = ["marathon", "halfMarathon", "tenK", "fiveK"];
  const _cycleRaces = ["centuryRide", "granFondo"];
  const _pType = _triRaces.includes(type) ? "triathlon" : _runRaces.includes(type) ? "running" : _cycleRaces.includes(type) ? "cycling" : "general";

  msgEl.innerHTML = `
    <div style="text-align:center;padding:4px 0">
      <div style="font-weight:600;color:var(--color-success);margin-bottom:10px">${name} ${verb}! ${newEntries.length} training sessions generated.</div>
      <p style="color:var(--color-text-muted);font-size:0.82rem;margin:0 0 10px">Want to understand why your plan is structured this way?</p>
      <button class="tb-info-btn" onclick="if(typeof showTrainingPhilosophy==='function')showTrainingPhilosophy('${_pType}');this.closest('div').parentElement.innerHTML=''">See Training Philosophy</button>
      <button class="btn-secondary" style="margin-left:6px;font-size:0.78rem;padding:4px 12px" onclick="this.closest('div').parentElement.innerHTML=''">Dismiss</button>
    </div>`;
  msgEl.style.color = "";
  setTimeout(() => msgEl.scrollIntoView({ behavior: "smooth", block: "center" }), 100);

  // Reset edit state and form
  _cancelEditRace();

  renderRaceEvents();
  renderTrainingConflicts();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
  if (typeof renderTrainingBlocksSection === "function") renderTrainingBlocksSection();
}

/**
 * Opens the Build-a-Plan flow (bp-v2-5 Weekly Schedule) pre-loaded with
 * the user's current schedule and race context. This is the preferred
 * race edit surface — it lets users actually modify the weekly layout
 * instead of just race metadata (name/date/etc., which editEvent still
 * handles via the banner + A-race promotion flow).
 */
function editRaceSchedule(id) {
  if (!window.OnboardingV2 || typeof window.OnboardingV2.openBuildPlanEdit !== "function") {
    // Fallback to the metadata editor if onboarding module isn't loaded.
    return editEvent(id);
  }
  // openBuildPlanEdit pulls raceEvents, selectedSports, thresholds, etc.
  // from localStorage — the race we're editing is already there, so we
  // don't need to pass its id through. The flow lands on bp-v2-5 with
  // the user's saved buildPlanTemplate pre-filled.
  window.OnboardingV2.openBuildPlanEdit(null);
}

/** Opens a clean edit modal for an existing race */
function editEvent(id) {
  const race = loadEvents().find(e => e.id === id);
  if (!race) return;

  const cfg = RACE_CONFIGS[race.type] || {};
  const sel = (cur, val) => cur === val ? "selected" : "";
  const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  let overlay = document.getElementById("edit-race-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "edit-race-overlay";
  overlay.className = "quick-entry-overlay is-open";
  overlay.style.cssText = "display:flex;z-index:10001";
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="quick-entry-modal edit-race-modal" style="max-width:460px;padding:24px">
      <h3 style="margin:0 0 4px">Edit Race</h3>
      <p style="margin:0 0 18px;color:var(--color-text-muted);font-size:0.82rem">${cfg.label || race.type}</p>

      <div class="form-row" style="margin-bottom:12px">
        <label>Race Name</label>
        <input type="text" id="edit-race-name" value="${_escapeHtml(race.name || "")}" placeholder="e.g. Boston Marathon 2026" />
      </div>

      <div class="form-row" style="margin-bottom:12px">
        <label>Race Date</label>
        <input type="date" id="edit-race-date" value="${race.date || ""}" />
      </div>

      <div class="form-grid" style="margin-bottom:12px">
        <div class="form-row">
          <label>Goal</label>
          <select id="edit-race-goal">
            <option value="finish"  ${sel(race.runGoal, "finish")}>Finish</option>
            <option value="time"    ${sel(race.runGoal, "time")}>Time goal</option>
            <option value="compete" ${sel(race.runGoal, "compete")}>Compete</option>
          </select>
        </div>
        <div class="form-row">
          <label>Priority</label>
          <select id="edit-race-priority">
            <option value="A" ${sel(race.priority, "A")}>A race</option>
            <option value="B" ${sel(race.priority, "B")}>B race</option>
          </select>
        </div>
      </div>

      <div class="form-grid" style="margin-bottom:12px">
        <div class="form-row">
          <label>Days / week</label>
          <select id="edit-race-days">
            <option value="">Default</option>
            ${[3,4,5,6,7].map(n => `<option value="${n}" ${race.daysPerWeek === n ? "selected" : ""}>${n} days</option>`).join("")}
          </select>
        </div>
        <div class="form-row">
          <label>Long session day</label>
          <select id="edit-race-longday">
            <option value="">Default (Sat)</option>
            ${DOW_LABELS.map((d, i) => `<option value="${i}" ${race.longDay === i ? "selected" : ""}>${d}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="form-row" style="margin-bottom:16px">
        <label>Days off <span style="color:var(--color-text-muted);font-weight:500">(can't train)</span></label>
        <div class="edit-race-dow-grid" id="edit-race-unavail-days">
          ${DOW_LABELS.map((d, i) => {
            const isOff = race.unavailableDays && race.unavailableDays.includes(i);
            return `<button type="button" class="edit-race-dow-btn${isOff ? " is-off" : ""}" data-dow="${i}" onclick="this.classList.toggle('is-off')">${d.slice(0,3)}</button>`;
          }).join("")}
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn-primary" style="flex:1" onclick="_saveEditedRace('${race.id}')">Save changes</button>
        <button class="btn-secondary" style="flex:1" onclick="document.getElementById('edit-race-overlay').remove()">Cancel</button>
      </div>
      <p id="edit-race-msg" class="save-msg" style="margin-top:8px"></p>
    </div>
  `;

  document.body.appendChild(overlay);
}

function _saveEditedRace(raceId) {
  const events = loadEvents();
  const race = events.find(e => e.id === raceId);
  if (!race) return;

  race.name = document.getElementById("edit-race-name")?.value.trim() || race.name;
  race.date = document.getElementById("edit-race-date")?.value || race.date;
  // Goal replaced the removed Level dropdown — keep runGoal as the
  // canonical field so generateTrainingPlan still sees it.
  const goalVal = document.getElementById("edit-race-goal")?.value;
  if (goalVal) race.runGoal = goalVal;
  race.priority = document.getElementById("edit-race-priority")?.value || race.priority;

  const days = document.getElementById("edit-race-days")?.value;
  race.daysPerWeek = days ? parseInt(days) : race.daysPerWeek;

  const longDay = document.getElementById("edit-race-longday")?.value;
  race.longDay = longDay !== "" ? parseInt(longDay) : race.longDay;

  // Read unavailable days from the new grid of toggle buttons
  const unavailBtns = document.querySelectorAll("#edit-race-unavail-days .edit-race-dow-btn.is-off");
  const unavailDays = Array.from(unavailBtns).map(btn => parseInt(btn.dataset.dow));
  race.unavailableDays = unavailDays.length > 0 ? unavailDays : undefined;

  saveEvents(events);

  // Regenerate training plan for this race
  const newEntries = typeof generateTrainingPlan === "function" ? generateTrainingPlan(race) : [];
  const existingPlan = loadTrainingPlan().filter(e => e.raceId !== raceId);
  saveTrainingPlanData([...existingPlan, ...newEntries]);

  document.getElementById("edit-race-overlay")?.remove();

  if (typeof renderRaceEvents === "function") renderRaceEvents();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
  if (typeof renderTrainingBlocksSection === "function") renderTrainingBlocksSection();
  if (typeof renderCalendar === "function") renderCalendar();
}

function _cancelEditRace() {
  _editingRaceId = null;
  raceFormState = { step: 1, sport: null, type: null, savedName: "", savedDate: "", savedLevel: "intermediate", savedPriority: "A", savedLongDay: "", savedRunGoal: null, savedReturningFromInjury: null, savedDaysPerWeek: null, savedUnavailableDays: null };
  renderRaceForm();
}

/**
 * deleteEvent(id)
 * Removes a race event and all its associated plan entries.
 *
 * @param {string} id - race id
 */
function deleteEvent(id) {
  const deleted = loadEvents().find(e => e.id === id);
  const events = loadEvents().filter(e => e.id !== id);
  saveEvents(events);

  const plan = loadTrainingPlan().filter(e => e.raceId !== id);
  saveTrainingPlanData(plan);

  // Same cascade into workoutSchedule that removeTrainingInput runs — keeps
  // past sessions (completion history) and drops today/future entries that
  // were generated for this race. Today is kept only if already completed.
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const meta = typeof loadCompletionMeta === "function" ? loadCompletionMeta() : {};
    const existingSched = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
    const filteredSched = existingSched.filter(e => {
      if (!e || e.raceId !== id) return true;
      if (e.date < todayStr) return true;
      if (e.date === todayStr) {
        const sessionId = `session-sw-${e.id}`;
        return !!meta[sessionId];
      }
      return false;
    });
    if (filteredSched.length !== existingSched.length) {
      localStorage.setItem("workoutSchedule", JSON.stringify(filteredSched));
      if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
    }
  } catch (e) { console.warn("[deleteEvent] workoutSchedule scrub failed", e && e.message); }

  // Also scrub the Build Plan flow's own race store (localStorage.raceEvents)
  // so the deleted race can't leak back through state restore the next time
  // openBuildPlan() loads _state.currentRace from raceEvents[0]. Without
  // this, deleting a race from the Active Training Inputs trash icon would
  // re-surface it on the next Build Plan open and could be re-written into
  // `events` on the next _confirmAndSavePlan.
  try {
    const raw = localStorage.getItem("raceEvents");
    if (raw) {
      const arr = JSON.parse(raw) || [];
      const filtered = arr.filter(r => {
        if (!r) return false;
        if (r.id === id) return false;
        if (deleted && r.name === deleted.name && r.date === deleted.date) return false;
        return true;
      });
      if (filtered.length !== arr.length) {
        localStorage.setItem("raceEvents", JSON.stringify(filtered));
        if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("raceEvents");
      }
    }
  } catch (e) { console.warn("[deleteEvent] raceEvents scrub failed", e && e.message); }

  // Run the promotion + plan-integrity check after every deletion, not
  // just A-race deletions. Legacy data can have two A races; if the user
  // deletes the one whose id the plan entries were attributed to, the
  // surviving A race has no training entries and the calendar goes
  // empty. checkARacePromotion now regenerates for any A race that's
  // missing a plan, and promotes from B/C when no A survives.
  checkARacePromotion();

  renderRaceEvents();
  renderTrainingConflicts();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
  if (typeof renderTrainingBlocksSection === "function") renderTrainingBlocksSection();
  if (typeof renderCalendar === "function") renderCalendar();
}

// ─── Render race events list ─────────────────────────────────────────────────

const DISCIPLINE_ICONS = {
  swim:         ICONS.swim,
  bike:         ICONS.bike,
  run:          ICONS.run,
  brick:        ICONS.brick,
  circuit:      ICONS.circuit,
  race:         ICONS.flag,
  weightlifting:ICONS.weights,
  bodyweight:   ICONS.bodyweight,
  cycling:      ICONS.bike,
  running:      ICONS.run,
  swimming:     ICONS.swim,
  triathlon:    ICONS.swim,
  general:      ICONS.activity,
  hiit:         ICONS.flame || ICONS.zap,
  hyrox:        ICONS.trophy,
  hyroxStrength:ICONS.weights,
  yoga:         ICONS.yoga,
  rowing:       ICONS.rowing,
  walking:      ICONS.walking,
  walk:         ICONS.walking,
  hiking:       ICONS.walking,
  hike:         ICONS.walking,
  sauna:        ICONS.thermometer,
  stairstepper: ICONS.steps,
  wellness:     ICONS.droplet,
};

// Small "Next Race" banner that sits at the top of the Training tab so
// the user's most imminent race is always visible while they're looking
// at their training inputs. Moved out of the Stats tab on 2026-04-15 —
// Stats now shows a Completed Races trophy case instead.
function renderNextRaceBanner() {
  const container = document.getElementById("training-next-race-banner");
  if (!container) return;
  const events = loadEvents();
  const todayStr = (typeof getTodayString === "function") ? getTodayString() : new Date().toISOString().slice(0, 10);
  const upcoming = events
    .filter(e => e.date && e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!upcoming.length) {
    container.innerHTML = "";
    return;
  }
  const race = upcoming[0];
  const daysAway = Math.ceil((new Date(race.date + "T00:00:00") - new Date()) / 86400000);
  const cfg = RACE_CONFIGS[race.type] || {};
  const iconHtml = (typeof ICONS !== "undefined" && ICONS.flag) ? ICONS.flag : "";
  const extras = upcoming.slice(1);
  // The "+N more" badge now expands an inline list below the banner
  // showing every additional upcoming race, each clickable to open
  // its edit modal. stopPropagation prevents the parent banner's
  // onclick (which jumps to the Training tab) from firing.
  const extraBadge = extras.length > 0
    ? `<span class="next-race-banner-extra" onclick="event.stopPropagation();toggleNextRaceExtras()">+${extras.length} more</span>`
    : "";
  const countdownLabel = daysAway === 0 ? "Race day" : daysAway === 1 ? "1 day to go" : `${daysAway} days to go`;

  const extrasHtml = extras.map(r => {
    const rcfg = RACE_CONFIGS[r.type] || {};
    const rDays = Math.ceil((new Date(r.date + "T00:00:00") - new Date()) / 86400000);
    const rLabel = rDays === 0 ? "Race day" : rDays === 1 ? "1 day" : `${rDays} days`;
    const rPriority = (r.priority || "A").toUpperCase();
    return `
      <div class="next-race-banner-extra-row" onclick="event.stopPropagation();editEvent('${r.id}')">
        <span class="next-race-extra-priority priority-${rPriority.toLowerCase()}">${rPriority}</span>
        <div class="next-race-extra-text">
          <div class="next-race-extra-name">${_escapeHtml(r.name || rcfg.label || r.type)}</div>
          <div class="next-race-extra-meta">${_escapeHtml(rcfg.label || r.type)} · ${formatDisplayDate(r.date)}</div>
        </div>
        <span class="next-race-extra-days">${rLabel}</span>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="next-race-banner-wrap">
      <div class="next-race-banner" onclick="showTab('training');toggleSection('section-build-plan',true)">
        <span class="next-race-banner-icon">${iconHtml}</span>
        <div class="next-race-banner-text">
          <div class="next-race-banner-name">${_escapeHtml(race.name)}</div>
          <div class="next-race-banner-meta">${_escapeHtml(cfg.label || race.type)} · ${formatDisplayDate(race.date)}</div>
        </div>
        <div class="next-race-banner-countdown">${countdownLabel}</div>
        ${extraBadge}
      </div>
      ${extras.length > 0 ? `<div class="next-race-banner-extras" id="next-race-banner-extras" style="display:none">${extrasHtml}</div>` : ""}
    </div>
  `;
}

function toggleNextRaceExtras() {
  const el = document.getElementById("next-race-banner-extras");
  if (!el) return;
  el.style.display = el.style.display === "none" ? "" : "none";
}

function renderRaceEvents() {
  // Keep the Next Race banner in sync whenever the race list is rerendered.
  try { renderNextRaceBanner(); } catch {}
  const container = document.getElementById("race-events-list");
  if (!container) return;

  // The Build a Plan list is for races that still need a training plan —
  // i.e. upcoming events. Past races (date < today, OR explicitly flagged
  // isPastRace via the Add Past Race trophy-case flow) belong in the
  // Stats trophy case, not here, so filter them out.
  const todayStr = (typeof getTodayString === "function") ? getTodayString() : new Date().toISOString().slice(0, 10);
  const events = loadEvents().filter(e => !e.isPastRace && e.date && e.date >= todayStr);
  if (events.length === 0) {
    container.innerHTML = `<p class="empty-msg">No upcoming races. Add your next event above to build a plan!</p>`;
    return;
  }

  const today = new Date();
  const upcoming = events
    .map(e => ({ ...e, dateObj: new Date(e.date + "T00:00:00") }))
    .sort((a, b) => a.dateObj - b.dateObj);

  const goalLabels = { finish: "Finish", time: "Time goal", compete: "Compete" };

  container.innerHTML = upcoming.map(race => {
    const daysAway = Math.ceil((race.dateObj - today) / (1000 * 60 * 60 * 24));
    const config = RACE_CONFIGS[race.type] || {};
    const isPast = daysAway < 0;
    const label = isPast ? `${Math.abs(daysAway)} days ago` : `${daysAway} days away`;
    const priority = race.priority || "A";

    const tags = [
      capitalize(race.level),
      race.daysPerWeek ? `${race.daysPerWeek}× / week` : null,
      race.runGoal ? goalLabels[race.runGoal] : null,
    ].filter(Boolean).map(t => `<span class="race-tag">${t}</span>`).join("");

    return `
      <div class="race-card ${isPast ? "race-past" : ""}">
        <div class="race-card-top">
          <span class="race-priority-badge priority-${priority.toLowerCase()}">${priority} Race</span>
          <div class="ti-card-actions">
            <button class="ti-edit-btn" onclick="editRaceSchedule('${race.id}')" title="Edit race schedule">Edit</button>
            <button class="delete-btn" onclick="deleteEvent('${race.id}')" title="Delete race"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>
        </div>
        <div class="race-card-name">${race.name}</div>
        <div class="race-card-meta">${config.label || race.type}</div>
        ${race.location ? `<div class="race-card-detail">${race.location}</div>` : ""}
        ${race.elevation ? `<div class="race-card-detail">Elevation: +${race.elevation} ft</div>` : ""}
        ${race.avgTemp ? `<div class="race-card-detail">Avg Temp: ${race.avgTemp}°F</div>` : ""}
        ${race.courseNotes ? `<div class="race-card-detail" style="font-style:italic">${_escapeHtml(race.courseNotes)}</div>` : ""}
        ${tags ? `<div class="race-tags">${tags}</div>` : ""}
        <div class="race-card-footer">
          <span class="race-date-badge">${formatDisplayDate(race.date)}</span>
          <span class="race-countdown ${isPast ? "past" : ""}">${label}</span>
          ${typeof renderTrainingPhilosophyButton === "function" ? renderTrainingPhilosophyButton(race.type === "triathlon" || race.type === "olympic-tri" || race.type === "half-ironman" || race.type === "ironman" ? "triathlon" : race.type === "marathon" || race.type === "half-marathon" || race.type === "10k" || race.type === "5k" ? "running" : race.type === "century" || race.type === "gran-fondo" ? "cycling" : "general") : ""}
        </div>
      </div>`;
  }).join("");
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}


/* =====================================================================
   TRAINING BLOCKS EXPLAINED — helps beginners understand plan phases
   ===================================================================== */

const TRAINING_BLOCK_INFO = {
  running: {
    title: "Your Running Plan Structure",
    blocks: [
      { name: "BASE", weeks: "1-5", focus: "Building your aerobic engine",
        desc: "Easy, conversational-pace miles to build endurance safely.",
        why: "Your body needs time to adapt tendons, ligaments, and cardiovascular system.",
        feel: "Like it's \"too easy\" — that's the point!" },
      { name: "BUILD", weeks: "6-10", focus: "Adding speed and strength",
        desc: "Introducing tempo runs, intervals, and longer long runs.",
        why: "Now that your base is set, your body can handle harder efforts.",
        feel: "Challenged but recovering between sessions." },
      { name: "PEAK", weeks: "11-14", focus: "Race-specific fitness",
        desc: "Highest volume and intensity weeks, race-pace practice.",
        why: "Sharpening your fitness to be race-ready.",
        feel: "Tired — this is normal and expected." },
      { name: "TAPER", weeks: "15-16", focus: "Rest and ready",
        desc: "Reducing volume while maintaining some intensity.",
        why: "Your body needs 10-14 days to fully absorb training and arrive fresh.",
        feel: "Antsy, maybe sluggish — totally normal, your body is storing energy." }
    ]
  },
  cycling: {
    title: "Your Cycling Plan Structure",
    blocks: [
      { name: "BASE", weeks: "1-4", focus: "Aerobic foundation",
        desc: "Long steady rides, building time in the saddle.",
        why: "Develops fat-burning efficiency and cardiovascular capacity.",
        feel: "Easy and sustainable — zone 2 focus." },
      { name: "BUILD", weeks: "5-8", focus: "Strength & threshold",
        desc: "Sweet spot intervals, tempo efforts, and climbing.",
        why: "Raises your FTP and ability to sustain power.",
        feel: "Legs burning on intervals but recovering between rides." },
      { name: "PEAK", weeks: "9-12", focus: "Race sharpening",
        desc: "VO2max intervals, race simulations, high intensity.",
        why: "Fine-tuning top-end fitness for event performance.",
        feel: "Fatigued but powerful — trust the process." },
      { name: "TAPER", weeks: "13-14", focus: "Fresh legs",
        desc: "Reduced volume, a few sharp efforts to stay activated.",
        why: "Lets accumulated fatigue dissipate before race day.",
        feel: "Restless — that's a good sign." }
    ]
  },
  triathlon: {
    title: "Your Triathlon Plan Structure",
    blocks: [
      { name: "BASE", weeks: "1-5", focus: "Multi-sport foundation",
        desc: "Building comfort in all three disciplines with easy volume.",
        why: "Establishes aerobic base across swim/bike/run without overuse.",
        feel: "Manageable — focus on technique and consistency." },
      { name: "BUILD", weeks: "6-10", focus: "Sport-specific intensity",
        desc: "Brick workouts, threshold sessions, race-pace practice.",
        why: "Develops the ability to transition between sports under fatigue.",
        feel: "Challenging weeks — prioritize recovery and nutrition." },
      { name: "PEAK", weeks: "11-14", focus: "Race simulation",
        desc: "Full race-distance rehearsals, pacing strategy, nutrition practice.",
        why: "Nothing new on race day — practice everything in training.",
        feel: "Tired but confident in your race plan." },
      { name: "TAPER", weeks: "15-16", focus: "Arrive fresh",
        desc: "Short, crisp sessions to keep muscles activated.",
        why: "Two weeks of reduced load for full physiological adaptation.",
        feel: "You might feel slower — your body is storing energy." }
    ]
  },
  general: {
    title: "Your Training Plan Structure",
    blocks: [
      { name: "FOUNDATION", weeks: "1-3", focus: "Movement quality & habits",
        desc: "Establishing proper form and consistent training schedule.",
        why: "Good habits and technique prevent injury and set you up for progress.",
        feel: "Light and manageable — building the routine." },
      { name: "PROGRESSION", weeks: "4-8", focus: "Progressive overload",
        desc: "Gradually increasing weight, reps, or duration.",
        why: "Your body adapts to stress — we need to keep challenging it.",
        feel: "Workouts getting harder but strength is building." },
      { name: "INTENSIFICATION", weeks: "9-12", focus: "Peak performance",
        desc: "Highest intensity and volume to maximize fitness gains.",
        why: "Pushing your limits to reach new personal bests.",
        feel: "Demanding — recovery and sleep are critical." },
      { name: "DELOAD", weeks: "13", focus: "Active recovery",
        desc: "Reduced volume and intensity for one week.",
        why: "Lets your body supercompensate — you'll come back stronger.",
        feel: "Light workouts — resist the urge to push hard." }
    ]
  }
};

/**
 * showTrainingPhilosophy(planType)
 * Shows a modal explaining the training blocks for the given plan type.
 */
function showTrainingPhilosophy(planType) {
  const info = TRAINING_BLOCK_INFO[planType] || TRAINING_BLOCK_INFO.general;

  let overlay = document.getElementById("training-philosophy-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "training-philosophy-overlay";
  overlay.className = "quick-entry-overlay is-open";
  overlay.style.cssText = "display:flex;z-index:10001";
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  const blocksHTML = info.blocks.map(b => `
    <div class="tb-block">
      <div class="tb-block-header">
        <span class="tb-block-name">${b.name}</span>
        <span class="tb-block-weeks">Weeks ${b.weeks}</span>
      </div>
      <div class="tb-block-focus">${b.focus}</div>
      <p class="tb-block-desc">${b.desc}</p>
      <p class="tb-block-why"><strong>Why:</strong> ${b.why}</p>
      <p class="tb-block-feel"><strong>You'll feel:</strong> ${b.feel}</p>
    </div>
  `).join("");

  overlay.innerHTML = `
    <div class="quick-entry-modal" style="max-width:480px;padding:24px">
      <h2 style="margin:0 0 16px">${info.title}</h2>
      <div class="tb-timeline">
        ${info.blocks.map(b => `<div class="tb-timeline-block"><span>${b.name}</span></div>`).join("")}
      </div>
      ${blocksHTML}
      <button class="btn-primary" style="width:100%;margin-top:16px" onclick="document.getElementById('training-philosophy-overlay').remove()">Got It</button>
    </div>
  `;

  document.body.appendChild(overlay);
}

/**
 * renderTrainingPhilosophyButton(planType)
 * Returns HTML for a small info button that opens the training blocks modal.
 */
/**
 * renderTrainingBlocksSection()
 * Populates the Training Blocks card in the Training tab based on active races/plans.
 */
function renderTrainingBlocksSection() {
  const container = document.getElementById("training-blocks-content");
  if (!container) return;

  const section = document.getElementById("section-training-blocks");
  const events = typeof loadEvents === "function" ? loadEvents() : [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));

  // Only show for race types that use periodized training blocks
  const BLOCK_RACE_TYPES = new Set(["ironman", "halfIronman", "olympic", "sprint", "marathon", "halfMarathon", "tenK", "fiveK", "centuryRide", "granFondo", "hyrox", "hyroxDoubles"]);
  const blockRaces = upcoming.filter(e => BLOCK_RACE_TYPES.has(e.type));

  if (blockRaces.length === 0) {
    if (section) section.style.display = "none";
    return;
  }
  if (section) section.style.display = "";

  // Only show training blocks for the A race — one periodization cycle at a time
  const aRace = blockRaces.find(e => (e.priority || "A").toUpperCase() === "A");
  const bRaces = blockRaces.filter(e => (e.priority || "A").toUpperCase() === "B");
  const race = aRace || racesWithPlans[0];

  let html = "";
  {
    const config = RACE_CONFIGS[race.type];
    if (!config) return;

    const raceDate = new Date(race.date + "T00:00:00");
    const today = new Date();
    const weeksOut = Math.max(1, Math.ceil((raceDate - today) / (7 * 24 * 60 * 60 * 1000)));

    // Get adaptive phases based on athlete profile
    const adaptive = getAdaptivePhases(race.type, weeksOut, race.level || "intermediate", race.daysPerWeek || null);
    const phases = adaptive ? adaptive.phases : config.phases;

    // Determine plan type for philosophy modal
    const triTypes = ["ironman", "halfIronman", "olympic", "sprint"];
    const runTypes = ["marathon", "halfMarathon", "tenK", "fiveK"];
    const cycleTypes = ["centuryRide", "granFondo"];
    const planType = triTypes.includes(race.type) ? "triathlon"
      : runTypes.includes(race.type) ? "running"
      : cycleTypes.includes(race.type) ? "cycling"
      : "general";

    // Calculate date ranges for each phase (working backwards from race date)
    const totalPlanWeeks = phases.reduce((s, p) => s + p.weeks, 0);
    const planStartDate = new Date(raceDate);
    planStartDate.setDate(planStartDate.getDate() - totalPlanWeeks * 7);

    let currentBlock = null;
    let phaseStartDate = new Date(planStartDate);
    const phaseDates = phases.map(p => {
      const start = new Date(phaseStartDate);
      const end = new Date(start);
      end.setDate(end.getDate() + p.weeks * 7 - 1);
      phaseStartDate = new Date(end);
      phaseStartDate.setDate(phaseStartDate.getDate() + 1);

      const nowMs = today.getTime();
      if (nowMs >= start.getTime() && nowMs <= end.getTime()) {
        currentBlock = p.name;
      }

      return { ...p, start, end };
    });

    const fmtDate = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    // Compressed plan warning
    const compressedNote = adaptive?.compressed
      ? `<div style="font-size:0.78rem;color:var(--color-amber,#f59e0b);margin-bottom:6px">Compressed plan — ideal is ${adaptive.idealWeeks} weeks, you have ${weeksOut}. Phases adjusted for ${race.level || "intermediate"} level.</div>`
      : "";

    // Level + frequency context
    const levelLabel = race.level ? `${race.level.charAt(0).toUpperCase() + race.level.slice(1)}` : "";
    const freqLabel = race.daysPerWeek ? `${race.daysPerWeek}x/week` : "";
    const contextParts = [levelLabel, freqLabel].filter(Boolean);
    const contextNote = contextParts.length ? `<div style="font-size:0.78rem;color:var(--color-text-muted);margin-bottom:4px">${contextParts.join(" · ")}</div>` : "";

    html += `<div style="margin-bottom:16px">
      <div style="font-weight:700;font-size:0.9rem;margin-bottom:4px">${_escapeHtml(race.name || config.label)} — ${weeksOut} weeks out</div>
      ${contextNote}${compressedNote}
      <div class="tb-timeline">
        ${phaseDates.map(p => {
          const isCurrent = currentBlock && p.name.toLowerCase() === currentBlock.toLowerCase();
          return `<div class="tb-timeline-block${isCurrent ? " tb-current" : ""}" title="${fmtDate(p.start)} – ${fmtDate(p.end)}"><span>${p.name}</span><br><span style="font-size:0.6rem;opacity:0.8">${p.weeks}w</span><br><span style="font-size:0.55rem;opacity:0.7">${fmtDate(p.start)} – ${fmtDate(p.end)}</span></div>`;
        }).join("")}
      </div>
      ${currentBlock ? `<div style="font-size:0.82rem;margin-top:6px">Currently in: <strong>${currentBlock}</strong></div>` : ""}
      <button class="tb-info-btn" style="margin-top:8px" onclick="showTrainingPhilosophy('${planType}')">Learn about each phase</button>
    </div>`;

    // Show B races as tune-ups within the timeline
    if (bRaces.length > 0) {
      html += `<div style="font-size:0.82rem;color:var(--color-text-muted);margin-bottom:12px">`;
      bRaces.forEach(b => {
        const bDate = new Date(b.date + "T00:00:00");
        const bWeeks = Math.max(1, Math.ceil((bDate - new Date()) / (7 * 24 * 60 * 60 * 1000)));
        const bConfig = RACE_CONFIGS[b.type];
        html += `<div style="margin-bottom:4px"><strong>B Race:</strong> ${_escapeHtml(b.name || (bConfig ? bConfig.label : b.type))} — ${bWeeks} weeks out (tune-up)</div>`;
      });
      html += `</div>`;
    }
  }

  container.innerHTML = html || `<p style="color:var(--color-text-muted);font-size:0.85rem">No active race plans found.</p>`;
}

function renderTrainingPhilosophyButton(planType) {
  return `<button class="tb-info-btn" onclick="event.stopPropagation();showTrainingPhilosophy('${planType || "general"}')" title="Learn about your plan structure">&#8505; Training Blocks</button>`;
}
