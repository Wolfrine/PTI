import { safeLocalProgress, validPendingEvent } from './model.mjs';

export const liveProgressLease=(lease,now=Date.now())=>Boolean(lease&&Number.isFinite(lease.expiresAt)&&lease.expiresAt>now);
export const sameProgressAuthority=(a,b)=>Boolean(a&&b&&a.generation===b.generation&&a.authorityEpoch===b.authorityEpoch);
export const progressEventKey=event=>JSON.stringify(['episodeId','generation','authorityEpoch','revision','positionSeconds','reason'].map(key=>event?.[key]??null));
export const progressPayload=event=>Object.fromEntries(['episodeId','generation','authorityEpoch','revision','positionSeconds','reason'].map(key=>[key,event[key]]));

/** Server order, never maximum position or phone wall-clock order. */
export function orderedLease(current,incoming){
 if(!incoming)return current;
 if(!current)return incoming;
 for(const key of ['generation','authorityEpoch']){
  if(incoming[key]<current[key])return current;
  if(incoming[key]>current[key])return incoming;
 }
 if(incoming.sessionId!==current.sessionId)return current;
 return {...incoming,revision:Math.max(current.revision??0,incoming.revision??0),expiresAt:Math.max(current.expiresAt??0,incoming.expiresAt??0)};
}

export function verifiedEventCoverage(event,progress){
 if(!progress||progress.episodeId!==event.episodeId||!sameProgressAuthority(event,progress)||!Number.isSafeInteger(event.revision)||!Number.isSafeInteger(progress.revision))return null;
 return progress.revision===event.revision&&progress.positionSeconds===event.positionSeconds&&progress.reason===event.reason?'acknowledged':null;
}

export function safeRecoveryCandidates(value){
 if(!Array.isArray(value))return [];
 return value.filter(item=>item&&typeof item.id==='string'&&/^[A-Za-z0-9_-]{1,96}$/.test(item.id)&&validPendingEvent(item.event))
  .slice(-1084).map(item=>({id:item.id,event:{...progressPayload(item.event),...(Number.isSafeInteger(item.event.localOrder)?{localOrder:item.event.localOrder}:{})},
   reason:/^[a-z-]{1,64}$/.test(item.reason??'')?item.reason:'save-unconfirmed',savedPosition:Number.isFinite(item.savedPosition)?item.savedPosition:undefined,
   choice:item.choice&&typeof item.choice.sourceKey==='string'&&item.choice.sourceKey.length<2048&&Number.isFinite(item.choice.positionSeconds)&&item.choice.positionSeconds>=0&&item.choice.positionSeconds<=21600?{sourceKey:item.choice.sourceKey,positionSeconds:item.choice.positionSeconds}:null}));
}

export function journalProgressEvent(candidates,event,{reason='authority-changed',progress,id=()=>crypto.randomUUID()}={}){
 const result=[...candidates],index=result.findIndex(item=>item.event.episodeId===event.episodeId),old=result[index];
 // Queue order is assigned locally and persisted. An intentional rewind wins
 // over an earlier larger position; a delayed acknowledgement never wins here.
 const replace=!old||(event.localOrder??0)>=(old.event.localOrder??0);
 const item={...(old??{}),id:old?.id??id(),event:replace?{...event}:old.event,reason,
  savedPosition:progress?.positionSeconds??old?.savedPosition};
 if(index<0)result.push(item);else result[index]=item;
 return result;
}

/** Partition one bounded, authenticated PC snapshot without rebasing old events. */
export function reconcileProgressEvents(queue,candidates,snapshot,{now=Date.now(),blockedEvent=null,reason='authority-changed',id}={}){
 const progress=safeLocalProgress(snapshot?.progress),lease=liveProgressLease(snapshot?.lease,now)?snapshot.lease:null;
 let journal=safeRecoveryCandidates(candidates);const pending=[],settled=[];
 for(const event of queue){
  const coverage=verifiedEventCoverage(event,progress[event.episodeId]);
  if(coverage){settled.push({event,progress:progress[event.episodeId],coverage});continue;}
  if(!lease||lease.destination==='cast'||!sameProgressAuthority(event,lease)||event===blockedEvent||(Number.isSafeInteger(event.revision)&&event.revision<=(lease.revision??0))){
   journal=journalProgressEvent(journal,event,{reason:!lease?'session-ended':reason,progress:progress[event.episodeId],id});
  }else pending.push(event);
 }
 journal=journal.filter(item=>{
  // Choosing the local place is only intent. Keep it until that new-authority
  // write is acknowledged, or the viewer explicitly chooses the PC place.
  if(item.choice)return true;
  return !verifiedEventCoverage(item.event,progress[item.event.episodeId]);
 }).map(item=>({...item,savedPosition:progress[item.event.episodeId]?.positionSeconds??item.savedPosition}));
 return {pending,candidates:journal,progress,lease,settled};
}

export function removeSentProgressEvent(queue,event){return queue.filter(item=>item!==event);}

export function applyVerifiedProgress(current,incoming,pending=[]){
 if(!incoming)return current;
 const tail=pending.filter(event=>event.episodeId===incoming.episodeId).at(-1);
 if(tail)return {...incoming,...tail,durationSeconds:current?.durationSeconds??incoming.durationSeconds,watched:['ended','mark-watched'].includes(tail.reason)};
 if(current&&Number.isSafeInteger(current.revision)){
  for(const key of ['generation','authorityEpoch','revision']){
   if((incoming[key]??0)<(current[key]??0))return current;
   if((incoming[key]??0)>(current[key]??0))break;
  }
 }
 return incoming;
}

export function recoveryNoticeIsProgress(notice=''){
 return /^(Your (?:last position|place)|This device has (?:a saved place|an unsynced place)|Your position has not synced)/.test(notice);
}
