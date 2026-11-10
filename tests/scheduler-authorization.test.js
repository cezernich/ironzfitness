"use strict";
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
// Load each actual complete handler, erasing only TypeScript annotations.
function load(slug,dependencies){
 const source=fs.readFileSync(path.join(__dirname,'../supabase/functions',slug,'index.ts'),'utf8');
 const start=source.indexOf('serve(async (req: Request) => {');
 const end=source.indexOf('\n});',start);
 assert(start>=0&&end>start);
 const body=source.slice(start,end+4).replace('(req: Request)','(req)')
  .replace(/new Map<string, any\[\]>/g,'new Map')
  .replace(/\(s: any\)/g,'(s)').replace(/\(r: any\)/g,'(r)').replace(/\(e: any\)/g,'(e)')
  .replace(/\)!\.push/g,').push')
  .replace(/: Record<string, (?:number|string|string\[\]|WorkoutRow\[\])>/g,'')
  .replace(/ as (?:AssignmentRow|WorkoutRow|Profile)\[\]/g,'')
  .replace(/: \{ coach: string; error: string \}\[\]/g,'')
  .replace(/let (title|body): string/g,'let $1');
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
 const c={Request,Response,Date,Map,Set,JSON,console,CORS:{},SUPABASE_URL:'https://synthetic.invalid',SERVICE_ROLE_KEY:'synthetic-service-credential',json,jsonResponse:json,...dependencies};
 c.serve=f=>{c.handler=f;};vm.createContext(c);vm.runInContext(body,c);return c.handler;
}
(async()=>{
 for(const slug of ['check-workout-reminders','check-hydration-reminders','coach-daily-digest']){
  let clients=0,reads=0,pushes=0;
  const query={select(){return this;},eq(){return this;},neq(){return this;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};
  const h=load(slug,{createClient:()=>{clients++;return {from(){reads++;return query;}};},fetch:async()=>{pushes++;throw Error('Unexpected delivery');}});
  for(const auth of [null,'Basic fake','Bearer ','Bearer a b','Bearer user-jwt','Bearer forged-service-role']){
   const r=await h(new Request('https://edge.invalid',{method:'POST',headers:auth?{authorization:auth}:{}}));
   assert([401,403].includes(r.status),slug);assert.equal(clients,0);assert.equal(reads,0);assert.equal(pushes,0);
  }
  assert.equal((await h(new Request('https://edge.invalid',{method:'OPTIONS'}))).status,200);assert.equal(clients,0);
  const r=await h(new Request('https://edge.invalid',{method:'POST',headers:{authorization:'Bearer synthetic-service-credential'}}));
  assert.equal(r.status,200);assert.equal(clients,1);assert(reads>0);assert.equal(pushes,0);
 }
 console.log('Actual scheduler handlers reject untrusted calls before privileged client creation and preserve trusted empty runs');
})().catch(e=>{console.error(e);process.exitCode=1;});
