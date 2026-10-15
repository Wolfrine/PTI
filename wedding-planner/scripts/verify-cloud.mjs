import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,signInWithCustomToken} from 'firebase/auth';
import {getFirestore,getDocFromServer,getDocsFromServer,doc,collection,setDoc,updateDoc,deleteDoc,terminate,writeBatch} from 'firebase/firestore';
const {db:adminDb,auth:adminAuth}=createRequire(import.meta.url)('../../personal-functions/runtime.cjs');
const prefix=`wedding-verification-${randomUUID().slice(0,8)}`;
const users=[],apps=[],checks=[],clients={};
const root=`users/${prefix}-owner/weddingData/workspace`,at=new Date().toISOString();
const config={apiKey:'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',projectId:'pti-app-2ab59',authDomain:'pti-app-2ab59.firebaseapp.com'};
const account=role=>({uid:`${prefix}-${role}`,email:`${prefix}-${role}@example.test`});
const member=(role,access=role)=>({email:account(role).email,name:'Synthetic verification account',role:access,invitedBy:account('owner').uid,invitedAt:at});
const profile=role=>({uid:account(role).uid,email:account(role).email,name:'Synthetic verification account',firstSeenAt:at,lastSeenAt:at});
const profileRef=(db,role)=>doc(db,`${root}/accessRequests/${account(role).uid}`);
const memberRef=(db,role)=>doc(db,`${root}/members/${account(role).email}`);
async function attempt(label,fn,allowed) {
  let passed=false;
  try{await fn();passed=allowed;}catch(error){if(!allowed&&error.code==='permission-denied')passed=true;else throw Error(`${label}: ${error.code||error.message||'unexpected failure'}`);}
  checks.push({label,passed});if(!passed)throw Error(`${label}: authorization did not match expectation`);
}
async function assign(actor,target,role) {
  const db=clients[actor],ref=memberRef(db,target),before=await getDocFromServer(ref);
  const data=before.exists()?{...before.data(),role,updatedAt:at,updatedBy:account(actor).uid}:{...member(target,role),invitedBy:account(actor).uid};
  await setDoc(ref,data);
}
function event(actor,id) {
  return {title:'Synthetic verification event',kind:'function',date:'',startAt:'',arrivalAt:'',venue:'',address:'',mapUrl:'',owner:'',status:'proposed',audience:'',menuText:'Synthetic example only',notes:'',source:'Isolated live authorization check',revision:1,createdAt:at,createdBy:account(actor).uid,updatedAt:at,updatedBy:account(actor).uid,archived:false,lastChangeId:id};
}
async function write(db,id,data,before=null) {
  const batch=writeBatch(db);batch.set(doc(db,`${root}/events/${id}`),data);
  batch.set(doc(db,`${root}/history/${data.lastChangeId}`),{collection:'events',recordId:id,revision:data.revision,actor:data.updatedBy,at:data.updatedAt,before,after:data,action:before?'updated':'created'});
  await batch.commit();
}
try {
  // These are verified-email custom-token checks, not a claim of real Google OAuth.
  for(const role of ['owner','admin','family','editor','viewer','pending','blocked','unverified']) {
    const {uid,email}=account(role);
    await adminAuth.createUser({uid,email,emailVerified:role!=='unverified'});users.push(uid);
    const client=initializeApp(config,uid);apps.push(client);
    await signInWithCustomToken(getAuth(client),await adminAuth.createCustomToken(uid));
    clients[role]=getFirestore(client);
  }
  await adminDb.doc(root).create({schemaVersion:1,verificationOnly:true,ownerUid:account('owner').uid,ownerEmail:account('owner').email});
  for(const role of ['owner','admin','family','editor','viewer','blocked','unverified'])await adminDb.doc(`${root}/members/${account(role).email}`).create(member(role,role==='owner'?'admin':role==='unverified'?'family':role));
  for(const role of ['owner','admin','family','editor','viewer','pending','blocked'])await attempt(`${role} can register its own verified identity`,()=>setDoc(profileRef(clients[role],role),profile(role)),true);
  await attempt('unverified account cannot register',()=>setDoc(profileRef(clients.unverified,'unverified'),profile('unverified')),false);
  await attempt('registration cannot inject an admin role',()=>setDoc(profileRef(clients.pending,'pending'),{...profile('pending'),role:'admin'}),false);
  await attempt('registration cannot forge another identity',()=>setDoc(profileRef(clients.pending,'pending'),{...profile('pending'),email:account('owner').email}),false);
  await attempt('registration cannot write another UID profile',()=>setDoc(profileRef(clients.pending,'viewer'),profile('viewer')),false);
  await attempt('registration preserves first seen',()=>updateDoc(profileRef(clients.pending,'pending'),{firstSeenAt:'2020-01-01T00:00:00.000Z'}),false);
  await attempt('registration permits a later seen update',()=>updateDoc(profileRef(clients.pending,'pending'),{lastSeenAt:new Date().toISOString()}),true);
  for(const role of ['owner','admin','family','editor','viewer','pending','blocked','unverified'])await attempt(`${role} workspace read`,()=>getDocFromServer(doc(clients[role],root)),['owner','admin','family','editor','viewer'].includes(role));
  for(const role of ['owner','admin','family','viewer','pending','blocked']) {
    const allowed=role==='owner'||role==='admin';
    await attempt(`${role} member directory access`,()=>getDocsFromServer(collection(clients[role],root+'/members')),allowed);
    await attempt(`${role} registered identity directory access`,()=>getDocsFromServer(collection(clients[role],root+'/accessRequests')),allowed);
  }
  await attempt('pending can read its own registration',()=>getDocFromServer(profileRef(clients.pending,'pending')),true);
  await attempt('pending cannot read another registration',()=>getDocFromServer(profileRef(clients.pending,'family')),false);
  await attempt('pending self-promotion is denied',()=>setDoc(memberRef(clients.pending,'pending'),{...member('pending','admin'),invitedBy:account('pending').uid}),false);
  await attempt('atomic profile and admin self-promotion is denied',async()=>{const own=(await getDocFromServer(profileRef(clients.pending,'pending'))).data(),batch=writeBatch(clients.pending);batch.set(profileRef(clients.pending,'pending'),{...own,lastSeenAt:new Date().toISOString()});batch.set(memberRef(clients.pending,'pending'),{...member('pending','admin'),invitedBy:account('pending').uid});await batch.commit();},false);
  await attempt('family cannot assign roles',()=>setDoc(memberRef(clients.family,'pending'),{...member('pending','admin'),invitedBy:account('family').uid}),false);
  await attempt('non-family access to actual wedding workspace is denied',()=>getDocFromServer(doc(clients.pending,'users/5PbKbpGf3AbarNrp6pyqJ5C5Ziu2/weddingData/workspace')),false);
  const first=event('owner','verification-create');
  await attempt('owner atomic record and history write',()=>write(clients.owner,'check',first),true);
  const second={...first,title:'Family collaboration',revision:2,updatedBy:account('family').uid,lastChangeId:'verification-family'};
  await attempt('family atomic collaboration write',()=>write(clients.family,'check',second,first),true);
  const third={...second,title:'Legacy editor collaboration',revision:3,updatedBy:account('editor').uid,lastChangeId:'verification-editor'};
  await attempt('legacy editor remains a family editor',()=>write(clients.editor,'check',third,second),true);
  await attempt('viewer reads saved records',async()=>{const value=await getDocFromServer(doc(clients.viewer,root+'/events/check'));if(value.data()?.revision!==3)throw Error('Persisted value mismatch');},true);
  await attempt('viewer cannot write records or history',()=>write(clients.viewer,'viewer-write',event('viewer','viewer-write')),false);
  await attempt('blocked cannot read records',()=>getDocFromServer(doc(clients.blocked,root+'/events/check')),false);
  await attempt('blocked cannot write records',()=>write(clients.blocked,'blocked-write',event('blocked','blocked-write')),false);
  await attempt('pending cannot read history',()=>getDocsFromServer(collection(clients.pending,root+'/history')),false);
  await attempt('admin approves a pending identity',()=>assign('admin','pending','family'),true);
  await attempt('approved identity reads private workspace immediately',()=>getDocFromServer(doc(clients.pending,root)),true);
  await attempt('approved identity can edit',()=>write(clients.pending,'approved-write',event('pending','approved-write')),true);
  await attempt('admin downgrades family to viewer',()=>assign('admin','pending','viewer'),true);
  await attempt('downgraded viewer cannot edit with its existing token',()=>write(clients.pending,'downgraded-write',event('pending','downgraded-write')),false);
  await attempt('admin blocks a viewer',()=>assign('admin','pending','blocked'),true);
  await attempt('blocked role revokes existing token reads',()=>getDocFromServer(doc(clients.pending,root)),false);
  await attempt('admin cannot demote protected owner',()=>assign('admin','owner','family'),false);
  await attempt('admin cannot block protected owner',()=>assign('admin','owner','blocked'),false);
  await attempt('admin cannot remove protected owner membership',()=>deleteDoc(memberRef(clients.admin,'owner')),false);
  await attempt('admin cannot replace protected root owner email',()=>updateDoc(doc(clients.admin,root),{ownerEmail:account('admin').email}),false);
  await attempt('owner downgrades another admin',()=>assign('owner','admin','family'),true);
  await attempt('former admin cannot manage roles with its existing token',()=>setDoc(memberRef(clients.admin,'pending'),{...member('pending','admin'),invitedBy:account('admin').uid,updatedAt:at,updatedBy:account('admin').uid}),false);
  await attempt('immutable history remains immutable for owner',()=>updateDoc(doc(clients.owner,root+'/history/verification-create'),{actor:account('viewer').uid}),false);
  await attempt('stale revision remains rejected',()=>write(clients.family,'check',{...third,lastChangeId:'verification-stale',updatedBy:account('family').uid},third),false);
  await adminDb.doc(`${root}/members/${account('owner').email}`).delete();
  await attempt('protected owner remains admin without a membership document',()=>getDocsFromServer(collection(clients.owner,root+'/accessRequests')),true);
  await attempt('owner can reinstate its pinned admin membership',()=>assign('owner','owner','admin'),true);
  const report=JSON.parse(await readFile('wedding-activation-report.json','utf8'));report.liveClientChecks=checks;report.liveClientVerifiedAt=new Date().toISOString();report.liveClientIdentityMethod='Isolated verified-email custom tokens; Google popup not tested';
  await writeFile('wedding-activation-report.json',JSON.stringify(report,null,2));
  console.log(`PASS ${checks.length} isolated live client registration, role, collaboration and owner-protection checks.`);
} finally {
  await Promise.allSettled(apps.map(async client=>{await terminate(getFirestore(client));await deleteApp(client);}));
  if(!root.startsWith(`users/${prefix}-owner/weddingData/`))throw Error('Unexpected verification cleanup root.');
  const cleanup=await Promise.allSettled([adminDb.recursiveDelete(adminDb.doc(root)),...users.map(uid=>adminAuth.deleteUser(uid))]);
  if(cleanup.some(result=>result.status==='rejected'))throw Error('Temporary verification cleanup was incomplete. Inspect the isolated verification accounts/workspace before retrying.');
}
