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
};

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
};

// Structured session descriptions per discipline + load.
// Each entry: { duration (min), steps: [{ type, duration, zone, label, reps?, rest? }] }
// For interval steps reps × duration min on, rest min between each rep.
const SESSION_DESCRIPTIONS = {
  swim: {
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
  // Schedule workout types (from generatePlan)
  triathlon:   "triathlon",
  running:     "running",
  cycling:     "cycling",
};

const CATEGORY_LABELS = {
  triathlon: "Triathlon",
  running:   "Running",
  cycling:   "Cycling",
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
  localStorage.setItem("workoutSchedule", JSON.stringify(filtered));

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
  localStorage.setItem("trainingNotes", JSON.stringify(notes));
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
};

const SCHEDULE_TYPE_ICON  = { running: ICONS.run, weightlifting: ICONS.weights, cycling: ICONS.bike, swimming: ICONS.swim, triathlon: ICONS.swim, general: ICONS.activity, hiit: ICONS.flame, bodyweight: ICONS.activity, yoga: ICONS.yoga, mobility: ICONS.activity, walking: ICONS.run, rowing: ICONS.swim, pilates: ICONS.activity, sport: ICONS.activity };
const SCHEDULE_TYPE_LABEL = { running: "Running", weightlifting: "Strength", cycling: "Cycling", swimming: "Swimming", triathlon: "Triathlon", general: "General Fitness", hiit: "HIIT", bodyweight: "Bodyweight", yoga: "Yoga / Mobility", mobility: "Mobility", walking: "Walking", rowing: "Rowing", pilates: "Pilates", sport: "Sport-Specific" };

function _getScheduleInputs() {
  const schedule = (() => { try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch { return []; } })();
  const todayStr = new Date().toISOString().slice(0, 10);
  const future   = schedule.filter(e => (e.source === "generated" || e.source === "custom" || e.source === "onboarding") && e.date >= todayStr);
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

function renderTrainingInputs() {
  const container = document.getElementById("training-inputs-list");
  if (!container) return;

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
            <button class="delete-btn" onclick="removeTrainingInput('race','${race.id}')" title="Remove race">✕</button>
          </div>
        </div>
        <div class="race-card-name">${_escapeHtml(race.name || (cfg ? cfg.label : race.type))}</div>
        <div class="race-card-meta">${cfg ? cfg.label : race.type}</div>
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
            <button class="delete-btn" onclick="removeTrainingInput('schedule','${s.type}')" title="Remove schedule">✕</button>
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
            <button class="delete-btn" onclick="removeTrainingInput('imported','${plan.id}')" title="Remove imported plan">✕</button>
          </div>
        </div>
        <div class="race-card-name card-toggle" onclick="toggleSection('ti-import-${plan.id}')" style="cursor:pointer">
          ${ICONS.calendar} ${_escapeHtml(plan.name)}
          <span class="card-chevron" style="float:right">▾</span>
        </div>
        <div class="race-card-meta">${plan.sessions.length} sessions · ${plan.weekCount} week${plan.weekCount !== 1 ? "s" : ""}</div>
        <div class="race-card-footer">
          <span class="race-date-badge">${formatDisplayDate(plan.startDate)}</span>
          <span class="race-countdown">${countdown}</span>
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
            <button class="delete-btn" onclick="removeTrainingInput('note','${note.id}')" title="Remove note">✕</button>
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
  const section = document.getElementById("section-race-events");
  if (section) section.classList.remove("is-collapsed");
  editEvent(id);
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Open the Gym & Strength section so user can regenerate a schedule */
function tiEditSchedule(type) {
  const section = document.getElementById("section-generate-plan");
  if (section) {
    section.classList.remove("is-collapsed");
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
    localStorage.setItem("workoutSchedule", JSON.stringify(filtered));
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
    localStorage.setItem("workoutSchedule", JSON.stringify(filtered));
    // Remove plan metadata
    const plans = (() => { try { return JSON.parse(localStorage.getItem("importedPlans")) || []; } catch { return []; } })();
    localStorage.setItem("importedPlans", JSON.stringify(plans.filter(p => p.id !== id)));
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
  localStorage.setItem("events", JSON.stringify(events));
}

function loadTrainingPlan() {
  try {
    return JSON.parse(localStorage.getItem("trainingPlan")) || [];
  } catch {
    return [];
  }
}

function saveTrainingPlanData(plan) {
  localStorage.setItem("trainingPlan", JSON.stringify(plan));
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
function adjustPatternToDays(pattern, daysPerWeek) {
  if (!daysPerWeek) return pattern;
  const loadPri = { long: 0, hard: 1, moderate: 1, strides: 1, easy: 2 };
  const entries = Object.entries(pattern).map(([d, s]) => [parseInt(d), s]);
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
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      if (needed <= 0) break;
      if (!usedDows.has(d) && !blockedDows.has(d)) {
        result[d] = { discipline: "run", load: "easy" };
        usedDows.add(d);
        needed--;
      }
    }
    return result;
  }
  return pattern;
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

  // Apply days-per-week adjustment for all plan types
  const patterns = race.daysPerWeek
    ? Object.fromEntries(Object.entries(longDayPatterns).map(([ph, pat]) => [ph, adjustPatternToDays(pat, race.daysPerWeek)]))
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

    if (session && dateStr >= todayStr) {
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
];

let raceFormState = {
  step: 1, sport: null, type: null,
  savedName: "", savedDate: "", savedLevel: "intermediate", savedPriority: "A", savedLongDay: "",
  savedRunGoal: null, savedReturningFromInjury: null, savedDaysPerWeek: null,
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
  else if (raceFormState.step === 4)      c.innerHTML = raceFormState.sport === "running" ? _rfStep4() : _rfStep4Tri();
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
  // Collapse Build a Plan
  const buildSection = document.getElementById("section-race-events");
  if (buildSection && !buildSection.classList.contains("is-collapsed")) {
    buildSection.classList.add("is-collapsed");
  }
  // Open Create Your Own Plan
  const customSection = document.getElementById("section-custom-plan");
  if (customSection) {
    if (customSection.classList.contains("is-collapsed")) {
      customSection.classList.remove("is-collapsed");
    }
    customSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
    : `<button class="btn-primary" onclick="saveRace()" style="margin-top:16px">${_editingRaceId ? "Update Race" : "Generate Plan"}</button>
       ${_editingRaceId ? `<button class="btn-secondary" id="race-cancel-btn" onclick="_cancelEditRace()" style="margin-left:8px">Cancel Edit</button>` : ""}`;
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
  localStorage.setItem("gymStrengthEnabled", enabled ? "1" : "0");
  const toggle = document.getElementById("gym-strength-toggle");
  if (toggle) toggle.checked = enabled;

  if (!enabled) {
    // Remove all generated gym/strength schedule entries
    let schedule = [];
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}
    const filtered = schedule.filter(e => !(e.source === "generated" && GYM_STRENGTH_TYPES.includes(e.type)));
    localStorage.setItem("workoutSchedule", JSON.stringify(filtered));
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

  const race = {
    id: _editingRaceId || Date.now().toString(),
    name,
    type,
    level,
    priority,
    date,
    longDay,
    ...(isRunning && raceFormState.savedRunGoal !== null       && { runGoal: raceFormState.savedRunGoal }),
    ...(isRunning && raceFormState.savedReturningFromInjury !== null && { returningFromInjury: raceFormState.savedReturningFromInjury }),
    ...(isRunning && raceFormState.savedDaysPerWeek            && { daysPerWeek: raceFormState.savedDaysPerWeek }),
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
  msgEl.textContent = `✓ ${name} ${verb}! ${newEntries.length} training sessions generated.`;
  msgEl.style.color = "var(--color-success)";

  // Reset edit state and form
  _cancelEditRace();

  renderRaceEvents();
  renderTrainingConflicts();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();

  setTimeout(() => { msgEl.textContent = ""; }, 4000);
}

/** Populates the race form with an existing race for editing */
function editEvent(id) {
  const race = loadEvents().find(e => e.id === id);
  if (!race) return;

  _editingRaceId = id;

  const _typeToSport = {
    ironman: "triathlon", halfIronman: "triathlon", olympic: "triathlon", sprint: "triathlon",
    marathon: "running", halfMarathon: "running", tenK: "running", fiveK: "running",
    centuryRide: "cycling", granFondo: "cycling",
  };

  const _editSport = _typeToSport[race.type] || "running";
  raceFormState = {
    step: _editSport === "running" ? 5 : _editSport === "triathlon" ? 4 : 3,
    sport: _editSport,
    type: race.type,
    savedName: race.name || "",
    savedDate: race.date || "",
    savedLevel: race.level || "intermediate",
    savedPriority: race.priority || "A",
    savedLongDay: (race.longDay !== null && race.longDay !== undefined) ? String(race.longDay) : "",
    savedRunGoal: race.runGoal ?? null,
    savedReturningFromInjury: race.returningFromInjury ?? null,
    savedDaysPerWeek: race.daysPerWeek ?? null,
  };

  const section = document.getElementById("section-race-events");
  if (section) section.classList.remove("is-collapsed");
  renderRaceForm();
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function _cancelEditRace() {
  _editingRaceId = null;
  raceFormState = { step: 1, sport: null, type: null, savedName: "", savedDate: "", savedLevel: "intermediate", savedPriority: "A", savedLongDay: "", savedRunGoal: null, savedReturningFromInjury: null, savedDaysPerWeek: null };
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
  yoga:         ICONS.yoga,
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
            <button class="delete-btn" onclick="deleteEvent('${race.id}')" title="Delete race">✕</button>
          </div>
        </div>
        <div class="race-card-name">${race.name}</div>
        <div class="race-card-meta">${config.label || race.type}</div>
        ${tags ? `<div class="race-tags">${tags}</div>` : ""}
        <div class="race-card-footer">
          <span class="race-date-badge">${formatDisplayDate(race.date)}</span>
          <span class="race-countdown ${isPast ? "past" : ""}">${label}</span>
        </div>
      </div>`;
  }).join("");
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
