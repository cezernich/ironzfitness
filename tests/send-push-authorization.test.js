'use strict';
const assert=require('assert'),{loadHandler}=require('./helpers/edge-handler');
function setup({identity='athlete-a',authError=false,authThrows=false,apns=true}={}) {
 const effects={auth:0,reads:0,push:0};
 const admin={auth:{getUser:async()=>{effects.auth++;if(authThrows)throw Error('private internal error');return {data:{user:identity?{id:identity}:null},error:authError?{}:null};}},
 from(table){assert.equal(table,'push_tokens');effects.reads++;const query={select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},update(){return this;},delete(){return this;},maybeSingle:async()=>({data:{id:'token-row',token:'synthetic-device'},error:null})};return query;}};
 const handler=loadHandler('send-push',{createClient:()=>admin,APNS_KEY:apns?'synthetic':'',fetch:async()=>{effects.push++;return new Response('{}',{status:200});}});
 return {effects,call:async(token,body={user_id:'athlete-a',title:'Test',body:'Synthetic notification'})=>handler(new Request('https://edge.invalid',{method:'POST',headers:token?{authorization:token}:{},body:JSON.stringify(body)}))};
}
(async()=>{
 for(const token of [null,'Basic fake','Bearer ','Bearer a b']){const h=setup();assert.equal((await h.call(token)).status,401);assert.equal(h.effects.reads,0);assert.equal(h.effects.push,0);}
 for(const options of [{identity:null},{authError:true},{authThrows:true}]){const h=setup(options);const r=await h.call('Bearer invalid');assert.equal(r.status,401);assert.equal(h.effects.reads,0);assert(!JSON.stringify(await r.json()).includes('private'));}
 {const h=setup();assert.equal((await h.call('Bearer valid-user',{user_id:'athlete-b',title:'Spoof',body:'Blocked'})).status,403);assert.equal(h.effects.reads,0);assert.equal(h.effects.push,0);}
 {const h=setup();assert.equal((await h.call('Bearer valid-user')).status,200);assert.equal(h.effects.auth,1);assert.equal(h.effects.push,1);}
 {const h=setup({identity:null});assert.equal((await h.call('Bearer synthetic-service-credential',{user_id:'athlete-b',title:'Scheduled',body:'Synthetic'})).status,200);assert.equal(h.effects.auth,0);assert.equal(h.effects.push,1);}
 {const h=setup();assert.equal((await h.call('Bearer valid-user',{user_id:{id:'athlete-a'},title:'bad',body:'bad'})).status,400);assert.equal(h.effects.reads,0);}
 {const h=setup({apns:false});assert.equal((await h.call('Bearer valid-user',{user_id:'athlete-b',title:'bad',body:'bad'})).status,403);assert.equal(h.effects.reads,0);}
 console.log('Actual send-push handler verifies user identity, rejects forged recipients before token lookup, and preserves trusted server delivery');
})().catch(e=>{console.error(e);process.exitCode=1;});
