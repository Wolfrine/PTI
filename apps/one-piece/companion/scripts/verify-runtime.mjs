import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {lookup} from 'node:dns/promises';
import https from 'node:https';
import path from 'node:path';
import {loadRuntimeConfig,HOUSEHOLD_CA_SHA256} from '../src/runtime/config.mjs';
import {X509Certificate} from 'node:crypto';
const config=await loadRuntimeConfig('H:/PTI-OnePiece/runtime/private/config.json');
const ca=await readFile(config.caddy.rootCertificatePath);
function get(url){return new Promise(resolve=>{
 const request=https.get(url,{ca,headers:{Origin:'https://pti-app-2ab59.web.app'},timeout:5000},response=>{
  let body='';response.setEncoding('utf8');response.on('data',chunk=>{body+=chunk;if(body.length>65536)request.destroy();});
  const proof={status:response.statusCode,authorized:response.socket.authorized,certificateName:response.socket.getPeerCertificate().subjectaltname,allowedOrigin:response.headers['access-control-allow-origin']??null};
  response.on('end',()=>{let parsed;try{parsed=JSON.parse(body);}catch{}resolve({...proof,service:parsed?.service??parsed?.status??null,setupRequired:parsed?.setupRequired??null});});
 });request.once('error',error=>resolve({error:error.code??'request-failed'}));request.once('timeout',()=>request.destroy());
});}
const result={recordedAt:new Date().toISOString(),source:'real local production runtime; no media session or TV was started',caSha256:new X509Certificate(ca).fingerprint256.replaceAll(':','').toUpperCase(),expectedCaSha256:HOUSEHOLD_CA_SHA256};
try{result.nameResolution=await lookup(config.mdns.hostname);}catch(error){result.nameResolution={error:error.code};}
result.httpsName=await get(config.controlsOrigin+'/runtime-health');result.httpsIp=await get(config.fallbackControlsOrigin+'/runtime-health');result.apiHealth=await get(config.controlsOrigin+'/api/health');
const state=JSON.parse(await readFile(config.statePath,'utf8'));
result.supervisor={pid:state.supervisorPid,processes:state.processes,health:state.health,engineBootstrap:state.engineBootstrap,startupMode:state.startupMode,preLoginVerified:false,rebootVerified:false};
result.scope={routerDnsChanged:false,externalDnsAccount:false,plaintextWindowsPasswordStored:false,androidInstallationVerified:false,tvProductionSessionVerified:false};
const index=process.argv.indexOf('--evidence');if(index>=0){const file=path.resolve(process.argv[index+1]);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify(result));
if(result.caSha256!==HOUSEHOLD_CA_SHA256||result.nameResolution.address!==config.mdns.address||result.httpsName.status!==200||result.apiHealth.status!==200||!result.httpsName.authorized)process.exitCode=1;
