# IronZ Training Philosophy — Single Source of Truth

> **Version:** 1.6  
> **Last updated:** 2026-04-16  
> **Role:** This document is the editable source of truth for all training, nutrition, and hydration philosophy in IronZ. The app's plan generation, workout builders, and coaching logic derive their rules from this document. Edit this file to change how IronZ trains athletes.

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-16 | 1.0 | Initial consolidation from 6 source files |
| 2026-04-16 | 1.1 | Added: Pre-Base phase, dynamic level progression, risk-performance bias, phase compression rules, global intensity caps, weakness bias system |
| 2026-04-16 | 1.2 | Added: Plateau prevention philosophy (§12.4), strength-for-race-performance rationale (§8.5) |
| 2026-04-16 | 1.3 | Added: Running distance-specific periodization, taper rules, key workouts, and philosophy for 5K/10K/HM/Marathon (§4.5, §6.2, §9.1). Added: Hyrox full philosophy — periodization (§4.6), session types (§5.5), session distribution (§6.3), station training, strength programming, key workouts, equipment substitutions (§9.5). Added: Hyrox hour ceilings (§4.8). Updated RULE_ENGINE_SPEC and PLAN_SCHEMA for running + Hyrox support. |
| 2026-04-16 | 1.4 | Added: Goal-based plan system mapping all 5 UI goals (§2.5). Added: Rolling mesocycle periodization for non-race athletes (§4.9). Added: Goal-based session distribution templates (§6.5) for Get Faster, Build Endurance, Lose Weight, General Fitness. Added: Goal-based hour ceilings (§4.8). Added: Fat loss strength floor rule. Updated RULE_ENGINE_SPEC with raceless arc builder, fat_loss validator rule. Updated PLAN_SCHEMA with new goal enum, planMode field, mesocycle phase type. |
| 2026-04-16 | 1.5 | Added: Half + Full Ironman minimum training frequency of 5 days/week regardless of level (§4.8). Safety valve is shorter/easier sessions within those 5+ days, not dropping below the floor. Enforced in onboarding and defensively in AthleteClassifier. |
| 2026-04-16 | 1.6 | Added §6.1.1 Weekly Placement Rules: anchors (long run / long ride / brick / intensity), hard constraints (no consecutive hard days, no same-discipline adjacent, brick is self-contained — no run/bike stacking), fill order, §8.6 pairing, and reference layouts for 7-day Base/Build/Peak. Both session-assembler and onboarding seeder now conform. |

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [Athlete Classification](#2-athlete-classification)
3. [Training Zones](#3-training-zones)
4. [Periodization](#4-periodization)
5. [Session Types](#5-session-types)
6. [Session Distribution by Sport](#6-session-distribution-by-sport)
7. [Exercise Selection](#7-exercise-selection)
8. [Strength Training](#8-strength-training)
9. [Sport-Specific Philosophy](#9-sport-specific-philosophy)
10. [Nutrition](#10-nutrition)
11. [Hydration](#11-hydration)
12. [Recovery & Adaptation](#12-recovery--adaptation)
13. [Safety Boundaries](#13-safety-boundaries)
14. [Coaching Tone](#14-coaching-tone)

---

## 1. Core Principles

These principles govern every plan IronZ generates. They are non-negotiable.

1. **Consistency beats optimization.** A slightly underdosed plan that gets completed beats an optimal plan that gets abandoned.
2. **80/20 intensity distribution.** Roughly 80% of training volume should be at easy/aerobic intensity (Z1–Z2). The remaining 20% is moderate-to-hard (Z3–Z5). This applies to running, cycling, swimming, and any endurance discipline.
3. **Progressive overload.** Training stress must increase gradually over time. For endurance: max 10% weekly volume increase. For strength: add load or reps week-over-week within a mesocycle.
4. **Recovery is training.** Rest days are mandatory. Every plan includes at least 1 full rest day per week. Deload weeks are required for plans longer than 4 weeks.
5. **Specificity.** Train for what you're racing. A marathon plan prioritizes running volume. A triathlon plan balances swim/bike/run. Strength supports the primary sport, never replaces it.
6. **Individualization.** Plans adapt to the athlete's level, age, goal, equipment, and threshold data. Two different athletes should get materially different plans.
7. **No medical claims.** IronZ provides general wellness guidance. It does not diagnose, prescribe, cure, or treat. Every plan includes a wellness disclaimer.

---

## 2. Athlete Classification

IronZ classifies athletes across multiple dimensions. Classification drives which training rules, volume ranges, and nutrition targets apply.

### 2.1 Sport-Specific Level (Derived from Threshold Data)

Levels are derived from the athlete's threshold data, not self-reported. If no threshold data exists, default to **intermediate** for all sports.

**Swimming — derived from CSS (Critical Swim Speed) pace per 100m:**

| CSS Pace | Level | Profile |
|----------|-------|---------|
| > 2:30 /100m | Novice | Learning strokes, limited endurance |
| 1:45 – 2:30 /100m | Intermediate | Comfortable with laps, knows basic strokes |
| < 1:45 /100m | Competitive | Structured training, multiple strokes |

**Cycling — derived from FTP (Functional Threshold Power) in watts/kg:**

| FTP (w/kg) | Level | Profile |
|------------|-------|---------|
| < 2.0 | Beginner | New to structured cycling |
| 2.0 – 3.5 | Intermediate | Regular rider, familiar with zones |
| > 3.5 | Advanced | Races or does structured power-based training |

**Running — derived from threshold pace or recent race times:**

| Threshold Pace (min/mile) | Level | Profile |
|---------------------------|-------|---------|
| > 10:00 | Beginner | New to running or casual jogger |
| 7:30 – 10:00 | Intermediate | Regular runner, has done races |
| < 7:30 | Advanced | Structured training, competitive |

**Overall level** is the highest sport-specific level across all sports. This drives nutrition and cross-training module selection.

**Fallback:** When no threshold data exists, default to intermediate. Show a prompt: "Set your threshold paces in Settings for more personalized workouts." Do not block workout generation.

### 2.2 Dynamic Level Progression

Athlete levels are not static. Levels update every 4–8 weeks based on training data, not just threshold re-tests:

**Beginner → Intermediate promotion criteria:**
- Training adherence > 80% over a full mesocycle (4 weeks)
- Successfully completes structured training blocks without injury
- Handles at least 1 quality session per week consistently

**Intermediate → Advanced promotion criteria:**
- Handles 2+ quality (Z4/Z5) sessions per week without excessive fatigue
- Demonstrates measurable threshold improvement (faster CSS, higher FTP, faster race time)
- Recovery metrics remain stable under higher training load

**Demotion rules:**
- If adherence drops below 50% for 2+ weeks, consider stepping level down
- After extended break (4+ weeks off), restart one level below previous
- After injury return, restart at Beginner regardless of previous level

### 2.3 Risk–Performance Bias

Each level has a default bias that governs how the system resolves conflicts between safety and performance:

| Level | Bias | What It Means |
|-------|------|--------------|
| Beginner | Safety-first | When in doubt, less intensity, more rest, simpler sessions |
| Intermediate | Balanced | Moderate risk tolerance, progressive challenge |
| Advanced | Performance-first | Push closer to limits, trust athlete self-regulation |

This bias applies to: intensity session frequency, volume progression rate, deload timing, exercise complexity, and zone ceiling selection.

### 2.4 Age-Based Modifications

| Age Group | Modification |
|-----------|-------------|
| Under 30 | No modification (baseline) |
| 30–39 | Rest periods +10%, recovery notes included |
| 40–49 | Rest periods +15%, Z5 work reduced by 20%, warm-up extended by 5 min |
| 50–59 | Rest periods +25%, Z5 work reduced by 40%, max session duration capped at 75% of baseline, warm-up/cool-down mandatory and extended |
| 60+ | Rest periods +40%, no Z5 work unless explicitly advanced level, volume reduced 20%, joint-friendly exercise substitutions |

### 2.5 Goal Mapping and Modifiers

The app presents 5 goals to the user. Each maps to a training archetype that determines plan structure, periodization model, session priority, and nutrition strategy.

**UI Goal → Internal Goal Mapping:**

| UI Goal | Internal Goal | Has Race? | Primary Training Driver | Plan Structure |
|---------|--------------|-----------|------------------------|---------------|
| Train for a Race | race_performance | Yes (required) | Race date drives periodization | Race-based arc (§4.4–§4.6) |
| Get Faster | speed_performance | No | Speed and threshold improvement | Rolling mesocycles (§4.9) |
| Build Endurance | endurance | No | Aerobic base and volume | Rolling mesocycles (§4.9) |
| Lose Weight | fat_loss | No | Caloric deficit + activity volume | Rolling mesocycles (§4.9) |
| General Fitness | general_fitness | No | Balanced, sustainable training | Rolling mesocycles (§4.9) |

**Note:** "Train for a Race" is the ONLY goal that uses the race-based arc builder. All other goals use the rolling mesocycle model (§4.9). A user who selects "Get Faster" may still add races later — at that point, the plan switches to race-based periodization.

**Goal Modifiers — Training Emphasis:**

| Internal Goal | Strength Priority | Cardio Priority | Key Sessions | Intensity Distribution |
|--------------|-------------------|-----------------|-------------|----------------------|
| race_performance | Supports race sport (§8.4) | Sport-specific, race-driven | Race-pace, long run/ride, intervals | 80/20 |
| speed_performance | Moderate — supports power development | High — intervals and threshold are primary | Tempo, intervals, threshold work | 70/30 (more quality) |
| endurance | Low-moderate — maintenance | High — volume is king | Long run/ride, Z2 accumulation | 85/15 (more easy) |
| fat_loss | High — preserves muscle, burns calories | Moderate — frequency matters more than intensity | Strength sessions are key, cardio supports deficit | 80/20 |
| general_fitness | Equal priority with cardio | Equal priority with strength | Balanced mix, variety | 80/20 |

**Goal Modifiers — Nutrition Emphasis:**

| Internal Goal | Calorie Adjustment | Protein Target | Key Nutrition Rule |
|--------------|-------------------|----------------|-------------------|
| race_performance | Maintenance or slight surplus | 0.6–0.8 g/lb | Fuel the work, practice race nutrition |
| speed_performance | Maintenance | 0.7–0.9 g/lb | Support recovery from high-intensity sessions |
| endurance | Maintenance or slight surplus | 0.6–0.8 g/lb | Carbs are fuel, don't undereat on long days |
| fat_loss | –15% to –25% deficit | 0.8–1.2 g/lb | High protein preserves muscle during deficit |
| general_fitness | Maintenance | 0.6–0.8 g/lb | Balanced macros, no extreme targets |

**Critical rule for fat_loss:** Strength sessions are NOT optional for fat loss athletes. Losing weight without strength training means losing muscle. The plan must include at least 2 strength sessions per week regardless of what cardio activities the athlete selected. Cardio supports the caloric deficit, but strength protects the muscle.

### 2.6 Training Frequency Classification

| Available Days/Week | Classification | Strength Split |
|---------------------|---------------|----------------|
| 2–3 | Low frequency | Full body |
| 4–5 | Moderate frequency | Upper/Lower or PPL (if advanced) |
| 6–7 | High frequency | PPL (advanced only; requires good recovery) |

### 2.7 Equipment Access

| Equipment Level | Available Exercises |
|-----------------|-------------------|
| Bodyweight only | canBeBodyweight === true exercises only |
| Dumbbells | Bodyweight + dumbbell exercises |
| Home gym | Bodyweight + dumbbells + pull-up bar + bench + bands |
| Full gym | All exercises |

If no equipment profile is set, assume full gym access (backward compatible — no filtering).

### 2.8 Threshold Refresh

Thresholds should be re-tested every 90 days. If a threshold is stale (>90 days since last update), show a subtle reminder on Add Session / Build Plan screens. The reminder is dismissable for 14 days, then reappears.

---

## 3. Training Zones

### 3.1 Running Zones (VDOT-Based, Jack Daniels 6-Zone Model)

| Zone | Name | Intensity | Purpose | Typical Workouts |
|------|------|-----------|---------|-----------------|
| Z1 | Recovery | Very easy | Active recovery, blood flow | Recovery runs, warm-up/cool-down |
| Z2 | Easy | Conversational | Aerobic base, fat oxidation | Easy runs, long runs (most miles here) |
| Z3 | Marathon | Moderate | Marathon-specific endurance | Marathon pace runs, tempo progression |
| Z4 | Threshold | Comfortably hard | Lactate threshold improvement | Tempo runs, cruise intervals |
| Z5 | Interval | Hard | VO2max development | Track intervals, hill repeats |
| Z6 | Repetition | Very hard / sprint | Speed, neuromuscular power | Short repeats (200–400m), strides |

**Zone derivation:** Zones are calculated from VDOT, which is derived from a recent race result. The user inputs a race distance and time; the app calculates VDOT and derives pace ranges for each zone. If the athlete enters a threshold pace directly (not a race result), VDOT is reverse-calculated from threshold pace.

**Important:** Easy pace is a RANGE (e.g., 8:23–9:13/mile), not a single number. Z1 (Recovery) is everything slower than the slow end of Easy. Z2 IS the Easy range. Most apps get this wrong by treating Easy as a single pace.

**VDOT lookup:** Uses Jack Daniels' formula. Supported input races: 1500m, 1 mile, 3000m, 2 mile, 5K, 10K, 15K, Half Marathon, Marathon.

**Zone paces (example for VDOT 45):**

| Zone | Pace Range |
|------|-----------|
| Z1 Recovery | 10:42 – 11:42 /mile |
| Z2 Easy | 9:18 – 10:18 /mile |
| Z3 Marathon | 8:17 /mile |
| Z4 Threshold | 7:35 /mile |
| Z5 Interval | 6:52 /mile |
| Z6 Repetition | 6:24 /mile |

### 3.2 Cycling Zones (FTP-Based, 7-Zone Model)

| Zone | Name | % FTP | Purpose |
|------|------|-------|---------|
| Z1 | Active Recovery | < 55% | Recovery spin, warm-up/cool-down |
| Z2 | Endurance | 56–75% | Aerobic base, long rides |
| Z3 | Tempo | 76–90% | Muscular endurance |
| Z4 | Threshold | 91–105% | Sustained power at FTP |
| Sweet Spot | — | 88–94% | High aerobic stimulus, manageable fatigue |
| Z5 | VO2max | 106–120% | Short hard repeats |
| Z6 | Anaerobic | > 120% | Very short maximal efforts |

### 3.3 Swimming Zones (CSS-Based)

**CSS (Critical Swim Speed) Test Protocol:**
Swim a 400m time trial (all-out), rest 5–10 minutes, then swim a 200m time trial (all-out). CSS = (400m distance – 200m distance) / (400m time – 200m time). This gives pace per 100m at threshold.

| Zone | Name | Relative to CSS | Purpose |
|------|------|----------------|---------|
| Z1 | Recovery | CSS + 15s/100m or more | Warm-up, cool-down, technique |
| Z2 | Aerobic | CSS + 5–10s/100m | Endurance base |
| Z3 | Threshold | CSS pace | Lactate threshold work |
| Z4 | VO2max | CSS – 3–5s/100m | High-intensity intervals |
| Z5 | Sprint | Max effort | Short speed repeats |

---

## 4. Periodization

### 4.1 General Periodization Principles

All plans longer than 4 weeks use a periodized structure. Training builds progressively through phases, each with a specific purpose. Plans are built backwards from the target race date (A race).

**Phases (in order):**

| Phase | Purpose |
|-------|---------|
| Pre-Base | Ramp-up for returning athletes, post-injury, or those with no recent training. Builds habits and baseline fitness before structured training begins. |
| Base | Aerobic foundation, technique, strength building |
| Build | Sport-specific intensity, race simulation |
| Peak | Race-pace work, sharpening, reduced volume |
| Taper | Volume reduction, maintain intensity, freshness |
| Race Week | Openers, rest, race execution |

**Pre-Base phase rules:**
- Used when: athlete is returning from injury, has been inactive 4+ weeks, or is classified as Beginner with no recent training history
- Duration: 2–4 weeks
- Content: easy aerobic work only (Z1–Z2), general strength foundation, technique focus, habit building
- No quality sessions (Z4+) during Pre-Base
- Transition to Base when adherence is consistent and athlete reports no issues

**Mesocycle length:**
- Beginner: 4-week cycles (3 build + 1 deload)
- Intermediate: 4-week cycles (3 build + 1 deload)
- Advanced: 3–4 week cycles (2–3 build + 1 deload)

**Deload week rules:**
- Volume reduced by 40–60%
- Intensity maintained (keep some quality work, just less of it)
- Purpose: supercompensation, injury prevention, mental freshness

### 4.2 Phase Compression

When weeks-to-race is less than ideal (athlete starts late):

| Priority | Rule |
|----------|------|
| 1 (protect) | Taper — never compress, always preserve full taper |
| 2 (protect) | Peak — preserve as priority for race-readiness |
| 3 (compress first) | Base — compress or skip if necessary |
| 4 (compress moderately) | Build — reduce but maintain key quality sessions |
| 5 (skip if needed) | Pre-Base — drop entirely if athlete has recent training |

If fewer than 6 weeks to race: skip Pre-Base and Base entirely, go straight to a compressed Build → Peak → Taper.

### 4.3 Global Intensity Rules

These caps apply regardless of sport or phase:

| Level | Max Intensity Sessions/Week | Consecutive Hard Days |
|-------|---------------------------|----------------------|
| Beginner | 1 (after initial adaptation period) | Never |
| Intermediate | 2 | Never |
| Advanced | 2–3 | Allowed with recovery protocol |

An "intensity session" is any session with Z4+ work (threshold, intervals, VO2max, race-pace). Easy runs, Z2 rides, and technique swims do not count.

### 4.4 Triathlon Periodization

**Phase ratios (percentage of total training weeks):**

| Phase | % of Total Weeks | Focus |
|-------|-------------------|-------|
| Base | 25% | Aerobic foundation, technique, strength |
| Build | 30% | Sport-specific intensity, race simulation |
| Peak | 25% | Race-pace work, sharpening, reduced volume |
| Taper | 15% | Volume reduction, maintain intensity, freshness |
| Race Week | 5% | Openers, rest, race execution |

**Triathlon volume distribution (swim / bike / run):**

| Distance | Swim | Bike | Run |
|----------|------|------|-----|
| Sprint | 20% | 40% | 40% |
| Olympic | 15% | 45% | 40% |
| Half Ironman | 10% | 55% | 35% |
| Full Ironman | 10% | 55% | 35% |

### 4.5 Running Periodization

**Phase ratios:**

| Phase | % of Total Weeks | Focus |
|-------|-------------------|-------|
| Base | 25% | Easy miles, aerobic foundation, strength 2×/week |
| Build | 35% | Key workouts (tempo, intervals), long run progression |
| Peak | 20% | Race-specific intensity, reduced total volume |
| Taper | 15% | Volume drops 40–60%, intensity stays, sharpness |
| Race Week | 5% | Openers, rest, race day |

**Weekly mileage progression:**
- Max 10% increase per week
- Every 4th week: reduce by 20–30% (deload)
- Long run: never more than 30% of weekly mileage

**Distance-Specific Phase Adjustments:**

| Distance | Base Emphasis | Build Emphasis | Peak Emphasis | Taper Length |
|----------|-------------|---------------|--------------|-------------|
| 5K | Aerobic base + strides, build leg speed early | VO2max intervals (1K repeats, 800s), tempo runs | Race-pace 5K repeats, short sharp intervals | 7–10 days |
| 10K | Aerobic base + tempo introduction | Threshold work (cruise intervals, tempo), longer intervals (1200–2000m) | Race-pace 10K efforts, reduced volume | 10–14 days |
| Half Marathon | Longer easy runs, build weekly mileage | MP progression runs, tempo runs, half-specific long runs | Race-pace half marathon segments in long run | 2 weeks |
| Marathon | Extended base for mileage foundation | MP long runs (last 6–10 mi at MP), progressive tempo | Dress rehearsal long runs, tune-up race | 3 weeks |

**Key Workout Priority by Distance:**

| Distance | #1 Key Workout | #2 Key Workout | Long Run Style |
|----------|----------------|----------------|---------------|
| 5K | VO2max intervals (6–8 × 1000m at Z5) | Tempo run (20–25 min at Z4) | 8–10 miles, steady Z2 |
| 10K | Cruise intervals (4–6 × 1 mile at Z4) | Tempo run (25–35 min at Z4) | 10–14 miles, last 2–3 at Z3 |
| Half Marathon | Tempo run (30–45 min at Z4) | MP long run (last 4–6 mi at Z3) | 13–16 miles with MP segments |
| Marathon | MP long run (14–18 mi with 8–12 at Z3) | Progressive tempo (easy → MP → threshold) | 18–22 miles, last third at MP |

**Taper Rules by Distance:**

For all distances: reduce volume, maintain intensity (keep 1–2 short quality sessions), increase rest.

| Distance | Week -3 | Week -2 | Week -1 | Race Week |
|----------|---------|---------|---------|-----------|
| 5K | Normal training | –20% volume | –40% volume, 2 short speed sessions | 1–2 easy runs + strides, race |
| 10K | –10% volume | –30% volume | –50% volume, 1 short tempo | 1–2 easy runs + strides, race |
| Half Marathon | –20% volume | –40% volume, 1 tempo | –60% volume, short opener | 1 easy run + strides, race |
| Marathon | –25% volume | –40% volume, 1 short MP | –60% volume, 2-mile opener | 1–2 very short easy runs, race |

### 4.6 Hyrox Periodization

**Phase ratios (percentage of total training weeks):**

| Phase | % of Total Weeks | Focus |
|-------|-------------------|-------|
| Base | 30% | Running aerobic base, general strength foundation, learn station movements |
| Build | 35% | Station-specific strength, running intervals, combination workouts |
| Peak | 20% | Race simulations, pacing practice, station transitions under fatigue |
| Taper | 10% | Volume reduction, maintain intensity, sharpen race-day execution |
| Race Week | 5% | Openers, rest, race execution |

**Hyrox-specific periodization notes:**
- Hyrox demands a 50/50 split between running fitness and functional strength/station work
- Base phase builds both independently: running on running days, strength on strength days
- Build phase combines them: run + station circuits, combination workouts
- Peak phase simulates race conditions: full or partial race simulations with transitions
- The biggest Hyrox-specific challenge is maintaining running pace between stations while fatigued — this is trained specifically in Build and Peak phases

### 4.7 Multi-Race Periodization (Race-Based Plans Only)

When an athlete has multiple races, each race gets a priority that determines how the plan adapts around it:

**Race Priority System:**

| Priority | Meaning | Taper | Plan Impact |
|----------|---------|-------|-------------|
| A Race | Season goal, drives entire plan | Full taper (15% of plan weeks) | Plan built backwards from this date |
| B Race | Important but not primary | 5–7 day micro-taper | Carved into Build or Peak phase |
| C Race | Training race, low priority | 2–3 easy days before | Train through it, treat as hard workout |

**Multi-race arc:** The plan is always built backwards from the A race. B-race micro-taper windows are inserted without disrupting the macro periodization structure.

**B-Race Micro-Taper Rules:**

| Timing | Adjustment |
|--------|-----------|
| 3 days pre-race | Reduce run volume 30%, drop long run, keep swim/bike easy |
| Race day | Race as planned |
| 3 days post-race | Easy recovery sessions only, no quality work |
| After recovery | Resume normal training block |

**Lead-in blocks:** If there's a gap between plan start and the first structured phase (e.g., athlete starts 20 weeks out from a race that only needs 16 weeks), fill the gap with a general fitness lead-in block: easy aerobic work, strength foundation, technique focus.

### 4.8 Training Hours by Level and Distance

These ranges act as **weekly hour ceilings**. Session templates define the workout structure, but total weekly hours should not exceed these ranges. If session counts push hours above the ceiling, reduce duration per session.

**Minimum training frequency — Half and Full Ironman:** regardless of level, long-course triathlon plans recommend a floor of **5 training days/week**. Four or fewer days doesn't accumulate enough aerobic stimulus to reach a 70.3 or 140.6 start line safely. Athletes who aren't ready for a given day's prescribed volume should reduce *duration* or *intensity* on that day (short easy swim, Z2 spin, mobility session) rather than skipping the day entirely. 6 and 7 days/week remain options; the hour ceilings below cap total load.

Enforcement is UI-driven: the onboarding counter floors at 5 for Half/Full IM, and a save-time confirm dialog warns the user if the weekly schedule has fewer than 5 active days — it explains the risk and gives the user the choice to proceed or go back. The classifier flags `daysFloorReason` for downstream surfaces but does **not** silently override the user's selection. User autonomy wins once they've been informed.

**Triathlon:**

| Level | Sprint | Olympic | Half Ironman | Full Ironman |
|-------|--------|---------|-------------|-------------|
| Beginner | 4–6 hrs | 6–10 hrs | 8–12 hrs | 12–16 hrs |
| Intermediate | 6–8 hrs | 8–12 hrs | 10–15 hrs | 14–20 hrs |
| Advanced | 8–10 hrs | 10–14 hrs | 12–18 hrs | 16–25+ hrs |

**Running:**

| Level | 5K | 10K | Half Marathon | Marathon | Ultra |
|-------|-----|------|-------------|----------|-------|
| Beginner | 3–4 hrs | 4–5 hrs | 5–7 hrs | 6–10 hrs | — |
| Intermediate | 4–6 hrs | 5–7 hrs | 6–9 hrs | 8–12 hrs | 10–15 hrs |
| Advanced | 5–8 hrs | 6–10 hrs | 8–12 hrs | 10–16 hrs | 12–25+ hrs |

**Hyrox:**

| Level | Hours/Week |
|-------|-----------|
| Beginner | 5–7 hrs |
| Intermediate | 7–10 hrs |
| Advanced | 10–14 hrs |

**Goal-Based Hour Ceilings (Non-Race Plans):**

When there's no race, hour ceilings are driven by goal + level + available days, not race distance.

| Goal | Beginner | Intermediate | Advanced |
|------|----------|-------------|----------|
| speed_performance | 4–6 hrs | 6–9 hrs | 8–12 hrs |
| endurance | 4–7 hrs | 6–10 hrs | 8–14 hrs |
| fat_loss | 4–6 hrs | 5–8 hrs | 6–10 hrs |
| general_fitness | 3–5 hrs | 4–7 hrs | 5–9 hrs |

### 4.9 Rolling Mesocycle Periodization (Non-Race Plans)

When the athlete has no target race ("Get Faster," "Build Endurance," "Lose Weight," or "General Fitness"), the plan cannot work backwards from a race date. Instead, it uses **rolling mesocycles** — repeating 4-week blocks that progress over time.

**Structure:**
Each mesocycle is 4 weeks: 3 progression weeks + 1 deload week. After each mesocycle, the system evaluates the athlete's feedback and adjusts the next mesocycle.

**Mesocycle Phases (repeating):**

| Week | Purpose | Volume | Intensity |
|------|---------|--------|-----------|
| 1 | Introduction | Baseline | Moderate — establish the block's new stimulus |
| 2 | Progression | +5–10% | Add volume or intensity (not both) |
| 3 | Overreach | +5–10% from week 2 | Peak training load for the block |
| 4 | Deload | –40–50% from week 3 | Maintain intensity, cut volume, recover |

**How Goals Shape Each Mesocycle:**

**speed_performance ("Get Faster"):**
- Primary stimulus: quality sessions (tempo, intervals, threshold work)
- Mesocycle progression: increase interval count or duration, not just volume
- Each mesocycle introduces a slightly harder quality session (e.g., 4×1K → 5×1K → 6×1K)
- Strength supports speed: power and plyometric emphasis
- Cardio is the primary focus; strength is secondary (2×/week max)
- Key session: 1 tempo + 1 interval per week (or 1 if beginner)

**endurance ("Build Endurance"):**
- Primary stimulus: Z2 volume accumulation
- Mesocycle progression: increase long session duration and total weekly hours
- Each mesocycle extends the long run/ride by 10–15 minutes
- Quality work is minimal — 1 tempo session per week max to maintain lactate threshold
- Strength supports endurance: muscular endurance, injury prevention (2×/week in first mesocycles, 1×/week later)
- Key session: long run or long ride (depending on selected sports)

**fat_loss ("Lose Weight"):**
- Primary stimulus: strength training + moderate cardio for caloric expenditure
- **Strength is the #1 priority** — at least 2–3 sessions per week, never dropped
- Cardio supports the caloric deficit but doesn't replace strength
- Mesocycle progression: increase strength volume (add sets/reps), keep cardio steady or add modest volume
- Avoid high-intensity cardio when in significant caloric deficit (increases injury risk, cortisol)
- Moderate-intensity cardio (Z2) is preferred — higher frequency, shorter sessions
- Key session: strength (compound lifts to preserve muscle mass)

**general_fitness ("General Fitness"):**
- Primary stimulus: variety and consistency
- Equal priority between strength and cardio — neither dominates
- Mesocycle progression: rotate training stimulus each mesocycle (e.g., Mesocycle 1 = strength emphasis, Mesocycle 2 = cardio emphasis, Mesocycle 3 = mixed)
- Include variety to maintain motivation (don't repeat exact same week structure for more than 4 weeks)
- Key session: whatever the athlete enjoys most — compliance is everything for this goal
- Quality sessions allowed but not required; Z2 cardio and full-body strength are the foundation

**Mesocycle-to-Mesocycle Progression:**

The system adjusts each new mesocycle based on feedback:

| Feedback | Next Mesocycle Adjustment |
|----------|--------------------------|
| "Too easy" for 2+ weeks | Increase baseline volume 5–10%, add 1 quality session if not at cap |
| "Too hard" for 2+ weeks | Decrease baseline volume 10%, remove 1 quality session |
| "Just right" | Progress normally (+5–10% over previous mesocycle baseline) |
| Adherence < 60% | Reduce session count, simplify structure, check if goal still matches |
| Adherence > 90% | Consider adding a session day or extending session duration |

**When a Non-Race Athlete Adds a Race:**

If a "Get Faster" or "Build Endurance" athlete later adds a race to their calendar, the plan transitions from rolling mesocycles to race-based periodization (§4.4–§4.6). The current mesocycle finishes, then the race-based arc takes over. Training already completed counts as base fitness.

**Plan Duration for Non-Race Goals:**

Non-race plans generate 4 weeks at a time (one mesocycle). At the end of each mesocycle, the system can auto-generate the next mesocycle based on feedback and progression rules. There is no fixed "end date" — the plan continues as long as the athlete trains.

---

## 5. Session Types

### 5.1 Running Sessions

| Type | Zone Focus | Description | When Used |
|------|-----------|-------------|-----------|
| Easy / Recovery | Z1–Z2 | Conversational pace, aerobic base | Most runs (80/20 rule) |
| Tempo | Z3–Z4 | Sustained comfortably-hard effort | Build + Peak phases, 1×/week |
| Intervals | Z5 | Hard repeats with recovery jogs | Build + Peak phases, 1×/week |
| Hills | Z4–Z5 | Incline repeats for power | Build phase, replaces intervals sometimes |
| Fartlek | Z2–Z5 | Unstructured speed play | Base + Build phases, variety |
| Long Run | Z2 (mostly) | Longest run of the week | Weekly, all phases |

**Beginner ceiling:** No Z5 work in first 4 weeks. Max Z3–Z4 tempo work.

### 5.2 Cycling Sessions

| Type | Zone Focus | Description |
|------|-----------|-------------|
| Zone 2 Endurance | Z2 | Long aerobic base ride |
| Tempo | Z3 | Sustained 76–90% FTP |
| Threshold | Z4 | FTP intervals (e.g., 2×20 min at FTP) |
| VO2 Intervals | Z5 | Short hard repeats (e.g., 5×3 min at 110% FTP) |
| Sweet Spot | 88–94% FTP | High aerobic stimulus, manageable fatigue |
| Recovery Spin | Z1 | Easy flush ride |
| Long Ride | Z2 | Longest ride of the week |

### 5.3 Swimming Sessions

| Type | Zone Focus | Description |
|------|-----------|-------------|
| Technique | Z1–Z2 | Drill-focused, easy pace |
| Endurance | Z2–Z3 | Continuous aerobic swimming |
| CSS Intervals | Z3–Z4 | Threshold pace repeats |
| Speed / Sprint | Z4–Z5 | Short fast repeats |

**Swim-specific modifiers:**
- Pool size selector: 25m / 50m / 25yd (persists across sessions, affects distance calculations)
- Intensity selector (Easy / Moderate / Hard) modifies volume and rest within each session type
- Stroke variety by level: Novice = freestyle + kick only; Intermediate = free + back + breast; Competitive = all strokes + IM

### 5.4 Strength Sessions

| Type | Description |
|------|-------------|
| Full Body | All movement patterns in one session |
| Upper Body | Horizontal + vertical push/pull + arms |
| Lower Body | Squat + hinge + leg isolation |
| Push | Horizontal push + vertical push + triceps |
| Pull | Horizontal pull + vertical pull + biceps |
| Legs | Squat + hinge + leg isolation |
| Muscle Group | Single focus (chest, back, shoulders, arms, legs) |
| Sport-Specific | Swim/cycling/running strength exercises |

### 5.5 Hyrox Sessions

| Type | Zone Focus | Description | When Used |
|------|-----------|-------------|-----------|
| Easy Run | Z1–Z2 | Aerobic base running, conversational pace | All phases, majority of runs |
| Interval Run | Z4–Z5 | 1K repeats simulating between-station runs | Build + Peak phases |
| Station Circuit | Moderate–Hard | Cycle through 4–8 Hyrox stations with minimal rest | Build + Peak phases |
| Run + Station Combo | Z3–Z4 | Alternate 1K runs with station work (e.g., run 1K → sled push → run 1K → wall balls) | Build + Peak phases, key workout |
| Race Simulation | Race effort | Full or partial Hyrox simulation: all 8 stations with 1K runs between | Peak phase, 1–2 times total |
| Strength | N/A | Heavy compound lifts targeting Hyrox demands (squats, deadlifts, rows, pressing) | All phases, reduces in Peak |
| Recovery Run | Z1 | Short easy run for active recovery | After hard sessions |

### 5.6 Circuit / HIIT Sessions

| Type | Description |
|------|-------------|
| AMRAP | As Many Rounds As Possible in time cap |
| EMOM | Every Minute On the Minute |
| Tabata | 20s work / 10s rest × 8 rounds |
| For Time | Complete prescribed work as fast as possible |
| Benchmark WOD | Named workouts (Murph, Cindy, etc.) |

### 5.6 Other Sessions

| Type | Description |
|------|-------------|
| Brick | Back-to-back disciplines (typically bike → run) for triathlon |
| Yoga / Mobility | Active recovery, flexibility, injury prevention |
| Cross-Training | Non-primary sport activity (rowing, hiking, etc.) |
| Rest | Full rest day — no training |

---

## 6. Session Distribution by Sport

Session templates define how many sessions of each type per week, by training phase. Total hours must stay within the ceiling from Section 4.5.

### 6.1 Triathlon Session Distribution

**Base Phase:**

| Discipline | Sessions/Week | Session Types |
|------------|---------------|--------------|
| Swim | 2 | 1 technique + 1 endurance |
| Bike | 2 | 1 Z2 endurance + 1 long ride |
| Run | 3 | 2 easy + 1 long run |
| Strength | 2 | Full body or upper/lower |
| **Total** | **9** | |

**Build Phase:**

| Discipline | Sessions/Week | Session Types |
|------------|---------------|--------------|
| Swim | 3 | 1 technique + 1 CSS intervals + 1 endurance |
| Bike | 3 | 1 Z2 + 1 threshold/sweet spot + 1 long ride |
| Run | 3 | 1 easy + 1 tempo or intervals + 1 long run |
| Strength | 1 | Maintenance, sport-specific |
| **Total** | **10** | |

**Peak Phase:**

| Discipline | Sessions/Week | Session Types |
|------------|---------------|--------------|
| Swim | 3 | 1 technique + 1 race-pace + 1 endurance |
| Bike | 3 | 1 Z2 + 1 race-pace + 1 long ride (shorter) |
| Run | 3 | 1 easy + 1 race-pace + 1 long run (shorter) |
| Strength | 1 | Maintenance only |
| Brick | 1 | Bike → Run at race effort |
| **Total** | **11** | (but reduced duration per session) |

**Taper Phase:**

| Discipline | Sessions/Week | Session Types |
|------------|---------------|--------------|
| Swim | 2 | 1 technique + 1 short race-pace |
| Bike | 2 | 1 easy + 1 short opener |
| Run | 2 | 1 easy + 1 short opener |
| Strength | 0 | Drop strength in final taper |
| **Total** | **6** | (40–60% volume reduction) |

**Race Week:**

| Discipline | Sessions/Week |
|------------|---------------|
| Swim | 1 short technique/openers |
| Bike | 1 short easy with strides |
| Run | 1 short easy with strides |
| **Total** | **3** |

### 6.1.1 Weekly Placement Rules

The tables above say *how many* sessions of each type per week. This section says *which day* each session lands on. Both the session assembler (for rule-engine plans) and the onboarding schedule seeder (for the Weekly Schedule screen) must follow these rules.

**Anchors (set before any other placement):**

1. **Long Run day** — user-selected in onboarding, or defaults to the latest available training day. Call this `LR`.
2. **Long Ride day** — user-selected, or derived as the latest training day that sits at least 2 days away from `LR`. Call this `LB`.
3. **Brick day** (Build/Peak only) — placed on a day that is ≥2 away from both `LR` and `LB` (non-advanced). Prefers to *replace* an existing plain bike or run day; never stacks on top of one.
4. **Intensity days** (up to 2 for intermediate, up to 3 for advanced) — placed on middle training days with ≥2 days between intensity sessions (non-advanced).

**Hard constraints (enforced in every placement path):**

1. **No consecutive hard days** for beginner/intermediate. "Hard" = long run, long ride, brick, or any Z4+ intensity session. (§4.3)
2. **No same-discipline on adjacent days** unless the session count exceeds what 7 days can fit with spacing (then doubling up on a single day is preferred over adjacency).
3. **Brick is self-contained.** A brick session *is* a bike + run combo. Never place a standalone run or standalone bike on the same day as a brick — it creates redundant volume. The brick replaces whichever of bike/run would otherwise land on that day.
4. **Minimum 1 recovery day per week.** Beginners get full rest; intermediate/advanced get active-recovery (Z1 easy spin / yoga / mobility) per Core Principle #4.
5. **Long run ≤ 30% of weekly running volume.** Enforced in validator; placement should not produce a schedule that forces a violation.

**Same-day pairing (§8.6 applies):**

When a strength session lands on the same day as a cardio session, its focus is dictated by the cardio discipline:

- Swim day → Pull + Core
- Bike day → Legs + Posterior chain
- Run day → Core + Hip stability
- Recovery/easy day → Upper body + Arms

**Fill order (apply in sequence):**

1. Place `LR`, `LB`, and `BR` (brick) on their anchor days.
2. Place intensity sessions on non-anchor middle days with required spacing.
3. Place remaining cardio sessions, spreading disciplines so no two same-discipline days are adjacent (when avoidable).
4. Place strength sessions on a cardio day per §8.6 pairing. Prefer diverse pair types across multiple strength sessions (e.g., one swim-pair + one bike-pair rather than two run-pairs).
5. Empty days become rest (beginner) or active recovery (intermediate/advanced).

**Reference layouts (7-day triathlon, long_run = Wed, long_ride = Sat):**

These are the canonical weekly shapes the placement engine should produce for standard anchor choices. They validate that the rules above yield sensible plans.

| Day | Base (9 sessions) | Build (10 sessions) | Peak (11 sessions) |
|-----|-------------------|---------------------|--------------------|
| Mon | Swim + Strength (pair_swim) | Swim + Strength (pair_swim) | Swim + Strength (pair_swim) |
| Tue | Bike Z2 + Strength (pair_bike) | CSS Intervals (swim) | Race-pace swim |
| Wed | **LONG RUN** | **LONG RUN** | **LONG RUN** |
| Thu | Swim endurance | Sweet Spot (bike) | Race-pace bike |
| Fri | Easy Run | Easy Run | Easy Run |
| Sat | **LONG RIDE** | **LONG RIDE** | **LONG RIDE** |
| Sun | Easy Run | Easy Run | **BRICK** (bike → run) |

For a **6-day** week, drop the Sunday session and mark it active recovery. For a **5-day** week, also merge Mon and Tue into a single double-day (swim + bike Z2 + strength). Use the same anchor offsets (LR, LB) regardless of day count — the shape shifts with the user's picks.

**Edge cases:**

- If `LR` and `LB` are only 2 days apart (minimum allowed gap), the strict reference layout may compress. Prefer spreading the brick and intensity to the far side of `LR` in that case.
- If the user picks `LR` or `LB` outside their training-day set, `selectTrainingDays` adds the picked day and drops a non-anchor weekday to stay within the user's `daysAvailable` count.
- If no non-adjacent weekday exists for the brick (e.g., long_run Wed + long_ride Sat leaves every weekday adjacent to one or the other), the brick placement falls through to the lightest non-long day that does not already hold a run or bike — it's better to skip the brick entirely than to create a run + brick or bike + brick double.

### 6.2 Running Session Distribution

**Base Phase:**

| Type | Sessions/Week |
|------|---------------|
| Easy runs | 3 |
| Long run | 1 |
| Strength | 2 |
| Cross-training | 1 (optional) |
| **Total** | **6–7** |

**Build Phase:**

| Type | Sessions/Week |
|------|---------------|
| Easy runs | 2–3 |
| Tempo or threshold | 1 |
| Intervals or hills | 1 |
| Long run | 1 |
| Strength | 1 |
| Cross-training | 1 (optional) |
| **Total** | **6–8** |

**Peak Phase:**

| Type | Sessions/Week |
|------|---------------|
| Easy runs | 2 |
| Race-pace work | 1 |
| Intervals (reduced) | 1 |
| Long run (race-specific) | 1 |
| Strength | 1 (maintenance) |
| **Total** | **5–6** |

**Taper Phase:**

| Type | Sessions/Week |
|------|---------------|
| Easy runs | 2–3 |
| Short race-pace opener | 1 |
| **Total** | **3–4** |

**Distance-Specific Session Distribution Overrides:**

The templates above are the default. For specific race distances, apply these adjustments:

**5K — Build/Peak override:**
- Replace 1 tempo session with VO2max intervals (Z5: 800m–1K repeats)
- Keep 1 tempo session (shorter, sharper: 15–20 min)
- Long run stays moderate length (8–10 mi) — not the primary stimulus
- Add strides (6–8 × 100m) after 1–2 easy runs per week

**10K — Build/Peak override:**
- Primary key workout: cruise intervals (mile repeats at Z4) or continuous tempo (25–35 min)
- Secondary key workout: longer intervals (1200–2000m at Z5) or fartlek
- Long run can include the last 2–3 miles at Z3 (marathon pace effort)

**Half Marathon — Build/Peak override:**
- Primary key workout: tempo run (30–45 min at Z4) or MP progression
- Secondary key workout: long run with half marathon pace segments (last 4–6 mi at Z3)
- Easy runs emphasize time on feet, slightly longer than 5K/10K plans
- Add 1 MP long run every 2–3 weeks

**Marathon — Build/Peak override:**
- Primary key workout: marathon-pace long run (14–18 mi with 8–12 at Z3)
- Secondary key workout: progressive tempo (start easy, finish at threshold)
- Long run is THE key session — peaks at 20–22 miles
- Midweek medium-long run (10–12 mi easy) replaces one short easy run
- Total weekly mileage is higher; distribute carefully to avoid injury

### 6.3 Hyrox Session Distribution

**Base Phase:**

| Type | Sessions/Week | Details |
|------|---------------|---------|
| Easy runs | 3 | Z1–Z2, build aerobic base for the 8 × 1K runs |
| Strength | 2–3 | Heavy compound: squats, deadlifts, rows, overhead press, lunges |
| Station practice | 1 | Learn station movements at low intensity, focus on form |
| Cross-training | 1 (optional) | Rowing, SkiErg, or cycling for aerobic variety |
| **Total** | **6–8** | |

**Build Phase:**

| Type | Sessions/Week | Details |
|------|---------------|---------|
| Easy runs | 2 | Z1–Z2 |
| Interval runs | 1 | 6–8 × 1K at race pace with 60–90s rest (simulates between-station runs) |
| Station circuit | 1 | 4–8 stations, moderate-high intensity, timed |
| Run + Station combo | 1 | Alternate 1K runs with 2–3 stations — the KEY Hyrox workout |
| Strength | 1–2 | Shifts toward power and muscular endurance (higher reps, shorter rest) |
| **Total** | **6–8** | |

**Peak Phase:**

| Type | Sessions/Week | Details |
|------|---------------|---------|
| Easy runs | 2 | Z1–Z2 |
| Race-pace combo | 1 | Full or half race simulation: all stations + 1K runs at race effort |
| Interval runs | 1 | 4–6 × 1K at slightly faster than race pace |
| Station circuit | 1 | Race-intensity, focus on transitions and pacing |
| Strength | 1 | Maintenance only — preserve strength, don't add fatigue |
| **Total** | **5–7** | |

**Taper Phase:**

| Type | Sessions/Week | Details |
|------|---------------|---------|
| Easy runs | 2 | Short, Z1–Z2 |
| Short opener combo | 1 | Abbreviated run + 3–4 stations at race pace, stay sharp |
| **Total** | **3–4** | |

### 6.4 Brick Workout Guidelines (Triathlon)

- **Frequency:** 1 per week during Build and Peak phases, 0 during Base and Taper
- **Format:** Almost always Bike → Run (T2 practice)
- **Recovery:** Brick days count as high-stress days. Follow with easy day or rest.

**Brick Progression:**

| Phase | Bike Portion | Run Portion | Effort |
|-------|-------------|-------------|--------|
| First bricks | 30 min easy | 10 min easy | Both easy, learn transition |
| Mid-Build | 45–60 min moderate | 15–20 min easy-moderate | Bike harder, run easy |
| Late Build | 60–90 min at race effort | 20–30 min at race effort | Race simulation |
| Peak | Full race distance bike | 20–30 min at race pace | Full race rehearsal |

Start short and easy. The first few bricks are about learning to run on tired legs, not about fitness. Build to race-simulation bricks over 6–8 weeks.

### 6.5 Goal-Based Session Distribution (Non-Race Plans)

These templates apply when the athlete has no target race. The athlete selects their activities (running, cycling, strength, etc.) and the goal determines how those activities are weighted and structured.

**"Get Faster" (speed_performance) — Example: Runner, 5 days/week**

| Type | Sessions/Week | Notes |
|------|---------------|-------|
| Easy runs | 2 | Z1–Z2, recovery between quality days |
| Tempo or threshold | 1 | KEY — drives lactate threshold improvement |
| Intervals (Z5) | 1 | KEY — drives VO2max |
| Long run | 1 | Moderate length, Z2, supports recovery capacity |
| Strength | 1–2 | Power-oriented, supports speed |
| **Total** | **5–6** | |

If the athlete selected running + cycling, replace 1 easy run with a Z2 ride or sweet spot session. If running + strength only, keep the template as-is but ensure strength supports the speed goal (power, plyometrics).

**"Build Endurance" (endurance) — Example: Runner + Cyclist, 5 days/week**

| Type | Sessions/Week | Notes |
|------|---------------|-------|
| Easy runs | 2 | Z1–Z2 |
| Long run | 1 | KEY — progressively longer each mesocycle |
| Z2 ride or long ride | 1 | KEY — aerobic volume |
| Tempo | 0–1 | Optional, maintains threshold |
| Strength | 1 | Muscular endurance, injury prevention |
| **Total** | **5–6** | |

The emphasis is volume at low intensity. Don't add intervals unless the athlete asks or feedback says "too easy."

**"Lose Weight" (fat_loss) — Example: Any activities, 5 days/week**

| Type | Sessions/Week | Notes |
|------|---------------|-------|
| Strength | 2–3 | KEY — compound lifts, preserve muscle mass |
| Easy cardio (run, bike, or cross-train) | 2–3 | Z2, moderate duration, burns calories |
| Long session (any activity) | 0–1 | Optional longer Z2 session for caloric burn |
| HIIT/Circuit | 0–1 | Optional, only if intermediate+ and not in steep deficit |
| **Total** | **4–6** | |

Strength always fills first. Remaining days get cardio. If the athlete only selected running as their activity, the plan is: 2–3 strength days + 2–3 easy runs. The runs support the deficit; the strength protects the muscle. Never drop below 2 strength sessions for this goal.

**"General Fitness" (general_fitness) — Example: Any activities, 4 days/week**

| Type | Sessions/Week | Notes |
|------|---------------|-------|
| Strength | 2 | Full body, moderate intensity, compound movements |
| Cardio (any selected activity) | 2 | Z2, enjoyable, varied |
| Optional variety day | 0–1 | Yoga, circuit, cross-training, or an extra run/ride |
| **Total** | **4–5** | |

Equal split between strength and cardio. Variety is important for this goal — rotate activities across mesocycles. If the athlete selected multiple cardio activities, alternate them (Monday = run, Thursday = bike, etc.).

**Adapting to Athlete's Selected Activities:**

The athlete selects which activities they want to do (running, cycling, swimming, strength). The goal templates above assume specific examples, but the system must adapt:

| Athlete Selects | How to Fill Cardio Slots |
|----------------|------------------------|
| Running only | All cardio slots are runs (easy, long, intervals, tempo) |
| Running + Cycling | Split cardio slots between run and bike (alternate or by preference) |
| Running + Cycling + Swimming | Rotate all three; prioritize the athlete's preferred or weakest sport |
| Strength only (no cardio selected) | All sessions are strength; add light cardio warm-ups (10 min row/bike) to strength sessions |
| Cardio only (no strength selected) | Still include 1–2 strength sessions if goal is fat_loss; otherwise respect the athlete's choice |

---

## 7. Exercise Selection

### 7.1 Movement Patterns

All exercises are classified by movement pattern:

| Pattern | Examples |
|---------|---------|
| Squat | Barbell Back Squat, Goblet Squat, Bulgarian Split Squat |
| Hinge | Deadlift, Romanian Deadlift, Kettlebell Swing |
| Horizontal Push | Bench Press, Push-Up, Dumbbell Fly |
| Horizontal Pull | Barbell Row, Cable Row, Rear Delt Fly |
| Vertical Push | Overhead Press, Lateral Raise, Arnold Press |
| Vertical Pull | Pull-Up, Lat Pulldown |
| Core | Plank, Dead Bug, Pallof Press, Ab Wheel |
| Carry | Farmer Walk, Suitcase Carry |
| Isolation – Arms | Bicep Curl, Tricep Pushdown |
| Isolation – Legs | Calf Raise, Leg Curl, Hip Thrust |

### 7.2 Exercise Tiers

| Tier | Role | Selection Probability | Usage |
|------|------|----------------------|-------|
| Primary | Main compound lifts | 2× more likely than Secondary | Main lift slots, compound days |
| Secondary | Supporting compounds | 2× more likely than Tertiary | Secondary slots, variety |
| Tertiary | Accessories, isolation | Baseline probability | Accessory slots only, never as main lift |

Within each sub-target group, Primary exercises are picked 2× more often than Secondary, and Secondary 2× more often than Tertiary. This ensures compound movements dominate while still providing variety.

### 7.3 Sub-Target Diversity

When picking multiple exercises from the same movement pattern, IronZ enforces sub-target diversity. This prevents sessions like "3 incline presses for chest day." The system round-robins across unique sub-targets before repeating any.

**Sub-target mapping by movement pattern:**

| Pattern | Sub-Targets |
|---------|------------|
| Squat | quads-glutes (general), quads-emphasis, quads-glutes-adductors |
| Hinge | posterior-chain (general), glutes-hip-extension, hamstrings-knee-flexion, erectors-lower-back |
| Horizontal Push | general (flat bench), upper-chest, lower-chest, chest-isolation, triceps |
| Vertical Push | overhead-strength (general), side-delts, front-delts, rear-delts-scapular |
| Horizontal Pull | mid-back-lats (general), rear-delts-scapular |
| Vertical Pull | lats-vertical (general) |
| Core | core-stability (general), anti-rotation, obliques, lower-abs-hip-flexors, rectus-abdominis |
| Carry | general, obliques, overhead-strength |
| Isolation – Arms | biceps, triceps, biceps-brachialis |
| Isolation – Legs | calves, hamstrings-knee-flexion, glutes-hip-extension, glute-medius, adductors |

### 7.4 Equipment Matching

- If exercise `canBeBodyweight === true` → always available regardless of equipment profile
- If exercise `canBeBodyweight === false` → ALL items in `equipmentNeeded` must be in the user's equipment list
- If no equipment profile is set → no filtering (full library available, assumes gym access)

**Canonical equipment tokens:**

bodyweight, dumbbells, barbell-rack, kettlebell, pull-up-bar, bench, cable-machine, functional-trainer, leg-press, leg-curl, leg-extension, smith-machine, ghd, ab-wheel, band, jump-rope, med-ball, rowing-machine, ski-erg, sled, sandbag, trap-bar, weight-plate, hip-abductor-adductor, chest-press-machine, chest-fly-machine, shoulder-press-machine, lat-pulldown, seated-row

### 7.5 Slot Templates

Strength sessions use slot templates that define the shape of the workout, not just "pick N exercises."

**Example — Chest-Focused Session:**

| Slot | Role | Pattern | Tier | Diversity Constraint |
|------|------|---------|------|---------------------|
| 1 | Main compound | horizontal-push | Primary | — |
| 2 | Secondary compound | horizontal-push | Secondary | Different sub-target than slot 1 |
| 3 | Isolation | horizontal-push | Tertiary | Different sub-target than slots 1 & 2 |

**Example — Leg Day:**

| Slot | Role | Pattern | Tier | Diversity Constraint |
|------|------|---------|------|---------------------|
| 1 | Main squat | squat | Primary | — |
| 2 | Main hinge | hinge | Primary | — |
| 3 | Secondary squat | squat | Secondary | Different sub-target than slot 1 |
| 4 | Accessory hinge | hinge | Secondary/Tertiary | Different sub-target than slot 2 |
| 5 | Leg isolation | isolation-legs | Any | — |

**Example — Push Day:**

| Slot | Role | Pattern | Tier |
|------|------|---------|------|
| 1 | Main horizontal | horizontal-push | Primary |
| 2 | Main vertical | vertical-push | Primary |
| 3 | Secondary push | horizontal-push | Secondary (diverse from slot 1) |
| 4 | Accessory | vertical-push | Secondary/Tertiary |
| 5 | Isolation | isolation-arms (triceps) | Any |

**Example — Pull Day:**

| Slot | Role | Pattern | Tier |
|------|------|---------|------|
| 1 | Main horizontal | horizontal-pull | Primary |
| 2 | Main vertical | vertical-pull | Primary |
| 3 | Secondary pull | horizontal-pull | Secondary (diverse from slot 1) |
| 4 | Accessory | vertical-pull | Secondary/Tertiary |
| 5 | Isolation | isolation-arms (biceps) | Any |

**Example — Full Body:**

| Slot | Role | Pattern | Tier |
|------|------|---------|------|
| 1 | Squat | squat | Primary |
| 2 | Hinge | hinge | Primary |
| 3 | Push | horizontal-push | Primary/Secondary |
| 4 | Pull | horizontal-pull or vertical-pull | Primary/Secondary |
| 5 | Core or carry | core or carry | Any |

---

## 8. Strength Training

### 8.1 Split Design by Frequency

| Days/Week | Beginner | Intermediate | Advanced |
|-----------|----------|-------------|----------|
| 2 | Full Body | Full Body | Full Body |
| 3 | Full Body | Upper/Lower | Upper/Lower |
| 4 | Upper/Lower | Upper/Lower | PPL |
| 5 | Upper/Lower | PPL | PPL |
| 6 | PPL | PPL | PPL |

### 8.2 Volume Guidelines

| Level | Sets/Muscle Group/Week | Rep Ranges | Rest Between Sets |
|-------|----------------------|------------|-------------------|
| Beginner | 8–12 | 8–12 (moderate) | 60–90s |
| Intermediate | 12–18 | 6–12 (varied) | 90–120s |
| Advanced | 16–22 | 3–12 (periodized) | 120–180s |

**Volume increase cap:** Max 4 additional sets per muscle group per week, week-over-week.

### 8.3 Exercise Complexity by Level

| Level | Exercises per Session | Complexity |
|-------|----------------------|-----------|
| Beginner | 3–5 | Basic compound movements, machines OK |
| Intermediate | 5–7 | Compound + isolation, free weights preferred |
| Advanced | 6–8 | Complex movements, advanced techniques (drop sets, supersets) |

### 8.4 Strength Periodization Within Endurance Plans

When strength supports an endurance sport (triathlon, running, cycling):

| Phase | Strength Focus | Frequency |
|-------|---------------|-----------|
| Base | General strength, hypertrophy, full range of motion | 2–3×/week |
| Build | Sport-specific strength, power, moderate volume | 1–2×/week |
| Peak | Maintenance only, low volume, high intensity | 1×/week |
| Taper | Drop entirely or 1× very light maintenance | 0–1×/week |

### 8.5 How Strength Training Improves Race Performance

Strength training isn't just for aesthetics — it directly improves endurance race performance. The plan rationale should explain these connections to athletes so they understand why they're squatting when training for a triathlon.

**Running:**

| Strength Focus | Race Benefit |
|----------------|-------------|
| Single-leg exercises (lunges, step-ups, Bulgarian splits) | Corrects imbalances, reduces injury risk at high mileage |
| Hip extension power (hip thrusts, deadlifts) | More force per stride = faster pace at same effort |
| Calf raises (heavy, full ROM) | Ankle stiffness improves running economy, reduces Achilles injury risk |
| Core stability (planks, Pallof press, dead bugs) | Prevents energy leaks in late-race fatigue, maintains form |
| Plyometrics (box jumps, bounding — advanced only) | Rate of force development → speed |

**Cycling:**

| Strength Focus | Race Benefit |
|----------------|-------------|
| Squats and leg press (heavy compound) | Max force per pedal stroke = more watts at same RPE |
| Single-leg deadlifts | Pedaling symmetry, reduces dominant-leg compensation |
| Hip flexor strength | Powers the upstroke, especially at high cadence |
| Core stability | Stable platform for power transfer, prevents lower back fatigue on long rides |
| Glute activation (hip thrusts, glute bridges) | Primary driver of the down-stroke power phase |

**Swimming:**

| Strength Focus | Race Benefit |
|----------------|-------------|
| Lat pulldowns, pull-ups | Stronger pull phase = more distance per stroke |
| Cable rotations, band pull-aparts | Shoulder stability, injury prevention in repetitive overhead motion |
| Core anti-rotation (Pallof, woodchops) | Body position in water, reduces drag |
| Scapular stability (face pulls, Y-raises) | Protects shoulders from overuse injury |
| Tricep work | Powers the push phase of the stroke, especially in butterfly and freestyle catch |

**General principles for strength-in-endurance:**
- Heavy compound movements (3–6 rep range) in Base phase build maximal strength that converts to race-specific power
- Sport-specific strength in Build phase (single-leg for running, high-force for cycling, pull-dominant for swimming)
- Maintenance in Peak phase preserves gains without adding fatigue
- Strength benefits compound over time — athletes who skip it plateau faster (see Section 12.4)

### 8.6 Same-Day Strength + Cardio Pairing

When strength and cardio fall on the same day, pair them by muscle group relevance:

| Cardio Discipline | Recommended Strength Focus | Rationale |
|-------------------|--------------------------|-----------|
| Swim day | Pull + Core | Supports pulling power, shoulder stability |
| Bike day | Legs + Posterior chain | Supports pedaling force, hip extension |
| Run day | Core + Hip stability | Supports ground force, injury prevention |
| Rest/Easy day | Upper body, arms | No interference with sport-specific fatigue |

**Ordering:** If both sessions are on the same day, do the priority session first. During Base: strength first, cardio second (building strength). During Build/Peak: cardio first, strength second (cardio quality matters more).

### 8.7 Weight Input Logic

| Exercise Property | UI Behavior |
|-------------------|------------|
| usesWeights === true | Always show weight input (sets × reps × weight) |
| usesWeights === false | Show reps or time only, no weight field |
| canBeBodyweight === true AND usesWeights === true | Toggle between weighted and bodyweight mode |

---

## 9. Sport-Specific Philosophy

### 9.0 Weakness Bias System (Multi-Sport Athletes)

For triathletes and multi-sport athletes, the system identifies the athlete's weakest discipline and applies a bias to address it:

**How weakness is identified:**
- Compare sport-specific levels (swim novice vs. run advanced = swim is weakness)
- Compare race split performance against peers at same level
- Self-reported weakness from profile

**Weakness bias adjustments (pick one, never stack):**
- Add +1 session per week in the weak discipline, OR
- Upgrade an existing session type (e.g., easy swim → CSS intervals), OR
- Increase technical focus in the weak discipline (more drill work, form cues)

**Critical rule:** Never increase running frequency first when addressing a weakness. Running has the highest injury risk per additional session. If run is the weakness, upgrade session quality (add tempo or intervals) rather than adding a 4th or 5th run day. Swim and cycling are safer to add frequency.

### 9.1 Running

**Key principles:**
- 80/20 rule: 80% easy (Z1–Z2), 20% quality (Z3+)
- Long run never exceeds 30% of weekly mileage
- Max 10% weekly mileage increase
- One key workout per week in Base, two in Build/Peak
- Every 4th week: deload (reduce volume 20–30%)

**Race distance specifics:**

| Distance | Key Workouts | Long Run Peak |
|----------|-------------|---------------|
| 5K | Intervals (1K repeats), tempo | 8–10 miles |
| 10K | Tempo, cruise intervals | 12–14 miles |
| Half Marathon | Tempo, MP progression runs | 14–16 miles |
| Marathon | MP long runs, progressive tempo | 20–22 miles |

**5K Training Philosophy:**
The 5K is an aerobic event that demands speed. Training builds a Z2 aerobic base, then layers VO2max intervals (Z5) as the primary key workout and tempo runs (Z4) as secondary. Long runs are moderate — building endurance supports recovery capacity but the 5K isn't won on long run fitness. Strides after easy runs develop neuromuscular speed year-round. Taper is short (7–10 days) because the training load is relatively low. Beginners focus on completing the distance; intermediate and advanced runners target specific pace goals.

**10K Training Philosophy:**
The 10K bridges speed and endurance. The primary stimulus is threshold work: cruise intervals (mile repeats at Z4) and continuous tempo runs build the lactate threshold that determines 10K pace. VO2max intervals are secondary but still important. Long runs can include the final miles at Z3 to practice running at moderate effort on tired legs. Training volume is moderate — higher than 5K plans but not as demanding as half marathon. Taper is 10–14 days.

**Half Marathon Training Philosophy:**
The half marathon is an endurance event with a quality component. The long run becomes a key workout — not just easy miles, but incorporating half marathon pace segments in the second half. Tempo runs (30–45 min at Z4) are the primary weekday key workout. Marathon-pace progression runs teach the athlete to run negative splits. Weekly mileage matters more here than for shorter races; build gradually with strict 10% rule. Strength shifts to maintenance by Build phase to free recovery capacity for running volume.

**Marathon Training Philosophy:**
The marathon is defined by the long run. Marathon-pace long runs (14–18 miles with the final 8–12 at marathon pace) are the single most important workout. These teach the body to burn fat at moderate intensity and the mind to hold pace when fatigued. Progressive tempo runs (start easy, build to threshold) develop pacing discipline. Weekly mileage should build to a sustained peak, not a single peak week — the body needs repeated exposure to high volume. The midweek medium-long run (10–12 miles easy) is a differentiator for intermediate and advanced runners. Taper is the longest of any distance (3 weeks) because accumulated fatigue is highest.

### 9.2 Triathlon

**Key principles:**
- Volume distribution follows distance-specific ratios (Section 4.2)
- Brick workouts 1×/week during Build and Peak
- Swim technique always present regardless of phase
- Strength transitions from building to maintenance across phases
- Race-specific practice: open water swimming, nutrition rehearsal, T1/T2 practice

**Race distances reference:**

| Distance | Swim | Bike | Run |
|----------|------|------|-----|
| Sprint | 750m | 20K | 5K |
| Olympic | 1500m | 40K | 10K |
| Half Ironman (70.3) | 1.9K | 90K | 21.1K |
| Full Ironman (140.6) | 3.8K | 180K | 42.2K |

### 9.3 Cycling

**Key principles:**
- FTP is the anchor for all intensity zones
- Sweet spot training (88–94% FTP) is high value: good stimulus, manageable fatigue
- Long rides build aerobic base and mental toughness
- Hill repeats for power development
- Recovery spins are legitimate training — don't skip them

### 9.4 Swimming

**Key principles:**
- Technique is paramount, especially for triathletes and novices
- CSS (Critical Swim Speed) anchors intensity zones
- Distance per session scales with level (Novice: –30–40%, Competitive: +15–25% from baseline)
- Stroke variety increases with level
- Open water practice is essential for triathlon prep

### 9.5 Hyrox

IronZ supports Hyrox race preparation. A Hyrox race consists of 8 stations, each preceded by a 1K run (8K total running). The race demands a unique blend of running endurance and functional strength — you can't just be a good runner or just be strong.

**The 8 Hyrox Stations (in order):**

| Station | Work | Primary Demand | Key Training Exercises |
|---------|------|---------------|----------------------|
| 1. SkiErg | 1000m | Upper body pulling endurance, cardio | SkiErg practice, lat pulldowns, tricep work |
| 2. Sled Push | 50m | Leg drive, core bracing, anaerobic power | Squats, leg press, wall sits, sled push practice |
| 3. Sled Pull | 50m | Grip, back, posterior chain | Deadlifts, rows, rope climbs, sled pull practice |
| 4. Burpee Broad Jumps | 80m | Full body power, hip flexor endurance | Burpees, broad jumps, box jumps, hip flexor conditioning |
| 5. Rowing | 1000m | Full body pulling endurance, cardio | Rowing intervals, deadlifts, lat pulldowns |
| 6. Farmer Carry | 200m | Grip endurance, core stability, leg endurance | Farmer carries, dead hangs, loaded walks, trap work |
| 7. Sandbag Lunges | 100m | Quad and glute endurance under load | Weighted lunges, Bulgarian split squats, goblet squats |
| 8. Wall Balls | 75 reps (women) / 100 reps (men) | Quad endurance, shoulder endurance, cardio | Wall balls, thrusters, front squats, overhead press |

**Key Training Principles:**

1. **Running is half the race.** 8K of running between stations means aerobic fitness is non-negotiable. A weak runner loses more time between stations than a weak lifter loses at stations. Prioritize running fitness.
2. **Train under fatigue.** The ability to perform station work after running — and to run after station work — is the defining Hyrox skill. Combination workouts (run + station circuits) are the most Hyrox-specific training you can do.
3. **Muscular endurance over max strength.** Hyrox stations require sustained effort, not one-rep maxes. Train with moderate weight and higher reps (12–20 range for station-specific exercises). Heavy compound strength (3–6 reps) still has a place in Base phase for building a foundation.
4. **Pacing wins races.** Going too hard on early stations or early runs burns you out for stations 6–8. Race simulations teach pacing.
5. **Grip is a limiter.** Farmer carry, sled pull, and rowing all demand grip endurance. If grip fails, everything slows down. Train grip directly (dead hangs, farmer carries, thick bar work).
6. **Practice the stations.** If you have access to sleds, SkiErg, and rowers, practice the actual movements. If not, use the training exercise substitutes above.

**Hyrox Strength Programming:**

| Phase | Strength Focus | Sets × Reps | Rest |
|-------|---------------|-------------|------|
| Base | Heavy compounds: squat, deadlift, row, press, lunges | 3–4 × 6–8 | 120–180s |
| Build | Moderate weight, muscular endurance: higher reps, station-specific exercises | 3–4 × 12–16 | 60–90s |
| Peak | Station simulation circuits: back-to-back exercises at race intensity | 2–3 rounds × race-effort reps | Minimal (race pacing) |
| Taper | Light maintenance, stay sharp | 2 × 8–10 | 90s |

**Hyrox-Specific Key Workouts:**

| Workout | Description | When |
|---------|-------------|------|
| The 1K Sandwich | 1K run → 1 station → 1K run → 1 station (repeat for 4 stations) | Build + Peak, 1×/week |
| Station Circuit | All 8 stations back-to-back, no running between, timed | Build, 1×/week |
| Half Sim | 4 stations + 4 × 1K runs at race effort | Peak, every 2 weeks |
| Full Sim | All 8 stations + 8 × 1K runs at race effort | Peak, 1–2 times total (3–4 weeks before race) |
| Grip Blaster | Farmer carry 4 × 100m + dead hang 3 × 30s + sled pull 3 × 25m | Build, 1×/week |

**Equipment Substitutions:**

If the athlete doesn't have access to Hyrox-specific equipment:

| Station Equipment | Substitute |
|-------------------|-----------|
| SkiErg | Battle ropes, band pull-aparts + burpees, rowing machine |
| Sled push | Wall sits + heavy goblet squats, prowler, resistance band walks |
| Sled pull | Heavy rows + banded pulls, seated cable rows |
| Rower | SkiErg, assault bike, or running intervals at Z4 |
| Wall balls | Thrusters with dumbbells, goblet squat + overhead press |

Farmer carry, sandbag lunges, and burpee broad jumps can all be trained directly with basic equipment (dumbbells, sandbag, bodyweight).

### 9.6 Sport-Specific Strength

Exercises that support specific sports:

| Sport | Key Strength Exercises | Purpose |
|-------|----------------------|---------|
| Swimming | Lat pulldown, pull-ups, cable rotations, band pull-aparts | Pulling power, shoulder stability |
| Cycling | Squats, leg press, single-leg deadlift, calf raises | Pedaling force, stability |
| Running | Lunges, step-ups, calf raises, hip thrusts, core work | Ground force, injury prevention |

---

## 10. Nutrition

### 10.1 General Principles

1. **Protein is king.** Regardless of goal, protein intake is the most impactful macro target.
2. **Calorie floors are non-negotiable.** Minimum 1,200 cal/day (women), 1,500 cal/day (men). Never go below these regardless of goal.
3. **Protein floor:** Never suggest less than 0.6 g/lb bodyweight.
4. **Start simple for beginners.** Provide calorie target and protein target. Full macro breakdowns are optional unless the athlete wants them.
5. **Fuel the work.** Training days may need more calories than rest days, especially for endurance athletes.
6. **No prohibited language.** Never use: "guaranteed results," "lose X lbs in Y days," "burn off that meal," "cure," "treat," "diagnose."

### 10.2 Calorie Targets by Goal

| Goal | Calorie Adjustment from TDEE |
|------|------------------------------|
| Muscle Gain (Bulk) | +10% to +20% |
| Maintenance | ±0% |
| Fat Loss (Cut) | –15% to –25% |
| Weight Management | –20% to –30% |

TDEE is calculated using Mifflin-St Jeor equation with an activity multiplier.

### 10.3 Protein Targets

| Goal | Protein (g/lb bodyweight) |
|------|--------------------------|
| Muscle Gain | 0.8–1.0 |
| Fat Loss (preserve muscle) | 0.8–1.2 |
| Endurance Performance | 0.6–0.8 |
| General Health | 0.6–0.8 |
| Maintenance | 0.7–0.9 |

### 10.4 Sport-Specific Nutrition

**Strength / Muscle Gain:**
- High protein, moderate carbs, adequate fats
- Pre-workout: carbs + protein 60–90 min before
- Post-workout: protein within 2 hours
- Calorie surplus on training days, maintenance on rest days (optional cycle)

**Endurance (Running, Cycling, Triathlon):**
- Higher carbohydrate needs (fuel for volume)
- Pre-long session: carb-rich meal 2–3 hours before
- During sessions >60 min: 30–60g carbs/hour
- Post-session: carbs + protein for glycogen replenishment
- Race-day nutrition plan: practice in training, nothing new on race day

**HIIT / Circuit:**
- Moderate carbs, high protein
- Pre-workout fueling important for performance
- Post-workout recovery meal within 1 hour

### 10.5 Goal-Specific Emphasis

| Goal | Swim Emphasis | Cycling Emphasis | Running Emphasis |
|------|-------------|-----------------|-----------------|
| Endurance | Longer continuous sets, aerobic base | Z2 focus, sweet spot, long rides | Easy pace, long runs, tempo |
| Speed | Sprint repeats, VO2 sets | VO2 intervals, threshold work | Speed work, intervals, fartlek |
| Weight Management | Higher volume at moderate intensity | Z2–Z3, longer duration | Easy-moderate pace, higher frequency |
| Strength | Shorter sessions, power-focused (paddles, resistance) | Hill repeats, high-gear work | Hills, strength-oriented fartlek |
| General | Balanced mix | Balanced | Balanced |

---

## 11. Hydration

### 11.1 Daily Baseline

- Minimum: 0.5 oz per pound of bodyweight per day
- Adjust up for heat, altitude, and training days

### 11.2 Training Day Hydration

- **Before:** 16–20 oz in the 2 hours before training
- **During (sessions < 60 min):** Sip water as needed
- **During (sessions > 60 min):** 20–30 oz per hour, consider electrolytes
- **After:** 16–24 oz per pound lost during exercise (if tracking)

### 11.3 Race Day Hydration

- Practice hydration strategy during training (nothing new on race day)
- For endurance events: electrolyte drink, not just water
- Hot weather: increase intake by 25–50%, add sodium

---

## 12. Recovery & Adaptation

### 12.1 Recovery State Classification

Recovery state is derived from weekly check-in data (sleep quality, energy level, soreness):

| State | Indicators | Training Modification |
|-------|-----------|----------------------|
| Good | Good sleep, high energy, no/mild soreness | Train as planned |
| Moderate | Fair sleep, moderate energy, moderate soreness | Reduce intensity by 10%, add extra warm-up |
| Low | Poor sleep, low energy, severe soreness | Reduce volume by 30–40%, cap intensity at Z3, consider extra rest day |

### 12.2 Adaptation Rules

- **If 2+ consecutive weeks of "too hard" feedback:** Reduce volume by 10–15%, add rest day
- **If 2+ consecutive weeks of "too easy" feedback:** Increase volume by 5–10% or add intensity session
- **If adherence drops below 60% for 2 weeks:** Simplify plan, reduce session count, check motivation
- **Post-illness/injury return:** Start at 50% of previous volume, rebuild over 2–3 weeks

### 12.3 Deload Guidelines

| Aspect | Deload Modification |
|--------|-------------------|
| Volume | Reduce 40–60% |
| Intensity | Maintain (keep quality, less quantity) |
| Frequency | Maintain or slightly reduce |
| Duration | Shorter sessions |
| Strength | Reduce sets, maintain or slightly reduce weight |

### 12.4 Plateau Prevention & Response

Fitness plateaus happen when the body fully adapts to the current training stimulus. For progress to continue, the stimulus must be systematically increased or changed. The plan generation engine and adaptation rules must account for these plateau causes:

**Cause 1 — Workout Monotony:** Performing the same exercises in the same order with the same rep schemes for too long makes the body overly efficient. You don't need to change workouts every week, but going too long without variation stalls progress. The exercise selection diversity system (Section 7.3) and mesocycle-based exercise rotation address this. Within a mesocycle, exercises stay consistent for adaptation. Between mesocycles, exercises rotate.

**Cause 2 — Insufficient Stimulus (Undertraining):** If the athlete is not consistently challenging their body — lifting heavier, performing more reps, or increasing volume — progressive overload stalls. The rule engine must ensure week-over-week progression within each mesocycle (Section 4.1) and that the "too easy" adaptation response (Section 12.2) triggers a volume or intensity increase.

**Cause 3 — Overtraining:** Excessive training without adequate rest leads to chronic fatigue, stalled progress, and even regression. Signs include persistent soreness, poor sleep, declining performance, and mood changes. The deload system (Section 12.3), recovery state classification (Section 12.1), and mandatory rest days (Section 13) guard against this. The "too hard" adaptation response must trigger volume reduction, not just encouragement to push through.

**Cause 4 — Inadequate Nutrition:** The body cannot build muscle or perform optimally without sufficient fuel. Consistently undereating — especially falling short on protein or total calories — stops progress even when training is well-programmed. Nutrition safety floors (Section 13) enforce minimums, and the nutrition calculator (Section 10) must match calorie targets to training load.

**Rule engine implications:**
- Rotate exercises between mesocycles (don't repeat the same exercise selection for more than 1 mesocycle)
- Ensure progressive overload is built into every non-deload week
- If "too easy" feedback persists for 2+ weeks, escalate stimulus (don't just maintain)
- If "too hard" feedback persists, reduce before the athlete burns out
- Flag users whose nutrition targets are at the safety floor — they may be under-fueling relative to training load

---

## 13. Safety Boundaries

These are hard constraints that the validator enforces on every generated plan. They cannot be overridden.

1. **Calorie floor:** Minimum 1,200 cal/day (women), 1,500 cal/day (men)
2. **Protein floor:** Never below 0.6 g/lb bodyweight
3. **Volume increase cap:** Max 15% weekly increase for endurance, max 4 sets/muscle/week increase for strength
4. **Rest day minimum:** At least 1 full rest day per week
5. **Deload requirement:** Plans longer than 4 weeks must include deload weeks
6. **Beginner guardrails:** Max 4 training days/week (unless explicitly requested), max 5 exercises per session, no VO2max work in first 4 weeks for endurance
7. **Prohibited language:** Never use "guaranteed results," "lose X lbs in Y days," "burn off that meal," "cure," "treat," "diagnose"
8. **Wellness disclaimer:** Every plan includes: "This plan provides general wellness guidance and is not a substitute for professional medical advice."
9. **Max volume increase for endurance:** 15% week-over-week
10. **Max long run proportion:** Never more than 30% of weekly mileage

---

## 14. Coaching Tone

| Level | Tone |
|-------|------|
| Beginner | Encouraging, clear, non-judgmental, educational without being overwhelming |
| Intermediate | Motivating, evidence-informed, progressively challenging |
| Advanced | Precise, data-driven, trusts the athlete's self-regulation |

**Always:**
- Celebrate consistency over performance
- Frame rest as productive, not lazy
- Explain the "why" behind each workout (rationale)
- Be honest about trade-offs (e.g., "you can train 6 days but recovery matters more")

**Never:**
- Shame, guilt, or use fear-based motivation
- Promise specific outcomes ("you WILL PR")
- Use body-shaming language
- Promote overtraining as dedication

---

## Appendix A: Profile-Driven Session Modifiers

### Volume & Complexity by Level

| Attribute | Beginner | Intermediate (Baseline) | Advanced |
|-----------|----------|------------------------|----------|
| Swim distance | –30% to –40% | Baseline | +15% to +25% |
| Run/Bike distance | –20% to –30% | Baseline | +15% to +20% |
| Working sets | –30% (fewer intervals) | Baseline | +20% (more intervals) |
| Rest periods | +30% longer | Baseline | –20% shorter |
| Exercise complexity | Basic drills only | Standard drills | Advanced drills + technique work |
| Zone ceiling | Z3 max (no Z4/Z5 work) | Z4 available | Z5 available, VO2max intervals |
| Stroke variety (swim) | Freestyle + kick only | Free + back + breast | All strokes including butterfly + IM |

### Weight/Gender Notes

- Weight affects estimated caloric burn on workout cards
- Gender affects HR zone estimates if no wearable data (women average 5–10 bpm higher)
- Neither weight nor gender changes workout structure — only performance estimates and coaching notes

---

## Appendix B: Swim Session Parameter Tables

These tables show how intensity modifies a 45-minute swim session for an intermediate swimmer.

### Endurance Session

| Parameter | Easy | Moderate | Hard |
|-----------|------|----------|------|
| Total distance | 1,800m | 2,300m | 2,800m |
| Warm-up | 400m free easy | 400m mixed | 300m mixed (shorter) |
| Main set zone | Z1–Z2 | Z2–Z3 | Z3–Z4 |
| Main set structure | Continuous 1,000m | 4×300m w/ 15s rest | 6×200m w/ 10s rest |
| Rest between sets | 20–30s | 15–20s | 10–15s |
| Cool-down | 400m choice easy | 200m choice easy | 200m easy |

### CSS Intervals Session

| Parameter | Easy | Moderate | Hard |
|-----------|------|----------|------|
| Total distance | 1,600m | 2,200m | 2,800m |
| Interval distance | 200m repeats | 100–200m repeats | 50–100m repeats |
| Interval count | 4–6 | 6–10 | 10–16 |
| Target pace | CSS + 5s/100m | CSS pace | CSS – 2s/100m |
| Rest ratio | 1:1 (work:rest) | 3:1 | 4:1 |
| Cool-down | 400m easy | 300m easy | 200m easy |

Apply beginner/advanced modifiers from Appendix A on top of these tables.

---

## Appendix C: VDOT Reference Table

Selected VDOT values and corresponding training paces:

| VDOT | Easy Pace | Marathon Pace | Threshold | Interval | Repetition |
|------|-----------|-------------|-----------|----------|------------|
| 30 | 12:40/mi | 11:13/mi | 10:18/mi | 9:18/mi | 8:40/mi |
| 35 | 11:22/mi | 9:52/mi | 9:00/mi | 8:03/mi | 7:28/mi |
| 40 | 10:18/mi | 8:49/mi | 8:02/mi | 7:08/mi | 6:36/mi |
| 45 | 9:18/mi | 8:01/mi | 7:13/mi | 6:24/mi | 5:56/mi |
| 50 | 8:35/mi | 7:17/mi | 6:36/mi | 5:51/mi | 5:25/mi |
| 55 | 7:58/mi | 6:44/mi | 6:05/mi | 5:24/mi | 5:01/mi |
| 60 | 7:22/mi | 6:12/mi | 5:35/mi | 4:58/mi | 4:36/mi |
| 65 | 6:54/mi | 5:47/mi | 5:13/mi | 4:38/mi | 4:18/mi |
| 70 | 6:30/mi | 5:25/mi | 4:53/mi | 4:20/mi | 4:01/mi |

Full VDOT table (range 30–85) is maintained in the VDOT calculation module. This table is for reference.

---

**END OF DOCUMENT**
