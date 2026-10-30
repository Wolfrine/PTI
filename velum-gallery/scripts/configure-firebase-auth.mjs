import fs from 'node:fs';
import { GoogleAuth } from 'google-auth-library';
import {serviceDisabled,waitForServiceOperation} from './cloud-checks.mjs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'pti-app-2ab59';
const siteId = process.env.VELUM_SITE_ID || 'pti-app-2ab59-velum';
const webApiKey = 'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs';
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!credentialsPath || !fs.existsSync(credentialsPath)) {
  throw new Error('GOOGLE_APPLICATION_CREDENTIALS is missing.');
}

const auth = new GoogleAuth({
  keyFile: credentialsPath,
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});
const client = await auth.getClient();
const token = await client.getAccessToken();
const accessToken = typeof token === 'string' ? token : token?.token;
if (!accessToken) throw new Error('Could not obtain Google Cloud access token.');

const headers = {
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
};

async function configureAuthorizedDomains() {
  const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
  const currentResponse = await fetch(base, { headers });
  if (!currentResponse.ok) {
    throw new Error(`Could not read Firebase Auth config (${currentResponse.status}): ${await currentResponse.text()}`);
  }

  const current = await currentResponse.json();
  const required = [`${siteId}.web.app`, `${siteId}.firebaseapp.com`];
  const existing = current.authorizedDomains || [];
  const authorizedDomains = [...new Set([...existing, ...required])];
  const changed = required.some(domain => !existing.includes(domain))
    || current.signIn?.anonymous?.enabled !== true || current.autodeleteAnonymousUsers === true;

  if (!changed) {
    console.log('Velum Firebase Auth domains and durable device sign-in are configured.');
    return;
  }

  // This step depends on the owner/device-isolation rules deployment. Never run
  // an Admin credential on the PC; CI only configures the existing Auth project.
  const patchResponse = await fetch(`${base}?updateMask=authorizedDomains,signIn.anonymous.enabled,autodeleteAnonymousUsers`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ authorizedDomains, signIn: { anonymous: { enabled: true } }, autodeleteAnonymousUsers: false })
  });
  if (!patchResponse.ok) {
    throw new Error(`Could not update Firebase Auth config (${patchResponse.status}): ${await patchResponse.text()}`);
  }

  console.log(`Authorized Firebase Auth domains: ${required.join(', ')}`);
}

async function probeDriveApi() {
  const probe = await fetch(`https://www.googleapis.com/drive/v3/about?fields=user&key=${encodeURIComponent(webApiKey)}`);
  const text = await probe.text();
  let body = {};
  try { body = JSON.parse(text); } catch {}

  const disabled = serviceDisabled(body,'drive.googleapis.com');

  if (disabled) return false;

  // A 401 is expected without OAuth. This reaches Drive, but does not establish
  // project activation; the authenticated Service Usage check below does that.
  if ([400, 401, 403].includes(probe.status)) {
    console.log(`Google Drive API probe reached the service (HTTP ${probe.status}); OAuth is expected for actual data.`);
    return true;
  }

  if (probe.ok) {
    console.log('Google Drive API probe succeeded.');
    return true;
  }

  throw new Error(`Unexpected Google Drive API probe response (${probe.status}): ${text}`);
}

async function ensureCloudService(service) {
  const serviceName = `projects/${projectId}/services/${service}`;
  const serviceUrl = `https://serviceusage.googleapis.com/v1/${serviceName}`;
  const current=await fetch(serviceUrl,{headers});
  if(current.ok&&(await current.json()).state==='ENABLED'){console.log(`${service}: project service state ENABLED.`);return;}
  const enableResponse = await fetch(`${serviceUrl}:enable`, {
    method: 'POST',
    headers,
    body: '{}'
  });
  if (!enableResponse.ok) {
    throw new Error(`${service}: existing CI identity could not confirm or enable the service (HTTP ${enableResponse.status}).`);
  }

  const operation = await enableResponse.json();
  await waitForServiceOperation(operation,{read:async name=>{
    const response=await fetch(`https://serviceusage.googleapis.com/v1/${name}`,{headers});
    if(!response.ok)throw new Error(`${service}: operation status unavailable (HTTP ${response.status}).`);
    return response.json();
  }});
  console.log(`${service}: completed project enable operation verified.`);
}

async function ensureDriveApi() {
  await ensureCloudService('drive.googleapis.com');
  if (!(await probeDriveApi())) throw new Error('Google Drive API still appears disabled after enable request.');
}

await configureAuthorizedDomains();
await ensureDriveApi();

// Picker grants drive.file access to the existing folder; a read-only metadata
// response cannot establish that grant. Use only the existing CI identity.
async function ensurePickerApi(){
  await ensureCloudService('picker.googleapis.com');
}
async function configurePickerKey(){
  // Reuse the public Firebase web key. Preserve every existing restriction;
  // add only the two APIs and iframe origin required by Google's Picker guide.
  const url=`https://apikeys.googleapis.com/v2/keys:lookupKey?keyString=${encodeURIComponent(webApiKey)}`;
  let lookup=await fetch(url,{headers});
  if(!lookup.ok){
    const body=await lookup.clone().json().catch(()=>({}));
    if(serviceDisabled(body,'apikeys.googleapis.com')){await ensureCloudService('apikeys.googleapis.com');lookup=await fetch(url,{headers});}
  }
  if(!lookup.ok)throw new Error(`Existing CI identity cannot inspect the public web key's Picker restrictions (${lookup.status}). Phone Picker availability remains unverified.`);
  const name=(await lookup.json()).name;
  if(typeof name!=='string'||!name.startsWith('projects/185802494856/'))throw new Error('Unexpected public web key project; no key configuration changed.');
  const response=await fetch(`https://apikeys.googleapis.com/v2/${name}`,{headers});
  if(!response.ok)throw new Error(`Could not inspect public web key restrictions (${response.status}).`);
  const key=await response.json(),restrictions=structuredClone(key.restrictions||{});let changed=false;
  if(restrictions.apiTargets?.length){
    for(const service of ['picker.googleapis.com','drive.googleapis.com'])if(!restrictions.apiTargets.some(target=>target.service===service)){restrictions.apiTargets.push({service});changed=true;}
  }
  if(restrictions.browserKeyRestrictions){
    const refs=restrictions.browserKeyRestrictions.allowedReferrers||=[];
    for(const origin of [`https://${siteId}.web.app/*`,`https://${siteId}.firebaseapp.com/*`,'https://docs.google.com/*'])if(!refs.includes(origin)){refs.push(origin);changed=true;}
  }
  if(!changed){console.log('Existing public web key permits the Picker configuration.');return;}
  const update=await fetch(`https://apikeys.googleapis.com/v2/${name}?updateMask=restrictions`,{method:'PATCH',headers,body:JSON.stringify({name,etag:key.etag,restrictions})});
  if(!update.ok)throw new Error(`Existing CI identity cannot add the narrowly required Picker restrictions (${update.status}). No replacement credential was created.`);
  await waitForServiceOperation(await update.json(),{read:async operation=>{
    const response=await fetch(`https://apikeys.googleapis.com/v2/${operation}`,{headers});
    if(!response.ok)throw new Error(`Public web key update status unavailable (HTTP ${response.status}).`);
    return response.json();
  }});
  const verified=await fetch(`https://apikeys.googleapis.com/v2/${name}`,{headers});
  if(!verified.ok)throw new Error('Could not verify the updated public web key restrictions.');
  const actual=(await verified.json()).restrictions||{};
  if(restrictions.apiTargets?.some(target=>!actual.apiTargets?.some(value=>value.service===target.service))
    || restrictions.browserKeyRestrictions?.allowedReferrers?.some(origin=>!actual.browserKeyRestrictions?.allowedReferrers?.includes(origin)))throw new Error('Public web key restrictions have not finished updating.');
  console.log('Existing public web key Picker restrictions verified; original restrictions retained.');
}
async function ensureStudioIndexes(){
  const base=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups`;
  for(const [collection,field,ordered] of [['jobs','status','createdAt'],['feedback','verdict','updatedAt']]){
    const fields=[{fieldPath:field,order:'ASCENDING'},{fieldPath:ordered,order:'DESCENDING'},{fieldPath:'__name__',order:'DESCENDING'}];
    const response=await fetch(`${base}/${collection}/indexes`,{headers});
    if(!response.ok)throw new Error(`Could not inspect Studio ${collection} pagination index (${response.status}).`);
    const existing=(await response.json()).indexes||[];
    const matched=existing.find(index=>index.queryScope==='COLLECTION'&&JSON.stringify(index.fields)===JSON.stringify(fields));
    if(matched){console.log(`Studio ${collection} archive index ${matched.state}.`);continue;}
    const create=await fetch(`${base}/${collection}/indexes`,{method:'POST',headers,body:JSON.stringify({queryScope:'COLLECTION',fields})});
    if(!create.ok&&create.status!==409)throw new Error(`Could not create Studio ${collection} archive index (${create.status}).`);
    console.log(`Studio ${collection} archive index requested; indexing may briefly delay filtered history.`);
  }
}
const prerequisites=await Promise.allSettled([ensureStudioIndexes(),ensurePickerApi(),configurePickerKey()]);
const failures=prerequisites.filter(result=>result.status==='rejected');
for(const failure of failures)console.error(failure.reason.message);
if(failures.length)throw new Error(`${failures.length} Studio cloud prerequisite check(s) failed; no owner consent or upload was attempted.`);
console.log('Studio cloud prerequisites verified. Owner phone OAuth and exact Private folder grant are still required for an actual save.');
