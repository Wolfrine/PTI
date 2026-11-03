// Private, on-demand Drive browser. No token, image byte or persistent cache ownership.
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const imageURL = value => /^(https?:|blob:|data:image\/)/i.test(String(value || '')) ? String(value) : '';
const metadata = file => ({id:String(file.id),name:String(file.name || 'Untitled image'),thumbnailLink:imageURL(file.thumbnailLink),folderId:String(file.folderId || ''),folderLabel:String(file.folderLabel || 'Drive'),mimeType:String(file.mimeType || '')});
let nextPicker = 0;

export function createReferencePicker({drive}) {
  if (typeof drive?.listReferences !== 'function') throw new Error('Reference browsing is unavailable.');
  let dialog, resolveChoice, request, epoch=0, searchTimer, recents=[], state;

  function close(result=[]) {
    epoch++; clearTimeout(searchTimer); request?.abort(); request=null;
    const resolve=resolveChoice; resolveChoice=null;
    if(dialog){dialog.close();dialog.remove();dialog=null;}
    state=null; resolve?.(result);
  }
  function clear(){close();recents=[];}
  function selectedIndex(id){return state.selected.findIndex(file=>file.id===id);}
  function status(message){if(dialog)dialog.querySelector('[data-picker-status]').textContent=message;}

  function renderPreview(file) {
    state.preview=file;
    const preview=dialog.querySelector('[data-picker-preview-panel]');
    preview.innerHTML=file?`<figure>${file.thumbnailLink?`<img src="${escapeHTML(file.thumbnailLink)}" alt="Preview of ${escapeHTML(file.name)}" referrerpolicy="no-referrer"/>`:'<span class="studio-picker-no-image">Preview unavailable</span>'}<figcaption><strong>${escapeHTML(file.name)}</strong><span>${escapeHTML(file.folderLabel)}</span></figcaption></figure><p>Preview only. Your original stays unchanged.</p>`:'<div class="studio-picker-preview-empty"><span aria-hidden="true">V</span><h3>A closer look.</h3><p>Use Preview on a thumbnail to inspect it before adding.</p></div>';
    preview.querySelector('img')?.addEventListener('error',event=>{event.currentTarget.hidden=true;const message=document.createElement('span');message.className='studio-picker-no-image';message.textContent='Preview unavailable';event.currentTarget.after(message);},{once:true});
  }

  function renderGrid() {
    const grid=dialog.querySelector('[data-picker-grid]'),previous=document.activeElement?.dataset.pickerFile,files=state.files;
    grid.innerHTML=files.map(file=>{
      const index=selectedIndex(file.id),already=state.excluded.has(file.id),label=already?'Already added':index>=0?`Reference ${index+1}`:'Select';
      return `<article class="studio-picker-tile ${index>=0?'is-selected':''} ${already?'is-existing':''}"><button type="button" class="studio-picker-image" data-picker-file="${escapeHTML(file.id)}" aria-pressed="${index>=0}" aria-disabled="${already}" aria-label="${escapeHTML(already?'Already added: '+file.name:(index>=0?'Remove reference '+(index+1)+': ':'Select ')+file.name)}">${file.thumbnailLink?`<img src="${escapeHTML(file.thumbnailLink)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>`:'<span class="studio-picker-no-image">No preview</span>'}<span class="studio-picker-tile-order">${index>=0?index+1:already?'✓':'+'}</span></button><div class="studio-picker-tile-caption"><span title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</span><small>${escapeHTML(label)}</small><button type="button" data-picker-preview="${escapeHTML(file.id)}" aria-label="Preview ${escapeHTML(file.name)}">Preview</button></div></article>`;
    }).join('');
    const empty=dialog.querySelector('[data-picker-empty]');empty.hidden=Boolean(files.length)||state.loading||Boolean(state.error);
    empty.innerHTML=`<h3>${state.folder==='recent'?'No recent references.':'No images found.'}</h3><p>${state.folder==='recent'?'Images you add in this session appear here. Locking clears this list.':state.search?'Try a different name or another folder.':'This folder has no available image references.'}</p>`;
    grid.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;const message=document.createElement('span');message.className='studio-picker-no-image';message.textContent='No preview';img.after(message);},{once:true}));
    if(previous)Array.from(grid.querySelectorAll('[data-picker-file]')).find(button=>button.dataset.pickerFile===previous)?.focus({preventScroll:true});
  }

  function renderSelection() {
    const tray=dialog.querySelector('[data-picker-selected]');
    tray.innerHTML=state.selected.map((file,index)=>`<li data-picker-selection="${escapeHTML(file.id)}"><span class="studio-picker-selection-index">${index+1}</span>${file.thumbnailLink?`<img src="${escapeHTML(file.thumbnailLink)}" alt=""/>`:''}<span class="studio-picker-selection-name"><strong>Subject reference ${index+1}</strong><span>${escapeHTML(file.name)}</span></span><div class="studio-picker-selection-tools"><button type="button" data-picker-up="${index}" aria-label="Move reference ${index+1} earlier" ${index===0?'disabled':''}>↑</button><button type="button" data-picker-down="${index}" aria-label="Move reference ${index+1} later" ${index===state.selected.length-1?'disabled':''}>↓</button><button type="button" data-picker-remove="${escapeHTML(file.id)}" aria-label="Remove reference ${index+1}">×</button></div></li>`).join('');
    const count=state.selected.length;
    dialog.querySelector('[data-picker-count]').textContent=`${count} / ${state.limit} selected`;
    dialog.querySelector('[data-picker-selected-heading]').hidden=!count;
    dialog.querySelector('[data-picker-review]').hidden=!count;
    const confirm=dialog.querySelector('[data-picker-confirm]');confirm.disabled=!count;confirm.textContent=count?`Add ${count} reference${count===1?'':'s'}`:'Add references';
  }

  async function load(append=false) {
    if(!dialog)return;
    clearTimeout(searchTimer);request?.abort();const controller=new AbortController();request=controller;const token=++epoch;
    state.loading=true;state.error='';if(!append){state.files=[];state.cursor='';}
    dialog.querySelector('[data-picker-loading]').hidden=false;dialog.querySelector('[data-picker-error]').hidden=true;
    dialog.querySelector('[data-picker-more]').hidden=true;renderGrid();
    dialog.querySelector('[data-picker-breadcrumb]').textContent='Drive / '+({all:'All images',private:'Private',references:'References',recent:'Recent'}[state.folder]);
    dialog.querySelectorAll('[data-picker-folder]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.pickerFolder===state.folder)));
    try {
      const result=state.folder==='recent'?{files:recents.filter(file=>file.name.toLowerCase().includes(state.search.toLowerCase())),cursor:''}:await drive.listReferences({folder:state.folder,search:state.search,cursor:append?state.cursor:'',signal:controller.signal});
      if(token!==epoch||!dialog||controller.signal.aborted)return;
      const files=(result.files || []).filter(file=>file&&typeof file.id==='string'&&file.id&&(!file.mimeType||file.mimeType.startsWith('image/'))).map(metadata);
      state.files=[...new Map([...(append?state.files:[]),...files].map(file=>[file.id,file])).values()];
      state.cursor=result.cursor || '';state.loading=false;renderGrid();
      dialog.querySelector('[data-picker-loading]').hidden=true;dialog.querySelector('[data-picker-more]').hidden=!state.cursor;
      status(`${state.files.length} image${state.files.length===1?'':'s'} shown. Select in the order you want the model to receive them.`);
    } catch(error) {
      if(token!==epoch||!dialog||controller.signal.aborted)return;
      state.loading=false;state.error=error?.message || 'Could not open references.';
      dialog.querySelector('[data-picker-loading]').hidden=true;dialog.querySelector('[data-picker-error]').hidden=false;
      dialog.querySelector('[data-picker-error-text]').textContent=state.error;
      renderGrid();status('References could not load. Your selection is preserved.');
    }
  }

  async function choose({limit,selectedIds=[]}={}) {
    close();
    if(!Number.isSafeInteger(limit)||limit<1)return [];
    state={limit,excluded:new Set(selectedIds),selected:[],files:[],cursor:'',folder:'all',search:'',loading:false,error:'',preview:null};
    const id=`studioReferencePicker${++nextPicker}`;
    dialog=document.createElement('dialog');dialog.className='studio-dialog studio-reference-picker';dialog.setAttribute('aria-labelledby',id+'Heading');
    dialog.innerHTML=`<header class="studio-picker-header"><div><span class="studio-eyebrow">Private references</span><h2 id="${id}Heading">Choose your references.</h2></div><div class="studio-picker-privacy"><button type="button" class="studio-dialog-exit" data-picker-quick-exit>Quick exit</button><button type="button" class="studio-picker-close" data-picker-close aria-label="Close reference picker">Close <span aria-hidden="true">×</span></button></div></header><section class="studio-picker-browser"><nav class="studio-picker-breadcrumb" data-picker-breadcrumb aria-label="Current folder">Drive / All images</nav><div class="studio-picker-filters" role="group" aria-label="Reference folders">${[['all','All'],['private','Private'],['references','References'],['recent','Recent']].map(([value,label])=>`<button type="button" data-picker-folder="${value}" aria-pressed="${value==='all'}">${label}</button>`).join('')}</div><label class="studio-picker-search"><span class="sr-only">Search reference names</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input type="search" data-picker-search placeholder="Search image names" autocomplete="off"/></label><div class="studio-picker-content"><section class="studio-picker-results" aria-label="Available reference images"><p class="studio-picker-loading" data-picker-loading role="status">Opening your references…</p><div class="studio-picker-error" data-picker-error hidden><h3>References couldn’t load.</h3><p data-picker-error-text></p><button type="button" data-picker-retry>Try again</button></div><div class="studio-picker-empty" data-picker-empty hidden></div><div class="studio-picker-grid" data-picker-grid></div><button type="button" class="studio-picker-more" data-picker-more hidden>Load more images</button></section><aside class="studio-picker-preview" data-picker-preview-panel aria-label="Reference preview" aria-live="polite"></aside></div><section class="studio-picker-selection"><h3 data-picker-selected-heading hidden>Selected · model order</h3><ol data-picker-selected></ol></section></section><footer class="studio-picker-footer"><div><span class="studio-picker-count-row"><strong data-picker-count>0 / ${limit} selected</strong><button type="button" data-picker-review hidden>Review order</button></span><span data-picker-status role="status">Select images in model order.</span></div><button type="button" class="studio-picker-confirm" data-picker-confirm disabled>Add references</button></footer>`;
    document.body.append(dialog);renderPreview(null);renderSelection();
    const choice=new Promise(resolve=>{resolveChoice=resolve;});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
    dialog.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button||button.disabled)return;
      const selectionHadFocus=Boolean(button.closest('[data-picker-selection]'));
      if(button.hasAttribute('data-picker-close'))return close();
      if(button.hasAttribute('data-picker-quick-exit')){clear();window.dispatchEvent(new CustomEvent('velum:quick-exit'));return;}
      if(button.hasAttribute('data-picker-folder')){state.folder=button.dataset.pickerFolder;return void load();}
      if(button.hasAttribute('data-picker-retry'))return void load();
      if(button.hasAttribute('data-picker-more'))return void load(true);
      if(button.hasAttribute('data-picker-review')){dialog.querySelector('[data-picker-selected-heading]').scrollIntoView({block:'start',behavior:'instant'});dialog.querySelector('[data-picker-selected] button:not(:disabled)')?.focus({preventScroll:true});return;}
      if(button.hasAttribute('data-picker-confirm')){
        const result=state.selected.map(file=>({...file}));recents=[...new Map([...result,...recents].map(file=>[file.id,file])).values()].slice(0,36);return close(result);
      }
      if(button.hasAttribute('data-picker-preview')){renderPreview(state.files.find(file=>file.id===button.dataset.pickerPreview));dialog.querySelector('[data-picker-preview-panel]').scrollIntoView({block:'start',behavior:'instant'});return;}
      if(button.hasAttribute('data-picker-file')){
        const file=state.files.find(file=>file.id===button.dataset.pickerFile);if(!file)return;
        renderPreview(file);if(state.excluded.has(file.id)){status('This image is already in your composer.');return;}
        const index=selectedIndex(file.id);
        if(index>=0)state.selected.splice(index,1);else if(state.selected.length>=state.limit){status(`All ${state.limit} available slots are filled. Remove a selection to choose another image.`);return;}else state.selected.push(file);
      }else if(button.hasAttribute('data-picker-remove'))state.selected.splice(selectedIndex(button.dataset.pickerRemove),1);
      else if(button.hasAttribute('data-picker-up')||button.hasAttribute('data-picker-down')){
        const index=Number(button.dataset.pickerUp??button.dataset.pickerDown),next=index+(button.hasAttribute('data-picker-up')?-1:1);
        if(next>=0&&next<state.selected.length)[state.selected[index],state.selected[next]]=[state.selected[next],state.selected[index]];
      }else return;
      renderGrid();renderSelection();status(`${state.selected.length} of ${state.limit} selected. Order matches the model inputs.`);
      if(selectionHadFocus)(dialog.querySelector('[data-picker-selected] button:not(:disabled)')||dialog.querySelector('[data-picker-search]')).focus({preventScroll:true});
    });
    dialog.querySelector('[data-picker-search]').addEventListener('input',event=>{state.search=event.target.value.trim();clearTimeout(searchTimer);searchTimer=setTimeout(()=>load(),200);});
    dialog.showModal();void load();return choice;
  }
  return {choose,clear};
}
