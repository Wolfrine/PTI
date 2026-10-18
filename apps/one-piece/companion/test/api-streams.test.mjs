import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import { CompanionApi } from '../src/api.mjs';
import { AccessError } from '../src/auth.mjs';
import { ProgressStore } from '../src/progress.mjs';
import { TicketStore, mediaUrl } from '../src/tickets.mjs';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const bounded=async promise=>{
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('fixture deadline exceeded')),3000);})]);}
 finally{clearTimeout(timer);}
};

// Real loopback HTTP and controlled byte streams; no source, engine or Firebase claim.
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'op-api-stream-'));
 const tickets=new TicketStore(),streams=[],requests=[];let api,blocked=false,authorizations=0,authorizeHook;
 const progress=new ProgressStore({root,catalog:{episodes:[{episodeNumber:1,availability:'listed'}]},
  onRevoke:id=>{tickets.revokeSession(id);api?.revokeSession(id);},
  onAuthorityChange:id=>{tickets.revokeSession(id);api?.revokeSession(id);}});
 const credentials={getAuthorized:async uid=>{authorizations++;await authorizeHook?.(authorizations);if(blocked)throw new AccessError('not-invited',403);return{uid};},revoke:async()=>{}};
 const media={getPlaybackResource:async(id,resource,options)=>{
  const state={id,resource,options,aborted:false,cancelled:false,abort:deferred()};streams.push(state);
  options.signal.addEventListener('abort',()=>{state.aborted=true;state.abort.resolve();},{once:true});
  const body=new ReadableStream({start(controller){state.controller=controller;controller.enqueue(new Uint8Array(1024).fill(1));},cancel(){state.cancelled=true;}},{highWaterMark:0});
  return{status:200,headers:{'content-type':'video/mp4','content-length':String(1024*1024)},body,resources:[],longLived:true};
 }};
 api=new CompanionApi({identity:{verify:async token=>({uid:token,email:`${token}@example.com`})},binding:{ownerUid:'owner'},
  family:()=>({requireMember:async actor=>({...actor,role:'member'})}),credentials:()=>credentials,cloud:()=>null,
  progress,tickets,media,cast:{},streamCheckMs:20,
  config:{proxySecret:'fixture-proxy',allowedOrigins:['https://pti-app-2ab59.web.app'],allowHttpMedia:true}});
 const server=http.createServer((req,res)=>{const state={closed:deferred(),done:deferred()};requests.push(state);res.once('close',()=>state.closed.resolve());
  void Promise.resolve(req.url.startsWith('/m/')?api.mediaRequest(req,res):api.control(req,res)).then(()=>state.done.resolve(),()=>state.done.resolve());});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{api.shutdown();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('op-api-stream-'));await rm(root,{recursive:true,force:true});});
 const lease=await progress.claim({uid:'viewer',deviceId:'fixture-device'}),resource='/Videos/fixture/stream.mp4';
 const mint=()=>tickets.mint({...lease,uid:'viewer',episodeId:'one-piece-0001',resources:[resource]});
 let minted=mint();
 const url=mediaUrl(origin,minted.token,'one-piece-0001',resource);
 const request=(route,options={})=>fetch(origin+route,{...options,headers:{Origin:'https://pti-app-2ab59.web.app','X-OnePiece-Proxy':'fixture-proxy','X-Forwarded-Proto':'https',Authorization:'Bearer viewer',...options.headers}});
 return{api,progress,tickets,lease,media,streams,requests,url,request,credentials,
  deny:()=>{blocked=true;},hook:value=>{authorizeHook=value;},reads:()=>authorizations};
}

async function open(f){
 const response=await bounded(fetch(f.url));assert.equal(response.status,200);
 const reader=response.body.getReader();assert.equal((await bounded(reader.read())).value.byteLength,1024);
 assert.equal(f.api.activeStreams.size,1);return reader;
}
async function terminated(f,reader){
 await assert.rejects(bounded(reader.read()));
 assert.equal(f.streams[0].options.signal.aborted,true);assert.equal(f.api.activeStreams.size,0);
}

test('an already open MP4 is stopped by close, takeover, destination rotation, ticket revocation, expiry and shutdown',async t=>{
 const actions={
  close:f=>f.progress.close('viewer',f.lease.sessionId),
  takeover:f=>f.progress.claim({uid:'viewer',deviceId:'second-device',takeover:true}),
  destination:f=>f.progress.setDestination('viewer',f.lease.sessionId,'cast'),
  ticket:f=>f.tickets.revokeProfile('viewer'),
  expiry:f=>{const then=Date.now()+3*3600_000;f.tickets.clock=()=>then;},
  shutdown:f=>f.api.shutdown()
 };
 for(const [name,action]of Object.entries(actions))await t.test(name,async t=>{
  const f=await fixture(t),reader=await open(f);await action(f);await terminated(f,reader);
 });
});

test('self-unpair aborts an open stream before retained-credential removal can stall',async t=>{
 const f=await fixture(t),reader=await open(f),started=deferred(),release=deferred();
 f.credentials.revoke=async()=>{started.resolve();await release.promise;};
 const unpair=f.request('/api/pair-viewer',{method:'DELETE'});await bounded(started.promise);
 await terminated(f,reader);release.resolve();assert.equal((await unpair).status,200);
});

test('existing viewer authorization is called during playback without another positive cache',async t=>{
 const f=await fixture(t),reader=await open(f),before=f.reads();f.deny();
 await terminated(f,reader);assert.ok(f.reads()>before);assert.equal((await fetch(f.url)).status,404);
});

test('bytes wait for an in-flight membership check and resume only after its grant',async t=>{
 const f=await fixture(t),reader=await open(f),started=deferred(),release=deferred();
 f.hook(async()=>{started.resolve();await release.promise;});
 await bounded(started.promise);let delivered=false;
 const reading=reader.read().then(value=>{delivered=true;return value;});
 f.streams[0].controller.enqueue(new Uint8Array(1024).fill(2));
 await delay(60);assert.equal(delivered,false);
 f.hook(undefined);release.resolve();assert.equal((await bounded(reading)).value[0],2);
 await reader.cancel();await bounded(f.streams[0].abort.promise);assert.equal(f.api.activeStreams.size,0);
});

test('an in-flight membership denial releases no queued video bytes',async t=>{
 const f=await fixture(t),reader=await open(f),started=deferred(),release=deferred();
 f.hook(async()=>{started.resolve();await release.promise;});await bounded(started.promise);
 f.streams[0].controller.enqueue(new Uint8Array(1024).fill(2));f.deny();release.resolve();
 await terminated(f,reader);
});

test('HEAD ignores even a malformed Range; GET preserves a valid suffix and rejects malformed syntax',async t=>{
 const f=await fixture(t);
 const head=await fetch(f.url,{method:'HEAD',headers:{Range:'garbage'}});
 assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(1024*1024));assert.equal(await head.text(),'');
 assert.equal(f.streams[0].options.method,'HEAD');assert.equal(f.streams[0].options.range,undefined);
 assert.equal(f.api.activeStreams.size,0);
 const response=await fetch(f.url,{headers:{Range:'bytes=-4096'}});assert.equal(response.status,200);
 assert.equal(f.streams[1].options.range,'bytes=-4096');await response.body.cancel();
 const count=f.streams.length;assert.equal((await fetch(f.url,{headers:{Range:'bytes=0-1,3-4'}})).status,416);
 assert.equal(f.streams.length,count);
});

test('revocation while media headers are being prepared cannot publish a successful response',async t=>{
 const f=await fixture(t),get=f.media.getPlaybackResource,started=deferred(),release=deferred();
 f.media.getPlaybackResource=async(...args)=>{started.resolve();await release.promise;return get(...args);};
 const fetching=fetch(f.url);await bounded(started.promise);
 f.tickets.revokeSession(f.lease.sessionId);f.api.revokeSession(f.lease.sessionId);release.resolve();
 assert.equal((await bounded(fetching)).status,404);assert.equal(f.api.activeStreams.size,0);assert.equal(f.streams[0].options.signal.aborted,true);
});

test('client disconnect during initial authorization never starts media after its close event',async t=>{
 const f=await fixture(t),started=deferred(),release=deferred(),controller=new AbortController();
 f.hook(async()=>{started.resolve();await release.promise;});
 const fetching=fetch(f.url,{signal:controller.signal});void fetching.catch(()=>{});await bounded(started.promise);
 controller.abort();await assert.rejects(fetching);await bounded(f.requests[0].closed.promise);
 f.hook(undefined);release.resolve();await bounded(f.requests[0].done.promise);
 assert.equal(f.streams.length,0);assert.equal(f.api.activeStreams.size,0);
});

test('ticket revocation during initial authorization is checked before opening upstream media',async t=>{
 const f=await fixture(t),started=deferred(),release=deferred();
 f.hook(async()=>{started.resolve();await release.promise;});
 const fetching=fetch(f.url);await bounded(started.promise);f.tickets.revokeSession(f.lease.sessionId);
 f.hook(undefined);release.resolve();assert.equal((await bounded(fetching)).status,404);
 assert.equal(f.streams.length,0);assert.equal(f.api.activeStreams.size,0);
});

test('prepared delivery keeps the same tested mode through Cast handoff preparation',async t=>{
 const f=await fixture(t);let changed=0;
 f.media.snapshot=()=>({state:'ready',episodeNumber:1,playback:{mode:'prepared-mp4'}});
 f.media.switchEpisode=async()=>{changed++;};
 await f.api.prepareDestination(f.lease.sessionId,'cast');await f.api.prepareDestination(f.lease.sessionId,'local');assert.equal(changed,0);
});

test('shutdown refuses new control and media admission while health remains readable',async t=>{
 const f=await fixture(t);f.api.shutdown();
 assert.equal((await f.request('/api/progress')).status,503);
 assert.equal((await(await f.request('/api/health')).json()).status,'stopping');
 assert.equal((await fetch(f.url)).status,503);assert.equal(f.streams.length,0);assert.equal(f.reads(),0);
});
