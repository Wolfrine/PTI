import { TOPICS, DEFAULT_SETTINGS, safeUrl, validateSettings } from './core.mjs';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = v => { const d = new Date(v); return Number.isNaN(d.valueOf()) ? 'Date unavailable' : d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}); };
let state = { settings: structuredClone(DEFAULT_SETTINGS), captures:[], threads:[], feedback:[], runs:[], edition:null, paused:false, preferenceVersion:1 };
let user = null, demo = false, view = 'today', fb, auth, db, error = '', activeThread = null, noticeTimer, busy = false, authEpoch = 0;
const config = {apiKey:'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',authDomain:'pti-app-2ab59.firebaseapp.com',projectId:'pti-app-2ab59',storageBucket:'pti-app-2ab59.firebasestorage.app',messagingSenderId:'185802494856',appId:'1:185802494856:web:5e9777771492528c6e203d'};
function notice(text) { clearTimeout(noticeTimer); $('#notice').textContent = text; noticeTimer = setTimeout(()=>$('#notice').textContent='',6500); }
function errorText(e) { return e?.code === 'permission-denied' ? 'Access was denied. Your data was not loaded or saved.' : String(e?.message || e).slice(0,350); }
function checked(p) { return p ? ' checked' : ''; }
function banner() { return `${demo?'<div class="banner demo">Sample mode · fictional examples · changes last only for this session. <button class="text-btn" data-action="exit-demo">Exit sample</button></div>':''}${error?`<div class="banner" role="alert">${esc(error)} <button class="text-btn" data-action="refresh">Retry</button></div>`:''}${!navigator.onLine?'<div class="banner">Offline. The app shell is available; cloud content and saving require a connection. Unsaved text stays in this open page.</div>':''}`; }
function welcome() {
 $('#app').innerHTML = `<div class="welcome"><a class="brand" href="/"><span class="mark" aria-hidden="true"></span>Personal <span class="eyebrow">/ PTI</span></a><main id="main" class="welcome-grid"><section><div class="eyebrow">A space that follows your direction</div><h1>A little signal.<br><em>Room to think.</em></h1><p>A finite collection of what matters. A place to keep your thoughts. Questions that continue beyond the feed.</p><div class="actions"><button class="primary" data-action="login">Continue with Google</button><button class="secondary" data-action="demo">Explore a sample</button></div><p class="hint">Google is used for sign-in. Your content is stored in your private Firebase workspace, not in the public repository. No advertising analytics or in-app AI calls.</p>${error?`<p class="form-error" role="alert">${esc(error)}</p>`:''}</section><aside class="welcome-aside"><article><div class="eyebrow">01 / Today</div><h2>Enough to be informed.</h2><p>Five items. Original sources. A reason for each selection. Then an end to the collection.</p></article><article><div class="eyebrow">02 / Capture</div><h2>Keep your side of the story.</h2><p>A thought, a useful link, a question. Your response is part of the material—not just a click.</p></article><article><div class="eyebrow">03 / Threads</div><h2>Let an idea continue.</h2><p>Connect what you read to a question you care about. Keep the evidence and your interpretation distinct.</p></article></aside></main><footer>You choose the direction. Feedback can refine selection—not silently change your goals.<br>PTI personal harness · First release</footer></div>`;
}
function render() {
 if (!user && !demo) return welcome();
 const when = new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'});
 $('#app').innerHTML = `<div class="shell"><aside class="rail"><a class="brand" href="#today"><span class="mark" aria-hidden="true"></span>Personal</a><nav class="nav" aria-label="Main navigation">${[['today','Today'],['capture','Capture'],['threads','Threads']].map(([v,label],i)=>`<button data-view="${v}"${view===v?' aria-current="page"':''}><span>0${i+1}</span>${label}</button>`).join('')}</nav><div class="rail-bottom"><p class="rail-note">Your attention.<br>Your direction.</p><button class="text-btn" data-view="settings">Direction & privacy</button><span class="eyebrow">Built within PTI</span></div></aside><div class="content"><header class="topbar"><a href="#today" class="brand mobile-brand"><span class="mark" aria-hidden="true"></span>Personal</a><span class="eyebrow">${esc(when)}</span><div class="actions"><span class="status"><span class="dot"></span>${demo?'Sample':state.paused?'Curation paused':'Private workspace'}</span><button class="small-btn" data-view="settings" aria-label="Direction and privacy">Settings</button></div></header><main id="main">${banner()}${view==='today'?today():view==='capture'?capture():view==='threads'?threads():settings()}</main></div></div>`;
}
function intro(kicker,title,description,aside='') { return `<div class="intro"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${aside}</div>`; }
function today() {
 const edition = state.edition;
 const stale = edition && Date.now()-Date.parse(edition.publishedAt)>36*3600000;
 return intro('Your daily collection','Today, with intent.','Follow what matters. Leave room for your own thoughts.',edition?`<div class="count">05<small>then, a little space</small></div>`:'')+`${stale?'<div class="banner">This edition is older than 36 hours. It is retained until a new valid edition is published.</div>':''}<div class="layout"><section><div class="section-label"><span class="eyebrow">${edition?`${date(edition.publishedAt)} · ${edition.method==='agent-reviewed'?'Agent-reviewed':demo?'Fictional sample':'Source-ranked'}`:'No published edition yet'}</span><button class="text-btn" data-action="refresh">Refresh</button></div>${edition?edition.items.map(story).join('')+'<div class="end">That’s the collection.<br>What stayed with you?</div>':`<div class="empty"><h2>Your collection starts here.</h2><p>No edition has been published yet. Set your direction, capture a question, or check the run history. This screen does not substitute sample stories for live content.</p><button class="primary" data-view="settings">Set your direction</button></div>`}</section><aside class="side"><section><div class="eyebrow">You choose</div><h2>Your direction</h2>${state.settings.topics.map(t=>`<span class="topic">${esc(t)}</span>`).join('')}<p>${state.settings.geography==='balanced'?'India + global, balanced where sources permit.':state.settings.geography==='india'?'India-focused selection.':'Global-focused selection.'}</p>${state.settings.direction?`<p>${esc(state.settings.direction)}</p>`:''}<button class="side-action" data-view="settings">Edit direction →</button></section><section><div class="eyebrow">Keep it going</div><h2>A thought worth keeping?</h2><p>Save your response, or connect it to an open question.</p><button class="side-action" data-view="capture">Capture a thought →</button></section><section><div class="eyebrow">Visible, not mysterious</div><h2>How this was selected</h2><p>${esc(edition?.explanation || 'No publication has completed.')}</p><button class="side-action" data-action="runs">View run history →</button></section></aside></div>`;
}
function story(item,i) {
 const reaction = state.feedback.find(f=>f.itemId===item.id)?.reaction;
 const url = safeUrl(item.url);
 return `<article class="story ${i===0?'lead':''}"><div class="story-meta"><span class="number">0${i+1}</span><span>${esc(item.topic)}</span><span>·</span><span>${item.region==='india'?'India-focused source':'Global source'}</span><span>· ${date(item.publishedAt)}</span></div><h2>${esc(item.title)}</h2><p>${esc(item.summary)}</p><p class="why"><strong>Why here:</strong> ${esc(item.why)}</p><div class="story-footer">${url?`<a class="source" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.source)} ↗</a>`:`<span class="source">${esc(item.source)} · not a news report</span>`}<button class="text-btn source" data-note="${esc(item.id)}">Add a thought</button><div class="reaction-group" aria-label="Feedback for item ${i+1}">${[['useful','Useful'],['known','Already knew'],['less','Less of this'],['explore','Explore']].map(([key,label])=>`<button class="reaction" data-react="${key}" data-id="${esc(item.id)}" aria-pressed="${reaction===key}">${label}</button>`).join('')}</div></div></article>`;
}
function capture() {
 return intro('Your side of the loop','What’s on your mind?','Keep a thought before organising it. Connections can come later.')+`<form id="capture-form" class="form"><label for="thought">Your thought<textarea class="thought" id="thought" name="text" maxlength="12000" required placeholder="Something I noticed. A question I want to return to…"></textarea></label><div class="two"><label>Kind<select name="kind"><option value="thought">Thought</option><option value="question">Question</option><option value="link">Link</option></select></label><label>Connect to a thread<select name="threadId"><option value="">No thread yet</option>${state.threads.map(t=>`<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('')}</select></label></div><label>Source link (optional)<input name="url" type="url" maxlength="2000" placeholder="https://…"></label><div class="actions"><button class="primary" type="submit">Keep this thought</button><span class="hint">${demo?'Sample session only.':'Private to you. Captures are not shared with the news agent.'}</span></div></form><section class="records"><div class="section-label"><span class="eyebrow">Recent captures · ${state.captures.length}</span></div>${state.captures.length?state.captures.map(record).join(''):'<p class="hint">No captures yet. A single sentence is enough.</p>'}</section>`;
}
function record(c) {
 const thread = state.threads.find(t=>t.id===c.threadId); const url = safeUrl(c.url);
 return `<article class="record"><div class="record-text"><span class="eyebrow">${esc(c.kind || 'thought')} · ${date(c.createdAt)}</span><p>${esc(c.text)}</p>${thread?`<p class="hint">In: ${esc(thread.title)}</p>`:''}${c.articleTitle?`<p class="hint">On: ${esc(c.articleTitle)}</p>`:''}${url?`<a class="source" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>`:''}</div><button class="delete" data-delete="captures" data-id="${esc(c.id)}" aria-label="Delete capture">Delete</button></article>`;
}
function threads() {
 const chosen = state.threads.find(t=>t.id===activeThread);
 return intro('Questions that continue','Follow a thread.','Keep a question, its evidence and your evolving thoughts together.')+`<button class="primary" data-action="new-thread">Start a thread</button>${chosen?`<section class="records"><button class="text-btn" data-action="all-threads">← All threads</button><h2>${esc(chosen.title)}</h2><p class="hint">${chosen.shareWithAgent?'This question is shared with your news agent.':'Private question. Not included in agent context.'}</p>${state.captures.filter(c=>c.threadId===chosen.id).map(record).join('') || '<p class="hint">No linked captures yet. Use Capture and select this thread.</p>'}</section>`:`<section class="records">${state.threads.map((t,i)=>`<article class="record"><div class="record-text"><div class="eyebrow">${String(i+1).padStart(2,'0')} / ${t.shareWithAgent?'Shared question':'Private question'}</div><h2><button class="open-thread" data-thread="${esc(t.id)}">${esc(t.title)}</button></h2><span class="hint">${state.captures.filter(c=>c.threadId===t.id).length} linked thoughts · ${date(t.createdAt)}</span></div><button class="delete" data-delete="threads" data-id="${esc(t.id)}">Delete</button></article>`).join('') || '<div class="empty"><h2>A question is a good beginning.</h2><p>Start with something you would like to understand, make, or reconsider.</p></div>'}</section>`}`;
}
function settings() {
 return intro('Your controls','Direction, not prediction.','You decide what belongs here. Selection adapts within these boundaries.')+`<form id="settings-form" class="form"><label>Areas to include</label><div class="chips">${TOPICS.map(t=>`<label><input type="checkbox" name="topics" value="${esc(t)}"${checked(state.settings.topics.includes(t))}>${esc(t)}</label>`).join('')}</div><label>Geographic focus<select name="geography">${[['balanced','India + global'],['india','India-focused'],['global','Global-focused']].map(([v,l])=>`<option value="${v}"${state.settings.geography===v?' selected':''}>${l}</option>`).join('')}</select></label><label>Your direction for an external reviewing agent<textarea name="direction" maxlength="2000" placeholder="What would make this collection more useful to you?">${esc(state.settings.direction)}</textarea></label><p class="hint">The source collector uses topics and explicit feedback. It does not interpret this free text or claim to understand your behaviour.</p><button class="primary" type="submit">Save direction</button></form><div class="form"><section class="settings-section"><h2>Curation & feedback</h2><p class="hint">${state.paused?'Curation is paused. Your existing content remains available.':'Daily source collection is scheduled for approximately 8:00 AM India time. A schedule is not a guarantee: check actual run history.'} ${state.feedback.length} explicit feedback records. No passive tracking.</p><div class="actions"><button class="secondary" data-action="pause">${state.paused?'Resume curation':'Pause curation'}</button><button class="small-btn" data-action="runs">Run history</button><button class="small-btn" data-action="clear-feedback">Reset feedback</button></div></section><section class="settings-section"><h2>External agent connection</h2><p class="hint">An optional 30-day key gives an external agent access only to this account’s news preferences, feedback, opted-in question titles, and edition publishing. Captures are excluded. A connector must be configured separately; generating a key does not connect ChatGPT.</p><div class="actions"><button class="secondary" data-action="token">Create agent key</button><button class="small-btn" data-action="revoke">Revoke agent key</button></div></section><section class="settings-section"><h2>Your data</h2><p class="hint">Stored in an isolated database inside the existing PTI Firebase project. Firebase and authorised execution infrastructure process the data; this is not end-to-end encryption. Personal content is not cached by the service worker.</p><div class="actions"><button class="secondary" data-action="export">Export all data</button><button class="small-btn danger" data-action="reset">Delete this workspace</button><button class="small-btn" data-action="logout">${demo?'Exit sample':'Sign out'}</button></div></section></div>`;
}
async function loadFirebase() {
 if (fb) return;
 const [a,b,c] = await Promise.all([import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')]);
 fb = {...a,...b,...c}; const app = fb.initializeApp(config,'personal'); auth = fb.getAuth(app); db = fb.getFirestore(app,'personal');
 // Session-only Firebase auth. No persistent Firestore cache on shared devices.
 await fb.setPersistence(auth,fb.browserSessionPersistence);
 fb.onAuthStateChanged(auth, async next => {
   const epoch = ++authEpoch;
   if (demo) return;
   user = next; error = '';
   if (!next) { state = {settings:structuredClone(DEFAULT_SETTINGS),captures:[],threads:[],feedback:[],runs:[],edition:null,paused:false}; render(); return; }
   try { await loadState(epoch); } catch(e) { if(epoch===authEpoch) error = errorText(e); }
   if(epoch===authEpoch) render();
 });
}
async function loadState(epoch = authEpoch) {
 if (demo || !user) return;
 const uid = user.uid, root = fb.doc(db,'users',uid);
 let profile = await fb.getDoc(root);
 if (!profile.exists()) { await fb.setDoc(root,{settings:structuredClone(DEFAULT_SETTINGS),paused:false,preferenceVersion:1,generation:crypto.randomUUID(),updatedAt:new Date().toISOString()}); profile = await fb.getDoc(root); }
 const read = async (name,cap=100) => (await fb.getDocs(fb.query(fb.collection(root,name),fb.orderBy('createdAt','desc'),fb.limit(cap)))).docs.map(d=>({...d.data(),id:d.id}));
 const [captures,threads,feedback,runs,editions,catalog] = await Promise.all([read('captures'),read('threads'),read('feedback',200),read('runs',20),read('editions',1),fb.getDoc(fb.doc(db,'catalog','current'))]);
 if(epoch!==authEpoch || user?.uid!==uid) return;
 state = {...profile.data(),captures,threads,feedback,runs,edition:editions[0] || (catalog.exists()?catalog.data():null)};
 error = '';
}
async function put(bucket,id,data) {
 if (demo) { const list=state[bucket]; const old=list.findIndex(x=>x.id===id); if(old>=0) list[old]={...data,id}; else list.unshift({...data,id}); return; }
 if (!navigator.onLine) throw new Error('Offline: not saved. Keep this page open and retry when connected.');
 await fb.setDoc(fb.doc(db,'users',user.uid,bucket,id),data);
 const list=state[bucket]; const old=list.findIndex(x=>x.id===id); if(old>=0) list[old]={...data,id}; else list.unshift({...data,id});
}
async function remove(bucket,id) {
 if (!demo) await fb.deleteDoc(fb.doc(db,'users',user.uid,bucket,id));
 state[bucket]=state[bucket].filter(x=>x.id!==id);
}
async function saveProfile(patch) {
 if (!demo) await fb.updateDoc(fb.doc(db,'users',user.uid),{...patch,updatedAt:new Date().toISOString()});
 Object.assign(state,patch);
}
async function control(action,method='POST') {
 if (demo) throw new Error('Agent credentials and cloud actions are disabled in sample mode.');
 const response = await fetch(`/api/${action}`,{method,headers:{Authorization:`Bearer ${await user.getIdToken()}`,'Content-Type':'application/json'},body:method==='POST'?'{}':undefined});
 const result = await response.json(); if(!response.ok) throw new Error(result.error || 'The server could not complete this action.'); return result;
}
function openDialog(html) { const d=$('#dialog'); d.innerHTML=html; d.showModal(); }
async function act(action) {
 if(action==='login') { error=''; try { await loadFirebase(); await fb.signInWithPopup(auth,new fb.GoogleAuthProvider()); } catch(e) { error=errorText(e); render(); } return; }
 if(action==='demo') { ++authEpoch; demo=true; user=null; state=(await import('./demo.mjs')).demoState(); view='today'; error=''; render(); return; }
 if(['exit-demo','logout'].includes(action)) { ++authEpoch; if(auth?.currentUser) await fb.signOut(auth); demo=false;user=null;view='today';state={settings:structuredClone(DEFAULT_SETTINGS),captures:[],threads:[],feedback:[],runs:[],edition:null};history.replaceState(null,'','/');render();return; }
 if(action==='refresh') { await loadState(); error='';render();return; }
 if(action==='pause') { await saveProfile({paused:!state.paused});render();return; }
 if(action==='all-threads') {activeThread=null;render();return;}
 if(action==='runs') { openDialog(`<h2>Run history</h2><p class="hint">Only completed execution records establish that a run happened.</p>${state.runs.length?state.runs.map(r=>`<div class="run"><strong>${esc(r.status)}</strong> · ${date(r.createdAt)}<br>${esc(r.message || '')}<br><span class="hint">${esc(r.method || '')}</span></div>`).join(''):'<p>No personal run has been recorded yet. A shared source edition may be shown until the first personal run.</p>'}<form method="dialog"><button class="secondary">Close</button></form>`);return; }
 if(action==='new-thread') {openDialog(`<h2>Start with a question.</h2><form id="thread-form" class="form"><label>Your question<input name="title" required maxlength="300" placeholder="What would I like to understand?"></label><label class="hint"><span><input type="checkbox" name="share"> Share this question’s title with the news agent</span></label><div class="actions"><button class="primary">Start thread</button><button class="secondary" type="button" data-action="close">Cancel</button></div></form>`);return;}
 if(action==='close') {$('#dialog').close();return;}
 if(action==='clear-feedback') {if(!confirm('Delete all explicit feedback and reset source selection adjustments?'))return;if(demo)state.feedback=[];else await control('feedback','DELETE');state.feedback=[];render();notice('Feedback reset. Future runs will not use the deleted records.');return;}
 if(action==='export') {const data=demo?state:await control('export','GET');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`personal-export-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 if(action==='token') {const r=await control('token');openDialog(`<h2>Agent key — shown once</h2><p class="hint">Keep this secret. Do not commit it or share screenshots. Creating another key revokes this one.</p><label class="hint">MCP endpoint</label><pre>${esc(location.origin+'/mcp')}</pre><label class="hint">Authorization: Bearer</label><pre>${esc(r.token)}</pre><p class="hint">Expires ${esc(r.expiresAt)}. Connection to an external agent is not configured automatically.</p><form method="dialog"><button class="primary">I have saved the key</button></form>`);return;}
 if(action==='revoke') {await control('token','DELETE');notice('Agent key revoked.');return;}
 if(action==='reset') {if(!confirm('Permanently delete this app’s captures, threads, feedback, editions and agent keys? Existing PTI, Velum and Luminary data will not be touched.'))return;await control('workspace','DELETE');await act('logout');notice('Personal workspace deleted.');return;}
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button'); if(!b || busy) return;
 try {
  if(b.dataset.view){view=b.dataset.view;activeThread=null;render();window.scrollTo(0,0);return;}
  if(!['action','react','note','delete','thread'].some(key=>b.dataset[key]))return;
  busy=true;b.disabled=true;
  if(b.dataset.action) await act(b.dataset.action);
  if(b.dataset.react){const item=state.edition.items.find(x=>x.id===b.dataset.id);const existing=state.feedback.find(f=>f.itemId===item.id);if(existing?.reaction===b.dataset.react)await remove('feedback',item.id);else await put('feedback',item.id,{itemId:item.id,reaction:b.dataset.react,source:item.source,topic:item.topic,createdAt:new Date().toISOString()});render();notice(existing?.reaction===b.dataset.react?'Feedback removed.':'Feedback saved for the next selection.');}
  if(b.dataset.note){const item=state.edition.items.find(x=>x.id===b.dataset.note);openDialog(`<h2>Your thought</h2><p class="hint">On: ${esc(item.title)}</p><form id="note-form" data-article="${esc(item.id)}" class="form"><textarea name="text" aria-label="Your thought on this item" required maxlength="12000"></textarea><label>Connect to a thread<select name="threadId"><option value="">No thread yet</option>${state.threads.map(t=>`<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('')}</select></label><div class="actions"><button class="primary">Keep thought</button><button class="secondary" type="button" data-action="close">Cancel</button></div></form>`);}
  if(b.dataset.delete){if(confirm('Delete this record?')){await remove(b.dataset.delete,b.dataset.id);render();}}
  if(b.dataset.thread){activeThread=b.dataset.thread;render();}
 }catch(e){notice(errorText(e));}finally{busy=false;b.disabled=false;}
});
document.addEventListener('submit',async e=>{
 const form=e.target;if(!['capture-form','settings-form','thread-form','note-form'].includes(form.id))return;e.preventDefault();if(busy)return;
 busy=true;const submit=form.querySelector('[type=submit],button.primary');if(submit)submit.disabled=true;
 try {
 const values=new FormData(form),createdAt=new Date().toISOString();
 if(form.id==='capture-form'||form.id==='note-form'){
   const text=String(values.get('text')||'').trim();if(!text)throw new Error('Write a thought before saving.');const raw=String(values.get('url')||'').trim();if(raw&&!safeUrl(raw))throw new Error('Use an http or https source URL.');
   const article=state.edition?.items.find(x=>x.id===form.dataset.article);
   await put('captures',crypto.randomUUID(),{text,kind:String(values.get('kind')||'thought'),threadId:String(values.get('threadId')||''),url:article?.url||raw,articleId:article?.id||'',articleTitle:article?.title||'',createdAt});if(form.id==='note-form')$('#dialog').close();render();notice('Thought saved.');
 }
 if(form.id==='settings-form'){const value=validateSettings({topics:values.getAll('topics'),geography:values.get('geography'),direction:values.get('direction')});await saveProfile({settings:value,preferenceVersion:(state.preferenceVersion||0)+1});render();notice('Direction saved. Your next run will use these settings.');}
 if(form.id==='thread-form'){const title=String(values.get('title')||'').trim();if(!title)throw new Error('Write a question before saving.');await put('threads',crypto.randomUUID(),{title,shareWithAgent:values.get('share')==='on',createdAt});$('#dialog').close();render();notice('Thread created.');}
 }catch(e){notice(errorText(e));}finally{busy=false;if(submit)submit.disabled=false;}
});
window.addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(['today','capture','threads','settings'].includes(v)){view=v;render();}});
window.addEventListener('offline',()=>notice('Offline. Unsaved text remains here; cloud saving requires a connection.'));
window.addEventListener('online',()=>notice('Connection restored. You can retry saving.'));
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
if(new URLSearchParams(location.search).get('demo')==='1') await act('demo');else {welcome(); if(navigator.onLine) loadFirebase().catch(()=>{});}
