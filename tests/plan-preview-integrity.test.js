'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../js/onboarding-v2.js'), 'utf8');
const start = source.indexOf('  function _renderPlanPreview() {');
const end = source.indexOf('\n  // Strip the enriched suffix', start);
const schedule = { mon: ['brick', 'swim'], tue: ['strength', 'run'], wed: ['run-long'], thu: ['bike', 'strength', 'swim'], fri: ['rest'], sat: ['bike-long'], sun: ['bike'] };
const original = JSON.stringify(schedule);
const body = { innerHTML: '' };
const context = {
  document: { getElementById: id => id === 'bp-v2-preview-body' ? body : null },
  _state: { currentRace: { date: '2028-09-10', type: 'ironman' }, trainingGoals: ['race'], selectedSports: ['triathlon', 'strength'], thresholds: {}, schedule },
  _BP_DAYS: Object.keys(schedule), _BP_DAY_LABELS: {},
  _enforceSpecTarget: () => { schedule.sun.push('swim'); },
  _enrichWeekTemplate: () => schedule,
  _enrichedLabel: code => code, _sportBucketFromEnriched: code => code,
  _renderScheduleSuggestion: () => '', _escape: value => value, _renderPlanPhilosophyBlock: () => '',
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
for (const phase of ['base', 'build', 'peak', 'taper', 'race']) {
  context._state._previewPhase = phase;
  vm.runInContext('_renderPlanPreview()', context);
  assert.strictEqual(JSON.stringify(schedule), original, `${phase} preview changed the edited schedule`);
  assert(body.innerHTML.includes('run-long'));
}
console.log('Plan preview preserves edited schedule across phases');

// Exercise goal/level changes at the schedule boundary, independently of
// preview. The seeder stands in for the existing distribution algorithm.
const controlsStart = source.indexOf('  function _scheduleInputsSignature() {');
const controlsEnd = source.indexOf('  function _renderSchedule() {', controlsStart);
let level = 'intermediate';
let seeds = 0;
const days = Object.keys(schedule);
const controls = {
  _BP_DAYS: days,
  _state: { currentRace: { type: 'ironman', goal: 'finish' }, selectedSports: ['run', 'bike', 'swim'], trainingGoals: ['race'], strengthSetup: {}, longDays: {}, planDetails: {}, schedule: Object.fromEntries(days.map(d => [d, []])) },
  _deriveAthleteLevel: () => level,
  _seedSchedule: () => {
    seeds++;
    for (const d of days) controls._state.schedule[d] = [];
    controls._state.schedule.mon = ['swim'];
    if (controls._state.currentRace.goal === 'pr' || level === 'advanced') controls._state.schedule.tue = ['run'];
    controls._state.planDetails.daysPerWeek = '6';
  },
  _renderSchedule: () => {}, _renderPlanPreview: () => {},
};
vm.createContext(controls);
vm.runInContext(source.slice(controlsStart, controlsEnd), controls);
controls._refreshScheduleDefaults();
assert.strictEqual(seeds, 1);
controls._state.currentRace.goal = 'pr';
controls._refreshScheduleDefaults();
assert.strictEqual(seeds, 2, 'goal change must regenerate untouched defaults');
assert.strictEqual(controls._state.schedule.tue[0], 'run');
controls._state._scheduleTouched = true;
controls._state.schedule.mon = ['brick'];
const edited = JSON.stringify(controls._state.schedule);
controls._state.currentRace.goal = 'finish';
controls._refreshScheduleDefaults();
assert.strictEqual(JSON.stringify(controls._state.schedule), edited);
assert(controls._renderScheduleSuggestion().includes('Suggested: 1 sessions'));
assert.strictEqual(controls._state.planDetails.daysPerWeek, '6');
controls._keepScheduleEdits();
controls._refreshScheduleDefaults();
assert.strictEqual(controls._state._scheduleSuggestion, null, 'dismissal persists until inputs change again');
level = 'advanced';
controls._refreshScheduleDefaults();
assert.strictEqual(JSON.stringify(controls._state.schedule), edited);
assert(controls._state._scheduleSuggestion);
controls._applyScheduleSuggestion();
assert.strictEqual(controls._state.schedule.mon[0], 'swim');
assert.strictEqual(controls._state.schedule.tue[0], 'run');
assert.strictEqual(controls._state._scheduleSuggestion, null);
// Explicitly removing every chip is an edit, not a request for defaults.
controls._state._scheduleTouched = true;
controls._state.schedule = Object.fromEntries(days.map(d => [d, []]));
controls._refreshScheduleDefaults();
assert(days.every(d => controls._state.schedule[d].length === 0));
// Returning through the long-day screen may clear untouched defaults.
controls._state._scheduleTouched = false;
const beforeReseed = seeds;
controls._refreshScheduleDefaults();
assert.strictEqual(seeds, beforeReseed + 1);
// Loading a saved empty template must never autofill it.
controls._state._editingPlanId = 'saved-plan';
controls._state._scheduleInputSignature = null;
controls._state.schedule = Object.fromEntries(days.map(d => [d, []]));
controls._refreshScheduleDefaults();
assert(days.every(d => controls._state.schedule[d].length === 0));
controls._state.currentRace.type = 'halfIronman';
controls._refreshScheduleDefaults();
assert(controls._state._scheduleSuggestion);
assert(days.every(d => controls._state.schedule[d].length === 0));
console.log('Changed goals and levels refresh defaults or offer explicit schedule choices');
