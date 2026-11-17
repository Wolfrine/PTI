const libUrl=new URL('./drive-library.mjs',import.meta.url);libUrl.search=new URL(import.meta.url).search;
const {PRIVATE_FOLDER_ID:P,REFERENCES_FOLDER_ID:R}=await import(libUrl.href);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function mountGalleryLibrary({drive,current,getUrl,onFilter,onChanged,getOwner,canRead,storage=globalThis.localStorage}){
 let filter='all',epoch=0,moveSession=0,active=null,busy=false,recovery=null;
 let resuming=null;
 const receiptKey='velum-library-recovery-v1';
 function validReceipt(value){
  const record=value?.record;
  return value?.version===1&&value.owner===getOwner()&&Boolean(value.owner)
   &&['pending','confirmed'].includes(value.phase)&&['move','undo'].includes(value.intent||'move')&&record?.kind==='move'
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
  if(phase==='pending'&&intent==='move'&&previous?.phase==='confirmed')value.previous=previous.record;
  if(!validReceipt(value))throw new Error('This move cannot keep a valid Undo receipt. Reconnect before moving it.');
  const serialized=JSON.stringify(value);
  storage.setItem(receiptKey,serialized);
  if(storage.getItem(receiptKey)!==serialized)throw new Error('Undo could not be saved on this device. Allow site storage before moving this image.');
  return value.record;
 }
 function clearReceipt(){try{storage.removeItem(receiptKey);}catch{}}
 function retainPreviousUndo(receipt){
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
 notice.setAttribute('role','status');notice.innerHTML='<span data-action-message></span><button type="button" data-action-undo hidden>Undo</button><button type="button" data-action-dismiss aria-label="Dismiss notice">×</button>';
 document.body.append(notice);
 notice.querySelector('[data-action-undo]').addEventListener('click',()=>undo());
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
  function showRecovery(){regions.forEach(region=>{const button=region.querySelector('[data-recovery]');button.hidden=!recovery;button.disabled=busy;});const undoButton=notice.querySelector('[data-action-undo]');undoButton.disabled=busy;}
  function showNotice(value,{undoable=false}={}){notice.hidden=false;notice.querySelector('[data-action-message]').textContent=value;notice.querySelector('[data-action-undo]').hidden=!undoable;showRecovery();}
  function closeDetail(){epoch++;active=null;if(dialog.open)dialog.close();dialog.replaceChildren();for(const region of regions){region.classList.add('collapsed');region.querySelector('.library-tools-toggle')?.setAttribute('aria-expanded','false');}}
  function clear(){moveSession++;recovery=null;busy=false;notice.hidden=true;closeDetail();regions.forEach(region=>{const label=region.querySelector('[data-folder-label]');if(label)label.textContent='';});showRecovery();}
 function message(value){const output=dialog.querySelector('[role=status]');if(output)output.textContent=value;}
  function setBusy(value){busy=value;dialog.querySelectorAll('button:not([data-close]):not([data-exit])').forEach(button=>button.disabled=value);document.querySelectorAll('.tile-quick-move').forEach(button=>button.disabled=value);showRecovery();}
 function draw(file,url){
  dialog.innerHTML=`<header><span>Private collection</span><div><button type="button" data-close>Close</button><button type="button" data-exit>Quick exit</button></div></header><div class="library-detail-body"><img src="${escape(url)}" alt="${escape(file.name)}"/><section><h2 id="libraryDetailTitle">${escape(file.name)}</h2><p data-location>${escape(file.folderLabel||'Private')}</p><small>Drive ID <code>${escape(file.id)}</code></small><div class="library-detail-actions"><button type="button" data-move>Move to ${file.folderId===R?'Private':'References'}</button><button type="button" data-more aria-expanded="false">More ···</button><button type="button" data-trash hidden>Move to Trash…</button></div><div data-confirm hidden><h3>Move this image to Trash?</h3><p>${escape(file.name)}</p><p>You can restore it from Drive Trash or Undo. The original file ID is preserved.</p><button type="button" data-cancel>Cancel</button><button type="button" data-confirm-trash>Move to Trash</button></div><p role="status"></p><button type="button" data-undo ${recovery?'':'hidden'}>Undo last action</button><a href="https://drive.google.com/drive/trash" target="_blank" rel="noopener">Open Drive Trash ↗</a></section></div>`;
 }
 async function open(file){
   if(!file||file.kind==='video')return;
   if(busy){showNotice('Finish the current Drive action first.',{undoable:!!recovery});return;}
   const generation=++epoch;active=file;
  draw(file,file.thumbnailLink||'');dialog.showModal();message('Loading preview…');
  try{const url=await getUrl(file.id);if(generation!==epoch)return;draw(file,url);message('Moving preserves this file and its ID.');}catch(error){if(generation===epoch)message(error.message||'Preview could not load.');}
 }
 function updateDetail(file,text){
  if(!dialog.open||active?.id!==file.id)return;
  const preview=dialog.querySelector('img')?.src||active.thumbnailLink||'';
  active={...active,...file};draw(active,preview);message(text);
 }
 async function reconcileReceipt(receipt,generation){
  const record=receipt.record,actual=await drive.metadata(record.id);
  if(generation!==moveSession||!canRead())return;
  if(actual.id!==record.id||actual.ownedByMe!==true||actual.trashed!==false||!actual.mimeType?.startsWith('image/')||actual.parents?.length!==1){
   const retained=retainPreviousUndo(receipt);
   showNotice('This image needs review in Google Drive.',{undoable:retained});return;
  }
  const parent=actual.parents[0];
  if(![record.from,record.to].includes(parent)){
   const retained=retainPreviousUndo(receipt);
   showNotice('This image moved to another folder. Review its current location in Google Drive.',{undoable:retained});return;
  }
  const file={...actual,folderId:parent,folderLabel:parent===R?'References':'Private'};
  if(parent===record.to){
   if(receipt.intent==='undo'){
    recovery=null;clearReceipt();showNotice(`Restored to ${file.folderLabel}.`);
    await reconcileChange({kind:'restore',file,id:record.id});
    if(generation===moveSession)updateDetail(file,'Restored to the previous folder.');return true;
   }
   recovery=record;
   try{persistMove(record,'confirmed');}catch(error){console.error('Confirmed move receipt remains pending',error);}
   showNotice(`Moved to ${file.folderLabel}.`,{undoable:true});
   await reconcileChange({kind:'move',file,id:record.id});
   if(generation===moveSession)updateDetail(file,'Move confirmed. Undo restores the previous folder.');
   return true;
  }else{
   if(receipt.intent==='undo'){
    recovery={...record,from:record.to,to:record.from};
    try{persistMove(recovery,'confirmed');}catch(error){console.error('Original Undo receipt remains recoverable',error);}
    showNotice(`Image is still in ${file.folderLabel}. Undo remains available.`,{undoable:true});
    await reconcileChange({kind:'move',file,id:record.id});
    if(generation===moveSession)updateDetail(file,'Undo has not been applied. You can retry it.');
    return false;
   }
   const retained=retainPreviousUndo(receipt);
   showNotice(`Image is in ${file.folderLabel}.`,{undoable:retained});
   await reconcileChange({kind:'move',file,id:record.id});
   if(generation===moveSession)updateDetail(file,'The image is in its previous folder.');
  }
 }
 function resume(){
  if(busy||!canRead())return Promise.resolve();
  if(resuming?.generation===moveSession)return resuming.promise;
  const receipt=readReceipt();if(!receipt)return Promise.resolve();
  const generation=moveSession;setBusy(true);
  const promise=reconcileReceipt(receipt,generation).catch(error=>{
   if(generation===moveSession)showNotice(error.message||'Reconnect Drive to check the last move.');
  }).finally(()=>{if(generation===moveSession)setBusy(false);if(resuming?.promise===promise)resuming=null;});
  resuming={generation,promise};return promise;
 }
 async function undo(){
   if(!recovery||busy)return;const session=moveSession,record=recovery;let pending=null;setBusy(true);
   showNotice('Restoring previous folder…');
   try{const result=await drive.undo(record,{onPending:next=>{
     if(session!==moveSession)throw new Error('Velum locked before Undo started.');
     pending=persistMove(next,'pending','undo');
    }});if(session!==moveSession)return;recovery=null;clearReceipt();
    showNotice(`Restored to ${result.file.folderLabel||'the previous folder'}.`);
    await reconcileChange({kind:'restore',file:result.file,id:record.id});
    if(session===moveSession)updateDetail(result.file,'Restored to the previous folder.');
   }
   catch(error){if(session===moveSession){
    if(pending){try{await reconcileReceipt({record:pending,intent:'undo'},session);}catch{showNotice('Undo confirmation is pending. Reconnect Drive to check its location.');}}
    else showNotice(error.message||'Undo could not be confirmed.',{undoable:!!recovery});
   }}
   finally{if(session===moveSession)setBusy(false);}
 }
  async function moveQuick(file,{focusUndo=false}={}){
   if(busy||!file||!file.mimeType?.startsWith('image/')||![P,R].includes(file.folderId))return false;
   const session=moveSession;
   if(readReceipt()?.phase==='pending'){
    try{await drive.authorize();if(session===moveSession)await resume();}
    catch(error){if(session===moveSession)showNotice(error.message||'Reconnect Drive to check the last move.');}
    return false;
   }
   const destination=file.folderId===R?P:R;let pending=null;
   setBusy(true);showNotice(`Authorizing move to ${destination===R?'References':'Private'}…`);
   try{
    const result=await drive.move(file,destination,{onPending:record=>{
     if(session!==moveSession)throw new Error('Velum locked before the move started.');
     pending=persistMove(record,'pending');
    }});
    if(session!==moveSession)return false;
    recovery=result.recovery;
    try{persistMove(recovery,'confirmed');}catch(error){console.error('Move confirmed, pending receipt retained',error);}
    showNotice(`Moved to ${result.file.folderLabel}.`,{undoable:true});
    await reconcileChange({kind:'move',file:result.file,id:file.id});
    if(session!==moveSession)return true;
    updateDetail(result.file,`Moved to ${result.file.folderLabel}. Undo restores the previous folder.`);
    if(focusUndo)notice.querySelector('[data-action-undo]').focus();
    return true;
   }catch(error){
    if(session===moveSession){
     if(pending){try{return Boolean(await reconcileReceipt(readReceipt()||{record:pending},session));}catch{showNotice('Move confirmation is pending. Reconnect Drive to check its location.');}}
     else showNotice(error?.message||'Drive did not confirm this move.',{undoable:!!recovery});
    }
    return false;
   }finally{if(session===moveSession)setBusy(false);}
  }
 dialog.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
   if(button.hasAttribute('data-close')){closeDetail();return;}
  if(button.hasAttribute('data-exit')){window.dispatchEvent(new CustomEvent('velum:quick-exit'));return;}
  if(button.hasAttribute('data-more')){dialog.querySelector('[data-trash]').hidden=false;button.setAttribute('aria-expanded','true');return;}
  if(button.hasAttribute('data-trash')){dialog.querySelector('[data-confirm]').hidden=false;dialog.querySelector('[data-cancel]').focus();return;}
  if(button.hasAttribute('data-cancel')){dialog.querySelector('[data-confirm]').hidden=true;dialog.querySelector('[data-trash]').focus();return;}
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
 window.addEventListener('velum:lock',clear);window.addEventListener('pagehide',clear);
  return {open,move:moveQuick,clear,resume,update(){const file=current();regions.forEach(region=>{const label=region.querySelector('[data-folder-label]');if(label)label.textContent=file?.folderLabel||'';});},get filter(){return filter;},get busy(){return busy;}};
}

