# Backend Logic Audit — 2026-07-17

> **Fix status (updated 2026-07-21, branch `fix/audit-p0`):**
> **All 12 P0s fixed** — P0-1 zone clobber (merge + correct keys), P0-2
> HARD_LOADS (philosophy doc aligned), P0-3 HM Peak patterns + generator
> fallback, P0-4 discipline-aware trim + aligner constraints (verified by
> extracted-function test suite), P0-5/6 custom-plan resize/clobber,
> P0-7 parseInt buckets + template undercounts, P0-8 hiit template +
> circuit volumes, P0-9 full_body preserved + cap exemptions, P0-10
> racesWithPlans crash, P0-11 race-type mapping + user-visible error,
> P0-12 VDOT from Settings/survey + non-monotonic row removed.
> **P1 fixed:** zones.cycling dead key; run experience-level chain;
> compete goal alias; philosophy-button race types; nutrition load
> canonicalization (Hyrox/strides); long-day swap-not-delete; race-day
> boundary; sub-minute bike intervals; import FTP/CSS lookups;
> assembler sweet-spot/swim combo-zone targets; strides/hills strength
> attachment; displaced-session priority swap.
> **Remaining (unfixed):** swim 4-scheme zone unification; two VDOT
> table reconciliation (point vs range); planner two-clock drift; UTC+
> date shift; card-vs-phases bike/swim divergence; race-pace bike % by
> distance; tempo dropdown mapping; equipment vocabulary unification
> (M1-M3, M6-M8 strength); Ironman long-session ceiling; session-type
> string unification; P2 dead-code cleanup.

Full-repo audit of workout/plan generation logic across all sports (swim, bike, run,
strength, hybrid) and the plan pipeline. Six parallel review passes covering ~17.5k
lines: sport generators, variant libraries, session assembler, distribution aligner,
philosophy/rules engines, validators, `planner.js`, and `custom-plan.js`.

Focus: **confusing or contradicting logic**, and **whether each user selection
generates the workout it promises**.

Severity: **P0** = data loss, crash, or core promise broken · **P1** = workout
generated doesn't match the label/selection · **P2** = inconsistency, dead code,
cosmetic.

---

## Architecture context (read this first)

Three parallel plan-generation pipelines exist:

- **Pipeline A (live — race plans):** `planner.js _generateSingleRacePlan` →
  `WEEKLY_PATTERNS` → `PlanSessionDistribution` → `PlanConstraintValidator`.
  BUT only the `_regeneratePlanForRace` entry point runs the aligner + validator;
  `saveRace`, `_saveEditedRace`, and `survey.js:2257` call `generateTrainingPlan`
  raw (planner.js:5787, 5964). Same selections → different plan depending on entry
  point.
- **Pipeline B (live — non-race "philosophy" plans):** `philosophy-planner.js` →
  `philosophy-engine.js classifyUser` → `rules-engine.js` → `validator.js`.
- **Pipeline C (NOT wired):** `plan-generator.js` → `athlete-classifier.js` /
  `arc-builder.js` → `session-assembler.js` → `plan-validator.js`. Zero callers
  (plan-generator.js:9-10 admits it). Findings there are latent but will bite the
  moment it's wired — it uses a different raceType dialect (`'olympic-tri'`,
  `'5k'`) than Pipeline A (`'olympic'`, `'fiveK'`), so distance overrides and
  taper caps would silently no-op (arc-builder.js:72-74, session-assembler.js:142,
  plan-validator.js:33-39).

Four parallel strength set/rep systems exist; only two are live
(SessionAssembler slot templates; rules-engine + exercise-selector). The
`StrengthWorkoutGenerator` + strength/hybrid variant libraries are dead code whose
documented policy ("compound lifts do not rotate") the live path contradicts.

---

## P0 — Fix first

### P0-1. Logging a fitness test WIPES manually entered training zones
`zone-calculator.js:338-386` — `recalculateAllZones()` builds a bundle keyed
`{hr, run, bike, swim}` and **fully replaces** `localStorage 'trainingZones'`
(line 380-381), destroying the `{running, biking, swimming}` sub-objects written by
Settings (`app.js:1485-1500, 2429`) and the survey (`survey.js:1885`). Triggered by
every test log (`test-result-handler.js:311-314`). Contrast `storeHRZones()`
(zone-calculator.js:137-154) which merges correctly.
**Symptom:** after logging any test, saved FTP/CSS/paces vanish → bike workouts lose
wattage, cycling level reverts to "intermediate", zone screens go blank.
*Independently found by two audit passes (bike + run).*

### P0-2. Constraint validator counts `long` as "hard" → wipes ALL quality work
`plan-constraint-validator.js:37` — `HARD_LOADS = {"hard","long","race","test"}`.
Traced for Olympic/intermediate Build week: the adjacency pass (:148-181) demotes
both hard sessions (each sits next to a long session), then the two *long* sessions
alone fill the cap (:186-201). **Every intermediate Build/Peak week ends up with zero
interval/tempo work.** Beginners (cap 1) additionally get their long ride renamed
"Easy Ride" every week (:103-114). Contradicts §4.3 (cap is on Z4+ intensity — a Z2
long ride is not intensity) and SessionAssembler's own definition
(session-assembler.js:1006-1008). Failure is silent (console.log only,
planner.js:2285-2287).

### P0-3. Half-marathon plans generate EMPTY Peak weeks
`computePhasesFromRatios` always emits ≥1 Peak week for halfMarathon
(planner.js:170-219, `peak = Math.max(1, …)` at :206), but
`WEEKLY_PATTERNS.halfMarathon` (:532-587) has no `Peak` key → `patterns["Peak"]`
is undefined → empty pattern (:4382) → **1-3 completely blank weeks** between Build
and Taper. The aligner can't rescue weeks with zero entries, and doesn't even run on
the `saveRace` path. (`tenK`/`fiveK` dodge it only because `running_short` sets
`peak: 0.00`.)

### P0-4. Triathlon plans at ≤5 days/week lose ALL swims in Build/Peak
`adjustPatternToDays` (planner.js:3420-3490) trims by
`loadPri = {long:0, hard:1, moderate:1, strides:1, easy:2}`; stable-sort order for
the tri Build/Peak pattern puts both swims last → at 5 days/week, **zero swim
sessions** in Build and Peak; at 3 days, one swim in the entire plan. Where the
aligner *does* run, it "fixes" this by re-adding hardcoded **easy 30-min** swims
(plan-session-distribution.js:394, 428, 444) — the user's quality swim is silently
replaced with a generic easy one. Hyrox loads aren't in `loadPri` at all, so
trimming a 4-day Hyrox Base week drops `station_practice` — the only station work.
Expansion pads with easy *runs* regardless of race sport (:3471, 3481), including
into Taper weeks.

### P0-5. Editing a custom plan silently resizes it (8 weeks → 4)
Duplicated off-by-one: `Math.round(spanDays/7) + 1` (planner.js:2027,
custom-plan.js:2240). A W-week plan spans 7W−1 days → formula yields W+1. The edit
modal writes e.g. "9" into a `<select>` whose only options are 1/2/4/8/12
(index.html:410-416) → assignment fails → `saveCustomPlan` falls back to "4"
(custom-plan.js:2023). **Edit + re-save of an 8-week plan truncates it to 4 weeks.**
Also: every plan card displays one week too many.

### P0-6. Saving a custom plan deletes other custom plans' overlapping sessions
`saveCustomPlan` (custom-plan.js:2121-2123) removes every `source === "custom"`
entry in its date range **regardless of planId**. And the range itself is wrong:
entries aren't chronological (dow 0/Sunday maps to end of week, :2054-2061), so
`minDate` can be 6 days late (stale entries survive → duplicates) and `maxDate`
misses the final Sunday.

### P0-7. Philosophy pipeline trains fewer days than selected
`philosophy-engine.js:191-196` returns frequency buckets `'2-3'|'4-5'|'6-7'`;
`rules-engine.js:165` does `parseInt()` on them → 3 days becomes 2, 5→4, 7→6.
Same bug for session duration ('45-60' → 45, :269). Rules-engine templates then
undercount further: td=4 endurance → 3 sessions (:367-390); td=5 triathlon → 4
sessions with ONE swim (:499-508). Net: "Olympic tri, 5 days/week" → 4-session week,
silently.

### P0-8. "HIIT Circuit" generates a heavy barbell-strength session
`session-assembler.js:1441-1445` — `STRENGTH_SLOT_TEMPLATES` has no `hiit` key, so
subtype `hiit` falls back to the `full_body` strength template with
`SETS_REPS_REST` volumes (4×6-10, 120s rest). The card description meanwhile
promises "40s work / 20s rest × 3-4 rounds" (:1282-1284). Fat-loss plan users get
the opposite of the labeled session.

### P0-9. "Full-body strength" silently becomes upper-body-only — legs never trained
`PRESET_SPLIT_SUBTYPES` excludes `full_body` (session-assembler.js:935-938), so
`placeStrengthWithPairing` (:940-989) rewrites it; with no qualifying cardio day
(strength-profile weeks have none, :343-345), every session becomes
`pair_rest_upper` (:979-987) — a 100% upper-body template (:428-434). A
strength-focused athlete on a 2-3-day full-body split gets zero squat/hinge work,
every week. Related: `capStrengthFrequency` (:661-680) has no `mesocycle` key
(→ cap 2) and trims from the end — a 5-day PPL athlete in Build keeps only
`push_day`; fat-loss's "strength fills first" 3rd session is always cut.

### P0-10. Guaranteed ReferenceError kills the Training Blocks card
`planner.js:6386` — `const race = aRace || racesWithPlans[0];` —
`racesWithPlans` doesn't exist anywhere (verified). Reachable whenever all upcoming
races are B-priority. Throws, killing `renderTrainingBlocksSection()` and its
callers (saveRace :5821, deleteEvent :6052, promotion :2399).

### P0-11. Build Plan v2 race types generate no plan at all
`onboarding-v2.js:5275-5290` writes events typed `"5k"`, `"10k"`, `"century"`,
`"ultra"`, `"crit"`, `"stage"` — none exist in `RACE_CONFIGS` (`fiveK`, `tenK`,
`centuryRide`) → `generateTrainingPlan` returns `[]` (planner.js:4076-4078); the
only trace is a console log ("produced no entries", :2179). User gets a race card
with no plan and no error.

### P0-12. VDOT zones never load for Settings/survey users + tables disagree and go non-monotonic
`getZonesForUser()` (zone-calculator.js:497) reads VDOT only from
`profile.vdot || profile.run_vdot` — written *only* by the fitness-test flow.
Settings writes `trainingZones.running.*` (app.js:1485-1492), which is never read
→ all run workouts render effort-only, no paces, no explanatory prompt.
Additionally the two VDOT tables (`VDOT_PACE_TABLE` :284-297 vs
`VDOT_PACE_RANGE_TABLE` :397-411) disagree with each other (VDOT 50: point table
I/R paces sit outside the range table's ranges), the VDOT 53 row breaks
monotonicity (**an athlete improving 53→55 is told to run slower at every
intensity**), and both contradict the philosophy spec's checkpoints
(cowork-handoff/VDOT_ZONES_PROMPT.md:91-104) by ~50-60 s/mi.

---

## P1 — Selection generates the wrong workout

### Level/experience inputs are dead across most flows
- **Swim:** every variant's `reps` is a plain number, so the level-resolving branch
  never fires — novice and competitive swimmers get byte-identical workouts
  (swim-workout-generator.js:36-39, 101-113; variant-libraries/swim.js:17-35).
  `getLevelModifiers` (sport-levels.js:252-259) has zero callers.
- **Run:** `_experienceLevel()` reads `profile.experience_level || level || runLevel`
  — no code writes any of them; everything else writes/reads `profile.fitnessLevel`
  → everyone is "intermediate" (add-running-session-flow.js:48-51 vs
  survey.js:2027, planner.js:2197). All `experience_scaling` tables in
  session-type-library.js are dead in this flow. The duration slider then overrides
  rep counts anyway (add-running-session-flow.js:530-537), making beginner and
  advanced defaults identical.
- **Bike:** `_pickReps` (calendar.js:9474-9480) is defined, never called; the only
  level-scaled variant affects only the hidden `phases`. No bike variant declares
  `experience_minimum`.
- **Tri plans:** WEEKLY_PATTERNS tri patterns (planner.js:416-448) are not
  level-aware at all; level only filters library picks.
- **Custom plan:** the AI-options level dropdown feeds only prompt text; every saved
  entry is hardcoded `level: "intermediate"` (custom-plan.js:2074).
- **Legacy run form:** beginner+`compete` silently promotes to intermediate patterns
  (planner.js:3552) — never surfaced.
- **Selector pipeline:** beginners can never receive a tier-1 compound —
  `primary → difficulty 'advanced'` is excluded for beginners
  (exercise-selector.js:14-17, 221) while SETS_REPS_REST defines beginner
  prescriptions *for* primaries.

### Intensity labels contradict the generated content
- **Sweet Spot prescribed at 97% FTP** — `bikePowerTarget` checks Z4 before Z3;
  `sweet_spot` has zones ['Z3','Z4'] → threshold power on a session the UI defines
  as 88-94% (session-assembler.js:1114, 1182-1188).
- **"Tempo — Z3" → sweet-spot workout labeled Z4** (index.html:3306 →
  calendar.js:9462 → `_effortForPct` :9504-9513).
- **Race-pace bike = 97% FTP for every distance** — a 140.6 athlete's "Race-Pace
  Session" targets threshold; IM race intensity is ~65-75% FTP
  (session-assembler.js:1109).
- **Swim endurance targetPace = CSS (threshold)** while the steps say CSS+12; CSS
  intervals target CSS−3 while steps say CSS (session-assembler.js:1117-1118,
  1191-1197 vs variant-libraries/swim.js:29).
- **VO2 30/30s become ~18×1min @ 130% FTP** — sub-minute reps rounded up to 1 min
  then duration-packed (calendar.js:9585-9587; variant-libraries/bike.js:27).
  130% FTP is calibrated for 30-second reps.
- **Tempo title says 4×8, phases say 2×8** — title built from template scaling,
  content from duration override (running-workout-generator.js:711-712 vs 267-283).
- **Recovery Spin ≡ Zone 2 Endurance ≡ Long Ride** — three dropdown labels map to
  the identical workout; no Z1 option exists (calendar.js:9459-9461).
- **"Strides/easy run" days get ~5 strength exercises attached** — cardio skip-list
  omits `strides_run`/`hill_repeats`; unknown types default to the full-body
  pattern set (rules-engine.js:682-687, 448-467; exercise-selector.js:195-198).
- **Swim card intensity strip paints CSS/sprint work as Z2** — the zone-inference
  regex expects labels the generator never emits (calendar.js:8787-8797;
  swim-workout-generator.js:31-34; duplicated in ui/swim-builder-modal.js:654-661).
- **Long-run "with surges" labels ~half the easy running Z3**
  (running-workout-generator.js:162-166).
- **mp_long_run description hardcodes "final 8-12 miles at MP"** even on scaled
  75-min sessions and half-marathon plans (session-assembler.js:1266).

### User constraints ignored or violated
- **Aligner re-fills days the user marked unavailable and exceeds daysPerWeek** —
  `applySessionDistribution` receives neither parameter
  (plan-session-distribution.js:607, 239-272, 392-415) while planner honors them
  earlier (planner.js:3420-3447): trim, then refill on excluded days.
- **Race week / threshold weeks ignore `unavailableDays` and `daysPerWeek`
  entirely** (planner.js:4402-4464).
- **unavailableDays is only collectable on the "general" form** — running and tri
  forms never offer it (planner.js:5333, 5512 vs 5558).
- **Long-day preference DELETES the session on the chosen day** instead of swapping
  (`if (d === defaultLongDow || d === longDay) continue;` planner.js:3392) — picking
  Wednesday kills the Wednesday tempo, backfilled with an easy run.
- **Onboarding silently bumps daysPerWeek up** to the matrix value
  (onboarding-v2.js:3245-3255, console only).
- **Duration silently ignored** for swim ladder/broken/descending variants (no
  duration-aware variant filter — a 20-min request can land a ~55-min workout,
  swim-workout-generator.js:264-305, calendar.js:9394) and for run ladders/hills
  ladders (running-workout-generator.js:330-341, 530-537).

### Equipment filtering holes (strength)
- `'bodyweight'` equipment profile → **all 284 exercises pass, barbell included** —
  classifier vocabulary (`bodyweight|full_gym|home_gym|dumbbells`,
  athlete-classifier.js:99-110) doesn't match selector vocabulary
  (`none|dumbbells|kettlebell|home_gym|full_gym`, exercise-selector.js:112-124);
  unknown → null → full gym.
- `pickSlot`'s last-resort relaxation drops the equipment filter silently
  (session-assembler.js:1402-1406); zero bodyweight exercises exist for carry /
  horizontal-pull / vertical-pull, so minimal-equipment users get Farmer's Carries
  and cable rows.
- Bodyweight-only onboarding users bypass assembler filtering entirely
  (`equipmentRestrictions` is render-time only; assembler reads
  `classification.equipmentProfile`, onboarding-v2.js:4300-4311 vs
  session-assembler.js:1447) — shares/exports/coach views see barbell work.
- Bodyweight "upper body push and pull" outputs 3 push-only exercises — unfillable
  patterns are silently dropped (exercise-selector.js:375-382).

### Two clocks / two calculators disagree (planner)
- **Displayed phase timeline ≠ generated phases** — Training Blocks card uses
  `getAdaptivePhases` (planner.js:237-307, 6398), the generator uses
  `computePhasesFromRatios` (:4148): different taper lengths, different splits,
  halfMarathon Peak merged in one and emitted (empty) by the other.
  `TRAINING_BLOCK_INFO` (:6226-6311) hardcodes "Weeks 1-5 / 6-10 / 11-14 / 15-16"
  prose for all plan lengths.
- **Week-number clock vs phase clock** — weekNumber counts exact 7-day blocks from
  startDate; phases advance on Mondays; unless the race is on a Monday the clocks
  drift up to 6 days; deloads and variant rotation run on different clocks
  (planner.js:4242-4247, 4573-4576, 4471, 1687). Threshold-week/race-day entries
  can carry a stale weekNumber (:4455, 4586).
- **UTC+ timezone shift** — local-midnight dates serialized with
  `.toISOString().slice(0,10)` land a day early for users east of UTC; dow is
  computed locally → Monday patterns stamped with Sunday dates (planner.js:4369,
  3255, 3264, 2889; custom-plan.js:2065).

### Definitional conflicts (the root disease)
- **"Hard" has 5 definitions:** distribution (`hard|moderate|long`), constraint
  validator (`hard|long|race|test`), workout-validator (type ids + `is_hard` +
  loads), assembler (`priority==='intensity'`), plan-validator (`keySession`).
  Concrete effects include P0-2 (plan-session-distribution.js:290-292,
  plan-constraint-validator.js:37, workout-validator.js:21-24).
- **Swim zones: 4 schemes** — CSS is Z3 in training-zones.js:108-134, Z4 in
  calendar.js:9204-9213; zone-calculator.js:256-271 uses a 3-band model;
  session-assembler.js:1191-1197 a fourth.
- **Run paces: 5 systems** — two disagreeing VDOT tables, assembler flat-offset
  model (`runPaceTarget`, session-assembler.js:1173-1180, reads a field nothing
  writes), training-zones 5K-multiplier model (Z4 = 5K pace labeled threshold —
  actually I-pace effort, training-zones.js:53-82), generator zone ints. Same
  session renders Z3 in one surface, Z4 in another (session-assembler.js:1107-1108
  vs running-workout-generator.js:222, 294).
- **Bike VO2: 4 numbers** — 115-130% (variant lib), 108% (assembler :1185), 110%
  (calendar :9198), 106-120% (Coggan tables).
- **Level classifiers:** 3+ independent run classifiers and 2 cycling classifiers
  (one assumes weight in lbs, other kg) can disagree for the same athlete
  (sport-levels.js:45-53 vs training-zones.js:223-342; athlete-classifier.js:61-66).
- **Goal enums:** `compete` missing from `_GOAL_ALIASES` (planner.js:4265-4269) →
  strict tag filter excludes every goal-tagged library workout for "compete"
  athletes (workout-library.js:91-93); onboarding normalizes the same value
  differently (onboarding-v2.js:3188-3196).
- **Session-type strings:** AI path stores `"strength"`, manual path canonicalizes
  to `"weightlifting"` (custom-plan.js:1819 vs 835, 2070) — AI sessions invisible
  to conflict detection, labels, and the calendar's strength filter.
- **Deload:** every-4th-week × long-sessions-only vs every-3rd-week (advanced) ×
  everything ×0.55 — same word, three behaviors (plan-session-distribution.js:512,
  570 vs plan-generator.js:80, session-assembler.js:571, 1485-1495).
- **Load classification:** "Race Pace Run" = moderate (custom-plan.js:2108-2112)
  or hard (planner.js:4772-4783) depending on origin; custom entries never carry
  duration → a 2-hour custom long ride is fueled as an easy day.

### Other P1
- **Hyrox/strides/etc. loads rank as REST for nutrition** — `RANK[load] ?? 0` and
  `multipliers[load] || 1.3` treat all non-canonical loads as rest days: an entire
  Hyrox plan, race simulation included, gets rest-day calories
  (planner.js:4689-4801, 4969, 5008).
- **Ironman long sessions structurally capped near ~2-3.3h** — durations derive
  from the user's session-length preference × fixed factors; hour ceilings only
  scale DOWN; a 140.6 plan can never emit 4-6h rides
  (session-assembler.js:1055-1094; arc-builder.js:32-38). Confirmed independently
  by bike + run passes.
- **Two views of the same bike selection disagree** — card path duration-fits reps;
  `phases` path ignores `durationOverrideMin` for all interval types with fixed
  15/10-min WU/CD → live tracker/share sheet show a different workout than the card
  (calendar.js:9482-9598 vs bike-workout-generator.js:57-58, 85-118). Swim has the
  same disease: legacy `phases` hardcode a warmup that isn't in `steps`
  (swim-workout-generator.js:387-395); scaled rep counts contradict the title
  ("16 x 25 all-out" containing ~40×25, :283-292, 399).
- **Cycling race plans → strength split** — assembler returns null for 'cycling' →
  general template: 4 lifting days + 1 generic cardio for a century athlete
  (session-assembler.js:526-533, 331-351); distribution defines proper
  bike-dominant rows that never get used.
- **Assembler swim subtypes with no generator mapping** — `race_pace`,
  `short_race_pace`, `openers` all render as endurance swims
  (session-assembler.js:70, 83, 90; calendar.js:9384-9392).
- **FTP source contract broken for imports** — `getZonesForUser()` returns run-only
  (no ftp key ever), fallback reads `profile.ftp_watts` which Settings never
  writes → shared bike workouts import with no wattage
  (bike-workout-generator.js:33-38; zone-calculator.js:489-528;
  workout-import-validator.js:153). Swim import repeats a CSS-lookup bug calendar.js
  explicitly fixed (workout-import-validator.js:159 vs calendar.js:9396-9416).
- **Validator failure handling:** Pipeline A wraps aligner+validator in try/catch
  that only console.warns — a throw saves the unvalidated plan silently
  (planner.js:2270-2292). Pipeline C's `allPassed` is read by nothing and would be
  false almost always (validator converts an active-recovery day to rest every
  single week — session-assembler.js:1615-1652 vs plan-validator.js:146-187).
- **Double intensity-cap with different definitions (C):** assembler caps by
  priority keeping run>bike>swim; plan-validator re-caps by keySession (brick
  included) keeping by day order — can demote the exact session the assembler
  chose; demoted bricks keep the "Brick" name with Z2 zones
  (session-assembler.js:1002-1038 vs plan-validator.js:218-244).
- **Manual-add warning threshold contradicts generator caps** — warns only above 3
  hard/week for every level; generator caps are 1/2 (workout-validator.js:75-90 vs
  plan-constraint-validator.js:40-44).
- **Taper arc "fix" is cosmetic** — `checkRunningTaperLength` rewrites arc phase
  boundaries after weeks were already stamped; sessions not regenerated
  (plan-validator.js:504-531).

---

## P2 — Cleanups, dead code, cosmetic

- **Dead subsystems:** `StrengthWorkoutGenerator` + compound-chain progression
  (only test callers); `VARIANT_LIBRARY_HYBRID` (no steps/reps, no emitter, can't
  render); `VARIANT_LIBRARY_RUN` consumed only by the AI selector and disagreeing
  with what actually generates; Pipeline C wholesale; pre-plan "Week 0" gap builder
  unreachable (planner.js:4206-4230); `bike_intervals_sprint` unreachable from any
  UI; swim `rotation_cadence_by_type` and strength
  `accessory_rotation_cadence_weeks` read by nothing (`getRotationCadence` itself
  has zero callers).
- **Dead branches / stale code:** `r_pace_repeats` branch
  (running-workout-generator.js:432, 482); both ternary arms = 60
  (:437); `session` var never read (planner.js:4394); Peak-rule clause unreachable
  (planner.js:3861); `_pickReps` never called (calendar.js:9474); `exp` computed
  and unused (strength-workout-generator.js:116); GOALS constant omits "emom"
  (circuit-workout.js:31); stateful `/g` regex `.test()` skips prohibited-phrase
  matches nondeterministically (plan-validator.js:16-23, 370).
- **`zones.cycling` read, never written** — wattage detail line dead since day one;
  line 9612 in the same function reads the correct key (calendar.js:9195-9199).
- **Boundary/naming drift:** bike zone boundaries 0.55/0.75/0.90/1.05 vs
  0.56/0.76/0.91/1.06 (app.js:1725-1731 vs zone-calculator.js:202-208); race-day
  `>` vs `>=` filters (planner.js:2428 vs 6165, 2091); philosophy-button race-type
  strings match only `ironman`/`marathon` (planner.js:6210 vs 5799-5801); Hyrox
  session names render raw keys ("Easy_run Hyrox", planner.js:4473); swim CSS+12
  endurance pace falls in a zone gap; "10 x 50 sprint" prescribed at threshold pace;
  `_paceLabel(null)` labels CSS reps "easy"; two brick flows prescribe different
  intensities (calendar.js:9230-9246 vs session-assembler.js:1120); comment/table
  mismatches (bodyComp %s, stride-duration model, buildPatterns comment).
- **Bugfix regression check:** BUGFIX_bike_selection.md is in place for all four
  distances, but its fifth case ("no race → road bike") was never implemented —
  unknown races default to "full" → "TT bike strongly recommended," the opposite
  of spec (gear-checklist.js:258-276).
- **Assembler swim distance assumes 2:30/100m for everyone**
  (session-assembler.js:1218). Circuit equipment regexes mis-tag "Barbell Row" as
  Rower and bodyweight presses as Barbell (circuit-workout.js:74-86). Benchmark
  WOD "Row" name-collides with the strength "Rows" machine exercise. Slider
  max/clamp rounding mismatch shows a spurious "capped" warning
  (add-running-session-flow.js:525-529). session-type-library claims to be the
  source of truth but holds only the 8 run types; strength/circuit vocabularies
  live in 3 other places with different ids.

---

## What was verified WORKING

- All UI dropdown selections for swim (4), bike (7), and run (8) map to existing
  generator paths — no selection falls through to nothing; unknown run ids throw
  rather than silently defaulting.
- Threshold and VO2 bike variants: correct structure, math, and labels in both
  render paths. Endurance/long rides honor duration overrides.
- Race-distance → weekly volume ceilings all map to distinct sane values
  (arc-builder), even though the assembler only uses them to scale down.
- CSS resolution in the swim Add Session path handles all storage shapes; pool-size
  snapping, yard handling, and pace arithmetic are correct.
- Equipment token integrity: all 25 `equipmentNeeded` tokens exist in
  `EQUIPMENT_GROUPS`; every slot-template pattern/goal resolves to ≥2 exercises;
  full-gym/home-gym/dumbbell pools are sensible (284/170/115).
- Level scaling in the live strength paths (`SETS_REPS_REST`, `buildExerciseSet`,
  trim caps, deload ×0.55) is correct; ExerciseDB.pick diversity, recency
  exclusion, and the exercise regenerator are coherent.
- Race-week/threshold-week exclusion from aligner AND validator (no double taper);
  B-race window math; one-A-race enforcement; carb-load window (8/9/10 g/kg
  consistent everywhere); nutrition floors consistent across 3 modules; delete
  cascades behaviorally consistent; two-a-day generation seeds distinct picks;
  Benchmark WOD structures, Rx weights, and PR scoring correct.

---

## Recommended fix order

1. **P0-1** zone clobber (merge instead of replace — `storeHRZones` already shows how)
2. **P0-2** remove `long` from `HARD_LOADS` (one-line, restores all quality work)
3. **P0-3** add `Peak` keys to halfMarathon patterns (or map Peak→Build)
4. **P0-4** make trim priority sport-aware; stop refilling with hardcoded easy swims
5. **P0-5/6** week-count formula `Math.round((spanDays+1)/7)`; scope dedupe by planId
6. **P0-7** parse frequency buckets on their upper bound (or pass raw days through)
7. **P0-8/9** add `hiit` slot template; include `full_body` in preset splits; add
   `mesocycle` to `STRENGTH_FREQUENCY`
8. **P0-10/11** fix `racesWithPlans` ref; add missing RACE_CONFIGS aliases
9. **P0-12** make `getZonesForUser` read `trainingZones.running`; recalibrate the
   VDOT 53 row (or delete it) and unify the two tables
10. Then the unification work: one "hard" definition, one zone model per sport, one
    level field (`fitnessLevel`), one goal enum, one raceType dialect — most P1s
    collapse once those five vocabularies are single-sourced.
