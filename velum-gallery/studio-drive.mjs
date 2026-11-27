// Drive media and resumable session URLs stay in the owner-authenticated browser.
const libraryUrl=new URL('./drive-library.mjs',import.meta.url);libraryUrl.search=new URL(import.meta.url).search;
const {createDriveLibrary,driveResponseError,REFERENCES_FOLDER_ID,POSE_CATEGORIES}=await import(libraryUrl.href);
const creationsUrl=new URL('./drive-creations.mjs',import.meta.url);creationsUrl.search=new URL(import.meta.url).search;
const {loadDriveCreations}=await import(creationsUrl.href);
const accessUrl=new URL('./drive-access.mjs',import.meta.url);accessUrl.search=new URL(import.meta.url).search;
const {createDriveAccess,CONNECT_SCOPES,DRIVE_FILE_SCOPE,DRIVE_READ_SCOPE,DRIVE_METADATA_SCOPE}=await import(accessUrl.href);
export {createDriveAccess,CONNECT_SCOPES,DRIVE_FILE_SCOPE,DRIVE_READ_SCOPE,DRIVE_METADATA_SCOPE};
export const PRIVATE_FOLDER_ID = '1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA';
const API = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const OWNER = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2', PREFIX = 'velum-drive-upload-v1:';
const FIELDS = 'id,name,mimeType,size,parents,appProperties,trashed,ownedByMe,webViewLink,capabilities(canMoveItemWithinDrive)';
export function uploadUrl(value) {
  const url = new URL(value);
  if (url.origin !== 'https://www.googleapis.com' || url.username || url.password || url.pathname !== '/upload/drive/v3/files' || !url.searchParams.has('upload_id')) throw new Error('Drive returned an unsafe upload address.');
  return url.href;
}
function verifyFile(file,job,expectedId){
  if(!file||file.ownedByMe!==true||file.trashed!==false||!/^[\w-]{8,160}$/.test(file.id)
    ||(expectedId&&file.id!==expectedId)||file.mimeType!=='image/png'||Number(file.size)!==job.result.bytes
    ||file.appProperties?.velumJobId!==job.id||file.appProperties?.velumSha256!==job.result.sha256){
    throw new Error('Drive file does not match your verified original.');
  }
}
export function verifySaved(file, job, expectedId) {
  verifyFile(file,job,expectedId);
  if(file.parents?.length!==1||file.parents[0]!==PRIVATE_FOLDER_ID)throw new Error('Drive original is not in the exact Private folder.');
  return {id:file.id,name:file.name,webViewLink:`https://drive.google.com/file/d/${file.id}/view`};
}
export async function verifyOriginal(blob, job) {
  if (!blob || job.status !== 'completed' || job.result?.mime !== 'image/png' || blob.size !== job.result.bytes || blob.size > 7200000 || !/^[a-f0-9]{64}$/.test(job.result.sha256)) throw new Error('Select a complete, verified original PNG.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if ([137,80,78,71,13,10,26,10].some((value,index)=>bytes[index]!==value)) throw new Error('Original PNG signature is invalid.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
  if (hash !== job.result.sha256) throw new Error('Original PNG integrity check failed.');
}

// Media creation uses drive.file; fixed-folder placement uses metadata access.
export function createDriveTransport({request,readRequest,manageRequest,reserve,getOperationGuard,storage=globalThis.sessionStorage,onProgress=()=>{}}) {
  async function save({job,blob,signal}) {
    if(![request,readRequest,manageRequest,reserve,getOperationGuard].every(value=>typeof value==='function'))throw new Error('Private Drive upload access is unavailable. Refresh Velum.');
    const assertActive=getOperationGuard();
    const check=()=>{signal?.throwIfAborted();assertActive();};
    const send=async(operation,url,options={})=>{check();const response=await operation(url,{...options,signal});check();return response;};
    const json=async response=>{const data=await response.json();check();return data;};
    const remember=(key,value)=>{check();try{if(!storage?.setItem)throw new Error();storage.setItem(key,JSON.stringify(value));}catch{throw new Error('Allow session storage to resume Drive uploads safely.');}};
    async function file(id){
      const response=await send(manageRequest,`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS}`);
      if(response.status===404)return null;
      if(!response.ok)throw new Error(`Drive file verification failed (${response.status}).`);
      return json(response);
    }
    async function privateFolder(){
      const response=await send(manageRequest,`${API}/files/${PRIVATE_FOLDER_ID}?fields=id,mimeType,trashed,ownedByMe,capabilities(canAddChildren)`);
      if(!response.ok)throw new Error(`Could not verify the Private folder (${response.status}).`);
      const actual=await json(response);
      if(actual.id!==PRIVATE_FOLDER_ID||actual.mimeType!=='application/vnd.google-apps.folder'||actual.trashed!==false
        ||actual.ownedByMe!==true||actual.capabilities?.canAddChildren!==true)throw new Error('Your exact Private folder cannot currently accept the original.');
    }
    let rootId;
    async function root(){
      if(rootId)return rootId;
      const response=await send(readRequest,`${API}/files/root?fields=id,mimeType,trashed,ownedByMe`);
      if(!response.ok)throw new Error(`Could not verify My Drive staging (${response.status}).`);
      const actual=await json(response);
      if(!/^[\w-]{8,160}$/.test(actual.id||'')||[PRIVATE_FOLDER_ID,REFERENCES_FOLDER_ID].includes(actual.id)
        ||actual.mimeType!=='application/vnd.google-apps.folder'||actual.trashed!==false||actual.ownedByMe!==true)throw new Error('Your exact My Drive root could not be verified.');
      return rootId=actual.id;
    }
    check();
    await verifyOriginal(blob,job);
    check();
    if(!/^[\w-]{1,80}$/.test(job.id))throw new Error('Invalid creation ID.');
    const key=PREFIX+job.id;
    let state;try{state=JSON.parse(storage?.getItem(key)||'null');}catch{}
    if(state && (state.sha256!==job.result.sha256 || !/^[\w-]{8,160}$/.test(state.id)))throw new Error('Upload identity does not match this creation.');
    let placementAttempted=false,staged=false;
    const complete=file=>{const saved=verifySaved(file,job,state.id);check();storage?.removeItem(key);onProgress(1);return saved;};
    async function place(actual){
      verifyFile(actual,job,state.id);
      if(actual.parents?.length===1&&actual.parents[0]===PRIVATE_FOLDER_ID){await privateFolder();return complete(await file(state.id));}
      const source=await root();
      const verifyStaged=file=>{
        verifyFile(file,job,state.id);
        if(file.parents?.length!==1||file.parents[0]!==source||file.capabilities?.canMoveItemWithinDrive!==true)throw new Error('The reserved original is no longer movable from the exact My Drive root. Sync before retrying.');
      };
      verifyStaged(actual);staged=true;state.stage='placement';state.rootId=source;remember(key,state);
      onProgress({message:'Original uploaded. Placing it in Private…'});
      await privateFolder();
      // Reread immediately before PATCH: another tab may already have finished placement.
      const current=await file(state.id);
      if(current?.parents?.length===1&&current.parents[0]===PRIVATE_FOLDER_ID)return complete(current);
      verifyStaged(current);check();
      placementAttempted=true;
      const params=new URLSearchParams({addParents:PRIVATE_FOLDER_ID,removeParents:source,fields:FIELDS});
      const response=await send(manageRequest,`${API}/files/${encodeURIComponent(state.id)}?${params}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});
      if(!response.ok)throw new Error(`Private placement failed (${response.status}).`);
      verifySaved(await json(response),job,state.id);
      return complete(await file(state.id));
    }
    try{
    const reserved=await reserve(job,null);check();
    if(reserved){
      if(!/^[\w-]{8,160}$/.test(reserved)||(state&&state.id!==reserved))throw new Error('Upload reservation does not match this creation.');
      state={...state,id:reserved,sha256:job.result.sha256};remember(key,state);
    }else if(state?.id){
      const confirmed=await reserve(job,state.id);check();
      if(confirmed!==state.id)throw new Error('Upload reservation changed. Retry after syncing Studio.');
    }
    if(state?.id){const existing=await file(state.id);if(existing)return await place(existing);}
    if(!state){
      const q=`'${PRIVATE_FOLDER_ID}' in parents and trashed=false and appProperties has { key='velumJobId' and value='${job.id}' }`;
      const found=await send(request,`${API}/files?${new URLSearchParams({q,fields:`nextPageToken,files(${FIELDS})`,pageSize:'2'})}`);
      if(!found.ok)throw new Error(`Drive duplicate check failed (${found.status}).`);
      const listing=await json(found),files=listing.files||[];
      if(files.length){
        if(files.length!==1||listing.nextPageToken)throw new Error('More than one Drive original matches this creation. Review the existing files before retrying.');
        verifySaved(files[0],job);
        const id=await reserve(job,files[0].id);check();
        if(id!==files[0].id)throw new Error('Another save reserved this creation. Retry to verify its original.');
        state={id,sha256:job.result.sha256};remember(key,state);
        return await place(await file(id));
      }
      const response=await send(request,`${API}/files/generateIds?count=1&space=drive&type=files`);
      if(!response.ok)throw new Error(`Could not reserve a Drive file ID (${response.status}).`);
      const candidate=(await json(response)).ids?.[0];
      if(!/^[\w-]{8,160}$/.test(candidate||''))throw new Error('Drive returned an invalid file ID.');
      const id=await reserve(job,candidate);check();
      state={id,sha256:job.result.sha256};
      if(!/^[\w-]{8,160}$/.test(state.id))throw new Error('Drive returned an invalid file ID.');
      remember(key,state);
      const existing=await file(state.id);if(existing)return await place(existing);
    }
    // Preflight the final folder before leaving any new original staged at My Drive root.
    const source=await root();await privateFolder();
    state.rootId=source;remember(key,state);
    let offset=0;
    if(state.session){
      const response=await send(request,uploadUrl(state.session),{method:'PUT',headers:{'Content-Range':`bytes */${blob.size}`}});
      if(response.ok)return await place(await file(state.id));
      if(response.status===308)offset=received(response,blob.size);
      else if(response.status===404||response.status===410){delete state.session;remember(key,state);}
      else throw new Error(`Could not resume upload (${response.status}); retry Save to Drive.`);
    }
    if(!state.session){
      state.stage='uploading';remember(key,state);
      const response=await send(request,`${UPLOAD}?uploadType=resumable&fields=${FIELDS}`,{method:'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':'image/png','X-Upload-Content-Length':String(blob.size)},body:JSON.stringify({id:state.id,name:`Velum-${job.id}.png`,mimeType:'image/png',parents:['root'],appProperties:{velumJobId:job.id,velumSha256:job.result.sha256}})});
      if(response.status===409)return await place(await file(state.id));
      if(!response.ok)throw new Error(`Could not start Drive upload (${response.status}). Retry to use the same reserved file ID.`);
      state.session=uploadUrl(response.headers.get('Location'));remember(key,state);
    }
    while(offset<blob.size){
      check();
      const end=Math.min(offset+256*1024,blob.size);
      const response=await send(request,uploadUrl(state.session),{method:'PUT',headers:{'Content-Type':'image/png','Content-Range':`bytes ${offset}-${end-1}/${blob.size}`},body:blob.slice(offset,end)});
      if(response.ok)return await place(await file(state.id));
      if(response.status!==308)throw new Error(`Drive upload paused (${response.status}). Retry Save to Drive to resume.`);
      const next=received(response,blob.size);if(next<=offset)throw new Error('Drive did not acknowledge this chunk; retry to resume.');
      offset=next;onProgress(offset/blob.size===1?{message:'Original uploaded. Verifying Private placement…'}:offset/blob.size);
    }
    // Some Drive servers acknowledge the final chunk with 308; verify the object before reporting success.
    return await place(await file(state.id));
    }catch(error){
      if(signal?.aborted)throw error;
      if(staged||state?.stage==='placement'||state?.stage==='uploading'){
        const message=staged&&!placementAttempted
          ?'The original was verified in My Drive staging; Private placement was not confirmed. Retry Save to Drive to finish placement using the same original.'
          :'The original may already be staged in My Drive; its Private placement was not confirmed. Retry Save to Drive to finish or confirm the same original.';
        throw Object.assign(new Error(`${message} ${error?.message||''}`,{cause:error}),{code:error?.code||'drive/save-placement-unconfirmed'});
      }
      throw error;
    }
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
export function createStudioDrive({auth,access,reserve,apiKey,appId,storage=globalThis.sessionStorage}){
  if(!access)throw new Error('Drive connection is unavailable. Refresh Velum.');
  let gallery,epoch=0;
  const controllers=new Set(),pickers=new Map();
  const owner=()=>{if(auth.currentUser?.uid!==OWNER)throw new Error('Owner sign-in is required.');};
  function check(generation){
    owner();
    if(generation!==epoch)throw new Error('Studio locked. Reconnect after unlocking.');
  }
  function getOperationGuard(){
    const generation=epoch;
    const checkAccess=access.getOperationGuard();
    return()=>{check(generation);checkAccess();};
  }
  function authorize(){return access.connect();}
  async function request(url,options={}){
    const response=await access.request(url,options,[DRIVE_FILE_SCOPE]);
    // Upload completion is verified with files.get. Only response headers are used here.
    if(url.startsWith(UPLOAD))await response.body?.cancel();
    return response;
  }
  function readRequest(url,options={}){return access.request(url,options,[DRIVE_READ_SCOPE]);}
  function manageRequest(url,options={}){return access.request(url,options,[DRIVE_METADATA_SCOPE]);}
  async function pick(){
    const generation=epoch;await loadPicker();owner();if(generation!==epoch)throw new Error('Studio locked.');
    return new Promise((resolve,reject)=>{
      const view=new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true).setMimeTypes('image/png,image/jpeg').setParent(PRIVATE_FOLDER_ID);
      const picker=new google.picker.PickerBuilder().setAppId(appId).setDeveloperKey(apiKey).setOAuthToken(access.getToken([DRIVE_FILE_SCOPE])).setOrigin(location.origin).setTitle('Choose an image reference').addView(view).setCallback(data=>{
        if(data.action===google.picker.Action.CANCEL){pickers.delete(picker);picker.dispose();reject(new Error('Drive selection cancelled.'));}
        if(data.action===google.picker.Action.PICKED){const selected=data.docs?.[0];pickers.delete(picker);picker.dispose();resolve(selected);}
      }).build();pickers.set(picker,reject);picker.setVisible(true);
    });
  }
  async function grantFile(file,{allowTrashed=false}={}){
    const generation=epoch;
    await access.ensure([DRIVE_METADATA_SCOPE]);
    check(generation);
    if(!/^[\w-]{8,160}$/.test(file?.id||''))throw new Error('Invalid Drive image.');
    const fields='id,name,mimeType,parents,trashed,ownedByMe,capabilities(canMoveItemWithinDrive,canTrash,canUntrash)';
    const response=await manageRequest(`${API}/files/${encodeURIComponent(file.id)}?fields=${fields}`);
    if(!response.ok)throw driveResponseError(response,'Could not verify image permissions');
    const actual=await response.json();
    check(generation);
    if(actual.id!==file.id||actual.ownedByMe!==true||typeof actual.trashed!=='boolean'
      ||(!allowTrashed&&actual.trashed)){
      throw new Error('Only your available Drive images can be managed here.');
    }
    return actual;
  }
  async function grantFolder(folderId,{source=false}={}){
    const generation=epoch;
    await access.ensure([DRIVE_METADATA_SCOPE]);
    check(generation);
    if(![PRIVATE_FOLDER_ID,REFERENCES_FOLDER_ID].includes(folderId))throw new Error('Invalid library folder.');
    const fields='id,mimeType,trashed,ownedByMe,capabilities(canAddChildren,canRemoveChildren)';
    const response=await manageRequest(`${API}/files/${folderId}?fields=${fields}`);
    if(!response.ok)throw driveResponseError(response,source?'Could not verify the source folder':'Could not verify the destination folder');
    const actual=await response.json();
    check(generation);
    const allowed=source?actual.capabilities?.canRemoveChildren:actual.capabilities?.canAddChildren;
    if(actual.id!==folderId||actual.mimeType!=='application/vnd.google-apps.folder'||actual.trashed!==false
      ||actual.ownedByMe!==true||allowed!==true){
      throw Object.assign(new Error(source?'Google Drive has not allowed moving images out of this folder.':'Google Drive has not allowed adding images to this folder.'),{code:'drive/permission-denied',stage:source?'source folder':'destination folder'});
    }
    return actual;
  }
  const library=createDriveLibrary({readRequest,writeRequest:manageRequest,
    moveRequest:access.managementProxy?data=>access.move(data):undefined,
    moveStatusRequest:access.managementProxy?data=>access.moveStatus(data):undefined,grantFile,grantFolder,getOperationGuard});
  return {
    ...library,
    get managementProxy(){return access.managementProxy===true;},
    async autoEditMetadata(fileId,{signal}={}){
      owner();const guard=getOperationGuard();
      if(!/^[\w-]{8,160}$/.test(fileId||''))throw new Error('Invalid Drive image.');
      await access.ensure([DRIVE_READ_SCOPE]);guard();
      const fields='id,name,mimeType,parents,ownedByMe,trashed,shared,size,sha256Checksum,md5Checksum';
      const response=await readRequest(API+'/files/'+encodeURIComponent(fileId)+'?fields='+encodeURIComponent(fields),{signal});
      if(!response.ok)throw driveResponseError(response,'Could not verify original');
      const value=await response.json();guard();
      if(value.id!==fileId||value.ownedByMe!==true||value.trashed!==false||value.shared!==false||
         !['image/jpeg','image/png'].includes(value.mimeType)||value.parents?.length!==1||
         !Number.isSafeInteger(Number(value.size))||Number(value.size)<16||Number(value.size)>64*1024*1024||
         !/^[a-f0-9]{64}$/.test(value.sha256Checksum||''))throw new Error('Choose a private, owned PNG or JPEG with a verified checksum.');
      return value;
    },
    async readAutoEditImage({fileId,folderId,sha256},{signal}={}){
      const generation=epoch,guard=getOperationGuard(),controller=new AbortController(),cancel=()=>controller.abort();
      controllers.add(controller);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();
      try{
        const file=await this.autoEditMetadata(fileId,{signal:controller.signal});
        if(file.parents[0]!==folderId||file.sha256Checksum!==sha256)throw new Error('The recorded image has changed.');
        const response=await readRequest(API+'/files/'+encodeURIComponent(fileId)+'?alt=media',{signal:controller.signal});
        if(!response.ok)throw driveResponseError(response,'Could not load image');
        const reader=response.body?.getReader();if(!reader)throw new Error('Missing image response.');
        let size=0;const parts=[];
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>Number(file.size)||size>64*1024*1024)throw new Error('Image exceeds its verified size.');parts.push(value);}}
        finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        if(size!==Number(file.size))throw new Error('Image size mismatch.');
        const blob=new Blob(parts,{type:file.mimeType}),bytes=await blob.arrayBuffer();
        const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
        if(digest!==sha256)throw new Error('Image checksum mismatch.');
        check(generation);guard();controller.signal.throwIfAborted();return blob;
      }finally{controllers.delete(controller);signal?.removeEventListener('abort',cancel);}
    },
    connectAutoEditManagement(){return access.connect({management:true});},
    moveAutoEditReview(data){return access.autoEditReview(data);},
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
      try{
        controller.signal.throwIfAborted();check(generation);
        await access.ensure();check(generation);controller.signal.throwIfAborted();
        return await createDriveTransport({request,readRequest,manageRequest,reserve,getOperationGuard,storage,onProgress}).save({job,blob,signal:controller.signal});
      }
      finally{controllers.delete(controller);signal?.removeEventListener('abort',cancel);}
    },
    async chooseReference({current=false,external=false}={}){
      owner();const generation=epoch,controller=new AbortController();controllers.add(controller);
      try{
        if(current){
          const source=gallery?.current?.();
          if(!source)throw new Error('Select a current library image first.');
          await access.ensure([DRIVE_READ_SCOPE]);check(generation);
          const blob=await gallery.read(source.id,controller.signal);check(generation);
          return{blob,source:{kind:'drive',id:source.id,name:source.name}};
        }
        if(external!==true)throw new Error('Choose a reference from the Private or References selector.');
        await authorize();if(generation!==epoch)throw new Error('Studio locked.');const selected=await pick();
        if(generation!==epoch)throw new Error('Studio locked.');
        const response=await request(`${API}/files/${encodeURIComponent(selected.id)}?alt=media`,{signal:controller.signal});
        if(!response.ok)throw new Error(`Could not read the selected Drive reference (${response.status}).`);
        const blob=await readBoundedImage(response);if(generation!==epoch)throw new Error('Studio locked.');
        return{blob,source:{kind:'drive',id:selected.id,name:(selected.name||'Drive image').slice(0,160)}};
      }finally{controllers.delete(controller);}
    },
    setGalleryProvider(provider){gallery=provider;},
    clear({clearAccess=true}={}){
      epoch++;
      if(clearAccess)access.clear();
      else access.cancelPending();
      for(const controller of controllers)controller.abort();
      controllers.clear();
      for(const[picker,reject]of pickers){
        picker.dispose();
        reject(new Error('Studio locked.'));
      }
      pickers.clear();
      try{
        for(let index=storage.length-1;index>=0;index--){
          const key=storage.key(index);
          if(key?.startsWith(PREFIX))storage.removeItem(key);
        }
      }catch{}
    }
  };
}

