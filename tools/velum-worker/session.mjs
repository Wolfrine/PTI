// Dedicated device identity. No owner login, browser token or monitor credential.
import {readFile,writeFile,rename,mkdir,unlink} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
export const PROJECT='pti-app-2ab59', OWNER_UID='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
export const CONFIG={apiKey:'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',authDomain:'pti-app-2ab59.firebaseapp.com',projectId:PROJECT,appId:'1:185802494856:web:5e9777771492528c6e203d'};
const HERE=path.dirname(fileURLToPath(import.meta.url));
export const GRANT_TTL=86400000;
export function secureDirectory(directory){
 execFileSync('icacls',[directory,'/inheritance:r','/grant:r',`${execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim()}:(OI)(CI)F`,'SYSTEM:(OI)(CI)F'],{windowsHide:true,stdio:'ignore'});
}
export function protect(value,mode){
 return new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(HERE,'protect-device.ps1'),mode],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('device-protection-unavailable'));},15000);
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>100000){child.kill();}});
  child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(new Error('device-protection-unavailable'));});
  child.on('close',code=>{clearTimeout(timer);code===0?resolve(output.trim()):reject(new Error('device-protection-unavailable'));});
  child.stdin.on('error',()=>{});child.stdin.end(value);
 });
}
export class DeviceStore {
 constructor(file,{crypt=protect,secure=secureDirectory}={}){this.file=file;this.crypt=crypt;this.secure=secure;}
 async load(){
  let sealed;try{sealed=await readFile(this.file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}
  const value=JSON.parse(await this.crypt(sealed,'Unprotect'));
  if(value.version!==2||!validUid(value.uid)||typeof value.refreshToken!=='string'||value.refreshToken.length<20||!/^[a-f0-9]{64}$/.test(value.grant||''))throw new Error('invalid-device-store');
  return value;
 }
 async save(value){
  await mkdir(path.dirname(this.file),{recursive:true});this.secure(path.dirname(this.file));
  const temporary=`${this.file}.${randomUUID()}.tmp`;
  try{await writeFile(temporary,await this.crypt(JSON.stringify(value),'Protect'),{flag:'wx',mode:0o600});await rename(temporary,this.file);}
  finally{await unlink(temporary).catch(()=>{});}
 }
}
const validUid=uid=>typeof uid==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(uid)&&uid!==OWNER_UID;
function session(value,uid){
 const seconds=Number(value.expires_in??value.expiresIn),actual=value.user_id??value.localId;
 if(!validUid(actual)||(uid&&actual!==uid)||(value.project_id&&!([PROJECT,'185802494856'].includes(String(value.project_id))))||!Number.isFinite(seconds)||seconds<60||seconds>7200)throw new Error('device-identity-mismatch');
 const idToken=value.id_token??value.idToken,refreshToken=value.refresh_token??value.refreshToken;
 if(typeof idToken!=='string'||idToken.length<20||typeof refreshToken!=='string'||refreshToken.length<20)throw new Error('invalid-device-session');
 // These claims come from the TLS-authenticated Firebase Auth response, never
 // from an owner/browser-supplied token. Reject cross-project/provider identities.
 let claims;try{claims=JSON.parse(Buffer.from(idToken.split('.')[1],'base64url').toString());}catch{throw new Error('device-identity-mismatch');}
 if(claims.aud!==PROJECT||claims.iss!==`https://securetoken.google.com/${PROJECT}`||claims.sub!==actual||claims.firebase?.sign_in_provider!=='anonymous')throw new Error('device-identity-mismatch');
 return {uid:actual,idToken,refreshToken,expiresAt:Date.now()+seconds*1000};
}
async function authRequest(url,body,fetchImpl){
 const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok){await response.body?.cancel();throw new Error(response.status===400?'device-auth-not-enabled-or-invalid':'device-auth-unavailable');}
 return response.json();
}
export async function createDevice(fetchImpl=fetch){
 return session(await authRequest(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${CONFIG.apiKey}`,{returnSecureToken:true},fetchImpl));
}
export async function refreshSession(refreshToken,uid,fetchImpl=fetch){
 if(!validUid(uid)||typeof refreshToken!=='string'||refreshToken.length<20||refreshToken.length>16384)throw new Error('invalid-device-session');
 const response=await fetchImpl(`https://securetoken.googleapis.com/v1/token?key=${CONFIG.apiKey}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken}),redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok){await response.body?.cancel();throw new Error('device-auth-unavailable');}
 return session(await response.json(),uid);
}
export async function restoreDevice(store,{create=createDevice,refresh=refreshSession}={}){
 let saved=await store.load();
 const current=saved?await refresh(saved.refreshToken,saved.uid):await create();
 saved={version:2,uid:current.uid,refreshToken:current.refreshToken,grant:saved?.grant||randomBytes(32).toString('hex'),createdAt:saved?.createdAt||Date.now(),grantCreatedAt:saved?.grantCreatedAt||Date.now()};
 // Refresh rotation is committed before returning an authenticated session.
 await store.save(saved);return {...current,saved};
}
export function enrollment(saved){
 return {deviceUid:saved.uid,label:'Owner Windows PC',grantHash:createHash('sha256').update(saved.grant).digest('hex'),createdAt:saved.grantCreatedAt,expiresAt:saved.grantCreatedAt+GRANT_TTL,status:'pending'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const store=new DeviceStore(path.join(HERE,'.runtime','device.dpapi'));
 try{const value=await restoreDevice(store);console.log(JSON.stringify({deviceUid:value.uid,persisted:true,protection:'Windows DPAPI CurrentUser'}));}
 catch(error){console.error(['device-auth-not-enabled-or-invalid','device-auth-unavailable','device-protection-unavailable'].includes(error.message)?error.message:'device-identity-unavailable');process.exitCode=1;}
}
