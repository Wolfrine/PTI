import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {WindowsProtection} from '../../codex-usage-monitor/src/dpapi.mjs';
import {home,write,read} from './common.mjs';
export const OWNER='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
export const FIREBASE={apiKey:'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',authDomain:'pti-app-2ab59.firebaseapp.com',projectId:'pti-app-2ab59',appId:'1:185802494856:web:5e9777771492528c6e203d'};
const entropy=createHash('sha256').update(`local-codex-v1:${OWNER}`).digest();
const directory=path.join(home,'data'),file=path.join(directory,'credential.json');
const protection=new WindowsProtection();
export async function saveCredential(refreshToken){
  await protection.secureDirectory(directory);
  const clear=Buffer.from(JSON.stringify({uid:OWNER,refreshToken}));let encrypted;
  try{encrypted=await protection.protect(clear,entropy);write(file,{version:1,ciphertext:encrypted.toString('base64')});}
  finally{clear.fill(0);encrypted?.fill(0);}
}
export async function loadCredential(){
  if(!fs.existsSync(file))throw Error('Pair this worker to the PTI owner account first.');
  const envelope=read(file);if(envelope.version!==1)throw Error('Invalid protected credential.');
  const clear=await protection.unprotect(Buffer.from(envelope.ciphertext,'base64'),entropy);
  try{const value=JSON.parse(clear.toString());if(value.uid!==OWNER)throw Error('Wrong account.');return value.refreshToken;}finally{clear.fill(0);}
}
export async function refresh(refreshToken){
  const response=await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE.apiKey}`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken}),signal:AbortSignal.timeout(15000)});
  if(!response.ok){await response.body?.cancel();throw Error('PTI sign-in needs reconnecting.');}
  const value=await response.json();if(value.user_id!==OWNER||![FIREBASE.projectId,'185802494856'].includes(String(value.project_id))||!value.id_token||!value.refresh_token)throw Error('PTI account mismatch.');
  return {idToken:value.id_token,refreshToken:value.refresh_token};
}
