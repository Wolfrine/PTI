export function accessGate(state){
 if(!state.user||state.booting)return null;
 if(state.accessPaused)return 'paused';
 if(state.setupRequired)return 'setup';
 if(!state.me)return state.error?'unavailable':state.network==='offline'?null:'checking';
 if(!state.me.needsApproval&&state.me.role!=='pending')return null;
 if(state.accessRequest?.status==='declined')return 'declined';
 if(state.network==='offline')return 'unavailable';
 if(state.accessRequest?.status==='approved')return state.approvalChecking?'checking':'paused';
 return state.accessError?'error':'pending';
}
export const pendingAccessCount=requests=>(requests??[]).filter(request=>request.status==='pending').length;
export function stopAccessObservers(app){
 for(const key of ['accessStop','familyStop']){try{app[key]?.();}catch{}app[key]=null;}
 Object.assign(app,{accessWatchKey:null,familyWatchKey:null,accessEnsuredKey:null,approvalRefreshRevision:null,approvalReconnect:false,familyLoading:false,familyReload:false,familyMarkup:null,familyTarget:null,connecting:false});
}
export function applyAccessRequestUpdate(app,account,value){
 if(account.uid!==app.s.user?.uid||account.generation!==app.accountGeneration)return false;
 app.s.accessRequest=value;app.s.accessError=null;
 const revision=`${value?.uid}:${value?.revision}`;
 if(value?.status!=='approved'||app.approvalRefreshRevision===revision)return false;
 app.approvalRefreshRevision=revision;
 return true;
}
