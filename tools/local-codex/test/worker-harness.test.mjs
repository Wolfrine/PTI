import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
async function run({flags=[],strategy='team',prior}={}){
  const home=prior?.home||path.join(root,'test-data','harness-'+randomUUID()),scratch=path.join(home,'scratch');fs.mkdirSync(scratch,{recursive:true});
  fs.writeFileSync(path.join(home,'config.json'),JSON.stringify({codexPath:process.execPath,codexArgs:[path.join(root,'test/fixture-runtime.mjs'),...flags],projects:{fixture:{path:scratch}},maxTaskMinutes:1,maxSubagentsPerTask:2}));
  const id=prior?.job.id||randomUUID().replaceAll('-',''),directory=path.join(home,'tasks',id);fs.mkdirSync(directory,{recursive:true});
  const job=prior?{...prior.job,prompt:'complete',status:'queued',final:null,error:null,history:[...prior.job.history,{key:randomUUID(),inputHash:'fixture'}]}:{id,project:'fixture',cwd:fs.realpathSync.native(scratch),mode:'inspect',strategy,purpose:'acceptance',prompt:'complete',status:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),threadId:null,turnId:null,messages:[],pending:[],history:[]};
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
test('worker refuses model reroutes, lower-model children and subagents under single strategy',{skip:process.platform!=='win32'},async()=>{
  const rerouted=await run({flags:['--rerouted']});assert.equal(rerouted.job.status,'failed');assert.match(rerouted.job.error,/rerouted/);
  const mismatch=await run({flags:['--telemetry','--child-wrong-model']});assert.equal(mismatch.job.status,'failed');assert.match(mismatch.job.error,/different model/);
  const single=await run({flags:['--telemetry'],strategy:'single'});assert.equal(single.job.status,'failed');assert.match(single.job.error,/subagent bound/);
  const nested=await run({flags:['--telemetry','--nested-child']});assert.equal(nested.job.status,'failed');assert.match(nested.job.error,/Nested subagent/);
  const unknown=await run({flags:['--telemetry','--child-unknown']});assert.equal(unknown.job.status,'completed');assert.equal(unknown.job.telemetry.children[0].selectionVerified,false);assert.equal(unknown.job.telemetry.children[0].reasoningEffort,null);
  const resolved=await run({flags:['--resolved-question']});assert.equal(resolved.job.status,'completed');assert.equal(resolved.job.telemetry.questions,1);assert.equal(resolved.job.pending.length,0);
});
