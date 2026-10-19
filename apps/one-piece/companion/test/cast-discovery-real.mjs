// Opt-in read-only LAN check. Never issues LOAD/PLAY/PAUSE/STOP or media tickets.
import {readFile,writeFile} from 'node:fs/promises';
import {CastPythonTransport} from '../src/cast.mjs';
if(process.env.PTI_RUN_CAST_DISCOVERY!=='1'){console.log('Set PTI_RUN_CAST_DISCOVERY=1 for read-only repeated LAN discovery');process.exit(0);}
const config=JSON.parse(await readFile('H:/PTI-OnePiece/runtime/private/config.json','utf8'));
const transport=new CastPythonTransport({pythonExecutable:config.pythonExecutable,toolsPath:config.mdns.toolsPath,mediaOrigins:[config.castMediaOrigin],allowHttpMedia:config.allowHttpMedia});
const result={recordedAt:new Date().toISOString(),mode:'read-only discovery; no receiver playback commands or media requests',attempts:[]};
try{
 for(let attempt=1;attempt<=3;attempt++){
  const start=performance.now(),devices=await transport.request('discover');
  if(!devices.length||!devices.some(d=>d.available!==false))throw Error('receiver-not-found');
  result.attempts.push({attempt,ms:Math.round(performance.now()-start),workerPid:transport.child.pid,devices:devices.map(({receiverId,name,available,busy})=>({receiverId,name,available:available!==false,busy}))});
 }
 result.sameWorker=new Set(result.attempts.map(a=>a.workerPid)).size===1;
 result.passed=result.sameWorker;
}catch(error){result.passed=false;result.error=/^cast-[a-z-]+$/.test(error.code??'')?error.code:'read-only-discovery-failed';process.exitCode=1;}
finally{
 const child=transport.child;const exited=child?new Promise(resolve=>{child.once('exit',()=>resolve(true));setTimeout(()=>resolve(false),4000).unref();}):Promise.resolve(true);
 transport.close();result.ownedWorkerExited=await exited;
 if(!result.ownedWorkerExited)process.exitCode=1;
 const at=process.argv.indexOf('--evidence');if(at>=0)await writeFile(process.argv[at+1],JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
