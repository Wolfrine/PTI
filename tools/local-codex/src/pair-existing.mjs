// Explicit setup option for an owner who is remote and has already paired PTI on
// this Windows account. No browser storage, Codex token, API key or plaintext file.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {WindowsProtection} from '../../codex-usage-monitor/src/dpapi.mjs';
import {OWNER,FIREBASE,refresh,saveCredential} from './credentials.mjs';
import {health} from './common.mjs';
if(!process.argv.includes('--reuse-pti-signin'))throw Error('Existing PTI sign-in reuse must be requested explicitly.');
if(health().authMode!=='chatgpt')throw Error('Sign into Codex with ChatGPT first.');
const directory='F:/Workspace/Support/PTI/codex-usage-monitor/data';
if(fs.realpathSync.native(directory).toLowerCase()!==path.win32.normalize(directory).toLowerCase())throw Error('Unexpected PTI credential directory.');
const envelope=JSON.parse(fs.readFileSync(path.join(directory,'credential.json'),'utf8'));
if(envelope.version!==1||envelope.protection!=='windows-dpapi-current-user')throw Error('Existing PTI sign-in is unavailable.');
const entropy=createHash('sha256').update(`pti-codex-usage-v1:${FIREBASE.projectId}:${OWNER}`).digest();
const clear=await new WindowsProtection().unprotect(Buffer.from(envelope.ciphertext,'base64'),entropy);
try{
  const value=JSON.parse(clear.toString('utf8'));
  if(value.uid!==OWNER||value.projectId!==FIREBASE.projectId)throw Error('Wrong PTI account.');
  const session=await refresh(value.refreshToken);await saveCredential(session.refreshToken);
}finally{clear.fill(0);}
console.log('Local Codex worker paired from the existing encrypted PTI owner sign-in. No credential was printed or written in plaintext.');
