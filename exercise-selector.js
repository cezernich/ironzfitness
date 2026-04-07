// exercise-selector.js — IronZ Philosophy Engine: Exercise Selection Module
// Selects exercises from the exercise library for workout sessions.
// Vanilla JS, no imports/exports. All functions globally available.

var exerciseLibrary = [];

/**
 * Load exercise library from Supabase, falling back to localStorage cache, then static JSON.
 */
async function loadExerciseLibrary() {
  // 1. Try Supabase
  if (window.supabaseClient) {
    try {
      var { data, error } = await window.supabaseClient
        .from('exercise_library')
        .select('*')
        .eq('is_active', true);
      if (!error && data && data.length > 0) {
        exerciseLibrary = data;
        try { localStorage.setItem('exerciseLibrary_cache', JSON.stringify(data)); } catch (e) { /* quota */ }
        return exerciseLibrary;
      }
    } catch (e) {
      console.warn('exercise-selector: Supabase fetch failed, trying cache.', e);
    }
  }

  // 2. Try localStorage cache
  try {
    var cached = localStorage.getItem('exerciseLibrary_cache');
    if (cached) {
      var parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        exerciseLibrary = parsed;
        return exerciseLibrary;
      }
    }
  } catch (e) {
    console.warn('exercise-selector: localStorage cache read failed.', e);
  }

  // 3. Fall back to static JSON file
  try {
    var resp = await fetch('philosophy/exercise_library.json');
    if (resp.ok) {
      var json = await resp.json();
      if (Array.isArray(json) && json.length > 0) {
        exerciseLibrary = json;
        try { localStorage.setItem('exerciseLibrary_cache', JSON.stringify(json)); } catch (e) { /* quota */ }
        return exerciseLibrary;
      }
    }
  } catch (e) {
    console.warn('exercise-selector: Static JSON fetch failed.', e);
  }

  console.error('exercise-selector: Could not load exercise library from any source.');
  exerciseLibrary = [];
  return exerciseLibrary;
}


/**
 * Maps equipment access level to an array of available equipment identifiers.
 * "none" means bodyweight only (empty equipment_required exercises).
 * "full_gym" means everything is available.
 */
function getEquipmentList(equipmentAccess) {
  var lists = {
    none: [],
    dumbbells: ['dumbbell'],
    kettlebell: ['kettlebell'],
    home_gym: ['dumbbell', 'kettlebell', 'pull_up_bar', 'bench', 'resistance_band'],
    full_gym: null // null signals "everything available"
  };
  if (!equipmentAccess || !(equipmentAccess in lists)) {
    return null; // default to full_gym behavior
  }
  return lists[equipmentAccess];
}


/**
 * Returns true if the user's equipment covers all of the exercise's equipment_required.
 */
function hasRequiredEquipment(exercise, equipmentAccess) {
  var required = exercise.equipment_required;
  if (!required || required.length === 0) return true; // bodyweight exercise

  var available = getEquipmentList(equipmentAccess);
  if (available === null) return true; // full_gym — everything available

  for (var i = 0; i < required.length; i++) {
    if (available.indexOf(required[i]) === -1) return false;
  }
  return true;
}


/**
 * Maps session type to required movement patterns.
 */
function getRequiredPatterns(sessionType) {
  var patterns = {
    full_body: {
      required: ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'core'],
      optional: ['vertical_push', 'carry']
    },
    upper: {
      required: ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'isolation_arms'],
      optional: []
    },
    lower: {
      required: ['squat', 'hinge', 'isolation_legs', 'core'],
      optional: []
    },
    push: {
      required: ['horizontal_push', 'vertical_push', 'isolation_arms'],
      optional: []
    },
    pull: {
      required: ['horizontal_pull', 'vertical_pull', 'isolation_arms'],
      optional: []
    },
    legs: {
      required: ['squat', 'hinge', 'isolation_legs', 'core'],
      optional: []
    },
    cardio_run: {
      required: ['cardio_run'],
      optional: []
    },
    cardio_bike: {
      required: ['cardio_bike'],
      optional: []
    },
    cardio_swim: {
      required: ['cardio_swim'],
      optional: []
    },
    hiit: {
      required: ['squat', 'hinge', 'horizontal_push', 'core'],
      optional: ['carry']
    },
    mobility: {
      required: ['core'],
      optional: []
    }
  };

  if (!sessionType || !(sessionType in patterns)) {
    return { required: ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'core'], optional: [] };
  }
  return patterns[sessionType];
}


/**
 * Filters the exercise library to only exercises available for this user.
 * Checks: equipment, difficulty, contraindications, is_active.
 */
function filterAvailableExercises(library, profile, classification) {
  if (!library || !Array.isArray(library)) return [];

  var equipAccess = (classification && classification.equipmentAccess) || 'full_gym';
  var level = (classification && classification.level) || 'intermediate';
  var injuries = _extractInjuryKeywords(profile, classification);

  return library.filter(function(ex) {
    // Must be active
    if (!ex.is_active) return false;

    // Equipment check
    if (!hasRequiredEquipment(ex, equipAccess)) return false;

    // Difficulty check: beginners can't use advanced exercises
    if (level === 'beginner' && ex.difficulty === 'advanced') return false;

    // Contraindications check
    if (injuries.length > 0 && ex.contraindications && ex.contraindications.length > 0) {
      for (var i = 0; i < ex.contraindications.length; i++) {
        for (var j = 0; j < injuries.length; j++) {
          if (ex.contraindications[i].toLowerCase().indexOf(injuries[j].toLowerCase()) !== -1 ||
              injuries[j].toLowerCase().indexOf(ex.contraindications[i].toLowerCase()) !== -1) {
            return false;
          }
        }
      }
    }

    return true;
  });
}


/**
 * Extract injury keywords from profile and classification.
 * Returns an array of strings like ["knee", "lower_back"].
 */
function _extractInjuryKeywords(profile, classification) {
  var keywords = [];

  // From classification injuryHistory
  if (classification && classification.injuryHistory && classification.injuryHistory !== 'none') {
    // If there's injury detail in classification, it's a category not a keyword.
    // We still flag it so downstream code is aware, but specific keywords come from profile.
  }

  // From profile injuries (common storage patterns)
  if (profile) {
    var injurySource = profile.injuries || profile.injury || profile.injuryNotes || '';
    if (typeof injurySource === 'string' && injurySource.trim()) {
      // Split on commas, semicolons, "and"
      var parts = injurySource.split(/[,;]|\band\b/i);
      for (var i = 0; i < parts.length; i++) {
        var cleaned = parts[i].trim().toLowerCase().replace(/\s+/g, '_');
        if (cleaned) keywords.push(cleaned);
      }
    } else if (Array.isArray(injurySource)) {
      keywords = keywords.concat(injurySource.map(function(s) { return String(s).trim().toLowerCase(); }));
    }
  }

  return keywords;
}


/**
 * Select one exercise from candidates, preferring given tiers and avoiding recently used.
 * previousExercises: array of exercise IDs recently used (most recent first).
 */
function selectByTier(candidates, preferredTiers, previousExercises) {
  if (!candidates || candidates.length === 0) return null;

  var prev = previousExercises || [];
  var prevSet = {};
  for (var i = 0; i < prev.length; i++) {
    prevSet[prev[i]] = i; // index = recency rank (0 = most recent)
  }

  // Separate candidates into: preferred-tier + not-recent, preferred-tier + recent, other-tier + not-recent, other-tier + recent
  var tiers = preferredTiers || [1, 2, 3];
  var tierSet = {};
  for (var t = 0; t < tiers.length; t++) tierSet[tiers[t]] = true;

  var preferredFresh = [];
  var preferredUsed = [];
  var otherFresh = [];
  var otherUsed = [];

  for (var c = 0; c < candidates.length; c++) {
    var ex = candidates[c];
    var isPreferred = tierSet[ex.tier];
    var isRecent = (ex.id in prevSet);

    if (isPreferred && !isRecent) preferredFresh.push(ex);
    else if (isPreferred && isRecent) preferredUsed.push(ex);
    else if (!isPreferred && !isRecent) otherFresh.push(ex);
    else otherUsed.push(ex);
  }

  // Priority: preferred+fresh > other+fresh > preferred+used (least recent) > other+used (least recent)
  if (preferredFresh.length > 0) return _pickRandom(preferredFresh);
  if (otherFresh.length > 0) return _pickRandom(otherFresh);

  // All have been used recently — pick the least recently used from preferred tier first
  var usedPool = preferredUsed.length > 0 ? preferredUsed : otherUsed;
  if (usedPool.length === 0) usedPool = candidates; // absolute fallback

  // Sort by recency (higher index in prevSet = used longer ago = prefer)
  usedPool.sort(function(a, b) {
    var ra = (a.id in prevSet) ? prevSet[a.id] : 9999;
    var rb = (b.id in prevSet) ? prevSet[b.id] : 9999;
    return rb - ra; // higher index = longer ago = sort first
  });

  return usedPool[0];
}


/**
 * Pick a random element from an array.
 */
function _pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}


/**
 * Main function. Selects exercises for a workout session.
 * Returns array of exercise objects with set/rep prescription attached.
 */
function selectExercises(sessionType, classification, profile, previousExercises) {
  var lib = exerciseLibrary;
  if (!lib || lib.length === 0) {
    console.warn('exercise-selector: exerciseLibrary is empty. Call loadExerciseLibrary() first.');
    return [];
  }

  var available = filterAvailableExercises(lib, profile, classification);
  if (available.length === 0) {
    console.warn('exercise-selector: No available exercises after filtering.');
    return [];
  }

  var patternSpec = getRequiredPatterns(sessionType);
  var requiredPatterns = patternSpec.required || [];
  var optionalPatterns = patternSpec.optional || [];
  var prev = previousExercises || [];

  // Determine preferred tiers based on level
  var level = (classification && classification.level) || 'intermediate';
  var preferredTiers;
  if (level === 'beginner') {
    preferredTiers = [2, 3]; // simpler movements
  } else if (level === 'advanced') {
    preferredTiers = [1, 2]; // compound heavy
  } else {
    preferredTiers = [1, 2]; // intermediate defaults
  }

  // For push/pull isolation_arms, filter by relevant muscle group
  var armFilter = null;
  if (sessionType === 'push') armFilter = 'triceps';
  if (sessionType === 'pull') armFilter = 'biceps';

  var selected = [];

  // Select one exercise per required pattern
  for (var r = 0; r < requiredPatterns.length; r++) {
    var pattern = requiredPatterns[r];
    var candidates = _getCandidatesForPattern(available, pattern, armFilter, selected);
    var pick = selectByTier(candidates, preferredTiers, prev);
    if (pick) {
      selected.push(pick);
    }
  }

  // Try to add one optional pattern exercise if the session is not already long
  var maxExercises = _getMaxExercises(sessionType, classification);
  for (var o = 0; o < optionalPatterns.length && selected.length < maxExercises; o++) {
    var optPattern = optionalPatterns[o];
    var optCandidates = _getCandidatesForPattern(available, optPattern, null, selected);
    var optPick = selectByTier(optCandidates, preferredTiers, prev);
    if (optPick) {
      selected.push(optPick);
    }
  }

  // Attach set/rep prescription to each exercise
  var modules = _getActiveModules(classification);
  var result = [];
  for (var s = 0; s < selected.length; s++) {
    var exCopy = Object.assign({}, selected[s]);
    exCopy.prescription = buildExerciseSet(selected[s], classification, modules);
    result.push(exCopy);
  }

  return result;
}


/**
 * Get candidates matching a movement pattern, excluding already-selected exercises.
 */
function _getCandidatesForPattern(available, pattern, armFilter, alreadySelected) {
  var selectedIds = {};
  for (var i = 0; i < alreadySelected.length; i++) {
    selectedIds[alreadySelected[i].id] = true;
  }

  return available.filter(function(ex) {
    if (selectedIds[ex.id]) return false;
    if (ex.movement_pattern !== pattern) return false;
    // For isolation_arms with a specific muscle target (push=triceps, pull=biceps)
    if (armFilter && ex.muscle_groups && ex.muscle_groups.indexOf(armFilter) === -1) return false;
    return true;
  });
}


/**
 * Determine max exercises for a session based on type and session duration.
 */
function _getMaxExercises(sessionType, classification) {
  var duration = (classification && classification.sessionDuration) || '45-60';

  // Base count by session type
  var baseCounts = {
    full_body: 6,
    upper: 6,
    lower: 5,
    push: 5,
    pull: 5,
    legs: 5,
    cardio_run: 1,
    cardio_bike: 1,
    cardio_swim: 1,
    hiit: 5,
    mobility: 4
  };
  var base = baseCounts[sessionType] || 5;

  // Adjust by duration
  if (duration === '15-30') {
    base = Math.max(2, Math.ceil(base * 0.6));
  } else if (duration === '30-45') {
    base = Math.max(3, Math.ceil(base * 0.8));
  } else if (duration === '60+') {
    base = base + 1;
  }

  return base;
}


/**
 * Determine active modules from classification (used for plan_rules adjustments).
 */
function _getActiveModules(classification) {
  if (!classification) return [];
  // Modules are stored or derived; return what we have
  // In practice, the plan assembly engine will pass these in.
  // For now, derive a basic set.
  var modules = [];
  if (classification.level) modules.push('LEVEL_' + classification.level.toUpperCase());
  if (classification.primaryGoal) modules.push('GOAL_' + classification.primaryGoal.toUpperCase());
  if (classification.sportProfile) modules.push('SPORT_' + classification.sportProfile.toUpperCase());
  return modules;
}


/**
 * Build the set/rep/rest prescription for an exercise.
 * Uses the exercise's defaults, then adjusts based on classification and module rules.
 */
function buildExerciseSet(exercise, classification, modules) {
  var level = (classification && classification.level) || 'intermediate';
  var goal = (classification && classification.primaryGoal) || 'general_health';

  // Parse default_rep_range (e.g., "4-8" -> { min: 4, max: 8 })
  var repRange = _parseRepRange(exercise.default_rep_range || '8-12');
  var restSeconds = exercise.default_rest_seconds || 90;

  // Default sets
  var sets = 3;

  // Adjust by level
  if (level === 'beginner') {
    // Beginners: higher reps, lower intensity, fewer sets
    sets = 2;
    repRange.min = Math.min(repRange.min + 2, 15);
    repRange.max = Math.min(repRange.max + 4, 20);
    restSeconds = Math.max(restSeconds, 90); // at least 90s rest for beginners
  } else if (level === 'advanced') {
    // Advanced: full rep range, more sets
    sets = 4;
    // Keep default rep range
  } else {
    // Intermediate: standard
    sets = 3;
  }

  // Adjust by goal
  if (goal === 'muscle_gain' || goal === 'muscle_building') {
    // Hypertrophy: moderate reps, moderate rest
    if (repRange.max < 8) repRange.max = Math.max(repRange.max, 10);
    restSeconds = Math.min(restSeconds, 120);
    sets = Math.max(sets, 3);
  } else if (goal === 'fat_loss' || goal === 'lose_weight') {
    // Fat loss: higher reps, shorter rest
    repRange.min = Math.max(repRange.min, 8);
    repRange.max = Math.max(repRange.max, 12);
    restSeconds = Math.min(restSeconds, 75);
  } else if (goal === 'performance' || goal === 'strength') {
    // Strength: lower reps, longer rest
    restSeconds = Math.max(restSeconds, 120);
  }

  // Adjust by module rules if present
  if (modules && modules.length > 0) {
    for (var m = 0; m < modules.length; m++) {
      var mod = modules[m];
      // Volume adjustments for specific module rules
      if (mod === 'GOAL_FAT_LOSS' || mod === 'GOAL_LOSE_WEIGHT') {
        restSeconds = Math.min(restSeconds, 60);
      }
      if (mod === 'LEVEL_BEGINNER') {
        sets = Math.min(sets, 2);
      }
    }
  }

  // Cardio exercises get duration-based prescription
  if (exercise.movement_pattern && exercise.movement_pattern.indexOf('cardio_') === 0) {
    return {
      type: 'duration',
      sets: 1,
      duration_minutes: _getCardioDuration(classification),
      intensity: _getCardioIntensity(classification),
      rest_seconds: 0,
      notes: exercise.instructions || ''
    };
  }

  return {
    type: 'sets_reps',
    sets: sets,
    rep_min: repRange.min,
    rep_max: repRange.max,
    rest_seconds: restSeconds,
    notes: exercise.instructions || ''
  };
}


/**
 * Parse a rep range string like "4-8" into { min, max }.
 */
function _parseRepRange(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') return { min: 8, max: 12 };
  var parts = rangeStr.split('-');
  var min = parseInt(parts[0], 10);
  var max = parts.length > 1 ? parseInt(parts[1], 10) : min;
  if (isNaN(min)) min = 8;
  if (isNaN(max)) max = 12;
  return { min: min, max: max };
}


/**
 * Get cardio duration in minutes based on classification.
 */
function _getCardioDuration(classification) {
  if (!classification || !classification.sessionDuration) return 30;
  var durationMap = {
    '15-30': 20,
    '30-45': 30,
    '45-60': 40,
    '60+': 50
  };
  return durationMap[classification.sessionDuration] || 30;
}


/**
 * Get cardio intensity descriptor based on classification.
 */
function _getCardioIntensity(classification) {
  if (!classification) return 'moderate';
  var level = classification.level || 'intermediate';
  var goal = classification.primaryGoal || 'general_health';

  if (goal === 'performance' || goal === 'strength') return 'high';
  if (level === 'beginner') return 'low_to_moderate';
  if (goal === 'fat_loss' || goal === 'lose_weight') return 'moderate_to_high';
  return 'moderate';
}


/**
 * Find a substitute for an exercise the user can't do (injury/equipment).
 * Uses the exercise's substitutions[] field, filtered by what's available.
 */
function getSubstitution(exerciseId, profile, availableExercises) {
  // Find the original exercise in the library
  var original = null;
  for (var i = 0; i < exerciseLibrary.length; i++) {
    if (exerciseLibrary[i].id === exerciseId) {
      original = exerciseLibrary[i];
      break;
    }
  }

  if (!original || !original.substitutions || original.substitutions.length === 0) {
    return null;
  }

  // Build a lookup of available exercise IDs
  var availableIds = {};
  var availableMap = {};
  if (availableExercises && Array.isArray(availableExercises)) {
    for (var a = 0; a < availableExercises.length; a++) {
      availableIds[availableExercises[a].id] = true;
      availableMap[availableExercises[a].id] = availableExercises[a];
    }
  }

  // Try each substitution in order (they are listed by preference)
  for (var s = 0; s < original.substitutions.length; s++) {
    var subId = original.substitutions[s];
    if (availableIds[subId]) {
      return availableMap[subId];
    }
  }

  // No listed substitution is available.
  // Fall back to any available exercise with the same movement pattern.
  if (availableExercises && availableExercises.length > 0) {
    for (var f = 0; f < availableExercises.length; f++) {
      if (availableExercises[f].movement_pattern === original.movement_pattern &&
          availableExercises[f].id !== exerciseId) {
        return availableExercises[f];
      }
    }
  }

  return null;
}
