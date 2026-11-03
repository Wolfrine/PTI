import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {validateSettings,Initiator,VERSION} from './core.mjs';
import {WorkerHost,unprotect,readJson,atomicJson,pause} from './windows.mjs';
import {OnePieceHost,OnePieceSupervisor,ONE_PIECE_GATEWAY,ONE_PIECE_CHECK_MS,onePiecePollBody} from './one-piece.mjs';
import {GtopSupervisor,LOCAL_CHECK_MS} from './supervision.mjs';

const settings=validateSettings(await readJson(process.argv[2]));
await mkdir(settings.stateDirectory,{recursive:true});
const worker=await readJson(settings.workerConfig);
if(worker?.workerId!==settings.workerId || worker.gateway.replace(/\/$/,'')!==settings.gateway.replace(/\/$/,'') || !worker.secretProtected)throw Error('configuration_invalid');
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
let gtopRemoteCalls=0;
async function poll(body) { const bearer=await workerToken();gtopRemoteCalls++;return json(settings.gateway+'/worker/service/poll',body,{Authorization:'Bearer '+bearer}); }
const host=new WorkerHost(settings,process.argv[2]);
const attemptFile=path.join(settings.stateDirectory,'attempt.json');
const initiator=new Initiator({api:poll,read:()=>readJson(attemptFile),write:value=>atomicJson(attemptFile,value),start:()=>host.start(),workerRunning:async exact=>(await host.observe(exact)).state==='running'});
const supervisionFile=path.join(settings.stateDirectory,'gtop-supervision.json');
const supervisor=new GtopSupervisor({host,poll:()=>initiator.tick(),read:()=>readJson(supervisionFile),write:value=>atomicJson(supervisionFile,value)});
const onePieceHost=settings.onePieceEnabled===true?new OnePieceHost(host):null;
const onePieceAttempt=path.join(settings.stateDirectory,'one-piece-attempt.json');
let onePieceRemoteCalls=0;
async function onePiecePoll(body){
  const bearer=await workerToken();onePieceRemoteCalls++;
  return json(ONE_PIECE_GATEWAY+'/poll',body,{Authorization:'Bearer '+bearer});
}
async function startOnePiece(){
  let pending,done=false;
  const timer=setInterval(()=>{
    if(done||pending)return;
    pending=(async()=>onePiecePoll({version:VERSION,companionReady:await onePieceHost.ready()}))()
      .catch(()=>{}).finally(()=>{pending=undefined;});
  },15000);
  try{await onePieceHost.start();}
  finally{done=true;clearInterval(timer);await pending;}
}
let onePieceMeasuredReady;
const onePiece=onePieceHost?new Initiator({
  api:body=>onePiecePoll(onePiecePollBody(body)),
  read:()=>readJson(onePieceAttempt),write:value=>atomicJson(onePieceAttempt,value),start:startOnePiece,
  workerRunning:()=>{
    // Consume the supervisor's fresh sample once; ACK/recovery probes must
    // measure again after the command rather than reusing pre-start health.
    if(onePieceMeasuredReady===undefined)return onePieceHost.ready();
    const ready=onePieceMeasuredReady;onePieceMeasuredReady=undefined;return ready;
  }
}):null;
const onePieceSupervisor=onePiece?new OnePieceSupervisor({ready:()=>onePieceHost.ready(),poll:async ready=>{
  onePieceMeasuredReady=ready;
  try{return await onePiece.tick();}finally{onePieceMeasuredReady=undefined;}
}}):null;
let stopping=false;
process.on('SIGINT',()=>stopping=true);process.on('SIGTERM',()=>stopping=true);
async function gtopTick(){
  const status={version:VERSION,pid:process.pid,...await supervisor.tick()};
  status.counters.remoteCalls=gtopRemoteCalls;status.counters.identityChecks=host.identityChecks;
  await atomicJson(path.join(settings.stateDirectory,'status.json'),status);
}
async function onePieceTick(){
  if(!onePieceSupervisor)return;
  const status={version:VERSION,pid:process.pid,...await onePieceSupervisor.tick()};
  status.counters.remoteCalls=onePieceRemoteCalls;
  await atomicJson(path.join(settings.stateDirectory,'one-piece-status.json'),status);
}
async function loop(tick){
  while(!stopping){
    try{await tick();}catch{/* Local disk failure cannot start another service. */}
    await pause(ONE_PIECE_CHECK_MS);
  }
}
// Independent timers: either service can be starting or unavailable without
// starving the other's heartbeat or control mailbox.
async function supervise(){while(!stopping){try{await gtopTick();}catch{/* Fail closed on local state failure. */}await pause(LOCAL_CHECK_MS);}}
await Promise.all([supervise(),...(onePiece?[loop(onePieceTick)]:[])]);
