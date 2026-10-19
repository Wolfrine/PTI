import { timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AccessError, bearerToken } from './auth.mjs';
import { decodeResource, mediaUrl } from './tickets.mjs';
import { rewriteManifest } from './media/index.mjs';
import { canonicalEpisodeId } from './sources/archive.mjs';
import { emitDiagnostic } from './diagnostics.mjs';

const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
const safeSecret=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const loopback=value=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(value);
const mediaTypes=new Set(['application/vnd.apple.mpegurl','application/x-mpegurl','video/mp4']);
const mediaResourceKind=resource=>/\.(?:vtt|srt)(?:\?|$)/i.test(resource)?'subtitle':/\.m3u8(?:\?|$)/i.test(resource)?'manifest':/\.(?:mp4|ts|m4s)(?:\?|$)/i.test(resource)?'video':'other';
const publicLease=lease=>lease&&Object.fromEntries(['sessionId','deviceId','destination','generation','authorityEpoch','revision','expiresAt','updatedAt'].map(k=>[k,lease[k]]));
async function body(req,limit=32768){
 if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new AccessError('json-required',415);
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new AccessError('request-too-large',413);chunks.push(chunk);}
 try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value;}catch{throw new AccessError('invalid-json',400);}
}
const routeError=(res,error)=>{
 if(res.headersSent){res.destroy();return;}
 const code=typeof error.code==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(error.code)?error.code:'companion-unavailable';
 const detail=code==='active-session'&&error.detail?{destination:error.detail.destination,updatedAt:error.detail.updatedAt,generation:error.detail.generation}:undefined;
 json(res,Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:503,{error:code,...(detail?{detail}:{})});
};

/** HTTP transport is an adapter; all identity, episode and authority decisions stay on the PC. */
export class CompanionApi {
 constructor({identity,binding,family,credentials,cloud,media,progress,tickets,cast,config,onPair=async()=>{},onDiagnostic=()=>{},clock=()=>Date.now(),streamCheckMs=1000}={}){
  if(!Number.isInteger(streamCheckMs)||streamCheckMs<5||streamCheckMs>1000)throw new Error('Invalid stream authorization interval');
  Object.assign(this,{identity,binding,family,credentials,cloud,media,progress,tickets,cast,config,onPair,onDiagnostic,clock});this.memberCache=new Map();this.memberChecks=new Map();
  this.states=new Map();this.locks=new Map();this.mediaChecks=new Map();this.castStates=new Map();this.queueRecords=new Map();this.deliveries=new Map();this.autoplay=new Map();this.closed=false;
  this.activeStreams=new Set();this.streamCheckMs=streamCheckMs;
 }
 async locked(uid,action){const prior=this.locks.get(uid)??Promise.resolve();const next=prior.catch(()=>{}).then(action);this.locks.set(uid,next);try{return await next;}finally{if(this.locks.get(uid)===next)this.locks.delete(uid);}}
 gateway(req,res){
  if(!loopback(req.socket.remoteAddress)||!safeSecret(req.headers['x-onepiece-proxy'],this.config.proxySecret)||req.headers['x-forwarded-proto']!=='https')throw new AccessError('https-proxy-required',403);
  const origin=req.headers.origin;
  if(!this.config.allowedOrigins.includes(origin))throw new AccessError('origin-denied',403);
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');
  if(req.headers['access-control-request-private-network']==='true')res.setHeader('Access-Control-Allow-Private-Network','true');
 }
 async actor(req,{setup=false,cached=false}={}){
  const identity=await this.identity.verify(bearerToken(req.headers));
  if(!this.binding.ownerUid)throw new AccessError('companion-setup-required',409);
  const key=JSON.stringify([this.binding.ownerUid,identity.uid,identity.email]),now=this.clock(),prior=this.memberCache.get(key);
  // Signature/expiry is still verified on every request. Only positive family
  // membership for routine controls is reused, within the approved 60s window.
  if(!setup&&cached&&prior&&now>=prior.checkedAt&&now-prior.checkedAt<60000)return{...identity,role:prior.role};
  // A later fresh decision supersedes an in-flight read. Unique tokens avoid an
  // older response restoring a grant after a denial, including after map eviction.
  const check={};
  if(this.memberChecks.size>=64&&!this.memberChecks.has(key))this.memberChecks.delete(this.memberChecks.keys().next().value);
  this.memberChecks.set(key,check);
  let actor;
  try{actor=await this.family().requireMember(identity,setup?{allowPending:true,allowOwnerSetup:true,allowAccessRequest:true}:{});}
  catch(error){if(this.memberChecks.get(key)===check){this.memberChecks.delete(key);this.memberCache.delete(key);}throw error;}
  if(this.memberChecks.get(key)!==check)throw new AccessError('membership-unavailable',503);
  this.memberChecks.delete(key);
  if(!setup&&['owner','member'].includes(actor.role)){
   if(this.memberCache.size>=32&&!this.memberCache.has(key))this.memberCache.delete(this.memberCache.keys().next().value);
   this.memberCache.set(key,{role:actor.role,checkedAt:now});
  }
  // A setup read that observes revoked/paused/pending access supersedes a prior
  // positive routine-control cache entry, just as a hard admission denial does.
  if(actor.needsApproval===true||actor.needsWorkspace===true||actor.needsClaim===true||!['owner','member'].includes(actor.role))this.memberCache.delete(key);
  return actor;
 }
 invalidateMember(uid){
  for(const entries of [this.memberCache,this.memberChecks])for(const key of entries.keys()){
   const [owner,viewer]=JSON.parse(key);if(owner===this.binding.ownerUid&&viewer===uid)entries.delete(key);
  }
 }
 async playbackAccess(actor){
  // Setup metadata admits pending accounts, but must never probe their retained
  // credentials. The status is account-scoped, so another device reuses a valid
  // PC connection without another Google confirmation.
  if(actor.needsWorkspace===true||actor.needsClaim===true||actor.needsApproval===true||!['owner','member'].includes(actor.role))return{state:'unavailable',code:'account-setup-required'};
  try{await this.credentials().getAuthorized(actor.uid);return{state:'ready'};}
  catch(error){
   // A fresh credential check can detect a membership change after actor(). Do
   // not turn that denial into a successful account-status response.
   if(error?.status===403)throw error;
   if(error?.status===401&&['viewer-not-paired','viewer-reauthentication-required'].includes(error.code))return{state:'confirmation-required',code:error.code};
   // Storage/provider outages are not evidence that Google reconnection helps.
   // Only public error codes leave the server, never retained identity fields.
   const code=error?.code==='viewer-identity-unavailable'?'viewer-identity-unavailable':'viewer-credential-unavailable';
   return{state:'unavailable',code};
  }
 }
 async lease(uid,id){const snapshot=await this.progress.snapshot(uid);const lease=snapshot.lease;if(!lease||lease.sessionId!==id||lease.expiresAt<=Date.now())throw new AccessError('session-replaced-or-expired',409);return lease;}
 safeState(id){
  const raw=this.media.snapshot(id);if(!raw)return this.states.get(id)?.error?{sessionId:id,state:'error',error:this.states.get(id).error}:null;
  const playback=raw.playback;
  return {sessionId:id,episodeNumber:raw.episodeNumber,episodeId:canonicalEpisodeId(raw.episodeNumber),state:raw.state,progress:raw.progress,next:raw.next,error:raw.error?{code:raw.error.code}:this.states.get(id)?.error??null,
    playback:playback?{durationSeconds:playback.durationSeconds,mode:playback.mode,selected:playback.selected,tracks:playback.tracks}:null};
 }
 async delegation(actor,id,destination){
  const lease=await this.lease(actor.uid,id);if(lease.destination!==destination)throw new AccessError('destination-changed',409);
  const snapshot=this.media.snapshot(id),descriptor=snapshot?.playback;
  if(snapshot?.state!=='ready'||!descriptor)throw new AccessError('episode-preparing',409);
  await this.credentials().getAuthorized(actor.uid);
  const episodeId=canonicalEpisodeId(snapshot.episodeNumber),origin=destination==='cast'?this.config.castMediaOrigin:this.config.mediaOrigin;
  return this.delegateDescriptor(actor,lease,{...descriptor,episodeId},origin);
 }
 async prepareDestination(id,destination){
  const snapshot=this.media.snapshot(id);
  if(snapshot?.state!=='ready'||!snapshot.playback)throw new AccessError('episode-preparing',409);
  if(snapshot.playback.mode==='prepared-mp4')return;
  const mode=destination==='cast'?'cast-h264':'compatible-h264';
  if(snapshot.playback.mode===mode)return;
  // The receiver needs aligned encoded segments after seeks; local clients can
  // retain source H.264. Tracks are resolved again by language, never file index.
  await this.media.switchEpisode(id,snapshot.episodeNumber,{explicitSelection:true,mode,
   audioLanguage:snapshot.playback.selected?.audioLanguage});
 }
 delegateDescriptor(actor,lease,descriptor,origin){
  if(!mediaTypes.has(descriptor.contentType))throw new AccessError('media-type-unverified',503);
  const episodeId=descriptor.episodeId,key=JSON.stringify([lease.sessionId,lease.generation,lease.authorityEpoch,episodeId,descriptor.masterPath,descriptor.contentType]);
  const existing=this.deliveries.get(key);if(existing&&existing.expiresAt>Date.now()+300000)return existing;
  const minted=this.tickets.mint({...lease,uid:actor.uid,episodeId,resources:[descriptor.masterPath,descriptor.subtitlePath]});
  const result={episodeId,mediaUrl:mediaUrl(origin,minted.token,episodeId,descriptor.masterPath),subtitleUrl:mediaUrl(origin,minted.token,episodeId,descriptor.subtitlePath),
   contentType:descriptor.contentType,durationSeconds:descriptor.durationSeconds,expiresAt:minted.expiresAt};
  this.deliveries.set(key,result);return result;
 }
 abortStreams(predicate){for(const stream of this.activeStreams)if(predicate(stream))stream.abort(new AccessError('media-not-found',404));}
 revokeSession(id){this.abortStreams(stream=>stream.entry.sessionId===id);for(const key of this.deliveries.keys())if(JSON.parse(key)[0]===id)this.deliveries.delete(key);this.queueRecords.delete(id);}
 revokeProfile(uid){
  this.tickets.revokeProfile(uid);this.abortStreams(stream=>stream.entry.uid===uid);
  for(const [id,state]of this.states)if(state.uid===uid)this.revokeSession(id);
 }
 revokeEpisode(id,episodeId){this.tickets.revokeEpisode(id,episodeId);this.abortStreams(stream=>stream.entry.sessionId===id&&stream.entry.episodeId===episodeId);}
 shutdown(){this.closed=true;this.abortStreams(()=>true);}
 streamGuard(req,res,{token,episodeId,resource,entry}){
  if(this.closed)throw new AccessError('companion-stopping',503);
  if(req.aborted||res.destroyed||res.closed||res.writableEnded)throw new AccessError('media-client-closed',499);
  if(this.activeStreams.size>=64||[...this.activeStreams].filter(stream=>stream.entry.uid===entry.uid).length>=16)throw new AccessError('media-request-limit',429);
  const controller=new AbortController();let timer,expiryTimer,pending=null,nextCheck=0,finished=false;
  const assert=()=>{
   if(controller.signal.aborted)throw controller.signal.reason;
   if(this.closed||this.tickets.authorize(token,episodeId,resource)!==entry)throw new AccessError('media-not-found',404);
  };
  const validateLease=async()=>{
   const lease=await this.lease(entry.uid,entry.sessionId);
   if(lease.generation!==entry.generation||lease.authorityEpoch!==entry.authorityEpoch||lease.destination!==entry.destination)throw new AccessError('media-not-found',404);
  };
  const cleanup=()=>{if(finished)return;finished=true;clearInterval(timer);clearTimeout(expiryTimer);res.off('close',onClose);this.activeStreams.delete(record);};
  const abort=error=>{if(controller.signal.aborted)return;if(!res.writableEnded)emitDiagnostic(this.onDiagnostic,{type:'stream-abort',sessionId:entry.sessionId,code:error?.code,method:req.method,hasRange:req.headers.range!==undefined,resourceKind:mediaResourceKind(resource)});controller.abort(error);cleanup();if(res.headersSent)res.destroy();};
  const onClose=()=>abort(new AccessError('media-client-closed',499));
  const check=()=>{
   try{assert();}catch(error){abort(error);return Promise.reject(error);}
   if(pending)return pending;
   if(Date.now()<nextCheck)return Promise.resolve();
   const task=(async()=>{
    assert();await validateLease();assert();
    // Reuse ViewerCredentials' sole <=60s membership window. The stream layer
    // introduces no positive authorization cache; output waits for an active read.
    try{await this.credentials().getAuthorized(entry.uid);}catch(error){emitDiagnostic(this.onDiagnostic,{type:'credentials-error',sessionId:entry.sessionId,code:error?.code,method:req.method,hasRange:req.headers.range!==undefined,resourceKind:mediaResourceKind(resource)});this.revokeProfile(entry.uid);throw error;}
    assert();await validateLease();assert();nextCheck=Date.now()+this.streamCheckMs;
   })();
   pending=task;
   void task.then(()=>{if(pending===task)pending=null;},error=>{abort(error);if(pending===task)pending=null;});
   return task;
  };
  const record={entry,controller,assert,check,abort,cleanup,start:()=>{
   timer=setInterval(()=>{void check().catch(()=>{});},this.streamCheckMs);timer.unref?.();
  }};
  assert(); // Admission may have been revoked during the initial credential read.
  this.activeStreams.add(record);res.on('close',onClose);
  // Tickets are immutable; renewal creates another ticket rather than silently
  // prolonging an already open response. Check against the same ticket clock.
  expiryTimer=setTimeout(()=>abort(new AccessError('media-not-found',404)),Math.max(1,entry.expiresAt-this.tickets.clock()));expiryTimer.unref?.();
  return record;
 }
 async receiverState(context,state){
  let lease;try{lease=await this.lease(context.uid,context.sessionId);}catch{return;}
  // A delayed poll belongs only to its original Cast authority. It must neither
  // overwrite state nor invalidate delivery minted after a handback/takeover.
  if(lease.destination!=='cast'||lease.generation!==context.generation||lease.authorityEpoch!==context.authorityEpoch)return;
  this.castStates.set(context.sessionId,state);
  // CastBridge has revoked the lost receiver's tickets. Retire the matching
  // cached URLs too so the next LOAD obtains fresh capabilities immediately.
  if(!state.owned){this.revokeSession(context.sessionId);return;}
  if(!state.episodeId){this.queueRecords.delete(context.sessionId);return;}
  await this.media.reportProgress(context.sessionId,{episodeNumber:Number(state.episodeId.slice(-4)),positionSeconds:state.positionSeconds,isPaused:state.state==='PAUSED',playbackRate:1}).catch(()=>{});
  void this.cloud()?.sync(context.uid,{force:state.state==='IDLE'});
  if(this.autoplay.get(context.sessionId)&&state.owned&&state.state!=='IDLE')void this.ensureQueue(context).catch(()=>{});
 }
 async receiverEpisode(context,episodeId){
  const snapshot=this.media.snapshot(context.sessionId),number=Number(episodeId.slice(-4));
  if(!snapshot||snapshot.episodeNumber===number)return;
  const previous=canonicalEpisodeId(snapshot.episodeNumber);
  await this.media.switchEpisode(context.sessionId,number,{explicitSelection:false});
  this.queueRecords.delete(context.sessionId);
  const timer=setTimeout(()=>this.revokeEpisode(context.sessionId,previous),30000);timer.unref?.();
 }
 async ensureQueue(context){
  if(!this.media.prepareNextPlayback)throw new AccessError('next-episode-unavailable',409);
  const previous=this.queueRecords.get(context.sessionId);if(previous)return previous.promise;
  const record={state:'preparing'};this.queueRecords.set(context.sessionId,record);
  record.promise=(async()=>{try{
   const descriptor=await this.media.prepareNextPlayback(context.sessionId);
   if(this.queueRecords.get(context.sessionId)!==record)throw new AccessError('cast-queue-policy-changed',409);
   const lease=await this.lease(context.uid,context.sessionId);
   if(lease.destination!=='cast'||lease.generation!==context.generation||lease.authorityEpoch!==context.authorityEpoch)throw new AccessError('destination-changed',409);
   if(this.queueRecords.get(context.sessionId)!==record)throw new AccessError('cast-queue-policy-changed',409);
   const episode=this.delegateDescriptor({uid:context.uid},lease,descriptor,this.config.castMediaOrigin);
   await this.cast.queue(context,{episodes:[episode]});record.state='queued';record.episodeId=episode.episodeId;
  }catch(error){record.state='error';record.code=error.code??'next-episode-unavailable';if(this.queueRecords.get(context.sessionId)===record)this.queueRecords.delete(context.sessionId);throw error;}})();
  return record.promise;
 }
 async reloadReceiver(context,{autoplay=this.autoplay.get(context.sessionId)===true}={}){
  // A single LOAD replaces the receiver queue without guessing receiver item IDs.
  // Preserve actual position, pause, subtitles and volume; the warmed stream is reused.
  this.autoplay.set(context.sessionId,false);this.queueRecords.delete(context.sessionId);
  const actual=await this.cast.status(context);
  const episode=await this.delegation({uid:context.uid},context.sessionId,'cast');
  let state=await this.cast.load({...context,episode,positionSeconds:actual.positionSeconds,takeover:false});
  if(!actual.subtitleEnabled)state=await this.cast.command(context,{action:'subtitles',value:false});
  if(actual.state==='PAUSED')state=await this.cast.command(context,{action:'pause'});
  this.autoplay.set(context.sessionId,autoplay);
  if(autoplay)void this.ensureQueue(context).catch(()=>{});
  return state;
 }
 startPreparation(actor,lease,episodeNumber,{audioIndex,audioLanguage,explicitSelection=true}={}){
  const existing=this.media.snapshot(lease.sessionId);
  const task=existing?.state==='ready'?this.media.switchEpisode(lease.sessionId,episodeNumber,{explicitSelection,audioIndex,audioLanguage}):this.media.openSession({sessionId:lease.sessionId,profileId:actor.uid,episodeNumber,audioIndex,audioLanguage,takeover:true});
  this.states.set(lease.sessionId,{uid:actor.uid,task,error:null});
  void task.catch(error=>{const entry=this.states.get(lease.sessionId);if(entry?.task===task)entry.error={code:error.code??'PREPARATION_FAILED'};});
  return task;
 }
 async control(req,res){
  try{
   this.gateway(req,res);if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const url=new URL(req.url,'http://localhost');if(url.search)throw new AccessError('query-not-supported',400);
   if(req.method==='GET'&&url.pathname==='/api/health'){json(res,200,{status:this.closed?'stopping':'online',version:1,setupRequired:!this.binding.ownerUid});return;}
   if(this.closed)throw new AccessError('companion-stopping',503);
   if(req.method==='POST'&&url.pathname==='/api/pair-owner'){
    const actor=await this.identity.verify(bearerToken(req.headers));const input=await body(req);
    const result=await this.binding.pair(actor,input);await this.onPair(result.ownerUid);json(res,201,result);return;
   }
   if(req.method==='GET'&&url.pathname==='/api/me'){
    const actor=await this.actor(req,{setup:true}),playbackAccess=await this.playbackAccess(actor);json(res,200,{uid:actor.uid,email:actor.email,role:actor.role,ownerUid:this.binding.ownerUid,needsWorkspace:actor.needsWorkspace===true,needsClaim:actor.needsClaim===true,needsApproval:actor.needsApproval===true,playbackAccess});return;
   }
   if(req.method==='DELETE'&&url.pathname==='/api/pair-viewer'){
    const actor=await this.identity.verify(bearerToken(req.headers));
    if(!this.binding.ownerUid)throw new AccessError('companion-setup-required',409);
    if(req.headers['transfer-encoding']||req.headers['content-length']&&req.headers['content-length']!=='0')throw new AccessError('body-not-supported',400);
    // A signed-in viewer can always withdraw their own retained credential,
    // including after invitation revocation or a family-service outage.
    this.invalidateMember(actor.uid);
    try{this.revokeProfile(actor.uid);await this.credentials().revoke(actor.uid);const snapshot=await this.progress.snapshot(actor.uid);if(snapshot.lease)await this.progress.close(actor.uid,snapshot.lease.sessionId);}
    finally{this.invalidateMember(actor.uid);}
    json(res,200,{paired:false});return;
   }
   const routine=req.method==='GET'&&(/^\/api\/sessions\/[A-Za-z0-9_-]{1,96}$/.test(url.pathname)||url.pathname==='/api/progress')
    ||req.method==='POST'&&/^\/api\/sessions\/[A-Za-z0-9_-]{1,96}\/(?:renew|events|cast-command)$/.test(url.pathname);
   const actor=await this.actor(req,{cached:routine});
   if(req.method==='POST'&&url.pathname==='/api/pair-viewer'){const input=await body(req);json(res,200,await this.credentials().pairGoogle(actor,input.googleIdToken));return;}
   if(req.method==='GET'&&url.pathname==='/api/progress'){
    const snapshot=await this.progress.snapshot(actor.uid);json(res,200,{...snapshot,lease:publicLease(snapshot.lease),sync:this.cloud()?.status(actor.uid)});return;
   }
   if(req.method==='GET'&&url.pathname==='/api/cast/devices'){json(res,200,{devices:await this.cast.discover()});return;}
   if(req.method==='POST'&&url.pathname==='/api/sessions'){
    const input=await body(req);this.progress.episode(input.episodeId);
    if(input.audioIndex!==undefined&&(!Number.isSafeInteger(input.audioIndex)||input.audioIndex<0||input.audioIndex>255))throw new AccessError('invalid-audio-track',400);
    if(input.audioLanguage!==undefined&&!['ja','en'].includes(input.audioLanguage))throw new AccessError('invalid-audio-language',400);
    const result=await this.locked(actor.uid,async()=>{
     await this.credentials().getAuthorized(actor.uid);await this.cloud()?.hydrate(actor.uid,actor);
     const lease=await this.progress.claim({uid:actor.uid,deviceId:input.deviceId,destination:'local',takeover:input.takeover===true});
     if(lease.destination==='cast'){
      if(canonicalEpisodeId(this.media.snapshot(lease.sessionId)?.episodeNumber)!==input.episodeId)throw new AccessError('use-tv-episode-control',409);
      return lease;
     }
     this.startPreparation(actor,lease,Number(input.episodeId.slice(-4)),{audioIndex:input.audioIndex,audioLanguage:input.audioLanguage});void this.cloud()?.sync(actor.uid);return lease;
    });json(res,202,{lease:publicLease(result),...this.safeState(result.sessionId)});return;
   }
   const match=/^\/api\/sessions\/([A-Za-z0-9_-]{1,96})(?:\/(renew|events|episode|delivery|cast|cast-command|disconnect))?$/.exec(url.pathname);
   if(!match)throw new AccessError('route-not-found',404);
   const[,id,action]=match;const lease=await this.lease(actor.uid,id);
   if(req.method==='GET'&&!action){json(res,200,{lease:publicLease(lease),...this.safeState(id),cast:this.castStates.get(id)??null,sync:this.cloud()?.status(actor.uid)});return;}
   if(req.method==='DELETE'&&!action){
    emitDiagnostic(this.onDiagnostic,{type:'cast-command',sessionId:id,action:'close'});
    // Flush while the active lease can still authorize the mirror. A failed cloud
    // request never discards the durable PC outbox or blocks an explicit close.
    await this.cloud()?.sync(actor.uid,{force:true});
    if(Object.keys(await this.progress.pending(actor.uid)).length)await this.cloud()?.sync(actor.uid,{force:true});
    await this.progress.close(actor.uid,id);this.states.delete(id);json(res,200,{closed:true});return;
   }
   if(req.method!=='POST')throw new AccessError('method-not-allowed',405);
   const input=await body(req);
   if(action==='renew'){
    const result=await this.locked(actor.uid,async()=>{
     const current=await this.lease(actor.uid,id);let state=this.castStates.get(id);
     if(input.autoplay!==undefined){
      if(typeof input.autoplay!=='boolean')throw new AccessError('invalid-autoplay',400);
      const was=this.autoplay.get(id)===true;this.autoplay.set(id,input.autoplay);
      if(current.destination==='cast'&&state?.owned){
       const context={uid:actor.uid,...current,receiverId:state.receiverId};
       if(was&&!input.autoplay)state=await this.reloadReceiver(context,{autoplay:false});
       else if(input.autoplay)void this.ensureQueue(context).catch(()=>{});
      }
     }
     return{lease:publicLease(await this.progress.renew(actor.uid,id)),autoplay:this.autoplay.get(id)===true,cast:state??null};
    });json(res,200,result);return;
   }
   if(action==='events'){
    const current=this.media.snapshot(id);if(!current?.playback||canonicalEpisodeId(current.episodeNumber)!==input.episodeId)throw new AccessError('episode-changed',409);
    const result=await this.progress.record(actor.uid,id,input,{durationSeconds:current.playback.durationSeconds});
    await this.media.reportProgress(id,{episodeNumber:current.episodeNumber,positionSeconds:result.progress.positionSeconds,isPaused:input.reason==='pause',playbackRate:1});
    void this.cloud()?.sync(actor.uid,{force:input.reason!=='heartbeat'});json(res,200,{...result,lease:publicLease((await this.progress.snapshot(actor.uid)).lease)});return;
   }
   if(action==='episode'){
    if(input.audioIndex!==undefined&&(!Number.isSafeInteger(input.audioIndex)||input.audioIndex<0||input.audioIndex>255))throw new AccessError('invalid-audio-track',400);
    if(input.audioLanguage!==undefined&&!['ja','en'].includes(input.audioLanguage))throw new AccessError('invalid-audio-language',400);
    this.progress.episode(input.episodeId);
    if(input.positionSeconds!==undefined&&(!Number.isFinite(input.positionSeconds)||input.positionSeconds<0||input.positionSeconds>14400))throw new AccessError('invalid-position',400);
    if(input.automatic===true&&Number(input.episodeId.slice(-4))!==this.media.snapshot(id)?.episodeNumber+1)throw new AccessError('transition-order',409);
    emitDiagnostic(this.onDiagnostic,{type:'cast-command',sessionId:id,action:'episode'});
    const result=await this.locked(actor.uid,async()=>{
     let currentLease=await this.lease(actor.uid,id);
     if(currentLease.destination!=='cast'){
      this.startPreparation(actor,currentLease,Number(input.episodeId.slice(-4)),{audioIndex:input.audioIndex,audioLanguage:input.audioLanguage,explicitSelection:input.automatic!==true});return currentLease;
     }
     const previous=this.castStates.get(id);if(!previous?.owned)throw new AccessError('cast-ownership-lost',409);
     const context={uid:actor.uid,...currentLease,receiverId:previous.receiverId};
     await this.cast.command(context,{action:'pause'});
     // Explicit selection keeps the destination but rotates its authority, stops only
     // our captured receiver session, and revokes old queued URLs before preparation.
     currentLease=await this.progress.setDestination(actor.uid,id,'cast',{renewAuthority:true});
     this.castStates.set(id,{receiverId:previous.receiverId,owned:true,state:'PREPARING',episodeId:input.episodeId});
     const task=this.startPreparation(actor,currentLease,Number(input.episodeId.slice(-4)),{audioIndex:input.audioIndex,audioLanguage:input.audioLanguage,explicitSelection:input.automatic!==true});
     const expected=currentLease;
     void task.then(async()=>{
      const active=await this.lease(actor.uid,id);if(active.authorityEpoch!==expected.authorityEpoch)throw new AccessError('destination-changed',409);
      const episode=await this.delegation(actor,id,'cast');
      await this.cast.load({uid:actor.uid,...active,receiverId:previous.receiverId,episode,positionSeconds:input.positionSeconds??0,takeover:false});
     }).catch(error=>{const current=this.states.get(id);if(current?.task===task)current.error={code:error.code??'cast-unavailable'};});
     return currentLease;
    });
    json(res,202,{lease:publicLease(result),...this.safeState(id)});return;
   }
   if(action==='delivery'){json(res,200,await this.delegation(actor,id,lease.destination));return;}
   if(action==='cast'){
    const requestedAutoplay=input.autoplay===true;this.autoplay.set(id,false);
    const result=await this.locked(actor.uid,async()=>{
     let next=await this.progress.setDestination(actor.uid,id,'cast');
     try{await this.prepareDestination(id,'cast');const episode=await this.delegation(actor,id,'cast'),context={uid:actor.uid,...next,receiverId:input.receiverId};let state=await this.cast.load({...context,episode,positionSeconds:input.positionSeconds,takeover:input.takeover===true});if(input.subtitleEnabled===false)state=await this.cast.command(context,{action:'subtitles',value:false});this.autoplay.set(id,requestedAutoplay);if(requestedAutoplay)void this.ensureQueue(context).catch(()=>{});return{lease:publicLease(next),cast:state};}
     catch(error){await this.progress.setDestination(actor.uid,id,'local');await this.prepareDestination(id,'local').catch(()=>{});throw error;}
    });json(res,200,result);return;
   }
   if(action==='cast-command'){
    if(input.action==='next')await this.actor(req);
    const state=await this.locked(actor.uid,async()=>{const current=await this.lease(actor.uid,id),context={uid:actor.uid,...current,receiverId:input.receiverId};if(input.action==='next')await this.ensureQueue(context);let state=await this.cast.command(context,input);
     if(input.action==='subtitles'&&this.queueRecords.has(id))state=await this.reloadReceiver(context);
     return state;
    });json(res,200,{cast:state,lease:publicLease((await this.progress.snapshot(actor.uid)).lease)});return;
   }
   if(action==='disconnect'){
    let state;
    try{state=await this.cast.disconnect({uid:actor.uid,...lease,receiverId:input.receiverId});}
    catch(error){if(!['cast-ownership-lost','cast-unavailable'].includes(error.code))throw error;const snapshot=await this.progress.snapshot(actor.uid);const episodeId=canonicalEpisodeId(this.media.snapshot(id).episodeNumber);state={episodeId,positionSeconds:snapshot.progress[episodeId]?.positionSeconds??0};}
    const next=await this.progress.setDestination(actor.uid,id,'local');this.castStates.delete(id);
    await this.prepareDestination(id,'local');
    json(res,200,{lease:publicLease(next),positionSeconds:state.positionSeconds,episodeId:state.episodeId});return;
   }
   throw new AccessError('route-not-found',404);
  }catch(error){routeError(res,error);}
 }
 async mediaRequest(req,res,{httpMedia=false}={}){
  let guard;const diagnostic={method:req.method,hasRange:req.headers.range!==undefined,resourceKind:'other'};
  try{
   if(this.closed)throw new AccessError('companion-stopping',503);
   if(!['GET','HEAD','OPTIONS'].includes(req.method))throw new AccessError('method-not-allowed',405);
   if(httpMedia&&!this.config.allowHttpMedia)throw new AccessError('http-media-disabled',403);
   const origin=req.headers.origin;
   const allowed=[...this.config.allowedOrigins,'https://www.gstatic.com','https://cast.gstatic.com'];
   if(origin&&!allowed.includes(origin))throw new AccessError('origin-denied',403);
   // Receiver URLs carry a scoped capability; this listener never accepts Firebase credentials.
   if(req.headers.authorization||req.headers.cookie)throw new AccessError('media-credentials-not-accepted',400);
   if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   res.setHeader('Access-Control-Allow-Methods','GET,HEAD,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Range');res.setHeader('Access-Control-Expose-Headers','Content-Length,Content-Range,Accept-Ranges');
   res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const match=/^\/m\/([A-Za-z0-9_-]{32})\/(one-piece-\d{4})\/([A-Za-z0-9_-]{1,11000})$/.exec(req.url);
   if(!match)throw new AccessError('media-not-found',404);
   const[,token,episodeId,encoded]=match,resource=decodeResource(encoded),entry=this.tickets.authorize(token,episodeId,resource);
   diagnostic.sessionId=entry.sessionId;diagnostic.resourceKind=mediaResourceKind(resource);
   if(httpMedia&&entry.destination!=='cast')throw new AccessError('media-not-found',404);
   const lease=await this.lease(entry.uid,entry.sessionId);
   if(lease.generation!==entry.generation||lease.authorityEpoch!==entry.authorityEpoch||lease.destination!==entry.destination)throw new AccessError('media-not-found',404);
   // Refresh/membership checks are bounded and cached for <=60s by ViewerCredentials.
   try{await this.credentials().getAuthorized(entry.uid);}catch(error){emitDiagnostic(this.onDiagnostic,{type:'credentials-error',...diagnostic,code:error?.code});this.revokeProfile(entry.uid);throw error;}
   guard=this.streamGuard(req,res,{token,episodeId,resource,entry});
   emitDiagnostic(this.onDiagnostic,{type:'media-admission',...diagnostic});
   const range=req.method==='HEAD'?undefined:req.headers.range;
   if(range&&(range.length>100||!/^bytes=(?:\d+-\d*|-\d+)$/.test(range)))throw new AccessError('invalid-range',416);
   const output=await this.media.getPlaybackResource(entry.sessionId,resource,{range,signal:guard.controller.signal,method:req.method});
   await guard.check();
   this.tickets.extendResources(entry,output.resources??[]);
   const headers=Object.fromEntries(Object.entries(output.headers??{}).filter(([key])=>['content-type','content-length','content-range','accept-ranges'].includes(key.toLowerCase())));
   emitDiagnostic(this.onDiagnostic,{type:'media-open',...diagnostic});
   if(output.manifestText){
    await output.body?.cancel();const origin=httpMedia?this.config.castMediaOrigin:this.config.mediaOrigin;
    const text=rewriteManifest(output.manifestText,path=>mediaUrl(origin,token,episodeId,path));headers['content-length']=String(Buffer.byteLength(text));
    res.writeHead(output.status,headers);res.end(req.method==='HEAD'?undefined:text);return;
   }
   res.writeHead(output.status,headers);if(req.method==='HEAD'){await output.body?.cancel();res.end();return;}
   if(output.longLived){
    guard.start();
    const stream=guard;
    await pipeline(Readable.from((async function*(){try{for await(const chunk of Readable.fromWeb(output.body,{highWaterMark:0})){await stream.check();stream.assert();yield chunk;}}catch(error){stream.abort(error);throw error;}})(),{objectMode:false,highWaterMark:0}),res);
   }else await pipeline(Readable.fromWeb(output.body),res);
  }catch(error){emitDiagnostic(this.onDiagnostic,{type:'media-error',...diagnostic,code:error?.code});guard?.abort(error);routeError(res,error);}
  finally{guard?.cleanup();}
 }
}
