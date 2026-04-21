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
    const rawDuration = _clampDurationOverride(defaultMin, durationOverrideMin, range, warnings, template.max_duration_min);
    // Easy / Recovery is one continuous conversational block — there's no
    // interval math, so snap to the nearest 5 minutes for a cleaner read.
    // 44 → 45, 47 → 45, 48 → 50, etc.
    const duration = Math.max(5, Math.round(rawDuration / 5) * 5);
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
    const duration = _clampDurationOverride(defaultMin, durationOverrideMin, range, warnings, template.max_duration_min);
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

  function _generateLongRun(template, experience, durationOverrideMin, zones, warnings, variantOffset) {
    const range = template.experience_scaling[experience] || template.default_duration_min;
    const defaultMin = (range[0] + range[1]) / 2;
    // Long runs always snap to multiples of 5 minutes — users plan long
    // runs in round numbers (100, 105, 110, …), and showing "113 min"
    // in the preview when the slider step is 5 read like a bug.
    const rawDuration = _clampDurationOverride(defaultMin, durationOverrideMin, range, warnings, template.max_duration_min);
    const duration = Math.max(5, Math.round(rawDuration / 5) * 5);
    const allowsFinish = experience === "intermediate" || experience === "advanced";
    const eLabel = zones ? _ePaceLabel(zones) : "Z1 (conversational)";
    const mLabel = zones ? _mPaceLabel(zones) : "Z2 marathon";

    const variant = _variantIndex(variantOffset) % 3; // 0=standard, 1=negative split, 2=with surges

    if (variant === 1 && allowsFinish) {
      // Negative split long run: first half easy, second half at marathon pace
      const firstHalf = Math.round(duration * 0.55);
      const secondHalf = duration - firstHalf;
      const phases = [
        { phase: "main", intensity: "z1", duration_min: firstHalf,
          target: zones ? `${eLabel}/mi` : "Z1",
          instruction: `First ${firstHalf} min easy @ ${eLabel}${zones ? "/mi" : ""}. Relaxed, conversational.` },
        { phase: "main_set", intensity: "z2", duration_min: secondHalf,
          target: zones ? `${mLabel}/mi` : "Z2 marathon",
          instruction: `Last ${secondHalf} min @ ${mLabel}${zones ? "/mi" : ""}. Negative split — finish faster than you started.` }
      ];
      if (duration >= (template.fueling_reminder_threshold_min || 75)) {
        warnings.push("Carry fuel: 30-60g carbs/hr after the first 60 minutes.");
      }
      return { duration, phases, subTemplate: "negative_split" };
    }

    if (variant === 2 && allowsFinish && duration >= 70) {
      // Long run with surges: mostly easy with 4-6 pickups
      const surgeCount = experience === "advanced" ? 6 : 4;
      const surgeDur = 2; // 2 min each
      const easyDur = duration - (surgeCount * surgeDur);
      const phases = [
        { phase: "main", intensity: "z1", duration_min: Math.round(easyDur * 0.3),
          target: zones ? `${eLabel}/mi` : "Z1",
          instruction: `${Math.round(easyDur * 0.3)} min easy @ ${eLabel}${zones ? "/mi" : ""} to warm up.` },
        { phase: "main_set", intensity: "z3", duration_min: Math.round(surgeCount * surgeDur + easyDur * 0.5),
          target: zones ? `${_tPaceLabel(zones)}/mi surges` : "tempo surges",
          rep_count: surgeCount,
          rep_duration_min: surgeDur,
          instruction: `${surgeCount}×${surgeDur} min surges @ ${zones ? _tPaceLabel(zones) + "/mi" : "tempo"} w/ 5–8 min easy between. Spread evenly through the run.` },
        { phase: "cooldown", intensity: "z1", duration_min: Math.round(easyDur * 0.2),
          target: zones ? `${eLabel}/mi` : "Z1",
          instruction: `Last ${Math.round(easyDur * 0.2)} min easy @ ${eLabel}${zones ? "/mi" : ""}.` }
      ];
      if (duration >= (template.fueling_reminder_threshold_min || 75)) {
        warnings.push("Carry fuel: 30-60g carbs/hr after the first 60 minutes.");
      }
      return { duration, phases, subTemplate: "with_surges" };
    }

    // Standard long run with optional M-pace finish
    const eMin = Math.round(duration * 0.80);
    const mMin = Math.round(duration * 0.20);
    const phases = [
      {
        phase: "main",
        intensity: "z1",
        duration_min: eMin,
        target: zones ? `${eLabel}/mi` : "Z1",
        instruction: `${eMin} min @ ${zones ? eLabel + "/mi (Z1)" : "Z1 (conversational)"}.`
      }
    ];
    if (allowsFinish && mMin >= 10) {
      phases.push({
        phase: "optional_mp_finish",
        intensity: "z2",
        duration_min: mMin,
        target: zones ? `${mLabel}/mi` : "Z2 marathon",
        instruction: `Last ${mMin} min @ ${zones ? mLabel + "/mi (Z2 marathon finish)" : "Z2 marathon finish"}.`
      });
    }
    if (duration >= (template.fueling_reminder_threshold_min || 75)) {
      warnings.push("Carry fuel: 30-60g carbs/hr after the first 60 minutes.");
    }
    return { duration, phases };
  }

  function _generateTempo(template, experience, durationOverrideMin, zones, warnings, variantOffset) {
    const scaling = template.experience_scaling[experience] || template.experience_scaling.intermediate;
    const wuMin = 15;
    const cdMin = 10;
    const tLabel = zones ? _tPaceLabel(zones) : "comfortably hard";
    const eLabel = zones ? _ePaceLabel(zones) : "Z1";
    const mLabel = zones ? _mPaceLabel(zones) : "marathon effort";

    const variant = _variantIndex(variantOffset) % 3; // 0=cruise intervals, 1=continuous tempo, 2=progression

    if (variant === 1 && (experience === "intermediate" || experience === "advanced")) {
      // Continuous tempo
      const tempoMin = experience === "advanced" ? 25 : 20;
      const totalDuration = wuMin + tempoMin + cdMin;
      const phases = [
        { phase: "warmup", intensity: "z1", duration_min: wuMin,
          target: zones ? `${eLabel}/mi` : "Z1",
          instruction: `WU ${wuMin} min easy @ ${eLabel}${zones ? "/mi" : ""}.` },
        { phase: "main_set", intensity: "z3", duration_min: tempoMin,
          target: zones ? `${tLabel}/mi` : "T effort",
          instruction: `${tempoMin} min continuous @ ${tLabel}${zones ? "/mi" : ""}. Steady, no breaks.` },
        { phase: "cooldown", intensity: "z1", duration_min: cdMin,
          target: zones ? `${eLabel}/mi` : "Z1",
          instruction: `CD ${cdMin} min easy @ ${eLabel}${zones ? "/mi" : ""}.` }
      ];
      return { duration: Math.round(totalDuration), phases, subTemplate: "continuous_tempo" };
    }

    if (variant === 2 && (experience === "intermediate" || experience === "advanced")) {
      // Progression run: easy → marathon → tempo
      const eMin = 15, mMin = 10, tMin = experience === "advanced" ? 15 : 10;
      const totalDuration = eMin + mMin + tMin + cdMin;
      const phases = [
        { phase: "warmup", intensity: "z1", duration_min: eMin,
          target: zones ? `${eLabel}/mi` : "Z1",
          instruction: `${eMin} min easy @ ${eLabel}${zones ? "/mi" : ""}.` },
        { phase: "main_set", intensity: "z2", duration_min: mMin,
          target: zones ? `${mLabel}/mi` : "Z2 marathon",
          instruction: `${mMin} min @ ${mLabel}${zones ? "/mi" : ""} (marathon effort).` },
        { phase: "main_set", intensity: "z3", duration_min: tMin,
          target: zones ? `${tLabel}/mi` : "T effort",
          instruction: `${tMin} min @ ${tLabel}${zones ? "/mi" : ""} (threshold effort).` },
        { phase: "cooldown", intensity: "z1", duration_min: cdMin,
          target: zones ? `${eLabel}/mi` : "Z1",
          instruction: `CD ${cdMin} min easy @ ${eLabel}${zones ? "/mi" : ""}.` }
      ];
      return { duration: Math.round(totalDuration), phases, subTemplate: "progression" };
    }

    // Default: cruise intervals
    let reps = scaling.reps;
    const repMin = scaling.rep_duration_min;
    const restSec = scaling.rest_sec;
    let restMin = ((reps - 1) * restSec) / 60;
    let totalDuration = wuMin + reps * repMin + restMin + cdMin;

    // Honor the user's asked-for duration (±50% band). The old code
    // gated the override with a warning but never actually scaled the
    // workout — if you asked for 45 min the generator still returned
    // whatever totalDuration the experience scaling produced (often
    // 60+). Scale reps down/up to land near the target, keeping warmup
    // and cooldown fixed because those are calibrated to the session,
    // not the volume.
    if (durationOverrideMin) {
      const delta = Math.abs(durationOverrideMin - totalDuration);
      if (delta > totalDuration * 0.5) {
        warnings.push(`Duration override ignored — outside ±50% of ${Math.round(totalDuration)} min.`);
      } else if (delta > 3) {
        // Target minutes for the main set (reps × repMin + rest between).
        // Solve for reps given a fixed repMin + per-rest: totalMain =
        // r*repMin + (r-1)*restSec/60. Invert:
        //   r = (totalMain + restSec/60) / (repMin + restSec/60)
        const targetMain = Math.max(repMin + 1, durationOverrideMin - wuMin - cdMin);
        const restPer    = restSec / 60;
        const targetReps = (targetMain + restPer) / (repMin + restPer);
        reps = Math.max(2, Math.min(8, Math.round(targetReps)));
        restMin = ((reps - 1) * restSec) / 60;
        totalDuration = wuMin + reps * repMin + restMin + cdMin;
      }
    }
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
    return { duration: Math.round(totalDuration), phases, subTemplate: "cruise_intervals" };
  }

  function _generateTrack(template, experience, durationOverrideMin, zones, warnings, weeksSincePlanStart, variantOffset) {
    const rotCount = template.rotation_templates.length;
    let rotationIndex;
    if (weeksSincePlanStart != null && weeksSincePlanStart > 0 && !variantOffset) {
      rotationIndex = ((weeksSincePlanStart) % rotCount + rotCount) % rotCount;
    } else {
      rotationIndex = _variantIndex(variantOffset) % rotCount;
    }
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
      // Ladder is a single set — don't split into reps
      repCount = null;
      repDistance = null;
    } else if (tmpl.main_set.rep_distance_m && tmpl.main_set.rep_count) {
      let count = _resolveRepCount(tmpl.main_set.rep_count, experience);
      const dist = tmpl.main_set.rep_distance_m;
      const midI = zones && zones.i_pace ? (zones.i_pace.sec_per_mi[0] + zones.i_pace.sec_per_mi[1]) / 2 : 360;
      const repTime = midI * dist / 1609.344;
      const restTime = tmpl.main_set.rest_distance_m
        ? midI * tmpl.main_set.rest_distance_m / 1609.344 * 1.4 // jog ~40% slower
        : (tmpl.main_set.rest_duration_sec || 90);
      // Honor a duration override by scaling rep count to hit the target.
      // Each rep "slot" = repTime + restTime (final rep has no trailing rest).
      if (durationOverrideMin != null) {
        const targetMainSec = (durationOverrideMin - wuMin - cdMin) * 60;
        const repSlot = repTime + restTime;
        const scaled = Math.round((targetMainSec + restTime) / repSlot);
        count = Math.max(3, Math.min(20, scaled));
      }
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
        target: zones && repDistance ? `I-pace (${_iPaceLabelForDistance(zones, parseInt(repDistance))})` : "I-pace effort",
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

  function _generateSpeedWork(template, experience, durationOverrideMin, zones, warnings, variantOffset) {
    // Pick sub-template. Each sub_template is usually "default_for" exactly
    // one experience level (200s=intermediate, 400s=advanced, strides=beginner),
    // so filtering by experience alone leaves only one match and shuffle is a
    // no-op. When the user explicitly hits shuffle (variantOffset > 0) we pool
    // across all sub-templates so they actually get a different workout —
    // starting one step past the experience-default so the first press always
    // gives a new flavor.
    const allSubs = template.sub_templates;
    const matching = allSubs.filter(s => (s.default_for || []).includes(experience));
    let subTpl;
    if (variantOffset && allSubs.length > 1) {
      const defaultIdx = Math.max(0, allSubs.indexOf(matching[0] || allSubs[0]));
      subTpl = allSubs[(defaultIdx + variantOffset) % allSubs.length];
    } else if (matching.length > 1) {
      subTpl = matching[_variantIndex(variantOffset) % matching.length];
    } else {
      subTpl = matching[0] || allSubs[0];
    }
    const wuMin = 15;
    const cdMin = subTpl.id === "strides_only" ? 5 : 10;
    let mainSetText = "";
    let mainSetMinutes = 0;
    let repCount = null;

    if (subTpl.id === "r_pace_200s" || subTpl.id === "r_pace_400s" || subTpl.id === "r_pace_repeats") {
      let count = _resolveRepCount(subTpl.main_set.rep_count, experience);
      const dist = subTpl.main_set.rep_distance_m;
      const midR = zones && zones.r_pace ? (zones.r_pace.sec_per_mi[0] + zones.r_pace.sec_per_mi[1]) / 2 : 305;
      const repTime = midR * dist / 1609.344;
      const restTime = subTpl.main_set.rest_duration_sec || (subTpl.main_set.rest_distance_m ? 60 : 60);
      if (durationOverrideMin != null) {
        const targetMainSec = (durationOverrideMin - wuMin - cdMin) * 60;
        const repSlot = repTime + restTime;
        count = Math.max(4, Math.min(20, Math.round((targetMainSec + restTime) / repSlot)));
      }
      const paceLabel = _rPaceLabelForDistance(zones, dist);
      let restLabel;
      if (subTpl.main_set.rest_distance_m) {
        restLabel = `${subTpl.main_set.rest_distance_m}m walk recovery`;
      } else if (subTpl.main_set.rest_duration_sec) {
        restLabel = `${subTpl.main_set.rest_duration_sec}s walk recovery`;
      } else {
        restLabel = "walk recovery";
      }
      mainSetText = `${count}×${dist}m @ ${paceLabel}${zones ? "" : " effort"} w/ ${restLabel}.`;
      mainSetMinutes = (count * repTime + (count - 1) * restTime) / 60;
      repCount = count;
    } else if (subTpl.id === "strides_only") {
      let count = subTpl.main_set.rep_count;
      // ~45s stride + ~45s walk back ≈ 1.5 min per stride
      const perStrideMin = 0.75;
      if (durationOverrideMin != null) {
        const targetMainMin = durationOverrideMin - wuMin - cdMin;
        count = Math.max(4, Math.min(15, Math.round(targetMainMin / perStrideMin)));
      }
      mainSetText = `${count}×${subTpl.main_set.rep_distance_m}m strides at near-sprint w/ full recovery.`;
      mainSetMinutes = count * perStrideMin;
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

  function _generateHills(template, experience, durationOverrideMin, zones, warnings, variantOffset) {
    // 4 variants cycled via shuffle: short sharp, medium, long grinders,
    // and a ladder (1-2-3-2-1 min). Shuffle bumps variantOffset so the
    // user gets something different each tap.
    const variant = _variantIndex(variantOffset) % 4;
    const wuMin = 15;
    const cdMin = 10;
    const eLabel = zones ? _ePaceLabel(zones) : "Z1";
    let mainText, mainMin, repCount, subTemplate;

    if (variant === 1) {
      // Medium hills (60–90s each, 8–10 reps)
      subTemplate = "hills_medium";
      const perRepMin = (75 / 60) * 2;
      repCount = _resolveRepCount({ beginner: 6, intermediate: 8, advanced: 10 }, experience);
      if (durationOverrideMin != null) {
        const targetMainMin = durationOverrideMin - wuMin - cdMin;
        repCount = Math.max(4, Math.min(14, Math.round(targetMainMin / perRepMin)));
      }
      mainMin = repCount * perRepMin;
      mainText = `${repCount}×60–90s medium hill repeats hard up / easy jog down.`;
    } else if (variant === 2) {
      // Long grinders (2–3 min each, 4–6 reps, 4-6% grade)
      subTemplate = "hills_long";
      const perRepMin = 2.5 * 2;
      repCount = _resolveRepCount({ beginner: 4, intermediate: 5, advanced: 6 }, experience);
      if (durationOverrideMin != null) {
        const targetMainMin = durationOverrideMin - wuMin - cdMin;
        repCount = Math.max(3, Math.min(8, Math.round(targetMainMin / perRepMin)));
      }
      mainMin = repCount * perRepMin;
      mainText = `${repCount}×2–3 min long hill grinders, sustained threshold effort up / easy jog down.`;
    } else if (variant === 3) {
      // Hill ladder (1–2–3–2–1 min)
      subTemplate = "hills_ladder";
      const rungs = [1, 2, 3, 2, 1];
      const totalUp = rungs.reduce((a, b) => a + b, 0);
      mainMin = totalUp * 2; // up + jog down equal to up
      repCount = rungs.length;
      mainText = `Hill ladder: 1 → 2 → 3 → 2 → 1 min hard up, equal-time jog down between.`;
    } else {
      // Variant 0 (default) — short sharp (30–60s, 10–12 reps)
      subTemplate = "hills_short";
      const repDurRange = template.main_set.rep_duration_sec || [30, 60];
      const perRepMin = (repDurRange[1] / 60) * 2;
      repCount = _resolveRepCount(template.main_set.rep_count, experience);
      if (durationOverrideMin != null) {
        const targetMainMin = durationOverrideMin - wuMin - cdMin;
        repCount = Math.max(4, Math.min(20, Math.round(targetMainMin / perRepMin)));
      }
      mainMin = repCount * perRepMin;
      mainText = `${repCount}×${repDurRange[0]}–${repDurRange[1]}s short sharp hill repeats, max effort up / easy jog down.`;
    }

    const totalDuration = Math.round(wuMin + mainMin + cdMin);
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
        duration_min: Math.round(mainMin),
        target: "hard up, easy down",
        rep_count: repCount,
        instruction: mainText,
      },
      {
        phase: "cooldown",
        intensity: "z1",
        duration_min: cdMin,
        target: zones ? `${eLabel}/mi` : "Z1",
        instruction: `CD ${cdMin} min easy @ ${eLabel}${zones ? "/mi" : ""}.`
      }
    ];
    return { duration: totalDuration, phases, subTemplate };
  }

  function _generateFunSocial(template, experience, durationOverrideMin, zones, warnings) {
    const range = template.default_duration_min;
    const defaultMin = (range[0] + range[1]) / 2;
    const duration = _clampDurationOverride(defaultMin, durationOverrideMin, range, warnings, template.max_duration_min);
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

  // Deterministic variant index based on day-of-year + optional offset
  function _variantIndex(offset) {
    const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return doy + (offset || 0);
  }

  function _clampDurationOverride(defaultMin, override, range, warnings, maxOverride) {
    if (override == null) return Math.round(defaultMin);
    const lo = defaultMin * 0.5;
    // If the template declares an explicit upper bound (e.g. endurance up to
    // 150 min), honor it. Otherwise default to ±50% of the midpoint.
    const hi = Math.max(defaultMin * 1.5, maxOverride || 0);
    if (override < lo || override > hi) {
      warnings.push(`Duration override ${override} min is outside the allowed range; clamping.`);
      return Math.round(Math.max(lo, Math.min(hi, override)));
    }
    return Math.round(override);
  }

  // ─── Public entry point ──────────────────────────────────────────────────────

  /**
   * generateRunWorkout({ sessionTypeId, userZones, experienceLevel, durationOverrideMin, weeksSincePlanStart, variantOffset })
   * Pure function. NO API calls. variantOffset shifts the day-of-year based variant selection.
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

    // Only warn about missing pace data if the user has NO running zones
    // at all (no VDOT from getZonesForUser AND no manual zones in
    // trainingZones.running). Users who have entered zones manually
    // shouldn't see this prompt.
    let _hasRunZones = !!(zones && zones.vdot);
    if (!_hasRunZones) {
      try {
        const _tz = JSON.parse(localStorage.getItem("trainingZones") || "{}");
        const _rz = _tz.running || {};
        _hasRunZones = !!(
          _rz.vdot || _rz.zones ||
          _rz.easyPaceMin || _rz.easy || _rz.thresholdPaceMin || _rz.tempo || _rz.vo2max
        );
      } catch {}
    }
    if (!_hasRunZones) {
      warnings.push("For accurate pace targets, add a recent race result.");
    }

    const vOff = opts.variantOffset || 0;
    let result;
    switch (template.id) {
      case "easy_recovery":
        result = _generateSimpleSinglePhase(template, experience, opts.durationOverrideMin, zones, warnings);
        break;
      case "endurance":
        result = _generateEndurance(template, experience, opts.durationOverrideMin, zones, warnings);
        break;
      case "long_run":
        result = _generateLongRun(template, experience, opts.durationOverrideMin, zones, warnings, vOff);
        break;
      case "tempo_threshold":
        result = _generateTempo(template, experience, opts.durationOverrideMin, zones, warnings, vOff);
        break;
      case "track_workout":
        result = _generateTrack(template, experience, opts.durationOverrideMin, zones, warnings, opts.weeksSincePlanStart || 0, vOff);
        break;
      case "speed_work":
        result = _generateSpeedWork(template, experience, opts.durationOverrideMin, zones, warnings, vOff);
        break;
      case "hills":
        result = _generateHills(template, experience, opts.durationOverrideMin, zones, warnings, vOff);
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
      if (result.subTemplate === "continuous_tempo") {
        title = "Tempo — Continuous";
      } else if (result.subTemplate === "progression") {
        title = "Tempo — Progression Run";
      } else {
        const scaling = template.experience_scaling[experience] || {};
        title = `Tempo / Threshold — ${scaling.reps || ""}×${scaling.rep_duration_min || ""} min`;
      }
    } else if (template.id === "speed_work" && result.subTemplate) {
      if (result.subTemplate === "r_pace_400s") title = "Speed Work — 400m repeats";
      else if (result.subTemplate === "r_pace_200s") title = "Speed Work — 200m repeats";
      else if (result.subTemplate === "strides_only") title = "Speed Work — Strides";
    } else if (template.id === "long_run" && result.subTemplate) {
      if (result.subTemplate === "negative_split") title = "Long Run — Negative Split";
      else if (result.subTemplate === "with_surges") title = "Long Run — With Surges";
    } else if (template.id === "hills" && result.subTemplate) {
      const hillTitles = {
        hills_short:  "Hills — Short Sharp",
        hills_medium: "Hills — Medium Repeats",
        hills_long:   "Hills — Long Grinders",
        hills_ladder: "Hills — Ladder",
      };
      title = hillTitles[result.subTemplate] || title;
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
