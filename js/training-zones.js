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

  // ── Age-graded normalization (Section 2a-0) ────────────────────────────
  //
  // Raw VDOT / w-per-kg / CSS pace is misleading across age × sex. A 9:00
  // mile is beginner for a 25M but intermediate-to-advanced for a 65F.
  // Before classifying, normalize:
  //   adjustedMetric = rawMetric / ageFactor(age) / sexFactor(sex)
  // and compare against the fixed cuts (baseline 25M).
  //
  // ageFactor: 1.0 at ≤30. Drops 0.008/yr after 30. Floor 0.55 (~age 86).
  // sexFactor: Male 1.00, Female 0.90. "unknown" or missing → 0.95.
  function _ageFactor(age) {
    const a = Number(age) || 0;
    if (a <= 0) return 1.0;          // unknown age — no adjustment
    if (a <= 30) return 1.0;
    return Math.max(0.55, 1.0 - (a - 30) * 0.008);
  }
  function _sexFactor(sex) {
    const s = String(sex || "").toLowerCase();
    if (s === "male" || s === "m") return 1.0;
    if (s === "female" || s === "f") return 0.90;
    // "unknown", "prefer_not_to_say", or missing — use the midpoint so
    // classification doesn't over-penalize or over-credit.
    return 0.95;
  }

  // ── Lookup tables (Sections 2a / 2b / 2c) ──────────────────────────────
  //
  // These are the validated output of the 2a-0 normalization formula. When
  // age + sex are known, we prefer the table lookup (closed-form, exact).
  // When age or sex is missing, we fall back to the formula with defaults.
  //
  // RUNNING: raw 5K-time cut-offs per age × gender.
  const _RUN_5K_TABLE = [
    { minAge: 16, maxAge: 17, male:   { beg: 28*60, adv: 21*60 }, female: { beg: 33*60, adv: 25*60 } },
    { minAge: 18, maxAge: 20, male:   { beg: 30*60, adv: 22*60 }, female: { beg: 35*60, adv: 26*60 } },
    { minAge: 21, maxAge: 29, male:   { beg: 31*60, adv: 23*60 }, female: { beg: 36*60, adv: 27*60 } },
    { minAge: 30, maxAge: 39, male:   { beg: 32*60, adv: 24*60 }, female: { beg: 37*60, adv: 28*60 } },
    { minAge: 40, maxAge: 49, male:   { beg: 34*60, adv: 26*60 }, female: { beg: 39*60, adv: 30*60 } },
    { minAge: 50, maxAge: 59, male:   { beg: 37*60, adv: 29*60 }, female: { beg: 43*60, adv: 33*60 } },
    { minAge: 60, maxAge: 999, male:  { beg: 41*60, adv: 32*60 }, female: { beg: 48*60, adv: 37*60 } },
  ];
  // CYCLING: FTP w/kg cut-offs per age × gender.
  const _BIKE_WKG_TABLE = [
    { minAge: 16, maxAge: 20, male: { beg: 1.8, adv: 3.2 }, female: { beg: 1.5, adv: 2.7 } },
    { minAge: 21, maxAge: 34, male: { beg: 2.0, adv: 3.5 }, female: { beg: 1.7, adv: 3.0 } },
    { minAge: 35, maxAge: 49, male: { beg: 1.8, adv: 3.2 }, female: { beg: 1.5, adv: 2.7 } },
    { minAge: 50, maxAge: 64, male: { beg: 1.5, adv: 2.8 }, female: { beg: 1.3, adv: 2.4 } },
    { minAge: 65, maxAge: 999, male: { beg: 1.3, adv: 2.4 }, female: { beg: 1.1, adv: 2.0 } },
  ];
  // SWIM: CSS pace (seconds per 100m) cut-offs per age × gender.
  // Swim uses "novice" / "intermediate" / "competitive" labels.
  const _SWIM_CSS_TABLE = [
    { minAge: 16, maxAge: 20, male:   { nov: 2*60+25, comp: 1*60+40 }, female: { nov: 2*60+40, comp: 1*60+55 } },
    { minAge: 21, maxAge: 34, male:   { nov: 2*60+30, comp: 1*60+45 }, female: { nov: 2*60+45, comp: 2*60+0  } },
    { minAge: 35, maxAge: 49, male:   { nov: 2*60+40, comp: 1*60+55 }, female: { nov: 2*60+55, comp: 2*60+10 } },
    { minAge: 50, maxAge: 64, male:   { nov: 2*60+55, comp: 2*60+10 }, female: { nov: 3*60+10, comp: 2*60+25 } },
    { minAge: 65, maxAge: 999, male:  { nov: 3*60+10, comp: 2*60+25 }, female: { nov: 3*60+30, comp: 2*60+45 } },
  ];

  function _pickBracket(table, age) {
    const a = Number(age) || 0;
    if (a <= 0) return null;           // no age — skip the table path
    return table.find(r => a >= r.minAge && a <= r.maxAge) || null;
  }
  function _rowForSex(bracket, sex) {
    if (!bracket) return null;
    const s = String(sex || "").toLowerCase();
    if (s === "female" || s === "f") return bracket.female;
    if (s === "male" || s === "m")   return bracket.male;
    return null;                        // unknown sex — fall back to formula
  }

  // Read age + gender from the user profile. Falls back to 0/"" when
  // missing so the formula path still runs with the unknown defaults.
  function _readProfileDemographics() {
    try {
      const p = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem("profile")) || "{}");
      let age = Number(p.age) || 0;
      if (!age && p.birthday && typeof _calcAgeFromBirthday === "function") {
        try { age = _calcAgeFromBirthday(p.birthday) || 0; } catch {}
      }
      return { age, sex: String(p.gender || p.sex || "").toLowerCase() };
    } catch { return { age: 0, sex: "" }; }
  }

  // Classify athlete level from a threshold per §2a/§2b/§2c.
  //
  // Reads from multiple shapes so pre-existing users are classified
  // correctly regardless of where their data lives:
  //   - thresholds.running_5k                 (legacy/explicit shape)
  //   - thresholds.vdot                        (Daniels VDOT — preferred)
  //   - thresholds.referenceDist/referenceTime (the app's saved shape
  //     under trainingZones.running — if referenceDist indicates 5K)
  //
  // Level is age × sex adjusted per Section 2a. Priority:
  //   1. If age + sex present, look up the 2a table directly for 5K-time
  //      classification when we have a 5K-equivalent time.
  //   2. Otherwise use VDOT normalized by (ageFactor × sexFactor) and the
  //      fixed Daniels cuts (≥48 advanced, ≥37 intermediate, <37 beginner).
  //   3. If both are missing, return null.
  function classifyRunning(thresholds, opts) {
    if (!thresholds) return null;
    const demo = (opts && (opts.age || opts.sex)) ? { age: opts.age, sex: opts.sex } : _readProfileDemographics();

    // Resolve a 5K-equivalent time if we have direct 5K data.
    let sec5k = _parseTime(thresholds.running_5k || thresholds["5k"] || thresholds.fiveK);
    if (!sec5k && thresholds.referenceDist && thresholds.referenceTime) {
      const d = String(thresholds.referenceDist).toLowerCase().replace(/\s+/g, "");
      if (d === "5k" || d === "5km") sec5k = _parseTime(thresholds.referenceTime);
    }

    // Table-lookup path: if we have age + sex + a 5K time, that's the
    // most accurate classification (closed-form, matches the spec table).
    const bracket = _pickBracket(_RUN_5K_TABLE, demo.age);
    const row = _rowForSex(bracket, demo.sex);
    if (row && sec5k) {
      if (sec5k > row.beg) return "beginner";
      if (sec5k < row.adv) return "advanced";
      return "intermediate";
    }

    // Formula path: fall back to normalized VDOT when the table lookup
    // isn't possible (no age, no sex, or no 5K time).
    const vdot = Number(thresholds.vdot || thresholds.running_vdot || 0);
    if (vdot > 0) {
      const adjusted = vdot / (_ageFactor(demo.age) * _sexFactor(demo.sex));
      if (adjusted >= 48) return "advanced";
      if (adjusted >= 37) return "intermediate";
      return "beginner";
    }

    // Last resort — raw 5K time against the 21–29M baseline (31:00 / 23:00).
    if (sec5k) {
      if (sec5k > 31 * 60) return "beginner";
      if (sec5k < 23 * 60) return "advanced";
      return "intermediate";
    }
    return null;
  }

  function classifyCycling(thresholds, weightKg, opts) {
    if (!thresholds) return null;
    const ftp = thresholds.cycling_ftp || thresholds.ftp;
    if (!ftp || !weightKg) return null;
    const wkg = Number(ftp) / Number(weightKg);
    const demo = (opts && (opts.age || opts.sex)) ? { age: opts.age, sex: opts.sex } : _readProfileDemographics();

    // Table lookup for known age + sex.
    const bracket = _pickBracket(_BIKE_WKG_TABLE, demo.age);
    const row = _rowForSex(bracket, demo.sex);
    if (row) {
      if (wkg < row.beg) return "beginner";
      if (wkg > row.adv) return "advanced";
      return "intermediate";
    }

    // Formula fallback — normalize w/kg by age × sex against the 21–34M baseline.
    const adjusted = wkg / (_ageFactor(demo.age) * _sexFactor(demo.sex));
    if (adjusted < 2.0) return "beginner";
    if (adjusted > 3.5) return "advanced";
    return "intermediate";
  }

  function classifySwim(thresholds, opts) {
    if (!thresholds) return null;
    const t = thresholds.swim_css || thresholds.css;
    if (!t) return null;
    const sec = _parseTime(t);
    if (!sec) return null;
    const demo = (opts && (opts.age || opts.sex)) ? { age: opts.age, sex: opts.sex } : _readProfileDemographics();

    // Table lookup for known age + sex.
    const bracket = _pickBracket(_SWIM_CSS_TABLE, demo.age);
    const row = _rowForSex(bracket, demo.sex);
    if (row) {
      if (sec > row.nov) return "novice";
      if (sec < row.comp) return "competitive";
      return "intermediate";
    }

    // Formula fallback — swim pace inverts (slower = lower fitness). We
    // normalize by dividing seconds by the same factor (slower athletes
    // get a boost for age/sex to match table behavior).
    const adjusted = sec * (_ageFactor(demo.age) * _sexFactor(demo.sex));
    if (adjusted > 2 * 60 + 30) return "novice";
    if (adjusted < 1 * 60 + 45) return "competitive";
    return "intermediate";
  }

  // Normalize the various storage shapes into a single thresholds-like
  // object. Pulls from BOTH localStorage.thresholds (legacy/explicit shape)
  // AND localStorage.trainingZones (the actual app data). Either or both
  // may be populated; this merges them with trainingZones winning when
  // both exist (it's what the Training Zones UI writes on save).
  function loadFromStorage() {
    const out = {};
    try {
      const direct = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem("thresholds")) || "{}") || {};
      if (direct.running_5k)  out.running_5k  = direct.running_5k;
      if (direct.cycling_ftp) out.cycling_ftp = direct.cycling_ftp;
      if (direct.swim_css)    out.swim_css    = direct.swim_css;
      if (direct.vdot)        out.vdot        = direct.vdot;
    } catch {}
    try {
      const tz = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem("trainingZones")) || "{}") || {};
      // Running: prefer VDOT, fall back to referenceDist/referenceTime pair.
      if (tz.running) {
        if (tz.running.vdot) out.vdot = tz.running.vdot;
        if (tz.running.referenceDist) out.referenceDist = tz.running.referenceDist;
        if (tz.running.referenceTime) out.referenceTime = tz.running.referenceTime;
      }
      // Biking FTP
      if (tz.biking && tz.biking.ftp) out.cycling_ftp = tz.biking.ftp;
      // Swim CSS — app stores tPaceSec or tPaceStr under trainingZones.swimming.
      if (tz.swimming) {
        if (tz.swimming.tPaceStr) out.swim_css = tz.swimming.tPaceStr;
        else if (tz.swimming.tPaceSec) {
          const s = Math.floor(tz.swimming.tPaceSec);
          out.swim_css = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
        }
      }
    } catch {}
    return out;
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
    loadFromStorage,
    _parseTime,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = TrainingZones;
  }
  global.TrainingZones = TrainingZones;
})(typeof window !== "undefined" ? window : globalThis);
