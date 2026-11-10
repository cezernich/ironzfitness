// Canonical input boundary shared by engine callers. No storage or provider IO.
(function(root) {
  'use strict';
  const VERSION='athlete-input-v1';
  const sports={running:'run',cycling:'bike',biking:'bike',swimming:'swim',weightlifting:'strength',lifting:'strength',walking:'walk',rowing:'row'};
  const races={fiveK:'5k',tenK:'10k',halfMarathon:'half-marathon',halfIronman:'half-ironman',sprint:'sprint-tri',olympic:'olympic-tri',century:'cycling',centuryRide:'cycling',granFondo:'cycling'};
  const days=['sun','mon','tue','wed','thu','fri','sat'];
  const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
  const number=x=>x!==null&&x!==undefined&&x!==''&&typeof x!=='boolean'&&Number.isFinite(Number(x))?Number(x):null;
  const positive=x=>number(x)>0?number(x):null;
  function date(value) { return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value; }
  function localDate(now,timeZone='UTC') { const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now); const get=type=>parts.find(p=>p.type===type).value;return get('year')+'-'+get('month')+'-'+get('day'); }
  function pace(value) {
    if(typeof value==='string'&&/^\d+:\d{2}$/.test(value)) {const [m,s]=value.split(':').map(Number);return s<60&&m+s>0?m+s/60:null;}
    return positive(value);
  }
  function normalizeRace(raw) {
    if(!raw||!date(raw.date)) throw Error('Choose a valid race date.');
    const raceType=races[raw.raceType||raw.type]||raw.raceType||raw.type;
    if(!['5k','10k','half-marathon','marathon','ultra','sprint-tri','olympic-tri','half-ironman','ironman','cycling','hyrox'].includes(raceType)) throw Error('This race type is not supported by the unified engine yet.');
    const priority=String(raw.priority||'A').toUpperCase();
    if(!['A','B','C'].includes(priority)) throw Error('Choose a valid race priority.');
    return {...clone(raw),raceType,priority,runGoal:raw.runGoal||raw.goal||null,leadIn:clone(raw.leadIn||null)};
  }
  function normalizeCheckIn(raw,options={}) {
    const asOf=new Date(options.asOf||new Date());
    if(!Number.isFinite(asOf.getTime())) throw Error('Invalid evaluation time.');
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) return {recoveryState:'unknown',quality:'missing',observedAt:null};
    const observedAt=raw.observedAt||raw.timestamp||null;
    const stamp=observedAt?Date.parse(observedAt):NaN;
    // A weekly check-in cannot silently remain current forever. Seven days
    // is a freshness policy, not a clinical readiness threshold.
    let quality=!Number.isFinite(stamp)?'undated':stamp>asOf.getTime()?'future':asOf.getTime()-stamp>7*86400000?'stale':'current';
    const aliases=[['sleepQuality','sleep_quality','sleep'],['energyLevel','energy_level','energy'],['soreness','soreness_level','sorenessLevel']];
    const values=aliases.map(keys=>keys.map(k=>raw[k]).find(v=>v!==undefined&&v!==null&&v!==''));
    const conflicts=aliases.some(keys=>{const found=keys.map(k=>raw[k]).filter(v=>v!==undefined&&v!==null&&v!=='');return found.some(v=>String(v)!==String(found[0]));});
    if(conflicts||['conflicting','invalid'].includes(raw.quality))quality=raw.quality==='invalid'?'invalid':'conflicting';
    const validScore=v=>Number.isInteger(number(v))&&number(v)>=1&&number(v)<=5;
    let recoveryState='unknown';
    if(quality==='current') {
      const explicit=raw.recoveryState;
      let [sleep,energy,soreness]=values;
      if(values.every(validScore)) {
        sleep=Number(sleep)<=2?'poor':Number(sleep)===3?'fair':'good';
        energy=Number(energy)<=2?'low':Number(energy)===3?'moderate':'high';
        soreness=Number(soreness)>=4?'severe':Number(soreness)===3?'moderate':'mild';
      }
      const known=['poor','fair','good'].includes(sleep)&&['low','moderate','high'].includes(energy)&&['none','mild','moderate','severe'].includes(soreness);
      if(known) {
        const moderate=[sleep==='fair',energy==='moderate',soreness==='moderate'].filter(Boolean).length;
        recoveryState=sleep==='poor'||energy==='low'||soreness==='severe'||moderate>=2?'low':moderate?'moderate':'good';
      }
      if(recoveryState!=='unknown'&&['good','moderate','low'].includes(explicit)&&['good','moderate','low'].indexOf(explicit)>['good','moderate','low'].indexOf(recoveryState)) recoveryState=explicit;
    }
    return {sleepQuality:values[0]??null,energyLevel:values[1]??null,soreness:values[2]??null,observedAt,recoveryState,quality};
  }
  function normalize(input={},options={}) {
    const raw=clone(input),p=raw.profile||{},thresholds=raw.thresholds||{},zones=raw.trainingZones||{};
    const now=new Date(options.asOf||raw.asOf||new Date());
    if(!Number.isFinite(now.getTime()))throw Error('Invalid evaluation time.');
    const timeZone=options.timeZone||raw.timeZone||p.timeZone||'UTC';
    const today=localDate(now,timeZone); // Also validates the IANA zone.
    const events=raw.races??raw.events??raw.raceEvents??p.races??[];
    if(!Array.isArray(events)||events.some(event=>!event||!date(event.date)))throw Error('Choose valid race dates.');
    const earliest=raw.startDate||today;
    if(!date(earliest))throw Error('Choose a valid plan start date.');
    const pastRaces=events.filter(event=>event.date<earliest);
    const normalizedRaces=events.filter(event=>event.date>=earliest).map(normalizeRace);
    if(normalizedRaces.filter(r=>r.priority==='A').length>1)throw Error('Choose one primary race before building the plan.');
    const primary=normalizedRaces.find(r=>r.priority==='A')||null;
    const template=raw.weeklyTemplate??raw.buildPlanTemplate??primary?.preferences?.weeklyTemplate??null;
    const selectedSports=[...new Set((raw.selectedSports??p.selectedSports??[]).flatMap(s=>s==='triathlon'?['swim','bike','run']:[sports[s]||s]))];
    const preferredDays=template?days.map((d,i)=>Array.isArray(template[d])&&template[d].some(slot=>slot&&slot!=='rest')?i:null).filter(v=>v!==null):(p.preferredDays||null);
    if(preferredDays&&(!Array.isArray(preferredDays)||preferredDays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(preferredDays).size!==preferredDays.length))throw Error('Choose valid training weekdays.');
    const weight=positive(p.weight??p.weightLbs),height=positive(p.height??p.heightIn);
    const weightUnit=p.weightUnit||'lbs',heightUnit=p.heightUnit||'in';
    if(!['kg','lb','lbs'].includes(weightUnit)||!['cm','in','inches'].includes(heightUnit))throw Error('Choose supported body measurement units.');
    const run=thresholds.run||{},swim=thresholds.swim||{},bike=thresholds.bike||{};
    const timed=(min,sec)=>number(min)!==null&&number(sec)!==null&&number(sec)>=0&&number(sec)<60?number(min)*60+number(sec):null;
    const cssTest400=timed(swim.css400min,swim.css400sec),cssTest200=timed(swim.css200min,swim.css200sec);
    const css=value=>typeof value==='string'&&value.includes(':')?(pace(value)===null?null:Math.round(pace(value)*60000)/1000):positive(value);
    const candidate=(value,stamp,source)=>({value,observedAt:stamp||null,source,quality:!stamp?'undated':!Number.isFinite(Date.parse(stamp))?'invalid':Date.parse(stamp)>now.getTime()?'future':'dated'});
    const choose=(draft,zone,legacy,mode)=>{
      if(raw.draft===true) return mode==='test'?candidate(null,null,'requested_test'):['future','invalid'].includes(draft.quality)?candidate(null,null,'unknown'):draft;
      const choices=[zone,draft,legacy].filter(c=>c.value!==null&&c.value!==undefined&&!['future','invalid'].includes(c.quality));
      // Newest dated measurement wins. For undated legacy data retain the
      // existing Training Zones precedence; missing dates stay visible.
      choices.sort((a,b)=>(Date.parse(b.observedAt)||0)-(Date.parse(a.observedAt)||0));
      return choices[0]||candidate(null,null,'unknown');
    };
    const resolved={
      runReference:choose(candidate(run.method==='race'&&run.raceDist&&run.raceTime?{referenceDist:run.raceDist,referenceTime:run.raceTime}:null,run._updatedAt,'wizard'),candidate(zones.running?.referenceDist&&zones.running?.referenceTime?{referenceDist:zones.running.referenceDist,referenceTime:zones.running.referenceTime}:null,zones.running?.lastUpdated||zones.running?.calculatedAt||p.thresholdPaceUpdated,'training_zones'),candidate(p.runReference||null,p.thresholdPaceUpdated,'profile'),run.mode),
      vdot:choose(candidate(positive(run.vdot),run._updatedAt,'wizard'),candidate(positive(zones.running?.vdot),zones.running?.lastUpdated||zones.running?.calculatedAt||p.thresholdPaceUpdated,'training_zones'),candidate(positive(p.runVDOT),p.thresholdPaceUpdated,'profile'),run.mode),
      run:choose(candidate(pace(run.threshPace??thresholds.running_threshold_pace),run._updatedAt,'wizard'),candidate(pace(zones.running?.thresholdPace),zones.running?.lastUpdated||zones.running?.calculatedAt||p.thresholdPaceUpdated,'training_zones'),candidate(pace(p.thresholdPace),p.thresholdPaceUpdated,'profile'),run.mode),
      bike:choose(candidate(positive(bike.ftp??thresholds.cycling_ftp)??(bike.method==='20min-test'&&positive(bike.twentyMinWatts)?Math.round(Number(bike.twentyMinWatts)*0.95):null),bike._updatedAt,'wizard'),candidate(positive(zones.biking?.ftp),zones.biking?.lastUpdated||zones.biking?.calculatedAt||p.ftpUpdated,'training_zones'),candidate(positive(p.ftp),p.ftpUpdated,'profile'),bike.mode),
      swim:choose(candidate(css(swim.cssPace??swim.css)??(cssTest400>cssTest200&&cssTest200>0?(cssTest400-cssTest200)/2:null),swim._updatedAt,'wizard'),candidate(css(zones.swimming?.tPaceSec??zones.swimming?.css??zones.swimming?.cssPace??zones.swimming?.tPaceStr),zones.swimming?.lastUpdated||zones.swimming?.calculatedAt||p.cssTimeUpdated,'training_zones'),candidate(positive(p.cssTime),p.cssTimeUpdated,'profile'),swim.mode)
    };
    const trainingGoals=clone(raw.trainingGoals??p.trainingGoals??[]);
    const daysAvailable=preferredDays?preferredDays.length:number(primary?.preferences?.daysPerWeek??p.availableDaysPerWeek??p.daysAvailable??p.daysPerWeek);
    if(daysAvailable!==null&&(!Number.isInteger(daysAvailable)||daysAvailable<0||daysAvailable>7))throw Error('Choose a valid number of training days.');
    const profile={...p,asOf:now.toISOString(),timeZone,age:positive(p.age),weight:weight===null?null:weightUnit==='kg'?weight*2.20462:weight,
      height:height===null?null:heightUnit==='cm'?height/2.54:height,weightUnit:'lbs',heightUnit:'in',
      gender:p.gender||'not_specified',selectedSports,preferredDays,availableDaysPerWeek:daysAvailable,
      sessionLength:positive(primary?.preferences?.sessionLengthMin??p.sessionLength??p.sessionDurationMin),trainingGoals,
      goal:normalizedRaces.length?'race_performance':trainingGoals.some(goal=>['faster','speed'].includes(goal))?'speed_performance':trainingGoals.includes('endurance')?'endurance':trainingGoals.includes('weight')?'fat_loss':p.goal||'general_fitness',
      strengthGoal:trainingGoals.includes('stronger')?'get_stronger':p.strengthGoal||null,
      strengthRole:raw.strengthRole??p.strengthRole??null,thresholdPace:resolved.run.value,ftp:resolved.bike.value,cssTime:resolved.swim.value,
      runVDOT:resolved.vdot.value,runReference:resolved.runReference.value,thresholdSources:resolved,rawThresholds:clone(thresholds),
      equipmentProfile:clone(raw.equipmentProfile??p.equipmentProfile??[]),latestCheckIn:normalizeCheckIn(raw.latestCheckIn??p.latestCheckIn,{asOf:now}),
      longDays:clone(raw.longDays??p.longDays??null),races:normalizedRaces};
    const unknown=['age','weight','height','availableDaysPerWeek','sessionLength','thresholdPace','ftp','cssTime'].filter(k=>profile[k]===null);
    const startDate=raw.startDate??primary?.preferences?.startDate??today;
    if(!date(startDate))throw Error('Choose a valid plan start date.');
    return {version:VERSION,asOf:now.toISOString(),timeZone,startDate,profile,races:normalizedRaces,pastRaces,weeklyTemplate:clone(template),
      unknown,source:'athlete_input',sourceInputs:{profile:clone(p),thresholds:clone(thresholds),trainingZones:clone(zones)},blockedPeriods:clone(raw.blockedPeriods||[]),history:clone(raw.history||[])};
  }
  const api={VERSION,normalize,normalizeRace,normalizeCheckIn,number,pace,date,localDate};
  if(root)root.AthleteInput=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:null);
