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
    'half-marathon': 'Half marathon',
    'marathon': 'Marathon',
    'ultra': 'Ultra',
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
    const aRace = findARace(arc);
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

    // Deload cadence
    if (weeklyPlan && weeklyPlan.length > 4) {
      decisions.push(`Deload every ${level === 'advanced' ? '3rd' : '4th'} week (reduce volume 40-60%, hold intensity).`);
    }

    return decisions;
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

  function inferSplit(subtypes) {
    if (subtypes.has('push_day') || subtypes.has('pull_day') || subtypes.has('leg_day')) return 'Push/Pull/Legs';
    if (subtypes.has('upper_body') || subtypes.has('lower_body')) return 'Upper/Lower';
    if (subtypes.has('sport_specific')) return 'Sport-specific';
    return 'Full-body';
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
