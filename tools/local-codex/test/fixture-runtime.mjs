import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const lines = readline.createInterface({ input: process.stdin });
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
let cwd, sandbox, prompt, turn = 0;
let threadId=process.argv.includes('--unique-thread-id')?randomUUID():'01900000-0000-7000-8000-000000000001';
const childThreadId='01900000-0000-7000-8000-000000000002';
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
  if (m.method === 'model/list') send({id:m.id,result:{data:process.argv.includes('--missing-model')?[]:[{model:'gpt-6.1-sol',supportedReasoningEfforts:[{reasoningEffort:'xhigh'}]}],nextCursor:null}});
  if(m.method==='thread/read')send({id:m.id,result:{thread:m.params.threadId===childThreadId?{id:childThreadId,parentThreadId:threadId,modelProvider:'openai',model:process.argv.includes('--child-unknown')?null:process.argv.includes('--child-wrong-model')?'lower-model':'gpt-6.1-sol',reasoningEffort:process.argv.includes('--child-unknown')?null:'xhigh',status:{type:'idle'}}:fixtureThread()}});
  if(m.method==='thread/list')send({id:m.id,result:{data:state().archived===!!m.params.archived?[fixtureThread()]:[],nextCursor:null}});
  if(m.method==='thread/turns/list')send({id:m.id,result:{data:[{id:'turn-old',status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'Old user prompt'}]},{type:'commandExecution',command:'PRIVATE TOOL OUTPUT'},{type:'agentMessage',text:'x'.repeat(6000)}]}],nextCursor:'fixture-next'}});
  if(m.method==='thread/name/set'){fs.writeFileSync(historyFile,JSON.stringify({...state(),name:m.params.name}));send({id:m.id,result:{}});}
  if(m.method==='thread/archive'||m.method==='thread/unarchive'){fs.writeFileSync(historyFile,JSON.stringify({...state(),archived:m.method==='thread/archive'}));send({id:m.id,result:{}});}
  if (m.method === 'thread/start' || m.method === 'thread/resume') {
    if(m.method==='thread/resume')threadId=m.params.threadId;
    cwd = m.params.cwd;
    sandbox = m.params.sandbox === 'read-only' ? 'readOnly' : 'workspaceWrite';
    fs.writeFileSync(path.join(cwd, 'fixture-options.json'), JSON.stringify(m.params));
    send({ id: m.id, result: { thread: { id:threadId }, model:process.argv.includes('--wrong-model')?'lower-model':m.params.model, reasoningEffort:m.params.config.model_reasoning_effort, modelProvider:'openai', sandbox: { type: sandbox } } });
  }
  if (m.method === 'turn/start') {
    fs.writeFileSync(path.join(cwd, 'fixture-turn-options.json'), JSON.stringify(m.params));
    prompt = m.params.input[0].text;
    turn++;
    send({ id: m.id, result: { turn: { id: `fixture-turn-${turn}`, status: 'inProgress' } } });
    send({ method: 'turn/started', params: { threadId, turn: { id: `fixture-turn-${turn}` } } });
    if(process.argv.includes('--resolved-question')){
      send({id:101,method:'item/tool/requestUserInput',params:{threadId,turnId:`fixture-turn-${turn}`,questions:[{id:'fixture-resolved',question:'Fixture question',options:[]}]}});
      send({method:'serverRequest/resolved',params:{threadId,requestId:101}});
    }
    if(process.argv.includes('--rerouted'))send({method:'model/rerouted',params:{threadId,turnId:`fixture-turn-${turn}`,fromModel:'gpt-6.1-sol',toModel:'lower-model',reason:'fixture'}});
    if(process.argv.includes('--telemetry')){
      const usage={totalTokens:30,inputTokens:20,cachedInputTokens:10,outputTokens:10,reasoningOutputTokens:4};
      for(let i=0;i<2;i++)send({method:'thread/tokenUsage/updated',params:{threadId,turnId:`fixture-turn-${turn}`,tokenUsage:{last:usage,total:usage}}});
      for(let i=0;i<2;i++)send({method:'item/completed',params:{threadId,turnId:`fixture-turn-${turn}`,item:{id:'private-command',type:'commandExecution',command:'PRIVATE_COMMAND_CONTENT',aggregatedOutput:'PRIVATE_OUTPUT_CONTENT',status:'completed',exitCode:0}}});
      send({method:'item/completed',params:{threadId,turnId:`fixture-turn-${turn}`,item:{id:'spawn-child',type:'collabAgentToolCall',tool:'spawnAgent',status:'completed',senderThreadId:threadId,receiverThreadIds:[childThreadId],prompt:'PRIVATE_CHILD_PROMPT',agentsStates:{[childThreadId]:{status:'completed',message:'PRIVATE_CHILD_STATE'}}}}});
      if(!process.argv.includes('--child-unknown'))send({method:'item/completed',params:{threadId,turnId:`fixture-turn-${turn}`,item:{id:'child-activity',type:'subAgentActivity',kind:'started',agentThreadId:childThreadId,agentPath:'/fixture/child',model:process.argv.includes('--child-wrong-model')?'lower-model':'gpt-6.1-sol',reasoningEffort:'xhigh'}}});
      if(process.argv.includes('--nested-child'))send({method:'item/completed',params:{threadId:childThreadId,turnId:'child-turn',item:{id:'nested-spawn',type:'collabAgentToolCall',tool:'spawnAgent',status:'completed',senderThreadId:childThreadId,receiverThreadIds:['01900000-0000-7000-8000-000000000003'],agentsStates:{}}}});
      send({method:'item/completed',params:{threadId:childThreadId,turnId:'child-turn',item:{id:'child-answer',type:'agentMessage',phase:'final_answer',text:'PRIVATE_CHILD_ANSWER'}}});
      send({method:'turn/completed',params:{threadId:childThreadId,turn:{id:'child-turn',status:'completed'}}});
    }
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
