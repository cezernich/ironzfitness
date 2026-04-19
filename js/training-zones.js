// training-zones.js — Convert threshold data to per-zone paces / power / pace.
// Implements §8b of PLAN_GENERATOR_MASTER_SPEC.md.
//
// Inputs come from localStorage.thresholds:
//   { running_5k: "19:40", cycling_ftp: 250 (watts), swim_css: "1:50" (min:sec/100m) }
// If a threshold is missing, the zone object returns null for that sport —
// callers fall back to RPE-based descriptions (§8b last paragraph).

(function (global) {
  "use strict";

  // Parse "mm:ss" → seconds. Also accepts "h:mm:ss" for longer races.
  function _parseTime(str) {
    if (typeof str === "number") return str;
    if (typeof str !== "string") return null;
    const parts = str.trim().split(":").map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  function _formatSecPerMile(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return null;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec - m * 60);
    return `${m}:${String(s).padStart(2, "0")}/mi`;
  }

  function _formatSecPerKm(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return null;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec - m * 60);
    return `${m}:${String(s).padStart(2, "0")}/km`;
  }

  function _formatSwimPace(secPer100m) {
    if (!Number.isFinite(secPer100m) || secPer100m <= 0) return null;
    const m = Math.floor(secPer100m / 60);
    const s = Math.round(secPer100m - m * 60);
    return `${m}:${String(s).padStart(2, "0")}/100m`;
  }

  // Running zones from 5K time. The ratios are Daniels/VDOT-adjacent —
  // §8b gives Chase's 19:40 5K → ~6:20/mi 5K pace with Z3=7:05–7:20/mi,
  // which maps to roughly:
  //   Z1 = 5K pace × 1.45–1.55   (recovery jog, +3:00/mi)
  //   Z2 = 5K pace × 1.28–1.38   (easy aerobic, +1:40–2:10/mi)
  //   Z3 = 5K pace × 1.10–1.15   (tempo / threshold)
  //   Z4 = 5K pace × 1.00–1.04   (VO2max reps)
  //   Z5 = 5K pace × 0.92–0.97   (speed / repetition)
  // Returns { z1: {low, high, label}, z2: {...}, ... } in sec/mile.
  function computeRunningZones(thresholds) {
    const fiveK = thresholds && (thresholds.running_5k || thresholds.running5k);
    if (!fiveK) return null;
    const raceSec = _parseTime(fiveK);
    if (!raceSec) return null;
    // 5K = 3.10686 miles → pace in sec/mi.
    const pace5k = raceSec / 3.10686;
    const zone = (lowMult, highMult) => {
      const low = pace5k * lowMult;
      const high = pace5k * highMult;
      return {
        low_sec_per_mile: Math.round(low),
        high_sec_per_mile: Math.round(high),
        low_pace: _formatSecPerMile(low),
        high_pace: _formatSecPerMile(high),
        low_pace_km: _formatSecPerKm(low / 1.60934),
        high_pace_km: _formatSecPerKm(high / 1.60934),
        label: `${_formatSecPerMile(high)}–${_formatSecPerMile(low)}`,
      };
    };
    return {
      sport: "run",
      fiveK: { pace_sec_per_mile: Math.round(pace5k), pace: _formatSecPerMile(pace5k), race_time_sec: raceSec },
      z1: zone(1.45, 1.55),
      z2: zone(1.28, 1.38),
      z3: zone(1.10, 1.15),
      z4: zone(1.00, 1.04),
      z5: zone(0.92, 0.97),
    };
  }

  // Cycling zones from FTP (watts). Uses the widely-adopted Coggan zones:
  //   Z1 < 55%, Z2 56–75%, Z3 76–90%, Z4 91–105%, Z5 106–120%, Z6/Z7 >120%.
  function computeCyclingZones(thresholds) {
    const ftp = thresholds && (thresholds.cycling_ftp || thresholds.bike_ftp || thresholds.ftp);
    if (!ftp) return null;
    const ftpW = Number(ftp);
    if (!Number.isFinite(ftpW) || ftpW <= 0) return null;
    const band = (lowPct, highPct) => ({
      low_watts: Math.round(ftpW * lowPct),
      high_watts: Math.round(ftpW * highPct),
      label: `${Math.round(ftpW * lowPct)}–${Math.round(ftpW * highPct)}W`,
      pct_label: `${Math.round(lowPct * 100)}–${Math.round(highPct * 100)}% FTP`,
    });
    return {
      sport: "bike",
      ftp: ftpW,
      z1: band(0.00, 0.55),
      z2: band(0.56, 0.75),
      z3: band(0.76, 0.90),
      z4: band(0.91, 1.05),
      z5: band(1.06, 1.20),
    };
  }

  // Swim zones from CSS pace (sec/100m). §8b:
  //   Z1 = CSS + 15–20 sec/100m
  //   Z2 = CSS + 5–10 sec/100m
  //   Z3 = CSS pace
  //   Z4 = CSS – 3–5 sec/100m
  function computeSwimZones(thresholds) {
    const css = thresholds && (thresholds.swim_css || thresholds.swimming_css || thresholds.css);
    if (!css) return null;
    const cssSec = _parseTime(css);
    if (!cssSec) return null;
    const zone = (lowOff, highOff) => {
      const low = cssSec + lowOff;
      const high = cssSec + highOff;
      return {
        low_sec_per_100m: Math.round(low),
        high_sec_per_100m: Math.round(high),
        low_pace: _formatSwimPace(low),
        high_pace: _formatSwimPace(high),
        label: `${_formatSwimPace(high)}–${_formatSwimPace(low)}`,
      };
    };
    return {
      sport: "swim",
      css: { pace_sec_per_100m: cssSec, pace: _formatSwimPace(cssSec) },
      z1: zone(15, 20),
      z2: zone(5, 10),
      z3: { low_sec_per_100m: cssSec, high_sec_per_100m: cssSec, low_pace: _formatSwimPace(cssSec), high_pace: _formatSwimPace(cssSec), label: _formatSwimPace(cssSec) },
      z4: zone(-5, -3),
    };
  }

  // RPE fallback descriptions when zones can't be computed (no threshold data).
  const RPE_LABELS = {
    z1: "very easy — conversational, could talk for hours",
    z2: "easy aerobic — comfortable, can hold conversation",
    z3: "moderate — comfortably hard, short sentences only",
    z4: "threshold — hard, 1–3 word answers only",
    z5: "very hard — can't talk, near max effort",
  };

  function computeAllZones(thresholds) {
    return {
      run: computeRunningZones(thresholds),
      bike: computeCyclingZones(thresholds),
      swim: computeSwimZones(thresholds),
      rpe: RPE_LABELS,
    };
  }

  // Resolve a zone reference like "Z3" or "Z2–Z3" for a given sport into a
  // concrete label the athlete can read. Falls back to the RPE descriptor
  // when the sport's zones aren't available.
  function resolveZone(allZones, sport, zoneRef) {
    if (!zoneRef) return "";
    const txt = String(zoneRef).toUpperCase().trim();
    // Range like "Z2–Z3" or "Z2-Z3"
    const rangeMatch = txt.match(/Z(\d+)\s*[–-]\s*Z(\d+)/);
    if (rangeMatch) {
      const lo = resolveZone(allZones, sport, "Z" + rangeMatch[1]);
      const hi = resolveZone(allZones, sport, "Z" + rangeMatch[2]);
      if (lo && hi) return `${lo} to ${hi}`;
    }
    const singleMatch = txt.match(/Z(\d+)/);
    if (!singleMatch) return zoneRef;
    const key = "z" + singleMatch[1];
    const sportZones = allZones && allZones[sport];
    if (sportZones && sportZones[key] && sportZones[key].label) {
      return sportZones[key].label;
    }
    // RPE fallback
    return (allZones && allZones.rpe && allZones.rpe[key]) || zoneRef;
  }

  // Classify athlete level from a threshold per §2a/§2b/§2c.
  function classifyRunning(thresholds) {
    const t = thresholds && thresholds.running_5k;
    if (!t) return null;
    const sec = _parseTime(t);
    if (!sec) return null;
    if (sec > 31 * 60) return "beginner";          // >31:00
    if (sec >= 23 * 60 + 20) return "intermediate"; // 23:20–31:00
    return "advanced";                              // <23:20
  }

  function classifyCycling(thresholds, weightKg) {
    const ftp = thresholds && (thresholds.cycling_ftp || thresholds.ftp);
    if (!ftp || !weightKg) return null;
    const wkg = Number(ftp) / Number(weightKg);
    if (wkg < 2.0) return "beginner";
    if (wkg <= 3.5) return "intermediate";
    return "advanced";
  }

  function classifySwim(thresholds) {
    const t = thresholds && (thresholds.swim_css || thresholds.css);
    if (!t) return null;
    const sec = _parseTime(t);
    if (!sec) return null;
    if (sec > 2 * 60 + 30) return "novice";
    if (sec >= 1 * 60 + 45) return "intermediate";
    return "competitive";
  }

  // Overall level = highest of per-sport levels. "competitive" counts as
  // advanced; "novice" counts as beginner for the downstream constraint
  // rules which only understand beginner/intermediate/advanced.
  function overallLevel(perSport) {
    const order = { beginner: 0, novice: 0, intermediate: 1, advanced: 2, competitive: 2 };
    let max = -1;
    let best = "intermediate"; // default
    Object.values(perSport || {}).forEach(lvl => {
      if (lvl && typeof order[lvl] === "number" && order[lvl] > max) {
        max = order[lvl];
        best = lvl;
      }
    });
    if (best === "novice") return "beginner";
    if (best === "competitive") return "advanced";
    return best;
  }

  const TrainingZones = {
    computeRunningZones,
    computeCyclingZones,
    computeSwimZones,
    computeAllZones,
    resolveZone,
    classifyRunning,
    classifyCycling,
    classifySwim,
    overallLevel,
    _parseTime,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = TrainingZones;
  }
  global.TrainingZones = TrainingZones;
})(typeof window !== "undefined" ? window : globalThis);
