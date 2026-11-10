'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const c={console,Date,Math,JSON,localStorage:{getItem:()=>null},ICONS:{}};c.window=c;vm.createContext(c);
for(const f of ['session-assembler','planner'])vm.runInContext(fs.readFileSync(require.resolve('../js/'+f+'.js'),'utf8'),c);
const p=c.buildPatternsFromPreferences({mon:['brick'],wed:['run-long'],sat:['bike-long']},[{name:'Base'},{name:'Build'},{name:'Taper'}],{});
assert.strictEqual(p.Base[1][0].discipline,'brick');assert.strictEqual(p.Base[1][0].load,'easy');assert.strictEqual(p.Taper[1][0].discipline,'bike');
for(const level of ['intermediate','advanced']){
 const w=c._libraryWorkoutFor({discipline:'brick',phaseName:'Base',level,weekInPhase:1});
 assert.strictEqual(w.duration_min,35);assert.strictEqual(w.main_set.blocks[0].duration_min,25);assert.strictEqual(w.main_set.blocks[1].duration_min,10);assert(w.main_set.blocks.every(x=>x.zone==='Z2'));
}
assert.strictEqual(c.SessionAssembler.baseBrickPrescription('beginner',1),null);
assert.strictEqual(c.SessionAssembler.baseBrickPrescription('beginner',2),null);
assert.strictEqual(c.SessionAssembler.baseBrickPrescription('beginner',3).duration_min,25);
console.log('Explicit Base brick slots use short easy shared prescriptions with beginner exception');

assert.strictEqual(c.SessionAssembler.baseBrickAllowedOnDate('2028-05-01',[{date:'2028-05-15'}]),false);
assert.strictEqual(c.SessionAssembler.baseBrickAllowedOnDate('2028-05-01',[{date:'2028-05-16'}]),true);
// Whole-generator regression: a B race during Base protects both prior weeks.
const now=new Date(), b=new Date(now); b.setDate(now.getDate()+27);
const a=new Date(now);a.setDate(now.getDate()+240);
const iso=d=>d.toISOString().slice(0,10);
const generated=c.generateTrainingPlan({aRace:{id:'synthetic-a',type:'ironman',date:iso(a),level:'intermediate',preferences:{weeklyTemplate:{mon:['brick'],wed:['run-long'],sat:['bike-long']}}},bRaces:[{id:'synthetic-b',type:'sprint',category:'triathlon',date:iso(b)}]});
const baseBricks=generated.filter(s=>s.phase==='Base'&&s.discipline==='brick');assert(baseBricks.length>0);
assert(baseBricks.every(s=>c.SessionAssembler.baseBrickAllowedOnDate(s.date,[{date:iso(b)},{date:iso(a)}])));
assert(generated.some(s=>s.sessionName==='Easy Ride — pre-race brick replacement'));
