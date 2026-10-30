import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceDisabled,waitForServiceOperation} from '../scripts/cloud-checks.mjs';
test('missing OAuth and restricted API keys are distinct from a disabled service',()=>{
 for(const reason of ['CREDENTIALS_MISSING','API_KEY_SERVICE_BLOCKED','PERMISSION_DENIED'])assert.equal(serviceDisabled({error:{details:[{reason,metadata:{service:'drive.googleapis.com'}}]}},'drive.googleapis.com'),false);
 assert.equal(serviceDisabled({error:{details:[{reason:'SERVICE_DISABLED',metadata:{service:'drive.googleapis.com'}}]}},'drive.googleapis.com'),true);
 assert.equal(serviceDisabled({error:{details:[{reason:'SERVICE_DISABLED',metadata:{service:'other.googleapis.com'}}]}},'drive.googleapis.com'),false);
});
test('already completed enable operations need no polling and cannot falsely time out',async()=>{
 await waitForServiceOperation({name:'operations/noop',done:true},{read:()=>{throw new Error('must not poll');}});
 await assert.rejects(waitForServiceOperation({done:true,error:{message:'permission denied'}},{read:()=>{}}),/permission denied/);
});
test('pending operations confirm completion or report an exact failure without pretending readiness',async()=>{
 let reads=0;await waitForServiceOperation({name:'operations/test'},{wait:async()=>{},read:async name=>{assert.equal(name,'operations/test');return{done:++reads===2};}});assert.equal(reads,2);
 await assert.rejects(waitForServiceOperation({name:'operations/test'},{wait:async()=>{},read:async()=>{throw new Error('HTTP 403');}}),/HTTP 403/);
 await assert.rejects(waitForServiceOperation({name:'operations/test'},{attempts:1,wait:async()=>{},read:async()=>({done:false})}),/still pending/);
});
