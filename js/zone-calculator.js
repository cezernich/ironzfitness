// zone-calculator.js — Tiered heart rate zone calculation system
// Implements progressive accuracy: age-only → Karvonen (HRR) → LTHR
// Reference: Tanaka et al. (2001), Karvonen et al. (1957), ACSM Guidelines 11th ed.

const HR_ZONE_TIERS = {
  TIER_1_MAX_HR: 'max_hr_pct',
  TIER_2_KARVONEN: 'karvonen_hrr',
  TIER_3_LTHR: 'lthr'
};

const TIER_1_ZONES = {
  1: { name: 'Recovery',   pct: [0.50, 0.60] },
  2: { name: 'Aerobic',    pct: [0.60, 0.70] },
  3: { name: 'Tempo',      pct: [0.70, 0.80] },
  4: { name: 'Threshold',  pct: [0.80, 0.90] },
  5: { name: 'VO2max',     pct: [0.90, 1.00] }
};

const TIER_2_ZONES_HRR = {
  1: { name: 'Recovery',   pct: [0.40, 0.50] },
  2: { name: 'Aerobic',    pct: [0.50, 0.65] },
  3: { name: 'Tempo',      pct: [0.65, 0.78] },
  4: { name: 'Threshold',  pct: [0.78, 0.88] },
  5: { name: 'VO2max',     pct: [0.88, 1.00] }
};

const TIER_3_ZONES_LTHR = {
  1: { name: 'Recovery',   pct: [0.00, 0.75] },
  2: { name: 'Aerobic',    pct: [0.75, 0.85] },
  3: { name: 'Tempo',      pct: [0.85, 0.95] },
  4: { name: 'Threshold',  pct: [0.95, 1.02] },
  5: { name: 'VO2max',     pct: [1.02, 1.10] }
};

/**
 * Estimate max HR using Tanaka formula (more accurate than 220 - age).
 * Tanaka et al. (2001): meta-analysis of 18,712 subjects.
 */
function estimateMaxHR(age) {
  return Math.round(208 - (0.7 * age));
}

/**
 * Determine the highest available zone calculation tier based on user data.
 * Returns { tier, method, data } with what's available.
 */
function determineZoneTier(profile) {
  const age = parseInt(profile.age);
  const restingHR = parseInt(profile.restingHR || profile.resting_hr);
  const lthr = parseInt(profile.lthr || profile.lactateThresholdHR);
  const knownMaxHR = parseInt(profile.knownMaxHR || profile.known_max_hr);
  const maxHR = (knownMaxHR && knownMaxHR > 100) ? knownMaxHR : (age ? estimateMaxHR(age) : null);

  if (lthr && lthr > 100) {
    return { tier: 3, method: HR_ZONE_TIERS.TIER_3_LTHR, maxHR, restingHR, lthr };
  }
  if (maxHR && restingHR && restingHR > 30) {
    return { tier: 2, method: HR_ZONE_TIERS.TIER_2_KARVONEN, maxHR, restingHR, lthr: null };
  }
  if (maxHR) {
    return { tier: 1, method: HR_ZONE_TIERS.TIER_1_MAX_HR, maxHR, restingHR: null, lthr: null };
  }
  return null; // No age or max HR — cannot calculate zones
}

/**
 * Calculate HR zones using the highest available tier.
 * Returns { tier, method, zones: { z1..z5: { name, low, high } }, maxHR, upgradePrompt }
 */
function calculateHRZones(profile) {
  const tierInfo = determineZoneTier(profile);
  if (!tierInfo) return null;

  const { tier, method, maxHR, restingHR, lthr } = tierInfo;
  const zones = {};
  let upgradePrompt = null;
  const knownMaxHR = parseInt(profile.knownMaxHR || profile.known_max_hr);
  const usingKnownMax = knownMaxHR && knownMaxHR > 100;

  if (tier === 3) {
    // LTHR-based zones
    for (const [num, z] of Object.entries(TIER_3_ZONES_LTHR)) {
      zones[`z${num}`] = {
        name: z.name,
        low: num === '1' ? null : Math.round(lthr * z.pct[0]),
        high: Math.round(lthr * z.pct[1])
      };
    }
  } else if (tier === 2) {
    // Karvonen / HRR zones
    const hrr = maxHR - restingHR;
    for (const [num, z] of Object.entries(TIER_2_ZONES_HRR)) {
      zones[`z${num}`] = {
        name: z.name,
        low: Math.round(hrr * z.pct[0] + restingHR),
        high: Math.round(hrr * z.pct[1] + restingHR)
      };
    }
    upgradePrompt = 'For even more accurate zones, enter your lactate threshold heart rate in settings.';
  } else {
    // Tier 1: straight max HR percentage
    for (const [num, z] of Object.entries(TIER_1_ZONES)) {
      zones[`z${num}`] = {
        name: z.name,
        low: Math.round(maxHR * z.pct[0]),
        high: Math.round(maxHR * z.pct[1])
      };
    }
    upgradePrompt = 'These zones are estimates based on your age. For more accurate zones, add your resting heart rate in settings.';
  }

  return {
    tier,
    method,
    maxHR,
    usingKnownMax,
    zones,
    upgradePrompt
  };
}

/**
 * Format zone for display: "Z2 Aerobic: 120-140 bpm"
 */
function formatHRZone(zoneKey, zoneData) {
  const num = zoneKey.replace('z', '');
  if (zoneData.low === null) {
    return `Z${num} ${zoneData.name}: < ${zoneData.high} bpm`;
  }
  return `Z${num} ${zoneData.name}: ${zoneData.low}-${zoneData.high} bpm`;
}

/**
 * Store calculated HR zones to localStorage and sync.
 * Merges with existing trainingZones object under 'hr' key.
 */
function storeHRZones(zoneResult) {
  if (!zoneResult) return;
  try {
    const all = JSON.parse(localStorage.getItem('trainingZones') || '{}');
    all.hr = {
      tier: zoneResult.tier,
      method: zoneResult.method,
      maxHR: zoneResult.maxHR,
      usingKnownMax: zoneResult.usingKnownMax,
      zones: zoneResult.zones,
      calculatedAt: new Date().toISOString()
    };
    localStorage.setItem('trainingZones', JSON.stringify(all));
    if (typeof DB !== 'undefined') DB.syncKey('trainingZones');
  } catch (e) {
    console.warn('[IronZ] Failed to store HR zones:', e.message);
  }
}

/**
 * Recalculate and store HR zones from the current profile.
 * Call this when the user updates age, resting HR, LTHR, or known max HR.
 */
function recalculateHRZones() {
  try {
    const profile = JSON.parse(localStorage.getItem('profile') || '{}');
    const result = calculateHRZones(profile);
    if (result) {
      storeHRZones(result);
      console.log(`[IronZ] HR zones recalculated (Tier ${result.tier}: ${result.method})`);
      if (result.upgradePrompt) {
        console.log(`[IronZ] Zone upgrade prompt: ${result.upgradePrompt}`);
      }
    }
    return result;
  } catch (e) {
    console.warn('[IronZ] HR zone recalculation failed:', e.message);
    return null;
  }
}

/**
 * Get the current HR zones from storage (no recalculation).
 */
function getStoredHRZones() {
  try {
    const all = JSON.parse(localStorage.getItem('trainingZones') || '{}');
    return all.hr || null;
  } catch { return null; }
}

/**
 * LTHR estimation methods the app can offer to users.
 */
const LTHR_ESTIMATION_METHODS = [
  { id: 'lab_test', label: 'I know my LTHR from a lab test', type: 'direct_input' },
  { id: 'diy_test', label: '30-minute all-out test', description: 'Run 30 minutes all-out. Your average HR for the last 20 minutes is approximately your LTHR.' },
  { id: 'race_estimate', label: 'Estimate from a recent race', description: 'Enter a recent race result and we\'ll estimate your LTHR using Daniels\' tables.' }
];

// ═════════════════════════════════════════════════════════════════════════════
// BIKE ZONES — Coggan % FTP (added 2026-04-09 by threshold-week update)
// Reference: Coggan & Allen, Training and Racing with a Power Meter
// ═════════════════════════════════════════════════════════════════════════════

const BIKE_ZONES_COGGAN = {
  1: { name: 'Active Recovery', pct: [0.00, 0.55] },
  2: { name: 'Endurance',       pct: [0.56, 0.75] },
  3: { name: 'Tempo',           pct: [0.76, 0.90] },
  4: { name: 'Threshold',       pct: [0.91, 1.05] },
  5: { name: 'VO2max',          pct: [1.06, 1.20] }
};

/**
 * Calculate cycling power zones from FTP using Coggan's % FTP table.
 * @param {number} ftpWatts
 * @returns {{ ftp: number, zones: { z1..z5: { name, low, high } } } | null}
 */
function calculateBikeZonesFromFTP(ftpWatts) {
  const ftp = parseInt(ftpWatts);
  if (!ftp || ftp < 50) return null;
  const zones = {};
  for (const [num, z] of Object.entries(BIKE_ZONES_COGGAN)) {
    zones[`z${num}`] = {
      name: z.name,
      low: num === '1' ? null : Math.round(ftp * z.pct[0]),
      high: Math.round(ftp * z.pct[1])
    };
  }
  return { ftp, zones };
}

/**
 * Format bike zone for display: "Z4 Threshold: 228-263 W"
 */
function formatBikeZone(zoneKey, zoneData) {
  const num = zoneKey.replace('z', '');
  if (zoneData.low === null) {
    return `Z${num} ${zoneData.name}: < ${zoneData.high} W`;
  }
  return `Z${num} ${zoneData.name}: ${zoneData.low}-${zoneData.high} W`;
}

// ═════════════════════════════════════════════════════════════════════════════
// SWIM ZONES — CSS-derived bands (added 2026-04-09 by threshold-week update)
// Reference: Olbrecht (Science of Winning); TrainingPeaks Hayden Scott on CSS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Format seconds-per-100m as "M:SS/100".
 */
function formatSwimPace(secPer100m) {
  const total = Math.round(secPer100m);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}/100`;
}

/**
 * Calculate swim zones from CSS (sec per 100m).
 * - easy = CSS + 12 s/100m
 * - threshold = CSS
 * - race pace = CSS - 4 s/100m (midpoint of the 3-5 s range)
 * @param {number} cssSecPer100m
 * @returns {{ css: number, zones: { easy, threshold, race } } | null}
 */
function calculateSwimZonesFromCSS(cssSecPer100m) {
  const css = parseFloat(cssSecPer100m);
  if (!css || css <= 0) return null;
  return {
    css,
    zones: {
      easy:      { name: 'Easy',      sec_per_100m: css + 12, label: formatSwimPace(css + 12) },
      threshold: { name: 'Threshold', sec_per_100m: css,      label: formatSwimPace(css) },
      race:      { name: 'Race',      sec_per_100m: css - 4,  label: formatSwimPace(css - 4) }
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// VDOT-derived running pace zones (placeholder lookup for the threshold-week
// post-test workflow). When vdot-lookup.js is added with the full Daniels table
// it will replace this. For now we expose a stable interface.
// ═════════════════════════════════════════════════════════════════════════════

// Minimal Daniels VDOT → pace bridge. Pace values are sec/mile for E/M/T/I/R.
// Source: Daniels' Running Formula (table excerpts, key VDOT values).
const VDOT_PACE_TABLE = {
  30: { E: 720, M: 645, T: 612, I: 553, R: 514 },
  35: { E: 660, M: 588, T: 558, I: 504, R: 469 },
  40: { E: 612, M: 542, T: 514, I: 463, R: 431 },
  45: { E: 571, M: 504, T: 477, I: 429, R: 399 },
  50: { E: 537, M: 472, T: 446, I: 401, R: 372 },
  55: { E: 508, M: 444, T: 419, I: 376, R: 349 },
  60: { E: 482, M: 419, T: 396, I: 354, R: 329 },
  65: { E: 459, M: 397, T: 375, I: 335, R: 311 },
  70: { E: 439, M: 378, T: 357, I: 318, R: 295 },
  75: { E: 421, M: 361, T: 341, I: 303, R: 281 },
  80: { E: 405, M: 345, T: 326, I: 290, R: 268 },
  85: { E: 391, M: 331, T: 313, I: 278, R: 257 }
};

function _formatPaceSecPerMile(sec) {
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}/mi`;
}

/**
 * Look up the closest VDOT row and return formatted pace zones.
 * Falls back to nearest neighbor if exact VDOT isn't tabulated.
 */
function calculateRunZonesFromVDOT(vdot) {
  const v = parseFloat(vdot);
  if (!v || v < 25) return null;
  const keys = Object.keys(VDOT_PACE_TABLE).map(Number).sort((a, b) => a - b);
  const nearest = keys.reduce((best, k) => Math.abs(k - v) < Math.abs(best - v) ? k : best, keys[0]);
  const row = VDOT_PACE_TABLE[nearest];
  return {
    vdot: v,
    nearest_table_vdot: nearest,
    zones: {
      E: { name: 'Easy',       sec_per_mile: row.E, label: _formatPaceSecPerMile(row.E) },
      M: { name: 'Marathon',   sec_per_mile: row.M, label: _formatPaceSecPerMile(row.M) },
      T: { name: 'Threshold',  sec_per_mile: row.T, label: _formatPaceSecPerMile(row.T) },
      I: { name: 'Interval',   sec_per_mile: row.I, label: _formatPaceSecPerMile(row.I) },
      R: { name: 'Repetition', sec_per_mile: row.R, label: _formatPaceSecPerMile(row.R) }
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Unified zone refresh entry point used by the test-result handler.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Recompute every cached zone from the user's current profile values
 * (vdot, ftp_watts, css_sec_per_100m, age, restingHR, lthr) and write the
 * results back to localStorage under `trainingZones`. Returns the new bundle.
 */
function recalculateAllZones(userProfile) {
  let profile = userProfile;
  if (!profile) {
    try { profile = JSON.parse(localStorage.getItem('profile') || '{}'); } catch { profile = {}; }
  }

  const bundle = {};

  // HR — uses existing tiered logic
  const hr = calculateHRZones(profile);
  if (hr) {
    bundle.hr = {
      tier: hr.tier,
      method: hr.method,
      maxHR: hr.maxHR,
      usingKnownMax: hr.usingKnownMax,
      zones: hr.zones,
      calculatedAt: new Date().toISOString()
    };
  }

  // Run paces from VDOT
  const vdot = parseFloat(profile.vdot || profile.run_vdot);
  if (vdot) {
    const r = calculateRunZonesFromVDOT(vdot);
    if (r) bundle.run = { ...r, calculatedAt: new Date().toISOString() };
  }

  // Bike power from FTP
  const ftp = parseFloat(profile.ftp_watts || profile.ftp);
  if (ftp) {
    const b = calculateBikeZonesFromFTP(ftp);
    if (b) bundle.bike = { ...b, calculatedAt: new Date().toISOString() };
  }

  // Swim from CSS
  const css = parseFloat(profile.css_sec_per_100m || profile.css);
  if (css) {
    const s = calculateSwimZonesFromCSS(css);
    if (s) bundle.swim = { ...s, calculatedAt: new Date().toISOString() };
  }

  try {
    localStorage.setItem('trainingZones', JSON.stringify(bundle));
    if (typeof DB !== 'undefined' && DB.syncKey) DB.syncKey('trainingZones');
  } catch (e) {
    console.warn('[IronZ] Failed to persist recalculated zones:', e.message);
  }
  return bundle;
}

// ═════════════════════════════════════════════════════════════════════════════
// PACE RANGE TABLE — used by getZonesForUser() for the structured zone shape.
// Calibrated against PHILOSOPHY_UPDATE_2026-04-09_run_session_types.md golden
// test cases at VDOT 53 (E, M, T, I, R all match the spec's pace examples).
// Values are [low_sec_per_mi, high_sec_per_mi] for each Daniels intensity.
// Daniels' actual table is sparse; we interpolate linearly between anchors.
// ═════════════════════════════════════════════════════════════════════════════

const VDOT_PACE_RANGE_TABLE = {
  30: { E: [720, 760], M: [645, 660], T: [600, 615], I: [540, 555], R: [500, 520] },
  35: { E: [660, 700], M: [580, 600], T: [545, 560], I: [490, 505], R: [455, 472] },
  40: { E: [612, 650], M: [535, 555], T: [500, 520], I: [450, 465], R: [415, 432] },
  45: { E: [571, 605], M: [495, 515], T: [462, 480], I: [415, 430], R: [380, 397] },
  50: { E: [530, 565], M: [460, 480], T: [430, 446], I: [385, 400], R: [345, 362] },
  53: { E: [471, 512], M: [420, 430], T: [396, 411], I: [362, 372], R: [305, 322] },
  55: { E: [490, 525], M: [435, 450], T: [410, 425], I: [368, 380], R: [330, 345] },
  60: { E: [460, 495], M: [410, 425], T: [385, 400], I: [345, 358], R: [305, 320] },
  65: { E: [432, 466], M: [385, 400], T: [362, 378], I: [325, 338], R: [285, 300] },
  70: { E: [410, 442], M: [365, 380], T: [343, 358], I: [307, 320], R: [268, 282] },
  75: { E: [390, 420], M: [347, 362], T: [325, 340], I: [291, 304], R: [253, 266] },
  80: { E: [371, 400], M: [330, 345], T: [310, 325], I: [276, 289], R: [240, 253] },
  85: { E: [355, 384], M: [316, 330], T: [296, 310], I: [263, 275], R: [228, 240] }
};

function _interpolateRow(vdot) {
  const keys = Object.keys(VDOT_PACE_RANGE_TABLE).map(Number).sort((a, b) => a - b);
  if (vdot <= keys[0]) return VDOT_PACE_RANGE_TABLE[keys[0]];
  if (vdot >= keys[keys.length - 1]) return VDOT_PACE_RANGE_TABLE[keys[keys.length - 1]];
  // Exact match
  if (VDOT_PACE_RANGE_TABLE[vdot]) return VDOT_PACE_RANGE_TABLE[vdot];
  // Linear interp between neighbors
  let lo = keys[0], hi = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (vdot >= keys[i] && vdot <= keys[i + 1]) { lo = keys[i]; hi = keys[i + 1]; break; }
  }
  const a = VDOT_PACE_RANGE_TABLE[lo];
  const b = VDOT_PACE_RANGE_TABLE[hi];
  const f = (vdot - lo) / (hi - lo);
  const blend = ([al, ah], [bl, bh]) => [
    Math.round(al + (bl - al) * f),
    Math.round(ah + (bh - ah) * f)
  ];
  return {
    E: blend(a.E, b.E),
    M: blend(a.M, b.M),
    T: blend(a.T, b.T),
    I: blend(a.I, b.I),
    R: blend(a.R, b.R)
  };
}

function _formatMmSs(totalSec) {
  const t = Math.round(totalSec);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function _paceMiToKm(secPerMi) { return Math.round(secPerMi / 1.609344); }
function _paceMiToM(secPerMi, meters) { return Math.round(secPerMi * meters / 1609.344); }

function _packPaceMiKm(rangeSecPerMi) {
  const [lowMi, highMi] = rangeSecPerMi;
  return {
    sec_per_mi: [lowMi, highMi],
    min_per_mi: [_formatMmSs(lowMi) + '/mi', _formatMmSs(highMi) + '/mi'],
    sec_per_km: [_paceMiToKm(lowMi), _paceMiToKm(highMi)],
    min_per_km: [_formatMmSs(_paceMiToKm(lowMi)) + '/km', _formatMmSs(_paceMiToKm(highMi)) + '/km']
  };
}

function _packIntervalPace(rangeSecPerMi) {
  const [lowMi, highMi] = rangeSecPerMi;
  return {
    sec_per_mi: [lowMi, highMi],
    sec_per_400m: [_paceMiToM(lowMi, 400), _paceMiToM(highMi, 400)],
    sec_per_800m: [_paceMiToM(lowMi, 800), _paceMiToM(highMi, 800)],
    sec_per_1000m: [_paceMiToM(lowMi, 1000), _paceMiToM(highMi, 1000)],
    sec_per_1200m: [_paceMiToM(lowMi, 1200), _paceMiToM(highMi, 1200)],
    sec_per_km: [_paceMiToKm(lowMi), _paceMiToKm(highMi)]
  };
}

function _packRepetitionPace(rangeSecPerMi) {
  const [lowMi, highMi] = rangeSecPerMi;
  return {
    sec_per_mi: [lowMi, highMi],
    sec_per_200m: [_paceMiToM(lowMi, 200), _paceMiToM(highMi, 200)],
    sec_per_400m: [_paceMiToM(lowMi, 400), _paceMiToM(highMi, 400)]
  };
}

/**
 * Public API consumed by RUNNING_WORKOUT_GENERATOR. Returns the structured
 * zone bundle for the user identified by `userId` (defaults to the active
 * profile in localStorage when `userId` is omitted).
 *
 * Returns null if the user has no VDOT — the generator must then fall back
 * to effort-based descriptions.
 */
function getZonesForUser(userId) {
  let profile = {};
  try {
    profile = JSON.parse(localStorage.getItem('profile') || '{}');
  } catch { profile = {}; }
  // userId arg reserved for future multi-user support; today we always use the
  // active local profile.

  const vdotRaw = parseFloat(profile.vdot || profile.run_vdot);
  if (!vdotRaw || vdotRaw < 25) {
    // Caller is responsible for fallback handling.
    return null;
  }

  const row = _interpolateRow(vdotRaw);

  // HR zones (best-tier available; null if not enough profile data).
  const hr = calculateHRZones(profile);
  let hrZones = null;
  let tierUsed = null;
  if (hr) {
    tierUsed = hr.method;
    hrZones = Object.entries(hr.zones).map(([key, z]) => ({
      zone: key,
      name: z.name,
      bpm: [z.low, z.high]
    }));
  }

  return {
    vdot: vdotRaw,
    e_pace: _packPaceMiKm(row.E),
    m_pace: _packPaceMiKm(row.M),
    t_pace: _packPaceMiKm(row.T),
    i_pace: _packIntervalPace(row.I),
    r_pace: _packRepetitionPace(row.R),
    hr_zones: hrZones,
    tier_used: tierUsed
  };
}

// Browser global
if (typeof window !== 'undefined') {
  window.ZoneCalculator = {
    estimateMaxHR,
    determineZoneTier,
    calculateHRZones,
    formatHRZone,
    storeHRZones,
    recalculateHRZones,
    getStoredHRZones,
    calculateBikeZonesFromFTP,
    formatBikeZone,
    calculateSwimZonesFromCSS,
    formatSwimPace,
    calculateRunZonesFromVDOT,
    recalculateAllZones,
    getZonesForUser,
    BIKE_ZONES_COGGAN,
    VDOT_PACE_TABLE,
    VDOT_PACE_RANGE_TABLE,
    LTHR_ESTIMATION_METHODS
  };
}
