// Reads stay in the signed-in browser; production parent changes use the fixed-folder server proxy.
export const PRIVATE_FOLDER_ID='1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA';
export const REFERENCES_FOLDER_ID='1yDt_5NSv8fDYhZvOdsihdJwKQJuTzx66';
export const POSES_FOLDER_ID='1I7hpdViUAhmzME0zUXWWvR59R46pHPiG';
export const LIBRARY_FOLDERS=Object.freeze({private:PRIVATE_FOLDER_ID,references:REFERENCES_FOLDER_ID});
export const POSE_CATEGORIES=Object.freeze({
 expressive:{id:'1P4j5jcqJ5qsBq6bObkhriFvzyFLmJwF8',label:'Full body · expressive'},
 standard:{id:'10KMZmBpcrUIeNZW8X6sI1CncrmmKk-N4',label:'Full body · standard'},
 'upper-body':{id:'1vPBzNJJ0BT4GTHM2eaN2uoyJAphNMXdh',label:'Upper body'},
 'two-person':{id:'1qBekF9zxhzetAoEg85fdsC6ir5tyY0eS',label:'Two person'}
});
const API='https://www.googleapis.com/drive/v3';
const id=value=>{if(!/^[\w-]{8,160}$/.test(value||''))throw new Error('Invalid Drive file.');return value;};
const quote=value=>String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
export const folderLabel=file=>file.parents?.includes(REFERENCES_FOLDER_ID)?'References':file.parents?.includes(PRIVATE_FOLDER_ID)?'Private':file.folderLabel||'';
export function libraryQuery({folder='all',search='',imagesOnly=true}={}){
 if(!['all',...Object.keys(LIBRARY_FOLDERS)].includes(folder))throw new Error('Choose a library folder.');
 const roots=folder==='all'?Object.values(LIBRARY_FOLDERS):[LIBRARY_FOLDERS[folder]];
 return `(${roots.map(value=>`'${value}' in parents`).join(' or ')}) and trashed=false${imagesOnly?" and (mimeType='image/jpeg' or mimeType='image/png')":''}${search.trim()?` and name contains '${quote(search.trim().slice(0,160))}'`:''}`;
}
export function libraryFile(file){
 const label=folderLabel(file);return {...file,folderLabel:label,folderId:label==='References'?REFERENCES_FOLDER_ID:label==='Private'?PRIVATE_FOLDER_ID:file.folderId||''};
}
export function driveResponseError(response,action){
 const failure=response.driveFailure;
 const reason=failure?.reason||'';
 const detail=failure?.message?` ${failure.message}`:'';
 const throttled=['rateLimitExceeded','userRateLimitExceeded','sharingRateLimitExceeded'].includes(reason);
 const code=response.status===429||response.status>=500||throttled?'drive/temporary-unavailable'
  :response.status===403?'drive/permission-denied':'drive/api-error';
 return Object.assign(new Error(`${action} (${response.status}${reason?`, ${reason}`:''}).${detail}`),{
  code,status:response.status,reason,stage:action
 });
}
async function json(response,message){if(!response.ok)throw driveResponseError(response,message);return response.json();}
export function createDriveLibrary({readRequest,writeRequest,moveRequest,moveStatusRequest,grantFile,grantFolder,getOperationGuard=()=>()=>{}}){
 async function listReferences({folder='all',search='',cursor='',signal}={}){
  const params=new URLSearchParams({q:libraryQuery({folder,search}),fields:'nextPageToken,files(id,name,mimeType,parents,thumbnailLink,size,modifiedTime)',pageSize:'60',orderBy:'modifiedTime desc'});
  if(cursor)params.set('pageToken',cursor);
  const data=await json(await readRequest(`${API}/files?${params}`,{signal}),'Could not load references');
  return {files:(data.files||[]).map(libraryFile),cursor:data.nextPageToken||''};
 }
 async function metadata(file,signal){return json(await readRequest(`${API}/files/${id(file.id||file)}?fields=id,name,mimeType,parents,trashed,ownedByMe,thumbnailLink,size,capabilities(canMoveItemWithinDrive,canTrash,canUntrash)`,{signal}),'Could not verify image');}
 function verifyImage(actual,file,{allowTrashed=false}={}){
  if(actual.id!==id(file.id)||actual.ownedByMe!==true||(!allowTrashed&&actual.trashed!==false)||!/^image\/[a-z0-9.+-]+$/i.test(actual.mimeType||'')
   ||actual.parents?.length!==1||!Object.values(LIBRARY_FOLDERS).includes(actual.parents[0]))throw new Error('Only your images in Private or References can be managed here.');
  if(file.folderId&&actual.parents[0]!==file.folderId)throw new Error('This image moved elsewhere. Sync before retrying.');
 }
 async function manageable(file,options){
  id(file.id);
  const actual=await grantFile(file,options);
  verifyImage(actual,file,options);
  return actual;
 }
 async function move(file,destination,{onPending,requestedAt}={}){
  const assertActive=getOperationGuard();
  if(!Object.values(LIBRARY_FOLDERS).includes(destination))throw new Error('Choose Private or References.');
  if(moveRequest){
   if(!Object.values(LIBRARY_FOLDERS).includes(file.folderId)||file.folderId===destination)throw new Error('Choose the other library folder.');
   const recovery={kind:'move',id:id(file.id),name:file.name,mimeType:file.mimeType,from:file.folderId,to:destination,
    at:Number.isSafeInteger(requestedAt)&&requestedAt>0?requestedAt:Date.now(),serverManaged:true};
   await onPending?.(recovery);assertActive();
   const result=await moveRequest({id:file.id,from:recovery.from,to:destination,at:recovery.at});assertActive();
   const moved=confirmedMove(result,recovery);
   return {file:libraryFile({...file,...moved}),recovery};
  }
  const actual=await manageable(file),source=libraryFile(actual).folderId;
  assertActive();
  if(source===destination)throw new Error('This image is already in that folder.');
  if(actual.capabilities?.canMoveItemWithinDrive!==true)throw new Error('Google Drive has not allowed this file to move.');
  await grantFolder(source,{source:true});assertActive();
  await grantFolder(destination);assertActive();
  // Re-read after authorization and folder checks to preserve external moves.
  const latest=await metadata(file);
  assertActive();verifyImage(latest,{...file,folderId:source});
  if(latest.capabilities?.canMoveItemWithinDrive!==true)throw new Error('Google Drive has not allowed this file to move.');
  const recovery={kind:'move',id:file.id,name:latest.name,mimeType:latest.mimeType,from:source,to:destination,at:Number.isSafeInteger(requestedAt)&&requestedAt>0?requestedAt:Date.now()};
  await onPending?.(recovery);assertActive();
  const params=new URLSearchParams({addParents:destination,removeParents:source,fields:'id,name,parents,trashed'});
  const moved=await json(await writeRequest(`${API}/files/${id(file.id)}?${params}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'}),'Move was not confirmed');
  assertActive();
  if(moved.id!==file.id||moved.trashed!==false||moved.parents?.length!==1||moved.parents[0]!==destination)throw new Error('Move response did not match. Sync to recover the actual location.');
  return {file:libraryFile({...latest,...moved}),recovery};
 }
 function confirmedMove(result,record){
  const file=result.file;
  if(result.phase!=='confirmed'||!/^[a-f0-9]{64}$/.test(result.receiptId||'')||file?.id!==record.id||file.ownedByMe!==true||file.trashed!==false
   ||!/^image\/[a-z0-9.+-]+$/i.test(file.mimeType||'')||file.parents?.length!==1||file.parents[0]!==record.to)throw new Error('Move receipt was not confirmed. Check the saved action.');
  return file;
 }
 async function reconcileMove(record){
  if(!moveStatusRequest)throw new Error('Secure move recovery is unavailable. Reload Velum.');
  const assertActive=getOperationGuard();
  const result=await moveStatusRequest({id:id(record.id),from:record.from,to:record.to,at:record.at});assertActive();
  if(result.phase==='confirmed')return {...result,file:libraryFile({...record,...confirmedMove(result,record)})};
  if(!['pending','not-started'].includes(result.phase))throw new Error('Move recovery returned an invalid receipt.');
  return {phase:result.phase,retryable:result.retryable===true};
 }
 async function trash(file){
  const assertActive=getOperationGuard();
  const actual=await manageable(file);
  assertActive();
  if(actual.capabilities?.canTrash!==true)throw new Error('Google Drive has not allowed this file to be trashed.');
  const latest=await metadata(file);assertActive();verifyImage(latest,{...file,folderId:actual.parents[0]});
  if(latest.capabilities?.canTrash!==true)throw new Error('Google Drive has not allowed this file to be trashed.');
  const changed=await json(await writeRequest(`${API}/files/${id(file.id)}?fields=id,trashed`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})}),'Trash was not confirmed');
  assertActive();
  if(changed.id!==file.id||changed.trashed!==true)throw new Error('Trash response did not match. Check Drive Trash.');
  return {kind:'trash',id:file.id,name:file.name,folderId:libraryFile(actual).folderId,at:Date.now()};
 }
 async function undo(record,options){
  if(record?.kind==='move'){
   if(!Object.values(LIBRARY_FOLDERS).includes(record.from)||!Object.values(LIBRARY_FOLDERS).includes(record.to)||record.from===record.to)throw new Error('Invalid move recovery.');
   return move({id:id(record.id),name:record.name,mimeType:record.mimeType,folderId:record.to},record.from,options);
  }
  if(record?.kind!=='trash')throw new Error('No recoverable action selected.');
  const assertActive=getOperationGuard(),file={id:id(record.id),folderId:record.folderId};
  const actual=await manageable(file,{allowTrashed:true});assertActive();
  if(actual.trashed!==true||actual.capabilities?.canUntrash!==true)throw new Error('This image cannot be restored here. Check Drive Trash.');
  await grantFolder(record.folderId);assertActive();
  const latest=await metadata(file);assertActive();verifyImage(latest,file,{allowTrashed:true});
  if(latest.trashed!==true||latest.capabilities?.canUntrash!==true)throw new Error('This image changed. Check Drive Trash.');
  const restored=await json(await writeRequest(`${API}/files/${file.id}?fields=id,name,mimeType,parents,trashed`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:false})}),'Restore was not confirmed');
  assertActive();
  if(restored.id!==file.id||restored.trashed!==false||restored.parents?.length!==1||restored.parents[0]!==record.folderId)throw new Error('Restore response did not match. Open Drive Trash to recover it.');
  return {file:libraryFile(restored)};
 }
 async function choosePose({category='auto',twoPerson=false,excludeId='',random=Math.random,signal}={}){
  const keys=Object.keys(POSE_CATEGORIES).filter(key=>twoPerson||key!=='two-person');
  if(category!=='auto'&&!keys.includes(category))throw new Error('Enable two-person poses explicitly, or choose a single-person category.');
  const key=category==='auto'?keys[Math.floor(random()*keys.length)]:category,group=POSE_CATEGORIES[key];
  const params=new URLSearchParams({q:`'${group.id}' in parents and trashed=false and (mimeType='image/jpeg' or mimeType='image/png')`,fields:'nextPageToken,files(id,name,mimeType,parents,thumbnailLink,size)',pageSize:'100',orderBy:'name'});
  // Reservoir sampling across bounded pages avoids always choosing the first page.
  let chosen,count=0,pages=0;
  do{
   const data=await json(await readRequest(`${API}/files?${params}`,{signal}),'Could not load pose category');
   for(const file of data.files||[])if(file.id!==excludeId){count++;if(random()<1/count)chosen=file;}
   if(!data.nextPageToken)break;
   if(++pages>=20)throw new Error('Pose category is too large to sample safely. Choose a smaller category.');
   params.set('pageToken',data.nextPageToken);
  }while(true);
  if(!chosen)throw new Error('No different supported pose is available in this category.');
  return {...chosen,category:key,categoryLabel:group.label,catalogId:group.id,folderId:group.id,folderLabel:'Poses'};
 }
 return {listReferences,metadata,move,reconcileMove,trash,undo,choosePose};
}

