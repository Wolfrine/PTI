import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkWakeup,QueueNotifications,QueueSweep,subscribeForWork,listenForWork,MAINTENANCE_MS} from './queue-events.mjs';

function fixture(){
 const subscriptions=[],events={changed:0,revoked:[],connections:[],failures:[]};
 const sdk={doc:(_,path)=>({kind:'binding',path}),collection:(_,path)=>({path}),
  where:(field,op,value)=>({field,op,value}),limit:value=>({limit:value}),
  query:(collection,...filters)=>({kind:'jobs',...collection,filters}),
  onSnapshot:(target,options,next,error)=>{
   assert.equal(options.includeMetadataChanges,true);
   const subscription={target,next,error,closed:false};subscriptions.push(subscription);
   return ()=>{subscription.closed=true;};
  }};
 const close=subscribeForWork({},'device-fixture',{sdk,changed:()=>events.changed++,binding:status=>events.revoked.push(status),connection:online=>events.connections.push(online),failed:error=>events.failures.push(error)});
 const binding=(status,fromCache=false)=>subscriptions[0].next({metadata:{fromCache},exists:()=>status!==null,data:()=>({status})});
 const jobs=(status,ids,fromCache=false)=>subscriptions.findLast(item=>item.target.kind==='jobs'&&item.target.filters[0].value===status).next({metadata:{fromCache},docs:ids.map(id=>({id,data:()=>assert.fail('notification must not read private job bodies')}))});
 return {subscriptions,events,binding,jobs,close};
}

test('idle wakeup retains/coalesces events and maintenance needs no 15-second queue scan',async()=>{
 assert.equal(MAINTENANCE_MS,60000);
 const wakeup=new WorkWakeup();assert.equal(await wakeup.wait(),true);
 assert.equal(await wakeup.wait(5),false);
 wakeup.wake();wakeup.wake();assert.equal(await wakeup.wait(),true);
 const waiting=wakeup.wait(1000);wakeup.wake();assert.equal(await waiting,true);
 assert.equal(await wakeup.wait(5),false);
});
test('quiet connected maintenance performs no queue sweeps; disconnected fallback is bounded',()=>{
 const sweep=new QueueSweep();let reads=0;
 if(sweep.due(true,false,0))reads+=2;
 for(let now=15000;now<=300000;now+=15000)if(sweep.due(false,true,now))reads+=2;
 assert.equal(reads,2);
 for(let now=315000;now<=600000;now+=15000)if(sweep.due(false,false,now))reads+=2;
 assert.equal(reads,12); // immediate offline catch-up then four minute-spaced fallbacks
 assert.equal(sweep.due(true,true,600001),true); // an event never waits for maintenance
});
test('only server-approved binding starts two exact bounded device queries',()=>{
 const f=fixture();assert.equal(f.subscriptions.length,1);
 f.binding('approved',true);assert.equal(f.subscriptions.length,1);
 f.binding('pending');assert.equal(f.subscriptions.length,1);
 f.binding('approved');assert.equal(f.subscriptions.length,3);
 for(const [index,status] of ['queued','running'].entries()){
  const target=f.subscriptions[index+1].target;
  assert.ok(target.path.endsWith('/jobs'));
  assert.deepEqual(target.filters,[{field:'status',op:'==',value:status},{field:'deviceUid',op:'==',value:'device-fixture'},{limit:20}]);
 }
 f.jobs('queued',[]);f.jobs('running',[]);assert.equal(f.events.connections.at(-1),true);f.close();
 assert.ok(f.subscriptions.every(item=>item.closed));
});
test('production listener rejects an unpinned identity before SDK/config access',async()=>{
 await assert.rejects(listenForWork({uid:'unapproved-device-fixture',idToken:'fixture'}),/device-identity-mismatch/);
});
test('job membership wakes; cached/progress-only snapshots do not; reconnect rescans',()=>{
 const f=fixture();f.binding('approved');f.jobs('queued',[]);f.jobs('running',[]);
 let baseline=f.events.changed;
 f.jobs('queued',['new'],true);assert.equal(f.events.changed,baseline);assert.equal(f.events.connections.at(-1),false);
 f.jobs('queued',['new']);assert.equal(f.events.changed,++baseline);
 f.jobs('queued',['new']);f.jobs('running',[]);assert.equal(f.events.changed,baseline);
 f.jobs('queued',[]);assert.equal(f.events.changed,baseline);
 f.jobs('queued',['next']);assert.equal(f.events.changed,++baseline);
 f.binding('approved',true);assert.equal(f.events.connections.at(-1),false);
 f.binding('approved');assert.equal(f.events.changed,++baseline);f.close();
});
test('revocation stops queries immediately, ignores retired callbacks and permits owner reapproval',()=>{
 const f=fixture();f.binding('approved');const old=f.subscriptions[1];
 f.binding('revoked');assert.equal(f.events.revoked.at(-1),'revoked');assert.equal(old.closed,true);
 const baseline=f.events.changed;old.next({metadata:{fromCache:false},docs:[{id:'late'}]});assert.equal(f.events.changed,baseline);
 f.binding('approved');assert.equal(f.subscriptions.length,5);
 f.close();f.binding('revoked');assert.equal(f.events.revoked.at(-1),'approved');
});
test('permission denial marks transport disconnected and never preserves healthy queue status',()=>{
 const f=fixture();f.binding('approved');f.jobs('queued',[]);f.jobs('running',[]);
 f.subscriptions[1].error(new Error('permission-denied'));
 assert.equal(f.events.connections.at(-1),false);assert.equal(f.events.failures.length,1);f.close();
});
test('listener startup/auth failure backs off, replaces tokens and disposes obsolete callbacks',async()=>{
 let now=0,starts=0,stops=0,wakes=0,aborts=0,options;
 const transport=new QueueNotifications({now:()=>now,changed:()=>wakes++,revoked:()=>aborts++,listen:async current=>{
  starts++;options=current;if(starts===1)throw new Error('network');return async()=>{stops++;};
 }});
 await transport.ensure({idToken:'fixture-token-1',uid:'fixture'});assert.equal(transport.connected,false);assert.equal(transport.retryAt,5000);
 await transport.ensure({idToken:'fixture-token-1',uid:'fixture'});assert.equal(starts,1);
 now=5000;await transport.ensure({idToken:'fixture-token-1',uid:'fixture'});assert.equal(starts,2);
 options.connection(true);assert.equal(transport.connected,true);
 const old=options;await transport.ensure({idToken:'fixture-token-2',uid:'fixture'});assert.equal(stops,1);assert.equal(starts,3);
 old.changed();old.binding('revoked');old.connection(true);assert.equal(wakes,0);assert.equal(aborts,0);assert.equal(transport.connected,false);
 options.binding('revoked');assert.equal(aborts,1);options.changed();assert.equal(wakes,1);
 options.failed(new Error('permission-denied'));options.connection(true);assert.equal(transport.connected,false);
 now=130000;await transport.ensure({idToken:'fixture-token-2',uid:'fixture'});assert.equal(starts,4);
 await transport.close();assert.equal(stops,3);options.changed();assert.equal(wakes,1);
});
test('repeated listener failures cap retry delay and shutdown closes an in-flight startup',async()=>{
 let now=0;
 const transport=new QueueNotifications({now:()=>now,listen:async()=>{throw new Error('offline');}});
 for(let i=0;i<10;i++){
  await transport.ensure({idToken:'fixture',uid:'fixture'});
  assert.ok(transport.retryAt-now<=120000);now=transport.retryAt;
 }
 assert.equal(transport.retryAt-(now-120000),120000);
 let release,stopped=0;
 const pending=new QueueNotifications({listen:()=>new Promise(resolve=>{release=resolve;})});
 const start=pending.ensure({idToken:'fixture',uid:'fixture'});
 await Promise.resolve();const close=pending.close();release(async()=>{stopped++;});
 await start;await close;assert.equal(stopped,1);assert.equal(pending.connected,false);
});
