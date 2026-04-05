// meal-planner.js — 7-day meal planner with grocery list, swap, and saved plans

/* =====================================================================
   MEAL DATABASE (~60 meals across 4 categories)
   ===================================================================== */

const MEAL_DB = [
  // ── BREAKFAST (15) ──
  { slot:"breakfast", name:"Oatmeal with Banana & Almonds", baseCalories:380, protein:12, carbs:58, fat:12, ingredients:[{name:"rolled oats",amount:0.5,unit:"cup"},{name:"banana",amount:1,unit:"medium"},{name:"almonds",amount:1,unit:"oz"},{name:"honey",amount:1,unit:"tsp"},{name:"milk",amount:0.5,unit:"cup"}], tags:["vegetarian"] },
  { slot:"breakfast", name:"Scrambled Eggs with Toast", baseCalories:420, protein:24, carbs:32, fat:22, ingredients:[{name:"eggs",amount:3,unit:"large"},{name:"whole wheat bread",amount:2,unit:"slices"},{name:"butter",amount:1,unit:"tsp"},{name:"salt",amount:1,unit:"pinch"}], tags:["vegetarian"] },
  { slot:"breakfast", name:"Greek Yogurt Parfait", baseCalories:350, protein:22, carbs:42, fat:10, ingredients:[{name:"Greek yogurt",amount:1,unit:"cup"},{name:"granola",amount:0.25,unit:"cup"},{name:"mixed berries",amount:0.5,unit:"cup"},{name:"honey",amount:1,unit:"tsp"}], tags:["vegetarian"] },
  { slot:"breakfast", name:"Protein Smoothie", baseCalories:380, protein:30, carbs:44, fat:8, ingredients:[{name:"protein powder",amount:1,unit:"scoop"},{name:"banana",amount:1,unit:"medium"},{name:"spinach",amount:1,unit:"cup"},{name:"almond milk",amount:1,unit:"cup"},{name:"peanut butter",amount:1,unit:"tbsp"}], tags:["vegetarian","vegan"] },
  { slot:"breakfast", name:"Avocado Toast with Egg", baseCalories:400, protein:18, carbs:30, fat:24, ingredients:[{name:"whole wheat bread",amount:2,unit:"slices"},{name:"avocado",amount:0.5,unit:"medium"},{name:"eggs",amount:2,unit:"large"},{name:"salt",amount:1,unit:"pinch"},{name:"red pepper flakes",amount:1,unit:"pinch"}], tags:["vegetarian"] },
  { slot:"breakfast", name:"Overnight Oats", baseCalories:360, protein:14, carbs:52, fat:12, ingredients:[{name:"rolled oats",amount:0.5,unit:"cup"},{name:"milk",amount:0.5,unit:"cup"},{name:"chia seeds",amount:1,unit:"tbsp"},{name:"maple syrup",amount:1,unit:"tbsp"},{name:"blueberries",amount:0.25,unit:"cup"}], tags:["vegetarian"] },
  { slot:"breakfast", name:"Whole Wheat Pancakes", baseCalories:440, protein:16, carbs:60, fat:14, ingredients:[{name:"whole wheat flour",amount:1,unit:"cup"},{name:"eggs",amount:1,unit:"large"},{name:"milk",amount:0.75,unit:"cup"},{name:"maple syrup",amount:2,unit:"tbsp"},{name:"butter",amount:1,unit:"tsp"}], tags:["vegetarian"] },
  { slot:"breakfast", name:"Breakfast Burrito", baseCalories:480, protein:26, carbs:42, fat:22, ingredients:[{name:"flour tortilla",amount:1,unit:"large"},{name:"eggs",amount:2,unit:"large"},{name:"black beans",amount:0.25,unit:"cup"},{name:"cheese",amount:1,unit:"oz"},{name:"salsa",amount:2,unit:"tbsp"}], tags:["vegetarian"] },
  { slot:"breakfast", name:"PB & Banana Toast", baseCalories:370, protein:14, carbs:44, fat:16, ingredients:[{name:"whole wheat bread",amount:2,unit:"slices"},{name:"peanut butter",amount:2,unit:"tbsp"},{name:"banana",amount:0.5,unit:"medium"},{name:"honey",amount:1,unit:"tsp"}], tags:["vegetarian","vegan"] },
  { slot:"breakfast", name:"Veggie Omelet", baseCalories:360, protein:24, carbs:10, fat:26, ingredients:[{name:"eggs",amount:3,unit:"large"},{name:"bell pepper",amount:0.25,unit:"medium"},{name:"onion",amount:0.25,unit:"medium"},{name:"spinach",amount:0.5,unit:"cup"},{name:"cheese",amount:1,unit:"oz"}], tags:["vegetarian","keto"] },
  { slot:"breakfast", name:"Cottage Cheese & Fruit Bowl", baseCalories:300, protein:28, carbs:30, fat:6, ingredients:[{name:"cottage cheese",amount:1,unit:"cup"},{name:"pineapple chunks",amount:0.5,unit:"cup"},{name:"walnuts",amount:0.5,unit:"oz"}], tags:["vegetarian"] },
  { slot:"breakfast", name:"Turkey Sausage & Egg Muffin", baseCalories:400, protein:28, carbs:28, fat:18, ingredients:[{name:"English muffin",amount:1,unit:"whole"},{name:"turkey sausage patty",amount:1,unit:"patty"},{name:"egg",amount:1,unit:"large"},{name:"cheese",amount:1,unit:"slice"}], tags:[] },
  { slot:"breakfast", name:"Chia Pudding", baseCalories:320, protein:12, carbs:36, fat:14, ingredients:[{name:"chia seeds",amount:3,unit:"tbsp"},{name:"almond milk",amount:1,unit:"cup"},{name:"honey",amount:1,unit:"tbsp"},{name:"mango",amount:0.5,unit:"cup"}], tags:["vegetarian","vegan"] },
  { slot:"breakfast", name:"Ham & Cheese Croissant", baseCalories:450, protein:20, carbs:34, fat:26, ingredients:[{name:"croissant",amount:1,unit:"whole"},{name:"deli ham",amount:2,unit:"oz"},{name:"Swiss cheese",amount:1,unit:"slice"}], tags:[] },
  { slot:"breakfast", name:"Tofu Scramble", baseCalories:340, protein:22, carbs:18, fat:20, ingredients:[{name:"firm tofu",amount:6,unit:"oz"},{name:"bell pepper",amount:0.25,unit:"medium"},{name:"onion",amount:0.25,unit:"medium"},{name:"turmeric",amount:0.5,unit:"tsp"},{name:"olive oil",amount:1,unit:"tsp"}], tags:["vegetarian","vegan"] },

  // ── LUNCH (15) ──
  { slot:"lunch", name:"Grilled Chicken Salad", baseCalories:480, protein:38, carbs:24, fat:26, ingredients:[{name:"chicken breast",amount:5,unit:"oz"},{name:"mixed greens",amount:2,unit:"cups"},{name:"cherry tomatoes",amount:0.5,unit:"cup"},{name:"cucumber",amount:0.5,unit:"medium"},{name:"olive oil",amount:1,unit:"tbsp"},{name:"feta cheese",amount:1,unit:"oz"}], tags:[] },
  { slot:"lunch", name:"Turkey & Avocado Wrap", baseCalories:520, protein:32, carbs:42, fat:24, ingredients:[{name:"whole wheat tortilla",amount:1,unit:"large"},{name:"deli turkey",amount:4,unit:"oz"},{name:"avocado",amount:0.5,unit:"medium"},{name:"lettuce",amount:1,unit:"cup"},{name:"tomato",amount:2,unit:"slices"}], tags:[] },
  { slot:"lunch", name:"Quinoa Buddha Bowl", baseCalories:510, protein:18, carbs:62, fat:22, ingredients:[{name:"quinoa",amount:0.75,unit:"cup cooked"},{name:"roasted chickpeas",amount:0.5,unit:"cup"},{name:"sweet potato",amount:0.5,unit:"medium"},{name:"kale",amount:1,unit:"cup"},{name:"tahini",amount:1,unit:"tbsp"}], tags:["vegetarian","vegan"] },
  { slot:"lunch", name:"Tuna Sandwich", baseCalories:460, protein:34, carbs:38, fat:18, ingredients:[{name:"canned tuna",amount:5,unit:"oz"},{name:"whole wheat bread",amount:2,unit:"slices"},{name:"mayonnaise",amount:1,unit:"tbsp"},{name:"celery",amount:1,unit:"stalk"},{name:"lettuce",amount:2,unit:"leaves"}], tags:[] },
  { slot:"lunch", name:"Chicken Burrito Bowl", baseCalories:560, protein:40, carbs:52, fat:20, ingredients:[{name:"chicken breast",amount:5,unit:"oz"},{name:"brown rice",amount:0.75,unit:"cup cooked"},{name:"black beans",amount:0.25,unit:"cup"},{name:"salsa",amount:2,unit:"tbsp"},{name:"cheese",amount:1,unit:"oz"},{name:"lettuce",amount:1,unit:"cup"}], tags:[] },
  { slot:"lunch", name:"Lentil Soup", baseCalories:400, protein:22, carbs:56, fat:8, ingredients:[{name:"lentils",amount:0.75,unit:"cup cooked"},{name:"carrots",amount:1,unit:"medium"},{name:"celery",amount:1,unit:"stalk"},{name:"onion",amount:0.5,unit:"medium"},{name:"vegetable broth",amount:2,unit:"cups"}], tags:["vegetarian","vegan"] },
  { slot:"lunch", name:"Caprese Panini", baseCalories:480, protein:24, carbs:40, fat:24, ingredients:[{name:"ciabatta bread",amount:1,unit:"roll"},{name:"fresh mozzarella",amount:3,unit:"oz"},{name:"tomato",amount:3,unit:"slices"},{name:"basil leaves",amount:4,unit:"leaves"},{name:"balsamic glaze",amount:1,unit:"tbsp"}], tags:["vegetarian"] },
  { slot:"lunch", name:"Shrimp Stir-Fry with Rice", baseCalories:490, protein:30, carbs:56, fat:14, ingredients:[{name:"shrimp",amount:5,unit:"oz"},{name:"brown rice",amount:0.75,unit:"cup cooked"},{name:"broccoli",amount:1,unit:"cup"},{name:"soy sauce",amount:1,unit:"tbsp"},{name:"sesame oil",amount:1,unit:"tsp"}], tags:[] },
  { slot:"lunch", name:"Mediterranean Pita", baseCalories:470, protein:22, carbs:48, fat:22, ingredients:[{name:"whole wheat pita",amount:1,unit:"large"},{name:"hummus",amount:3,unit:"tbsp"},{name:"cucumber",amount:0.5,unit:"medium"},{name:"tomato",amount:0.5,unit:"medium"},{name:"feta cheese",amount:1,unit:"oz"},{name:"olives",amount:6,unit:"whole"}], tags:["vegetarian"] },
  { slot:"lunch", name:"Asian Chicken Lettuce Wraps", baseCalories:400, protein:34, carbs:22, fat:20, ingredients:[{name:"ground chicken",amount:5,unit:"oz"},{name:"butter lettuce",amount:4,unit:"leaves"},{name:"water chestnuts",amount:0.25,unit:"cup"},{name:"soy sauce",amount:1,unit:"tbsp"},{name:"ginger",amount:1,unit:"tsp"},{name:"green onion",amount:2,unit:"stalks"}], tags:[] },
  { slot:"lunch", name:"Black Bean Tacos", baseCalories:460, protein:18, carbs:58, fat:18, ingredients:[{name:"corn tortillas",amount:3,unit:"small"},{name:"black beans",amount:0.75,unit:"cup"},{name:"avocado",amount:0.25,unit:"medium"},{name:"salsa",amount:2,unit:"tbsp"},{name:"lime",amount:0.5,unit:"whole"},{name:"cilantro",amount:1,unit:"tbsp"}], tags:["vegetarian","vegan"] },
  { slot:"lunch", name:"Egg Salad on Greens", baseCalories:380, protein:22, carbs:12, fat:28, ingredients:[{name:"eggs",amount:3,unit:"large"},{name:"mayonnaise",amount:1,unit:"tbsp"},{name:"mixed greens",amount:2,unit:"cups"},{name:"celery",amount:1,unit:"stalk"},{name:"mustard",amount:1,unit:"tsp"}], tags:["vegetarian","keto"] },
  { slot:"lunch", name:"Turkey Chili", baseCalories:440, protein:36, carbs:38, fat:14, ingredients:[{name:"ground turkey",amount:5,unit:"oz"},{name:"kidney beans",amount:0.5,unit:"cup"},{name:"diced tomatoes",amount:0.5,unit:"cup"},{name:"onion",amount:0.5,unit:"medium"},{name:"chili powder",amount:1,unit:"tsp"}], tags:[] },
  { slot:"lunch", name:"Salmon Poke Bowl", baseCalories:520, protein:32, carbs:50, fat:20, ingredients:[{name:"sushi-grade salmon",amount:4,unit:"oz"},{name:"sushi rice",amount:0.75,unit:"cup cooked"},{name:"edamame",amount:0.25,unit:"cup"},{name:"avocado",amount:0.25,unit:"medium"},{name:"soy sauce",amount:1,unit:"tbsp"},{name:"sesame seeds",amount:1,unit:"tsp"}], tags:[] },
  { slot:"lunch", name:"Grilled Veggie & Hummus Wrap", baseCalories:430, protein:14, carbs:52, fat:20, ingredients:[{name:"whole wheat tortilla",amount:1,unit:"large"},{name:"hummus",amount:3,unit:"tbsp"},{name:"zucchini",amount:0.5,unit:"medium"},{name:"bell pepper",amount:0.5,unit:"medium"},{name:"eggplant",amount:3,unit:"slices"}], tags:["vegetarian","vegan"] },

  // ── DINNER (15) ──
  { slot:"dinner", name:"Grilled Salmon with Asparagus", baseCalories:520, protein:40, carbs:18, fat:32, ingredients:[{name:"salmon fillet",amount:6,unit:"oz"},{name:"asparagus",amount:8,unit:"spears"},{name:"olive oil",amount:1,unit:"tbsp"},{name:"lemon",amount:0.5,unit:"whole"},{name:"garlic",amount:2,unit:"cloves"}], tags:["keto"] },
  { slot:"dinner", name:"Chicken Stir-Fry", baseCalories:480, protein:38, carbs:40, fat:16, ingredients:[{name:"chicken breast",amount:6,unit:"oz"},{name:"broccoli",amount:1,unit:"cup"},{name:"bell pepper",amount:0.5,unit:"medium"},{name:"brown rice",amount:0.75,unit:"cup cooked"},{name:"soy sauce",amount:1,unit:"tbsp"},{name:"sesame oil",amount:1,unit:"tsp"}], tags:[] },
  { slot:"dinner", name:"Pasta Primavera", baseCalories:520, protein:18, carbs:72, fat:18, ingredients:[{name:"whole wheat pasta",amount:2,unit:"oz dry"},{name:"zucchini",amount:0.5,unit:"medium"},{name:"cherry tomatoes",amount:0.5,unit:"cup"},{name:"olive oil",amount:1,unit:"tbsp"},{name:"Parmesan cheese",amount:1,unit:"oz"},{name:"garlic",amount:2,unit:"cloves"}], tags:["vegetarian"] },
  { slot:"dinner", name:"Turkey Meatballs with Marinara", baseCalories:480, protein:36, carbs:40, fat:18, ingredients:[{name:"ground turkey",amount:6,unit:"oz"},{name:"whole wheat spaghetti",amount:2,unit:"oz dry"},{name:"marinara sauce",amount:0.5,unit:"cup"},{name:"Parmesan cheese",amount:1,unit:"tbsp"},{name:"garlic",amount:1,unit:"clove"}], tags:[] },
  { slot:"dinner", name:"Beef Tacos", baseCalories:540, protein:34, carbs:42, fat:26, ingredients:[{name:"lean ground beef",amount:5,unit:"oz"},{name:"corn tortillas",amount:3,unit:"small"},{name:"lettuce",amount:1,unit:"cup"},{name:"cheese",amount:1,unit:"oz"},{name:"salsa",amount:2,unit:"tbsp"},{name:"sour cream",amount:1,unit:"tbsp"}], tags:[] },
  { slot:"dinner", name:"Baked Chicken Thighs with Sweet Potato", baseCalories:500, protein:36, carbs:38, fat:20, ingredients:[{name:"chicken thighs",amount:6,unit:"oz"},{name:"sweet potato",amount:1,unit:"medium"},{name:"olive oil",amount:1,unit:"tsp"},{name:"rosemary",amount:1,unit:"tsp"},{name:"green beans",amount:1,unit:"cup"}], tags:[] },
  { slot:"dinner", name:"Shrimp Scampi", baseCalories:460, protein:32, carbs:42, fat:18, ingredients:[{name:"shrimp",amount:6,unit:"oz"},{name:"linguine",amount:2,unit:"oz dry"},{name:"garlic",amount:3,unit:"cloves"},{name:"butter",amount:1,unit:"tbsp"},{name:"lemon",amount:0.5,unit:"whole"},{name:"parsley",amount:1,unit:"tbsp"}], tags:[] },
  { slot:"dinner", name:"Vegetable Curry with Rice", baseCalories:480, protein:14, carbs:66, fat:18, ingredients:[{name:"chickpeas",amount:0.5,unit:"cup"},{name:"coconut milk",amount:0.5,unit:"cup"},{name:"brown rice",amount:0.75,unit:"cup cooked"},{name:"spinach",amount:1,unit:"cup"},{name:"curry paste",amount:1,unit:"tbsp"},{name:"onion",amount:0.5,unit:"medium"}], tags:["vegetarian","vegan"] },
  { slot:"dinner", name:"Pork Tenderloin with Roasted Vegetables", baseCalories:460, protein:38, carbs:28, fat:22, ingredients:[{name:"pork tenderloin",amount:6,unit:"oz"},{name:"Brussels sprouts",amount:1,unit:"cup"},{name:"carrots",amount:1,unit:"medium"},{name:"olive oil",amount:1,unit:"tbsp"},{name:"garlic",amount:2,unit:"cloves"}], tags:[] },
  { slot:"dinner", name:"Teriyaki Salmon Bowl", baseCalories:540, protein:36, carbs:52, fat:20, ingredients:[{name:"salmon fillet",amount:5,unit:"oz"},{name:"sushi rice",amount:0.75,unit:"cup cooked"},{name:"edamame",amount:0.25,unit:"cup"},{name:"teriyaki sauce",amount:2,unit:"tbsp"},{name:"cucumber",amount:0.5,unit:"medium"},{name:"sesame seeds",amount:1,unit:"tsp"}], tags:[] },
  { slot:"dinner", name:"Stuffed Bell Peppers", baseCalories:460, protein:28, carbs:42, fat:20, ingredients:[{name:"bell peppers",amount:2,unit:"large"},{name:"lean ground beef",amount:4,unit:"oz"},{name:"brown rice",amount:0.5,unit:"cup cooked"},{name:"diced tomatoes",amount:0.5,unit:"cup"},{name:"cheese",amount:1,unit:"oz"}], tags:[] },
  { slot:"dinner", name:"Lemon Herb Chicken with Quinoa", baseCalories:490, protein:40, carbs:38, fat:18, ingredients:[{name:"chicken breast",amount:6,unit:"oz"},{name:"quinoa",amount:0.75,unit:"cup cooked"},{name:"lemon",amount:0.5,unit:"whole"},{name:"mixed herbs",amount:1,unit:"tsp"},{name:"olive oil",amount:1,unit:"tsp"},{name:"steamed broccoli",amount:1,unit:"cup"}], tags:[] },
  { slot:"dinner", name:"Black Bean & Sweet Potato Enchiladas", baseCalories:500, protein:20, carbs:64, fat:18, ingredients:[{name:"corn tortillas",amount:3,unit:"small"},{name:"black beans",amount:0.5,unit:"cup"},{name:"sweet potato",amount:1,unit:"medium"},{name:"enchilada sauce",amount:0.5,unit:"cup"},{name:"cheese",amount:1,unit:"oz"}], tags:["vegetarian"] },
  { slot:"dinner", name:"Cod with Roasted Potatoes", baseCalories:440, protein:34, carbs:42, fat:14, ingredients:[{name:"cod fillet",amount:6,unit:"oz"},{name:"baby potatoes",amount:6,unit:"small"},{name:"olive oil",amount:1,unit:"tbsp"},{name:"lemon",amount:0.5,unit:"whole"},{name:"dill",amount:1,unit:"tsp"}], tags:[] },
  { slot:"dinner", name:"Tofu Pad Thai", baseCalories:480, protein:20, carbs:58, fat:20, ingredients:[{name:"firm tofu",amount:6,unit:"oz"},{name:"rice noodles",amount:2,unit:"oz dry"},{name:"bean sprouts",amount:0.5,unit:"cup"},{name:"peanuts",amount:1,unit:"tbsp"},{name:"lime",amount:0.5,unit:"whole"},{name:"soy sauce",amount:1,unit:"tbsp"}], tags:["vegetarian","vegan"] },

  // ── SNACK (15) ──
  { slot:"snack", name:"Apple with Almond Butter", baseCalories:220, protein:6, carbs:28, fat:12, ingredients:[{name:"apple",amount:1,unit:"medium"},{name:"almond butter",amount:1,unit:"tbsp"}], tags:["vegetarian","vegan"] },
  { slot:"snack", name:"Protein Bar", baseCalories:250, protein:20, carbs:24, fat:10, ingredients:[{name:"protein bar",amount:1,unit:"bar"}], tags:["vegetarian"] },
  { slot:"snack", name:"Trail Mix", baseCalories:280, protein:8, carbs:28, fat:18, ingredients:[{name:"mixed nuts",amount:1,unit:"oz"},{name:"dried fruit",amount:1,unit:"oz"},{name:"dark chocolate chips",amount:0.5,unit:"oz"}], tags:["vegetarian","vegan"] },
  { slot:"snack", name:"Hummus & Veggie Sticks", baseCalories:200, protein:8, carbs:22, fat:10, ingredients:[{name:"hummus",amount:3,unit:"tbsp"},{name:"carrots",amount:1,unit:"medium"},{name:"celery",amount:2,unit:"stalks"},{name:"bell pepper",amount:0.25,unit:"medium"}], tags:["vegetarian","vegan"] },
  { slot:"snack", name:"String Cheese & Grapes", baseCalories:180, protein:10, carbs:18, fat:8, ingredients:[{name:"string cheese",amount:2,unit:"sticks"},{name:"grapes",amount:0.5,unit:"cup"}], tags:["vegetarian"] },
  { slot:"snack", name:"Hard Boiled Eggs", baseCalories:160, protein:14, carbs:2, fat:10, ingredients:[{name:"eggs",amount:2,unit:"large"}], tags:["vegetarian","keto"] },
  { slot:"snack", name:"Greek Yogurt with Honey", baseCalories:180, protein:16, carbs:20, fat:4, ingredients:[{name:"Greek yogurt",amount:0.75,unit:"cup"},{name:"honey",amount:1,unit:"tsp"}], tags:["vegetarian"] },
  { slot:"snack", name:"Rice Cakes with PB", baseCalories:200, protein:6, carbs:28, fat:8, ingredients:[{name:"rice cakes",amount:2,unit:"cakes"},{name:"peanut butter",amount:1,unit:"tbsp"}], tags:["vegetarian","vegan"] },
  { slot:"snack", name:"Mixed Nuts", baseCalories:200, protein:6, carbs:8, fat:18, ingredients:[{name:"mixed nuts",amount:1.5,unit:"oz"}], tags:["vegetarian","vegan","keto"] },
  { slot:"snack", name:"Banana with Peanut Butter", baseCalories:240, protein:8, carbs:32, fat:10, ingredients:[{name:"banana",amount:1,unit:"medium"},{name:"peanut butter",amount:1,unit:"tbsp"}], tags:["vegetarian","vegan"] },
  { slot:"snack", name:"Cottage Cheese & Pineapple", baseCalories:180, protein:16, carbs:20, fat:4, ingredients:[{name:"cottage cheese",amount:0.5,unit:"cup"},{name:"pineapple chunks",amount:0.25,unit:"cup"}], tags:["vegetarian"] },
  { slot:"snack", name:"Edamame", baseCalories:190, protein:16, carbs:14, fat:8, ingredients:[{name:"edamame",amount:1,unit:"cup shelled"}], tags:["vegetarian","vegan"] },
  { slot:"snack", name:"Dark Chocolate & Almonds", baseCalories:240, protein:6, carbs:20, fat:16, ingredients:[{name:"dark chocolate",amount:1,unit:"oz"},{name:"almonds",amount:0.5,unit:"oz"}], tags:["vegetarian","vegan"] },
  { slot:"snack", name:"Turkey Roll-Ups", baseCalories:160, protein:18, carbs:4, fat:8, ingredients:[{name:"deli turkey",amount:3,unit:"oz"},{name:"cream cheese",amount:1,unit:"tbsp"},{name:"cucumber",amount:4,unit:"slices"}], tags:["keto"] },
  { slot:"snack", name:"Smoothie Bowl (mini)", baseCalories:260, protein:12, carbs:38, fat:8, ingredients:[{name:"frozen berries",amount:0.5,unit:"cup"},{name:"banana",amount:0.5,unit:"medium"},{name:"Greek yogurt",amount:0.25,unit:"cup"},{name:"granola",amount:2,unit:"tbsp"}], tags:["vegetarian"] },
];

/* =====================================================================
   INGREDIENT CATEGORY MAP (for grocery list grouping)
   ===================================================================== */

const INGREDIENT_CATEGORIES = {
  produce: ["banana","apple","avocado","spinach","kale","mixed greens","lettuce","tomato","cherry tomatoes","cucumber","bell pepper","onion","broccoli","carrots","celery","zucchini","sweet potato","asparagus","green beans","Brussels sprouts","lemon","lime","ginger","garlic","basil leaves","cilantro","parsley","dill","mango","blueberries","mixed berries","frozen berries","grapes","pineapple chunks","pineapple","bean sprouts","edamame","eggplant","baby potatoes","green onion","butter lettuce","rosemary","mixed herbs","red pepper flakes","water chestnuts","olives","steamed broccoli"],
  protein: ["chicken breast","chicken thighs","ground chicken","salmon fillet","cod fillet","shrimp","lean ground beef","ground turkey","pork tenderloin","deli turkey","deli ham","turkey sausage patty","canned tuna","sushi-grade salmon","firm tofu","eggs","egg","protein powder","protein bar"],
  dairy: ["milk","almond milk","Greek yogurt","cottage cheese","cheese","feta cheese","Swiss cheese","fresh mozzarella","string cheese","Parmesan cheese","cream cheese","butter","sour cream","coconut milk"],
  grains: ["rolled oats","whole wheat bread","whole wheat flour","whole wheat tortilla","flour tortilla","corn tortillas","English muffin","ciabatta bread","croissant","whole wheat pita","brown rice","sushi rice","quinoa","whole wheat pasta","whole wheat spaghetti","linguine","rice noodles","rice cakes","granola"],
  pantry: ["almonds","almond butter","peanut butter","walnuts","mixed nuts","peanuts","chia seeds","sesame seeds","dark chocolate chips","dark chocolate","honey","maple syrup","olive oil","sesame oil","soy sauce","teriyaki sauce","salsa","marinara sauce","enchilada sauce","curry paste","balsamic glaze","hummus","tahini","mayonnaise","mustard","dried fruit","trail mix","black beans","kidney beans","chickpeas","roasted chickpeas","lentils","vegetable broth","diced tomatoes","chili powder","turmeric","salt"],
};

function _categorizeIngredient(name) {
  const lower = name.toLowerCase();
  for (const [cat, items] of Object.entries(INGREDIENT_CATEGORIES)) {
    if (items.some(i => lower.includes(i.toLowerCase()) || i.toLowerCase().includes(lower))) return cat;
  }
  return "pantry";
}

/* =====================================================================
   HELPERS
   ===================================================================== */

const SLOT_ORDER = ["breakfast","lunch","dinner","snack"];
const SLOT_CALORIE_SPLITS = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 };
const MP_DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

let _weekPlanState = null;
let _selectedDayIdx = (new Date().getDay() + 6) % 7; // Map JS DOW (0=Sun) → planner index (0=Mon)
let _householdSize = 1;
let _groceryVisible = false;
let _groceryDays = 7;
let _savedPlansVisible = false;

function _getRestrictions() {
  try {
    const ob = JSON.parse(localStorage.getItem("onboardingData") || "{}");
    const r = ob.dietaryRestrictions || [];
    return r.filter(x => x !== "none");
  } catch { return []; }
}

function _getPreferences() {
  try {
    return JSON.parse(localStorage.getItem("foodPreferences") || '{"likes":[],"dislikes":[]}');
  } catch { return { likes: [], dislikes: [] }; }
}

function _mealMatchesDiet(meal, restrictions) {
  if (!restrictions.length) return true;
  for (const r of restrictions) {
    const rLower = r.toLowerCase();
    if (rLower === "vegetarian" && !meal.tags.includes("vegetarian") && !meal.tags.includes("vegan")) return false;
    if (rLower === "vegan" && !meal.tags.includes("vegan")) return false;
    if (rLower === "keto" && !meal.tags.includes("keto")) return false;
  }
  return true;
}

function _mealMatchesPrefs(meal, prefs) {
  const nameLower = meal.name.toLowerCase();
  const ingLower = meal.ingredients.map(i => i.name.toLowerCase());
  for (const d of (prefs.dislikes || [])) {
    const dl = d.toLowerCase();
    if (nameLower.includes(dl)) return false;
    if (ingLower.some(i => i.includes(dl))) return false;
  }
  return true;
}

function _scaleMeal(template, targetCalories) {
  const ratio = targetCalories / template.baseCalories;
  return {
    slot: template.slot,
    name: template.name,
    calories: Math.round(template.baseCalories * ratio),
    protein: Math.round(template.protein * ratio),
    carbs: Math.round(template.carbs * ratio),
    fat: Math.round(template.fat * ratio),
    ingredients: template.ingredients.map(i => ({
      name: i.name,
      amount: Math.round(i.amount * ratio * 100) / 100,
      unit: i.unit,
    })),
    tags: template.tags,
  };
}

function _pickMeal(slot, targetCalories, restrictions, prefs, usedNames) {
  const pool = MEAL_DB.filter(m =>
    m.slot === slot &&
    _mealMatchesDiet(m, restrictions) &&
    _mealMatchesPrefs(m, prefs) &&
    !usedNames.has(m.name)
  );
  if (pool.length === 0) {
    // Fallback: allow repeats
    const fallback = MEAL_DB.filter(m => m.slot === slot && _mealMatchesDiet(m, restrictions) && _mealMatchesPrefs(m, prefs));
    if (fallback.length === 0) {
      // Last resort: any meal in slot
      const any = MEAL_DB.filter(m => m.slot === slot);
      const pick = any[Math.floor(Math.random() * any.length)];
      return _scaleMeal(pick, targetCalories);
    }
    const pick = fallback[Math.floor(Math.random() * fallback.length)];
    return _scaleMeal(pick, targetCalories);
  }

  // Prefer meals whose base calories are close to target
  pool.sort((a, b) => Math.abs(a.baseCalories - targetCalories) - Math.abs(b.baseCalories - targetCalories));
  // Pick from top 3 closest
  const topN = pool.slice(0, Math.min(3, pool.length));
  const pick = topN[Math.floor(Math.random() * topN.length)];
  usedNames.add(pick.name);
  return _scaleMeal(pick, targetCalories);
}

/* =====================================================================
   CORE API
   ===================================================================== */

// Classify a day's training sessions into a load category for nutrition adjustment
function _classifyDayLoad(sessions) {
  if (!sessions || sessions.length === 0) return "rest";
  const types = sessions.map(s => (s.type || s.discipline || "").toLowerCase());
  const loads = sessions.map(s => (s.load || "").toLowerCase());
  const names = sessions.map(s => (s.sessionName || "").toLowerCase());

  const isStrength = types.some(t => t === "weightlifting" || t === "bodyweight" || t === "hiit");
  const isEndurance = types.some(t => t === "running" || t === "run" || t === "cycling" || t === "bike" || t === "swimming" || t === "swim" || t === "triathlon");
  const isHard = loads.some(l => l === "hard" || l === "long") ||
    names.some(n => /interval|tempo|threshold|long run|long ride|brick|race/i.test(n));

  if (isEndurance && isHard) return "endurance-hard";
  if (isEndurance) return "endurance-easy";
  if (isStrength) return "strength";
  return "light";
}

// Day-level calorie/macro multipliers based on training load
const _DAY_LOAD_ADJUSTMENTS = {
  "rest":           { calories: 0.90, proteinPct: 0.30, carbsPct: 0.35, fatPct: 0.35 },
  "light":          { calories: 0.95, proteinPct: 0.30, carbsPct: 0.40, fatPct: 0.30 },
  "strength":       { calories: 1.05, proteinPct: 0.35, carbsPct: 0.35, fatPct: 0.30 },
  "endurance-easy": { calories: 1.00, proteinPct: 0.25, carbsPct: 0.50, fatPct: 0.25 },
  "endurance-hard": { calories: 1.15, proteinPct: 0.25, carbsPct: 0.55, fatPct: 0.20 },
};

function _getWeekTrainingByDow() {
  // Map DOW (0=Sun..6=Sat) -> array of sessions for the upcoming week
  const byDow = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const todayStr = today.toISOString().slice(0, 10);
  const endStr = weekEnd.toISOString().slice(0, 10);

  // Gather from workoutSchedule
  const schedule = typeof loadWorkoutSchedule === "function" ? loadWorkoutSchedule() : [];
  schedule.forEach(s => {
    if (s.date >= todayStr && s.date < endStr) {
      const dow = new Date(s.date + "T00:00:00").getDay();
      byDow[dow].push(s);
    }
  });

  // Gather from trainingPlan (race plans)
  const plan = typeof loadTrainingPlan === "function" ? loadTrainingPlan() : [];
  plan.forEach(s => {
    if (s.date >= todayStr && s.date < endStr) {
      const dow = new Date(s.date + "T00:00:00").getDay();
      byDow[dow].push(s);
    }
  });

  return byDow;
}

function generateWeekMealPlan(options) {
  options = options || {};
  const hs = options.householdSize || _householdSize || 1;
  const fallbackTargets = { calories: 2200, protein: 165, carbs: 220, fat: 73 };
  const restrictions = _getRestrictions();
  const prefs = _getPreferences();

  // Get training schedule for the week to classify day load labels
  const trainingByDow = _getWeekTrainingByDow();
  // MP_DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] → DOW mapping
  const mpDowMap = [1, 2, 3, 4, 5, 6, 0]; // Mon=1, Tue=2, ... Sun=0

  // Build date strings for the upcoming week starting from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  const usedNames = { breakfast: new Set(), lunch: new Set(), dinner: new Set(), snack: new Set() };

  for (let d = 0; d < 7; d++) {
    const dow = mpDowMap[d];
    const sessions = trainingByDow[dow] || [];
    const load = _classifyDayLoad(sessions);

    // Find the next occurrence of this DOW from today to get the actual date
    const daysUntil = (dow - today.getDay() + 7) % 7;
    const dayDate = new Date(today);
    dayDate.setDate(dayDate.getDate() + daysUntil);
    const dateStr = dayDate.toISOString().slice(0, 10);

    // Use the same nutrition target system as the home screen sliders
    let dayTargets;
    if (typeof getDailyNutritionTarget === "function") {
      dayTargets = getDailyNutritionTarget(dateStr);
    } else if (typeof getBaseNutritionTarget === "function") {
      dayTargets = getBaseNutritionTarget(dateStr);
    } else {
      dayTargets = fallbackTargets;
    }

    const dayMeals = [];
    for (const slot of SLOT_ORDER) {
      const slotCal = Math.round(dayTargets.calories * SLOT_CALORIE_SPLITS[slot]);
      const meal = _pickMeal(slot, slotCal, restrictions, prefs, usedNames[slot]);
      dayMeals.push(meal);
    }
    days.push({ dayIndex: d, label: MP_DAY_LABELS[d], meals: dayMeals, load, dayTargets, date: dateStr });
  }

  const plan = {
    id: (typeof generateId === "function") ? generateId("mp") : "mp_" + Date.now(),
    createdAt: new Date().toISOString(),
    householdSize: hs,
    targets: baseTargets,
    days: days,
  };

  localStorage.setItem("currentWeekMealPlan", JSON.stringify(plan));
  _weekPlanState = plan;
  _householdSize = hs;
  _selectedDayIdx = (new Date().getDay() + 6) % 7; // Reset to today
  return plan;
}

function generateMealPlanGroceryList(weekPlan, dayCount) {
  if (!weekPlan) return [];
  const hs = weekPlan.householdSize || 1;
  const numDays = dayCount || 7;
  const agg = {}; // key: ingredient name -> {name, amount, unit, category}

  // Start from today's index in the Mon-Sun week, wrapping around
  const todayIdx = (new Date().getDay() + 6) % 7; // 0=Mon..6=Sun
  const indices = [];
  for (let i = 0; i < numDays; i++) {
    indices.push((todayIdx + i) % 7);
  }
  const daysToInclude = indices.map(i => weekPlan.days[i]).filter(Boolean);
  for (const day of daysToInclude) {
    for (const meal of day.meals) {
      for (const ing of meal.ingredients) {
        const key = ing.name.toLowerCase();
        if (!agg[key]) {
          agg[key] = { name: ing.name, amount: 0, unit: ing.unit, category: _categorizeIngredient(ing.name) };
        }
        agg[key].amount += ing.amount * hs;
      }
    }
  }

  // Group by category
  const grouped = { produce: [], protein: [], dairy: [], grains: [], pantry: [] };
  for (const item of Object.values(agg)) {
    item.amount = Math.ceil(item.amount);
    const cat = grouped[item.category] || grouped.pantry;
    cat.push(item);
  }

  // Sort each category alphabetically
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
  }

  return grouped;
}

function swapMeal(dayIndex, slotIndex) {
  if (!_weekPlanState) return;
  const day = _weekPlanState.days[dayIndex];
  if (!day) return;
  const oldMeal = day.meals[slotIndex];
  if (!oldMeal) return;

  const slot = oldMeal.slot;
  const restrictions = _getRestrictions();
  const prefs = _getPreferences();
  const slotCal = Math.round(_weekPlanState.targets.calories * SLOT_CALORIE_SPLITS[slot]);

  // Avoid picking the same meal
  const usedNames = new Set([oldMeal.name]);
  const newMeal = _pickMeal(slot, slotCal, restrictions, prefs, usedNames);
  day.meals[slotIndex] = newMeal;

  localStorage.setItem("currentWeekMealPlan", JSON.stringify(_weekPlanState));
  renderWeekMealPlanner();
}

function saveWeekPlan(plan, name) {
  if (!plan) return false;
  let saved;
  try { saved = JSON.parse(localStorage.getItem("savedMealPlans") || "[]"); } catch { saved = []; }

  if (saved.length >= 5) {
    alert("Maximum 5 saved plans. Delete one before saving a new one.");
    return false;
  }

  saved.push({
    id: (typeof generateId === "function") ? generateId("sp") : "sp_" + Date.now(),
    name: name || ("Plan " + (saved.length + 1)),
    savedAt: new Date().toISOString(),
    plan: JSON.parse(JSON.stringify(plan)),
  });

  localStorage.setItem("savedMealPlans", JSON.stringify(saved));
  return true;
}

function loadSavedPlans() {
  try { return JSON.parse(localStorage.getItem("savedMealPlans") || "[]"); } catch { return []; }
}

function deleteSavedPlan(id) {
  let saved = loadSavedPlans();
  saved = saved.filter(s => s.id !== id);
  localStorage.setItem("savedMealPlans", JSON.stringify(saved));
  renderWeekMealPlanner();
}

function loadSavedPlanById(id) {
  const saved = loadSavedPlans();
  const found = saved.find(s => s.id === id);
  if (!found) return;
  _weekPlanState = JSON.parse(JSON.stringify(found.plan));
  _householdSize = _weekPlanState.householdSize || 1;
  localStorage.setItem("currentWeekMealPlan", JSON.stringify(_weekPlanState));
  renderWeekMealPlanner();
}

/* =====================================================================
   RENDER
   ===================================================================== */

function renderWeekMealPlanner() {
  const container = document.getElementById("meal-planner-content");
  if (!container) return;

  // Load existing plan if not in memory
  if (!_weekPlanState) {
    try {
      const stored = JSON.parse(localStorage.getItem("currentWeekMealPlan"));
      if (stored && stored.days) {
        _weekPlanState = stored;
        _householdSize = stored.householdSize || 1;
      }
    } catch {}
  }

  const esc = typeof escHtml === "function" ? escHtml : function(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); };

  if (!_weekPlanState) {
    container.innerHTML = `
      <div class="mp-controls">
        <div class="mp-household-row">
          <label class="mp-label">Household size</label>
          <select id="mp-household-select" class="mp-select" onchange="_householdSize=parseInt(this.value)||1">
            ${[1,2,3,4,5,6].map(n => `<option value="${n}" ${n===_householdSize?'selected':''}>${n} ${n===1?'person':'people'}</option>`).join("")}
          </select>
        </div>
        <button class="btn-primary" onclick="_householdSize=parseInt(document.getElementById('mp-household-select').value)||1;generateWeekMealPlan({householdSize:_householdSize});renderWeekMealPlanner()">Generate 7-Day Meal Plan</button>
      </div>
      ${_renderSavedPlansSection(esc)}
    `;
    return;
  }

  const plan = _weekPlanState;
  const day = plan.days[_selectedDayIdx] || plan.days[0];

  // Day tabs
  let dayTabsHtml = '<div class="mp-day-tabs">';
  for (let i = 0; i < 7; i++) {
    const active = (i === _selectedDayIdx && !_groceryVisible) ? " mp-day-tab--active" : "";
    dayTabsHtml += `<button class="mp-day-tab${active}" onclick="_selectedDayIdx=${i};_groceryVisible=false;renderWeekMealPlanner()">${MP_DAY_LABELS[i]}</button>`;
  }
  dayTabsHtml += `<button class="mp-day-tab mp-day-tab--grocery${_groceryVisible ? ' mp-day-tab--active' : ''}" onclick="_groceryVisible=!_groceryVisible;renderWeekMealPlanner()" title="Grocery List">&#x1f6d2;</button>`;
  dayTabsHtml += '</div>';

  // Day total
  const dayTotals = day.meals.reduce((a, m) => ({
    calories: a.calories + m.calories,
    protein: a.protein + m.protein,
    carbs: a.carbs + m.carbs,
    fat: a.fat + m.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Meal cards
  let mealsHtml = '';
  day.meals.forEach((meal, si) => {
    const slotLabel = meal.slot.charAt(0).toUpperCase() + meal.slot.slice(1);
    mealsHtml += `
      <div class="mp-meal-card">
        <div class="mp-meal-header">
          <span class="mp-meal-slot">${esc(slotLabel)}</span>
          <button class="mp-swap-btn" onclick="swapMeal(${_selectedDayIdx},${si})" title="Swap meal">&#x21c4;</button>
        </div>
        <div class="mp-meal-name">${esc(meal.name)}</div>
        <div class="mp-meal-macros">${meal.calories} cal &middot; P:${meal.protein}g &middot; C:${meal.carbs}g &middot; F:${meal.fat}g</div>
        <div class="mp-meal-ingredients">${meal.ingredients.map(i => { const a = i.amount % 1 === 0 ? i.amount : (i.amount <= 1 ? Math.round(i.amount * 4) / 4 : Math.ceil(i.amount)); return esc(a + ' ' + i.unit + ' ' + i.name); }).join(', ')}</div>
      </div>`;
  });

  // Grocery list
  let groceryHtml = '';
  if (_groceryVisible) {
    const grouped = generateMealPlanGroceryList(plan, _groceryDays);
    const catLabels = { produce: "Produce", protein: "Protein", dairy: "Dairy", grains: "Grains", pantry: "Pantry" };
    const _todayIdx = (new Date().getDay() + 6) % 7;
    const dayOpts = [1,2,3,4,5,6,7].map(n => {
      const startDay = MP_DAY_LABELS[_todayIdx];
      const endDay = MP_DAY_LABELS[(_todayIdx + n - 1) % 7];
      let label;
      if (n === 1) label = `Today (${startDay})`;
      else if (n === 7) label = 'Full week';
      else label = `${n} days (${startDay}\u2013${endDay})`;
      return `<option value="${n}" ${n === _groceryDays ? 'selected' : ''}>${label}</option>`;
    }).join("");
    groceryHtml = `<div class="mp-grocery-list">
      <div class="mp-grocery-header">
        <h3 class="mp-grocery-heading">Grocery List</h3>
        <select class="mp-grocery-days-select" onchange="_groceryDays=parseInt(this.value)||7;renderWeekMealPlanner()">${dayOpts}</select>
      </div>`;
    for (const [cat, items] of Object.entries(grouped)) {
      if (!items.length) continue;
      groceryHtml += `<div class="mp-grocery-cat"><div class="mp-grocery-cat-name">${esc(catLabels[cat] || cat)}</div>`;
      groceryHtml += items.map(i =>
        `<label class="mp-grocery-item"><input type="checkbox"><span>${esc(i.amount + ' ' + i.unit + ' ' + i.name)}</span></label>`
      ).join("");
      groceryHtml += '</div>';
    }
    groceryHtml += '</div>';
  }

  container.innerHTML = `
    <div class="mp-controls">
      <div class="mp-household-row">
        <label class="mp-label">Household size</label>
        <select id="mp-household-select" class="mp-select" onchange="_householdSize=parseInt(this.value)||1">
          ${[1,2,3,4,5,6].map(n => `<option value="${n}" ${n===_householdSize?'selected':''}>${n} ${n===1?'person':'people'}</option>`).join("")}
        </select>
      </div>
      <div class="mp-btn-row">
        <button class="btn-primary" onclick="_householdSize=parseInt(document.getElementById('mp-household-select').value)||1;generateWeekMealPlan({householdSize:_householdSize});renderWeekMealPlanner()">Regenerate Plan</button>
        <button class="btn-secondary" onclick="_promptSavePlan()">Save Plan</button>
      </div>
    </div>
    ${dayTabsHtml}
    ${_groceryVisible ? groceryHtml : (() => {
      const _loadLabels = { rest: "Rest Day", light: "Light Activity", strength: "Strength Day", "endurance-easy": "Easy Cardio", "endurance-hard": "Hard / Long Session" };
      const _loadTag = day.load ? `<span class="mp-load-tag mp-load-tag--${day.load}">${_loadLabels[day.load] || day.load}</span>` : "";
      return `
    <div class="mp-day-summary">
      <div><strong>${esc(day.label)} Totals:</strong> ${dayTotals.calories} cal &middot; P:${dayTotals.protein}g &middot; C:${dayTotals.carbs}g &middot; F:${dayTotals.fat}g</div>
      ${_loadTag}
    </div>
    ${mealsHtml}`;
    })()}
    ${_renderSavedPlansSection(esc)}
  `;
}

function _renderSavedPlansSection(esc) {
  const saved = loadSavedPlans();
  if (saved.length === 0 && !_savedPlansVisible) return '';

  let html = `
    <div class="mp-saved-section">
      <button class="btn-secondary mp-saved-toggle" onclick="_savedPlansVisible=!_savedPlansVisible;renderWeekMealPlanner()">
        Saved Plans (${saved.length}/5) ${_savedPlansVisible ? '&#9650;' : '&#9660;'}
      </button>`;

  if (_savedPlansVisible) {
    if (saved.length === 0) {
      html += '<p class="empty-msg">No saved plans yet.</p>';
    } else {
      html += '<div class="mp-saved-list">';
      for (const s of saved) {
        const dateStr = new Date(s.savedAt).toLocaleDateString();
        html += `
          <div class="mp-saved-item">
            <div class="mp-saved-info">
              <span class="mp-saved-name">${esc(s.name)}</span>
              <span class="mp-saved-date">${esc(dateStr)}</span>
            </div>
            <div class="mp-saved-actions">
              <button class="btn-secondary btn-sm" onclick="loadSavedPlanById('${esc(s.id)}')">Load</button>
              <button class="btn-secondary btn-sm mp-delete-btn" onclick="deleteSavedPlan('${esc(s.id)}')">Delete</button>
            </div>
          </div>`;
      }
      html += '</div>';
    }
  }

  html += '</div>';
  return html;
}

function _promptSavePlan() {
  if (!_weekPlanState) return;
  const name = prompt("Name this meal plan:", "My Plan");
  if (!name) return;
  if (saveWeekPlan(_weekPlanState, name.trim())) {
    _savedPlansVisible = true;
    renderWeekMealPlanner();
  }
}
