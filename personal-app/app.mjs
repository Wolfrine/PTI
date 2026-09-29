import {DEFAULT_SETTINGS,safeUrl,validateSettings} from './core.mjs';
import {shell,welcome,esc,date,threadOptions} from './views.mjs';
const $=s=>document.querySelector(s);
const emptyState=()=>({settings:structuredClone(DEFAULT_SETTINGS),captures:[],threads:[],feedback:[],runs:[],reflections:[],editions:[],edition:null,paused:false,preferenceVersion:1});
let state=emptyState(),user=null,fb,auth,db,firebasePromise,busy=false,authEpoch=0,noticeTimer;
const ui={view:['today','capture','threads','reflection','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'today',demo:false,error:'',activeThread:null,filter:'all',reflectionDay:'',expanded:new Set(),loadImages:true};
try{ui.loadImages=sessionStorage.getItem('personal-source-images')!=='off';}catch{}
const config={apiKey:'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',authDomain:'pti-app-2ab59.firebaseapp.com',projectId:'pti-app-2ab59',storageBucket:'pti-app-2ab59.firebasestorage.app',messagingSenderId:'185802494856',appId:'1:185802494856:web:5e9777771492528c6e203d'};
function notice(message){clearTimeout(noticeTimer);$('#notice').textContent=message;noticeTimer=setTimeout(()=>$('#notice').textContent='',6500);}
function errorText(e){return e?.code==='permission-denied'?'Access was denied. Your data was not loaded or saved.':String(e?.message||e).slice(0,350);}
function render(){const y=scrollY;$('#app').innerHTML=user||ui.demo?shell(state,ui):welcome(ui.error);window.scrollTo(0,y);}
function openDialog(html){const d=$('#dialog');d.innerHTML=html;d.showModal();d.querySelector('input:not([type=checkbox]),textarea,select,button')?.focus();}
function root(){if(!user)throw Error('Sign in first.');return fb.doc(db,'users',user.uid,'personalData','workspace');}
function requireOnline(){if(!navigator.onLine)throw Error('Offline: not saved. Keep this page open and retry when connected.');}
async function loadFirebase(){
 if(firebasePromise)return firebasePromise;
 firebasePromise=(async()=>{
  const [a,b,c]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')]);
  fb={...a,...b,...c};const app=fb.initializeApp(config,'personal');auth=fb.getAuth(app);db=fb.getFirestore(app);
  await fb.setPersistence(auth,fb.browserSessionPersistence);
  fb.onAuthStateChanged(auth,async next=>{
   const epoch=++authEpoch;if(ui.demo)return;user=next;ui.error='';state=emptyState();
   if(next){try{await loadState(epoch);}catch(e){if(epoch===authEpoch)ui.error=errorText(e);}}
   if(epoch===authEpoch)render();
  });
 })();
 try{return await firebasePromise;}catch(e){firebasePromise=null;throw e;}
}
async function loadState(epoch=authEpoch){
 if(ui.demo||!user)return;
 const uid=user.uid,ref=root();let profile=await fb.getDoc(ref);
 if(!profile.exists()){await fb.setDoc(ref,{settings:structuredClone(DEFAULT_SETTINGS),paused:false,preferenceVersion:1,generation:crypto.randomUUID(),updatedAt:new Date().toISOString()});profile=await fb.getDoc(ref);}
 const read=async(name,cap=100)=>(await fb.getDocs(fb.query(fb.collection(ref,name),fb.orderBy('createdAt','desc'),fb.limit(cap)))).docs.map(d=>({...d.data(),id:d.id}));
 const [captures,threads,feedback,runs,editions,reflections]=await Promise.all([read('captures'),read('threads'),read('feedback',200),read('runs',20),read('editions',30),read('reflections',60)]);
 if(epoch!==authEpoch||user?.uid!==uid)return;
 state={...emptyState(),...profile.data(),captures,threads,feedback,runs,editions,reflections,edition:editions[0]||null};ui.error='';
}
async function put(bucket,id,data){
 if(!['captures','threads','feedback'].includes(bucket))throw Error('Unsupported write.');
 const epoch=authEpoch;
 if(!ui.demo){requireOnline();await fb.setDoc(fb.doc(root(),bucket,id),data);}
 if(epoch!==authEpoch)return;
 state[bucket]=[{...data,id},...state[bucket].filter(x=>x.id!==id)];
}
async function remove(bucket,id){
 if(!['captures','threads','feedback','reflections'].includes(bucket))throw Error('Unsupported deletion.');
 if(!ui.demo){requireOnline();await fb.deleteDoc(fb.doc(root(),bucket,id));}
 state[bucket]=state[bucket].filter(x=>x.id!==id);
}
async function saveProfile(patch){
 if(!ui.demo){requireOnline();await fb.updateDoc(root(),{...patch,updatedAt:new Date().toISOString()});}
 Object.assign(state,patch);
}
async function control(action,method='POST'){
 if(ui.demo||!user)throw Error('Cloud controls require your signed-in workspace.');requireOnline();const ref=root();
 async function clear(name){for(;;){const page=await fb.getDocs(fb.query(fb.collection(ref,name),fb.limit(200)));if(page.empty)return;const batch=fb.writeBatch(db);page.docs.forEach(d=>batch.delete(d.ref));await batch.commit();}}
 async function all(name){const result=[];let cursor;for(;;){const constraints=[fb.orderBy(fb.documentId()),fb.limit(200)];if(cursor)constraints.push(fb.startAfter(cursor));const page=await fb.getDocs(fb.query(fb.collection(ref,name),...constraints));result.push(...page.docs.map(d=>({...d.data(),id:d.id})));if(page.size<200)return result;cursor=page.docs.at(-1);}}
 if(action==='feedback'&&method==='DELETE'){await saveProfile({generation:crypto.randomUUID()});await clear('feedback');await clear('reflections');return {ok:true};}
 if(action==='export'&&method==='GET'){const result={exportedAt:new Date().toISOString(),database:'(default)',namespace:ref.path,profile:(await fb.getDoc(ref)).data()||{}};for(const name of ['captures','threads','feedback','editions','runs','reflections'])result[name]=await all(name);return result;}
 if(action==='workspace'&&method==='DELETE'){await saveProfile({paused:true,generation:crypto.randomUUID()});for(const name of ['agentKeys','captures','threads','feedback','editions','runs','reflections'])await clear(name);await fb.deleteDoc(ref);return {ok:true};}
 throw Error('Unsupported workspace action.');
}
async function act(action){
 if(action==='login'){ui.error='';try{await loadFirebase();await fb.signInWithPopup(auth,new fb.GoogleAuthProvider());}catch(e){ui.error=errorText(e);render();}return;}
 if(action==='demo'){++authEpoch;ui.demo=true;user=null;state={...emptyState(),...(await import('./demo.mjs')).demoState()};ui.view='today';ui.error='';render();return;}
 if(['exit-demo','logout'].includes(action)){++authEpoch;if(auth?.currentUser)await fb.signOut(auth);ui.demo=false;user=null;ui.view='today';ui.expanded.clear();state=emptyState();history.replaceState(null,'','/');render();return;}
 if(action==='refresh'){await loadState();ui.error='';render();notice('Workspace refreshed.');return;}
 if(action==='pause'){await saveProfile({paused:!state.paused});render();return;}
 if(action==='all-threads'){ui.activeThread=null;render();return;}
 if(action==='runs'){openDialog(`<h2>Publication history</h2><p class="hint">Only completed execution records establish that a run happened.</p>${state.runs.map(r=>`<div class="run"><strong>${esc(r.status)}</strong> · ${date(r.createdAt)}<p>${esc(r.message||'')}</p><span class="hint">${esc(r.method||'')}</span></div>`).join('')||'<p>No agent run recorded yet.</p>'}<form method="dialog"><button class="secondary">Close</button></form>`);return;}
 if(action==='new-thread'){openDialog(`<h2>Start with a question.</h2><form id="thread-form" class="form"><label>Your question<input name="title" required maxlength="300" placeholder="What would I like to understand?"></label><label class="checkbox"><input type="checkbox" name="share">Share this question’s title with the news agent</label><div class="actions"><button class="primary">Start thread</button><button class="secondary" type="button" data-action="close">Cancel</button></div></form>`);return;}
 if(action==='close'){$('#dialog').close();return;}
 if(action==='clear-feedback'){if(!confirm('Delete all explicit feedback and daily reflections? Private captures and news editions stay.'))return;if(ui.demo)state.generation=crypto.randomUUID();else await control('feedback','DELETE');state.feedback=[];state.reflections=[];render();notice('Feedback and reflections reset. Future runs cannot use deleted records.');return;}
 if(action==='export'){const data=ui.demo?state:await control('export','GET'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`personal-export-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 if(action==='reset'){if(!confirm('Permanently delete this Personal workspace, including reflections? Other PTI apps are not touched.'))return;if(!ui.demo)await control('workspace','DELETE');await act('logout');notice('Personal workspace deleted.');}
}
function article(id){const found=state.edition?.items.find(x=>x.id===id);if(!found)throw Error('This story is no longer in the current edition. Refresh and retry.');return found;}
document.addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b||busy)return;
 if(b.dataset.view){ui.view=b.dataset.view;ui.activeThread=null;render();window.scrollTo(0,0);history.replaceState(null,'',' #'.trim()+ui.view);return;}
 if(b.dataset.filter){ui.filter=b.dataset.filter;render();return;}
 if(!['action','react','note','save','delete','thread'].some(key=>b.dataset[key]))return;
 busy=true;b.disabled=true;
 try{
  if(b.dataset.action)await act(b.dataset.action);
  if(b.dataset.react){const item=article(b.dataset.id),existing=state.feedback.find(f=>f.itemId===item.id),same=existing?.reaction===b.dataset.react;if(same&&!existing?.note)await remove('feedback',item.id);else await put('feedback',item.id,{itemId:item.id,reaction:same?'thought':b.dataset.react,note:existing?.note||'',itemTitle:item.title,url:item.url,source:item.source,topic:item.topic,createdAt:new Date().toISOString()});render();notice(same?'Reaction removed. Any shared thought is retained.':'Feedback saved for the next selection.');}
  if(b.dataset.note){const item=article(b.dataset.note);openDialog(`<h2>Your thought</h2><p class="hint">On: ${esc(item.title)}</p><form id="note-form" data-article="${esc(item.id)}" class="form"><textarea name="text" aria-label="Your thought on this item" required maxlength="2000"></textarea><label class="checkbox"><input type="checkbox" name="shareFeedback">Share this thought with the news agent as feedback</label><label>Connect to a thread<select name="threadId">${threadOptions(state)}</select></label><div class="actions"><button class="primary">Keep thought</button><button class="secondary" type="button" data-action="close">Cancel</button></div></form>`);}
  if(b.dataset.save){const item=article(b.dataset.save);openDialog(`<h2>Let this story continue.</h2><p>${esc(item.title)}</p><form id="save-story-form" data-article="${esc(item.id)}" class="form"><label>Existing thread<select name="threadId">${threadOptions(state)}</select></label><label>Or start a new question<input name="title" maxlength="300" placeholder="What do I want to understand?"></label><p class="hint">Saves a source link privately. This is not an endorsement or a shared reaction.</p><div class="actions"><button class="primary">Save source</button><button class="secondary" type="button" data-action="close">Cancel</button></div></form>`);}
  if(b.dataset.delete&&confirm(b.dataset.delete==='reflections'?'Delete this dated summary? Reset feedback in Settings to also remove its source material.':'Delete this record?')){await remove(b.dataset.delete,b.dataset.id);render();}
  if(b.dataset.thread){ui.activeThread=b.dataset.thread;render();}
 }catch(e){notice(errorText(e));}finally{busy=false;b.disabled=false;}
});
document.addEventListener('submit',async event=>{
 const form=event.target;if(!['capture-form','settings-form','thread-form','note-form','save-story-form'].includes(form.id))return;event.preventDefault();if(busy)return;
 busy=true;const submit=form.querySelector('[type=submit],button.primary');if(submit)submit.disabled=true;
 try{
  const values=new FormData(form),createdAt=new Date().toISOString();
  if(['capture-form','note-form'].includes(form.id)){
   const text=String(values.get('text')||'').trim();if(!text)throw Error('Write a thought before saving.');const raw=String(values.get('url')||'').trim();if(raw&&!safeUrl(raw))throw Error('Use an http or https source URL.');
   const item=form.dataset.article?article(form.dataset.article):null,id=crypto.randomUUID(),data={text,kind:String(values.get('kind')||'thought'),threadId:String(values.get('threadId')||''),url:item?.url||raw,articleId:item?.id||'',articleTitle:item?.title||'',createdAt};
   const share=Boolean(item&&values.get('shareFeedback')==='on');
   if(share){const previous=state.feedback.find(f=>f.itemId===item.id),feedback={itemId:item.id,reaction:previous?.reaction||'thought',note:text,itemTitle:item.title,url:item.url,source:item.source,topic:item.topic,createdAt};if(ui.demo){await put('captures',id,data);await put('feedback',item.id,feedback);}else{requireOnline();const batch=fb.writeBatch(db),ref=root();batch.set(fb.doc(ref,'captures',id),data);batch.set(fb.doc(ref,'feedback',item.id),feedback);await batch.commit();state.captures.unshift({...data,id});state.feedback=[{...feedback,id:item.id},...state.feedback.filter(f=>f.itemId!==item.id)];}}
   else await put('captures',id,data);
   if(form.id==='note-form')$('#dialog').close();render();notice(share?'Thought saved and shared with the news agent.':'Thought saved privately.');
  }
  if(form.id==='settings-form'){const settings=validateSettings({topics:values.getAll('topics'),geography:values.get('geography'),direction:values.get('direction')});await saveProfile({settings,preferenceVersion:(state.preferenceVersion||0)+1});ui.filter='all';render();notice('Direction saved. Your next run will use these settings.');}
  if(form.id==='thread-form'){const title=String(values.get('title')||'').trim();if(!title)throw Error('Write a question before saving.');await put('threads',crypto.randomUUID(),{title,shareWithAgent:values.get('share')==='on',createdAt});$('#dialog').close();render();notice('Thread created.');}
  if(form.id==='save-story-form'){
   const item=article(form.dataset.article),title=String(values.get('title')||'').trim();let threadId=String(values.get('threadId')||'');
   if(!threadId&&!title)throw Error('Choose a thread or enter a new question.');
   if(title){threadId=crypto.randomUUID();await put('threads',threadId,{title,shareWithAgent:false,createdAt});}
   await put('captures',crypto.randomUUID(),{text:'Saved source: '+item.title,kind:'link',threadId,url:item.url,articleId:item.id,articleTitle:item.title,createdAt});$('#dialog').close();render();notice('Source saved to your thread. No reaction was inferred.');
  }
 }catch(e){notice(errorText(e));}finally{busy=false;if(submit)submit.disabled=false;}
});
document.addEventListener('change',event=>{
 if(event.target.id==='reflection-day'){ui.reflectionDay=event.target.value;render();}
 if(event.target.id==='source-images'){ui.loadImages=event.target.checked;try{sessionStorage.setItem('personal-source-images',ui.loadImages?'on':'off');}catch{}render();notice(ui.loadImages?'Story images enabled for this session.':'Images disabled. No replacement illustrations are generated.');}
});
document.addEventListener('toggle',event=>{const id=event.target.dataset?.expand;if(id){if(event.target.open)ui.expanded.add(id);else ui.expanded.delete(id);}},true);
document.addEventListener('load',event=>{if(event.target.matches?.('[data-story-image]')){const status=event.target.closest('figure')?.querySelector('.image-availability');if(status)status.hidden=true;}},true);
document.addEventListener('error',event=>{if(event.target.matches?.('[data-story-image]')){const figure=event.target.closest('figure');event.target.remove();if(!figure)return;figure.style.aspectRatio='auto';figure.style.minHeight='110px';const label=figure.querySelector('[data-visual-label]'),credit=figure.querySelector('[data-visual-credit]'),status=figure.querySelector('.image-availability');if(label)label.textContent='Image unavailable';if(credit)credit.textContent='No substitute illustration';if(status){status.hidden=false;status.textContent='The image could not be loaded. Reload to retry.';}}},true);
window.addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(['today','capture','threads','reflection','settings'].includes(v)){ui.view=v;render();}});
window.addEventListener('offline',()=>notice('Offline. Unsaved text remains here; saving requires a connection.'));
window.addEventListener('online',()=>notice('Connection restored. You can retry saving.'));
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
if(new URLSearchParams(location.search).get('demo')==='1')await act('demo');else{render();if(navigator.onLine)loadFirebase().catch(()=>{});}
