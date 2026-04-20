// exercise-regenerator.js — "Swap this exercise for another hitting the
// same muscle group." Used from the workout editor's per-exercise regen
// button. Pulls candidates from window.EXERCISE_DB, matches on primary
// muscles first, then movement pattern, then equipment availability.
//
// Exposes:
//   ExerciseRegenerator.findAlternatives(name, opts) → [{ name, reason }...]
//   ExerciseRegenerator.regenerate(name, opts)       → { name, reason } | null
//   regenerateEditRow(id)                            → in-place swap on an
//                                                      .edit-exercise-row
//
// Pattern-match first-result-wins, with randomization among ties so pressing
// the button multiple times cycles through plausible swaps.

(function (global) {
  "use strict";

  // Look up an exercise by display name. Case-insensitive; tolerates plural
  // "Squats" → "Squat". Falls back to a substring search if no exact hit so
  // user-typed variants ("Barbell Bench Press" vs "Bench Press") still work.
  function findByName(name) {
    if (!name || typeof name !== "string") return null;
    const db = global.EXERCISE_DB;
    if (!Array.isArray(db)) return null;
    const needle = name.toLowerCase().trim().replace(/s$/, "");
    // Exact name match (plural-tolerant)
    const exact = db.find(e => {
      const n = String(e.name || "").toLowerCase().replace(/s$/, "");
      return n === needle;
    });
    if (exact) return exact;
    // Substring — user types "Bench" expecting "Barbell Bench Press".
    const sub = db.find(e => String(e.name || "").toLowerCase().includes(needle));
    return sub || null;
  }

  // Parse "Quads, Glutes, Hamstrings" → ["quads","glutes","hamstrings"].
  function parseMuscles(primaryMuscles) {
    if (!primaryMuscles) return [];
    return String(primaryMuscles)
      .toLowerCase()
      .split(/[,/]/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  // Score an exercise's relevance as a swap for the source. Higher = better
  // match. 0 = not a valid swap.
  function scoreCandidate(src, cand) {
    if (!src || !cand) return 0;
    if (cand.id === src.id) return 0;
    if (String(cand.name).toLowerCase() === String(src.name).toLowerCase()) return 0;

    let score = 0;

    // Primary-muscle overlap is the strongest signal — "hamstring" swap
    // should give another hamstring exercise, not a back one.
    const srcMuscles  = parseMuscles(src.primaryMuscles);
    const candMuscles = parseMuscles(cand.primaryMuscles);
    const muscleOverlap = srcMuscles.filter(m => candMuscles.includes(m));
    if (muscleOverlap.length === 0) {
      // Fall back to muscleCategory (e.g., ["legs"]) — broader but still
      // relevant when primaryMuscles data is missing.
      const srcCat  = Array.isArray(src.muscleCategory) ? src.muscleCategory : [];
      const candCat = Array.isArray(cand.muscleCategory) ? cand.muscleCategory : [];
      const catOverlap = srcCat.filter(c => candCat.includes(c));
      if (catOverlap.length === 0) return 0;
      score += catOverlap.length * 2;
    } else {
      score += muscleOverlap.length * 10;
    }

    // Same movement pattern (squat / hinge / push / pull / carry / lunge /
    // core) earns a bonus — a hamstring-hinge swap should prefer another
    // hinge over a Nordic curl.
    if (src.pattern && cand.pattern && src.pattern === cand.pattern) {
      score += 5;
    }

    // Tier preference — prefer primary-for-primary swaps. Downrank tier
    // mismatches instead of excluding them so tiny muscle groups still
    // have candidates.
    if (src.tier && cand.tier && src.tier !== cand.tier) score -= 1;

    return score;
  }

  // Filter by available equipment when the caller supplies a list. Bodyweight
  // and exercises with no required equipment always pass.
  function isEquipmentAvailable(cand, availableEquipment) {
    if (!availableEquipment || !Array.isArray(availableEquipment)) return true;
    const needed = Array.isArray(cand.equipmentNeeded) ? cand.equipmentNeeded : [];
    if (needed.length === 0) return true;
    if (cand.canBeBodyweight) return true;
    return needed.every(eq => availableEquipment.includes(eq));
  }

  // Return the full ranked list of swap candidates. Useful for UIs that
  // want to show alternatives, or for testing.
  function findAlternatives(name, opts) {
    opts = opts || {};
    const src = findByName(name);
    if (!src) return [];
    const db = global.EXERCISE_DB || [];
    const scored = [];
    db.forEach(cand => {
      if (!isEquipmentAvailable(cand, opts.availableEquipment)) return;
      const score = scoreCandidate(src, cand);
      if (score > 0) scored.push({ exercise: cand, score });
    });
    // Exclude anything in opts.exclude (typically recent swaps)
    const excludeSet = new Set((opts.exclude || []).map(s => String(s).toLowerCase()));
    const filtered = scored.filter(s => !excludeSet.has(String(s.exercise.name).toLowerCase()));
    // Sort descending by score; stable ties broken by name for determinism.
    filtered.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.exercise.name).localeCompare(String(b.exercise.name));
    });
    return filtered;
  }

  // Pick a swap. Randomizes among the top tier so pressing regenerate
  // repeatedly gives variety, not the same answer.
  function regenerate(name, opts) {
    const alts = findAlternatives(name, opts);
    if (!alts.length) return null;
    // Top tier = candidates within 3 points of the highest score, so high-
    // confidence matches are preferred but we still cycle.
    const topScore = alts[0].score;
    const tier = alts.filter(a => a.score >= topScore - 3);
    const pick = tier[Math.floor(Math.random() * tier.length)];
    const src = findByName(name);
    // Human-readable reason so the UI can show "Same muscle: quads" etc.
    const srcMuscles = parseMuscles(src && src.primaryMuscles);
    const candMuscles = parseMuscles(pick.exercise.primaryMuscles);
    const sharedMuscles = srcMuscles.filter(m => candMuscles.includes(m));
    const reason = sharedMuscles.length
      ? `same muscle: ${sharedMuscles.join(", ")}`
      : (src && src.pattern ? `same pattern: ${src.pattern}` : "same muscle group");
    return { name: pick.exercise.name, reason, exercise: pick.exercise };
  }

  // Per-row recency memory so spamming the button doesn't repeat the same
  // swap. Keyed by the editor row id.
  const _recentByRow = {};
  function _pushRecent(rowId, name) {
    if (!_recentByRow[rowId]) _recentByRow[rowId] = [];
    _recentByRow[rowId].push(name);
    // Keep memory short — last 5 swaps. Long enough to notice a repeat,
    // short enough to not run out of candidates for small muscle groups.
    while (_recentByRow[rowId].length > 5) _recentByRow[rowId].shift();
  }

  // In-place swap handler for the workout editor. Reads the row's name
  // input, regenerates, updates the name + weight, flashes a toast hint.
  function regenerateEditRow(rowId) {
    const nameInput = document.getElementById("edit-ex-" + rowId);
    if (!nameInput) return;
    const currentName = (nameInput.value || "").trim();
    if (!currentName) return;

    // Build exclude list: current name + prior swaps from this row.
    const exclude = [currentName].concat(_recentByRow[rowId] || []);
    const result = regenerate(currentName, { exclude });
    if (!result) {
      _flashRowMessage(rowId, "No alternatives found for that exercise.");
      return;
    }
    nameInput.value = result.name;

    // Re-derive weight for the new exercise. A pure name swap leaves
    // the old weight — e.g. Front Squat 185 → Bulgarian Split Squat 185
    // would be crushingly heavy because Bulgarians scale at 0.50× of back
    // squat. Piping through _personalizeWeights picks up the new
    // accessoryScale factor automatically. If the user has no strength
    // zones entered, _personalizeWeights returns the row unchanged and
    // we leave the weight as-is.
    const repsInput   = document.getElementById("edit-reps-" + rowId);
    const weightInput = document.getElementById("edit-wt-"   + rowId);
    if (repsInput && weightInput && typeof global._personalizeWeights === "function") {
      try {
        const reps = String(repsInput.value || "").trim();
        if (reps) {
          const repsInt = parseInt(reps, 10);
          const repsForCalc = Number.isFinite(repsInt) && repsInt > 0 ? repsInt : reps;
          const scaled = global._personalizeWeights([{
            name: result.name,
            reps: repsForCalc,
            weight: "",
          }]);
          const newWeight = (scaled && scaled[0] && scaled[0].weight) || "";
          // Only overwrite when _personalizeWeights actually produced a
          // number — otherwise leave the existing weight (user may have
          // typed their own value we shouldn't wipe).
          if (newWeight && /\d/.test(newWeight)) {
            weightInput.value = newWeight;
            weightInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      } catch (e) { /* leave weight alone on any calc error */ }
    }

    // Fire input event on the name so autocomplete / weight-toggle
    // handlers wired to the name field run.
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    _pushRecent(rowId, result.name);
    _flashRowMessage(rowId, `Swapped — ${result.reason}`);
  }

  function _flashRowMessage(rowId, msg) {
    const row = document.getElementById("edit-row-" + rowId);
    if (!row) return;
    let toast = row.querySelector(".ex-row-regen-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "ex-row-regen-toast";
      toast.style.cssText = "font-size:0.75em;color:var(--color-text-muted,#64748b);margin-top:4px;padding:2px 0;font-style:italic";
      row.appendChild(toast);
    }
    toast.textContent = msg;
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { if (toast) toast.textContent = ""; }, 2500);
  }

  global.ExerciseRegenerator = {
    findByName, parseMuscles, findAlternatives, regenerate,
  };
  global.regenerateEditRow = regenerateEditRow;
})(typeof window !== "undefined" ? window : globalThis);
