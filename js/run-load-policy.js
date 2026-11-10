// Rule Engine run-load safety policy. Pure: completed evidence in, limits out.
(function(root) {
  'use strict';
  const DAY=86400000;
  const positive=n=>Number.isFinite(n)&&n>0;
  const iso=ms=>new Date(ms).toISOString().slice(0,10);
  function limits(evidence,{raceType,blocked=false}={}) {
    if(!evidence||evidence.version!=='training-history-v1'||!/^\d{4}-\d{2}-\d{2}$/.test(evidence.windowEnd||'')||!Number.isFinite(Date.parse(evidence.windowEnd+'T00:00:00Z')))throw Error('Run limits require dated completed-training evidence.');
    const end=evidence.windowEnd,start=iso(Date.parse(end+'T00:00:00Z')-27*DAY);
    const activities=(evidence.activities||[]).filter(a=>a.completed===true&&a.date>=start&&a.date<=end);
    const runs=activities.filter(a=>a.type==='run'&&positive(a.durationMin));
    const bricks=activities.filter(a=>a.type==='brick');
    const incompleteBricks=bricks.filter(a=>!positive(a.runDurationMin));
    const weeklyAverage=(runs.reduce((n,a)=>n+a.durationMin,0)+bricks.reduce((n,a)=>n+(positive(a.runDurationMin)?a.runDurationMin:0),0))/4;
    const longest=runs.length?Math.max(...runs.map(a=>a.durationMin)):0;
    const absoluteLongRunMin=raceType==='ironman'?165:null;
    const status=blocked?'blocked':!longest?'insufficient_history':incompleteBricks.length?'incomplete_brick_history':'available';
    return {version:'run-load-v1',asOf:evidence.asOf,windowStart:start,windowEnd:end,windowDays:28,status,
      coverage:evidence.coverage||'observed_records_only',longestCompletedRunMin:longest,averageWeeklyRunMin:weeklyAverage,
      maxLongRunMin:blocked?0:Math.floor(Math.min(longest*1.10,longest+15,absoluteLongRunMin??Infinity)),
      maxWeeklyRunMin:blocked?0:Math.floor(weeklyAverage*1.10),absoluteLongRunMin,
      incompleteBrickCount:incompleteBricks.length,
      // Missing logging is not confirmed rest and never authorizes an increase.
      requiresHistoryReview:status!=='available',requiresReadinessReview:true};
  }
  function runMinutes(session) {
    if(session.type==='run')return Number(session.durationMin)||0;
    if(session.type==='brick')return Number(session.brickDetails?.leg2DurationMin)||0;
    return 0;
  }
  function assessWeek(week,policy,{blocked=false,completedThisWeekMin=0}={}) {
    const sessions=week.sessions||[],runs=sessions.filter(s=>s.type==='run');
    const total=sessions.reduce((n,s)=>n+runMinutes(s),0);
    const longest=Math.max(0,...runs.map(s=>s.durationMin||0));
    const errors=[],warnings=[];
    if(blocked||policy.status==='blocked')errors.push('readiness_or_restriction_block');
    if(policy.requiresHistoryReview)errors.push('completed_history_review_required');
    if(sessions.some(s=>s.type==='brick'&&!positive(s.brickDetails?.leg2DurationMin)))errors.push('brick_run_duration_unknown');
    if(longest>policy.maxLongRunMin)errors.push('completed_long_run_growth_limit');
    if(total+completedThisWeekMin>policy.maxWeeklyRunMin)errors.push('completed_weekly_run_growth_limit');
    if(policy.absoluteLongRunMin!==null&&longest>policy.absoluteLongRunMin)errors.push('absolute_long_run_limit');
    if(total&&longest/total>.50)warnings.push('long_run_over_half_weekly_running');
    if(total>180&&runs.length<3)warnings.push('consider_third_easy_run');
    return {totalRunMin:total,longestRunMin:longest,completedThisWeekMin,errors,warnings,allPassed:errors.length===0};
  }
  const api={limits,runMinutes,assessWeek};
  if(root)root.RunLoadPolicy=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:null);
