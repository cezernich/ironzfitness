# Philosophy Update Spec: Time-Aware Volume Scaling Rules

> Date: 2026-04-08
> Evidence tier: 1 (Strong) — Multiple meta-analyses support underlying principles; lookup table is a synthesis of Schoenfeld et al. (2017, 2021), Grgic et al. (2017), and ACSM/NSCA guidelines
> Modules affected: LEVEL_BEGINNER, LEVEL_INTERMEDIATE, LEVEL_ADVANCED, SPORT_STRENGTH_CORE, SAFETY_BOUNDARIES
> New modules: VOLUME_TIME_SCALING (new)
> Files affected: rules-engine.js, exercise-selector.js, validator.js, philosophy_modules table
> Approved by: Chase

---

## Summary

The philosophy engine currently accepts `session_duration` as a user constraint but has no rules for scaling exercise count, total sets, or rest periods to fill the requested time window. This causes the rules engine to generate workouts that drastically under-fill the duration (e.g., 2 exercises × 4 sets for a 45-minute session — roughly 15-20 minutes of actual work). This spec adds a deterministic volume-to-time mapping system that ensures generated workouts plausibly fill the requested session duration, differentiated by session composition (compound-heavy vs. isolation-heavy vs. mixed).

---

## Evidence

### Primary Sources

1. **Schoenfeld et al. (2017)** — "Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis of randomized controlled trials." *Journal of Sports Sciences, 35*(11), 1073–1082.
   - Key finding: 10+ sets per muscle group per week produces superior hypertrophy outcomes. Volume is a primary driver of adaptation.

2. **Grgic et al. (2017)** — "The effects of short versus long inter-set rest intervals in resistance training on measures of muscle hypertrophy: A systematic review." *European Journal of Sport Science, 17*(8), 983–993.
   - Key finding: Rest periods of 60–180 seconds are effective for hypertrophy. Longer rest (2–3+ min) is superior for strength/power due to greater phosphocreatine recovery. Compound movements benefit more from longer rest than isolation movements.

3. **Schoenfeld et al. (2021)** — "Loading Recommendations for Muscle Strength, Hypertrophy, and Local Endurance: A Re-Examination of the Repetition Continuum." *Sports, 9*(2), 32.
   - Key finding: Working set duration of 30–60 seconds is typical across rep ranges. Tempo and time under tension interact with load selection.

4. **ACSM Guidelines for Exercise Testing and Prescription (11th ed.)** — General recommendations for session structure, warm-up duration, and exercise sequencing.

5. **NSCA Essentials of Strength Training and Conditioning (4th ed.)** — Rest period recommendations by training goal: strength (2–5 min), hypertrophy (1–2 min), endurance (<1 min).

### Evidence Assessment

These are Tier 1 sources — multiple meta-analyses and position stands from major bodies. The specific volume-to-time lookup table is our synthesis of these sources into actionable rules, but every underlying parameter (rest periods, working set duration, warm-up needs) is directly supported by the literature.

---

## Philosophy Document Changes

### New Section: Volume-to-Time Scaling Rules

**File:** IronZ_Philosophy_Engine_Spec_v1.0.docx
**Location:** Insert as new subsection under the training plan generation rules (after the current split design table in Section 5.1, before nutrition sections)

ADD THE FOLLOWING NEW SECTION:

> ### Session Duration → Volume Mapping
>
> The rules engine must scale workout volume to match the user's requested session duration. A 45-minute session should contain enough work to fill approximately 45 minutes; a 30-minute session should not contain the same volume as a 60-minute session. This mapping is deterministic and does not require AI.
>
> **Why this matters:** Under-filling a session erodes user trust ("this app doesn't know what it's doing") and leaves adaptation potential on the table. Over-filling creates time pressure that degrades form and skews RPE tracking.
>
> #### Time Budget Model
>
> Every session's time budget is composed of:
> - **Warm-up** (fixed by duration tier — see table below)
> - **Working sets** (set execution time + inter-set rest)
> - **Exercise transitions** (~1.5 minutes per exercise change: walk to station, adjust weight/settings, settle in)
> - **Buffer** (5 minutes — accounts for water breaks, re-racking, minor delays)
>
> Available working time = session_duration − warm_up − (num_exercises × 1.5 min transition) − 5 min buffer
>
> #### Base Volume-to-Time Table (Strength/Hypertrophy)
>
> | Session Duration | Min Exercises | Max Exercises | Sets/Exercise | Expected Rest (sec) | Warm-up (min) |
> |---|---|---|---|---|---|
> | 30 min | 3 | 4 | 3 | 60–90 | 5 |
> | 45 min | 4 | 6 | 3–4 | 90–120 | 5–7 |
> | 60 min | 5 | 7 | 3–4 | 90–150 | 7–10 |
> | 75 min | 6 | 8 | 3–4 | 120–180 | 7–10 |
> | 90 min | 7 | 10 | 3–4 | 120–180 | 10 |
>
> For durations between tiers, interpolate linearly. For durations under 30 min, minimum 2 exercises × 3 sets. For durations over 90 min, cap at 12 exercises (diminishing returns; fatigue-driven form breakdown risk).
>
> #### Session Composition Modifiers
>
> Not all sessions are equal. A session built around heavy compound lifts (squat, bench, deadlift) requires longer rest and more warm-up sets per exercise than a session of isolation/accessory work (curls, lateral raises, cable flyes). The volume-to-time mapping must account for this.
>
> **Compound-Heavy Sessions** (≥60% of exercises are compound movements):
> - Rest periods: 120–180 seconds between sets (compounds demand greater neuromuscular and phosphocreatine recovery)
> - Warm-up sets: 2–3 ramp-up sets per compound exercise (not counted in working sets but consume ~4–5 min per exercise)
> - Effective time per working set: ~3.0–3.5 minutes
> - Result: Fewer total exercises fit in the same duration. A 45-min compound-heavy session realistically fits 3–4 exercises.
> - Examples: Squat day, bench + OHP day, deadlift day, heavy pull day
>
> **Isolation-Heavy Sessions** (≥60% of exercises are single-joint/machine/cable):
> - Rest periods: 60–90 seconds between sets (lower systemic fatigue, faster recovery)
> - Warm-up sets: 0–1 per exercise (lighter loads, lower injury risk, often pre-fatigued from compounds earlier in the week)
> - Effective time per working set: ~1.5–2.0 minutes
> - Result: More exercises fit in the same duration. A 45-min isolation session can accommodate 5–7 exercises.
> - Examples: Arm day, rear delt/lateral raise accessories, cable-only session, machine circuit
>
> **Mixed Sessions** (blend of compound and isolation):
> - Use the base table as-is. Rest periods: 90–150 seconds (longer for the compound movements, shorter for isolation finishers).
> - Typical structure: 1–2 compound exercises first (with full rest), followed by 2–4 isolation/accessory exercises (with shorter rest).
> - This is the most common session type and the base table is calibrated for it.
>
> #### Adjusted Volume Tables by Session Composition
>
> **Compound-Heavy Sessions:**
>
> | Session Duration | Min Exercises | Max Exercises | Sets/Exercise | Rest (sec) | Warm-up (min) |
> |---|---|---|---|---|---|
> | 30 min | 2 | 3 | 3–4 | 120–180 | 5–7 |
> | 45 min | 3 | 4 | 3–4 | 120–180 | 7–10 |
> | 60 min | 4 | 5 | 3–4 | 150–180 | 7–10 |
> | 75 min | 4 | 6 | 3–4 | 150–210 | 10 |
> | 90 min | 5 | 7 | 3–4 | 150–210 | 10 |
>
> **Isolation-Heavy Sessions:**
>
> | Session Duration | Min Exercises | Max Exercises | Sets/Exercise | Rest (sec) | Warm-up (min) |
> |---|---|---|---|---|---|
> | 30 min | 4 | 5 | 3 | 45–75 | 3–5 |
> | 45 min | 5 | 7 | 3–4 | 60–90 | 5 |
> | 60 min | 6 | 9 | 3–4 | 60–90 | 5–7 |
> | 75 min | 7 | 10 | 3–4 | 60–90 | 5–7 |
> | 90 min | 8 | 12 | 3–4 | 60–90 | 7 |
>
> #### Level Modifiers
>
> - **Beginner:** Use the lower end of the exercise range for any session type. Hard cap at 5 exercises regardless of duration (existing rule). Default to shorter rest (60–90s) because loads are lighter and recovery demands are lower. Prioritize learning movement patterns over volume accumulation.
> - **Intermediate:** Full range from the tables. Standard rest periods as specified. Can handle the full variety of session compositions.
> - **Advanced:** Can push toward the upper end of exercise ranges. May need longer rest on primary compound lifts (180–300s for near-maximal strength work), which means fewer total exercises for the same duration — but higher intensity per set. This is a feature, not a bug: advanced athletes derive more benefit from intensity management than from exercise variety.
>
> #### Session Time Coverage Validation
>
> Every generated workout must pass a time coverage check:
>
> estimated_time = warm_up + Σ(sets_per_exercise × time_per_set) + (num_exercises × 1.5 min) + 5 min buffer
>
> Where time_per_set = working_time (~45 sec) + rest_period (from table)
>
> **Pass criteria:** estimated_time must fall between 70% and 110% of requested session_duration.
> - Below 70%: workout is under-programmed. Add exercises or sets until coverage is met.
> - Above 110%: workout is over-programmed. Remove lowest-priority exercises (drop from the bottom of the exercise list — accessories/isolation first).
>
> This validation is a hard rule, not a suggestion. Plans that fail time coverage must not be served to users.

CHANGELOG ENTRY:
> 2026-04-08 v1.1 — Added time-aware volume scaling rules: base volume-to-time table, compound/isolation/mixed session modifiers, level modifiers, session time coverage validator. Evidence: Schoenfeld (2017, 2021), Grgic (2017), ACSM, NSCA.

---

## Supabase Module Changes

### New Module: VOLUME_TIME_SCALING

**Table:** philosophy_modules
**Change type:** New module

```json
{
  "id": "VOLUME_TIME_SCALING",
  "category": "training_rules",
  "title": "Time-aware volume scaling for session duration",
  "version": "1.0",
  "applies_when": {
    "level": "any",
    "sport_profile": ["strength", "general_fitness", "hiit", "bodyweight"],
    "goal": "any"
  },
  "principles": [
    "Session duration is a hard constraint, not a suggestion — workouts must fill the requested time window",
    "Under-filling a session erodes trust and wastes adaptation potential",
    "Over-filling creates time pressure that degrades form and RPE accuracy",
    "Compound-heavy sessions require more rest and fewer exercises per unit time than isolation sessions",
    "Advanced athletes may need fewer exercises with longer rest — intensity trumps variety at high levels"
  ],
  "plan_rules": [
    "Classify each session as compound-heavy (≥60% compounds), isolation-heavy (≥60% isolation), or mixed",
    "Use the corresponding volume-to-time table to determine exercise count range for the requested duration",
    "Apply level modifier: beginners use lower end of range (cap 5), intermediates use full range, advanced can push upper end",
    "Calculate estimated session time using: warm_up + Σ(sets × time_per_set) + (exercises × 1.5min transition) + 5min buffer",
    "Reject plans where estimated time is <70% or >110% of requested duration"
  ],
  "hard_constraints": [
    "Minimum 2 exercises per session regardless of duration",
    "Maximum 12 exercises per session regardless of duration",
    "Beginners capped at 5 exercises per session",
    "Compound exercises: minimum 120s rest between sets",
    "Session time coverage must be 70-110% of requested duration"
  ],
  "volume_time_tables": {
    "mixed": {
      "30": {"min_exercises": 3, "max_exercises": 4, "sets_per_exercise": 3, "rest_seconds": [60, 90], "warmup_minutes": 5},
      "45": {"min_exercises": 4, "max_exercises": 6, "sets_per_exercise": [3, 4], "rest_seconds": [90, 120], "warmup_minutes": [5, 7]},
      "60": {"min_exercises": 5, "max_exercises": 7, "sets_per_exercise": [3, 4], "rest_seconds": [90, 150], "warmup_minutes": [7, 10]},
      "75": {"min_exercises": 6, "max_exercises": 8, "sets_per_exercise": [3, 4], "rest_seconds": [120, 180], "warmup_minutes": [7, 10]},
      "90": {"min_exercises": 7, "max_exercises": 10, "sets_per_exercise": [3, 4], "rest_seconds": [120, 180], "warmup_minutes": 10}
    },
    "compound_heavy": {
      "30": {"min_exercises": 2, "max_exercises": 3, "sets_per_exercise": [3, 4], "rest_seconds": [120, 180], "warmup_minutes": [5, 7]},
      "45": {"min_exercises": 3, "max_exercises": 4, "sets_per_exercise": [3, 4], "rest_seconds": [120, 180], "warmup_minutes": [7, 10]},
      "60": {"min_exercises": 4, "max_exercises": 5, "sets_per_exercise": [3, 4], "rest_seconds": [150, 180], "warmup_minutes": [7, 10]},
      "75": {"min_exercises": 4, "max_exercises": 6, "sets_per_exercise": [3, 4], "rest_seconds": [150, 210], "warmup_minutes": 10},
      "90": {"min_exercises": 5, "max_exercises": 7, "sets_per_exercise": [3, 4], "rest_seconds": [150, 210], "warmup_minutes": 10}
    },
    "isolation_heavy": {
      "30": {"min_exercises": 4, "max_exercises": 5, "sets_per_exercise": 3, "rest_seconds": [45, 75], "warmup_minutes": [3, 5]},
      "45": {"min_exercises": 5, "max_exercises": 7, "sets_per_exercise": [3, 4], "rest_seconds": [60, 90], "warmup_minutes": 5},
      "60": {"min_exercises": 6, "max_exercises": 9, "sets_per_exercise": [3, 4], "rest_seconds": [60, 90], "warmup_minutes": [5, 7]},
      "75": {"min_exercises": 7, "max_exercises": 10, "sets_per_exercise": [3, 4], "rest_seconds": [60, 90], "warmup_minutes": [5, 7]},
      "90": {"min_exercises": 8, "max_exercises": 12, "sets_per_exercise": [3, 4], "rest_seconds": [60, 90], "warmup_minutes": 7}
    }
  },
  "coaching_tone": "Confident, evidence-based. When explaining why a session has fewer or more exercises than expected, reference the session composition and rest requirements.",
  "evidence_sources": [
    "Schoenfeld et al. (2017) — Dose-response relationship between weekly resistance training volume and muscle mass",
    "Grgic et al. (2017) — Effects of short versus long inter-set rest intervals on muscle hypertrophy",
    "Schoenfeld et al. (2021) — Loading recommendations re-examination of the repetition continuum",
    "ACSM Guidelines for Exercise Testing and Prescription, 11th ed.",
    "NSCA Essentials of Strength Training and Conditioning, 4th ed."
  ],
  "rationale": "Without time-aware volume scaling, the engine produces workouts that drastically under-fill or over-fill the requested duration. This module ensures every workout plausibly fills the user's available time by mapping duration × session composition × level to concrete volume parameters.",
  "priority": "critical",
  "is_active": true
}
```

### Updated Module: LEVEL_BEGINNER

**Table:** philosophy_modules
**Version bump:** 1.0 → 1.1 (minor — adds time-scaling level modifier, existing plans still valid)

```json
{
  "id": "LEVEL_BEGINNER",
  "field_to_update": "plan_rules",
  "action": "append",
  "new_rule": "When applying volume-to-time scaling, always use the lower end of the exercise range. Hard cap at 5 exercises per session regardless of duration or session composition. Default rest periods to 60-90 seconds (loads are lighter, recovery demands are lower).",
  "version": "1.1",
  "change_log": "2026-04-08: Added time-aware volume scaling level modifier — beginners use lower exercise range, capped at 5, shorter rest"
}
```

### Updated Module: LEVEL_INTERMEDIATE

**Table:** philosophy_modules
**Version bump:** 1.0 → 1.1

```json
{
  "id": "LEVEL_INTERMEDIATE",
  "field_to_update": "plan_rules",
  "action": "append",
  "new_rule": "When applying volume-to-time scaling, use the full range from the corresponding session composition table. Standard rest periods as specified in the VOLUME_TIME_SCALING module.",
  "version": "1.1",
  "change_log": "2026-04-08: Added time-aware volume scaling level modifier — intermediates use full range"
}
```

### Updated Module: LEVEL_ADVANCED

**Table:** philosophy_modules
**Version bump:** 1.0 → 1.1

```json
{
  "id": "LEVEL_ADVANCED",
  "field_to_update": "plan_rules",
  "action": "append",
  "new_rule": "When applying volume-to-time scaling, can push toward the upper end of the exercise range. For primary compound lifts at near-maximal intensity, rest periods may extend to 180-300 seconds — this reduces total exercise count for a given duration but is appropriate because advanced athletes derive more benefit from intensity management than exercise variety.",
  "version": "1.1",
  "change_log": "2026-04-08: Added time-aware volume scaling level modifier — advanced can push upper range, extended rest for heavy compounds"
}
```

### Updated Module: SPORT_STRENGTH_CORE

**Table:** philosophy_modules
**Version bump:** Current → +0.1 (minor)

```json
{
  "id": "SPORT_STRENGTH_CORE",
  "field_to_update": "plan_rules",
  "action": "append",
  "new_rule": "Before assembling exercises for any session, classify the session as compound-heavy, isolation-heavy, or mixed based on the planned movement pattern distribution. Use the VOLUME_TIME_SCALING module's corresponding table to determine exercise count and rest period targets for the requested session duration.",
  "version": "increment_minor",
  "change_log": "2026-04-08: Added dependency on VOLUME_TIME_SCALING module for session assembly"
}
```

---

## App Code Changes

### File: rules-engine.js

**Reason:** The `buildWeeklyTemplate` and `populateExercises` functions currently select exercises without considering whether they'll fill the requested session duration. They need to consult the volume-to-time tables.

**Change:**

1. Import or retrieve the `VOLUME_TIME_SCALING` module during plan assembly.

2. Add a new function `determineSessionVolume(sessionDuration, sessionComposition, level)` that:
   - Looks up the correct table (compound_heavy / isolation_heavy / mixed) based on session composition
   - Finds the matching duration tier (interpolate for non-standard durations)
   - Applies level modifier (beginner → lower end, advanced → upper end)
   - Returns: `{ min_exercises, max_exercises, sets_per_exercise, rest_seconds, warmup_minutes }`

3. Call `determineSessionVolume()` before `populateExercises()` and pass the returned volume parameters to the exercise selector.

4. Add a helper `classifySessionComposition(movementPatterns)` that counts the ratio of compound to isolation movement patterns for the session and returns 'compound_heavy', 'isolation_heavy', or 'mixed'.

### File: exercise-selector.js

**Reason:** `selectExercises()` currently receives `sessionType` but not duration-based volume constraints. It needs to know how many exercises to select.

**Change:**

1. Add a `volumeParams` parameter to `selectExercises()` containing the output of `determineSessionVolume()`.

2. Use `volumeParams.min_exercises` and `volumeParams.max_exercises` as bounds when selecting exercises. Current logic selects based on movement patterns — keep that, but ensure the total count falls within the volume bounds.

3. If movement patterns require fewer exercises than `volumeParams.min_exercises`, add accessory/isolation exercises to fill the gap (prioritize muscles already being trained in the session for additional volume).

### File: validator.js

**Reason:** Need a new validator rule to reject plans that don't fill the requested time window.

**Change:** Add new validator rule:

```javascript
{
  id: 'session_time_coverage',
  check: (plan, profile) => {
    const requestedDuration = parseInt(profile.sessionLength); // minutes
    if (!requestedDuration) return true; // no duration specified, skip

    for (const [day, session] of Object.entries(plan.weekly_template)) {
      if (session.session_type === 'rest') continue;
      if (!session.exercises || session.exercises.length === 0) continue;

      const warmup = session.warmup_minutes || 5;
      const buffer = 5;
      const transitionTime = session.exercises.length * 1.5;

      let workingTime = 0;
      for (const exercise of session.exercises) {
        const sets = exercise.sets || 3;
        const restSec = exercise.rest_seconds || 90;
        const workSec = 45; // average working set duration
        workingTime += sets * ((workSec + restSec) / 60);
      }

      const estimatedTotal = warmup + workingTime + transitionTime + buffer;
      const coverage = estimatedTotal / requestedDuration;

      if (coverage < 0.70 || coverage > 1.10) {
        return false;
      }
    }
    return true;
  },
  fix: (plan, profile) => {
    // If under 70%: add exercises from exercise library (accessories for trained muscles)
    // If over 110%: remove last exercise(s) in session (lowest priority — isolation/accessory first)
    return { fixed: true, flag: 'Session volume adjusted to match requested duration' };
  }
}
```

---

## Validation Checklist

- [ ] Hard validator rules still pass with new values (existing beginner_complexity rule: max 5 exercises — compatible with new tables since beginner modifier enforces same cap)
- [ ] No safety boundaries violated (volume-to-time tables respect existing max volume increase rules)
- [ ] Golden test cases still produce appropriate results — specifically re-test:
  - [ ] 30-min beginner full body → should now have 3 exercises, not 2
  - [ ] 45-min intermediate chest → should now have 4-5 exercises, not 2
  - [ ] 60-min advanced push day (compound-heavy) → should have 4-5 exercises with longer rest
  - [ ] 45-min isolation accessory session → should have 5-7 exercises with shorter rest
- [ ] New evidence sources added to VOLUME_TIME_SCALING module's evidence_sources array
- [ ] Module versions bumped: LEVEL_BEGINNER 1.0→1.1, LEVEL_INTERMEDIATE 1.0→1.1, LEVEL_ADVANCED 1.0→1.1, SPORT_STRENGTH_CORE +0.1
- [ ] New module VOLUME_TIME_SCALING created at version 1.0
- [ ] Philosophy doc changelog updated with v1.1 entry
- [ ] Session time coverage validator added to validator.js

---

## Rollback Plan

If this change causes issues:

1. **Disable the module:** Set `VOLUME_TIME_SCALING.is_active = false` in philosophy_modules. The rules engine should gracefully fall back to the previous behavior (no time-based volume constraints).

2. **Revert level modules:** Roll back LEVEL_BEGINNER, LEVEL_INTERMEDIATE, LEVEL_ADVANCED to version 1.0 (remove the appended plan_rules about time-scaling).

3. **Revert SPORT_STRENGTH_CORE:** Remove the appended plan_rule about VOLUME_TIME_SCALING dependency.

4. **Remove validator:** Comment out or remove the `session_time_coverage` validator rule from validator.js.

5. **Philosophy doc:** Remove the "Session Duration → Volume Mapping" section and revert changelog to v1.0.

All changes are additive (no existing rules were modified or removed), so rollback is clean — just remove the additions.
