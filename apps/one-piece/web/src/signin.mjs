export function signInFailure(code){
 if(code==='auth/popup-blocked')return 'Chrome blocked the Google window. Allow pop-ups for this One Piece app, then try Sign in again.';
 if(['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(code))return 'Google sign-in was closed. Choose Sign in with Google when you’re ready.';
 if(code==='auth/network-request-failed')return 'Google could not be reached. Check your connection and try again.';
 if(code==='auth/unauthorized-domain')return 'Google sign-in is not authorized for this One Piece address. Please report this connection issue.';
 return 'Google sign-in could not finish. Try again in Chrome.';
}
