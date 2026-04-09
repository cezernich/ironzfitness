// diversification-tests.js
// Full Phase 3 golden tests: variant libraries, deterministic fallback,
// modality generators, AI variant selector with mocked Edge Function,
// cache hit rate, validation rejection, and the 16-week tri plan smoke test.
//
// Run: `node diversification-tests.js`

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
global.fetch = () => Promise.reject(new Error("fetch should not be called in this harness"));
global.AbortController = class {
  constructor() { this.signal = { aborted: false }; }
  abort() { this.signal.aborted = true; }
};

require("./js/variant-libraries/run.js");
require("./js/variant-libraries/bike.js");
require("./js/variant-libraries/swim.js");
require("./js/variant-libraries/strength.js");
require("./js/variant-libraries/hybrid.js");
require("./js/variant-libraries/index.js");
require("./js/deterministic-variant-rotation.js");
require("./js/bike-workout-generator.js");
require("./js/swim-workout-generator.js");
require("./js/strength-workout-generator.js");
require("./js/ai-variant-selector.js");

const VL  = window.VariantLibraries;
const DVR = window.DeterministicVariantRotation;
const BWG = window.BikeWorkoutGenerator;
const SWG = window.SwimWorkoutGenerator;
const StWG = window.StrengthWorkoutGenerator;
const AVS = window.AIVariantSelector;

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`); }
}
function section(t) { console.log("\n" + t); }
function clearAll() { localStorage.clear(); AVS._resetCacheForTests(); }

// ─── PHASE A: Modality generators consume variants correctly ─────────────────

section("A. BikeWorkoutGenerator — bike_ftp_2x20 with FTP 250");
{
  const r = BWG.generateBikeWorkout({
    sessionTypeId: "bike_intervals_ftp",
    variantId: "bike_ftp_2x20",
    userZones: { ftp: 250 },
    experienceLevel: "intermediate",
  });
  const w = r.workout;
  check("3 phases (WU/main/CD)", w.phases.length === 3);
  check("warmup 15 min", w.phases[0].duration_min === 15);
  check("cooldown 10 min", w.phases[2].duration_min === 10);
  check("main mentions 2x20 min", /2x20 min/.test(w.phases[1].instruction), w.phases[1].instruction);
  // 250W * 0.95 = 237.5 → 238 (Math.round), * 1.00 = 250 → "238–250 W"
  check("main shows correct power range 238–250 W",
    /238–250 W/.test(w.phases[1].instruction), w.phases[1].instruction);
  check("variant_id stored", w.variant_id === "bike_ftp_2x20");
}

section("B. BikeWorkoutGenerator — VO2 30/30 shuttles intermediate");
{
  const r = BWG.generateBikeWorkout({
    sessionTypeId: "bike_intervals_vo2",
    variantId: "bike_vo2_30_30",
    userZones: { ftp: 250 },
    experienceLevel: "intermediate",
  });
  const w = r.workout;
  check("rep count for intermediate = 15", w.phases[1].rep_count === 15, `got ${w.phases[1].rep_count}`);
  // 250 * 1.30 = 325 W
  check("power target 325 W", /325 W/.test(w.phases[1].instruction), w.phases[1].instruction);
}

section("C. SwimWorkoutGenerator — 8x100 at CSS=90 (1:30/100m)");
{
  const r = SWG.generateSwimWorkout({
    sessionTypeId: "swim_css_intervals",
    variantId: "swim_css_8x100",
    userZones: { css: 90 },
    experienceLevel: "intermediate",
  });
  const w = r.workout;
  check("3 phases", w.phases.length === 3);
  check("main is 8x100m", /8x100m/.test(w.phases[1].instruction), w.phases[1].instruction);
  check("pace 1:30/100m", /1:30\/100m/.test(w.phases[1].instruction), w.phases[1].instruction);
  check("total distance 400 + 800 + 200 = 1400 m", w.estimated_distance_m === 1400);
}

section("D. SwimWorkoutGenerator — descending 10x100 with CSS=90");
{
  const r = SWG.generateSwimWorkout({
    sessionTypeId: "swim_css_intervals",
    variantId: "swim_css_descending_10x100",
    userZones: { css: 90 },
    experienceLevel: "intermediate",
  });
  // first 5 at css_plus_5 = 95s = 1:35; last 5 at css = 1:30
  check("first set 5x100 at 1:35/100m", /5x100 @ 1:35\/100m/.test(r.workout.phases[1].instruction),
    r.workout.phases[1].instruction);
  check("second set 5x100 at 1:30/100m", /5x100 @ 1:30\/100m/.test(r.workout.phases[1].instruction),
    r.workout.phases[1].instruction);
}

section("E. StrengthWorkoutGenerator — compounds do NOT rotate, accessories do");
{
  const week0 = StWG.generateStrengthWorkout({
    compoundLifts: ["squat", "bench"],
    accessories: [
      { category: "accessory_quad",            variantId: "acc_walking_lunge" },
      { category: "accessory_hamstring_glute", variantId: "acc_rdl" },
    ],
    weekNumber: 0,
    experienceLevel: "intermediate",
    compoundBaselines: { squat: 225, bench: 185 },
  });
  check("compound block count = 2", week0.workout.compound_lifts.length === 2);
  check("squat compound resolved to back_squat (cycle 0)", week0.workout.compound_lifts[0].variant === "back_squat");
  check("bench compound resolved to flat_bench (cycle 0)", week0.workout.compound_lifts[1].variant === "flat_bench");
  check("squat cycle_week = 1", week0.workout.compound_lifts[0].cycle_week === 1);
  check("squat load_lbs starts at 225", week0.workout.compound_lifts[0].load_lbs === 225);
  check("accessory walking lunge present", week0.workout.accessories.some(a => a.variant_id === "acc_walking_lunge"));

  // Week 4 (still in cycle 0 of 5-week cycles → cycle_week = 5)
  const week4 = StWG.generateStrengthWorkout({
    compoundLifts: ["squat"],
    accessories: [],
    weekNumber: 4,
    compoundBaselines: { squat: 225 },
  });
  check("week 4 squat still back_squat (same cycle)", week4.workout.compound_lifts[0].variant === "back_squat");
  check("week 4 cycle_week = 5", week4.workout.compound_lifts[0].cycle_week === 5);
  check("week 4 load progressed to 225 + 4*5 = 245", week4.workout.compound_lifts[0].load_lbs === 245);

  // Week 5 = start of cycle 1 → next compound in chain (front_squat)
  const week5 = StWG.generateStrengthWorkout({
    compoundLifts: ["squat"],
    accessories: [],
    weekNumber: 5,
    compoundBaselines: { squat: 225 },
  });
  check("week 5 squat advances to front_squat (next cycle)",
    week5.workout.compound_lifts[0].variant === "front_squat");
  check("week 5 cycle_week resets to 1", week5.workout.compound_lifts[0].cycle_week === 1);
}

section("F. Strength: isCompoundLift / isAccessoryCategory classification");
{
  check("squat is compound", StWG.isCompoundLift("squat"));
  check("accessory_quad is accessory", StWG.isAccessoryCategory("accessory_quad"));
  check("track_workout is NOT a strength category", !StWG.isAccessoryCategory("track_workout"));
}

// ─── PHASE B: AI variant selector with mocked Edge Function ──────────────────

section("G. AI selector — successful pick is cached and returned");
{
  clearAll();
  AVS.__setEdgeFnOverrideForTests(async () => ({
    ok: true, json: { variantId: "track_1k_i_pace", rationale: "user has not done this in 4 weeks" },
  }));
  let result;
  (async () => {
    result = await AVS.selectVariant({
      userId: "u1",
      sessionTypeId: "track_workout",
      weekNumber: 0,
      recentHistory: ["track_yasso_800s"],
      userProfile: { experience_level: "intermediate" },
      weekStartDate: "2026-04-13",
    });
  })();
  // Wait one tick for the async to settle
}

// Because we're in Node and need real awaits, switch to an async runner.
async function runAsyncTests() {
  section("G. AI selector — successful pick is cached and returned");
  clearAll();
  AVS.__setEdgeFnOverrideForTests(async () => ({
    ok: true, json: { variantId: "track_1k_i_pace", rationale: "user has not done this in 4 weeks" },
  }));
  const r1 = await AVS.selectVariant({
    userId: "u1",
    sessionTypeId: "track_workout",
    weekNumber: 0,
    recentHistory: ["track_yasso_800s"],
    userProfile: { experience_level: "intermediate" },
    weekStartDate: "2026-04-13",
  });
  check("AI returned variant id", r1.variantId === "track_1k_i_pace");
  check("not from fallback", r1.fromFallback === false);
  check("not from cache", r1.fromCache === false);
  check("counter incremented to 1", AVS._peekCallCounter() === 1);

  // Second call same week+session = cache hit
  const r2 = await AVS.selectVariant({
    userId: "u1",
    sessionTypeId: "track_workout",
    weekNumber: 0,
    recentHistory: ["track_yasso_800s"],
    userProfile: { experience_level: "intermediate" },
    weekStartDate: "2026-04-13",
  });
  check("cache hit on second call", r2.fromCache === true);
  check("counter still 1 (no extra call)", AVS._peekCallCounter() === 1);

  section("H. AI selector — invalid variant id triggers fallback");
  clearAll();
  AVS.__setEdgeFnOverrideForTests(async () => ({
    ok: true, json: { variantId: "track_made_up_workout", rationale: "fake" },
  }));
  const rh = await AVS.selectVariant({
    userId: "u2",
    sessionTypeId: "track_workout",
    weekNumber: 0,
    recentHistory: [],
    userProfile: { experience_level: "intermediate" },
    weekStartDate: "2026-04-20",
  });
  check("fallback fired", rh.fromFallback === true);
  check("fallback_reason = invalid_response", rh.fallback_reason === "invalid_response", `got ${rh.fallback_reason}`);
  // Real variant id from the library
  const realIds = window.VARIANT_LIBRARY_RUN.variants.track_workout.map(v => v.id);
  check("returned variant is in the library", realIds.includes(rh.variantId));

  section("I. AI selector — model returns a recently-used variant → fallback");
  clearAll();
  AVS.__setEdgeFnOverrideForTests(async () => ({
    ok: true, json: { variantId: "track_yasso_800s", rationale: "stale" },
  }));
  const rs = await AVS.selectVariant({
    userId: "u3",
    sessionTypeId: "track_workout",
    weekNumber: 0,
    recentHistory: ["track_yasso_800s", "track_1k_i_pace"],
    userProfile: { experience_level: "intermediate" },
    weekStartDate: "2026-04-27",
  });
  check("fallback fired (stale_selection)", rs.fromFallback === true);
  check("fallback_reason = stale_selection", rs.fallback_reason === "stale_selection",
    `got ${rs.fallback_reason}`);
  check("returned variant NOT in recent window",
    !["track_yasso_800s", "track_1k_i_pace"].includes(rs.variantId), rs.variantId);

  section("J. AI selector — API timeout → fallback");
  clearAll();
  AVS.__setEdgeFnOverrideForTests(async () => ({ ok: false, reason: "timeout" }));
  const rt = await AVS.selectVariant({
    userId: "u4",
    sessionTypeId: "track_workout",
    weekNumber: 1,
    recentHistory: [],
    userProfile: { experience_level: "intermediate" },
    weekStartDate: "2026-05-04",
  });
  check("fallback on timeout", rt.fromFallback === true);
  check("fallback_reason = timeout", rt.fallback_reason === "timeout");

  section("K. AI selector — API 5xx → fallback");
  clearAll();
  AVS.__setEdgeFnOverrideForTests(async () => ({ ok: false, reason: "api_error_502" }));
  const re = await AVS.selectVariant({
    userId: "u5", sessionTypeId: "track_workout", weekNumber: 2, recentHistory: [],
    userProfile: { experience_level: "intermediate" }, weekStartDate: "2026-05-11",
  });
  check("fallback on api_error", re.fromFallback === true);
  check("fallback_reason starts with api_error", /^api_error/.test(re.fallback_reason));

  section("L. AI selector — excluded session type bypasses AI entirely");
  clearAll();
  let edgeCalled = false;
  AVS.__setEdgeFnOverrideForTests(async () => { edgeCalled = true; return { ok: true, json: {} }; });
  const rx = await AVS.selectVariant({
    userId: "u6", sessionTypeId: "easy_recovery", weekNumber: 0, recentHistory: [],
    userProfile: { experience_level: "intermediate" }, weekStartDate: "2026-05-11",
  });
  check("Edge Function NOT called for easy_recovery", edgeCalled === false);
  check("returned variant from library", ["easy_flat", "easy_trail"].includes(rx.variantId));

  section("M. AI selector — beginner cannot get intermediate-only variant");
  clearAll();
  AVS.__setEdgeFnOverrideForTests(async () => ({
    ok: true, json: { variantId: "track_mile_repeats", rationale: "..." },
  }));
  const rb = await AVS.selectVariant({
    userId: "u7", sessionTypeId: "track_workout", weekNumber: 0, recentHistory: [],
    userProfile: { experience_level: "beginner" }, weekStartDate: "2026-05-11",
  });
  // The Edge Function shouldn't have been able to return mile_repeats because
  // we filter the library before sending. But even if it did, validation
  // catches it. Either way, the result must NOT be track_mile_repeats.
  check("beginner did not receive track_mile_repeats", rb.variantId !== "track_mile_repeats");

  section("N. AI selector — 21st call/week silently falls back");
  clearAll();
  AVS.__setEdgeFnOverrideForTests(async () => ({
    ok: true, json: { variantId: "track_1k_i_pace", rationale: "..." },
  }));
  // Pre-bump the counter to 20 — use 20 unique cache keys so each call hits the AI.
  for (let i = 0; i < 20; i++) {
    const d = new Date("2026-01-05T00:00:00"); // arbitrary Mon
    d.setDate(d.getDate() + i * 7);
    await AVS.selectVariant({
      userId: "ucap", sessionTypeId: "track_workout",
      weekNumber: i, recentHistory: [],
      userProfile: { experience_level: "intermediate" },
      weekStartDate: d.toISOString().slice(0, 10),
    });
  }
  check("counter at cap (20)", AVS._peekCallCounter() === 20);
  // 21st call: must NOT call edge function
  let edgeHit = false;
  AVS.__setEdgeFnOverrideForTests(async () => { edgeHit = true; return { ok: true, json: { variantId: "track_yasso_800s", rationale: "" } }; });
  const r21 = await AVS.selectVariant({
    userId: "ucap", sessionTypeId: "tempo_threshold",
    weekNumber: 0, recentHistory: [],
    userProfile: { experience_level: "intermediate" },
    weekStartDate: "2026-06-01",
  });
  check("21st call did NOT hit Edge Function", edgeHit === false);
  check("21st call fallback_reason = weekly_cap", r21.fallback_reason === "weekly_cap");

  section("O. Cache hit rate — simulated re-read test");
  clearAll();
  AVS.__setEdgeFnOverrideForTests(async () => ({
    ok: true, json: { variantId: "track_1k_i_pace", rationale: "" },
  }));
  // First write
  await AVS.selectVariant({
    userId: "uhit", sessionTypeId: "track_workout",
    weekNumber: 0, recentHistory: [],
    userProfile: { experience_level: "intermediate" },
    weekStartDate: "2026-04-13",
  });
  // 9 re-reads
  let hits = 0;
  for (let i = 0; i < 9; i++) {
    const r = await AVS.selectVariant({
      userId: "uhit", sessionTypeId: "track_workout",
      weekNumber: 0, recentHistory: [],
      userProfile: { experience_level: "intermediate" },
      weekStartDate: "2026-04-13",
    });
    if (r.fromCache) hits++;
  }
  console.log(`     re-read cache hits: ${hits}/9 (${Math.round(hits/9*100)}%)`);
  check("cache hit rate = 9/9 on identical re-reads", hits === 9);
  check("only one Edge Function call across 10 reads", AVS._peekCallCounter() === 1);

  // ─── 16-week TRI plan smoke test ─────────────────────────────────────────────
  section("P. 16-week triathlon plan — diversification + threshold weeks coexist");
  clearAll();

  // Set up the threshold-week scheduler context
  const TW = require("./threshold-week-scheduler.js");
  const profile = { vdot: 53, experience_level: "intermediate", goal_race_date: "2026-08-01" };
  const planStart = "2026-04-13"; // Mon, 16 weeks before race-ish
  const thresholdWeeks = TW.listThresholdWeeksForPlan(profile, planStart, "2026-08-01");
  console.log(`     threshold weeks scheduled: ${thresholdWeeks.length}`);
  console.log(`     dates: ${thresholdWeeks.map(t => TW.toDateStr(t.thresholdWeekStartDate)).join(", ")}`);
  check("at least one threshold week scheduled", thresholdWeeks.length >= 1);
  // Confirm test spread: every threshold week should have swim/bike/run on
  // different days when built for triathlon profile.
  const firstTWMonday = thresholdWeeks[0].thresholdWeekStartDate;
  const triDays = TW.buildThresholdWeekDays(firstTWMonday, "triathlon");
  const tests = triDays.filter(d => d.type === "swim_test" || d.type === "bike_test" || d.type === "run_test");
  const testDates = new Set(tests.map(t => t.date));
  check("triathlon threshold week has 3 tests", tests.length === 3);
  check("all 3 tests on different days", testDates.size === 3);

  // Generate variant selections for swim/bike/run interval sessions across the 16 weeks
  AVS.__setEdgeFnOverrideForTests(async (payload) => {
    // Mock: returns the deterministic pick to keep things repeatable
    const det = window.DeterministicVariantRotation.pickVariant({
      variants: payload.variantLibrary,
      weekNumber: payload.weekNumber,
      recentHistory: payload.recentHistory || [],
    });
    return { ok: true, json: { variantId: det.variantId, rationale: "mock-deterministic" } };
  });

  const trackPicks = [];
  const ftpPicks   = [];
  const cssPicks   = [];
  const recentTrack = []; const recentFtp = []; const recentCss = [];
  for (let w = 0; w < 16; w++) {
    const date = new Date("2026-04-13T00:00:00");
    date.setDate(date.getDate() + w * 7);
    const ds = date.toISOString().slice(0, 10);
    const t = await AVS.selectVariant({
      userId: "tri", sessionTypeId: "track_workout", weekNumber: w,
      recentHistory: recentTrack, userProfile: { experience_level: "intermediate" }, weekStartDate: ds,
    });
    trackPicks.push(t.variantId); recentTrack.unshift(t.variantId); if (recentTrack.length > 5) recentTrack.length = 5;
    const f = await AVS.selectVariant({
      userId: "tri", sessionTypeId: "bike_intervals_ftp", weekNumber: w,
      recentHistory: recentFtp, userProfile: { experience_level: "intermediate" }, weekStartDate: ds, sport: "bike",
    });
    ftpPicks.push(f.variantId); recentFtp.unshift(f.variantId); if (recentFtp.length > 5) recentFtp.length = 5;
    const c = await AVS.selectVariant({
      userId: "tri", sessionTypeId: "swim_css_intervals", weekNumber: w,
      recentHistory: recentCss, userProfile: { experience_level: "intermediate" }, weekStartDate: ds, sport: "swim",
    });
    cssPicks.push(c.variantId); recentCss.unshift(c.variantId); if (recentCss.length > 5) recentCss.length = 5;
  }

  console.log("     16-week track picks: " + trackPicks.join(", "));
  console.log("     16-week ftp picks:   " + ftpPicks.join(", "));
  console.log("     16-week css picks:   " + cssPicks.join(", "));

  check("16 track picks", trackPicks.length === 16);
  check("16 ftp picks",   ftpPicks.length === 16);
  check("16 css picks",   cssPicks.length === 16);
  check("track: no back-to-back duplicates",
    trackPicks.every((id, i) => i === 0 || id !== trackPicks[i - 1]));
  check("ftp: no back-to-back duplicates",
    ftpPicks.every((id, i) => i === 0 || id !== ftpPicks[i - 1]));
  check("css: no back-to-back duplicates",
    cssPicks.every((id, i) => i === 0 || id !== cssPicks[i - 1]));
  check("track: ≥4 distinct variants used", new Set(trackPicks).size >= 4);
  check("ftp: ≥4 distinct variants used",   new Set(ftpPicks).size >= 4);
  check("css: ≥4 distinct variants used",   new Set(cssPicks).size >= 4);

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(`  - ${f.name}${f.detail ? "  → " + f.detail : ""}`));
    process.exit(1);
  }
}

runAsyncTests().catch(e => { console.error("HARNESS CRASH:", e); process.exit(2); });
