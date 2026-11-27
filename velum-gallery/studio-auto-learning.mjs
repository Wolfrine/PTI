// Explicit owner-controlled learning and immutable configuration revisions.
const localModule=relative=>{const url=new URL(relative,import.meta.url);url.search=new URL(import.meta.url).search;return import(url.href);};
const {AUTO_EDIT_MODELS,configOf,isAutoId}=await localModule('./auto-edit-shared.mjs');
const {PC_DEVICE_UID}=await localModule('./device-config.mjs');
const {deviceApproved,workerOnline,workerHasModel}=await localModule('./studio-contract.mjs');
const {QUALITY_CHANGES,LEARNING_TTL,LEARNING_MAX_EVIDENCE,revisionRecord,makeLearningRequest,validateLearningRequest,validateStoredProposal,suggestedConfig,sameConfiguration,learningAdmission}=await localModule('./auto-edit-learning-contract.mjs');
const OWNER='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',PAGE=30,TERMINAL=new Set(['proposed','failed','cancelled']);
const snapshot=s=>s.exists()?s.data():null;
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>Number.isFinite(v)?new Date(v).toLocaleString():'—';
const admissionOpen=a=>a?.enabled===true&&Number.isSafeInteger(a.expiresAt)&&a.expiresAt>Date.now();
function errorText(e){return e?.code==='permission-denied'?'This action is not authorized by the current release. Refresh before retrying.':e?.message||'The action could not be confirmed.';}
export function mountAutoLearning(root,{sdk,db,auth,context,session,composerConfig,loadIntoComposer}){
 const {doc,collection,query,orderBy,where,limit,startAfter,getDocs,getDocFromServer,onSnapshot,runTransaction}=sdk;
 const ws=()=>['users',OWNER,'velumStudio','workspace'],ref=(...p)=>doc(db,...ws(),...p);
 const pointerRef=()=>ref('autoEditControl','currentConfig'),admissionRef=()=>ref('autoEditControl','admission');
 root.innerHTML='<div class="ae-heading"><div><span class="studio-eyebrow">Owner approval only</span><h3>Learning &amp; configurations</h3></div><button type="button" data-al-action="refresh">Refresh</button></div>'+
 '<div class="al-current"><strong data-al="current">No approved configuration yet.</strong><span class="studio-hint" data-al="current-meta"></span></div>'+
 '<div class="ae-actions"><button type="button" data-al-action="load-current" disabled>Load current settings</button><button type="button" data-al-action="save-config" disabled>Save composer as revision</button></div>'+
 '<details class="al-section" data-al="history-details"><summary>Configuration history</summary><div class="al-revision-list" data-al="revisions"></div><button type="button" data-al-action="older" hidden>Older revisions</button></details>'+
 '<details class="al-section" data-al="learning-details"><summary>Learn from reviewed examples</summary><p class="studio-hint">Select one or two completed reviews from the current approved revision. The local 4B model compares the first pair and uses the recorded comparison for the second. No new image is generated.</p><button type="button" data-al-action="evidence">Load reviewed examples</button><div data-al="evidence" class="al-evidence"></div><label class="studio-consent"><input type="checkbox" data-al="consent"/><span>I authorize local quality analysis of these selected, non-personal images and their saved review feedback.</span></label><button type="button" data-al-action="learn" disabled>Generate learning proposal</button></details>'+
 '<section class="al-section"><div class="ae-heading"><h3>Learning proposals</h3><button type="button" data-al-action="proposal-history">Load history</button></div><label class="sr-only" for="aeLearningSelect">Choose proposal</label><select id="aeLearningSelect" class="studio-input"><option value="">No proposal selected</option></select><div data-al="proposal" class="al-proposal"><p class="studio-hint">A requested proposal will appear here. Nothing is applied automatically.</p></div><div data-al="proposal-actions" class="ae-actions"></div><div data-al="editor" hidden class="al-editor"><p class="studio-hint">Review and edit the proposed configuration. Approval creates a new revision; existing batches stay unchanged.</p><label class="studio-label">Editing instructions<textarea class="studio-input" data-al="instructions" rows="5" maxlength="3998"></textarea></label><label class="studio-label">Vision guidance<textarea class="studio-input" data-al="guidance" rows="4" maxlength="4000"></textarea></label><button type="button" class="studio-generate" data-al-action="approve">Approve new revision</button></div></section>'+
 '<p class="ae-message" data-al="message" role="status"></p>';
 const $=k=>root.querySelector('[data-al="'+k+'"]'),select=root.querySelector('#aeLearningSelect'),buttons=k=>root.querySelector('[data-al-action="'+k+'"]');
 let started=false,destroyed=false,generation=0,watchPointer=null,watchLearning=null,known=false,current=null,currentId=null,revisions=[],cursor=null,more=false,records=[],selectedId='',learning=null,learningKnown=false,evidence=[],selectedEvidence=new Set(),selectedKeys=new Set(),evidenceRevision='',editor=null,busy=false,notice='',pending=null,lastAdmissionId='';
 function authorized(){const c=context();return !destroyed&&c.uid===OWNER&&auth.currentUser?.uid===OWNER&&!c.locked&&!c.destroyed&&c.visible;}
 function check(g){if(g!==generation||!authorized())throw new Error('Studio session changed. Reopen Auto Edit.');}
 function guard(){const c=context();return authorized()&&c.connected&&navigator.onLine&&!busy&&!session().busy;}
 function pcReady(){const c=context();return deviceApproved(c.binding)&&workerOnline(c.worker)&&c.worker.state==='idle'&&c.worker.autoEditReadyAt===c.worker.updatedAt&&workerHasModel(c.worker,AUTO_EDIT_MODELS.image)&&!c.busy;}
 function configRecord(record,expected){if(record?.version!==1||record.revisionId!==expected||record.config?.revisionId!==expected)throw new Error('Configuration revision is invalid.');configOf(record.config);return record;}
 function markup(el,html){if(el.dataset.signature!==html){el.innerHTML=html;el.dataset.signature=html;}}
 function clearEditor(){editor=null;$('editor').hidden=true;$('instructions').value='';$('guidance').value='';}
 function clearEvidence(){evidence=[];selectedEvidence.clear();evidenceRevision='';$('consent').checked=false;}
 function reset(){
  generation++;started=false;watchPointer?.();watchLearning?.();watchPointer=null;watchLearning=null;known=false;current=null;currentId=null;revisions=[];cursor=null;more=false;records=[];selectedId='';learning=null;learningKnown=false;busy=false;notice='';pending=null;lastAdmissionId='';selectedKeys.clear();clearEditor();clearEvidence();
  $('current').textContent='No approved configuration yet.';$('current-meta').textContent='';$('message').textContent='';
  for(const k of ['revisions','evidence','proposal','proposal-actions']){$(k).replaceChildren();delete $(k).dataset.signature;}
  select.replaceChildren(new Option('No proposal selected',''));delete select.dataset.signature;
  $('history-details').open=false;$('learning-details').open=false;
  for(const k of ['load-current','save-config','learn','approve'])buttons(k).disabled=true;
 }
 function selectLearning(id){
  if(!isAutoId(id)||id===selectedId)return;
  watchLearning?.();watchLearning=null;selectedId=id;learning=null;learningKnown=false;selectedKeys.clear();clearEditor();
  const g=generation;
  watchLearning=onSnapshot(ref('autoLearnings',id),{includeMetadataChanges:true},snap=>{
   if(g!==generation||selectedId!==id||!authorized())return;
   if(snap.metadata.fromCache){learningKnown=false;draw();return;}
   learningKnown=true;const value=snapshot(snap);
   try{learning=value?validateLearningRequest(value):null;if(learning?.proposal)learning.proposal=validateStoredProposal(learning.proposal,learning.batchIds);}
   catch(e){learning=null;notice=errorText(e);}
   if(learning?.decision)clearEditor();
   draw();
  },e=>{if(g===generation&&selectedId===id){learningKnown=false;notice=errorText(e);draw();}});
 }
 function watchCurrent(){
  const g=generation;
  watchPointer=onSnapshot(pointerRef(),{includeMetadataChanges:true},async snap=>{
   if(g!==generation||!authorized())return;
   if(snap.metadata.fromCache){known=false;draw();return;}
   const p=snapshot(snap),id=p?.revisionId??null;
   if(id===currentId&&current){known=true;draw();return;}
   if(id!==currentId){clearEvidence();clearEditor();}
   currentId=id;current=null;known=!id;draw();
   if(!id)return;
   try{
    if(!isAutoId(id))throw new Error('Current revision pointer is invalid.');
    const result=await getDocFromServer(ref('autoConfigs',id));check(g);
    if(currentId!==id)return;
    current=configRecord(snapshot(result),id);known=true;draw();
   }catch(e){if(g===generation&&id===currentId){known=false;notice=errorText(e);draw();}}
  },e=>{if(g===generation){known=false;notice=errorText(e);draw();}});
 }
 async function fetchRevisions(append=false){
  const g=generation;
  const constraints=[orderBy('approvedAt','desc'),...(append&&cursor?[startAfter(cursor)]:[]),limit(PAGE)];
  const result=await getDocs(query(collection(db,...ws(),'autoConfigs'),...constraints));check(g);
  if(result.metadata.fromCache)throw new Error('Reconnect to load verified configuration history.');
  const rows=result.docs.map(s=>configRecord(s.data(),s.id));
  revisions=[...new Map([...(append?revisions:[]),...rows].map(r=>[r.revisionId,r])).values()];
  cursor=result.docs.at(-1)||null;more=result.docs.length===PAGE;draw();
 }
 async function reconcilePending(g){
  if(!pending)return;
  const request=pending,result=await getDocFromServer(ref('autoLearnings',request.learningId));check(g);
  if(result.exists()){
   const v=result.data();
   if(v.learningId!==request.learningId||v.baseRevisionId!==request.baseRevisionId||JSON.stringify(v.batchIds)!==JSON.stringify(request.batchIds))throw new Error('Previous learning request identity conflict.');
   selectLearning(request.learningId);pending=null;$('consent').checked=false;notice='Previous learning request confirmed.';
  }else if(Date.now()-request.createdAt>240000||currentId!==request.baseRevisionId){pending=null;$('consent').checked=false;notice='Previous request did not start. Select and authorize evidence again.';}
 }
 async function fetchProposals(){
  const g=generation,result=await getDocs(query(collection(db,...ws(),'autoLearnings'),orderBy('createdAt','desc'),limit(20)));check(g);
  if(result.metadata.fromCache)throw new Error('Reconnect to load learning history.');
  records=result.docs.map(s=>({id:s.id,status:s.data().status,createdAt:s.data().createdAt}));
  if(!selectedId&&records[0])selectLearning(records[0].id);
  draw();
 }
 async function fetchEvidence(){
  if(!known||!current)throw new Error('Save an approved configuration first.');
  const g=generation,id=currentId;
  const [batches,reviews]=await Promise.all([
   getDocs(query(collection(db,...ws(),'autoBatches'),where('plan.config.revisionId','==',id),limit(30))),
   getDocs(query(collection(db,...ws(),'autoReviews'),orderBy('decidedAt','desc'),limit(30)))
  ]);check(g);
  if(currentId!==id||batches.metadata.fromCache||reviews.metadata.fromCache)throw new Error('Configuration or connection changed. Reload reviewed examples.');
  const map=new Map(batches.docs.map(s=>[s.id,s.data()]));
  clearEvidence();evidenceRevision=id;
  evidence=reviews.docs.map(s=>s.data()).filter(r=>r.itemId==='item-001'&&map.has(r.batchId)&&map.get(r.batchId).plan?.config?.model===AUTO_EDIT_MODELS.image
   &&((r.decision==='okay'&&r.status==='accepted')||(r.decision==='not-okay'&&r.status==='rejected')))
   .map(r=>({batchId:r.batchId,decision:r.decision,feedback:r.feedback,decidedAt:r.decidedAt,createdAt:map.get(r.batchId).createdAt}));
  draw();
 }
 async function action(fn){if(!guard())return;const g=generation;busy=true;notice='';draw();try{await fn(g);check(g);}catch(e){if(g===generation)notice=errorText(e);}finally{if(g===generation){busy=false;draw();}}}
 async function saveRevision(kind,g,restored=null){
  if(!known)throw new Error('Wait for the current configuration.');
  const oldId=currentId,newId=crypto.randomUUID();
  let c=kind==='restore'?configOf({...restored.config,revisionId:newId}):configOf({...composerConfig(),revisionId:newId});
  if(kind==='manual'&&current&&sameConfiguration(current.config,c)){notice='These settings already match the current revision.';return;}
  const record=revisionRecord({config:c,parentRevisionId:oldId,kind,restoredFromRevisionId:restored?.revisionId??null,reason:kind==='restore'?'Owner restored an earlier configuration.':'Owner approved composer settings.'});
  await runTransaction(db,async tx=>{
   const p=await tx.get(pointerRef()),target=ref('autoConfigs',newId);const r=await tx.get(target);check(g);
   if(r.exists()){if(JSON.stringify(r.data())!==JSON.stringify(record))throw new Error('Revision identity conflict.');return;}
   if((snapshot(p)?.revisionId??null)!==oldId)throw new Error('Another configuration was approved. Refresh before saving.');
   tx.set(target,record);tx.set(pointerRef(),{version:1,revisionId:newId,updatedAt:Date.now()});
  });check(g);
  if(kind==='restore')loadIntoComposer(c);
  notice=kind==='restore'?'Restored settings as a new approved revision.':'Configuration saved as a new approved revision.';await fetchRevisions();
 }
 async function requestLearning(g){
  if(!known||!current||evidenceRevision!==currentId||!$('consent').checked||!selectedEvidence.size||selectedEvidence.size>LEARNING_MAX_EVIDENCE||!pcReady()||!session().admissionKnown||admissionOpen(session().admission))throw new Error('Close the previous pilot, select reviewed evidence, authorize learning and wait for the PC.');
  if(!pending)pending=makeLearningRequest({learningId:crypto.randomUUID(),baseRevisionId:currentId,batchIds:[...selectedEvidence],consent:true});
  const request=pending;
  if(request.baseRevisionId!==currentId)throw new Error('The approved configuration changed.');
  const target=ref('autoLearnings',request.learningId);
  if(Date.now()-request.createdAt>240000){
   const previous=await getDocFromServer(target);check(g);
   if(previous.exists()){const v=previous.data();if(v.learningId!==request.learningId||v.baseRevisionId!==request.baseRevisionId||JSON.stringify(v.batchIds)!==JSON.stringify(request.batchIds))throw new Error('Previous request identity conflict.');selectLearning(request.learningId);pending=null;$('consent').checked=false;notice='Previous learning request confirmed.';return;}
   pending=null;throw new Error('Unsubmitted learning request expired. Confirm again.');
  }
  await runTransaction(db,async tx=>{
   const [old,a,p,pc,device]=await Promise.all([tx.get(target),tx.get(admissionRef()),tx.get(pointerRef()),tx.get(ref('status','pc')),tx.get(ref('devices',PC_DEVICE_UID))]);check(g);
   if(old.exists()){
    const v=old.data();if(v.learningId!==request.learningId||v.baseRevisionId!==request.baseRevisionId||JSON.stringify(v.batchIds)!==JSON.stringify(request.batchIds))throw new Error('Learning request identity conflict.');return;
   }
   const state=snapshot(pc);
   if(admissionOpen(snapshot(a))||snapshot(p)?.revisionId!==request.baseRevisionId||!deviceApproved(snapshot(device))||!workerOnline(state)||state.state!=='idle'||state.autoEditReadyAt!==state.updatedAt||!workerHasModel(state,AUTO_EDIT_MODELS.image))throw new Error('PC, configuration or admission changed.');
   tx.set(target,request);tx.set(admissionRef(),{version:1,enabled:true,updatedAt:Date.now(),mode:'learning',learningId:request.learningId,expiresAt:request.createdAt+LEARNING_TTL});
  });check(g);selectLearning(request.learningId);pending=null;$('consent').checked=false;notice='Learning requested. The PC will produce a proposal, not an automatic revision.';await fetchProposals();
 }
 async function closeLearning(g,cancel=false){
  const id=selectedId;
  await runTransaction(db,async tx=>{
   const target=ref('autoLearnings',id),[entry,control]=await Promise.all([tx.get(target),tx.get(admissionRef())]);check(g);
   const v=snapshot(entry),a=snapshot(control);
   if(!v)throw new Error('Learning request is unavailable.');
   if(cancel&&['queued','running'].includes(v.status))tx.update(target,{status:'cancelled',finishedAt:Date.now(),error:'owner-cancelled'});
   else if(!TERMINAL.has(v.status)&&admissionOpen(a))throw new Error('Cancel the active request before closing admission.');
   if(a?.mode==='learning'&&a.learningId===id&&a.enabled===true)tx.set(admissionRef(),{version:1,enabled:false,updatedAt:Date.now()});
  });notice=cancel?'Learning cancelled. No configuration was changed.':'Learning admission closed.';
 }
 function prepareEditor(){
  if(!learningKnown||learning?.status!=='proposed'||learning.decision||!known||currentId!==learning.baseRevisionId||!selectedKeys.size)return;
  const draft=suggestedConfig(current.config,learning.proposal,[...selectedKeys],crypto.randomUUID());
  editor={learningId:selectedId,baseRevisionId:currentId,proposalHash:learning.proposal.evidenceHash,revisionId:draft.revisionId};
  $('instructions').value=draft.instructions;$('guidance').value=draft.visionGuidance;$('editor').hidden=false;draw();
  $('instructions').focus();
 }
 async function decide(g,approve){
  if(!learningKnown||learning?.status!=='proposed'||learning.decision)throw new Error('A confirmed pending proposal is required.');
  const id=selectedId,proposalHash=learning.proposal.evidenceHash;
  let record=null;
  if(approve){
   if(!editor||editor.learningId!==id||editor.baseRevisionId!==currentId||editor.proposalHash!==proposalHash||!known||currentId!==learning.baseRevisionId)throw new Error('The proposal base is no longer current.');
   const c=configOf({...current.config,instructions:$('instructions').value,visionGuidance:$('guidance').value,revisionId:editor.revisionId});
   if(sameConfiguration(current.config,c))throw new Error('There is no configuration change to approve.');
   record=revisionRecord({config:c,parentRevisionId:currentId,kind:'learning',learningId:id,reason:'Owner reviewed and approved local quality suggestions.'});
  }
  await runTransaction(db,async tx=>{
   const target=ref('autoLearnings',id);
   const [entry,p,a]=await Promise.all([tx.get(target),tx.get(pointerRef()),tx.get(admissionRef())]);check(g);
   const value=snapshot(entry),control=snapshot(a);
   if(value?.decision){if(value.decision.kind===(approve?'approved':'rejected')&&(!approve||value.decision.revisionId===record.revisionId))return;throw new Error('This proposal already has a decision.');}
   if(value?.status!=='proposed'||value.proposal?.evidenceHash!==proposalHash)throw new Error('Proposal changed. Reload it.');
   if(approve){
    if(snapshot(p)?.revisionId!==value.baseRevisionId||record.parentRevisionId!==value.baseRevisionId)throw new Error('Current configuration changed. Reject or keep the historical proposal.');
    const next=ref('autoConfigs',record.revisionId),exists=await tx.get(next);check(g);
    if(exists.exists())throw new Error('Revision identity conflict.');
    tx.set(next,record);tx.set(pointerRef(),{version:1,revisionId:record.revisionId,updatedAt:Date.now()});
   }
   tx.update(target,{decision:{kind:approve?'approved':'rejected',revisionId:record?.revisionId??null,decidedAt:Date.now()}});
   if(control?.mode==='learning'&&control.learningId===id&&control.enabled===true)tx.set(admissionRef(),{version:1,enabled:false,updatedAt:Date.now()});
  });check(g);
  if(approve)loadIntoComposer(record.config);
  clearEditor();notice=approve?'Approved as a new configuration revision. Existing batches are unchanged.':'Proposal rejected. Current settings are unchanged.';await fetchRevisions();
 }
 function draw(){
  if(!authorized())return;
  const state=session(),a=state.admission,blocked=busy||state.busy||!context().connected||!navigator.onLine;
  $('current').textContent=current?'Revision '+current.revisionId.slice(0,8):known?'No approved configuration yet.':'Checking current configuration…';
  $('current-meta').textContent=current?date(current.approvedAt)+' · '+(current.kind||'Previous revision'):'';
  buttons('load-current').disabled=blocked||!known||!current;buttons('save-config').disabled=blocked||!known;
  const rows=new Map(revisions.map(r=>[r.revisionId,r]));if(current)rows.set(current.revisionId,current);
  markup($('revisions'),rows.size?[...rows.values()].sort((x,y)=>y.approvedAt-x.approvedAt).map(r=>'<article><div><strong>'+h(r.revisionId.slice(0,8))+(r.revisionId===currentId?' · Current':'')+'</strong><small>'+h(date(r.approvedAt))+' · '+h(r.kind||'Previous revision')+'</small><p>'+h(r.reason||'')+'</p></div><div class="ae-actions"><button type="button" data-al-action="load-revision" data-revision="'+h(r.revisionId)+'" '+(blocked?'disabled':'')+'>Load</button><button type="button" data-al-action="restore" data-revision="'+h(r.revisionId)+'" '+(blocked||!known||r.revisionId===currentId?'disabled':'')+'>Restore</button></div></article>').join(''):'<p class="studio-hint">No saved revisions in this view. Open history or Refresh.</p>');
  buttons('older').hidden=!more;buttons('older').disabled=blocked;
  buttons('evidence').disabled=blocked||!current||Boolean(pending);
  markup($('evidence'),evidence.length?evidence.map(e=>'<label class="al-evidence-row"><input type="checkbox" data-al-evidence="'+h(e.batchId)+'" '+(selectedEvidence.has(e.batchId)?'checked ':'')+(blocked||pending||(!selectedEvidence.has(e.batchId)&&selectedEvidence.size>=LEARNING_MAX_EVIDENCE)?'disabled':'')+'/><span><strong>'+h(e.decision==='okay'?'Okay':'Not Okay')+' · '+h(date(e.decidedAt))+'</strong><small>Batch '+h(e.batchId.slice(0,8))+'</small>'+(e.feedback?'<span>'+h(e.feedback)+'</span>':'')+'</span></label>').join(''):'<p class="studio-hint">'+(evidenceRevision?'No final reviews in the bounded recent history for this revision.':'Load reviewed examples when ready.')+'</p>');
  $('consent').disabled=blocked||Boolean(pending);buttons('learn').disabled=blocked||!known||!current||!state.admissionKnown||admissionOpen(a)||!pcReady()||!selectedEvidence.size||!$('consent').checked;
  const entries=new Map(records.map(r=>[r.id,r]));if(selectedId)entries.set(selectedId,{id:selectedId,status:learning?.status||'loading',createdAt:learning?.createdAt});
  const options='<option value="">Choose a proposal</option>'+[...entries.values()].map(r=>'<option value="'+h(r.id)+'">'+h(date(r.createdAt))+' · '+h(r.status)+'</option>').join('');
  markup(select,options);select.value=selectedId;select.disabled=blocked;
  let proposal='<p class="studio-hint">A requested proposal will appear here. Nothing is applied automatically.</p>',actions='';
  if(learning){
   proposal='<div class="al-proposal-head"><strong>'+h(learning.status)+'</strong><small>'+h(date(learning.createdAt))+' · '+h(learning.batchIds.length)+' review(s)</small></div>';
   if(learning.error)proposal+='<p class="ae-failure">'+h(learning.error)+'</p>';
   if(learning.proposal){
    const p=learning.proposal;
    proposal+='<p class="studio-hint">Evidence revision '+h(learning.baseRevisionId.slice(0,8))+' · local '+h(p.model)+'</p>';
    proposal+=p.evidence.map((e,i)=>'<p class="al-evidence-meta">Example '+(i+1)+' · '+h(e.decision==='okay'?'Okay':'Not Okay')+' · '+h(e.batchId.slice(0,8))+'</p>').join('');
    proposal+=p.recommendations.length?p.recommendations.map(r=>'<article class="al-recommendation"><label><input type="checkbox" data-al-key="'+h(r.key)+'" '+(selectedKeys.has(r.key)?'checked ':'')+(blocked||learning.decision||!learningKnown||currentId!==learning.baseRevisionId?'disabled':'')+'/><strong>'+h(QUALITY_CHANGES[r.key].label)+'</strong></label><small>Example '+(r.evidenceIndex+1)+' · '+h(r.confidence)+' confidence</small><dl><dt>Observation</dt><dd>'+h(r.observation)+'</dd><dt>Hypothesis</dt><dd>'+h(r.hypothesis)+'</dd><dt>Suggested addition</dt><dd>'+h(QUALITY_CHANGES[r.key].text)+'</dd></dl></article>').join(''):'<p>No supported change was proposed.</p>';
    if(p.limitations)proposal+='<p class="studio-hint">Limitations: '+h(p.limitations)+'</p>';
    if(learning.decision)proposal+='<p><strong>Decision: '+h(learning.decision.kind)+'</strong>'+(learning.decision.revisionId?' · revision '+h(learning.decision.revisionId.slice(0,8)):'')+'</p>';
    else{
     if(currentId!==learning.baseRevisionId)proposal+='<p class="studio-hint">This proposal is historical. It cannot overwrite a newer approved revision.</p>';
     actions='<button type="button" data-al-action="prepare" '+(blocked||!learningKnown||!selectedKeys.size||currentId!==learning.baseRevisionId?'disabled':'')+'>Prepare selected changes</button><button type="button" data-al-action="reject" '+(blocked||!learningKnown?'disabled':'')+'>Reject proposal</button>';
    }
   }else if(['queued','running'].includes(learning.status))actions='<button type="button" data-al-action="cancel" '+(blocked||!learningKnown?'disabled':'')+'>Cancel learning</button>';
   if(a?.mode==='learning'&&a.learningId===selectedId&&a.enabled===true&&TERMINAL.has(learning.status))actions+='<button type="button" data-al-action="close" '+(blocked?'disabled':'')+'>Close learning admission</button>';
  }
  markup($('proposal'),proposal);markup($('proposal-actions'),actions);
  $('editor').hidden=!editor||Boolean(learning?.decision);buttons('approve').disabled=blocked||!editor||!learningKnown||currentId!==editor?.baseRevisionId;
  $('instructions').disabled=blocked;$('guidance').disabled=blocked;
  $('message').textContent=notice;
 }
 function lookupRevision(id){return current?.revisionId===id?current:revisions.find(r=>r.revisionId===id);}
 function click(e){
  const button=e.target.closest('[data-al-action]');if(!button||button.disabled)return;
  const k=button.dataset.alAction;
  if(k==='refresh')void action(async g=>{await reconcilePending(g);if(!known){watchPointer?.();watchPointer=null;watchCurrent();}await Promise.all([fetchRevisions(),fetchProposals()]);check(g);});
  else if(k==='older')void action(()=>fetchRevisions(true));
  else if(k==='proposal-history')void action(fetchProposals);
  else if(k==='evidence')void action(fetchEvidence);
  else if(k==='save-config')void action(g=>saveRevision('manual',g));
  else if(k==='restore'){const r=lookupRevision(button.dataset.revision);if(r)void action(g=>saveRevision('restore',g,r));}
  else if(k==='load-current'||k==='load-revision'){const r=k==='load-current'?current:lookupRevision(button.dataset.revision);if(r)void action(async()=>{loadIntoComposer(r.config);notice='Settings loaded as a draft. Choose and authorize an original separately.';});}
  else if(k==='learn')void action(requestLearning);
  else if(k==='cancel'||k==='close')void action(g=>closeLearning(g,k==='cancel'));
  else if(k==='prepare')prepareEditor();
  else if(k==='approve'||k==='reject')void action(g=>decide(g,k==='approve'));
 }
 function change(e){
  const x=e.target;
  if(x===select){if(select.value)selectLearning(select.value);draw();return;}
  if(x.dataset.alEvidence){if(pending)return;const id=x.dataset.alEvidence;if(x.checked&&selectedEvidence.size<LEARNING_MAX_EVIDENCE)selectedEvidence.add(id);else selectedEvidence.delete(id);$('consent').checked=false;}
  if(x.dataset.alKey){if(x.checked)selectedKeys.add(x.dataset.alKey);else selectedKeys.delete(x.dataset.alKey);clearEditor();}
  draw();
 }
 function toggle(e){if(e.target===$('history-details')&&e.target.open&&!revisions.length&&!busy)void action(()=>fetchRevisions());}
 root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('toggle',toggle,true);
 return {
  sync(){
   if(!authorized()){if(started)reset();return;}
   if(!started){started=true;watchCurrent();}
   const a=session().admission,active=learningAdmission(a);
   const activeId=active?.learningId||(a?.enabled===true&&a.mode==='learning'&&isAutoId(a.learningId)?a.learningId:'');
   if(activeId&&activeId!==lastAdmissionId){lastAdmissionId=activeId;selectLearning(activeId);}
   if(!activeId)lastAdmissionId='';
   draw();
  },
  get busy(){return busy;},
  clear:reset,
  destroy(){reset();destroyed=true;root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('toggle',toggle,true);}
 };
}
