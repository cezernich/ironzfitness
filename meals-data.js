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
 * pickMeal(options, targetCalories, preferHighCarb, exclude)
 * Selects the best-fit meal from a category given a calorie target.
 * Respects saved food preferences: avoids disliked foods, boosts liked ones.
 * On intense training days, prefers meals tagged "high-carb".
 *
 * @param {Array}   options        - meal objects from MEAL_LIBRARY
 * @param {number}  targetCalories - target calorie count for this slot
 * @param {boolean} preferHighCarb - true on hard/long training days
 * @param {Array}   exclude        - meal names already chosen (avoid duplicates)
 * @returns {Object} selected meal object
 */
function pickMeal(options, targetCalories, preferHighCarb, preferHighProtein, exclude = []) {
  const prefs = loadFoodPreferences();

  // Start from non-duplicate meals
  let pool = options.filter(m => !exclude.includes(m.name));
  if (pool.length === 0) pool = [...options];

  // Remove meals containing disliked ingredients (checks name + categories)
  if (prefs.dislikes.length > 0) {
    const filtered = pool.filter(m => !mealContainsTerm(m, prefs.dislikes));
    if (filtered.length > 0) pool = filtered;
  }

  // Narrow by macro preference: protein target takes priority over carb preference
  if (preferHighProtein) {
    const proteinFocused = pool.filter(m => m.tags.includes("high-protein"));
    if (proteinFocused.length > 0) pool = proteinFocused;
  } else if (preferHighCarb) {
    const carbFocused = pool.filter(m => m.tags.includes("high-carb"));
    if (carbFocused.length > 0) pool = carbFocused;
  }

  // Sort: liked meals first, then by calorie proximity
  pool = [...pool].sort((a, b) => {
    const aLiked = prefs.likes.length > 0 && mealContainsTerm(a, prefs.likes) ? 0 : 1;
    const bLiked = prefs.likes.length > 0 && mealContainsTerm(b, prefs.likes) ? 0 : 1;
    if (aLiked !== bLiked) return aLiked - bLiked;
    return Math.abs(a.calories - targetCalories) - Math.abs(b.calories - targetCalories);
  });

  return pool[0];
}

/**
 * generateDayMeals(nutrition, trainingLoad)
 * Builds a full day's meal plan split across 5 slots:
 *   breakfast 25%, snack1 10%, lunch 30%, snack2 10%, dinner 25%
 *
 * @param {Object|number} nutrition   - full nutrition target object {calories,protein,carbs,fat}
 *                                      or a plain calorie number (legacy)
 * @param {string}        trainingLoad - "rest"|"easy"|"moderate"|"hard"|"long"|"race"
 * @returns {Array} array of 5 meal objects with slot labels
 */
function generateDayMeals(nutrition, trainingLoad) {
  // Accept either a full nutrition object or a plain calorie number (backwards-compat)
  const calorieTarget   = typeof nutrition === "number" ? nutrition : (nutrition.calories || 2000);
  const proteinTarget   = typeof nutrition === "object" ? (nutrition.protein || 0) : 0;

  const preferHighCarb    = ["hard", "long", "race"].includes(trainingLoad);
  // Prefer high-protein meals when protein > 30% of total calories
  const preferHighProtein = proteinTarget > 0 && (proteinTarget * 4 / calorieTarget) > 0.30;

  const slots = [
    { label: "Breakfast",        key: "breakfast", fraction: 0.25 },
    { label: "Morning Snack",    key: "snack",     fraction: 0.10 },
    { label: "Lunch",            key: "lunch",     fraction: 0.30 },
    { label: "Afternoon Snack",  key: "snack",     fraction: 0.10 },
    { label: "Dinner",           key: "dinner",    fraction: 0.25 },
  ];

  const chosen = [];
  const usedNames = [];

  for (const slot of slots) {
    const slotTarget = Math.round(calorieTarget * slot.fraction);
    const meal = pickMeal(MEAL_LIBRARY[slot.key], slotTarget, preferHighCarb, preferHighProtein, usedNames);
    usedNames.push(meal.name);
    chosen.push({ ...meal, slot: slot.label });
  }

  // If the total falls short of the target, add extra meals to close the gap.
  // High-calorie days (hard/long training) regularly need 6–8 meals.
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
    const meal    = pickMeal(MEAL_LIBRARY[mealKey], gap, preferHighCarb, preferHighProtein, usedNames);
    usedNames.push(meal.name);
    chosen.push({ ...meal, slot: extraSlots[extraIdx].label });
    totalCals += meal.calories;
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
