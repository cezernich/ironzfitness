'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require.resolve('../js/calendar.js'),'utf8');
const c={console,Math,Number};vm.createContext(c);
const start=src.indexOf('function _librarySessionSteps('),end=src.indexOf('if (typeof window',start);vm.runInContext(src.slice(start,end),c);
for(const actual of [1,3,7]) {
 const iv=c._librarySessionSteps({main_set:{type:'intervals',intervals:{reps:[4,8],reps_actual:actual,duration:2,rest:1,zone:'Z4'}}});
 assert.equal(iv.steps[0].reps,actual);assert.equal(iv.duration,actual*2+(actual-1));
 const mixed=c._librarySessionSteps({main_set:{type:'mixed',blocks:[{reps:[4,8],reps_actual:actual,duration_min:2,rest:1,zone:'Z4'}]}});
 assert.equal(mixed.steps[0].reps||1,actual);assert.equal(mixed.duration,actual*2+(actual-1));
}
const fallback=c._librarySessionSteps({main_set:{type:'intervals',intervals:{reps:[4,8],duration:2,zone:'Z4'}}});assert.equal(fallback.steps[0].reps,6);
console.log('Saved actual repetition counts win over template ranges without altering repetition arithmetic');
