import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

// Uses verify-live.mjs's temporary owner OAuth grant; no credential is retained.
export async function verifyThreads(call,until,target,active,checks){
  const nonce=randomUUID(),label=`Bridge history acceptance ${nonce.slice(0,8)}`,filename=`history-probe-${nonce}.txt`,marker=`HISTORY_${nonce}`;
  fs.writeFileSync(path.join(target.path,filename),marker);
  const args={project:'scratch',mode:'inspect',title:label,work_key:`accept-history-${nonce}`,request_key:`accept-start-${nonce}`,
    prompt:`Read only ${filename} in the current scratch directory and return its exact contents. Do not change files or read other files.`};
  const first=await call('start_task',args);active.add(first.id);
  assert.equal((await call('start_task',args)).id,first.id);
  const initial=await until(first.id,['completed']);active.delete(first.id);assert(initial.final.includes(marker));assert(initial.thread_id);
  const reused=await call('start_task',{...args,prompt:'Follow up on the same outcome.',request_key:`accept-reuse-${nonce}`});
  assert.equal(reused.id,first.id);assert.equal(reused.reused,true);assert.equal(reused.followup_required,true);assert.equal(reused.generation,1);
  const found=await call('list_tasks',{project:'scratch',query:args.work_key});assert.equal(found.tasks.filter(t=>t.id===first.id).length,1);
  checks.push('stable work key and recent-task lookup recover one real task without submitting a duplicate turn');
  await call('continue_task',{task_id:first.id,prompt:'Without reading files or calling any tools, repeat the marker from your preceding answer.',request_key:`accept-follow-${nonce}`});active.add(first.id);
  const follow=await until(first.id,['completed']);active.delete(first.id);assert(follow.final.includes(marker));assert.equal(follow.thread_id,initial.thread_id);
  checks.push('real continuation keeps the exact Codex thread and its model context');
  const operation=async(name,args)=>{const j=await call(name,{...args,request_key:`${name}-${randomUUID()}`});const done=await until(j.id,['completed']);assert(done.result);return done.result;};
  const listed=await operation('list_codex_threads',{query:label,limit:5});assert(listed.threads.some(t=>t.thread_id===initial.thread_id&&t.project_keys.includes('scratch')));
  const read=await operation('read_codex_thread',{thread_id:initial.thread_id,limit:5});assert(JSON.stringify(read.turns).includes(marker));
  assert(read.turns.every(t=>t.messages.every(m=>['user','assistant'].includes(m.role))));
  checks.push('deployed non-model history lookup/read return saved chat messages and the project directory');
  const imported=await call('resume_codex_thread',{project:'scratch',mode:'inspect',thread_id:initial.thread_id,title:label,work_key:`accept-import-${nonce}`,request_key:`accept-import-${nonce}`,
    prompt:'Without reading files or calling tools, repeat the marker present earlier in this Codex conversation. No changes are authorized.'});active.add(imported.id);
  const resumed=await until(imported.id,['completed']);active.delete(imported.id);assert.equal(resumed.thread_id,initial.thread_id);assert(resumed.final.includes(marker));
  checks.push('native thread ID resumption retains the transcript in a fresh authorization/task record');
  const renamed=`Verified bridge history ${nonce.slice(0,8)}`;
  await operation('organize_codex_thread',{thread_id:initial.thread_id,action:'rename',title:renamed});
  assert((await operation('list_codex_threads',{query:renamed})).threads.some(t=>t.thread_id===initial.thread_id));
  await operation('organize_codex_thread',{thread_id:initial.thread_id,action:'archive'});
  assert((await operation('list_codex_threads',{query:renamed,archived:true})).threads.some(t=>t.thread_id===initial.thread_id));
  await operation('organize_codex_thread',{thread_id:initial.thread_id,action:'unarchive'});
  assert((await operation('list_codex_threads',{query:renamed})).threads.some(t=>t.thread_id===initial.thread_id));
  // Archive only this new disposable acceptance chat; retain its transcript.
  await operation('organize_codex_thread',{thread_id:initial.thread_id,action:'archive'});
  checks.push('real rename/readback, archive and restoration verified for the new disposable chat only');
  return {taskId:first.id,resumeTaskId:imported.id,threadId:initial.thread_id,markerHash:createHash('sha256').update(marker).digest('hex'),scratchFile:filename,testThreadArchived:true};
}
