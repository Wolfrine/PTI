import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, runTransaction, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { accessRequestFor, accessReview } from './access-records.mjs';

// The public Firebase application identifier matches PTI's default app. No Admin credential is used.
const firebaseConfig={apiKey:'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',authDomain:'pti-app-2ab59.firebaseapp.com',projectId:'pti-app-2ab59',
 storageBucket:'pti-app-2ab59.firebasestorage.app',messagingSenderId:'185802494856',appId:'1:185802494856:web:5e9777771492528c6e203d',measurementId:'G-BY7B708EVV'};
const firebaseApp=getApps().find(a=>a.name==='[DEFAULT]')??initializeApp(firebaseConfig);
export const auth=getAuth(firebaseApp), db=getFirestore(firebaseApp);
export const observeAccount=callback=>onAuthStateChanged(auth,callback);
export const defaults={audioLanguage:'ja',subtitleLanguage:'en',autoplay:false,showTitles:false};
const safeName=name=>String(name??'').replace(/[<>]/g,'').trim().slice(0,80);
const root=ownerUid=>`users/${ownerUid}/onePieceData/workspace`;
export async function signInToOnePiece(){
 const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
 return (await signInWithPopup(auth,provider)).user;
}
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
export async function ensureAccessRequest(ownerUid){
 const user=auth.currentUser;if(!user)throw new Error('authentication-required');
 const candidate=accessRequestFor(user),ref=doc(db,`${root(ownerUid)}/accessRequests/${user.uid}`);
 return runTransaction(db,async transaction=>{
  const snapshot=await transaction.get(ref);
  if(auth.currentUser?.uid!==user.uid)throw new Error('identity-changed');
  if(snapshot.exists())return snapshot.data(); // Declined/paused accounts are never requeued on login.
  transaction.set(ref,candidate);return candidate;
 });
}
export function observeAccessRequest(ownerUid,onValue,onError){
 const uid=auth.currentUser?.uid;if(!uid)throw new Error('authentication-required');
 return onSnapshot(doc(db,`${root(ownerUid)}/accessRequests/${uid}`),snapshot=>{
  if(auth.currentUser?.uid===uid)onValue(snapshot.exists()?snapshot.data():null);
 },error=>{if(auth.currentUser?.uid===uid)onError?.(error);});
}
export function observeFamilyAccess(ownerUid,onValue,onError){
 if(auth.currentUser?.uid!==ownerUid)throw new Error('owner-required');
 return onSnapshot(collection(db,`${root(ownerUid)}/accessRequests`),snapshot=>{
  if(auth.currentUser?.uid===ownerUid)onValue(snapshot.docs.map(record=>record.data()));
 },error=>{if(auth.currentUser?.uid===ownerUid)onError?.(error);});
}
export async function listFamilyAccess(ownerUid){
 if(auth.currentUser?.uid!==ownerUid)throw new Error('owner-required');
 const [requests,members]=await Promise.all([getDocs(collection(db,`${root(ownerUid)}/accessRequests`)),getDocs(collection(db,`${root(ownerUid)}/members`))]);
 if(auth.currentUser?.uid!==ownerUid)throw new Error('identity-changed');
 return {requests:requests.docs.map(record=>record.data()),members:members.docs.map(record=>record.data())};
}
export async function reviewAccessRequest(ownerUid,requestUid,approve){
 if(auth.currentUser?.uid!==ownerUid)throw new Error('owner-required');
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(String(requestUid)))throw new Error('invalid-access-request');
 const ref=doc(db,`${root(ownerUid)}/accessRequests/${requestUid}`);
 return runTransaction(db,async transaction=>{
  const snapshot=await transaction.get(ref);if(!snapshot.exists())throw new Error('access-request-not-found');
  const request=snapshot.data(),memberRef=doc(db,`${root(ownerUid)}/members/${request.email}`);
  const member=request.status==='pending'&&approve===true?await transaction.get(memberRef):null;
  if(auth.currentUser?.uid!==ownerUid)throw new Error('identity-changed');
  const decision=accessReview(request,member?.exists()?member.data():null,{ownerUid,approve});
  if(!decision.changed)return decision.request;
  if(decision.member)transaction.set(memberRef,decision.member);
  transaction.update(ref,{status:decision.request.status,updatedAt:decision.request.updatedAt,revision:decision.request.revision});
  return decision.request;
 });
}
export async function inviteMember(ownerUid,{email,name,active=true}){
 const user=auth.currentUser;if(user?.uid!==ownerUid)throw new Error('owner-required');
 email=String(email??'').trim().toLowerCase();
 if(email.length>254||!/^\S+@[^\s/]+\.[^\s/]+$/.test(email)||email.includes('/')||email===user.email.toLowerCase())throw new Error('invalid-invitation');
 const ref=doc(db,`${root(ownerUid)}/members/${email}`);
 await runTransaction(db,async transaction=>{
  const snapshot=await transaction.get(ref),value=snapshot.exists()?snapshot.data():null,now=Date.now();
  if(!value)throw new Error('member-not-found'); // New access comes only from a Google-account request.
  if(auth.currentUser?.uid!==user.uid)throw new Error('identity-changed');
  const next={...value,name:safeName(name??value.name),active:active===true,revision:value.revision+1,updatedAt:now};
  transaction.set(ref,next);
 });
}
export const logout=()=>signOut(auth);
