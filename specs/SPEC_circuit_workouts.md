# IronZ Circuit Workouts — Feature Spec

## Overview

Circuit is a new workout type in IronZ for mixed-modality, round-based workouts that blend strength, cardio, and bodyweight exercises in structured sequences. Think CrossFit WODs, bootcamp circuits, and functional fitness programming.

This is distinct from the existing HIIT type (which is time-based work/rest intervals). Circuits are exercise-based rounds with repeat blocks, mixed cardio/strength, and optional time-tracking goals.

## ⚠️ APPROVED MOCKUP — MATCH THIS EXACTLY

**mockups/circuit-mockup.html** is the approved visual reference for all circuit UI. Open it in a browser and match:
- Card layout, colors, spacing, typography, and border-radii
- Repeat block rendering (orange badge, indented children, background color)
- Visual strip proportions and colors (red = exercise, cyan = cardio, gray = rest)
- Goal badges (red for For Time, orange for AMRAP, gray for Standard)
- Time badge placement (top-right of card header)
- PR comparison styling (green background tint, green text)
- Builder layout (drag handles, nested repeat blocks with dashed add-button, action row at bottom)
- Completion modal (large time input, PR comparison card, button row)
- Library card layout (name, description, meta badges, chevron)

Every screen in the mockup maps to a section in this spec. Do not deviate from the mockup's visual design — treat it like a Figma handoff.

---

## 1. Data Model

### Canonical Step Tree

Circuit workouts use the same nested step tree structure as swim workouts. Three step kinds:

```js
{
  type: "circuit",
  name: "Murph",
  goal: "for_time",              // "for_time" | "amrap" | "standard"
  goal_value: null,              // AMRAP: time cap in minutes; for_time: target/PR in seconds; standard: null
  benchmark_id: "murph",         // null for custom circuits
  total_rounds: null,            // derived from step tree
  equipment: ["pullup bar"],     // derived from exercises
  steps: [
    {
      kind: "cardio",
      name: "Run",
      distance_m: 1609,          // 1 mile
      distance_display: "1 mile",
      duration_sec: null,        // null = no time target for this segment
      notes: null
    },
    {
      kind: "repeat",
      count: 20,
      children: [
        { kind: "exercise", name: "Pull-ups", reps: 5, weight: null, weight_unit: null, notes: null },
        { kind: "exercise", name: "Push-ups", reps: 10, weight: null, weight_unit: null, notes: null },
        { kind: "exercise", name: "Air Squats", reps: 15, weight: null, weight_unit: null, notes: null }
      ]
    },
    {
      kind: "cardio",
      name: "Run",
      distance_m: 1609,
      distance_display: "1 mile",
      duration_sec: null,
      notes: null
    }
  ]
}
```

### Step Kinds

**exercise** — a strength or bodyweight movement
```js
{
  kind: "exercise",
  name: "Deadlift",
  reps: 15,
  weight: 135,                   // null for bodyweight
  weight_unit: "lbs",            // "lbs" | "kg" | null
  per_side: false,               // true for unilateral (e.g., "8 per hand")
  notes: "touch and go"          // optional coaching cue
}
```

**cardio** — a running, rowing, cycling, or walking segment
```js
{
  kind: "cardio",
  name: "Row",
  distance_m: 500,
  distance_display: "500m row",
  duration_sec: null,            // alternative: time-based (e.g., "5 min incline walk")
  notes: null
}
```

**rest** — explicit rest between blocks
```js
{
  kind: "rest",
  duration_sec: 60,
  notes: "catch your breath"     // optional
}
```

**repeat** — a round/circuit block containing children steps
```js
{
  kind: "repeat",
  count: 5,                      // number of rounds
  children: [ /* exercise, cardio, or rest steps */ ]
}
```

Repeat blocks can NOT be nested (no repeat-inside-repeat). This keeps the UI and renderer simple while covering every real-world circuit pattern we've seen.

### Goal Modes

- **For Time**: Complete the workout as fast as possible. User logs their completion time. Track PRs across attempts.
- **AMRAP** (As Many Rounds As Possible): Set a time cap (e.g., 20 minutes). User logs total rounds + partial reps completed.
- **Standard**: Just complete the work. No time tracking, no score. Used for warm-up circuits, prehab routines, etc.

---

## 2. Benchmark Library

Pre-loaded named circuit workouts. Users can browse these, tap to preview, save to their library, and log attempts with time/score tracking.

### Launch Library

**Classic Benchmarks:**

| Name | Goal | Structure |
|------|------|-----------|
| Murph | For Time | 1mi run → 20×[5 pull-ups, 10 push-ups, 15 squats] → 1mi run |
| Cindy | AMRAP 20min | Max rounds of [5 pull-ups, 10 push-ups, 15 squats] |
| Fran | For Time | 21-15-9 of [thrusters @95lb, pull-ups] |
| Helen | For Time | 3×[400m run, 21 KB swings @53lb, 12 pull-ups] |
| Filthy Fifty | For Time | 50 each of [box jumps, jumping pull-ups, KB swings, walking lunges, knees-to-elbows, push press, back extensions, wall balls, burpees, double-unders] |

**User-Submitted (from initial testing):**

| Name | Goal | Structure |
|------|------|-----------|
| Warm-up Circuit | Standard | 5min incline walk → 5×[10 chest pulls, 10 glute bridges, 10 hip 90/90] → 10×[5 chin-ups, 10 push-ups, 10 box jumps] → Abs |
| 3-2-1 Mile Pyramid | For Time | 1mi run → 3×[15 DL, 15 ball toss squats, 8 OH snatches/hand @40lb, 20 push-ups] → 1mi → 2×[same] → 1mi → 1×[same] |
| Row Chipper | For Time | 500m row → 100 push-ups → 1000m row → 80 burpees → 2000m row → 60 squats |

### Library UX

- Accessible from: Add Session → Circuit → "Browse Library" tab (alongside "Build Custom" and "Ask IronZ")
- Each benchmark shows: name, goal type badge, estimated duration, equipment needed, exercise count
- Tap to preview full step tree
- "Save to My Workouts" button
- "Start This Workout" button → logs it to today's calendar with time/score tracking
- Users can also create and save their own circuits to the library

---

## 3. UI — Circuit Card (Calendar / Day Detail)

### Card Header
```
⚡ Murph                                    32:45
   Logged · Circuit · For Time              ▼ PR: 31:20
```

- Lightning bolt or circuit icon
- Workout name
- Completion time (for "For Time") or rounds completed (for AMRAP)
- PR indicator if this is their best time (or within 5% of PR)

### Step Rendering

Flat steps render as rows. Repeat blocks render as indented groups with a round count badge:

```
┌─────────────────────────────────────────────────┐
│ 🏃 Run                                  1 mile  │
├─────────────────────────────────────────────────┤
│ 20 ROUNDS                                       │
│   ├ Pull-ups                           5 reps   │
│   ├ Push-ups                          10 reps   │
│   └ Air Squats                        15 reps   │
├─────────────────────────────────────────────────┤
│ 🏃 Run                                  1 mile  │
└─────────────────────────────────────────────────┘
```

For descending structures (3-2-1 pyramid), each repeat block renders separately:

```
┌─────────────────────────────────────────────────┐
│ 🏃 Run                                  1 mile  │
├─────────────────────────────────────────────────┤
│ 3 ROUNDS                                        │
│   ├ Deadlifts                    15 × 135 lbs   │
│   ├ Ball Toss Squats                  15 reps   │
│   ├ OH Snatches               8/hand × 40 lbs   │
│   └ Push-ups                          20 reps   │
├─────────────────────────────────────────────────┤
│ 🏃 Run                                  1 mile  │
├─────────────────────────────────────────────────┤
│ 2 ROUNDS                                        │
│   ├ (same circuit)                               │
├─────────────────────────────────────────────────┤
│ 🏃 Run                                  1 mile  │
├─────────────────────────────────────────────────┤
│ 1 ROUND                                         │
│   ├ (same circuit)                               │
└─────────────────────────────────────────────────┘
```

### Visual Strip

The color strip at the top of the card uses:
- **Red/orange** for exercise steps (strength work)
- **Blue/cyan** for cardio steps (run, row)
- **Gray** for rest
- Repeat blocks expand into N colored segments

### Completion Flow

After tapping "Mark as Complete":
- **For Time**: Prompt for completion time (mm:ss). Show PR comparison if they've done this workout before.
- **AMRAP**: Prompt for rounds completed + partial reps. Show PR comparison.
- **Standard**: Just mark done, optional notes.
- Then the normal rating modal → Strava share prompt (if connected).

---

## 4. UI — Circuit Builder (Manual Entry)

When user picks "Circuit" in Add Session → Manual:

```
┌─────────────────────────────────────────────────┐
│ ← Back    Build Circuit                      ✕  │
├─────────────────────────────────────────────────┤
│ WORKOUT NAME                                    │
│ [e.g. Monday Burner                        ]    │
│                                                 │
│ GOAL                                            │
│ [For Time ▾]   Target: [mm:ss          ]        │
├─────────────────────────────────────────────────┤
│                                                 │
│ ⠿ 🏃 Run · 1 mile                          ✕   │
│                                                 │
│ ⠿ ┌ 3 ROUNDS ──────────────────────────┐   ✕   │
│   │ ⠿ Deadlifts · 15 reps · 135 lbs  ✕ │       │
│   │ ⠿ Push-ups · 20 reps             ✕ │       │
│   │ [+ Add Exercise]                    │       │
│   └─────────────────────────────────────┘       │
│                                                 │
│ [+ Add Exercise]  [+ Add Cardio]  [+ Add Round] │
│                                                 │
│ [ Save Session ]                                │
└─────────────────────────────────────────────────┘
```

- **+ Add Exercise**: Adds an exercise step (name with autocomplete, reps, weight, per-side toggle)
- **+ Add Cardio**: Adds a cardio step (name, distance or duration)
- **+ Add Round**: Creates a repeat block — prompts for round count, then user adds exercises inside it
- **Drag handles (⠿)**: Reorder steps, or drag an exercise into a repeat block to group it
- Exercise name input uses the same autocomplete from the exercise database
- **Rest steps**: Added via a small "+" between any two steps (not a top-level button — keeps the builder clean)

---

## 5. AI Generation

### Plan Generator

When generating a training plan that includes circuit days, the plan generator should emit circuit workouts using the canonical step tree. Circuit days are appropriate for:
- "Functional fitness" or "CrossFit-style" plans
- Triathlon cross-training days
- General fitness plans that want variety
- Any plan where the user mentions circuits, WODs, or mixed-modality work

### Ask IronZ

Add a CIRCUIT-SPECIFIC section to the Ask IronZ prompt:

```
CIRCUIT-SPECIFIC: For circuit/WOD/CrossFit-style workouts, emit the canonical step tree 
with kinds: "exercise", "cardio", "rest", "repeat". Every exercise must have name + reps 
(+ weight if applicable). Every cardio step must have distance or duration. Use repeat 
blocks for rounds. Set goal to "for_time", "amrap", or "standard". Include a benchmark_id 
if it's a known WOD.

Example — user asks for "give me a Murph":
{
  type: "circuit",
  name: "Murph",
  goal: "for_time",
  benchmark_id: "murph",
  steps: [
    { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" },
    { kind: "repeat", count: 20, children: [
      { kind: "exercise", name: "Pull-ups", reps: 5 },
      { kind: "exercise", name: "Push-ups", reps: 10 },
      { kind: "exercise", name: "Air Squats", reps: 15 }
    ]},
    { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" }
  ]
}
```

---

## 6. Strava Integration

Circuit workouts push to Strava as type "Workout" (Strava's generic activity type).

Description format (respecting user's share card toggle preferences):

```
Murph — Circuit · For Time

1 mile run
20 rounds:
  5 Pull-ups
  10 Push-ups
  15 Air Squats
1 mile run

Time: 32:45
PR: 31:20

Built with IronZ — ironz.fit
```

---

## 7. PR Tracking

For benchmark workouts (and any circuit the user repeats):
- Store completion time (for_time) or rounds+reps (amrap) per attempt
- Show PR on the card when viewing a completed circuit
- Show PR comparison on the completion prompt ("Your time: 32:45 — PR is 31:20, 1:25 off your best")
- Stats tab: circuit PR history chart (time over attempts, like a decreasing line for for_time or increasing for amrap)

---

## 8. Implementation Order

1. **Data model + type registration** — Add "Circuit" to the workout type enum, define the step tree schema, add to type picker
2. **Circuit card renderer** — Display circuit workouts on calendar / day detail with step tree, repeat blocks, goal badge
3. **Circuit builder** — Manual entry form with Add Exercise / Add Cardio / Add Round, drag reorder
4. **Benchmark library** — Pre-loaded WODs, browse/preview/save/start flow
5. **Completion flow** — Time/score logging, PR tracking, Strava share
6. **AI generation** — Plan generator + Ask IronZ circuit support
7. **PR tracking** — History, comparisons, stats tab integration

---

## 9. Files to Create/Modify

- `js/circuit-workout.js` — new module: data model, step tree helpers, total distance/round calculator
- `js/data/benchmark-wods.js` — new module: pre-loaded benchmark library
- `js/ui/circuit-builder.js` — new module: manual circuit entry form
- `js/ui/circuit-card.js` — new module: circuit card renderer for calendar/day detail
- `calendar.js` — wire up circuit type in Add Session, day detail rendering
- `workouts.js` — add Circuit to type picker, completion flow
- `strava-integration.js` — add circuit description builder
- `philosophy-planner.js` — Ask IronZ circuit prompt + response parsing
- `style.css` — circuit card styles, builder styles, repeat block indentation
- `index.html` — load new modules

---

## 10. Benchmark Library Data

Full step trees for launch benchmarks. These should live in `js/data/benchmark-wods.js`.

### Murph
```js
{
  id: "murph",
  name: "Murph",
  goal: "for_time",
  description: "Named after Navy Lieutenant Michael Murphy. Wear a 20lb vest for Rx.",
  equipment: ["pullup bar"],
  estimated_min: 30,
  steps: [
    { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" },
    { kind: "repeat", count: 20, children: [
      { kind: "exercise", name: "Pull-ups", reps: 5 },
      { kind: "exercise", name: "Push-ups", reps: 10 },
      { kind: "exercise", name: "Air Squats", reps: 15 }
    ]},
    { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" }
  ]
}
```

### Cindy
```js
{
  id: "cindy",
  name: "Cindy",
  goal: "amrap",
  goal_value: 20,
  description: "20-minute AMRAP. Simple but brutal.",
  equipment: ["pullup bar"],
  estimated_min: 20,
  steps: [
    { kind: "repeat", count: null, children: [
      { kind: "exercise", name: "Pull-ups", reps: 5 },
      { kind: "exercise", name: "Push-ups", reps: 10 },
      { kind: "exercise", name: "Air Squats", reps: 15 }
    ]}
  ]
}
```

### Fran
```js
{
  id: "fran",
  name: "Fran",
  goal: "for_time",
  description: "The benchmark sprint. 21-15-9 rep scheme.",
  equipment: ["barbell", "pullup bar"],
  estimated_min: 8,
  steps: [
    { kind: "repeat", count: 1, children: [
      { kind: "exercise", name: "Thrusters", reps: 21, weight: 95, weight_unit: "lbs" },
      { kind: "exercise", name: "Pull-ups", reps: 21 }
    ]},
    { kind: "repeat", count: 1, children: [
      { kind: "exercise", name: "Thrusters", reps: 15, weight: 95, weight_unit: "lbs" },
      { kind: "exercise", name: "Pull-ups", reps: 15 }
    ]},
    { kind: "repeat", count: 1, children: [
      { kind: "exercise", name: "Thrusters", reps: 9, weight: 95, weight_unit: "lbs" },
      { kind: "exercise", name: "Pull-ups", reps: 9 }
    ]}
  ]
}
```

### Helen
```js
{
  id: "helen",
  name: "Helen",
  goal: "for_time",
  description: "Three rounds of run, swing, pull.",
  equipment: ["kettlebell", "pullup bar"],
  estimated_min: 12,
  steps: [
    { kind: "repeat", count: 3, children: [
      { kind: "cardio", name: "Run", distance_m: 400, distance_display: "400m" },
      { kind: "exercise", name: "Kettlebell Swings", reps: 21, weight: 53, weight_unit: "lbs" },
      { kind: "exercise", name: "Pull-ups", reps: 12 }
    ]}
  ]
}
```

### Filthy Fifty
```js
{
  id: "filthy-fifty",
  name: "Filthy Fifty",
  goal: "for_time",
  description: "50 reps of 10 movements. A true chipper.",
  equipment: ["box", "pullup bar", "kettlebell", "barbell", "GHD", "wall ball", "jump rope"],
  estimated_min: 25,
  steps: [
    { kind: "exercise", name: "Box Jumps", reps: 50, notes: "24in" },
    { kind: "exercise", name: "Jumping Pull-ups", reps: 50 },
    { kind: "exercise", name: "Kettlebell Swings", reps: 50, weight: 35, weight_unit: "lbs" },
    { kind: "exercise", name: "Walking Lunges", reps: 50 },
    { kind: "exercise", name: "Knees-to-Elbows", reps: 50 },
    { kind: "exercise", name: "Push Press", reps: 50, weight: 45, weight_unit: "lbs" },
    { kind: "exercise", name: "Back Extensions", reps: 50 },
    { kind: "exercise", name: "Wall Balls", reps: 50, weight: 20, weight_unit: "lbs" },
    { kind: "exercise", name: "Burpees", reps: 50 },
    { kind: "exercise", name: "Double-Unders", reps: 50 }
  ]
}
```

### Warm-up Circuit (User-submitted)
```js
{
  id: "warmup-circuit-1",
  name: "Warm-up Circuit",
  goal: "standard",
  description: "Mobility warm-up into bodyweight power circuit.",
  equipment: ["cable machine", "box", "pullup bar"],
  estimated_min: 35,
  steps: [
    { kind: "cardio", name: "Incline Walk", duration_sec: 300, distance_display: "5 min" },
    { kind: "repeat", count: 5, children: [
      { kind: "exercise", name: "Chest Pulls", reps: 10 },
      { kind: "exercise", name: "Glute Bridges", reps: 10 },
      { kind: "exercise", name: "Hip 90/90", reps: 10 }
    ]},
    { kind: "repeat", count: 10, children: [
      { kind: "exercise", name: "Chin-ups", reps: 5 },
      { kind: "exercise", name: "Push-ups", reps: 10 },
      { kind: "exercise", name: "Box Jumps", reps: 10 }
    ]},
    { kind: "exercise", name: "Abs", reps: null, notes: "Dealer's choice" }
  ]
}
```

### 3-2-1 Mile Pyramid (User-submitted)
```js
{
  id: "321-mile-pyramid",
  name: "3-2-1 Mile Pyramid",
  goal: "for_time",
  description: "Descending rounds with a mile between each. Mental and physical grinder.",
  equipment: ["barbell", "medicine ball", "kettlebell/dumbbell"],
  estimated_min: 45,
  steps: [
    { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" },
    { kind: "repeat", count: 3, children: [
      { kind: "exercise", name: "Deadlifts", reps: 15 },
      { kind: "exercise", name: "Ball Toss Squats", reps: 15 },
      { kind: "exercise", name: "Overhead Snatches", reps: 8, weight: 40, weight_unit: "lbs", per_side: true },
      { kind: "exercise", name: "Push-ups", reps: 20 }
    ]},
    { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" },
    { kind: "repeat", count: 2, children: [
      { kind: "exercise", name: "Deadlifts", reps: 15 },
      { kind: "exercise", name: "Ball Toss Squats", reps: 15 },
      { kind: "exercise", name: "Overhead Snatches", reps: 8, weight: 40, weight_unit: "lbs", per_side: true },
      { kind: "exercise", name: "Push-ups", reps: 20 }
    ]},
    { kind: "cardio", name: "Run", distance_m: 1609, distance_display: "1 mile" },
    { kind: "repeat", count: 1, children: [
      { kind: "exercise", name: "Deadlifts", reps: 15 },
      { kind: "exercise", name: "Ball Toss Squats", reps: 15 },
      { kind: "exercise", name: "Overhead Snatches", reps: 8, weight: 40, weight_unit: "lbs", per_side: true },
      { kind: "exercise", name: "Push-ups", reps: 20 }
    ]}
  ]
}
```

### Row Chipper (User-submitted)
```js
{
  id: "row-chipper",
  name: "Row Chipper",
  goal: "for_time",
  description: "Ascending row distances with descending bodyweight reps.",
  equipment: ["rower"],
  estimated_min: 30,
  steps: [
    { kind: "cardio", name: "Row", distance_m: 500, distance_display: "500m" },
    { kind: "exercise", name: "Push-ups", reps: 100 },
    { kind: "cardio", name: "Row", distance_m: 1000, distance_display: "1000m" },
    { kind: "exercise", name: "Burpees", reps: 80 },
    { kind: "cardio", name: "Row", distance_m: 2000, distance_display: "2000m" },
    { kind: "exercise", name: "Squats", reps: 60 }
  ]
}
```
