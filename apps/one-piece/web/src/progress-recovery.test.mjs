import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as recovery from './progress-recovery.mjs';
import {safeLocalProgress,validPendingEvent,episodeId} from './model.mjs';
import {dialogContent,ready} from './views.mjs';

const source=await readFile(new URL('./app.mjs',import.meta.url),'utf8');
const now=Date.now(),deviceId='test-device',id50=episodeId(50);
const lease=(extra={})=>({sessionId:'session-test',deviceId,generation:50,authorityEpoch:3,revision:2557,destination:'local',expiresAt:now+120000,...extra});
const event=(position=1391.338756,extra={})=>({episodeId:id50,generation:50,authorityEpoch:3,revision:2557,positionSeconds:position,reason:'pause',localOrder:1,...extra});
const progress=(position=1391.338756,extra={})=>({...event(position),durationSeconds:1500,watched:false,updatedAt:now,...extra});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function memory(){const values=new Map();return {values,get:(key,fallback)=>values.has(key)?structuredClone(values.get(key)):fallback,set(key,value){values.set(key,structuredClone(value));return true;}};}
function method(name,dependencies){const start=source.search(new RegExp(`^ (?:async )?${name}\\(`,'m'));assert.ok(start>=0,name);const rest=source.slice(start+1),end=rest.search(/\n (?:async )?[A-Za-z]\w*\(/);return new Function(...Object.keys(dependencies),`return ({${rest.slice(0,end)}}).${name}`)(...Object.values(dependencies));}
function fixture({pending=[],currentLease=lease(),snapshot,storage=memory()}={}){
 const timers=[],deps={...recovery,store:storage,safeLocalProgress,validPendingEvent,initialSeason:()=>1,episodeId,deviceId,accessGate:()=>null,ready,errorCopy:code=>[code],needsGoogleConfirmation:()=>false,
  location:{href:'https://example.invalid/one-piece/'},history:{replaceState(){}},progressRecoveryNotice:()=>'',setTimeout:(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;},clearTimeout:timer=>{if(timer)timer.cancelled=true;}};
 const app={s:{user:{uid:'viewer'},me:{role:'owner'},profile:{audioLanguage:'ja'},network:'online',route:'library',progress:{[id50]:progress()},session:{episodeId:id50,episodeNumber:50,state:'ready',playback:{durationSeconds:1500}},lease:currentLease,notice:'',dialog:null},
  accountGeneration:1,eventQueue:pending,progressCandidates:[],serverProgress:{},progressOrder:pending.length,account(){return {uid:this.s.user?.uid,generation:this.accountGeneration};},current(account){return account.uid===this.s.user?.uid&&account.generation===this.accountGeneration;},key:part=>`test:${part}`,patch(){},render(){},dialog(){},closeDialog(){this.s.dialog=null;},poll:async()=>{},scheduled:0,timers,requests:[],storage,
  request:async function(route,input){this.requests.push({route,input});if(route==='/api/progress')return structuredClone(snapshot??{lease:currentLease,progress:{[id50]:progress()},lastEpisodeId:id50});if(route==='/api/sessions')return {lease:lease({sessionId:'new-session',generation:51,authorityEpoch:1,revision:0}),episodeId:input.episodeId,episodeNumber:Number(input.episodeId.slice(-4)),state:'preparing',playback:null};if(route.endsWith('/episode'))return {lease:this.s.lease,episodeId:input.episodeId,episodeNumber:Number(input.episodeId.slice(-4)),state:'preparing',playback:null};if(route.endsWith('/events'))return {lease:lease({revision:input.revision}),progress:progress(input.positionSeconds,input)};throw Error(route);}};
 for(const name of ['restore','persist','progressState','settleProgressChoice','applyProgressSnapshot','recoverProgress','retryProgress','chooseProgressPlace','mergeLease','targetMatches','open','record','flush','flushQueue'])app[name]=method(name,deps);
 app.scheduleProgressRetry=()=>{app.scheduled++;};app.progressState();return {app,storage,deps};
}

test('only exact acknowledged payloads clear events; a higher competing revision or intentional rewind remains reviewable',()=>{
 assert.equal(recovery.verifiedEventCoverage(event(),progress()),'acknowledged');
 assert.equal(recovery.verifiedEventCoverage(event(1400),progress(1391.338756,{revision:2558})),null);
 assert.equal(recovery.verifiedEventCoverage(event(1400),progress(300,{revision:2558,reason:'seek'})),null);
 assert.equal(recovery.verifiedEventCoverage(event(),progress(1391.338756,{authorityEpoch:4})),null);
 const result=recovery.reconcileProgressEvents([event(1400)],[],{lease:lease({revision:2558}),progress:{[id50]:progress(300,{revision:2558,reason:'seek'})}});
 assert.equal(result.pending.length,0);assert.equal(result.candidates[0].event.positionSeconds,1400);assert.equal(result.candidates[0].savedPosition,300);
});

test('actual open50->51 clears exact lost ACK against one snapshot, expires the old lease and claims without takeover',async()=>{
 const {app}=fixture({pending:[event()],currentLease:lease({expiresAt:now-1}),snapshot:{lease:lease({expiresAt:now-1}),progress:{[id50]:progress()},lastEpisodeId:id50}});
 await app.open(51);assert.equal(app.eventQueue.length,0);assert.equal(app.progressCandidates.length,0);assert.equal(app.s.selectedNumber,51);
 assert.deepEqual(app.requests.map(r=>r.route),['/api/progress','/api/sessions']);assert.equal(app.requests[1].input.takeover,false);assert.equal(app.s.progress[id50].positionSeconds,1391.338756);
});

test('unconfirmed old50 is journaled before51; latest local rewind and journal survive actual restore',async()=>{
 const {app,storage}=fixture({pending:[event(1450,{revision:2556,localOrder:1}),event(1400,{revision:2556,localOrder:2})],currentLease:null,snapshot:{lease:null,progress:{[id50]:progress()},lastEpisodeId:id50}});
 await app.open(51);assert.equal(app.s.selectedNumber,51);assert.equal(app.eventQueue.length,0);assert.equal(app.progressCandidates.length,1);assert.equal(app.progressCandidates[0].event.positionSeconds,1400);
 const restored=fixture({storage,currentLease:null}).app;restored.restore();assert.equal(restored.eventQueue.length,0);assert.equal(restored.s.resumeConflicts[0].positionSeconds,1400);assert.equal(restored.s.resumeConflicts[0].savedPosition,1391.338756);
});

test('episode-changed reconciles old50 and does not permanently block51',async()=>{
 const {app}=fixture({pending:[event(1400,{revision:2558})]});const request=app.request;app.request=async function(route,input,...args){if(route.endsWith('/events')){this.requests.push({route,input});throw {code:'episode-changed'};}return request.call(this,route,input,...args);};
 await app.open(51);assert.equal(app.s.selectedNumber,51);assert.equal(app.progressCandidates[0].event.positionSeconds,1400);assert.equal(app.requests.filter(r=>r.route==='/api/progress').length,1);
});

test('another active local device is not adopted or silently taken over',async()=>{
 const {app}=fixture({pending:[event(1400)],currentLease:null,snapshot:{lease:lease({deviceId:'other-device',generation:51,authorityEpoch:1}),progress:{[id50]:progress()}}});const request=app.request;app.request=async function(route,input,...args){if(route==='/api/sessions'){this.requests.push({route,input});throw {code:'active-session'};}return request.call(this,route,input,...args);};
 await app.open(51);assert.equal(app.s.lease,null);assert.equal(app.s.dialog,'takeover');assert.equal(app.requests.at(-1).input.takeover,false);assert.equal(app.progressCandidates[0].event.positionSeconds,1400);
});

test('a lost ACK is recovered from durable PC data without repeating the write',async()=>{
 const pending=event(1400,{revision:undefined}),{app}=fixture({pending:[pending]});let writes=0,saved;
 app.request=async function(route,input){this.requests.push({route,input});if(route.endsWith('/events')){writes++;saved=progress(input.positionSeconds,input);throw {code:'companion-offline'};}if(route==='/api/progress')return {lease:lease({revision:saved.revision}),progress:{[id50]:saved}};throw Error(route);};
 await app.flush();assert.equal(app.eventQueue.length,1);await app.retryProgress();assert.equal(writes,1);assert.equal(app.eventQueue.length,0);assert.equal(app.progressCandidates.length,0);
});

test('delayed ACK removes its exact event and preserves a replacement/newer pending position',async()=>{
 const first=event(1391,{revision:2558}),replacement=event(1400,{revision:undefined,localOrder:2}),ack=deferred(),{app}=fixture({pending:[first]});let writes=0;
 app.request=async()=>{if(++writes===1)return ack.promise;throw {code:'companion-offline'};};const sending=app.flush();app.eventQueue=[replacement];ack.resolve({lease:lease({revision:2558}),progress:progress(1391,{revision:2558})});await sending;
 assert.equal(app.eventQueue[0],replacement);assert.equal(app.s.progress[id50].positionSeconds,1400);
});

test('older ACK cannot regress newer Cast authority or its verified rewind',async()=>{
 const ack=deferred(),{app}=fixture({pending:[event(1391,{revision:2558})]});app.request=()=>ack.promise;const sending=app.flush();app.s.lease=lease({destination:'cast',authorityEpoch:4,revision:2600});app.s.progress[id50]=progress(1200,{authorityEpoch:4,revision:2600,reason:'seek'});
 ack.resolve({lease:lease({revision:2558}),progress:progress(1391,{revision:2558})});await sending;assert.equal(app.s.lease.authorityEpoch,4);assert.equal(app.s.lease.destination,'cast');assert.equal(app.s.progress[id50].positionSeconds,1200);
});

test('Cast authority archives stale local writes and same-episode Cast open sends no episode/reload command',async()=>{
 const {app}=fixture({pending:[event(1400)],currentLease:lease({destination:'cast',authorityEpoch:4}),snapshot:{lease:lease({destination:'cast',authorityEpoch:4}),progress:{[id50]:progress(1200,{authorityEpoch:4,reason:'seek'})}}});
 await app.flush();assert.equal(app.eventQueue.length,0);assert.equal(app.progressCandidates[0].event.positionSeconds,1400);assert.equal(app.requests.filter(r=>r.route.endsWith('/events')).length,0);
 app.requests=[];app.s.session.cast={owned:true,episodeId:id50,state:'PAUSED',positionSeconds:1200};await app.open(50);assert.equal(app.s.route,'watch');assert.equal(app.requests.length,0);
});

test('local saved-place choice remains through failed opening/reload and clears only after its exact new-authority ACK',async()=>{
 const {app,storage}=fixture();app.progressCandidates=recovery.journalProgressEvent([],event(1400),{progress:progress()});app.progressState();app.open=async()=>{throw {code:'companion-offline'};};await assert.rejects(app.chooseProgressPlace('local'));assert.equal(app.progressCandidates.length,1);assert.ok(app.progressCandidates[0].choice);
 const restored=fixture({storage,currentLease:lease({generation:51,authorityEpoch:1,revision:0})}).app;restored.restore();assert.ok(restored.progressCandidates[0].choice);
 const id=restored.progressCandidates[0].id;restored.record('seek',1400,{recoveryId:id});await restored.flush();assert.equal(restored.progressCandidates.length,0);
});

test('explicit PC choice resolves only the selected episode; unknown PC place is never invented as zero',async()=>{
 const {app}=fixture();app.progressCandidates=recovery.journalProgressEvent([],event(1400),{id:()=> 'fifty'});app.progressCandidates=recovery.journalProgressEvent(app.progressCandidates,event(20,{episodeId:episodeId(49),localOrder:2}),{id:()=> 'fortynine'});app.progressState();
 assert.equal(app.s.resumeConflict.savedPosition,undefined);assert.doesNotMatch(dialogContent({...app.s,dialog:'resume-conflict'}),/data-action="resume-server"/);
 app.progressCandidates[0].savedPosition=1391.338756;app.progressState();app.open=async()=>{};await app.chooseProgressPlace('server');assert.equal(app.progressCandidates.length,1);assert.equal(app.progressCandidates[0].event.episodeId,episodeId(49));
});

test('offline already-loaded50 resumes locally; new51 still needs the protected PC route',async()=>{
 const {app}=fixture();app.s.network='offline';let plays=0;app.player={play:async()=>{plays++;}};app.loadedKey='already-loaded';await app.open(50);assert.equal(plays,1);assert.equal(app.s.route,'watch');await app.open(51);assert.equal(app.s.dialog,'connection');assert.equal(app.requests.length,0);
});

test('failed journal persistence never overwrites the legacy pending copy during migration',()=>{
 const storage=memory(),pending=[event(1400)];storage.set('test:pending',pending);const write=storage.set;storage.set=(key,value)=>key==='test:progress-review'?false:write.call(storage,key,value);
 const {app}=fixture({pending,currentLease:null,storage});app.applyProgressSnapshot({lease:null,progress:{[id50]:progress()}});assert.equal(app.eventQueue.length,0);assert.equal(app.s.progressRetryError,'device-storage-unavailable');assert.deepEqual(storage.get('test:pending'),pending);
 const reloaded=fixture({storage,currentLease:null}).app;reloaded.restore();assert.equal(reloaded.eventQueue[0].positionSeconds,1400);
});

test('a flush batch is bounded and retry scheduling stops after three current-account attempts',async()=>{
 const {app,deps}=fixture({pending:Array.from({length:10},(_,i)=>event(100+i,{revision:undefined,localOrder:i+1}))});await app.flush();assert.equal(app.requests.length,4);assert.equal(app.eventQueue.length,6);assert.ok(app.scheduled);
 app.scheduleProgressRetry=method('scheduleProgressRetry',deps);let flushes=0;app.flush=async()=>{flushes++;};for(let i=0;i<4;i++){app.scheduleProgressRetry();const timer=app.progressRetryTimer;if(timer)timer.fn();}
 assert.deepEqual(app.timers.map(item=>item.ms),[1000,4000,12000]);assert.equal(flushes,3);
 app.progressRetryAttempts=0;app.scheduleProgressRetry();app.accountGeneration++;app.progressRetryTimer.fn();assert.equal(flushes,3);
});

test('Check connection restores online reachability and permits51 after recovery',async()=>{
 const {app}=fixture({pending:[event()],currentLease:null,snapshot:{lease:null,progress:{[id50]:progress()}}});app.s.network='offline';await app.retryProgress();assert.equal(app.s.network,'online');await app.open(51);assert.equal(app.s.selectedNumber,51);
});

test('retry refreshes an open review, closes a settled review, and never reopens a dismissed dialog',async()=>{
 const {app}=fixture({snapshot:{lease:null,progress:{[id50]:progress()}}});app.progressCandidates=recovery.journalProgressEvent([],event(1400),{id:()=> 'review'});app.progressState();app.s.dialog='resume-conflict';let renders=0;app.dialog=()=>{renders++;};await app.retryProgress();assert.equal(renders,1);assert.equal(app.s.resumeConflict.savedPosition,1391.338756);
 app.progressCandidates[0].event=event();app.persist();await app.retryProgress();assert.equal(app.s.dialog,null);
 const pending=deferred();app.progressCandidates=recovery.journalProgressEvent([],event(1400),{id:()=> 'dismissed'});app.progressState();app.s.dialog='resume-conflict';app.request=()=>pending.promise;const request=app.retryProgress();app.closeDialog();pending.resolve({lease:null,progress:{[id50]:progress()}});await request;assert.equal(app.s.dialog,null);assert.equal(renders,1);
});

test('old GET50 cannot overwrite loaded51 or label its new progress as50, with either a new or unchanged session',async()=>{
 for(const freshClaim of [false,true]){
  const response=deferred(),{app,deps}=fixture();app.poll=method('poll',deps);app.runtimeError=error=>{throw error;};const request=app.request,posted=[];
  app.request=async function(route,input,...args){if(route==='/api/sessions/session-test'&&input===undefined)return response.promise;if(route.endsWith('/events')){posted.push(input);return {lease:this.s.lease,progress:{...input,durationSeconds:1500}};}return request.call(this,route,input,...args);};
  const oldPoll=app.poll();if(freshClaim)app.s.lease={...app.s.lease,expiresAt:now-1};await app.open(51);
  app.s.session={episodeId:episodeId(51),episodeNumber:51,state:'ready',playback:{durationSeconds:1500},lease:app.s.lease};app.s.selectedNumber=51;app.targetId=null;app.loadedKey='loaded51';
  response.resolve({lease:lease(),episodeId:id50,episodeNumber:50,state:'ready',playback:{durationSeconds:1500}});await oldPoll;assert.equal(app.s.session.episodeId,episodeId(51));
  app.record('pause',400);await app.flush();assert.equal(posted[0].episodeId,episodeId(51));assert.equal(posted[0].positionSeconds,400);assert.equal(app.progressCandidates.length,0);assert.equal(app.s.progress[id50].positionSeconds,1391.338756);
 }
});

test('old Cast poll is inert after a local handoff; legitimate receiver episode transitions remain visible',async()=>{
 const response=deferred(),{app,deps}=fixture({currentLease:lease({destination:'cast',authorityEpoch:4})});app.poll=method('poll',deps);app.runtimeError=error=>{throw error;};app.s.session.cast={owned:true,episodeId:id50,state:'PAUSED'};app.s.session.lease=app.s.lease;app.request=()=>response.promise;const oldPoll=app.poll();
 app.mergeLease(lease({destination:'local',authorityEpoch:5}));app.s.session={...app.s.session,lease:app.s.lease,cast:null};let pauses=0;app.player={pause(){pauses++;}};
 response.resolve({lease:lease({destination:'cast',authorityEpoch:4}),episodeId:id50,episodeNumber:50,state:'ready',playback:{durationSeconds:1500},cast:{owned:true,episodeId:id50,state:'PLAYING',positionSeconds:1000}});await oldPoll;assert.equal(app.s.lease.destination,'local');assert.equal(app.s.session.cast,null);assert.equal(pauses,0);
 app.s.lease=lease({destination:'cast',authorityEpoch:6});app.s.session={...app.s.session,lease:app.s.lease,cast:{owned:true,episodeId:id50}};app.request=async()=>({lease:lease({destination:'cast',authorityEpoch:6,revision:2560}),episodeId:episodeId(51),episodeNumber:51,state:'ready',playback:{durationSeconds:1500},cast:{owned:true,episodeId:episodeId(51),state:'PLAYING',positionSeconds:20}});await app.poll();assert.equal(app.s.session.episodeId,episodeId(51));assert.equal(app.s.progress[episodeId(51)].positionSeconds,20);
});

test('storage failure sync label never claims that the device saved the place',()=>{
 const {app,deps}=fixture({pending:[event()]});const label={textContent:''};app.root={querySelector:selector=>selector==='#sync-label'?label:null,querySelectorAll:()=>[]};app.patchFamily=()=>{};app.s.progressRetryError='device-storage-unavailable';method('patch',deps).call(app);assert.equal(label.textContent,'Device save not confirmed');
});

test('an old rejected GET cannot expire the newly claimed51 session',async()=>{
 const response=deferred(),{app,deps}=fixture();app.poll=method('poll',deps);app.runtimeError=method('runtimeError',deps);const request=app.request;app.request=function(route,input,...args){return route==='/api/sessions/session-test'&&input===undefined?response.promise:request.call(this,route,input,...args);};
 const oldPoll=app.poll();app.s.lease={...app.s.lease,expiresAt:now-1};await app.open(51);response.reject({code:'session-replaced-or-expired'});await oldPoll;assert.equal(app.s.lease.generation,51);assert.equal(app.s.lease.sessionId,'new-session');assert.equal(app.s.session.episodeId,episodeId(51));assert.equal(app.s.sessionError,null);
});
