// planner.js — Race event management + training plan generation

// ─── Race configuration ─────────────────────────────────────────────────────

const RACE_CONFIGS = {
  ironman: {
    label: "Ironman Triathlon",
    totalWeeks: 24,
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
    phases: [
      { name: "Base", weeks: 4 },
      { name: "Build", weeks: 6 },
      { name: "Taper", weeks: 2 },
    ],
  },
  sprint: {
    label: "Sprint Triathlon",
    totalWeeks: 10,
    phases: [
      { name: "Base", weeks: 4 },
      { name: "Build", weeks: 4 },
      { name: "Taper", weeks: 2 },
    ],
  },
  marathon: {
    label: "Marathon",
    totalWeeks: 18,
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
    phases: [
      { name: "Base", weeks: 4 },
      { name: "Build", weeks: 6 },
      { name: "Taper", weeks: 2 },
    ],
  },
  tenK: {
    label: "10K",
    totalWeeks: 8,
    phases: [
      { name: "Base", weeks: 3 },
      { name: "Build", weeks: 4 },
      { name: "Taper", weeks: 1 },
    ],
  },
  fiveK: {
    label: "5K",
    totalWeeks: 6,
    phases: [
      { name: "Base", weeks: 2 },
      { name: "Build", weeks: 3 },
      { name: "Taper", weeks: 1 },
    ],
  },
  centuryRide: {
    label: "Century Ride (100mi)",
    totalWeeks: 16,
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
    phases: [
      { name: "Base", weeks: 3 },
      { name: "Build", weeks: 4 },
      { name: "Peak", weeks: 3 },
      { name: "Taper", weeks: 2 },
    ],
  },
};

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
  },

  hyrox: {
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
  },

  hyroxStrength: {
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
  },
};

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

  // Active races: future date
  const activeRaces = events.filter(e => e.date > today);

  // Active schedules: has at least one entry in the future, grouped by type
  const activeScheduleTypes = new Set(
    schedule.filter(s => s.date > today).map(s => s.type).filter(Boolean)
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

/** Removes all workoutSchedule entries for a given type (resolves schedule side of conflict) */
function removeConflictingSchedule(schedType, raceCat) {
  const catLabel = CATEGORY_LABELS[raceCat] || raceCat;
  if (!confirm(`Remove the ${catLabel} workout schedule? This will delete all scheduled sessions of that type from your calendar.`)) return;

  const existing = (() => {
    try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; }
    catch { return []; }
  })();
  const filtered = existing.filter(s => s.type !== schedType);
  localStorage.setItem("workoutSchedule", JSON.stringify(filtered)); if (typeof DB !== 'undefined') DB.syncSchedule();

  renderTrainingConflicts();
  if (typeof renderCalendar === "function") renderCalendar();
}

/** Removes a race event and its training plan (resolves race side of conflict) */
function removeConflictingRace(raceId, raceCat) {
  const catLabel = CATEGORY_LABELS[raceCat] || raceCat;
  const race = loadEvents().find(e => e.id === raceId);
  if (!race) return;
  if (!confirm(`Remove the race "${race.name}" and its generated training plan?`)) return;

  saveEvents(loadEvents().filter(e => e.id !== raceId));
  saveTrainingPlanData(loadTrainingPlan().filter(e => e.raceId !== raceId));

  renderTrainingConflicts();
  renderRaceEvents();
  if (typeof renderCalendar === "function") renderCalendar();
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
  hyrox:        ICONS.activity,
  hyroxDoubles: ICONS.activity,
};

const SCHEDULE_TYPE_ICON  = { running: ICONS.run, weightlifting: ICONS.weights, cycling: ICONS.bike, swimming: ICONS.swim, triathlon: ICONS.swim, general: ICONS.activity, hiit: ICONS.flame, bodyweight: ICONS.activity, yoga: ICONS.yoga, mobility: ICONS.activity, walking: ICONS.run, rowing: ICONS.swim, pilates: ICONS.activity, sport: ICONS.activity };
const SCHEDULE_TYPE_LABEL = { running: "Running", weightlifting: "Strength", cycling: "Cycling", swimming: "Swimming", triathlon: "Triathlon", general: "General Fitness", hiit: "HIIT", bodyweight: "Bodyweight", yoga: "Yoga / Mobility", mobility: "Mobility", walking: "Walking", rowing: "Rowing", pilates: "Pilates", sport: "Sport-Specific" };

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
  const hasActiveA = upcoming.some(e => (e.priority || "A").toUpperCase() === "A");

  if (hasActiveA) return; // A race still active, nothing to do

  const bRaces = upcoming.filter(e => (e.priority || "A").toUpperCase() === "B");
  if (bRaces.length === 0) return; // no races at all

  if (bRaces.length === 1) {
    // Auto-promote the only remaining race
    const race = events.find(e => e.id === bRaces[0].id);
    if (race) {
      race.priority = "A";
      saveEvents(events);
    }
  } else {
    // Multiple B races — prompt user to choose
    _showARacePromotionModal(bRaces, events);
  }
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
  }
  document.getElementById("a-race-promotion-overlay")?.remove();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
  if (typeof renderRaceEvents === "function") renderRaceEvents();
  if (typeof renderTrainingBlocksSection === "function") renderTrainingBlocksSection();
}

function renderTrainingInputs() {
  const container = document.getElementById("training-inputs-list");
  if (!container) return;

  // Check if A race needs promotion
  checkARacePromotion();

  const todayStr  = new Date().toISOString().slice(0, 10);
  const races     = loadEvents().filter(e => e.date > todayStr);
  const schedules = _getScheduleInputs();
  const notes     = loadTrainingNotes();
  const imported  = (() => { try { return JSON.parse(localStorage.getItem("importedPlans")) || []; } catch { return []; } })()
    .filter(p => p.sessions && p.sessions.some(s => s.date >= todayStr));

  if (races.length === 0 && schedules.length === 0 && notes.length === 0 && imported.length === 0) {
    container.innerHTML = `<p class="empty-msg" style="margin-bottom:12px">No active training inputs yet. Add a race or generate a plan to see them here.</p>`;
    return;
  }

  let html = '<div class="ti-cards">';

  // ── Race cards ──
  const _goalLabels = { finish: "Just finish", time: "Time goal", compete: "Compete" };
  races.forEach(race => {
    const cfg      = RACE_CONFIGS[race.type];
    const priority = (race.priority || "A").toUpperCase();
    const rd       = new Date(race.date + "T00:00:00");
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((rd - today) / (1000 * 60 * 60 * 24));
    const weeks    = Math.floor(daysLeft / 7);
    const label    = daysLeft <= 0 ? "Race day!" : weeks > 0 ? `${weeks} week${weeks !== 1 ? "s" : ""} away` : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} away`;

    const tags = [
      capitalize(race.level),
      race.daysPerWeek ? `${race.daysPerWeek}× / week` : null,
      race.runGoal ? _goalLabels[race.runGoal] : null,
    ].filter(Boolean).map(t => `<span class="race-tag">${t}</span>`).join("");

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

/** Open the Race Events section and load the race for editing */
function tiEditRace(id) {
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
 * generateTrainingPlan(race)
 * Builds a day-by-day training schedule from (raceDate - totalWeeks) → raceDate.
 *
 * @param {Object} race - { id, type, date, level, longDay?, runGoal?, returningFromInjury? }
 * @returns {Array} plan entries: { date, raceId, phase, weekNumber, discipline, load, sessionName, details }
 */
function generateTrainingPlan(race) {
  const config = RACE_CONFIGS[race.type];
  if (!config) return [];

  const raceDate = new Date(race.date + "T00:00:00");
  const startDate = new Date(raceDate);
  startDate.setDate(startDate.getDate() - config.totalWeeks * 7);

  const plan = [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const rawPatterns = WEEKLY_PATTERNS[race.type] || {};

  // For running race types the pattern object is level-aware; extract the right sub-object.
  const isLevelAware = rawPatterns.beginner || rawPatterns.intermediate || rawPatterns.advanced;
  const runPatternKey = isLevelAware ? getRunPatternKey(race) : null;
  const levelPatterns = isLevelAware
    ? (rawPatterns[runPatternKey] || rawPatterns.intermediate || {})
    : rawPatterns;

  const triTypes = new Set(["ironman", "halfIronman", "olympic", "sprint"]);
  const longDiscipline = triTypes.has(race.type) ? "bike" : null;
  const longDayPatterns = (race.longDay !== undefined && race.longDay !== null)
    ? applyLongDayPreference(levelPatterns, race.longDay, longDiscipline)
    : levelPatterns;

  // Apply days-per-week and unavailable-days adjustment for all plan types
  const hasAdjustment = race.daysPerWeek || (race.unavailableDays && race.unavailableDays.length > 0);
  const patterns = hasAdjustment
    ? Object.fromEntries(Object.entries(longDayPatterns).map(([ph, pat]) => [ph, adjustPatternToDays(pat, race.daysPerWeek, race.unavailableDays)]))
    : longDayPatterns;

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

  let weekNumber = 1;
  let phaseWeekCount = 0;
  let phaseIndex = 0;
  let currentPhase = config.phases[0];

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
      if (phaseIndex < config.phases.length) {
        currentPhase = config.phases[phaseIndex];
      }
      phaseWeekCount = 0;
    }

    const phaseName = currentPhase ? currentPhase.name : "Taper";
    const phasePattern = patterns[phaseName] || {};
    const session = phasePattern[dow];

    // ── Threshold-week override ──────────────────────────────────────────────
    let _twOverride = null;
    if (_scheduledThresholdWeeks.length && typeof window !== "undefined" && window.ThresholdWeekScheduler) {
      const TW = window.ThresholdWeekScheduler;
      const monday = TW.mondayOf(cursor);
      if (TW.shouldThisBeAThresholdWeek(monday, _scheduledThresholdWeeks)) {
        const days = TW.buildThresholdWeekDays(monday, _twSportProfile);
        _twOverride = days.find(d => d.date === dateStr) || null;
      }
    }

    if (_twOverride && dateStr >= todayStr) {
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
    } else if (session && dateStr >= todayStr) {
      const LOAD_NAMES = { easy: "Easy", strides: "Strides", moderate: "Tempo", hard: "Threshold", long: "Long" };
      const loadName  = LOAD_NAMES[session.load] || capitalize(session.load);
      // Compute progressive duration for running sessions
      const duration = (session.discipline === "run" && runPatternKey)
        ? getRunSessionDuration(race.type, session.load, phaseName, weekNumber, config.totalWeeks, runPatternKey)
        : undefined;
      plan.push({
        date: dateStr,
        raceId: race.id,
        phase: phaseName,
        weekNumber,
        discipline: session.discipline,
        load: session.load,
        sessionName: `${loadName} ${capitalize(session.discipline)}`,
        ...(duration != null ? { duration } : {}),
      });
    }

    // Advance day; track week boundaries (Mon = start of training week)
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() === 1) { // Monday
      weekNumber++;
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
      duration_weeks: config.totalWeeks,
      level: race.level,
    });
  }

  return plan;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

// ─── Daily nutrition target ───────────────────────────────────────────────────

/**
 * getBaseNutritionTarget(dateStr)
 * Returns macro targets personalised to the user's profile (weight, height, age, gender)
 * using the Mifflin-St Jeor BMR equation + per-load activity multipliers.
 * Falls back to generic NUTRITION_TARGETS if profile is incomplete.
 */
function getBaseNutritionTarget(dateStr) {
  const plan  = loadTrainingPlan();
  const entry = plan.find(e => e.date === dateStr);
  const load  = entry ? entry.load : "rest";

  let profile = {};
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}

  const weightLbs = parseFloat(profile.weight);
  const heightIn  = parseFloat(profile.height);
  const age       = parseInt(profile.age);

  if (weightLbs > 0 && heightIn > 0 && age > 0) {
    const weightKg = weightLbs * 0.453592;
    const heightCm = heightIn  * 2.54;

    // Mifflin-St Jeor BMR
    const bmr = profile.gender === "female"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
      : 10 * weightKg + 6.25 * heightCm - 5 * age + 5; // male / default

    const multipliers = { rest: 1.3, easy: 1.55, moderate: 1.65, hard: 1.8, long: 1.9, race: 2.1 };
    const calories = Math.round(bmr * (multipliers[load] || 1.3) / 50) * 50;

    // Protein: ~0.9 g per lb for athletes, rounded to nearest 5 g
    const protein = Math.round(weightLbs * 0.9 / 5) * 5;
    // Fat: 28% of calories
    const fat     = Math.round(calories * 0.28 / 9 / 5) * 5;
    // Carbs: remaining calories
    const carbs   = Math.round((calories - protein * 4 - fat * 9) / 4 / 5) * 5;

    return { calories, protein, carbs: Math.max(carbs, 50), fat: Math.max(fat, 20) };
  }

  // Generic fallback
  return { ...NUTRITION_TARGETS[load] || NUTRITION_TARGETS.rest };
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
  { value: "hyrox",     icon: ICONS.activity || "&#9883;", label: "Hyrox", desc: "Run + functional fitness race" },
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
      _rfShowError(`You already have an upcoming A Race (${existingA.name || existingA.type}). Only one A Race is allowed at a time — set this to B, or edit your existing A Race first.`);
      return;
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
    { value: "finish",  icon: ICONS.flag,   label: "Just finish",      desc: "Complete the race" },
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
      _rfShowError(`You already have an upcoming A Race (${existingA.name || existingA.type}). Only one A Race is allowed at a time — set this to B, or edit your existing A Race first.`);
      return;
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
      _rfShowError(`You already have an upcoming A Race (${existingA.name || existingA.type}). Only one A Race is allowed at a time — set this to B, or edit your existing A Race first.`);
      return;
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

  // A-race uniqueness: only one upcoming A race allowed at a time
  if (priority === "A") {
    const todayStr = new Date().toISOString().slice(0, 10);
    const allRaces = (() => { try { return JSON.parse(localStorage.getItem("events")) || []; } catch { return []; } })();
    const existingA = allRaces.find(r => (r.priority || "A").toUpperCase() === "A" && r.id !== _editingRaceId && r.date >= todayStr);
    if (existingA) {
      showErr(`You already have an upcoming A Race (${existingA.name || existingA.type}). You can only have one A Race at a time — set this race to B, or edit your existing A Race first.`);
      return;
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
    priority,
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
    <div class="quick-entry-modal" style="max-width:420px;padding:24px">
      <h3 style="margin:0 0 4px">Edit Race</h3>
      <p style="margin:0 0 16px;color:var(--color-text-muted);font-size:0.82rem">${cfg.label || race.type}</p>

      <div class="form-row" style="margin-bottom:10px">
        <label>Race Name</label>
        <input type="text" id="edit-race-name" value="${_escapeHtml(race.name || "")}" placeholder="e.g. Boston Marathon 2026" />
      </div>

      <div class="form-row" style="margin-bottom:10px">
        <label>Race Date</label>
        <input type="date" id="edit-race-date" value="${race.date || ""}" />
      </div>

      <div class="form-grid" style="margin-bottom:10px">
        <div class="form-row">
          <label>Level</label>
          <select id="edit-race-level">
            <option value="beginner" ${sel(race.level, "beginner")}>Beginner</option>
            <option value="intermediate" ${sel(race.level, "intermediate")}>Intermediate</option>
            <option value="advanced" ${sel(race.level, "advanced")}>Advanced</option>
          </select>
        </div>
        <div class="form-row">
          <label>Priority</label>
          <select id="edit-race-priority">
            <option value="A" ${sel(race.priority, "A")}>A Race</option>
            <option value="B" ${sel(race.priority, "B")}>B Race</option>
          </select>
        </div>
      </div>

      <div class="form-grid" style="margin-bottom:10px">
        <div class="form-row">
          <label>Days / Week</label>
          <select id="edit-race-days">
            <option value="">Default</option>
            ${[3,4,5,6,7].map(n => `<option value="${n}" ${race.daysPerWeek === n ? "selected" : ""}>${n} days</option>`).join("")}
          </select>
        </div>
        <div class="form-row">
          <label>Long Session Day</label>
          <select id="edit-race-longday">
            <option value="">Default (Saturday)</option>
            ${DOW_LABELS.map((d, i) => `<option value="${i}" ${race.longDay === i ? "selected" : ""}>${d}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="form-row" style="margin-bottom:10px">
        <label>Days Off (can't train)</label>
        <div class="rf-day-picker" id="edit-race-unavail-days">
          ${DOW_LABELS.map((d, i) => {
            const isOff = race.unavailableDays && race.unavailableDays.includes(i);
            return `<button type="button" class="rf-day-btn${isOff ? " rf-day-off" : ""}" data-dow="${i}" onclick="this.classList.toggle('rf-day-off')">${d.slice(0,3)}</button>`;
          }).join("")}
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn-primary" style="flex:1" onclick="_saveEditedRace('${race.id}')">Save Changes</button>
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
  race.level = document.getElementById("edit-race-level")?.value || race.level;
  race.priority = document.getElementById("edit-race-priority")?.value || race.priority;

  const days = document.getElementById("edit-race-days")?.value;
  race.daysPerWeek = days ? parseInt(days) : race.daysPerWeek;

  const longDay = document.getElementById("edit-race-longday")?.value;
  race.longDay = longDay !== "" ? parseInt(longDay) : race.longDay;

  // Read unavailable days from toggle buttons
  const unavailBtns = document.querySelectorAll("#edit-race-unavail-days .rf-day-btn.rf-day-off");
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
  const events = loadEvents().filter(e => e.id !== id);
  saveEvents(events);

  const plan = loadTrainingPlan().filter(e => e.raceId !== id);
  saveTrainingPlanData(plan);

  renderRaceEvents();
  renderTrainingConflicts();
  if (typeof renderCalendar === "function") renderCalendar();
}

// ─── Render race events list ─────────────────────────────────────────────────

const DISCIPLINE_ICONS = {
  swim:         ICONS.swim,
  bike:         ICONS.bike,
  run:          ICONS.run,
  brick:        ICONS.zap,
  race:         ICONS.flag,
  weightlifting:ICONS.weights,
  cycling:      ICONS.bike,
  running:      ICONS.run,
  swimming:     ICONS.swim,
  triathlon:    ICONS.swim,
  general:      ICONS.activity,
  hiit:         ICONS.flame || ICONS.zap,
  hyrox:        ICONS.activity,
  hyroxStrength:ICONS.weights,
  yoga:         ICONS.yoga,
  stairstepper: ICONS.steps,
  wellness:     ICONS.droplet,
};

function renderRaceEvents() {
  const container = document.getElementById("race-events-list");
  if (!container) return;

  const events = loadEvents();
  if (events.length === 0) {
    container.innerHTML = `<p class="empty-msg">No races added yet. Add your first event above!</p>`;
    return;
  }

  const today = new Date();
  const upcoming = events
    .map(e => ({ ...e, dateObj: new Date(e.date + "T00:00:00") }))
    .sort((a, b) => a.dateObj - b.dateObj);

  const goalLabels = { finish: "Just finish", time: "Time goal", compete: "Compete" };

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
            <button class="ti-edit-btn" onclick="editEvent('${race.id}')" title="Edit race">Edit</button>
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
