// Owner-only Auto Edit batches, progress, and verified result review.
const localModule=relative=>{const url=new URL(relative,import.meta.url);url.search=new URL(import.meta.url).search;return import(url.href);};
const {DEFAULT_VISION1_INSTRUCTION,AUTO_EDIT_MODELS,AUTO_EDIT_STAGES,REVIEW_STAGING_ID,isAutoId,isDriveId,isHash}=await localModule('./auto-edit-shared.mjs');
const {deviceApproved,workerOnline,workerHasModel}=await localModule('./studio-contract.mjs');
const {formatDuration}=await localModule('./studio-progress.mjs');
const {learningAdmission}=await localModule('./auto-edit-learning-contract.mjs');
const {mountAutoLearning}=await localModule('./studio-auto-learning.mjs');
const OWNER='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',FIRST_ITEM='item-001',REVIEW_PAGE=12;
const TERMINAL=new Set(['completed','completed-with-failures','stopped']);
const LABELS={source:'Original · verified download',vision1:'Vision 1 · describe',prompt:'Compose instructions',edit:'Image edit · Qwen Turbo',vision2:'Vision 2 · compare',delivery:'Drive · verify staging','review-ready':'Ready for your review'};
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=()=>crypto.randomUUID();
const snapshotData=s=>s.exists()?s.data():null;
const itemIdOf=value=>typeof value==='string'&&/^item-(?:00[1-9]|0[1-9][0-9]|100)$/.test(value);
const batchAdmission=a=>a?.enabled===true&&isAutoId(a.batchId)&&Number.isSafeInteger(a.expiresAt)&&((a.version===1&&a.mode==='pilot'&&isDriveId(a.sourceFileId))||(a.version===2&&a.mode==='batch'));
const activeBatch=a=>batchAdmission(a)&&a.expiresAt>Date.now();
const activeAdmission=a=>Boolean(activeBatch(a)||learningAdmission(a));
const reviewable=item=>item?.status==='review-ready'&&item.receipt?.verified===true&&isHash(item.receipt.sha256);
const versionLabel=v=>isAutoId(v)?'Version '+v.slice(0,8):'New version';
const titleCase=v=>String(v??'').replaceAll('-',' ').replace(/^./,c=>c.toUpperCase());
const reviewLabel=review=>review?.status==='accepted'?'Approved':review?.status==='rejected'?'Rejected':review?.status==='accepted-pending-move'?'Move pending':'Needs review';
const reviewFilter=review=>review?.status==='accepted'?'approved':review?.status==='rejected'?'rejected':'needs';
const batchDate=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const DECLINED_BATCH=new Set(['drive/invalid-auto-edit-batch','drive/auto-edit-pc-not-ready','drive/auto-edit-admission-in-use','drive/auto-edit-version-unavailable','drive/auto-edit-version-changed','drive/auto-edit-selection-changed','drive/auto-edit-request-conflict']);
function message(error){const code=error?.code;return code==='permission-denied'?'Auto Edit is not released for this account or the PC is not ready.':code==='drive/management-required'?'Approve Drive management, then retry the same saved review.':error?.message||'The action could not be confirmed. Refresh before retrying.';}
function renderShell(root){
 root.innerHTML=`<header class="ae-intro" data-ae="intro">
   <div><h2>Auto Edit</h2><p data-ae="readiness" role="status">Checking your PC…</p></div>
   <nav class="ae-tabs" aria-label="Auto Edit workspace"><button type="button" data-ae-section="new" aria-pressed="true">New batch</button><button type="button" data-ae-section="runs" aria-pressed="false">Runs</button></nav>
  </header>
  <div class="ae-compose" data-ae="composer">
   <form class="ae-card ae-setup">
    <div class="ae-heading"><h3>Editing instructions</h3><span data-ae="version" class="ae-version">New version</span></div>
    <label class="studio-label"><span class="sr-only">Editing instructions</span><textarea class="studio-input" name="instructions" rows="4" maxlength="3998" required placeholder="Describe an ordinary change to the image…"></textarea></label>
    <div class="ae-source"><div><strong>Private collection</strong><p>Velum selects unused originals for this version.</p></div><label class="studio-label">Images<input class="studio-input" type="number" value="1" min="1" max="100" required name="count" inputmode="numeric"/></label></div>
    <details class="ae-guidance"><summary>Vision 1 instruction</summary><label class="studio-label">What Vision 1 should describe<textarea class="studio-input" name="guidance" rows="5" maxlength="4000">${h(DEFAULT_VISION1_INSTRUCTION)}</textarea></label><div class="ae-actions"><button type="button" data-ae-action="reset-vision">Reset to default</button></div><p class="studio-hint">Leave blank to skip the added preservation description.</p></details>
    <label class="studio-consent"><input type="checkbox" name="consent" required/><span>I authorize ordinary, lawful edits to the eligible originals in this batch and confirm the required consent.</span></label>
    <div class="ae-submit"><button type="submit" class="studio-generate" data-ae="start" disabled>Start batch</button><p class="studio-hint">Qwen Turbo · One image at a time · 48 hours</p></div>
    <div class="ae-actions" data-ae="submit-actions"></div>
   </form>
   <details class="ae-configurations" data-ae="configuration-panel"><summary>Versions and learning</summary><section class="ae-card ae-learning" data-ae="learning" aria-label="Learning and configurations"></section></details>
  </div>
  <section class="ae-card ae-results" data-ae="batch-panel" aria-label="Auto Edit runs and results" hidden>
   <div class="ae-heading ae-batch-toolbar"><label class="studio-label" for="aeBatch">Batch<select class="studio-input" id="aeBatch"><option value="">No batches yet</option></select></label><button type="button" data-ae-action="refresh">Refresh</button></div>
   <div data-ae="run">
    <div data-ae="progress"></div><div class="ae-actions ae-run-actions" data-ae="controls"></div>
    <details class="ae-run-items" data-ae="item-details" hidden><summary>Items and checkpoints</summary><label class="studio-label" for="aeItem">Item<select class="studio-input" id="aeItem"></select></label><div data-ae="item-info"></div></details>
   </div>
   <div class="ae-gallery" data-ae="gallery" hidden>
    <div class="ae-tabs ae-filters" aria-label="Review status"><button type="button" data-ae-filter="needs">Needs review</button><button type="button" data-ae-filter="approved">Approved</button><button type="button" data-ae-filter="rejected">Rejected</button></div>
    <div class="ae-gallery-grid" data-ae="tiles"></div><button type="button" data-ae-action="more-results" hidden>Show more results</button>
   </div>
  </section>
  <dialog class="ae-review" data-ae="review" aria-labelledby="aeReviewTitle">
    <header class="ae-review-header"><div><h3 id="aeReviewTitle">Review result</h3><p data-ae="review-state"></p></div><div class="ae-actions ae-review-nav"><button type="button" data-ae-action="previous" aria-label="Previous result">‹</button><button type="button" data-ae-action="next" aria-label="Next result">›</button><button type="button" data-ae-action="close-review">Close</button></div></header>
    <div class="ae-review-stage"><button type="button" class="ae-compare" data-ae="compare" hidden aria-pressed="false"><img data-ae="edited" alt="Edited result" draggable="false"/><img data-ae="before" alt="Original image" draggable="false" hidden/><span data-ae="compare-cue">Hold for original · tap to switch</span></button><div class="ae-review-placeholder"><p data-ae="comparison-status" role="status"></p><button type="button" data-ae-action="load-comparison">Load comparison</button></div></div>
    <footer class="ae-review-footer"><details class="ae-feedback" data-ae="feedback-panel"><summary>Feedback</summary><label class="studio-label"><span class="sr-only">Feedback (optional)</span><textarea class="studio-input" data-ae="feedback" rows="2" maxlength="2000" placeholder="What worked or should be different?"></textarea></label></details><div class="ae-review-buttons"><button type="button" data-ae-action="reject" disabled>Reject</button><button type="button" data-ae-action="accept" disabled>Approve</button></div><div data-ae="review-actions" class="ae-actions"></div><p class="ae-message" data-ae="review-message" role="status"></p></footer>
  </dialog>
  <p class="ae-message" data-ae="message" role="status"></p>`;
}
export function mountAutoEdit(root,{sdk,db,drive,auth,context,openCreations=()=>{}}){
 const {doc,collection,query,orderBy,where,limit,startAfter,getDocs,getDocFromServer,onSnapshot,runTransaction}=sdk;
 const readDocs=sdk.getDocsFromServer||getDocs;
 renderShell(root);
 const $=key=>root.querySelector('[data-ae="'+key+'"]'),form=root.querySelector('form'),batchSelect=root.querySelector('#aeBatch'),itemSelect=root.querySelector('#aeItem'),dialog=$('review');
 const button=action=>root.querySelector('[data-ae-action="'+action+'"]');
 const workspace=()=>['users',OWNER,'velumStudio','workspace'],ref=(...parts)=>doc(db,...workspace(),...parts);
 let watching=false,generation=0,admission=null,admissionKnown=false,history=[],batchId='',batch=null,itemId=FIRST_ITEM,item=null,review=null,live=null,busy=false,draft=null,notice='',slots=new Map(),preview=null,previewJob='',mediaAbort=null,hold=null,pinned=false,peeking=false,skipClick=false,reviewKnown=false,destroyed=false;
 let section='new',surface='',filter='needs',shown=REVIEW_PAGE,selectedRevision=null,eligibleCount=null,lastResultSignature='',resultRequest=0,itemsLoading=false,itemsError='',admissionTimer=null,reviewTrigger=null,autoLoadKey='',reviewSequence=[],needsDrive=false;
 let items=new Map(),reviews=new Map(),thumbs=new Map(),thumbController=null,thumbsVisible=new Map(),thumbsPending=new Set(),thumbsTried=new Set(),thumbQueue=[],thumbActive=0;
 let learningController=null;
 const listeners=[];
 const listen=(target,event,fn,opts)=>{target.addEventListener(event,fn,opts);listeners.push(()=>target.removeEventListener(event,fn,opts));};
 function authorized(){const c=context();return !destroyed&&c.uid===OWNER&&auth.currentUser?.uid===OWNER&&!c.locked&&!c.destroyed&&c.visible;}
 function check(token){if(token!==generation||!authorized())throw new Error('Studio session changed. Reopen Auto Edit.');}
 function unwatch(key){const slot=slots.get(key);slots.delete(key);slot?.stop?.();}
 function watch(key,target,receive){
  if(slots.has(key))return;
  const token=generation,slot={stop:null};slots.set(key,slot);
  slot.stop=onSnapshot(target,{includeMetadataChanges:true},s=>{
   if(token!==generation||slots.get(key)!==slot||!authorized())return;
   // Never turn a cached snapshot into an actionable authorization.
   if(s.metadata.fromCache){if(key==='admission')admissionKnown=false;if(key==='review')reviewKnown=false;draw();return;}
   receive(snapshotData(s));draw();
  },e=>{
   if(token!==generation||slots.get(key)!==slot)return;
   if(key==='admission')admissionKnown=false;if(key==='review')reviewKnown=false;
   notice=message(e);draw();
  });
 }
 function releaseMedia(){
  mediaAbort?.abort();mediaAbort=null;clearTimeout(hold?.timer);if(preview){URL.revokeObjectURL(preview.edited);URL.revokeObjectURL(preview.original);}preview=null;previewJob='';pinned=false;peeking=false;hold=null;skipClick=false;
  $('edited').removeAttribute('src');$('before').removeAttribute('src');$('compare').hidden=true;
 }

 function releaseThumbs(){
  thumbController?.abort();thumbController=null;thumbsVisible.clear();thumbsPending.clear();thumbsTried.clear();thumbQueue=[];thumbActive=0;
  for(const url of thumbs.values())URL.revokeObjectURL(url);
  thumbs.clear();$('tiles').querySelectorAll('img').forEach(img=>{img.removeAttribute('src');img.hidden=true;});
 }
 function closeReview({restoreFocus=false}={}){
  if(dialog.open)dialog.close();
  releaseMedia();$('comparison-status').textContent='';$('feedback-panel').open=false;autoLoadKey='';reviewSequence=[];
  if(restoreFocus&&reviewTrigger?.isConnected)reviewTrigger.focus();
  else if(restoreFocus&&surface==='gallery')root.querySelector('[data-ae-filter][aria-pressed="true"]')?.focus();
  reviewTrigger=null;
 }
 function stop(){
  learningController?.clear();
  generation++;resultRequest++;watching=false;for(const key of [...slots.keys()])unwatch(key);clearTimeout(admissionTimer);admissionTimer=null;closeReview();releaseThumbs();admissionKnown=false;reviewKnown=false;busy=false;live=null;batch=null;item=null;review=null;history=[];admission=null;batchId='';itemId=FIRST_ITEM;draft=null;notice='';selectedRevision=null;eligibleCount=null;needsDrive=false;section='new';surface='';filter='needs';shown=REVIEW_PAGE;items.clear();reviews.clear();lastResultSignature='';itemsLoading=false;itemsError='';
  form.reset();for(const el of form.elements)el.disabled=false;$('feedback').value='';$('comparison-status').textContent='';$('message').textContent='';
  $('configuration-panel').open=false;$('item-details').open=false;form.querySelector('details').open=false;
  $('readiness').textContent='Reopen Auto Edit to check the PC.';$('review-state').textContent='';$('start').disabled=true;
  for(const key of ['progress','controls','review-actions','submit-actions','item-info','tiles']){const node=$(key);node.replaceChildren();delete node.dataset.signature;}
  for(const node of [batchSelect,itemSelect]){node.replaceChildren();delete node.dataset.signature;}
 }
 function selectBatch(next){
  if(!isAutoId(next)||next===batchId)return;
  ['batch','item','live','review'].forEach(unwatch);closeReview();releaseThumbs();resultRequest++;
  batchId=next;batch=null;itemId='';item=null;review=null;live=null;reviewKnown=false;items.clear();reviews.clear();lastResultSignature='';itemsLoading=false;itemsError='';shown=REVIEW_PAGE;
  watch('batch',ref('autoBatches',next),v=>{
   batch=v;
   const active=v?.execution?.activeItemId;
   if(!itemId||(itemIdOf(active)&&!dialog.open&&section==='runs'&&!$('item-details').open))selectItem(itemIdOf(active)?active:FIRST_ITEM);
   syncTelemetry();syncResults();
  });
 }
 function selectItem(next){
  if(!itemIdOf(next)||next===itemId)return;
  ['item','live','review'].forEach(unwatch);releaseMedia();autoLoadKey='';
  itemId=next;item=items.get(next)||null;review=reviews.get(next)||null;reviewKnown=false;live=null;
  $('feedback').value='';$('feedback-panel').open=false;$('comparison-status').textContent='';
  watch('item',ref('autoBatches',batchId,'items',next),v=>{
   const changed=item?.receipt?.sha256!==v?.receipt?.sha256;item=v;if(v)items.set(next,v);
   if(changed)releaseMedia();syncTelemetry();
  });
  watch('review',ref('autoReviews',batchId+'-'+next),v=>{
   reviewKnown=true;review=v;
   if(v)reviews.set(next,v);else reviews.delete(next);
  });
 }
 function syncTelemetry(){
  if(surface==='run'&&section==='runs'&&activeBatch(admission)&&batch?.execution?.status==='running'&&item?.inFlight&&batch.execution.activeItemId===itemId){
   watch('live',ref('autoBatches',batchId,'live','pc'),v=>{live=v;});
  }else{unwatch('live');live=null;}
 }
 function syncResults(){
  if(!batch||!(surface==='gallery'||section==='runs'))return;
  const counts=batch.execution?.counts;
  const signature=[batchId,counts?.ready,counts?.failed,counts?.cancelled].join(':');
  if(signature===lastResultSignature)return;
  lastResultSignature=signature;void refreshResults();
 }
 async function refreshResults(){
  if(!batchId)return;
  const token=generation,selected=batchId,request=++resultRequest;itemsLoading=true;itemsError='';
  try{
   const result=await readDocs(query(collection(db,...workspace(),'autoBatches',selected,'items'),orderBy('ordinal'),limit(100)));check(token);
   const nextItems=new Map(result.docs.filter(s=>itemIdOf(s.id)).map(s=>[s.id,s.data()]));
   const reviewed=new Map();
   let cursor=null;
   do{
    const constraints=[where('batchId','==',selected),limit(30)];
    if(cursor)constraints.push(startAfter(cursor));
    const page=await readDocs(query(collection(db,...workspace(),'autoReviews'),...constraints));check(token);
    if(selected!==batchId||request!==resultRequest)return;
    for(const doc of page.docs){const value=doc.data();if(itemIdOf(value.itemId))reviewed.set(value.itemId,value);}
    cursor=page.docs.length===30?page.docs.at(-1):null;
   }while(cursor&&reviewed.size<100);
   if(selected!==batchId||request!==resultRequest)return;
   items=nextItems;reviews=reviewed;
   if(item)items.set(itemId,item);
   if(reviewKnown){if(review)reviews.set(itemId,review);else reviews.delete(itemId);}
  }catch(e){if(token===generation&&request===resultRequest&&selected===batchId)itemsError=message(e);}
  finally{if(token===generation&&request===resultRequest&&selected===batchId){itemsLoading=false;draw();}}
 }
 async function refreshHistory(){
  const token=generation;
  const result=await getDocs(query(collection(db,...workspace(),'autoBatches'),orderBy('createdAt','desc'),limit(20)));check(token);
  history=result.docs.map(s=>({id:s.id,...s.data()}));
  if(!batchId){const next=(activeBatch(admission)?admission.batchId:null)||history[0]?.id;if(next)selectBatch(next);}
  draw();
 }
 function startWatching(){
  if(watching)return;watching=true;
  watch('admission',ref('autoEditControl','admission'),v=>{
   admission=v;admissionKnown=true;
   clearTimeout(admissionTimer);admissionTimer=null;
   if(activeBatch(v)){
    if(!batchId)selectBatch(v.batchId);
    admissionTimer=setTimeout(()=>{admissionTimer=null;syncTelemetry();draw();},Math.max(0,v.expiresAt-Date.now()+25));
   }
  });
  watch('config',ref('autoEditControl','currentConfig'),v=>{
   if(!isAutoId(v?.revisionId)||selectedRevision||form.elements.instructions.value||draft)return;
   const token=generation;
   void getDocFromServer(ref('autoConfigs',v.revisionId)).then(snapshot=>{
    const record=snapshotData(snapshot);
    if(token!==generation||!authorized()||form.elements.instructions.value||draft||selectedRevision||record?.config?.revisionId!==v.revisionId)return;
    loadIntoComposer({...record.config,seedVersionId:record.seedVersionId??record.config.seedVersionId},false);
   }).catch(()=>{});
  });
  void refreshHistory().catch(e=>{if(watching){notice=message(e);draw();}});
 }
 function batchReady(worker){return worker?.autoEditReadyAt===worker?.updatedAt&&worker?.autoEditBatchReadyAt===worker?.updatedAt&&worker?.autoEditBatchVersion===2;}
 function readiness(){
  const c=context();
  if(!c.connected||!navigator.onLine)return 'Reconnect to confirm the private PC state.';
  if(!admissionKnown)return 'Checking whether Auto Edit is released…';
  if(activeBatch(admission))return 'Batch window open until '+new Date(admission.expiresAt).toLocaleString()+'.';
  if(learningAdmission(admission))return 'Local learning admission is open until '+new Date(admission.expiresAt).toLocaleTimeString()+'.';
  if(!deviceApproved(c.binding))return 'Approve your PC in Studio first.';
  if(!workerOnline(c.worker))return 'Waiting for a fresh PC heartbeat.';
  if(!batchReady(c.worker))return 'Waiting for the batch-ready PC worker.';
  if(!workerHasModel(c.worker,AUTO_EDIT_MODELS.image))return 'Qwen Turbo is not verified on this PC.';
  if(c.busy||c.worker.state!=='idle')return 'Manual Studio or Auto Edit is currently busy.';
  return 'PC ready for Auto Edit.';
 }
 function canStart(){
  const c=context(),count=form.elements.count.valueAsNumber;
  return authorized()&&admissionKnown&&(!activeAdmission(admission)||admission.batchId===draft?.batchId)&&navigator.onLine&&c.connected&&deviceApproved(c.binding)&&workerOnline(c.worker)&&batchReady(c.worker)&&workerHasModel(c.worker,AUTO_EDIT_MODELS.image)&&(Boolean(draft)||c.worker.state==='idle'&&!c.busy)&&!busy&&!learningController?.busy&&Number.isInteger(count)&&count>=1&&count<=100&&form.elements.instructions.value.trim()&&form.elements.consent.checked&&eligibleCount===null;
 }
 function windowState(record=batch,selected=batchId){
  if(!admissionKnown||!record||TERMINAL.has(record.execution?.status))return '';
  if(batchAdmission(admission)&&admission.batchId===selected)return activeBatch(admission)?'':'window-expired';
  if(record.schemaVersion!==2)return '';
  const expiresAt=record.admissionExpiresAt??record.initialExpiresAt;
  return Number.isSafeInteger(expiresAt)&&expiresAt<=Date.now()?'window-expired':'window-closed';
 }
 function commandButtons(){
  if(!batch)return '';
  const st=batch.execution?.status||'queued',pending=batch.execution?.commandRevision!==batch.command?.revision,disabled=busy||pending?'disabled':'',ifBusy=busy?'disabled':'';
  if(windowState()==='window-expired'){
   const renew=batch.schemaVersion===2&&!activeAdmission(admission)?'<button type="button" data-ae-action="renew" '+ifBusy+'>Renew this batch</button>':'';
   const close=batchAdmission(admission)&&admission.batchId===batchId?'<button type="button" data-ae-action="close-admission" '+ifBusy+'>Close expired window</button>':'';
   return renew+close;
  }
  if(!activeBatch(admission)||admission.batchId!==batchId)return '';
  if(TERMINAL.has(st))return (st==='completed-with-failures'&&item?.status==='failed'?'<button type="button" data-ae-action="retry" '+disabled+'>Retry verified checkpoint</button>':'')+'<button type="button" data-ae-action="close-admission" '+ifBusy+'>Close batch window</button>';
  return (['queued','running'].includes(st)?'<button type="button" data-ae-action="pause" '+disabled+'>Pause after stage</button>':'')+
   (st==='paused'?'<button type="button" data-ae-action="resume" '+disabled+'>Resume</button>':'')+
   (st==='blocked'?'<button type="button" data-ae-action="resume" '+disabled+'>Resume from checkpoint</button>':'')+
   '<button type="button" data-ae-action="stop" '+(busy||batch.command?.kind==='stop'?'disabled':'')+'>Stop batch</button>';
 }
 function progressMarkup(){
  if(!batch)return '<div class="ae-empty"><h3>No batch selected</h3><p>Start a batch or choose a previous run.</p></div>';
  const admissionStatus=windowState(),status=admissionStatus||batch.execution?.status||'queued',stage=item?.stage||'source';
  const c=batch.execution?.counts;
  const total=c?.total??batch.plan?.items?.length??0,completed=(c?.ready??0)+(c?.failed??0)+(c?.cancelled??0);
  const active=batch.execution?.activeItemId,activeItem=active===itemId?item:items.get(active);
  const pending=!admissionStatus&&!TERMINAL.has(status)&&batch.execution?.commandRevision!==batch.command?.revision&&Boolean(batch.execution);
  const summary=admissionStatus==='window-expired'?'Renew this batch to continue from its recorded checkpoint.':admissionStatus==='window-closed'?'This batch has no active window.':pending?'Waiting for the PC to acknowledge '+batch.command?.kind+'.':batch.execution?.reason?titleCase(batch.execution.reason):activeItem?.stage?LABELS[activeItem.stage]:status==='queued'?'Waiting for PC claim':LABELS[stage]||'';
  return '<div class="ae-progress-head"><strong>'+h(titleCase(status))+'</strong><span>'+h(versionLabel(batch.plan?.seedVersionId??batch.plan?.config?.revisionId))+'</span></div>'+
   '<p class="studio-hint">'+h(summary)+'</p>'+
   (total?'<progress max="'+h(total)+'" value="'+h(completed)+'" aria-label="Items finished"></progress><div class="ae-run-counts"><strong>'+h(c?.ready??0)+' / '+h(total)+' ready</strong>'+((c?.failed??0)?'<span>'+h(c.failed)+' failed</span>':'')+((c?.cancelled??0)?'<span>'+h(c.cancelled)+' cancelled</span>':'')+'</div>':'');
 }
 function itemMarkup(){
  if(!item)return '<p class="studio-hint">The worker has not started this item.</p>';
  const status=item.status,stage=item.stage||'source',index=AUTO_EDIT_STAGES.indexOf(stage),p=live?.progress,valid=live?.publicationRevision===batch.execution?.publicationRevision&&live?.itemId===itemId&&p?.stage===item.inFlight?.stage;
  const resources=valid?p.resources:null,age=resources&&Number.isFinite(resources.sampledAt)?Date.now()-resources.sampledAt:Infinity;
  const fresh=resources&&age>=0&&age<75000&&context().connected;
  const number=(v,suffix='')=>Number.isFinite(v)?Math.round(v)+suffix:'—';
  const mem=(used,total,unit)=>Number.isFinite(used)&&Number.isFinite(total)&&total>0?(used/unit).toFixed(1)+' / '+(total/unit).toFixed(1)+' GB':'—';
  const metrics=[['CPU',number(resources?.cpuPercent,'%')],['RAM',mem(resources?.ramUsedBytes,resources?.ramTotalBytes,1073741824)],['GPU',number(resources?.gpuUtilPercent,'%')],['VRAM',mem(resources?.vramUsedMiB,resources?.vramTotalMiB,1024)],['GPU temp',number(resources?.gpuTempC,'°C')]];
  const failure=item?.failure;
  const config=batch.plan?.config||{};
  return '<div class="ae-progress-head"><strong>'+h(titleCase(status))+'</strong><span>'+h(LABELS[stage]||'Waiting')+'</span></div>'+
   '<ol class="ae-stages">'+AUTO_EDIT_STAGES.map((s,i)=>'<li data-state="'+(i<index||stage==='review-ready'?'done':i===index&&status==='running'?'current':'pending')+'"><span>'+h(LABELS[s])+'</span><strong>'+h(Number.isFinite(item?.durations?.[s])?formatDuration(item.durations[s]):i===index&&item?.inFlight&&valid?formatDuration(Math.max(0,(fresh?Date.now():p.updatedAt)-item.inFlight.startedAt)):'—')+'</strong></li>').join('')+'</ol>'+
   (status==='running'?'<div class="ae-resource"><span>'+h(fresh?'PC now':resources?'Last reported PC':'Awaiting resource report')+'</span><dl>'+metrics.map(([k,v])=>'<div><dt>'+h(k)+'</dt><dd>'+h(v)+'</dd></div>').join('')+'</dl></div>':'')+
   (failure?'<div class="ae-failure"><strong>'+h(failure.stage)+'</strong><p>'+h(failure.code)+'</p><small>'+h(failure.uncertain?'The previous attempt may have started. The worker must reconcile before retrying.':'The worker stopped before completion.')+'</small></div>':'')+
   '<details class="ae-lineage"><summary>Prompt and provenance</summary><dl><dt>Instruction seed</dt><dd>'+h(config.instructions||'—')+'</dd><dt>Vision 1 instruction</dt><dd>'+h(config.visionGuidance||'(No additional observation requested)')+'</dd><dt>Vision 1 addition</dt><dd>'+h(item.vision1?.addition||'—')+'</dd><dt>Effective prompt</dt><dd>'+h(item.prompt||'—')+'</dd><dt>Model / numeric seed</dt><dd>'+h(config.model||'—')+' · '+h(item.seed??'—')+'</dd><dt>Vision 2</dt><dd>'+h(item.vision2?.summary||'—')+'</dd>'+(item.vision2?.observations?.length?'<dt>Observations</dt><dd><ul>'+item.vision2.observations.map(v=>'<li>'+h(v)+'</li>').join('')+'</ul></dd>':'')+'<dt>Limitations</dt><dd>'+h([item.vision1?.limitations,item.vision2?.limitations].filter(Boolean).join('\n')||'—')+'</dd></dl></details>';
 }
 function updateMarkup(el,markup){
  if(el.dataset.signature===markup)return;
  const expanded=[...el.querySelectorAll('details')].map(x=>x.open);
  el.dataset.signature=markup;el.innerHTML=markup;
  el.querySelectorAll('details').forEach((x,i)=>x.open=Boolean(expanded[i]));
 }

 function thumbIdentity(entry){
  const decision=reviews.get(entry.itemId),receipt=entry.receipt;
  const folderId=decision?.status==='accepted'?decision.parentId:REVIEW_STAGING_ID;
  return {fileId:receipt.fileId,folderId,sha256:receipt.sha256};
 }
 function displayedResults(){
  return [...items.values()].filter(entry=>reviewable(entry)&&reviewFilter(reviews.get(entry.itemId))===filter).sort((a,b)=>a.ordinal-b.ordinal);
 }

 function updateThumbnails(entries){
  const requests=entries.map(entry=>({id:entry.itemId,...thumbIdentity(entry)}));
  const key=value=>[value.fileId,value.folderId,value.sha256].join(':');
  thumbsVisible=new Map(requests.map(value=>[value.id,key(value)]));
  const visibleKeys=new Set(thumbsVisible.values());
  for(const [id,url] of thumbs){
   if(!visibleKeys.has(id)){URL.revokeObjectURL(url);thumbs.delete(id);}
  }
  for(const id of thumbsTried)if(!visibleKeys.has(id))thumbsTried.delete(id);
  if(typeof drive.readAutoEditThumbnail==='function'){
   for(const value of requests){
    const cacheKey=key(value);
    if(!thumbsTried.has(cacheKey)&&!thumbsPending.has(cacheKey)){
     thumbsPending.add(cacheKey);thumbQueue.push({cacheKey,value});
    }
   }
   if(!thumbController)thumbController=new AbortController();
   drainThumbnails(thumbController);
  }
  paintThumbnails();
 }
 function drainThumbnails(controller){
  while(thumbActive<3&&thumbQueue.length){
   const {cacheKey,value}=thumbQueue.shift();
   if(thumbsVisible.get(value.id)!==cacheKey){thumbsPending.delete(cacheKey);continue;}
   thumbActive++;
   void (async()=>{
    try{
     const blob=await drive.readAutoEditThumbnail(value,{signal:controller.signal});
     if(controller.signal.aborted||!authorized()||thumbsVisible.get(value.id)!==cacheKey)return;
     if(blob instanceof Blob)thumbs.set(cacheKey,URL.createObjectURL(blob));
     paintThumbnails();
    }catch{/* A verified comparison is still available from the tile. */}
    finally{
     if(!controller.signal.aborted){
      thumbActive--;thumbsPending.delete(cacheKey);
      if(thumbsVisible.get(value.id)===cacheKey)thumbsTried.add(cacheKey);
      drainThumbnails(controller);
     }
    }
   })();
  }
 }
 function paintThumbnails(){
  $('tiles').querySelectorAll('[data-ae-thumb]').forEach(img=>{
   const url=thumbs.get(thumbsVisible.get(img.dataset.aeThumb));
   if(url&&img.getAttribute('src')!==url){img.src=url;img.hidden=false;}
   else if(!url&&img.hasAttribute('src')){img.removeAttribute('src');img.hidden=true;}
  });
 }
 function filterResults(){
  const matches=displayedResults(), visible=matches.slice(0,shown);
  root.querySelectorAll('[data-ae-filter]').forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.aeFilter===filter)));
  const placeholder=itemsError?'Could not load results. Use Refresh to try again.':itemsLoading?'Loading results…':!batchId?'Start a batch to see its results here.':filter==='needs'?'No results awaiting review.':filter==='approved'?'No approved results in this batch.':'No rejected results in this batch.';
  updateMarkup($('tiles'),visible.length?visible.map(entry=>{
   const d=reviews.get(entry.itemId),label=reviewLabel(d),key=h(entry.itemId);
   return '<button type="button" class="ae-tile" data-ae-item="'+key+'" aria-label="Review image '+h(entry.ordinal)+', '+h(label)+'"><span class="ae-tile-image"><img data-ae-thumb="'+key+'" alt="" hidden/><span>Image '+h(entry.ordinal)+'</span></span><span class="ae-tile-caption"><strong>Image '+h(entry.ordinal)+'</strong><small>'+h(label)+'</small></span></button>';
  }).join(''):'<div class="ae-empty"><p>'+h(placeholder)+'</p></div>');
  button('more-results').hidden=matches.length<=shown;
  updateThumbnails(visible);
 }
 function reviewKey(entry=item){return [batchId,entry?.itemId,entry?.receipt?.sha256].join(':');}
 function reviewPeers(){
  const matches=surface==='gallery'?displayedResults():[...items.values()].filter(reviewable).sort((a,b)=>a.ordinal-b.ordinal);
  return matches.map(entry=>entry.itemId);
 }
 function adjacentReview(direction){
  const index=reviewSequence.indexOf(itemId);
  return index<0?null:reviewSequence[index+direction];
 }
 function drawReview(){
  if(!dialog.open)return;
  const ready=reviewable(item),verified=Boolean(ready&&preview&&previewJob===reviewKey());
  $('review-state').textContent=ready?'Image '+item.ordinal+' · '+(reviewKnown?reviewLabel(review):'Checking decision…'):'Checking this result…';
  $('compare').hidden=!verified;
  $('feedback').disabled=busy||Boolean(review)||!reviewKnown;
  if(review&&$('feedback').value!==review.feedback)$('feedback').value=review.feedback||'';
  for(const action of ['accept','reject']){
   button(action).hidden=Boolean(review);
   button(action).disabled=busy||!verified||!reviewKnown||Boolean(review);
  }
  button('load-comparison').hidden=verified||Boolean(mediaAbort);
  button('load-comparison').disabled=busy||!ready||!reviewKnown;
  button('previous').disabled=busy||!adjacentReview(-1);
  button('next').disabled=busy||!adjacentReview(1);
  const retry=review?.status==='accepted-pending-move';
  updateMarkup($('review-actions'),retry?'<button type="button" data-ae-action="move" '+(busy?'disabled':'')+'>Retry Drive move</button><button type="button" data-ae-action="connect" '+(busy?'disabled':'')+'>Connect Drive management</button>':review?.status==='accepted'&&isDriveId(review.fileId)?'<a target="_blank" rel="noopener noreferrer" href="https://drive.google.com/file/d/'+h(review.fileId)+'/view">Open approved image in Drive</a>':review?.status==='rejected'?'<span class="studio-hint">Kept in Review staging</span>':'');
  $('review-message').textContent=notice;
  if(ready&&reviewKnown&&!verified&&!busy&&!learningController?.busy&&autoLoadKey!==reviewKey()){
   autoLoadKey=reviewKey();queueMicrotask(()=>{if(dialog.open&&autoLoadKey===reviewKey())void runAction(loadComparison);});
  }
 }
 function draw(){
  if(!authorized())return;
  const nextSurface=context().surface==='gallery'?'gallery':'run';
  if(nextSurface!==surface){
   closeReview();releaseThumbs();surface=nextSurface;
  }
  const gallery=surface==='gallery',runs=gallery||section==='runs';
  root.dataset.surface=surface;$('intro').hidden=gallery;$('composer').hidden=runs;$('batch-panel').hidden=!runs;$('run').hidden=gallery;$('gallery').hidden=!gallery;
  root.querySelectorAll('[data-ae-section]').forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.aeSection===section)));
  $('readiness').textContent=readiness();
  const version=selectedRevision&&selectedRevision.instructions===form.elements.instructions.value?selectedRevision.seedVersionId??selectedRevision.revisionId:null;
  $('version').textContent=versionLabel(version);
  for(const key of ['instructions','guidance','count','consent'])form.elements[key].disabled=busy||Boolean(draft);
  $('start').disabled=!canStart();
  button('reset-vision').disabled=busy||Boolean(draft)||Boolean(learningController?.busy);
  $('start').textContent=busy&&draft?'Confirming batch…':draft?'Retry same request':'Start batch';
  const followup=draft&&!busy?'<button type="button" data-ae-action="refresh">Check pending request</button>':eligibleCount>0?'<button type="button" data-ae-action="use-available">Use '+h(eligibleCount)+' available</button>':'';
  updateMarkup($('submit-actions'),followup+(needsDrive&&!busy?'<button type="button" data-ae-action="connect-read">Connect Drive</button>':''));
  const records=new Map(history.map(v=>[v.id,v]));
  if(batchId&&batch)records.set(batchId,{id:batchId,...batch});
  if(batchId&&!records.has(batchId))records.set(batchId,{id:batchId,createdAt:null});
  const options='<option value="">'+(records.size?'Choose a batch':'No batches yet')+'</option>'+[...records.values()].map(v=>'<option value="'+h(v.id)+'">'+h(Number.isFinite(v.createdAt)?batchDate.format(v.createdAt)+' · '+titleCase(windowState(v,v.id)||v.execution?.status||'queued'):v.id.slice(0,8))+'</option>').join('');
  if(batchSelect.dataset.signature!==options){batchSelect.dataset.signature=options;batchSelect.innerHTML=options;}
  batchSelect.value=batchId;batchSelect.disabled=busy;
  const planned=batch?.plan?.items||[];
  const itemOptions=planned.filter(entry=>itemIdOf(entry.itemId)).map(entry=>{
   const stored=items.get(entry.itemId),cancelled=batch.execution?.cancelledItemIds?.includes(entry.itemId)||batch.execution?.status==='stopped'&&!reviewable(stored)&&stored?.status!=='failed';
   return '<option value="'+h(entry.itemId)+'">Image '+h(entry.ordinal)+' · '+h(titleCase(cancelled?'cancelled':stored?.status??'picked'))+'</option>';
  }).join('');
  if(itemSelect.dataset.signature!==itemOptions){itemSelect.dataset.signature=itemOptions;itemSelect.innerHTML=itemOptions;}
  itemSelect.value=itemId;itemSelect.disabled=busy;
  $('item-details').hidden=!planned.length;
  updateMarkup($('progress'),progressMarkup());updateMarkup($('item-info'),batch?itemMarkup():'');
  let controls=commandButtons();
  if(batch?.execution?.counts?.ready>0)controls+='<button type="button" data-ae-action="gallery">Review results</button>';
  if(activeBatch(admission)&&admission.batchId!==batchId)controls+='<button type="button" data-ae-action="current">Open active batch</button>';
  updateMarkup($('controls'),controls);
  if(gallery)filterResults();
  $('message').textContent=dialog.open||windowState()&&notice==='Command recorded. Waiting for the PC acknowledgement.'?'':notice;
  drawReview();syncTelemetry();syncResults();
  learningController?.sync();
 }
 async function runAction(action){
  if(busy||learningController?.busy||!authorized())return;
  const token=generation;busy=true;notice='';draw();
  try{await action(token);check(token);}catch(e){if(token===generation)notice=message(e);}
  finally{if(token===generation){busy=false;draw();}}
 }

 function composerConfig(){
  return {instructions:form.elements.instructions.value,visionGuidance:form.elements.guidance.value,model:AUTO_EDIT_MODELS.image,vision1:AUTO_EDIT_MODELS.vision1,vision2:AUTO_EDIT_MODELS.vision2,sourceScope:'both',batchSize:form.elements.count.valueAsNumber,consent:true};
 }
 function loadIntoComposer(config,notify=true){
  if(draft||busy)throw new Error('Confirm the pending request first.');
  form.elements.instructions.value=config.instructions;form.elements.guidance.value=config.visionGuidance;
  selectedRevision=config;form.elements.consent.checked=false;eligibleCount=null;
  if(notify){section='new';notice='Instruction version loaded.';}draw();
  if(notify&&!config.seedVersionId&&isAutoId(config.revisionId)){
   const token=generation;
   void getDocFromServer(ref('autoConfigs',config.revisionId)).then(snapshot=>{
    const record=snapshotData(snapshot),version=record?.seedVersionId??record?.config?.seedVersionId;
    if(token===generation&&authorized()&&selectedRevision===config&&isAutoId(version)){selectedRevision={...config,seedVersionId:version};draw();}
   }).catch(()=>{});
  }
 }
 function confirmSubmitted(batchId,messageText){
  selectBatch(batchId);section='runs';draft=null;form.elements.consent.checked=false;notice=messageText;
 }
 async function submit(token){
  const config=composerConfig();
  const revisionId=selectedRevision?.instructions===config.instructions?selectedRevision.revisionId:null;
  draft??={batchId:id(),count:config.batchSize,instructions:config.instructions,visionGuidance:config.visionGuidance,consent:true,...(isAutoId(revisionId)?{revisionId}:{})};
  const request=draft;
  draw();
  try{
   const response=await drive.startAutoEditBatch(request);check(token);
   needsDrive=false;
   if(response?.batchId!==request.batchId||response.count!==request.count||!isAutoId(response.seedVersionId)||!Number.isSafeInteger(response.expiresAt))throw new Error('Could not confirm this batch. Retry the same request.');
   const selected=history.find(record=>record.id===response.batchId);
   if(!selected)history=[{id:response.batchId,createdAt:Date.now()},...history].slice(0,20);
   selectedRevision={...config,revisionId:response.revisionId??revisionId,seedVersionId:response.seedVersionId};
   confirmSubmitted(response.batchId,'Batch confirmed. Your PC can continue if you close Studio.');
   await refreshHistory();
  }catch(e){
   if(token!==generation)throw e;
   if(Number.isInteger(e?.eligibleCount)&&e.eligibleCount>=0&&e.eligibleCount<request.count){
    draft=null;eligibleCount=e.eligibleCount;form.elements.consent.checked=false;
    throw new Error(e.eligibleCount?('Only '+e.eligibleCount+' eligible image'+(e.eligibleCount===1?'':'s')+' for this instruction version.'): 'No eligible images remain for this instruction version.');
   }
   if(DECLINED_BATCH.has(e?.code))draft=null;
   needsDrive=['drive/reconnect-required','drive/connection-changed'].includes(e?.code);
   throw e;
  }
 }
 async function command(kind,token){
  const selected=batchId,selectedItem=itemId,target=ref('autoBatches',selected);
  await runTransaction(db,async tx=>{
   const [snap,control]=await Promise.all([tx.get(target),tx.get(ref('autoEditControl','admission'))]);check(token);
   const b=snapshotData(snap),a=snapshotData(control);
   if(!b||!activeBatch(a)||a.batchId!==selected||(TERMINAL.has(b.execution?.status)&&!(kind==='retry'&&b.execution.status==='completed-with-failures')))throw new Error('This batch is no longer active.');
   if(kind!=='stop'&&b.execution&&b.execution.commandRevision!==b.command?.revision)throw new Error('Wait for the current command acknowledgement.');
   const retry=kind==='retry';
   tx.update(target,{command:{kind:retry?'run':kind,revision:b.command.revision+1,retryItemId:retry?selectedItem:null},dispatch:true});
  });notice='Command recorded. Waiting for the PC acknowledgement.';
 }
 async function closeAdmission(token){
  await runTransaction(db,async tx=>{
   const target=ref('autoEditControl','admission'),snap=await tx.get(target);check(token);
   const a=snapshotData(snap);
   if(!a?.enabled)return;
   if(!batchAdmission(a)||a.batchId!==batchId)throw new Error('Select the batch with the open window first.');
   if(activeBatch(a)){
    const b=await tx.get(ref('autoBatches',a.batchId));check(token);
    if(!TERMINAL.has(snapshotData(b)?.execution?.status))throw new Error('Stop the active batch and wait for acknowledgement first.');
   }
   tx.set(target,{version:1,enabled:false,updatedAt:Date.now()});
  });notice='Batch window closed.';
 }
 async function loadComparison(token){
  if(!dialog.open||!reviewable(item)||!isHash(item.sourceArtifact?.sha256))throw new Error('Wait for verified output delivery.');
  const snapshot=structuredClone(item),key=reviewKey(snapshot),folder=review?.status==='accepted'?review.parentId:REVIEW_STAGING_ID;
  if(!isDriveId(folder))throw new Error('Accepted folder is not confirmed.');
  releaseMedia();const controller=new AbortController();mediaAbort=controller;$('comparison-status').textContent='Verifying original and edited images…';drawReview();
  try{
   await drive.authorize();check(token);
   const [original,edited]=await Promise.all([drive.readAutoEditImage({fileId:snapshot.source.fileId,folderId:snapshot.source.folderId,sha256:snapshot.sourceArtifact.sha256},{signal:controller.signal}),drive.readAutoEditImage({fileId:snapshot.receipt.fileId,folderId:folder,sha256:snapshot.receipt.sha256},{signal:controller.signal})]);
   check(token);if(reviewKey()!==key||controller.signal.aborted)throw new Error('Review changed.');
   const urls={original:URL.createObjectURL(original),edited:URL.createObjectURL(edited)};
   try{
    // A valid checksum is not proof the browser could display the image.
    const images=[new Image(),new Image()];images[0].src=urls.original;images[1].src=urls.edited;
    await Promise.all(images.map(image=>image.decode()));check(token);
    if(reviewKey()!==key||controller.signal.aborted)throw new Error('Review changed.');
    preview=urls;previewJob=key;
    $('edited').src=preview.edited;$('before').src=preview.original;$('comparison-status').textContent='';showCompare();
   }catch(error){URL.revokeObjectURL(urls.original);URL.revokeObjectURL(urls.edited);throw error;}
  }catch(e){if(controller.signal.aborted)return;if(token===generation)$('comparison-status').textContent=message(e);throw e;}
  finally{if(mediaAbort===controller)mediaAbort=null;}
 }
 function showCompare(){
  const original=Boolean(preview&&(pinned||peeking));
  $('before').hidden=!original;$('edited').hidden=original;$('edited').setAttribute('aria-hidden',String(original));$('before').setAttribute('aria-hidden',String(!original));
  $('compare').setAttribute('aria-pressed',String(pinned));$('compare').setAttribute('aria-label',original?'Original image. Switch to edited result':'Edited result. Switch to original image');$('compare-cue').textContent=original?'Original · release or tap to return':'Edited result · hold for original';
 }
 async function moveReview(token){
  const selected=batchId,selectedItem=itemId,receipt=item?.receipt;
  const response=await drive.moveAutoEditReview({batchId:selected,itemId:selectedItem});check(token);
  if(response?.status!=='accepted'||response.fileId!==receipt?.fileId||response.sha256!==receipt.sha256||!isDriveId(response.parentId)||!isHash(response.receiptId))throw new Error('Drive move not yet confirmed. Retry the same review.');
  notice='Approved. The verified file is in Auto Generated.';
  window.dispatchEvent(new CustomEvent('velum:auto-edit-accepted'));
 }
 async function decide(decision,token){
  if(!preview||!reviewKnown||review||item?.status!=='review-ready')throw new Error('Load and verify both images first.');
  const selected=batchId,selectedItem=itemId,receipt=item.receipt,note=$('feedback').value;
  await runTransaction(db,async tx=>{
   const target=ref('autoReviews',selected+'-'+selectedItem),[existing,entry]=await Promise.all([tx.get(target),tx.get(ref('autoBatches',selected,'items',selectedItem))]);check(token);
   const fresh=snapshotData(entry),prior=snapshotData(existing);
   if(prior){if(prior.decision!==decision||prior.sha256!==receipt.sha256)throw new Error('An immutable decision already exists.');return;}
   if(fresh?.status!=='review-ready'||fresh.receipt?.fileId!==receipt.fileId||fresh.receipt.sha256!==receipt.sha256)throw new Error('Result changed. Reload the comparison.');
   tx.set(target,{version:1,batchId:selected,itemId:selectedItem,decision,feedback:note,decidedAt:Date.now(),status:decision==='okay'?'accepted-pending-move':'rejected',sourceFileId:fresh.source.fileId,fileId:receipt.fileId,sha256:receipt.sha256});
  });check(token);
  if(decision==='okay'){notice='Decision saved. Confirming the Drive move…';draw();await moveReview(token);}
  else notice='Rejection saved. The image stays in Review staging.';
 }

 function openReview(next,trigger){
  if(!itemIdOf(next)||busy||!reviewable(items.get(next)))return;
  reviewTrigger=trigger;reviewSequence=reviewPeers();
  selectItem(next);$('comparison-status').textContent='Checking this result…';
  if(!dialog.open)dialog.showModal();
  draw();
 }
 function openPeer(direction){
  const next=adjacentReview(direction);
  if(busy||!next)return;
  selectItem(next);$('comparison-status').textContent='Checking this result…';draw();
 }
 async function refresh(token){
  await refreshHistory();check(token);
  if(!admissionKnown){unwatch('admission');unwatch('config');watching=false;startWatching();}
  if(draft){
   const existing=await getDocFromServer(ref('autoBatches',draft.batchId));check(token);
   if(existing.exists()){
    const plan=existing.data().plan;
    if(plan?.config?.instructions!==draft.instructions||plan?.config?.visionGuidance!==draft.visionGuidance||plan?.items?.length!==draft.count)throw new Error('Batch identity conflict. Reopen Auto Edit and check Runs.');
    confirmSubmitted(draft.batchId,'Batch already confirmed.');
   }
  }
  if(batchId)await refreshResults();
 }
 listen(form,'submit',event=>{event.preventDefault();if(canStart())void runAction(submit);});
 listen(form,'input',event=>{
  if(!draft&&['instructions','count'].includes(event.target.name)){eligibleCount=null;notice='';}
  draw();
 });
 listen(batchSelect,'change',()=>{if(batchSelect.value)selectBatch(batchSelect.value);draw();});
 listen(itemSelect,'change',()=>{selectItem(itemSelect.value);draw();});
 listen(dialog,'cancel',event=>{event.preventDefault();closeReview({restoreFocus:true});draw();});
 listen(dialog,'keydown',event=>{
  if(event.target instanceof HTMLTextAreaElement||event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();openPeer(event.key==='ArrowLeft'?-1:1);
 });
 listen(root,'click',event=>{
  const sectionButton=event.target.closest('[data-ae-section]');
  if(sectionButton){
   section=sectionButton.dataset.aeSection;
   if(section==='runs'&&activeBatch(admission)&&batchId!==admission.batchId)selectBatch(admission.batchId);
   draw();return;
  }
  const filterButton=event.target.closest('[data-ae-filter]');
  if(filterButton){filter=filterButton.dataset.aeFilter;shown=REVIEW_PAGE;draw();return;}
  const tile=event.target.closest('[data-ae-item]');
  if(tile){openReview(tile.dataset.aeItem,tile);return;}
  switch(event.target.closest('[data-ae-action]')?.dataset.aeAction){
   case 'reset-vision':
    if(!busy&&!draft&&!learningController?.busy){form.elements.guidance.value=DEFAULT_VISION1_INSTRUCTION;notice='Default Vision 1 instruction restored.';draw();}
    break;
   case 'use-available':
    if(eligibleCount>0){form.elements.count.value=String(eligibleCount);form.elements.consent.checked=false;eligibleCount=null;notice='Confirm consent to start with the smaller count.';draw();}
    break;
   case 'refresh': void runAction(refresh);break;
   case 'connect-read': void runAction(async token=>{await drive.authorize();check(token);needsDrive=false;notice='Drive connected. Confirm your batch.';});break;
   case 'gallery': openCreations();break;
   case 'current': if(activeBatch(admission)){selectBatch(admission.batchId);draw();}break;
   case 'renew': void runAction(async token=>{
    if(windowState()!=='window-expired'||activeAdmission(admission))throw new Error('This batch is not ready to renew.');
    const selected=batchId,response=await drive.renewAutoEditBatch({batchId:selected});check(token);
    if(response?.batchId!==selected)throw new Error('Could not confirm the renewed window. Refresh Runs.');
    notice='Batch window renewed.';
   });break;
   case 'resume': void runAction(token=>command('run',token));break;
   case 'pause': void runAction(token=>command('pause',token));break;
   case 'retry': void runAction(token=>command('retry',token));break;
   case 'stop': void runAction(token=>command('stop',token));break;
   case 'close-admission': void runAction(closeAdmission);break;
   case 'more-results': shown+=REVIEW_PAGE;draw();break;
   case 'previous': openPeer(-1);break;
   case 'next': openPeer(1);break;
   case 'close-review': closeReview({restoreFocus:true});draw();break;
   case 'load-comparison': void runAction(loadComparison);break;
   case 'accept': void runAction(token=>decide('okay',token));break;
   case 'reject': void runAction(token=>decide('not-okay',token));break;
   case 'move': void runAction(moveReview);break;
   case 'connect': void runAction(async token=>{await drive.connectAutoEditManagement();check(token);notice='Drive management connected. Retry the saved review.';});break;
  }
 });
 listen($('compare'),'pointerdown',event=>{if(!preview||!event.isPrimary||event.button!==0)return;hold={id:event.pointerId,x:event.clientX,y:event.clientY};hold.timer=setTimeout(()=>{if(hold){peeking=true;skipClick=true;showCompare();}},300);});
 function endHold(event){if(!hold||event&&event.pointerId!==undefined&&event.pointerId!==hold.id)return;clearTimeout(hold.timer);hold=null;peeking=false;showCompare();}
 listen(window,'pointermove',event=>{if(hold&&event.pointerId===hold.id&&Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>12){skipClick=true;endHold(event);}});
 listen(window,'pointerup',endHold);listen(window,'pointercancel',event=>{skipClick=true;endHold(event);});listen(window,'blur',()=>endHold());
 listen($('compare'),'click',event=>{if(skipClick&&event.detail>0){skipClick=false;return;}skipClick=false;if(preview){pinned=!pinned;showCompare();}});
 listen($('compare'),'contextmenu',event=>event.preventDefault());
 learningController=mountAutoLearning($('learning'),{sdk,db,auth,context,session:()=>({admission,admissionKnown,busy:busy||Boolean(draft)}),composerConfig,loadIntoComposer});
 return {sync(){if(authorized()){startWatching();draw();}else if(watching)stop();},clear:stop,destroy(){stop();learningController?.destroy();destroyed=true;listeners.forEach(remove=>remove());}};
}
