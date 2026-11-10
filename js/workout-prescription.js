// Shared Rule Engine prescription boundary: no storage or browser dependencies.
(function(root) {
  'use strict';
  const minutes=value=>{const n=parseFloat(value);if(!(n>0))return 0;return /\b(sec|second|seconds)\b/i.test(String(value))?n/60:/\b(hr|hour|hours)\b/i.test(String(value))?n*60:n;};
  const sport=value=>{
    const d=String(value||'').toLowerCase();
    if(/^(long_run|tempo_threshold|track_workout|speed_work|hills|easy_recovery|endurance|fun_social)$/.test(d))return 'run';
    if(d.startsWith('swim_'))return 'swim';
    return {running:'run',cycling:'bike',biking:'bike',swimming:'swim',weightlifting:'strength',hyrox:'strength'}[d]||d;
  };
  function applies(entry,restriction) {
    if(!restriction)return false;
    if(!Array.isArray(restriction.disciplines)||!restriction.disciplines.length)return true;
    const d=sport(entry.discipline||entry.type);
    return restriction.disciplines.some(value=>sport(value)===d||d==='brick'&&['bike','run'].includes(sport(value)));
  }
  function effectiveLoad(load,r) {
    if(!r)return load;
    if(r.action==='remove')return 'rest';
    if(r.action!=='reduce')return load;
    if(r.type==='rest')return 'rest';
    if(['injury','sick'].includes(r.type))return load==='rest'?'rest':'easy';
    if(r.type==='fatigue')return ['hard','long'].includes(load)?'moderate':load==='moderate'?'easy':load;
    if(r.type==='time')return ['hard','long'].includes(load)?'moderate':load;
    return load;
  }
  function isRemoved(entry,r) {
    return sport(entry?.discipline)==='rest'||sport(entry?.type)==='rest'
      || String(entry?.load||'').toLowerCase()==='rest'||/^\s*rest\s*$/i.test(entry?.sessionName||entry?.name||'')
      || applies(entry||{},r) && ((r.action==='swap'&&Array.isArray(r.disciplines)&&r.disciplines.length>0)
        || effectiveLoad(entry?.load,r)==='rest');
  }
  function restrictedDuration(duration,load,r) {
    if(effectiveLoad(load,r)==='rest')return 0;
    if(!duration||!r||r.action!=='reduce')return duration;
    const factor={long:.60,hard:.65,moderate:.70,strides:.75,easy:.65}[load]||.70;
    return Math.min(duration,Math.max(15,Math.round(duration*factor)));
  }
  function scale(session,target) {
    if(!session)return null;
    if(target===0)return {...session,duration:0,steps:[]};
    const steps=session.steps||[];
    const total=steps.reduce((n,s)=>n+(Number(s.duration)||0)*(s.reps||1)+(Number(s.rest)||0)*Math.max(0,(s.reps||1)-1),0);
    if(!(target>0)||!(total>0))return session;
    return {...session,duration:target,steps:steps.map(s=>({...s,duration:s.duration*target/total,...(s.rest!=null?{rest:s.rest*target/total}:{})}))};
  }
  function normalizeEntry(entry,r) {
    if(!entry||entry.isCompletion||entry.completedAt||entry.source==='strava')return entry;
    if(r?.action==='reduce'&&['injury','sick'].includes(r.type)&&applies(entry,r)
        && (sport(entry.discipline||entry.type)==='strength'||Array.isArray(entry.exercises)))
      return {...entry,discipline:'strength',load:entry.load||'easy'};
    return entry;
  }
  function resolve(entry,restriction,{template=()=>null,fromLibrary=()=>null}={}) {
    entry=normalizeEntry(entry,restriction);
    const r=applies(entry,restriction)?restriction:null;
    const load=effectiveLoad(entry.load,r);
    if(isRemoved(entry,r))return {session:null,load:'rest',duration:0,removed:true};
    const fallback=template(entry.discipline||entry.type,load,entry.weekNumber,entry.date);
    let raw=null;
    if(entry.aiSession&&Array.isArray(entry.aiSession.intervals)&&entry.aiSession.intervals.length) {
      raw={name:entry.aiSession.title||entry.sessionName,steps:entry.aiSession.intervals.map((iv,index)=>{
        const zone=Number(String(iv.effort||'Z2').replace(/^z/i,''))||2;
        const step={type:iv.type||'main',label:iv.name||'',duration:minutes(iv.duration),zone};
        if(iv.discipline||iv.sport)step.discipline=sport(iv.discipline||iv.sport);
        if(/^\s*T1\b/i.test(step.label))step.note='T1';
        if(iv.reps>1)step.reps=iv.reps;
        if(iv.restDuration!=null)step.rest=minutes(iv.restDuration);
        else if(step.reps&&fallback?.steps?.[index]?.rest!=null)step.rest=fallback.steps[index].rest;
        return step;
      })};
    } else raw=fromLibrary(entry.libraryWorkout)||(load===entry.load&&entry.templateWorkout)||fallback;
    const duration=minutes(entry.duration)||minutes(entry.durationMin)||raw?.duration||0;
    const target=restrictedDuration(duration,entry.load,r);
    if(target===0)return {session:null,load:'rest',duration:0,removed:true};
    if(r?.action==='reduce'&&['injury','sick'].includes(r.type)) {
      // No hard intervals or loaded lifting survive a health reduction.
      const label=sport(entry.discipline||entry.type)==='strength'?'Recovery only: no loaded lifting prescribed; follow your activity clearance':'Easy effort only; follow your activity clearance';
      raw={name:'Easy recovery',duration:target,suppressTargets:true,suppressBrickLegTags:true,steps:[{type:'main',duration:target,zone:1,label}]};
    } else if(raw&&load!==entry.load) {
      const ceiling=load==='easy'?2:3;
      raw={...raw,steps:raw.steps.map(s=>({...s,zone:Math.min(Number(s.zone)||2,ceiling),label:'Reduced effort; stay within the displayed zone'}))};
    }
    return {session:scale(raw,target),load,duration:target,removed:false};
  }
  function snapshot(entry,resolved) {
    if(resolved.removed)return null;
    if(!resolved.session)return JSON.parse(JSON.stringify(entry));
    const output=JSON.parse(JSON.stringify(entry));
    for(const key of ['libraryWorkout','aiSession','templateWorkout','phases','steps','generatedSession'])delete output[key];
    if(resolved.session.suppressTargets)delete output.exercises;
    output.load=resolved.load;output.duration=resolved.duration;
    output.sessionName=resolved.session.name||entry.sessionName;
    output.templateWorkout=JSON.parse(JSON.stringify(resolved.session));
    output.aiSession={title:output.sessionName,intervals:resolved.session.steps.map(s=>({
      type:s.type,name:s.label,duration:s.duration,effort:'Z'+s.zone,
      ...(s.discipline?{discipline:s.discipline}:{}),...(s.reps?{reps:s.reps}:{}),...(s.rest!=null?{restDuration:s.rest}:{}),
    }))};
    return output;
  }
  const api={resolve,snapshot,normalizeEntry,isRemoved,scale,effectiveLoad,restrictedDuration,applies};
  if(root)root.WorkoutPrescription=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:null);
