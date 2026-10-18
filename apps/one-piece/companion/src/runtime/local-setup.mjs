import {readFile,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {loadRuntimeSecret} from './config.mjs';
async function current(config){
  const challenge=JSON.parse(await loadRuntimeSecret(config,'setupChallenge'));
  const state=JSON.parse(await readFile(config.statePath,'utf8'));
  if(typeof challenge.code!=='string'||!Number.isFinite(challenge.expiresAt)||challenge.expiresAt<=Date.now()||challenge.backendPid!==state.processes.backend.pid)throw new Error('local-setup-expired');
  return challenge;
}
export async function requestLocalSetup(config){
  try{await lstat(config.ownerBindingPath);throw new Error('runtime-already-paired');}catch(error){if(error.code!=='ENOENT')throw error;}
  const requestPath=path.join(config.privateRoot,'setup.request');
  try{const stat=await lstat(requestPath);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('runtime-local-request');}catch(error){if(error.code!=='ENOENT')throw error;}
  await writeFile(requestPath,'renew',{mode:0o600});return{requested:true};
}
export async function localSetupChallenge(config,{renewIfExpired=true}={}){
  try{return await current(config);}catch(error){if(!renewIfExpired)throw error;}
  await requestLocalSetup(config);
  for(let attempt=0;attempt<32;attempt++){
    await new Promise(resolve=>setTimeout(resolve,250));
    try{return await current(config);}catch{}
  }
  throw new Error('runtime-local-setup-unavailable');
}
