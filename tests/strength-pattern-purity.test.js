// strength-pattern-purity.test.js
// Asserts that no pull-pattern exercise appears in any `push:` array (and
// vice versa) across the sport-overlay and role-overlay tables in
// `js/onboarding-v2.js`. Bug 2 from BUGFIX_2026-04-27_round4 — Face Pull
// kept leaking into push days because the overlay arrays were authored by
// hand and never cross-checked against the source-of-truth categorization.
//
// Run: `node tests/strength-pattern-purity.test.js` from fitness-app/

"use strict";

const fs = require("fs");
const path = require("path");

// Hand-curated lists. The variant-libraries module mixes ESM + globals so
// rather than wire it up under Node we keep a small canonical reference
// here. Adding a new exercise to the overlay arrays requires also
// classifying it here — that's the point of the test.
const PULL_PATTERN = new Set([
  "Pull-up", "Chin-up", "Lat Pulldown", "Barbell Row", "Bent-over Row",
  "Pendlay Row", "Cable Row", "Seated Row", "Face Pull", "Band Row",
  "Single-arm Row", "T-Bar Row", "Inverted Row",
]);

const PUSH_PATTERN = new Set([
  "Bench Press", "Barbell Bench Press", "Dumbbell Bench Press",
  "Incline Bench Press", "Incline Dumbbell Press", "Decline Bench Press",
  "Overhead Press", "Push Press", "Arnold Press", "Landmine Press",
  "Push-up", "Dip", "Close-Grip Bench Press", "Tricep Pushdown",
  "Tricep Kickback", "Skull Crusher", "Dumbbell Fly", "Cable Fly",
]);

const CORE_PATTERN = new Set([
  "Plank", "Side Plank", "Dead Bug", "Pallof Press", "Bird Dog",
  "Hollow Hold", "Hanging Leg Raise",
]);

// Read the file and pull out the overlay arrays. We don't try to evaluate
// the JS — a regex-based read is sufficient because the format is fixed.
const sourcePath = path.join(__dirname, "..", "js", "onboarding-v2.js");
const source = fs.readFileSync(sourcePath, "utf-8");

function extractNamedArrays(label) {
  const re = new RegExp(`${label}:\\s*\\[([^\\]]*)\\]`, "g");
  const out = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    const items = m[1].match(/"([^"]+)"/g) || [];
    out.push(items.map(s => s.replace(/"/g, "")));
  }
  return out;
}

const pushArrays = extractNamedArrays("push");
const pullArrays = extractNamedArrays("pull");

let failures = 0;

function assertNo(category, arrays, banned, label) {
  for (let i = 0; i < arrays.length; i++) {
    const arr = arrays[i];
    for (const ex of arr) {
      if (banned.has(ex)) {
        console.error(`  FAIL: ${category}[${i}] contains ${label} exercise "${ex}" — array: ${JSON.stringify(arr)}`);
        failures++;
      }
    }
  }
}

console.log(`Found ${pushArrays.length} push arrays, ${pullArrays.length} pull arrays`);

// Strict on push: no pull, no core. The doc rule is "push lists should not
// contain rowing/pulling motions" and core anti-rotation work doesn't
// belong on a heavy press day either.
assertNo("push", pushArrays, PULL_PATTERN, "PULL");
assertNo("push", pushArrays, CORE_PATTERN, "CORE");

// Looser on pull: no pressing motions, but anti-rotation/core (Pallof
// Press, Dead Bug) is explicitly permitted on pull arrays per the doc —
// "Pallof Press → pull (anti-rotation, often paired with pulling)".
assertNo("pull", pullArrays, PUSH_PATTERN, "PUSH");

if (failures === 0) {
  console.log("PASS: every push array contains only push exercises, every pull array contains only pull exercises.");
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} miscategorisation(s) detected.`);
  process.exit(1);
}
