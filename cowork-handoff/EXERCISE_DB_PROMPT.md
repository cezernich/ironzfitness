# Exercise Database Integration — Claude Code Agent Prompt

Paste this into your Claude Code session:

---

## Task

IronZ has an expanded exercise library spreadsheet (`IronZ_Exercise_Library_Expanded.xlsx` in the repo root) with ~200 exercises across 4 sheets, each with rich metadata: movement pattern, tier, equipment, muscle categories, bodyweight capability, weight flags. Convert this into a runtime data file + filter API that the planner and builders use for exercise selection. No more hardcoded exercise names.

**Read `cowork-handoff/EXERCISE_DB_SPEC.md` first. It is the single source of truth.** The data schema, filter API, equipment matching logic, UI enforcement rules, and integration points are all specified there.

## Context

- IronZ is a vanilla JS SPA (no bundler, no ES modules) deployed on GitHub Pages with a Supabase backend.
- All data is localStorage-first, synced to Supabase via `DB.syncKey()`.
- There is an existing `exercise-library.js` loaded in index.html. Investigate what it contains before replacing or extending it.
- The planner (`planner.js`) currently selects exercises by hardcoded name or generic category. This refactor makes it query-based.
- Workout builders were recently unified (see `docs/BUILDER_INVENTORY.md`) — they should consume the new filter API for exercise suggestions.

## Critical files to read before writing any code

1. `cowork-handoff/EXERCISE_DB_SPEC.md` — the full spec
2. `IronZ_Exercise_Library_Expanded.xlsx` — the source spreadsheet (4 sheets)
3. `exercise-library.js` — current exercise data, understand what depends on it
4. `planner.js` — find all hardcoded exercise names and selection logic
5. `js/db.js` — SYNCED_KEYS, DB.syncKey() for equipmentProfile
6. `index.html` — script load order (new scripts must load in correct position)
7. `custom-plan.js` — the workout builders, exercise row logic

## Implementation order

### Phase 1: Generate `exercise-data.js` from the spreadsheet

Write a Python script (`scripts/generate-exercise-db.py`) that:
- Reads all 4 sheets from the XLSX
- Normalizes each exercise into the schema defined in the spec
- Generates `exercise-data.js` with `window.EXERCISE_DB = [...]`
- Auto-generates kebab-case IDs from exercise names
- Normalizes equipment strings into canonical tokens (see spec for the token list)
- Converts Yes/No strings to booleans
- Run it and commit both the script and the generated `exercise-data.js`

Commit: `feat: generate exercise-data.js from expanded spreadsheet — ~200 exercises`

### Phase 2: Build `exercise-filters.js` — the query API

Create `exercise-filters.js` exporting `window.ExerciseDB` with:
- `query(filters)` — core filtering method (see spec for filter options)
- `pick(filters, count)` — random selection with **sub-target diversity** (see spec: "Exercise Selection Diversity Rules"). When picking multiple exercises from the same pattern, round-robin across unique `specificGoal` values before repeating. Primary tier weighted 2×.
- `getByPattern(pattern, options)` — convenience wrapper
- `getByMuscle(muscle, options)` — convenience wrapper
- `getForSport(sport)` — sport-specific exercises
- `getHyroxStations()` — ordered Hyrox station list
- `getCircuitExercises(options)` — circuit/bodyweight exercises
- `getById(id)` / `getByName(name)` — direct lookups
- `getAvailable(userEquipment)` — equipment-filtered full list

Equipment matching logic (critical):
- `canBeBodyweight === true` → always passes equipment filter
- `canBeBodyweight === false` → ALL items in `equipmentNeeded` must be in user's equipment list
- No equipment profile set → no filtering (backward compatible, full library)

Add both scripts to `index.html`: `exercise-data.js` BEFORE `exercise-library.js`, `exercise-filters.js` AFTER `exercise-data.js` but BEFORE `planner.js`.

Commit: `feat: exercise filter API — query, pick, equipment matching`

### Phase 3: Equipment profile in onboarding + settings

- Add an equipment checklist to the appropriate onboarding screen (or Settings > Preferences)
- Canonical equipment list from the spec (dumbbells, barbell-rack, bench, kettlebell, etc.)
- Save to `localStorage.equipmentProfile` as a JSON array of tokens
- Add `'equipmentProfile'` to SYNCED_KEYS in `db.js`
- Default: empty array (no filtering — backward compatible for existing users)

Commit: `feat: equipment profile — onboarding checklist + localStorage sync`

### Phase 4: Wire planner to ExerciseDB with slot templates

- Search `planner.js` for all hardcoded exercise names and exercise selection logic
- Replace with `ExerciseDB.query()` and `ExerciseDB.pick()` calls
- **Implement slot templates** (see spec: "Slot templates for the planner" and "Session templates by split type"):
  - Each strength session type (Push, Pull, Legs, Upper, Lower, Full Body, Muscle Group) gets a slot template
  - Each slot has a role, pattern, tier filter, and `diverseFrom` constraint
  - The planner fills slots sequentially, passing already-picked exercises as exclusions
  - This ensures a chest session gets flat + incline + isolation, not 3 incline variations
- Sport-specific strength: use `ExerciseDB.getForSport()` to supplement
- Circuit days: pick from circuit exercises matching user equipment
- **Fallback:** If ExerciseDB is not loaded (script error), fall back to current behavior. Never break plan generation.

Commit: `refactor: planner uses ExerciseDB with slot templates for diverse exercise selection`

### Phase 5: Wire builders to ExerciseDB

- In workout builders (strength, circuit, etc.), populate exercise dropdowns/search from `ExerciseDB.query({ equipment: userEquip })`
- Group by movement pattern for strength exercises
- When exercise with `usesWeights: true` is selected → show weight input (sets × reps × weight)
- When exercise with `usesWeights: false` is selected → show reps/time only, hide weight field
- When exercise has `canBeBodyweight: true` AND `usesWeights: true` → show a toggle for weighted vs. bodyweight mode

Commit: `refactor: workout builders use ExerciseDB for exercise selection + weight logic`

### Phase 6: Backward compatibility + cleanup

- If `exercise-library.js` has data that other files depend on, keep it as a shim that re-exports from EXERCISE_DB
- If nothing depends on it, remove it and update `index.html`
- Grep for any remaining hardcoded exercise names in JS files — flag or migrate them
- Verify the generation script produces identical output when re-run (idempotent)

Commit: `chore: clean up legacy exercise-library.js, verify no hardcoded exercise names remain`

## Anti-regression rules

- **DO NOT** break plan generation. If ExerciseDB fails to load, planner must still work (fallback to current behavior).
- **DO NOT** change the spreadsheet or its column order. The generation script reads it as-is.
- **DO NOT** touch swim CSS zones, FTP zones, VDOT zones, race calendar, or plan storage (`storeGeneratedPlan`, `generated_plans`).
- **DO NOT** modify `js/auth.js`.
- **DO NOT** rename any public function names that other files call without leaving a forwarding wrapper.
- **DO** add `'equipmentProfile'` to SYNCED_KEYS in db.js.
- **DO** export as `window.EXERCISE_DB` and `window.ExerciseDB` — vanilla JS globals, no ES modules.
- **DO** keep the generation script in `scripts/` so the spreadsheet → JS pipeline is repeatable.
- **DO** verify after each phase that the app loads without JS errors and existing functionality works.

## Per-phase test checkpoints

### After Phase 2:
- Open browser console, run `ExerciseDB.query({ pattern: 'squat', bodyweightOnly: true })` → returns Bodyweight Squat, Wall Sit, Pistol Squat, etc. No barbell variants.
- `ExerciseDB.query({ pattern: 'squat', equipment: ['dumbbells', 'bench'] })` → returns Goblet Squat, Bulgarian Split Squat, etc. No barbell or machine variants.
- `ExerciseDB.pick({ pattern: 'hinge', tier: ['primary'] }, 1)` → returns one hinge exercise.
- `ExerciseDB.getHyroxStations()` → returns 8 stations in order.

### After Phase 4:
- Generate a plan for a user with `equipmentProfile: ['bodyweight']` → no barbell/machine exercises in any session.
- Generate a plan with no equipment profile → full exercise variety (backward compatible).
- **Diversity check:** Generate a chest-focused session 10 times. Every generation should include exercises from at least 2 different `specificGoal` sub-targets (e.g., general + upper chest, or general + isolation). No generation should have all exercises from the same sub-target.
- **Leg day check:** Generate a leg session. Should include both a squat-pattern AND a hinge-pattern exercise, not all squats or all hinges.
- Compare session structure (sets, reps, rest periods) before/after — should be unchanged. Only exercise names differ.

### After Phase 5:
- Add a strength exercise in Add Session → dropdown shows exercises grouped by movement pattern, filtered by equipment.
- Select "Bodyweight Squat" → no weight input shown.
- Select "Barbell Back Squat" → weight input appears.
- Select "Push-Up" (canBeBodyweight + usesWeights) → toggle between weighted and bodyweight mode.
