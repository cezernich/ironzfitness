'use strict';
const assert=require('assert'),V=require('../js/plan-constraint-validator');
const session=(date,extra={})=>({date,phase:'Build',discipline:'run',load:'easy',duration:40,sessionName:'Run',...extra});
const quality=date=>session(date,{load:'moderate',libraryWorkout:{main_set:{type:'intervals',intervals:{zone:'Z4'}}}});
const base=[quality('2030-01-07'),quality('2030-01-09'),quality('2030-01-11')].map(s=>({...s,phase:'Base'}));
V.validateAndFixPlan(base,'advanced');assert(base.filter(V.isQualityEntry).length<=2);assert(base.some(s=>!s.libraryWorkout&&s.load==='easy'));
assert.equal(V.isQualityEntry(session('2030-01-07',{load:'long',libraryWorkout:{main_set:{effort:{zone:'Z2'}}}})),false,'aerobic long duration is stress, not threshold quality');
const doubles=[quality('2030-01-07'),session('2030-01-07'),quality('2030-01-08')];V.validateAndFixPlan(doubles,'advanced');assert(!(V.isHardEntry(doubles[0])&&V.isHardEntry(doubles[2])),'easy doubles cannot hide adjacent quality');
const boundary=[quality('2030-01-06'),quality('2030-01-07')];V.validateAndFixPlan(boundary,'advanced');assert.equal(boundary.filter(V.isHardEntry).length,1,'Sunday/Monday is a real consecutive-day boundary');
const week=[];for(let day=7;day<=13;day++)for(let i=0;i<2;i++)week.push(session(`2030-01-${String(day).padStart(2,'0')}`,{discipline:i?'swim':'bike'}));
V.validateAndFixPlan(week,'advanced');assert.equal(new Set(week.filter(s=>s.load!=='rest').map(s=>s.date)).size,6,'a recovery day removes every double on that date');
const testing=['2030-01-07','2030-01-09','2030-01-11'].map(date=>session(date,{phase:'Threshold',load:'test',isThresholdWeek:true,isThresholdTest:true,thresholdTestType:'FTP',sessionName:'FTP Test'}));V.validateAndFixPlan(testing,'advanced');assert.equal(testing.filter(s=>s.isThresholdTest).length,1);assert(testing.filter(s=>s.load==='easy').every(s=>!s.thresholdTestType&&!/Test/.test(s.sessionName)));
const strength=[session('2030-01-07',{discipline:'strength',strengthStress:'heavy',exercises:[{weight:200}]}),quality('2030-01-08')];V.validateAndFixPlan(strength,'advanced');assert(!strength[0].exercises);assert.equal(strength[0].load,'rest');
console.log('Actual quality budgets, recovery across doubles/week boundaries, maximal-test budget and whole-day rest verified');

const races=[session('2030-01-07',{discipline:'race',load:'race'}),session('2030-01-13',{discipline:'race',load:'race'})];const result=V.validateAndFixPlan(races,'beginner');assert(result.unresolved);assert(races.every(s=>s.discipline==='race'&&s.load==='race'));

const fs=require('fs'),vm=require('vm');const c={console,Date,Math,JSON,localStorage:{getItem:()=>null},ICONS:{}};c.window=c;c.PlanConstraintValidator=V;vm.createContext(c);vm.runInContext(fs.readFileSync(require.resolve('../js/planner.js'),'utf8'),c);
const rebound=['2030-01-07','2030-01-09','2030-01-11','2030-01-13'].map(date=>session(date,{phase:'Base',load:'long',weekNumber:2,duration:60}));
c._materializePlanPrescriptions(rebound);V.validateAndFixPlan(rebound,'advanced');c._materializePlanPrescriptions(rebound);assert(rebound.filter(V.isQualityEntry).length<=2,'final fallback materialization cannot restore demoted surges');
const built=c._buildStrengthForPlan(1,'Base');const liveStrength=session('2030-01-07',{discipline:'strength',load:'moderate',exercises:built.exercises});assert(V.isHardEntry(liveStrength),'actual generated compound strength participates without synthetic stress metadata');
const bRaces=[session('2030-01-07',{discipline:'run',load:'race'}),session('2030-01-08',{discipline:'bike',load:'race'})];assert(V.validateAndFixPlan(bRaces,'advanced').unresolved);assert(bRaces.every(s=>s.load==='race'),'B race entries remain protected');
