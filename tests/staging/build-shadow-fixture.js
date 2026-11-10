'use strict';
// Synthetic cohort only. Generate through the actual engine checkout supplied
// by the reviewer; do not substitute a hand-written plan for this API test.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw Error('Provide the engine checkout and output fixture path.');
const context = { console, Date, Math, localStorage: { getItem() { throw Error('Ambient cache is outside this frozen fixture.'); } } };
context.window = context;
vm.createContext(context);
const modules = ['athlete-input', 'training-zones', 'athlete-classifier', 'arc-builder', 'session-assembler', 'nutrition-calculator', 'hydration-calculator', 'plan-validator', 'rationale-builder', 'plan-generator'];
for (const file of ['exercise-data.js', 'exercise-filters.js', ...modules.map(name => 'js/' + name + '.js')]) {
  vm.runInContext(fs.readFileSync(path.join(source, file), 'utf8'), context);
}
const input = context.AthleteInput.normalize({
  asOf: '2030-01-01T12:00:00Z', startDate: '2030-01-07', timeZone: 'UTC',
  profile: { age: 34, weight: 155, height: 70, gender: 'male', selectedSports: ['bike'], availableDaysPerWeek: 4, sessionLength: 60, goal: 'endurance', ftp: 220 },
});
const candidate = context.PlanGenerator.generate({ snapshot: input });
if (candidate.planMetadata.readiness !== 'shadow_only') throw Error('Expected evaluation-only candidate.');
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
fs.writeFileSync(destination, JSON.stringify({ synthetic: true, sourceHead, input, candidate }));
console.log('Generated synthetic shadow fixture from ' + sourceHead + ': ' + candidate.weeklyPlan.length + ' weeks.');
