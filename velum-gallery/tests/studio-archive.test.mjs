import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ARCHIVE_PAGE_SIZE,archiveSource,mergeArchivePage,visibleCreations,creationLocation,decodeThumbnail} from '../studio-archive.mjs';
import {imageHeader} from '../studio-reference.mjs';

test('144 creation records page in bounded groups without losing old ids or duplicating cursor edges',()=>{
  const jobs=Array.from({length:144},(_,index)=>({id:`job-${index}`,status:'completed',createdAt:Date.UTC(2026,9,30)-index*3600000,model:index%2?'flux2-klein-fp8':'zimage-nvfp4'}));
  let loaded=[];for(let index=0;index<jobs.length;index+=ARCHIVE_PAGE_SIZE){const page=jobs.slice(index,index+ARCHIVE_PAGE_SIZE);assert.ok(page.length<=36);loaded=mergeArchivePage(loaded,page);}
  assert.equal(loaded.length,144);assert.equal(loaded.at(-1).id,'job-143');loaded=mergeArchivePage(loaded,[{...jobs[0],status:'failed'}]);assert.equal(loaded.length,144);assert.equal(loaded[0].status,'failed');
  assert.equal(visibleCreations(loaded,{model:'flux2-klein-fp8'}).length,72);assert.equal(visibleCreations(loaded,{filter:'drafts',saves:{'job-1':{fileId:'saved'}}}).length,142);
});
test('reversible removal excludes cards but keeps original jobs unchanged',()=>{
 const jobs=[{id:'a',status:'completed'},{id:'b',status:'failed'},{id:'c',status:'uploading'}],removed={b:{removedAt:10},c:{removedAt:11}};
 assert.deepEqual(visibleCreations(jobs,{removed}).map(job=>job.id),['a']);
 assert.deepEqual(visibleCreations(jobs,{removed,filter:'removed'}).map(job=>job.id),['b','c']);
 delete removed.b;
 assert.deepEqual(visibleCreations(jobs,{removed}).map(job=>job.id),['a','b']);
 assert.equal(jobs[1].status,'failed');
});
test('kept and saved use dedicated cursor collections, unsaved filtering never claims a global count',()=>{
  assert.deepEqual(archiveSource('kept'),{collection:'feedback',order:'updatedAt',where:['verdict','==','keep']});assert.deepEqual(archiveSource('saved'),{collection:'saves',order:'savedAt'});assert.equal(archiveSource('all').collection,'jobs');assert.deepEqual(archiveSource('drafts').where,['status','==','completed']);assert.deepEqual(archiveSource('removed'),{collection:'removed',order:'removedAt'});
});
test('local path and protected remote availability never imply an unsaved Drive upload',()=>{
  const location=creationLocation({id:'job-17',status:'completed',result:{chunks:2}},null);assert.equal(location.localPath,'H:\\AI-ImageGen\\portrait-pilot\\velum-studio\\job-17\\image.png');assert.equal(location.metadataPath.endsWith('result.json'),true);assert.equal(location.drive,'Not saved to Drive');assert.match(location.remote,/Private remote/);assert.match(creationLocation({id:'job-17',status:'completed'},null).remote,/Local original only/);
});
test('small thumbnails verify bounded JPEG bytes and hash independently from full PNG transfer',async()=>{
  const bytes=Buffer.from([255,216,1,2,3,255,217]),manifest={mime:'image/jpeg',bytes:bytes.length,width:300,height:400,data:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')};assert.equal((await decodeThumbnail(manifest)).size,bytes.length);await assert.rejects(decodeThumbnail({...manifest,width:513}));await assert.rejects(decodeThumbnail({...manifest,bytes:65537}));await assert.rejects(decodeThumbnail({...manifest,sha256:'0'.repeat(64)}));
});
test('reference headers accept only bounded-decodable PNG/JPEG families and reject SVG/disguised input',()=>{
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(768,16);png.writeUInt32BE(1024,20);assert.deepEqual(imageHeader(png),{mime:'image/png',width:768,height:1024});assert.throws(()=>imageHeader(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')));assert.throws(()=>imageHeader(Buffer.from([255,216,255,192,0,255,0,1])));
});
test('legacy expected paths and unverified remote manifests are never presented as checked local originals',()=>{
  const job={id:'legacy-17',status:'completed',result:{chunks:2}};
  assert.match(creationLocation(job).local,/Expected PC paths/);
  assert.match(creationLocation(job).remote,/reported/);
  assert.match(creationLocation(job,null,{remoteError:true}).remote,/unavailable or not verified/);
  assert.match(creationLocation(job,null,{remoteVerified:true}).remote,/original verified/);
  job.result.localPath='H:\\AI-ImageGen\\portrait-pilot\\velum-studio\\legacy-17\\image.png';
  assert.match(creationLocation(job).local,/reported by your PC/);
});
