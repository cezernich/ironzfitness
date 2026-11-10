'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const validator = require('../js/plan-constraint-validator.js');
const plan = [
 {date:'2028-05-01',discipline:'bike',load:'hard',sessionName:'Threshold Ride',duration:60},
 {date:'2028-05-02',discipline:'run',load:'hard',sessionName:'Threshold Run',duration:40,
  libraryWorkout:{main_set:{type:'intervals',intervals:{zone:'Z5'}}},
  aiSession:{intervals:[{effort:'Z5'}]},templateWorkout:{steps:[{zone:5}]}}
];
validator.validateAndFixPlan(plan,'beginner');
assert.strictEqual(plan[1].load,'easy');
for(const k of ['libraryWorkout','aiSession','templateWorkout']) assert.strictEqual(plan[1][k],undefined,'demotion must remove '+k);
const source = fs.readFileSync(require.resolve('../js/calendar.js'),'utf8');
const c={WorkoutPrescription:require('../js/workout-prescription'),console,Math,Number,JSON,localStorage:{getItem:k=>k==='trainingZones'?JSON.stringify({biking:{zones:{z2:{wattRange:'150–190 W'}}},running:{zones:{z2:{paceRange:'8:00–9:00 /mi'}}}}):null},SESSION_TYPE_LABELS:{main:'MAIN SET'}};
vm.createContext(c);
for(const [a,b] of [['function scaleSessionDuration(', '// Convert a library workout'],['function _librarySessionSteps(', 'if (typeof window'],['function buildStepsList(', 'function build']]) {
 const start=source.indexOf(a);let end=source.indexOf(b,start+a.length); if(a==='function buildStepsList(') end=source.indexOf('\nfunction ',start+1);
 vm.runInContext(source.slice(start,end),c);
}
const scaled=c.scaleSessionDuration({duration:10,steps:[{duration:1/3,reps:6,rest:1.6}]},5);
assert.strictEqual(scaled.steps[0].duration,1/6);
assert.strictEqual(scaled.steps[0].rest,.8);
const brick=c._librarySessionSteps({main_set:{type:'mixed',blocks:[{discipline:'bike',duration_min:25,zone:'Z2',description:'Easy bike'},{discipline:'run',duration_min:10,zone:'Z2',description:'Easy run'}]}});
const html=c.buildStepsList(brick,'brick');
assert(html.includes('8:00–9:00 /mi'));assert(html.includes('150–190 W'));
// Legacy stored bricks without discipline metadata still resolve their run leg.
assert.strictEqual(c._librarySessionSteps({main_set:{type:'mixed',blocks:[{duration_min:10,zone:'Z2',description:'Easy run off the bike'}]}}).steps[0].discipline,'run');
console.log('Demotions remove hard payloads; short intervals scale without floors; brick legs use sport-specific targets');

c.localStorage.getItem = k => k === 'trainingZones' ? JSON.stringify({biking:{zones:{z2:{wattRange:'150–190 W'}}}}) : null;
const runOnly = {steps:[{duration:10,zone:2,discipline:'run',type:'main',label:'Easy run'}]};
assert(!c.buildStepsList(runOnly,'brick').includes('150–190 W'));
const inconsistent = c.scaleSessionDuration({duration:20,steps:[{duration:30,zone:4}]},20);
assert.strictEqual(inconsistent.steps[0].duration,20,'duration metadata cannot bypass step reconciliation');

for(const name of ['getEffectiveLoad','getRestrictedDuration']) {
 const start = source.indexOf('function '+name+'('), end = source.indexOf('\n}',start)+2;
 vm.runInContext(source.slice(start,end),c);
}
for(const type of ['injury','sick']) for(const load of ['hard','long','moderate','strides','test','openers'])
 assert.strictEqual(c.getEffectiveLoad(load,{type,action:'reduce'}),'easy');
assert.strictEqual(c.getRestrictedDuration(10,'easy',{type:'injury',action:'reduce'}),10,'restriction never increases a short session');
assert.strictEqual(c.getRestrictedDuration(40,'hard',{type:'rest',action:'reduce'}),0);

const removed = c.scaleSessionDuration({duration:40,steps:[{duration:40,zone:5}]},c.getRestrictedDuration(40,'hard',{type:'rest',action:'reduce'}));
assert.strictEqual(removed.duration,0);assert.strictEqual(removed.steps.length,0);
