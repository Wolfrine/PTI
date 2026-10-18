/** Explicit, cached-only hardware QA. Synthetic identity adapters are confined to this harness. */
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CompanionApi} from '../src/api.mjs';
import {CastBridge,CastPythonTransport} from '../src/cast.mjs';
import {ProgressStore} from '../src/progress.mjs';
import {TicketStore,decodeResource} from '../src/tickets.mjs';
import {createMediaCoordinator} from '../src/media/index.mjs';
import {ARCHIVE_ITEMS,buildCatalog} from '../src/sources/archive.mjs';
import {loadRuntimeConfig} from '../src/runtime/config.mjs';
import {command} from './media-real.mjs';
import {createPreparedPilot} from './prepared-pilot.mjs';
import {createProductionPreparedPilot} from './production-prepared-pilot.mjs';

const PILOT='H:/PTI-OnePiece/pilot/jellyfin',ROOT='H:/PTI-OnePiece/production-media';
const CONFIG='H:/PTI-OnePiece/runtime/private/config.json';
const ADDRESS='192.168.68.105',CONTROL_PORT=18100,MEDIA_PORT=18099;
const UID='technical-real-cast-viewer',ORIGIN='https://pti-app-2ab59.web.app';
const productionPreparedMode=process.env.PTI_CAST_PRODUCTION_PREPARED==='1';
const historicalPreparedMode=process.env.PTI_CAST_PREPARED_MP4==='1';
const preparedMode=productionPreparedMode||historicalPreparedMode;
const preparedObserveOnly=process.env.PTI_CAST_MP4_OBSERVE_ONLY==='1';
const evidencePath=productionPreparedMode?`docs/one-piece/evidence/cast-media-compat/cast-production-prepared${preparedObserveOnly?'-observations':''}.json`:preparedObserveOnly?'docs/one-piece/evidence/cast-media-compat/cast-prepared-mp4-observations.json':preparedMode?'docs/one-piece/evidence/cast-media-compat/cast-prepared-mp4.json':'docs/one-piece/evidence/cast-production-adapter.json';
const evidenceUrl=new URL(`../../../../${evidencePath}`,import.meta.url);
const safeCode=error=>/^[a-zA-Z0-9_-]{1,100}$/.test(error?.code??'')?error.code:'hardware-test-failed';
const listen=(server,port,host)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
const closeServer=server=>!server?.listening?Promise.resolve():new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function isAdvancingSeekPlayback(state,episodeId,targetSeconds){
 const advanced=(state?.positionSeconds??NaN)-targetSeconds;
 return state?.owned===true&&state.episodeId===episodeId&&state.state==='PLAYING'&&advanced>.15&&advanced<10;
}

export function classifyCastResource(resource,preparedStatic){
 return/\.m3u8(?:\?|$)/i.test(resource)?'hls-playlist':/\.vtt(?:\?|$)/i.test(resource)?'webvtt':preparedStatic&&/\.mp4(?:\?|$)/i.test(resource)?'video-file':/\.(ts|mp4|m4s)(?:\?|$)/i.test(resource)?'video-segment':'other';
}

export function validateProductionRawProofs(proofs,{observationOnly=false}={}){
 assert.ok(proofs.length>=10);assert.ok(proofs.every(row=>row.exactOwnedFreshProof===true&&row.rawVersion>0&&row.listenerRawVersion===row.rawVersion&&row.platformVersion>0&&row.rawAgeMs>=0&&row.rawAgeMs<=1000&&row.platformAgeMs>=0&&row.platformAgeMs<=1000));
 for(const episode of ['one-piece-1000','one-piece-1001']){
  assert.ok(proofs.some(row=>row.episodeId===episode&&row.state==='PLAYING'));
  if(!observationOnly)assert.ok(proofs.some(row=>row.episodeId===episode&&row.command==='seek'));
 }
 return{ownedResponses:proofs.length,strictRawAndPlatformProofs:true,uniqueRawVersions:new Set(proofs.map(row=>row.rawVersion)).size,proofBoundMs:1000};
}

export function copy2Counterfactual(input,options,sourceId){
 const url=new URL(input);
 if(url.origin!=='http://127.0.0.1:18096'||options?.method!=='POST'||!/^\/Items\/[0-9a-f-]{32,36}\/PlaybackInfo$/i.test(url.pathname))return{options,applied:false};
 assert.equal(typeof options.body,'string');assert.ok(options.body.length<=65536);
 const body=JSON.parse(options.body);
 if(body.MediaSourceId!==sourceId||body.DeviceProfile?.Name!=='PTI cast-h264')return{options,applied:false};
 assert.equal(body.AllowVideoStreamCopy,false,'Counterfactual must start with the unmodified forced-video policy');
 return{options:{...options,body:JSON.stringify({...body,AllowVideoStreamCopy:true})},applied:true};
}

async function mediaCommandProof(catalog,started){
 const root=`${PILOT}/logs`,result=[];let readBytes=0;
 const md5=new Map([1000,1001].map(number=>[number,catalog.episodes[number-1].candidates.find(candidate=>candidate.role==='original').checksums.md5]));
 const names=(await readdir(root)).filter(name=>/^FFmpeg\.(?:Remux|Transcode)-.*\.log$/.test(name));
 const recent=(await Promise.all(names.map(async name=>({name,info:await stat(path.join(root,name))})))).filter(row=>row.info.mtimeMs>=started&&row.info.size<=2*1024**2).sort((a,b)=>b.info.mtimeMs-a.info.mtimeMs).slice(0,40);
 for(const row of recent){if(readBytes+row.info.size>8*1024**2)break;readBytes+=row.info.size;const text=await readFile(path.join(root,row.name),'utf8');
  const episode=[...md5].find(([,value])=>text.toLowerCase().includes(`${value.toLowerCase()}.mkv`))?.[0];if(!episode)continue;
  const videoCodec=text.match(/-codec:v(?::0)?\s+(\S+)/)?.[1],hlsSeconds=Number(text.match(/-hls_time\s+([0-9.]+)/)?.[1]);
  if(['copy','h264_nvenc','libx264'].includes(videoCodec)&&Number.isFinite(hlsSeconds))result.push({episodeId:`one-piece-${episode}`,logHash:createHash('sha256').update(row.name).digest('hex').slice(0,16),videoCodec,hlsSeconds});
 }return result;
}

export function validateTimingEvidence(report){
 const required=['initialize-cached-engine','temporary-mdns','discover-without-takeover','prepare-full-episode-1000',report.preparedStatic?'load-real-static-mp4-and-webvtt':'load-real-hls-and-webvtt',
  'source1-cast-profile-baseline-6s','source1-warm-forward-seek-900','source1-warm-backward-seek-600','admit-real-cast-profile-next-queue',
  'source1-real-late-seek-before-natural-end','exact-natural-1000-to-1001-new-profile','source2-real-warm-seek-600',
  'source2-real-late-seek-to-selected-track-end','source2-natural-true-end-without-phantom-tail','position-preserving-return-and-revoked-ticket','real-receiver-resource-graph'];
 if(report.preparedStatic)required.push(report.productionMediaModules?'PRODUCTION-SOURCE1-STABILITY-WINDOW-30S':'MP4-SOURCE1-HUMAN-WINDOW-30S','mp4-source1-pause-play-captions-volume','mp4-repeated-source1-forward-900','mp4-repeated-source1-back-600',report.productionMediaModules?'PRODUCTION-SOURCE2-STABILITY-WINDOW-30S':'MP4-SOURCE2-HUMAN-WINDOW-30S');
 if(report.productionMediaModules)required.push('production-sender-control-gap-and-reconnect','production-fresh-raw-receipt-proof');
 for(const name of required)assert.equal(report.steps.filter(step=>step.name===name&&step.ok===true).length,1,`Required timing stage must pass exactly once: ${name}`);
 const natural=report.steps.find(step=>step.name==='exact-natural-1000-to-1001-new-profile').value;
 assert.equal(natural.sameLease,true);assert.equal(natural.sameAuthorityEpoch,true);assert.equal(natural.cast?.episodeId,'one-piece-1001');assert.equal(natural.cast?.state,'PLAYING');
 assert.equal(natural.method,'natural end after actual late seek; no next or manual episode command');
 if(report.productionMediaModules){assert.equal(natural.productionQueueAdopted,true);assert.equal(report.steps.find(step=>step.name==='production-fresh-raw-receipt-proof').value.strictRawAndPlatformProofs,true);}
 assert.equal(report.seekMetrics?.length,5,'All five real seek measurements are required');
 for(const metric of report.seekMetrics){assert.ok(Number.isInteger(metric.recoveryMs)&&metric.recoveryMs>0);assert.equal(metric.withinFiveSecondTarget,metric.recoveryMs<=5000);assert.ok(isAdvancingSeekPlayback(metric.state,metric.episodeId,metric.targetSeconds),'A seek acknowledgment at the exact target is not decoded playback recovery');}
 const seekSteps=['source1-warm-forward-seek-900','source1-warm-backward-seek-600','source1-real-late-seek-before-natural-end','source2-real-warm-seek-600','source2-real-late-seek-to-selected-track-end'];
 for(const [index,name]of seekSteps.entries())assert.deepEqual(report.seekMetrics[index],report.steps.find(step=>step.name===name).value,`Measurement must match its completed hardware stage: ${name}`);
 assert.equal(report.seekMetrics.filter(metric=>metric.episodeId==='one-piece-1000').length,3);
 assert.equal(report.seekMetrics.filter(metric=>metric.episodeId==='one-piece-1001').length,2);
 if(report.preparedStatic){assert.equal(report.extraSeekMetrics?.length,2);for(const metric of report.extraSeekMetrics)assert.ok(isAdvancingSeekPlayback(metric.state,metric.episodeId,metric.targetSeconds));}
 return{requiredSteps:required,allRequiredStepsPassed:true,naturalTransitionProved:true,seekMeasurements:5,extraSeekMeasurements:report.extraSeekMetrics?.length??0,fiveSecondSeekTargetMet:[...report.seekMetrics,...(report.extraSeekMetrics??[])].every(metric=>metric.withinFiveSecondTarget)};
}

export async function runRealCast(){
 if(process.env.PTI_RUN_REAL_CAST!=='1')throw new Error('Explicit hardware opt-in is required');
 assert.ok(!(productionPreparedMode&&historicalPreparedMode),'Choose production prepared mode or the historical exact-file helper, never both');
 const config=await loadRuntimeConfig(CONFIG);
 const focusSource2=process.env.PTI_CAST_FOCUS_SOURCE2==='1',focusQueue=process.env.PTI_CAST_FOCUS_QUEUE==='1',focusTiming=process.env.PTI_CAST_FOCUS_TIMING==='1',observeSource2=process.env.PTI_CAST_OBSERVE_SOURCE2==='1',initialNumber=focusSource2?1001:1000,initialEpisodeId=`one-piece-${initialNumber}`;
 const copy2Trial=process.env.PTI_CAST_COPY2_1000==='1';assert.ok(!copy2Trial||focusTiming,'The1000-only copy counterfactual requires the full timing/natural-transition experiment');
 assert.ok(!preparedMode||focusTiming&&!copy2Trial,'Prepared MP4 requires the timing experiment and cannot use an HLS override');
 assert.ok(!preparedObserveOnly||preparedMode,'The observation-only replay requires the exact prepared MP4 binding');
 assert.ok([focusSource2,focusQueue,focusTiming].filter(Boolean).length<=1,'Choose one focused hardware experiment');
 assert.ok(!observeSource2||focusSource2,'Source2 observation requires the focused source2 mode');
 assert.equal(path.resolve(process.execPath).toLowerCase(),path.resolve(config.nodeExecutable).toLowerCase(),'Use the exact runtime Node executable covered by the firewall rule');
 const started=Date.now(),workMs=preparedMode?480000:360000,deadline=started+workMs,controller=new AbortController();
 const runId=new Date(started).toISOString().replace(/[^0-9]/g,'');
 const privateRoot=`H:/PTI-OnePiece/real-cast-qa/${runId}`;await mkdir(privateRoot,{recursive:true});
 const report={kind:productionPreparedMode?'production-prepared-coordinator-real-cast':preparedMode?'prepared-static-mp4-real-cast':'production-adapter-real-hls-cast',preparedStatic:preparedMode,productionMediaModules:productionPreparedMode,testOnlyStaticBinding:historicalPreparedMode,startedAt:new Date(started).toISOString(),
  identity:'synthetic technical identities in this standalone harness only; production Firebase authentication is NOT verified',
  engine:productionPreparedMode?'separately owned real production prepared coordinator/engine from stopped handoff':preparedMode?'owned isolated prepared Jellyfin 127.0.0.1:18106':'isolated existing Jellyfin 127.0.0.1:18096',originalsAllowed:preparedMode?[1000,1001]:[1,1000,1001],newNetworkDownloads:0,
  mediaTransport:'approved LAN HTTP episode-scoped capabilities, mDNS preferred',controlTransport:'loopback technical fixture; production HTTPS/PWA not verified',
  humanVisualVerification:false,humanJapaneseAudioVerification:false,subtitleTimingVisuallyVerified:false,
  wholeEpisodeViewing:false,phoneSleepVerified:false,threeStreamSixtyMinutes:false,focus:preparedObserveOnly?'prepared-static-mp4-observations-only-no-seek-performance-claim':preparedMode?'prepared-static-mp4-timing-controls-natural-transition':focusSource2?'source2-only-autoplay-disabled':focusQueue?'queue-identity-reliability-only':focusTiming?'cast-h264-timing-and-natural-transition':'cross-source-queue',steps:[],requests:[],states:[],diagnostics:[],phaseEvents:[],workerEvents:[],rpc:[],cleanup:{}};
 let api,cast,media,progress,controlServer,mediaServer,mdns,sessionId,originalEngineFetch,queuedProductionContext,cleaning=false;
 const proxySecret=randomBytes(32).toString('base64url');
 const guard=()=>{if(cleaning||Date.now()>=deadline||controller.signal.aborted)throw Object.assign(new Error('QA deadline'),{code:'test-deadline'});};
 const checkpoint=async()=>writeFile(evidenceUrl,JSON.stringify(report,null,2));
 const step=async(name,action)=>{guard();const began=performance.now();process.stdout.write(JSON.stringify({step:name,state:'starting'})+'\n');
  try{const value=await action();report.steps.push({name,ok:true,elapsedMs:Math.round(performance.now()-began),value});await checkpoint();return value;}
  catch(error){report.steps.push({name,ok:false,elapsedMs:Math.round(performance.now()-began),code:safeCode(error)});throw error;}};
 const request=async(route,{method='GET',input}={})=>{guard();const response=await fetch(`http://127.0.0.1:${CONTROL_PORT}${route}`,{method,
  headers:{Origin:ORIGIN,'X-OnePiece-Proxy':proxySecret,'X-Forwarded-Proto':'https',Authorization:'Bearer technical-fixture-only',...(input?{'Content-Type':'application/json'}:{})},
  body:input?JSON.stringify(input):undefined,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
  const value=await response.json();if(!response.ok)throw Object.assign(new Error('Technical control request failed'),{code:value.error??'control-request-failed'});return value;};
 const waitFor=async(check,timeoutMs=30000)=>{const until=Math.min(deadline,Date.now()+timeoutMs);while(Date.now()<until){guard();const result=await check();if(result)return result;await sleep(500);}throw Object.assign(new Error('Receiver condition not observed'),{code:'receiver-condition-timeout'});};
 const commandCast=async(action,value)=>request(`/api/sessions/${sessionId}/cast-command`,{method:'POST',input:{receiverId:report.receiver.receiverId,action,...(value!==undefined?{value}:{})}});
 const stopEncoders=async()=>{const result=await command('pwsh',['-NoProfile','-File',fileURLToPath(new URL('../pilot/jellyfin/stop.ps1',import.meta.url)),'-EncodersOnly'],20000);if(result.code)throw Object.assign(new Error('Engine cancellation not confirmed'),{code:'pilot-encoder-cleanup-failed'});};
 const logMedia=(req,res)=>{
  const match=/^\/m\/([A-Za-z0-9_-]{32})\/(one-piece-\d{4})\/([A-Za-z0-9_-]+)$/.exec(req.url??'');
  let resource='';try{if(match)resource=decodeResource(match[3]);}catch{}
  const record={atMs:Date.now()-started,method:req.method,episodeId:match?.[2]??null,
   resourceKind:classifyCastResource(resource,preparedMode),
   resourceHash:resource?createHash('sha256').update(resource).digest('hex').slice(0,16):null,
   receiverRequest:req.socket.remoteAddress!==ADDRESS,range:/^bytes=\d+-\d*$/.test(req.headers.range??'')?req.headers.range:null,bytes:0,status:null};
  if(report.requests.length>=1000){res.writeHead(429);res.end();return false;}
  report.requests.push(record);const write=res.write.bind(res),end=res.end.bind(res);
  const count=chunk=>{if(chunk)record.bytes+=Buffer.byteLength(chunk);if(productionPreparedMode){report.httpTransferredBytes=(report.httpTransferredBytes??0)+(chunk?Buffer.byteLength(chunk):0);if(report.httpTransferredBytes>12*1024**3){report.httpBudgetExceeded=true;controller.abort();res.destroy();return false;}}return true;};
  res.write=(chunk,...args)=>count(chunk)?write(chunk,...args):false;
  res.end=(chunk,...args)=>count(chunk)?end(chunk,...args):res;
  res.on('finish',()=>{record.status=res.statusCode;record.completedAtMs=Date.now()-started;});
  res.on('close',()=>{record.status??=res.statusCode;record.closed=true;});return true;
 };
 const timer=setTimeout(()=>controller.abort(),workMs);timer.unref();
 try{
  const catalog=buildCatalog(await Promise.all(ARCHIVE_ITEMS.map(item=>readFile(new URL(`../../../../docs/one-piece/evidence/sources/${item}.json`,import.meta.url),'utf8').then(JSON.parse))));
  media=productionPreparedMode?await createProductionPreparedPilot({catalog,privateRoot}):preparedMode?await createPreparedPilot({startOwnedEngine:true}):createMediaCoordinator({catalog,cacheRoot:`${ROOT}/cache`,managedRoots:{transcodes:`${ROOT}/transcodes`,subtitles:`${PILOT}/data-v2/data/subtitles`},
   extraAccountingRoots:[ROOT,`${PILOT}/cache`,privateRoot],autoPrefetch:false,monitorMs:1000,
   downloader:{async download(){throw Object.assign(new Error('This harness forbids upstream downloads'),{code:'cached-original-required'});}},
   jellyfin:{baseUrl:'http://127.0.0.1:18096',allowOtherLibrariesForPilot:true,ffprobePath:`${PILOT}/runtime/jellyfin/ffprobe.exe`,tokenProvider:async()=>JSON.parse(await readFile(`${PILOT}/private/state.json`,'utf8')).token},onEmergencyStop:stopEncoders});
  await step('initialize-cached-engine',()=>media.initialize({hardwareAcceleration:'nvenc'}).then(value=>({version:value.engine?.version??null})));
  const tickets=new TicketStore();
  progress=new ProgressStore({root:path.join(privateRoot,'progress'),catalog,onRevoke:async id=>{tickets.revokeSession(id);api?.revokeSession(id);await cast?.revokeSession(id);await media.closeSession(id);},
   onAuthorityChange:async id=>{tickets.revokeSession(id);api?.revokeSession(id);media.cancelStreams?.(id);await cast?.revokeSession(id);}});
  // Harness-only observation retains the production Worker and private IPC. Never emit exception messages or locals.
  const diagnosticPython=`import sys,json,traceback,os,runpy,hashlib,base64,re\nfrom urllib.parse import urlsplit\nworker_path=sys.argv.pop(1)\nnamespace=runpy.run_path(worker_path,run_name='cast_diagnostic')\nWorker=namespace['Worker']\noriginal=Worker.execute\noriginal_state=Worker.state\nowned_seen={}\ndef state_observed(self,receiver_id,cast,binding):\n result=original_state(self,receiver_id,cast,binding)\n if owned_seen.get(receiver_id) and not result['owned']:\n  content=cast.media_controller.status.content_id or ''\n  parsed=urlsplit(content)\n  match=re.fullmatch(r'/m/[A-Za-z0-9_-]{32}/(one-piece-\\d{4})/([A-Za-z0-9_-]+)',parsed.path)\n  resource_hash=None\n  if match:\n   try:resource_hash=hashlib.sha256(base64.urlsafe_b64decode(match[2]+'='*(-len(match[2])%4))).hexdigest()[:16]\n   except Exception:pass\n  print(json.dumps({'qaDiagnostic':True,'event':'ownership-lost','appId':cast.status.app_id if cast.status else None,'receiverSessionDigest':hashlib.sha256(str(cast.status.session_id if cast.status else None).encode()).hexdigest(),'expectedSessionDigest':hashlib.sha256(str(binding.get('receiverSession') if binding else None).encode()).hexdigest(),'contentDigest':hashlib.sha256(content.encode()).hexdigest(),'resourceHash':resource_hash,'episodeId':match[1] if match else None,'state':cast.media_controller.status.player_state,'mediaSessionId':cast.media_controller.status.media_session_id}),file=sys.stderr,flush=True)\n owned_seen[receiver_id]=result['owned']\n return result\ndef observed(self,command,data):\n try:\n  return original(self,command,data)\n except Exception as error:\n  frames=traceback.extract_tb(error.__traceback__)\n  print(json.dumps({'qaDiagnostic':True,'command':command,'errorType':type(error).__name__,'frames':[{'file':os.path.basename(f.filename),'line':f.lineno,'function':f.name} for f in frames]}),file=sys.stderr,flush=True)\n  raise\nWorker.execute=observed\nWorker.state=state_observed\nnamespace['main']()\n`;
  const phasePython=String.raw`
import time
def emit_phase(self,name,began=None,**extra):
 if getattr(self,'_qa_command',None) not in ('seek','load','queue'):return
 now=time.time_ns()/1000000
 print(json.dumps({'qaDiagnostic':True,'event':'phase','phase':name,'command':self._qa_command,'atEpochMs':now,**({'elapsedMs':round(now-began,3)} if began is not None else {}),**extra}),file=sys.stderr,flush=True)
phase_execute_original=Worker.execute
def phase_execute(self,command,data):
 self._qa_command=command
 try:
  result=phase_execute_original(self,command,data)
  receiver_id=data.get('receiverId');cast=self.devices.get(receiver_id);binding=self.bindings.get(receiver_id)
  if isinstance(result,dict) and result.get('owned') and cast and binding:
   raw=self.raw_media.get(receiver_id,{});receipt=self.media_receipts.get(receiver_id,{});platform=self.platform_receipts.get(receiver_id,{})
   now=time.monotonic()
   print(json.dumps({'qaDiagnostic':True,'event':'raw-proof','command':command,'episodeId':result.get('episodeId'),'state':result.get('state'),'atEpochMs':time.time_ns()/1000000,
    'rawVersion':raw.get('version',0),'listenerRawVersion':receipt.get('rawVersion',0),'platformVersion':platform.get('version',0),
    'rawAgeMs':round((now-raw.get('receivedAt',0))*1000,3),'platformAgeMs':round((now-platform.get('receivedAt',0))*1000,3),
    'exactOwnedFreshProof':self.recent_admitted(cast,binding)}),file=sys.stderr,flush=True)
  return result
 finally:self._qa_command=None
Worker.execute=phase_execute
phase_observe_original=Worker.observe_media
def phase_observe(self,receiver_id,cast):
 phase_observe_original(self,receiver_id,cast)
 original_seek=cast.media_controller.seek
 def seek(*args,**kwargs):
  began=time.time_ns()/1000000;emit_phase(self,'seek-send-start')
  try:return original_seek(*args,**kwargs)
  finally:emit_phase(self,'seek-send-return',began)
 cast.media_controller.seek=seek
Worker.observe_media=phase_observe
phase_recent_original=Worker.recent_admitted
def phase_recent(self,cast,binding):
 value=phase_recent_original(self,cast,binding);self._qa_recent=value;return value
Worker.recent_admitted=phase_recent
phase_admitted_original=Worker.admitted
def phase_admitted(self,*args,**kwargs):
 began=time.time_ns()/1000000;self._qa_recent=False
 try:return phase_admitted_original(self,*args,**kwargs)
 finally:emit_phase(self,'command-admission-return',began,reusedFreshRaw=self._qa_recent)
Worker.admitted=phase_admitted
phase_refresh_original=Worker.refresh
def phase_refresh(self,*args,**kwargs):
 began=time.time_ns()/1000000
 try:return phase_refresh_original(self,*args,**kwargs)
 finally:emit_phase(self,'fresh-refresh-return',began)
Worker.refresh=phase_refresh
`;
  const phasedPython=diagnosticPython.replace("namespace['main']()\n",`${phasePython}\nnamespace['main']()\n`);
  const transport=new CastPythonTransport({pythonExecutable:config.pythonExecutable,toolsPath:config.mdns.toolsPath,mediaOrigins:[config.castMediaOrigin],allowHttpMedia:true,
   spawnImpl:(program,args,options)=>{const child=spawn(program,['-c',phasedPython,...args],options);report.workerEvents.push({event:'start',atMs:Date.now()-started,pid:child.pid});child.on('exit',(code,signal)=>report.workerEvents.push({event:'exit',atMs:Date.now()-started,pid:child.pid,code,signal}));let buffer='';child.stderr.on('data',chunk=>{buffer+=String(chunk);if(buffer.length>32768)buffer='';let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{const value=JSON.parse(line);if(value.qaDiagnostic===true&&value.event==='phase'&&report.phaseEvents.length<1000)report.phaseEvents.push({...value,atMs:Math.round(value.atEpochMs-started)});else if(value.qaDiagnostic===true&&value.event==='raw-proof'){if((report.rawProofs??=[]).length<1500)report.rawProofs.push(value);}else if(value.qaDiagnostic===true&&report.diagnostics.length<30)report.diagnostics.push(value);}catch{}}});return child;}});
  const originalRequest=transport.request.bind(transport);transport.request=async(command,payload)=>{const began=performance.now(),row={command,atMs:Date.now()-started,pid:transport.child?.pid??null};report.rpc.push(row);try{const result=await originalRequest(command,payload);row.ok=true;return result;}catch(error){row.ok=false;row.code=safeCode(error);throw error;}finally{row.elapsedMs=Math.round(performance.now()-began);}};
  cast=new CastBridge({progressStore:progress,tickets,transport,mediaOrigins:[config.castMediaOrigin],allowHttpMedia:true,pollMs:1000,
   onState:async(context,state)=>{if(report.states.length<500)report.states.push({atMs:Date.now()-started,...state});if(state.episodeId==='one-piece-1001')api.autoplay.set(context.sessionId,false);await api.receiverState(context,state);},
   onEpisodeChanged:(context,id)=>api.receiverEpisode(context,id)});
  const originalLoad=cast.load.bind(cast);cast.load=async input=>{try{return await originalLoad(input);}catch(error){report.diagnostics.push({stage:'node-load',errorType:error.name,code:safeCode(error),frames:String(error.stack??'').split('\n').slice(1).map(line=>line.match(/([^/\\():]+\.mjs):(\d+):(\d+)/)).filter(Boolean).map(match=>({file:match[1],line:Number(match[2]),column:Number(match[3])}))});throw error;}};
  const originalSafeState=cast.safeState.bind(cast);cast.safeState=(state,binding)=>{try{return originalSafeState(state,binding);}catch(error){report.diagnostics.push({stage:'node-state-rejection',code:safeCode(error),raw:Object.fromEntries(['receiverId','owned','state','episodeId','mediaUid','positionSeconds','durationSeconds','subtitleEnabled','idleReason'].map(key=>[key,state?.[key]])),knownMedia:[...binding.episodes].map(([uid,value])=>({uid,episodeId:value.episodeId})),expectedReceiverId:binding.receiverId});throw error;}};
  api=new CompanionApi({identity:{verify:async token=>{assert.equal(token,'technical-fixture-only');return{uid:UID};}},binding:{ownerUid:'technical-fixture-owner'},family:()=>({requireMember:async actor=>actor}),
   credentials:()=>({getAuthorized:async uid=>{assert.equal(uid,UID);return{uid,token:'fixture-only-not-google'};}}),cloud:()=>null,media,progress,tickets,cast,
   config:{proxySecret,allowedOrigins:[ORIGIN],mediaOrigin:config.castMediaOrigin,castMediaOrigin:config.castMediaOrigin,allowHttpMedia:true}});
  controlServer=http.createServer((req,res)=>api.control(req,res));
  mediaServer=http.createServer((req,res)=>{const remote=req.socket.remoteAddress?.replace('::ffff:','');if(!/^192\.168\.68\.(?:[1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4])$/.test(remote??'')){res.writeHead(403);res.end();return;}if(logMedia(req,res))void api.mediaRequest(req,res,{httpMedia:true});});
  for(const server of [controlServer,mediaServer]){server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=40;}
  await listen(controlServer,CONTROL_PORT,'127.0.0.1');await listen(mediaServer,MEDIA_PORT,ADDRESS);
  await step('temporary-mdns',async()=>{
   mdns=spawn(config.pythonExecutable,[fileURLToPath(new URL('../src/runtime/mdns.py',import.meta.url)),'--config',CONFIG],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
   let ready=false,failed=false;mdns.on('error',()=>{failed=true;});mdns.stdout.on('data',data=>{if(String(data).includes('"event": "ready"'))ready=true;});mdns.stderr.on('data',()=>{});mdns.stdin.on('error',()=>{});
   await waitFor(()=>{if(failed)throw Object.assign(new Error('mDNS failed'),{code:'temporary-mdns-failed'});return ready;},15000);return{hostname:'onepiece.local',address:ADDRESS};
  });
  const devices=await step('discover-without-takeover',()=>request('/api/cast/devices').then(value=>value.devices));
  const receiver=devices.find(value=>value.model==='BRAVIA VU31'&&value.name==='Bedroom TV');
  if(!receiver)throw Object.assign(new Error('Expected receiver unavailable'),{code:'sony-not-discovered'});
  report.receiver=receiver;
  if(receiver.busy){report.skipped='Expected TV is already in use; no takeover or load was attempted';return report;}
  const created=await step(`prepare-full-episode-${initialNumber}`,async()=>{
   const result=await request('/api/sessions',{method:'POST',input:{episodeId:initialEpisodeId,deviceId:'technical-cast-test'}});sessionId=result.lease.sessionId;
   const ready=await waitFor(async()=>{const value=await request(`/api/sessions/${sessionId}`);if(value.state==='error')throw Object.assign(new Error('Preparation failed'),{code:value.error?.code});return value.state==='ready'?value:false;},90000);
   return{sessionId,selected:ready.playback.selected,durationSeconds:ready.playback.durationSeconds,mode:ready.playback.mode};
  });
  assert.ok(created.durationSeconds>1200,'Use the full episode HLS presentation, not a short clip');
  if(copy2Trial){
   const sourceId=media.snapshot(sessionId).playback.mediaSourceId;assert.match(sourceId,/^[a-f0-9-]{32,36}$/i);
   report.counterfactual={kind:'1000-only-video-copy-TS2s',harnessOnly:true,productionPolicyChanged:false,episode1001Forced:true,changedPlaybackRequests:0};
   originalEngineFetch=media.engine.fetchImpl;
   media.engine.fetchImpl=async(input,options)=>{const planned=copy2Counterfactual(input,options,sourceId);if(planned.applied)report.counterfactual.changedPlaybackRequests++;return originalEngineFetch(input,planned.options);};
  }
  await step(preparedMode?'load-real-static-mp4-and-webvtt':'load-real-hls-and-webvtt',async()=>{
   const result=await request(`/api/sessions/${sessionId}/cast`,{method:'POST',input:{receiverId:receiver.receiverId,positionSeconds:focusSource2&&!observeSource2?0:600,autoplay:!focusSource2&&!focusQueue&&!focusTiming,takeover:false}});
   assert.equal(result.cast.episodeId,initialEpisodeId);assert.equal(result.cast.owned,true);
   const descriptor=media.snapshot(sessionId).playback;report.castPresentation={mode:descriptor.mode,durationSeconds:descriptor.durationSeconds,containerDurationSeconds:descriptor.containerDurationSeconds,timing:descriptor.timing,selected:descriptor.selected};
   assert.equal(descriptor.mode,preparedMode?'prepared-mp4':'cast-h264');return result.cast;
  });
  let naturalFailure=null;
  if(preparedObserveOnly){
   const observe=async number=>{
    await sleep(3000);
    const value=await waitFor(async()=>{const state=await request(`/api/sessions/${sessionId}`);return isAdvancingSeekPlayback(state.cast,`one-piece-${number}`,600)?state.cast:false;},30000);
    const beganAt=new Date().toISOString(),beganMs=Date.now()-started,expectedEndAt=new Date(Date.now()+120000).toISOString();
    process.stdout.write(JSON.stringify({observation:`MP4_SOURCE${number===1000?1:2}_PLAYING_600_OBSERVE120S_NOW`,at:beganAt,expectedEndAt,state:value})+'\n');
    await sleep(120000);const after=(await request(`/api/sessions/${sessionId}`)).cast,endedAt=new Date().toISOString();
    assert.equal(after?.owned,true);assert.equal(after.state,'PLAYING');assert.equal(after.episodeId,`one-piece-${number}`);assert.ok(after.positionSeconds-value.positionSeconds>100);
    const samples=report.states.filter(row=>row.atMs>=beganMs),result={beganAt,expectedEndAt,endedAt,observationWindowSeconds:120,noPlaybackCommandsDuringWindow:true,before:value,after,
     telemetrySamples:samples.length,nonPlayingSamples:samples.filter(row=>row.state!=='PLAYING').length,humanConfirmation:'parent must separately record an explicit reply during THIS episode window; unanswered or late replies are not inferred'};
    process.stdout.write(JSON.stringify({observation:`MP4_SOURCE${number===1000?1:2}_OBSERVE120S_COMPLETE`,at:endedAt,state:after})+'\n');return result;
   };
   await step('MP4-SOURCE1-OBSERVATION-120S',()=>observe(1000));
   await step('explicit-source2-selection-for-observation-NOT-natural-proof',async()=>{
    await request(`/api/sessions/${sessionId}/episode`,{method:'POST',input:{episodeId:'one-piece-1001',positionSeconds:600}});
    return waitFor(async()=>{const state=await request(`/api/sessions/${sessionId}`);return isAdvancingSeekPlayback(state.cast,'one-piece-1001',600)?state.cast:false;},45000);
   });
   await step('MP4-SOURCE2-OBSERVATION-120S',()=>observe(1001));
  }
  if(!focusSource2&&!focusQueue&&!focusTiming){
  await step('SOURCE1-PLAYING600-HUMAN-HOLD-40S',async()=>{
   const value=await request(`/api/sessions/${sessionId}`);assert.equal(value.cast?.state,'PLAYING');assert.equal(value.cast?.episodeId,'one-piece-1000');
   process.stdout.write(JSON.stringify({observation:'SOURCE1_PLAYING_600_NOW',at:new Date().toISOString(),state:value.cast})+'\n');
   await sleep(40000);const after=await request(`/api/sessions/${sessionId}`);assert.equal(after.cast?.owned,true);assert.equal(after.cast?.state,'PLAYING');
   return{observationWindowSeconds:40,telemetry:value.cast,after:after.cast,humanConfirmation:'parent must record any owner reply separately'};
  });
  await step('source1-pause-play-subtitles-off-on',async()=>{
   const paused=(await commandCast('pause')).cast;
   const disabled=await request(`/api/sessions/${sessionId}/renew`,{method:'POST',input:{autoplay:false}});
   assert.equal(disabled.autoplay,false);assert.equal(disabled.cast.state,'PAUSED');assert.equal(disabled.cast.subtitleEnabled,paused.subtitleEnabled);
   assert.ok(Math.abs(disabled.cast.positionSeconds-paused.positionSeconds)<5);assert.ok(Math.abs(disabled.cast.volume-paused.volume)<0.03);
   assert.equal(api.queueRecords.has(sessionId),false);
   const enabled=await request(`/api/sessions/${sessionId}/renew`,{method:'POST',input:{autoplay:true}});assert.equal(enabled.autoplay,true);
   const states=[{action:'pause',state:paused},{action:'autoplay-off-reload',state:disabled.cast},{action:'autoplay-on',state:enabled.cast}];
   for(const [action,value]of [['play'],['subtitles',false],['subtitles',true]])states.push({action,value,state:(await commandCast(action,value)).cast});return states;
  });
  await step('prepare-actual-next-queue',async()=>{await api.ensureQueue({uid:UID,...(await progress.snapshot(UID)).lease,receiverId:receiver.receiverId});const descriptor=media.preparedNext(sessionId);assert.equal(descriptor.episodeId,'one-piece-1001');return{episodeId:descriptor.episodeId,selected:descriptor.selected,durationSeconds:descriptor.durationSeconds};});
  try{await step('natural-1000-to-1001',async()=>{
   const before=(await progress.snapshot(UID)).lease;
   await commandCast('seek',created.durationSeconds-12);
   const state=await waitFor(async()=>{const value=await request(`/api/sessions/${sessionId}`);return value.cast?.episodeId==='one-piece-1001'&&value.cast.state==='PLAYING'?value:false;},50000);
   const after=(await progress.snapshot(UID)).lease;assert.equal(after.sessionId,before.sessionId);assert.equal(after.authorityEpoch,before.authorityEpoch);
   return{method:'seek to 12 seconds before natural end; no next command',leasePreserved:true,authorityEpochPreserved:true,cast:state.cast,selected:state.playback.selected};
  });}catch(error){
   naturalFailure=safeCode(error);report.naturalTransitionFailure={code:naturalFailure,manualFallbackIsNotTransitionProof:true};
   await step('explicit-source2-fallback-NOT-natural-transition-proof',async()=>{
    await request(`/api/sessions/${sessionId}/episode`,{method:'POST',input:{episodeId:'one-piece-1001',positionSeconds:0}});
    const state=await waitFor(async()=>{const value=await request(`/api/sessions/${sessionId}`);if(value.error)throw Object.assign(new Error('Manual source2 preparation failed'),{code:value.error.code});return value.cast?.owned&&value.cast?.episodeId==='one-piece-1001'&&value.cast.state==='PLAYING'?value:false;},45000);
    return{method:'explicit manual episode selection; same PC lease, new Cast authority',cast:state.cast,selected:state.playback.selected};
   });
  }
  }
  if(focusTiming&&!preparedObserveOnly){
   const seeks=[];report.seekMetrics=seeks;
   const seekPlaying=async(episodeId,target,{extra=false}={})=>{
    const began=performance.now();await commandCast('seek',target);
    const state=await waitFor(async()=>{const value=await request(`/api/sessions/${sessionId}`);return isAdvancingSeekPlayback(value.cast,episodeId,target)?value.cast:false;},15000);
    const recoveryMs=Math.round(performance.now()-began),result={episodeId,targetSeconds:target,recoveryMs,withinFiveSecondTarget:recoveryMs<=5000,readiness:'authoritative PLAYING with position advanced more than0.15s after target',state};if(extra)(report.extraSeekMetrics??=[]).push(result);else seeks.push(result);return result;
   };
   await step('source1-cast-profile-baseline-6s',async()=>{await sleep(6000);const value=await request(`/api/sessions/${sessionId}`);assert.equal(value.cast?.owned,true);assert.equal(value.cast?.state,'PLAYING');return value.cast;});
   if(preparedMode){
    await step(productionPreparedMode?'PRODUCTION-SOURCE1-STABILITY-WINDOW-30S':'MP4-SOURCE1-HUMAN-WINDOW-30S',async()=>{const value=await request(`/api/sessions/${sessionId}`);assert.ok(isAdvancingSeekPlayback(value.cast,'one-piece-1000',600));process.stdout.write(JSON.stringify({observation:productionPreparedMode?'PRODUCTION_SOURCE1_PLAYING_600_STABILITY_NOW':'MP4_SOURCE1_PLAYING_600_NOW',at:new Date().toISOString(),state:value.cast})+'\n');await sleep(30000);const after=(await request(`/api/sessions/${sessionId}`)).cast;assert.equal(after?.owned,true);assert.equal(after.state,'PLAYING');assert.equal(after.episodeId,'one-piece-1000');return{before:value.cast,after,humanConfirmation:productionPreparedMode?'No new human reply inferred; prior same-asset Japanese/English observations require the separate exact video/caption lineage audit':'parent must obtain a new explicit Japanese/English observation for this MP4; earlier HLS proof is separate'};});
    await step('mp4-source1-pause-play-captions-volume',async()=>{const states=[];for(const[action,value]of[['pause'],['play'],['subtitles',false],['subtitles',true]])states.push({action,value,state:(await commandCast(action,value)).cast});const prior=states.at(-1).state.volume,target=Math.max(.05,prior-.05);states.push({action:'volume',state:(await commandCast('volume',target)).cast});states.push({action:'restore-volume',state:(await commandCast('volume',prior)).cast});return states;});
   }
   if(productionPreparedMode)await step('production-sender-control-gap-and-reconnect',async()=>{
    const before=await request(`/api/sessions/${sessionId}`),leaseBefore=(await progress.snapshot(UID)).lease,beganAt=new Date().toISOString();
    // Stop all sender control HTTP for 15s. The PC worker/receiver remain active; this is not physical phone sleep.
    await sleep(15000);const after=await request(`/api/sessions/${sessionId}`),snapshot=await progress.snapshot(UID),leaseAfter=snapshot.lease;
    assert.equal(after.sessionId,sessionId);assert.equal(after.cast?.owned,true);assert.equal(after.cast.state,'PLAYING');assert.equal(after.cast.episodeId,before.cast.episodeId);
    assert.ok(after.cast.positionSeconds-before.cast.positionSeconds>10);assert.equal(after.cast.subtitleEnabled,before.cast.subtitleEnabled);
    for(const key of ['sessionId','generation','authorityEpoch'])assert.equal(leaseAfter[key],leaseBefore[key]);
    const saved=snapshot.progress[after.cast.episodeId];assert.ok(saved&&Math.abs(saved.positionSeconds-after.cast.positionSeconds)<5);
    return{beganAt,endedAt:new Date().toISOString(),gapSeconds:15,before:before.cast,after:after.cast,sameLease:true,receiverProgressPersisted:true,
     scope:'technical sender control-HTTP gap/reconnect; continuous PC Cast worker; no physical phone/background/sleep claim'};
   });
   await step('source1-warm-forward-seek-900',()=>seekPlaying('one-piece-1000',900));
   await step('source1-warm-backward-seek-600',()=>seekPlaying('one-piece-1000',600));
   if(preparedMode){await step('mp4-repeated-source1-forward-900',()=>seekPlaying('one-piece-1000',900,{extra:true}));await step('mp4-repeated-source1-back-600',()=>seekPlaying('one-piece-1000',600,{extra:true}));}
   await step('admit-real-cast-profile-next-queue',async()=>{
    await request(`/api/sessions/${sessionId}/renew`,{method:'POST',input:{autoplay:true}});
    await api.ensureQueue({uid:UID,...(await progress.snapshot(UID)).lease,receiverId:receiver.receiverId});
    const descriptor=media.preparedNext(sessionId);assert.equal(descriptor.episodeId,'one-piece-1001');assert.equal(descriptor.mode,preparedMode?'prepared-mp4':'cast-h264');assert.ok(Math.abs(descriptor.durationSeconds-1419.04)<.05);
    if(productionPreparedMode){queuedProductionContext=media.sessions.get(sessionId)?.queued?.engineKey;assert.ok(queuedProductionContext);}
    await sleep(6000);const state=await request(`/api/sessions/${sessionId}`);assert.equal(state.cast?.owned,true);assert.equal(state.cast.episodeId,'one-piece-1000');
    return{queuedEpisodeId:cast.bindings.get(receiver.receiverId)?.queuedEpisodeId,mode:descriptor.mode,durationSeconds:descriptor.durationSeconds,containerDurationSeconds:descriptor.containerDurationSeconds,selected:descriptor.selected,state:state.cast};
   });
   const source1Duration=media.snapshot(sessionId).playback.durationSeconds;
   await step('source1-real-late-seek-before-natural-end',()=>seekPlaying('one-piece-1000',source1Duration-12));
   await step('exact-natural-1000-to-1001-new-profile',async()=>{
    const before=(await progress.snapshot(UID)).lease;
    const value=await waitFor(async()=>{const state=await request(`/api/sessions/${sessionId}`);return state.cast?.owned&&state.cast.episodeId==='one-piece-1001'&&state.cast.state==='PLAYING'?state:false;},60000);
    const after=(await progress.snapshot(UID)).lease,descriptor=media.snapshot(sessionId).playback;
    assert.equal(after.sessionId,before.sessionId);assert.equal(after.authorityEpoch,before.authorityEpoch);assert.equal(descriptor.mode,preparedMode?'prepared-mp4':'cast-h264');assert.ok(Math.abs(descriptor.durationSeconds-1419.04)<.05);assert.equal(value.cast.subtitleEnabled,true);
    const productionQueueAdopted=productionPreparedMode?Boolean(queuedProductionContext)&&media.sessions.get(sessionId)?.engineKey===queuedProductionContext:null;
    if(productionPreparedMode)assert.equal(productionQueueAdopted,true,'Real production coordinator must adopt the exact prepared queued context');
    return{method:'natural end after actual late seek; no next or manual episode command',sameLease:true,sameAuthorityEpoch:true,productionQueueAdopted,cast:value.cast,durationSeconds:descriptor.durationSeconds,containerDurationSeconds:descriptor.containerDurationSeconds,selected:descriptor.selected};
   });
   await step('source2-real-warm-seek-600',()=>seekPlaying('one-piece-1001',600));
   if(preparedMode)await step(productionPreparedMode?'PRODUCTION-SOURCE2-STABILITY-WINDOW-30S':'MP4-SOURCE2-HUMAN-WINDOW-30S',async()=>{const value=await request(`/api/sessions/${sessionId}`);assert.ok(isAdvancingSeekPlayback(value.cast,'one-piece-1001',600));process.stdout.write(JSON.stringify({observation:productionPreparedMode?'PRODUCTION_SOURCE2_PLAYING_600_STABILITY_NOW':'MP4_SOURCE2_PLAYING_600_NOW',at:new Date().toISOString(),state:value.cast})+'\n');await sleep(30000);const after=(await request(`/api/sessions/${sessionId}`)).cast;assert.equal(after?.owned,true);assert.equal(after.state,'PLAYING');assert.equal(after.episodeId,'one-piece-1001');return{before:value.cast,after,humanConfirmation:productionPreparedMode?'No new human reply inferred; prior same-asset Japanese/English observations require the separate exact video/caption lineage audit':'parent must record a new explicit MP4 Japanese/English reply after actual playback'};});
   const source2Duration=media.snapshot(sessionId).playback.durationSeconds;
   await step('source2-real-late-seek-to-selected-track-end',()=>seekPlaying('one-piece-1001',source2Duration-10));
   await step('source2-natural-true-end-without-phantom-tail',async()=>{
    const value=await waitFor(async()=>{const state=await request(`/api/sessions/${sessionId}`);return state.cast?.owned&&state.cast.episodeId==='one-piece-1001'&&state.cast.state==='IDLE'&&state.cast.idleReason==='FINISHED'?state:false;},30000);
    return{cast:value.cast,expectedDurationSeconds:source2Duration,phantomContainerTailSeconds:media.snapshot(sessionId).playback.containerDurationSeconds-source2Duration};
   });
   report.seekMetrics=seeks;report.seekTargetMet=[...seeks,...report.extraSeekMetrics??[]].every(value=>value.withinFiveSecondTarget);
   if(!report.seekTargetMet){report.error={code:'five-second-seek-target-missed',name:'PerformanceTargetFailure'};process.exitCode=1;}
  }
  if(focusQueue){
   await step('baseline-with-autoplay-off-10s',async()=>{await sleep(10000);const state=await request(`/api/sessions/${sessionId}`);assert.equal(state.cast?.owned,true);assert.equal(state.cast?.state,'PLAYING');return state.cast;});
   await step('enable-real-next-queue-and-monitor-20s',async()=>{
    await request(`/api/sessions/${sessionId}/renew`,{method:'POST',input:{autoplay:true}});
    await api.ensureQueue({uid:UID,...(await progress.snapshot(UID)).lease,receiverId:receiver.receiverId});
    const samples=[],until=Date.now()+20000;
    while(Date.now()<until){const state=await request(`/api/sessions/${sessionId}`);samples.push({at:new Date().toISOString(),cast:state.cast});assert.equal(state.cast?.owned,true);assert.equal(state.cast?.episodeId,'one-piece-1000');await sleep(500);}
    return{samples,queuedEpisodeId:cast.bindings.get(receiver.receiverId)?.queuedEpisodeId};
   });
  }
  if(!focusQueue&&!focusTiming){
  if(observeSource2){
   await step('SOURCE2-PLAYING600-HUMAN-OBSERVE60S',async()=>{
    const value=await request(`/api/sessions/${sessionId}`);assert.equal(value.cast?.owned,true);assert.equal(value.cast?.episodeId,'one-piece-1001');assert.equal(value.cast?.state,'PLAYING');
    const beganAt=new Date().toISOString();process.stdout.write(JSON.stringify({observation:'SOURCE2_PLAYING_600_OBSERVATION60S_NOW',at:beganAt,state:value.cast})+'\n');
    await sleep(60000);const after=await request(`/api/sessions/${sessionId}`);assert.equal(after.cast?.owned,true);assert.equal(after.cast?.state,'PLAYING');
    return{beganAt,observationWindowSeconds:60,before:value.cast,after:after.cast,noPlaybackCommandsDuringWindow:true,humanConfirmation:'parent must record the owner reply after this start; prior missed question was not confirmation'};
   });
  }else{
  await step('source2-seek-600-and-controls',async()=>{
   const seekBegan=performance.now();await commandCast('seek',600);
   const playing=await waitFor(async()=>{const value=await request(`/api/sessions/${sessionId}`);return value.cast?.owned&&value.cast?.episodeId==='one-piece-1001'&&value.cast.state==='PLAYING'&&Math.abs(value.cast.positionSeconds-600)<15?value.cast:false;},15000);
   const seekRecoveryMs=Math.round(performance.now()-seekBegan),states=[{action:'seek',state:playing,seekRecoveryMs,withinFiveSecondTarget:seekRecoveryMs<=5000}];
   process.stdout.write(JSON.stringify({observation:'SOURCE2_PLAYING_600_NOW',at:new Date().toISOString(),state:playing,seekRecoveryMs})+'\n');
   await sleep(process.env.PTI_CAST_FOCUS_FAST==='1'?3000:30000);
   for(const [action,value]of [['pause'],['play'],['subtitles',false],['subtitles',true]])states.push({action,value,state:(await commandCast(action,value)).cast});return states;
  });
  }
  }
  if(!observeSource2){
  await step('position-preserving-return-and-revoked-ticket',async()=>{
   const delivery=await api.delegation({uid:UID},sessionId,'cast');
   const before=await cast.status({uid:UID,...(await progress.snapshot(UID)).lease,receiverId:receiver.receiverId});
   const returned=await request(`/api/sessions/${sessionId}/disconnect`,{method:'POST',input:{receiverId:receiver.receiverId}});
   report.returnEvidence={before,returned};
   assert.equal(returned.episodeId,focusQueue?'one-piece-1000':'one-piece-1001');assert.ok(Math.abs(returned.positionSeconds-before.positionSeconds)<5);assert.equal(returned.lease.destination,'local');
   const old=new URL(delivery.mediaUrl);old.hostname=ADDRESS;const denied=await fetch(old,{signal:AbortSignal.timeout(5000)});await denied.body?.cancel();assert.equal(denied.status,404);
   return{episodeId:returned.episodeId,positionSeconds:returned.positionSeconds,destination:returned.lease.destination,oldTicketStatus:denied.status};
  });
  }
  await step('real-receiver-resource-graph',async()=>{
   const graph={};for(const number of focusSource2?[1001]:focusQueue?[1000]:[1000,1001]){const id=`one-piece-${number}`,rows=report.requests.filter(row=>row.episodeId===id&&row.receiverRequest&&[200,206].includes(row.status));
    const kinds=preparedMode?['video-file','webvtt']:['hls-playlist','video-segment','webvtt'],counts=Object.fromEntries(kinds.map(kind=>[kind,rows.filter(row=>row.resourceKind===kind).length]));
    for(const kind of kinds)assert.ok(counts[kind]>0,`Receiver must actually fetch ${kind} for ${id}`);graph[id]=counts;
   }return graph;
  });
  if(productionPreparedMode)await step('production-fresh-raw-receipt-proof',async()=>{
   return validateProductionRawProofs(report.rawProofs??[],{observationOnly:preparedObserveOnly});
  });
  report.storage=await media.cache.usage();
  if(!preparedMode)report.mediaCommandProof=await mediaCommandProof(catalog,started);
  if(copy2Trial){assert.ok(report.counterfactual.changedPlaybackRequests>0);assert.ok(report.mediaCommandProof.some(row=>row.episodeId==='one-piece-1000'&&row.videoCodec==='copy'&&row.hlsSeconds===2),'Actual1000 FFmpeg must copy video into two-second HLS');assert.ok(report.mediaCommandProof.some(row=>row.episodeId==='one-piece-1001'&&row.videoCodec==='h264_nvenc'&&row.hlsSeconds===2),'Actual1001 must remain forced H.264 with two-second HLS');}
  if(focusTiming&&!preparedObserveOnly)report.focusedAcceptance=validateTimingEvidence(report);
  if(preparedObserveOnly){for(const name of ['MP4-SOURCE1-OBSERVATION-120S','explicit-source2-selection-for-observation-NOT-natural-proof','MP4-SOURCE2-OBSERVATION-120S','position-preserving-return-and-revoked-ticket','real-receiver-resource-graph'])assert.equal(report.steps.filter(step=>step.name===name&&step.ok).length,1);report.observationAcceptance={bothTimedWindowsCompleted:true,naturalTransitionProvedByThisRun:false,seekPerformanceProvedByThisRun:false,humanConfirmationStillSeparate:true};}
  if(naturalFailure){report.error={code:naturalFailure,name:'NaturalTransitionFailure'};process.exitCode=1;}
 }catch(error){report.error={code:safeCode(error),name:error.name};process.exitCode=1;}
 finally{
  cleaning=true;clearTimeout(timer);controller.abort();
  if(originalEngineFetch)media.engine.fetchImpl=originalEngineFetch;
  try{await cast?.close();report.cleanup.castClosed=true;}catch{report.cleanup.castClosed=false;}
  await Promise.allSettled([closeServer(controlServer),closeServer(mediaServer)]);report.cleanup.listenersClosed=![controlServer,mediaServer].some(server=>server?.listening);
  try{await media?.shutdown();if(!preparedMode)await stopEncoders();report.cleanup[preparedMode?'preparedEngineStopped':'pilotEncodersStopped']=true;}catch{report.cleanup[preparedMode?'preparedEngineStopped':'pilotEncodersStopped']=false;}
  if(preparedMode)report[productionPreparedMode?'productionPrepared':'preparedPilot']=media?.evidence;
  if(mdns){mdns.stdin.write('stop\n');const ended=await Promise.race([once(mdns,'exit').then(()=>true),sleep(5000).then(()=>false)]);if(!ended)mdns.kill();report.cleanup.temporaryMdnsStopped=ended;}
  report.completedAt=new Date().toISOString();report.elapsedMs=Date.now()-started;
  report.outcome=report.skipped?'skipped':report.error?'failed':Object.values(report.cleanup).every(value=>value===true)?'passed':'cleanup-incomplete';
  report.requestSummary={requests:report.requests.length,bytes:report.requests.reduce((sum,row)=>sum+row.bytes,0),
   receiverRequests:report.requests.filter(row=>row.receiverRequest).length,
   episodes:Object.fromEntries([1000,1001].map(number=>{const id=`one-piece-${number}`,rows=report.requests.filter(row=>row.episodeId===id&&row.receiverRequest);return[id,{playlists:rows.filter(row=>row.resourceKind==='hls-playlist'&&row.status===200).length,segments:rows.filter(row=>row.resourceKind==='video-segment'&&[200,206].includes(row.status)).length,videoFiles:rows.filter(row=>row.resourceKind==='video-file'&&[200,206].includes(row.status)).length,subtitles:rows.filter(row=>row.resourceKind==='webvtt'&&row.status===200).length}];}))};
  await checkpoint();process.stdout.write(JSON.stringify({evidence:evidencePath,error:report.error??null,skipped:report.skipped??null,requestSummary:report.requestSummary,cleanup:report.cleanup})+'\n');
 }
 return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.env.PTI_RUN_REAL_CAST==='1')await runRealCast();
 else console.log('Real Cast QA skipped. Explicit PTI_RUN_REAL_CAST=1 and parent runtime/firewall GO are required; no listener or TV access occurred.');
}
