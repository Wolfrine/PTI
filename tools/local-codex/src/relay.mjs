import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {home,config,project,read,write,alive,subscriptionEnvironment,VERSION,taskDir} from './common.mjs';
import {loadCredential,saveCredential,refresh,firebaseAuthConfig,OWNER} from './credentials.mjs';
import {modelSelection} from './model-policy.mjs';
import {reportChangedSnapshot} from './progress.mjs';
import {claims,mergeClaims,withoutClaim,retryableLocal} from './relay-state.mjs';
import {listenForDispatch} from './notifications.mjs';
import {eventWakeup,watchTask} from './transport-events.mjs';
import {browserContextReport} from './browser-context.mjs';

const base='https://pti-firestore-mcp-185802494856.asia-south1.run.app/local-codex/worker';
fs.mkdirSync(path.join(home,'data'),{recursive:true});
const lock=path.join(home,'data','relay.lock');
if(fs.existsSync(lock)){if(alive(read(lock).pid))process.exit(0);fs.unlinkSync(lock);}
const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);
const stateFile=path.join(home,'data','relay-state.json');
let state=fs.existsSync(stateFile)?read(stateFile):{instanceId:randomUUID(),active:[]};
state.active=claims(state.active);
let token='',until=0,client,connecting,refreshing,lastSuccess=state.lastSuccess||0,stopping=false,authUntil=0,cachedAuth;
const events=eventWakeup(),watchers=new Map(),dirty=new Set(state.active.map(job=>job.id));
let syncRequested=true,dispatchRequested=false,listenerToken,stopListener,listenerError,listenerConnected=false,nextMaintenance=0,retryAt=0,retryDelay=1000;
let lossCancelled=false;
function deadline(){return Math.min(retryAt||nextMaintenance,state.active.length&&!lossCancelled?lastSuccess+45001:Infinity);}
const metrics=state.transport||{schemaVersion:1,startedAt:new Date().toISOString(),syncRequests:0,dispatchRequests:0,emptyDispatches:0,notificationEvents:0,listenerSessions:0,localFileEvents:0,reportRequests:0,suppressedReports:0,failedRequests:0,claims:0};
const persist=()=>write(stateFile,state);
const remove=job=>{state.active=withoutClaim(state.active,job);watchers.get(job.id)?.();watchers.delete(job.id);dirty.delete(job.id);persist();};
function observe(job){
  if(!job.localId||watchers.has(job.id))return;
  watchers.set(job.id,watchTask(taskDir(job.localId),()=>{metrics.localFileEvents++;dirty.add(job.id);events.wake();},()=>{watchers.get(job.id)?.();watchers.delete(job.id);dirty.add(job.id);events.wake();}));
}
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
  if(action==='report')metrics.reportRequests++;
  const response=await fetch(`${base}/${action}`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok){await response.body?.cancel();if(response.status===401)until=0;throw Error(response.status===409?'lease_lost':`Relay request unavailable (HTTP ${response.status}).`);}
  const result=await response.json();lastSuccess=Date.now();lossCancelled=false;return result;
}
function snapshot(job){return {
  status:job.status==='queued'?'running':job.status,final:job.final||null,error:job.error?.slice(0,2000)||null,
  messages:job.messages.slice(-10).map(m=>({text:m.text,phase:m.phase||null})),pending:job.pending||[],
  ...(job.model?{model:job.model}:{}),...(job.reasoningEffort?{reasoning_effort:job.reasoningEffort}:{}),
  ...(job.executionPolicy?{execution_policy:job.executionPolicy}:{}),
  ...(job.chatRouting?{chat_routing:job.chatRouting}:{}),
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
        :await local('start_task',{project:job.project,prompt:job.prompt,mode:job.mode,request_key,relay_generation:job.generation,strategy:job.strategy||'auto',purpose:job.purpose||'work',...(job.title?{title:job.title}:{}),...(job.thread_id?{thread_id:job.thread_id}:{}),...(job.chat_routing?{chat_routing:job.chat_routing,affinity_fallback:job.affinity_fallback||false}:{}),...(job.handoff?{handoff:job.handoff}:{})});
      job.localId=result.id;state.localTasks||={};state.localTasks[job.id]=result.id;persist();
    }
    observe(job);
    if(controls?.cancel&&!job.cancelApplied){await local('cancel_task',{task_id:job.localId});job.cancelApplied=true;persist();}
    for(const answer of controls?.responses||[]){
      if(job.handledResponses?.includes(answer.request_id))continue;
      const {task_id,...rest}=answer;
      await local('respond_to_task',{task_id:job.localId,...rest});
      (job.handledResponses||=[]).push(answer.request_id);persist();
    }
    const current=await local('get_task',{task_id:job.localId,wait_seconds:0});
    if(await reportChangedSnapshot(job,snapshot(current),value=>api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot:value})))persist();else metrics.suppressedReports++;
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
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;events.wake();});
const controlsById=new Map();
try{
  while(!stopping){
    try{
      if(state.active.length&&!lossCancelled&&Date.now()-lastSuccess>45000){lossCancelled=true;await Promise.allSettled(state.active.map(cancelOwned));}
      if(retryAt>Date.now()){await events.wait(deadline()-Date.now());continue;}
      if(await authMode()!=='chatgpt')throw Error('ChatGPT subscription sign-in required.');
      const selection=modelSelection(config()),settings=config();
      const heartbeat={browser_context:browserContextReport(),model:selection.model,reasoning_effort:selection.effort,instanceId:state.instanceId,authMode:'chatgpt',version:VERSION,dispatchReady:listenerConnected,
        maxConcurrentTasks:settings.maxConcurrentTasks,maxSubagentsPerTask:settings.maxSubagentsPerTask,maxTaskMinutes:settings.maxTaskMinutes,
        projects:Object.keys(settings.projects).map(key=>{try{return {...project(key),available:true};}catch{return {key,name:key,path:'F:/unavailable',resourcePath:'F:/unavailable',available:false};}})};
      // Refresh the protected user token through the existing native auth path.
      // SDK sessions rotate only with the token, never once per maintenance call.
      if(!stopListener||listenerError||Date.now()>until||listenerToken!==token&&token){
        await stopListener?.();stopListener=undefined;listenerConnected=false;listenerError=undefined;
        if(Date.now()>until){refreshing||=(async()=>{const session=await refresh(await loadCredential());await saveCredential(session.refreshToken);token=session.idToken;until=Date.now()+3000000;})().finally(()=>{refreshing=undefined;});await refreshing;}
        listenerToken=token;metrics.listenerSessions++;
        stopListener=await listenForDispatch({firebase:firebaseAuthConfig(),idToken:token,uid:OWNER,
          changed:()=>{metrics.notificationEvents++;dispatchRequested=true;syncRequested=true;events.wake();},
          connection:online=>{if(listenerConnected!==online){listenerConnected=online;syncRequested=true;events.wake();}},
          failed:error=>{listenerError=error;events.wake();}});
      }
      if(syncRequested||Date.now()>=nextMaintenance){
        const dispatch=dispatchRequested;dispatchRequested=false;syncRequested=false;
        metrics.syncRequests++;if(dispatch)metrics.dispatchRequests++;
        let response;
        try{response=await api('sync',{heartbeat,dispatch,active:state.active.map(({id,generation,lease})=>({id,generation,lease}))});}
        catch(error){syncRequested=true;dispatchRequested ||= dispatch;throw error;}
        nextMaintenance=Date.now()+response.syncDelayMs;state.lastSuccess=lastSuccess;
        if(dispatch&&!response.jobs?.length)metrics.emptyDispatches++;
        for(const lostId of response.lost||[]){const job=state.active.find(item=>item.id===lostId);if(job){await cancelOwned(job);remove(job);}controlsById.delete(lostId);}
        for(const [id,value] of Object.entries(response.controls||{}))controlsById.set(id,value);
        state.active=mergeClaims(state.active,response.jobs);metrics.claims+=response.jobs?.length||0;
        for(const job of state.active){observe(job);dirty.add(job.id);}
        if(response.more){dispatchRequested=true;syncRequested=true;events.wake();}
      }
      const selected=state.active.filter(job=>dirty.delete(job.id));
      const results=await Promise.allSettled(selected.map(job=>service(job,controlsById.get(job.id))));
      let failed=false;
      results.forEach((result,index)=>{if(result.status==='rejected'){failed=true;dirty.add(selected[index].id);}});
      if(failed)throw Error('task_report_retry_pending');
      if(listenerError)throw Error('notification_listener_unavailable');
      retryAt=0;retryDelay=1000;state.transport=metrics;state.lastSuccess=lastSuccess;persist();
      write(path.join(home,'data','status.json'),{version:VERSION,at:new Date().toISOString(),state:listenerConnected?'online':'connecting',transport:'firestore-listener',listenerConnected,authMode:'chatgpt',activeTask:state.active[0]?.id||null,activeTasks:state.active.map(job=>job.id),capacity:settings.maxConcurrentTasks,transportMetrics:metrics});
    }catch(error){
      metrics.failedRequests++;retryAt=Date.now()+retryDelay;retryDelay=Math.min(30000,retryDelay*2);
      state.transport=metrics;persist();
      write(path.join(home,'data','status.json'),{version:VERSION,at:new Date().toISOString(),state:'unavailable',transport:'firestore-listener',listenerConnected,errorCode:'connection_or_signin_required',activeTasks:state.active.map(job=>job.id),transportMetrics:metrics});
    }
    // Only notifications, local file events, retries and health deadlines wake us.
    // Maintenance checks leases but never queries work when dispatch is false.
    await events.wait(deadline()-Date.now());
  }
}finally{
  await stopListener?.();for(const stop of watchers.values())stop();
  await Promise.allSettled(state.active.map(cancelOwned));await client?.close();
  if(fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);
}
