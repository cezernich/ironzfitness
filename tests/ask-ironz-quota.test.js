'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
function setup({count=1,error=null,identity='synthetic-athlete',throws=false}={}){
 const effects={rpc:0,fetch:0,reads:0},calls=[];
 const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/ask-ironz/index.ts'),'utf8');
 const body=source.slice(source.indexOf('Deno.serve(async (req) => {'))
  .replace(/Deno\.env\.get\(([^)]+)\)!/g,'Deno.env.get($1)')
  .replace(/: Record<string, (?:string \| null|number)>/g,'')
  .replace(/\((m): any\)/g,'($1)').replace(/\(a: any, b: any\)/g,'(a, b)')
  .replace(/\(err as Error\)/g,'(err)');
 const c={Request,Response,JSON,Date,Number,console,corsHeaders:{},MAX_REQUESTS_PER_DAY:30,
  jsonResponse:(v,status=200)=>new Response(JSON.stringify(v),{status}),
  Deno:{env:{get:()=> 'synthetic-config'},serve:f=>{c.handler=f;}},
  createClient:()=>({auth:{getUser:async()=>({data:{user:identity?{id:identity}:null},error:null})},
   rpc:async(name,args)=>{effects.rpc++;calls.push({name,args});if(throws)throw Error('Synthetic failure');return {data:count,error};},
   from:()=>{effects.reads++;throw Error('Unexpected database read');}}),
  fetch:async()=>{effects.fetch++;throw Error('Unexpected paid request');},
  findFaqMatch:()=>({answer:'Synthetic FAQ',faq_id:'synthetic',faq_question:'Synthetic'})};
 vm.createContext(c);vm.runInContext(body,c);
 return {effects,calls,call:()=>c.handler(new Request('https://edge.invalid',{method:'POST',headers:{authorization:'Bearer synthetic-user'},body:JSON.stringify({question:'Synthetic FAQ'})}))};
}
(async()=>{
 for(const count of [null,undefined,0,31,1.5,'1',-2]){const h=setup({count:count===undefined?null:count});assert.equal((await h.call()).status,503);assert.equal(h.effects.fetch,0);assert.equal(h.effects.reads,0);}
 for(const config of [{error:{}},{throws:true}]){const h=setup(config);assert([500,503].includes((await h.call()).status));assert.equal(h.effects.fetch,0);assert.equal(h.effects.reads,0);}
 {const h=setup({count:-1});assert.equal((await h.call()).status,429);assert.equal(h.effects.fetch,0);assert.equal(h.effects.reads,0);}
 {const h=setup({count:30});const r=await h.call();assert.equal(r.status,200);assert.equal((await r.json())._remaining,0);assert.equal(h.effects.rpc,1);assert.equal(h.calls[0].name,'consume_ai_quota');assert.equal(h.calls[0].args.p_user_id,'synthetic-athlete');}
 {const h=setup({identity:null});assert.equal((await h.call()).status,401);assert.equal(h.effects.rpc,0);assert.equal(h.effects.fetch,0);}
 console.log('Actual Ask IronZ handler reserves verified-user quota once and fails closed before any paid request');
})().catch(e=>{console.error(e);process.exitCode=1;});
