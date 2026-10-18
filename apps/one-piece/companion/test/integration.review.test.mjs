import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudProgress} from '../src/cloud-progress.mjs';
import {CompanionApi} from '../src/api.mjs';
import {ProgressStore} from '../src/progress.mjs';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function temporaryStore(t,extra={}) {
 const root=await mkdtemp(path.join(os.tmpdir(),'op-review-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('op-review-'));await rm(root,{recursive:true,force:true});});
 return new ProgressStore({root,catalog:{episodes:[1,2].map(episodeNumber=>({episodeNumber,availability:'listed'}))},...extra});
}

test('review: a closed lease with pending durable progress is not reported cloud-synced',async()=>{
 const pending={'one-piece-0001':{episodeId:'one-piece-0001',generation:1,revision:2,positionSeconds:120}};
 let acknowledgments=0;
 const store={hydrate:async()=>{},snapshot:async()=>({lease:null}),pending:async()=>pending,acknowledge:async()=>{acknowledgments++;}};
 const cloud=new CloudProgress({projectId:'pti-app-2ab59',ownerUid:'owner',credentials:{getAuthorized:async()=>({token:'fixture-only'})},store,
  fetchImpl:async url=>url.includes('/leases/')?new Response('',{status:404}):Response.json({documents:[]})});
 const result=await cloud.sync('viewer',{force:true});
 assert.equal(result.synced,false);
 assert.equal(acknowledgments,0);
 assert.equal(cloud.status('viewer').state,'pending');
});

test('review: temporary next-episode preparation failure remains retryable after space recovers',async()=>{
 const lease={sessionId:'session-review',generation:1,authorityEpoch:1,destination:'cast',expiresAt:Date.now()+60000};
 let preparations=0,queued=0;
 const descriptor={episodeId:'one-piece-0002',masterPath:'/Videos/review/master.m3u8',subtitlePath:'/Videos/review/subtitles.vtt',durationSeconds:1500,contentType:'application/vnd.apple.mpegurl'};
 const api=new CompanionApi({progress:{snapshot:async()=>({lease})},media:{prepareNextPlayback:async()=>{
  if(++preparations===1)throw Object.assign(new Error('temporary fixture pressure'),{code:'CACHE_PRESSURE'});
  return descriptor;
 }},tickets:{mint:()=>({token:'A'.repeat(32),expiresAt:Date.now()+60000})},cast:{queue:async()=>{queued++;}},config:{castMediaOrigin:'http://192.168.68.105:18099'}});
 const context={uid:'viewer',...lease,receiverId:'fixture-receiver'};
 await assert.rejects(api.ensureQueue(context),{code:'CACHE_PRESSURE'});
 await api.ensureQueue(context);
 assert.equal(preparations,2);
 assert.equal(queued,1);
});

test('review: final offline progress can be mirrored after its viewing lease closes',async t=>{
 const store=await temporaryStore(t),lease=await store.claim({uid:'viewer',deviceId:'review-device'});
 await store.record('viewer',lease.sessionId,{episodeId:'one-piece-0001',generation:lease.generation,authorityEpoch:lease.authorityEpoch,revision:1,positionSeconds:123,reason:'pause'},{durationSeconds:1500});
 let online=false;
 const cloud=new CloudProgress({projectId:'pti-app-2ab59',ownerUid:'owner',credentials:{getAuthorized:async()=>({token:'fixture-only'})},store,
  fetchImpl:async(url,init)=>init?.method==='POST'?online?Response.json({writeResults:[]}):new Response('',{status:503}):url.includes('/leases/')?new Response('',{status:404}):Response.json({documents:[]})});
 assert.equal((await cloud.sync('viewer',{force:true})).synced,false);
 await store.close('viewer',lease.sessionId);online=true;
 assert.equal((await store.snapshot('viewer')).lease,null);
 assert.equal((await cloud.sync('viewer',{force:true})).synced,true);
 assert.deepEqual(await store.pending('viewer'),{});
 assert.equal((await store.snapshot('viewer')).lease,null);
});

test('review: manual Cast selection rotates authority and delayed preparation cannot reload after local handoff',async t=>{
 let api;const revoked=[];
 const progress=await temporaryStore(t,{onAuthorityChange:id=>{revoked.push(id);api?.revokeSession(id);}});
 const lease=await progress.claim({uid:'viewer',deviceId:'review-device',destination:'cast'});
 const descriptor={durationSeconds:1500,masterPath:'/Videos/review/master.m3u8',subtitlePath:'/Videos/review/subtitles.vtt',contentType:'application/vnd.apple.mpegurl'};
 let resolvePreparation;const prepared=new Promise(resolve=>{resolvePreparation=resolve;});
 const calls=[],mediaState={episodeNumber:1,state:'ready',playback:descriptor};
 api=new CompanionApi({identity:{verify:async()=>({uid:'viewer'})},binding:{ownerUid:'owner'},family:()=>({requireMember:async actor=>actor}),
  progress,media:{snapshot:()=>mediaState,switchEpisode:async(_id,episodeNumber)=>{mediaState.state='preparing';await prepared;Object.assign(mediaState,{episodeNumber,state:'ready'});return descriptor;}},
  cast:{command:async(context,input)=>{calls.push({kind:'command',context,input});},load:async input=>calls.push({kind:'load',input})},
  config:{proxySecret:'review-secret',allowedOrigins:['https://pti-app-2ab59.web.app']}});
 api.castStates.set(lease.sessionId,{owned:true,receiverId:'review-receiver',state:'PLAYING',episodeId:'one-piece-0001'});
 const server=http.createServer((req,res)=>api.control(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/sessions/${lease.sessionId}/episode`,{method:'POST',headers:{Origin:'https://pti-app-2ab59.web.app','X-OnePiece-Proxy':'review-secret','X-Forwarded-Proto':'https',Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({episodeId:'one-piece-0002'})});
 assert.equal(response.status,202);const result=await response.json();
 assert.equal(result.lease.destination,'cast');assert.equal(result.lease.authorityEpoch,lease.authorityEpoch+1);
 assert.equal(calls[0].input.action,'pause');assert.equal(calls[0].context.authorityEpoch,lease.authorityEpoch);
 assert.equal(api.castStates.get(lease.sessionId).state,'PREPARING');assert.deepEqual(revoked,[lease.sessionId]);
 await assert.rejects(progress.record('viewer',lease.sessionId,{episodeId:'one-piece-0001',generation:lease.generation,authorityEpoch:lease.authorityEpoch,revision:1,positionSeconds:900,reason:'heartbeat'},{durationSeconds:1500,authority:'receiver'}),{code:'stale-progress-authority'});
 await progress.setDestination('viewer',lease.sessionId,'local');resolvePreparation();
 await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.filter(call=>call.kind==='load').length,0);
 assert.equal(api.states.get(lease.sessionId).error?.code,'destination-changed');
});
