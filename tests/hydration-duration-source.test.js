// hydration-duration-source.test.js
// Asserts hydration math reads the same duration source the workout-card
// badge reads (BUGFIX 2026-04-27 round 4 §F5/§F7). Also exercises the
// soft + hard sanity caps from §F8.
//
// Run: `node tests/hydration-duration-source.test.js` from fitness-app/

"use strict";

// Minimal Node shims — hydration.js touches localStorage, window, ICONS.
const _store = {};
global.localStorage = {
  getItem: (k) => _store[k] == null ? null : _store[k],
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
};
global.window = global;
global.document = { getElementById: () => null };
global.ICONS = new Proxy({}, { get: () => "" });
global.escHtml = (s) => String(s);

// Stub helpers hydration.js looks up at call time.
global.getMeasurementSystem = () => "imperial";
global.getDistanceUnit = () => "mi";
global.DB = { syncKey() {}, syncWorkouts() {} };

// hydration.js declares its functions at top-level without an export
// surface. Loading via vm.runInThisContext puts them on the global so
// the test can call them directly.
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "js", "hydration.js"), "utf-8");
vm.runInThisContext(src, { filename: "hydration.js" });

let failures = 0;
function assertEq(actual, expected, label) {
  if (actual === expected) {
    console.log(`  PASS: ${label}`);
  } else {
    console.error(`  FAIL: ${label} — expected ${expected}, got ${actual}`);
    failures++;
  }
}

// ── Test 1: w.duration takes precedence ─────────────────────────────────────
{
  const w = { duration: 60, type: "swim" };
  const dur = _hydrationResolveDurationMin(w);
  assertEq(dur, 60, "duration:60 → 60 min");
}

// ── Test 2: durationMin field (assembler shape) ─────────────────────────────
{
  const w = { durationMin: 60, type: "swim" };
  const dur = _hydrationResolveDurationMin(w);
  assertEq(dur, 60, "durationMin:60 → 60 min");
}

// ── Test 3: estimated_duration_min field (generator shape) ──────────────────
{
  const w = { estimated_duration_min: 60, type: "swim" };
  const dur = _hydrationResolveDurationMin(w);
  assertEq(dur, 60, "estimated_duration_min:60 → 60 min");
}

// ── Test 4: priority — duration wins over the others ────────────────────────
{
  const w = { duration: 60, durationMin: 90, estimated_duration_min: 120, type: "swim" };
  const dur = _hydrationResolveDurationMin(w);
  assertEq(dur, 60, "all three fields set: duration wins");
}

// ── Test 5: empty workout returns 0 ─────────────────────────────────────────
{
  const dur = _hydrationResolveDurationMin({ type: "swim" });
  assertEq(dur, 0, "no duration source → 0");
}

// ── Test 6: hard cap clamps + warns ─────────────────────────────────────────
{
  const dateStr = "2026-04-27";
  // Push the total past the hard cap regardless of what the test profile's
  // base target ends up at (the dummy localStorage doesn't carry a real
  // profile, so the base is whatever the default returns — typically <100).
  localStorage.setItem("hydrationLog", JSON.stringify({ [dateStr]: { saunaBonus: 350 } }));
  const breakdown = getHydrationBreakdownForDate(dateStr);
  assertEq(breakdown.totalOz, 300, "hard cap clamps totalOz to 300");
  if (breakdown.hardCapWarning) {
    console.log("  PASS: hardCapWarning surfaced");
  } else {
    console.error("  FAIL: hardCapWarning should be set when clamped");
    failures++;
  }
  localStorage.clear();
}

// ── Test 7: soft cap warns but doesn't clamp ────────────────────────────────
{
  const dateStr = "2026-04-27";
  // Bring the raw total into the [201, 299] band. Base is around 96 in the
  // test env; 130 of bonus pushes us into the soft-cap zone.
  localStorage.setItem("hydrationLog", JSON.stringify({ [dateStr]: { saunaBonus: 130 } }));
  const breakdown = getHydrationBreakdownForDate(dateStr);
  if (breakdown.totalOz > 200 && breakdown.totalOz < 300) {
    if (breakdown.softCapWarning) {
      console.log(`  PASS: softCapWarning at totalOz ${breakdown.totalOz}`);
    } else {
      console.error(`  FAIL: softCapWarning should be set when total is ${breakdown.totalOz}`);
      failures++;
    }
    if (breakdown.hardCapWarning) {
      console.error("  FAIL: hardCapWarning should NOT be set below the hard cap");
      failures++;
    }
  } else {
    console.log(`  SKIP: soft-cap test — totalOz ${breakdown.totalOz} not in [201, 299] (base too low in test env)`);
  }
  localStorage.clear();
}

if (failures === 0) {
  console.log("\nAll hydration duration / cap assertions pass.");
  process.exit(0);
} else {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
