import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createDriveTransport,createStudioDrive,verifySaved,uploadUrl,PRIVATE_FOLDER_ID,DRIVE_FILE_SCOPE} from '../studio-drive.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const bytes=Buffer.alloc(300000,5);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
const job={id:'technical-job',status:'completed',result:{mime:'image/png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};
const blob=new Blob([bytes],{type:'image/png'}),id='reserved_drive_file_1',session='https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=technical';
const metadata=()=>({id,name:'Velum-technical-job.png',mimeType:'image/png',size:bytes.length,parents:[PRIVATE_FOLDER_ID],appProperties:{velumJobId:job.id,velumSha256:job.result.sha256}});
function memory(){const map=new Map();return{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('Drive upload pins folder root, verifies original, uses reserved ID and acknowledges progress',async()=>{
 let exists=false;const ranges=[],progress=[];const request=async(url,options={})=>{
  if(url.includes('/generateIds'))return json({ids:[id]});
  if(url.startsWith('https://www.googleapis.com/drive/v3/files?'))return json({files:[]});
  if(url.includes(`/files/${id}?`))return exists?json(metadata()):new Response(null,{status:404});
  if(options.method==='POST'){const body=JSON.parse(options.body);assert.deepEqual(body.parents,[PRIVATE_FOLDER_ID]);assert.equal(body.id,id);return new Response(null,{headers:{Location:session}});}
  ranges.push(options.headers['Content-Range']);if(ranges.length===1)return new Response(null,{status:308,headers:{Range:'bytes=0-262143'}});exists=true;return json(metadata());
 };
 let reservation;const reserve=async(_job,candidate)=>reservation||=candidate;
 const transport=createDriveTransport({request,reserve,storage:memory(),onProgress:value=>progress.push(value)});
 assert.equal((await transport.save({job,blob})).id,id);assert.deepEqual(ranges,['bytes 0-262143/300000','bytes 262144-299999/300000']);assert.equal(progress.at(-1),1);
 // The second tab has no local session, but uses the same owner-scoped reservation and real object.
 assert.equal((await createDriveTransport({request,reserve,storage:memory()}).save({job,blob})).id,id);assert.equal(ranges.length,2);
});
test('network interruption queries acknowledged offset then resumes same file/session without duplicate creation',async()=>{
 const storage=memory();let posts=0,uploads=0,exists=false,reservation;const ranges=[];
 const request=async(url,options={})=>{
  if(url.includes('/generateIds'))return json({ids:[id]});if(url.startsWith('https://www.googleapis.com/drive/v3/files?'))return json({files:[]});
  if(url.includes(`/files/${id}?`))return exists?json(metadata()):new Response(null,{status:404});
  if(options.method==='POST'){posts++;return new Response(null,{headers:{Location:session}});}
  const range=options.headers['Content-Range'];ranges.push(range);
  if(range==='bytes */300000')return new Response(null,{status:308,headers:{Range:'bytes=0-262143'}});
  if(++uploads===1)throw new TypeError('offline after server acknowledged first chunk');exists=true;return json(metadata());
 };
 const transport=createDriveTransport({request,reserve:async(_job,candidate)=>reservation||=candidate,storage});
 await assert.rejects(transport.save({job,blob}),/offline/);assert.equal((await transport.save({job,blob})).id,id);assert.equal(posts,1);assert.equal(ranges.at(-1),'bytes 262144-299999/300000');
});
test('expired session restarts using reserved ID and wrong parent/job/hash never becomes saved',async()=>{
 const storage=memory();storage.setItem('velum-drive-upload-v1:technical-job',JSON.stringify({id,sha256:job.result.sha256,session}));let posted;
 const request=async(url,options={})=>{if(options.method==='POST'){posted=JSON.parse(options.body);return new Response(null,{status:409});}if(options.method==='PUT')return new Response(null,{status:404});return posted?json(metadata()):new Response(null,{status:404});};
 assert.equal((await createDriveTransport({request,reserve:async()=>id,storage}).save({job,blob})).id,id);assert.equal(posted.id,id);
 for(const wrong of [{parents:['root']},{appProperties:{velumJobId:'other',velumSha256:job.result.sha256}},{size:1},{trashed:true}])assert.throws(()=>verifySaved({...metadata(),...wrong},job));
 assert.throws(()=>uploadUrl('https://attacker.test/upload?upload_id=x'));
 assert.throws(()=>uploadUrl('https://www.googleapis.com:8443/upload/drive/v3/files?upload_id=x'));
 assert.throws(()=>uploadUrl('https://www.googleapis.com/drive/v3/files?upload_id=x'));
 await assert.rejects(createDriveTransport({request:()=>{throw new Error('must not send');},reserve:async()=>id,storage:memory()}).save({job,blob:new Blob([Buffer.alloc(300000)])}),/signature/);
});
test('phone OAuth is owner-only, asks only drive.file and cannot restore a token after Quick Exit',async()=>{
 let complete,calls=0;
 const auth={currentUser:{uid:'5PbKbpGf3AbarNrp6pyqJ5C5Ziu2'}};
 const drive=createStudioDrive({auth,storage:memory(),requestAccess:scope=>{assert.equal(scope,DRIVE_FILE_SCOPE);calls++;return new Promise(resolve=>{complete=resolve;});}});
 const first=drive.authorize();drive.clear();complete({accessToken:'fixture-only-access'});await assert.rejects(first,/locked/);
 const second=drive.authorize();assert.equal(calls,2);complete({accessToken:'fixture-only-access'});await second;
 auth.currentUser={uid:'other'};await assert.rejects(drive.authorize(),/Owner/);assert.equal(calls,2);
});
