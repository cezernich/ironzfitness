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
  _escape: value => value, _renderPlanPhilosophyBlock: () => '',
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
