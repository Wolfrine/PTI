import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {eventWakeup,watchTask} from '../src/transport-events.mjs';
test('wakeups received during in-flight work are retained and quiet waits have deadlines',async()=>{
  const events=eventWakeup();events.wake();const start=Date.now();await events.wait(1000);assert(Date.now()-start<500);
  const pending=events.wait(1000);events.wake();await pending;
  await events.wait(10);assert(Date.now()-start>=5);
});
test('task watcher catches atomic replacement and ignores unrelated files',async()=>{
  const directory=fileURLToPath(new URL('../test-data/transport-events/',import.meta.url));fs.mkdirSync(directory,{recursive:true});
  let called=0;const stop=watchTask(directory,()=>called++,error=>{throw error;});
  try{fs.writeFileSync(directory+'irrelevant.txt','fixture');await new Promise(r=>setTimeout(r,30));assert.equal(called,0);
    fs.writeFileSync(directory+'temporary.json','{}');fs.renameSync(directory+'temporary.json',directory+'task.json');await new Promise(r=>setTimeout(r,30));assert(called>0);
  }finally{stop();}
});
