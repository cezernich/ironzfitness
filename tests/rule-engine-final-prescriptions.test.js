'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const context={console,localStorage:{getItem:()=>null},Date,Math};context.window=context;vm.createContext(context);
for(const file of ['athlete-input','training-zones','athlete-classifier','arc-builder','session-assembler','nutrition-calculator','hydration-calculator','plan-validator','rationale-builder','plan-generator'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+file+'.js'),'utf8'),context);
const V=context.PlanValidator;
for(const value of [null,undefined,{}, {weeklyPlan:[]}])assert.equal(V.validate(value,{}).allPassed,false,'absent plans are never valid');
const progression={weeklyPlan:[{weekNumber:1,sessions:[{type:'bike',day:1,durationMin:100}]},{weekNumber:2,sessions:[{type:'bike',day:1,durationMin:115}]}]};
V._checkVolumeIncreaseCap(progression,{level:'intermediate'},[]);assert.ok(progression.weeklyPlan[1].sessions[0].durationMin<=110);
const proportion={weeklyPlan:[{weekNumber:1,sessions:[{type:'run',day:1,durationMin:40},{type:'run',priority:'long',day:3,durationMin:60}]}]};
V._checkLongRunProportion(proportion,{},[]);const runs=proportion.weeklyPlan[0].sessions;assert.ok(runs[1].durationMin/runs.reduce((sum,s)=>sum+s.durationMin,0)<=.30);
const demote={weeklyPlan:[{weekNumber:1,sessions:[{type:'run',day:1,keySession:true,durationMin:45},{type:'run',day:3,keySession:true,durationMin:45,intervals:[{effort:'Z5'}],generatedSession:{hard:true}}]}]};
V._checkIntensityCap(demote,{level:'beginner'},[]);const easy=demote.weeklyPlan[0].sessions[1];assert.equal(easy.keySession,false);assert.equal(easy.intervals,undefined);assert.equal(easy.generatedSession,undefined);assert.equal(easy.phases[0].intensity,'z2');
const make=type=>context.PlanGenerator.generate({asOf:'2030-01-01T12:00:00Z',startDate:'2030-01-07',profile:{age:34,weight:155,height:70,goal:'race_performance',selectedSports:type==='cycling'?['bike']:['run'],availableDaysPerWeek:5,sessionLength:60,thresholdPace:9,ftp:220,cssTime:125},races:[{raceType:type,date:'2030-06-09',priority:'A'}]});
const cycling=make('cycling');assert.ok(cycling.weeklyPlan.some(w=>w.sessions.some(s=>s.type==='bike')),'cycling must generate cycling');assert.ok(!cycling.weeklyPlan.some(w=>w.sessions.some(s=>s.type==='run')),'cycling never falls back to running');
const tri=context.PlanGenerator.generate({asOf:'2030-01-01T12:00:00Z',startDate:'2030-01-07',profile:{age:34,weight:155,height:70,goal:'race_performance',selectedSports:['run','bike','swim'],availableDaysPerWeek:6,sessionLength:60,thresholdPace:9,ftp:220,cssTime:125},races:[{raceType:'ironman',date:'2030-06-09',priority:'A'}]});
for(const week of tri.weeklyPlan)for(const session of week.sessions)if(session.type==='brick')assert.equal(session.brickDetails.leg1DurationMin+session.brickDetails.leg2DurationMin,session.durationMin,'final brick legs match final budget');
assert.equal(tri.planMetadata.generatedAt,'2030-01-01T12:00:00.000Z');
console.log('PASS: real target cycling/triathlon, final brick arithmetic, caps, real demotion and invalid-plan rejection');
// Doubles and week boundaries must inspect the actual hard prescriptions.
const doubles={weeklyPlan:[{weekNumber:1,sessions:[{type:'bike',day:2,keySession:true,durationMin:40},{type:'bike',day:3,keySession:true,durationMin:40,intervals:[{effort:'Z5'}]},{type:'bike',day:3,keySession:false,durationMin:20}]}]};
V._checkNoConsecutiveHard(doubles,{level:'intermediate'},[]);assert.equal(doubles.weeklyPlan[0].sessions[1].keySession,false);assert.equal(doubles.weeklyPlan[0].sessions[1].intervals,undefined);
const separate={weeklyPlan:[{weekNumber:1,sessions:[{type:'strength',day:1,keySession:true,strengthStress:'heavy',durationMin:40},{type:'strength',day:4,keySession:true,strengthStress:'heavy',durationMin:40},{type:'bike',day:3,keySession:true,durationMin:40},{type:'run',day:6,keySession:true,durationMin:40}]}]};
V._checkIntensityCap(separate,{level:'intermediate'},[]);assert.equal(separate.weeklyPlan[0].sessions.filter(s=>s.type==='strength'&&s.keySession).length,2,'heavy strength uses separate session budget');
const boundary={weeklyPlan:[{weekNumber:1,sessions:[{type:'strength',day:7,keySession:false,strengthStress:'heavy',durationMin:40}]},{weekNumber:2,sessions:[{type:'bike',day:1,keySession:true,durationMin:40}]}]};V._checkNoConsecutiveHard(boundary,{level:'advanced'},[]);assert.equal(boundary.weeklyPlan[1].sessions[0].keySession,false,'shared spacing applies across weeks and heavy strength');
assert.equal(V.validate({weeklyPlan:[{weekNumber:1,sessions:[{type:'bike',day:1,durationMin:30}]}]},{}).allPassed,false);
const invalidNutrition=JSON.parse(JSON.stringify(cycling));invalidNutrition.nutritionStrategy={dailyTargets:{calories:NaN,proteinG:80,carbsG:200,fatG:60}};assert.equal(V.validate(invalidNutrition,cycling.athleteProfile).allPassed,false);
const fakeRest={weeklyPlan:[{sessions:[...Array.from({length:7},(_,i)=>({type:'bike',day:i+1,durationMin:30})),{type:'rest',day:1,durationMin:0}]}]};V._checkRestDayMinimum(fakeRest,{},[]);assert.ok(new Set(fakeRest.weeklyPlan[0].sessions.filter(s=>s.type!=='rest').map(s=>s.day)).size<7);
const zero=JSON.parse(JSON.stringify(cycling));zero.weeklyPlan[0].sessions.push({type:'brick',day:1,durationMin:0});const zeroResult=V.validate(zero,cycling.athleteProfile);assert.ok(zeroResult.plan.weeklyPlan[0].sessions.filter(s=>s.type==='brick').every(s=>s.durationMin>0),'zero bricks become honest rest, never 60-minute defaults');

for(const file of ['exercise-data.js','exercise-filters.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../'+file),'utf8'),context);
const hybridInput={asOf:'2030-01-01T12:00:00Z',startDate:'2030-01-07',variationSeed:7,profile:{age:34,weight:155,height:70,gender:'male',goal:'general_fitness',selectedSports:['run','bike','strength'],strengthRole:'injury_prevention',equipmentProfile:['bodyweight','band'],availableDaysPerWeek:5,sessionLength:45}};
const hybrid=context.PlanGenerator.generate(hybridInput);for(const type of ['run','bike','strength'])assert.ok(hybrid.weeklyPlan[0].sessions.some(s=>s.type===type),'hybrid preserves '+type);
assert.ok(hybrid.weeklyPlan.flatMap(w=>w.sessions).filter(s=>s.type==='strength').every(s=>s.strengthRole==='injury_prevention'&&s.strengthStress==='light'&&s.exercises.length>0));
context.localStorage.getItem=()=>{throw Error('ambient state must not affect explicit snapshot');};assert.deepEqual(context.PlanGenerator.generate(hybridInput),hybrid,'same snapshot/asOf/seed replay is deterministic');
const missingBody=context.PlanGenerator.generate({...hybridInput,profile:{...hybridInput.profile,age:null,weight:null,height:null,selectedSports:['bike']}});assert.equal(missingBody.nutritionStrategy.status,'insufficient_data');assert.equal(missingBody.hydrationStrategy.status,'insufficient_data');
const primary=context.AthleteClassifier.classify({races:[{raceType:'ironman',priority:'A'},{raceType:'hyrox',priority:'B'}]});assert.equal(primary.sportProfile,'triathlon','secondary event cannot replace primary event identity');
console.log('PASS: hybrid selected sports/actual strength role, explicit-state replay, unknown nutrition and primary race identity');
const hidden=JSON.parse(JSON.stringify(cycling));const originalEasy=hidden.weeklyPlan[0].sessions.find(s=>s.type==='bike');originalEasy.intervals=[{durationMin:120,intensity:'Z5'}];originalEasy.generatedSession={durationMin:120,intensity:'Z5'};const clean=V.validate(hidden,cycling.athleteProfile);assert.equal(clean.allPassed,true);assert.equal(originalEasy.intervals,undefined);assert.equal(originalEasy.generatedSession,undefined);assert.equal(originalEasy.phases.reduce((sum,s)=>sum+s.duration_min,0),originalEasy.durationMin);
const marathon=make('marathon');for(const week of marathon.weeklyPlan)for(const session of week.sessions)if(session.type!=='rest'){assert.equal(session.phases.reduce((sum,s)=>sum+s.duration_min,0),session.durationMin);assert.ok(!/8.12 miles/.test(session.description),'final descriptions cannot retain impossible distance instructions');}

const keyProgression={weeklyPlan:[{weekNumber:1,sessions:[{type:'bike',priority:'long',durationMin:100}]},{weekNumber:2,sessions:[{type:'bike',priority:'long',durationMin:200}]}]};V._checkKeystoneProgression(keyProgression,{level:'intermediate'},[]);assert.ok(keyProgression.weeklyPlan[1].sessions[0].durationMin<=110);
for(const plan of [cycling,tri,hybrid,marathon])for(const week of plan.weeklyPlan){const sessions=week.sessions.filter(s=>['run','bike','swim','brick'].includes(s.type));const total=sessions.reduce((sum,s)=>sum+s.durationMin,0);const hard=sessions.reduce((sum,s)=>sum+s.phases.filter(p=>['z3','z4','z5'].includes(p.intensity)).reduce((n,p)=>n+p.duration_min,0),0);assert.ok(!total||hard/total<=.20+.00001,'actual weekly phases obey intensity distribution');}

const unequal=context.PlanGenerator.generate({asOf:'2030-01-01T12:00:00Z',startDate:'2030-01-07',profile:{age:34,weight:155,height:70,selectedSports:['run','bike','swim'],availableDaysPerWeek:6,sessionLength:60,thresholdPace:6,ftp:220,cssTime:170},races:[{raceType:'ironman',date:'2030-06-09',priority:'A'}]});assert.equal(unequal.athleteProfile.sportLevels.swim,'novice');for(const session of unequal.weeklyPlan.flatMap(w=>w.sessions).filter(s=>s.type==='swim')){assert.ok(session.phases.every(p=>!['z4','z5'].includes(p.intensity)));if(session.targetPace)assert.ok(!session.targetPace.startsWith('167'));}
const unknownPace=JSON.parse(JSON.stringify(cycling));unknownPace.athleteProfile.thresholds={};const unknownBike=unknownPace.weeklyPlan[0].sessions.find(s=>s.type==='bike');unknownBike.targetPace='500W';V.validate(unknownPace,unknownPace.athleteProfile);assert.equal(unknownBike.targetPace,undefined);

const demoYounger=context.AthleteClassifier.classify({age:25,gender:'male',weight:155,cssTime:160,ftp:210,runReference:{referenceDist:'5k',referenceTime:'26:00'},selectedSports:['swim','bike','run']});const demoOlder=context.AthleteClassifier.classify({age:67,gender:'female',weight:155,cssTime:160,ftp:210,runReference:{referenceDist:'5k',referenceTime:'26:00'},selectedSports:['swim','bike','run']});assert.notDeepEqual(demoYounger.sportLevels,demoOlder.sportLevels,'classification uses same age/sex tables as existing zone UI');

const oneDay=context.PlanGenerator.generate({...hybridInput,profile:{...hybridInput.profile,selectedSports:['bike'],availableDaysPerWeek:1}});
for(const week of oneDay.weeklyPlan)assert.ok(new Set(week.sessions.filter(s=>s.type!=='rest').map(s=>s.day)).size<=1,'one available day never becomes two');
const thursday=context.PlanGenerator.generate({...hybridInput,startDate:'2030-01-10',profile:{...hybridInput.profile,selectedSports:['bike'],availableDaysPerWeek:1,preferredDays:[4]}});
assert.equal(thursday.arc.startDate,'2030-01-07');assert.equal(thursday.arc.requestedStartDate,'2030-01-10');assert.equal(thursday.weeklyPlan[0].isPartial,true);
for(const session of thursday.weeklyPlan.flatMap(w=>w.sessions).filter(s=>s.type!=='rest')){assert.ok(session.date>='2030-01-10');assert.equal(new Date(session.date+'T00:00:00Z').getUTCDay(),4,'weekday and date agree across a partial first week');}
const unavailable=JSON.parse(JSON.stringify(cycling));unavailable.athleteProfile.preferredDays=[1];assert.equal(V.validate(unavailable,unavailable.athleteProfile).allPassed,false,'final postconditions reject excluded days');
const weightGoal=context.PlanGenerator.generate({...hybridInput,profile:{...hybridInput.profile,goal:'fat_loss',selectedSports:['bike']}});assert.ok(weightGoal.weeklyPlan.flatMap(w=>w.sessions).every(s=>['bike','rest'].includes(s.type)),'fat-loss recommendation cannot inject unselected empty strength workouts');
assert.equal(context.PlanGenerator._buildConstraints({level:'advanced'}).noConsecutiveHardDays,true);

assert.throws(()=>context.PlanGenerator.generate({...hybridInput,weeklyTemplate:{mon:['run'],thu:['bike']},profile:{...hybridInput.profile,selectedSports:['run','bike'],availableDaysPerWeek:2}}),/reviewed .* template/,'unsupported sport-by-day layout returns explicit infeasibility, not wrong weekday success');

const twoWindows={startDate:'2030-01-07',bRaceWindows:[{raceDate:'2030-01-09',taperStartDate:'2030-01-06',recoveryEndDate:'2030-01-12'},{raceDate:'2030-01-13',taperStartDate:'2030-01-10',recoveryEndDate:'2030-01-16'}]};
const bDay=[{day:7,type:'bike',keySession:true,durationMin:60}];context.SessionAssembler.applyBRaceMicroTaper(bDay,1,twoWindows);assert.equal(bDay[0].type,'rest','every B race window checked, including second overlapping race');
const bReverse=[{day:7,type:'bike',keySession:true,durationMin:60}];context.SessionAssembler.applyBRaceMicroTaper(bReverse,1,{...twoWindows,bRaceWindows:[...twoWindows.bRaceWindows].reverse()});assert.deepEqual(bDay,bReverse,'overlapping B race order cannot change recovery decision');
const loaded=[{day:5,type:'strength',strengthStress:'heavy',durationMin:60,exercises:[{sets:3,reps:'3-6'}]}];context.SessionAssembler.applyBRaceMicroTaper(loaded,1,twoWindows);assert.equal(loaded[0].type,'rest');assert.equal(loaded[0].exercises,undefined,'recovery cannot retain heavy exercises behind easy labels');

const emptyPhases=JSON.parse(JSON.stringify(cycling));emptyPhases.arc.phases=[];assert.equal(V.validate(emptyPhases,cycling.athleteProfile).allPassed,false);
const shifted=JSON.parse(JSON.stringify(cycling));shifted.arc.startDate='2030-01-08';for(const session of shifted.weeklyPlan.flatMap(w=>w.sessions))session.date=new Date(Date.parse(session.date+'T00:00:00Z')+86400000).toISOString().slice(0,10);assert.equal(V.validate(shifted,cycling.athleteProfile).allPassed,false);
const nullSession=JSON.parse(JSON.stringify(cycling));nullSession.weeklyPlan[0].sessions.push(null);assert.equal(V.validate(nullSession,cycling.athleteProfile).allPassed,false);

const weakRecovery=context.PlanGenerator.generate({asOf:'2030-01-01T12:00:00Z',startDate:'2030-01-07',profile:{age:34,weight:155,height:70,selectedSports:['run','bike','swim'],availableDaysPerWeek:6,sessionLength:60,thresholdPace:6,ftp:220,cssTime:170},races:[{raceType:'ironman',date:'2030-06-09',priority:'A'},{raceType:'10k',date:'2030-01-07',priority:'B'}]});
for(const session of weakRecovery.weeklyPlan[0].sessions.filter(s=>s.type!=='rest'&&s.date<='2030-01-10'))assert.ok(session.phases.every(p=>['z1','z2'].includes(p.intensity)),'weakness emphasis cannot upgrade B-race recovery work');

const rebound={weeklyPlan:[{weekNumber:1,sessions:[{type:'bike',day:1,durationMin:100}]},{weekNumber:2,isDeload:true,sessions:[{type:'bike',day:1,durationMin:50}]},{weekNumber:3,sessions:[{type:'bike',day:1,durationMin:1000}]}]};
V._checkVolumeIncreaseCap(rebound,{level:'intermediate'},[]);assert.ok(rebound.weeklyPlan[2].sessions[0].durationMin<=110,'deload rebound uses last full pre-cut planned week, never unlimited skip');

const spareBudget=[{type:'bike',durationMin:30}];context.SessionAssembler.scaleSessionsToBudget(spareBudget,600);assert.equal(spareBudget[0].durationMin,30,'generic hour ceiling cannot inflate selected work into presumed tolerance');
const tinyBudget=[{type:'bike',durationMin:30}];context.SessionAssembler.scaleSessionsToBudget(tinyBudget,5);assert.ok(tinyBudget[0].durationMin<=5,'minimum session duration never defeats a numerical cap');

context.DB={commitEnginePlan:()=>{throw Error('shadow plan must never reach adoption');}};
(async()=>{await assert.rejects(context.PlanGenerator.storePlan(cycling),/evaluation mode/);})().catch(error=>{console.error(error);process.exitCode=1;});
