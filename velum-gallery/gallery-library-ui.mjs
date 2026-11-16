const libUrl=new URL('./drive-library.mjs',import.meta.url);libUrl.search=new URL(import.meta.url).search;
const {PRIVATE_FOLDER_ID:P,REFERENCES_FOLDER_ID:R}=await import(libUrl.href);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function mountGalleryLibrary({drive,current,getUrl,onFilter,onChanged}){
 let filter='all',epoch=0,moveSession=0,active=null,busy=false,recovery=null;
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
  function clear(){moveSession++;recovery=null;busy=false;notice.hidden=true;closeDetail();showRecovery();}
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
 async function undo(){
   if(!recovery||busy)return;const session=moveSession,record=recovery;setBusy(true);
   showNotice('Restoring previous folder…');
   try{const result=await drive.undo(record);if(session!==moveSession)return;recovery=null;
    showNotice(`Restored to ${result.file.folderLabel||'the previous folder'}.`);
    try{await onChanged({kind:'restore',file:result.file,id:record.id});}
    catch(error){console.error('Gallery state update failed after confirmed Drive undo',error);}
    if(dialog.open&&active?.id===record.id){const preview=dialog.querySelector('img')?.src||active.thumbnailLink||'';active=result.file;draw(result.file,preview);message('Restored to the previous folder.');}
   }
   catch(error){if(session===moveSession){message(`${error.message} Recovery remains available in Google Drive.`);showNotice(error.message||'Undo could not be confirmed.',{undoable:!!recovery});}}
   finally{if(session===moveSession)setBusy(false);}
 }
  async function moveQuick(file,{focusUndo=false}={}){
   if(busy||!file||!file.mimeType?.startsWith('image/')||![P,R].includes(file.folderId))return false;
   const session=moveSession,destination=file.folderId===R?P:R;
   setBusy(true);showNotice(`Authorizing move to ${destination===R?'References':'Private'}…`);
   try{
    const result=await drive.move(file,destination);
    if(session!==moveSession)return false;
    recovery=result.recovery;
    showNotice(`Moved to ${result.file.folderLabel}.`,{undoable:true});
    try{await onChanged({kind:'move',file:result.file,id:file.id});}
    catch(error){console.error('Gallery state update failed after confirmed Drive move',error);}
    if(focusUndo)notice.querySelector('[data-action-undo]').focus();
    return true;
   }catch(error){
    if(session===moveSession)showNotice(error?.message||'Drive did not confirm this move.',{undoable:!!recovery});
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
   if(busy||!active)return;const generation=++epoch,session=moveSession,file=active,preview=dialog.querySelector('img')?.src||file.thumbnailLink||'';
  if(!button.hasAttribute('data-move')&&!button.hasAttribute('data-confirm-trash'))return;
  setBusy(true);
  try{
   if(button.hasAttribute('data-move')){
     const result=await drive.move(file,file.folderId===R?P:R);if(session!==moveSession)return;
     recovery=result.recovery;
     showNotice(`Moved to ${result.file.folderLabel}.`,{undoable:true});
     try{await onChanged({kind:'move',file:result.file,id:file.id});}
     catch(error){console.error('Gallery state update failed after confirmed Drive move',error);}
     if(generation===epoch){active=result.file;draw(result.file,preview);message(`Moved to ${result.file.folderLabel}. Undo restores the previous folder.`);}
   }else{
     recovery=await drive.trash(file);if(session!==moveSession)return;await onChanged({kind:'trash',id:file.id});closeDetail();
   }
   }catch(error){if(session===moveSession){if(generation===epoch)message(error.message||'Drive did not confirm this action. Sync before retrying.');showNotice(error.message||'Drive did not confirm this action.',{undoable:!!recovery});}}
   finally{if(session===moveSession)setBusy(false);showRecovery();}
 });
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});
 window.addEventListener('velum:lock',clear);window.addEventListener('pagehide',clear);
  return {open,move:moveQuick,clear,update(){const file=current();regions.forEach(region=>{const label=region.querySelector('[data-folder-label]');if(label)label.textContent=file?.folderLabel||'';});},get filter(){return filter;},get busy(){return busy;}};
}

