import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStudioLive} from '../studio-live.mjs';
import {studioBusy,workerActivity} from '../studio-view.mjs';
import {progressPresentation,formatDuration} from '../studio-progress.mjs';
import {PC_DEVICE_UID} from '../device-config.mjs';
function harness(){
  const subscriptions=[],states=[],errors=[];
  const ref=(base,...parts)=>({path:[base.path,...parts].filter(Boolean).join('/')});
  const sdk={doc:ref,collection:ref,query:(base,...conditions)=>({...base,conditions}),where:(...parts)=>({where:parts}),orderBy:(...parts)=>({order:parts}),limit:value=>({limit:value}),onSnapshot(target,options,next,error){const slot={target,options,next,error,active:true};subscriptions.push(slot);return()=>{slot.active=false;};}};
  const live=createStudioLive({sdk,db:{},deviceUid:PC_DEVICE_UID,onState:value=>states.push(value),onError:error=>errors.push(error)});
  const find=ending=>subscriptions.filter(item=>item.active&&item.target.path.endsWith(ending)).at(-1);
  const snapshot=(id,value)=>({id,exists:()=>value!==undefined,data:()=>value,metadata:{fromCache:false}});
  const send=(slot,value)=>slot.next(slot.target.conditions?{docs:value.map(job=>snapshot(job.id,job)),metadata:{fromCache:false}}:snapshot(slot.target.path.split('/').at(-1),value));
  const querySlot=kind=>subscriptions.find(item=>item.active&&item.target.conditions?.some(condition=>kind==='recent'?condition.limit===4:condition.limit===20));
  const settle=async()=>{await Promise.resolve();await Promise.resolve();};
  async function seed(){live.start('owner');send(find('/status/pc'),{deviceUid:PC_DEVICE_UID,state:'idle',updatedAt:Date.now()});send(find('/devices/'+PC_DEVICE_UID),{status:'approved'});send(querySlot('recent'),[]);send(querySlot('pending'),[]);await settle();}
  return{live,subscriptions,states,errors,find,send,querySlot,settle,seed};
}
test('four fixed owner-scoped subscriptions are bounded and repeated starts do not read again',async()=>{
  const h=harness();await h.seed();
  assert.equal(h.subscriptions.length,4);
  assert.ok(h.subscriptions.every(item=>item.target.path.startsWith('users/owner/velumStudio/workspace/')));
  assert.equal(h.querySlot('recent').target.conditions.some(item=>item.limit===4),true);
  assert.deepEqual(h.querySlot('pending').target.conditions,[{where:['status','in',['uploading','queued','running']]},{limit:20}]);
  for(let i=0;i<100;i++){h.live.start('owner');h.live.setHints({recovery:false,historicalIds:[]});h.live.refresh();}
  assert.equal(h.subscriptions.length,4);h.live.stop();assert.equal(h.live.size,0);
});
test('active claim only adds a targeted watch after bounded query windows are ready and releases duplicate coverage',async()=>{
  const h=harness();h.live.start('owner');h.send(h.find('/status/pc'),{activeJob:'old',state:'running'});await h.settle();assert.equal(h.live.size,4);
  h.send(h.querySlot('recent'),[]);h.send(h.querySlot('pending'),[]);await h.settle();assert.ok(h.find('/jobs/old'));assert.equal(h.live.size,5);
  h.send(h.querySlot('pending'),[{id:'old',status:'running'}]);await h.settle();assert.equal(h.find('/jobs/old'),undefined);assert.equal(h.live.size,4);
  h.live.stop();
});
test('terminal targeted evidence wins stale pending delivery and frees Generate even with stale active heartbeat',async()=>{
  const h=harness();await h.seed();const now=Date.now(),worker={version:'2.3.0',deviceUid:PC_DEVICE_UID,state:'running',activeJob:'old',updatedAt:now};
  h.send(h.find('/status/pc'),worker);await h.settle();h.send(h.find('/jobs/old'),{status:'completed',createdAt:now});await h.settle();
  h.send(h.querySlot('pending'),[{id:'old',status:'running',createdAt:now}]);await h.settle();
  assert.equal(h.states.at(-1).jobs.find(job=>job.id==='old').status,'completed');
  assert.equal(studioBusy(h.states.at(-1),now),false);assert.equal(workerActivity(worker,h.states.at(-1).jobs,now),'idle');h.live.stop();
});
test('pending query removal keeps targeted status evidence until terminal delivery and bounds bulk evictions',async()=>{
  const h=harness();await h.seed();
  for(let batch=0;batch<5;batch++){h.send(h.querySlot('pending'),Array.from({length:20},(_,index)=>({id:`batch-${batch}-${index}`,status:'queued'})));await h.settle();}
  assert.ok(h.live.size<=24,'four fixed plus at most twenty displaced watches');
  assert.ok(h.states.at(-1).jobs.length<=64);h.live.stop();
});
test('recovery and historical targeted watches are conditional; terminal imports remain observable',async()=>{
  const h=harness();await h.seed();h.live.setHints({recovery:true,historicalIds:['history','history','two','three','four','five']});
  assert.equal(h.live.size,9);assert.ok(h.find('/controls/worker-start'));
  h.send(h.find('/jobs/history'),{status:'completed',recordType:'historical-import',importState:'ready'});await h.settle();
  h.send(h.querySlot('recent'),[{id:'history',status:'completed',recordType:'historical-import',importState:'transferring'}]);await h.settle();
  assert.equal(h.states.at(-1).jobs.find(job=>job.id==='history').importState,'ready','late cached history must not hide a completed transfer');
  h.live.setHints({recovery:false,historicalIds:[]});assert.equal(h.live.size,4);h.live.stop();
});
test('stop rejects late snapshots before owner replacement and listener errors do not cause retry storms',async()=>{
  const h=harness();await h.seed();const old=h.find('/status/pc'),before=h.states.length;
  h.live.stop();h.send(old,{activeJob:'private-old-owner'});await h.settle();assert.equal(h.states.length,before);
  h.live.start('other-owner');h.send(old,{activeJob:'private-old-owner'});await h.settle();assert.equal(h.states.length,before);
  const status=h.find('/status/pc');status.error({code:'permission-denied'});
  for(let index=0;index<20;index++)h.live.setHints({});
  assert.equal(h.subscriptions.length,8);assert.equal(h.errors.length,1);h.live.refresh();assert.equal(h.subscriptions.length,9);
  h.live.stop();assert.equal(h.subscriptions.filter(item=>item.active).length,0);
});
test('progress keeps exact sampling counts and nulls, and freezes stale/offline clocks at the last report',()=>{
  const job={status:'running',progress:{stage:'sampling',jobStartedAt:1000,stageStartedAt:101000,updatedAt:111000,step:2,total:40,stageDurations:{'encoding-prompt':100000},resources:{sampledAt:111000,cpuPercent:0,ramUsedBytes:null,ramTotalBytes:100,gpuUtilPercent:99,vramUsedMiB:4096,vramTotalMiB:8192,gpuTempC:null}}};
  const fresh=progressPresentation(job,{now:121000});assert.equal(fresh.elapsed,'2m 0s');assert.equal(fresh.stageElapsed,'20s');assert.equal(fresh.count,'2 / 40 steps');assert.deepEqual(fresh.metrics.map(item=>item[1]),['0%','—','99%','4.0 / 8.0 GB','—']);
  const stale=progressPresentation(job,{now:211000});assert.equal(stale.elapsed,'1m 50s');assert.equal(stale.stageElapsed,'10s');assert.equal(stale.stale,true);assert.match(stale.freshness,/fresh PC/);
  assert.equal(progressPresentation(job,{now:121000,online:false}).elapsed,'1m 50s');
  assert.equal(progressPresentation({...job,progress:{...job.progress,stage:'encoding-prompt'}},{now:121000}).count,'');
  assert.equal(progressPresentation({...job,progress:{stage:'sampling',step:null,total:null}},{now:121000}).elapsed,'—');
  assert.equal(formatDuration(3661000),'1h 1m 1s');assert.equal(formatDuration(null),'—');
});
test('Studio uses full SDK streams and a local-only clock; recurring polling is absent',()=>{
  const controller=readFileSync(new URL('../studio.mjs',import.meta.url),'utf8'),live=readFileSync(new URL('../studio-live.mjs',import.meta.url),'utf8');
  assert.match(controller,/firebase-firestore\.js/);assert.doesNotMatch(controller,/firebase-firestore-lite|async function poll|setTimeout\(poll|60000:15000/);
  assert.doesNotMatch(live,/getDocs|getDoc|setInterval|setTimeout/);
  assert.match(controller,/setInterval\(\(\)=>\{syncLiveHints\(\);draw\(\);\},1000\)/);
});
