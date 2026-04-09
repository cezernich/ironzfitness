# Philosophy Update Spec: Run Session Type Library + Generator

> Date: 2026-04-09
> Evidence tier: Tier 1 (workout categories and structures from Daniels, Pfitzinger, Magness — well-established coaching literature)
> Modules affected: NEW: SESSION_TYPE_LIBRARY, RUNNING_WORKOUT_GENERATOR. UPDATED: SPORT_ENDURANCE_RUNNING, RUNNING_ZONE_CALCULATIONS (read API only)
> Approved by: Chase (2026-04-09)

---

## Summary

Adds an 8-option session-type picker to the **Add Running Session** flow. The user picks a date and a session type (Easy/Recovery, Endurance, Long Run, Tempo, Track Workout, Speed Work, Hills, Fun/Social). The app deterministically generates a structured workout — warmup, main set, cooldown — using the user's personal pace zones derived from VDOT. If the chosen day already has a planned workout, the app warns the user and asks whether to replace, add, or cancel. The Track Workout type rotates weekly through 800m, 1K, 1200m, and ladder formats so users don't repeat the same session four weeks in a row. Everything is philosophy-first: zero API calls in the generator path.

---

## Evidence

### 1. The Five Daniels Intensities (Tier 1 — Daniels' Running Formula)

Daniels defines five distinct training intensities, each targeting a specific physiological adaptation. Every session-type option in this update maps to one (or a blend) of these intensities:

- **E (Easy):** 65–78% VO2max. Aerobic maintenance, capillarization, recovery.
- **M (Marathon):** 80–84% VO2max. Race-pace endurance for marathoners.
- **T (Threshold):** 88–92% VO2max. Lactate clearance, sustainable race pace ceiling. Cruise intervals (broken into reps with short rest) are safer and more productive than long straight tempos for most amateurs.
- **I (Interval / VO2max):** 95–100% VO2max. Maximum aerobic capacity. Optimal repeat duration 3–5 minutes. 800m–1200m for most recreational runners.
- **R (Repetition):** >100% VO2max. Neuromuscular speed, running economy. Very short reps (90 sec or less), full recovery, no aerobic benefit — pure speed.

Source: Daniels, J. *Daniels' Running Formula* (3rd ed.).

### 2. Track Workouts as Distinct from Speed Work (Tier 1 — coaching consensus)

Track Workouts (I-pace) and Speed Work (R-pace) are often conflated by amateur runners but are physiologically different stimuli:

- **Track / I-pace:** Develops VO2max via medium repeats (800m–1200m) with partial recovery. The runner is breathing maximally throughout. Heart rate climbs across the workout.
- **Speed Work / R-pace:** Develops neuromuscular recruitment via very short repeats (200m–400m) with full recovery. Heart rate stays moderate because the rest is long enough to fully clear lactate. The benefit is mechanical, not metabolic.

Both are valuable. Programmed correctly, they complement each other. Sources: Daniels (*Running Formula*), Magness (*The Science of Running*), Hudson (*Run Faster from the 5K to the Marathon*).

### 3. Hill Workouts as a Separate Stimulus (Tier 2 — coaching consensus, supported by biomechanical research)

Hill repeats deliver VO2max-equivalent cardiovascular load with substantially lower joint impact than flat track work, plus a strength side-benefit from the concentric-dominant uphill action. Pfitzinger and Magness both prescribe a hill phase before track work in periodized plans. The mechanical demand of hill running recruits muscle fibers and reinforces form patterns that flat running misses. Sources: Pfitzinger & Douglas (*Advanced Marathoning*), Magness (*The Science of Running*).

### 4. Track Workout Rotation (Tier 2 — coaching consensus, anti-staleness)

The same track workout repeated four weeks in a row produces diminishing returns (neuromuscular adaptation plateaus, motivation erodes). Coaches rotate distances and structures within the same I-pace bucket: 800m one week, 1K the next, 1200m the third, ladder the fourth. The total volume (sum of hard meters) stays in the same range; only the structure varies. Source: Magness, *The Science of Running*; Pfitzinger, *Advanced Marathoning* (interval rotation chapters).

### 5. Cruise Intervals > Long Straight Tempos for Amateurs (Tier 1 — Daniels)

A 25-minute straight tempo at T-pace is hard to execute correctly — most amateur runners drift too fast in the first 10 minutes and either blow up or finish below T-pace. Cruise intervals (e.g., 4×8 min at T-pace with 90 seconds easy between) accumulate the same total time at threshold while making each rep more executable. Daniels recommends cruise intervals as the default tempo prescription for most runners. Source: Daniels, *Daniels' Running Formula* (cruise interval chapters).

### 6. Long Run as Its Own Category (Tier 1 — universal across coaching methodologies)

Every credible distance-running methodology treats the long run as its own category, distinct from a generic "endurance run." The long run is the longest session of the week, builds capillarization and fueling adaptation, and develops mental durability. It is structurally similar to an Endurance run but is recognized by users as a distinct concept and is programmed differently (only one per week, scaled to weekly mileage, often includes a marathon-pace finish for advanced runners). Sources: Pfitzinger, Daniels, Hudson, Hansons — universal.

---

## Philosophy Document Changes

### Change 1: New Section — Session Type Library

**File:** IronZ_Philosophy_Engine_Spec_v1.0.docx
**Location:** New subsection inside Section 5.2 (Running/Endurance), placed AFTER the threshold weeks section. Suggested heading: **5.X Session Type Library — Run Workout Generation**

ADD THE FOLLOWING:

> ### 5.X Session Type Library — Run Workout Generation
>
> The Add Running Session flow lets a user pick a date and a session type, and the app generates a structured workout using their personal pace zones (derived from VDOT). This is philosophy-first generation: every workout template is defined in `SESSION_TYPE_LIBRARY` and the generator is deterministic. No API calls.
>
> #### The 8 Session Types
>
> | Type | Daniels intensity | Purpose | Default duration | Frequency cap |
> |---|---|---|---|---|
> | Easy / Recovery | E (Z1) | Active recovery, aerobic maintenance | 30–45 min | Unlimited |
> | Endurance Run | E + low M (Z1, low Z2) | Aerobic base, mitochondrial density | 45–75 min | 2–4× / week |
> | Long Run | E with optional M finish | Capillarization, fueling, durability | 75–150 min | 1× / week max |
> | Tempo / Threshold | T (Z3) | Lactate clearance, race pace ceiling | 35–65 min | 1× / week max |
> | Track Workout | I (Z4) | VO2max, race-specific speed | 50–75 min | 1× / week max |
> | Speed Work | R (Z5) | Neuromuscular, economy | 35–55 min | 1× / week max |
> | Hills | Hard effort, Z4 equivalent | Power, strength, injury resilience | 40–60 min | 1× / week max (substitutes for track in hill phase) |
> | Fun / Social | Z1 default, user override | Enjoyment, autonomy | User-defined | Unlimited |
>
> #### Hard Programming Constraints
>
> - **Maximum 3 hard sessions per 7-day window.** Hard = Tempo, Track, Speed Work, Hills, Long Run. (Long Run counts as a hard session because of its volume.)
> - **No back-to-back hard sessions.** Insert at least one Easy/Recovery or Endurance session between any two hard sessions.
> - **No hard session within 24 hours of a Long Run.** Long Run on Sunday means no track on Monday.
> - **Track Workout and Speed Work in the same week is allowed only for advanced runners.** Beginner/intermediate plans get one or the other, not both.
> - **Hills substitute for Track during a hill phase.** Both in the same week is allowed for advanced runners only.
>
> #### Generator Inputs
>
> The generator takes:
> 1. Session type (one of the 8)
> 2. User's current pace zones (from `RUNNING_ZONE_CALCULATIONS`, fed by VDOT)
> 3. User's experience level (`beginner` / `intermediate` / `advanced` from athlete profile)
> 4. Optional duration override (user can drag a slider in the UI)
>
> It returns a structured workout object: an ordered list of phases (warmup → main set → cooldown), each with a target zone, duration or distance, and pace range (or rep+rest pattern for interval sessions).
>
> #### Per-Type Generation Logic
>
> **Easy / Recovery**
> > One phase. Target duration. Z1 pace range from VDOT. Example for VDOT 53 runner, 35-min default: "35 min @ 7:51–8:32/mi. Conversational. Skip if you don't feel recovered." No structure, no warmup/cooldown — the whole run IS the warmup.
>
> **Endurance Run**
> > Single phase, slightly longer than Easy. Z1 main with optional 5–10 min M-pace finish for intermediate+ runners. Example: "60 min steady. First 50 min @ 7:51–8:10/mi (Z1 high). Optional last 10 min @ 7:00–7:10/mi (Z2 marathon)."
>
> **Long Run**
> > Single phase, longest run of the week. Duration scales with weekly mileage and experience. Beginner: 60–90 min. Intermediate: 90–120 min. Advanced: 120–150 min. Optional last 15–25% at M-pace for intermediate+ marathoners. Example: "90 min. First 75 min @ 7:51–8:32/mi (Z1). Last 15 min @ 7:00–7:10/mi (Z2 marathon finish)." Includes a fueling reminder for runs >75 min.
>
> **Tempo / Threshold**
> > Cruise intervals by default (safer than a straight tempo for most users). Structure: WU 15 min easy → 3–5 reps of 6–10 min at T-pace with 60–90 sec jog rest → CD 10 min easy. Total time at T-pace scales with experience: beginner 12–16 min, intermediate 20–28 min, advanced 30–40 min. Example for VDOT 53 intermediate: "WU 15 min easy → 4×8 min @ 6:36–6:51/mi w/ 90s jog → CD 10 min easy." Total ~70 min, 32 min at T.
>
> **Track Workout**
> > Rotates weekly through 4 templates so the user doesn't repeat the same session. Rotation index = weeks since plan start mod 4:
> > - **Week % 4 == 0: 800m repeats.** WU 15 min easy + 4×20s strides → 6–10 × 800m at I-pace w/ 400m jog rest → CD 10 min easy.
> > - **Week % 4 == 1: 1K repeats.** WU 15 min easy + 4×20s strides → 5–7 × 1000m at I-pace w/ 2-min jog rest → CD 10 min easy.
> > - **Week % 4 == 2: 1200m repeats.** WU 15 min easy + 4×20s strides → 4–6 × 1200m at I-pace w/ 3-min jog rest → CD 10 min easy.
> > - **Week % 4 == 3: Ladder.** WU 15 min easy + 4×20s strides → 400m / 800m / 1200m / 800m / 400m at I-pace w/ equal-time jog rest → CD 10 min easy.
> > Rep count at the lower end for beginners, upper end for advanced. All reps at I-pace from VDOT. Example for VDOT 53 (I-pace ~3:00–3:05/800m): "WU 15 min easy + 4×20s strides → 6×800m @ 3:00–3:05 w/ 400m jog → CD 10 min easy."
>
> **Speed Work**
> > Two sub-templates the user can choose between (or the generator picks based on experience):
> > - **R-pace repeats** (default for intermediate+): WU 15 min easy → 6–10 × 200m at R-pace w/ 200m walk recovery → CD 10 min easy. Example: "WU 15 min easy → 8×200m @ 38–40s w/ 200m walk → CD 10 min easy."
> > - **Strides only** (default for beginners or post-recovery week): WU 20 min easy → 8×100m strides at near-sprint with full recovery → CD 5 min easy.
>
> **Hills**
> > Hill repeats at hard effort, equivalent to I-pace stimulus but no pace target (terrain-dependent). Structure: WU 15 min easy to a hill (4–8% grade ideal) → 6–12 × 60–90 sec hard up / easy jog down → CD 10 min easy. Rep count scales with experience (6 for beginners, 12 for advanced). Example: "WU 15 min easy → 8×60s hill repeats hard up / easy down → CD 10 min easy."
>
> **Fun / Social**
> > Single Z1 phase, user-chosen duration. No targets, no structure, no pace prescription. The instruction text is intentionally permissive: "Run by feel for {duration}. No targets. Trail, treadmill, with a friend, with the dog. The point is showing up because you want to." Logs as Z1 by default unless the user enters a different RPE post-session. Critical for adherence and avoiding burnout — users need permission to run without pressure.
>
> #### Conflict Resolution When Adding to a Day with a Planned Workout
>
> When the user picks a date that already has a planned workout, the app surfaces a modal:
>
> > "You already have **{planned workout title}** scheduled for {day}. What do you want to do?"
> > - **Replace it** — Remove the planned workout, add this one. The planner will rebalance the rest of the week.
> > - **Add as a second session** — Both workouts stay on the calendar (double day).
> > - **Cancel** — Don't add this workout.
>
> #### Weekly Stress Check (runs in all paths)
>
> Before saving any session (whether replacing or adding), the generator checks the resulting week against the hard programming constraints above. If saving would violate a constraint, surface a secondary warning:
>
> > "This would put **4 hard sessions** in the week of {date}. The recommended max is 3. Hard sessions in this week so far: {list}. Are you sure you want to save?"
> > - **Save anyway**
> > - **Pick a different day**
> > - **Cancel**
>
> The user can always override the warning — IronZ trusts the athlete — but the warning is mandatory and must explain why.
>
> #### Coaching Tone for Generated Workouts
>
> Each generated workout has a one-line "why" tag below the title that explains the physiological purpose in plain language:
> - Easy: *"Recovery and aerobic maintenance. Going harder today doesn't make you faster — it makes tomorrow worse."*
> - Endurance: *"Building the aerobic engine that everything else runs on."*
> - Long Run: *"Capillaries, fueling practice, mental durability. The single most important workout of the week."*
> - Tempo: *"Raising the pace you can sustain. The goal is comfortably hard, not race effort."*
> - Track: *"VO2max work. This is the session that makes race pace feel manageable."*
> - Speed: *"Neuromuscular speed. Short, sharp, full recovery. Not aerobic — pure mechanics."*
> - Hills: *"Power, strength, and injury resilience in one workout. Lower impact than flat track."*
> - Fun: *"You earned this. No targets. The point is showing up because you want to."*
>
> #### Changelog
>
> 2026-04-09 — Initial 8-type session library and generator added. Track Workout rotates weekly across 800/1K/1200/ladder. Long Run kept separate from Endurance. Conflict resolution and weekly stress check defined.

---

## Supabase Module Changes

### New Module: SESSION_TYPE_LIBRARY

```json
{
  "id": "SESSION_TYPE_LIBRARY",
  "category": "training_rules",
  "title": "Run session type library — workout templates and generator rules",
  "version": "1.0",
  "applies_when": {
    "level": "any",
    "sport_profile": ["endurance", "triathlon", "hybrid"],
    "context": "add_running_session"
  },
  "session_types": [
    {
      "id": "easy_recovery",
      "label": "Easy / Recovery",
      "daniels_intensity": "E",
      "primary_zone": "z1",
      "purpose": "Active recovery and aerobic maintenance",
      "default_duration_min": [30, 45],
      "experience_scaling": {
        "beginner": [25, 35],
        "intermediate": [30, 45],
        "advanced": [35, 50]
      },
      "structure": [
        {"phase": "main", "intensity": "z1", "duration_pct": 1.0, "pace_source": "vdot.e_pace"}
      ],
      "is_hard": false,
      "frequency_cap_per_week": null,
      "why_text": "Recovery and aerobic maintenance. Going harder today doesn't make you faster — it makes tomorrow worse."
    },
    {
      "id": "endurance",
      "label": "Endurance Run",
      "daniels_intensity": "E + low M",
      "primary_zone": "z1",
      "purpose": "Aerobic base building, mitochondrial density",
      "default_duration_min": [45, 75],
      "experience_scaling": {
        "beginner": [40, 55],
        "intermediate": [50, 70],
        "advanced": [60, 90]
      },
      "structure": [
        {"phase": "main", "intensity": "z1", "duration_pct": 0.85, "pace_source": "vdot.e_pace"},
        {"phase": "optional_finish", "intensity": "z2", "duration_pct": 0.15, "pace_source": "vdot.m_pace", "applies_when": {"experience": ["intermediate", "advanced"]}}
      ],
      "is_hard": false,
      "frequency_cap_per_week": 4,
      "why_text": "Building the aerobic engine that everything else runs on."
    },
    {
      "id": "long_run",
      "label": "Long Run",
      "daniels_intensity": "E with optional M finish",
      "primary_zone": "z1",
      "purpose": "Capillarization, fueling practice, mental durability",
      "default_duration_min": [75, 150],
      "experience_scaling": {
        "beginner": [60, 90],
        "intermediate": [90, 120],
        "advanced": [120, 150]
      },
      "structure": [
        {"phase": "main", "intensity": "z1", "duration_pct": 0.80, "pace_source": "vdot.e_pace"},
        {"phase": "optional_mp_finish", "intensity": "z2", "duration_pct": 0.20, "pace_source": "vdot.m_pace", "applies_when": {"experience": ["intermediate", "advanced"]}}
      ],
      "fueling_reminder_threshold_min": 75,
      "is_hard": true,
      "frequency_cap_per_week": 1,
      "why_text": "Capillaries, fueling practice, mental durability. The single most important workout of the week."
    },
    {
      "id": "tempo_threshold",
      "label": "Tempo / Threshold",
      "daniels_intensity": "T",
      "primary_zone": "z3",
      "purpose": "Lactate clearance, sustainable pace ceiling",
      "default_duration_min": [35, 65],
      "experience_scaling": {
        "beginner": {"reps": 2, "rep_duration_min": 8, "rest_sec": 90, "total_t_min": 16},
        "intermediate": {"reps": 4, "rep_duration_min": 8, "rest_sec": 90, "total_t_min": 32},
        "advanced": {"reps": 5, "rep_duration_min": 8, "rest_sec": 60, "total_t_min": 40}
      },
      "structure": [
        {"phase": "warmup", "intensity": "z1", "duration_min": 15, "pace_source": "vdot.e_pace"},
        {"phase": "main_cruise_intervals", "intensity": "z3", "structure": "reps_at_t_pace", "pace_source": "vdot.t_pace"},
        {"phase": "cooldown", "intensity": "z1", "duration_min": 10, "pace_source": "vdot.e_pace"}
      ],
      "is_hard": true,
      "frequency_cap_per_week": 1,
      "why_text": "Raising the pace you can sustain. The goal is comfortably hard, not race effort."
    },
    {
      "id": "track_workout",
      "label": "Track Workout",
      "daniels_intensity": "I",
      "primary_zone": "z4",
      "purpose": "VO2max development, race-specific speed",
      "default_duration_min": [50, 75],
      "rotation_templates": [
        {
          "rotation_index": 0,
          "name": "800m repeats",
          "main_set": {
            "rep_distance_m": 800,
            "rep_count": {"beginner": 6, "intermediate": 8, "advanced": 10},
            "rest_type": "jog",
            "rest_distance_m": 400,
            "pace_source": "vdot.i_pace"
          }
        },
        {
          "rotation_index": 1,
          "name": "1K repeats",
          "main_set": {
            "rep_distance_m": 1000,
            "rep_count": {"beginner": 5, "intermediate": 6, "advanced": 7},
            "rest_type": "jog",
            "rest_duration_sec": 120,
            "pace_source": "vdot.i_pace"
          }
        },
        {
          "rotation_index": 2,
          "name": "1200m repeats",
          "main_set": {
            "rep_distance_m": 1200,
            "rep_count": {"beginner": 4, "intermediate": 5, "advanced": 6},
            "rest_type": "jog",
            "rest_duration_sec": 180,
            "pace_source": "vdot.i_pace"
          }
        },
        {
          "rotation_index": 3,
          "name": "Ladder",
          "main_set": {
            "ladder_distances_m": [400, 800, 1200, 800, 400],
            "rest_type": "equal_time_jog",
            "pace_source": "vdot.i_pace"
          }
        }
      ],
      "rotation_logic": "rotation_index = (weeks_since_plan_start) mod 4",
      "structure": [
        {"phase": "warmup", "intensity": "z1", "duration_min": 15, "includes": "4x20s strides"},
        {"phase": "main_set", "intensity": "z4", "structure": "from rotation_templates"},
        {"phase": "cooldown", "intensity": "z1", "duration_min": 10}
      ],
      "is_hard": true,
      "frequency_cap_per_week": 1,
      "why_text": "VO2max work. This is the session that makes race pace feel manageable."
    },
    {
      "id": "speed_work",
      "label": "Speed Work",
      "daniels_intensity": "R",
      "primary_zone": "z5",
      "purpose": "Neuromuscular speed, running economy",
      "default_duration_min": [35, 55],
      "sub_templates": [
        {
          "id": "r_pace_repeats",
          "name": "200m R-pace repeats",
          "default_for": ["intermediate", "advanced"],
          "main_set": {
            "rep_distance_m": 200,
            "rep_count": {"beginner": 6, "intermediate": 8, "advanced": 10},
            "rest_type": "walk",
            "rest_distance_m": 200,
            "pace_source": "vdot.r_pace"
          }
        },
        {
          "id": "strides_only",
          "name": "Strides",
          "default_for": ["beginner"],
          "main_set": {
            "rep_distance_m": 100,
            "rep_count": 8,
            "rest_type": "full_recovery",
            "pace_target": "near-sprint, controlled form"
          }
        }
      ],
      "structure": [
        {"phase": "warmup", "intensity": "z1", "duration_min": 15},
        {"phase": "main_set", "intensity": "z5", "structure": "from sub_templates"},
        {"phase": "cooldown", "intensity": "z1", "duration_min": 10}
      ],
      "is_hard": true,
      "frequency_cap_per_week": 1,
      "why_text": "Neuromuscular speed. Short, sharp, full recovery. Not aerobic — pure mechanics."
    },
    {
      "id": "hills",
      "label": "Hills",
      "daniels_intensity": "Hard effort, Z4 equivalent",
      "primary_zone": "z4",
      "purpose": "Power, strength, injury resilience",
      "default_duration_min": [40, 60],
      "main_set": {
        "rep_duration_sec": [60, 90],
        "rep_count": {"beginner": 6, "intermediate": 8, "advanced": 12},
        "effort": "hard up, easy jog down",
        "ideal_grade_pct": [4, 8],
        "pace_target": "effort-based, terrain-dependent"
      },
      "structure": [
        {"phase": "warmup", "intensity": "z1", "duration_min": 15, "instruction": "easy jog to a hill"},
        {"phase": "main_set", "intensity": "z4_effort", "structure": "from main_set"},
        {"phase": "cooldown", "intensity": "z1", "duration_min": 10}
      ],
      "is_hard": true,
      "frequency_cap_per_week": 1,
      "substitutes_for": "track_workout (during hill phase)",
      "why_text": "Power, strength, and injury resilience in one workout. Lower impact than flat track."
    },
    {
      "id": "fun_social",
      "label": "Fun / Social",
      "daniels_intensity": "Z1 default, user override",
      "primary_zone": "z1",
      "purpose": "Enjoyment, autonomy, mental break from structure",
      "default_duration_min": [30, 60],
      "structure": [
        {"phase": "main", "intensity": "z1_default", "duration_pct": 1.0, "pace_target": "by feel, no targets"}
      ],
      "is_hard": false,
      "frequency_cap_per_week": null,
      "rpe_user_override": true,
      "why_text": "You earned this. No targets. The point is showing up because you want to.",
      "instruction_text": "Run by feel for {duration} minutes. No targets. Trail, treadmill, with a friend, with the dog. The point is showing up because you want to."
    }
  ],
  "hard_constraints": [
    "Maximum 3 hard sessions per 7-day window. Hard = Tempo, Track, Speed Work, Hills, Long Run.",
    "No back-to-back hard sessions. At least one Easy/Recovery or Endurance day must separate any two hard sessions.",
    "No hard session within 24 hours of a Long Run.",
    "Track Workout AND Speed Work in the same week is allowed only for advanced runners.",
    "Hills substitute for Track during a hill phase. Both in the same week is allowed only for advanced runners.",
    "Long Run frequency is capped at 1 per week, full stop."
  ],
  "conflict_resolution": {
    "trigger": "user adds session on a day that already has a planned workout",
    "modal_options": ["replace", "add_as_second", "cancel"],
    "on_replace": "Remove planned workout. Save new workout. Trigger planner.rebalanceWeek(weekStartDate).",
    "on_add": "Save new workout as second session for that day. Run weekly stress check.",
    "on_cancel": "Discard. No state change."
  },
  "weekly_stress_check": {
    "trigger": "before any save (replace or add path)",
    "rule": "Count hard sessions in the resulting week. If > 3, surface secondary warning modal.",
    "modal_text": "This would put {N} hard sessions in the week of {date}. The recommended max is 3. Hard sessions in this week so far: {list}. Are you sure?",
    "options": ["save_anyway", "pick_different_day", "cancel"],
    "user_can_override": true
  },
  "evidence_sources": [
    "Daniels, J. — Daniels' Running Formula (5 intensities: E/M/T/I/R, cruise intervals)",
    "Pfitzinger, P. & Douglas, S. — Advanced Marathoning (long run, hill phase, periodization)",
    "Magness, S. — The Science of Running (track rotation, hill physiology)",
    "Hudson, B. — Run Faster from the 5K to the Marathon (workout structure)",
    "Hansons — Hansons Marathon Method (cumulative fatigue and long run capping)"
  ],
  "rationale": "Gives users a structured way to add custom sessions that respect the philosophy. The 8-option set covers 95% of run intents without decision fatigue. Track rotation prevents staleness. Conflict resolution and weekly stress check protect users from accidentally overtraining. Generator is fully deterministic — no API calls.",
  "priority": "high",
  "is_active": true
}
```

### New Module: RUNNING_WORKOUT_GENERATOR

```json
{
  "id": "RUNNING_WORKOUT_GENERATOR",
  "category": "training_rules",
  "title": "Deterministic run workout generator — pure function from session type + zones",
  "version": "1.0",
  "applies_when": {
    "level": "any",
    "sport_profile": ["endurance", "triathlon", "hybrid"],
    "context": "add_running_session"
  },
  "inputs": {
    "session_type_id": "one of the 8 from SESSION_TYPE_LIBRARY",
    "user_zones": "from RUNNING_ZONE_CALCULATIONS recalculate() — must include vdot, e_pace, m_pace, t_pace, i_pace, r_pace",
    "experience_level": "beginner | intermediate | advanced",
    "duration_override_min": "optional integer, user-provided slider value"
  },
  "outputs": {
    "workout": {
      "title": "human-readable title",
      "type": "session_type_id",
      "is_hard": "bool",
      "estimated_duration_min": "int",
      "phases": "ordered array of phase objects",
      "why_text": "from SESSION_TYPE_LIBRARY",
      "warnings": "array of any constraint warnings to surface to user"
    }
  },
  "determinism": "Pure function. No API calls. No randomness except the rotation_index for track workouts (which is deterministic from weeks_since_plan_start).",
  "fallback_when_no_vdot": {
    "behavior": "Generator falls back to effort-based descriptions instead of pace targets",
    "prompt_user": "For accurate pace targets, add a recent race result in your profile."
  },
  "evidence_sources": [
    "SESSION_TYPE_LIBRARY (this update)",
    "RUNNING_ZONE_CALCULATIONS (existing module)"
  ],
  "rationale": "Centralizes the generation logic so the UI, the planner, and any future automation all call the same pure function.",
  "priority": "high",
  "is_active": true
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
    "When the user adds a custom session via the Add Running Session flow, generate the workout via RUNNING_WORKOUT_GENERATOR using SESSION_TYPE_LIBRARY templates",
    "Respect SESSION_TYPE_LIBRARY hard_constraints (max 3 hard sessions/week, no back-to-back hard, no hard after long run)",
    "Trigger weekly_stress_check on every save (replace or add path)",
    "If a custom session replaces a planned workout, call planner.rebalanceWeek to redistribute volume across remaining days"
  ],
  "version": "increment_minor",
  "change_log": "2026-04-09: Added Add Running Session generator integration with SESSION_TYPE_LIBRARY and weekly stress check."
}
```

### Updated Module: RUNNING_ZONE_CALCULATIONS

**Version bump:** 1.1 → 1.2 (minor)

```json
{
  "id": "RUNNING_ZONE_CALCULATIONS",
  "field_to_update": "public_api",
  "action": "add_field",
  "new_value": {
    "method": "getZonesForUser(userId)",
    "returns": {
      "vdot": "number",
      "e_pace": "{min_per_mi: [low, high], min_per_km: [low, high]}",
      "m_pace": "{min_per_mi: [low, high], min_per_km: [low, high]}",
      "t_pace": "{min_per_mi: [low, high], min_per_km: [low, high]}",
      "i_pace": "{sec_per_400m: [low, high], sec_per_800m: [low, high], sec_per_km: [low, high]}",
      "r_pace": "{sec_per_200m: [low, high], sec_per_400m: [low, high]}",
      "hr_zones": "array of 5 zones with bpm ranges",
      "tier_used": "max_hr_pct | karvonen | lthr"
    },
    "consumed_by": ["RUNNING_WORKOUT_GENERATOR", "Add Running Session UI", "Weekly plan view"]
  },
  "version": "increment_minor",
  "change_log": "2026-04-09: Exposed getZonesForUser(userId) public API so the workout generator can pull zones in a single call. No change to zone math."
}
```

---

## App Code Changes

### File: `js/session-type-library.js` (NEW FILE)

**Reason:** Centralizes the 8 session type templates as a static module imported by the generator and the UI.

**Behavior:**

1. Exports a constant `SESSION_TYPES` — array of 8 objects matching the structure in the `SESSION_TYPE_LIBRARY` Supabase module above.
2. Exports `getSessionTypeById(id)` — returns the template object for one type.
3. Exports `getHardSessionTypes()` — returns the subset where `is_hard === true`. Used by the weekly stress check.
4. **Important:** This file is the local source of truth. The Supabase module exists for documentation and future remote tweaking, but the app reads from this static file at runtime so the generator stays purely deterministic and offline-capable.

### File: `js/running-workout-generator.js` (NEW FILE)

**Reason:** Pure-function generator that takes a session type + user zones and returns a structured workout. This is the core deliverable.

**Behavior:**

1. **Function signature:** `generateRunWorkout({ sessionTypeId, userZones, experienceLevel, durationOverrideMin = null, weeksSincePlanStart = 0 })` → returns `{ workout, warnings }`.
2. **Step 1 — Load template:** `const template = getSessionTypeById(sessionTypeId)`. Throw if missing.
3. **Step 2 — Resolve experience scaling:** Pick the rep counts, durations, and rest times for the user's experience level from `template.experience_scaling` or per-template equivalents.
4. **Step 3 — Apply duration override:** If `durationOverrideMin` is set and within ±50% of the default, use it. Otherwise warn and clamp.
5. **Step 4 — Build phases:**
   - **For non-interval types** (Easy, Endurance, Long, Fun): single phase, target zone, target duration, pace from `userZones[template.primary_zone]`.
   - **For Tempo:** WU 15 min @ E-pace → N reps of 8 min at T-pace with 60–90s jog rest → CD 10 min @ E-pace.
   - **For Track:** WU 15 min + 4×20s strides → main set from `template.rotation_templates[weeksSincePlanStart % 4]` with paces from `userZones.i_pace` → CD 10 min.
   - **For Speed Work:** WU 15 min → main set from chosen sub-template with paces from `userZones.r_pace` → CD 10 min.
   - **For Hills:** WU 15 min easy → N reps of 60–90s hard up / easy down → CD 10 min.
6. **Step 5 — Enrich:** Add `why_text` from template, calculate `estimated_duration_min`, build `title` (e.g., "Track Workout — 6×800m at I-pace").
7. **Step 6 — Fallback if no VDOT:** If `userZones.vdot` is null/missing, replace pace ranges with effort labels ("hard but controlled", "all-out") and add a warning: "For accurate pace targets, add a recent race result."
8. **Determinism:** No `Math.random()`. No API calls. The track rotation is deterministic from `weeksSincePlanStart`.

### File: `js/add-running-session-flow.js` (NEW FILE OR REWRITE EXISTING UI HANDLER)

**Reason:** Wires the dropdown picker, the generator, and the conflict/stress-check modals.

**Behavior:**

1. **UI:** Dropdown of 8 session types (with the user-friendly labels from `SESSION_TYPE_LIBRARY`). Date picker. Optional duration slider (shows after type is picked, defaults to template midpoint, range = template min to max).
2. **On submit:**
   - Call `userZones = await zoneCalculator.getZonesForUser(userId)`.
   - Call `experienceLevel = athleteProfile.experience_level` (default "intermediate" if missing).
   - Call `weeksSincePlanStart = computeWeeksSincePlanStart(userId)`.
   - Call `result = generateRunWorkout({...})`.
3. **Conflict check:** Look up `plannedWorkoutForDate(date)`. If one exists, show conflict modal with three options (Replace / Add as second / Cancel).
4. **Weekly stress check:** Build the candidate week (existing planned workouts + the new one). Count hard sessions. If > 3, surface stress check modal with three options (Save anyway / Pick different day / Cancel).
5. **Save path:**
   - **Replace:** `await planner.removeWorkout(plannedWorkout.id); await planner.saveWorkout(result.workout, date); await planner.rebalanceWeek(weekStartDate);`
   - **Add as second:** `await planner.saveWorkout(result.workout, date, { allowMultiplePerDay: true });`
6. **Sync:** Write to `user_data.workouts` JSONB and to localStorage cache so the change is visible immediately on all devices.

### File: `js/planner.js`

**Reason:** Needs to expose `rebalanceWeek(weekStartDate)` and `removeWorkout(id)` if they don't already exist.

**Changes:**

1. Add `removeWorkout(workoutId)` — removes a workout from the active plan and from `user_data.workouts`.
2. Add `rebalanceWeek(weekStartDate)` — recalculates the remaining days of the week to redistribute the removed workout's volume across the easy days. Pure function, no API calls. If the user replaced a Long Run with a Track Workout, the rebalance should NOT add a new Long Run automatically (the user made an intentional choice).
3. Add `getWeeklyHardSessionCount(weekStartDate)` — returns the number of hard sessions currently scheduled in the given week. Used by the stress check.

### File: `js/ui/add-session-modal.js` (NEW FILE OR EXTEND EXISTING)

**Reason:** The actual modal component that the user interacts with.

**Behavior:**

1. Renders the dropdown, date picker, and optional duration slider.
2. Renders the generated workout preview (title, phases, paces, why_text) BEFORE the user hits Save — so they see what they're committing to.
3. Renders the conflict modal and the weekly stress check modal as needed.
4. On final save, calls `addRunningSessionFlow.save(...)`.

### File: `js/ui/weekly-plan-view.js`

**Reason:** Custom-added sessions need a visual marker so they're distinguishable from auto-generated planned workouts.

**Changes:**

1. Workouts with `source === "user_added"` get a small "+" badge in the corner.
2. Tapping a user-added workout shows an "Edit / Delete" affordance, while auto-generated workouts show "Edit / Skip / Defer".

### File: `js/zone-calculator.js`

**Reason:** Per the prior threshold week spec, this file should already exist. We need to ensure `getZonesForUser(userId)` is exposed as a clean public API returning the structured object the generator expects.

**Changes:**

1. Export `getZonesForUser(userId)` returning `{ vdot, e_pace, m_pace, t_pace, i_pace, r_pace, hr_zones, tier_used }` per the updated `RUNNING_ZONE_CALCULATIONS` public_api spec.
2. The pace ranges should be returned as `{ min_per_mi: [low, high], min_per_km: [low, high] }` so the UI can switch units without re-querying.

---

## Validation Checklist

- [ ] `SESSION_TYPE_LIBRARY` module inserted into `philosophy_modules` table with `is_active = true`
- [ ] `RUNNING_WORKOUT_GENERATOR` module inserted into `philosophy_modules` table with `is_active = true`
- [ ] `SPORT_ENDURANCE_RUNNING` module version bumped, new plan_rules appended
- [ ] `RUNNING_ZONE_CALCULATIONS` version bumped to 1.2 with public_api field
- [ ] `js/session-type-library.js` created with all 8 session types matching the JSON spec
- [ ] `js/running-workout-generator.js` created as a pure function with NO API calls
- [ ] `js/add-running-session-flow.js` wires generator + conflict modal + stress check modal
- [ ] `js/planner.js` exposes `removeWorkout`, `rebalanceWeek`, `getWeeklyHardSessionCount`
- [ ] `js/zone-calculator.js` exposes `getZonesForUser(userId)` with the structured return shape
- [ ] Add Session UI shows the 8-option dropdown with friendly labels
- [ ] Generated workout preview shows phases, paces, and why_text BEFORE save
- [ ] Conflict modal triggers when day already has a planned workout
- [ ] Weekly stress check triggers when save would create > 3 hard sessions in the week
- [ ] User-added workouts marked with a "+" badge in the weekly plan view
- [ ] Cross-device sync: custom session saves to `user_data.workouts` JSONB and shows on other device after refresh

### Golden Test Cases

- [ ] **VDOT 53 intermediate runner picks Easy / Recovery, no duration override:**
  - Generated workout: 35–40 min single phase @ 7:51–8:32/mi, no warmup/cooldown structure, why_text = "Recovery and aerobic maintenance..."
- [ ] **VDOT 53 intermediate runner picks Tempo:**
  - Generated workout: WU 15 min @ E-pace → 4×8 min @ 6:36–6:51/mi w/ 90s jog → CD 10 min @ E-pace. Total ~70 min, 32 min at T-pace.
- [ ] **VDOT 53 intermediate runner picks Track Workout, week 0 of plan:**
  - Generated workout: WU 15 min + 4×20s strides → 8×800m @ 3:00–3:05 w/ 400m jog → CD 10 min.
- [ ] **Same runner picks Track Workout, week 1 of plan:**
  - Generated workout: WU 15 min + 4×20s strides → 6×1000m @ 3:45–3:52 w/ 2 min jog → CD 10 min.
- [ ] **Same runner picks Track Workout, week 3:**
  - Generated workout: Ladder 400/800/1200/800/400 at I-pace with equal-time jog rest.
- [ ] **VDOT 53 intermediate runner picks Speed Work:**
  - Generated workout: WU 15 min → 8×200m @ 38–40s w/ 200m walk → CD 10 min.
- [ ] **Beginner runner (no VDOT, no race on file) picks Track Workout:**
  - Generator falls back to effort-based labels ("hard, controlled, breathing maximally") instead of pace numbers.
  - Warning surfaces: "For accurate pace targets, add a recent race result."
- [ ] **User picks Tuesday for a Track Workout. Tuesday already has a planned 60 min easy run:**
  - Conflict modal appears with three options.
  - User picks Replace → easy run removed, Track Workout saved, planner rebalances (e.g., shifts 60 min easy volume across Wednesday + Friday easy runs).
- [ ] **User has Track on Tuesday and Long Run on Sunday already this week. User tries to add Tempo on Friday:**
  - Weekly stress check fires: "This would put 3 hard sessions in the week of {date}. The recommended max is 3." → Wait, 3 is the cap. Let me re-check: existing 2 hard + 1 new = 3. That's at the cap, NOT over. No warning. Test passes silently.
- [ ] **User has Track on Tuesday, Tempo on Thursday, Long Run on Sunday. User tries to add Hills on Saturday:**
  - Weekly stress check fires: "This would put 4 hard sessions in the week..." → user can override or cancel.
- [ ] **User has Long Run on Sunday. User tries to add Tempo on Monday:**
  - Constraint check fires: "Tempo within 24 hours of Long Run." → Warning + override option.
- [ ] **User picks Long Run twice in the same week:**
  - Constraint check fires: "Long Run capped at 1 per week." → Hard block (frequency_cap_per_week: 1 with no override allowed).
- [ ] **User picks Fun / Social with no targets:**
  - Generated "workout" is just instruction text. RPE entry available post-session for user override of the default Z1 logging.

---

## Rollback Plan

All changes are additive — no existing modules or behaviors are destructively modified.

1. **Disable new modules:** Set `is_active = false` for `SESSION_TYPE_LIBRARY` and `RUNNING_WORKOUT_GENERATOR` in `philosophy_modules`.
2. **Revert sport modules:** Remove the appended `plan_rules` from `SPORT_ENDURANCE_RUNNING`. Restore prior version number.
3. **Revert RUNNING_ZONE_CALCULATIONS:** Remove the `public_api` field. Restore version 1.1.
4. **Hide UI:** Hide the Add Running Session button or dropdown — the generator file can stay in place as dead code.
5. **No data loss:** Custom user-added workouts stay in `user_data.workouts`. Even if the feature is rolled back, those records remain.

---

## Notes for Claude Code

- **Pure function discipline.** `running-workout-generator.js` must NEVER call the Anthropic API. The whole point is philosophy-first deterministic generation. If you find yourself reaching for an API call, stop and reread the SESSION_TYPE_LIBRARY templates — the answer is in there.
- **Track rotation is deterministic.** Use `weeksSincePlanStart % 4`. No randomness. Two runners on the same plan in the same week should get the same track workout structure (paces will differ by VDOT).
- **Cruise intervals, not straight tempos.** The Tempo session type generates 4×8 min at T-pace with 60–90s jog, NOT a straight 32-min tempo. This is intentional — see the evidence section.
- **Long Run is always 1 per week, hard cap.** Even advanced runners cannot have two Long Runs in the same 7-day window. The frequency_cap_per_week of 1 has no override.
- **Speed Work vs Track Workout are separate.** Don't merge them. R-pace and I-pace are different stimuli.
- **Hills "substitute for" Track during a hill phase** — meaning during a defined hill phase (typically 2–4 weeks early in a build cycle), the planner schedules Hills *instead of* Track. Outside a hill phase, both can coexist for advanced runners only.
- **The Fun / Social type is intentionally permissive.** Don't try to make it "smart." Users need a low-pressure option to maintain adherence. Default to Z1 logging but let the user override RPE post-session.
- **Generator preview before save is critical UX.** The user must see the generated workout (phases, paces, why_text) before they commit. Don't save silently and surprise them.
- **The weekly stress check is a warning, not a block.** Users can always override (except for the Long Run cap). Trust the athlete.
