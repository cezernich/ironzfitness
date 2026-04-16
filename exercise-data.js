// exercise-data.js — GENERATED FROM IronZ_Exercise_Library_Expanded.xlsx
//
// DO NOT EDIT BY HAND. Edit the spreadsheet and run:
//   python3 scripts/generate-exercise-db.py
//
// Schema: cowork-handoff/EXERCISE_DB_SPEC.md
// Source of truth: IronZ_Exercise_Library_Expanded.xlsx (4 sheets)

(function () {
  "use strict";
  window.EXERCISE_DB = [
  {
    "id": "ab-wheel-rollout",
    "name": "Ab Wheel Rollout",
    "sheet": "strength",
    "pattern": "core",
    "tier": "secondary",
    "equipmentTags": [
      "ab-wheel"
    ],
    "primaryMuscles": "Core, Lats",
    "muscleCategory": [
      "back",
      "core"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "ab-wheel"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "adductor-machine",
    "name": "Adductor Machine",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "glutes"
    ],
    "specificGoal": "adductors",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "hip-abductor-adductor",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "arnold-press",
    "name": "Arnold Press",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Shoulders",
    "muscleCategory": [
      "shoulders"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "assisted-pull-up",
    "name": "Assisted Pull-Up",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine",
      "band"
    ],
    "primaryMuscles": "Lats, Biceps",
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "pull-up-bar",
      "band",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "back-extension",
    "name": "Back Extension",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "tertiary",
    "equipmentTags": [
      "ghd",
      "bench"
    ],
    "primaryMuscles": "Lower Back, Glutes",
    "muscleCategory": [
      "back",
      "glutes"
    ],
    "specificGoal": "erectors-lower-back",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "bench",
      "ghd"
    ],
    "modality": "ghd",
    "commonIn": [
      "filthy-fifty"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "band-assisted-pull-up",
    "name": "Band-Assisted Pull-Up",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "tertiary",
    "equipmentTags": [
      "band"
    ],
    "primaryMuscles": "Lats, Biceps",
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "pull-up-bar",
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "band-face-pull",
    "name": "Band Face Pull",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "shoulders",
      "back"
    ],
    "specificGoal": "rear-delts-scapular",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "band-pull-apart",
    "name": "Band Pull-Apart",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "tertiary",
    "equipmentTags": [
      "band"
    ],
    "primaryMuscles": "Rear Delts, Rhomboids",
    "muscleCategory": [
      "back",
      "shoulders"
    ],
    "specificGoal": "rear-delts-scapular",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "barbell-back-squat",
    "name": "Barbell Back Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "primary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes",
      "full-body"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "barbell-bench-press",
    "name": "Barbell Bench Press",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "primary",
    "equipmentTags": [
      "barbell-rack",
      "bench"
    ],
    "primaryMuscles": "Chest, Triceps",
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "barbell-bent-over-row",
    "name": "Barbell Bent-Over Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "barbell-curl",
    "name": "Barbell Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Biceps",
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "biceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "barbell-hip-thrust",
    "name": "Barbell Hip Thrust",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack",
      "bench"
    ],
    "primaryMuscles": "Glutes, Hamstrings",
    "muscleCategory": [
      "hamstrings",
      "glutes"
    ],
    "specificGoal": "glutes-hip-extension",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "barbell-row",
    "name": "Barbell Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "primary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Lats, Rhomboids",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "barbell-upright-row",
    "name": "Barbell Upright Row",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "shoulders"
    ],
    "specificGoal": "side-delts",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "behind-the-neck-pulldown",
    "name": "Behind-the-Neck Pulldown",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "lat-pulldown",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "belt-squat",
    "name": "Belt Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes",
      "full-body"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "bench-dip",
    "name": "Bench Dip",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "triceps"
    ],
    "specificGoal": "triceps",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "bicycle-crunch",
    "name": "Bicycle Crunch",
    "sheet": "strength",
    "pattern": "core",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Core",
    "muscleCategory": [
      "core"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "bird-dog",
    "name": "Bird Dog",
    "sheet": "strength",
    "pattern": "core",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Core, Lower Back",
    "muscleCategory": [
      "back",
      "core"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "bodyweight-calf-raise",
    "name": "Bodyweight Calf Raise",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "calves"
    ],
    "specificGoal": "calves",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "bodyweight-squat",
    "name": "Bodyweight Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads",
      "glutes"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "box-squat",
    "name": "Box Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes",
      "full-body"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "bulgarian-split-squat",
    "name": "Bulgarian Split Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes",
      "full-body"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "running",
    "purpose": "Single-leg power",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cable-crossover",
    "name": "Cable Crossover",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Chest",
    "muscleCategory": [
      "chest"
    ],
    "specificGoal": "chest-isolation",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cable-crunch",
    "name": "Cable Crunch",
    "sheet": "strength",
    "pattern": "core",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Rectus Abdominis",
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "rectus-abdominis",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cable-curl",
    "name": "Cable Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Biceps",
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "biceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cable-fly",
    "name": "Cable Fly",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Chest",
    "muscleCategory": [
      "chest"
    ],
    "specificGoal": "chest-isolation",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer",
      "cable-machine",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cable-glute-kickback",
    "name": "Cable Glute Kickback",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Glutes",
    "muscleCategory": [
      "glutes"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cable-hip-abduction",
    "name": "Cable Hip Abduction",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Glute Medius",
    "muscleCategory": [
      "glutes"
    ],
    "specificGoal": "glute-medius",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cable-lateral-raise",
    "name": "Cable Lateral Raise",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Side Delts",
    "muscleCategory": [
      "shoulders",
      "core"
    ],
    "specificGoal": "side-delts",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cable-pull-through",
    "name": "Cable Pull-Through",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Glutes, Hamstrings",
    "muscleCategory": [
      "back",
      "hamstrings",
      "glutes"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cable-pullover",
    "name": "Cable Pullover",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Lats",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cable-row",
    "name": "Cable Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Lats, Rhomboids",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer",
      "seated-row",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cable-woodchop",
    "name": "Cable Woodchop",
    "sheet": "strength",
    "pattern": "core",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Obliques, Anti-Rotation",
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "anti-rotation",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "calf-raise",
    "name": "Calf Raise",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine",
      "bw"
    ],
    "primaryMuscles": "Calves",
    "muscleCategory": [
      "core",
      "calves"
    ],
    "specificGoal": "calves",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "cycling",
    "purpose": "Ankle power",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "chest-fly-machine",
    "name": "Chest Fly Machine",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Chest",
    "muscleCategory": [
      "chest"
    ],
    "specificGoal": "chest-isolation",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "chest-fly-machine",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "chest-press-machine",
    "name": "Chest Press Machine",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Chest, Triceps",
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "chest-press-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "chest-supported-row",
    "name": "Chest-Supported Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells",
      "bench"
    ],
    "primaryMuscles": "Upper Back",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "chin-up",
    "name": "Chin-Up",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "primary",
    "equipmentTags": [
      "pull-up-bar"
    ],
    "primaryMuscles": "Lats, Biceps",
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "pull-up-bar"
    ],
    "modality": "bodyweight",
    "commonIn": [
      "warm-up-circuit"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "close-grip-bench-press",
    "name": "Close-Grip Bench Press",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack",
      "bench"
    ],
    "primaryMuscles": "Chest, Triceps",
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "close-grip-lat-pulldown",
    "name": "Close-Grip Lat Pulldown",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "lat-pulldown",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "concentration-curl",
    "name": "Concentration Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Biceps",
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "biceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "conventional-deadlift",
    "name": "Conventional Deadlift",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "primary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Posterior Chain",
    "muscleCategory": [
      "back",
      "hamstrings",
      "glutes",
      "full-body"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "cossack-squat",
    "name": "Cossack Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Quads, Glutes, Adductors",
    "muscleCategory": [
      "quads",
      "glutes",
      "full-body"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "dead-bug",
    "name": "Dead Bug",
    "sheet": "strength",
    "pattern": "core",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": "Core, Hip Flexors",
    "muscleCategory": [
      "glutes",
      "core"
    ],
    "specificGoal": "lower-abs-hip-flexors",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": "swim",
    "purpose": "Core for body position",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "decline-bench-press",
    "name": "Decline Bench Press",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack",
      "dumbbells",
      "bench"
    ],
    "primaryMuscles": "Lower Chest, Triceps",
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": "lower-chest",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "decline-dumbbell-press",
    "name": "Decline Dumbbell Press",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "chest"
    ],
    "specificGoal": "lower-chest",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "decline-push-up",
    "name": "Decline Push-Up",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": "upper-chest",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "deficit-deadlift",
    "name": "Deficit Deadlift",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Posterior Chain",
    "muscleCategory": [
      "back",
      "hamstrings",
      "glutes",
      "full-body"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "dips",
    "name": "Dips",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": "Chest, Triceps",
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": "triceps",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "donkey-calf-raise",
    "name": "Donkey Calf Raise",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "calves"
    ],
    "specificGoal": "calves",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "bench",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "dumbbell-bench-press",
    "name": "Dumbbell Bench Press",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells",
      "bench"
    ],
    "primaryMuscles": "Chest, Triceps",
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "dumbbell-clean-and-press",
    "name": "Dumbbell Clean and Press",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "shoulders",
      "full-body"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "dumbbell-curl",
    "name": "Dumbbell Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Biceps",
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "biceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "dumbbell-fly",
    "name": "Dumbbell Fly",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells",
      "bench"
    ],
    "primaryMuscles": "Chest",
    "muscleCategory": [
      "chest"
    ],
    "specificGoal": "chest-isolation",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "dumbbell-romanian-deadlift",
    "name": "Dumbbell Romanian Deadlift",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "hamstrings",
      "glutes",
      "back"
    ],
    "specificGoal": "hamstrings-knee-flexion",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "dumbbell-row",
    "name": "Dumbbell Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells",
      "bench"
    ],
    "primaryMuscles": "Lats, Rhomboids",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "dumbbell-shoulder-press",
    "name": "Dumbbell Shoulder Press",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Shoulders",
    "muscleCategory": [
      "shoulders"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "dumbbell-shrug",
    "name": "Dumbbell Shrug",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "dumbbell-step-up",
    "name": "Dumbbell Step-Up",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads",
      "glutes"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "ez-bar-curl",
    "name": "EZ Bar Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "biceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "face-pull",
    "name": "Face Pull",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine",
      "band"
    ],
    "primaryMuscles": "Rear Delts, Rotator Cuff",
    "muscleCategory": [
      "back",
      "shoulders"
    ],
    "specificGoal": "rear-delts-scapular",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer",
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "swim",
    "purpose": "Shoulder health",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "farmer-walk",
    "name": "Farmer Walk",
    "sheet": "strength",
    "pattern": "carry",
    "tier": "primary",
    "equipmentTags": [
      "dumbbells",
      "kettlebell"
    ],
    "primaryMuscles": "Grip, Core, Traps",
    "muscleCategory": [
      "back",
      "core",
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "kettlebell"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "floor-press",
    "name": "Floor Press",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "tertiary",
    "equipmentTags": [
      "barbell-rack",
      "dumbbells"
    ],
    "primaryMuscles": "Chest, Triceps",
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "front-rack-carry",
    "name": "Front Rack Carry",
    "sheet": "strength",
    "pattern": "carry",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells",
      "kettlebell"
    ],
    "primaryMuscles": "Core, Upper Back",
    "muscleCategory": [
      "back",
      "core",
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "kettlebell"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "front-raise",
    "name": "Front Raise",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Front Delts",
    "muscleCategory": [
      "shoulders",
      "core"
    ],
    "specificGoal": "front-delts",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "front-squat",
    "name": "Front Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "primary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Quads, Core",
    "muscleCategory": [
      "quads",
      "core",
      "full-body"
    ],
    "specificGoal": "quads-emphasis",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "glute-bridge",
    "name": "Glute Bridge",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Glutes",
    "muscleCategory": [
      "glutes"
    ],
    "specificGoal": "glutes-hip-extension",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": "bodyweight",
    "commonIn": [
      "warm-up-circuit"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "glute-ham-raise",
    "name": "Glute-Ham Raise",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "tertiary",
    "equipmentTags": [
      "ghd"
    ],
    "primaryMuscles": "Hamstrings, Glutes",
    "muscleCategory": [
      "hamstrings",
      "glutes",
      "core"
    ],
    "specificGoal": "hamstrings-knee-flexion",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "ghd"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "goblet-squat",
    "name": "Goblet Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells",
      "kettlebell"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes",
      "full-body"
    ],
    "specificGoal": "quads-emphasis",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells",
      "kettlebell"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "good-morning",
    "name": "Good Morning",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "tertiary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Hamstrings, Lower Back",
    "muscleCategory": [
      "back",
      "hamstrings"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hack-squat",
    "name": "Hack Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-emphasis",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hack-squat-machine",
    "name": "Hack Squat (Machine)",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes",
      "full-body"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hammer-curl",
    "name": "Hammer Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Biceps, Brachialis",
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "biceps-brachialis",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "handstand-push-up",
    "name": "Handstand Push-Up",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Shoulders, Triceps, Core",
    "muscleCategory": [
      "chest",
      "shoulders",
      "triceps",
      "core"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hanging-leg-raise",
    "name": "Hanging Leg Raise",
    "sheet": "strength",
    "pattern": "core",
    "tier": "secondary",
    "equipmentTags": [
      "pull-up-bar"
    ],
    "primaryMuscles": "Lower Abs, Hip Flexors",
    "muscleCategory": [
      "glutes",
      "core"
    ],
    "specificGoal": "lower-abs-hip-flexors",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "pull-up-bar"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "heels-elevated-goblet-squat",
    "name": "Heels-Elevated Goblet Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes",
      "full-body"
    ],
    "specificGoal": "quads-emphasis",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hip-abductor-machine",
    "name": "Hip Abductor Machine",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Glute Medius",
    "muscleCategory": [
      "glutes"
    ],
    "specificGoal": "glute-medius",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "hip-abductor-adductor",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hip-adductor-machine",
    "name": "Hip Adductor Machine",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Adductors",
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": "adductors",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "hip-abductor-adductor",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hip-thrust",
    "name": "Hip Thrust",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack",
      "bench"
    ],
    "primaryMuscles": "Glutes",
    "muscleCategory": [
      "glutes"
    ],
    "specificGoal": "glutes-hip-extension",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "cycling",
    "purpose": "Glute power",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hip-thrust-machine",
    "name": "Hip Thrust (Machine)",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Glutes, Hamstrings",
    "muscleCategory": [
      "hamstrings",
      "glutes"
    ],
    "specificGoal": "glutes-hip-extension",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hollow-body-hold",
    "name": "Hollow Body Hold",
    "sheet": "strength",
    "pattern": "core",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": "Core, Transverse Abs",
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "core-stability",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "incline-barbell-bench-press",
    "name": "Incline Barbell Bench Press",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": "upper-chest",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "incline-dumbbell-bench-press",
    "name": "Incline Dumbbell Bench Press",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells",
      "bench"
    ],
    "primaryMuscles": "Upper Chest, Triceps, Shoulders",
    "muscleCategory": [
      "chest",
      "shoulders",
      "triceps"
    ],
    "specificGoal": "upper-chest",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "incline-dumbbell-curl",
    "name": "Incline Dumbbell Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells",
      "bench"
    ],
    "primaryMuscles": "Biceps",
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "upper-chest",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "incline-dumbbell-press",
    "name": "Incline Dumbbell Press",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": "upper-chest",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "incline-press",
    "name": "Incline Press",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack",
      "dumbbells",
      "bench"
    ],
    "primaryMuscles": "Upper Chest, Shoulders",
    "muscleCategory": [
      "chest",
      "shoulders"
    ],
    "specificGoal": "upper-chest",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "incline-push-up",
    "name": "Incline Push-Up",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": "lower-chest",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "inverted-row",
    "name": "Inverted Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Upper Back, Lats",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "kettlebell-deadlift",
    "name": "Kettlebell Deadlift",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "tertiary",
    "equipmentTags": [
      "kettlebell"
    ],
    "primaryMuscles": "Posterior Chain",
    "muscleCategory": [
      "back",
      "hamstrings",
      "glutes",
      "full-body"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "kettlebell"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "kettlebell-snatch",
    "name": "Kettlebell Snatch",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body",
      "shoulders"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "kettlebell"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "kettlebell-swing",
    "name": "Kettlebell Swing",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [
      "kettlebell"
    ],
    "primaryMuscles": "Glutes, Hamstrings",
    "muscleCategory": [
      "hamstrings",
      "glutes",
      "full-body"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "kettlebell"
    ],
    "modality": "kettlebell",
    "commonIn": [
      "helen",
      "filthy-fifty"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "knee-push-up",
    "name": "Knee Push-Up",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": "chest-isolation",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "landmine-press",
    "name": "Landmine Press",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Shoulders, Chest",
    "muscleCategory": [
      "chest",
      "shoulders"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "lat-pulldown",
    "name": "Lat Pulldown",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Lats",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer",
      "lat-pulldown"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "swim",
    "purpose": "Lat endurance",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "lateral-lunge",
    "name": "Lateral Lunge",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Quads, Glutes, Adductors",
    "muscleCategory": [
      "quads",
      "glutes"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "lateral-raise",
    "name": "Lateral Raise",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells",
      "cable-machine"
    ],
    "primaryMuscles": "Side Delts",
    "muscleCategory": [
      "shoulders",
      "core"
    ],
    "specificGoal": "side-delts",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "lateral-raise-machine",
    "name": "Lateral Raise (Machine)",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Side Delts",
    "muscleCategory": [
      "shoulders",
      "core"
    ],
    "specificGoal": "side-delts",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "leg-curl",
    "name": "Leg Curl",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Hamstrings",
    "muscleCategory": [
      "biceps",
      "hamstrings"
    ],
    "specificGoal": "hamstrings-knee-flexion",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "leg-curl"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "leg-extension",
    "name": "Leg Extension",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Quads",
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-emphasis",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "leg-extension"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "leg-press",
    "name": "Leg Press",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "leg-press"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "cycling",
    "purpose": "Quad strength",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "leg-press-single-leg",
    "name": "Leg Press (Single-Leg)",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "leg-press"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "leg-raise-standing",
    "name": "Leg Raise (Standing)",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Hip Flexors, Core",
    "muscleCategory": [
      "glutes",
      "core"
    ],
    "specificGoal": "lower-abs-hip-flexors",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "lying-leg-curl",
    "name": "Lying Leg Curl",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Hamstrings",
    "muscleCategory": [
      "biceps",
      "hamstrings"
    ],
    "specificGoal": "hamstrings-knee-flexion",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "leg-curl"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "lying-leg-raise",
    "name": "Lying Leg Raise",
    "sheet": "strength",
    "pattern": "core",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "lower-abs-hip-flexors",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "machine-lat-pulldown",
    "name": "Machine Lat Pulldown",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Lats, Biceps",
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "lat-pulldown",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "machine-row-chest-supported",
    "name": "Machine Row (Chest-Supported)",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Upper Back",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "seated-row",
      "bench",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "meadows-row",
    "name": "Meadows Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "tertiary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Lats, Upper Back",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "muscle-up",
    "name": "Muscle-Up",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "biceps",
      "triceps"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "pull-up-bar"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "neutral-grip-lat-pulldown",
    "name": "Neutral-Grip Lat Pulldown",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Lats, Biceps",
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer",
      "lat-pulldown"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "neutral-grip-pull-up",
    "name": "Neutral-Grip Pull-Up",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "pull-up-bar"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "nordic-ham-curl",
    "name": "Nordic Ham Curl",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Hamstrings",
    "muscleCategory": [
      "biceps",
      "hamstrings"
    ],
    "specificGoal": "hamstrings-knee-flexion",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "nordic-hamstring-curl",
    "name": "Nordic Hamstring Curl",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "hamstrings"
    ],
    "specificGoal": "hamstrings-knee-flexion",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "one-arm-dumbbell-row",
    "name": "One-Arm Dumbbell Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells",
      "bench"
    ],
    "primaryMuscles": "Lats, Upper Back",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "overhead-cable-triceps-extension",
    "name": "Overhead Cable Triceps Extension",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Triceps",
    "muscleCategory": [
      "shoulders",
      "triceps"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "overhead-carry",
    "name": "Overhead Carry",
    "sheet": "strength",
    "pattern": "carry",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells",
      "kettlebell"
    ],
    "primaryMuscles": "Shoulders, Core",
    "muscleCategory": [
      "shoulders",
      "core",
      "full-body"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "kettlebell"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "overhead-extension",
    "name": "Overhead Extension",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells",
      "cable-machine"
    ],
    "primaryMuscles": "Triceps",
    "muscleCategory": [
      "shoulders",
      "triceps"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "overhead-press",
    "name": "Overhead Press",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "primary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Shoulders, Triceps",
    "muscleCategory": [
      "shoulders",
      "triceps"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "overhead-tricep-extension",
    "name": "Overhead Tricep Extension",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "triceps"
    ],
    "specificGoal": "triceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "pallof-press",
    "name": "Pallof Press",
    "sheet": "strength",
    "pattern": "core",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine",
      "band"
    ],
    "primaryMuscles": "Anti-Rotation Core",
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "anti-rotation",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer",
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "swim",
    "purpose": "Rotational stability",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "pause-back-squat",
    "name": "Pause Back Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Quads, Glutes, Core",
    "muscleCategory": [
      "quads",
      "glutes",
      "core",
      "full-body"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "pec-deck",
    "name": "Pec Deck",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Chest",
    "muscleCategory": [
      "chest"
    ],
    "specificGoal": "chest-isolation",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "chest-fly-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "pec-deck-fly",
    "name": "Pec Deck Fly",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "chest"
    ],
    "specificGoal": "chest-isolation",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "chest-fly-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "pendlay-row",
    "name": "Pendlay Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "pike-push-up",
    "name": "Pike Push-Up",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Shoulders, Triceps",
    "muscleCategory": [
      "chest",
      "shoulders",
      "triceps"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "pistol-squat",
    "name": "Pistol Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Quads, Glutes, Core",
    "muscleCategory": [
      "quads",
      "glutes",
      "core",
      "full-body"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "plank",
    "name": "Plank",
    "sheet": "strength",
    "pattern": "core",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": "Core, Transverse Abs",
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "core-stability",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "plate-carry",
    "name": "Plate Carry",
    "sheet": "strength",
    "pattern": "carry",
    "tier": "tertiary",
    "equipmentTags": [
      "weight-plate"
    ],
    "primaryMuscles": "Core, Forearms",
    "muscleCategory": [
      "core",
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "weight-plate"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "power-clean",
    "name": "Power Clean",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body",
      "hamstrings",
      "glutes"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "preacher-curl",
    "name": "Preacher Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells",
      "barbell-rack",
      "bench"
    ],
    "primaryMuscles": "Biceps",
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "biceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "pull-up",
    "name": "Pull-Up",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "primary",
    "equipmentTags": [
      "pull-up-bar"
    ],
    "primaryMuscles": "Lats, Biceps",
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "pull-up-bar"
    ],
    "modality": "bodyweight",
    "commonIn": [
      "murph",
      "cindy",
      "fran",
      "helen"
    ],
    "sport": "swim",
    "purpose": "Lat strength",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "push-press",
    "name": "Push Press",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Shoulders, Triceps",
    "muscleCategory": [
      "shoulders",
      "triceps"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": "barbell",
    "commonIn": [
      "filthy-fifty"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "push-up",
    "name": "Push-Up",
    "sheet": "strength",
    "pattern": "horizontal-push",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": "Chest, Triceps",
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [
      "murph",
      "cindy",
      "row-chipper"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "rack-pull",
    "name": "Rack Pull",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Posterior Chain",
    "muscleCategory": [
      "back",
      "glutes"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "rear-delt-fly",
    "name": "Rear Delt Fly",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells",
      "cable-machine"
    ],
    "primaryMuscles": "Rear Delts",
    "muscleCategory": [
      "chest",
      "shoulders"
    ],
    "specificGoal": "chest-isolation",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "functional-trainer",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "rear-delt-fly-machine",
    "name": "Rear Delt Fly (Machine)",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Rear Delts",
    "muscleCategory": [
      "chest",
      "shoulders"
    ],
    "specificGoal": "chest-isolation",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "bench",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "renegade-rows",
    "name": "Renegade Rows",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "core"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "resistance-band-curl",
    "name": "Resistance Band Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "biceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "resistance-band-overhead-press",
    "name": "Resistance Band Overhead Press",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "shoulders"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "resistance-band-row",
    "name": "Resistance Band Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "resistance-band-squat",
    "name": "Resistance Band Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads",
      "glutes"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "resistance-band-tricep-pushdown",
    "name": "Resistance Band Tricep Pushdown",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "triceps"
    ],
    "specificGoal": "triceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "reverse-crunch",
    "name": "Reverse Crunch",
    "sheet": "strength",
    "pattern": "core",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Lower Abs",
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "lower-abs-hip-flexors",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "reverse-curl",
    "name": "Reverse Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "biceps-brachialis",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "reverse-grip-barbell-row",
    "name": "Reverse-Grip Barbell Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "reverse-lunge",
    "name": "Reverse Lunge",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "reverse-pec-deck",
    "name": "Reverse Pec Deck",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Rear Delts",
    "muscleCategory": [
      "chest",
      "shoulders"
    ],
    "specificGoal": "chest-isolation",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "chest-fly-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "romanian-deadlift",
    "name": "Romanian Deadlift",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack",
      "dumbbells"
    ],
    "primaryMuscles": "Hamstrings, Glutes",
    "muscleCategory": [
      "back",
      "hamstrings",
      "glutes",
      "full-body"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "cycling",
    "purpose": "Hamstring balance",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "rope-triceps-pushdown",
    "name": "Rope Triceps Pushdown",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Triceps",
    "muscleCategory": [
      "triceps"
    ],
    "specificGoal": "triceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "russian-twist",
    "name": "Russian Twist",
    "sheet": "strength",
    "pattern": "core",
    "tier": "tertiary",
    "equipmentTags": [
      "weight-plate"
    ],
    "primaryMuscles": "Obliques, Core",
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "obliques",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "weight-plate"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "safety-bar-squat",
    "name": "Safety Bar Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads",
      "glutes"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "sandbag-carry",
    "name": "Sandbag Carry",
    "sheet": "strength",
    "pattern": "carry",
    "tier": "secondary",
    "equipmentTags": [
      "sandbag"
    ],
    "primaryMuscles": "Full Body",
    "muscleCategory": [
      "core",
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "seated-cable-row",
    "name": "Seated Cable Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "seated-row",
      "bench",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "seated-calf-raise",
    "name": "Seated Calf Raise",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Calves",
    "muscleCategory": [
      "core",
      "calves"
    ],
    "specificGoal": "calves",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "seated-dumbbell-shoulder-press",
    "name": "Seated Dumbbell Shoulder Press",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "shoulders",
      "triceps"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "seated-leg-curl",
    "name": "Seated Leg Curl",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Hamstrings",
    "muscleCategory": [
      "biceps",
      "hamstrings"
    ],
    "specificGoal": "hamstrings-knee-flexion",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "leg-curl"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "seated-row-machine",
    "name": "Seated Row (Machine)",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Lats, Rhomboids",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "seated-row",
      "bench",
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "seated-shoulder-press-machine",
    "name": "Seated Shoulder Press Machine",
    "sheet": "strength",
    "pattern": "vertical-push",
    "tier": "secondary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Shoulders, Triceps",
    "muscleCategory": [
      "shoulders",
      "triceps"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "shoulder-press-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "side-plank",
    "name": "Side Plank",
    "sheet": "strength",
    "pattern": "core",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Obliques",
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "core-stability",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "single-arm-lat-pulldown",
    "name": "Single-Arm Lat Pulldown",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Lats",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer",
      "lat-pulldown"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "single-leg-glute-bridge",
    "name": "Single-Leg Glute Bridge",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "glutes",
      "hamstrings"
    ],
    "specificGoal": "glutes-hip-extension",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "single-leg-rdl",
    "name": "Single-leg RDL",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "hamstrings",
      "glutes"
    ],
    "specificGoal": "hamstrings-knee-flexion",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "single-leg-romanian-deadlift",
    "name": "Single-Leg Romanian Deadlift",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells",
      "kettlebell"
    ],
    "primaryMuscles": "Hamstrings, Glutes, Core",
    "muscleCategory": [
      "back",
      "hamstrings",
      "glutes",
      "core",
      "full-body"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "kettlebell"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "sissy-squat",
    "name": "Sissy Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Quads",
    "muscleCategory": [
      "quads",
      "full-body"
    ],
    "specificGoal": "quads-emphasis",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "skull-crusher",
    "name": "Skull Crusher",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Triceps",
    "muscleCategory": [
      "triceps"
    ],
    "specificGoal": "triceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "smith-machine-squat",
    "name": "Smith Machine Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "smith-machine"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes",
      "full-body"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "smith-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "snatch-grip-deadlift",
    "name": "Snatch-Grip Deadlift",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "hamstrings",
      "glutes",
      "back"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "spider-curl",
    "name": "Spider Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "biceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "standing-calf-raise",
    "name": "Standing Calf Raise",
    "sheet": "strength",
    "pattern": "isolation-legs",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine",
      "bw"
    ],
    "primaryMuscles": "Calves",
    "muscleCategory": [
      "core",
      "calves"
    ],
    "specificGoal": "calves",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "step-up",
    "name": "Step-Up",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "running",
    "purpose": "Running-specific strength",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "stiff-leg-deadlift",
    "name": "Stiff-Leg Deadlift",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "hamstrings",
      "glutes"
    ],
    "specificGoal": "hamstrings-knee-flexion",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "straight-arm-pulldown",
    "name": "Straight-Arm Pulldown",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Lats",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "swim",
    "purpose": "Lat endurance",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "suitcase-carry",
    "name": "Suitcase Carry",
    "sheet": "strength",
    "pattern": "carry",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells",
      "kettlebell"
    ],
    "primaryMuscles": "Obliques, Grip",
    "muscleCategory": [
      "core",
      "full-body"
    ],
    "specificGoal": "obliques",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "kettlebell"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "sumo-deadlift",
    "name": "Sumo Deadlift",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "primary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Posterior Chain, Adductors",
    "muscleCategory": [
      "back",
      "hamstrings",
      "glutes",
      "full-body"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "superman",
    "name": "Superman",
    "sheet": "strength",
    "pattern": "core",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "core"
    ],
    "specificGoal": "erectors-lower-back",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "t-bar-row",
    "name": "T-Bar Row",
    "sheet": "strength",
    "pattern": "horizontal-pull",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Upper Back, Lats",
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "tempo-squat",
    "name": "Tempo Squat",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "barbell-rack"
    ],
    "primaryMuscles": "Quads, Glutes, Core",
    "muscleCategory": [
      "quads",
      "glutes",
      "core",
      "full-body"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "trap-bar-deadlift",
    "name": "Trap Bar Deadlift",
    "sheet": "strength",
    "pattern": "hinge",
    "tier": "secondary",
    "equipmentTags": [
      "trap-bar"
    ],
    "primaryMuscles": "Posterior Chain",
    "muscleCategory": [
      "back",
      "hamstrings",
      "glutes",
      "full-body"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "trap-bar"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "tricep-dip",
    "name": "Tricep Dip",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "triceps",
      "chest"
    ],
    "specificGoal": "triceps",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "tricep-kickback",
    "name": "Tricep Kickback",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "triceps"
    ],
    "specificGoal": "triceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "tricep-pushdown",
    "name": "Tricep Pushdown",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "cable-machine"
    ],
    "primaryMuscles": "Triceps",
    "muscleCategory": [
      "triceps"
    ],
    "specificGoal": "triceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "triceps-dip-bench",
    "name": "Triceps Dip (Bench)",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [
      "bench"
    ],
    "primaryMuscles": "Triceps",
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": "triceps",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "waiter-walk",
    "name": "Waiter Walk",
    "sheet": "strength",
    "pattern": "carry",
    "tier": "tertiary",
    "equipmentTags": [
      "dumbbells",
      "kettlebell"
    ],
    "primaryMuscles": "Shoulders, Core",
    "muscleCategory": [
      "shoulders",
      "core",
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "kettlebell"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "walking-lunge",
    "name": "Walking Lunge",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "secondary",
    "equipmentTags": [
      "dumbbells"
    ],
    "primaryMuscles": "Quads, Glutes",
    "muscleCategory": [
      "quads",
      "glutes"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": "bodyweight",
    "commonIn": [
      "filthy-fifty"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "wall-sit",
    "name": "Wall Sit",
    "sheet": "strength",
    "pattern": "squat",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": "Quads",
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "weighted-dip",
    "name": "Weighted Dip",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "triceps",
      "chest"
    ],
    "specificGoal": "triceps",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "weighted-plank",
    "name": "Weighted Plank",
    "sheet": "strength",
    "pattern": "core",
    "tier": "tertiary",
    "equipmentTags": [
      "weight-plate"
    ],
    "primaryMuscles": "Core",
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "core-stability",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "weight-plate"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "weighted-pull-up",
    "name": "Weighted Pull-Up",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "pull-up-bar",
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "wide-grip-pull-up",
    "name": "Wide-Grip Pull-Up",
    "sheet": "strength",
    "pattern": "vertical-pull",
    "tier": "primary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "biceps"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "pull-up-bar"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "wrist-curl",
    "name": "Wrist Curl",
    "sheet": "strength",
    "pattern": "isolation-arms",
    "tier": "tertiary",
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "abs-generic",
    "name": "Abs (generic)",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [
      "warm-up-circuit"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Core / Midline"
  },
  {
    "id": "air-squats",
    "name": "Air Squats",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [
      "murph",
      "cindy"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Lower Body BW"
  },
  {
    "id": "ball-toss-squats",
    "name": "Ball Toss Squats",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "med-ball"
    ],
    "modality": "med-ball",
    "commonIn": [
      "3-2-1-mile-pyramid"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Weighted"
  },
  {
    "id": "battle-ropes",
    "name": "Battle Ropes",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "shoulders",
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "cardio",
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "bear-crawl",
    "name": "Bear Crawl",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Upper Body BW"
  },
  {
    "id": "bike-stationary",
    "name": "Bike (Stationary)",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "cardio",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Cardio Steps"
  },
  {
    "id": "box-jumps",
    "name": "Box Jumps",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [
      "filthy-fifty",
      "warm-up"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Lower Body BW"
  },
  {
    "id": "broad-jumps",
    "name": "Broad Jumps",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Lower Body BW"
  },
  {
    "id": "burpee-broad-jump",
    "name": "Burpee Broad Jump",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [
      "hyrox"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": true,
    "hyroxOrder": 4,
    "defaultDistance": "80m",
    "defaultWeight": null,
    "circuitCategory": "Lower Body BW"
  },
  {
    "id": "burpees",
    "name": "Burpees",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [
      "filthy-fifty",
      "row-chipper"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Lower Body BW"
  },
  {
    "id": "butt-kicks",
    "name": "Butt Kicks",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "cardio",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Cardio Steps"
  },
  {
    "id": "chest-pulls",
    "name": "Chest Pulls",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": "bodyweight-band",
    "commonIn": [
      "warm-up-circuit"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Mobility"
  },
  {
    "id": "deadlifts",
    "name": "Deadlifts",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "hamstrings",
      "glutes"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": "barbell",
    "commonIn": [
      "3-2-1-mile-pyramid"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Weighted"
  },
  {
    "id": "devil-press",
    "name": "Devil Press",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": "dumbbell-kettlebell",
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "diamond-push-ups",
    "name": "Diamond Push-ups",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "chest"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Upper Body BW"
  },
  {
    "id": "dips-bench",
    "name": "Dips (Bench)",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "chest",
      "triceps"
    ],
    "specificGoal": "triceps",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "bench"
    ],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Upper Body BW"
  },
  {
    "id": "double-unders",
    "name": "Double-Unders",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "jump-rope"
    ],
    "modality": "jump-rope",
    "commonIn": [
      "filthy-fifty"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Cardio Steps"
  },
  {
    "id": "dumbbell-snatches",
    "name": "Dumbbell Snatches",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "kettlebell"
    ],
    "modality": "dumbbell-kettlebell",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Weighted"
  },
  {
    "id": "dumbbell-thrusters",
    "name": "Dumbbell Thrusters",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "kettlebell"
    ],
    "modality": "dumbbell-kettlebell",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Weighted"
  },
  {
    "id": "hand-release-push-ups",
    "name": "Hand-Release Push-ups",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "chest"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Upper Body BW"
  },
  {
    "id": "high-knees",
    "name": "High Knees",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "cardio",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Cardio Steps"
  },
  {
    "id": "hip-90-90",
    "name": "Hip 90/90",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [
      "warm-up-circuit"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Core / Midline"
  },
  {
    "id": "hollow-rocks",
    "name": "Hollow Rocks",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "core"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Core / Midline"
  },
  {
    "id": "inchworms",
    "name": "Inchworms",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Upper Body BW"
  },
  {
    "id": "jump-rope",
    "name": "Jump Rope",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "calves",
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "jump-rope"
    ],
    "modality": "jump-rope",
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "jump-squats",
    "name": "Jump Squats",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Lower Body BW"
  },
  {
    "id": "jumping-jacks",
    "name": "Jumping Jacks",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "cardio",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Cardio Steps"
  },
  {
    "id": "jumping-lunges",
    "name": "Jumping Lunges",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Lower Body BW"
  },
  {
    "id": "jumping-pull-ups",
    "name": "Jumping Pull-ups",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "pull-up-bar"
    ],
    "modality": "bodyweight",
    "commonIn": [
      "filthy-fifty"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Upper Body BW"
  },
  {
    "id": "kettlebell-clean-press",
    "name": "Kettlebell Clean & Press",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "shoulders"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "kettlebell"
    ],
    "modality": "kettlebell",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Weighted"
  },
  {
    "id": "kettlebell-goblet-squats",
    "name": "Kettlebell Goblet Squats",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-emphasis",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "kettlebell"
    ],
    "modality": "kettlebell",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Weighted"
  },
  {
    "id": "kettlebell-high-pull",
    "name": "Kettlebell High Pull",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "kettlebell"
    ],
    "modality": "kettlebell",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Weighted"
  },
  {
    "id": "knees-to-elbows",
    "name": "Knees-to-Elbows",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [
      "filthy-fifty"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Upper Body BW"
  },
  {
    "id": "medicine-ball-slams",
    "name": "Medicine Ball Slams",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "med-ball"
    ],
    "modality": "med-ball",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Weighted"
  },
  {
    "id": "mountain-climbers",
    "name": "Mountain Climbers",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Core / Midline"
  },
  {
    "id": "overhead-snatches",
    "name": "Overhead Snatches",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "shoulders"
    ],
    "specificGoal": "overhead-strength",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "kettlebell"
    ],
    "modality": "dumbbell-kettlebell",
    "commonIn": [
      "3-2-1-mile-pyramid"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Weighted"
  },
  {
    "id": "plank-jacks",
    "name": "Plank Jacks",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "core-stability",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Core / Midline"
  },
  {
    "id": "row-rowing",
    "name": "Row / Rowing",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "rowing-machine"
    ],
    "modality": "machine",
    "commonIn": [
      "row-chipper",
      "hyrox"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Cardio Steps"
  },
  {
    "id": "run",
    "name": "Run",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "cardio",
    "commonIn": [
      "murph",
      "helen",
      "pyramid"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Cardio Steps"
  },
  {
    "id": "sit-ups",
    "name": "Sit-ups",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "core"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [
      "circuit-mockup"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Core / Midline"
  },
  {
    "id": "skater-jumps",
    "name": "Skater Jumps",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Lower Body BW"
  },
  {
    "id": "ski-hops",
    "name": "Ski Hops",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "cardio",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Cardio Steps"
  },
  {
    "id": "step-ups-box",
    "name": "Step-Ups (Box)",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Lower Body BW"
  },
  {
    "id": "thrusters",
    "name": "Thrusters",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": "barbell",
    "commonIn": [
      "fran"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Weighted"
  },
  {
    "id": "turkish-get-up",
    "name": "Turkish Get-Up",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body",
      "core"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "kettlebell"
    ],
    "modality": "kettlebell",
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "v-ups",
    "name": "V-Ups",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Core / Midline"
  },
  {
    "id": "wall-balls",
    "name": "Wall Balls",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "med-ball"
    ],
    "modality": "med-ball",
    "commonIn": [
      "filthy-fifty",
      "hyrox"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": true,
    "hyroxOrder": 8,
    "defaultDistance": "75 reps",
    "defaultWeight": "20 lb (M) / 14 lb (W)",
    "circuitCategory": "Weighted"
  },
  {
    "id": "world-s-greatest-stretch",
    "name": "World’s Greatest Stretch",
    "sheet": "circuit",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": "bodyweight",
    "commonIn": [],
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "circuitCategory": "Mobility"
  },
  {
    "id": "farmer-carry",
    "name": "Farmer Carry",
    "sheet": "hyrox",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": [
      "hyrox"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": true,
    "hyroxOrder": 6,
    "defaultDistance": "200m",
    "defaultWeight": "53 lb per hand"
  },
  {
    "id": "rowing",
    "name": "Rowing",
    "sheet": "hyrox",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": [
      "hyrox"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": true,
    "hyroxOrder": 5,
    "defaultDistance": "1000m",
    "defaultWeight": null
  },
  {
    "id": "sandbag-lunges",
    "name": "Sandbag Lunges",
    "sheet": "hyrox",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": [
      "hyrox"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": true,
    "hyroxOrder": 7,
    "defaultDistance": "100m",
    "defaultWeight": "44 lb"
  },
  {
    "id": "skierg",
    "name": "SkiErg",
    "sheet": "hyrox",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": [
      "hyrox"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": true,
    "hyroxOrder": 1,
    "defaultDistance": "1000m",
    "defaultWeight": null
  },
  {
    "id": "sled-pull",
    "name": "Sled Pull",
    "sheet": "hyrox",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": [
      "hyrox"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": true,
    "hyroxOrder": 3,
    "defaultDistance": "50m",
    "defaultWeight": "78 lb"
  },
  {
    "id": "sled-push",
    "name": "Sled Push",
    "sheet": "hyrox",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": [
      "hyrox"
    ],
    "sport": null,
    "purpose": null,
    "isHyroxStation": true,
    "hyroxOrder": 2,
    "defaultDistance": "50m",
    "defaultWeight": "335 lb (M) / 235 lb (W)"
  },
  {
    "id": "banded-lateral-walks",
    "name": "Banded Lateral Walks",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "shoulders"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "running",
    "purpose": "Glute med activation",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "copenhagen-plank",
    "name": "Copenhagen Plank",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "core"
    ],
    "specificGoal": "core-stability",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": "running",
    "purpose": "Adductor strength",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "external-rotation-band-cable",
    "name": "External Rotation (Band/Cable)",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer",
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "swim",
    "purpose": "Rotator cuff",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hamstring-curls",
    "name": "Hamstring Curls",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "biceps"
    ],
    "specificGoal": "biceps",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "cable-machine"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "cycling",
    "purpose": "Hamstring balance",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hip-airplanes",
    "name": "Hip Airplanes",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": "running",
    "purpose": "Hip stability",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "hip-bridges",
    "name": "Hip Bridges",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "barbell-rack"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "cycling",
    "purpose": "Glute activation",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "lateral-band-walks",
    "name": "Lateral Band Walks",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "shoulders"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "band"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "running",
    "purpose": "Hip stabilizer activation",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "lunges",
    "name": "Lunges",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "cycling",
    "purpose": "Single-leg stability",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "rows",
    "name": "Rows",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "functional-trainer",
      "seated-row",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "swim",
    "purpose": "Pulling power",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "scapular-pull-ups",
    "name": "Scapular Pull-ups",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "lats-vertical",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "pull-up-bar"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "swim",
    "purpose": "Scap control",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "single-arm-dumbbell-row",
    "name": "Single-Arm Dumbbell Row",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back"
    ],
    "specificGoal": "mid-back-lats",
    "usesWeights": true,
    "canBeBodyweight": false,
    "equipmentNeeded": [
      "dumbbells",
      "bench"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "swim",
    "purpose": "Upper back strength",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "single-leg-calf-raise",
    "name": "Single-Leg Calf Raise",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "shoulders",
      "core",
      "calves"
    ],
    "specificGoal": "calves",
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": "running",
    "purpose": "Ankle stiffness",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "single-leg-deadlift",
    "name": "Single-Leg Deadlift",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "back",
      "hamstrings",
      "glutes"
    ],
    "specificGoal": "posterior-chain",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "running",
    "purpose": "Unilateral hip stability",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "single-leg-squat-to-box",
    "name": "Single-Leg Squat to Box",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": "running",
    "purpose": "Unilateral control",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "split-squats",
    "name": "Split Squats",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": null,
    "commonIn": null,
    "sport": "cycling",
    "purpose": "Single-leg strength",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "squats-2",
    "name": "Squats",
    "sheet": "sport-specific",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "quads"
    ],
    "specificGoal": "quads-glutes",
    "usesWeights": true,
    "canBeBodyweight": true,
    "equipmentNeeded": [
      "dumbbells"
    ],
    "modality": "bodyweight",
    "commonIn": [
      "row-chipper"
    ],
    "sport": "cycling",
    "purpose": "Pedaling power",
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null
  },
  {
    "id": "brick-run-bike-to-run",
    "name": "Brick Run (Bike-to-Run)",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "brick"
  },
  {
    "id": "css-repeats",
    "name": "CSS Repeats",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "swim"
  },
  {
    "id": "easy-run",
    "name": "Easy Run",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "run"
  },
  {
    "id": "endurance-ride",
    "name": "Endurance Ride",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "bike"
  },
  {
    "id": "endurance-swim",
    "name": "Endurance Swim",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "swim"
  },
  {
    "id": "fartlek-run",
    "name": "Fartlek Run",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "run"
  },
  {
    "id": "hill-climb-intervals",
    "name": "Hill Climb Intervals",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "bike"
  },
  {
    "id": "hill-repeats",
    "name": "Hill Repeats",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "run"
  },
  {
    "id": "interval-run",
    "name": "Interval Run",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "run"
  },
  {
    "id": "long-run",
    "name": "Long Run",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "run"
  },
  {
    "id": "open-water-swim",
    "name": "Open Water Swim",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "swim"
  },
  {
    "id": "recovery-ride",
    "name": "Recovery Ride",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "bike"
  },
  {
    "id": "recovery-run",
    "name": "Recovery Run",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "run"
  },
  {
    "id": "sprint-intervals",
    "name": "Sprint Intervals",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "run"
  },
  {
    "id": "sweet-spot-intervals",
    "name": "Sweet Spot Intervals",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "bike"
  },
  {
    "id": "swim-drill-session",
    "name": "Swim Drill Session",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "swim"
  },
  {
    "id": "swim-intervals",
    "name": "Swim Intervals",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "swim"
  },
  {
    "id": "tempo-ride",
    "name": "Tempo Ride",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "bike"
  },
  {
    "id": "tempo-run",
    "name": "Tempo Run",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "run"
  },
  {
    "id": "threshold-intervals",
    "name": "Threshold Intervals",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "run"
  },
  {
    "id": "threshold-ride",
    "name": "Threshold Ride",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "bike"
  },
  {
    "id": "vo2max-intervals-bike",
    "name": "VO2max Intervals (Bike)",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "bike"
  },
  {
    "id": "walk-run-intervals",
    "name": "Walk/Run Intervals",
    "sheet": "cardio-session",
    "pattern": null,
    "tier": null,
    "equipmentTags": [],
    "primaryMuscles": null,
    "muscleCategory": [
      "full-body"
    ],
    "specificGoal": null,
    "usesWeights": false,
    "canBeBodyweight": false,
    "equipmentNeeded": [],
    "modality": null,
    "commonIn": null,
    "sport": null,
    "purpose": null,
    "isHyroxStation": false,
    "hyroxOrder": null,
    "defaultDistance": null,
    "defaultWeight": null,
    "discipline": "run"
  }
];
})();
