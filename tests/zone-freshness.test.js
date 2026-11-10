// Training Zones out-of-date flag (owner request, 9 Nov): flag a sport whose
// zones are 8+ weeks old or whose test was skipped in the latest test week.
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");

function load(store) {
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Date, Math, JSON, isFinite,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/threshold-reminders.js"), "utf8"), ctx);
  return ctx.ThresholdReminders;
}
const ymd = d => d.toISOString().slice(0, 10);
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  PASS: " + name); }
  catch (e) { failed++; console.log("  FAIL: " + name + "\n    " + e.message); }
}

const zonesAt = when => JSON.stringify({
  swimming: { css: 98, lastUpdated: when.toISOString() },
  biking: { ftp: 250, lastUpdated: when.toISOString() },
  running: { vdot: 50, lastUpdated: when.toISOString() },
});

t("fresh zones: no flag", () => {
  const R = load({ profile: "{}", trainingZones: zonesAt(daysAgo(10)) });
  assert.strictEqual(R.zoneFreshness("swimming", []).flag, false);
});
t("zones 8+ weeks old: flagged with the age in weeks", () => {
  const R = load({ profile: "{}", trainingZones: zonesAt(daysAgo(70)) });
  const f = R.zoneFreshness("biking", []);
  assert.strictEqual(f.flag, true);
  assert.strictEqual(f.ageWeeks, 10);
  assert.ok(/Not updated in 10 weeks/.test(f.text), f.text);
});
t("no zones set: no flag (onboarding nudge handles that)", () => {
  const R = load({ profile: "{}", trainingZones: "{}" });
  assert.strictEqual(R.zoneFreshness("running", []).flag, false);
});
t("skipped in the latest test week: flagged even if zones are recent", () => {
  const R = load({ profile: "{}", trainingZones: zonesAt(daysAgo(30)) });
  const plan = [
    { date: ymd(daysAgo(5)), isThresholdWeek: true, thresholdTestsSkipped: ["SWIM_CSS"] },
    { date: ymd(daysAgo(4)), isThresholdWeek: true, isThresholdTest: true, discipline: "bike", thresholdTestType: "BIKE_FTP_20" },
  ];
  const swim = R.zoneFreshness("swimming", plan);
  assert.strictEqual(swim.flag, true);
  assert.ok(swim.skippedRecently && /no room/.test(swim.text));
  assert.strictEqual(R.zoneFreshness("biking", plan).flag, false, "bike was tested");
});
t("next scheduled test is reported", () => {
  const R = load({ profile: "{}", trainingZones: zonesAt(daysAgo(70)) });
  const future = ymd(daysAgo(-12));
  const f = R.zoneFreshness("running", [{ date: future, isThresholdTest: true, discipline: "run" }]);
  assert.strictEqual(f.nextTest, future);
});
t("an older skip doesn't flag after a later test week tested that sport", () => {
  const R = load({ profile: "{}", trainingZones: zonesAt(daysAgo(10)) });
  const plan = [
    { date: ymd(daysAgo(40)), isThresholdWeek: true, thresholdTestsSkipped: ["SWIM_CSS"] },
    { date: ymd(daysAgo(10)), isThresholdWeek: true, isThresholdTest: true, discipline: "swim", thresholdTestType: "SWIM_CSS" },
  ];
  assert.strictEqual(R.zoneFreshness("swimming", plan).flag, false);
});

// Dismissing a skipped-test notice hides it for good and syncs the choice.
{
  const src = fs.readFileSync(path.join(__dirname, "..", "js/calendar.js"), "utf8");
  const a = src.indexOf("function _loadThresholdNoticesDismissed");
  const b = src.indexOf("function _isRatingAlertDismissed");
  const store = {}; const synced = []; const removed = [];
  const el = { getAttribute: () => "2030-03-04:SWIM_CSS", parentElement: { removeChild: () => removed.push(1) } };
  const ctx = vm.createContext({
    JSON, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { querySelectorAll: () => [el] },
  });
  ctx.window = ctx; ctx.DB = { syncKey: k => synced.push(k) };
  vm.runInContext(src.slice(a, b), ctx);
  t("dismissed notice stays dismissed and syncs", () => {
    assert.strictEqual(ctx._isThresholdNoticeDismissed("2030-03-04:SWIM_CSS"), false);
    ctx.dismissThresholdNotice("2030-03-04:SWIM_CSS");
    assert.strictEqual(ctx._isThresholdNoticeDismissed("2030-03-04:SWIM_CSS"), true);
    assert.strictEqual(ctx._isThresholdNoticeDismissed("2030-04-01:SWIM_CSS"), false, "a new week's notice still shows");
    assert.ok(synced.includes("thresholdNoticesDismissed") && removed.length === 1);
  });
  t("dismissal key is a synced key", () => {
    assert.ok(/'thresholdNoticesDismissed'/.test(fs.readFileSync(path.join(__dirname, "..", "js/db.js"), "utf8")));
  });
}

console.log(`\nzone freshness: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
