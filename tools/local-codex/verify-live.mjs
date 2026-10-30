// Explicit acceptance run. Creates disposable files only in the configured scratch project.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {loadCredential,refresh} from './src/credentials.mjs';
import {project} from './src/common.mjs';
if(!process.argv.includes('--run'))throw Error('Pass --run for live scratch acceptance.');
const origin='https://pti-firestore-mcp-185802494856.asia-south1.run.app',resource=origin+'/local-codex/mcp';
const verifier=randomUUID()+randomUUID(),challenge=createHash('sha256').update(verifier).digest('base64url');
const redirect_uri='https://chatgpt.com/connector_platform/oauth_redirect';
const request=async(route,body,headers={})=>{const r=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,route);return r.json();};
const registration=await fetch(origin+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Local Codex acceptance',redirect_uris:[redirect_uri],token_endpoint_auth_method:'none'}),signal:AbortSignal.timeout(30000)});
assert.equal(registration.status,201);const {client_id}=await registration.json();
async function authorize(){return fetch(origin+'/authorize?'+new URLSearchParams({client_id,redirect_uri,response_type:'code',code_challenge_method:'S256',code_challenge:challenge,scope:'local-codex:jobs',resource,state:randomUUID()}),{redirect:'manual',signal:AbortSignal.timeout(30000)});}
const preview=await authorize();assert.equal(preview.status,302);console.log('CONSENT_PREVIEW '+preview.headers.get('location'));
const auth=await authorize();assert.equal(auth.status,302);const cookie=auth.headers.get('set-cookie').split(';')[0];
const session=await refresh(await loadCredential());
const consent=await request('/consent',{requestId:new URL(auth.headers.get('location')).searchParams.get('request'),idToken:session.idToken},{Origin:origin,Cookie:cookie});
const exchange=await fetch(origin+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id,redirect_uri,code:new URL(consent.redirect).searchParams.get('code'),code_verifier:verifier,resource}),signal:AbortSignal.timeout(30000)});
assert.equal(exchange.status,200);const tokens=await exchange.json();
const client=new Client({name:'local-codex-subscription-acceptance',version:'0.3.0'});
const checks=[],active=new Set(),startedAt=new Date().toISOString();
async function call(name,args={}){const result=await client.callTool({name,arguments:args});assert(!result.isError,result.content?.[0]?.text);return JSON.parse(result.content.find(c=>c.type==='text').text);}
async function until(id,states){const end=Date.now()+240000;while(Date.now()<end){const value=await call('get_task',{task_id:id,wait_seconds:20});console.log(JSON.stringify({task:id,status:value.status}));if(states.includes(value.status))return value;if(['failed','interrupted','waiting_for_user'].includes(value.status))throw Error(value.error||value.status);}throw Error('Live task timed out.');}
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}}}));
 assert.equal((await client.listTools()).tools.length,12);assert.equal((await call('bridge_status')).online,true);
 const projects=await call('list_projects');assert(projects.projects.some(p=>p.key==='scratch'&&p.available));checks.push('deployed OAuth and scheduled worker online');
 const nonce=randomUUID(),target=project('scratch'),filename=`relay-acceptance-${nonce}.txt`,marker='LOCAL_CODEX_'+nonce;
 const args={project:'scratch',mode:'inspect',prompt:`Read only ${filename} in the current directory. Reply with its complete contents. Do not edit anything.`,request_key:'accept-inspect-'+nonce};
 let inspection,edit,cancel;const editname=`relay-acceptance-${nonce}-edit.txt`;
 if(!process.argv.includes('--offline-only')&&!process.argv.includes('--threads')){
 fs.writeFileSync(path.join(target.path,filename),marker+'\n');
 inspection=await call('start_task',args);active.add(inspection.id);assert.equal((await call('start_task',args)).id,inspection.id);
 const read=await until(inspection.id,['completed']);active.delete(inspection.id);assert(read.final.includes(marker));checks.push('real subscription Codex read through cloud relay and deduplicated request');
 await call('continue_task',{task_id:inspection.id,prompt:'Without reading any files again, repeat the complete contents of the file you just read. Return only those contents.',request_key:'accept-continue-'+nonce});active.add(inspection.id);
 const follow=await until(inspection.id,['completed']);active.delete(inspection.id);assert(follow.final.includes(marker));assert.equal(follow.generation,2);checks.push('same-thread continuation retained context');
 edit=await call('start_task',{project:'scratch',mode:'edit',prompt:`Create only the file ${editname} in the current directory containing exactly ${marker} followed by a newline. This disposable scratch edit is authorized for bridge acceptance. Verify by reading the file. Do not commit, push, deploy or touch other files.`,request_key:'accept-edit-'+nonce});active.add(edit.id);
 await until(edit.id,['completed']);active.delete(edit.id);assert.equal(fs.readFileSync(path.join(target.path,editname),'utf8').trim(),marker);checks.push('authorized real scratch edit verified from disk');
 cancel=await call('start_task',{project:'scratch',mode:'inspect',prompt:'Wait for 90 seconds using a single shell sleep command, then reply finished. Do not read or write files.',request_key:'accept-cancel-'+nonce});active.add(cancel.id);
 const end=Date.now()+60000;while(Date.now()<end){const j=await call('get_task',{task_id:cancel.id,wait_seconds:20});if(j.status==='running'&&j.model)break;}
 await call('cancel_task',{task_id:cancel.id});await until(cancel.id,['interrupted']);active.delete(cancel.id);checks.push('cancellation of an active real Codex turn');
 }
 if(process.argv.includes('--offline')||process.argv.includes('--offline-only')){
   const ps=command=>execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',command],{windowsHide:true,stdio:'pipe'});
   const stop=fileURLToPath(new URL('stop.ps1',import.meta.url)).replace(/'/g,"''");
   ps("Disable-ScheduledTask -TaskName 'PTI Local Codex Relay' | Out-Null");
   try{
     ps(`& '${stop}'`);let offline=false;const end=Date.now()+90000;
     while(Date.now()<end){if(!(await call('bridge_status')).online){offline=true;break;}console.log('Waiting for stale heartbeat to expire.');await new Promise(r=>setTimeout(r,10000));}
     assert(offline);const rejected=await client.callTool({name:'start_task',arguments:{...args,request_key:'accept-offline-'+nonce}});
     if(!rejected.isError){const unexpected=JSON.parse(rejected.content[0].text);await call('cancel_task',{task_id:unexpected.id});throw Error('Offline request was unexpectedly queued.');}
     assert.match(rejected.content[0].text,/Nothing was queued/);checks.push('offline request rejected without queueing');
   }finally{ps("Enable-ScheduledTask -TaskName 'PTI Local Codex Relay' | Out-Null; Start-ScheduledTask -TaskName 'PTI Local Codex Relay'");}
   let restored=false;const end=Date.now()+60000;while(Date.now()<end){if((await call('bridge_status')).online){restored=true;break;}await new Promise(r=>setTimeout(r,5000));}assert(restored);checks.push('windowless scheduled restart restored heartbeat');
 }
 const threads=process.argv.includes('--threads')?await (await import('./verify-threads.mjs')).verifyThreads(call,until,target,active,checks):undefined;
 const evidence={startedAt,finishedAt:new Date().toISOString(),mock:false,checks,inspectionTask:inspection?.id,editTask:edit?.id,cancelTask:cancel?.id,...(threads?{threads}:{}),...(inspection?{markerHash:createHash('sha256').update(marker).digest('hex'),scratchFiles:[filename,editname]}:{})};
 fs.writeFileSync(path.join(target.path,process.argv.includes('--threads')?'relay-threads-acceptance.json':process.argv.includes('--offline-only')?'relay-offline-acceptance.json':'relay-live-acceptance.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{
 for(const id of active)await call('cancel_task',{task_id:id}).catch(()=>{});
 await client.close().catch(()=>{});
 await fetch(origin+'/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id,token:tokens.refresh_token}),signal:AbortSignal.timeout(15000)}).catch(()=>{});
}
