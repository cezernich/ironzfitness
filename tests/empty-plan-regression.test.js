'use strict';
// Real onboarding → live planner → DB boundary; synthetic data only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.IRONZ_TEST_SOURCE || path.resolve(__dirname, '..');
let qaCase=0;
const watchdog=require.main===module ? setTimeout(()=>{console.error("FAIL: async regression did not complete, case"+qaCase);process.exit(1);},10000) : null;
function setup() {
  qaCase++;
  const store = new Map(), remote = new Map(), alerts = [], writes = [];
  let rejectSave = false, quotaKey = null, savingGate = null, authUid = 'synthetic-a';
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { style: {}, classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
        setAttribute() {}, querySelectorAll: () => [], closest: selector => node(selector.includes('container') ? 'container' : 'bp-v2-overlay') });
    }
    return nodes.get(id);
  }
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, Date, Math, JSON, Map, Set, Promise,
    setTimeout: () => 1, clearTimeout() {}, navigator: { onLine: true }, ICONS: {},
    localStorage: { getItem: k => store.get(k) ?? null, setItem(k,v) { if (quotaKey === k) { quotaKey = null; throw Error('Storage full'); } store.set(k,String(v)); }, removeItem: k => store.delete(k) },
    document: { getElementById: node, querySelector: () => node('confirm'), body: node('body'), addEventListener() {} },
    alert: msg => alerts.push(msg), confirm: () => true,
  });
  context.window = context;
  const session = async () => ({ data: { session: authUid ? { user: { id: authUid } } : null } });
  context.supabaseClient = { auth: { getSession: session, refreshSession: session },
    from(table) { assert.equal(table, 'user_data'); return { async upsert(rows) {
      writes.push(rows); if (savingGate) await savingGate;
      if (rejectSave) return { error: { message: 'synthetic rejection' } };
      for (const row of Array.isArray(rows) ? rows : [rows]) remote.set(row.data_key, JSON.stringify(row.data_value));
      return { error: null };
    } }; } };
  for (const file of ['js/db.js', 'js/plan-restrictions.js', 'js/plan-session-distribution.js', 'js/plan-constraint-validator.js', 'js/planner.js', 'js/onboarding-v2.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'), context, { filename: file });
  const DB = vm.runInContext('DB',context), ob = context.OnboardingV2;
  const read = k => JSON.parse(store.get(k) || 'null');
  store.set('ironz_last_user_id','synthetic-a');
  store.set('trainingPlan',JSON.stringify([{ date: '2026-12-01', discipline: 'run', load: 'easy', raceId: 'previous' }]));
  store.set('workoutSchedule',JSON.stringify([{ date: '2026-12-02', discipline: 'run', raceId: 'previous' }]));
  store.set('events',JSON.stringify([{ id: 'previous', type: 'fiveK', date: '2027-02-15' }]));
  const raceDate = new Date(); raceDate.setDate(raceDate.getDate()+98);
  Object.assign(ob._state, { mode: 'buildplan', selectedSports: ['run'], trainingGoals: ['race'],
    raceEvents: [{ name: 'Synthetic QA 5K', type: '5k', date: raceDate.toISOString().slice(0,10), priority: 'A' }],
    thresholds: { running_threshold_pace: '10:30' }, schedule: { mon: [], tue: ['run'], wed: ['run'], thu: ['run'], fri: [], sat: ['run'], sun: [] } });
  return { context, DB, ob, store, remote, alerts, writes, read, node,
    reject: () => { rejectSave = true; }, quota: () => { quotaKey = 'trainingPlan'; }, gate: p => { savingGate = p; },
    user: uid => { authUid = uid; } };
}
async function until(check, message) {
  for (let i = 0; i < 100 && !check(); i++) await Promise.resolve();
  assert.ok(check(), message);
}
async function run() {
  for (const [input,expected] of [['5k','fiveK'],['10k','tenK'],['century','centuryRide']]) {
    const h=setup(), race=h.ob._mapRacesToLegacyEvents([{type:input,date:h.ob._state.raceEvents[0].date}])[0];
    assert.equal(race.type,expected,`${input} must cross the onboarding boundary as a supported ID`);
    assert.ok(h.context.generateTrainingPlan(race).some(e=>!['race','rest'].includes(e.discipline)), `${input} generates training sessions`);
  }
  for (const failure of ['empty','throw','malformed','race-only','missing','unsupported','quota','backend','frozen']) {
    const h=setup(), before=new Map(h.store);
    if (failure==='empty') h.context.generateTrainingPlan=()=>[];
    if (failure==='throw') h.context.generateTrainingPlan=()=>{throw Error('Synthetic generator failure');};
    if (failure==='malformed') h.context.generateTrainingPlan=()=>[{date:'bad',discipline:'run'}];
    if (failure==='race-only') h.context.generateTrainingPlan=()=>[{date:'2027-01-01',discipline:'race',load:'race'}];
    if (failure==='missing') h.context._regeneratePlanForRace=undefined;
    if (failure==='unsupported') h.ob._state.raceEvents[0].type='unsupported';
    if (failure==='quota') h.quota();
    if (failure==='backend') h.reject();
    if (failure==='frozen') h.context.isPlanFrozen=()=>true;
    await h.ob._confirmAndSavePlan();
    assert.deepEqual([...h.store],[...before],`${failure} preserves all previous state`);
    assert.ok(h.node('bp-v2-plan-error').textContent,`${failure} has visible feedback`);
    assert.notEqual(h.ob._state.currentScreen,'bp-v2-done',`${failure} must not show success`);
    assert.equal(h.remote.size,0,`${failure} must not commit partial data`);
    assert.equal(h.node('confirm').disabled,false);
  }
  // Every actual non-race sport-card output remains supported by validation.
  for (const [sport,discipline] of [['run','run'],['bike','bike'],['swim','swim'],['strength','strength'],['hiit','hiit'],['yoga','yoga'],['mobility','mobility'],['walking','walk'],['rowing','row'],['hyrox','hyrox'],['circuit','circuit']]) {
    const h=setup(); h.ob._state.raceEvents=[]; h.ob._state.selectedSports=[sport];
    h.ob._state.trainingGoals=['general'];
    h.ob._state.schedule={mon:[sport],tue:[],wed:[],thu:[],fri:[],sat:[],sun:[]};
    await h.ob._confirmAndSavePlan();
    assert.equal(h.ob._state.currentScreen,'bp-v2-done',sport+' can build a non-race plan');
    assert.ok(h.read('workoutSchedule').some(e=>e.discipline===discipline),sport+' keeps its discipline');
  }
  // Direct generation is used outside the wizard (race edit/save/self-heal).
  { const h=setup(); const start=new Date(); start.setDate(start.getDate()+20);
    const race={id:'direct',type:'fiveK',date:h.ob._state.raceEvents[0].date,preferences:{startDate:start.toISOString().slice(0,10),weeklyTemplate:{tue:['run']},daysPerWeek:1}};
    for(const input of [race,{aRace:race,bRaces:[],all:[race]}]) {
      const plan=h.context.generateTrainingPlan(input).filter(e=>e.discipline!=='race');
      assert.ok(plan.length>5);
      assert.ok(plan.every(e=>e.date>=race.preferences.startDate && new Date(e.date+'T00:00:00Z').getUTCDay()===2 && e.discipline==='run'),'direct/calendar entry points preserve dates and sports');
    }
    const legacy={id:'legacy-cap',type:'fiveK',date:h.ob._state.raceEvents[0].date,daysPerWeek:2};
    const capped=h.context._regeneratePlanForRace(legacy,{persist:false}).trainingPlan.filter(e=>e.raceId==='legacy-cap' && e.discipline!=='race' && e.load!=='rest');
    const weeks={};
    for(const e of capped) { const d=new Date(e.date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);(weeks[d.toISOString().slice(0,10)] ||= new Set()).add(e.date); }
    assert.ok(Object.values(weeks).every(days=>days.size<=2),'legacy cap holds across Base, threshold and Race Week');
  }
  // Same-race replacement must not clear scaffolding on failure.
  { const h=setup(); h.context.generateTrainingPlan=()=>[];
    const before=JSON.stringify([...h.store]);
    assert.throws(()=>h.context._regeneratePlanForRace({id:'previous',type:'unsupported',date:'2027-02-15'}, {persist:false}));
    assert.equal(JSON.stringify([...h.store]),before);
  }
  { const h=setup();
    assert.ok(h.context._regeneratePlanForRace({id:'previous',type:'5k',date:h.ob._state.raceEvents[0].date}));
    h.context.isPlanFrozen=()=>true;
    const before=JSON.stringify([...h.store]);
    assert.equal(h.context._regeneratePlanForRace({id:'previous',type:'5k',date:h.ob._state.raceEvents[0].date}),null);
    assert.equal(JSON.stringify([...h.store]),before,'frozen background regeneration does not crash or erase');
  }
  { const h=setup(); let resolve; h.gate(new Promise(r=>{resolve=r;}));
    const first=h.ob._confirmAndSavePlan(); await Promise.resolve(); await h.ob._confirmAndSavePlan();
    assert.notEqual(h.ob._state.currentScreen,'bp-v2-done','no success while save pending');
    resolve(); await first;
    assert.equal(h.writes.length,1,'double click commits once');
    assert.equal(h.ob._state.currentScreen,'bp-v2-done');
    assert.ok(h.read('trainingPlan').length>20);
    const savedRace=h.read('events').find(e=>e.id!=='previous');
    const sessions=h.read('trainingPlan').filter(e=>e.raceId===savedRace.id && e.discipline!=='race');
    assert.ok(sessions.every(e=>[2,3,4,6].includes(new Date(e.date+'T00:00:00Z').getUTCDay())), 'full saved arc honors selected weekdays, including race/test weeks');
    assert.ok(sessions.every(e=>e.discipline==='run'), 'running-only preview never silently adds strength');
    const firstFullWeek=sessions.filter(e=>e.phase==='Base').reduce((weeks,e)=>{
      const d=new Date(e.date+'T00:00:00Z'); const offset=(d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-offset);
      const monday=d.toISOString().slice(0,10); (weeks[monday] ||= []).push(e); return weeks;
    },{});
    assert.ok(Object.values(firstFullWeek).some(entries=>entries.length===4),'full Base weeks retain all four selected days, including UTC+ time zones');
    assert.equal(h.read('events').length,2);
    assert.equal(h.read('events')[0].priority,'B','previous A is demoted only on success');
    assert.equal(h.read('events')[1].priority,'A');
    assert.equal(h.remote.get('trainingPlan'),h.store.get('trainingPlan'),'server and cache agree');
    assert.ok(h.read('trainingPlan').some(e=>e.raceId==='previous'),'unrelated race retained');
  }
  { const h=setup(); h.ob._state.raceEvents=[]; await h.ob._confirmAndSavePlan();
    assert.equal(h.ob._state.currentScreen,'bp-v2-done'); assert.ok(h.read('workoutSchedule').length>4);
  }
  { const h=setup(); h.ob._state.raceEvents=[]; h.context.isPlanFrozen=()=>true;
    await h.ob._confirmAndSavePlan(); assert.notEqual(h.ob._state.currentScreen,'bp-v2-done'); assert.equal(h.remote.size,0);
  }
  // A save already sent under A may finish after sign-out/switch, but must never
  // repopulate the signed-out cache or write A's plan into B's active cache.
  for (const nextUser of [null, 'synthetic-b']) {
    const h=setup(); let resolve; h.gate(new Promise(r=>{resolve=r;}));
    const save=h.ob._confirmAndSavePlan();
    await until(()=>h.writes.length===1,'save must reach the backend before account transition');
    h.user(nextUser); h.store.clear();
    if (nextUser) {
      h.store.set('ironz_last_user_id',nextUser);
      h.store.set('profile',JSON.stringify({ name: 'Synthetic B' }));
    }
    const afterTransition=[...h.store]; resolve(); await save;
    assert.deepEqual([...h.store],afterTransition,'late completion must not restore the prior account cache');
    assert.notEqual(h.ob._state.currentScreen,'bp-v2-done','account transition must not display success');
    assert.ok(h.node('bp-v2-plan-error').textContent,'account transition requires visible feedback');
    assert.ok(h.writes[0].every(row=>row.user_id==='synthetic-a'),'only original authenticated account is written');
  }
  // Storage may fill while the network is pending, after the preflight passed.
  { const h=setup(); let resolve; h.gate(new Promise(r=>{resolve=r;}));
    const before=[...h.store]; const save=h.ob._confirmAndSavePlan();
    await until(()=>h.writes.length===1,'save reached backend before late quota failure');
    h.quota(); resolve(); await save;
    assert.ok(JSON.parse(h.remote.get('trainingPlan')).length>20,'server accepted replacement');
    assert.deepEqual([...h.store].sort(),before.sort(),'device cache rolls back as a whole');
    assert.match(h.node('bp-v2-plan-error').textContent,/saved to your account.*Reload/);
    assert.notEqual(h.ob._state.currentScreen,'bp-v2-done');
    assert.equal(h.node('confirm').disabled,true,'retry blocked until acknowledged plan is reloaded');
    await h.ob._confirmAndSavePlan(); await h.DB.flushKey('trainingPlan');
    assert.equal(h.writes.length,1,'retry/background sync must not replace acknowledged plan from stale cache');
  }
  // A background write of the old plan has started before confirmation. It must
  // settle before the replacement is sent, otherwise its late commit wins.
  { const h=setup(); let resolve; h.gate(new Promise(r=>{resolve=r;}));
    const oldSync=h.DB.flushKey('trainingPlan');
    await until(()=>h.writes.length===1,'old plan sync must be in flight');
    const save=h.ob._confirmAndSavePlan();
    for (let i=0;i<20;i++) await Promise.resolve();
    assert.equal(h.writes.length,1,'replacement waits for the in-flight old plan write');
    resolve(); await oldSync; await save;
    assert.equal(h.writes.length,2,'replacement is committed after older sync settles');
    assert.ok(Array.isArray(h.writes[1]),'replacement uses one batch statement');
    assert.equal(h.ob._state.currentScreen,'bp-v2-done');
    assert.equal(h.remote.get('trainingPlan'),h.store.get('trainingPlan'),'late old write cannot overwrite replacement');
    assert.ok(h.read('trainingPlan').length>20);
    const savedRace=h.read('events').find(e=>e.id!=='previous');
    const sessions=h.read('trainingPlan').filter(e=>e.raceId===savedRace.id && e.discipline!=='race');
    assert.ok(sessions.every(e=>[2,3,4,6].includes(new Date(e.date+'T00:00:00Z').getUTCDay())), 'full saved arc honors selected weekdays, including race/test weeks');
    assert.ok(sessions.every(e=>e.discipline==='run'), 'running-only preview never silently adds strength');
    const firstFullWeek=sessions.filter(e=>e.phase==='Base').reduce((weeks,e)=>{
      const d=new Date(e.date+'T00:00:00Z'); const offset=(d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-offset);
      const monday=d.toISOString().slice(0,10); (weeks[monday] ||= []).push(e); return weeks;
    },{});
    assert.ok(Object.values(firstFullWeek).some(entries=>entries.length===4),'full Base weeks retain all four selected days, including UTC+ time zones');
  }
  clearTimeout(watchdog);
  console.log('PASS: onboarding aliases, generation failures, prior-plan preservation, checked persistence, double-click and non-race flows');
}
module.exports={setup};
if(require.main===module) run().catch(e=>{console.error(e);process.exitCode=1;});
