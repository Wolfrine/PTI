import {initializeServerApp,deleteApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {getFirestore,doc,onSnapshot,terminate} from 'firebase/firestore';

// Public SDK user-context authentication. No Admin credential or custom-token
// minting is needed; only the notification document is readable by this user.
export async function listenForDispatch({firebase,idToken,uid,changed,connection,failed}) {
  const app=initializeServerApp(firebase,{authIdToken:idToken});
  const db=getFirestore(app),auth=getAuth(app);
  let unsubscribe,closed=false,connected=false,revision;
  try{
    await auth.authStateReady();
    if(auth.currentUser?.uid!==uid)throw Error('Notification account mismatch.');
    unsubscribe=onSnapshot(doc(db,`_ptiLocalServices/local-codex/owners/${uid}/signals/dispatch`),{includeMetadataChanges:true},snapshot=>{
      if(closed)return;
      const online=!snapshot.metadata.fromCache;
      const data=snapshot.data();
      if(data&&(data.schemaVersion!==1||typeof data.revision!=='string')){connected=false;connection(false);failed(Error('Invalid dispatch notification.'));return;}
      const resumed=online&&!connected;
      connected=online;connection(online);
      if(online&&(resumed||data?.revision!==revision)){revision=data?.revision;changed();}
    },error=>{if(!closed){connected=false;connection(false);failed(error);}});
  }catch(error){await terminate(db).catch(()=>{});await deleteApp(app);throw error;}
  return async()=>{closed=true;unsubscribe?.();await terminate(db).catch(()=>{});await deleteApp(app);};
}
