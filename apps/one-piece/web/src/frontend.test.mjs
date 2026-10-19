import test from 'node:test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import { visibleEpisodes, nextBoundary, rangeFor, latestResume, escapeHtml, safeLocalProgress, validPendingEvent, bytes, shouldAutoplayDelivery } from './model.mjs';
import { createClient, CONTROL_ORIGIN } from './client.mjs';
import { dialogContent, page } from './views.mjs';
import { appIdentity, dedicatedAppUrl, canMoveToDedicatedApp, installStatus, ONE_PIECE_ORIGIN, PTI_ORIGIN } from './install.mjs';
import { handleWatchKeyboard } from './keyboard.mjs';
import { accountSnapshot, isCurrentAccount, resetAccountContext } from './identity.mjs';
import { LocalPlayer, sanitizedPlaybackDiagnostic } from './player.mjs';
import { disconnectBeforeSignOut } from './signout.mjs';
import { observeReviewFrames } from './review-frames.mjs';
import { needsGoogleConfirmation, confirmationError, connectionStatus } from './connection.mjs';
import { signInFailure } from './signin.mjs';

test('One Piece signs in on its own screen with bounded popup errors and no PTI login link',async()=>{
 const html=page({booting:false,user:null,network:'checking',profile:{},appIdentity:{dedicated:true}});
 assert.match(html,/data-action="sign-in"/);assert.match(html,/One Piece · Family viewing/);
 assert.doesNotMatch(html,/href="[^\"]*\/login/);
 const source=await readFile(new URL('./app.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/loginUrl\s*\(/,'episode actions must not retain the removed PTI login handoff');
 assert.match(signInFailure('auth/popup-blocked'),/blocked the Google window/);
 assert.match(signInFailure('auth/popup-closed-by-user'),/was closed/);
 assert.match(signInFailure('auth/network-request-failed'),/connection/);
 assert.match(signInFailure('auth/unauthorized-domain'),/not authorized/);
 assert.doesNotMatch(signInFailure('secret-provider-payload'),/secret-provider-payload/);
});

test('dedicated app identity preserves episode links without copying origin storage or credentials',()=>{
 const link=new URL('/one-piece/watch?episode=1001&from=continue#player',PTI_ORIGIN);
 assert.equal(dedicatedAppUrl(link),`${ONE_PIECE_ORIGIN}/one-piece/watch?episode=1001&from=continue#player`);
 assert.deepEqual(appIdentity(link),{dedicated:false,legacy:true});
 assert.deepEqual(appIdentity(new URL(dedicatedAppUrl(link))),{dedicated:true,legacy:false});
 assert.deepEqual(appIdentity(new URL('https://pti-app-2ab59-one-piece.firebaseapp.com/one-piece/')),{dedicated:true,legacy:false});
 assert.equal(dedicatedAppUrl(new URL('/login',PTI_ORIGIN)),`${ONE_PIECE_ORIGIN}/one-piece/`);
 assert.equal(canMoveToDedicatedApp(),true);
 assert.equal(canMoveToDedicatedApp({pendingEvents:1}),false);
 assert.equal(canMoveToDedicatedApp({resumeConflict:{positionSeconds:20}}),false);
});

test('installation always has a visible useful state, including no browser prompt and standalone use',()=>{
 assert.equal(installStatus().label,'Open One Piece app');
 assert.equal(installStatus({dedicated:true}).kind,'help');
 assert.equal(installStatus({dedicated:true,promptAvailable:true}).kind,'prompt');
 assert.equal(installStatus({dedicated:true,standalone:true}).kind,'installed');
 const state={booting:true,network:'online',appIdentity:{dedicated:true},profile:{},user:{uid:'fixture',displayName:'Family viewer'}};
 const html=page(state);assert.match(html,/id="install-button"[^>]*>.*Install One Piece/);assert.doesNotMatch(html,/id="install-button"[^>]*hidden/);
 assert.match(html,/Opening this page does not install it/);
 const legacy=page({...state,appIdentity:{legacy:true}});assert.match(legacy,/viewing One Piece inside PTI/);assert.match(legacy,/data-action="open-dedicated"/);
 assert.match(html,new RegExp(`${PTI_ORIGIN.replaceAll('.','\\.')}/home`));
 const help=dialogContent({...state,dialog:'install'});assert.match(help,/Add to home screen/);assert.match(help,/app drawer/);assert.match(help,/Create shortcut/);
 assert.match(dialogContent({...state,appIdentity:{legacy:true},dialog:'install'}),/Sign in there once with the same Google account/);
 assert.match(dialogContent({...state,dialog:'migration-pending'}),/Sync before switching apps/);
});

test('switching Google accounts keeps installation identity but replaces account state',()=>{
 const appIdentity={dedicated:true,standalone:true},app={accountGeneration:0,s:{user:{uid:'a'},appIdentity,catalog:null,requestedEpisode:1001}};
 resetAccountContext(app,{uid:'b'},{});assert.equal(app.s.appIdentity,appIdentity);assert.deepEqual(app.s.progress,{});
});

test('numbered search retains the unavailable 590 and source boundary without duplicates',()=>{
 const episodes=[589,590,591,1000,1001].map(n=>({episodeNumber:n,availability:n===590?'missing':'listed'}));
 assert.equal(visibleEpisodes(episodes,{query:'0590'})[0].availability,'missing');
 assert.deepEqual(visibleEpisodes(episodes,{range:951}).map(e=>e.episodeNumber),[1000]);
 assert.deepEqual(visibleEpisodes(episodes,{range:1001}).map(e=>e.episodeNumber),[1001]);
 assert.equal(nextBoundary(589),'missing');assert.equal(nextBoundary(1000),'next');assert.equal(nextBoundary(1085),'ended');
 assert.equal(rangeFor(1085),1051);
});
test('title search needs both an explicit spoiler preference and verified provenance',()=>{
 const data=[{episodeNumber:1,title:'Unverified title'},{episodeNumber:2,title:'Verified title',titleProvenance:'source'}];
 assert.deepEqual(visibleEpisodes(data,{query:'title'}),[]);
 assert.deepEqual(visibleEpisodes(data,{query:'title',showTitles:true}).map(e=>e.episodeNumber),[2]);
});
test('continue respects the latest intentional rewind instead of maximum position',()=>{
 const progress={a:{episodeId:'a',positionSeconds:600,updatedAt:10,watched:false},b:{episodeId:'b',positionSeconds:20,updatedAt:11,watched:false}};
 assert.equal(latestResume(progress,'b').positionSeconds,20);
 assert.equal(latestResume({...progress,b:{...progress.b,watched:true}},'b').episodeId,'a');
 assert.equal(escapeHtml('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('corrupt local caches cannot invent episodes or poison a resumed event',()=>{
 const valid={episodeId:'one-piece-0001',positionSeconds:20,durationSeconds:1400};
 assert.deepEqual(safeLocalProgress({'one-piece-0001':valid,'one-piece-0590':{...valid,episodeId:'one-piece-0590'},'one-piece-1086':{...valid,episodeId:'one-piece-1086'},junk:null}),{'one-piece-0001':valid});
 assert.deepEqual(safeLocalProgress(null),{});assert.deepEqual(safeLocalProgress([]),{});
 assert.equal(validPendingEvent({...valid,generation:1,authorityEpoch:1,reason:'seek'}),true);
 assert.equal(validPendingEvent({...valid,generation:1,authorityEpoch:1,reason:'invented'}),false);
 assert.equal(validPendingEvent({...valid,generation:1,authorityEpoch:1,reason:'seek',positionSeconds:Infinity}),false);
 assert.equal(bytes(246000000),'246 MB');
});
test('renewing an expiring local stream preserves pause state while explicit starts may play',()=>{
 assert.equal(shouldAutoplayDelivery({existingPaused:true}),false);
 assert.equal(shouldAutoplayDelivery({existingPaused:false}),true);
 assert.equal(shouldAutoplayDelivery({requested:false}),false);
 assert.equal(shouldAutoplayDelivery({requested:true,existingPaused:true}),true);
 assert.equal(shouldAutoplayDelivery(),true);
});
test('control client sends identity only to the fixed HTTPS origin, without cookies or cache',async()=>{
 const original=globalThis.fetch,requests=[];
 try{globalThis.fetch=async(url,options)=>{requests.push({url,options});return Response.json({ok:true});};
  const client=createClient(()=>({uid:'alice',getIdToken:async()=> 'test-id-token'}));
  await client('/api/sessions',{episodeId:'one-piece-0001'});
  assert.equal(requests[0].url,CONTROL_ORIGIN+'/api/sessions');
  assert.equal(new URL(requests[0].url).protocol,'https:');
  assert.equal(new URL(requests[0].url).hostname,'pti-onepiece-home.duckdns.org');
  assert.equal(requests[0].options.headers.Authorization,'Bearer test-id-token');
  assert.equal(requests[0].options.credentials,'omit');assert.equal(requests[0].options.cache,'no-store');assert.equal(requests[0].options.redirect,'error');
  await assert.rejects(client('http://example.invalid/api/me'),e=>e.code==='invalid-request');
  await assert.rejects(client('/api/me?token=x'),e=>e.code==='invalid-request');assert.equal(requests.length,1);
 }finally{globalThis.fetch=original;}
});

test('home connection uses the trusted endpoint and does not instruct device CA installation',()=>{
 const html=dialogContent({dialog:'connection',network:'offline'});
 assert.ok(html.includes(CONTROL_ORIGIN+'/runtime-health'));
 assert.ok(html.includes('No certificate installation is needed'));
 assert.ok(html.includes('Allow local-network access'));
 assert.equal(html.includes('household-ca.crt'),false);
 assert.equal(html.includes('Install a certificate'),false);
});

test('already paired accounts use one connection screen without unnecessary Google re-pairing',()=>{
 const s={network:'online',user:{email:'viewer@example.invalid'},me:{role:'owner',playbackAccess:{state:'ready'}}};
 const account=dialogContent({...s,dialog:'account',profile:{}}),connection=dialogContent({...s,dialog:'connection'});
 assert.match(account,/Home PC connection/);assert.doesNotMatch(account,/Reconnect home PC account|data-action="pair-viewer"/);
 assert.match(connection,/ready to watch/);assert.match(connection,/no separate phone pairing/);assert.doesNotMatch(connection,/data-action="pair-viewer"/);
 assert.equal(connectionStatus({...s,network:'offline'}).kind,'offline');
 assert.equal(connectionStatus({...s,me:null,error:['Account denied','Access is paused.']}).kind,'account-error');
});

test('only explicit missing or revoked playback access asks for Google, never service outages',()=>{
 assert.equal(needsGoogleConfirmation('viewer-not-paired'),true);assert.equal(needsGoogleConfirmation('viewer-reauthentication-required'),true);
 for(const code of ['viewer-identity-unavailable','viewer-credential-unavailable','companion-offline','viewer-identity-mismatch'])assert.equal(needsGoogleConfirmation(code),false);
 const base={dialog:'connection',network:'online',user:{email:'viewer@example.invalid'}};
 assert.match(dialogContent({...base,me:{playbackAccess:{state:'confirmation-required'}}}),/data-action="pair-viewer"/);
 assert.doesNotMatch(dialogContent({...base,me:{playbackAccess:{state:'unavailable'}}}),/data-action="pair-viewer"/);
 assert.doesNotMatch(dialogContent({...base,network:'offline',me:{playbackAccess:{state:'confirmation-required'}}}),/data-action="pair-viewer"/);
});

test('Google window errors and failed PC requests have distinct safe recovery messages',()=>{
 assert.match(confirmationError({code:'auth/popup-blocked'}),/browser blocked/);
 assert.match(confirmationError({code:'companion-offline'}),/reach your home PC/);
 assert.match(confirmationError({code:'auth/user-mismatch'}),/same Google account/);
 assert.match(confirmationError({code:'viewer-identity-unavailable'}),/temporarily unavailable/);
 assert.doesNotMatch(confirmationError({code:'secret',message:'PRIVATE-TOKEN'}),/PRIVATE-TOKEN/);
});
test('an expired Firebase token is refreshed once and the same event is retried',async()=>{
 const original=globalThis.fetch,tokens=[],bodies=[];
 try{let calls=0;globalThis.fetch=async(_url,options)=>{bodies.push(options.body);return calls++===0?Response.json({error:'invalid-token'},{status:401}):Response.json({accepted:true});};
  const client=createClient(()=>({uid:'alice',getIdToken:async force=>{tokens.push(force);return 'fixture';}}));
  const event={episodeId:'one-piece-0001',revision:12,positionSeconds:20,reason:'seek'};
  assert.deepEqual(await client('/api/sessions/test/events',event),{accepted:true});
  assert.deepEqual(tokens,[false,true]);assert.equal(bodies[0],bodies[1]);
 }finally{globalThis.fetch=original;}
});

function keyEvent(key,tagName='BODY',options={}){
 return {key,code:key===' '?'Space':key,target:{tagName},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...options};
}
function keyboardContext(){
 const calls=[],player={position:600,video:{paused:true},seek(value){calls.push(['seek',value]);this.position=value;},play(){calls.push(['play']);this.video.paused=false;},pause(){calls.push(['pause']);this.video.paused=true;},fullscreen(){calls.push(['fullscreen']);}};
 return {calls,route:'watch',dialog:null,destination:'local',player,command:(...args)=>calls.push(args)};
}
test('native video Space and Arrow events never receive an additional app action or cancellation',()=>{
 for(const key of [' ','ArrowLeft','ArrowRight']){
  const event=keyEvent(key,'VIDEO'),context=keyboardContext();
  assert.equal(handleWatchKeyboard(event,context),false);
  assert.equal(event.defaultPrevented,false);assert.deepEqual(context.calls,[]);
  assert.equal(context.player.position,600);assert.equal(context.player.video.paused,true);
 }
});
test('page-level arrows still seek exactly ten seconds and Space toggles once',()=>{
 const context=keyboardContext();
 for(const [key,position]of [['ArrowLeft',590],['ArrowRight',600]]){
  const event=keyEvent(key);assert.equal(handleWatchKeyboard(event,context),true);
  assert.equal(event.defaultPrevented,true);assert.equal(context.player.position,position);
 }
 handleWatchKeyboard(keyEvent(' '),context);handleWatchKeyboard(keyEvent(' '),context);
 assert.deepEqual(context.calls,[['seek',590],['seek',600],['play'],['pause']]);
});
test('native video retains nonoverlapping K/F app shortcuts',()=>{
 const context=keyboardContext();
 handleWatchKeyboard(keyEvent('k','VIDEO'),context);handleWatchKeyboard(keyEvent('f','VIDEO'),context);
 assert.deepEqual(context.calls,[['play'],['fullscreen']]);
});
test('interactive controls, dialogs, modifiers and other routes retain ownership of their keys',()=>{
 for(const tag of ['INPUT','SELECT','TEXTAREA','BUTTON'])for(const key of [' ','ArrowLeft','k','f']){
  const event=keyEvent(key,tag),context=keyboardContext();assert.equal(handleWatchKeyboard(event,context),false);
  assert.equal(event.defaultPrevented,false);assert.deepEqual(context.calls,[]);
 }
 for(const override of [{dialog:'tracks'},{route:'library'}]){
  const context={...keyboardContext(),...override};assert.equal(handleWatchKeyboard(keyEvent('ArrowLeft'),context),false);assert.deepEqual(context.calls,[]);
 }
 for(const flags of [{ctrlKey:true},{altKey:true},{metaKey:true},{defaultPrevented:true}]){
  const context=keyboardContext();assert.equal(handleWatchKeyboard(keyEvent('ArrowLeft','BODY',flags),context),false);assert.deepEqual(context.calls,[]);
 }
});
test('page-level Cast shortcuts retain receiver controls and seek bounds',()=>{
 const context={...keyboardContext(),destination:'cast',cast:{state:'PLAYING',positionSeconds:5,durationSeconds:100}};
 handleWatchKeyboard(keyEvent('ArrowLeft'),context);handleWatchKeyboard(keyEvent(' '),context);
 context.cast.positionSeconds=99;handleWatchKeyboard(keyEvent('ArrowRight'),context);
 assert.deepEqual(context.calls,[['seek',0],['pause'],['seek',99.9]]);
});

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('UID changes destroy playback and replace private state while retaining catalogue and deep link',()=>{
 const catalog={episodes:[]},defaults={audioLanguage:'ja',subtitleLanguage:'en',autoplay:false,showTitles:false};let destroyed=0;
 const app={accountGeneration:3,s:{user:{uid:'alice'},catalog,requestedEpisode:1001,profile:{audioLanguage:'en'},progress:{private:true},me:{uid:'alice'},lease:{private:true},session:{private:true},position:600,dialog:'tracks',error:['old']},player:{destroy(){destroyed++;}},delivery:{secret:true},loadedKey:'old',eventQueue:[{old:true}],flushing:Promise.resolve(),polling:true,sending:true,loading:true,pendingPosition:600,pendingAutoplay:true,targetId:'old',audioTarget:3,preferenceAttempt:'old',deepLinkHandled:true};
 const before=accountSnapshot(app);assert.equal(resetAccountContext(app,{uid:'bob'},defaults),true);
 assert.equal(destroyed,1);assert.equal(isCurrentAccount(app,before),false);assert.equal(app.s.catalog,catalog);assert.equal(app.s.requestedEpisode,1001);assert.equal(app.s.range,1001);
 assert.equal(app.s.user.uid,'bob');assert.deepEqual(app.s.profile,defaults);assert.notEqual(app.s.profile,defaults);
 for(const field of ['player','delivery','loadedKey','flushing','pendingPosition'])assert.equal(app[field],null);
 assert.deepEqual(app.eventQueue,[]);for(const field of ['polling','sending','loading','deepLinkHandled'])assert.equal(app[field],false);
 for(const field of ['me','lease','session','dialog','error','sessionError'])assert.equal(app.s[field],null);
 assert.deepEqual(app.s.progress,{});assert.equal(app.s.position,undefined);assert.equal(app.s.lastEpisodeId,null);assert.equal(app.s.route,'library');
 const same=app.s,generation=app.accountGeneration;assert.equal(resetAccountContext(app,{uid:'bob'},defaults),false);assert.equal(app.s,same);assert.equal(app.accountGeneration,generation);
 assert.equal(resetAccountContext(app,null,defaults),true);assert.equal(app.s.user,null);assert.equal(app.s.catalog,catalog);assert.equal(app.s.requestedEpisode,1001);
});
test('a UID switch while a token resolves sends no request with the old identity',async()=>{
 const original=globalThis.fetch,token=deferred(),started=deferred();let requests=0,user={uid:'alice',getIdToken:()=>{started.resolve();return token.promise;}};
 try{globalThis.fetch=async()=>{requests++;return Response.json({private:true});};const client=createClient(()=>user),pending=client('/api/me');await started.promise;user={uid:'bob'};token.resolve('old-token');await assert.rejects(pending,e=>e.code==='identity-changed');assert.equal(requests,0);}finally{globalThis.fetch=original;}
});
test('switch and sign-out during a deferred response never expose its old-account value',async()=>{
 const original=globalThis.fetch;
 try{for(const replacement of [{uid:'bob'},null]){const response=deferred(),started=deferred();let user={uid:'alice',getIdToken:async()=> 'old-token'};globalThis.fetch=()=>{started.resolve();return response.promise;};const pending=createClient(()=>user)('/api/progress');await started.promise;user=replacement;response.resolve(Response.json({progress:{privateOldAccount:true}}));await assert.rejects(pending,e=>e.code==='identity-changed');}}
 finally{globalThis.fetch=original;}
});
test('old-account 401 responses cannot trigger a refresh or retry after switching',async()=>{
 const original=globalThis.fetch,response=deferred(),started=deferred(),tokens=[];let requests=0,user={uid:'alice',getIdToken:async refresh=>{tokens.push(refresh);return 'old-token';}};
 try{globalThis.fetch=()=>{requests++;started.resolve();return response.promise;};const pending=createClient(()=>user)('/api/me');await started.promise;user={uid:'bob',getIdToken:()=>{throw new Error('must not use new account for old operation');}};response.resolve(Response.json({error:'invalid-token'},{status:401}));await assert.rejects(pending,e=>e.code==='identity-changed');assert.equal(requests,1);assert.deepEqual(tokens,[false]);}finally{globalThis.fetch=original;}
});
test('generation guards reject A to B to A responses and switches during JSON parsing',async()=>{
 const original=globalThis.fetch;
 try{const json=deferred(),started=deferred();let generation=1,user={uid:'alice',getIdToken:async()=> 'old-token'};globalThis.fetch=async()=>({ok:true,status:200,json(){started.resolve();return json.promise;}});const pending=createClient(()=>user,()=>generation)('/api/me');await started.promise;user={uid:'bob'};generation++;user={uid:'alice'};generation++;json.resolve({privateOldSession:true});await assert.rejects(pending,e=>e.code==='identity-changed');}
 finally{globalThis.fetch=original;}
});
test('a rejected old fetch after sign-out stays an identity change rather than a new-account offline error',async()=>{
 const original=globalThis.fetch,response=deferred(),started=deferred();let user={uid:'alice',getIdToken:async()=> 'old-token'};
 try{globalThis.fetch=()=>{started.resolve();return response.promise;};const pending=createClient(()=>user)('/api/me');await started.promise;user=null;response.reject(new TypeError('network failure'));await assert.rejects(pending,e=>e.code==='identity-changed');}finally{globalThis.fetch=original;}
});
test('switching during an already started token refresh prevents its second fetch',async()=>{
 const original=globalThis.fetch,refresh=deferred(),started=deferred(),tokens=[];let requests=0,user={uid:'alice',getIdToken:async force=>{tokens.push(force);if(force){started.resolve();return refresh.promise;}return 'old-token';}};
 try{globalThis.fetch=async()=>{requests++;return Response.json({error:'invalid-token'},{status:401});};const pending=createClient(()=>user)('/api/me');await started.promise;user=null;refresh.resolve('refreshed-old-token');await assert.rejects(pending,e=>e.code==='identity-changed');assert.deepEqual(tokens,[false,true]);assert.equal(requests,1);}finally{globalThis.fetch=original;}
});

class PromiseVideo extends EventTarget {
 constructor(result){super();this.result=result;this.paused=true;this.currentTime=600;this.duration=1430;this.readyState=4;this.seeking=false;this.textTracks=[];}
 play(){this.paused=false;return this.result();}
 pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
 querySelectorAll(){return [];}
 removeAttribute(){}
 load(){}
 append(){}
 canPlayType(){return 'maybe';}
}
function promisePlayer(result){const statuses=[],failures=[],video=new PromiseVideo(result),player=new LocalPlayer(video,{onStatus:s=>statuses.push(s),onFailure:f=>failures.push(f)});return {player,video,statuses,failures};}
test('an intentional play then pause settles AbortError without a rejected promise or failure UI',async()=>{
 const request=deferred(),{player,statuses,failures}=promisePlayer(()=>request.promise),pending=player.play();player.pause();request.reject(new DOMException('test only','AbortError'));
 assert.equal(await pending,false);assert.deepEqual(statuses,[]);assert.deepEqual(failures,[]);
});
test('native pause also makes its interrupted play AbortError harmless',async()=>{
 const request=deferred(),{player,video,statuses,failures}=promisePlayer(()=>request.promise),pending=player.play();video.pause();request.reject(new DOMException('test only','AbortError'));
 assert.equal(await pending,false);assert.deepEqual(statuses,[]);assert.deepEqual(failures,[]);
});
test('NotAllowedError produces tap-to-play while genuine unsupported playback remains a failure',async()=>{
 const blocked=promisePlayer(()=>Promise.reject(new DOMException('test only','NotAllowedError')));
 assert.equal(await blocked.player.play(),false);assert.deepEqual(blocked.statuses,['tap-to-play']);assert.deepEqual(blocked.failures,[]);
 const unsupported=promisePlayer(()=>Promise.reject(new DOMException('test only','NotSupportedError')));
 assert.equal(await unsupported.player.play(),false);assert.deepEqual(unsupported.failures,['video-unavailable']);
});
test('disposed or replacement-source play completions cannot affect the current player state',async()=>{
 const previousDocument=globalThis.document;
 try{globalThis.document={createElement:()=>new EventTarget()};
  for(const replacement of ['destroy','load','load-success']){
   const request=deferred(),{player,statuses,failures}=promisePlayer(()=>request.promise),pending=player.play();
   if(replacement==='destroy')player.destroy();else await player.load({mediaUrl:'test-media',subtitleUrl:'test-captions',contentType:'application/vnd.apple.mpegurl',durationSeconds:1430},{autoplay:false});
   if(replacement==='load-success')request.resolve();else request.reject(new DOMException('test only','NotAllowedError'));
   assert.equal(await pending,false);assert.deepEqual(statuses,[]);assert.deepEqual(failures,[]);
  }
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
test('autoplay uses the same normalized play path',async()=>{
 const previousDocument=globalThis.document,blocked=promisePlayer(()=>Promise.reject(new DOMException('test only','NotAllowedError')));
 try{globalThis.document={createElement:()=>new EventTarget()};await blocked.player.load({mediaUrl:'test-media',subtitleUrl:'test-captions',contentType:'application/vnd.apple.mpegurl',durationSeconds:1430});blocked.video.dispatchEvent(new Event('loadedmetadata'));await Promise.resolve();await Promise.resolve();assert.deepEqual(blocked.statuses,['ready','tap-to-play']);assert.deepEqual(blocked.failures,[]);}
 finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
test('playback diagnostics expose only allowlisted codes and numeric state',()=>{
 const secret='https://private.invalid/ticket?cap=secret',video={error:{code:3,message:secret},currentTime:575.692104,readyState:4,paused:true,seeking:false};
 const diagnostic=sanitizedPlaybackDiagnostic(video,'hls',{type:'networkError',details:'fragLoadError',fatal:true,url:secret,reason:secret,response:{url:secret}});
 assert.equal(diagnostic.type,'networkError');assert.equal(diagnostic.details,'fragLoadError');assert.equal(diagnostic.videoErrorCode,3);assert.equal(diagnostic.positionSeconds,575.692);
 assert.equal(JSON.stringify(diagnostic).includes(secret),false);assert.equal('reason'in diagnostic,false);assert.equal('url'in diagnostic,false);
 const unknown=sanitizedPlaybackDiagnostic(video,'hls',{type:secret,details:secret});assert.equal(unknown.type,'unknown');assert.equal(unknown.details,'unknown');
});
test('HLS diagnostics precede destructive failure handling; nonfatal and stale events are distinct',()=>{
 const order=[],{player,video}=promisePlayer(()=>Promise.resolve());player.generation=1;video.error={code:3};
 player.diagnostic=(source,data)=>order.push({diagnostic:sanitizedPlaybackDiagnostic(video,source,data),removed:video.removed===true});player.onFailure=code=>{order.push({failure:code});video.removed=true;};
 player.hlsError({type:'mediaError',details:'bufferStalledError',fatal:false},1);assert.equal(order.length,1);
 player.hlsError({type:'mediaError',details:'bufferAppendError',fatal:true},1);assert.equal(order[1].diagnostic.videoErrorCode,3);assert.equal(order[1].removed,false);assert.deepEqual(order[2],{failure:'video-unavailable'});
 player.hlsError({type:'networkError',details:'fragLoadError',fatal:true},0);player.destroy();player.hlsError({fatal:true},1);assert.equal(order.length,3);
});

test('acknowledged successful PC revocation signs out locally, including an empty 204',async()=>{
 const original=globalThis.fetch;
 try{for(const status of [200,204]){
  let signedOut=0,unconfirmed=0;const requests=[];
  globalThis.fetch=async(_url,options)=>{requests.push(options);return status===204?new Response(null,{status}):Response.json({disconnected:true},{status});};
  const request=createClient(()=>({uid:'alice',getIdToken:async()=> 'test-only'}));
  const result=await disconnectBeforeSignOut({request,isCurrent:()=>true,signOut:async()=>{signedOut++;},onUnconfirmed:()=>{unconfirmed++;}});
  assert.equal(result,'signed-out');assert.equal(signedOut,1);assert.equal(unconfirmed,0);assert.equal(requests.length,1);assert.equal(requests[0].method,'DELETE');
 }}finally{globalThis.fetch=original;}
});
test('401, 403 and network disconnect failures require the explicit local-only choice',async()=>{
 const original=globalThis.fetch;
 try{for(const status of [401,403,'network']){
  let signedOut=0,unconfirmed=0,requests=0;
  globalThis.fetch=async()=>{requests++;if(status==='network')throw new TypeError('test-only failure');return Response.json({error:'denied'},{status});};
  const request=createClient(()=>({uid:'alice',getIdToken:async()=> 'test-only'}));
  const result=await disconnectBeforeSignOut({request,isCurrent:()=>true,signOut:async()=>{signedOut++;},onUnconfirmed:()=>{unconfirmed++;}});
  assert.equal(result,'disconnect-unconfirmed');assert.equal(signedOut,0);assert.equal(unconfirmed,1);assert.equal(requests,status===401?2:1);
 }}finally{globalThis.fetch=original;}
});
test('an account switch during disconnect success or failure cannot sign out the replacement account or show its dialog',async()=>{
 const original=globalThis.fetch;
 try{for(const outcome of ['success','denied','network']){
  let user={uid:'alice',getIdToken:async()=> 'test-only'},generation=1,signedOut=0,unconfirmed=0;const started=deferred(),response=deferred();
  globalThis.fetch=()=>{started.resolve();return response.promise;};
  const request=createClient(()=>user,()=>generation),pending=disconnectBeforeSignOut({request,isCurrent:()=>user?.uid==='alice'&&generation===1,signOut:async()=>{signedOut++;},onUnconfirmed:()=>{unconfirmed++;}});
  await started.promise;user={uid:'bob',getIdToken:async()=> 'replacement'};generation++;
  if(outcome==='network')response.reject(new TypeError('test-only failure'));else response.resolve(Response.json(outcome==='success'?{disconnected:true}:{error:'denied'},{status:outcome==='success'?200:403}));
  assert.equal(await pending,'identity-changed');assert.equal(signedOut,0);assert.equal(unconfirmed,0);
 }}finally{globalThis.fetch=original;}
});

class RoutingVideo extends PromiseVideo {
 constructor({nativeHls=false,result=()=>Promise.resolve()}={}){super(result);this.nativeHls=nativeHls;this.tracks=[];this.playCalls=0;this.loadCalls=0;this.src='';}
 canPlayType(type){return this.nativeHls&&type==='application/vnd.apple.mpegurl'?'maybe':'';}
 play(){this.playCalls++;return super.play();}
 load(){this.loadCalls++;this.currentTime=0;}
 removeAttribute(name){if(name==='src')this.src='';}
 querySelectorAll(){return [...this.tracks];}
 append(track){const text={language:track.srclang,mode:'disabled'};this.tracks.push(track);this.textTracks.push(text);track.remove=()=>{this.tracks=this.tracks.filter(t=>t!==track);this.textTracks=this.textTracks.filter(t=>t!==text);};}
}
function testHls(){return class {
 static Events={ERROR:'error'};static instances=[];static supportChecks=0;
 static isSupported(){this.supportChecks++;return true;}
 constructor(config){this.config=config;this.events={};this.constructor.instances.push(this);}
 on(name,handler){this.events[name]=handler;}
 loadSource(url){this.url=url;}
 attachMedia(video){this.video=video;}
 destroy(){this.destroyed=true;}
};}
const testDelivery=(contentType,mediaUrl='test-media')=>({mediaUrl,subtitleUrl:'test-english-vtt',contentType,durationSeconds:1430});

test('declared MP4 uses native media without HLS and preserves English captions, resume clamping and one autoplay',async()=>{
 const previousDocument=globalThis.document,HlsEngine=testHls(),video=new RoutingVideo(),failures=[];
 try{globalThis.document={createElement:()=>new EventTarget()};const player=new LocalPlayer(video,{hlsEngine:HlsEngine,onFailure:c=>failures.push(c)});
  await player.load(testDelivery('video/mp4'),{positionSeconds:2000});
  assert.equal(video.src,'test-media');assert.equal(HlsEngine.instances.length,0);assert.equal(HlsEngine.supportChecks,0);assert.equal(video.crossOrigin,'anonymous');assert.equal(video.preload,'metadata');
  const track=video.tracks[0];assert.equal(track.kind,'subtitles');assert.equal(track.srclang,'en');assert.equal(track.default,true);assert.equal(track.src,'test-english-vtt');
  video.dispatchEvent(new Event('loadedmetadata'));video.dispatchEvent(new Event('loadedmetadata'));await Promise.resolve();
  assert.equal(video.currentTime,1429.5);assert.equal(video.playCalls,1);assert.equal(video.textTracks[0].mode,'showing');
  player.subtitles(false);track.dispatchEvent(new Event('load'));assert.equal(video.textTracks[0].mode,'disabled');assert.deepEqual(failures,[]);player.destroy();
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
test('both recognized HLS MIME types retain native-HLS or hls.js routing and explicit start position',async()=>{
 const previousDocument=globalThis.document;
 try{globalThis.document={createElement:()=>new EventTarget()};for(const contentType of ['application/vnd.apple.mpegurl','application/x-mpegurl'])for(const nativeHls of [true,false]){
  const HlsEngine=testHls(),video=new RoutingVideo({nativeHls}),player=new LocalPlayer(video,{hlsEngine:HlsEngine});await player.load(testDelivery(contentType),{positionSeconds:600,autoplay:false});
  if(nativeHls){assert.equal(video.src,'test-media');assert.equal(HlsEngine.instances.length,0);}
  else{const instance=HlsEngine.instances[0];assert.equal(instance.url,'test-media');assert.equal(instance.video,video);assert.equal(instance.config.startPosition,600);const xhr={};instance.config.xhrSetup(xhr);assert.equal(xhr.withCredentials,false);}
  video.dispatchEvent(new Event('loadedmetadata'));assert.equal(video.currentTime,600);assert.equal(video.paused,true);assert.equal(video.playCalls,0);player.destroy();
 }}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
test('missing or unknown delivery MIME fails explicitly and never guesses HLS from a media URL',async()=>{
 const previousDocument=globalThis.document;
 try{globalThis.document={createElement:()=>new EventTarget()};for(const contentType of [undefined,'','video/webm','text/html']){
  const HlsEngine=testHls(),video=new RoutingVideo({nativeHls:true}),failures=[],player=new LocalPlayer(video,{hlsEngine:HlsEngine,onFailure:c=>failures.push(c)});
  await player.load(testDelivery(contentType,'test.m3u8'));video.dispatchEvent(new Event('loadedmetadata'));
  assert.deepEqual(failures,['delivery-type-unsupported']);assert.equal(video.src,'');assert.equal(HlsEngine.instances.length,0);assert.equal(HlsEngine.supportChecks,0);assert.equal(video.tracks.length,0);assert.equal(video.playCalls,0);player.destroy();
 }}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
test('HLS and MP4 source replacements detach old tracks and HLS callbacks while retaining paused renewal intent',async()=>{
 const previousDocument=globalThis.document,HlsEngine=testHls(),video=new RoutingVideo(),failures=[],player=new LocalPlayer(video,{hlsEngine:HlsEngine,onFailure:c=>failures.push(c)});
 try{globalThis.document={createElement:()=>new EventTarget()};
  await player.load(testDelivery('application/vnd.apple.mpegurl','old-hls'),{autoplay:false});const oldHls=player.hls,oldTrack=video.tracks[0];
  await player.load(testDelivery('video/mp4','new-mp4'),{positionSeconds:650,autoplay:false,subtitles:false});assert.equal(oldHls.destroyed,true);assert.equal(player.hls,null);assert.equal(video.tracks.length,1);
  oldTrack.dispatchEvent(new Event('error'));oldHls.events.error('error',{fatal:true,type:'networkError'});video.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(video.currentTime,650);assert.equal(video.paused,true);assert.equal(video.playCalls,0);assert.equal(video.textTracks[0].mode,'disabled');assert.deepEqual(failures,[]);
  await player.load(testDelivery('video/mp4','renewed-mp4'),{positionSeconds:660,autoplay:false});video.dispatchEvent(new Event('loadedmetadata'));assert.equal(video.currentTime,660);assert.equal(video.playCalls,0);
  await player.load(testDelivery('application/x-mpegurl','new-hls'),{positionSeconds:670,autoplay:false});video.dispatchEvent(new Event('loadedmetadata'));assert.equal(player.hls.url,'new-hls');assert.equal(video.currentTime,670);assert.equal(video.playCalls,0);player.destroy();
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
test('pending native MP4 play and track/metadata events become inert after source replacement or destroy',async()=>{
 const previousDocument=globalThis.document;
 try{globalThis.document={createElement:()=>new EventTarget()};for(const dispose of [false,true]){
  const request=deferred(),video=new RoutingVideo({result:()=>request.promise}),failures=[],statuses=[],player=new LocalPlayer(video,{hlsEngine:testHls(),onFailure:c=>failures.push(c),onStatus:s=>statuses.push(s)});
  await player.load(testDelivery('video/mp4','old-mp4'),{autoplay:false});const oldTrack=video.tracks[0],playing=player.play();
  if(dispose)player.destroy();else await player.load(testDelivery('video/mp4','replacement-mp4'),{positionSeconds:700,autoplay:false});
  oldTrack.dispatchEvent(new Event('error'));oldTrack.dispatchEvent(new Event('load'));video.dispatchEvent(new Event('loadedmetadata'));request.reject(new DOMException('test only','NotAllowedError'));
  assert.equal(await playing,false);assert.deepEqual(failures,[]);assert.equal(statuses.includes('tap-to-play'),false);assert.equal(video.playCalls,1);
  if(dispose){assert.equal(video.src,'');assert.equal(video.tracks.length,0);await player.load(testDelivery('video/mp4','must-not-load'));assert.equal(video.src,'');}
  else{assert.equal(video.currentTime,700);assert.equal(video.paused,true);player.destroy();}
 }}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});

test('review frame timing requires presented callbacks, measures first/post-seek frames and logs only allowed fields',()=>{
 let clock=100,id=0;const callbacks=new Map(),logs=[],video=new EventTarget();Object.assign(video,{paused:true,seeking:false,textTracks:[{language:'en',mode:'showing'}],querySelector:()=>({readyState:2}),requestVideoFrameCallback:fn=>{callbacks.set(++id,fn);return id;},cancelVideoFrameCallback:key=>callbacks.delete(key)});
 const stop=observeReviewFrames(video,1000,{now:()=>clock,log:row=>logs.push(row)});
 const present=(at,mediaTime,frames)=>{const [key,fn]=callbacks.entries().next().value;callbacks.delete(key);fn(at,{mediaTime,presentedFrames:frames,url:'must-not-log',cue:'must-not-log'});};
 video.dispatchEvent(new Event('seeked'));assert.equal(logs.length,0);present(140,0,1);assert.equal(logs[0].elapsedMs,40);assert.equal(logs[0].event,'first-frame');assert.equal(callbacks.size,0);
 clock=200;video.currentTime=600;video.seeking=true;video.dispatchEvent(new Event('seeking'));present(220,600,2);assert.equal(logs.length,2);assert.equal(callbacks.size,1);
 assert.deepEqual(logs[1],{episode:1000,event:'seek-frame-observed',elapsedMs:20,mediaTime:600,frameCount:2,paused:true,seeking:true,seekSequence:1,seekTargetSeconds:600,englishTrackReadyState:2,englishTrackMode:'showing'});assert.equal(logs.some(row=>row.event==='seek-frame'),false);
 video.seeking=false;present(260,600,3);assert.equal(logs[2].event,'seek-frame-observed');
 assert.deepEqual(logs[3],{episode:1000,event:'seek-frame',elapsedMs:60,mediaTime:600,frameCount:3,paused:true,seeking:false,seekSequence:1,seekTargetSeconds:600,englishTrackReadyState:2,englishTrackMode:'showing'});assert.equal(JSON.stringify(logs).includes('must-not-log'),false);
 clock=300;video.dispatchEvent(new Event('seeking'));const stale=[...callbacks.values()][0];stop();assert.equal(callbacks.size,0);stale(400,{mediaTime:700,presentedFrames:4});video.dispatchEvent(new Event('seeking'));assert.equal(logs.length,4);assert.equal(callbacks.size,0);
});
test('review frame observation marks a missing frame API unmeasured and ignores nonallowlisted episodes',()=>{
 const logs=[],video={paused:true,seeking:false,textTracks:[],querySelector:()=>null};observeReviewFrames(video,1001,{log:row=>logs.push(row)});assert.equal(logs[0].event,'unmeasured-frame-api');assert.equal(logs[0].elapsedMs,null);assert.equal(logs[0].mediaTime,null);assert.equal(logs[0].frameCount,null);assert.equal(logs[0].englishTrackMode,'absent');observeReviewFrames(video,1,{log:row=>logs.push(row)});assert.equal(logs.length,1);
});
test('pending-frame observations are bounded without suppressing completion or conflating later seek targets',()=>{
 let clock=0,id=0,frames=0;const callbacks=new Map(),logs=[],video=new EventTarget();Object.assign(video,{currentTime:0,paused:true,seeking:false,textTracks:[],querySelector:()=>null,requestVideoFrameCallback:fn=>{callbacks.set(++id,fn);return id;},cancelVideoFrameCallback:key=>callbacks.delete(key)});
 const stop=observeReviewFrames(video,1001,{now:()=>clock,log:row=>logs.push(row)});
 const present=()=>{const [key,fn]=callbacks.entries().next().value;callbacks.delete(key);fn(++clock,{mediaTime:video.currentTime,presentedFrames:++frames});};present();
 for(let sequence=1;sequence<=20;sequence++){
  video.currentTime=sequence*20;video.seeking=true;video.dispatchEvent(new Event('seeking'));
  for(let frame=0;frame<12;frame++)present();
  video.seeking=false;present();
  const complete=logs.at(-1);assert.equal(complete.event,'seek-frame');assert.equal(complete.seekSequence,sequence);assert.equal(complete.seekTargetSeconds,sequence*20);
 }
 const observed=logs.filter(row=>row.event==='seek-frame-observed');assert.equal(observed.length,128);assert.equal(observed.filter(row=>row.seekSequence===1).length,8);assert.equal(logs.filter(row=>row.event==='seek-frame').length,20);assert.equal(callbacks.size,0);stop();
});

test('a paused ready seek clears buffering without claiming playing or resuming the video',async()=>{
 const previousDocument=globalThis.document,video=new RoutingVideo(),statuses=[],positions=[],player=new LocalPlayer(video,{onStatus:s=>statuses.push(s),onSeek:p=>positions.push(p)});
 try{globalThis.document={createElement:()=>new EventTarget()};await player.load(testDelivery('video/mp4'),{autoplay:false});video.dispatchEvent(new Event('loadedmetadata'));
  video.dispatchEvent(new Event('waiting'));assert.equal(statuses.at(-1),'buffering');video.currentTime=625.692;video.readyState=4;video.dispatchEvent(new Event('seeked'));
  assert.equal(statuses.at(-1),'ready');assert.equal(statuses.includes('playing'),false);assert.equal(video.paused,true);assert.equal(video.playCalls,0);assert.deepEqual(positions,[625.692]);player.destroy();
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
test('canplay clears a ready buffer independently of paused state and only playing can claim playing',async()=>{
 const previousDocument=globalThis.document;
 try{globalThis.document={createElement:()=>new EventTarget()};for(const paused of [true,false]){
  const video=new RoutingVideo(),statuses=[],player=new LocalPlayer(video,{onStatus:s=>statuses.push(s)});await player.load(testDelivery('video/mp4'),{autoplay:false});video.dispatchEvent(new Event('loadedmetadata'));video.paused=paused;video.dispatchEvent(new Event('waiting'));video.readyState=3;video.dispatchEvent(new Event('canplay'));
  assert.equal(statuses.at(-1),'ready');assert.equal(statuses.includes('playing'),false);assert.equal(video.paused,paused);assert.equal(video.playCalls,0);
  if(!paused){video.dispatchEvent(new Event('playing'));assert.equal(statuses.at(-1),'playing');}player.destroy();
 }}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
test('readiness cannot clear buffering while loading, seeking, insufficiently ready, errored, stale or disposed',async()=>{
 const previousDocument=globalThis.document,video=new RoutingVideo(),statuses=[],callbacks=[],add=video.addEventListener.bind(video);video.addEventListener=(name,fn,options)=>{if(name==='canplay')callbacks.push(fn);return add(name,fn,options);};const player=new LocalPlayer(video,{onStatus:s=>statuses.push(s)});
 try{globalThis.document={createElement:()=>new EventTarget()};await player.load(testDelivery('video/mp4'),{autoplay:false});video.dispatchEvent(new Event('waiting'));video.dispatchEvent(new Event('canplay'));assert.equal(statuses.at(-1),'buffering');assert.equal(player.loading,true);
  video.dispatchEvent(new Event('loadedmetadata'));video.dispatchEvent(new Event('waiting'));const old=callbacks[0];
  video.seeking=true;video.dispatchEvent(new Event('canplay'));assert.equal(statuses.at(-1),'buffering');video.seeking=false;video.readyState=2;video.dispatchEvent(new Event('seeked'));assert.equal(statuses.at(-1),'buffering');
  video.readyState=4;video.error={code:3};video.dispatchEvent(new Event('canplay'));assert.equal(statuses.at(-1),'buffering');video.error=null;
  await player.load(testDelivery('video/mp4','replacement'),{autoplay:false});video.dispatchEvent(new Event('loadedmetadata'));video.dispatchEvent(new Event('waiting'));old();assert.equal(statuses.at(-1),'buffering');
  video.dispatchEvent(new Event('canplay'));assert.equal(statuses.at(-1),'ready');const current=callbacks[1],length=statuses.length;player.destroy();old();current();video.dispatchEvent(new Event('canplay'));assert.equal(statuses.length,length);
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
test('ready events retain a required tap-to-play and cannot revive a failed load',async()=>{
 const previousDocument=globalThis.document,video=new RoutingVideo({result:()=>Promise.reject(new DOMException('test only','NotAllowedError'))}),statuses=[],failures=[],player=new LocalPlayer(video,{onStatus:s=>statuses.push(s),onFailure:c=>failures.push(c)});
 try{globalThis.document={createElement:()=>new EventTarget()};await player.load(testDelivery('video/mp4'));video.dispatchEvent(new Event('loadedmetadata'));await Promise.resolve();await Promise.resolve();assert.equal(statuses.at(-1),'tap-to-play');
  video.dispatchEvent(new Event('waiting'));video.dispatchEvent(new Event('canplay'));video.dispatchEvent(new Event('seeked'));assert.equal(statuses.at(-1),'tap-to-play');assert.deepEqual(failures,[]);
  await player.load(testDelivery('video/mp4','failed-source'));player.fail('video-unavailable','video');const length=statuses.length,calls=video.playCalls;video.dispatchEvent(new Event('loadedmetadata'));video.dispatchEvent(new Event('waiting'));video.dispatchEvent(new Event('canplay'));assert.equal(statuses.length,length);assert.equal(video.playCalls,calls);assert.equal(player.lastStatus,'failed');player.destroy();
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
