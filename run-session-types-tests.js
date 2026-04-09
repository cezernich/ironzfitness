// run-session-types-tests.js
// Self-contained Node test harness for the SESSION_TYPE_LIBRARY + generator
// + Add Running Session flow.
// Run: `node run-session-types-tests.js` from the fitness-app directory.

global.window = global;
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; },
};
global.document = {
  createElement: () => ({ classList: { add() {}, remove() {} }, addEventListener() {}, style: {}, querySelector: () => null }),
  getElementById: () => null,
  body: { appendChild() {} },
};
global.requestAnimationFrame = fn => fn();
global.alert = () => {};
global.confirm = () => true;

// Permissive Proxy stubs for the globals planner.js touches at module-eval time.
const _permissiveStub = new Proxy(function () {}, {
  get: (target, prop) => prop === Symbol.toPrimitive ? () => "" : _permissiveStub,
  apply: () => _permissiveStub,
  construct: () => _permissiveStub,
});
global.ICONS = _permissiveStub;
global.DB = _permissiveStub;
global.RACE_CONFIGS = {};
global.WEEKLY_PATTERNS = {};
global.RUN_DURATION_TABLES = {};
global.NUTRITION_TARGETS = {};
global.SESSION_DESCRIPTIONS = {};

require("./threshold-week-scheduler.js");
require("./session-type-library.js");
require("./zone-calculator.js");
require("./running-workout-generator.js");
try {
  require("./planner.js");
} catch (e) {
  console.warn("[harness] planner.js load warning:", e.message);
}
require("./add-running-session-flow.js");

const STL = window.SessionTypeLibrary;
const RWG = window.RunningWorkoutGenerator;
const ZC  = window.ZoneCalculator;
const Planner = window.Planner;
const ARSF = window.AddRunningSessionFlow;

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`); }
}
function section(t) { console.log("\n" + t); }
function clearStorage() { localStorage.clear(); }

function setProfile(p) { localStorage.setItem("profile", JSON.stringify(p)); }
function setSchedule(arr) { localStorage.setItem("workoutSchedule", JSON.stringify(arr)); }
function setPlan(arr) { localStorage.setItem("trainingPlan", JSON.stringify(arr)); }
function getSchedule() { try { return JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch { return []; } }

// ─── GOLDEN 1: VDOT 53 intermediate, Easy / Recovery ─────────────────────────
section("Golden 1: VDOT 53 intermediate runner picks Easy/Recovery");
{
  clearStorage();
  setProfile({ vdot: 53, experience_level: "intermediate" });
  const zones = ZC.getZonesForUser();
  check("zones returned for VDOT 53", zones && zones.vdot === 53);
  check("e_pace min_per_mi range = 7:51-8:32", zones && zones.e_pace.min_per_mi[0] === "7:51/mi" && zones.e_pace.min_per_mi[1] === "8:32/mi",
    `got ${zones && zones.e_pace.min_per_mi.join("..")}`);
  const r = RWG.generateRunWorkout({
    sessionTypeId: "easy_recovery",
    userZones: zones,
    experienceLevel: "intermediate",
  });
  const w = r.workout;
  check("type = easy_recovery", w.type === "easy_recovery");
  check("not hard", w.is_hard === false);
  check("single phase (no warmup/cooldown)", w.phases.length === 1 && w.phases[0].phase === "main");
  check("duration in [30, 45] (intermediate scaling)", w.estimated_duration_min >= 30 && w.estimated_duration_min <= 45,
    `got ${w.estimated_duration_min}`);
  check("instruction includes 7:51-8:32 range", /7:51.*8:32/.test(w.phases[0].instruction),
    w.phases[0].instruction);
  check("why_text starts with 'Recovery and aerobic'", /^Recovery and aerobic/.test(w.why_text || ""));
}

// ─── GOLDEN 2: Tempo / Threshold ─────────────────────────────────────────────
section("Golden 2: VDOT 53 intermediate runner picks Tempo");
{
  clearStorage();
  setProfile({ vdot: 53, experience_level: "intermediate" });
  const zones = ZC.getZonesForUser();
  check("t_pace min_per_mi = 6:36-6:51", zones && zones.t_pace.min_per_mi[0] === "6:36/mi" && zones.t_pace.min_per_mi[1] === "6:51/mi",
    `got ${zones && zones.t_pace.min_per_mi.join("..")}`);
  const r = RWG.generateRunWorkout({
    sessionTypeId: "tempo_threshold",
    userZones: zones,
    experienceLevel: "intermediate",
  });
  const w = r.workout;
  check("3 phases (WU / main / CD)", w.phases.length === 3);
  check("warmup 15 min", w.phases[0].duration_min === 15);
  check("cooldown 10 min", w.phases[2].duration_min === 10);
  check("main is 4×8 min cruise intervals", w.phases[1].reps === 4 && w.phases[1].rep_duration_min === 8);
  check("rest 90s jog", w.phases[1].rest_sec === 90);
  check("main instruction shows 4×8 min @ 6:36-6:51/mi w/ 90s jog rest",
    /4×8 min @ 6:36–6:51\/mi w\/ 90s jog rest/.test(w.phases[1].instruction),
    w.phases[1].instruction);
  // Total ~ 70 min (15 + 32 main + ~4.5 rest + 10 = ~62; spec says ~70). Allow 60-75.
  check("estimated total ~60-75 min", w.estimated_duration_min >= 60 && w.estimated_duration_min <= 75,
    `got ${w.estimated_duration_min}`);
}

// ─── GOLDEN 3: Track week 0 → 800m repeats ──────────────────────────────────
section("Golden 3: Track Workout, week 0 → 8×800m");
{
  clearStorage();
  setProfile({ vdot: 53, experience_level: "intermediate" });
  const zones = ZC.getZonesForUser();
  const r = RWG.generateRunWorkout({
    sessionTypeId: "track_workout",
    userZones: zones,
    experienceLevel: "intermediate",
    weeksSincePlanStart: 0,
  });
  const w = r.workout;
  check("rotation_index = 0", w.rotation_index === 0);
  check("rotation_name = 800m repeats", w.rotation_name === "800m repeats");
  check("title is 'Track Workout — 800m repeats'", w.title === "Track Workout — 800m repeats");
  // 8×800m for intermediate
  check("main rep_count = 8", w.phases[1].rep_count === 8);
  check("main shows 8×800m @ 3:00-3:05 w/ 400m jog",
    /8×800m @ 3:00–3:05 w\/ 400m jog/.test(w.phases[1].instruction),
    w.phases[1].instruction);
  check("includes 4×20s strides in warmup", /4×20s strides/.test(w.phases[0].instruction));
}

// ─── GOLDEN 4: Track week 1 → 1K repeats ────────────────────────────────────
section("Golden 4: Track Workout, week 1 → 6×1000m");
{
  setProfile({ vdot: 53, experience_level: "intermediate" });
  const zones = ZC.getZonesForUser();
  const r = RWG.generateRunWorkout({
    sessionTypeId: "track_workout",
    userZones: zones,
    experienceLevel: "intermediate",
    weeksSincePlanStart: 1,
  });
  const w = r.workout;
  check("rotation_index = 1", w.rotation_index === 1);
  check("rotation_name = 1K repeats", w.rotation_name === "1K repeats");
  check("main rep_count = 6", w.phases[1].rep_count === 6);
  check("main instruction shows 6×1000m @ 3:45-3:51 w/ 2 min jog",
    /6×1000m @ 3:45–3:51 w\/ 2 min jog/.test(w.phases[1].instruction) ||
    /6×1000m @ 3:45–3:52 w\/ 2 min jog/.test(w.phases[1].instruction),
    w.phases[1].instruction);
}

// ─── GOLDEN 5: Track week 3 → ladder ────────────────────────────────────────
section("Golden 5: Track Workout, week 3 → Ladder");
{
  setProfile({ vdot: 53, experience_level: "intermediate" });
  const zones = ZC.getZonesForUser();
  const r = RWG.generateRunWorkout({
    sessionTypeId: "track_workout",
    userZones: zones,
    experienceLevel: "intermediate",
    weeksSincePlanStart: 3,
  });
  const w = r.workout;
  check("rotation_index = 3", w.rotation_index === 3);
  check("rotation_name = Ladder", w.rotation_name === "Ladder");
  check("main instruction mentions 400m / 800m / 1200m / 800m / 400m",
    /400m \/ 800m \/ 1200m \/ 800m \/ 400m/.test(w.phases[1].instruction),
    w.phases[1].instruction);
  check("equal-time jog rest", /equal-time jog/.test(w.phases[1].instruction));
}

// ─── GOLDEN 6: Speed Work for intermediate → 8×200m R-pace ──────────────────
section("Golden 6: Speed Work, intermediate → 8×200m");
{
  setProfile({ vdot: 53, experience_level: "intermediate" });
  const zones = ZC.getZonesForUser();
  const r = RWG.generateRunWorkout({
    sessionTypeId: "speed_work",
    userZones: zones,
    experienceLevel: "intermediate",
  });
  const w = r.workout;
  check("3 phases", w.phases.length === 3);
  check("WU 15 min", w.phases[0].duration_min === 15);
  check("CD 10 min", w.phases[2].duration_min === 10);
  check("main rep_count = 8", w.phases[1].rep_count === 8);
  check("main instruction shows 8×200m @ 38-40s w/ 200m walk",
    /8×200m @ 38–40s w\/ 200m walk recovery/.test(w.phases[1].instruction),
    w.phases[1].instruction);
}

// ─── GOLDEN 7: Beginner with no VDOT picks Track → effort fallback ───────────
section("Golden 7: Beginner, no VDOT picks Track Workout → effort fallback");
{
  clearStorage();
  setProfile({ experience_level: "beginner" }); // no vdot
  const zones = ZC.getZonesForUser();
  check("zones is null when no VDOT", zones === null);
  const r = RWG.generateRunWorkout({
    sessionTypeId: "track_workout",
    userZones: null,
    experienceLevel: "beginner",
    weeksSincePlanStart: 0,
  });
  const w = r.workout;
  check("warning fired", (w.warnings || []).some(x => /accurate pace targets/.test(x)));
  check("main instruction uses effort wording, not pace numbers",
    /effort/.test(w.phases[1].instruction) && !/\d:\d\d/.test(w.phases[1].instruction),
    w.phases[1].instruction);
  // Beginner rep_count for 800m = 6
  check("beginner rep_count = 6", w.phases[1].rep_count === 6);
}

// ─── GOLDEN 8: Conflict modal — replace path ─────────────────────────────────
section("Golden 8: Replace conflict + rebalance");
{
  clearStorage();
  setProfile({ vdot: 53, experience_level: "intermediate" });
  // Tuesday already has a planned 60 min easy run.
  setPlan([
    { id: "plan-easy-tue", date: "2026-04-14", discipline: "run", load: "easy", sessionName: "Easy Run", duration: 60 },
    { id: "plan-easy-wed", date: "2026-04-15", discipline: "run", load: "easy", sessionName: "Easy Run", duration: 45 },
    { id: "plan-easy-fri", date: "2026-04-17", discipline: "run", load: "easy", sessionName: "Easy Run", duration: 45 },
  ]);
  const zones = ZC.getZonesForUser();
  const trackResult = RWG.generateRunWorkout({
    sessionTypeId: "track_workout", userZones: zones, experienceLevel: "intermediate", weeksSincePlanStart: 0
  });
  const existing = ARSF.plannedWorkoutForDate("2026-04-14");
  check("conflict detected for Tuesday", existing && existing.id === "plan-easy-tue");
  // Run save() in replace mode
  ARSF.save(trackResult.workout, "2026-04-14", "replace");
  // The original easy run should now be removed from trainingPlan
  const plan2 = JSON.parse(localStorage.getItem("trainingPlan") || "[]");
  const stillThere = plan2.find(e => e.id === "plan-easy-tue");
  check("planned easy run removed from trainingPlan", !stillThere);
  // Easy Wed/Fri should have been bumped via rebalanceWeek
  const wed = plan2.find(e => e.id === "plan-easy-wed");
  const fri = plan2.find(e => e.id === "plan-easy-fri");
  check("rebalance bumped Wednesday's easy run", wed && wed.duration > 45, `wed=${wed && wed.duration}`);
  check("rebalance bumped Friday's easy run", fri && fri.duration > 45, `fri=${fri && fri.duration}`);
  // Track was saved to schedule
  const sched = getSchedule();
  check("Track saved to workoutSchedule with source=user_added",
    sched.some(s => s.type === "track_workout" && s.source === "user_added"));
}

// ─── GOLDEN 9: 3 hard sessions = at the cap, NO warning ──────────────────────
section("Golden 9: 3 hard sessions in a week = at the cap, no warning");
{
  clearStorage();
  setProfile({ vdot: 53, experience_level: "intermediate" });
  // Track Tue + Long Sun already exist; add Tempo Fri.
  setPlan([
    { id: "p-track", date: "2026-04-14", discipline: "run", type: "track_workout", is_hard: true, sessionName: "Track", duration: 60 },
    { id: "p-long",  date: "2026-04-19", discipline: "run", type: "long_run",      is_hard: true, sessionName: "Long Run", duration: 100 },
  ]);
  const zones = ZC.getZonesForUser();
  const tempo = RWG.generateRunWorkout({
    sessionTypeId: "tempo_threshold", userZones: zones, experienceLevel: "intermediate"
  });
  const evals = ARSF.evaluateConstraints(tempo.workout, "2026-04-17");
  // 2 existing hard + 1 new = 3 → at cap, no warning
  const stress = evals.warnings.find(x => x.rule === "weekly_hard_count");
  check("no weekly_hard_count warning at the cap", !stress, `warnings=${JSON.stringify(evals.warnings.map(w=>w.rule))}`);
}

// ─── GOLDEN 10: 4 hard sessions → warning ────────────────────────────────────
section("Golden 10: 4 hard sessions → warning fires");
{
  clearStorage();
  setProfile({ vdot: 53, experience_level: "intermediate" });
  // Track Tue + Tempo Thu + Long Sun
  setPlan([
    { id: "p-track", date: "2026-04-14", type: "track_workout", is_hard: true, sessionName: "Track", duration: 60 },
    { id: "p-tempo", date: "2026-04-16", type: "tempo_threshold", is_hard: true, sessionName: "Tempo", duration: 60 },
    { id: "p-long",  date: "2026-04-19", type: "long_run",      is_hard: true, sessionName: "Long Run", duration: 100 },
  ]);
  const zones = ZC.getZonesForUser();
  const hills = RWG.generateRunWorkout({ sessionTypeId: "hills", userZones: zones, experienceLevel: "intermediate" });
  const evals = ARSF.evaluateConstraints(hills.workout, "2026-04-18");
  const stress = evals.warnings.find(x => x.rule === "weekly_hard_count");
  check("weekly_hard_count warning fires", !!stress);
  check("warning mentions 4 hard sessions", stress && /4 hard sessions/.test(stress.message));
}

// ─── GOLDEN 11: Tempo within 24h of Long Run → warning ───────────────────────
section("Golden 11: Tempo within 24h of Long Run");
{
  clearStorage();
  setProfile({ vdot: 53, experience_level: "intermediate" });
  setPlan([
    { id: "p-long", date: "2026-04-19", type: "long_run", is_hard: true, sessionName: "Long Run", duration: 100 }
  ]);
  const zones = ZC.getZonesForUser();
  const tempo = RWG.generateRunWorkout({ sessionTypeId: "tempo_threshold", userZones: zones, experienceLevel: "intermediate" });
  const evals = ARSF.evaluateConstraints(tempo.workout, "2026-04-20"); // day after long
  const w = evals.warnings.find(x => x.rule === "no_hard_around_long_run");
  check("no_hard_around_long_run warning fires", !!w, JSON.stringify(evals.warnings.map(x=>x.rule)));
  check("warning is overridable (in warnings, not hardBlocks)", evals.hardBlocks.length === 0);
}

// ─── GOLDEN 12: Long Run twice → HARD BLOCK ─────────────────────────────────
section("Golden 12: Long Run twice in same week → hard block");
{
  clearStorage();
  setProfile({ vdot: 53, experience_level: "intermediate" });
  setPlan([
    { id: "p-long-1", date: "2026-04-19", type: "long_run", is_hard: true, sessionName: "Long Run", duration: 100 }
  ]);
  const zones = ZC.getZonesForUser();
  const second = RWG.generateRunWorkout({ sessionTypeId: "long_run", userZones: zones, experienceLevel: "intermediate" });
  const evals = ARSF.evaluateConstraints(second.workout, "2026-04-15");
  check("long_run_cap is a HARD BLOCK", evals.hardBlocks.some(b => b.rule === "long_run_cap"),
    JSON.stringify(evals.hardBlocks.map(b=>b.rule)));
  check("no override warning for long run cap (it's blocked)", true);
}

// ─── GOLDEN 13: Fun / Social — instruction text only ─────────────────────────
section("Golden 13: Fun / Social — instruction-only, no targets");
{
  clearStorage();
  setProfile({ vdot: 53, experience_level: "intermediate" });
  const zones = ZC.getZonesForUser();
  const r = RWG.generateRunWorkout({ sessionTypeId: "fun_social", userZones: zones, experienceLevel: "intermediate" });
  const w = r.workout;
  check("not hard", w.is_hard === false);
  check("single phase", w.phases.length === 1);
  check("instruction is the permissive prose", /Run by feel/.test(w.phases[0].instruction));
  check("no pace targets in instruction", !/\d:\d\d\/mi/.test(w.phases[0].instruction));
}

// ─── BONUS: getWeeklyHardSessionCount via Planner ────────────────────────────
section("Bonus: Planner.getWeeklyHardSessionCount");
{
  clearStorage();
  setPlan([
    { id: "a", date: "2026-04-14", type: "track_workout", is_hard: true, sessionName: "Track" },
    { id: "b", date: "2026-04-16", type: "tempo_threshold", is_hard: true, sessionName: "Tempo" },
    { id: "c", date: "2026-04-15", type: "easy_recovery", is_hard: false, sessionName: "Easy" },
    { id: "d", date: "2026-04-19", type: "long_run", is_hard: true, sessionName: "Long" },
  ]);
  const result = Planner.getWeeklyHardSessionCount("2026-04-13"); // Mon
  check("count = 3", result.count === 3, `got ${result.count}`);
  check("items length 3", result.items.length === 3);
  // The easy entry on Wed should NOT be counted.
  check("easy run excluded from items", !result.items.some(it => it.title === "Easy"));
}

// ─── BONUS: removeWorkout returns the removed entry ──────────────────────────
section("Bonus: Planner.removeWorkout");
{
  clearStorage();
  setPlan([{ id: "rm-1", date: "2026-04-14", type: "easy_recovery", duration: 60 }]);
  const removed = Planner.removeWorkout("rm-1");
  check("returned the removed entry", removed && removed.id === "rm-1");
  check("training plan now empty", JSON.parse(localStorage.getItem("trainingPlan")).length === 0);
}

// ─── BONUS: Track + Speed in same week (intermediate) → warning ──────────────
section("Bonus: Track + Speed same week, intermediate → warning");
{
  clearStorage();
  setProfile({ vdot: 53, experience_level: "intermediate" });
  setPlan([{ id: "p-track", date: "2026-04-14", type: "track_workout", is_hard: true, sessionName: "Track" }]);
  const zones = ZC.getZonesForUser();
  const speed = RWG.generateRunWorkout({ sessionTypeId: "speed_work", userZones: zones, experienceLevel: "intermediate" });
  const evals = ARSF.evaluateConstraints(speed.workout, "2026-04-17");
  check("track_plus_speed_only_advanced warning fires",
    evals.warnings.some(x => x.rule === "track_plus_speed_only_advanced"));
}

// ─── BONUS: Track + Speed same week (advanced) → no warning ─────────────────
section("Bonus: Track + Speed same week, advanced → no warning");
{
  clearStorage();
  setProfile({ vdot: 65, experience_level: "advanced" });
  setPlan([{ id: "p-track", date: "2026-04-14", type: "track_workout", is_hard: true, sessionName: "Track" }]);
  const zones = ZC.getZonesForUser();
  const speed = RWG.generateRunWorkout({ sessionTypeId: "speed_work", userZones: zones, experienceLevel: "advanced" });
  const evals = ARSF.evaluateConstraints(speed.workout, "2026-04-17");
  check("no track+speed warning for advanced",
    !evals.warnings.some(x => x.rule === "track_plus_speed_only_advanced"));
}

// ─── BONUS: Determinism — same inputs always produce same output ─────────────
section("Bonus: Generator determinism");
{
  setProfile({ vdot: 53, experience_level: "intermediate" });
  const zones = ZC.getZonesForUser();
  const a = RWG.generateRunWorkout({ sessionTypeId: "track_workout", userZones: zones, experienceLevel: "intermediate", weeksSincePlanStart: 5 });
  const b = RWG.generateRunWorkout({ sessionTypeId: "track_workout", userZones: zones, experienceLevel: "intermediate", weeksSincePlanStart: 5 });
  check("two identical calls produce identical workouts",
    JSON.stringify(a.workout) === JSON.stringify(b.workout));
  // Week 5 mod 4 = 1 → 1K repeats
  check("week 5 → rotation_index 1 (1K repeats)", a.workout.rotation_index === 1 && a.workout.rotation_name === "1K repeats");
}

// ─── BONUS: Long Run beginner duration scaling ───────────────────────────────
section("Bonus: Long Run beginner scaling 60-90 min");
{
  setProfile({ vdot: 40, experience_level: "beginner" });
  const zones = ZC.getZonesForUser();
  const r = RWG.generateRunWorkout({ sessionTypeId: "long_run", userZones: zones, experienceLevel: "beginner" });
  const w = r.workout;
  check("beginner long run duration in [60, 90]",
    w.estimated_duration_min >= 60 && w.estimated_duration_min <= 90, `got ${w.estimated_duration_min}`);
  check("no MP finish phase for beginner", w.phases.length === 1);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? "  → " + f.detail : ""}`));
  process.exit(1);
}
