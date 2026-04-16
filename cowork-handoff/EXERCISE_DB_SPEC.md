# Exercise Database Integration — Spec

## The problem

IronZ has an expanded exercise library (spreadsheet) with rich metadata per exercise: movement pattern, tier, equipment, muscle categories, bodyweight capability, weight requirements. But the app's planner and workout builders don't reference this data. Exercise selection is either hardcoded or generic. The metadata exists but isn't enforced — so a bodyweight-only user can get assigned Barbell Back Squats, and a strength exercise with weights never prompts for load input.

## The fix

Convert the spreadsheet into a runtime JS data file, build a filter API on top of it, and wire the planner + builders to query it.

## Architecture

### Layer 1: `exercise-data.js` — the canonical exercise database

A single JS file that exports `window.EXERCISE_DB` as a flat array. Every exercise from all 4 sheets (Strength, Circuit & Bodyweight, Hyrox Stations, Sport-Specific Strength) lives in one array.

```javascript
window.EXERCISE_DB = [
  {
    id: "barbell-back-squat",           // kebab-case, unique
    name: "Barbell Back Squat",         // display name
    sheet: "strength",                  // origin: "strength" | "circuit" | "hyrox" | "sport-specific"
    pattern: "squat",                   // movement pattern (strength sheet only)
    tier: "primary",                    // "primary" | "secondary" | "tertiary"
    equipmentTags: ["barbell", "rack"], // normalized equipment tokens
    primaryMuscles: "Quads, Glutes",    // from col E
    muscleCategory: ["quads", "glutes", "full-body"],  // normalized tokens from col F
    specificGoal: "quads-glutes",       // normalized from col G
    usesWeights: true,                  // boolean from col H
    canBeBodyweight: false,             // boolean from col I
    equipmentNeeded: ["barbell-rack"],  // normalized tokens from col J
    // Circuit-specific fields (null for strength exercises):
    modality: null,                     // "bodyweight" | "barbell" | "kettlebell" | "med-ball" | "cardio" | etc.
    commonIn: null,                     // ["murph", "cindy", ...] benchmark WODs
    // Sport-specific fields (null for non-sport exercises):
    sport: null,                        // "swim" | "cycling" | "running"
    purpose: null,                      // "Pulling power" | "Lat strength" | etc.
    // Hyrox-specific fields:
    isHyroxStation: false,
    hyroxOrder: null,                   // 1-8
    defaultDistance: null,
    defaultWeight: null
  },
  // ... ~200 exercises
];
```

**Generation:** This file is generated from the spreadsheet via a build script (`scripts/generate-exercise-data.js` or a Python script). The spreadsheet remains the source of truth — edit the spreadsheet, re-run the script, commit the updated `exercise-data.js`. No manual editing of the JS file.

**Script tag:** Add `<script src="exercise-data.js"></script>` in `index.html` BEFORE `exercise-library.js` and `planner.js`.

### Layer 2: `exercise-filters.js` — the query API

Exports `window.ExerciseDB` with query methods. This is the only interface the rest of the app uses to find exercises.

```javascript
window.ExerciseDB = {

  // Core query — returns filtered array of exercise objects
  query(filters) { ... },

  // Convenience methods built on query()
  getByPattern(pattern, options) { ... },
  getByMuscle(muscleCategory, options) { ... },
  getForSport(sport) { ... },
  getHyroxStations() { ... },
  getCircuitExercises(options) { ... },
  getById(id) { ... },
  getByName(name) { ... },

  // Equipment-aware selection
  getAvailable(userEquipment) { ... },

  // Random selection with constraints
  pick(filters, count) { ... },
};
```

#### `query(filters)` — the core method

```javascript
ExerciseDB.query({
  sheet: "strength",              // optional: limit to sheet
  pattern: "squat",               // optional: movement pattern
  tier: "primary",                // optional: tier or array of tiers
  muscle: "quads",                // optional: matches muscleCategory array
  bodyweightOnly: true,           // optional: only canBeBodyweight === true
  equipment: ["dumbbells", "bench"],  // optional: user's available equipment
  sport: "running",              // optional: sport-specific filter
  excludeIds: ["wall-sit"],      // optional: exclude specific exercises
})
// Returns: [exercise, exercise, ...]
```

#### Equipment matching logic

The user's equipment profile is stored in `localStorage.equipmentProfile` (array of equipment tokens). When `equipment` filter is provided:

1. If exercise `canBeBodyweight === true`, it always passes (no equipment needed)
2. If exercise `canBeBodyweight === false`, check that ALL items in exercise's `equipmentNeeded` are present in the user's equipment list
3. If user has no equipment profile set, return all exercises (no filtering)

Equipment token normalization (canonical list):
```
bodyweight, dumbbells, barbell-rack, kettlebell, pull-up-bar, bench,
cable-machine, functional-trainer, leg-press, leg-curl, leg-extension,
smith-machine, ghd, ab-wheel, band, jump-rope, med-ball, rowing-machine,
ski-erg, sled, sandbag, trap-bar, weight-plate,
hip-abductor-adductor, chest-press-machine, chest-fly-machine,
shoulder-press-machine, lat-pulldown, seated-row
```

### Layer 3: Integration points

#### 3a. Planner (`planner.js`)

When `generateTrainingPlan` builds a strength day:

```javascript
// Old (hardcoded):
exercises: ["Barbell Back Squat", "Romanian Deadlift", "Bench Press"]

// New (queried):
const userEquip = JSON.parse(localStorage.equipmentProfile || '[]');
const squat = ExerciseDB.pick({ pattern: 'squat', tier: ['primary', 'secondary'], equipment: userEquip }, 1);
const hinge = ExerciseDB.pick({ pattern: 'hinge', tier: ['primary', 'secondary'], equipment: userEquip }, 1);
const push  = ExerciseDB.pick({ pattern: 'horizontal-push', tier: ['primary', 'secondary'], equipment: userEquip }, 1);
```

The planner uses `pick()` which selects randomly from matching exercises, with optional weighting toward Primary tier. This gives plan variety across regenerations.

**Critical: diversity across sub-targets.** When the planner picks multiple exercises for the same muscle group (e.g., 3 Horizontal Push exercises for a chest session), `pick()` must spread across different `specificGoal` values before repeating any. See "Exercise Selection Diversity Rules" below.

#### 3b. Workout builders (Add Session + Build a Plan Manual)

When the user adds a strength exercise manually:
- The exercise picker dropdown/search is populated from `ExerciseDB.query({ equipment: userEquip })`
- Grouped by movement pattern for easy browsing
- When an exercise with `usesWeights: true` is selected, show weight input fields
- When an exercise with `usesWeights: false` is selected, hide weight inputs (show reps/time only)

#### 3c. Circuit builder

When building a circuit:
- Exercise suggestions come from `ExerciseDB.getCircuitExercises({ equipment: userEquip })`
- Benchmark WODs (Murph, Cindy, etc.) pull their exercise lists from `EXERCISE_DB` filtered by `commonIn`

#### 3d. Sport-specific strength

When generating strength work for a triathlete:
- `ExerciseDB.getForSport('swim')` returns the swim-specific strength exercises
- These supplement the general strength pattern selection

#### 3e. Onboarding equipment profile

The onboarding flow (or Settings) needs an equipment checklist screen:
- Show the canonical equipment list with checkboxes
- Save to `localStorage.equipmentProfile`
- Add `'equipmentProfile'` to SYNCED_KEYS in `db.js`
- This powers all downstream exercise filtering

## UI enforcement rules

These rules are enforced by the filter API and the builders:

| Condition | Behavior |
|-----------|----------|
| `canBeBodyweight === false` | Never appears in bodyweight-only plans or when user has no equipment |
| `usesWeights === true` | UI always shows weight input (sets × reps × weight) |
| `usesWeights === false` | UI shows reps or time only, no weight field |
| `canBeBodyweight === true` AND `usesWeights === true` | User can toggle between weighted and bodyweight mode. If bodyweight, hide weight field |
| Exercise not in user's equipment profile | Filtered out of all suggestions and plan generation |
| `tier === "primary"` | Weighted 2× more likely in `pick()` for compound days |
| `tier === "tertiary"` | Only appears in accessory/isolation slots, never as main lift |

## Exercise Selection Diversity Rules

### The problem this solves

Without diversity constraints, `pick({ pattern: 'horizontal-push' }, 3)` could return Incline Press + Incline DB Press + Incline Cable Fly — three exercises all targeting upper chest. A real program would spread across angles: one flat (general chest), one incline (upper), one fly (isolation/stretch).

### How it works

The `specificGoal` field on each exercise defines its sub-target within a movement pattern. When `pick()` selects multiple exercises from the same pattern, it enforces **sub-target diversity**: exhaust unique `specificGoal` values before allowing repeats.

#### `pick()` with diversity (algorithm)

```javascript
ExerciseDB.pick({ pattern: 'horizontal-push', equipment: userEquip }, 3)
// Step 1: Get all matching exercises, group by specificGoal
//   "general"          → [Barbell Bench, DB Bench, Close-Grip Bench, ...]
//   "upper-chest"      → [Incline Press, Incline DB Press, ...]
//   "lower-chest"      → [Decline Bench, ...]
//   "chest-isolation"  → [Cable Fly, Pec Deck, DB Fly, Cable Crossover, ...]
//   "triceps"          → [Dips, ...]
//
// Step 2: Pick one exercise from each unique specificGoal (round-robin)
//   Pick 1 from "general"     → Barbell Bench Press
//   Pick 1 from "upper-chest" → Incline DB Press
//   Pick 1 from "chest-isolation" → Cable Fly
//
// Step 3: Stop at count (3). Return diverse selection.
```

The round-robin order respects tier weighting: within each sub-target group, Primary exercises are 2× more likely than Secondary, and Secondary 2× more likely than Tertiary.

### Sub-target mapping per movement pattern

These are derived from the `specificGoal` column in the spreadsheet. The generation script normalizes them into these canonical tokens:

| Pattern | Sub-targets |
|---------|------------|
| Squat | `quads-glutes` (general), `quads-emphasis`, `quads-glutes-adductors` |
| Hinge | `posterior-chain` (general), `glutes-hip-extension`, `hamstrings-knee-flexion`, `erectors-lower-back` |
| Horizontal Push | `general` (flat bench), `upper-chest`, `lower-chest`, `chest-isolation`, `triceps` |
| Vertical Push | `overhead-strength` (general), `side-delts`, `front-delts`, `rear-delts-scapular` |
| Horizontal Pull | `mid-back-lats` (general), `rear-delts-scapular` |
| Vertical Pull | `lats-vertical` (general) |
| Core | `core-stability` (general), `anti-rotation`, `obliques`, `lower-abs-hip-flexors`, `rectus-abdominis` |
| Carry | `general` (farmer walk), `obliques`, `overhead-strength` |
| Isolation - Arms | `biceps`, `triceps`, `biceps-brachialis` |
| Isolation - Legs | `calves`, `hamstrings-knee-flexion`, `glutes-hip-extension`, `glute-medius`, `adductors` |

### Slot templates for the planner

When the planner builds a session targeting a muscle group, it uses a **slot template** that defines the shape of the workout — not just "pick N exercises from this pattern" but "pick specific roles."

```javascript
// Example: Chest-focused session (Horizontal Push)
const CHEST_SESSION_TEMPLATE = [
  { role: "main-compound",  pattern: "horizontal-push", tier: ["primary"],              count: 1 },
  { role: "secondary-compound", pattern: "horizontal-push", tier: ["secondary"],         count: 1, diverseFrom: "main-compound" },
  { role: "isolation",      pattern: "horizontal-push", tier: ["tertiary"],              count: 1, diverseFrom: ["main-compound", "secondary-compound"] },
];

// Example: Full upper body push day
const PUSH_DAY_TEMPLATE = [
  { role: "main-horizontal", pattern: "horizontal-push", tier: ["primary"],              count: 1 },
  { role: "main-vertical",   pattern: "vertical-push",   tier: ["primary"],              count: 1 },
  { role: "secondary-push",  pattern: "horizontal-push", tier: ["secondary"],            count: 1, diverseFrom: "main-horizontal" },
  { role: "accessory",       pattern: "vertical-push",   tier: ["secondary", "tertiary"], count: 1 },
  { role: "isolation",       pattern: "isolation-arms",   specificGoal: "triceps",         count: 1 },
];

// Example: Leg day
const LEG_DAY_TEMPLATE = [
  { role: "main-squat",     pattern: "squat",           tier: ["primary"],               count: 1 },
  { role: "main-hinge",     pattern: "hinge",           tier: ["primary"],               count: 1 },
  { role: "secondary-squat", pattern: "squat",           tier: ["secondary"],             count: 1, diverseFrom: "main-squat" },
  { role: "accessory-hinge", pattern: "hinge",           tier: ["secondary", "tertiary"], count: 1, diverseFrom: "main-hinge" },
  { role: "isolation",       pattern: "isolation-legs",   count: 1 },
];
```

The `diverseFrom` constraint means: the exercise picked for this slot must have a different `specificGoal` than the exercise(s) already picked for the referenced slot(s). This is what prevents three upper chest exercises in a row.

### Session templates by split type

The planner should have templates for common split types:

| Split | Session templates |
|-------|------------------|
| **Push / Pull / Legs** | Push day, Pull day, Leg day |
| **Upper / Lower** | Upper day (horizontal + vertical push/pull + arms), Lower day (squat + hinge + legs isolation) |
| **Full Body** | 1 compound per pattern (squat + hinge + h-push + h-pull + v-push or v-pull) |
| **Muscle Group** | Chest day, Back day, Shoulder day, Arm day, Leg day |
| **Sport-Specific** | Swim strength, Cycling strength, Running strength (use sport-specific exercises + general patterns) |

Each template is a simple JS array of slot definitions. The planner fills each slot by calling `ExerciseDB.pick()` with the slot's constraints + the `diverseFrom` exclusions.

## Data flow

```
Spreadsheet (source of truth)
    ↓  generate script
exercise-data.js (window.EXERCISE_DB)
    ↓  loaded by browser
exercise-filters.js (window.ExerciseDB.query())
    ↓  called by
planner.js          — plan generation
workout-builders/   — manual exercise selection
circuit-builder     — circuit exercise picker
calendar.js         — display (exercise info modal)
```

## Equipment profile schema

```javascript
// localStorage.equipmentProfile
["dumbbells", "bench", "pull-up-bar", "band", "kettlebell"]
```

Stored as a JSON array of canonical equipment tokens. If empty or not set, no equipment filtering is applied (all exercises available — gym assumed).

## Anti-regression rules

- **DO NOT** delete the existing `exercise-library.js` until you confirm nothing else reads from it. If other code references it, keep it as a compatibility shim that re-exports from EXERCISE_DB.
- **DO NOT** hardcode exercise names in planner.js going forward. All exercise selection goes through ExerciseDB.query().
- **DO NOT** change the spreadsheet column order — the generation script depends on it.
- **DO NOT** touch swim CSS zones, FTP zones, VDOT zones, race calendar, or plan storage.
- **DO** add `'equipmentProfile'` to SYNCED_KEYS in db.js.
- **DO** export as `window.EXERCISE_DB` and `window.ExerciseDB` — vanilla JS globals, no ES modules.
- **DO** keep the generation script in `scripts/` so the spreadsheet→JS pipeline is repeatable.

## Test checkpoints

1. User with `equipmentProfile: ["bodyweight"]` → planner never assigns Barbell Back Squat, always assigns Bodyweight Squat for squat pattern.
2. User with `equipmentProfile: ["dumbbells", "bench", "pull-up-bar"]` → gets Dumbbell Bench Press (not Barbell), Pull-Ups (yes), Dumbbell Row (yes), no machine exercises.
3. User with no equipment profile set → gets full exercise library (backward compatible, no filtering).
4. Circuit builder for Murph → pulls exact exercises from EXERCISE_DB where `commonIn` includes "murph".
5. Strength exercise with `usesWeights: true` selected in builder → weight input fields appear.
6. Bodyweight exercise selected → no weight input fields.
7. `ExerciseDB.pick({ pattern: 'squat', bodyweightOnly: true }, 1)` → returns one of: Bodyweight Squat, Wall Sit, Sissy Squat, Pistol Squat, etc. Never a barbell variant.
