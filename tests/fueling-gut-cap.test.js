'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const P=require('../js/fueling-policy');
assert.equal(P.limit(140).carbsPerHour,60);assert.equal(P.limit(140).practiceLevelConfirmed,false);
assert.equal(P.limit(140,{practicedCarbsPerHour:90}).carbsPerHour,90);
assert.equal(P.limit(100,{practicedCarbsPerHour:30,explicitOverride:true}).carbsPerHour,30);
assert.equal(P.limit(120,{practicedCarbsPerHour:120}).carbsPerHour,90);
assert.equal(P.limit(110,{practicedCarbsPerHour:120,explicitOverride:true}).carbsPerHour,110);
const store=new Map([['ironz_last_user_id','synthetic']]);
const context={console,Math,JSON,setTimeout:()=>1,clearTimeout(){},navigator:{onLine:true},
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},document:{getElementById:()=>null}};
context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/db.js'),'utf8'),context);
const h={context,store,DB:vm.runInContext('DB',context)};
for(const file of ['fueling-policy','fueling'])vm.runInContext(fs.readFileSync(require.resolve('../js/'+file+'.js'),'utf8'),h.context);
h.DB.fuelingPreferences.save({practicedCarbsPerHour:60});assert.equal(h.DB.fuelingPreferences.getCached().practicedCarbsPerHour,60);
const outputs=[];for(const weight of [110,200,300]){h.store.set('profile',JSON.stringify({weight}));outputs.push(h.context.generateFuelingPlan(172,{load:'long',discipline:'bike'}).carbsPerHour);}assert.deepEqual(outputs,[60,60,60]);
h.DB.fuelingPreferences.save({practicedCarbsPerHour:30,carbsPerHour:125});const capped=h.context.generateFuelingPlan(172,{load:'race',discipline:'bike'});assert.equal(capped.carbsPerHour,30);assert(capped.totalCarbs<=capped.targetCarbs);assert(!capped.note.includes('60-90'));
const html=h.context.renderFuelingPlanHTML(172,'Ride',{load:'long',discipline:'bike'});assert(!html.includes('Weight ×'));assert(html.includes('30g/hr'));
console.log('Live fueling rate and overrides respect practiced gut ceiling independently of body mass; DB preference route verified');

for(const duration of [60,61,90,172,360,660])for(const practiced of [10,30,60,90]) {
 h.DB.fuelingPreferences.save({practicedCarbsPerHour:practiced});const plan=h.context.generateFuelingPlan(duration,{load:'long',discipline:'bike'});
 const sum=plan.items.reduce((n,item)=>n+item.carbs,0);assert(sum<=plan.targetCarbs+1e-8);
 for(const item of plan.items)assert(plan.items.filter(x=>x.minute>=item.minute&&x.minute<item.minute+60).reduce((n,x)=>n+x.carbs,0)<=practiced+1e-8);
}
h.DB.fuelingPreferences.save({practicedCarbsPerHour:90});const set=h.context.localStorage.setItem;h.context.localStorage.setItem=()=>{throw Error('quota');};assert.throws(()=>h.DB.fuelingPreferences.save({practicedCarbsPerHour:30}));assert.equal(h.DB.fuelingPreferences.getCached().practicedCarbsPerHour,90);h.context.localStorage.setItem=set;

for(const duration of [66,86,106]) {h.DB.fuelingPreferences.save({practicedCarbsPerHour:60,startMinute:5});const p=h.context.generateFuelingPlan(duration,{load:'long'});assert(p.items.reduce((n,i)=>n+i.carbs,0)<=p.targetCarbs+1e-8);}
