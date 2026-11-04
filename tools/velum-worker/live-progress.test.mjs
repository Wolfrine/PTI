import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveProgress,PROGRESS_STAGES} from './live-progress.mjs';
import {emptyResources} from './resources.mjs';
import {finishClaimed} from './lifecycle.mjs';

const settle=async()=>{for(let index=0;index<20;index++)await Promise.resolve();};
function clock(){
 let at=100000,next=0;const entries=new Map();
 return {now:()=>at,timers:{setInterval(fn,ms){const id=++next;entries.set(id,{fn,ms,next:at+ms});return id;},clearInterval(id){entries.delete(id);}},
  count:()=>entries.size,async advance(ms){
   const end=at+ms;
   while(true){const due=[...entries.values()].filter(item=>item.next<=end).sort((a,b)=>a.next-b.next)[0];if(!due)break;
    at=due.next;due.next+=due.ms;due.fn();await settle();
   }at=end;await settle();
  }};
}
function fixture(options={}){
 const time=clock(),writes=[];let samples=0;
 const progress=new LiveProgress({now:time.now,timers:time.timers,jobStartedAt:99000,publish:async value=>writes.push(value),sampler:{sample:async()=>{samples++;return {...emptyResources(time.now()),cpuPercent:42};}},...options});
 return {progress,time,writes,samples:()=>samples};
}

test('idle creates no metric work; active eleven-minute CPU encoding remains fresh at bounded cadence',async()=>{
 const {progress,time,writes,samples}=fixture();
 await time.advance(60000);assert.equal(samples(),0);assert.equal(writes.length,0);
 await progress.start();await progress.stage('encoding-prompt');
 const initial=writes.length;await time.advance(660000);
 assert.equal(writes.length-initial,26);assert.equal(samples(),133);
 for(const value of writes){assert.equal(value.step,null);assert.equal(value.total,null);assert.ok(JSON.stringify(value).length<1000);}
 assert.equal(writes.at(-1).stage,'encoding-prompt');assert.ok(time.now()-writes.at(-1).updatedAt<25000);
 await progress.stop();const final=writes.length;await time.advance(120000);
 assert.equal(writes.length,final);assert.equal(time.count(),0);
});

test('stage events publish promptly, completed stage durations accumulate, and sampler callbacks coalesce',async()=>{
 const {progress,time,writes}=fixture();await progress.start();await time.advance(5000);
 await progress.stage('encoding-prompt');assert.equal(writes.at(-1).stage,'encoding-prompt');assert.equal(writes.at(-1).stageDurations.preparing,5000);
 progress.counter({step:1,total:5});assert.equal(progress.snapshot().step,null);
 await time.advance(5000);await progress.stage('sampling');const before=writes.length;
 for(let step=1;step<=100;step++)progress.counter({step,total:100});
 progress.counter({step:2,total:100});progress.counter({step:1,total:200});progress.counter({step:101,total:100});progress.counter({step:NaN,total:100});
 assert.equal(writes.length,before);await time.advance(15000);
 assert.equal(writes.length,before+1);assert.equal(writes.at(-1).step,100);assert.equal(writes.at(-1).total,100);
 await progress.stage('decoding');assert.equal(writes.at(-1).step,null);assert.equal(writes.at(-1).stageDurations.sampling,15000);
 const same=writes.length;progress.stage('decoding');progress.stage('untrusted');assert.equal(writes.length,same);
 assert.deepEqual(Object.keys(writes.at(-1).stageDurations),['preparing','encoding-prompt','sampling']);
 await progress.stop();
});

test('only one GPU sample runs at a time and closing aborts an in-flight command',async()=>{
 let resolveSample,signal,requests=0;
 const {progress,time,writes}=fixture({sampler:{sample:async options=>{requests++;signal=options.signal;await new Promise(resolve=>{resolveSample=resolve;options.signal.addEventListener('abort',resolve,{once:true});});return emptyResources(1);}}});
 const start=progress.start();await settle();await time.advance(15000);assert.equal(requests,1);
 const stopping=progress.stop();assert.equal(signal.aborted,true);resolveSample();await Promise.all([start,stopping]);
 const final=writes.length;await time.advance(60000);assert.equal(writes.length,final);assert.equal(requests,1);
});

test('serialized writer drains final progress before failed terminal state even when inference throws',async()=>{
 let release,concurrent=0,maxConcurrent=0;const events=[];
 const {progress,time}=fixture({publish:async value=>{
  concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);events.push(`progress:${value.stage}`);
  if(events.length===1)await new Promise(resolve=>{release=resolve;});concurrent--;
 }});
 const attempt=finishClaimed({id:'fixture'},{approved:async()=>{},load:async()=>null,prepare:async()=>progress.start(),infer:async()=>{
  void progress.stage('sampling');progress.counter({step:1,total:40});throw Error('inference-failed');
 },upload:async()=>assert.fail('must not upload'),fail:async(_,reason)=>{await progress.stop();events.push(`terminal:${reason}`);}});
 await settle();assert.equal(events.length,1);await time.advance(50000);assert.equal(events.length,1);
 release();await attempt;assert.equal(maxConcurrent,1);assert.equal(events.at(-1),'terminal:inference-failed');
 const final=events.length;progress.counter({step:2,total:40});progress.stage('publishing');await time.advance(60000);await progress.stop();assert.equal(events.length,final);
});

test('publishing snapshot finishes before completed and progress never resumes after terminal',async()=>{
 const events=[];const {progress,time}=fixture({publish:async value=>{await Promise.resolve();events.push(value.stage);}});
 await progress.start();await progress.stage('sampling');progress.counter({step:40,total:40});
 await progress.stage('publishing');await progress.stop();events.push('completed');
 await time.advance(60000);assert.equal(events.at(-1),'completed');assert.equal(events.at(-2),'publishing');
});

test('a lost terminal/replaced claim closes timers and discards queued snapshots',async()=>{
 let release;const writes=[];
 const {progress,time}=fixture({publish:async value=>{writes.push(value);await new Promise(resolve=>{release=resolve;});return false;}});
 await progress.start();progress.stage('sampling');await time.advance(25000);release();await settle();
 assert.equal(writes.length,1);assert.equal(time.count(),0);await progress.stop();await time.advance(60000);assert.equal(writes.length,1);
});

test('telemetry failures retry only on the next stage/cadence and snapshots have a bounded schema',async()=>{
 let attempts=0;const {progress,time}=fixture({publish:async()=>{attempts++;throw Error('offline');}});
 await progress.start();await settle();await time.advance(10000);assert.equal(attempts,1);
 await progress.stage('sampling');assert.equal(attempts,2);await time.advance(15000);assert.equal(attempts,3);
 await progress.stop();const value=progress.snapshot();
 assert.deepEqual(Object.keys(value),['stage','jobStartedAt','stageStartedAt','updatedAt','stageDurations','step','total','resources']);
 assert.ok(Object.keys(value.stageDurations).every(stage=>PROGRESS_STAGES.includes(stage)));
 assert.ok(JSON.stringify(value).length<1000);assert.equal(value.jobStartedAt,99000);
});
