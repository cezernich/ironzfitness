# Cardio Add Session — Sport-Specific Fields & Profile-Driven Generation

## Problem

The Add Session (Quick Entry) flow for cardio workouts uses a single generic form with only "Intensity" (easy/moderate/hard/long) and "Duration" for all cardio types — running, cycling, and swimming. Meanwhile, Build Plan has rich sport-specific session type dropdowns (4 swim types, 7 cycling types, running sub-types). Add Session needs parity.

Additionally, **the generators do not read the user's profile**. A 22-year-old competitive swimmer and a 55-year-old beginner get identical workouts if they select the same intensity and duration. Age, weight, experience, goal, and fitness level must influence generated workouts.

---

## 1. Sport-Specific Session Type Dropdowns

When a user selects a cardio sport in Add Session, the form should show a **Session Type** dropdown specific to that sport, replacing the generic "Intensity" dropdown. The session type inherently encodes intensity.

### 1.1 Swimming Session Types

| Value | Label | Description |
|---|---|---|
| `technique` | Technique | Drill-focused, easy pace |
| `endurance` | Endurance | Continuous aerobic swimming |
| `css_intervals` | CSS Intervals | Threshold pace repeats |
| `speed_sprint` | Speed / Sprint | Short fast repeats |

**Additional swim-specific fields:**

- **Pool Size** selector: `25m` / `50m` / `25yd` (saved to localStorage, persists across sessions)
- **Intensity** selector (in addition to session type): `Easy` / `Moderate` / `Hard`
  - Easy: more Z1-Z2 work, longer rest intervals, fewer working sets
  - Moderate: mix of Z2-Z3, standard rest, standard volume
  - Hard: more Z4-Z5 work, shorter rest, more working sets, longer total distance

### 1.2 Cycling Session Types

| Value | Label | Description |
|---|---|---|
| `z2_endurance` | Zone 2 Endurance | Long aerobic base ride |
| `tempo` | Tempo | Z3 sustained pace |
| `threshold` | Threshold | FTP intervals |
| `vo2_intervals` | VO2 Intervals | Short hard repeats |
| `sweet_spot` | Sweet Spot | 88-94% FTP blocks |
| `recovery_spin` | Recovery Spin | Easy flush ride |
| `long_ride` | Long Ride | Longest ride of the week |

### 1.3 Running Session Types

Running may already have sub-types in Build Plan. For parity, Add Session should include:

| Value | Label | Description |
|---|---|---|
| `easy_recovery` | Easy / Recovery | Z1-Z2 easy effort |
| `tempo` | Tempo | Z3-Z4 sustained effort |
| `intervals` | Intervals | Speed work with rest |
| `hills` | Hills | Incline repeats |
| `fartlek` | Fartlek | Unstructured speed play |
| `long_run` | Long Run | Longest run of the week |

### 1.4 UI Changes

Replace the current generic cardio form (`qe-step-1-cardio`) with sport-specific sub-forms:

```
User taps "Swimming" → Show:
  - Session Type dropdown (Technique / Endurance / CSS Intervals / Speed/Sprint)
  - Intensity (Easy / Moderate / Hard)
  - Duration dropdown
  - Pool Size (25m / 50m / 25yd) — small pill selector, persists
  - Notes (optional)
  - [Generate Workout] [Log Manually]

User taps "Cycling" → Show:
  - Session Type dropdown (Zone 2 / Tempo / Threshold / VO2 / Sweet Spot / Recovery / Long Ride)
  - Duration dropdown
  - Notes (optional)
  - [Generate Workout] [Log Manually]

User taps "Running" → Show:
  - Session Type dropdown (Easy / Tempo / Intervals / Hills / Fartlek / Long Run)
  - Duration dropdown
  - Notes (optional)
  - [Generate Workout] [Log Manually]
```

Note: For cycling and running, the session type already encodes intensity (Recovery Spin = easy, VO2 Intervals = hard), so a separate intensity dropdown is not needed. Swimming is the exception because technique drills can be done at varying intensities.

---

## 2. Profile-Driven Workout Generation

### 2.1 Profile Attributes That Must Influence Generation

The user profile already contains all physical attributes needed. **Do NOT add new profile fields.** Instead, derive sport-specific levels from threshold data the user has already provided.

| Field | Source | Available Today |
|---|---|---|
| Age | `profile-age` | Yes |
| Weight | `profile-weight` (lbs) | Yes |
| Height | `profile-height` (in) | Yes |
| Gender | `profile-gender` | Yes |
| Primary Goal | `profile-goal` | Yes |
| Swim Level | **Derived from CSS pace** | Yes (if threshold provided) |
| Cycling Level | **Derived from FTP** | Yes (if threshold provided) |
| Running Level | **Derived from threshold pace / race times** | Yes (if threshold provided) |

### 2.2 Deriving Sport-Specific Levels from Threshold Data

The app already prompts users to enter threshold data. If they haven't, there's an existing alert nudging them to go populate it. The generators should read whatever threshold data is available and classify automatically:

**Swimming — Derive from CSS (Critical Swim Speed) pace per 100m:**

| CSS Pace | Derived Level | Profile |
|---|---|---|
| > 2:30 /100m | Novice | Learning strokes, limited endurance |
| 1:45 – 2:30 /100m | Intermediate | Comfortable with laps, knows basic strokes |
| < 1:45 /100m | Competitive | Structured training, multiple strokes |

**Cycling — Derive from FTP (Functional Threshold Power) in watts/kg:**

| FTP (w/kg) | Derived Level | Profile |
|---|---|---|
| < 2.0 w/kg | Beginner | New to structured cycling |
| 2.0 – 3.5 w/kg | Intermediate | Regular rider, familiar with zones |
| > 3.5 w/kg | Advanced | Races or does structured power-based training |

**Running — Derive from threshold pace or recent race times:**

| Threshold Pace (min/mile) | Derived Level | Profile |
|---|---|---|
| > 10:00 /mile | Beginner | New to running or casual jogger |
| 7:30 – 10:00 /mile | Intermediate | Regular runner, has done races |
| < 7:30 /mile | Advanced | Structured training, competitive |

**Fallback when no threshold data exists:**
- Default to `intermediate` for all sports
- Show existing alert: "Set your threshold paces in Settings for more personalized workouts"
- Do NOT block workout generation — just use intermediate defaults

### 2.3 How Profile Modifies Generated Workouts

#### 2.3.1 Experience Level → Volume & Complexity

| Attribute | Beginner Modifier | Intermediate (Baseline) | Advanced Modifier |
|---|---|---|---|
| Total distance (swim) | −30% to −40% | Baseline | +15% to +25% |
| Total distance (run/bike) | −20% to −30% | Baseline | +15% to +20% |
| Number of working sets | −30% (fewer intervals) | Baseline | +20% (more intervals) |
| Rest periods | +30% longer | Baseline | −20% shorter |
| Exercise complexity | Basic drills only | Standard drills | Advanced drills + technique work |
| Zone ceiling | Z3 max (no Z4/Z5 work) | Z4 available | Z5 available, VO2max intervals |
| Stroke variety (swim) | Freestyle + kick only | Free + back + breast | All strokes including butterfly + IM |

#### 2.3.2 Age → Recovery & Intensity

| Age Group | Modification |
|---|---|
| Under 30 | No modification (baseline) |
| 30-39 | Rest periods +10%, recovery notes included |
| 40-49 | Rest periods +15%, Z5 work reduced by 20%, warm-up extended by 5 min |
| 50-59 | Rest periods +25%, Z5 work reduced by 40%, max session duration capped at 75% of baseline, warm-up/cool-down mandatory and extended |
| 60+ | Rest periods +40%, no Z5 work unless profile explicitly marked advanced, volume reduced 20%, joint-friendly exercise substitutions |

#### 2.3.3 Goal → Session Emphasis

| Goal | Swim Emphasis | Cycling Emphasis | Running Emphasis |
|---|---|---|---|
| Endurance | Longer continuous sets, build aerobic base | Z2 focus, sweet spot, long rides | Easy pace emphasis, long runs, tempo |
| Speed | Short sprint repeats, VO2 sets | VO2 intervals, threshold work | Speed work, intervals, fartlek |
| Weight Mgmt | Higher total volume at moderate intensity | Z2-Z3, longer duration | Easy-moderate pace, higher frequency |
| Strength | Shorter sessions, power-focused (paddles, resistance) | Hill repeats, high-gear work | Hills, strength-oriented fartlek |
| General | Balanced mix of all session types | Balanced | Balanced |

#### 2.3.4 Weight/Gender → Pace & Power Estimates

- Weight affects estimated caloric burn displayed on the workout card
- Gender affects HR zone estimates if no wearable data (women average 5-10 bpm higher)
- Neither weight nor gender should change workout structure — only the performance estimates and coaching notes

### 2.4 Intensity × Session Type → Concrete Workout Parameters (Swimming Example)

Here's how intensity modifies a 45-minute swim session for an intermediate swimmer:

**Endurance session:**

| Parameter | Easy | Moderate | Hard |
|---|---|---|---|
| Total distance | 1,800m | 2,300m | 2,800m |
| Warm-up | 400m free easy | 400m mixed | 300m mixed (shorter) |
| Main set zone | Z1-Z2 | Z2-Z3 | Z3-Z4 |
| Main set structure | Continuous 1,000m | 4 × 300m with 15s rest | 6 × 200m with 10s rest |
| Working set rest | 20-30s | 15-20s | 10-15s |
| Cool-down | 400m choice easy | 200m choice easy | 200m easy |

**CSS Intervals session:**

| Parameter | Easy | Moderate | Hard |
|---|---|---|---|
| Total distance | 1,600m | 2,200m | 2,800m |
| Interval distance | 200m repeats | 100-200m repeats | 50-100m repeats |
| Interval count | 4-6 | 6-10 | 10-16 |
| Target pace | CSS + 5s/100m | CSS pace | CSS − 2s/100m |
| Rest ratio | 1:1 (work:rest) | 3:1 | 4:1 |
| Cool-down | 400m easy | 300m easy | 200m easy |

Apply beginner/advanced modifiers from 2.3.1 on top of these tables.

---

## 3. Implementation Notes

### 3.1 Reading Profile in Generators

Every generator function (`qeGenerateCardio`, and any swim/cycling/running-specific generators) must read the user profile before building the workout:

```javascript
const profile = JSON.parse(localStorage.getItem('profile') || '{}');
const age = parseInt(profile.age) || 30;
const weight = parseInt(profile.weight) || 165;
const gender = profile.gender || '';
const goal = profile.goal || 'general';

// Derive sport-specific levels from threshold data (NOT from profile fields)
const swimCSS = parseFloat(profile.cssTime) || null;  // seconds per 100m
const cyclingFTP = parseFloat(profile.ftp) || null;    // watts
const runThreshold = parseFloat(profile.thresholdPace) || null;  // min/mile

const swimLevel = deriveSwimLevel(swimCSS);      // novice / intermediate / competitive
const cyclingLevel = deriveCyclingLevel(cyclingFTP, weight);  // beginner / intermediate / advanced
const runningLevel = deriveRunLevel(runThreshold); // beginner / intermediate / advanced

function deriveSwimLevel(cssPer100m) {
  if (!cssPer100m) return 'intermediate'; // fallback
  if (cssPer100m > 150) return 'novice';        // > 2:30/100m
  if (cssPer100m > 105) return 'intermediate';   // 1:45 – 2:30/100m
  return 'competitive';                           // < 1:45/100m
}

function deriveCyclingLevel(ftpWatts, weightLbs) {
  if (!ftpWatts) return 'intermediate'; // fallback
  const wPerKg = ftpWatts / (weightLbs * 0.4536);
  if (wPerKg < 2.0) return 'beginner';
  if (wPerKg <= 3.5) return 'intermediate';
  return 'advanced';
}

function deriveRunLevel(thresholdMinPerMile) {
  if (!thresholdMinPerMile) return 'intermediate'; // fallback
  if (thresholdMinPerMile > 10) return 'beginner';
  if (thresholdMinPerMile >= 7.5) return 'intermediate';
  return 'advanced';
}
```

### 3.2 No New Profile Fields Needed

**Do NOT add experience level fields to Settings.** All sport-specific levels are derived from threshold data that the app already collects (CSS pace, FTP, threshold pace, race times).

If a user hasn't entered their threshold data, the existing alert system already prompts them: "Set your threshold paces in Settings for more personalized workouts." The generators fall back to `intermediate` until threshold data is available.

### 3.3 Remove Self-Reported Fitness Level from All Surveys

The self-reported "Fitness Level" dropdown (beginner/intermediate/advanced) must be removed everywhere it appears. It is now redundant — levels are derived from threshold data.

**Known locations to remove:**

1. **Build Plan survey** — `<select id="fitness-level">` (line ~228 in index.html). Remove the entire form-row containing the Fitness Level label and dropdown.
2. **Any onboarding flow** — if the onboarding survey asks "What is your fitness level?", remove that question.
3. **Any JS that reads `fitness-level` or `fitnessLevel`** — search the entire codebase for references and replace with the threshold-derived level from `classifyUser()`.
4. **localStorage** — if `profile.fitnessLevel` is being stored, stop writing it. Don't break reads (old data may still exist), just stop using it for any logic.

**What replaces it:** The generators and plan builder should call `deriveSwimLevel()`, `deriveCyclingLevel()`, `deriveRunLevel()` (from Section 3.1) using the user's threshold data. If no threshold data exists, default to `intermediate`.

### 3.4 Threshold Refresh Reminders

Users should be nudged to re-test their threshold data periodically. As they train, their CSS pace, FTP, and threshold pace will improve, and stale thresholds lead to workouts that are too easy or too hard.

**Rules:**

- **Reminder interval:** 3 months (90 days) since last threshold update
- **Track per-sport:** Each threshold has its own `lastUpdated` timestamp
  - `profile.cssTimeUpdated` — last time CSS pace was set/changed
  - `profile.ftpUpdated` — last time FTP was set/changed
  - `profile.thresholdPaceUpdated` — last time running threshold was set/changed
- **When to show reminder:** On any Add Session or Build Plan screen for the relevant sport, if the threshold is >90 days old, show a subtle banner:
  - "Your swim threshold was last updated 4 months ago. Re-test to keep workouts calibrated." with a "Update" link to the threshold settings.
  - Same pattern for cycling FTP and running threshold pace.
- **Don't block:** The reminder is informational, not a gate. Users can dismiss it and still generate workouts.
- **Dismiss behavior:** "Dismiss" hides the banner for 14 days, then it reappears. "Update" navigates to the threshold input in Settings.
- **If threshold was never set:** Use the existing alert system ("Set your threshold paces for more personalized workouts"). The refresh reminder only applies to thresholds that WERE set but are now stale.

**Storage shape:**
```javascript
// Stored in localStorage alongside the profile
profile.cssTimeUpdated = '2026-01-15T00:00:00Z';
profile.ftpUpdated = '2026-02-20T00:00:00Z';
profile.thresholdPaceUpdated = '2026-03-01T00:00:00Z';

// Dismissed state
localStorage.setItem('threshold_reminder_dismissed', JSON.stringify({
  swim: '2026-04-13T00:00:00Z',    // dismissed until +14 days
  cycling: null,
  running: '2026-04-10T00:00:00Z'
}));
```

### 3.5 Backward Compatibility

All existing users default to `intermediate` for all sports until they provide threshold data. No re-onboarding required. The system gets smarter automatically as users fill in their thresholds. Old `profile.fitnessLevel` data can remain in localStorage but is never read.

---

## 4. Summary of Changes

1. **Add Session UI**: Replace generic cardio form with sport-specific sub-forms for swimming, cycling, and running (session type dropdowns, pool size for swim)
2. **No new profile fields**: Sport-specific levels derived from existing threshold data (CSS, FTP, threshold pace). Falls back to intermediate if not set.
3. **Remove self-reported fitness level**: Delete the "Fitness Level" dropdown from Build Plan survey, onboarding, and any JS that reads it. Replace all references with threshold-derived levels.
4. **Generator logic**: All cardio generators must read user profile (age, weight, goal) and derive sport level from thresholds, then apply modifiers
5. **Intensity impact**: Session type + intensity together determine concrete workout parameters (distance, sets, rest, zones)
6. **Swim pool size**: Persisted selector that converts all distances to the correct pool unit
7. **Threshold refresh reminders**: Nudge users to re-test thresholds every 90 days. Subtle banner on Add Session / Build Plan screens, dismissable for 14 days.
