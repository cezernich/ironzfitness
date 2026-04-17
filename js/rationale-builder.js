/**
 * IronZ Rule Engine — Chunk 3: Rationale Builder
 *
 * Builds the "Why this plan?" rationale object (summary, keyDecisions,
 * assumptions, disclaimer) and per-session rationale strings. Coaching
 * tone adapts to classification.level per TRAINING_PHILOSOPHY §14.
 */
(function () {
  'use strict';

  const DISCLAIMER = 'This plan provides general wellness guidance and is not a substitute for professional medical advice. Consult a healthcare provider before starting any new exercise or nutrition program.';

  const RACE_TYPE_LABEL = {
    'sprint-tri': 'Sprint triathlon',
    'olympic-tri': 'Olympic triathlon',
    'half-ironman': 'Half Ironman',
    'ironman': 'Ironman',
    '5k': '5K',
    '10k': '10K',
    'half-marathon': 'half marathon',
    'marathon': 'marathon',
    'ultra': 'ultra',
    'hyrox': 'Hyrox',
  };

  function raceLabel(raceType) {
    return RACE_TYPE_LABEL[raceType] || 'fitness';
  }

  function toneOpener(level) {
    if (level === 'beginner') return 'You\'ve got a';
    if (level === 'advanced') return 'This is a';
    return 'Your';
  }

  function toneCloser(level) {
    if (level === 'beginner') return ' Trust the process — consistency matters more than any single session.';
    if (level === 'advanced') return ' Self-regulate intensity from RPE and check-ins.';
    return ' Show up consistently and the plan will do its job.';
  }

  function describeWeakness(weakness) {
    if (!weakness || weakness === 'none') return null;
    if (weakness === 'swim') return 'swim is your weakest discipline';
    if (weakness === 'bike') return 'cycling is your weakest discipline';
    if (weakness === 'run') return 'running is your weakest discipline';
    return null;
  }

  function findARace(arc) {
    if (!arc || !Array.isArray(arc.races) || arc.races.length === 0) return null;
    const aRaces = arc.races.filter(r => r.priority === 'A');
    const pool = aRaces.length ? aRaces : arc.races;
    return pool[pool.length - 1];
  }

  function buildSummary(classification, arc) {
    const level = (classification && classification.level) || 'intermediate';
    const weeks = arc && arc.totalWeeks;
    const goal = classification && classification.goal;
    const planMode = arc && arc.planMode;
    const sportProfile = classification && classification.sportProfile;
    const aRace = findARace(arc);

    // Rolling mesocycle (no race) summary (Philosophy §4.9).
    if (planMode === 'rolling_mesocycle') {
      return buildMesocycleSummary(level, goal, sportProfile);
    }

    // Hyrox-specific race summary (Philosophy §9.5).
    if (sportProfile === 'hyrox' || (aRace && aRace.raceType === 'hyrox')) {
      return buildHyroxSummary(level, weeks, aRace);
    }

    // Running distance-specific race summary (Philosophy §4.5, §9.1).
    if (aRace && ['5k', '10k', 'half-marathon', 'marathon'].includes(aRace.raceType)) {
      return buildRunningDistanceSummary(level, weeks, aRace);
    }

    const weakness = classification && classification.weaknessProfile && classification.weaknessProfile.weakestDiscipline;
    const weaknessText = describeWeakness(weakness);
    const phaseCount = (arc && arc.phases && arc.phases.length) || 0;
    const deloadInterval = level === 'advanced' ? '3rd' : '4th';

    const opener = toneOpener(level);
    const possessive = opener === 'Your' ? '' : '';

    let race = aRace ? `${weeks}-week ${raceLabel(aRace.raceType)} plan` : `${weeks}-week general fitness plan`;
    if (opener !== 'Your') race = `${weeks}-week ${aRace ? raceLabel(aRace.raceType) : 'fitness'} plan`;

    let emphasis;
    if (weaknessText) {
      const anchor = weakness === 'swim' ? 'swim technique' : weakness === 'bike' ? 'cycling quality' : 'run quality';
      emphasis = ` prioritizes ${anchor} — ${weaknessText}`;
      const strongest = pickStrongest(classification);
      if (strongest) emphasis += ` — while maintaining your stronger ${strongest}`;
      emphasis += '.';
    } else {
      emphasis = ' builds an aerobic foundation first, then layers race-specific intensity.';
    }

    const structure = phaseCount
      ? ` The plan moves through ${phaseCount} phase${phaseCount === 1 ? '' : 's'} with a deload every ${deloadInterval} week.`
      : '';

    return `${opener} ${possessive}${race}${emphasis}${structure}${toneCloser(level)}`.replace(/\s+/g, ' ').trim();
  }

  function buildHyroxSummary(level, weeks, aRace) {
    const raceName = (aRace && aRace.name) || 'your Hyrox race';
    const openerByLevel = level === 'beginner' ? 'You\'ve got' : level === 'advanced' ? 'This is' : 'Your';
    return `${openerByLevel} ${weeks || 'n'}-week Hyrox build for ${raceName}. Hyrox is 50/50 running and station work, so the plan trains both independently in Base, then combines them into 1K-run + station workouts in Build and Peak — the single most race-specific session you can do. Strength shifts from heavy compounds early to muscular endurance and station simulation later.${toneCloser(level)}`.replace(/\s+/g, ' ').trim();
  }

  function buildRunningDistanceSummary(level, weeks, aRace) {
    const dist = aRace.raceType;
    const raceName = aRace.name || raceLabel(dist);
    const openerByLevel = level === 'beginner' ? 'You\'ve got' : level === 'advanced' ? 'This is' : 'Your';
    const emphasis = {
      '5k': 'VO2max intervals (1K repeats) are the primary key workout — they raise the oxygen ceiling that determines 5K pace. Taper is short (~1 week) because training load is manageable.',
      '10k': 'Threshold work — cruise intervals at mile pace + continuous tempo — drives 10K fitness. VO2max intervals are secondary. Taper is ~2 weeks.',
      'half-marathon': 'Tempo runs + marathon-pace long runs build the threshold and pacing discipline the half rewards. Taper is 2 weeks.',
      'marathon': 'The marathon-pace long run (final 8-12 miles at goal pace) is THE key workout. Midweek medium-long runs add time on feet without extra long-run stress. Taper is 3 weeks — the longest of any distance.',
    }[dist] || '';
    return `${openerByLevel} ${weeks || 'n'}-week ${raceLabel(dist)} plan for ${raceName}. ${emphasis}${toneCloser(level)}`.replace(/\s+/g, ' ').trim();
  }

  function buildMesocycleSummary(level, goal, sportProfile) {
    const toneMap = {
      speed_performance: 'focuses on threshold and VO2max — tempo runs and interval sessions drive lactate threshold improvement, which is what actually makes you faster at any distance. Strength supports power development on the side.',
      endurance:         'accumulates aerobic volume at low intensity — the long run or long ride is the key session, and it grows in length each mesocycle. Quality work stays minimal so volume can climb safely.',
      fat_loss:          'is strength-first: at least two strength sessions every week are non-negotiable, because losing weight without strength means losing muscle. Easy cardio fills the remaining days to support the deficit.',
      general_fitness:   'balances strength and cardio evenly, with variety rotating between mesocycles. Consistency matters more than any single session.',
    };
    const body = toneMap[goal] || toneMap.general_fitness;
    const opener = level === 'beginner' ? 'You\'ve got' : level === 'advanced' ? 'This is' : 'Your';
    return `${opener} 4-week rolling mesocycle: 3 progression weeks + 1 deload. This block ${body} At the end of the 4 weeks, the next mesocycle adjusts based on how the first went.${toneCloser(level)}`.replace(/\s+/g, ' ').trim();
  }

  function pickStrongest(classification) {
    const lvls = classification && classification.sportLevels;
    if (!lvls) return null;
    const rank = { novice: 0, beginner: 0, intermediate: 1, advanced: 2, competitive: 2 };
    const entries = [];
    if (lvls.swim) entries.push({ name: 'swim', r: rank[lvls.swim] ?? 1 });
    if (lvls.cycling) entries.push({ name: 'cycling', r: rank[lvls.cycling] ?? 1 });
    if (lvls.running) entries.push({ name: 'running', r: rank[lvls.running] ?? 1 });
    if (entries.length < 2) return null;
    entries.sort((a, b) => b.r - a.r);
    if (entries[0].r === entries[1].r) return null;
    return entries[0].name;
  }

  function buildKeyDecisions(classification, arc, weeklyPlan) {
    const decisions = [];
    const level = (classification && classification.level) || 'intermediate';
    const days = (classification && classification.daysAvailable) || 4;
    const goal = classification && classification.goal;
    const planMode = arc && arc.planMode;
    const sportProfile = classification && classification.sportProfile;
    const aRace = findARace(arc);

    // v1.4 — rolling mesocycle decisions (Philosophy §4.9)
    if (planMode === 'rolling_mesocycle') {
      decisions.push('Rolling 4-week mesocycle: weeks 1-3 progress volume +5-10%, week 4 deloads -40-50%.');
      if (goal === 'fat_loss') {
        decisions.push('Fat-loss strength floor: ≥ 2 strength sessions/week (non-negotiable — protects muscle during deficit).');
      } else if (goal === 'speed_performance') {
        decisions.push('Speed emphasis: 1 tempo + 1 interval session/week drives threshold and VO2max.');
      } else if (goal === 'endurance') {
        decisions.push('Endurance emphasis: long run/ride is the key session, grows ~10-15 min each mesocycle.');
      } else if (goal === 'general_fitness') {
        decisions.push('General fitness: equal weight to strength and cardio, emphasis rotates across mesocycles.');
      }
    }

    // v1.4 — Hyrox decisions (Philosophy §9.5)
    if (sportProfile === 'hyrox') {
      decisions.push('Hyrox periodization: Base 30% → Build 35% → Peak 20% → Taper 10% → Race Week 5%.');
      decisions.push('Run + station combo workout is the defining Hyrox session — trained weekly in Build and Peak.');
      decisions.push('Strength shifts across phases: heavy compounds (Base) → muscular endurance (Build) → station simulation (Peak) → light maintenance (Taper).');
    }

    // v1.4 — running distance-specific decisions (Philosophy §4.5)
    if (aRace && sportProfile === 'running') {
      const raceType = aRace.raceType;
      const keyWorkouts = {
        '5k': 'VO2max intervals (1K repeats at Z5) — primary key workout.',
        '10k': 'Cruise intervals (mile repeats at threshold) — primary key workout.',
        'half-marathon': 'Tempo runs + MP progression — primary key workouts.',
        'marathon': 'Marathon-pace long run (14-18 mi with 8-12 at Z3) — primary key workout.',
      }[raceType];
      if (keyWorkouts) decisions.push(keyWorkouts);
      const taperLen = {
        '5k': '1 week (7-10 days)',
        '10k': '2 weeks (10-14 days)',
        'half-marathon': '2 weeks',
        'marathon': '3 weeks',
      }[raceType];
      if (taperLen) decisions.push(`Taper: ${taperLen} — extra weeks redistributed to Build.`);
    }

    // Strength split
    const strengthSubtypes = collectStrengthSubtypes(weeklyPlan);
    if (strengthSubtypes.size) {
      const splitName = inferSplit(strengthSubtypes);
      decisions.push(`${splitName} strength split (${days} days available, ${level} level).`);
    }

    // Weakness bias
    const weakness = classification && classification.weaknessProfile;
    if (weakness && weakness.weakestDiscipline && weakness.weakestDiscipline !== 'none') {
      const applied = weakness.biasApplied && weakness.biasApplied !== 'none' ? weakness.biasApplied : 'technical_focus';
      decisions.push(`${capitalize(weakness.weakestDiscipline)} weakness bias: ${biasDescription(weakness.weakestDiscipline, applied)}`);
    }

    // B-race windows
    if (arc && Array.isArray(arc.bRaceWindows) && arc.bRaceWindows.length) {
      for (const w of arc.bRaceWindows) {
        decisions.push(`B-race micro-taper for ${w.raceName} (${w.raceDate}).`);
      }
    }

    // Weekly hour ceiling
    if (arc && arc.weeklyHoursCeiling) {
      const lower = Math.max(2, arc.weeklyHoursCeiling - 2);
      decisions.push(`Weekly hour ceiling: ${lower}-${arc.weeklyHoursCeiling} hours (${level}).`);
    }

    // Intensity cap
    const cap = level === 'beginner' ? 1 : level === 'advanced' ? 3 : 2;
    decisions.push(`Max ${cap} key session${cap === 1 ? '' : 's'} per week (${level} intensity cap).`);

    // Deload cadence (only meaningful for plans longer than a single mesocycle)
    if (weeklyPlan && weeklyPlan.length > 4) {
      decisions.push(`Deload every ${level === 'advanced' ? '3rd' : '4th'} week (reduce volume 40-60%, hold intensity).`);
    }

    return decisions;
  }

  function inferSplit(subtypes) {
    if (subtypes.has('push_day') || subtypes.has('pull_day') || subtypes.has('leg_day')) return 'Push/Pull/Legs';
    if (subtypes.has('upper_body') || subtypes.has('lower_body')) return 'Upper/Lower';
    if (subtypes.has('sport_specific')) return 'Sport-specific';
    if (subtypes.has('hyrox_heavy') || subtypes.has('hyrox_endurance') || subtypes.has('hyrox_maintenance')) return 'Hyrox-specific';
    return 'Full-body';
  }

  function biasDescription(discipline, applied) {
    if (discipline === 'swim') return '+1 technique/CSS session per week during Base.';
    if (discipline === 'bike') return 'upgraded one aerobic bike session to sweet-spot work.';
    if (discipline === 'run') return 'upgraded one easy run to tempo — quality over frequency.';
    return applied.replace(/_/g, ' ');
  }

  function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function collectStrengthSubtypes(weeklyPlan) {
    const set = new Set();
    if (!Array.isArray(weeklyPlan)) return set;
    for (const week of weeklyPlan) {
      if (!Array.isArray(week.sessions)) continue;
      for (const s of week.sessions) {
        if (s && s.type === 'strength' && s.sessionSubtype) set.add(s.sessionSubtype);
      }
    }
    return set;
  }

  function buildAssumptions(classification, arc) {
    const out = [];
    const thr = classification && classification.thresholds;
    const sportLevels = classification && classification.sportLevels;
    if (thr && thr.ftpWPerKg != null && sportLevels && sportLevels.cycling) {
      out.push(`FTP ${thr.ftpWPerKg} w/kg → cycling ${sportLevels.cycling}.`);
    } else if (sportLevels && sportLevels.cycling) {
      out.push(`No cycling threshold set → cycling assumed ${sportLevels.cycling}.`);
    }
    if (thr && thr.css != null && sportLevels && sportLevels.swim) {
      out.push(`CSS ${thr.css}s/100m → swim ${sportLevels.swim}.`);
    } else if (sportLevels && sportLevels.swim) {
      out.push(`No swim CSS set → swim assumed ${sportLevels.swim}.`);
    }
    if (thr && thr.runThresholdPace != null && sportLevels && sportLevels.running) {
      out.push(`Threshold ${formatPace(thr.runThresholdPace)} → running ${sportLevels.running}.`);
    } else if (sportLevels && sportLevels.running) {
      out.push(`No run threshold set → running assumed ${sportLevels.running}.`);
    }
    if (!classification || !Array.isArray(classification.equipmentProfile) || classification.equipmentProfile.length === 0) {
      out.push('No equipment profile — full gym assumed.');
    } else {
      out.push(`Equipment access: ${classification.equipmentAccess || 'configured'}.`);
    }
    if (arc && arc.weeklyHoursCeiling) {
      out.push(`Weekly hour ceiling: ${arc.weeklyHoursCeiling}h (philosophy §4.7).`);
    }
    return out;
  }

  function formatPace(minPerMile) {
    if (minPerMile == null || isNaN(minPerMile)) return '';
    const whole = Math.floor(minPerMile);
    const sec = Math.round((minPerMile - whole) * 60);
    return `${whole}:${String(sec).padStart(2, '0')}/mi`;
  }

  function build(classification, arc, weeklyPlan) {
    return {
      summary: buildSummary(classification, arc),
      keyDecisions: buildKeyDecisions(classification, arc, weeklyPlan),
      assumptions: buildAssumptions(classification, arc),
      disclaimer: DISCLAIMER,
    };
  }

  // Per-session rationale. Chunk 2 already writes a rationale during
  // enrichSession; this helper is available for future integrations that
  // need to re-derive it (e.g., after validator mutations) or for tone
  // customization by level.
  function sessionRationale(session, phase, classification) {
    if (!session) return '';
    const level = (classification && classification.level) || 'intermediate';
    if (session.type === 'rest') {
      return level === 'advanced'
        ? 'Scheduled rest — protects adaptation.'
        : 'Rest is productive, not lazy — this is when the work sticks.';
    }
    if (session.type === 'strength') {
      if (phase === 'base') return 'Base-phase strength builds general force that translates to race-day power and resilience.';
      if (phase === 'build') return 'Sport-specific strength preserves force production while endurance volume ramps.';
      return 'Maintenance strength: keep hard-earned gains without piling on fatigue.';
    }
    if (session.priority === 'long') {
      return `Long ${session.type === 'bike' ? 'ride' : session.type} builds aerobic capacity and mental durability — the backbone of race-day performance.`;
    }
    if (session.priority === 'intensity' || session.keySession) {
      return `Quality ${session.type} session — raises the ceiling of sustainable effort.`;
    }
    if (session.priority === 'brick') {
      return 'Bike-to-run brick trains the neuromuscular transition race day will demand.';
    }
    if (session.subtype === 'technique') {
      return 'Swim technique yields more return per minute than volume alone at your level.';
    }
    return 'Easy aerobic work builds fitness at low stress and supports recovery from harder days.';
  }

  window.RationaleBuilder = {
    build,
    sessionRationale,
    // exposed for tests
    _buildSummary: buildSummary,
    _buildKeyDecisions: buildKeyDecisions,
    _buildAssumptions: buildAssumptions,
    _DISCLAIMER: DISCLAIMER,
  };
})();
