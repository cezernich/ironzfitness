// running-workout-generator.js
// Pure-function workout generator. NO API calls. NO randomness.
// Implements PHILOSOPHY_UPDATE_2026-04-09_run_session_types.md.
//
// Public surface: window.RunningWorkoutGenerator.generateRunWorkout(opts)

(function () {
  "use strict";

  function _fmtMmSs(totalSec) {
    const t = Math.round(totalSec);
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function _resolveRepCount(repCountSpec, experience) {
    if (typeof repCountSpec === "number") return repCountSpec;
    if (repCountSpec && typeof repCountSpec === "object") {
      return repCountSpec[experience] || repCountSpec.intermediate || repCountSpec.beginner;
    }
    return null;
  }

  // Strip trailing "/mi" from min_per_mi labels — the templates re-append the unit.
  function _stripUnit(s) { return String(s).replace(/\/(mi|km)$/, ""); }

  // Format a pace range as a single string for display in phase text.
  // Returns just the numeric range ("6:36–6:51"); the caller appends "/mi".
  function _ePaceLabel(zones) {
    if (!zones || !zones.e_pace) return "easy effort";
    const [lo, hi] = zones.e_pace.min_per_mi;
    return `${_stripUnit(lo)}–${_stripUnit(hi)}`;
  }
  function _mPaceLabel(zones) {
    if (!zones || !zones.m_pace) return "marathon effort";
    const [lo, hi] = zones.m_pace.min_per_mi;
    return `${_stripUnit(lo)}–${_stripUnit(hi)}`;
  }
  function _tPaceLabel(zones) {
    if (!zones || !zones.t_pace) return "comfortably hard";
    const [lo, hi] = zones.t_pace.min_per_mi;
    return `${_stripUnit(lo)}–${_stripUnit(hi)}`;
  }

  // Interval pace label, parameterized by rep distance (m).
  function _iPaceLabelForDistance(zones, distM) {
    if (!zones || !zones.i_pace) return "I-pace effort";
    const key = `sec_per_${distM}m`;
    if (zones.i_pace[key]) {
      const [lo, hi] = zones.i_pace[key];
      return `${_fmtMmSs(lo)}–${_fmtMmSs(hi)}`;
    }
    // Fallback: derive from sec_per_mi
    const [loMi, hiMi] = zones.i_pace.sec_per_mi;
    return `${_fmtMmSs(loMi * distM / 1609.344)}–${_fmtMmSs(hiMi * distM / 1609.344)}`;
  }

  function _rPaceLabelForDistance(zones, distM) {
    if (!zones || !zones.r_pace) return "near-sprint";
    const key = `sec_per_${distM}m`;
    if (zones.r_pace[key]) {
      const [lo, hi] = zones.r_pace[key];
      return `${lo}–${hi}s`;
    }
    const [loMi, hiMi] = zones.r_pace.sec_per_mi;
    return `${Math.round(loMi * distM / 1609.344)}–${Math.round(hiMi * distM / 1609.344)}s`;
  }

  // ─── Per-type generators ─────────────────────────────────────────────────────

  function _generateSimpleSinglePhase(template, experience, durationOverrideMin, zones, warnings) {
    const range = template.experience_scaling[experience] || template.default_duration_min;
    const defaultMin = (range[0] + range[1]) / 2;
    const duration = _clampDurationOverride(defaultMin, durationOverrideMin, range, warnings);
    const paceLabel = zones ? _ePaceLabel(zones) : "conversational, by feel";
    const phases = [
      {
        phase: "main",
        intensity: "z1",
        duration_min: duration,
        target: zones ? `${paceLabel}/mi` : "Z1 (conversational)",
        instruction: `${duration} min @ ${paceLabel}${zones ? "/mi" : ""}. Conversational. Skip if you don't feel recovered.`
      }
    ];
    return { duration, phases };
  }

  function _generateEndurance(template, experience, durationOverrideMin, zones, warnings) {
    const range = template.experience_scaling[experience] || template.default_duration_min;
    const defaultMin = (range[0] + range[1]) / 2;
    const duration = _clampDurationOverride(defaultMin, durationOverrideMin, range, warnings);
    const allowsFinish = experience === "intermediate" || experience === "advanced";
    const eMin = Math.round(duration * 0.85);
    const mMin = Math.round(duration * 0.15);
    const phases = [
      {
        phase: "main",
        intensity: "z1",
        duration_min: eMin,
        target: zones ? `${_ePaceLabel(zones)}/mi` : "Z1",
        instruction: `${eMin} min steady @ ${zones ? _ePaceLabel(zones) + "/mi (Z1 high)" : "Z1 (conversational)"}.`
      }
    ];
    if (allowsFinish && mMin >= 5) {
      phases.push({
        phase: "optional_finish",
        intensity: "z2",
        duration_min: mMin,
        target: zones ? `${_mPaceLabel(zones)}/mi` : "Z2 marathon",
        instruction: `Optional last ${mMin} min @ ${zones ? _mPaceLabel(zones) + "/mi (Z2 marathon)" : "Z2 marathon"}.`
      });
    }
    return { duration, phases };
  }

  function _generateLongRun(template, experience, durationOverrideMin, zones, warnings) {
    const range = template.experience_scaling[experience] || template.default_duration_min;
    const defaultMin = (range[0] + range[1]) / 2;
    const duration = _clampDurationOverride(defaultMin, durationOverrideMin, range, warnings);
    const allowsFinish = experience === "intermediate" || experience === "advanced";
    const eMin = Math.round(duration * 0.80);
    const mMin = Math.round(duration * 0.20);
    const phases = [
      {
        phase: "main",
        intensity: "z1",
        duration_min: eMin,
        target: zones ? `${_ePaceLabel(zones)}/mi` : "Z1",
        instruction: `${eMin} min @ ${zones ? _ePaceLabel(zones) + "/mi (Z1)" : "Z1 (conversational)"}.`
      }
    ];
    if (allowsFinish && mMin >= 10) {
      phases.push({
        phase: "optional_mp_finish",
        intensity: "z2",
        duration_min: mMin,
        target: zones ? `${_mPaceLabel(zones)}/mi` : "Z2 marathon",
        instruction: `Last ${mMin} min @ ${zones ? _mPaceLabel(zones) + "/mi (Z2 marathon finish)" : "Z2 marathon finish"}.`
      });
    }
    if (duration >= (template.fueling_reminder_threshold_min || 75)) {
      warnings.push("Carry fuel: 30-60g carbs/hr after the first 60 minutes.");
    }
    return { duration, phases };
  }

  function _generateTempo(template, experience, durationOverrideMin, zones, warnings) {
    const scaling = template.experience_scaling[experience] || template.experience_scaling.intermediate;
    const reps = scaling.reps;
    const repMin = scaling.rep_duration_min;
    const restSec = scaling.rest_sec;
    const wuMin = 15;
    const cdMin = 10;
    const restMin = ((reps - 1) * restSec) / 60;
    const totalDuration = wuMin + reps * repMin + restMin + cdMin;
    if (durationOverrideMin && Math.abs(durationOverrideMin - totalDuration) > totalDuration * 0.5) {
      warnings.push(`Duration override ignored — outside ±50% of ${Math.round(totalDuration)} min.`);
    }
    const tLabel = zones ? _tPaceLabel(zones) : "comfortably hard";
    const eLabel = zones ? _ePaceLabel(zones) : "Z1";
    const phases = [
      {
        phase: "warmup",
        intensity: "z1",
        duration_min: wuMin,
        target: zones ? `${eLabel}/mi` : "Z1",
        instruction: `WU ${wuMin} min easy @ ${eLabel}${zones ? "/mi" : ""}.`
      },
      {
        phase: "main_cruise_intervals",
        intensity: "z3",
        duration_min: Math.round(reps * repMin + restMin),
        target: zones ? `${tLabel}/mi` : "T effort",
        reps,
        rep_duration_min: repMin,
        rest_sec: restSec,
        instruction: `${reps}×${repMin} min @ ${tLabel}${zones ? "/mi" : ""} w/ ${restSec}s jog rest.`
      },
      {
        phase: "cooldown",
        intensity: "z1",
        duration_min: cdMin,
        target: zones ? `${eLabel}/mi` : "Z1",
        instruction: `CD ${cdMin} min easy @ ${eLabel}${zones ? "/mi" : ""}.`
      }
    ];
    return { duration: Math.round(totalDuration), phases };
  }

  function _generateTrack(template, experience, durationOverrideMin, zones, warnings, weeksSincePlanStart) {
    const rotationIndex = ((weeksSincePlanStart || 0) % 4 + 4) % 4;
    const tmpl = template.rotation_templates.find(t => t.rotation_index === rotationIndex)
      || template.rotation_templates[0];
    const wuMin = 15;
    const cdMin = 10;
    let mainSetText = "";
    let mainSetMinutes = 0;
    let repCount = null;
    let repDistance = null;

    if (tmpl.main_set.ladder_distances_m) {
      // Ladder
      const distances = tmpl.main_set.ladder_distances_m;
      const labels = distances.map(d => `${d}m`).join(" / ");
      const paceLabels = distances.map(d => `${_iPaceLabelForDistance(zones, d)}`);
      mainSetText = `Ladder ${labels} @ I-pace${zones ? "" : " effort"} w/ equal-time jog rest.`;
      // Time estimate: assume mid-I-pace
      const midI = zones && zones.i_pace ? (zones.i_pace.sec_per_mi[0] + zones.i_pace.sec_per_mi[1]) / 2 : 360;
      mainSetMinutes = distances.reduce((acc, d) => acc + (midI * d / 1609.344), 0) * 2 / 60; // double for jog rest
      repCount = distances.length;
      repDistance = "ladder";
    } else if (tmpl.main_set.rep_distance_m && tmpl.main_set.rep_count) {
      const count = _resolveRepCount(tmpl.main_set.rep_count, experience);
      const dist = tmpl.main_set.rep_distance_m;
      const paceLabel = _iPaceLabelForDistance(zones, dist);
      let restLabel;
      if (tmpl.main_set.rest_distance_m) {
        restLabel = `${tmpl.main_set.rest_distance_m}m jog`;
      } else if (tmpl.main_set.rest_duration_sec) {
        const r = tmpl.main_set.rest_duration_sec;
        restLabel = r >= 60 ? `${Math.round(r / 60)} min jog` : `${r}s jog`;
      } else {
        restLabel = "jog rest";
      }
      mainSetText = `${count}×${dist}m @ ${paceLabel}${zones ? "" : " effort"} w/ ${restLabel}.`;
      const midI = zones && zones.i_pace ? (zones.i_pace.sec_per_mi[0] + zones.i_pace.sec_per_mi[1]) / 2 : 360;
      const repTime = midI * dist / 1609.344;
      const restTime = tmpl.main_set.rest_distance_m
        ? midI * tmpl.main_set.rest_distance_m / 1609.344 * 1.4 // jog ~40% slower
        : (tmpl.main_set.rest_duration_sec || 90);
      mainSetMinutes = (count * repTime + (count - 1) * restTime) / 60;
      repCount = count;
      repDistance = `${dist}m`;
    }

    const totalDuration = wuMin + Math.round(mainSetMinutes) + cdMin;
    const eLabel = zones ? _ePaceLabel(zones) : "Z1";
    const phases = [
      {
        phase: "warmup",
        intensity: "z1",
        duration_min: wuMin,
        target: zones ? `${eLabel}/mi + 4×20s strides` : "Z1 + 4×20s strides",
        instruction: `WU ${wuMin} min easy @ ${eLabel}${zones ? "/mi" : ""} + 4×20s strides.`
      },
      {
        phase: "main_set",
        intensity: "z4",
        duration_min: Math.round(mainSetMinutes),
        target: zones ? `I-pace (${_iPaceLabelForDistance(zones, 800)}/800m)` : "I-pace effort",
        rotation_index: rotationIndex,
        rotation_name: tmpl.name,
        rep_count: repCount,
        rep_distance: repDistance,
        instruction: mainSetText
      },
      {
        phase: "cooldown",
        intensity: "z1",
        duration_min: cdMin,
        target: zones ? `${eLabel}/mi` : "Z1",
        instruction: `CD ${cdMin} min easy @ ${eLabel}${zones ? "/mi" : ""}.`
      }
    ];

    return { duration: totalDuration, phases, rotationIndex, rotationName: tmpl.name };
  }

  function _generateSpeedWork(template, experience, durationOverrideMin, zones, warnings) {
    // Pick sub-template
    const subTpl = template.sub_templates.find(s => (s.default_for || []).includes(experience))
      || template.sub_templates[0];
    const wuMin = 15;
    const cdMin = subTpl.id === "strides_only" ? 5 : 10;
    let mainSetText = "";
    let mainSetMinutes = 0;
    let repCount = null;

    if (subTpl.id === "r_pace_repeats") {
      const count = _resolveRepCount(subTpl.main_set.rep_count, experience);
      const dist = subTpl.main_set.rep_distance_m;
      const paceLabel = _rPaceLabelForDistance(zones, dist);
      mainSetText = `${count}×${dist}m @ ${paceLabel}${zones ? "" : " effort"} w/ ${subTpl.main_set.rest_distance_m}m walk recovery.`;
      const midR = zones && zones.r_pace ? (zones.r_pace.sec_per_mi[0] + zones.r_pace.sec_per_mi[1]) / 2 : 305;
      const repTime = midR * dist / 1609.344;
      const restTime = 60; // 200m walk ≈ 60 sec
      mainSetMinutes = (count * repTime + (count - 1) * restTime) / 60;
      repCount = count;
    } else if (subTpl.id === "strides_only") {
      const count = subTpl.main_set.rep_count;
      mainSetText = `${count}×${subTpl.main_set.rep_distance_m}m strides at near-sprint w/ full recovery.`;
      mainSetMinutes = 6; // ~6 min for 8 strides w/ rest
      repCount = count;
    }

    const totalDuration = wuMin + Math.round(mainSetMinutes) + cdMin;
    const eLabel = zones ? _ePaceLabel(zones) : "Z1";
    const phases = [
      {
        phase: "warmup",
        intensity: "z1",
        duration_min: wuMin,
        target: zones ? `${eLabel}/mi` : "Z1",
        instruction: `WU ${wuMin} min easy @ ${eLabel}${zones ? "/mi" : ""}.`
      },
      {
        phase: "main_set",
        intensity: "z5",
        duration_min: Math.round(mainSetMinutes),
        target: subTpl.id === "r_pace_repeats" ? "R-pace" : "near-sprint",
        sub_template: subTpl.id,
        rep_count: repCount,
        instruction: mainSetText
      },
      {
        phase: "cooldown",
        intensity: "z1",
        duration_min: cdMin,
        target: zones ? `${eLabel}/mi` : "Z1",
        instruction: `CD ${cdMin} min easy @ ${eLabel}${zones ? "/mi" : ""}.`
      }
    ];
    return { duration: totalDuration, phases, subTemplate: subTpl.id };
  }

  function _generateHills(template, experience, durationOverrideMin, zones, warnings) {
    const repCount = _resolveRepCount(template.main_set.rep_count, experience);
    const repDurRange = template.main_set.rep_duration_sec;
    const repSecLabel = `${repDurRange[0]}–${repDurRange[1]}s`;
    const wuMin = 15;
    const cdMin = 10;
    const repMin = repCount * (repDurRange[1] / 60) * 2; // up + down
    const totalDuration = Math.round(wuMin + repMin + cdMin);
    const eLabel = zones ? _ePaceLabel(zones) : "Z1";
    const phases = [
      {
        phase: "warmup",
        intensity: "z1",
        duration_min: wuMin,
        target: zones ? `${eLabel}/mi` : "Z1",
        instruction: `WU ${wuMin} min easy @ ${eLabel}${zones ? "/mi" : ""} to a hill (4–8% grade ideal).`
      },
      {
        phase: "main_set",
        intensity: "z4_effort",
        duration_min: Math.round(repMin),
        target: "hard up, easy down",
        rep_count: repCount,
        instruction: `${repCount}×${repSecLabel} hill repeats hard up / easy jog down.`
      },
      {
        phase: "cooldown",
        intensity: "z1",
        duration_min: cdMin,
        target: zones ? `${eLabel}/mi` : "Z1",
        instruction: `CD ${cdMin} min easy @ ${eLabel}${zones ? "/mi" : ""}.`
      }
    ];
    return { duration: totalDuration, phases };
  }

  function _generateFunSocial(template, experience, durationOverrideMin, zones, warnings) {
    const range = template.default_duration_min;
    const defaultMin = (range[0] + range[1]) / 2;
    const duration = _clampDurationOverride(defaultMin, durationOverrideMin, range, warnings);
    const text = (template.instruction_text || "").replace("{duration}", String(duration));
    return {
      duration,
      phases: [
        {
          phase: "main",
          intensity: "z1_default",
          duration_min: duration,
          target: "by feel, no targets",
          instruction: text
        }
      ]
    };
  }

  function _clampDurationOverride(defaultMin, override, range, warnings) {
    if (override == null) return Math.round(defaultMin);
    const lo = defaultMin * 0.5;
    const hi = defaultMin * 1.5;
    if (override < lo || override > hi) {
      warnings.push(`Duration override ${override} min is outside ±50% of the default; clamping.`);
      return Math.round(Math.max(range[0], Math.min(range[1], override)));
    }
    return Math.round(override);
  }

  // ─── Public entry point ──────────────────────────────────────────────────────

  /**
   * generateRunWorkout({ sessionTypeId, userZones, experienceLevel, durationOverrideMin, weeksSincePlanStart })
   * Pure function. NO API calls.
   */
  function generateRunWorkout(opts) {
    if (!opts || !opts.sessionTypeId) {
      throw new Error("generateRunWorkout: missing sessionTypeId");
    }
    const STL = (typeof window !== "undefined" && window.SessionTypeLibrary) || null;
    if (!STL) throw new Error("generateRunWorkout: SessionTypeLibrary not loaded");
    const template = STL.getSessionTypeById(opts.sessionTypeId);
    if (!template) throw new Error("generateRunWorkout: unknown sessionTypeId " + opts.sessionTypeId);

    const experience = opts.experienceLevel || "intermediate";
    const zones = opts.userZones || null;
    const warnings = [];

    if (!zones || !zones.vdot) {
      warnings.push("For accurate pace targets, add a recent race result.");
    }

    let result;
    switch (template.id) {
      case "easy_recovery":
        result = _generateSimpleSinglePhase(template, experience, opts.durationOverrideMin, zones, warnings);
        break;
      case "endurance":
        result = _generateEndurance(template, experience, opts.durationOverrideMin, zones, warnings);
        break;
      case "long_run":
        result = _generateLongRun(template, experience, opts.durationOverrideMin, zones, warnings);
        break;
      case "tempo_threshold":
        result = _generateTempo(template, experience, opts.durationOverrideMin, zones, warnings);
        break;
      case "track_workout":
        result = _generateTrack(template, experience, opts.durationOverrideMin, zones, warnings, opts.weeksSincePlanStart || 0);
        break;
      case "speed_work":
        result = _generateSpeedWork(template, experience, opts.durationOverrideMin, zones, warnings);
        break;
      case "hills":
        result = _generateHills(template, experience, opts.durationOverrideMin, zones, warnings);
        break;
      case "fun_social":
        result = _generateFunSocial(template, experience, opts.durationOverrideMin, zones, warnings);
        break;
      default:
        throw new Error("generateRunWorkout: no generator for " + template.id);
    }

    // Build a human-readable title.
    let title = template.label;
    if (template.id === "track_workout" && result.rotationName) {
      // E.g. "Track Workout — 8×800m repeats" / "Track Workout — Ladder"
      title = `Track Workout — ${result.rotationName}`;
    } else if (template.id === "tempo_threshold") {
      const scaling = template.experience_scaling[experience] || {};
      title = `Tempo / Threshold — ${scaling.reps || ""}×${scaling.rep_duration_min || ""} min`;
    }

    return {
      workout: {
        title,
        type: template.id,
        is_hard: template.is_hard,
        estimated_duration_min: result.duration,
        phases: result.phases,
        why_text: template.why_text,
        warnings,
        rotation_index: result.rotationIndex,
        rotation_name: result.rotationName,
        sub_template: result.subTemplate
      },
      warnings
    };
  }

  const api = {
    generateRunWorkout,
  };

  if (typeof window !== "undefined") window.RunningWorkoutGenerator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
