// hydration.js — Water tracking with visual bottle fill and smart daily targets

/* =====================================================================
   SAFETY CAPS
   =====================================================================
   BUGFIX 04-27 §F8: hydration target gets soft + hard caps so race-day or
   sauna stacking can't recommend dangerous amounts.
   - Soft cap (200 oz / ~5.9 L): hit when the day's combined target
     crosses what most athletes can safely drink without electrolyte
     replacement. We surface a note nudging sodium pairing but leave the
     target as-is.
   - Hard cap (300 oz / ~8.9 L): clamp ceiling. Beyond this, dilutional
     hyponatremia risk is real and the recommendation needs medical
     guidance — we cap and warn.
   Rationale (research note in BUGFIX_2026-04-27_round4.md §8): healthy
   adults handle 3-4 L without concern; endurance athletes with sodium
   replacement go up to 5 L; >5 L without electrolyte balance starts
   diluting blood sodium fast.
*/
const HYDRATION_SOFT_CAP_OZ = 200;
const HYDRATION_HARD_CAP_OZ = 300;

/* =====================================================================
   BEVERAGE TYPES & COEFFICIENTS
   ===================================================================== */

// Beverage types contribute to the hydration target at their coefficient
// (effective_oz = logged_oz × coeff). Kept tight to the drinks that
// genuinely serve hydration AND have a meaningful consumer base:
//   - Water: baseline.
//   - Sports Drink: umbrella for electrolyte drinks (Gatorade, LMNT,
//     Liquid IV, Nuun, etc.). Full coefficient — electrolytes improve
//     retention during training.
//   - Coconut Water: natural electrolyte drink, widely available in
//     grocery stores, growing athlete consumer base. Research treats
//     it as on par with water for hydration.
//
// Removed: Coffee and Tea. Both are moderately hydrating in isolation
// (the "net dehydrating" idea is a myth at typical consumption), but
// their primary use is as a stimulant, not hydration — tracking them
// toward a hydration target was leading users to believe they'd met
// fluid needs when they'd had three cups of coffee.
const BEVERAGE_TYPES = {
  water:         { label: "Water",         coeff: 1.0, icon: "\u{1F4A7}" }, // 💧
  sports_drink:  { label: "Sports Drink",  coeff: 1.0, icon: "\u26A1" },    // ⚡
  coconut_water: { label: "Coconut Water", coeff: 1.0, icon: "\u{1F965}" }, // 🥥
};

// Legacy beverage types that may still appear in saved logs from earlier
// versions. Kept here so existing entries still count toward the target;
// not offered in the new picker. Coefficients match the old values so
// historical totals don't shift retroactively.
const LEGACY_BEVERAGE_TYPES = {
  tea:    { label: "Tea",    coeff: 0.85, icon: "\u{1F375}" },
  coffee: { label: "Coffee", coeff: 0.75, icon: "\u2615" },
};

// Resolve a beverage type from either the active map or the legacy map
// so per-log entries written under an older beverage (tea/coffee) still
// compute effective oz correctly.
function _beverageFor(type) {
  return BEVERAGE_TYPES[type] || LEGACY_BEVERAGE_TYPES[type] || BEVERAGE_TYPES.water;
}

// ── Workout bonus: duration-scaled hydration (Section 11e) ──────────────
//
// Replaces the old flat lookup (strength=20, run=24, etc.) with a per-hour
// rate × actual duration, floored at 16 oz. The floor protects short
// workouts (a 20-min strength session still gets 16 oz even though
// 18/hr × 0.33 hr = 6). Ceilings are enforced only at the race-day path
// below, where the race distance determines the expected duration.
// Per-hour fluid prescription baseline. Calibrated for a ~160 lb
// athlete at moderate (Z2/Z3) intensity — the weight + intensity
// multipliers in computeWorkoutBonusOz scale these for individual
// athletes and harder sessions.
//
// Rate lift 2026-05-05: bike 22 → 25 and brick 22 → 28 after a user
// flagged that a 2-hour MEDIUM brick (sweet-spot bike + Z2 run) was
// landing at 35 oz workout-add, well below the 60-70 oz that
// sports-science guidance would prescribe for that effort. Cycling
// at sweet-spot clusters around 25-30 oz/hr in the literature; bricks
// are the most demanding 2-hour combo in endurance training (sustained
// bike sweat + run pounding) so they warrant the highest rate. Run /
// swim / hyrox / rowing held at 22 — the original calibration is
// reasonable for those sports' typical sweat rates.
const HYDRATION_RATE_OZ_PER_HOUR = {
  run: 22, running: 22, bike: 25, cycling: 25, swim: 22, swimming: 22, brick: 28, rowing: 22,
  hyrox: 22, circuit: 20,
  strength: 18, hiit: 18, weights: 18, crossfit: 18, weightlifting: 18, bodyweight: 16,
  yoga: 12, stretch: 12, flexibility: 12, mobility: 12, walking: 12,
};
const HYDRATION_FLOOR_OZ = 16;

// Intensity → sweat-rate multiplier. Sweat rate roughly doubles from
// easy aerobic (Z1–Z2) to threshold (Z4) to max (Z5+). The flat per-
// sport table underestimates hard sessions and overestimates recovery
// work. Multipliers anchored at 1.0 = typical moderate-Z2/Z3 session
// (what the rate table was already calibrated for).
const _INTENSITY_MULTIPLIER = {
  easy:      0.7,
  recovery:  0.7,
  z1:        0.7,
  z2:        0.85,
  moderate:  1.0,
  long:      1.0,   // Z2-dominant but accumulated volume handles net loss
  tempo:     1.25,
  threshold: 1.3,
  z3:        1.15,
  z4:        1.3,
  hard:      1.3,
  intervals: 1.3,
  vo2:       1.5,
  "vo2max":  1.5,
  max:       1.5,
  race:      1.5,
  "race pace": 1.5,
  z5:        1.5,
  z6:        1.6,
};
function _intensityMultiplierFromLoad(load) {
  if (!load) return 1.0;
  const key = String(load).toLowerCase().trim();
  return _INTENSITY_MULTIPLIER[key] || 1.0;
}

function computeWorkoutBonusOz(type, durationMin, opts) {
  const t = String(type || "").toLowerCase();
  const rate = HYDRATION_RATE_OZ_PER_HOUR[t] || 18;
  const hours = Math.max(0, (parseFloat(durationMin) || 0) / 60);
  // Body-weight scaling. Rate table is calibrated for ~160 lb; clamped
  // so a 100-lb athlete doesn't get hit with a negative-feeling
  // percentage cut and a 300-lb athlete doesn't blow past a sane
  // ceiling. Sweat rate doesn't scale exactly linearly with mass, but
  // linear-by-weight captures ~90% of the variance in the 100–300 lb
  // range where our athletes live.
  const rawWeight = parseFloat(opts && opts.weightLbs);
  const weightFactor = (isFinite(rawWeight) && rawWeight > 0)
    ? Math.min(2.0, Math.max(0.5, rawWeight / 160))
    : 1.0;
  const intensityFactor = _intensityMultiplierFromLoad(opts && opts.load);
  const scaled = Math.round(rate * hours * weightFactor * intensityFactor);
  return Math.max(HYDRATION_FLOOR_OZ, scaled);
}

// ── Race hydration profiles (Section 11e) ────────────────────────────────
//
// Keys match RACE_CONFIGS from planner.js so a race.type string drops in
// directly. `hours` is a middle-of-range estimate of actual race duration;
// `ratePerHour` stays in the 18–22 oz/hr band per the spec. Sodium targets
// for long races come from ACSM/Sports Dietitians Australia (500–700 mg/hr
// for events > ~2 hours); we pick a midpoint.
const RACE_HYDRATION_PROFILES = {
  fiveK:        { label: "5K",            hours: 0.5, ratePerHour: 18, sodiumMgPerHour: 0   },
  tenK:         { label: "10K",           hours: 1.0, ratePerHour: 18, sodiumMgPerHour: 0   },
  halfMarathon: { label: "Half Marathon", hours: 2.0, ratePerHour: 18, sodiumMgPerHour: 300 },
  marathon:     { label: "Marathon",      hours: 4.0, ratePerHour: 20, sodiumMgPerHour: 500 },
  sprint:       { label: "Sprint Tri",    hours: 1.5, ratePerHour: 20, sodiumMgPerHour: 300 },
  olympic:      { label: "Olympic Tri",   hours: 2.5, ratePerHour: 20, sodiumMgPerHour: 400 },
  halfIronman:  { label: "70.3 Tri",      hours: 6.0, ratePerHour: 20, sodiumMgPerHour: 500 },
  ironman:      { label: "Ironman",       hours: 12.0, ratePerHour: 22, sodiumMgPerHour: 600 },
  centuryRide:  { label: "Century Ride",  hours: 6.0, ratePerHour: 20, sodiumMgPerHour: 500 },
  granFondo:    { label: "Gran Fondo",    hours: 4.0, ratePerHour: 20, sodiumMgPerHour: 400 },
  hyrox:        { label: "Hyrox",         hours: 1.5, ratePerHour: 20, sodiumMgPerHour: 300 },
  hyroxDoubles: { label: "Hyrox Doubles", hours: 1.5, ratePerHour: 20, sodiumMgPerHour: 300 },
};

// Race-week preload — mirrors the carb-load ramp structure. Race day itself
// uses the distance-scaled bonus from RACE_HYDRATION_PROFILES, not the
// preload (to avoid stacking: the bonus already accounts for the event's
// full duration and intensity).
const RACE_WEEK_PRELOAD = {
  3: { bonusOz:  8, sodiumMg: 0,    note: "Race prep (T-3): +8 oz to your daily base. Start building hydration stores." },
  2: { bonusOz: 16, sodiumMg: 0,    note: "Race prep (T-2): +16 oz today. Keep water visible and sip steadily." },
  1: { bonusOz: 16, sodiumMg: 1500, note: "Race tomorrow (T-1): +16 oz plus ~1,500 mg sodium preload across the day (electrolyte drink or salted meals)." },
};

/* =====================================================================
   SETTINGS & TARGETS
   ===================================================================== */

function getHydrationSettings() {
  try {
    return JSON.parse(localStorage.getItem("hydrationSettings") || "{}");
  } catch { return {}; }
}

function saveHydrationSettingsData(settings) {
  localStorage.setItem("hydrationSettings", JSON.stringify(settings)); if (typeof DB !== 'undefined') DB.syncKey('hydrationSettings');
}

function getBaseHydrationTarget() {
  const settings = getHydrationSettings();
  if (settings.dailyTargetOz) return settings.dailyTargetOz;

  let weight = 160;
  try {
    const profile = JSON.parse(localStorage.getItem("profile") || "{}");
    weight = parseFloat(profile.weight) || 160;
  } catch {}

  return Math.round(weight * 0.6);
}

function getTodayWorkoutInfo() {
  return getWorkoutInfoForDate(getHydrationDate());
}

function getHydrationBreakdown() {
  return getHydrationBreakdownForDate(getHydrationDate());
}

function getHydrationTarget() {
  return getHydrationBreakdown().totalOz;
}

function getBottleSize() {
  // Legacy helper — the hydration progress bar is now oz-based, so
  // callers shouldn't generally need this anymore. Kept for the legacy
  // day-upgrade path (synthesizing entries from old bottle counts) and
  // any legacy consumers (calendar/stats) that still think in bottles.
  // Returns the first named bottle's size when the user has set any
  // up, otherwise the saved default, otherwise 12oz.
  const settings = getHydrationSettings();
  const bottles = Array.isArray(settings.bottles) ? settings.bottles : [];
  if (bottles.length && bottles[0].size) return parseFloat(bottles[0].size) || 12;
  return settings.bottleSize || 12;
}

/** Returns the list of user-defined named bottles. Empty if the user
 *  hasn't set any up yet — in that case the UI falls back to the legacy
 *  "+ My Bottle" button. */
function getNamedBottles() {
  const settings = getHydrationSettings();
  return Array.isArray(settings.bottles) ? settings.bottles : [];
}

function saveNamedBottles(bottles) {
  const settings = getHydrationSettings();
  settings.bottles = bottles;
  saveHydrationSettingsData(settings);
}

/** Log one named bottle by id — thin wrapper around logWaterOz that
 *  keeps the call site on the hydration card simple. */
function logNamedBottle(bottleId) {
  const bottles = getNamedBottles();
  const b = bottles.find(x => x.id === bottleId);
  if (!b) return;
  logWaterOz(parseFloat(b.size) || 0);
}

function isHydrationEnabled() {
  return localStorage.getItem("hydrationEnabled") !== "0";
}

function setHydrationEnabled(enabled) {
  localStorage.setItem("hydrationEnabled", enabled ? "1" : "0"); if (typeof DB !== 'undefined') DB.syncKey('hydrationEnabled');
  if (typeof trackEvent === "function") trackEvent("feature_toggled", { feature: "hydration", enabled });
  if (typeof syncFeatureToggles === "function") syncFeatureToggles();
  applyHydrationToggle();
}

function applyHydrationToggle() {
  const enabled = isHydrationEnabled();
  const card = document.getElementById("hydration-card");
  const toggle = document.getElementById("pref-hydration-toggle");
  if (card) card.style.display = enabled ? "" : "none";
  if (toggle) toggle.checked = enabled;
}

/* =====================================================================
   DAILY LOG
   ===================================================================== */

function getHydrationLog() {
  try {
    return JSON.parse(localStorage.getItem("hydrationLog") || "{}");
  } catch { return {}; }
}

// End-of-day target freeze — twin of nutrition's freezePastTargets().
// Walks every day in hydrationLog that has logged consumption and is
// older than today, computes the live breakdown (which still reflects
// that date's workout / race context), and writes the totalOz into the
// day's record as snapshotTargetOz. From then on,
// getHydrationBreakdownForDate(d) reads the snapshot for past days, so
// settings or weight changes can't drift historical adherence.
//
// Two bugs this addresses simultaneously:
//   1. Drift: previously every read recomputed live, so a weight or
//      base-target setting change moved every past day's "% of target".
//   2. Single-target-for-all-days in stats.js: `getHydrationTarget()`
//      returns today's number, and the stats panel was holding every
//      historical day to that one bar. With per-day snapshots in place,
//      stats.js can switch to per-day breakdown and adherence becomes
//      honest (rest day held to rest-day target, long-run day held to
//      long-run-day target).
function freezePastHydrationTargets() {
  let log = {};
  try { log = JSON.parse(localStorage.getItem("hydrationLog") || "{}"); } catch {}
  if (!log || typeof log !== "object") return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");

  // Helper: does a day have logged consumption worth anchoring to?
  const _dayHasIntake = (entry) => {
    if (entry == null) return false;
    if (typeof entry === "number") return entry > 0;
    if (Array.isArray(entry.entries) && entry.entries.length > 0) return true;
    if (entry.total > 0) return true;
    return false;
  };

  let frozenCount = 0;
  for (const date of Object.keys(log)) {
    if (date >= todayStr) continue;             // today / future stays live
    const day = log[date];
    if (!_dayHasIntake(day)) continue;          // nothing to anchor
    if (typeof day === "object" && day.snapshotTargetOz != null) continue; // already frozen
    let breakdown;
    try { breakdown = getHydrationBreakdownForDate(date); } catch { continue; }
    if (!breakdown || !breakdown.totalOz) continue;
    // Normalize legacy number-format entries into the object shape so
    // we have a place to attach snapshotTargetOz.
    let entry = day;
    if (typeof entry !== "object") {
      entry = { total: typeof day === "number" ? day : 0, beverages: [], entries: [] };
    }
    entry.snapshotTargetOz = breakdown.totalOz;
    entry.snapshotAt = new Date().toISOString();
    log[date] = entry;
    frozenCount++;
  }

  if (frozenCount > 0) {
    try { localStorage.setItem("hydrationLog", JSON.stringify(log)); } catch {}
    if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("hydrationLog");
    console.log("[IronZ] froze " + frozenCount + " past-day hydration target snapshot(s)");
  }
}

if (typeof window !== "undefined") {
  window.freezePastHydrationTargets = freezePastHydrationTargets;
}

/** Normalize a day's log entry to the new format. Handles legacy number format. */
function normalizeDayLog(entry) {
  if (entry == null) return { total: 0, beverages: [], entries: [] };
  if (typeof entry === "number") return { total: entry, beverages: [{ type: "water", count: entry }], entries: [] };
  if (!Array.isArray(entry.entries)) entry.entries = [];
  return entry;
}

// Upgrade a legacy day (totals/beverages only, no per-log entries) into
// the new entry-backed format by synthesizing one entry per bottle of
// its default size. Runs before the first write to a legacy day so the
// authoritative source becomes the entries array — matching new writes.
function _upgradeLegacyDay(day) {
  if (day.entries.length) return;
  if (!Array.isArray(day.beverages) || day.beverages.length === 0) return;
  const bottleSize = getBottleSize();
  for (const b of day.beverages) {
    const n = Math.round(parseFloat(b.count) || 0);
    for (let i = 0; i < n; i++) {
      day.entries.push({ type: b.type || "water", oz: bottleSize });
    }
  }
}

// Rebuild the aggregated `total` (bottle-count equivalent) and
// `beverages` from the authoritative per-log entries array. Called
// after every push/pop so downstream consumers that still read the
// legacy shape get coherent values.
function _rebuildDayAggregates(day) {
  const bottleSize = getBottleSize() || 1;
  const beverages = {};
  let totalBottles = 0;
  for (const e of day.entries) {
    const b = (parseFloat(e.oz) || 0) / bottleSize;
    totalBottles += b;
    const key = e.type || "water";
    if (!beverages[key]) beverages[key] = { type: key, count: 0 };
    beverages[key].count += b;
  }
  day.total = Math.max(0, totalBottles);
  day.beverages = Object.values(beverages);
}

/** Get bottle count from a log entry (handles both old number and new object format) */
function getLogBottles(entry) {
  if (entry == null) return 0;
  if (typeof entry === "number") return entry;
  return entry.total || 0;
}

function getTodayHydration() {
  const day = getHydrationForDate(getHydrationDate());
  // Prefer entries-based count when the entries array exists — each
  // entry represents one log action regardless of size. Clamp at zero
  // so stale corrupted `total` values (previously possible via undo
  // mismatches) never display as negative.
  if (Array.isArray(day.entries) && day.entries.length) return day.entries.length;
  return Math.max(0, parseFloat(day.total) || 0);
}

/** Get effective oz for today accounting for beverage coefficients */
function getTodayEffectiveOz() {
  return getEffectiveOzForDate(getHydrationDate());
}

let _selectedBeverage = "water";
let _hydrationDate = null; // null = today

/** Get the currently selected hydration date (defaults to today) */
function getHydrationDate() {
  return _hydrationDate || getTodayString();
}

/** Set the hydration date and re-render */
function setHydrationDate(dateStr) {
  _hydrationDate = dateStr || null;
  renderHydration();
}

/** Navigate hydration date by offset days (-1 = yesterday, +1 = tomorrow) */
function shiftHydrationDate(offset) {
  const current = getHydrationDate();
  const d = new Date(current + "T12:00:00");
  d.setDate(d.getDate() + offset);
  const today = getTodayString();
  const newDate = d.toISOString().slice(0, 10);
  // Future dates are now allowed — the renderer locks logging on those
  // days, so navigating to tomorrow shows the projected target without
  // letting the user accidentally write forward-dated entries.
  setHydrationDate(newDate === today ? null : newDate);
}

/** Get hydration data for a specific date */
function getHydrationForDate(dateStr) {
  const log = getHydrationLog();
  return normalizeDayLog(log[dateStr]);
}

/** Get effective oz for a specific date accounting for beverage coefficients */
function getEffectiveOzForDate(dateStr) {
  const day = getHydrationForDate(dateStr);
  // Prefer the authoritative per-log entries array when present —
  // each entry has the exact oz that was logged, so mixed bottle
  // sizes and fractional counts can't corrupt the total.
  if (Array.isArray(day.entries) && day.entries.length) {
    let oz = 0;
    for (const e of day.entries) {
      const coeff = _beverageFor(e.type).coeff;
      oz += (parseFloat(e.oz) || 0) * coeff;
    }
    return Math.max(0, Math.round(oz));
  }
  // Legacy fallback for days logged before the entries array existed.
  // Clamp at zero so a previously-corrupted count can't display as a
  // negative oz value.
  const bottleSize = getBottleSize();
  let effectiveOz = 0;
  for (const b of day.beverages || []) {
    const coeff = _beverageFor(b.type).coeff;
    effectiveOz += Math.max(0, parseFloat(b.count) || 0) * bottleSize * coeff;
  }
  return Math.max(0, Math.round(effectiveOz));
}

/** Get workout bonus for a specific date. Picks the session with the
 *  highest duration-scaled bonus when multiple are scheduled on one day. */
// Resolve a workout's duration in minutes from whichever field
// actually carries it. The top-level `duration` is only reliably set
// on logged completions and Add-Session entries — plan/schedule
// entries usually store duration on aiSession, session.steps, or the
// generated session template. Previously hydration.js only read
// w.duration, which fell through to 0 for planned cycling sessions
// and then to the 16 oz floor (user saw "+16 oz for your cycling"
// on a 2-hour ride that should have been ~44 oz).
function _hydrationResolveDurationMin(w) {
  if (!w) return 0;
  const parseStrMin = (v) => {
    if (v == null) return 0;
    const n = parseFloat(v);
    return isFinite(n) && n > 0 ? n : 0;
  };
  // Rest periods between reps still count as sweat-time — you don't
  // stop sweating during the 5 min between two 25-min sweet-spot
  // intervals. Pull rest minutes off whichever shape the step uses
  // (aiSession intervals carry "5 min" in `restDuration`; template
  // steps carry numeric minutes in `rest`; library steps carry
  // `restMin`). Returns 0 when no rest field is set.
  const restMin = (step) => {
    if (!step) return 0;
    const fromStr = parseStrMin(step.restDuration);
    if (fromStr > 0) return fromStr;
    const fromNum = parseStrMin(step.rest);
    if (fromNum > 0) return fromNum;
    const fromMin = parseStrMin(step.restMin);
    if (fromMin > 0) return fromMin;
    return 0;
  };
  // Total contribution of one repeat-block: active time + rest time
  // BETWEEN reps (rest after the final rep doesn't count — the next
  // step starts there). max(reps - 1, 0) handles single-rep entries.
  const stepMin = (step, n, reps) => {
    if (!(n > 0)) return 0;
    const r = Math.max(parseInt(reps) || 1, 1);
    return n * r + restMin(step) * Math.max(r - 1, 0);
  };
  // BUGFIX 04-29: Plan entries (raceId + discipline + load) get rendered
  // from getSessionTemplate or from libraryWorkout.main_set when its
  // shape is renderable. The plan generator may also stamp w.duration
  // from a matched library workout's duration_min — but if the
  // renderer can't render that library (main_set shape unknown to
  // _librarySessionSteps), the card falls back to SESSION_DESCRIPTIONS
  // and the stamped duration is orphaned. Hydration was then claiming
  // "your 90-min Easy Ride" while the card read 45 min.
  // Mirror the renderer's resolution: try library steps first, fall
  // back to template.
  if (w.raceId && w.discipline && w.load) {
    try {
      const _libSteps = (typeof window !== "undefined" && typeof window._librarySessionSteps === "function")
        ? window._librarySessionSteps(w.libraryWorkout)
        : null;
      if (_libSteps && _libSteps.duration > 0 && w.discipline !== "strength") {
        return Math.round(_libSteps.duration);
      }
      if (typeof getSessionTemplate === "function") {
        const tmpl = getSessionTemplate(w.discipline, w.load, w.weekNumber);
        if (tmpl) {
          if (Array.isArray(tmpl.steps)) {
            let sum = 0;
            for (const st of tmpl.steps) {
              sum += stepMin(st, parseStrMin(st && st.duration), st && st.reps);
            }
            if (sum > 0) return sum;
          }
          if (tmpl.duration) {
            const td = parseStrMin(tmpl.duration);
            if (td > 0) return td;
          }
        }
      }
    } catch {}
  }

  // BUGFIX 04-27 §F5: align the duration source with the workout-card
  // badge by checking the same fields in the same order as
  // calendar.js _readWorkoutDurationMin: duration → durationMin →
  // estimated_duration_min. The hydration math previously read 90 min for
  // a swim that the card displayed as 60 min because session-assembler
  // sessions store durationMin (not duration) and the workout went on to
  // hit a stale path further down. Single source of truth.
  // 1. Explicit top-level field — same as calendar.js card path.
  let d = parseStrMin(w.duration);
  if (d > 0) return d;
  d = parseStrMin(w.durationMin);
  if (d > 0) return d;
  d = parseStrMin(w.estimated_duration_min);
  if (d > 0) return d;
  // 2. aiSession: either .duration (number) or sum of .intervals[].duration
  if (w.aiSession) {
    d = parseStrMin(w.aiSession.duration);
    if (d > 0) return d;
    const intervals = Array.isArray(w.aiSession.intervals) ? w.aiSession.intervals : [];
    let sum = 0;
    for (const iv of intervals) {
      sum += stepMin(iv, parseStrMin(iv && iv.duration), iv && iv.reps);
    }
    if (sum > 0) return sum;
  }
  // 3. session.steps pattern (plan/scheduled entries derived from
  //    SESSION_DESCRIPTIONS templates before the editor hydrates them)
  if (w.session && Array.isArray(w.session.steps)) {
    let sum = 0;
    for (const st of w.session.steps) {
      sum += stepMin(st, parseStrMin(st && st.duration), st && st.reps);
    }
    if (sum > 0) return sum;
    d = parseStrMin(w.session.duration);
    if (d > 0) return d;
  }
  // 4. Plan-entry discipline+load shape — look up the SESSION_DESCRIPTIONS
  //    template and sum its steps. Uses getSessionTemplate when present so
  //    phase-specific variants are respected.
  try {
    if (w.discipline && w.load && typeof getSessionTemplate === "function") {
      const tmpl = getSessionTemplate(w.discipline, w.load, w.weekNumber);
      if (tmpl && Array.isArray(tmpl.steps)) {
        let sum = 0;
        for (const st of tmpl.steps) {
          sum += stepMin(st, parseStrMin(st && st.duration), st && st.reps);
        }
        if (sum > 0) return sum;
      }
      if (tmpl && tmpl.duration) {
        d = parseStrMin(tmpl.duration);
        if (d > 0) return d;
      }
    }
  } catch {}
  // 5. BUGFIX 04-25 §10: distance → duration fallback. Users who log
  //    a "10 mi run" without a duration field still need a hydration
  //    bonus that scales with the actual work. Use type-specific
  //    average paces (rough but better than the 16-oz floor):
  //      - running: 9 min/mi (rec/intermediate)
  //      - cycling: 3.5 min/mi (~17 mph)
  //      - swimming: 2 min/100m
  //      - rowing: 4 min/km
  if (w.distance) {
    const distStr = String(w.distance).toLowerCase();
    const num = parseFloat(distStr.match(/[\d.]+/) || ["0"]);
    if (num > 0) {
      const t = String(w.type || w.discipline || "").toLowerCase();
      const isMi = /mi/.test(distStr) || /\bmile/.test(distStr);
      const isKm = /km/.test(distStr);
      const isM  = /\bm\b/.test(distStr) && !isKm;
      const isYd = /yd/.test(distStr);
      let est = 0;
      if (t === "run" || t === "running") {
        const miles = isKm ? num * 0.621371 : num;
        est = miles * 9; // 9 min/mi default
      } else if (t === "bike" || t === "cycling") {
        const miles = isKm ? num * 0.621371 : num;
        est = miles * 3.5; // ~17 mph
      } else if (t === "swim" || t === "swimming") {
        // Swim distance usually in m or yd; 2:00 / 100m as the default pace.
        const meters = isYd ? num * 0.9144 : (isKm ? num * 1000 : (isMi ? num * 1609.344 : num));
        est = (meters / 100) * 2;
      } else if (t === "row" || t === "rowing") {
        const km = isMi ? num * 1.60934 : (isKm ? num : num / 1000);
        est = km * 4; // ~4 min/km
      }
      if (est > 0) return Math.round(est);
    }
  }
  return 0;
}

function getWorkoutInfoForDate(dateStr) {
  try {
    // Three write paths land a workout on a date:
    //   - workoutSchedule — onboarding-v2 / custom-plan prescheduled sessions
    //   - trainingPlan    — race plan entries
    //   - workouts        — logged completions AND sessions saved via
    //                        Add Session (qeSaveGeneratedCardio etc.) which
    //                        writes to `workouts` not workoutSchedule
    // Hydration bonus applies to ANY of them — if the athlete trained or
    // is about to train today, they need the volume adjustment.
    //
    // BUGFIX 04-25 §10: prefer completed workouts over their planned
    // counterparts and SUM bonuses across distinct sessions on the same
    // day (AM run + PM lift, both completed → both contribute). Previous
    // behavior picked only the single highest-bonus session.
    let schedule = [], plan = [], logged = [];
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]") || []; } catch {}
    try { plan     = JSON.parse(localStorage.getItem("trainingPlan")    || "[]") || []; } catch {}
    try { logged   = JSON.parse(localStorage.getItem("workouts")        || "[]") || []; } catch {}

    // Athlete weight scales every bonus equally today — pull once here.
    let weightLbs = 0;
    try {
      const profile = JSON.parse(localStorage.getItem("profile") || "{}");
      const w = parseFloat(profile.weight);
      if (isFinite(w) && w > 0) weightLbs = w;
    } catch {}

    const isRest = (w) => {
      const t = String((w && (w.type || w.discipline)) || "").toLowerCase();
      return t === "rest" || (w && w.load === "rest");
    };

    const computeFor = (w) => {
      if (!w || isRest(w)) return null;
      const t = String(w.type || w.discipline || "").toLowerCase();
      const durationMin = _hydrationResolveDurationMin(w);
      const load = w.load || (w.session && w.session.load) || (w.aiSession && w.aiSession.load) || "";
      const bonus = computeWorkoutBonusOz(t, durationMin, { weightLbs, load });
      return {
        bonus,
        durationMin,
        type: t,
        name: w.sessionName || w.name || w.type || w.discipline || "workout",
      };
    };

    // Build the per-session bonus list with dedup. Completed workouts
    // override their planned counterparts (matched via completedSessionId
    // → schedule.id or plan-derived id) — but only when the completed
    // bonus is ≥ the planned one. Spec sanity check: target shouldn't
    // decrease if planned > actual.
    const completedById = new Map();    // sessionId → completed entry
    const completedFreestanding = [];   // workouts with no plan link
    const dayLogged = logged.filter(w => w && w.date === dateStr);
    for (const w of dayLogged) {
      if (w.completedSessionId) {
        completedById.set(String(w.completedSessionId), w);
      } else {
        completedFreestanding.push(w);
      }
    }

    // Map a planned entry to its session-id form. workoutSchedule entries
    // have a numeric `id`; trainingPlan entries don't, but the calendar
    // synthesizes "session-plan-<date>-<raceId>" — use the same shape.
    const _scheduleSessionId = (sw) => sw && sw.id != null ? `session-sw-${sw.id}` : null;
    const _planSessionId = (p) => p && p.date && p.raceId != null ? `session-plan-${p.date}-${p.raceId}` : null;

    const contributions = [];
    const contributingNames = [];
    let bestName = "", bestType = "", bestDurationMin = 0, bestBonus = 0;
    const _trackBest = (info) => {
      if (info && info.bonus > bestBonus) {
        bestBonus = info.bonus;
        bestName = info.name;
        bestType = info.type;
        bestDurationMin = info.durationMin;
      }
      if (info && info.bonus > 0 && info.name) contributingNames.push(info.name);
    };

    // Planned entries — replace with completed if it exists, take the
    // larger bonus to honor the "don't decrease" sanity check.
    for (const sw of schedule) {
      if (!sw || sw.date !== dateStr) continue;
      const sid = _scheduleSessionId(sw);
      const completed = sid ? completedById.get(sid) : null;
      const plannedInfo = computeFor(sw);
      const completedInfo = completed ? computeFor(completed) : null;
      const winner = (completedInfo && plannedInfo)
        ? (completedInfo.bonus >= plannedInfo.bonus ? completedInfo : plannedInfo)
        : (completedInfo || plannedInfo);
      if (winner && winner.bonus > 0) {
        contributions.push(winner.bonus);
        _trackBest(winner);
      }
      if (sid) completedById.delete(sid);
    }
    for (const p of plan) {
      if (!p || p.date !== dateStr) continue;
      const sid = _planSessionId(p);
      const completed = sid ? completedById.get(sid) : null;
      const plannedInfo = computeFor(p);
      const completedInfo = completed ? computeFor(completed) : null;
      const winner = (completedInfo && plannedInfo)
        ? (completedInfo.bonus >= plannedInfo.bonus ? completedInfo : plannedInfo)
        : (completedInfo || plannedInfo);
      if (winner && winner.bonus > 0) {
        contributions.push(winner.bonus);
        _trackBest(winner);
      }
      if (sid) completedById.delete(sid);
    }
    // Any remaining completedById entries are completions whose plan
    // counterpart wasn't found — count them.
    for (const w of completedById.values()) {
      const info = computeFor(w);
      if (info && info.bonus > 0) {
        contributions.push(info.bonus);
        _trackBest(info);
      }
    }
    // Freestanding completions (no completedSessionId — likely Add
    // Session direct logs) contribute their full bonus.
    for (const w of completedFreestanding) {
      const info = computeFor(w);
      if (info && info.bonus > 0) {
        contributions.push(info.bonus);
        _trackBest(info);
      }
    }

    if (contributions.length === 0) return null;
    const totalBonus = contributions.reduce((s, n) => s + n, 0);
    // Build a human label for the breakdown reason. With one session,
    // use that session's name. With two, "<A> + <B>". With more, fall
    // back to "N workouts" so the line stays scannable.
    const _uniqueNames = Array.from(new Set(contributingNames.filter(Boolean)));
    let sessionsLabel = bestName;
    if (_uniqueNames.length === 2) {
      sessionsLabel = `${_uniqueNames[0]} + ${_uniqueNames[1]}`;
    } else if (_uniqueNames.length >= 3) {
      sessionsLabel = `${_uniqueNames.length} workouts`;
    }
    return {
      bonusOz: totalBonus,
      sessionName: sessionsLabel,
      // bestSessionName is preserved for any caller that specifically
      // wanted the highest-bonus session (none today, but we don't
      // want a future regression).
      bestSessionName: bestName,
      durationMin: bestDurationMin,
      type: bestType,
      sessionCount: contributions.length,
    };
  } catch { return null; }
}

// ── Race context for a date ──────────────────────────────────────────────
// Returns the nearest upcoming race and how many days out the target date
// sits from that race (0 = race day, 1 = T-1, ..., or null when no race
// is within the preload window).
function getRaceContextForDate(dateStr) {
  try {
    const events = JSON.parse(localStorage.getItem("events") || "[]");
    if (!Array.isArray(events) || events.length === 0) return null;
    // Sort ascending by date so we find the next race after the target.
    const withDates = events
      .filter(e => e && e.date && e.type)
      .sort((a, b) => a.date.localeCompare(b.date));
    const target = new Date(dateStr + "T00:00:00");
    for (const e of withDates) {
      const eventDay = new Date(e.date + "T00:00:00");
      const daysUntil = Math.round((eventDay - target) / 86400000);
      // Only care about race day itself (0) or the 3-day preload window.
      // Past races are ignored; races > 3 days out don't affect today.
      if (daysUntil < 0) continue;
      if (daysUntil > 3) break;
      const profile = RACE_HYDRATION_PROFILES[e.type];
      if (!profile) continue; // unknown race type — skip gracefully
      return { race: e, daysUntil, profile };
    }
    return null;
  } catch { return null; }
}

function computeRaceDayBonusOz(profile) {
  if (!profile) return 0;
  const raw = Math.round((profile.ratePerHour || 20) * (profile.hours || 1));
  return Math.max(HYDRATION_FLOOR_OZ, raw);
}

/** Get hydration breakdown for a specific date.
 *
 *  Layering priority (Section 11e):
 *    1. Race day: bonusOz = computeRaceDayBonusOz(profile). Ignores the
 *       scheduled workout (race IS the workout).
 *    2. T-1 / T-2 / T-3: bonusOz = RACE_WEEK_PRELOAD[daysUntil].bonusOz
 *       PLUS any scheduled-workout bonus for that day (taper sessions
 *       are real workouts and still need their own hydration).
 *    3. Otherwise: bonusOz = workout bonus only.
 *  Sauna adds on top in all cases.
 */
function getHydrationBreakdownForDate(dateStr) {
  // Past-day snapshot path. Once freezePastHydrationTargets() has run,
  // each historical day carries its own frozen target — read that
  // instead of recomputing live, otherwise weight / settings changes
  // retroactively warp historical adherence (same drift bug we fixed
  // for nutrition). Today and future days always live-compute.
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    if (dateStr && dateStr < todayStr) {
      const log = JSON.parse(localStorage.getItem("hydrationLog") || "{}");
      const day = log[dateStr];
      if (day && typeof day === "object" && day.snapshotTargetOz != null) {
        // Frozen target wins. Other fields (reason / race / preload)
        // are not snapshotted — they're display-only and would mostly
        // be empty for past days anyway. Stats reads totalOz, which
        // is the field that matters for adherence math.
        return {
          baseOz: day.snapshotTargetOz,
          bonusOz: 0,
          totalOz: day.snapshotTargetOz,
          rawTotalOz: day.snapshotTargetOz,
          reason: null,
          race: null,
          preload: null,
          sodiumGuidance: null,
          workoutBonusOz: 0,
          raceBonusOz: 0,
          preloadBonusOz: 0,
          saunaBonus: 0,
          softCapWarning: null,
          hardCapWarning: null,
          _fromSnapshot: true,
        };
      }
    }
  } catch {}

  const baseOz = getBaseHydrationTarget();
  const workoutInfo = getWorkoutInfoForDate(dateStr);
  const raceCtx = getRaceContextForDate(dateStr);

  let saunaBonus = 0;
  try {
    const log = JSON.parse(localStorage.getItem("hydrationLog") || "{}");
    saunaBonus = (log[dateStr] && log[dateStr].saunaBonus) || 0;
  } catch {}

  let workoutBonusOz = workoutInfo ? workoutInfo.bonusOz : 0;
  let raceBonusOz = 0;
  let preloadBonusOz = 0;
  let sodiumGuidance = null;
  let reason = null;
  let race = null;
  let preload = null;

  if (raceCtx && raceCtx.daysUntil === 0) {
    // Race day — distance-scaled bonus replaces the workout bonus.
    race = { type: raceCtx.race.type, label: raceCtx.profile.label, hours: raceCtx.profile.hours };
    raceBonusOz = computeRaceDayBonusOz(raceCtx.profile);
    workoutBonusOz = 0;
    if (raceCtx.profile.sodiumMgPerHour > 0) {
      const total = Math.round(raceCtx.profile.sodiumMgPerHour * raceCtx.profile.hours);
      sodiumGuidance = `Target ~${raceCtx.profile.sodiumMgPerHour} mg sodium per hour of racing (~${total.toLocaleString()} mg total).`;
    }
    reason = `${baseOz} base + ${raceBonusOz} for race day (${raceCtx.profile.label}, ~${raceCtx.profile.hours}h)`;
  } else if (raceCtx && raceCtx.daysUntil >= 1 && raceCtx.daysUntil <= 3) {
    // Preload window — layer preload on top of normal workout bonus.
    const p = RACE_WEEK_PRELOAD[raceCtx.daysUntil];
    if (p) {
      preloadBonusOz = p.bonusOz;
      preload = { daysUntil: raceCtx.daysUntil, note: p.note, sodiumMg: p.sodiumMg || 0 };
      if (p.sodiumMg > 0) {
        sodiumGuidance = `~${p.sodiumMg.toLocaleString()} mg sodium preload today (electrolyte drink or salted meals).`;
      }
      reason = workoutInfo
        ? `${baseOz} base + ${preloadBonusOz} race-week preload + ${workoutBonusOz} for your ${workoutInfo.sessionName}`
        : `${baseOz} base + ${preloadBonusOz} race-week preload (T-${raceCtx.daysUntil})`;
    }
  }

  if (!reason && workoutInfo && saunaBonus > 0) {
    reason = `${baseOz} base + ${workoutBonusOz} workout + ${saunaBonus} sauna`;
  } else if (!reason && workoutInfo) {
    reason = `${baseOz} base + ${workoutBonusOz} for your ${workoutInfo.sessionName}`;
  } else if (!reason && saunaBonus > 0) {
    reason = `${baseOz} base + ${saunaBonus} for sauna session`;
  }

  const totalBonus = workoutBonusOz + raceBonusOz + preloadBonusOz + saunaBonus;
  const rawTotalOz = baseOz + totalBonus;
  // BUGFIX 04-27 §F8: clamp at HYDRATION_HARD_CAP_OZ. Above the soft cap
  // we pass through but flag for an electrolyte note.
  let totalOz = rawTotalOz;
  let softCapWarning = null;
  let hardCapWarning = null;
  if (rawTotalOz >= HYDRATION_HARD_CAP_OZ) {
    totalOz = HYDRATION_HARD_CAP_OZ;
    hardCapWarning = `Capped at ${HYDRATION_HARD_CAP_OZ} oz. Higher intake without medical guidance can dilute blood sodium dangerously.`;
  } else if (rawTotalOz > HYDRATION_SOFT_CAP_OZ) {
    softCapWarning = "This is a high target — pair every 16–20 oz with electrolytes and don't drink it all at once.";
  }
  return {
    baseOz,
    bonusOz: totalBonus,
    totalOz,
    rawTotalOz,
    reason,
    race,
    preload,
    sodiumGuidance,
    workoutBonusOz,
    raceBonusOz,
    preloadBonusOz,
    saunaBonus,
    softCapWarning,
    hardCapWarning,
  };
}

// Core push — records a single hydration event on the current day.
// All log paths (named bottles, quick-add, legacy logWater, etc.) funnel
// through here so the entries array stays authoritative and undo can
// pop by exact oz rather than decrementing a shared counter by 1.
function _pushHydrationEntry(type, oz) {
  if (!type) type = "water";
  oz = parseFloat(oz) || 0;
  if (oz <= 0) return 0;

  const log = getHydrationLog();
  const dateStr = getHydrationDate();
  const day = normalizeDayLog(log[dateStr]);
  _upgradeLegacyDay(day);

  day.entries.push({ type, oz });
  _rebuildDayAggregates(day);

  log[dateStr] = day;
  localStorage.setItem("hydrationLog", JSON.stringify(log));
  if (typeof DB !== "undefined") {
    DB.syncKey("hydrationLog");
    // Belt-and-suspenders: race iOS suspension with a direct flush so
    // the row reaches user_data before the JS context can be killed.
    if (DB.flushKey) DB.flushKey("hydrationLog").catch(() => {});
  }
  return oz;
}

function logWater(beverageType) {
  const type = beverageType || _selectedBeverage || "water";
  const dateStr = getHydrationDate();
  const bottleSize = getBottleSize();
  _pushHydrationEntry(type, bottleSize);

  if (typeof trackEvent === "function") {
    let target = null;
    try { target = getHydrationBreakdownForDate(dateStr)?.totalOz || null; } catch {}
    trackEvent("hydration_logged", { beverage: type, target });
  }

  renderHydration();

  // Refresh day detail if visible
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }

  // Check if target met (only animate for today)
  if (dateStr === getTodayString()) {
    const effectiveOz = getEffectiveOzForDate(dateStr);
    const targetOz = getHydrationBreakdownForDate(dateStr).totalOz;
    const prevOz = effectiveOz - bottleSize * _beverageFor(type).coeff;
    if (effectiveOz >= targetOz && prevOz < targetOz) {
      playHydrationGoalAnimation();
    }
  }

  // Stacked-Day check.
  if (window.StackUX) {
    try {
      window.StackUX.recordStackIfHit(dateStr);
      window.StackUX.maybeFireStackCelebration(dateStr);
    } catch {}
  }
}

function logWaterOz(oz) {
  const type = _selectedBeverage || "water";
  const dateStr = getHydrationDate();
  // Future-date guard: the renderer disables the buttons that lead here,
  // but the global functions are reachable from anywhere (admin / tests
  // / a stale tab). Refuse the write rather than rely on UI state.
  if (dateStr > getTodayString()) {
    console.warn("[hydration] refused future-dated log:", dateStr);
    return;
  }
  _pushHydrationEntry(type, oz);

  renderHydration();

  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }

  if (dateStr === getTodayString()) {
    const effectiveOz = getEffectiveOzForDate(dateStr);
    const targetOz = getHydrationBreakdownForDate(dateStr).totalOz;
    const coeff = _beverageFor(type).coeff;
    const prevOz = effectiveOz - oz * coeff;
    if (effectiveOz >= targetOz && prevOz < targetOz) {
      playHydrationGoalAnimation();
    }
  }

  // Stacked-Day check.
  if (window.StackUX) {
    try {
      window.StackUX.recordStackIfHit(dateStr);
      window.StackUX.maybeFireStackCelebration(dateStr);
    } catch {}
  }

  // Close quick add panel
  const panel = document.getElementById("hydration-quickadd");
  if (panel) panel.style.display = "none";
}

function logWaterCustom() {
  const input = document.getElementById("hydration-custom-oz");
  const oz = parseFloat(input?.value);
  if (!oz || oz <= 0) return;
  logWaterOz(oz);
  if (input) input.value = "";
}

function toggleQuickAddWater() {
  const panel = document.getElementById("hydration-quickadd");
  if (!panel) return;
  // Compare against computed style so a previous toggle that left
  // display as "" (default block) still flips correctly. The old
  // version compared only against the inline "none" string, so if
  // anything re-set the inline style to "" mid-session the second
  // click saw a non-"none" value and flipped it to "none"... which
  // was what we wanted — unless a subsequent render re-ran and
  // cleared it again. Use offsetParent as a cheap visibility probe.
  const isHidden = panel.offsetParent === null || panel.style.display === "none";
  panel.style.display = isHidden ? "" : "none";
}

function undoWater() {
  const log = getHydrationLog();
  const dateStr = getHydrationDate();
  const day = normalizeDayLog(log[dateStr]);
  _upgradeLegacyDay(day);

  if (!day.entries.length) {
    // Nothing to undo — clamp any stale legacy totals at zero so a
    // previously-corrupted day (fractional counts that decremented past
    // zero) doesn't continue to render as negative.
    day.total = 0;
    day.beverages = [];
    log[dateStr] = day;
    localStorage.setItem("hydrationLog", JSON.stringify(log));
    if (typeof DB !== "undefined") {
      DB.syncKey("hydrationLog");
      if (DB.flushKey) DB.flushKey("hydrationLog").catch(() => {});
    }
    renderHydration();
    return;
  }

  day.entries.pop();
  _rebuildDayAggregates(day);

  log[dateStr] = day;
  localStorage.setItem("hydrationLog", JSON.stringify(log));
  if (typeof DB !== "undefined") {
    DB.syncKey("hydrationLog");
    // Belt-and-suspenders: race iOS suspension with a direct flush so
    // the row reaches user_data before the JS context can be killed.
    if (DB.flushKey) DB.flushKey("hydrationLog").catch(() => {});
  }
  renderHydration();

  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }

  // Stacked-Day reconcile: undoing water can drop the hydration pillar
  // below target. Revoke today's stack-hit if it no longer qualifies.
  if (window.StackUX) {
    try {
      window.StackUX.reconcileStack(dateStr);
      if (typeof renderGreeting === "function") renderGreeting();
    } catch {}
  }
}

/* =====================================================================
   RENDERING
   ===================================================================== */

function renderHydration() {
  if (!isHydrationEnabled()) return;

  const dateStr = getHydrationDate();
  const today = getTodayString();
  const isToday = dateStr === today;
  const isFuture = dateStr > today;

  const breakdown = getHydrationBreakdown();
  const targetOz = breakdown.totalOz;
  const effectiveOz = getTodayEffectiveOz();

  // Date navigator
  _renderHydrationDateNav(dateStr, isToday);

  // Progress bar label — now always oz-based (not bottle counts), so
  // mixing bottles of different sizes produces a coherent total. The
  // legacy secondary oz line under the bar is redundant and hidden.
  const currentEl = document.getElementById("hydration-current");
  const targetEl = document.getElementById("hydration-target-display");
  const ozEl = document.getElementById("hydration-oz-display");
  if (currentEl) currentEl.textContent = effectiveOz;
  if (targetEl) targetEl.textContent = `${targetOz} oz`;
  if (ozEl) ozEl.style.display = "none";

  // My Bottle button(s). If the user has named bottles set up, replace
  // the single "+ My Bottle" button with a row of named-bottle buttons
  // so they can tap the exact bottle they just drank. Otherwise fall
  // back to the legacy single button + bottleSize label.
  _renderBottleButtons();

  // Undo button — visible whenever the current day has something to undo.
  // Hidden on future days since there's nothing to undo.
  const undoBtn = document.getElementById("hydration-undo-btn");
  if (undoBtn) undoBtn.style.display = (!isFuture && effectiveOz > 0) ? "" : "none";

  // Fill animation — use effective oz ratio
  const pctForVisual = Math.min(effectiveOz / targetOz, 1);
  updateHydrationVisualPct(pctForVisual);

  // Target breakdown context
  renderHydrationContext(breakdown);

  // Beverage picker
  renderBeveragePicker();

  // Smart timing tip (only for today)
  if (isToday) {
    renderHydrationTimingTip();
  } else {
    const tipEl = document.getElementById("hydration-tip");
    if (tipEl) tipEl.style.display = "none";
  }

  // Future-date lock: disable every log action and surface a notice so
  // it's obvious the user is looking at a projected target, not a live
  // log. We disable rather than hide so the layout doesn't reflow when
  // the user steps from today to tomorrow and back. Beverage-type
  // chips stay enabled — those don't write, just toggle a renderer
  // preference.
  _setHydrationFutureLock(isFuture);
}

function _setHydrationFutureLock(isFuture) {
  const card = document.getElementById("hydration-card");
  if (card) card.classList.toggle("hydration-card--future", isFuture);
  const myBottle = document.getElementById("hydration-mybottle-btn");
  if (myBottle) myBottle.disabled = isFuture;
  const quickAddPanel = document.getElementById("hydration-quickadd");
  if (quickAddPanel) quickAddPanel.querySelectorAll("button, input").forEach(el => { el.disabled = isFuture; });
  const secondary = document.querySelector(".hydration-secondary-row");
  if (secondary) {
    secondary.querySelectorAll("button").forEach(b => {
      // Quick Add link can stay tappable so the panel can still be
      // collapsed/expanded, but inputs inside are gated above. Undo
      // is hard-disabled since there's nothing to undo.
      if (b.id === "hydration-undo-btn") b.disabled = isFuture;
    });
  }
  // Per-bottle row buttons (rendered dynamically by _renderBottleButtons).
  document.querySelectorAll(".hydration-bottle-btn").forEach(b => { b.disabled = isFuture; });
  // Inline notice — added once, toggled visible. The "Switch to today"
  // span is wired as an inline action so the user doesn't have to
  // scroll back up to the date-nav Today button.
  let notice = document.getElementById("hydration-future-notice");
  if (!notice && card) {
    notice = document.createElement("div");
    notice.id = "hydration-future-notice";
    notice.className = "hydration-future-notice";
    notice.innerHTML = `Projected target. <button type="button" class="hydration-future-notice-link" onclick="setHydrationDate(null)">Switch to today</button> to log water.`;
    const bar = document.getElementById("hydration-bar-fill")?.parentElement;
    if (bar && bar.parentElement) bar.parentElement.insertBefore(notice, bar.nextSibling);
  }
  if (notice) notice.style.display = isFuture ? "" : "none";
}

function _renderHydrationDateNav(dateStr, isToday) {
  let nav = document.getElementById("hydration-date-nav");
  if (!nav) {
    const header = document.querySelector("#hydration-card .hydration-header");
    if (!header) return;
    nav = document.createElement("div");
    nav.id = "hydration-date-nav";
    nav.className = "hydration-date-nav";
    header.insertAdjacentElement("afterend", nav);
  }
  // Hide the date nav when showing today — hydration is always "today"
  nav.style.display = isToday ? "none" : "";

  // Format date label
  const d = new Date(dateStr + "T12:00:00");
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = isToday ? "Today" : `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;

  nav.innerHTML = `
    <button class="hydration-nav-btn" onclick="shiftHydrationDate(-1)" title="Previous day">&lsaquo;</button>
    <span class="hydration-nav-label">${label}</span>
    <button class="hydration-nav-btn" onclick="shiftHydrationDate(1)" title="Next day" ${isToday ? "disabled" : ""}>&rsaquo;</button>
    ${!isToday ? `<button class="hydration-nav-today-btn" onclick="setHydrationDate(null)">Today</button>` : ""}
  `;
}

function updateHydrationVisual(current, target) {
  updateHydrationVisualPct(Math.min(current / target, 1));
}

function updateHydrationVisualPct(pct) {
  // Horizontal progress bar (primary visual)
  const bar = document.getElementById("hydration-bar-fill");
  if (bar) {
    bar.style.width = Math.min(pct * 100, 100) + "%";
    bar.style.background = pct >= 1 ? "var(--color-success, #22c55e)" : "var(--color-accent)";
  }
  // Legacy SVG fill (kept for animation JS that targets it)
  const rect = document.getElementById("hydration-fill-rect");
  if (rect) {
    const fillHeight = 135 * pct;
    rect.setAttribute("y", 155 - fillHeight);
    rect.setAttribute("height", fillHeight);
  }
}

function renderHydrationContext(breakdown) {
  const el = document.getElementById("hydration-context");
  if (!el) return;
  if (breakdown.bonusOz <= 0) {
    // Suppress the base-target note on rest days — it takes up a line of
    // vertical space with information the user has already seen.
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }

  el.style.display = "";
  const icon = typeof ICONS !== "undefined" ? ICONS.lightbulb : "";
  let html = "";

  // Race-day and race-week preload get a dedicated top line that names
  // the race — the breakdown reason string already carries the oz math.
  if (breakdown.race) {
    html += `<span class="hydration-transparency-note">${icon} Race day — ${escHtml(breakdown.race.label)}. Target: ${breakdown.totalOz}oz (${breakdown.baseOz} base + ${breakdown.raceBonusOz} for ~${breakdown.race.hours}h of racing).</span>`;
  } else if (breakdown.preload) {
    html += `<span class="hydration-transparency-note">${icon} ${escHtml(breakdown.preload.note)} Today's target: ${breakdown.totalOz}oz.</span>`;
  } else {
    const who = escHtml(breakdown.reason ? breakdown.reason.split("for your ").pop() : "workout");
    html += `<span class="hydration-transparency-note">${icon} Today's target: ${breakdown.totalOz}oz &mdash; ${breakdown.baseOz}oz base + ${breakdown.bonusOz}oz for your ${who}.</span>`;
  }

  // Sodium guidance surfaces as a second line when the day warrants it
  // (race day > ~2h, or T-1 preload).
  if (breakdown.sodiumGuidance) {
    html += `<span class="hydration-transparency-note hydration-sodium-note">${escHtml(breakdown.sodiumGuidance)}</span>`;
  }

  // BUGFIX 04-27 §F8: soft/hard cap warnings.
  if (breakdown.hardCapWarning) {
    html += `<span class="hydration-transparency-note hydration-cap-warning hydration-cap-warning--hard">${escHtml(breakdown.hardCapWarning)}</span>`;
  } else if (breakdown.softCapWarning) {
    html += `<span class="hydration-transparency-note hydration-cap-warning hydration-cap-warning--soft">${escHtml(breakdown.softCapWarning)}</span>`;
  }

  el.innerHTML = html;
}

function _renderBottleButtons() {
  const legacyBtn = document.getElementById("hydration-mybottle-btn");
  if (!legacyBtn) return;

  const bottles = getNamedBottles();
  const bottleSize = getBottleSize();

  // Find or create the container that holds named bottle buttons. It
  // sits in place of the legacy button; when there are no named bottles
  // we hide it and show the legacy button instead.
  let container = document.getElementById("hydration-bottle-buttons");
  if (!container) {
    container = document.createElement("div");
    container.id = "hydration-bottle-buttons";
    container.className = "hydration-bottle-buttons";
    legacyBtn.insertAdjacentElement("afterend", container);
  }

  // Compute remaining oz to goal — "X more bottles to hit your goal"
  // is computed once and specialized per bottle size below.
  const targetOz = getHydrationBreakdownForDate(getHydrationDate()).totalOz;
  const currentOz = getTodayEffectiveOz();
  const remainingOz = Math.max(0, targetOz - currentOz);

  if (!bottles.length) {
    // Legacy mode — keep the single "+ My Bottle" button and hide the
    // multi-bottle container.
    legacyBtn.style.display = "";
    legacyBtn.textContent = `+ My Bottle (${bottleSize}oz)`;
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  // Multi-bottle mode — hide the legacy button, render a grid of named
  // bottles. Each button shows how many more of that specific bottle
  // the user needs to drink to hit today's target (or a "goal met"
  // chip when they're already there).
  legacyBtn.style.display = "none";
  container.style.display = "";
  container.innerHTML = bottles.map(b => {
    const name = escHtml(b.name || "Bottle");
    const size = parseFloat(b.size) || 0;
    let remainingLabel;
    if (remainingOz <= 0) {
      remainingLabel = "Goal met";
    } else if (size > 0) {
      const need = Math.ceil(remainingOz / size);
      remainingLabel = `${need} more to goal`;
    } else {
      remainingLabel = "";
    }
    return `
      <div class="hydration-bottle-cell">
        <button class="btn-primary hydration-bottle-btn" onclick="logNamedBottle('${escHtml(b.id)}')">+ ${name} (${size}oz)</button>
        ${remainingLabel ? `<div class="hydration-bottle-remaining">${remainingLabel}</div>` : ""}
      </div>`;
  }).join("");
}

function renderBeveragePicker() {
  let picker = document.getElementById("hydration-beverage-picker");
  if (!picker) {
    // Insert before the primary action button
    const btn = document.getElementById("hydration-mybottle-btn");
    if (!btn) return;
    picker = document.createElement("div");
    picker.id = "hydration-beverage-picker";
    picker.className = "hydration-beverage-picker";
    btn.insertAdjacentElement("beforebegin", picker);
  }

  let html = "";
  for (const [key, bev] of Object.entries(BEVERAGE_TYPES)) {
    const active = key === _selectedBeverage ? " active" : "";
    const coeffNote = bev.coeff < 1 ? ` (${Math.round(bev.coeff * 100)}%)` : "";
    html += `<button class="hydration-bev-btn${active}" onclick="_selectedBeverage='${key}';renderBeveragePicker()" title="${escHtml(bev.label)}${coeffNote}">${bev.icon} ${escHtml(bev.label)}</button>`;
  }
  picker.innerHTML = html;
}

function renderHydrationTimingTip() {
  const tipEl = document.getElementById("hydration-tip");
  const tipText = document.getElementById("hydration-tip-text");
  if (!tipEl || !tipText) return;

  const workoutInfo = getTodayWorkoutInfo();
  if (!workoutInfo) {
    tipEl.style.display = "none";
    return;
  }

  tipEl.style.display = "";
  const now = new Date();
  const hour = now.getHours();

  // Smart timing based on time of day and workout. If we know the planned
  // duration, tailor the electrolyte guidance instead of hedging with "if
  // it's over 60 min" — the app already knows how long the session is.
  const dur = workoutInfo.durationMin || 0;

  // Lifting has different hydration timing than endurance. Research:
  // Judelson et al. (2007) — 2% bodyweight dehydration drops strength
  // output by ~5-7% and reps-to-failure by ~10%. But a stomach full of
  // water during a heavy squat is worse than under-hydrated. So lifting
  // benefits MOST from front-loading fluids 2-3 hrs before the session,
  // then sipping only during rest intervals. Endurance sessions prefer
  // continuous sipping throughout.
  const _strengthTypes = new Set([
    "strength", "weightlifting", "bodyweight", "hiit", "crossfit",
  ]);
  const isStrength = _strengthTypes.has(String(workoutInfo.type || "").toLowerCase());

  let tip;
  if (isStrength) {
    // Lifting-specific timing — consistent across morning / afternoon
    // because the pre-session front-load and rest-interval sipping are
    // the same regardless of when the session happens.
    if (hour < 10) {
      tip = `Lifting today: front-load 16–20 oz in the 2 hours before you start. Sip only during rest intervals — a full stomach under the bar hurts more than it helps.`;
    } else if (hour < 16) {
      tip = `Lifting day: if your session is still ahead, aim for 16–20 oz in the 2 hours before. During the session sip during rest intervals only. Even 2% dehydration can cost you 5–7% strength.`;
    } else {
      tip = `Post-lift: prioritize ${Math.round(workoutInfo.bonusOz * 0.6)}oz of your remaining target. Protein absorption and glycogen replenishment both need water.`;
    }
  } else if (hour < 10) {
    tip = `Training day: front-load hydration before your ${workoutInfo.sessionName}. Aim for ${Math.round(workoutInfo.bonusOz * 0.6)}oz before you start.`;
  } else if (hour < 16) {
    let electrolyteClause;
    if (dur >= 90) {
      electrolyteClause = `Add electrolytes during your ${dur}-min ${workoutInfo.sessionName}.`;
    } else if (dur > 60) {
      electrolyteClause = `Add electrolytes during your ${dur}-min ${workoutInfo.sessionName}.`;
    } else if (dur > 0) {
      electrolyteClause = `Water is fine for your ${dur}-min ${workoutInfo.sessionName} — electrolytes optional.`;
    } else {
      electrolyteClause = `Consider electrolytes during your ${workoutInfo.sessionName} if it's over 60 min.`;
    }
    tip = `Training day: keep sipping. ${electrolyteClause}`;
  } else {
    tip = `Post-training: prioritize ${Math.round(workoutInfo.bonusOz * 0.5)}oz of your remaining target to help recover from your ${workoutInfo.sessionName}.`;
  }
  tipText.textContent = tip;
}

function playHydrationGoalAnimation() {
  const svg = document.getElementById("hydration-bottle-svg");
  if (!svg) return;
  const card = document.getElementById("hydration-card");

  // Pulse the bottle
  svg.style.transition = "transform 0.3s ease";
  svg.style.transform = "scale(1.15)";
  setTimeout(() => { svg.style.transform = "scale(1)"; }, 300);
  setTimeout(() => { svg.style.transform = "scale(1.1)"; }, 500);
  setTimeout(() => { svg.style.transform = "scale(1)"; }, 700);

  // Burst particles around the bottle
  const visual = svg.parentElement;
  if (!visual) return;
  visual.style.position = "relative";
  const colors = ["#22c55e", "#4ade80", "#86efac", "#a7f3d0", "#34d399"];
  for (let i = 0; i < 14; i++) {
    const dot = document.createElement("span");
    dot.className = "hydration-burst-particle";
    const angle = (Math.PI * 2 / 14) * i + (Math.random() * 0.4 - 0.2);
    const dist = 40 + Math.random() * 30;
    dot.style.setProperty("--x", `${Math.cos(angle) * dist}px`);
    dot.style.setProperty("--y", `${Math.sin(angle) * dist}px`);
    dot.style.background = colors[i % colors.length];
    dot.style.width = dot.style.height = `${5 + Math.random() * 5}px`;
    dot.style.left = "40px";
    dot.style.top = "80px";
    visual.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove());
  }
}

// checkElectrolyteSuggestion — replaced by renderHydrationTimingTip()
function checkElectrolyteSuggestion() { renderHydrationTimingTip(); }

/* =====================================================================
   SETTINGS MODAL
   ===================================================================== */

function openHydrationSettings() {
  const modal = document.getElementById("hydration-settings-modal");
  if (!modal) return;
  modal.style.display = "";
  requestAnimationFrame(() => modal.classList.add("is-open"));

  const settings = getHydrationSettings();
  const bottleSizeEl = document.getElementById("hydration-bottle-size");
  const targetEl = document.getElementById("hydration-daily-target-oz");
  if (bottleSizeEl) bottleSizeEl.value = settings.bottleSize || 12;
  if (targetEl) targetEl.value = settings.dailyTargetOz || getBaseHydrationTarget();
  _renderBottleEditor();
}

// ── Bottle editor (settings modal) ───────────────────────────────────
// Lets the user set up multiple named bottles (e.g. "Hydroflask 32oz",
// "Gym bottle 20oz") so the hydration card shows a button per bottle
// instead of one generic "+ My Bottle" shortcut.
//
// Editor state lives in the DOM until the user hits Save. Add / Remove
// never touch localStorage — they harvest whatever the user has typed
// from the current rows, mutate the list in memory, and re-render.
// This way mid-edit values survive Add/Remove clicks and nothing is
// persisted until the user explicitly saves the settings form.

function _renderBottleEditor(bottles) {
  const list = document.getElementById("hydration-bottles-list");
  if (!list) return;
  // When called without an explicit list (first open of the modal),
  // start from whatever is in storage.
  if (!bottles) bottles = getNamedBottles();
  if (!bottles.length) {
    list.innerHTML = `<p class="hint" style="margin:0 0 8px">No custom bottles yet. Add one below — each bottle becomes a one-tap log button on the hydration card.</p>`;
    return;
  }
  list.innerHTML = bottles.map(b => {
    const id = escHtml(b.id);
    return `
      <div class="hydration-bottle-row" data-bottle-id="${id}">
        <input type="text" class="hydration-bottle-name" value="${escHtml(b.name || "")}" placeholder="Name (e.g. Hydroflask)" />
        <input type="number" class="hydration-bottle-size" value="${parseFloat(b.size) || ""}" min="1" max="128" placeholder="oz" />
        <button class="hydration-bottle-delete" title="Remove" onclick="_removeBottle('${id}')">&times;</button>
      </div>`;
  }).join("");
}

// Read current editor rows into bottle objects — preserving whatever
// partial text/numbers the user has typed so Add/Remove don't wipe
// unsaved edits. Empty-name rows are preserved here because the user
// may still be typing; the save path is the only place that drops them.
function _harvestBottleEditorRows() {
  return Array.from(document.querySelectorAll(".hydration-bottle-row")).map(row => ({
    id: row.getAttribute("data-bottle-id"),
    name: row.querySelector(".hydration-bottle-name")?.value || "",
    size: parseFloat(row.querySelector(".hydration-bottle-size")?.value) || 0,
  }));
}

function _addBottle() {
  const current = _harvestBottleEditorRows();
  current.push({
    id: "b-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e4).toString(36),
    name: "",
    size: 20,
  });
  _renderBottleEditor(current);
}

function _removeBottle(id) {
  const current = _harvestBottleEditorRows().filter(b => b.id !== id);
  _renderBottleEditor(current);
}

function closeHydrationSettings() {
  const modal = document.getElementById("hydration-settings-modal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.addEventListener("transitionend", () => { modal.style.display = "none"; }, { once: true });
}

function saveHydrationSettings() {
  const bottleSize = parseInt(document.getElementById("hydration-bottle-size")?.value || "12");
  // Math.round (not parseInt) so a typed "96.5" rounds to 97 instead of
  // truncating to 96 — keeps the saved target consistent with what the
  // user sees on the bar and matches Bug 3's "no fractional oz" rule.
  const dailyTargetOz = Math.round(parseFloat(document.getElementById("hydration-daily-target-oz")?.value || "96")) || 96;

  // Harvest the bottle editor rows — each row carries its id and the
  // latest name/size the user typed. Empty or zero-sized entries are
  // dropped so the user can delete a bottle by clearing its fields.
  const rows = Array.from(document.querySelectorAll(".hydration-bottle-row"));
  const bottles = rows.map(row => {
    const id = row.getAttribute("data-bottle-id");
    const name = row.querySelector(".hydration-bottle-name")?.value.trim() || "";
    const size = parseFloat(row.querySelector(".hydration-bottle-size")?.value) || 0;
    return { id, name, size };
  }).filter(b => b.size > 0 && b.name);

  // Merge with existing settings so we don't blow away other keys.
  const prev = getHydrationSettings();
  saveHydrationSettingsData(Object.assign({}, prev, { bottleSize, dailyTargetOz, bottles }));
  closeHydrationSettings();
  renderHydration();
}

/* =====================================================================
   SAUNA HYDRATION ADJUSTMENT
   ===================================================================== */

function adjustHydrationForSauna(dateStr, durationMinutes) {
  // ~1.5 oz additional hydration per minute of sauna/steam exposure
  const additionalOz = Math.round(durationMinutes * 1.5);
  try {
    const log = JSON.parse(localStorage.getItem("hydrationLog")) || {};
    const dayLog = log[dateStr] || { total: 0, beverages: [], saunaBonus: 0 };
    dayLog.saunaBonus = (dayLog.saunaBonus || 0) + additionalOz;
    log[dateStr] = dayLog;
    localStorage.setItem("hydrationLog", JSON.stringify(log)); if (typeof DB !== 'undefined') DB.syncKey('hydrationLog');
  } catch {}
}

/* =====================================================================
   INIT
   ===================================================================== */

function initHydration() {
  applyHydrationToggle();
  if (isHydrationEnabled()) renderHydration();

  // Pull fresh hydrationLog when the tab regains focus so a desktop
  // user who's already got the page open sees additions made on
  // their phone without needing to reload. visibilitychange fires
  // when the user switches back to this tab/window. Throttled so
  // rapid focus toggles don't hammer the API.
  let _lastFocusRefresh = 0;
  const _refreshOnFocus = async () => {
    if (document.hidden) return;
    if (!isHydrationEnabled()) return;
    if (typeof DB === "undefined" || typeof DB.refreshKey !== "function") return;
    const now = Date.now();
    if (now - _lastFocusRefresh < 5000) return; // throttle to once per 5s
    _lastFocusRefresh = now;
    try {
      const ok = await DB.refreshKey("hydrationLog");
      if (ok) renderHydration();
    } catch {}
  };
  document.addEventListener("visibilitychange", _refreshOnFocus);
  // focus fires on desktop when the user clicks back into the tab
  // even without visibility flipping; covers both bases.
  window.addEventListener("focus", _refreshOnFocus);

  // Realtime: when the OTHER device upserts hydrationLog, db.js's
  // postgres_changes subscription writes it to localStorage and
  // dispatches ironz:data-refresh. Re-render so the bar reflects the
  // phone's add without needing the desktop user to switch tabs.
  document.addEventListener("ironz:data-refresh", (e) => {
    const keys = (e && e.detail && e.detail.keys) || [];
    if (!keys.includes("hydrationLog")) return;
    if (!isHydrationEnabled()) return;
    try { renderHydration(); } catch {}
  });
}
