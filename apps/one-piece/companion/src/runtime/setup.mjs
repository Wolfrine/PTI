import path from 'node:path';
import { readFile,writeFile,mkdir,access } from 'node:fs/promises';
import { createHash,randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WindowsProtection } from '../dpapi.mjs';
import { atomicJson } from '../progress.mjs';
import { dedicatedEngineDescriptor } from '../media/runtime.mjs';
import { CADDY_SHA256,HOUSEHOLD_CA_SHA256,validateRuntimeConfig,loadRuntimeConfig,loadRuntimeSecret,saveRuntimeSecret } from './config.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
export const SETUP_POWERSHELL='C:/Users/Sachit Tewary/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe';
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
// Used only after setup has established that no protected configuration exists.
// Existing installations retain their saved mode and require an explicit migration.
export const createNewRuntimeConfig=input=>validateRuntimeConfig({...input,playback:{mode:'prepared-mp4'}});
export async function runPowerShellFile(file,args=[]){
  return new Promise((resolve,reject)=>{
    const child=spawn(SETUP_POWERSHELL,['-NoLogo','-NoProfile','-NonInteractive','-File',file,...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('runtime-setup-timeout'));},20000);child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{output+=chunk;if(output.length>65536){child.kill();reject(new Error('runtime-setup-output'));}});child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(new Error('runtime-setup-process'));});child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(new Error('runtime-setup-process'));else{try{resolve(JSON.parse(output));}catch{reject(new Error('runtime-setup-response'));}}});
  });
}
export async function prepareRuntime({repositoryRoot=path.resolve(HERE,'../../../../..'),recordedAt=new Date().toISOString(),installTrust=true}={}){
  const protection=new WindowsProtection(),runtimeRoot='H:/PTI-OnePiece/runtime',privateRoot=runtimeRoot+'/private';
  await protection.secureDirectory(runtimeRoot);await protection.secureDirectory(privateRoot);
  const configurationPath=privateRoot+'/config.json';
  if(await exists(configurationPath)){
    const existing=await loadRuntimeConfig(configurationPath);
    const trust=installTrust?await runPowerShellFile(path.resolve(HERE,'../../scripts/install-household-ca.ps1'),['-CertificatePath',existing.caddy.rootCertificatePath]):{installed:false,reason:'not-requested'};
    await loadRuntimeSecret(existing,'proxySecret',{protection});
    await atomicJson(privateRoot+'/setup-proof.json',{recordedAt:new Date().toISOString(),dpapiCurrentUserRoundtrip:true,privateDirectoriesSecured:true,ca:trust,windowsPasswordStored:false,firewallChanged:false,preLoginVerified:false,rebootVerified:false});
    return existing;
  }
  const firebaseSource=await readFile(path.join(repositoryRoot,'pti-app/src/app/app.config.ts'),'utf8');
  const firebaseApiKey=/apiKey:\s*"([^"]+)"/.exec(firebaseSource)?.[1];
  const nodeExecutable=process.execPath;
  const pythonExecutable='C:/Users/Sachit Tewary/AppData/Local/Programs/Python/Python312/python.exe';
  const config=createNewRuntimeConfig({version:1,repositoryRoot,runtimeRoot,privateRoot,dataRoot:runtimeRoot+'/data',cacheRoot:runtimeRoot+'/media',cacheAccountingRoots:['H:/PTI-OnePiece/production-media','H:/PTI-OnePiece/pilot/jellyfin/cache',runtimeRoot+'/jellyfin'],progressRoot:runtimeRoot+'/data/progress',viewerCredentialsRoot:privateRoot+'/viewers',ownerBindingPath:privateRoot+'/family-binding.json',proxySecretPath:privateRoot+'/proxy-secret.dpapi',jellyfinTokenPath:privateRoot+'/jellyfin-token.dpapi',jellyfinCredentialsPath:privateRoot+'/jellyfin-admin.dpapi',setupChallengePath:privateRoot+'/setup-challenge.dpapi',statePath:privateRoot+'/supervisor-state.json',
    catalogPath:path.join(repositoryRoot,'docs/one-piece/evidence/sources/catalog.json'),serverEntry:path.join(repositoryRoot,'apps/one-piece/companion/src/server.mjs'),nodeExecutable,pythonExecutable,
    firebaseProjectId:'pti-app-2ab59',firebaseApiKey,allowedOrigins:['https://pti-app-2ab59.web.app','https://onepiece.local:8443','https://192.168.68.105:8443'],controlsOrigin:'https://onepiece.local:8443',fallbackControlsOrigin:'https://192.168.68.105:8443',mediaOrigin:'https://onepiece.local:8443',castMediaOrigin:'http://onepiece.local:18099',backendHost:'127.0.0.1',backendPort:18098,httpMediaHost:'192.168.68.105',httpMediaPort:18099,allowHttpMedia:true,consent:{hybridMediaAccepted:true,householdCaAccepted:true,recordedAt,source:'Owner explicitly approved trusted local HTTPS controls and home-LAN HTTP Cast media; public household CA installation approved'},
    mdns:{hostname:'onepiece.local',address:'192.168.68.105',subnet:'192.168.68.0/24',interfaceAlias:'Ethernet',toolsPath:'H:/PTI-OnePiece/pilot/tools/python'},
    caddy:{executable:'H:/PTI-OnePiece/pilot/network/runtime/caddy.exe',binarySha256:CADDY_SHA256,storageRoot:'H:/PTI-OnePiece/pilot/network/private-ca-pilot/storage',rootCertificatePath:'H:/PTI-OnePiece/pilot/network/private-ca-pilot/storage/pki/authorities/local/root.crt',caSha256:HOUSEHOLD_CA_SHA256,configurationPath:privateRoot+'/Caddyfile',publicCertificatePath:runtimeRoot+'/public/household-ca.crt'},
    jellyfin:{origin:'http://127.0.0.1:18097',runtimeRoot:runtimeRoot+'/jellyfin',binaryDir:'H:/PTI-OnePiece/pilot/jellyfin/runtime/jellyfin'},startup:{mode:'current-user-logon',preLoginVerified:false,rebootVerified:false}});
  for(const directory of [config.dataRoot,config.cacheRoot,config.progressRoot,config.viewerCredentialsRoot,path.dirname(config.caddy.publicCertificatePath)])await protection.secureDirectory(directory);
  const binaryHash=createHash('sha256').update(await readFile(config.caddy.executable)).digest('hex').toUpperCase();if(binaryHash!==CADDY_SHA256)throw new Error('runtime-caddy-provenance');
  const rootPem=await readFile(config.caddy.rootCertificatePath,'utf8');const {X509Certificate}=await import('node:crypto');
  if(new X509Certificate(rootPem).fingerprint256.replaceAll(':','').toUpperCase()!==HOUSEHOLD_CA_SHA256)throw new Error('runtime-ca-fingerprint');
  await writeFile(config.caddy.publicCertificatePath,rootPem,{mode:0o600}); // Public certificate only; never copy a private key.
  const proxySecret=randomBytes(32).toString('base64url');
  await saveRuntimeSecret(config,'proxySecret',proxySecret,{protection});
  await saveRuntimeSecret(config,'jellyfinCredentials',JSON.stringify({username:'pti-onepiece-private-runtime',password:randomBytes(32).toString('base64url')}),{protection});
  const roundtrip=await loadRuntimeSecret(config,'proxySecret',{protection});if(roundtrip!==proxySecret)throw new Error('runtime-dpapi-identity');
  await writeFile(config.caddy.configurationPath,renderCaddyConfig(config,proxySecret),{mode:0o600});
  const descriptor=dedicatedEngineDescriptor({runtimeRoot:config.jellyfin.runtimeRoot,binaryDir:config.jellyfin.binaryDir,port:18097});
  for(const directory of Object.values(descriptor.directories))await protection.secureDirectory(directory);
  if(!await exists(descriptor.networkConfigPath))await writeFile(descriptor.networkConfigPath,descriptor.networkXml,{mode:0o600});
  await atomicJson(configurationPath,config);
  const trust=installTrust?await runPowerShellFile(path.resolve(HERE,'../../scripts/install-household-ca.ps1'),['-CertificatePath',config.caddy.rootCertificatePath]):{installed:false,reason:'not-requested'};
  await atomicJson(privateRoot+'/setup-proof.json',{recordedAt:new Date().toISOString(),dpapiCurrentUserRoundtrip:true,privateDirectoriesSecured:true,ca:trust,windowsPasswordStored:false,firewallChanged:false,preLoginVerified:false,rebootVerified:false});
  return config;
}
export function renderCaddyConfig(config,proxySecret){
  if(!/^[A-Za-z0-9_-]{43,128}$/.test(proxySecret))throw new Error('runtime-proxy-secret');
  return `{
  admin off
  persist_config off
  skip_install_trust
  auto_https disable_redirects
  storage file_system ${config.caddy.storageRoot.replaceAll('\\','/')}
  servers {
    protocols h1 h2
  }
}
https://onepiece.local:8443, https://192.168.68.105:8443 {
  bind 192.168.68.105
  tls internal
  @runtimehealth path /runtime-health
  respond @runtimehealth "{\\"service\\":\\"one-piece-local-https\\",\\"status\\":\\"up\\"}" 200
  reverse_proxy 127.0.0.1:18098 {
    header_up X-OnePiece-Proxy ${proxySecret}
    header_up X-Forwarded-Proto https
  }
}
`;
}
const HEADER='MediaBrowser Client="PTI One Piece", Device="Always-on PC", DeviceId="pti-onepiece-runtime", Version="1.0"';
async function engineRequest(config,route,{method='GET',body,token}={}){
  const response=await fetch(config.jellyfin.origin+route,{method,headers:{Authorization:HEADER+(token?`, Token="${token}"`:''),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  if(!response.ok){const error=new Error('runtime-engine-request');error.status=response.status;error.operation=route.split('?')[0];throw error;}const text=await response.text();if(text.length>2*1024*1024)throw new Error('runtime-engine-response');return text?JSON.parse(text):null;
}
export async function ensureJellyfinAccount(config){
  const info=await engineRequest(config,'/System/Info/Public');
  const credentials=JSON.parse(await loadRuntimeSecret(config,'jellyfinCredentials'));
  if(info.StartupWizardCompleted===false){
    await engineRequest(config,'/Startup/FirstUser');
    await engineRequest(config,'/Startup/User',{method:'POST',body:{Name:credentials.username,Password:credentials.password}});
    await engineRequest(config,'/Startup/RemoteAccess',{method:'POST',body:{EnableRemoteAccess:false,EnableAutomaticPortMapping:false}});
    await engineRequest(config,'/Startup/Complete',{method:'POST',body:{}});
  }
  const result=await engineRequest(config,'/Users/AuthenticateByName',{method:'POST',body:{Username:credentials.username,Pw:credentials.password}});
  if(typeof result?.AccessToken!=='string'||!result.AccessToken)throw new Error('runtime-engine-auth');
  await saveRuntimeSecret(config,'jellyfinToken',result.AccessToken);
  const tasks=await engineRequest(config,'/ScheduledTasks',{token:result.AccessToken});
  for(const task of tasks)await engineRequest(config,`/ScheduledTasks/${encodeURIComponent(task.Id)}/Triggers`,{method:'POST',body:[],token:result.AccessToken});
  return {authenticated:true,scheduledTasksDisabled:tasks.length};
}
