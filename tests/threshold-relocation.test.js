// Threshold tests must survive explicit weekly templates (#31 review).
// Default test days are Tue FTP / Thu CSS / Sat 5K (no template only). When the athlete's
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

// Synthetic triathlon template: no bike on Tue, no swim on Thu.
const TRI = {
  mon: ["bike-interval", "swim-css"], tue: ["swim-endurance", "strength-full"], wed: ["run-long", "swim-endurance"],
  thu: ["run-interval"], fri: ["bike-long", "strength-full"], sat: ["bike-endurance", "run-easy"], sun: ["run-easy"],
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
const TWm = load().ThresholdWeekScheduler;
t("tests stay in their week; bike and run tests two full days apart, others one", () => {
  for (const [, w] of byWeek) {
    for (const a of w) for (const b of w) if (a !== b)
      assert.ok(days(a.date, b.date) >= TWm.minTestGap(a.discipline, b.discipline), `${a.thresholdTestType} ${a.date} vs ${b.thresholdTestType} ${b.date}`);
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

t("only tests that must move do (5K stays Sat; FTP to Mon, CSS to Tue or Wed)", () => {
  const want = { SWIM_CSS: ["tue", "wed"], BIKE_FTP_20: ["mon"], RUN_5K_TT: ["sat"] };
  tests.forEach(e => assert.ok(want[e.thresholdTestType].includes(dow(e.date)), `${e.thresholdTestType} on ${dow(e.date)}`));
  tests.filter(e => e.thresholdTestType === "RUN_5K_TT").forEach(e => assert.ok(!e.relocatedFrom, "5K moved"));
});

// No template: defaults unchanged (Tue CSS / Thu FTP / Sat 5K).
const plain = build(null).filter(e => e.isThresholdTest);
t("without a template, tests stay on Tue FTP / Thu CSS / Sat 5K", () => {
  assert.ok(plain.length >= 3, "no tests generated");
  const want = { SWIM_CSS: "thu", BIKE_FTP_20: "tue", RUN_5K_TT: "sat" };
  plain.forEach(e => assert.strictEqual(dow(e.date), want[e.thresholdTestType], `${e.thresholdTestType} on ${dow(e.date)}`));
  plain.forEach(e => assert.ok(!e.relocatedFrom, "moved without a reason"));
});

// Template that can never fit both leg tests legally (bike only Thu, run only Sat).
const TIGHT = { mon: ["swim-css"], tue: [], wed: ["swim-endurance"], thu: ["bike-long"], fri: [], sat: ["run-long"], sun: [] };
const tight = build(TIGHT).filter(e => e.isThresholdTest);
t("when spacing is impossible, a leg test is skipped rather than FTP Thu then 5K Sat", () => {
  const wk = new Map();
  tight.forEach(e => { const m = mondayOf(e.date); wk.set(m, [...(wk.get(m) || []), e]); });
  for (const [, w] of wk) {
    const legs = w.filter(e => e.discipline === "bike" || e.discipline === "run");
    assert.ok(legs.length <= 1, `both leg tests kept: ${legs.map(e => e.date)}`);
  }
});

console.log(`\nthreshold relocation: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
