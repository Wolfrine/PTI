import {collections, emptyRecords, validateRecord, type CollectionName, type Payload, type Records, type RecordMap} from './model';
import {firebaseConfig, ownerUid, workspacePath} from './config';
import {readStableExport} from './export';
import type {Auth, User} from 'firebase/auth';
import type {Firestore, Unsubscribe} from 'firebase/firestore';

export interface Member {id:string; email:string; name:string; role:'editor'; invitedAt:string; invitedBy:string;}
export interface StoreState {
  user:{uid:string;displayName:string|null;email:string|null}|null; isOwner:boolean;
  loading:boolean; access:'signed-out'|'loading'|'ready'|'denied'; offline:boolean;
  error:string; records:Records; members:Member[]; demo:boolean; truncated:boolean;
}
export function createWeddingStore(onChange:(state:StoreState)=>void) {
  let state:StoreState={user:null,isOwner:false,loading:false,access:'signed-out',offline:!navigator.onLine,error:'',records:emptyRecords(),members:[],demo:false,truncated:false};
  let auth:Auth,db:Firestore,unsubscribers:Unsubscribe[]=[],epoch=0;
  let api:typeof import('firebase/firestore');
  let authApi:typeof import('firebase/auth');
  const history:Payload[]=[];
  const emit=()=>{store.state=state;onChange(state);};
  const clear=()=>{unsubscribers.forEach(f=>f());unsubscribers=[];state={...state,records:emptyRecords(),members:[],truncated:false};};
  function deny(message:string) { epoch++;clear();state={...state,loading:false,access:'denied',error:message};emit(); }
  function check() {
    if(state.access!=='ready'||!state.user)throw Error('Sign in with an invited account to make changes.');
    if(state.offline||!navigator.onLine)throw Error('You are offline. Reconnect before saving.');
  }
  async function open(user:User|null) {
    const generation=++epoch;clear();
    state={...state,user:user?{uid:user.uid,displayName:user.displayName,email:user.email}:null,isOwner:user?.uid===ownerUid,error:'',access:user?'loading':'signed-out',loading:!!user};emit();
    if(!user)return;
    try {
      const root=api.doc(db,workspacePath),snap=await api.getDocFromServer(root);
      if(generation!==epoch)return;
      if(!snap.exists())return deny('The family workspace is being prepared. Please try again later.');
      if(!state.isOwner && user.email)unsubscribers.push(api.onSnapshot(api.doc(root,'members',user.email.toLowerCase()),membership=>{
        if(generation===epoch&&!membership.exists())deny('Your family access has been removed.');
      },()=>{if(generation===epoch)deny('Your family access could not be verified.');}));
      const pending=new Set<string>([...collections,...(state.isOwner?['members']:[])]);
      unsubscribers.push(api.onSnapshot(root,s=>{if(generation!==epoch)return;if(!s.exists())deny('This workspace is no longer available.');},()=>{if(generation===epoch)deny('Your access has changed. Ask the family owner to check your invitation.');}));
      for(const name of pending) {
        unsubscribers.push(api.onSnapshot(api.collection(root,name),snapshot=>{
          if(generation!==epoch)return;
          if(name==='members')state={...state,members:snapshot.docs.map(d=>({id:d.id,...d.data()} as Member))};
          else state={...state,records:{...state.records,[name]:snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(d=>!(d as {archived?:boolean}).archived)}};
          pending.delete(name);
          state={...state,loading:pending.size>0,access:pending.size?'loading':'ready'};emit();
        },()=>{if(generation===epoch)deny('We could not load the private workspace. Check your invitation and connection.');}));
      }
    } catch { if(generation===epoch)deny(navigator.onLine?'This Google account has not been invited. Ask the family owner for access.':'You are offline. Reconnect to open the private workspace.'); }
  }
  async function guard<T>(action:()=>Promise<T>):Promise<T> {
    try {state={...state,error:''};const value=await action();emit();return value;}
    catch(error){state={...state,error:error instanceof Error?error.message:'Could not save. Please try again.'};emit();throw error;}
  }
  const store={
    state,
    async start() {
      addEventListener('offline',()=>{state={...state,offline:true};emit();});
      addEventListener('online',()=>{state={...state,offline:false};emit();if(auth?.currentUser&&state.access==='denied')void open(auth.currentUser);});
      if(import.meta.env.DEV && new URLSearchParams(location.search).get('demo')==='1') {
        const {demoRecords}=await import('./demo');
        state={...state,user:{uid:'demo-owner',displayName:'Preview family',email:'preview@example.test'},isOwner:true,access:'ready',demo:true,records:demoRecords()};emit();return;
      }
      state={...state,loading:true,access:'loading'};emit();
      try {
        const appApi=await import('firebase/app');authApi=await import('firebase/auth');api=await import('firebase/firestore');
        // Development uses emulators by default. Live development needs an explicit opt-in.
        const emulated=import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS!=='0';
        const app=appApi.initializeApp(emulated?{...firebaseConfig,projectId:'demo-wedding-tests',apiKey:'demo-key'}:firebaseConfig,'wedding');auth=authApi.getAuth(app);db=api.initializeFirestore(app,{localCache:api.memoryLocalCache()});
        if(emulated) {
          authApi.connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
          api.connectFirestoreEmulator(db,'127.0.0.1',8085);
        }
        await authApi.setPersistence(auth,authApi.browserSessionPersistence);
        authApi.onAuthStateChanged(auth,user=>void open(user),()=>deny('Sign-in could not be restored. Please try again.'));
        addEventListener('focus',()=>{if(auth.currentUser&&state.access==='ready')api.getDocFromServer(api.doc(db,workspacePath)).catch(()=>deny('Your access could not be verified. Please sign in again.'));});
      } catch { deny('Sign-in is temporarily unavailable. Please check your connection and try again.'); }
    },
    async signIn() {return guard(async()=>{if(!auth)throw Error('Sign-in is loading. Refresh if this continues.');await authApi.signInWithPopup(auth,new authApi.GoogleAuthProvider());});},
    async signOut() {epoch++;clear();state={...state,user:null,isOwner:false,access:'signed-out',loading:false,error:''};emit();if(auth)await authApi.signOut(auth);},
    async save<K extends CollectionName>(collection:K,payload:Payload,id?:string,expectedRevision?:number) {
      return guard(async()=>{
        check();const cleaned=validateRecord(collection,payload),actor=state.user!.uid;
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
        check();const at=new Date().toISOString(),actor=state.user!.uid,changeId=crypto.randomUUID();
        if(state.demo){state={...state,records:{...state.records,[collection]:state.records[collection].filter(r=>r.id!==id)}};emit();return;}
        await api.runTransaction(db,async tx=>{
          const ref=api.doc(db,workspacePath,collection,id),snapshot=await tx.get(ref);
          if(!snapshot.exists()||snapshot.data().revision!==expectedRevision)throw Error('This item changed. Reopen it before archiving.');
          const before=snapshot.data(),after={...before,archived:true,revision:expectedRevision+1,updatedAt:at,updatedBy:actor,lastChangeId:changeId};
          tx.set(ref,after);tx.set(api.doc(db,workspacePath,'history',changeId),{collection,recordId:id,revision:after.revision,actor,at,before,after,action:'archived'});
        });
      });
    },
    async invite(email:string,name:string) {
      return guard(async()=>{
        check();if(!state.isOwner)throw Error('Only the family owner can invite members.');
        email=email.trim().toLowerCase();name=name.trim();
        if(!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)||email.length>254||name.length>180)throw Error('Enter a valid Google email and a name up to 180 characters.');
        const member={email,name,role:'editor' as const,invitedAt:new Date().toISOString(),invitedBy:state.user!.uid};
        if(state.demo){state={...state,members:[...state.members.filter(m=>m.email!==email),{id:email,...member}]};emit();}
        else await api.setDoc(api.doc(db,workspacePath,'members',email),member);
      });
    },
    async revoke(email:string) {return guard(async()=>{check();if(!state.isOwner)throw Error('Only the family owner can manage access.');if(state.demo){state={...state,members:state.members.filter(m=>m.email!==email)};emit();}else await api.deleteDoc(api.doc(db,workspacePath,'members',email));});},
    async exportData(){
      check();
      if(state.demo)return JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),private:true,...state.records,history},null,2);
      const startedAt=new Date().toISOString(),exportEpoch=epoch,exportUid=state.user!.uid;
      const session=()=>{if(epoch!==exportEpoch||state.user?.uid!==exportUid||state.access!=='ready')throw Error('Your access changed during export. Sign in again before exporting.');};
      const records=await readStableExport(async name=>(await api.getDocsFromServer(api.collection(db,workspacePath,name))).docs.map(d=>({id:d.id,...d.data()})),session,state.isOwner);
      return JSON.stringify({schemaVersion:1,readStartedAt:startedAt,exportedAt:new Date().toISOString(),private:true,...records},null,2);
    },
  };
  return store;
}
export type WeddingStore=ReturnType<typeof createWeddingStore>;
