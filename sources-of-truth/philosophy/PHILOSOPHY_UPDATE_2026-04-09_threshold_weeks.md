# Philosophy Update Spec: Threshold Weeks (Run / Bike / Swim / Tri)

> Date: 2026-04-09
> Evidence tier: Tier 1 for the principle (periodization + scheduled retesting), Tier 2 for the specific cadence values (coaching consensus across Friel/Daniels/Coggan/TrainingPeaks)
> Modules affected: NEW: TRAINING_THRESHOLD_WEEK, TESTING_PROTOCOLS. UPDATED: RUNNING_ZONE_CALCULATIONS, SPORT_ENDURANCE_RUNNING, SPORT_ENDURANCE_CYCLING, SPORT_ENDURANCE_SWIMMING, SPORT_TRIATHLON
> Approved by: Chase (2026-04-09)

---

## Summary

Adds a structured threshold-week protocol to the IronZ planner. Every N weeks (goal-dependent: 4 for race-prep, 6 for base, 8 for maintenance), the planner inserts a deload + testing week. Volume drops to 60–70% of the prior week, all hard intensity is removed except the test itself, and the test result auto-updates the user's VDOT (run), FTP (bike), and CSS (swim). Triathletes spread the three tests across one threshold week (one test per day, never stacked). Skipping a threshold week slides the cadence forward (next one falls N weeks after the skip, not N-1). All zone-driven workouts auto-recalculate after a successful test.

---

## Evidence

### 1. Retesting Cadence (Tier 1 — coaching consensus across primary methodologies)

- **Joe Friel** (*Triathlon Training Bible*, *Cycling Past 50*): FTHR/FTP "best done early in Base and in the Build periods and then repeated every six weeks or so throughout the season." 30-min field test every 4–8 weeks.
- **TrainingPeaks** (Hayden Scott, *Threshold Tests for Swim, Bike and Run*): "CSS tests are included in training plans every 8 weeks during a recovery week."
- **Coggan & Allen** (*Training and Racing with a Power Meter*): FTP retesting every 4–6 weeks during build phases.
- **Jack Daniels** (*Daniels' Running Formula*): VDOT-driven plans implicitly require periodic re-racing or time trials to recalibrate.
- **Convergent recommendation:** 4–8 weeks depending on training phase, with 6 weeks as the most common default.

### 2. Threshold Week as Deload (Tier 1 — periodization literature)

- The 3:1 / 4:1 / 5:1 build-to-recovery ratio is standard across Friel, Pfitzinger, NSCA *Essentials of Strength Training*, and ACSM periodization guidelines. A 6-week cycle = 5 build weeks + 1 deload, and the deload week is the natural place to test.
- **Why test ON the deload, not after:** Fresh legs from a deload give a more representative threshold reading. Testing into accumulated fatigue understates fitness and miscalibrates zones downward.
- **Volume target:** Coaching consensus puts deload volume at 50–70% of the preceding peak week. We use 60–70% so the user is rested but not detrained.

### 3. Test Protocols (Tier 1 — established field tests)

- **Run — 5K time trial:** Daniels VDOT tables map directly from 5K time → VDOT score → all 5 training paces. The 30-min run test (Friel) is a fallback for runners who can't safely run a flat-out 5K.
- **Bike — 20-minute FTP test:** Coggan's protocol. Average power for 20 minutes × 0.95 = FTP. Standard across TrainingPeaks, Zwift, TrainerRoad.
- **Swim — CSS test (Olbrecht/Maglischo):** 400m TT followed by 200m TT after rest. CSS = (400m time − 200m time) / 2, expressed as pace per 100m.
- **Why these three tests:** They are the most repeatable, require no lab equipment, and produce a single number that maps cleanly to each sport's zone system.

### 4. Triathlon Spread (Tier 2 — coaching consensus, no RCT)

- Stacking three max-effort tests in one weekend produces noise: Day 2 and Day 3 results are degraded by Day 1's fatigue. Spreading the tests across the week (one per day with easy days between) gives cleaner data.
- Trade-off: a triathlete's threshold week has less true rest because there are more "on" days. Mitigation: the tests themselves replace what would have been hard sessions, so total stress is still lower than a normal build week.

### 5. More Than 2–3 Threshold Sessions/Week = Overreaching (Tier 1)

- Seiler, Laursen & Buchheit, ISSN endurance position stand: more than 2–3 threshold-or-above sessions per week without proportional recovery causes parasympathetic withdrawal and performance decline. The threshold WEEK is therefore not a "cram three hard tests in" week — it's a deload that happens to contain test efforts.

---

## Philosophy Document Changes

### Change 1: New Section — Threshold Weeks & Retesting

**File:** IronZ_Philosophy_Engine_Spec_v1.0.docx
**Location:** New top-level subsection inside Section 5 (Sport Modules) — place AFTER existing endurance content and BEFORE the strength modules. Suggested heading: **5.X Threshold Weeks & Retesting Protocol**

ADD THE FOLLOWING:

> ### 5.X Threshold Weeks & Retesting Protocol
>
> A threshold week is a deload week that doubles as a fitness assessment. Every 4–8 weeks (cadence depends on training phase), IronZ inserts one of these into the plan. The week serves two purposes: (1) **recovery** — volume drops to 60–70% of the prior peak week and all hard intensity is removed, and (2) **calibration** — the user runs a sport-specific test that auto-updates their VDOT, FTP, and/or CSS. Zones for every subsequent workout are then recalculated from the new value.
>
> #### Why Threshold Weeks Exist
>
> Two problems they solve. First: every periodized plan needs scheduled deloads. Without them, accumulated fatigue compounds and either crushes performance or causes injury. Second: zones drift. A runner who set their VDOT 8 weeks ago has either gotten faster (in which case all their easy/threshold/interval work is now too easy) or hasn't (in which case the plan can stop trying to push pace and refocus). Ad-hoc retesting is unreliable — users skip it. Bundling the test into a mandatory deload week means it actually happens.
>
> #### Cadence by Training Phase
>
> | Training Phase | Threshold Week Frequency | Rationale |
> |---|---|---|
> | **Race prep / build** (within 8 weeks of an A race) | Every **4 weeks** | High training load needs more frequent deloads, and zones change quickly during peak fitness gains |
> | **Base** (general training, 8+ weeks from a race) | Every **6 weeks** | Default cadence. Matches Friel's recommendation and absorbs progressive overload without over-resting |
> | **Maintenance** (no race scheduled, fitness preservation mode) | Every **8 weeks** | Lower load means less fatigue accumulation; zones drift more slowly |
>
> The user can override the cadence in settings (allowed range: 4–8 weeks). The default is set automatically based on their current goal and race date.
>
> #### Structure of a Threshold Week
>
> A threshold week is 7 days. The exact layout is:
>
> | Day | Single-sport athlete | Triathlete |
> |---|---|---|
> | Day 1 (Mon) | Easy 30–40 min Z1 | Easy swim 30 min Z1 |
> | Day 2 (Tue) | Easy 30–40 min Z1 + 4×20s strides | Easy bike 45 min Z1 |
> | Day 3 (Wed) | Rest or 20 min Z1 | Easy run 30 min Z1 |
> | Day 4 (Thu) | **TEST DAY** | **SWIM TEST (CSS)** |
> | Day 5 (Fri) | Easy 30–40 min Z1 | **BIKE TEST (FTP)** |
> | Day 6 (Sat) | Optional 45–60 min Z1 (skip if test was hard) | **RUN TEST (5K)** |
> | Day 7 (Sun) | Rest | Rest or 30 min easy spin |
>
> Total volume target: **60–70% of the prior week's volume.** Zero workouts above Z2 except the test efforts themselves.
>
> #### Sport-Specific Test Protocols
>
> **Run — 5K Time Trial**
> - Warm-up: 15 min easy + 4×20s strides
> - Test: 5K all-out on a flat course (track or measured loop preferred)
> - Cool-down: 10–15 min easy
> - Output: Finish time → VDOT score → new E/M/T/I/R paces
> - **Fallback for runners who can't safely race 5K** (returning from injury, masters athletes, beginners): 30-minute run test. Run as hard as can be sustained for 30 min on flat ground; average HR of the final 20 min = LTHR. Average pace of the final 20 min = T-pace.
>
> **Bike — 20-Minute FTP Test (Coggan protocol)**
> - Warm-up: 15 min easy + 3×1 min progressive (Z2 → Z3 → Z4) + 5 min easy
> - 5-minute hard primer (~108% of expected FTP) + 10 min easy
> - Test: 20 min all-out at the highest sustainable power
> - Cool-down: 10 min easy spin
> - Output: 20-min average power × 0.95 = FTP (watts)
> - New zones derived from FTP using Coggan's % FTP table
>
> **Swim — CSS Test (400 + 200)**
> - Warm-up: 400m easy + 4×50m build
> - Test 1: 400m all-out time trial
> - Recovery: 5–10 min easy swim
> - Test 2: 200m all-out time trial
> - Cool-down: 200m easy
> - Output: CSS (sec/100m) = (T_400 − T_200) / 2
> - New swim zones: easy = CSS + 12s/100m, threshold = CSS, race pace = CSS − 3 to 5s/100m
>
> #### Triathlon: Three Tests, One Week
>
> Triathletes complete all three tests inside a single threshold week. **Never stack two tests on the same day** — the second test will be degraded by the first. The fixed order across the week is **swim → bike → run**, with at least one easy day between each. This puts the highest-impact effort (run) last so any DOMS from running doesn't pollute the bike or swim test.
>
> #### Hard Constraints
>
> - **Never** schedule two threshold tests on the same day.
> - **Never** schedule a test the day after a long run, long ride, or long swim.
> - **Never** insert a threshold week within 14 days of a goal A race (the taper handles deload; testing into a taper compromises the race).
> - **Never** schedule two threshold weeks back-to-back (minimum 3 weeks of build between threshold weeks).
> - **Never** allow more than 8 weeks to pass without a threshold week unless the user has explicitly disabled the feature.
> - If the user is sick, injured, or reports RPE > 8 on three consecutive days during a threshold week, **abort the test** and reschedule to the next threshold week.
>
> #### Skip Behavior — Slide, Don't Compress
>
> If a user skips a scheduled threshold week (travel, illness, family event, etc.), the next threshold week is rescheduled to fall **N weeks after the skip date**, not N weeks after the originally planned date. Rationale: forcing two threshold weeks closer together to "make up" the missed one creates an unintended high-recovery cluster. The slide approach treats each threshold week as a fresh start of the next build cycle.
>
> Example: cadence is 6 weeks. Threshold week was scheduled for Week 12. User skips it during Week 12 (does a normal Week 12 instead). Next threshold week is now scheduled for Week 18, not Week 18 minus the missed deload.
>
> #### Post-Test Workflow
>
> 1. The app prompts the user to log the test result the moment the test workout is marked complete.
> 2. The result is validated (sanity-check against the user's prior value — flag if the change is more than ±15%, since that usually indicates a logging error or a bad test day).
> 3. If valid, the new VDOT/FTP/CSS is written to the user's profile and the previous value is archived to `fitness_history`.
> 4. All cached zones for that sport are recalculated using `RUNNING_ZONE_CALCULATIONS` (run), Coggan % FTP (bike), or CSS-derived bands (swim).
> 5. The user receives a notification: *"Zones updated. Your Z3 threshold pace was 6:51/mi, now 6:44/mi. Tap to see all the new zones."*
> 6. All future workouts in the active plan auto-update to use the new zones.
>
> #### Coaching Tone for Threshold Weeks
>
> Lower the intensity of language. The week is intentional rest plus an honest snapshot — not a peak week, not a race. Sample copy:
> - **Week start:** "This week is your reset. We're cutting volume by ~35% and pulling all the hard work except one test on Thursday. Treat the test like a B race, not an A race."
> - **Day before test:** "Tomorrow's test is a snapshot, not a verdict. Sleep, hydrate, eat normal. The number tells us how to dial in the next 5 weeks — that's it."
> - **Day after test:** "Test logged. Your zones are updated. The next 5 weeks will use these numbers. Welcome to the build."
>
> #### Changelog
>
> 2026-04-09 — Initial threshold week protocol added. Goal-dependent cadence (4/6/8 weeks). Tests spread across the week for triathletes. Slide-on-skip rescheduling. Auto-recalculates zones via RUNNING_ZONE_CALCULATIONS.

---

## Supabase Module Changes

### New Module: TRAINING_THRESHOLD_WEEK

```json
{
  "id": "TRAINING_THRESHOLD_WEEK",
  "category": "training_rules",
  "title": "Threshold week protocol — periodic deload + fitness retesting",
  "version": "1.0",
  "applies_when": {
    "level": "any",
    "sport_profile": ["endurance", "triathlon", "cycling", "swimming", "hybrid"],
    "goal": "any"
  },
  "cadence_by_phase": {
    "race_prep": {
      "weeks_between": 4,
      "definition": "Within 8 weeks of an A race",
      "rationale": "Higher load + faster fitness gains require more frequent deloads and recalibration"
    },
    "base": {
      "weeks_between": 6,
      "definition": "8+ weeks from any A race, general training",
      "rationale": "Default cadence. Matches Friel's recommendation."
    },
    "maintenance": {
      "weeks_between": 8,
      "definition": "No race scheduled, fitness preservation",
      "rationale": "Lower load means less fatigue accumulation and slower zone drift"
    }
  },
  "user_override": {
    "allowed_range": [4, 8],
    "default_source": "auto-detected from training_phase, can be manually set in settings"
  },
  "week_structure": {
    "volume_target_pct_of_prior_week": [0.60, 0.70],
    "intensity_rule": "Zero work above Z2 except the test efforts themselves",
    "test_day_index_single_sport": 4,
    "triathlon_test_order": ["swim_css", "bike_ftp", "run_5k"],
    "triathlon_test_spacing_days": 1,
    "triathlon_no_stacking": true,
    "rest_days_minimum": 1
  },
  "test_protocols": {
    "run_5k": {
      "name": "5K Time Trial",
      "warmup": "15 min easy + 4x20s strides",
      "test": "5K all-out on flat course",
      "cooldown": "10-15 min easy",
      "output_metric": "vdot",
      "calculation": "Lookup VDOT from 5K finish time using Daniels VDOT tables",
      "fallback": "30-minute run test (Friel): avg HR of last 20 min = LTHR, avg pace of last 20 min = T-pace. Use when 5K race effort is unsafe (injury return, masters, beginners)."
    },
    "bike_ftp_20min": {
      "name": "20-Minute FTP Test",
      "warmup": "15 min easy + 3x1 min progressive (Z2->Z3->Z4) + 5 min easy + 5 min hard primer (~108% expected FTP) + 10 min easy",
      "test": "20 min all-out at highest sustainable power",
      "cooldown": "10 min easy spin",
      "output_metric": "ftp_watts",
      "calculation": "FTP = 20-min average power * 0.95",
      "source": "Coggan & Allen, Training and Racing with a Power Meter"
    },
    "swim_css": {
      "name": "Critical Swim Speed Test",
      "warmup": "400m easy + 4x50m build",
      "test": "400m all-out TT, 5-10 min recovery, 200m all-out TT",
      "cooldown": "200m easy",
      "output_metric": "css_sec_per_100m",
      "calculation": "CSS = (T_400_seconds - T_200_seconds) / 2, expressed as sec per 100m",
      "source": "Olbrecht; popularized in triathlon by TrainingPeaks"
    }
  },
  "hard_constraints": [
    "Never schedule two threshold tests on the same day",
    "Never schedule a test the day after a long run/ride/swim",
    "Never insert a threshold week within 14 days of a goal A race",
    "Never schedule two threshold weeks back-to-back (minimum 3 weeks build between)",
    "Never allow more than 8 weeks to pass without a threshold week unless explicitly disabled by user",
    "Abort the test and reschedule if user reports RPE > 8 on three consecutive days during the threshold week or reports illness/injury",
    "Single-sport athletes get one test per threshold week; triathletes get all three spread across the week"
  ],
  "skip_behavior": {
    "policy": "slide",
    "description": "If a threshold week is skipped, reschedule the NEXT threshold week to N weeks after the skip date, not N weeks after the originally planned date.",
    "rationale": "Compressing two threshold weeks closer together creates an unintended high-recovery cluster and disrupts the build:recover ratio."
  },
  "post_test_workflow": [
    "Prompt user to log test result immediately when test workout is marked complete",
    "Sanity-check: flag if new value differs from prior by more than 15% (likely logging error or anomalous test day)",
    "If valid, archive prior value to fitness_history table and write new value to user profile",
    "Recalculate all cached training zones for that sport using the appropriate calculation module",
    "Push notification to user with before/after Z3 boundary as a quick visual",
    "Update all future workouts in the active plan to use the new zones"
  ],
  "validation_rules": {
    "test_result_min_change_pct": -15,
    "test_result_max_change_pct": 15,
    "out_of_range_action": "Show confirmation modal: 'This is a [X]% change from your last test. Confirm the result is correct, or retake the test.'"
  },
  "coaching_tone": "Lower intensity, intentional. The week is rest plus an honest snapshot, not a peak week. Frame the test as a B race, not an A race.",
  "evidence_sources": [
    "Friel, J. — A Quick Guide to Setting Zones (joefrieltraining.com)",
    "Friel, J. — Determining your LTHR (joefrieltraining.com)",
    "Friel, J. — The Triathlete's Training Bible",
    "Coggan, A. & Allen, H. — Training and Racing with a Power Meter (FTP test protocol)",
    "Daniels, J. — Daniels' Running Formula (VDOT system + 5K-based calibration)",
    "Olbrecht, J. — The Science of Winning (CSS protocol origins)",
    "TrainingPeaks — Threshold Tests for Swim, Bike and Run (Hayden Scott)",
    "Seiler, S. (2010) — Polarized training intensity distribution",
    "Laursen & Buchheit — Science and Application of High-Intensity Interval Training (overreaching thresholds)",
    "ACSM Guidelines for Exercise Testing and Prescription, 11th ed. (periodization)"
  ],
  "rationale": "Solves two compounding problems: (1) plans without scheduled deloads accumulate fatigue and either crush performance or cause injury; (2) zones drift over weeks of training and ad-hoc retesting is unreliable because users skip it. Bundling the test into a mandatory deload week guarantees both happen on the right cadence.",
  "priority": "critical",
  "is_active": true
}
```

### New Module: TESTING_PROTOCOLS

```json
{
  "id": "TESTING_PROTOCOLS",
  "category": "training_rules",
  "title": "Field tests for VDOT, FTP, and CSS — workout templates",
  "version": "1.0",
  "applies_when": {
    "level": "any",
    "sport_profile": ["endurance", "triathlon", "cycling", "swimming", "hybrid"],
    "context": "threshold_week"
  },
  "tests": [
    {
      "id": "RUN_5K_TT",
      "sport": "run",
      "duration_min": 35,
      "structure": [
        {"phase": "warmup", "duration_min": 15, "intensity": "Z1 + 4x20s strides"},
        {"phase": "test", "distance": "5km", "intensity": "all-out, even pacing"},
        {"phase": "cooldown", "duration_min": 12, "intensity": "Z1"}
      ],
      "user_inputs": ["finish_time"],
      "output": "vdot",
      "calculation_module": "vdot-lookup.js"
    },
    {
      "id": "RUN_30MIN_TT",
      "sport": "run",
      "duration_min": 50,
      "use_when": "5K race effort is contraindicated (injury return, masters, beginners)",
      "structure": [
        {"phase": "warmup", "duration_min": 15, "intensity": "Z1 + 4x20s strides"},
        {"phase": "test", "duration_min": 30, "intensity": "all-out sustainable"},
        {"phase": "cooldown", "duration_min": 5, "intensity": "Z1"}
      ],
      "user_inputs": ["avg_hr_last_20min", "avg_pace_last_20min"],
      "output": "lthr_and_t_pace"
    },
    {
      "id": "BIKE_FTP_20",
      "sport": "bike",
      "duration_min": 60,
      "structure": [
        {"phase": "warmup", "duration_min": 15, "intensity": "Z1 easy"},
        {"phase": "primer", "duration_min": 3, "intensity": "3x1 min progressive Z2->Z3->Z4"},
        {"phase": "easy", "duration_min": 5, "intensity": "Z1"},
        {"phase": "hard_primer", "duration_min": 5, "intensity": "~108% expected FTP"},
        {"phase": "easy", "duration_min": 10, "intensity": "Z1"},
        {"phase": "test", "duration_min": 20, "intensity": "all-out steady"},
        {"phase": "cooldown", "duration_min": 10, "intensity": "Z1"}
      ],
      "user_inputs": ["avg_power_20min"],
      "output": "ftp_watts",
      "calculation": "ftp = avg_power_20min * 0.95"
    },
    {
      "id": "SWIM_CSS",
      "sport": "swim",
      "duration_min": 40,
      "structure": [
        {"phase": "warmup", "distance_m": 400, "intensity": "easy"},
        {"phase": "build", "sets": "4x50m", "intensity": "build to test pace"},
        {"phase": "test_1", "distance_m": 400, "intensity": "all-out TT"},
        {"phase": "recovery", "duration_min": 8, "intensity": "easy swim or rest"},
        {"phase": "test_2", "distance_m": 200, "intensity": "all-out TT"},
        {"phase": "cooldown", "distance_m": 200, "intensity": "easy"}
      ],
      "user_inputs": ["time_400m_seconds", "time_200m_seconds"],
      "output": "css_sec_per_100m",
      "calculation": "css = (time_400m_seconds - time_200m_seconds) / 2"
    }
  ],
  "evidence_sources": [
    "Daniels, J. — Daniels' Running Formula",
    "Coggan, A. & Allen, H. — Training and Racing with a Power Meter",
    "Friel, J. — Triathlete's Training Bible",
    "Olbrecht, J. — The Science of Winning"
  ],
  "rationale": "Centralizes test workout templates so the planner, the workout viewer, and the result-handler all reference the same source of truth.",
  "priority": "high",
  "is_active": true
}
```

### Updated Module: RUNNING_ZONE_CALCULATIONS

**Version bump:** 1.0 → 1.1 (minor)

```json
{
  "id": "RUNNING_ZONE_CALCULATIONS",
  "field_to_update": "recalculation_hooks",
  "action": "add_field",
  "new_value": {
    "trigger_on": ["new_vdot_logged", "new_lthr_logged", "new_resting_hr_logged"],
    "behavior": "Recalculate all 5 pace zones and all 5 HR zones using the new input. Archive the prior zone snapshot to user_zone_history. Push a notification to the user comparing old vs new Z3 (threshold) boundary as a quick visual.",
    "called_by": ["TRAINING_THRESHOLD_WEEK post_test_workflow", "manual user input from settings"]
  },
  "version": "increment_minor",
  "change_log": "2026-04-09: Added recalculation_hooks field so that threshold week tests automatically refresh cached pace and HR zones. No change to existing zone math."
}
```

### Updated Module: SPORT_ENDURANCE_RUNNING

**Version bump:** current → +0.1 (minor)

```json
{
  "id": "SPORT_ENDURANCE_RUNNING",
  "field_to_update": "plan_rules",
  "action": "append",
  "new_rules": [
    "Insert a threshold week into every training plan at the cadence defined by TRAINING_THRESHOLD_WEEK (4/6/8 weeks based on training phase)",
    "During a threshold week, the week's only hard effort is the 5K test (or 30-min fallback) on Day 4. All other days are Z1 with optional strides.",
    "After a threshold week test, regenerate all subsequent workout zones from the new VDOT via RUNNING_ZONE_CALCULATIONS."
  ],
  "version": "increment_minor",
  "change_log": "2026-04-09: Added threshold week scheduling and post-test zone regeneration for run-only athletes."
}
```

### Updated Module: SPORT_ENDURANCE_CYCLING

**Version bump:** current → +0.1 (minor)
**Note for Claude Code:** If this module does not yet exist, create it as a new module with the standard schema (id, category, title, version, applies_when, principles, plan_rules, hard_constraints, evidence_sources, rationale, priority, is_active) and put the rules below in `plan_rules`.

```json
{
  "id": "SPORT_ENDURANCE_CYCLING",
  "field_to_update": "plan_rules",
  "action": "append",
  "new_rules": [
    "Insert a threshold week into every training plan at the cadence defined by TRAINING_THRESHOLD_WEEK (4/6/8 weeks based on training phase)",
    "During a threshold week, the week's only hard effort is the 20-min FTP test on Day 4. All other days are Z1.",
    "After a successful FTP test, regenerate all subsequent workout zones using Coggan's % FTP table."
  ],
  "version": "increment_minor",
  "change_log": "2026-04-09: Added threshold week scheduling and post-test FTP zone regeneration for cyclists."
}
```

### Updated Module: SPORT_ENDURANCE_SWIMMING

**Version bump:** current → +0.1 (minor)
**Note for Claude Code:** If this module does not yet exist, create it as a new module with the standard schema.

```json
{
  "id": "SPORT_ENDURANCE_SWIMMING",
  "field_to_update": "plan_rules",
  "action": "append",
  "new_rules": [
    "Insert a threshold week into every training plan at the cadence defined by TRAINING_THRESHOLD_WEEK (4/6/8 weeks based on training phase)",
    "During a threshold week, the week's only hard effort is the CSS test (400m + 200m TT) on Day 4. All other days are Z1 technique-focused swimming.",
    "After a successful CSS test, regenerate swim zones: easy = CSS + 12s/100m, threshold = CSS, race pace = CSS - 3 to 5s/100m."
  ],
  "version": "increment_minor",
  "change_log": "2026-04-09: Added threshold week scheduling and post-test CSS zone regeneration for swimmers."
}
```

### Updated Module: SPORT_TRIATHLON

**Version bump:** current → +0.1 (minor)
**Note for Claude Code:** If this module does not yet exist, create it as a new module with the standard schema. The rules below are critical because triathletes are the only athletes who run all three tests in the same threshold week.

```json
{
  "id": "SPORT_TRIATHLON",
  "field_to_update": "plan_rules",
  "action": "append",
  "new_rules": [
    "Insert a threshold week into every triathlon training plan at the cadence defined by TRAINING_THRESHOLD_WEEK (4/6/8 weeks based on training phase)",
    "During a triathlon threshold week, schedule all three tests in the order swim -> bike -> run, one test per day, with at least one easy day separation between tests",
    "Default test placement: swim CSS on Thursday, bike FTP on Friday or Saturday, run 5K on Saturday or Sunday. Never stack two tests on the same day.",
    "After each test in the threshold week, immediately regenerate that sport's zones so the next test is paced against the most current fitness data",
    "If the user is a triathlete with one weak discipline, allow that discipline's zones to be recalibrated independently more often (e.g., a strong cyclist who wants to retest their run every 4 weeks while keeping bike at every 6)"
  ],
  "version": "increment_minor",
  "change_log": "2026-04-09: Added triathlon-specific threshold week structure with all three tests spread across the week. Per-discipline cadence override allowed."
}
```

---

## App Code Changes

### File: `js/threshold-week-scheduler.js` (NEW FILE)

**Reason:** No threshold week logic currently exists. The planner needs a deterministic scheduler that decides when the next threshold week falls.

**Behavior:**

1. **Inputs:** `userProfile` (training_phase, sport_profile, goal_race_date, threshold_week_cadence_override), `lastThresholdWeekDate` (from `user_data` JSONB), `currentPlanStartDate`.
2. **Phase detection logic:**
   - If `goal_race_date` exists and is within 56 days of today → `phase = "race_prep"`, default cadence = 4 weeks.
   - Else if `goal_race_date` exists and is more than 56 days away OR no race but user has an active goal → `phase = "base"`, default cadence = 6 weeks.
   - Else (no race, no active goal) → `phase = "maintenance"`, default cadence = 8 weeks.
3. **Override:** If `userProfile.threshold_week_cadence_override` is set (4–8 inclusive), use that instead of the phase default.
4. **Next-date calculation:**
   - If `lastThresholdWeekDate` exists: `nextDate = lastThresholdWeekDate + cadence weeks`.
   - Else: `nextDate = currentPlanStartDate + cadence weeks` (so the first threshold week is one full build cycle into the plan, not Week 1).
5. **Race-window guard:** If `nextDate` falls within 14 days of `goal_race_date`, push it back to BEFORE the 14-day window, or skip entirely if no room.
6. **Output:** `{ thresholdWeekStartDate: Date, cadenceUsed: number, phase: string, reason: string }`.
7. **Skip handling:** Expose `markThresholdWeekSkipped(skipDate)` which writes the skip date to `user_data.threshold_week_history` and on the next call to the scheduler, treats `skipDate` as the new `lastThresholdWeekDate` (slide behavior, not compress).
8. **Determinism:** This module makes ZERO API calls. Pure function of inputs. The philosophy engine is still philosophy-first.

### File: `js/test-result-handler.js` (NEW FILE)

**Reason:** Centralized handler for ingesting test results and recalculating zones.

**Behavior:**

1. **Input:** `{ sport: "run" | "bike" | "swim", testType: string, rawInput: object, userId: string }`.
2. **Calculation by sport:**
   - **Run 5K:** Look up VDOT from `vdot-lookup.js` (existing or new — see below). Output `{ vdot: number, paceZones: {...}, hrZones: {...} }`.
   - **Run 30-min:** `t_pace = avg_pace_last_20min`, `lthr = avg_hr_last_20min`. Recalculate zones via `RUNNING_ZONE_CALCULATIONS` Tier 3 (LTHR-based).
   - **Bike 20-min FTP:** `ftp_watts = avg_power_20min * 0.95`. Calculate zones from Coggan % FTP table (bundle as static JSON).
   - **Swim CSS:** `css = (t_400 - t_200) / 2`. Calculate zones: `easy = css + 12s/100m`, `threshold = css`, `race = css - 4s/100m` (use midpoint of 3-5s range).
3. **Validation:**
   - Compare new value to `userProfile[sport].lastTestValue`.
   - If `|change_pct| > 15`, return `{ status: "needs_confirmation", oldValue, newValue, changePct }` and surface a modal in the UI: *"This is a {X}% change from your last test. Confirm the result is correct, or retake the test."*
   - If user confirms, proceed.
4. **Persistence:**
   - Archive prior value to Supabase `fitness_history` table (see schema below).
   - Write new value to `userProfile[sport]` in `user_data` JSONB.
   - Write threshold week completion to `user_data.threshold_week_history`.
5. **Zone refresh:** Call `RUNNING_ZONE_CALCULATIONS.recalculate()` (or the equivalent for bike/swim) and update cached zones in `user_data.cached_zones`.
6. **Notification:** Push an in-app notification to the user with the format: *"Zones updated. Your Z3 (threshold) {pace|power|css} was {old}, now {new}. Tap to see all the new zones."*
7. **Plan refresh:** Call `planner.refreshActivePlan(userId)` so all future workouts in the active plan use the new zones.

### File: `supabase/migrations/20260409_fitness_history.sql` (NEW MIGRATION)

**Reason:** Need a history table to track fitness changes over time for trendlines and trust signals.

```sql
CREATE TABLE IF NOT EXISTS fitness_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sport TEXT NOT NULL CHECK (sport IN ('run', 'bike', 'swim')),
  metric_type TEXT NOT NULL CHECK (metric_type IN ('vdot', 'ftp_watts', 'css_sec_per_100m', 'lthr', 'max_hr', 'resting_hr')),
  value NUMERIC NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('threshold_week_test', 'manual_entry', 'race_result', 'imported')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fitness_history_user_sport_idx ON fitness_history(user_id, sport, recorded_at DESC);

ALTER TABLE fitness_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own fitness history"
  ON fitness_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fitness history"
  ON fitness_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### File: `js/planner.js`

**Reason:** The deterministic planner needs to call the threshold-week-scheduler when generating each new training week.

**Changes:**

1. At the top of `generateTrainingWeek(weekNumber, userProfile)`, call `thresholdWeekScheduler.shouldThisBeAThresholdWeek(weekStartDate, userProfile)`.
2. If `true`, generate the week using the threshold-week template from `TRAINING_THRESHOLD_WEEK.week_structure` (single-sport athletes get the single-sport row, triathletes get the triathlon row).
3. Inject the test workout from `TESTING_PROTOCOLS` into the appropriate day.
4. Apply the `volume_target_pct_of_prior_week` (60–70%) to the easy session durations.
5. Tag the week object with `{ isThresholdWeek: true, testsScheduled: [...] }` so the UI can render the badge.
6. **Determinism:** All of this is pure function. No API call.

### File: `js/planner.js` (AI fallback section)

**Reason:** If the freeform AI fallback is used for an endurance athlete, the AI prompt needs to know about threshold weeks so it doesn't accidentally schedule one in the wrong place or skip them entirely.

**Change:** Add `TRAINING_THRESHOLD_WEEK` and `TESTING_PROTOCOLS` to the modules injected into the Claude API prompt for any endurance/triathlon freeform request.

### File: `js/zone-calculator.js` (UPDATE)

**Reason:** Per the existing running philosophy spec, this file should already exist with Daniels VDOT lookup. We need to extend it to handle bike (Coggan % FTP) and swim (CSS-based bands).

**Changes:**

1. Add `calculateBikeZonesFromFTP(ftpWatts)` returning Z1–Z5 power ranges using Coggan's % FTP table:
   - Z1 Active Recovery: < 55% FTP
   - Z2 Endurance: 56–75% FTP
   - Z3 Tempo: 76–90% FTP
   - Z4 Threshold: 91–105% FTP
   - Z5 VO2max: 106–120% FTP
2. Add `calculateSwimZonesFromCSS(cssSecPer100m)` returning easy/threshold/race pace bands per the formulas above.
3. Add `recalculateAllZones(userProfile)` that recomputes pace, power, and swim zones from current profile values and writes to `userProfile.cached_zones`.

### File: `js/ui/weekly-plan-view.js`

**Reason:** Threshold weeks need a visual badge so users know what week they're in.

**Changes:**

1. If `week.isThresholdWeek === true`, render a banner at the top of the weekly plan: **"THRESHOLD WEEK — Reset & Test"** with a short explainer below ("Volume is down ~35%. One test on {testDay}. The result will update your training zones for the next {N} weeks.").
2. Render the test workout card with a distinct accent color and the test protocol from `TESTING_PROTOCOLS`.
3. After the test workout is marked complete, immediately surface the test-result entry modal.

### File: `js/ui/settings.js`

**Reason:** Users need to be able to override the cadence and skip an upcoming threshold week.

**Changes:**

1. Add a "Threshold Weeks" section with two controls:
   - **Cadence override:** dropdown with options "Auto (recommended)", "Every 4 weeks", "Every 6 weeks", "Every 8 weeks".
   - **Skip next threshold week:** button + confirmation modal explaining the slide behavior ("Your next threshold week will be rescheduled to {date}.")
2. Add a read-only display of `nextThresholdWeekStartDate` and `cadenceUsed`.

### File: `js/ui/post-test-modal.js` (NEW FILE)

**Reason:** Centralized UI for entering test results.

**Behavior:**

1. Triggered when a test workout is marked complete.
2. Shows the test type, the input fields appropriate to that test (e.g., "Finish time" for 5K, "Average power" for FTP), and a "Submit" button.
3. On submit, calls `testResultHandler.processResult(...)`.
4. If `status === "needs_confirmation"`, shows the change modal.
5. On success, shows a "Zones updated" confirmation with old vs new Z3 values.

### File: `vdot-lookup.js` (CONFIRM EXISTS, EXTEND IF NEEDED)

**Reason:** Per the prior running philosophy spec this file should exist. If it doesn't, create it. It must support `getVDOTFromTime(distance, timeSeconds)` for at minimum the 5K distance, returning a VDOT score from 30–85.

---

## Validation Checklist

- [ ] `TRAINING_THRESHOLD_WEEK` module inserted into `philosophy_modules` table with `is_active = true`
- [ ] `TESTING_PROTOCOLS` module inserted into `philosophy_modules` table with `is_active = true`
- [ ] `RUNNING_ZONE_CALCULATIONS` version bumped to 1.1 with `recalculation_hooks` field added
- [ ] `SPORT_ENDURANCE_RUNNING`, `SPORT_ENDURANCE_CYCLING`, `SPORT_ENDURANCE_SWIMMING`, `SPORT_TRIATHLON` modules version-bumped (created if missing)
- [ ] `fitness_history` table created in Supabase with RLS policies
- [ ] `js/threshold-week-scheduler.js` created and unit tested with the golden cases below
- [ ] `js/test-result-handler.js` created and integrated with `js/zone-calculator.js`
- [ ] `js/planner.js` calls the threshold week scheduler at the top of `generateTrainingWeek`
- [ ] Weekly plan UI renders the THRESHOLD WEEK badge when `week.isThresholdWeek === true`
- [ ] Settings UI exposes cadence override and skip controls
- [ ] Post-test modal triggers on test workout completion and persists results
- [ ] Sanity-check rejects test results with > 15% delta and surfaces confirmation modal
- [ ] Zones automatically recalculate after a confirmed test result
- [ ] All future workouts in the active plan use the new zones immediately after a test
- [ ] Notification fires with old vs new Z3 boundary
- [ ] Skip behavior slides the cadence forward (does NOT compress)
- [ ] Hard constraint: never schedules a threshold week within 14 days of an A race
- [ ] Hard constraint: never schedules two tests on the same day for any athlete (single-sport or triathlete)
- [ ] Hard constraint: minimum 3 weeks of build between threshold weeks

### Golden Test Cases

- [ ] **Runner, base phase, 6-week cadence, plan starts 2026-05-01:**
  - First threshold week should fall the week of 2026-06-12
  - Test scheduled on Thursday 2026-06-15
  - Volume of that week = 60–70% of week of 2026-06-05
- [ ] **Runner, race prep phase, A race 2026-06-01, today 2026-04-15:**
  - Phase should resolve to "race_prep" (within 56 days)
  - Cadence should default to 4 weeks
  - No threshold week may fall within 2026-05-18 to 2026-06-01 (14-day race window)
- [ ] **Triathlete, base phase, 6-week cadence, threshold week starts Mon 2026-06-15:**
  - Swim CSS test → Thursday 2026-06-18
  - Bike FTP test → Friday 2026-06-19 OR Saturday 2026-06-20
  - Run 5K test → Saturday 2026-06-20 OR Sunday 2026-06-21
  - No two tests on the same day
- [ ] **User skips threshold week scheduled for 2026-06-15 (cadence 6 weeks):**
  - Next threshold week scheduled for 2026-07-27 (6 weeks after the skip), NOT 2026-07-20
- [ ] **5K test result: prior VDOT 53, new test gives VDOT 65 (+22%):**
  - Sanity check fires
  - Modal: "This is a 22% change from your last test. Confirm or retake."
  - If user confirms, value writes; if not, no change to profile
- [ ] **Bike FTP test result: prior 250W, new test gives 260W (+4%):**
  - Sanity check passes silently
  - 260W writes to profile
  - Coggan % FTP zones recalculate
  - Notification fires: "Zones updated. Your Z4 (threshold) was 228–263W, now 237–273W."
- [ ] **Maintenance phase user (no race, no active goal):**
  - Cadence default = 8 weeks
- [ ] **User overrides cadence to 4 weeks via settings while in maintenance phase:**
  - Override wins, threshold week falls every 4 weeks
- [ ] **Two consecutive threshold weeks attempted by planner due to a phase change:**
  - Planner refuses (minimum 3 weeks build between threshold weeks constraint)
  - Slides the second one to satisfy the constraint

---

## Rollback Plan

All changes are additive — no existing modules or rules are modified destructively. Rollback steps if issues arise:

1. **Disable new modules:** Set `is_active = false` for `TRAINING_THRESHOLD_WEEK` and `TESTING_PROTOCOLS` in the `philosophy_modules` table. The planner's threshold-week scheduler should check `is_active` and skip injection if false.
2. **Revert sport modules:** Remove the appended `plan_rules` from `SPORT_ENDURANCE_RUNNING`, `SPORT_ENDURANCE_CYCLING`, `SPORT_ENDURANCE_SWIMMING`, `SPORT_TRIATHLON`. Restore prior version numbers.
3. **Revert RUNNING_ZONE_CALCULATIONS:** Remove `recalculation_hooks` field. Restore version 1.0.
4. **Disable code paths:** Comment out the call to `thresholdWeekScheduler.shouldThisBeAThresholdWeek()` at the top of `generateTrainingWeek()` in `planner.js`. The planner will revert to non-threshold-aware behavior.
5. **Preserve data:** Do NOT drop the `fitness_history` table. Even if the feature is rolled back, the historical records are valuable. Just stop writing to it.
6. **Philosophy doc:** Remove Section 5.X and revert the changelog entry.

The user-facing UI changes (settings, weekly badge, post-test modal) can stay in place as dead code — they'll simply never trigger because no threshold weeks will be inserted.

---

## Notes for Claude Code

- **Determinism is non-negotiable.** The planner is philosophy-first. NONE of the new code should call the Anthropic API for standard plan generation. The only AI call is the freeform fallback that already exists.
- **If `SPORT_ENDURANCE_CYCLING`, `SPORT_ENDURANCE_SWIMMING`, or `SPORT_TRIATHLON` modules don't exist yet,** create them with the standard module schema and put the threshold week rules in `plan_rules`. Do not block on this.
- **If `vdot-lookup.js` and `zone-calculator.js` don't exist yet** (they were specified in the prior running philosophy spec), create the bike and swim portions of `zone-calculator.js` regardless. The run portion can land later.
- **The 14-day race window constraint is critical.** A threshold week test inside a taper would compromise the race. Hard-fail the planner if it tries.
- **Slide-on-skip is the user-friendly default.** Resist the temptation to "make up" missed threshold weeks by compressing the cadence.
- **Sanity check thresholds (±15%) are intentional.** Real fitness changes between threshold weeks rarely exceed 5–8%. A 15% change almost always indicates a logging error or anomalous test day.
