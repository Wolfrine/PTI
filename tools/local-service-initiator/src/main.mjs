import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {validateSettings,Initiator,VERSION} from './core.mjs';
import {WorkerHost,unprotect,readJson,atomicJson,pause} from './windows.mjs';
import {OnePieceHost,ONE_PIECE_GATEWAY,onePiecePollBody} from './one-piece.mjs';

const settings=validateSettings(await readJson(process.argv[2]));
await mkdir(settings.stateDirectory,{recursive:true});
const worker=await readJson(settings.workerConfig);
if(worker?.workerId!==settings.workerId || worker.gateway.replace(/\/$/,'')!==settings.gateway.replace(/\/$/,'') || !worker.secretProtected || worker.ollama!=='http://127.0.0.1:11434')throw Error('configuration_invalid');
let token='',until=0,refreshing;
async function json(url,body,headers={}) {
  const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok){if(response.status===401)until=0;await response.body?.cancel();throw Error([401,403].includes(response.status)?'authentication_required':'gateway_unavailable');}
  return response.json();
}
async function workerToken() {
  if(Date.now()<=until)return token;
  if(!refreshing)refreshing=(async()=>{
    const secret=await unprotect(worker.secretProtected);
    const boot=await json(settings.gateway+'/worker/session',{workerId:settings.workerId,secret});
    const session=await json('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key='+encodeURIComponent(worker.firebaseApiKey),{token:boot.customToken,returnSecureToken:true});
    token=session.idToken;until=Date.now()+(Number(session.expiresIn)-120)*1000;
    return token;
  })().finally(()=>{refreshing=undefined;});
  return refreshing;
}
async function poll(body) { return json(settings.gateway+'/worker/service/poll',body,{Authorization:'Bearer '+await workerToken()}); }
const host=new WorkerHost(settings,process.argv[2]);
const attemptFile=path.join(settings.stateDirectory,'attempt.json');
const initiator=new Initiator({api:poll,read:()=>readJson(attemptFile),write:value=>atomicJson(attemptFile,value),start:()=>host.start(),workerRunning:exact=>host.workerRunning(exact)});
const onePieceHost=settings.onePieceEnabled===true?new OnePieceHost(host):null;
const onePieceAttempt=path.join(settings.stateDirectory,'one-piece-attempt.json');
async function startOnePiece(){
  let pending,done=false;
  const timer=setInterval(()=>{
    if(done||pending)return;
    pending=(async()=>json(ONE_PIECE_GATEWAY+'/poll',{version:VERSION,companionReady:await onePieceHost.ready()},{Authorization:'Bearer '+await workerToken()}))()
      .catch(()=>{}).finally(()=>{pending=undefined;});
  },15000);
  try{await onePieceHost.start();}
  finally{done=true;clearInterval(timer);await pending;}
}
const onePiece=onePieceHost?new Initiator({
  api:async body=>json(ONE_PIECE_GATEWAY+'/poll',onePiecePollBody(body),{Authorization:'Bearer '+await workerToken()}),
  read:()=>readJson(onePieceAttempt),write:value=>atomicJson(onePieceAttempt,value),start:startOnePiece,workerRunning:()=>onePieceHost.ready()
}):null;
let stopping=false,failures=0,onePieceFailures=0;
process.on('SIGINT',()=>stopping=true);process.on('SIGTERM',()=>stopping=true);
async function gtopTick(){
  let status;
  try {
    const service=await initiator.tick();failures=0;
    status={version:VERSION,pid:process.pid,lastPollAt:new Date().toISOString(),state:service?.state || 'unavailable',workerRunning:await host.workerRunning(),errorCode:null};
  }catch(error){failures++;status={version:VERSION,pid:process.pid,checkedAt:new Date().toISOString(),state:'unavailable',errorCode:['authentication_required','configuration_invalid'].includes(error.message)?error.message:'gateway_unavailable'};}
  await atomicJson(path.join(settings.stateDirectory,'status.json'),status);
}
async function onePieceTick(){
  if(!onePiece)return;
  let status;
  try{const service=await onePiece.tick();onePieceFailures=0;status={version:VERSION,pid:process.pid,lastPollAt:new Date().toISOString(),state:service?.state||'unavailable',companionReady:service?.companion?.state==='ready',errorCode:null};}
  catch(error){onePieceFailures++;status={version:VERSION,pid:process.pid,checkedAt:new Date().toISOString(),state:'unavailable',errorCode:['authentication_required','configuration_invalid'].includes(error.message)?error.message:'gateway_unavailable'};}
  await atomicJson(path.join(settings.stateDirectory,'one-piece-status.json'),status);
}
async function loop(tick,errorCount){
  while(!stopping){
    try{await tick();}catch{/* Local disk failure cannot start another service. */}
    await pause(Math.min(60000,15000*Math.max(1,errorCount())));
  }
}
// Independent timers: either service can be starting or unavailable without
// starving the other's heartbeat or control mailbox.
await Promise.all([loop(gtopTick,()=>failures),...(onePiece?[loop(onePieceTick,()=>onePieceFailures)]:[])]);
