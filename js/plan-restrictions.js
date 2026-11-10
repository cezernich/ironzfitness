// Shared prescription-level availability policy. Pure data; no provider calls.
(function(root) {
  'use strict';
  const RECOVERY=new Set(['medical','injury','sick']);
  const dayMs=86400000;
  function add(date,n) { const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10); }
  function valid(date) { return typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date+'T00:00:00Z')) && new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date; }
  function normalize(blocks) {
    if(!Array.isArray(blocks)) throw Error('Time-off periods must be a list.');
    return blocks.map(block=>{
      if(!valid(block.startDate)||!valid(block.endDate)||block.endDate<block.startDate) throw Error('Choose a valid start and end date for time off.');
      if(!['medical','injury','sick','travel','rest','other'].includes(block.type)) throw Error('Choose a valid time-off reason.');
      const clearance=block.clearance || (RECOVERY.has(block.type)?'pending':'full');
      if(!['pending','easy','full'].includes(clearance)) throw Error('Choose a valid return status.');
      return {...block,id:block.id || block.type+':'+block.startDate+':'+block.endDate,clearance,source:'athlete_report'};
    });
  }
  function read() { try { return normalize(typeof DB!=='undefined'?DB.getBlockedPeriods():[]); } catch(error) { throw Error('Saved time-off periods need correction before building a plan.'); } }
  function isRecovery(block) { return RECOVERY.has(block.type) && (block.type==='medical' || (Date.parse(block.endDate)-Date.parse(block.startDate))/dayMs+1>=5); }
  function status(block,date) {
    if(date<block.startDate) return null;
    if(date<=block.endDate) return 'off';
    if(!RECOVERY.has(block.type)) return null;
    if(block.clearance==='pending') return 'pending';
    if(!isRecovery(block)) return block.clearance==='easy'?'easy_only':null;
    const days=(Date.parse(date)-Date.parse(block.endDate))/dayMs;
    if(days<=7) return 'ramp';
    return block.clearance==='easy'?'easy_only':null;
  }
  function minutes(entry) { return Number(entry.durationMin ?? entry.duration_min ?? entry.duration ?? 0)||0; }
  function completed(entry,today) { return entry.date<today || entry.completed || entry.isCompleted || entry.status==='completed'; }
  function easySession(entry,duration) {
    const discipline=entry.discipline || entry.type;
    // Build one real easy prescription; never retain a hard workout ID, set,
    // interval, threshold-test marker, or generated-session payload under an easy label.
    const copy={};
    for(const key of ['id','date','raceId','planId','source','weekNumber','phase','day','timeOfDay']) if(entry[key]!==undefined) copy[key]=entry[key];
    return {...copy,type:discipline,discipline,load:'easy',duration,durationMin:duration,duration_min:duration,
      sessionName:'Easy return '+discipline,description:'Easy endurance only. Follow your reported clinician restrictions.',
      targetZones:['Z1','Z2'],intensity:'Z1-Z2',keySession:false,is_hard:false,
      phases:[{phase:'main_set',duration_min:duration,intensity:'z1',target:'Easy effort',instruction:duration+' min easy. No intervals or tests.'}],
      _restrictionApplied:true};
  }
  function apply(entries,input,{today='0000-00-00'}={}) {
    const blocks=normalize(input);
    const source=JSON.parse(JSON.stringify(entries || []));
    const result=[];
    for(const entry of source) {
      if(completed(entry,today)) { result.push(entry);continue; }
      const active=blocks.map(block=>({block,status:status(block,entry.date)})).filter(x=>x.status);
      if(active.some(x=>x.status==='off'||x.status==='pending')) continue;
      if(!active.length) { result.push(entry);continue; }
      const discipline=entry.discipline || entry.type;
      if(!['run','running','bike','cycling','swim','swimming','walk','walking','row','rowing'].includes(discipline)) continue;
      const factor=active.some(x=>x.status==='ramp')?0.5:1;
      const duration=Math.floor(minutes(entry)*factor);
      if(duration>0) result.push(easySession(entry,duration));
    }
    // A return-week budget is based on the PRE-BLOCK week, not half an
    // arbitrarily larger future week. Thereafter cap consecutive 7-day blocks
    // at10% growth without raising a taper/deload or cramming missed work.
    for(const block of blocks.filter(b=>isRecovery(b)&&b.clearance!=='pending')) {
      const baselineStart=add(block.startDate,-7);
      const prior=source.filter(e=>e.date>=baselineStart&&e.date<block.startDate&&!(e.discipline==='race'||e.type==='race'));
      let budget=prior.reduce((sum,e)=>sum+minutes(e),0)*0.5;
      const future=source.filter(e=>e.date>block.endDate);
      if(!future.length) continue;
      const last=future.reduce((date,e)=>e.date>date?e.date:date,block.endDate);
      for(let start=add(block.endDate,1);start<=last;start=add(start,7)) {
        const end=add(start,6);
        const sessions=result.filter(e=>!completed(e,today)&&e.date>=start&&e.date<=end);
        const total=sessions.reduce((sum,e)=>sum+minutes(e),0);
        // No baseline: require a new approved starting plan, never invent load.
        const scale=total>budget?budget/total:1;
        for(const entry of sessions) {
          const duration=Math.floor(minutes(entry)*scale);
          // Scaling structured work must change its prescription too. During
          // rebuild, use easy work until prior volume has been regained.
          if(scale<1 && !['run','running','bike','cycling','swim','swimming','walk','walking','row','rowing'].includes(entry.discipline || entry.type)) {
            entry.duration=entry.durationMin=entry.duration_min=0;entry._restrictionApplied=true;continue;
          }
          if(scale<1 || entry._restrictionApplied) {
            const safe=easySession(entry,duration);
            Object.keys(entry).forEach(key=>delete entry[key]);
            Object.assign(entry,safe);
          }
        }
        if(total>0) budget=Math.min(budget*1.1,Math.max(0,sessions.reduce((sum,e)=>sum+minutes(e),0))*1.1);
      }
    }
    return result.filter(entry=>!entry._restrictionApplied || minutes(entry)>0);
  }
  function applyGenerated(entries,blocks=read()) {
    const sessions=apply(entries,blocks);
    Object.defineProperty(sessions,'restrictionSource',{value:JSON.parse(JSON.stringify(entries)),enumerable:false});
    return sessions;
  }
  function restoreHistory(source,current,today) {
    const history=(current||[]).filter(e=>completed(e,today));
    const ids=new Set(history.map(e=>e.id || [e.date,e.raceId,e.planId,e.discipline].join(':')));
    return history.concat((source||[]).filter(e=>!completed(e,today)&&!ids.has(e.id || [e.date,e.raceId,e.planId,e.discipline].join(':'))));
  }
  function reconcileSource(source,current,expected,today) {
    if(!expected) return restoreHistory(source,current,today);
    const key=e=>e.id || [e.date,e.raceId,e.planId,e.discipline].join(':');
    const actual=new Map((current||[]).map(e=>[key(e),e]));
    const projected=new Map(expected.map(e=>[key(e),e]));
    const reconciled=[];
    for(const original of source||[]) {
      const id=key(original),now=actual.get(id),before=projected.get(id);
      if(before && !now) continue; // An athlete deleted this visible session.
      reconciled.push(now && (!before || JSON.stringify(now)!==JSON.stringify(before))?now:original);
      actual.delete(id);
    }
    return restoreHistory(reconciled.concat([...actual.values()]),current,today);
  }
  function applyRulePlan(plan,blocks) {
    const periods=normalize(blocks);
    const out=JSON.parse(JSON.stringify(plan));
    const start=out.arc.startDate;
    const first=new Date(start+'T00:00:00Z');first.setUTCDate(first.getUTCDate()-(first.getUTCDay()+6)%7);
    const monday=first.toISOString().slice(0,10);
    const dated=out.weeklyPlan.flatMap(week=>week.sessions.map((session,index)=>({...session,
      date:add(monday,(week.weekNumber-1)*7+session.day-1),weekNumber:week.weekNumber,_index:index}))).filter(session=>session.date>=start);
    const sessions=apply(dated,periods);
    out.blockedPeriods=periods;
    for(const week of out.weeklyPlan) {
      week.sessions=sessions.filter(session=>session.weekNumber===week.weekNumber);
      week.targetHours=Math.round(week.sessions.reduce((sum,session)=>sum+minutes(session),0)/6)/10;
    }
    return out;
  }
  const api={add,valid,normalize,read,status,apply,applyGenerated,restoreHistory,reconcileSource,isRecovery,applyRulePlan};
  if(root) root.PlanRestrictions=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:null);
