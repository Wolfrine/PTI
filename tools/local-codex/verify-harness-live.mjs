// Explicit live subscription acceptance. It creates only bounded acceptance
// tasks and an F-drive evidence report; owner feedback is never fabricated.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {loadCredential,refresh,saveCredential} from './src/credentials.mjs';
import {home,read,write} from './src/common.mjs';
if(!process.argv.includes('--run'))throw Error('Pass --run to authorize real bounded Local Codex harness acceptance.');
const origin='https://pti-firestore-mcp-185802494856.asia-south1.run.app',resource=origin+'/local-codex/mcp';
const verifier=randomUUID()+randomUUID(),challenge=createHash('sha256').update(verifier).digest('base64url');
const redirect_uri='https://chatgpt.com/connector_platform/oauth_redirect';
let tokens,client_id;
const client=new Client({name:'local-codex-harness-acceptance',version:'0.4.0'}),active=new Set(),results={};
const post=async(route,body,headers={})=>{
  const response=await fetch(origin+route,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,route);return response.json();
};
async function call(name,args={}){
  const result=await client.callTool({name,arguments:args});assert(!result.isError,result.content?.find(c=>c.type==='text')?.text);
  return JSON.parse(result.content.find(c=>c.type==='text').text);
}
async function until(id,states,requireModel=false){
  const deadline=Date.now()+240000;
  while(Date.now()<deadline){
    const value=await call('get_task',{task_id:id,wait_seconds:20});
    console.log(JSON.stringify({id,status:value.status,generation:value.generation,model:value.model||null,effort:value.reasoning_effort||null}));
    if(states.includes(value.status)&&(!requireModel||value.model))return value;
    if(['completed','failed','interrupted','waiting_for_user'].includes(value.status))throw Error(value.error||`Unexpected task state ${value.status}.`);
  }
  throw Error('Live harness acceptance timed out.');
}
async function start(label,prompt,strategy='single'){
  const task=await call('start_task',{project:'scratch',mode:'inspect',strategy,purpose:'acceptance',title:`Harness live acceptance ${label}`,work_key:`harness-acceptance-${nonce}-${label}`,request_key:`harness-start-${nonce}-${label}`,prompt});
  active.add(task.id);return task;
}
const nonce=randomUUID(),startedAt=new Date().toISOString();
try{
  const registration=await fetch(origin+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Local Codex harness acceptance',redirect_uris:[redirect_uri],token_endpoint_auth_method:'none'}),signal:AbortSignal.timeout(30000)});
  assert.equal(registration.status,201);({client_id}=await registration.json());
  const authorize=await fetch(origin+'/authorize?'+new URLSearchParams({client_id,redirect_uri,response_type:'code',code_challenge_method:'S256',code_challenge:challenge,scope:'local-codex:jobs',resource,state:randomUUID()}),{redirect:'manual',signal:AbortSignal.timeout(30000)});
  assert.equal(authorize.status,302);const cookie=authorize.headers.get('set-cookie').split(';')[0];
  const session=await refresh(await loadCredential());await saveCredential(session.refreshToken);
  const consent=await post('/consent',{requestId:new URL(authorize.headers.get('location')).searchParams.get('request'),idToken:session.idToken},{Origin:origin,Cookie:cookie});
  const exchange=await fetch(origin+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id,redirect_uri,code:new URL(consent.redirect).searchParams.get('code'),code_verifier:verifier,resource}),signal:AbortSignal.timeout(30000)});
  assert.equal(exchange.status,200);tokens=await exchange.json();
  await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}}}));
  assert.equal((await client.listTools()).tools.length,13);
  let status=await call('bridge_status');assert(status.online&&status.workerVersion==='0.4.0'&&status.availableSlots>=2,'Wait for an idle modern worker; unrelated work was not changed.');
  const projects=await call('list_projects');assert(projects.projects.some(p=>p.key==='scratch'&&p.available));
  await call('list_tasks',{project:'scratch',query:'Harness live acceptance',limit:10});
  const peer=await start('peer','This is a bounded live harness acceptance. Use exactly one PowerShell command Start-Sleep -Seconds 20, then reply exactly HARNESS_PEER_A. Do not read or edit files, spawn agents, or use any other tool.');
  const cancelled=await start('cancel','This is a bounded live harness acceptance. Use exactly one PowerShell command Start-Sleep -Seconds 50, then reply exactly HARNESS_CANCEL_B. Do not read or edit files, spawn agents, or use any other tool.');
  const both=await Promise.all([until(peer.id,['running'],true),until(cancelled.id,['running'],true)]);
  assert(both.every(job=>job.model==='gpt-6.1-sol'&&job.reasoning_effort==='xhigh'));
  status=await call('bridge_status');assert(status.activeTasks.some(t=>t.id===peer.id)&&status.activeTasks.some(t=>t.id===cancelled.id));
  results.overlap={at:new Date().toISOString(),activeTasks:status.activeTasks.map(t=>t.id),capacity:status.capacity};
  await call('cancel_task',{task_id:cancelled.id});
  results.cancelled=await until(cancelled.id,['interrupted']);active.delete(cancelled.id);
  results.peer=await until(peer.id,['completed']);active.delete(peer.id);assert.equal(results.peer.final,'HARNESS_PEER_A');
  await call('continue_task',{task_id:peer.id,request_key:`harness-follow-${nonce}`,prompt:'Without tools or file access, repeat your previous exact marker and append _CONTINUED. Reply with only that resulting marker.'});active.add(peer.id);
  results.continued=await until(peer.id,['completed']);active.delete(peer.id);
  assert.equal(results.continued.thread_id,results.peer.thread_id);assert.equal(results.continued.final,'HARNESS_PEER_A_CONTINUED');
  const team=await start('team','This is a bounded native-subagent harness acceptance. Spawn exactly one child using gpt-6.1-sol with xhigh reasoning (inherit this exact pair or set it explicitly). Give the child this task: without tools, files, commands or further agents, reply exactly TEAM_CHILD_17. Wait for the actual child result, then reply exactly TEAM_PARENT_17:TEAM_CHILD_17. Use only the native delegation and waiting tools needed for this. Do not read/edit files, run commands or use other tools.','team');
  results.team=await until(team.id,['completed']);active.delete(team.id);
  assert.equal(results.team.final,'TEAM_PARENT_17:TEAM_CHILD_17');assert.equal(results.team.telemetry?.childrenSeen,1);
  assert(results.team.telemetry.children.every(child=>child.model==='gpt-6.1-sol'&&child.reasoningEffort==='xhigh'&&child.selectionVerified));
  assert([results.peer,results.continued,results.team].every(job=>job.model==='gpt-6.1-sol'&&job.reasoning_effort==='xhigh'));
  const evidence={startedAt,finishedAt:new Date().toISOString(),mock:false,checks:['two confirmed parent tasks overlapped','cancelling one preserved its peer result','continuation preserved native thread and model','one native child returned evidence synthesized by its parent','child selected model and effort observed; executionVerified remains protocol-limited','acceptance tasks explicitly excluded from ordinary effectiveness metrics'],tasks:results};
  const directory=path.join(home,'harness','acceptance');fs.mkdirSync(directory,{recursive:true});
  write(path.join(directory,`live-${nonce}.json`),evidence);write(path.join(directory,'latest.json'),{file:`live-${nonce}.json`,finishedAt:evidence.finishedAt,mock:false});
  console.log(JSON.stringify({passed:evidence.checks.length,checks:evidence.checks,file:path.join(directory,`live-${nonce}.json`)},null,2));
}finally{
  for(const id of active)await call('cancel_task',{task_id:id}).catch(()=>{});
  await client.close().catch(()=>{});
  if(tokens)await fetch(origin+'/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id,token:tokens.refresh_token}),signal:AbortSignal.timeout(15000)}).catch(()=>{});
}
