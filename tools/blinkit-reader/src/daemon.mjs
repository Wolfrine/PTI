import {readFile,writeFile,rename,mkdir,open,unlink,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {BrowserRuntime} from './browser.mjs';
import {processPayment} from './core.mjs';
const index=process.argv.indexOf('--root'),root=resolve(index>=0?process.argv[index+1]:'F:/Workspace/Support/PTI/blinkit-reader');
if(root.toLowerCase()!==resolve('F:/Workspace/Support/PTI/blinkit-reader').toLowerCase())throw Error('Unexpected installation root.');
await mkdir(join(root,'data'),{recursive:true});
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
const statusPath=join(root,'data','status.json'),lockPath=join(root,'data','worker.lock'),stopPath=join(root,'data','stop.request'),replayPath=join(root,'data','replay.request');
let lock;
try{lock=await open(lockPath,'wx');}catch{
 let live=true;try{const old=await read(lockPath);try{process.kill(old.pid,0);}catch{live=false;}}catch{live=false;}
 if(live)process.exit(0);await unlink(lockPath).catch(()=>{});lock=await open(lockPath,'wx');
}
await lock.writeFile(JSON.stringify({pid:process.pid}));
const active=await read(join(root,'active.json'));
let runtime,stopMonitor,stopping=false,status={schemaVersion:1,version:'1.0.0',pid:process.pid,startedAt:new Date().toISOString(),status:'starting',lastCycleAt:null,processed:0,verified:0},queueCursor=null,sourceBlocked=false;
const publish=async patch=>{status={...status,...patch,lastCycleAt:new Date().toISOString()};await writeFile(statusPath+'.tmp',JSON.stringify(status));await rename(statusPath+'.tmp',statusPath);};
const wait=async ms=>{const end=Date.now()+ms;while(Date.now()<end&&!await exists(stopPath)){if(status.status==='ready'&&await exists(replayPath))break;await new Promise(r=>setTimeout(r,Math.min(1000,end-Date.now())));}};
const once=process.argv.includes('--once'),replayIndex=process.argv.indexOf('--replay'),replay=replayIndex>=0?process.argv[replayIndex+1]:null;
if(replay&&!/^blinkit-gmail-[a-f0-9]{8,40}$/.test(replay))throw Error('Invalid replay event ID.');
try{
 if(!await exists(stopPath)){
  runtime=new BrowserRuntime({profile:join(root,'browser-profile'),chromePath:active.chromePath});
  try{await runtime.open();}catch{await publish({status:'browser_profile_in_use'});throw Error('browser_profile_in_use');}
  // Closing our own context interrupts pending tool/network waits without killing
  // another browser or process. An ingest may already have committed; its atomic
  // event checkpoint, not a local success claim, is authoritative on restart.
  stopMonitor=setInterval(async()=>{if(!stopping&&await exists(stopPath)){stopping=true;await runtime.close().catch(()=>{});}},500);
  while(!await exists(stopPath)){
   try{
    await runtime.surface('morsel',{reload:status.status!=='ready'});await new Promise(r=>setTimeout(r,2000));
    const tools=await runtime.tools('morsel'),available=tools.some(t=>/^morsel_blinkit_events(?:__|$)/.test(t.name));
    if(!available){await publish({status:'morsel_login_required',morselBridgeReady:false});if(once)break;await wait(300000);continue;}
    const persistence=runtime.persistence(),queue=await persistence.events({action:'context',limit:1,...(queueCursor?{after:queueCursor}:{})});
    queueCursor=queue.window?.nextAfter||null;
    if(queue.ingestionPaused){await persistence.events({action:'heartbeat',workerStatus:'paused'});await publish({status:'paused',morselBridgeReady:true});if(once)break;await wait(60000);continue;}
    const requestedReplay=await exists(replayPath)?(await read(replayPath)).eventId:null;
    if(requestedReplay&&!/^blinkit-gmail-[a-f0-9]{8,40}$/.test(requestedReplay))throw Error('invalid_replay_request');
    const eventId=replay||requestedReplay||queue.events[0]?.eventId;
    if(!eventId&&status.status==='ready'){await persistence.events({action:'heartbeat',workerStatus:'ready'});await publish({status:'ready',lastOutcome:'idle'});if(once)break;await wait(60000);continue;}
    if(sourceBlocked){await persistence.events({action:'heartbeat',workerStatus:'source_access_denied'});await publish({status:'source_access_denied',morselBridgeReady:true});if(once)break;await wait(60000);continue;}
    await runtime.surface('blinkit');await new Promise(r=>setTimeout(r,1000));
    let source;
    try{source=await runtime.source();}catch(error){
     const code=error.code==='source_access_denied'?'source_access_denied':error.code==='needs_login'?'blinkit_login_required':'first_party_tools_unavailable';
     sourceBlocked=code==='source_access_denied';await persistence.events({action:'heartbeat',workerStatus:code});await publish({status:code,morselBridgeReady:true,sourceHttpStatus:runtime.blinkitStatus||null});if(once)break;await wait(300000);continue;
    }
    await persistence.events({action:'heartbeat',workerStatus:'ready'});
    let result=null;
    if(eventId){if(requestedReplay)await unlink(replayPath);result=await processPayment({eventId,source,persistence,replay:!!replay||!!requestedReplay});status.processed++;if(result.readbackVerified)status.verified++;}
    await publish({status:'ready',morselBridgeReady:true,sourceHttpStatus:runtime.blinkitStatus||null,lastOutcome:result?.status||'idle',...(result?.purchaseId?{lastPurchaseHashId:result.purchaseId}:{}),lastReadbackVerified:result?.readbackVerified===true,lastDuplicate:result?.duplicate===true});
   }catch{await publish({status:'retry_wait',lastOutcome:'transport_or_checkpoint_unavailable'});}
   if(once||replay)break;await wait(60000);
  }
 }
}catch(error){if(status.status!=='browser_profile_in_use')await publish({status:'blocked',lastOutcome:'runtime_unavailable'});}
finally{clearInterval(stopMonitor);await runtime?.close().catch(()=>{});await publish({status:await exists(stopPath)?'stopped':status.status});await lock.close();await unlink(lockPath).catch(()=>{});}
