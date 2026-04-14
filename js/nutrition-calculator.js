/**
 * IronZ Philosophy Engine — Nutrition Calculator
 * Evidence-based nutrition targets from philosophy modules + user profile.
 * Vanilla JS, no imports/exports. All functions globally available.
 */

// ─── Unit Conversion Helpers ────────────────────────────────────────

function lbsToKg(lbs) {
  return lbs / 2.205;
}

function inchesToCm(inches) {
  return inches * 2.54;
}

// ─── TDEE Calculation (Mifflin-St Jeor) ─────────────────────────────

function calculateTDEE(profile) {
  var rawWeight = parseFloat(profile.weight) || 160;
  var rawHeight = parseFloat(profile.height) || 70;
  var age       = parseInt(profile.age) || 30;
  var gender    = (profile.gender || "").toLowerCase();
  var unit      = (profile.weightUnit || "").toLowerCase();

  // Auto-detect: if weight > 300 it's almost certainly lbs; if < 150 and unit says kg, use kg
  var weight_kg, height_cm;
  if (unit === "kg" || (rawWeight < 140 && rawHeight > 100)) {
    weight_kg = rawWeight;
    height_cm = rawHeight; // assume cm when kg
  } else {
    weight_kg = lbsToKg(rawWeight);
    height_cm = inchesToCm(rawHeight);
  }

  // Mifflin-St Jeor BMR
  var bmrMale   = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5;
  var bmrFemale = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161;

  var bmr;
  if (gender === "male") {
    bmr = bmrMale;
  } else if (gender === "female") {
    bmr = bmrFemale;
  } else {
    bmr = (bmrMale + bmrFemale) / 2;
  }

  // Activity multiplier derived from classification or profile
  var activityMultiplier = getActivityMultiplier(profile);

  return Math.round(bmr * activityMultiplier);
}

function getActivityMultiplier(profile) {
  // Try to derive from trainingFrequency on classification, fall back to profile days
  var freq = "";
  if (profile.trainingFrequency) {
    freq = String(profile.trainingFrequency);
  } else {
    var rawDays = profile.availableDaysPerWeek || profile.daysPerWeek;
    if (rawDays) {
      var days = parseInt(rawDays);
      if (days <= 3) freq = "2-3";
      else if (days <= 5) freq = "4-5";
      else freq = "6-7";
    }
  }

  switch (freq) {
    case "2-3": return 1.46;   // avg of light (1.375) and moderate (1.55)
    case "4-5": return 1.64;   // avg of moderate (1.55) and active (1.725)
    case "6-7": return 1.81;   // avg of active (1.725) and very active (1.9)
    default:    return 1.55;   // moderate default
  }
}

// ─── Calorie Adjustment by Goal ─────────────────────────────────────

function getCalorieAdjustment(primaryGoal) {
  var goal = (primaryGoal || "").toLowerCase();
  switch (goal) {
    case "muscle_gain":
    case "bulk":
      return 0.15;             // 10-20% surplus
    case "fat_loss":
    case "cut":
      return -0.20;            // 15-25% deficit
    case "lose_weight":
    case "weight_loss":
      return -0.25;            // 20-30% deficit
    case "general_health":
    case "maintain":
    case "recomp":
      return 0;
    case "performance":
    case "race":
      return 0.075;            // 5-10% surplus midpoint
    case "return_to_training":
    case "return":
      return 0;
    default:
      return 0;
  }
}

// ─── Protein Target (g/kg/day) ──────────────────────────────────────

function getProteinTarget(classification, profile) {
  var level = (classification.level || "beginner").toLowerCase();
  var goal  = (classification.primaryGoal || "general_health").toLowerCase();
  var sport = (classification.sportProfile || "general_fitness").toLowerCase();
  var age   = parseInt(profile.age) || 30;

  var low, high;

  if (goal === "fat_loss" || goal === "lose_weight" || goal === "cut") {
    // Higher protein to preserve muscle during deficit
    low = 1.6; high = 2.4;
  } else if (goal === "muscle_gain" || goal === "bulk") {
    if (level === "beginner") {
      low = 1.4; high = 1.8;
    } else {
      low = 1.6; high = 2.2;
    }
  } else if (sport === "endurance") {
    low = 1.4; high = 1.8;
  } else if (goal === "performance") {
    low = 1.6; high = 2.0;
  } else {
    // General / beginner / return_to_training
    low = 1.4; high = 1.8;
  }

  // Start at midpoint, adjust up slightly for older athletes (40+)
  var mid = (low + high) / 2;
  if (age >= 50) {
    mid += 0.2;
  } else if (age >= 40) {
    mid += 0.1;
  }

  // Clamp to range max
  return Math.min(mid, high + 0.1);
}

// ─── Carb Target (g/kg/day) ─────────────────────────────────────────

function getCarbTarget(classification, profile) {
  var goal  = (classification.primaryGoal || "general_health").toLowerCase();
  var sport = (classification.sportProfile || "general_fitness").toLowerCase();
  var event = (profile.event || "").toLowerCase();

  // Strength-focused
  if (sport === "strength") {
    if (goal === "muscle_gain" || goal === "bulk") {
      return 5.5;   // midpoint of 4-7
    } else if (goal === "fat_loss" || goal === "cut" || goal === "lose_weight") {
      return 3.0;   // midpoint of 2-4
    } else {
      return 4.0;   // midpoint of 3-5
    }
  }

  // Endurance — varies by distance
  if (sport === "endurance" || sport === "hybrid") {
    if (event.indexOf("ultra") !== -1) {
      return 10.0;  // midpoint of 8-12
    } else if (event.indexOf("marathon") !== -1 && event.indexOf("half") === -1) {
      return 8.5;   // midpoint of 7-10
    } else if (event.indexOf("half") !== -1 || event.indexOf("ironman") !== -1) {
      return 6.0;   // midpoint of 5-7
    } else if (event.indexOf("10k") !== -1 || event.indexOf("5k") !== -1) {
      return 4.0;   // midpoint of 3-5
    }
    // Default endurance without specific event
    return 5.0;
  }

  // HIIT / sport_performance / bodyweight
  if (sport === "sport_performance") {
    return 6.5;     // midpoint of 5-8
  }

  // Yoga / walking / general_fitness
  if (sport === "general_fitness") {
    if (goal === "fat_loss" || goal === "lose_weight" || goal === "cut") {
      return 3.0;
    }
    return 4.0;     // midpoint of 3-5
  }

  return 4.0;       // safe default
}

// ─── Fat Target (g/kg/day) ──────────────────────────────────────────

function getFatTarget(classification, profile) {
  var goal = (classification.primaryGoal || "general_health").toLowerCase();

  switch (goal) {
    case "muscle_gain":
    case "bulk":
      return 1.0;   // midpoint of 0.5-1.5
    case "fat_loss":
    case "cut":
      return 0.75;  // midpoint of 0.5-1.0
    case "lose_weight":
    case "weight_loss":
      return 0.75;  // midpoint of 0.5-1.0
    case "general_health":
    case "maintain":
      return 1.15;  // midpoint of 0.8-1.5
    default:
      return 1.0;
  }
}

// ─── Calorie Safety Floor ───────────────────────────────────────────

function enforceCalorieFloor(calories, gender) {
  var g = (gender || "").toLowerCase();
  if (g === "female") {
    return Math.max(calories, 1200);
  } else if (g === "male") {
    return Math.max(calories, 1500);
  }
  return Math.max(calories, 1400);
}

// ─── Training Day Adjustments ───────────────────────────────────────

function getTrainingDayAdjustments(classification) {
  var level = (classification.level || "beginner").toLowerCase();
  var sport = (classification.sportProfile || "general_fitness").toLowerCase();
  var goal  = (classification.primaryGoal || "general_health").toLowerCase();

  if (goal === "fat_loss" || goal === "lose_weight" || goal === "cut") {
    return "+100-150 cal on training days. Add 20-30g carbs around workouts. Keep protein consistent daily.";
  }

  if (sport === "endurance" || sport === "hybrid") {
    if (level === "advanced") {
      return "+300-500 cal on long/hard training days. Add 50-80g carbs. Consider intra-workout fueling for sessions over 90 min.";
    }
    return "+200-300 cal on training days. Add 40-60g carbs around workouts.";
  }

  if (sport === "strength") {
    if (goal === "muscle_gain" || goal === "bulk") {
      return "+200-300 cal on training days. Add 30-50g carbs pre/post workout. Protein intake stays consistent daily.";
    }
    return "+150-200 cal on training days. Add 30-40g carbs around workouts.";
  }

  // General / beginner
  if (level === "beginner") {
    return "+100-200 cal on training days. Focus on a carb-rich snack before and protein after workouts.";
  }

  return "+200 cal, +40g carbs on training days. Keep protein consistent daily.";
}

// ─── Race Fueling Plan ──────────────────────────────────────────────

function getRaceFuelingPlan(classification, modules) {
  var sport = (classification.sportProfile || "").toLowerCase();
  var event = (classification.event || "").toLowerCase();
  var moduleList = modules || [];

  // Check if any race/event modules are active
  var hasRaceModule = moduleList.some(function(m) {
    var mod = (typeof m === "string" ? m : (m.id || "")).toUpperCase();
    return mod.indexOf("RACE") !== -1 || mod.indexOf("EVENT") !== -1 ||
           mod.indexOf("TRIATHLON") !== -1 || mod.indexOf("MARATHON") !== -1;
  });

  if (!hasRaceModule && sport !== "endurance" && sport !== "hybrid") {
    return null;
  }

  // Triathlon / multi-sport
  if (sport === "hybrid" || event.indexOf("ironman") !== -1 || event.indexOf("triathlon") !== -1) {
    return "Race fueling: Carb-load 3 days prior (8-10g/kg/day). Race morning: familiar meal 3hrs before (2-3g/kg carbs). " +
      "Bike leg: 80-100g carbs/hr (gels, drink mix, bars). Run leg: 60-90g carbs/hr (gels, cola). " +
      "Hydration: 500-800ml/hr with sodium (500-700mg/hr). Practice all nutrition in training.";
  }

  // Marathon
  if (event.indexOf("marathon") !== -1 && event.indexOf("half") === -1) {
    return "Race fueling: Carb-load 2-3 days prior (7-10g/kg/day). Race morning: 2-3g/kg carbs 3hrs before. " +
      "During race: 60-90g carbs/hr starting at mile 3 (gels every 20-25 min). " +
      "Hydration: drink to thirst, aim 400-600ml/hr with electrolytes. Nothing new on race day.";
  }

  // Half marathon
  if (event.indexOf("half") !== -1) {
    return "Race fueling: Carb-load night before (extra carb-heavy dinner). Race morning: familiar breakfast 2-3hrs before. " +
      "During race: 30-60g carbs/hr (1-2 gels total). Hydration at aid stations. Practice in training.";
  }

  // General endurance event
  if (sport === "endurance") {
    return "Race fueling: Eat a familiar carb-rich meal 2-3hrs before. For events over 60 min: 30-60g carbs/hr. " +
      "Hydrate with water/electrolytes at regular intervals. Practice nutrition strategy in training.";
  }

  return null;
}

// ─── Meal Timing Guidance ───────────────────────────────────────────

function getMealTimingGuidance(classification, modules) {
  var level = (classification.level || "beginner").toLowerCase();
  var sport = (classification.sportProfile || "general_fitness").toLowerCase();
  var goal  = (classification.primaryGoal || "general_health").toLowerCase();

  if (level === "beginner") {
    return "Eat 3-4 meals per day, each with a palm-sized protein source. " +
      "Have a snack with protein within 1-2 hours after workouts. " +
      "Keep it simple — consistency matters more than timing.";
  }

  if (level === "advanced" || sport === "endurance" || sport === "hybrid") {
    var guidance = "Pre-workout (1-2hrs before): 1-2g/kg carbs + moderate protein, low fat/fiber. " +
      "Post-workout (within 60 min): 0.3-0.5g/kg protein + 0.8-1.2g/kg carbs. ";

    if (sport === "endurance" || sport === "hybrid") {
      guidance += "Intra-workout (sessions >90 min): 30-60g carbs/hr via drink or gels. ";
    }

    guidance += "Spread protein across 4-5 meals (0.3-0.5g/kg per meal). " +
      "Pre-sleep: casein-rich protein source (Greek yogurt, cottage cheese).";
    return guidance;
  }

  // Intermediate
  if (goal === "muscle_gain" || goal === "bulk") {
    return "Eat 4 meals per day, each with 30-50g protein. " +
      "Pre-workout (1-2hrs before): carbs + protein meal. " +
      "Post-workout (within 1hr): protein + carbs to support recovery. " +
      "Consider a pre-sleep protein source (casein, Greek yogurt).";
  }

  if (goal === "fat_loss" || goal === "cut" || goal === "lose_weight") {
    return "Eat 3-4 protein-rich meals per day to manage hunger. " +
      "Prioritize protein + vegetables at each meal. " +
      "Time carbs around workouts for energy. " +
      "Post-workout: protein-focused meal or shake within 1-2hrs.";
  }

  return "Eat 3-4 balanced meals per day, each including protein. " +
    "Have a pre-workout snack if training fasted feels low-energy. " +
    "Post-workout: protein + carbs within 1-2 hours.";
}

// ─── Supplement Guidance ────────────────────────────────────────────

function getSupplementGuidance(modules) {
  var recs = [];

  recs.push("Creatine monohydrate: 3-5g/day, every day (no loading phase needed). " +
    "Well-researched for strength, power, and muscle recovery.");

  recs.push("Caffeine: 3-6mg/kg body weight, 30-60 min pre-exercise for performance. " +
    "Start low to assess tolerance. Avoid within 6hrs of sleep.");

  recs.push("Vitamin D: 1000-2000 IU/day if limited sun exposure. " +
    "Test levels if possible; many athletes are deficient.");

  recs.push("Note: BCAAs are unnecessary if daily protein intake is adequate (>1.4g/kg). " +
    "Whole protein sources provide sufficient branched-chain amino acids.");

  // Check for endurance modules
  var moduleList = modules || [];
  var hasEndurance = moduleList.some(function(m) {
    var mod = (typeof m === "string" ? m : (m.id || "")).toUpperCase();
    return mod.indexOf("ENDURANCE") !== -1 || mod.indexOf("CYCLING") !== -1 ||
           mod.indexOf("RUNNING") !== -1 || mod.indexOf("TRIATHLON") !== -1;
  });

  if (hasEndurance) {
    recs.push("Electrolytes: sodium/potassium supplement for sessions >60 min or heavy sweating. " +
      "500-700mg sodium/hr during prolonged exercise.");
  }

  return recs.join(" | ");
}

// ─── Hydration Calculation ──────────────────────────────────────────

function calculateHydration(classification, modules, profile) {
  var sport = (classification.sportProfile || "general_fitness").toLowerCase();
  var level = (classification.level || "beginner").toLowerCase();
  var weight_lbs = parseFloat(profile.weight) || 160;

  // Base recommendation
  var baseOz = Math.round(weight_lbs / 2);
  var daily_base = "Aim for roughly " + baseOz + " oz/day (about " +
    Math.round(baseOz / 33.8 * 10) / 10 + " liters). " +
    "Use thirst and urine color as guides — pale yellow indicates good hydration.";

  // Training adjustment
  var training_adjustment = "Add 16-24 oz (500-700ml) of water around training sessions. " +
    "Drink before, during (sips), and after. ";

  if (sport === "endurance" || sport === "hybrid") {
    training_adjustment += "For sessions over 60 min, include electrolytes (sodium 300-500mg). " +
      "Weigh before/after long sessions — replace 150% of weight lost.";
  } else {
    training_adjustment += "For strength sessions, sip water between sets. " +
      "Increase intake in hot/humid conditions.";
  }

  // Race day
  var race_day = null;
  if (sport === "endurance" || sport === "hybrid") {
    race_day = "Pre-race: 5-7ml/kg body weight 2-4hrs before start. " +
      "During race: 150-300ml every 15-20 min with sodium (500-700mg/hr). " +
      "Post-race: 150% of fluid lost via sweat (weigh pre/post). Include sodium in recovery drinks.";

    if (level === "beginner") {
      race_day = "Pre-race: drink 16-20oz water 2hrs before. " +
        "During race: drink at every aid station (small cups). " +
        "Post-race: keep sipping water and have an electrolyte drink.";
    }
  }

  return {
    daily_base: daily_base,
    training_adjustment: training_adjustment,
    race_day: race_day
  };
}

// ─── Main Function ──────────────────────────────────────────────────

function calculateNutrition(classification, modules, profile) {
  classification = classification || {};
  modules = modules || [];
  profile = profile || {};

  // Convert profile weight/height for internal calculations
  var rawWeight = parseFloat(profile.weight) || 160;
  var unit = (profile.weightUnit || "").toLowerCase();
  var weight_kg;
  if (unit === "kg" || (rawWeight < 140 && parseFloat(profile.height) > 100)) {
    weight_kg = rawWeight;
  } else {
    weight_kg = lbsToKg(rawWeight);
  }
  var gender = (profile.gender || "").toLowerCase();

  // 1. Base TDEE
  var tdee = calculateTDEE(profile);

  // 2. Goal-based calorie adjustment
  var goalRaw = profile.goal || classification.primaryGoal || "general_health";
  var adjustment = getCalorieAdjustment(goalRaw);
  var targetCalories = Math.round(tdee * (1 + adjustment));

  // 3. Enforce safety floor
  targetCalories = enforceCalorieFloor(targetCalories, gender);

  // 4. Macronutrient targets (g/kg then convert to grams)
  var proteinPerKg = getProteinTarget(classification, profile);
  var carbsPerKg   = getCarbTarget(classification, profile);
  var fatPerKg     = getFatTarget(classification, profile);

  var protein_g = Math.round(proteinPerKg * weight_kg);
  var fat_g     = Math.round(fatPerKg * weight_kg);

  // Calculate carbs to fill remaining calories after protein and fat
  // Protein = 4 cal/g, Fat = 9 cal/g, Carbs = 4 cal/g
  var proteinCals = protein_g * 4;
  var fatCals     = fat_g * 9;
  var remainingCals = targetCalories - proteinCals - fatCals;

  // Use formula-based carbs or remainder, whichever is more reasonable
  var formulaCarbs = Math.round(carbsPerKg * weight_kg);
  var remainderCarbs = Math.max(Math.round(remainingCals / 4), 50);

  // Prefer remainder-based to keep macros consistent with calorie target
  var carbs_g = remainderCarbs;

  // If remainder carbs are unreasonably low or high vs formula, use formula
  // and adjust total calories to match
  if (remainderCarbs < formulaCarbs * 0.5 || remainderCarbs > formulaCarbs * 2) {
    carbs_g = formulaCarbs;
    targetCalories = (protein_g * 4) + (carbs_g * 4) + (fat_g * 9);
    targetCalories = enforceCalorieFloor(targetCalories, gender);
  }

  // 5. Build output
  return {
    daily_targets: {
      calories: targetCalories,
      protein_g: protein_g,
      carbs_g: carbs_g,
      fat_g: fat_g
    },
    training_day_adjustments: getTrainingDayAdjustments(classification),
    race_fueling_plan: getRaceFuelingPlan(classification, modules),
    meal_timing: getMealTimingGuidance(classification, modules),
    supplements: getSupplementGuidance(modules)
  };
}
