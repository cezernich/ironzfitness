// meals-data.js — Meal library and day-meal generation algorithm

const MEAL_LIBRARY = {
  breakfast: [
    { name: "Oatmeal with Banana & Honey",          calories: 420, protein: 12, carbs: 78, fat: 8,  tags: ["high-carb"],                     categories: [] },
    { name: "Avocado Egg Toast",                    calories: 480, protein: 22, carbs: 38, fat: 26, tags: ["high-protein"],                   categories: ["eggs", "gluten"] },
    { name: "Greek Yogurt Parfait with Granola",    calories: 380, protein: 20, carbs: 52, fat: 9,  tags: ["high-carb"],                     categories: ["dairy", "gluten"] },
    { name: "Banana Protein Pancakes",              calories: 520, protein: 28, carbs: 68, fat: 14, tags: ["high-carb", "high-protein"],      categories: ["eggs", "dairy", "gluten"] },
    { name: "Smoothie Bowl (Acai, Banana, Berries)",calories: 460, protein: 16, carbs: 72, fat: 12, tags: ["high-carb"],                     categories: ["dairy"] },
    { name: "Bagel with Peanut Butter & Banana",   calories: 550, protein: 18, carbs: 82, fat: 16, tags: ["high-carb"],                     categories: ["gluten", "nuts", "peanuts"] },
    { name: "Scrambled Eggs with Rice & Salsa",     calories: 490, protein: 30, carbs: 52, fat: 14, tags: ["high-protein"],                  categories: ["eggs"] },
  ],
  lunch: [
    { name: "Chicken Rice Bowl with Veggies",               calories: 620, protein: 48, carbs: 72, fat: 12, tags: ["high-protein"],              categories: ["chicken", "poultry"] },
    { name: "Turkey & Avocado Sandwich",                    calories: 540, protein: 38, carbs: 52, fat: 18, tags: ["high-protein"],              categories: ["turkey", "poultry", "gluten"] },
    { name: "Tuna Pasta Salad",                             calories: 580, protein: 40, carbs: 62, fat: 14, tags: ["high-protein"],              categories: ["fish", "seafood", "tuna", "gluten"] },
    { name: "Quinoa Chickpea Power Bowl",                   calories: 520, protein: 24, carbs: 76, fat: 14, tags: ["high-carb"],                 categories: [] },
    { name: "Salmon Sweet Potato Bowl",                     calories: 640, protein: 42, carbs: 58, fat: 20, tags: ["high-protein"],              categories: ["fish", "seafood", "salmon"] },
    { name: "Burrito Bowl (Chicken, Black Beans, Rice)",    calories: 680, protein: 44, carbs: 80, fat: 16, tags: ["high-carb", "high-protein"], categories: ["chicken", "poultry"] },
    { name: "Lentil Soup with Crusty Bread",                calories: 480, protein: 22, carbs: 72, fat: 10, tags: ["high-carb"],                 categories: ["gluten"] },
  ],
  dinner: [
    { name: "Baked Salmon with Quinoa & Greens",    calories: 680, protein: 50, carbs: 52, fat: 22, tags: ["high-protein"],              categories: ["fish", "seafood", "salmon"] },
    { name: "Chicken Stir-Fry with Brown Rice",     calories: 620, protein: 48, carbs: 68, fat: 14, tags: ["high-protein", "high-carb"], categories: ["chicken", "poultry"] },
    { name: "Turkey Bolognese with Pasta",          calories: 720, protein: 52, carbs: 78, fat: 18, tags: ["high-protein", "high-carb"], categories: ["turkey", "poultry", "gluten"] },
    { name: "Beef & Vegetable Stew with Potatoes", calories: 660, protein: 46, carbs: 60, fat: 20, tags: ["high-protein"],              categories: ["beef", "red meat"] },
    { name: "Baked Cod with Roasted Vegetables",   calories: 520, protein: 44, carbs: 38, fat: 16, tags: ["high-protein"],              categories: ["fish", "seafood", "cod"] },
    { name: "Sirloin Steak with Veg & Rice",        calories: 740, protein: 56, carbs: 58, fat: 26, tags: ["high-protein"],              categories: ["beef", "red meat", "steak"] },
    { name: "Shrimp Pasta in Garlic Tomato Sauce",  calories: 640, protein: 40, carbs: 82, fat: 16, tags: ["high-carb"],                 categories: ["shellfish", "seafood", "shrimp", "gluten"] },
  ],
  snack: [
    { name: "Banana with Peanut Butter",   calories: 280, protein: 8,  carbs: 38, fat: 12, tags: ["high-carb"],    categories: ["nuts", "peanuts"] },
    { name: "Apple with Almond Butter",    calories: 240, protein: 6,  carbs: 32, fat: 10, tags: ["high-carb"],    categories: ["nuts", "almonds"] },
    { name: "Greek Yogurt (Plain)",        calories: 180, protein: 18, carbs: 12, fat: 4,  tags: ["high-protein"], categories: ["dairy"] },
    { name: "Trail Mix (Nuts & Dried Fruit)", calories: 300, protein: 8, carbs: 34, fat: 16, tags: ["high-carb"],  categories: ["nuts"] },
    { name: "Rice Cakes with Hummus",      calories: 220, protein: 6,  carbs: 36, fat: 6,  tags: ["high-carb"],    categories: [] },
    { name: "Chocolate Milk (Recovery)",   calories: 260, protein: 14, carbs: 36, fat: 6,  tags: ["high-carb"],    categories: ["dairy"] },
    { name: "Protein Bar",                 calories: 250, protein: 20, carbs: 28, fat: 7,  tags: ["high-protein"], categories: ["gluten", "nuts", "dairy"] },
    { name: "Hard-Boiled Eggs (2)",        calories: 160, protein: 14, carbs: 2,  fat: 10, tags: ["high-protein"], categories: ["eggs"] },
  ],
};

/** Load saved food preferences from localStorage */
function loadFoodPreferences() {
  try {
    return JSON.parse(localStorage.getItem("foodPreferences")) || { likes: [], dislikes: [] };
  } catch {
    return { likes: [], dislikes: [] };
  }
}

/** Load dietary restrictions from onboarding data */
function loadDietaryRestrictions() {
  try {
    const ob = JSON.parse(localStorage.getItem("onboardingData")) || {};
    return ob.dietaryRestrictions || [];
  } catch { return []; }
}

/** Maps dietary restriction labels to meal categories that should be excluded */
const DIETARY_CATEGORY_MAP = {
  vegetarian:   ["chicken", "poultry", "turkey", "beef", "red meat", "steak", "fish", "seafood", "salmon", "tuna", "cod", "shrimp", "shellfish"],
  vegan:        ["chicken", "poultry", "turkey", "beef", "red meat", "steak", "fish", "seafood", "salmon", "tuna", "cod", "shrimp", "shellfish", "eggs", "dairy"],
  "gluten-free":["gluten"],
  "dairy-free": ["dairy"],
  keto:         [], // handled via tag preference, not exclusion
  paleo:        ["gluten", "dairy"],
};

/** Returns meal names saved in the last N days to avoid repetition */
function getRecentMealNames(dateStr, lookbackDays) {
  try {
    const meals = JSON.parse(localStorage.getItem("meals")) || [];
    const d = new Date(dateStr + "T12:00:00");
    const cutoff = new Date(d);
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    // Collect meal names from recent days (not including today)
    return meals
      .filter(m => m.date >= cutoffStr && m.date < dateStr)
      .map(m => {
        // Strip slot prefix if present (e.g. "Breakfast: Oatmeal..." → "Oatmeal...")
        const name = m.name || "";
        const colonIdx = name.indexOf(": ");
        return colonIdx > -1 ? name.slice(colonIdx + 2) : name;
      });
  } catch { return []; }
}

/**
 * Returns true if any term in `terms` matches the meal name or its categories.
 * Accepts either a meal object or a plain name string.
 */
function mealContainsTerm(meal, terms) {
  const name = typeof meal === "string" ? meal : meal.name;
  const categories = (typeof meal === "object" && meal.categories) ? meal.categories : [];
  const lowerName = name.toLowerCase();
  return terms.some(t => {
    if (!t) return false;
    const term = t.toLowerCase().trim();
    if (lowerName.includes(term)) return true;
    return categories.some(c => c.toLowerCase() === term || c.toLowerCase().includes(term));
  });
}

/**
 * _dateSeed(dateStr) — hash a YYYY-MM-DD into a stable non-negative int.
 * Used as rotation offset so day-to-day meal picks vary even when no meals
 * have been logged yet (which keeps recentNames empty and otherwise collapses
 * every day to the same top-ranked pick).
 */
function _dateSeed(dateStr) {
  if (!dateStr) return 0;
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * pickMeal(options, targetCalories, macroPrefs, exclude, recentNames, preferLowFat, dateSeed)
 * Selects the best-fit meal from a category given a calorie target.
 *
 * Selection logic (in order):
 * 1. Exclude same-day duplicates
 * 2. Filter out dietary restriction violations (vegan, gluten-free, etc.)
 * 3. Filter out disliked foods from preferences
 * 4. Penalize meals eaten in the last 3 days (cross-day variety)
 * 5. Prefer meals matching macro needs (high-protein, high-carb, low-fat)
 * 6. Boost liked foods — but rotate among them, don't always pick the same one
 * 7. Final tiebreak by calorie proximity to slot target
 * 8. Rotate among the top candidates using (dateSeed + slot index) so the
 *    same day is reproducible but different days surface different meals.
 */
function pickMeal(options, targetCalories, preferHighCarb, preferHighProtein, exclude = [], recentNames = [], preferLowFat = false, dateSeed = 0) {
  const prefs = loadFoodPreferences();
  const dietary = loadDietaryRestrictions();

  // 1. Exclude same-day duplicates
  let pool = options.filter(m => !exclude.includes(m.name));
  if (pool.length === 0) pool = [...options];

  // 2. Filter out dietary restriction violations
  if (dietary.length > 0 && !dietary.includes("none")) {
    const excludedCats = [];
    dietary.forEach(r => {
      const cats = DIETARY_CATEGORY_MAP[r];
      if (cats) excludedCats.push(...cats);
    });
    if (excludedCats.length > 0) {
      const filtered = pool.filter(m =>
        !(m.categories || []).some(c => excludedCats.includes(c.toLowerCase()))
      );
      if (filtered.length > 0) pool = filtered;
    }
  }

  // 3. Filter out allergens (hard filter — never include) and disliked foods (soft filter)
  const allergyData = typeof getAllergyData === "function" ? getAllergyData() : null;
  if (allergyData && allergyData.allergies.length > 0) {
    // Hard filter: allergens are NEVER included, even if it empties the pool
    pool = pool.filter(m => !mealContainsTerm(m, allergyData.allergies));
  }
  if (allergyData && allergyData.avoids.length > 0) {
    const filtered = pool.filter(m => !mealContainsTerm(m, allergyData.avoids));
    if (filtered.length > 0) pool = filtered;
  } else if (prefs.dislikes.length > 0 && !allergyData) {
    // Legacy fallback: normalize dislikes to plain strings
    const dislikeNames = prefs.dislikes.map(d => typeof d === "string" ? d : (d.name || "")).filter(Boolean);
    const filtered = pool.filter(m => !mealContainsTerm(m, dislikeNames));
    if (filtered.length > 0) pool = filtered;
  }

  // 4. Narrow by macro preference — filter to matching tags when possible
  if (preferHighProtein && preferHighCarb) {
    const both = pool.filter(m => m.tags.includes("high-protein") && m.tags.includes("high-carb"));
    if (both.length > 0) pool = both;
    else {
      const either = pool.filter(m => m.tags.includes("high-protein") || m.tags.includes("high-carb"));
      if (either.length > 0) pool = either;
    }
  } else if (preferHighProtein) {
    const proteinFocused = pool.filter(m => m.tags.includes("high-protein"));
    if (proteinFocused.length > 0) pool = proteinFocused;
  } else if (preferHighCarb) {
    const carbFocused = pool.filter(m => m.tags.includes("high-carb"));
    if (carbFocused.length > 0) pool = carbFocused;
  }
  // Low-fat preference: deprioritize high-fat meals
  if (preferLowFat) {
    const lowFat = pool.filter(m => m.fat <= m.calories * 0.25 / 9);
    if (lowFat.length > 0) pool = lowFat;
  }

  // 5. Score and sort
  // Count how many times each meal appeared recently — more appearances = higher penalty
  const recentCounts = {};
  recentNames.forEach(n => { recentCounts[n] = (recentCounts[n] || 0) + 1; });

  pool = [...pool].sort((a, b) => {
    // Penalize recently eaten meals (0 = not recent, 1-3 = recent frequency)
    const aRecent = recentCounts[a.name] || 0;
    const bRecent = recentCounts[b.name] || 0;
    if (aRecent !== bRecent) return aRecent - bRecent;

    // Boost liked foods, but add randomness so we rotate among them
    const aLiked = prefs.likes.length > 0 && mealContainsTerm(a, prefs.likes) ? 0 : 1;
    const bLiked = prefs.likes.length > 0 && mealContainsTerm(b, prefs.likes) ? 0 : 1;
    if (aLiked !== bLiked) return aLiked - bLiked;

    // Calorie proximity
    return Math.abs(a.calories - targetCalories) - Math.abs(b.calories - targetCalories);
  });

  // Among top candidates (not recently eaten, matching preferences), pick with some variety.
  // Without the date seed every day collapses to the same top-ranked pick because
  // recentNames is empty for users who don't log meals, and exclude.length is the
  // same at each slot across days. Mixing in the date makes the rotation day-
  // specific while keeping a given date reproducible.
  const topTier = pool.filter(m => (recentCounts[m.name] || 0) === (recentCounts[pool[0]?.name] || 0));
  if (topTier.length > 1) {
    const offset = (dateSeed + exclude.length) % topTier.length;
    return topTier[offset];
  }

  return pool[0];
}

/**
 * generateDayMeals(nutrition, trainingLoad, dateStr, workoutType)
 * Builds a full day's meal plan based on:
 *   1. Food preferences (likes/dislikes)
 *   2. Dietary restrictions (vegan, gluten-free, etc.)
 *   3. Training context (workout type + load → macro focus)
 *   4. Cross-day variety (avoids repeating recent meals)
 *
 * @param {Object|number} nutrition    - full nutrition target {calories,protein,carbs,fat} or calorie number
 * @param {string}        trainingLoad - "rest"|"easy"|"moderate"|"hard"|"long"|"race"
 * @param {string}        [dateStr]    - "YYYY-MM-DD" for cross-day variety tracking
 * @param {string}        [workoutType]- "weightlifting"|"running"|"hiit"|etc. for macro targeting
 * @returns {Array} array of meal objects with slot labels
 */
function generateDayMeals(nutrition, trainingLoad, dateStr, workoutType) {
  const calorieTarget   = typeof nutrition === "number" ? nutrition : (nutrition.calories || 2000);
  const proteinTarget   = typeof nutrition === "object" ? (nutrition.protein || 0) : 0;
  const carbsTarget     = typeof nutrition === "object" ? (nutrition.carbs || 0) : 0;
  const fatTarget        = typeof nutrition === "object" ? (nutrition.fat || 0) : 0;

  // Macro preferences based on slider values, load, AND workout type
  const isHighIntensity = ["hard", "long", "race"].includes(trainingLoad);
  const isStrengthDay   = ["weightlifting", "bodyweight", "hiit"].includes(workoutType);
  const isEnduranceDay  = ["running", "cycling", "swimming", "triathlon"].includes(workoutType);

  // Derive preference from macro ratios if sliders were adjusted
  const proteinRatio = proteinTarget > 0 ? (proteinTarget * 4 / calorieTarget) : 0;
  const carbsRatio   = carbsTarget > 0 ? (carbsTarget * 4 / calorieTarget) : 0;

  const preferHighProtein = proteinRatio > 0.28 || isStrengthDay;
  const preferHighCarb    = carbsRatio > 0.45 || isEnduranceDay || (isHighIntensity && !isStrengthDay);
  const preferLowFat      = fatTarget > 0 && (fatTarget * 9 / calorieTarget) < 0.22;

  // Get recently eaten meal names (last 3 days) to avoid repetition
  const recentNames = dateStr ? getRecentMealNames(dateStr, 3) : [];
  const dateSeed = _dateSeed(dateStr);

  const slots = [
    { label: "Breakfast",        key: "breakfast", fraction: 0.25 },
    { label: "Morning Snack",    key: "snack",     fraction: 0.10 },
    { label: "Lunch",            key: "lunch",     fraction: 0.30 },
    { label: "Afternoon Snack",  key: "snack",     fraction: 0.10 },
    { label: "Dinner",           key: "dinner",    fraction: 0.25 },
  ];

  // Per-slot macro targets based on the same fraction split
  const _macroTargets = { protein: proteinTarget, carbs: carbsTarget, fat: fatTarget };

  /** Scale a meal's macros to hit the slot's calorie and macro targets */
  function _scaleMeal(meal, targetCals, slotFraction) {
    if (!meal.calories || meal.calories <= 0) return meal;
    const calRatio = targetCals / meal.calories;
    // Don't scale if close enough (within 15%) — keeps portions realistic
    if (calRatio >= 0.85 && calRatio <= 1.15) return meal;
    // Scale macros: if we have specific macro targets, blend toward them
    const scaled = {
      ...meal,
      calories: Math.round(meal.calories * calRatio),
      protein:  Math.round(meal.protein * calRatio),
      carbs:    Math.round(meal.carbs * calRatio),
      fat:      Math.round(meal.fat * calRatio),
    };
    // If macro targets are set, nudge macros toward per-slot targets
    if (slotFraction && proteinTarget > 0) {
      const slotP = Math.round(proteinTarget * slotFraction);
      const slotC = Math.round(carbsTarget * slotFraction);
      const slotF = Math.round(fatTarget * slotFraction);
      // Blend 50/50 between calorie-scaled and target-proportioned
      if (slotP > 0) scaled.protein = Math.round((scaled.protein + slotP) / 2);
      if (slotC > 0) scaled.carbs = Math.round((scaled.carbs + slotC) / 2);
      if (slotF > 0) scaled.fat = Math.round((scaled.fat + slotF) / 2);
      // Recalculate calories from adjusted macros
      scaled.calories = Math.round(scaled.protein * 4 + scaled.carbs * 4 + scaled.fat * 9);
    }
    return scaled;
  }

  const chosen = [];
  const usedNames = [];

  for (const slot of slots) {
    const slotTarget = Math.round(calorieTarget * slot.fraction);
    const meal = pickMeal(MEAL_LIBRARY[slot.key], slotTarget, preferHighCarb, preferHighProtein, usedNames, recentNames, preferLowFat, dateSeed);
    usedNames.push(meal.name);
    chosen.push({ ..._scaleMeal(meal, slotTarget, slot.fraction), slot: slot.label });
  }

  // If the total falls short of the target, add extra meals to close the gap.
  const extraSlots = [
    { label: "Pre-Workout Snack", key: "snack" },
    { label: "Second Lunch",      key: "lunch" },
    { label: "Post-Workout Snack",key: "snack" },
    { label: "Evening Snack",     key: "snack" },
    { label: "Pre-Sleep Snack",   key: "snack" },
  ];
  let totalCals = chosen.reduce((s, m) => s + m.calories, 0);
  let extraIdx = 0;
  while (totalCals < calorieTarget - 100 && extraIdx < extraSlots.length) {
    const gap     = calorieTarget - totalCals;
    const mealKey = gap >= 400 ? extraSlots[extraIdx].key : "snack";
    const meal    = pickMeal(MEAL_LIBRARY[mealKey], gap, preferHighCarb, preferHighProtein, usedNames, recentNames, preferLowFat, dateSeed);
    usedNames.push(meal.name);
    const scaled = _scaleMeal(meal, gap, null);
    chosen.push({ ...scaled, slot: extraSlots[extraIdx].label });
    totalCals += scaled.calories;
    extraIdx++;
  }

  // Sort all meals into chronological time-of-day order
  const SLOT_ORDER = {
    "Breakfast": 1, "Pre-Workout Snack": 2, "Morning Snack": 3,
    "Lunch": 4, "Second Lunch": 5, "Afternoon Snack": 6,
    "Post-Workout Snack": 7, "Dinner": 8, "Evening Snack": 9, "Pre-Sleep Snack": 10,
  };
  chosen.sort((a, b) => (SLOT_ORDER[a.slot] ?? 99) - (SLOT_ORDER[b.slot] ?? 99));

  return chosen;
}
