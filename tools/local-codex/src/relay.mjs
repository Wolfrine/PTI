import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {home,config,project,read,write,alive,digest,subscriptionEnvironment,VERSION,taskDir} from './common.mjs';
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
const remoteTimers=new Map(),remoteInFlight=new Map(),remoteErrors=new Set();
const remoteOperation=job=>job.command&&['remote-start','remote-pair'].includes(job.command.action);
const remoteFile=job=>path.join(home,'data',`remote-${job.id}.json`);
function remoteExpiry(value,now){
  const observed=typeof value==='number'?(value<1e12?value*1000:value):typeof value==='string'?Date.parse(value):NaN;
  return Math.min(Number.isFinite(observed)?observed:now+5*60000,now+10*60000);
}
function scheduleRemoteRedaction(file,when){
  if(remoteTimers.has(file))return;
  const timer=setTimeout(()=>{
    remoteTimers.delete(file);
    try{readRemoteReceipt(file);}catch{process.emitWarning('A Local Codex remote pairing receipt could not be redacted.');}
  },Math.max(0,when-Date.now()));
  timer.unref();remoteTimers.set(file,timer);
}
function readRemoteReceipt(file){
  if(!fs.existsSync(file))return null;
  const receipt=read(file);
  if(receipt.operation==='remote-control-pair'&&receipt.manualPairingCode){
    if(!Number.isFinite(receipt.scrubAt)||Date.now()>=receipt.scrubAt){
      const redacted={operation:'remote-control-pair',state:'expired',redacted:true,expiresAt:receipt.expiresAt??null,host_control:true};
      write(file,redacted);return redacted;
    }
    scheduleRemoteRedaction(file,receipt.scrubAt);
  }
  return receipt;
}
for(const name of fs.readdirSync(path.join(home,'data')).filter(name=>/^remote-[a-f0-9]{32}\.json$/.test(name))){
  try{readRemoteReceipt(path.join(home,'data',name));}
  catch{process.emitWarning('A Local Codex remote pairing receipt could not be redacted during startup.');}
}
async function serviceRemote(job){
  const file=remoteFile(job),cached=readRemoteReceipt(file);
  if(cached){
    if(cached.state==='attempting')throw Error('A previous remote-control operation has an unknown outcome; it was not replayed. Use a fresh request after inspecting remote status.');
    return cached;
  }
  // The attempt marker is written before invoking the CLI. An interrupted
  // relay cannot accidentally generate a second code for the same request.
  write(file,{operation:job.command.action,state:'attempting',startedAt:Date.now(),host_control:true});
  const result=await local('codex_history',job.command);
  if(job.command.action==='remote-pair'&&result.state==='code-created'){
    const scrubAt=remoteExpiry(result.expiresAt,Date.now());
    write(file,{...result,scrubAt});
    if(scrubAt<=Date.now())return readRemoteReceipt(file);
    scheduleRemoteRedaction(file,scrubAt);
  }else write(file,result);
  return result;
}
// A completed MCP application rejection can prove that a brand-new task was
// never created only when its deterministic local directory was absent both
// before and after the rejection. A transport timeout cannot prove this.
const localStartId=job=>digest(`relay-${job.id}-${job.generation}`).slice(0,32);
const rejectedStartFile=job=>path.join(home,'data',`rejected-start-${job.id}-${job.generation}.json`);
function localStartDirectoryAbsent(job){
  try{fs.lstatSync(taskDir(localStartId(job)));return false;}
  catch(error){if(error.code==='ENOENT')return true;throw error;}
}
async function reportRejectedStart(job,receipt){
  if(job.mode!=='edit'||receipt.localId!==localStartId(job)||!localStartDirectoryAbsent(job))throw Error('Local start rejection cannot prove non-delivery: its deterministic task directory now exists or identity changed.');
  await api('report',{id:job.id,generation:job.generation,lease:job.lease,
    snapshot:{status:'failed',error:receipt.error,native_delivery_absent:true}});
  remove(job);
}
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
function nativeTerminalProven(job,generation){
  const proof=job.nativeTerminal;
  return job.mode==='edit'&&Number.isInteger(generation)&&job.relayGeneration===generation&&
    ['completed','failed','interrupted'].includes(job.status)&&
    typeof job.threadId==='string'&&job.threadId.length>0&&
    typeof job.turnId==='string'&&job.turnId.length>0&&
    proof?.source==='turn/completed'&&proof.threadId===job.threadId&&
    proof.turnId===job.turnId&&proof.status===job.status;
}
function nativeDeliveryProvenAbsent(job,generation){
  const proof=job.nativeDeliveryAbsent;
  return job.mode==='edit'&&Number.isInteger(generation)&&job.relayGeneration===generation&&
    ['completed','failed','interrupted'].includes(job.status)&&job.nativeTurnDispatchAttempted===false&&
    proof?.source==='worker-terminal-before-turn-start'&&proof.generation===generation&&proof.status===job.status;
}
function nativeTurnKnown(job,generation){
  return job.mode==='edit'&&Number.isInteger(generation)&&job.relayGeneration===generation&&
    job.nativeTurnDispatchAttempted===true&&typeof job.threadId==='string'&&job.threadId.length>0&&
    typeof job.turnId==='string'&&job.turnId.length>0;
}
function snapshot(job,generation){return {
  status:job.status==='queued'?'running':job.status,final:job.final||null,error:job.error?.slice(0,2000)||null,
  messages:job.messages.slice(-10).map(m=>({text:m.text,phase:m.phase||null})),pending:job.pending||[],
  ...(job.model?{model:job.model}:{}),...(job.reasoningEffort?{reasoning_effort:job.reasoningEffort}:{}),
  ...(job.executionPolicy?{execution_policy:job.executionPolicy}:{}),
  ...(job.chatRouting?{chat_routing:job.chatRouting}:{}),
  ...(job.threadId?{thread_id:job.threadId}:{}),...(job.telemetry?{telemetry:job.telemetry}:{}),
  // The exact native turn can be pinned before completion for later signed-in
  // history reconciliation. Knowing its ID alone never proves termination.
  ...(nativeTurnKnown(job,generation)?{native_turn_id:job.turnId}:{}),
  ...(nativeTurnKnown(job,generation)&&nativeTerminalProven(job,generation)?{native_terminal_observed:true}:{}),
  ...(nativeDeliveryProvenAbsent(job,generation)?{native_delivery_absent:true}:{}),
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
async function serviceDesktop(job,controls,args){
  let result;
  try{result=await local('codex_history',{action:'desktop',args:{...args,request_id:job.id,...(controls?.cancel?{cancel:true}:{})}});}
  catch(error){
    const file=path.join(home,'data',`desktop-${job.id}.json`),prior=fs.existsSync(file)?read(file):null;
    const expected=digest(JSON.stringify({thread:args.thread_id,project:args.project,prompt:args.prompt}));
    if(!prior||prior.inputHash!==expected)throw error;
    // A reader/transport failure after durable delivery is not proof that
    // app-owned work failed or stopped. Retain its lease and exact identity.
    result={...prior,...(!['completed','failed','interrupted'].includes(prior.work_state)?{work_state:'unknown'}:{}),observation_error:error.message.slice(0,250)};
  }
  const state=result.work_state;
  const status=['completed','failed','interrupted'].includes(state)?state:
    result.state==='cancelled'?'interrupted':result.state==='not-started'?'failed':'running';
  const value={status,result:{...result,...(job.desktopRecovery?{recovery:job.desktopRecovery}:{})}};
  if(await reportChangedSnapshot(job,value,snapshot=>api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot})))persist();
  else metrics.suppressedReports++;
  if(status!=='running')remove(job);
}
async function service(job,controls){
  if(controls?.generation!==undefined&&controls.generation!==job.generation)throw Error('Mismatched relay controls.');
  try{
    if(job.desktopRecovery){
      await serviceDesktop(job,controls,{project:job.project,thread_id:job.desktopRecovery.thread_id,prompt:job.prompt});
      return;
    }
    if(job.command){
      if(job.command.action==='desktop'){
        await serviceDesktop(job,controls,job.command.args);
        return;
      }
      const receipt=path.join(home,'data',`history-${job.id}.json`);
      if(controls?.cancel)await api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot:{status:'interrupted'}});
      else{
        const result=remoteOperation(job)?await serviceRemote(job):fs.existsSync(receipt)?read(receipt):await local('codex_history',job.command);
        if(!remoteOperation(job)&&!fs.existsSync(receipt))write(receipt,result);
        await api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot:{status:'completed',result}});
      }
      remove(job);return;
    }
    if(!job.localId){
      const request_key=`relay-${job.id}-${job.generation}`,previous=state.localTasks?.[job.id];
      const rejectionFile=rejectedStartFile(job);
      if(!previous&&fs.existsSync(rejectionFile)){
        await reportRejectedStart(job,read(rejectionFile));return;
      }
      const absentBefore=!previous&&localStartDirectoryAbsent(job);
      let result;
      try{
        result=previous
          ?await local('continue_task',{task_id:previous,prompt:job.prompt,request_key,relay_generation:job.generation})
          :await local('start_task',{project:job.project,prompt:job.prompt,mode:job.mode,request_key,relay_generation:job.generation,strategy:job.strategy||'auto',purpose:job.purpose||'work',...(job.title?{title:job.title}:{}),...(job.thread_id?{thread_id:job.thread_id}:{}),...(job.model?{model:job.model}:{}),...(job.reasoning_effort?{reasoning_effort:job.reasoning_effort}:{}),...(job.chat_routing?{chat_routing:job.chat_routing,affinity_fallback:job.affinity_fallback||false}:{}),...(job.handoff?{handoff:job.handoff}:{})});
      }catch(error){
        if(job.mode==='edit'&&!previous&&absentBefore&&error.scope==='local'&&!error.retryable&&localStartDirectoryAbsent(job)){
          const receipt={localId:localStartId(job),error:error.message.slice(0,2000)};
          write(rejectionFile,receipt);
          await reportRejectedStart(job,receipt);return;
        }
        throw error;
      }
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
    // Only an edit whose native resume failed before starting any turn may
    // recover through the same chat's ordinary queue. Inspect keeps its sandbox.
    if(current.status==='failed'&&job.mode==='edit'&&!controls?.cancel&&current.threadId&&!current.turnId&&
      /already has an active writer|Native ownership is unresolved|The selected native chat is active|The module parent is active/.test(current.error||'')&&current.telemetry?.commands===0&&current.telemetry?.toolCalls===0){
      if(alive(current.workerPid)){
        const waiting={status:'running',result:{operation:'native-writer-recovery',state:'waiting-for-failed-worker-exit',thread_id:current.threadId,failed_local_task:job.localId}};
        if(await reportChangedSnapshot(job,waiting,snapshot=>api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot})))persist();
        return;
      }
      job.desktopRecovery={route:'existing-desktop-queue',thread_id:current.threadId,failed_local_task:job.localId,reason:'native-writer-held-before-turn'};
      persist();
      await serviceDesktop(job,controls,{project:job.project,thread_id:current.threadId,prompt:job.prompt});
      return;
    }
    if(await reportChangedSnapshot(job,snapshot(current,job.generation),value=>api('report',{id:job.id,generation:job.generation,lease:job.lease,snapshot:value})))persist();else metrics.suppressedReports++;
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
      const ordinary=[];
      for(const job of selected){
        if(!remoteOperation(job)){ordinary.push(job);continue;}
        if(remoteInFlight.has(job.id))continue;
        // Pairing may wait on the native CLI for tens of seconds. Keep lease
        // maintenance and unrelated task reports moving while it finishes.
        const operation=service(job,controlsById.get(job.id))
          .catch(()=>{remoteErrors.add(job.id);dirty.add(job.id);})
          .finally(()=>{remoteInFlight.delete(job.id);events.wake();});
        remoteInFlight.set(job.id,operation);
      }
      const results=await Promise.allSettled(ordinary.map(job=>service(job,controlsById.get(job.id))));
      let failed=false;
      results.forEach((result,index)=>{if(result.status==='rejected'){failed=true;dirty.add(ordinary[index].id);}});
      if(remoteErrors.size){remoteErrors.clear();failed=true;}
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
