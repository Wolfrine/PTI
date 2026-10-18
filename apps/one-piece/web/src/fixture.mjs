import { startApp } from './app.mjs';
import { episodeId, errorCopy } from './model.mjs';
import { observeReviewFrames } from './review-frames.mjs';
// Imported only by the __DEV__ branch. This account never authenticates or writes to Firebase.
export async function renderFixture(){
 const p=new URLSearchParams(location.search),kind=p.get('fixture')??'library';
 const response=await fetch('/one-piece/catalog.json'),catalog=await response.json();
 if(kind==='media'){await renderMediaFixture(catalog,p);return;}
 const selected=kind==='end'?1085:Number(p.get('episode'))||1000;
 const lease={sessionId:'fixture-session-0001',deviceId:'fixture-device',destination:kind==='remote'?'cast':'local',generation:1,authorityEpoch:1,revision:1,expiresAt:Date.now()+120000};
 const playback={durationSeconds:1440,mode:'compatible-h264',selected:{audioIndex:1,subtitleIndex:2,audioLanguage:'jpn',subtitleLanguage:'eng'},tracks:[{index:1,type:'audio',language:'jpn',title:'Japanese'},{index:3,type:'audio',language:'eng',title:'English'},{index:2,type:'subtitle',language:'eng',fullEnglish:true}]};
 const cast={receiverId:'00000000-0000-4000-a000-000000000001',owned:true,episodeId:episodeId(selected),state:'PLAYING',positionSeconds:600,durationSeconds:1440,subtitleEnabled:true,volume:.42};
 const preparation=['preparing','prep-error'].includes(kind),session={episodeId:episodeId(selected),episodeNumber:selected,state:kind==='prep-error'?'error':preparation?'downloading':'ready',progress:{state:'downloading',receivedBytes:246000000,totalBytes:844716819},playback:preparation?null:playback,lease,...(kind==='remote'?{cast}:{}),next:selected>=1085?null:{episodeNumber:selected+1,state:selected===589?'missing':'ready'}};
 const progress={[episodeId(selected)]:{episodeId:episodeId(selected),positionSeconds:600,durationSeconds:1440,updatedAt:Date.now(),watched:false}};
 const initial={designRevision:'Cycle 4 · settings and continuity',catalog,booting:false,network:kind==='offline'?'offline':'online',user:{uid:'fixture-viewer',displayName:kind==='long'?'Alexandria A very long family account label for responsive review':'Family viewer',email:'viewer@example.invalid'},me:{uid:'fixture-viewer',ownerUid:'fixture-viewer',role:'owner'},profile:{audioLanguage:'ja',subtitleLanguage:'en',autoplay:false,showTitles:false},range:kind==='fresh'?1:kind==='missing'?551:951,progress:['fresh','unknown-error'].includes(kind)?{}:progress,lastEpisodeId:kind==='fresh'?null:episodeId(selected),route:['watch','remote','preparing','prep-error','error','unknown-error','end','tracks','device','busy'].includes(kind)?'watch':'library',selectedNumber:selected,lease,session,receiverName:'Bedroom TV (fixture)',requestedEpisode:kind==='fresh'?1:null,failurePhase:kind==='prep-error'?'preparation':null,
  notice:kind==='offline'?'The home PC is not connected. You can still browse your library.':'',sessionError:kind==='prep-error'?['Episode preparation was interrupted','Retry preparation, or return to the library while the connection recovers.']:['error','unknown-error'].includes(kind)?['Playback was interrupted','Retry from your saved position.']:null,query:kind==='empty'?'not-an-episode':''};
 if(kind==='settings')initial.dialog='account';
 if(kind==='disconnect-unconfirmed'){initial.designRevision='Final states · synthetic review';initial.dialog='offline-signout';}
 if(kind==='unsupported-delivery'){initial.designRevision='Final states · synthetic review';initial.route='watch';initial.sessionError=errorCopy('delivery-type-unsupported');}
 if(kind==='tracks')initial.dialog='tracks';
 if(kind==='resume'){initial.dialog='resume-conflict';initial.resumeConflict={episodeId:episodeId(selected),positionSeconds:20,savedPosition:600};}
 if(kind==='takeover'){initial.dialog='takeover';initial.conflictEpisode=1001;}
 if(kind==='device'||kind==='busy'){initial.dialog='cast';initial.devices=[{receiverId:cast.receiverId,name:'Bedroom TV (fixture)',available:true,busy:kind==='busy'}];initial.fixtureBusy=kind==='busy';}
 const fixture={initial,request:async route=>route==='/api/cast/devices'?{devices:[{receiverId:cast.receiverId,name:'Bedroom TV (fixture)',model:'Sony BRAVIA',available:true,busy:kind==='busy'}]}:{},
  open(app,n,{audioIndex,resumePosition}={}){app.s.dialog=null;app.s.route='watch';const chosen=audioIndex??(app.s.profile.audioLanguage==='en'?3:1);app.s.session={...session,state:'ready',episodeId:episodeId(n),episodeNumber:n,playback:{...playback,selected:{...playback.selected,audioIndex:chosen,audioLanguage:chosen===3?'eng':'jpn'}}};app.s.lease={...lease,destination:'local'};app.s.session.next=n>=1085?null:{episodeNumber:n+1,state:n===589?'missing':'ready'};if(resumePosition!==undefined)app.s.progress[episodeId(n)]={episodeId:episodeId(n),positionSeconds:resumePosition,durationSeconds:1440,updatedAt:Date.now(),watched:false};app.s.awaitingTarget=false;app.s.sessionError=null;app.render();},
  cast(app,receiverId,takeover){if(app.s.fixtureBusy&&!takeover){app.s.pendingReceiver=receiverId;app.s.dialog='tv-takeover';app.dialog();return;}app.s.lease={...app.s.lease,destination:'cast'};app.s.session={...app.s.session,cast:{...cast,episodeId:app.s.session.episodeId},lease:app.s.lease};app.s.dialog=null;app.s.receiverName='Bedroom TV (fixture)';app.render();},
  command(app,action,value){const c=app.s.session.cast;if(action==='play')c.state='PLAYING';if(action==='pause')c.state='PAUSED';if(action==='seek')c.positionSeconds=value;if(action==='volume')c.volume=value;if(action==='subtitles')c.subtitleEnabled=value;if(action==='next'){app.s.session.episodeNumber++;app.s.session.episodeId=episodeId(app.s.session.episodeNumber);c.episodeId=app.s.session.episodeId;c.positionSeconds=0;app.render();}app.patch();},
  record(app,reason,position){const id=app.s.session.episodeId;app.s.progress[id]={episodeId:id,positionSeconds:position,durationSeconds:1440,watched:reason==='mark-watched'||reason==='ended',updatedAt:Date.now()};app.s.lastEpisodeId=id;},
  disconnect(app){app.s.lease={...app.s.lease,destination:'local'};app.s.session.cast=null;app.s.session.lease=app.s.lease;app.render();},
  cancel(app){app.s.route='library';app.s.session=null;app.s.lease=null;app.s.notice='Preparation cancelled.';app.render();}};
 startApp({fixture});
}

/** Loopback review only. Production never imports this module or starts this harness. */
async function renderMediaFixture(catalog,params){
 const allowed=new Set([1000,1001]),requested=Number(params.get('episode')),number=allowed.has(requested)?requested:1000;
 let currentDelivery=null,sequence=0,stopFrames=()=>{};
 const lease={sessionId:'fixture-real-media',deviceId:'fixture-device',destination:'local',generation:1,authorityEpoch:1,revision:1,expiresAt:Date.now()+120000};
 const initial={designRevision:'Cycle 5 · real source playback',realMedia:true,catalog,booting:false,network:'online',user:{uid:'fixture-viewer',displayName:'Family viewer',email:'viewer@example.invalid'},me:{uid:'fixture-viewer',ownerUid:'fixture-viewer',role:'owner'},profile:{audioLanguage:'ja',subtitleLanguage:'en',autoplay:false,showTitles:false},range:951,progress:{},lastEpisodeId:null,route:'watch',selectedNumber:number,lease,session:{episodeId:episodeId(number),episodeNumber:number,state:'preparing',playback:null},notice:'Review harness: real cached media; account and progress stay local to this page.'};
 const fixture={realMedia:true,initial,
  async request(route){if(route.endsWith('/delivery')&&currentDelivery)return currentDelivery;if(route==='/api/cast/devices')return {devices:[]};throw Object.assign(new Error('Review route unavailable'),{code:'companion-offline'});},
  start:app=>fixture.open(app,number),
  async open(app,n,{audioIndex,resumePosition}={}){
   if(!allowed.has(n)){app.s.notice='This review harness contains only episodes 1000 and 1001. No additional source is requested.';app.patch();return;}
   if(audioIndex!==undefined&&audioIndex!==currentDelivery?.playback.selected.audioIndex){app.s.profile.audioLanguage='ja';app.s.notice='The review delivery is prepared with inspected Japanese audio. Other audio selections require a separate preparation test.';app.closeDialog();app.patch();return;}
   const revision=++sequence;stopFrames();app.player?.destroy();app.player=null;app.delivery=null;app.loadedKey=null;app.targetId=episodeId(n);app.s.selectedNumber=n;app.s.route='watch';app.s.dialog=null;app.s.sessionError=null;app.s.session={episodeId:episodeId(n),episodeNumber:n,state:'preparing',playback:null};app.render();
   try{const response=await fetch(`http://127.0.0.1:18102/dev/delivery/${n}`,{credentials:'omit',cache:'no-store',redirect:'error'});if(!response.ok)throw 0;const delivery=await response.json();if(revision!==sequence)return;
    if(delivery.episodeId!==episodeId(n)||!delivery.playback?.selected||!delivery.playback.tracks?.length)throw 0;
    currentDelivery=delivery;app.s.session={episodeId:delivery.episodeId,episodeNumber:n,state:'ready',playback:delivery.playback,lease,next:null};app.s.lease={...lease};app.pendingPosition=resumePosition??app.s.progress[delivery.episodeId]?.positionSeconds??0;app.pendingAutoplay=true;app.s.awaitingTarget=false;app.s.notice='Review harness: real cached media; account and progress stay local to this page.';app.render();app.attachPlayer();stopFrames=observeReviewFrames(app.player?.video,n);await app.loadDelivery();
   }catch{if(revision!==sequence)return;app.s.sessionError=['The review media connection is unavailable','Ask the coordinator to reopen the bounded loopback media window.'];app.render();}
  },
  record(app,reason,position){if(!Number.isFinite(position)||!app.s.session?.playback)return;const id=app.s.session.episodeId;app.s.progress[id]={episodeId:id,positionSeconds:position,durationSeconds:app.s.session.playback.durationSeconds,watched:reason==='mark-watched'||reason==='ended',updatedAt:Date.now()};app.s.lastEpisodeId=id;},
  cast(app){app.s.notice='Actual TV controls are tested separately on the receiver, outside this browser review harness.';app.closeDialog();app.patch();},
  command(){},disconnect(){},cancel(app){sequence++;stopFrames();app.player?.destroy();app.player=null;app.delivery=null;app.s.session=null;app.s.lease=null;app.s.route='library';app.render();}
 };
 startApp({fixture});
}


