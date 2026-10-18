import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CompanionApi} from '../src/api.mjs';
import {AccessError} from '../src/auth.mjs';
import {ProgressStore} from '../src/progress.mjs';
import {TicketStore} from '../src/tickets.mjs';

async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'op-api-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('op-api-'));await rm(root,{recursive:true,force:true});});
 const catalog={episodes:[{episodeNumber:1,availability:'listed'},{episodeNumber:590,availability:'missing'}]},tickets=new TicketStore();
 const snapshots=new Map();let api;
 const progress=new ProgressStore({root,catalog,onRevoke:id=>{tickets.revokeSession(id);snapshots.delete(id);api?.revokeSession(id);},onAuthorityChange:id=>{tickets.revokeSession(id);api?.revokeSession(id);}});
 const descriptor={masterPath:'/Videos/fixture/master.m3u8?private=fake-engine-secret',subtitlePath:'/Videos/fixture/subtitles.vtt',contentType:'application/vnd.apple.mpegurl',durationSeconds:1500,selected:{audioIndex:1,subtitleIndex:2,audioLanguage:'jpn'},tracks:[{index:1,type:'audio',language:'jpn'},{index:2,type:'subtitle',language:'eng',fullEnglish:true}],mode:'compatible-h264'};
 const media={snapshot:id=>snapshots.get(id),openSession:async({sessionId,episodeNumber})=>{snapshots.set(sessionId,{episodeNumber,state:'ready',playback:descriptor});return descriptor;},closeSession:async id=>snapshots.delete(id),reportProgress:async()=>{},getPlaybackResource:async(id,resource)=>{
   if(resource===descriptor.masterPath)return{status:200,headers:{'content-type':'application/vnd.apple.mpegurl'},manifestText:'#EXTM3U\n/Videos/fixture/segment0.ts',resources:['/Videos/fixture/segment0.ts'],body:new Blob([]).stream()};
   return{status:200,headers:{'content-type':resource.endsWith('vtt')?'text/vtt':'video/mp2t'},body:new Blob([resource.endsWith('vtt')?'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nFixture dialogue':'fixture-media-bytes']).stream(),resources:[]};
 },switchEpisode:async(id,episodeNumber,options)=>{const playback={...descriptor,mode:options.mode??snapshots.get(id).playback.mode};snapshots.set(id,{episodeNumber,state:'ready',playback});return playback;}};
 const credentials={getAuthorized:async uid=>({uid,token:'fixture-private-token'}),pairGoogle:async()=>({paired:true}),revoke:async()=>{}};
 api=new CompanionApi({identity:{verify:async token=>{if(!['viewer','sister','outsider'].includes(token))throw new AccessError('invalid-token');return{uid:token,email:`${token}@example.com`,token};}},binding:{ownerUid:'owner'},family:()=>({requireMember:async actor=>{if(actor.uid==='outsider')throw new AccessError('not-invited',403);return actor;}}),credentials:()=>credentials,cloud:()=>null,media,progress,tickets,cast:{discover:async()=>[]},config:{proxySecret:'test-secret-proxy',allowedOrigins:['https://pti-app-2ab59.web.app'],mediaOrigin:'http://127.0.0.1',castMediaOrigin:'http://127.0.0.1',allowHttpMedia:true}});
 const server=http.createServer((req,res)=>req.url.startsWith('/m/')?api.mediaRequest(req,res):api.control(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin=`http://127.0.0.1:${server.address().port}`;api.config.mediaOrigin=origin;api.config.castMediaOrigin=origin;
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 async function request(route,{method='GET',uid='viewer',input,headers={}}={}){return fetch(origin+route,{method,headers:{Origin:'https://pti-app-2ab59.web.app','X-OnePiece-Proxy':'test-secret-proxy','X-Forwarded-Proto':'https',Authorization:`Bearer ${uid}`,...(input?{'Content-Type':'application/json'}:{}),...headers},body:input?JSON.stringify(input):undefined});}
 return{api,progress,tickets,request,origin,media,credentials};
}

test('control API rejects untrusted transport/origin and non-family identity; setup is not public administration',async t=>{
 const {request}=await fixture(t);
 assert.equal((await request('/api/health',{headers:{'X-Forwarded-Proto':'http'}})).status,403);
 assert.equal((await request('/api/health',{headers:{Origin:'https://attacker.invalid'}})).status,403);
 assert.equal((await request('/api/progress',{uid:'outsider'})).status,403);
 assert.equal((await request('/api/progress',{uid:'invalid'})).status,401);
 assert.equal((await request('/api/sessions',{method:'POST',input:{episodeId:'one-piece-0590',deviceId:'device-one'}})).status,404);
});

test('account status reuses only the authenticated viewer connection and never returns retained credentials',async t=>{
 const {api,request,credentials}=await fixture(t),lookups=[];
 api.binding.ownerUid='viewer';
 api.family=()=>({requireMember:async actor=>({...actor,role:actor.uid==='viewer'?'owner':'member'})});
 credentials.getAuthorized=async uid=>{lookups.push(uid);return{uid,token:'secret-retained-firebase-token',refreshToken:'secret-refresh-token',providerCredential:'secret-google-credential',expiresAt:Date.now()+3600000};};
 for(const uid of ['viewer','sister','viewer']){
  const response=await request('/api/me',{uid});assert.equal(response.status,200);
  const text=await response.text(),me=JSON.parse(text);
  assert.equal(me.uid,uid);assert.equal(me.role,uid==='viewer'?'owner':'member');
  assert.deepEqual(me.playbackAccess,{state:'ready'});
  assert.deepEqual(Object.keys(me).sort(),['uid','email','role','ownerUid','needsWorkspace','needsClaim','playbackAccess'].sort());
  assert.ok(!text.includes('secret-'));assert.ok(!text.includes('refreshToken'));assert.ok(!text.includes('providerCredential'));assert.ok(!text.includes('expiresAt'));
 }
 assert.deepEqual(lookups,['viewer','sister','viewer']);
});

test('account status requests Google confirmation only for explicit missing or revoked credential errors',async t=>{
 const {api,request,credentials}=await fixture(t);
 api.family=()=>({requireMember:async actor=>({...actor,role:'member'})});
 for(const code of ['viewer-not-paired','viewer-reauthentication-required']){
  credentials.getAuthorized=async()=>{throw new AccessError(code,401);};
  const response=await request('/api/me');assert.equal(response.status,200);
  assert.deepEqual((await response.json()).playbackAccess,{state:'confirmation-required',code});
 }
});

test('temporary and unexpected credential failures do not prompt reconnection or reveal private error details',async t=>{
 const {api,request,credentials}=await fixture(t);
 api.family=()=>({requireMember:async actor=>({...actor,role:'member'})});
 const errors=[
  new AccessError('viewer-identity-unavailable',503),
  new AccessError('viewer-credential-unavailable',503),
  new AccessError('membership-unavailable',503),
  new AccessError('viewer-not-paired',503),
  new AccessError('viewer-identity-mismatch',401),
  new AccessError('secret-internal-error',503),
  Object.assign(new Error('secret token and private storage path'),{code:'EACCES'}),
  null,
 ];
 for(const error of errors){
  credentials.getAuthorized=async()=>{throw error;};
  const response=await request('/api/me');assert.equal(response.status,200);
  const text=await response.text();
  assert.deepEqual(JSON.parse(text).playbackAccess,{state:'unavailable',code:error?.code==='viewer-identity-unavailable'?'viewer-identity-unavailable':'viewer-credential-unavailable'});
  assert.ok(!text.includes('secret'));assert.ok(!text.includes('EACCES'));
 }
});

test('pending workspace and invitation account metadata never reads retained playback credentials',async t=>{
 const {api,request,credentials}=await fixture(t);let lookups=0;
 credentials.getAuthorized=async()=>{lookups++;throw new Error('must not read pending account credentials');};
 for(const extra of [{role:'owner',needsWorkspace:true},{role:'invited',needsClaim:true},{role:'member',needsClaim:true},{role:'invited'}]){
  api.family=()=>({requireMember:async actor=>({...actor,...extra})});
  const response=await request('/api/me');assert.equal(response.status,200);
  const me=await response.json();
  assert.deepEqual(me.playbackAccess,{state:'unavailable',code:'account-setup-required'});
  assert.equal(me.needsWorkspace,extra.needsWorkspace===true);assert.equal(me.needsClaim,extra.needsClaim===true);
 }
 assert.equal(lookups,0);
});

test('account status authenticates and checks membership before accessing any retained credential',async t=>{
 const {api,request,credentials}=await fixture(t);let lookups=0;
 credentials.getAuthorized=async()=>{lookups++;return{token:'must-never-read'};};
 for(const [uid,status]of [['invalid',401],['outsider',403]]){
  const response=await request('/api/me',{uid});assert.equal(response.status,status);
 }
 assert.equal(lookups,0);
 api.family=()=>({requireMember:async()=>{throw new AccessError('membership-unavailable',503);}});
 assert.equal((await request('/api/me')).status,503);assert.equal(lookups,0);
 api.family=()=>({requireMember:async actor=>({...actor,role:'member'})});
 for(const code of ['not-invited','family-unavailable','viewer-identity-mismatch']){
  credentials.getAuthorized=async()=>{lookups++;throw new AccessError(code,403);};
  const response=await request('/api/me');assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{error:code});
 }
 assert.equal(lookups,3);
});

test('one real HTTP flow keeps profiles private, rewrites only scoped media, and revokes on takeover',async t=>{
 const {request,origin}=await fixture(t);
 const response=await request('/api/sessions',{method:'POST',input:{episodeId:'one-piece-0001',deviceId:'device-one'}});assert.equal(response.status,202);
 const created=await response.json(),id=created.lease.sessionId;
 assert.equal((await request(`/api/sessions/${id}`,{uid:'sister'})).status,409);
 const state=await(await request(`/api/sessions/${id}`)).text();assert.ok(!state.includes('fake-engine-secret'));assert.ok(!state.includes('fixture-private-token'));
 const delivery=await(await request(`/api/sessions/${id}/delivery`,{method:'POST',input:{}})).json();
 const repeated=await(await request(`/api/sessions/${id}/delivery`,{method:'POST',input:{}})).json();assert.deepEqual(repeated,delivery);
 const manifest=await(await fetch(delivery.mediaUrl)).text();assert.match(manifest,/^#EXTM3U/);const segment=manifest.split('\n')[1];assert.ok(segment.startsWith(`${origin}/m/`));assert.ok(!segment.includes('private='));
 assert.equal(await(await fetch(segment)).text(),'fixture-media-bytes');
 assert.equal((await fetch(delivery.mediaUrl.replace('one-piece-0001','one-piece-1001'))).status,404);
 assert.equal((await fetch(delivery.mediaUrl,{headers:{Authorization:'Bearer viewer'}})).status,400);
 await request('/api/sessions',{method:'POST',input:{episodeId:'one-piece-0001',deviceId:'device-two',takeover:true}});
 assert.equal((await fetch(segment)).status,404);
});

test('progress API uses inspected duration and acknowledges intentional rewind while rejecting old authority',async t=>{
 const {request,progress}=await fixture(t);
 const created=await(await request('/api/sessions',{method:'POST',input:{episodeId:'one-piece-0001',deviceId:'device-one'}})).json(),lease=created.lease;
 const send=(revision,positionSeconds,authorityEpoch=lease.authorityEpoch)=>request(`/api/sessions/${lease.sessionId}/events`,{method:'POST',input:{episodeId:'one-piece-0001',generation:lease.generation,authorityEpoch,revision,positionSeconds,durationSeconds:99999,reason:'seek'}});
 assert.equal((await send(1,900)).status,200);const rewind=await(await send(2,120)).json();assert.equal(rewind.progress.positionSeconds,120);assert.equal(rewind.progress.durationSeconds,1500);
 await progress.setDestination('viewer',lease.sessionId,'cast');assert.equal((await send(3,950)).status,409);
 assert.equal((await send(3,950,lease.authorityEpoch+1)).status,409);
});

test('destination handoff prepares the receiver profile before loading and returns to local copy with actual position',async t=>{
 const {api,request,media}=await fixture(t),changes=[];
 const change=media.switchEpisode;media.switchEpisode=async(...args)=>{changes.push(args[2]);return change(...args);};
 const created=await(await request('/api/sessions',{method:'POST',input:{episodeId:'one-piece-0001',deviceId:'device-one'}})).json(),id=created.lease.sessionId;
 const local=await(await request(`/api/sessions/${id}/delivery`,{method:'POST',input:{}})).json();
 let castDelivery;
 api.cast={load:async context=>{assert.equal(media.snapshot(id).playback.mode,'cast-h264');assert.equal(context.positionSeconds,623);castDelivery=context.episode;return{owned:true,receiverId:'fixture-tv',episodeId:'one-piece-0001',positionSeconds:623,state:'PLAYING'};},
  disconnect:async()=>({episodeId:'one-piece-0001',positionSeconds:647.25})};
 const casting=await request(`/api/sessions/${id}/cast`,{method:'POST',input:{receiverId:'fixture-tv',positionSeconds:623}});assert.equal(casting.status,200);
 assert.deepEqual(changes,[{explicitSelection:true,mode:'cast-h264',audioLanguage:'jpn'}]);
 assert.equal((await fetch(local.mediaUrl)).status,404);
 assert.equal((await fetch(castDelivery.mediaUrl)).status,200);
 const returned=await(await request(`/api/sessions/${id}/disconnect`,{method:'POST',input:{receiverId:'fixture-tv'}})).json();
 assert.equal(returned.positionSeconds,647.25);assert.equal(returned.lease.destination,'local');assert.equal(media.snapshot(id).playback.mode,'compatible-h264');
 assert.deepEqual(changes[1],{explicitSelection:true,mode:'compatible-h264',audioLanguage:'jpn'});
 assert.equal((await fetch(castDelivery.mediaUrl)).status,404);
});

test('failed receiver load restores local delivery without authorizing the old receiver ticket',async t=>{
 const {api,request,media}=await fixture(t);
 const created=await(await request('/api/sessions',{method:'POST',input:{episodeId:'one-piece-0001',deviceId:'device-one'}})).json(),id=created.lease.sessionId;
 let failedDelivery;api.cast={load:async context=>{failedDelivery=context.episode;throw new AccessError('cast-unavailable',503);}};
 assert.equal((await request(`/api/sessions/${id}/cast`,{method:'POST',input:{receiverId:'fixture-tv',positionSeconds:623}})).status,503);
 const state=await(await request(`/api/sessions/${id}`)).json();assert.equal(state.lease.destination,'local');assert.equal(media.snapshot(id).playback.mode,'compatible-h264');
 assert.equal((await fetch(failedDelivery.mediaUrl)).status,404);
 assert.equal((await request(`/api/sessions/${id}/delivery`,{method:'POST',input:{}})).status,200);
});

test('routine controls reuse only bounded positive membership, verify each identity and force admission checks',async t=>{
 const {api,request}=await fixture(t);let now=100000,membershipReads=0,identityChecks=0,blocked=false;
 const verify=api.identity.verify;api.identity.verify=async token=>{identityChecks++;return verify(token);};api.clock=()=>now;
 api.family=()=>({requireMember:async actor=>{membershipReads++;if(blocked)throw new AccessError('not-invited',403);return{...actor,role:'member'};}});
 assert.equal((await request('/api/progress')).status,200);assert.equal((await request('/api/progress')).status,200);
 assert.equal(membershipReads,1);assert.equal(identityChecks,2);
 assert.equal((await request('/api/progress',{uid:'sister'})).status,200);assert.equal(membershipReads,2);
 now+=59999;assert.equal((await request('/api/progress')).status,200);assert.equal(membershipReads,2);
 now++;blocked=true;assert.equal((await request('/api/progress')).status,403);assert.equal(membershipReads,3);
 blocked=false;assert.equal((await request('/api/progress')).status,200);assert.equal(membershipReads,4);
 blocked=true;assert.equal((await request('/api/sessions',{method:'POST',input:{episodeId:'one-piece-0001',deviceId:'device-one'}})).status,403);assert.equal(membershipReads,5);
 assert.equal((await request('/api/progress')).status,403);assert.equal(membershipReads,6);
 assert.equal((await request('/api/progress',{uid:'invalid'})).status,401);assert.equal(membershipReads,6);
});

test('a late membership grant cannot overwrite a newer denial',async t=>{
 const {api}=await fixture(t);let reads=0,releaseOld,markStarted;
 const started=new Promise(resolve=>{markStarted=resolve;}),held=new Promise(resolve=>{releaseOld=resolve;});
 api.family=()=>({requireMember:async actor=>{if(++reads===1){markStarted();await held;return{...actor,role:'member'};}throw new AccessError('not-invited',403);}});
 const req={headers:{authorization:'Bearer viewer'}},old=api.actor(req);await started;
 await assert.rejects(api.actor(req),error=>error.code==='not-invited');
 releaseOld();await assert.rejects(old,error=>error.code==='membership-unavailable');
 await assert.rejects(api.actor(req,{cached:true}),error=>error.code==='not-invited');
 assert.equal(reads,3);assert.equal(api.memberCache.size,0);assert.equal(api.memberChecks.size,0);
});

test('an older denial cannot invalidate a newer verified grant',async t=>{
 const {api}=await fixture(t);let reads=0,releaseOld,markStarted;
 const started=new Promise(resolve=>{markStarted=resolve;}),held=new Promise(resolve=>{releaseOld=resolve;});
 api.family=()=>({requireMember:async actor=>{if(++reads===1){markStarted();await held;throw new AccessError('not-invited',403);}return{...actor,role:'member'};}});
 const req={headers:{authorization:'Bearer viewer'}},old=api.actor(req);await started;
 assert.equal((await api.actor(req)).role,'member');releaseOld();await assert.rejects(old,error=>error.code==='not-invited');
 assert.equal((await api.actor(req,{cached:true})).role,'member');assert.equal(reads,2);
});

test('explicit Cast next checks fresh membership before preparing or commanding a queue',async t=>{
 const {api,request,progress}=await fixture(t);let blocked=false,reads=0,queued=0,commands=0;
 api.family=()=>({requireMember:async actor=>{reads++;if(blocked)throw new AccessError('not-invited',403);return{...actor,role:'member'};}});
 const created=await(await request('/api/sessions',{method:'POST',input:{episodeId:'one-piece-0001',deviceId:'device-one'}})).json(),id=created.lease.sessionId;
 await progress.setDestination('viewer',id,'cast');assert.equal((await request('/api/progress')).status,200);
 api.ensureQueue=async()=>{queued++;};api.cast.command=async()=>{commands++;return{};};
 const before=reads;blocked=true;
 assert.equal((await request(`/api/sessions/${id}/cast-command`,{method:'POST',input:{action:'next',receiverId:'fixture-tv'}})).status,403);
 assert.equal(reads,before+1);assert.equal(queued,0);assert.equal(commands,0);
 assert.equal((await request('/api/progress')).status,403);
});

test('self unpairing works after family denial and closes only the verified viewer session',async t=>{
 const {api,request,progress,credentials}=await fixture(t),revoked=[];
 credentials.revoke=async uid=>{revoked.push(uid);};
 const create=uid=>request('/api/sessions',{method:'POST',uid,input:{episodeId:'one-piece-0001',deviceId:`device-${uid}`}});
 const viewer=await(await create('viewer')).json(),sister=await(await create('sister')).json();
 const delivery=await(await request(`/api/sessions/${viewer.lease.sessionId}/delivery`,{method:'POST',input:{}})).json();
 let releaseOld,markStarted;const started=new Promise(resolve=>{markStarted=resolve;}),held=new Promise(resolve=>{releaseOld=resolve;});
 api.family=()=>({requireMember:async actor=>{markStarted();await held;return{...actor,role:'member'};}});
 const old=api.actor({headers:{authorization:'Bearer viewer'}});await started;
 api.family=()=>({requireMember:async()=>{throw new AccessError('not-invited',403);}});
 assert.equal((await request('/api/pair-viewer',{method:'DELETE'})).status,200);
 releaseOld();await assert.rejects(old,error=>error.code==='membership-unavailable');
 assert.deepEqual(revoked,['viewer']);assert.equal((await progress.snapshot('viewer')).lease,null);
 assert.equal((await progress.snapshot('sister')).lease.sessionId,sister.lease.sessionId);
 assert.equal((await fetch(delivery.mediaUrl)).status,404);assert.equal(api.memberCache.size,0);
 assert.equal((await request('/api/pair-viewer',{method:'DELETE',uid:'invalid'})).status,401);
 assert.equal((await request('/api/pair-viewer',{method:'DELETE',input:{uid:'sister'}})).status,400);
 assert.deepEqual(revoked,['viewer']);
 api.family=()=>({requireMember:async()=>{throw new AccessError('family-unavailable',503);}});
 assert.equal((await request('/api/pair-viewer',{method:'DELETE'})).status,200);
});

test('delivery uses an explicit validated media MIME and never guesses from its opaque URL',async t=>{
 const {api,media,request}=await fixture(t);
 const created=await(await request('/api/sessions',{method:'POST',input:{episodeId:'one-piece-0001',deviceId:'device-one'}})).json(),id=created.lease.sessionId;
 const deliver=()=>request(`/api/sessions/${id}/delivery`,{method:'POST',input:{}});
 assert.equal((await(await deliver()).json()).contentType,'application/vnd.apple.mpegurl');
 // Metadata fixture only: this does not claim the mock bytes are an MP4.
 media.snapshot(id).playback.contentType='video/mp4';
 assert.equal((await(await deliver()).json()).contentType,'video/mp4');
 const count=api.deliveries.size;media.snapshot(id).playback.contentType='application/octet-stream';
 assert.equal((await deliver()).status,503);assert.equal(api.deliveries.size,count);
 delete media.snapshot(id).playback.contentType;assert.equal((await deliver()).status,503);
});
