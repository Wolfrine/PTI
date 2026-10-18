import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudProgress,firestoreFields,readFields} from '../src/cloud-progress.mjs';

test('offline replica rebases revoked metadata while preserving a deliberate rewind and retries an unacknowledged commit',async()=>{
 const commits=[],acks=[];let fail=true;
 const pending={one:{episodeId:'one-piece-0001',sessionId:'old-session',generation:1,authorityEpoch:1,revision:8,positionSeconds:120,durationSeconds:1500,watched:false,reason:'seek',updatedAt:100}};
 const lease={sessionId:'current-session',deviceId:'device-one',destination:'local',generation:3,authorityEpoch:5,revision:2,expiresAt:1000000,updatedAt:200};
 const store={hydrate:async()=>{},snapshot:async()=>({lease}),pending:async()=>pending,acknowledge:async(...args)=>acks.push(args)};
 const cloud=new CloudProgress({projectId:'pti-app-2ab59',ownerUid:'owner',credentials:{getAuthorized:async()=>({token:'private-fixture'})},store,clock:()=>200,fetchImpl:async(url,init)=>{
  if(init.method==='POST'){commits.push(JSON.parse(init.body));if(fail){fail=false;throw new Error('lost acknowledgment');}return Response.json({writeResults:[]});}
  if(url.includes('/leases/'))return new Response('',{status:404});return Response.json({documents:[]});
 }});
 assert.equal((await cloud.sync('viewer',{force:true})).synced,false);assert.equal(acks.length,0);
 assert.equal((await cloud.sync('viewer',{force:true})).synced,true);assert.deepEqual(commits[0],commits[1]);
 const saved=readFields(commits[1].writes[1].update);assert.equal(saved.positionSeconds,120);assert.equal(saved.reason,'seek');assert.equal(saved.updatedAt,100);assert.equal(saved.generation,3);assert.equal(saved.authorityEpoch,5);assert.equal(saved.revision,2);
 assert.deepEqual(acks,[['viewer','one-piece-0001',1,8]]);assert.ok(!JSON.stringify(commits).includes('private-fixture'));
});

test('replica credentials stay server-only and malformed typed cloud data is rejected',()=>{
 assert.deepEqual(readFields({fields:firestoreFields({positionSeconds:120.5,watched:false,episodeId:'one-piece-0001',revision:2})}),{positionSeconds:120.5,watched:false,episodeId:'one-piece-0001',revision:2});
 for(const fields of [{revision:{integerValue:'9007199254740992'}},{revision:{integerValue:'x'}},{positionSeconds:{doubleValue:'NaN'}},{uid:{stringValue:'x',booleanValue:true}}])assert.throws(()=>readFields({fields}),{code:'invalid-cloud-response'});
});
