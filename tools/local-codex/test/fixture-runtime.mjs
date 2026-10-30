import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
const lines = readline.createInterface({ input: process.stdin });
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
let cwd, sandbox, prompt, turn = 0;
const threadId='01900000-0000-7000-8000-000000000001';
const fixtureHome=process.env.LOCAL_CODEX_BRIDGE_HOME;
const historyFile=path.join(fixtureHome,'fixture-history.json');
const state=()=>fs.existsSync(historyFile)?JSON.parse(fs.readFileSync(historyFile,'utf8')):{name:'Fixture history',archived:false};
const fixtureCwd=JSON.parse(fs.readFileSync(path.join(fixtureHome,'config.json'),'utf8')).projects.fixture.path;
const fixtureThread=()=>({id:threadId,name:state().name,preview:'Fixture initial prompt',cwd:fixtureCwd,status:{type:'notLoaded'},createdAt:1,updatedAt:2});
function complete(text = 'fixture completed') {
  send({ method: 'item/completed', params: { threadId, turnId: `fixture-turn-${turn}`, item: { id: `answer-${turn}`, type: 'agentMessage', phase: 'final_answer', text } } });
  send({ method: 'turn/completed', params: { threadId, turn: { id: `fixture-turn-${turn}`, status: 'completed' } } });
}
lines.on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') send({ id: m.id, result: { userAgent: 'fixture' } });
  if (m.method === 'account/read') send({ id:m.id,result:{account:{type:process.argv.includes('--api-key')?'apiKey':'chatgpt'}} });
  if(m.method==='thread/read')send({id:m.id,result:{thread:fixtureThread()}});
  if(m.method==='thread/list')send({id:m.id,result:{data:state().archived===!!m.params.archived?[fixtureThread()]:[],nextCursor:null}});
  if(m.method==='thread/turns/list')send({id:m.id,result:{data:[{id:'turn-old',status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'Old user prompt'}]},{type:'commandExecution',command:'PRIVATE TOOL OUTPUT'},{type:'agentMessage',text:'x'.repeat(6000)}]}],nextCursor:'fixture-next'}});
  if(m.method==='thread/name/set'){fs.writeFileSync(historyFile,JSON.stringify({...state(),name:m.params.name}));send({id:m.id,result:{}});}
  if(m.method==='thread/archive'||m.method==='thread/unarchive'){fs.writeFileSync(historyFile,JSON.stringify({...state(),archived:m.method==='thread/archive'}));send({id:m.id,result:{}});}
  if (m.method === 'thread/start' || m.method === 'thread/resume') {
    cwd = m.params.cwd;
    sandbox = m.params.sandbox === 'read-only' ? 'readOnly' : 'workspaceWrite';
    fs.writeFileSync(path.join(cwd, 'fixture-options.json'), JSON.stringify(m.params));
    send({ id: m.id, result: { thread: { id:threadId }, model: 'fixture-model', modelProvider:'openai', sandbox: { type: sandbox } } });
  }
  if (m.method === 'turn/start') {
    prompt = m.params.input[0].text;
    turn++;
    send({ id: m.id, result: { turn: { id: `fixture-turn-${turn}`, status: 'inProgress' } } });
    send({ method: 'turn/started', params: { threadId, turn: { id: `fixture-turn-${turn}` } } });
    if (prompt.includes('approval')) send({ id: 99, method: 'item/commandExecution/requestApproval', params: { threadId, turnId: `fixture-turn-${turn}`, command: 'fixture harmless action', reason: 'fixture approval' } });
    else if (prompt.includes('question')) send({ id: 99, method: 'item/tool/requestUserInput', params: { threadId, turnId: `fixture-turn-${turn}`, questions: [{ id: 'choice', question: 'Which fixture?', options: [] }] } });
    else if (!prompt.includes('wait')) complete();
  }
  if (m.id === 99 && m.result) complete(JSON.stringify(m.result));
  if (m.method === 'turn/interrupt') {
    send({ id: m.id, result: {} });
    send({ method: 'turn/completed', params: { threadId, turn: { id: `fixture-turn-${turn}`, status: 'interrupted' } } });
  }
});
