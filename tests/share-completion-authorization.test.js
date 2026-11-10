'use strict';
const assert=require('assert'),{loadHandler}=require('./helpers/edge-handler');
function setup({identity='receiver-a',share=true,imported=true,importError=false,recentError=false,updateError=false,updated=true}={}){
 const effects={writes:0,rpc:0,notifications:0},filters=[];
 const admin={auth:{getUser:async()=>({data:{user:identity?{id:identity}:null}})},
 from(table){let write=false,recent=false;const q={select(){return this;},eq(k,v){filters.push([table,k,v]);return this;},is(k,v){filters.push([table,k,v]);return this;},gt(k,v){filters.push([table,k,v]);return this;},neq(k,v){filters.push([table,k,v]);return this;},gte(){recent=true;return this;},limit:async()=>({data:[],error:recentError?{}:null}),
 update(){write=true;effects.writes++;return this;},insert:async()=>{effects.notifications++;return{};},
 maybeSingle:async()=>{if(table==='shared_workouts')return {data:share?{sender_user_id:'sender-b',variant_id:'Synthetic'}:null};if(table==='profiles')return {data:{full_name:'Synthetic'}};return {data:write?(updated?{id:'import-a'}:null):(imported?{id:'import-a'}:null),error:(write?updateError:importError)?{}:null};}};return q;},rpc:async()=>{effects.rpc++;}};
 const h=loadHandler('notify-share-completion',{createClient:()=>admin,fetch:()=>{throw Error('No network');}});
 return {effects,filters,call:()=>h(new Request('https://edge.invalid',{method:'POST',headers:{authorization:'Bearer synthetic-user'},body:JSON.stringify({share_token:'synthetic-share'})}))};
}
(async()=>{
 for(const [config,status] of [[{identity:null},401],[{share:false},404],[{imported:false},403],[{importError:true},503],[{recentError:true},503]]){
  const h=setup(config);assert.equal((await h.call()).status,status);assert.equal(h.effects.writes,0);assert.equal(h.effects.rpc,0);assert.equal(h.effects.notifications,0);
 }
 for(const config of [{updateError:true},{updated:false}]){const h=setup(config);assert.equal((await h.call()).status,503);assert.equal(h.effects.rpc,0);assert.equal(h.effects.notifications,0);}
 {const h=setup();assert.equal((await h.call()).status,200);assert.equal(h.effects.rpc,1);assert.equal(h.effects.notifications,1);
  for(const [table,key,value] of [['shared_workouts','revoked_at',null],['workout_share_imports','receiver_user_id','receiver-a'],['workout_share_imports','action','dismissed'],['workout_share_imports','id','import-a']])assert(h.filters.some(f=>f[0]===table&&f[1]===key&&f[2]===value));
  assert(h.filters.some(f=>f[0]==='shared_workouts'&&f[1]==='expires_at'&&Number.isFinite(Date.parse(f[2]))));
 }
 console.log('Actual share-completion handler requires active share and caller-owned non-dismissed import before notifying sender');
})().catch(e=>{console.error(e);process.exitCode=1;});
