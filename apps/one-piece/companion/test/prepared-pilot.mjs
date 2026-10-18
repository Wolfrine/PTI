/** Test-only exact two-item binding to the preserved, isolated Jellyfin MP4 pilot.
 * It is deliberately not a production media engine or an arbitrary proxy.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile,lstat,open} from 'node:fs/promises';
import {createServer} from 'node:net';
import {JellyfinClient} from '../src/media/jellyfin.mjs';
import {scanFiles} from '../src/media/cache.mjs';
import {loadRuntimeSecret} from '../src/runtime/config.mjs';
import {command} from './media-real.mjs';

const HANDOFF=new URL('../../../../docs/one-piece/evidence/cast-media-compat/prepared-mp4-handoff.json',import.meta.url);
const BASE='http://127.0.0.1:18106',ROOT='H:/PTI-OnePiece/production-media',PILOT='H:/PTI-OnePiece/pilot/jellyfin';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=value=>createHash('sha256').update(value).digest('hex');
const ps=value=>"'"+String(value).replaceAll("'","''")+"'";
const fail=code=>Object.assign(new Error('Prepared pilot request failed'),{code});
const inside=(child,parent)=>{const rel=path.relative(path.resolve(parent),path.resolve(child));return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);};

export function staticInterval(range,total){
 assert.ok(Number.isSafeInteger(total)&&total>0&&total<=2*1024**3,'Exact prepared file cap is two GiB');
 if(!range)return{start:0,end:total-1,length:total,status:200};
 const match=/^bytes=(\d*)-(\d*)$/.exec(range);assert.ok(match&&(match[1]||match[2]),'One byte range required');
 const start=match[1]?Number(match[1]):Math.max(0,total-Number(match[2]));
 const end=match[1]&&match[2]?Math.min(total-1,Number(match[2])):total-1;
 assert.ok(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<=end&&start<total,'Unsatisfiable range');
 return{start,end,length:end-start+1,status:206};
}

export function cueRows(text){
 assert.ok(Buffer.byteLength(text)<1024**2&&text.replace(/^\uFEFF/,'').startsWith('WEBVTT'));
 const rows=[];
 for(const block of text.replace(/\r/g,'').split(/\n\s*\n/)){
  const lines=block.split('\n'),index=lines.findIndex(line=>line.includes('-->'));if(index<0)continue;
  const match=/^((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/.exec(lines[index]);assert.ok(match);
  const seconds=value=>value.split(':').reduce((sum,part)=>sum*60+Number(part),0);
  rows.push({start:seconds(match[1]),end:seconds(match[2]),text:lines.slice(index+1).join('\n').trim()});
 }assert.ok(rows.length>0&&rows.length<5000);return rows;
}

export function preparedTracks(source){
 const streams=source.MediaStreams??[],audio=streams.filter(value=>value.Type==='Audio'),captions=streams.filter(value=>value.Type==='Subtitle'&&['en','eng'].includes(String(value.Language).toLowerCase())&&value.IsExternal===true);
 assert.equal(audio.length,1);assert.ok(['ja','jpn','jap'].includes(String(audio[0].Language).toLowerCase()));assert.equal(captions.length,1);
 return{audio:audio[0],caption:captions[0]};
}

export function validateStaticResponse(response,expected,total){
 assert.equal(response.status,expected.status);assert.equal(Number(response.headers.get('content-length')),expected.length);assert.equal(response.headers.get('accept-ranges'),'bytes');assert.match(response.headers.get('content-type')??'',/^video\/mp4(?:;|$)/i);
 if(expected.status===206)assert.equal(response.headers.get('content-range'),`bytes ${expected.start}-${expected.end}/${total}`);
 assert.ok(!response.headers.get('content-encoding')||response.headers.get('content-encoding')==='identity');assert.ok(response.body);
}

async function limited(response,max){
 const parts=[];let bytes=0;
 try{for await(const part of response.body??[]){bytes+=part.length;if(bytes>max)throw fail('prepared-response-budget');parts.push(part);}}
 finally{await response.body?.cancel().catch(()=>{});}return Buffer.concat(parts);
}
async function readAt(file,start,length){const handle=await open(file,'r');try{const bytes=Buffer.alloc(length);assert.equal((await handle.read(bytes,0,length,start)).bytesRead,length);return bytes;}finally{await handle.close();}}

export async function createPreparedPilot({startOwnedEngine=false}={}){
 const handoff=JSON.parse(await readFile(HANDOFF,'utf8'));
 assert.equal(handoff.kind,'private-prepared-mp4-isolated-jellyfin-handoff');assert.equal(handoff.port,18106);
 assert.deepEqual(handoff.episodes.map(row=>row.episode),[1000,1001]);
 assert.ok(inside(handoff.runtimeRoot,`${ROOT}/prepared-mp4-pilot`)&&inside(handoff.protectedResumeConfigPath,handoff.runtimeRoot));
 assert.equal(path.resolve(handoff.executable).toLowerCase(),path.resolve(`${PILOT}/runtime/jellyfin/jellyfin.exe`).toLowerCase());
 const rows=new Map(handoff.episodes.map(row=>[row.episode,row])),sessions=new Map(),assets=new Map(),active=new Set();
 const evidence={kind:'test-only-two-prepared-items',newOriginalDownloads:0,productionStaticTransport:false,startedAt:null,
  handoffEvidence:handoff.evidence,assetRunId:handoff.assetRunId,episodes:[],preflightRanges:[],requests:[],cleanup:{}};
 let child,exitPromise,token,engine,closed=false,transferred=0,requests=0,pending=0;
 const requestCap=160,byteCap=8*1024**3;
 const media={evidence,
  cache:{async usage(){const files=await scanFiles(ROOT),bytes=files.reduce((sum,file)=>sum+file.bytes,0);assert.ok(bytes<=20*1024**3);return{usedBytes:bytes,projectedBytes:bytes,limitBytes:20*1024**3,scope:'entire production-media including preserved pilot copies; separate runtime roots are not a production quota proof'};}},
  snapshot(id){const session=sessions.get(id);return session?{sessionId:id,state:'ready',episodeNumber:session.number,playback:session.descriptor,next:session.number===1000?{episodeNumber:1001}:null}:null;},
  async openSession({sessionId,episodeNumber}){assert.ok(!sessions.has(sessionId));const descriptor=descriptorFor(episodeNumber,sessionId);sessions.set(sessionId,{number:episodeNumber,descriptor,allowed:new Set([episodeNumber]),next:null});return descriptor;},
  async switchEpisode(id,number,options={}){const session=requireSession(id);assert.ok([1000,1001].includes(number));if(options.audioLanguage)assert.ok(['ja','jpn'].includes(options.audioLanguage));session.allowed.add(number);session.number=number;session.descriptor=descriptorFor(number,id);session.next=null;return session.descriptor;},
  async prepareNextPlayback(id){const session=requireSession(id);assert.equal(session.number,1000);session.allowed.add(1001);session.next=descriptorFor(1001,id);return session.next;},
  preparedNext(id){return requireSession(id).next;},
  async reportProgress(){},
  cancelStreams(id){for(const record of active)if(record.sessionId===id)record.abort();},
  async closeSession(id){media.cancelStreams(id);sessions.delete(id);},
  async getPlaybackResource(id,resource,{range,signal}={}){
   const session=requireSession(id),asset=assets.get(resource);if(!asset||!session.allowed.has(asset.number))throw fail('prepared-resource-denied');
   if(asset.kind==='caption')return{status:200,headers:{'content-type':'text/vtt; charset=utf-8','content-length':String(asset.bytes.length),'accept-ranges':'none'},body:new Blob([asset.bytes]).stream(),resources:[]};
   return videoResponse(id,asset.row,range,signal);
  },
  async initialize(){
   evidence.startedAt=new Date().toISOString();assert.ok(!closed);
   if(startOwnedEngine){
    assert.ok(process.env.PTI_RUN_REAL_CAST==='1'||process.env.PTI_RUN_REAL_BROWSER==='1','Explicit real-hardware/browser opt-in required');
    const cfg=JSON.parse(await readFile(handoff.protectedResumeConfigPath,'utf8'));assert.equal(path.resolve(cfg.runtimeRoot),path.resolve(handoff.runtimeRoot));
    token=await loadRuntimeSecret(cfg,'jellyfinToken');assert.ok(token&&token.length<4096);
    const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(18106,'127.0.0.1',resolve);});await new Promise(resolve=>probe.close(resolve));
    const output=createWriteStream(path.join(handoff.runtimeRoot,'logs',`cast-resume-${Date.now()}.log`),{flags:'wx'});
    child=spawn(handoff.executable,handoff.args,{windowsHide:true,shell:false,cwd:path.dirname(handoff.executable),stdio:['ignore','pipe','pipe']});child.stdout.pipe(output);child.stderr.pipe(output,{end:false});
    exitPromise=new Promise(resolve=>{child.once('error',()=>resolve({spawnFailed:true}));child.once('close',(code,signal)=>{output.end();resolve({code,signal});});});
   }else throw fail('prepared-owned-engine-required');
   engine=new JellyfinClient({baseUrl:BASE,tokenProvider:async()=>token,originalRoot:handoff.library.root,transcodeRoot:path.join(handoff.runtimeRoot,'cache'),allowOtherLibrariesForPilot:true});
   const until=Date.now()+60000;let info;
   while(Date.now()<until){try{info=await engine.request('/System/Info');if(info?.Version)break;}catch{}await sleep(500);}
   assert.ok(info?.Version,'Prepared engine did not become ready');evidence.process=await processProof(true);
   for(const row of rows.values())await inspect(row);
   for(const row of rows.values())for(const start of [0,Math.floor(row.video.bytes/2),row.video.bytes-65536]){
    const interval=`bytes=${start}-${start+65535}`,response=await videoResponse('preflight',row,interval),bytes=await limited(new Response(response.body),65536);
    const same=bytes.equals(await readAt(row.video.path,start,65536));assert.ok(same);evidence.preflightRanges.push({episode:row.episode,start,bytes:bytes.length,status:response.status,byteIdenticalToPreparedFile:same,sha256:sha(bytes)});
   }
   return{engine:{version:info.Version},mediaPolicy:'prepared-mp4 test binding; no preparation or original download',preflightRanges:evidence.preflightRanges};
  },
  async shutdown(){
   closed=true;for(const record of [...active])record.abort();sessions.clear();
   if(child){
    const before=await processProof(false);
    // A failed spawn/admission must not send a shutdown to some other listener
    // which raced onto this port. Only our proven process/listener may receive it.
    if(before.identity&&before.onlyLoopback){try{await engine?.request('/System/Shutdown',{method:'POST'});evidence.cleanup.shutdownRequested=true;}catch{evidence.cleanup.shutdownRequested=false;}}
    else evidence.cleanup.shutdownRequested=false;
    let exited=await Promise.race([exitPromise,sleep(15000).then(()=>null)]);
    if(!exited){const current=await processProof(false);assert.ok(current.identity,'Refuse to terminate an unproven process');child.kill();exited=await Promise.race([exitPromise,sleep(10000).then(()=>null)]);evidence.cleanup.forcedOwnedProcessTermination=true;}
    evidence.cleanup.ownedProcessExit=exited;
    const proof=await processProof(false);evidence.cleanup.noOwnedProcess=proof.noOwnedProcess;evidence.cleanup.noListener=proof.noListener;evidence.cleanup.noMediaChildren=proof.noMediaChildren;
    assert.ok(proof.noOwnedProcess&&proof.noListener&&proof.noMediaChildren,'Prepared engine cleanup incomplete');
   }token=null;
  },
 };
 function requireSession(id){const session=sessions.get(id);if(!session)throw fail('prepared-session-gone');return session;}
 function descriptorFor(number,id){const row=rows.get(number);assert.ok(row?.derived,'Only the inspected two prepared episodes can be selected');return{sessionId:id,episodeId:`one-piece-${number}`,episodeNumber:number,mode:'prepared-mp4',contentType:'video/mp4',
  masterPath:`/prepared/one-piece-${number}/video.mp4`,subtitlePath:`/prepared/one-piece-${number}/full.en.vtt`,durationSeconds:row.durationSeconds,containerDurationSeconds:Number(row.video.metadata.format.duration),
  selected:{audioIndex:row.derived.audioIndex,subtitleIndex:row.derived.subtitleIndex,audioLanguage:'jpn',subtitleLanguage:'eng'},tracks:row.derived.tracks,
  sourceId:`prepared-${number}`,preparation:{alreadyPrepared:true},originalSelection:row.selected};}
 async function processProof(alive){
  assert.ok(Number.isSafeInteger(child?.pid)&&child.pid>0);
  const code=`$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${child.pid}'; $identity=$p -and $p.ExecutablePath -eq ${ps(path.resolve(handoff.executable))} -and $p.CommandLine.Contains(${ps(path.resolve(handoff.runtimeRoot))}); $l=@(Get-NetTCPConnection -State Listen -LocalPort 18106 -ErrorAction SilentlyContinue); $c=@(Get-CimInstance Win32_Process|Where-Object{$_.ParentProcessId -eq ${child.pid} -and $_.Name -in @('ffmpeg.exe','ffprobe.exe')}); [pscustomobject]@{pid=${child.pid};identity=[bool]$identity;onlyLoopback=[bool]($l.Count -gt 0 -and @($l|Where-Object{$_.LocalAddress -ne '127.0.0.1' -or $_.OwningProcess -ne ${child.pid}}).Count -eq 0);noOwnedProcess=[bool](-not $p);noListener=[bool]($l.Count -eq 0);noMediaChildren=[bool]($c.Count -eq 0)}|ConvertTo-Json -Compress`;
  const result=await command('pwsh',['-NoProfile','-Command',code],15000);assert.equal(result.code,0,'Prepared process proof command failed');const proof=JSON.parse(result.out.trim());if(alive)assert.ok(proof.identity&&proof.onlyLoopback&&proof.noMediaChildren,'Prepared process identity/listener/children mismatch');return proof;
 }
 async function privateFetch(resource,{range,signal}={}){
  if(closed)throw fail('prepared-closed');const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),300000);timeout.unref();
  const linked=signal?AbortSignal.any([controller.signal,signal]):controller.signal;
  try{return{response:await fetch(BASE+resource,{redirect:'manual',headers:{Authorization:await engine.auth('pti-prepared-receiver'),...(range?{Range:range}:{})},signal:linked}),controller,timeout};}
  catch{clearTimeout(timeout);throw fail('prepared-upstream-unavailable');}
 }
 async function inspect(row){
  assert.ok(inside(row.video.path,handoff.library.root));const info=await lstat(row.video.path);assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.size===row.video.bytes&&info.size<=2*1024**3);
  assert.ok(inside(row.fullEnglishCaptions.path,path.dirname(handoff.library.root)));const captionInfo=await lstat(row.fullEnglishCaptions.path);assert.ok(captionInfo.isFile()&&!captionInfo.isSymbolicLink()&&captionInfo.size<1024**2);
  const canonical=await readFile(row.fullEnglishCaptions.path);assert.equal(canonical.length,row.fullEnglishCaptions.bytes);assert.equal(sha(canonical),row.fullEnglishCaptions.sha256);
  const item=await engine.request(`/Items/${row.video.itemId}?Fields=MediaSources`),source=item.MediaSources?.find(value=>value.Id===row.video.mediaSourceId);assert.ok(source);
  const{audio,caption}=preparedTracks(source);
  const resource=`/Videos/${row.video.itemId}/${row.video.mediaSourceId}/Subtitles/${caption.Index}/0/Stream.vtt`,opened=await privateFetch(resource);
  let served;try{assert.equal(opened.response.status,200);served=await limited(opened.response,1024**2);}finally{clearTimeout(opened.timeout);}
  const expected=cueRows(canonical.toString('utf8')),actual=cueRows(served.toString('utf8'));assert.deepEqual(actual,expected,'Derived English captions must preserve full original cue text and timing');assert.equal(actual.length,row.fullEnglishCaptions.cues);
  row.derived={audioIndex:audio.Index,subtitleIndex:caption.Index,tracks:[{index:audio.Index,type:'audio',language:'jpn',codec:audio.Codec},{index:caption.Index,type:'subtitle',language:'eng',codec:caption.Codec,fullEnglish:true,external:true}]};
  assets.set(`/prepared/one-piece-${row.episode}/video.mp4`,{number:row.episode,kind:'video',row});assets.set(`/prepared/one-piece-${row.episode}/full.en.vtt`,{number:row.episode,kind:'caption',bytes:served});
  evidence.episodes.push({episode:row.episode,videoBytes:row.video.bytes,videoSha256FromPriorValidatedHandoff:row.video.sha256,videoSizeRechecked:true,fullVideoShaRecomputed:false,originalSelected:row.selected,derivedSelected:row.derived,
   captionBytes:served.length,captionSha256:sha(served),handoffCaptionSha256:row.fullEnglishCaptions.sha256,canonicalCueCount:actual.length,canonicalCueTextAndTimingEqual:true,captionDelivery:'Jellyfin-served external English bytes verified and retained in bounded RAM'});
 }
 async function videoResponse(sessionId,row,range,signal){
  const expected=staticInterval(range,row.video.bytes);if(++requests>requestCap||active.size+pending>=8)throw fail('prepared-request-budget');
  let opened;pending++;try{opened=await privateFetch(`/Videos/${row.video.itemId}/stream.mp4?Static=true&MediaSourceId=${row.video.mediaSourceId}`,{range,signal});}finally{pending--;}
  const response=opened.response;let reader;
  try{validateStaticResponse(response,expected,row.video.bytes);reader=response.body.getReader();
  }catch{clearTimeout(opened.timeout);await response.body?.cancel();throw fail('prepared-range-validation');}
  const record={sessionId,episode:row.episode,start:expected.start,end:expected.end,expectedBytes:expected.length,status:response.status,receivedBytes:0,complete:false,cancelled:false};evidence.requests.push(record);
  let finished=false;
  const cleanup=()=>{if(finished)return;finished=true;clearTimeout(opened.timeout);active.delete(handle);signal?.removeEventListener('abort',abort);};
  const abort=()=>{record.cancelled=true;opened.controller.abort();void reader.cancel().catch(()=>{});cleanup();};
  const handle={sessionId,abort};active.add(handle);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const body=new ReadableStream({async pull(controller){try{const part=await reader.read();if(part.done){if(record.cancelled){controller.close();cleanup();return;}assert.equal(record.receivedBytes,expected.length);record.complete=true;controller.close();cleanup();return;}record.receivedBytes+=part.value.length;transferred+=part.value.length;if(record.receivedBytes>expected.length||transferred>byteCap)throw fail('prepared-byte-budget');controller.enqueue(part.value);}catch{record.interrupted=!record.cancelled;controller.error(fail('prepared-stream-interrupted'));abort();}},cancel(){abort();}});
  return{status:response.status,headers:{'content-type':'video/mp4','content-length':String(expected.length),'accept-ranges':'bytes',...(range?{'content-range':`bytes ${expected.start}-${expected.end}/${row.video.bytes}`}:{})},body,resources:[]};
 }
 return media;
}
