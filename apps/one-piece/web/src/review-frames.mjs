// Imported only by the development fixture. Never log URLs, cues or application state.
export function observeReviewFrames(video,episode,{now=()=>performance.now(),log=value=>console.info('ONE_PIECE_REVIEW_FRAME',JSON.stringify(value))}={}){
 if(!video||![1000,1001].includes(episode))return ()=>{};
 let active=true,callbackId=null,first=true,seekStarted=null,seekSequence=0,seekTarget=null,seekObservations=0,totalObservations=0;const started=now();
 const finite=value=>Number.isFinite(value)?Math.round(value*1000)/1000:null;
 const emit=(event,elapsed,metadata={})=>{
  const track=video.querySelector('track[srclang="en"]'),text=[...video.textTracks].find(t=>t.language==='en');
  log({episode,event,elapsedMs:finite(elapsed),mediaTime:finite(metadata.mediaTime),frameCount:Number.isSafeInteger(metadata.presentedFrames)&&metadata.presentedFrames>=0?metadata.presentedFrames:null,paused:video.paused===true,seeking:video.seeking===true,seekSequence:seekStarted===null?null:seekSequence,seekTargetSeconds:seekStarted===null?null:seekTarget,englishTrackReadyState:[0,1,2,3].includes(track?.readyState)?track.readyState:null,englishTrackMode:['disabled','hidden','showing'].includes(text?.mode)?text.mode:'absent'});
 };
 if(typeof video.requestVideoFrameCallback!=='function'){emit('unmeasured-frame-api',null);return ()=>{};}
 const queue=()=>{if(active&&callbackId===null)callbackId=video.requestVideoFrameCallback(frame);};
 const frame=(timestamp,metadata)=>{
  callbackId=null;if(!active)return;const at=Number.isFinite(timestamp)?timestamp:now();
  if(first){first=false;emit('first-frame',Math.max(0,at-started),metadata);}
  if(seekStarted!==null&&seekObservations<8&&totalObservations<128){emit('seek-frame-observed',Math.max(0,at-seekStarted),metadata);seekObservations++;totalObservations++;}
  if(seekStarted!==null&&!video.seeking){emit('seek-frame',Math.max(0,at-seekStarted),metadata);seekStarted=null;}
  if(first||seekStarted!==null)queue();
 };
 const seeking=()=>{seekStarted=now();seekSequence=seekSequence%1000000+1;seekTarget=Number.isFinite(video.currentTime)&&video.currentTime>=0&&video.currentTime<=14400?finite(video.currentTime):null;seekObservations=0;queue();};
 const stop=()=>{active=false;if(callbackId!==null)video.cancelVideoFrameCallback?.(callbackId);callbackId=null;video.removeEventListener('seeking',seeking);video.removeEventListener('error',stop);};
 video.addEventListener('seeking',seeking);video.addEventListener('error',stop);queue();return stop;
}
