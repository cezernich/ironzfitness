'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const ob=fs.readFileSync(require.resolve('../js/onboarding-v2.js'),'utf8');
const values=new Map(),history=[],syncs=[];
const c={console,Date,Number,Math,JSON,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},DB:{syncKey:k=>syncs.push(k),flushKey:()=>{}},_zoneEntryMaterialDiff:()=>true,_appendZoneHistoryAt:(...v)=>history.push(v),_formatSeconds:s=>Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0')};
vm.createContext(c);
const db=fs.readFileSync(require.resolve('../js/db.js'),'utf8');
const clearStart=db.indexOf('  function invalidateLegacyRunningZones()');
vm.runInContext(db.slice(clearStart,db.indexOf('  // ── Public API',clearStart)), Object.assign(c,{syncKey:k=>syncs.push(k)}));
c.DB.invalidateLegacyRunningZones=c.invalidateLegacyRunningZones;
function load(source,start,end){vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),c);}
load(app,'const ZONE_CONFIG =','// ── Storage');
load(app,'function saveTrainingZonesData(','// Returns true if');
load(app,'function computeRunningZones(','function selectZonesSport(');
load(ob,'  function _thresholdSubmissionError(','  function _testMeForEverythingAndContinue(');
values.set('trainingZones',JSON.stringify({running:{referenceDist:'5K',referenceTime:'18:00',vdot:60,zones:{old:true}},swimming:{referenceDist:'400m',referenceTime:'5:30',tPaceSec:82.5,zones:{old:true}},strength:{squat:{weight:200},bench:{weight:150},deadlift:{weight:250}},biking:{ftp:220}}));
c._persistThresholdsToZones({run:{mode:'known',method:'race',raceDist:'5k',raceTime:'22:00'},swim:{mode:'known',method:'pace',cssPace:'110.5'},strength:{mode:'known',bench:'135'}});
let z=JSON.parse(values.get('trainingZones'));
assert.strictEqual(z.running.referenceTime,'22:00');assert.strictEqual(z.running.vdot,c.computeRunningZones(5000,1320).vdot);assert(!z.running.zones.old);
assert.strictEqual(z.swimming.cssPace,110.5);assert.strictEqual(z.swimming.tPaceSec,110.5);assert(!z.swimming.referenceTime);assert(!z.swimming.zones.old);
assert.strictEqual(z.strength.bench.weight,135);assert(!z.strength.squat);assert(!z.strength.deadlift);assert.strictEqual(z.biking.ftp,220);
c._persistThresholdsToZones({strength:{mode:'clear'}});z=JSON.parse(values.get('trainingZones'));assert(!z.strength);assert.strictEqual(JSON.parse(values.get('profile')).strengthThresholdUpdatedAt,null);
assert(history.length>=4);assert(syncs.includes('trainingZones'));
values.set('runningZones',JSON.stringify({vdot:70,zones:{old:true}}));
c._persistThresholdsToZones({run:{mode:'clear'}});
load(app,'function loadTrainingZones(','function saveTrainingZonesData(');
assert.strictEqual(c.loadTrainingZones('running'),null);
assert.strictEqual(JSON.parse(values.get('runningZones')),null);
console.log('Race-result replacement, coherent CSS, partial/full max clearing, history, and retry queue verified');

const retained={running:{referenceDist:'5K',referenceTime:'22:00',lastUpdated:'2030-01-01T00:00:00Z'},biking:{ftp:250,lastUpdated:'2030-01-01T00:00:00Z'},swimming:{cssPace:110,lastUpdated:'2030-01-01T00:00:00Z'},strength:{bench:{weight:135},lastUpdated:'2030-01-01T00:00:00Z'}};
values.set('trainingZones',JSON.stringify(retained));const historyBefore=history.length;
c._persistThresholdsToZones({run:{mode:'test'},bike:{mode:'test'},swim:{mode:'test'},strength:{mode:'test'}});
assert.deepStrictEqual(JSON.parse(values.get('trainingZones')),retained);assert.strictEqual(history.length,historyBefore,'test requests are not new measurements');

load(ob,'  function _normalizeRunDistance(','  function _isRecent(');
load(ob,'  function _loadExistingThresholds(','  // Reset every Build Plan');
values.set('thresholds',JSON.stringify({bike:{mode:'test',_updatedAt:retained.biking.lastUpdated}}));
assert.strictEqual(c._loadExistingThresholds().bike.mode,'test');
load(ob,'  function _applyCollapsedState(','  function _editThreshold(');
const active=new Set(),button={classList:{add:x=>active.add(x)}},body={style:{}};c._applyCollapsedState({querySelector:sel=>sel==='.ob-v2-test-me'?button:body},'bike',{mode:'test'});assert(active.has('is-active'));assert.strictEqual(body.style.display,'none');
for(const bad of [{run:{mode:'known',method:'race',raceDist:'5k'}},{bike:{mode:'known',method:'race',raceTime:'1:20'}},{swim:{mode:'known',method:'css-test',css400min:'6'}},{strength:{mode:'known',bench:'bad'}}]) {const before=values.get('trainingZones');assert.throws(()=>c._persistThresholdsToZones(bad));assert.strictEqual(values.get('trainingZones'),before);}

values.set('thresholds',JSON.stringify({bike:{mode:'test'}}));assert.strictEqual(c._loadExistingThresholds().bike.mode,'known','a newly present first benchmark fulfills an older undated request');
values.set('thresholds',JSON.stringify({bike:{mode:'test',_requestedAt:'2030-01-02T00:00:00Z'}}));assert.strictEqual(c._loadExistingThresholds().bike.mode,'test','a dated request survives an older retained measurement');
values.set('trainingZones',JSON.stringify({...retained,biking:{ftp:255,lastUpdated:'2030-01-03T00:00:00Z'}}));assert.strictEqual(c._loadExistingThresholds().bike.mode,'known','a newer actual measurement fulfills the request');
