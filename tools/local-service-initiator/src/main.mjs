import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {validateSettings,Initiator,VERSION} from './core.mjs';
import {WorkerHost,unprotect,readJson,atomicJson,pause} from './windows.mjs';

const settings=validateSettings(await readJson(process.argv[2]));
await mkdir(settings.stateDirectory,{recursive:true});
const worker=await readJson(settings.workerConfig);
if(worker?.workerId!==settings.workerId || worker.gateway.replace(/\/$/,'')!==settings.gateway.replace(/\/$/,'') || !worker.secretProtected || worker.ollama!=='http://127.0.0.1:11434')throw Error('configuration_invalid');
let token='',until=0;
async function json(url,body,headers={}) {
  const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok){if(response.status===401)until=0;await response.body?.cancel();throw Error([401,403].includes(response.status)?'authentication_required':'gateway_unavailable');}
  return response.json();
}
async function poll(body) {
  if(Date.now()>until){
    const secret=await unprotect(worker.secretProtected);
    const boot=await json(settings.gateway+'/worker/session',{workerId:settings.workerId,secret});
    const session=await json('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key='+encodeURIComponent(worker.firebaseApiKey),{token:boot.customToken,returnSecureToken:true});
    token=session.idToken;until=Date.now()+(Number(session.expiresIn)-120)*1000;
  }
  return json(settings.gateway+'/worker/service/poll',body,{Authorization:'Bearer '+token});
}
const host=new WorkerHost(settings);
const attemptFile=path.join(settings.stateDirectory,'attempt.json');
const initiator=new Initiator({api:poll,read:()=>readJson(attemptFile),write:value=>atomicJson(attemptFile,value),start:()=>host.start(),workerRunning:exact=>host.workerRunning(exact)});
let stopping=false,failures=0;
process.on('SIGINT',()=>stopping=true);process.on('SIGTERM',()=>stopping=true);
while(!stopping){
  let status;
  try {
    const service=await initiator.tick();failures=0;
    status={version:VERSION,pid:process.pid,lastPollAt:new Date().toISOString(),state:service?.state || 'unavailable',workerRunning:await host.workerRunning(),errorCode:null};
  }catch(error){failures++;status={version:VERSION,pid:process.pid,checkedAt:new Date().toISOString(),state:'unavailable',errorCode:['authentication_required','configuration_invalid'].includes(error.message)?error.message:'gateway_unavailable'};}
  await atomicJson(path.join(settings.stateDirectory,'status.json'),status);
  await pause(Math.min(60000,15000*Math.max(1,failures)));
}
