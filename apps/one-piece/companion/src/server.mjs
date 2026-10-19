import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {FirebaseIdentity,FamilyAccess} from './auth.mjs';
import {OwnerBinding} from './pairing.mjs';
import {ProgressStore} from './progress.mjs';
import {TicketStore} from './tickets.mjs';
import {ViewerCredentials} from './viewer-credentials.mjs';
import {CloudProgress} from './cloud-progress.mjs';
import {CastBridge} from './cast.mjs';
import {CompanionApi} from './api.mjs';
import {createMediaCoordinator,dedicatedEngineDescriptor} from './media/index.mjs';
import {loadRuntimeConfig,loadRuntimeSecrets} from './runtime/config.mjs';
import {PlaybackDiagnostics,emitDiagnostic} from './diagnostics.mjs';

const listen=(server,port,host)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve();});});
const stop=server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});

export async function startCompanion(config,{stopEngineChildren,initializeMedia=true,media:injectedMedia}={}){
 if(typeof stopEngineChildren!=='function')throw new Error('Verified engine cancellation is required');
 const secrets=await loadRuntimeSecrets(config),catalog=JSON.parse(await readFile(config.catalogPath,'utf8'));
 const identity=new FirebaseIdentity({projectId:config.firebaseProjectId});
 const binding=new OwnerBinding({root:config.privateRoot});await binding.initialize();
 const tickets=new TicketStore(),diagnostics=new PlaybackDiagnostics({file:path.join(config.privateRoot,'playback-diagnostics.json')});let cast,api,family,credentials,cloud;
 const onDiagnostic=event=>emitDiagnostic(value=>diagnostics.record(value),event);
 const progress=new ProgressStore({root:config.progressRoot,catalog,onRevoke:async id=>{
  onDiagnostic({type:'session-close',sessionId:id});
  tickets.revokeSession(id);api?.revokeSession(id);await cast?.revokeSession(id);await media.closeSession(id);
 },onAuthorityChange:async id=>{onDiagnostic({type:'authority-change',sessionId:id});tickets.revokeSession(id);api?.revokeSession(id);await cast?.revokeSession(id);}});
 await progress.restorePendingProfiles();
 const descriptor=dedicatedEngineDescriptor({runtimeRoot:config.jellyfin.runtimeRoot,binaryDir:config.jellyfin.binaryDir,port:18097});
 const prepared=config.playback?.mode==='prepared-mp4';
 const media=injectedMedia??createMediaCoordinator({catalog,cacheRoot:config.cacheRoot,managedRoots:descriptor.managedRoots,
  defaultMode:config.playback?.mode??'compatible-h264',
  verifiedModes:prepared?['compatible-h264','cast-h264','prepared-mp4']:undefined,
  extraAccountingRoots:[descriptor.directories.data,descriptor.directories.cache,descriptor.directories.logs,
   'H:/PTI-OnePiece/production-media','H:/PTI-OnePiece/pilot/jellyfin/cache',...config.cacheAccountingRoots],
  importRoots:['H:/PTI-OnePiece/production-media/cache','H:/PTI-OnePiece/pilot/jellyfin/cache'],
  jellyfin:{baseUrl:config.jellyfin.origin,tokenProvider:async()=>secrets.jellyfinToken,
   preparedEnabled:prepared,ffmpegPath:path.join(config.jellyfin.binaryDir,'ffmpeg.exe'),
   ffprobePath:path.join(config.jellyfin.binaryDir,'ffprobe.exe')},
  onEmergencyStop:async()=>{await stopEngineChildren(config);}});
 if(initializeMedia)await media.initialize({hardwareAcceleration:'nvenc'});
 const configureFamily=async()=>{
  if(!binding.ownerUid)return;
  family=new FamilyAccess({projectId:config.firebaseProjectId,ownerUid:binding.ownerUid});
  credentials=new ViewerCredentials({root:config.viewerCredentialsRoot,projectId:config.firebaseProjectId,ownerUid:binding.ownerUid,apiKey:config.firebaseApiKey,identity,family});
  cloud=new CloudProgress({projectId:config.firebaseProjectId,ownerUid:binding.ownerUid,credentials,store:progress});
 };
 await configureFamily();
 cast=new CastBridge({progressStore:progress,tickets,mediaOrigins:[config.castMediaOrigin],allowHttpMedia:config.allowHttpMedia,
  pythonExecutable:config.pythonExecutable,toolsPath:config.mdns.toolsPath,onDiagnostic,
  onState:async(context,state)=>{await api?.receiverState(context,state);},
  onEpisodeChanged:async(context,episodeId)=>{await api?.receiverEpisode(context,episodeId);},
  onDisplaced:async context=>{await progress.close(context.uid,context.sessionId).catch(()=>{});}});
 api=new CompanionApi({identity,binding,family:()=>family,credentials:()=>credentials,cloud:()=>cloud,media,progress,tickets,cast,
  config:{...config,proxySecret:secrets.proxySecret},onPair:configureFamily,onDiagnostic});
 const backend=http.createServer((req,res)=>req.url.startsWith('/m/')?api.mediaRequest(req,res):api.control(req,res));
 const mediaServer=http.createServer((req,res)=>{
  const remote=req.socket.remoteAddress?.replace('::ffff:','');
  if(!/^192\.168\.68\.(?:[1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4])$/.test(remote??'')){res.writeHead(403);res.end();return;}
  void api.mediaRequest(req,res,{httpMedia:true});
 });
 for(const server of [backend,mediaServer]){server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=40;server.keepAliveTimeout=5000;}
 try{await listen(backend,config.backendPort,config.backendHost);if(config.allowHttpMedia)await listen(mediaServer,config.httpMediaPort,config.httpMediaHost);}
 catch(error){await Promise.allSettled([stop(backend),stop(mediaServer)]);await cast.close();await media.shutdown();throw error;}
 const timer=setInterval(()=>{
  tickets.prune();for(const uid of progress.users.keys())void cloud?.sync(uid);
 },15000);timer.unref();
 let stopping=false;
 return{api,media,progress,binding,backend,mediaServer,async close(){if(stopping)return;stopping=true;api.shutdown();clearInterval(timer);await cast.close();await Promise.allSettled([stop(backend),stop(mediaServer)]);await media.shutdown();await diagnostics.flush().catch(()=>{});}};
}

async function main(){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--config')throw new Error('Use --config with the protected runtime configuration');
 const config=await loadRuntimeConfig(path.resolve(args[1]));
 const {stopOwnedEngineChildren}=await import('./runtime/supervisor.mjs');
 const runtime=await startCompanion(config,{stopEngineChildren:stopOwnedEngineChildren});
 // Setup code is returned only by the protected local setup IPC, never public HTTP.
 if(!runtime.binding.ownerUid){
  const challenge=runtime.binding.beginLocalSetup();
  // Parent supervisor receives the challenge via a private inherited IPC channel.
  // Without IPC, require interactive local setup instead of writing a secret to logs.
  if(process.send)process.send({type:'one-piece-local-setup',...challenge});
 }
 process.send?.({type:'one-piece-backend-ready'});
 process.on('message',message=>{if(message?.type==='one-piece-shutdown')void runtime.close().then(()=>process.exit(0));});
 process.on('message',message=>{if(message?.type==='one-piece-local-setup-request'&&!runtime.binding.ownerUid)process.send?.({type:'one-piece-local-setup',...runtime.binding.beginLocalSetup()});});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>runtime.close().then(()=>process.exit(0)));
 process.on('uncaughtException',()=>{void runtime.close().finally(()=>process.exit(1));});
 process.on('unhandledRejection',()=>{void runtime.close().finally(()=>process.exit(1));});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('one-piece-runtime-unavailable\n');process.exitCode=1;});
