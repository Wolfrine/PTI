import test from 'node:test';
import assert from 'node:assert/strict';
import {createDriveLibrary,libraryQuery,PRIVATE_FOLDER_ID as P,REFERENCES_FOLDER_ID as R,POSE_CATEGORIES} from '../drive-library.mjs';
import {createStudioDrive,DRIVE_READ_SCOPE} from '../studio-drive.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('combined library query uses both exact roots, escapes search and never recurses arbitrary folders',()=>{
 const q=libraryQuery({search:"summer's \\ look"});assert.ok(q.includes(`'${P}' in parents or '${R}' in parents`));assert.ok(q.includes("summer\\'s \\\\ look"));
 assert.ok(!libraryQuery({folder:'private'}).includes(R));assert.throws(()=>libraryQuery({folder:'unknown'}));
});
test('reference pages preserve folder labels and cursor without full media reads',async()=>{
 const library=createDriveLibrary({readRequest:async url=>{const params=new URL(url).searchParams;assert.equal(params.get('pageToken'),'next');assert.equal(params.get('pageSize'),'60');return json({files:[{id:'fixture123',name:'Fixture',parents:[R]}],nextPageToken:'last'});}});
 const page=await library.listReferences({folder:'references',cursor:'next'});assert.equal(page.files[0].folderLabel,'References');assert.equal(page.cursor,'last');
});
test('fixture move preserves ID; Undo restores parent; stale external moves cannot be overwritten',async()=>{
 let parents=[P],writes=0;const file={id:'fixture123',name:'Disposable owned fixture'};
 const library=createDriveLibrary({grantFile:async()=>({...file,parents,ownedByMe:true,capabilities:{canMoveItemWithinDrive:true}}),grantFolder:async()=>{},readRequest:async()=>json({...file,parents}),writeRequest:async(url)=>{writes++;const params=new URL(url).searchParams;assert.equal(params.get('removeParents'),parents[0]);parents=[params.get('addParents')];return json({...file,parents});}});
 const moved=await library.move(file,R);assert.equal(moved.file.id,file.id);assert.deepEqual(parents,[R]);await library.undo(moved.recovery);assert.deepEqual(parents,[P]);assert.equal(writes,2);
 const stale=createDriveLibrary({grantFile:async()=>({...file,parents:[P],ownedByMe:true,capabilities:{canMoveItemWithinDrive:true}}),grantFolder:async()=>{},readRequest:async()=>json({...file,parents:['elsewhere']}),writeRequest:()=>{throw Error('must not write');}});
 await assert.rejects(stale.move(file,R),/moved elsewhere/);
});
test('ownership and capabilities gate trash; fixture trash is reversible and no DELETE exists',async()=>{
 let trashed=false;const calls=[],file={id:'fixture123',name:'Fixture',parents:[R]};
 const library=createDriveLibrary({grantFile:async()=>({...file,ownedByMe:true,capabilities:{canTrash:true}}),writeRequest:async(url,options)=>{calls.push(options.method);trashed=JSON.parse(options.body).trashed;return json({...file,trashed});}});
 const recovery=await library.trash(file);assert.equal(trashed,true);await library.undo(recovery);assert.equal(trashed,false);assert.deepEqual(calls,['PATCH','PATCH']);
 await assert.rejects(createDriveLibrary({grantFile:async()=>({...file,ownedByMe:false})}).trash(file),/Only your images/);
});
test('single-person pose sampling excludes two-person category and excludes current file',async()=>{
 const seen=[];const library=createDriveLibrary({readRequest:async url=>{seen.push(new URL(url).searchParams.get('q'));return json({files:[{id:'old-pose',name:'Old'},{id:'new-pose',name:'New'}]});}});
 const pose=await library.choosePose({category:'auto',excludeId:'old-pose',random:()=>.99});assert.equal(pose.id,'new-pose');assert.equal(pose.category,'upper-body');assert.ok(!seen[0].includes(POSE_CATEGORIES['two-person'].id));
 await assert.rejects(library.choosePose({category:'two-person'}),/Enable two-person/);
});
const owner={uid:'5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',providerData:[{providerId:'google.com',uid:'fixture-google-user'}]};
const info={aud:'185802494856-rn0q6qi5goj0mifha0bkah55slu3kvju.apps.googleusercontent.com',scope:DRIVE_READ_SCOPE,sub:'fixture-google-user',expires_in:3600};
test('manual reference browsing reuses verified readonly scope without file grant; wrong Google user fails',async()=>{
 let popups=0;const scopes=[];
 const drive=createStudioDrive({auth:{currentUser:owner},getReadAccess:()=> 'fixture-read',requestAccess:async scope=>{popups++;scopes.push(scope);return null;},fetchImpl:async url=>url.includes('tokeninfo')?json(info):json({files:[]})});
 await drive.listReferences();assert.equal(popups,0);
 const wrong=createStudioDrive({auth:{currentUser:owner},getReadAccess:()=> 'fixture-wrong',requestAccess:async()=>null,fetchImpl:async()=>json({...info,sub:'wrong-user'})});
 await assert.rejects(wrong.listReferences(),/did not grant read/);
});
test('lock during readonly preflight cannot open late OAuth or return private files',async()=>{
 let release,popups=0;const drive=createStudioDrive({auth:{currentUser:owner},getReadAccess:()=> 'fixture-read',requestAccess:async()=>{popups++;},fetchImpl:()=>new Promise(resolve=>release=resolve)});
 const pending=drive.listReferences();drive.clear();release(json(info));await assert.rejects(pending,/locked/);assert.equal(popups,0);
});
