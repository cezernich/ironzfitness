// Completed-training evidence, not a prescription or a statement of tolerance.
(function(root) {
  'use strict';
  const dayMs=86400000;
  const sportNames={run:'run',running:'run',brick:'brick',bike:'bike',biking:'bike',cycling:'bike',ride:'bike',swim:'swim',swimming:'swim',strength:'strength',weightlifting:'strength',lifting:'strength',walk:'walk',walking:'walk',row:'row',rowing:'row'};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const stable=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  const numeric=value=>value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value))?Number(value):null;
  const positive=value=>numeric(value)>0?numeric(value):null;
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const timestamp=value=>typeof value==='string'&&validDate(value.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))?Date.parse(value):null;

  function normalize(records,{asOf,timeZone='UTC',windowDays=28}={}) {
    if(!Array.isArray(records))throw Error('Completed training history must be a list.');
    const now=timestamp(asOf);
    if(now===null)throw Error('History needs an explicit evaluation timestamp.');
    if(!Number.isInteger(windowDays)||windowDays<1||windowDays>365)throw Error('Choose a valid reporting window.');
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
    const part=type=>parts.find(value=>value.type===type).value;
    const today=part('year')+'-'+part('month')+'-'+part('day');
    const windowStart=new Date(Date.parse(today+'T00:00:00Z')-(windowDays-1)*dayMs).toISOString().slice(0,10);
    const entries=[],excluded=[];
    for(const record of records) {
      if(!record||typeof record!=='object'||Array.isArray(record)) {excluded.push({reason:'malformed_record'});continue;}
      // Structured-table data is the preserved app record. Typed columns win
      // for identity/status; conflicting precision is retained for review.
      const raw={...(record.data&&typeof record.data==='object'?record.data:{}),...record};
      const source=String(raw.provider||raw.source||'ironz').toLowerCase();
      const refs=[];
      const ref=(provider,id)=>{if(typeof id==='number'&&!Number.isSafeInteger(id))return;if(['string','number'].includes(typeof id)&&String(id).trim())refs.push(provider+':'+String(id));};
      ref(source,raw.id);
      ref('strava',raw.stravaId??raw.stravaActivityId??raw.stravaUploadId);
      if(raw.externalId!==undefined)ref(source,raw.externalId);
      for(const [provider,id] of Object.entries(raw.externalIds||{}))ref(provider.toLowerCase(),id);
      const references=[...new Set(refs)].sort();
      const reject=reason=>excluded.push({references,reason});
      if(!references.length) {reject('missing_identifier');continue;}
      // Match the app's actual completion receipt and provider adapter.
      // A bare legacy completed:true can be stamped on planned workouts.
      const explicitComplete=raw.isCompletion===true||raw.status==='completed'||source==='strava';
      const explicitPending=raw.completed===false||raw.isCompleted===false||['planned','pending','scheduled','cancelled'].includes(raw.status);
      if(explicitPending||!explicitComplete) {reject(explicitPending&&explicitComplete?'conflicting_completion':'not_confirmed_completed');continue;}
      if([raw.completedAt,raw.start_date,raw.startDate].some(value=>value!==undefined&&value!==null&&value!==''&&timestamp(value)===null&&!validDate(value))) {reject('invalid_event_time');continue;}
      const eventValues=[raw.completedAt,raw.start_date,raw.startDate].filter(value=>value!==undefined&&value!==null&&value!=='');
      if(eventValues.some(value=>validDate(value)?value>today:timestamp(value)>now)) {reject('future_or_not_yet_received');continue;}
      const eventAt=timestamp(raw.completedAt)??timestamp(raw.start_date)??timestamp(raw.startDate);
      const receivedAt=timestamp(raw.receivedAt);
      if(raw.receivedAt!==undefined&&raw.receivedAt!==null&&raw.receivedAt!==''&&receivedAt===null&&!validDate(raw.receivedAt)) {reject('invalid_received_time');continue;}
      const date=raw.date||raw.start_date_local?.slice(0,10)||raw.start_date?.slice(0,10);
      if(!validDate(date)) {reject('invalid_activity_date');continue;}
      if(date>today||(validDate(raw.receivedAt)&&raw.receivedAt>today)||(eventAt!==null&&eventAt>now)||(receivedAt!==null&&receivedAt>now)) {reject('future_or_not_yet_received');continue;}
      const rawType=String(raw.discipline||raw.type||raw.sport_type||'').toLowerCase();
      const type=sportNames[rawType]||(rawType==='triathlon'&&raw.actualRunDurationMin!==undefined?'brick':null);
      if(!type) {reject('unsupported_discipline');continue;}
      const minuteValues=[raw.actualDurationMin,raw.durationMin,raw.duration_minutes];
      const secondValue=raw.actualDurationSeconds??raw.duration_seconds;
      if([...minuteValues,secondValue,raw.duration].some(value=>value!==undefined&&value!==null&&value!==''&&positive(value)===null)) {reject('invalid_completed_duration');continue;}
      const minutes=minuteValues.map(positive).filter(value=>value!==null);
      const generic=positive(raw.duration);
      if(generic!==null) {
        const unit=String(raw.durationUnit||raw.duration_unit||'minutes').toLowerCase();
        const factor={s:1/60,sec:1/60,second:1/60,seconds:1/60,m:1,min:1,minute:1,minutes:1,h:60,hour:60,hours:60}[unit];
        if(!factor) {reject('unsupported_duration_unit');continue;}
        minutes.push(generic*factor);
      }
      const seconds=positive(secondValue);
      if(seconds!==null)minutes.push(seconds/60);
      const movingSeconds=positive(raw.moving_time),elapsedSeconds=positive(raw.elapsed_time);
      if(!minutes.length&&movingSeconds!==null)minutes.push(movingSeconds/60);
      if(!minutes.length&&elapsedSeconds!==null)minutes.push(elapsedSeconds/60);
      if(!minutes.length) {reject('missing_completed_duration');continue;}
      if(minutes.some(value=>Math.abs(value-minutes[0])>0.000001)) {reject('conflicting_duration');continue;}
      const distances=[raw.distanceMeters,raw.distance_m].map(positive).filter(value=>value!==null);
      if(typeof raw.distance==='string'&&/^\s*\d/.test(raw.distance)) {
        const match=/^\s*(\d+(?:\.\d+)?)\s*(km|mi|m)\s*$/i.exec(raw.distance);
        if(match)distances.push(Number(match[1])*({km:1000,mi:1609.344,m:1}[match[2].toLowerCase()]));
      }
      if(positive(raw.distance)!==null&&raw.distanceUnit) {
        const factor={m:1,meters:1,km:1000,kilometers:1000,mi:1609.344,miles:1609.344}[String(raw.distanceUnit).toLowerCase()];
        if(factor)distances.push(positive(raw.distance)*factor);
      }
      if(distances.some(value=>Math.abs(value-distances[0])>0.01)) {reject('conflicting_distance');continue;}
      const distanceM=distances[0]??null;
      const runDurationMin=positive(raw.actualRunDurationMin);
      if(type==='brick'&&raw.actualRunDurationMin!==undefined&&(!runDurationMin||runDurationMin>minutes[0])) {reject('invalid_completed_brick_run_duration');continue;}
      // Direct provider payloads need their own completion adapter. A naked
      // numeric distance has no universal unit and stays unknown here.
      entries.push({references,date,type,durationMin:minutes[0],runDurationMin:type==='brick'?runDurationMin:null,distanceM,movingDurationMin:movingSeconds===null?null:movingSeconds/60,
        elapsedDurationMin:elapsedSeconds===null?null:elapsedSeconds/60,eventAt:eventAt===null?null:new Date(eventAt).toISOString(),
        receivedAt:receivedAt===null?null:new Date(receivedAt).toISOString(),completionEvidence:'reported_completed',
        exercises:Array.isArray(raw.exercises)?clone(raw.exercises):[],sourceRecord:clone(record)});
    }

    // Only explicit provider/local links establish identity. Similar duration,
    // date or sport cannot prove two records are the same session.
    const groups=[];
    for(const entry of entries.sort((a,b)=>stable(a).localeCompare(stable(b)))) {
      const matches=groups.filter(group=>group.some(other=>other.references.some(ref=>entry.references.includes(ref))));
      const merged=[entry,...matches.flat()];
      for(const group of matches)groups.splice(groups.indexOf(group),1);
      groups.push(merged);
    }
    const activities=[];
    for(const group of groups) {
      const references=[...new Set(group.flatMap(entry=>entry.references))].sort();
      const first=group[0];
      const knownDistance=group.map(entry=>entry.distanceM).filter(value=>value!==null);
      const knownRunMinutes=group.map(entry=>entry.runDurationMin).filter(value=>value!==null);
      if(knownRunMinutes.some(value=>value!==knownRunMinutes[0])||excluded.some(item=>['conflicting_completion','conflicting_duration','conflicting_distance','invalid_completed_duration','invalid_completed_brick_run_duration'].includes(item.reason)&&item.references.some(ref=>references.includes(ref)))||knownDistance.some(value=>Math.abs(value-knownDistance[0])>0.01)||group.some(entry=>entry.type!==first.type||entry.date!==first.date||Math.abs(entry.durationMin-first.durationMin)>0.000001||entry.distanceM!==null&&first.distanceM!==null&&Math.abs(entry.distanceM-first.distanceM)>0.01)) {
        excluded.push({references,reason:'conflicting_linked_records'});continue;
      }
      activities.push({id:references[0],references,date:first.date,type:first.type,durationMin:first.durationMin,
        runDurationMin:knownRunMinutes[0]??null,distanceM:group.map(entry=>entry.distanceM).find(value=>value!==null)??null,completed:true,
        completionEvidence:'reported_completed',coverage:'observed_record_only',
        exercises:clone(group.find(entry=>entry.exercises.length)?.exercises||[]),sourceRecords:group.map(entry=>entry.sourceRecord).sort((a,b)=>stable(a).localeCompare(stable(b)))});
    }
    activities.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    excluded.sort((a,b)=>stable(a).localeCompare(stable(b)));
    const recent=activities.filter(activity=>activity.date>=windowStart);
    const bySport={};
    for(const type of [...new Set(recent.map(activity=>activity.type))].sort()) {
      const items=recent.filter(activity=>activity.type===type);
      bySport[type]={recordCount:items.length,reportedMinutes:items.reduce((sum,item)=>sum+item.durationMin,0),
        knownDistanceM:items.reduce((sum,item)=>sum+(item.distanceM??0),0),missingDistanceCount:items.filter(item=>item.distanceM===null).length,
        observedDates:[...new Set(items.map(item=>item.date))].sort()};
    }
    return {version:'training-history-v1',asOf:new Date(now).toISOString(),timeZone,windowStart,windowEnd:today,activities,excluded,bySport,
      coverage:recent.length?'observed_records_only':'no_eligible_records',toleratedBaselineStatus:'not_established'};
  }
  const api={normalize};
  if(root)root.TrainingHistory=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:null);
