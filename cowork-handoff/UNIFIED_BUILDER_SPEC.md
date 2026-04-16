# Unified Workout Builder — Spec

## The problem

IronZ has two parallel implementations of every workout type:

- **Add Session** (from the calendar) has polished, type-specific builders — SwimBuilder (canonical set tree), CircuitBuilder (round/exercise modal), HIIT options, Hyrox stations, brick transitions. These save directly to the calendar via `localStorage.workouts` / `workoutSchedule`.
- **Build a Plan → per-day "Manual" button** uses a single generic "strength-or-cardio" form. It saves a single session onto that specific day in the custom plan template.

Every time a new workout type gets added, the work happens in Add Session and Build a Plan's Manual button falls further behind. The divergence is structural: the Add Session builders each own their save path, so there's nothing for the Manual button to reuse.

## Scope

**In scope:**
- The per-day **Manual** button inside Build a Plan (see screenshot: each day has `AI Generate | From Saved | Manual | Rest`). Only the Manual path.
- Every Add Session workout builder.

**Out of scope:**
- `AI Generate` — planner output, untouched.
- `From Saved` — saved-workout picker, untouched.
- `Rest` — single-click, no builder, untouched.
- The `generateTrainingPlan` / `storeGeneratedPlan` / `generated_plans` path.
- All race calendar, VDOT, FTP, CSS zone logic.

## The fix

Refactor each Add Session builder into a **reusable modal that accepts a save handler**. The builder owns the UI and produces a workout object. The caller owns the save logic.

```javascript
// Old: builder hard-codes the save
function showCircuitBuilder(date) {
  // ... UI ...
  // on Save:
  localStorage.workouts.push({ date, ...workout });
}

// New: builder takes a save handler
function showCircuitBuilder({ onSave, existing = null, context = 'calendar' }) {
  // ... same UI ...
  // on Save:
  onSave(workoutObject);  // caller decides where it goes
}

// Add Session (from calendar) uses it like this:
showCircuitBuilder({
  onSave: (workout) => saveToCalendar(workout, selectedDate),
  context: 'calendar'
});

// Build a Plan → Monday → Manual uses the same builder:
showCircuitBuilder({
  onSave: (workout) => saveToPlanDay(workout, planId, dayDate),
  context: 'plan-manual'
});
```

Same UI, two destinations. One source of truth per workout type.

## Save handler contract

Every builder's `onSave` receives a normalized workout object:

```javascript
{
  discipline: "strength" | "swim" | "run" | "bike" | "hyrox" | "brick" | "hiit" | ...,
  type: string,              // "circuit" | "intervals" | "tempo" | etc.
  name: string,              // user-entered or auto-generated
  durationMin: number,
  intensity: "low" | "medium" | "high" | "endurance",
  exercises: [...],          // for structured workouts
  structure: {...},          // type-specific payload (swim sets, circuit rounds, etc.)
  notes: string,
  zone: string | null,       // "Z2" | "Z4" | etc. if VDOT zones apply
  targetPace: string | null  // "8:23 – 9:13/mi" if applicable
}
```

This shape is already close to what the calendar reads today. The difference: builders no longer write directly to localStorage. They hand the object to the caller.

## Two save handlers

Both live in a new file: **`js/workout-save-handlers.js`**

### `saveToCalendar(workout, date)`
- Appends to `localStorage.workouts` / `workoutSchedule` for that single date
- Calls `DB.syncKey('workouts')`
- Triggers `renderCalendar()` to update the UI
- This is what Add Session already does — extract it into a pure function

### `saveToPlanDay(workout, planId, dayDate)`
- Saves the workout onto a single day in the current Build-a-Plan template
- Writes to the custom plan template structure (whatever Build a Plan currently uses today)
- Calls `DB.syncKey('trainingPlan')` or the equivalent plan key
- Triggers the Build-a-Plan day card to re-render so the workout name shows under the day
- This replaces the Manual button's generic form save logic
- Note: no week-repeat pattern here — the Manual button is explicitly per-day

## Migration order (one builder per commit)

Start with the simplest. Each migration is its own testable slice — commit, verify Add Session still works, verify Build a Plan Manual now shows the same builder, move on.

1. **Circuit** — already modal-based with a clean round/exercise structure. Smallest lift. Good first slice to prove the pattern.
2. **Swim** — canonical set tree. More complex UI but same migration pattern. After this, swim workouts are identical in both flows.
3. **HIIT** — interval configuration.
4. **Hyrox** — station sequence.
5. **Run / Bike** — pace-based session builders. These will also consume the VDOT zones (Z2 easy, Z4 threshold, etc.) once those land.
6. **Brick** — transition between two disciplines.
7. **Strength / Bodyweight** — the last one. After this, the generic "strength-or-cardio" form behind the Manual button is deleted.

Every commit preserves Add Session's behavior 1:1. No new workout types, no new fields — just extracting the save path.

## File structure after migration

```
js/
  workout-builders/
    circuit-builder.js       ← extracted from Add Session, accepts onSave
    swim-builder.js
    hiit-builder.js
    hyrox-builder.js
    run-builder.js
    bike-builder.js
    brick-builder.js
    strength-builder.js
  workout-save-handlers.js   ← saveToCalendar + saveToPlanDay
  add-session.js             ← now just wires builders to saveToCalendar
  build-plan-manual.js       ← Manual button now wires builders to saveToPlanDay
                               (AI Generate / From Saved / Rest untouched)
```

Each builder file exposes `window.BUILDER_NAME = { show, ...helpers }` — vanilla JS globals, consistent with the rest of the codebase.

## Build a Plan → Manual button UI

Each day in Build a Plan has four buttons: `AI Generate | From Saved | Manual | Rest`.

Today's **Manual** button opens a generic strength-or-cardio form. It should instead open a **discipline picker**:

```
[Swim] [Run] [Bike] [Strength] [Circuit] [HIIT] [Hyrox] [Brick]
```

Each button opens the same builder Add Session uses, with `onSave: (workout) => saveToPlanDay(workout, planId, dayDate)`. The `dayDate` is the day the Manual button was clicked on — no week-repeat, no pattern, just that one day.

`AI Generate`, `From Saved`, and `Rest` are not touched.

## Anti-regression rules

- **DO NOT** change Add Session's UX. Every click that worked before still works after.
- **DO NOT** change the calendar's read schema. `localStorage.workouts` keeps its shape.
- **DO NOT** change `storeGeneratedPlan()` or `generated_plans` — this is about the per-day Manual button, not the planner output.
- **DO NOT** touch the `AI Generate`, `From Saved`, or `Rest` buttons on the Build a Plan day card. Only the Manual button changes.
- **DO NOT** touch swim CSS zones, cycling FTP, or the race calendar logic.
- **DO** delete the old generic strength-or-cardio form behind the Manual button once Strength is migrated. No dead code left behind.
- **DO** extract each builder as a `window.BUILDER_NAME` global before wiring the save handler — keep the JS conventions consistent.
- **DO** verify both flows render identical UI after each migration by opening the same builder from Add Session and the Manual button side by side.

## Test checkpoints per migration

After migrating each builder:

1. Open Add Session → pick the discipline → build a workout → save. Confirm it appears on the calendar exactly as before.
2. Open Build a Plan → click Manual on any day → pick the same discipline → build the same workout → save. Confirm it appears on that specific day of the plan template.
3. Diff the two resulting workout objects. They should be identical except for the date.
4. Reload the page. Both the calendar entry and the plan-day entry should persist.
5. Verify `AI Generate`, `From Saved`, and `Rest` on the Build a Plan day card still work exactly as before.
