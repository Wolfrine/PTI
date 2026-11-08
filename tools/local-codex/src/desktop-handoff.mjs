import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {home,project,digest,read,write,config,runtime,subscriptionEnvironment} from './common.mjs';
import {acquireWorkspaceLock,canonicalResource} from './workspace-locks.mjs';
import {modelSelection,verifyModel} from './model-policy.mjs';

// Dispatch through Codex's public durable queue and desktop deep link. This
// process never resumes the chat, hosts its tools, or copies browser identity.
export async function desktopHandoff(rpc,args,assertStoredIdle) {
  if(process.platform!=='win32')throw Error('This installed desktop handoff is for Windows.');
  if(!/^[a-f0-9-]{36}$/.test(args.thread_id||'')||! /^[a-f0-9]{32}$/.test(args.request_id||'')||!args.prompt?.trim())throw Error('Desktop handoff requires an existing thread, prompt and durable request identity.');
  const target=project(args.project),receiptFile=path.join(home,'data',`desktop-${args.request_id}.json`);
  const marker=`[Local Codex desktop handoff ${args.request_id}]`;
  const inputHash=digest(JSON.stringify({thread:args.thread_id,project:target.key,prompt:args.prompt}));
  const prior=fs.existsSync(receiptFile)?read(receiptFile):null;
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
  const observed=await recent();
  const receipt=(state,extra={})=>({operation:'desktop-handoff',state,thread_id:thread.id,project:target.key,request_id:args.request_id,inputHash,createdAt:prior?.createdAt||Date.now(),model:thread.model,reasoning_effort:thread.reasoningEffort,...extra,
    notice:'This operation dispatches to the existing desktop-owned chat. Its native permissions and tool checks apply. Handoff completion is not work completion; read_codex_thread returns the actual turn outcome.'});
  // Another app-server cannot see the desktop's live in-memory turn status and
  // may label an unfinished persisted turn interrupted. Only claim completion
  // when the persisted turn is completed; the marker proves delivery/start.
  const observedStatus=turn=>turn.status==='completed'?'completed':'not-observed-live';
  if(observed){const result=receipt('started',{turn_id:observed.id,turn_status:observedStatus(observed)});write(receiptFile,result);return result;}
  if(prior?.state==='started')return prior;
  if(prior?.state==='not-started')return prior;
  const queued=(await rpc('thread/queue/list',{threadId:thread.id,limit:100})).data;
  const own=queued.find(item=>item.input?.some(part=>part.type==='text'&&part.text?.includes(marker)));
  if(prior&&!own)throw Error('Prior handoff delivery is uncertain; it was not submitted again. Inspect this existing chat and the saved receipt.');
  if(!own){
    await assertStoredIdle(rpc,thread);
    if(queued.length)throw Error('This chat already has queued input. Finish it before a new desktop handoff.');
    const selection=modelSelection(config());
    if(thread.modelProvider!=='openai')throw Error('The existing chat is not using the owner-approved Codex provider. No fallback was started.');
    verifyModel({model:thread.model,reasoningEffort:thread.reasoningEffort,modelProvider:thread.modelProvider},selection);
  }
  const release=acquireWorkspaceLock(home,{taskId:`desktop-${args.request_id}`,cwd:target.path,resourcePath:target.resourcePath,mode:'edit'});
  try {
    if(!own)await assertStoredIdle(rpc,(await rpc('thread/read',{threadId:thread.id,includeTurns:false})).thread);
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
      if(turn){const result=receipt('started',{queued_submission_id:queuedItem.id,turn_id:turn.id,turn_status:observedStatus(turn)});write(receiptFile,result);return result;}
      await new Promise(resolve=>setTimeout(resolve,500));
    }while(Date.now()<until);
    // Do not leave an unobserved request to execute unexpectedly at a later login.
    const pending=(await rpc('thread/queue/list',{threadId:thread.id,limit:100})).data;
    if(pending.some(item=>item.id===queuedItem.id))await rpc('thread/queue/delete',{threadId:thread.id,queuedSubmissionId:queuedItem.id});
    const turn=await recent();
    const result=turn?receipt('started',{queued_submission_id:queuedItem.id,turn_id:turn.id,turn_status:observedStatus(turn)}):receipt('not-started',{queued_submission_id:queuedItem.id,error:'Desktop did not start the queued input within the startup observation window. Any still-pending copy was removed; no work completion is claimed.'});
    write(receiptFile,result);return result;
  }finally{release();}
}
