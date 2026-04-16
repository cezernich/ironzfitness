# Unified Workout Builder — Claude Code Agent Prompt

Paste this into your Claude Code session:

---

## Task

IronZ has two parallel implementations of every workout type. **Add Session** (from the calendar) has polished type-specific builders — swim canonical tree, circuit modal, hyrox stations, brick transitions. **Build a Plan → per-day Manual button** uses a single generic strength-or-cardio form. Fix this by extracting each Add Session builder into a reusable modal that accepts a save handler. Same UI, two destinations.

**Read `cowork-handoff/UNIFIED_BUILDER_SPEC.md` first. It is the single source of truth.** The save-handler contract, migration order, file structure, and anti-regression rules are specified there.

## Scope

Each day in Build a Plan has four buttons: `AI Generate | From Saved | Manual | Rest`. **Only the Manual button is in scope.** The other three stay exactly as they are.

## Context

- IronZ is a vanilla JS SPA (no bundler, no ES modules) deployed on GitHub Pages with a Supabase backend.
- All data is localStorage-first, synced to Supabase via `DB.syncKey()`.
- Add Session writes to `localStorage.workouts` / `workoutSchedule` — the specific date the user clicked.
- Build a Plan's Manual button writes to the custom plan template on that specific day (no week-repeat pattern).
- The planner (`generateTrainingPlan` via `storeGeneratedPlan`) is a SEPARATE path. This refactor does NOT touch it.
- `AI Generate`, `From Saved`, and `Rest` are SEPARATE paths. This refactor does NOT touch them.
- This is a structural refactor only. No new features. No new workout types. No UI redesigns.

## Critical files to read before writing any code

1. `cowork-handoff/UNIFIED_BUILDER_SPEC.md` — the full spec
2. The Add Session flow — find it by searching for `SwimBuilder`, `showCircuitBuilder`, `qeShowHIITOptions`, `HyroxBuilder`, brick transition logic. Map where each lives.
3. The Build a Plan per-day `Manual` button handler — find the generic "strength-or-cardio" form and its save path. The button lives on each day card inside Build a Plan, alongside `AI Generate`, `From Saved`, and `Rest`.
4. `js/db.js` — `DB.syncKey()` pattern, SYNCED_KEYS
5. `js/calendar.js` — how it reads workouts from localStorage (you must NOT change this read contract)

## Before writing any code: discovery pass

Claude Code must first produce a **discovery report** covering:

- Exact file paths and function names for every Add Session builder
- Exact file paths and function names for the Build a Plan per-day Manual button handler and its save flow
- The current workout object shape each builder produces
- The current save destinations (localStorage keys, table writes)
- Any cross-calls between builders and other parts of the app
- Confirmation that `AI Generate`, `From Saved`, and `Rest` buttons are handled by separate code paths that will NOT be touched

Do not start refactoring until this report is written. Commit the discovery report as `docs/BUILDER_INVENTORY.md` before Phase 1.

## Implementation order

One builder per commit. Each commit must leave Add Session fully working.

### Phase 0: Discovery report (commit as `docs/BUILDER_INVENTORY.md`)

### Phase 1: Extract save handlers (commit separately, no UI changes yet)
- Create `js/workout-save-handlers.js`
- Implement `saveToCalendar(workout, date)` — extract the current Add Session save logic here
- Implement `saveToPlanDay(workout, planId, dayDate)` — extract the current Build a Plan Manual button save logic here (single day, no week-repeat)
- Both handlers called from the existing flows via wrapper — no behavior change yet
- Commit: `refactor: extract saveToCalendar and saveToPlanDay handlers`

### Phase 2: Migrate CircuitBuilder (simplest, modal-based already)
- Create `js/workout-builders/circuit-builder.js`
- Accepts `{ onSave, existing, context }` — see spec for the contract
- Add Session calls it with `onSave: (w) => saveToCalendar(w, selectedDate)`
- Build a Plan's per-day Manual button, after the user picks "Circuit" from the new discipline picker, calls it with `onSave: (w) => saveToPlanDay(w, planId, dayDate)`
- Verify both flows produce identical workout objects
- Commit: `refactor: unify circuit builder across Add Session and Build a Plan Manual`

### Phase 3: Migrate SwimBuilder
- Extract to `js/workout-builders/swim-builder.js` with the same contract
- Wire both callers
- Commit: `refactor: unify swim builder`

### Phase 4: Migrate HIIT builder
- Commit: `refactor: unify HIIT builder`

### Phase 5: Migrate HyroxBuilder
- Commit: `refactor: unify hyrox builder`

### Phase 6: Migrate Run / Bike builders
- These will later consume VDOT pace zones — leave hooks for `zone` and `targetPace` in the workout object, but don't add VDOT logic here
- Commit: `refactor: unify run and bike builders`

### Phase 7: Migrate Brick builder
- Commit: `refactor: unify brick builder`

### Phase 8: Migrate Strength / Bodyweight builder → delete generic form
- This is the final slice
- After migration, delete the old generic "strength-or-cardio" form behind the Build a Plan Manual button
- The Manual button now opens the discipline picker described in the spec, routing to the unified builders
- `AI Generate`, `From Saved`, and `Rest` are untouched
- Commit: `refactor: unify strength builder and retire generic plan-manual form`

## Anti-regression rules

- **DO NOT** change Add Session's user-facing behavior. Every click, input, validation, and save result must be byte-identical before and after each migration.
- **DO NOT** change the calendar's read path. `js/calendar.js` keeps reading the same localStorage keys with the same shapes.
- **DO NOT** touch `storeGeneratedPlan()`, `generated_plans`, or `js/planner.js`. This refactor is about the Manual button and Add Session only.
- **DO NOT** touch the `AI Generate`, `From Saved`, or `Rest` buttons on the Build a Plan day card. Only the Manual button changes.
- **DO NOT** modify `js/auth.js`.
- **DO NOT** touch the swim CSS zones, FTP zones, race calendar, or VDOT zone logic (VDOT is a separate in-flight task).
- **DO NOT** rename any public function names that other files call. If extraction requires renames, keep the old name as a wrapper that forwards to the new one.
- **DO** verify after every commit that Add Session works end-to-end for every already-migrated discipline.
- **DO** verify after every commit that `AI Generate`, `From Saved`, and `Rest` still work unchanged on the Build a Plan day card.
- **DO** delete dead code (the generic form) only in Phase 8, after every builder is migrated.
- **DO** use `window.BUILDER_NAME = { ... }` globals — no ES modules.

## Per-phase test checkpoints

After every commit (Phases 2–8):
1. Open Add Session → pick the migrated discipline → build a workout → save. Confirm it lands on the calendar exactly as before the refactor.
2. Open Build a Plan → click `Manual` on any day → pick the same discipline from the new picker → build the same workout → save. Confirm it lands on that specific day of the plan template.
3. Compare the two produced workout objects — they must be structurally identical (modulo date).
4. Reload the page. Both persist.
5. Verify `AI Generate`, `From Saved`, and `Rest` still work on that day card.
6. Run through the other migrated disciplines to confirm nothing regressed.

## When in doubt

If a builder has behavior that doesn't cleanly fit the `onSave` contract (e.g. it writes to multiple localStorage keys, triggers a side effect in another tab), flag it in the discovery report and propose a handling before migrating it. Do NOT silently change side-effect behavior.
