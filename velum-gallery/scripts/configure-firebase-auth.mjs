import fs from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

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

  const details = body?.error?.details || [];
  const disabled = details.some(detail => detail?.reason === 'SERVICE_DISABLED' || detail?.metadata?.service === 'drive.googleapis.com')
    || /drive api.*(disabled|has not been used)/i.test(body?.error?.message || '');

  if (disabled) return false;

  // An unauthenticated/permission error is expected here; reaching Drive without SERVICE_DISABLED proves the API is active.
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

async function tryEnableDriveApi() {
  const serviceName = `projects/${projectId}/services/drive.googleapis.com`;
  const serviceUrl = `https://serviceusage.googleapis.com/v1/${serviceName}`;
  const enableResponse = await fetch(`${serviceUrl}:enable`, {
    method: 'POST',
    headers,
    body: '{}'
  });
  if (!enableResponse.ok) {
    throw new Error(`Google Drive API is disabled and this service account cannot enable it (${enableResponse.status}): ${await enableResponse.text()}`);
  }

  const operation = await enableResponse.json();
  if (!operation.name) {
    console.log('Google Drive API enable request accepted.');
    return;
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const opResponse = await fetch(`https://serviceusage.googleapis.com/v1/${operation.name}`, { headers });
    if (!opResponse.ok) continue;
    const op = await opResponse.json();
    if (op.error) throw new Error(`Google Drive API enable failed: ${JSON.stringify(op.error)}`);
    if (op.done) {
      console.log('Google Drive API enabled successfully.');
      return;
    }
  }
  throw new Error('Timed out while enabling Google Drive API.');
}

async function ensureDriveApi() {
  // The deployment service account may not have Service Usage Viewer/Admin. Probe Drive directly first.
  if (await probeDriveApi()) return;
  await tryEnableDriveApi();
  if (!(await probeDriveApi())) throw new Error('Google Drive API still appears disabled after enable request.');
}

await configureAuthorizedDomains();
await ensureDriveApi();

// Picker grants drive.file access to the existing folder; a read-only metadata
// response cannot establish that grant. Use only the existing CI identity.
async function ensurePickerApi(){
  const base=`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/picker.googleapis.com`;
  const current=await fetch(base,{headers});
  if(current.ok&&(await current.json()).state==='ENABLED'){console.log('Google Picker API is enabled.');return;}
  const response=await fetch(`${base}:enable`,{method:'POST',headers,body:'{}'});
  if(!response.ok)throw new Error(`Google Picker API could not be enabled by the existing CI identity (${response.status}). Owner cloud setup may be required; Drive saving remains unverified until the phone folder grant succeeds.`);
  const operation=await response.json();
  if(operation.done){console.log('Google Picker API enabled.');return;}
  for(let attempt=0;attempt<30;attempt++){
    await new Promise(resolve=>setTimeout(resolve,1000));
    const poll=await fetch(`https://serviceusage.googleapis.com/v1/${operation.name}`,{headers});
    if(!poll.ok)continue;const data=await poll.json();if(data.error)throw new Error(`Google Picker enable operation failed: ${data.error.message}`);
    if(data.done){console.log('Google Picker API enabled.');return;}
  }
  throw new Error('Google Picker enablement is still pending. Verify the phone folder grant before treating Save to Drive as available.');
}
async function configurePickerKey(){
  // Reuse the public Firebase web key. Preserve every existing restriction;
  // add only the two APIs and iframe origin required by Google's Picker guide.
  const lookup=await fetch(`https://apikeys.googleapis.com/v2/keys:lookupKey?keyString=${encodeURIComponent(webApiKey)}`,{headers});
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
  console.log('Existing public web key Picker restrictions updated; original restrictions retained.');
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
await ensureStudioIndexes();
await ensurePickerApi();
await configurePickerKey();
