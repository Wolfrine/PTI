import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createDriveAccess,createDriveTransport,createStudioDrive,verifySaved,uploadUrl,PRIVATE_FOLDER_ID,CONNECT_SCOPES,DRIVE_FILE_SCOPE,DRIVE_READ_SCOPE} from '../studio-drive.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const bytes=Buffer.alloc(300000,5);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
const job={id:'technical-job',status:'completed',result:{mime:'image/png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};
const blob=new Blob([bytes],{type:'image/png'}),id='reserved_drive_file_1',rootId='verified_my_drive_root',session='https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=technical';
const metadata=(parent=PRIVATE_FOLDER_ID)=>({id,name:'Velum-technical-job.png',mimeType:'image/png',size:bytes.length,parents:[parent],ownedByMe:true,trashed:false,capabilities:{canMoveItemWithinDrive:true},appProperties:{velumJobId:job.id,velumSha256:job.result.sha256}});
const folderMetadata=folderId=>({id:folderId,mimeType:'application/vnd.google-apps.folder',ownedByMe:true,trashed:false,capabilities:{canAddChildren:true}});
function memory(){const map=new Map();return{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key),get length(){return map.size;},key:index=>[...map.keys()][index]??null};}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const grant=(scope=CONNECT_SCOPES.join(' '),extra={})=>({aud:'185802494856-rn0q6qi5goj0mifha0bkah55slu3kvju.apps.googleusercontent.com',sub:'fixture-google-user',scope,expires_in:3600,...extra});
test('Drive upload stages at root, places the verified original in Private and acknowledges progress',async()=>{
 let exists=false,placed=false,placements=0;const ranges=[],progress=[];const request=async(url,options={})=>{
  if(url.includes('/generateIds'))return json({ids:[id]});
  if(url.startsWith('https://www.googleapis.com/drive/v3/files?'))return json({files:[]});
  if(options.method==='POST'){const body=JSON.parse(options.body);assert.deepEqual(body.parents,['root']);assert.equal(body.id,id);return new Response(null,{headers:{Location:session}});}
  ranges.push(options.headers['Content-Range']);if(ranges.length===1)return new Response(null,{status:308,headers:{Range:'bytes=0-262143'}});exists=true;return json(metadata(rootId));
 };
 const readRequest=async url=>{assert.equal(new URL(url).pathname,'/drive/v3/files/root');return json(folderMetadata(rootId));};
 const manageRequest=async(url,options={})=>{
  if(url.includes(`/files/${PRIVATE_FOLDER_ID}?`))return json(folderMetadata(PRIVATE_FOLDER_ID));
  assert.equal(new URL(url).pathname,`/drive/v3/files/${id}`);
  if(options.method==='PATCH'){
   const params=new URL(url).searchParams;assert.equal(params.get('addParents'),PRIVATE_FOLDER_ID);assert.equal(params.get('removeParents'),rootId);assert.deepEqual(JSON.parse(options.body),{});placements++;placed=true;
  }
  return exists?json(metadata(placed?PRIVATE_FOLDER_ID:rootId)):new Response(null,{status:404});
 };
 let reservation;const reserve=async(_job,candidate)=>reservation||=candidate;
 const transport=createDriveTransport({request,readRequest,manageRequest,reserve,getOperationGuard:()=>()=>{},storage:memory(),onProgress:value=>progress.push(value)});
 assert.equal((await transport.save({job,blob})).id,id);assert.deepEqual(ranges,['bytes 0-262143/300000','bytes 262144-299999/300000']);assert.equal(progress.at(-1),1);assert.equal(placements,1);
 // The second tab has no local session and verifies the owner-scoped reservation.
 assert.equal((await createDriveTransport({request,readRequest,manageRequest,reserve,getOperationGuard:()=>()=>{},storage:memory()}).save({job,blob})).id,id);assert.equal(ranges.length,2);assert.equal(placements,1);
});
test('network interruption queries acknowledged offset then resumes same file/session without duplicate creation',async()=>{
 const storage=memory();let posts=0,uploads=0,exists=false,placed=false,reservation;const ranges=[];
 const request=async(url,options={})=>{
  if(url.includes('/generateIds'))return json({ids:[id]});if(url.startsWith('https://www.googleapis.com/drive/v3/files?'))return json({files:[]});
  if(url.includes('/files/root?'))return json(folderMetadata(rootId));
  if(url.includes(`/files/${PRIVATE_FOLDER_ID}?`))return json(folderMetadata(PRIVATE_FOLDER_ID));
  if(url.includes(`/files/${id}?`)){if(options.method==='PATCH')placed=true;return exists?json(metadata(placed?PRIVATE_FOLDER_ID:rootId)):new Response(null,{status:404});}
  if(options.method==='POST'){posts++;return new Response(null,{headers:{Location:session}});}
  const range=options.headers['Content-Range'];ranges.push(range);
  if(range==='bytes */300000')return new Response(null,{status:308,headers:{Range:'bytes=0-262143'}});
  if(++uploads===1)throw new TypeError('offline after server acknowledged first chunk');exists=true;return json(metadata());
 };
 const transport=createDriveTransport({request,readRequest:request,manageRequest:request,getOperationGuard:()=>()=>{},reserve:async(_job,candidate)=>reservation||=candidate,storage});
 await assert.rejects(transport.save({job,blob}),/offline/);assert.equal((await transport.save({job,blob})).id,id);assert.equal(posts,1);assert.equal(ranges.at(-1),'bytes 262144-299999/300000');
});
test('expired session restarts using reserved ID and wrong parent/job/hash never becomes saved',async()=>{
 const storage=memory();storage.setItem('velum-drive-upload-v1:technical-job',JSON.stringify({id,sha256:job.result.sha256,session}));let posted;
 const request=async(url,options={})=>{if(url.includes('/files/root?'))return json(folderMetadata(rootId));if(url.includes(`/files/${PRIVATE_FOLDER_ID}?`))return json(folderMetadata(PRIVATE_FOLDER_ID));if(options.method==='POST'){posted=JSON.parse(options.body);return new Response(null,{status:409});}if(options.method==='PUT')return new Response(null,{status:404});return posted?json(metadata()):new Response(null,{status:404});};
 assert.equal((await createDriveTransport({request,readRequest:request,manageRequest:request,getOperationGuard:()=>()=>{},reserve:async()=>id,storage}).save({job,blob})).id,id);assert.equal(posted.id,id);assert.deepEqual(posted.parents,['root']);
 for(const wrong of [{parents:['root']},{parents:[PRIVATE_FOLDER_ID,'other-parent']},{appProperties:{velumJobId:'other',velumSha256:job.result.sha256}},{appProperties:{velumJobId:job.id,velumSha256:'0'.repeat(64)}},{size:1},{mimeType:'image/jpeg'},{ownedByMe:false},{trashed:true}])assert.throws(()=>verifySaved({...metadata(),...wrong},job));
 assert.throws(()=>uploadUrl('https://attacker.test/upload?upload_id=x'));
 assert.throws(()=>uploadUrl('https://www.googleapis.com:8443/upload/drive/v3/files?upload_id=x'));
 assert.throws(()=>uploadUrl('https://www.googleapis.com/drive/v3/files?upload_id=x'));
 const forbidden=()=>{throw new Error('must not send');};
 await assert.rejects(createDriveTransport({request:forbidden,readRequest:forbidden,manageRequest:forbidden,getOperationGuard:()=>()=>{},reserve:async()=>id,storage:memory()}).save({job,blob:new Blob([Buffer.alloc(300000)])}),/signature/);
});
test('explicit Connect is owner-only, requests shared scopes and cannot restore access after Quick Exit',async()=>{
 let complete,calls=0;
 const auth={currentUser:{uid:'5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',providerData:[{providerId:'google.com',uid:'fixture-google-user'}]}};
 const access=createDriveAccess({auth,storage:memory(),backupStorage:memory(),fetchImpl:async()=>json(grant()),requestAccess:scopes=>{assert.deepEqual(scopes,[...CONNECT_SCOPES]);calls++;return new Promise(resolve=>{complete=resolve;});}});
 const drive=createStudioDrive({auth,access,storage:memory()});
 const first=drive.authorize();drive.clear();complete({accessToken:'fixture-only-access'});await assert.rejects(first,/locked/);
 const second=drive.authorize();assert.equal(calls,2);complete({accessToken:'fixture-only-access'});await second;
 auth.currentUser={uid:'other'};await assert.rejects(async()=>drive.authorize(),/owner/i);assert.equal(calls,2);
});

// Existing synthetic transport setup never signs in or uploads to Google.
function fixture({read='',info=()=>grant(),folder=true,folderId=PRIVATE_FOLDER_ID,fetchOverride,accessError,backend=false}={}){
 const auth={currentUser:{uid:'5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',providerData:[{providerId:'google.com',uid:'fixture-google-user'}]}};
 const calls={oauth:0,picker:0,info:0,folder:0,writes:0,health:0,server:0},storage=memory(),backupStorage=memory();
 if(read)storage.setItem('velum-drive-access-v2',JSON.stringify({version:2,uid:auth.currentUser.uid,googleUid:'fixture-google-user',token:read,expiresAt:Date.now()+3600000}));
 const originalGoogle=globalThis.google;
 globalThis.google={picker:new Proxy({},{get(){calls.picker++;throw new Error('Save must not open Picker.');}})};
 const fetchImpl=async(url,options)=>{
  if(fetchOverride){const overridden=await fetchOverride(url,options);if(overridden)return overridden;}
  if(url==='/api/drive/health'){calls.health++;assert.equal(options.credentials,'same-origin');return json({service:'velum-drive',ready:false});}
  if(url==='/api/drive/session'||url==='/api/drive/start'){calls.server++;throw new Error('Temporary Drive authorization must not request a server session.');}
  if(url==='https://oauth2.googleapis.com/tokeninfo'){calls.info++;assert.equal(options.method,'POST');const token=options.body.get('access_token');return json(info(token,calls.info));}
  if(url.includes(`/files/${PRIVATE_FOLDER_ID}?`)){calls.folder++;return json({...folderMetadata(folderId),capabilities:{canAddChildren:folder}});}
  if(options?.method&&options.method!=='GET')calls.writes++;
  assert.equal(new URL(url).pathname,`/drive/v3/files/${id}`);
  // Already saved object exercises the production save/grant path without upload.
  return json(metadata());
 };
 const access=createDriveAccess({auth,storage,backupStorage,backend,requestAccess:async scopes=>{calls.oauth++;assert.deepEqual(scopes,[...CONNECT_SCOPES]);if(accessError)throw accessError;return{accessToken:'fixture-write'};},fetchImpl});
 const drive=createStudioDrive({auth,access,reserve:async()=>id,storage});
 return{drive,access,calls,auth,restore(){drive.clear();globalThis.google=originalGoogle;}};
}
test('Save authorizes on its user gesture and repeat Save reuses the verified grant without Picker',async()=>{
 for(const backend of [false,true]){
  const f=fixture({backend});
  try{
   await f.access.ready;
   assert.deepEqual(f.calls,{oauth:0,picker:0,info:0,folder:0,writes:0,health:backend?1:0,server:0});
   if(backend)assert.equal(f.access.mode,'temporary');
   if(!backend){await assert.rejects(f.drive.save({job,blob}),/Reconnect/);assert.equal(f.calls.oauth,0);}
   await f.drive.authorize();
   assert.equal(f.calls.oauth,1);assert.equal(f.calls.info,1);assert.equal(f.calls.server,0);assert.equal(f.access.has(CONNECT_SCOPES),true);
   await f.drive.save({job,blob});await f.drive.authorize();await f.drive.save({job,blob});
   assert.equal(f.calls.oauth,1);assert.equal(f.calls.info,1);assert.equal(f.calls.picker,0);assert.equal(f.calls.folder,2);assert.equal(f.calls.writes,0);assert.equal(f.calls.server,0);
  }finally{f.restore();}
 }
});
test('reload restores a verified combined scoped token without OAuth or Picker',async()=>{
 for(let reload=0;reload<2;reload++){
  const f=fixture({read:'fixture-combined'});
  try{await f.access.restore();await f.drive.authorize();await f.drive.save({job,blob});assert.equal(f.calls.oauth,0);assert.equal(f.calls.picker,0);assert.equal(f.calls.info,1);}finally{f.restore();}
 }
});
test('readonly canAddChildren cannot supply the complete Save grant',async()=>{
 const f=fixture({read:'fixture-readonly',info:token=>grant(token==='fixture-readonly'?DRIVE_READ_SCOPE:CONNECT_SCOPES.join(' '))});
 try{await assert.rejects(f.access.ensure(),/Reconnect/);assert.equal(f.calls.oauth,0);await f.drive.authorize();await f.drive.save({job,blob});assert.equal(f.calls.oauth,1);assert.equal(f.calls.info,2);assert.equal(f.calls.picker,0);}finally{f.restore();}
});
test('a file-scoped cached token cannot authorize metadata placement',async()=>{
 const f=fixture({read:'fixture-file-only',info:token=>grant(token==='fixture-file-only'?DRIVE_FILE_SCOPE:CONNECT_SCOPES.join(' '))});
 try{await assert.rejects(f.access.ensure(),/Reconnect/);assert.equal(f.calls.oauth,0);assert.equal(f.calls.writes,0);await f.drive.authorize();await f.drive.save({job,blob});assert.equal(f.calls.info,2);assert.equal(f.calls.picker,0);}finally{f.restore();}
});
test('expired, wrong-client and wrong-user cached tokens require renewed authorization on Save',async()=>{
 for(const invalid of [{expires_in:0},{aud:'other-client'},{sub:'other-user'}]){
  const f=fixture({read:'fixture-old',info:token=>grant(undefined,token==='fixture-old'?invalid:{})});
  try{await assert.rejects(f.access.ensure(),/Reconnect/);assert.equal(f.calls.oauth,0);await f.drive.authorize();await f.drive.save({job,blob});assert.equal(f.calls.oauth,1);assert.equal(f.calls.info,2);}finally{f.restore();}
 }
});
test('401 during folder verification requires reconnect and performs no writes or Picker selection',async()=>{
 let expired=true;
 const f=fixture({fetchOverride:async url=>url.includes(`/files/${PRIVATE_FOLDER_ID}?`)&&expired?json({},401):null});
 try{await f.drive.authorize();await assert.rejects(f.drive.save({job,blob}),/Reconnect/);assert.equal(f.calls.picker,0);assert.equal(f.calls.writes,0);expired=false;await f.drive.authorize();await f.drive.save({job,blob});assert.equal(f.calls.oauth,2);}finally{f.restore();}
});
test('verified lifetime respects Google expiry and Quick Exit rechecks retained access',async()=>{
 const now=Date.now;let time=now();Date.now=()=>time;
 const f=fixture({info:()=>grant(undefined,{expires_in:61})});
 try{await f.drive.authorize();await f.drive.save({job,blob});time+=2000;await f.drive.authorize();await f.drive.save({job,blob});assert.equal(f.calls.oauth,2);f.drive.clear();await f.access.restore();await f.drive.authorize();await f.drive.save({job,blob});assert.equal(f.calls.oauth,2);assert.equal(f.calls.info,3);assert.equal(f.calls.picker,0);}finally{Date.now=now;f.restore();}
});
test('unavailable token verification after Save authorization prevents writing or repeated requests',async()=>{
 const f=fixture({read:'fixture-read',fetchOverride:async()=>{throw new TypeError('network unavailable');}});
 try{await assert.rejects(async()=>{await f.drive.authorize();await f.drive.save({job,blob});},/network unavailable/);assert.equal(f.calls.oauth,1);assert.equal(f.calls.picker,0);assert.equal(f.calls.writes,0);}finally{f.restore();}
});
test('Quick Exit after Save authorization starts rejects its result without another OAuth request',async()=>{
 const f=fixture();
 try{const pending=f.drive.authorize();f.drive.clear();await assert.rejects(pending,/locked/);assert.equal(f.calls.oauth,1);}finally{f.restore();}
});
test('consent denial, partial consent and unavailable or wrong Private folder perform no writes',async()=>{
 for(const options of [{accessError:new Error('Consent denied')},{info:()=>grant(DRIVE_READ_SCOPE)},{folder:false},{folderId:'wrong-folder'}]){
  const f=fixture(options);
  try{await assert.rejects(async()=>{await f.drive.authorize();await f.drive.save({job,blob});});assert.equal(f.calls.picker,0);assert.equal(f.calls.writes,0);}finally{f.restore();}
 }
});
test('Quick Exit during token inspection or folder preflight prevents late upload',async()=>{
 for(const stage of ['info','folder']){
  let release,entered;
  const ready=new Promise(resolve=>{entered=resolve;});
  const f=fixture({fetchOverride:async url=>{
   if((stage==='info'&&url.includes('/tokeninfo'))||(stage==='folder'&&url.includes(`/files/${PRIVATE_FOLDER_ID}?`))){entered();await new Promise(resolve=>{release=resolve;});}return null;
  }});
  try{if(stage==='folder')await f.drive.authorize();const pending=stage==='info'?f.drive.authorize():f.drive.save({job,blob});await ready;f.drive.clear();release();await assert.rejects(pending,/locked|aborted/i);assert.equal(f.calls.picker,0);assert.equal(f.calls.writes,0);}finally{f.restore();}
 }
});
