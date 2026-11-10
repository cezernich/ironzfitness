"use strict";
const assert=require('assert'),{loadHandler}=require('./helpers/edge-handler');
function setup(disabled=false){
 const effects={reads:0,push:0};
 const handler=loadHandler('notify-share',{
  createClient:()=>({from(table){assert.equal(table,'notification_preferences');effects.reads++;return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{share_alerts:!disabled}})};}}),
  fetch:async(url,options)=>{effects.push++;assert.equal(options.headers.Authorization,'Bearer synthetic-service-credential');assert.equal(JSON.parse(options.body).user_id,'athlete-b');return new Response('{}');}
 });
 return {effects,call:async(token)=>handler(new Request('https://edge.invalid',{method:'POST',headers:token?{authorization:token}:{},body:JSON.stringify({recipient_user_id:'athlete-b',sender_name:'Synthetic sender',workout_name:'Synthetic workout',share_token:'synthetic-share'})}))};
}
(async()=>{
 for(const token of [null,'Basic fake','Bearer ','Bearer a b','Bearer valid-user-jwt','Bearer forged-service-role-claim']){
  const h=setup(),r=await h.call(token);assert([401,403].includes(r.status));assert.equal(h.effects.reads,0);assert.equal(h.effects.push,0);
 }
 {const h=setup();assert.equal((await h.call('Bearer synthetic-service-credential')).status,200);assert.equal(h.effects.reads,1);assert.equal(h.effects.push,1);}
 {const h=setup(true);const r=await h.call('Bearer synthetic-service-credential');assert.equal((await r.json()).skipped,'share_alerts_disabled');assert.equal(h.effects.push,0);}
 console.log('Actual notify-share handler denies client escalation before database access and preserves trusted delivery and preferences');
})().catch(e=>{console.error(e);process.exitCode=1;});
