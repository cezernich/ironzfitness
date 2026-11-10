'use strict';
const assert=require('assert'),P=require('../js/workout-prescription');
const template=()=>({duration:60,steps:[{type:'main',duration:60,zone:4,label:'Hard intervals'}]});
const entry={discipline:'run',load:'hard',duration:40,aiSession:{intervals:[{name:'Threshold intervals',duration:.5,reps:20,restDuration:.5,effort:'Z5'}]}};
const ordinary=P.resolve(entry,null,{template});assert.equal(ordinary.duration,40);assert(Math.abs(ordinary.session.steps[0].duration-40/19.5*.5)<1e-8);
for(const type of ['injury','sick']){
 const r=P.resolve(entry,{type,action:'reduce'},{template});assert.equal(r.load,'easy');assert(r.session.steps.every(s=>s.zone===1));assert(!JSON.stringify(r).includes('Threshold intervals'));assert.equal(r.duration,26);
}
const time=P.resolve(entry,{type:'time',action:'reduce'},{template});assert.equal(time.session.duration,26);assert(time.session.steps.every(s=>s.zone<=3));assert(!JSON.stringify(time).includes('Threshold intervals'));
for(const restriction of [{action:'remove'},{type:'rest',action:'reduce'}])assert.equal(P.resolve(entry,restriction,{template}).session,null);
assert.equal(P.resolve(entry,{action:'remove',disciplines:['swim']},{template}).duration,40,'partial restriction preserves unrelated sport');
assert.equal(P.resolve({...entry,discipline:'brick'},{action:'remove',disciplines:['run']},{template}).removed,true,'a brick contains a run leg');
const strength=P.resolve({discipline:'strength',load:'hard',duration:45,exercises:[{name:'Squat',weight:200}]},{type:'injury',action:'reduce'},{template:()=>null});assert(strength.session.steps[0].label.includes('no loaded lifting'));assert(!JSON.stringify(strength).includes('Squat'));
assert.equal(P.resolve({...entry,duration:10},{type:'injury',action:'reduce'},{template}).duration,10,'a reduction never lengthens a short workout');
console.log('One prescription boundary handles edited intervals, load/duration reductions, rest, partial restrictions and strength recovery');
// Exercise the actual calendar and hydration consumers, not duplicate math.
const fs=require('fs'),vm=require('vm');
const calendar=fs.readFileSync(require.resolve('../js/calendar.js'),'utf8');
const data={restriction:null,planEntry:entry,scheduledWorkouts:[{id:'swim',date:'2030-01-01',discipline:'swim',load:'easy',duration:60}],loggedWorkouts:[]};
const c={console,Math,Number,JSON,WorkoutPrescription:P,getDataForDate:()=>data,getSessionTemplate:template,SESSION_DESCRIPTIONS:{},_librarySessionSteps:()=>null,_getCompletionDuration:()=>0,_parseDurMin:v=>parseFloat(v)||0,localStorage:{getItem:()=>null},document:{getElementById:()=>null},ICONS:{}};c.window=c;vm.createContext(c);
for(const name of ['_calV2IsSessionDisciplineRestricted','resolveEffectivePrescription','getEffectiveLoad','getRestrictedDuration','getDayTotals','effectiveShareEntry','buildLoggedWorkoutsForDay']) {
 const start=calendar.indexOf('function '+name+'(');const next=calendar.indexOf('\nfunction ',start+1);
 let text=calendar.slice(start,next<0?undefined:next);
 // The resolver is followed by library-parser comments; all are harmless.
 vm.runInContext(text,c);
}
assert.equal(c.getDayTotals('2030-01-01').totalMin,100);
data.restriction={action:'remove',disciplines:['swim']};assert.equal(c.getDayTotals('2030-01-01').totalMin,40);
data.restriction={type:'injury',action:'reduce'};assert.equal(c.getDayTotals('2030-01-01').totalMin,65);
const exported=c.effectiveShareEntry({...entry,date:'2030-01-01'});assert(exported.aiSession.intervals.every(s=>s.effort==='Z1'));assert(!JSON.stringify(exported).includes('Threshold intervals'));
vm.runInContext(fs.readFileSync(require.resolve('../js/hydration.js'),'utf8'),c);
assert.equal(c._hydrationResolveDurationMin({...entry,date:'2030-01-01'}),26);
data.restriction={action:'remove'};assert.equal(c.getDayTotals('2030-01-01').totalMin,0);assert.equal(c._hydrationResolveDurationMin({...entry,date:'2030-01-01'}),0);assert.equal(c.effectiveShareEntry({...entry,date:'2030-01-01'}),null);

data.restriction={type:'injury',action:'reduce'};data.scheduledWorkouts=[{id:'strength',date:'2030-01-01',type:'weightlifting',duration:60,exercises:[{name:'Heavy Squat',weight:200}]}];
const customExport=c.effectiveShareEntry(data.scheduledWorkouts[0]);assert.equal(customExport.discipline,'strength');assert(!JSON.stringify(customExport).includes('Heavy Squat'));assert.equal(c.getDayTotals('2030-01-01').totalMin,65);

assert.equal(c._hydrationResolveDurationMin(data.scheduledWorkouts[0]),39,'custom strength hydration uses the same recovery duration');
const seconds=P.resolve({...entry,aiSession:{intervals:[{duration:'20 sec',restDuration:'1 min',reps:5,effort:'Z2'}]}},null,{template});assert(Math.abs(seconds.session.steps[0].rest/seconds.session.steps[0].duration-3)<1e-8,'explicit seconds preserve the work/rest ratio after canonical scaling');

c._readWorkoutDurationMin=w=>Number(w.duration)||0;
data.restriction={action:'remove'};data.loggedWorkouts=[{id:'actual',date:'2030-01-01',type:'cycling',duration:30,source:'strava'}];
assert.equal(c.getDayTotals('2030-01-01').totalMin,30,'time off removes prescriptions, never completed history');
data.scheduledWorkouts.push({id:'unstructured',type:'weightlifting',duration:60,exercises:[]});
assert.equal(c.getDayTotals('2030-01-01').totalMin,30,'unstructured planned workouts also respect full removal');
c._getCompletionDuration=id=>id.startsWith('session-plan-')?12:0;
assert.equal(c.getDayTotals('2030-01-01').totalMin,42,'actual plan completion remains visible under later restriction edits');

assert(c._calV2IsSessionDisciplineRestricted({discipline:'brick',load:'easy'},{action:'remove',disciplines:['run']}));
assert(!c._calV2IsSessionDisciplineRestricted({discipline:'bike',load:'easy'},{action:'reduce',type:'rest',disciplines:['run']}));

for(const type of ['tempo_threshold','long_run','track_workout','speed_work','hills','easy_recovery','endurance','fun_social'])assert(c._calV2IsSessionDisciplineRestricted({type},{action:'remove',disciplines:['run']}),'legacy run alias '+type);

c.isSessionComplete=()=>false;c.buildLoggedWorkoutCard=(w,date,restriction)=>{assert.equal(restriction,null);return 'actual-card-'+w.id;};
assert.equal(c.buildLoggedWorkoutsForDay(data,'2030-01-01'),'actual-card-actual');

for(const discipline of ['swim','run']) {
 const swap={action:'swap',disciplines:[discipline]};
 assert(c._calV2IsSessionDisciplineRestricted({discipline,load:'easy'},swap));
 assert(P.resolve({discipline,load:'easy',duration:40},swap,{template}).removed);
 assert(!P.resolve({discipline:'bike',load:'easy',duration:40},swap,{template}).removed);
}
assert(P.resolve({discipline:'brick',load:'easy',duration:40},{action:'swap',disciplines:['run']},{template}).removed);
data.restriction={action:'swap',disciplines:['run']};data.loggedWorkouts=[];data.scheduledWorkouts=[{discipline:'bike',load:'easy',duration:60}];c._getCompletionDuration=()=>0;
assert.equal(c.getDayTotals('2030-01-01').totalMin,60);

assert(P.isRemoved({discipline:'run',load:'rest'},null));assert.equal(P.resolve({discipline:'run',load:'rest',duration:30},null,{template}).session,null);

for(const rest of [{sessionName:' Rest '},{name:'Rest'},{discipline:'bike',type:'rest'}])assert(P.isRemoved(rest,null));
