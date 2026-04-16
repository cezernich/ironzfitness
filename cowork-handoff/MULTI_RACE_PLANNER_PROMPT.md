# Multi-Race Planner — Claude Code Agent Prompt

Paste this into your Claude Code session:

---

## Task

Implement multi-race aware plan generation for IronZ. The planner currently builds a plan for a single race. It needs to accept the full race calendar, build the training arc backwards from the A race, and insert micro-taper/recovery windows around B races.

**Read `cowork-handoff/MULTI_RACE_PLANNER_SPEC.md` first. It is the single source of truth for this task.** Everything — data structures, function signatures, periodization logic, B-race window insertion, UI enforcement — is specified there.

## Context

- IronZ is a vanilla JS SPA (no bundler, no modules) deployed on GitHub Pages with a Supabase backend.
- All data is localStorage-first, synced to Supabase via `DB.syncKey()`.
- Active plans are stored via `storeGeneratedPlan()` in `js/philosophy-planner.js` → writes to `generated_plans` table. **Never write to `training_plans` — it's a zombie table.**
- `raceEvents` is a localStorage key (synced) containing an array of race objects with `priority: "A"` or `"B"`.
- The existing `generateTrainingPlan(race)` in `js/planner.js` takes a single race. You are refactoring it to take a `raceCalendar` object (output of `prepareRaceCalendar(raceEvents)`).

## Critical files to read before writing any code

1. `cowork-handoff/MULTI_RACE_PLANNER_SPEC.md` — the full spec for this task
2. `js/planner.js` — current `generateTrainingPlan()` implementation (~2000 lines of race-specific config)
3. `js/philosophy-planner.js` — `storeGeneratedPlan()` function
4. `js/onboarding-v2.js` — Build Plan flow, `_confirmAndSavePlan()` or equivalent save logic
5. `js/calendar.js` — understand how it reads `trainingPlan` from localStorage to render sessions
6. `js/db.js` — SYNCED_KEYS, DB.syncKey() pattern
7. `onboarding-v3-mockup.html` (lines 679-770) — bp-3-race screen UI reference
8. `docs/TRAINING_PLAN_STORAGE.md` — canonical plan storage reference

## Implementation order

### Phase 1: UI enforcement (js/onboarding-v2.js)
- Enforce one A race max in the bp-3-race screen
- Add `toggleRacePriority(index)` function
- When user sets a second race to A, auto-demote the previous A to B with a toast
- First race added defaults to A, subsequent races default to B
- Validation: if no A race exists when user clicks Continue, auto-promote the earliest race

### Phase 2: Race calendar preparation (js/planner.js)
- Add `prepareRaceCalendar(raceEvents)` function
- Sorts races by date, validates one A race, filters out B races after the A race date
- Returns `{ aRace, bRaces, all }`

### Phase 3: Refactor generateTrainingPlan (js/planner.js)
- Change signature from `generateTrainingPlan(race)` to `generateTrainingPlan(raceCalendar)`
- Build periodization backwards from A race date using `buildPeriodization(aRace, totalWeeks)`
- Generate day-by-day sessions from phase templates
- **Keep all existing race-specific config tables** (the ~2000 lines of distance/type configs). Don't throw those away — they inform the session templates per phase.
- After generating the A-race session array, loop through B races and call `insertBRaceWindow()` for each

### Phase 4: B-race micro-taper window (js/planner.js)
- Add `insertBRaceWindow(sessions, bRace, aRace)` function
- 3 days before B race: reduce volume ~30%, drop long sessions, keep everything easy
- Race day: replace session with B race event
- 3 days after: easy recovery for all disciplines
- **Critical:** Do NOT drop disciplines that aren't the B race discipline. If A race is Ironman and B race is a half marathon, swim and bike sessions stay during the taper/recovery window — they just go easy.

### Phase 5: Update save flow
- In the plan confirmation handler, replace:
  ```javascript
  // Old:
  const plan = generateTrainingPlan(raceEvents[0]);
  // New:
  const raceCalendar = prepareRaceCalendar(raceEvents);
  const plan = generateTrainingPlan(raceCalendar);
  ```
- `storeGeneratedPlan(plan)` call stays the same
- Also update any other callers of `generateTrainingPlan` to use the new signature

### Phase 6: Calendar B-race markers (js/calendar.js)
- When rendering a day with a session that has `isBRace: true`, add a small visual marker
- Week view: small "B" badge or flag on the side card
- Month view: distinct colored dot
- Day detail: "B RACE" pill next to the workout name
- This is purely visual — the data is already in the sessions array

### Phase 7: Commit
- Commit message: `feat: multi-race aware planner — A race drives arc, B races get micro-taper`

## Anti-regression rules

- **DO NOT** delete the existing race-specific config tables in planner.js. They contain distance/type-specific training parameters that are still needed.
- **DO NOT** change `storeGeneratedPlan()` — it already works correctly.
- **DO NOT** change `DB.syncKey()` or the sync pattern.
- **DO NOT** change `js/auth.js`.
- **DO NOT** modify the onboarding screen flow order (bp-1 → bp-2 → bp-3-race → bp-4 etc.). Only modify the race priority toggle logic within bp-3-race.
- **DO NOT** write to the `training_plans` table. Active plans go to `generated_plans`.
- **DO** update `localStorage.trainingPlan` + `DB.syncKey("trainingPlan")` after plan save for backward compat (calendar.js reads this).
- **DO** preserve the `raceEvents` localStorage schema — no field renames.
- **DO** search for all callers of `generateTrainingPlan(` across the codebase and update them to use the new signature with `prepareRaceCalendar()`.

## Test case: Chase's setup

After implementation, generating a plan with these races:
- A Race: Ironman, Sept 6, 2026 (category: triathlon, type: Full Ironman)
- B Race: Half Marathon, July 19, 2026 (category: running, type: Half Marathon)

Should produce:
- ~20-week triathlon block with swim/bike/run/strength spread across every week
- July 16-18: reduced volume, no long run, easy swim/bike
- July 19: Half Marathon race day session
- July 20-22: easy recovery across all disciplines
- July 23+: snap back to full Ironman Build phase
- September weeks: taper into Ironman as the A race
