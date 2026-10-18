import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,copyFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WindowsProtection} from '../dpapi.mjs';
import {atomicJson} from '../progress.mjs';
import {loadRuntimeConfig,validateRuntimeConfig} from './config.mjs';
const execute=promisify(execFile);
export const PINNED_NODE_PATH='H:/PTI-OnePiece/tools/node/node.exe';
export const PINNED_NODE_SHA256='3602F2BB1A10F2CBAB4C36886218A33C1AB3DB87290E73B033C46C77147D0237';
const SIGNATURE_SCRIPT=String.raw`$ErrorActionPreference='Stop';try{Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -Force;$nodeFile=[Console]::In.ReadToEnd();$s=Get-AuthenticodeSignature -LiteralPath $nodeFile;[ordered]@{status=[string]$s.Status;signer=$s.SignerCertificate.Subject;timestampSigner=$s.TimeStamperCertificate.Subject}|ConvertTo-Json -Compress}catch{[ordered]@{status='inspection-failed';reason=[string]$_.FullyQualifiedErrorId}|ConvertTo-Json -Compress}`;
export async function signedBinary(file){return new Promise((resolve,reject)=>{
 const child=spawn(path.win32.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(SIGNATURE_SCRIPT,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let text='';const timer=setTimeout(()=>{child.kill();reject(new Error('runtime-signature-timeout'));},10000);child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{text+=chunk;if(text.length>16000)child.kill();});child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(new Error('runtime-signature'));});child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw new Error();resolve(JSON.parse(text));}catch{reject(new Error('runtime-signature'));}});child.stdin.end(file);
});}
export async function pinNodeRuntime({configPath='H:/PTI-OnePiece/runtime/private/config.json',source='C:/Users/Sachit Tewary/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe',replaceExisting=false}={}){
 const config=await loadRuntimeConfig(configPath),protection=new WindowsProtection();
 const hash=buffer=>createHash('sha256').update(buffer).digest('hex').toUpperCase();
 if(hash(await readFile(source))!==PINNED_NODE_SHA256)throw new Error('runtime-node-source-hash');
 const signature=await signedBinary(source);if(signature.status!=='Valid'||!signature.signer?.includes('OpenJS Foundation'))throw new Error('runtime-node-signature');
 await protection.secureDirectory(path.dirname(PINNED_NODE_PATH));
 let existing=false;try{await access(PINNED_NODE_PATH);existing=true;}catch{}
 if(existing){
  const previousHash=hash(await readFile(PINNED_NODE_PATH));
  if(previousHash!==PINNED_NODE_SHA256){
   if(!replaceExisting||previousHash!=='11DFD8204BF09A95574AE69C524792F47BC61C693A53CCA8A0185F831130740F')throw new Error('runtime-node-existing-hash');
   const state=JSON.parse(await readFile(config.statePath,'utf8'));let active=false;try{process.kill(state.supervisorPid,0);active=true;}catch(error){if(error.code!=='ESRCH')throw error;}
   if(active)throw new Error('runtime-stop-before-node-replacement');
   await copyFile(source,PINNED_NODE_PATH);
  }
 }else await copyFile(source,PINNED_NODE_PATH);
 if(hash(await readFile(PINNED_NODE_PATH))!==PINNED_NODE_SHA256)throw new Error('runtime-node-copy-hash');
 const copiedSignature=await signedBinary(PINNED_NODE_PATH);if(copiedSignature.status!=='Valid')throw new Error('runtime-node-copy-signature');
 const version=(await execute(PINNED_NODE_PATH,['--version'],{windowsHide:true,timeout:5000})).stdout.trim();
 const launcherPath=path.join(config.runtimeRoot,'launch-current.mjs');
 await copyFile(fileURLToPath(new URL('./launcher.mjs',import.meta.url)),launcherPath);
 const updated=validateRuntimeConfig({...config,nodeExecutable:PINNED_NODE_PATH,launcherPath});delete updated.configPath;
 await atomicJson(configPath,updated);
 const proof={recordedAt:new Date().toISOString(),path:PINNED_NODE_PATH,version,sha256:PINNED_NODE_SHA256,signature:copiedSignature,sourceVerified:true,copyVerified:true,launcherPath,windowsPasswordStored:false};
 await atomicJson(path.join(config.privateRoot,'node-runtime-proof.json'),proof);return proof;
}
