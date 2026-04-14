// threshold-week-tests.js
// Self-contained Node test harness for the threshold-week scheduler + test result handler.
// Run: `node threshold-week-tests.js` from the fitness-app directory.
//
// Implements the Golden Test Cases from
// PHILOSOPHY_UPDATE_2026-04-09_threshold_weeks.md.

// ─── Stub the browser globals the modules expect ─────────────────────────────
global.window = global;
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; },
};
global.document = { createElement: () => ({ classList: { add() {}, remove() {} } }), getElementById: () => null, body: { appendChild() {} } };
global.requestAnimationFrame = fn => fn();
global.alert = () => {};
global.confirm = () => true;

// Load modules in order. Each one attaches to window.
require("./threshold-week-scheduler.js");
// zone-calculator references calculateHRZones internally; load it first.
require("./zone-calculator.js");
require("./test-result-handler.js");

const TW = window.ThresholdWeekScheduler;
const TRH = window.TestResultHandler;
const ZC = window.ZoneCalculator;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`);
  }
}

function section(title) {
  console.log("\n" + title);
}

function clearStorage() { localStorage.clear(); }

// ─── GOLDEN TEST 1: Runner, base phase, 6-week cadence, plan starts 2026-05-01 ─
section("Golden 1: Runner, base phase, 6-week cadence, plan starts 2026-05-01");
{
  clearStorage();
  const profile = { active_goal: "marathon" }; // base phase: no race within 56 days
  const planStart = "2026-05-01";
  // Force base phase by ensuring no goal_race_date or race more than 56 days out.
  const next = TW.computeNextThresholdWeek(profile, null, planStart, planStart);
  check("phase is base", next.phase === "base", `phase=${next.phase}`);
  check("cadence is 6", next.cadenceUsed === 6, `cadence=${next.cadenceUsed}`);
  // Expected first threshold week: planStart + 6 weeks = 2026-06-12 (Friday)
  // mondayOf(2026-06-12) = 2026-06-08 (Mon)
  const monday = TW.toDateStr(next.thresholdWeekStartDate);
  check("first threshold week falls week of 2026-06-08 (Mon containing 2026-06-12)",
    monday === "2026-06-08", `got ${monday}`);
  // Test scheduled on Thursday (dayIdx 3) → 2026-06-11
  const days = TW.buildThresholdWeekDays(next.thresholdWeekStartDate, "endurance");
  const testDay = days.find(d => d.type === "test");
  check("single-sport test day is Thursday 2026-06-11",
    testDay && testDay.date === "2026-06-11", `got ${testDay && testDay.date}`);
  // Volume target check: applyThresholdWeekVolume(40, 0.65) should return ~25
  const v = TW.applyThresholdWeekVolume(40, 0.65);
  check("volume reduction lands inside 60-70% (40 → ~26)", v >= 24 && v <= 28, `got ${v}`);
}

// ─── GOLDEN 2: Runner, race prep, A race 2026-06-01, today 2026-04-15 ────────
section("Golden 2: Race prep, A race 2026-06-01, today 2026-04-15");
{
  clearStorage();
  const profile = { goal_race_date: "2026-06-01" };
  const today = "2026-04-15";
  const phase = TW.detectPhase(profile, today);
  check("phase resolves to race_prep (within 56 days)", phase === "race_prep", `phase=${phase}`);
  const cadence = TW.resolveCadence(profile, phase);
  check("cadence defaults to 4", cadence === 4, `cadence=${cadence}`);
  // Forbidden window: 2026-05-18 .. 2026-06-01 (14 days)
  // No last-threshold-week. Plan start 2026-04-22, +4 weeks → 2026-05-20 (Wed),
  // mondayOf = 2026-05-18 which is INSIDE the forbidden window.
  // applyRaceWindowGuard must push it back so the threshold week ends strictly BEFORE 2026-05-18.
  const next = TW.computeNextThresholdWeek(profile, null, "2026-04-22", today);
  const startStr = next.thresholdWeekStartDate ? TW.toDateStr(next.thresholdWeekStartDate) : "null";
  const earliestForbidden = new Date("2026-05-18T00:00:00");
  const sundayOfWeek = next.thresholdWeekStartDate
    ? new Date(next.thresholdWeekStartDate.getTime() + 6 * 86400000)
    : null;
  check("scheduled threshold week ends strictly before 2026-05-18 forbidden window",
    sundayOfWeek && sundayOfWeek < earliestForbidden,
    `start=${startStr}, sunday=${sundayOfWeek && sundayOfWeek.toISOString().slice(0,10)}`);
  // The expected pushed-back Monday is 2026-05-11 (one full week before the window).
  check("guard pushes the Monday to 2026-05-11",
    startStr === "2026-05-11", `got ${startStr}`);
  // No day of the resulting week falls inside the 14-day race window.
  if (next.thresholdWeekStartDate) {
    const days = TW.buildThresholdWeekDays(next.thresholdWeekStartDate, "endurance");
    const insideWindow = days.some(d => d.date >= "2026-05-18" && d.date <= "2026-06-01");
    check("no day of the threshold week falls inside the 14-day race window",
      !insideWindow, "at least one day inside the forbidden window");
  }

  // Also exercise the explicit "no slot before race" path: a last-threshold-week
  // close enough to the race that min-build + race-window leaves no room.
  const noSlot = TW.computeNextThresholdWeek(profile, "2026-04-22", "2026-04-15", today);
  check("returns no_slot_before_race when min-build collides with race window",
    noSlot.thresholdWeekStartDate === null && noSlot.reason === "no_slot_before_race",
    `start=${noSlot.thresholdWeekStartDate}, reason=${noSlot.reason}`);
}

// ─── GOLDEN 3: Triathlete threshold week starts Mon 2026-06-15 ───────────────
section("Golden 3: Triathlete threshold week starts Mon 2026-06-15");
{
  const days = TW.buildThresholdWeekDays("2026-06-15", "triathlon");
  const swim = days.find(d => d.type === "swim_test");
  const bike = days.find(d => d.type === "bike_test");
  const run  = days.find(d => d.type === "run_test");
  check("swim CSS test is Thursday 2026-06-18",
    swim && swim.date === "2026-06-18", `got ${swim && swim.date}`);
  check("bike FTP test is Friday 2026-06-19 OR Saturday 2026-06-20",
    bike && (bike.date === "2026-06-19" || bike.date === "2026-06-20"), `got ${bike && bike.date}`);
  check("run 5K test is Saturday 2026-06-20 OR Sunday 2026-06-21",
    run && (run.date === "2026-06-20" || run.date === "2026-06-21"), `got ${run && run.date}`);
  // No two tests on same day
  const testDates = [swim, bike, run].filter(Boolean).map(d => d.date);
  const uniq = new Set(testDates);
  check("no two tests on the same day", uniq.size === testDates.length, `dates=${testDates.join(",")}`);
}

// ─── GOLDEN 4: Skip slides, doesn't compress ─────────────────────────────────
section("Golden 4: Skip slides 6 weeks forward (2026-06-15 → 2026-07-27)");
{
  clearStorage();
  // Pretend the user skipped the threshold week scheduled for 2026-06-15.
  TW.markThresholdWeekSkipped("2026-06-15");
  const ud = JSON.parse(localStorage.getItem("user_data") || "{}");
  check("skip recorded as last_threshold_week_date", ud.last_threshold_week_date === "2026-06-15");
  // Now schedule the next one (base phase, 6-week cadence)
  const profile = { active_goal: "marathon" };
  const next = TW.computeNextThresholdWeek(profile, ud.last_threshold_week_date, "2026-06-15", "2026-06-15");
  const startStr = TW.toDateStr(next.thresholdWeekStartDate);
  // 2026-06-15 + 6 weeks = 2026-07-27 (Mon)
  check("next threshold week is 2026-07-27 (slide), NOT 2026-07-20 (compress)",
    startStr === "2026-07-27", `got ${startStr}`);
}

// ─── GOLDEN 5: 5K test +22%, sanity check fires ──────────────────────────────
section("Golden 5: VDOT 53 → 65 (+22%) triggers sanity check");
{
  clearStorage();
  // Seed prior VDOT
  localStorage.setItem("profile", JSON.stringify({ vdot: 53 }));
  // 5K time that resolves to ~VDOT 65 = ~24:00 → 1440s (table: 1440 → 65)
  const result = TRH.processResult({
    sport: "run",
    testType: "RUN_5K_TT",
    rawInput: { finish_time_seconds: 1440 },
  });
  check("status is needs_confirmation", result.status === "needs_confirmation", `status=${result.status}`);
  check("oldValue is 53", result.oldValue === 53, `old=${result.oldValue}`);
  check("newValue around 65", Math.abs(result.newValue - 65) <= 1, `new=${result.newValue}`);
  check("changePct flagged > +15%", Math.abs(result.changePct) > 15, `pct=${result.changePct}`);
  // Profile must NOT have been mutated
  const p = JSON.parse(localStorage.getItem("profile"));
  check("profile vdot unchanged when user has not confirmed", p.vdot === 53, `vdot=${p.vdot}`);

  // Now confirm and verify it lands.
  const confirmed = TRH.processResult({
    sport: "run",
    testType: "RUN_5K_TT",
    rawInput: { finish_time_seconds: 1440 },
    forceConfirm: true,
  });
  check("status ok after force-confirm", confirmed.status === "ok", `status=${confirmed.status}`);
  const p2 = JSON.parse(localStorage.getItem("profile"));
  check("profile vdot updated to ~65", Math.abs(p2.vdot - 65) <= 1, `vdot=${p2.vdot}`);
}

// ─── GOLDEN 6: Bike FTP 250 → 260 (+4%) silently passes ──────────────────────
section("Golden 6: FTP 250W → 260W (+4%) sanity passes");
{
  clearStorage();
  localStorage.setItem("profile", JSON.stringify({ ftp_watts: 250 }));
  // FTP = 20-min avg * 0.95, so for 260W FTP: 20-min avg ≈ 273.7W
  const result = TRH.processResult({
    sport: "bike",
    testType: "BIKE_FTP_20",
    rawInput: { avg_power_20min: 273.7 },
  });
  check("status ok (silent pass)", result.status === "ok", `status=${result.status}`);
  check("newValue rounds to 260", result.newValue === 260, `new=${result.newValue}`);
  // Verify Coggan zones recalculated. Z4 at 260W FTP = round(260*0.91)..round(260*1.05) = 237..273.
  const z4 = result.zones && result.zones.bike && result.zones.bike.zones && result.zones.bike.zones.z4;
  check("Coggan Z4 lower bound = 237W", z4 && z4.low === 237, `low=${z4 && z4.low}`);
  check("Coggan Z4 upper bound = 273W", z4 && z4.high === 273, `high=${z4 && z4.high}`);
}

// ─── GOLDEN 7: Maintenance phase user → 8-week cadence ───────────────────────
section("Golden 7: Maintenance phase defaults to 8 weeks");
{
  const profile = {}; // no race, no active_goal
  const phase = TW.detectPhase(profile, "2026-04-09");
  check("phase = maintenance", phase === "maintenance");
  const cad = TW.resolveCadence(profile, phase);
  check("cadence = 8", cad === 8);
}

// ─── GOLDEN 8: Override beats phase default ──────────────────────────────────
section("Golden 8: Override 4 wins over maintenance default 8");
{
  const profile = { threshold_week_cadence_override: 4 };
  const phase = TW.detectPhase(profile, "2026-04-09");
  const cad = TW.resolveCadence(profile, phase);
  check("override 4 used", cad === 4);
}

// ─── GOLDEN 9: Min 3 weeks build between threshold weeks ─────────────────────
section("Golden 9: Two consecutive threshold weeks → planner refuses, slides");
{
  // Last threshold week was 2026-06-08. Cadence 4 would put next at 2026-07-06.
  // But pretend the planner wants to schedule next at 2026-06-15 (1 week later) — must slide.
  const candidate = new Date("2026-06-15T00:00:00");
  const guarded = TW.applyMinBuildGuard(candidate, "2026-06-08");
  // minNext = 2026-06-08 + (3+1) weeks = 2026-07-06
  const guardedStr = TW.toDateStr(guarded);
  check("minBuildGuard slides to 2026-07-06", guardedStr === "2026-07-06", `got ${guardedStr}`);
}

// ─── BONUS: Skip + slide via the scheduler with the persisted skip ───────────
section("Bonus: Skip handling via scheduler, base phase 6-week");
{
  clearStorage();
  TW.markThresholdWeekSkipped("2026-06-15");
  const ud = JSON.parse(localStorage.getItem("user_data") || "{}");
  const next = TW.computeNextThresholdWeek({ active_goal: "marathon" }, ud.last_threshold_week_date, "2026-06-15", "2026-06-15");
  check("history records the skip", ud.threshold_week_history && ud.threshold_week_history[0].status === "skipped");
  check("next slides to 2026-07-27", TW.toDateStr(next.thresholdWeekStartDate) === "2026-07-27");
}

// ─── BONUS: Volume target ranges in (60–70%) ─────────────────────────────────
section("Bonus: applyThresholdWeekVolume midpoint = 0.65");
{
  // 60 → 39, 70 → 45.5; we round to nearest 5 → 40, 45.
  check("60 → 40", TW.applyThresholdWeekVolume(60, 0.65) === 40);
  check("80 → 50 (80*0.65=52, rounded to 50)", TW.applyThresholdWeekVolume(80, 0.65) === 50);
  check("respects 15-min floor", TW.applyThresholdWeekVolume(20, 0.65) === 15);
}

// ─── BONUS: zone-calculator bike & swim formulas ─────────────────────────────
section("Bonus: zone-calculator bike + swim outputs");
{
  const bike = ZC.calculateBikeZonesFromFTP(260);
  check("bike Z4 low = 237", bike && bike.zones.z4.low === 237);
  check("bike Z4 high = 273", bike && bike.zones.z4.high === 273);
  check("bike Z2 endurance bounds 146..195", bike && bike.zones.z2.low === 146 && bike.zones.z2.high === 195);
  const swim = ZC.calculateSwimZonesFromCSS(90); // 1:30/100m
  check("swim threshold = 1:30/100", swim && swim.zones.threshold.label === "1:30/100");
  check("swim easy = 1:42/100", swim && swim.zones.easy.label === "1:42/100");
  check("swim race = 1:26/100", swim && swim.zones.race.label === "1:26/100");
}

// ─── BONUS: vdot lookup edges ────────────────────────────────────────────────
section("Bonus: vdotFromFiveK lookup");
{
  // 30:00 (1800s) → 50, 24:00 (1440s) → 65, 20:00 (1200s) → 80
  check("30:00 → 50", TRH.vdotFromFiveK(1800) === 50);
  check("24:00 → 65", TRH.vdotFromFiveK(1440) === 65);
  check("20:00 → 80", TRH.vdotFromFiveK(1200) === 80);
}

// ─── BONUS: CSS calc ─────────────────────────────────────────────────────────
section("Bonus: cssFromFourHundredAndTwoHundred");
{
  // 400m=6:00 (360s), 200m=2:50 (170s) → CSS = (360-170)/2 = 95 sec/100m
  check("(360-170)/2 = 95", TRH.cssFromFourHundredAndTwoHundred(360, 170) === 95);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? "  → " + f.detail : ""}`));
  process.exit(1);
}
