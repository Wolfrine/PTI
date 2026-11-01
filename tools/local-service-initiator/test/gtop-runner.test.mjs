import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {GTOP_ENDPOINT,GTOP_MODELS,endpointPort,validateRunner,resolveCodexExecutable,runnerContract} from '../src/gtop-runner.mjs';
import {WorkerHost,runPowerShell} from '../src/windows.mjs';

const settings={workerId:'sachit-windows',workerConfig:'F:\\GTOP\\worker.json',controllerRoot:'F:\\GTOP\\controller',ollamaEndpoint:GTOP_ENDPOINT,modelDirectory:GTOP_MODELS,ollamaExecutable:'C:\\Users\\Owner\\AppData\\Local\\Programs\\Ollama\\ollama.exe',workerNodeExecutable:'F:\\Workspace\\Support\\PTI\\local-service-initiator\\runtime\\node.exe',helperExecutable:'F:\\Workspace\\Support\\PTI\\local-service-initiator\\releases\\1.2.0-test\\native\\PTI.LocalServiceHost.exe',stateDirectory:'F:\\Workspace\\Support\\PTI\\local-service-initiator\\data'};
const settingsFile='F:\\Workspace\\Support\\PTI\\local-service-initiator\\settings.json';
const codex='C:\\Users\\Owner\\AppData\\Local\\OpenAI\\Codex\\bin\\current-build\\codex.exe';
const worker={workerId:'sachit-windows',ollama:GTOP_ENDPOINT,model:'qwen3.5:4b-q4_K_M',runnerContractVersion:1};
const stamp='2026-11-01T10:00:00.000Z';
const stateFile=name=>path.join(settings.stateDirectory,name);

test('GTOP requires an explicit non-default loopback endpoint and its own existing model root',()=>{
  assert.equal(endpointPort(GTOP_ENDPOINT),11435);
  assert.equal(endpointPort('http://127.0.0.1:21435'),21435);
  for(const endpoint of [undefined,'http://127.0.0.1:11434','http://localhost:11435','http://0.0.0.0:11435','http://[::1]:11435','https://127.0.0.1:11435','http://127.0.0.1:11435/','http://127.0.0.1:11435?x','http://127.0.0.1:99999','http://127.0.0.1:011435','http://127.0.0.1:1000'])assert.throws(()=>endpointPort(endpoint),{message:'configuration_invalid'});
  for(const [s,w] of [[{...settings,modelDirectory:'F:\\SEFPO\\models'},worker],[settings,{...worker,ollama:'http://127.0.0.1:11434'}],[settings,{...worker,runnerContractVersion:undefined}]])assert.throws(()=>validateRunner(s,w));
});

test('credential-free Codex helper discovers the newest installed executable and tolerates removed updates',async()=>{
  const entries=['old','new','deleted','not-a-directory'].map(name=>({name,isDirectory:()=>name!=='not-a-directory'}));
  const options={localAppData:'C:\\Users\\Owner\\AppData\\Local',readDirectory:async()=>entries,fileStat:async file=>{
    if(file.includes('deleted'))throw Error('ENOENT');
    return {isFile:()=>true,mtimeMs:file.includes('new')?200:100};
  }};
  assert.equal(await resolveCodexExecutable(options),'C:\\Users\\Owner\\AppData\\Local\\OpenAI\\Codex\\bin\\new\\codex.exe');
  await assert.rejects(resolveCodexExecutable({...options,readDirectory:async()=>[]}),{message:'configuration_invalid'});
  await assert.rejects(resolveCodexExecutable({...options,localAppData:'relative'}));
});

test('contract calls the dynamic helper and contains only bounded runner fields, never protected worker data',async()=>{
  let calls=0;
  const contract=await runnerContract(settings,{...worker,secretProtected:'PRIVATE',firebaseApiKey:'PRIVATE',codexPath:'C:\\obsolete\\codex.exe'}, {resolveCodex:async()=>{calls++;return codex;},checkAccess:async()=>{}});
  assert.equal(calls,1);assert.equal(contract.codexExecutable,codex);assert.match(contract.id,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(contract).includes('PRIVATE'),false);assert.equal(JSON.stringify(contract).includes('obsolete'),false);
  await assert.rejects(runnerContract(settings,worker,{resolveCodex:async()=> 'C:\\bad.exe',checkAccess:async()=>{}}));
});

function fixture({config=worker,fetchImpl,runDelay=0}={}) {
  const files=new Map([[settings.workerConfig,config]]),launches=[],requests=[];
  let at=0,nextPid=100;
  const snapshot={listeners:[],workers:[],hosts:[],processes:[]};
  const host=new WorkerHost(settings,settingsFile,{read:async f=>files.get(f)||null,write:async(f,v)=>files.set(f,structuredClone(v)),resolveCodex:async()=>codex,checkAccess:async()=>{},now:()=>at,wait:async ms=>{at+=ms;},fetchImpl:async(url,options)=>{
    requests.push({url,options});
    if(fetchImpl)return fetchImpl(url,options);
    return new Response(JSON.stringify({models:[{name:worker.model}]}));
  }});
  host.snapshot=async timeout=>{at+=Math.min(runDelay,timeout||20000);return structuredClone(snapshot);};
  function add(mode,{listener=true}={}) {
    const childPid=nextPid++,helperPid=nextPid++;
    const record={mode,childPid,helperPid,phase:'running',childStartedAt:stamp,helperStartedAt:stamp,helperExecutable:settings.helperExecutable,ollamaEndpoint:settings.ollamaEndpoint,modelDirectory:settings.modelDirectory,runnerContractId:files.get(stateFile('gtop-runner.json'))?.id};
    files.set(host.hostFile(mode),record);
    snapshot.hosts.push({pid:helperPid,mode});
    snapshot.processes.push({pid:helperPid,executable:settings.helperExecutable,startedAt:stamp},{pid:childPid,executable:mode==='ollama'?settings.ollamaExecutable:settings.workerNodeExecutable,startedAt:stamp});
    if(mode==='ollama'&&listener)snapshot.listeners.push({pid:childPid,address:'127.0.0.1'});
    if(mode==='worker')snapshot.workers.push(childPid);
    return record;
  }
  host.startHelper=async(mode)=>{launches.push(mode);add(mode);};
  return {host,files,launches,requests,snapshot,add,get elapsed(){return at;},advance:ms=>{at+=ms;},diagnostic:()=>files.get(stateFile('gtop-startup.json'))};
}

test('isolated cold start launches one dispatcher/worker and checks tags without loading a model',async()=>{
  const f=fixture();await Promise.all([f.host.start(),f.host.start()]);
  assert.deepEqual(f.launches,['ollama','worker']);assert.equal(f.diagnostic().phase,'launch_verified');
  assert.equal(await f.host.workerRunning(),true);
  await f.host.start();assert.deepEqual(f.launches,['ollama','worker']);
  assert.ok(f.requests.every(r=>r.url===GTOP_ENDPOINT+'/api/tags'&&r.options.redirect==='error'));
  assert.equal(f.requests.some(r=>r.url.includes('11434')),false);
});

test('an unknown dedicated listener is refused before any API call or process launch, even if it might serve Qwen',async()=>{
  const f=fixture();f.snapshot.listeners.push({pid:900,address:'127.0.0.1'});
  await assert.rejects(f.host.start(),{message:'port_in_use'});
  assert.deepEqual(f.launches,[]);assert.deepEqual(f.requests,[]);assert.equal(f.diagnostic().reason,'listener_conflict');
});

test('wildcard/non-loopback listeners and recycled owned PIDs cannot be adopted',async()=>{
  for(const mode of ['wildcard','recycled','wrong-model-root','wrong-helper']) {
    const f=fixture(),record=f.add('ollama');
    if(mode==='wildcard')f.snapshot.listeners[0].address='0.0.0.0';
    if(mode==='recycled')f.snapshot.processes.find(p=>p.pid===record.childPid).startedAt='2026-11-01T11:00:00Z';
    if(mode==='wrong-model-root')record.modelDirectory='F:\\SEFPO\\models';
    if(mode==='wrong-helper')f.snapshot.processes.find(p=>p.pid===record.helperPid).executable='F:\\other.exe';
    await assert.rejects(f.host.start(),{message:'port_in_use'});assert.deepEqual(f.launches,[]);
  }
});

test('owned dispatcher missing Qwen reports actionable model failure with no download or worker',async()=>{
  const f=fixture({fetchImpl:async()=>new Response('{"models":[]}')});f.add('ollama');
  await assert.rejects(f.host.start(),{message:'model_unavailable'});
  assert.deepEqual(f.launches,[]);assert.equal(f.diagnostic().reason,'model_missing');assert.match(f.diagnostic().action,/manifest\/storage/);
});

test('transient owned dispatcher failures retry within the elapsed budget without spawning duplicates',async()=>{
  let tries=0;
  const f=fixture({fetchImpl:async()=>{if(++tries<3)throw Error('booting');return new Response(JSON.stringify({models:[{name:worker.model}]}));}});
  await f.host.start();assert.equal(tries,3);assert.deepEqual(f.launches,['ollama','worker']);assert.ok(f.elapsed<75000);
});

test('persistent dispatcher failures and slow process inspection are bounded by elapsed time',async()=>{
  const f=fixture({fetchImpl:async()=>{f.advance(2000);throw Error('timeout');},runDelay:2000});
  await assert.rejects(f.host.start(),{message:'model_unavailable'});
  assert.ok(f.elapsed<=75000);assert.deepEqual(f.launches,['ollama']);assert.equal(f.diagnostic().reason,'dispatcher_timeout');
});

test('an owned booting native dispatcher is awaited without launching a second helper',async()=>{
  const f=fixture();const record=f.add('ollama',{listener:false});let checks=0;
  const inspect=f.host.snapshot;
  f.host.snapshot=async timeout=>{if(++checks===3)f.snapshot.listeners.push({pid:record.childPid,address:'127.0.0.1'});return inspect(timeout);};
  await f.host.start();assert.deepEqual(f.launches,['worker']);
});

test('an existing legacy/unrecorded worker blocks startup even if its process.json is missing',async()=>{
  const f=fixture();f.snapshot.workers.push(777);
  await assert.rejects(f.host.start(),{message:'configuration_invalid'});assert.deepEqual(f.launches,[]);assert.equal(f.diagnostic().reason,'worker_conflict');
});

test('changed contract or stale worker host identity cannot trigger a duplicate worker',async()=>{
  const f=fixture();await f.host.start();
  f.files.get(f.host.hostFile('worker')).runnerContractId='obsolete';
  assert.equal(await f.host.workerRunning(),false);
  await assert.rejects(f.host.start(),{message:'configuration_invalid'});assert.deepEqual(f.launches,['ollama','worker']);
});

test('obsolete config is rejected before launching anything; Codex resolver failures are local and actionable',async()=>{
  const f=fixture({config:{...worker,ollama:'http://127.0.0.1:11434'}});
  await assert.rejects(f.host.start(),{message:'configuration_invalid'});assert.deepEqual(f.launches,[]);assert.equal(f.diagnostic().reason,'configuration');
  const g=fixture();g.host.resolveCodex=async()=>{throw Error('private account detail');};
  await assert.rejects(g.host.start(),{message:'configuration_invalid'});assert.equal(g.diagnostic().reason,'codex');assert.equal(JSON.stringify(g.diagnostic()).includes('private'),false);
});

test('snapshot passes only the dedicated port and exact fixed process selectors and fails closed on inspection failure',async()=>{
  let captured;
  const host=new WorkerHost(settings,settingsFile,{read:async()=>null,run:async(script,input)=>{captured={script,input};return JSON.stringify({listeners:[],workers:[],hosts:[],processes:[]});}});
  assert.deepEqual(await host.snapshot(),{listeners:[],workers:[],hosts:[],processes:[]});assert.equal(captured.input.port,11435);
  assert.ok(captured.script.includes('CreationDate'));assert.ok(captured.script.includes('function HasArg'));
  host.run=async()=>{throw Error('access denied');};await assert.rejects(host.snapshot(),{message:'configuration_invalid'});
});

test('actual PowerShell snapshot parses exact quoted arguments, timestamps and empty listeners using synthetic cmdlets',{skip:process.platform!=='win32'},async()=>{
  const prefix=String.raw`function Get-NetTCPConnection { $script:r.fakeTcp }; function Get-CimInstance { foreach($p in $script:r.fakeProcesses){$p.CreationDate=[DateTime]::Parse($p.CreationDate);$p} }; `;
  const command='"'+settings.workerNodeExecutable+'" --import "file:///F:/GTOP/loader.mjs" "F:\\GTOP\\controller\\src\\main.ts" "'+settings.workerConfig+'"';
  let fakeTcp=[{LocalPort:11434,LocalAddress:'127.0.0.1',OwningProcess:888},{LocalPort:11435,LocalAddress:'127.0.0.1',OwningProcess:101}];
  const fakeProcesses=[
    {Name:'node.exe',ProcessId:123,CommandLine:command,ExecutablePath:settings.workerNodeExecutable,CreationDate:stamp},
    {Name:'node.exe',ProcessId:124,CommandLine:command.replace('worker.json','worker.json.other'),ExecutablePath:settings.workerNodeExecutable,CreationDate:stamp},
    {Name:'PTI.LocalServiceHost.exe',ProcessId:125,CommandLine:'"helper.exe" "'+settingsFile+'" ollama',ExecutablePath:settings.helperExecutable,CreationDate:stamp}
  ];
  const host=new WorkerHost(settings,settingsFile,{read:async()=>null,run:(script,input)=>runPowerShell(prefix+script,{...input,fakeTcp,fakeProcesses})});
  const snapshot=await host.snapshot();
  assert.deepEqual(snapshot.workers,[123]);assert.deepEqual(snapshot.listeners,[{pid:101,address:'127.0.0.1'}]);
  assert.deepEqual(snapshot.hosts,[{pid:125,mode:'ollama'}]);assert.ok(Number.isFinite(Date.parse(snapshot.processes[0].startedAt)));
  fakeTcp=[];assert.deepEqual((await host.snapshot()).listeners,[]);
});

test('worker confirmation timeout does not relaunch an already created helper',async()=>{
  const f=fixture(),launch=f.host.startHelper;
  f.host.startHelper=async mode=>{if(mode==='worker')f.launches.push(mode);else await launch(mode);};
  await assert.rejects(f.host.start(),{message:'worker_start_timeout'});
  assert.deepEqual(f.launches,['ollama','worker']);assert.equal(f.elapsed,75000);assert.equal(f.diagnostic().reason,'launch_timeout');
});

test('a process inspection that consumes the deadline never launches late',async()=>{
  const f=fixture();f.host.snapshot=async()=>{f.advance(75000);return structuredClone(f.snapshot);};
  await assert.rejects(f.host.start(),{message:'worker_start_timeout'});assert.deepEqual(f.launches,[]);
});
