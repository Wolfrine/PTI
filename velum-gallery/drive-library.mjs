// Metadata and operations stay in the signed-in browser. No server Drive secret.
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
async function json(response,message){if(!response.ok)throw new Error(`${message} (${response.status}). Reconnect or retry.`);return response.json();}
export function createDriveLibrary({readRequest,writeRequest,grantFile,grantFolder}){
 async function listReferences({folder='all',search='',cursor='',signal}={}){
  const params=new URLSearchParams({q:libraryQuery({folder,search}),fields:'nextPageToken,files(id,name,mimeType,parents,thumbnailLink,size,modifiedTime)',pageSize:'60',orderBy:'modifiedTime desc'});
  if(cursor)params.set('pageToken',cursor);
  const data=await json(await readRequest(`${API}/files?${params}`,{signal}),'Could not load references');
  return {files:(data.files||[]).map(libraryFile),cursor:data.nextPageToken||''};
 }
 async function metadata(file,signal){return json(await readRequest(`${API}/files/${id(file.id||file)}?fields=id,name,mimeType,parents,trashed,thumbnailLink,size`,{signal}),'Could not verify image');}
 async function manageable(file){
  const actual=await grantFile(file);
  if(actual.id!==file.id||actual.ownedByMe!==true||actual.trashed||!folderLabel(actual))throw new Error('Only your images in Private or References can be managed here.');
  return actual;
 }
 async function move(file,destination){
  if(!Object.values(LIBRARY_FOLDERS).includes(destination))throw new Error('Choose Private or References.');
  const actual=await manageable(file),source=libraryFile(actual).folderId;
  if(source===destination)throw new Error('This image is already in that folder.');
  if(actual.capabilities?.canMoveItemWithinDrive!==true)throw new Error('Google Drive has not allowed this file to move.');
  await grantFolder(destination);
  // Re-read after the grant: do not overwrite a move made in another tab.
  const latest=await metadata(file);
  if(latest.trashed||!latest.parents?.includes(source)||latest.parents?.some(parent=>parent!==source))throw new Error('This file moved elsewhere. Sync before retrying.');
  const params=new URLSearchParams({addParents:destination,removeParents:source,fields:'id,name,parents,trashed'});
  const moved=await json(await writeRequest(`${API}/files/${id(file.id)}?${params}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'}),'Move was not confirmed');
  if(moved.id!==file.id||moved.trashed||!moved.parents?.includes(destination)||moved.parents?.includes(source))throw new Error('Move response did not match. Sync to recover the actual location.');
  return {file:libraryFile({...file,...moved}),recovery:{kind:'move',id:file.id,name:file.name,from:source,to:destination,at:Date.now()}};
 }
 async function trash(file){
  const actual=await manageable(file);
  if(actual.capabilities?.canTrash!==true)throw new Error('Google Drive has not allowed this file to be trashed.');
  const changed=await json(await writeRequest(`${API}/files/${id(file.id)}?fields=id,trashed`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})}),'Trash was not confirmed');
  if(changed.id!==file.id||changed.trashed!==true)throw new Error('Trash response did not match. Check Drive Trash.');
  return {kind:'trash',id:file.id,name:file.name,folderId:libraryFile(actual).folderId,at:Date.now()};
 }
 async function undo(record){
  if(record?.kind==='move')return move({id:id(record.id),name:record.name},record.from);
  if(record?.kind!=='trash')throw new Error('No recoverable action selected.');
  const restored=await json(await writeRequest(`${API}/files/${id(record.id)}?fields=id,name,parents,trashed`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:false})}),'Restore was not confirmed');
  if(restored.trashed!==false)throw new Error('Restore response did not match. Open Drive Trash to recover it.');
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
 return {listReferences,metadata,move,trash,undo,choosePose};
}
