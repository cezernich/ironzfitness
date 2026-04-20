// hydration.js — Water tracking with visual bottle fill and smart daily targets

/* =====================================================================
   BEVERAGE TYPES & COEFFICIENTS
   ===================================================================== */

const BEVERAGE_TYPES = {
  water:        { label: "Water",        coeff: 1.0,  icon: "\u{1F4A7}" },
  sports_drink: { label: "Sports Drink", coeff: 1.0,  icon: "\u26A1" },
  tea:          { label: "Tea",          coeff: 0.85, icon: "\u{1F375}" },
  coffee:       { label: "Coffee",       coeff: 0.75, icon: "\u2615" }
};

// ── Workout bonus: duration-scaled hydration (Section 11e) ──────────────
//
// Replaces the old flat lookup (strength=20, run=24, etc.) with a per-hour
// rate × actual duration, floored at 16 oz. The floor protects short
// workouts (a 20-min strength session still gets 16 oz even though
// 18/hr × 0.33 hr = 6). Ceilings are enforced only at the race-day path
// below, where the race distance determines the expected duration.
const HYDRATION_RATE_OZ_PER_HOUR = {
  run: 22, running: 22, bike: 22, cycling: 22, swim: 22, swimming: 22, brick: 22, rowing: 22,
  hyrox: 22, circuit: 20,
  strength: 18, hiit: 18, weights: 18, crossfit: 18, weightlifting: 18, bodyweight: 16,
  yoga: 12, stretch: 12, flexibility: 12, mobility: 12, walking: 12,
};
const HYDRATION_FLOOR_OZ = 16;

function computeWorkoutBonusOz(type, durationMin) {
  const t = String(type || "").toLowerCase();
  const rate = HYDRATION_RATE_OZ_PER_HOUR[t] || 18;
  const hours = Math.max(0, (parseFloat(durationMin) || 0) / 60);
  const scaled = Math.round(rate * hours);
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
  // Don't allow future dates
  if (newDate > today) return;
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
      const coeff = (BEVERAGE_TYPES[e.type] || BEVERAGE_TYPES.water).coeff;
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
    const coeff = (BEVERAGE_TYPES[b.type] || BEVERAGE_TYPES.water).coeff;
    effectiveOz += Math.max(0, parseFloat(b.count) || 0) * bottleSize * coeff;
  }
  return Math.max(0, Math.round(effectiveOz));
}

/** Get workout bonus for a specific date. Picks the session with the
 *  highest duration-scaled bonus when multiple are scheduled on one day. */
function getWorkoutInfoForDate(dateStr) {
  try {
    const schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
    const dayWorkouts = schedule.filter(w => w.date === dateStr);
    if (dayWorkouts.length === 0) return null;
    let bestBonus = 0;
    let bestName = "";
    let bestDurationMin = 0;
    for (const w of dayWorkouts) {
      const d = parseFloat(w.duration);
      const durationMin = isFinite(d) && d > 0 ? d : 0;
      const bonus = computeWorkoutBonusOz(w.type, durationMin);
      if (bonus > bestBonus) {
        bestBonus = bonus;
        bestName = w.sessionName || w.type || "workout";
        bestDurationMin = durationMin;
      }
    }
    return { bonusOz: bestBonus, sessionName: bestName, durationMin: bestDurationMin };
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
  return {
    baseOz,
    bonusOz: totalBonus,
    totalOz: baseOz + totalBonus,
    reason,
    race,
    preload,
    sodiumGuidance,
    workoutBonusOz,
    raceBonusOz,
    preloadBonusOz,
    saunaBonus,
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
  if (typeof DB !== "undefined") DB.syncKey("hydrationLog");
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
    const prevOz = effectiveOz - bottleSize * (BEVERAGE_TYPES[type] || BEVERAGE_TYPES.water).coeff;
    if (effectiveOz >= targetOz && prevOz < targetOz) {
      playHydrationGoalAnimation();
    }
  }
}

function logWaterOz(oz) {
  const type = _selectedBeverage || "water";
  const dateStr = getHydrationDate();
  _pushHydrationEntry(type, oz);

  renderHydration();

  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }

  if (dateStr === getTodayString()) {
    const effectiveOz = getEffectiveOzForDate(dateStr);
    const targetOz = getHydrationBreakdownForDate(dateStr).totalOz;
    const coeff = (BEVERAGE_TYPES[type] || BEVERAGE_TYPES.water).coeff;
    const prevOz = effectiveOz - oz * coeff;
    if (effectiveOz >= targetOz && prevOz < targetOz) {
      playHydrationGoalAnimation();
    }
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
    if (typeof DB !== "undefined") DB.syncKey("hydrationLog");
    renderHydration();
    return;
  }

  day.entries.pop();
  _rebuildDayAggregates(day);

  log[dateStr] = day;
  localStorage.setItem("hydrationLog", JSON.stringify(log));
  if (typeof DB !== "undefined") DB.syncKey("hydrationLog");
  renderHydration();

  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
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
  const undoBtn = document.getElementById("hydration-undo-btn");
  if (undoBtn) undoBtn.style.display = effectiveOz > 0 ? "" : "none";

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
      remainingLabel = `${need} more to hit goal`;
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
  let tip;
  if (hour < 10) {
    tip = `Training day: front-load hydration before your ${workoutInfo.sessionName}. Aim for ${Math.round(workoutInfo.bonusOz * 0.6)}oz before you start.`;
  } else if (hour < 16) {
    let electrolyteClause;
    if (dur >= 90) {
      electrolyteClause = `Add electrolytes during your ${dur}-min ${workoutInfo.sessionName}.`;
    } else if (dur > 60) {
      electrolyteClause = `Add electrolytes during your ${dur}-min ${workoutInfo.sessionName}.`;
    } else if (dur > 0) {
      electrolyteClause = `Water is fine for your ${dur}-min ${workoutInfo.sessionName} — no electrolytes needed.`;
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
  const dailyTargetOz = parseInt(document.getElementById("hydration-daily-target-oz")?.value || "96");

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
}
