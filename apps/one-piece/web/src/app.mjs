import { auth, observeAccount, defaults, signInToOnePiece, freshGoogleConfirmation, createWorkspace, claimInvitation, readProfile, saveProfile, ensureAccessRequest, observeAccessRequest, observeFamilyAccess, listFamilyAccess, reviewAccessRequest, inviteMember, logout } from './account.mjs';
import { createClient, ClientError } from './client.mjs';
import { icon } from './icons.mjs';
import { episodeId, episodeNumber, escapeHtml as esc, time, bytes, initialSeason, selectLibrarySeason, nextBoundary, phaseLabel, errorCopy, safeLocalProgress, validPendingEvent, shouldAutoplayDelivery } from './model.mjs';
import { SEASONS } from './seasons.mjs';
import { LocalPlayer } from './player.mjs';
import { handleWatchKeyboard } from './keyboard.mjs';
import { accountSnapshot, isCurrentAccount, resetAccountContext } from './identity.mjs';
import { disconnectBeforeSignOut } from './signout.mjs';
import { applyTheme, readTheme } from './theme.mjs';
import { withArtwork } from './artwork.mjs';
import { needsGoogleConfirmation, confirmationError } from './connection.mjs';
import { appIdentity, dedicatedAppUrl, canMoveToDedicatedApp, installStatus } from './install.mjs';
import { page, rows, dialogContent, familyAccessContent, button, iconButton, ready, connectionLabel } from './views.mjs';
import { signInFailure } from './signin.mjs';
import { accessGate, pendingAccessCount, stopAccessObservers, applyAccessRequestUpdate } from './access.mjs';
const store={get:(key,fallback)=>{try{const raw=localStorage.getItem(key);return raw&&raw.length<1048576?JSON.parse(raw):fallback;}catch{return fallback;}},set:(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}}};
const deviceId=store.get('one-piece-device',null)??crypto.randomUUID();store.set('one-piece-device',deviceId);

export function startApp(options={}){const app=new ViewingApp();if(__DEV__&&options.fixture){app.fixture=options.fixture;app.request=options.fixture.request;app.s={...app.s,...options.fixture.initial,fixture:true};app.s.catalog=withArtwork(app.s.catalog);app.render();void options.fixture.start?.(app);}else void app.start();return app;}
class ViewingApp {
 constructor(){
  this.root=document.querySelector('#app');this.accountGeneration=0;this.player=null;this.loadedKey=null;this.delivery=null;this.eventQueue=[];this.sending=false;this.polling=false;this.loading=false;this.lastHeartbeat=0;this.pendingPosition=null;
  const p=new URLSearchParams(location.search),raw=p.get('episode'),n=/^\d{1,4}$/.test(raw??'')?Number(raw):episodeNumber(raw);
  const requestedEpisode=Number.isInteger(n)&&n>=1&&n<=1085?n:null,requestedSeason=p.get('season'),requestedRange=p.get('range');
  this.s={user:null,me:null,profile:{...defaults},catalog:null,progress:{},lastEpisodeId:null,session:null,lease:null,route:'library',season:initialSeason({requestedEpisode,requestedSeason,requestedRange}),query:'',booting:true,network:'checking',error:null,notice:'',dialog:null,sessionError:null,appIdentity:{...appIdentity(),standalone:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true},requestedEpisode,requestedSeason,requestedRange};
  this.request=createClient(()=>{if((auth.currentUser?.uid??null)!==(this.s.user?.uid??null))throw new ClientError('identity-changed');return this.s.user;},()=>this.accountGeneration);
  this.root.addEventListener('click',e=>{const account=this.account();void this.click(e).catch(()=>{if(this.current(account))this.failure();});});
  this.root.addEventListener('submit',e=>void this.submit(e));
  this.root.addEventListener('change',e=>{const account=this.account();void this.change(e).catch(()=>{if(this.current(account))this.failure();});});
  this.root.addEventListener('input',e=>{if(e.target.id==='episode-search'){this.s.query=e.target.value;this.renderRows();}});
  this.root.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement){e.target.hidden=true;e.target.closest('.episode-art,.hero-art,.remote-art')?.classList.add('art-unavailable');}},true);
  document.addEventListener('keydown',e=>this.keyboard(e));
  window.addEventListener('online',()=>{void this.connect();void this.flush();});
  window.addEventListener('offline',()=>{this.s.network='offline';this.s.notice='You are offline. Your place is saved on this device.';this.patch();});
  window.addEventListener('pagehide',()=>{if(this.player)this.record('pause',this.player.position);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){void this.poll();void this.flush();}else if(this.player)this.record('heartbeat',this.player.position);});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();this.installPrompt=e;this.patch();});
  window.addEventListener('appinstalled',()=>{this.installPrompt=null;this.s.appIdentity.installationRequested=true;this.patch();});
 }
 async start(){
  this.render();
  try{const r=await fetch('/one-piece/catalog.json',{cache:'no-cache'});if(!r.ok)throw 0;this.s.catalog=withArtwork(await r.json());}catch{this.s.error=['The library could not load','Reconnect and try again.'];}
  observeAccount(async user=>{const changed=resetAccountContext(this,user,defaults);this.s.booting=false;if(user&&changed)this.restore();this.render();if(user)await this.connect();});
  this.pollTimer=setInterval(()=>void this.poll(),2000);
  this.renewTimer=setInterval(()=>{if(this.s.lease){const account=this.account();void this.request(`/api/sessions/${this.s.lease.sessionId}/renew`,{}).then(r=>{if(this.current(account))this.mergeLease(r.lease);}).catch(e=>{if(this.current(account))this.runtimeError(e);});}},30000);
  void this.worker();
 }
 account(){return accountSnapshot(this);}
 current(account){return isCurrentAccount(this,account)&&((__DEV__&&this.fixture)||(auth.currentUser?.uid??null)===account.uid);}
 key(part){return `one-piece:${this.s.user?.uid??'none'}:${part}`;}
 restore(){const saved=store.get(this.key('progress'),{}),pending=store.get(this.key('pending'),[]);this.s.progress=safeLocalProgress(saved?.progress);this.s.lastEpisodeId=this.s.progress[saved?.lastEpisodeId]?saved.lastEpisodeId:null;this.eventQueue=Array.isArray(pending)?pending.filter(validPendingEvent).slice(0,100):[];this.s.season=initialSeason({requestedEpisode:this.s.requestedEpisode,requestedSeason:this.s.requestedSeason,requestedRange:this.s.requestedRange,savedSeason:store.get(this.key('season'),null),legacyRange:store.get(this.key('range'),null)});store.set(this.key('season'),this.s.season);}
 persist(){store.set(this.key('progress'),{progress:this.s.progress,lastEpisodeId:this.s.lastEpisodeId});store.set(this.key('pending'),this.eventQueue);}
 selectSeason(number){const url=selectLibrarySeason(this.s,number,location.href);store.set(this.key('season'),this.s.season);history.replaceState(null,'',url);this.render();this.root.querySelector('#episode-season')?.focus();}
 watchAccess(ownerUid,account){
  const key=`${account.generation}:${ownerUid}:${account.uid}`;if(this.accessWatchKey===key)return;
  this.accessStop?.();this.accessWatchKey=key;
  this.accessStop=observeAccessRequest(ownerUid,value=>{if(!this.current(account)||this.accessWatchKey!==key)return;const approved=applyAccessRequestUpdate(this,account,value);if(approved)this.s.approvalChecking=true;this.render();if(approved){if(this.connecting)this.approvalReconnect=true;else void this.connect();}},()=>{if(!this.current(account)||this.accessWatchKey!==key)return;this.accessWatchKey=null;this.s.accessError='Approval updates could not connect. Use Check again to retry.';this.render();});
 }
 watchFamily(ownerUid,account){
  const key=`${account.generation}:${ownerUid}`;if(this.familyWatchKey===key)return;
  this.familyStop?.();this.familyWatchKey=key;
  this.familyStop=observeFamilyAccess(ownerUid,requests=>{if(!this.current(account)||this.familyWatchKey!==key)return;this.s.familyRequests=requests;this.s.familyError=null;this.patchFamily();if(this.s.dialog==='family')void this.loadFamilyAccess();},()=>{if(!this.current(account)||this.familyWatchKey!==key)return;this.familyWatchKey=null;this.s.familyError='Live requests could not connect. Check again to refresh.';this.patchFamily();});
 }
 async loadFamilyAccess(){
  if(this.fixture||this.s.me?.role!=='owner')return;if(this.familyLoading){this.familyReload=true;return;}
  const account=this.account(),ownerUid=this.s.me.ownerUid;this.familyLoading=true;
  try{const result=await listFamilyAccess(ownerUid);if(!this.current(account)||this.s.me?.role!=='owner')return;if(!this.familyWatchKey||!this.s.familyRequests)this.s.familyRequests=result.requests;this.s.familyMembers=result.members;this.s.familyError=null;this.s.familyLoaded=true;this.patchFamily();}
  catch{if(this.current(account)){this.s.familyError='Family access could not refresh. Try again.';this.patchFamily();}}
  finally{if(this.current(account)){this.familyLoading=false;if(this.familyReload){this.familyReload=false;void this.loadFamilyAccess();}}}
 }
 patchFamily(){
  const count=pendingAccessCount(this.s.familyRequests);for(const badge of this.root.querySelectorAll('.family-request-count')){badge.textContent=String(count);badge.hidden=!count;}
  const target=this.root.querySelector('#family-access-content');if(target){const html=familyAccessContent(this.s);if(this.familyTarget!==target||this.familyMarkup!==html){target.innerHTML=html;this.familyTarget=target;this.familyMarkup=html;}}
 }
 async connect(){
  if(!this.s.user||this.fixture||this.connecting)return;
  this.connecting=true;
  const account=this.account();
  this.s.network='checking';this.patch();
  try{const health=await this.request('/api/health');if(!this.current(account))return;this.s.network='online';this.s.setupRequired=health.setupRequired;
   if(health.setupRequired){this.s.me=null;this.s.dialog='setup';this.render();return;}
   const me=await this.request('/api/me');if(!this.current(account))return;this.s.me=me;
   this.s.error=null;this.s.accessPaused=false;this.s.approvalChecking=false;
   if(me.needsClaim){await claimInvitation(me.ownerUid);if(!this.current(account))return;this.s.me=await this.request('/api/me');if(!this.current(account))return;}
   if(this.s.me.needsApproval){
    this.player?.destroy();this.player=null;this.delivery=null;this.s.session=null;this.s.lease=null;this.s.dialog=null;this.s.route='library';
    const key=`${account.generation}:${me.ownerUid}:${account.uid}`;
    try{if(this.accessEnsuredKey!==key){const value=await ensureAccessRequest(me.ownerUid);if(!this.current(account))return;this.accessEnsuredKey=key;if(applyAccessRequestUpdate(this,account,value)){this.s.approvalChecking=true;this.approvalReconnect=true;}}this.watchAccess(me.ownerUid,account);}
    catch{if(!this.current(account))return;this.s.accessError='Your request could not be sent. Check again to retry.';}
    this.render();return;
   }
   this.accessStop?.();this.accessStop=null;this.accessWatchKey=null;this.s.accessRequest=null;this.s.accessError=null;
   if(this.s.me.needsWorkspace||this.s.me.needsClaim){this.s.dialog='setup';this.render();return;}
   if(this.s.me.role==='owner')this.watchFamily(me.ownerUid,account);
   try{const profile=await readProfile(me.ownerUid);if(!this.current(account))return;this.s.profile=profile;}catch{if(!this.current(account))return;this.s.notice='Preferences could not sync. Japanese audio and English subtitles are selected.';}
   const data=await this.request('/api/progress');if(!this.current(account))return;this.s.progress={...this.s.progress,...data.progress};this.s.lastEpisodeId=data.lastEpisodeId??this.s.lastEpisodeId;this.s.sync=data.sync;
   const pending=this.eventQueue.at(-1);if(pending&&(!data.lease||pending.generation!==data.lease.generation||pending.authorityEpoch!==data.lease.authorityEpoch)){this.s.resumeConflict={...pending,savedPosition:data.progress[pending.episodeId]?.positionSeconds??0};this.s.notice='This device has a saved place that has not synced. Review it before continuing.';}this.persist();
   if(data.lease&&(data.lease.deviceId===deviceId||data.lease.destination==='cast')){this.mergeLease(data.lease);await this.poll();if(!this.current(account))return;}
   this.s.error=null;if(['The home PC is not connected. You can still browse your library.','You are offline. Your place is saved on this device.'].includes(this.s.notice))this.s.notice='';this.render();void this.flush();if(this.s.requestedEpisode&&!this.deepLinkHandled){this.deepLinkHandled=true;await this.open(this.s.requestedEpisode);}
  }catch(e){if(!this.current(account))return;if(e.code==='member-inactive'){this.player?.destroy();this.player=null;this.delivery=null;this.s.session=null;this.s.lease=null;this.s.accessPaused=true;this.s.error=null;}else if(['companion-offline','companion-timeout'].includes(e.code)){this.s.network='offline';this.s.notice='The home PC is not connected. You can still browse your library.';}else{this.s.error=errorCopy(e.code);}this.render();}
  finally{if(this.current(account)){this.connecting=false;if(this.s.approvalChecking&&!this.approvalReconnect){this.s.approvalChecking=false;this.render();}else this.patch();if(this.approvalReconnect){this.approvalReconnect=false;void this.connect();}}}
 }
 mergeLease(value){if(!value)return;const old=this.s.lease;if(old&&old.sessionId===value.sessionId&&old.generation===value.generation&&old.authorityEpoch===value.authorityEpoch)value={...value,revision:Math.max(old.revision,value.revision)};this.s.lease=value;}
 targetMatches(value){return (!this.targetId||value.episodeId===this.targetId)&&(this.audioTarget===undefined||value.playback?.selected?.audioIndex===this.audioTarget);}
 async poll(){
  if(this.polling||!this.s.lease||this.fixture)return;const account=this.account();this.polling=true;
  try{const old=this.s.session,wasAwaiting=this.s.awaitingTarget,value=await this.request(`/api/sessions/${this.s.lease.sessionId}`);if(!this.current(account))return;this.mergeLease(value.lease);this.s.session=value;this.s.awaitingTarget=!this.targetMatches(value);this.s.sync=value.sync;this.s.network='online';if(!this.s.awaitingTarget)this.s.selectedNumber=value.episodeNumber;
   if(value.state==='error'||value.state==='storage-paused'){this.s.failurePhase='preparation';this.s.sessionError=errorCopy(value.error?.code??'PREPARATION_FAILED');}
   if(value.lease.destination==='cast'){this.player?.pause();if(value.cast?.owned){this.s.lastEpisodeId=value.cast.episodeId;this.s.progress[value.cast.episodeId]={...value.cast,updatedAt:Date.now(),watched:value.cast.state==='IDLE'&&value.cast.idleReason==='FINISHED'};this.persist();}}
   if(this.s.route==='watch'){const structural=!old||old.episodeId!==value.episodeId||Boolean(ready(old))!==Boolean(ready(value))||old.lease?.destination!==value.lease.destination||wasAwaiting!==this.s.awaitingTarget||(old.state!==value.state&&['error','storage-paused'].includes(value.state));if(structural&&!this.s.dialog)this.render();else this.patch();if(ready(value)&&value.lease.destination!=='cast'&&this.targetMatches(value))await this.loadDelivery();}else this.patch();
  }catch(e){if(this.current(account))this.runtimeError(e);}finally{if(this.current(account))this.polling=false;}
 }
 async open(n,{takeover=false,automatic=false,audioIndex,resumePosition}={}){
  if(accessGate(this.s)){this.render();return;}
  if(n===590){this.s.dialog='missing';this.dialog();return;}if(n>1085){this.s.dialog='ended';this.dialog();return;}
  if(!this.s.user){this.s.requestedEpisode=n;this.s.route='library';const url=new URL(location.href);url.searchParams.set('episode',n);history.replaceState(null,'',url.pathname+url.search);this.render();return;}
  if(this.s.network!=='online'){this.s.dialog='connection';this.dialog();return;}
  if(this.fixture){await this.fixture.open(this,n,{audioIndex,resumePosition});return;}
  const account=this.account();
  if(this.s.resumeConflict?.episodeId===episodeId(n)&&resumePosition===undefined){this.s.dialog='resume-conflict';this.dialog();return;}
  this.pendingAutoplay=audioIndex!==undefined?(this.player?!this.player.video.paused:this.s.session?.cast?.state==='PLAYING'):true;
  if(this.player){this.record('pause',this.player.position);this.player.pause();}await this.flush();if(!this.current(account))return;
  if(this.eventQueue.length&&resumePosition===undefined){this.s.notice='Your last position is still syncing. Reconnect before starting another episode.';this.patch();return;}
  this.s.sessionError=null;this.targetId=episodeId(n);this.audioTarget=audioIndex;this.s.selectedNumber=n;this.s.route='watch';this.s.awaitingTarget=true;
  const position=resumePosition??(audioIndex!==undefined?this.player?.position??this.s.session?.cast?.positionSeconds??0:(this.s.progress[episodeId(n)]?.watched?0:this.s.progress[episodeId(n)]?.positionSeconds??0));
  this.pendingPosition=position;this.player?.pause();await this.flush();if(!this.current(account))return;this.player?.destroy();this.player=null;this.delivery=null;this.loadedKey=null;
  this.s.session={episodeId:this.targetId,episodeNumber:n,state:'preparing',playback:null};this.render();const url=new URL(location.href);url.searchParams.set('episode',n);history.replaceState(null,'',url.pathname+url.search);
  try{const lease=this.s.lease,value=lease&&!takeover?await this.request(`/api/sessions/${lease.sessionId}/episode`,{episodeId:this.targetId,automatic,audioIndex,audioLanguage:this.s.profile.audioLanguage,positionSeconds:position}):await this.request('/api/sessions',{episodeId:this.targetId,deviceId,takeover,audioIndex,audioLanguage:this.s.profile.audioLanguage});if(!this.current(account))return;this.mergeLease(value.lease);this.s.session=value;this.s.awaitingTarget=!this.targetMatches(value);this.render();await this.poll();}
  catch(e){if(!this.current(account))return;if(e.code==='active-session'){this.s.dialog='takeover';this.s.conflictEpisode=n;}else if(needsGoogleConfirmation(e.code)){this.s.me={...this.s.me,playbackAccess:{state:'confirmation-required',code:e.code}};this.s.dialog='pair-viewer';}else this.s.sessionError=errorCopy(e.code);this.render();}
 }
 async loadDelivery(){
  const account=this.account(),session=this.s.session,lease=this.s.lease;if(!ready(session)||!this.targetMatches(session)||lease?.destination==='cast'||this.loading)return;
  const key=`${lease.sessionId}:${session.episodeId}:${session.playback.selected.audioIndex}:${lease.authorityEpoch}`;
  if(this.loadedKey===key&&this.delivery?.expiresAt>Date.now()+300000)return;
  // Resolve saved language against inspected tracks; indices are episode-specific.
  const wanted=this.s.profile.audioLanguage==='en'?['en','eng']:['ja','jpn'],selected=session.playback.selected;
  if(!wanted.includes(selected.audioLanguage)&&this.preferenceAttempt!==`${session.episodeId}:${this.s.profile.audioLanguage}`){this.preferenceAttempt=`${session.episodeId}:${this.s.profile.audioLanguage}`;const track=session.playback.tracks.find(t=>t.type==='audio'&&wanted.includes(t.language));if(track){await this.open(session.episodeNumber,{audioIndex:track.index});return;}}
  this.loading=true;
  try{const delivery=await this.request(`/api/sessions/${lease.sessionId}/delivery`,{});if(!this.current(account)||delivery.episodeId!==session.episodeId||this.s.lease?.destination==='cast')return;
   const position=this.pendingPosition??this.player?.position??0,autoplay=shouldAutoplayDelivery({requested:this.pendingAutoplay,existingPaused:this.player?.video.paused});this.pendingPosition=null;this.pendingAutoplay=undefined;this.delivery=delivery;this.loadedKey=key;this.targetId=null;this.audioTarget=undefined;this.s.awaitingTarget=false;
   if(!this.player){this.render();this.attachPlayer();}if(this.player)await this.player.load(delivery,{positionSeconds:position,subtitles:this.s.profile.subtitleLanguage!=='off',autoplay});
  }catch(e){if(this.current(account)){this.s.sessionError=errorCopy(e.code);this.render();}}finally{if(this.current(account))this.loading=false;}
 }
 attachPlayer(){const video=this.root.querySelector('#episode-video');if(!video||(this.fixture&&!(__DEV__&&this.fixture.realMedia))||this.player?.video===video)return;const account=this.account();
  this.player=new LocalPlayer(video,{onTime:(p,d)=>{if(!this.current(account))return;this.s.position=p;this.s.duration=d;if(Date.now()-this.lastHeartbeat>15000){this.lastHeartbeat=Date.now();this.record('heartbeat',p);}},onPause:p=>{if(this.current(account))this.record('pause',p);},onSeek:p=>{if(this.current(account))this.record('seek',p);},onEnded:()=>{if(this.current(account))void this.ended();},onStatus:value=>{if(!this.current(account))return;this.s.playerStatus=value;this.patch();},onFailure:code=>{if(!this.current(account))return;this.player?.pause();if(Number.isFinite(video.duration))this.record('pause',this.player?.position??0);this.s.sessionError=code==='subtitles-unavailable'?['English subtitles could not load','Retry before continuing without dialogue subtitles.']:code==='delivery-type-unsupported'?errorCopy(code):['Playback was interrupted','Retry from your saved position.'];this.render();}});
 }
 record(reason,position){if(this.fixture){this.fixture.record?.(this,reason,position);return;}const lease=this.s.lease,session=this.s.session;if(!lease||lease.destination==='cast'||!session?.playback||!Number.isFinite(position))return;
  const event={episodeId:session.episodeId,generation:lease.generation,authorityEpoch:lease.authorityEpoch,positionSeconds:Math.max(0,Math.min(position,session.playback.durationSeconds)),reason};
  this.s.progress[event.episodeId]={...event,durationSeconds:session.playback.durationSeconds,watched:reason==='mark-watched'||reason==='ended',updatedAt:Date.now()};this.s.lastEpisodeId=event.episodeId;
  const last=this.eventQueue.at(-1);if(reason==='heartbeat'&&last?.reason==='heartbeat'&&last.revision===undefined)this.eventQueue[this.eventQueue.length-1]=event;else if(this.eventQueue.length<100)this.eventQueue.push(event);this.persist();void this.flush();
 }
 async flush(){if(this.flushing)return this.flushing;if(!this.s.lease||this.fixture||accessGate(this.s))return;const pending=this.flushQueue();this.flushing=pending;try{await pending;}finally{if(this.flushing===pending)this.flushing=null;}}
 async flushQueue(){const account=this.account();this.sending=true;
  try{while(this.current(account)&&this.eventQueue.length){const value=this.eventQueue[0],lease=this.s.lease;
   if(lease.destination==='cast'||value.generation!==lease.generation||value.authorityEpoch!==lease.authorityEpoch){this.s.resumeConflict={...this.eventQueue.at(-1),savedPosition:this.s.progress[value.episodeId]?.positionSeconds??0};this.s.notice='This device has an unsynced place. Review it before continuing.';break;}
   if(value.revision===undefined){value.revision=lease.revision+1;this.persist();}
   try{const result=await this.request(`/api/sessions/${lease.sessionId}/events`,value);if(!this.current(account))return;this.mergeLease(result.lease);this.s.progress[value.episodeId]=result.progress;this.eventQueue.shift();this.persist();}
   catch(e){if(!this.current(account))return;if(['stale-progress','stale-progress-authority','session-replaced-or-expired'].includes(e.code)){this.eventQueue.shift();this.persist();}else{this.s.notice='Your place is saved on this device. Sync will retry when the home connection returns.';break;}}
  }}finally{if(this.current(account)){this.sending=false;this.patch();}}
 }
 async ended(){const account=this.account();this.record('ended',this.s.session?.playback?.durationSeconds??0);await this.flush();if(!this.current(account)||!this.s.session)return;const n=this.s.session.episodeNumber,b=nextBoundary(n);if(b!=='next'){this.s.dialog=b;this.dialog();}else if(this.s.profile.autoplay)await this.open(n+1,{automatic:true});else{this.s.playerStatus='ended';this.patch();}}
 async devices(){
  if(!this.s.lease||!ready(this.s.session)){this.s.notice='Open an episode first, then choose your TV.';this.patch();return;}
  const account=this.account();if(this.deviceScan?.uid===account.uid&&this.deviceScan?.generation===account.generation)return;
  this.deviceScan=account;const previous=Array.isArray(this.s.devices)?this.s.devices:[];
  this.s.dialog='cast';this.s.dialogError=null;this.s.devices=null;this.dialog();
  try{const result=await this.request('/api/cast/devices');if(!this.current(account)||this.deviceScan!==account)return;this.s.devices=result.devices;this.s.dialogError=null;if(this.s.dialog==='cast')this.dialog();}
  catch{if(!this.current(account)||this.deviceScan!==account)return;this.s.devices=previous;this.s.dialogError=['The TV list could not be refreshed','Try again in a moment. Your saved place is kept.'];if(this.s.dialog==='cast')this.dialog();}
  finally{if(this.deviceScan===account)this.deviceScan=null;}
 }
 async castTo(receiverId,takeover=false){if(this.fixture){this.fixture.cast(this,receiverId,takeover);return;}const account=this.account();this.player?.pause();this.record('pause',this.player?.position??0);await this.flush();if(!this.current(account))return;if(this.eventQueue.length){this.dialogFailure('Your position has not synced yet. Reconnect before moving playback to the TV.');return;}
  try{const result=await this.request(`/api/sessions/${this.s.lease.sessionId}/cast`,{receiverId,takeover,positionSeconds:this.player?.position??this.s.position??0,autoplay:this.s.profile.autoplay,subtitleEnabled:this.s.profile.subtitleLanguage!=='off'});if(!this.current(account))return;this.mergeLease(result.lease);this.s.session={...this.s.session,lease:result.lease,cast:result.cast};this.s.receiverName=this.s.devices?.find(d=>d.receiverId===receiverId)?.name??'Your TV';this.player?.destroy();this.player=null;this.delivery=null;this.loadedKey=null;this.s.dialog=null;this.render();}
  catch(e){if(!this.current(account))return;if(e.code==='cast-tv-busy'){this.s.pendingReceiver=receiverId;this.s.dialog='tv-takeover';}else{this.s.dialogError=errorCopy(e.code);this.s.dialog='cast';}await this.poll();if(this.current(account))this.dialog();}
 }
 async command(action,value){if(this.fixture){this.fixture.command(this,action,value);return true;}const account=this.account(),cast=this.s.session?.cast;if(!cast?.owned)return false;
  try{const result=await this.request(`/api/sessions/${this.s.lease.sessionId}/cast-command`,{receiverId:cast.receiverId,action,...(value!==undefined?{value}:{})});if(!this.current(account))return false;this.mergeLease(result.lease);this.s.session.cast=result.cast;this.patch();return true;}catch(e){if(this.current(account)){this.s.notice=errorCopy(e.code).join('. ');this.patch();}return false;}}
 async disconnect(){if(this.fixture){this.fixture.disconnect(this);return;}const account=this.account();try{this.pendingAutoplay=this.s.session?.cast?.state==='PLAYING';const result=await this.request(`/api/sessions/${this.s.lease.sessionId}/disconnect`,{receiverId:this.s.session?.cast?.receiverId});if(!this.current(account))return;this.mergeLease(result.lease);this.pendingPosition=result.positionSeconds;this.targetId=result.episodeId;this.s.session.cast=null;this.loadedKey=null;this.render();await this.poll();if(this.current(account))await this.loadDelivery();}catch(e){if(this.current(account)){this.s.notice=errorCopy(e.code).join('. ');this.patch();}}}
 runtimeError(e){if(e.code==='identity-changed')return;if(['session-replaced-or-expired','stale-progress-authority'].includes(e.code)){this.player?.pause();this.s.sessionError=errorCopy(e.code);this.s.lease=null;this.render();}else{this.s.network='offline';this.s.notice='The home connection was interrupted. Your place is saved.';this.patch();}}
 failure(){this.s.notice='That action did not finish. Check your connection and try again.';this.patch();}
 render(){this.s.theme=applyTheme(readTheme());const video=this.player?.video;this.s.hasLocalPlayer=Boolean(this.player);document.body.removeAttribute('data-direction');this.root.innerHTML=`${__DEV__&&this.fixture?`<div class="dev-banner">DEVELOPMENT FIXTURE · ${esc(this.s.designRevision??'')} · ${this.fixture.realMedia?'Real cached video and English captions; synthetic account.':'Synthetic account, progress and device states.'}${this.fixture.realMedia?'<div class="dev-media-controls"><button data-action="dev-dialogue">Dialogue at 10:00</button><button data-action="dev-play-pause">Play / pause</button><button data-action="dev-source" data-number="1000">Source 1 · 1000</button><button data-action="dev-source" data-number="1001">Source 2 · 1001</button></div>':''}</div>`:''}${page(this.s)}`;
  if(video&&this.s.route==='watch'&&this.s.lease?.destination!=='cast'&&ready(this.s.session)){const target=this.root.querySelector('#episode-video');if(target)target.replaceWith(video);}this.renderRows();this.patch();if(this.s.dialog)this.dialog();}
 renderRows(){const target=this.root.querySelector('#episode-results');if(target)target.innerHTML=rows(this.s);const search=this.root.querySelector('#episode-search'),label=this.root.querySelector('.search .sr-only');if(search)search.placeholder=this.s.profile.showTitles?'Search all episodes or titles':'Search all episode numbers';if(label)label.textContent=`Search all episodes by number${this.s.profile.showTitles?' or verified title':''}`;for(const el of this.root.querySelectorAll('.season-select,.season-paging,.season-summary'))el.hidden=Boolean(this.s.query.trim());const clear=this.root.querySelector('#clear-search');if(clear)clear.hidden=!this.s.query;this.root.querySelector('.browse-tools')?.classList.toggle('searching',Boolean(this.s.query.trim()));}
 patch(){
  this.patchFamily();for(const action of ['check-access'])for(const el of this.root.querySelectorAll(`[data-action="${action}"]`))el.disabled=Boolean(this.connecting);
  for(const el of this.root.querySelectorAll('[data-action="sign-in"]'))el.disabled=Boolean(this.signingIn);
  const signInButton=this.root.querySelector('#sign-in-button');if(signInButton)signInButton.innerHTML=`${icon('user')} ${this.signingIn?'Opening Google…':'Sign in with Google'}`;
  const signInError=this.root.querySelector('#sign-in-error');if(signInError){signInError.textContent=this.s.signInError??'';signInError.hidden=!this.s.signInError;}
  const installCopy=this.s.appIdentity?.dedicated?this.root.querySelector('.notice-bar>span'):null;if(installCopy&&this.s.appIdentity?.installationRequested)installCopy.textContent='Installation requested. Finish the confirmation on your device, then look for One Piece in your apps.';
  const notice=this.root.querySelector('#notice');if(notice)notice.innerHTML=(this.s.updateAvailable?`<div class="notice-bar"><span>An app update is ready.</span>${button('update','Update app','quiet','reload')}</div>`:'')+(this.s.notice?`<div class="notice-bar"><span>${esc(this.s.notice)}</span>${this.s.resumeConflict?button('review-resume','Review saved place','text-button'):''}${iconButton('dismiss-notice','Dismiss message','close')}</div>`:'');
  for(const id of ['connection-label','footer-connection']){const el=this.root.querySelector(`#${id}`);if(el)el.textContent=connectionLabel(this.s);}
  const install=this.root.querySelector('#install-button');if(install){const status=installStatus({...this.s.appIdentity,promptAvailable:Boolean(this.installPrompt)});install.hidden=false;install.disabled=status.kind==='installed';install.innerHTML=`${icon(status.kind==='installed'?'check':'download')} ${status.label}`;}
  const sync=this.root.querySelector('#sync-label');if(sync)sync.textContent=this.eventQueue.length?'Saved here · sync pending':this.s.sync?.state==='pending'?'Saved on PC · cloud sync pending':this.s.progress[this.s.session?.episodeId]?'Your place is saved':'Progress saves as you watch';
  for(const id of ['language-line','remote-language']){const el=this.root.querySelector(`#${id}`);if(el)el.textContent=`${['eng','en'].includes(this.s.session?.playback?.selected?.audioLanguage)?'English':'Japanese'} audio · ${this.s.profile.subtitleLanguage==='off'?'Subtitles off':'English dialogue subtitles'}`;}
  const p=this.s.session?.progress,phase=this.root.querySelector('#preparation-phase');if(phase)phase.innerHTML=`${icon('download')} ${phaseLabel(this.s.session?.state)}`;
  const value=this.root.querySelector('#preparation-bytes');if(value)value.textContent=p?.totalBytes?`${bytes(p.receivedBytes??0)} / ${bytes(p.totalBytes)}`:'';
  const fill=this.root.querySelector('#preparation-fill');if(fill&&p?.totalBytes){const download=['downloading','verifying','retrying','queued'].includes(this.s.session?.state);fill.style.width=download?`${Math.min(100,(p.receivedBytes??0)/p.totalBytes*100)}%`:'25%';fill.parentElement.classList.toggle('indeterminate',!download);if(download)fill.parentElement.setAttribute('aria-valuenow',Math.round((p.receivedBytes??0)/p.totalBytes*100));else{fill.parentElement.removeAttribute('aria-valuenow');if(value)value.textContent=`${bytes(p.totalBytes)} downloaded`;}}
  const placeholder=this.root.querySelector('#player-placeholder');if(placeholder)placeholder.hidden=Boolean(this.delivery)&&(!this.fixture||(__DEV__&&this.fixture.realMedia));
  const feedback=this.root.querySelector('#player-feedback');if(feedback)feedback.innerHTML=this.s.sessionError?`${esc(this.s.sessionError.join('. '))} ${button('retry','Retry','text-button','reload')}`:this.s.playerStatus==='buffering'?'Buffering…':this.s.playerStatus==='tap-to-play'?button('play','Play episode','primary','play'):'';
  const cast=this.s.session?.cast;if(cast){const seek=this.root.querySelector('#remote-seek');if(seek&&document.activeElement!==seek)seek.value=Math.floor(cast.positionSeconds);const clock=this.root.querySelector('#remote-time');if(clock)clock.textContent=time(cast.positionSeconds);const status=this.root.querySelector('#remote-state');if(status)status.textContent=cast.state==='PLAYING'?'Playing':cast.state==='PAUSED'?'Paused':cast.state==='BUFFERING'?'Buffering':'Stopped';const play=this.root.querySelector('.remote-play');if(play){play.innerHTML=icon(cast.state==='PLAYING'?'pause':'play');play.setAttribute('aria-label',cast.state==='PLAYING'?'Pause TV':'Play TV');}}
  const next=this.root.querySelector('#next-preparation'),n=this.s.session?.next;if(next)next.innerHTML=n&&this.s.session?.episodeNumber<1085?`${icon('download')}<span>Next · Episode ${n.episodeNumber} <strong>${n.availability==='missing'?'Unavailable':n.state==='ready'?'Ready':phaseLabel(n.state)}</strong></span>`:'';
  if(this.s.updateAvailable&&!this.root.querySelector('#update-notice')){const el=document.createElement('div');el.id='update-notice';el.className='update-notice';el.innerHTML=`A new app version is ready. ${button('update','Update when ready','text-button','reload')}`;this.root.querySelector('footer')?.before(el);}
 }
 dialog(){const host=this.root.querySelector('#dialog-host');if(!host)return;const account=this.account();host.replaceChildren();const dialog=document.createElement('dialog');dialog.className='app-dialog';dialog.setAttribute('aria-labelledby','dialog-title');dialog.innerHTML=`<div class="dialog-top">${iconButton('close-dialog','Close','close')}</div>${dialogContent(this.s)}`;host.append(dialog);dialog.addEventListener('cancel',()=>{if(this.current(account)){this.s.dialog=null;this.s.dialogError=null;}});dialog.showModal();}
 closeDialog(){this.s.dialog=null;this.s.dialogError=null;this.root.querySelector('dialog')?.close();}
 async click(event){const t=event.target.closest('[data-action]');if(!t||t.disabled)return;const account=this.account(),a=t.dataset.action,n=Number(t.dataset.number),s=this.s;
  if(!this.current(account))return;
  if(accessGate(s)&&!['check-access','logout','logout-local','toggle-theme','install','close-dialog','dismiss-notice','update','setup','create-workspace'].includes(a))return;
  if(a==='check-access'){if(this.fixture)return;await this.connect();this.patch();return;}
  if(a==='sign-in'){
   if(this.signingIn)return;if(__DEV__&&this.fixture){s.signInError='Design preview only. Use the live One Piece app to sign in.';this.patch();return;}
   this.signingIn=true;s.signInError=null;this.patch();
   try{await signInToOnePiece();}
   catch(error){if(!auth.currentUser){this.s.signInError=signInFailure(error?.code);this.patch();}}
   finally{this.signingIn=false;this.patch();}return;
  }
  if(a==='toggle-theme'){s.theme=applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');return;}
  if(a==='browse-episodes'){this.root.querySelector('#catalogue-title')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});this.root.querySelector('#episode-search')?.focus({preventScroll:true});return;}
  if(a==='close-dialog'){this.closeDialog();return;}if(a==='dismiss-notice'){s.notice='';this.patch();return;}
  if(__DEV__&&this.fixture?.realMedia){if(a==='dev-dialogue'){this.player?.seek(600);return;}if(a==='dev-play-pause'){if(this.player?.video.paused)await this.player.play();else this.player?.pause();return;}if(a==='dev-source'){await this.open(n);return;}}
  if(a==='library'){this.player?.pause();this.closeDialog();s.route='library';this.render();window.scrollTo({top:store.get(this.key('library-scroll'),0)});return;}
  if(a==='watch'){this.closeDialog();s.route='watch';this.render();if(!this.fixture||(__DEV__&&this.fixture.realMedia))await this.loadDelivery();return;}
  if(a==='open'){store.set(this.key('library-scroll'),window.scrollY);await this.open(n);return;}
  if(['season','previous-season','next-season'].includes(a)){this.selectSeason(a==='season'?n:Math.max(1,Math.min(SEASONS.length,s.season+(a==='next-season'?1:-1))));return;}
  if(a==='clear-search'){s.query='';const input=this.root.querySelector('#episode-search');if(input){input.value='';input.focus();}this.renderRows();return;}
  if(['missing','ended','account','connection','tracks','setup'].includes(a)){if(a==='missing')store.set(this.key('library-scroll'),window.scrollY);s.dialog=a;this.dialog();return;}
  if(a==='review-resume'){s.dialog='resume-conflict';this.dialog();return;}
  if(a==='resume-local'||a==='resume-server'){const conflict=s.resumeConflict;if(!conflict)return;const position=a==='resume-local'?conflict.positionSeconds:conflict.savedPosition;this.eventQueue=this.eventQueue.filter(e=>e.episodeId!==conflict.episodeId);s.resumeConflict=null;s.notice='';this.persist();this.closeDialog();await this.open(Number(conflict.episodeId.slice(-4)),{resumePosition:position});return;}
  if(a==='continue-591'){this.closeDialog();await this.open(591);return;}
  if(a==='next'){const number=s.session?.episodeNumber??s.selectedNumber,b=nextBoundary(number);if(b!=='next'){s.dialog=b;this.dialog();}else if(s.lease?.destination==='cast')await this.command('next');else await this.open(number+1,{automatic:true});return;}
  if(a==='previous'){await this.open(s.session.episodeNumber-1);return;}if(a==='restart'){this.player?.seek(0);this.record('restart',0);return;}if(a==='fullscreen'){await this.player?.fullscreen();return;}if(a==='play'){await this.player?.play();return;}
  if(a==='mark-watched'){this.player?.pause();this.record('mark-watched',s.session.playback.durationSeconds);s.notice='Episode marked watched.';this.patch();return;}
  if(a==='retry'){s.sessionError=null;await this.open(s.selectedNumber??s.session?.episodeNumber);return;}
  if(a==='cancel'){if(this.fixture){this.fixture.cancel(this);return;}if(s.lease)await this.request(`/api/sessions/${s.lease.sessionId}`,undefined,{method:'DELETE'});if(!this.current(account))return;s.lease=null;s.session=null;s.route='library';this.render();return;}
  if(a==='reconnect'){const reviewing=s.dialog==='connection';this.closeDialog();await this.connect();if(reviewing&&this.current(account)&&!s.setupRequired&&!s.me?.needsWorkspace&&!s.me?.needsClaim){s.dialog='connection';this.dialog();}return;}
  if(a==='cast'){if(s.lease?.destination==='cast'){s.route='watch';this.render();}else await this.devices();return;}if(a==='scan-tv'){await this.devices();return;}if(a==='cast-device'){await this.castTo(t.dataset.receiver);return;}
  if(a==='confirm-takeover'){this.closeDialog();await this.open(s.conflictEpisode,{takeover:true});return;}if(a==='confirm-tv-takeover'){await this.castTo(s.pendingReceiver,true);return;}
  if(a==='remote-play'){await this.command(s.session.cast?.state==='PLAYING'?'pause':'play');return;}
  if(a==='remote-back'||a==='remote-forward'){await this.command('seek',Math.max(0,Math.min(s.session.cast.durationSeconds-.1,s.session.cast.positionSeconds+(a==='remote-back'?-10:10))));return;}if(a==='disconnect'){await this.disconnect();return;}
  if(a==='pair-viewer'){
   if(this.fixture||this.pairing)return;
   if(s.network!=='online'||s.me?.playbackAccess?.state!=='confirmation-required'){s.dialog='connection';this.dialog();return;}
   this.pairing=true;t.disabled=true;t.setAttribute('aria-busy','true');
   try{const googleIdToken=await freshGoogleConfirmation();if(!this.current(account))return;await this.request('/api/pair-viewer',{googleIdToken});if(!this.current(account))return;s.me={...s.me,playbackAccess:{state:'ready'}};this.closeDialog();s.notice='Your account is connected to the home PC.';this.render();if(s.selectedNumber)await this.open(s.selectedNumber);}
   catch(error){if(this.current(account))this.dialogFailure(confirmationError(error));}
   finally{this.pairing=false;if(this.current(account)){t.disabled=false;t.removeAttribute('aria-busy');}}return;
  }
  if(a==='create-workspace'||a==='claim-invitation'){if(this.fixture)return;try{await(a==='create-workspace'?createWorkspace(s.me.ownerUid):claimInvitation(s.me.ownerUid));if(!this.current(account))return;this.closeDialog();await this.connect();if(!this.current(account))return;if(!s.setupRequired&&!s.me?.needsWorkspace&&!s.me?.needsClaim){s.dialog='connection';this.dialog();}}catch{if(this.current(account))this.dialogFailure('Setup could not be saved. Existing or disabled family settings were kept.');}return;}
  if(a==='family'||a==='family-refresh'){if(s.me?.role!=='owner')return;s.dialog='family';if(a==='family')this.dialog();if(!this.fixture){this.watchFamily(s.me.ownerUid,account);await this.loadFamilyAccess();}return;}
  if(a==='approve-access'||a==='decline-access'){
   if(s.me?.role!=='owner'||s.familyBusyUid)return;const uid=t.dataset.uid,row=s.familyRequests?.find(value=>value.uid===uid&&value.status==='pending');if(!row)return;
   if(this.fixture){this.fixture.reviewAccess?.(this,uid,a==='approve-access');return;}
   s.familyBusyUid=uid;this.patchFamily();
   try{await reviewAccessRequest(s.me.ownerUid,uid,a==='approve-access');if(!this.current(account))return;await this.loadFamilyAccess();}
   catch(error){if(this.current(account)){s.familyError=(error?.code??error?.message)==='member-paused'?'This member is paused. Enable the existing member, then review the request.':'The request could not be reviewed. Check again and retry.';this.patchFamily();}}
   finally{if(this.current(account)){s.familyBusyUid=null;this.patchFamily();}}return;
  }
  if(a==='toggle-invite'){
   if(s.me?.role!=='owner'||s.familyBusyUid)return;const member=s.familyMembers?.find(value=>value.email===t.dataset.email);if(!member)return;
   if(this.fixture){this.fixture.toggleMember?.(this,member.email);return;}
   s.familyBusyUid=member.email;this.patchFamily();try{await inviteMember(s.me.ownerUid,{email:member.email,active:member.active!==true});if(this.current(account))await this.loadFamilyAccess();}catch{if(this.current(account)){s.familyError='The member could not be updated. Check again and retry.';this.patchFamily();}}finally{if(this.current(account)){s.familyBusyUid=null;this.patchFamily();}}return;
  }
  if(a==='logout'){if(this.fixture)return;if(accessGate(s)){await this.signOutLocal();return;}this.player?.pause();await this.flush();if(!this.current(account))return;await disconnectBeforeSignOut({request:this.request,isCurrent:()=>this.current(account),signOut:()=>this.signOutLocal(),onUnconfirmed:()=>{s.dialog='offline-signout';this.dialog();}});return;}
  if(a==='logout-local'){if(__DEV__&&this.fixture)return;await this.signOutLocal();return;}
  if(a==='open-dedicated'){
   this.player?.pause();if(this.player)this.record('pause',this.player.position);await this.flush();if(!this.current(account))return;
   if(!canMoveToDedicatedApp({pendingEvents:this.eventQueue.length,resumeConflict:s.resumeConflict})){s.dialog='migration-pending';this.dialog();return;}
   location.assign(dedicatedAppUrl());return;
  }
  if(a==='install'){
   if(!s.appIdentity?.dedicated){s.dialog='install';this.dialog();return;}
   if(this.installPrompt){await this.installPrompt.prompt();const choice=await this.installPrompt.userChoice;this.installPrompt=null;if(choice.outcome==='accepted')s.appIdentity.installationRequested=true;this.patch();return;}
   s.dialog='install';this.dialog();return;
  }
  if(a==='update'){this.player?.pause();await this.flush();if(!this.current(account))return;navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});this.registration?.waiting?.postMessage({type:'ACTIVATE_UPDATE'});}
 }
 async submit(event){const form=event.target;if(!form.dataset.form)return;event.preventDefault();if(this.fixture){this.s.notice='Development fixture: no account or invitation was written.';this.patch();return;}const account=this.account(),ownerUid=this.s.me?.ownerUid,data=new FormData(form),submit=form.querySelector('[type=submit]');if(submit)submit.disabled=true;
  if(!this.current(account))return;
  try{if(form.dataset.form==='pair-owner'){await freshGoogleConfirmation();if(!this.current(account))return;await this.request('/api/pair-owner',{code:String(data.get('code')).trim(),confirmOwner:true});if(!this.current(account))return;this.closeDialog();await this.connect();}}
  catch{if(this.current(account))this.dialogFailure('Pairing could not finish. Check the fresh code on the PC and confirm the correct Google account.');}finally{if(this.current(account)&&submit?.isConnected)submit.disabled=false;}
 }
 async change(event){const account=this.account(),el=event.target,id=el.id,s=this.s;
  if(!this.current(account))return;
  if(id==='episode-season'){this.selectSeason(Number(el.value));return;}
  if(id==='autoplay'||id==='account-autoplay'){await this.preference({autoplay:el.checked});return;}
  if(id==='show-titles'||id==='account-show-titles'){await this.preference({showTitles:el.checked});if(this.current(account))this.render();return;}
  if(id==='subtitle-choice'){if(s.lease?.destination==='cast'&&!await this.command('subtitles',el.value!=='off'))return;if(!this.current(account))return;await this.preference({subtitleLanguage:el.value});if(!this.current(account))return;this.player?.subtitles(el.value!=='off');this.patch();return;}
  if(id==='audio-track'){const index=Number(el.value),track=s.session.playback.tracks.find(t=>t.index===index);this.closeDialog();await this.preference({audioLanguage:['eng','en'].includes(track?.language)?'en':'ja'});if(this.current(account))await this.open(s.session.episodeNumber,{audioIndex:index});return;}
  if(id==='remote-seek'){await this.command('seek',Math.min(Number(el.value),s.session.cast.durationSeconds-.1));return;}if(id==='remote-volume'){await this.command('volume',Number(el.value));return;}if(id==='remote-subtitles'){await this.command('subtitles',el.checked);if(this.current(account))await this.preference({subtitleLanguage:el.checked?'en':'off'});}
 }
 async preference(value){
  if(this.fixture){this.s.profile={...this.s.profile,...value};return;}
  const account=this.account();
  if(!this.current(account))return;
  if('autoplay'in value&&this.s.lease){try{const result=await this.request(`/api/sessions/${this.s.lease.sessionId}/renew`,{autoplay:value.autoplay});if(!this.current(account))return;this.mergeLease(result.lease);if(result.cast)this.s.session.cast=result.cast;}catch{if(!this.current(account))return;this.s.notice='Autoplay could not change. Reconnect and try again.';for(const el of this.root.querySelectorAll('#autoplay,#account-autoplay'))el.checked=this.s.profile.autoplay;this.patch();return;}}
  this.s.profile={...this.s.profile,...value};try{const profile=await saveProfile(this.s.me.ownerUid,value);if(this.current(account))this.s.profile=profile;}catch{if(this.current(account)){this.s.notice='This preference is applied here, but could not sync yet.';this.patch();}}
 }
 async signOutLocal(){stopAccessObservers(this);this.player?.destroy();this.player=null;this.s.lease=null;this.eventQueue=[];this.closeDialog();await logout();}
 dialogFailure(message){const dialog=this.root.querySelector('dialog');if(!dialog){this.s.notice=message;this.patch();return;}let el=dialog.querySelector('.dialog-error');if(!el){el=document.createElement('p');el.className='dialog-error';el.setAttribute('role','alert');dialog.append(el);}el.textContent=message;}
 keyboard(e){if(!this.current(this.account()))return;return handleWatchKeyboard(e,{route:this.s.route,dialog:this.s.dialog,destination:this.s.lease?.destination,cast:this.s.session?.cast,player:this.player,command:(action,value)=>this.command(action,value)});}
 async worker(){if(!('serviceWorker'in navigator)||location.protocol!=='https:')return;
  const finishMigration=()=>{if(navigator.serviceWorker.controller?.scriptURL===new URL('/one-piece/sw.js',location.origin).href){const url=new URL(location.href);if(url.searchParams.has('ngsw-bypass')){url.searchParams.delete('ngsw-bypass');history.replaceState(null,'',url.pathname+url.search+url.hash);}}};
  navigator.serviceWorker.addEventListener('controllerchange',finishMigration);finishMigration();
  try{this.registration=await navigator.serviceWorker.register('/one-piece/sw.js',{scope:'/one-piece/'});const update=()=>{if(this.registration.waiting){this.s.updateAvailable=true;this.patch();}};update();this.registration.addEventListener('updatefound',()=>{const worker=this.registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')update();});});}catch{this.s.notice='Installation is not ready yet. Browser viewing is still available.';this.patch();}}
}
