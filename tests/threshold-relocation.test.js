// Threshold tests must survive explicit weekly templates (#31 review).
// Default test days are Tue CSS / Thu FTP / Sat 5K. When the athlete's
// template has no slot for that sport on that day, the test moves within
// its week instead of being deleted.
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const root = path.join(__dirname, "..");
function load() {
  const store = new Map();
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Date, Math, JSON, Map, Set, Promise,
    setTimeout: () => 1, clearTimeout() {}, navigator: { onLine: true }, ICONS: { flag: "" },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    document: { getElementById: () => null, querySelector: () => null, addEventListener() {} },
    alert() {}, confirm: () => true,
  });
  ctx.window = ctx;
  for (const f of ["js/db.js", "js/threshold-week-scheduler.js", "js/plan-session-distribution.js", "js/plan-constraint-validator.js", "js/planner.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  }
  store.set("thresholds", "{}"); // no thresholds on file: tests must be scheduled
  return ctx;
}

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const dow = d => DOW[new Date(d + "T00:00:00Z").getUTCDay()];
const days = (a, b) => Math.abs((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 864e5);
const mondayOf = d => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7); return x.toISOString().slice(0, 10); };

function build(template) {
  const ctx = load();
  const raceDate = new Date(); raceDate.setDate(raceDate.getDate() + 300);
  const race = { id: "r", type: "ironman", name: "Synthetic IM", date: raceDate.toISOString().slice(0, 10), priority: "A", level: "intermediate", daysPerWeek: 7 };
  if (template) race.preferences = { weeklyTemplate: template, daysPerWeek: Object.values(template).filter(v => v.length).length };
  const res = vm.runInContext("_buildRacePlanReplacement", ctx)(race, { persist: false });
  return (res && res.trainingPlan) || res || [];
}

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  PASS: " + name); }
  catch (e) { failed++; console.log("  FAIL: " + name + "\n    " + e.message); }
}

// Synthetic triathlon template: no swim on Tue, no bike on Thu.
const TRI = {
  mon: ["swim-css"], tue: ["bike-interval", "strength-full"], wed: ["run-long", "swim-endurance"],
  thu: ["swim-css", "run-interval"], fri: ["bike-long", "strength-full"], sat: ["bike-endurance", "run-easy"], sun: ["run-easy"],
};
const plan = build(TRI);
const tests = plan.filter(e => e.isThresholdTest);
const byWeek = new Map();
tests.forEach(e => { const m = mondayOf(e.date); byWeek.set(m, [...(byWeek.get(m) || []), e]); });

t("plan has threshold weeks", () => assert.ok(byWeek.size >= 1, "no threshold weeks"));
t("every threshold week keeps swim, bike, and run tests", () => {
  for (const [m, w] of byWeek) {
    const types = new Set(w.map(e => e.thresholdTestType));
    for (const want of ["SWIM_CSS", "BIKE_FTP_20", "RUN_5K_TT"]) assert.ok(types.has(want), `${m} missing ${want}`);
  }
});
t("each test sits on a day the template has for that sport", () => {
  for (const e of tests) {
    const slots = TRI[dow(e.date)] || [];
    assert.ok(slots.some(c => c.split("-")[0] === e.discipline), `${e.thresholdTestType} on ${dow(e.date)} ${e.date}`);
  }
});
t("tests stay inside their original week and have a day between them", () => {
  for (const [, w] of byWeek) {
    const ds = w.map(e => e.date).sort();
    for (let i = 1; i < ds.length; i++) assert.ok(days(ds[i], ds[i - 1]) >= 2, `tests ${ds[i - 1]} and ${ds[i]} too close`);
    w.forEach(e => { if (e.relocatedFrom) assert.strictEqual(mondayOf(e.relocatedFrom), mondayOf(e.date)); });
  }
});
t("a test day carries no other threshold-week session", () => {
  for (const e of tests) {
    const same = plan.filter(x => x.date === e.date && x !== e && x.isThresholdWeek);
    assert.strictEqual(same.length, 0, `${e.date} also has ${same.map(x => x.sessionName)}`);
  }
});
t("no session lands on a day/sport the template excludes", () => {
  for (const e of plan) {
    if (e.discipline === "race" || e.phase === "Race" || e.load === "rest") continue;
    const slots = TRI[dow(e.date)] || [];
    assert.ok(slots.some(c => c.split("-")[0] === e.discipline), `${e.discipline} on ${dow(e.date)} ${e.date}`);
  }
});

t("a test that already fits its day does not move (Sat 5K stays; Tue FTP / Thu CSS)", () => {
  const want = { SWIM_CSS: "thu", BIKE_FTP_20: "tue", RUN_5K_TT: "sat" };
  tests.forEach(e => assert.strictEqual(dow(e.date), want[e.thresholdTestType], `${e.thresholdTestType} on ${dow(e.date)}`));
  tests.filter(e => e.thresholdTestType === "RUN_5K_TT").forEach(e => assert.ok(!e.relocatedFrom, "5K moved"));
});

// No template: defaults unchanged (Tue CSS / Thu FTP / Sat 5K).
const plain = build(null).filter(e => e.isThresholdTest);
t("without a template, tests stay on Tue / Thu / Sat", () => {
  assert.ok(plain.length >= 3, "no tests generated");
  const want = { SWIM_CSS: "tue", BIKE_FTP_20: "thu", RUN_5K_TT: "sat" };
  plain.forEach(e => assert.strictEqual(dow(e.date), want[e.thresholdTestType], `${e.thresholdTestType} on ${dow(e.date)}`));
  plain.forEach(e => assert.ok(!e.relocatedFrom, "moved without a reason"));
});

console.log(`\nthreshold relocation: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
