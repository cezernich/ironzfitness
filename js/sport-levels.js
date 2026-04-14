// js/sport-levels.js
//
// Per-sport experience level derivation from threshold data.
// Spec: SPEC_cardio_add_session_v1.md §3.1-3.3.
//
// Replaces the single self-reported `profile.fitnessLevel` field with
// per-sport levels derived from the user's thresholds:
//   - Swimming: from CSS pace (seconds per 100m)
//   - Cycling:  from FTP (watts) + body weight (w/kg)
//   - Running:  from threshold pace (min/mile)
//
// When no threshold data exists for a sport, the derive function returns
// "intermediate" so workout generation never blocks. The existing "log a
// test result" nudge UI continues to prompt users who haven't set thresholds.
//
// Public API (window.SportLevels):
//   deriveSwimLevel(cssSecPer100m)       → "novice"|"intermediate"|"competitive"
//   deriveCyclingLevel(ftpWatts, weight) → "beginner"|"intermediate"|"advanced"
//   deriveRunLevel(thresholdMinPerMile)  → "beginner"|"intermediate"|"advanced"
//   getSportLevel(sport)                 → reads profile + returns derived level
//   getLevelsForUser()                   → { swim, cycling, running } all at once

(function () {
  "use strict";

  // ── Individual derivers ─────────────────────────────────────────────────

  function deriveSwimLevel(cssSecPer100m) {
    if (cssSecPer100m == null || isNaN(cssSecPer100m) || cssSecPer100m <= 0) {
      return "intermediate";
    }
    // > 2:30/100m (150s) → novice
    // 1:45-2:30 (105-150s) → intermediate
    // < 1:45 (105s) → competitive
    if (cssSecPer100m > 150) return "novice";
    if (cssSecPer100m > 105) return "intermediate";
    return "competitive";
  }

  function deriveCyclingLevel(ftpWatts, weightLbs) {
    if (!ftpWatts || isNaN(ftpWatts) || ftpWatts <= 0) return "intermediate";
    const weight = parseFloat(weightLbs);
    if (!weight || weight <= 0) return "intermediate";
    const wPerKg = ftpWatts / (weight * 0.4536);
    if (wPerKg < 2.0) return "beginner";
    if (wPerKg <= 3.5) return "intermediate";
    return "advanced";
  }

  function deriveRunLevel(thresholdMinPerMile) {
    if (thresholdMinPerMile == null || isNaN(thresholdMinPerMile) || thresholdMinPerMile <= 0) {
      return "intermediate";
    }
    if (thresholdMinPerMile > 10) return "beginner";
    if (thresholdMinPerMile >= 7.5) return "intermediate";
    return "advanced";
  }

  // ── Profile readers ─────────────────────────────────────────────────────

  function _loadProfile() {
    try { return JSON.parse(localStorage.getItem("profile") || "{}") || {}; }
    catch { return {}; }
  }

  function _loadTrainingZones() {
    try { return JSON.parse(localStorage.getItem("trainingZones") || "{}") || {}; }
    catch { return {}; }
  }

  // Read the user's CSS pace (sec/100m) from any of the stored locations.
  function _readSwimCSS(profile, zones) {
    if (profile) {
      if (profile.css_sec_per_100m != null) return Number(profile.css_sec_per_100m) || null;
      if (profile.css != null) {
        const n = Number(profile.css);
        if (!isNaN(n) && n > 0) return n;
      }
    }
    if (zones && zones.swimming && zones.swimming.css) {
      return Number(zones.swimming.css) || null;
    }
    return null;
  }

  function _readCyclingFTP(profile, zones) {
    if (profile) {
      if (profile.ftp_watts != null) return Number(profile.ftp_watts) || null;
      if (profile.ftp != null) return Number(profile.ftp) || null;
    }
    if (zones && zones.biking && zones.biking.ftp) return Number(zones.biking.ftp) || null;
    return null;
  }

  // Running threshold pace in min/mile. Prefer an explicit threshold pace,
  // otherwise compute from VDOT using Daniels' tables (simplified).
  function _readRunThresholdMinPerMile(profile, zones) {
    // trainingZones.running.thresholdPaceMin + thresholdPaceSec
    if (zones && zones.running) {
      const r = zones.running;
      if (r.thresholdPaceMin != null) {
        const m = parseFloat(r.thresholdPaceMin) || 0;
        const s = parseFloat(r.thresholdPaceSec || 0) || 0;
        if (m > 0) return m + (s / 60);
      }
      // VDOT → rough threshold pace
      if (r.vdot != null) {
        const v = parseFloat(r.vdot);
        if (v > 0) return _vdotToThresholdPaceMinPerMile(v);
      }
    }
    if (profile) {
      if (profile.vdot != null || profile.run_vdot != null) {
        const v = parseFloat(profile.vdot || profile.run_vdot);
        if (v > 0) return _vdotToThresholdPaceMinPerMile(v);
      }
    }
    return null;
  }

  // Simplified VDOT → threshold pace (min/mile) using a best-fit curve over
  // Daniels' tables for VDOT 30–70. Accurate enough for experience-level
  // classification — we only care which tier (<7:30, 7:30-10, >10) the
  // runner falls into.
  function _vdotToThresholdPaceMinPerMile(vdot) {
    if (vdot <= 0) return null;
    // Threshold pace min/mile ≈ 12.5 - 0.12 * VDOT (clamped)
    const p = 12.5 - 0.12 * vdot;
    return Math.max(4.5, Math.min(15, p));
  }

  // ── High-level API ──────────────────────────────────────────────────────

  // Get the derived level for one sport. Reads profile + trainingZones
  // fresh each call so settings updates are picked up immediately.
  function getSportLevel(sport) {
    const profile = _loadProfile();
    const zones = _loadTrainingZones();
    switch (String(sport || "").toLowerCase()) {
      case "swim":
      case "swimming":
        return deriveSwimLevel(_readSwimCSS(profile, zones));
      case "bike":
      case "cycling":
        return deriveCyclingLevel(_readCyclingFTP(profile, zones), profile.weight);
      case "run":
      case "running":
        return deriveRunLevel(_readRunThresholdMinPerMile(profile, zones));
      default:
        return "intermediate";
    }
  }

  // Return all three sport levels at once. Handy for screens that need to
  // adapt multiple sports in one render.
  function getLevelsForUser() {
    const profile = _loadProfile();
    const zones = _loadTrainingZones();
    return {
      swim:    deriveSwimLevel(_readSwimCSS(profile, zones)),
      cycling: deriveCyclingLevel(_readCyclingFTP(profile, zones), profile.weight),
      running: deriveRunLevel(_readRunThresholdMinPerMile(profile, zones)),
    };
  }

  // Derive age from profile.birthday or profile.age. Used by the generator
  // age-modifier logic (rest +%, Z5 caps, etc.).
  function getAge() {
    const profile = _loadProfile();
    if (profile.birthday) {
      try {
        const b = new Date(profile.birthday);
        const now = new Date();
        let age = now.getFullYear() - b.getFullYear();
        const mDiff = now.getMonth() - b.getMonth();
        if (mDiff < 0 || (mDiff === 0 && now.getDate() < b.getDate())) age--;
        if (age > 0 && age < 120) return age;
      } catch {}
    }
    const n = parseInt(profile.age, 10);
    return (n > 0 && n < 120) ? n : 30;
  }

  // Age → modifier bundle (rest_multiplier, z5_multiplier, warmup_extra_min).
  // Baseline (<30): all multipliers = 1, no extra warmup.
  function getAgeModifiers(age) {
    if (age == null) age = getAge();
    if (age < 30)  return { rest_mult: 1.00, z5_mult: 1.00, warmup_extra_min: 0, volume_mult: 1.00 };
    if (age < 40)  return { rest_mult: 1.10, z5_mult: 1.00, warmup_extra_min: 0, volume_mult: 1.00 };
    if (age < 50)  return { rest_mult: 1.15, z5_mult: 0.80, warmup_extra_min: 5, volume_mult: 1.00 };
    if (age < 60)  return { rest_mult: 1.25, z5_mult: 0.60, warmup_extra_min: 5, volume_mult: 0.85 };
    return            { rest_mult: 1.40, z5_mult: 0.00, warmup_extra_min: 8, volume_mult: 0.80 };
  }

  // Experience level → modifier bundle. Used by generators to scale
  // distance / set count / rest / complexity. Maps novice=beginner,
  // competitive=advanced for swim, else 1:1.
  function getLevelModifiers(level) {
    const L = String(level || "intermediate").toLowerCase();
    if (L === "beginner" || L === "novice") {
      return { volume_mult: 0.75, sets_mult: 0.70, rest_mult: 1.30, max_zone: 3 };
    }
    if (L === "advanced" || L === "competitive") {
      return { volume_mult: 1.20, sets_mult: 1.20, rest_mult: 0.80, max_zone: 5 };
    }
    return   { volume_mult: 1.00, sets_mult: 1.00, rest_mult: 1.00, max_zone: 4 };
  }

  const api = {
    deriveSwimLevel, deriveCyclingLevel, deriveRunLevel,
    getSportLevel, getLevelsForUser,
    getAge, getAgeModifiers, getLevelModifiers,
  };
  if (typeof window !== "undefined") window.SportLevels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
