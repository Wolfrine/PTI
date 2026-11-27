import fs from 'node:fs';
import path from 'node:path';
import {openRelayState} from './relay-state.mjs';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {home,config,project,read,write,digest,subscriptionEnvironment,supportsNativeControls,VERSION,taskDir} from './common.mjs';
import {loadCredential,saveCredential,refresh,firebaseAuthConfig,OWNER} from './credentials.mjs';
import {modelSelection} from './model-policy.mjs';
import {reportChangedSnapshot} from './progress.mjs';
import {listenForDispatch} from './notifications.mjs';
import {eventWakeup,watchTask} from './transport-events.mjs';
import {browserContextReport} from './browser-context.mjs';

const base='https://pti-firestore-mcp-185802494856.asia-south1.run.app/local-codex/worker';
const stateFile=path.join(home,'data','relay-state.json');fs.mkdirSync(path.dirname(stateFile),{recursive:true});
const {state,persist,restoredFromBackup}=openRelayState(stateFile);
const generation=job=>job.nativeGeneration??job.generation;
const localRequestKey=job=>`relay-${job.id}-${generation(job)}`;
if(restoredFromBackup) {
  for (const job of state.active) {
    // An older checkpoint may predate a native dispatch. Reconcile the
    // deterministic receipt and preserve uncertainty if it cannot be found.
    if(!job.command && !job.localId && !job.localDelivery && job.transportVersion==='0.5.0') {
      job.localDelivery={state:'attempted',localId:digest(localRequestKey(job)).slice(0,32)};
    }
  }
}
persist();
let token='',until=0,client,connecting,refreshing,stopping=false,stopListener,listenerToken,listenerConnected=false,listenerError,nextSync=0,retryAt=0,retryDelay=1000,syncRequested=true,dispatchRequested=true;
let nativePlanRuntime, nativePlan=false;
async function discoverNativePlan(health){
  if(!supportsNativeControls(health.codexVersion))return false;
  const runtimeKey=health.codexPath+' '+health.codexVersion;
  if(nativePlanRuntime!==runtimeKey){
    try{nativePlan=(await local('native_plan_capabilities')).nativePlan===true;}
    catch{return false;}
    nativePlanRuntime=runtimeKey;
  }
  return nativePlan;
}
const events=eventWakeup(),watchers=new Map(),dirty=new Set(state.active.map(job=>job.id)),controlsById=new Map();

const identity=job=>({id:job.id,generation:generation(job),nativeGeneration:generation(job),...(job.deliveryId?{deliveryId:job.deliveryId}:{}),...(job.lease?{lease:job.lease}:{})});
const remove=job=>{state.active=state.active.filter(value=>value.id!==job.id||generation(value)!==generation(job));watchers.get(job.id)?.();watchers.delete(job.id);dirty.delete(job.id);controlsById.delete(job.id);persist();};
const sourceSha=()=>{if(process.env.LOCAL_CODEX_SOURCE_SHA)return process.env.LOCAL_CODEX_SOURCE_SHA;const file=path.join(home,'active.json');return fs.existsSync(file)?read(file).sourceSha||null:null;};
async function local(name,args={}){
  if(!client){
    connecting||=(async()=>{const candidate=new Client({name:'pti-codex-relay',version:VERSION});try{
      await candidate.connect(new StdioClientTransport({command:process.execPath,args:[path.join(path.dirname(fileURLToPath(import.meta.url)),'server.mjs')],cwd:home,env:subscriptionEnvironment(),stderr:'pipe'}));
      client=candidate;client.onclose=()=>{if(client===candidate)client=undefined;};return candidate;
    }catch(error){await candidate.close().catch(()=>{});throw error;}})().finally(()=>{connecting=undefined;});await connecting;
  }
  const result=await client.callTool({name,arguments:args});if(result.isError){const error=Error(result.content?.[0]?.text||'Local request rejected.');error.localRejection=true;throw error;}return result.structuredContent||JSON.parse(result.content[0].text);
}
async function authenticate(){
  if(Date.now()<=until)return;
  refreshing||=(async()=>{const session=await refresh(await loadCredential());await saveCredential(session.refreshToken);token=session.idToken;until=Date.now()+3000000;})().finally(()=>{refreshing=undefined;});await refreshing;
}
async function api(action,body){
  await authenticate();
  const response=await fetch(`${base}/${action}`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok){await response.body?.cancel();if(response.status===401)until=0;throw Object.assign(Error("Relay request unavailable."),{relayCode:"relay_http_"+action+"_"+response.status});}return response.json();
}
function observe(job,directory=job.localId&&taskDir(job.localId),filename='task.json'){
  if(!directory||watchers.has(job.id)||!fs.existsSync(directory))return;
  watchers.set(job.id,watchTask(directory,()=>{dirty.add(job.id);events.wake();},()=>{watchers.get(job.id)?.();watchers.delete(job.id);dirty.add(job.id);events.wake();},filename));
}
function snapshot(job){
  const plan=job.nativePlan,goal=job.goal;
  const proof=job.nativeTerminal,exact=proof?.source==='turn/completed'&&proof.threadId===job.threadId&&(proof.turnId===job.turnId||job.observedTurns?.some(turn=>turn.turn_id===proof.turnId&&turn.status===proof.status))&&proof.status===job.status;
  return {status:job.status==='queued'?'running':job.status,final:job.final||null,error:job.error?.slice(0,2000)||null,messages:(job.messages||[]).slice(-10).map(message=>({text:message.text,phase:message.phase||null})),pending:job.pending||[],
    control_error:job.controlError?.slice(0,2000)||null,cancellation_state:job.cancellationState||null,
    requested_model:job.requestedModel||null,returned_model:job.returnedModel||job.model||null,requested_reasoning_effort:job.requestedReasoningEffort||null,returned_reasoning_effort:job.returnedReasoningEffort||job.reasoningEffort||null,
    ...(job.model?{model:job.model}:{}),...(job.reasoningEffort?{reasoning_effort:job.reasoningEffort}:{}),...(job.executionPolicy?{execution_policy:job.executionPolicy}:{}),...(job.telemetry?{telemetry:job.telemetry}:{}),
    ...(plan?{native_plan:{...plan,text:plan.text.slice(0,48000),...(plan.text.length>48000?{truncated:true}:{})}}:{}),
    ...(goal?{goal:{threadId:goal.threadId,objective:goal.objective,status:goal.status,tokenBudget:goal.tokenBudget,tokensUsed:goal.tokensUsed,timeUsedSeconds:goal.timeUsedSeconds}}:{}),
    ...(job.nativeControls?{native_controls:true,active_turn_id:job.activeTurnId||null,goal_status:job.goalStatus||null,observed_turns:job.observedTurns||[]}:{}),
    ...(job.threadId?{thread_id:job.threadId,native_thread_id:job.threadId}:{}),...(job.turnId?{native_turn_id:job.turnId}:{}),...(exact?{native_terminal_observed:true,...(proof.turnId!==job.turnId?{native_terminal_turn_id:proof.turnId}:{})}:{}),
    ...(job.nativeTurnDispatchAttempted===false&&job.nativeDeliveryAbsent?{native_delivery_absent:true}:{}),
  };
}
async function report(job,value){if(await reportChangedSnapshot(job,value,snapshot=>api('report',{...identity(job),snapshot})))persist();}
function reconcileLocalIdentity(job){
  const localId=job.localDelivery?.localId;if(!localId)return false;
  if(fs.existsSync(path.join(taskDir(localId),'task.json'))){job.localId=localId;persist();return true;}return false;
}
async function service(job,controls){
  if(controls&&generation(controls)!==undefined&&generation(controls)!==generation(job))throw Error('Mismatched delivery controls.');
  if(job.command?.action==='native_control'){
    const {source_id, ...args}=job.command.args;
    const task_id=digest(localRequestKey({id:source_id,generation:args.generation})).slice(0,32);
    let answer;
    try{answer=await local('native_control',{...args,task_id,operation_id:job.id});}
    catch(error){
      if(!error.localRejection)throw error;
      answer={status:'unknown',error:error.message.slice(0,2000)};
    }
    if(answer.error)answer.error=answer.error.slice(0,2000);
    await report(job,answer);
    if(answer.status==='running')observe(job,path.join(taskDir(task_id),'control-'+job.id),'receipt.json');
    else remove(job);
    return;
  }
  if(job.command){
    // Preserve old receipts and unsupported requests without invoking retired
    // desktop, pairing, QA or remote-control paths.
    if(!['list','read'].includes(job.command.action)){await report(job,{status:'unknown',error:'Legacy execution path retired; request and receipts preserved without cancellation or replay.'});return;}
    if(controls?.cancel){await report(job,{status:'interrupted',native_delivery_absent:true});remove(job);return;}
    const file=path.join(home,'data','history-'+job.id+'.json');
    let value;
    try{
      if(fs.existsSync(file))value=read(file);
      else{value=await local('codex_history',job.command);write(file,value);}
    }catch(error){
      if(!error.localRejection)throw error;
      // A definitive history rejection belongs to this read request. Preserve
      // its receipt and let other claims and the healthy listener progress.
      await report(job,{status:'failed',error:error.message.slice(0,2000)});
      remove(job);return;
    }
    await report(job,{status:'completed',result:value});remove(job);return;
  }
  if(!job.localId){
    if(job.localDelivery){
      if(!reconcileLocalIdentity(job)){await report(job,{status:'unknown',error:'Local delivery was attempted but no durable native task receipt is available. It was not replayed.'});return;}
    }else if(job.transportVersion!=='0.5.0'){
      await report(job,{status:'unknown',error:'Legacy request retained without new native dispatch. Reconcile the original worker receipt.'});return;
    }else{
      const request_key=localRequestKey(job),localId=digest(request_key).slice(0,32);
      // Identity-only delivery journal: not a checkout, worker or resource lock.
      job.localDelivery={state:'attempted',localId,at:new Date().toISOString()};persist();
      try{
        const result=await local('start_task',{project:job.project,prompt:job.prompt,mode:job.mode,request_key,relay_generation:generation(job),...(job.collaboration_mode?{collaboration_mode:job.collaboration_mode}:{}),...(job.approved_goal?{approved_goal:job.approved_goal}:{}),...(job.resume_goal?{resume_goal:true}:{}),...(job.title?{title:job.title}:{}),...((job.nativeThreadId||job.thread_id)?{thread_id:job.nativeThreadId||job.thread_id}:{}),...(job.model?{model:job.model}:{}),...((job.reasoningEffort||job.reasoning_effort)?{reasoning_effort:job.reasoningEffort||job.reasoning_effort}:{})});
        job.localId=result.id;job.localDelivery.state='observed';state.localTasks||={};state.localTasks[job.id]=result.id;persist();
      }catch(error){
        if(!reconcileLocalIdentity(job)){
          await report(job,{status:error.localRejection?'failed':'unknown',error:error.message.slice(0,2000),...(error.localRejection?{native_delivery_absent:true}:{})});
          if(error.localRejection)remove(job);return;
        }
      }
    }
  }
  observe(job);
  if(controls?.cancel&&!job.cancelApplied){await local('cancel_task',{task_id:job.localId});job.cancelApplied=true;persist();}
  for(const answer of controls?.responses||[]){
    if(job.handledResponses?.includes(answer.request_id))continue;const {task_id,...rest}=answer;await local('respond_to_task',{task_id:job.localId,...rest});(job.handledResponses||=[]).push(answer.request_id);persist();
  }
  const current=await local('get_task',{task_id:job.localId,wait_seconds:0});await report(job,snapshot(current));
  if(['completed','failed','interrupted'].includes(current.status))remove(job);
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;events.wake();});
try{
  while(!stopping){
    let failureStage='native_status';
    try{
      if(retryAt>Date.now()){await events.wait(retryAt-Date.now());continue;}
      const settings=config(),selection=modelSelection(settings),health=await local('bridge_status');if(health.authMode!=='chatgpt')throw Error('ChatGPT subscription sign-in required.');
      failureStage='owner_signin';
      await authenticate();
      failureStage='dispatch_listener';
      if(!stopListener||listenerError||listenerToken!==token){
        await stopListener?.();stopListener=undefined;listenerConnected=false;listenerError=undefined;listenerToken=token;
        stopListener=await listenForDispatch({firebase:firebaseAuthConfig(),idToken:token,uid:OWNER,changed:()=>{dispatchRequested=true;syncRequested=true;events.wake();},connection:online=>{if(listenerConnected!==online){listenerConnected=online;syncRequested=true;events.wake();}},failed:error=>{listenerError=error;events.wake();}});
      }
      failureStage='host_sync';
      if(syncRequested||Date.now()>=nextSync){
        const heartbeat={instanceId:state.instanceId,authMode:'chatgpt',version:VERSION,model:selection.model,reasoning_effort:selection.effort,runtimeRoot:home,sourceSha:sourceSha(),browser_context:browserContextReport(),nativeControls:supportsNativeControls(health.codexVersion),nativePlan:await discoverNativePlan(health),dispatchReady:true,projects:Object.keys(settings.projects).map(key=>{try{return {...project(key),available:true};}catch{return {key,name:key,path:'F:/unavailable',available:false};}})};
        const dispatch=dispatchRequested;dispatchRequested=false;syncRequested=false;
        let response;try{response=await api('sync',{heartbeat,dispatch,active:state.active.map(identity)});}catch(error){syncRequested=true;dispatchRequested||=dispatch;throw error;}
        nextSync=Date.now()+(response.syncDelayMs||30000);
        for(const [id,value] of Object.entries(response.controls||{}))controlsById.set(id,value);
        for(const incoming of response.newJobs||response.jobs||[]){
          const previous=state.active.find(value=>value.id===incoming.id&&generation(value)===generation(incoming));
          if(!previous)state.active.push({...incoming,transportVersion:'0.5.0',localId:null});
        }
        // No lost-claim cancellation, lease expiry, resource scheduling or requeue.
        for(const job of state.active){observe(job);dirty.add(job.id);}persist();
        if(response.more){dispatchRequested=true;syncRequested=true;events.wake();}
      }
      failureStage='native_observation';
      const selected=state.active.filter(job=>dirty.delete(job.id));
      const outcomes=await Promise.allSettled(selected.map(job=>service(job,controlsById.get(job.id))));let failed=false;
      outcomes.forEach((value,index)=>{if(value.status==='rejected'){failed=true;dirty.add(selected[index].id);}});if(failed)throw outcomes.find(value=>value.status==='rejected').reason;
      failureStage='dispatch_listener';
      if(listenerError)throw listenerError;
      failureStage='local_checkpoint';
      retryAt=0;retryDelay=1000;persist();
      write(path.join(home,'data','status.json'),{version:VERSION,pid:process.pid,at:new Date().toISOString(),state:'online',runtimeRoot:home,sourceSha:sourceSha(),listenerConnected,activeTasks:state.active.map(job=>job.id)});
    }catch(error){
      retryAt=Date.now()+retryDelay;retryDelay=Math.min(30000,retryDelay*2);persist();
      const knownCodes={
        'Pair this worker to the PTI owner account first.':'owner_pairing_missing',
        'PTI sign-in needs reconnecting.':'owner_token_refresh_rejected',
        'PTI account mismatch.':'owner_account_mismatch',
        'ChatGPT subscription sign-in required.':'codex_subscription_unavailable',
        'Notification account mismatch.':'dispatch_listener_account_mismatch',
      };
      const errorCode=error.relayCode||(Object.hasOwn(knownCodes,error.message)?knownCodes[error.message]:null)||(error.code==='permission-denied'?'dispatch_permission_denied':failureStage+'_unavailable');
      write(path.join(home,'data','status.json'),{version:VERSION,pid:process.pid,at:new Date().toISOString(),state:'unavailable',runtimeRoot:home,sourceSha:sourceSha(),failureStage,errorCode,activeTasks:state.active.map(job=>job.id)});
    }
    await events.wait(Math.max(0,(retryAt||nextSync)-Date.now()));
  }
}finally{
  await stopListener?.();for(const stop of watchers.values())stop();await client?.close();
  // Detached native workers survive transport shutdown and connection loss.
}
