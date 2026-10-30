import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {ThumbnailBackfill} from './thumbnail-backfill.mjs';

test('117-job thumbnail backfill is cursor-bounded, one original per idle pass and finite after restart',async()=>{
 const root=await mkdtemp(path.join(process.cwd(),'.velum-backfill-test-')),file=path.join(root,'state.json');
 const jobs=Array.from({length:117},(_,index)=>({id:`job-${String(index).padStart(3,'0')}`,job:{status:'completed',model:'flux2-klein-fp8',seed:index,width:768,height:1024,createdAt:1000+index,result:{sha256:'fixture'},prompt:'must not persist in backfill state'}}));
 let pages=0,reads=0,published=0;const remote=new Set(['job-001']),missing=new Set(['job-002']);
 const deps={page:async cursor=>{pages++;const start=cursor?Number(cursor):0,items=jobs.slice(start,start+24);return {items,count:items.length,cursor:String(start+items.length)};},hasThumbnail:async id=>remote.has(id),load:async id=>{reads++;return missing.has(id)?null:{id};},publish:async item=>{published++;remote.add(item.id);}};
 try{
  let backfill=new ThumbnailBackfill(file,deps);
  for(let index=0;index<150;index++){
   const before=reads;await backfill.step();assert.ok(reads-before<=1);
   if(index===40)backfill=new ThumbnailBackfill(file,deps);
  }
  assert.equal(pages,5);assert.equal(published,115);assert.equal(reads,116);
  const state=JSON.parse(await readFile(file,'utf8'));assert.equal(state.done,true);assert.equal(state.unavailableCount,1);assert.deepEqual(state.lastUnavailable,{id:'job-002',reason:'local-original-unavailable'});
  assert.equal((await readFile(file,'utf8')).includes('must not persist'),false);
 }finally{await unlink(file).catch(()=>{});await rmdir(root);}
});
test('backfill reconnect retries a thumbnail without losing its cursor or resampling',async()=>{
 const root=await mkdtemp(path.join(process.cwd(),'.velum-backfill-test-')),file=path.join(root,'state.json');let writes=0;
 const deps={page:async()=>({count:1,cursor:'job-1',items:[{id:'job-1',job:{status:'completed',createdAt:1000}}]}),hasThumbnail:async()=>false,load:async()=>({}),publish:async()=>{if(++writes===1)throw new Error('network-offline');}};
 try{
  await assert.rejects(new ThumbnailBackfill(file,deps).step(),/network-offline/);
  await new ThumbnailBackfill(file,deps).step();assert.equal(writes,2);
  const state=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(state.pending,[]);assert.equal(state.done,true);
 }finally{await unlink(file).catch(()=>{});await rmdir(root);}
});
