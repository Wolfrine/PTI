import fs from 'node:fs';

const canonical=value=>fs.realpathSync.native(value).replaceAll('\\','/').replace(/\/$/,'').toLowerCase();
export function missingThread(error){
  return [-32600,-32602,-32000].includes(error.code)&&/no rollout found|thread.*(?:not found|does not exist|deleted)|(?:not found|missing).*thread/i.test(error.message);
}
async function archived(rpc,thread){
  // Native Thread has no archived flag. Compare IDs in exact-directory metadata;
  // never hydrate or copy historical messages.
  let cursor=null;const seen=new Set();
  do{
    const page=await rpc('thread/list',{cwd:thread.cwd,archived:true,useStateDbOnly:true,limit:100,cursor,sourceKinds:['cli','vscode','exec','appServer']});
    if(page.data.some(value=>value.id===thread.id))return true;
    cursor=page.nextCursor;
    if(cursor&&seen.has(cursor))throw Error('Native archived metadata pagination did not advance; refusing to guess.');
    if(cursor)seen.add(cursor);
  }while(cursor);
  return false;
}
export async function moduleParent(rpc,job,target){
  if(!job.threadId)return {threadId:null};
  let thread;
  try{({thread}=await rpc('thread/read',{threadId:job.threadId,includeTurns:false}));}
  catch(error){if(job.affinityFallback&&missingThread(error))return {threadId:null,reason:'missing'};throw error;}
  if(!job.chatRouting)return {threadId:job.threadId,thread};
  if(['active','inProgress','running','waitingForApproval','waitingForUserInput'].includes(thread.status?.type||thread.status))throw Error('The module parent is active. Wait or coordinate native subagents through its owning task.');
  let reason;
  if(thread.parentThreadId||thread.ephemeral||thread.modelProvider&&thread.modelProvider!=='openai')reason='incompatible';
  else{
    try{if(canonical(thread.cwd)!==canonical(target.path))reason='project-mismatch';}
    catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))reason='project-mismatch';else throw error;}
  }
  if(!reason&&await archived(rpc,thread))reason='archived';
  if(reason){
    if(!job.affinityFallback)throw Error(`Selected module source is ${reason}; explicitly rotate with a reason and handoff.`);
    return {threadId:null,reason};
  }
  return {threadId:job.threadId,thread};
}
