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
  localStorage.setItem("meals", JSON.stringify(meals)); if (typeof DB !== 'undefined') DB.syncKey('meals');

  if (typeof trackEvent === "function") trackEvent("meal_logged", { source: "manual", calories, protein, carbs, fat });

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
  if (typeof updateNutritionDashboard === "function") updateNutritionDashboard();
  if (typeof renderNutritionProgressBars === "function") renderNutritionProgressBars(date);

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
  localStorage.setItem("meals", JSON.stringify(meals)); if (typeof DB !== 'undefined') DB.syncKey('meals');

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

// Meal History filter state. Range defaults to 7 days (today + 6 previous)
// because even a week of logs is a long scroll; 30 days / All are opt-in.
// Search is a substring match against meal name, case-insensitive.
let _mealHistoryRange = "7d";      // "1d" | "7d" | "30d" | "all"
let _mealHistoryQuery = "";
let _mealHistoryQueryTimer = null;

function setMealHistoryRange(range) {
  _mealHistoryRange = range;
  document.querySelectorAll(".meal-history-range-row .saved-filter-chip").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.range === range);
  });
  renderNutritionHistory();
}

function setMealHistoryQuery(q) {
  // Debounce to avoid re-rendering on every keystroke.
  _mealHistoryQuery = String(q || "");
  clearTimeout(_mealHistoryQueryTimer);
  _mealHistoryQueryTimer = setTimeout(renderNutritionHistory, 120);
}

function _mealHistoryRangeStart(range) {
  if (range === "all") return null;
  const days = range === "1d" ? 0 : range === "30d" ? 29 : 6;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function renderNutritionHistory() {
  const container = document.getElementById("nutrition-history");
  const meals     = loadMeals();

  if (meals.length === 0) {
    container.innerHTML = `<p class="empty-msg">No meals logged yet. Add your first one above!</p>`;
    return;
  }

  // Apply filters: date range first, then name search.
  const minDate = _mealHistoryRangeStart(_mealHistoryRange);
  const needle  = _mealHistoryQuery.trim().toLowerCase();
  const filtered = meals.filter(m => {
    if (minDate && m.date < minDate) return false;
    if (needle && !String(m.name || "").toLowerCase().includes(needle)) return false;
    return true;
  });

  if (filtered.length === 0) {
    const rangeLabel = { "1d": "today", "7d": "the last 7 days", "30d": "the last 30 days", "all": "your history" }[_mealHistoryRange] || "this range";
    const msg = needle
      ? `No meals matching "${escHtml(needle)}" in ${rangeLabel}.`
      : `No meals logged in ${rangeLabel}.`;
    container.innerHTML = `<p class="meal-history-empty-filtered">${msg}</p>`;
    return;
  }

  // Group meals by date using a "dictionary" (JavaScript object)
  // Result looks like: { "2025-06-15": [meal1, meal2], "2025-06-14": [meal3], ... }
  const grouped = {};
  filtered.forEach(m => {
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
  localStorage.setItem("foodPreferences", JSON.stringify(prefs)); if (typeof DB !== 'undefined') DB.syncKey('foodPreferences');
}

/**
 * addPreference(type)
 * Reads the input for 'like' or 'dislike', trims and normalises the value,
 * then persists and re-renders the chip list.
 */
/** Normalizes a dislike entry to { name, isAllergy } object. Handles legacy plain strings. */
function _normalizeDislike(item) {
  if (typeof item === "string") return { name: item, isAllergy: false };
  return { name: item.name || "", isAllergy: !!item.isAllergy };
}
/** Gets the display name from a dislike entry (string or object) */
function _dislikeName(item) {
  return typeof item === "string" ? item : (item.name || "");
}

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
  const isAllergy = type === "dislike" && document.getElementById("is-allergy")?.checked;

  if (type === "like") {
    const dislikeNames = prefs.dislikes.map(d => _dislikeName(d));
    terms.forEach(term => {
      if (!prefs.likes.includes(term) && !dislikeNames.includes(term)) {
        prefs.likes.push(term);
      }
    });
  } else {
    const dislikeNames = prefs.dislikes.map(d => _dislikeName(d));
    terms.forEach(term => {
      if (!dislikeNames.includes(term) && !prefs.likes.includes(term)) {
        prefs.dislikes.push({ name: term, isAllergy: !!isAllergy });
      }
    });
  }

  savePrefs(prefs);
  input.value = "";
  if (document.getElementById("is-allergy")) document.getElementById("is-allergy").checked = false;
  renderFoodPreferences();
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderMealPlan === "function") renderMealPlan(selectedDate);
}

/**
 * removePreference(type, term)
 * Removes a single food term from likes or dislikes.
 */
function removePreference(type, term) {
  const prefs = loadPrefs();
  if (type === "like") {
    prefs.likes = prefs.likes.filter(t => t !== term);
  } else {
    prefs.dislikes = prefs.dislikes.filter(d => _dislikeName(d) !== term);
  }
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
    : prefs.dislikes.map(d => {
        const item = _normalizeDislike(d);
        return chipHTML("dislike", item.name, item.isAllergy);
      }).join("");

  // Allergy data is tracked in food preferences but no longer shown as a top-level banner
}

function chipHTML(type, term, isAllergy) {
  const allergyBadge = isAllergy ? `<span class="allergy-badge">ALLERGY</span>` : "";
  const chipClass = isAllergy ? "pref-chip pref-chip--allergy" : `pref-chip pref-chip--${type}`;
  return `<span class="${chipClass}">
    ${term}${allergyBadge}
    <button class="pref-chip-remove" onclick="removePreference('${type}', '${term}')" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
  </span>`;
}

/** Helper to get structured allergy/avoid data for use by other modules */
function getAllergyData() {
  const prefs = loadPrefs();
  const items = prefs.dislikes.map(d => _normalizeDislike(d));
  return {
    allergies: items.filter(d => d.isAllergy).map(d => d.name),
    avoids: items.filter(d => !d.isAllergy).map(d => d.name),
    allNames: items.map(d => d.name),
  };
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
