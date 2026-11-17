import * as admin from 'firebase-admin';
import {onRequest} from 'firebase-functions/v2/https';
import {GoogleAuth, OAuth2Client} from 'google-auth-library';
import {createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual} from 'node:crypto';
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
  if(Number(req.get('content-length')||0)>2048)throw new DriveError(413,'drive/invalid-request');
  if(path==='/start')await start(req,res);
  else if(path==='/session')await session(req,res);
   else if(path==='/move')await move(req,res);
   else if(path==='/move-status')await moveStatus(req,res);
  else if(path==='/disconnect')await disconnect(req,res);
  else if(path==='/move-diagnostic')await moveDiagnostic(req,res);
  else res.status(404).json({code:'drive/not-found'});
 }catch(error){
  const known=error instanceof DriveError;
   res.status(known?error.status:503).json({code:known?error.code:'drive/unavailable',...(error instanceof MoveError?{receiptId:error.receiptId,phase:error.phase,...(error.googleStatus?{status:error.googleStatus,reason:error.reason}: {})}: {})});
 }
});
