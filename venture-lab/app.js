import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, query, orderBy, limit, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

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
const ago=value=>{if(!value)return '';const ms=Date.now()-new Date(value).getTime(),m=Math.max(0,Math.floor(ms/60000));if(m<1)return 'now';if(m<60)return `${m}m`;const h=Math.floor(m/60);if(h<24)return `${h}h`;return `${Math.floor(h/24)}d`;};
const money=(min,max)=>{const a=Number(min||0),b=Number(max||0);if(!a&&!b)return 'Potential not sized';const fmt=n=>`₹${Math.round(n/1000)}k`;return a&&b?`${fmt(a)}–${fmt(b)}/mo`:a?`${fmt(a)}+/mo`:`Up to ${fmt(b)}/mo`;};

let user=null, root=null, selectedDiscovery=null, selectedOpportunity=null;
let state={discoveries:[],patterns:[],opportunities:[],runs:[]};

function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2800);}
function setSync(ok,label){$('#syncDot').classList.toggle('online',ok);$('#syncText').textContent=label;}
function showView(name){
  $$('.view').forEach(v=>v.classList.toggle('active',v.dataset.page===name));
  $$('.nav-item').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  const meta={
    overview:['DISCOVERY & STUDY','Find where money is already moving.'],
    discoveries:['MARKET INTELLIGENCE','Study signals before inventing solutions.'],
    patterns:['PATTERN LAYER','Connect repeated behaviour across markets.'],
    opportunities:['ENTRY CANDIDATES','Translate evidence into things we could actually do.']
  }[name];
  $('#viewEyebrow').textContent=meta[0];$('#viewTitle').textContent=meta[1];
}
async function login(){
  try{await signInWithPopup(auth,provider)}catch(e){
    if(['auth/popup-blocked','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment'].includes(e.code))return signInWithRedirect(auth,provider);
    toast(String(e.message||e).slice(0,180));
  }
}
async function readCollection(name,{sort='updatedAt',max=250}={}){
  const ref=collection(root,name);
  try{
    const snap=await getDocs(query(ref,orderBy(sort,'desc'),limit(max)));
    return {items:snap.docs.map(d=>({id:d.id,...d.data()})),error:null};
  }catch(firstError){
    console.warn(`Ordered read failed for ${name}`,firstError);
    try{
      const snap=await getDocs(query(ref,limit(max)));
      return {items:snap.docs.map(d=>({id:d.id,...d.data()})),error:firstError};
    }catch(error){
      console.error(`Read failed for ${name}`,error);
      return {items:[],error};
    }
  }
}
async function loadAll(){
  if(!root)return;
  setSync(false,'Syncing…');
  const [discoveries,patterns,opportunities,runs]=await Promise.all([
    readCollection('discoveries'),
    readCollection('patterns'),
    readCollection('opportunities'),
    readCollection('runs',{sort:'startedAt',max:30})
  ]);
  state={discoveries:discoveries.items,patterns:patterns.items,opportunities:opportunities.items,runs:runs.items};
  const failures=[discoveries,patterns,opportunities,runs].filter(x=>x.error);
  try{
    render();
    setSync(failures.length===0,failures.length?`Loaded · ${failures.length} fallback`:'Firestore · synced');
  }catch(error){
    console.error('Venture Lab render failed',error);
    setSync(false,'Render failed');
    toast('Data loaded, but the interface hit a render error.');
  }
}
function tags(items=[]){return items.slice(0,4).map(x=>`<span>${esc(x)}</span>`).join('');}
function discoveryCard(d,index=0){
  const evidence=d.traction||d.evidence||'Evidence not structured yet.';
  const sourceCount=(d.sources||[]).length;
  return `<button class="signal-card ${selectedDiscovery===d.id?'selected':''}" data-discovery="${esc(d.id)}" data-index="${String(index+1).padStart(2,'0')}">
    <div class="signal-top"><span class="kind">${esc((d.kind||'signal').replaceAll('-',' '))}</span><span class="state ${esc(d.status||'new')}">${esc(d.status||'new')}</span></div>
    <h3>${esc(d.title||d.summary||'Untitled signal')}</h3>
    <p>${esc(d.summary&&d.title?d.summary:evidence)}</p>
    <footer><span>${esc(d.market||'Unclassified')} · ${esc(d.geography||'—')}</span><span>${sourceCount?`${sourceCount} source${sourceCount===1?'':'s'} · `:''}${esc(ago(d.updatedAt||d.createdAt))}</span></footer>
  </button>`;
}
function opportunityCard(o,index=0){
  const linked=(o.derivedFrom||[]).length;
  return `<button class="opportunity-card ${selectedOpportunity===o.id?'selected':''}" data-opportunity="${esc(o.id)}" data-index="${String(index+1).padStart(2,'0')}">
    <div class="signal-top"><span class="income">${esc(money(o.monthlyPotentialMin,o.monthlyPotentialMax))}</span><span class="state ${esc(o.status||'candidate')}">${esc(o.status||'candidate')}</span></div>
    <h3>${esc(o.title||'Untitled opportunity')}</h3>
    <p>${esc(o.offer||o.summary||'Offer not structured yet.')}</p>
    <footer><span>${esc(o.customer||'Customer TBD')}</span><span>${linked} evidence link${linked===1?'':'s'} · ${esc(ago(o.updatedAt||o.createdAt))}</span></footer>
  </button>`;
}
function renderOverview(){
  const studied=state.discoveries.filter(x=>x.status==='studied').length;
  const shortlist=state.opportunities.filter(x=>x.status==='shortlist').length;
  const fresh=state.discoveries.filter(x=>x.status==='new').length;
  $('#statDiscoveries').textContent=state.discoveries.length;$('#statNew').textContent=`${fresh} new`;
  $('#statStudied').textContent=studied;$('#statPatterns').textContent=state.patterns.length;$('#statShortlist').textContent=shortlist;

  const latest=state.discoveries.slice(0,5);$('#latestDiscoveries').classList.toggle('empty-state',!latest.length);$('#latestDiscoveries').innerHTML=latest.length?latest.map((d,i)=>discoveryCard(d,i)).join(''):'No discoveries yet.';
  const short=state.opportunities.filter(x=>x.status==='shortlist').slice(0,3);$('#shortlistList').classList.toggle('empty-state',!short.length);$('#shortlistList').innerHTML=short.length?short.map((o,i)=>`<button class="shortlist-feature" data-opportunity="${esc(o.id)}"><span class="shortlist-rank">0${i+1} / SHORTLIST</span><strong class="shortlist-money">${esc(money(o.monthlyPotentialMin,o.monthlyPotentialMax))}</strong><b>${esc(o.title)}</b><small>${esc((o.derivedFrom||[]).length)} linked signals · ${esc(o.customer||'buyer defined')}</small><i>Open entry dossier →</i></button>`).join(''):'Nothing shortlisted yet.';
  const patterns=state.patterns.slice(0,5);$('#patternPreview').classList.toggle('empty-state',!patterns.length);$('#patternPreview').innerHTML=patterns.length?patterns.map(p=>`<button data-pattern-view><b>${esc(p.title)}</b><span>${esc((p.discoveryIds||[]).length)} linked signals · ${esc(p.tags?.[0]||'synthesis')}</span></button>`).join(''):'Patterns will emerge as studies accumulate.';
  const latestRun=state.runs[0];
  if(latestRun){$('#runStatus').innerHTML=`<span>LAST RUN</span><strong>${esc(latestRun.status||'completed')} · ${esc(ago(latestRun.completedAt||latestRun.startedAt))}</strong>`;}
}
function filteredDiscoveries(){const q=$('#discoverySearch').value.trim().toLowerCase(),s=$('#discoveryStatus').value;return state.discoveries.filter(d=>(s==='all'||(d.status||'new')===s)&&(!q||JSON.stringify(d).toLowerCase().includes(q)));}
function renderDiscoveries(){const rows=filteredDiscoveries();$('#discoveryList').classList.toggle('empty-state',!rows.length);$('#discoveryList').innerHTML=rows.length?rows.map((d,i)=>discoveryCard(d,i)).join(''):'No matching discoveries.';document.querySelector('.workspace')?.classList.toggle('has-selection',!!selectedDiscovery);renderDiscoveryDetail();}
function renderDiscoveryDetail(){
  const d=state.discoveries.find(x=>x.id===selectedDiscovery);if(!d){$('#discoveryDetail').innerHTML='<div class="detail-empty"><b>Signal → Study</b><p>Select a market signal. Its evidence, buyer, traction and our angle will open as a research dossier.</p></div>';return;}
  const sources=(d.sources||[]).length?d.sources:(d.sourceUrl?[{url:d.sourceUrl,title:'Primary source',publisher:'source'}]:[]);
  const proof=sources.length?`<div class="proof-block"><span>SOURCE EVIDENCE · ${sources.length}</span><div class="proof-list">${sources.map(s=>`<div class="proof-item"><b>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title||s.publisher||'Source')} ↗</a>`:esc(s.title||s.publisher||'Source')}</b><small>${esc([s.publisher,s.publishedAt,s.evidenceType].filter(Boolean).join(' · '))}</small></div>`).join('')}</div></div>`:'';
  $('#discoveryDetail').innerHTML=`<div class="dossier-head signal"><div class="dossier-meta"><p class="eyebrow">${esc((d.kind||'signal').toUpperCase())} · ${esc(d.market||'UNCLASSIFIED')}</p><span class="state ${esc(d.status||'new')}">${esc(d.status||'new')}</span></div><h2>${esc(d.title||d.summary||'Untitled signal')}</h2><p>${esc(d.geography||'—')} · updated ${esc(ago(d.updatedAt||d.createdAt))}</p></div>
    <div class="study-grid">
      <article><span>WHAT IS HAPPENING</span><p>${esc(d.summary||'Not structured yet.')}</p></article>
      <article><span>WHO PAYS</span><p>${esc(d.whoPays||'Not studied yet.')}</p></article>
      <article><span>MONETISATION</span><p>${esc(d.monetization||'Not studied yet.')}</p></article>
      <article><span>TRACTION / EVIDENCE</span><p>${esc(d.traction||d.evidence||'Not studied yet.')}</p></article>
      <article><span>WHY NOW</span><p>${esc(d.whyNow||'Not studied yet.')}</p></article>
      <article><span>ACQUISITION</span><p>${esc(d.acquisition||'Not studied yet.')}</p></article>
      <article class="full"><span>OUR ANGLE — INTERPRETATION, NOT SOURCE FACT</span><p>${esc(d.ourAngle||d.initialThought||'No angle derived yet.')}</p></article>
    </div>
    ${proof}
    <div class="detail-actions"><span>${sources.length} source${sources.length===1?'':'s'} attached</span><div>${d.status!=='studied'?'<button class="secondary" data-discovery-status="studied">Mark studied</button>':''}${d.status!=='dismissed'?'<button class="text-button danger" data-discovery-status="dismissed">Dismiss</button>':''}</div></div>`;
}
function renderPatterns(){
  $('#patternGrid').classList.toggle('empty-state',!state.patterns.length);
  $('#patternGrid').innerHTML=state.patterns.length?state.patterns.map(p=>`<article class="pattern-card"><div class="pattern-count">${esc((p.discoveryIds||[]).length||'—')}<small>SIGNALS</small></div><div><p class="eyebrow">CROSS-SIGNAL THESIS</p><h3>${esc(p.title||'Untitled pattern')}</h3><p>${esc(p.thesis||p.summary||'')}</p><div class="pattern-meta">${tags(p.tags||[])}</div></div><div class="pattern-implication"><span>COMMERCIAL IMPLICATION</span><p>${esc(p.implication||'Not derived yet.')}</p></div></article>`).join(''):'No patterns yet.';
}
function filteredOpportunities(){const q=$('#opportunitySearch').value.trim().toLowerCase(),s=$('#opportunityStatus').value;return state.opportunities.filter(o=>(s==='all'||(o.status||'candidate')===s)&&(!q||JSON.stringify(o).toLowerCase().includes(q)));}
function renderOpportunities(){const rows=filteredOpportunities();$('#opportunityList').classList.toggle('empty-state',!rows.length);$('#opportunityList').innerHTML=rows.length?rows.map((o,i)=>opportunityCard(o,i)).join(''):'No matching opportunities.';document.querySelector('.opportunity-layout')?.classList.toggle('has-selection',!!selectedOpportunity);renderOpportunityDetail();}
function renderOpportunityDetail(){
  const o=state.opportunities.find(x=>x.id===selectedOpportunity);if(!o){$('#opportunityDetail').innerHTML='<div class="detail-empty"><b>Evidence → Entry</b><p>Select an entry to inspect its buyer, offer, repeatability, route to market and provenance.</p></div>';return;}
  const provenance=(o.derivedFrom||[]).map(id=>state.discoveries.find(d=>d.id===id)).filter(Boolean);
  const proof=provenance.length?`<div class="proof-block"><span>DERIVED FROM · ${provenance.length} MARKET SIGNAL${provenance.length===1?'':'S'}</span><div class="proof-list">${provenance.map(d=>`<div class="proof-item"><b>${esc(d.title||d.summary||d.id)}</b><small>${esc(d.market||'signal')} · ${(d.sources||[]).length} source${(d.sources||[]).length===1?'':'s'}</small></div>`).join('')}</div></div>`:'';
  $('#opportunityDetail').innerHTML=`<div class="dossier-head opportunity"><div class="dossier-meta"><p class="eyebrow">ENTRY CANDIDATE · ${esc(money(o.monthlyPotentialMin,o.monthlyPotentialMax))}</p><span class="state ${esc(o.status||'candidate')}">${esc(o.status||'candidate')}</span></div><h2>${esc(o.title)}</h2><p>${esc(o.summary||'Evidence-derived income route')}</p></div>
    <div class="study-grid">
      <article><span>CUSTOMER</span><p>${esc(o.customer||'Not defined yet.')}</p></article>
      <article><span>OFFER</span><p>${esc(o.offer||'Not defined yet.')}</p></article>
      <article><span>REPEATABILITY</span><p>${esc(o.repeatability||o.steadyIncomePath||'Not assessed yet.')}</p></article>
      <article><span>HOW WE REACH BUYERS</span><p>${esc(o.acquisition||'Not assessed yet.')}</p></article>
      <article><span>WHY US / ENTRY</span><p>${esc(o.ourLeverage||o.entryReason||'Not assessed yet.')}</p></article>
      <article><span>MARKET PROOF</span><p>${esc(o.evidence||'Evidence not linked yet.')}</p></article>
      <article class="full"><span>RISKS / OPEN QUESTIONS</span><p>${esc(o.risks||'Not assessed yet.')}</p></article>
    </div>
    ${proof}
    <div class="detail-actions"><span>${provenance.length} linked signal${provenance.length===1?'':'s'} · proof kept adjacent to the claim</span><div>${o.status!=='shortlist'?'<button class="primary" data-opportunity-status="shortlist">Shortlist</button>':''}${o.status!=='parked'?'<button class="secondary" data-opportunity-status="parked">Park</button>':''}${o.status!=='rejected'?'<button class="text-button danger" data-opportunity-status="rejected">Reject</button>':''}</div></div>`;
}
function render(){renderOverview();renderDiscoveries();renderPatterns();renderOpportunities();}
async function updateDiscoveryStatus(status){if(!selectedDiscovery||!root)return;await updateDoc(doc(root,'discoveries',selectedDiscovery),{status,updatedAt:now(),updatedBy:'human-ui'});toast(`Discovery marked ${status}.`);await loadAll();}
async function updateOpportunityStatus(status){if(!selectedOpportunity||!root)return;await updateDoc(doc(root,'opportunities',selectedOpportunity),{status,updatedAt:now(),updatedBy:'human-ui'});toast(`Opportunity marked ${status}.`);await loadAll();}
async function captureSignal(form){
  if(!root)return;const fd=new FormData(form),summary=String(fd.get('summary')||'').trim();if(!summary)return;
  const ref=doc(collection(root,'discoveries')),createdAt=now();
  await setDoc(ref,{title:summary.slice(0,120),summary,kind:String(fd.get('kind')||'market-signal'),market:String(fd.get('market')||'').trim(),geography:String(fd.get('geography')||'').trim(),sourceUrl:String(fd.get('sourceUrl')||'').trim(),initialThought:String(fd.get('initialThought')||'').trim(),status:'new',origin:'human',createdAt,updatedAt:createdAt,createdBy:'human-ui',updatedBy:'human-ui'});
  $('#captureDialog').close();form.reset();toast('Market signal captured.');await loadAll();showView('discoveries');selectedDiscovery=ref.id;renderDiscoveries();
}

$$('[data-view]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();showView(el.dataset.view)}));
$('#signInBtn').addEventListener('click',login);$('#gateSignInBtn').addEventListener('click',login);$('#signOutBtn').addEventListener('click',()=>signOut(auth));
$('#captureBtn').addEventListener('click',()=>$('#captureDialog').showModal());$('#closeCapture').addEventListener('click',()=>$('#captureDialog').close());
$('#captureForm').addEventListener('submit',e=>{e.preventDefault();captureSignal(e.currentTarget).catch(err=>toast(String(err.message||err).slice(0,180)));});
$('#discoverySearch').addEventListener('input',renderDiscoveries);$('#discoveryStatus').addEventListener('change',renderDiscoveries);$('#opportunitySearch').addEventListener('input',renderOpportunities);$('#opportunityStatus').addEventListener('change',renderOpportunities);
document.addEventListener('click',e=>{
  const d=e.target.closest('[data-discovery]');if(d){selectedDiscovery=d.dataset.discovery;showView('discoveries');renderDiscoveries();if(innerWidth<=820)requestAnimationFrame(()=>$('#discoveryDetail').scrollIntoView({block:'start'}));return;}
  const o=e.target.closest('[data-opportunity]');if(o){selectedOpportunity=o.dataset.opportunity;showView('opportunities');renderOpportunities();if(innerWidth<=820)requestAnimationFrame(()=>$('#opportunityDetail').scrollIntoView({block:'start'}));return;}
  const ds=e.target.closest('[data-discovery-status]');if(ds){updateDiscoveryStatus(ds.dataset.discoveryStatus).catch(err=>toast(String(err.message||err).slice(0,180)));return;}
  const os=e.target.closest('[data-opportunity-status]');if(os){updateOpportunityStatus(os.dataset.opportunityStatus).catch(err=>toast(String(err.message||err).slice(0,180)));}
});

onAuthStateChanged(auth,async next=>{
  user=next;$('#signInBtn').classList.toggle('hidden',!!user);$('#signOutBtn').classList.toggle('hidden',!user);$('#captureBtn').classList.toggle('hidden',!user);$('#captureBtn').disabled=!user;$('#authGate').classList.toggle('hidden',!!user);$('#appSurface').classList.toggle('hidden',!user);
  if(!user){root=null;state={discoveries:[],patterns:[],opportunities:[],runs:[]};setSync(false,'Sign in required');return;}
  root=doc(db,'users',user.uid,'ventureData','workspace');
  await loadAll();
  setDoc(root,{schemaVersion:1,app:'venture-lab',objective:'Find realistic entry opportunities with credible steady monthly income.',incomeFloorMonthly:10000,incomeTargetMonthly:20000,geography:'india-global',discoveryScope:'broad',updatedAt:now()},{merge:true}).catch(error=>console.warn('Workspace metadata update skipped',error));
});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(console.warn));
