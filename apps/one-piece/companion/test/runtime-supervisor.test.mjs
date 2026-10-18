import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {mkdtemp,writeFile,unlink,rmdir,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {RuntimeSupervisor,restartDelay,stopOwnedEngineChildren} from '../src/runtime/supervisor.mjs';
import {requestLocalSetup} from '../src/runtime/local-setup.mjs';
function fakeChild(){const child=new EventEmitter();Object.assign(child,{pid:123456,stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),connected:true,exitCode:null,signalCode:null});child.send=message=>{child.lastMessage=message;};child.kill=()=>{child.signalCode='SIGTERM';child.emit('exit',null,'SIGTERM');};return child;}
const configuration=()=>({repositoryRoot:fileURLToPath(new URL('../../../../',import.meta.url)),nodeExecutable:process.execPath,serverEntry:fileURLToPath(new URL('../src/server.mjs',import.meta.url)),configPath:'H:/PTI-OnePiece/runtime/private/config.json',jellyfin:{origin:'http://127.0.0.1:18097'}});
test('backend uses inherited IPC and numeric expiring setup challenge is protected without entering arguments or state',async()=>{
  const saved=[];let invocation;const child=fakeChild();const supervisor=new RuntimeSupervisor(configuration(),{clock:()=>10000,persistSetup:async(_config,challenge)=>saved.push(challenge),spawnImpl:(...args)=>{invocation=args;return child;}});supervisor.save=async()=>{};
  await supervisor.startChild('backend');assert.deepEqual(invocation[2].stdio,['pipe','pipe','pipe','ipc']);assert.equal(invocation[2].windowsHide,true);
  child.emit('message',{type:'one-piece-local-setup',code:'test-only-private-marker',expiresAt:20000});await Promise.resolve();
  assert.deepEqual(saved,[{code:'test-only-private-marker',expiresAt:20000,backendPid:123456}]);assert.equal(JSON.stringify(invocation).includes('test-only-private-marker'),false);assert.equal(JSON.stringify(supervisor.state).includes('test-only-private-marker'),false);
  child.emit('message',{type:'one-piece-local-setup',code:'stale',expiresAt:10000});child.emit('message',{type:'one-piece-local-setup',code:'too-long',expiresAt:999999});assert.equal(saved.length,1);
  child.emit('message',{type:'one-piece-backend-ready'});assert.equal(supervisor.ready.has('backend'),true);
  supervisor.shuttingDown=true;child.kill();child.emit('message',{type:'one-piece-local-setup',code:'retired-child',expiresAt:20000});assert.equal(saved.length,1);
});
test('backend health includes exact origin and private proxy proof, never a public/HTTP identity token',async()=>{
  const previous=globalThis.fetch,requests=[];const supervisor=new RuntimeSupervisor(configuration(),{tlsHealthImpl:async()=>true});supervisor.proxySecret='private-fixture';supervisor.save=async()=>{};supervisor.children.set('mdns',{});supervisor.ready.add('mdns');
  globalThis.fetch=async(url,options)=>{requests.push({url,options});return{ok:true,body:{cancel:async()=>{}}};};
  try{await supervisor.health();const backend=requests.find(x=>x.url.endsWith('/api/health'));assert.deepEqual(backend.options.headers,{Origin:'https://pti-app-2ab59.web.app','X-OnePiece-Proxy':'private-fixture','X-Forwarded-Proto':'https'});assert.equal(JSON.stringify(supervisor.state).includes('private-fixture'),false);assert.equal(supervisor.state.health.caddy,true);}finally{globalThis.fetch=previous;}
});
test('simultaneous core recovery shares one sequence and stops backend before owned engine',async()=>{
  const events=[];const supervisor=new RuntimeSupervisor(configuration(),{bootstrapImpl:async()=>events.push('bootstrap')});
  supervisor.stopChild=async name=>{events.push('stop:'+name);await Promise.resolve();};supervisor.startChild=async name=>events.push('start:'+name);supervisor.waitForEngine=async()=>events.push('healthy');
  await Promise.all([supervisor.recoverCore(),supervisor.recoverCore()]);assert.deepEqual(events,['stop:backend','stop:jellyfin','start:jellyfin','healthy','bootstrap','start:backend']);
});
test('recovery backoff is bounded and required cancellation export rejects unknown engine identity',async()=>{
  assert.deepEqual([1,2,3,4,5,6,20].map(restartDelay),[1000,2000,4000,8000,16000,30000,30000]);
  await assert.rejects(stopOwnedEngineChildren({statePath:'Z:/absent-runtime-fixture-state.json'}));
});
test('renewal request is local-only, waits for backend readiness, and rejects a paired household',async()=>{
  const privateRoot=await mkdtemp(path.join(os.tmpdir(),'onepiece-runtime-setup-'));
  const config={...configuration(),privateRoot,ownerBindingPath:path.join(privateRoot,'family-binding.json')};
  const supervisor=new RuntimeSupervisor(config);supervisor.stopPath=path.join(privateRoot,'stop.request');
  const requestFile=path.join(privateRoot,'setup.request'),child=fakeChild();
  try{
    assert.deepEqual(await requestLocalSetup(config),{requested:true});
    await supervisor.pollLocalRequests();await access(requestFile);
    supervisor.children.set('backend',child);supervisor.ready.add('backend');
    await supervisor.pollLocalRequests();assert.deepEqual(child.lastMessage,{type:'one-piece-local-setup-request'});await assert.rejects(access(requestFile),{code:'ENOENT'});
    await writeFile(config.ownerBindingPath,'{"version":1,"ownerUid":"test-only"}');
    await assert.rejects(requestLocalSetup(config),{message:'runtime-already-paired'});
  }finally{await unlink(requestFile).catch(()=>{});await unlink(config.ownerBindingPath).catch(()=>{});await rmdir(privateRoot);}
});
