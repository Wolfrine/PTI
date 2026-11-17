const libUrl=new URL('./drive-library.mjs',import.meta.url);libUrl.search=new URL(import.meta.url).search;
const {PRIVATE_FOLDER_ID:P,REFERENCES_FOLDER_ID:R}=await import(libUrl.href);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function mountGalleryLibrary({drive,connect,current,getUrl,onFilter,onChanged,getOwner,canRead,storage=globalThis.localStorage}){
 let filter='all',epoch=0,moveSession=0,active=null,busy=false,recovery=null;
 let resuming=null,offeredReceipt=null;
 const receiptKey='velum-library-recovery-v1';
 const resumeKey='velum-library-connect-resume-v1';
 function clearConnectResume(){try{globalThis.sessionStorage?.removeItem(resumeKey);}catch{}}
 function consumeConnectResume(receipt){
  try{
   const value=JSON.parse(globalThis.sessionStorage?.getItem(resumeKey)||'null');
   clearConnectResume();
   return new URL(location.href).searchParams.get('drive')==='connected'&&value?.owner===receipt.owner
    &&Date.now()-value.requestedAt>=0&&Date.now()-value.requestedAt<10*60*1000
    &&['id','from','to','at'].every(key=>value.record?.[key]===receipt.record[key]);
  }catch{return false;}
 }
 function validReceipt(value){
  const record=value?.record;
  return value?.version===1&&value.owner===getOwner()&&Boolean(value.owner)
   &&['queued','pending','confirmed'].includes(value.phase)&&['move','undo'].includes(value.intent||'move')&&record?.kind==='move'
   &&/^[\w-]{8,160}$/.test(record.id||'')&&[P,R].includes(record.from)&&[P,R].includes(record.to)&&record.from!==record.to
   &&Number.isSafeInteger(record.at)&&record.at>0&&typeof record.name==='string'&&record.name.length<=250
   &&/^image\/[a-z0-9.+-]+$/i.test(record.mimeType||'');
 }
 function readReceipt(){
  try{const value=JSON.parse(storage.getItem(receiptKey)||'null');return validReceipt(value)?value:null;}
  catch{return null;}
 }
 function persistMove(record,phase,intent='move'){
  const value={version:1,owner:getOwner(),phase,intent,record:{kind:'move',id:record.id,name:String(record.name||'Image').slice(0,250),mimeType:record.mimeType,from:record.from,to:record.to,at:record.at}};
  const previous=readReceipt();
  if(phase!=='confirmed'){
   if(previous?.phase==='confirmed')value.previous=previous.record;
   else if(previous?.record.id===record.id&&previous.record.from===record.from&&previous.record.to===record.to)value.previous=previous.previous;
  }
  if(!validReceipt(value))throw new Error('This move cannot keep a valid Undo receipt. Reconnect before moving it.');
  const serialized=JSON.stringify(value);
  storage.setItem(receiptKey,serialized);
  if(storage.getItem(receiptKey)!==serialized)throw new Error('Undo could not be saved on this device. Allow site storage before moving this image.');
  return value.record;
 }
 function clearReceipt(){try{storage.removeItem(receiptKey);}catch{}}
 function retainPreviousUndo(receipt){
  if(!matchesReceipt(receipt))return false;
  if(!validReceipt({...receipt,phase:'confirmed',intent:'move',record:receipt.previous})){
   recovery=null;clearReceipt();return false;
  }
  recovery=receipt.previous;
  try{persistMove(recovery,'confirmed');}catch(error){console.error('Previous Undo remains in the pending receipt',error);}
  return true;
 }
 async function reconcileChange(change){
  try{await onChanged(change);}
  catch(error){console.error('Gallery refresh failed after a confirmed Drive change',error);}
 }
 const dialog=document.createElement('dialog');dialog.className='library-detail';dialog.setAttribute('aria-labelledby','libraryDetailTitle');document.body.append(dialog);
 const notice=document.createElement('div');notice.className='library-action-notice';notice.hidden=true;
 notice.setAttribute('role','status');notice.innerHTML='<span data-action-message></span><button type="button" data-reconnect hidden>Reconnect Drive</button><button type="button" data-action-undo hidden>Undo</button><button type="button" data-action-dismiss aria-label="Dismiss notice">×</button>';
 document.body.append(notice);
 notice.querySelector('[data-action-undo]').addEventListener('click',()=>undo());
 notice.querySelector('[data-reconnect]').addEventListener('click',reconnect);
 notice.querySelector('[data-action-dismiss]').addEventListener('click',()=>{notice.hidden=true;});
 const regions=[];
 for(const selector of ['#driftView','#browseView']){
  const drift=selector==='#driftView',key=drift?'drift':'browse';
  const region=document.createElement('div');region.className=`library-tools ${drift?'library-tools-drift':'library-tools-browse'} collapsed`;
  const icon=drift?'···':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4"/></svg>';
   region.innerHTML=`<button type="button" class="library-tools-toggle" aria-expanded="false" aria-label="${drift?'Collection options':'Choose collection'}" aria-controls="${key}LibraryOptions">${icon}</button>${drift?'<button type="button" class="library-detail-shortcut" data-details aria-label="Image details" title="Image details">ⓘ</button>':''}<div id="${key}LibraryOptions" class="library-tools-content"><label>Collection <select aria-label="${drift?'Drift':'Browse'} folder"><option value="all">All</option><option value="private">Private</option><option value="references">References</option></select></label>${drift?'<span data-folder-label></span>':''}<button type="button" data-recovery hidden>Undo last action</button></div>`;
  const surface=document.querySelector(selector),heading=surface?.querySelector('.browse-head');if(heading)heading.append(region);else surface?.append(region);regions.push(region);
  const toggle=region.querySelector('.library-tools-toggle');toggle.addEventListener('click',()=>{const expanded=region.classList.toggle('collapsed')===false;toggle.setAttribute('aria-expanded',String(expanded));});
  region.querySelector('select').addEventListener('change',event=>{filter=event.target.value;regions.forEach(item=>item.querySelector('select').value=filter);onFilter(filter);region.classList.add('collapsed');toggle.setAttribute('aria-expanded','false');});
  region.querySelector('[data-details]')?.addEventListener('click',()=>open(current()));
  region.querySelector('[data-recovery]').addEventListener('click',undo);
 }
  function showRecovery(){regions.forEach(region=>{const button=region.querySelector('[data-recovery]');button.hidden=!recovery;button.disabled=busy;});notice.querySelectorAll('button:not([data-action-dismiss])').forEach(button=>button.disabled=busy);}
  function showNotice(value,{undoable=false,reconnectable=false,receipt=null,reconnectLabel='Reconnect Drive'}={}){
   reconnectable=reconnectable&&validReceipt(receipt)&&matchesReceipt(receipt);offeredReceipt=reconnectable?receipt:null;
   notice.hidden=false;notice.querySelector('[data-action-message]').textContent=value;notice.querySelector('[data-action-undo]').hidden=!undoable;
   for(const surface of [notice,dialog]){const button=surface.querySelector('[data-reconnect]');if(button){button.hidden=!reconnectable;button.disabled=busy;button.textContent=reconnectLabel;}}
   message(value);showRecovery();
  }
  function closeDetail(){epoch++;active=null;if(dialog.open)dialog.close();dialog.replaceChildren();for(const region of regions){region.classList.add('collapsed');region.querySelector('.library-tools-toggle')?.setAttribute('aria-expanded','false');}}
  function clear({preserveResume=false}={}){if(!preserveResume)clearConnectResume();moveSession++;recovery=null;offeredReceipt=null;busy=false;notice.hidden=true;closeDetail();regions.forEach(region=>{const label=region.querySelector('[data-folder-label]');if(label)label.textContent='';});showRecovery();}
 function message(value){const output=dialog.querySelector('[role=status]');if(output)output.textContent=value;}
  function setBusy(value){busy=value;dialog.querySelectorAll('button:not([data-close]):not([data-exit])').forEach(button=>button.disabled=value);document.querySelectorAll('.tile-quick-move').forEach(button=>button.disabled=value);showRecovery();}
 function draw(file,url){
  dialog.innerHTML=`<header><span>Private collection</span><div><button type="button" data-close>Close</button><button type="button" data-exit>Quick exit</button></div></header><div class="library-detail-body"><img src="${escape(url)}" alt="${escape(file.name)}"/><section><h2 id="libraryDetailTitle">${escape(file.name)}</h2><p data-location>${escape(file.folderLabel||'Private')}</p><small>Drive ID <code>${escape(file.id)}</code></small><div class="library-detail-actions"><button type="button" data-move>Move to ${file.folderId===R?'Private':'References'}</button><button type="button" data-more aria-expanded="false">More ···</button><button type="button" data-trash hidden>Move to Trash…</button></div><div data-confirm hidden><h3>Move this image to Trash?</h3><p>${escape(file.name)}</p><p>You can restore it from Drive Trash or Undo. The original file ID is preserved.</p><button type="button" data-cancel>Cancel</button><button type="button" data-confirm-trash>Move to Trash</button></div><p role="status"></p><button type="button" data-undo ${recovery?'':'hidden'}>Undo last action</button><a href="https://drive.google.com/drive/trash" target="_blank" rel="noopener">Open Drive Trash ↗</a></section></div>`;
  dialog.querySelector('[data-move]').hidden=!file.mimeType?.startsWith('image/')||![P,R].includes(file.folderId);
  const button=document.createElement('button');button.type='button';button.dataset.reconnect='';button.textContent=notice.querySelector('[data-reconnect]').textContent;button.hidden=notice.querySelector('[data-reconnect]').hidden;
  dialog.querySelector('[role=status]').after(button);
 }
 async function open(file){
   if(!file||file.kind==='video')return;
   if(busy){showNotice('Finish the current Drive action first.',{undoable:!!recovery});return;}
   const generation=++epoch,session=moveSession,owner=getOwner();active=file;
  draw(file,file.thumbnailLink||'');dialog.showModal();message('Loading preview…');
  const image=dialog.querySelector('img'),status=dialog.querySelector('[role=status]');
  const currentPreview=()=>generation===epoch&&session===moveSession&&owner===getOwner()&&dialog.open&&active?.id===file.id&&dialog.querySelector('img')===image;
  try{const url=await getUrl(file.id);if(!currentPreview())return;image.src=url;if(!busy&&status.textContent==='Loading preview…')message('Moving preserves this file and its ID.');}
  catch(error){if(currentPreview()&&!busy&&status.textContent==='Loading preview…')message(error.message||'Preview could not load.');}
 }
 function updateDetail(file,text){
  if(!dialog.open||active?.id!==file.id)return;
  active={...active,...file};
  dialog.querySelector('h2').textContent=active.name;dialog.querySelector('img').alt=active.name;
  dialog.querySelector('[data-location]').textContent=active.folderId===R?'References':'Private';
  const move=dialog.querySelector('[data-move]');move.textContent=`Move to ${active.folderId===R?'Private':'References'}`;move.hidden=![P,R].includes(active.folderId);
  dialog.querySelector('[data-undo]').hidden=!recovery;message(text);
 }
 function isCurrent(generation,owner){return generation===moveSession&&Boolean(owner)&&owner===getOwner();}
 function matchesReceipt(receipt,saved=readReceipt()){
  return validReceipt(receipt)&&saved?.owner===receipt.owner&&saved.intent===receipt.intent
   &&['id','from','to','at'].every(key=>saved.record[key]===receipt.record[key]);
 }
 function needsReconnect(error){
  return ['drive/reconnect-required','drive/sign-in-required','drive/owner-sign-in-required','drive/connect-required',
   'auth/user-token-expired','auth/invalid-user-token','auth/user-disabled'].includes(error?.code);
 }
 function offerReconnect(receipt,error){
  const authorizationRequired=needsReconnect(error)||(!error&&!canRead()),pending=readReceipt()?.phase==='pending';
  const action=receipt.intent==='undo'?'restore the previous folder':'finish the move';
  showNotice(error?.message||(authorizationRequired?`Reconnect Drive to ${action}.`:`Check the saved action to ${action}.`),{
   reconnectable:true,receipt,reconnectLabel:authorizationRequired?'Reconnect Drive':pending?'Check move':'Retry move'
  });
 }
 function connectionFailed(error,receipt){
  if(!matchesReceipt(receipt))return;
  if(needsReconnect(error)){offerReconnect(receipt,error);return;}
  const saved=readReceipt();
  if(saved?.phase==='queued'){
   const retained=retainPreviousUndo(receipt);
   showNotice(error.message||'Drive could not start this move.',{undoable:retained});
  }else offerReconnect(receipt,error);
 }
 function persistRejectedMove(receipt,error){
  if(receipt.phase!=='queued'||error.status!==403||error.stage!=='Move was not confirmed'||!matchesReceipt(receipt))return;
  const saved=readReceipt();
  if(saved?.phase!=='pending')return;
  const value={...saved,rejection:{status:403,message:error.message.slice(0,400)}};
  const serialized=JSON.stringify(value);
  storage.setItem(receiptKey,serialized);
  if(storage.getItem(receiptKey)!==serialized)throw new Error('The rejected move still needs a location check.');
 }
 async function completeMove(receipt,file,generation){
  if(!isCurrent(generation,receipt.owner)||!matchesReceipt(receipt))return false;
  const restoring=receipt.intent==='undo';
  if(restoring){recovery=null;clearReceipt();}
  else{
   recovery=receipt.record;
   try{persistMove(recovery,'confirmed');}catch(error){console.error('Confirmed move receipt remains recoverable',error);}
  }
  showNotice(`${restoring?'Restored':'Moved'} to ${file.folderLabel}.`,{undoable:!restoring});
  await reconcileChange({kind:restoring?'restore':'move',file,id:receipt.record.id});
  if(isCurrent(generation,receipt.owner))updateDetail(file,restoring?'Restored to the previous folder.':'Move confirmed. Undo restores the previous folder.');
  return true;
 }
 async function reconcileReceipt(receipt,generation,{continueAction=false}={}){
  let saved=readReceipt();
  if(!validReceipt(receipt)||!matchesReceipt(receipt,saved))return false;
  receipt=saved;
  const record=receipt.record,actual=await drive.metadata(record.id);
  saved=readReceipt();
  if(!isCurrent(generation,receipt.owner)||!matchesReceipt(receipt,saved))return false;
  receipt=saved;
  if(!canRead()){offerReconnect(receipt);return false;}
  if(actual.id!==record.id||actual.ownedByMe!==true||actual.trashed!==false||actual.mimeType!==record.mimeType||actual.parents?.length!==1){
   if(receipt.phase==='pending'){showNotice('This pending move needs review in Google Drive. Its receipt is kept on this device.');return false;}
   const retained=retainPreviousUndo(receipt);
   showNotice('This image needs review in Google Drive.',{undoable:retained});return false;
  }
  const parent=actual.parents[0];
  if(![record.from,record.to].includes(parent)){
   if(receipt.phase==='pending'){showNotice('This image moved to another folder. Its pending receipt is kept for review.');return false;}
   const retained=retainPreviousUndo(receipt);
   showNotice('This image moved to another folder. Review its current location in Google Drive.',{undoable:retained});return false;
  }
  const file={...actual,folderId:parent,folderLabel:parent===R?'References':'Private'};
  if(parent===record.to)return completeMove(receipt,file,generation);
  if(receipt.phase!=='confirmed'){
   if(receipt.rejection?.status===403&&typeof receipt.rejection.message==='string'&&receipt.rejection.message.length<=400){
    const retained=retainPreviousUndo(receipt);
    showNotice(receipt.rejection.message,{undoable:retained});return false;
   }
   if(continueAction)return performMove(receipt,generation);
   // Reload/Sync may inspect the receipt, but only the explicit reconnect gesture resumes writes.
   offerReconnect(receipt);return false;
  }
  const retained=retainPreviousUndo(receipt);
  showNotice(`Image is in ${file.folderLabel}.`,{undoable:retained});
  await reconcileChange({kind:'move',file,id:record.id});
  if(isCurrent(generation,receipt.owner))updateDetail(file,'The image is in its previous folder.');
  return false;
 }
 async function performMove(receipt,generation){
  if(!validReceipt(receipt)||!isCurrent(generation,receipt.owner))return false;
  const savedAtDispatch=readReceipt();
  if(!matchesReceipt(receipt,savedAtDispatch)){showNotice('The saved move changed on this device. Review the image before retrying.');return false;}
  // The caller may hold an older queued snapshot of a now-pending action.
  // Rejection cleanup eligibility must use the stored phase at dispatch.
  receipt=savedAtDispatch;
  const record=receipt.record;
  showNotice(receipt.intent==='undo'?'Moving… Back to the previous folder.':`Moving… To ${record.to===R?'References':'Private'}.`);
  try{
   const result=await drive.move({id:record.id,name:record.name,mimeType:record.mimeType,folderId:record.from},record.to,{onPending:next=>{
    if(!isCurrent(generation,receipt.owner)||!matchesReceipt(receipt))throw new Error('Velum locked or the saved move changed before it started.');
    persistMove({...next,at:record.at},'pending',receipt.intent);
   }});
   return await completeMove(receipt,result.file,generation);
  }catch(error){
   if(!isCurrent(generation,receipt.owner))return false;
   if(!matchesReceipt(receipt)){showNotice('The saved move changed on this device. Review its location in Drive.');return false;}
   if(needsReconnect(error)){offerReconnect(receipt,error);return false;}
   try{persistRejectedMove(receipt,error);}catch{}
   const saved=readReceipt();
   if(saved?.phase==='pending'&&matchesReceipt(receipt)){
    try{return await reconcileReceipt(saved,generation);}
    catch(checkError){if(isCurrent(generation,receipt.owner))offerReconnect(receipt,checkError);}
   }else{
    const retained=retainPreviousUndo(receipt);
    showNotice(error.message||'Drive did not confirm this move.',{undoable:retained});
   }
   return false;
  }
 }
 function resume(){
  if(busy)return Promise.resolve();
  if(resuming?.generation===moveSession)return resuming.promise;
  const receipt=readReceipt();if(!receipt)return Promise.resolve();
  if(!canRead()){offerReconnect(receipt);return Promise.resolve();}
  const generation=moveSession;setBusy(true);
  const promise=reconcileReceipt(receipt,generation,{continueAction:consumeConnectResume(receipt)}).catch(error=>{
   if(isCurrent(generation,receipt.owner))connectionFailed(error,receipt);
  }).finally(()=>{if(isCurrent(generation,receipt.owner))setBusy(false);if(resuming?.promise===promise)resuming=null;});
  resuming={generation,promise};return promise;
 }
 function reconnect(){
  if(busy)return;
  const receipt=offeredReceipt,generation=moveSession;
  if(!receipt)return;
  if(!matchesReceipt(receipt)){showNotice('The saved move changed on this device. Sync to review its current location.');return;}
  try{globalThis.sessionStorage?.setItem(resumeKey,JSON.stringify({owner:receipt.owner,record:receipt.record,requestedAt:Date.now()}));}catch{}
  // Start the shared popup on the click call stack, before any await or metadata request.
  let connection;
  try{connection=connect();}catch(error){clearConnectResume();connectionFailed(error,receipt);return;}
  setBusy(true);showNotice('Checking the saved move…');
  return Promise.resolve(connection).then(async()=>{
   if(!isCurrent(generation,receipt.owner)||!matchesReceipt(receipt))return;
   await reconcileReceipt(receipt,generation,{continueAction:true});
  }).catch(error=>{
   if(isCurrent(generation,receipt.owner))connectionFailed(error,receipt);
  }).finally(()=>{clearConnectResume();if(isCurrent(generation,receipt.owner))setBusy(false);});
 }
 async function undo(){
  if(!recovery||busy)return;
  const existing=readReceipt();
  if(existing&&existing.phase!=='confirmed'){offerReconnect(existing);return;}
  const generation=moveSession,owner=getOwner(),record=recovery;
  if(record.kind==='move'){
   let receipt;
   try{persistMove({...record,from:record.to,to:record.from,at:Date.now()},'queued','undo');receipt=readReceipt();}
   catch(error){showNotice(error.message||'Undo could not be saved on this device.',{undoable:true});return;}
   setBusy(true);
   try{
    await connect();
    if(isCurrent(generation,owner)&&matchesReceipt(receipt))await performMove(receipt,generation);
   }catch(error){if(isCurrent(generation,owner))connectionFailed(error,receipt);}
   finally{if(isCurrent(generation,owner))setBusy(false);}
   return;
  }
  setBusy(true);showNotice('Restoring from Drive Trash…');
  try{
   const result=await drive.undo(record);if(!isCurrent(generation,owner))return;
   recovery=null;clearReceipt();showNotice('Restored from Drive Trash.');
   await reconcileChange({kind:'restore',file:result.file,id:record.id});
   if(isCurrent(generation,owner))updateDetail(result.file,'Restored from Drive Trash.');
  }catch(error){if(isCurrent(generation,owner))showNotice(error.message||'Undo could not be confirmed.',{undoable:true});}
  finally{if(isCurrent(generation,owner))setBusy(false);}
 }
 async function moveQuick(file,{focusUndo=false}={}){
  if(busy||!file||!file.mimeType?.startsWith('image/')||![P,R].includes(file.folderId))return false;
  const generation=moveSession,owner=getOwner(),existing=readReceipt();
  if(existing&&existing.phase!=='confirmed'){offerReconnect(existing);return false;}
  let receipt;
  try{
   persistMove({kind:'move',id:file.id,name:file.name,mimeType:file.mimeType,from:file.folderId,to:file.folderId===R?P:R,at:Date.now()},'queued');
   receipt=readReceipt();
  }catch(error){showNotice(error.message||'The move could not be saved on this device.',{undoable:!!recovery});return false;}
  setBusy(true);
  try{
   await connect();
   if(!isCurrent(generation,owner)||!matchesReceipt(receipt))return false;
   const moved=await performMove(receipt,generation);
   if(moved&&focusUndo&&isCurrent(generation,owner))notice.querySelector('[data-action-undo]').focus();
   return moved;
  }catch(error){
   if(isCurrent(generation,owner))connectionFailed(error,receipt);
   return false;
  }finally{if(isCurrent(generation,owner))setBusy(false);}
 }
 dialog.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
   if(button.hasAttribute('data-close')){closeDetail();return;}
  if(button.hasAttribute('data-exit')){window.dispatchEvent(new CustomEvent('velum:quick-exit'));return;}
  if(button.hasAttribute('data-more')){dialog.querySelector('[data-trash]').hidden=false;button.setAttribute('aria-expanded','true');return;}
  if(button.hasAttribute('data-trash')){dialog.querySelector('[data-confirm]').hidden=false;dialog.querySelector('[data-cancel]').focus();return;}
  if(button.hasAttribute('data-cancel')){dialog.querySelector('[data-confirm]').hidden=true;dialog.querySelector('[data-trash]').focus();return;}
  if(button.hasAttribute('data-reconnect'))return reconnect();
  if(button.hasAttribute('data-undo'))return undo();
  if(button.hasAttribute('data-move'))return moveQuick(active);
   if(busy||!active||!button.hasAttribute('data-confirm-trash'))return;
   const generation=++epoch,session=moveSession,file=active;
  setBusy(true);
  try{
     recovery=await drive.trash(file);if(session!==moveSession)return;clearReceipt();
     showNotice('Moved to Drive Trash.',{undoable:true});
     await reconcileChange({kind:'trash',id:file.id});if(session===moveSession)closeDetail();
   }catch(error){if(session===moveSession){if(generation===epoch)message(error.message||'Drive did not confirm this action. Sync before retrying.');showNotice(error.message||'Drive did not confirm this action.',{undoable:!!recovery});}}
   finally{if(session===moveSession)setBusy(false);showRecovery();}
 });
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});
 window.addEventListener('velum:lock',clear);window.addEventListener('pagehide',()=>clear({preserveResume:true}));
  return {open,move:moveQuick,clear,resume,update(){const file=current();regions.forEach(region=>{const label=region.querySelector('[data-folder-label]');if(label)label.textContent=file?.folderLabel||'';});},get filter(){return filter;},get busy(){return busy;}};
}

