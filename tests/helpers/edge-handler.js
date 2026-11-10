'use strict';
// Executes the actual Edge Function handler with isolated network/auth/storage.
// Only its small set of TS type annotations is erased; no application rewrite.
const fs=require('fs'),vm=require('vm'),path=require('path');
function loadHandler(slug,dependencies) {
 const source=fs.readFileSync(path.join(__dirname,'../../supabase/functions',slug,'index.ts'),'utf8');
 const start=source.indexOf('serve(async (req: Request) => {');
 if(start<0)throw Error('Missing actual Edge handler');
 const body=source.slice(start).replace('(req: Request)','(req)')
   .replace(/let (body|apnsError): any/g,'let $1').replace(/let (jwt): string/g,'let $1')
   .replace(/let (apnsResponse): Response/g,'let $1').replace(/let callerId: string \| null/g,'let callerId')
   .replace(/\(e: any\)/g,'(e)');
 const c={Response,Request,JSON,Date,console,fetch:()=>{throw Error('Unmocked network');},
  jsonResponse:(data,status=200)=>new Response(JSON.stringify(data),{status}),
  SUPABASE_URL:'https://synthetic.invalid',SERVICE_ROLE_KEY:'synthetic-service-credential',
  APNS_KEY:'synthetic',APNS_KEY_ID:'synthetic',APNS_TEAM_ID:'synthetic',APNS_HOST:'https://apns.invalid',APNS_TOPIC:'synthetic',
  CORS:{},buildApnsJwt:async()=> 'synthetic-signed-push',...dependencies};
 c.serve=f=>{c.handler=f;};vm.createContext(c);vm.runInContext(body,c,{filename:slug+'/index.ts'});return c.handler;
}
module.exports={loadHandler};
