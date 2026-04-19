# IronZ — Single Source of Truth

> **Version:** 2.0
> **Last updated:** 2026-04-19
> **Purpose:** This is the SINGLE REFERENCE for all IronZ training logic — philosophy, plan generation, exercise selection, nutrition, recovery, and coaching. There is no other document. If it's not here, it doesn't exist.
>
> **For Code:** When implementing features, this document is your spec. Sections 1–9 are the plan generation pipeline (walk through in order). Sections 10–15 cover supporting systems (exercise selection, nutrition, recovery, etc.). Appendices have reference tables.

---

## 0. CORE PRINCIPLES — The Non-Negotiables

These principles govern every plan IronZ generates. They cannot be overridden by any section below. When a rule in a later section conflicts with these, the principle wins.

1. **Consistency beats optimization.** A slightly underdosed plan that gets completed beats an optimal plan that gets abandoned.
2. **80/20 intensity distribution.** Roughly 80% of training volume at easy/aerobic intensity (Z1–Z2). The remaining 20% is moderate-to-hard (Z3–Z5). Applies to all endurance disciplines. Specific goals (speed_performance) may shift this to 70/30 — never more aggressive than that.
3. **Progressive overload.** Training stress increases gradually. For endurance: max **10% weekly volume increase for Beginner / Intermediate, 15% for Advanced — never more than 15% under any circumstance**. Applies to (a) the weekly total minutes and (b) each keystone long session's duration, both clamped the same way. Library workout swaps between weeks must be clamped to the same cap. For strength: add load or reps week-over-week within a mesocycle.
4. **Recovery is training.** At least 1 recovery day per week. Beginners/Intermediates = full rest. Advanced = active recovery (Z1 only). Deload weeks required for plans longer than 4 weeks.
5. **Specificity.** Train for what you're racing. A marathon plan prioritizes running volume. A triathlon plan balances swim/bike/run. Strength supports the primary sport, never replaces it.
6. **Individualization.** Plans adapt to level, age, goal, equipment, and threshold data. Two different athletes should get materially different plans.
7. **No medical claims.** IronZ provides general wellness guidance. It does not diagnose, prescribe, cure, or treat. Every plan includes a wellness disclaimer.

---

## 1. INPUTS — What the Generator Reads

When the user presses "Generate & Schedule Plan," these inputs are available:

| Input | Source | Example (Chase) |
|-------|--------|-----------------|
| selectedSports | onboarding | ["swimming", "cycling", "running", "strength"] |
| trainingGoals | onboarding | ["race"] |
| strengthRole | onboarding | "injury_prevention" |
| raceEvents | onboarding | [{ category: "triathlon", type: "Full Ironman", date: "2026-09-13", priority: "A", goal: "time_goal" }] |
| buildPlanTemplate | onboarding | { mon: ["swim"], tue: ["run"], wed: ["bike"], thu: ["run"], fri: ["swim"], sat: ["bike","run"], sun: ["rest"] } |
| profile.age | profile | 26 |
| profile.weight | profile | 195 lbs |
| profile.height | profile | 6'2" |
| profile.daysPerWeek | derived | 6 |
| thresholds.swim_css | profile | (if set) |
| thresholds.cycling_ftp | profile | (if set) |
| thresholds.running_5k | profile | e.g., 19:40 → ~6:20/mile pace, VDOT 50.8 |
| strengthSetup.split | onboarding | "upper_lower" or "full_body" etc. |
| equipmentProfile | profile | ["barbell-rack", "dumbbells", "bench", "cable-machine", ...] |

---

## 2. CLASSIFY — Determine the Athlete's Profile

### 2a. Running Level (from 5K time)

| 5K Time | 5K Pace (/mile) | Level |
|---------|----------------|-------|
| > 31:00 | > 10:00/mile | Beginner |
| 23:20–31:00 | 7:30–10:00/mile | Intermediate |
| < 23:20 | < 7:30/mile | Advanced |

**Chase's case:** 5K time of 19:40 → 6:20/mile pace → VDOT 50.8 → **Advanced runner**

### 2b. Cycling Level (from FTP w/kg)

| FTP (w/kg) | Level |
|-----------|-------|
| < 2.0 | Beginner |
| 2.0–3.5 | Intermediate |
| > 3.5 | Advanced |

If no FTP data → default Intermediate.

### 2c. Swimming Level (from CSS)

| CSS Pace | Level |
|----------|-------|
| > 2:30/100m | Novice |
| 1:45–2:30/100m | Intermediate |
| < 1:45/100m | Competitive |

If no CSS data → default Intermediate.

### 2d. Overall Level

Highest sport-specific level across all sports. This drives constraint rules.

### 2e. Athlete Type

| Sports Selected | Athlete Type |
|----------------|-------------|
| Strength only | standalone_strength |
| Endurance only (no strength) | standalone_endurance |
| Endurance + Strength | hybrid |

### 2f. What Level Controls

| Rule | Beginner | Intermediate | Advanced |
|------|----------|-------------|----------|
| Max intensity sessions/week | 1 | 2 | 2–3 |
| Back-to-back hard days | NEVER | Occasionally (max 1 pair/week, must follow with easy day) | Allowed (with recovery protocol) |
| Min rest days/week | 1 (full rest) | 1 (full rest) | 1 (active recovery OK) |
| Max weekly volume increase | 10% | 10% | 15% |
| Deload cycle | Every 4th week | Every 4th week | Every 3rd–4th week |

### 2g. Dynamic Level Progression

Athlete levels are not static. Levels update every 4–8 weeks based on training data:

**Beginner → Intermediate promotion:**
- Training adherence > 80% over a full mesocycle (4 weeks)
- Successfully completes structured training blocks without injury
- Handles at least 1 quality session per week consistently

**Intermediate → Advanced promotion:**
- Handles 2+ quality (Z4/Z5) sessions per week without excessive fatigue
- Demonstrates measurable threshold improvement (faster CSS, higher FTP, faster race time)
- Recovery metrics remain stable under higher training load

**Demotion rules:**
- Adherence drops below 50% for 2+ weeks → consider stepping level down
- Extended break (4+ weeks off) → restart one level below previous
- After injury return → restart at Beginner regardless of previous level

### 2h. Risk–Performance Bias

| Level | Bias | What It Means |
|-------|------|--------------|
| Beginner | Safety-first | When in doubt, less intensity, more rest, simpler sessions |
| Intermediate | Balanced | Moderate risk tolerance, progressive challenge |
| Advanced | Performance-first | Push closer to limits, trust athlete self-regulation |

This bias applies to: intensity session frequency, volume progression rate, deload timing, exercise complexity, and zone ceiling selection.

### 2i. Training Frequency → Strength Split

| Available Days/Week | Classification | Strength Split |
|---------------------|---------------|----------------|
| 2–3 | Low frequency | Full body |
| 4–5 | Moderate frequency | Upper/Lower or PPL (if advanced) |
| 6–7 | High frequency | PPL (advanced only; requires good recovery) |

### 2j. Equipment Access Levels

| Equipment Level | Available Exercises |
|-----------------|-------------------|
| Bodyweight only | canBeBodyweight === true exercises only |
| Dumbbells | Bodyweight + dumbbell exercises |
| Home gym | Bodyweight + dumbbells + pull-up bar + bench + bands |
| Full gym | All exercises |

If no equipment profile is set, assume full gym access (no filtering).

### 2k. Threshold Refresh

Thresholds should be re-tested every 90 days. If stale (>90 days), show a subtle reminder on Add Session / Build Plan screens. Dismissable for 14 days, then reappears.

---

## 3. BUILD THE ARC — Phases and Timeline

### 3a. Race-Based Plans

Calculate: `totalWeeks = Math.ceil((raceDate - today) / (7 * 86400000))`

Allocate phases using these ratios:

**Triathlon:**
| Phase | Ratio | Chase's Ironman (21 weeks) |
|-------|-------|---------------------------|
| Base | 25% | 5 weeks |
| Build | 30% | 7 weeks |
| Peak | 25% | 5 weeks |
| Taper | 15% | 3 weeks |
| Race Week | 5% (min 1) | 1 week |
| **Total** | **100%** | **21 weeks** |

**Running:**
| Phase | Ratio |
|-------|-------|
| Base | 25% |
| Build | 35% |
| Peak | 20% |
| Taper | 15% |
| Race Week | 5% (min 1) |

**Hyrox:**
| Phase | Ratio |
|-------|-------|
| Base | 30% |
| Build | 35% |
| Peak | 20% |
| Taper | 10% |
| Race Week | 5% (min 1) |

**CRITICAL RULES:**
- Allocated weeks MUST sum to totalWeeks exactly. If rounding loses weeks, add remainder to Build.
- Reserve Race Week (1 week) and Taper first. Then distribute remaining weeks.
- If < 6 weeks to race: skip Base entirely → compressed Build → Peak → Taper → Race Week.

### 3a-ii. How Athlete Profile Changes What Happens INSIDE Each Phase

The phase ratios (25/30/25/15) stay the same — every athlete needs base before build, and taper before race. But the **content, volume, and intensity** inside each phase varies dramatically:

| Dimension | Beginner (e.g., 55F, new to sport) | Intermediate | Advanced (e.g., 26M, VDOT 50.8) |
|-----------|-----------------------------------|-------------|--------------------------------|
| Pre-Base needed? | YES — 2–4 weeks of habit building, easy aerobic only, before structured Base begins | Only if returning from 4+ week break | No — jump straight into Base |
| Sessions/week in Base | 5–6 | 6–7 | 8–9 |
| Sessions/week in Build | 5–7 | 6–8 | 9–11 |
| Quality sessions in Build | 1/week max (gentle tempo only, no VO2max) | 2/week (tempo + intervals) | 2–3/week (tempo + intervals + race-pace) |
| Long session progression | Start short (45 min), build slowly | Start moderate (60–75 min) | Start longer (90 min), build aggressively |
| Hour ceiling (Full Ironman) | 12–16 hrs/week | 14–20 hrs/week | 16–25+ hrs/week |
| Deload frequency | Every 3rd week (2 build + 1 deload) | Every 4th week (3 build + 1 deload) | Every 3rd–4th week |
| Age modifiers (50+) | Rest +25%, Z5 reduced 40%, max session 75% of baseline, extended warm-up/cool-down | Same if applicable | N/A |
| Age modifiers (60+) | Rest +40%, NO Z5 work, volume –20%, joint-friendly exercise subs | Same if applicable | N/A |
| Strength sessions | 1–2×/week, bodyweight/band focus, form over load | 2×/week, moderate load | 2×/week, heavier load, sport-specific |
| Brick workouts | NOT until late Build, keep very short (20 min bike + 10 min run) | Introduce mid-Build | Introduce early Build, progress to race simulation |

**The key insight:** Two athletes with the same Ironman race both get 25% Base / 30% Build / etc. But the beginner's Base has 4 easy sessions/week totaling 5 hours, while the advanced athlete's Base has 9 sessions totaling 15 hours. Same phase structure, completely different content.

### 3a-iii. Days Per Week vs Sessions Per Week

The user selects how many **days per week** they want to train during onboarding (stored as `profile.daysPerWeek`). Sessions per week can exceed days per week because some days have two sessions (doubles). But there are hard limits:

| Days/Week Available | Max Sessions/Week | Doubles Allowed? |
|--------------------|-------------------|-----------------|
| 5 (default minimum) | 5–8 | 1–2 doubles |
| 6 | 6–10 | 2–3 doubles |
| 7 | 7–11 | 2–3 doubles (still need 1 rest or active recovery day) |

**Hard rules for doubles:**
- **Max 2 sessions per day.** Never 3.
- **Never double up two hard sessions.** If a day has two sessions, at least one must be easy/Z2 or strength.
- **Common double pairings:** AM strength + PM easy run. AM easy swim + PM easy bike. AM intervals + PM easy recovery spin.

**Sport-Strength Pairing Rules (PPL or Upper/Lower splits):**
When a triathlete selects a PPL or upper/lower strength split, pair strength days with the complementary sport to group muscle fatigue rather than spread it:

| Strength Day | Best Sport Pairing | Why | Avoid Pairing With |
|-------------|-------------------|-----|-------------------|
| Pull day | Swim day (easy or technique) | Swimming is pull-dominant (lats, back, rear delts). Group the fatigue. | Don't place pull the day BEFORE a key swim (CSS intervals) — muscles will be fried |
| Push day | Bike day (easy) | Cycling is leg-dominant, so push (chest/shoulders/triceps) doesn't interfere | No conflict with any sport |
| Leg day | Swim day (easy) or rest day | Legs need recovery for running and cycling. Don't pair with run or bike. | Never before a long run, long ride, or brick |
| Upper body | Swim or run day | Upper doesn't interfere with running; pairs naturally with easy swim | Don't place before key swim |
| Lower body | Swim day or rest | Same as leg day — protect run and bike days | Never before long run, long ride, intervals, or brick |

**The key principle:** Group similar muscle fatigue on the same day so recovery days are truly recovery. Don't scatter strength work such that every day has some muscle group sore.
- **Never double on the day before a rest day** — the rest day exists for a reason.
- **Beginners: no doubles.** They train once per day, period.
- **Intermediates: max 1 double/week** in Build and Peak phases only, not in Base.
- **Advanced: 2–3 doubles/week allowed.**

**How to map sessions to days:**
1. Start with the user's available days from `buildPlanTemplate`
2. Count required sessions for this phase (e.g., Build triathlon = 10 sessions)
3. If sessions > available days, assign doubles to the easiest combination days
4. If sessions > (available days × 2), something is wrong — reduce sessions to fit
5. Always preserve at least 1 rest day per week (even if user selected 7 days)
6. **Default minimum is 5 sessions/week.** Plans generate with at least 5 sessions by default. The user can then modify their template to reduce if they want, but the generator always starts at 5+. If the user's template has fewer than 5 active days, the generator still produces 5 sessions and assigns doubles where needed.

### 3a-iv. Phase Compression (Late Starts)

When weeks-to-race is less than ideal:

| Priority | Rule |
|----------|------|
| 1 (protect) | Taper — never compress, always preserve full taper |
| 2 (protect) | Peak — preserve for race-readiness |
| 3 (compress first) | Base — compress or skip if necessary |
| 4 (compress moderately) | Build — reduce but maintain key quality sessions |
| 5 (skip if needed) | Pre-Base — drop entirely if athlete has recent training |

If fewer than 6 weeks to race: skip Pre-Base and Base entirely → compressed Build → Peak → Taper → Race Week.

### 3a-v. Multi-Race Periodization

When an athlete has multiple races, each gets a priority:

| Priority | Meaning | Taper | Plan Impact |
|----------|---------|-------|-------------|
| A Race | Season goal, drives entire plan | Full taper (15% of plan weeks) | Plan built backwards from this date |
| B Race | Important but not primary | 5–7 day micro-taper | Carved into Build or Peak phase |
| C Race | Training race, low priority | 2–3 easy days before | Train through it, treat as hard workout |

**B-Race Micro-Taper:** 3 days pre-race reduce volume 30%, drop long session, keep easy. Race day as planned. 3 days post-race easy recovery only. Then resume normal block.

**Lead-in blocks:** If there's a gap between plan start and first structured phase, fill with general fitness lead-in: easy aerobic, strength foundation, technique.

### 3b. Non-Race Plans (Rolling Mesocycles)

When the athlete has no target race ("Get Faster," "Build Endurance," "Lose Weight," "General Fitness"), the plan uses rolling mesocycles — repeating 4-week blocks that progress over time. No end date.

**Structure:** Each mesocycle is 4 weeks: 3 progression + 1 deload.

| Week | Purpose | Volume | Intensity |
|------|---------|--------|-----------|
| 1 | Introduction | Baseline | Moderate — establish the block's new stimulus |
| 2 | Progression | +5–10% | Add volume or intensity (not both) |
| 3 | Overreach | +5–10% from week 2 | Peak training load for the block |
| 4 | Deload | –40–50% from week 3 | Maintain intensity, cut volume, recover |

**How Goals Shape Each Mesocycle:**

- **speed_performance ("Get Faster"):** Primary stimulus = quality sessions (tempo, intervals). Each mesocycle increases interval count or duration. 1 tempo + 1 interval/week (1 if beginner). Strength supports speed: power and plyometric emphasis.
- **endurance ("Build Endurance"):** Primary stimulus = Z2 volume. Each mesocycle extends the long session by 10–15 min. Quality work minimal — 1 tempo/week max. Key session = long run or long ride.
- **fat_loss ("Lose Weight"):** Primary stimulus = strength (at least 2–3×/week, NEVER dropped). Cardio supports the deficit but doesn't replace strength. Avoid high-intensity cardio in significant deficit. Moderate Z2 preferred. Key session = compound lifts.
- **general_fitness ("General Fitness"):** Equal priority strength and cardio. Rotate training stimulus each mesocycle. Include variety. Key session = whatever the athlete enjoys most.

**Mesocycle-to-Mesocycle Progression (from feedback):**

| Feedback | Next Mesocycle Adjustment |
|----------|--------------------------|
| "Too easy" for 2+ weeks | Increase baseline volume 5–10%, add 1 quality session if not at cap |
| "Too hard" for 2+ weeks | Decrease baseline volume 10%, remove 1 quality session |
| "Just right" | Progress normally (+5–10% over previous baseline) |
| Adherence < 60% | Reduce session count, simplify, check if goal still matches |
| Adherence > 90% | Consider adding a session day or extending duration |

**When a non-race athlete adds a race:** Current mesocycle finishes, then race-based arc takes over. Training already completed counts as base fitness.

**Plan duration:** Generate 4 weeks at a time. Auto-generate next mesocycle based on feedback. No fixed end date.

### 3b-ii. Goal-Based Session Distribution (Non-Race Plans)

**"Get Faster" (speed_performance) — Example: Runner, 5 days/week:**

| Type | Sessions/Week |
|------|---------------|
| Easy runs | 2 |
| Tempo or threshold | 1 (KEY) |
| Intervals (Z5) | 1 (KEY) |
| Long run | 1 |
| Strength | 1–2 |
| **Total** | **5–6** |

**"Build Endurance" (endurance) — Example: Runner + Cyclist, 5 days/week:**

| Type | Sessions/Week |
|------|---------------|
| Easy runs | 2 |
| Long run | 1 (KEY) |
| Z2 ride or long ride | 1 (KEY) |
| Tempo | 0–1 |
| Strength | 1 |
| **Total** | **5–6** |

**"Lose Weight" (fat_loss) — Example: Any activities, 5 days/week:**

| Type | Sessions/Week |
|------|---------------|
| Strength | 2–3 (KEY — compound lifts, preserve muscle) |
| Easy cardio | 2–3 (Z2, moderate duration) |
| HIIT/Circuit | 0–1 (optional, intermediate+ only) |
| **Total** | **4–6** |

**"General Fitness" — Example: Any activities, 4 days/week:**

| Type | Sessions/Week |
|------|---------------|
| Strength | 2 (full body, moderate) |
| Cardio | 2 (Z2, varied) |
| Optional variety | 0–1 |
| **Total** | **4–5** |

### 3c. Hour Ceilings

**Triathlon hour ceilings per week:**
| Level | Sprint | Olympic | Half Ironman | Full Ironman |
|-------|--------|---------|-------------|-------------|
| Beginner | 4–6 | 6–10 | 8–12 | 12–16 |
| Intermediate | 6–8 | 8–12 | 10–15 | 14–20 |
| Advanced | 8–10 | 10–14 | 12–18 | 16–25+ |

**Chase's case:** Advanced + Full Ironman = 16–25 hrs/week ceiling

**Running hour ceilings per week:**
| Level | 5K | 10K | Half | Marathon |
|-------|-----|------|------|----------|
| Beginner | 3–4 | 4–5 | 5–7 | 6–10 |
| Intermediate | 4–6 | 5–7 | 6–9 | 8–12 |
| Advanced | 5–8 | 6–10 | 8–12 | 10–16 |

If total planned session hours exceed the ceiling, shorten session durations (don't remove sessions).

---

## 4. SESSION DISTRIBUTION — The Core Decision Tree

This is the heart of the generator. For each week, determine which phase it belongs to, then use the correct session template.

### 4a. TRIATHLON SESSION TEMPLATES BY PHASE

**BASE PHASE — 9 sessions/week:**
| Day Slot | Discipline | Session Type | Zone | Duration |
|----------|-----------|-------------|------|----------|
| 1 | Swim | Technique (drills, form focus) | Z1–Z2 | 45–60 min |
| 2 | Swim | Endurance (continuous laps) | Z2 | 45–60 min |
| 3 | Bike | Z2 Endurance ride | Z2 | 60–90 min |
| 4 | Bike | Long Ride | Z2 | 90–150 min (progressive) |
| 5 | Run | Easy run | Z1–Z2 | 30–45 min |
| 6 | Run | Easy run | Z1–Z2 | 30–45 min |
| 7 | Run | Long run | Z2 | 60–90 min (progressive) |
| 8 | Strength | Full body or upper | Per strengthRole | 30–60 min |
| 9 | Strength | Full body or lower | Per strengthRole | 30–60 min |
| 10 (every 1–2 wks) | Brick | Easy bike → easy run (transition practice) | Z1–Z2 | 30–40 min total |

**KEY CHARACTERISTICS:** ALL sessions are Z1–Z2. No intervals. No threshold work. No race-pace. This is aerobic foundation only. If the output has Z4+ sessions in Base, it's wrong. Bricks are included but short and easy — learning the transition, not building fitness (see Brick Progression below).

**BUILD PHASE — 10 sessions/week:**
| Day Slot | Discipline | Session Type | Zone | Duration |
|----------|-----------|-------------|------|----------|
| 1 | Swim | Technique | Z1–Z2 | 45 min |
| 2 | Swim | CSS Intervals (threshold sets) | Z3–Z4 | 45–60 min |
| 3 | Swim | Endurance | Z2 | 45–60 min |
| 4 | Bike | Z2 Endurance | Z2 | 60–75 min |
| 5 | Bike | Threshold / Sweet Spot intervals | Z4 | 60–75 min |
| 6 | Bike | Long Ride | Z2 | 2–3 hrs (progressive) |
| 7 | Run | Tempo OR Intervals | Z3–Z4 | 45–60 min |
| 8 | Run | Long run | Z2 (last miles Z3) | 75–120 min (progressive) |
| 9 | Strength | Maintenance, sport-specific | Per strengthRole | 30–45 min |
| 10 | Brick | Moderate bike → easy-moderate run (replaces standalone easy run + Z2 bike) | Z2–Z3 | 60–80 min total |

**KEY CHARACTERISTICS:** Introduce Z3–Z4 work (CSS intervals, threshold bike, tempo runs). Brick workouts increase to weekly with growing effort and duration. Volume plateaus, intensity increases. Strength drops to 1×/week.

**PEAK PHASE — 11 sessions/week (but shorter durations):**
| Day Slot | Discipline | Session Type | Zone | Duration |
|----------|-----------|-------------|------|----------|
| 1 | Swim | Technique | Z1–Z2 | 40 min |
| 2 | Swim | Race-pace sets | Z3–Z4 | 45 min |
| 3 | Swim | Endurance | Z2 | 40 min |
| 4 | Bike | Z2 easy | Z2 | 60 min |
| 5 | Bike | Race-pace intervals | Z4 | 60 min |
| 6 | Bike | Long Ride (shorter than Build) | Z2 | 90–120 min |
| 7 | Run | Easy | Z1–Z2 | 30 min |
| 8 | Run | Race-pace intervals | Z4 | 45 min |
| 9 | Run | Long run (shorter than Build) | Z2 | 60–90 min |
| 10 | Strength | Maintenance only | Per strengthRole | 30 min |
| 11 | Brick | Bike → Run at race effort | Z3–Z4 | 60–90 min |

**KEY CHARACTERISTICS:** Race-pace work replaces threshold work. Volume starts decreasing. Dress rehearsal bricks. Everything becomes race-specific.

**TAPER PHASE — 6 sessions/week:**
| Day Slot | Discipline | Session Type | Zone | Duration |
|----------|-----------|-------------|------|----------|
| 1 | Swim | Technique + short openers | Z1–Z2 | 30 min |
| 2 | Swim | Short race-pace set | Z3 | 30 min |
| 3 | Bike | Easy spin | Z1–Z2 | 45 min |
| 4 | Bike | Short opener (10 min at race pace) | Z2+opener | 30 min |
| 5 | Run | Easy | Z1–Z2 | 25 min |
| 6 | Run | Short opener (strides, 10 min tempo) | Z2+opener | 25 min |

**KEY CHARACTERISTICS:** Volume drops 40–60%. Keep 1–2 sharp efforts per week. NO new training stimuli. NO strength. NO bricks. NO long sessions.

### 4a-ii. Brick Progression Across Phases (Triathlon Only)

| Phase | Frequency | Bike Portion | Run Portion | Effort | Purpose |
|-------|-----------|-------------|-------------|--------|---------|
| Base | Every 1–2 weeks | 20–30 min easy | 10–15 min easy | Both Z1–Z2 | Learn the transition, get legs used to running off the bike |
| Build (early) | Weekly | 45–60 min moderate | 15–20 min easy-moderate | Bike Z2–Z3, Run Z2 | Build duration, practice pacing |
| Build (late) | Weekly | 60–90 min at race effort | 20–30 min at race effort | Bike Z3, Run Z3 | Race simulation, practice nutrition |
| Peak | Weekly | Full race-distance bike (or 75%) | 20–30 min at race pace | Race effort | Dress rehearsal |
| Taper | 1 total (first week of taper ONLY) | 20–30 min easy spin | 10–15 min easy jog | Both Z1–Z2 | Keep transition feel fresh, no fitness stimulus |
| Race Week | None | — | — | — | Rest |

**Hard rule: No brick workouts within 14 days of race day.** Even an easy brick creates more fatigue than a standalone session because of the transition stress. The taper brick (if included) must fall in taper week 1 only — never weeks 2–3, never race week.

**Beginner exception:** No bricks in the first 2 weeks of Base. Start bricks in Base week 3 at the shortest duration (15 min bike + 10 min run).

**RACE WEEK — 4–5 sessions (triathlon example, Sunday race):**
| Day | Session | Duration | Notes |
|-----|---------|----------|-------|
| Mon | Short easy swim (openers, a few race-pace 50s) | 20–25 min | Shake off taper stiffness |
| Tue | Short easy bike (few spin-ups to race cadence) | 20–25 min | Keep legs turning over |
| Wed | Short easy run (strides: 4–6 × 100m) | 15–20 min | Neuromuscular activation, NOT fitness |
| Thu | Shakeout swim or rest | 15 min or off | Athlete preference — some want to feel the water one more time |
| Fri | Shakeout run (10 min easy jog + 2–3 strides) | 10–15 min | Just enough to keep legs from feeling dead on race morning |
| Sat | Optional shakeout: 15–20 min easy bike spin OR 10–15 min easy jog + 2 strides | 10–20 min | Athlete preference. Some feel better with a short opener the day before, others prefer full rest. Default to optional — let the user toggle it on/off. |
| Sun | RACE DAY | — | — |

**Shakeout philosophy:** The purpose of race week sessions is NOT fitness (that ship has sailed). It's about keeping the body feeling loose and activated after taper. Sessions should feel easy and short. If an athlete feels tired or heavy, that's normal taper fatigue — it doesn't mean they need more work. Less is more.

### 4b. RUNNING SESSION TEMPLATES BY PHASE

**BASE — 6–7 sessions/week:**
| Session | Type | Zone |
|---------|------|------|
| Easy run ×3 | Z1–Z2 | 30–45 min |
| Long run ×1 | Z2 | 60–90 min (progressive) |
| Strength ×2 | Per strengthRole | 30–60 min |
| Cross-train ×1 (optional) | Z2 | 30–45 min |

ALL Z1–Z2. No intervals. No tempo.

**BUILD — 6–8 sessions/week:**
| Session | Type | Zone |
|---------|------|------|
| Easy run ×2–3 | Z1–Z2 | 30–45 min |
| Tempo or threshold ×1 | Z3–Z4 | 45 min |
| Intervals or hills ×1 | Z5 | 45 min |
| Long run ×1 | Z2 (last miles faster) | 75–120 min |
| Strength ×1 | Maintenance | 30–45 min |

**5K BUILD OVERRIDE:** Replace tempo with VO2max intervals (6–8×1000m at Z5). Keep 1 tempo (shorter, 15–20 min). Add strides after 2 easy runs/week.

**10K BUILD OVERRIDE:** Primary = cruise intervals (mile repeats at Z4). Secondary = longer intervals (1200–2000m at Z5).

**Half Marathon BUILD OVERRIDE:** Primary = tempo (30–45 min at Z4). Secondary = long run with HM pace segments.

**Marathon BUILD OVERRIDE:** Primary = MP long run (14–18 mi, last 8–12 at Z3). Secondary = progressive tempo.

**PEAK — 5–6 sessions/week:**
| Session | Type | Zone |
|---------|------|------|
| Easy run ×2 | Z1–Z2 | 30 min |
| Race-pace work ×1 | Z4 | 40 min |
| Intervals (reduced) ×1 | Z5 | 35 min |
| Long run (race-specific) ×1 | Z2–Z3 | 60–90 min |
| Strength ×1 (maintenance) | | 30 min |

**TAPER — 3–4 sessions/week:**
| Session | Type | Zone |
|---------|------|------|
| Easy run ×2–3 | Z1–Z2 | 20–30 min |
| Short race-pace opener ×1 | Z3–Z4 | 20 min |

**RACE WEEK — 1–2 easy runs + strides, then RACE DAY.**

### 4c. THE CRITICAL DIFFERENCE: "time_goal" vs "just_finish"

This is what's currently broken. The race.goal field MUST change the intensity distribution:

**"just_finish" — Conservative, volume-focused:**
| Phase | Intensity Distribution | Quality Sessions/Week |
|-------|----------------------|----------------------|
| Base | 90% easy / 10% moderate | 0 |
| Build | 85% easy / 15% moderate | 1 (tempo only, no VO2max) |
| Peak | 80% easy / 20% moderate | 1 (race-pace practice) |

Emphasis on completing the distance. Sessions are longer but easier. No hard intervals. Tempo runs are gentle (Z3, not Z4). Long runs/rides are the key sessions.

**"time_goal" — More aggressive, intensity-focused:**
| Phase | Intensity Distribution | Quality Sessions/Week |
|-------|----------------------|----------------------|
| Base | 80% easy / 20% moderate | 0–1 (strides only) |
| Build | 70% easy / 30% hard | 2 (tempo + intervals) |
| Peak | 70% easy / 30% hard | 2 (race-pace + intervals) |

Emphasis on hitting a target time. More threshold and VO2max work. Tempo runs are at Z4. Intervals are at Z5. Long runs include race-pace segments. Brick workouts simulate race conditions at target pace.

**"pr_podium" — Most aggressive:**
Same as time_goal but Build/Peak can go to 2–3 quality sessions/week (only for advanced athletes). Includes race simulations and dress rehearsals. Age constraints are relaxed one tier (a 61-year-old pr_podium athlete trains closer to how a standard 50-year-old would).

### 4c-ii. How Race Goal Modifies Age Constraints

The race goal acts as the intensity dial. A 61-year-old who selects "PR/Podium" is telling you they want to be pushed. A 25-year-old who selects "Just Finish" is telling you they want it easy.

| Age Group | just_finish | time_goal | pr_podium |
|-----------|-----------|-----------|-----------|
| Under 40 | Apply level constraints as-is, lean conservative (fewer quality sessions at low end of range) | Apply level constraints as-is, standard | Apply level constraints as-is, push to high end of quality session range |
| 40–49 | Rest +15%, Z5 work reduced 20%, longer warm-up | Rest +10%, standard age modifiers | Standard — minimal age modifiers, athlete accepts the risk |
| 50–59 | Rest +30%, Z5 reduced 50%, max session 70% baseline | Rest +25%, Z5 reduced 40%, max session 75% baseline (standard 50+ rules) | Rest +15%, Z5 reduced 20%, max session 85% baseline |
| 60+ | Rest +45%, NO Z5, volume –25%, joint-friendly subs only | Rest +40%, NO Z5, volume –20%, joint-friendly subs | Rest +25%, limited Z5 (1×/week short efforts only), volume –10%, joint-friendly subs preferred but not mandatory |

**The principle:** "Just finish" applies age modifiers more aggressively (protect the athlete). "PR/Podium" relaxes them (respect the athlete's ambition). But safety floors always apply — even a pr_podium 65-year-old still gets longer rest periods and careful volume management. We just don't lock them out of intensity work entirely.

### 4d. HOW TO MAP SESSIONS TO DAYS

The user's `buildPlanTemplate` tells you which sports go on which days. The phase template (4a/4b) tells you how many sessions of each type exist this week. Map them together:

1. Read the user's day preferences from buildPlanTemplate
2. Get the phase's session list (e.g., Build triathlon: 3 swim, 3 bike, 3 run, 1 strength)
3. Place KEY sessions first:
   - Long run → user's designated long day (usually Saturday or Sunday)
   - Long ride → ≥2 days away from long run
   - Intensity sessions → NOT adjacent to each other, NOT the day before/after long sessions
4. Fill remaining slots with easy/Z2 sessions
5. Validate constraints (Section 6)

**IMPORTANT:** Different weeks in the same phase should NOT be identical. Apply progressive overload:
- Long run week 1 of Build: 75 min → week 2: 82 min → week 3: 90 min → week 4 (deload): 60 min
- Interval count: week 1: 4×1K → week 2: 5×1K → week 3: 6×1K → week 4 (deload): 3×1K
- Max weekly volume increase: **10% (Beginner / Intermediate)** or **15% (Advanced)**. Never more than 15%.
- The cap is enforced on BOTH the weekly total minutes AND each keystone long session (long run, long ride) — a single long session cannot jump more than the cap between weeks even if the weekly total stays flat.
- Library workout picks that differ week-over-week must be duration-clamped to the cap — a 105-min workout one week and a 160-min workout the next is a violation even though both are "valid" long-session templates.
- Every 4th week: deload (reduce volume 30–40%, maintain intensity). After a deload week the ramp anchors on the deload's pre-cut base so week 5's rebuild can resume from the peak.

---

## 5. STRENGTH ROLE — How strengthRole Modifies Strength Sessions

The strengthRole (selected during onboarding for hybrid athletes) determines WHAT the strength sessions look like:

### 5a. Strength Session Shape by Role

| Strength Role | Frequency | Duration | Exercises | Rep Range | Focus |
|--------------|-----------|----------|-----------|-----------|-------|
| injury_prevention | 1–2×/week | 30–40 min | 3–4 exercises | 12–15 reps, controlled tempo | Core stability, hip/ankle mobility, single-leg balance, glute activation, upper back. Band work, bodyweight OK. |
| race_performance | 2×/week (Base), 1×/week (Build+) | 40–50 min | 4–6 exercises | 3–6 reps heavy (Base), 6–10 (Build) | Sport-specific: single-leg for runners, squat/hip for cyclists, lat/pull for swimmers |
| hypertrophy | 2–3×/week | 45–60 min | 6–8 exercises | 8–12 reps, moderate-heavy | Traditional hypertrophy splits (push/pull/legs or upper/lower). Machines + cables + dumbbells preferred. |
| minimal | 0–1×/week | 20–30 min | 3–4 exercises | Bodyweight circuits | Very light. 1 bodyweight circuit for runners (non-negotiable). Can skip for cyclists/swimmers. |

### 5b. Strength Role × Phase

| Phase | injury_prevention | race_performance | hypertrophy | minimal |
|-------|-------------------|------------------|-------------|---------|
| Base | 1–2×/week, stability | 2×/week, heavy compound | 2–3×/week, volume build | 1×/week, bodyweight |
| Build | 1–2×/week, same | 1×/week, sport-specific power | 2×/week, maintain | 0–1×/week |
| Peak | 1×/week, maintenance | 1×/week, maintenance | 1–2×/week, reduce volume | 0×/week |
| Taper | 0×/week | 0×/week | 0×/week | 0×/week |

### 5c. Strength Role × Endurance Goal Cross-Reference

| Endurance Goal + Strength Role | What Strength Sessions Look Like |
|-------------------------------|--------------------------------|
| Race + Injury Prevention | Band work, single-leg stability, glute activation, core anti-rotation. Short sessions (30 min). Never before key workouts. Place on easy cardio days. |
| Race + Race Performance | Heavy squats, single-leg RDLs, sport-specific power. KEY sessions — place strategically. Periodized: heavy in Base, sport-specific in Build, maintenance in Peak. |
| Race + Build Muscle | Traditional hypertrophy (8–12 reps, machines/cables). Cap at 2×/week in Build (don't interfere with race training). Reduce to 1×/week in Peak. |
| Race + Minimal | 1 bodyweight circuit/week on easy day. That's it. |
| Get Faster + any role | Strength supports speed: power emphasis, explosive movements, plyometrics (advanced only) |
| Lose Weight + any role | MINIMUM 2 strength sessions/week regardless of role. Compound lifts preserve muscle in deficit. This overrides the role's default frequency if it's lower. |
| Build Endurance + any role | Strength supports durability: muscular endurance, injury prevention. Don't create DOMS that impairs next day's long session. |

### 5d. Exercise Selection by Role

| Role | Equipment Bias | Prefer | Avoid |
|------|---------------|--------|-------|
| injury_prevention | Bodyweight → Band → Dumbbell | Single-leg work, core stability, mobility drills, glute bridges, clamshells, dead bugs | Heavy barbell movements, high-DOMS exercises |
| race_performance | Per sport: Barbell for cyclists, Bodyweight+DB for runners, Cable+Band for swimmers | Sport-specific: single-leg RDL (run), squat+leg press (bike), lat pulldown+face pulls (swim) | Exercises creating unnecessary soreness in race-specific muscles |
| hypertrophy | Machine → Cable → Dumbbell → Barbell | Traditional bodybuilding: chest press, lat pulldown, cable rows, leg press, curls, tricep pushdowns | Bodyweight-only (not enough load progression) |
| minimal | Bodyweight only | Push-ups, air squats, lunges, planks, glute bridges | Any equipment-dependent exercises |

---

## 6. CONSTRAINT VALIDATION — Post-Processing Pass

After generating all sessions, run these checks. Fix violations automatically.

| Constraint | Rule | Fix |
|-----------|------|-----|
| No adjacent hard days | Beginner: never. Intermediate: max 1 back-to-back pair/week, must follow with easy/rest day. Advanced: allowed with recovery protocol. | Beginner: move to next easy day. Intermediate: allow first pair, move any additional. Advanced: no action needed. |
| Intensity cap | Beginner: max 1 Z4+/week. Intermediate: max 2. Advanced: max 3. | Demote lowest-priority intensity session to Z2 |
| Rest day minimum | At least 1 full rest day per week (active recovery OK for advanced) | Remove lowest-priority session and replace with rest |
| No hard before long | Don't place Z4+ session the day before the long run or long ride | Swap with an easy session earlier in the week |
| Weekly volume cap | No more than **10%** total weekly volume increase week-over-week for Beginner / Intermediate; **15%** for Advanced. **Never exceeds 15% under any circumstance.** | Scale down this week's session durations proportionally until the total fits under `prior_week_total × (1 + cap)`. Preserve Z4+ / key-session minutes first; cut easy volume last. |
| Long-session ramp cap | No single `load: "long"` session (long run, long ride) increases by more than the same per-level cap vs the prior week's equivalent — even when a different library workout is swapped in. | Clamp the swapped-in workout's `duration_min` to `prior_long × (1 + cap)`. If the library has no shorter variant, reuse the prior week's workout scaled by the ramp. |
| Explicit day preservation | Days the user explicitly placed sessions on (via Schedule-screen chip edits, preferred-day inputs, or the long-day picker) are NEVER carved to rest by the distribution or rest-day enforcer. | Carve from unmarked days only. If no unmarked days remain and a rest is still owed, surface a warning to the user instead of silently overwriting an intended training day. |
| Deload enforcement | Every 4th week within a phase: reduce volume 30–40% | Shorten all sessions, drop 1–2 sessions, keep intensity |

### 6b. User Modifications — Soft Constraints After Generation

The constraint validator in Section 6 runs at **generation time** — it enforces hard rules before the plan is saved. But once the plan is on the calendar, the user can modify it (swap days, move sessions, add/remove). When they do:

**Never block the user.** They know their schedule better than we do. If they need to swim Monday and Tuesday because that's when the pool is open, let them.

**Show smart warnings, not errors.** When a modification creates a violation, display a non-blocking notification:

| Violation Detected | Warning Message (tone: helpful, not preachy) |
|-------------------|---------------------------------------------|
| Two hard sessions back-to-back | "Heads up — Tuesday and Wednesday are both intense sessions. Consider making one of them easier, or add extra recovery time." |
| No rest day in the week | "You don't have a rest day this week. Recovery is when your body adapts — consider swapping one session for rest." |
| 3+ intensity sessions in a week (beginner) | "That's a lot of hard days for one week. Your body may need more recovery between quality sessions." |
| Hard session day before long run/ride | "Tomorrow is your long ride — today's intervals might leave your legs heavy. Want to swap it to an easy day?" |
| Same muscle groups on consecutive days | "You've got pull day and a key swim back-to-back — both hit lats and back. Consider spacing them out." |

**What the warnings should NOT do:**
- Don't auto-rearrange the user's plan without permission
- Don't prevent them from saving
- Don't show warnings for minor issues (two easy sessions back-to-back is fine)
- Don't nag on every edit — only show when a real recovery/injury risk exists

**When to re-validate:** Run the soft constraint check whenever the user moves, adds, or swaps a session. Not on every page load — only on user action.

---

## 7. TEST CASES — Verify Against These

### Test Case 1: Chase's Ironman Madison

**Inputs:**
- Sports: swim, bike, run, strength
- Goal: race_performance (time_goal)
- Race: Ironman, Sep 13 2026
- Level: Advanced runner (19:40 5K, VDOT 50.8), Intermediate bike/swim (no data)
- Overall: Advanced
- Strength role: (whatever he selected)
- Days: 6/week

**Expected Output:**
- 21 weeks total, 5 phases
- Base (5 weeks): 9 sessions/week, ALL Z1–Z2, 2 strength sessions
- Build (7 weeks): 10 sessions/week, 2 quality sessions (threshold bike, tempo run), CSS intervals in swim, 1 strength, bricks start
- Peak (5 weeks): 11 sessions/week but shorter, race-pace work, dress rehearsal bricks, 1 strength maintenance
- Taper (3 weeks): 6 sessions/week, volume down 40–60%, short openers, no strength
- Race Week (1 week): 3 sessions + RACE DAY on Sep 13
- Long ride: Base w1=90min → Base w5=2h → Build w1=2h → Build w7=3h → Peak w1=2.5h → Taper=1h
- NO back-to-back hard days
- Deload every 4th week within each phase

### Test Case 2: Beginner 5K Runner (time_goal)

**Inputs:**
- Sports: running, strength
- Goal: race_performance (time_goal)
- Race: 5K, 8 weeks out
- Level: Beginner (5K time 30:00)
- Strength role: injury_prevention
- Days: 4/week

**Expected Output:**
- 8 weeks, 5 phases (Base 2, Build 3, Peak 1, Taper 1, Race Week 1)
- Base: 3 easy runs + 1 strength. NO intervals. NO tempo. Max 1 quality/week.
- Build: 2 easy + 1 VO2max intervals (because 5K + time_goal) + 1 long run + 1 strength
- BUT beginner cap = max 1 intensity session/week, so the VO2max session is the only hard one
- Taper: 7–10 days, 2 easy runs + strides
- Hour ceiling: 3–4 hrs/week

### Test Case 3: "Get Faster" Runner (no race)

**Inputs:**
- Sports: running, strength
- Goal: speed_performance
- No race
- Level: Intermediate
- Strength role: race_performance
- Days: 5/week

**Expected Output (4-week mesocycle):**
- Week 1: 2 easy runs + 1 tempo + 1 intervals + 1 long run + 1 strength = 6 sessions
- Week 2: Same structure, tempo slightly longer, intervals +1 rep
- Week 3: Same structure, overreach volume
- Week 4: Deload — 2 easy + 1 short tempo + 1 strength = 4 sessions
- Intensity: 70% easy / 30% quality (2 quality sessions/week for intermediate)
- NOT all Z2. Must have tempo + interval sessions.

### Test Case 4: "Lose Weight" (any sports)

**Inputs:**
- Sports: running, strength
- Goal: fat_loss
- No race
- Level: Intermediate
- Days: 5/week

**Expected Output:**
- Strength: 2–3×/week (NON-NEGOTIABLE, strength is #1 priority for fat_loss)
- Easy cardio: 2–3 runs at Z2
- Optional HIIT/circuit: 1×/week
- NO high-intensity running (avoid Z5 in caloric deficit)
- Hour ceiling: 5–8 hrs/week

---

## 8. WORKOUT CONTENT — What Each Session Actually Contains

Sections 4a–4d define WHICH session types go on which days (the weekly skeleton). This section defines WHAT'S INSIDE each session — the actual sets, intervals, paces, and rest periods the athlete sees on their screen.

### 8a. Universal Session Structure

Every workout follows this skeleton:

```
WARMUP → MAIN SET → COOLDOWN
```

| Component | Beginner | Intermediate | Advanced |
|-----------|----------|-------------|----------|
| Warmup | 10–15 min easy + dynamic stretching | 10–12 min easy + drills | 10–15 min easy + drills + activation |
| Main Set | 60–70% of total session time | 65–75% of total session time | 65–75% of total session time |
| Cooldown | 5–10 min easy + static stretching | 5–10 min easy | 5–10 min easy + mobility |

**For swim sessions:** Warmup = mixed easy strokes + drill set. Cooldown = 100–200m easy choice stroke.

### 8b. How Training Zones Become Real Paces

The plan generator never outputs "run at Z3." It outputs "run at 7:15/mile" (or the athlete's actual Z3 pace). The translation:

**Running (from VDOT / 5K time):**
| Zone | What It Means | Chase (19:40 5K, VDOT 50.8) |
|------|--------------|------------------------------|
| Z1 | Recovery jog | 9:30–10:00/mile |
| Z2 | Easy aerobic | 8:15–8:45/mile |
| Z3 | Tempo / Threshold | 7:05–7:20/mile |
| Z4 | VO2max intervals | 6:20–6:35/mile |
| Z5 | Speed / Repetition | 5:50–6:10/mile |

**Cycling (from FTP):**
| Zone | % of FTP | Description |
|------|----------|-------------|
| Z1 | < 55% | Active recovery |
| Z2 | 56–75% | Endurance |
| Z3 | 76–90% | Tempo / Sweet spot |
| Z4 | 91–105% | Threshold |
| Z5 | 106–120% | VO2max |

**Swimming (from CSS):**
| Zone | Offset from CSS | Description |
|------|----------------|-------------|
| Z1 | CSS + 15–20 sec/100m | Easy |
| Z2 | CSS + 5–10 sec/100m | Endurance |
| Z3 | CSS pace | Threshold |
| Z4 | CSS – 3–5 sec/100m | VO2max |

If the athlete has no test data for a sport (no FTP, no CSS), use RPE-based descriptions instead of pace/power targets: "moderate effort where you can hold a conversation" for Z2, "comfortably hard, can speak in short sentences" for Z3, etc.

### 8c. Volume Scaling by Week-Within-Phase

The same workout type gets progressively harder across weeks in a phase. The **workout repository** (Section 9) stores each workout with a `volumeRange` that defines its min and max parameters. The generator scales based on position:

```
Week 1 of phase: use min values (shortest intervals, fewest reps)
Week 2: interpolate 33% toward max
Week 3: interpolate 66% toward max
Week 4 (if not deload): use max values
Deload week: use 60–70% of Week 1 values
```

**Example — "Cruise Intervals" workout from the repository:**
- volumeRange: { reps: [3, 5], repDuration: "8 min", rest: "2 min" }
- Build Week 1: 3 × 8 min at Z3 with 2 min jog
- Build Week 2: 4 × 8 min at Z3 with 2 min jog
- Build Week 3: 5 × 8 min at Z3 with 2 min jog
- Build Week 4 (deload): 2 × 8 min at Z3 with 2 min jog

This way the repository stores the workout STRUCTURE, and the generator applies the athlete's zones + week position to produce the actual session.

### 8d. Session Type Reference — What the Generator Looks Up

When the phase template (Section 4) says "Tempo Run," the generator does this:

1. Query the workout repository: `sport = "run" AND sessionType = "tempo" AND phase INCLUDES "build" AND level INCLUDES "advanced"` (for Chase's example)
2. Get back 6–10 eligible workouts
3. Pick one not used in the last 4 weeks (see Section 9 selection algorithm)
4. Apply Chase's Z3 pace (7:15/mile) to the zone placeholders
5. Scale volume based on week-within-phase (8c)
6. Wrap in warmup/cooldown per 8a
7. Output the complete session to the calendar

**What the athlete sees on their screen:**
```
TEMPO RUN — Build Week 3
Warmup: 12 min easy jog (8:30/mile) + 4 × 100m strides
Main Set: 4 × 8 min at 7:15/mile with 2 min easy jog between
Cooldown: 10 min easy jog (9:00/mile)
Total: ~52 min
```

NOT "Tempo Run — Z3 — 45 min." The athlete gets the real paces, real structure, real times.

---

## 9. WORKOUT REPOSITORY — Admin-Curated Workout Library

### 9a. Ownership Model

The workout repository is **your content, not user data.** It lives in a Supabase table that regular users can only READ from during plan generation. Only admin (you) can create, edit, publish, or delete workouts.

| Role | Can Read | Can Create/Edit | Can Delete |
|------|----------|----------------|------------|
| Admin (you) | Yes | Yes | Yes |
| Regular user | Yes (via plan generator query) | No | No |
| Coach (future) | Yes | Can submit to review queue | No |

User training data (completed sessions, modifications, personal notes) lives in separate user-scoped tables and NEVER feeds back into the workout library. The library is a curated product — like a recipe book — not a crowdsourced wiki.

### 9b. Table Schema: `workout_library`

```sql
CREATE TABLE workout_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  name TEXT NOT NULL,                    -- "Cruise Intervals", "Ladder VO2max", "CSS Threshold Set"
  description TEXT,                      -- Short coach's note: "Great for building sustained power"
  
  -- Classification tags (used for querying)
  sport TEXT NOT NULL,                   -- "swim" | "bike" | "run" | "strength"
  session_type TEXT NOT NULL,            -- "easy" | "tempo" | "threshold" | "vo2max" | "race_pace" | "long" | "technique" | "intervals" | "sweet_spot" | "brick" | "recovery" | "strides"
  energy_system TEXT NOT NULL,           -- "aerobic" | "lactate_threshold" | "vo2max" | "neuromuscular" | "mixed"
  
  -- Eligibility filters
  phases TEXT[] NOT NULL,                -- ["base", "build", "peak", "taper"] — which phases this workout is appropriate for
  levels TEXT[] NOT NULL,                -- ["beginner", "intermediate", "advanced"] — which levels can do this workout
  race_distances TEXT[],                 -- ["5k", "10k", "half", "marathon", "sprint_tri", "olympic_tri", "half_ironman", "full_ironman"] — NULL means all distances
  race_goals TEXT[],                     -- ["just_finish", "time_goal", "pr_podium"] — NULL means all goals
  
  -- The actual workout content
  warmup JSONB NOT NULL,                 -- { description: "10 min easy jog + 4x100m strides", duration_min: 12 }
  main_set JSONB NOT NULL,               -- { description: "Cruise intervals at Z3", intervals: { reps: [3, 5], duration: "8 min", rest: "2 min", zone: "Z3" } }
  cooldown JSONB NOT NULL,               -- { description: "10 min easy jog", duration_min: 10 }
  
  -- Volume scaling parameters
  volume_range JSONB NOT NULL,           -- { reps: [3, 5] } or { duration_min: [20, 35] } — min to max, scaled by week position
  total_duration_range INT[] NOT NULL,   -- [40, 55] — estimated total session time in minutes (min, max)
  
  -- Admin management
  status TEXT NOT NULL DEFAULT 'draft',  -- "draft" | "published"
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast generator queries
CREATE INDEX idx_workout_library_query ON workout_library (sport, session_type, status)
  WHERE status = 'published';
```

### 9c. Main Set Structure — How Workouts Are Stored

The `main_set` JSONB field supports several workout patterns:

**Pattern 1: Repeating Intervals**
```json
{
  "type": "intervals",
  "description": "VO2max repeats",
  "intervals": {
    "reps": [4, 7],
    "duration": "3 min",
    "rest": "3 min jog",
    "zone": "Z4"
  }
}
```
Generator output (Build Week 2, Chase): "5 × 3 min at 6:25/mile with 3 min easy jog"

**Pattern 2: Continuous Effort**
```json
{
  "type": "continuous",
  "description": "Sustained tempo",
  "effort": {
    "duration_min": [20, 35],
    "zone": "Z3"
  }
}
```
Generator output (Build Week 3, Chase): "28 min continuous at 7:15/mile"

**Pattern 3: Ladder / Pyramid**
```json
{
  "type": "ladder",
  "description": "Ascending ladder",
  "steps": [
    { "duration": "2 min", "zone": "Z4" },
    { "duration": "3 min", "zone": "Z4" },
    { "duration": "4 min", "zone": "Z4" },
    { "duration": "3 min", "zone": "Z4" },
    { "duration": "2 min", "zone": "Z4" }
  ],
  "rest_between": "equal to work duration, easy jog",
  "scale_rule": "add_outer_steps",
  "reps_range": [3, 5]
}
```
Generator output: "Ladder: 2-3-4-3-2 min at 6:25/mile, rest = work duration easy jog"

**Pattern 4: Mixed Set (swim)**
```json
{
  "type": "mixed",
  "description": "CSS threshold set with variable distances",
  "blocks": [
    { "reps": [4, 6], "distance": "200m", "zone": "Z3", "rest": "20s" },
    { "reps": [2, 4], "distance": "100m", "zone": "Z4", "rest": "15s" }
  ]
}
```
Generator output (Build Week 2): "5×200m at CSS pace (1:45/100m) with 20s rest, then 3×100m at CSS-3sec with 15s rest"

**Pattern 5: Strength Circuit**
```json
{
  "type": "strength",
  "description": "Injury prevention lower body",
  "exercises": [
    { "name": "Single-leg RDL", "sets": [2, 3], "reps": "12 each", "load": "bodyweight or light DB" },
    { "name": "Clamshell", "sets": [2, 3], "reps": "15 each", "load": "band" },
    { "name": "Dead Bug", "sets": [2, 3], "reps": "10 each", "load": "bodyweight" },
    { "name": "Glute Bridge", "sets": [2, 3], "reps": "15", "load": "bodyweight or band" }
  ],
  "rest_between_exercises": "30–60s",
  "rest_between_sets": "30s"
}
```

### 9d. Selection Algorithm — How the Generator Picks Workouts

When the generator needs to fill a session slot, it runs this query and selection:

```
1. QUERY: SELECT * FROM workout_library
   WHERE sport = [needed sport]
   AND session_type = [needed type]
   AND [current phase] = ANY(phases)
   AND [athlete level] = ANY(levels)
   AND (race_distances IS NULL OR [race distance] = ANY(race_distances))
   AND (race_goals IS NULL OR [race goal] = ANY(race_goals))
   AND status = 'published'

2. FILTER OUT recently used:
   Check the athlete's plan — if this workout was used in the last 4 weeks,
   deprioritize it (don't exclude entirely, but push to bottom of list).
   
3. PICK: Weighted random from remaining pool.
   If pool has 8 workouts and 2 were used recently → pick from the 6 fresh ones.
   If ALL have been used recently (small pool) → pick least-recently-used.
   
4. PARAMETERIZE:
   - Replace zone placeholders with athlete's actual paces/power/HR
   - Scale volume_range based on week-within-phase (Section 8c)
   - Wrap in warmup/cooldown per athlete level (Section 8a)
   
5. STORE: Save the selected workout ID + parameterized output to the athlete's
   plan so the recency filter works for future weeks.
```

**Pool size target:** Aim for 8–12 published workouts per (sport × session_type × phase) combination. This gives ~2 months of unique workouts before repeating. You can start with fewer (4–6) and grow over time.

### 9e. Seed Categories — What to Build First

The admin portal should make it easy to see coverage gaps. Here's the priority order for seeding:

**Tier 1 (seed immediately — these are the most-used session types):**

| Sport | Session Type | Target Count |
|-------|-------------|-------------|
| Run | Easy / Z2 | 4–6 variants (different structures: steady, fartlek-light, progression) |
| Run | Tempo / Threshold | 8–10 variants |
| Run | VO2max Intervals | 8–10 variants |
| Run | Long Run | 6–8 variants (with different race-pace insertion patterns) |
| Bike | Z2 Endurance | 4–6 variants |
| Bike | Sweet Spot / Threshold | 8–10 variants |
| Bike | Long Ride | 4–6 variants |
| Swim | Technique / Drill | 6–8 variants |
| Swim | CSS Threshold | 8–10 variants |
| Swim | Endurance | 4–6 variants |
| Strength | Injury Prevention | 6–8 circuits |
| Strength | Race Performance | 6–8 sessions |
| Strength | Hypertrophy | 6–8 sessions per split day |

**Tier 2 (add after launch):**
- Brick workout structures
- Race-pace specific sessions
- Strides / neuromuscular sessions
- Recovery / active recovery sessions
- Sport-specific drills (open water swim, hill sprints, cadence drills)

**Tier 3 (nice-to-have):**
- Hyrox-specific workouts (sled, wall balls, farmers carry)
- Cross-training (rowing, elliptical)
- Mental rehearsal / visualization sessions

### 9f. Admin Portal Requirements (for Code)

The workout library admin page should provide:

1. **Table view** — all workouts, sortable/filterable by sport, session type, phase, level, status
2. **Coverage dashboard** — a matrix showing (sport × session_type × phase) with the count of published workouts in each cell. Color-coded: red (0), yellow (1–3), green (4+), blue (8+)
3. **Add Workout form** — dropdowns for all tag fields, structured editor for warmup/main_set/cooldown, JSON preview, save as draft or publish
4. **Edit existing** — click any row to edit
5. **Duplicate** — copy an existing workout and tweak it (fastest way to build variants)
6. **Status toggle** — draft ↔ published, with confirmation
7. **Preview** — show what the athlete would see for a sample athlete (e.g., "Preview as: Advanced runner, VDOT 50.8, Build Week 3")
8. **Usage stats (future)** — how many times each workout has been assigned across all plans

**Access control:** Admin portal is behind auth. Only your account (or accounts you designate) can access it. Regular user auth tokens cannot reach this page.

---

## 10. EXERCISE SELECTION SYSTEM — How Strength Exercises Are Picked

This section governs how individual exercises are chosen for strength sessions. The workout repository (Section 9) stores curated strength workouts with named exercises. This section defines the rules for when Code needs to dynamically select or substitute exercises (e.g., user equipment doesn't match, or building new workouts in the admin portal).

### 10a. Movement Patterns

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

### 10b. Exercise Tiers

| Tier | Role | Selection Probability |
|------|------|----------------------|
| Primary | Main compound lifts | 2× more likely than Secondary |
| Secondary | Supporting compounds | 2× more likely than Tertiary |
| Tertiary | Accessories, isolation | Baseline probability |

### 10c. Sub-Target Diversity

When picking multiple exercises from the same movement pattern, enforce sub-target diversity. Round-robin across unique sub-targets before repeating any.

| Pattern | Sub-Targets |
|---------|------------|
| Squat | quads-glutes (general), quads-emphasis, quads-glutes-adductors |
| Hinge | posterior-chain (general), glutes-hip-extension, hamstrings-knee-flexion, erectors-lower-back |
| Horizontal Push | general (flat bench), upper-chest, lower-chest, chest-isolation, triceps |
| Vertical Push | overhead-strength (general), side-delts, front-delts, rear-delts-scapular |
| Horizontal Pull | mid-back-lats (general), rear-delts-scapular |
| Vertical Pull | lats-vertical (general) |
| Core | core-stability (general), anti-rotation, obliques, lower-abs-hip-flexors, rectus-abdominis |

### 10d. Slot Templates

Strength sessions use slot templates that define the shape of the workout:

**Push Day:**
| Slot | Pattern | Tier |
|------|---------|------|
| 1 | horizontal-push | Primary |
| 2 | vertical-push | Primary |
| 3 | horizontal-push | Secondary (diverse from slot 1) |
| 4 | vertical-push | Secondary/Tertiary |
| 5 | isolation-arms (triceps) | Any |

**Pull Day:**
| Slot | Pattern | Tier |
|------|---------|------|
| 1 | horizontal-pull | Primary |
| 2 | vertical-pull | Primary |
| 3 | horizontal-pull | Secondary (diverse from slot 1) |
| 4 | vertical-pull | Secondary/Tertiary |
| 5 | isolation-arms (biceps) | Any |

**Leg Day:**
| Slot | Pattern | Tier |
|------|---------|------|
| 1 | squat | Primary |
| 2 | hinge | Primary |
| 3 | squat | Secondary (diverse from slot 1) |
| 4 | hinge | Secondary/Tertiary (diverse from slot 2) |
| 5 | isolation-legs | Any |

**Full Body:**
| Slot | Pattern | Tier |
|------|---------|------|
| 1 | squat | Primary |
| 2 | hinge | Primary |
| 3 | horizontal-push | Primary/Secondary |
| 4 | horizontal-pull or vertical-pull | Primary/Secondary |
| 5 | core or carry | Any |

### 10e. Goal-Specific Exercise Modifiers

| Goal | Prefer | Avoid/Deprioritize | Equipment Preference |
|------|--------|-------------------|---------------------|
| bulk | Machines, cables, isolation. Lat pulldown over pull-ups. | Bodyweight pulling (gets harder as weight increases) | Machine → Cable → DB → BB → BW |
| cut | Compound barbell (squat, bench, deadlift, OHP). Minimal isolation. | High-volume isolation, machine circuits | BB → DB → Cable → Machine → BW |
| strength_performance | Heavy barbell compounds. Accessories support main lifts. | Machines for primary slots. Max 1–2 isolation exercises. | BB → Trap bar → DB → Cable |
| fat_loss | Large compound movements. Supersets permitted for intermediate+. | Single-muscle-group isolation days | BB → DB → KB → BW → Machine |
| general_fitness | High variety. Rotate across mesocycles. | Don't repeat same exercises >2 mesocycles | Rotate — no fixed preference |
| race_performance | Sport-specific per Section 5d | Exercises creating DOMS in race-specific muscles | Per sport |
| speed_performance | Power-oriented: plyometrics (advanced), explosive lifts | Slow high-volume hypertrophy grinding | BB → BW (plyo) → DB → Med ball |
| endurance | Muscular endurance: higher reps (12–15), shorter rest | Heavy low-rep work creating excessive DOMS | BW → DB → KB → Cable |

**Session size by goal:**

| Goal | Exercises/Session | Sets/Exercise |
|------|-------------------|---------------|
| bulk | 6–8 | 3–4 |
| cut | 4–5 | 3 |
| strength_performance | 4–5 | 4–5 |
| fat_loss | 5–6 | 3 |
| general_fitness | 5–6 | 3 |
| race_performance | 4–6 | 3 |
| speed_performance | 4–5 | 3–4 |
| endurance | 5–6 | 2–3 |

**Technique modifiers (intermediate+ only, beginners always use straight sets):**

| Goal | Permitted Techniques |
|------|---------------------|
| bulk | Drop sets, supersets (antagonist pairs), rest-pause, slow eccentrics (3–4s). Apply to 1–2 accessories, never main compound. |
| cut | None — straight sets only. Don't add metabolic stress on top of deficit. |
| strength_performance | Pause reps, tempo work, cluster sets (advanced). Apply to main lifts. |
| fat_loss | Supersets (non-competing), EMOM finishers. Keeps HR elevated. |
| general_fitness | Occasional AMRAP finisher, circuit-style accessories. Keep it fun. |
| speed_performance | Explosive concentric, contrast sets (heavy squat + box jump). Advanced only. |
| endurance | Circuit-style accessories (3–4 exercises, minimal rest). Optional for intermediate+. |

### 10f. Equipment Matching

- `canBeBodyweight === true` → always available regardless of equipment profile
- `canBeBodyweight === false` → ALL items in `equipmentNeeded` must be in user's equipment list
- No equipment profile set → no filtering (assume full gym)

**Canonical equipment tokens:** bodyweight, dumbbells, barbell-rack, kettlebell, pull-up-bar, bench, cable-machine, functional-trainer, leg-press, leg-curl, leg-extension, smith-machine, ghd, ab-wheel, band, jump-rope, med-ball, rowing-machine, ski-erg, sled, sandbag, trap-bar, weight-plate, hip-abductor-adductor, chest-press-machine, chest-fly-machine, shoulder-press-machine, lat-pulldown, seated-row

### 10g. Strength Volume Guidelines

| Level | Sets/Muscle Group/Week | Rep Ranges | Rest Between Sets |
|-------|----------------------|------------|-------------------|
| Beginner | 8–12 | 8–12 (moderate) | 60–90s |
| Intermediate | 12–18 | 6–12 (varied) | 90–120s |
| Advanced | 16–22 | 3–12 (periodized) | 120–180s |

Volume increase cap: max 4 additional sets per muscle group per week, week-over-week.

### 10h. Same-Day Strength + Cardio Pairing

| Cardio Discipline | Recommended Strength Focus | Rationale |
|-------------------|--------------------------|-----------|
| Swim day | Pull + Core | Supports pulling power, shoulder stability |
| Bike day | Legs + Posterior chain | Supports pedaling force, hip extension |
| Run day | Core + Hip stability | Supports ground force, injury prevention |
| Rest/Easy day | Upper body, arms | No interference with sport-specific fatigue |

**Ordering:** Base phase = strength first, cardio second (building strength). Build/Peak = cardio first, strength second (cardio quality matters more).

---

## 11. NUTRITION & HYDRATION

### 11a. General Nutrition Principles

1. **Protein is king.** Most impactful macro target regardless of goal.
2. **Calorie floors are non-negotiable.** Min 1,200 cal/day (women), 1,500 cal/day (men). Never go below.
3. **Protein floor:** Never suggest less than 0.6 g/lb bodyweight.
4. **Start simple for beginners.** Calorie target + protein target. Full macro breakdowns optional.
5. **Fuel the work.** Training days may need more calories than rest days.
6. **No prohibited language.** Never use: "guaranteed results," "lose X lbs in Y days," "burn off that meal," "cure," "treat," "diagnose."

### 11b. Calorie Targets by Goal

| Goal | Calorie Adjustment from TDEE |
|------|------------------------------|
| Bulk | +10% to +20% |
| Maintenance / Race Performance | ±0% |
| Fat Loss / Cut | –15% to –25% |

TDEE is calculated using Mifflin-St Jeor equation with activity multiplier.

### 11c. Protein Targets

| Goal | Protein (g/lb bodyweight) |
|------|--------------------------|
| Muscle Gain / Bulk | 0.8–1.0 |
| Fat Loss / Cut (preserve muscle) | 0.8–1.2 |
| Endurance Performance | 0.6–0.8 |
| General Health / Maintenance | 0.6–0.8 |
| Speed Performance | 0.7–0.9 |

### 11d. Sport-Specific Nutrition

**Endurance (Running, Cycling, Triathlon):**
- Higher carbohydrate needs
- Pre-long session: carb-rich meal 2–3 hours before
- During sessions >60 min: 30–60g carbs/hour
- Post-session: carbs + protein for glycogen replenishment
- Race-day nutrition: practice in training, nothing new on race day

**Strength / Muscle Gain:**
- Pre-workout: carbs + protein 60–90 min before
- Post-workout: protein within 2 hours
- Optional calorie cycling: surplus on training days, maintenance on rest days

**Critical rule for fat_loss and cut:** Strength sessions are NOT optional. Losing weight without strength = losing muscle. Min 2 strength sessions/week regardless of other activities.

### 11e. Hydration

**Daily baseline:** 0.5 oz per pound of bodyweight per day. Adjust up for heat, altitude, and training.

**Training day:**
- Before: 16–20 oz in the 2 hours before training
- During (<60 min): sip as needed
- During (>60 min): 20–30 oz per hour, consider electrolytes
- After: 16–24 oz per pound lost during exercise

**Race day:** Practice hydration strategy in training. Electrolyte drink for endurance events. Hot weather: +25–50% intake, add sodium.

---

## 12. RECOVERY & ADAPTATION

### 12a. Recovery State Classification

Derived from weekly check-in data (sleep quality, energy level, soreness):

| State | Indicators | Training Modification |
|-------|-----------|----------------------|
| Good | Good sleep, high energy, no/mild soreness | Train as planned |
| Moderate | Fair sleep, moderate energy, moderate soreness | Reduce intensity 10%, add extra warm-up |
| Low | Poor sleep, low energy, severe soreness | Reduce volume 30–40%, cap at Z3, consider extra rest day |

### 12b. Adaptation Rules

- **2+ weeks "too hard" feedback:** Reduce volume 10–15%, add rest day
- **2+ weeks "too easy" feedback:** Increase volume 5–10% or add intensity session
- **Adherence < 60% for 2 weeks:** Simplify plan, reduce session count, check motivation
- **Post-illness/injury return:** Start at 50% of previous volume, rebuild over 2–3 weeks

### 12c. Deload Guidelines

| Aspect | Deload Modification |
|--------|-------------------|
| Volume | Reduce 40–60% |
| Intensity | Maintain (keep quality, less quantity) |
| Frequency | Maintain or slightly reduce |
| Duration | Shorter sessions |
| Strength | Reduce sets, maintain or slightly reduce weight |

### 12d. Plateau Prevention

**Cause 1 — Workout Monotony:** Same exercises in same order too long. The workout repository (Section 9) and its recency filter solve this — Code picks from a rotating pool of curated workouts.

**Cause 2 — Insufficient Stimulus:** Week-over-week progression must be enforced within each mesocycle. The "too easy" response (12b) triggers volume/intensity increase.

**Cause 3 — Overtraining:** Deload system (12c), recovery classification (12a), and mandatory rest days guard against this. "Too hard" response must trigger volume reduction, not encouragement to push through.

**Cause 4 — Inadequate Nutrition:** Can't build muscle or perform without fuel. Nutrition safety floors (Section 14) enforce minimums. Flag users whose targets are at the floor — they may be under-fueling.

---

## 13. HYROX SUPPORT

### 13a. Hyrox Periodization

| Phase | Ratio | Focus |
|-------|-------|-------|
| Base | 30% | Running aerobic base, general strength foundation, learn station movements |
| Build | 35% | Station-specific strength, running intervals, combination workouts |
| Peak | 20% | Race simulations, pacing practice, station transitions under fatigue |
| Taper | 10% | Volume reduction, maintain intensity, sharpen |
| Race Week | 5% | Openers, rest, race execution |

Hyrox demands 50/50 running fitness and functional strength. Base builds both independently. Build combines them. Peak simulates race conditions.

### 13b. The 8 Hyrox Stations

| Station | Work | Primary Demand | Key Training Exercises |
|---------|------|---------------|----------------------|
| 1. SkiErg | 1000m | Upper body pulling endurance | SkiErg practice, lat pulldowns, tricep work |
| 2. Sled Push | 50m | Leg drive, core bracing | Squats, leg press, wall sits, sled push |
| 3. Sled Pull | 50m | Grip, back, posterior chain | Deadlifts, rows, rope climbs, sled pull |
| 4. Burpee Broad Jumps | 80m | Full body power | Burpees, broad jumps, box jumps |
| 5. Rowing | 1000m | Full body pulling endurance | Rowing intervals, deadlifts, lat pulldowns |
| 6. Farmer Carry | 200m | Grip endurance, core stability | Farmer carries, dead hangs, loaded walks |
| 7. Sandbag Lunges | 100m | Quad/glute endurance under load | Weighted lunges, Bulgarian splits, goblet squats |
| 8. Wall Balls | 75/100 reps | Quad/shoulder endurance | Wall balls, thrusters, front squats, OHP |

### 13c. Hyrox Session Distribution

**Base:** 3 easy runs + 2–3 strength (heavy compound) + 1 station practice = 6–8 sessions
**Build:** 2 easy runs + 1 interval run + 1 station circuit + 1 run+station combo (KEY) + 1–2 strength = 6–8 sessions
**Peak:** 2 easy runs + 1 race-pace combo + 1 interval run + 1 station circuit + 1 strength maintenance = 5–7 sessions
**Taper:** 2 easy runs + 1 short opener combo = 3–4 sessions

### 13d. Hyrox Key Workouts

| Workout | Description | When |
|---------|-------------|------|
| The 1K Sandwich | 1K run → 1 station → 1K run → 1 station (4 stations) | Build + Peak, 1×/week |
| Station Circuit | All 8 stations back-to-back, no running, timed | Build, 1×/week |
| Half Sim | 4 stations + 4×1K runs at race effort | Peak, every 2 weeks |
| Full Sim | All 8 stations + 8×1K runs at race effort | Peak, 1–2 times total |
| Grip Blaster | Farmer carry 4×100m + dead hang 3×30s + sled pull 3×25m | Build, 1×/week |

### 13e. Hyrox Hour Ceilings

| Level | Hours/Week |
|-------|-----------|
| Beginner | 5–7 |
| Intermediate | 7–10 |
| Advanced | 10–14 |

### 13f. Hyrox Equipment Substitutions

| Station Equipment | Substitute |
|-------------------|-----------|
| SkiErg | Battle ropes, band pull-aparts + burpees, rowing machine |
| Sled push | Wall sits + heavy goblet squats, prowler, resistance band walks |
| Sled pull | Heavy rows + banded pulls, seated cable rows |
| Rower | SkiErg, assault bike, or running intervals at Z4 |
| Wall balls | Thrusters with dumbbells, goblet squat + overhead press |

Farmer carry, sandbag lunges, and burpee broad jumps can be trained with basic equipment.

---

## 14. SAFETY BOUNDARIES

These are hard constraints the validator enforces on every generated plan. They cannot be overridden.

1. **Calorie floor:** Min 1,200 cal/day (women), 1,500 cal/day (men)
2. **Protein floor:** Never below 0.6 g/lb bodyweight
3. **Volume increase cap:** Max 15% weekly increase for endurance, max 4 sets/muscle/week for strength
4. **Recovery day minimum:** At least 1 recovery day/week. Beginner/Intermediate = full rest. Advanced = full rest OR active recovery (Z1).
5. **Deload requirement:** Plans longer than 4 weeks must include deload weeks
6. **Beginner guardrails:** Max 4 training days/week (unless explicitly requested), max 5 exercises/session, no VO2max work in first 4 weeks
7. **Prohibited language:** Never use "guaranteed results," "lose X lbs in Y days," "burn off that meal," "cure," "treat," "diagnose"
8. **Wellness disclaimer:** Every plan includes: "This plan provides general wellness guidance and is not a substitute for professional medical advice."
9. **Max long run proportion:** Never more than 30% of weekly mileage
10. **No brick workouts within 14 days of race day.** Even easy bricks create transition stress. Taper brick = first week of taper only.

---

## 15. COACHING TONE

| Level | Tone |
|-------|------|
| Beginner | Encouraging, clear, non-judgmental, educational without being overwhelming |
| Intermediate | Motivating, evidence-informed, progressively challenging |
| Advanced | Precise, data-driven, trusts the athlete's self-regulation |

**Always:**
- Celebrate consistency over performance
- Frame rest as productive, not lazy
- Explain the "why" behind each workout (rationale)
- Be honest about trade-offs ("you can train 6 days but recovery matters more")

**Never:**
- Shame, guilt, or use fear-based motivation
- Promise specific outcomes ("you WILL PR")
- Use body-shaming language
- Promote overtraining as dedication

---

## APPENDIX A: Quick Reference — "What Changes What"

| Input | What It Changes |
|-------|----------------|
| 5K time / FTP / CSS | Level → intensity cap, constraint rules, complexity. Also generates training zones (§8b) that parameterize every workout from the repository. |
| race.goal (time_goal vs just_finish) | Intensity distribution (70/30 vs 85/15), quality session count. Also filters workout repository — "just_finish" excludes VO2max workouts (§9d). |
| race.type (Ironman vs 5K) | Phase ratios, session distribution templates, hour ceiling. Also filters workout repository by race_distances tag (§9b). |
| race.date | Total weeks → phase lengths |
| strengthRole | Strength session frequency, duration, exercises, rep ranges |
| trainingGoals (speed vs endurance vs fat_loss) | Session type priority, intensity split, strength importance |
| buildPlanTemplate (day preferences) | Which days get which sessions |
| daysPerWeek | Total session count (can't exceed available days) |
| equipmentProfile | Which exercises are available for strength sessions |
| athlete level | Constraint caps (intensity/week, consecutive days, rest days). Also filters workout repository by level tag and scales warmup/cooldown (§8a). |
| weight | Nutrition targets (protein = g/lb × weight). Does NOT affect workouts. |
| height | Currently unused in training logic. |
| age | Recovery modifiers: 40+ gets longer rest, 50+ gets reduced Z5, 60+ gets no Z5 (modified by race.goal) |
| race.goal | Drives intensity: "just_finish" = conservative constraints, "time_goal" = standard, "pr_podium" = aggressive. Overrides age defaults when appropriate (see §4c) |
| week-within-phase | Scales workout volume from repository's volume_range (§8c): week 1 = min, last week = max, deload = 60–70% of min |
| workout_library (Supabase) | Admin-curated workout pool. Generator queries by sport + session_type + phase + level + race_distance + race_goal, then picks with recency filter (§9d). |

---

## APPENDIX B: Training Zones Reference

### Running Zones (VDOT-Based, Jack Daniels 6-Zone Model)

| Zone | Name | Intensity | Purpose | Typical Workouts |
|------|------|-----------|---------|-----------------|
| Z1 | Recovery | Very easy | Active recovery, blood flow | Recovery runs, warm-up/cool-down |
| Z2 | Easy | Conversational | Aerobic base, fat oxidation | Easy runs, long runs (most miles here) |
| Z3 | Marathon/Tempo | Moderate | Threshold endurance | Tempo runs, cruise intervals |
| Z4 | Threshold | Comfortably hard | Lactate threshold improvement | Tempo runs, cruise intervals |
| Z5 | Interval | Hard | VO2max development | Track intervals, hill repeats |
| Z6 | Repetition | Very hard/sprint | Speed, neuromuscular power | Short repeats (200–400m), strides |

**Zone derivation:** Zones calculated from VDOT, derived from a recent race result. User inputs race distance + time → app calculates VDOT → derives pace ranges. If threshold pace entered directly, VDOT is reverse-calculated.

**Important:** Easy pace is a RANGE (e.g., 8:23–9:13/mile), not a single number. Z1 = everything slower than slow end of Easy. Z2 IS the Easy range.

### Cycling Zones (FTP-Based, 7-Zone)

| Zone | Name | % FTP |
|------|------|-------|
| Z1 | Active Recovery | < 55% |
| Z2 | Endurance | 56–75% |
| Z3 | Tempo | 76–90% |
| Sweet Spot | — | 88–94% |
| Z4 | Threshold | 91–105% |
| Z5 | VO2max | 106–120% |
| Z6 | Anaerobic | > 120% |

### Swimming Zones (CSS-Based)

**CSS Test Protocol:** Swim 400m all-out, rest 5–10 min, swim 200m all-out. CSS = (400m – 200m) / (400m time – 200m time). Gives pace/100m at threshold.

| Zone | Relative to CSS |
|------|----------------|
| Z1 Recovery | CSS + 15s/100m or more |
| Z2 Aerobic | CSS + 5–10s/100m |
| Z3 Threshold | CSS pace |
| Z4 VO2max | CSS – 3–5s/100m |
| Z5 Sprint | Max effort |

---

## APPENDIX C: VDOT Reference Table

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

Full VDOT table (range 30–85) maintained in the VDOT calculation module.

---

## APPENDIX D: Profile-Driven Session Modifiers

| Attribute | Beginner | Intermediate (Baseline) | Advanced |
|-----------|----------|------------------------|----------|
| Swim distance | –30% to –40% | Baseline | +15% to +25% |
| Run/Bike distance | –20% to –30% | Baseline | +15% to +20% |
| Working sets | –30% (fewer intervals) | Baseline | +20% (more intervals) |
| Rest periods | +30% longer | Baseline | –20% shorter |
| Exercise complexity | Basic drills only | Standard drills | Advanced drills + technique |
| Zone ceiling | Z3 max (no Z4/Z5) | Z4 available | Z5 available, VO2max |
| Stroke variety (swim) | Freestyle + kick only | Free + back + breast | All strokes including butterfly + IM |

### Swim Session Parameter Tables

**Endurance Session (45 min, intermediate):**

| Parameter | Easy | Moderate | Hard |
|-----------|------|----------|------|
| Total distance | 1,800m | 2,300m | 2,800m |
| Main set zone | Z1–Z2 | Z2–Z3 | Z3–Z4 |
| Main set structure | Continuous 1,000m | 4×300m w/ 15s rest | 6×200m w/ 10s rest |
| Rest between sets | 20–30s | 15–20s | 10–15s |

**CSS Intervals Session (45 min, intermediate):**

| Parameter | Easy | Moderate | Hard |
|-----------|------|----------|------|
| Total distance | 1,600m | 2,200m | 2,800m |
| Interval distance | 200m repeats | 100–200m repeats | 50–100m repeats |
| Interval count | 4–6 | 6–10 | 10–16 |
| Target pace | CSS + 5s/100m | CSS pace | CSS – 2s/100m |
| Rest ratio | 1:1 | 3:1 | 4:1 |

Apply beginner/advanced modifiers from the table above on top of these.

---

## APPENDIX E: Weakness Bias System (Multi-Sport Athletes)

**How weakness is identified:**
- Compare sport-specific levels (swim novice vs run advanced = swim is weakness)
- Compare race split performance against peers at same level
- Self-reported weakness from profile

**Weakness bias adjustments (pick one, never stack):**
- Add +1 session/week in weak discipline, OR
- Upgrade an existing session type (easy swim → CSS intervals), OR
- Increase technical focus (more drill work, form cues)

**Critical rule:** Never increase running frequency first when addressing a weakness. Running has the highest injury risk per additional session. If run is the weakness, upgrade session quality (add tempo/intervals) rather than adding a 4th or 5th run day. Swim and cycling are safer to add frequency.

---

**END OF DOCUMENT**
