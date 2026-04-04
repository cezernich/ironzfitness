// nutrition-v2.js — Smart nutrition dashboard, AI photo logging, meal suggestions, grocery list
// Extends the existing nutrition.js (which handles saveMeal, loadMeals, history, food prefs)

/* =====================================================================
   NUTRITION TARGET CALCULATIONS
   Uses Mifflin-St Jeor formula + goal-based adjustments
   ===================================================================== */

function calculateNutritionTargets() {
  let profile;
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch { profile = {}; }

  const weight_lbs = parseFloat(profile.weight) || 160;
  const height_in = parseFloat(profile.height) || 70;
  const age = parseInt(profile.age) || 30;
  const gender = profile.gender || "";
  const goal = profile.goal || "general";

  // Convert to metric for Mifflin-St Jeor
  const weight_kg = weight_lbs * 0.453592;
  const height_cm = height_in * 2.54;

  // BMR
  let bmr;
  if (gender === "female") {
    bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;
  } else {
    bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5;
  }

  // Activity multiplier — default moderate, adjust based on today's workout
  let activityMultiplier = 1.55;
  const todayWorkout = getTodayScheduledWorkout();
  if (todayWorkout) {
    activityMultiplier = 1.725; // active day
  }

  let tdee = Math.round(bmr * activityMultiplier);

  // Goal adjustments
  const goalAdjustments = {
    strength: 300,   // bulk surplus
    endurance: 200,  // slight surplus for training
    speed: 100,      // slight surplus
    weight: -500,    // deficit
    general: 0,
  };
  tdee += (goalAdjustments[goal] || 0);

  // Macro splits by goal
  const macroSplits = {
    strength:  { protein: 0.30, carbs: 0.45, fat: 0.25 },
    endurance: { protein: 0.25, carbs: 0.50, fat: 0.25 },
    speed:     { protein: 0.28, carbs: 0.47, fat: 0.25 },
    weight:    { protein: 0.35, carbs: 0.35, fat: 0.30 },
    general:   { protein: 0.30, carbs: 0.40, fat: 0.30 },
  };
  const split = macroSplits[goal] || macroSplits.general;

  // Safety guardrails — minimum calorie floors
  const minCalories = gender === "female" ? 1200 : 1500;
  if (tdee < minCalories) tdee = minCalories;

  // Compute macros
  let protein = Math.round((tdee * split.protein) / 4);
  const carbs = Math.round((tdee * split.carbs) / 4);
  const fat = Math.round((tdee * split.fat) / 9);

  // Safety guardrail — minimum protein floor: 0.6g per lb bodyweight
  const minProtein = Math.round(weight_lbs * 0.6);
  if (protein < minProtein) protein = minProtein;

  return { calories: tdee, protein, carbs, fat };
}

function getTodayScheduledWorkout() {
  const today = getTodayString();
  try {
    const schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
    return schedule.find(w => w.date === today) || null;
  } catch { return null; }
}

/* =====================================================================
   SMART DASHBOARD — Calorie bar + Macro progress rings
   ===================================================================== */

function updateNutritionDashboard() {
  // Use the same target source as the home page day detail
  const today = getTodayString();
  const targets = (typeof getDailyNutritionTarget === "function")
    ? getDailyNutritionTarget(today)
    : calculateNutritionTargets();
  const meals = loadMeals();
  const todaysMeals = meals.filter(m => m.date === today);

  const eaten = todaysMeals.reduce((acc, m) => ({
    calories: acc.calories + (m.calories || 0),
    protein: acc.protein + (m.protein || 0),
    carbs: acc.carbs + (m.carbs || 0),
    fat: acc.fat + (m.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Calorie bar
  const calPct = Math.min(Math.round((eaten.calories / targets.calories) * 100), 100);
  const calFill = document.getElementById("nutri-progress-fill");
  const calEaten = document.getElementById("nutri-calories-eaten");
  const calTarget = document.getElementById("nutri-calories-target");
  if (calFill) calFill.style.width = calPct + "%";
  if (calEaten) calEaten.textContent = Math.round(eaten.calories).toLocaleString();
  if (calTarget) calTarget.textContent = targets.calories.toLocaleString();

  // Over-budget warning
  if (calFill && eaten.calories > targets.calories) {
    calFill.style.background = "var(--color-danger, #ef4444)";
  } else if (calFill) {
    calFill.style.background = "";
  }

  // Macro rings
  drawMacroRing("nutri-ring-protein", eaten.protein, targets.protein, getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#6366f1");
  drawMacroRing("nutri-ring-carbs", eaten.carbs, targets.carbs, "#22d3ee");
  drawMacroRing("nutri-ring-fat", eaten.fat, targets.fat, "#f59e0b");

  // Macro values
  const proteinVal = document.getElementById("nutri-protein-value");
  const carbsVal = document.getElementById("nutri-carbs-value");
  const fatVal = document.getElementById("nutri-fat-value");
  if (proteinVal) proteinVal.textContent = `${Math.round(eaten.protein)}/${targets.protein}g`;
  if (carbsVal) carbsVal.textContent = `${Math.round(eaten.carbs)}/${targets.carbs}g`;
  if (fatVal) fatVal.textContent = `${Math.round(eaten.fat)}/${targets.fat}g`;

  // Training context
  updateTrainingContext();
}

function drawMacroRing(canvasId, current, target, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Handle retina displays
  const dpr = window.devicePixelRatio || 1;
  const displaySize = 80;
  canvas.width = displaySize * dpr;
  canvas.height = displaySize * dpr;
  canvas.style.width = displaySize + "px";
  canvas.style.height = displaySize + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const center = displaySize / 2;
  const radius = center - 8;
  const lineWidth = 7;
  const pct = target > 0 ? Math.min(current / target, 1) : 0;

  ctx.clearRect(0, 0, displaySize, displaySize);

  // Background ring — use a visible gray regardless of theme
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-border").trim() || "#d1d5db";
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  // Progress ring
  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(center, center, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // Center percentage text
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-text").trim() || "#1a1a1a";
  ctx.font = `bold ${14}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(Math.round(pct * 100) + "%", center, center);
}

function updateTrainingContext() {
  const contextEl = document.getElementById("nutri-training-context");
  const textEl = document.getElementById("nutri-context-text");
  if (!contextEl || !textEl) return;

  const workout = getTodayScheduledWorkout();
  if (!workout) {
    contextEl.style.display = "none";
    return;
  }

  contextEl.style.display = "";
  const type = workout.type || workout.discipline || "workout";
  const title = workout.title || workout.name || type;
  textEl.textContent = `${title} scheduled today — prioritize protein and stay hydrated.`;
}

/* =====================================================================
   PHOTO MEAL LOGGING — Claude Vision
   ===================================================================== */

let photoMealVisible = false;

function openPhotoMealLog() {
  document.getElementById("photo-meal-modal").style.display = "";
  document.getElementById("section-nutrition-dashboard").style.display = "none";
  photoMealVisible = true;
  // Reset state
  document.getElementById("photo-preview-area").style.display = "none";
  document.getElementById("photo-ai-result").style.display = "none";
  document.getElementById("photo-ai-loading").style.display = "none";
  document.getElementById("photo-meal-msg").textContent = "";
}

function closePhotoMealLog() {
  document.getElementById("photo-meal-modal").style.display = "none";
  document.getElementById("section-nutrition-dashboard").style.display = "";
  photoMealVisible = false;
}

function openManualMealLog() {
  const modal = document.getElementById("manual-meal-modal");
  if (modal) modal.classList.add("is-open");
  // Focus the name field for quick entry
  setTimeout(() => document.getElementById("meal-name")?.focus(), 200);
}

function closeManualMealLog() {
  const modal = document.getElementById("manual-meal-modal");
  if (modal) modal.classList.remove("is-open");
}

function saveMealAndClose() {
  const nameBefore = document.getElementById("meal-name")?.value?.trim();
  saveMeal();
  // saveMeal clears the name field on success
  const nameAfter = document.getElementById("meal-name")?.value?.trim();
  if (nameBefore && !nameAfter) {
    setTimeout(closeManualMealLog, 800);
  }
}

function openQuickAddMeal() {
  // Show recent meals as quick-add buttons
  const meals = loadMeals();
  const recent = [];
  const seen = new Set();
  for (const m of meals) {
    const key = m.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      recent.push(m);
    }
    if (recent.length >= 10) break;
  }

  if (recent.length === 0) {
    openManualMealLog();
    return;
  }

  const modal = document.getElementById("quick-add-meal-modal");
  if (!modal) return;
  modal.classList.add("is-open");

  const list = document.getElementById("quick-add-meal-list");
  if (list) {
    list.innerHTML = recent.map((m, i) => `
      <button class="quick-add-meal-item" onclick="quickAddMealByIndex(${i})">
        <span class="quick-add-meal-name">${_nutEsc(m.name)}</span>
        <span class="quick-add-meal-macros">${Math.round(m.calories)} cal | P:${Math.round(m.protein)}g C:${Math.round(m.carbs)}g F:${Math.round(m.fat)}g</span>
      </button>
    `).join("");
    // Store reference for safe selection
    window._quickAddMeals = recent;
  }
}

function closeQuickAddMeal() {
  const modal = document.getElementById("quick-add-meal-modal");
  if (modal) modal.classList.remove("is-open");
}

function quickAddMealByIndex(index) {
  const m = window._quickAddMeals?.[index];
  if (!m) return;
  quickAddMealSelect(m.calories, m.protein, m.carbs, m.fat, m.name);
}

function quickAddMealSelect(cal, protein, carbs, fat, name) {
  const meal = {
    id: generateId("meal"),
    date: getTodayString(),
    name: name,
    calories: cal,
    protein: protein,
    carbs: carbs,
    fat: fat,
  };
  const meals = loadMeals();
  meals.unshift(meal);
  localStorage.setItem("meals", JSON.stringify(meals));

  closeQuickAddMeal();
  updateNutritionDashboard();
  renderNutritionHistory();
  renderTodaysSummary();

  if (typeof selectedDate !== "undefined" && selectedDate === meal.date && typeof renderDayDetail === "function") {
    renderDayDetail(meal.date);
  }
}

async function handleMealPhoto(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  // Show preview
  const previewArea = document.getElementById("photo-preview-area");
  const previewImg = document.getElementById("meal-photo-preview");
  const loadingEl = document.getElementById("photo-ai-loading");
  const resultEl = document.getElementById("photo-ai-result");

  previewArea.style.display = "";
  resultEl.style.display = "none";
  loadingEl.style.display = "";

  // Display image preview
  const reader = new FileReader();
  reader.onload = function (e) {
    previewImg.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // Convert to base64 for API
  const base64 = await fileToBase64(file);
  const mediaType = file.type || "image/jpeg";

  try {
    const apiKey = (typeof APP_CONFIG !== "undefined") ? APP_CONFIG.anthropicApiKey : "";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: "You are a nutrition analysis AI. Analyze the food in this image. Return ONLY valid JSON with no markdown formatting: { \"foods\": [{\"name\": \"item\", \"estimated_calories\": 0, \"protein_g\": 0, \"carbs_g\": 0, \"fat_g\": 0}], \"total\": {\"calories\": 0, \"protein_g\": 0, \"carbs_g\": 0, \"fat_g\": 0}, \"description\": \"brief description\" }",
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "Identify all food items in this image and estimate the nutritional content for each. Be as accurate as possible with portion sizes." }
          ]
        }]
      })
    });

    const data = await response.json();
    loadingEl.style.display = "none";

    if (data.error) {
      document.getElementById("photo-meal-msg").textContent = "AI error: " + (data.error.message || "Unknown error");
      document.getElementById("photo-meal-msg").style.color = "var(--color-danger)";
      return;
    }

    const text = data.content?.[0]?.text || "";
    // Extract JSON from response (handle possible markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      document.getElementById("photo-meal-msg").textContent = "Could not parse AI response.";
      document.getElementById("photo-meal-msg").style.color = "var(--color-danger)";
      return;
    }

    const result = JSON.parse(jsonMatch[0]);
    resultEl.style.display = "";

    // Populate detected foods
    const foodsEl = document.getElementById("photo-detected-foods");
    if (foodsEl && result.foods) {
      foodsEl.innerHTML = result.foods.map(f =>
        `<div class="photo-food-item">${escHtml(f.name)} <span class="photo-food-cals">${escHtml(f.estimated_calories)} cal</span></div>`
      ).join("");
    }

    // Populate macro fields
    document.getElementById("photo-calories").value = Math.round(result.total?.calories || 0);
    document.getElementById("photo-protein").value = Math.round(result.total?.protein_g || 0);
    document.getElementById("photo-carbs").value = Math.round(result.total?.carbs_g || 0);
    document.getElementById("photo-fat").value = Math.round(result.total?.fat_g || 0);

    // Store description for meal name
    document.getElementById("photo-meal-modal").dataset.description = result.description || "Photo-logged meal";

  } catch (err) {
    loadingEl.style.display = "none";
    document.getElementById("photo-meal-msg").textContent = "Error analyzing photo: " + err.message;
    document.getElementById("photo-meal-msg").style.color = "var(--color-danger)";
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // Remove data URL prefix to get raw base64
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function savePhotoMeal() {
  const calories = parseFloat(document.getElementById("photo-calories").value) || 0;
  const protein = parseFloat(document.getElementById("photo-protein").value) || 0;
  const carbs = parseFloat(document.getElementById("photo-carbs").value) || 0;
  const fat = parseFloat(document.getElementById("photo-fat").value) || 0;
  const description = document.getElementById("photo-meal-modal").dataset.description || "Photo-logged meal";

  const meal = {
    id: generateId("meal"),
    date: getTodayString(),
    name: description,
    calories, protein, carbs, fat,
    source: "photo",
  };

  const meals = loadMeals();
  meals.unshift(meal);
  localStorage.setItem("meals", JSON.stringify(meals));

  const msg = document.getElementById("photo-meal-msg");
  msg.style.color = "var(--color-success)";
  msg.textContent = "Meal logged!";
  setTimeout(() => { msg.textContent = ""; }, 3000);

  // Refresh views
  updateNutritionDashboard();
  renderNutritionHistory();
  renderTodaysSummary();

  if (typeof selectedDate !== "undefined" && selectedDate === meal.date && typeof renderDayDetail === "function") {
    renderDayDetail(meal.date);
  }

  setTimeout(closePhotoMealLog, 1500);
}

/* =====================================================================
   AI MEAL SUGGESTIONS
   ===================================================================== */

async function generateMealSuggestions() {
  const btn = document.querySelector("#section-meal-suggestions .btn-primary");
  const resultEl = document.getElementById("meal-suggestions-result");
  if (!btn || !resultEl) return;

  btn.disabled = true;
  btn.textContent = "Generating...";
  resultEl.style.display = "none";

  let profile;
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch { profile = {}; }
  const prefs = typeof loadPrefs === "function" ? loadPrefs() : { likes: [], dislikes: [] };
  const today = getTodayString();
  const targets = (typeof getDailyNutritionTarget === "function") ? getDailyNutritionTarget(today) : calculateNutritionTargets();

  // What they've eaten today
  const meals = loadMeals();
  const todaysMeals = meals.filter(m => m.date === today);
  const eaten = todaysMeals.reduce((acc, m) => ({
    calories: acc.calories + (m.calories || 0),
    protein: acc.protein + (m.protein || 0),
    carbs: acc.carbs + (m.carbs || 0),
    fat: acc.fat + (m.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const remaining = {
    calories: Math.max(0, targets.calories - eaten.calories),
    protein: Math.max(0, targets.protein - eaten.protein),
    carbs: Math.max(0, targets.carbs - eaten.carbs),
    fat: Math.max(0, targets.fat - eaten.fat),
  };

  // Dietary context
  let dietaryCtx = "";
  try {
    const obData = JSON.parse(localStorage.getItem("onboardingData") || "{}");
    if (obData.dietaryRestrictions?.length && !obData.dietaryRestrictions.includes("none")) {
      dietaryCtx = `Dietary restrictions: ${obData.dietaryRestrictions.join(", ")}. `;
    }
    if (obData.allergies) dietaryCtx += `Allergies: ${obData.allergies}. `;
  } catch {}

  const workout = getTodayScheduledWorkout();
  const workoutCtx = workout ? `Today's workout: ${workout.title || workout.type || "training session"}. ` : "Rest day. ";

  const prompt = `Generate 3 meal suggestions for the rest of today.

User: ${profile.age || 30}yo, ${profile.weight || 160}lbs, goal: ${profile.goal || "general fitness"}.
${workoutCtx}${dietaryCtx}
Foods they love: ${prefs.likes.join(", ") || "none specified"}.
Foods to avoid: ${prefs.dislikes.join(", ") || "none specified"}.
Already eaten today: ${todaysMeals.length ? todaysMeals.map(m => m.name).join(", ") : "nothing yet"}.
Remaining macros needed: ${remaining.calories} cal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat.

Return ONLY valid JSON array, no markdown:
[{"meal_type":"lunch","name":"Meal Name","ingredients":["item1","item2"],"calories":0,"protein":0,"carbs":0,"fat":0,"prep_time":"15 min"}]`;

  try {
    const apiKey = (typeof APP_CONFIG !== "undefined") ? APP_CONFIG.anthropicApiKey : "";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) throw new Error("Could not parse response");

    const suggestions = JSON.parse(jsonMatch[0]);
    resultEl.style.display = "";
    window._mealSuggestions = suggestions;
    resultEl.innerHTML = suggestions.map((s, i) => `
      <div class="meal-suggestion-card">
        <div class="meal-suggestion-header">
          <span class="meal-suggestion-type">${_nutEsc(s.meal_type)}</span>
          <span class="meal-suggestion-time">${_nutEsc(s.prep_time || "")}</span>
        </div>
        <div class="meal-suggestion-name">${_nutEsc(s.name)}</div>
        <div class="meal-suggestion-ingredients">${_nutEsc(s.ingredients?.join(", ") || "")}</div>
        <div class="meal-suggestion-macros">
          ${s.calories} cal | P:${s.protein}g C:${s.carbs}g F:${s.fat}g
        </div>
        <button class="btn-secondary btn-sm" onclick="logSuggestedMealByIndex(${i})">
          + Log This Meal
        </button>
      </div>
    `).join("");

  } catch (err) {
    resultEl.style.display = "";
    resultEl.innerHTML = `<p class="empty-msg">Error generating suggestions: ${err.message}</p>`;
  }

  btn.disabled = false;
  btn.textContent = "Generate Today's Meal Ideas";
}

function logSuggestedMealByIndex(index) {
  const s = window._mealSuggestions?.[index];
  if (!s) return;
  logSuggestedMeal(s.name, s.calories, s.protein, s.carbs, s.fat);
}

function logSuggestedMeal(name, cal, protein, carbs, fat) {
  const meal = {
    id: generateId("meal"),
    date: getTodayString(),
    name, calories: cal, protein, carbs, fat,
    source: "suggestion",
  };
  const meals = loadMeals();
  meals.unshift(meal);
  localStorage.setItem("meals", JSON.stringify(meals));

  updateNutritionDashboard();
  renderNutritionHistory();
  renderTodaysSummary();

  if (typeof selectedDate !== "undefined" && selectedDate === meal.date && typeof renderDayDetail === "function") {
    renderDayDetail(meal.date);
  }
}

/* =====================================================================
   GROCERY LIST GENERATION
   ===================================================================== */

async function generateGroceryList() {
  const btn = document.querySelector("#section-grocery-list .btn-primary");
  const contentEl = document.getElementById("grocery-list-content");
  if (!btn || !contentEl) return;

  btn.disabled = true;
  btn.textContent = "Generating...";

  let profile;
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch { profile = {}; }
  const prefs = typeof loadPrefs === "function" ? loadPrefs() : { likes: [], dislikes: [] };
  const targets = (typeof getDailyNutritionTarget === "function") ? getDailyNutritionTarget(getTodayString()) : calculateNutritionTargets();

  let dietaryCtx = "";
  try {
    const obData = JSON.parse(localStorage.getItem("onboardingData") || "{}");
    if (obData.dietaryRestrictions?.length && !obData.dietaryRestrictions.includes("none")) {
      dietaryCtx = `Dietary restrictions: ${obData.dietaryRestrictions.join(", ")}. `;
    }
    if (obData.allergies) dietaryCtx += `Allergies: ${obData.allergies}. `;
  } catch {}

  const prompt = `Generate a weekly grocery list for one person.

Profile: ${profile.age || 30}yo, ${profile.weight || 160}lbs, goal: ${profile.goal || "general fitness"}.
Daily targets: ${targets.calories} cal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat.
${dietaryCtx}
Foods they love: ${prefs.likes.join(", ") || "none specified"}.
Foods to avoid: ${prefs.dislikes.join(", ") || "none specified"}.

Return ONLY valid JSON, no markdown:
{"categories":[{"name":"Produce","items":["item1","item2"]},{"name":"Protein","items":["item1"]},{"name":"Dairy","items":[]},{"name":"Grains","items":[]},{"name":"Other","items":[]}]}`;

  try {
    const apiKey = (typeof APP_CONFIG !== "undefined") ? APP_CONFIG.anthropicApiKey : "";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) throw new Error("Could not parse response");

    const result = JSON.parse(jsonMatch[0]);
    contentEl.innerHTML = result.categories.map(cat => `
      <div class="grocery-category">
        <div class="grocery-category-name">${escHtml(cat.name)}</div>
        <div class="grocery-items">
          ${cat.items.map(item => `
            <label class="grocery-item">
              <input type="checkbox" />
              <span>${escHtml(item)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `).join("");

  } catch (err) {
    contentEl.innerHTML = `<p class="empty-msg">Error generating list: ${err.message}</p>`;
  }

  btn.disabled = false;
  btn.textContent = "Generate Grocery List";
}

/* =====================================================================
   HOOK INTO EXISTING MEAL SAVE
   Override saveMeal to also refresh the dashboard
   ===================================================================== */

const _originalSaveMeal = typeof saveMeal === "function" ? saveMeal : null;

if (_originalSaveMeal) {
  window._baseSaveMeal = _originalSaveMeal;

  window.saveMeal = function () {
    _originalSaveMeal();
    // Refresh dashboard after meal save
    setTimeout(updateNutritionDashboard, 100);
  };
}

/* =====================================================================
   INIT — called when nutrition tab is shown
   ===================================================================== */

function initNutritionDashboard() {
  // Reset photo modal state on tab re-entry
  if (photoMealVisible) closePhotoMealLog();
  updateNutritionDashboard();
}

function _nutEsc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
