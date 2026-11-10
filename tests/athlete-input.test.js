'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const I=require('../js/athlete-input');
const asOf='2030-03-10T12:00:00Z';
const normalize=x=>I.normalize(x,{asOf});
const raw={profile:{weight:70,weightUnit:'kg',height:180,heightUnit:'cm',daysPerWeek:4},strengthRole:'race_performance',
 selectedSports:['running'],events:[{id:'synthetic',type:'fiveK',date:'2030-08-20',goal:'get_faster',leadIn:{phase:'base'}}],
 thresholds:{run:{mode:'known',threshPace:'8:30'},bike:{mode:'known',ftp:'210'},swim:{mode:'known',cssPace:'1:50'}},
 buildPlanTemplate:{tue:['run'],wed:['run'],thu:['run'],sat:['run']}};
const before=JSON.stringify(raw),s=normalize(raw);assert.equal(JSON.stringify(raw),before);
assert.equal(s.races[0].raceType,'5k');assert.equal(s.races[0].runGoal,'get_faster');assert.equal(s.races[0].leadIn.phase,'base');
assert.equal(s.profile.age,null);assert.equal(s.profile.height,180/2.54);assert.equal(s.profile.weight,70*2.20462);
assert.equal(s.profile.thresholdPace,8.5);assert.equal(s.profile.cssTime,110);assert.equal(s.profile.ftp,210);
assert.equal(s.profile.strengthRole,'race_performance');assert.deepEqual(s.profile.preferredDays,[2,3,4,6]);
assert.deepEqual(normalize({...raw,profile:{weight:70*2.20462,height:180/2.54,daysPerWeek:4}}).profile,s.profile,'equivalent units produce identical profiles');
for(const type of ['halfIronman','half-ironman'])assert.equal(normalize({...raw,events:[{type,date:'2030-09-10'}]}).races[0].raceType,'half-ironman');
assert.throws(()=>normalize({...raw,events:[{type:'ultra',date:'2030-02-30'}]}));
assert.throws(()=>normalize({...raw,events:[...raw.events,{type:'tenK',date:'2030-09-10'}]}));
assert.throws(()=>normalize({...raw,profile:{weightUnit:'stone'}}));
assert.equal(normalize({trainingGoals:['speed']}).profile.goal,'speed_performance');
assert.equal(normalize({}).profile.age,null);assert.equal(normalize({}).profile.weight,null);
const report={sleep_quality:1,energy_level:1,soreness_level:5,timestamp:asOf};
const current=I.normalizeCheckIn(report,{asOf});assert.equal(current.recoveryState,'low');
assert.deepEqual(I.normalizeCheckIn({sleepQuality:1,energyLevel:1,soreness:5,observedAt:asOf},{asOf}),current);
for(const input of [null,{}, {...report,timestamp:null},{...report,timestamp:'2029-01-01'}, {...report,timestamp:'2031-01-01'}, {...report,sleep_quality:null},{...report,sleep_quality:0}])assert.equal(I.normalizeCheckIn(input,{asOf}).recoveryState,'unknown');
const c={window:{AthleteInput:I}};vm.createContext(c);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/athlete-classifier.js'),'utf8'),c);
const classified=c.window.AthleteClassifier.classify({...s.profile,latestCheckIn:current});assert.equal(classified.recoveryState,'low');assert.equal(classified.strengthRole,'race_performance');assert.equal(classified.age,null);assert.equal(classified.ageGroup,'unknown');
assert.equal(c.window.AthleteClassifier.classify({latestCheckIn:null}).recoveryState,'unknown');
// Use the real wizard adapter rather than an imitation.
const h={window:null,Date,Math,console,localStorage:{getItem:()=>null},document:{addEventListener(){}},setTimeout,clearTimeout};h.window=h;
vm.createContext(h);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/onboarding-v2.js'),'utf8'),h);
const event=h.OnboardingV2._mapRacesToLegacyEvents([{type:'5k',date:'2030-08-20',goal:'get_faster',leadIn:{phase:'base'}}])[0];
assert.equal(event.runGoal,'get_faster');assert.equal(event.leadIn.phase,'base');assert.equal(event.level,undefined);
assert.equal(I.normalizeCheckIn({...report,sleepQuality:5},{asOf}).recoveryState,'unknown');
assert.equal(I.normalizeCheckIn({...report,recoveryState:'good'},{asOf}).recoveryState,'low');
console.log('PASS: real race adapter, unit equivalence, preserved goals/roles, unknown facts and dated canonical recovery');

(async()=>{const {setup}=require('./empty-plan-regression.test');const h=setup();await h.ob._confirmAndSavePlan();assert.equal(h.ob._state.currentScreen,'bp-v2-done');const actual=h.DB.captureAthleteInput();assert.equal(actual.profile.strengthRole,'');assert.ok(actual.races.length);assert.deepEqual(Array.from(actual.profile.preferredDays),[2,3,4,6]);h.store.set('strengthRole','injury_prevention');assert.equal(h.DB.captureAthleteInput().profile.strengthRole,'injury_prevention');h.store.set('profile','broken');assert.throws(()=>h.DB.captureAthleteInput());console.log('PASS: actual wizard save to DB capture preserves primitive strings, schedule and malformed-input failure');})().catch(e=>{console.error(e);process.exitCode=1;});
// Source freshness and real legacy formats.
const fresher=normalize({thresholds:{bike:{ftp:200,_updatedAt:'2029-01-01'},swim:{cssPace:140}},trainingZones:{biking:{ftp:300,lastUpdated:'2030-03-01'},swimming:{css:110,cssPace:110,lastUpdated:'2030-03-01'}}});
assert.equal(fresher.profile.ftp,300);assert.equal(fresher.profile.cssTime,110);assert.equal(fresher.profile.thresholdSources.bike.source,'training_zones');
assert.equal(normalize({draft:true,thresholds:{bike:{mode:'known',ftp:205}},trainingZones:{biking:{ftp:300}}}).profile.ftp,205);
assert.equal(normalize({draft:true,thresholds:{bike:{mode:'test'}},trainingZones:{biking:{ftp:300}}}).profile.ftp,null);
assert.equal(normalize({thresholds:{bike:{method:'20min-test',twentyMinWatts:200}}}).profile.ftp,190);
assert.equal(normalize({thresholds:{swim:{method:'css-test',css400min:8,css400sec:0,css200min:3,css200sec:30}}}).profile.cssTime,135);
assert.deepEqual(normalize({buildPlanTemplate:{mon:['rest'],tue:['run']}}).profile.preferredDays,[2]);
const historyInput={events:[{type:'other',priority:'A',date:'2029-01-01'},{type:'ironman',priority:'A',date:'2030-09-01',preferences:{sessionLengthMin:45}}]};
assert.equal(normalize(historyInput).races.length,1);assert.equal(normalize(historyInput).pastRaces.length,1);assert.equal(normalize(historyInput).profile.sessionLength,45);
assert.equal(normalize({events:[historyInput.events[0]],trainingGoals:['speed']}).profile.goal,'speed_performance');
assert.equal(normalize({trainingGoals:['stronger']}).profile.strengthGoal,'get_stronger');
assert.equal(I.normalizeCheckIn({observedAt:asOf,recoveryState:'good'},{asOf}).recoveryState,'unknown');
assert.equal(I.normalizeCheckIn({observedAt:asOf,recoveryState:'good',sleepQuality:0},{asOf}).recoveryState,'unknown');
assert.equal(normalize({}).startDate,'2030-03-10','pure default date is UTC, never ambient host time');
assert.equal(I.normalize({}, {asOf,timeZone:'Pacific/Kiritimati'}).startDate,'2030-03-11');
// Real weekly form: acknowledge atomically and keep difficulty-only recovery unknown.
(async()=>{const {setup}=require('./empty-plan-regression.test');
 for(const fail of [false,true]) {const h=setup();vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/weekly-checkin.js'),'utf8'),h.context);
 h.node('confirm').dataset={value:'just-right'};if(fail)h.reject();h.node('weekly-checkin-overlay').style.display='flex';await h.context.submitWeeklyCheckin();
 if(fail){assert.equal(h.node('weekly-checkin-overlay').style.display,'flex');assert.ok(h.node('weekly-checkin-error').textContent);assert.equal(h.store.has('checkinHistory'),false);}
 else {assert.equal(h.node('weekly-checkin-overlay').style.display,'none');assert.equal(h.store.get('currentRecoveryState'),'unknown');assert.equal(h.read('latestCheckIn').recoveryState,'unknown');assert.equal(h.read('checkinHistory').length,1);assert.equal(h.writes.length,1);assert.equal(h.writes[0].length,3);}}
 console.log('PASS: threshold freshness/history/rest days/strength goal and real check-in acknowledged success/failure');
})().catch(e=>{console.error(e);process.exitCode=1;});

assert.equal(normalize({thresholds:{bike:{ftp:200,_updatedAt:'2029-01-01'}},trainingZones:{biking:{ftp:300,lastUpdated:'2031-01-01'}}}).profile.ftp,200);
assert.equal(normalize({trainingZones:{biking:{ftp:300,lastUpdated:'invalid'}}}).profile.ftp,null);
const originalRaceSource={running:{referenceDist:'5k',referenceTime:'23:00',vdot:42}};assert.deepEqual(normalize({trainingZones:originalRaceSource}).sourceInputs.trainingZones,originalRaceSource);
assert.equal(I.normalizeCheckIn({sleepQuality:1,energyLevel:5,soreness:1,observedAt:asOf},{asOf}).recoveryState,'low');
assert.equal(I.normalizeCheckIn({sleepQuality:'poor',energyLevel:'high',soreness:'mild',observedAt:asOf},{asOf}).recoveryState,'low');

assert.equal(I.normalizeCheckIn({sleepQuality:2.5,energyLevel:2.5,soreness:2.5,observedAt:asOf},{asOf}).recoveryState,'unknown');
assert.equal(normalize({trainingZones:{running:{vdot:60,lastUpdated:'2031-01-01'}}}).profile.runVDOT,null);

const conflictReport=I.normalizeCheckIn({...report,sleepQuality:5},{asOf});assert.equal(I.normalizeCheckIn(JSON.parse(JSON.stringify(conflictReport)),{asOf}).recoveryState,'unknown','persisted intrinsic conflicts cannot turn into good recovery');
(async()=>{const {setup}=require('./empty-plan-regression.test');const h=setup();vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/weekly-checkin.js'),'utf8'),h.context);h.node('confirm').dataset={value:'too-hard'};const stamp=new Date(Date.now()-86400000).toISOString();h.store.set('latestCheckIn',JSON.stringify({sleepQuality:5,energyLevel:5,soreness:1,observedAt:stamp}));await h.context.submitWeeklyCheckin();assert.equal(h.read('latestCheckIn').observedAt,stamp);assert.equal(h.store.get('currentRecoveryState'),'good');console.log('PASS: difficulty feedback preserves existing wellness observation time and values');})().catch(e=>{console.error(e);process.exitCode=1;});
