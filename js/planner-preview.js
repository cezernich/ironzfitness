/* Preview-only Rule Engine entry point. No profile reads, storage, network or clock.
 * Contract and provisional policy: master spec Appendix G.
 * Deliberately not loaded by index.html. Can run unchanged under Node or a browser.
 */
(function (root) {
  'use strict';
  const VERSION = 'preview-0.1';
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const SPORTS = ['swim', 'bike', 'run', 'strength'];
  const DEFAULT_RULES = Object.freeze({ ftpMultiplier: 0.95, longGrowth: 0.05,
    bikeEasyLow: 0.60, bikeEasyHigh: 0.68, bikeQuality: 0.90 });
  function number(value, name, min, max, optional) {
    if (optional && (value === '' || value == null)) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(name + ' must be a number between ' + min + ' and ' + max + '.');
    }
    return value;
  }
  function normalize(athlete, draft) {
    if (!athlete || typeof athlete !== 'object') throw new Error('An athlete is required.');
    const a = structuredClone(athlete);
    if (draft != null && (typeof draft !== 'object' || Array.isArray(draft))) throw new Error('Draft rules must be an object.');
    Object.keys(draft || {}).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_RULES, key)) throw new Error('Unknown rule: ' + key);
    });
    const r = Object.assign({}, DEFAULT_RULES, draft);
    number(r.ftpMultiplier, 'FTP multiplier', 0.85, 1);
    number(r.longGrowth, 'Long-session growth', 0, 0.05);
    number(r.bikeEasyLow, 'Easy bike lower fraction', 0.50, 0.70);
    number(r.bikeEasyHigh, 'Easy bike upper fraction', 0.55, 0.75);
    number(r.bikeQuality, 'Bike quality fraction', 0.80, 0.95);
    if (r.bikeEasyLow > r.bikeEasyHigh) throw new Error('Easy bike lower fraction exceeds upper fraction.');
    if (!['base', 'build', 'recovery', 'taper'].includes(a.phase)) throw new Error('Choose a supported phase.');
    number(a.weeksToRace, 'Weeks to race', 1, 104);
    if (!['normal', 'lighter', 'pause'].includes(a.recovery)) throw new Error('Choose a recovery state.');
    if (!Array.isArray(a.excludedSports) || a.excludedSports.some(s => !SPORTS.includes(s))) throw new Error('Invalid activity exclusions.');
    if (!Array.isArray(a.availability) || a.availability.length !== 7) throw new Error('Provide seven daily availability limits.');
    a.availability.forEach((v, i) => number(v, DAYS[i] + ' availability', 0, 720));
    if (!a.recent || typeof a.recent !== 'object') throw new Error('Provide recent weekly minutes by sport.');
    SPORTS.forEach(s => number(a.recent[s], 'Recent ' + s + ' minutes', 0, 1800));
    ['longBike', 'longRun', 'qualityMinutes'].forEach(k => number(a[k], k, 0, 720));
    a.strengthSessions = a.strengthSessions == null ? 1 : number(a.strengthSessions, 'Strength sessions', 0, 2);
    if (!Number.isInteger(a.strengthSessions)) throw new Error('Strength sessions must be a whole number.');
    if (a.longBike > a.recent.bike || a.longRun > a.recent.run || a.qualityMinutes > a.recent.bike) throw new Error('Session history cannot exceed its weekly sport minutes.');
    ['swim400', 'swim200', 'bike20', 'run5k', 'outdoorSpeed', 'sustainedRunPace'].forEach(k => {
      a[k] = number(a[k], k, 0.01, 10000, true);
    });
    if ((a.swim400 == null) !== (a.swim200 == null)) throw new Error('Enter both swim tests or leave both blank.');
    if (a.swim400 != null && (a.swim400 <= a.swim200 * 2 || (a.swim400 - a.swim200) / 2 > 600)) {
      throw new Error('Check swim times in seconds: 400 m should take more than twice the 200 m time.');
    }
    return { a, r };
  }
  function targets(a, r) {
    return { css: a.swim400 == null ? null : (a.swim400 - a.swim200) / 2,
      ftp: a.bike20 == null ? null : Math.round(a.bike20 * r.ftpMultiplier),
      fiveKSecondsPerKm: a.run5k == null ? null : a.run5k / 5 };
  }
  function demands(a, fitness) {
    // Explicit sensitivity assumptions, not validated prediction intervals.
    const swim = fitness.css == null ? null : [(fitness.css + 5) * 38 / 60, (fitness.css + 15) * 38 / 60];
    const bike = a.outdoorSpeed == null ? null : [180 / (a.outdoorSpeed * 1.05) * 60, 180 / (a.outdoorSpeed * 0.95) * 60];
    const run = a.sustainedRunPace == null ? null : [42.2 * a.sustainedRunPace / 60, 42.2 * a.sustainedRunPace * 1.10 / 60];
    return { swim, bike, run, total: swim && bike && run ? [swim[0] + bike[0] + run[0] + 12, swim[1] + bike[1] + run[1] + 18] : null,
      label: 'Exploratory full-distance scenarios, not a Wisconsin course prediction. No future fitness gain assumed.',
      assumptions: ['3,800 m / 180 km / 42.2 km; transitions 12–18 min.',
        'Swim: CSS +5 to +15 sec/100 m; open-water effects are not modelled.',
        'Bike: supplied comparable outdoor speed ±5%; no FTP-to-speed conversion.',
        'Run: supplied sustained triathlon run pace through 10% slower; 5K alone is not used.'] };
  }
  function prescription(sport, kind, minutes, fitness, r, qualityMinutes) {
    const easy = 'Conversational effort; slow down as needed.';
    let blocks = [];
    if (sport === 'strength') {
      blocks = [{ minutes, instruction: 'Familiar bodyweight maintenance only: squat, hip hinge, incline push-up, row only if equipment is available, and calf raise. Up to 2 sets of 6–10 each, 60–90 sec rest, leave 3 reps in reserve. Skip unfamiliar movements; stop when time is up.' }];
    } else if (sport === 'bike' && kind === 'quality') {
      const work = Math.floor(Math.min(qualityMinutes, 24, minutes - 20) / 3) * 3;
      const rep = work / 3;
      blocks = [{ minutes: 10, instruction: 'Easy warm-up.' },
        { minutes: work + 6, instruction: '3 × ' + rep + ' min at ' + (fitness.ftp ? Math.round(fitness.ftp * r.bikeQuality) + ' W' : 'controlled comfortably hard effort') + ', with 3 min easy between repetitions (2 recoveries).' },
        { minutes: minutes - work - 16, instruction: 'Easy cool-down.' }];
    } else if (sport === 'swim') {
      const warm = Math.min(5, Math.floor(minutes / 4));
      const main = minutes - warm * 2;
      blocks = [{ minutes: warm, instruction: 'Easy warm-up.' },
        { minutes: main, instruction: 'Repeat 100 m relaxed, then rest 20 sec; finish the block with easy swimming. ' +
          (fitness.css ? 'Guide: ' + Math.round(fitness.css + 10) + '–' + Math.round(fitness.css + 15) + ' sec/100 m; effort takes priority.' : easy) },
        { minutes: warm, instruction: 'Easy cool-down.' }];
    } else {
      blocks = [{ minutes, instruction: sport === 'bike' && fitness.ftp ?
        Math.round(fitness.ftp * r.bikeEasyLow) + '–' + Math.round(fitness.ftp * r.bikeEasyHigh) + ' W. ' + easy : easy }];
    }
    return { sport, kind, minutes, blocks, rationale: kind === 'long' ? 'Bounded by successful comparable long-session history, sport budget and daily availability.' :
      kind === 'quality' ? 'Work minutes are bounded by supplied history. Prior interval structure and intensity are not verified in this preview.' : 'Fits the remaining recent sport budget and available time.' };
  }
  function generate(athlete, draft) {
    const { a, r } = normalize(athlete, draft);
    const fitness = targets(a, r);
    const warnings = [];
    const days = DAYS.map((day, i) => ({ day, available: a.availability[i], sessions: [] }));
    let phase = a.phase;
    if (a.weeksToRace <= 3 && !['taper', 'recovery'].includes(phase)) {
      phase = 'taper'; warnings.push('Within three weeks of the event: taper reduction applied; build work is disabled.');
    }
    const factor = a.recovery === 'pause' ? 0 : phase === 'taper' ? 0.60 : phase === 'recovery' || a.recovery === 'lighter' ? 0.70 : 1;
    const budgets = Object.fromEntries(SPORTS.map(s => [s, a.excludedSports.includes(s) ? 0 : Math.floor(a.recent[s] * factor)]));
    const remaining = Object.assign({}, budgets);
    const minimum = { swim: 20, bike: 25, run: 15, strength: 20 };
    const used = day => day.sessions.reduce((sum, s) => sum + s.minutes, 0);
    // Preserve a full rest day, choosing the smallest availability (Monday wins ties).
    const rest = a.availability.indexOf(Math.min(...a.availability));
    function place(dayIndex, sport, kind, wanted) {
      const day = days[dayIndex];
      if (dayIndex === rest || day.sessions.length >= 2 || day.sessions.some(s => s.sport === sport)) return false;
      const minutes = Math.floor(Math.min(wanted, remaining[sport], day.available - used(day)));
      if (minutes < minimum[sport]) return false;
      const session = prescription(sport, kind, minutes, fitness, r, a.qualityMinutes);
      if (kind === 'long') session.rationale = 'Successful history: ' + (sport === 'bike' ? a.longBike : a.longRun) +
        ' min. Requested after phase and progression rules: ' + wanted + ' min. Allocated: ' + minutes +
        ' min after sport budget and daily time limits.';
      day.sessions.push(session);
      remaining[sport] -= minutes;
      return true;
    }
    function order(preferred) { return [preferred].concat(DAYS.map((_, i) => i).filter(i => i !== preferred)); }
    // Jointly choose long-session days: at least two calendar days apart.
    const hasBike = a.longBike >= minimum.bike && budgets.bike >= minimum.bike;
    const hasRun = a.longRun >= minimum.run && budgets.run >= minimum.run;
    const growth = factor < 1 ? 0 : r.longGrowth;
    const wantedBike = Math.floor(a.longBike * factor * (1 + growth));
    // Progress one long-session dimension only: run holds while bike grows.
    const wantedRun = Math.floor(a.longRun * factor * (1 + (hasBike ? 0 : growth)));
    const pairs = [];
    const bikeOptions = hasBike ? order(5).filter(i => i !== rest) : [-1];
    const runOptions = hasRun ? order(3).filter(i => i !== rest) : [-1];
    bikeOptions.forEach(b => runOptions.forEach(u => {
      if (b >= 0 && u >= 0 && Math.abs(b - u) < 2) return;
      const bm = b < 0 ? 0 : Math.min(wantedBike, budgets.bike, a.availability[b]);
      const rm = u < 0 ? 0 : Math.min(wantedRun, budgets.run, a.availability[u]);
      if ((b >= 0 && bm < minimum.bike) || (u >= 0 && rm < minimum.run)) return;
      pairs.push({ b, u, score: bm + rm - (b === 5 ? 0 : 1) - (u === 3 ? 0 : 1) });
    }));
    pairs.sort((x, y) => y.score - x.score);
    if (pairs.length) {
      const p = pairs[0];
      if (p.b >= 0) place(p.b, 'bike', 'long', wantedBike);
      if (p.u >= 0) place(p.u, 'run', 'long', wantedRun);
    } else if (hasBike || hasRun) warnings.push('No feasible separated long-session pair: long sessions omitted. Change availability or review priorities.');
    if (hasBike && factor === 1 && phase === 'build' && a.qualityMinutes >= 12 && !a.excludedSports.includes('bike')) {
      const day = order(1).find(i => i !== rest && remaining.bike >= 45 && a.availability[i] - used(days[i]) >= 45 &&
        days[i].sessions.length < 2 && !days[i].sessions.length &&
        !days.some((d, j) => Math.abs(i - j) <= 1 && d.sessions.some(s => s.kind === 'long')));
      if (day != null) place(day, 'bike', 'quality', 60);
    }
    // Round-robin sport fills, deterministic day preferences, at most two per day.
    const preferences = { swim: [1, 3, 6, 4, 2, 5, 0], bike: [4, 1, 6, 3, 2, 5, 0], run: [4, 6, 1, 3, 2, 5, 0], strength: [3, 6, 1, 4, 2, 5, 0] };
    // Reserve explicitly requested maintenance strength before easy fillers.
    for (let n = 0; n < a.strengthSessions; n++) {
      const candidate = preferences.strength.find(i => i !== rest && days[i].sessions.length < 2 &&
        !days[i].sessions.some(s => s.sport === 'strength') && a.availability[i] - used(days[i]) >= minimum.strength &&
        !days.some((d, j) => (j === i || j === i + 1) && d.sessions.some(s => s.kind === 'long')));
      if (candidate != null) place(candidate, 'strength', 'maintenance', Math.min(45, Math.ceil(remaining.strength / (a.strengthSessions - n))));
    }
    for (let pass = 0; pass < 3; pass++) {
      SPORTS.forEach(sport => {
        if (sport === 'strength') return;
        if (sport === 'bike' && !hasBike || sport === 'run' && !hasRun) return;
        const candidate = preferences[sport].find(i => i !== rest && days[i].sessions.length < 2 &&
          !days[i].sessions.some(s => s.sport === sport) &&
          a.availability[i] - used(days[i]) >= minimum[sport] &&
          !(sport === 'strength' && days.some((d, j) => (j === i || j === i + 1) && d.sessions.some(s => s.kind === 'long'))) &&
          !(sport === 'run' && days[i].sessions.some(s => s.sport === 'bike' && ['quality', 'long'].includes(s.kind))));
        if (candidate != null) place(candidate, sport, 'easy', Math.min(sport === 'strength' ? 35 : 50,
          sport === 'run' ? Math.min(a.longRun * factor, 50) : 50));
      });
    }
    SPORTS.forEach(s => { if (remaining[s] > 0) warnings.push(remaining[s] + ' ' + s + ' min left unallocated; time is not compressed to fill the budget.'); });
    if (!hasBike && budgets.bike) warnings.push('Bike session-duration history missing: bike prescriptions withheld.');
    if (!hasRun && budgets.run) warnings.push('Run session-duration history missing: run prescriptions withheld.');
    if (a.recovery === 'pause') warnings.push('Training paused: no sessions prescribed.');
    if (a.excludedSports.length) warnings.push('Excluded activities are omitted; no automatic injury substitution.');
    warnings.push('One-week preview only. Phase is explicit; no automatic multiweek arc, clinical return plan, nutrition or hydration prescription.');
    warnings.push('Race scenarios do not yet determine workout doses. Current training history governs this first preview.');
    const totals = Object.fromEntries(SPORTS.map(s => [s, budgets[s] - remaining[s]]));
    const checks = [];
    days.forEach((d, i) => {
      if (used(d) > d.available || d.sessions.length > 2) checks.push('Daily limit violated: ' + d.day);
      d.sessions.forEach(s => {
        if (a.excludedSports.includes(s.sport)) checks.push('Excluded activity prescribed.');
        if (s.blocks.reduce((sum, b) => sum + b.minutes, 0) !== s.minutes) checks.push('Workout block minutes do not reconcile.');
      });
    });
    SPORTS.forEach(s => { if (totals[s] > budgets[s]) checks.push('Sport budget exceeded: ' + s); });
    if (checks.length) throw new Error(checks.join(' '));
    return { metadata: { engineVersion: VERSION, rulebookVersion: 'draft-preview-0.1', mode: 'preview-only' },
      inputs: a, rules: r, phase, fitness, raceScenarios: demands(a, fitness), days, totals,
      totalMinutes: Object.values(totals).reduce((sum, v) => sum + v, 0), budgets, warnings,
      decisions: ['Recent minutes bound each sport independently; unused availability is not a training target.',
        'One full rest day and at most two sessions per day.',
        'Long bike and run placed jointly, two calendar days apart; run holds while bike duration progresses.',
        'Quality work requires demonstrated quality minutes and build phase; no wearable-based increase.',
        'Draft rules and athlete inputs are included for reproducibility.'],
      validation: { passed: true, checks: ['Daily availability', 'Sport budgets', 'Activity exclusions', 'Workout arithmetic'] } };
  }
  const presets = [
    { name: 'Alex — experienced', recent: { swim: 135, bike: 355, run: 200, strength: 30 }, longBike: 240, longRun: 100, qualityMinutes: 24,
      swim400: 440, swim200: 210, bike20: 240, run5k: 1500, outdoorSpeed: 26, sustainedRunPace: 405, availability: [0, 120, 120, 100, 100, 300, 100] },
    { name: 'Blake — same tests, less endurance', recent: { swim: 95, bike: 200, run: 110, strength: 25 }, longBike: 120, longRun: 40, qualityMinutes: 0,
      swim400: 440, swim200: 210, bike20: 240, run5k: 1500, outdoorSpeed: 24, sustainedRunPace: null, availability: [0, 75, 45, 60, 60, 150, 90] },
    { name: 'Casey — cycling and lifting', strengthSessions: 2, recent: { swim: 110, bike: 275, run: 90, strength: 75 }, longBike: 180, longRun: 55, qualityMinutes: 24,
      swim400: 520, swim200: 250, bike20: 300, run5k: 1440, outdoorSpeed: 27, sustainedRunPace: null, availability: [0, 100, 60, 100, 70, 200, 70] },
    { name: 'Drew — experienced and faster', recent: { swim: 170, bike: 450, run: 245, strength: 35 }, longBike: 300, longRun: 120, qualityMinutes: 36,
      swim400: 370, swim200: 180, bike20: 320, run5k: 1140, outdoorSpeed: 31, sustainedRunPace: 315, availability: [0, 140, 140, 110, 120, 360, 120] }
  ].map(a => Object.assign({ phase: 'build', weeksToRace: 20, recovery: 'normal', excludedSports: [] }, a));
  const api = Object.freeze({ generate, defaults: DEFAULT_RULES, presets, version: VERSION });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.PlanGenerator = root.PlanGenerator || {}; root.PlanGenerator.generatePreview = generate; root.PlannerPreview = api; }
})(typeof window === 'undefined' ? null : window);
