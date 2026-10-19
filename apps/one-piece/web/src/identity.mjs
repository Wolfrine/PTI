import { initialSeason } from './model.mjs';
import { stopAccessObservers } from './access.mjs';

export const accountSnapshot=app=>({uid:app.s.user?.uid??null,generation:app.accountGeneration});
export const isCurrentAccount=(app,snapshot)=>snapshot.uid===(app.s.user?.uid??null)&&snapshot.generation===app.accountGeneration;

/** Replace identity-owned state, rather than carrying fields across Google accounts. */
export function resetAccountContext(app,user,defaults){
 if((app.s.user?.uid??null)===(user?.uid??null)){app.s.user=user;return false;}
 const {catalog,requestedEpisode,requestedSeason,requestedRange,appIdentity}=app.s;
 stopAccessObservers(app);
 app.accountGeneration=(app.accountGeneration??0)+1;
 app.player?.destroy();
 Object.assign(app,{player:null,delivery:null,loadedKey:null,eventQueue:[],flushing:null,polling:false,sending:false,loading:false,lastHeartbeat:0,pendingPosition:null,pendingAutoplay:undefined,targetId:null,audioTarget:undefined,preferenceAttempt:undefined,deepLinkHandled:false});
 app.s={user,me:null,profile:{...defaults},catalog,progress:{},lastEpisodeId:null,session:null,lease:null,route:'library',season:initialSeason({requestedEpisode,requestedSeason,requestedRange}),query:'',booting:false,network:'checking',error:null,notice:'',dialog:null,sessionError:null,requestedEpisode,requestedSeason,requestedRange,appIdentity};
 return true;
}
