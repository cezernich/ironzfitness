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
      s.durationMin = Math.max(0, Math.floor((s.durationMin || 0) * factor));
    }
    week.targetHours = Math.round(weekDuration(week) / 6) / 10;
  }

  function checkVolumeIncreaseCap(plan, classification, flags) {
    const plan_ = plan.weeklyPlan;
    if (!Array.isArray(plan_) || plan_.length < 2) return;
    const cap = (classification && classification.level === 'advanced') ? 0.15 : 0.10;
    let reference=null;
    for(const current of plan_) {
      if(current.isPartial||current.isDeload)continue;
      if(reference&&!['taper','race-week'].includes(current.phase)) {
        const priorMinutes=weekDuration(reference),minutes=weekDuration(current);
        if(priorMinutes>0) {
          const maximum=Math.floor(priorMinutes*(1+cap));
          if(minutes>maximum) {
            scaleWeek(current,maximum/minutes);
            flag(flags,'volume_increase_cap','auto-fixed',`Week ${current.weekNumber}: ${minutes}→${weekDuration(current)}min against last full non-deload week ${reference.weekNumber} (${priorMinutes}min). This is planned load, not measured tolerance.`);
          }
        }
      }
      reference=current;
    }
  }

  function checkKeystoneProgression(plan,classification,flags) {
    const previous=new Map();
    const cap=classification&&classification.level==='advanced'?0.15:0.10;
    for(const week of plan.weeklyPlan||[]) {
      if(week.isDeload||week.isPartial)continue;
      const sessions=(week.sessions||[]).filter(s=>s.priority==='long'||s.type==='brick');
      for(const session of sessions) {
        const prior=previous.get(session.type);
        if(prior!==undefined&&session.durationMin>Math.floor(prior*(1+cap))) {
          const before=session.durationMin;session.durationMin=Math.floor(prior*(1+cap));
          flag(flags,'keystone_progression','auto-fixed',`Week ${week.weekNumber}: ${session.type} long session ${before}→${session.durationMin}min.`);
        }
      }
      for(const type of new Set(sessions.map(s=>s.type)))previous.set(type,Math.max(...sessions.filter(s=>s.type===type).map(s=>s.durationMin)));
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
      const activeDays=new Set(sessions.filter(s=>s&&s.type!=='rest'&&s.durationMin>0).map(s=>s.day));
      const hasRest=activeDays.size<7;
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
        .filter(s => s && s.type !== 'rest' && s.priority !== 'long' && !s.keySession && !sessions.some(other=>other.day===s.day&&(other.keySession||other.priority==='long')))
        .sort((a, b) => (a.durationMin || 0) - (b.durationMin || 0));
      const victim = candidates[0];
      if (victim) {
        const victimDay = victim.day;
        for(let i=sessions.length-1;i>=0;i--)if(sessions[i].day===victimDay)sessions.splice(i,1);
        sessions.push(restDayTemplate(victimDay));
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
        s.durationMin = Math.max(0, Math.floor((s.durationMin || 0) * 0.55));
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
    s.strengthStress='none';
    for(const key of ['intervals','phases','steps','workoutId','generatedSession','aiSession','libraryWorkout','swimDetails','brickDetails','targetPace']) delete s[key];
    s.priority = 'aerobic';
    if (s.type === 'run') { s.subtype = 'easy'; s.sessionSubtype = 'easy'; s.targetZones = ['Z2']; }
    else if (s.type === 'bike') { s.subtype = 'z2_endurance'; s.sessionSubtype = 'z2_endurance'; s.targetZones = ['Z2']; }
    else if (s.type === 'swim') { s.subtype = 'technique'; s.sessionSubtype = 'technique'; s.targetZones = ['Z2']; }
    else if(s.type==='brick') {s.subtype=s.sessionSubtype='easy_brick';s.targetZones=['Z2'];}
    else {s.type='rest';s.subtype=s.sessionSubtype='rest';s.priority='rest';s.durationMin=0;s.targetZones=[];delete s.exercises;}
    s.phases=s.type==='rest'?[]:[{phase:'main_set',duration_min:s.durationMin,intensity:'z2',instruction:'Easy effort only. No intervals or tests.'}];
    s.description=s.type==='rest'?'Rest':s.durationMin+' min easy '+s.type+'. No intervals or tests.';
    s.rationale = (s.rationale || '') + ' (Demoted to Z2 by safety validator: intensity cap for level.)';
  }

  function checkIntensityCap(plan, classification, flags) {
    const weeks = plan.weeklyPlan;
    if (!Array.isArray(weeks)) return;
    const level = (classification && classification.level) || 'intermediate';
    const cap = INTENSITY_CAP[level] || 2;
    for (const week of weeks) {
      const sessions = Array.isArray(week.sessions) ? week.sessions : [];
      const keySessions = sessions.filter(s => s && s.keySession && s.type !== 'rest' && s.type!=='strength');
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
    const weeks = plan.weeklyPlan;
    if (!Array.isArray(weeks)) return;
    let priorHardDay=null;
    for(const week of weeks) {
      const hardSessions=(week.sessions||[]).filter(s=>(s.keySession||s.strengthStress==='heavy')&&s.type!=='rest').sort((a,b)=>a.day-b.day);
      for(const session of hardSessions) {
        const day=(week.weekNumber-1)*7+session.day;
        if(priorHardDay!==null&&day===priorHardDay+1) {
          demoteSession(session);
          flag(flags,'no_consecutive_hard','auto-fixed',`Week ${week.weekNumber} day ${session.day}: replaced actual hard prescription with easy work.`);
        } else priorHardDay=day;
      }
    }
  }

  // Long-run concentration is a warning, not a universal runner-frequency cap.
  function checkLongRunProportion(plan, classification, flags) {
    for(const week of plan.weeklyPlan||[]) {
      const sessions=week.sessions||[];
      const total=sessions.reduce((sum,s)=>sum+(s.type==='run'?(s.durationMin||0):s.type==='brick'?(s.brickDetails?.leg2DurationMin||0):0),0);
      const longs=sessions.filter(s=>s.type==='run'&&(s.priority==='long'||/long_run/.test(s.subtype||s.sessionSubtype||'')));
      if(longs.some(s=>total&&s.durationMin/total>.50))flag(flags,'long_run_concentration','warning',`Week ${week.weekNumber}: long run exceeds half of weekly run minutes including brick legs; consider another easy run.`);
      if(total>180&&sessions.filter(s=>s.type==='run').length<3)flag(flags,'third_easy_run','warning',`Week ${week.weekNumber}: more than three hours running; consider a third easy standalone run rather than extending the long run or brick.`);
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
    // Strength is recommended for this goal, but the validator must not
    // invent empty exercises or open an excluded sport/day to meet a quota.
    for(const week of plan.weeklyPlan||[])if(week.sessions.filter(s=>s.type==='strength'&&s.durationMin>0).length<2)
      flag(flags,'fat_loss_strength_floor','recommendation',`Week ${week.weekNumber}: consider strength support if compatible with athlete preferences and recovery.`);
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
      return { plan, validationFlags: [], errors:['A complete generated plan is required.'], allPassed: false };
    }
    if(!plan.planMetadata||!plan.athleteProfile||!plan.arc||!plan.constraints||!plan.nutritionStrategy||!plan.hydrationStrategy||!plan.rationale||!classification||!(typeof plan.arc.startDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(plan.arc.startDate)&&!isNaN(Date.parse(plan.arc.startDate+'T00:00:00Z'))&&new Date(plan.arc.startDate+'T00:00:00Z').toISOString().slice(0,10)===plan.arc.startDate)||!Number.isInteger(plan.arc.totalWeeks)||!Array.isArray(plan.arc.phases))return {plan,validationFlags:[],errors:['Required generated-plan contract is incomplete.'],allPassed:false};
    if(!Array.isArray(plan.weeklyPlan)||!plan.weeklyPlan.length||plan.weeklyPlan.some(w=>!w||!Array.isArray(w.sessions))) return {plan,validationFlags:[],errors:['A plan needs dated training weeks and sessions.'],allPassed:false};
    if(plan.arc.totalWeeks!==plan.weeklyPlan.length||plan.weeklyPlan.some((week,index)=>week.weekNumber!==index+1))return {plan,validationFlags:[],errors:['Training week sequence does not match the arc.'],allPassed:false};
    if(new Date(plan.arc.startDate+'T00:00:00Z').getUTCDay()!==1)return {plan,validationFlags:[],errors:['Training week anchor must be Monday.'],allPassed:false};
    let nextWeek=1;
    for(const phase of plan.arc.phases) {
      if(!phase||!Number.isInteger(phase.startWeek)||phase.startWeek!==nextWeek||!Number.isInteger(phase.endWeek)||phase.endWeek<phase.startWeek||phase.endWeek>plan.arc.totalWeeks||!['pre-base','base','build','peak','taper','race-week','mesocycle'].includes(phase.phase))return {plan,validationFlags:[],errors:['Arc phase coverage is invalid.'],allPassed:false};
      nextWeek=phase.endWeek+1;
    }
    if(nextWeek!==plan.arc.totalWeeks+1)return {plan,validationFlags:[],errors:['Arc phases must cover every training week.'],allPassed:false};
    if(plan.weeklyPlan.some(week=>week.sessions.some(session=>!session||typeof session!=='object'||!Number.isInteger(session.day)||session.day<1||session.day>7||!Number.isInteger(session.durationMin)||session.durationMin<0)))return {plan,validationFlags:[],errors:['Session contract is invalid.'],allPassed:false};
    if(plan.weeklyPlan.some(week=>!plan.arc.phases.some(phase=>week.weekNumber>=phase.startWeek&&week.weekNumber<=phase.endWeek&&week.phase===phase.phase)))return {plan,validationFlags:[],errors:['Weekly phases disagree with the arc.'],allPassed:false};
    const flags = Array.isArray(plan.validationFlags) ? plan.validationFlags : [];
    // Run checks in order
    checkCalorieFloor(plan, classification, flags);
    checkProteinFloor(plan, classification, flags);
    checkVolumeIncreaseCap(plan, classification, flags);
    checkIntensityCap(plan, classification, flags);
    checkNoConsecutiveHard(plan, classification, flags);
    checkKeystoneProgression(plan,classification,flags);
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

    // Later passes insert/remove sessions; enforce numerical caps again on
    // final totals, then rebuild descriptions/details from final metadata.
    checkKeystoneProgression(plan,classification,flags);
    for(let index=0;index<plan.weeklyPlan.length;index++) {
      const current=plan.weeklyPlan[index];
      checkKeystoneProgression({weeklyPlan:plan.weeklyPlan.slice(0,index+1)},classification,flags);
      if(index)checkVolumeIncreaseCap({weeklyPlan:plan.weeklyPlan.slice(0,index+1)},classification,flags);
      // Integer rounding may change a fraction during proportional scaling.
      // Correct only this week before it becomes the next week's baseline.
    }
    if(window.SessionAssembler && window.SessionAssembler.finalizePrescriptions) window.SessionAssembler.finalizePrescriptions(plan,classification);
    checkLongRunProportion(plan,classification,flags);
    const errors=[];
    let previousWeek=null,previousHardDay=null;
    const previousKeystone=new Map();
    const cap=classification.level==='advanced'?0.15:0.10;
    for(const week of plan.weeklyPlan) {
      const active=(week.sessions||[]).filter(s=>s&&s.type!=='rest'&&s.durationMin>0);
      if(Number.isFinite(plan.arc.weeklyHoursCeiling)&&weekDuration(week)>Math.floor(plan.arc.weeklyHoursCeiling*60))errors.push('Final weekly duration exceeds the arc ceiling.');
      if(previousWeek&&!week.isDeload&&!week.isPartial&&weekDuration(previousWeek)===0&&weekDuration(week)>0)errors.push('Rebuilding from zero planned load requires a starting-load review.');
      if(new Set(active.map(s=>s.day)).size>6)errors.push('Every training week needs a true rest day.');
      if(Number.isInteger(classification.daysAvailable)&&new Set(active.map(s=>s.day)).size>classification.daysAvailable)errors.push('Final plan exceeds available training days.');
      if(Array.isArray(classification.preferredDays)&&active.some(s=>!classification.preferredDays.includes(s.day===7?0:s.day)))errors.push('Final plan uses an excluded weekday.');
      if(Array.isArray(classification.selectedSports)&&classification.selectedSports.length&&active.some(s=>!classification.selectedSports.includes(s.type)&&!(s.type==='brick'&&classification.selectedSports.includes('bike')&&classification.selectedSports.includes('run'))))errors.push('Final plan includes an unselected sport.');
      for(const session of active) {
        const expected=new Date(Date.parse(plan.arc.startDate+'T00:00:00Z')+((week.weekNumber-1)*7+session.day-1)*86400000).toISOString().slice(0,10);
        if(session.date!==expected||(plan.arc.requestedStartDate&&session.date<plan.arc.requestedStartDate))errors.push('Final session date disagrees with its weekday or start boundary.');
        const bOffsets=(plan.arc.bRaceWindows||[]).map(window=>(Date.parse(session.date+'T00:00:00Z')-Date.parse(window.raceDate+'T00:00:00Z'))/86400000);
        if(bOffsets.includes(0))errors.push('B-race day cannot contain additional training.');
        if(bOffsets.some(offset=>offset>=-3&&offset<=3)&&(session.keySession||session.strengthStress==='heavy'||!['run','bike','swim','brick'].includes(session.type)||(session.phases||[]).some(step=>!['z1','z2'].includes(step.intensity))))errors.push('Final B-race window must contain only easy endurance.');
      }
      const enduranceHard=active.filter(s=>s.keySession&&s.type!=='strength');
      const hard=active.filter(s=>s.keySession||s.strengthStress==='heavy');
      const endurance=active.filter(s=>['run','bike','swim','brick'].includes(s.type));
      const enduranceMinutes=endurance.reduce((sum,s)=>sum+s.durationMin,0);
      const intensityMinutes=endurance.reduce((sum,s)=>sum+(s.phases||[]).filter(p=>['z3','z4','z5'].includes(p.intensity)).reduce((minutes,p)=>minutes+p.duration_min,0),0);
      if(enduranceMinutes&&intensityMinutes/enduranceMinutes>(classification.goal==='speed_performance'?.30:.20)+.00001)errors.push('Final endurance intensity distribution exceeds policy.');
      if(enduranceHard.length>(INTENSITY_CAP[classification.level]||2))errors.push('Final intensity count exceeds policy.');
      for(const session of hard.slice().sort((a,b)=>a.day-b.day)) {const day=(week.weekNumber-1)*7+session.day;if(previousHardDay!==null&&day===previousHardDay+1)errors.push('Final plan has consecutive hard days.');previousHardDay=day;}
      const runs=active.filter(s=>s.type==='run'),runTotal=runs.reduce((sum,s)=>sum+s.durationMin,0);

      if(previousWeek&&!week.isPartial&&!week.isDeload&&!['taper','race-week'].includes(week.phase)&&weekDuration(previousWeek)>0&&weekDuration(week)>Math.floor(weekDuration(previousWeek)*(1+cap)))errors.push('Final weekly progression exceeds policy.');
      if(!week.isDeload&&!week.isPartial) {
        const keystones=active.filter(s=>s.priority==='long'||s.type==='brick');
        for(const session of keystones)if(previousKeystone.has(session.type)&&session.durationMin>Math.floor(previousKeystone.get(session.type)*(1+cap)))errors.push('Final keystone progression exceeds policy.');
        for(const type of new Set(keystones.map(s=>s.type)))previousKeystone.set(type,Math.max(...keystones.filter(s=>s.type===type).map(s=>s.durationMin)));
      }
      if(!week.isDeload&&!week.isPartial)previousWeek=week;
      if(!Number.isInteger(week.weekNumber)||week.weekNumber<1)errors.push('Invalid training week.');
      for(const session of week.sessions)if(!session||!['run','bike','swim','strength','brick','circuit','hiit','hyrox','yoga','cross-training','rest'].includes(session.type)||!Number.isInteger(session.day)||session.day<1||session.day>7||!Number.isInteger(session.durationMin)||session.durationMin<0||(session.type!=='rest'&&session.durationMin===0))errors.push('Invalid session day or duration.');
      for(const session of endurance) {
        const level=session.type==='swim'?classification.sportLevels?.swim:session.type==='bike'?classification.sportLevels?.cycling:session.type==='run'?classification.sportLevels?.running:null;
        const ceiling=['beginner','novice'].includes(level)?3:['advanced','competitive'].includes(level)?5:4;
        if((session.phases||[]).some(step=>Number(String(step.intensity).replace(/z/i,''))>ceiling))errors.push('Final prescription exceeds the discipline-specific zone ceiling.');
      }
      for(const session of active)if(!Array.isArray(session.phases)||session.phases.reduce((sum,step)=>sum+(step.duration_min||0),0)!==session.durationMin)errors.push('Final structured prescription disagrees with its duration.');
      for(const session of active)if(session.type==='strength'&&(!Array.isArray(session.exercises)||!session.exercises.length))errors.push('Strength prescription has no selected exercises.');
      for(const session of active)if(session.type==='brick'&&(!session.brickDetails||session.brickDetails.leg1DurationMin+session.brickDetails.leg2DurationMin!==session.durationMin))errors.push('Final brick prescription disagrees with its duration.');
      week.targetHours=Math.round(weekDuration(week)/6)/10;
      week.loadSummary={enduranceQualitySessions:enduranceHard.length,intensityMinutes,heavyStrengthSessions:active.filter(s=>s.strengthStress==='heavy').length,hardDays:new Set(hard.map(s=>s.day)).size};
    }
    const targets=plan.nutritionStrategy.dailyTargets;
    if(!(plan.nutritionStrategy.status==='insufficient_data'&&!targets&&Array.isArray(plan.nutritionStrategy.missing)&&plan.nutritionStrategy.missing.length)&&(!targets||['calories','proteinG','carbsG','fatG'].some(key=>!Number.isFinite(targets[key])||targets[key]<0)||targets.calories<=0))errors.push('Nutrition targets are incomplete or invalid.');
    if(!(plan.hydrationStrategy.status==='insufficient_data'&&plan.hydrationStrategy.dailyBaselineOz===undefined&&Array.isArray(plan.hydrationStrategy.missing)&&plan.hydrationStrategy.missing.length)&&(!Number.isFinite(plan.hydrationStrategy.dailyBaselineOz)||plan.hydrationStrategy.dailyBaselineOz<=0))errors.push('Hydration target is incomplete or invalid.');
    if(!plan.weeklyPlan.some(w=>w.sessions.some(s=>s.type!=='rest'&&s.durationMin>0)))errors.push('No usable training sessions were generated.');
    plan.validationFlags = flags;
    return {plan,validationFlags:flags,errors,allPassed:errors.length===0};
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
    _checkKeystoneProgression:checkKeystoneProgression,
    _checkProhibitedPhrases: checkProhibitedPhrases,
    _checkDisclaimer: checkDisclaimer,
    _checkFatLossStrengthFloor: checkFatLossStrengthFloor,
    _checkHyroxHourCeiling: checkHyroxHourCeiling,
    _checkRunningTaperLength: checkRunningTaperLength,
    _checkMesocycleLength: checkMesocycleLength,
    _DISCLAIMER: DISCLAIMER,
  };
})();
