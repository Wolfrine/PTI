import {PC_DEVICE_UID} from './device-config.mjs';

export const RECOVERY_TTL_MS=10*60*1000;
export const RECOVERY_COOLDOWN_MS=60*1000;

export function makeRecoveryRequest(now=Date.now(),requestId=crypto.randomUUID()){
 if(!Number.isSafeInteger(now)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))throw new Error('Invalid recovery request');
 return {action:'start',deviceUid:PC_DEVICE_UID,requestId,requestedAt:now,expiresAt:now+RECOVERY_TTL_MS,status:'requested'};
}

export function pendingRecovery(request,now=Date.now()){
 return Boolean(request?.action==='start'&&request.deviceUid===PC_DEVICE_UID&&request.status==='requested'&&Number.isSafeInteger(request.expiresAt)&&request.expiresAt>now&&request.expiresAt-request.requestedAt===RECOVERY_TTL_MS);
}

export function recoveryPhase(request,worker,online,now=Date.now()){
 if(online)return 'online';
 if(request?.deviceUid===PC_DEVICE_UID&&request.action==='start'){
  if(request.expiresAt<=now)return 'expired';
  if(request.status==='requested')return 'waiting';
  if(request.status==='attempted')return now-request.attemptedAt<120000?'checking':'unreachable';
 }
 return worker?.capabilities?.recoveryControl===true?'ready':'setup';
}
