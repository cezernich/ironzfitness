# Exercise Database Merge — Phase 1 Discovery

Snapshot of the three exercise data sources before consolidation.

References: `cowork-handoff/EXERCISE_DB_SPEC.md`, `docs/BUILDER_INVENTORY.md`.

## Source databases

| Source | Where | Count | Schema |
|---|---|---|---|
| `window.EXERCISE_DB` | `exercise-data.js` (generated) | **226** | `id, name, sheet, pattern, tier, muscleCategory, specificGoal, usesWeights, canBeBodyweight, equipmentNeeded, modality, commonIn, sport, purpose, isHyroxStation, …` |
| `window.IronZExerciseDB` | `js/data/exercises.js` (60 SEED + fetch from `philosophy/exercise_library.json`) | **182** unique names | `name, muscleGroup, _searchKey` |
| `EXERCISE_MUSCLES` | `js/exercise-library.js` (const) | 53 lowercase keys | `{ exerciseName: [muscle, …] }` |

The IronZExerciseDB total is the union of 60 hardcoded SEED entries and 158
records fetched from `philosophy/exercise_library.json`, deduped by lowercase
name → 182 unique names.

## Diff: IronZExerciseDB ↦ EXERCISE_DB

Of the 182 unique IronZExerciseDB names, **89 are absent from EXERCISE_DB**.
Categorized for Phase 2:

### A. Near-duplicates of existing EXERCISE_DB entries (8)

Same exercise, different pluralization or punctuation. Resolve in Phase 2 by
matching the canonical EXERCISE_DB name and (if needed) adding a
`getByName()` alias resolver — no new rows.

| IronZExerciseDB name | Existing EXERCISE_DB name |
|---|---|
| Box Jump | Box Jumps |
| Burpee | Burpees |
| Close Grip Bench Press | Close-Grip Bench Press |
| Diamond Push-Up | Diamond Push-ups |
| Jump Squat | Jump Squats |
| Kettlebell Goblet Squat | Kettlebell Goblet Squats |
| Mountain Climber | Mountain Climbers |
| Reverse Lunges | Reverse Lunge |

### B. Cardio session names — not strength exercises (23)

Brick Run (Bike-to-Run), CSS Repeats, Easy Run, Endurance Ride,
Endurance Swim, Fartlek Run, Hill Climb Intervals, Hill Repeats,
Interval Run, Long Run, Open Water Swim, Recovery Ride, Recovery Run,
Sprint Intervals, Sweet Spot Intervals, Swim Drill Session,
Swim Intervals, Tempo Ride, Tempo Run, Threshold Intervals,
Threshold Ride, VO2max Intervals (Bike), Walk/Run Intervals.

These are session-level descriptors, not exercises. The typeahead surfaces
them when a user types the name into a strength row. To preserve that UX
without polluting strength selection, add them under a new
`sheet: "cardio-session"` with `pattern: null` so they never match a
`pattern` filter but still respond to `getByName` / autocomplete.

### C. True-new strength + circuit exercises to classify (58)

Adductor Machine, Band Face Pull, Barbell Bent-Over Row, Barbell Upright
Row, Battle Ropes, Behind-the-Neck Pulldown, Bench Dip, Bodyweight Calf
Raise, Bodyweight Squat, Close-Grip Lat Pulldown, Decline Dumbbell Press,
Decline Push-Up, Devil Press, Donkey Calf Raise, Dumbbell Clean and Press,
Dumbbell Romanian Deadlift, Dumbbell Shrug, Dumbbell Step-Up, EZ Bar Curl,
Hack Squat, Incline Barbell Bench Press, Incline Dumbbell Press,
Incline Push-Up, Jump Rope, Kettlebell Snatch, Knee Push-Up, Lying Leg
Raise, Muscle-Up, Neutral-Grip Pull-Up, Nordic Hamstring Curl, Overhead
Tricep Extension, Pec Deck Fly, Pendlay Row, Power Clean, Renegade Rows,
Resistance Band Curl, Resistance Band Overhead Press, Resistance Band Row,
Resistance Band Squat, Resistance Band Tricep Pushdown, Reverse Curl,
Reverse-Grip Barbell Row, Safety Bar Squat, Seated Cable Row, Seated
Dumbbell Shoulder Press, Single-Leg Glute Bridge, Single-leg RDL,
Snatch-Grip Deadlift, Spider Curl, Stiff-Leg Deadlift, Superman,
Tricep Dip, Tricep Kickback, Turkish Get-Up, Weighted Dip, Weighted
Pull-Up, Wide-Grip Pull-Up, Wrist Curl.

Each one will be classified per the EXERCISE_DB_SPEC.md sub-target tables
and added to the spreadsheet so re-running the generator produces a single
unified output.

## Schema fields IronZExerciseDB has that EXERCISE_DB doesn't

The autocomplete consumes `{ name, muscleGroup, _searchKey }`. EXERCISE_DB
already has `name` (matches) and `muscleCategory` (an array — autocomplete
needs a single capitalized string). `_searchKey` is computed on the fly.

The migration adds:

- A `getMuscles(name)` convenience method on `window.ExerciseDB` that
  returns the lowercased muscle array (matches `EXERCISE_MUSCLES`'s shape).
- A primary-muscle string derivable from `muscleCategory[0]` for the
  autocomplete's display column. No schema change needed in the data.

## Consumer audit

### `window.IronZExerciseDB`

Only one external consumer:

| File | Lines | Use |
|---|---|---|
| `js/ui/exercise-autocomplete.js` | 35-36, 153, 157 | Reads `IronZExerciseDB.get()` for typeahead suggestions; `_searchKey` for case/punctuation-insensitive matching |

After Phase 4 the autocomplete reads from `window.EXERCISE_DB`. Phase 5
deletes `js/data/exercises.js`.

### `EXERCISE_MUSCLES` (`js/exercise-library.js`)

| File | Lines | Use |
|---|---|---|
| `js/exercise-library.js` | 9 (def), 177, 283, 285 | Internal — looked up by `_findMuscles()` for the demo-modal + stretch-routine + alternative-suggestion fallback |
| `js/seed-reference-data.js` | 321-323 | Enriches Supabase reference-data seed with muscle_groups |

After Phase 3 both consumers read via `ExerciseDB.getMuscles(name)`.
The `EXERCISE_MUSCLES` constant is removed.

### Other public surface in `js/exercise-library.js` (NOT exercise data)

The file does much more than just `EXERCISE_MUSCLES`. These functions stay
because they're orthogonal to "exercise database" concerns and have many
external callers:

- `buildExerciseTableHTML(exercises, opts)` — the universal exercise-row
  table renderer (used in calendar, custom-plan, workouts, live-tracker,
  inbox, saved library — 21 call sites across 7 files)
- `showExerciseInfo(name)` / `closeExerciseInfo()` — exercise demo modal
- `showSwapExerciseSheet(name, onSelect)` — equipment-busy swap UI
  (called by `js/live-tracker.js:1217`)
- `getExerciseAlternatives(name)` — substitution lookup (driven by
  `EXERCISE_SUBSTITUTIONS`, also internal to this file)
- `getStretchRoutine(workout)` / `renderStretchSuggestion(workout, el)` —
  post-workout stretch suggestions (driven by `STRETCHES_BY_MUSCLE` +
  `CARDIO_MUSCLES`)
- `_swapExerciseInTable(callbackId, idx, name)` — inline-onclick handler
- `_findMuscles(key)`, `_findCues(key)` — internal helpers

`EXERCISE_SUBSTITUTIONS`, `EXERCISE_CUES`, `STRETCHES_BY_MUSCLE`, and
`CARDIO_MUSCLES` are internal-only constants that live alongside the UI
they drive. They are NOT duplicates of EXERCISE_DB and stay where they
are after the merge.

`EXERCISE_SUBSTITUTIONS` has one external reader at
`js/seed-reference-data.js:329` (also enriches the reference-data seed).
That call gets the same treatment as the EXERCISE_MUSCLES one — switched
to a thin local fallback or removed if the seed already populates from
EXERCISE_DB.

## Plan tradeoff: `js/exercise-library.js` deletion

The Phase 5 spec line "Remove exercise-library.js" cannot be executed
without rewriting 21 unrelated UI integrations. The pragmatic interpretation
that satisfies the actual goal (one canonical exercise database):

- **Phase 5 will delete `js/data/exercises.js`** — that file is purely a
  data source with one consumer.
- **Phase 5 will leave `js/exercise-library.js` in place** but with
  `EXERCISE_MUSCLES` and any other duplicated data structures removed. The
  file becomes "exercise UI / demo / swap / stretch helpers" only. The
  comment header gets updated to reflect the new scope.

If full deletion is desired in a future pass, the table-renderer + demo
modal + stretches + swap UI all need new homes — that's its own refactor
and outside the scope of "merge exercise databases".

## Anti-regression guardrails for Phases 2-5

- Typeahead must keep working — verified by typing common queries
  ("bench", "pull", "squat") at the end of Phase 4.
- Plan generation must keep working — verified by generating a plan
  through the end of Phase 4.
- `buildExerciseTableHTML` and the swap modal must keep working through
  Phase 5 (since the file isn't being deleted).
- Spreadsheet remains the source of truth — every new entry from Phase 2
  lands in the xlsx and the generator produces them on re-run.
