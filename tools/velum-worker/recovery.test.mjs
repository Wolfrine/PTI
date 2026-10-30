import test from 'node:test';
import assert from 'node:assert/strict';
import {attemptRecovery} from './recovery-control.mjs';
import {makeRecoveryRequest,pendingRecovery,recoveryPhase,RECOVERY_TTL_MS} from '../../velum-gallery/studio-recovery.mjs';
const id='c083a24a-b79d-4346-bca5-35c718cc4a42';
test('remote recovery requires a bounded, pinned request and fixed action',async()=>{
 const now=1770000000000,request=makeRecoveryRequest(now,id);
 assert.equal(request.expiresAt-now,RECOVERY_TTL_MS);
 assert.equal(pendingRecovery(request,now),true);
 for(const invalid of [{...request,action:'shell'}, {...request,deviceUid:'wrong'}, {...request,status:'attempted'}, {...request,expiresAt:now+3600000}])assert.equal(pendingRecovery(invalid,now),false);
 assert.equal(pendingRecovery(request,now+RECOVERY_TTL_MS),false);
});
test('watchdog only invokes fixed start for a valid nonexpired request',async()=>{
 const now=1770000000000,request=makeRecoveryRequest(now,id),calls=[];
 assert.equal(await attemptRecovery({read:async()=>request,start:async()=>calls.push('start'),ack:async time=>calls.push(time),now}),true);
 assert.deepEqual(calls,['start',now]);
 assert.equal(await attemptRecovery({read:async()=>({...request,expiresAt:now-1}),start:async()=>calls.push('bad'),ack:async()=>{},now}),false);
 assert.deepEqual(calls,['start',now]);
});
test('UI never treats a submitted request or watchdog acknowledgment as a worker heartbeat',()=>{
 const now=1770000000000,request=makeRecoveryRequest(now,id),old={capabilities:{recoveryControl:true}};
 assert.equal(recoveryPhase(request,old,false,now),'waiting');
 assert.equal(recoveryPhase({...request,status:'attempted',attemptedAt:now},old,false,now),'checking');
 assert.equal(recoveryPhase({...request,status:'attempted',attemptedAt:now-180000},old,false,now),'unreachable');
 assert.equal(recoveryPhase(request,old,false,now+RECOVERY_TTL_MS),'expired');
 assert.equal(recoveryPhase(request,old,true,now),'online');
 assert.equal(recoveryPhase(null,old,false,now),'ready');
 assert.equal(recoveryPhase(null,null,false,now),'setup');
});
