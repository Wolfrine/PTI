import path from 'node:path';
import { readFile,lstat,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { WindowsProtection } from '../dpapi.mjs';
import { atomicJson } from '../progress.mjs';

const MANAGED='H:\\PTI-OnePiece';
export const HOUSEHOLD_CA_SHA256='307F6A88C652E429513F47B386F761249F52A30D6FE93B91ECE7501C3C640489';
export const CADDY_SHA256='4B709838F21C4A641DF02D4561E2243C100B862011444EBABB1517AC88C11243';
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
export function managedPath(value){
  if(typeof value!=='string'||!path.win32.isAbsolute(value)||/[\x00-\x1f]/.test(value))fail('runtime-path');
  const resolved=path.win32.normalize(value),relative=path.win32.relative(MANAGED,resolved);
  if(!relative||relative.startsWith('..')||path.win32.isAbsolute(relative))fail('runtime-path');
  return resolved;
}
function origin(value,expected){let parsed;try{parsed=new URL(value);}catch{fail('runtime-origin');}if(parsed.origin!==value||parsed.origin!==expected||parsed.username||parsed.password)fail('runtime-origin');return value;}
export function validateRuntimeConfig(input){
  if(!input||input.version!==1||input.backendHost!=='127.0.0.1'||input.backendPort!==18098||input.httpMediaHost!=='192.168.68.105'||input.httpMediaPort!==18099)fail('runtime-network');
  const value=structuredClone(input);
  for(const key of ['runtimeRoot','privateRoot','dataRoot','cacheRoot','progressRoot','viewerCredentialsRoot','ownerBindingPath','proxySecretPath','jellyfinTokenPath','jellyfinCredentialsPath','setupChallengePath','statePath'])value[key]=managedPath(value[key]);
  for(const key of ['proxySecretPath','jellyfinTokenPath','jellyfinCredentialsPath','setupChallengePath','ownerBindingPath','statePath'])if(path.win32.dirname(value[key]).toLowerCase()!==value.privateRoot.toLowerCase())fail('runtime-secret-path');
  if(path.win32.basename(value.ownerBindingPath)!=='family-binding.json')fail('runtime-binding-path');
  if(!Array.isArray(value.cacheAccountingRoots)||value.cacheAccountingRoots.length>10)fail('runtime-accounting');
  value.cacheAccountingRoots=value.cacheAccountingRoots.map(managedPath);
  if(typeof value.repositoryRoot!=='string'||!path.win32.isAbsolute(value.repositoryRoot)||typeof value.catalogPath!=='string'||!path.win32.isAbsolute(value.catalogPath)||!path.win32.isAbsolute(value.serverEntry??''))fail('runtime-repository');
  if(value.firebaseProjectId!=='pti-app-2ab59'||typeof value.firebaseApiKey!=='string'||value.firebaseApiKey.length<20)fail('runtime-firebase');
  origin(value.controlsOrigin,'https://onepiece.local:8443');origin(value.mediaOrigin,value.controlsOrigin);
  origin(value.fallbackControlsOrigin,'https://192.168.68.105:8443');origin(value.castMediaOrigin,'http://onepiece.local:18099');
  if(!Array.isArray(value.allowedOrigins)||value.allowedOrigins.some(x=>!['https://pti-app-2ab59.web.app',value.controlsOrigin,value.fallbackControlsOrigin].includes(x))||!value.allowedOrigins.includes('https://pti-app-2ab59.web.app'))fail('runtime-origin');
  if(value.allowHttpMedia!==true||value.consent?.hybridMediaAccepted!==true||value.consent?.householdCaAccepted!==true||!Number.isFinite(Date.parse(value.consent.recordedAt)))fail('runtime-consent');
  if(value.mdns?.hostname!=='onepiece.local'||value.mdns.address!=='192.168.68.105'||value.mdns.subnet!=='192.168.68.0/24')fail('runtime-mdns');
  value.mdns.toolsPath=managedPath(value.mdns.toolsPath);
  if(value.jellyfin?.origin!=='http://127.0.0.1:18097')fail('runtime-engine');
  value.jellyfin.runtimeRoot=managedPath(value.jellyfin.runtimeRoot);value.jellyfin.binaryDir=managedPath(value.jellyfin.binaryDir);
  if(value.playback!==undefined&&(!value.playback||typeof value.playback!=='object'||Array.isArray(value.playback)
    ||Object.keys(value.playback).some(key=>key!=='mode')||!['compatible-h264','prepared-mp4'].includes(value.playback.mode)))fail('runtime-playback');
  value.playback??={mode:'compatible-h264'};
  if(value.caddy?.binarySha256!==CADDY_SHA256||value.caddy?.caSha256!==HOUSEHOLD_CA_SHA256)fail('runtime-provenance');
  for(const key of ['executable','storageRoot','rootCertificatePath','configurationPath','publicCertificatePath'])value.caddy[key]=managedPath(value.caddy[key]);
  if(!path.win32.isAbsolute(value.nodeExecutable??'')||!path.win32.isAbsolute(value.pythonExecutable??''))fail('runtime-executable');
  value.nodeExecutable=path.win32.normalize(value.nodeExecutable);value.pythonExecutable=path.win32.normalize(value.pythonExecutable);
  return value;
}
export async function loadRuntimeConfig(configPath){
  configPath=managedPath(configPath);const stat=await lstat(configPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)fail('runtime-config');
  return {...validateRuntimeConfig(JSON.parse(await readFile(configPath,'utf8'))),configPath};
}
const entropy=name=>createHash('sha256').update(`pti-one-piece-runtime-v1:${name}`).digest();
const secretPaths={proxySecret:'proxySecretPath',jellyfinToken:'jellyfinTokenPath',jellyfinCredentials:'jellyfinCredentialsPath',setupChallenge:'setupChallengePath'};
export async function saveRuntimeSecret(config,name,plaintext,{protection=new WindowsProtection()}={}){
  if(!secretPaths[name])fail('runtime-secret-kind');const file=managedPath(config[secretPaths[name]]),bytes=Buffer.isBuffer(plaintext)?Buffer.from(plaintext):Buffer.from(plaintext,'utf8');
  await protection.secureDirectory(path.dirname(file));let sealed;
  try{sealed=await protection.protect(bytes,entropy(name));await atomicJson(file,{version:1,name,protected:sealed.toString('base64')});}finally{bytes.fill(0);sealed?.fill(0);}
}
export async function loadRuntimeSecret(config,name,{protection=new WindowsProtection()}={}){
  if(!secretPaths[name])fail('runtime-secret-kind');const file=managedPath(config[secretPaths[name]]),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>131072)fail('runtime-secret');
  const stored=JSON.parse(await readFile(file,'utf8'));if(stored.version!==1||stored.name!==name||typeof stored.protected!=='string'||!/^[A-Za-z0-9+/=]+$/.test(stored.protected))fail('runtime-secret');
  const sealed=Buffer.from(stored.protected,'base64');let plain;
  try{plain=await protection.unprotect(sealed,entropy(name));return plain.toString('utf8');}finally{sealed.fill(0);plain?.fill(0);}
}
export async function loadRuntimeSecrets(config,options={}){
  const [proxySecret,jellyfinToken]=await Promise.all([loadRuntimeSecret(config,'proxySecret',options),loadRuntimeSecret(config,'jellyfinToken',options)]);
  if(!/^[A-Za-z0-9_-]{43,128}$/.test(proxySecret)||!jellyfinToken||jellyfinToken.length>4096)fail('runtime-secret');
  return {proxySecret,jellyfinToken};
}
