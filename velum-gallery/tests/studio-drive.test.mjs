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
const grant=(scope=DRIVE_FILE_SCOPE,extra={})=>({aud:'185802494856-rn0q6qi5goj0mifha0bkah55slu3kvju.apps.googleusercontent.com',scope,expires_in:3600,...extra});
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
 const drive=createStudioDrive({auth,storage:memory(),fetchImpl:async()=>json(grant()),requestAccess:scope=>{assert.equal(scope,DRIVE_FILE_SCOPE);calls++;return new Promise(resolve=>{complete=resolve;});}});
 const first=drive.authorize();await Promise.resolve();drive.clear();complete({accessToken:'fixture-only-access'});await assert.rejects(first,/locked/);
 const second=drive.authorize();await Promise.resolve();assert.equal(calls,2);complete({accessToken:'fixture-only-access'});await second;
 auth.currentUser={uid:'other'};await assert.rejects(drive.authorize(),/Owner/);assert.equal(calls,2);
});

// Synthetic transport/Picker only. These tests never sign in or upload to Google.
function fixture({read='',info=()=>grant(),folder=true,pick='private',fetchOverride,accessError}={}){
 const auth={currentUser:{uid:'5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',providerData:[{providerId:'google.com',uid:'fixture-google-user'}]}};
 const calls={oauth:0,picker:0,info:0,folder:0,writes:0};let authorized=folder;
 const originalGoogle=globalThis.google;
 class View{setIncludeFolders(){return this;}setSelectFolderEnabled(){return this;}setMimeTypes(){return this;}setParent(){return this;}}
 class Builder{
  setAppId(){return this;}setDeveloperKey(){return this;}setOAuthToken(){return this;}setOrigin(){return this;}setTitle(){return this;}addView(){return this;}setCallback(fn){this.callback=fn;return this;}
  build(){const callback=this.callback;return{dispose(){},setVisible(){calls.picker++;queueMicrotask(()=>{if(pick==='cancel')callback({action:'cancel'});else{authorized=pick==='private';callback({action:'picked',docs:[{id:authorized?PRIVATE_FOLDER_ID:'wrong-folder'}]});}});}};}
 }
 globalThis.google={picker:{DocsView:View,PickerBuilder:Builder,ViewId:{DOCS:'docs'},Action:{CANCEL:'cancel',PICKED:'picked'}}};globalThis.location={origin:'https://fixture.invalid'};
 const fetchImpl=async(url,options)=>{
  if(fetchOverride){const overridden=await fetchOverride(url,options);if(overridden)return overridden;}
  if(url==='https://oauth2.googleapis.com/tokeninfo'){calls.info++;assert.equal(options.method,'POST');const token=options.body.get('access_token');return json(info(token,calls.info));}
  if(url.includes(`/files/${PRIVATE_FOLDER_ID}?`)){calls.folder++;return json({id:PRIVATE_FOLDER_ID,mimeType:'application/vnd.google-apps.folder',isAppAuthorized:authorized,capabilities:{canAddChildren:true}});}
  if(options?.method&&options.method!=='GET')calls.writes++;
  // Already saved object exercises the production save/grant path without upload.
  return json(metadata());
 };
 const drive=createStudioDrive({auth,getReadAccess:()=>read,requestAccess:async scope=>{calls.oauth++;assert.equal(scope,DRIVE_FILE_SCOPE);if(accessError)throw accessError;return{accessToken:'fixture-write'};},fetchImpl,reserve:async()=>id,storage:memory()});
 return{drive,calls,auth,restore(){drive.clear();globalThis.google=originalGoogle;delete globalThis.location;}};
}
test('first Save requests file scope and Picker; repeat Save reuses verified token and folder grant',async()=>{
 const f=fixture({folder:false,info:()=>grant(DRIVE_FILE_SCOPE,{sub:'fixture-google-user'})});
 try{
  assert.deepEqual(f.calls,{oauth:0,picker:0,info:0,folder:0,writes:0});
  await f.drive.save({job,blob});await f.drive.save({job,blob});
  assert.equal(f.calls.oauth,1);assert.equal(f.calls.info,1);assert.equal(f.calls.picker,1);assert.equal(f.calls.folder,3);assert.equal(f.calls.writes,0);
 }finally{f.restore();}
});
test('reload reuses an existing combined scoped token and app-authorized folder without OAuth or Picker',async()=>{
 for(let reload=0;reload<2;reload++){
  const f=fixture({read:'fixture-combined',info:()=>grant(`${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/drive.readonly`,{sub:'fixture-google-user'})});
  try{await f.drive.save({job,blob});assert.equal(f.calls.oauth,0);assert.equal(f.calls.picker,0);assert.equal(f.calls.info,1);}finally{f.restore();}
 }
});
test('readonly canAddChildren never replaces a verified drive.file grant',async()=>{
 const f=fixture({read:'fixture-readonly',info:token=>grant(token==='fixture-readonly'?'https://www.googleapis.com/auth/drive.readonly':DRIVE_FILE_SCOPE,{sub:'fixture-google-user'})});
 try{await f.drive.save({job,blob});assert.equal(f.calls.oauth,1);assert.equal(f.calls.info,2);assert.equal(f.calls.picker,0);}finally{f.restore();}
});
test('a file-scoped token still requires Picker when folder is not app-authorized',async()=>{
 const f=fixture({folder:false,read:'fixture-combined',info:()=>grant(DRIVE_FILE_SCOPE,{sub:'fixture-google-user'})});
 try{await f.drive.save({job,blob});assert.equal(f.calls.oauth,0);assert.equal(f.calls.picker,1);}finally{f.restore();}
});
test('expired, wrong-client and wrong-user cached tokens cannot supply a write grant',async()=>{
 for(const invalid of [{expires_in:0},{aud:'other-client'},{sub:'other-user'}]){
  const f=fixture({read:'fixture-old',info:token=>grant(DRIVE_FILE_SCOPE,{sub:'fixture-google-user',...(token==='fixture-old'?invalid:{})})});
  try{await f.drive.save({job,blob});assert.equal(f.calls.oauth,1);assert.equal(f.calls.info,2);}finally{f.restore();}
 }
});
test('401 during folder verification is retryable and does not open Picker or write',async()=>{
 let expired=true;
 const f=fixture({info:()=>grant(DRIVE_FILE_SCOPE,{sub:'fixture-google-user'}),fetchOverride:async url=>url.includes(`/files/${PRIVATE_FOLDER_ID}?`)&&expired?json({},401):null});
 try{await assert.rejects(f.drive.save({job,blob}),/expired/);assert.equal(f.calls.picker,0);assert.equal(f.calls.writes,0);expired=false;await f.drive.save({job,blob});assert.equal(f.calls.oauth,2);}finally{f.restore();}
});
test('verified token lifetime is bounded by Google expiry; clear also requires fresh verification',async()=>{
 const now=Date.now;let time=now();Date.now=()=>time;
 const f=fixture({info:()=>grant(DRIVE_FILE_SCOPE,{sub:'fixture-google-user',expires_in:61})});
 try{await f.drive.save({job,blob});time+=2000;await f.drive.save({job,blob});assert.equal(f.calls.oauth,2);f.drive.clear();await f.drive.save({job,blob});assert.equal(f.calls.oauth,3);assert.equal(f.calls.info,3);assert.equal(f.calls.picker,0);}finally{Date.now=now;f.restore();}
});
test('unavailable token verification fails without opening repeated consent or writing',async()=>{
 const f=fixture({read:'fixture-read',fetchOverride:async()=>{throw new TypeError('network unavailable');}});
 try{await assert.rejects(f.drive.save({job,blob}),/Could not verify/);assert.equal(f.calls.oauth,0);assert.equal(f.calls.picker,0);assert.equal(f.calls.writes,0);}finally{f.restore();}
});
test('Quick Exit before authorization yields cannot open a delayed OAuth popup',async()=>{
 const f=fixture();
 try{const pending=f.drive.authorize();f.drive.clear();await assert.rejects(pending,/locked/);assert.equal(f.calls.oauth,0);}finally{f.restore();}
});
test('consent denial, partial consent, Picker cancellation and wrong folder perform no writes',async()=>{
 for(const options of [{accessError:new Error('Consent denied')},{info:()=>grant('https://www.googleapis.com/auth/drive.readonly',{sub:'fixture-google-user'})},{folder:false,pick:'cancel',info:()=>grant(DRIVE_FILE_SCOPE,{sub:'fixture-google-user'})},{folder:false,pick:'wrong',info:()=>grant(DRIVE_FILE_SCOPE,{sub:'fixture-google-user'})}]){
  const f=fixture(options);
  try{await assert.rejects(f.drive.save({job,blob}));assert.equal(f.calls.writes,0);}finally{f.restore();}
 }
});
test('Quick Exit during token inspection or folder preflight prevents late Picker/upload and clears verified access',async()=>{
 for(const stage of ['info','folder']){
  let release,entered;
  const ready=new Promise(resolve=>{entered=resolve;});
  const f=fixture({folder:false,info:()=>grant(DRIVE_FILE_SCOPE,{sub:'fixture-google-user'}),fetchOverride:async url=>{
   if((stage==='info'&&url.includes('/tokeninfo'))||(stage==='folder'&&url.includes(`/files/${PRIVATE_FOLDER_ID}?`))){entered();await new Promise(resolve=>{release=resolve;});}return null;
  }});
  try{const pending=f.drive.save({job,blob});await ready;f.drive.clear();release();await assert.rejects(pending,/locked/);assert.equal(f.calls.picker,0);assert.equal(f.calls.writes,0);}finally{f.restore();}
 }
});
