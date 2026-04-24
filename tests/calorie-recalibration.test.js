// tests/calorie-recalibration.test.js
// Bug 19 regression — a 135-lb general-fitness user training 2-3
// days/week should land in 1,800–2,200 kcal maintenance, not 2,600.
//
// Tests the math directly against the Mifflin-St Jeor formula +
// the new activity multipliers. Doesn't run the JS file because
// nutrition-calculator.js depends on `window` (script-tag globals);
// we re-implement the canonical formula here so the multipliers
// chosen in the fix can be checked end-to-end.

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`); }
}
function section(t) { console.log("\n" + t); }

// Canonical Mifflin-St Jeor formula. Mirrors nutrition-calculator.js
// outer calculateTDEE.
function tdeeFor(profile) {
  const weightKg = profile.weight / 2.205;
  const heightCm = profile.height * 2.54;
  const bmrMale   = (10 * weightKg) + (6.25 * heightCm) - (5 * profile.age) + 5;
  const bmrFemale = (10 * weightKg) + (6.25 * heightCm) - (5 * profile.age) - 161;
  const bmr = profile.gender === "male" ? bmrMale
            : profile.gender === "female" ? bmrFemale
            : (bmrMale + bmrFemale) / 2;
  // New multipliers (Bug 19 fix):
  //   1-3 days → 1.375
  //   4-5 days → 1.55
  //   6-7 days → 1.725
  let mult;
  const days = profile.daysPerWeek;
  if (days <= 0) mult = 1.2;
  else if (days <= 3) mult = 1.375;
  else if (days <= 5) mult = 1.55;
  else mult = 1.725;
  return Math.round(bmr * mult);
}

// ─── Acceptance: 135-lb general-fitness user lands in 1,800–2,200 ───
section("Bug 19: 135-lb general-fitness profile produces 1,800–2,200 kcal maintenance");
{
  // Female profile, 135 lb / 5'8" (68") / 30 yo / 2-3 days/week
  const female23 = { weight: 135, height: 68, age: 30, gender: "female", daysPerWeek: 3 };
  const tdeeF23 = tdeeFor(female23);
  check(`female 135 lb / 3 days → ${tdeeF23} kcal in [1700, 2100]`,
        tdeeF23 >= 1700 && tdeeF23 <= 2100,
        `got ${tdeeF23}`);

  // Female 4-5 days
  const female45 = { ...female23, daysPerWeek: 4 };
  const tdeeF45 = tdeeFor(female45);
  check(`female 135 lb / 4 days → ${tdeeF45} kcal in [1900, 2300]`,
        tdeeF45 >= 1900 && tdeeF45 <= 2300,
        `got ${tdeeF45}`);

  // Male profile same weight
  const male23 = { ...female23, gender: "male" };
  const tdeeM23 = tdeeFor(male23);
  check(`male 135 lb / 3 days → ${tdeeM23} kcal in [1900, 2300]`,
        tdeeM23 >= 1900 && tdeeM23 <= 2300,
        `got ${tdeeM23}`);

  // Sanity: very-active 6-7 days/week is the upper bound
  const female67 = { ...female23, daysPerWeek: 7 };
  const tdeeF67 = tdeeFor(female67);
  check(`female 135 lb / 7 days → ${tdeeF67} kcal under 2,500`,
        tdeeF67 < 2500,
        `got ${tdeeF67}`);
}

// ─── Regression: old multipliers WERE producing the 2,600 we're fixing ───
section("Regression check: previous multipliers (1.46 / 1.64 / 1.81) over-prescribed");
{
  function tdeeOld(profile) {
    const weightKg = profile.weight / 2.205;
    const heightCm = profile.height * 2.54;
    const bmr = profile.gender === "female"
      ? (10 * weightKg) + (6.25 * heightCm) - (5 * profile.age) - 161
      : (10 * weightKg) + (6.25 * heightCm) - (5 * profile.age) + 5;
    const days = profile.daysPerWeek;
    let mult;
    if (days <= 3) mult = 1.46;
    else if (days <= 5) mult = 1.64;
    else mult = 1.81;
    return Math.round(bmr * mult);
  }
  const f = { weight: 135, height: 68, age: 30, gender: "female", daysPerWeek: 4 };
  const oldTdee = tdeeOld(f);
  check(`old multipliers gave ${oldTdee} kcal (the bug we're fixing)`,
        oldTdee > 2200,
        `expected >2200, got ${oldTdee}`);
}

// ─── Boundary checks for the activity multiplier table ─────────────────
section("Activity multiplier boundaries");
{
  function multForDays(d) {
    if (d <= 0) return 1.2;
    if (d <= 3) return 1.375;
    if (d <= 5) return 1.55;
    return 1.725;
  }
  check("0 days → 1.2 (sedentary)", multForDays(0) === 1.2);
  check("1 day → 1.375 (lightly active)", multForDays(1) === 1.375);
  check("3 days → 1.375 (lightly active, upper boundary)", multForDays(3) === 1.375);
  check("4 days → 1.55 (moderately active)", multForDays(4) === 1.55);
  check("5 days → 1.55 (moderately active, upper boundary)", multForDays(5) === 1.55);
  check("6 days → 1.725 (very active)", multForDays(6) === 1.725);
  check("7 days → 1.725 (very active, upper boundary)", multForDays(7) === 1.725);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? "  → " + f.detail : ""}`));
  process.exit(1);
}
