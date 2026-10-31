import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const testHome = path.join(root, 'test-data');
fs.mkdirSync(path.join(testHome, 'scratch'), { recursive: true });
fs.writeFileSync(path.join(testHome, 'config.json'), JSON.stringify({ codexPath: process.execPath,
  codexArgs: [path.join(root, 'test/fixture-runtime.mjs')], maxTaskMinutes: 2,
  projects: { fixture: { path: path.join(testHome, 'scratch') }, forbidden: { path: 'C:/Windows' } } }));
const env = { ...process.env, LOCAL_CODEX_BRIDGE_HOME: testHome };
async function connect() {
  const client = new Client({ name: 'bridge-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'dist/server.mjs')], env, stderr: 'pipe' }));
  return client;
}
async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) return { error: result.content[0].text };
  return result.structuredContent;
}
async function until(client, id, states) {
  const timeout = Date.now() + 15000;
  while (Date.now() < timeout) {
    const job = await call(client, 'get_task', { task_id: id, wait_seconds: 1 });
    if (states.includes(job.status)) {
      if(['completed','failed','interrupted'].includes(job.status)&&Number.isInteger(job.workerPid)){
        const exiting=Date.now()+5000;
        while(Date.now()<exiting){try{process.kill(job.workerPid,0);}catch{return job;}await new Promise(resolve=>setTimeout(resolve,25));}
        throw Error('The terminal fixture worker did not release its process.');
      }
      return job;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Task timed out.');
}
const checks = [];
const client = await connect();
let second;
try {
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 8); checks.push('eight internal worker tools discovered through MCP');
  const projects = await call(client, 'list_projects');
  assert.equal(projects.projects.find(p => p.key === 'forbidden').available, false);
  assert.match((await call(client, 'start_task', { project: 'forbidden', prompt: 'inspect', request_key: 'forbidden-test' })).error, /F:/);
  checks.push('C-drive targets rejected after path resolution');
  const nonce = Date.now();
  const args = { project: 'fixture', prompt: 'complete', request_key: `complete-${nonce}`,work_key:`fixture-outcome-${nonce}`,title:'Fixture outcome',relay_generation:3 };
  const started = await call(client, 'start_task', args);
  const retry = await call(client, 'start_task', args);
  assert.equal(started.id, retry.id);
  assert.match((await call(client, 'start_task', { ...args, prompt: 'different' })).error, /different request/);
  const done = await until(client, started.id, ['completed']);
  assert.equal(done.final, 'fixture completed');
  assert.equal(done.telemetry.generation,3);
  const reused=await call(client,'start_task',{...args,prompt:'follow up without duplication',request_key:`reused-${nonce}`});
  assert.equal(reused.id,done.id);assert.equal(reused.reused,true);assert.equal(reused.followup_required,true);assert.equal(reused.prompt,'complete');
  checks.push('work key reuse returns the original task without silently submitting a follow-up');
  const options = JSON.parse(fs.readFileSync(path.join(testHome, 'scratch/fixture-options.json'), 'utf8'));
  assert.equal(options.sandbox, 'read-only'); assert.equal(options.approvalPolicy, 'never');
  assert.equal(options.model,'gpt-6.1-sol'); assert.equal(options.config.model_reasoning_effort,'xhigh');
  assert.equal(done.model,'gpt-6.1-sol'); assert.equal(done.reasoningEffort,'xhigh');
  const turnOptions=JSON.parse(fs.readFileSync(path.join(testHome,'scratch/fixture-turn-options.json'),'utf8'));
  assert.equal(turnOptions.model,'gpt-6.1-sol');assert.equal(turnOptions.effort,'xhigh');
  checks.push('new threads and turns explicitly use owner-selected model and effort');
  checks.push('inspection mode, result retrieval and duplicate-request protection');
  let continued;
  const continueDeadline=Date.now()+8000;
  do{
    continued=await call(client,'continue_task',{task_id:done.id,prompt:'approval',request_key:`continue-${nonce}`,relay_generation:4});
    if(!continued.error)break;
    assert.equal(continued.error,'The previous worker is still exiting; retry shortly.');
    await new Promise(resolve=>setTimeout(resolve,150));
  }while(Date.now()<continueDeadline);
  assert.equal(continued.threadId, '01900000-0000-7000-8000-000000000001');
  const pending = await until(client, done.id, ['waiting_for_user']);
  assert.equal(pending.pending.length, 1);
  assert.equal((await call(client, 'respond_to_task', { task_id: done.id, request_id: 'unknown', decision: 'approve' })).error, 'No matching active request. Retrieve the task first.');
  await call(client, 'respond_to_task', { task_id: done.id, request_id: pending.pending[0].id, decision: 'decline' });
  const declined = await until(client, done.id, ['completed']);
  assert.equal(declined.final, '{"decision":"decline"}');
  assert.equal(declined.telemetry.generation,4);
  const resumedOptions=JSON.parse(fs.readFileSync(path.join(testHome,'scratch/fixture-options.json'),'utf8'));
  assert.equal(resumedOptions.model,'gpt-6.1-sol');assert.equal(resumedOptions.config.model_reasoning_effort,'xhigh');
  assert.equal(JSON.parse(fs.readFileSync(path.join(testHome,'scratch/fixture-turn-options.json'),'utf8')).effort,'xhigh');
  checks.push('continuation, human approval forwarding and stale-request rejection');
  const waiting = await call(client, 'start_task', { project: 'fixture', prompt: 'wait', request_key: `wait-${nonce}` });
  await until(client, waiting.id, ['running']);
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.match((await call(client,'codex_history',{action:'rename',args:{thread_id:'01900000-0000-7000-8000-000000000001',title:'Do not interrupt active work'}})).error,/active bridge task/);
  checks.push('history management refuses an active bridge thread');
  await client.close();
  second = await connect();
  assert.equal((await call(second, 'get_task', { task_id: waiting.id })).id, waiting.id);
  await call(second, 'cancel_task', { task_id: waiting.id });
  await until(second, waiting.id, ['interrupted']);
  checks.push('worker survives MCP client reconnect; cancellation terminates task');
  const question = await call(second, 'start_task', { project: 'fixture', prompt: 'question', request_key: `question-${nonce}` });
  const asked = await until(second, question.id, ['waiting_for_user']);
  assert.match((await call(second, 'respond_to_task', { task_id: question.id, request_id: asked.pending[0].id, answers: {} })).error, /every displayed/);
  await call(second, 'respond_to_task', { task_id: question.id, request_id: asked.pending[0].id, answers: { choice: ['first'] } });
  assert.equal((await until(second, question.id, ['completed'])).final, '{"answers":{"choice":{"answers":["first"]}}}');
  checks.push('human questions and complete answer validation');
  const edit = await call(second, 'start_task', { project: 'fixture', mode: 'edit', prompt: 'wait', request_key: `edit-${nonce}` });
  await until(second, edit.id, ['running']);
  await new Promise(resolve => setTimeout(resolve, 300));
  const competing = await call(second, 'start_task', { project: 'fixture', mode: 'edit', prompt: 'complete', request_key: `edit-compete-${nonce}` });
  assert.match((await until(second, competing.id, ['failed'])).error, /conflicting task/);
  await call(second, 'cancel_task', { task_id: edit.id }); await until(second, edit.id, ['interrupted']);
  checks.push('two simultaneous edit tasks cannot own the same project');
  const configFile=path.join(testHome,'config.json'),configuration=JSON.parse(fs.readFileSync(configFile,'utf8'));
  fs.writeFileSync(configFile,JSON.stringify({...configuration,codexArgs:[...configuration.codexArgs,'--api-key']}));
  try{const apiTask=await call(second,'start_task',{project:'fixture',prompt:'complete',request_key:`api-auth-${nonce}`});assert.match((await until(second,apiTask.id,['failed'])).error,/ChatGPT subscription sign-in is required/);checks.push('API-authenticated runtime refused before a model turn');}
  finally{fs.writeFileSync(configFile,JSON.stringify(configuration));}
  for(const flag of ['--missing-model','--wrong-model']){
    const turnFile=path.join(testHome,'scratch/fixture-turn-options.json');fs.rmSync(turnFile,{force:true});
    fs.writeFileSync(configFile,JSON.stringify({...configuration,codexArgs:[...configuration.codexArgs,flag]}));
    try{const refused=await call(second,'start_task',{project:'fixture',prompt:'complete',request_key:`model-${flag}-${nonce}`});assert.match((await until(second,refused.id,['failed'])).error,/Ask the owner.*no fallback/);assert.equal(fs.existsSync(turnFile),false);}
    finally{fs.writeFileSync(configFile,JSON.stringify(configuration));}
  }
  checks.push('missing preferred model and runtime model substitution cannot start inference');
  const listed=await call(second,'codex_history',{action:'list',args:{project:'fixture'}});
  assert.equal(listed.threads[0].thread_id,'01900000-0000-7000-8000-000000000001');
  const historical=await call(second,'codex_history',{action:'read',args:{thread_id:listed.threads[0].thread_id}});
  assert.equal(historical.turns[0].messages[0].text,'Old user prompt');assert.equal(historical.truncated,true);
  assert.equal(historical.next_cursor,'fixture-next');assert(!JSON.stringify(historical).includes('PRIVATE TOOL OUTPUT'));
  await call(second,'codex_history',{action:'rename',args:{thread_id:listed.threads[0].thread_id,title:'Readable history title'}});
  assert.equal((await call(second,'codex_history',{action:'list',args:{}})).threads[0].title,'Readable history title');
  await call(second,'codex_history',{action:'archive',args:{thread_id:listed.threads[0].thread_id}});
  assert.equal((await call(second,'codex_history',{action:'list',args:{}})).threads.length,0);
  await call(second,'codex_history',{action:'unarchive',args:{thread_id:listed.threads[0].thread_id}});
  assert.equal((await call(second,'codex_history',{action:'list',args:{}})).threads.length,1);
  checks.push('non-model paginated history excludes tool output; rename and reversible archive verified');
  const imported=await call(second,'start_task',{project:'fixture',thread_id:listed.threads[0].thread_id,prompt:'complete',request_key:`import-${nonce}`});
  const importedDone=await until(second,imported.id,['completed']);assert.equal(importedDone.threadId,listed.threads[0].thread_id);
  checks.push('an older selected thread resumes in the selected project and inspect sandbox');
  fs.writeFileSync(path.join(testHome, 'fixture-verification.json'), JSON.stringify({ testedAt: new Date().toISOString(), fixture: true, checks }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { await client.close(); await second?.close(); }
