'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const cache = new Map();
const c = { console, localStorage: {getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)}, ICONS:{}, Date, Math };
c.window=c; vm.createContext(c);
vm.runInContext(fs.readFileSync(require.resolve('../js/planner.js'),'utf8'),c);
const entries = [
 {date:'2028-05-01',discipline:'swim',load:'moderate',weekNumber:3},
 {date:'2028-05-02',discipline:'run',load:'moderate',weekNumber:3},
 {date:'2028-05-03',discipline:'brick',load:'easy',weekNumber:3},
 {date:'2028-05-04',discipline:'swim',load:'easy',_distributionAdded:true},
 {date:'2028-05-05',discipline:'bike',load:'easy',duration:30,libraryWorkout:{duration_min:42}},
 {date:'2028-05-06',discipline:'run',load:'long',duration:68},
 {date:'2028-05-07',discipline:'rest',load:'rest'},
];
c._materializePlanPrescriptions(entries);
for(const s of entries.slice(0,4)) { assert(s.duration>0); assert(s.templateWorkout.steps.length>0); }
assert.strictEqual(entries[4].duration,30, "materialization must preserve a constraint-clamped duration");
assert.strictEqual(entries[5].duration,68);
const original=c.getSessionTemplate('swim','moderate',3).steps[0].label;
entries[0].templateWorkout.steps[0].label='changed';
assert.strictEqual(c.getSessionTemplate('swim','moderate',3).steps[0].label,original);
assert.throws(()=>c._materializePlanPrescriptions([{discipline:'unsupported',load:'easy'}]),/no duration/);
const recovery = [{discipline:'run',load:'recovery'}]; c._materializePlanPrescriptions(recovery); assert.strictEqual(recovery[0].duration,25); assert(recovery[0].templateWorkout.steps.every(s=>s.zone===1));
console.log('Saved fallback durations, detached prescriptions, library durations, and rejection verified');

// Saved snapshots remain canonical even when template defaults change.
const P=require('../js/workout-prescription');
const entry={discipline:'swim',load:'moderate',duration:28,templateWorkout:{duration:45,steps:[{duration:45,zone:2,label:'saved'}]}};
const services={template:()=>({duration:99,steps:[{duration:99,zone:4,label:'changed'}]})};
const resolved=P.resolve(entry,null,services);
assert.strictEqual(resolved.session.steps[0].label,'saved');assert.strictEqual(resolved.duration,28);assert.strictEqual(resolved.session.steps[0].duration,28);
const reduced=P.resolve(entry,{type:'injury',action:'reduce'},services);
assert(reduced.session.steps.every(s=>s.zone===1));assert(reduced.duration<28);
