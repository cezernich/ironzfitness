// diversification-deterministic-tests.js
// Phase 3 checkpoint: prove the deterministic fallback alone produces correct
// 12-week rotations across every modality BEFORE any AI code is involved.
//
// Run: `node diversification-deterministic-tests.js`

global.window = global;
global.module = module;
require("./js/variant-libraries/run.js");
require("./js/variant-libraries/bike.js");
require("./js/variant-libraries/swim.js");
require("./js/variant-libraries/strength.js");
require("./js/variant-libraries/hybrid.js");
require("./js/variant-libraries/index.js");
require("./js/deterministic-variant-rotation.js");

const VL  = window.VariantLibraries;
const DVR = window.DeterministicVariantRotation;

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`); }
}
function section(t) { console.log("\n" + t); }

// ─── 1. Library sanity ───────────────────────────────────────────────────────
section("1. Variant libraries loaded with non-empty variants");
{
  check("RUN library loaded", !!window.VARIANT_LIBRARY_RUN);
  check("BIKE library loaded", !!window.VARIANT_LIBRARY_BIKE);
  check("SWIM library loaded", !!window.VARIANT_LIBRARY_SWIM);
  check("STRENGTH library loaded", !!window.VARIANT_LIBRARY_STRENGTH);
  check("HYBRID library loaded", !!window.VARIANT_LIBRARY_HYBRID);
  check("RUN.track_workout has 6 variants", window.VARIANT_LIBRARY_RUN.variants.track_workout.length === 6);
  check("BIKE.bike_intervals_ftp has 5 variants", window.VARIANT_LIBRARY_BIKE.variants.bike_intervals_ftp.length === 5);
  check("SWIM.swim_css_intervals has 5 variants", window.VARIANT_LIBRARY_SWIM.variants.swim_css_intervals.length === 5);
  check("STRENGTH.accessory_quad has 5 variants", window.VARIANT_LIBRARY_STRENGTH.variants.accessory_quad.length === 5);
  check("HYBRID.hybrid_metcon has 5 variants", window.VARIANT_LIBRARY_HYBRID.variants.hybrid_metcon.length === 5);
  check("STRENGTH library has compound_lift_policy", !!window.VARIANT_LIBRARY_STRENGTH.compound_lift_policy);
  check("STRENGTH library has compound_chains for 5 lifts",
    Object.keys(window.VARIANT_LIBRARY_STRENGTH.compound_chains).length === 5);
}

// ─── 2. 12-week deterministic rotation per modality ──────────────────────────
section("2. 12-week deterministic rotation — RUN track_workout");
{
  const variants = VL.getLibraryFor("run", "track_workout");
  const rotation = DVR.rotateForWeeks(variants, 12);
  console.log(`     ${rotation.map(r => r.variantId).join(" → ")}`);
  check("12 weeks of picks", rotation.length === 12);
  // All picks must reference real ids
  const ids = new Set(variants.map(v => v.id));
  check("every pick is a real variant id", rotation.every(r => ids.has(r.variantId)));
  // No back-to-back repeat of the same variant
  let backToBack = false;
  for (let i = 1; i < rotation.length; i++) {
    if (rotation[i].variantId === rotation[i - 1].variantId) backToBack = true;
  }
  check("no back-to-back identical variants", !backToBack);
  // No repeat within the rotation window (last 2 weeks)
  let staleHit = false;
  for (let i = 2; i < rotation.length; i++) {
    if (rotation[i].variantId === rotation[i - 1].variantId
      || rotation[i].variantId === rotation[i - 2].variantId) staleHit = true;
  }
  check("no variant appears within the 2-week rotation window", !staleHit);
  // Coverage: 12 weeks across 6 variants → every variant should appear
  const distinct = new Set(rotation.map(r => r.variantId));
  check("all 6 variants used over 12 weeks", distinct.size === 6, `got ${distinct.size}`);
}

section("3. 12-week deterministic rotation — RUN tempo_threshold (5 variants)");
{
  const variants = VL.getLibraryFor("run", "tempo_threshold");
  const rotation = DVR.rotateForWeeks(variants, 12);
  console.log(`     ${rotation.map(r => r.variantId).join(" → ")}`);
  check("12 picks", rotation.length === 12);
  check("all 5 distinct variants used", new Set(rotation.map(r => r.variantId)).size === 5);
}

section("4. 12-week deterministic rotation — BIKE bike_intervals_ftp (5 variants)");
{
  const variants = VL.getLibraryFor("bike", "bike_intervals_ftp");
  const rotation = DVR.rotateForWeeks(variants, 12);
  console.log(`     ${rotation.map(r => r.variantId).join(" → ")}`);
  check("12 picks", rotation.length === 12);
  check("no back-to-back identical variants", (() => {
    for (let i = 1; i < rotation.length; i++) if (rotation[i].variantId === rotation[i-1].variantId) return false;
    return true;
  })());
  check("all 5 distinct variants used", new Set(rotation.map(r => r.variantId)).size === 5);
}

section("5. 12-week deterministic rotation — SWIM swim_css_intervals (5 variants)");
{
  const variants = VL.getLibraryFor("swim", "swim_css_intervals");
  const rotation = DVR.rotateForWeeks(variants, 12);
  console.log(`     ${rotation.map(r => r.variantId).join(" → ")}`);
  check("12 picks", rotation.length === 12);
  check("all 5 distinct variants used", new Set(rotation.map(r => r.variantId)).size === 5);
}

section("6. 12-week deterministic rotation — STRENGTH accessory_quad (5 variants)");
{
  const variants = VL.getLibraryFor("strength", "accessory_quad");
  const rotation = DVR.rotateForWeeks(variants, 12);
  console.log(`     ${rotation.map(r => r.variantId).join(" → ")}`);
  check("12 picks", rotation.length === 12);
  check("all 5 distinct variants used", new Set(rotation.map(r => r.variantId)).size === 5);
}

section("7. 12-week deterministic rotation — HYBRID hybrid_metcon (5 variants)");
{
  const variants = VL.getLibraryFor("hybrid", "hybrid_metcon");
  const rotation = DVR.rotateForWeeks(variants, 12);
  console.log(`     ${rotation.map(r => r.variantId).join(" → ")}`);
  check("12 picks", rotation.length === 12);
  check("all 5 distinct variants used", new Set(rotation.map(r => r.variantId)).size === 5);
}

// ─── 3. Experience filter ────────────────────────────────────────────────────
section("8. Experience filter excludes intermediate-only variants for beginners");
{
  const variants = VL.getLibraryFor("run", "track_workout");
  const beginner = VL.filterByExperience(variants, "beginner");
  const intermediate = VL.filterByExperience(variants, "intermediate");
  // track_mile_repeats has experience_minimum: "intermediate"
  check("beginner cannot get track_mile_repeats", !beginner.some(v => v.id === "track_mile_repeats"));
  check("intermediate gets track_mile_repeats", intermediate.some(v => v.id === "track_mile_repeats"));
  check("beginner pool is smaller", beginner.length < variants.length);
}

// ─── 4. Recent history blocking ──────────────────────────────────────────────
section("9. pickVariant skips a recently-used variant");
{
  const variants = VL.getLibraryFor("run", "track_workout");
  // Force the start index to land on the first variant by picking weekNumber 0
  const result = DVR.pickVariant({
    variants,
    weekNumber: 0,
    recentHistory: [variants[0].id], // last week did variants[0]
  });
  check("did not return last week's variant", result.variantId !== variants[0].id);
  check("fallback_reason logs the advance", result.fallback_reason === "stale_selection",
    `got ${result.fallback_reason}`);
}

section("10. pickVariant exhausts the library when every variant is recent");
{
  const variants = VL.getLibraryFor("run", "easy_recovery"); // 2 variants
  const result = DVR.pickVariant({
    variants,
    weekNumber: 0,
    recentHistory: [variants[0].id, variants[1].id],
  });
  check("returns a variant anyway (library_exhausted)", !!result.variantId);
  check("fallback_reason = library_exhausted", result.fallback_reason === "library_exhausted",
    `got ${result.fallback_reason}`);
}

// ─── 5. Excluded session types ───────────────────────────────────────────────
section("11. Excluded session types are flagged");
{
  check("easy_recovery excluded", VL.isExcludedFromAiSelection("easy_recovery"));
  check("fun_social excluded", VL.isExcludedFromAiSelection("fun_social"));
  check("endurance excluded", VL.isExcludedFromAiSelection("endurance"));
  check("track_workout NOT excluded", !VL.isExcludedFromAiSelection("track_workout"));
}

// ─── 6. Modality coverage ────────────────────────────────────────────────────
section("12. Modality coverage — every key session type returns variants");
{
  const cases = [
    ["run", "track_workout"], ["run", "tempo_threshold"], ["run", "speed_work"],
    ["run", "hills"], ["run", "long_run"], ["run", "endurance"], ["run", "easy_recovery"],
    ["bike", "bike_intervals_ftp"], ["bike", "bike_intervals_vo2"],
    ["bike", "bike_intervals_sweet_spot"], ["bike", "bike_intervals_sprint"], ["bike", "bike_endurance"],
    ["swim", "swim_css_intervals"], ["swim", "swim_speed"],
    ["swim", "swim_endurance"], ["swim", "swim_technique"],
    ["strength", "accessory_quad"], ["strength", "accessory_hamstring_glute"],
    ["strength", "accessory_push"], ["strength", "accessory_pull"], ["strength", "accessory_core"],
    ["hybrid", "hybrid_metcon"], ["hybrid", "hybrid_amrap"], ["hybrid", "hybrid_emom"], ["hybrid", "hybrid_chipper"],
  ];
  let allOk = true;
  for (const [sport, type] of cases) {
    const v = VL.getLibraryFor(sport, type);
    if (!Array.isArray(v) || v.length === 0) { allOk = false; console.log(`     missing: ${sport}/${type}`); }
  }
  check("all 25 session-type slots return variants", allOk);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? "  → " + f.detail : ""}`));
  process.exit(1);
}
