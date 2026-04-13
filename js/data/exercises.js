// js/data/exercises.js
//
// Shared exercise database for the autocomplete component (and any future
// caller that needs a name + muscle-group list).
//
// Source of truth: philosophy/exercise_library.json — the same file the AI
// plan generator reads. We fetch it once on script eval, cache the result,
// and expose a tiny synchronous accessor + an async loader.
//
// SEED list below adds a small set of common gym exercises that aren't in
// the philosophy library yet (e.g. Cable Crossover, Goblet Squat, Hammer
// Curl variants). Keep it short — the philosophy library is canonical.

(function () {
  "use strict";

  const SEED_EXERCISES = [
    // Common accessories not always in the philosophy library
    { name: "Cable Crossover",        muscleGroup: "Chest" },
    { name: "Pec Deck Fly",           muscleGroup: "Chest" },
    { name: "Incline Dumbbell Press", muscleGroup: "Chest" },
    { name: "Decline Dumbbell Press", muscleGroup: "Chest" },
    { name: "Landmine Press",         muscleGroup: "Shoulders" },
    { name: "Front Raise",            muscleGroup: "Shoulders" },
    { name: "Lateral Raise",          muscleGroup: "Shoulders" },
    { name: "Reverse Pec Deck",       muscleGroup: "Shoulders" },
    { name: "Face Pull",              muscleGroup: "Shoulders" },
    { name: "Cable Lateral Raise",    muscleGroup: "Shoulders" },
    { name: "Hammer Curl",            muscleGroup: "Biceps" },
    { name: "Concentration Curl",     muscleGroup: "Biceps" },
    { name: "Preacher Curl",          muscleGroup: "Biceps" },
    { name: "Spider Curl",            muscleGroup: "Biceps" },
    { name: "Reverse Curl",           muscleGroup: "Biceps" },
    { name: "Tricep Pushdown",        muscleGroup: "Triceps" },
    { name: "Tricep Kickback",        muscleGroup: "Triceps" },
    { name: "Overhead Tricep Extension", muscleGroup: "Triceps" },
    { name: "Close Grip Bench Press", muscleGroup: "Triceps" },
    { name: "Goblet Squat",           muscleGroup: "Quads" },
    { name: "Bulgarian Split Squat",  muscleGroup: "Quads" },
    { name: "Hack Squat",             muscleGroup: "Quads" },
    { name: "Leg Extension",          muscleGroup: "Quads" },
    { name: "Walking Lunges",         muscleGroup: "Quads" },
    { name: "Reverse Lunges",         muscleGroup: "Quads" },
    { name: "Step-ups",               muscleGroup: "Quads" },
    { name: "Hip Thrust",             muscleGroup: "Glutes" },
    { name: "Glute Bridge",           muscleGroup: "Glutes" },
    { name: "Cable Pull-through",     muscleGroup: "Glutes" },
    { name: "Good Morning",           muscleGroup: "Hamstrings" },
    { name: "Lying Leg Curl",         muscleGroup: "Hamstrings" },
    { name: "Seated Leg Curl",        muscleGroup: "Hamstrings" },
    { name: "Single-leg RDL",         muscleGroup: "Hamstrings" },
    { name: "Standing Calf Raise",    muscleGroup: "Calves" },
    { name: "Seated Calf Raise",      muscleGroup: "Calves" },
    { name: "Donkey Calf Raise",      muscleGroup: "Calves" },
    { name: "Plank",                  muscleGroup: "Core" },
    { name: "Side Plank",             muscleGroup: "Core" },
    { name: "Hanging Leg Raise",      muscleGroup: "Core" },
    { name: "Cable Crunch",           muscleGroup: "Core" },
    { name: "Russian Twist",          muscleGroup: "Core" },
    { name: "Pallof Press",           muscleGroup: "Core" },
    { name: "Ab Wheel Rollout",       muscleGroup: "Core" },
    { name: "Chin-up",                muscleGroup: "Back" },
    { name: "Lat Pulldown",           muscleGroup: "Back" },
    { name: "T-Bar Row",              muscleGroup: "Back" },
    { name: "Seated Cable Row",       muscleGroup: "Back" },
    { name: "Single-Arm Dumbbell Row", muscleGroup: "Back" },
    { name: "Pendlay Row",            muscleGroup: "Back" },
    { name: "Meadows Row",            muscleGroup: "Back" },
    // Conditioning / common metcon entries
    { name: "Burpees",                muscleGroup: "Full Body" },
    { name: "Box Jumps",              muscleGroup: "Legs" },
    { name: "Kettlebell Swings",      muscleGroup: "Posterior Chain" },
    { name: "Wall Balls",             muscleGroup: "Full Body" },
    { name: "Thrusters",              muscleGroup: "Full Body" },
    { name: "Devil Press",            muscleGroup: "Full Body" },
    { name: "Renegade Rows",          muscleGroup: "Back" },
    { name: "Mountain Climbers",      muscleGroup: "Core" },
    { name: "Jump Rope",              muscleGroup: "Cardio" },
    { name: "Battle Ropes",           muscleGroup: "Cardio" },
  ];

  let _db = null;
  let _loadPromise = null;

  // Strip everything but lowercase alphanumerics — used for both the search
  // index and the user query so "benchpress" still matches "Bench Press".
  function _searchKey(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function _capitalizeMuscle(s) {
    if (!s) return null;
    return String(s).split("_")[0].replace(/^./, c => c.toUpperCase());
  }

  function _shapeFromPhilosophy(record) {
    return {
      name: record.name,
      muscleGroup: _capitalizeMuscle((record.muscle_groups || [])[0]),
      _searchKey: _searchKey(record.name),
    };
  }

  function _shapeSeed(seed) {
    return {
      name: seed.name,
      muscleGroup: seed.muscleGroup || null,
      _searchKey: _searchKey(seed.name),
    };
  }

  async function loadExerciseDatabase() {
    if (_db) return _db;
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async function () {
      const list = SEED_EXERCISES.map(_shapeSeed);

      try {
        const resp = await fetch("philosophy/exercise_library.json");
        if (resp.ok) {
          const json = await resp.json();
          if (Array.isArray(json)) {
            for (const r of json) {
              if (!r || !r.name) continue;
              list.push(_shapeFromPhilosophy(r));
            }
          }
        }
      } catch {
        // Static JSON not reachable (offline / first install) — fall back to seed only.
      }

      // Dedupe by lowercase name. Keep the first occurrence so seed entries
      // win over philosophy duplicates (their muscleGroup is hand-curated).
      const seen = new Set();
      _db = list.filter(e => {
        const key = String(e.name || "").toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => a.name.localeCompare(b.name));

      return _db;
    })();

    return _loadPromise;
  }

  // Synchronous accessor — returns the cached db or null if not yet loaded.
  // Callers that hit this before the fetch resolves will simply show no
  // suggestions until the next keystroke (graceful no-op).
  function getExerciseDatabase() {
    return _db;
  }

  if (typeof window !== "undefined") {
    window.IronZExerciseDB = {
      load: loadExerciseDatabase,
      get: getExerciseDatabase,
      _searchKey, // exported for the autocomplete component
    };
    // Kick off the fetch immediately so the data is ready by the time the
    // user opens any manual workout form.
    loadExerciseDatabase();
  }
})();
