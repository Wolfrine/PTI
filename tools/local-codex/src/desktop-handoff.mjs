import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {home,project,digest,read,write,config,runtime,subscriptionEnvironment} from './common.mjs';
import {acquireWorkspaceLock,canonicalResource} from './workspace-locks.mjs';
import {modelSelection,verifyModel} from './model-policy.mjs';
import {observeNativeTurn} from './native-observation.mjs';

export function reconcileHandoffReceipts(thread,turns){
  const root=path.join(home,'data'),observations=[];
  if(!fs.existsSync(root))return observations;
  for(const name of fs.readdirSync(root).filter(name=>/^desktop-[a-f0-9]{32}\.json$/.test(name))){
    const file=path.join(root,name),prior=read(file);
    if(prior.thread_id!==thread.id)continue;
    const marker=`[Local Codex desktop handoff ${prior.request_id}]\n`;
    const turn=turns.find(turn=>turn.id===prior.turn_id||(turn.items||[]).some(item=>item.type==='userMessage'&&(item.content||[]).some(part=>part.type==='text'&&part.text?.startsWith(marker))));
    if(!turn)continue;
    const observation=observeNativeTurn(thread,turn);
    const value={state:'started',turn_id:turn.id,turn_status:observation.status,work_state:observation.terminal_observed?observation.status:'running',observation};
    if(Object.entries(value).some(([key,value])=>JSON.stringify(prior[key])!==JSON.stringify(value))){
      const result={...prior,...value,observed_at:new Date().toISOString()};
      write(file,result);
      const cached=path.join(root,`history-${prior.request_id}.json`);
      if(fs.existsSync(cached)&&read(cached).operation==='desktop-handoff')write(cached,result);
    }
    observations.push({request_id:prior.request_id,turn_id:turn.id,turn_status:observation.status,terminal_observed:observation.terminal_observed});
  }
  return observations;
}

// Dispatch through Codex's public durable queue and desktop deep link. This
// process never resumes the chat, hosts its tools, or copies browser identity.
export async function desktopHandoff(rpc,args,assertBridgeIdle) {
  if(process.platform!=='win32')throw Error('This installed desktop handoff is for Windows.');
  if(!/^[a-f0-9-]{36}$/.test(args.thread_id||'')||! /^[a-f0-9]{32}$/.test(args.request_id||'')||!args.prompt?.trim())throw Error('Desktop handoff requires an existing thread, prompt and durable request identity.');
  const target=project(args.project),receiptFile=path.join(home,'data',`desktop-${args.request_id}.json`);
  const marker=`[Local Codex desktop handoff ${args.request_id}]`;
  const inputHash=digest(JSON.stringify({thread:args.thread_id,project:target.key,prompt:args.prompt}));
  const prior=fs.existsSync(receiptFile)?read(receiptFile):null;
  const createdAt=prior?.createdAt||Date.now();
  if(prior&&prior.inputHash!==inputHash)throw Error('Desktop handoff identity already belongs to different inputs.');
  const {thread}=await rpc('thread/read',{threadId:args.thread_id,includeTurns:false});
  if(canonicalResource(thread.cwd)!==canonicalResource(target.path))throw Error('The existing chat directory differs from the selected project. Select its exact catalog project; no chat was moved or created.');
  const recent=async()=>{
    let cursor=null;
    do {
      const page=await rpc('thread/turns/list',{threadId:thread.id,limit:20,cursor,sortDirection:'desc',itemsView:'full'});
      const match=page.data.find(turn=>(turn.items||[]).some(item=>item.type==='userMessage'&&(item.content||[]).some(part=>part.type==='text'&&part.text?.startsWith(marker+'\n'))));
      if(match)return match;
      if(!prior||!page.data.length||page.data.some(turn=>(turn.startedAt||0)*1000<prior.createdAt-1000))return null;
      cursor=page.nextCursor;
    }while(cursor);
    return null;
  };
  const receipt=(state,extra={})=>({operation:'desktop-handoff',state,thread_id:thread.id,project:target.key,request_id:args.request_id,inputHash,createdAt,model:thread.model,reasoning_effort:thread.reasoningEffort,...extra,
    notice:'The existing app owns native execution and permissions. get_task tracks this handoff through a confirmed native terminal event. Unknown exported status does not establish idle or release a writer. An unavailable native stop leaves observation active.'});
  const record=value=>{
    while(JSON.stringify(value).length>23000){
      if(value.final){value.final=value.final.slice(0,Math.max(0,value.final.length-1000));value.final_truncated=true;continue;}
      const message=value.messages?.slice().reverse().find(item=>item.text);
      if(!message)break;
      message.text=message.text.slice(0,Math.max(0,message.text.length-1000));value.messages_truncated=true;
    }
    const {observed_at:oldAt,...before}=prior||{};
    const {observed_at:ignored,...next}=value;
    if(JSON.stringify(before)===JSON.stringify(next))return prior;
    const result={...next,observed_at:new Date().toISOString()};
    write(receiptFile,result);return result;
  };
  const observedReceipt=(turn,queueId=prior?.queued_submission_id)=>{
    const observation=observeNativeTurn(thread,turn);
    const messages=(turn.items||[]).filter(item=>item.type==='agentMessage');
    const final=observation.terminal_observed&&observation.status==='completed'
      ?messages.filter(item=>item.phase==='final_answer').at(-1)||messages.at(-1):null;
    return record(receipt('started',{
      ...(queueId?{queued_submission_id:queueId}:{}),
      turn_id:turn.id,turn_status:observation.status,observation,
      work_state:observation.terminal_observed?observation.status:'running',
      messages:messages.slice(-2).map(item=>({phase:item.phase||null,text:(item.text||'').slice(0,1800)})),
      ...(final?{final:(final.text||'').slice(0,12000),final_truncated:(final.text||'').length>12000}:{}),
      ...(args.cancel&&!observation.terminal_observed?{stop:{state:'unavailable',reason:'This reader does not own the desktop turn. The native daemon control route must be available to stop it; observation continues until a terminal event.'}}:{}),
    }));
  };
  const observed=await recent();
  if(observed)return observedReceipt(observed);
  const queued=(await rpc('thread/queue/list',{threadId:thread.id,limit:100})).data;
  const own=queued.find(item=>item.input?.some(part=>part.type==='text'&&part.text?.includes(marker)));
  if(args.cancel){
    if(prior?.state==='cancelled')return prior;
    if(own){
      try{await rpc('thread/queue/delete',{threadId:thread.id,queuedSubmissionId:own.id});}
      catch{return record({...prior,work_state:'unknown',stop:{state:'unavailable',reason:'The pending queue entry could not be removed. It may have been consumed; observation continues without resubmission.'}});}
      const consumed=await recent();
      if(consumed)return observedReceipt(consumed);
    }
    if(own||!prior)return record(receipt('cancelled',{work_state:'interrupted',stop:{state:'queued-input-removed',native_turn_interrupted:false},...(own?{queued_submission_id:own.id}:{})}));
    return record({...prior,work_state:'unknown',stop:{state:'unavailable',reason:'Delivery may already have been consumed. Preserve this request and reconcile its marker; no native stop was confirmed.'}});
  }
  if(prior&&!own){
    if(prior.state==='not-started'||prior.state==='cancelled')return prior;
    return record({...prior,work_state:'unknown',delivery_observation:'Queue entry absent; native marker not yet exported. The same input will not be submitted again.'});
  }
  // Once submitted, a normal queue entry waits behind the owning writer. Do
  // not reopen the app or spend another startup window on every observation.
  if(own)return record(receipt('queued',{queued_submission_id:own.id,work_state:'queued'}));
  if(!own){
    assertBridgeIdle(thread);
    const selection=modelSelection(config());
    if(thread.modelProvider!=='openai')throw Error('The existing chat is not using the owner-approved Codex provider. No fallback was started.');
    verifyModel({model:thread.model,reasoningEffort:thread.reasoningEffort,modelProvider:thread.modelProvider},selection);
  }
  const release=acquireWorkspaceLock(home,{taskId:`desktop-${args.request_id}`,cwd:target.path,resourcePath:target.resourcePath,mode:'edit'});
  try {
    if(!own)assertBridgeIdle((await rpc('thread/read',{threadId:thread.id,includeTurns:false})).thread);
    const opened=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',`Start-Process -FilePath 'codex://threads/${thread.id}' -WindowStyle Hidden`],{windowsHide:true,encoding:'utf8',timeout:10000});
    if(opened.status!==0)throw Error('The registered Codex desktop link could not open the existing chat. Nothing new was queued.');
    let queuedItem=own;
    if(!queuedItem){
      write(receiptFile,receipt('preparing'));
      const prompt=`${marker}\nThe owner requested this work through Local Codex. Continue this same chat with its existing model, permissions and official tools. Do not create another chat or treat prior bridge preflight as a desktop restriction. Actual tool denials remain binding.\n\n${args.prompt}`;
      // Use the documented CLI queue writer; no private app transport or
      // experimental queue-start behavior is required.
      const queuedCommand=spawnSync(runtime(),['queue','--thread',thread.id,'--message',prompt],{cwd:target.path,windowsHide:true,encoding:'utf8',timeout:10000,env:subscriptionEnvironment()});
      const queueId=queuedCommand.stdout?.match(/Queued message ([a-f0-9-]{36}) for thread/);
      if(queuedCommand.status!==0||!queueId)throw Error('Codex queue did not return a delivery receipt. The durable intent is retained; do not duplicate this request.');
      queuedItem={id:queueId[1]};
      write(receiptFile,receipt('queued',{queued_submission_id:queuedItem.id}));
    }
    // Bounded startup observation only. Native work has no added duration cap.
    const until=Date.now()+12000;
    do {
      const turn=await recent();
      if(turn)return observedReceipt(turn,queuedItem.id);
      await new Promise(resolve=>setTimeout(resolve,500));
    }while(Date.now()<until);
    // The owner's durable queue input waits behind the owning native turn.
    // Startup observation bounds this call, not the authorized queued work.
    return record(receipt('queued',{queued_submission_id:queuedItem.id,work_state:'queued'}));
  }finally{release();}
}
