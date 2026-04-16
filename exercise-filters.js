// exercise-filters.js — query API on top of window.EXERCISE_DB
//
// Single interface the planner / builders use to find exercises.
// Loads after exercise-data.js. See cowork-handoff/EXERCISE_DB_SPEC.md.

(function () {
  "use strict";

  function _db() {
    return Array.isArray(window.EXERCISE_DB) ? window.EXERCISE_DB : [];
  }

  // ── Equipment matching ────────────────────────────────────────────────────
  //
  // Spec §Equipment matching logic + spec §Test checkpoints:
  //
  //   - If user has no equipment profile (or it's empty), no filtering
  //     (full library) — backward compatible for users who haven't yet
  //     completed the equipment onboarding step.
  //   - An exercise's equipmentNeeded is the source of truth. Empty list =
  //     no equipment required, always passes. Otherwise every token in
  //     equipmentNeeded must be present in the user's profile.
  //
  // Note: the literal spec text says "canBeBodyweight === true → always
  // passes" but that conflicts with the test checkpoint requiring a
  // bodyweight-only user to NEVER receive Barbell Back Squat (which has
  // canBeBodyweight: true in the spreadsheet because you can squat
  // unloaded). The spec's INTENT — confirmed by the test — is that
  // equipmentNeeded gates filtering and canBeBodyweight is a UI hint
  // for the builder's bodyweight-mode toggle.
  function _equipmentOk(ex, userEquip) {
    if (!Array.isArray(userEquip) || userEquip.length === 0) return true;
    const needed = Array.isArray(ex.equipmentNeeded) ? ex.equipmentNeeded : [];
    if (needed.length === 0) return true;
    return needed.every(tok => userEquip.includes(tok));
  }

  function _matchesPattern(ex, pattern) {
    if (!pattern) return true;
    if (Array.isArray(pattern)) return pattern.includes(ex.pattern);
    return ex.pattern === pattern;
  }

  function _matchesTier(ex, tier) {
    if (!tier) return true;
    if (Array.isArray(tier)) return tier.includes(ex.tier);
    return ex.tier === tier;
  }

  function _matchesMuscle(ex, muscle) {
    if (!muscle) return true;
    const cats = Array.isArray(ex.muscleCategory) ? ex.muscleCategory : [];
    if (Array.isArray(muscle)) return muscle.some(m => cats.includes(m));
    return cats.includes(muscle);
  }

  function _matchesSheet(ex, sheet) {
    if (!sheet) return true;
    if (Array.isArray(sheet)) return sheet.includes(ex.sheet);
    return ex.sheet === sheet;
  }

  function _matchesSport(ex, sport) {
    if (!sport) return true;
    return ex.sport === sport;
  }

  function _matchesSpecificGoal(ex, specificGoal) {
    if (!specificGoal) return true;
    if (Array.isArray(specificGoal)) return specificGoal.includes(ex.specificGoal);
    return ex.specificGoal === specificGoal;
  }

  function _matchesCommonIn(ex, commonIn) {
    if (!commonIn) return true;
    const tags = Array.isArray(ex.commonIn) ? ex.commonIn : [];
    if (Array.isArray(commonIn)) return commonIn.some(t => tags.includes(t));
    return tags.includes(commonIn);
  }

  // ── query() — core filter ─────────────────────────────────────────────────
  function query(filters) {
    filters = filters || {};
    const excludeIds = new Set(Array.isArray(filters.excludeIds) ? filters.excludeIds : []);
    return _db().filter(ex => {
      if (excludeIds.has(ex.id)) return false;
      if (!_matchesSheet(ex, filters.sheet)) return false;
      if (!_matchesPattern(ex, filters.pattern)) return false;
      if (!_matchesTier(ex, filters.tier)) return false;
      if (!_matchesMuscle(ex, filters.muscle)) return false;
      if (!_matchesSport(ex, filters.sport)) return false;
      if (!_matchesSpecificGoal(ex, filters.specificGoal)) return false;
      if (!_matchesCommonIn(ex, filters.commonIn)) return false;
      // bodyweightOnly: only exercises that need NO equipment, regardless of
      // what the user owns. Used by the bodyweight-only plan generator.
      if (filters.bodyweightOnly) {
        const needed = Array.isArray(ex.equipmentNeeded) ? ex.equipmentNeeded : [];
        if (needed.length > 0) return false;
      }
      // equipment: filter by what the user owns. See _equipmentOk for rules.
      if (filters.equipment !== undefined) {
        if (!_equipmentOk(ex, filters.equipment)) return false;
      }
      // Modality (Circuit sheet) — "bodyweight" / "kettlebell" / "barbell" / etc.
      if (filters.modality && ex.modality !== filters.modality) return false;
      // usesWeights toggle (rarely needed by planner; useful for builder UI)
      if (filters.usesWeights !== undefined && ex.usesWeights !== filters.usesWeights) return false;
      return true;
    });
  }

  // ── pick() — random selection with sub-target diversity ──────────────────
  //
  // Algorithm (spec §Exercise Selection Diversity Rules):
  //   1. query() the matching exercises
  //   2. Group by specificGoal (null goals collect under "_none")
  //   3. Round-robin one pick per group until count satisfied; within a
  //      group, weight tier:primary 2× tier:secondary 2× tier:tertiary
  //   4. After every group is exhausted, allow repeats from already-used
  //      groups (still weighted)
  //
  // diverseFrom: array of exercise objects already picked. Their
  // specificGoal values are excluded from the next pick's group rotation
  // until all other goals are exhausted. This is what powers the
  // "main-compound + secondary + isolation" slot template diversity.
  function pick(filters, count, opts) {
    count = Math.max(1, parseInt(count) || 1);
    opts = opts || {};
    const candidates = query(filters);
    if (!candidates.length) return [];

    // Group by specificGoal
    const groups = {};
    for (const ex of candidates) {
      const key = ex.specificGoal || "_none";
      (groups[key] ||= []).push(ex);
    }
    const groupKeys = Object.keys(groups);

    // Build the diverseFrom exclusion set of specificGoals
    const diverseFromGoals = new Set();
    if (Array.isArray(opts.diverseFrom)) {
      for (const ex of opts.diverseFrom) {
        if (ex && ex.specificGoal) diverseFromGoals.add(ex.specificGoal);
      }
    }

    // Order rotation: groups not in diverseFrom first, then the excluded
    // ones (so we still yield a result if every group is excluded).
    const primaryRotation = groupKeys.filter(k => !diverseFromGoals.has(k));
    const fallbackRotation = groupKeys.filter(k => diverseFromGoals.has(k));
    const rotation = primaryRotation.length ? primaryRotation : fallbackRotation;

    const picked = [];
    const usedIds = new Set();
    let exhausted = false;

    while (picked.length < count && !exhausted) {
      let progressedThisRound = false;
      for (const key of rotation) {
        const pool = (groups[key] || []).filter(e => !usedIds.has(e.id));
        if (!pool.length) continue;
        const choice = _weightedPickByTier(pool);
        if (choice) {
          picked.push(choice);
          usedIds.add(choice.id);
          progressedThisRound = true;
          if (picked.length >= count) break;
        }
      }
      if (!progressedThisRound) {
        // Either every group was empty OR we already picked everything.
        // Fall back to the excluded rotation if we haven't tapped it yet.
        if (rotation === primaryRotation && fallbackRotation.length) {
          // Switch rotation in-place by mutating the array reference target
          rotation.length = 0;
          fallbackRotation.forEach(k => rotation.push(k));
          continue;
        }
        exhausted = true;
      }
    }
    return picked;
  }

  // Tier-weighted random: primary 4×, secondary 2×, tertiary 1× (spec
  // §UI enforcement: "tier === primary → weighted 2× more likely in
  // pick() for compound days"). Squares the weight so primary > secondary
  // > tertiary maintains a clear preference order.
  function _weightedPickByTier(pool) {
    if (!pool.length) return null;
    const weights = pool.map(ex => {
      switch (ex.tier) {
        case "primary":   return 4;
        case "secondary": return 2;
        case "tertiary":  return 1;
        default:          return 2;
      }
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // ── Convenience wrappers ─────────────────────────────────────────────────

  function getByPattern(pattern, options) {
    return query({ ...options, pattern });
  }

  function getByMuscle(muscle, options) {
    return query({ ...options, muscle });
  }

  function getForSport(sport) {
    return query({ sheet: "sport-specific", sport });
  }

  function getHyroxStations() {
    return _db()
      .filter(e => e.isHyroxStation)
      .sort((a, b) => (a.hyroxOrder || 0) - (b.hyroxOrder || 0));
  }

  function getCircuitExercises(options) {
    return query({ ...options, sheet: "circuit" });
  }

  function getById(id) {
    return _db().find(e => e.id === id) || null;
  }

  function getByName(name) {
    if (!name) return null;
    const lower = String(name).trim().toLowerCase();
    return _db().find(e => e.name.toLowerCase() === lower) || null;
  }

  function getAvailable(userEquipment) {
    return query({ equipment: userEquipment });
  }

  // ── Equipment profile helper ─────────────────────────────────────────────
  //
  // Read the user's saved equipment profile. Centralized so callers
  // don't all have to re-implement the localStorage parse + fallback.
  function getUserEquipment() {
    try {
      const raw = localStorage.getItem("equipmentProfile");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }

  // ── Public surface ───────────────────────────────────────────────────────
  window.ExerciseDB = {
    query,
    pick,
    getByPattern,
    getByMuscle,
    getForSport,
    getHyroxStations,
    getCircuitExercises,
    getById,
    getByName,
    getAvailable,
    getUserEquipment,
  };
})();
