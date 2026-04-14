# Philosophy Update Spec: Workout Diversification & AI Variant Selection

> Date: 2026-04-09
> Evidence tier: Tier 1 (adaptation timelines, periodization, strength variation literature)
> Modules affected: NEW: VARIANT_LIBRARIES_{RUN,BIKE,SWIM,STRENGTH,HYBRID}, AI_VARIANT_SELECTOR. UPDATED: SESSION_TYPE_LIBRARY, SPORT_ENDURANCE_RUNNING, SPORT_ENDURANCE_CYCLING, SPORT_ENDURANCE_SWIMMING, SPORT_STRENGTH, SPORT_HYBRID
> Approved by: Chase (2026-04-09)

---

## Summary

Solves the #1 adherence killer in IronZ training plans: workout repetition week over week. Every session type now has a **variant library** of 4–8 research-backed workouts that produce the same physiological adaptation but look structurally different. A new **AI Variant Selector** picks which variant to use for a given user in a given week, taking into account recent workout history, experience level, and training phase. The selector is constrained — it picks from the pre-defined library, it does not invent workouts. When the API call fails or times out, the system falls back to a deterministic rotation index. Users see different workouts each week without ever seeing the rotation system — invisible by design. Strength compounds are deliberately exempt from rotation because progressive overload on the same lift IS the variety.

---

## Evidence

### 1. Endurance Adaptation Timeline (Tier 1)

- **Weeks 1–2:** Early neural response, cardiovascular efficiency improvements.
- **Weeks 2–6:** Stabilization phase. Initial gains plateau unless stimulus progresses.
- **Weeks 4–8:** Mitochondrial biogenesis, aerobic enzyme activity increases.
- **Weeks 8–12:** Lactate threshold and VO2max substantial improvements.
- **Implication for variety:** Rotating every 2 weeks hits the upper bound of novelty while still allowing adaptation to accrue within each variant. Repeating a variant 2–3 times across a 12-week plan (with 2+ weeks between each exposure) produces measurable progress users can feel ("last time I did 6×800m in 3:05, today I did them in 3:02") AND prevents staleness.
- Sources: *Understanding the Timeline of Training Adaptations* (Trail Runner Mag); *Adaptations to Endurance and Strength Training* (PMC); *Models of Training Periodization* (Matrix Endurance).

### 2. Non-Linear / Undulating Periodization (Tier 1)

- Non-linear periodization alternates intensity and volume within the same week or cycle. It is the most supported periodization model for intermediate and advanced athletes because it prevents the plateaus that come from linear progression of a single stimulus.
- Variety IS the periodization tool, not an afterthought.
- Source: Kraemer & Ratamess (2004); NSCA *Essentials of Strength Training and Conditioning*, 4th ed.

### 3. Strength: Variation vs Consistency Split (Tier 1)

- **Systematic variation helps regional hypertrophy and maximal strength.** Research consistently shows that targeting muscles from multiple angles and with multiple exercises over a mesocycle produces better hypertrophy than doing the same single exercise for weeks on end.
- **Excessive random variation compromises gains.** If every workout changes, the nervous system never learns the movement and progressive overload becomes impossible to track.
- **Compound lifts with skill components (squat, deadlift, bench, OHP, row) benefit from consistency + progressive overload.** The skill overhead means you need repeated exposure to express strength improvements.
- **Accessory and isolation work tolerates and benefits from rotation.** No skill component = variety without penalty.
- **Bottom line:** Split the strength variant system — compounds stay, accessories rotate.
- Sources: Biolayne *Exercise Variation for Strength and Hypertrophy: Change Is Not Always Good*; Frontiers *Resistance Training Variables for Optimization of Muscle Hypertrophy* (2022); *Does Varying Resistance Exercises Promote Superior Muscle Hypertrophy?* (PubMed 2022).

### 4. Constrained-Choice AI Is Safe (Tier 4 — engineering judgment, not sports science)

- Using an LLM to *invent* workouts has a high failure mode: bad structure, unsafe volume, ignored contraindications. That's why the IronZ core engine is deterministic.
- Using an LLM to *pick one option from a curated list* has a low failure mode: worst case, it picks a suboptimal variant from a list that was already vetted by humans. The downside is "slightly less ideal variant," not "injury."
- The AI Variant Selector is therefore an acceptable place to introduce AI into the otherwise-deterministic philosophy engine. It does not break the philosophy-first principle; it extends it.

---

## Philosophy Document Changes

### Change 1: New Section — Workout Diversification & Variant Libraries

**File:** IronZ_Philosophy_Engine_Spec_v1.0.docx
**Location:** New subsection inside Section 5 (Sport Modules) — placed AFTER the Session Type Library section. Suggested heading: **5.X Workout Diversification & Variant Selection**

ADD THE FOLLOWING:

> ### 5.X Workout Diversification & Variant Selection
>
> #### The Problem
>
> A training plan that repeats the same workout week after week produces two failures: physiological plateau and athlete attrition. After 2–3 weeks of identical stimulus, adaptation slows. After 4+ weeks of identical structure, most recreational athletes disengage — they stop executing the workouts as prescribed or stop logging altogether. The plan may still be "correct" on paper, but it stops working because the human stops following it.
>
> #### The Solution
>
> Every session type in IronZ has a **variant library**: a curated set of 4–8 workouts that all produce the same physiological adaptation but look and feel structurally different. A Track Workout can be 800m repeats, 1K repeats, 1200m repeats, a ladder, mile repeats, or Yasso 800s — all six develop VO2max, but they are experienced as six distinct workouts. The user sees different workouts each week. The physiology doesn't change. The experience does.
>
> #### Rotation Cadence by Modality
>
> Different modalities have different optimal rotation cadences based on adaptation timelines and the role of skill/consistency:
>
> | Modality / Session Type | Rotation Cadence | Rationale |
> |---|---|---|
> | Run — Track, Speed, Hills, Tempo | Every **2 weeks** | Endurance adaptation window is 2–6 weeks; rotating at 2 keeps the stimulus novel while allowing measurable progress within each variant |
> | Run — Long Run | Every **3 weeks** | Long runs rotate "flavor" (easy long, MP finish, fast finish, progression) on a slower cycle because the underlying purpose is more consistent |
> | Run — Easy, Endurance, Recovery | **Minor variation only** | Easy runs don't need variety; subtle tweaks like route, duration, or optional stride finish are enough |
> | Bike — Intervals (FTP, VO2, sweet spot, sprint) | Every **2 weeks** | Same adaptation timeline as running intervals |
> | Bike — Endurance / Z2 | **Minor variation only** | Same as running endurance |
> | Swim — Threshold / CSS work, sprints | Every **2 weeks** | Same rationale; variety also reduces shoulder-boredom injury risk |
> | Swim — Technique / Easy | **Drill rotation** | The drill set IS the variety for easy swim days |
> | Strength — **Compound lifts** (squat, bench, deadlift, OHP, row) | **Repeat for 4–6 weeks**, then swap | Progressive overload on the same lift IS the variety. Skill component mandates consistency for measurable strength gains. Rotating compounds every 2 weeks actually *compromises* progress. |
> | Strength — **Accessories** (lunges, curls, lateral raises, face pulls, core) | Every **2–3 weeks** | No skill overhead; variation helps regional hypertrophy |
> | Hybrid (HIIT, CrossFit-style) | Every **week** | Variety IS the product; users come for novelty |
>
> #### Why Workouts Can (and Should) Repeat Across a Plan
>
> The rotation system does NOT prevent repetition — it prevents *consecutive* repetition. The same workout appearing in Week 2 and Week 6 is good: it gives the user a measurable progress anchor ("last time I did 6×800m in 3:05, today I did them in 3:02"). The same workout in Week 2 and Week 3 is bad: the user hasn't adapted, hasn't progressed, and has seen it before.
>
> **Rule of thumb:** A variant should recur in the plan no more often than every 2 weeks for running intervals, every 3 weeks for long runs, and every 4 weeks for any given workout type.
>
> #### AI Variant Selection
>
> IronZ uses a constrained-choice AI selector to pick which variant from the library to use for a given user in a given week. The selector is constrained in three ways:
>
> 1. **It picks from a pre-defined library.** The AI cannot invent a workout. It can only return the ID of a variant that exists in the library.
> 2. **It receives curated context.** The prompt includes user experience level, current training phase, recent workout history (last 3 weeks), and the variant library itself with short descriptions. No open-ended "design a workout" framing.
> 3. **It always has a deterministic fallback.** If the API call fails, times out, is rate-limited, or returns an invalid variant ID, the system falls back to `variantIndex = weekNumber mod libraryLength`. The plan never breaks.
>
> The selector is called at most **once per week per session type per user** and the result is cached. For a triathlete training 9 sessions/week, that's at most 9 API calls per week — negligible cost.
>
> #### UX: Invisible by Design
>
> Users do not see the rotation system, the variant selector, or the library. They open their plan and the workouts are different each week. The only user-facing surfacing is the `why_text` on each workout, which can subtly reference the variant ("Today is a ladder workout — different distances build different race skills"). There is no rotation toggle, no variant library UI, no "skip this variant" button. Trust the system, keep it simple.
>
> #### Hard Constraints
>
> - The AI selector must never return a variant that doesn't exist in the library. Response validation rejects any unknown variant ID.
> - The AI selector must never return the variant the user did most recently (within the last rotation window for that session type).
> - The AI selector must respect training phase constraints (e.g., during a threshold week, the test is fixed — the selector is not called).
> - Strength compound variants rotate on a 4–6 week cycle, never 2 weeks, regardless of what the AI suggests.
> - The selector must return in under 3 seconds or the deterministic fallback kicks in.
>
> #### Changelog
>
> 2026-04-09 — Initial diversification system added. 5 variant libraries (~80 workouts total) with AI-powered selection and deterministic fallback. Modality-specific rotation cadences. Compound lifts exempt from rotation in favor of progressive overload.

---

## Supabase Module Changes

### New Module: VARIANT_LIBRARY_RUN

```json
{
  "id": "VARIANT_LIBRARY_RUN",
  "category": "training_rules",
  "title": "Run workout variant library — deterministic templates for diversification",
  "version": "1.0",
  "applies_when": {"sport_profile": ["endurance", "triathlon", "hybrid"]},
  "rotation_cadence_by_type": {
    "track_workout": 2,
    "tempo_threshold": 2,
    "speed_work": 2,
    "hills": 2,
    "long_run": 3,
    "endurance": null,
    "easy_recovery": null,
    "fun_social": null
  },
  "variants": {
    "track_workout": [
      {
        "id": "track_yasso_800s",
        "name": "Yasso 800s",
        "description": "Classic 5K/marathon-goal workout. 8-10 x 800m at 5K pace with 400m jog recovery.",
        "main_set": {"rep_distance_m": 800, "rep_count": {"beginner": 6, "intermediate": 8, "advanced": 10}, "pace_source": "vdot.5k_pace", "rest_type": "jog_distance", "rest_m": 400},
        "develops": "VO2max + lactate tolerance + race pace confidence",
        "best_for": "5K/10K/marathon training (Bart Yasso's original)"
      },
      {
        "id": "track_1k_i_pace",
        "name": "1K repeats at I-pace",
        "description": "Classic VO2max workout. 5-7 x 1000m at I-pace w/ 2 min jog.",
        "main_set": {"rep_distance_m": 1000, "rep_count": {"beginner": 5, "intermediate": 6, "advanced": 7}, "pace_source": "vdot.i_pace", "rest_type": "jog_time", "rest_sec": 120},
        "develops": "VO2max (sweet spot repeat distance)",
        "best_for": "5K/10K focus"
      },
      {
        "id": "track_1200_i_pace",
        "name": "1200m repeats at I-pace",
        "description": "Longer VO2max repeats. 4-6 x 1200m at I-pace w/ 3 min jog.",
        "main_set": {"rep_distance_m": 1200, "rep_count": {"beginner": 4, "intermediate": 5, "advanced": 6}, "pace_source": "vdot.i_pace", "rest_type": "jog_time", "rest_sec": 180},
        "develops": "VO2max + lactate buffering",
        "best_for": "5K-HM range, peak phase"
      },
      {
        "id": "track_ladder_400_1200",
        "name": "Pyramid ladder",
        "description": "Pyramid: 400/800/1200/800/400 at I-pace with equal-time jog recovery.",
        "main_set": {"type": "ladder", "rungs_m": [400, 800, 1200, 800, 400], "pace_source": "vdot.i_pace", "rest_type": "equal_time_jog"},
        "develops": "VO2max + pacing discipline + mental variety",
        "best_for": "Breaks up monotony; excellent mid-block workout"
      },
      {
        "id": "track_mile_repeats",
        "name": "Mile repeats",
        "description": "Advanced VO2max. 3-5 x 1 mile at I-pace/5K pace w/ 3-4 min jog.",
        "main_set": {"rep_distance_m": 1609, "rep_count": {"beginner": 3, "intermediate": 4, "advanced": 5}, "pace_source": "vdot.i_pace", "rest_type": "jog_time", "rest_sec": 210},
        "develops": "Sustained VO2max + mental toughness",
        "best_for": "Advanced runners, HM/marathon peak phase",
        "experience_minimum": "intermediate"
      },
      {
        "id": "track_200_400_alternation",
        "name": "200/400 alternation",
        "description": "12-16 x alternating 200m @ R-pace / 400m @ I-pace with 200m jog between.",
        "main_set": {"type": "alternation", "pattern": [{"distance_m": 200, "pace_source": "vdot.r_pace"}, {"distance_m": 400, "pace_source": "vdot.i_pace"}], "cycles": {"beginner": 6, "intermediate": 8, "advanced": 10}, "rest_type": "jog_distance", "rest_m": 200},
        "develops": "Speed + VO2max simultaneously; recruits fast-twitch and slow-twitch",
        "best_for": "5K specialists, peak phase"
      }
    ],
    "tempo_threshold": [
      {
        "id": "tempo_cruise_8min",
        "name": "8-minute cruise intervals",
        "description": "Daniels' classic cruise intervals. 3-5 x 8 min at T-pace w/ 90s jog.",
        "main_set": {"rep_duration_sec": 480, "rep_count": {"beginner": 3, "intermediate": 4, "advanced": 5}, "pace_source": "vdot.t_pace", "rest_type": "jog_time", "rest_sec": 90},
        "develops": "Lactate threshold, sustainable pace ceiling"
      },
      {
        "id": "tempo_straight_20",
        "name": "20-min straight tempo",
        "description": "Classic 20-minute continuous tempo at T-pace. Simple, honest, hard.",
        "main_set": {"type": "continuous", "duration_sec": 1200, "pace_source": "vdot.t_pace"},
        "develops": "Lactate threshold + mental execution",
        "experience_minimum": "intermediate"
      },
      {
        "id": "tempo_over_under",
        "name": "Over-under intervals",
        "description": "4-6 x 6 min alternating 3 min at T-pace / 3 min at M-pace. No rest between blocks; 2 min easy between full reps.",
        "main_set": {"type": "alternation_block", "blocks": [{"duration_sec": 180, "pace_source": "vdot.t_pace"}, {"duration_sec": 180, "pace_source": "vdot.m_pace"}], "reps": {"beginner": 3, "intermediate": 4, "advanced": 6}, "rest_type": "jog_time", "rest_sec": 120},
        "develops": "Lactate shuttling, pace adaptability",
        "experience_minimum": "intermediate"
      },
      {
        "id": "tempo_2x15_with_float",
        "name": "2 x 15 min tempo with float",
        "description": "2 x 15 min at T-pace with 3 min float recovery in between.",
        "main_set": {"rep_duration_sec": 900, "rep_count": 2, "pace_source": "vdot.t_pace", "rest_type": "jog_time", "rest_sec": 180},
        "develops": "Extended threshold time under tension",
        "experience_minimum": "intermediate"
      },
      {
        "id": "tempo_progression_run",
        "name": "Progression tempo",
        "description": "30 min progressing from M-pace to T-pace. Negative-split execution.",
        "main_set": {"type": "progression", "duration_sec": 1800, "start_pace": "vdot.m_pace", "end_pace": "vdot.t_pace"},
        "develops": "Pacing discipline, fatigue resistance"
      }
    ],
    "speed_work": [
      {
        "id": "speed_200_r_pace",
        "name": "200m R-pace repeats",
        "description": "8-12 x 200m at R-pace with 200m walk recovery.",
        "main_set": {"rep_distance_m": 200, "rep_count": {"beginner": 6, "intermediate": 8, "advanced": 12}, "pace_source": "vdot.r_pace", "rest_type": "walk_distance", "rest_m": 200}
      },
      {
        "id": "speed_400_r_pace",
        "name": "400m R-pace repeats",
        "description": "6-8 x 400m at R-pace with 400m walk recovery.",
        "main_set": {"rep_distance_m": 400, "rep_count": {"beginner": 4, "intermediate": 6, "advanced": 8}, "pace_source": "vdot.r_pace", "rest_type": "walk_distance", "rest_m": 400}
      },
      {
        "id": "speed_strides",
        "name": "100m strides",
        "description": "8 x 100m strides near-sprint with full walk-back recovery. Pure neuromuscular.",
        "main_set": {"rep_distance_m": 100, "rep_count": 8, "rest_type": "full_recovery", "pace_target": "near-sprint, controlled form"}
      },
      {
        "id": "speed_hill_sprints",
        "name": "Short hill sprints",
        "description": "10 x 10-second all-out hill sprints with full recovery walk-down. Minimal impact, max neuromuscular.",
        "main_set": {"rep_duration_sec": 10, "rep_count": 10, "rest_type": "walk_down_recovery", "effort": "maximal", "terrain": "hill_4_8_pct"}
      },
      {
        "id": "speed_flying_30s",
        "name": "Flying 30s",
        "description": "6 x 30m flying sprints (rolling start, no standing start). Full recovery.",
        "main_set": {"rep_distance_m": 30, "rep_count": 6, "rest_type": "full_recovery", "pace_target": "maximum velocity, rolling start"},
        "experience_minimum": "intermediate"
      }
    ],
    "hills": [
      {
        "id": "hills_short_60s",
        "name": "60-second hill repeats",
        "description": "8-12 x 60 sec hard up / easy down on a 4-8% grade.",
        "main_set": {"rep_duration_sec": 60, "rep_count": {"beginner": 6, "intermediate": 8, "advanced": 12}, "rest_type": "easy_jog_down", "effort": "hard_z4_equivalent"}
      },
      {
        "id": "hills_long_90s",
        "name": "90-second hill repeats",
        "description": "6-10 x 90 sec hard up / easy down.",
        "main_set": {"rep_duration_sec": 90, "rep_count": {"beginner": 4, "intermediate": 6, "advanced": 10}, "rest_type": "easy_jog_down", "effort": "hard_z4_equivalent"}
      },
      {
        "id": "hills_long_2_3min",
        "name": "2-3 min hill grinders",
        "description": "4-6 x 2-3 min hill repeats at threshold effort uphill.",
        "main_set": {"rep_duration_sec": 150, "rep_count": {"beginner": 3, "intermediate": 4, "advanced": 6}, "rest_type": "easy_jog_down", "effort": "threshold_z3_equivalent"},
        "experience_minimum": "intermediate"
      },
      {
        "id": "hills_fartlek_rolling",
        "name": "Rolling hill fartlek",
        "description": "45-60 min run on a rolling course, push hard on every uphill, recover on flats and downhills.",
        "main_set": {"type": "unstructured_fartlek", "duration_sec": {"beginner": 2400, "intermediate": 3000, "advanced": 3600}, "effort_rule": "hard uphills, easy recoveries"}
      }
    ],
    "long_run": [
      {
        "id": "long_easy",
        "name": "Easy long run",
        "description": "Single-pace long run at E-pace. Base-building, no bells or whistles.",
        "main_set": {"type": "continuous", "duration_min_range": [60, 150], "pace_source": "vdot.e_pace"}
      },
      {
        "id": "long_mp_finish",
        "name": "MP-finish long run",
        "description": "Long run with last 15-25% at marathon pace.",
        "main_set": {"type": "two_phase", "phase_1": {"pct_duration": 0.80, "pace_source": "vdot.e_pace"}, "phase_2": {"pct_duration": 0.20, "pace_source": "vdot.m_pace"}},
        "experience_minimum": "intermediate"
      },
      {
        "id": "long_fast_finish",
        "name": "Fast-finish long run",
        "description": "Long run with last 10-15% at T-pace or faster.",
        "main_set": {"type": "two_phase", "phase_1": {"pct_duration": 0.87, "pace_source": "vdot.e_pace"}, "phase_2": {"pct_duration": 0.13, "pace_source": "vdot.t_pace"}},
        "experience_minimum": "intermediate"
      },
      {
        "id": "long_progression",
        "name": "Progression long run",
        "description": "Long run progressing continuously from E-pace to M-pace over the full duration.",
        "main_set": {"type": "progression", "start_pace": "vdot.e_pace", "end_pace": "vdot.m_pace"},
        "experience_minimum": "intermediate"
      },
      {
        "id": "long_easy_with_strides",
        "name": "Easy long + finishing strides",
        "description": "Easy long run + 6 x 20s strides at the end. Keeps legs snappy without extra load.",
        "main_set": {"type": "base_plus_finisher", "base": {"pace_source": "vdot.e_pace"}, "finisher": {"description": "6 x 20s strides with full recovery"}}
      }
    ],
    "endurance": [
      {"id": "endurance_steady", "name": "Steady endurance", "description": "Continuous Z1-low Z2.", "main_set": {"type": "continuous", "pace_source": "vdot.e_pace"}},
      {"id": "endurance_progression", "name": "Progression endurance", "description": "Start Z1, finish low Z2.", "main_set": {"type": "progression", "start_pace": "vdot.e_pace_slow", "end_pace": "vdot.e_pace_fast"}},
      {"id": "endurance_with_strides", "name": "Endurance + strides", "description": "Steady with 4-6 x 20s strides after 20 min.", "main_set": {"type": "base_plus_strides"}}
    ],
    "easy_recovery": [
      {"id": "easy_flat", "name": "Easy flat", "description": "Single Z1 pace, flat route preferred.", "main_set": {"type": "continuous", "pace_source": "vdot.e_pace_slow"}},
      {"id": "easy_trail", "name": "Easy trail", "description": "Z1 on soft surface if available.", "main_set": {"type": "continuous", "pace_source": "vdot.e_pace_slow", "terrain_preference": "trail"}}
    ],
    "fun_social": [
      {"id": "fun_free", "name": "Run by feel", "description": "No targets, user chooses."}
    ]
  },
  "evidence_sources": [
    "Daniels, J. — Daniels' Running Formula (E/M/T/I/R intensities and variant structures)",
    "Magness, S. — The Science of Running (workout variety and motor learning)",
    "Pfitzinger, P. — Advanced Marathoning (long run flavors, periodization)",
    "Hudson, B. — Run Faster from the 5K to the Marathon (variant rotation)",
    "Yasso, B. — Runner's World (Yasso 800s origin)"
  ],
  "priority": "high",
  "is_active": true
}
```

### New Module: VARIANT_LIBRARY_BIKE

```json
{
  "id": "VARIANT_LIBRARY_BIKE",
  "category": "training_rules",
  "title": "Cycling workout variant library",
  "version": "1.0",
  "applies_when": {"sport_profile": ["cycling", "triathlon", "hybrid"]},
  "rotation_cadence_by_type": {
    "bike_intervals_ftp": 2,
    "bike_intervals_vo2": 2,
    "bike_intervals_sweet_spot": 2,
    "bike_intervals_sprint": 2,
    "bike_endurance": null
  },
  "variants": {
    "bike_intervals_ftp": [
      {"id": "bike_ftp_2x20", "name": "2 x 20 min at FTP", "description": "Classic FTP builder. 2x20min at 95-100% FTP w/ 5min easy between.", "main_set": {"reps": 2, "duration_sec": 1200, "power_target_pct_ftp": [0.95, 1.00], "rest_sec": 300}},
      {"id": "bike_ftp_3x12", "name": "3 x 12 min at FTP", "description": "Shorter reps, higher intensity. 3x12min at 100-105% FTP w/ 4min easy.", "main_set": {"reps": 3, "duration_sec": 720, "power_target_pct_ftp": [1.00, 1.05], "rest_sec": 240}},
      {"id": "bike_ftp_4x8", "name": "4 x 8 min at FTP", "description": "Sharper stimulus. 4x8min at 105-110% FTP w/ 4min easy.", "main_set": {"reps": 4, "duration_sec": 480, "power_target_pct_ftp": [1.05, 1.10], "rest_sec": 240}},
      {"id": "bike_ftp_5x6", "name": "5 x 6 min at FTP", "description": "5x6min at 105-110% FTP w/ 3min easy.", "main_set": {"reps": 5, "duration_sec": 360, "power_target_pct_ftp": [1.05, 1.10], "rest_sec": 180}},
      {"id": "bike_ftp_over_under", "name": "FTP over-unders", "description": "4x8min alternating 1min at 105% / 1min at 95% FTP.", "main_set": {"reps": 4, "duration_sec": 480, "type": "alternation_block", "blocks": [{"duration_sec": 60, "power_target_pct_ftp": 1.05}, {"duration_sec": 60, "power_target_pct_ftp": 0.95}], "rest_sec": 240}}
    ],
    "bike_intervals_vo2": [
      {"id": "bike_vo2_5x3", "name": "5 x 3 min VO2max", "description": "5x3min at 115-120% FTP w/ 3min easy.", "main_set": {"reps": 5, "duration_sec": 180, "power_target_pct_ftp": [1.15, 1.20], "rest_sec": 180}},
      {"id": "bike_vo2_8x2", "name": "8 x 2 min VO2max", "description": "8x2min at 120-125% FTP w/ 2min easy.", "main_set": {"reps": 8, "duration_sec": 120, "power_target_pct_ftp": [1.20, 1.25], "rest_sec": 120}},
      {"id": "bike_vo2_30_30", "name": "30/30 VO2max shuttles", "description": "Tabata-style: 10-20 x 30s at 130% FTP / 30s easy.", "main_set": {"reps": {"beginner": 10, "intermediate": 15, "advanced": 20}, "duration_sec": 30, "power_target_pct_ftp": 1.30, "rest_sec": 30}},
      {"id": "bike_vo2_3x10", "name": "3 x 10 min VO2max progression", "description": "3x10min building from 100% to 115% FTP across each rep.", "main_set": {"reps": 3, "duration_sec": 600, "type": "progression", "start_pct_ftp": 1.00, "end_pct_ftp": 1.15, "rest_sec": 300}}
    ],
    "bike_intervals_sweet_spot": [
      {"id": "bike_ss_3x15", "name": "3 x 15 min sweet spot", "description": "3x15min at 88-94% FTP w/ 5min easy.", "main_set": {"reps": 3, "duration_sec": 900, "power_target_pct_ftp": [0.88, 0.94], "rest_sec": 300}},
      {"id": "bike_ss_2x25", "name": "2 x 25 min sweet spot", "description": "Extended time under tension. 2x25min at 88-92% FTP w/ 5min easy.", "main_set": {"reps": 2, "duration_sec": 1500, "power_target_pct_ftp": [0.88, 0.92], "rest_sec": 300}},
      {"id": "bike_ss_4x10", "name": "4 x 10 min sweet spot", "description": "4x10min at 90-95% FTP w/ 3min easy.", "main_set": {"reps": 4, "duration_sec": 600, "power_target_pct_ftp": [0.90, 0.95], "rest_sec": 180}}
    ],
    "bike_intervals_sprint": [
      {"id": "bike_sprint_10x10", "name": "10 x 10s sprints", "description": "10x10s all-out sprints w/ 2min full recovery.", "main_set": {"reps": 10, "duration_sec": 10, "effort": "maximal", "rest_sec": 120}},
      {"id": "bike_sprint_6x30", "name": "6 x 30s sprints", "description": "6x30s at 200%+ FTP w/ 4min easy.", "main_set": {"reps": 6, "duration_sec": 30, "power_target_pct_ftp": 2.0, "rest_sec": 240}}
    ],
    "bike_endurance": [
      {"id": "bike_endurance_steady", "name": "Steady endurance", "description": "Z2 continuous.", "main_set": {"type": "continuous", "power_target_pct_ftp": [0.65, 0.75]}},
      {"id": "bike_endurance_with_surges", "name": "Endurance with surges", "description": "Z2 with 6x1min Z4 surges scattered across the ride.", "main_set": {"type": "base_plus_surges", "base_pct_ftp": [0.65, 0.75], "surges": {"count": 6, "duration_sec": 60, "power_target_pct_ftp": 1.05}}}
    ]
  },
  "evidence_sources": ["Coggan & Allen — Training and Racing with a Power Meter", "Friel, J. — The Cyclist's Training Bible"],
  "priority": "high",
  "is_active": true
}
```

### New Module: VARIANT_LIBRARY_SWIM

```json
{
  "id": "VARIANT_LIBRARY_SWIM",
  "category": "training_rules",
  "title": "Swim workout variant library",
  "version": "1.0",
  "applies_when": {"sport_profile": ["swimming", "triathlon", "hybrid"]},
  "rotation_cadence_by_type": {
    "swim_css_intervals": 2,
    "swim_speed": 2,
    "swim_endurance": null,
    "swim_technique": null
  },
  "variants": {
    "swim_css_intervals": [
      {"id": "swim_css_8x100", "name": "8 x 100 at CSS", "description": "8x100m at CSS pace w/ 15s rest.", "main_set": {"reps": 8, "distance_m": 100, "pace_source": "css", "rest_sec": 15}},
      {"id": "swim_css_6x200", "name": "6 x 200 at CSS", "description": "6x200m at CSS w/ 20s rest.", "main_set": {"reps": 6, "distance_m": 200, "pace_source": "css", "rest_sec": 20}},
      {"id": "swim_css_descending_10x100", "name": "10 x 100 descending", "description": "10x100m, first 5 at CSS+5s, last 5 at CSS. 15s rest.", "main_set": {"type": "descending", "sets": [{"reps": 5, "distance_m": 100, "pace_source": "css_plus_5", "rest_sec": 15}, {"reps": 5, "distance_m": 100, "pace_source": "css", "rest_sec": 15}]}},
      {"id": "swim_css_ladder", "name": "CSS ladder", "description": "50/100/150/200/150/100/50 all at CSS pace, 15s rest.", "main_set": {"type": "ladder", "rungs_m": [50, 100, 150, 200, 150, 100, 50], "pace_source": "css", "rest_sec": 15}},
      {"id": "swim_css_broken_400", "name": "Broken 400s", "description": "4 x 400m at CSS pace, broken 4x100 with 10s rest inside each 400.", "main_set": {"reps": 4, "distance_m": 400, "type": "broken", "break_at_m": 100, "break_rest_sec": 10, "pace_source": "css"}}
    ],
    "swim_speed": [
      {"id": "swim_speed_10x50", "name": "10 x 50 sprint", "description": "10x50m fast w/ 30s rest.", "main_set": {"reps": 10, "distance_m": 50, "pace_source": "css_minus_5", "rest_sec": 30}},
      {"id": "swim_speed_16x25", "name": "16 x 25 all-out", "description": "16x25m sprints w/ 20s rest.", "main_set": {"reps": 16, "distance_m": 25, "effort": "maximal", "rest_sec": 20}},
      {"id": "swim_speed_8x75", "name": "8 x 75 descending", "description": "8x75m, descending pace across the set. 20s rest.", "main_set": {"reps": 8, "distance_m": 75, "type": "descending", "rest_sec": 20}}
    ],
    "swim_endurance": [
      {"id": "swim_endurance_continuous", "name": "Continuous distance", "description": "Continuous aerobic swim at CSS+12 pace.", "main_set": {"type": "continuous", "pace_source": "css_plus_12"}},
      {"id": "swim_endurance_pull", "name": "Endurance with pull buoy", "description": "Half with pull buoy, half without, at CSS+10 pace.", "main_set": {"type": "continuous_with_tool", "pace_source": "css_plus_10"}}
    ],
    "swim_technique": [
      {"id": "swim_drill_catch", "name": "Catch drill set", "description": "Fingertip drag + catch-up drill + swim. 6 x 100.", "main_set": {"reps": 6, "distance_m": 100, "drills": ["fingertip_drag", "catch_up", "full_stroke"]}},
      {"id": "swim_drill_rotation", "name": "Body rotation drill set", "description": "6 Kick / Side Kick / 6 Kick / Swim. 8 x 75.", "main_set": {"reps": 8, "distance_m": 75, "drills": ["6_kick_switch", "side_kick", "swim"]}},
      {"id": "swim_drill_breathing", "name": "Breathing pattern drill", "description": "Bilateral breathing 3/5/7 stroke patterns. 6 x 100.", "main_set": {"reps": 6, "distance_m": 100, "drills": ["3_stroke_breath", "5_stroke_breath", "7_stroke_breath"]}}
    ]
  },
  "evidence_sources": ["Olbrecht, J. — The Science of Winning", "Laughlin, T. — Total Immersion"],
  "priority": "high",
  "is_active": true
}
```

### New Module: VARIANT_LIBRARY_STRENGTH

```json
{
  "id": "VARIANT_LIBRARY_STRENGTH",
  "category": "training_rules",
  "title": "Strength training variant library — accessories only",
  "version": "1.0",
  "applies_when": {"sport_profile": ["strength", "hybrid", "endurance"]},
  "compound_lift_policy": {
    "rule": "Compound lifts (squat, bench, deadlift, OHP, barbell row) do NOT rotate. They stay the same for 4-6 weeks with progressive overload (+2.5-5 lb/week OR +1 rep/week until the rep range ceiling is hit, then load increase).",
    "rationale": "Skill component in these lifts means consistency is required for measurable strength gains. Rotation actively hurts progress on compounds.",
    "rotation_cadence_weeks": [4, 6],
    "end_of_cycle_behavior": "At end of 4-6 week cycle, swap the compound variant (e.g., back squat -> front squat, bench -> incline bench) to prevent plateau at the movement-pattern level."
  },
  "accessory_rotation_cadence_weeks": [2, 3],
  "variants": {
    "accessory_quad": [
      {"id": "acc_walking_lunge", "name": "Walking lunges", "sets_reps": "3 x 12 per leg", "primary_muscle": "quads", "equipment": "dumbbells"},
      {"id": "acc_bulgarian_split_squat", "name": "Bulgarian split squats", "sets_reps": "3 x 8-10 per leg", "primary_muscle": "quads", "equipment": "dumbbells + bench"},
      {"id": "acc_step_up", "name": "Weighted step-ups", "sets_reps": "3 x 10 per leg", "primary_muscle": "quads", "equipment": "dumbbells + box"},
      {"id": "acc_goblet_squat", "name": "Goblet squats", "sets_reps": "3 x 12-15", "primary_muscle": "quads", "equipment": "dumbbell or kettlebell"},
      {"id": "acc_leg_extension", "name": "Leg extensions", "sets_reps": "3 x 12-15", "primary_muscle": "quads", "equipment": "machine"}
    ],
    "accessory_hamstring_glute": [
      {"id": "acc_rdl", "name": "Romanian deadlifts", "sets_reps": "3 x 10", "primary_muscle": "hamstrings + glutes", "equipment": "barbell or dumbbells"},
      {"id": "acc_hip_thrust", "name": "Hip thrusts", "sets_reps": "3 x 10-12", "primary_muscle": "glutes", "equipment": "barbell + bench"},
      {"id": "acc_glute_bridge", "name": "Single-leg glute bridge", "sets_reps": "3 x 12 per leg", "primary_muscle": "glutes", "equipment": "bodyweight or dumbbell"},
      {"id": "acc_nordic_curl", "name": "Nordic hamstring curl", "sets_reps": "3 x 6-8", "primary_muscle": "hamstrings", "equipment": "partner or band"},
      {"id": "acc_kb_swing", "name": "Kettlebell swings", "sets_reps": "3 x 15-20", "primary_muscle": "posterior chain + power", "equipment": "kettlebell"}
    ],
    "accessory_push": [
      {"id": "acc_db_bench", "name": "DB bench press", "sets_reps": "3 x 10", "primary_muscle": "chest", "equipment": "dumbbells + bench"},
      {"id": "acc_incline_db_press", "name": "Incline DB press", "sets_reps": "3 x 10", "primary_muscle": "upper chest", "equipment": "dumbbells + incline bench"},
      {"id": "acc_pushup_variations", "name": "Push-up variations", "sets_reps": "3 x AMRAP", "primary_muscle": "chest + core", "equipment": "bodyweight"},
      {"id": "acc_lateral_raise", "name": "Lateral raises", "sets_reps": "3 x 12-15", "primary_muscle": "delts", "equipment": "dumbbells"},
      {"id": "acc_tricep_dip", "name": "Tricep dips", "sets_reps": "3 x 10-12", "primary_muscle": "triceps", "equipment": "bench or parallel bars"}
    ],
    "accessory_pull": [
      {"id": "acc_chinup", "name": "Chin-ups", "sets_reps": "3 x AMRAP", "primary_muscle": "lats + biceps", "equipment": "pull-up bar"},
      {"id": "acc_db_row", "name": "Single-arm DB row", "sets_reps": "3 x 10 per side", "primary_muscle": "lats + mid-back", "equipment": "dumbbell + bench"},
      {"id": "acc_face_pull", "name": "Face pulls", "sets_reps": "3 x 15", "primary_muscle": "rear delts + upper back", "equipment": "cable or band"},
      {"id": "acc_hammer_curl", "name": "Hammer curls", "sets_reps": "3 x 12", "primary_muscle": "biceps + brachialis", "equipment": "dumbbells"}
    ],
    "accessory_core": [
      {"id": "acc_plank", "name": "Plank holds", "sets_reps": "3 x 45-60s", "primary_muscle": "anterior core", "equipment": "bodyweight"},
      {"id": "acc_dead_bug", "name": "Dead bugs", "sets_reps": "3 x 10 per side", "primary_muscle": "anti-extension core", "equipment": "bodyweight"},
      {"id": "acc_pallof_press", "name": "Pallof press", "sets_reps": "3 x 12 per side", "primary_muscle": "anti-rotation core", "equipment": "cable or band"},
      {"id": "acc_farmer_carry", "name": "Farmer carries", "sets_reps": "3 x 40m", "primary_muscle": "grip + core stability", "equipment": "dumbbells or kettlebells"},
      {"id": "acc_hanging_knee_raise", "name": "Hanging knee raises", "sets_reps": "3 x 10-15", "primary_muscle": "lower abs + hip flexors", "equipment": "pull-up bar"}
    ]
  },
  "evidence_sources": [
    "Helms, E. — The Muscle and Strength Training Pyramid",
    "Schoenfeld, B. — Science and Development of Muscle Hypertrophy",
    "Biolayne — Exercise Variation for Strength and Hypertrophy",
    "Frontiers — Resistance Training Variables for Optimization of Muscle Hypertrophy (2022)"
  ],
  "priority": "high",
  "is_active": true
}
```

### New Module: VARIANT_LIBRARY_HYBRID

```json
{
  "id": "VARIANT_LIBRARY_HYBRID",
  "category": "training_rules",
  "title": "Hybrid/HIIT/metcon variant library",
  "version": "1.0",
  "applies_when": {"sport_profile": ["hybrid"]},
  "rotation_cadence_by_type": {
    "hybrid_metcon": 1,
    "hybrid_amrap": 1,
    "hybrid_emom": 1,
    "hybrid_chipper": 1
  },
  "variants": {
    "hybrid_metcon": [
      {"id": "hybrid_20min_grind", "name": "20-min grinder", "description": "20 min AMRAP of a 4-5 exercise circuit."},
      {"id": "hybrid_fran_style", "name": "Fran-style", "description": "21-15-9 thrusters + pull-ups. Classic short metcon."},
      {"id": "hybrid_5_rounds", "name": "5 rounds for time", "description": "5 rounds of a 3-4 exercise circuit for time."},
      {"id": "hybrid_cindy", "name": "Cindy-style", "description": "20 min AMRAP of 5 pull-ups, 10 push-ups, 15 air squats."},
      {"id": "hybrid_helen", "name": "Helen-style", "description": "3 rounds: 400m run + 21 KB swings + 12 pull-ups."}
    ],
    "hybrid_amrap": [
      {"id": "hybrid_amrap_10min", "name": "10-min AMRAP", "description": "As many rounds as possible in 10 min."},
      {"id": "hybrid_amrap_15min", "name": "15-min AMRAP", "description": "As many rounds as possible in 15 min."},
      {"id": "hybrid_amrap_20min", "name": "20-min AMRAP", "description": "As many rounds as possible in 20 min."}
    ],
    "hybrid_emom": [
      {"id": "hybrid_emom_10", "name": "10-min EMOM", "description": "Every minute on the minute, 10 rounds."},
      {"id": "hybrid_emom_20", "name": "20-min EMOM", "description": "Every minute on the minute, 20 rounds, alternating movements."}
    ],
    "hybrid_chipper": [
      {"id": "hybrid_chipper_long", "name": "Long chipper", "description": "Single round, 6-8 exercises, high reps (e.g., 100 of each), chip through for time."}
    ]
  },
  "evidence_sources": ["CrossFit training methodology", "HIIT research (Laursen & Buchheit)"],
  "priority": "medium",
  "is_active": true
}
```

### New Module: AI_VARIANT_SELECTOR

```json
{
  "id": "AI_VARIANT_SELECTOR",
  "category": "training_rules",
  "title": "AI-powered variant selection for workout diversification",
  "version": "1.0",
  "applies_when": {"sport_profile": "any", "context": "weekly_plan_generation"},
  "function_signature": {
    "name": "selectVariant",
    "inputs": {
      "userId": "string",
      "sessionTypeId": "string (e.g., track_workout, bike_intervals_ftp)",
      "weekNumber": "int (weeks since plan start)",
      "recentHistory": "array of last 3 weeks of workouts for this session type (variant IDs only)",
      "userProfile": "{experience_level, sport_profile, goal, current_phase}",
      "variantLibrary": "array of variant objects from the appropriate VARIANT_LIBRARY_* module, filtered to variants the user is eligible for based on experience_minimum"
    },
    "output": {
      "variantId": "string — must match an id in the library",
      "rationale": "string — one sentence explaining the pick (for logging/debugging only, not shown to user)"
    }
  },
  "api_call_spec": {
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 200,
    "temperature": 0.3,
    "timeout_ms": 3000,
    "system_prompt": "You are a workout variant picker for IronZ, a training app. You are given a user's context, their recent workout history for one session type, and a library of pre-defined workout variants that all produce the same physiological adaptation. Your ONLY job is to pick ONE variant ID from the library. You MUST NOT invent new workouts. You MUST NOT modify any variant. You MUST NOT return a variant ID that isn't in the provided library. You MUST NOT return a variant the user did in the last 2 weeks unless the library has fewer than 2 unused variants. Respond with valid JSON only: {\"variantId\": \"...\", \"rationale\": \"one short sentence\"}. No prose, no markdown, no explanation outside the JSON.",
    "user_prompt_template": "User experience: {experience_level}\nSport profile: {sport_profile}\nGoal: {goal}\nCurrent training phase: {current_phase}\nWeek number of plan: {weekNumber}\n\nRecent workouts for this session type (most recent first):\n{recentHistory}\n\nSession type: {sessionTypeId}\n\nVariant library:\n{variantLibraryJSON}\n\nPick one variant the user has not done in the last 2 weeks. Return JSON only."
  },
  "validation": {
    "on_response": [
      "Parse JSON. If parse fails, fall back to deterministic rotation.",
      "Confirm variantId exists in the library. If not, fall back to deterministic rotation.",
      "Confirm variantId is not in recentHistory[0:2]. If it is, fall back to deterministic rotation.",
      "Confirm user meets experience_minimum for the chosen variant. If not, fall back."
    ]
  },
  "deterministic_fallback": {
    "algorithm": "variantIndex = weekNumber mod (libraryLength). If the resulting variant is in recentHistory[0:2], advance index by 1 mod libraryLength until a valid variant is found.",
    "always_used_when": [
      "API call fails (network error, 5xx, rate limit)",
      "API call times out (> 3000 ms)",
      "Response fails any validation check",
      "User has disabled AI personalization in settings (future)",
      "Session type is excluded from rotation (e.g., fun_social, easy_recovery)"
    ],
    "logged_as": "fallback_reason: {timeout | api_error | invalid_response | user_disabled | excluded_type}"
  },
  "caching": {
    "key": "user_id + week_start_date + session_type_id",
    "ttl": "7 days (one training week)",
    "storage": "user_data.variant_cache JSONB field",
    "rationale": "Prevents repeat API calls for the same week. Max one call per (user, week, session type)."
  },
  "cost_controls": {
    "max_calls_per_user_per_week": 20,
    "on_limit_hit": "Silently fall back to deterministic rotation for any additional calls in the week",
    "estimated_cost": "< $0.01 per user per week at Haiku pricing"
  },
  "hard_constraints": [
    "NEVER allow the AI to return a variant that doesn't exist in the library",
    "NEVER allow the AI to return a variant the user did within the rotation window",
    "NEVER let a failed API call break plan generation — always fall back deterministically",
    "NEVER make more than one call per (user, week, session type)",
    "NEVER call the selector for excluded session types (easy_recovery, fun_social, compound_lifts)"
  ],
  "evidence_sources": [
    "Engineering judgment based on constrained-choice LLM safety patterns",
    "Variant libraries themselves are Tier 1 evidence-backed"
  ],
  "priority": "critical",
  "is_active": true
}
```

### Updated Module: SESSION_TYPE_LIBRARY

**Version bump:** 1.0 → 1.1 (minor)

```json
{
  "id": "SESSION_TYPE_LIBRARY",
  "field_to_update": "variant_library_reference",
  "action": "add_field",
  "new_value": {
    "reference_module_per_sport": {
      "run": "VARIANT_LIBRARY_RUN",
      "bike": "VARIANT_LIBRARY_BIKE",
      "swim": "VARIANT_LIBRARY_SWIM",
      "strength": "VARIANT_LIBRARY_STRENGTH",
      "hybrid": "VARIANT_LIBRARY_HYBRID"
    },
    "variant_selection_method": "AI_VARIANT_SELECTOR with deterministic fallback"
  },
  "version": "increment_minor",
  "change_log": "2026-04-09: Added variant library references and AI selector integration. Session types now pull variants from per-modality libraries instead of single templates."
}
```

### Updated Modules: SPORT_ENDURANCE_RUNNING, SPORT_ENDURANCE_CYCLING, SPORT_ENDURANCE_SWIMMING, SPORT_STRENGTH, SPORT_HYBRID

**Version bump:** each → +0.1 (minor)
**Note for Claude Code:** If a sport module does not yet exist, create it with the standard schema and put the rules below in `plan_rules`.

```json
{
  "field_to_update": "plan_rules",
  "action": "append",
  "new_rules": [
    "When generating a workout for any session type, first call AI_VARIANT_SELECTOR with the user context and the appropriate VARIANT_LIBRARY_* module to pick a variant.",
    "Pass the selected variant to the workout generator, which personalizes paces/weights using the user's zones.",
    "Cache the variant selection per (user, week, session type) to prevent repeat API calls.",
    "Fall back to deterministic rotation (variantIndex = weekNumber mod libraryLength) if the AI selector fails or times out.",
    "For running: rotate Track/Tempo/Speed/Hills variants every 2 weeks, Long Run variants every 3 weeks.",
    "For cycling: rotate interval variants every 2 weeks.",
    "For swimming: rotate CSS and speed variants every 2 weeks; rotate drill sets every session.",
    "For strength: DO NOT rotate compound lifts (squat, bench, deadlift, OHP, row). Apply progressive overload for 4-6 weeks before swapping the compound variant. Rotate accessories every 2-3 weeks.",
    "For hybrid: rotate metcon/AMRAP/EMOM variants every week."
  ],
  "version": "increment_minor",
  "change_log": "2026-04-09: Added variant library + AI selector integration for workout diversification."
}
```

---

## App Code Changes

### File: `js/variant-libraries/` (NEW DIRECTORY)

**Reason:** Centralizes all variant libraries as static JSON that the app loads at startup. Offline-capable.

**Files:**
- `js/variant-libraries/run.js` — exports the VARIANT_LIBRARY_RUN `variants` object as a const
- `js/variant-libraries/bike.js` — same for cycling
- `js/variant-libraries/swim.js` — same for swimming
- `js/variant-libraries/strength.js` — same for strength accessories
- `js/variant-libraries/hybrid.js` — same for hybrid metcons
- `js/variant-libraries/index.js` — re-exports all five plus a `getLibraryFor(sport, sessionType)` helper

**Behavior:** Pure constants. No logic. No API calls. Loaded at app startup and kept in memory.

### File: `js/ai-variant-selector.js` (NEW FILE)

**Reason:** The AI selector that picks variants. Core new functionality.

**Behavior:**

1. **Exports `selectVariant({ userId, sessionTypeId, weekNumber, recentHistory, userProfile, variantLibrary })` → `{ variantId, rationale, fromFallback }`.**
2. **Cache check first:** Look up `user_data.variant_cache[userId][weekStartDate][sessionTypeId]`. If present, return cached value.
3. **Exclusion check:** If `sessionTypeId` is in the excluded list (`easy_recovery`, `fun_social`, and for strength: any compound lift), skip the API call and go straight to deterministic rotation.
4. **Experience filter:** Filter the variant library to only variants the user is eligible for (check `experience_minimum` field against `userProfile.experience_level`).
5. **Build the prompt:** Inject `userProfile`, `recentHistory`, `sessionTypeId`, and the filtered library into the user prompt template from `AI_VARIANT_SELECTOR`.
6. **API call:**
   ```js
   const response = await fetch('https://api.anthropic.com/v1/messages', {
     method: 'POST',
     headers: {
       'x-api-key': ANTHROPIC_API_KEY, // from secure storage, NEVER in client code
       'anthropic-version': '2023-06-01',
       'content-type': 'application/json'
     },
     body: JSON.stringify({
       model: 'claude-haiku-4-5-20251001',
       max_tokens: 200,
       temperature: 0.3,
       system: SYSTEM_PROMPT,
       messages: [{ role: 'user', content: userPrompt }]
     }),
     signal: AbortSignal.timeout(3000)
   });
   ```
7. **Parse response:** Extract JSON from `response.content[0].text`. If parsing fails, fall back.
8. **Validate:**
   - `variantId` exists in the filtered library
   - `variantId` is not in `recentHistory[0:2]` (unless library has fewer than 2 unused variants)
   - User meets `experience_minimum`
9. **On validation failure:** Log the failure reason, fall back to deterministic rotation.
10. **Cache the result:** Write to `user_data.variant_cache[userId][weekStartDate][sessionTypeId]` with a 7-day TTL.
11. **Return:** `{ variantId, rationale, fromFallback: false }` or `{ variantId, rationale: 'deterministic rotation', fromFallback: true }`.
12. **Cost tracking:** Increment `user_data.variant_selector_calls_this_week`. If > 20, force fallback for the rest of the week.

**Security note:** The Anthropic API key must live in a Supabase Edge Function, not in client code. The client calls an Edge Function which makes the Anthropic API call server-side. Update the `fetch` target to the Edge Function URL accordingly.

### File: `supabase/functions/variant-selector/index.ts` (NEW EDGE FUNCTION)

**Reason:** Server-side wrapper for the Anthropic API call so the API key stays off the client.

**Behavior:**

1. Accepts POST requests with `{ userId, sessionTypeId, weekNumber, recentHistory, userProfile, variantLibrary }` in the body.
2. Validates the request has a valid Supabase auth token.
3. Builds the system prompt and user prompt from `AI_VARIANT_SELECTOR.api_call_spec`.
4. Calls the Anthropic API with the key from environment variable `ANTHROPIC_API_KEY`.
5. Returns `{ variantId, rationale }` or `{ error: 'reason' }` to the client.
6. Deploy flag: `--no-verify-jwt` is NOT needed here; this function requires user auth.
7. Rate limiting: 20 calls per user per week enforced server-side as a defense-in-depth layer.

### File: `js/running-workout-generator.js` (UPDATE)

**Reason:** The generator from the prior session-types spec needs to take a `variantId` instead of picking from a single template.

**Changes:**

1. Update the function signature: `generateRunWorkout({ sessionTypeId, variantId, userZones, experienceLevel, durationOverrideMin = null })` → `{ workout, warnings }`.
2. Look up the variant from `VARIANT_LIBRARY_RUN.variants[sessionTypeId].find(v => v.id === variantId)`.
3. Fill in paces from `userZones` and experience-scaled rep counts from the variant definition.
4. Return the structured workout as before.

### File: `js/bike-workout-generator.js` (NEW FILE)

**Reason:** Equivalent generator for cycling workouts.

**Behavior:** Mirror of `running-workout-generator.js`, but uses `VARIANT_LIBRARY_BIKE` and `userZones.ftp` (and derived power zones via Coggan % FTP).

### File: `js/swim-workout-generator.js` (NEW FILE)

**Reason:** Equivalent generator for swim workouts.

**Behavior:** Mirror, uses `VARIANT_LIBRARY_SWIM` and `userZones.css`.

### File: `js/strength-workout-generator.js` (NEW FILE OR UPDATE EXISTING)

**Reason:** Strength has fundamentally different logic because of the compound-lift exemption.

**Behavior:**

1. **Compound lifts:** Track `user_data.strength_cycle_week` (1–6). Each cycle, use the same compound lift and progress load/reps weekly. At week 6 (or user-configurable 4–6), swap to the next compound variant (back squat → front squat, bench → incline bench). This is deterministic, not AI-selected.
2. **Accessories:** Call `AI_VARIANT_SELECTOR` with the accessory category (quad, hamstring, push, pull, core). Rotate every 2–3 weeks.
3. Combine compounds + accessories into a full strength session.

### File: `js/planner.js` (UPDATE)

**Reason:** The planner needs to call the variant selector during weekly plan generation.

**Changes:**

1. In `generateTrainingWeek(weekNumber, userProfile)`, after determining the session type for each day, call `selectVariant(...)` to get the variant ID.
2. Pass `variantId` to the appropriate sport-specific generator.
3. Cache the (date, session type, variant) triple in `user_data.weekly_plan`.
4. On plan regeneration (e.g., after a threshold week test), call the selector again — new zones may change the optimal variant.

### File: `supabase/migrations/20260409_variant_cache.sql` (NEW MIGRATION)

**Reason:** Add `variant_cache` and `variant_selector_calls_this_week` fields to `user_data` JSONB.

```sql
-- These are JSONB fields inside the existing user_data table; no schema migration needed if user_data is already JSONB.
-- This migration is a DOCUMENTATION of the expected JSONB structure:
-- user_data.variant_cache: {
--   "2026-04-13": {  // weekStartDate
--     "track_workout": { "variantId": "track_1k_i_pace", "rationale": "...", "cachedAt": "2026-04-09T10:00:00Z" },
--     "tempo_threshold": { ... }
--   }
-- }
-- user_data.variant_selector_calls_this_week: { "weekStartDate": "2026-04-13", "count": 7 }
-- user_data.strength_cycle_week: 3

-- No SQL needed; the writes happen through the existing user_data upsert path.
-- But we DO want to add a Supabase function to clean up stale cache entries:

CREATE OR REPLACE FUNCTION cleanup_stale_variant_cache()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE user_data
  SET data = data - 'variant_cache'
  WHERE data->'variant_cache' IS NOT NULL
    AND (
      SELECT MAX((cache_date)::date)
      FROM jsonb_object_keys(data->'variant_cache') AS cache_date
    ) < (NOW() - INTERVAL '30 days');
END;
$$;

-- Run weekly via pg_cron or manually on deploy
```

### File: `js/ui/weekly-plan-view.js` (UPDATE)

**Reason:** Users see different workouts each week but the UX is otherwise unchanged. The `why_text` should occasionally reference the variant naturally.

**Changes:**

1. When rendering a workout card, include the variant name in the title if it's distinctive (e.g., "Track: Yasso 800s" instead of just "Track Workout").
2. The `why_text` can include a subtle variant reference: *"Today is a ladder workout — different distances build different race skills."*
3. No rotation UI. No variant picker. No "skip this variant" button. Users don't see the machinery.

---

## Validation Checklist

- [ ] All 5 `VARIANT_LIBRARY_*` modules inserted into `philosophy_modules` table with `is_active = true`
- [ ] `AI_VARIANT_SELECTOR` module inserted with `is_active = true`
- [ ] `SESSION_TYPE_LIBRARY` version bumped to 1.1 with variant_library_reference field
- [ ] All sport modules (`SPORT_ENDURANCE_RUNNING`, `SPORT_ENDURANCE_CYCLING`, etc.) version-bumped with new plan_rules
- [ ] `js/variant-libraries/` directory created with 5 static JS files matching the JSON specs
- [ ] `js/ai-variant-selector.js` created with cache check, exclusion list, validation, and deterministic fallback
- [ ] Supabase Edge Function `variant-selector` deployed with `ANTHROPIC_API_KEY` env var set
- [ ] Anthropic API key is NOT in client code anywhere
- [ ] `js/running-workout-generator.js` updated to accept `variantId` parameter
- [ ] `js/bike-workout-generator.js`, `js/swim-workout-generator.js`, `js/strength-workout-generator.js` created
- [ ] `js/planner.js` calls variant selector during weekly plan generation
- [ ] Variant cache lives in `user_data.variant_cache` JSONB field
- [ ] Cost control caps enforced: max 20 calls/user/week, forced fallback beyond that
- [ ] Weekly plan UI shows variant name in workout title
- [ ] Cross-device sync works for variant cache (writes to Supabase user_data)

### Golden Test Cases

- [ ] **VDOT 53 intermediate runner, week 0, track workout, no history:**
  - Selector called → returns one of the 6 track variants
  - Cached in user_data.variant_cache
- [ ] **Same runner, week 2, track workout, history = [track_1k_i_pace, track_800_yasso]:**
  - Selector called with recentHistory
  - Returns a variant NOT in [track_1k_i_pace, track_800_yasso]
- [ ] **Same runner, week 2, same session, cache hit:**
  - Selector returns cached value immediately, no API call
- [ ] **API call fails (simulated 500):**
  - Deterministic fallback kicks in
  - Returns `variantIndex = weekNumber mod libraryLength`
  - Logged with `fallback_reason: api_error`
- [ ] **API call times out (> 3000 ms):**
  - Deterministic fallback kicks in
  - Logged with `fallback_reason: timeout`
- [ ] **API returns invalid JSON:**
  - Deterministic fallback kicks in
  - Logged with `fallback_reason: invalid_response`
- [ ] **API returns a variantId not in the library:**
  - Deterministic fallback kicks in
  - Logged with `fallback_reason: invalid_response`
- [ ] **API returns a variant the user did last week:**
  - Deterministic fallback advances the index by 1 until a valid variant is found
  - Logged with `fallback_reason: stale_selection`
- [ ] **Beginner user asks for `track_mile_repeats` (experience_minimum: intermediate):**
  - Experience filter excludes this variant
  - Selector only picks from the subset they're eligible for
- [ ] **User hits 21st API call in a week:**
  - Cost control kicks in
  - Silent fallback to deterministic for the rest of the week
- [ ] **Strength compound lift request (e.g., back squat):**
  - Selector is NOT called (excluded type)
  - Compound lift follows the 4-6 week progressive overload cycle
- [ ] **Strength accessory request (e.g., quad accessory):**
  - Selector IS called with `accessory_quad` library
  - Returns a variant rotating every 2-3 weeks
- [ ] **User has no race on file (no VDOT):**
  - Variant selector still works (it picks structure, not paces)
  - The downstream generator falls back to effort-based labels (from prior session-types spec)
- [ ] **Fun / Social session type:**
  - Selector is NOT called (excluded type)
  - Only one variant exists anyway (`fun_free`)
- [ ] **Week 1 and Week 5 generate the same variant for the same user:**
  - Acceptable — 4-week gap is well beyond the rotation window
  - User sees progress ("last time I did this in 3:05, today 3:02")

---

## Rollback Plan

1. **Disable the selector:** Set `AI_VARIANT_SELECTOR.is_active = false`. The fallback path becomes the primary path — all users get deterministic rotation. Functionality is preserved, just less personalized.
2. **Disable variant libraries:** Set all `VARIANT_LIBRARY_*.is_active = false`. The planner reverts to single-template session types (the pre-diversification behavior from the session types spec).
3. **Revert code paths:**
   - Comment out the `selectVariant(...)` call in `js/planner.js`.
   - Comment out the variant library imports in the workout generators.
4. **Edge function:** Leave the Supabase Edge Function deployed but unused. No data loss.
5. **Cache:** Preserve `user_data.variant_cache` — even if the feature is rolled back, the data is valuable for analytics.
6. **Strength compound cycle:** The 4–6 week compound progression is architecturally independent and can stay in place even if variant libraries are rolled back.

---

## Notes for Claude Code

- **The Anthropic API key MUST live in a Supabase Edge Function.** Never in client code, never in a public env var, never in git. If you can't set up the edge function right now, build the client-side selector with a TODO and keep the feature behind a flag until the edge function is deployed.
- **The AI selector is a constrained-choice problem.** The system prompt is very restrictive for a reason. Don't loosen it. Don't add "feel free to suggest new workouts." The selector picks from a list. Period.
- **Deterministic fallback must always work.** Test it first. Before touching the AI path, verify that the fallback alone produces correct weekly plans. The AI is the cherry on top; the determinism is the cake.
- **Cache aggressively.** One API call per (user, week, session type) is the hard cap. If a user opens the same week twice, no new call. If they regenerate the plan mid-week, the cache invalidates and new calls happen.
- **Strength compounds are exempt.** Don't try to "help" by rotating squat variants every 2 weeks. The research is clear — compound rotation compromises strength gains. Progressive overload on the same compound for 4–6 weeks, then swap.
- **Variant libraries are Tier 1 evidence-backed.** The variants themselves come from Daniels, Coggan, Pfitzinger, etc. Don't edit the variant structures without updating the evidence_sources field and flagging to me.
- **The UX is invisible.** Users don't see the variant selector. They don't see the cache. They don't see the rotation cadence. They just see different workouts each week. If a UI change surfaces any of this machinery, reconsider.
- **Cost estimate:** ~$0.01 per user per week at Haiku pricing. For 10,000 users = $100/week. For 100,000 users = $1,000/week. Factor this into the business model.
