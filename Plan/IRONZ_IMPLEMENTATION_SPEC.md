# IronZ v2.0 — Implementation Spec for Claude Code

> **How to use:** Open your IronZ project directory in Claude Code, then paste this entire file as your prompt (or reference it). Claude Code will have access to all your files and can implement each feature directly.

---

## Project Context

IronZ is a health & wellness web app built as a single-page application with:
- **index.html** — All HTML structure (auth screen, tabs: home, training, nutrition, stats, settings, saved-workouts, community)
- **Separate JS files:** config.js, icons.js, themes.js, stats.js, workouts.js, nutrition.js, meals-data.js, planner.js, survey.js, calendar.js, app.js, workout-editor.js, auth.js
- **style.css** — All styling
- **supabase-init.js** — Supabase client setup
- **Backend:** Supabase (auth + database)
- **AI:** Claude API (already used for Ask IronZ workout generation)

The user has a Claude API key for AI-powered features.

---

## PHASE 1: First Launch Essentials

### Feature 1: Onboarding Survey (First-Time User Experience)

**Goal:** When a new user signs up, show a multi-step onboarding wizard BEFORE they see the main app. Pre-fill their profile and auto-generate their first plan.

**Where it fits:**
- The app already has a `survey-overlay` div in index.html (line ~1298-1314) and a `survey.js` file. The existing survey is the "Build Plan" survey triggered by the header button.
- The **onboarding survey** should be a SEPARATE flow that only triggers on first login (check if profile is empty or a `has_onboarded` flag).

**Implementation:**

1. **In auth.js** — After successful login/signup, check if user has completed onboarding:
```javascript
// After auth succeeds and app loads:
const profile = await loadProfile(); // however you currently load profile
if (!profile || !profile.has_onboarded) {
  showOnboardingSurvey();
}
```

2. **In index.html** — Add a new overlay div (place it after the survey-overlay, before the scripts):
```html
<!-- ===== ONBOARDING SURVEY ===== -->
<div id="onboarding-overlay" class="survey-overlay" style="display:none">
  <div class="survey-modal">
    <div class="sv-progress-bar">
      <div class="sv-progress-fill" id="onboarding-progress-fill"></div>
    </div>
    <div class="sv-step-content" id="onboarding-step-content"></div>
    <div class="sv-modal-footer">
      <p class="sv-val-msg" id="onboarding-val-msg"></p>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" id="onboarding-back-btn" onclick="onboardingBack()" style="display:none">← Back</button>
        <button class="sv-next-btn" id="onboarding-next-btn" onclick="onboardingNext()" style="flex:1">Continue →</button>
      </div>
    </div>
  </div>
</div>
```

3. **Create onboarding.js** — New file with the onboarding flow:

**Steps to implement:**

- **Step 1 — Welcome:** "Welcome to IronZ! Let's personalize your experience." with user's name from signup.
- **Step 2 — Profile Basics:** Age, weight (lbs), height (in), gender select. Pre-fill from existing profile if any data exists.
- **Step 3 — Fitness Goals:** Card-style selection (like the existing plan-goal-grid). Options: Endurance (marathon/triathlon), Strength & Power, Weight Loss, Speed & Performance, General Fitness. Maps to `profile-goal` in Settings.
- **Step 4 — Experience Level:** Beginner / Intermediate / Advanced with descriptions:
  - Beginner: "New to structured training or returning after a long break"
  - Intermediate: "Consistent training for 6+ months, familiar with basic exercises"
  - Advanced: "2+ years of structured training, comfortable with complex programming"
- **Step 5 — Training Preferences:** Days per week (day picker chips like existing `plan-day-picker`), preferred session length (30/45/60/75 min), available equipment checkboxes (bodyweight, dumbbells, barbell & rack, cables/machines, cardio equipment).
- **Step 6 — Feature Interest:** Toggle switches for: Nutrition Tracking, Hydration Tracking, Race Training. These enable/disable the corresponding nav tabs.
- **Step 7 — Dietary Info (conditional — only if nutrition selected):** Dietary restrictions multi-select (vegetarian, vegan, gluten-free, dairy-free, keto, none), allergies text input, foods they love (comma-separated), foods to avoid (comma-separated). Maps to the existing food preferences system.
- **Final Step — Summary & Generate:** Show a summary card of their selections. "Ready to build your first plan?" button. Auto-generate a training plan using their selections, then dismiss overlay and show the app.

**Data flow:**
- Save all onboarding data to the existing profile fields (profile-name, profile-age, profile-weight, profile-height, profile-gender, profile-goal in Settings)
- Set `has_onboarded: true` in Supabase user metadata or a local flag
- Enable/disable nutrition nav based on their selection (reuse existing `setNutritionEnabled()`)
- If they selected training days and a goal, auto-trigger plan generation (reuse existing `generatePlan()` logic)

**Add `<script src="onboarding.js"></script>` to index.html before auth.js.**

---

### Feature 2: Nutrition Section Overhaul

**Goal:** Transform the nutrition tab from a basic meal logger into an intelligent nutrition engine with AI photo logging, smart dashboard, training-aware recommendations, and grocery lists.

**Current state (in index.html, tab-nutrition):**
- Log a Meal (manual: date, name, calories, protein, carbs, fat)
- Today's Summary (empty state)
- Food Preferences (likes/dislikes chips)
- Meal History

**Changes to index.html — Replace the entire `tab-nutrition` content with:**

```html
<div id="tab-nutrition" class="tab-content">

  <!-- Nutrition Dashboard (NEW — replaces Today's Summary) -->
  <section class="card" id="section-nutrition-dashboard">
    <h2 style="margin:0 0 12px">Today's Nutrition</h2>
    <div class="nutrition-dashboard">
      <!-- Calorie budget bar -->
      <div class="nutri-budget-bar">
        <div class="nutri-budget-label">
          <span id="nutri-calories-eaten">0</span> / <span id="nutri-calories-target">2,200</span> cal
        </div>
        <div class="nutri-progress-track">
          <div class="nutri-progress-fill" id="nutri-progress-fill" style="width:0%"></div>
        </div>
      </div>
      <!-- Macro rings -->
      <div class="nutri-macro-rings">
        <div class="nutri-ring-item">
          <canvas id="nutri-ring-protein" width="80" height="80"></canvas>
          <div class="nutri-ring-label">Protein</div>
          <div class="nutri-ring-value" id="nutri-protein-value">0g</div>
        </div>
        <div class="nutri-ring-item">
          <canvas id="nutri-ring-carbs" width="80" height="80"></canvas>
          <div class="nutri-ring-label">Carbs</div>
          <div class="nutri-ring-value" id="nutri-carbs-value">0g</div>
        </div>
        <div class="nutri-ring-item">
          <canvas id="nutri-ring-fat" width="80" height="80"></canvas>
          <div class="nutri-ring-label">Fat</div>
          <div class="nutri-ring-value" id="nutri-fat-value">0g</div>
        </div>
      </div>
      <!-- Training context -->
      <div class="nutri-training-context" id="nutri-training-context" style="display:none">
        <p class="nutri-context-label">Based on today's workout:</p>
        <p class="nutri-context-text" id="nutri-context-text"></p>
      </div>
    </div>
  </section>

  <!-- Quick Log Options (NEW) -->
  <section class="card">
    <h2 style="margin:0 0 12px">Log a Meal</h2>
    <div class="nutri-log-options">
      <button class="nutri-log-btn" onclick="openPhotoMealLog()">
        <span class="nutri-log-icon">📸</span>
        <span>Photo Log</span>
        <span class="nutri-log-desc">Snap & auto-detect</span>
      </button>
      <button class="nutri-log-btn" onclick="openManualMealLog()">
        <span class="nutri-log-icon">✏️</span>
        <span>Manual Entry</span>
        <span class="nutri-log-desc">Enter details yourself</span>
      </button>
      <button class="nutri-log-btn" onclick="openQuickAddMeal()">
        <span class="nutri-log-icon">⚡</span>
        <span>Quick Add</span>
        <span class="nutri-log-desc">Recent & favorites</span>
      </button>
    </div>
  </section>

  <!-- Photo Meal Log Modal (NEW) -->
  <div id="photo-meal-modal" style="display:none">
    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h2 style="margin:0">Photo Log</h2>
        <button class="btn-secondary" onclick="closePhotoMealLog()">← Back</button>
      </div>
      <p class="hint">Take a photo of your meal and AI will estimate the nutritional content.</p>
      <div class="photo-upload-area" id="photo-upload-area">
        <input type="file" id="meal-photo-input" accept="image/*" capture="environment" onchange="handleMealPhoto(this)" style="display:none" />
        <button class="btn-primary" onclick="document.getElementById('meal-photo-input').click()" style="width:100%;padding:20px">
          📸 Take Photo or Upload
        </button>
      </div>
      <div id="photo-preview-area" style="display:none">
        <img id="meal-photo-preview" style="width:100%;border-radius:8px;margin:12px 0" />
        <div id="photo-ai-loading" style="display:none;text-align:center;padding:16px">
          <div class="qe-spinner"></div>
          <p style="color:var(--color-text-muted);margin-top:8px">Analyzing your meal...</p>
        </div>
        <div id="photo-ai-result" style="display:none">
          <h3>Detected Meal</h3>
          <div id="photo-detected-foods"></div>
          <div class="form-grid" style="margin-top:12px">
            <div class="form-row">
              <label>Calories</label>
              <input type="number" id="photo-calories" />
            </div>
            <div class="form-row">
              <label>Protein (g)</label>
              <input type="number" id="photo-protein" />
            </div>
            <div class="form-row">
              <label>Carbs (g)</label>
              <input type="number" id="photo-carbs" />
            </div>
            <div class="form-row">
              <label>Fat (g)</label>
              <input type="number" id="photo-fat" />
            </div>
          </div>
          <p class="hint">AI estimates — feel free to adjust before saving.</p>
          <button class="btn-primary" style="width:100%;margin-top:12px" onclick="savePhotoMeal()">Log This Meal</button>
        </div>
      </div>
      <p id="photo-meal-msg" class="save-msg"></p>
    </section>
  </div>

  <!-- Manual Meal Log (keep existing, wrapped in toggleable div) -->
  <div id="manual-meal-section">
    <section class="card collapsible is-collapsed" id="section-log-meal">
      <!-- KEEP EXISTING LOG A MEAL CONTENT -->
      <!-- (Claude Code: preserve the existing section-log-meal card body as-is) -->
    </section>
  </div>

  <!-- AI Meal Suggestions (NEW) -->
  <section class="card collapsible is-collapsed" id="section-meal-suggestions">
    <div class="card-toggle" onclick="toggleSection('section-meal-suggestions')">
      <h2>Meal Ideas</h2>
      <span class="card-chevron">▾</span>
    </div>
    <div class="card-body">
      <p class="hint">AI-generated meal suggestions based on your preferences, goals, and training schedule.</p>
      <div class="nutri-meal-plan" id="nutri-meal-suggestions">
        <button class="btn-primary" onclick="generateMealSuggestions()" style="width:100%">
          ⚡ Generate Today's Meal Ideas
        </button>
      </div>
      <div id="meal-suggestions-result" style="display:none"></div>
    </div>
  </section>

  <!-- Weekly Grocery List (NEW) -->
  <section class="card collapsible is-collapsed" id="section-grocery-list">
    <div class="card-toggle" onclick="toggleSection('section-grocery-list')">
      <h2>Grocery List</h2>
      <span class="card-chevron">▾</span>
    </div>
    <div class="card-body">
      <p class="hint">Auto-generated shopping list based on your meal plan for the week.</p>
      <button class="btn-primary" onclick="generateGroceryList()" style="width:100%;margin-bottom:12px">
        🛒 Generate Grocery List
      </button>
      <div id="grocery-list-content">
        <p class="empty-msg">Generate a grocery list based on your upcoming meal plan.</p>
      </div>
    </div>
  </section>

  <!-- Food Preferences (KEEP EXISTING) -->
  <section class="card collapsible is-collapsed" id="section-food-prefs">
    <!-- KEEP EXISTING CONTENT -->
  </section>

  <!-- Meal History (KEEP EXISTING) -->
  <section class="card collapsible is-collapsed" id="section-meal-history">
    <!-- KEEP EXISTING CONTENT -->
  </section>

</div>
```

**New JS file: nutrition-v2.js**

Key functions to implement:

```javascript
// === PHOTO MEAL LOGGING ===
function openPhotoMealLog() { /* show photo-meal-modal, hide other sections */ }
function closePhotoMealLog() { /* hide modal, show main nutrition view */ }

async function handleMealPhoto(input) {
  // 1. Show preview of the photo
  // 2. Convert to base64
  // 3. Call Claude Vision API:
  //    POST https://api.anthropic.com/v1/messages
  //    Model: claude-sonnet-4-20250514
  //    System: "You are a nutrition analysis AI. Analyze the food in this image.
  //            Return JSON: { foods: [{name, estimated_calories, protein_g, carbs_g, fat_g}],
  //            total: {calories, protein_g, carbs_g, fat_g}, description: string }"
  //    Content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
  //              { type: "text", text: "Identify all food items and estimate nutritional content." }]
  // 4. Parse response, populate form fields
  // 5. User can adjust before saving
}

function savePhotoMeal() { /* reuse existing saveMeal() logic with photo data */ }

// === SMART DASHBOARD ===
function updateNutritionDashboard() {
  // Calculate daily targets based on:
  // - Profile: age, weight, height, gender from Settings
  // - Goal: bulk/cut/maintain/lose from profile-goal
  // - Today's workout: type, duration, intensity from calendar
  // Basic formulas:
  //   BMR (Mifflin-St Jeor): 10*weight_kg + 6.25*height_cm - 5*age - 161 (female) or +5 (male)
  //   TDEE = BMR * activity_multiplier (1.2 sedentary, 1.375 light, 1.55 moderate, 1.725 active)
  //   Adjust for goal: bulk +300-500, cut -300-500, lose -500-750
  // Macro split based on goal:
  //   Bulk: 30% protein, 45% carbs, 25% fat
  //   Cut: 35% protein, 35% carbs, 30% fat
  //   Maintain: 30% protein, 40% carbs, 30% fat
  // Draw progress rings using canvas
}

function drawMacroRing(canvasId, current, target, color) {
  // Draw a circular progress ring on the canvas
}

function updateTrainingContext() {
  // Check today's scheduled workout
  // Show message like "Push day scheduled — aim for higher protein and carbs today"
}

// === MEAL SUGGESTIONS ===
async function generateMealSuggestions() {
  // Call Claude API with context:
  // - User profile (age, weight, goal)
  // - Food preferences (likes, dislikes from existing pref system)
  // - Today's workout type
  // - What they've already eaten today
  // - Remaining macro budget
  // Prompt: "Generate 3 meal suggestions for [meal_type] that fit these macros: ..."
  // Display as cards with: meal name, ingredients, estimated macros, prep time
}

// === GROCERY LIST ===
async function generateGroceryList() {
  // Call Claude API with the week's meal plan
  // Return organized by category: Produce, Protein, Dairy, Grains, etc.
  // Render as checkable list items
}
```

**CSS additions for style.css:**
```css
/* Nutrition Dashboard */
.nutrition-dashboard { display: flex; flex-direction: column; gap: 16px; }
.nutri-budget-bar { }
.nutri-budget-label { display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 6px; }
.nutri-progress-track { height: 12px; background: var(--color-surface-alt); border-radius: 6px; overflow: hidden; }
.nutri-progress-fill { height: 100%; background: var(--color-accent); border-radius: 6px; transition: width 0.3s; }
.nutri-macro-rings { display: flex; justify-content: space-around; text-align: center; }
.nutri-ring-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.nutri-ring-label { font-size: 0.75rem; color: var(--color-text-muted); }
.nutri-ring-value { font-weight: 700; font-size: 0.9rem; }
.nutri-log-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.nutri-log-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px 8px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-surface); cursor: pointer; transition: all 0.15s; }
.nutri-log-btn:hover { border-color: var(--color-accent); background: var(--color-surface-alt); }
.nutri-log-icon { font-size: 1.5rem; }
.nutri-log-desc { font-size: 0.7rem; color: var(--color-text-muted); }
.nutri-training-context { background: var(--color-surface-alt); border-radius: 8px; padding: 12px; border-left: 3px solid var(--color-accent); }
```

**Add `<script src="nutrition-v2.js"></script>` after nutrition.js in index.html.**

---

### Feature 3: Create Your Own Plan

**Goal:** Add a "Create Your Own Plan" option alongside the existing AI-generated plan. Users can manually build their weekly schedule, use a hybrid approach (some days AI, some manual), or import from saved workouts.

**Where it fits:**
- Add a new section in `tab-training` in index.html, placed AFTER the existing `section-generate-plan` (Gym & Strength).
- Or, add it as a new option in the existing plan generation flow.
- Also add a prominent button on the home tab near the "Build Plan" flow.

**In index.html — Add after `section-generate-plan` closing tag (line ~265):**

```html
<!-- Create Your Own Plan -->
<section class="card collapsible is-collapsed" id="section-custom-plan">
  <div class="card-toggle" onclick="toggleSection('section-custom-plan')">
    <h2>Create Your Own Plan</h2>
    <span class="card-chevron">▾</span>
  </div>
  <div class="card-body">
    <p class="hint">Build your own weekly training schedule. Mix AI-generated sessions with your own workouts.</p>

    <div class="form-grid">
      <div class="form-row">
        <label for="custom-plan-start">Start Date</label>
        <input type="date" id="custom-plan-start" />
      </div>
      <div class="form-row">
        <label for="custom-plan-weeks">Duration</label>
        <select id="custom-plan-weeks">
          <option value="1">1 week</option>
          <option value="2">2 weeks</option>
          <option value="4" selected>4 weeks</option>
          <option value="8">8 weeks</option>
          <option value="12">12 weeks</option>
        </select>
      </div>
    </div>

    <!-- Weekly template builder -->
    <div class="custom-plan-week" id="custom-plan-builder">
      <div class="custom-plan-day" data-day="1">
        <div class="custom-day-header">
          <span class="custom-day-label">Monday</span>
          <div class="custom-day-actions">
            <button class="btn-secondary btn-sm" onclick="customPlanAddAI(1)">⚡ AI Generate</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddSaved(1)">📋 From Saved</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddManual(1)">✏️ Manual</button>
            <button class="btn-secondary btn-sm" onclick="customPlanSetRest(1)">😴 Rest</button>
          </div>
        </div>
        <div class="custom-day-content" id="custom-day-1-content">
          <p class="empty-msg">No session planned</p>
        </div>
      </div>
      <!-- Repeat for Tue-Sun (days 2-0) -->
      <div class="custom-plan-day" data-day="2">
        <div class="custom-day-header">
          <span class="custom-day-label">Tuesday</span>
          <div class="custom-day-actions">
            <button class="btn-secondary btn-sm" onclick="customPlanAddAI(2)">⚡ AI Generate</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddSaved(2)">📋 From Saved</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddManual(2)">✏️ Manual</button>
            <button class="btn-secondary btn-sm" onclick="customPlanSetRest(2)">😴 Rest</button>
          </div>
        </div>
        <div class="custom-day-content" id="custom-day-2-content">
          <p class="empty-msg">No session planned</p>
        </div>
      </div>
      <div class="custom-plan-day" data-day="3">
        <div class="custom-day-header">
          <span class="custom-day-label">Wednesday</span>
          <div class="custom-day-actions">
            <button class="btn-secondary btn-sm" onclick="customPlanAddAI(3)">⚡ AI Generate</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddSaved(3)">📋 From Saved</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddManual(3)">✏️ Manual</button>
            <button class="btn-secondary btn-sm" onclick="customPlanSetRest(3)">😴 Rest</button>
          </div>
        </div>
        <div class="custom-day-content" id="custom-day-3-content">
          <p class="empty-msg">No session planned</p>
        </div>
      </div>
      <div class="custom-plan-day" data-day="4">
        <div class="custom-day-header">
          <span class="custom-day-label">Thursday</span>
          <div class="custom-day-actions">
            <button class="btn-secondary btn-sm" onclick="customPlanAddAI(4)">⚡ AI Generate</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddSaved(4)">📋 From Saved</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddManual(4)">✏️ Manual</button>
            <button class="btn-secondary btn-sm" onclick="customPlanSetRest(4)">😴 Rest</button>
          </div>
        </div>
        <div class="custom-day-content" id="custom-day-4-content">
          <p class="empty-msg">No session planned</p>
        </div>
      </div>
      <div class="custom-plan-day" data-day="5">
        <div class="custom-day-header">
          <span class="custom-day-label">Friday</span>
          <div class="custom-day-actions">
            <button class="btn-secondary btn-sm" onclick="customPlanAddAI(5)">⚡ AI Generate</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddSaved(5)">📋 From Saved</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddManual(5)">✏️ Manual</button>
            <button class="btn-secondary btn-sm" onclick="customPlanSetRest(5)">😴 Rest</button>
          </div>
        </div>
        <div class="custom-day-content" id="custom-day-5-content">
          <p class="empty-msg">No session planned</p>
        </div>
      </div>
      <div class="custom-plan-day" data-day="6">
        <div class="custom-day-header">
          <span class="custom-day-label">Saturday</span>
          <div class="custom-day-actions">
            <button class="btn-secondary btn-sm" onclick="customPlanAddAI(6)">⚡ AI Generate</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddSaved(6)">📋 From Saved</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddManual(6)">✏️ Manual</button>
            <button class="btn-secondary btn-sm" onclick="customPlanSetRest(6)">😴 Rest</button>
          </div>
        </div>
        <div class="custom-day-content" id="custom-day-6-content">
          <p class="empty-msg">No session planned</p>
        </div>
      </div>
      <div class="custom-plan-day" data-day="0">
        <div class="custom-day-header">
          <span class="custom-day-label">Sunday</span>
          <div class="custom-day-actions">
            <button class="btn-secondary btn-sm" onclick="customPlanAddAI(0)">⚡ AI Generate</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddSaved(0)">📋 From Saved</button>
            <button class="btn-secondary btn-sm" onclick="customPlanAddManual(0)">✏️ Manual</button>
            <button class="btn-secondary btn-sm" onclick="customPlanSetRest(0)">😴 Rest</button>
          </div>
        </div>
        <div class="custom-day-content" id="custom-day-0-content">
          <p class="empty-msg">No session planned</p>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn-secondary" onclick="customPlanCopyWeek()">📋 Copy Week Template</button>
      <button class="btn-primary" style="flex:1" onclick="saveCustomPlan()">Save & Schedule Plan</button>
    </div>
    <p id="custom-plan-msg" class="save-msg"></p>
  </div>
</section>
```

**Create custom-plan.js:**
```javascript
// customPlanAddAI(dayNum) — Opens a mini dialog to specify workout type, then calls AI to generate
// customPlanAddSaved(dayNum) — Shows a picker of saved workouts to assign to this day
// customPlanAddManual(dayNum) — Opens inline exercise entry for this day
// customPlanSetRest(dayNum) — Marks as rest day
// customPlanCopyWeek() — Duplicates current week template for multi-week plans
// saveCustomPlan() — Takes the weekly template, expands to X weeks, saves to calendar/schedule
```

**CSS:**
```css
.custom-plan-week { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.custom-plan-day { border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
.custom-day-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--color-surface-alt); }
.custom-day-label { font-weight: 700; font-size: 0.9rem; }
.custom-day-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.btn-sm { font-size: 0.7rem; padding: 4px 8px; }
.custom-day-content { padding: 10px 12px; min-height: 40px; }
```

---

### Feature 4: Profile Adaptability & Leveling System

**Goal:** Track user progress, reward consistency, and auto-adjust difficulty level over time.

**Where it fits:**
- New section in the Stats tab
- Level badge visible on Profile/Settings
- Achievement notifications as modals

**In index.html — Add to `tab-stats` (inside `stats-view-stats` div):**

```html
<!-- Level & Progress (add before stats-content) -->
<section class="card" id="section-level-progress">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <div>
      <h2 style="margin:0">Your Level</h2>
      <p class="hint" style="margin:4px 0 0">Based on consistency, volume, and progression</p>
    </div>
    <div class="level-badge" id="level-badge">
      <span class="level-badge-icon">⚡</span>
      <span class="level-badge-text" id="level-badge-text">Beginner</span>
    </div>
  </div>
  <div class="level-progress-bar" style="margin-top:12px">
    <div class="level-progress-label">
      <span id="level-progress-text">Progress to Intermediate</span>
      <span id="level-progress-pct">0%</span>
    </div>
    <div class="nutri-progress-track">
      <div class="nutri-progress-fill" id="level-progress-fill" style="width:0%"></div>
    </div>
  </div>
  <!-- Achievement badges -->
  <div class="achievements-grid" id="achievements-grid" style="margin-top:16px">
    <!-- Populated by JS -->
  </div>
</section>
```

**Create leveling.js:**

Level-up criteria:
- **Beginner → Intermediate:** 30+ workouts logged, 4+ weeks of consistent training (3+ sessions/week), demonstrated progressive overload (weights increasing or volume increasing)
- **Intermediate → Advanced:** 100+ workouts logged, 12+ weeks of consistent training, handling complex programming (supersets, periodization), significant strength/endurance gains

Achievement badges to implement:
- "First Workout" — Log your first workout
- "Week Warrior" — Complete all scheduled workouts in a week
- "30-Day Streak" — Train at least 3x/week for 30 days
- "Century Club" — Log 100 workouts
- "PR Machine" — Set 5 personal records
- "Nutrition Tracker" — Log meals for 7 consecutive days
- "Hydration Hero" — Hit water target for 7 consecutive days
- "Plan Completer" — Finish an entire training plan

```javascript
function calculateProgressScore() {
  // Query workout history
  // Calculate: consistency score (0-100), volume trend (0-100), adherence (0-100)
  // Composite = weighted average
}

function checkLevelUp() {
  // Compare current metrics against level-up criteria
  // If qualified, show celebration modal and update profile
}

function renderAchievements() {
  // Check each badge condition, render earned vs locked badges
}
```

---

### Feature 5: Hydration Tracking

**Goal:** Simple, satisfying water tracking with smart daily targets.

**Where it fits:**
- New nav button in header (between Nutrition and Stats, or as a section on Home)
- Toggle on/off in Settings > Preferences
- Simple daily log

**Approach A (recommended): Add as a card on the Home tab:**

In index.html, add after `day-detail-card` in `tab-home`:

```html
<!-- Hydration Tracker -->
<section class="card" id="hydration-card" style="display:none">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h2 style="margin:0">Hydration</h2>
    <button class="btn-secondary btn-sm" onclick="openHydrationSettings()">⚙️</button>
  </div>
  <div class="hydration-tracker">
    <div class="hydration-visual" id="hydration-visual">
      <!-- Water bottle SVG with fill animation -->
      <svg viewBox="0 0 80 160" width="80" height="160" id="hydration-bottle-svg">
        <defs>
          <clipPath id="bottle-clip">
            <path d="M25,30 L25,140 Q25,155 40,155 Q55,155 55,140 L55,30 Q55,20 40,20 Q25,20 25,30Z"/>
          </clipPath>
        </defs>
        <path d="M25,30 L25,140 Q25,155 40,155 Q55,155 55,140 L55,30 Q55,20 40,20 Q25,20 25,30Z" fill="none" stroke="var(--color-border)" stroke-width="2"/>
        <rect id="hydration-fill-rect" x="20" y="155" width="40" height="0" fill="var(--color-accent)" opacity="0.3" clip-path="url(#bottle-clip)" style="transition: y 0.5s, height 0.5s"/>
      </svg>
    </div>
    <div class="hydration-info">
      <div class="hydration-count">
        <span id="hydration-current">0</span> / <span id="hydration-target-display">8</span> bottles
      </div>
      <div class="hydration-oz" id="hydration-oz-display">0 / 96 oz</div>
      <button class="btn-primary hydration-log-btn" onclick="logWater()">
        💧 + 1 Bottle
      </button>
      <button class="btn-secondary hydration-undo-btn" onclick="undoWater()" id="hydration-undo-btn" style="display:none">
        Undo
      </button>
    </div>
  </div>
  <!-- Electrolyte suggestion -->
  <div class="hydration-tip" id="hydration-tip" style="display:none">
    <p id="hydration-tip-text"></p>
  </div>
</section>

<!-- Hydration Settings Modal -->
<div id="hydration-settings-modal" class="quick-entry-overlay" style="display:none" onclick="if(event.target===this) closeHydrationSettings()">
  <div class="quick-entry-modal" style="max-width:340px">
    <div class="quick-entry-header">
      <span class="qe-date-label">Hydration Settings</span>
      <button class="qe-close-btn" onclick="closeHydrationSettings()">✕</button>
    </div>
    <div class="form-row">
      <label for="hydration-bottle-size">Water Bottle Size</label>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" id="hydration-bottle-size" value="12" min="4" max="64" style="width:80px" />
        <span>oz</span>
      </div>
    </div>
    <div class="form-row">
      <label for="hydration-daily-target-oz">Daily Target (oz)</label>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" id="hydration-daily-target-oz" min="20" max="300" style="width:80px" />
        <span>oz</span>
        <span class="hint" style="margin:0">(auto: ~0.5-1 oz per lb body weight)</span>
      </div>
    </div>
    <button class="btn-primary" style="width:100%;margin-top:12px" onclick="saveHydrationSettings()">Save</button>
  </div>
</div>
```

**In Settings > Preferences — add a hydration toggle:**
```html
<div class="pref-row">
  <div>
    <div class="pref-label">Hydration Tracking</div>
    <div class="pref-desc">Show the hydration tracker on your Home screen</div>
  </div>
  <label class="toggle-switch">
    <input type="checkbox" id="pref-hydration-toggle" onchange="setHydrationEnabled(this.checked)" />
    <span class="toggle-slider"></span>
  </label>
</div>
```

**Create hydration.js:**
```javascript
function initHydration() {
  const settings = JSON.parse(localStorage.getItem('hydration_settings') || '{}');
  const bottleSize = settings.bottleSize || 12; // oz
  const profile = loadProfile();
  const weight = profile?.weight || 160;
  const dailyTargetOz = settings.dailyTargetOz || Math.round(weight * 0.6); // 0.6 oz per lb
  const bottlesNeeded = Math.ceil(dailyTargetOz / bottleSize);
  // Load today's log
  // Render
}

function logWater() {
  // Increment today's count
  // Animate fill
  // Check if target met — show congrats
  // Check if heavy training day — suggest electrolytes
}

function updateHydrationVisual(current, target) {
  const pct = Math.min(current / target, 1);
  const fillHeight = 135 * pct;
  const fillY = 155 - fillHeight;
  document.getElementById('hydration-fill-rect').setAttribute('y', fillY);
  document.getElementById('hydration-fill-rect').setAttribute('height', fillHeight);
}

function checkElectrolyteSuggestion() {
  // If today has a workout > 60min or high intensity, show tip:
  // "Heavy training day — consider adding electrolytes to stay balanced"
}
```

---

## PHASE 2: Quick Wins

### Feature 6: Expanded Workout Types

**Current quick-add types (in index.html qe-step-0, line ~928-978):**
Strength, Running, Cycling, Swimming, HIIT, Brick

**Add these buttons to the `qe-type-grid` in index.html:**
```html
<button class="qe-type-card" onclick="qeSelectType('yoga')">
  <span class="qe-type-icon">🧘</span>
  <span class="qe-type-label">Yoga</span>
</button>
<button class="qe-type-card" onclick="qeSelectType('mobility')">
  <span class="qe-type-icon">🤸</span>
  <span class="qe-type-label">Mobility</span>
</button>
<button class="qe-type-card" onclick="qeSelectType('walking')">
  <span class="qe-type-icon">🚶</span>
  <span class="qe-type-label">Walking</span>
</button>
<button class="qe-type-card" onclick="qeSelectType('rowing')">
  <span class="qe-type-icon">🚣</span>
  <span class="qe-type-label">Rowing</span>
</button>
<button class="qe-type-card" onclick="qeSelectType('pilates')">
  <span class="qe-type-icon">💪</span>
  <span class="qe-type-label">Pilates</span>
</button>
<button class="qe-type-card" onclick="qeSelectType('sport')">
  <span class="qe-type-icon">⚽</span>
  <span class="qe-type-label">Sport</span>
</button>
```

**Also update the workout log type dropdown (`log-workout-type` select) to include these new types.**

**In the quick-entry wizard JS:** Yoga, mobility, walking, rowing, pilates, and sport should all route to the cardio/general step (`qe-step-1-cardio`) since they share the same input pattern (intensity + duration + notes). The `qeSelectType` function needs a case for each that sets the appropriate label/icon.

---

### Feature 7: Life Training Plans

**Goal:** Non-race endurance plans for users who want structured improvement without a target event.

**In index.html — Add a new section in `tab-training` after Race Events but before Gym & Strength:**

```html
<!-- Life Training -->
<section class="card collapsible is-collapsed" id="section-life-training">
  <div class="card-toggle" onclick="toggleSection('section-life-training')">
    <h2>Life Training</h2>
    <span class="card-chevron">▾</span>
  </div>
  <div class="card-body">
    <p class="hint">Structured plans to improve your running, cycling, or swimming — no race required.</p>

    <div class="form-row">
      <label for="life-sport">Sport</label>
      <select id="life-sport">
        <option value="running">Running</option>
        <option value="cycling">Cycling</option>
        <option value="swimming">Swimming</option>
      </select>
    </div>

    <div class="form-row">
      <label for="life-goal">Goal</label>
      <select id="life-goal">
        <option value="base-building">Build a base (increase weekly volume)</option>
        <option value="speed">Get faster (speed work focus)</option>
        <option value="endurance">Go longer (distance focus)</option>
        <option value="consistency">Stay consistent (maintain fitness)</option>
      </select>
    </div>

    <div class="form-row">
      <label for="life-current-level">Current Level</label>
      <select id="life-current-level">
        <option value="beginner">Beginner (just starting out)</option>
        <option value="recreational">Recreational (1-3x/week casually)</option>
        <option value="intermediate">Intermediate (consistent 3-4x/week)</option>
        <option value="advanced">Advanced (5+ sessions/week, structured)</option>
      </select>
    </div>

    <div class="form-row">
      <label>Days per Week</label>
      <div class="day-picker" id="life-day-picker">
        <input type="checkbox" id="life-day-1" value="1" checked /><label for="life-day-1" class="day-chip">Mon</label>
        <input type="checkbox" id="life-day-2" value="2" /><label for="life-day-2" class="day-chip">Tue</label>
        <input type="checkbox" id="life-day-3" value="3" checked /><label for="life-day-3" class="day-chip">Wed</label>
        <input type="checkbox" id="life-day-4" value="4" /><label for="life-day-4" class="day-chip">Thu</label>
        <input type="checkbox" id="life-day-5" value="5" checked /><label for="life-day-5" class="day-chip">Fri</label>
        <input type="checkbox" id="life-day-6" value="6" /><label for="life-day-6" class="day-chip">Sat</label>
        <input type="checkbox" id="life-day-0" value="0" /><label for="life-day-0" class="day-chip">Sun</label>
      </div>
    </div>

    <div class="form-grid">
      <div class="form-row">
        <label for="life-start-date">Start Date</label>
        <input type="date" id="life-start-date" />
      </div>
      <div class="form-row">
        <label for="life-duration">Duration</label>
        <select id="life-duration">
          <option value="4">4 weeks</option>
          <option value="8" selected>8 weeks</option>
          <option value="12">12 weeks</option>
          <option value="indefinite">Ongoing</option>
        </select>
      </div>
    </div>

    <button class="btn-primary" onclick="generateLifePlan()">Generate Life Training Plan</button>
    <p id="life-plan-msg" class="save-msg"></p>
    <div id="life-plan-preview"></div>
  </div>
</section>
```

**The `generateLifePlan()` function** should work similarly to the existing race plan generation but without a race date. The AI prompt would be adjusted to create progressive training without a taper/peak phase — instead, ongoing progressive overload with deload weeks every 4th week.

---

## PHASE 3: Future Features (Specs for Later)

### Feature 8: IronZ AI Chatbot

**Implementation approach:**
- Floating chat button (bottom-right corner) on all screens
- Opens a slide-up chat panel
- Uses Claude API with system prompt containing full user context
- System prompt template:

```
You are IronZ, an AI fitness coach. Here is the user's context:

Profile: {name}, {age}yo, {weight}lbs, {height}in, {gender}
Goal: {primary_goal}
Level: {fitness_level}
Current Plan: {plan_summary}
Recent Workouts: {last_5_workouts}
Today's Schedule: {today_session}
Nutrition Today: {today_nutrition_summary}

Answer fitness questions with specific, personalized advice. Reference their actual data when relevant. Be encouraging but honest.
```

### Feature 9: AI Meal Feedback
- After saving a meal, automatically call Claude with the meal data + training context
- Display a brief feedback card below the logged meal

### Feature 10: Exercise Animations
- Source from a free exercise API or create simple SVG animations
- Show in workout detail view when user taps an exercise name

### Feature 11: Location-Based Zone Adjustment
- Add location/elevation field in Settings > Athlete Profile
- Apply altitude correction to pace zones (roughly +5% per 1000ft above sea level)

### Feature 12: Stretching & Mobility Recommendations
- After workout completion, suggest a 5-10 min stretch routine
- Based on muscle groups trained that day

---

## File Summary — New Files to Create

| File | Purpose |
|------|---------|
| `onboarding.js` | First-time user onboarding survey flow |
| `nutrition-v2.js` | Photo logging, smart dashboard, meal suggestions, grocery list |
| `custom-plan.js` | Create-your-own-plan weekly builder |
| `leveling.js` | Progress tracking, level system, achievements |
| `hydration.js` | Water tracking with visual bottle fill |
| `life-training.js` | Non-race endurance plan generation |
| `chatbot.js` | IronZ AI chatbot (Phase 3) |

**Script load order in index.html (add before auth.js):**
```html
<script src="onboarding.js"></script>
<script src="nutrition-v2.js"></script>
<script src="custom-plan.js"></script>
<script src="leveling.js"></script>
<script src="hydration.js"></script>
<script src="life-training.js"></script>
```

---

## Claude API Integration Pattern

All AI features should use this pattern for calling the Claude API:

```javascript
async function callClaude(systemPrompt, userMessage, options = {}) {
  const apiKey = localStorage.getItem('claude_api_key') || CONFIG.CLAUDE_API_KEY;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: options.model || 'claude-sonnet-4-20250514',
      max_tokens: options.maxTokens || 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  const data = await response.json();
  return data.content[0].text;
}

// For Vision (photo meal logging):
async function callClaudeVision(systemPrompt, imageBase64, textPrompt) {
  const apiKey = localStorage.getItem('claude_api_key') || CONFIG.CLAUDE_API_KEY;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: textPrompt }
        ]
      }]
    })
  });
  const data = await response.json();
  return data.content[0].text;
}
```

**Note:** The `anthropic-dangerous-direct-browser-access` header is needed for browser-side API calls. For production, you should proxy through a backend to protect the API key. For development/MVP, direct browser access is fine.

---

## Recommended Claude Code Prompt

When you open this in Claude Code, start with:

> "Read this implementation spec file (IRONZ_IMPLEMENTATION_SPEC.md) and my full codebase. Start implementing Phase 1 features in order: (1) Onboarding Survey, (2) Nutrition Overhaul, (3) Create Your Own Plan, (4) Profile Adaptability, (5) Hydration Tracking. Make changes to index.html and create new JS files as specified. Use the existing code patterns and styling conventions from the codebase."
