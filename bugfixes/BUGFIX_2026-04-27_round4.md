# IronZ — Bug Fix Prompts (2026-04-27, Round 4)

5 bugs from this morning's live workout. Two are real bugs (#2 push-day mapping, #3 live tracker data regression), two are intelligent-defaults improvements (#5 rest, #4 — informational only), and one is a fun feature add (#1 animation).

---

## Decisions locked in (2026-04-27 PM)

| # | Decision |
|---|----------|
| **1** | Confetti + success badge when the user logs the final set of their final exercise. Subtle, ~1.5s, dismissible. |
| **2** | Audit the push/pull/legs string lists in `js/onboarding-v2.js` — the variant library categories are correct, but several mapping arrays put Face Pull under `push`. That's the actual bug. |
| **3** | Live tracker must read the same resolved exercise data the home-screen card reads. Reps + weights are getting lost in the handoff to the tracker. |
| **4** | Informational only — no commit. The 55-min estimate is ~10 min high for actual reality (45 min). Calibration handled in **Bug 6** below. |
| **5** | Rest defaults need to factor in exercise *type* (compound / accessory / bodyweight), not just rep count. Add a `rest_default_sec` field to the variant library and use it. |
| **6** | Warmup sets shown as **descriptive text only** in compound lift cards — not as separate loggable rows. Solves the "user doesn't know to warm up" problem without bloating the live tracker. |
| **7** | Swim hydration bonus is reading a different duration (90 min) than the workout card displays (60 min). One source of truth — the workout's actual duration field — for both. |
| **8** | Hydration target gets soft + hard sanity caps to prevent over-recommending water. Soft cap 200 oz/day with electrolyte note; hard cap 300 oz/day with stronger warning. |

---

## ✨ Feature add

### Bug 1 — Confetti animation when all sets are logged

**Symptom.** Logging the final set of a workout currently just turns the last checkbox green. There's no celebration of finishing.

**Expected.** When the user logs the final set of the final exercise (i.e. the moment `_liveTracker.sets` has zero unlogged sets), trigger a confetti burst + a "Workout complete!" toast. Subtle, joyful.

**Acceptance criteria.**
- Confetti renders inline (canvas overlay or CSS-based — no new heavy dependency).
- Animation duration ~1.5s, auto-dismisses.
- Plays exactly once per workout (don't re-trigger if user un-logs and re-logs a set).
- Doesn't block the UI — Finish button remains tappable during the animation.
- Sound: optional. If shipping a sound, gate it behind the existing user pref for haptics/sound (or default to silent).
- Success: visible on iOS (Capacitor WebView) — confirm any canvas-based libs work in that context.

**Where to look.**
- `js/live-tracker.js`:
  - `_logLiveSet(exIdx, setIdx)` line ~373 — after marking a set done, check if all sets across all exercises are logged. If yes, call `_celebrateWorkoutComplete()`.
  - `_liveTracker.sets` is the source of truth — `t.sets.every(exSets => exSets.every(s => s.done))` is the all-done check.
- Recommended lib: `canvas-confetti` (~1.5kb gzipped) — or hand-roll with CSS keyframes if you don't want the dep. Either works.
- Place the `_celebrateWorkoutComplete()` function near the existing finish-related helpers around line 977.

---

## 🐛 Real bugs

### Bug 2 — Push day includes Face Pull (a pull exercise)

**Symptom.** Today's push day generated: Bench Press, Overhead Press, Close-Grip Bench, **Face Pull**, Tricep Kickback. Face Pulls are a rear-delt + upper-back exercise — it's a pull, not a push. The swap-alternates dialog also offered chest-only exercises (Dumbbell Press, Push-Up, Cable Fly, Dip, Incline Bench Press), confirming the planner knows the correct push vocabulary — it just leaks pull exercises into the push list.

**Root cause (verified).** The exercise categorization in `js/variant-libraries/strength.js:52` is **correct** — Face Pulls live under `accessory_pull` (`primary_muscle: "rear delts + upper back"`). The bug is in the bodyweight/equipment-fallback mapping arrays in `js/onboarding-v2.js`, which list Face Pull under multiple `push` arrays:

```
js/onboarding-v2.js:4608:  push:  ["Overhead Press", "Tricep Pushdown", "Face Pull", "Pallof Press"],
js/onboarding-v2.js:4617:  push:  ["Overhead Press", "Push-up", "Face Pull", "Pallof Press", "Dead Bug"],
js/onboarding-v2.js:4633:  push:  ["Push-up", "Band Row", "Face Pull", "Dead Bug"],
```

Pallof Press is core/anti-rotation — also doesn't belong on a push day. Band Row is a pull. The lists were assembled hastily and need an audit.

**Expected.** Push-day exercise pool contains only push-pattern exercises. Pull-day contains only pull. Same for legs.

**Acceptance criteria.**
- Audit every `push:` / `pull:` / `legs:` / `upper:` / `full:` array in `onboarding-v2.js` (lines 4585–4635 area).
- Move misplaced exercises to their correct categories:
  - `Face Pull` → `pull` and `upper`, never `push`.
  - `Pallof Press` → `pull` (anti-rotation, often paired with pulling) or `core` (preferred — but if no `core` array exists, keep on `pull`).
  - `Band Row` → `pull`.
  - `Push-up` → `push` and `upper` only, never `pull`.
- Pull lists should not contain pressing motions; push lists should not contain rowing/pulling motions.
- Add a unit test fixture `tests/strength-pattern-purity.test.js` that asserts no pull-pattern exercise appears in any `push:` array (and vice versa). Use exercise names cross-referenced against the variant library's category.

**Where to look.**
- `js/onboarding-v2.js` lines 4580–4635 — the full set of pattern arrays. Multiple sub-blocks per equipment level (full gym / home gym / bodyweight) — clean each one.
- `js/variant-libraries/strength.js` — the source-of-truth categorization. Use this to validate the audit.
- The swap dialog (screenshot 2) shows the right behavior — find that swap-suggestion logic and confirm it's reading from the variant library directly. If the swap dialog uses a different data path than the initial generation, that's why one is correct and the other isn't. The fix is to make initial generation use the same lookup.

---

### Bug 3 — Live tracker shows rep ranges and empty weights, home screen shows concrete reps + weights

**Symptom.** The home-screen Push Day card renders correctly: `Barbell Bench Press — 4 × 12 @ 215 lbs`, `Overhead Press — 3 × 12 @ 125 lbs`, etc. Tap **Start Workout**. The live tracker now shows the same exercises with reps as **`10-12`** and weights as **empty**.

This is a regression. The home page is resolving exercise data correctly (concrete reps from the program, concrete weights from PR/baseline). The live tracker is reading from an upstream / unresolved data source where reps are still ranges (`"10-12"`) and weights aren't filled in.

**Likely cause.** Looking at `js/live-tracker.js:342`:

```js
return { done: false, reps: sd ? sd.reps : (ex.reps || ""), weight: sd ? sd.weight : (ex.weight || "") };
```

`ex.reps` and `ex.weight` come from whatever was passed into `_initLiveTracker` (or wherever the tracker is started). If the caller passed the un-resolved variant-library blocks (`sets_reps: "3 x 10-12"`) instead of the resolved render-ready block (`reps: "12", weight: "215 lbs"`), this exact symptom appears.

In `js/strength-workout-generator.js:138`, accessories carry `sets_reps: variant.sets_reps` — which is the raw library string `"3 x 10"` or `"3 x 12-15"`. That's the un-resolved form.

The home-screen card and the live tracker need to read from the same resolved exercise list.

**Expected.** Live tracker reps + weights match the home-screen card exactly. Concrete numbers, not ranges. Weights pre-filled from the program.

**Acceptance criteria.**
- Tap any session card on home → tap Start Workout → first set shows the same `12` reps and `215 lbs` (or whatever) the card displayed.
- For accessories where the library says `"3 x 10-12"`, resolve to the higher end of the range as the displayed target (i.e. `12` reps), but allow the user to log fewer.
- Weight resolution: PR-based when available, else conservative estimate (round-2 D2 logic still applies). Not blank.
- Bodyweight exercises render as `BW` in the weight cell (already established convention).

**Where to look.**
- `js/live-tracker.js`:
  - Line 342 — the line reading `ex.reps`/`ex.weight`. Confirm what shape `ex` has at this point.
  - The function that initializes the tracker (search for where `_liveTracker` gets populated — likely something like `_initLiveTracker(sessionId, type)` or `startLiveWorkout(...)` ).
  - Whatever calls into the tracker is passing `exercises` — find that caller and confirm whether it's passing the resolved or unresolved form.
- `js/strength-workout-generator.js:138` — `sets_reps` comes straight from the variant library. Add a resolution step that splits `sets_reps` into `sets`, `reps`, and a `weight` lookup, and emits those as separate fields.
- `js/calendar.js` `renderWorkoutCard` (or equivalent) — the home-screen card path. Whatever data shape it uses should be the canonical one passed to the live tracker.
- This bug likely existed before any recent commit — the live-tracker data flow has just never been audited end-to-end against the home card.

---

## 🧠 Intelligent defaults

### Bug 5 — 2:30 rest for 3×5 pull-ups is way too long

**Symptom.** Added pull-ups to today's workout via `+ Add Exercise`. Logged 5 reps. Rest timer started at **2:30**. For 3×5 pull-ups (bodyweight calisthenics, low absolute load), 60–90s is correct.

**Root cause (verified).** `js/live-tracker.js:880` `_liveRestForSet(exIdx, setIdx)`:

```js
if (reps <= 5)  return 150000; // 2:30 — heavy strength
if (reps <= 8)  return 120000; // 2:00
if (reps <= 12) return 90000;  // 1:30 — hypertrophy
return 60000;                  // 1:00 — endurance
```

The function uses **rep count alone** to infer rest. 5 reps → it assumes "heavy strength" → 2:30 rest. But 5 pull-ups is bodyweight, not heavy. Rep count without exercise type is a bad proxy.

**Expected.** Rest time scales with both rep count AND exercise type/load:
- Heavy compound (squat, deadlift, bench, OHP) at low reps: 2–3 min.
- Moderate compound at hypertrophy reps: 1:30–2:00.
- Bodyweight / accessory / isolation: 0:45–1:30.

**Acceptance criteria.**
- Add a `rest_default_sec` field to entries in `js/variant-libraries/strength.js`. Examples:
  - Compound lifts (squat, bench, DL, OHP): 150
  - Pulling compounds (rows, pull-ups): 90
  - Accessory press (DB bench, incline DB): 90
  - Lateral raise / face pull / cable work: 60
  - Bodyweight (push-ups, pull-ups): 75
  - Isolation (curls, kickbacks): 45
- `_liveRestForSet()` rewrites:
  ```js
  function _liveRestForSet(exIdx, setIdx) {
    const ex = _liveTracker?.exercises?.[exIdx];
    if (ex?.rest_default_sec) return ex.rest_default_sec * 1000;
    // Fallback to existing rep-based logic when no metadata
    ...
  }
  ```
- For ad-hoc added exercises (where no library entry exists): infer from name. Substring match `"pull"`, `"row"`, `"curl"`, `"raise"` etc → use the appropriate default. Otherwise, fall back to the existing rep-count heuristic.
- The rest timer is still user-overridable via tap.

**Where to look.**
- `js/live-tracker.js:877–887` — `_liveRestForSet`. Replace the function body.
- `js/variant-libraries/strength.js` — add `rest_default_sec` to every variant entry. Default to 90 if you don't know.
- `js/strength-workout-generator.js:138` — when emitting blocks, pass `rest_default_sec` through from the variant.
- For ad-hoc exercises added in the live tracker (Bug 6 from round 2's `+ Add Exercise`), consult a small pattern table:
  ```js
  const REST_DEFAULTS_BY_PATTERN = [
    { match: /squat|deadlift|bench press|overhead press/i, sec: 150 },
    { match: /row|pull-up|chin-up|pulldown/i, sec: 90 },
    { match: /push-up|dip/i, sec: 75 },
    { match: /curl|kickback|raise|fly/i, sec: 45 },
  ];
  ```

---

### Bug 4 — How long should this workout take? (informational, no commit)

You asked for an unbiased read on the duration estimate.

**My estimate:** 48–54 minutes for that exact Push Day. The app's 55-minute number is in range — slightly conservative on the upper end, which is fine. If you breeze through rests, you're closer to 48; if you take your full 2-min rest between heavy bench sets, 55.

Per-block breakdown:

| Block | Time |
|---|---|
| Warmup + setup | 3–5 min |
| Bench Press 4×12 @ 215 (heavy) | 17–19 min |
| Overhead Press 3×12 @ 125 | 10–12 min |
| Close-Grip Bench 3×12 | 8 min |
| Face Pull 3×12 (should be swapped per Bug 2, but assume swapped to a same-time-cost alternate) | 5–6 min |
| Tricep Kickback 3×12 | 5–6 min |
| **Total** | **~48–56 min** |

**Translation for the duration generator:** the round-2 D2 fit-to-target logic appears to be working correctly here — it landed on 55, which is reasonable. No code change needed. Keep an eye on it for outliers (the 41-min vs 45-min gap from round 2 was a real symptom; this 55-min for ~50-min reality is acceptable variance).

---

## 🏋️ Warmup as descriptive text

### Bug 6 — Compound lifts need warmup guidance, but not as loggable sets

**Symptom + reasoning.** The duration estimate budgets time for warmups (10 min in the formula `10 + compoundCount × 12 + accessoryCount × 5`), but the app never tells the user to do them. Result: users finish in ~10 min less than estimated, and they're missing best-practice warmup sets. This morning's Push Day was estimated at 55 min, took 45 min including added pullups — base prescription would've been ~40 min flat, no warmup time used.

Two ways to close the gap. After discussion, going with the lighter-weight version: **show warmups as descriptive text in the exercise card, not as separate Log rows.**

**Expected.** Compound lift cards display a secondary line under the working-set spec:

```
Barbell Bench Press                    4 × 12 @ 215 lbs
Warmup: 5 @ 95 · 3 @ 155               [muted secondary line]
```

The user sees the guidance, knows to warm up, but the card still shows `4 × 12` as the actual workload. Live tracker shows the same warmup line as info text — no Log buttons, no extra set rows.

**Acceptance criteria.**

For when to show warmup text:
- Only for **compound lifts**: Bench Press, Squat, Deadlift (any variant), Overhead Press, Bent-over Row, Pull-up.
- Only when working weight exceeds threshold: `weight > max(0.5 × bodyweight, 65 lbs)`. Below that, no warmup text.
- Bodyweight compounds (pull-ups, dips): show as `Warmup: 1 set easy · 1 set 5 reps` instead of weights.

For format:
- Two warmup sets: `5 @ <50% working> · 3 @ <70% working>`.
- Round to nearest 5 lbs for cleanliness.
- Use the same weight unit the working set uses.

For the live tracker:
- Same secondary text line below the exercise name.
- No Log buttons next to warmup text.
- Optional: a small "Done warming up" tap target that resets the rest timer cleanly when the user starts working sets. Not required for v1 — can defer.

For the duration estimate:
- Recalibrate the per-compound minutes constant downward. Current `compoundCount × 12` was tuned to include warmup time; with explicit warmups now shown, working sets account for less time. Suggested new formula: `8 + compoundCount × 14 + accessoryCount × 5` where the +14 includes 4 min warmup + 10 min working sets (3-4 working sets at ~2.5 min each including rest).
- Calibration target: a workout with 1 compound + 4 accessories should estimate ~45 min, matching the user's actual reality.
- Verify: re-run the same Push Day inputs against the new formula, confirm output is in [42, 48].

**Where to look.**
- `js/strength-workout-generator.js`:
  - Line 109–116 (compound loop) — populate a `warmup_sets` array on each compound block: `warmup_sets: [{ reps: 5, weight: round5(working * 0.5) }, { reps: 3, weight: round5(working * 0.7) }]`.
  - Line 148 — recalibrate the duration formula per the spec above.
- `js/calendar.js` `renderWorkoutCard` — add the warmup text rendering. Style it muted (e.g., `color: var(--color-text-muted); font-size: 0.85em`).
- `js/live-tracker.js` line ~610 (where `repsWithSide` is built) — add the warmup text line below the exercise name in the live view.

**Test:**
- Bench Press 4×12 @ 215 lbs, 180 lb user → warmup text reads `5 @ 110 · 3 @ 150` (rounded to nearest 5).
- Lateral Raise 3×12 @ 15 lbs → no warmup text (below threshold).
- Pull-up 3×8 @ BW → warmup text `1 set easy · 1 set 5 reps`.

---

## 💧 Hydration

### Bug 7 — Hydration target says "90-min CSS Swim" but the swim is 60 min

**Symptom.** Home page shows two sources for the same swim:
- Workout card: `CSS Swim — 60 min`
- Hydration tip: `"Add electrolytes during your 90-min CSS Swim"`
- Hydration math: `117oz base + 72oz for your CSS Swim = 189oz target`

72 oz of bonus hydration corresponds to ~90 min of swim per the bonus formula in `js/hydration.js` `computeWorkoutBonusOz`. So this isn't a display typo — the hydration calculation is using a different duration than the card.

**Likely cause.** Two duration sources for the same workout, same root pattern as Bug 2 from round 3 (the 2h25m vs 1h55m mismatch). The workout card reads one field; `getWorkoutInfoForDate(dateStr)` reads another. The swim's `estimated_duration_min` is 60, but `_hydrationResolveDurationMin(w)` is finding a 90 somewhere — possibly a `target_duration_min`, `planned_duration_min`, or a stale field from a previous version of the same workout.

**Expected.** One source of truth. Whatever number the workout card displays as the duration badge is the number the hydration calc uses.

**Acceptance criteria.**
- `_hydrationResolveDurationMin(w)` returns the same value the workout card displays.
- For the screenshot's swim: hydration tip reads `"Add electrolytes during your 60-min CSS Swim"`, target math reads `117oz base + 48oz for your CSS Swim = 165oz`.
- Add a debug log when the resolved duration doesn't match `w.estimated_duration_min` so future drift is visible in console.
- Regression test: `tests/hydration-duration-source.test.js` — given a workout with `estimated_duration_min: 60`, hydration bonus is the 60-min bonus, not any other.

**Where to look.**
- `js/hydration.js`:
  - `_hydrationResolveDurationMin(w)` — find the function (around line 460–480 area). It probably has a fallback chain that picks up a stale field. Fix: prefer `w.estimated_duration_min` first, fall back to `w.duration` parsed, then `w.planned_duration_min`. Whichever you pick, use the SAME chain in calendar.js's day-totals (per Bug 2 from round 3 — that's the same canonical resolution).
  - `getWorkoutInfoForDate(dateStr)` line 440 — caller of the above.
  - `computeWorkoutBonusOz(type, durationMin, opts)` line 92 — receives the duration; not the bug, but worth confirming.
- For consistency: extract a single helper `getCanonicalSessionDuration(w)` and use it in both `js/hydration.js` and `js/calendar.js`. That's the proper long-term fix.

---

### Bug 8 — Hydration target needs an upper sanity cap

**Symptom.** Today's target is 189 oz (~5.6 L). That's high. With race-day or sauna bonuses stacking on top, targets can climb past 250 oz / 7.5 L. Past ~5 L/day without sodium replacement, you start risking hyponatremia (low blood sodium, can be dangerous). The app currently has no upper bound.

**Research note.** Hydration upper limits:
- *Daily total:* Healthy adults can typically handle 3–4 L (100–135 oz) without concern. Endurance athletes balanced with electrolytes can go higher — up to ~5 L/day is fine with consistent sodium intake. Past that, real risk of dilutional hyponatremia.
- *Hourly rate:* The bigger danger. >1.5 L/hr (~50 oz/hr) sustained can dilute blood sodium fast. Marathon hyponatremia deaths happen at the aid-station chug pattern.
- The app's existing race-day sodium guidance addresses hourly rate during events. The gap is daily-total sanity.

**Expected.**
- **Soft cap at 200 oz/day:** show the target as recommended but append a note: *"This is a high target — pair every 16–20 oz with electrolytes and don't drink it all at once."*
- **Hard cap at 300 oz/day:** target value clamps at 300, with a warning: *"Capped at 300 oz. Higher intake without medical guidance can dilute blood sodium dangerously."*
- The cap applies to the total across base + workout + race + sauna bonuses combined.

**Acceptance criteria.**
- `getHydrationBreakdownForDate(dateStr)` clamps `totalOz` at `HYDRATION_HARD_CAP_OZ = 300`.
- When `totalOz` exceeds `HYDRATION_SOFT_CAP_OZ = 200` but is below the hard cap, the breakdown includes a `softCapWarning` field with the electrolyte-pairing message.
- When the hard cap is hit, breakdown includes a `hardCapWarning` field.
- The renderer (`renderHydrationTransparency`) surfaces these warnings as inline notes below the standard transparency line.
- Constants live at the top of `js/hydration.js` for easy tuning.
- The cap NEVER applies retroactively — if the user has already logged 250 oz and the cap suggests 200, the cap is informational, not an error.

**Where to look.**
- `js/hydration.js`:
  - `getHydrationBreakdownForDate(dateStr)` line 538 — clamp logic at the end after `totalBonus` is computed.
  - `renderHydrationTransparency` (search for the function) — surface the new warning fields.
- Wording: keep it informative, not alarming. Most users hitting 200 oz are training hard and just need a sodium nudge, not a fear-based message.

**Test:**
- 117 base + 200 race-day bonus = 317 → output clamped to 300 with hardCapWarning set.
- 117 base + 100 swim bonus = 217 → softCapWarning set, totalOz remains 217.
- 117 base + 30 swim bonus = 147 → no warnings, totalOz is 147.

---

## Ship plan — 6 commits, each reviewable in <15 min

| Commit | Bug | Notes |
|---|---|---|
| **F1: Push/pull/legs purity audit** | 2 | Audit `onboarding-v2.js` lines 4580–4635 + add the regression test. ~30 min including test. |
| **F2: Live tracker reads resolved exercise data** | 3 | Trace caller of `_initLiveTracker` and ensure it passes the same shape the home card uses. May require a `resolveExerciseForTracker(block, prs)` helper. |
| **F3: Smart rest defaults** | 5 | Add `rest_default_sec` to variant library + pattern fallback for ad-hoc exercises. |
| **F4: Warmup as descriptive text + duration recalibration** | 6 | Add `warmup_sets` to compound blocks, render as muted text in card + tracker, recalibrate per-compound minutes constant. **Verify total estimate lands at ~45 min for the same Push Day inputs that previously estimated 55.** |
| **F5: Hydration single source of duration + sanity cap** | 7, 8 | Bundle: extract `getCanonicalSessionDuration(w)` helper used by both hydration.js and calendar.js, AND add the 200/300 oz caps. Both touch hydration.js — ship together. |
| **F6: Confetti** | 1 | Pure feature, low risk. Ship last so it's the dopamine hit when everything else lands. |

No SQL this round. No P0s.

**Tests added this round:**
- F1: `tests/strength-pattern-purity.test.js` — assert push lists contain only push exercises.
- F3: Unit test on `_liveRestForSet` — pull-ups → 75s, bench → 150s.
- F4: Unit test on the new duration formula — Push Day inputs → 42–48 min range. Warmup text generation: 4×12 @ 215 → `5 @ 110 · 3 @ 150`.
- F5: `tests/hydration-duration-source.test.js` — given `estimated_duration_min: 60`, bonus matches 60-min calc. Cap test: 117 base + 200 bonus → clamped to 300 with hardCapWarning.

The deferred test harness from rounds 1, 2, 3 is still owed. Same gap.
