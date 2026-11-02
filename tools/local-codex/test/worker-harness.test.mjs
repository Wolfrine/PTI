import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
async function run({flags=[],strategy='team',prior,resume,mode='inspect',maxSubagentsPerTask=null,chatRouting,affinityFallback=false}={}){
  const home=prior?.home||resume?.home||path.join(root,'test-data','harness-'+randomUUID()),scratch=path.join(home,'scratch');fs.mkdirSync(scratch,{recursive:true});
  fs.writeFileSync(path.join(home,'config.json'),JSON.stringify({codexPath:process.execPath,codexArgs:[path.join(root,'test/fixture-runtime.mjs'),...flags],projects:{fixture:{path:scratch}},maxTaskMinutes:null,maxSubagentsPerTask}));
  const id=prior?.job.id||randomUUID().replaceAll('-',''),directory=path.join(home,'tasks',id);fs.mkdirSync(directory,{recursive:true});
  const job=prior?{...prior.job,prompt:'complete',status:'queued',final:null,error:null,history:[...prior.job.history,{key:randomUUID(),inputHash:'fixture'}]}:{id,project:'fixture',cwd:fs.realpathSync.native(scratch),mode,strategy,purpose:'acceptance',prompt:'complete',status:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),threadId:resume?.job.threadId||null,turnId:null,messages:[],pending:[],history:[]};
  if(chatRouting){job.chatRouting=chatRouting;job.affinityFallback=affinityFallback;}
  fs.writeFileSync(path.join(directory,'task.json'),JSON.stringify(job));
  const child=spawn(process.execPath,[path.join(root,'src/worker.mjs'),id],{cwd:home,env:{...process.env,LOCAL_CODEX_BRIDGE_HOME:home},windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill();reject(Error('Fixture worker timed out.'));},15000);child.on('exit',()=>{clearTimeout(timer);resolve();});child.on('error',error=>{clearTimeout(timer);reject(error);});});
  return {home,job:JSON.parse(fs.readFileSync(path.join(directory,'task.json'),'utf8'))};
}
test('worker tracks child telemetry without child answer contamination and preserves distinct continuation runs',{skip:process.platform!=='win32'},async()=>{
  const first=await run({flags:['--telemetry']});assert.equal(first.job.status,'completed');assert.equal(first.job.final,'fixture completed');assert(!JSON.stringify(first.job.messages).includes('PRIVATE_CHILD_ANSWER'));assert(!JSON.stringify(first.job.telemetry).includes('PRIVATE_'));assert.equal(first.job.telemetry.commands,1);assert.equal(first.job.telemetry.childrenSeen,1);assert.equal(first.job.telemetry.children[0].selectionVerified,true);assert.equal(first.job.telemetry.children[0].executionVerified,null);assert.equal(first.job.telemetry.usageCoverage,'partial-team');assert.equal(first.job.telemetry.generation,1);
  const second=await run({flags:['--telemetry'],prior:first});assert.equal(second.job.status,'completed');assert.equal(second.job.runs.length,2);assert.deepEqual(second.job.runs.map(r=>r.generation),[1,2]);assert.notEqual(second.job.runs[0].runId,second.job.runs[1].runId);assert(second.job.runs.every(r=>r.finishedAt&&r.durationMs>=0));
  const options=JSON.parse(fs.readFileSync(path.join(second.home,'scratch/fixture-options.json'),'utf8'));assert.equal(options.config['agents.default_subagent_model'],'gpt-6.1-sol');assert.equal(options.config['agents.default_subagent_reasoning_effort'],'xhigh');
});

test('edit uses verified Full Access and refreshes historical inspect instructions before inference',{skip:process.platform!=='win32'},async()=>{
  const inspected=await run({strategy:'single'});
  assert.equal(inspected.job.sandbox.type,'readOnly');assert.equal(inspected.job.approvalPolicy,'never');
  const edited=await run({resume:inspected,mode:'edit',strategy:'single'});
  assert.equal(edited.job.status,'completed');assert.equal(edited.job.threadId,inspected.job.threadId);assert.notEqual(edited.job.id,inspected.job.id);
  assert.equal(edited.job.sandbox.type,'dangerFullAccess');assert.equal(edited.job.approvalPolicy,'never');
  assert.equal(edited.job.executionPolicy.instructionRefresh,'history-injection');
  const injected=JSON.parse(fs.readFileSync(path.join(edited.home,'scratch/fixture-instructions.json'),'utf8'));
  assert.equal(injected.items[0].role,'developer');assert.match(injected.items[0].content[0].text,/Current bridge mode: edit/);
  assert(!injected.items[0].content[0].text.includes('Current bridge mode: inspect'));
  const inspectedAgain=await run({resume:edited,mode:'inspect',strategy:'single'});
  assert.equal(inspectedAgain.job.status,'completed');assert.equal(inspectedAgain.job.sandbox.type,'readOnly');
  const current=JSON.parse(fs.readFileSync(path.join(edited.home,'scratch/fixture-instructions.json'),'utf8'));
  assert.match(current.items[0].content[0].text,/Current bridge mode: inspect/);
});

test('module reuse starts distinct authorized tasks on the same parent and known missing/archive fallback rotates without history mutation',{skip:process.platform!=='win32'},async()=>{
  const route={affinity_id:'a'.repeat(64),module_key:'local-codex',selection:'affinity'};
  const first=await run({strategy:'single'});
  const second=await run({strategy:'single',resume:first,mode:'edit',chatRouting:route,affinityFallback:true});
  assert.equal(second.job.status,'completed');assert.notEqual(second.job.id,first.job.id);assert.equal(second.job.threadId,first.job.threadId);assert.equal(second.job.executionPolicy.mode,'edit');
  for(const flag of ['--missing-thread','--archived-thread']){
    const initial=await run({strategy:'single'});
    const replacement=await run({strategy:'single',resume:initial,chatRouting:route,affinityFallback:true,flags:[flag,'--rotate-thread-id']});
    assert.equal(replacement.job.status,'completed');assert.notEqual(replacement.job.threadId,initial.job.threadId);
    assert.equal(replacement.job.chatRouting.previous_thread_id,initial.job.threadId);assert.equal(replacement.job.chatRouting.reason,flag==='--missing-thread'?'missing':'archived');
  }
  const active=await run({strategy:'single',resume:first,chatRouting:route,affinityFallback:true,flags:['--active-thread']});
  assert.equal(active.job.status,'failed');assert.match(active.job.error,/unfinished turn/);assert.equal(active.job.threadId,first.job.threadId);
});

test('permission mismatches and unavailable instruction refresh fail before a model turn',{skip:process.platform!=='win32'},async()=>{
  for(const flag of ['--wrong-sandbox','--wrong-approval']){
    const refused=await run({flags:[flag],mode:'edit',strategy:'single'});
    assert.equal(refused.job.status,'failed');assert.match(refused.job.error,/unexpected (sandbox|approval policy)/);
    assert.equal(fs.existsSync(path.join(refused.home,'scratch/fixture-turn-options.json')),false);
  }
  const first=await run({strategy:'single'});
  fs.unlinkSync(path.join(first.home,'scratch/fixture-turn-options.json'));
  const refused=await run({flags:['--reject-injection'],resume:first,mode:'edit',strategy:'single'});
  assert.equal(refused.job.status,'failed');assert.match(refused.job.error,/rejects instruction injection/);
  assert.equal(fs.existsSync(path.join(refused.home,'scratch/fixture-turn-options.json')),false);
});
test('worker refuses model reroutes, lower-model children and subagents under single strategy',{skip:process.platform!=='win32'},async()=>{
  const rerouted=await run({flags:['--rerouted']});assert.equal(rerouted.job.status,'failed');assert.match(rerouted.job.error,/rerouted/);
  const mismatch=await run({flags:['--telemetry','--child-wrong-model']});assert.equal(mismatch.job.status,'failed');assert.match(mismatch.job.error,/different model/);
  const single=await run({flags:['--telemetry'],strategy:'single'});assert.equal(single.job.status,'failed');assert.match(single.job.error,/subagent limit/);
  const nested=await run({flags:['--telemetry','--nested-child']});assert.equal(nested.job.status,'completed');assert.equal(nested.job.telemetry.childrenSeen,2);
  const unknown=await run({flags:['--telemetry','--child-unknown']});assert.equal(unknown.job.status,'completed');assert.equal(unknown.job.telemetry.children[0].selectionVerified,false);assert.equal(unknown.job.telemetry.children[0].reasoningEffort,null);
  const resolved=await run({flags:['--resolved-question']});assert.equal(resolved.job.status,'completed');assert.equal(resolved.job.telemetry.questions,1);assert.equal(resolved.job.pending.length,0);
});

test('more than two children and descendants are observed without bridge rejection while model mismatches still fail',{skip:process.platform!=='win32'},async()=>{
  const many=await run({flags:['--telemetry','--many-children']});assert.equal(many.job.status,'completed');assert.equal(many.job.telemetry.childrenSeen,4);
  const bounded=await run({flags:['--telemetry','--many-children'],maxSubagentsPerTask:2});assert.equal(bounded.job.status,'failed');assert.match(bounded.job.error,/owner-selected subagent limit/);
  const bad=await run({flags:['--telemetry','--nested-child','--grandchild-wrong-model']});assert.equal(bad.job.status,'failed');assert.match(bad.job.error,/different model/);
});
