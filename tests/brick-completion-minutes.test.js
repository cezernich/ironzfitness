'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const H=require('../js/training-history'),P=require('../js/run-load-policy');
const source=fs.readFileSync(require.resolve('../js/calendar.js'),'utf8');
const c={console,getDistanceUnit:()=> 'mi'};vm.createContext(c);
for(const name of ['parseActualBrickRunMinutes','_buildDistanceField']){
 const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
 vm.runInContext(source.slice(start,end),c);
}
assert.equal(c.parseActualBrickRunMinutes('',120),null);assert.equal(c.parseActualBrickRunMinutes('12.5',120),12.5);
for(const value of ['-1','0','NaN','121'])assert.throws(()=>c.parseActualBrickRunMinutes(value,120));
assert.throws(()=>c.parseActualBrickRunMinutes(10,''));
const html=c._buildDistanceField('synthetic','brick');assert(html.includes('crun-min-synthetic'));assert(!html.match(/id="crun-min-synthetic"[^>]*value=/),'actual run time is never prefilled from a plan');
for(const type of ['brick','triathlon']){
 const history=H.normalize([{id:'synthetic',date:'2030-01-10',type,duration:120,actualRunDurationMin:c.parseActualBrickRunMinutes('15',120),isCompletion:true}],{asOf:'2030-01-15T12:00:00Z'});
 assert.equal(history.activities[0].runDurationMin,15);assert.equal(P.limits(history).averageWeeklyRunMin,15/4);assert.equal(P.limits(history).longestCompletedRunMin,0);
}
console.log('Brick actual run minutes validate independently of planned steps and feed only weekly completed run volume');
