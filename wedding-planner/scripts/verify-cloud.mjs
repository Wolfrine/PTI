import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,signInWithCustomToken} from 'firebase/auth';
import {getFirestore,getDocFromServer,doc,terminate,writeBatch} from 'firebase/firestore';
const {app,db:adminDb,auth:adminAuth}=createRequire(import.meta.url)('../../personal-functions/runtime.cjs');
const prefix=`wedding-verification-${randomUUID().slice(0,8)}`;
const users=[],apps=[],checks=[];
const root=`users/${prefix}-owner/weddingData/workspace`;
const config={apiKey:'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',projectId:'pti-app-2ab59',authDomain:'pti-app-2ab59.firebaseapp.com'};
async function attempt(label,fn,allowed) {
  let passed=false;
  try{await fn();passed=allowed;}catch(error){if(!allowed&&error.code==='permission-denied')passed=true;else throw Error(`${label}: ${error.code||'unexpected failure'}`);}
  checks.push({label,passed});if(!passed)throw Error(`${label}: authorization did not match expectation`);
}
try {
  for(const [role,verified] of [['owner',true],['member',true],['stranger',true],['unverified',false]]) {
    const uid=`${prefix}-${role}`,email=`${uid}@example.test`;
    await adminAuth.createUser({uid,email,emailVerified:verified});users.push(uid);
    const client=initializeApp(config,uid);apps.push(client);
    const token=await adminAuth.createCustomToken(uid);
    await signInWithCustomToken(getAuth(client),token);
  }
  await adminDb.doc(root).create({schemaVersion:1,verificationOnly:true});
  for(const role of ['member','unverified']) {
    const uid=`${prefix}-${role}`;await adminDb.doc(`${root}/members/${uid}@example.test`).create({email:`${uid}@example.test`,name:'Synthetic verification account',role:'editor',invitedBy:`${prefix}-owner`,invitedAt:new Date().toISOString()});
  }
  for(let i=0;i<apps.length;i++) {
    const role=['owner','member','stranger','unverified'][i],clientDb=getFirestore(apps[i]);
    await attempt(`${role} workspace access`,()=>getDocFromServer(doc(clientDb,root)),i<2);
  }
  const strangerDb=getFirestore(apps[2]);
  await attempt('non-family access to actual wedding workspace',()=>getDocFromServer(doc(strangerDb,'users/5PbKbpGf3AbarNrp6pyqJ5C5Ziu2/weddingData/workspace')),false);
  const ownerDb=getFirestore(apps[0]),memberDb=getFirestore(apps[1]),time=new Date().toISOString();
  const first={title:'Synthetic verification event',kind:'function',date:'',startAt:'',arrivalAt:'',venue:'',address:'',mapUrl:'',owner:'',status:'proposed',audience:'',menuText:'Synthetic example only',notes:'',source:'Live authorization check',revision:1,createdAt:time,createdBy:`${prefix}-owner`,updatedAt:time,updatedBy:`${prefix}-owner`,archived:false,lastChangeId:'verification-create'};
  async function write(clientDb,data,before){const batch=writeBatch(clientDb);batch.set(doc(clientDb,root+'/events/check'),data);batch.set(doc(clientDb,root+'/history/'+data.lastChangeId),{collection:'events',recordId:'check',revision:data.revision,actor:data.updatedBy,at:data.updatedAt,before,after:data,action:before?'updated':'created'});await batch.commit();}
  await attempt('owner atomic private write and history',()=>write(ownerDb,first,null),true);
  const next={...first,title:'Member updated verification event',revision:2,updatedBy:`${prefix}-member`,lastChangeId:'verification-update'};
  await attempt('member collaboration write and history',()=>write(memberDb,next,first),true);
  await attempt('saved record visible in another client',async()=>{const result=await getDocFromServer(doc(ownerDb,root+'/events/check'));if(result.data()?.title!==next.title||result.data()?.revision!==2)throw Error('Persisted value mismatch');},true);
  await attempt('stale revision rejected',()=>write(memberDb,{...next,title:'Stale',lastChangeId:'verification-stale'},next),false);
  await adminDb.doc(`${root}/members/${prefix}-member@example.test`).delete();
  await attempt('revoked member access',()=>getDocFromServer(doc(getFirestore(apps[1]),root)),false);
  const report=JSON.parse(await readFile('wedding-activation-report.json','utf8'));report.liveClientChecks=checks;report.liveClientVerifiedAt=new Date().toISOString();
  await writeFile('wedding-activation-report.json',JSON.stringify(report,null,2));
  console.log(`PASS ${checks.length} live client authorization checks with isolated synthetic accounts.`);
} finally {
  await Promise.allSettled(apps.map(async app=>{await terminate(getFirestore(app));await deleteApp(app);}));
  if(!root.startsWith(`users/${prefix}-owner/weddingData/`))throw Error('Unexpected verification cleanup root.');
  const cleanup=await Promise.allSettled([adminDb.recursiveDelete(adminDb.doc(root)),...users.map(uid=>adminAuth.deleteUser(uid))]);
  if(cleanup.some(result=>result.status==='rejected'))throw Error('Temporary verification cleanup was incomplete. Inspect the isolated verification accounts/workspace before retrying.');
}
