/*
  nutrition.js — Everything related to the Nutrition / Meal Logging feature.

  This file handles:
    1. SAVING MEALS     — takes the form data and stores it in localStorage
    2. TODAY'S SUMMARY  — calculates total calories + macros for the current day
    3. MEAL HISTORY     — displays all logged meals, grouped by date
*/


/* =====================================================================
   SECTION 1: SAVING MEALS
   ===================================================================== */

/**
 * saveMeal() is called when the user clicks "Log Meal".
 * It reads the form inputs, validates them, and saves to localStorage.
 */
function saveMeal() {
  // Read values from the form in index.html
  const date     = document.getElementById("meal-date").value;
  const name     = document.getElementById("meal-name").value.trim();
  const calories = parseFloat(document.getElementById("meal-calories").value) || 0;
  const protein  = parseFloat(document.getElementById("meal-protein").value) || 0;
  const carbs    = parseFloat(document.getElementById("meal-carbs").value) || 0;
  const fat      = parseFloat(document.getElementById("meal-fat").value) || 0;
  const msg      = document.getElementById("meal-save-msg");

  // Validate required fields
  if (!date) {
    msg.style.color = "#ef4444";
    msg.textContent = "Please select a date.";
    return;
  }
  if (!name) {
    msg.style.color = "#ef4444";
    msg.textContent = "Please enter a food or meal name.";
    return;
  }

  // Build the meal entry object
  const meal = {
    id:       generateId("meal"),
    date,
    name,
    calories,
    protein,
    carbs,
    fat,
  };

  // Load existing meals, add the new one, and save back to localStorage
  const meals = loadMeals();
  meals.unshift(meal);  // add to the front (newest first)
  localStorage.setItem("meals", JSON.stringify(meals));

  // Show success feedback
  msg.style.color = "#22c55e";
  msg.textContent = "Meal logged!";
  setTimeout(() => { msg.textContent = ""; }, 3000);

  // Clear the form fields (except the date — often logging multiple meals on same day)
  document.getElementById("meal-name").value = "";
  document.getElementById("meal-calories").value = "";
  document.getElementById("meal-protein").value = "";
  document.getElementById("meal-carbs").value = "";
  document.getElementById("meal-fat").value = "";

  // Re-render the summary and history
  renderTodaysSummary();
  renderNutritionHistory();

  // Refresh the home screen day detail panel if this meal's date is currently selected
  if (typeof selectedDate !== "undefined" && selectedDate === date && typeof renderDayDetail === "function") {
    renderDayDetail(date);
  }
}

/** Loads the saved meals array from localStorage */
function loadMeals() {
  try { return JSON.parse(localStorage.getItem("meals") || "[]"); } catch { return []; }
}

/** Deletes a single meal by its ID */
function deleteMeal(id) {
  if (!confirm("Delete this meal entry?")) return;

  let meals = loadMeals();
  meals = meals.filter(m => m.id !== id);
  localStorage.setItem("meals", JSON.stringify(meals));

  renderTodaysSummary();
  renderNutritionHistory();
}

/** Clears ALL saved meals */
function clearNutrition() {
  if (!confirm("Delete all meal history? This cannot be undone.")) return;
  localStorage.removeItem("meals");
  renderTodaysSummary();
  renderNutritionHistory();
}


/* =====================================================================
   SECTION 2: TODAY'S SUMMARY
   Calculates and displays the total calories + macros for today.
   ===================================================================== */

function renderTodaysSummary() {
  const container = document.getElementById("todays-summary");

  // Get today's date in YYYY-MM-DD format (what our date inputs use)
  const today = getTodayString();

  const meals = loadMeals();
  // Filter meals to only those logged for today
  const todaysMeals = meals.filter(m => m.date === today);

  if (todaysMeals.length === 0) {
    container.innerHTML = `<p class="empty-msg">No meals logged today yet.</p>`;
    return;
  }

  // Sum up each macro across all of today's meals
  const totals = todaysMeals.reduce((acc, m) => ({
    calories: acc.calories + m.calories,
    protein:  acc.protein  + m.protein,
    carbs:    acc.carbs    + m.carbs,
    fat:      acc.fat      + m.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Render the 4-box macro summary
  container.innerHTML = `
    <p style="font-size:0.85rem; color:#64748b; margin-bottom:8px;">
      ${todaysMeals.length} meal${todaysMeals.length !== 1 ? "s" : ""} logged today
    </p>
    <div class="macro-summary">
      <div class="macro-box">
        <div class="macro-value">${Math.round(totals.calories)}</div>
        <div class="macro-label">Calories</div>
      </div>
      <div class="macro-box">
        <div class="macro-value">${Math.round(totals.protein)}g</div>
        <div class="macro-label">Protein</div>
      </div>
      <div class="macro-box">
        <div class="macro-value">${Math.round(totals.carbs)}g</div>
        <div class="macro-label">Carbs</div>
      </div>
      <div class="macro-box">
        <div class="macro-value">${Math.round(totals.fat)}g</div>
        <div class="macro-label">Fat</div>
      </div>
    </div>
  `;
}


/* =====================================================================
   SECTION 3: MEAL HISTORY
   Displays all logged meals, grouped by date (most recent first).
   ===================================================================== */

function renderNutritionHistory() {
  const container = document.getElementById("nutrition-history");
  const meals     = loadMeals();

  if (meals.length === 0) {
    container.innerHTML = `<p class="empty-msg">No meals logged yet. Add your first one above!</p>`;
    return;
  }

  // Group meals by date using a "dictionary" (JavaScript object)
  // Result looks like: { "2025-06-15": [meal1, meal2], "2025-06-14": [meal3], ... }
  const grouped = {};
  meals.forEach(m => {
    if (!grouped[m.date]) grouped[m.date] = [];
    grouped[m.date].push(m);
  });

  // Sort dates newest → oldest
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // Build HTML: one group block per day
  container.innerHTML = sortedDates.map(date => {
    const dayMeals = grouped[date];

    // Calculate daily totals for this day's header
    const dayTotals = dayMeals.reduce((acc, m) => ({
      calories: acc.calories + m.calories,
      protein:  acc.protein  + m.protein,
      carbs:    acc.carbs    + m.carbs,
      fat:      acc.fat      + m.fat,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    // Build individual meal rows for this day
    const mealRows = dayMeals.map(m => `
      <div class="meal-entry">
        <span class="meal-name">${escHtml(m.name)}</span>
        <div class="meal-macros">
          <span>${Math.round(m.calories)} kcal</span>
          <span>P: ${Math.round(m.protein)}g</span>
          <span>C: ${Math.round(m.carbs)}g</span>
          <span>F: ${Math.round(m.fat)}g</span>
        </div>
        <button class="delete-btn" title="Delete" onclick="deleteMeal(${m.id})">🗑</button>
      </div>
    `).join("");

    return `
      <div class="meal-day-group">
        <div class="meal-day-header">
          <span>${formatDate(date)}</span>
          <span class="day-totals">
            ${Math.round(dayTotals.calories)} kcal &nbsp;|&nbsp;
            P ${Math.round(dayTotals.protein)}g &nbsp;
            C ${Math.round(dayTotals.carbs)}g &nbsp;
            F ${Math.round(dayTotals.fat)}g
          </span>
        </div>
        ${mealRows}
      </div>`;
  }).join("");
}


/* =====================================================================
   SECTION 4: FOOD PREFERENCES
   Manages liked / disliked ingredients that guide meal auto-generation.
   ===================================================================== */

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem("foodPreferences")) || { likes: [], dislikes: [] };
  } catch {
    return { likes: [], dislikes: [] };
  }
}

function savePrefs(prefs) {
  localStorage.setItem("foodPreferences", JSON.stringify(prefs));
}

/**
 * addPreference(type)
 * Reads the input for 'like' or 'dislike', trims and normalises the value,
 * then persists and re-renders the chip list.
 */
function addPreference(type) {
  const inputId = type === "like" ? "like-input" : "dislike-input";
  const input = document.getElementById(inputId);
  if (!input) return;

  const raw = input.value.trim();
  if (!raw) return;

  // Allow comma-separated entries in one go ("chicken, rice, eggs")
  const terms = raw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  if (terms.length === 0) return;

  const prefs = loadPrefs();
  const list = prefs[type === "like" ? "likes" : "dislikes"];
  const other = prefs[type === "like" ? "dislikes" : "likes"];

  terms.forEach(term => {
    // Don't add duplicates or cross-list conflicts
    if (!list.includes(term) && !other.includes(term)) {
      list.push(term);
    }
  });

  savePrefs(prefs);
  input.value = "";
  renderFoodPreferences();
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderMealPlan === "function") renderMealPlan(selectedDate);
}

/**
 * removePreference(type, term)
 * Removes a single food term from likes or dislikes.
 */
function removePreference(type, term) {
  const prefs = loadPrefs();
  const key = type === "like" ? "likes" : "dislikes";
  prefs[key] = prefs[key].filter(t => t !== term);
  savePrefs(prefs);
  renderFoodPreferences();
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderMealPlan === "function") renderMealPlan(selectedDate);
}

/**
 * renderFoodPreferences()
 * Rebuilds both chip lists from localStorage.
 */
function renderFoodPreferences() {
  const prefs = loadPrefs();

  const likesEl    = document.getElementById("likes-chips");
  const dislikesEl = document.getElementById("dislikes-chips");
  if (!likesEl || !dislikesEl) return;

  likesEl.innerHTML = prefs.likes.length === 0
    ? `<span class="pref-empty">None added yet</span>`
    : prefs.likes.map(t => chipHTML("like", t)).join("");

  dislikesEl.innerHTML = prefs.dislikes.length === 0
    ? `<span class="pref-empty">None added yet</span>`
    : prefs.dislikes.map(t => chipHTML("dislike", t)).join("");
}

function chipHTML(type, term) {
  return `<span class="pref-chip pref-chip--${type}">
    ${term}
    <button class="pref-chip-remove" onclick="removePreference('${type}', '${term}')" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
  </span>`;
}


/* =====================================================================
   UTILITIES
   ===================================================================== */

/**
 * Returns today's date as a string in YYYY-MM-DD format.
 * This matches the format used by <input type="date"> in HTML.
 */
function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");  // months are 0-indexed
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
