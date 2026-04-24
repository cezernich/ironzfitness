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
  // Standard Mifflin-St Jeor activity multipliers (Bug 19). The
  // previous custom midpoints (1.46 / 1.64 / 1.81) sat between two
  // standard tiers and over-estimated TDEE — a 135-lb general-fitness
  // user training 4–5 days a week was getting 2,600 kcal when the
  // accepted maintenance for that profile is ~2,000.
  //
  // Standard tiers (Mifflin, ACSM, etc.):
  //   Sedentary (little / no exercise)        → 1.2
  //   Lightly active (1–3 days/week)          → 1.375
  //   Moderately active (3–5 days/week)       → 1.55
  //   Very active (6–7 days/week)             → 1.725
  //   Extra active (2× per day, manual labor) → 1.9
  //
  // Reads `trainingFrequency` first (legacy classifier output), then
  // falls back to numeric daysPerWeek. Defaults to 1.375 when the
  // user has no day count set — better to under-estimate than to
  // over-prescribe a calorie target.
  var freq = "";
  if (profile.trainingFrequency) {
    freq = String(profile.trainingFrequency);
  } else {
    var rawDays = profile.availableDaysPerWeek || profile.daysPerWeek;
    if (rawDays != null) {
      var days = parseInt(rawDays);
      if (isFinite(days)) {
        if (days <= 0) freq = "0";
        else if (days <= 3) freq = "1-3";
        else if (days <= 5) freq = "4-5";
        else freq = "6-7";
      }
    }
  }

  switch (freq) {
    case "0":          return 1.2;     // sedentary
    case "1-3":
    case "2-3":        return 1.375;   // lightly active
    case "4-5":        return 1.55;    // moderately active
    case "6-7":        return 1.725;   // very active
    case "twice":      return 1.9;     // extra active
    default:           return 1.375;   // safer default than 1.55 (was over-prescribing)
  }
}

// ─── Calorie Adjustment by Goal ─────────────────────────────────────

function getCalorieAdjustment(primaryGoal) {
  // Single source of truth for goal → calorie adjustment. Handles
  // both legacy goal strings (muscle_gain, lose_weight, race) and
  // the v1.4 internal enum (race_performance, speed_performance,
  // endurance, general_fitness). Previously a duplicate of this
  // function lived inside the NutritionCalculator IIFE — deleted
  // 2026-04-24 (Bug 19) so there's only one place to change goal
  // adjustments.
  var goal = (primaryGoal || "").toLowerCase();
  switch (goal) {
    case "muscle_gain":
    case "bulk":
      return 0.15;             // 10-20% surplus midpoint
    case "fat_loss":
    case "cut":
      return -0.20;            // 15-25% deficit midpoint
    case "lose_weight":
    case "weight_loss":
      return -0.25;            // 20-30% deficit midpoint
    case "general_health":
    case "general_fitness":
    case "maintain":
    case "recomp":
      return 0;                // maintenance
    case "performance":
    case "race":
    case "race_performance":
      return 0.05;             // maintenance / slight surplus
    case "speed_performance":
      return 0;                // maintenance — high-intensity recovery
    case "endurance":
      return 0.05;             // slight surplus to fuel volume
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

// ── Rule Engine (Chunk 3): window.NutritionCalculator ──────────────────────
// PLAN_SCHEMA.json-conformant API. Additive — does not affect the bare
// function exports above that rules-engine.js / philosophy-planner.js rely
// on. See sources-of-truth/TRAINING_PHILOSOPHY.md §10, §13 and
// sources-of-truth/RULE_ENGINE_SPEC.md Step 8.
(function () {
  'use strict';

  const LBS_PER_KG = 2.20462;

  // v1.4 — Philosophy §2.5 goal enum and nutrition targets.
  const GOAL_CALORIE_ADJUSTMENT = {
    race_performance:   0.05,  // maintenance or slight surplus (midpoint)
    speed_performance:  0,     // maintenance
    endurance:          0.05,  // maintenance or slight surplus
    fat_loss:          -0.20,  // -15% to -25% deficit
    general_fitness:    0,     // maintenance
    // Legacy keys retained for back-compat (pre-v1.4 callers).
    muscle_gain:        0.15,
    performance:        0,
    general_health:     0,
    return_to_training: 0,
  };

  const GOAL_ADJUSTMENT_LABEL = {
    race_performance:   'Maintenance or slight surplus for race performance',
    speed_performance:  'Maintenance calories — support high-intensity recovery',
    endurance:          'Maintenance or slight surplus — fuel the aerobic work',
    fat_loss:           '-20% deficit for fat loss',
    general_fitness:    'Maintenance calories',
    muscle_gain:        '+15% surplus for muscle gain',
    performance:        'Maintenance calories for performance',
    general_health:     'Maintenance calories',
    return_to_training: 'Maintenance calories during return-to-training',
  };

  // Philosophy §2.5 — g/lb bodyweight targets (midpoint of the stated range).
  const GOAL_PROTEIN_G_PER_LB = {
    race_performance:   0.7,   // 0.6-0.8 range
    speed_performance:  0.8,   // 0.7-0.9 range
    endurance:          0.7,   // 0.6-0.8 range
    fat_loss:           1.0,   // 0.8-1.2 range
    general_fitness:    0.7,   // 0.6-0.8 range
    // Legacy keys.
    muscle_gain:        0.9,
    performance:        0.7,
    general_health:     0.7,
    return_to_training: 0.8,
  };

  const PROTEIN_FLOOR_G_PER_LB = 0.6;

  function normalizeGoal(goal) {
    if (!goal) return 'general_fitness';
    const g = String(goal).toLowerCase();
    if (GOAL_CALORIE_ADJUSTMENT[g] != null) return g;
    // Map legacy / UI labels to v1.4 internal enum.
    if (g.includes('race') || g.includes('train_for')) return 'race_performance';
    if (g.includes('faster') || g.includes('speed')) return 'speed_performance';
    if (g.includes('endur') || g.includes('aerobic')) return 'endurance';
    if (g.includes('fat') || g.includes('cut') || g.includes('weight') || g.includes('loss') || g.includes('lean')) return 'fat_loss';
    if (g.includes('muscle') || g.includes('bulk') || g.includes('gain')) return 'muscle_gain';
    if (g.includes('fit') || g.includes('general') || g.includes('health') || g.includes('maintain')) return 'general_fitness';
    if (g.includes('perform')) return 'race_performance';
    if (g.includes('return')) return 'general_fitness';
    return 'general_fitness';
  }

  function normalizeGender(gender) {
    const g = String(gender || '').toLowerCase();
    if (g === 'male' || g === 'm') return 'male';
    if (g === 'female' || g === 'f') return 'female';
    if (g === 'other') return 'other';
    return 'not_specified';
  }

  function daysToActivityMultiplier(daysAvailable) {
    const d = Number(daysAvailable) || 4;
    if (d <= 3) return 1.375;  // Sedentary / light
    if (d <= 5) return 1.55;   // Moderate
    if (d <= 6) return 1.725;  // Active
    return 1.9;                // Very active
  }

  // Mifflin-St Jeor with an additional +166 term for males to match the
  // signature requested in the Chunk 3 spec. Inputs are lbs/inches.
  function calculateTDEE(weightLbs, heightIn, age, gender, activityMultiplier) {
    const w = Number(weightLbs);
    const h = Number(heightIn);
    const a = Number(age);
    if (!w || !h || !a) return null;
    const weightKg = w / LBS_PER_KG;
    const heightCm = h * 2.54;
    const normGender = normalizeGender(gender);
    // BMR = 10*kg + 6.25*cm - 5*age - 161, then +166 for male (spec equation)
    let bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * a) - 161;
    if (normGender === 'male') bmr += 166;
    const mult = Number(activityMultiplier) || 1.55;
    return Math.round(bmr * mult);
  }

  // The inner getCalorieAdjustment was deleted 2026-04-24 (Bug 19,
  // doc note: "nuke the duplicate getCalorieAdjustment"). The outer
  // top-level getCalorieAdjustment is now the single source of truth
  // and is accessible bare-name from inside this IIFE — line 726's
  // `getCalorieAdjustment(goal)` resolves to it via global scope.
  // The outer switch now recognises the v1.4 enum (race_performance /
  // speed_performance / endurance / general_fitness) so callers
  // passing those values get the correct adjustment.

  function getProteinTarget(goal) {
    return GOAL_PROTEIN_G_PER_LB[normalizeGoal(goal)] ?? 0.7;
  }

  function calorieFloor(gender) {
    return normalizeGender(gender) === 'female' ? 1200 : 1500;
  }

  function enforceFloors(calories, proteinG, gender, weightLbs) {
    const floorCal = calorieFloor(gender);
    const floorProt = weightLbs ? Math.ceil(PROTEIN_FLOOR_G_PER_LB * weightLbs) : 0;
    return {
      calories: Math.max(Math.round(calories || 0), floorCal),
      proteinG: Math.max(Math.round(proteinG || 0), floorProt),
    };
  }

  function isEnduranceSport(sportProfile) {
    return sportProfile === 'endurance' || sportProfile === 'triathlon' || sportProfile === 'hybrid' || sportProfile === 'running';
  }

  function raceDayFueling(classification) {
    if (!classification) return null;
    const profile = classification.sportProfile;
    if (profile === 'hyrox') {
      return 'Hyrox race-day: familiar pre-race meal 2-3h before (low-fat/fiber). Small carb snack 30 min pre. Sip electrolytes, no gels mid-race (too fast to absorb).';
    }
    if (isEnduranceSport(profile)) {
      return '30-60g carbs/hour during events >60 min. Practice fueling in training — nothing new on race day.';
    }
    return null;
  }

  function trainingDayAdjustmentText(classification) {
    const goal = normalizeGoal(classification && classification.goal);
    if (isEnduranceSport(classification && classification.sportProfile) || goal === 'endurance') {
      return 'Add 200-300 cal on high-volume training days; 30-60g carbs/hour for sessions over 60 min.';
    }
    if (goal === 'race_performance') {
      return 'Add 200-300 cal on long or key-quality days; practice race-day nutrition in training.';
    }
    if (goal === 'speed_performance') {
      return 'Add 150-250 cal on interval/tempo days; prioritize carbs pre/post quality sessions.';
    }
    if (goal === 'muscle_gain') {
      return 'Add 200-300 cal on lifting days; keep protein consistent every day.';
    }
    if (goal === 'fat_loss') {
      return 'Add 100-150 cal on training days; keep protein consistent every day.';
    }
    return 'Add 150-200 cal on training days; keep protein consistent every day.';
  }

  function calculate(classification, profile) {
    const c = classification || {};
    const p = profile || {};

    const weightLbs = Number(c.weight != null ? c.weight : p.weight) || 165;
    const heightIn = Number(c.height != null ? c.height : p.height) || 70;
    const age = Number(c.age != null ? c.age : p.age) || 30;
    const gender = normalizeGender(c.gender || p.gender);
    const goal = normalizeGoal(c.goal || p.goal);

    const activityMult = daysToActivityMultiplier(c.daysAvailable || p.availableDaysPerWeek);
    const tdee = calculateTDEE(weightLbs, heightIn, age, gender, activityMult) || 2000;

    const adjustment = getCalorieAdjustment(goal);
    let calories = Math.round(tdee * (1 + adjustment));

    const proteinPerLb = getProteinTarget(goal);
    let proteinG = Math.round(proteinPerLb * weightLbs);

    const floored = enforceFloors(calories, proteinG, gender, weightLbs);
    calories = floored.calories;
    proteinG = floored.proteinG;

    // Fat: ~25% of calories (9 cal/g). Carbs fill remainder.
    const fatG = Math.max(30, Math.round((calories * 0.25) / 9));
    const proteinCals = proteinG * 4;
    const fatCals = fatG * 9;
    const carbsG = Math.max(0, Math.round((calories - proteinCals - fatCals) / 4));

    return {
      dailyTargets: {
        calories,
        proteinG,
        carbsG,
        fatG,
        // Numeric deficit/surplus (decimal form of adjustment) — exposed
        // for UI / tests that want to check direction at a glance.
        calorieAdjustment: adjustment,
      },
      calorieAdjustment: GOAL_ADJUSTMENT_LABEL[goal] || 'Maintenance calories',
      trainingDayAdjustment: trainingDayAdjustmentText(c),
      preWorkout: 'Carb-rich meal 60-90 min before training; smaller snack 30 min before if training fasted feels low-energy.',
      postWorkout: 'Protein + carbs within 2 hours of training to support recovery.',
      raceDayFueling: raceDayFueling(c),
    };
  }

  window.NutritionCalculator = {
    calculate,
    calculateTDEE,
    getCalorieAdjustment,
    getProteinTarget,
    enforceFloors,
    // exposed for validator + tests
    _daysToActivityMultiplier: daysToActivityMultiplier,
    _calorieFloor: calorieFloor,
    _proteinFloorGPerLb: PROTEIN_FLOOR_G_PER_LB,
  };
})();
