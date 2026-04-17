/**
 * IronZ Rule Engine — Chunk 2: Session Assembler
 *
 * Fills each week of the arc with sessions, applies global intensity
 * constraints, selects exercises for strength slots, handles deload weeks
 * and B-race micro-tapers. Consumes classification + arc from chunk 1.
 * See sources-of-truth/RULE_ENGINE_SPEC.md Steps 3–7 and
 * sources-of-truth/TRAINING_PHILOSOPHY.md §4.3, §5, §6, §7, §8, §9.
 */
(function () {
  'use strict';

  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // TRAINING_PHILOSOPHY §4.3
  const INTENSITY_CAPS = { beginner: 1, intermediate: 2, advanced: 3 };

  // TRAINING_PHILOSOPHY §8.4 — strength frequency by phase (endurance plans)
  const STRENGTH_FREQUENCY = {
    'pre-base': 2,
    base: 2,
    build: 1,
    peak: 1,
    taper: 0,
    'race-week': 0,
  };

  // TRAINING_PHILOSOPHY §8.1 — split design by strength frequency + level
  const STRENGTH_SPLIT = {
    beginner:     { 2: 'full_body', 3: 'full_body',  4: 'upper_lower', 5: 'upper_lower', 6: 'ppl' },
    intermediate: { 2: 'full_body', 3: 'upper_lower', 4: 'upper_lower', 5: 'ppl', 6: 'ppl' },
    advanced:     { 2: 'full_body', 3: 'upper_lower', 4: 'ppl', 5: 'ppl', 6: 'ppl' },
  };

  // Session distribution templates (TRAINING_PHILOSOPHY §6.1 / §6.2).
  // priority: 'long' (protected), 'intensity' (Z4+, counts vs cap), 'aerobic', 'strength', 'brick'.
  const TRIATHLON_TEMPLATES = {
    'pre-base': [
      { type: 'swim', subtype: 'technique', priority: 'aerobic' },
      { type: 'bike', subtype: 'z2_endurance', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    base: [
      { type: 'swim', subtype: 'technique', priority: 'aerobic' },
      { type: 'swim', subtype: 'endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'z2_endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'long_ride', priority: 'long' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    build: [
      { type: 'swim', subtype: 'technique', priority: 'aerobic' },
      { type: 'swim', subtype: 'css_intervals', priority: 'intensity' },
      { type: 'swim', subtype: 'endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'z2_endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'sweet_spot', priority: 'intensity' },
      { type: 'bike', subtype: 'long_ride', priority: 'long' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'tempo', priority: 'intensity' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'sport_specific', priority: 'strength' },
    ],
    peak: [
      { type: 'swim', subtype: 'technique', priority: 'aerobic' },
      { type: 'swim', subtype: 'race_pace', priority: 'intensity' },
      { type: 'swim', subtype: 'endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'z2_endurance', priority: 'aerobic' },
      { type: 'bike', subtype: 'race_pace', priority: 'intensity' },
      { type: 'bike', subtype: 'long_ride', priority: 'long' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'race_pace', priority: 'intensity' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'sport_specific', priority: 'strength' },
      { type: 'brick', subtype: 'bike_to_run', priority: 'brick' },
    ],
    taper: [
      { type: 'swim', subtype: 'technique', priority: 'aerobic' },
      { type: 'swim', subtype: 'short_race_pace', priority: 'intensity' },
      { type: 'bike', subtype: 'easy', priority: 'aerobic' },
      { type: 'bike', subtype: 'short_opener', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'short_opener', priority: 'aerobic' },
    ],
    'race-week': [
      { type: 'swim', subtype: 'openers', priority: 'aerobic' },
      { type: 'bike', subtype: 'short_with_strides', priority: 'aerobic' },
      { type: 'run', subtype: 'short_with_strides', priority: 'aerobic' },
    ],
  };

  const RUNNING_TEMPLATES = {
    'pre-base': [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    base: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
      { type: 'cross-training', subtype: 'optional', priority: 'aerobic' },
    ],
    build: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'tempo', priority: 'intensity' },
      { type: 'run', subtype: 'intervals', priority: 'intensity' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    peak: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'race_pace', priority: 'intensity' },
      { type: 'run', subtype: 'intervals', priority: 'intensity' },
      { type: 'run', subtype: 'long_run', priority: 'long' },
      { type: 'strength', subtype: 'full_body', priority: 'strength' },
    ],
    taper: [
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'easy', priority: 'aerobic' },
      { type: 'run', subtype: 'short_race_pace', priority: 'intensity' },
    ],
    'race-week': [
      { type: 'run', subtype: 'short_with_strides', priority: 'aerobic' },
      { type: 'run', subtype: 'short_opener', priority: 'aerobic' },
    ],
  };

  // Fallback templates for sport profiles that aren't pure endurance.
  // Strength-dominant and general-fitness users get strength frequency
  // from days available rather than phase.
  function buildGeneralTemplate(classification, phase) {
    const days = classification.daysAvailable || 3;
    const level = classification.level || 'intermediate';
    const freqMap = STRENGTH_SPLIT[level] || STRENGTH_SPLIT.intermediate;
    const split = freqMap[Math.max(2, Math.min(6, days))] || 'full_body';
    const strengthCount = Math.max(2, Math.min(days - 1, 5));
    const sessions = [];
    if (split === 'ppl') {
      const rotation = ['push_day', 'pull_day', 'leg_day'];
      for (let i = 0; i < strengthCount; i++) {
        sessions.push({ type: 'strength', subtype: rotation[i % 3], priority: 'strength' });
      }
    } else if (split === 'upper_lower') {
      const rotation = ['upper_body', 'lower_body'];
      for (let i = 0; i < strengthCount; i++) {
        sessions.push({ type: 'strength', subtype: rotation[i % 2], priority: 'strength' });
      }
    } else {
      for (let i = 0; i < strengthCount; i++) {
        sessions.push({ type: 'strength', subtype: 'full_body', priority: 'strength' });
      }
    }
    // Add light cardio for general fitness
    if (classification.sportProfile !== 'strength') {
      sessions.push({ type: 'cross-training', subtype: 'cardio', priority: 'aerobic' });
    }
    // During peak/taper phases, reduce one session
    if (phase === 'taper' || phase === 'race-week') {
      return sessions.slice(0, Math.max(2, sessions.length - 1));
    }
    return sessions;
  }

  // TRAINING_PHILOSOPHY §7.5 — slot templates keyed by strength subtype.
  // Each slot gets turned into an ExerciseDB.pick() call.
  const STRENGTH_SLOT_TEMPLATES = {
    push_day: [
      { role: 'main-horizontal-push', pattern: 'horizontal-push', tier: ['primary'] },
      { role: 'main-vertical-push', pattern: 'vertical-push', tier: ['primary'] },
      { role: 'secondary-horizontal-push', pattern: 'horizontal-push', tier: ['secondary'], diverseFromSlot: 0 },
      { role: 'accessory-vertical-push', pattern: 'vertical-push', tier: ['secondary', 'tertiary'], diverseFromSlot: 1 },
      { role: 'isolation-triceps', pattern: 'isolation-arms', specificGoal: 'triceps' },
    ],
    pull_day: [
      { role: 'main-horizontal-pull', pattern: 'horizontal-pull', tier: ['primary'] },
      { role: 'main-vertical-pull', pattern: 'vertical-pull', tier: ['primary'] },
      { role: 'secondary-horizontal-pull', pattern: 'horizontal-pull', tier: ['secondary'], diverseFromSlot: 0 },
      { role: 'accessory-vertical-pull', pattern: 'vertical-pull', tier: ['secondary', 'tertiary'], diverseFromSlot: 1 },
      { role: 'isolation-biceps', pattern: 'isolation-arms', specificGoal: 'biceps' },
    ],
    leg_day: [
      { role: 'main-squat', pattern: 'squat', tier: ['primary'] },
      { role: 'main-hinge', pattern: 'hinge', tier: ['primary'] },
      { role: 'secondary-squat', pattern: 'squat', tier: ['secondary'], diverseFromSlot: 0 },
      { role: 'accessory-hinge', pattern: 'hinge', tier: ['secondary', 'tertiary'], diverseFromSlot: 1 },
      { role: 'leg-isolation', pattern: 'isolation-legs', tier: ['secondary', 'tertiary'] },
    ],
    full_body: [
      { role: 'squat', pattern: 'squat', tier: ['primary'] },
      { role: 'hinge', pattern: 'hinge', tier: ['primary'] },
      { role: 'horizontal-push', pattern: 'horizontal-push', tier: ['primary', 'secondary'] },
      { role: 'horizontal-pull', pattern: 'horizontal-pull', tier: ['primary', 'secondary'] },
      { role: 'core-or-carry', pattern: ['core', 'carry'], tier: ['secondary', 'tertiary'] },
    ],
    upper_body: [
      { role: 'horizontal-push', pattern: 'horizontal-push', tier: ['primary'] },
      { role: 'vertical-push', pattern: 'vertical-push', tier: ['primary'] },
      { role: 'horizontal-pull', pattern: 'horizontal-pull', tier: ['primary'] },
      { role: 'vertical-pull', pattern: 'vertical-pull', tier: ['primary'] },
      { role: 'arms-isolation', pattern: 'isolation-arms', tier: ['secondary', 'tertiary'] },
    ],
    lower_body: [
      { role: 'squat', pattern: 'squat', tier: ['primary'] },
      { role: 'hinge', pattern: 'hinge', tier: ['primary'] },
      { role: 'leg-isolation-1', pattern: 'isolation-legs', tier: ['secondary', 'tertiary'] },
      { role: 'leg-isolation-2', pattern: 'isolation-legs', tier: ['secondary', 'tertiary'], diverseFromSlot: 2 },
    ],
    // For endurance athletes — same-day pairings (TRAINING_PHILOSOPHY §8.5)
    sport_specific: [
      { role: 'compound-1', pattern: ['squat', 'hinge', 'horizontal-push', 'horizontal-pull'], tier: ['primary'] },
      { role: 'compound-2', pattern: ['squat', 'hinge', 'horizontal-push', 'horizontal-pull'], tier: ['primary', 'secondary'], diverseFromSlot: 0 },
      { role: 'core-stability', pattern: 'core', tier: ['secondary', 'tertiary'] },
      { role: 'accessory', pattern: ['isolation-legs', 'isolation-arms'], tier: ['secondary', 'tertiary'] },
    ],
  };

  // TRAINING_PHILOSOPHY §8.2 — sets/reps/rest by tier and level
  const SETS_REPS_REST = {
    primary: {
      beginner:     { sets: 3, reps: '8-12', restSeconds: 90 },
      intermediate: { sets: 4, reps: '6-10', restSeconds: 120 },
      advanced:     { sets: 4, reps: '3-8',  restSeconds: 150 },
    },
    secondary: {
      beginner:     { sets: 3, reps: '10-12', restSeconds: 75 },
      intermediate: { sets: 3, reps: '8-12',  restSeconds: 90 },
      advanced:     { sets: 4, reps: '6-12',  restSeconds: 120 },
    },
    tertiary: {
      beginner:     { sets: 2, reps: '12-15', restSeconds: 60 },
      intermediate: { sets: 3, reps: '10-15', restSeconds: 60 },
      advanced:     { sets: 3, reps: '10-15', restSeconds: 60 },
    },
  };

  // Preferred day slots per session kind. Used by placement heuristic.
  // 1=Mon, 7=Sun. Earlier entries are preferred; later entries are fallbacks.
  const DAY_PREFS = {
    long_run: [7, 6],
    long_ride: [6, 7],
    brick: [6, 7],
    intensity_run: [2, 4],
    intensity_bike: [4, 2],
    intensity_swim: [3, 2],
    strength_primary: [1, 4],
    strength_secondary: [4, 1],
    easy_run: [5, 3, 2],
    easy_bike: [3, 5],
    easy_swim: [2, 5, 3],
    other: [1, 3, 5, 2, 4, 6, 7],
  };

  function getSessionTemplate(sportProfile, phase) {
    const map = sportProfile === 'triathlon' ? TRIATHLON_TEMPLATES
      : (sportProfile === 'endurance' || sportProfile === 'hybrid') ? RUNNING_TEMPLATES
      : null;
    if (map && map[phase]) return map[phase].map(s => ({ ...s }));
    return null;
  }

  function getWeeklyTimeBudget(weekNumber, arc, classification) {
    const ceiling = arc && arc.weeklyHoursCeiling ? arc.weeklyHoursCeiling : 10;
    const phase = getPhaseForWeek(weekNumber, arc);
    // Phase-relative scaling — base has moderate volume, taper/race-week drop
    const phaseFactor = {
      'pre-base': 0.75,
      base: 1.0,
      build: 1.0,
      peak: 0.9,
      taper: 0.55,
      'race-week': 0.35,
    }[phase] || 1.0;
    return Math.round(ceiling * phaseFactor * 60); // minutes
  }

  function getPhaseForWeek(weekNumber, arc) {
    if (!arc || !Array.isArray(arc.phases)) return 'base';
    for (const p of arc.phases) {
      if (weekNumber >= p.startWeek && weekNumber <= p.endWeek) return p.phase;
    }
    return arc.phases[arc.phases.length - 1].phase;
  }

  function isDeloadWeek(weekNumber, level, phase, totalWeeks) {
    if (totalWeeks <= 4) return false;
    if (phase === 'taper' || phase === 'race-week') return false;
    // Advanced: every 3rd week; beginner/intermediate: every 4th week.
    const interval = level === 'advanced' ? 3 : 4;
    return weekNumber > 0 && weekNumber % interval === 0;
  }

  function areAdjacentDays(dayA, dayB) {
    if (dayA == null || dayB == null) return false;
    return Math.abs(dayA - dayB) === 1;
  }

  function parseIso(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  function weekDateRange(weekNumber, arc) {
    const start = parseIso(arc.startDate);
    if (!start) return null;
    const weekStart = new Date(start.getTime() + (weekNumber - 1) * 7 * MS_PER_DAY);
    const weekEnd = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
    return { start: weekStart, end: weekEnd };
  }

  function weekOverlapsBRace(weekNumber, arc) {
    const range = weekDateRange(weekNumber, arc);
    if (!range || !Array.isArray(arc.bRaceWindows)) return null;
    for (const w of arc.bRaceWindows) {
      const taper = parseIso(w.taperStartDate);
      const recovery = parseIso(w.recoveryEndDate);
      if (!taper || !recovery) continue;
      if (range.end >= taper && range.start <= recovery) return w;
    }
    return null;
  }

  // ── Placement ────────────────────────────────────────────────────────────

  function prefFor(session) {
    const { type, subtype, priority } = session;
    if (priority === 'long') {
      if (type === 'run') return DAY_PREFS.long_run;
      if (type === 'bike') return DAY_PREFS.long_ride;
    }
    if (priority === 'brick') return DAY_PREFS.brick;
    if (priority === 'intensity') {
      if (type === 'run') return DAY_PREFS.intensity_run;
      if (type === 'bike') return DAY_PREFS.intensity_bike;
      if (type === 'swim') return DAY_PREFS.intensity_swim;
    }
    if (type === 'strength') {
      return subtype && subtype.startsWith('secondary') ? DAY_PREFS.strength_secondary : DAY_PREFS.strength_primary;
    }
    if (type === 'run') return DAY_PREFS.easy_run;
    if (type === 'bike') return DAY_PREFS.easy_bike;
    if (type === 'swim') return DAY_PREFS.easy_swim;
    return DAY_PREFS.other;
  }

  function priorityWeight(session) {
    switch (session.priority) {
      case 'long': return 100;
      case 'brick': return 90;
      case 'intensity': return 80;
      case 'strength': return 55;
      case 'aerobic': return 45;
      default: return 30;
    }
  }

  // Select training sessions from the template so that with +1 rest entry
  // (added later) the week totals `daysAvailable`. Ensures high-priority
  // (long, brick, intensity) work is kept first, then one session per
  // sport for coverage, then fill by priority.
  function trimTemplate(template, classification) {
    const days = classification.daysAvailable || 3;
    const trainingSlots = Math.max(1, days - 1);  // reserve 1 slot for rest

    const scored = template.map((s, idx) => ({ s, idx, weight: priorityWeight(s) }));
    scored.sort((a, b) => b.weight - a.weight);

    const selected = [];
    const used = new Set();

    // Pass 1 — protected sessions (long runs/rides, brick, intensity).
    for (const { s, idx, weight } of scored) {
      if (selected.length >= trainingSlots) break;
      if (weight >= 80) { selected.push(s); used.add(idx); }
    }

    // Pass 2 — sport coverage: one of each type present in the template.
    const sportsInTemplate = [...new Set(template.map(t => t.type))];
    const sportPriority = ['strength', 'run', 'bike', 'swim', 'cross-training', 'brick'];
    const orderedSports = sportPriority.filter(p => sportsInTemplate.includes(p));
    const haveTypes = new Set(selected.map(s => s.type));
    for (const sport of orderedSports) {
      if (selected.length >= trainingSlots) break;
      if (haveTypes.has(sport)) continue;
      for (const { s, idx } of scored) {
        if (used.has(idx)) continue;
        if (s.type === sport) {
          selected.push(s); used.add(idx); haveTypes.add(sport);
          break;
        }
      }
    }

    // Pass 3 — fill by priority.
    for (const { s, idx } of scored) {
      if (selected.length >= trainingSlots) break;
      if (used.has(idx)) continue;
      selected.push(s); used.add(idx);
    }

    return selected;
  }

  function assignDays(sessions, classification) {
    const occupied = new Map(); // day → session
    const placed = [];
    // Sort by priority so long runs and intensity get their preferred day first.
    const ordered = sessions.slice().sort((a, b) => priorityWeight(b) - priorityWeight(a));
    for (const s of ordered) {
      const prefs = prefFor(s);
      let assigned = null;
      for (const d of prefs) {
        if (!occupied.has(d)) { assigned = d; break; }
      }
      if (assigned == null) {
        // fallback: first empty day 1-7
        for (let d = 1; d <= 7; d++) {
          if (!occupied.has(d)) { assigned = d; break; }
        }
      }
      if (assigned == null) {
        // all 7 days full — double up on the least-loaded sport-compatible day
        assigned = prefs[0];
      }
      s.day = assigned;
      occupied.set(assigned, s);
      placed.push(s);
    }
    return placed;
  }

  // TRAINING_PHILOSOPHY §4.3 — cap Z4+ intensity sessions per week
  function applyIntensityConstraints(sessions, classification) {
    const level = classification.level || 'intermediate';
    const cap = INTENSITY_CAPS[level] || 2;
    const intensityIndices = sessions
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.priority === 'intensity')
      .map(x => x.i);

    // Demote excess intensity sessions to easy/aerobic
    if (intensityIndices.length > cap) {
      // Keep the first `cap` (prefer run intensity > bike > swim for retention)
      const keep = intensityIndices
        .slice()
        .sort((a, b) => sessionIntensityRetentionScore(sessions[b]) - sessionIntensityRetentionScore(sessions[a]))
        .slice(0, cap);
      const keepSet = new Set(keep);
      for (const idx of intensityIndices) {
        if (!keepSet.has(idx)) {
          demoteToEasy(sessions[idx]);
        }
      }
    }

    // No consecutive hard days for non-advanced
    if (level !== 'advanced') {
      enforceNoConsecutiveIntensity(sessions);
    }
    return sessions;
  }

  function sessionIntensityRetentionScore(s) {
    // Prefer keeping run tempo/intervals and bike threshold.
    if (s.type === 'run') return 3;
    if (s.type === 'bike') return 2;
    if (s.type === 'swim') return 1;
    return 0;
  }

  function demoteToEasy(session) {
    session.priority = 'aerobic';
    if (session.type === 'run') session.subtype = 'easy';
    else if (session.type === 'bike') session.subtype = 'z2_endurance';
    else if (session.type === 'swim') session.subtype = 'endurance';
  }

  function enforceNoConsecutiveIntensity(sessions) {
    // Find adjacent pairs and move the second one to a non-adjacent empty day.
    const byDay = new Map();
    sessions.forEach(s => byDay.set(s.day, s));
    const intensityDays = sessions
      .filter(s => s.priority === 'intensity')
      .map(s => s.day)
      .sort((a, b) => a - b);
    for (let i = 1; i < intensityDays.length; i++) {
      if (intensityDays[i] === intensityDays[i - 1] + 1) {
        // Move session on day intensityDays[i] to first available non-adjacent day
        const moving = byDay.get(intensityDays[i]);
        const otherIntensityDays = new Set(intensityDays.filter(d => d !== moving.day));
        for (let d = 1; d <= 7; d++) {
          if (byDay.has(d)) continue;
          const adjacent = [...otherIntensityDays].some(iD => Math.abs(iD - d) <= 1);
          if (!adjacent) {
            byDay.delete(moving.day);
            moving.day = d;
            byDay.set(d, moving);
            intensityDays[i] = d;
            intensityDays.sort((a, b) => a - b);
            break;
          }
        }
      }
    }
  }

  // ── Duration + zones + pace ──────────────────────────────────────────────

  function assignDurations(sessions, classification, arc, phase) {
    const baseMin = classification.sessionDurationMin || 60;
    const level = classification.level || 'intermediate';
    const levelFactor = level === 'beginner' ? 0.85 : level === 'advanced' ? 1.15 : 1.0;
    for (const s of sessions) {
      let d = baseMin;
      if (s.priority === 'long') d = Math.round(baseMin * 1.8);
      else if (s.priority === 'brick') d = Math.round(baseMin * 1.5);
      else if (s.priority === 'intensity') d = Math.round(baseMin * 1.0);
      else if (s.type === 'swim' && s.subtype === 'technique') d = Math.round(baseMin * 0.7);
      else if (s.type === 'strength') d = Math.round(baseMin * 0.85);
      else if (s.subtype && s.subtype.startsWith('short')) d = Math.round(baseMin * 0.5);
      else if (phase === 'race-week') d = Math.round(baseMin * 0.4);
      else if (phase === 'taper') d = Math.round(baseMin * 0.7);
      else d = Math.round(baseMin * 0.9);
      s.durationMin = Math.max(15, Math.round(d * levelFactor));
    }
    return sessions;
  }

  function enforceHourCeiling(sessions, ceilingHours) {
    if (!ceilingHours) return sessions;
    const ceilingMin = ceilingHours * 60;
    const total = sessions.reduce((a, s) => a + (s.durationMin || 0), 0);
    if (total <= ceilingMin) return sessions;
    const scale = ceilingMin / total;
    for (const s of sessions) s.durationMin = Math.max(15, Math.round(s.durationMin * scale));
    return sessions;
  }

  // ── Zones, pace, description, rationale ──────────────────────────────────

  const SUBTYPE_METADATA = {
    easy:                { zones: ['Z1', 'Z2'], keySession: false, label: 'Easy' },
    long_run:            { zones: ['Z2'], keySession: false, label: 'Long Run' },
    long_ride:           { zones: ['Z2'], keySession: false, label: 'Long Ride' },
    tempo:               { zones: ['Z4'], keySession: true,  label: 'Tempo Run' },
    intervals:           { zones: ['Z5'], keySession: true,  label: 'Interval Session' },
    race_pace:           { zones: ['Z4'], keySession: true,  label: 'Race-Pace Session' },
    short_race_pace:     { zones: ['Z4'], keySession: true,  label: 'Short Race-Pace Opener' },
    short_opener:        { zones: ['Z2'], keySession: false, label: 'Short Opener' },
    short_with_strides:  { zones: ['Z2'], keySession: false, label: 'Short Shakeout w/ Strides' },
    z2_endurance:        { zones: ['Z2'], keySession: false, label: 'Z2 Endurance' },
    sweet_spot:          { zones: ['Z3', 'Z4'], keySession: true,  label: 'Sweet Spot' },
    threshold:           { zones: ['Z4'], keySession: true,  label: 'Threshold' },
    technique:           { zones: ['Z1', 'Z2'], keySession: false, label: 'Technique Swim' },
    endurance:           { zones: ['Z2', 'Z3'], keySession: false, label: 'Endurance Swim' },
    css_intervals:       { zones: ['Z3', 'Z4'], keySession: true,  label: 'CSS Intervals' },
    openers:             { zones: ['Z2'], keySession: false, label: 'Race-Week Openers' },
    bike_to_run:         { zones: ['Z3'], keySession: true,  label: 'Brick: Bike → Run' },
    full_body:           { zones: [], keySession: false, label: 'Full-Body Strength' },
    upper_body:          { zones: [], keySession: false, label: 'Upper-Body Strength' },
    lower_body:          { zones: [], keySession: false, label: 'Lower-Body Strength' },
    push_day:            { zones: [], keySession: false, label: 'Push Day' },
    pull_day:            { zones: [], keySession: false, label: 'Pull Day' },
    leg_day:             { zones: [], keySession: false, label: 'Leg Day' },
    sport_specific:      { zones: [], keySession: false, label: 'Sport-Specific Strength' },
    optional:            { zones: ['Z2'], keySession: false, label: 'Optional Cross-Training' },
    cardio:              { zones: ['Z2'], keySession: false, label: 'Cardio Cross-Training' },
  };

  function paceToStr(minPerMile) {
    if (!minPerMile || isNaN(minPerMile)) return null;
    const whole = Math.floor(minPerMile);
    const sec = Math.round((minPerMile - whole) * 60);
    return `${whole}:${String(sec).padStart(2, '0')}/mile`;
  }

  function runPaceTarget(classification, zones) {
    const thr = classification.thresholds && classification.thresholds.runThresholdPace;
    if (!thr || !zones || !zones.length) return null;
    if (zones.includes('Z5')) return paceToStr(thr - 0.5);  // intervals: faster than threshold
    if (zones.includes('Z4')) return paceToStr(thr);
    if (zones.includes('Z3')) return paceToStr(thr + 0.5);
    return paceToStr(thr + 1.0);  // Z2: ~1 min slower than threshold
  }

  function bikePowerTarget(classification, zones) {
    const ftp = classification.thresholds && classification.thresholds.ftp;
    if (!ftp) return null;
    if (zones.includes('Z5')) return `${Math.round(ftp * 1.08)}W`;
    if (zones.includes('Z4')) return `${Math.round(ftp * 0.97)}W`;
    if (zones.includes('Z3')) return `${Math.round(ftp * 0.88)}W (sweet spot)`;
    return `${Math.round(ftp * 0.70)}W`;
  }

  function swimPaceTarget(classification, zones) {
    const css = classification.thresholds && classification.thresholds.css;
    if (!css) return null;
    if (zones.includes('Z4')) return `${Math.round(css - 3)}s/100m`;
    if (zones.includes('Z3')) return `${Math.round(css)}s/100m (CSS)`;
    return `${Math.round(css + 5)}s/100m`;
  }

  function enrichSession(session, classification, phase) {
    const meta = SUBTYPE_METADATA[session.subtype] || { zones: [], keySession: session.priority === 'intensity', label: session.subtype || session.type };
    session.sessionSubtype = session.subtype;
    session.targetZones = meta.zones.slice();
    session.keySession = meta.keySession || session.priority === 'intensity';

    let targetPace = null;
    if (session.type === 'run') targetPace = runPaceTarget(classification, session.targetZones);
    else if (session.type === 'bike') targetPace = bikePowerTarget(classification, session.targetZones);
    else if (session.type === 'swim') targetPace = swimPaceTarget(classification, session.targetZones);
    if (targetPace) session.targetPace = targetPace;

    session.warmUp = buildWarmUp(session);
    session.coolDown = buildCoolDown(session);
    session.description = buildDescription(session, classification);
    session.rationale = buildRationale(session, phase);

    if (session.type === 'swim') {
      session.swimDetails = {
        totalDistance: Math.max(800, Math.round((session.durationMin || 45) * 40)),
        intensity: session.priority === 'intensity' ? 'hard' : session.subtype === 'technique' ? 'easy' : 'moderate',
      };
    }
    if (session.type === 'brick') {
      const bikeMin = Math.round((session.durationMin || 60) * 0.7);
      const runMin = Math.max(10, (session.durationMin || 60) - bikeMin);
      session.brickDetails = { leg1Type: 'bike', leg1DurationMin: bikeMin, leg2Type: 'run', leg2DurationMin: runMin };
    }

    return session;
  }

  function buildWarmUp(s) {
    if (s.type === 'strength') return '5–10 min dynamic warm-up + 1–2 ramp-up sets per main lift';
    if (s.priority === 'intensity') return '15–20 min easy + 4×20s strides';
    if (s.priority === 'long') return '10 min easy build-up';
    return '5–10 min easy';
  }

  function buildCoolDown(s) {
    if (s.type === 'strength') return '5 min walk + static stretching';
    if (s.priority === 'intensity') return '10 min easy + stretch';
    return '5 min easy + stretch';
  }

  function buildDescription(s, classification) {
    const dur = s.durationMin;
    const meta = SUBTYPE_METADATA[s.subtype] || {};
    const label = meta.label || s.subtype || s.type;
    if (s.type === 'strength') return `${label} — see exercise list`;
    if (s.type === 'brick') return `${Math.round(dur * 0.7)} min bike @ Z3 → ${Math.max(10, dur - Math.round(dur * 0.7))} min run @ race effort`;
    if (s.priority === 'intensity' && s.type === 'run') {
      if (s.subtype === 'intervals') return `15 min warm-up, 5×1K @ Z5 w/ 2–3 min jog recovery, 10 min cool-down (${dur} min total)`;
      return `15 min warm-up, ${Math.max(15, dur - 30)} min @ threshold, 10 min cool-down`;
    }
    if (s.priority === 'intensity' && s.type === 'bike') {
      return `${Math.min(15, Math.round(dur * 0.2))} min warm-up, ${Math.max(20, Math.round(dur * 0.6))} min @ sweet-spot/threshold, easy cool-down`;
    }
    if (s.priority === 'intensity' && s.type === 'swim') {
      return `Warm-up 400m, 8–12×100m @ CSS w/ 10–15s rest, cool-down 200m`;
    }
    if (s.priority === 'long') return `Continuous ${label.toLowerCase()} at Z2 (${dur} min)`;
    if (s.type === 'swim' && s.subtype === 'technique') return 'Drill-focused swim: 400m warm-up, 8×50m drill/swim, 400m easy';
    return `${label}, ${dur} min`;
  }

  function buildRationale(s, phase) {
    if (s.type === 'strength') {
      if (phase === 'base') return 'Base-phase strength builds general strength that translates to race-day power and injury resilience.';
      if (phase === 'build') return 'Sport-specific strength maintains force production while cardio volume ramps.';
      return 'Maintenance strength: keep gains without adding fatigue.';
    }
    if (s.priority === 'long') return `Long ${s.type === 'bike' ? 'ride' : s.type} builds aerobic capacity and mental endurance — the backbone of race-day performance.`;
    if (s.priority === 'intensity') return `Quality ${s.type} workout raises the ceiling of sustainable effort — essential for race-specific fitness.`;
    if (s.priority === 'brick') return 'Bike-to-run brick trains the neuromuscular transition your race will demand.';
    if (s.subtype === 'technique') return 'Swim technique yields more return per minute than volume alone at your level.';
    return 'Easy aerobic work builds fitness at low stress and aids recovery.';
  }

  // ── Exercise selection ───────────────────────────────────────────────────

  function isExerciseDbAvailable() {
    return typeof window !== 'undefined' && window.ExerciseDB && typeof window.ExerciseDB.pick === 'function';
  }

  function pickSlot(slot, userEquip, picked) {
    if (!isExerciseDbAvailable()) return null;
    const filters = {
      pattern: slot.pattern,
      tier: slot.tier,
      equipment: userEquip && userEquip.length ? userEquip : undefined,
      excludeIds: picked.map(p => p.id),
    };
    if (slot.specificGoal) filters.specificGoal = slot.specificGoal;
    const opts = {};
    if (slot.diverseFromSlot != null && picked[slot.diverseFromSlot]) {
      opts.diverseFrom = [picked[slot.diverseFromSlot]];
    }
    let result = window.ExerciseDB.pick(filters, 1, opts);
    if (!result || !result.length) {
      // Relax tier constraint if nothing matched
      const relaxed = { ...filters, tier: undefined };
      result = window.ExerciseDB.pick(relaxed, 1, opts);
    }
    if (!result || !result.length) {
      // Relax equipment (last resort)
      const relaxed = { ...filters, tier: undefined, equipment: undefined };
      result = window.ExerciseDB.pick(relaxed, 1, opts);
    }
    return result && result.length ? result[0] : null;
  }

  function assignSetsRepsRest(exercise, tier, level) {
    const tierKey = SETS_REPS_REST[tier] ? tier : 'secondary';
    const levelKey = SETS_REPS_REST[tierKey][level] ? level : 'intermediate';
    return { ...SETS_REPS_REST[tierKey][levelKey] };
  }

  function trimExerciseSlots(slots, classification) {
    const level = classification.level || 'intermediate';
    const cap = level === 'beginner' ? 5 : level === 'intermediate' ? 7 : 8;
    return slots.slice(0, cap);
  }

  function selectExercisesForSession(session, classification) {
    if (session.type !== 'strength' && session.type !== 'circuit' && session.type !== 'hiit') {
      return session;
    }
    const subtype = session.subtype || 'full_body';
    const template = STRENGTH_SLOT_TEMPLATES[subtype] || STRENGTH_SLOT_TEMPLATES.full_body;
    const slots = trimExerciseSlots(template, classification);
    const userEquip = Array.isArray(classification.equipmentProfile) ? classification.equipmentProfile : [];

    const picked = [];
    const exercises = [];
    for (const slot of slots) {
      const ex = pickSlot(slot, userEquip, picked);
      if (!ex) continue;
      picked.push(ex);
      const tier = ex.tier || (Array.isArray(slot.tier) ? slot.tier[0] : slot.tier) || 'secondary';
      const volume = assignSetsRepsRest(ex, tier, classification.level || 'intermediate');
      exercises.push({
        exerciseId: ex.id,
        exerciseName: ex.name,
        slotRole: slot.role,
        sets: volume.sets,
        reps: volume.reps,
        restSeconds: volume.restSeconds,
        usesWeights: !!ex.usesWeights,
        notes: null,
      });
    }
    session.exercises = exercises;
    return session;
  }

  // ── Deload + B-race micro-taper ──────────────────────────────────────────

  function applyDeloadModifier(sessions) {
    // Reduce volume 40–60%, maintain intensity (TRAINING_PHILOSOPHY §12.3).
    for (const s of sessions) {
      if (s.type === 'rest') continue;
      s.durationMin = Math.max(15, Math.round((s.durationMin || 30) * 0.55));
      if (s.type === 'strength' && Array.isArray(s.exercises)) {
        s.exercises = s.exercises.map(e => ({ ...e, sets: Math.max(1, e.sets - 1) }));
      }
    }
    return sessions;
  }

  function applyBRaceMicroTaper(sessions, weekNumber, arc) {
    const window = weekOverlapsBRace(weekNumber, arc);
    if (!window) return sessions;
    const raceDate = parseIso(window.raceDate);
    if (!raceDate) return sessions;
    const weekRange = weekDateRange(weekNumber, arc);
    if (!weekRange) return sessions;
    // For each session, compute its date
    for (const s of sessions) {
      if (s.type === 'rest') continue;
      const day = s.day || 1;
      const sessDate = new Date(weekRange.start.getTime() + (day - 1) * MS_PER_DAY);
      const diffDays = Math.round((sessDate - raceDate) / MS_PER_DAY);
      if (diffDays >= -3 && diffDays < 0) {
        // Pre-race taper: 3 days before race
        if (s.type === 'run') {
          s.durationMin = Math.max(15, Math.round((s.durationMin || 30) * 0.7));
          if (s.priority === 'long') {
            s.priority = 'aerobic';
            s.subtype = 'easy';
            s.keySession = false;
          }
        } else {
          s.durationMin = Math.max(15, Math.round((s.durationMin || 30) * 0.8));
        }
        s.rationale = (s.rationale || '') + ' (B-race micro-taper: volume reduced).';
      } else if (diffDays >= 0 && diffDays <= 3) {
        // Post-race recovery: easy only
        s.priority = 'aerobic';
        if (s.type === 'run') s.subtype = 'easy';
        else if (s.type === 'bike') s.subtype = 'z2_endurance';
        else if (s.type === 'swim') s.subtype = 'technique';
        s.keySession = false;
        s.targetZones = ['Z1', 'Z2'];
        s.durationMin = Math.max(15, Math.round((s.durationMin || 30) * 0.6));
        s.rationale = 'Post-B-race recovery: easy session only.';
      }
    }
    return sessions;
  }

  // ── Weakness bias (TRAINING_PHILOSOPHY §9.0) ─────────────────────────────

  function applyWeaknessBias(weeklyPlan, classification) {
    const weakest = classification.weaknessProfile && classification.weaknessProfile.weakestDiscipline;
    if (!weakest || weakest === 'none') return;
    let applied = 'none';

    // Run weakness: upgrade quality, never add frequency.
    if (weakest === 'run') {
      for (const week of weeklyPlan) {
        if (week.phase !== 'base') continue;
        const easyRun = week.sessions.find(s => s.type === 'run' && s.priority === 'aerobic' && s.subtype === 'easy');
        if (easyRun) {
          easyRun.subtype = 'tempo';
          easyRun.priority = 'intensity';
          easyRun.keySession = true;
          easyRun.targetZones = ['Z4'];
          easyRun.sessionSubtype = 'tempo';
          easyRun.rationale = 'Weakness bias: upgraded easy run to tempo — we raise run quality rather than frequency.';
          applied = 'upgraded_session';
          break;
        }
      }
    } else if (weakest === 'swim' || weakest === 'bike') {
      // Try adding a technical/quality session to one base week
      for (const week of weeklyPlan) {
        if (week.phase !== 'base') continue;
        const target = week.sessions.find(s => s.type === weakest && s.priority === 'aerobic');
        if (target) {
          if (weakest === 'swim') {
            target.subtype = 'css_intervals';
            target.priority = 'intensity';
            target.keySession = true;
            target.targetZones = ['Z3', 'Z4'];
            target.sessionSubtype = 'css_intervals';
          } else {
            target.subtype = 'sweet_spot';
            target.priority = 'intensity';
            target.keySession = true;
            target.targetZones = ['Z3', 'Z4'];
            target.sessionSubtype = 'sweet_spot';
          }
          target.rationale = `Weakness bias: upgraded ${weakest} session to quality work.`;
          applied = 'upgraded_session';
          break;
        }
      }
    }

    if (classification.weaknessProfile) {
      classification.weaknessProfile.biasApplied = applied;
    }
  }

  // ── Main entry point ─────────────────────────────────────────────────────

  function insertKeySessions(week, phase, classification) {
    const template = getSessionTemplate(classification.sportProfile, phase)
      || buildGeneralTemplate(classification, phase);
    const trimmed = trimTemplate(template, classification);
    return trimmed;
  }

  function fillAerobicVolume(week, sessions, classification, arc) {
    // Aerobic fill happens as part of trimTemplate (lower-priority items
    // come from the template itself). This hook is exposed for
    // spec-completeness but does not mutate sessions here — rest days
    // are added later in assembleWeeklyPlan.
    return sessions;
  }

  function addRestDays(sessions) {
    const occupied = new Set(sessions.map(s => s.day));
    // At least one explicit rest entry (TRAINING_PHILOSOPHY §13 — min 1 rest day)
    for (let d = 5; d <= 7; d++) {
      if (!occupied.has(d)) {
        sessions.push({
          day: d,
          type: 'rest',
          sessionSubtype: 'rest',
          durationMin: 0,
          keySession: false,
          targetZones: [],
          description: 'Full rest day — recovery is productive, not lazy.',
          rationale: 'Rest day enables adaptation and protects against overtraining.',
        });
        return sessions;
      }
    }
    // No empty slot in 5–7; check 1–4
    for (let d = 1; d <= 4; d++) {
      if (!occupied.has(d)) {
        sessions.push({
          day: d,
          type: 'rest',
          sessionSubtype: 'rest',
          durationMin: 0,
          keySession: false,
          targetZones: [],
          description: 'Full rest day — recovery is productive, not lazy.',
          rationale: 'Rest day enables adaptation and protects against overtraining.',
        });
        return sessions;
      }
    }
    return sessions;
  }

  function assembleWeek(weekNumber, arc, classification) {
    const phase = getPhaseForWeek(weekNumber, arc);
    const isDeload = isDeloadWeek(weekNumber, classification.level, phase, arc.totalWeeks);
    const week = { weekNumber, phase, isDeload };

    let sessions = insertKeySessions(week, phase, classification);
    sessions = assignDays(sessions, classification);
    sessions = applyIntensityConstraints(sessions, classification);
    sessions = assignDurations(sessions, classification, arc, phase);
    sessions = enforceHourCeiling(sessions, arc.weeklyHoursCeiling);
    sessions = sessions.map(s => enrichSession(s, classification, phase));
    sessions = sessions.map(s => selectExercisesForSession(s, classification));
    if (isDeload) sessions = applyDeloadModifier(sessions);
    sessions = applyBRaceMicroTaper(sessions, weekNumber, arc);
    sessions = addRestDays(sessions);
    sessions.sort((a, b) => a.day - b.day);

    week.sessions = sessions;
    week.targetHours = Math.round(sessions.reduce((acc, s) => acc + (s.durationMin || 0), 0) / 6) / 10;
    return week;
  }

  function assembleWeeklyPlan(classification, arc) {
    if (!classification) throw new Error('SessionAssembler.assembleWeeklyPlan: classification is required');
    if (!arc || !arc.totalWeeks) throw new Error('SessionAssembler.assembleWeeklyPlan: arc with totalWeeks is required');
    const plan = [];
    for (let w = 1; w <= arc.totalWeeks; w++) {
      plan.push(assembleWeek(w, arc, classification));
    }
    applyWeaknessBias(plan, classification);
    return plan;
  }

  window.SessionAssembler = {
    assembleWeeklyPlan,
    getWeeklyTimeBudget,
    insertKeySessions,
    applyIntensityConstraints,
    fillAerobicVolume,
    selectExercisesForSession,
    assignSetsRepsRest,
    getSessionTemplate,
    areAdjacentDays,
    applyDeloadModifier,
    // extras exposed for testing / introspection
    getPhaseForWeek,
    isDeloadWeek,
    applyBRaceMicroTaper,
    applyWeaknessBias,
  };
})();
