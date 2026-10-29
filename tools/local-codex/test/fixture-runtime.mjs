import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
const lines = readline.createInterface({ input: process.stdin });
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
let cwd, sandbox, prompt, turn = 0;
function complete(text = 'fixture completed') {
  send({ method: 'item/completed', params: { threadId: 'fixture-thread', turnId: `fixture-turn-${turn}`, item: { id: `answer-${turn}`, type: 'agentMessage', phase: 'final_answer', text } } });
  send({ method: 'turn/completed', params: { threadId: 'fixture-thread', turn: { id: `fixture-turn-${turn}`, status: 'completed' } } });
}
lines.on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') send({ id: m.id, result: { userAgent: 'fixture' } });
  if (m.method === 'account/read') send({ id:m.id,result:{account:{type:process.argv.includes('--api-key')?'apiKey':'chatgpt'}} });
  if (m.method === 'thread/start' || m.method === 'thread/resume') {
    cwd = m.params.cwd;
    sandbox = m.params.sandbox === 'read-only' ? 'readOnly' : 'workspaceWrite';
    fs.writeFileSync(path.join(cwd, 'fixture-options.json'), JSON.stringify(m.params));
    send({ id: m.id, result: { thread: { id: 'fixture-thread' }, model: 'fixture-model', modelProvider:'openai', sandbox: { type: sandbox } } });
  }
  if (m.method === 'turn/start') {
    prompt = m.params.input[0].text;
    turn++;
    send({ id: m.id, result: { turn: { id: `fixture-turn-${turn}`, status: 'inProgress' } } });
    send({ method: 'turn/started', params: { threadId: 'fixture-thread', turn: { id: `fixture-turn-${turn}` } } });
    if (prompt.includes('approval')) send({ id: 99, method: 'item/commandExecution/requestApproval', params: { threadId: 'fixture-thread', turnId: `fixture-turn-${turn}`, command: 'fixture harmless action', reason: 'fixture approval' } });
    else if (prompt.includes('question')) send({ id: 99, method: 'item/tool/requestUserInput', params: { threadId: 'fixture-thread', turnId: `fixture-turn-${turn}`, questions: [{ id: 'choice', question: 'Which fixture?', options: [] }] } });
    else if (!prompt.includes('wait')) complete();
  }
  if (m.id === 99 && m.result) complete(JSON.stringify(m.result));
  if (m.method === 'turn/interrupt') {
    send({ id: m.id, result: {} });
    send({ method: 'turn/completed', params: { threadId: 'fixture-thread', turn: { id: `fixture-turn-${turn}`, status: 'interrupted' } } });
  }
});
