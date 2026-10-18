import {spawn} from 'node:child_process';
import {readFile,writeFile,rename,unlink,lstat,open,access} from 'node:fs/promises';
import {createHash,createPrivateKey,X509Certificate} from 'node:crypto';
import {rootCertificates} from 'node:tls';
import path from 'node:path';
import {WindowsProtection} from '../dpapi.mjs';
import {managedPath,validateRuntimeConfig} from './config.mjs';
import {strictTlsHealth} from './supervisor.mjs';

export const LEGO_EXECUTABLE='H:/PTI-OnePiece/tools/lego/5.5.2/lego.exe';
export const LEGO_SHA256='7c94914300222fbee5f3666369b9e6855bd9e18baf2a95fa9a327e6764fd8fc8';
export const CONFIG_PATH='H:/PTI-OnePiece/runtime/private/config.json';
const HOSTNAME='pti-onepiece-home.duckdns.org';
const DAY=86400000;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const digest=value=>createHash('sha256').update(value).digest('hex');
const normalize=value=>path.win32.normalize(value).toLowerCase();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function boundedFile(file,maximum=262144){const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>maximum)fail('public-certificate-file');return readFile(file);}
async function replaceFile(file,bytes){const temporary=file+'.renewing';await writeFile(temporary,bytes,{mode:0o600,flag:'w'});await rename(temporary,file);}

export function certificatePaths(config){
  if(config.tls?.mode!=='public-certificate'||config.tls.hostname!==HOSTNAME)fail('public-certificate-config');
  const root=path.win32.join(config.privateRoot,'public-tls');
  const certificatePath=managedPath(config.tls.certificatePath),privateKeyPath=managedPath(config.tls.privateKeyPath);
  if(normalize(certificatePath)!==normalize(path.win32.join(root,HOSTNAME+'.crt'))||normalize(privateKeyPath)!==normalize(path.win32.join(root,HOSTNAME+'.key')))fail('public-certificate-path');
  return{root,certificatePath,privateKeyPath,tokenPath:path.win32.join(root,'duckdns.dpapi'),acmeRoot:path.win32.join(root,'acme'),journalPath:path.win32.join(root,'deployment.json'),lockPath:path.win32.join(root,'renewal.lock')};
}
export function renewalDue(certificatePem,{now=Date.now(),days=30}={}){
  if(!Number.isFinite(now)||!Number.isInteger(days)||days<1||days>60)fail('public-certificate-time');
  const certificate=new X509Certificate(certificatePem);
  return Date.parse(certificate.validTo)-now<=days*DAY;
}
/** Verify signatures to a bundled public trust root; never trust the household CA. */
export function validateCertificatePair(certificatePem,privateKeyPem,hostname,{now=Date.now(),trustRoots=rootCertificates}={}){
  try{
    const blocks=String(certificatePem).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)??[];
    if(!blocks.length||blocks.length>8)throw new Error();
    const certificates=blocks.map(value=>new X509Certificate(value)),leaf=certificates[0];
    if(leaf.ca||leaf.checkHost(hostname,{subject:'never',wildcards:false})!==hostname||!leaf.checkPrivateKey(createPrivateKey(privateKeyPem)))throw new Error();
    if(leaf.keyUsage&&!leaf.keyUsage.includes('1.3.6.1.5.5.7.3.1'))throw new Error();
    const roots=trustRoots.map(value=>new X509Certificate(value)),trusted=new Set(roots.map(value=>value.fingerprint256));
    const seen=new Set();let current=leaf;
    for(let depth=0;depth<10;depth++){
      if(Date.parse(current.validFrom)>now||Date.parse(current.validTo)<=now||seen.has(current.fingerprint256))throw new Error();
      seen.add(current.fingerprint256);
      if(trusted.has(current.fingerprint256))return{fingerprint:leaf.fingerprint256,expiresAt:new Date(leaf.validTo).toISOString()};
      const issuer=[...certificates.slice(1),...roots].find(candidate=>candidate.ca&&current.checkIssued(candidate)&&current.verify(candidate.publicKey)&&!seen.has(candidate.fingerprint256));
      if(!issuer)throw new Error();current=issuer;
    }
  }catch{}
  fail('public-certificate-validation');
}
export function legoArguments(acmeRoot){return['--log.level','error','run','--path',acmeRoot,'--account-id','pti-onepiece-home','--key-type','RSA2048','--dns','duckdns','--dns.resolvers','1.1.1.1:53','--domains',HOSTNAME,'--accept-tos','--renew-days','30'];}
export async function verifyLego(executable=LEGO_EXECUTABLE){
  const bytes=await boundedFile(executable,160*1024*1024);try{if(digest(bytes)!==LEGO_SHA256)fail('public-certificate-binary');}finally{bytes.fill(0);}
}
async function loadDuckDnsToken(file,protection){
  const record=JSON.parse(await boundedFile(file,131072));
  if(record.version!==1||record.provider!=='duckdns'||typeof record.protected!=='string'||!/^[A-Za-z0-9+/=]+$/.test(record.protected))fail('public-certificate-token');
  const sealed=Buffer.from(record.protected,'base64');let plain;
  try{plain=await protection.unprotect(sealed,createHash('sha256').update('pti-one-piece-duckdns-v1').digest());const token=plain.toString('utf8');if(!/^[a-f0-9-]{32,64}$/i.test(token))fail('public-certificate-token');return token;}finally{sealed.fill(0);plain?.fill(0);}
}
export async function runLego(acmeRoot,token,{spawnImpl=spawn}={}){
  // Inherit no caller-controlled LEGO_* overrides, hooks, accounts or proxy settings.
  const env={};for(const key of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','PATH'])if(process.env[key])env[key]=process.env[key];env.DUCKDNS_TOKEN=token;
  try{await new Promise((resolve,reject)=>{
    const child=spawnImpl(LEGO_EXECUTABLE,legoArguments(acmeRoot),{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],env});
    let settled=false;const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
    const timer=setTimeout(()=>{child.kill();finish(new Error('public-certificate-provider-timeout'));},15*60*1000);
    child.stdout?.on('data',chunk=>chunk.fill(0));child.stderr?.on('data',chunk=>chunk.fill(0));
    child.on('error',()=>finish(new Error('public-certificate-provider-failed')));child.on('close',code=>finish(code===0?undefined:new Error('public-certificate-provider-failed')));
  });}finally{delete env.DUCKDNS_TOKEN;}
}

export function ownsCaddy(config,state,processes){
  if(state.stoppedAt||!Number.isSafeInteger(state.supervisorPid)||!Number.isSafeInteger(state.processes?.caddy?.pid))return false;
  const supervisor=processes.find(value=>value.pid===state.supervisorPid),caddy=processes.find(value=>value.pid===state.processes.caddy.pid);
  const sameArguments=(actual,expected)=>Array.isArray(actual)&&actual.length===expected.length&&actual.every((value,index)=>normalize(String(value))===normalize(expected[index]));
  return !!(supervisor&&caddy&&caddy.parentPid===supervisor.pid&&normalize(supervisor.executable)===normalize(config.nodeExecutable)&&normalize(caddy.executable)===normalize(config.caddy.executable)
    &&sameArguments(supervisor.arguments,[config.nodeExecutable,path.win32.join(path.win32.dirname(config.serverEntry),'runtime','supervisor.mjs'),'--config',config.configPath])
    &&sameArguments(caddy.arguments,[config.caddy.executable,'run','--config',config.caddy.configurationPath,'--adapter','caddyfile']));
}
const PROCESS_SCRIPT=String.raw`
$ErrorActionPreference='Stop'
try {
 Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class OpArgs { [DllImport("shell32.dll", SetLastError=true)] public static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)] string s,out int n); [DllImport("kernel32.dll")] public static extern IntPtr LocalFree(IntPtr p); public static string[] Parse(string s) { int n; IntPtr p=CommandLineToArgvW(s,out n); if(p==IntPtr.Zero)throw new Exception(); try { string[] a=new string[n]; for(int i=0;i<n;i++) a[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(p,i*IntPtr.Size)); return a; }finally{LocalFree(p);} } }'
 $request=[Console]::In.ReadToEnd()|ConvertFrom-Json
 $state=Get-Content -LiteralPath $request.statePath -Raw|ConvertFrom-Json
 if($state.stoppedAt -or (Test-Path -LiteralPath $request.stopPath)){[Console]::Out.Write('{"active":false}');exit 0}
 if($state.supervisorPid -ne $request.supervisorPid -or $state.processes.caddy.pid -ne $request.pid){throw 'state-changed'}
 $records=@(Get-CimInstance Win32_Process|Where-Object {$_.ProcessId -in @($request.pid,$request.supervisorPid)}|ForEach-Object { @{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;executable=$_.ExecutablePath;arguments=[OpArgs]::Parse($_.CommandLine)} })
 if($request.stop){
   $child=$records|Where-Object pid -eq $request.pid;$parent=$records|Where-Object pid -eq $request.supervisorPid
   if(-not $child -or -not $parent){throw 'identity'}
   if($child.parentPid -ne $parent.pid -or $child.executable -ne $request.executable -or $parent.executable -ne $request.nodeExecutable){throw 'identity'}
   if(($child.arguments|ConvertTo-Json -Compress) -ne ($request.childArguments|ConvertTo-Json -Compress) -or ($parent.arguments|ConvertTo-Json -Compress) -ne ($request.parentArguments|ConvertTo-Json -Compress)){throw 'arguments'}
   Stop-Process -Id $child.pid -Force -ErrorAction Stop
 }
 [Console]::Out.Write((@{active=$true;processes=$records}|ConvertTo-Json -Depth 6 -Compress))
}catch{[Console]::Error.Write('public-certificate-process-check-failed');exit 1}
`;
async function processRequest(request){return new Promise((resolve,reject)=>{
  const executable=path.win32.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const child=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(PROCESS_SCRIPT,'utf16le').toString('base64')],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  let output='',settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{child.kill();finish(new Error('public-certificate-process-check-failed'));},15000);
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{output+=chunk;if(output.length>32768){child.kill();finish(new Error('public-certificate-process-check-failed'));}});child.stderr.on('data',chunk=>chunk.fill(0));
  child.on('error',()=>finish(new Error('public-certificate-process-check-failed')));child.stdin.on('error',()=>finish(new Error('public-certificate-process-check-failed')));child.on('close',code=>{try{if(code!==0)throw new Error();finish(null,JSON.parse(output));}catch{finish(new Error('public-certificate-process-check-failed'));}});child.stdin.end(JSON.stringify(request));
});}
export async function restartManagedCaddy(config,{processRequestImpl=processRequest,healthImpl=strictTlsHealth,checkOnly=false}={}){
  try{await access(path.win32.join(config.privateRoot,'stop.request'));return{restarted:false,reason:'runtime-stopped'};}catch(error){if(error.code!=='ENOENT')throw error;}
  const state=JSON.parse(await boundedFile(config.statePath,65536));
  if(state.stoppedAt)return{restarted:false,reason:'runtime-stopped'};
  const request={statePath:config.statePath,stopPath:path.win32.join(config.privateRoot,'stop.request'),supervisorPid:state.supervisorPid,pid:state.processes?.caddy?.pid};
  const response=await processRequestImpl(request);
  if(!response.active)return{restarted:false,reason:'runtime-stopped'};
  if(response.processes.length===0)return{restarted:false,reason:'runtime-stopped'};
  if(!ownsCaddy(config,state,response.processes))fail('public-certificate-process-identity');
  if(checkOnly)return{restarted:false,verified:true,caddyPid:request.pid,supervisorPid:request.supervisorPid};
  const child=response.processes.find(value=>value.pid===request.pid),parent=response.processes.find(value=>value.pid===request.supervisorPid);
  await processRequestImpl({...request,stop:true,executable:config.caddy.executable,nodeExecutable:config.nodeExecutable,childArguments:child.arguments,parentArguments:parent.arguments});
  for(let attempt=0;attempt<60;attempt++){
    await wait(500);const current=JSON.parse(await boundedFile(config.statePath,65536));
    if(current.stoppedAt)return{restarted:false,reason:'runtime-stopped'};
    if(current.supervisorPid===state.supervisorPid&&Number.isSafeInteger(current.processes?.caddy?.pid)&&current.processes.caddy.pid!==request.pid&&await healthImpl(config))return{restarted:true};
  }
  fail('public-certificate-reload-failed');
}
async function readPair(paths){const certificate=await boundedFile(paths.certificatePath);try{return{certificate,key:await boundedFile(paths.privateKeyPath)};}catch(error){certificate.fill(0);throw error;}}
function clearPair(pair){pair?.certificate.fill(0);pair?.key.fill(0);}
async function recoverPair(paths){
  let record;try{record=JSON.parse(await boundedFile(paths.journalPath,4096));}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(record.version!==1||!/^[a-f0-9]{64}$/.test(record.certificateHash??'')||!/^[a-f0-9]{64}$/.test(record.keyHash??''))fail('public-certificate-journal');
  const old=await readPair({certificatePath:paths.certificatePath+'.previous',privateKeyPath:paths.privateKeyPath+'.previous'});
  try{if(digest(old.certificate)!==record.certificateHash||digest(old.key)!==record.keyHash)fail('public-certificate-journal');await replaceFile(paths.certificatePath,old.certificate);await replaceFile(paths.privateKeyPath,old.key);await unlink(paths.journalPath);}finally{clearPair(old);}
}
export async function deployPair(paths,next,{validateImpl=validateCertificatePair,restartImpl=async()=>({restarted:false})}={}){
  const metadata=validateImpl(next.certificate,next.key,HOSTNAME),old=await readPair(paths);
  try{
    if(digest(next.certificate)===digest(old.certificate)&&digest(next.key)===digest(old.key))return{changed:false,...metadata};
    await replaceFile(paths.certificatePath+'.previous',old.certificate);await replaceFile(paths.privateKeyPath+'.previous',old.key);
    await replaceFile(paths.journalPath,JSON.stringify({version:1,certificateHash:digest(old.certificate),keyHash:digest(old.key)}));
    try{
      await replaceFile(paths.certificatePath,next.certificate);await replaceFile(paths.privateKeyPath,next.key);
      const reload=await restartImpl();await unlink(paths.journalPath);return{changed:true,...metadata,...reload};
    }catch(error){await recoverPair(paths);try{await restartImpl();}catch{}throw error;}
  }finally{clearPair(old);}
}
export async function renewPublicCertificate(config,{checkOnly=false,clock=()=>Date.now(),protection,verifyLegoImpl=verifyLego,runLegoImpl=runLego,restartImpl=restartManagedCaddy,pathsImpl=certificatePaths,validateImpl=validateCertificatePair}={}){
  const paths=pathsImpl(config);await verifyLegoImpl();
  let pending=false;try{await access(paths.journalPath);pending=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!pending||checkOnly){const pair=await readPair(paths);try{
    const due=renewalDue(pair.certificate,{now:clock()});
    if(checkOnly||!due)return{...(checkOnly?{checkOnly:true}:{}),changed:false,due,...validateImpl(pair.certificate,pair.key,HOSTNAME,{now:clock()})};
  }finally{clearPair(pair);}}
  const protectionImpl=protection??new WindowsProtection();await protectionImpl.secureDirectory(paths.root);
  let lock;for(let attempt=0;attempt<2;attempt++)try{lock=await open(paths.lockPath,'wx',0o600);break;}catch(error){
    if(error.code!=='EEXIST')throw error;
    const previous=JSON.parse(await boundedFile(paths.lockPath,1024));if(!Number.isSafeInteger(previous.pid)||previous.pid<1)fail('public-certificate-lock');
    try{process.kill(previous.pid,0);fail('public-certificate-renewal-already-running');}catch(probe){if(probe.code!=='ESRCH')throw probe;}
    await unlink(paths.lockPath);
  }
  if(!lock)fail('public-certificate-renewal-already-running');
  try{
    await lock.writeFile(JSON.stringify({pid:process.pid}));await lock.close();lock=null;await recoverPair(paths);
    const current=await readPair(paths);let due;try{due=renewalDue(current.certificate,{now:clock()});if(!due)return{changed:false,due:false,...validateImpl(current.certificate,current.key,HOSTNAME,{now:clock()})};}finally{clearPair(current);}
    await protectionImpl.secureDirectory(paths.acmeRoot);let token=await loadDuckDnsToken(paths.tokenPath,protectionImpl);
    try{await runLegoImpl(paths.acmeRoot,token);}finally{token=null;}
    const next=await readPair({certificatePath:path.win32.join(paths.acmeRoot,'certificates',HOSTNAME+'.crt'),privateKeyPath:path.win32.join(paths.acmeRoot,'certificates',HOSTNAME+'.key')});
    try{return{due:true,...await deployPair(paths,next,{validateImpl:(certificate,key,host)=>validateImpl(certificate,key,host,{now:clock()}),restartImpl:()=>restartImpl(config)})};}finally{clearPair(next);}
  }finally{await lock?.close().catch(()=>{});await unlink(paths.lockPath).catch(()=>{});}
}
export async function loadRenewalConfig(configPath=CONFIG_PATH){
  if(normalize(configPath)!==normalize(CONFIG_PATH))fail('public-certificate-config');
  return{...validateRuntimeConfig(JSON.parse(await boundedFile(configPath,65536))),configPath:managedPath(configPath)};
}
