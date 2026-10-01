import {collections,now,id,clean,required,choice,safeUrl,emailKey,stamp,makeThread,makeMessage,makeBranch,branchPatch,makeTask,makeFinding,makeDecision,decisionStatus,makeExperiment,experimentPatch,validateExperiment,validateLinks} from './model.mjs?v=studio-4';
import {sampleState} from './sample.mjs?v=studio-4';

const config={apiKey:'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',authDomain:'pti-app-2ab59.firebaseapp.com',projectId:'pti-app-2ab59',storageBucket:'pti-app-2ab59.firebasestorage.app',messagingSenderId:'185802494856',appId:'1:185802494856:web:5e9777771492528c6e203d'};
const defaultWorkspace={schemaVersion:2,title:'Our venture studio',objective:'Build steady ₹10–20k monthly income, learn what repeats, then grow.',incomeFloorMonthly:10000,incomeTargetMonthly:20000};
const normalized=value=>value?.toDate?value.toDate().toISOString():Array.isArray(value)?value.map(normalized):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalized(v)])):value;
const validWorkspaceId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
function rememberedWorkspace(uid,value){try{const key=`venture-workspace:${uid}`;if(value)localStorage.setItem(key,value);return localStorage.getItem(key)||'';}catch{return '';}}

export function createVentureStore(onChange){
 const demo=new URLSearchParams(location.search).get('demo')==='1';
 let state={user:null,ownerUid:'',isOwner:false,loading:!demo,error:'',workspaceAvailable:demo,offline:!navigator.onLine,demo,workspace:{...defaultWorkspace},members:[],truncated:{},...Object.fromEntries(collections.map(k=>[k,[]]))};
 let api,auth,db,root,unsubscribe=[],epoch=0,pending=new Set();
 const emit=()=>{store.state=state;onChange({...state});};
 const clear=()=>{unsubscribe.forEach(f=>f());unsubscribe=[];pending.clear();state={...state,workspaceAvailable:false,members:[],truncated:{},...Object.fromEntries(collections.map(k=>[k,[]]))};};
 const check=()=>{if(!state.user)throw new Error('Sign in to save to your workspace.');if(!demo&&!navigator.onLine)throw new Error('You are offline. Your draft is kept here; reconnect before saving.');if(state.loading)throw new Error('The workspace is still loading.');if(!state.workspaceAvailable)throw new Error('This workspace is unavailable to this account. Check access or open your own workspace.');};
 const collectionRef=name=>api.collection(root,name);
 const ref=(name,key)=>api.doc(root,name,key);
 const author=()=>stamp(state.user);
 function assertRevision(docData,input){if(input.expectedRevision!=null&&Number(docData.revision||1)!==Number(input.expectedRevision))throw new Error('Someone updated this item while you were editing. Reopen it to review their changes.');}
 const find=(name,key)=>{const v=state[name].find(x=>x.id===key);if(!v)throw new Error('This item is no longer loaded. Refresh and try again.');return v;};
 async function apply(writes){
  check();
  if(demo){for(const w of writes){if(w.remove)state[w.collection]=state[w.collection].filter(x=>x.id!==w.id);else {const n=state[w.collection].findIndex(x=>x.id===w.id);if(n<0)state[w.collection]=[...state[w.collection],{id:w.id,...w.data}];else state[w.collection]=state[w.collection].map((x,i)=>i===n?{...x,...w.data}:x);}}emit();return;}
  const batch=api.writeBatch(db);for(const w of writes){const r=ref(w.collection,w.id);if(w.remove)batch.delete(r);else if(w.update)batch.update(r,w.data);else batch.set(r,w.data);}await batch.commit();
 }
 async function create(name,data){const key=id();await apply([{collection:name,id:key,data}]);return {id:key,...data};}
 async function update(name,key,input,patch){
  check();const original=find(name,key);assertRevision(original,input);const data={...patch,updatedAt:now(),updatedBy:state.user.uid,revision:Number(original.revision||1)+1};
  if(demo){await apply([{collection:name,id:key,data,update:true}]);return {id:key,...original,...data};}
  await api.runTransaction(db,async tx=>{const s=await tx.get(ref(name,key));if(!s.exists())throw new Error('Item no longer exists.');assertRevision(s.data(),{expectedRevision:original.revision||1});tx.update(s.ref,data);});return {id:key,...original,...data};
 }
 async function openWorkspace(ownerUid){
  const generation=++epoch;clear();state={...state,ownerUid,isOwner:state.user?.uid===ownerUid,loading:true,error:'',workspace:{...defaultWorkspace}};emit();
  if(demo){state={...state,...sampleState(),workspaceAvailable:true,loading:false};emit();return;}
  root=api.doc(db,'users',ownerUid,'ventureData','workspace');
  try{
   // Permission is checked before any private collection is subscribed.
   const snap=await api.getDoc(root);if(generation!==epoch)return;
   if(!snap.exists()&&!state.isOwner)throw new Error('This workspace is not available to this account. Ask its owner to add your verified Google email.');
   if(!snap.exists()&&state.isOwner)await api.setDoc(root,{...defaultWorkspace,createdAt:now(),updatedAt:now()});
   if(generation!==epoch)return;
   rememberedWorkspace(state.user.uid,ownerUid);
   state.workspaceAvailable=true;
   state.workspace={...defaultWorkspace,...normalized(snap.data()||{})};
   const names=[...collections,...(state.isOwner?['members']:[])];pending=new Set(names);
   unsubscribe.push(api.onSnapshot(root,s=>{if(generation!==epoch)return;state.workspace={...defaultWorkspace,...normalized(s.data()||{})};emit();},e=>{if(generation!==epoch)return;clear();state={...state,error:'Workspace access changed. Please ask its owner to check your membership.',loading:false};emit();}));
   for(const name of names){
    const sort=name==='members'?'invitedAt':name==='runs'?'startedAt':'createdAt';
    unsubscribe.push(api.onSnapshot(api.query(collectionRef(name),api.orderBy(sort,'desc'),api.limit(500)),snapshot=>{
     if(generation!==epoch)return;state[name]=snapshot.docs.map(s=>({id:s.id,...normalized(s.data())}));state.truncated[name]=snapshot.size===500;pending.delete(name);state.loading=pending.size>0;emit();
    },error=>{if(generation!==epoch)return;pending.delete(name);state.loading=pending.size>0;state[name]=[];state.error=`Could not load ${name}. ${error.code==='permission-denied'?'Check workspace access.':'Use Refresh to try again.'}`;emit();}));
   }
  }catch(error){if(generation!==epoch)return;clear();state.loading=false;state.error=error.code==='permission-denied'?'This account has not been added to the shared workspace. Ask its owner to add your verified Google email.':String(error.message||error);emit();}
 }
 const store={state,
  async signIn(){if(demo){location.href=location.pathname;return;}if(!api)throw new Error('Sign-in is still loading. Try again shortly.');const provider=new api.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});try{await api.signInWithPopup(auth,provider);}catch(e){if(e.code==='auth/popup-blocked')return api.signInWithRedirect(auth,provider);throw e;}},
  async signOut(){if(demo){location.href=location.pathname;return;}await api.signOut(auth);},
  async switchWorkspace(ownerUid){if(!validWorkspaceId(ownerUid))throw new Error('Invalid workspace link.');const u=new URL(location.href);u.searchParams.set('workspace',ownerUid);history.replaceState(null,'',u);return openWorkspace(ownerUid);},
  async refresh(){if(state.user)return openWorkspace(state.ownerUid||state.user.uid);},
  async createThread(input){check();const key=id(),data=makeThread(input,state.user),writes=[{collection:'threads',id:key,data}];if(clean(input.text))writes.push({collection:'messages',id:id(),data:makeMessage({threadId:key,text:input.text},state.user)});await apply(writes);return {id:key,...data};},
  async updateThread(key,input){const patch={};if('title'in input)patch.title=required(input.title,'Title',180);if('summary'in input)patch.summary=clean(input.summary,6000);if('status'in input)patch.status=choice(input.status,['active','parked','closed'],'active');return update('threads',key,input,patch);},
  async addMessage(input){check();const data=makeMessage(input,state.user);validateLinks(data,state);return create('messages',data);},
  async createBranch(input){check();const data=makeBranch(input,state.user);validateLinks(data,state);return create('branches',data);},
  async updateBranch(key,input){return update('branches',key,input,branchPatch(input));},
  async requestResearch(input){check();const data=makeTask(input,state.user);validateLinks(data,state);const old=state.researchTasks.find(x=>x.question===data.question&&x.branchId===data.branchId&&['queued','running'].includes(x.status));if(old)return old;return create('researchTasks',data);},
  async addFinding(input){check();const data=makeFinding(input,state.user);validateLinks(data,state);return create('findings',data);},
  async recordDecision(input){
   check();const data=makeDecision(input,state.user);validateLinks(data,state);const b=find('branches',data.branchId);assertRevision(b,input);const key=id();const patch={status:decisionStatus[data.outcome],updatedAt:now(),updatedBy:state.user.uid,revision:Number(b.revision||1)+1,lastDecisionId:key};
   if(demo)await apply([{collection:'decisions',id:key,data},{collection:'branches',id:b.id,data:patch,update:true}]);
   else await api.runTransaction(db,async tx=>{const current=await tx.get(ref('branches',b.id));if(!current.exists())throw new Error('Direction no longer exists.');assertRevision(current.data(),{expectedRevision:b.revision||1});tx.set(ref('decisions',key),data);tx.update(current.ref,patch);});return {id:key,...data};
  },
  async createExperiment(input){check();const data=makeExperiment(input,state.user);validateLinks(data,state);return create('experiments',data);},
  async updateExperiment(key,input){const old=find('experiments',key),patch=experimentPatch(input);validateExperiment({...old,...patch});return update('experiments',key,input,patch);},
  async addSignal(input){check();return create('discoveries',{...author(),title:required(input.title||input.summary,'Signal',180),summary:required(input.summary||input.title,'Signal detail',6000),kind:clean(input.kind||'market-signal',80),market:clean(input.market,150),geography:clean(input.geography,150),sourceUrl:safeUrl(input.sourceUrl),initialThought:clean(input.initialThought,3000),status:'new',origin:'human'});},
  async setLegacyStatus(name,key,status,reason){check();if(!['opportunities','discoveries'].includes(name))throw new Error('Invalid evidence type.');const item=find(name,key);choice(status,name==='opportunities'?['candidate','shortlist','parked','rejected']:['new','studied','dismissed'],null);const note=required(reason,'Reason',3000),keyDecision=id();await apply([{collection:name,id:key,data:{status,decisionReason:note,updatedAt:now(),updatedBy:state.user.uid},update:true},{collection:'decisions',id:keyDecision,data:{...author(),threadId:'',branchId:'',legacyCollection:name,legacyId:key,outcome:status,reason:note}}]);return item;},
  async inviteMember(email,name){check();if(!state.isOwner)throw new Error('Only the workspace owner can manage access.');const key=emailKey(email);if(key===state.user.email?.toLowerCase())throw new Error('You already own this workspace.');await apply([{collection:'members',id:key,data:{email:key,name:clean(name,120),role:'editor',invitedAt:now(),invitedBy:state.user.uid}}]);const link=new URL(location.origin+location.pathname);link.searchParams.set('workspace',state.ownerUid);return link.href;},
  async removeMember(email){check();if(!state.isOwner)throw new Error('Only the workspace owner can manage access.');await apply([{collection:'members',id:emailKey(email),remove:true}]);},
 };
 window.addEventListener('online',()=>{state.offline=false;emit();});window.addEventListener('offline',()=>{state.offline=true;emit();});
 if(demo){state={...state,user:{uid:'sample-alex',displayName:'Alex · sample',email:'alex@example.invalid'},ownerUid:'sample-alex',isOwner:true,loading:false,...sampleState()};queueMicrotask(emit);}
 else (async()=>{try{
  const [appApi,authApi,fireApi]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')]);api={...authApi,...fireApi};const fb=appApi.initializeApp(config);auth=api.getAuth(fb);db=api.getFirestore(fb);
  api.onAuthStateChanged(auth,user=>{epoch++;clear();state.user=user?{uid:user.uid,displayName:user.displayName||user.email,email:user.email}:null;state.error='';state.loading=!!user;state.isOwner=false;state.ownerUid='';if(user){const candidate=new URLSearchParams(location.search).get('workspace')||rememberedWorkspace(user.uid);openWorkspace(validWorkspaceId(candidate)?candidate:user.uid);}else emit();});
 }catch(e){state.loading=false;state.error='Venture could not connect. Check your connection and reload.';emit();}})();
 return store;
}
