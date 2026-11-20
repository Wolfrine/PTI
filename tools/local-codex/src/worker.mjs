import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {config,project,read,write,runtime,task,taskDir,digest,alive,subscriptionEnvironment,VERSION} from './common.mjs';
import {modelSelection,requireModel,verifyModel} from './model-policy.mjs';
import {harnessPolicy} from './harness-policy.mjs';
import {createTelemetry,archiveRun} from './telemetry.mjs';
import {executionPolicy,verifyExecutionPolicy,workerInstructions} from './execution-policy.mjs';
import {attachNativeControls} from './native-controls.mjs';
import {browserContextPreflight,browserContextInstructions} from './browser-context.mjs';

const id=process.argv[2],directory=taskDir(id),file=path.join(directory,'task.json');
let job=task(id),proc,timer,closed=false,sequence=0,cancelling=false,telemetry;
const requests=new Map(),waiting=new Map(),terminalTurns=new Map();
const nativeControls=attachNativeControls({directory,job,rpc,save,settle});
function settle(){
  if(!terminalTurns.has(job.turnId)||nativeControls.observing())return;
  const receipts=[...terminalTurns.values()];
  const outcome=receipts.findLast(turn=>turn.status!=='completed')||receipts.at(-1);
  const messages=job.messages.filter(item=>item.turnId===outcome.id);
  if(outcome.id!==job.turnId&&!job.observedTurns?.some(turn=>turn.turn_id===outcome.id)){
    job.observedTurns=[{turn_id:outcome.id,status:outcome.status},...(job.observedTurns||[]).slice(-19)];
  }
  job.final=messages.findLast(item=>item.phase==='final_answer')?.text||messages.at(-1)?.text||'';
  finish(outcome.status,outcome.error?.message,{source:'turn/completed',threadId:job.threadId,turnId:outcome.id,status:outcome.status});
}
function save(){job.updatedAt=new Date().toISOString();if(telemetry)job.telemetry=telemetry.snapshot();write(file,job);}
function send(message){if(!proc?.stdin.writable)throw Error('Native Codex connection is unavailable.');proc.stdin.write(JSON.stringify(message)+'\n');}
function rpc(method,params){return new Promise((resolve,reject)=>{const requestId=++sequence;requests.set(requestId,{resolve,reject});try{send({id:requestId,method,params});}catch(error){requests.delete(requestId);reject(error);}});}
function finish(status,error,nativeTerminal){
  if(closed)return;
  if(job.nativeTurnDispatchAttempted===true&&!nativeTerminal)status='unknown';
  if(status==='unknown'){
    if(job.cancellationState==='interrupt_requested')job.cancellationState='interrupt_delivery_unknown';
    job.status=status;if(error)job.error=error;save();
    if(proc?.pid&&alive(proc.pid))return;
  }
  if(closed)return;closed=true;clearInterval(timer);job.status=status;job.pending=[];
  if(nativeTerminal){job.nativeTerminal=nativeTerminal;if(job.cancellationState)job.cancellationState='terminal_observed';}
  else if(job.nativeTurnDispatchAttempted===false)job.nativeDeliveryAbsent={source:'worker-terminal-before-turn-start',generation:job.relayGeneration??null,status};
  if(error)job.error=error;
  if(telemetry){telemetry.finish();archiveRun(job,telemetry,status);}save();
  for(const request of requests.values())request.reject(Error('Native worker closed.'));requests.clear();
  proc?.stdin.end();
  // Cleanup is allowed only after exact native terminal evidence or a proven
  // failure before turn dispatch. Uncertain native delivery stays observable.
  if(proc?.pid&&alive(proc.pid)){
    if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(proc.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    else proc.kill();
  }
  setTimeout(()=>process.exit(status==='failed'?1:0),100).unref();
}
function serverRequest(message){
  const requestId=`${message.id}:${randomUUID()}`;
  const kind=['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(message.method)?'approval':message.method==='item/tool/requestUserInput'?'question':null;
  if(!kind){send({id:message.id,error:{code:-32601,message:'This interactive request is not supported by the bridge.'}});return;}
  waiting.set(requestId,message);telemetry?.requestOpened(requestId,kind);
  job.pending.push({id:requestId,kind,method:message.method,details:message.params});job.status='waiting_for_user';save();
}
function notification(message){
  const p=message.params||{};
  // Telemetry is observation only; native Codex owns agent scheduling.
  telemetry?.observe(message,job.threadId);
  if(message.method==='serverRequest/resolved')for(const [requestId,request] of waiting){
    if(String(request.id)!==String(p.requestId)||p.threadId&&request.params?.threadId!==p.threadId)continue;
    waiting.delete(requestId);telemetry?.requestClosed(requestId);job.pending=job.pending.filter(value=>value.id!==requestId);job.status=waiting.size?'waiting_for_user':'running';save();
  }
  if(p.threadId&&p.threadId!==job.threadId)return;
  if(message.method==='model/rerouted'){job.returnedModel=p.toModel||job.returnedModel;save();}
  nativeControls.event(message);
  if(message.method==='item/completed'&&p.item?.type==='agentMessage'){
    const item={id:p.item.id,phase:p.item.phase||null,text:p.item.text,turnId:p.turnId};
    if(!job.messages.some(existing=>existing.id===item.id))job.messages.push(item);
    if(item.phase==='final_answer')job.final=item.text;save();
  }
  if(message.method==='turn/completed'&&p.threadId===job.threadId&&job.nativeTurnDispatchAttempted&&['completed','failed','interrupted'].includes(p.turn?.status)){
    const {id,status,error}=p.turn;
    terminalTurns.set(id,{id,status,error});settle();
  }
  if(message.method==='error'&&!p.willRetry){job.error=p.error?.message||'Codex reported an error.';save();}
  if(message.method==='thread/tokenUsage/updated')save();
}
async function controls(){
  if(closed)process.exit(0);
  try{
    if(fs.existsSync(path.join(directory,'cancel.json'))&&!cancelling){
      cancelling=true;
      if(job.activeTurnId||job.turnId&&!terminalTurns.has(job.turnId)){
        const turnId=job.activeTurnId||job.turnId;
        job.cancellationState='interrupt_requested';delete job.controlError;save();
        try{
          await rpc('turn/interrupt',{threadId:job.threadId,turnId});
          if(closed)return;
          job.cancellationState='interrupt_acknowledged';save();
        }catch(error){
          if(closed)return;
          job.controlError=error.message;
          job.cancellationState=typeof error.code==='number'?'interrupt_rejected':'interrupt_delivery_unknown';save();
        }
        // Keep this delivery attempted after rejection or transport uncertainty.
        // Re-reading the same cancel marker must never resend an interrupt.
      }
      else if(job.nativeTurnDispatchAttempted===false){job.cancellationState='cancelled_before_dispatch';finish('interrupted','Cancelled by the user before native turn dispatch.');return;}
      else{if(job.cancellationState!=='waiting_for_native_turn'){job.cancellationState='waiting_for_native_turn';save();}cancelling=false;}
    }
    for(const [requestId,message] of waiting){
      const responseFile=path.join(directory,`response-${digest(requestId)}.json`);if(!fs.existsSync(responseFile))continue;
      const response=read(responseFile);
      const payload=message.method==='item/tool/requestUserInput'?{answers:Object.fromEntries(Object.entries(response.answers).map(([key,answers])=>[key,{answers}]))}:{decision:response.decision==='approve'?'accept':'decline'};
      send({id:message.id,result:payload});waiting.delete(requestId);telemetry?.requestClosed(requestId);job.pending=job.pending.filter(item=>item.id!==requestId);job.status=waiting.size?'waiting_for_user':'running';save();
    }
    if(!closed)await nativeControls.service();
  }catch(error){if(!closed){job.controlError=error.message;save();}}
}
try{
  // Task creation, not a resource reservation, owns delivery identity. Re-entering
  // a worker after an attempted native dispatch never replays that request.
  if(job.nativeTurnDispatchAttempted!==false)throw Error('Native dispatch was already attempted. Reconcile its exact turn; no automatic replay was started.');
  const settings=config(),target=project(job.project),selection=modelSelection(settings,{model:job.requestedModel,reasoningEffort:job.requestedReasoningEffort});
  if(target.path!==job.cwd)throw Error('The configured project path changed. Select the current project before new work.');
  job.requestedModel=selection.model;job.requestedReasoningEffort=selection.effort;
  job.workerPid=process.pid;job.status='running';job.browserContext={...browserContextPreflight(),checkedAt:new Date().toISOString()};telemetry=createTelemetry(job);save();
  proc=spawn(runtime(),[...(settings.codexArgs||[]),'app-server','--stdio'],{cwd:job.cwd,windowsHide:true,stdio:['pipe','pipe','pipe'],env:subscriptionEnvironment()});
  proc.on('error',error=>finish(job.nativeTurnDispatchAttempted?'unknown':'failed',error.message));
  proc.on('exit',(code,signal)=>{if(!closed)finish(job.nativeTurnDispatchAttempted?'unknown':'failed',`Native Codex exited without a terminal receipt (${code??signal}).`);});
  proc.stderr.resume();
  readline.createInterface({input:proc.stdout}).on('line',line=>{
    let message;try{message=JSON.parse(line);}catch{finish(job.nativeTurnDispatchAttempted?'unknown':'failed','Native Codex returned an invalid protocol message.');return;}
    if(message.method&&message.id!==undefined)serverRequest(message);
    else if(message.id!==undefined){const pending=requests.get(message.id);if(pending){requests.delete(message.id);message.error?pending.reject(Object.assign(Error(message.error.message),{code:message.error.code})):pending.resolve(message.result);}}
    else try{notification(message);}catch(error){finish(job.nativeTurnDispatchAttempted?'unknown':'failed',error.message);}
  });
  timer=setInterval(controls,500);
  await rpc('initialize',{clientInfo:{name:'local_codex_bridge',title:'Local Codex Bridge',version:VERSION},capabilities:{experimentalApi:true}});send({method:'initialized',params:{}});
  const account=await rpc('account/read',{refreshToken:false});if(account.account?.type!=='chatgpt')throw Error('ChatGPT subscription sign-in is required. API-key authentication is disabled.');
  await requireModel(rpc,selection);job.catalogVerifiedAt=new Date().toISOString();save();
  const permissions=executionPolicy(job.mode),policy=harnessPolicy(job,settings,selection);
  const instructions=workerInstructions(job)+' '+browserContextInstructions()+' '+policy.instructions;
  const options={cwd:job.cwd,model:selection.model,sandbox:permissions.sandbox,approvalPolicy:permissions.approvalPolicy,developerInstructions:instructions,config:{model_reasoning_effort:selection.effort,...policy.config,'plugins.local-codex@local-codex-bridge.enabled':false,'plugins.local-codex@created-by-me-remote.enabled':false}};
  const continuation=job.requestedThreadId||null;
  if(continuation){
    const {thread}=await rpc('thread/read',{threadId:continuation,includeTurns:false});
    if(typeof thread?.cwd!=='string'||fs.realpathSync.native(thread.cwd).toLowerCase()!==target.path.toLowerCase())throw Error('The selected native thread belongs to a different project path. No continuation was dispatched.');
    // Cold resume can itself execute existing native input. Do not load that
    // input under this request's possibly different scope or execution mode.
    const optionalControl=async(method,params)=>{
      try{return await rpc(method,params);}
      catch(error){if(error.code===-32601||error.code===-32600&&/goals feature is disabled|thread queue (storage is unavailable|disabled)/i.test(error.message))return null;throw error;}
    };
    const [goal,queue]=await Promise.all([
      optionalControl('thread/goal/get',{threadId:continuation}),
      optionalControl('thread/queue/list',{threadId:continuation,limit:1}),
    ]);
    if(goal?.goal?.status==='active'||queue?.data?.length){
      throw Error('Native resume could dispatch a saved active Goal or queued input before this request. Resolve that pending input on the same thread before sending a new turn.');
    }
  }
  const started=continuation?await rpc('thread/resume',{...options,threadId:continuation,excludeTurns:true}):await rpc('thread/start',{...options,serviceName:'local_codex_bridge'});
  job.returnedModel=started.model||null;job.returnedReasoningEffort=started.reasoningEffort||null;save();
  if(started.modelProvider!=='openai')throw Error('Only the signed-in ChatGPT provider is allowed.');verifyExecutionPolicy(started,permissions);verifyModel(started,selection);
  job.threadId=started.thread.id;job.nativeControls=true;job.model=started.model;job.reasoningEffort=started.reasoningEffort;job.sandbox=started.sandbox;job.approvalPolicy=started.approvalPolicy;
  if(continuation){
    const injected=await rpc('thread/inject_items',{threadId:job.threadId,items:[{type:'message',role:'developer',content:[{type:'input_text',text:instructions}]}]});
    if(!injected||typeof injected!=='object'||Array.isArray(injected))throw Error('Codex did not acknowledge current scope instructions. No turn was started.');
  }
  job.executionPolicy={version:2,mode:job.mode,sandboxType:started.sandbox.type,approvalPolicy:started.approvalPolicy,instructionRefresh:continuation?'history-injection':'thread-start',verifiedAt:new Date().toISOString()};save();
  if(!continuation&&job.title)await rpc('thread/name/set',{threadId:job.threadId,name:`[${target.name}] ${job.title}`.slice(0,120)});
  if(closed)process.exit(0);
  // Durable marker must precede the native write. A lost response stays unknown.
  job.nativeTurnDispatchAttempted=true;job.nativeDispatchAttemptedAt=new Date().toISOString();write(file,job,{durable:true});
  const turn=await rpc('turn/start',{threadId:job.threadId,model:selection.model,effort:selection.effort,input:[{type:'text',text:job.prompt}]});
  if(typeof turn?.turn?.id!=='string'||job.turnId&&job.turnId!==turn.turn.id)throw Error('Native turn identity is unresolved; preserve it for reconciliation.');
  job.turnId=turn.turn.id;
  if(!terminalTurns.has(job.turnId))job.activeTurnId??=job.turnId;
  save();settle();
}catch(error){finish(job.nativeTurnDispatchAttempted?'unknown':'failed',error.message);}
