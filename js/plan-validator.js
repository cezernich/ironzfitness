/**
 * IronZ Rule Engine — Chunk 3: Plan Validator
 *
 * Validates a fully assembled plan against the hard safety rules from
 * TRAINING_PHILOSOPHY.md §13 and RULE_ENGINE_SPEC.md §11. Failing rules
 * are auto-fixed in place and recorded in plan.validationFlags.
 *
 * Depends on window.NutritionCalculator (for calorie floor + protein floor
 * helpers); gracefully falls back if it isn't present.
 */
(function () {
  'use strict';

  const DISCLAIMER = 'This plan provides general wellness guidance and is not a substitute for professional medical advice. Consult a healthcare provider before starting any new exercise or nutrition program.';

  const PROHIBITED_PATTERNS = [
    /guaranteed\s+results?/gi,
    /lose\s+\d+\s*(?:lb|lbs|pound|pounds|kg)?\s*(?:in|over|within)\s+\d+\s*(?:day|days|week|weeks|month|months)/gi,
    /burn\s+off\s+that\s+meal/gi,
    /\bcure\b/gi,
    /\btreat\b/gi,
    /\bdiagnose\b/gi,
  ];

  const INTENSITY_CAP = { beginner: 1, intermediate: 2, advanced: 3 };

  // v1.4 — Hyrox hour ceilings (Philosophy §4.8). Upper bound per level.
  const HYROX_HOUR_CEILING = { beginner: 7, intermediate: 10, advanced: 14 };
  const HYROX_HOUR_FLOOR =   { beginner: 5, intermediate: 7,  advanced: 10 };

  // v1.4 — running distance-specific taper caps (weeks). A 5K plan must
  // not have a 3-week taper.
  const RUN_TAPER_MAX_WEEKS = {
    '5k': 1,            // 7-10 days → at most 1 full week
    '10k': 2,           // 10-14 days
    'half-marathon': 2,
    'marathon': 3,
    'ultra': 3,
  };

  function flag(list, rule, action, details) {
    list.push({ rule, action, details });
  }

  function genderOf(classification) {
    const g = classification && classification.gender;
    return g === 'female' || g === 'male' || g === 'other' ? g : 'not_specified';
  }

  function calorieFloor(gender) {
    if (window.NutritionCalculator && typeof window.NutritionCalculator._calorieFloor === 'function') {
      return window.NutritionCalculator._calorieFloor(gender);
    }
    return gender === 'female' ? 1200 : 1500;
  }

  function proteinFloorPerLb() {
    if (window.NutritionCalculator && window.NutritionCalculator._proteinFloorGPerLb != null) {
      return window.NutritionCalculator._proteinFloorGPerLb;
    }
    return 0.6;
  }

  // ── Rule 1 & 2: nutrition floors ──────────────────────────────────────────

  function checkCalorieFloor(plan, classification, flags) {
    const targets = plan.nutritionStrategy && plan.nutritionStrategy.dailyTargets;
    if (!targets) return;
    const gender = genderOf(classification);
    const floor = calorieFloor(gender);
    if (targets.calories < floor) {
      const before = targets.calories;
      targets.calories = floor;
      flag(flags, 'calorie_floor', 'auto-fixed',
        `Raised calories from ${before} to ${floor} (${gender} floor).`);
    }
  }

  function checkProteinFloor(plan, classification, flags) {
    const targets = plan.nutritionStrategy && plan.nutritionStrategy.dailyTargets;
    if (!targets) return;
    const weight = classification && classification.weight;
    if (!weight) return;
    const floor = Math.ceil(proteinFloorPerLb() * weight);
    if (targets.proteinG < floor) {
      const before = targets.proteinG;
      targets.proteinG = floor;
      flag(flags, 'protein_floor', 'auto-fixed',
        `Raised protein from ${before}g to ${floor}g (0.6 g/lb × ${weight}lb).`);
    }
  }

  // ── Rule 3: week-over-week volume increase cap (15%) ──────────────────────

  function weekDuration(week) {
    if (!week || !Array.isArray(week.sessions)) return 0;
    return week.sessions.reduce((a, s) => a + (s.durationMin || 0), 0);
  }

  function scaleWeek(week, factor) {
    if (!week || !Array.isArray(week.sessions) || factor >= 1) return;
    for (const s of week.sessions) {
      if (!s || s.type === 'rest') continue;
      s.durationMin = Math.max(15, Math.round((s.durationMin || 0) * factor));
    }
    week.targetHours = Math.round(weekDuration(week) / 6) / 10;
  }

  function checkVolumeIncreaseCap(plan, classification, flags) {
    const plan_ = plan.weeklyPlan;
    if (!Array.isArray(plan_) || plan_.length < 2) return;
    const cap = (classification && classification.level === 'beginner') ? 0.10 : 0.15;
    for (let i = 1; i < plan_.length; i++) {
      const prev = plan_[i - 1];
      const curr = plan_[i];
      if (curr.isDeload || prev.isDeload) continue;
      if (curr.phase === 'taper' || curr.phase === 'race-week') continue;
      const prevDur = weekDuration(prev);
      const currDur = weekDuration(curr);
      if (prevDur <= 0) continue;
      const maxAllowed = Math.round(prevDur * (1 + cap));
      if (currDur > maxAllowed) {
        const factor = maxAllowed / currDur;
        scaleWeek(curr, factor);
        flag(flags, 'volume_increase_cap', 'auto-fixed',
          `Week ${curr.weekNumber} duration ${currDur}→${weekDuration(curr)}min (capped at +${Math.round(cap * 100)}% over week ${prev.weekNumber}).`);
      }
    }
  }

  // ── Rule 4: at least 1 rest day per week ──────────────────────────────────

  function restDayTemplate(day) {
    return {
      day,
      type: 'rest',
      sessionSubtype: 'rest',
      durationMin: 0,
      keySession: false,
      targetZones: [],
      description: 'Full rest day — recovery is productive, not lazy.',
      rationale: 'Rest day inserted by safety validator to honor the 1-rest-day-minimum rule.',
    };
  }

  function checkRestDayMinimum(plan, classification, flags) {
    const weeks = plan.weeklyPlan;
    if (!Array.isArray(weeks)) return;
    for (const week of weeks) {
      const sessions = Array.isArray(week.sessions) ? week.sessions : (week.sessions = []);
      const hasRest = sessions.some(s => s && s.type === 'rest');
      if (hasRest) continue;
      // Find least-loaded day slot — prefer empty days 5-7, then any empty day,
      // then replace the shortest easy session.
      const occupied = new Map();
      sessions.forEach(s => occupied.set(s.day, s));
      let placedDay = null;
      for (let d = 7; d >= 5; d--) {
        if (!occupied.has(d)) { placedDay = d; break; }
      }
      if (placedDay == null) {
        for (let d = 1; d <= 7; d++) {
          if (!occupied.has(d)) { placedDay = d; break; }
        }
      }
      if (placedDay != null) {
        sessions.push(restDayTemplate(placedDay));
        sessions.sort((a, b) => a.day - b.day);
        flag(flags, 'rest_day_minimum', 'auto-fixed',
          `Week ${week.weekNumber}: inserted rest day on day ${placedDay}.`);
        continue;
      }
      // All 7 days occupied — replace the least-important easy session.
      const candidates = sessions
        .filter(s => s && s.type !== 'rest' && s.priority !== 'long' && !s.keySession)
        .sort((a, b) => (a.durationMin || 0) - (b.durationMin || 0));
      const victim = candidates[0] || sessions.find(s => !s.keySession);
      if (victim) {
        const victimDay = victim.day;
        const idx = sessions.indexOf(victim);
        sessions.splice(idx, 1, restDayTemplate(victimDay));
        sessions.sort((a, b) => a.day - b.day);
        flag(flags, 'rest_day_minimum', 'auto-fixed',
          `Week ${week.weekNumber}: replaced day-${victimDay} session with rest.`);
      }
    }
  }

  // ── Rule 5: plans > 4 weeks must contain a deload ─────────────────────────

  function checkDeloadInclusion(plan, classification, flags) {
    const weeks = plan.weeklyPlan;
    if (!Array.isArray(weeks) || weeks.length <= 4) return;
    if (weeks.some(w => w.isDeload)) return;
    // Convert week 4 (or the last non-taper, non-race-week week before it) to deload.
    let target = weeks[3];
    if (!target || target.phase === 'taper' || target.phase === 'race-week') {
      target = weeks.slice(0, 4).reverse().find(w => w.phase !== 'taper' && w.phase !== 'race-week');
    }
    if (!target) return;
    target.isDeload = true;
    if (Array.isArray(target.sessions)) {
      for (const s of target.sessions) {
        if (!s || s.type === 'rest') continue;
        s.durationMin = Math.max(15, Math.round((s.durationMin || 30) * 0.55));
        if (s.type === 'strength' && Array.isArray(s.exercises)) {
          s.exercises = s.exercises.map(e => ({ ...e, sets: Math.max(1, e.sets - 1) }));
        }
      }
      target.targetHours = Math.round(weekDuration(target) / 6) / 10;
    }
    flag(flags, 'deload_inclusion', 'auto-fixed',
      `Converted week ${target.weekNumber} to a deload week (40-60% volume reduction, intensity maintained).`);
  }

  // ── Rule 6: intensity cap per week ────────────────────────────────────────

  function demoteSession(s) {
    s.keySession = false;
    s.priority = 'aerobic';
    if (s.type === 'run') { s.subtype = 'easy'; s.sessionSubtype = 'easy'; s.targetZones = ['Z2']; }
    else if (s.type === 'bike') { s.subtype = 'z2_endurance'; s.sessionSubtype = 'z2_endurance'; s.targetZones = ['Z2']; }
    else if (s.type === 'swim') { s.subtype = 'endurance'; s.sessionSubtype = 'endurance'; s.targetZones = ['Z2', 'Z3']; }
    else { s.targetZones = ['Z2']; }
    s.rationale = (s.rationale || '') + ' (Demoted to Z2 by safety validator: intensity cap for level.)';
  }

  function checkIntensityCap(plan, classification, flags) {
    const weeks = plan.weeklyPlan;
    if (!Array.isArray(weeks)) return;
    const level = (classification && classification.level) || 'intermediate';
    const cap = INTENSITY_CAP[level] || 2;
    for (const week of weeks) {
      const sessions = Array.isArray(week.sessions) ? week.sessions : [];
      const keySessions = sessions.filter(s => s && s.keySession && s.type !== 'rest');
      if (keySessions.length <= cap) continue;
      // Keep first `cap` in day order; demote the rest.
      keySessions.sort((a, b) => (a.day || 0) - (b.day || 0));
      const excess = keySessions.slice(cap);
      for (const s of excess) demoteSession(s);
      flag(flags, 'intensity_cap', 'auto-fixed',
        `Week ${week.weekNumber}: demoted ${excess.length} key session(s) to Z2 (cap=${cap} for ${level}).`);
    }
  }

  // ── Rule 7: no consecutive hard days for non-advanced ────────────────────

  function checkNoConsecutiveHard(plan, classification, flags) {
    const level = (classification && classification.level) || 'intermediate';
    if (level === 'advanced') return;
    const weeks = plan.weeklyPlan;
    if (!Array.isArray(weeks)) return;
    for (const week of weeks) {
      const sessions = Array.isArray(week.sessions) ? week.sessions : [];
      const byDay = new Map();
      sessions.forEach(s => byDay.set(s.day, s));
      const hardDays = sessions
        .filter(s => s && s.keySession && s.type !== 'rest')
        .map(s => s.day)
        .sort((a, b) => a - b);
      for (let i = 1; i < hardDays.length; i++) {
        if (hardDays[i] !== hardDays[i - 1] + 1) continue;
        const moving = byDay.get(hardDays[i]);
        if (!moving) continue;
        const otherHard = new Set(hardDays.filter(d => d !== moving.day));
        let target = null;
        for (let d = 1; d <= 7; d++) {
          if (byDay.has(d)) continue;
          const adjacent = [...otherHard].some(hd => Math.abs(hd - d) <= 1);
          if (!adjacent) { target = d; break; }
        }
        if (target != null) {
          byDay.delete(moving.day);
          moving.day = target;
          byDay.set(target, moving);
          hardDays[i] = target;
          hardDays.sort((a, b) => a - b);
          flag(flags, 'no_consecutive_hard', 'auto-fixed',
            `Week ${week.weekNumber}: moved key session to day ${target} to break back-to-back intensity.`);
        } else {
          // No empty non-adjacent day — demote the later session instead.
          demoteSession(moving);
          flag(flags, 'no_consecutive_hard', 'auto-fixed',
            `Week ${week.weekNumber}: demoted day-${moving.day} key session (no non-adjacent slot available).`);
          hardDays.splice(i, 1);
          i--;
        }
      }
      sessions.sort((a, b) => a.day - b.day);
    }
  }

  // ── Rule 8: long run ≤ 30% of weekly run mileage ─────────────────────────

  function checkLongRunProportion(plan, classification, flags) {
    const weeks = plan.weeklyPlan;
    if (!Array.isArray(weeks)) return;
    const maxPct = 0.30;
    for (const week of weeks) {
      const sessions = Array.isArray(week.sessions) ? week.sessions : [];
      const runs = sessions.filter(s => s && s.type === 'run');
      const totalRunMin = runs.reduce((a, s) => a + (s.durationMin || 0), 0);
      if (totalRunMin <= 0) continue;
      const longRun = runs.find(s => s.priority === 'long' || s.subtype === 'long_run' || s.sessionSubtype === 'long_run');
      if (!longRun) continue;
      const maxAllowed = Math.round(totalRunMin * maxPct);
      // Long run must be <= 30% of total — but since the long run is part of
      // the total, the true limit where LR/(others+LR) <= 0.30 means
      // LR <= 0.30 * total  is slightly over; we enforce the simpler
      // "LR <= 0.30 * total" with total BEFORE trimming to stay conservative.
      if (longRun.durationMin > maxAllowed && maxAllowed >= 20) {
        const before = longRun.durationMin;
        longRun.durationMin = maxAllowed;
        week.targetHours = Math.round(weekDuration(week) / 6) / 10;
        flag(flags, 'long_run_proportion', 'auto-fixed',
          `Week ${week.weekNumber}: capped long run ${before}→${maxAllowed}min (≤30% of ${totalRunMin}min weekly run volume).`);
      }
    }
  }

  // ── Rule 9: beginner guardrails — ≤ 5 ex/session, ≤ 4 training days/week ─

  function checkBeginnerComplexity(plan, classification, flags) {
    if (!classification || classification.level !== 'beginner') return;
    const weeks = plan.weeklyPlan;
    if (!Array.isArray(weeks)) return;
    for (const week of weeks) {
      const sessions = Array.isArray(week.sessions) ? week.sessions : [];
      // Cap exercises per strength-ish session at 5
      for (const s of sessions) {
        if (s && Array.isArray(s.exercises) && s.exercises.length > 5) {
          const before = s.exercises.length;
          s.exercises = s.exercises.slice(0, 5);
          flag(flags, 'beginner_complexity', 'auto-fixed',
            `Week ${week.weekNumber} day ${s.day}: trimmed exercises ${before}→5 for beginner.`);
        }
      }
      // Cap training days at 4 (plus rest = 5+ total entries allowed if rest sessions present)
      const training = sessions.filter(s => s && s.type !== 'rest');
      if (training.length > 4) {
        // Demote excess: prefer removing the lowest-priority non-key session.
        training.sort((a, b) => {
          const score = x => (x.keySession ? 100 : 0) + (x.priority === 'long' ? 90 : 0)
            + (x.priority === 'brick' ? 80 : 0) + (x.type === 'strength' ? 40 : 0)
            + (x.durationMin || 0) / 10;
          return score(a) - score(b);
        });
        const removeCount = training.length - 4;
        const victims = training.slice(0, removeCount);
        for (const v of victims) {
          const idx = sessions.indexOf(v);
          if (idx >= 0) {
            sessions.splice(idx, 1, restDayTemplate(v.day));
          }
        }
        sessions.sort((a, b) => a.day - b.day);
        flag(flags, 'beginner_complexity', 'auto-fixed',
          `Week ${week.weekNumber}: reduced training days to 4 (removed ${removeCount}) for beginner.`);
      }
    }
  }

  // ── Rule 10: prohibited phrases in any text field ────────────────────────

  function stripProhibited(value) {
    if (typeof value !== 'string') return { value, changed: false };
    let out = value;
    let changed = false;
    for (const pat of PROHIBITED_PATTERNS) {
      if (pat.test(out)) {
        out = out.replace(pat, '[removed]');
        changed = true;
      }
    }
    return { value: out, changed };
  }

  function walkAndStrip(obj, flags, path) {
    if (obj == null) return;
    if (typeof obj === 'string') return; // strings handled by parent
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') {
          const res = stripProhibited(obj[i]);
          if (res.changed) {
            obj[i] = res.value;
            flag(flags, 'prohibited_phrases', 'auto-fixed', `Stripped prohibited phrase at ${path}[${i}].`);
          }
        } else {
          walkAndStrip(obj[i], flags, `${path}[${i}]`);
        }
      }
      return;
    }
    if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'string') {
          const res = stripProhibited(val);
          if (res.changed) {
            obj[key] = res.value;
            flag(flags, 'prohibited_phrases', 'auto-fixed', `Stripped prohibited phrase at ${path}.${key}.`);
          }
        } else if (val && typeof val === 'object') {
          walkAndStrip(val, flags, `${path}.${key}`);
        }
      }
    }
  }

  function checkProhibitedPhrases(plan, classification, flags) {
    walkAndStrip(plan, flags, 'plan');
  }

  // ── v1.4 Rule 12: fat_loss → ≥ 2 strength sessions/week ──────────────────

  function fullBodyStrengthTemplate(day) {
    return {
      day,
      type: 'strength',
      sessionSubtype: 'full_body',
      subtype: 'full_body',
      priority: 'strength',
      durationMin: 45,
      keySession: false,
      targetZones: [],
      description: 'Full-body strength (auto-inserted to protect muscle during caloric deficit).',
      rationale: 'Fat-loss plans require ≥2 strength sessions/week — strength protects muscle mass while cardio supports the deficit.',
    };
  }

  function checkFatLossStrengthFloor(plan, classification, flags) {
    if (!classification || classification.goal !== 'fat_loss') return;
    const weeks = plan.weeklyPlan;
    if (!Array.isArray(weeks)) return;
    for (const week of weeks) {
      const sessions = Array.isArray(week.sessions) ? week.sessions : (week.sessions = []);
      const strengthCount = sessions.filter(s => s && s.type === 'strength').length;
      if (strengthCount >= 2) continue;
      const needed = 2 - strengthCount;
      let inserted = 0;
      const occupied = new Map();
      sessions.forEach(s => occupied.set(s.day, s));
      // Prefer to replace the shortest easy session, else take an empty day.
      for (let i = 0; i < needed; i++) {
        // Find empty day first.
        let placedDay = null;
        for (let d = 1; d <= 7; d++) {
          if (!occupied.has(d)) { placedDay = d; break; }
        }
        if (placedDay != null) {
          const s = fullBodyStrengthTemplate(placedDay);
          sessions.push(s);
          occupied.set(placedDay, s);
          inserted++;
          continue;
        }
        // Replace lightest non-strength, non-key session.
        const victims = sessions
          .filter(s => s && s.type !== 'strength' && s.type !== 'rest' && !s.keySession)
          .sort((a, b) => (a.durationMin || 0) - (b.durationMin || 0));
        const victim = victims[0];
        if (!victim) break;
        const idx = sessions.indexOf(victim);
        const replacement = fullBodyStrengthTemplate(victim.day);
        sessions.splice(idx, 1, replacement);
        occupied.set(victim.day, replacement);
        inserted++;
      }
      if (inserted > 0) {
        sessions.sort((a, b) => a.day - b.day);
        flag(flags, 'fat_loss_strength_floor', 'auto-fixed',
          `Week ${week.weekNumber}: inserted ${inserted} strength session(s) to meet the 2/week fat-loss minimum.`);
      }
    }
  }

  // ── v1.4 Rule 13: Hyrox weekly hour ceiling ──────────────────────────────

  function checkHyroxHourCeiling(plan, classification, flags) {
    if (!classification || classification.sportProfile !== 'hyrox') return;
    const level = classification.level || 'intermediate';
    const ceiling = HYROX_HOUR_CEILING[level];
    if (!ceiling) return;
    const weeks = plan.weeklyPlan;
    if (!Array.isArray(weeks)) return;
    const ceilingMin = ceiling * 60;
    for (const week of weeks) {
      if (week.isDeload || week.phase === 'taper' || week.phase === 'race-week') continue;
      const total = (week.sessions || []).reduce((a, s) => a + (s.durationMin || 0), 0);
      if (total <= ceilingMin) continue;
      const scale = ceilingMin / total;
      for (const s of (week.sessions || [])) {
        if (s && s.type !== 'rest') s.durationMin = Math.max(15, Math.round((s.durationMin || 0) * scale));
      }
      week.targetHours = Math.round(((week.sessions || []).reduce((a, s) => a + (s.durationMin || 0), 0)) / 6) / 10;
      flag(flags, 'hyrox_hour_ceiling', 'auto-fixed',
        `Week ${week.weekNumber}: scaled Hyrox volume to ${level} ceiling of ${ceiling} hrs.`);
    }
  }

  // ── v1.4 Rule 14: running distance-specific taper length ─────────────────

  function checkRunningTaperLength(plan, classification, flags) {
    const arc = plan.arc;
    if (!arc || arc.planMode !== 'race_based') return;
    const aRace = Array.isArray(arc.races)
      ? (arc.races.find(r => r && r.priority === 'A') || arc.races[arc.races.length - 1])
      : null;
    if (!aRace) return;
    const cap = RUN_TAPER_MAX_WEEKS[aRace.raceType];
    if (cap == null) return;
    const taperPhase = Array.isArray(arc.phases) && arc.phases.find(p => p.phase === 'taper');
    if (!taperPhase) return;
    const taperWeeks = taperPhase.endWeek - taperPhase.startWeek + 1;
    if (taperWeeks <= cap) return;
    const excess = taperWeeks - cap;
    taperPhase.endWeek -= excess;
    // The phases array is sequential; trim doesn't reassign other weeks.
    // Instead, widen the preceding phase (Build/Peak) by the excess.
    const taperIdx = arc.phases.indexOf(taperPhase);
    if (taperIdx > 0) {
      const prev = arc.phases[taperIdx - 1];
      prev.endWeek += excess;
      // Push the taper window forward.
      taperPhase.startWeek += excess;
      taperPhase.endWeek += excess;
    }
    flag(flags, 'running_taper_length', 'auto-fixed',
      `${aRace.raceType.toUpperCase()} taper trimmed from ${taperWeeks}w → ${cap}w; ${excess}w redistributed to preceding phase.`);
  }

  // ── v1.4 Rule 15: rolling mesocycle must be exactly 4 weeks ──────────────

  function checkMesocycleLength(plan, classification, flags) {
    const arc = plan.arc;
    if (!arc || arc.planMode !== 'rolling_mesocycle') return;
    if (arc.totalWeeks === 4 && Array.isArray(plan.weeklyPlan) && plan.weeklyPlan.length === 4) return;
    const before = arc.totalWeeks;
    arc.totalWeeks = 4;
    if (Array.isArray(plan.weeklyPlan)) {
      if (plan.weeklyPlan.length > 4) plan.weeklyPlan.length = 4;
    }
    flag(flags, 'mesocycle_length', 'auto-fixed',
      `Rolling mesocycle must be 4 weeks (was ${before}).`);
  }

  // ── Rule 11: disclaimer must exist and contain the standard wording ──────

  function checkDisclaimer(plan, classification, flags) {
    if (!plan.rationale || typeof plan.rationale !== 'object') plan.rationale = {};
    const current = plan.rationale.disclaimer;
    if (!current || !String(current).toLowerCase().includes('general wellness guidance')) {
      plan.rationale.disclaimer = DISCLAIMER;
      flag(flags, 'disclaimer_present', 'auto-fixed',
        current ? 'Replaced non-compliant disclaimer with standard wellness disclaimer.'
                : 'Appended standard wellness disclaimer.');
    }
  }

  // ── Public entry point ────────────────────────────────────────────────────

  function validate(plan, classification) {
    if (!plan || typeof plan !== 'object') {
      return { plan, validationFlags: [], allPassed: true };
    }
    const flags = Array.isArray(plan.validationFlags) ? plan.validationFlags : [];
    // Run checks in order
    checkCalorieFloor(plan, classification, flags);
    checkProteinFloor(plan, classification, flags);
    checkVolumeIncreaseCap(plan, classification, flags);
    checkIntensityCap(plan, classification, flags);
    checkNoConsecutiveHard(plan, classification, flags);
    checkLongRunProportion(plan, classification, flags);
    checkBeginnerComplexity(plan, classification, flags);
    checkRestDayMinimum(plan, classification, flags);
    checkDeloadInclusion(plan, classification, flags);
    // v1.4 rules
    checkFatLossStrengthFloor(plan, classification, flags);
    checkHyroxHourCeiling(plan, classification, flags);
    checkRunningTaperLength(plan, classification, flags);
    checkMesocycleLength(plan, classification, flags);
    checkProhibitedPhrases(plan, classification, flags);
    checkDisclaimer(plan, classification, flags);

    plan.validationFlags = flags;
    return { plan, validationFlags: flags, allPassed: flags.length === 0 };
  }

  window.PlanValidator = {
    validate,
    // exposed for targeted unit tests
    _checkCalorieFloor: checkCalorieFloor,
    _checkProteinFloor: checkProteinFloor,
    _checkRestDayMinimum: checkRestDayMinimum,
    _checkDeloadInclusion: checkDeloadInclusion,
    _checkIntensityCap: checkIntensityCap,
    _checkNoConsecutiveHard: checkNoConsecutiveHard,
    _checkLongRunProportion: checkLongRunProportion,
    _checkBeginnerComplexity: checkBeginnerComplexity,
    _checkVolumeIncreaseCap: checkVolumeIncreaseCap,
    _checkProhibitedPhrases: checkProhibitedPhrases,
    _checkDisclaimer: checkDisclaimer,
    _checkFatLossStrengthFloor: checkFatLossStrengthFloor,
    _checkHyroxHourCeiling: checkHyroxHourCeiling,
    _checkRunningTaperLength: checkRunningTaperLength,
    _checkMesocycleLength: checkMesocycleLength,
    _DISCLAIMER: DISCLAIMER,
  };
})();
