// Drive tokens and resumable session URLs stay in this browser. No server or PC OAuth.
const libraryUrl=new URL('./drive-library.mjs',import.meta.url);libraryUrl.search=new URL(import.meta.url).search;
const {createDriveLibrary,REFERENCES_FOLDER_ID,POSE_CATEGORIES}=await import(libraryUrl.href);
const creationsUrl=new URL('./drive-creations.mjs',import.meta.url);creationsUrl.search=new URL(import.meta.url).search;
const {loadDriveCreations}=await import(creationsUrl.href);
export const PRIVATE_FOLDER_ID = '1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_READ_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const GOOGLE_CLIENT_ID = '185802494856-rn0q6qi5goj0mifha0bkah55slu3kvju.apps.googleusercontent.com';
const API = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const OWNER = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2', PREFIX = 'velum-drive-upload-v1:';
const FIELDS = 'id,name,mimeType,size,parents,appProperties,trashed,webViewLink';
export function uploadUrl(value) {
  const url = new URL(value);
  if (url.origin !== 'https://www.googleapis.com' || url.username || url.password || url.pathname !== '/upload/drive/v3/files' || !url.searchParams.has('upload_id')) throw new Error('Drive returned an unsafe upload address.');
  return url.href;
}
export function verifySaved(file, job) {
  if (!file || file.trashed || !/^[\w-]{8,160}$/.test(file.id) || file.mimeType !== 'image/png' || !file.parents?.includes(PRIVATE_FOLDER_ID)
    || Number(file.size) !== job.result.bytes || file.appProperties?.velumJobId !== job.id || file.appProperties?.velumSha256 !== job.result.sha256) throw new Error('Drive file does not match this original and Private folder.');
  return {id:file.id,name:file.name,webViewLink:`https://drive.google.com/file/d/${file.id}/view`};
}
export async function verifyOriginal(blob, job) {
  if (!blob || job.status !== 'completed' || job.result?.mime !== 'image/png' || blob.size !== job.result.bytes || blob.size > 7200000 || !/^[a-f0-9]{64}$/.test(job.result.sha256)) throw new Error('Select a complete, verified original PNG.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if ([137,80,78,71,13,10,26,10].some((value,index)=>bytes[index]!==value)) throw new Error('Original PNG signature is invalid.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
  if (hash !== job.result.sha256) throw new Error('Original PNG integrity check failed.');
}

// Separated from OAuth and Picker so retry/offset/idempotence can be tested without a Google account.
export function createDriveTransport({request,reserve,storage=globalThis.sessionStorage,onProgress=()=>{}}) {
  const remember=(key,value)=>{try{storage?.setItem(key,JSON.stringify(value));}catch{throw new Error('Allow session storage to resume Drive uploads safely.');}};
  async function file(id,signal) {
    const response=await request(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS}`,{signal});
    if(response.status===404)return null;
    if(!response.ok)throw new Error(`Drive file verification failed (${response.status}).`);
    return response.json();
  }
  async function save({job,blob,signal}) {
    await verifyOriginal(blob,job);
    if(!/^[\w-]{1,80}$/.test(job.id))throw new Error('Invalid creation ID.');
    const key=PREFIX+job.id;
    let state;try{state=JSON.parse(storage?.getItem(key)||'null');}catch{}
    if(state && (state.sha256!==job.result.sha256 || !/^[\w-]{8,160}$/.test(state.id)))throw new Error('Upload identity does not match this creation.');
    if(!reserve)throw new Error('Private Drive upload reservation is unavailable.');
    const reserved=await reserve(job,null);
    if(reserved){if(state&&state.id!==reserved)state=null;state={...state,id:reserved,sha256:job.result.sha256};}
    if(state?.id){const existing=await file(state.id,signal);if(existing){const saved=verifySaved(existing,job);storage?.removeItem(key);onProgress(1);return saved;}}
    if(!state){
      const q=`'${PRIVATE_FOLDER_ID}' in parents and trashed=false and appProperties has { key='velumJobId' and value='${job.id}' }`;
      const found=await request(`${API}/files?${new URLSearchParams({q,fields:`files(${FIELDS})`,pageSize:'10'})}`,{signal});
      if(!found.ok)throw new Error(`Drive duplicate check failed (${found.status}).`);
      const files=(await found.json()).files||[];
      if(files.length){const saved=verifySaved(files[0],job);onProgress(1);return saved;}
      const response=await request(`${API}/files/generateIds?count=1&space=drive&type=files`,{signal});
      if(!response.ok)throw new Error(`Could not reserve a Drive file ID (${response.status}).`);
      const candidate=(await response.json()).ids?.[0];
      state={id:await reserve(job,candidate),sha256:job.result.sha256};
      if(!/^[\w-]{8,160}$/.test(state.id))throw new Error('Drive returned an invalid file ID.');
      remember(key,state);
    }
    let offset=0;
    if(state.session){
      const response=await request(uploadUrl(state.session),{method:'PUT',headers:{'Content-Range':`bytes */${blob.size}`},signal});
      if(response.ok){const saved=verifySaved(await file(state.id,signal),job);storage?.removeItem(key);onProgress(1);return saved;}
      if(response.status===308)offset=received(response,blob.size);
      else if(response.status===404||response.status===410){delete state.session;remember(key,state);}
      else throw new Error(`Could not resume upload (${response.status}); retry Save to Drive.`);
    }
    if(!state.session){
      const response=await request(`${UPLOAD}?uploadType=resumable&fields=${FIELDS}`,{method:'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':'image/png','X-Upload-Content-Length':String(blob.size)},body:JSON.stringify({id:state.id,name:`Velum-${job.id}.png`,mimeType:'image/png',parents:[PRIVATE_FOLDER_ID],appProperties:{velumJobId:job.id,velumSha256:job.result.sha256}}),signal});
      if(response.status===409){const saved=verifySaved(await file(state.id,signal),job);storage?.removeItem(key);onProgress(1);return saved;}
      if(!response.ok)throw new Error(`Could not start Drive upload (${response.status}). Retry to use the same reserved file ID.`);
      state.session=uploadUrl(response.headers.get('Location'));remember(key,state);
    }
    while(offset<blob.size){
      signal?.throwIfAborted();
      const end=Math.min(offset+256*1024,blob.size);
      const response=await request(uploadUrl(state.session),{method:'PUT',headers:{'Content-Type':'image/png','Content-Range':`bytes ${offset}-${end-1}/${blob.size}`},body:blob.slice(offset,end),signal});
      if(response.ok){const saved=verifySaved(await file(state.id,signal),job);storage?.removeItem(key);onProgress(1);return saved;}
      if(response.status!==308)throw new Error(`Drive upload paused (${response.status}). Retry Save to Drive to resume.`);
      const next=received(response,blob.size);if(next<=offset)throw new Error('Drive did not acknowledge this chunk; retry to resume.');
      offset=next;onProgress(offset/blob.size);
    }
    // Some Drive servers acknowledge the final chunk with 308; verify the object before reporting success.
    const saved=verifySaved(await file(state.id,signal),job);storage?.removeItem(key);onProgress(1);return saved;
  }
  return {save};
}
function received(response,total){const range=response.headers.get('Range');if(!range)return 0;const match=/^bytes=0-(\d+)$/.exec(range);const value=match?Number(match[1])+1:-1;if(value<0||value>total)throw new Error('Drive returned an invalid upload offset.');return value;}
export async function readBoundedImage(response){
  const maximum=16*1024*1024,mime=(response.headers.get('content-type')||'').split(';')[0];
  if(!['image/png','image/jpeg'].includes(mime)||Number(response.headers.get('content-length'))>maximum){await response.body?.cancel();throw new Error('Choose a PNG or JPEG reference smaller than 16 MB.');}
  const reader=response.body.getReader(),parts=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maximum)throw new Error('Choose a reference smaller than 16 MB.');parts.push(value);}return new Blob(parts,{type:mime});}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

let pickerLoading;
function loadPicker(){
  if(globalThis.google?.picker)return Promise.resolve();
  return pickerLoading ||= new Promise((resolve,reject)=>{
    const load=()=>globalThis.gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('Google Picker could not load. Retry when online.')),timeout:20000,ontimeout:()=>reject(new Error('Google Picker timed out.'))});
    if(globalThis.gapi)return load();
    const script=document.createElement('script');script.src='https://apis.google.com/js/api.js';script.async=true;script.onload=load;script.onerror=()=>reject(new Error('Google Picker needs a network connection.'));document.head.append(script);
  }).catch(error=>{pickerLoading=null;throw error;});
}
export function createStudioDrive({auth,requestAccess,getReadAccess=()=>'',reserve,apiKey,appId,fetchImpl=fetch,storage=globalThis.sessionStorage}){
  let token='',expiresAt=0,readToken='',readExpiresAt=0,gallery,epoch=0;
  const controllers=new Set(),pickers=new Map();
  const owner=()=>{if(auth.currentUser?.uid!==OWNER)throw new Error('Owner sign-in is required.');};
  // Firebase identity, Drive scopes and folder authorization are separate grants.
  // Validate combined/reloaded read tokens too: a timestamp or canAddChildren is
  // not proof that Google granted drive.file to this app and this Google user.
  async function inspect(candidate,generation){
    if(!candidate)return false;
    let response;
    try{response=await fetchImpl('https://oauth2.googleapis.com/tokeninfo',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({access_token:candidate}),cache:'no-store',credentials:'omit'});}
    catch{throw new Error('Could not verify Drive access. Reconnect when online and retry.');}
    owner();if(generation!==epoch)throw new Error('Studio locked. Reconnect after unlocking.');
    if(response.status===400||response.status===401)return false;
    if(!response.ok)throw new Error('Could not verify Drive access. Retry when Google is available.');
    const info=await response.json(),googleId=auth.currentUser.providerData?.find(item=>item.providerId==='google.com')?.uid;
    if((info.aud||info.audience||info.issued_to)!==GOOGLE_CLIENT_ID || (googleId&&(info.sub||info.user_id)!==googleId))return false;
    const seconds=Number(info.expires_in);
    if(!String(info.scope||'').split(/\s+/).includes(DRIVE_FILE_SCOPE)||!Number.isFinite(seconds)||seconds<=60)return false;
    owner();if(generation!==epoch)throw new Error('Studio locked. Reconnect after unlocking.');
    token=candidate;expiresAt=Date.now()+Math.min(seconds-60,50*60)*1000;return true;
  }
  async function authorize(){
    owner();if(token&&Date.now()<expiresAt)return;
    const generation=epoch;token='';expiresAt=0;
    if(await inspect(getReadAccess(),generation))return;
    owner();if(generation!==epoch)throw new Error('Studio locked. Reconnect after unlocking.');
    const credential=await requestAccess(DRIVE_FILE_SCOPE);
    owner();if(generation!==epoch)throw new Error('Studio locked. Reconnect after unlocking.');
    if(!await inspect(credential?.accessToken,generation))throw new Error('Google did not grant Drive file access. No image was uploaded.');
  }
  async function request(url,options={}){owner();const generation=epoch;if(!token||Date.now()>=expiresAt)throw new Error('Drive access expired. Tap Save again to reconnect on this device.');const response=await fetchImpl(url,{...options,headers:{...options.headers,Authorization:`Bearer ${token}`}});owner();if(generation!==epoch)throw new Error('Studio locked.');if(response.status===401){token='';expiresAt=0;throw new Error('Drive access expired. Tap Save again to reconnect on this device.');}return response;}
  async function authorizeRead(){
    owner();if(readToken&&Date.now()<readExpiresAt)return;
    const generation=epoch;
    const inspectRead=async candidate=>{
      if(!candidate)return false;
      const response=await fetchImpl('https://oauth2.googleapis.com/tokeninfo',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({access_token:candidate}),cache:'no-store',credentials:'omit'});
      owner();if(generation!==epoch)throw new Error('Studio locked.');
      if([400,401].includes(response.status))return false;
      if(!response.ok)throw new Error('Google could not verify read access. Retry when online.');
      const info=await response.json(),linked=auth.currentUser.providerData?.find(item=>item.providerId==='google.com')?.uid,seconds=Number(info.expires_in);
      if((info.aud||info.audience||info.issued_to)!==GOOGLE_CLIENT_ID||(linked&&(info.sub||info.user_id)!==linked)||!String(info.scope||'').split(/\s+/).includes(DRIVE_READ_SCOPE)||seconds<=60||!Number.isFinite(seconds))return false;
      readToken=candidate;readExpiresAt=Date.now()+Math.min(seconds-60,3000)*1000;return true;
    };
    if(await inspectRead(getReadAccess()))return;
    owner();if(generation!==epoch)throw new Error('Studio locked.');
    const credential=await requestAccess(DRIVE_READ_SCOPE);
    if(generation!==epoch)throw new Error('Studio locked.');
    if(!await inspectRead(credential?.accessToken))throw new Error('Google did not grant read access to this account. No reference was attached.');
  }
  async function readRequest(url,options={}){
    const generation=epoch;await authorizeRead();owner();if(generation!==epoch)throw new Error('Studio locked.');
    const controller=new AbortController(),cancel=()=>controller.abort();controllers.add(controller);options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)controller.abort();
    try{const response=await fetchImpl(url,{...options,signal:controller.signal,headers:{...options.headers,Authorization:`Bearer ${readToken}`}});owner();if(generation!==epoch)throw new Error('Studio locked.');if(response.status===401){readToken='';readExpiresAt=0;throw new Error('Drive read access expired. Reconnect and retry.');}return response;}
    finally{controllers.delete(controller);options.signal?.removeEventListener('abort',cancel);}
  }
  async function pick(folder,folderId=PRIVATE_FOLDER_ID,title=''){
    const generation=epoch;await loadPicker();owner();if(generation!==epoch)throw new Error('Studio locked.');
    return new Promise((resolve,reject)=>{
      const view=new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true);
      if(folder)view.setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder');
      else view.setMimeTypes('image/png,image/jpeg').setParent(folderId);
      const picker=new google.picker.PickerBuilder().setAppId(appId).setDeveloperKey(apiKey).setOAuthToken(token).setOrigin(location.origin).setTitle(title||(folder?'Select the existing Private folder':'Choose an image reference')).addView(view).setCallback(data=>{
        if(data.action===google.picker.Action.CANCEL){pickers.delete(picker);picker.dispose();reject(new Error('Drive selection cancelled.'));}
        if(data.action===google.picker.Action.PICKED){const selected=data.docs?.[0];pickers.delete(picker);picker.dispose();resolve(selected);}
      }).build();pickers.set(picker,reject);picker.setVisible(true);
    });
  }
  async function folderGrant(folderId=PRIVATE_FOLDER_ID){
    if(![PRIVATE_FOLDER_ID,REFERENCES_FOLDER_ID].includes(folderId))throw new Error('Invalid destination folder.');
    const generation=epoch;
    const path=`${API}/files/${folderId}?fields=id,mimeType,trashed,isAppAuthorized,capabilities(canAddChildren)`;
    const writable=async()=>{const response=await request(path);if(response.status===403||response.status===404)return false;if(!response.ok)throw new Error(`Could not verify the folder (${response.status}). Retry when online.`);const data=await response.json();return data.id===folderId&&data.mimeType==='application/vnd.google-apps.folder'&&!data.trashed&&data.isAppAuthorized===true&&data.capabilities?.canAddChildren===true;};
    const approved=await writable();if(generation!==epoch)throw new Error('Studio locked.');if(approved)return;
    const selected=await pick(true,folderId,`Select the existing ${folderId===PRIVATE_FOLDER_ID?'Private':'References'} folder`);
    if(selected?.id!==folderId)throw new Error('Choose the existing destination folder. No duplicate folder was created.');
    if(!await writable())throw new Error('The existing Private folder has not been granted writable access. Check the phone-side Picker grant. No broader Drive scope was requested.');
  }
  async function grantFile(file){
    await authorize();const generation=epoch;
    const url=`${API}/files/${encodeURIComponent(file.id)}?fields=id,name,parents,trashed,ownedByMe,isAppAuthorized,capabilities(canMoveItemWithinDrive,canTrash)`;
    const inspectFile=async()=>{const response=await request(url);if([403,404].includes(response.status))return null;if(!response.ok)throw new Error('Could not verify file permissions.');return response.json();};
    let actual=await inspectFile();
    if(!actual?.isAppAuthorized){const selected=await pick(false,file.folderId||PRIVATE_FOLDER_ID,`Allow Velum to manage this file: ${file.name||file.id}`);if(selected?.id!==file.id)throw new Error('Select the exact image shown in Details. Nothing was moved or trashed.');actual=await inspectFile();}
    if(generation!==epoch)throw new Error('Studio locked.');
    if(!actual?.isAppAuthorized)throw new Error('Google has not granted access to this file. Nothing was changed.');
    return actual;
  }
  const library=createDriveLibrary({readRequest,writeRequest:async(url,options)=>{await authorize();return request(url,options);},grantFile,grantFolder:folderGrant});
  return {
    ...library,
    async loadQualityCreations(){
      const controller=new AbortController();controllers.add(controller);
      try{return await loadDriveCreations({signal:controller.signal,
        listManifests:async()=>{const params=new URLSearchParams({q:`'${PRIVATE_FOLDER_ID}' in parents and trashed=false and mimeType='application/json' and name contains 'Velum-acceptance-'`,fields:'files(id,name,mimeType,parents,ownedByMe,modifiedTime,size)',pageSize:'5',orderBy:'modifiedTime desc'});const response=await readRequest(`${API}/files?${params}`,{signal:controller.signal});if(!response.ok)throw new Error('Could not list private quality runs.');return (await response.json()).files?.filter(file=>file.ownedByMe===true)||[];},
        readManifest:async(file)=>{if(Number(file.size)>262144)throw new Error('Quality manifest is too large.');const response=await readRequest(`${API}/files/${encodeURIComponent(file.id)}?alt=media`,{signal:controller.signal});if(!response.ok)throw new Error('Could not read private quality run.');const reader=response.body.getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();throw new Error('Quality manifest exceeds its private transfer limit.');}parts.push(value);}}finally{reader.releaseLock();}return new Blob(parts,{type:'application/json'});}
      });}finally{controllers.delete(controller);}
    },
    async readReference(file,{signal}={}){
      const generation=epoch,controller=new AbortController(),cancel=()=>controller.abort();controllers.add(controller);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();
      try{
        const actual=await library.metadata(file,controller.signal),allowed=[PRIVATE_FOLDER_ID,REFERENCES_FOLDER_ID,...Object.values(POSE_CATEGORIES).map(item=>item.id)];
        if(actual.trashed||!actual.parents?.some(parent=>allowed.includes(parent))||!['image/jpeg','image/png'].includes(actual.mimeType)||Number(actual.size)>16*1024*1024)throw new Error('Choose a supported image from Private, References, or the pose catalog.');
        const response=await readRequest(`${API}/files/${encodeURIComponent(actual.id)}?alt=media`,{signal:controller.signal});if(!response.ok)throw new Error(`Could not read reference (${response.status}).`);
        const blob=await readBoundedImage(response);if(generation!==epoch)throw new Error('Studio locked.');
        return {blob,source:{kind:'drive',id:actual.id,name:(actual.name||'Drive image').slice(0,160)}};
      }finally{controllers.delete(controller);signal?.removeEventListener('abort',cancel);}
    },
    authorize,
    async save({job,blob,onProgress,signal}){
      const generation=epoch,controller=new AbortController();controllers.add(controller);
      const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
      if(signal?.aborted)controller.abort();
      try{await authorize();if(generation!==epoch)throw new Error('Studio locked.');await folderGrant();if(generation!==epoch)throw new Error('Studio locked.');return await createDriveTransport({request,reserve,storage,onProgress}).save({job,blob,signal:controller.signal});}
      finally{controllers.delete(controller);signal?.removeEventListener('abort',cancel);}
    },
    async chooseReference({current=false}={}){
      owner();const generation=epoch,controller=new AbortController();controllers.add(controller);
      try{
        if(current&&gallery?.current?.()){const source=gallery.current(),blob=await gallery.read(source.id,controller.signal);if(generation!==epoch)throw new Error('Studio locked.');return{blob,source:{kind:'drive',id:source.id,name:source.name}};}
        await authorize();if(generation!==epoch)throw new Error('Studio locked.');const selected=await pick(false);
        if(generation!==epoch)throw new Error('Studio locked.');
        const response=await request(`${API}/files/${encodeURIComponent(selected.id)}?alt=media`,{signal:controller.signal});
        if(!response.ok)throw new Error(`Could not read the selected Drive reference (${response.status}).`);
        const blob=await readBoundedImage(response);if(generation!==epoch)throw new Error('Studio locked.');
        return{blob,source:{kind:'drive',id:selected.id,name:(selected.name||'Drive image').slice(0,160)}};
      }finally{controllers.delete(controller);}
    },
    setGalleryProvider(provider){gallery=provider;},
    clear(){epoch++;for(const controller of controllers)controller.abort();controllers.clear();for(const[picker,reject]of pickers){picker.dispose();reject(new Error('Studio locked.'));}pickers.clear();token='';expiresAt=0;readToken='';readExpiresAt=0;try{for(let index=storage.length-1;index>=0;index--){const key=storage.key(index);if(key?.startsWith(PREFIX))storage.removeItem(key);}}catch{}}
  };
}
