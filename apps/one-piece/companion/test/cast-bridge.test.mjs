import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CastBridge,castMediaOrigin,parseCastMediaUrl } from '../src/cast.mjs';
import { ProgressStore } from '../src/progress.mjs';
import { TicketStore,mediaUrl } from '../src/tickets.mjs';
import { AccessError } from '../src/auth.mjs';

const receiverId='7bca3240-e383-4cb0-a18b-24eaa6aa1591';
const origin='https://onepiece.local:8796';
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
class ReceiverFixture {
  constructor(){this.calls=[];this.current=null;this.context=null;this.queued=null;this.owned=true;this.closed=false;this.busy=false;}
  state(){return {receiverId,owned:this.owned,mediaUid:this.current?.mediaUid,episodeId:this.current?.episodeId,state:this.playerState??'PLAYING',positionSeconds:this.position??0,durationSeconds:999999,subtitleEnabled:this.subtitles!==false,volume:0.4,muted:false,idleReason:this.idleReason??null};}
  async request(command,data={}){
    this.calls.push({command,context:data.context,mediaUid:data.episode?.mediaUid});
    if(command==='discover')return [{receiverId,name:'Fixture TV',model:'Fixture',busy:this.busy,owned:!!this.current}];
    if(command==='load'){
      if(this.busy&&!data.takeover)throw new AccessError('cast-tv-busy',409);
      this.current=data.episode;this.context=data.context;this.position=data.positionSeconds;this.owned=true;
      if(this.loadGate)await this.loadGate.promise;
      return this.state();
    }
    if(command==='disconnect'){
      if(!this.owned||JSON.stringify(this.context)!==JSON.stringify(data.context))throw new AccessError('cast-ownership-lost',409);
      const result=this.state();this.current=null;this.context=null;return {...result,disconnected:true};
    }
    if(command==='status'){if(this.statusGate)await this.statusGate.promise;return this.state();}
    if(command==='queue'){this.queued=data.episode;return {...this.state(),queuedEpisodeId:data.episode.episodeId};}
    if(command==='next'){this.current=this.queued;this.queued=null;this.position=0;}
    if(command==='seek')this.position=data.value;
    if(command==='pause')this.playerState='PAUSED';
    if(command==='play')this.playerState='PLAYING';
    if(command==='subtitles')this.subtitles=data.value;
    return this.state();
  }
  close(){this.closed=true;}
}
async function fixture(t,options={}){
  const root=await mkdtemp(path.join(os.tmpdir(),'op-cast-'));
  const catalog={episodes:[1,2,589,590,591,1000,1001,1085].map(episodeNumber=>({episodeNumber,availability:episodeNumber===590?'missing':'listed'}))};
  const progressStore=new ProgressStore({root,catalog}),tickets=new TicketStore(),transport=new ReceiverFixture();
  const lease=await progressStore.claim({uid:'viewer',deviceId:'device-one',destination:'cast'});
  const input={uid:'viewer',sessionId:lease.sessionId,generation:lease.generation,authorityEpoch:lease.authorityEpoch,receiverId};
  const changed=[],states=[];
  const bridge=new CastBridge({progressStore,tickets,transport,mediaOrigins:[origin],pollMs:0,onEpisodeChanged:(_context,episode)=>changed.push(episode),onState:(_context,state)=>states.push(state),...options});
  t.after(async()=>{await bridge.close();assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('op-cast-'));await rm(root,{recursive:true,force:true});});
  const episode=(number=1,context=input,destination='cast')=>{
    const episodeId=`one-piece-${String(number).padStart(4,'0')}`,resources=[`/Videos/item${number}/master.m3u8`,`/Videos/item${number}/Subtitles/4/0/Stream.vtt`];
    const {token}=tickets.mint({...context,uid:context.uid,episodeId,destination,resources});
    return {episodeId,mediaUrl:mediaUrl(origin,token,episodeId,resources[0]),subtitleUrl:mediaUrl(origin,token,episodeId,resources[1]),contentType:'application/vnd.apple.mpegurl',durationSeconds:1500};
  };
  return {bridge,input,transport,progressStore,tickets,episode,changed,states};
}

test('only configured local/private origins and canonical scoped capability paths are accepted',()=>{
  assert.equal(castMediaOrigin(origin),origin);
  assert.equal(castMediaOrigin('https://192.168.68.105:8796'),'https://192.168.68.105:8796');
  for(const value of ['https://example.com','https://onepiece.local.evil.test','https://127.0.0.1','https://user:password@onepiece.local','https://onepiece.local/path','http://onepiece.local'])assert.throws(()=>castMediaOrigin(value),AccessError);
  assert.equal(castMediaOrigin('http://onepiece.local:8795',{allowHttpMedia:true}),'http://onepiece.local:8795');
  const resource=Buffer.from('/Videos/item/master.m3u8').toString('base64url'),token='A'.repeat(32),value=`${origin}/m/${token}/one-piece-0001/${resource}`;
  assert.deepEqual(parseCastMediaUrl(value,{mediaOrigins:[origin],episodeId:'one-piece-0001'}),{token,episodeId:'one-piece-0001',resource:'/Videos/item/master.m3u8'});
  for(const invalid of [value+'?admin=1',value+'#token',value.replace(token,'short'),value.replace('0001','0002'),value.replace(resource,'YQ'),value.replace(origin,'https://other.local')])assert.throws(()=>parseCastMediaUrl(invalid,{mediaOrigins:[origin],episodeId:'one-piece-0001'}),AccessError);
});

test('profile, generation, epoch, and cast ticket destination are verified before a TV load',async t=>{
  const f=await fixture(t);
  for(const bad of [{...f.input,uid:'sister'},{...f.input,generation:2},{...f.input,authorityEpoch:2}])await assert.rejects(f.bridge.load({...f.input,episode:f.episode(1,bad)}),{code:'cast-media-delegation'});
  await assert.rejects(f.bridge.load({...f.input,episode:f.episode(1,f.input,'local')}),{code:'cast-media-delegation'});
  assert.equal(f.transport.calls.filter(x=>x.command==='load').length,0);
  await assert.rejects(f.bridge.load({...f.input,receiverId:'192.168.68.103',episode:f.episode()}),{code:'cast-receiver-id'});
});

test('receiver positions are authoritative and an acknowledged rewind replaces later position',async t=>{
  const f=await fixture(t);
  await f.bridge.load({...f.input,episode:f.episode(),positionSeconds:600});
  await f.bridge.command(f.input,{action:'seek',value:100});
  const saved=(await f.progressStore.snapshot('viewer')).progress['one-piece-0001'];
  assert.equal(saved.positionSeconds,100);assert.equal(saved.reason,'seek');assert.equal(saved.durationSeconds,1500);
  assert.equal((await f.bridge.status({...f.input,positionSeconds:1400})).positionSeconds,100);
  assert.equal(f.transport.calls.some(x=>x.command==='volume'),false);
  assert.ok(!JSON.stringify(f.states).includes('/m/'));
});

test('a load completing after handoff cannot restore receiver authority or write progress',async t=>{
  const f=await fixture(t);f.transport.loadGate=defer();
  const pending=f.bridge.load({...f.input,episode:f.episode(),positionSeconds:600});
  while(!f.transport.current)await new Promise(resolve=>setImmediate(resolve));
  await f.progressStore.setDestination('viewer',f.input.sessionId,'local');
  f.transport.loadGate.resolve();await assert.rejects(pending,{code:'cast-stale-authority'});
  assert.deepEqual((await f.progressStore.snapshot('viewer')).progress,{});
  assert.equal(f.bridge.bindings.size,0);assert.equal(f.transport.current,null);
});

test('a late old receiver poll cannot revoke new local handoff capabilities',async t=>{
  const f=await fixture(t);await f.bridge.load({...f.input,episode:f.episode()});
  f.transport.statusGate=defer();const pending=f.bridge.poll();
  while(!f.transport.calls.some(x=>x.command==='status'))await new Promise(resolve=>setImmediate(resolve));
  const local=await f.progressStore.setDestination('viewer',f.input.sessionId,'local');
  const resource='/Videos/local/master.m3u8';const minted=f.tickets.mint({...local,uid:'viewer',episodeId:'one-piece-0001',destination:'local',resources:[resource]});
  f.transport.statusGate.resolve();await pending;
  assert.equal(f.tickets.authorize(minted.token,'one-piece-0001',resource).authorityEpoch,local.authorityEpoch);
  assert.equal(f.bridge.bindings.size,0);
});

test('unrelated TV playback is preserved unless takeover is explicit',async t=>{
  const f=await fixture(t);f.transport.busy=true;f.transport.owned=false;
  await assert.rejects(f.bridge.load({...f.input,episode:f.episode()}),{code:'cast-tv-busy'});
  assert.equal(f.transport.current,null);assert.equal(f.transport.busy,true);
  await f.bridge.load({...f.input,episode:f.episode(),takeover:true});
  assert.equal(f.bridge.bindings.size,1);
});

test('one consecutive queued episode maps actual transition to the right progress record',async t=>{
  const f=await fixture(t);await f.bridge.load({...f.input,episode:f.episode()});
  await assert.rejects(f.bridge.queue(f.input,{episodes:[f.episode(1001)]}),{code:'cast-next-episode'});
  await f.bridge.queue(f.input,{episodes:[f.episode(2)]});
  const state=await f.bridge.command(f.input,{action:'next'});
  assert.equal(state.episodeId,'one-piece-0002');assert.equal(state.positionSeconds,0);
  assert.deepEqual(f.changed,['one-piece-0001','one-piece-0002']);
  assert.equal((await f.progressStore.snapshot('viewer')).progress['one-piece-0002'].authorityEpoch,f.input.authorityEpoch);
  await assert.rejects(f.bridge.queue(f.input,{episodes:[f.episode(590)]}),{code:'episode-missing'});
});

test('actual foreign ownership drops control and natural end maps receiver zero time to duration',async t=>{
  const f=await fixture(t);await f.bridge.load({...f.input,episode:f.episode()});
  f.transport.playerState='IDLE';f.transport.idleReason='FINISHED';f.transport.position=0;
  const ended=await f.bridge.status(f.input);assert.equal(ended.positionSeconds,1500);
  assert.equal((await f.progressStore.snapshot('viewer')).progress['one-piece-0001'].watched,true);
  f.transport.owned=false;await f.bridge.poll();assert.equal(f.bridge.bindings.size,0);
  await assert.rejects(f.bridge.command(f.input,{action:'pause'}),{code:'cast-ownership-lost'});
});

test('revocation callback does not wait on the lock held by an in-flight receiver poll',async t=>{
  const f=await fixture(t);await f.bridge.load({...f.input,episode:f.episode()});
  f.transport.statusGate=defer();const pending=f.bridge.status(f.input);
  while(!f.transport.calls.some(x=>x.command==='status'))await new Promise(resolve=>setImmediate(resolve));
  f.progressStore.onAuthorityChange=sessionId=>f.bridge.revokeSession(sessionId);
  const handoff=f.progressStore.setDestination('viewer',f.input.sessionId,'local');
  await Promise.race([handoff,new Promise((_,reject)=>setTimeout(()=>reject(new Error('revocation deadlock')),1000))]);
  f.transport.statusGate.resolve();await assert.rejects(pending,{code:'cast-stale-authority'});
  assert.equal(f.bridge.bindings.size,0);
});
