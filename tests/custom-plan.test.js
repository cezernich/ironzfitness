// tests/custom-plan.test.js
// Unit tests for the Custom Plan builder data layer.
// Covers the three bugs fixed:
//   1. Multiple sessions on a single day (array shape, no overwrite)
//   2. Editing an existing session in place (replace by index, no duplicate)
//   3. Superset grouping (supersetGroup field preserved and mapped to supersetId)

const CP = require("../custom-plan.js");

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`); }
}
function section(t) { console.log("\n" + t); }
function reset() { CP._cpResetTemplate(); }

// ─── Bug 1: Multiple sessions per day ───────────────────────────────────────
section("Bug 1: Two strength sessions on the same day — both persist");
{
  reset();
  const a = { mode: "manual", data: { type: "strength", sessionName: "Push A" } };
  const b = { mode: "manual", data: { type: "strength", sessionName: "Push B" } };
  CP._cpAddSession(1, a);
  CP._cpAddSession(1, b);
  const arr = CP._cpGetTemplate()[1];
  check("monday is an array", Array.isArray(arr));
  check("monday has 2 sessions", arr.length === 2, `got ${arr.length}`);
  check("first session is Push A", arr[0].data.sessionName === "Push A");
  check("second session is Push B", arr[1].data.sessionName === "Push B");
  check("each session has an id", !!arr[0].id && !!arr[1].id && arr[0].id !== arr[1].id);
}

// ─── Bug 1b: Legacy single-object day auto-wraps on migration ────────────────
section("Bug 1b: Legacy single-object day auto-migrates to array");
{
  reset();
  // Simulate legacy shape
  CP._cpSetTemplate({ 2: { mode: "manual", data: { type: "strength", sessionName: "Legacy Day" } } });
  CP._cpMigrateTemplate();
  const arr = CP._cpGetTemplate()[2];
  check("legacy day wrapped in array", Array.isArray(arr), "still not an array");
  check("legacy data preserved", arr.length === 1 && arr[0].data.sessionName === "Legacy Day");
  check("legacy entry has generated id", !!arr[0].id);
}

// ─── Bug 1c: Adding a non-rest session to a rest day clears the rest marker ─
section("Bug 1c: Adding a session to a rest day clears the rest marker");
{
  reset();
  CP._cpAddSession(3, { mode: "rest", data: {} });
  CP._cpAddSession(3, { mode: "manual", data: { type: "strength", sessionName: "Pull A" } });
  const arr = CP._cpGetTemplate()[3];
  check("rest cleared when new session added", arr.length === 1 && arr[0].mode === "manual");
}

// ─── Bug 1d: Setting rest replaces all sessions ─────────────────────────────
section("Bug 1d: Setting rest via _cpAddSession replaces existing sessions");
{
  reset();
  CP._cpAddSession(4, { mode: "manual", data: { type: "strength", sessionName: "A" } });
  CP._cpAddSession(4, { mode: "manual", data: { type: "strength", sessionName: "B" } });
  CP._cpAddSession(4, { mode: "rest", data: {} });
  const arr = CP._cpGetTemplate()[4];
  check("rest replaces everything", arr.length === 1 && arr[0].mode === "rest");
}

// ─── Bug 2: Edit in place by index ───────────────────────────────────────────
section("Bug 2: Edit existing session in place — no duplicate created");
{
  reset();
  CP._cpAddSession(1, { mode: "manual", data: { type: "strength", sessionName: "Push A" } });
  CP._cpAddSession(1, { mode: "manual", data: { type: "strength", sessionName: "Push B" } });
  const originalId = CP._cpGetTemplate()[1][0].id;
  CP._cpReplaceSession(1, 0, {
    mode: "manual",
    data: { type: "strength", sessionName: "Push A (edited)" },
  });
  const arr = CP._cpGetTemplate()[1];
  check("array length unchanged after edit", arr.length === 2, `got ${arr.length}`);
  check("edited session is updated", arr[0].data.sessionName === "Push A (edited)");
  check("second session untouched", arr[1].data.sessionName === "Push B");
  check("edited session preserved id", arr[0].id === originalId);
}

// ─── Bug 2b: Delete removes only the targeted session ───────────────────────
section("Bug 2b: Delete only removes the targeted session");
{
  reset();
  CP._cpAddSession(1, { mode: "manual", data: { sessionName: "X" } });
  CP._cpAddSession(1, { mode: "manual", data: { sessionName: "Y" } });
  CP._cpAddSession(1, { mode: "manual", data: { sessionName: "Z" } });
  CP._cpRemoveSession(1, 1);
  const names = CP._cpGetTemplate()[1].map(s => s.data.sessionName);
  check("removed middle session", names.length === 2 && names[0] === "X" && names[1] === "Z",
    "got: " + JSON.stringify(names));
}

// ─── Bug 3: Superset grouping field preserved ───────────────────────────────
section("Bug 3: Superset group (A1/A2) — field preserved through add & edit");
{
  reset();
  const session = {
    mode: "manual",
    data: {
      type: "strength",
      sessionName: "Push A",
      exercises: [
        { name: "Bench", sets: 4, reps: 8, weight: "155 lbs", supersetGroup: "A" },
        { name: "Row",   sets: 4, reps: 8, weight: "135 lbs", supersetGroup: "A" },
        { name: "Curl",  sets: 3, reps: 12, weight: "30 lbs", supersetGroup: null },
      ],
    },
  };
  CP._cpAddSession(1, session);
  const stored = CP._cpGetTemplate()[1][0];
  check("exercise A1 has group A", stored.data.exercises[0].supersetGroup === "A");
  check("exercise A2 has group A", stored.data.exercises[1].supersetGroup === "A");
  check("standalone exercise has null group", stored.data.exercises[2].supersetGroup === null);
}

// ─── Bug 3b: supersetGroup is mapped to supersetId for schedule shape ───────
section("Bug 3b: supersetGroup → supersetId mapping for schedule rendering");
{
  const ex = { name: "Bench", sets: 4, reps: 8, weight: "155 lbs", supersetGroup: "A" };
  const mapped = CP._cpExerciseToScheduleShape(ex);
  check("mapped exercise retains supersetGroup", mapped.supersetGroup === "A");
  check("mapped exercise gains supersetId", mapped.supersetId === "A");

  // Already-set supersetId takes precedence (no override)
  const ex2 = { name: "Squat", supersetGroup: "A", supersetId: "X" };
  const mapped2 = CP._cpExerciseToScheduleShape(ex2);
  check("existing supersetId is not overridden", mapped2.supersetId === "X");

  // Null group stays null, no supersetId injected
  const ex3 = { name: "Curl", supersetGroup: null };
  const mapped3 = CP._cpExerciseToScheduleShape(ex3);
  check("null group leaves supersetId undefined", mapped3.supersetId === undefined);
}

// ─── Copy-week preservation: full session array survives round-trip ─────────
section("Copy week: multi-session day survives template round-trip");
{
  reset();
  const dayTemplate = [
    { mode: "manual", data: { type: "swimming", sessionName: "AM Swim", intervals: [{ name: "Warmup", duration: "10 min" }] } },
    { mode: "manual", data: { type: "strength", sessionName: "PM Lift", exercises: [{ name: "Squat", sets: 5, reps: 5, supersetGroup: "A" }] } },
  ];
  CP._cpSetTemplate({ 1: dayTemplate });
  CP._cpMigrateTemplate();
  const arr = CP._cpGetTemplate()[1];
  check("both sessions preserved", arr.length === 2);
  check("swim session preserved", arr[0].data.sessionName === "AM Swim");
  check("lift session preserved", arr[1].data.sessionName === "PM Lift");
  check("lift superset group preserved", arr[1].data.exercises[0].supersetGroup === "A");
  check("all entries got ids after migration", arr.every(e => !!e.id));
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? ": " + f.detail : ""}`));
  process.exit(1);
}
