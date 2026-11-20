'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../js/planner-preview');
const clone = x => JSON.parse(JSON.stringify(x));
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('OK ' + name); }
const sessions = p => p.days.flatMap(d => d.sessions);
test('deterministic, pure and versioned for all fictional athletes', () => {
  api.presets.forEach(a => {
    const before = JSON.stringify(a);
    const one = api.generate(a);
    assert.deepStrictEqual(one, api.generate(clone(a), clone(api.defaults)));
    assert.equal(JSON.stringify(a), before);
    assert.equal(one.metadata.mode, 'preview-only');
    assert.equal(one.totalMinutes, Object.values(one.totals).reduce((s, n) => s + n, 0));
    assert(one.days.some(d => !d.sessions.length));
    one.days.forEach(d => {
      assert(d.sessions.length <= 2);
      assert(d.sessions.reduce((s, w) => s + w.minutes, 0) <= d.available);
      d.sessions.forEach(s => assert.equal(s.minutes, s.blocks.reduce((n, b) => n + b.minutes, 0)));
    });
    const longDays = one.days.map((d, i) => d.sessions.some(s => s.kind === 'long') ? i : -1).filter(i => i >= 0);
    if (longDays.length === 2) assert(Math.abs(longDays[0] - longDays[1]) >= 2);
    Object.keys(a.recent).forEach(s => assert(one.totals[s] <= a.recent[s]));
  });
});
test('same benchmarks do not imply same workload', () => {
  const a = api.generate(api.presets[0]); const b = api.generate(api.presets[1]);
  assert.deepStrictEqual(a.fitness, b.fitness);
  assert(a.totalMinutes > b.totalMinutes);
  assert.equal(b.raceScenarios.run, null); assert.equal(b.raceScenarios.total, null);
});
test('rule edits change power but not capacity or source defaults', () => {
  const a = api.generate(api.presets[0]); const b = api.generate(api.presets[0], { ftpMultiplier: 0.90 });
  assert.equal(a.fitness.ftp, 228); assert.equal(b.fitness.ftp, 216);
  assert.equal(a.totalMinutes, b.totalMinutes); assert.equal(api.defaults.ftpMultiplier, 0.95);
  assert.notDeepStrictEqual(sessions(a).filter(s => s.sport === 'bike'), sessions(b).filter(s => s.sport === 'bike'));
});
test('CSS is seconds per 100 metres, not speed', () => {
  assert.equal(api.generate(api.presets[0]).fitness.css, 115);
  assert.equal(api.generate(api.presets[2]).fitness.css, 135);
});
test('pause and exclusions cannot be overridden by growth', () => {
  const a = clone(api.presets[0]); a.recovery = 'pause'; assert.equal(api.generate(a).totalMinutes, 0);
  a.recovery = 'normal'; a.excludedSports = ['run', 'bike'];
  assert(sessions(api.generate(a)).every(s => s.sport !== 'run' && s.sport !== 'bike'));
});
test('recovery and near-race taper reduce sport budgets and remove quality', () => {
  ['recovery', 'taper'].forEach(phase => {
    const a = clone(api.presets[0]); a.phase = phase; const p = api.generate(a);
    assert(!sessions(p).some(s => s.kind === 'quality'));
    Object.keys(a.recent).forEach(s => assert(p.totals[s] <= Math.floor(a.recent[s] * (phase === 'taper' ? 0.6 : 0.7))));
  });
  const a = clone(api.presets[0]); a.weeksToRace = 2; assert.equal(api.generate(a).phase, 'taper');
});
test('missing benchmarks never fabricate targets or use 5K as Ironman pace', () => {
  const a = clone(api.presets[0]); a.swim400 = a.swim200 = a.bike20 = a.outdoorSpeed = a.sustainedRunPace = null;
  const p = api.generate(a); assert.equal(p.fitness.ftp, null); assert.equal(p.fitness.css, null);
  assert.equal(p.raceScenarios.total, null);
  assert(!JSON.stringify(sessions(p)).includes('NaN'));
});
test('missing session history and zero availability withhold work', () => {
  const a = clone(api.presets[0]); a.longRun = 0; a.longBike = 0;
  assert(!sessions(api.generate(a)).some(s => ['bike', 'run'].includes(s.sport)));
  a.availability.fill(0); assert.equal(api.generate(a).totalMinutes, 0);
});
test('validation rejects malformed numbers, protocols and unsafe rule edits', () => {
  for (const rules of [{ longGrowth: 0.5 }, { ftpMultiplier: NaN }, { bikeEasyLow: 0.7, bikeEasyHigh: 0.6 }, { secretRule: 1 }]) {
    assert.throws(() => api.generate(api.presets[0], rules));
  }
  assert.throws(() => api.generate(api.presets[0], JSON.parse('{"__proto__":{"longGrowth":1}}')));
  assert.throws(() => api.generate(api.presets[0], { constructor: 1 }));
  assert.throws(() => api.generate(api.presets[0], []));
  for (const edit of [a => { a.recent.run = -1; }, a => { a.availability[1] = '60'; }, a => { a.swim200 = 500; }, a => { a.swim400 = null; }, a => { a.longRun = 999; }, a => { a.bike20 = Infinity; }, a => { a.run5k = NaN; }]) {
    const a = clone(api.presets[0]); edit(a); assert.throws(() => api.generate(a));
  }
});
test('long-session growth remains bounded across rule settings', () => {
  for (const growth of [0, 0.025, 0.05]) api.presets.forEach(a => {
    const p = api.generate(a, { longGrowth: growth });
    sessions(p).filter(s => s.kind === 'long').forEach(s => assert(s.minutes <= Math.floor((s.sport === 'bike' ? a.longBike * (1 + growth) : a.longRun))));
  });
});
test('availability matrix never overfills days or sport budgets', () => {
  // Deterministic varied constraints exercise feasible and infeasible schedules.
  for (let i = 0; i < 70; i++) {
    const a = clone(api.presets[i % 4]);
    a.availability = a.availability.map((n, day) => (i * 31 + day * 43) % (n + 1));
    const p = api.generate(a);
    p.days.forEach(d => assert(d.sessions.reduce((n, s) => n + s.minutes, 0) <= d.available));
    Object.keys(a.recent).forEach(s => assert(p.totals[s] <= a.recent[s]));
  }
});
test('preview is not loaded by the live app and has no storage or network access', () => {
  const root = path.join(__dirname, '..');
  assert(!fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('planner-preview.js'));
  ['js/planner-preview.js', 'js/planner-lab.js'].forEach(file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(!/\b(localStorage|sessionStorage|fetch|XMLHttpRequest|supabase)\b/.test(source));
  });
  const html = fs.readFileSync(path.join(root, 'planner-lab.html'), 'utf8');
  assert(!html.includes('supabase-init')); assert(!html.includes('js/app.js'));
});
console.log(checks + ' planner preview checks passed.');
