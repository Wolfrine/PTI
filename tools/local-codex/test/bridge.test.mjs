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
    if (states.includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Task timed out.');
}
const checks = [];
const client = await connect();
let second;
try {
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 7); checks.push('seven tools discovered through MCP');
  const projects = await call(client, 'list_projects');
  assert.equal(projects.projects.find(p => p.key === 'forbidden').available, false);
  assert.match((await call(client, 'start_task', { project: 'forbidden', prompt: 'inspect', request_key: 'forbidden-test' })).error, /F:/);
  checks.push('C-drive targets rejected after path resolution');
  const nonce = Date.now();
  const args = { project: 'fixture', prompt: 'complete', request_key: `complete-${nonce}` };
  const started = await call(client, 'start_task', args);
  const retry = await call(client, 'start_task', args);
  assert.equal(started.id, retry.id);
  assert.match((await call(client, 'start_task', { ...args, prompt: 'different' })).error, /different request/);
  const done = await until(client, started.id, ['completed']);
  assert.equal(done.final, 'fixture completed');
  const options = JSON.parse(fs.readFileSync(path.join(testHome, 'scratch/fixture-options.json'), 'utf8'));
  assert.equal(options.sandbox, 'read-only'); assert.equal(options.approvalPolicy, 'never');
  checks.push('inspection mode, result retrieval and duplicate-request protection');
  await new Promise(resolve => setTimeout(resolve, 400));
  const continued = await call(client, 'continue_task', { task_id: done.id, prompt: 'approval', request_key: `continue-${nonce}` });
  assert.equal(continued.threadId, 'fixture-thread');
  const pending = await until(client, done.id, ['waiting_for_user']);
  assert.equal(pending.pending.length, 1);
  assert.equal((await call(client, 'respond_to_task', { task_id: done.id, request_id: 'unknown', decision: 'approve' })).error, 'No matching active request. Retrieve the task first.');
  await call(client, 'respond_to_task', { task_id: done.id, request_id: pending.pending[0].id, decision: 'decline' });
  const declined = await until(client, done.id, ['completed']);
  assert.equal(declined.final, '{"decision":"decline"}');
  checks.push('continuation, human approval forwarding and stale-request rejection');
  const waiting = await call(client, 'start_task', { project: 'fixture', prompt: 'wait', request_key: `wait-${nonce}` });
  await until(client, waiting.id, ['running']);
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
  assert.match((await until(second, competing.id, ['failed'])).error, /EEXIST/);
  await call(second, 'cancel_task', { task_id: edit.id }); await until(second, edit.id, ['interrupted']);
  checks.push('two simultaneous edit tasks cannot own the same project');
  const configFile=path.join(testHome,'config.json'),configuration=JSON.parse(fs.readFileSync(configFile,'utf8'));
  fs.writeFileSync(configFile,JSON.stringify({...configuration,codexArgs:[...configuration.codexArgs,'--api-key']}));
  try{const apiTask=await call(second,'start_task',{project:'fixture',prompt:'complete',request_key:`api-auth-${nonce}`});assert.match((await until(second,apiTask.id,['failed'])).error,/ChatGPT subscription sign-in is required/);checks.push('API-authenticated runtime refused before a model turn');}
  finally{fs.writeFileSync(configFile,JSON.stringify(configuration));}
  fs.writeFileSync(path.join(testHome, 'fixture-verification.json'), JSON.stringify({ testedAt: new Date().toISOString(), fixture: true, checks }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { await client.close(); await second?.close(); }
