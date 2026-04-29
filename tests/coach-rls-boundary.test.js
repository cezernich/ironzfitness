// coach-rls-boundary.test.js — Phase 5D regression test
//
// Validates the JS-side helpers that mirror the SQL RLS gating, since
// trigger / RLS behavior in Postgres is exercised by the migration's
// in-line smoke tests. This test pins the JS contract:
//
//   • _readFlag in coach-client-detail.js handles every storage shape
//     (numeric 0/1, string "0"/"1", boolean, object, null) and matches
//     is_feature_enabled() in the Phase 2A SQL helper.
//   • The user_data data_key allowlist in coach-client-detail.js stays
//     in sync with the SQL policy (training keys allowed, gated keys
//     conditional, meals/hydrationLog/photos absent).
//   • isCoachActive in client-coaching.js fails open when the cache
//     hasn't loaded yet (so we don't mis-label legit coaches during
//     auth boot).
//
// Run: `node tests/coach-rls-boundary.test.js` from fitness-app/.

"use strict";

let failures = 0;
function assertEq(actual, expected, label) {
  const ok = actual === expected;
  console[ok ? "log" : "error"](`  ${ok ? "PASS" : "FAIL"}: ${label} ${ok ? "" : `— expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!ok) failures++;
}

// ── _readFlag: shape parity with is_feature_enabled() ───────────────────
console.log("Section 1 — _readFlag shape coverage");

// Mirror the helper from coach-client-detail.js (kept here so the test
// can run without loading the whole module — that requires DOM and
// Supabase shims).
function _readFlag(v) {
  if (v == null) return true;
  if (typeof v === "boolean") return v;
  if (typeof v === "number")  return v !== 0;
  if (typeof v === "string")  return !["0", "false", ""].includes(v);
  if (typeof v === "object")  {
    if ("enabled" in v) return !!v.enabled;
    return true;
  }
  return true;
}

assertEq(_readFlag(undefined),         true,  "undefined → default-on");
assertEq(_readFlag(null),              true,  "null → default-on");
assertEq(_readFlag(true),              true,  "boolean true");
assertEq(_readFlag(false),             false, "boolean false");
assertEq(_readFlag(1),                 true,  "numeric 1 (production format)");
assertEq(_readFlag(0),                 false, "numeric 0 — load-bearing");
assertEq(_readFlag(2),                 true,  "any non-zero number is truthy");
assertEq(_readFlag("1"),               true,  "string \"1\"");
assertEq(_readFlag("0"),               false, "string \"0\" — load-bearing");
assertEq(_readFlag("true"),            true,  "string \"true\"");
assertEq(_readFlag("false"),           false, "string \"false\"");
assertEq(_readFlag(""),                false, "empty string");
assertEq(_readFlag({ enabled: true }),  true,  "object {enabled: true}");
assertEq(_readFlag({ enabled: false }), false, "object {enabled: false}");
assertEq(_readFlag({}),                true,  "empty object — no enabled key, default-on");

// ── data_key allowlist parity ──────────────────────────────────────────
console.log("Section 2 — data_key allowlist parity");

const fs = require("fs");
const path = require("path");

const sqlPath = path.join(__dirname, "..", "supabase", "migrations", "20260428b_coaching_nutrition_rls.sql");
const jsPath  = path.join(__dirname, "..", "js", "coach-client-detail.js");

const sqlText = fs.readFileSync(sqlPath, "utf-8");
const jsText  = fs.readFileSync(jsPath, "utf-8");

// Extract every quoted training data_key from the SQL SELECT policy's
// allowlist. The list is between the `data_key IN (` and the next `)`.
const allowlistMatch = sqlText.match(/data_key IN \(([\s\S]*?)\)/);
if (!allowlistMatch) {
  console.error("  FAIL: couldn't locate allowlist block in SQL migration");
  failures++;
} else {
  const sqlKeys = (allowlistMatch[1].match(/'([^']+)'/g) || []).map(s => s.replace(/'/g, ""));
  console.log(`  found ${sqlKeys.length} keys in SQL allowlist`);

  // The JS load fetches a subset — every key it asks for should be in
  // the SQL allowlist. Extract from the .in("data_key", [...]) call.
  const jsKeysMatch = jsText.match(/\.in\("data_key",\s*\[([\s\S]*?)\]\)/);
  if (!jsKeysMatch) {
    console.error("  FAIL: couldn't locate .in() allowlist in coach-client-detail.js");
    failures++;
  } else {
    const jsKeys = (jsKeysMatch[1].match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g, ""));

    // The conditional keys (nutritionAdjustments, hydrationSettings,
    // hydrationDailyTargetOz, fuelingPrefs) live in separate branches
    // of the SQL policy, not the IN clause. Validate they exist in the
    // SQL text and are referenced in the JS fetch.
    const conditional = ["nutritionAdjustments", "hydrationSettings", "hydrationDailyTargetOz", "fuelingPrefs"];

    for (const key of jsKeys) {
      if (conditional.includes(key)) {
        const inSql = sqlText.includes(`'${key}'`);
        assertEq(inSql, true, `JS asks for ${key} → SQL policy mentions it`);
      } else {
        const inAllowlist = sqlKeys.includes(key);
        assertEq(inAllowlist, true, `JS asks for ${key} → SQL allowlist includes it`);
      }
    }

    // Inverse: privacy-protected keys must NEVER appear in the
    // allowlist. If they do, RLS would over-share.
    const banned = ["meals", "hydrationLog", "savedMealPlans", "currentWeekMealPlan",
                    "fuelingLog", "bodyComp", "sleepLog", "photos"];
    for (const key of banned) {
      assertEq(sqlKeys.includes(key), false, `${key} NOT in SQL allowlist`);
      assertEq(jsKeys.includes(key),  false, `${key} NOT in JS fetch`);
    }
  }
}

// ── isCoachActive: fail-open semantics ─────────────────────────────────
console.log("Section 3 — isCoachActive fail-open semantics");

// Mirror of client-coaching.js helper. Sync, no async load — the cache
// gates the answer.
function makeIsCoachActive(loaded, ids) {
  const set = new Set(ids || []);
  return function isCoachActive(coachId) {
    if (!coachId) return false;
    if (!loaded) return true;
    return set.has(coachId);
  };
}

const beforeLoad = makeIsCoachActive(false, []);
assertEq(beforeLoad("any-id"),   true,  "before load: ANY coach id reads as active (fail open)");
assertEq(beforeLoad(undefined),  false, "before load: undefined coachId still false");
assertEq(beforeLoad(null),       false, "before load: null coachId still false");

const afterLoad = makeIsCoachActive(true, ["coach-1", "coach-2"]);
assertEq(afterLoad("coach-1"),   true,  "after load: cached coach is active");
assertEq(afterLoad("coach-3"),   false, "after load: missing coach is FORMER");
assertEq(afterLoad(undefined),   false, "after load: undefined still false");

// ── Plan-freeze: cache write semantics ─────────────────────────────────
console.log("Section 4 — plan-freeze fetch handles unfrozen_at correctly");

// Mirror of fetchPlanFreezeState's row-shape interpretation. We can't
// call the real fetch without supabase + auth shims, but the logic
// boils down to: row exists AND unfrozen_at is null → frozen=true.
function rowToFrozen(row) {
  if (!row) return false;
  if (row.unfrozen_at) return false;
  return true;
}

assertEq(rowToFrozen(null),                         false, "no row → not frozen");
assertEq(rowToFrozen({ frozen_at: "...", unfrozen_at: null }), true,  "row + null unfrozen_at → frozen");
assertEq(rowToFrozen({ frozen_at: "...", unfrozen_at: "2026-04-29" }), false, "row with unfrozen_at → not frozen");

// ── Mirror trigger output shape ────────────────────────────────────────
console.log("Section 5 — mirror trigger output shape");

// Pin the field set the trigger overlays on the workout JSONB. Calendar
// renderer + coach-client-detail Phase 3B edit handler depend on every
// one of these being present.
const triggerSqlPath = path.join(__dirname, "..", "supabase", "migrations", "20260429_coach_assignment_mirror.sql");
const triggerSql = fs.readFileSync(triggerSqlPath, "utf-8");

const expectedFields = [
  "id", "date", "source", "coachId", "coachAssignmentId", "coachNote", "assignedAt",
];
for (const f of expectedFields) {
  const present = new RegExp(`'${f}'`).test(triggerSql);
  assertEq(present, true, `mirror trigger emits ${f} field`);
}

// And conflict_mode handling: each branch must be referenced.
for (const mode of ["replace", "stack", "freeze"]) {
  const present = triggerSql.includes(`'${mode}'`);
  assertEq(present, true, `mirror trigger handles conflict_mode='${mode}'`);
}

// ─── Summary ───────────────────────────────────────────────────────────
if (failures === 0) {
  console.log("\nAll coach-RLS boundary assertions pass.");
  process.exit(0);
} else {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
