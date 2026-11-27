// Owner-only Auto Edit pilot UI. No image processing or credentials in the browser queue.
const localModule=relative=>{const url=new URL(relative,import.meta.url);url.search=new URL(import.meta.url).search;return import(url.href);};
const {AUTO_EDIT_MODELS,AUTO_EDIT_STAGES,SOURCE_FOLDERS,REVIEW_STAGING_ID,isAutoId,isDriveId,isHash,validateAutoEditPlan,planJson}=await localModule('./auto-edit-shared.mjs');
const {PC_DEVICE_UID}=await localModule('./device-config.mjs');
const {deviceApproved,workerOnline,workerHasModel}=await localModule('./studio-contract.mjs');
const {formatDuration}=await localModule('./studio-progress.mjs');
const {createReferencePicker}=await localModule('./studio-reference-picker.mjs');
const {revisionRecord,sameConfiguration,learningAdmission}=await localModule('./auto-edit-learning-contract.mjs');
const {mountAutoLearning}=await localModule('./studio-auto-learning.mjs');
const OWNER='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',ITEM='item-001',PILOT_MS=165*60*1000;
const TERMINAL=new Set(['completed','completed-with-failures','stopped']);
const LABELS={source:'Original · verified download',vision1:'Vision 1 · describe',prompt:'Compose instructions',edit:'Image edit · Qwen Turbo',vision2:'Vision 2 · compare',delivery:'Drive · verify staging','review-ready':'Ready for your review'};
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hex=buffer=>[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
const id=()=>crypto.randomUUID();
const sha=async text=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
const snapshotData=s=>s.exists()?s.data():null;
const activePilot=a=>a?.version===1&&a.enabled===true&&a.mode==='pilot'&&isAutoId(a.batchId)&&isDriveId(a.sourceFileId)&&Number.isSafeInteger(a.expiresAt)&&a.expiresAt>Date.now();
const activeAdmission=a=>Boolean(activePilot(a)||learningAdmission(a));
function message(error){const code=error?.code;return code==='permission-denied'?'Auto Edit is not released for this account or the PC is not ready.':code==='drive/management-required'?'Approve Drive management, then retry the same saved review.':error?.message||'The action could not be confirmed. Refresh before retrying.';}
function renderShell(root){
 root.innerHTML='<div class="ae-intro"><div><span class="studio-eyebrow">Private · on your PC</span><h2>Auto Edit</h2><p>Define the change once. Review each result yourself.</p></div><span class="ae-pilot-tag">Single-image pilot</span></div>'+
 '<div class="ae-status" role="status" data-ae="readiness">Checking worker and release…</div>'+
 '<form class="ae-card ae-setup"><div class="ae-heading"><div><span class="studio-eyebrow">Configuration</span><h3>Editing instructions</h3></div></div>'+
 '<label class="studio-label">Your edit<textarea class="studio-input" name="instructions" rows="4" maxlength="3998" required placeholder="Describe an ordinary change to the image…"></textarea></label>'+
 '<details class="ae-guidance"><summary>Vision guidance</summary><label class="studio-label">Vision 1 guidance<textarea class="studio-input" name="guidance" rows="3" maxlength="4000" placeholder="Relevant visible details to preserve or describe"></textarea></label><p class="studio-hint">Vision 1 adds only relevant observations. Vision 2 compares the result with the original.</p></details>'+
 '<div class="ae-settings"><label class="studio-label">Image model<select class="studio-input" name="model"><option value="qwen-image-2.1-turbo">Qwen Image 2.1 Turbo</option></select></label><label class="studio-label">Images<input class="studio-input" type="number" value="1" min="1" max="1" readonly name="count"/></label><label class="studio-label">Source folder<select class="studio-input" name="scope"><option value="both">Private + References</option><option value="private">Private</option><option value="references">References</option></select></label></div>'+
 '<div class="ae-original"><span class="studio-label">Approved original</span><p data-ae="original">No image selected</p><button type="button" data-ae-action="choose">Choose original</button></div>'+
 '<label class="studio-consent"><input type="checkbox" name="consent" required/><span>I authorize editing this exact non-personal image for this pilot. The intended edit is lawful and appropriate; the original must stay unchanged.</span></label>'+
 '<button type="submit" class="studio-generate" data-ae="start" disabled>Start single-image pilot</button><p class="studio-hint">One exact original and one Turbo edit. Admission expires after 165 minutes. You can leave Studio after the request is confirmed.</p></form>'+
 '<section class="ae-card"><div class="ae-heading"><div><span class="studio-eyebrow">Activity</span><h3>Batch progress</h3></div><button type="button" data-ae-action="refresh">Refresh</button></div><label class="sr-only" for="aeBatch">Choose batch</label><select class="studio-input" id="aeBatch"><option value="">No batch selected</option></select><div data-ae="progress"><p class="studio-hint">Your submitted pilot appears here.</p></div><div class="ae-actions" data-ae="controls"></div></section>'+
 '<section class="ae-card ae-review" data-ae="review" hidden><div class="ae-heading"><div><span class="studio-eyebrow">Review</span><h3>Compare the result</h3></div><span data-ae="review-state"></span></div><button type="button" data-ae-action="load-comparison">Load verified comparison</button><button type="button" class="ae-compare" data-ae="compare" hidden aria-pressed="false"><img data-ae="edited" alt="Edited result" draggable="false"/><img data-ae="before" alt="Original image" draggable="false" hidden/><span data-ae="compare-cue">Press and hold for original · tap to switch</span></button><div data-ae="comparison-status" class="studio-hint" role="status"></div><label class="studio-label">Feedback (optional)<textarea class="studio-input" data-ae="feedback" rows="3" maxlength="2000" placeholder="What worked or should be different?"></textarea></label><div class="ae-review-buttons"><button type="button" data-ae-action="reject" disabled>Not Okay</button><button type="button" data-ae-action="accept" disabled>Okay · move to Auto Generated</button></div><div data-ae="review-actions" class="ae-actions"></div></section>'+
 '<section class="ae-card ae-learning" data-ae="learning" aria-label="Learning and configurations"></section><p class="ae-message" data-ae="message" role="status" aria-live="polite"></p>';
}
export function mountAutoEdit(root,{sdk,db,drive,auth,context}){
 const {doc,collection,query,orderBy,limit,getDocs,getDocFromServer,onSnapshot,runTransaction}=sdk;
 renderShell(root);
 const $=key=>root.querySelector('[data-ae="'+key+'"]'),form=root.querySelector('form'),batchSelect=root.querySelector('#aeBatch'),picker=createReferencePicker({drive});
 const workspace=()=>['users',OWNER,'velumStudio','workspace'],ref=(...parts)=>doc(db,...workspace(),...parts);
 let watching=false,generation=0,admission=null,admissionKnown=false,history=[],batchId='',batch=null,item=null,review=null,live=null,busy=false,source=null,draft=null,notice='',slots=new Map(),preview=null,previewJob='',mediaAbort=null,hold=null,pinned=false,peeking=false,skipClick=false,reviewKnown=false,destroyed=false;
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
   if(s.metadata.fromCache){if(key==='admission')admissionKnown=false;draw();return;}
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
 function stop(){
  learningController?.clear();
  generation++;watching=false;for(const key of [...slots.keys()])unwatch(key);picker.clear();releaseMedia();admissionKnown=false;reviewKnown=false;busy=false;live=null;batch=null;item=null;review=null;history=[];admission=null;batchId='';source=null;draft=null;notice='';
  form.reset();for(const el of form.elements)el.disabled=false;$('feedback').value='';$('comparison-status').textContent='';$('message').textContent='';
  $('original').textContent='No image selected';$('readiness').textContent='Reopen Auto Edit to check the PC.';$('review-state').textContent='';$('review').hidden=true;$('start').disabled=true;
  for(const key of ['progress','controls','review-actions']){const node=$(key);node.replaceChildren();delete node.dataset.signature;}
  batchSelect.replaceChildren(new Option('No batch selected',''));delete batchSelect.dataset.signature;
 }
 function selectBatch(next){
  if(!isAutoId(next)||next===batchId)return;
  ['batch','item','live','review'].forEach(unwatch);releaseMedia();
  batchId=next;batch=null;item=null;review=null;live=null;reviewKnown=false;$('feedback').value='';$('comparison-status').textContent='';
  watch('batch',ref('autoBatches',next),v=>{batch=v;syncTelemetry();});
  watch('item',ref('autoBatches',next,'items',ITEM),v=>{const changed=item?.receipt?.sha256!==v?.receipt?.sha256;item=v;if(changed)releaseMedia();syncTelemetry();});
  watch('review',ref('autoReviews',next+'-'+ITEM),v=>{reviewKnown=true;review=v;});
 }
 function syncTelemetry(){
  if(batch?.execution?.status==='running'&&item?.inFlight&&batch.execution.activeItemId===ITEM){
   watch('live',ref('autoBatches',batchId,'live','pc'),v=>{live=v;});
  }else{unwatch('live');live=null;}
 }
 async function refreshHistory(){
  const token=generation;
  const result=await getDocs(query(collection(db,...workspace(),'autoBatches'),orderBy('createdAt','desc'),limit(20)));check(token);
  history=result.docs.map(s=>({id:s.id,...s.data()}));
  if(!batchId){const next=(activePilot(admission)?admission.batchId:null)||history[0]?.id;if(next)selectBatch(next);}
  draw();
 }
 function startWatching(){
  if(watching)return;watching=true;
  watch('admission',ref('autoEditControl','admission'),v=>{
   admission=v;admissionKnown=true;
   if(activePilot(v)&&!batchId)selectBatch(v.batchId);
  });
  void refreshHistory().catch(e=>{if(watching){notice=message(e);draw();}});
 }
 function readiness(){
  const c=context();
  if(!c.connected||!navigator.onLine)return 'Reconnect to confirm the private PC state.';
  if(!admissionKnown)return 'Checking whether Auto Edit is released…';
  if(activePilot(admission))return 'One-image admission is open until '+new Date(admission.expiresAt).toLocaleTimeString()+'.';
  if(learningAdmission(admission))return 'Local learning admission is open until '+new Date(admission.expiresAt).toLocaleTimeString()+'.';
  if(!deviceApproved(c.binding))return 'Approve your PC in Studio first.';
  if(!workerOnline(c.worker))return 'Waiting for a fresh PC heartbeat.';
  if(c.worker.autoEditReadyAt!==c.worker.updatedAt)return 'Auto Edit is not enabled on the PC. Manual Studio is separate.';
  if(!workerHasModel(c.worker,AUTO_EDIT_MODELS.image))return 'Qwen Turbo is not verified on this PC.';
  if(c.busy||c.worker.state!=='idle')return 'Manual Studio or Auto Edit is currently busy.';
  return 'PC ready · choose one original and confirm its edit.';
 }
 function canStart(){
  const c=context();return authorized()&&admissionKnown&&!activeAdmission(admission)&&navigator.onLine&&c.connected&&deviceApproved(c.binding)&&workerOnline(c.worker)&&c.worker.autoEditReadyAt===c.worker.updatedAt&&workerHasModel(c.worker,AUTO_EDIT_MODELS.image)&&c.worker.state==='idle'&&!c.busy&&!busy&&!learningController?.busy&&source&&form.elements.instructions.value.trim()&&form.elements.consent.checked;
 }
 function commandButtons(){
  if(!batch||!activePilot(admission)||admission.batchId!==batchId)return '';
  const st=batch.execution?.status||'queued',pending=batch.execution?.commandRevision!==batch.command?.revision,disabled=busy||pending?'disabled':'';
  if(TERMINAL.has(st))return '<button type="button" data-ae-action="close-admission" '+(busy?'disabled':'')+'>Close pilot admission</button>';
  return (['queued','running'].includes(st)?'<button type="button" data-ae-action="pause" '+disabled+'>Pause after stage</button>':'')+
   (st==='paused'?'<button type="button" data-ae-action="resume" '+disabled+'>Resume</button>':'')+
   (st==='blocked'&&item?.failure?'<button type="button" data-ae-action="retry" '+disabled+'>Retry verified checkpoint</button>':'')+
   '<button type="button" data-ae-action="stop" '+(busy||batch.command?.kind==='stop'?'disabled':'')+'>Stop pilot</button>';
 }
 function progressMarkup(){
  if(!batch)return '<p class="studio-hint">Choose a submitted pilot to see actual stages.</p>';
  const status=batch.execution?.status||'queued',stage=item?.stage||'source',index=AUTO_EDIT_STAGES.indexOf(stage),p=live?.progress,valid=live?.publicationRevision===batch.execution?.publicationRevision&&live?.itemId===ITEM&&p?.stage===item?.inFlight?.stage;
  const resources=valid?p.resources:null,age=resources&&Number.isFinite(resources.sampledAt)?Date.now()-resources.sampledAt:Infinity;
  const fresh=resources&&age>=0&&age<75000&&context().connected;
  const number=(v,suffix='')=>Number.isFinite(v)?Math.round(v)+suffix:'—';
  const mem=(used,total,unit)=>Number.isFinite(used)&&Number.isFinite(total)&&total>0?(used/unit).toFixed(1)+' / '+(total/unit).toFixed(1)+' GB':'—';
  const metrics=[['CPU',number(resources?.cpuPercent,'%')],['RAM',mem(resources?.ramUsedBytes,resources?.ramTotalBytes,1073741824)],['GPU',number(resources?.gpuUtilPercent,'%')],['VRAM',mem(resources?.vramUsedMiB,resources?.vramTotalMiB,1024)],['GPU temp',number(resources?.gpuTempC,'°C')]];
  const failure=item?.failure;
  const c=batch.execution?.counts;
  const pending=batch.execution?.commandRevision!==batch.command?.revision;
  const config=batch.plan?.config||{};
  return '<div class="ae-progress-head"><strong>'+h(status.replaceAll('-',' '))+'</strong><span>'+h(c?c.ready+' / '+c.total+' ready':'Waiting for PC claim')+'</span></div>'+
   '<p class="studio-hint">'+h(pending?'Requested '+batch.command?.kind+' · awaiting PC acknowledgement':batch.execution?.reason||LABELS[stage]||'Waiting')+'</p>'+
   '<ol class="ae-stages">'+AUTO_EDIT_STAGES.map((s,i)=>'<li data-state="'+(i<index||stage==='review-ready'?'done':i===index&&status==='running'?'current':'pending')+'"><span>'+h(LABELS[s])+'</span><strong>'+h(Number.isFinite(item?.durations?.[s])?formatDuration(item.durations[s]):i===index&&item?.inFlight&&valid?formatDuration(Math.max(0,(fresh?Date.now():p.updatedAt)-item.inFlight.startedAt)):'—')+'</strong></li>').join('')+'</ol>'+
   (status==='running'?'<div class="ae-resource"><span>'+h(fresh?'PC now':resources?'Last reported PC':'Awaiting resource report')+'</span><dl>'+metrics.map(([k,v])=>'<div><dt>'+h(k)+'</dt><dd>'+h(v)+'</dd></div>').join('')+'</dl></div>':'')+
   (failure?'<div class="ae-failure"><strong>'+h(failure.stage)+'</strong><p>'+h(failure.code)+'</p><small>'+h(failure.uncertain?'The previous attempt may have started. The worker must reconcile before retrying.':'The worker stopped before completion.')+'</small></div>':'')+
   '<details class="ae-lineage"><summary>Prompt and provenance</summary><dl><dt>Instruction seed</dt><dd>'+h(config.instructions||'—')+'</dd><dt>Vision 1 addition</dt><dd>'+h(item?.vision1?.addition||'—')+'</dd><dt>Effective prompt</dt><dd>'+h(item?.prompt||'—')+'</dd><dt>Model / numeric seed</dt><dd>'+h(config.model||'—')+' · '+h(item?.seed??batch.plan?.items?.[0]?.seed??'—')+'</dd><dt>Vision 2</dt><dd>'+h(item?.vision2?.summary||'—')+'</dd>'+(item?.vision2?.observations?.length?'<dt>Observations</dt><dd><ul>'+item.vision2.observations.map(v=>'<li>'+h(v)+'</li>').join('')+'</ul></dd>':'')+'<dt>Limitations</dt><dd>'+h([item?.vision1?.limitations,item?.vision2?.limitations].filter(Boolean).join('\n')||'—')+'</dd></dl></details>';
 }
 function updateMarkup(el,markup){
  if(el.dataset.signature===markup)return;
  const expanded=[...el.querySelectorAll('details')].map(x=>x.open);
  el.dataset.signature=markup;el.innerHTML=markup;
  el.querySelectorAll('details').forEach((x,i)=>x.open=Boolean(expanded[i]));
 }
 function draw(){
  if(!authorized())return;
  $('readiness').textContent=readiness();
  $('original').textContent=source?source.name+' · '+(source.folderId===SOURCE_FOLDERS.private?'Private':'References'):'No image selected';
  for(const key of ['instructions','guidance','model','count','scope','consent'])form.elements[key].disabled=busy||Boolean(draft);
  $('start').disabled=!canStart();
  form.querySelector('[data-ae-action="choose"]').disabled=busy||Boolean(draft)||activeAdmission(admission);
  $('start').textContent=busy&&draft?'Confirming request…':'Start single-image pilot';
  const records=new Map(history.map(v=>[v.id,v]));
  if(batchId&&batch)records.set(batchId,{id:batchId,...batch});
  if(batchId&&!records.has(batchId))records.set(batchId,{id:batchId,createdAt:null});
  const options='<option value="">Choose a batch</option>'+[...records.values()].map(v=>'<option value="'+h(v.id)+'">'+h(Number.isFinite(v.createdAt)?new Date(v.createdAt).toLocaleString()+' · '+(v.execution?.status||'queued'):v.id)+'</option>').join('');
  if(batchSelect.dataset.signature!==options){batchSelect.dataset.signature=options;batchSelect.innerHTML=options;}
  batchSelect.value=batchId;batchSelect.disabled=busy;
  updateMarkup($('progress'),progressMarkup());
  let controls=commandButtons();
  if(admission?.mode==='pilot'&&admission.enabled===true&&!activePilot(admission))controls+='<button type="button" data-ae-action="close-admission" '+(busy?'disabled':'')+'>Close expired admission</button>';
  if(activePilot(admission)&&admission.batchId!==batchId)controls+='<button type="button" data-ae-action="current">Open active pilot</button>';
  updateMarkup($('controls'),controls);
  const reviewable=item?.status==='review-ready'&&item.receipt?.verified===true&&isHash(item.receipt.sha256);
  $('review').hidden=!reviewable;
  if(reviewable){
   $('review-state').textContent=review?.status?.replaceAll('-',' ')||'Awaiting decision';
   const verified=Boolean(preview&&previewJob===batchId+':'+item.receipt.sha256);
   $('compare').hidden=!verified;
   $('feedback').disabled=busy||Boolean(review)||!reviewKnown;
   if(review&&$('feedback').value!==review.feedback)$('feedback').value=review.feedback||'';
   root.querySelector('[data-ae-action="accept"]').disabled=busy||!verified||!reviewKnown||Boolean(review);
   root.querySelector('[data-ae-action="reject"]').disabled=busy||!verified||!reviewKnown||Boolean(review);
   root.querySelector('[data-ae-action="load-comparison"]').disabled=busy;
   const retry=review?.status==='accepted-pending-move';
   updateMarkup($('review-actions'),retry?'<button type="button" data-ae-action="move" '+(busy?'disabled':'')+'>Confirm / retry same Drive move</button><button type="button" data-ae-action="connect" '+(busy?'disabled':'')+'>Connect Drive management</button>':review?.status==='accepted'?'<a target="_blank" rel="noopener noreferrer" href="https://drive.google.com/file/d/'+h(review.fileId)+'/view">Open accepted image in Drive</a>':review?.status==='rejected'?'<p class="studio-hint">Kept in Review staging. Nothing was moved or deleted.</p>':'');
  }
  $('message').textContent=notice;
  learningController?.sync();
 }
 async function runAction(action){
  if(busy||learningController?.busy||!authorized())return;
  const token=generation;busy=true;notice='';draw();
  try{await action(token);check(token);}catch(e){if(token===generation)notice=message(e);}
  finally{if(token===generation){busy=false;draw();}}
 }
 async function choose(token){
  await drive.authorize();check(token);
  const [selected]=await picker.choose({limit:1});check(token);if(!selected)return;
  const f=await drive.autoEditMetadata(selected.id);check(token);
  const scope=form.elements.scope.value,parent=f.parents[0];
  if(!Object.values(SOURCE_FOLDERS).includes(parent)||(scope!=='both'&&SOURCE_FOLDERS[scope]!==parent))throw new Error('Select an original inside the chosen source folder.');
  source={fileId:f.id,folderId:parent,mime:f.mimeType,sha256:f.sha256Checksum,name:f.name||'Drive original'};
  draft=null;form.elements.consent.checked=false;
 }
 function composerConfig(){
  return {instructions:form.elements.instructions.value,visionGuidance:form.elements.guidance.value,model:AUTO_EDIT_MODELS.image,vision1:AUTO_EDIT_MODELS.vision1,vision2:AUTO_EDIT_MODELS.vision2,sourceScope:form.elements.scope.value,batchSize:1,consent:true};
 }
 function loadIntoComposer(config){
  if(draft||busy)throw new Error('Confirm or clear the pending request first.');
  form.elements.instructions.value=config.instructions;form.elements.guidance.value=config.visionGuidance;
  form.elements.scope.value=config.sourceScope;source=null;form.elements.consent.checked=false;
  notice='Settings loaded. Choose and authorize a new original.';draw();
 }
 async function submit(token){
  if(!source||!form.elements.consent.checked)throw new Error('Choose and authorize the exact original first.');
  // Recheck source metadata immediately before accepting the explicit request.
  const f=await drive.autoEditMetadata(source.fileId);check(token);
  if(f.parents[0]!==source.folderId||f.mimeType!==source.mime||f.sha256Checksum!==source.sha256)throw new Error('Original changed. Select it again.');
  if(!draft){
   const pointer=snapshotData(await getDocFromServer(ref('autoEditControl','currentConfig')));check(token);
   const parentRevisionId=pointer?.revisionId??null;
   let prior=null;
   if(parentRevisionId!==null){
    if(!isAutoId(parentRevisionId))throw new Error('Current configuration pointer is invalid.');
    prior=snapshotData(await getDocFromServer(ref('autoConfigs',parentRevisionId)));check(token);
    if(prior?.revisionId!==parentRevisionId||prior.config?.revisionId!==parentRevisionId)throw new Error('Current configuration is unavailable.');
   }
   const reuse=Boolean(prior&&sameConfiguration(prior.config,composerConfig()));
   const batchId=id(),revisionId=reuse?parentRevisionId:id(),now=Date.now(),config={...composerConfig(),revisionId};
   const plan=validateAutoEditPlan({schemaVersion:1,batchId,deviceUid:PC_DEVICE_UID,createdAt:now,config,items:[{itemId:ITEM,ordinal:1,source:{...source,authorized:true},seed:crypto.getRandomValues(new Uint32Array(1))[0]&0x7fffffff}]});
   draft={plan,planHash:await sha(planJson(plan)),expiresAt:now+PILOT_MS,parentRevisionId,reuse};
  }
  const d=draft;check(token);
  if(Date.now()-d.plan.createdAt>240000){
   const prior=await getDocFromServer(ref('autoBatches',d.plan.batchId));check(token);
   if(prior.exists()&&prior.data().planHash===d.planHash){selectBatch(d.plan.batchId);draft=null;form.elements.consent.checked=false;notice='The original request was already confirmed.';return;}
   if(prior.exists())throw new Error('Request identity conflict. Refresh before submitting.');
   draft=null;throw new Error('The previous unsubmitted request expired. Confirm again.');
  }
  await runTransaction(db,async tx=>{
   const batchRef=ref('autoBatches',d.plan.batchId),configRef=ref('autoConfigs',d.plan.config.revisionId),admitRef=ref('autoEditControl','admission');
   const pointerRef=ref('autoEditControl','currentConfig');
   const [existing,configExists,control,status,device,pointer]=await Promise.all([tx.get(batchRef),tx.get(configRef),tx.get(admitRef),tx.get(ref('status','pc')),tx.get(ref('devices',PC_DEVICE_UID)),tx.get(pointerRef)]);
   check(token);
   if(existing.exists()){
    if(existing.data().planHash!==d.planHash)throw new Error('Request identity conflict.');
    return;
   }
   if(activeAdmission(snapshotData(control)))throw new Error('Another pilot or learning request is already open.');
   if((snapshotData(pointer)?.revisionId??null)!==d.parentRevisionId)throw new Error('Current configuration changed. Refresh before starting a new request.');
   if(d.reuse){
    if(!configExists.exists()||configExists.data().revisionId!==d.plan.config.revisionId||!sameConfiguration(configExists.data().config,d.plan.config))throw new Error('Approved revision changed.');
   }else if(configExists.exists())throw new Error('Configuration revision identity conflict.');
   const pc=snapshotData(status);
   if(!deviceApproved(snapshotData(device))||!workerOnline(pc)||pc.state!=='idle'||pc.autoEditReadyAt!==pc.updatedAt||!workerHasModel(pc,AUTO_EDIT_MODELS.image))throw new Error('PC is not ready for Auto Edit.');
   if(!d.reuse){
    tx.set(configRef,revisionRecord({config:d.plan.config,parentRevisionId:d.parentRevisionId,kind:'pilot',reason:'Owner approved settings at pilot submission.',approvedAt:d.plan.createdAt}));
    tx.set(pointerRef,{version:1,revisionId:d.plan.config.revisionId,updatedAt:Date.now()});
   }
   tx.set(admitRef,{version:1,enabled:true,updatedAt:Date.now(),mode:'pilot',batchId:d.plan.batchId,sourceFileId:d.plan.items[0].source.fileId,expiresAt:d.expiresAt});
   tx.set(batchRef,{schemaVersion:1,deviceUid:PC_DEVICE_UID,createdAt:d.plan.createdAt,planHash:d.planHash,plan:d.plan,command:{kind:'run',revision:0,retryItemId:null},dispatch:true,claim:null,execution:null});
  });
  check(token);selectBatch(d.plan.batchId);draft=null;form.elements.consent.checked=false;notice='Pilot submitted. Your PC can continue when you leave Studio.';await refreshHistory();
 }
 async function command(kind,token){
  const selected=batchId,target=ref('autoBatches',selected);
  await runTransaction(db,async tx=>{
   const [snap,control]=await Promise.all([tx.get(target),tx.get(ref('autoEditControl','admission'))]);check(token);
   const b=snapshotData(snap),a=snapshotData(control);
   if(!b||!activePilot(a)||a.batchId!==selected||TERMINAL.has(b.execution?.status))throw new Error('This pilot is no longer active.');
   if(kind!=='stop'&&b.execution?.commandRevision!==b.command?.revision)throw new Error('Wait for the current command acknowledgement.');
   const retry=kind==='retry';
   tx.update(target,{command:{kind:retry?'run':kind,revision:b.command.revision+1,retryItemId:retry?ITEM:null},dispatch:true});
  });notice='Command recorded. Waiting for the PC acknowledgement.';
 }
 async function closeAdmission(token){
  await runTransaction(db,async tx=>{
   const target=ref('autoEditControl','admission'),snap=await tx.get(target);check(token);
   const a=snapshotData(snap);
   if(!a?.enabled)return;
   if(activeAdmission(a)){
    const b=await tx.get(ref('autoBatches',a.batchId));check(token);
    if(!TERMINAL.has(snapshotData(b)?.execution?.status))throw new Error('Stop the active pilot and wait for acknowledgement first.');
   }
   tx.set(target,{version:1,enabled:false,updatedAt:Date.now()});
  });notice='Pilot admission closed.';
 }
 async function loadComparison(token){
  if(item?.status!=='review-ready'||!item.receipt?.verified||!isHash(item.sourceArtifact?.sha256))throw new Error('Wait for verified output delivery.');
  const snapshot=structuredClone(item),key=batchId+':'+snapshot.receipt.sha256,folder=review?.status==='accepted'?review.parentId:REVIEW_STAGING_ID;
  if(!isDriveId(folder))throw new Error('Accepted folder is not confirmed.');
  releaseMedia();const controller=new AbortController();mediaAbort=controller;$('comparison-status').textContent='Checking original and edited file checksums…';
  try{
   await drive.authorize();check(token);
   const [original,edited]=await Promise.all([drive.readAutoEditImage({fileId:snapshot.source.fileId,folderId:snapshot.source.folderId,sha256:snapshot.sourceArtifact.sha256},{signal:controller.signal}),drive.readAutoEditImage({fileId:snapshot.receipt.fileId,folderId:folder,sha256:snapshot.receipt.sha256},{signal:controller.signal})]);
   check(token);if(batchId+':'+item?.receipt?.sha256!==key||controller.signal.aborted)throw new Error('Review changed.');
   const urls={original:URL.createObjectURL(original),edited:URL.createObjectURL(edited)};
   try{
    // A valid checksum is not proof the browser could display the image.
    const images=[new Image(),new Image()];images[0].src=urls.original;images[1].src=urls.edited;
    await Promise.all(images.map(image=>image.decode()));check(token);
    if(batchId+':'+item?.receipt?.sha256!==key||controller.signal.aborted)throw new Error('Review changed.');
    preview=urls;previewJob=key;
    $('edited').src=preview.edited;$('before').src=preview.original;$('comparison-status').textContent='Original and edited images verified.';showCompare();
   }catch(error){URL.revokeObjectURL(urls.original);URL.revokeObjectURL(urls.edited);throw error;}
  }catch(e){if(token===generation)$('comparison-status').textContent=message(e);throw e;}
  finally{if(mediaAbort===controller)mediaAbort=null;}
 }
 function showCompare(){
  const original=Boolean(preview&&(pinned||peeking));
  $('before').hidden=!original;$('edited').setAttribute('aria-hidden',String(original));$('before').setAttribute('aria-hidden',String(!original));
  $('compare').setAttribute('aria-pressed',String(pinned));$('compare-cue').textContent=original?'Original · release or tap to return':'Edited result · hold for original';
 }
 async function moveReview(token){
  const selected=batchId;
  const response=await drive.moveAutoEditReview({batchId:selected,itemId:ITEM});check(token);
  if(response?.status!=='accepted'||response.fileId!==item?.receipt?.fileId||response.sha256!==item.receipt.sha256||!isDriveId(response.parentId)||!isHash(response.receiptId))throw new Error('Drive move not yet confirmed. Retry the same review.');
  notice='Accepted. The same verified file is in Auto Generated. Sync your gallery to see it in Drift and Browse.';
  window.dispatchEvent(new CustomEvent('velum:auto-edit-accepted'));
 }
 async function decide(decision,token){
  if(!preview||!reviewKnown||review||item?.status!=='review-ready')throw new Error('Load and verify both images first.');
  const selected=batchId,receipt=item.receipt,note=$('feedback').value;
  await runTransaction(db,async tx=>{
   const target=ref('autoReviews',selected+'-'+ITEM),[existing,entry]=await Promise.all([tx.get(target),tx.get(ref('autoBatches',selected,'items',ITEM))]);check(token);
   const fresh=snapshotData(entry),prior=snapshotData(existing);
   if(prior){if(prior.decision!==decision||prior.sha256!==receipt.sha256)throw new Error('An immutable decision already exists.');return;}
   if(fresh?.status!=='review-ready'||fresh.receipt?.fileId!==receipt.fileId||fresh.receipt.sha256!==receipt.sha256)throw new Error('Result changed. Reload the comparison.');
   tx.set(target,{version:1,batchId:selected,itemId:ITEM,decision,feedback:note,decidedAt:Date.now(),status:decision==='okay'?'accepted-pending-move':'rejected',sourceFileId:fresh.source.fileId,fileId:receipt.fileId,sha256:receipt.sha256});
  });check(token);
  if(decision==='okay'){notice='Decision saved. Confirming the Drive move…';draw();await moveReview(token);}
  else notice='Not Okay saved. The image stays in Review staging.';
 }
 listen(form,'submit',event=>{event.preventDefault();if(canStart())void runAction(submit);});
 listen(form,'input',()=>{if(draft){notice='A submission is awaiting confirmation. Refresh before creating a different request.';}draw();});
 listen(form.elements.scope,'change',()=>{if(!draft){source=null;form.elements.consent.checked=false;}draw();});
 listen(batchSelect,'change',()=>{if(batchSelect.value)selectBatch(batchSelect.value);draw();});
 listen(root,'click',event=>{
  const action=event.target.closest('[data-ae-action]')?.dataset.aeAction;if(!action)return;
  if(action==='choose'){if(draft){notice='Refresh the pending request before choosing another original.';draw();return;}void runAction(choose);}
  else if(action==='refresh')void runAction(async token=>{await refreshHistory();check(token);if(!admissionKnown){unwatch('admission');watching=false;startWatching();}if(draft){const existing=await getDocFromServer(ref('autoBatches',draft.plan.batchId));check(token);if(existing.exists()){if(existing.data().planHash!==draft.planHash)throw new Error('Previous request identity conflict.');selectBatch(draft.plan.batchId);draft=null;form.elements.consent.checked=false;notice='Previous request confirmed.';}else if(Date.now()-draft.plan.createdAt>240000){draft=null;notice='Previous request did not start. Confirm a new request.';}}});
  else if(action==='current'&&activePilot(admission)){selectBatch(admission.batchId);draw();}
  else if(['pause','resume','retry','stop'].includes(action))void runAction(token=>command(action==='resume'?'run':action,token));
  else if(action==='close-admission')void runAction(closeAdmission);
  else if(action==='load-comparison')void runAction(loadComparison);
  else if(action==='accept'||action==='reject')void runAction(token=>decide(action==='accept'?'okay':'not-okay',token));
  else if(action==='move')void runAction(moveReview);
  else if(action==='connect')void runAction(async token=>{await drive.connectAutoEditManagement();check(token);notice='Drive management connected. Retry the saved review.';});
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
