export const ONE_PIECE_ORIGIN='https://pti-app-2ab59-one-piece.web.app';
export const PTI_ORIGIN='https://pti-app-2ab59.web.app';
export function appIdentity(location=globalThis.location){
 const origin=location?.origin;
 return {dedicated:[ONE_PIECE_ORIGIN,'https://pti-app-2ab59-one-piece.firebaseapp.com'].includes(origin),legacy:origin===PTI_ORIGIN||origin==='https://pti-app-2ab59.firebaseapp.com'};
}
export function dedicatedAppUrl(location=globalThis.location){
 const path=location?.pathname??'/one-piece/';
 const safePath=path==='/one-piece'||path.startsWith('/one-piece/')?path:'/one-piece/';
 return `${ONE_PIECE_ORIGIN}${safePath}${location?.search??''}${location?.hash??''}`;
}
// An intentional rewind or an offline event must stay on its original origin
// until the shared PC has accepted it. Never move credentials between origins.
export const canMoveToDedicatedApp=({pendingEvents=0,resumeConflict=null}={})=>pendingEvents===0&&!resumeConflict;
export function installStatus({dedicated=false,standalone=false,promptAvailable=false}={}){
 if(!dedicated)return {kind:'move',label:'Open One Piece app'};
 if(standalone)return {kind:'installed',label:'One Piece is installed'};
 return {kind:promptAvailable?'prompt':'help',label:'Install One Piece'};
}
