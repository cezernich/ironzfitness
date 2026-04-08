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
