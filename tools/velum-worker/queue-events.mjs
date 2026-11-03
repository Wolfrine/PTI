import {PROJECT,OWNER_UID,nativeAuthKey} from './session.mjs';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
import {retryDelay} from './lifecycle.mjs';

export const MAINTENANCE_MS=60000;

export class QueueSweep {
 constructor(){this.last=-Infinity;}
 due(notified,connected,now=Date.now()){
  if(!notified&&(connected||now-this.last<MAINTENANCE_MS))return false;
  this.last=now;return true;
 }
}

// A retained, coalescing wakeup: notifications received during a claim or before
// wait() must not be lost. Only the existing single worker loop consumes it.
export class WorkWakeup {
 constructor(){this.pending=true;this.waiter=null;}
 wake(){this.pending=true;this.waiter?.();}
 wait(milliseconds=MAINTENANCE_MS){
  if(this.waiter)throw new Error('worker-wait-already-active');
  if(this.pending){this.pending=false;return Promise.resolve(true);}
  return new Promise(resolve=>{
   const finish=()=>{clearTimeout(timer);this.waiter=null;const pending=this.pending;this.pending=false;resolve(pending);};
   const timer=setTimeout(finish,milliseconds);this.waiter=finish;
  });
 }
}

// Export the narrow subscription adapter so tests can exercise the same paths
// with emulator contexts. Never return job bodies to notification callbacks.
export function subscribeForWork(db,uid,{sdk,changed,binding,connection,failed}){
 const {doc,collection,query,where,limit,onSnapshot}=sdk;
 const root=`users/${OWNER_UID}/velumStudio/workspace`;
 let closed=false,bindingOnline=false,approved=false,jobStops=[],generation=0;
 const online=new Map(),seen=new Map();
 const report=()=>connection(bindingOnline&&(!approved||['queued','running'].every(status=>online.get(status))));
 const stopJobs=()=>{generation++;for(const stop of jobStops)stop();jobStops=[];online.clear();seen.clear();};
 const startJobs=()=>{
  const current=++generation;
  for(const status of ['queued','running']){
   const target=query(collection(db,`${root}/jobs`),where('status','==',status),where('deviceUid','==',uid),limit(20));
   jobStops.push(onSnapshot(target,{includeMetadataChanges:true},snapshot=>{
    if(closed||current!==generation)return;
    const wasOnline=online.get(status),server=!snapshot.metadata.fromCache;
    online.set(status,server);report();
    if(!server)return;
    const ids=new Set(snapshot.docs.map(item=>item.id)),previous=seen.get(status);
    seen.set(status,ids);
    // Running progress and our own status writes need no extra queue sweep.
    if(!wasOnline||!previous||[...ids].some(id=>!previous.has(id)))changed();
   },error=>{if(!closed&&current===generation){online.set(status,false);report();failed(error);}}));
  }
 };
 const stopBinding=onSnapshot(doc(db,`${root}/devices/${uid}`),{includeMetadataChanges:true},snapshot=>{
  if(closed)return;
  const server=!snapshot.metadata.fromCache,resumed=server&&!bindingOnline;
  bindingOnline=server;
  if(!server){report();return;}
  const status=snapshot.exists()?snapshot.data().status:'missing',next=status==='approved';
  binding(status);
  if(next!==approved){approved=next;if(approved)startJobs();else stopJobs();changed();}
  else if(resumed)changed();
  report();
 },error=>{if(!closed){bindingOnline=false;stopJobs();report();failed(error);}});
 return ()=>{closed=true;stopBinding();stopJobs();};
}

// Firestore runs as the same verified anonymous device, under the same rules as
// REST. The SDK receives only an ID token; refresh rotation stays in DeviceStore.
export async function listenForWork({idToken,uid,changed,binding,connection,failed}){
 if(uid!==PC_DEVICE_UID)throw new Error('device-identity-mismatch');
 const [appSdk,authSdk,firestoreSdk]=await Promise.all([import('firebase/app'),import('firebase/auth'),import('firebase/firestore')]);
 const app=appSdk.initializeServerApp({projectId:PROJECT,apiKey:nativeAuthKey()},{authIdToken:idToken});
 const db=firestoreSdk.getFirestore(app),auth=authSdk.getAuth(app);
 let stop,timer;
 const close=async()=>{stop?.();await firestoreSdk.terminate(db).catch(()=>{});await appSdk.deleteApp(app);};
 try{
  await Promise.race([auth.authStateReady(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('device-auth-unavailable')),20000);})]);
  clearTimeout(timer);
  if(auth.currentUser?.uid!==uid||!auth.currentUser.isAnonymous)throw new Error('device-identity-mismatch');
  stop=subscribeForWork(db,uid,{sdk:firestoreSdk,changed,binding,connection,failed});
  return close;
 }catch(error){clearTimeout(timer);await close();throw error;}
}

// Terminal listener failures retry with the existing 5s..120s backoff. Network
// reconnects are also handled by the SDK; a disconnected listener permits the
// bounded REST fallback. Generation guards ignore callbacks from retired tokens.
export class QueueNotifications {
 constructor({listen=listenForWork,changed,revoked,now=Date.now}={}){
  this.listen=listen;this.changed=changed;this.revoked=revoked;this.now=now;
  this.connected=false;this.closed=false;this.failed=false;this.attempt=0;this.retryAt=0;this.generation=0;this.token='';this.stop=null;this.starting=null;
 }
 async ensure({idToken,uid}){
  if(this.closed)return;
  if(this.starting)return this.starting;
  if(this.token===idToken&&!this.failed&&this.stop)return;
  if(this.now()<this.retryAt&&this.token===idToken)return;
  this.starting=this.start({idToken,uid}).finally(()=>{this.starting=null;});
  return this.starting;
 }
 async start({idToken,uid}){
  const generation=++this.generation;
  this.connected=false;await this.stop?.();this.stop=null;this.token=idToken;this.failed=false;
  const current=()=>!this.closed&&generation===this.generation;
  const failed=()=>{if(current()&&!this.failed){this.failed=true;this.connected=false;this.retryAt=this.now()+retryDelay(this.attempt++);}};
  try{
   const stop=await this.listen({idToken,uid,
    changed:()=>{if(current())this.changed();},
    binding:status=>{if(current()&&status!=='approved')this.revoked();},
    connection:connected=>{if(current()&&!this.failed){this.connected=connected;if(connected)this.attempt=0;}},failed});
   if(current())this.stop=stop;else await stop();
  }catch{failed();}
 }
 async close(){this.closed=true;this.connected=false;this.generation++;await this.starting;await this.stop?.();this.stop=null;}
}
