// Network reachability and the PC's retained account access are separate checks.
export const needsGoogleConfirmation=code=>['viewer-not-paired','viewer-reauthentication-required'].includes(code);
export function confirmationError(error){
 const code=error?.code??error?.message;
 if(['companion-offline','companion-timeout'].includes(code))return 'Google confirmation could not reach your home PC. Check the home connection and try again.';
 if(code==='auth/popup-blocked')return 'Your browser blocked the Google window. Open One Piece in Chrome and allow pop-ups for this site, then try Connect account.';
 if(['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(code))return 'The Google window closed before confirmation finished. Your existing account connection has not been disconnected.';
 if(['auth/user-mismatch','viewer-identity-mismatch'].includes(code))return 'Choose the same Google account shown here. A different account cannot connect this profile.';
 if(['viewer-identity-unavailable','viewer-credential-unavailable','auth/network-request-failed'].includes(code))return 'The account service is temporarily unavailable. Check the connection and try again shortly.';
 if(['not-invited','member-inactive','workspace-disabled'].includes(code))return 'This account does not currently have family access. Ask the family owner to check the invitation.';
 return 'The account connection did not complete. Check the home connection, then try Connect account again.';
}
export function connectionStatus(s){
 if(s.network==='checking')return {title:'Checking your home connection…',detail:'Checking the PC and your account.',kind:'checking'};
 if(s.network!=='online')return {title:'This device cannot reach the home PC.',detail:'Keep the PC companion running and use the same home Wi-Fi. If you previously denied local-network access, allow it in your browser’s site settings.',kind:'offline'};
 if(s.error||!s.me)return {title:'The PC is reachable. Your account needs attention.',detail:s.error?.[1]??'Check again to finish checking your account.',kind:'account-error'};
 if(s.me.playbackAccess?.state==='confirmation-required')return {title:'Connect your account once.',detail:'Confirm your Google account so the PC can prepare episodes and keep the TV playing when your phone sleeps.',kind:'confirmation-required'};
 if(s.me.playbackAccess?.state==='ready')return {title:'You’re ready to watch.',detail:'This device can reach your home PC. Your Google account is already connected; no separate phone pairing is needed.',kind:'ready'};
 return {title:'The PC is connected. Playback access is unavailable.',detail:'Your account connection could not be checked yet. Try Check connection shortly; you do not need to reconnect Google unless the app asks.',kind:'unavailable'};
}
