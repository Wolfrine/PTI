/** Opt-in REAL 60-minute production prepared-MP4 capacity test. Never a physical-client or Firebase claim. */
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,statfs} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {createMediaCoordinator} from '../src/media/index.mjs';
import {ARCHIVE_ITEMS,buildCatalog,canonicalEpisodeId} from '../src/sources/archive.mjs';
import {ProgressStore,atomicJson} from '../src/progress.mjs';
import {CompanionApi} from '../src/api.mjs';
import {TicketStore} from '../src/tickets.mjs';
import {command} from './media-real.mjs';
import {ownDurationEngine} from './duration-owned-engine.mjs';
import {parseDecoderProgress,assessDurationReport,REQUIRED_DURATION_MS} from './duration-metrics.mjs';

const BIN='H:/PTI-OnePiece/pilot/jellyfin/runtime/jellyfin',ORIGINAL_ROOT='H:/PTI-OnePiece/production-media/cache/originals';
const EVIDENCE=fileURLToPath(new URL('../../../../docs/one-piece/evidence/media-production-duration.json',import.meta.url));
const ALLOWED=[1,1000,1001],MAX_HTTP_BYTES=32*1024**3,MAX_HTTP_REQUESTS=3000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const safeCode=error=>/^[a-zA-Z0-9_-]{1,100}$/.test(error?.code??'')?error.code:'duration-check-failed';
const fail=code=>Object.assign(new Error(code),{code});
async function within(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('duration-operation-timeout')),ms);})]);}finally{clearTimeout(timer);}}
const hash=value=>createHash('sha256').update(value).digest('hex');
async function boundedText(response,limit){const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>limit)throw fail('caption-size-limit');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}

export async function runDurationCheck(){
 assert.equal(process.env.PTI_RUN_REAL_DURATION,'1','Explicit capacity opt-in required');
 assert.ok(process.env.PTI_DURATION_HANDOFF,'A STOPPED dedicated production-engine handoff is required');
 const smoke=process.env.PTI_DURATION_SMOKE==='1',measurementMs=smoke?120000:REQUIRED_DURATION_MS;
 const runId=new Date().toISOString().replace(/[^0-9]/g,''),privateRoot=`H:/PTI-OnePiece/real-duration-qa/${runId}`;await mkdir(privateRoot,{recursive:true});
 const report={kind:smoke?'real-production-prepared-mp4-two-minute-smoke':'real-production-prepared-mp4-sixty-minute-capacity',startedAt:new Date().toISOString(),requiredWallClockMs:REQUIRED_DURATION_MS,smokeOnly:smoke,requestedWallClockMs:measurementMs,
  identity:'three distinct synthetic technical profiles and CPU video/audio decoders, not three physical family clients',
  scope:'production coordinator, prepared rendition/cache, scoped API HTTP, complete-MP4 decoding at real speed, real persisted progress; no accelerated clock',
  coldPreparationExcludedFromWarmMetrics:true,testOnlyStaticBinding:false,originalDownloadAttempts:0,newOriginalNetworkBytes:0,originalsAllowed:ALLOWED,
  physicalVideoRendered:false,heardJapanese:false,visualSubtitleTiming:false,actualCast:false,productionFirebaseAuth:false,cloudProgressTested:false,pwaInstalled:false,
  warmPreparedServingDoesNotProveThreeColdHevcEncodes:true,sessions:[],samples:[],events:[],http:{requests:[],totalBytes:0,requestLimit:MAX_HTTP_REQUESTS,byteLimit:MAX_HTTP_BYTES},cleanup:{}};
 const abort=new AbortController(),children=new Set(),aliases=new Map(),rows=[];
 let owned,media,api,progress,server,origin,measurementStart=null,measurementMono=null,finished=false;const pending=[];
 const elapsedMeasured=()=>measurementMono===null?null:performance.now()-measurementMono;
 const checkpoint=()=>atomicJson(EVIDENCE,report);
 const die=error=>{if(!report.error)report.error={code:safeCode(error),name:error.name};abort.abort(error);};
 const lifetime=setTimeout(()=>die(fail('duration-overall-time-limit')),75*60000);lifetime.unref();
 const onSignal=()=>die(fail('duration-interrupted'));process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
 const decoderPosition=row=>Math.min(row.descriptor.durationSeconds,Math.max(0,(row.decoder?.startPosition??0)+(row.decoder?.seconds??0)));
 const stopDecoder=async row=>{const decoder=row.decoder;if(!decoder)return;decoder.expectedStop=true;if(!decoder.closed){decoder.child.kill();await within(decoder.exited,10000);}row.decoder=null;};
 const sample=async()=>{
  const storage=await media.cache.usage(),disk=await statfs('H:/PTI-OnePiece');
  const gpu=await command('nvidia-smi',['--query-gpu=name,utilization.gpu,utilization.memory,memory.used,temperature.gpu,power.draw','--format=csv,noheader,nounits'],10000).catch(()=>null);
  const ps=`$durationIds=@(${[process.pid,owned.evidence.pid].join(',')}); @(Get-CimInstance Win32_Process|Where-Object{$durationIds -contains $_.ProcessId -or $durationIds -contains $_.ParentProcessId}|ForEach-Object{$durationP=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; [pscustomobject]@{pid=$_.ProcessId;parent=$_.ParentProcessId;name=$_.Name;cpuSeconds=$durationP.CPU;workingSetBytes=$durationP.WorkingSet64}})|ConvertTo-Json -Compress`;
  const processes=await command('pwsh',['-NoProfile','-Command',ps],15000).catch(()=>null);
  report.samples.push({at:new Date().toISOString(),elapsedMs:elapsedMeasured(),storage,
   diskFreeBytes:Number(disk.bavail)*Number(disk.bsize),nodeMemory:process.memoryUsage(),nodeCpu:process.cpuUsage(),systemFreeMemoryBytes:os.freemem(),
   gpuCsv:gpu?.code===0?gpu.out.trim().slice(0,1000):null,processes:processes?.code===0&&processes.out.trim()?JSON.parse(processes.out):null,
   activeDecoderChildren:children.size,activeSessions:media.sessions.size,activeContexts:[...media.sessions.values()].reduce((n,row)=>n+row.contexts.size,0),httpBytes:report.http.totalBytes});
  if(storage.usedBytes>20*1024**3)throw fail('cache-quota-exceeded');
 };
 async function persist(row,reason,position=decoderPosition(row)){
  const snapshot=await progress.snapshot(row.uid),lease=snapshot.lease;assert.equal(lease.sessionId,row.sessionId);
  const result=await progress.record(row.uid,row.sessionId,{episodeId:canonicalEpisodeId(row.episodeNumber),positionSeconds:position,reason,
   revision:lease.revision+1,generation:lease.generation,authorityEpoch:lease.authorityEpoch},{durationSeconds:row.descriptor.durationSeconds});
  await media.reportProgress(row.sessionId,{episodeNumber:row.episodeNumber,positionSeconds:result.progress.positionSeconds,isPaused:reason==='pause',playbackRate:1});
  const value=result.progress;row.evidence.lastPersisted={episodeId:value.episodeId,positionSeconds:value.positionSeconds,revision:value.revision,generation:value.generation,authorityEpoch:value.authorityEpoch};
  row.lastPersistedAt=Date.now();return value;
 }
 async function delivery(row){
  row.generation++;const delegated=await api.delegation({uid:row.uid},row.sessionId,'local');assert.equal(delegated.contentType,'video/mp4');
  // Exact loopback aliases keep scoped capabilities in RAM, out of FFmpeg arguments and logs.
  for(const[key,value]of aliases)if(value.index===row.index)aliases.delete(key);
  const url=new URL(delegated.mediaUrl);assert.equal(url.origin,origin);
  const alias=`/consumer/${row.index}/g${row.generation}/video.mp4`;aliases.set(alias,{target:url.pathname,index:row.index,episode:row.episodeNumber});row.mediaAlias=origin+alias;
  const caption=await fetch(delegated.subtitleUrl,{signal:AbortSignal.timeout(15000)});assert.equal(caption.status,200);
  const text=await boundedText(caption,4*1024*1024);assert.ok(text.startsWith('WEBVTT')&&text.includes('-->'));
  report.events.push({type:'full-english-resource',uid:row.uid,episode:row.episodeNumber,at:new Date().toISOString(),cueCount:(text.match(/-->/g)??[]).length,sha256:hash(text),
   selected:row.descriptor.selected,mode:row.descriptor.mode,contentType:delegated.contentType,durationSeconds:row.descriptor.durationSeconds});
 }
 async function startDecoder(row,position=0){
  assert.ok(!row.decoder);const began=Date.now(),child=spawn(`${BIN}/ffmpeg.exe`,['-nostdin','-hide_banner','-loglevel','error','-xerror','-stats_period','0.5','-re','-ss',String(position),
   '-threads','2','-i',row.mediaAlias,'-map','0:v:0','-map','0:a:0','-progress','pipe:1','-nostats','-f','null','-'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  children.add(child);const decoder={child,startPosition:position,seconds:0,frames:0,closed:false,expectedStop:false,code:null,lastAdvanceAt:began,began,progressBuffer:'',stderrBytes:0};row.decoder=decoder;
  decoder.exited=new Promise(resolve=>{child.once('error',()=>{decoder.closed=true;decoder.code=-1;children.delete(child);resolve();});child.once('close',code=>{decoder.closed=true;decoder.code=code;children.delete(child);resolve();});});
  child.stderr.on('data',chunk=>{decoder.stderrBytes+=chunk.length;}); // Raw stderr can contain ingress URLs: count only.
  child.stdout.on('data',chunk=>{
   decoder.progressBuffer+=String(chunk);if(decoder.progressBuffer.length>65536){die(fail('decoder-progress-size'));return;}
   let match;while((match=/progress=(?:continue|end)\r?\n/.exec(decoder.progressBuffer))){
    const end=match.index+match[0].length,block=decoder.progressBuffer.slice(0,end);decoder.progressBuffer=decoder.progressBuffer.slice(end);const value=parseDecoderProgress(block);if(!value)continue;
    if(value.frames<decoder.frames||value.seconds<decoder.seconds){die(fail('decoder-progress-regressed'));return;}
    const advanced=value.frames>decoder.frames&&value.seconds>decoder.seconds;
    row.evidence.decodedFrames+=value.frames-decoder.frames;row.evidence.decodedSeconds+=value.seconds-decoder.seconds;row.evidence.progressSamples++;
    decoder.frames=value.frames;decoder.seconds=value.seconds;
    if(advanced){if(decoder.firstAdvanceAt===undefined)decoder.firstAdvanceAt=Date.now();else row.evidence.maximumUnplannedAdvanceGapMs=Math.max(row.evidence.maximumUnplannedAdvanceGapMs,Date.now()-decoder.lastAdvanceAt);
     decoder.lastAdvanceAt=Date.now();if(measurementStart!==null)row.evidence.lastAdvanceElapsedMs=elapsedMeasured();}
   }
  });
  const deadline=Date.now()+20000;
  while(!decoder.closed&&decoder.firstAdvanceAt===undefined&&Date.now()<deadline&&!abort.signal.aborted)await sleep(50);
  if(decoder.firstAdvanceAt===undefined)throw fail('decoder-first-advance-failed');return decoder.firstAdvanceAt-began;
 }
 async function switchEpisode(row,next,{initial=false}={}){
  assert.ok(ALLOWED.includes(next));const began=Date.now(),from=row.episodeNumber,previous=media.sessions.get(row.sessionId),queued=previous?.queued,
   queuedKey=queued?.episodeNumber===next?queued.engineKey:null,leaseBefore=(await progress.snapshot(row.uid)).lease;
  row.descriptor=initial?await media.openSession({sessionId:row.sessionId,profileId:row.uid,episodeNumber:next,signal:abort.signal}):await media.switchEpisode(row.sessionId,next,{explicitSelection:!(from===1000&&next===1001),signal:abort.signal});
  assert.equal(row.descriptor.mode,'prepared-mp4');assert.equal(row.descriptor.contentType,'video/mp4');assert.equal(row.descriptor.selected.audioLanguage,'jpn');assert.equal(row.descriptor.selected.subtitleLanguage,'eng');
  row.episodeNumber=next;row.queued=false;await delivery(row);const leaseAfter=(await progress.snapshot(row.uid)).lease;
  const event={type:initial?'initial-preparation':from===1000&&next===1001?'natural-queued-transition':'manual-loop',uid:row.uid,from:initial?null:from,to:next,at:new Date().toISOString(),preparedMs:Date.now()-began,
   sameCoordinatorSession:media.sessions.get(row.sessionId).id===row.sessionId,sameProgressLease:leaseBefore.sessionId===leaseAfter.sessionId&&leaseBefore.generation===leaseAfter.generation&&leaseBefore.authorityEpoch===leaseAfter.authorityEpoch,
   exactQueuedContextAdopted:Boolean(queuedKey)&&media.sessions.get(row.sessionId).engineKey===queuedKey,decoderReachedEof:!initial&&row.eof===true};
  if(!initial&&from===1000&&next===1001)assert.ok(event.exactQueuedContextAdopted&&event.decoderReachedEof&&event.sameProgressLease);
  if(!initial)await persist(row,'transition',0);const decodeAt=Date.now();await startDecoder(row,0);
  event.firstAdvancingDecodeMs=Date.now()-began;event.decoderStartupMs=Date.now()-decodeAt;report.events.push(event);row.eof=false;
 }
 async function consumer(row){
  while(!abort.signal.aborted&&elapsedMeasured()<measurementMs){
   const elapsed=elapsedMeasured(),decoder=row.decoder;if(!decoder)throw fail('decoder-state-missing');
   if(decoder.closed){
    if(decoder.code!==0||decoder.frames<1||decoderPosition(row)<row.descriptor.durationSeconds-1){row.evidence.decoderErrors++;throw fail('decoder-unexpected-eof');}
    row.eof=true;await persist(row,'ended',row.descriptor.durationSeconds);await stopDecoder(row);await switchEpisode(row,row.episodeNumber===1?1000:row.episodeNumber===1000?1001:1);continue;
   }
   if(Date.now()-decoder.lastAdvanceAt>20000)throw fail('decoder-stalled');
   if(row.episodeNumber===1000&&row.descriptor.durationSeconds-decoderPosition(row)<45&&!row.queued){row.queued=true;const began=Date.now();await media.prepareNextPlayback(row.sessionId);assert.equal(media.preparedNext(row.sessionId).episodeNumber,1001);
    report.events.push({type:'prepare-real-next-1001',uid:row.uid,at:new Date().toISOString(),readyMs:Date.now()-began});}
   if(elapsed>=(smoke?[5000,10000,15000]:[300000,600000,960000])[row.index]&&!row.didSeek){
    row.didSeek=true;const from=decoderPosition(row),to=row.index===0?600:Math.max(0,from-120),began=Date.now();await stopDecoder(row);const saved=await persist(row,'seek',to);
    const fresh=new ProgressStore({root:path.join(privateRoot,'progress'),catalog:media.catalog}),disk=await fresh.snapshot(row.uid),event={type:'seek',uid:row.uid,episode:row.episodeNumber,at:new Date().toISOString(),fromSeconds:from,toSeconds:to,persistedRewind:disk.progress[saved.episodeId].positionSeconds===to&&to<from};
    await startDecoder(row,to);event.firstAdvancingDecodeMs=Date.now()-began;report.events.push(event);continue;
   }
   if(smoke&&row.index===1&&elapsed>=25000&&!row.smokeLateSeek){
    row.smokeLateSeek=true;await media.prepareNextPlayback(row.sessionId);row.queued=true;const from=decoderPosition(row),to=row.descriptor.durationSeconds-10,began=Date.now();
    await stopDecoder(row);await persist(row,'seek',to);await startDecoder(row,to);report.events.push({type:'seek',uid:row.uid,episode:row.episodeNumber,fromSeconds:from,toSeconds:to,firstAdvancingDecodeMs:Date.now()-began,smokeOnly:true});continue;
   }
   if(row.index===2&&elapsed>=(smoke?20000:900000)&&!row.didPause){
    row.didPause=true;const position=decoderPosition(row);await persist(row,'pause',position);await stopDecoder(row);const pausedAt=Date.now();await sleep(3000);
    const fresh=new ProgressStore({root:path.join(privateRoot,'progress'),catalog:media.catalog}),saved=(await fresh.snapshot(row.uid)).progress[canonicalEpisodeId(row.episodeNumber)];assert.equal(saved.positionSeconds,position);
    const began=Date.now();await startDecoder(row,saved.positionSeconds);await persist(row,'heartbeat');report.events.push({type:'pause-resume',uid:row.uid,episode:row.episodeNumber,at:new Date().toISOString(),pauseMs:began-pausedAt,persistedPositionReused:true,positionSeconds:position,firstAdvancingDecodeMs:Date.now()-began});continue;
   }
   if(Date.now()-row.lastPersistedAt>=5000){await persist(row,'heartbeat');row.evidence.samples.push({elapsedMs:elapsedMeasured(),episode:row.episodeNumber,positionSeconds:decoderPosition(row),frames:decoder.frames,decodedSeconds:decoder.seconds});}
   await sleep(200);
  }
 }
 try{
  const catalog=buildCatalog(await Promise.all(ARCHIVE_ITEMS.map(item=>readFile(new URL(`../../../../docs/one-piece/evidence/sources/${item}.json`,import.meta.url),'utf8').then(JSON.parse))));
  owned=await ownDurationEngine(process.env.PTI_DURATION_HANDOFF);report.engine=owned.evidence;
  media=createMediaCoordinator({catalog,cacheRoot:owned.handoff.cacheRoot,managedRoots:owned.handoff.managedRoots,extraAccountingRoots:[...(owned.handoff.extraAccountingRoots??[]),privateRoot],
   importRoots:[ORIGINAL_ROOT,...(owned.handoff.importRoots??[])],defaultMode:'prepared-mp4',verifiedModes:['compatible-h264','cast-h264','prepared-mp4'],autoPrefetch:false,monitorMs:1000,
   downloader:{async download(){report.originalDownloadAttempts++;throw fail('cached-original-required');}},
   jellyfin:{baseUrl:owned.handoff.baseUrl,tokenProvider:owned.tokenProvider,preparedEnabled:true,ffmpegPath:`${BIN}/ffmpeg.exe`,ffprobePath:`${BIN}/ffprobe.exe`},
   onEmergencyStop:async()=>{die(fail('media-storage-emergency'));for(const child of children)child.kill();}});
  const engineFetch=media.engine.fetchImpl.bind(media.engine);
  media.engine.fetchImpl=async(input,options)=>{const response=await engineFetch(input,options),url=new URL(input);
   if(/^\/Videos\/[a-f0-9-]+\/stream\.mp4$/i.test(url.pathname))report.events.push({type:'private-static-header-diagnostic',at:new Date().toISOString(),resourceDigest:hash(url.pathname+url.search).slice(0,16),
    method:options?.method??'GET',requestedRange:options?.headers?.Range??null,status:response.status,contentType:response.headers.get('content-type'),contentLength:response.headers.get('content-length'),contentRange:response.headers.get('content-range'),acceptRanges:response.headers.get('accept-ranges'),contentEncoding:response.headers.get('content-encoding')});
   return response;
  };
  await owned.ready(media.engine);report.initialization=await media.initialize({hardwareAcceleration:'nvenc'});
  for(const number of ALLOWED){const candidate=catalog.episodes.find(row=>row.episodeNumber===number).candidates.find(row=>row.role==='original'&&row.container==='mkv');
   const checkOwner=`duration-import-check-${number}`,rendition=await media.cache.findRendition(candidate,{audioLanguage:'jpn',owner:checkOwner});media.cache.releaseOwner(checkOwner);
   if(!rendition&&!await media.cache.readyEntry(candidate)){const entry=await media.cache.importVerified(candidate,path.join(ORIGINAL_ROOT,candidate.id,`${candidate.checksums.md5}.mkv`));report.events.push({type:'verified-existing-original-import',episode:number,bytes:entry.candidate.bytes,md5:entry.metrics.md5});}}
  report.preparationStorage=await media.cache.usage();assert.ok(report.preparationStorage.projectedBytes<=20*1024**3,'Complete media accounting exceeds the approved quota');
  const tickets=new TicketStore();progress=new ProgressStore({root:path.join(privateRoot,'progress'),catalog,onRevoke:async id=>{tickets.revokeSession(id);api?.revokeSession(id);await media.closeSession(id);}});
  api=new CompanionApi({media,progress,tickets,credentials:()=>({getAuthorized:async uid=>{assert.match(uid,/^technical-duration-[0-2]$/);return{uid};}}),config:{allowedOrigins:[],mediaOrigin:''}});
  server=http.createServer((req,res)=>{
   const binding=aliases.get(req.url),isScoped=req.url?.startsWith('/m/');if(!['GET','HEAD'].includes(req.method)||req.headers.origin||!binding&&!isScoped){res.writeHead(404);res.end();return;}
   if(report.http.requests.length>=MAX_HTTP_REQUESTS){res.writeHead(429);res.end();die(fail('duration-request-budget'));return;}
   const row={at:new Date().toISOString(),elapsedMs:elapsedMeasured(),consumer:binding?.index??null,episode:binding?.episode??null,kind:binding?'static-mp4':'scoped-resource',method:req.method,
    range:/^bytes=(?:\d+-\d*|-\d+)$/.test(req.headers.range??'')?req.headers.range:null,bytes:0,status:null,complete:false};report.http.requests.push(row);
   const write=res.write.bind(res),end=res.end.bind(res),count=chunk=>{const n=chunk?Buffer.byteLength(chunk):0;row.bytes+=n;report.http.totalBytes+=n;if(report.http.totalBytes>MAX_HTTP_BYTES){die(fail('duration-http-byte-budget'));res.destroy();return false;}return true;};
   res.write=(chunk,...args)=>count(chunk)?write(chunk,...args):false;res.end=(chunk,...args)=>count(chunk)?end(chunk,...args):res;
   res.once('finish',()=>{row.status=res.statusCode;row.complete=true;});res.once('close',()=>{row.status??=res.statusCode;row.consumerCancelled=!row.complete;});
   if(binding)req.url=binding.target;void api.mediaRequest(req,res);
  });server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;api.config.mediaOrigin=origin;report.loopbackMediaPort=server.address().port;
  for(const[index,episodeNumber]of ALLOWED.entries()){
   const uid=`technical-duration-${index}`,lease=await progress.claim({uid,deviceId:`duration-headless-${index}`,destination:'local'}),evidence={uid,sessionId:lease.sessionId,initialEpisode:episodeNumber,mode:'prepared-mp4',decodedFrames:0,decodedSeconds:0,progressSamples:0,decoderErrors:0,maximumUnplannedAdvanceGapMs:0,lastAdvanceElapsedMs:0,samples:[]};
   const row={uid,index,sessionId:lease.sessionId,episodeNumber,generation:0,lastPersistedAt:0,evidence};rows.push(row);report.sessions.push(evidence);
  }
  const preparations=rows.map(row=>switchEpisode(row,row.episodeNumber,{initial:true}).catch(error=>{report.events.push({type:'initial-preparation-failed',episode:row.episodeNumber,code:safeCode(error)});die(error);throw error;}));pending.push(...preparations);await Promise.all(preparations);
  measurementStart=Date.now();measurementMono=performance.now();report.measurementStartedAt=new Date(measurementStart).toISOString();report.measurementExpectedEndAt=new Date(measurementStart+measurementMs).toISOString();
  for(const row of rows){row.evidence.decodedFrames=0;row.evidence.decodedSeconds=0;row.evidence.progressSamples=0;row.evidence.maximumUnplannedAdvanceGapMs=0;await persist(row,'heartbeat');}
  await sample();await checkpoint();process.stdout.write(JSON.stringify({state:'three-production-prepared-decoders-advancing',measurementStartedAt:report.measurementStartedAt,expectedEndAt:report.measurementExpectedEndAt,requiredMinutes:measurementMs/60000,smokeOnly:smoke,evidence:'docs/one-piece/evidence/media-production-duration.json'})+'\n');
  let sampleDue=Date.now()+60000,checkpointDue=Date.now()+60000;
  const consumerTasks=rows.map(row=>consumer(row).catch(error=>{die(error);throw error;})),consumers=Promise.all(consumerTasks);pending.push(...consumerTasks);
  const watcher=(async()=>{while(!abort.signal.aborted&&!finished&&elapsedMeasured()<measurementMs){if(Date.now()>=sampleDue){await sample();sampleDue+=60000;}if(Date.now()>=checkpointDue){await checkpoint();checkpointDue+=60000;}await sleep(500);}})();
  pending.push(watcher);
  try{await within(Promise.all([consumers,watcher]),measurementMs+120000);}finally{finished=true;}
  if(abort.signal.aborted)throw abort.signal.reason??fail('duration-aborted');report.measuredWallClockMs=Date.now()-measurementStart;report.measuredMonotonicMs=elapsedMeasured();
  for(const row of rows){await persist(row,'pause');await stopDecoder(row);}
  const fresh=new ProgressStore({root:path.join(privateRoot,'progress'),catalog});
  for(const row of rows){const disk=await fresh.snapshot(row.uid),expected=row.evidence.lastPersisted,actual=disk.progress[expected.episodeId];row.evidence.durableResumeMatches=Boolean(actual)&&['positionSeconds','revision','generation','authorityEpoch'].every(key=>actual[key]===expected[key])&&actual.sessionId===row.sessionId;}
  assert.equal(new Set(rows.map(row=>row.sessionId)).size,3);assert.equal(media.sessions.size,3);await sample();
 }catch(error){die(error);process.exitCode=1;}
 finally{
  finished=true;abort.abort();clearTimeout(lifetime);process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);
  await Promise.allSettled(rows.map(stopDecoder));await Promise.allSettled(pending);report.cleanup.decoderChildrenStopped=children.size===0;
  api?.shutdown();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}report.cleanup.mediaListenerClosed=!server?.listening;
  try{await media?.shutdown();report.cleanup.coordinatorClosed=true;}catch{report.cleanup.coordinatorClosed=false;}
  try{if(owned)await owned.shutdown(media?.engine);report.cleanup.ownedEngineStopped=Boolean(owned?.evidence.cleanup.proof?.noOwnedProcess);}catch(error){report.cleanup.ownedEngineStopped=false;report.cleanup.engineError=safeCode(error);process.exitCode=1;}
  report.completedAt=new Date().toISOString();Object.assign(report,assessDurationReport(report));report.sixtyMinuteHeadlessCapacityPassed&&=Object.values(report.cleanup).every(value=>value===true);
  if(smoke)report.twoMinuteSmokePassed=!report.error&&report.measuredWallClockMs>=measurementMs&&report.measuredMonotonicMs>=measurementMs&&report.sessions.length===3&&report.sessions.every(row=>row.decodedFrames>1000&&row.durableResumeMatches)&&report.checks.queuedCrossSourceAdoption&&Object.values(report.cleanup).every(value=>value===true);
  if(!(smoke?report.twoMinuteSmokePassed:report.sixtyMinuteHeadlessCapacityPassed))process.exitCode=1;
  await checkpoint();process.stdout.write(JSON.stringify({evidence:'docs/one-piece/evidence/media-production-duration.json',passed:smoke?report.twoMinuteSmokePassed:report.sixtyMinuteHeadlessCapacityPassed,smokeOnly:smoke,warmRecoveryTargetPassed:report.warmRecoveryTargetPassed,measuredWallClockMs:report.measuredWallClockMs??0,error:report.error??null,checks:report.checks,cleanup:report.cleanup})+'\n');
 }
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.env.PTI_RUN_REAL_DURATION==='1')await runDurationCheck();
 else process.stdout.write('Real 60-minute prepared-MP4 capacity test skipped; explicit PTI_RUN_REAL_DURATION=1 and stopped private PTI_DURATION_HANDOFF required. No media accessed.\n');
}
