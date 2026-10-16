import {collections, emptyRecords, validateRecord, type CollectionName, type Payload, type Records, type RecordMap} from './model';
import {firebaseConfig, ownerUid, workspacePath} from './config';
import {readStableExport} from './export';
import {effectiveRole,canReadPlan,canEditPlan,type AccessRole,type MemberRole} from './access';
import type {Auth, User} from 'firebase/auth';
import type {Firestore, Unsubscribe} from 'firebase/firestore';

export interface Member {id:string; email:string; name:string; role:MemberRole; invitedAt:string; invitedBy:string; updatedAt?:string; updatedBy?:string;}
export interface AccessRequest {id:string;uid:string;email:string;name:string;firstSeenAt:string;lastSeenAt:string;}
export interface StoreState {
  user:{uid:string;displayName:string|null;email:string|null}|null; isOwner:boolean; isAdmin:boolean; canEdit:boolean;role:AccessRole;
  loading:boolean; access:'signed-out'|'loading'|'ready'|'denied'|'pending'; offline:boolean;
  error:string; records:Records; members:Member[]; accessRequests:AccessRequest[];demo:boolean; truncated:boolean;
}
export function createWeddingStore(onChange:(state:StoreState)=>void) {
  let state:StoreState={user:null,isOwner:false,isAdmin:false,canEdit:false,role:'pending',loading:false,access:'signed-out',offline:!navigator.onLine,error:'',records:emptyRecords(),members:[],accessRequests:[],demo:false,truncated:false};
  let auth:Auth,db:Firestore,unsubscribers:Unsubscribe[]=[],membershipStop:Unsubscribe|undefined,epoch=0,viewEpoch=0;
  let api:typeof import('firebase/firestore');
  let authApi:typeof import('firebase/auth');
  const history:Payload[]=[];
  const emit=()=>{store.state=state;onChange(state);};
  const clearPrivate=()=>{viewEpoch++;unsubscribers.forEach(f=>f());unsubscribers=[];state={...state,records:emptyRecords(),members:[],accessRequests:[],truncated:false};};
  const clear=()=>{membershipStop?.();membershipStop=undefined;clearPrivate();};
  function deny(message:string) {clearPrivate();state={...state,loading:false,canEdit:false,isAdmin:false,access:'denied',error:message};emit();}
  function check(edit=false) {
    if(state.access!=='ready'||!state.user)throw Error('Sign in with an approved account to make changes.');
    if(state.offline||!navigator.onLine)throw Error('You are offline. Reconnect before saving.');
    if(edit&&!state.canEdit)throw Error('Your Viewer role is read-only. Ask an admin to change your access.');
  }
  async function register(user:User,generation:number) {
    if(!user.emailVerified||!user.email)throw Error('Use a verified Google account to request family access.');
    const ref=api.doc(db,workspacePath,'accessRequests',user.uid),at=new Date().toISOString();
    await api.runTransaction(db,async tx=>{
      const snap=await tx.get(ref);if(generation!==epoch)throw Error('Your sign-in changed. Please try again.');
      const identity={uid:user.uid,email:user.email!.toLowerCase(),name:(user.displayName||'').slice(0,180),lastSeenAt:at};
      if(snap.exists())tx.update(ref,{name:identity.name,lastSeenAt:at,...(!snap.data().firstSeenAt?{firstSeenAt:at}:{})});
      else tx.set(ref,{...identity,firstSeenAt:at});
    });
  }
  async function loadPlan(role:AccessRole,generation:number) {
    clearPrivate();const view=viewEpoch;
    state={...state,role,isAdmin:role==='admin',canEdit:canEditPlan(role),error:'',loading:canReadPlan(role),access:canReadPlan(role)?'loading':role==='pending'?'pending':'denied'};
    if(role==='blocked')state.error='Your family access has been blocked. Contact a family admin.';
    emit();if(!canReadPlan(role))return;
    try {
      const root=api.doc(db,workspacePath),snap=await api.getDocFromServer(root);
      if(generation!==epoch||view!==viewEpoch)return;
      if(!snap.exists())return deny('The family workspace is being prepared. Please try again later.');
      const names=[...collections,...(role==='admin'?['members','accessRequests']:[])],pending=new Set(names);
      unsubscribers.push(api.onSnapshot(root,s=>{if(generation!==epoch||view!==viewEpoch)return;if(!s.exists())deny('This workspace is no longer available.');},()=>{if(generation===epoch&&view===viewEpoch)deny('Your access has changed. Please check your family role.');}));
      for(const name of names)unsubscribers.push(api.onSnapshot(api.collection(root,name),snapshot=>{
        if(generation!==epoch||view!==viewEpoch)return;
        if(name==='members')state={...state,members:snapshot.docs.map(d=>({id:d.id,...d.data()} as Member))};
        else if(name==='accessRequests')state={...state,accessRequests:snapshot.docs.map(d=>({id:d.id,...d.data()} as AccessRequest))};
        else state={...state,records:{...state.records,[name]:snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(d=>!(d as {archived?:boolean}).archived)}};
        pending.delete(name);state={...state,loading:pending.size>0,access:pending.size?'loading':'ready'};emit();
      },()=>{if(generation===epoch&&view===viewEpoch)deny('We could not load the private workspace. Check your role and connection.');}));
    } catch {if(generation===epoch&&view===viewEpoch)deny(navigator.onLine?'Your access could not be verified. Please sign in again.':'You are offline. Reconnect to open the private workspace.');}
  }
  async function open(user:User|null) {
    const generation=++epoch;clear();
    state={...state,user:user?{uid:user.uid,displayName:user.displayName,email:user.email}:null,isOwner:user?.uid===ownerUid,isAdmin:false,canEdit:false,role:'pending',error:'',access:user?'loading':'signed-out',loading:!!user};emit();
    if(!user)return;
    try {
      // Register the verified identity before touching any private planning data.
      await register(user,generation);if(generation!==epoch)return;
      let lastRole:AccessRole|undefined;
      membershipStop=api.onSnapshot(api.doc(db,workspacePath,'members',user.email!.toLowerCase()),membership=>{
        if(generation!==epoch)return;const role=effectiveRole(user.uid===ownerUid,membership.data()?.role);
        if(role!==lastRole){lastRole=role;void loadPlan(role,generation);}
      },()=>{if(generation===epoch)deny('Your family role could not be verified. Please sign in again.');});
    }catch(error){if(generation===epoch)deny(navigator.onLine?(error instanceof Error?error.message:'Your sign-in could not be registered.'):'You are offline. Reconnect to request access.');}
  }
  async function guard<T>(action:()=>Promise<T>):Promise<T> {
    try {state={...state,error:''};const value=await action();emit();return value;}
    catch(error){state={...state,error:error instanceof Error?error.message:'Could not save. Please try again.'};emit();throw error;}
  }
  const store={
    state,
    async start() {
      // A just-migrated legacy tab can still listen to its old Auth storage.
      // This logout-only signal contains no identity and never grants access.
      addEventListener('storage',event=>{if(event.key==='wedding-sign-out'&&event.newValue&&auth?.currentUser)void store.signOut(false);});
      addEventListener('offline',()=>{state={...state,offline:true};emit();});
      addEventListener('online',()=>{state={...state,offline:false};emit();if(auth?.currentUser&&(state.access==='denied'||state.access==='pending'))void open(auth.currentUser);});
      if(import.meta.env.DEV && new URLSearchParams(location.search).get('demo')==='1') {
        const {demoRecords}=await import('./demo');
        state={...state,user:{uid:'demo-owner',displayName:'Preview family',email:'preview@example.test'},isOwner:true,isAdmin:true,canEdit:true,role:'admin',access:'ready',demo:true,records:demoRecords(),accessRequests:[{id:'demo-owner',uid:'demo-owner',email:'preview@example.test',name:'Preview family',firstSeenAt:'',lastSeenAt:''},{id:'preview-pending',uid:'preview-pending',email:'pending@example.test',name:'Example pending account',firstSeenAt:'2026-10-15T10:00:00Z',lastSeenAt:'2026-10-15T10:00:00Z'}]};emit();return;
      }
      state={...state,loading:true,access:'loading'};emit();
      try {
        const appApi=await import('firebase/app');authApi=await import('firebase/auth');api=await import('firebase/firestore');
        // Development uses emulators by default. Live development needs an explicit opt-in.
        const emulated=import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS!=='0';
        const app=appApi.initializeApp(emulated?{...firebaseConfig,projectId:'demo-wedding-tests',apiKey:'demo-key'}:firebaseConfig,'wedding');
        // Select durable storage at initialization so new tabs listen to the same store.
        // Session/IndexedDB entries are included to restore and migrate existing sign-ins.
        auth=authApi.initializeAuth(app,{persistence:[authApi.browserLocalPersistence,authApi.browserSessionPersistence,authApi.indexedDBLocalPersistence],popupRedirectResolver:authApi.browserPopupRedirectResolver});
        db=api.initializeFirestore(app,{localCache:api.memoryLocalCache()});
        if(emulated) {
          authApi.connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
          api.connectFirestoreEmulator(db,'127.0.0.1',8085);
        }
        // Remember this device across browser/app restarts; roles are still checked online.
        await authApi.setPersistence(auth,authApi.browserLocalPersistence);
        authApi.onAuthStateChanged(auth,user=>void open(user),()=>deny('Sign-in could not be restored. Please try again.'));
        addEventListener('focus',()=>{if(auth.currentUser&&state.access==='denied')void open(auth.currentUser);else if(auth.currentUser&&state.access==='ready')api.getDocFromServer(api.doc(db,workspacePath)).catch(()=>deny('Your access could not be verified. Please sign in again.'));});
      } catch { deny('Sign-in is temporarily unavailable. Please check your connection and try again.'); }
    },
    async signIn() {return guard(async()=>{if(!auth)throw Error('Sign-in is loading. Refresh if this continues.');await authApi.signInWithPopup(auth,new authApi.GoogleAuthProvider());});},
    async signOut(notify=true) {
      epoch++;clear();state={...state,user:null,isOwner:false,access:'signed-out',loading:false,isAdmin:false,canEdit:false,role:'pending',error:''};emit();
      if(notify)try{localStorage.setItem('wedding-sign-out',crypto.randomUUID());}catch{/* Firebase still clears this tab when optional storage is unavailable. */}
      if(auth)await authApi.signOut(auth);
    },
    async save<K extends CollectionName>(collection:K,payload:Payload,id?:string,expectedRevision?:number) {
      return guard(async()=>{
        check(true);const cleaned=validateRecord(collection,payload),actor=state.user!.uid;
        const key=id||(collection==='attendance'?`${cleaned.guestId}--${cleaned.eventId}`:crypto.randomUUID());
        if(!/^[A-Za-z0-9_-]{1,260}$/.test(key))throw Error('Invalid record identifier.');
        const at=new Date().toISOString(),changeId=crypto.randomUUID();
        const current=state.records[collection].find(r=>r.id===key);
        const revision=expectedRevision??current?.revision;
        if(state.demo){
          if(current&&revision!==current.revision)throw Error('Someone updated this item. Reopen it to review their changes.');
          const next={...current,...cleaned,id:key,revision:(current?.revision??0)+1,createdAt:current?.createdAt??at,createdBy:current?.createdBy??actor,updatedAt:at,updatedBy:actor,archived:false,lastChangeId:changeId};
          state={...state,records:{...state.records,[collection]:[...state.records[collection].filter(r=>r.id!==key),next]}};history.push({collection,recordId:key,at,actor});emit();return key;
        }
        const ref=api.doc(db,workspacePath,collection,key);
        await api.runTransaction(db,async transaction=>{
          const snap=await transaction.get(ref),before=snap.exists()?snap.data():null;
          if(before&&revision!==before.revision)throw Error('Someone updated this item. Reopen it to review their changes.');
          if(!before&&revision!=null)throw Error('This item is no longer available.');
          const next={...cleaned,revision:(before?.revision??0)+1,createdAt:before?.createdAt??at,createdBy:before?.createdBy??actor,updatedAt:at,updatedBy:actor,archived:false,lastChangeId:changeId};
          transaction.set(ref,next);
          transaction.set(api.doc(db,workspacePath,'history',changeId),{collection,recordId:key,revision:next.revision,actor,at,before,after:next,action:before?'updated':'created'});
        });return key;
      });
    },
    async archive(collection:CollectionName,id:string,expectedRevision:number) {
      return guard(async()=>{
        check(true);const at=new Date().toISOString(),actor=state.user!.uid,changeId=crypto.randomUUID();
        if(state.demo){state={...state,records:{...state.records,[collection]:state.records[collection].filter(r=>r.id!==id)}};emit();return;}
        await api.runTransaction(db,async tx=>{
          const ref=api.doc(db,workspacePath,collection,id),snapshot=await tx.get(ref);
          if(!snapshot.exists()||snapshot.data().revision!==expectedRevision)throw Error('This item changed. Reopen it before archiving.');
          const before=snapshot.data(),after={...before,archived:true,revision:expectedRevision+1,updatedAt:at,updatedBy:actor,lastChangeId:changeId};
          tx.set(ref,after);tx.set(api.doc(db,workspacePath,'history',changeId),{collection,recordId:id,revision:after.revision,actor,at,before,after,action:'archived'});
        });
      });
    },
    async assignRole(email:string,role:AccessRole,expectedRole?:string) {
      return guard(async()=>{
        check();if(!state.isAdmin)throw Error('Only an admin can manage family access.');
        email=email.trim().toLowerCase();
        if(!['pending','admin','family','viewer','blocked'].includes(role)||!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)||email.length>254)throw Error('Choose a valid account and role.');
        const ownerProfile=state.accessRequests.find(p=>p.uid===ownerUid);
        if(ownerProfile?.email===email||state.isOwner&&state.user?.email?.toLowerCase()===email)throw Error('The wedding owner stays Admin.');
        const at=new Date().toISOString(),actor=state.user!.uid,profile=state.accessRequests.find(p=>p.email===email);
        if(state.demo){
          const previous=state.members.find(m=>m.email===email),before=effectiveRole(false,previous?.role);
          if(expectedRole&&before!==effectiveRole(false,expectedRole))throw Error('This role changed. Review the current account before saving.');
          state={...state,members:[...state.members.filter(m=>m.email!==email),...(role==='pending'?[]:[{id:email,email,name:profile?.name||previous?.name||'',role,invitedAt:previous?.invitedAt||at,invitedBy:previous?.invitedBy||actor,updatedAt:at,updatedBy:actor}]) ]};emit();return;
        }
        const ref=api.doc(db,workspacePath,'members',email);
        await api.runTransaction(db,async tx=>{
          const snap=await tx.get(ref),previous=snap.exists()?snap.data():undefined,before=effectiveRole(false,previous?.role);
          if(expectedRole&&before!==effectiveRole(false,expectedRole))throw Error('This role changed. Review the current account before saving.');
          if(role==='pending')tx.delete(ref);
          else tx.set(ref,{email,name:profile?.name||previous?.name||'',role,invitedAt:previous?.invitedAt||at,invitedBy:previous?.invitedBy||actor,updatedAt:at,updatedBy:actor});
        });
      });
    },
    async invite(email:string,name:string) {
      await store.assignRole(email,'family');
    },
    async revoke(email:string) {return store.assignRole(email,'blocked');},
    async exportData(){
      check();
      if(state.demo)return JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),private:true,...state.records,history},null,2);
      const startedAt=new Date().toISOString(),exportEpoch=epoch,exportView=viewEpoch,exportUid=state.user!.uid;
      const session=()=>{if(epoch!==exportEpoch||viewEpoch!==exportView||state.user?.uid!==exportUid||state.access!=='ready')throw Error('Your access changed during export. Sign in again before exporting.');};
      const records=await readStableExport(async name=>(await api.getDocsFromServer(api.collection(db,workspacePath,name))).docs.map(d=>({id:d.id,...d.data()})),session,state.isAdmin);
      return JSON.stringify({schemaVersion:1,readStartedAt:startedAt,exportedAt:new Date().toISOString(),private:true,...records},null,2);
    },
  };
  return store;
}
export type WeddingStore=ReturnType<typeof createWeddingStore>;
