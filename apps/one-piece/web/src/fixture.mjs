import { startApp } from './app.mjs';
import { episodeId, errorCopy } from './model.mjs';
import { getSeason, seasonForEpisode } from './seasons.mjs';
import { observeReviewFrames } from './review-frames.mjs';
// Imported only by the __DEV__ branch. This account never authenticates or writes to Firebase.
export async function renderFixture(){
 const p=new URLSearchParams(location.search),kind=p.get('fixture')??'library';
 const response=await fetch('/one-piece/catalog.json'),catalog=await response.json();
 if(kind==='media'){await renderMediaFixture(catalog,p);return;}
 const selected=kind==='end'?1085:kind==='missing'?590:Number(p.get('episode'))||1000;
 const lease={sessionId:'fixture-session-0001',deviceId:'fixture-device',destination:kind==='remote'?'cast':'local',generation:1,authorityEpoch:1,revision:1,expiresAt:Date.now()+120000};
 const playback={durationSeconds:1440,mode:'compatible-h264',selected:{audioIndex:1,subtitleIndex:2,audioLanguage:'jpn',subtitleLanguage:'eng'},tracks:[{index:1,type:'audio',language:'jpn',title:'Japanese'},{index:3,type:'audio',language:'eng',title:'English'},{index:2,type:'subtitle',language:'eng',fullEnglish:true}]};
 const cast={receiverId:'00000000-0000-4000-a000-000000000001',owned:true,episodeId:episodeId(selected),state:'PLAYING',positionSeconds:600,durationSeconds:1440,subtitleEnabled:true,volume:.42};
 const preparation=['preparing','prep-error'].includes(kind),session={episodeId:episodeId(selected),episodeNumber:selected,state:kind==='prep-error'?'error':preparation?'downloading':'ready',progress:{state:'downloading',receivedBytes:246000000,totalBytes:844716819},playback:preparation?null:playback,lease,...(kind==='remote'?{cast}:{}),next:selected>=1085?null:{episodeNumber:selected+1,state:selected===589?'missing':'ready'}};
 const progress={[episodeId(selected)]:{episodeId:episodeId(selected),positionSeconds:600,durationSeconds:1440,updatedAt:Date.now(),watched:false}};
 const initial={designRevision:'Cycle 4 · settings and continuity',catalog,booting:false,network:kind==='offline'?'offline':'online',user:{uid:'fixture-viewer',displayName:kind==='long'?'Alexandria A very long family account label for responsive review':'Family viewer',email:'viewer@example.invalid'},me:{uid:'fixture-viewer',ownerUid:'fixture-viewer',role:'owner'},profile:{audioLanguage:'ja',subtitleLanguage:'en',autoplay:false,showTitles:false},season:getSeason(Number(p.get('season'))||seasonForEpisode(kind==='fresh'?1:selected)?.number).number,progress:['fresh','unknown-error'].includes(kind)?{}:progress,lastEpisodeId:kind==='fresh'?null:episodeId(selected),route:['watch','remote','preparing','prep-error','error','unknown-error','end','tracks','device','busy'].includes(kind)?'watch':'library',selectedNumber:selected,lease,session,receiverName:'Bedroom TV (fixture)',requestedEpisode:kind==='fresh'?1:null,failurePhase:kind==='prep-error'?'preparation':null,
  notice:kind==='offline'?'The home PC is not connected. You can still browse your library.':'',sessionError:kind==='prep-error'?['Episode preparation was interrupted','Retry preparation, or return to the library while the connection recovers.']:['error','unknown-error'].includes(kind)?['Playback was interrupted','Retry from your saved position.']:null,query:kind==='empty'?'not-an-episode':''};
 initial.me.playbackAccess={state:'ready'};
 if(kind==='cast-seek-error'){lease.destination='cast';cast.state='PAUSED';initial.route='watch';initial.session.cast=cast;initial.notice=errorCopy('cast-seek-not-confirmed').join('. ');}
 if(['dedicated','install-help','installed'].includes(kind))initial.appIdentity={dedicated:true,legacy:false,standalone:kind==='installed'};
 if(kind==='sign-in'){initial.user=null;initial.me=null;initial.appIdentity={dedicated:true,legacy:false,standalone:false};}
 if(['access-pending','access-declined','access-paused','access-error'].includes(kind)){initial.user={uid:'fixture-requester',displayName:'Alexandria A very long family account name for review',email:'alexandria.family.member.with.a.long.address@example.invalid'};initial.me={uid:'fixture-requester',ownerUid:'fixture-viewer',role:'pending',needsApproval:true};initial.accessRequest={uid:'fixture-requester',email:initial.user.email,name:initial.user.displayName,status:kind==='access-declined'?'declined':kind==='access-paused'?'approved':'pending',revision:1};if(kind==='access-error')initial.accessError='Your request could not be sent. Check again to retry.';initial.session=null;initial.lease=null;initial.route='library';initial.appIdentity={dedicated:true};}
 if(kind==='owner-requests'){initial.dialog='family';initial.familyLoaded=true;initial.familyRequests=[{uid:'fixture-requester',name:'Alexandria A very long family account name for approval',email:'alexandria.family.member.with.a.long.address@example.invalid',status:'pending',revision:1},{uid:'fixture-requester-2',name:'Family viewer',email:'viewer.two@example.invalid',status:'pending',revision:1},{uid:'fixture-declined',name:'Reviewed account',email:'reviewed@example.invalid',status:'declined',revision:2}];initial.familyMembers=[{uid:'fixture-member',name:'Existing family member',email:'member@example.invalid',active:true,role:'member'},{uid:'fixture-paused',name:'Paused family member',email:'paused@example.invalid',active:false,role:'member'}];}
 if(kind==='legacy-app')initial.appIdentity={dedicated:false,legacy:true,standalone:false};
 if(['install-help','installed'].includes(kind))initial.dialog='install';
 if(kind==='settings')initial.dialog='account';
 if(['connection','unpaired','account-unavailable'].includes(kind)){initial.dialog='connection';if(kind==='unpaired')initial.me.playbackAccess={state:'confirmation-required',code:'viewer-not-paired'};if(kind==='account-unavailable')initial.me.playbackAccess={state:'unavailable',code:'viewer-identity-unavailable'};}
 if(kind==='disconnect-unconfirmed'){initial.designRevision='Final states · synthetic review';initial.dialog='offline-signout';}
 if(kind==='unsupported-delivery'){initial.designRevision='Final states · synthetic review';initial.route='watch';initial.sessionError=errorCopy('delivery-type-unsupported');}
 if(kind==='tracks')initial.dialog='tracks';
 if(kind==='resume'){initial.dialog='resume-conflict';initial.resumeConflict={episodeId:episodeId(selected),positionSeconds:20,savedPosition:600};}
 if(kind==='takeover'){initial.dialog='takeover';initial.conflictEpisode=1001;}
 if(['device','busy','device-error','device-cached-error'].includes(kind)){initial.dialog='cast';initial.devices=kind==='device-error'?[]:[{receiverId:cast.receiverId,name:'Bedroom TV (fixture)',available:kind!=='device-cached-error',busy:kind==='busy'||kind==='device-cached-error'}];initial.fixtureBusy=kind==='busy';if(kind==='device-error'||kind==='device-cached-error'){initial.route='watch';initial.dialogError=['The TV list could not be refreshed','Try again in a moment. Your saved place is kept.'];}}
 const fixture={initial,request:async route=>route==='/api/cast/devices'?{devices:[{receiverId:cast.receiverId,name:'Bedroom TV (fixture)',model:'Sony BRAVIA',available:true,busy:kind==='busy'}]}:{},
  open(app,n,{audioIndex,resumePosition}={}){app.s.dialog=null;app.s.route='watch';const chosen=audioIndex??(app.s.profile.audioLanguage==='en'?3:1);app.s.session={...session,state:'ready',episodeId:episodeId(n),episodeNumber:n,playback:{...playback,selected:{...playback.selected,audioIndex:chosen,audioLanguage:chosen===3?'eng':'jpn'}}};app.s.lease={...lease,destination:'local'};app.s.session.next=n>=1085?null:{episodeNumber:n+1,state:n===589?'missing':'ready'};if(resumePosition!==undefined)app.s.progress[episodeId(n)]={episodeId:episodeId(n),positionSeconds:resumePosition,durationSeconds:1440,updatedAt:Date.now(),watched:false};app.s.awaitingTarget=false;app.s.sessionError=null;app.render();},
  cast(app,receiverId,takeover){if(app.s.fixtureBusy&&!takeover){app.s.pendingReceiver=receiverId;app.s.dialog='tv-takeover';app.dialog();return;}app.s.lease={...app.s.lease,destination:'cast'};app.s.session={...app.s.session,cast:{...cast,episodeId:app.s.session.episodeId},lease:app.s.lease};app.s.dialog=null;app.s.receiverName='Bedroom TV (fixture)';app.render();},
  command(app,action,value){const c=app.s.session.cast;if(action==='play')c.state='PLAYING';if(action==='pause')c.state='PAUSED';if(action==='seek')c.positionSeconds=value;if(action==='volume')c.volume=value;if(action==='subtitles')c.subtitleEnabled=value;if(action==='next'){app.s.session.episodeNumber++;app.s.session.episodeId=episodeId(app.s.session.episodeNumber);c.episodeId=app.s.session.episodeId;c.positionSeconds=0;app.render();}app.patch();},
  record(app,reason,position){const id=app.s.session.episodeId;app.s.progress[id]={episodeId:id,positionSeconds:position,durationSeconds:1440,watched:reason==='mark-watched'||reason==='ended',updatedAt:Date.now()};app.s.lastEpisodeId=id;},
  disconnect(app){app.s.lease={...app.s.lease,destination:'local'};app.s.session.cast=null;app.s.session.lease=app.s.lease;app.render();},
  cancel(app){app.s.route='library';app.s.session=null;app.s.lease=null;app.s.notice='Preparation cancelled.';app.render();},
  reviewAccess(app,uid,approve){const row=app.s.familyRequests.find(value=>value.uid===uid);if(!row)return;row.status=approve?'approved':'declined';if(approve)app.s.familyMembers.push({uid:row.uid,name:row.name,email:row.email,active:true,role:'member'});app.patchFamily();},
  toggleMember(app,email){const member=app.s.familyMembers.find(value=>value.email===email);if(member){member.active=!member.active;app.patchFamily();}}};
 startApp({fixture});
}

/** Loopback review only. Production never imports this module or starts this harness. */
async function renderMediaFixture(catalog,params){
 const allowed=new Set([1000,1001]),requested=Number(params.get('episode')),number=allowed.has(requested)?requested:1000;
 let currentDelivery=null,sequence=0,stopFrames=()=>{};
 const lease={sessionId:'fixture-real-media',deviceId:'fixture-device',destination:'local',generation:1,authorityEpoch:1,revision:1,expiresAt:Date.now()+120000};
 const initial={designRevision:'Cycle 5 · real source playback',realMedia:true,catalog,booting:false,network:'online',user:{uid:'fixture-viewer',displayName:'Family viewer',email:'viewer@example.invalid'},me:{uid:'fixture-viewer',ownerUid:'fixture-viewer',role:'owner'},profile:{audioLanguage:'ja',subtitleLanguage:'en',autoplay:false,showTitles:false},season:seasonForEpisode(number).number,progress:{},lastEpisodeId:null,route:'watch',selectedNumber:number,lease,session:{episodeId:episodeId(number),episodeNumber:number,state:'preparing',playback:null},notice:'Review harness: real cached media; account and progress stay local to this page.'};
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


