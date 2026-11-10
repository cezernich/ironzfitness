// Rule Engine shared constraints for the live flat-plan adapter.
// Inspect executable quality, enforce shared recovery across calendar days,
// keep maximal testing separate from deloads, and create a real rest day.
// Demotions discard harder payloads before prescriptions are materialized.

(function () {
  "use strict";

  const HARD_LOADS = new Set(["hard", "long", "race", "test"]);

  const INTENSITY_CAPS = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
  };

  // Priority for demotion tiebreaking — lower number = more protected.
  // When we have to demote one of N adjacent hard sessions, we keep the
  // highest-priority (most important) and demote the rest.
  const KEY_SESSION_PRIORITY = {
    race: 0,           // race day — never touch
    long: 1,           // long run / long ride — keystone endurance session
    test: 1,           // threshold test
    brick: 2,          // triathlon-specific key session
    hard: 3,           // intervals / threshold / tempo
    moderate: 5,
    easy: 7,
    strides: 7,
    rest: 9,
  };

  function hasQualityZone(value,key) {
    if(value==null)return false;
    if(Array.isArray(value))return value.some(v=>hasQualityZone(v,key));
    if(typeof value==='object')return Object.keys(value).some(k=>hasQualityZone(value[k],k));
    if(!['zone','intensity','effort','targetZones','restEffort'].includes(key))return false;
    const matches=String(value).match(/Z([3-5])/gi);
    return !!matches || (key==='zone'&&Number(value)>=3);
  }
  function isQualityEntry(e) {
    if(!e||['rest','strength','weightlifting','hyroxStrength'].includes(e.discipline)||e.load==='rest')return false;
    return ['hard','moderate','race','test'].includes(e.load)||e.discipline==='race'
      || hasQualityZone(e.libraryWorkout)||hasQualityZone(e.aiSession)||hasQualityZone(e.templateWorkout);
  }
  const isRace=e=>e&&(e.discipline==='race'||e.load==='race');
  function strengthStressFor(e) {
    if(!e||!['strength','weightlifting','hyroxStrength'].includes(e.discipline))return 'none';
    if(e.strengthStress==='heavy')return 'heavy';
    const exercises=e.exercises||e.libraryWorkout?.main_set?.exercises||[];
    if(!exercises.length)return 'unconfirmed';
    return exercises.some(ex=>/squat|deadlift|bench|overhead press|barbell row|leg press|split squat/i.test(ex.name||ex.exerciseName||'')
      && !/bodyweight/i.test(String(ex.weight||ex.load||'')))?'loaded_or_unconfirmed':'light';
  }
  function materializeDemotion(entry) {
    if(entry?.prescriptionPolicy!=='easy_continuous'||entry.load!=='easy'||!(entry.duration>0))return;
    entry.templateWorkout={name:entry.sessionName,duration:entry.duration,steps:[{type:'main',duration:entry.duration,zone:2,label:'Easy continuous effort only; no intervals, surges or tests'}]};
    entry.prescriptionSource='constraint_easy';
  }
  function isHardEntry(e) {
    if(!e||e.discipline==='rest'||e.load==='rest')return false;
    return HARD_LOADS.has(e.load)||isQualityEntry(e)||['heavy','loaded_or_unconfirmed','unconfirmed'].includes(strengthStressFor(e));
  }

  // Group entries by ISO-week key (YYYY-WW). Uses Monday-start weeks so
  // the grouping matches how phases align.
  function isoWeekKey(dateStr) {
    const d = new Date(dateStr + "T00:00:00Z");
    // Move to Monday of the week
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const offset = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function groupByWeek(plan) {
    const groups = {};
    plan.forEach(e => {
      if (!e || !e.date) return;
      const k = isoWeekKey(e.date);
      if (!groups[k]) groups[k] = [];
      groups[k].push(e);
    });
    // Each group sorted by date ascending so adjacency checks work.
    Object.values(groups).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));
    return groups;
  }

  // Demote a hard entry to easy. Preserves discipline + date + raceId so
  // the calendar renderer still knows what to show. Drops the keySession
  // marker and renames to an easy variant.
  function demoteToEasy(entry, reason) {
    if(["strength","weightlifting","hyroxStrength"].includes(entry.discipline)) { demoteToRest(entry,reason); return; }
    entry.load = "easy";
    entry.prescriptionPolicy = "easy_continuous";
    // A demotion replaces the prescription, not just its label.
    delete entry.libraryWorkout;
    delete entry.aiSession;
    delete entry.templateWorkout;
    delete entry.prescriptionSource;
    entry.sessionName = 'Easy ' + (entry.discipline || 'session');
    delete entry.isThresholdTest;
    delete entry.thresholdTestType;
    entry.keySession = false;
    if (!entry._demotions) entry._demotions = [];
    entry._demotions.push(reason);
  }

  // Demote an entry all the way to rest when "easy" doesn't make sense
  // (e.g. race-day clones that shouldn't exist). Not used for the main
  // constraint pass — reserved for the rest-day backfill below.
  function demoteToRest(entry, reason) {
    delete entry.exercises;
    delete entry.isThresholdTest;
    delete entry.thresholdTestType;
    entry.strengthStress = "none";
    entry.discipline = "rest";
    entry.load = "rest";
    entry.sessionName = "Rest";
    entry.duration = 0;
    delete entry.libraryWorkout;
    delete entry.aiSession;
    delete entry.templateWorkout;
    delete entry.prescriptionSource;
    entry.keySession = false;
    if (!entry._demotions) entry._demotions = [];
    entry._demotions.push(reason);
  }

  function entryPriority(entry) {
    if (!entry) return 99;
    if (entry.discipline === "race") return KEY_SESSION_PRIORITY.race;
    return KEY_SESSION_PRIORITY[entry.load] != null ? KEY_SESSION_PRIORITY[entry.load] : 6;
  }

  // Walk a week's entries and apply the §4.3 rules. Returns the list of
  // validationFlags emitted for this week.
  function enforceAdjacency(entries,flags) {
    // Filter first: an easy double must not hide a hard session on that day.
    for(let pass=0;pass<entries.length;pass++) {
      const hard=entries.filter(isHardEntry).sort((a,b)=>a.date.localeCompare(b.date));
      let changed=false;
      for(let i=1;i<hard.length;i++) {
        const a=hard[i-1],b=hard[i];
        if((Date.parse(b.date+'T00:00:00Z')-Date.parse(a.date+'T00:00:00Z'))/86400000!==1)continue;
        if(isRace(a)&&isRace(b)) {
          if(!flags.some(f=>f.rule==='adjacent_races'&&f.date===b.date))flags.push({rule:'adjacent_races',date:b.date,action:'review_required',reason:'Consecutive race events need athlete/coach review; race events were preserved.'});
          continue;
        }
        const victim=entryPriority(a)<=entryPriority(b)?b:a;
        demoteToEasy(victim,'adjacent_hard_day');
        flags.push({rule:'no_consecutive_hard',date:victim.date,action:victim.load==='rest'?'demoted_to_rest':'demoted_to_easy',reason:'Shared recovery spacing includes quality, long sessions and heavy strength.'});
        changed=true;break;
      }
      if(!changed)break;
    }
  }
  function validateWeek(weekEntries, level) {
    const flags = [];
    const phaseCap=weekEntries.some(e=>String(e.phase).toLowerCase()==='base')?2:3;
    const cap=Math.min(INTENSITY_CAPS[level]||2,phaseCap);
    // Testing is not an exemption from shared recovery or quality limits.
    const tests=weekEntries.filter(e=>!isRace(e)&&(e.load==='test'||e.isThresholdTest));
    tests.slice(1).forEach(e=>{
      demoteToEasy(e,'one_maximal_test_per_week');
      flags.push({rule:'test_budget',date:e.date,action:'demoted_to_easy',reason:'At most one maximal test in a week; recovery weeks are independent.'});
    });
    weekEntries.forEach(e=>{if(['strength','weightlifting','hyroxStrength'].includes(e.discipline))e.strengthStress=strengthStressFor(e);});
    enforceAdjacency(weekEntries,flags);

    // ── Pass 2: intensity cap per week ──
    // After adjacency fixes, count remaining HARD sessions; demote the
    // lowest-priority ones until we're at or under cap.
    let hardEntries = weekEntries.filter(isQualityEntry);
    while (hardEntries.length > cap) {
      // Pick the LOWEST-priority hard entry to demote. Ties broken by
      // later date (protect the earlier one; earlier is usually more
      // foundational within a mesocycle).
      hardEntries.sort((a, b) => entryPriority(a) - entryPriority(b) || a.date.localeCompare(b.date));
      const candidates=hardEntries.filter(e=>!isRace(e));
      if(!candidates.length) {
        flags.push({rule:'intensity_cap',date:hardEntries[0].date,action:'review_required',reason:'Protected race events exceed the quality budget; no event was changed.'});
        break;
      }
      const victim = candidates[candidates.length - 1];
      demoteToEasy(victim, "intensity_cap_" + level);
      flags.push({
        rule: "intensity_cap",
        date: victim.date,
        action: "demoted_to_easy",
        reason: level + " athletes cap at " + cap + " intensity sessions/week — this was the lowest-priority over the line.",
      });
      hardEntries = weekEntries.filter(isQualityEntry);
    }

    // ── Pass 3: minimum 1 rest day ──
    // Count distinct calendar days in the week that have ANY session. If
    // all 7 days are used, demote the easiest non-key session to rest.
    // This pass runs after demotions above so we count final state.
    const active=weekEntries.filter(e=>e.discipline!=='rest'&&e.load!=='rest');
    const days=[...new Set(active.map(e=>e.date))];
    if(days.length===7) {
      const candidates=days.map(date=>active.filter(e=>e.date===date))
        .filter(day=>day.every(e=>!['race','test'].includes(e.load)&&e.discipline!=='race'))
        .sort((a,b)=>Math.min(...b.map(entryPriority))-Math.min(...a.map(entryPriority)));
      if(candidates.length) {
        candidates[0].forEach(e=>demoteToRest(e,'min_rest_day'));
        flags.push({rule:'rest_day_minimum',date:candidates[0][0].date,action:'demoted_to_rest',reason:'All sessions on the selected recovery day are removed, including doubles.'});
      } else flags.push({rule:'rest_day_minimum',date:days[0],action:'review_required',reason:'Protected race/test events leave no recovery day; review the calendar.'});
    }

    return flags;
  }

  // Public entry point. Runs validation across every week of the plan.
  // Returns a summary object with the fix list so callers can attach it
  // to the plan's validationFlags output (PLAN_SCHEMA §validationFlags).
  function validateAndFixPlan(plan, level) {
    if (!Array.isArray(plan) || plan.length === 0) return { flags: [], weeksChecked: 0 };
    const safeLevel = ["beginner", "intermediate", "advanced"].includes(level) ? level : "intermediate";
    const groups = groupByWeek(plan);
    let allFlags = [];
    Object.values(groups).forEach(weekEntries => {
      const flags = validateWeek(weekEntries, safeLevel);
      if (flags.length) allFlags = allFlags.concat(flags);
    });
    enforceAdjacency(plan,allFlags);
    return { flags: allFlags, unresolved: allFlags.some(f=>f.action==='review_required'), weeksChecked: Object.keys(groups).length };
  }

  if (typeof window !== "undefined") {
    window.PlanConstraintValidator = {
      validateAndFixPlan,
      isHardEntry,
      isQualityEntry,
      materializeDemotion,
      strengthStressFor,
      INTENSITY_CAPS,
      HARD_LOADS: Array.from(HARD_LOADS),
    };
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { validateAndFixPlan, isHardEntry, isQualityEntry, materializeDemotion, strengthStressFor, INTENSITY_CAPS };
  }
})();
