// unilateral-display.js — "Is this exercise per-leg / per-arm?" and
// loading-method hints for workout cards.
//
// Problem: a Bulgarian Split Squat card that reads "3 × 12 @ 175 lbs" is
// ambiguous. The 175 could mean a 175 lb barbell, two 87.5 lb dumbbells
// (DB each hand), or a single 175 lb DB. The 12 reps could be total or
// per leg. That ambiguity has led to real users loading way too much
// weight. This module flags unilateral exercises and classifies the
// loading method from exercise-DB equipment tags + weight field hints,
// so the card can render "175 lbs · DB each hand" and "12 reps per leg".
//
// Exposes window.UnilateralDisplay:
//   isUnilateral(name)                 → bool
//   getLoadingMethod(name, weight)     → "barbell" | "DB each hand" |
//                                        "single DB" | "KB each hand" |
//                                        "single KB" | "bodyweight" |
//                                        "machine" | "cable" | ""
//   formatWeightLabel(weight, method)  → "175 lbs · DB each hand" etc.
//   formatRepsLabel(reps, name)        → "12" or "12 per leg" / "per side"

(function (global) {
  "use strict";

  // Name patterns that identify a unilateral movement. Ordering matters
  // only for readability — all are OR'd together in isUnilateral.
  const UNILATERAL_PATTERNS = [
    /bulgarian\s*split\s*squat/i,
    /\bsplit\s*squat\b/i,
    /\bsingle[-\s]?leg\b/i,
    /\bsingle[-\s]?arm\b/i,
    /\bone[-\s]?leg\b/i,
    /\bone[-\s]?arm\b/i,
    /\blunge\b/i,                     // forward / reverse / walking / stationary
    /\bstep[-\s]?up\b/i,
    /\bpistol\s*squat\b/i,
    /\bshrimp\s*squat\b/i,
    /\bcossack\s*squat\b/i,
    /\bcurtsy\s*lunge\b/i,
    /\brear[-\s]?foot[-\s]?elevated\s*split\s*squat\b/i, // RFESS
    /\brfess\b/i,
    /\bskater\s*squat\b/i,
    /\bsingle[-\s]?leg\s*rdl\b/i,
    /\bsl\s*rdl\b/i,
    /\bkickstand\s*rdl\b/i,
    /\bturkish\s*get[-\s]?up\b/i,
    /\brenegade\s*row\b/i,
    /\bsuitcase\s*(carry|deadlift)\b/i,
    /\bstanding\s*(dumbbell|db)\s*single\s*arm/i,
  ];

  // "Per leg" vs "per arm" vs "per side". Order matters — lower-body
  // keywords have to win first, otherwise "Single Leg Hamstring Ball
  // Curl" matches the upper-body `\bcurl\b` regex and gets labeled
  // "per arm" on a hamstring exercise (real bug 2026-05-02). Specific
  // multi-joint patterns (Turkish get-up, renegade row) get "per side".
  function _perLabel(name) {
    const n = String(name || "").toLowerCase();
    if (/\bturkish\s*get-?up\b|\brenegade\s*row\b/.test(n)) return "per side";
    if (/\bleg\b|\bsquat\b|\blunge\b|\bcalf\b|\bhamstring\b|\bglute\b|\bhip\b|\brdl\b|\bdeadlift\b|\bstep[-\s]?up\b|\bbridge\b|\bskater\b|\bkickstand\b/.test(n)) return "per leg";
    if (/\barm\b|\brow\b|\bpress\b|\bcurl\b|\bextension\b|\bpulldown\b/.test(n)) return "per arm";
    return "per leg";
  }

  function isUnilateral(name) {
    if (!name) return false;
    const s = String(name);
    for (const rx of UNILATERAL_PATTERNS) if (rx.test(s)) return true;
    // DB-by-default lookup: some exercise-DB rows flag unilateral
    // explicitly via a name prefix we didn't catch. Fall through to the
    // EXERCISE_DB purpose field as a secondary signal.
    try {
      const db = global.EXERCISE_DB;
      if (Array.isArray(db)) {
        const hit = db.find(e => String(e.name || "").toLowerCase() === s.toLowerCase());
        if (hit && /single[-\s]?leg|unilateral/i.test(String(hit.purpose || ""))) return true;
      }
    } catch {}
    return false;
  }

  // Look up equipment for an exercise name. Case-insensitive, plural-
  // tolerant — mirrors ExerciseRegenerator.findByName's matching rules so
  // "Squats" and "Squat" both resolve. Returns an array of tag strings.
  function _equipmentFor(name) {
    if (!name) return [];
    const db = global.EXERCISE_DB;
    if (!Array.isArray(db)) return [];
    const needle = String(name).toLowerCase().trim().replace(/s$/, "");
    let hit = db.find(e => {
      const n = String(e.name || "").toLowerCase().replace(/s$/, "");
      return n === needle;
    });
    if (!hit) hit = db.find(e => String(e.name || "").toLowerCase().includes(needle));
    if (!hit) return [];
    const out = new Set();
    (hit.equipmentTags || []).forEach(t => out.add(String(t).toLowerCase()));
    (hit.equipmentNeeded || []).forEach(t => out.add(String(t).toLowerCase()));
    return Array.from(out);
  }

  // Loading-method classifier. Uses the weight STRING first (explicit
  // wins — "45 lb barbell" is unambiguous), falls back to the exercise
  // DB equipment tags, then to name hints.
  function getLoadingMethod(name, weight) {
    const n = String(name || "").toLowerCase();
    const w = String(weight || "").toLowerCase();

    // Explicit weight-string hints — user or card author typed the method.
    if (/\bbarbell\b|bar\s*\+/.test(w)) return "barbell";
    if (/\b(each|per)\s*(hand|side|arm)\b/.test(w)) return "DB each hand";
    if (/\bkb\b/.test(w) || /\bkettlebell\b/.test(w)) return "single KB";
    if (/\bgoblet\b/.test(w)) return "single DB";
    if (/bodyweight|\bbw\b/.test(w)) return "bodyweight";

    // Name hints — goblet, single-arm, suitcase → one implement.
    if (/\bgoblet\b/.test(n)) return "single DB";
    if (/\bsuitcase\b/.test(n)) return "single DB";
    if (/\bsingle[-\s]?arm\b/.test(n)) return "single DB";

    // Equipment tags — fall back to the DB.
    const tags = _equipmentFor(name);
    if (tags.includes("barbell")) return "barbell";
    if (tags.includes("dumbbells") || tags.includes("dumbbell")) return "DB each hand";
    if (tags.includes("kettlebell") || tags.includes("kettlebells")) return "KB each hand";
    if (tags.includes("cable-machine") || tags.includes("cable")) return "cable";
    if (tags.includes("machine") || tags.some(t => /machine$/.test(t))) return "machine";

    // Name-keyword inference — runs when the DB lookup didn't match
    // (e.g. coach-typed exercise names like "Front Foot Elevated
    // (plate) Dumbbell Split Squat" that aren't in EXERCISE_DB
    // verbatim). Without this, the next-line fallback turned
    // "50 lbs" into "50 lbs · bodyweight" — contradictory.
    if (/\bdumbbell?s?\b|\bdb\b/.test(n)) return "DB each hand";
    if (/\bbarbell\b/.test(n)) return "barbell";
    if (/\bkettlebell?s?\b|\bkb\b/.test(n)) return "KB each hand";
    if (/\bplate\b/.test(n)) return ""; // plate-loaded — weight stands alone

    // Truly nothing matched. Only call it bodyweight when the weight
    // string is also empty / "BW"-like — a numeric weight + no
    // equipment match means the coach typed an off-DB name with a
    // load, and "bodyweight" would be wrong.
    if (/\d/.test(w)) return "";
    return "bodyweight";
  }

  // "175 lbs · DB each hand". Empty method or empty weight → just returns
  // the weight (so non-unilateral callers get unchanged output). We also
  // strip an explicit "barbell" / "each hand" hint the user already typed,
  // to avoid "175 lbs barbell · barbell" duplication.
  function formatWeightLabel(weight, method) {
    const w = String(weight || "").trim();
    if (!w) return "";
    if (!method) return w;
    // If the user already typed the method into the weight string, don't
    // append it again.
    const already = new RegExp("\\b" + method.replace(/\s+/g, "\\s+").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\b", "i");
    if (already.test(w)) return w;
    // Also catch the short "each hand" / "barbell" forms.
    if (/\b(each|per)\s*(hand|side|arm)\b/i.test(w) && /each/i.test(method)) return w;
    if (/\bbarbell\b/i.test(w) && method === "barbell") return w;
    return w + " · " + method;
  }

  // For unilateral exercises append " per leg"/" per arm". Non-unilateral
  // reps come back unchanged. Caller passes the raw reps string (e.g.
  // "12", "8-10") and the exercise name so we can decide the label.
  // Rep RANGES like "8-12" are flattened to the upper bound — the user
  // prefers a single concrete target, and the working-weight % is
  // already calibrated to the upper end of the range.
  function formatRepsLabel(reps, name) {
    let r = String(reps == null ? "" : reps).trim();
    if (!r) return r;
    const rangeMatch = r.match(/^(\d+)\s*[-\u2013]\s*(\d+)(.*)$/);
    if (rangeMatch) r = (rangeMatch[2] + rangeMatch[3]).trim();
    if (!isUnilateral(name)) return r;
    // Avoid double-suffixing if the raw value already had a "per leg/arm/side" hint.
    if (/\b(per\s+(leg|arm|side|hand)|each\s+(side|leg|arm|hand)|\/\s*(leg|side|arm|hand))\b/i.test(r)) return r;
    return r + " " + _perLabel(name);
  }

  global.UnilateralDisplay = {
    isUnilateral,
    getLoadingMethod,
    formatWeightLabel,
    formatRepsLabel,
    _perLabel,  // exported for test coverage
  };
})(typeof window !== "undefined" ? window : globalThis);
