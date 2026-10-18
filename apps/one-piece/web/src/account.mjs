import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, reauthenticateWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, runTransaction, collection, getDocs } from 'firebase/firestore';

// The public Firebase application identifier matches PTI's default app. No Admin credential is used.
const firebaseConfig={apiKey:'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',authDomain:'pti-app-2ab59.firebaseapp.com',projectId:'pti-app-2ab59',
 storageBucket:'pti-app-2ab59.firebasestorage.app',messagingSenderId:'185802494856',appId:'1:185802494856:web:5e9777771492528c6e203d',measurementId:'G-BY7B708EVV'};
const firebaseApp=getApps().find(a=>a.name==='[DEFAULT]')??initializeApp(firebaseConfig);
export const auth=getAuth(firebaseApp), db=getFirestore(firebaseApp);
export const observeAccount=callback=>onAuthStateChanged(auth,callback);
export const defaults={audioLanguage:'ja',subtitleLanguage:'en',autoplay:false,showTitles:false};
const safeName=name=>String(name??'').replace(/[<>]/g,'').trim().slice(0,80);
const root=ownerUid=>`users/${ownerUid}/onePieceData/workspace`;
export async function freshGoogleConfirmation(){
 if(!auth.currentUser)throw new Error('authentication-required');
 const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account',login_hint:auth.currentUser.email});
 const result=await reauthenticateWithPopup(auth.currentUser,provider);
 const token=GoogleAuthProvider.credentialFromResult(result)?.idToken;
 if(!token)throw new Error('google-confirmation-unavailable');
 return token;
}
export async function createWorkspace(ownerUid){
 if(auth.currentUser?.uid!==ownerUid)throw new Error('owner-required');
 const now=Date.now();
 // Revision 1 + immutable createdAt means rules reject replacement of an existing/disabled workspace.
 await setDoc(doc(db,root(ownerUid)),{schemaVersion:1,ownerUid,active:true,label:'One Piece family',revision:1,createdAt:now,updatedAt:now});
}
export async function claimInvitation(ownerUid){
 const user=auth.currentUser;if(!user)throw new Error('authentication-required');
 const ref=doc(db,`${root(ownerUid)}/members/${user.email.toLowerCase()}`);
 await runTransaction(db,async transaction=>{
  const snapshot=await transaction.get(ref);if(!snapshot.exists())throw new Error('not-invited');
  const invite=snapshot.data();
  if(invite.uid===user.uid)return;
  if(invite.uid!==''||invite.active!==true||invite.role!=='member')throw new Error('not-invited');
  transaction.update(ref,{uid:user.uid,revision:invite.revision+1,updatedAt:Date.now()});
 });
}
export async function readProfile(ownerUid){
 const uid=auth.currentUser?.uid;if(!uid)throw new Error('authentication-required');
 const snapshot=await getDoc(doc(db,`${root(ownerUid)}/profiles/${uid}`));
 return snapshot.exists()?{...defaults,...snapshot.data()}:{uid,displayName:safeName(auth.currentUser.displayName),...defaults,revision:0};
}
export async function saveProfile(ownerUid,preferences){
 const user=auth.currentUser;if(!user)throw new Error('authentication-required');
 const ref=doc(db,`${root(ownerUid)}/profiles/${user.uid}`);
 return runTransaction(db,async transaction=>{
  const current=await transaction.get(ref),value=current.exists()?current.data():{};
  const next={uid:user.uid,displayName:safeName(preferences.displayName??value.displayName??user.displayName),
   audioLanguage:preferences.audioLanguage??value.audioLanguage??'ja',subtitleLanguage:preferences.subtitleLanguage??value.subtitleLanguage??'en',
   autoplay:preferences.autoplay??value.autoplay??false,showTitles:preferences.showTitles??value.showTitles??false,
   revision:(value.revision??0)+1,updatedAt:Date.now()};
  transaction.set(ref,next);return next;
 });
}
export async function listInvitations(ownerUid){
 if(auth.currentUser?.uid!==ownerUid)throw new Error('owner-required');
 const snapshot=await getDocs(collection(db,`${root(ownerUid)}/members`));
 return snapshot.docs.map(d=>d.data());
}
export async function inviteMember(ownerUid,{email,name,active=true}){
 const user=auth.currentUser;if(user?.uid!==ownerUid)throw new Error('owner-required');
 email=String(email??'').trim().toLowerCase();
 if(email.length>254||!/^\S+@[^\s/]+\.[^\s/]+$/.test(email)||email.includes('/')||email===user.email.toLowerCase())throw new Error('invalid-invitation');
 const ref=doc(db,`${root(ownerUid)}/members/${email}`);
 await runTransaction(db,async transaction=>{
  const snapshot=await transaction.get(ref),value=snapshot.exists()?snapshot.data():null,now=Date.now();
  const next=value?{...value,name:safeName(name??value.name),active:active===true,revision:value.revision+1,updatedAt:now}
   :{email,uid:'',role:'member',active:active===true,name:safeName(name),invitedBy:ownerUid,invitedAt:now,updatedAt:now,revision:1};
  transaction.set(ref,next);
 });
}
export const logout=()=>signOut(auth);
export function loginUrl(){return `/login?redirect=${encodeURIComponent(location.pathname+location.search+location.hash)}`;}
