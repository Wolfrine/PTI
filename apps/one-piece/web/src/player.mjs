import Hls from 'hls.js';

const hlsTypes=new Set(Object.values(Hls.ErrorTypes)),hlsDetails=new Set(Object.values(Hls.ErrorDetails));
/** Explicit allowlist: diagnostic values may never contain source URLs or error messages. */
export function sanitizedPlaybackDiagnostic(video,source,data={}){
 const safeSource=['hls','video','play','subtitles','browser'].includes(source)?source:'unknown';
 const playNames=['AbortError','NotAllowedError','NotSupportedError'];
 return {source:safeSource,type:safeSource==='hls'?(hlsTypes.has(data.type)?data.type:'unknown'):'none',details:safeSource==='hls'?(hlsDetails.has(data.details)?data.details:'unknown'):safeSource==='play'?(playNames.includes(data.details)?data.details:'other'):'none',fatal:data.fatal===true,videoErrorCode:[1,2,3,4].includes(video.error?.code)?video.error.code:0,positionSeconds:Number.isFinite(video.currentTime)?Math.round(video.currentTime*1000)/1000:0,readyState:[0,1,2,3,4].includes(video.readyState)?video.readyState:0,paused:video.paused===true,seeking:video.seeking===true};
}

/** A single local player. URLs are held only in memory and are never logged or cached. */
export class LocalPlayer {
 constructor(video,{onTime=()=>{},onPause=()=>{},onSeek=()=>{},onEnded=()=>{},onStatus=()=>{},onFailure=()=>{},hlsEngine=Hls}={}){
  this.video=video;Object.assign(this,{onTime,onPause,onSeek,onEnded,onStatus,onFailure});this.Hls=hlsEngine;this.hls=null;this.delivery=null;this.disposed=false;this.loading=false;this.playAttempt=0;
  video.crossOrigin='anonymous';video.playsInline=true;video.controls=true;video.preload='metadata';
  this.handlers={timeupdate:()=>onTime(video.currentTime,video.duration),pause:()=>{if(!this.loading)onPause(video.currentTime);},seeked:()=>{if(!this.loading)onSeek(video.currentTime);},
   ended:()=>onEnded(),waiting:()=>{if(this.lastStatus!=='tap-to-play')this.setStatus('buffering');},playing:()=>{if(this.disposed||this.lastStatus==='failed'||video.paused)return;this.loading=false;this.setStatus('playing');},error:()=>{if(!this.loading||video.error)this.fail('video-unavailable','video');}};
  for(const [name,handler]of Object.entries(this.handlers))video.addEventListener(name,handler);
 }
 async load(delivery,{positionSeconds=0,subtitles=true,autoplay=true}={}){
  if(this.disposed)return;
  const generation=this.generation=(this.generation??0)+1;
  this.playAttempt++;
  this.loading=true;this.lastStatus='loading';this.delivery=delivery;this.subtitleEnabled=subtitles;this.clearSourceEvents?.();this.clearSourceEvents=null;this.hls?.destroy();this.hls=null;
  const video=this.video;video.pause();video.removeAttribute('src');for(const track of video.querySelectorAll('track'))track.remove();video.load();
  const contentType=typeof delivery?.contentType==='string'?delivery.contentType.split(';',1)[0].trim().toLowerCase():'';
  const mp4=contentType==='video/mp4',hls=['application/vnd.apple.mpegurl','application/x-mpegurl'].includes(contentType);
  if(!mp4&&!hls){this.loading=false;this.fail('delivery-type-unsupported','browser');return;}
  const track=document.createElement('track');track.kind='subtitles';track.srclang='en';track.label='English dialogue';track.default=subtitles;track.src=delivery.subtitleUrl;
  const trackLoaded=()=>{if(generation===this.generation)this.subtitles(this.subtitleEnabled);},trackFailed=()=>{if(generation===this.generation)this.fail('subtitles-unavailable','subtitles');};
  track.addEventListener('load',trackLoaded,{once:true});track.addEventListener('error',trackFailed,{once:true});video.append(track);
  let settled=false;
  const begin=()=>{
   if(settled||this.disposed||generation!==this.generation||this.lastStatus==='failed')return;settled=true;this.setStatus('ready');
   if(Number.isFinite(positionSeconds)&&positionSeconds>0){try{video.currentTime=Math.min(positionSeconds,Math.max(0,(delivery.durationSeconds??video.duration)-.5));}catch{}}
   this.subtitles(subtitles);this.loading=false;
   if(autoplay)void this.play();
  };
  const recovered=()=>this.clearBuffering(generation);
  video.addEventListener('loadedmetadata',begin,{once:true});
  video.addEventListener('seeked',recovered);video.addEventListener('canplay',recovered);
  this.clearSourceEvents=()=>{video.removeEventListener('loadedmetadata',begin);video.removeEventListener('seeked',recovered);video.removeEventListener('canplay',recovered);track.removeEventListener('load',trackLoaded);track.removeEventListener('error',trackFailed);};
  if(mp4||video.canPlayType('application/vnd.apple.mpegurl')){video.src=delivery.mediaUrl;video.load();}
  else if(this.Hls.isSupported()){
   this.hls=new this.Hls({enableWorker:true,maxBufferLength:30,maxMaxBufferLength:60,backBufferLength:30,startPosition:Math.max(0,positionSeconds),xhrSetup:xhr=>{xhr.withCredentials=false;}});
   this.hls.on(this.Hls.Events.ERROR,(_event,data)=>this.hlsError(data,generation));
   this.hls.loadSource(delivery.mediaUrl);this.hls.attachMedia(video);
  }else{this.loading=false;this.fail('browser-playback-unsupported','browser');}
 }
 setStatus(value){if(this.disposed||this.lastStatus==='failed')return;this.lastStatus=value;this.onStatus(value);}
 clearBuffering(generation){if(this.disposed||generation!==this.generation||this.loading||this.lastStatus!=='buffering'||this.video.seeking||this.video.error||this.video.readyState<3)return;this.setStatus('ready');}
 diagnostic(source,data){if(typeof __DEV__!=='undefined'&&__DEV__)console.info('ONE_PIECE_PLAYER_DIAGNOSTIC',JSON.stringify(sanitizedPlaybackDiagnostic(this.video,source,data)));}
 fail(code,source,data={}){if(this.disposed)return;this.lastStatus='failed';this.diagnostic(source,{...data,fatal:true});this.onFailure(code);}
 hlsError(data,generation){if(this.disposed||generation!==this.generation)return;this.diagnostic('hls',data);if(data.fatal){this.lastStatus='failed';this.onFailure(data.type===Hls.ErrorTypes.NETWORK_ERROR?'stream-interrupted':'video-unavailable');}}
 subtitles(enabled){this.subtitleEnabled=enabled;for(const track of this.video.textTracks)track.mode=enabled&&track.language==='en'?'showing':'disabled';}
 get position(){return Number.isFinite(this.video.currentTime)?this.video.currentTime:0;}
 pause(){this.playAttempt++;this.video.pause();}
 async play(){
  if(this.disposed)return false;
  const generation=this.generation,attempt=++this.playAttempt;
  try{await this.video.play();return !this.disposed&&generation===this.generation&&attempt===this.playAttempt;}
  catch(error){
   if(this.disposed||generation!==this.generation||attempt!==this.playAttempt)return false;
   if(error?.name==='AbortError'&&this.video.paused)return false;
   if(error?.name==='NotAllowedError'){this.diagnostic('play',{details:error.name,fatal:false});this.setStatus('tap-to-play');return false;}
   this.fail('video-unavailable','play',{details:error?.name});return false;
  }
 }
 seek(value){if(Number.isFinite(value))this.video.currentTime=Math.max(0,Math.min(value,(this.delivery?.durationSeconds??Infinity)-.1));}
 async fullscreen(){const container=this.video.closest('.player-stage')??this.video;if(document.fullscreenElement)await document.exitFullscreen();else if(container.requestFullscreen)await container.requestFullscreen();else if(this.video.webkitEnterFullscreen)this.video.webkitEnterFullscreen();}
 destroy(){this.disposed=true;this.generation=(this.generation??0)+1;this.loading=true;this.clearSourceEvents?.();this.clearSourceEvents=null;for(const[name,handler]of Object.entries(this.handlers))this.video.removeEventListener(name,handler);this.hls?.destroy();this.hls=null;this.video.pause();this.video.removeAttribute('src');for(const t of this.video.querySelectorAll('track'))t.remove();this.video.load();this.delivery=null;}
}
