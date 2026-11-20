/* Isolated preview UI: no DB, localStorage, analytics or production app scripts. */
(function () {
  'use strict';
  const api = window.PlannerPreview;
  const $ = id => document.getElementById(id);
  const sports = ['swim', 'bike', 'run', 'strength'];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const fields = {
    'fitness-fields': [['swim400', '400 m swim (sec)'], ['swim200', '200 m swim (sec)'], ['bike20', '20-minute power (W)'], ['run5k', '5K time (sec)']],
    'history-fields': [['longBike', 'Longest successful ride (min)'], ['longRun', 'Longest successful run (min)'], ['qualityMinutes', 'Demonstrated bike quality (min)'], ['strengthSessions', 'Maintenance strength sessions (0–2)']],
    'race-fields': [['outdoorSpeed', 'Comparable outdoor speed (km/h)'], ['sustainedRunPace', 'Sustained triathlon run pace (sec/km)']],
    'rule-fields': [['ftpMultiplier', 'FTP conversion'], ['longGrowth', 'Long-session growth fraction'], ['bikeEasyLow', 'Easy bike lower fraction'], ['bikeEasyHigh', 'Easy bike upper fraction'], ['bikeQuality', 'Bike quality fraction']]
  };
  function element(tag, text, parent, cls) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (cls) node.className = cls;
    if (parent) parent.appendChild(node);
    return node;
  }
  function field(parent, id, title, optional, fractional) {
    const label = element('label', title, $(parent));
    const input = element('input', null, label);
    input.id = id; input.type = 'number'; input.min = '0'; input.step = fractional ? '0.01' : '1'; input.required = !optional;
  }
  Object.entries(fields).forEach(([parent, items]) => items.forEach(([id, label]) => field(parent, id, label, parent === 'fitness-fields' || parent === 'race-fields', parent === 'rule-fields' || id === 'outdoorSpeed')));
  sports.forEach(s => {
    field('recent-fields', 'recent-' + s, s + ' minutes', false, false);
    const label = element('label', null, $('exclusions'));
    const box = element('input', null, label); box.type = 'checkbox'; box.id = 'exclude-' + s;
    element('span', s, label);
  });
  days.forEach((d, i) => field('availability-fields', 'day-' + i, d, false, false));
  api.presets.forEach((a, i) => { const option = element('option', a.name, $('preset')); option.value = i; });
  const read = id => $(id).value === '' ? null : Number($(id).value);
  const duration = minutes => Math.floor(Math.round(minutes) / 60) + 'h ' + Math.round(minutes) % 60 + 'm';
  const pace = seconds => Math.floor(seconds / 60) + ':' + String(Math.round(seconds % 60)).padStart(2, '0');
  let last = null;
  function collect() {
    const athlete = { name: $('name').value, phase: $('phase').value, weeksToRace: read('weeksToRace'), recovery: $('recovery').value, trainingDays: read('trainingDays'),
      excludedSports: sports.filter(s => $('exclude-' + s).checked), recent: {}, availability: days.map((_, i) => read('day-' + i)) };
    ['fitness-fields', 'history-fields', 'race-fields'].forEach(parent => fields[parent].forEach(([id]) => { athlete[id] = read(id); }));
    sports.forEach(s => { athlete.recent[s] = read('recent-' + s); });
    const rules = Object.fromEntries(fields['rule-fields'].map(([id]) => [id, read(id)]));
    return { athlete, rules };
  }
  function populate(athlete, rules) {
    $('name').value = athlete.name || 'Imported scenario';
    $('trainingDays').value = athlete.trainingDays == null ? 7 : athlete.trainingDays;
    ['phase', 'weeksToRace', 'recovery'].forEach(id => { $(id).value = athlete[id]; });
    ['fitness-fields', 'history-fields', 'race-fields'].forEach(parent => fields[parent].forEach(([id]) => { $(id).value = athlete[id] == null ? (id === 'strengthSessions' ? 1 : '') : athlete[id]; }));
    sports.forEach(s => { $('recent-' + s).value = athlete.recent[s]; $('exclude-' + s).checked = athlete.excludedSports.includes(s); });
    days.forEach((_, i) => { $('day-' + i).value = athlete.availability[i]; });
    fields['rule-fields'].forEach(([id]) => { $(id).value = rules[id]; });
  }
  function render(plan, previous) {
    const out = $('output'); out.replaceChildren();
    const top = element('section', null, out, 'summary');
    const head = element('div', null, top, 'summary-top');
    element('h2', plan.inputs.name || 'Your scenario', head);
    element('strong', duration(plan.totalMinutes), head);
    element('p', plan.phase + ' week · ' + plan.metadata.engineVersion + ' · draft rules', top, 'muted');
    if (previous) element('p', 'Compared with the previous preview: ' + (plan.totalMinutes - previous.totalMinutes >= 0 ? '+' : '') + (plan.totalMinutes - previous.totalMinutes) + ' total minutes. Previous athlete: ' + previous.inputs.name + '.', top, 'hint');
    const stats = element('div', null, top, 'stats');
    sports.forEach(s => { const item = element('span', s, stats); element('b', duration(plan.totals[s]), item); });
    element('p', 'Estimated FTP: ' + (plan.fitness.ftp ? plan.fitness.ftp + ' W' : 'unknown') + ' · CSS: ' + (plan.fitness.css ? pace(plan.fitness.css) + '/100 m' : 'unknown') + ' · 5K reference: ' + (plan.fitness.fiveKSecondsPerKm ? pace(plan.fitness.fiveKSecondsPerKm) + '/km (not an easy target)' : 'unknown'), top, 'hint');
    const scenario = element('section', null, out, 'notice');
    element('h2', 'Race duration exploration', scenario);
    element('p', plan.raceScenarios.label, scenario);
    const table = element('table', null, scenario);
    const tr = element('tr', null, element('thead', null, table));
    ['Discipline', 'Scenario range'].forEach(t => element('th', t, tr));
    const tbody = element('tbody', null, table);
    ['swim', 'bike', 'run', 'total'].forEach(s => { const row = element('tr', null, tbody); element('td', s, row); const range = plan.raceScenarios[s]; element('td', range ? duration(range[0]) + ' – ' + duration(range[1]) : 'Insufficient evidence', row); });
    const assumptions = element('details', null, scenario); element('summary', 'Show assumptions', assumptions);
    plan.raceScenarios.assumptions.forEach(t => element('p', t, assumptions, 'hint'));
    plan.days.forEach(d => {
      const card = element('article', null, out, 'day');
      const heading = element('div', null, card, 'day-head'); element('h3', d.day, heading);
      element('span', duration(d.sessions.reduce((sum, s) => sum + s.minutes, 0)) + ' / ' + duration(d.available) + ' available', heading, 'muted');
      if (!d.sessions.length) element('p', 'Rest', card, 'rest');
      d.sessions.forEach(s => {
        const session = element('div', null, card, 'session');
        const title = element('p', s.sport + ' · ' + s.minutes + ' min', session, 'session-title'); element('span', s.kind, title, 'tag');
        const list = element('ol', null, session, 'blocks'); s.blocks.forEach(b => element('li', b.minutes + ' min — ' + b.instruction, list));
        element('p', s.rationale, session, 'rationale');
      });
    });
    const notes = element('section', null, out, 'notice'); element('h2', 'Decisions and limits', notes);
    const list = element('ul', null, notes); plan.decisions.concat(plan.warnings).forEach(t => element('li', t, list));
    element('p', 'Checks passed: ' + plan.validation.checks.join(', ') + '.', notes, 'hint');
  }
  function generate() {
    try {
      const state = collect(); const plan = window.PlanGenerator.generatePreview(state.athlete, state.rules);
      render(plan, last); last = plan; $('status').textContent = ''; $('status').className = '';
      return plan;
    } catch (error) {
      $('status').textContent = error.message + ' No preview generated for these inputs.'; $('status').className = 'error';
      $('output').replaceChildren(); return null;
    }
  }
  $('controls').addEventListener('submit', e => {
    e.preventDefault(); generate();
    if (window.matchMedia('(max-width: 850px)').matches) $('status').parentElement.scrollIntoView({ block: 'start' });
  });
  $('controls').addEventListener('input', () => { $('status').textContent = 'Inputs changed. Generate a preview to apply them.'; $('status').className = 'notice'; });
  $('preset').addEventListener('change', () => { populate(api.presets[Number($('preset').value)], collect().rules); generate(); });
  $('reset-rules').addEventListener('click', () => { fields['rule-fields'].forEach(([id]) => { $(id).value = api.defaults[id]; }); generate(); });
  $('export').addEventListener('click', () => {
    const plan = generate(); if (!plan) return;
    const payload = { format: 'ironz-planner-lab-1', athlete: plan.inputs, rules: plan.rules, result: plan };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = element('a'); link.href = url; link.download = 'ironz-planner-scenario.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('import').addEventListener('change', async () => {
    try {
      const file = $('import').files[0]; if (!file) return;
      if (file.size > 200000) throw new Error('Scenario file is too large.');
      const payload = JSON.parse(await file.text());
      if (payload.format !== 'ironz-planner-lab-1') throw new Error('Choose an IronZ planner scenario export.');
      api.generate(payload.athlete, payload.rules); // validate before changing the form
      populate(payload.athlete, Object.assign({}, api.defaults, payload.rules)); generate();
    } catch (error) { $('status').textContent = error.message; $('status').className = 'error'; }
    $('import').value = '';
  });
  populate(api.presets[0], api.defaults); generate();
})();
