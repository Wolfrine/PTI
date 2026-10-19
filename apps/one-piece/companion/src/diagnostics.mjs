import {atomicJson} from './progress.mjs';

const types=new Set(['media-admission','media-open','media-error','stream-abort','credentials-error','cast-error','cast-state','cast-command','cast-revoke','authority-change','session-close','cast-negative-status','cast-worker-exit','cast-worker-timeout']);
const codes=new Set(['internal-error','media-not-found','media-client-closed','media-request-limit','companion-stopping','session-replaced-or-expired','destination-changed',
 'viewer-not-paired','viewer-reauthentication-required','viewer-identity-unavailable','viewer-credential-unavailable','viewer-access-revoked','family-access-denied','identity-unavailable','invalid-token','token-expired',
 'membership-unavailable','not-invited','family-unavailable','viewer-identity-mismatch','invalid-membership-response','invalid-identity-response','invalid-viewer-credential-response','verified-google-account-required','unknown-signing-key',
 'cast-ownership-lost','cast-stale-authority','cast-status-not-fresh','cast-seek-not-confirmed','cast-timeout','cast-unavailable','cast-receiver-unavailable',
 'STATIC_HEADER_TIMEOUT','STATIC_READ_TIMEOUT','STATIC_FETCH','STATIC_READ','STATIC_LIFETIME','STATIC_CANCELLED','STATIC_TRUNCATED','STATIC_HEADERS','STATIC_BYTES','STATIC_OVERRUN',
 'SESSION_GONE','SESSION_NOT_READY','MEDIA_RESOURCE','PLAYBACK_RESOURCE','ENGINE_RESPONSE_LIMIT','ENGINE_BUSY','ENGINE_HEADER_TIMEOUT','ENGINE_OFFLINE','ENGINE_UNAVAILABLE','STATIC_REQUEST','invalid-range','origin-denied','http-media-disabled','media-credentials-not-accepted','method-not-allowed','ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','UND_ERR_SOCKET','ABORT_ERR','ERR_STREAM_PREMATURE_CLOSE']);
const states=new Set(['PLAYING','PAUSED','BUFFERING','IDLE','UNOWNED','DISCONNECTED']);
const actions=new Set(['load','queue','pause','play','seek','volume','subtitles','next','disconnect','episode','close']);

/** Never record exception text, identities, media paths, headers or capabilities. */
export function sanitizeDiagnostic(value){
 if(!value||!types.has(value.type))return null;
 const result={type:value.type};
 if(typeof value.sessionId==='string'&&/^[A-Za-z0-9_-]{1,96}$/.test(value.sessionId))result.sessionId=value.sessionId;
 if(value.code!==undefined)result.code=codes.has(value.code)?value.code:'internal-error';
 if(['GET','HEAD'].includes(value.method))result.method=value.method;
 if(typeof value.hasRange==='boolean')result.hasRange=value.hasRange;
 if(['video','subtitle','manifest','other'].includes(value.resourceKind))result.resourceKind=value.resourceKind;
 if(states.has(value.state))result.state=value.state;
 if(actions.has(value.action))result.action=value.action;
 if(typeof value.owned==='boolean')result.owned=value.owned;
 return result;
}
export function emitDiagnostic(callback,value){
 const event=sanitizeDiagnostic(value);if(!event||typeof callback!=='function')return;
 try{void Promise.resolve(callback(event)).catch(()=>{});}catch{}
}

/** A bounded local failure timeline. It adds no public route or authorization cache. */
export class PlaybackDiagnostics{
 constructor({file,limit=120,clock=()=>Date.now()}={}){
  if(typeof file!=='string'||!file||!Number.isInteger(limit)||limit<2||limit>120)throw Error('invalid-diagnostic-store');
  Object.assign(this,{file,limit,clock});this.startedAt=new Date(clock()).toISOString();this.events=[];this.revision=0;this.written=0;this.pending=null;
 }
 record(value){
  const event=sanitizeDiagnostic(value);if(!event)return;
  this.events.push({sequence:++this.revision,recordedAt:new Date(this.clock()).toISOString(),...event});
  if(this.events.length>this.limit)this.events.splice(0,this.events.length-this.limit);
  return this.flush();
 }
 flush(){
  if(this.pending)return this.pending;
  const task=(async()=>{while(this.written<this.revision){
   const revision=this.revision;
   await atomicJson(this.file,{version:1,startedAt:this.startedAt,updatedAt:new Date(this.clock()).toISOString(),events:structuredClone(this.events)});
   this.written=revision;
  }})();
  this.pending=task;void task.then(()=>{if(this.pending===task)this.pending=null;},()=>{if(this.pending===task)this.pending=null;});return task;
 }
}
