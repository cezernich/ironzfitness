// js/data/benchmark-wods.js
//
// Pre-loaded circuit workout library. These are the launch benchmarks
// per SPEC_circuit_workouts.md §10. Classic WODs + user-submitted
// community circuits.
//
// Each entry is a canonical circuit workout object (same shape as what
// the builder produces) so the library card, preview, and completion
// flow can all consume the same data model.
//
// Exposes window.BENCHMARK_WODS as a frozen array.

(function () {
  "use strict";

  const BENCHMARK_WODS = [
    // ── Classic WODs ──────────────────────────────────────────────────────
    {
      id: "murph",
      name: "Murph",
      goal: "for_time",
      description: "1mi + 20×[pullups, pushups, squats] + 1mi",
      long_description: "Named after Navy Lieutenant Michael Murphy. Wear a 20lb vest for Rx.",
      category: "classic",
      equipment: ["Pull-up bar"],
      estimated_min: 30,
      steps: [
        { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" },
        { kind: "repeat", count: 20, children: [
          { kind: "exercise", name: "Pull-ups", reps: 5 },
          { kind: "exercise", name: "Push-ups", reps: 10 },
          { kind: "exercise", name: "Air Squats", reps: 15 },
        ]},
        { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" },
      ],
    },
    {
      id: "cindy",
      name: "Cindy",
      goal: "amrap",
      goal_value: 20,
      description: "Max rounds in 20 min: pull-ups, pushups, squats",
      long_description: "20-minute AMRAP. Simple but brutal.",
      category: "classic",
      equipment: ["Pull-up bar"],
      estimated_min: 20,
      steps: [
        { kind: "repeat", count: null, children: [
          { kind: "exercise", name: "Pull-ups", reps: 5 },
          { kind: "exercise", name: "Push-ups", reps: 10 },
          { kind: "exercise", name: "Air Squats", reps: 15 },
        ]},
      ],
    },
    {
      id: "fran",
      name: "Fran",
      goal: "for_time",
      description: "21-15-9: thrusters + pull-ups",
      long_description: "The benchmark sprint. 21-15-9 rep scheme.",
      category: "classic",
      equipment: ["Barbell", "Pull-up bar"],
      estimated_min: 8,
      steps: [
        { kind: "repeat", count: 1, children: [
          { kind: "exercise", name: "Thrusters", reps: 21, weight: 95, weight_unit: "lbs" },
          { kind: "exercise", name: "Pull-ups", reps: 21 },
        ]},
        { kind: "repeat", count: 1, children: [
          { kind: "exercise", name: "Thrusters", reps: 15, weight: 95, weight_unit: "lbs" },
          { kind: "exercise", name: "Pull-ups", reps: 15 },
        ]},
        { kind: "repeat", count: 1, children: [
          { kind: "exercise", name: "Thrusters", reps: 9, weight: 95, weight_unit: "lbs" },
          { kind: "exercise", name: "Pull-ups", reps: 9 },
        ]},
      ],
    },
    {
      id: "helen",
      name: "Helen",
      goal: "for_time",
      description: "3 rounds: 400m run, KB swings, pull-ups",
      long_description: "Three rounds of run, swing, pull.",
      category: "classic",
      equipment: ["Kettlebell", "Pull-up bar"],
      estimated_min: 12,
      steps: [
        { kind: "repeat", count: 3, children: [
          { kind: "cardio", name: "Run", distance_m: 400, distance_display: "400m" },
          { kind: "exercise", name: "Kettlebell Swings", reps: 21, weight: 53, weight_unit: "lbs" },
          { kind: "exercise", name: "Pull-ups", reps: 12 },
        ]},
      ],
    },
    {
      id: "filthy-fifty",
      name: "Filthy Fifty",
      goal: "for_time",
      description: "50 reps of 10 movements",
      long_description: "50 reps of 10 movements. A true chipper.",
      category: "classic",
      equipment: ["Box", "Pull-up bar", "Kettlebell", "Barbell", "GHD", "Wall ball", "Jump rope"],
      estimated_min: 25,
      steps: [
        { kind: "exercise", name: "Box Jumps", reps: 50, notes: "24in" },
        { kind: "exercise", name: "Jumping Pull-ups", reps: 50 },
        { kind: "exercise", name: "Kettlebell Swings", reps: 50, weight: 35, weight_unit: "lbs" },
        { kind: "exercise", name: "Walking Lunges", reps: 50 },
        { kind: "exercise", name: "Knees-to-Elbows", reps: 50 },
        { kind: "exercise", name: "Push Press", reps: 50, weight: 45, weight_unit: "lbs" },
        { kind: "exercise", name: "Back Extensions", reps: 50 },
        { kind: "exercise", name: "Wall Balls", reps: 50, weight: 20, weight_unit: "lbs" },
        { kind: "exercise", name: "Burpees", reps: 50 },
        { kind: "exercise", name: "Double-Unders", reps: 50 },
      ],
    },

    // ── Community ─────────────────────────────────────────────────────────
    {
      id: "warmup-circuit-1",
      name: "Warm-up Circuit",
      goal: "standard",
      description: "Mobility warm-up into bodyweight power circuit",
      long_description: "Mobility warm-up into bodyweight power circuit.",
      category: "community",
      equipment: ["Cable machine", "Box", "Pull-up bar"],
      estimated_min: 35,
      steps: [
        { kind: "cardio", name: "Incline Walk", duration_sec: 300, distance_display: "5 min" },
        { kind: "repeat", count: 5, children: [
          { kind: "exercise", name: "Chest Pulls", reps: 10 },
          { kind: "exercise", name: "Glute Bridges", reps: 10 },
          { kind: "exercise", name: "Hip 90/90", reps: 10 },
        ]},
        { kind: "repeat", count: 10, children: [
          { kind: "exercise", name: "Chin-ups", reps: 5 },
          { kind: "exercise", name: "Push-ups", reps: 10 },
          { kind: "exercise", name: "Box Jumps", reps: 10 },
        ]},
        { kind: "exercise", name: "Abs", reps: null, notes: "Dealer's choice" },
      ],
    },
    {
      id: "321-mile-pyramid",
      name: "3-2-1 Mile Pyramid",
      goal: "for_time",
      description: "Descending rounds with miles between",
      long_description: "Descending rounds with a mile between each. Mental and physical grinder.",
      category: "community",
      equipment: ["Barbell", "Medicine ball", "Kettlebell/Dumbbell"],
      estimated_min: 45,
      steps: [
        { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" },
        { kind: "repeat", count: 3, children: [
          { kind: "exercise", name: "Deadlifts", reps: 15 },
          { kind: "exercise", name: "Ball Toss Squats", reps: 15 },
          { kind: "exercise", name: "Overhead Snatches", reps: 8, weight: 40, weight_unit: "lbs", per_side: true },
          { kind: "exercise", name: "Push-ups", reps: 20 },
        ]},
        { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" },
        { kind: "repeat", count: 2, children: [
          { kind: "exercise", name: "Deadlifts", reps: 15 },
          { kind: "exercise", name: "Ball Toss Squats", reps: 15 },
          { kind: "exercise", name: "Overhead Snatches", reps: 8, weight: 40, weight_unit: "lbs", per_side: true },
          { kind: "exercise", name: "Push-ups", reps: 20 },
        ]},
        { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" },
        { kind: "repeat", count: 1, children: [
          { kind: "exercise", name: "Deadlifts", reps: 15 },
          { kind: "exercise", name: "Ball Toss Squats", reps: 15 },
          { kind: "exercise", name: "Overhead Snatches", reps: 8, weight: 40, weight_unit: "lbs", per_side: true },
          { kind: "exercise", name: "Push-ups", reps: 20 },
        ]},
      ],
    },
    {
      id: "row-chipper",
      name: "Row Chipper",
      goal: "for_time",
      description: "Ascending rows + descending bodyweight",
      long_description: "Ascending row distances with descending bodyweight reps.",
      category: "community",
      equipment: ["Rower"],
      estimated_min: 30,
      steps: [
        { kind: "cardio", name: "Row", distance_m: 500, distance_display: "500m" },
        { kind: "exercise", name: "Push-ups", reps: 100 },
        { kind: "cardio", name: "Row", distance_m: 1000, distance_display: "1000m" },
        { kind: "exercise", name: "Burpees", reps: 80 },
        { kind: "cardio", name: "Row", distance_m: 2000, distance_display: "2000m" },
        { kind: "exercise", name: "Air Squats", reps: 60 },
      ],
    },
  ];

  if (typeof window !== "undefined") {
    window.BENCHMARK_WODS = Object.freeze(BENCHMARK_WODS);
  }
})();
