'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const c={console,Date,Math};c.window=c;vm.createContext(c);
for(const file of ['arc-builder','plan-validator'])vm.runInContext(fs.readFileSync(require.resolve('../js/'+file+'.js'),'utf8'),c);
for(const raceType of ['ironman','half-ironman','olympic-tri','sprint-tri'])for(const weeks of [8,21,44,80]) {
 const start='2030-01-07',race=new Date(Date.parse(start+'T00:00:00Z')+weeks*7*86400000).toISOString().slice(0,10);
 const arc=c.ArcBuilder.buildArc({level:'intermediate',sportProfile:'triathlon'},[{raceType,date:race,priority:'A'}],start);
 assert.equal((arc.phases.find(p=>p.phase==='race-week').endWeek-arc.phases.find(p=>p.phase==='race-week').startWeek+1),1);
 assert((arc.phases.find(p=>p.phase==='taper').endWeek-arc.phases.find(p=>p.phase==='taper').startWeek+1)<=(['ironman','half-ironman'].includes(raceType)?2:1));
 assert.equal(arc.phases.reduce((sum,p)=>sum+p.endWeek-p.startWeek+1,0),arc.totalWeeks);
}
const week=(weekNumber,phase,duration,isDeload=false)=>({weekNumber,phase,isDeload,sessions:[{type:'bike',durationMin:duration}]});
const plan={weeklyPlan:[week(1,'peak',600),week(2,'peak',330,true),week(3,'taper',500),week(4,'taper',550),week(5,'race-week',600)]};
c.PlanValidator._checkTaperVolume(plan,{},[]);
const durations=plan.weeklyPlan.map(w=>w.sessions[0].durationMin);
assert.deepEqual(durations,[600,330,420,300,180]);
const quiet={weeklyPlan:[week(1,'peak',600),week(2,'taper',200),week(3,'taper',250),week(4,'race-week',200)]};
c.PlanValidator._checkTaperVolume(quiet,{},[]);
assert(quiet.weeklyPlan[2].sessions[0].durationMin<200);assert(quiet.weeklyPlan[3].sessions[0].durationMin<quiet.weeklyPlan[2].sessions[0].durationMin);
console.log('Long arcs reserve exactly one race week; bounded taper volume declines without inflating quiet weeks');

const compressed={weeklyPlan:[week(1,'taper',200),week(2,'race-week',250)]};c.PlanValidator._checkTaperVolume(compressed,{},[]);assert(compressed.weeklyPlan[1].sessions[0].durationMin<200);
