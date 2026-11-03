const libUrl=new URL('./drive-library.mjs',import.meta.url);libUrl.search=new URL(import.meta.url).search;
const {PRIVATE_FOLDER_ID:P,REFERENCES_FOLDER_ID:R}=await import(libUrl.href);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function mountGalleryLibrary({drive,current,getUrl,onFilter,onChanged}){
 let filter='all',epoch=0,active=null,busy=false,recovery=null;
 const dialog=document.createElement('dialog');dialog.className='library-detail';dialog.setAttribute('aria-labelledby','libraryDetailTitle');document.body.append(dialog);
 const regions=[];
 for(const selector of ['#driftView','#browseView']){
  const drift=selector==='#driftView',key=drift?'drift':'browse';
  const region=document.createElement('div');region.className=`library-tools ${drift?'library-tools-drift':'library-tools-browse'} collapsed`;
  const icon=drift?'···':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4"/></svg>';
  region.innerHTML=`<button type="button" class="library-tools-toggle" aria-expanded="false" aria-label="${drift?'Collection and image options':'Choose collection'}" aria-controls="${key}LibraryOptions">${icon}</button><div id="${key}LibraryOptions" class="library-tools-content"><label>Collection <select aria-label="${drift?'Drift':'Browse'} folder"><option value="all">All</option><option value="private">Private</option><option value="references">References</option></select></label>${drift?'<button type="button" data-details>Image details ↗</button><span data-folder-label></span>':''}<button type="button" data-recovery hidden>Undo last action</button></div>`;
  const surface=document.querySelector(selector),heading=surface?.querySelector('.browse-head');if(heading)heading.append(region);else surface?.append(region);regions.push(region);
  const toggle=region.querySelector('.library-tools-toggle');toggle.addEventListener('click',()=>{const expanded=region.classList.toggle('collapsed')===false;toggle.setAttribute('aria-expanded',String(expanded));});
  region.querySelector('select').addEventListener('change',event=>{filter=event.target.value;regions.forEach(item=>item.querySelector('select').value=filter);onFilter(filter);region.classList.add('collapsed');toggle.setAttribute('aria-expanded','false');});
  region.querySelector('[data-details]')?.addEventListener('click',()=>open(current()));
  region.querySelector('[data-recovery]').addEventListener('click',undo);
 }
 function showRecovery(){regions.forEach(region=>{const button=region.querySelector('[data-recovery]');button.hidden=!recovery;button.disabled=busy;});}
 function clear(){epoch++;active=null;busy=false;dialog.close();dialog.replaceChildren();for(const region of regions){region.classList.add('collapsed');region.querySelector('.library-tools-toggle')?.setAttribute('aria-expanded','false');}}
 function message(value){const output=dialog.querySelector('[role=status]');if(output)output.textContent=value;}
 function setBusy(value){busy=value;dialog.querySelectorAll('button:not([data-close]):not([data-exit])').forEach(button=>button.disabled=value);showRecovery();}
 function draw(file,url){
  dialog.innerHTML=`<header><span>Private collection</span><div><button type="button" data-close>Close</button><button type="button" data-exit>Quick exit</button></div></header><div class="library-detail-body"><img src="${escape(url)}" alt="${escape(file.name)}"/><section><h2 id="libraryDetailTitle">${escape(file.name)}</h2><p data-location>${escape(file.folderLabel||'Private')}</p><small>Drive ID <code>${escape(file.id)}</code></small><div class="library-detail-actions"><button type="button" data-move>Move to ${file.folderId===R?'Private':'References'}</button><button type="button" data-more aria-expanded="false">More ···</button><button type="button" data-trash hidden>Move to Trash…</button></div><div data-confirm hidden><h3>Move this image to Trash?</h3><p>${escape(file.name)}</p><p>You can restore it from Drive Trash or Undo. The original file ID is preserved.</p><button type="button" data-cancel>Cancel</button><button type="button" data-confirm-trash>Move to Trash</button></div><p role="status"></p><button type="button" data-undo ${recovery?'':'hidden'}>Undo last action</button><a href="https://drive.google.com/drive/trash" target="_blank" rel="noopener">Open Drive Trash ↗</a></section></div>`;
 }
 async function open(file){
  if(!file||file.kind==='video')return;const generation=++epoch;active=file;
  draw(file,file.thumbnailLink||'');dialog.showModal();message('Loading preview…');
  try{const url=await getUrl(file.id);if(generation!==epoch)return;draw(file,url);message('Moving preserves this file and its ID.');}catch(error){if(generation===epoch)message(error.message||'Preview could not load.');}
 }
 async function undo(){
  if(!recovery||busy)return;const generation=epoch,record=recovery;setBusy(true);
  try{const result=await drive.undo(record);if(generation!==epoch)return;recovery=null;await onChanged({kind:'restore',file:result.file,id:record.id});message('Restored. Sync confirms its current location.');}
  catch(error){if(generation===epoch)message(`${error.message} Recovery remains available in Google Drive.`);}
  finally{if(generation===epoch)setBusy(false);}
 }
 dialog.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-close')){clear();return;}
  if(button.hasAttribute('data-exit')){window.dispatchEvent(new CustomEvent('velum:quick-exit'));return;}
  if(button.hasAttribute('data-more')){dialog.querySelector('[data-trash]').hidden=false;button.setAttribute('aria-expanded','true');return;}
  if(button.hasAttribute('data-trash')){dialog.querySelector('[data-confirm]').hidden=false;dialog.querySelector('[data-cancel]').focus();return;}
  if(button.hasAttribute('data-cancel')){dialog.querySelector('[data-confirm]').hidden=true;dialog.querySelector('[data-trash]').focus();return;}
  if(button.hasAttribute('data-undo'))return undo();
  if(busy||!active)return;const generation=epoch,file=active;
  if(!button.hasAttribute('data-move')&&!button.hasAttribute('data-confirm-trash'))return;
  setBusy(true);
  try{
   if(button.hasAttribute('data-move')){
    const result=await drive.move(file,file.folderId===R?P:R);if(generation!==epoch)return;
    recovery=result.recovery;active=result.file;await onChanged({kind:'move',file:result.file,id:file.id});if(generation!==epoch)return;
    draw(result.file,await getUrl(file.id));message(`Moved to ${result.file.folderLabel}. Undo restores the previous folder.`);
   }else{
    recovery=await drive.trash(file);if(generation!==epoch)return;await onChanged({kind:'trash',id:file.id});clear();
   }
  }catch(error){if(generation===epoch)message(error.message||'Drive did not confirm this action. Sync before retrying.');}
  finally{if(generation===epoch)setBusy(false);showRecovery();}
 });
 dialog.addEventListener('cancel',clear);
 window.addEventListener('velum:lock',clear);window.addEventListener('pagehide',clear);
 return {open,clear,update(){const file=current();regions.forEach(region=>{const label=region.querySelector('[data-folder-label]');if(label)label.textContent=file?.folderLabel||'';});},get filter(){return filter;}};
}
