import * as admin from 'firebase-admin';
import {onRequest} from 'firebase-functions/v2/https';
import {GoogleAuth, OAuth2Client} from 'google-auth-library';
import {createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual} from 'node:crypto';
import type {Request, Response} from 'express';

const PROJECT='pti-app-2ab59';
const RUNTIME_SERVICE_ACCOUNT=`velum-drive-runtime@${PROJECT}.iam.gserviceaccount.com`;
const OWNER='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
const ORIGIN='https://pti-app-2ab59-velum.web.app';
const CALLBACK=ORIGIN+'/api/drive/callback';
const CLIENT='185802494856-rn0q6qi5goj0mifha0bkah55slu3kvju.apps.googleusercontent.com';
// Full consent must belong to a different API project: old browser clients in
// the read project's combined grant must never inherit the management scope.
const MANAGEMENT_CLIENT='542835526747-lj8t3hl7590of1m2l8btojf0ciitkkcc.apps.googleusercontent.com';
const MANAGEMENT_CONFIGURED=/^\d{8,30}-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(MANAGEMENT_CLIENT)
 &&MANAGEMENT_CLIENT.split('-')[0]!==CLIENT.split('-')[0];
const ROOT='_velumDrivePrivate';
const SCOPES=['https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/drive.metadata','https://www.googleapis.com/auth/drive.file'];
const MANAGEMENT_SCOPE='https://www.googleapis.com/auth/drive';
const IDENTITY_REQUEST_SCOPES=['openid','email','profile'];
const BROWSER_REQUEST_SCOPES=[...IDENTITY_REQUEST_SCOPES,...SCOPES];
const OIDC_SCOPES=['openid','email','profile','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile'];
const BROWSER_SCOPES=new Set([...SCOPES,...OIDC_SCOPES]);
const SERVER_SCOPES=new Set([...BROWSER_SCOPES,MANAGEMENT_SCOPE]);
const PRIVATE_FOLDER='1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA';
const REFERENCES_FOLDER='1yDt_5NSv8fDYhZvOdsihdJwKQJuTzx66';
const MOVE_LEASE_MS=2*60*1000;
const COOKIE='__session'; // Firebase Hosting forwards only this cookie to rewritten Functions.
const TTL=10*60*1000;
// Activate after the two exact secrets, fixed redirect, private rules and deployed runtime IAM are verified.
const OFFLINE_ENABLED=true;
const MOVE_REASONS=new Set(['unknown','insufficientPermissions','insufficientFilePermissions',
 'appNotAuthorizedToFile','forbidden','domainPolicy','fieldNotWritable','dailyLimitExceeded',
 'rateLimitExceeded','userRateLimitExceeded','sharingRateLimitExceeded','storageQuotaExceeded',
 'activeItemCreationLimitExceeded','myDriveHierarchyDepthLimitExceeded','numChildrenInNonRootLimitExceeded',
 'teamDriveFileLimitExceeded','teamDriveHierarchyTooDeep','teamDriveMembershipRequired',
 'fileOwnerNotMemberOfTeamDrive','fileWriterTeamDriveMoveInDisabled','teamDrivesFolderMoveInNotSupported',
 'cannotModifyInheritedTeamDrivePermission','downloadRestrictedForRevision','fileNotDownloadable']);
const MOVE_RPC_REASONS=new Set(['unknown','ACCESS_TOKEN_SCOPE_INSUFFICIENT','SERVICE_DISABLED',
 'CONSUMER_INVALID','BILLING_DISABLED','RATE_LIMIT_EXCEEDED','SECURITY_POLICY_VIOLATED',
 'ACCESS_DENIED','API_KEY_INVALID','API_KEY_HTTP_REFERRER_BLOCKED','API_KEY_SERVICE_BLOCKED']);
const MOVE_RPC_STATUSES=new Set(['unknown','PERMISSION_DENIED','RESOURCE_EXHAUSTED','UNAUTHENTICATED']);
const cloud=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
const oidc=new OAuth2Client(CLIENT);
type Purpose='read'|'management';
type Config={clientSecret:string;key:Buffer;clientId:string;purpose:Purpose};
type Envelope={iv:string;tag:string;ciphertext:string};
type Grant={revision:number;googleSub:string;enabled:boolean;clientId?:string;managementReady?:boolean;refresh?:Envelope;pendingHash?:string;pendingUntil?:number;lastStartedAt?:number;revocationUntil?:number};
class DriveError extends Error{constructor(public status:number,public code:string,public checkFailure?:string){super(code);}}
class InvalidGrantError extends DriveError {
 constructor(){super(409,'drive/reconnect-required');}
}
const db=()=>admin.firestore();
const grantRef=(purpose:Purpose='read')=>db().doc(`${ROOT}/${purpose==='management'?'managementConnection':'connection'}`);
const revocations=(purpose:Purpose='read')=>db().collection(`${ROOT}/${purpose==='management'?'managementRevocations':'revocations'}/items`);
const refreshContext=(purpose:Purpose,googleSub:string)=>purpose==='read'?`refresh:${OWNER}:${googleSub}`:`refresh:management:${OWNER}:${googleSub}`;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const same=(a:string,b:string)=>timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
const cachedConfig=new Map<Purpose,{until:number;value:Config}>();
async function config(purpose:Purpose='read'):Promise<Config>{
 if(!OFFLINE_ENABLED)throw new DriveError(503,'drive/not-configured');
 if(purpose==='management'&&!MANAGEMENT_CONFIGURED)throw new DriveError(503,'drive/management-setup-required');
 const cached=cachedConfig.get(purpose);
 if(cached&&cached.until>Date.now())return cached.value;
 try{
  const credentials=await cloud.getCredentials();
  if(credentials.client_email!==RUNTIME_SERVICE_ACCOUNT)throw new Error('runtime identity');
  const client=await cloud.getClient();
  const read=async(name:string)=>{
   const r=await client.request<{payload:{data:string}}>({url:`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${name}/versions/latest:access`,timeout:10000});
   return Buffer.from(r.data.payload.data,'base64');
  };
  const [secret,keyText]=await Promise.all([read(purpose==='management'?'VELUM_DRIVE_MANAGEMENT_CLIENT_SECRET':'VELUM_DRIVE_CLIENT_SECRET'),read('VELUM_DRIVE_TOKEN_KEY')]);
  const key=Buffer.from(keyText.toString('utf8').trim(),'base64');
  if(!secret.length||key.length!==32)throw new Error('configuration');
  const value={clientSecret:secret.toString('utf8').trim(),key,clientId:purpose==='management'?MANAGEMENT_CLIENT:CLIENT,purpose};
  cachedConfig.set(purpose,{until:Date.now()+60000,value});return value;
 }catch{throw new DriveError(503,'drive/configuration-unavailable');}
}
function seal(value:string,key:Buffer,context:string):Envelope{
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(context));
 const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
function unseal(value:Envelope,key:Buffer,context:string):string{
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));
 decipher.setAAD(Buffer.from(context));decipher.setAuthTag(Buffer.from(value.tag,'base64'));
 return Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')),decipher.final()]).toString('utf8');
}
async function owner(req:Request){
 if(req.get('origin')!==ORIGIN||req.get('content-type')?.split(';')[0]!=='application/json')throw new DriveError(403,'drive/origin-required');
 if(req.get('sec-fetch-site')&&!['same-origin','none'].includes(req.get('sec-fetch-site')!))throw new DriveError(403,'drive/origin-required');
 const bearer=req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if(!bearer)throw new DriveError(401,'drive/sign-in-required');
 try{
  const token=await admin.auth().verifyIdToken(bearer,true);
  if(token.uid!==OWNER)throw new Error('owner');
  const user=await admin.auth().getUser(OWNER),google=user.providerData.find(p=>p.providerId==='google.com');
  if(user.disabled||!google?.uid||!token.firebase?.identities?.['google.com']?.includes(google.uid))throw new Error('identity');
  return {uid:OWNER,googleSub:google.uid};
 }catch{throw new DriveError(401,'drive/owner-sign-in-required');}
}
async function googlePost(url:string,body:URLSearchParams){
 try{
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15000)});
  const value=await r.json() as Record<string,any>;
  if(r.status===400&&value?.error==='invalid_grant')throw new InvalidGrantError();
  if(!r.ok)throw new DriveError(503,'drive/google-unavailable');
  return value;
 }catch(error){if(error instanceof DriveError)throw error;throw new DriveError(503,'drive/google-unavailable');}
}
async function verifiedAccess(accessToken:unknown,googleSub:string,purpose:'browser'|'callback'|'management'='browser',clientId=CLIENT){
 if(typeof accessToken!=='string'||!accessToken)throw new DriveError(409,'drive/reconnect-required');
 const info=await googlePost('https://oauth2.googleapis.com/tokeninfo',new URLSearchParams({access_token:accessToken}));
 const scopes=String(info.scope||'').split(/\s+/).filter(Boolean),seconds=Number(info.expires_in);
 const required=purpose==='management'?[MANAGEMENT_SCOPE]:purpose==='callback'?[]:SCOPES;
 const audiences=[info.aud,info.audience,info.issued_to].filter(value=>value!==undefined),subjects=[info.sub,info.user_id].filter(value=>value!==undefined);
 const failure=!audiences.length?'audience-missing':!audiences.every(value=>value===clientId)?'audience-mismatch'
  :!subjects.length?'subject-missing':!subjects.every(value=>value===googleSub)?'subject-mismatch'
  :!required.every(s=>scopes.includes(s))?'required-scope-missing':!Number.isFinite(seconds)||seconds<=90?'expiry-invalid':'';
 if(failure)throw new DriveError(409,'drive/reconnect-required',failure);
 const allowed=purpose==='browser'?BROWSER_SCOPES:SERVER_SCOPES;
 if(!scopes.every(scope=>allowed.has(scope)))throw new DriveError(503,purpose==='browser'?'drive/browser-scope-rejected':'drive/server-scope-rejected');
 return {accessToken,expiresAt:Date.now()+Math.min(seconds-60,45*60)*1000,scopes};
}
function clearCookie(res:Response){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/api/drive; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);}
async function revoke(token:string,purpose:Purpose='read'){
 // Google revocation can affect a newer grant for this project. Each worker
 // extends the shared barrier before its request, including duplicate drains.
 await db().runTransaction(async tx=>{
  const current=(await tx.get(grantRef(purpose))).data() as Grant|undefined;
  tx.set(grantRef(purpose),{revocationUntil:Math.max(current?.revocationUntil||0,Date.now()+TTL)},{merge:true});
 });
 const response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),signal:AbortSignal.timeout(15000)});
 if(response.ok)return true;
 if(response.status===400){
  const value=await response.json().catch(()=>null) as {error?:unknown}|null;
  if(value?.error==='invalid_token')return false;
 }
 throw new DriveError(503,'drive/revocation-pending');
}
function queuedCredential(value:{purpose?:unknown;sealed:Envelope},id:string,purpose:Purpose,cfg:Config){
 if(value.purpose!==undefined&&value.purpose!==purpose)throw new DriveError(503,'drive/revocation-pending');
 if(value.purpose===undefined&&purpose!=='read')throw new DriveError(503,'drive/revocation-pending');
 return unseal(value.sealed,cfg.key,value.purpose===undefined?`revocation:${id}`:`revocation:${purpose}:${id}`);
}
async function drainRevocations(cfg:Config,purpose:Purpose=cfg.purpose){
 const pending=await revocations(purpose).limit(10).get();
 let googleRevoked=false;
 for(const item of pending.docs){googleRevoked=(await revoke(queuedCredential(item.data() as {purpose?:unknown;sealed:Envelope},item.id,purpose,cfg),purpose))||googleRevoked;await item.ref.delete();}
 if(!(await revocations(purpose).limit(1).get()).empty)throw new DriveError(409,'drive/revocation-pending');
 return googleRevoked;
}
async function rejectIssuance(token:string,cfg:Config){
 const purpose=cfg.purpose,ref=revocations(purpose).doc();
 // Persist the cleanup token and block new issuance before revoking a project-wide grant.
 try{await ref.set({purpose,sealed:seal(token,cfg.key,`revocation:${purpose}:${ref.id}`),createdAt:admin.firestore.FieldValue.serverTimestamp()});}catch{}
 const revision=await db().runTransaction(async tx=>{
   const current=(await tx.get(grantRef(purpose))).data() as Grant|undefined;
   const next=(current?.revision||0)+1;
   tx.set(grantRef(purpose),{enabled:false,revision:next,revocationUntil:Date.now()+TTL},{merge:true});
   return next;
  });
 const googleRevoked=await revoke(token,purpose);
 try{await ref.delete();}catch{}
 await db().runTransaction(async tx=>{
  const current=(await tx.get(grantRef(purpose))).data() as Grant|undefined;
  if(current?.revision!==revision)return;
  const cleared={pendingHash:admin.firestore.FieldValue.delete(),pendingUntil:admin.firestore.FieldValue.delete()};
  tx.update(grantRef(purpose),googleRevoked?{...cleared,refresh:admin.firestore.FieldValue.delete()}:cleared);
 });
}
async function start(req:Request,res:Response){
 const identity=await owner(req);
 const data=req.body;
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>key!=='management')
  ||(Object.prototype.hasOwnProperty.call(data,'management')&&typeof data.management!=='boolean'))throw new DriveError(400,'drive/invalid-request');
 const management=data.management===true;
 const purpose:Purpose=management?'management':'read',cfg=await config(purpose);
 await drainRevocations(cfg);
 const state=random(),hash=digest(state),binding=random(),verifier=random()+random(),nonce=random(),now=Date.now();
 const attempt=db().doc(`${ROOT}/oauth/attempts/${hash}`);
 await db().runTransaction(async tx=>{
  const snapshot=await tx.get(grantRef(purpose)),grant=snapshot.data() as Grant|undefined;
  if((grant?.refresh&&!grant.enabled)||(grant?.revocationUntil||0)>now)throw new DriveError(409,'drive/revocation-pending');
  if(grant?.pendingHash&&(grant.pendingUntil||(grant.lastStartedAt||0)+TTL)>now)throw new DriveError(429,'drive/connect-in-progress');
  if(grant?.lastStartedAt&&now-grant.lastStartedAt<10000)throw new DriveError(429,'drive/connect-in-progress');
  const revision=grant?.revision||0;
  tx.set(attempt,{uid:OWNER,googleSub:identity.googleSub,revision,purpose,clientId:cfg.clientId,management,bindingHash:digest(binding),sealed:seal(JSON.stringify({verifier,nonce}),cfg.key,`attempt:${hash}`),expiresAt:admin.firestore.Timestamp.fromMillis(now+TTL),used:false});
  tx.set(grantRef(purpose),{revision,googleSub:identity.googleSub,enabled:grant?.enabled===true,pendingHash:hash,pendingUntil:now+TTL,lastStartedAt:now},{merge:true});
 });
 res.setHeader('Set-Cookie',`${COOKIE}=${hash}.${binding}; Path=/api/drive; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:cfg.clientId,redirect_uri:CALLBACK,response_type:'code',scope:[...IDENTITY_REQUEST_SCOPES,...(management?[MANAGEMENT_SCOPE]:SCOPES)].join(' '),access_type:'offline',include_granted_scopes:'false',prompt:'consent',login_hint:identity.googleSub,state,nonce,code_challenge:digestBase64(verifier),code_challenge_method:'S256'}).toString();
 res.json({authorizeUrl:url.href,clientId:cfg.clientId});
}
function digestBase64(value:string){return createHash('sha256').update(value).digest('base64url');}
async function managementHealth(){
 if(!OFFLINE_ENABLED||!MANAGEMENT_CONFIGURED)return false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([
   config('management').then(()=>true,()=>false),
   new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),2000);})
  ]);
 }finally{if(timer)clearTimeout(timer);}
}
async function callback(req:Request,res:Response){
 clearCookie(res);
 let cfg:Config|undefined,issued='',stage='state';
 let claimed:{hash:string;revision:number;purpose:Purpose}|undefined;
 try{
  const state=typeof req.query.state==='string'?req.query.state:'';
  if(!/^[\w-]{43}$/.test(state))throw new DriveError(400,'drive/invalid-state');
  const hash=digest(state),cookie=(req.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
  const [cookieHash,binding]=cookie.split('.');
  if(cookieHash!==hash||!binding)throw new DriveError(403,'drive/invalid-state');
  const attemptRef=db().doc(`${ROOT}/oauth/attempts/${hash}`);
  const initial=(await attemptRef.get()).data();
  if(!initial||(initial.purpose!==undefined&&!['read','management'].includes(initial.purpose)))throw new DriveError(403,'drive/invalid-state');
  const purpose:Purpose=initial.purpose==='management'?'management':'read';
  cfg=await config(purpose);
  const attempt=await db().runTransaction(async tx=>{
   const [a,g]=await Promise.all([tx.get(attemptRef),tx.get(grantRef(purpose))]);
   const value=a.data(),grant=g.data() as Grant|undefined;
   if(!value||value.used||value.uid!==OWNER||(value.purpose||'read')!==purpose||(value.clientId||CLIENT)!==cfg!.clientId||value.expiresAt.toMillis()<Date.now()||!same(value.bindingHash,digest(binding))||grant?.pendingHash!==hash||grant?.revision!==value.revision||(grant?.revocationUntil||0)>Date.now())throw new DriveError(403,'drive/invalid-state');
   tx.update(attemptRef,{used:true});
   tx.update(grantRef(purpose),{pendingUntil:Date.now()+TTL});
   return value;
  });
  claimed={hash,revision:attempt.revision,purpose};
  if(req.query.error)throw new DriveError(409,'drive/consent-not-completed');
  if(typeof req.query.code!=='string'||req.query.code.length>4096)throw new DriveError(400,'drive/invalid-code');
  const user=await admin.auth().getUser(OWNER);
  if(user.disabled||!user.providerData.some(p=>p.providerId==='google.com'&&p.uid===attempt.googleSub))throw new DriveError(403,'drive/identity-changed');
  const {verifier,nonce}=JSON.parse(unseal(attempt.sealed,cfg.key,`attempt:${hash}`));
  stage='code-exchange';
  const tokens=await googlePost('https://oauth2.googleapis.com/token',new URLSearchParams({code:req.query.code,client_id:cfg.clientId,client_secret:cfg.clientSecret,redirect_uri:CALLBACK,grant_type:'authorization_code',code_verifier:verifier}));
  issued=typeof tokens.refresh_token==='string'?tokens.refresh_token:typeof tokens.access_token==='string'?tokens.access_token:'';
  stage='identity';
  const ticket=await oidc.verifyIdToken({idToken:String(tokens.id_token||''),audience:cfg.clientId});
  const claims=ticket.getPayload();
  if(claims?.sub!==attempt.googleSub||!same(String((claims as any)?.nonce||''),nonce))throw new DriveError(403,'drive/identity-changed');
  stage='access';
  const access=await verifiedAccess(tokens.access_token,attempt.googleSub,'callback',cfg.clientId);
  if(purpose==='read'&&access.scopes.includes(MANAGEMENT_SCOPE)){
   // Never adopt full authority in the browser project's connection. A valid
   // owner credential was not exposed; discard it without revoking the old
   // narrow project grant as a side effect of a read-only connection attempt.
   issued='';throw new DriveError(409,'drive/read-scope-rejected');
  }
  if((purpose==='management'&&!access.scopes.includes(MANAGEMENT_SCOPE))
   ||(!access.scopes.includes(MANAGEMENT_SCOPE)&&!SCOPES.every(scope=>access.scopes.includes(scope)))){
   // A valid owner declining the additional scope must not revoke the existing
   // narrow project grant. The uncommitted credential remains server-local.
   issued='';throw new DriveError(409,'drive/management-required');
  }
  if(typeof tokens.refresh_token!=='string'||!tokens.refresh_token)throw new DriveError(409,'drive/offline-grant-missing');
  // Prove that the new refresh credential can issue a browser-safe subset
  // before replacing the current grant. The full access credential stays here.
  if(purpose==='read'){
   stage='read-refresh-probe';
   try{
    const narrow=await googlePost('https://oauth2.googleapis.com/token',new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,grant_type:'refresh_token',refresh_token:tokens.refresh_token,scope:BROWSER_REQUEST_SCOPES.join(' ')}));
    await verifiedAccess(narrow.access_token,attempt.googleSub,'browser',cfg.clientId);
   }catch(error){
    // Initial owner identity and narrow access are already verified. Nothing
    // was exposed; discard this uncommitted credential without revoking an
    // existing project connection merely because a renewal probe failed.
    const retained=await db().runTransaction(async tx=>{
     const current=(await tx.get(grantRef(purpose))).data() as Grant|undefined;
     if(!current?.enabled||!current.refresh||current.googleSub!==attempt.googleSub
      ||current.revision!==attempt.revision||current.pendingHash!==hash||(current.revocationUntil||0)>Date.now())return false;
     tx.update(grantRef(purpose),{pendingHash:admin.firestore.FieldValue.delete(),pendingUntil:admin.firestore.FieldValue.delete()});
     return true;
    }).catch(()=>false);
    if(retained)issued='';
    throw error;
   }
  }
  stage='persist';
  await db().runTransaction(async tx=>{
   const current=(await tx.get(grantRef(purpose))).data() as Grant|undefined;
   if(current?.revision!==attempt.revision||current?.pendingHash!==hash||(current?.revocationUntil||0)>Date.now())throw new DriveError(409,'drive/connection-changed');
   tx.set(grantRef(purpose),{revision:attempt.revision+1,googleSub:attempt.googleSub,clientId:cfg!.clientId,enabled:true,managementReady:purpose==='management'&&access.scopes.includes(MANAGEMENT_SCOPE),refresh:seal(tokens.refresh_token,cfg!.key,refreshContext(purpose,attempt.googleSub)),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
   tx.delete(attemptRef);
  });
  issued='';
  console.info(JSON.stringify({event:'velum-drive-consent',managementReady:purpose==='management',narrowValidated:purpose==='read'}));
  res.redirect(303,ORIGIN+'/?drive=connected');
 }catch(error){
  console.info(JSON.stringify({event:'velum-drive-consent-failed',purpose:cfg?.purpose||'unknown',stage,
   code:error instanceof DriveError?error.code:'drive/verification-failed',check:error instanceof DriveError?error.checkFailure:undefined}));
  if(issued&&cfg){try{await rejectIssuance(issued,cfg);}catch{/* encrypted revocation record is retained; never log credentials */}}
  else if(claimed){
   const failed=claimed;
   try{await db().runTransaction(async tx=>{
    const current=(await tx.get(grantRef(failed.purpose))).data() as Grant|undefined;
    if(current?.revision===failed.revision&&current.pendingHash===failed.hash){
     tx.update(grantRef(failed.purpose),{pendingHash:admin.firestore.FieldValue.delete(),pendingUntil:admin.firestore.FieldValue.delete()});
    }
   });}catch{}
  }
  res.redirect(303,ORIGIN+'/?drive=not-connected');
 }
}
async function sessionGrant(purpose:Purpose='read'){
 return db().runTransaction(async tx=>{
  const [grant,pending]=await Promise.all([
   tx.get(grantRef(purpose)),tx.get(revocations(purpose).limit(1))
  ]);
  if(!pending.empty)throw new DriveError(409,'drive/revocation-pending');
  return grant.data() as Grant|undefined;
 });
}
async function managementReadiness(googleSub:string){
 if(!MANAGEMENT_CONFIGURED)return false;
 try{managementGrant(await sessionGrant('management'),googleSub);return true;}catch{return false;}
}
async function session(req:Request,res:Response){
 const identity=await owner(req),cfg=await config();
 const value=await sessionGrant();
 if((value?.revocationUntil||0)>Date.now())throw new DriveError(409,'drive/revocation-pending');
 if(!value?.enabled||!value.refresh||value.googleSub!==identity.googleSub)throw new DriveError(409,'drive/reconnect-required');
 const refreshToken=unseal(value.refresh,cfg.key,refreshContext('read',identity.googleSub));
 let tokens;
 try{
   tokens=await googlePost('https://oauth2.googleapis.com/token',new URLSearchParams({client_id:CLIENT,client_secret:cfg.clientSecret,grant_type:'refresh_token',refresh_token:refreshToken,scope:BROWSER_REQUEST_SCOPES.join(' ')}));
 }catch(error){
  if(error instanceof InvalidGrantError)await expireInvalidRefresh(value,refreshToken,cfg);
  throw error;
 }
 let access;
 try{access=await verifiedAccess(tokens.access_token,identity.googleSub);}
 catch(error){console.info(JSON.stringify({event:'velum-drive-session-rejected',code:error instanceof DriveError?error.code:'drive/unavailable',check:error instanceof DriveError?error.checkFailure:undefined}));throw error;}
 const current=await sessionGrant();
 if(!current?.enabled||current.revision!==value.revision||current.googleSub!==identity.googleSub||(current.revocationUntil||0)>Date.now())throw new DriveError(409,'drive/connection-changed');
 res.json({...access,owner:OWNER,googleSub:identity.googleSub,mode:'server',managementReady:await managementReadiness(identity.googleSub)});
}
async function expireInvalidRefresh(value:Grant,token:string,cfg:Config){
 await db().runTransaction(async tx=>{
  const [snapshot,pending]=await Promise.all([
   tx.get(grantRef(cfg.purpose)),tx.get(revocations(cfg.purpose).limit(10))
  ]);
  const current=snapshot.data() as Grant|undefined;
  if(current?.enabled&&current.revision===value.revision&&current.googleSub===value.googleSub
   &&current.refresh?.iv===value.refresh?.iv&&current.refresh?.tag===value.refresh?.tag
   &&current.refresh?.ciphertext===value.refresh?.ciphertext){
   tx.update(grantRef(cfg.purpose),{
    enabled:false,revision:value.revision+1,refresh:admin.firestore.FieldValue.delete(),
    ...(!current.pendingHash?{lastStartedAt:admin.firestore.FieldValue.delete()}:{})
   });
  }
  for(const item of pending.docs){
   let queued;
   try{queued=queuedCredential(item.data() as {purpose?:unknown;sealed:Envelope},item.id,cfg.purpose,cfg);}catch{continue;}
   if(same(queued,token))tx.delete(item.ref);
  }
 });
}
type MoveIntent={id:string;from:string;to:string;at:number};
type MovePhase='queued'|'pending'|'confirmed'|'rejected';
type MoveReceipt=MoveIntent&{owner:string;googleSub:string;phase:MovePhase;attempts:number;grantRevision:number};
type MoveLease={receiptId:string;leaseId:string;until:number};
type DriveFile={id?:string;mimeType?:string;ownedByMe?:boolean;trashed?:boolean;parents?:string[];capabilities?:{canMoveItemWithinDrive?:boolean;canAddChildren?:boolean;canRemoveChildren?:boolean}};
class GoogleFileError extends DriveError{
 constructor(public googleStatus:number,public reason:string){super(googleStatus>=400&&googleStatus<500?googleStatus:503,'drive/google-rejected');}
}
class MoveError extends DriveError{
 constructor(status:number,code:string,public receiptId:string,public phase:MovePhase,public googleStatus?:number,public reason?:string){super(status,code);}
}
function moveIntent(data:unknown):MoveIntent{
 if(!data||typeof data!=='object'||Array.isArray(data))throw new DriveError(400,'drive/invalid-move');
 const value=data as Record<string,unknown>,keys=Object.keys(value);
 if(keys.length!==4||!['id','from','to','at'].every(key=>Object.prototype.hasOwnProperty.call(value,key))
  ||typeof value.id!=='string'||! /^[\w-]{8,160}$/.test(value.id)
  ||!((value.from===PRIVATE_FOLDER&&value.to===REFERENCES_FOLDER)||(value.from===REFERENCES_FOLDER&&value.to===PRIVATE_FOLDER))
  ||!Number.isSafeInteger(value.at)||Number(value.at)<=0||Number(value.at)>Date.now()+5*60*1000)throw new DriveError(400,'drive/invalid-move');
 return {id:value.id,from:String(value.from),to:String(value.to),at:Number(value.at)};
}
function sameRefresh(a:Envelope|undefined,b:Envelope|undefined){
 return Boolean(a&&b&&a.iv===b.iv&&a.tag===b.tag&&a.ciphertext===b.ciphertext);
}
function managementGrant(value:Grant|undefined,googleSub:string,expected?:Grant):Grant{
 if(!MANAGEMENT_CONFIGURED)throw new DriveError(503,'drive/management-setup-required');
 if((value?.revocationUntil||0)>Date.now())throw new DriveError(409,'drive/revocation-pending');
 if(!value?.enabled||!value.refresh||value.googleSub!==googleSub)throw new DriveError(409,'drive/reconnect-required');
 if(value.managementReady!==true||value.clientId!==MANAGEMENT_CLIENT)throw new DriveError(409,'drive/management-required');
 if(expected&&(value.revision!==expected.revision||!sameRefresh(value.refresh,expected.refresh)))throw new DriveError(409,'drive/connection-changed');
 return value;
}
const receiptRef=(receiptId:string)=>db().doc(`${ROOT}/moves/receipts/${receiptId}`);
const fileLeaseRef=(googleSub:string,id:string)=>db().doc(`${ROOT}/moves/files/${digest(JSON.stringify([OWNER,googleSub,id]))}`);
function sameMove(value:MoveReceipt|undefined,intent:MoveIntent,googleSub:string){
 return Boolean(value&&value.owner===OWNER&&value.googleSub===googleSub&&value.id===intent.id&&value.from===intent.from&&value.to===intent.to&&value.at===intent.at
  &&['queued','pending','confirmed','rejected'].includes(value.phase)&&Number.isSafeInteger(value.attempts)&&value.attempts>=0);
}
async function claimMove(intent:MoveIntent,googleSub:string,grant:Grant,existingOnly=false){
 const receiptId=digest(JSON.stringify([OWNER,googleSub,intent.id,intent.from,intent.to,intent.at]));
 const ref=receiptRef(receiptId),lock=fileLeaseRef(googleSub,intent.id),leaseId=random();
 const receipt=await db().runTransaction(async tx=>{
  const [g,p,r,l]=await Promise.all([tx.get(grantRef('management')),tx.get(revocations('management').limit(1)),tx.get(ref),tx.get(lock)]);
  if(!p.empty)throw new DriveError(409,'drive/revocation-pending');
  managementGrant(g.data() as Grant|undefined,googleSub,grant);
  const current=r.data() as MoveReceipt|undefined,lease=l.data() as MoveLease|undefined;
  if(existingOnly&&!current)throw new DriveError(409,'drive/receipt-not-started');
  if(current&&!sameMove(current,intent,googleSub))throw new DriveError(409,'drive/invalid-receipt');
  if(lease&&lease.until>Date.now())throw new MoveError(409,'drive/move-in-progress',receiptId,current?.phase||'queued');
  if(lease&&lease.receiptId!==receiptId){
   if(!/^[a-f0-9]{64}$/.test(lease.receiptId))throw new DriveError(409,'drive/invalid-receipt');
   const previous=(await tx.get(receiptRef(lease.receiptId))).data() as MoveReceipt|undefined;
   // An expired worker does not authorize another intent to overwrite an
   // uncertain write. Only a matching explicit retry may reconcile that receipt.
   if(previous?.phase==='pending')throw new MoveError(409,'drive/previous-move-pending',lease.receiptId,'pending');
  }
  const result:MoveReceipt=current||{...intent,owner:OWNER,googleSub,phase:'queued',attempts:0,grantRevision:grant.revision};
  if(!current)tx.create(ref,{...result,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  tx.set(lock,{receiptId,leaseId,until:Date.now()+MOVE_LEASE_MS});
  return result;
 });
 return {receiptId,leaseId,receipt};
}
function ownsMoveLease(value:MoveLease|undefined,receiptId:string,leaseId:string){
 return Boolean(value&&value.receiptId===receiptId&&value.leaseId===leaseId&&value.until>Date.now());
}
async function beginMoveWrite(intent:MoveIntent,googleSub:string,grant:Grant,receiptId:string,leaseId:string){
 await db().runTransaction(async tx=>{
  const [g,p,r,l]=await Promise.all([tx.get(grantRef('management')),tx.get(revocations('management').limit(1)),tx.get(receiptRef(receiptId)),tx.get(fileLeaseRef(googleSub,intent.id))]);
  if(!p.empty)throw new DriveError(409,'drive/revocation-pending');
  managementGrant(g.data() as Grant|undefined,googleSub,grant);
  const receipt=r.data() as MoveReceipt|undefined;
  if(!sameMove(receipt,intent,googleSub)||receipt?.phase==='confirmed'||!ownsMoveLease(l.data() as MoveLease|undefined,receiptId,leaseId))throw new DriveError(409,'drive/move-changed');
  tx.update(receiptRef(receiptId),{phase:'pending',attempts:receipt!.attempts+1,grantRevision:grant.revision,lastAttemptAt:admin.firestore.FieldValue.serverTimestamp()});
 });
}
async function finishMove(intent:MoveIntent,googleSub:string,grant:Grant,receiptId:string,leaseId:string){
 await db().runTransaction(async tx=>{
  const [g,p,r,l]=await Promise.all([tx.get(grantRef('management')),tx.get(revocations('management').limit(1)),tx.get(receiptRef(receiptId)),tx.get(fileLeaseRef(googleSub,intent.id))]);
  if(!p.empty)throw new DriveError(409,'drive/revocation-pending');
  managementGrant(g.data() as Grant|undefined,googleSub,grant);
  if(!sameMove(r.data() as MoveReceipt|undefined,intent,googleSub)||!ownsMoveLease(l.data() as MoveLease|undefined,receiptId,leaseId))throw new DriveError(409,'drive/move-changed');
  tx.update(receiptRef(receiptId),{phase:'confirmed',confirmedAt:admin.firestore.FieldValue.serverTimestamp()});
  tx.delete(fileLeaseRef(googleSub,intent.id));
 });
}
async function rejectUnwrittenMove(intent:MoveIntent,googleSub:string,receiptId:string,leaseId:string){
 return db().runTransaction(async tx=>{
  const [r,l]=await Promise.all([tx.get(receiptRef(receiptId)),tx.get(fileLeaseRef(googleSub,intent.id))]);
  const receipt=r.data() as MoveReceipt|undefined;
  if(!sameMove(receipt,intent,googleSub)||!ownsMoveLease(l.data() as MoveLease|undefined,receiptId,leaseId))return false;
  if(receipt?.phase!=='confirmed')tx.update(receiptRef(receiptId),{phase:'rejected',rejectedAt:admin.firestore.FieldValue.serverTimestamp()});
  tx.delete(fileLeaseRef(googleSub,intent.id));
  return true;
 });
}
async function googleFile(token:string,id:string,method:'GET'|'PATCH'='GET',parents?:{from:string;to:string;etag?:string}){
 const url=new URL(`https://www.googleapis.com/drive/v3/files/${id}`);
 url.searchParams.set('fields','id,mimeType,parents,ownedByMe,trashed,capabilities(canMoveItemWithinDrive,canAddChildren,canRemoveChildren)');
 const headers:Record<string,string>={Authorization:`Bearer ${token}`};
 if(method==='PATCH'){
  if(!parents)throw new DriveError(400,'drive/invalid-move');
  url.searchParams.set('addParents',parents.to);url.searchParams.set('removeParents',parents.from);
  if(parents.etag)headers['If-Match']=parents.etag;
 }
 let response;
 try{
  // There is deliberately no JSON body or automatic retry, including on PATCH.
  response=await fetch(url,{method,headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 }catch{throw new DriveError(503,'drive/google-unavailable');}
 const value=await response.json().catch(()=>null) as {error?:{errors?:{reason?:unknown}[];details?:{reason?:unknown}[]}}&DriveFile|null;
 if(!response.ok){
  const candidates=[...(value?.error?.errors||[]),...(value?.error?.details||[])].map(item=>item?.reason);
  const reason=candidates.find(item=>typeof item==='string'&&(MOVE_REASONS.has(item)||MOVE_RPC_REASONS.has(item)));
  throw new GoogleFileError(response.status,typeof reason==='string'?reason:'unknown');
 }
 if(!value||typeof value!=='object')throw new DriveError(503,'drive/invalid-google-response');
 return {file:value as DriveFile,etag:response.headers.get('etag')||undefined};
}
function imageParent(file:DriveFile,id:string){
 if(file.id!==id||file.ownedByMe!==true||file.trashed!==false||typeof file.mimeType!=='string'||!/^image\/[^\s/]+$/i.test(file.mimeType)
  ||!Array.isArray(file.parents)||file.parents.length!==1||typeof file.parents[0]!=='string')throw new DriveError(409,'drive/file-not-manageable');
 return file.parents[0];
}
function folderAccess(file:DriveFile,id:string,capability:'canRemoveChildren'|'canAddChildren'){
 if(file.id!==id||file.ownedByMe!==true||file.trashed!==false||file.mimeType!=='application/vnd.google-apps.folder'||file.capabilities?.[capability]!==true)throw new DriveError(403,'drive/folder-not-manageable');
}
function minimalFile(file:DriveFile){
 return {id:file.id,mimeType:file.mimeType,parents:file.parents,ownedByMe:true,trashed:false,capabilities:{canMoveItemWithinDrive:file.capabilities?.canMoveItemWithinDrive===true}};
}
async function managementAccess(grant:Grant,googleSub:string,cfg:Config){
 const refreshToken=unseal(grant.refresh!,cfg.key,refreshContext('management',googleSub));
 let tokens;
 try{
  tokens=await googlePost('https://oauth2.googleapis.com/token',new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,grant_type:'refresh_token',refresh_token:refreshToken,scope:[...IDENTITY_REQUEST_SCOPES,MANAGEMENT_SCOPE].join(' ')}));
 }catch(error){
  if(error instanceof InvalidGrantError)await expireInvalidRefresh(grant,refreshToken,cfg);
  throw error;
 }
 return verifiedAccess(tokens.access_token,googleSub,'management',cfg.clientId);
}
async function releaseStatusLease(intent:MoveIntent,googleSub:string,receiptId:string,leaseId:string){
 await db().runTransaction(async tx=>{
  const ref=fileLeaseRef(googleSub,intent.id),lease=(await tx.get(ref)).data() as MoveLease|undefined;
  if(lease?.receiptId===receiptId&&lease.leaseId===leaseId){
   // Retain the receipt pointer: another tuple must still honor pending state.
   tx.update(ref,{until:0});
  }
 });
}
async function moveStatus(req:Request,res:Response){
 const identity=await owner(req),intent=moveIntent(req.body),cfg=await config('management');
 const grant=managementGrant(await sessionGrant('management'),identity.googleSub);
 const receiptId=digest(JSON.stringify([OWNER,identity.googleSub,intent.id,intent.from,intent.to,intent.at]));
 const snapshot=await receiptRef(receiptId).get();
 if(!snapshot.exists){res.json({receiptId,phase:'not-started'});return;}
 if(!sameMove(snapshot.data() as MoveReceipt,intent,identity.googleSub))throw new DriveError(409,'drive/invalid-receipt');
 let claimed;
 try{claimed=await claimMove(intent,identity.googleSub,grant,true);}
 catch(error){
  if(error instanceof MoveError&&error.code==='drive/move-in-progress'){
   const lease=(await fileLeaseRef(identity.googleSub,intent.id).get()).data() as MoveLease|undefined;
   res.json({receiptId,phase:'pending',retryable:false,retryAfterMs:Math.max(1000,(lease?.until||Date.now()+1000)-Date.now())});return;
  }
  throw error;
 }
 try{
  const access=await managementAccess(grant,identity.googleSub,cfg);
  managementGrant(await sessionGrant('management'),identity.googleSub,grant);
  const current=await googleFile(access.accessToken,intent.id),parent=imageParent(current.file,intent.id);
  const stillOwner=await owner(req);
  if(stillOwner.googleSub!==identity.googleSub)throw new DriveError(409,'drive/identity-changed');
  if(parent===intent.to){
   if(!['pending','confirmed'].includes(claimed.receipt.phase))throw new DriveError(409,'drive/file-location-changed');
   await finishMove(intent,identity.googleSub,grant,receiptId,claimed.leaseId);
   console.info(JSON.stringify({event:'velum-drive-move',phase:'confirmed',status:200,reconciled:true}));
   res.json({file:minimalFile(current.file),receiptId,phase:'confirmed'});return;
  }
  managementGrant(await sessionGrant('management'),identity.googleSub,grant);
  if(claimed.receipt.phase==='confirmed')throw new DriveError(409,'drive/receipt-no-longer-current');
  if(parent!==intent.from)throw new DriveError(409,'drive/file-location-changed');
  // Status never calls PATCH. Only a later matching explicit /move may retry.
  await releaseStatusLease(intent,identity.googleSub,receiptId,claimed.leaseId);
  res.json({receiptId,phase:claimed.receipt.phase==='pending'?'pending':'not-started',retryable:true});
 }catch(error){
  const known=error instanceof DriveError;
  throw new MoveError(known?error.status:503,known?error.code:'drive/unavailable',receiptId,claimed.receipt.phase,error instanceof GoogleFileError?error.googleStatus:undefined,error instanceof GoogleFileError?error.reason:undefined);
 }finally{await releaseStatusLease(intent,identity.googleSub,receiptId,claimed.leaseId).catch(()=>undefined);}
}
async function move(req:Request,res:Response){
 const identity=await owner(req),intent=moveIntent(req.body),cfg=await config('management');
 const grant=managementGrant(await sessionGrant('management'),identity.googleSub);
 const {receiptId,leaseId,receipt}=await claimMove(intent,identity.googleSub,grant);
 let uncertain=receipt.phase==='pending';
 let phase:MovePhase=receipt.phase;
 try{
  const access=await managementAccess(grant,identity.googleSub,cfg);
  managementGrant(await sessionGrant('management'),identity.googleSub,grant);
  let current=await googleFile(access.accessToken,intent.id);
  let parent=imageParent(current.file,intent.id);
  if(parent===intent.to&&!['pending','confirmed'].includes(receipt.phase))throw new DriveError(409,'drive/file-location-changed');
  if(parent!==intent.to){
   if(receipt.phase==='confirmed')throw new DriveError(409,'drive/receipt-no-longer-current');
   if(parent!==intent.from)throw new DriveError(409,'drive/file-location-changed');
   const [source,destination]=await Promise.all([googleFile(access.accessToken,intent.from),googleFile(access.accessToken,intent.to)]);
   folderAccess(source.file,intent.from,'canRemoveChildren');folderAccess(destination.file,intent.to,'canAddChildren');
   // Reread after folder checks. The PATCH removes only this exact source and
   // cannot be widened to another parent or another file by caller-supplied data.
   current=await googleFile(access.accessToken,intent.id);
   parent=imageParent(current.file,intent.id);
   if(parent!==intent.from)throw new DriveError(409,'drive/file-location-changed');
   if(current.file.capabilities?.canMoveItemWithinDrive!==true)throw new DriveError(403,'drive/file-not-movable');
   const stillOwner=await owner(req);
   if(stillOwner.googleSub!==identity.googleSub)throw new DriveError(409,'drive/identity-changed');
   await beginMoveWrite(intent,identity.googleSub,grant,receiptId,leaseId);
   const previouslyUncertain=uncertain;
   uncertain=true;phase='pending';
   try{
    await googleFile(access.accessToken,intent.id,'PATCH',{from:intent.from,to:intent.to,etag:current.etag});
   }catch(error){
    // Only an acknowledged initial rejection plus a fresh exact source state
    // proves that this action never wrote. A retry cannot erase prior uncertainty.
    if(!previouslyUncertain&&error instanceof GoogleFileError&&[400,401,403,404,409,412].includes(error.googleStatus)){
     const actual=await googleFile(access.accessToken,intent.id).catch(()=>undefined);
     if(actual&&imageParent(actual.file,intent.id)===intent.from){
      managementGrant(await sessionGrant('management'),identity.googleSub,grant);
      if(await rejectUnwrittenMove(intent,identity.googleSub,receiptId,leaseId)){uncertain=false;phase='rejected';}
     }
    }
    throw error;
   }
   current=await googleFile(access.accessToken,intent.id);
   if(imageParent(current.file,intent.id)!==intent.to)throw new DriveError(409,'drive/move-unconfirmed');
  }
  const stillOwner=await owner(req);
  if(stillOwner.googleSub!==identity.googleSub)throw new DriveError(409,'drive/identity-changed');
  await finishMove(intent,identity.googleSub,grant,receiptId,leaseId);
  console.info(JSON.stringify({event:'velum-drive-move',phase:'confirmed',status:200,reconciled:receipt.phase==='pending'||receipt.phase==='confirmed'}));
  res.json({file:minimalFile(current.file),receiptId,phase:'confirmed'});
 }catch(error){
  if(!uncertain){
   const released=await rejectUnwrittenMove(intent,identity.googleSub,receiptId,leaseId);
   if(phase!=='confirmed'){
    if(released||phase==='rejected')phase='rejected';
    else{uncertain=true;phase='pending';}
   }
  }
  const known=error instanceof DriveError;
  const status=known?error.status:503,code=known?error.code:'drive/unavailable';
  console.info(JSON.stringify({event:'velum-drive-move',phase:uncertain?'pending':phase,status}));
  throw new MoveError(status,code,receiptId,uncertain?'pending':phase,error instanceof GoogleFileError?error.googleStatus:undefined,error instanceof GoogleFileError?error.reason:undefined);
 }
}
async function disconnect(req:Request,res:Response){
 const identity=await owner(req);
 // Invalidate pending callbacks and sessions even if config/revocation is temporarily unavailable.
 const previous=await db().runTransaction(async tx=>{
  const purposes:Purpose[]=['read','management'];
  const snapshots=await Promise.all(purposes.map(purpose=>tx.get(grantRef(purpose))));
  return purposes.map((purpose,index)=>{
   const value=snapshots[index].data() as Grant|undefined;
   tx.set(grantRef(purpose),{revision:(value?.revision||0)+1,googleSub:identity.googleSub,enabled:false,revocationUntil:value?.pendingHash?Date.now()+TTL:(value?.revocationUntil||0),pendingHash:admin.firestore.FieldValue.delete()},{merge:true});
   return {purpose,value};
  });
 });
 clearCookie(res);
 const waiting=previous.some(({value})=>Boolean(value?.pendingHash)||(value?.revocationUntil||0)>Date.now());
 if(previous.every(({value})=>!value?.refresh)&&!OFFLINE_ENABLED){res.json({disconnected:true,revoked:true,googleRevoked:false});return;}
 try{
  // Revocation needs the encryption key, never the optional management secret.
  const cfg=await config();
  let googleRevoked=false;
  let pending=false;
  for(const {purpose,value} of previous){
   try{
    const queuedRevoked=await drainRevocations(cfg,purpose);
    const refreshRevoked=value?.refresh?await revoke(unseal(value.refresh,cfg.key,refreshContext(purpose,value.googleSub)),purpose):false;
    // Legacy client cleanup evidence concerns the read project's grant only.
    if(purpose==='read')googleRevoked=queuedRevoked||refreshRevoked;
    await db().runTransaction(async tx=>{
     const current=(await tx.get(grantRef(purpose))).data() as Grant|undefined;
     if(current?.revision===(value?.revision||0)+1)tx.update(grantRef(purpose),{refresh:admin.firestore.FieldValue.delete()});
    });
   }catch{pending=true;}
  }
  if(pending)throw new DriveError(409,'drive/revocation-pending');
  if(waiting)throw new DriveError(409,'drive/revocation-pending');
  res.json({disconnected:true,revoked:true,googleRevoked});
 }catch{res.status(202).json({disconnected:true,revoked:false,code:'drive/revocation-pending'});}
}
async function moveDiagnostic(req:Request,res:Response){
 await owner(req);
 const data=req.body;
 const fields=['schema','status','reason','rpcReason','rpcStatus','scopeInsufficient','organizeDenied','mode','release'];
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==fields.length
  ||!fields.every(field=>Object.prototype.hasOwnProperty.call(data,field))
  ||data.schema!==1||data.status!==403||!MOVE_REASONS.has(data.reason)
  ||!MOVE_RPC_REASONS.has(data.rpcReason)||!MOVE_RPC_STATUSES.has(data.rpcStatus)
  ||typeof data.scopeInsufficient!=='boolean'||typeof data.organizeDenied!=='boolean'
  ||!['server','temporary'].includes(data.mode)||typeof data.release!=='string'
  ||!(data.release==='unversioned'||/^\d{14}-[a-f0-9]{8}$/.test(data.release))){
  throw new DriveError(400,'drive/invalid-diagnostic');
 }
 try{
  await db().doc(`${ROOT}/moveDiagnostic`).create({...data,createdAt:admin.firestore.FieldValue.serverTimestamp()});
 }catch(error){
  if((error as {code?:number}).code!==6)throw error;
 }
 res.json({captured:true});
}
// Fresh Auto Edit: metadata-only broker for the existing approved PC and
// Drive for desktop. It never transfers image bytes or owner OAuth credentials.
const AUTO_DEVICE='f1bmD2SAJcQf25YwkhLcE0hJyS22';
const AUTO_WORKSPACE='users/'+OWNER+'/velumStudio/workspace';
const AUTO_STAGING='1o7mc6xUgh_oAWjQLxdZoZtpTZa66xwhE';
const AUTO_MAX_BYTES=67108864;
const AUTO_BATCH_TTL=48*60*60*1000;
const AUTO_TURBO='qwen-image-2.1-turbo';
class AutoStockError extends DriveError{
 constructor(readonly eligibleCount:number){super(409,'drive/auto-edit-insufficient-stock');}
}
const autoId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(v);
const autoItemId=(v:unknown):v is string=>typeof v==='string'&&/^item-\d{3}$/.test(v);
const autoHash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const autoDriveId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{8,160}$/.test(v);
const autoStages=['source','vision1','prompt','edit','vision2','delivery'];
type AutoMetadataFile=DriveFile&{name?:string;size?:string;shared?:boolean;sha256Checksum?:string;md5Checksum?:string};
type AutoMetadataIntent={action:'source'|'delivery';batchId:string;itemId:string};
function autoIntent(value:unknown):AutoMetadataIntent{
 const v=value as Partial<AutoMetadataIntent>|null;
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==3||!['source','delivery'].includes(String(v.action))||!autoId(v.batchId)||!autoItemId(v.itemId))throw new DriveError(400,'drive/invalid-auto-edit-request');
 return v as AutoMetadataIntent;
}
async function autoDevice(req:Request){
 if(req.get('content-type')?.split(';')[0]!=='application/json'||(req.get('origin')&&req.get('origin')!==ORIGIN))throw new DriveError(403,'drive/auto-edit-origin-denied');
 const bearer=req.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if(!bearer)throw new DriveError(401,'drive/auto-edit-device-required');
 try{
  const token=await admin.auth().verifyIdToken(bearer,true);
  if(token.uid!==AUTO_DEVICE||token.firebase?.sign_in_provider!=='anonymous')throw new Error('device');
  const user=await admin.auth().getUser(OWNER),google=user.providerData.find(p=>p.providerId==='google.com');
  if(user.disabled||!google?.uid)throw new Error('owner');
  return google.uid;
 }catch{throw new DriveError(401,'drive/auto-edit-device-required');}
}
async function autoAssigned(intent:AutoMetadataIntent){
 const root=db();
 const result=await root.runTransaction(async tx=>{
  const [admission,binding,batch,item]=await Promise.all([
   tx.get(root.doc(AUTO_WORKSPACE+'/autoEditControl/admission')),
   tx.get(root.doc(AUTO_WORKSPACE+'/devices/'+AUTO_DEVICE)),
   tx.get(root.doc(AUTO_WORKSPACE+'/autoBatches/'+intent.batchId)),
   tx.get(root.doc(AUTO_WORKSPACE+'/autoBatches/'+intent.batchId+'/items/'+intent.itemId))
  ]);
  return {admission:admission.data(),binding:binding.data(),batch:batch.data(),item:item.data()};
 });
 const {admission,binding,batch,item}=result;
 const multi=admission?.version===2&&admission.mode==='batch'&&batch?.schemaVersion===2&&batch.plan?.schemaVersion===2
  &&autoId(batch.plan.seedVersionId)&&autoHash(admission.planHash)&&batch.planHash===admission.planHash;
 const pilot=admission?.version===1&&admission.mode==='pilot'&&batch?.schemaVersion===1&&batch.plan?.schemaVersion===1
  &&autoDriveId(admission.sourceFileId)&&batch.plan.items?.length===1&&batch.plan.items[0].source?.fileId===admission.sourceFileId;
 if((!multi&&!pilot)||admission.enabled!==true||admission.batchId!==intent.batchId
  ||!Number.isSafeInteger(admission.expiresAt)||admission.expiresAt<=Date.now()||(multi&&admission.expiresAt>Date.now()+AUTO_BATCH_TTL)
  ||binding?.status!=='approved'||binding.deviceUid!==AUTO_DEVICE)throw new DriveError(403,'drive/auto-edit-admission-closed');
 if(!batch||!item||batch.deviceUid!==AUTO_DEVICE||batch.claim?.deviceUid!==AUTO_DEVICE||
  !autoHash(batch.planHash)||batch.claim.planHash!==batch.planHash||batch.plan?.batchId!==intent.batchId||
  batch.plan?.deviceUid!==AUTO_DEVICE||batch.plan?.config?.consent!==true||batch.plan.config.model!==AUTO_TURBO||
  !Number.isInteger(batch.plan.config.batchSize)||batch.plan.config.batchSize<1||batch.plan.config.batchSize>100||
  batch.plan.items?.length!==batch.plan.config.batchSize
  ||batch.command?.kind!=='run'||
  batch.execution?.status!=='running'||batch.execution.activeItemId!==intent.itemId||
  batch.execution.commandRevision!==batch.command.revision||batch.execution.publicationRevision!==item.publicationRevision||
  item.status!=='running'||item.itemId!==intent.itemId||item.inFlight?.stage!==item.stage||!autoStages.includes(item.stage))throw new DriveError(403,'drive/auto-edit-claim-required');
 const source=item.source,ordinal=item.ordinal;
 const spec=Number.isSafeInteger(ordinal)&&ordinal>0&&ordinal<=100?batch.plan?.items?.[ordinal-1]:null;
 if(!source||source.authorized!==true||!spec||spec.itemId!==intent.itemId||spec.source?.authorized!==true||
  spec.source.fileId!==source.fileId||spec.source.folderId!==source.folderId||spec.source.mime!==source.mime||
  spec.source.sha256!==source.sha256||!autoDriveId(source.fileId)||!['image/jpeg','image/png'].includes(source.mime)||
  !(multi?autoDriveId(source.folderId)&&source.folderId!==AUTO_STAGING:[PRIVATE_FOLDER,REFERENCES_FOLDER].includes(source.folderId))
  ||(source.sha256!==null&&!autoHash(source.sha256)))throw new DriveError(403,'drive/auto-edit-source-not-authorized');
 if(intent.action==='source')return {source,multi,publicationRevision:item.publicationRevision,output:null};
 const output=item.outputArtifact;
 if(item.stage!=='delivery'||!output||output.mime!=='image/png'||!autoHash(output.sha256)||output.sha256!==item.editReceipt?.sha256||
  !Number.isSafeInteger(output.bytes)||output.bytes<100||output.bytes>AUTO_MAX_BYTES||!item.vision2)throw new DriveError(403,'drive/auto-edit-output-not-ready');
 return {source,multi,publicationRevision:item.publicationRevision,output:{sha256:output.sha256 as string,bytes:output.bytes as number}};
}
let autoCachedAccess:{googleSub:string;revision:number;until:number;accessToken:string}|null=null;
async function autoReadAccess(googleSub:string){
 const cfg=await config(),grant=await sessionGrant();
 if(!grant?.enabled||!grant.refresh||grant.googleSub!==googleSub||(grant.revocationUntil||0)>Date.now())throw new DriveError(409,'drive/reconnect-required');
 if(autoCachedAccess?.googleSub===googleSub&&autoCachedAccess.revision===grant.revision&&autoCachedAccess.until>Date.now())return autoCachedAccess.accessToken;
 const refreshToken=unseal(grant.refresh,cfg.key,refreshContext('read',googleSub));
 let tokens;
 try{tokens=await googlePost('https://oauth2.googleapis.com/token',new URLSearchParams({client_id:CLIENT,client_secret:cfg.clientSecret,grant_type:'refresh_token',refresh_token:refreshToken,scope:BROWSER_REQUEST_SCOPES.join(' ')}));}
 catch(error){if(error instanceof InvalidGrantError)await expireInvalidRefresh(grant,refreshToken,cfg);throw error;}
 const access=await verifiedAccess(tokens.access_token,googleSub);
 const current=await sessionGrant();
 if(!current?.enabled||current.revision!==grant.revision||current.googleSub!==googleSub||(current.revocationUntil||0)>Date.now())throw new DriveError(409,'drive/connection-changed');
 autoCachedAccess={googleSub,revision:grant.revision,until:Math.min(Date.now()+300000,access.expiresAt),accessToken:access.accessToken};
 return access.accessToken;
}
const AUTO_METADATA_FIELDS='id,name,mimeType,parents,ownedByMe,trashed,shared,size,sha256Checksum,md5Checksum';
async function autoGoogleJson(token:string,url:URL){
 // All URLs are constructed below on the fixed Google Drive API origin.
 if(url.origin!=='https://www.googleapis.com'||!url.pathname.startsWith('/drive/v3/files'))throw new DriveError(400,'drive/auto-edit-url-denied');
 let r;
 try{r=await fetch(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(10000)});}
 catch{throw new DriveError(503,'drive/auto-edit-google-unavailable');}
 if(!r.ok){await r.body?.cancel();throw new DriveError(r.status===404?404:r.status===403?403:503,'drive/auto-edit-google-rejected');}
 return r.json();
}
function autoFileSize(file:AutoMetadataFile,minimum=16){
 const bytes=Number(file.size);
 if(typeof file.size!=='string'||!/^\d+$/.test(file.size)||!Number.isSafeInteger(bytes)||bytes<minimum||bytes>AUTO_MAX_BYTES)throw new DriveError(409,'drive/auto-edit-size-invalid');
 return bytes;
}
function autoPrivateChild(file:AutoMetadataFile,id:string,parent:string,mime:string){
 if(file.id!==id||file.ownedByMe!==true||file.trashed!==false||file.shared!==false||file.mimeType!==mime||!Array.isArray(file.parents)||file.parents.length!==1||file.parents[0]!==parent)throw new DriveError(409,'drive/auto-edit-file-identity-mismatch');
}
const autoOutputRef=(id:string)=>db().doc(AUTO_WORKSPACE+'/autoOutputFiles/'+id);
function autoDesktopName(value:unknown):value is string{
 return typeof value==='string'&&value.length>0&&value.length<=255&&value!=='.'&&value!=='..'
  &&!/[<>:"/\\|?*\x00-\x1f]/.test(value)&&!/[. ]$/.test(value)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
}
async function excludedAutoFolders(){
 const accepted=(await autoAcceptedRef().get()).data();
 return new Set([AUTO_STAGING,...(autoDriveId(accepted?.folderId)?[accepted.folderId]:[])]);
}
function autoOutputName(name:unknown){
 return typeof name==='string'&&/^Velum-auto-[0-9a-f]{32}\.png$/i.test(name);
}
async function privateAutoPath(token:string,parent:string){
 const excluded=await excludedAutoFolders(),ancestors:string[]=[],seen=new Set<string>();
 let id=parent;
 while(id!==PRIVATE_FOLDER){
  if(!autoDriveId(id)||excluded.has(id)||seen.has(id)||ancestors.length>=32)throw new DriveError(409,'drive/auto-edit-source-not-authorized');
  const folder=await autoFolderMetadata(token,id),up=folder.parents?.[0];
  autoPrivateChild(folder,id,up||'',AUTO_FOLDER_MIME);
  if(!autoDriveId(up)||!autoDesktopName(folder.name)||(up===PRIVATE_FOLDER&&[AUTO_ACCEPTED_NAME,'Review staging'].includes(folder.name)))throw new DriveError(409,'drive/auto-edit-source-not-authorized');
  ancestors.unshift(folder.name);seen.add(id);id=up;
 }
 const root=await autoFolderMetadata(token,PRIVATE_FOLDER);
 if(root.id!==PRIVATE_FOLDER||root.mimeType!==AUTO_FOLDER_MIME||root.ownedByMe!==true||root.shared!==false||root.trashed!==false)throw new DriveError(409,'drive/auto-edit-source-not-authorized');
 return ancestors;
}
async function autoEditMetadata(req:Request,res:Response){
 const intent=autoIntent(req.body),googleSub=await autoDevice(req),initial=await autoAssigned(intent);
 const token=await autoReadAccess(googleSub);
 if(intent.action==='source'){
  const {source}=initial,url=new URL('https://www.googleapis.com/drive/v3/files/'+source.fileId);
  url.searchParams.set('fields',AUTO_METADATA_FIELDS);
  const file=await autoGoogleJson(token,url) as AutoMetadataFile;
  autoPrivateChild(file,source.fileId,source.folderId,source.mime);
  const sha256=autoHash(file.sha256Checksum)?file.sha256Checksum:null;
  const md5=typeof file.md5Checksum==='string'&&/^[a-f0-9]{32}$/.test(file.md5Checksum)?file.md5Checksum:null;
  if((!sha256&&!md5)||(source.sha256&&source.sha256!==sha256)||!autoDesktopName(file.name))throw new DriveError(409,'drive/auto-edit-source-checksum-unavailable');
  if(initial.multi&&(autoOutputName(file.name)||(await autoOutputRef(source.fileId).get()).exists))throw new DriveError(409,'drive/auto-edit-source-not-authorized');
  const ancestors=initial.multi?await privateAutoPath(token,source.folderId):undefined;
  const current=await autoAssigned(intent);
  if(current.publicationRevision!==initial.publicationRevision)throw new DriveError(409,'drive/auto-edit-claim-changed');
  res.json({verified:true,authorized:true,trashed:false,fileId:source.fileId,folderId:source.folderId,mime:source.mime,name:file.name,bytes:autoFileSize(file),sha256,md5,ancestors});return;
 }
 const output=initial.output!;
 // Deterministic filename scoped to this one item. A mount copy is not proof
 // of cloud delivery. Verify its actual ID, parent and independently reported hash.
 const name='Velum-auto-'+digest(intent.batchId+':'+intent.itemId).slice(0,32)+'.png';
 const folderUrl=new URL('https://www.googleapis.com/drive/v3/files/'+AUTO_STAGING);
 folderUrl.searchParams.set('fields','id,mimeType,parents,ownedByMe,trashed,shared,capabilities(canAddChildren)');
 const folder=await autoGoogleJson(token,folderUrl) as AutoMetadataFile;
 autoPrivateChild(folder,AUTO_STAGING,PRIVATE_FOLDER,'application/vnd.google-apps.folder');
 if(folder.capabilities?.canAddChildren!==true)throw new DriveError(403,'drive/auto-edit-staging-denied');
 const url=new URL('https://www.googleapis.com/drive/v3/files');
 url.searchParams.set('q',"'"+AUTO_STAGING+"' in parents and trashed=false and name='"+name+"'");
 url.searchParams.set('fields','nextPageToken,files('+AUTO_METADATA_FIELDS+')');
 url.searchParams.set('pageSize','2');
 const value=await autoGoogleJson(token,url) as {files?:AutoMetadataFile[];nextPageToken?:string};
 if(!Array.isArray(value.files)||value.nextPageToken||value.files.length>1)throw new DriveError(409,'drive/auto-edit-ambiguous-staging-file');
 const current=await autoAssigned(intent);
 if(current.publicationRevision!==initial.publicationRevision||current.output?.sha256!==output.sha256)throw new DriveError(409,'drive/auto-edit-claim-changed');
 if(!value.files.length){res.json({status:'not-found',confirmed:true,name,parentId:AUTO_STAGING});return;}
 const file=value.files[0];
 if(!autoDriveId(file.id)||file.name!==name)throw new DriveError(409,'drive/auto-edit-staging-identity-mismatch');
 autoPrivateChild(file,file.id,AUTO_STAGING,'image/png');
 const bytes=autoFileSize(file,0);
 if(bytes<output.bytes){
  // The same owned, unshared, exact-name staging file may be an interrupted
  // desktop copy. Return only independently observed identity/checksum, never
  // a success receipt. The PC checks these bytes against its verified output.
  if(!autoHash(file.sha256Checksum))throw new DriveError(409,'drive/auto-edit-staging-checksum-unavailable');
  res.json({status:'partial',verifiedIdentity:true,file:{fileId:file.id,name,parentId:AUTO_STAGING,bytes,sha256:file.sha256Checksum}});return;
 }
 if(bytes!==output.bytes||file.sha256Checksum!==output.sha256)throw new DriveError(409,'drive/auto-edit-staging-hash-mismatch');
 if(initial.multi){
  await autoOutputRef(file.id).create({batchId:intent.batchId,itemId:intent.itemId,sha256:output.sha256})
   .catch(error=>{if(error?.code!==6)throw error;});
 }
 res.json({status:'saved',receipt:{key:intent.batchId+'-'+intent.itemId,fileId:file.id,parentId:AUTO_STAGING,sha256:output.sha256,verified:true}});
}


// Owner-reviewed Auto Edit output only. This path uses the existing management
// grant and move lease; it never exposes the server grant to the browser.
const AUTO_ACCEPTED_NAME='Auto Generated';
const AUTO_FOLDER_MIME='application/vnd.google-apps.folder';
const autoAcceptedRef=()=>db().doc(AUTO_WORKSPACE+'/autoEditControl/acceptedFolder');
async function autoFolderMetadata(token:string,id:string) {
 const url=new URL('https://www.googleapis.com/drive/v3/files/'+id);
 url.searchParams.set('fields','id,name,mimeType,parents,ownedByMe,trashed,shared,capabilities(canAddChildren,canRemoveChildren)');
 return await autoGoogleJson(token,url) as AutoMetadataFile;
}
function checkAcceptedFolder(file:AutoMetadataFile,id:string){
 autoPrivateChild(file,id,PRIVATE_FOLDER,AUTO_FOLDER_MIME);
 if(file.name!==AUTO_ACCEPTED_NAME||file.capabilities?.canAddChildren!==true)throw new DriveError(403,'drive/auto-edit-accepted-folder-invalid');
}
async function findAcceptedFolder(token:string){
 const url=new URL('https://www.googleapis.com/drive/v3/files');
 url.searchParams.set('q',"'"+PRIVATE_FOLDER+"' in parents and trashed=false and name='"+AUTO_ACCEPTED_NAME+"'");
 url.searchParams.set('fields','nextPageToken,files(id,name,mimeType,parents,ownedByMe,trashed,shared,capabilities(canAddChildren))');
 url.searchParams.set('pageSize','2');
 const value=await autoGoogleJson(token,url) as {files?:AutoMetadataFile[];nextPageToken?:string};
 if(!Array.isArray(value.files)||value.nextPageToken||value.files.length>1)throw new DriveError(409,'drive/auto-edit-accepted-folder-ambiguous');
 if(!value.files.length)return null;
 const folder=value.files[0];
 if(!autoDriveId(folder.id))throw new DriveError(409,'drive/auto-edit-accepted-folder-invalid');
 checkAcceptedFolder(folder,folder.id);return folder.id;
}
async function autoAcceptedFolder(token:string,googleSub:string,grant:Grant,verifyOwner:()=>Promise<void>){
 const ref=autoAcceptedRef(),initial=(await ref.get()).data();
 if(initial&&(!autoDriveId(initial.folderId)||!['reserved','ready'].includes(initial.status)||initial.version!==1))throw new DriveError(409,'drive/auto-edit-accepted-folder-invalid');
 const found=await findAcceptedFolder(token);
 if(initial&&found&&initial.folderId!==found)throw new DriveError(409,'drive/auto-edit-accepted-folder-conflict');
 if(initial?.status==='ready'&&!found)throw new DriveError(409,'drive/auto-edit-accepted-folder-missing');
 let proposed=initial?.folderId||found;
 if(!proposed){
  const url=new URL('https://www.googleapis.com/drive/v3/files/generateIds');
  url.searchParams.set('count','1');url.searchParams.set('space','drive');
  const value=await autoGoogleJson(token,url) as {ids?:string[]};
  if(value.ids?.length!==1||!autoDriveId(value.ids[0]))throw new DriveError(503,'drive/auto-edit-folder-reservation-failed');
  proposed=value.ids[0];
 }
 await verifyOwner();
 managementGrant(await sessionGrant('management'),googleSub,grant);
 const folderId=await db().runTransaction(async tx=>{
  const [saved,g,p]=await Promise.all([tx.get(ref),tx.get(grantRef('management')),tx.get(revocations('management').limit(1))]);
  if(!p.empty)throw new DriveError(409,'drive/revocation-pending');
  managementGrant(g.data() as Grant|undefined,googleSub,grant);
  const existing=saved.data();
  if(existing){
   if(!autoDriveId(existing.folderId)||existing.version!==1||!['reserved','ready'].includes(existing.status)||(found&&existing.folderId!==found))throw new DriveError(409,'drive/auto-edit-accepted-folder-conflict');
   return existing.folderId as string;
  }
  tx.create(ref,{version:1,folderId:proposed,status:'reserved',updatedAt:Date.now()});
  return proposed as string;
 });
 let folder:AutoMetadataFile|undefined;
 try{folder=await autoFolderMetadata(token,folderId);}
 catch(error){if(!(error instanceof DriveError&&error.status===404))throw error;}
 if(!folder){
  if(initial?.status==='ready'||found)throw new DriveError(409,'drive/auto-edit-accepted-folder-missing');
  // Re-check the exact name before attempting creation. Use the same reserved
  // Drive ID after any uncertain response; never generate a second folder ID.
  const latest=await findAcceptedFolder(token);
  if(latest&&latest!==folderId)throw new DriveError(409,'drive/auto-edit-accepted-folder-conflict');
  if(latest===folderId)folder=await autoFolderMetadata(token,folderId);
  else {
   const parent=await googleFile(token,PRIVATE_FOLDER);
   folderAccess(parent.file,PRIVATE_FOLDER,'canAddChildren');
   await verifyOwner();
   managementGrant(await sessionGrant('management'),googleSub,grant);
   const url=new URL('https://www.googleapis.com/drive/v3/files');
   url.searchParams.set('fields','id');
   let created;
   try{created=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id:folderId,name:AUTO_ACCEPTED_NAME,mimeType:AUTO_FOLDER_MIME,parents:[PRIVATE_FOLDER]}),redirect:'error',signal:AbortSignal.timeout(10000)});}
   catch{throw new DriveError(503,'drive/auto-edit-folder-create-unconfirmed');}
   const status=created.status;await created.body?.cancel();
   if(!created.ok&&status!==409)throw new DriveError(status>=400&&status<500?status:503,'drive/auto-edit-folder-create-rejected');
   folder=await autoFolderMetadata(token,folderId);
  }
 }
 checkAcceptedFolder(folder,folderId);
 if(await findAcceptedFolder(token)!==folderId)throw new DriveError(409,'drive/auto-edit-accepted-folder-conflict');
 await db().runTransaction(async tx=>{
  const [saved,g,p]=await Promise.all([tx.get(ref),tx.get(grantRef('management')),tx.get(revocations('management').limit(1))]);
  if(!p.empty)throw new DriveError(409,'drive/revocation-pending');
  managementGrant(g.data() as Grant|undefined,googleSub,grant);
  if(saved.data()?.folderId!==folderId)throw new DriveError(409,'drive/auto-edit-accepted-folder-conflict');
  tx.update(ref,{status:'ready',updatedAt:Date.now()});
 });
 return folderId;
}
type AutoReviewRecord={version:number;batchId:string;itemId:string;decision:string;feedback:string;decidedAt:number;status:string;sourceFileId:string;fileId:string;sha256:string;parentId?:string;moveReceiptId?:string};
async function autoReviewEvidence(batchId:string,itemId:string){
 const root=db(),reviewRef=root.doc(AUTO_WORKSPACE+'/autoReviews/'+batchId+'-'+itemId),itemRef=root.doc(AUTO_WORKSPACE+'/autoBatches/'+batchId+'/items/'+itemId);
 const [reviewDoc,itemDoc]=await Promise.all([reviewRef.get(),itemRef.get()]);
 const review=reviewDoc.data() as AutoReviewRecord|undefined,item=itemDoc.data();
 if(!review||review.version!==1||review.batchId!==batchId||review.itemId!==itemId||review.decision!=='okay'||!['accepted-pending-move','accepted'].includes(review.status)
  ||!Number.isSafeInteger(review.decidedAt)||review.decidedAt<=0||review.decidedAt>Date.now()+300000
  ||!autoDriveId(review.fileId)||!autoHash(review.sha256)||!item||item.status!=='review-ready'||item.receipt?.verified!==true
  ||item.receipt.key!==batchId+'-'+itemId||item.source?.authorized!==true
  ||item.receipt.parentId!==AUTO_STAGING||item.receipt.fileId!==review.fileId||item.receipt.sha256!==review.sha256
  ||item.outputArtifact?.sha256!==review.sha256||item.outputArtifact?.mime!=='image/png'||item.source?.fileId!==review.sourceFileId
  ||!Number.isSafeInteger(item.outputArtifact.bytes)||item.outputArtifact.bytes<100||item.outputArtifact.bytes>AUTO_MAX_BYTES)throw new DriveError(403,'drive/auto-edit-review-not-authorized');
 return {review,reviewRef,itemRef,bytes:item.outputArtifact.bytes as number};
}
async function autoReviewFile(token:string,review:AutoReviewRecord,bytes:number,allowed:string[]){
 const url=new URL('https://www.googleapis.com/drive/v3/files/'+review.fileId);url.searchParams.set('fields',AUTO_METADATA_FIELDS+',capabilities(canMoveItemWithinDrive)');
 const file=await autoGoogleJson(token,url) as AutoMetadataFile;
 const parent=file.parents?.[0];
 if(!parent||!allowed.includes(parent))throw new DriveError(409,'drive/auto-edit-review-file-moved');
 autoPrivateChild(file,review.fileId,parent,'image/png');
 if(autoFileSize(file)!==bytes||file.sha256Checksum!==review.sha256)throw new DriveError(409,'drive/auto-edit-review-hash-mismatch');
 return file;
}
async function autoEditReviewMove(req:Request,res:Response){
 const identity=await owner(req),body=req.body;
 if(!body||Object.keys(body).length!==2||!autoId(body.batchId)||!autoItemId(body.itemId))throw new DriveError(400,'drive/invalid-auto-edit-review');
 const evidence=await autoReviewEvidence(body.batchId,body.itemId),review=evidence.review;
 if(review.status==='accepted'){
  if(!autoDriveId(review.parentId)||!autoHash(review.moveReceiptId))throw new DriveError(409,'drive/auto-edit-review-receipt-invalid');
  res.json({status:'accepted',fileId:review.fileId,parentId:review.parentId,sha256:review.sha256,receiptId:review.moveReceiptId});return;
 }
 const cfg=await config('management'),grant=managementGrant(await sessionGrant('management'),identity.googleSub),access=await managementAccess(grant,identity.googleSub,cfg);
 const verifyOwner=async()=>{const current=await owner(req);if(current.googleSub!==identity.googleSub)throw new DriveError(409,'drive/identity-changed');};
 // Confirm this exact reviewed output before provisioning the accepted folder.
 const existing=(await autoAcceptedRef().get()).data();
 const allowed=[AUTO_STAGING,...(existing&&autoDriveId(existing.folderId)?[existing.folderId]:[])];
 await autoReviewFile(access.accessToken,review,evidence.bytes,allowed);
 const destination=await autoAcceptedFolder(access.accessToken,identity.googleSub,grant,verifyOwner);
 const intent:MoveIntent={id:review.fileId,from:AUTO_STAGING,to:destination,at:review.decidedAt};
 const {receiptId,leaseId,receipt}=await claimMove(intent,identity.googleSub,grant);
 let uncertain=receipt.phase==='pending'||receipt.phase==='confirmed';
 try{
  managementGrant(await sessionGrant('management'),identity.googleSub,grant);
  let file=await autoReviewFile(access.accessToken,review,evidence.bytes,[AUTO_STAGING,destination]);
  let parent=file.parents![0];
  if(parent===destination&&!['pending','confirmed'].includes(receipt.phase))throw new DriveError(409,'drive/auto-edit-review-file-moved');
  if(parent===AUTO_STAGING){
   if(receipt.phase==='confirmed')throw new DriveError(409,'drive/receipt-no-longer-current');
   const staging=await autoFolderMetadata(access.accessToken,AUTO_STAGING);
   autoPrivateChild(staging,AUTO_STAGING,PRIVATE_FOLDER,AUTO_FOLDER_MIME);
   folderAccess(staging,AUTO_STAGING,'canRemoveChildren');
   checkAcceptedFolder(await autoFolderMetadata(access.accessToken,destination),destination);
   const current=await googleFile(access.accessToken,intent.id);
   if(imageParent(current.file,intent.id)!==AUTO_STAGING||current.file.capabilities?.canMoveItemWithinDrive!==true)throw new DriveError(409,'drive/auto-edit-review-file-moved');
   file=await autoReviewFile(access.accessToken,review,evidence.bytes,[AUTO_STAGING]);
   await verifyOwner();
   const latest=await autoReviewEvidence(body.batchId,body.itemId);
   if(latest.review.status!=='accepted-pending-move'||latest.review.fileId!==review.fileId||latest.review.sha256!==review.sha256)throw new DriveError(409,'drive/auto-edit-review-changed');
   await beginMoveWrite(intent,identity.googleSub,grant,receiptId,leaseId);uncertain=true;
   await googleFile(access.accessToken,intent.id,'PATCH',{from:AUTO_STAGING,to:destination,etag:current.etag});
  }
  file=await autoReviewFile(access.accessToken,review,evidence.bytes,[destination]);
  checkAcceptedFolder(await autoFolderMetadata(access.accessToken,destination),destination);
  await verifyOwner();await finishMove(intent,identity.googleSub,grant,receiptId,leaseId);
  await db().runTransaction(async tx=>{
   const [current,item,folder,g,p]=await Promise.all([tx.get(evidence.reviewRef),tx.get(evidence.itemRef),tx.get(autoAcceptedRef()),tx.get(grantRef('management')),tx.get(revocations('management').limit(1))]);
   if(!p.empty)throw new DriveError(409,'drive/revocation-pending');
   managementGrant(g.data() as Grant|undefined,identity.googleSub,grant);
   const r=current.data() as AutoReviewRecord|undefined;
   if(!r||r.decision!=='okay'||r.fileId!==review.fileId||r.sha256!==review.sha256||r.decidedAt!==review.decidedAt||item.data()?.receipt?.fileId!==review.fileId||folder.data()?.folderId!==destination||folder.data()?.status!=='ready')throw new DriveError(409,'drive/auto-edit-review-changed');
   if(r.status==='accepted'){
    if(r.parentId!==destination||r.moveReceiptId!==receiptId)throw new DriveError(409,'drive/auto-edit-review-conflict');
   }else if(r.status==='accepted-pending-move')tx.update(evidence.reviewRef,{status:'accepted',parentId:destination,moveReceiptId:receiptId,acceptedAt:Date.now()});
   else throw new DriveError(409,'drive/auto-edit-review-changed');
  });
  res.json({status:'accepted',fileId:review.fileId,parentId:destination,sha256:review.sha256,receiptId});
 }catch(error){
  // After a possible Drive mutation keep the same lease/receipt for retry.
  if(!uncertain)await rejectUnwrittenMove(intent,identity.googleSub,receiptId,leaseId);
  throw error;
 }
}

const autoRef=(suffix:string)=>db().doc(AUTO_WORKSPACE+'/'+suffix);
const autoVersionRef=(id:string)=>autoRef('autoSeedVersions/'+id);
const autoUseRef=(version:string,file:string)=>autoVersionRef(version).collection('sources').doc(file);
type BatchForm={batchId:string;count:number;instructions:string;visionGuidance:string;revisionId?:string;consent:true};
type BatchSource={fileId:string;folderId:string;mime:string;authorized:true;sha256:string};
type LegacySource={batchId:string;itemId:string;source:BatchSource;revisionId:string;createdAt:number;outputId?:string};
function batchForm(value:any):BatchForm{
 if(!value||!autoId(value.batchId)||value.consent!==true||!Number.isInteger(value.count)||value.count<1||value.count>100||
  typeof value.instructions!=='string'||!value.instructions.trim()||value.instructions.length>3998||
  typeof value.visionGuidance!=='string'||value.visionGuidance.length>4000||
  (value.revisionId!==undefined&&!autoId(value.revisionId))||
  Object.keys(value).some(k=>!['batchId','count','instructions','visionGuidance','revisionId','consent'].includes(k)))throw new DriveError(400,'drive/invalid-auto-edit-batch');
 return value;
}
function activeAutoAdmission(value:admin.firestore.DocumentData|undefined,now:number){
 return value?.enabled===true&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>now;
}
function readyAutoWorker(status:admin.firestore.DocumentData|undefined,binding:admin.firestore.DocumentData|undefined,now:number){
 if(binding?.status!=='approved'||binding.deviceUid!==AUTO_DEVICE||status?.deviceUid!==AUTO_DEVICE||status.state!=='idle'||
  status.version!=='2.3.2'||status.autoEditBatchVersion!==2||!Number.isSafeInteger(status.updatedAt)||
  status.updatedAt<now-90000||status.updatedAt>now+30000||status.autoEditReadyAt!==status.updatedAt||status.autoEditBatchReadyAt!==status.updatedAt||
  !status.installed?.includes(AUTO_TURBO)||!status.capabilities?.referenceModels?.includes(AUTO_TURBO))throw new DriveError(409,'drive/auto-edit-pc-not-ready');
}
function seedFor(revisionId:string){return 'seed-'+digest(revisionId).slice(0,32);}
function autoRevisionResolver(){
 const cache=new Map<string,admin.firestore.DocumentData>();
 async function read(id:string){
  if(!cache.has(id)){
   const value=(await autoRef('autoConfigs/'+id).get()).data();
   if(!value||value.revisionId!==id||typeof value.config?.instructions!=='string')throw new DriveError(409,'drive/auto-edit-version-unavailable');
   cache.set(id,value);
  }
  return cache.get(id)!;
 }
 async function version(id:string){
  const seen=new Set<string>();
  while(true){
   if(seen.has(id)||seen.size>=128)throw new DriveError(409,'drive/auto-edit-version-lineage-invalid');
   seen.add(id);
   const r=await read(id);
   if(autoId(r.seedVersionId))return r.seedVersionId as string;
   const prior=r.restoredFromRevisionId??r.parentRevisionId;
   if(!autoId(prior)||(await read(prior)).config.instructions!==r.config.instructions)return seedFor(id);
   id=prior;
  }
 }
 return {read,version};
}
async function historicalAutoSelections(deadline:number){
 const parent=db().collection(AUTO_WORKSPACE+'/autoBatches').where('schemaVersion','==',1).orderBy(admin.firestore.FieldPath.documentId());
 const sources:LegacySource[]=[];
 let cursor:admin.firestore.QueryDocumentSnapshot|undefined;
 do{
  if(Date.now()>=deadline)throw new DriveError(503,'drive/auto-edit-catalog-timeout');
  const page=await (cursor?parent.startAfter(cursor):parent).limit(50).get();
  if(page.empty)break;
  const oldItems=await db().getAll(...page.docs.map(d=>d.ref.collection('items').doc('item-001')));
  page.docs.forEach((d,i)=>{
   const item=d.data().plan?.items?.[0],revisionId=d.data().plan?.config?.revisionId;
   if(!item||!autoId(revisionId)||!autoDriveId(item.source?.fileId))throw new DriveError(409,'drive/auto-edit-pilot-history-invalid');
   const output=oldItems[i].data()?.receipt?.fileId;
   sources.push({batchId:d.id,itemId:item.itemId,source:item.source,revisionId,createdAt:d.data().createdAt,...(autoDriveId(output)?{outputId:output}:{})});
  });
  cursor=page.docs.length===50?page.docs.at(-1):undefined;
 }while(cursor);
 return sources;
}
async function autoCatalog(token:string,used:Set<string>,historicalOutputs:Set<string>,deadline:number){
 const root=await autoFolderMetadata(token,PRIVATE_FOLDER);
 if(root.id!==PRIVATE_FOLDER||root.mimeType!==AUTO_FOLDER_MIME||root.ownedByMe!==true||root.shared!==false||root.trashed!==false)throw new DriveError(409,'drive/auto-edit-private-folder-invalid');
 const excluded=await excludedAutoFolders(),seen=new Set<string>(),pool=new Map<string,BatchSource>();
 const folders=[{id:PRIVATE_FOLDER,depth:0}];
 for(const folder of folders){
  if(seen.has(folder.id))continue;
  seen.add(folder.id);
  let pageToken:string|undefined;
  const tokens=new Set<string>();
  do{
   if(Date.now()>=deadline)throw new DriveError(503,'drive/auto-edit-catalog-timeout');
   const url=new URL('https://www.googleapis.com/drive/v3/files');
   url.searchParams.set('q',`'${folder.id}' in parents and trashed=false and (mimeType='${AUTO_FOLDER_MIME}' or mimeType='image/jpeg' or mimeType='image/png')`);
   url.searchParams.set('fields','nextPageToken,files('+AUTO_METADATA_FIELDS+')');
   url.searchParams.set('pageSize','1000');
   url.searchParams.set('spaces','drive');
   if(pageToken)url.searchParams.set('pageToken',pageToken);
   const page=await autoGoogleJson(token,url) as {files?:AutoMetadataFile[];nextPageToken?:string};
   if(!Array.isArray(page.files))throw new DriveError(503,'drive/auto-edit-catalog-invalid');
   for(const file of page.files){
    if(!autoDriveId(file.id)||file.ownedByMe!==true||file.shared!==false||file.trashed!==false||file.parents?.length!==1||
     file.parents[0]!==folder.id||!autoDesktopName(file.name))continue;
    if(file.mimeType===AUTO_FOLDER_MIME){
     if(!excluded.has(file.id)&&!(folder.id===PRIVATE_FOLDER&&[AUTO_ACCEPTED_NAME,'Review staging'].includes(file.name))){
      if(folder.depth===32)throw new DriveError(409,'drive/auto-edit-folder-depth-exceeded');
      folders.push({id:file.id,depth:folder.depth+1});
     }
     continue;
    }
    const bytes=Number(file.size);
    if(!['image/jpeg','image/png'].includes(file.mimeType||'')||!autoHash(file.sha256Checksum)||!Number.isSafeInteger(bytes)||
     bytes<16||bytes>AUTO_MAX_BYTES||autoOutputName(file.name)||used.has(file.id)||historicalOutputs.has(file.id))continue;
    pool.set(file.id,{fileId:file.id,folderId:folder.id,mime:file.mimeType!,authorized:true,sha256:file.sha256Checksum!});
   }
   pageToken=page.nextPageToken;
   if(pageToken&&tokens.has(pageToken))throw new DriveError(503,'drive/auto-edit-catalog-invalid');
   if(pageToken)tokens.add(pageToken);
  }while(pageToken);
 }
 return [...pool.values()];
}
async function autoEditStartBatch(req:Request,res:Response){
 const deadline=Date.now()+38000,identity=await owner(req),form=batchForm(req.body);
 const batchRef=autoRef('autoBatches/'+form.batchId),admitRef=autoRef('autoEditControl/admission'),pointerRef=autoRef('autoEditControl/currentConfig');
 const statusRef=autoRef('status/pc'),bindingRef=autoRef('devices/'+AUTO_DEVICE);
 const requestHash=digest(JSON.stringify([form.count,form.instructions,form.visionGuidance,form.revisionId??null]));
 const response=(batch:admin.firestore.DocumentData,admit:admin.firestore.DocumentData|undefined)=>({
  batchId:form.batchId,seedVersionId:batch.plan.seedVersionId,revisionId:batch.plan.config.revisionId,count:batch.plan.items.length,
  expiresAt:admit?.batchId===form.batchId?admit.expiresAt:batch.admissionExpiresAt
 });
 const [existing,admission,pointer,status,binding]=await db().getAll(batchRef,admitRef,pointerRef,statusRef,bindingRef);
 if(existing.exists){
  const b=existing.data()!;
  if(b.schemaVersion!==2||b.requestHash!==requestHash)throw new DriveError(409,'drive/auto-edit-request-conflict');
  res.json(response(b,admission.data()));return;
 }
 if(activeAutoAdmission(admission.data(),Date.now()))throw new DriveError(409,'drive/auto-edit-admission-in-use');
 readyAutoWorker(status.data(),binding.data(),Date.now());
 const currentId=pointer.data()?.revisionId, baseId=form.revisionId??currentId,resolver=autoRevisionResolver();
 const base=autoId(baseId)?await resolver.read(baseId):null;
 const sameSeed=base?.config.instructions===form.instructions;
 const reuse=sameSeed&&base?.config.visionGuidance===form.visionGuidance&&base?.config.model===AUTO_TURBO;
 const revisionId=reuse?base!.revisionId:'config-'+digest(form.batchId).slice(0,32);
 const seedVersionId=sameSeed?await resolver.version(base!.revisionId):seedFor(revisionId);
 const initial=[await autoVersionRef(seedVersionId).get(),await historicalAutoSelections(deadline)] as const;
 const legacy:LegacySource[]=[];
 const outputIds=new Set<string>();
 for(const source of initial[1]){
  if(source.outputId)outputIds.add(source.outputId);
  if(await resolver.version(source.revisionId)===seedVersionId)legacy.push(source);
 }
 const used=new Set(legacy.map(x=>x.source.fileId));
 const tracked=autoVersionRef(seedVersionId).collection('sources').select().orderBy(admin.firestore.FieldPath.documentId());
 let cursor:admin.firestore.QueryDocumentSnapshot|undefined;
 do{
  if(Date.now()>=deadline)throw new DriveError(503,'drive/auto-edit-catalog-timeout');
  const page=await (cursor?tracked.startAfter(cursor):tracked).limit(300).get();
  for(const doc of page.docs)used.add(doc.id);
  cursor=page.docs.length===300?page.docs.at(-1):undefined;
 }while(cursor);
 const token=await autoReadAccess(identity.googleSub);
 const pool=await autoCatalog(token,used,outputIds,deadline);
 // Shuffle once. Consult the receipt index in chunks, stopping once a full
 // sample is available. Every eligible original has an equal draw chance.
 for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
 const chosen:BatchSource[]=[];
 for(let i=0;i<pool.length&&chosen.length<form.count;i+=32){
  if(Date.now()>=deadline)throw new DriveError(503,'drive/auto-edit-catalog-timeout');
  const part=pool.slice(i,i+32), outputs=await db().getAll(...part.map(x=>autoOutputRef(x.fileId)));
  part.forEach((x,j)=>{if(!outputs[j].exists&&chosen.length<form.count)chosen.push(x);});
 }
 if(chosen.length<form.count)throw new AutoStockError(chosen.length);
 const now=Date.now(), config={instructions:form.instructions,visionGuidance:form.visionGuidance,model:AUTO_TURBO,
  vision1:'qwen3-vl-2b-instruct',vision2:'qwen3-vl-4b-instruct',sourceScope:'both',batchSize:form.count,revisionId,consent:true};
 const items=chosen.map((source,i)=>({itemId:'item-'+String(i+1).padStart(3,'0'),ordinal:i+1,source,seed:randomInt(0,2147483648)}));
 const plan={schemaVersion:2,batchId:form.batchId,deviceUid:AUTO_DEVICE,createdAt:now,seedVersionId,config,items};
 const planHash=digest(JSON.stringify(plan)),expiresAt=now+AUTO_BATCH_TTL;
 const batch={schemaVersion:2,deviceUid:AUTO_DEVICE,createdAt:now,planHash,plan,command:{kind:'run',revision:0,retryItemId:null},
  dispatch:true,claim:null,execution:null,requestHash,admissionExpiresAt:expiresAt};
 const control={version:2,enabled:true,mode:'batch',batchId:form.batchId,planHash,expiresAt,updatedAt:now};
 const legacyById=new Map<string,LegacySource>();
 for(const entry of legacy)if(!legacyById.has(entry.source.fileId))legacyById.set(entry.source.fileId,entry);
 const history=[...legacyById.values()];
 if(history.length>300||Date.now()>=deadline)throw new DriveError(503,'drive/auto-edit-catalog-timeout');
 const reservations=[...items.map(i=>i.source.fileId),...history.map(i=>i.source.fileId)].map(id=>autoUseRef(seedVersionId,id));
 const versionRef=autoVersionRef(seedVersionId);
 const answer=await db().runTransaction(async tx=>{
  const [b,a,p,s,d,v]=await tx.getAll(batchRef,admitRef,pointerRef,statusRef,bindingRef,versionRef);
  if(b.exists){
   if(b.data()?.schemaVersion!==2||b.data()?.requestHash!==requestHash)throw new DriveError(409,'drive/auto-edit-request-conflict');
   return response(b.data()!,a.data());
  }
  if(activeAutoAdmission(a.data(),Date.now()))throw new DriveError(409,'drive/auto-edit-admission-in-use');
  readyAutoWorker(s.data(),d.data(),Date.now());
  if(p.data()?.revisionId!==currentId)throw new DriveError(409,'drive/auto-edit-version-changed');
  const rows=await tx.getAll(...reservations);
  if(rows.slice(0,items.length).some(row=>row.exists))throw new DriveError(409,'drive/auto-edit-selection-changed');
  if(!v.exists)tx.create(versionRef,{version:1,seedVersionId,instructions:form.instructions,createdAt:now,revisionId});
  else if(v.data()?.instructions!==form.instructions)throw new DriveError(409,'drive/auto-edit-version-changed');
  if(!reuse)tx.create(autoRef('autoConfigs/'+revisionId),{version:1,revisionId,config:{...config,batchSize:1},approvedAt:now,
   parentRevisionId:currentId??null,kind:'manual',restoredFromRevisionId:null,learningId:null,reason:'Auto Edit batch',seedVersionId});
  if(currentId!==revisionId)tx.set(pointerRef,{version:1,revisionId,updatedAt:now});
  for(const [i,item] of items.entries())tx.create(reservations[i],{batchId:form.batchId,itemId:item.itemId,fileId:item.source.fileId,pickedAt:now});
  for(const [i,item] of history.entries())if(!rows[items.length+i].exists)tx.create(reservations[items.length+i],{batchId:item.batchId,itemId:item.itemId,fileId:item.source.fileId,pickedAt:item.createdAt});
  tx.create(batchRef,batch);tx.set(admitRef,control);
  return response(batch,control);
 });
 res.json(answer);
}
async function autoEditRenewBatch(req:Request,res:Response){
 const identity=await owner(req),id=req.body?.batchId;
 if(!autoId(id)||Object.keys(req.body).length!==1)throw new DriveError(400,'drive/invalid-auto-edit-batch');
 await autoReadAccess(identity.googleSub);
 const batchRef=autoRef('autoBatches/'+id),admitRef=autoRef('autoEditControl/admission');
 const value=await db().runTransaction(async tx=>{
  const [b,a,s,d]=await tx.getAll(batchRef,admitRef,autoRef('status/pc'),autoRef('devices/'+AUTO_DEVICE));
  const batch=b.data(),control=a.data(),now=Date.now();
  if(batch?.schemaVersion!==2||batch.deviceUid!==AUTO_DEVICE||!autoHash(batch.planHash)||
   batch.command?.kind==='stop'||['completed','stopped'].includes(batch.execution?.status))throw new DriveError(409,'drive/auto-edit-not-renewable');
  if(activeAutoAdmission(control,now)){
   if(control?.mode==='batch'&&control.batchId===id&&control.planHash===batch.planHash)return control.expiresAt;
   throw new DriveError(409,'drive/auto-edit-admission-in-use');
  }
  readyAutoWorker(s.data(),d.data(),now);
  const expiresAt=now+AUTO_BATCH_TTL;
  tx.update(batchRef,{admissionExpiresAt:expiresAt});
  tx.set(admitRef,{version:2,enabled:true,mode:'batch',batchId:id,planHash:batch.planHash,expiresAt,updatedAt:now});
  return expiresAt;
 });
 res.json({batchId:id,expiresAt:value});
}

export const velumDrive=onRequest({region:'us-central1',serviceAccount:RUNTIME_SERVICE_ACCOUNT,memory:'256MiB',timeoutSeconds:60,maxInstances:2,invoker:'public',cors:false},async(req,res)=>{
 res.set({'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin, Authorization, Cookie'});
 const path=req.path.replace(/^\/api\/drive/,'');
 try{
  if(req.method==='GET'&&path==='/health'){
   const optionalManagement=managementHealth();
   if(OFFLINE_ENABLED)await config();
   const managementConfigured=await optionalManagement;
   res.json({service:'velum-drive',version:'offline-v3.1',ready:OFFLINE_ENABLED,managementProxy:true,managementConfigured,managementClientId:managementConfigured?MANAGEMENT_CLIENT:''});return;
  }
  if(req.method==='GET'&&path==='/callback'){await callback(req,res);return;}
  if(req.method!=='POST'){res.status(405).json({code:'drive/method-not-allowed'});return;}
  if(Number(req.get('content-length')||0)>(path==='/auto-edit-batch'?65536:2048))throw new DriveError(413,'drive/invalid-request');
  if(path==='/start')await start(req,res);
  else if(path==='/session')await session(req,res);
  else if(path==='/auto-edit-metadata')await autoEditMetadata(req,res);
  else if(path==='/auto-edit-review')await autoEditReviewMove(req,res);
  else if(path==='/auto-edit-batch')await autoEditStartBatch(req,res);
  else if(path==='/auto-edit-renew')await autoEditRenewBatch(req,res);
   else if(path==='/move')await move(req,res);
   else if(path==='/move-status')await moveStatus(req,res);
  else if(path==='/disconnect')await disconnect(req,res);
  else if(path==='/move-diagnostic')await moveDiagnostic(req,res);
  else res.status(404).json({code:'drive/not-found'});
 }catch(error){
  const known=error instanceof DriveError;
   res.status(known?error.status:503).json({code:known?error.code:'drive/unavailable',...(error instanceof AutoStockError?{eligibleCount:error.eligibleCount}:{}),...(error instanceof MoveError?{receiptId:error.receiptId,phase:error.phase,...(error.googleStatus?{status:error.googleStatus,reason:error.reason}: {})}: {})});
 }
});
