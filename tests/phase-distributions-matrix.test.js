// tests/phase-distributions-matrix.test.js
// Locks the level-aware distribution matrix against the spec numbers pulled
// from PLAN_GENERATOR_MASTER_SPEC §4a / §4b / §3a-ii. If anyone tweaks the
// matrix, this test catches drift.
//
// Run: node tests/phase-distributions-matrix.test.js

"use strict";
global.window = global;

const PSD = require("../js/plan-session-distribution.js");

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`); }
}
function section(t) { console.log("\n" + t); }
function sum(d) { return Object.values(d || {}).reduce((s, n) => s + n, 0); }

section("Triathlon — §4a exact advanced tables");
{
  const T = PSD.PHASE_DISTRIBUTIONS_BY_LEVEL.triathlon;
  check("Base × advanced = 2/2/3/2/0 = 9", JSON.stringify(T.Base.advanced) === JSON.stringify({ swim: 2, bike: 2, run: 3, strength: 2, brick: 0 }));
  check("Build × advanced = 3/3/2/1/1 = 10 (corrected from 3/3/3/1/0)", JSON.stringify(T.Build.advanced) === JSON.stringify({ swim: 3, bike: 3, run: 2, strength: 1, brick: 1 }));
  check("Peak × advanced = 3/3/3/1/1 = 11", JSON.stringify(T.Peak.advanced) === JSON.stringify({ swim: 3, bike: 3, run: 3, strength: 1, brick: 1 }));
  check("Taper × advanced = 2/2/2/0/0 = 6", JSON.stringify(T.Taper.advanced) === JSON.stringify({ swim: 2, bike: 2, run: 2, strength: 0, brick: 0 }));
  check("advanced totals (9,10,11,6) match §4a", sum(T.Base.advanced) === 9 && sum(T.Build.advanced) === 10 && sum(T.Peak.advanced) === 11 && sum(T.Taper.advanced) === 6);
}

section("Triathlon — §3a-ii level ranges (Base and Build)");
{
  const T = PSD.PHASE_DISTRIBUTIONS_BY_LEVEL.triathlon;
  const baseBeg = sum(T.Base.beginner);
  const baseInt = sum(T.Base.intermediate);
  const baseAdv = sum(T.Base.advanced);
  check(`Base beginner in 5-6 range (got ${baseBeg})`, baseBeg >= 5 && baseBeg <= 6);
  check(`Base intermediate in 6-7 range (got ${baseInt})`, baseInt >= 6 && baseInt <= 7);
  check(`Base advanced in 8-9 range (got ${baseAdv})`, baseAdv >= 8 && baseAdv <= 9);

  const buildBeg = sum(T.Build.beginner);
  const buildInt = sum(T.Build.intermediate);
  const buildAdv = sum(T.Build.advanced);
  check(`Build beginner in 5-7 range (got ${buildBeg})`, buildBeg >= 5 && buildBeg <= 7);
  check(`Build intermediate in 6-8 range (got ${buildInt})`, buildInt >= 6 && buildInt <= 8);
  check(`Build advanced in 9-11 range (got ${buildAdv})`, buildAdv >= 9 && buildAdv <= 11);
}

section("Triathlon — §3a-ii brick timing rules");
{
  const T = PSD.PHASE_DISTRIBUTIONS_BY_LEVEL.triathlon;
  // Base: bricks "every 1-2 weeks" — encoded as 0 per-week for the
  // mid-rate case (the aligner will insert every other week separately
  // when that feature lands).
  check("Base has no weekly brick for any level (§4a: every 1-2 wks)", T.Base.beginner.brick === 0 && T.Base.intermediate.brick === 0 && T.Base.advanced.brick === 0);
  // Beginner Build: "NOT until late Build" → 0 in the weekly target.
  check("Build × beginner: no brick (§3a-ii late-Build only)", T.Build.beginner.brick === 0);
  // Intermediate Build: "mid-Build" → 1 in the weekly target.
  check("Build × intermediate: 1 brick (§3a-ii mid-Build)", T.Build.intermediate.brick === 1);
  // Advanced Build: §4a table includes brick weekly.
  check("Build × advanced: 1 brick (§4a exact)", T.Build.advanced.brick === 1);
  // Taper: no bricks any level (§4a-ii "1 total (first week of taper ONLY)"
  // — not a steady-state weekly target, managed by the aligner as a one-off).
  check("Taper has no weekly brick for any level", T.Taper.beginner.brick === 0 && T.Taper.intermediate.brick === 0 && T.Taper.advanced.brick === 0);
}

section("Triathlon — §3a-ii strength rule");
{
  const T = PSD.PHASE_DISTRIBUTIONS_BY_LEVEL.triathlon;
  // "Beginner 1-2× / Intermediate 2× / Advanced 2×" with strength
  // "drops to 1×" in Build/Peak per §4a.
  check("Base × beginner: 1 strength", T.Base.beginner.strength === 1);
  check("Base × intermediate: 1-2 strength", T.Base.intermediate.strength >= 1 && T.Base.intermediate.strength <= 2);
  check("Base × advanced: 2 strength (§4a exact)", T.Base.advanced.strength === 2);
  check("Build × advanced: 1 strength (§4a: drops to 1×)", T.Build.advanced.strength === 1);
  check("Taper × any: 0 strength (§4a: NO strength)", T.Taper.beginner.strength === 0 && T.Taper.intermediate.strength === 0 && T.Taper.advanced.strength === 0);
}

section("Running — §4b session-list ranges");
{
  const R = PSD.PHASE_DISTRIBUTIONS_BY_LEVEL.running;
  // Base: 6-7 sessions (§4b)
  check(`Run Base × advanced in 6-7 range (got ${sum(R.Base.advanced)})`, sum(R.Base.advanced) >= 6 && sum(R.Base.advanced) <= 7);
  // Build: 6-8 sessions
  check(`Run Build × advanced in 6-8 range (got ${sum(R.Build.advanced)})`, sum(R.Build.advanced) >= 6 && sum(R.Build.advanced) <= 8);
  // Peak: 5-6 sessions
  check(`Run Peak × advanced in 5-6 range (got ${sum(R.Peak.advanced)})`, sum(R.Peak.advanced) >= 5 && sum(R.Peak.advanced) <= 6);
  // Taper: 3-4 sessions
  check(`Run Taper × advanced in 3-4 range (got ${sum(R.Taper.advanced)})`, sum(R.Taper.advanced) >= 3 && sum(R.Taper.advanced) <= 4);
}

section("getDistribution() lookup behavior");
{
  const baseAdv = PSD.getDistribution("triathlon", "Base", "advanced");
  check("advanced lookup hits exact row", baseAdv && baseAdv.run === 3);
  const baseMissing = PSD.getDistribution("triathlon", "Base", "zzz-unknown");
  check("unknown level falls back to intermediate", baseMissing && baseMissing.run === 2);
  const unknownPhase = PSD.getDistribution("triathlon", "WhoKnows", "advanced");
  check("unknown phase returns null", unknownPhase === null);
}

section("Back-compat flat table derives from intermediate");
{
  const flat = PSD.PHASE_DISTRIBUTIONS;
  const expected = PSD.PHASE_DISTRIBUTIONS_BY_LEVEL.triathlon.Base.intermediate;
  check("flat triathlon.Base equals intermediate row", JSON.stringify(flat.triathlon.Base) === JSON.stringify(expected));
}

console.log(`\n${"=".repeat(60)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  ✗ ${f.name}${f.detail ? "  → " + f.detail : ""}`));
  process.exit(1);
}
console.log(`${"=".repeat(60)}`);
