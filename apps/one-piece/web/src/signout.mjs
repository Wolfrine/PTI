/** Local sign-out follows acknowledged PC revocation, or a separate explicit choice. */
export async function disconnectBeforeSignOut({request,isCurrent,signOut,onUnconfirmed}){
 if(!isCurrent())return 'identity-changed';
 try{await request('/api/pair-viewer',undefined,{method:'DELETE'});}
 catch{if(!isCurrent())return 'identity-changed';onUnconfirmed();return 'disconnect-unconfirmed';}
 if(!isCurrent())return 'identity-changed';
 await signOut();return 'signed-out';
}
