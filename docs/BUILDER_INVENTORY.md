# Builder Inventory — Phase 0 Discovery

Reference: `cowork-handoff/UNIFIED_BUILDER_SPEC.md`.

This report catalogs every Add Session workout builder and the parallel Build-a-Plan
Manual flow **as they exist today**. It is the snapshot the refactor will diff
against. No behavior changes yet.

---

## 1. Entry points

### 1.1 Add Session (calendar Quick Entry)

Entry: `openQuickEntry(dateStr)` → wizard `qe-step-0` type picker →
`qeSelectType(type)` at `js/calendar.js:4821`.

Dispatch table (all in `qeSelectType`):

| Type picked | Destination |
|---|---|
| `"running"` | `window.AddRunningSessionFlow.open(dateStr)` — `js/calendar.js:4825` |
| `"circuit"` | `window.CircuitBuilder.openEntryFlow(dateStr)` — `js/calendar.js:4833` |
| `"swim"` | inside `qeShowStep(1, "swim")` the cardio step mounts `SwimBuilderModal.open(dateStr)` (via the swim session-type row at `calendar.js:4606-4622`) |
| `"strength"` | `qeShowStep(1, "strength")` — muscle picker → AI or manual |
| `"yoga"` | `qeShowStep(1, "strength")` — reuses strength UI |
| `"bodyweight"` | `qeShowStep(2, "manual")` — straight to manual exercise rows |
| `"hiit"` | `qeShowStep(1, "hiit")` — `qe-step-1-hiit` form |
| `"hyrox"` | `qeShowStep(1, "hyrox")` → `_initHyroxBuilder()` — `js/calendar.js:4594,4663` |
| `"cycling"` / `"brick"` / `"rowing"` / `"walking"` / `"mobility"` / `"sport"` / `"sauna"` | `qe-step-1-cardio` generic cardio form (+ brick-specific dual-duration row) |
| `"restriction"` / `"equipment"` | non-workout restriction forms |

### 1.2 Build a Plan → per-day Manual button

Entry: each day card rendered by `renderCustomPlanBuilder()` has four buttons
at `js/custom-plan.js:133-136`:

```
AI Generate | From Saved | Manual | Rest
```

Manual = `customPlanAddManual(dow, editIdx)` — `js/custom-plan.js:893`.
Opens `#cp-manual-modal`, step 1 = type picker
(`cpManualSelectType(type)` — `custom-plan.js:1004`), step 2 = either
exercise rows (`#cp-manual-exercise-rows`) or cardio/interval rows
(`#cp-manual-cardio-rows`). Save = `customPlanSaveManual()` —
`custom-plan.js:1632`. None of the Add Session builders
(`CircuitBuilder`, `SwimBuilderModal`, Hyrox, `AddRunningSessionFlow`, …)
are ever invoked from this path.

`AI Generate`, `From Saved`, `Rest` are untouched by this refactor.

---

## 2. Per-discipline audit

### 2.1 Circuit

- **Add Session entry**: `window.CircuitBuilder.openEntryFlow(dateStr)` —
  `js/ui/circuit-builder.js:76`. Self-contained wizard (entry → preview
  or manual builder → save). Already exported as `window.CircuitBuilder`
  at `circuit-builder.js:1076`.
- **Save**: `_saveCircuitToWorkouts(circuit, dateStr)` —
  `circuit-builder.js:305`. Writes `localStorage.workouts`,
  `DB.syncWorkouts()`, re-renders calendar/day/history.
- **Workout object shape** (what the builder produces, pre-persistence):
  ```js
  {
    id: Date.now(),
    date: dateStr,
    type: "circuit",
    name: circuit.name,
    notes: circuit.notes || "",
    circuit: { name, goal, goal_value, benchmark_id, steps: [...] },
    source: "manual"
  }
  ```
- **Completion path**: `openCompletionModal` → `saveForTime` / `saveAmrap`
  → `_writeCompletion` — `circuit-builder.js:1001,1010,1018`. Writes
  `workout.circuit_result` back onto the existing row.
- **Build a Plan Manual**: no circuit path. `CP_TYPE_LABELS` lists
  `circuit` (`custom-plan.js:1000`) but the manual type picker routes it
  through the exercise-row editor, which has no concept of circuit
  `steps` / `goal` / `goal_value`. User-reported gap.

### 2.2 Swim

- **Add Session entry**: `window.SwimBuilderModal.open(dateStr, opts)` —
  `js/ui/swim-builder-modal.js:88`. Opens `#swim-builder-overlay`
  canonical step-tree builder (intervals, rests, repeat blocks).
- **Save**: inline in `_save()` around `swim-builder-modal.js:550-586`.
  Writes to `localStorage.workouts` with shape:
  ```js
  { id, date, type: "swimming", notes, exercises: [],
    aiSession: { title, steps, legacyIntervals } }
  ```
  Calls `DB.syncWorkouts()`, `renderCalendar`, `renderDayDetail`,
  `renderWorkoutHistory`, `closeQuickEntry`.
- **Generated swim from cardio form**: when the user picks Swim in the
  generic cardio step instead, `qeGenerateCardio()` at `calendar.js:7094`
  builds an interval structure and `qeSaveGeneratedCardio()` at
  `calendar.js:7180` writes `type: "swimming"` with `aiSession: { title,
  intervals }`. Distinct from the SwimBuilder step-tree path.
- **Build a Plan Manual**: `"swimming"` is in `CARDIO_TYPES` — uses
  generic `cp-manual-cardio-rows` (distance/min/effort/details).
  Never opens `SwimBuilderModal`, never produces step trees, never
  honors pool size. User-reported: "measuring in miles" — because the
  cardio row duration uses `getDistanceUnit()` (miles) regardless of the
  swim context.

### 2.3 HIIT

- **Add Session AI entry**: `qe-step-1-hiit` form →
  `qeGenerateHIIT()` — `js/calendar.js:5804`. Selects exercises from the
  local exercise library, builds a structure based on format
  (circuit / tabata / emom / amrap), intensity, duration, equipment.
  Renders in `qe-step-2-generated`.
- **Add Session manual entry**: `qeShowStep(2, "manual")` after the HIIT
  step when user clicks "Log Manually" — same exercise rows as Strength,
  but with HIIT-specific defaults (no `sets` column, `hiit-row` class,
  `qe-manual-hiit-*` meta fields for format / rounds / rest).
- **Save**: `qeSaveGeneratedStrength()` (generated path — shared with
  strength) or `qeSaveManual()` → `_qeSaveStrengthWorkout(dateStr, label,
  notes, exercises, hiitMeta, duration)` — `calendar.js:7841,7904`.
  Writes `localStorage.workouts` with:
  ```js
  { id, date, type: "hiit", name, notes, exercises: [...],
    hiitMeta: { format, rounds, restBetweenExercises, restBetweenRounds } }
  ```
- **Build a Plan Manual**: `"hiit"` is **not** in `CARDIO_TYPES`, uses
  the exercise-row editor (`cpManualAddExRow` with the `hiit-row`
  branch at `custom-plan.js:1060-1075`). Row shape matches Add Session,
  but `hiitMeta` (format / rounds / rest) is **never collected** —
  `customPlanSaveManual` does not read any `cp-manual-hiit-*` inputs. So
  HIIT sessions from Build a Plan are missing their format metadata.

### 2.4 Hyrox

- **Add Session entry**: `qe-step-1-hyrox` → `_initHyroxBuilder()` —
  `js/calendar.js:4663`. Renders 8 standard Hyrox stations + optional
  run legs from `HYROX_STATIONS` at `calendar.js:4649`. Station
  defaults are Men's Open weights; distance / weight per station are
  editable inputs.
- **Save**: internal handler within the Hyrox builder (writes
  `type: "hyrox"` with `isHyrox: true`, station exercises, `hyroxData`)
  — see `_buildHyroxSplitSummary` at `calendar.js:1727` for the shape
  used on read. Station completion splits live in
  completion records, not the workout row itself.
- **Build a Plan Manual**: `"hyrox"` is in `CP_TYPE_LABELS` but not in
  `CARDIO_TYPES`. It falls through to generic exercise rows — user
  must type every station by hand, defaults and run legs are not
  offered. User-reported gap.

### 2.5 Running

- **Add Session entry**: `window.AddRunningSessionFlow.open(dateStr)` —
  `js/add-running-session-flow.js:387`. 8-type structured generator
  (easy, long, tempo, threshold, intervals, fartlek, hills, progression)
  producing phase-by-phase VDOT-zoned sessions.
- **Save**: `AddRunningSessionFlow.save(generatedWorkout, dateStr, mode,
  notes)` — `add-running-session-flow.js:229`. Writes to
  **`workoutSchedule`** (NOT `workouts`) — this is a *planning* flow,
  not a logging flow. Entry shape via `planEntryFor(generatedWorkout,
  dateStr, notes)` around line 82. Calls `DB.syncTrainingPlan` for the
  conflict-replace path. Re-renders calendar / day / history / stats.
- **Build a Plan Manual**: `"running"` is in `CARDIO_TYPES` — generic
  cardio rows. No VDOT zones, no session-type picker, no targetPace.

### 2.6 Cycling / Brick / Walking / Rowing / Mobility / Sport / Sauna

- **Add Session entry**: `qe-step-1-cardio` — single generic cardio form
  with a bike session-type row (shown only when `_qeSelectedType ===
  "cycling"`) and a brick dual-duration row (shown only for brick).
- **Save — AI path**: `qeGenerateCardio()` → `qeSaveGeneratedCardio()`
  — `calendar.js:7094,7180`. Writes `{ id, date, type, notes,
  exercises: [], aiSession: { title, intervals, steps? } }`. `type` is
  mapped via `typeMap = { running: "running", cycling: "cycling",
  swim: "swimming", hiit: "hiit", brick: "brick" }`.
- **Save — Manual cardio-row path**: `saveQuickActivity()` —
  `calendar.js:7935`. Walks `#qe-cardio-interval-rows`, builds
  `manualIntervals = { title, intervals: [...] }`, writes
  `{ id, date, type, notes, exercises: [], aiSession: manualIntervals,
    generatedSession? }`.
- **Build a Plan Manual**: every one of these types is in
  `CARDIO_TYPES` (`custom-plan.js:1009`). Cardio row shape mirrors
  Add Session's manual row (`name`, `duration`, `effort`, `details`,
  optional `repeatGroup`/`groupSets`). **Brick dual-duration, bike
  session-type, and swim pool size are NOT carried over.**

### 2.7 Strength / Bodyweight

- **Add Session entry**:
  - Strength: `qeShowStep(1, "strength")` → muscle picker →
    `qeGenerateStrength()` (AI, `calendar.js:5980`) or "Log Manually"
    button → `qeShowStep(2, "manual")`.
  - Bodyweight: `qeShowStep(2, "manual")` directly (skips muscle
    picker), with `isBW` branch in row rendering so weights default to
    "Bodyweight".
- **Save**: `qeSaveManual()` → `_qeSaveStrengthWorkout(...)` —
  `calendar.js:7841,7904`. Writes:
  ```js
  { id, date,
    type: _qeSelectedType === "bodyweight" ? "bodyweight" : "weightlifting",
    name, notes, exercises: [...], hiitMeta?, duration? }
  ```
- **Build a Plan Manual**: exercise-row editor at `cpManualAddExRow`
  (`custom-plan.js:1039`). Same fields: `name`, `sets`, `reps`,
  `weight`, optional `perSet`/`setDetails` from expanded per-set panel,
  optional `supersetGroup`/`groupSets` from drag-to-group. The generic
  form behind the Manual button is this file — **the one the spec says
  to delete after Strength migration at Phase 8**.

---

## 3. Save destinations

| Builder | Destination | Key / shape owner |
|---|---|---|
| CircuitBuilder | `localStorage.workouts` | `type: "circuit"` + nested `circuit.steps` |
| SwimBuilderModal | `localStorage.workouts` | `type: "swimming"` + `aiSession.steps` (step tree) |
| qeGenerateCardio (swim via cardio form) | `localStorage.workouts` | `type: "swimming"` + `aiSession.intervals` (flat) |
| AddRunningSessionFlow | **`localStorage.workoutSchedule`** | plan entry via `planEntryFor` |
| qeGenerateCardio (cycling/brick/rowing/walking) | `localStorage.workouts` | `type` from typeMap + `aiSession.intervals` |
| saveQuickActivity (manual cardio rows) | `localStorage.workouts` | same typeMap + `aiSession: { title, intervals }` |
| qeSaveGeneratedHIIT → qeSaveGeneratedStrength | `localStorage.workouts` | `type: "hiit"` + `exercises[]` + `hiitMeta` |
| _qeSaveStrengthWorkout | `localStorage.workouts` | `type: "weightlifting" | "bodyweight" | "hiit"` + `exercises[]` |
| Hyrox builder save | `localStorage.workouts` | `type: "hyrox"` + `isHyrox: true` |
| customPlanSaveManual | **in-memory `cpWeekTemplate[dow]`** | `{ id, mode: "manual", data: {...} }` — materialized only when `saveCustomPlan()` runs |

Note the last row: Build a Plan's save destination is **not** localStorage
directly. It's an intermediate weekly template that `saveCustomPlan()`
later expands across the chosen plan duration and emits as a
`generated_plans` row (plus `trainingPlan` / `workoutSchedule` entries).
Phase 1's `saveToPlanDay` must target `cpWeekTemplate` via `_cpAddSession`
/ `_cpReplaceSession`, preserving the `{ id, mode, data }` wrapper.

---

## 4. Normalized workout object — gap analysis

The spec's target shape (`UNIFIED_BUILDER_SPEC.md:63-76`):

```js
{ discipline, type, name, durationMin, intensity, exercises, structure,
  notes, zone, targetPace }
```

Today's reality (fields actually produced by existing builders):

| Field | Currently populated by | Gap |
|---|---|---|
| `discipline` | **none** — current code uses `type` only | new field; derive from type (`{run, bike, swim, hyrox, brick, hiit, strength, bodyweight, circuit}`) |
| `type` | every builder | matches |
| `name` | Circuit (`name`), Swim (`aiSession.title`), HIIT / Strength (`name`), cardio (`notes` / `aiSession.title`) | inconsistent — needs canonicalization |
| `durationMin` | `_qeSaveStrengthWorkout` (optional `duration`), cardio form duration field, brick sum | inconsistent — compute in handler if missing |
| `intensity` | HIIT `hiitMeta.intensity`, cardio `qe-activity-intensity` | missing for Circuit, Swim, Strength, Running (running carries zone not intensity) |
| `exercises` | Strength / HIIT / Hyrox / Bodyweight | Cardio + Swim use intervals/steps, not exercises |
| `structure` | nowhere — currently stuffed into discipline-specific fields (`circuit.steps`, `aiSession.steps`, `hiitMeta`, `aiSession.intervals`) | new namespace — move discipline-specific payloads under `structure` |
| `notes` | every builder | matches |
| `zone` | AddRunningSessionFlow phases carry `phase.zone` | not bubbled to top-level; need derivation |
| `targetPace` | running zones contain pace strings | not bubbled to top-level |

Implication for Phase 1: the save handlers must **accept the current
per-builder shape** and produce the new normalized shape for downstream
writers. Builders will be refactored to emit the normalized shape
incrementally (one per phase).

---

## 5. Bugs and inconsistencies to flag (do not fix in Phase 0)

1. **`customPlanSaveManual` `isCardio` narrower than `cpManualSelectType`'s
   `CARDIO_TYPES`** — `custom-plan.js:1641` hard-codes
   `["running","cycling","swimming"]`, but the type picker (`:1009`)
   accepts `brick`, `walking`, `rowing`, `mobility`, `sauna`, `sport`
   too. For the non-matching types the save handler falls into the
   exercise branch and silently drops all cardio rows the user just
   filled in.
2. **Build a Plan swim always renders in miles** — cardio row uses
   `getDistanceUnit()` (which returns the user's default distance
   unit, typically miles) regardless of swim context.
3. **HIIT `hiitMeta` lost in Build a Plan** — `customPlanSaveManual` never
   reads `cp-manual-hiit-*` format/rounds/rest inputs (none exist in CP
   modal at all), so HIIT sessions saved via Manual are format-less.
4. **Circuit and Hyrox have no dedicated Build a Plan path** — both
   reachable via type picker but fall through to exercise rows; their
   structure is lost entirely.
5. **Running Add Session writes to `workoutSchedule`**, all other
   builders write to `workouts`. Phase 1 `saveToCalendar` must handle
   both destinations OR the running builder must be migrated with a
   `context: "plan-manual"` branch that targets the plan template
   instead of the schedule.
6. **Circuit entry modal's Back button** in `openEntryFlow` reopens
   `openQuickEntry(dateStr)` directly (`circuit-builder.js:95`). When
   the caller is Build a Plan Manual, this back target is wrong —
   `context` will need to drive the back handler too.
7. **Swim generated cardio vs SwimBuilderModal duplication** — two
   separate paths produce swim workouts with different shapes
   (`aiSession.intervals` flat list vs `aiSession.steps` step tree).
   Consolidate during Phase 3.

---

## 6. Refactor contract summary

Every migrated builder will expose:

```js
window.BUILDER_NAME = {
  open({ dateStr, onSave, existing = null, context = "calendar" }),
  close(),
  // ...helpers
};
```

Where:
- `onSave(workoutObject)` — called on save. Builder does NOT touch
  `localStorage` or `cpWeekTemplate`.
- `existing` — edit mode pre-fill. `null` = create mode.
- `context` — `"calendar"` | `"plan-manual"`. Drives back-button target
  and any discipline-specific UI variants (e.g. date picker vs DOW
  picker).

Two canonical save handlers live in `js/workout-save-handlers.js`:

- `saveToCalendar(workout, date)` — unified replacement for
  `_saveCircuitToWorkouts`, `SwimBuilderModal._save`,
  `qeSaveGeneratedCardio`, `saveQuickActivity`,
  `qeSaveGeneratedStrength`, `_qeSaveStrengthWorkout`. For running, it
  routes to `workoutSchedule` via the existing `AddRunningSessionFlow.save`
  adapter (or absorbs that code).
- `saveToPlanDay(workout, planId, dayDate)` — replacement for
  `customPlanSaveManual`'s dual branch. Internally:
  1. derive `dow = new Date(dayDate).getDay()`
  2. build `{ id, mode: "manual", data: toCpDataShape(workout) }`
  3. call `_cpAddSession(dow, session)` or `_cpReplaceSession` if
     editing
  4. re-render the day card via `_cpRerenderDay(dow)`

The `toCpDataShape` adapter exists so the normalized workout shape maps
back onto the current `cpWeekTemplate` data model without touching
`saveCustomPlan()` or the planner expansion logic.

---

## 7. Migration order (from spec §Migration order)

| Phase | Builder | Rationale |
|---|---|---|
| 1 | handlers only | pure function extraction, no UI changes |
| 2 | Circuit | already modal + clean structure; smallest first slice |
| 3 | Swim | canonical step tree; fixes miles-in-swim bug |
| 4 | HIIT | picks up `hiitMeta` in CP Manual |
| 5 | Hyrox | stations + run legs available in CP Manual |
| 6 | Run / Bike | VDOT zones + targetPace surfaced |
| 7 | Brick | dual-duration + transition |
| 8 | Strength / Bodyweight | last; delete the generic CP form |

After Phase 8 the `#cp-manual-modal` + `cpManualAddExRow` +
`cpManualAddCardioRow` + `customPlanSaveManual` in `js/custom-plan.js`
are all deleted. The Manual button renders a discipline picker
identical to `qe-step-0`, each picker button opens the unified builder
with `onSave: w => saveToPlanDay(w, planId, dayDate)`.

---

## 8. Anti-regression invariants

1. `localStorage.workouts` and `localStorage.workoutSchedule` read
   schemas never change. Only the write sites consolidate.
2. `cpWeekTemplate` shape (`{ [dow]: [{ id, mode, data }] }`) never
   changes. `saveToPlanDay` produces the same shape the planner
   expansion already consumes.
3. Add Session UX is bit-identical after each migration — every click
   that worked before still works. The spec requires opening the same
   builder from Add Session + Build a Plan Manual side-by-side after
   each migration and diffing the resulting objects.
4. `AI Generate`, `From Saved`, `Rest` buttons on the Build a Plan day
   card are never touched.
5. Nothing in `storeGeneratedPlan`, `generated_plans`, or the planner
   expansion path (`saveCustomPlan`) changes.
