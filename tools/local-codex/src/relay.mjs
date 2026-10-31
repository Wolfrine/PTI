import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {home,config,project,read,write,alive,subscriptionEnvironment,VERSION,taskDir} from './common.mjs';
import {loadCredential,saveCredential,refresh} from './credentials.mjs';
import {modelSelection} from './model-policy.mjs';
import {reportChangedSnapshot} from './progress.mjs';
import {claims,mergeClaims,withoutClaim,retryableLocal} from './relay-state.mjs';

const base='https://pti-firestore-mcp-185802494856.asia-south1.run.app/local-codex/worker';
fs.mkdirSync(path.join(home,'data'),{recursive:true});
const lock=path.join(home,'data','relay.lock');
if(fs.existsSync(lock)){if(alive(read(lock).pid))process.exit(0);fs.unlinkSync(lock);}
const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);
const stateFile=path.join(home,'data','relay-state.json');
let state=fs.existsSync(stateFile)?read(stateFile):{instanceId:randomUUID(),active:[]};
state.active=claims(state.active);
let token='',until=0,client,connecting,refreshing,lastSuccess=state.lastSuccess||0,stopping=false,authUntil=0,cachedAuth;
const persist=()=>write(stateFile,state);
const remove=job=>{state.active=withoutClaim(state.active,job);persist();};
async function local(name,args={}){
  if(!client){
    connecting||=(async()=>{
      const candidate=new Client({name:'pti-codex-relay',version:VERSION});
      try{
        await candidate.connect(new StdioClientTransport({command:process.execPath,args:[path.join(path.dirname(fileURLToPath(import.meta.url)),'server.mjs')],cwd:home,env:subscriptionEnvironment(),stderr:'pipe'}));
        client=candidate;client.onclose=()=>{if(client===candidate)client=undefined;authUntil=0;};return candidate;
      }catch(error){await candidate.close().catch(()=>{});throw error;}
    })().finally(()=>{connecting=undefined;});
    await connecting;
  }
  const result=await client.callTool({name,arguments:args});
  if(result.isError){const error=Error(result.content?.[0]?.text||'Local task failed.');error.scope='local';error.retryable=retryableLocal(name,error.message);throw error;}
  return result.structuredContent||JSON.parse(result.content[0].text);
}
async function api(action,body){
  if(Date.now()>until){
    refreshing||=(async()=>{const session=await refresh(await loadCredential());await saveCredential(session.refreshToken);token=session.idToken;until=Date.now()+3000000;})().finally(()=>{refreshing=undefined;});
    await refreshing;
  }
  const response=await fetch(`${base}/${action}`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok){await response.body?.cancel();if(response.status===401)until=0;throw Error(response.status===409?'lease_lost':`Relay request unavailable (HTTP ${response.status}).`);}
  return response.json();
}
function snapshot(job){return {
  status:job.status==='queued'?'running':job.status,final:job.final||null,error:job.error?.slice(0,2000)||null,
  messages:job.messages.slice(-10).map(m=>({text:m.text,phase:m.phase||null})),pending:job.pending||[],
  ...(job.model?{model:job.model}:{}),...(job.reasoningEffort?{reasoning_effort:job.reasoningEffort}:{}),
  ...(job.threadId?{thread_id:job.threadId}:{}),...(job.telemetry?{telemetry:job.telemetry}:{}),
};}
async function authMode(){
  if(Date.now()>authUntil){const health=await local('bridge_status');cachedAuth=health.authMode;authUntil=Date.now()+60000;}
  return cachedAuth;
}
async function cancelOwned(job){
  if(!job.localId)return;
  try{await local('cancel_task',{task_id:job.localId});}
  catch{
    // Detached model workers survive an MCP reconnect. Leave their supported
    // cancellation marker even when that local transport is unavailable.
    const directory=taskDir(job.localId),file=path.join(directory,'task.json');
    if(fs.existsSync(file)&&!['completed','failed','interrupted'].includes(read(file).status))write(path.join(directory,'cancel.json'),{requestedAt:new Date().toISOString()});
  }
}
async function service(job,controls){
  if(controls?.generation!==undefined&&controls.generation!==job.generation)throw Error('Mismatched relay controls.');
  try{
    if(job.command){
      const receipt=path.join(home,'data',`history-${job.id}.json`);
      if(controls?.cancel)await api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot:{status:'interrupted'}});
      else{
        const result=fs.existsSync(receipt)?read(receipt):await local('codex_history',job.command);
        if(!fs.existsSync(receipt))write(receipt,result);
        await api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot:{status:'completed',result}});
      }
      remove(job);return;
    }
    if(!job.localId){
      const request_key=`relay-${job.id}-${job.generation}`,previous=state.localTasks?.[job.id];
      const result=previous
        ?await local('continue_task',{task_id:previous,prompt:job.prompt,request_key,relay_generation:job.generation})
        :await local('start_task',{project:job.project,prompt:job.prompt,mode:job.mode,request_key,relay_generation:job.generation,strategy:job.strategy||'auto',purpose:job.purpose||'work',...(job.title?{title:job.title}:{}),...(job.thread_id?{thread_id:job.thread_id}:{})});
      job.localId=result.id;state.localTasks||={};state.localTasks[job.id]=result.id;persist();
    }
    if(controls?.cancel)await local('cancel_task',{task_id:job.localId});
    for(const answer of controls?.responses||[]){const {task_id,...rest}=answer;try{await local('respond_to_task',{task_id:job.localId,...rest});}catch{/* An already handled human response is idempotent. */}}
    const current=await local('get_task',{task_id:job.localId,wait_seconds:0});
    if(await reportChangedSnapshot(job,snapshot(current),value=>api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot:value})))persist();
    if(['completed','failed','interrupted'].includes(current.status))remove(job);
  }catch(error){
    if(error.message==='lease_lost'){await cancelOwned(job);remove(job);return;}
    if(error.scope==='local'&&!error.retryable){
      await cancelOwned(job);
      await api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot:{status:'failed',error:error.message.slice(0,2000)}});remove(job);return;
    }
    throw error;
  }
}
process.on('SIGINT',()=>stopping=true);process.on('SIGTERM',()=>stopping=true);
try{
  while(!stopping){
    try{
      if(state.active.length&&Date.now()-lastSuccess>45000)await Promise.allSettled(state.active.map(cancelOwned));
      if(await authMode()!=='chatgpt')throw Error('ChatGPT subscription sign-in required.');
      const selection=modelSelection(config()),settings=config();
      const heartbeat={model:selection.model,reasoning_effort:selection.effort,instanceId:state.instanceId,authMode:'chatgpt',version:VERSION,
        maxConcurrentTasks:settings.maxConcurrentTasks,maxSubagentsPerTask:settings.maxSubagentsPerTask,
        projects:Object.keys(settings.projects).map(key=>{try{return {...project(key),available:true};}catch{return {key,name:key,path:'F:/unavailable',resourcePath:'F:/unavailable',available:false};}})};
      const response=await api('poll',{heartbeat,active:state.active.map(({id,generation,lease})=>({id,generation,lease}))});
      lastSuccess=Date.now();state.lastSuccess=lastSuccess;
      const lost=[...(response.lost||[]),...Object.keys(response.controls||{}).filter(id=>response.controls[id]?.error==='lease_lost')];
      for(const lostId of lost){const job=state.active.find(item=>item.id===(typeof lostId==='string'?lostId:lostId.id));if(job){await cancelOwned(job);remove(job);}}
      state.active=mergeClaims(state.active,response.jobs);persist();
      const results=await Promise.allSettled([...state.active].map(job=>service(job,response.controls?.[job.id])));
      const failed=results.some(result=>result.status==='rejected');
      write(path.join(home,'data','status.json'),{version:VERSION,at:new Date().toISOString(),state:failed?'degraded':'online',authMode:'chatgpt',activeTask:state.active[0]?.id||null,activeTasks:state.active.map(job=>job.id),capacity:settings.maxConcurrentTasks,...(failed?{errorCode:'task_report_retry_pending'}:{})});
    }catch(error){
      write(path.join(home,'data','status.json'),{version:VERSION,at:new Date().toISOString(),state:'unavailable',errorCode:'connection_or_signin_required',activeTasks:state.active.map(job=>job.id)});
    }
    await new Promise(resolve=>setTimeout(resolve,state.active.length?3000:15000));
  }
}finally{
  await Promise.allSettled(state.active.map(cancelOwned));await client?.close();
  if(fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);
}
