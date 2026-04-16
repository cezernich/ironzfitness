# Multi-Race Aware Planner — Implementation Spec

## Overview

Refactor `generateTrainingPlan()` to accept the **full race calendar**, build the training arc backwards from the **single A race**, and insert micro-taper/recovery windows around **B races**. Only one A race is allowed. B races are tune-ups that serve the A race — they never drive the plan.

---

## Core Rules (Non-Negotiable)

1. **One A race maximum.** The UI must enforce this. If a user tries to mark a second race as A, swap the previous A to B. Show a toast: "Only one A race allowed — [previous race name] moved to B."
2. **The A race defines the entire training arc.** Periodization phases (Base → Build → Peak → Taper → Race) are calculated backwards from the A race date.
3. **B races are speed bumps, not pivots.** The plan continues through B races with minor volume adjustments. You never rebuild, re-periodize, or switch discipline focus for a B race.
4. **No discipline dropout for B races.** If the A race is an Ironman (swim/bike/run), a B race half marathon does NOT cause swim and bike sessions to disappear. The full tri training continues. The week of the B race, run volume is adjusted but swim/bike stays.
5. **B race taper is a micro-taper, not a full taper.** 3 days before: reduce volume ~30%, keep intensity moderate. Race day: race. 2-3 days after: easy recovery. Then snap back to the A race plan.

---

## Data Structures

### raceEvents (localStorage + Supabase sync)

```javascript
// Existing structure — no changes needed to the schema
raceEvents: [
  {
    id: "uuid-or-index",          // unique identifier
    category: "triathlon",         // triathlon | running | cycling | swimming | hyrox | other
    type: "Full Ironman (140.6)",  // distance/format string
    name: "Ironman Wisconsin",     // user-entered, optional
    date: "2026-09-06",            // ISO date string
    priority: "A",                 // "A" or "B" — ONLY ONE "A" ALLOWED
    goal: "just_finish",           // just_finish | time_goal | pr_podium
    leadIn: {                      // only for gap-fill scenarios
      phase: "structured",         // structured | speed | loose
      daysPerWeek: 4
    }
  },
  {
    id: "uuid-or-index-2",
    category: "running",
    type: "Half Marathon",
    name: "Chicago Half",
    date: "2026-07-19",
    priority: "B",
    goal: "time_goal",
    leadIn: null
  }
]
```

### Generated Plan Output (what goes into generated_plans)

```javascript
{
  races: [
    { ...raceEvent, role: "A" },
    { ...raceEvent, role: "B" }
  ],
  arc: {
    startDate: "2026-04-21",       // first training day
    aRaceDate: "2026-09-06",
    totalWeeks: 20,
    phases: [
      { name: "Base", startWeek: 1, endWeek: 5, focus: "aerobic foundation, movement quality" },
      { name: "Build", startWeek: 6, endWeek: 11, focus: "volume ramp, race-specific intensity" },
      { name: "Peak", startWeek: 12, endWeek: 16, focus: "race simulation, high specificity" },
      { name: "Taper", startWeek: 17, endWeek: 19, focus: "volume reduction, sharpening" },
      { name: "Race Week", startWeek: 20, endWeek: 20, focus: "easy movement, race prep" }
    ],
    bRaceWindows: [
      {
        raceId: "uuid-or-index-2",
        raceDate: "2026-07-19",
        taperStart: "2026-07-16",  // 3 days before
        recoveryEnd: "2026-07-22", // 3 days after
        adjustments: "reduce run volume 30%, drop long run, keep swim/bike easy, no intervals"
      }
    ]
  },
  weeklyTemplate: { ... },  // per-phase weekly session distribution
  sessions: [ ... ]          // the actual day-by-day session array
}
```

---

## Implementation Steps

### Step 1: Enforce One A Race in UI (onboarding-v2.js / bp-3-race screen)

**Where:** The `bp-3-race` screen in `js/onboarding-v2.js` (or wherever the race entry form logic lives).

**What to change:**
- When user adds a race, first race defaults to A.
- When user adds a second race via "+ Add Another Race", it defaults to B.
- If user taps the priority badge to toggle a B race to A, the previous A race automatically becomes B.
- Show a brief toast/callout when the swap happens.
- The priority badge is tappable: `onclick="toggleRacePriority(raceIndex)"`.

**New function:**
```javascript
function toggleRacePriority(index) {
  const races = collectRaceEntries();  // gather all race form data
  if (races[index].priority === 'A') {
    // Already A — toggle to B
    races[index].priority = 'B';
  } else {
    // Switching to A — demote current A to B
    races.forEach(r => { if (r.priority === 'A') r.priority = 'B'; });
    races[index].priority = 'A';
  }
  rerenderRaceEntries(races);
  showToast('A race updated');
}
```

**Validation on "Continue":** If no A race is set and there are races, auto-promote the earliest race to A and confirm with user. If there are zero races (no-race path), skip this entirely.

---

### Step 2: Sort and Structure Race Data on Plan Save

**Where:** The plan save flow — `_confirmAndSavePlan()` or equivalent in the Build Plan done screen.

**What to change:** Before calling `generateTrainingPlan()`, sort and validate the race list:

```javascript
function prepareRaceCalendar(raceEvents) {
  // 1. Sort by date ascending
  const sorted = [...raceEvents].sort((a, b) => new Date(a.date) - new Date(b.date));

  // 2. Validate exactly one A race
  const aRaces = sorted.filter(r => r.priority === 'A');
  if (aRaces.length === 0) {
    // No A race — treat earliest race as A
    sorted[0].priority = 'A';
  } else if (aRaces.length > 1) {
    // Multiple A races — keep only the latest as A, demote rest to B
    aRaces.slice(0, -1).forEach(r => { r.priority = 'B'; });
  }

  // 3. Filter out any B races that fall AFTER the A race (irrelevant to this plan)
  const aRace = sorted.find(r => r.priority === 'A');
  const relevant = sorted.filter(r =>
    r.priority === 'A' || new Date(r.date) < new Date(aRace.date)
  );

  return { aRace, bRaces: relevant.filter(r => r.priority === 'B'), all: relevant };
}
```

---

### Step 3: Refactor generateTrainingPlan() — Multi-Race Aware

**Where:** `js/planner.js` (or `js/rules-engine.js` if the philosophy engine is in place).

**Current signature:** `generateTrainingPlan(race)` — takes a single race object.

**New signature:** `generateTrainingPlan(raceCalendar)` — takes the full prepared race calendar.

```javascript
function generateTrainingPlan(raceCalendar) {
  const { aRace, bRaces, all } = raceCalendar;

  // ═══ PHASE 1: Build the A-race arc ═══
  const today = new Date();
  const aDate = new Date(aRace.date);
  const totalWeeks = Math.floor((aDate - today) / (7 * 86400000));

  // Determine periodization based on A race type
  const phases = buildPeriodization(aRace, totalWeeks);
  // Returns: [{name, startWeek, endWeek, focus, weeklyTemplate}]
  // weeklyTemplate has session distribution per discipline

  // ═══ PHASE 2: Generate day-by-day sessions from the A-race phases ═══
  let sessions = generateSessionsFromPhases(phases, aRace);
  // Returns: [{date, discipline, sessionType, intensity, durationMin, name, exercises[], zone, ...}]

  // ═══ PHASE 3: Insert B-race micro-taper windows ═══
  for (const bRace of bRaces) {
    sessions = insertBRaceWindow(sessions, bRace, aRace);
  }

  // ═══ PHASE 4: Apply lead-in block if gap exists ═══
  if (aRace.leadIn && aRace.leadIn.phase !== 'loose') {
    const leadInSessions = generateLeadIn(aRace.leadIn, phases[0].startDate);
    sessions = [...leadInSessions, ...sessions];
  }

  return {
    races: all,
    arc: {
      startDate: sessions[0]?.date || _toDateStr(today),
      aRaceDate: aRace.date,
      totalWeeks,
      phases,
      bRaceWindows: bRaces.map(br => describeBRaceWindow(br, aRace))
    },
    sessions
  };
}
```

---

### Step 4: Build Periodization from A Race

**Function:** `buildPeriodization(aRace, totalWeeks)`

This is the heart of the planner. It determines phase lengths based on race type and available weeks.

```javascript
function buildPeriodization(aRace, totalWeeks) {
  // Phase ratios by race type (approximate — adjust per your coaching philosophy)
  const PHASE_RATIOS = {
    // Ironman / Half Ironman
    'triathlon': { base: 0.25, build: 0.30, peak: 0.25, taper: 0.15, raceWeek: 0.05 },
    // Marathon / Half Marathon
    'running':   { base: 0.25, build: 0.35, peak: 0.20, taper: 0.15, raceWeek: 0.05 },
    // Century / gran fondo
    'cycling':   { base: 0.25, build: 0.35, peak: 0.20, taper: 0.15, raceWeek: 0.05 },
    // Open water / pool race
    'swimming':  { base: 0.30, build: 0.30, peak: 0.20, taper: 0.15, raceWeek: 0.05 },
    // Hyrox
    'hyrox':     { base: 0.20, build: 0.30, peak: 0.30, taper: 0.15, raceWeek: 0.05 },
  };

  const ratios = PHASE_RATIOS[aRace.category] || PHASE_RATIOS['running'];

  // Calculate phase lengths (in weeks), ensuring minimums
  const taper = Math.max(1, Math.round(totalWeeks * ratios.taper));
  const raceWeek = 1;
  const remaining = totalWeeks - taper - raceWeek;
  const base  = Math.max(2, Math.round(remaining * (ratios.base / (ratios.base + ratios.build + ratios.peak))));
  const build = Math.max(2, Math.round(remaining * (ratios.build / (ratios.base + ratios.build + ratios.peak))));
  const peak  = Math.max(1, remaining - base - build);

  // Session distribution per discipline per phase (for triathlon A race)
  // Adjust these templates based on race category
  const TRIATHLON_TEMPLATES = {
    base:     { swim: 2, bike: 2, run: 3, strength: 2 },  // ~9 sessions, some double days
    build:    { swim: 3, bike: 3, run: 3, strength: 1 },  // volume ramp
    peak:     { swim: 2, bike: 3, run: 3, strength: 1, brick: 1 },  // race simulation
    taper:    { swim: 2, bike: 2, run: 2, strength: 0 },  // volume cut, maintain frequency
    raceWeek: { swim: 1, bike: 1, run: 1, strength: 0 },  // easy shakeouts only
  };

  const RUNNING_TEMPLATES = {
    base:     { run: 4, strength: 2, cross: 1 },
    build:    { run: 5, strength: 1, cross: 1 },
    peak:     { run: 5, strength: 1 },
    taper:    { run: 4, strength: 0 },
    raceWeek: { run: 2 },
  };

  // Pick template set based on A race category
  const templates = aRace.category === 'triathlon' ? TRIATHLON_TEMPLATES
                  : aRace.category === 'hyrox'     ? TRIATHLON_TEMPLATES  // similar mix
                  : RUNNING_TEMPLATES;

  let weekNum = 1;
  const phases = [];

  for (const [phaseName, len] of [['Base', base], ['Build', build], ['Peak', peak], ['Taper', taper], ['Race Week', raceWeek]]) {
    phases.push({
      name: phaseName,
      startWeek: weekNum,
      endWeek: weekNum + len - 1,
      weeklyTemplate: templates[phaseName.toLowerCase().replace(' ', '')] || templates.base,
    });
    weekNum += len;
  }

  return phases;
}
```

---

### Step 5: Insert B-Race Micro-Taper Windows

**Function:** `insertBRaceWindow(sessions, bRace, aRace)`

This modifies the existing session array around each B race date.

```javascript
function insertBRaceWindow(sessions, bRace, aRace) {
  const bDate = new Date(bRace.date);
  const taperStart = _addDays(bDate, -3);  // 3 days before
  const recoveryEnd = _addDays(bDate, 3);  // 3 days after

  // Determine which discipline the B race is
  const bDiscipline = _mapCategoryToDiscipline(bRace.category);
  // e.g., "running" → "run", "triathlon" → "run" (main effort), "cycling" → "bike"

  return sessions.map(session => {
    const sDate = new Date(session.date);

    // ── Race day: replace with the B race itself ──
    if (_sameDay(sDate, bDate)) {
      return {
        ...session,
        discipline: bDiscipline,
        sessionType: 'race',
        name: bRace.name || `${bRace.type} (B Race)`,
        intensity: 'race',
        durationMin: _estimateRaceDuration(bRace),
        isBRace: true,
        notes: `B Race — ${bRace.name || bRace.type}. Race effort, then recover.`
      };
    }

    // ── Pre-race taper (3 days before): reduce volume, keep easy ──
    if (sDate >= taperStart && sDate < bDate) {
      // If this session is the same discipline as the B race, make it easy/short
      if (session.discipline === bDiscipline) {
        return {
          ...session,
          intensity: 'low',
          durationMin: Math.round(session.durationMin * 0.5),
          sessionType: 'easy',
          name: `Easy ${session.discipline} (B race taper)`,
          notes: `Reduced volume — B race in ${Math.round((bDate - sDate) / 86400000)} days`
        };
      }
      // Other disciplines: slightly reduce but don't drop
      if (session.discipline !== 'rest') {
        return {
          ...session,
          intensity: 'low',
          durationMin: Math.round(session.durationMin * 0.7),
          notes: `Reduced load — B race taper window`
        };
      }
    }

    // ── Post-race recovery (3 days after): easy everything ──
    if (sDate > bDate && sDate <= recoveryEnd) {
      if (session.discipline === bDiscipline) {
        return {
          ...session,
          intensity: 'low',
          durationMin: Math.min(session.durationMin, 30),
          sessionType: 'recovery',
          name: `Recovery ${session.discipline}`,
          notes: `Post B-race recovery`
        };
      }
      // Other disciplines: keep easy
      if (session.discipline !== 'rest') {
        return {
          ...session,
          intensity: 'low',
          notes: `Post B-race recovery window`
        };
      }
    }

    return session;  // outside the B race window — unchanged
  });
}
```

---

### Step 6: Update the Plan Save Flow

**Where:** The Build Plan confirmation screen (bp-done or bp-7 "Looks Good — Start Training").

**What to change:**

```javascript
// OLD (single race):
// const race = raceEvents[0];
// const plan = generateTrainingPlan(race);

// NEW (multi-race aware):
const raceCalendar = prepareRaceCalendar(raceEvents);
const plan = generateTrainingPlan(raceCalendar);
storeGeneratedPlan(plan);
```

---

### Step 7: Update Calendar Display for B-Race Markers

**Where:** `js/calendar.js` — in the day rendering functions.

**What to add:** When rendering a day that has `isBRace: true` on a session, show a small race flag or badge on that day card. Something like:

- Week view side card: small orange "B" badge below the dots
- Month view: small orange dot distinct from workout dots
- Day detail: "B RACE" pill next to the workout name

This is a visual-only change — the calendar already renders whatever sessions are in `trainingPlan`.

---

## What NOT to Change

- **Do not change the `raceEvents` localStorage schema.** The existing fields already support everything we need (priority A/B, leadIn, category, type, date, goal).
- **Do not change `storeGeneratedPlan()`.** It already handles deactivate-old/insert-new correctly.
- **Do not change `DB.syncKey()` or the sync pattern.** Same localStorage-first approach.
- **Do not change the onboarding screen flow.** bp-3-race already supports multiple races with "+ Add Another Race." We're just adding the priority toggle enforcement and the one-A-race rule.
- **Do not change any other JS files** unless they explicitly call `generateTrainingPlan(race)` with a single race — those callers need to be updated to pass `prepareRaceCalendar(raceEvents)` instead.

---

## Testing Checklist

- [ ] Add 1 race (auto A) → plan generates normally, full periodization
- [ ] Add 2 races, A + B → plan builds from A race, B race has micro-taper window
- [ ] Try to set 2 A races → first A auto-demotes to B, toast shown
- [ ] B race is different discipline than A (e.g., A=Ironman, B=Half Marathon) → run volume adjusts around B race, swim/bike continue uninterrupted
- [ ] B race is same discipline as A (e.g., A=Marathon, B=Half Marathon) → taper/recovery window applied to run sessions
- [ ] B race falls during Base phase → taper window still applies, plan resumes Base after recovery
- [ ] B race falls during Taper phase of A race → micro-taper merges with existing taper, no double-reduction
- [ ] No race path → plan generates from goals/preferences, no race logic applies
- [ ] Plan preview (bp-7) shows B race markers on the timeline
- [ ] Calendar shows B race badges on the correct dates
- [ ] Sessions around B race dates show modified names/notes ("B race taper", "Recovery")

---

## Chase's Specific Case

- **A Race:** Ironman, September 6, 2026 — drives a ~20-week triathlon block (swim 2-3×/wk, bike 2-3×/wk, run 3×/wk, strength 1-2×/wk, bricks on weekends)
- **B Race:** Half Marathon, July 19, 2026 — sits inside the Build phase. Week of July 16-22: reduce run volume, drop the long run, keep swim/bike easy, race on the 19th, easy recovery days 20-22, snap back to Ironman Build on July 23
- **Result:** Chase never loses his tri fitness for a half marathon, and the Ironman plan stays on track
