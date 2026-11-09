# Philosophy Update Spec: Running Philosophy Updates

> Date: 2026-04-08
> Evidence tier: Mixed — Tier 1 (zones, intervals, polarized model), Tier 2 (offseason volume, marathon long run scaling)
> Modules affected: SPORT_ENDURANCE_RUNNING, EVENT_MARATHON, plus new modules
> New modules: RUNNING_OFFSEASON, RUNNING_ZONE_CALCULATIONS, RUNNING_FEEDBACK_CALIBRATION
> Approved by: Chase

---

## Summary

Five updates to the running philosophy: (1) offseason training guidelines at 50–60% volume with speed/hill/strength focus, (2) experience-scaled marathon long run programming, (3) a 1/3 feedback calibration rule for plan adjustment, (4) tiered science-based zone calculations, and (5) weekly interval repeats for time-goal runners. These fill gaps in the current running modules and add a structured feedback mechanism.

---

## Evidence

### 1. Offseason Running Volume (Tier 2 — Coaching Consensus)

- General coaching consensus supports 50–70% of peak volume during offseason (2–6 weeks post-race or between training blocks).
- The lower end (50–60%) is appropriate for shorter offseason windows (2–3 weeks) and allows focus on non-volume qualities: neuromuscular speed, hill power, and cross-training.
- Sources: Pfitzinger & Douglas (*Advanced Marathoning*), Daniels (*Daniels' Running Formula*), general coaching consensus.
- **Note:** This is Tier 2 — well-supported by established coaches but not by formal RCTs on offseason volume specifically. The principle of reduced volume for recovery is Tier 1 (supported by periodization literature).

### 2. Marathon 20+ Mile Run Scaling (Tier 1 — Established Methodologies)

- **Hansons (beginner-focused):** Long runs peak at 16 miles. No 20+ milers. Relies on cumulative fatigue from high weekly mileage rather than single long efforts.
- **Pfitzinger (intermediate/advanced):** Prescribes 3–8 runs of 20+ miles depending on weekly mileage tier. 55 mpw plans: 3 runs of 20–22 miles. 70+ mpw plans: up to 8 runs of 20–22 miles.
- **Daniels (advanced):** Similar structure to Pfitzinger with tempo and marathon-pace components integrated into long runs.
- The scaling principle: more weekly volume = more capacity to absorb and recover from 20+ milers = more of them in the block.
- Sources: Hansons (*Hansons Marathon Method*), Pfitzinger & Douglas (*Advanced Marathoning*), Daniels (*Daniels' Running Formula*), Fellrnr comparative analysis.

### 3. The 1/3 Feedback Rule (Tier 4 — Coaching Heuristic, Used as Feedback Lens)

- Not a prescriptive training distribution. Used post-hoc as a calibration tool: if a runner reviews their week and finds that significantly more than 1/3 of workouts felt harder than intended, the training load may be too aggressive. If significantly more than 1/3 felt easy, there may be room to progress.
- This does NOT conflict with the 80/20 polarized model (Seiler, 2010). The 80/20 model prescribes *intensity distribution* (80% low, 20% high). The 1/3 rule assesses *perceived effort relative to intent* — a workout can be prescribed as "easy" in the 80/20 sense but still feel harder than intended if the runner is under-recovered.
- **Evidence tier: Tier 4** (coaching heuristic). Framed explicitly as a feedback tool, not a training prescription, so the lower evidence tier is acceptable — it's not overriding any Tier 1 science.

### 4. Unified 5-Zone System (Tier 1 — Daniels VDOT + Peer-Reviewed HR Research)

- **Daniels' VDOT system** is the most validated pace-based zone system for running. Defines 5 training paces (E/M/T/I/R) corresponding to specific physiological adaptations at defined %VO2max ranges. Published tables cover VDOT scores from 30 to 85. Sources: Daniels, *Daniels' Running Formula* (multiple editions).
- **Why NOT a multiplier formula:** The previous implementation used `LT = 5K_pace × 1.06` to derive zones. This is inaccurate — for VDOT 53, it estimates LT at 6:43/mi vs. Daniels' T-pace of 6:51/mi (8-second error that cascades). Daniels' tables account for the non-linear relationship between race pace and training paces. Use the tables, not formulas.
- **HR zone calculation:** Tiered approach (Tanaka max HR formula → Karvonen HRR → LTHR) is retained as a parallel system. HR zones are mapped to the same 5-zone structure as pace zones. Sources: Tanaka et al. (2001, *JACC*), ACSM *Guidelines for Exercise Testing and Prescription* (11th ed.), Karvonen et al. (1957).
- **Polarized training distribution:** 70–80% of training volume in Z1 (Easy), consistent with Seiler (2010). Source: Seiler, *International Journal of Sports Physiology and Performance*.

### 5. Weekly Interval Repeats for Time Goals (Tier 1 — Peer-Reviewed Research)

- Billat's vVO2max research: Intervals at 95–100% VO2max pace improve VO2max and race performance.
- Daniels prescribes 800–1200m repeats at "I-pace" (interval pace, ~95% VO2max) as a staple for runners targeting specific race times.
- Optimal individual repeat duration: 3–5 minutes (800m–1K for most recreational runners falls in this window).
- Sources: Billat et al. (multiple publications on vVO2max), Daniels (*Daniels' Running Formula*), Midgley et al. (2006, systematic review on VO2max training).

---

## Philosophy Document Changes

### Change 1: Offseason Running Module

**File:** IronZ_Philosophy_Engine_Spec_v1.0.docx
**Location:** New subsection under Section 5.2 (Running/Endurance), or as an addendum after the event-specific modules

ADD THE FOLLOWING:

> ### Offseason / Transition Phase (Running)
>
> The offseason (also called the transition phase) is the 2–6 week period following a goal race or at the end of a training block. Its purpose is recovery, both physical and mental, while maintaining a fitness base to build from in the next cycle.
>
> **Volume:** 50–60% of peak training volume. This is deliberately lower than maintenance — the point is active recovery, not fitness preservation at all costs. A runner who peaked at 50 miles/week should train at 25–30 miles/week during the offseason.
>
> **Session length:** Shorter than in-season. Most runs should be 30–45 minutes. The offseason is not the time for long runs.
>
> **Focus areas** (this is where the offseason earns its value):
> - **Speed development:** Strides (6–10 × 80–100m at near-sprint effort with full recovery), short hill sprints (8–12 × 10–15 seconds), and fast-finish runs. The goal is neuromuscular recruitment and running economy, not aerobic development.
> - **Hill work:** Hill repeats (6–10 × 60–90 seconds at hard effort) build power and recruit muscle fibers that flat running neglects. These also serve as a form of strength training for the legs.
> - **Strength training:** This is the best time in the annual cycle to prioritize the gym. 2–3 sessions/week focusing on compound movements (squats, deadlifts, lunges, step-ups) plus running-specific single-leg work. Volume and intensity in the gym can be higher during the offseason because running load is lower.
>
> **What the offseason is NOT:** An excuse to stop running entirely (unless recovering from injury). Complete detraining loses fitness rapidly. The 50–60% range keeps the aerobic base intact while allowing recovery.
>
> **Coaching tone during offseason:** Encouraging exploration and enjoyment. "This is your time to run without a watch, try a trail, do a fun 5K." Reduce pressure, increase autonomy.

### Change 2: Marathon Long Run Scaling by Experience

**File:** IronZ_Philosophy_Engine_Spec_v1.0.docx
**Location:** Within the EVENT_MARATHON module (Section 5.2, marathon-specific guidance)

FIND (current text — approximate, adapt to actual doc content):
> [Any existing guidance about marathon long run programming]

ADD OR REPLACE WITH:

> ### 20+ Mile Runs in Marathon Training
>
> The number of 20+ mile long runs in a marathon training block should scale with the runner's experience and weekly mileage capacity. This is not arbitrary — it reflects the runner's ability to absorb and recover from the training stimulus. A beginner who has never run 20 miles will need more recovery time between attempts and cannot tolerate as many in a single block.
>
> **Scaling guidelines:**
>
> | Runner Profile | Weekly Mileage | 20+ Mile Runs in Block | Long Run Peak | Notes |
> |---|---|---|---|---|
> | First-time marathoner | < 35 mpw | 0–1 | 18–20 miles | Some beginner plans (Hansons) cap at 16 mi and rely on cumulative fatigue |
> | Beginner (1–2 marathons) | 30–45 mpw | 1–2 | 20 miles | One 20-miler is sufficient; second only if recovery permits |
> | Intermediate (3+ marathons) | 45–60 mpw | 2–4 | 20–22 miles | Pfitzinger 55mpw plan prescribes 3× 20-milers |
> | Advanced (experienced, consistent) | 60–80+ mpw | 4–5 | 20–22 miles | Include 6–12 miles at marathon pace within each 20-miler. These MP long runs are a different stimulus than easy-pace long runs and build race-specific endurance. |
>
> **Key principle:** More weekly volume = more capacity to absorb long run stress = more 20+ milers can be programmed. A runner doing 70 mpw has far more recovery capacity than one doing 35 mpw — the 20-miler represents a smaller percentage of their weekly volume.
>
> **Safety rule:** Never program more than one 20+ mile run per 2-week period. Minimum 10–14 days between 20+ milers for all levels.

### Change 3: 1/3 Feedback Calibration Rule

**File:** IronZ_Philosophy_Engine_Spec_v1.0.docx
**Location:** New subsection — suggest placing it in a "Plan Review & Adjustment" section, or as part of the adaptation/feedback loop guidance

ADD THE FOLLOWING:

> ### The 1/3 Feedback Calibration Rule
>
> This is a post-hoc review tool, not a training prescription. It does not tell the engine how to program workouts — it tells the user (and the app's feedback system) whether the current training load is calibrated correctly.
>
> **The framework:** When reviewing a training week (or block), categorize each workout by how it felt relative to its intent:
> - **~1/3 felt easier than intended** ("that was smooth, I had more in the tank")
> - **~1/3 felt about right** ("that was what I expected, solid effort")
> - **~1/3 felt harder than intended** ("I struggled to hit my targets, that was tougher than planned")
>
> **Calibration signals:**
> - If significantly MORE than 1/3 of workouts felt harder than intended → training load may be too aggressive, or recovery is insufficient. Consider reducing volume or intensity for the next week.
> - If significantly MORE than 1/3 of workouts felt easier than intended → the runner may be ready for a progression step. Consider adding volume or increasing workout intensity.
> - A balanced distribution suggests the plan is well-calibrated.
>
> **Important distinction from 80/20:** This rule assesses *perceived effort relative to intent*, not intensity distribution. A workout prescribed as "easy" in the 80/20 model can still feel harder than intended if the runner is fatigued, under-recovered, or dealing with external stress. Both frameworks coexist — 80/20 governs programming, the 1/3 rule governs feedback.
>
> **App implementation:** After the user logs a completed workout, prompt: "How did this feel compared to what you expected?" with options: Easier / About right / Harder. Aggregate over the week and surface calibration signals in the weekly check-in dashboard.

### Change 4: Unified 5-Zone System (Pace + HR)

**File:** IronZ_Philosophy_Engine_Spec_v1.0.docx
**Location:** New subsection under running/endurance training, applicable to all endurance sports. **Replaces any existing zone guidance.**

ADD THE FOLLOWING:

> ### Training Zones — Unified 5-Zone System
>
> IronZ uses a single 5-zone system that maps training intensity across both pace and heart rate. The zone definitions are anchored to Jack Daniels' VDOT framework — the most validated pace-based system in running research — with corresponding heart rate ranges derived from Karvonen/LTHR methods.
>
> **Why 5 zones:** Daniels' system (E/M/T/I/R) defines 5 distinct training intensities, each targeting a specific physiological adaptation. This maps cleanly to 5 HR zones. Systems with fewer zones (Seiler's 3-zone polarized model) lack the granularity needed for workout prescription. Systems with more zones (Friel's 7-zone) add complexity without meaningfully different physiological targets. Five zones is the sweet spot: granular enough to prescribe specific workouts, simple enough for users to understand and execute.
>
> #### The 5 Zones
>
> | Zone | Name | Daniels Pace | % VO2max | HR (% HRR) | % Training Time | Feel |
> |---|---|---|---|---|---|---|
> | Z1 | Easy | E-pace (from VDOT) | 65–78% | 50–70% | 70–80% | Conversational. Full sentences. Could run for hours. |
> | Z2 | Marathon | M-pace (from VDOT) | 80–84% | 70–80% | 5–10% | Steady. Short sentences. Sustainable 2–3 hours. |
> | Z3 | Threshold | T-pace (from VDOT) | 88–92% | 80–88% | 8–12% | Comfortably hard. Few words at a time. ~60 min sustainable. |
> | Z4 | Interval | I-pace (from VDOT) | 95–100% | 88–95% | 3–5% | Hard. Cannot talk. 3–5 min repeats. |
> | Z5 | Repetition | R-pace (from VDOT) | >100% | >95% | 1–2% | Max effort. Sprint. <90 sec repeats. |
>
> **Critical rule: Z1 (Easy) is where 70–80% of ALL training volume should occur.** This is non-negotiable and aligns with the polarized training model (Seiler, 2010). An "easy 60 min" workout should be entirely Z1 — not Z2 or Z3. If a runner cannot hold a full conversation at the prescribed pace, the pace is too fast for Z1.
>
> #### Example: 19:40 5K Runner (VDOT ~53)
>
> | Zone | Pace Range | What It Feels Like |
> |---|---|---|
> | Z1 Easy | 7:51 – 8:32/mi | "I could do this all day" |
> | Z2 Marathon | 6:58 – 7:10/mi | "Steady, focused, but not hard" |
> | Z3 Threshold | 6:36 – 6:51/mi | "This is work — I can sustain it but I'm concentrating" |
> | Z4 Interval | 6:04 – 6:10/mi | "Breathing hard, counting down the reps" |
> | Z5 Repetition | < 5:48/mi | "All-out sprint, can't sustain more than 60–90 seconds" |
>
> **Note:** 7:01–7:46/mi is NOT Z1 for this runner. It falls in the Z2–Z3 range. Labeling this pace as "easy" or "conversational" is incorrect and will cause the runner to train too hard on easy days, undermining recovery and long-term aerobic development.
>
> #### How Pace Zones Are Calculated
>
> **Primary method: Daniels' VDOT tables.** The user provides a recent race result (5K, 10K, half marathon, or marathon). The app calculates their VDOT score and looks up the corresponding E, M, T, I, and R paces from Daniels' published tables. This is more accurate than deriving zones from a single multiplier formula because the relationship between race pace and training paces is non-linear and varies with fitness level.
>
> **Do NOT use:** `LT_pace = 5K_pace × 1.06` or similar single-multiplier formulas. These are rough approximations that introduce errors at every zone boundary. For a 19:40 5K runner, this formula estimates LT at 6:43/mi when Daniels' tables give 6:51/mi — an 8-second error that cascades through every zone. Use the VDOT lookup tables directly.
>
> **Fallback (no race result available):** If the user has not provided a race result, the app cannot accurately calculate pace zones. In this case, use HR zones only and prompt the user: "For accurate pace zones, enter a recent race result (any distance from 5K to marathon)."
>
> #### How HR Zones Are Calculated — Progressive Accuracy
>
> The app uses a tiered approach for HR zones, becoming more accurate as the user provides more data. Always use the highest tier available.
>
> **Tier 1: Max HR Percentage (requires only age)**
>
> Formula: Max HR = 208 - (0.7 × age) *(Tanaka et al., 2001)*
>
> | Zone | % Max HR |
> |---|---|
> | Z1 Easy | 60–75% |
> | Z2 Marathon | 75–84% |
> | Z3 Threshold | 84–90% |
> | Z4 Interval | 90–95% |
> | Z5 Repetition | >95% |
>
> Limitation: Standard error of ±10 bpm. Display note: "These HR zones are estimates. For better accuracy, add your resting heart rate or a recent race result."
>
> **Tier 2: Karvonen / Heart Rate Reserve (requires age + resting HR)**
>
> Formula: Target HR = ((Max HR - Resting HR) × target %) + Resting HR
>
> | Zone | % HRR |
> |---|---|
> | Z1 Easy | 50–70% |
> | Z2 Marathon | 70–80% |
> | Z3 Threshold | 80–88% |
> | Z4 Interval | 88–95% |
> | Z5 Repetition | >95% |
>
> Why better: Accounts for individual fitness via resting HR. App behavior: recalculate zones when resting HR is added and notify user.
>
> **Tier 3: Lactate Threshold HR (requires LTHR input)**
>
> Zones as % of LTHR:
>
> | Zone | % LTHR |
> |---|---|
> | Z1 Easy | < 80% |
> | Z2 Marathon | 80–88% |
> | Z3 Threshold | 88–95% |
> | Z4 Interval | 95–102% |
> | Z5 Repetition | >102% |
>
> LTHR estimation methods: (1) Lab test, (2) 30-min all-out effort → avg HR of last 20 min, (3) Race-based estimation via VDOT.
>
> **Override:** If user provides a known max HR, use it instead of age-predicted formula.
>
> #### Dual Display: Pace + HR Together
>
> The app should display both pace zones and HR zones side by side for every workout. This lets runners cross-reference during execution. When pace and HR disagree (common in heat, altitude, hills, or caffeine conditions), **HR takes precedence for Z1 (Easy) workouts** — the goal is to stay in the right physiological zone, not to hit a pace number. For Z3+ workouts, **pace takes precedence** — HR lags behind effort during intervals and is unreliable for short, high-intensity efforts.
>
> #### What This Fixes From the Previous Zone Implementation
>
> The previous implementation derived zones as percentages of 5K race pace. This is fundamentally wrong for endurance training because:
> 1. It makes Z1/Z2 too fast — a 19:40 5K runner was getting Z2 at 7:01–7:46/mi, which is actually Z2–Z3 (marathon to tempo territory)
> 2. It doesn't account for the non-linear relationship between race pace and training paces at different effort levels
> 3. It ignores HR entirely, which is the best real-time indicator of whether a runner is actually in the right physiological zone
>
> The VDOT-based system fixes all three: paces are derived from validated tables, HR provides a cross-check, and Z1 is correctly placed at conversational effort.

### Change 5: Weekly Interval Repeats for Time-Goal Runners

**File:** IronZ_Philosophy_Engine_Spec_v1.0.docx
**Location:** Within the SPORT_ENDURANCE_RUNNING module or as part of event-specific training guidance

ADD THE FOLLOWING:

> ### Interval Repeats for Time-Goal Runners
>
> Runners who have a specific time goal (e.g., "sub-4 marathon," "sub-20 5K") should include one weekly interval session as a non-negotiable component of their training plan. Intervals develop VO2max, running economy, and the neuromuscular speed required to sustain goal pace.
>
> **Recommended session types:**
>
> | Repeat Distance | Duration at Effort | When to Use | Example Session |
> |---|---|---|---|
> | 400m | ~90 sec | Speed development, 5K/10K training | 10–12 × 400m at 5K pace, 60–90s jog recovery |
> | 800m | ~3 min | VO2max development, all distances | 6–8 × 800m at I-pace (Daniels), 2–3 min jog recovery |
> | 1000m | ~3:30–4:30 | VO2max + lactate tolerance, 10K–HM | 5–6 × 1K at I-pace, 2–3 min jog recovery |
> | 1200m–1600m | ~4:30–6 min | Lactate threshold + VO2max, HM–marathon | 4–5 × 1200m at T/I-pace blend, 3 min recovery |
>
> **Programming rules:**
> - One interval session per week for runners training 3+ days/week with a time goal.
> - Place the interval session on a day following an easy day (not after a long run or tempo).
> - Total interval volume (sum of hard repeats, excluding recovery) should be 5–8% of weekly mileage for intermediates, up to 10% for advanced runners.
> - Progression: Start with shorter repeats (400–800m) and progress to longer repeats (1K–1600m) as the training block advances and the race gets closer.
>
> **The key insight for users:** Repeats teach your legs and lungs to sustain the pace you're targeting. Running 6 × 1K at your goal 10K pace, week after week, builds the specific fitness to hold that pace for the full race distance. This is not optional for runners chasing a time — it's the mechanism by which goal pace becomes sustainable.

---

## Supabase Module Changes

### New Module: RUNNING_OFFSEASON

```json
{
  "id": "RUNNING_OFFSEASON",
  "category": "sport_endurance",
  "title": "Offseason / transition phase for runners",
  "version": "1.0",
  "applies_when": {
    "level": "any",
    "sport_profile": "endurance",
    "training_phase": "offseason"
  },
  "principles": [
    "Offseason volume: 50-60% of peak training volume",
    "Sessions should be shorter (30-45 min most runs)",
    "Focus shifts to speed development, hill work, and strength training",
    "2-3 strength sessions/week — best time in the annual cycle to prioritize gym work",
    "Encourage enjoyment and exploration — reduce watch dependency"
  ],
  "plan_rules": [
    "Reduce weekly mileage to 50-60% of the user's peak training volume",
    "No long runs exceeding 60 minutes",
    "Include 2-3 stride sessions per week (6-10 x 80-100m near-sprint with full recovery)",
    "Include 1 hill session per week (6-10 x 60-90s hard effort hill repeats)",
    "Include 2-3 strength training sessions targeting compound lower body + single-leg work",
    "No structured interval or tempo work — keep running aerobic and fun",
    "Duration: 2-6 weeks depending on preceding training block intensity and race"
  ],
  "hard_constraints": [
    "Never reduce volume below 40% of peak (risk of excessive detraining)",
    "Never eliminate running entirely unless medically indicated",
    "Strength training intensity can increase but running intensity should decrease"
  ],
  "coaching_tone": "Relaxed, encouraging exploration. Less pressure, more autonomy. 'This is your time to run without a watch.'",
  "evidence_sources": [
    "Pfitzinger & Douglas — Advanced Marathoning (periodization chapters)",
    "Daniels — Daniels' Running Formula (transition phase guidance)",
    "General coaching consensus on offseason volume reduction"
  ],
  "rationale": "The offseason allows physical and mental recovery while maintaining a fitness base. Speed and strength work during reduced volume builds qualities that are hard to develop during high-volume training blocks.",
  "priority": "medium",
  "is_active": true
}
```

### New Module: RUNNING_ZONE_CALCULATIONS

```json
{
  "id": "RUNNING_ZONE_CALCULATIONS",
  "category": "training_rules",
  "title": "Unified 5-zone system — Daniels VDOT pace + tiered HR",
  "version": "1.0",
  "applies_when": {
    "level": "any",
    "sport_profile": ["endurance", "hybrid", "triathlon", "cycling"],
    "goal": "any"
  },
  "zone_definitions": {
    "z1_easy": {
      "name": "Easy",
      "daniels_pace": "E-pace",
      "vo2max_pct": [0.65, 0.78],
      "training_time_pct": [0.70, 0.80],
      "feel": "Conversational. Full sentences. Could run for hours.",
      "rule": "70-80% of ALL training volume must be Z1. An 'easy' workout is entirely Z1."
    },
    "z2_marathon": {
      "name": "Marathon",
      "daniels_pace": "M-pace",
      "vo2max_pct": [0.80, 0.84],
      "training_time_pct": [0.05, 0.10],
      "feel": "Steady. Short sentences. Sustainable 2-3 hours."
    },
    "z3_threshold": {
      "name": "Threshold",
      "daniels_pace": "T-pace",
      "vo2max_pct": [0.88, 0.92],
      "training_time_pct": [0.08, 0.12],
      "feel": "Comfortably hard. Few words. ~60 min sustainable."
    },
    "z4_interval": {
      "name": "Interval",
      "daniels_pace": "I-pace",
      "vo2max_pct": [0.95, 1.00],
      "training_time_pct": [0.03, 0.05],
      "feel": "Hard. Cannot talk. 3-5 min repeats."
    },
    "z5_repetition": {
      "name": "Repetition",
      "daniels_pace": "R-pace",
      "vo2max_pct": [1.00, 1.20],
      "training_time_pct": [0.01, 0.02],
      "feel": "Max effort. Sprint. <90 sec repeats."
    }
  },
  "pace_calculation": {
    "primary_method": "Daniels VDOT lookup tables from a recent race result (5K, 10K, HM, or marathon)",
    "prohibited_method": "Do NOT use single-multiplier formulas like LT = 5K_pace * 1.06. These introduce cascading errors across all zones.",
    "fallback": "If no race result available, use HR zones only and prompt user to enter a race result for pace zones."
  },
  "hr_calculation": {
    "tier_1_max_hr_pct": {
      "requires": ["age"],
      "formula": "max_hr = 208 - (0.7 * age)",
      "zones": {
        "z1_easy": [0.60, 0.75],
        "z2_marathon": [0.75, 0.84],
        "z3_threshold": [0.84, 0.90],
        "z4_interval": [0.90, 0.95],
        "z5_repetition": [0.95, 1.00]
      },
      "accuracy_note": "Estimates. Standard error ±10 bpm. Prompt user to add resting HR for better accuracy."
    },
    "tier_2_karvonen": {
      "requires": ["age", "resting_hr"],
      "formula": "target_hr = ((max_hr - resting_hr) * target_pct) + resting_hr",
      "zones_pct_hrr": {
        "z1_easy": [0.50, 0.70],
        "z2_marathon": [0.70, 0.80],
        "z3_threshold": [0.80, 0.88],
        "z4_interval": [0.88, 0.95],
        "z5_repetition": [0.95, 1.00]
      },
      "upgrade_message": "Your training zones have been updated using your resting heart rate for better accuracy."
    },
    "tier_3_lthr": {
      "requires": ["lthr"],
      "zones_pct_lthr": {
        "z1_easy": [0, 0.80],
        "z2_marathon": [0.80, 0.88],
        "z3_threshold": [0.88, 0.95],
        "z4_interval": [0.95, 1.02],
        "z5_repetition": [1.02, 1.10]
      },
      "estimation_methods": [
        "Direct input from lab test",
        "30-min all-out test: average HR of last 20 minutes",
        "Race-based estimation using Daniels VDOT tables"
      ]
    },
    "override": "If user provides known max HR, use it instead of age-predicted formula for all tiers"
  },
  "display_rules": {
    "dual_display": "Always show pace AND HR zones side by side for every workout",
    "conflict_resolution_z1": "For Z1 (Easy) workouts, HR takes precedence over pace when they disagree (heat, altitude, hills, caffeine all inflate HR)",
    "conflict_resolution_z3_plus": "For Z3+ workouts, pace takes precedence — HR lags behind effort during short, high-intensity intervals"
  },
  "hard_constraints": [
    "An 'easy' workout must be entirely Z1 — never Z2 or Z3",
    "Do not derive pace zones from race pace percentages — use VDOT tables only",
    "70-80% of weekly training volume must be Z1"
  ],
  "evidence_sources": [
    "Daniels, J. — Daniels' Running Formula (VDOT tables, E/M/T/I/R pace system)",
    "Tanaka et al. (2001) — Age-predicted maximal heart rate revisited, JACC",
    "Karvonen et al. (1957) — The effects of training on heart rate",
    "Seiler, S. (2010) — What is best practice for training intensity distribution in endurance athletes?",
    "Grgic et al. (2017) — Inter-set rest intervals in resistance training",
    "ACSM Guidelines for Exercise Testing and Prescription, 11th ed."
  ],
  "rationale": "Unifies pace and HR into a single 5-zone system anchored to the most validated running research (Daniels VDOT). Pace zones come from VDOT lookup, HR zones use progressive accuracy (age → Karvonen → LTHR). Fixes the previous bug where zones were derived from 5K pace percentages, which made Z1/Z2 far too fast for conversational running.",
  "priority": "critical",
  "is_active": true
}
```

### New Module: RUNNING_FEEDBACK_CALIBRATION

```json
{
  "id": "RUNNING_FEEDBACK_CALIBRATION",
  "category": "adaptation",
  "title": "1/3 feedback calibration rule for plan adjustment",
  "version": "1.0",
  "applies_when": {
    "level": "any",
    "sport_profile": ["endurance", "strength", "general_fitness", "hybrid"],
    "goal": "any"
  },
  "feedback_framework": {
    "categories": [
      {"label": "Easier than intended", "target_proportion": 0.33, "signal": "May be ready for progression"},
      {"label": "About right", "target_proportion": 0.33, "signal": "Plan is well-calibrated"},
      {"label": "Harder than intended", "target_proportion": 0.33, "signal": "Load may be too aggressive or recovery insufficient"}
    ],
    "calibration_rules": [
      "If >50% of workouts feel harder than intended for 2+ consecutive weeks: reduce volume 10% or intensity one notch",
      "If >50% of workouts feel easier than intended for 2+ consecutive weeks: consider progression step",
      "Single-week deviations are normal and should not trigger automatic adjustments (illness, stress, weather)"
    ],
    "relationship_to_polarized": "This rule assesses perceived effort relative to intent, not intensity distribution. Compatible with 80/20 — a workout can be prescribed as 'easy' but still feel harder than intended."
  },
  "app_integration": {
    "post_workout_prompt": "How did this feel compared to what you expected?",
    "options": ["Easier than expected", "About right", "Harder than expected"],
    "weekly_dashboard": "Show 1/3 distribution in weekly check-in. Surface calibration signal if skewed for 2+ weeks."
  },
  "evidence_sources": [
    "Coaching heuristic — Tier 4 evidence",
    "Compatible with Seiler (2010) polarized training model (Tier 1)"
  ],
  "rationale": "Provides a simple, user-friendly feedback mechanism that helps the app (and user) detect when training load is miscalibrated. Framed as a review tool, not a prescription, so it doesn't conflict with evidence-based programming rules.",
  "priority": "medium",
  "is_active": true
}
```

### Updated Module: EVENT_MARATHON

**Version bump:** Current → +0.1 (minor)

```json
{
  "id": "EVENT_MARATHON",
  "field_to_update": "plan_rules",
  "action": "append",
  "new_rules": [
    "Scale the number of 20+ mile runs by runner experience and weekly mileage: first-timers 0-1, beginners 1-2, intermediates 2-4, advanced 4-5 with 6-12 miles at marathon pace per long run",
    "Never program more than one 20+ mile run per 2-week period",
    "Minimum 10-14 days between 20+ milers for all levels"
  ],
  "version": "increment_minor",
  "change_log": "2026-04-08: Added experience-scaled marathon long run programming with safety guardrails"
}
```

### Updated Module: SPORT_ENDURANCE_RUNNING

**Version bump:** Current → +0.1 (minor)

```json
{
  "id": "SPORT_ENDURANCE_RUNNING",
  "field_to_update": "plan_rules",
  "action": "append",
  "new_rules": [
    "For runners with a specific time goal: include one weekly interval session (800m or 1K repeats at I-pace). This is non-negotiable for time-goal training.",
    "Total interval volume should be 5-8% of weekly mileage for intermediates, up to 10% for advanced",
    "Place interval sessions on a day following an easy day, never after a long run or tempo",
    "Progress repeats from shorter (400-800m) to longer (1K-1600m) as the race approaches",
    "Reference RUNNING_ZONE_CALCULATIONS module for pacing interval work by HR zones"
  ],
  "version": "increment_minor",
  "change_log": "2026-04-08: Added weekly interval repeat requirement for time-goal runners; linked to zone calculations module"
}
```

---

## App Code Changes

### File: zone-calculator.js (NEW FILE)

**Reason:** No zone calculation logic currently exists. This file implements the unified 5-zone system.

**Change:** Create a new module that:
1. **Pace zones:** Accepts a recent race result (distance + time). Calculates VDOT score. Looks up E, M, T, I, R paces from a bundled VDOT lookup table (Daniels' published values for VDOT 30–85). Returns pace ranges in min/mi for all 5 zones. Do NOT use multiplier formulas — use the lookup table directly.
2. **HR zones:** Accepts user profile data (age, resting_hr, lthr, known_max_hr). Determines highest available tier (max HR % → Karvonen → LTHR). Calculates all 5 HR zone boundaries in bpm.
3. **Dual output:** Returns both pace and HR zones together, with a `tier_used` field and any upgrade prompts (e.g., "Add your resting HR for more accurate zones").
4. **Conflict resolution rules:** For Z1 workouts, HR takes precedence. For Z3+ workouts, pace takes precedence.
5. **VDOT table:** Bundle the Daniels VDOT lookup as a static JSON (VDOT score → {e_pace, m_pace, t_pace, i_pace, r_pace}). This is deterministic — no AI needed.

### File: rules-engine.js

**Reason:** Needs to incorporate offseason detection, marathon long run scaling, and interval session programming.

**Changes:**
1. Add offseason/transition phase detection: if user's training phase is "offseason" or within 2-6 weeks of goal race, apply RUNNING_OFFSEASON module rules.
2. When building marathon training blocks, consult the 20+ mile run scaling table based on user's weekly mileage and experience level.
3. When the user has a time goal, ensure one interval session per week is programmed.

### File: feedback-tracker.js (NEW FILE or addition to existing)

**Reason:** Implements the 1/3 feedback calibration system.

**Change:** Create or extend a module that:
1. After each completed workout, prompts: "How did this feel compared to what you expected?" (Easier / About right / Harder)
2. Stores responses per workout
3. Aggregates weekly distribution
4. Surfaces calibration signals in the weekly check-in dashboard
5. If >50% harder for 2+ weeks: flag for volume/intensity reduction
6. If >50% easier for 2+ weeks: flag for progression consideration

### File: planner.js (AI fallback)

**Reason:** When the AI fallback is used for freeform requests, it needs the zone calculation and interval programming rules in its context.

**Change:** Add RUNNING_ZONE_CALCULATIONS and interval repeat rules to the modules injected into the Claude API prompt for endurance-related freeform requests.

---

## Validation Checklist

- [ ] Offseason volume rules don't conflict with existing recovery state modules
- [ ] Marathon 20+ mile run scaling respects existing max weekly volume increase rule (≤15%)
- [ ] VDOT pace zones match Daniels' published tables for VDOT 30, 40, 50, 53, 60, 70 (spot-check)
- [ ] HR zone boundaries produce valid bpm ranges for ages 18–70+ with resting HRs 40–90
- [ ] Z1 (Easy) pace for a 19:40 5K runner is 7:51–8:32/mi (NOT 7:01–7:46)
- [ ] No zone uses 5K race pace multipliers — all pace zones come from VDOT lookup
- [ ] Interval volume cap (5–10% of weekly mileage) doesn't violate existing hard constraints
- [ ] 1/3 feedback rule is clearly tagged as Tier 4 evidence / feedback tool (not overriding Tier 1 training prescription)
- [ ] New modules added to philosophy_modules table with correct versioning
- [ ] EVENT_MARATHON and SPORT_ENDURANCE_RUNNING version bumped
- [ ] Philosophy doc changelog updated
- [ ] Golden test cases:
  - [ ] Offseason plan for a runner who just finished a marathon at 50mpw → should generate 25-30 mpw with strides + hills + strength
  - [ ] Beginner marathon plan at 35 mpw → should include 0-1 runs of 20+ miles
  - [ ] Advanced marathon plan at 70 mpw → should include 4-5 runs of 20+ miles with 6-12 miles at marathon pace each
  - [ ] Sub-20 5K training plan → should include weekly 800m or 1K repeats
  - [ ] Zone calculation for 35yo with resting HR 58 → should use Karvonen, not max HR %

---

## Rollback Plan

All changes are additive — no existing modules or rules are modified or removed.

1. **New modules:** Set `is_active = false` for RUNNING_OFFSEASON, RUNNING_ZONE_CALCULATIONS, RUNNING_FEEDBACK_CALIBRATION.
2. **Updated modules:** Revert EVENT_MARATHON and SPORT_ENDURANCE_RUNNING to previous versions (remove appended plan_rules).
3. **New files:** Remove zone-calculator.js and feedback-tracker.js (or comment out imports).
4. **Philosophy doc:** Remove the five new subsections and revert changelog.
