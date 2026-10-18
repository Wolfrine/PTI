import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { AccessError } from './auth.mjs';
import { decodeResource } from './tickets.mjs';

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const EPISODE = /^one-piece-\d{4}$/;
const ACTIONS = new Set(['pause','play','seek','volume','subtitles','next']);
const fail = (code, status = 409) => { throw new AccessError(code, status); };
const privateIp = host => isIP(host) === 4 && (() => { const [a,b] = host.split('.').map(Number); return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168); })();

export function castMediaOrigin(value, { allowHttpMedia = false } = {}) {
  let url; try { url = new URL(value); } catch { fail('cast-media-origin',400); }
  if (!(url.hostname.endsWith('.local') || privateIp(url.hostname)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail('cast-media-origin',400);
  if (url.protocol !== 'https:' && !(allowHttpMedia && url.protocol === 'http:')) fail('cast-http-media-disabled',400);
  return url.origin;
}

export function parseCastMediaUrl(value, { mediaOrigins, allowHttpMedia = false, episodeId } = {}) {
  if (typeof value !== 'string' || value.length > 18000) fail('cast-media-url',400);
  let url; try { url = new URL(value); } catch { fail('cast-media-url',400); }
  const origin = castMediaOrigin(url.origin, { allowHttpMedia });
  if (!mediaOrigins.includes(origin) || url.username || url.password || url.search || url.hash) fail('cast-media-url',400);
  const match = /^\/m\/([A-Za-z0-9_-]{32})\/(one-piece-\d{4})\/([A-Za-z0-9_-]{1,11000})$/.exec(url.pathname);
  if (!match || match[2] !== episodeId) fail('cast-media-url',400);
  return { token:match[1], episodeId:match[2], resource:decodeResource(match[3]) };
}

/** Private stdin/stdout IPC: never logs child output, payloads, or raw errors. */
export class CastPythonTransport {
  constructor({ pythonExecutable = 'python', toolsPath = 'H:/PTI-OnePiece/pilot/tools/python', mediaOrigins, allowHttpMedia = false, spawnImpl = spawn, timeoutMs = 35_000 } = {}) {
    Object.assign(this,{pythonExecutable,toolsPath,mediaOrigins,allowHttpMedia,spawnImpl,timeoutMs});
    this.child = null; this.pending = new Map(); this.buffer = ''; this.stopping = false;
  }
  start() {
    if (this.child) return;
    if (this.stopping) fail('cast-unavailable',503);
    const inherited = Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','LOCALAPPDATA','APPDATA'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
    const child = this.spawnImpl(this.pythonExecutable,[fileURLToPath(new URL('./cast-bridge.py',import.meta.url)),'--tools',this.toolsPath],{
      windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...inherited,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1',ONE_PIECE_CAST_CONFIG:JSON.stringify({mediaOrigins:this.mediaOrigins,allowHttpMedia:this.allowHttpMedia})}
    });
    this.child = child; this.buffer = '';
    const lost = () => { if(this.child!==child)return;this.child=null;for(const {reject,timer}of this.pending.values()){clearTimeout(timer);reject(new AccessError('cast-unavailable',503));}this.pending.clear(); };
    child.on('error',lost);child.on('exit',lost);child.stdin.on('error',lost);
    child.stderr.on('data',()=>{}); // Library diagnostics may contain URLs: discard.
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      if(this.child!==child)return;
      this.buffer+=chunk;
      if(Buffer.byteLength(this.buffer)>262144){child.kill();lost();return;}
      let newline;
      while((newline=this.buffer.indexOf('\n'))>=0){
        const line=this.buffer.slice(0,newline);this.buffer=this.buffer.slice(newline+1);
        let response;try{response=JSON.parse(line);}catch{child.kill();lost();return;}
        const request=this.pending.get(response.id);if(!request)continue;
        this.pending.delete(response.id);clearTimeout(request.timer);
        if(response.ok===true)request.resolve(response.result);
        else {const code=/^cast-[a-z-]{1,60}$/.test(response.error??'')?response.error:'cast-unavailable';request.reject(new AccessError(code,code==='cast-unavailable'?503:409));}
      }
    });
  }
  request(command,payload={}) {
    this.start();const child=this.child,id=randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new AccessError('cast-timeout',504));child.kill();},this.timeoutMs);timer.unref?.();
      this.pending.set(id,{resolve,reject,timer});
      const line=JSON.stringify({id,command,...payload})+'\n';
      if(Buffer.byteLength(line)>131072){clearTimeout(timer);this.pending.delete(id);reject(new AccessError('cast-message-limit',400));return;}
      child.stdin.write(line,error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(new AccessError('cast-unavailable',503));}});
    });
  }
  close(){this.stopping=true;this.child?.stdin.end();this.child?.kill();for(const {reject,timer}of this.pending.values()){clearTimeout(timer);reject(new AccessError('cast-unavailable',503));}this.pending.clear();this.child=null;}
}

/** Receiver state is authoritative. Call only behind authenticated HTTPS routes. */
export class CastBridge {
  constructor({progressStore,tickets,mediaOrigins,allowHttpMedia=false,transport,pythonExecutable,toolsPath,pollMs=2000,clock=()=>Date.now(),onState=()=>{},onEpisodeChanged=()=>{},onDisplaced=()=>{}}={}) {
    if(!progressStore?.snapshot||!progressStore?.record||!tickets?.authorize||!Array.isArray(mediaOrigins)||!mediaOrigins.length)throw new Error('Cast requires progress, ticket authorization, and explicit media origins');
    this.origins=mediaOrigins.map(origin=>castMediaOrigin(origin,{allowHttpMedia}));this.allowHttpMedia=allowHttpMedia;
    Object.assign(this,{progressStore,tickets,clock,onState,onEpisodeChanged,onDisplaced});
    this.transport=transport??new CastPythonTransport({pythonExecutable,toolsPath,mediaOrigins:this.origins,allowHttpMedia});
    this.bindings=new Map();this.locks=new Map();this.closed=false;this.polling=false;
    if(pollMs>0){this.timer=setInterval(()=>this.poll().catch(()=>{}),Math.max(250,pollMs));this.timer.unref?.();}
  }
  context(value) {
    if(!value||typeof value.uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value.uid)||typeof value.sessionId!=='string'||!/^[A-Za-z0-9_-]{1,96}$/.test(value.sessionId)||!Number.isSafeInteger(value.generation)||value.generation<1||!Number.isSafeInteger(value.authorityEpoch)||value.authorityEpoch<1)fail('cast-context',400);
    return Object.fromEntries(['uid','sessionId','generation','authorityEpoch'].map(key=>[key,value[key]]));
  }
  receiver(value){if(typeof value!=='string'||!UUID.test(value))fail('cast-receiver-id',400);return value;}
  async lease(context){const snapshot=await this.progressStore.snapshot(context.uid),lease=snapshot.lease;if(!lease||lease.sessionId!==context.sessionId||lease.generation!==context.generation||lease.authorityEpoch!==context.authorityEpoch||lease.destination!=='cast'||!Number.isFinite(lease.expiresAt)||lease.expiresAt<=this.clock())fail('cast-stale-authority');return lease;}
  async locked(receiverId,action){const previous=this.locks.get(receiverId)??Promise.resolve();const next=previous.catch(()=>{}).then(action);this.locks.set(receiverId,next);try{return await next;}finally{if(this.locks.get(receiverId)===next)this.locks.delete(receiverId);}}
  episode(value,context){
    if(!value||!EPISODE.test(value.episodeId??'')||!Number.isFinite(value.durationSeconds)||value.durationSeconds<1||value.durationSeconds>14400||!['video/mp4','application/vnd.apple.mpegurl','application/x-mpegurl'].includes(value.contentType))fail('cast-episode',400);
    this.progressStore.episode?.(value.episodeId);
    for(const url of [value.mediaUrl,value.subtitleUrl]){
      const parsed=parseCastMediaUrl(url,{mediaOrigins:this.origins,allowHttpMedia:this.allowHttpMedia,episodeId:value.episodeId});
      const entry=this.tickets.authorize(parsed.token,parsed.episodeId,parsed.resource);
      if(entry.uid!==context.uid||entry.sessionId!==context.sessionId||entry.generation!==context.generation||entry.authorityEpoch!==context.authorityEpoch||entry.destination!=='cast')fail('cast-media-delegation',403);
    }
    return {episodeId:value.episodeId,mediaUrl:value.mediaUrl,subtitleUrl:value.subtitleUrl,contentType:value.contentType,durationSeconds:value.durationSeconds,mediaUid:randomUUID()};
  }
  binding(context,receiverId){const binding=this.bindings.get(receiverId);if(!binding||Object.keys(context).some(key=>binding.context[key]!==context[key]))fail('cast-ownership-lost');return binding;}
  safeState(state,binding){
    const episode=binding.episodes.get(state?.mediaUid);
    if(state?.receiverId!==binding.receiverId||state.owned!==true||!episode||state.episodeId!==episode.episodeId||!['PLAYING','PAUSED','BUFFERING','IDLE'].includes(state.state)||!Number.isFinite(state.positionSeconds)||state.positionSeconds<0||state.positionSeconds>episode.durationSeconds+1)fail('cast-ownership-lost');
    return {receiverId:binding.receiverId,owned:true,episodeId:episode.episodeId,state:state.state,positionSeconds:state.state==='IDLE'&&state.idleReason==='FINISHED'?episode.durationSeconds:Math.min(state.positionSeconds,episode.durationSeconds),durationSeconds:episode.durationSeconds,subtitleEnabled:state.subtitleEnabled===true,volume:Number.isFinite(state.volume)?Math.max(0,Math.min(1,state.volume)):null,muted:state.muted===true,idleReason:['FINISHED','ERROR','CANCELLED','INTERRUPTED'].includes(state.idleReason)?state.idleReason:null};
  }
  async observe(raw,binding,reason='heartbeat'){
    await this.lease(binding.context);
    const state=this.safeState(raw,binding),previous=binding.last;
    if(previous?.episodeId!==state.episodeId){
      binding.queuedEpisodeId=null;
      for(const mediaUid of binding.episodes.keys())if(mediaUid!==raw.mediaUid)binding.episodes.delete(mediaUid);
      await this.onEpisodeChanged({...binding.context,receiverId:binding.receiverId},state.episodeId);
      await this.lease(binding.context);
    }
    const lease=await this.lease(binding.context);
    const eventReason=state.state==='IDLE'&&state.idleReason==='FINISHED'?'ended':previous&&previous.episodeId!==state.episodeId?'transition':reason;
    await this.progressStore.record(binding.context.uid,binding.context.sessionId,{episodeId:state.episodeId,positionSeconds:state.positionSeconds,generation:binding.context.generation,authorityEpoch:binding.context.authorityEpoch,revision:lease.revision+1,reason:eventReason},{durationSeconds:state.durationSeconds,authority:'receiver'});
    binding.last=state;binding.lastObservedAt=this.clock();
    await Promise.resolve().then(()=>this.onState({...binding.context,receiverId:binding.receiverId},structuredClone(state))).catch(()=>{});
    return state;
  }
  async discover(){if(this.closed)fail('cast-unavailable',503);const devices=await this.transport.request('discover');if(!Array.isArray(devices))fail('cast-invalid-response',503);return devices.filter(value=>UUID.test(value.receiverId??'')).map(value=>({receiverId:value.receiverId,name:String(value.name??'Google Cast TV').slice(0,100),model:String(value.model??'').slice(0,100),owned:value.owned===true,busy:value.busy===true,available:value.available!==false}));}
  async load(input){
    const context=this.context(input),receiverId=this.receiver(input.receiverId);
    return this.locked(receiverId,async()=>{
      await this.lease(context);
      for(const binding of this.bindings.values())if(binding.context.sessionId===context.sessionId&&binding.receiverId!==receiverId)fail('cast-already-connected');
      const old=this.bindings.get(receiverId);
      if(old&&old.context.uid!==context.uid&&input.takeover!==true)fail('cast-tv-busy');
      const episode=this.episode(input.episode,context),position=input.positionSeconds??0;
      if(!Number.isFinite(position)||position<0||position>episode.durationSeconds)fail('cast-seek',400);
      const binding={context,receiverId,episodes:new Map([[episode.mediaUid,episode]]),last:null,queuedEpisodeId:null};
      let raw;
      try{
        raw=await this.transport.request('load',{context,receiverId,episode,positionSeconds:position,takeover:input.takeover===true});
        await this.lease(context); // A delayed load cannot resurrect an old writer.
        if(old&&old.context.sessionId!==context.sessionId){this.tickets.revokeSession?.(old.context.sessionId);await this.onDisplaced({...old.context,receiverId});}
        this.bindings.set(receiverId,binding);
        return await this.observe(raw,binding,'heartbeat');
      }catch(error){
        await this.transport.request('disconnect',{context,receiverId}).catch(()=>{});
        if(this.bindings.get(receiverId)===binding)this.bindings.delete(receiverId);
        throw error instanceof AccessError?error:new AccessError('cast-unavailable',503);
      }
    });
  }
  async queue(input,{episodes}={}){
    const context=this.context(input),receiverId=this.receiver(input.receiverId);
    return this.locked(receiverId,async()=>{
      await this.lease(context);const binding=this.binding(context,receiverId);
      if(!Array.isArray(episodes)||episodes.length!==1)fail('cast-next-episode',400);
      const episode=this.episode(episodes[0],context),current=binding.last?.episodeId;
      if(!current||Number(episode.episodeId.slice(-4))!==Number(current.slice(-4))+1)fail('cast-next-episode',400);
      if(binding.queuedEpisodeId===episode.episodeId)return {...binding.last,queuedEpisodeId:episode.episodeId};
      if(binding.queuedEpisodeId)fail('cast-queue-already-admitted');
      const raw=await this.transport.request('queue',{context,receiverId,episode});await this.lease(context);
      binding.episodes.set(episode.mediaUid,episode);binding.queuedEpisodeId=episode.episodeId;
      const state=await this.observe(raw,binding);return {...state,queuedEpisodeId:episode.episodeId};
    });
  }
  async command(input,{action,value}={}){
    const context=this.context(input),receiverId=this.receiver(input.receiverId);
    if(!ACTIONS.has(action))fail('cast-command',400);
    return this.locked(receiverId,async()=>{
      await this.lease(context);const binding=this.binding(context,receiverId);
      if(action==='seek'&&(!Number.isFinite(value)||value<0||value>=binding.last.durationSeconds))fail('cast-seek',400);
      if(action==='volume'&&(!Number.isFinite(value)||value<0||value>1))fail('cast-volume',400);
      if(action==='subtitles'&&typeof value!=='boolean')fail('cast-subtitles',400);
      if(action==='next'&&!binding.queuedEpisodeId)fail('cast-next-not-ready');
      const raw=await this.transport.request(action,{context,receiverId,...(value!==undefined?{value}:{})});
      return this.observe(raw,binding,action==='seek'?'seek':action==='pause'?'pause':'heartbeat');
    });
  }
  async status(input){const context=this.context(input),receiverId=this.receiver(input.receiverId);return this.locked(receiverId,async()=>{await this.lease(context);const binding=this.binding(context,receiverId);return this.observe(await this.transport.request('status',{context,receiverId}),binding);});}
  async disconnect(input){const context=this.context(input),receiverId=this.receiver(input.receiverId);return this.locked(receiverId,async()=>{
    await this.lease(context);const binding=this.binding(context,receiverId);
    const actual=await this.observe(await this.transport.request('status',{context,receiverId}),binding,'pause');
    await this.transport.request('disconnect',{context,receiverId});this.bindings.delete(receiverId);
    return {...actual,disconnected:true};
  });}
  async revokeSession(sessionId){for(const binding of [...this.bindings.values()])if(binding.context.sessionId===sessionId){if(this.bindings.get(binding.receiverId)===binding)this.bindings.delete(binding.receiverId);await this.transport.request('disconnect',{context:binding.context,receiverId:binding.receiverId}).catch(()=>{});}}
  async poll(){if(this.closed||this.polling)return;this.polling=true;try{for(const binding of [...this.bindings.values()]){
    try{await this.status({...binding.context,receiverId:binding.receiverId});}
    catch(error){if(['cast-ownership-lost','cast-stale-authority','session-replaced-or-expired'].includes(error.code)&&this.bindings.get(binding.receiverId)===binding){this.bindings.delete(binding.receiverId);if(error.code==='cast-ownership-lost'){try{await this.lease(binding.context);this.tickets.revokeSession?.(binding.context.sessionId);}catch{}}await this.onState({...binding.context,receiverId:binding.receiverId},{receiverId:binding.receiverId,owned:false,state:'DISCONNECTED',error:error.code});}}
  }}finally{this.polling=false;}}
  async close(){if(this.closed)return;this.closed=true;clearInterval(this.timer);for(const binding of [...this.bindings.values()])await this.revokeSession(binding.context.sessionId);this.transport.close();}
}
