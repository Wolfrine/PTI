/** Opt-in loopback-only real-media visual QA; never included in the production bundle. */
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {CompanionApi} from '../src/api.mjs';
import {ProgressStore} from '../src/progress.mjs';
import {TicketStore,decodeResource} from '../src/tickets.mjs';
import {createMediaCoordinator} from '../src/media/index.mjs';
import {ARCHIVE_ITEMS,buildCatalog} from '../src/sources/archive.mjs';
import {command} from './media-real.mjs';
import {createPreparedPilot} from './prepared-pilot.mjs';

const ROOT='H:/PTI-OnePiece/production-media',PILOT='H:/PTI-OnePiece/pilot/jellyfin';
const ORIGIN='http://127.0.0.1:8910',PORT=18102;
const closeServer=server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});

export async function runBrowserReal(){
 if(process.env.PTI_RUN_REAL_BROWSER!=='1')throw new Error('Explicit loopback media QA opt-in required');
 const prepared=process.env.PTI_BROWSER_PREPARED_MP4==='1',evidence=new URL(`../../../../docs/one-piece/evidence/${prepared?'browser-prepared-adapter':'browser-real-adapter'}.json`,import.meta.url);
 const began=Date.now(),report={kind:'loopback-real-browser-media',startedAt:new Date().toISOString(),
  identity:'synthetic technical profiles confined to opt-in harness; production Firebase/auth not tested',
  newNetworkDownloads:0,engine:prepared?'owned isolated prepared Jellyfin 127.0.0.1:18106':'existing isolated Jellyfin 127.0.0.1:18096',delivery:prepared?'test-only exact prepared MP4 binding':'existing HLS adapter',ready:[],requests:[],humanAudioVerified:false,visuallyRendered:false};
 const root=`H:/PTI-OnePiece/browser-qa/${began}`;await mkdir(root,{recursive:true});
 const stopEncoders=async()=>{const result=await command('pwsh',['-NoProfile','-File',fileURLToPath(new URL('../pilot/jellyfin/stop.ps1',import.meta.url)),'-EncodersOnly'],20000);if(result.code)throw new Error('Pilot encoder cancellation failed');};
 const catalog=buildCatalog(await Promise.all(ARCHIVE_ITEMS.map(item=>readFile(new URL(`../../../../docs/one-piece/evidence/sources/${item}.json`,import.meta.url),'utf8').then(JSON.parse))));
 let api,server,media,timer,life,finishing=false;const sessions=new Map(),jobs=new Map(),tickets=new TicketStore();
 const progress=new ProgressStore({root:path.join(root,'progress'),catalog,onRevoke:async id=>{tickets.revokeSession(id);api?.revokeSession(id);await media.closeSession(id);}});
 const finish=async()=>{if(finishing)return;finishing=true;clearInterval(timer);clearTimeout(life);
  try{if(server?.listening)await closeServer(server);await media?.shutdown();if(!prepared)await stopEncoders();report.cleanup=true;}catch{report.cleanup=false;}
  if(prepared)report.preparedBinding=media?.evidence;
  report.completedAt=new Date().toISOString();await writeFile(evidence,JSON.stringify(report,null,2));};
 try{
  media=prepared?await createPreparedPilot({startOwnedEngine:true}):createMediaCoordinator({catalog,cacheRoot:`${ROOT}/cache`,managedRoots:{transcodes:`${ROOT}/transcodes`,subtitles:`${PILOT}/data-v2/data/subtitles`},extraAccountingRoots:[ROOT,`${PILOT}/cache`,root],autoPrefetch:false,
   downloader:{async download(){throw Object.assign(new Error('Cached originals only'),{code:'cached-original-required'});}},
   jellyfin:{baseUrl:'http://127.0.0.1:18096',allowOtherLibrariesForPilot:true,ffprobePath:`${PILOT}/runtime/jellyfin/ffprobe.exe`,tokenProvider:async()=>JSON.parse(await readFile(`${PILOT}/private/state.json`,'utf8')).token},onEmergencyStop:stopEncoders});
  await media.initialize({hardwareAcceleration:'nvenc'});
  api=new CompanionApi({media,progress,tickets,credentials:()=>({getAuthorized:async uid=>{assert.match(uid,/^technical-browser-(1|1000|1001)$/);return{uid};}}),
   config:{allowedOrigins:[ORIGIN],mediaOrigin:`http://127.0.0.1:${PORT}`}});
  const prepare=async number=>{
   if(!jobs.has(number))jobs.set(number,(async()=>{
    const uid=`technical-browser-${number}`,lease=await progress.claim({uid,deviceId:'loopback-browser-qa',destination:'local'});
    sessions.set(uid,lease);const t=performance.now();const descriptor=await media.openSession({sessionId:lease.sessionId,profileId:uid,episodeNumber:number});
    report.ready.push({episodeNumber:number,readyMs:Math.round(performance.now()-t),selected:descriptor.selected,durationSeconds:descriptor.durationSeconds,mode:descriptor.mode});
    return{uid,lease};
   })().catch(error=>{jobs.delete(number);throw error;}));
   const {uid,lease}=await jobs.get(number);return{...await api.delegation({uid},lease.sessionId,'local'),playback:api.safeState(lease.sessionId).playback};
  };
  server=http.createServer(async(req,res)=>{
   if(req.url==='/dev/stop'&&req.method==='POST'&&(!req.headers.origin||req.headers.origin===ORIGIN)){
    res.writeHead(200,{'Cache-Control':'no-store'});res.end('stopping');setImmediate(()=>void finish());return;
   }
   if(req.url.startsWith('/m/')){
    const match=/^\/m\/[^/]+\/(one-piece-\d{4})\/([A-Za-z0-9_-]+)$/.exec(req.url);let resource='';try{resource=match?decodeResource(match[2]):'';}catch{}
    if(report.requests.length<1500){const row={atMs:Date.now()-began,episodeId:match?.[1]??null,kind:resource.includes('.m3u8')?'playlist':resource.includes('.vtt')?'subtitles':prepared?'static-mp4':'segment',status:null};report.requests.push(row);res.on('finish',()=>{row.status=res.statusCode;});res.on('close',()=>{row.status??=res.statusCode;});}
    void api.mediaRequest(req,res);return;
   }
   // This explicitly named technical route never exists on the production server.
   const match=/^\/dev\/delivery\/(1|1000|1001)$/.exec(req.url);
   if(req.method!=='GET'||!match||prepared&&match[1]==='1'||req.headers.origin&&req.headers.origin!==ORIGIN){res.writeHead(404);res.end();return;}
   res.setHeader('Access-Control-Allow-Origin',ORIGIN);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
   try{const value=await prepare(Number(match[1]));res.end(JSON.stringify(value));}
   catch(error){res.writeHead(503);res.end(JSON.stringify({error:/^[A-Za-z0-9_-]+$/.test(error.code??'')?error.code:'technical-media-unavailable'}));}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,'127.0.0.1',resolve);});
  timer=setInterval(()=>{for(const[uid,lease]of sessions)void progress.renew(uid,lease.sessionId).catch(()=>{});void writeFile(evidence,JSON.stringify(report,null,2));},15000);
  life=setTimeout(()=>void finish(),30*60000);life.unref();
  process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')void finish();});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void finish());
  process.stdout.write('Loopback cached-only media QA ready on 127.0.0.1:18102; no credential or capability is logged.\n');
  return{finish,report};
 }catch(error){await finish();throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.env.PTI_RUN_REAL_BROWSER==='1')await runBrowserReal();
 else process.stdout.write('Browser media QA skipped; explicit PTI_RUN_REAL_BROWSER=1 required.\n');
}
