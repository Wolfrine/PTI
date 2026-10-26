import test from 'node:test';
import assert from 'node:assert/strict';
import {Initiator,validateSettings} from '../src/core.mjs';

const settings={workerId:'sachit-windows',gateway:'https://gtop-question-papers.web.app/api',workerConfig:'H:\\GTOP-Local-AI\\pilot-runtime\\worker.json',controllerRoot:'H:\\GTOP-Local-AI\\gtop-documentation\\tools\\gtop-assistant',ollamaExecutable:'C:\\Program Files\\Ollama\\ollama.exe',modelDirectory:'H:\\GTOP-Local-AI\\models\\ollama',stateDirectory:'F:\\Workspace\\Support\\PTI\\local-service-initiator\\data',helperExecutable:'F:\\Workspace\\Support\\PTI\\local-service-initiator\\releases\\1.0.1-test\\native\\PTI.LocalServiceHost.exe',workerNodeExecutable:'F:\\Workspace\\Support\\PTI\\local-service-initiator\\runtime\\node.exe'};
test('only the fixed worker, gateway and local absolute dependencies are accepted',()=>{
  assert.equal(validateSettings(settings),settings);
  for(const bad of [{workerId:'another-pc'},{gateway:'https://attacker.example/api'},{gateway:'https://gtop-question-papers.web.app/api?token=secret'},{stateDirectory:'C:\\temp'},{stateDirectory:'F:\\Workspace\\Support\\PTI\\local-service-initiator\\..\\elsewhere'},{workerConfig:'relative.json'}])assert.throws(()=>validateSettings({...settings,...bad}));
});
function fixture({prior=null,request={id:'start-123',action:'start',expiresAt:'2026-10-26T10:02:00Z'},start=async()=>{},running=false}={}) {
  let saved=prior,calls=[],starts=0;
  const subject=new Initiator({api:async body=>{calls.push(body);return {request:body.lastStartResult?null:request,service:{state:'starting'}};},read:async()=>saved,write:async value=>saved=structuredClone(value),start:async()=>{starts++;assert.equal(saved.requestId,request.id);assert(!saved.result);await start();},workerRunning:async()=>running,now:()=>Date.parse('2026-10-26T10:00:00Z')});
  return {subject,get saved(){return saved;},get calls(){return calls;},get starts(){return starts;}};
}
test('records a request before launch and acknowledges launch without inventing readiness',async()=>{
  const f=fixture();assert.equal((await f.subject.tick()).state,'starting');assert.equal(f.starts,1);assert.equal(f.saved.result.state,'started');assert.equal(f.calls[1].lastStartResult.state,'started');
});
test('server replay and duplicate clicks cannot repeat a completed launch',async()=>{
  const f=fixture();await f.subject.tick();await f.subject.tick();assert.equal(f.starts,1);
});
test('recovery after an interrupted launch never launches twice',async()=>{
  for(const running of [false,true]){
    const f=fixture({prior:{requestId:'start-123'},running});await f.subject.tick();assert.equal(f.starts,0);assert.equal(f.saved.result.state,running?'started':'failed');
  }
});
test('expired, malformed or unsupported remote actions cannot execute',async()=>{
  for(const request of [{id:'x',action:'start',expiresAt:'2026-10-26T09:59:59Z'},{id:'x',action:'shell',expiresAt:'2026-10-26T10:02:00Z'},{id:'../../secret',action:'start',expiresAt:'2026-10-26T10:02:00Z'}]){const f=fixture({request});await f.subject.tick();assert.equal(f.starts,0);assert.equal(f.saved,null);}
});
test('only sanitized fixed failure codes reach the gateway',async()=>{
  for(const [message,expected] of [['model_unavailable','model_unavailable'],['private token = secret','start_failed']]){
    const f=fixture({start:async()=>{throw Error(message);}});await f.subject.tick();assert.equal(f.saved.result.errorCode,expected);assert(!JSON.stringify(f.calls).includes('private token'));
  }
});
test('an acknowledgement transport failure leaves a durable result for retry',async()=>{
  let saved=null,starts=0,count=0;
  const subject=new Initiator({api:async body=>{count++;if(count===2)throw Error('network');return {request:body.lastStartResult?null:{id:'start-123',action:'start',expiresAt:'2026-10-26T10:02:00Z'},service:{}};},read:async()=>saved,write:async v=>saved=v,start:async()=>starts++,workerRunning:async()=>false,now:()=>Date.parse('2026-10-26T10:00:00Z')});
  await assert.rejects(subject.tick());assert.equal(saved.result.state,'started');await subject.tick();assert.equal(starts,1);
});
