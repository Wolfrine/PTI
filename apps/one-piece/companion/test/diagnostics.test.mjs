import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PlaybackDiagnostics,emitDiagnostic,sanitizeDiagnostic} from '../src/diagnostics.mjs';

test('diagnostic allowlist strips credentials, arbitrary codes, identifiers and nested source data',()=>{
 const secret='https://private.example/m/SECRET-CAPABILITY';
 const event=sanitizeDiagnostic({type:'media-error',sessionId:secret,code:secret,message:secret,url:secret,token:secret,resourceKind:'video',method:'GET',hasRange:true,headers:{authorization:secret}});
 assert.deepEqual(event,{type:'media-error',code:'internal-error',method:'GET',hasRange:true,resourceKind:'video'});
 assert.equal(JSON.stringify(event).includes('SECRET'),false);assert.equal(sanitizeDiagnostic({type:secret}),null);
 const received=[];emitDiagnostic(value=>received.push(value),{type:'cast-error',code:'cast-status-not-fresh',sessionId:'session-one',state:'PAUSED',owned:true});
 assert.equal(received[0].code,'cast-status-not-fresh');assert.equal(received[0].sessionId,'session-one');
});
test('diagnostic hook throws and rejected writes do not become playback failures',async()=>{
 emitDiagnostic(()=>{throw Error('private');},{type:'media-error',code:'STATIC_READ'});
 emitDiagnostic(()=>Promise.reject(Error('private')),{type:'stream-abort',code:'media-client-closed'});
 await new Promise(resolve=>setImmediate(resolve));
});
test('local timeline serializes concurrent writes and retains only its bounded most recent events',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'one-piece-diagnostics-'));t.after(()=>rm(root,{recursive:true,force:true}));
 let now=1000;const file=path.join(root,'events.json'),log=new PlaybackDiagnostics({file,limit:3,clock:()=>now++});
 await Promise.all(Array.from({length:12},(_,i)=>log.record({type:'cast-state',sessionId:'session-'+i,state:i%2?'PAUSED':'PLAYING',owned:true})));
 const result=JSON.parse(await readFile(file,'utf8'));assert.equal(result.events.length,3);assert.deepEqual(result.events.map(e=>e.sequence),[10,11,12]);
 assert.deepEqual(result.events.map(e=>e.sessionId),['session-9','session-10','session-11']);assert.equal(log.events.length,3);assert.equal(log.written,12);
});
