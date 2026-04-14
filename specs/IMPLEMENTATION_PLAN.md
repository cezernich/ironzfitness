# IronZ Implementation Plan — 16 Feature Changes

> **Purpose:** Feed this document to Claude Code for parallel implementation using subagents.
> **Date:** April 6, 2026
> **Codebase:** Vanilla JS SPA — `index.html` (1989 lines) + 26 JS modules + `style.css`, backed by Supabase
> **Deployment:** GitHub Pages at `cezernich.github.io`

---

## Architecture Notes for Agents

- **Framework:** Vanilla JavaScript, no React/Vue. All UI is DOM manipulation + innerHTML.
- **State:** localStorage for immediate persistence, Supabase for cloud sync.
- **HTML Shell:** `index.html` contains all markup. Tabs use `#tab-{name}` IDs with `.tab-content` class.
- **JS Modules:** 26 separate `.js` files loaded via `<script src>` tags at bottom of `index.html`. Each module handles a feature domain.
- **CSS:** `style.css` — theme variables via `data-theme` attribute on `<html>`.
- **AI Backend:** Supabase Edge Functions or direct Claude API calls from `planner.js`, `nutrition.js`, `meals-data.js`.
- **Key Data Objects in localStorage:** `profile`, `workouts`, `meals`, `hydration`, `plans`, `savedWorkouts`, `preferences`.

---

## Change Summary (16 items, grouped into 8 workstreams)

| # | Change | Workstream | Priority | Complexity |
|---|--------|-----------|----------|------------|
| 1 | Mobile UX fixes | UX | P0 | Medium |
| 2 | Superset/dragging scroll fix | UX | P0 | Medium |
| 3 | Onboarding height (ft/in) | Onboarding | P1 | Low |
| 4 | Allergy-safe nutrition | Nutrition | P0 | High |
| 5 | Live workout exit without save | Workouts | P1 | Low |
| 6 | Replace single exercise (machine busy) | Workouts | P1 | Medium |
| 7 | Fueling during workouts | Nutrition | P1 | High |
| 8 | Hyrox-style workout builder | Workouts | P1 | High |
| 9 | Hyrox training plans | Training | P2 | High |
| 10 | Sauna & steam sessions | Wellness | P2 | High |
| 11 | Race day averages & plan adaptation | Training | P2 | High |
| 12 | Bike pacing calculation fix | Bug Fix | P0 | Low |
| 13 | Ask thresholds in onboarding | Onboarding | P1 | Medium |
| 14 | Training blocks explained | Training | P1 | Medium |
| 15 | iPhone lock screen widgets | Platform | P3 | Very High |
| 16 | Bike watt logging | Workouts | P1 | Low |

---

## Workstream A: UX & Mobile Fixes (Changes 1, 2)

### Agent: `ux-mobile-agent`

**Files to modify:** `style.css`, `index.html`, `workout-editor.js`, `live-tracker.js`, `app.js`

### Change 1: Mobile UX Improvements

**Problem:** Elements are weirdly shaped and not mobile-friendly on smaller screens.

**Tasks:**

1. **Audit all CSS for fixed widths and overflow issues.** Search `style.css` for any `width:` declarations with pixel values that don't have `max-width` constraints. Replace with responsive units (`%`, `vw`, `clamp()`).

2. **Fix card layouts.** All `.card` elements should use:
   ```css
   .card {
     width: 100%;
     max-width: 100%;
     box-sizing: border-box;
     overflow-x: hidden;
   }
   ```

3. **Fix form inputs on mobile.** Ensure all `<input>`, `<select>`, `<textarea>` elements have:
   ```css
   input, select, textarea {
     font-size: 16px; /* prevents iOS zoom on focus */
     width: 100%;
     box-sizing: border-box;
   }
   ```

4. **Fix nav bar.** The bottom nav circles should be evenly distributed with `display: flex; justify-content: space-around;` and sized appropriately for touch targets (min 44x44px per Apple HIG).

5. **Fix modal overlays.** Quick-entry modals and survey modals should:
   - Use `position: fixed; inset: 0;` on mobile
   - Have scrollable content with `-webkit-overflow-scrolling: touch;`
   - Not exceed viewport height

6. **Fix calendar grid.** Day cells should have uniform size, text should not overflow. Use CSS Grid with `grid-template-columns: repeat(7, 1fr);`.

7. **Test all tabs at 375px, 390px, 414px widths** (iPhone SE, 14, 14 Pro Max). Fix any overflow or misalignment.

### Change 2: Superset/Dragging Scroll Fix

**Problem:** When editing a workout with exercises, the drag-to-reorder/superset functionality uses touch events that conflict with page scrolling. Users can't scroll down to the Save button.

**Tasks:**

1. **Find the drag handler** in `workout-editor.js` or `live-tracker.js`. Look for `touchstart`, `touchmove`, `touchend`, or any drag library initialization.

2. **Implement a drag handle pattern.** Instead of making the entire exercise row draggable:
   - Add a small drag handle icon (≡ or ⠿) on the left side of each exercise row
   - ONLY initiate drag when the handle is touched, not the entire row
   - This frees the rest of the row for normal scrolling

3. **Implementation approach:**
   ```javascript
   // Only start drag when handle is touched
   handle.addEventListener('touchstart', (e) => {
     e.preventDefault(); // prevent scroll only on handle
     startDrag(exerciseRow);
   });
   // The exercise row itself should NOT have touchstart preventDefault
   ```

4. **Add visual affordance.** The drag handle should:
   - Be clearly visible (6-dot grip icon)
   - Have a larger touch target (40x40px minimum)
   - Show a subtle highlight/scale on touch

5. **For superset grouping:** Consider a long-press gesture (500ms) on the drag handle to enter "superset mode" where multiple exercises can be grouped, OR add a small "link" button between exercises to merge them into a superset.

6. **Ensure Save button is always accessible.** If the exercise list is long:
   - Consider a sticky Save button at the bottom of the viewport
   - Or add a floating action button for Save
   ```css
   .workout-save-btn {
     position: sticky;
     bottom: 0;
     z-index: 10;
     background: var(--color-bg);
     padding: 12px 16px;
     border-top: 1px solid var(--color-border);
   }
   ```

---

## Workstream B: Onboarding Enhancements (Changes 3, 13)

### Agent: `onboarding-agent`

**Files to modify:** `onboarding.js`, `survey.js`, `index.html`, `style.css`

### Change 3: Height Input — Feet & Inches

**Problem:** Currently height is entered in total inches, which is unintuitive for US users.

**Tasks:**

1. **Find the height input** in `index.html` or `onboarding.js`. It's likely in the signup/profile section or the onboarding wizard.

2. **Replace the single input with two fields:**
   ```html
   <div class="height-input-group">
     <div class="form-row">
       <label for="height-feet">Height</label>
       <div style="display:flex; gap:8px; align-items:center;">
         <input type="number" id="height-feet" min="3" max="8" placeholder="5" style="width:70px;" />
         <span>ft</span>
         <input type="number" id="height-inches" min="0" max="11" placeholder="10" style="width:70px;" />
         <span>in</span>
       </div>
     </div>
   </div>
   ```

3. **Convert to total inches for storage:** The profile data model stores height in inches, so convert on save:
   ```javascript
   const totalInches = (parseInt(feetInput.value) * 12) + parseInt(inchesInput.value);
   profile.height = totalInches;
   ```

4. **Convert from total inches on load:** When displaying saved height:
   ```javascript
   const feet = Math.floor(profile.height / 12);
   const inches = profile.height % 12;
   ```

5. **Update all places height is displayed** to show `X'Y"` format instead of raw inches.

6. **Validation:** Feet must be 3-8, inches must be 0-11. Show inline error if invalid.

### Change 13: Ask Athlete Zones in Onboarding

**Problem:** Training plans are generated without knowing the user's actual performance zones (HR, pace, power). This leads to generic plans.

**Tasks:**

1. **Add an optional "Your Training Zones" step to the onboarding wizard.** This should come AFTER the user selects their sport/goal and fitness level.

2. **The step should include:**
   - A clear "Skip this — I'll set zones later" button (prominent, not hidden)
   - A brief explanation: "If you know your training zones from a recent test, entering them helps us create more accurate plans. You can always update these later in Settings."

3. **For runners, collect:**
   - Easy pace (min/mi or min/km)
   - Tempo/threshold pace
   - VO2max/interval pace
   - OR: Recent race result (distance + time) → auto-calculate zones using Jack Daniels' VDOT formula

4. **For cyclists, collect:**
   - FTP (Functional Threshold Power) in watts
   - OR: Recent 20-min power test result → FTP = result × 0.95

5. **For swimmers, collect:**
   - CSS (Critical Swim Speed) pace per 100m
   - OR: T-pace from a recent time trial

6. **For heart rate (all sports):**
   - Max HR (optional)
   - Resting HR (optional)
   - If provided, calculate 5-zone model using Karvonen formula

7. **Store zones in profile:**
   ```javascript
   profile.zones = {
     running: { easy: '9:30', tempo: '8:00', vo2max: '7:00', sprint: '6:15' },
     cycling: { ftp: 220 },
     swimming: { css: '1:45' },
     heartRate: { max: 185, resting: 55, zones: [...] },
     source: 'onboarding' | 'settings' | 'auto-calculated',
     lastUpdated: '2026-04-06'
   };
   ```

8. **Wire zones into plan generation.** In `planner.js`, when generating workouts, reference `profile.zones` to set target paces/power/HR for each workout segment. If no zones exist, use RPE-based descriptions instead.

9. **Add zones to the Settings tab** so users can update them anytime (not just onboarding).

---

## Workstream C: Nutrition — Allergies & Fueling (Changes 4, 7)

### Agent: `nutrition-agent`

**Files to modify:** `nutrition.js`, `nutrition-v2.js`, `meals-data.js`, `planner.js`, `index.html`, potentially a new `fueling.js`

### Change 4: Allergy-Safe Nutrition Recommendations

**Problem:** Users input food allergies/dislikes but the nutrition recommendation engine still suggests meals containing those foods. This is a critical safety issue.

**Tasks:**

1. **Audit the current allergy/preference flow.** In `index.html`, the Food Preferences section has "Foods I Love" and "Foods to Avoid" chip inputs. Find where these are stored (likely `localStorage` key like `preferences` or `foodPrefs`).

2. **Rename "Foods to Avoid" to "Allergies & Foods to Avoid"** and add a sub-toggle:
   ```html
   <div class="allergy-severity">
     <label><input type="checkbox" id="is-allergy" /> This is an allergy (not just a preference)</label>
   </div>
   ```
   Store each item with a flag: `{ name: 'peanuts', isAllergy: true }` vs `{ name: 'salmon', isAllergy: false }`.

3. **Create a hard filter in the meal suggestion pipeline.** In `meals-data.js` or wherever meal suggestions are generated (likely an AI prompt to Claude/GPT):

   **Before sending AI prompt, inject a strict constraint:**
   ```javascript
   const allergies = prefs.dislikes.filter(d => d.isAllergy).map(d => d.name);
   const avoids = prefs.dislikes.filter(d => !d.isAllergy).map(d => d.name);

   const allergyPrompt = allergies.length > 0
     ? `CRITICAL SAFETY CONSTRAINT: The user has the following allergies: ${allergies.join(', ')}. NEVER suggest any meal, ingredient, or recipe that contains these items or derivatives of these items. This is a medical safety requirement.`
     : '';

   const avoidPrompt = avoids.length > 0
     ? `The user prefers to avoid: ${avoids.join(', ')}. Try not to include these but it's not a medical issue.`
     : '';
   ```

4. **Add a post-generation validation step.** After AI generates meal suggestions, run a client-side check:
   ```javascript
   function validateMealSafety(meal, allergies) {
     const mealText = (meal.name + ' ' + (meal.ingredients || []).join(' ')).toLowerCase();
     for (const allergy of allergies) {
       if (mealText.includes(allergy.toLowerCase())) {
         console.warn(`BLOCKED: Meal "${meal.name}" contains allergen "${allergy}"`);
         return false;
       }
     }
     return true;
   }
   ```

5. **Show allergy warnings in the UI.** If a manually logged meal contains an allergen (based on name matching), show a yellow warning banner:
   ```
   ⚠️ This meal may contain [peanuts], which is listed in your allergies.
   ```

6. **Update the grocery list generator** to also exclude allergens.

7. **Display active allergies prominently** in the Nutrition tab header as colored chips so users always see them.

### Change 7: Fueling During Workouts

**Problem:** No guidance for nutrition during long workouts (gels, hydration, carb intake timing).

**Tasks:**

1. **Create fueling recommendation logic.** Base this on current sports science consensus:

   **Rules engine (store in a config object or new `fueling.js`):**
   ```javascript
   const FUELING_RULES = {
     // Under 60 min: no fueling needed (just water)
     // 60-90 min: 30-60g carbs/hr, start at 20-30 min
     // 90+ min: 60-90g carbs/hr, start at 15-20 min
     // 2.5+ hours: 80-120g carbs/hr (trained gut), sodium 500-700mg/hr

     thresholds: [
       { minDuration: 0, maxDuration: 60, carbsPerHour: 0, note: 'Water only. No fueling needed for sessions under 60 minutes.' },
       { minDuration: 60, maxDuration: 90, carbsPerHour: 30, startMinute: 25, intervalMinutes: 25, note: 'Light fueling. 30g carbs per hour. One gel every 25 minutes starting at minute 25.' },
       { minDuration: 90, maxDuration: 150, carbsPerHour: 60, startMinute: 20, intervalMinutes: 20, note: 'Moderate fueling. 60g carbs per hour. One gel every 20 minutes starting at minute 20.' },
       { minDuration: 150, maxDuration: Infinity, carbsPerHour: 90, startMinute: 15, intervalMinutes: 20, note: 'Heavy fueling. 60-90g carbs per hour. One gel every 15-20 minutes. Include sodium (500-700mg/hr).' }
     ],

     gelCarbContent: 25, // grams per gel (standard GU/Maurten)
     sportsdrinkCarbsPer16oz: 14, // grams per 16oz sports drink

     hydration: {
       general: '16-24 oz per hour',
       hot: '24-32 oz per hour (above 80°F / 27°C)',
       sodium: '500-700mg per hour for sessions over 90 min'
     }
   };
   ```

2. **Generate a fueling plan for each scheduled workout.** When a workout is displayed in the calendar/day detail:
   ```javascript
   function generateFuelingPlan(workout) {
     const durationMin = workout.durationMinutes;
     const rule = FUELING_RULES.thresholds.find(r => durationMin >= r.minDuration && durationMin < r.maxDuration);
     if (!rule || rule.carbsPerHour === 0) return null;

     const gelCount = Math.ceil((durationMin - rule.startMinute) / rule.intervalMinutes);
     const gelTimes = [];
     for (let i = 0; i < gelCount; i++) {
       gelTimes.push(rule.startMinute + (i * rule.intervalMinutes));
     }

     return {
       totalCarbs: Math.round((rule.carbsPerHour * durationMin) / 60),
       gels: gelTimes.map(t => ({ minute: t, carbs: FUELING_RULES.gelCarbContent })),
       hydrationNote: rule.note,
       hydrationOz: durationMin > 60 ? `${Math.round(durationMin / 60 * 20)}-${Math.round(durationMin / 60 * 24)} oz` : 'Sip water as needed'
     };
   }
   ```

3. **Display fueling plan in the workout detail view.** Add a collapsible "Fueling Plan" section below the workout segments:
   ```
   🔋 FUELING PLAN (2hr 30min long run)
   ├─ Total carbs needed: ~135g
   ├─ Minute 15: Gel #1 (25g carbs)
   ├─ Minute 35: Gel #2 (25g carbs)
   ├─ Minute 55: Gel #3 (25g carbs)
   ├─ Minute 75: Gel #4 (25g carbs)
   ├─ Minute 95: Gel #5 (25g carbs)
   ├─ Hydration: 50-60 oz total, sip every 15 min
   └─ Sodium: 500-700mg/hr (electrolyte tabs or sports drink)
   ```

4. **Decision on scope:** Show fueling for ALL users with workouts over 60 minutes, not just nutrition-enabled users. Fueling during exercise is a performance/safety concern separate from meal tracking.

5. **Add fueling science to training philosophy document.** Create or update a `TRAINING_PHILOSOPHY.md` section:
   - Under 60 min: water only
   - 60-90 min: 30-60g carbs/hr (single transportable carb source)
   - 90-150 min: 60g carbs/hr (dual transportable: glucose + fructose)
   - 150+ min: 60-90g carbs/hr, practice in training, sodium 500-700mg/hr
   - Sources: ACSM position stand, Asker Jeukendrup research on carb absorption rates

---

## Workstream D: Workout Features (Changes 5, 6, 8, 16)

### Agent: `workout-features-agent`

**Files to modify:** `live-tracker.js`, `workout-editor.js`, `workouts.js`, `exercise-library.js`, `index.html`, `style.css`

### Change 5: Live Workout Exit Without Saving

**Problem:** If a user accidentally taps "Start Workout," they're trapped in the live tracker with no way to leave without saving.

**Tasks:**

1. **Find the live workout screen** in `live-tracker.js`. Look for the start/launch function and the UI container.

2. **Add an "Exit" or "X" button** in the top-left corner of the live tracker screen:
   ```html
   <button class="live-exit-btn" onclick="confirmExitWorkout()">✕</button>
   ```

3. **Show a confirmation dialog** to prevent accidental data loss:
   ```javascript
   function confirmExitWorkout() {
     const hasProgress = checkIfAnyExerciseLogged();
     if (hasProgress) {
       // User has logged some data — confirm
       if (confirm('You have unsaved workout data. Exit without saving?')) {
         exitLiveWorkout();
       }
     } else {
       // No data entered — just exit
       exitLiveWorkout();
     }
   }

   function exitLiveWorkout() {
     // Reset live tracker state
     // Hide live tracker UI
     // Return to previous screen (home or training tab)
   }
   ```

4. **Style the exit button** to be clearly visible but not easily confused with other actions:
   ```css
   .live-exit-btn {
     position: absolute;
     top: 12px;
     left: 12px;
     width: 36px;
     height: 36px;
     border-radius: 50%;
     background: var(--color-bg);
     border: 1px solid var(--color-border);
     font-size: 18px;
     z-index: 100;
   }
   ```

### Change 6: Replace Single Exercise (Machine Busy)

**Problem:** During a workout, if a piece of equipment is occupied, there's no way to swap just one exercise for an equivalent alternative.

**Tasks:**

1. **Add a "Swap" button** to each exercise row in the live tracker and workout editor:
   ```html
   <button class="swap-exercise-btn" onclick="swapExercise(exerciseIndex)" title="Swap for alternative">⇄</button>
   ```

2. **Build an exercise substitution map** in `exercise-library.js`. Group exercises by primary muscle + movement pattern:
   ```javascript
   const EXERCISE_SUBSTITUTIONS = {
     'barbell curl': {
       muscle: 'biceps',
       pattern: 'elbow flexion',
       alternatives: ['dumbbell curl', 'hammer curl', 'cable curl', 'resistance band curl', 'chin-up (bicep focus)']
     },
     'barbell bench press': {
       muscle: 'chest',
       pattern: 'horizontal push',
       alternatives: ['dumbbell bench press', 'push-up', 'cable chest press', 'machine chest press', 'dumbbell flye']
     },
     'lat pulldown': {
       muscle: 'lats',
       pattern: 'vertical pull',
       alternatives: ['pull-up', 'assisted pull-up', 'cable pullover', 'resistance band pulldown', 'dumbbell row']
     }
     // ... comprehensive map for all exercises in exercise-library.js
   };
   ```

3. **When user taps Swap, show a bottom sheet** with alternatives:
   ```
   🔄 Swap: Barbell Curl
   Equipment busy? Pick an alternative:
   ├─ Dumbbell Curl (same muscle, dumbbells)
   ├─ Hammer Curl (same muscle, dumbbells)
   ├─ Cable Curl (same muscle, cable machine)
   ├─ Resistance Band Curl (same muscle, no equipment)
   └─ Chin-Up — Bicep Focus (same muscle, pull-up bar)
   ```

4. **Preserve sets/reps/weight context.** When swapping, keep the same sets and reps. Adjust weight suggestion if the equipment type changes (e.g., barbell → dumbbell typically means ~60-70% of barbell weight per hand).

5. **If AI is available,** offer a "Smart Swap" option that considers available equipment the user checked during onboarding/preferences.

6. **Log the swap.** In the workout record, note that a substitution was made:
   ```javascript
   exercise.swappedFrom = 'Barbell Curl';
   exercise.swapReason = 'equipment_busy';
   ```

### Change 8: Hyrox-Style Workout Builder

**Problem:** Users want to create Hyrox-style workouts (alternating running segments with functional exercises) easily.

**Reference (from user's screenshot):**
```
0.5 miles → 500m ski → 0.5 miles → 335lb sled push 50m → 0.5 miles → sled pull 50m →
0.5 miles → burpee broad jump 80m → 0.5 miles → 500m row → 0.5 miles →
200m farmer carry 45lb → 0.5 miles → 100m sandbag lunges 45lb → 0.5 miles → 50 wall balls
```

**Tasks:**

1. **Add "Hyrox" as a workout type** under the HIIT tab in the quick-entry wizard. In `index.html`, add a new card in the HIIT format selection:
   ```html
   <div class="hiit-format-card" data-format="hyrox" onclick="selectHIITFormat('hyrox')">
     <span class="format-icon">🏋️‍♂️🏃</span>
     <span class="format-name">Hyrox</span>
     <span class="format-desc">Run + functional stations</span>
   </div>
   ```

2. **Create a Hyrox builder step** (Step 1e in quick-entry):

   **Part A — Run Configuration:**
   ```html
   <div class="hyrox-run-config">
     <label>Run distance between stations</label>
     <div class="distance-options">
       <button data-dist="0.25">0.25 mi</button>
       <button data-dist="0.5" class="selected">0.5 mi</button>
       <button data-dist="1.0">1.0 mi</button>
       <button data-dist="1.0k">1 km</button>
       <input type="number" placeholder="Custom (mi)" />
     </div>
   </div>
   ```

   **Part B — Station Selection (checkboxes):**
   ```javascript
   const HYROX_STATIONS = [
     { id: 'ski', name: 'SkiErg', defaultDistance: '1000m', unit: 'm', icon: '⛷️' },
     { id: 'sled-push', name: 'Sled Push', defaultDistance: '50m', defaultWeight: '125lb', unit: 'm', icon: '🛷' },
     { id: 'sled-pull', name: 'Sled Pull', defaultDistance: '50m', defaultWeight: '78lb', unit: 'm', icon: '🪢' },
     { id: 'burpee-broad-jump', name: 'Burpee Broad Jump', defaultDistance: '80m', unit: 'm', icon: '🤸' },
     { id: 'row', name: 'Rowing', defaultDistance: '1000m', unit: 'm', icon: '🚣' },
     { id: 'farmer-carry', name: 'Farmer Carry', defaultDistance: '200m', defaultWeight: '53lb per hand', unit: 'm', icon: '💪' },
     { id: 'sandbag-lunges', name: 'Sandbag Lunges', defaultDistance: '100m', defaultWeight: '44lb', unit: 'm', icon: '🏋️' },
     { id: 'wall-balls', name: 'Wall Balls', defaultReps: 75, defaultWeight: '20lb', unit: 'reps', icon: '⚽' }
   ];
   ```

   **Part C — Customize each station:** After checking stations, let users adjust weights and distances:
   ```
   ☑ SkiErg: [1000] m
   ☑ Sled Push: [50] m @ [335] lb
   ☑ Sled Pull: [50] m @ [78] lb
   ☑ Burpee Broad Jump: [80] m
   ...
   ```

   **Part D — Add custom exercises:** A button "+ Add Custom Exercise" lets users add non-standard exercises between run segments (e.g., kettlebell swings, box jumps).

3. **Generate the workout structure.** The builder outputs an ordered list alternating run segments and stations:
   ```javascript
   function buildHyroxWorkout(config) {
     const segments = [];
     config.stations.forEach((station, i) => {
       // Add run segment
       segments.push({
         type: 'run',
         name: `Run ${i + 1}`,
         distance: config.runDistance,
         unit: config.runUnit
       });
       // Add station
       segments.push({
         type: 'station',
         name: station.name,
         distance: station.distance,
         weight: station.weight,
         reps: station.reps,
         unit: station.unit
       });
     });
     // Final run segment after last station
     segments.push({
       type: 'run',
       name: `Run ${config.stations.length + 1}`,
       distance: config.runDistance,
       unit: config.runUnit
     });
     return segments;
   }
   ```

4. **Display Hyrox workouts distinctly** in the calendar/day detail with alternating color bands (run = blue/teal, station = orange/red).

5. **Allow Hyrox workouts to be saved as templates** for reuse.

### Change 16: Bike Watt Logging (Optional)

**Problem:** Users can't log average watt output for cycling workouts.

**Tasks:**

1. **In the workout logging form** (`workouts.js` or `live-tracker.js`), when workout type is `cycling`:

   Add an optional watts field:
   ```html
   <div class="form-row" id="watts-row" style="display:none">
     <label for="log-watts">Avg Power (watts) <span class="optional-tag">optional</span></label>
     <input type="number" id="log-watts" placeholder="e.g. 205" min="0" max="2000" />
   </div>
   ```

2. **Show this field only for cycling workouts.** Toggle visibility when workout type changes:
   ```javascript
   document.getElementById('watts-row').style.display = type === 'cycling' ? '' : 'none';
   ```

3. **Save watts in the workout object:**
   ```javascript
   workout.avgWatts = parseInt(wattsInput.value) || null;
   ```

4. **Display watts in workout history** for cycling entries.

5. **Use watts for FTP estimation** if zones aren't set: after logging multiple rides, suggest FTP based on best 20-min power.

---

## Workstream E: Training Plan Features (Changes 9, 11, 14)

### Agent: `training-plan-agent`

**Files to modify:** `planner.js`, `survey.js`, `index.html`, `calendar.js`, `style.css`, and create `TRAINING_PHILOSOPHY.md`

### Change 9: Hyrox Training Plans

**Problem:** Hyrox is increasingly popular and users want structured training plans for Hyrox races.

**Tasks:**

1. **Add "Hyrox" as a race type** in the Build a Plan / Race Events form. Alongside triathlon, marathon, etc.:
   ```html
   <option value="hyrox">Hyrox</option>
   <option value="hyrox-doubles">Hyrox Doubles</option>
   ```

2. **Define Hyrox-specific training periodization** in `TRAINING_PHILOSOPHY.md`:

   ```
   ## Hyrox Training Philosophy

   ### Training Blocks (12-16 week plan):
   - **Weeks 1-4: Base Building**
     - Focus: Aerobic base, movement quality, grip endurance
     - Running: 3-4x/week, mostly Zone 2, build to 25-30 mi/week
     - Functional: 2-3x/week, light weights, technique focus
     - Key sessions: Long slow run, tempo intervals, station technique work

   - **Weeks 5-8: Strength & Capacity**
     - Focus: Build strength on stations, increase running volume
     - Running: Maintain 25-30 mi/week, add threshold work
     - Functional: Increase weights to race weight, build station endurance
     - Key sessions: Race-weight station practice, tempo runs, hybrid sessions (run + 2-3 stations)

   - **Weeks 9-12: Race Simulation**
     - Focus: Full Hyrox simulations, pacing strategy, transitions
     - Running: Maintain volume, add race-pace intervals
     - Functional: Race-weight or heavier, timed stations
     - Key sessions: Full Hyrox simulation (every 2-3 weeks), threshold runs, mental toughness work

   - **Weeks 13-14 (if 16-week plan): Taper**
     - Reduce volume 30-40%, maintain intensity
     - One final light simulation in week 13
     - Race week: easy movement only, focus on nutrition and recovery

   ### Race Standards (Solo):
   - SkiErg: 1000m
   - Sled Push: 152kg (M) / 102kg (W), 50m
   - Sled Pull: 103kg (M) / 78kg (W), 50m
   - Burpee Broad Jump: 80m
   - Row: 1000m
   - Farmer Carry: 2x24kg (M) / 2x16kg (W), 200m
   - Sandbag Lunges: 20kg (M) / 10kg (W), 100m
   - Wall Balls: 75 reps, 9kg/6kg (M/W), 10ft/9ft target
   - Each station bookended by 1km run (8km total running)
   ```

3. **In the plan generator prompt** (`planner.js`), when race type is Hyrox, include the philosophy document context and generate plans following the block structure above.

4. **Include equipment notes.** Hyrox plans should flag what equipment is needed and offer home/limited-equipment alternatives where possible.

### Change 11: Race Day Averages & Plan Adaptation

**Problem:** When users sign up for a race, the plan doesn't adapt to race-specific conditions (elevation, weather, terrain), and users can't see race metadata.

**Tasks:**

1. **Enhance the race event form** to collect or auto-lookup race data:
   ```html
   <div class="race-details">
     <div class="form-row">
       <label>Race Name</label>
       <input type="text" id="race-name" placeholder="e.g. Boston Marathon 2026" />
     </div>
     <div class="form-row">
       <label>Location</label>
       <input type="text" id="race-location" placeholder="e.g. Boston, MA" />
     </div>
     <div class="form-row">
       <label>Elevation Gain (ft)</label>
       <input type="number" id="race-elevation" placeholder="e.g. 800" />
     </div>
     <div class="form-row">
       <label>Average Race Day Temp (°F)</label>
       <input type="number" id="race-temp" placeholder="e.g. 58" />
     </div>
     <div class="form-row">
       <label>Course Notes</label>
       <textarea id="race-notes" placeholder="e.g. Hilly first half, net downhill, headwind common at mile 18"></textarea>
     </div>
   </div>
   ```

2. **Display race info card** in the Training tab or wherever active races are shown:
   ```
   🏁 Boston Marathon 2026
   📅 April 20, 2026 — 14 weeks out
   📍 Boston, MA
   ⛰️ Elevation: +800 ft (rolling hills, major climb at miles 17-21)
   🌡️ Avg Temp: 55-65°F
   📝 Famous for "Heartbreak Hill" at mile 20
   ```

3. **Adapt the training plan based on race characteristics.** Feed race metadata into the AI plan generation prompt in `planner.js`:

   **Race-specific adaptations:**
   - **High elevation gain (>500ft):** Add hill repeats 1-2x/week, include long runs on hilly terrain
   - **Hot weather (>80°F):** Add heat acclimation protocol — sauna sessions 2-3x/week for final 4 weeks (if sauna feature is enabled), adjust pace targets for heat, emphasize hydration
   - **Altitude (>5000ft):** Recommend arriving 2-3 weeks early or altitude simulation
   - **Net downhill:** Include downhill running practice to train eccentric loading
   - **Trail/technical:** Add single-leg stability work, ankle strengthening

4. **Show a "Race Readiness" indicator** as the race approaches, based on adherence to the plan.

### Change 14: Training Blocks Explained

**Problem:** Beginners don't understand why their plan has different phases (base, build, peak, taper).

**Tasks:**

1. **After plan generation, offer a "Learn About Your Plan" option:**
   ```html
   <div class="plan-philosophy-offer">
     <p>Want to understand why your plan is structured this way?</p>
     <button onclick="showTrainingPhilosophy()">📖 See Training Philosophy</button>
     <button onclick="dismissPhilosophy()">Skip</button>
   </div>
   ```

2. **Show an interactive timeline** of the training blocks:
   ```
   YOUR 16-WEEK MARATHON PLAN

   ┌─────────────┬──────────────┬──────────────┬───────┐
   │   BASE      │    BUILD     │    PEAK      │ TAPER │
   │  Weeks 1-5  │  Weeks 6-10  │ Weeks 11-14  │ 15-16 │
   └─────────────┴──────────────┴──────────────┴───────┘

   BASE (Weeks 1-5): Building your aerobic engine
   • Easy, conversational-pace miles to build endurance safely
   • Why: Your body needs time to adapt tendons, ligaments, and cardiovascular system
   • You'll feel: Like it's "too easy" — that's the point!

   BUILD (Weeks 6-10): Adding speed and strength
   • Introducing tempo runs, intervals, and longer long runs
   • Why: Now that your base is set, your body can handle harder efforts
   • You'll feel: Challenged but recovering between sessions

   PEAK (Weeks 11-14): Race-specific fitness
   • Highest volume and intensity weeks, race-pace practice
   • Why: Sharpening your fitness to be race-ready
   • You'll feel: Tired — this is normal and expected

   TAPER (Weeks 15-16): Rest and ready
   • Reducing volume while maintaining some intensity
   • Why: Your body needs 10-14 days to fully absorb training and arrive fresh
   • You'll feel: Antsy, maybe sluggish — totally normal, your body is storing energy
   ```

3. **Make this available anytime** from the active plan view (not just after generation). Add a "?" or "ℹ️" icon next to the plan name.

4. **Customize the explanation per sport:** Running, triathlon, cycling, swimming, and Hyrox all have different block structures. Generate the explanation dynamically based on the plan type.

---

## Workstream F: Wellness — Sauna & Steam (Change 10)

### Agent: `wellness-agent`

**Files to modify:** `index.html`, `workouts.js`, `hydration.js`, `nutrition.js`, `planner.js`, `style.css`, create section in `TRAINING_PHILOSOPHY.md`

### Change 10: Sauna & Steam Room Sessions

**Problem:** Sauna and steam are popular recovery/health tools but the app doesn't support logging or planning them.

**Tasks:**

1. **Add "Sauna" and "Steam Room" as session types** in the quick-entry wizard alongside existing workout types:
   ```javascript
   // Add to session type cards in index.html
   { id: 'sauna', name: 'Sauna', icon: '🧖', category: 'recovery' }
   { id: 'steam', name: 'Steam Room', icon: '♨️', category: 'recovery' }
   ```

2. **Create a simple logging form** for these sessions:
   ```html
   <div id="sauna-steam-form">
     <div class="form-row">
       <label>Duration (minutes)</label>
       <input type="number" id="sauna-duration" placeholder="15" min="1" max="120" />
     </div>
     <div class="form-row">
       <label>Temperature (°F) <span class="optional-tag">optional</span></label>
       <input type="number" id="sauna-temp" placeholder="e.g. 180" />
     </div>
     <div class="form-row">
       <label>Type</label>
       <select id="sauna-type">
         <option value="dry-sauna">Dry Sauna</option>
         <option value="infrared-sauna">Infrared Sauna</option>
         <option value="steam-room">Steam Room</option>
       </select>
     </div>
     <div class="form-row">
       <label>Notes <span class="optional-tag">optional</span></label>
       <textarea id="sauna-notes" placeholder="e.g. post-workout, cold plunge after"></textarea>
     </div>
   </div>
   ```

3. **Adjust hydration targets** after sauna/steam sessions:
   ```javascript
   // In hydration.js, after logging a sauna/steam session:
   function adjustHydrationForHeat(session) {
     // Science: 0.5-1.0 liter of sweat per 15-20 min sauna session
     // Roughly 16-32 oz additional hydration needed per session
     const additionalOz = Math.round(session.durationMinutes * 1.5); // ~1.5 oz per minute
     // Add to daily hydration target
     todayHydrationTarget += additionalOz;
     showNotification(`🧖 Sauna session logged. Hydration target increased by ${additionalOz} oz to account for sweat loss.`);
   }
   ```

4. **Adjust nutrition if needed.** Post-sauna, electrolyte replacement is important:
   - Add a note in the nutrition tab: "After your sauna session, replenish with electrolytes (sodium, potassium, magnesium)"
   - If nutrition is enabled, suggest a post-sauna snack/drink

5. **Include in training plans.** When generating plans (especially for heat acclimation for races — see Change 11):
   - Schedule 2-3 sauna sessions per week during heat acclimation blocks
   - Place them after easy workouts or on recovery days
   - Progressive protocol: start 10-15 min, build to 20-30 min over 2-3 weeks

6. **Add to training philosophy document:**
   ```
   ## Sauna & Heat Acclimation Protocol

   ### General Wellness (non-race-specific):
   - 2-3 sessions per week, 15-20 minutes
   - Post-workout preferred (muscle relaxation, blood flow)
   - Hydrate: 16-32 oz water per session
   - Benefits: improved cardiovascular function, stress relief, sleep quality
   - Sources: Laukkanen et al. (2018), Hussain & Cohen (2018)

   ### Race Heat Acclimation:
   - Begin 4 weeks before race in hot conditions
   - Week 1: 10-15 min, 3x/week post-easy-workout
   - Week 2: 15-20 min, 3x/week
   - Week 3: 20-25 min, 3-4x/week
   - Week 4 (race week): 1-2 light sessions early in week only
   - Key adaptation: Plasma volume expansion, earlier sweat onset, lower core temp
   - Sources: Periard et al. (2015), Racinais et al. (2015)
   ```

7. **Display sauna/steam in calendar** with a distinct color/icon (not confused with workouts).

---

## Workstream G: Bug Fix — Bike Pacing (Change 12)

### Agent: `bugfix-agent`

**Files to modify:** `workouts.js` or `live-tracker.js`

### Change 12: Fix Bike Pacing Calculation

**Problem:** The app said "That's a 1:42/mi pace — faster than any world record" for a 30 min / 11 mile bike ride. The app is applying running pace validation to cycling workouts.

**The user logged:**
- Duration: 30 min
- Distance: 11 mi
- That's 22 mph — a perfectly normal cycling pace

**Tasks:**

1. **Find the pace validation logic.** Search all JS files for the world record warning dialog text or the pace calculation function. It's likely in `workouts.js` or `live-tracker.js`.

2. **The bug:** The validation is calculating `duration / distance` and comparing against RUNNING world records, not cycling speeds. 30 min / 11 mi = 2.73 min/mi, which would be impossibly fast for running but normal for cycling.

3. **Fix: Use sport-specific validation thresholds:**
   ```javascript
   const PACE_SANITY_CHECKS = {
     running: {
       // World record marathon pace ~4:38/mi, sprint ~2:50/mi
       minPacePerMile: 2.5,  // minutes per mile (faster = suspicious)
       maxPacePerMile: 30,   // minutes per mile (slower = suspicious)
       warningMessage: (pace) => `That's a ${pace}/mi pace — faster than any world record. Did you enter the duration correctly?`
     },
     cycling: {
       // Tour de France avg ~25 mph, casual ~12-15 mph, sprint ~40+ mph
       minMph: 3,    // below this is suspicious (maybe walking?)
       maxMph: 45,   // above this is suspicious for sustained effort
       warningMessage: (mph) => `That's ${mph} mph — are you sure? That seems ${mph > 45 ? 'extremely fast' : 'very slow'} for cycling.`
     },
     swimming: {
       // World record 100m freestyle: ~0:46, casual: ~2:00/100m
       minPacePer100m: 0.5,  // minutes
       maxPacePer100m: 5,
       warningMessage: (pace) => `That's a ${pace}/100m pace — seems unusual. Did you enter correctly?`
     },
     rowing: {
       // World record 2k: ~5:35, casual: ~8:00-10:00
       minPacePer500m: 1.0,
       maxPacePer500m: 5.0,
       warningMessage: (pace) => `That's a ${pace}/500m split — seems unusual. Did you enter correctly?`
     }
   };

   function validatePace(type, durationMin, distance, unit) {
     const check = PACE_SANITY_CHECKS[type];
     if (!check) return { valid: true };

     if (type === 'cycling') {
       const mph = (distance / durationMin) * 60;
       if (mph < check.minMph || mph > check.maxMph) {
         return { valid: false, message: check.warningMessage(mph.toFixed(1)) };
       }
     } else if (type === 'running') {
       const pacePerMile = durationMin / distance;
       if (pacePerMile < check.minPacePerMile) {
         const paceStr = formatPace(pacePerMile);
         return { valid: false, message: check.warningMessage(paceStr) };
       }
     }
     // ... similar for swimming, rowing
     return { valid: true };
   }
   ```

4. **Test with the user's exact input:** 30 min, 11 mi cycling → 22 mph → should pass validation with no warning.

---

## Workstream H: iPhone Lock Screen Widget (Change 15)

### Agent: `widget-agent`

**Files to modify:** This requires a **Progressive Web App (PWA)** approach since IronZ is web-based.

### Change 15: iPhone Lock Screen / Home Screen Widget

**Problem:** Users want quick-access buttons for hydration (+1 bottle) and nutrition (camera/manual log) from their phone's home/lock screen.

**Feasibility Assessment:**

**iOS Lock Screen Widgets:** NOT possible from a web app. Lock screen widgets require a native iOS app built with WidgetKit (Swift/SwiftUI). This would require:
- A native iOS app wrapper (likely using Capacitor or a native Swift project)
- WidgetKit extension
- App Groups for shared data between widget and app
- Apple Developer Program membership ($99/year)

**What IS possible now (PWA approach):**

1. **Make IronZ a Progressive Web App (PWA):**
   - Add a `manifest.json` for "Add to Home Screen"
   - Add a service worker for offline support
   - Add web app shortcuts for quick actions

2. **PWA Shortcuts** (appears on long-press of home screen icon):
   ```json
   // manifest.json
   {
     "name": "IronZ",
     "short_name": "IronZ",
     "start_url": "/",
     "display": "standalone",
     "shortcuts": [
       {
         "name": "Log Water",
         "short_name": "Water",
         "url": "/?action=hydration",
         "icon": "/icons/water-96.png"
       },
       {
         "name": "Log Meal (Camera)",
         "short_name": "Meal Photo",
         "url": "/?action=meal-photo",
         "icon": "/icons/camera-96.png"
       },
       {
         "name": "Log Meal",
         "short_name": "Log Meal",
         "url": "/?action=meal-manual",
         "icon": "/icons/food-96.png"
       }
     ]
   }
   ```

3. **Handle shortcut URLs in `app.js`:**
   ```javascript
   // On app load, check URL params
   const action = new URLSearchParams(window.location.search).get('action');
   if (action === 'hydration') {
     logHydrationBottle(); // immediately +1 bottle
     showToast('💧 +1 bottle logged!');
   } else if (action === 'meal-photo') {
     showTab('nutrition');
     openMealCamera();
   } else if (action === 'meal-manual') {
     showTab('nutrition');
     openMealLogger();
   }
   ```

4. **Create PWA assets:**
   - `manifest.json`
   - `service-worker.js` (basic caching)
   - App icons at multiple sizes (192x192, 512x512)
   - Shortcut icons (96x96)

5. **Note for the future:** Document that true lock screen widgets require a native iOS app. If/when IronZ goes native, implement WidgetKit extensions.

---

## Implementation Order (Recommended)

### Phase 1 — Critical Fixes (Week 1)
Launch as parallel subagents:

| Agent | Changes | Est. Effort |
|-------|---------|-------------|
| `bugfix-agent` | #12 Bike pacing fix | 1-2 hours |
| `ux-mobile-agent` | #1 Mobile UX, #2 Drag/scroll fix | 1-2 days |
| `nutrition-agent` (allergies only) | #4 Allergy-safe nutrition | 4-6 hours |
| `workout-features-agent` (exit only) | #5 Exit without save | 1-2 hours |

### Phase 2 — Core Features (Week 2-3)
Launch as parallel subagents:

| Agent | Changes | Est. Effort |
|-------|---------|-------------|
| `onboarding-agent` | #3 Height ft/in, #13 Zones | 1 day |
| `workout-features-agent` | #6 Exercise swap, #8 Hyrox builder, #16 Watts | 2-3 days |
| `nutrition-agent` (fueling) | #7 Fueling during workouts | 1-2 days |
| `training-plan-agent` (blocks) | #14 Training blocks explained | 1 day |

### Phase 3 — Advanced Features (Week 3-4)
Launch as parallel subagents:

| Agent | Changes | Est. Effort |
|-------|---------|-------------|
| `training-plan-agent` | #9 Hyrox plans, #11 Race day | 2-3 days |
| `wellness-agent` | #10 Sauna & steam | 1-2 days |
| `widget-agent` | #15 PWA + shortcuts | 1 day |

---

## Claude Code Subagent Instructions

When feeding this to Claude Code, use this pattern:

```
Read the file IMPLEMENTATION_PLAN.md in the repo root.
Then implement the changes in Phase [1/2/3] using parallel subagents.

For each agent/workstream, spawn a subagent with:
1. The workstream section from the plan as its instructions
2. Access to the full codebase
3. Instructions to test changes and not break existing functionality
4. Instructions to add comments citing this plan (e.g., "// IMPL_PLAN Change #4")

After all subagents complete, do a final integration test:
- Verify no JS errors in console
- Verify all tabs still load
- Verify mobile responsiveness at 375px width
- Verify existing features still work (regression)
```

---

## Training Philosophy Document

Create `TRAINING_PHILOSOPHY.md` in the repo root with sections for:

1. **Endurance Training Periodization** (base → build → peak → taper)
2. **Hyrox Training** (per Change 9)
3. **Fueling During Exercise** (per Change 7)
4. **Sauna & Heat Acclimation** (per Change 10)
5. **Race-Specific Adaptations** (per Change 11)
6. **Zone-Based Training** (per Change 13)

All recommendations should cite sports science sources (ACSM, NSCA, peer-reviewed research). This document should be referenced by `planner.js` when generating AI-powered training plans.

---

## Files Created/Modified Summary

| File | Action | Changes |
|------|--------|---------|
| `index.html` | Modify | Height inputs, Hyrox builder UI, sauna form, zone inputs, exit button, swap button, fueling display, race details form, training blocks UI, allergy UI |
| `style.css` | Modify | Mobile fixes, drag handle, sticky save, Hyrox colors, sauna styling |
| `workouts.js` | Modify | Bike pace fix, sport-specific validation, watts logging, sauna/steam types |
| `workout-editor.js` | Modify | Drag handle pattern, swap exercise, Hyrox builder logic |
| `live-tracker.js` | Modify | Exit without save, fueling display during workout, swap exercise |
| `exercise-library.js` | Modify | Substitution map for exercise swaps |
| `nutrition.js` / `nutrition-v2.js` | Modify | Allergy hard filter, post-generation validation, fueling logic |
| `meals-data.js` | Modify | Allergy constraints in AI prompts |
| `planner.js` | Modify | Hyrox plans, race adaptation, zone-based planning, training blocks, sauna scheduling |
| `onboarding.js` | Modify | Height ft/in, zones step |
| `survey.js` | Modify | Zones in onboarding flow |
| `hydration.js` | Modify | Post-sauna hydration adjustment |
| `calendar.js` | Modify | Sauna/steam display, race info card |
| `app.js` | Modify | PWA shortcut handling |
| `manifest.json` | **Create** | PWA manifest with shortcuts |
| `service-worker.js` | **Create** | Basic PWA service worker |
| `fueling.js` | **Create** | Fueling rules engine |
| `TRAINING_PHILOSOPHY.md` | **Create** | Science-based training guidelines |
