# VDOT Running Zones — Claude Code Agent Prompt

Paste this into your Claude Code session:

---

## Task

Implement VDOT-based running pace zones for IronZ. The user enters a recent race result (any distance), we calculate their VDOT score, and derive 6 training pace zones from it. These zones are stored, displayed in settings, and used by the planner when generating running workouts.

**Read `cowork-handoff/VDOT_ZONES_SPEC.md` first. It is the single source of truth.** Everything — the 6-zone model, VDOT lookup tables, data storage schema, UI integration points — is specified there.

## Context

- IronZ is a vanilla JS SPA (no bundler, no ES modules) deployed on GitHub Pages with a Supabase backend.
- All data is localStorage-first, synced to Supabase via `DB.syncKey()`.
- The bp-4 onboarding screen already has a running threshold section with a race result input (distance dropdown + time). It just isn't wired to anything yet.
- Running zones currently don't exist in the app — no zone calculations, no zone storage, no zone display. You're building from scratch.
- Swimming uses CSS (Critical Swim Speed), cycling uses FTP. Those are separate and should not be touched.

## Critical files to read before writing any code

1. `cowork-handoff/VDOT_ZONES_SPEC.md` — the full spec
2. `js/db.js` — SYNCED_KEYS array, DB.syncKey() pattern
3. `js/planner.js` — how workouts are generated, session object structure
4. `js/calendar.js` — how workouts are displayed in day detail (look for `zone`, `intensity`, `det-desc`)
5. `js/onboarding-v2.js` — bp-4 threshold screen handler
6. `onboarding-v3-mockup.html` (lines 922-969) — bp-4 running section UI reference
7. `index.html` — script load order, Training tab Zones & Benchmarks section

## Implementation order

### Phase 1: Create js/vdot.js
- New file with VDOT lookup tables and calculation functions
- `calculateVDOT(distanceKey, timeInSeconds)` → returns VDOT score (float)
- `getTrainingPaces(vdot)` → returns 6-zone object with pace ranges in seconds per mile
- `formatPace(seconds)` → "M:SS" string
- `parsePaceInput(str)` → seconds
- `reverseVDOTFromThreshold(thresholdSecsPerMile)` → VDOT score
- Export as `window.VDOT = { ... }`
- **Important:** Fill the VDOT_TABLE with every integer from 30 to 85. The spec has sparse entries — you need to fill the gaps using the published Jack Daniels tables. Cross-check: VDOT 45 → 5K ~19:30, Easy 8:23–9:13/mi, Threshold 7:07/mi.
- Add `<script src="js/vdot.js"></script>` in index.html BEFORE planner.js

### Phase 2: Wire bp-4 Running Input → Zone Calculation
- When user enters a race distance + time on bp-4, calculate VDOT and zones
- Show a live preview of all 6 zones below the input (instant feedback)
- On "Continue", save to `localStorage.paceZones` and call `DB.syncKey('paceZones')`
- Add `'paceZones'` to the SYNCED_KEYS array in `js/db.js`
- Also handle the "I know my threshold pace" path: back-calculate VDOT from threshold, then derive all zones

### Phase 3: Zones & Benchmarks Display (Training Tab)
- In the Training tab, add a "Running Pace Zones" card showing:
  - VDOT score
  - All 6 zones with labels and pace ranges
  - "Update" button to re-enter a race result
  - Last updated date
- If no zones exist, show a prompt: "Enter a recent race time to set your zones"

### Phase 4: Planner Outputs Zone + Pace on Running Workouts
- When `generateTrainingPlan` creates running sessions, read `paceZones` from localStorage
- Add `zone` (e.g., "Z2") and `targetPace` (e.g., "8:23 – 9:13/mi") fields to session objects
- Map session types to zones:
  - easy/recovery → Z2 (with Z1 noted for recovery days)
  - long run → Z2
  - tempo/threshold → Z4
  - interval → Z5
  - repetition/sprint → Z6
  - marathon pace → Z3
- For workouts with `exercises[]`, include zone + pace in exercise descriptions
- **Fallback:** If `paceZones` not set, use RPE text only. No pace numbers without VDOT data.

### Phase 5: Calendar Day Detail Shows Zones
- In `js/calendar.js` day detail rendering, when a session has `zone` and `targetPace`:
  - Show zone as a small colored badge (Z2 = teal, Z3 = orange, Z4 = red, Z5 = dark red, Z6 = purple)
  - Show target pace in the description line: "30 min · Z2 · 8:23 – 9:13/mi"
- This is display-only — the data comes from the session objects

### Phase 6: Commit
- Message: `feat: VDOT-based running pace zones — 6-zone model from race results`

## Anti-regression rules

- **DO NOT** touch swimming (CSS) or cycling (FTP) zone logic
- **DO NOT** change the existing intensity system (low/medium/high/endurance). Zones are an ADDITIONAL display layer, not a replacement for intensity.
- **DO NOT** change `storeGeneratedPlan()` or the plan storage pattern
- **DO NOT** modify `js/auth.js`
- **DO NOT** change the onboarding screen flow order
- **DO** add `'paceZones'` to SYNCED_KEYS in db.js
- **DO** export via `window.VDOT = { ... }` (vanilla JS globals, no ES modules)
- **DO** verify the VDOT tables produce correct results for these checkpoints:
  - 5K 19:04 → VDOT ~45-46, Easy ~8:23-9:13, Threshold ~7:07
  - 5K 25:00 → VDOT ~36, Easy ~11:00-10:18
  - 5K 17:00 → VDOT ~50, Easy ~8:30-7:48

## Test case: Chase's data

Strava shows predicted 5K of 19:04. After entering this:
- VDOT should be approximately 45-46
- Z1 Recovery: > 9:13/mi
- Z2 Easy: 8:23 – 9:13/mi
- Z3 Marathon: ~7:36/mi
- Z4 Threshold: ~7:07/mi
- Z5 Interval: ~6:36/mi
- Z6 Repetition: < 6:00/mi

His 75-minute run at 8:33 avg GAP should fall squarely in Z2 — confirming the zones are calibrated correctly.
