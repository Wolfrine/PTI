import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, query, orderBy, limit, setDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const FIREBASE_CONFIG={
  apiKey:'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',
  authDomain:'pti-app-2ab59.firebaseapp.com',
  projectId:'pti-app-2ab59',
  storageBucket:'pti-app-2ab59.firebasestorage.app',
  messagingSenderId:'185802494856',
  appId:'1:185802494856:web:5e9777771492528c6e203d'
};
const fb=initializeApp(FIREBASE_CONFIG);
const auth=getAuth(fb), db=getFirestore(fb), provider=new GoogleAuthProvider();
provider.setCustomParameters({prompt:'select_account'});

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const now=()=>new Date().toISOString();
const ago=value=>{
  if(!value)return '';
  const ms=Date.now()-new Date(value).getTime(), m=Math.max(0,Math.floor(ms/60000));
  if(m<1)return 'now'; if(m<60)return m+'m'; const h=Math.floor(m/60); if(h<24)return h+'h'; return Math.floor(h/24)+'d';
};
const slug=value=>String(value||'entity').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72)||'entity';
const splitLines=value=>String(value||'').split(/\n|,/).map(x=>x.trim()).filter(Boolean).slice(0,20);

let user=null, root=null, currentView='home', selectedId=null;
let state={units:[],entities:[],edges:[],changes:[],inbox:[]};

function toast(message){
  const el=$('#toast'); el.textContent=message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),3200);
}
function setConnected(ok,label){
  $('#connectionDot').classList.toggle('online',ok); $('#connectionText').textContent=label;
}
function textOf(unit,key){
  if(key==='subject')return unit.subject?.map(x=>x.label||x.entityId).join(', ')||'—';
  if(key==='event')return unit.event?.summary||'—';
  if(key==='factors')return unit.factors?.map(x=>x.label||x.entityId).join('\n')||'—';
  if(key==='process')return unit.process?.summary||'—';
  if(key==='output')return unit.outputs?.map(x=>x.label||x.entityId).join('\n')||'—';
  return '—';
}
function makeSearchText(unit){
  return [unit.title,textOf(unit,'subject'),textOf(unit,'event'),textOf(unit,'factors'),textOf(unit,'process'),textOf(unit,'output'),unit.scope?.summary].join(' ').toLowerCase();
}
function contextPacket(unit){
  return {
    schemaVersion:1,unitId:unit.id,title:unit.title,status:unit.status,
    summary:`${textOf(unit,'subject')} — ${textOf(unit,'event')} → ${textOf(unit,'output')}`,
    sefpo:{subject:textOf(unit,'subject'),event:textOf(unit,'event'),factors:textOf(unit,'factors'),process:textOf(unit,'process'),output:textOf(unit,'output')},
    entityRefs:unit.entityRefs||[],evidenceRefs:unit.evidenceRefs||[],
    confidence:unit.confidence??null,scope:unit.scope||{},searchText:unit.searchText||makeSearchText(unit),updatedAt:now()
  };
}
function showView(name){
  currentView=name;
  $$('.view').forEach(x=>x.classList.toggle('active',x.dataset.page===name));
  $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===name));
  const meta={
    home:['KNOWLEDGE SYSTEM','Structured mechanisms, not documents.'],
    explorer:['EXPLORER','Inspect the model and its evidence.'],
    inbox:['CAPTURE','Collect before forcing structure.'],
    review:['VALIDATION','Keep uncertainty explicit.']
  }[name];
  $('#viewEyebrow').textContent=meta[0]; $('#viewTitle').textContent=meta[1];
}
async function login(){
  try{await signInWithPopup(auth,provider)}
  catch(e){
    if(['auth/popup-blocked','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment'].includes(e.code)) return signInWithRedirect(auth,provider);
    toast(String(e.message||e).slice(0,180));
  }
}
async function readCollection(name,{sort='updatedAt',max=200}={}){
  const ref=collection(root,name);
  try{
    const snap=await getDocs(query(ref,orderBy(sort,'desc'),limit(max)));
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){
    console.warn(name,e);
    const snap=await getDocs(query(ref,limit(max)));
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  }
}
async function loadAll(){
  if(!root)return;
  setConnected(false,'Syncing…');
  try{
    const [units,entities,edges,changes,inbox]=await Promise.all([
      readCollection('units'),readCollection('entities'),readCollection('edges'),
      readCollection('changes',{sort:'changedAt',max:40}),readCollection('inbox',{sort:'createdAt',max:100})
    ]);
    state={units,entities,edges,changes,inbox};
    setConnected(true,'Firestore · live');
    render();
  }catch(e){setConnected(false,'Sync failed');toast(String(e.message||e).slice(0,180));}
}
function unitRow(unit){
  const summary=`${textOf(unit,'subject')} · ${textOf(unit,'event')} · ${textOf(unit,'output')}`;
  return `<button class="unit-row ${selectedId===unit.id?'selected':''}" data-unit="${esc(unit.id)}">
    <div><h4>${esc(unit.title||'Untitled unit')}</h4><p>${esc(summary)}</p></div>
    <div class="row-meta"><span class="status ${esc(unit.status||'draft')}">${esc(unit.status||'draft')}</span><span>${esc(ago(unit.updatedAt))}</span></div>
  </button>`;
}
function renderHome(){
  const validated=state.units.filter(x=>x.status==='validated').length, review=state.units.filter(x=>x.status!=='validated').length;
  $('#statUnits').textContent=state.units.length; $('#statValidated').textContent=`${validated} validated`;
  $('#statEntities').textContent=state.entities.length; $('#statEdges').textContent=state.edges.length; $('#statReview').textContent=review;
  if(state.units.length){
    $('#heroLine').textContent=`${state.units.length} empirical unit${state.units.length===1?'':'s'} in the model.`;
    $('#heroSub').textContent=`${validated} validated · ${review} awaiting or carrying review.`;
  }else{
    $('#heroLine').textContent='Nothing has been modelled yet.';
    $('#heroSub').textContent='Capture an observation or create the first structured unit.';
  }
  const recent=state.units.slice(0,7);
  $('#recentUnits').classList.toggle('empty-state',!recent.length);
  $('#recentUnits').innerHTML=recent.length?recent.map(unitRow).join(''):'No units yet.';
  $('#changeList').classList.toggle('empty-state',!state.changes.length);
  $('#changeList').innerHTML=state.changes.length?state.changes.slice(0,9).map(c=>`<div class="change-item"><strong>${esc(c.label||c.change||'Knowledge changed')}</strong><span>${esc(c.objectType||'unit')} · ${esc(ago(c.changedAt))}</span></div>`).join(''):'No changes yet.';
}
function filteredUnits(){
  const needle=$('#searchInput').value.trim().toLowerCase(), status=$('#statusFilter').value;
  return state.units.filter(u=>(status==='all'||u.status===status)&&(!needle||(u.searchText||makeSearchText(u)).includes(needle)));
}
function renderExplorer(){
  const rows=filteredUnits();
  $('#explorerList').classList.toggle('empty-state',!rows.length);
  $('#explorerList').innerHTML=rows.length?rows.map(unitRow).join(''):'No matching knowledge.';
  renderDetail();
}
function renderDetail(){
  const unit=state.units.find(x=>x.id===selectedId);
  if(!unit){
    $('#detailPanel').innerHTML='<div class="detail-empty"><span class="detail-glyph">S→O</span><h3>Select a knowledge unit</h3><p>The canonical SEFPO, evidence, context packet and relations appear here.</p></div>';
    return;
  }
  const evidence=state.edges.filter(e=>e.fromId===unit.id||e.toId===unit.id).length;
  $('#detailPanel').innerHTML=`<div class="detail-head">
      <div><p class="eyebrow">CANONICAL UNIT · R${esc(unit.revision||1)}</p><h2>${esc(unit.title)}</h2><p>Updated ${esc(ago(unit.updatedAt))} · ${Math.round(Number(unit.confidence||0)*100)}% stated confidence</p></div>
      <span class="status ${esc(unit.status||'draft')}">${esc(unit.status||'draft')}</span>
    </div>
    <div class="flow">
      ${[['S','SUBJECT','subject'],['E','EVENT','event'],['F','FACTORS','factors'],['P','PROCESS','process'],['O','OUTPUT','output']].map(([l,n,k])=>`<article class="flow-node"><b>${l}</b><span>${n}</span><p>${esc(textOf(unit,k))}</p></article>`).join('')}
    </div>
    <div class="detail-meta">
      <article class="meta-card"><span>SCOPE / CONDITIONS</span><p>${esc(unit.scope?.summary||'Not specified')}</p></article>
      <article class="meta-card"><span>RETRIEVAL PACKET</span><p>Context packet · ${esc((unit.entityRefs||[]).length)} entities · ${esc((unit.evidenceRefs||[]).length)} evidence refs · ${evidence} graph links</p></article>
    </div>
    <div class="detail-actions">
      ${unit.status!=='validated'?'<button class="secondary" data-status="validated">Validate</button>':''}
      ${unit.status!=='disputed'?'<button class="secondary" data-status="disputed">Mark disputed</button>':''}
      ${unit.status!=='draft'?'<button class="text-button" data-status="draft">Return to draft</button>':''}
    </div>`;
}
function renderInbox(){
  $('#inboxCount').textContent=state.inbox.length;
  $('#inboxList').classList.toggle('empty-state',!state.inbox.length);
  $('#inboxList').innerHTML=state.inbox.length?state.inbox.map(item=>`<article class="inbox-item"><p>${esc(item.text)}</p><footer><span>${esc(item.sourceUrl?'source attached · ':'')}${esc(ago(item.createdAt))}</span><button class="text-button" data-promote="${esc(item.id)}">Structure →</button></footer></article>`).join(''):'Nothing waiting.';
}
function renderReview(){
  const items=state.units.filter(x=>x.status!=='validated');
  $('#reviewList').classList.toggle('empty-state',!items.length);
  $('#reviewList').innerHTML=items.length?items.map(u=>`<article class="review-card" data-review-id="${esc(u.id)}">
    <span class="status ${esc(u.status||'draft')}">${esc(u.status||'draft')}</span>
    <h3>${esc(u.title)}</h3>
    <div class="review-mini">${[['S','subject'],['E','event'],['F','factors'],['P','process'],['O','output']].map(([l,k])=>`<span title="${esc(textOf(u,k))}"><b>${l}</b> ${esc(textOf(u,k))}</span>`).join('')}</div>
    <div class="review-actions"><button class="primary" data-review-status="validated">Validate</button><button class="secondary" data-review-status="disputed">Dispute</button></div>
  </article>`).join(''):'Nothing needs review.';
}
function render(){renderHome();renderExplorer();renderInbox();renderReview();}
function openDialog(prefill={}){
  const form=$('#unitForm'); form.reset(); form.elements.confidence.value='0.50';
  for(const [key,value] of Object.entries(prefill))if(form.elements[key])form.elements[key].value=value;
  $('#unitDialog').showModal();
}
async function createUnit(form){
  if(!root)return;
  const fd=new FormData(form), title=String(fd.get('title')||'').trim(), subject=String(fd.get('subject')||'').trim();
  const event=String(fd.get('event')||'').trim(), factors=splitLines(fd.get('factors')), process=String(fd.get('process')||'').trim();
  const outputs=splitLines(fd.get('output')), evidenceUrl=String(fd.get('evidenceUrl')||'').trim(), scope=String(fd.get('scope')||'').trim();
  if(!title||!subject||!event||!factors.length||!process||!outputs.length)return toast('Complete S, E, F, P and O.');
  const unitRef=doc(collection(root,'units')), unitId=unitRef.id, updatedAt=now();
  const subjectEntity={entityId:slug(subject),label:subject,role:'target'};
  const factorObjects=factors.map(label=>({entityId:slug(label),label,relation:'influences'}));
  const outputObjects=outputs.map(label=>({entityId:slug(label),label,effect:'unspecified'}));
  const entityRefs=[subjectEntity.entityId,...factorObjects.map(x=>x.entityId),...outputObjects.map(x=>x.entityId)];
  const evidenceRef=evidenceUrl?doc(collection(root,'evidence')):null;
  const unit={
    schemaVersion:1,id:unitId,title,subject:[subjectEntity],event:{type:'event',summary:event},
    factors:factorObjects,process:{summary:process,steps:[]},outputs:outputObjects,
    scope:{summary:scope,conditions:[]},confidence:Math.max(0,Math.min(1,Number(fd.get('confidence')||.5))),
    status:'draft',entityRefs,evidenceRefs:evidenceRef?[evidenceRef.id]:[],revision:1,
    createdAt:updatedAt,updatedAt,createdBy:'human-ui',updatedBy:'human-ui'
  };
  unit.searchText=makeSearchText(unit);
  const batch=writeBatch(db);
  batch.set(unitRef,unit);
  batch.set(doc(root,'context',unitId),contextPacket(unit));
  for(const entity of [{id:subjectEntity.entityId,label:subject,role:'subject'},...factorObjects.map(x=>({id:x.entityId,label:x.label,role:'factor'})),...outputObjects.map(x=>({id:x.entityId,label:x.label,role:'output'}))]){
    batch.set(doc(root,'entities',entity.id),{label:entity.label,normalized:entity.label.toLowerCase(),roles:[entity.role],updatedAt},{merge:true});
  }
  if(evidenceRef)batch.set(evidenceRef,{type:'url',url:evidenceUrl,unitId,label:title,stance:'supports',createdAt:updatedAt});
  batch.set(doc(collection(root,'changes')),{objectType:'unit',objectId:unitId,change:'created',label:`Created · ${title}`,revision:1,changedAt:updatedAt,actor:'human-ui'});
  await batch.commit();
  $('#unitDialog').close(); toast('SEFPO draft created.'); selectedId=unitId; await loadAll(); showView('explorer');
}
async function setUnitStatus(unitId,status){
  const unit=state.units.find(x=>x.id===unitId); if(!unit||!root)return;
  const updatedAt=now(), revision=Number(unit.revision||1)+1, batch=writeBatch(db);
  batch.update(doc(root,'units',unitId),{status,updatedAt,revision,updatedBy:'human-ui'});
  batch.set(doc(root,'context',unitId),{status,updatedAt},{merge:true});
  batch.set(doc(collection(root,'changes')),{objectType:'unit',objectId:unitId,change:'status_changed',label:`${unit.title} · ${status}`,revision,changedAt:updatedAt,actor:'human-ui'});
  await batch.commit(); toast(`Marked ${status}.`); await loadAll();
}
async function saveInbox(){
  const text=$('#inboxText').value.trim(); if(!text||!root)return;
  const sourceUrl=$('#inboxSource').value.trim(), ref=doc(collection(root,'inbox'));
  await setDoc(ref,{text,sourceUrl,kind:sourceUrl?'source':'observation',status:'unprocessed',createdAt:now(),createdBy:'human-ui'});
  $('#inboxText').value='';$('#inboxSource').value='';toast('Added to inbox.');await loadAll();
}

$$('[data-view]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();showView(el.dataset.view)}));
$('#signInBtn').addEventListener('click',login);$('#gateSignInBtn').addEventListener('click',login);
$('#signOutBtn').addEventListener('click',()=>signOut(auth));
$('#newUnitBtn').addEventListener('click',()=>openDialog());
$('#closeDialog').addEventListener('click',()=>$('#unitDialog').close());
$('#unitForm').addEventListener('submit',e=>{e.preventDefault();createUnit(e.currentTarget).catch(err=>toast(String(err.message||err).slice(0,180)))});
$('#saveInboxBtn').addEventListener('click',()=>saveInbox().catch(err=>toast(String(err.message||err).slice(0,180))));
$('#searchInput').addEventListener('input',renderExplorer);$('#statusFilter').addEventListener('change',renderExplorer);
document.addEventListener('click',e=>{
  const row=e.target.closest('[data-unit]'); if(row){selectedId=row.dataset.unit;showView('explorer');renderExplorer();return}
  const status=e.target.closest('[data-status]'); if(status&&selectedId){setUnitStatus(selectedId,status.dataset.status).catch(err=>toast(String(err.message||err).slice(0,180)));return}
  const review=e.target.closest('[data-review-status]'); if(review){const card=review.closest('[data-review-id]');setUnitStatus(card.dataset.reviewId,review.dataset.reviewStatus).catch(err=>toast(String(err.message||err).slice(0,180)));return}
  const promote=e.target.closest('[data-promote]'); if(promote){const item=state.inbox.find(x=>x.id===promote.dataset.promote);if(item)openDialog({event:item.text,evidenceUrl:item.sourceUrl||''});}
});
onAuthStateChanged(auth,async next=>{
  user=next;
  $('#signInBtn').classList.toggle('hidden',!!user);$('#signOutBtn').classList.toggle('hidden',!user);$('#newUnitBtn').disabled=!user;
  $('#authGate').classList.toggle('hidden',!!user);$('#appSurface').classList.toggle('hidden',!user);
  if(!user){root=null;state={units:[],entities:[],edges:[],changes:[],inbox:[]};setConnected(false,'Sign in required');return}
  root=doc(db,'users',user.uid,'sefpoData','workspace');
  await setDoc(root,{schemaVersion:1,app:'sefpo-lab',ownerUid:user.uid,updatedAt:now()},{merge:true});
  await loadAll();
});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(console.warn));
