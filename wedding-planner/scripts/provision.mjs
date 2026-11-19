import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {weddingSeed} from './seed-record.mjs';

const {app,db,auth}=createRequire(import.meta.url)('../../personal-functions/runtime.cjs');
const project='pti-app-2ab59',site='mahima-mayank',uid='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
const token=(await app.options.credential.getAccessToken()).access_token;
const report={project,site,database:'(default)',seeded:false,authDomainsReady:false,verifiedAt:null};
async function request(url,method='GET',data,allow404=false) {
  const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});
  if(allow404&&response.status===404)return null;
  const body=await response.json();
  if(!response.ok)throw Error(`${method} ${new URL(url).hostname}: ${response.status} ${body.error?.message||''}`);
  return body;
}
const sameFields=(a,b)=>a&&Object.keys(a).length===Object.keys(b).length&&Object.entries(b).every(([key,value])=>a[key]===value);
// Hosting/bootstrap is independent of the global shared Firestore rules release.
const database=await request(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`);
report.location=database.locationId;
// The general PTI user document is not an identity authority. Read Firebase Auth.
const ownerIdentity=await auth.getUser(uid),ownerEmail=ownerIdentity.email?.trim().toLowerCase();
if(ownerIdentity.disabled||!ownerIdentity.emailVerified||!ownerEmail||ownerEmail.length>254||!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(ownerEmail))throw Error('The protected wedding owner must have an enabled, verified Firebase Auth email. No bootstrap or rules changes made.');
const configUrl=`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const google=await request(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/google.com`);
if(google.enabled!==true)throw Error('The existing Firebase Google sign-in provider is disabled. Enable it before family launch.');
report.googleProviderEnabled=true;
const root=db.doc(`users/${uid}/weddingData/workspace`),member=root.collection('members').doc(ownerEmail),profile=root.collection('accessRequests').doc(uid);
const seed=weddingSeed(await readFile('wedding-planner/WEDDING_RECORD.md','utf8'));
// Bootstrap the verified protected key before publishing role rules that rely on it.
// Existing operational records and history never participate in this transaction.
await db.runTransaction(async tx=>{
  const [workspace,existingMember,existingProfile]=await Promise.all([tx.get(root),tx.get(member),tx.get(profile)]);
  const metadata=workspace.data(),oldMember=existingMember.data(),oldProfile=existingProfile.data();
  if(metadata?.ownerEmail&&metadata.ownerEmail!==ownerEmail)throw Error('The protected owner email differs from verified Auth. Review an explicit owner-email migration; existing data was not changed.');
  if(metadata?.ownerUid&&metadata.ownerUid!==uid)throw Error('The workspace owner differs from the protected owner. Existing data was not changed.');
  const at=new Date().toISOString(),name=(ownerIdentity.displayName||ownerEmail).slice(0,180);
  if(!workspace.exists) {
    tx.create(root,{schemaVersion:1,title:'Mahima & Mayank · Family',seedSource:'WEDDING_RECORD.md',seedSourceHash:seed.sourceHash,createdAt:at,ownerUid:uid,ownerEmail});
    for(const collection of ['events','decisions'])for(const {id,...data} of seed[collection])tx.create(root.collection(collection).doc(id),{...data,revision:1,createdAt:at,createdBy:uid,updatedAt:at,updatedBy:uid,archived:false,lastChangeId:'initial-record-import'});
    report.seeded=true;
  } else if(metadata.ownerEmail!==ownerEmail)tx.set(root,{ownerEmail},{merge:true});
  const pinned={email:ownerEmail,name,role:'admin',invitedAt:typeof oldMember?.invitedAt==='string'?oldMember.invitedAt:at,invitedBy:typeof oldMember?.invitedBy==='string'?oldMember.invitedBy:uid};
  for(const field of ['updatedAt','updatedBy'])if(typeof oldMember?.[field]==='string')pinned[field]=oldMember[field];
  if(!sameFields(oldMember,pinned))tx.set(member,pinned);
  // Empty times mean owner bootstrap, not a fabricated wedding-family login.
  const registered={uid,email:ownerEmail,name,firstSeenAt:typeof oldProfile?.firstSeenAt==='string'?oldProfile.firstSeenAt:'',lastSeenAt:typeof oldProfile?.lastSeenAt==='string'?oldProfile.lastSeenAt:''};
  if(!sameFields(oldProfile,registered))tx.set(profile,registered);
  report.ownerBootstrap={identityVerified:true,protectedKeyReady:true,adminMembershipPinned:true,profileCreated:!existingProfile.exists,operationalWorkspacePreserved:workspace.exists};
});
const siteUrl=`https://firebasehosting.googleapis.com/v1beta1/projects/${project}/sites/${site}`;
if(!await request(siteUrl,'GET',undefined,true))await request(`https://firebasehosting.googleapis.com/v1beta1/projects/${project}/sites?siteId=${site}`,'POST',{});
const config=await request(configUrl),domains=[...new Set([...(config.authorizedDomains||[]),`${site}.web.app`,`${site}.firebaseapp.com`])];
if(domains.length!==(config.authorizedDomains||[]).length)await request(configUrl+'?updateMask=authorizedDomains','PATCH',{authorizedDomains:domains});
report.authDomainsReady=true;
report.verifiedAt=new Date().toISOString();
report.liveGooglePopupVerified=false;
await writeFile('wedding-activation-report.json',JSON.stringify(report,null,2));
console.log('Wedding Hosting identity, protected shared workspace and Google sign-in domains ready. Existing wedding records preserved.');
