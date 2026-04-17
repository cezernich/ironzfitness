# IronZ Rule Engine Spec — Production Ready

> **Version:** 1.0  
> **Last updated:** 2026-04-16  
> **Depends on:** TRAINING_PHILOSOPHY.md (v1.1), PLAN_SCHEMA.json, EXERCISE_DB (307 exercises)  
> **Architecture:** Constraint-driven, not template-driven. The engine fills sessions based on rules, not by copying a fixed template.

---

## 1. Design Principle

The rule engine generates training plans **deterministically** — no AI call needed for standard plans. It reads the athlete's profile, classifies them, selects the right constraints and session templates from TRAINING_PHILOSOPHY.md, and assembles a plan that conforms to PLAN_SCHEMA.json.

AI (Claude) is only called for freeform "Ask IronZ" requests, and even then the philosophy modules constrain the AI's output.

---

## 2. Execution Order

Plan generation follows this exact sequence. Each step depends on the previous.

```
Step 1: Classify athlete
Step 2: Build the arc (phases + race targets)
Step 3: Set weekly time budget
Step 4: For each week, insert key sessions first
Step 5: Apply global constraints
Step 6: Fill remaining slots with Z2/aerobic volume
Step 7: Select exercises for strength/circuit sessions
Step 8: Calculate nutrition + hydration targets
Step 9: Validate against safety rules
Step 10: Attach rationale
Step 11: Output PLAN_SCHEMA.json-conformant plan
```

---

## 3. Step 1: Classify Athlete

Read the user's profile from localStorage/Supabase. Produce a classification object.

### Inputs

| Field | Source | Required |
|-------|--------|----------|
| age | profile.age | Yes |
| weight | profile.weight (lbs) | Yes |
| height | profile.height (in) | No |
| gender | profile.gender | No |
| goal | profile.goal | Yes |
| daysAvailable | profile.availableDaysPerWeek | Yes |
| sessionDuration | profile.sessionLength | No (default 60) |
| CSS pace | profile.cssTime (sec/100m) | No |
| FTP | profile.ftp (watts) | No |
| Threshold pace | profile.thresholdPace (min/mile) | No |
| equipmentProfile | localStorage.equipmentProfile | No (default: full gym) |
| injuries | profile.injuries | No (default: none) |
| recentCheckIn | latest user_outcomes row | No |

### Classification Output

```javascript
{
  level: "beginner",             // highest sport-specific level
  sportLevels: {
    swim: "novice",              // from CSS cutoffs (Philosophy §2.1)
    cycling: "intermediate",     // from FTP/kg cutoffs
    running: "beginner"          // from threshold pace cutoffs
  },
  riskBias: "safety-first",     // from level (Philosophy §2.3)
  ageGroup: "30-39",            // from age
  goal: "race_performance",      // "race_performance" | "speed_performance" | "endurance" | "fat_loss" | "general_fitness"
  sportProfile: "triathlon",    // "triathlon" | "running" | "hyrox" | "cycling" | "general"
  daysAvailable: 5,
  sessionDuration: 60,
  equipmentAccess: "home_gym",  // derived from equipmentProfile tokens
  injuries: [],
  recoveryState: "good",        // from latest check-in
  weaknessProfile: {
    weakestDiscipline: "swim",  // lowest sport-specific level
    biasApplied: "none"         // set in Step 4
  }
}
```

### Level Derivation Functions

From TRAINING_PHILOSOPHY §2.1:

| Sport | Threshold | Beginner | Intermediate | Advanced |
|-------|-----------|----------|-------------|----------|
| Swim | CSS (sec/100m) | > 150 (>2:30) | 105–150 (1:45–2:30) | < 105 (<1:45) |
| Cycling | FTP (w/kg) | < 2.0 | 2.0–3.5 | > 3.5 |
| Running | Threshold (min/mi) | > 10.0 | 7.5–10.0 | < 7.5 |

No threshold data → default to **intermediate**.

### Dynamic Level Updates

From TRAINING_PHILOSOPHY §2.2:

Every 4–8 weeks, check:
- Beginner → Intermediate: adherence > 80% + completes structured blocks safely
- Intermediate → Advanced: handles 2+ quality sessions/week + measurable threshold improvement
- Demotion: adherence < 50% for 2+ weeks, or returning from 4+ week break

---

## 4. Step 2: Build the Arc

The arc defines the macro plan structure: how many weeks, which phases, where races fall.

**Two plan modes exist:**
- **Race-based arc:** Used when goal is `race_performance` (or any goal where the athlete has added a race). Works backwards from race date.
- **Rolling mesocycle arc:** Used when goal is `speed_performance`, `endurance`, `fat_loss`, or `general_fitness` with no race. Generates 4-week mesocycles that repeat and progress.

### Raceless Arc (Rolling Mesocycles)

From TRAINING_PHILOSOPHY §4.9. Used when no race is on the calendar.

1. Generate a 4-week mesocycle: 3 progression weeks + 1 deload
2. Set `arc.totalWeeks = 4`, `arc.phases = [{ phase: "mesocycle", startWeek: 1, endWeek: 4 }]`
3. Use goal-based hour ceilings from Philosophy §4.8 (Goal-Based Hour Ceilings table)
4. Use goal-based session distribution from Philosophy §6.5
5. Week 1 = baseline, Week 2 = +5–10% volume, Week 3 = +5–10% from week 2, Week 4 = deload (–40–50%)
6. At the end of each mesocycle, evaluate athlete feedback and generate the next mesocycle
7. Between mesocycles: rotate exercises (different selection from ExerciseDB), adjust volume/intensity based on feedback

**Mesocycle progression rules by goal:**
- `speed_performance`: increase interval count or duration each mesocycle
- `endurance`: increase long session duration by 10–15 min each mesocycle
- `fat_loss`: increase strength volume (add sets), keep cardio steady
- `general_fitness`: rotate emphasis (strength-focused → cardio-focused → mixed)

**If a race is added later:** Finish current mesocycle, then switch to race-based arc. Existing fitness counts as base.

### Single-Race Arc

1. Start from race date, work backwards
2. Assign phase durations using ratios from TRAINING_PHILOSOPHY §4.4/§4.5:

**Triathlon phase ratios:**

| Phase | % of Total Weeks |
|-------|-----------------|
| Base | 25% |
| Build | 30% |
| Peak | 25% |
| Taper | 15% |
| Race Week | 5% (min 1 week) |

**Running phase ratios:**

| Phase | % of Total Weeks |
|-------|-----------------|
| Base | 25% |
| Build | 35% |
| Peak | 20% |
| Taper | 15% |
| Race Week | 5% (min 1 week) |

**Running distance-specific taper override:** The default taper (15%) applies to marathon. For shorter distances, override: 5K taper = 7–10 days, 10K taper = 10–14 days, Half Marathon taper = 2 weeks. If the calculated taper from the percentage is longer than the distance-specific override, use the shorter distance-specific value and redistribute the extra weeks to Build.

**Hyrox phase ratios:**

| Phase | % of Total Weeks |
|-------|-----------------|
| Base | 30% |
| Build | 35% |
| Peak | 20% |
| Taper | 10% |
| Race Week | 5% (min 1 week) |

**Hyrox hour ceilings:** Beginner 5–7 hrs, Intermediate 7–10 hrs, Advanced 10–14 hrs.

3. If Pre-Base is needed (Philosophy §4.1): athlete returning from break, Beginner with no history, or post-injury → prepend 2–4 weeks of Pre-Base

### Multi-Race Arc

From TRAINING_PHILOSOPHY §4.6:

1. Identify A race (drives the full arc)
2. Insert B-race micro-taper windows: 3 days pre-race (reduce volume, drop long run, keep easy), race day, 3 days post-race (easy recovery only)
3. C races: no modification, train through

### Phase Compression

From TRAINING_PHILOSOPHY §4.2:

When weeks-to-race < ideal allocation:

| Priority | Phase | Action |
|----------|-------|--------|
| 1 (never compress) | Taper | Always preserve full duration |
| 2 (protect) | Peak | Preserve; only trim if extreme |
| 3 (compress first) | Base | Reduce or skip entirely |
| 4 (moderate compression) | Build | Reduce but keep key quality sessions |
| 5 (skip if needed) | Pre-Base | Drop if athlete has recent training |

If < 6 weeks to race: skip Pre-Base + Base → compressed Build → Peak → Taper.

---

## 5. Step 3: Set Weekly Time Budget

**Race-based plans:** Read the hour ceiling from TRAINING_PHILOSOPHY §4.8 based on athlete level + race distance. Example for Intermediate Olympic triathlon: **8–12 hrs/week**.

**Rolling mesocycle plans:** Read the goal-based hour ceiling from TRAINING_PHILOSOPHY §4.8 (Goal-Based Hour Ceilings table) based on athlete level + goal. Example for Intermediate fat_loss: **5–8 hrs/week**.

The session templates (Step 4) define the structure, but total weekly hours must not exceed this ceiling. If session count × average duration exceeds the ceiling, reduce duration per session proportionally.

---

## 6. Step 4: Insert Key Sessions First

Key sessions are the highest-priority sessions each week. They get placed first; everything else fills around them.

### Key Session Priority Order

**Triathlon:**
1. **Long run** → 2. **Long ride** → 3. **Intensity sessions** (tempo, intervals, threshold) → 4. **Brick workout** (Build + Peak only) → 5. **Key swim** (CSS intervals or race-pace)

**Running:**
1. **Long run** → 2. **Primary key workout** (distance-specific: VO2max for 5K, tempo for 10K/HM, MP long run for marathon) → 3. **Secondary key workout** (varies by distance, see Philosophy §4.5) → 4. **Strength**

**Hyrox:**
1. **Run + Station combo** (the defining Hyrox workout — alternate 1K runs with stations) → 2. **Interval runs** (1K repeats at race pace) → 3. **Station circuit** (multiple stations back-to-back) → 4. **Strength** → 5. **Long/easy run**

### Session Distribution by Phase

Pull session counts from TRAINING_PHILOSOPHY: §6.1 (triathlon), §6.2 (running), §6.3 (Hyrox). These define how many sessions of each type per week per phase.

**Running distance-specific overrides:** The base running templates in §6.2 apply to all distances. Apply the distance-specific overrides from Philosophy §6.2 (under "Distance-Specific Session Distribution Overrides") to adjust key workouts, long run style, and strides based on whether the target race is 5K, 10K, Half Marathon, or Marathon.

**Goal-based session distribution (rolling mesocycle plans):** Pull session templates from TRAINING_PHILOSOPHY §6.5. The athlete's selected activities determine which cardio slots are available. The goal determines the ratio of strength to cardio and which sessions are priorities.

**Fat loss strength floor:** If goal is `fat_loss`, the plan MUST include at least 2 strength sessions per week regardless of what activities the athlete selected. This is non-negotiable — strength protects muscle mass during caloric deficit. If the athlete only selected cardio activities, insert 2 full-body strength sessions anyway.

### Weakness Bias Application

From TRAINING_PHILOSOPHY §9.0:

If `weaknessProfile.weakestDiscipline` is identified:
- Option A: Add +1 session in weak discipline (if within hour ceiling)
- Option B: Upgrade an existing session type (e.g., easy swim → CSS intervals)
- Option C: Add technical focus (more drill work)

**Critical:** Never increase running frequency first. If run is the weakness, upgrade quality, don't add sessions.

Set `weaknessProfile.biasApplied` to whichever option was used.

---

## 7. Step 5: Apply Global Constraints

From TRAINING_PHILOSOPHY §4.3:

| Constraint | Beginner | Intermediate | Advanced |
|-----------|----------|-------------|----------|
| Max intensity sessions/week | 1 | 2 | 2–3 |
| Consecutive hard days | Never | Never | Allowed with recovery |
| Min rest days/week | 1 | 1 | 1 |
| Max weekly volume increase | 10% | 10–15% | 10–15% |
| Long run ≤ % of weekly mileage | 30% | 30% | 30% |

If Step 4 placed more intensity sessions than allowed, demote the lowest-priority one to Z2.

### No Consecutive Hard Days (Non-Advanced)

After placing key sessions, verify that no two intensity sessions are on adjacent days. If they are, move one or insert an easy/rest day between them.

---

## 8. Step 6: Fill Remaining Slots with Z2/Aerobic

After key sessions and constraints are applied, fill remaining available days with easy aerobic work:

- Running: easy runs (Z1–Z2)
- Cycling: Z2 endurance rides
- Swimming: technique or endurance sessions
- Strength: per the strength frequency for the current phase (Philosophy §8.4)

Fill in order of sport priority. For triathletes, use the volume distribution ratios (Philosophy §4.4) to decide which sport gets the remaining slot.

If weekly hours would exceed the ceiling, leave the slot as rest.

---

## 9. Step 7: Select Exercises (Strength/Circuit Sessions)

This step only applies to strength, circuit, HIIT, and Hyrox sessions.

### Integration with ExerciseDB

The rule engine calls `ExerciseDB.pick()` from the existing exercise-filters.js API. It does NOT maintain its own exercise database.

### Slot Template Selection

From TRAINING_PHILOSOPHY §7.5, select the slot template matching the session type:

| Session Type | Template |
|-------------|----------|
| Push day | Main horizontal push (P) + Main vertical push (P) + Secondary horizontal (S, diverse) + Accessory vertical (S/T) + Isolation triceps |
| Pull day | Main horizontal pull (P) + Main vertical pull (P) + Secondary pull (S, diverse) + Accessory (S/T) + Isolation biceps |
| Leg day | Main squat (P) + Main hinge (P) + Secondary squat (S, diverse) + Accessory hinge (S/T) + Isolation legs |
| Full body | 1 squat + 1 hinge + 1 push + 1 pull + 1 core/carry |
| Upper body | Horizontal push + vertical push + horizontal pull + vertical pull + arms isolation |
| Lower body | Squat + hinge + leg isolation × 2 |
| Chest focus | Main compound (P) + Secondary compound (S, diverse sub-target) + Isolation (T, diverse) |
| Sport-specific | Use `ExerciseDB.getForSport(sport)` |
| Circuit | Use `ExerciseDB.getCircuitExercises({ equipment: userEquip })` |
| Hyrox station circuit | Use `ExerciseDB.getHyroxStations()` for station exercises, supplement with substitutes from Philosophy §9.5 if equipment unavailable |
| Hyrox strength | Heavy compounds in Base (squat, deadlift, row, press, lunges); muscular endurance in Build (higher reps, station-specific); maintenance in Peak |

### Exercise Selection Rules

For each slot in the template:

```
1. Call ExerciseDB.pick({
     pattern: slot.pattern,
     tier: slot.tier,
     equipment: athleteProfile.equipmentProfile,
     excludeIds: [...already picked exercise IDs],
     ...(slot.diverseFrom ? compute sub-target exclusions)
   }, slot.count)

2. Sub-target diversity: if slot has diverseFrom constraint,
   exclude exercises with the same specificGoal as the
   referenced slot's exercise. (Philosophy §7.3)

3. Tier weighting: Primary = 2× probability,
   Secondary = 2× Tertiary probability. (Philosophy §7.2)

4. Equipment filter: only exercises matching user's
   equipmentProfile. Bodyweight exercises always pass.
   (Philosophy §7.4)
```

### Sets/Reps/Rest Assignment

From TRAINING_PHILOSOPHY §8.2:

| Tier | Sets | Reps | Rest |
|------|------|------|------|
| Primary (compound) | 3–4 | 6–8 (strength) or 8–12 (hypertrophy) | 120–180s |
| Secondary (compound) | 3 | 8–12 | 90–120s |
| Tertiary (isolation) | 2–3 | 10–15 | 60–90s |

Adjust by level:
- Beginner: fewer sets (lower end), higher reps, longer rest
- Advanced: more sets (upper end), varied reps, shorter rest

### Same-Day Cardio+Strength Pairing

From TRAINING_PHILOSOPHY §8.5:

| Cardio | Recommended Strength |
|--------|---------------------|
| Swim day | Pull + Core |
| Bike day | Legs + Posterior chain |
| Run day | Core + Hip stability |
| Rest/Easy day | Upper body, arms |

Ordering: Base phase → strength first, Build/Peak → cardio first.

---

## 10. Step 8: Nutrition + Hydration

### Nutrition Calculation

From TRAINING_PHILOSOPHY §10:

1. Calculate TDEE (Mifflin-St Jeor + activity multiplier)
2. Apply goal adjustment: bulk +10–20%, cut –15–25%, maintain ±0%
3. Calculate protein: use goal-specific g/lb target
4. Enforce safety floors: min 1,200 cal (women), 1,500 cal (men), min 0.6 g/lb protein

### Hydration Calculation

From TRAINING_PHILOSOPHY §11:

1. Daily baseline: 0.5 oz/lb bodyweight
2. Pre-session: 16–20 oz in 2 hours before
3. During sessions > 60 min: 20–30 oz/hour + electrolytes
4. Post: 16–24 oz per lb lost

---

## 11. Step 9: Validate Safety Rules

Every generated plan runs through the validator. These rules are from TRAINING_PHILOSOPHY §13 and are non-negotiable.

| Rule ID | Check | Auto-Fix |
|---------|-------|----------|
| calorie_floor | Calories ≥ 1,200 (W) / 1,500 (M) | Raise to floor |
| protein_floor | Protein ≥ 0.6 g/lb | Raise to floor |
| volume_increase_cap | Week-over-week increase ≤ 15% endurance, ≤ 4 sets/muscle strength | Cap at limit |
| rest_day_minimum | ≥ 1 rest day per week | Add rest day |
| deload_inclusion | Plans > 4 weeks have deload weeks | Insert deload |
| intensity_cap | Intensity sessions ≤ level max | Demote excess to Z2 |
| no_consecutive_hard | Non-advanced: no adjacent intensity days | Move or insert rest |
| long_run_proportion | Long run ≤ 30% of weekly mileage | Cap long run |
| beginner_complexity | Beginners: ≤ 5 exercises/session, ≤ 4 training days | Simplify |
| prohibited_phrases | No "guaranteed results", "lose X in Y days", etc. | Strip |
| disclaimer_present | Plan includes wellness disclaimer | Append |
| fat_loss_strength_floor | If goal is fat_loss: ≥ 2 strength sessions/week | Insert full-body strength sessions |

If any rule fails, the auto-fix is applied and a `validationFlags` entry is added to the plan output.

---

## 12. Step 10: Attach Rationale

Every plan gets a "Why this plan?" section:

```javascript
{
  summary: "Your 16-week Olympic triathlon plan is built around your 
    intermediate swim and run levels. Bike is your strongest discipline,
    so we've added extra swim technique sessions to close the gap.",
  keyDecisions: [
    "PPL strength split chosen because you train 5 days/week",
    "Swim weakness bias: +1 technique session per week in Base",
    "B-race micro-taper inserted for City Sprint Tri on week 8"
  ],
  assumptions: [
    "FTP of 3.2 w/kg places you at intermediate cycling",
    "No equipment profile set — full gym assumed",
    "Weekly hour ceiling: 8-12 hours (intermediate Olympic)"
  ],
  disclaimer: "This plan provides general wellness guidance and is not 
    a substitute for professional medical advice."
}
```

Every session also gets a per-session `rationale` field explaining why that specific workout exists.

---

## 13. Step 11: Output

The final plan must conform to `PLAN_SCHEMA.json`. Run JSON schema validation before returning.

---

## 14. Fallback Behavior

### If ExerciseDB is Not Loaded

Fall back to hardcoded exercise lists (legacy behavior). Log the failure. Never break plan generation.

### If No Threshold Data

Default all sport levels to intermediate. Generate plan normally. Show threshold prompt.

### If Generation Fails

Fall back to AI-assisted generation (constrained by philosophy). Tag plan as `generationSource: "ai_assisted"`.

### If No Matching Phase Ratios

Log a philosophy gap. Use conservative defaults (Base 30%, Build 30%, Peak 20%, Taper 15%, Race Week 5%).

---

## 15. Test Checkpoints

### Checkpoint 1: Classification

- User with FTP 3.0 w/kg, CSS 130s/100m, threshold 8:30/mi → cycling intermediate, swim intermediate, running intermediate → overall intermediate
- User with no thresholds → all intermediate (fallback)
- User age 52 → age group 50-59 → rest +25%, Z5 reduced 40%

### Checkpoint 2: Arc

- 16 weeks to Olympic tri A race → Base 4w, Build 5w, Peak 4w, Taper 2w, Race Week 1w
- Same + B race at week 8 → B-race micro-taper window inserted (days -3 to +3)
- Only 5 weeks to race → Pre-Base skipped, Base skipped, Build 2w, Peak 1w, Taper 1w, Race Week 1w
- 12 weeks to 5K → taper should be 1–2 weeks (not 15% = 2 weeks), extra weeks go to Build
- 16 weeks to Marathon → full 3-week taper preserved
- 12 weeks to Hyrox → Base 4w, Build 4w, Peak 2w, Taper 1w, Race Week 1w

### Checkpoint 3: Constraints

- Beginner plan: verify ≤ 1 intensity session/week, no consecutive hard days, ≤ 4 training days, ≤ 5 exercises/strength session
- Advanced plan: verify 2–3 intensity sessions allowed, consecutive hard days with recovery

### Checkpoint 4: Exercise Selection

- Bodyweight-only user: no barbell exercises in any session
- Chest session: exercises from at least 2 different sub-targets (not all upper-chest)
- Leg day: both squat-pattern AND hinge-pattern exercises present
- Hyrox station circuit: includes exercises from getHyroxStations() or substitutes

### Checkpoint 6: Running Distance-Specific

- 5K plan Build phase: has VO2max intervals as key workout, NOT marathon-pace long runs
- Marathon plan Build phase: has MP long run as key workout, has midweek medium-long run
- 5K taper: 7–10 days, not 3 weeks
- Marathon taper: 3 weeks

### Checkpoint 7: Hyrox Plan

- Hyrox Build phase: contains at least 1 run+station combo workout per week
- Hyrox plan has both running sessions AND station/strength sessions (not all running or all strength)
- Hyrox hour ceiling respected (Beginner 5–7, Intermediate 7–10, Advanced 10–14)

### Checkpoint 5: Validation

- Plan with 1,100 cal target for male → auto-raised to 1,500, flag added
- Plan with 0 rest days → rest day inserted, flag added
- Beginner plan with 3 intensity sessions → 2 demoted to Z2, flag added

---

**END OF SPEC**
