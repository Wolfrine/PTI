import * as admin from 'firebase-admin';
import {onRequest} from 'firebase-functions/v2/https';
import {GoogleAuth, OAuth2Client} from 'google-auth-library';
import {createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import type {Request, Response} from 'express';

const PROJECT='pti-app-2ab59';
const OWNER='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
const ORIGIN='https://pti-app-2ab59-velum.web.app';
const CALLBACK=ORIGIN+'/api/drive/callback';
const CLIENT='185802494856-rn0q6qi5goj0mifha0bkah55slu3kvju.apps.googleusercontent.com';
const ROOT='_velumDrivePrivate';
const SCOPES=['https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/drive.metadata','https://www.googleapis.com/auth/drive.file'];
const COOKIE='__session'; // Firebase Hosting forwards only this cookie to rewritten Functions.
const TTL=10*60*1000;
// Activation is separate from deployment: the shared OAuth client secret is currently inaccessible.
// Enable only after both exact Secret Manager versions, runtime IAM and the fixed redirect are configured.
const OFFLINE_ENABLED=false;
const cloud=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
const oidc=new OAuth2Client(CLIENT);
type Config={clientSecret:string;key:Buffer};
type Envelope={iv:string;tag:string;ciphertext:string};
type Grant={revision:number;googleSub:string;enabled:boolean;refresh?:Envelope;pendingHash?:string;lastStartedAt?:number;revocationUntil?:number};
class DriveError extends Error{constructor(public status:number,public code:string){super(code);}}
const db=()=>admin.firestore();
const grantRef=()=>db().doc(`${ROOT}/connection`);
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const same=(a:string,b:string)=>timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
let cachedConfig:{until:number;value:Config}|undefined;
async function config():Promise<Config>{
 if(!OFFLINE_ENABLED)throw new DriveError(503,'drive/not-configured');
 if(cachedConfig&&cachedConfig.until>Date.now())return cachedConfig.value;
 try{
  const client=await cloud.getClient();
  const read=async(name:string)=>{
   const r=await client.request<{payload:{data:string}}>({url:`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${name}/versions/latest:access`,timeout:10000});
   return Buffer.from(r.data.payload.data,'base64');
  };
  const [secret,keyText]=await Promise.all([read('VELUM_DRIVE_CLIENT_SECRET'),read('VELUM_DRIVE_TOKEN_KEY')]);
  const key=Buffer.from(keyText.toString('utf8').trim(),'base64');
  if(!secret.length||key.length!==32)throw new Error('configuration');
  const value={clientSecret:secret.toString('utf8').trim(),key};
  cachedConfig={until:Date.now()+60000,value};return value;
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
  if(!r.ok)throw new DriveError(409,value.error==='invalid_grant'?'drive/reconnect-required':'drive/google-unavailable');
  return value;
 }catch(error){if(error instanceof DriveError)throw error;throw new DriveError(503,'drive/google-unavailable');}
}
async function verifiedAccess(accessToken:unknown,googleSub:string){
 if(typeof accessToken!=='string'||!accessToken)throw new DriveError(409,'drive/reconnect-required');
 const info=await googlePost('https://oauth2.googleapis.com/tokeninfo',new URLSearchParams({access_token:accessToken}));
 const scopes=String(info.scope||'').split(/\s+/),seconds=Number(info.expires_in);
 if((info.aud||info.audience||info.issued_to)!==CLIENT||(info.sub||info.user_id)!==googleSub||!SCOPES.every(s=>scopes.includes(s))||!Number.isFinite(seconds)||seconds<=90)throw new DriveError(409,'drive/reconnect-required');
 return {accessToken,expiresAt:Date.now()+Math.min(seconds-60,45*60)*1000,scopes};
}
function clearCookie(res:Response){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/api/drive; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);}
async function revoke(token:string){
 const response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new DriveError(503,'drive/revocation-pending');
}
async function drainRevocations(cfg:Config){
 const pending=await db().collection(`${ROOT}/revocations/items`).limit(10).get();
 for(const item of pending.docs){await revoke(unseal(item.data().sealed,cfg.key,`revocation:${item.id}`));await item.ref.delete();}
 if(!(await db().collection(`${ROOT}/revocations/items`).limit(1).get()).empty)throw new DriveError(409,'drive/revocation-pending');
}
async function rejectIssuance(token:string,cfg:Config){
 const ref=db().collection(`${ROOT}/revocations/items`).doc();
 // Storage and Google's revoke endpoint fail independently; always attempt both.
 try{await ref.set({sealed:seal(token,cfg.key,`revocation:${ref.id}`),createdAt:admin.firestore.FieldValue.serverTimestamp()});}catch{}
 try{await db().runTransaction(async tx=>{
   const current=(await tx.get(grantRef())).data() as Grant|undefined;
   tx.set(grantRef(),{enabled:false,revision:(current?.revision||0)+1,revocationUntil:Date.now()+TTL},{merge:true});
  });}catch{}
 await revoke(token);
 try{await ref.delete();}catch{}
}
async function start(req:Request,res:Response){
 const identity=await owner(req),cfg=await config();
 await drainRevocations(cfg);
 const state=random(),hash=digest(state),binding=random(),verifier=random()+random(),nonce=random(),now=Date.now();
 const attempt=db().doc(`${ROOT}/oauth/attempts/${hash}`);
 await db().runTransaction(async tx=>{
  const snapshot=await tx.get(grantRef()),grant=snapshot.data() as Grant|undefined;
  if((grant?.refresh&&!grant.enabled)||(grant?.revocationUntil||0)>now)throw new DriveError(409,'drive/revocation-pending');
  if(grant?.lastStartedAt&&now-grant.lastStartedAt<10000)throw new DriveError(429,'drive/connect-in-progress');
  const revision=grant?.revision||0;
  tx.set(attempt,{uid:OWNER,googleSub:identity.googleSub,revision,bindingHash:digest(binding),sealed:seal(JSON.stringify({verifier,nonce}),cfg.key,`attempt:${hash}`),expiresAt:admin.firestore.Timestamp.fromMillis(now+TTL),used:false});
  tx.set(grantRef(),{revision,googleSub:identity.googleSub,enabled:grant?.enabled===true,pendingHash:hash,lastStartedAt:now},{merge:true});
 });
 res.setHeader('Set-Cookie',`${COOKIE}=${hash}.${binding}; Path=/api/drive; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:CLIENT,redirect_uri:CALLBACK,response_type:'code',scope:['openid','email','profile',...SCOPES].join(' '),access_type:'offline',include_granted_scopes:'true',prompt:'consent',login_hint:identity.googleSub,state,nonce,code_challenge:digestBase64(verifier),code_challenge_method:'S256'}).toString();
 res.json({authorizeUrl:url.href});
}
function digestBase64(value:string){return createHash('sha256').update(value).digest('base64url');}
async function callback(req:Request,res:Response){
 clearCookie(res);
 let cfg:Config|undefined,issued='';
 try{
  cfg=await config();const state=typeof req.query.state==='string'?req.query.state:'';
  if(!/^[\w-]{43}$/.test(state))throw new DriveError(400,'drive/invalid-state');
  const hash=digest(state),cookie=(req.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
  const [cookieHash,binding]=cookie.split('.');
  if(cookieHash!==hash||!binding)throw new DriveError(403,'drive/invalid-state');
  const attemptRef=db().doc(`${ROOT}/oauth/attempts/${hash}`);
  const attempt=await db().runTransaction(async tx=>{
   const [a,g]=await Promise.all([tx.get(attemptRef),tx.get(grantRef())]);
   const value=a.data(),grant=g.data() as Grant|undefined;
   if(!value||value.used||value.uid!==OWNER||value.expiresAt.toMillis()<Date.now()||!same(value.bindingHash,digest(binding))||grant?.pendingHash!==hash||grant?.revision!==value.revision)throw new DriveError(403,'drive/invalid-state');
   tx.update(attemptRef,{used:true});return value;
  });
  if(req.query.error)throw new DriveError(409,'drive/consent-not-completed');
  if(typeof req.query.code!=='string'||req.query.code.length>4096)throw new DriveError(400,'drive/invalid-code');
  const user=await admin.auth().getUser(OWNER);
  if(user.disabled||!user.providerData.some(p=>p.providerId==='google.com'&&p.uid===attempt.googleSub))throw new DriveError(403,'drive/identity-changed');
  const {verifier,nonce}=JSON.parse(unseal(attempt.sealed,cfg.key,`attempt:${hash}`));
  const tokens=await googlePost('https://oauth2.googleapis.com/token',new URLSearchParams({code:req.query.code,client_id:CLIENT,client_secret:cfg.clientSecret,redirect_uri:CALLBACK,grant_type:'authorization_code',code_verifier:verifier}));
  issued=typeof tokens.refresh_token==='string'?tokens.refresh_token:'';
  const ticket=await oidc.verifyIdToken({idToken:String(tokens.id_token||''),audience:CLIENT});
  const claims=ticket.getPayload();
  if(claims?.sub!==attempt.googleSub||!same(String((claims as any)?.nonce||''),nonce))throw new DriveError(403,'drive/identity-changed');
  await verifiedAccess(tokens.access_token,attempt.googleSub);
  if(typeof tokens.refresh_token!=='string'||!tokens.refresh_token)throw new DriveError(409,'drive/offline-grant-missing');
  await db().runTransaction(async tx=>{
   const current=(await tx.get(grantRef())).data() as Grant|undefined;
   if(current?.revision!==attempt.revision||current?.pendingHash!==hash||(current?.revocationUntil||0)>Date.now())throw new DriveError(409,'drive/connection-changed');
   tx.set(grantRef(),{revision:attempt.revision+1,googleSub:attempt.googleSub,enabled:true,refresh:seal(tokens.refresh_token,cfg!.key,`refresh:${OWNER}:${attempt.googleSub}`),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
   tx.delete(attemptRef);
  });
  issued='';
  res.redirect(303,ORIGIN+'/?drive=connected');
 }catch{
  if(issued&&cfg){try{await rejectIssuance(issued,cfg);}catch{/* encrypted revocation record is retained; never log credentials */}}
  res.redirect(303,ORIGIN+'/?drive=not-connected');
 }
}
async function session(req:Request,res:Response){
 const identity=await owner(req),cfg=await config();
 const value=(await grantRef().get()).data() as Grant|undefined;
 if(!value?.enabled||!value.refresh||value.googleSub!==identity.googleSub)throw new DriveError(409,'drive/reconnect-required');
 let tokens;
 try{
  tokens=await googlePost('https://oauth2.googleapis.com/token',new URLSearchParams({client_id:CLIENT,client_secret:cfg.clientSecret,grant_type:'refresh_token',refresh_token:unseal(value.refresh,cfg.key,`refresh:${OWNER}:${identity.googleSub}`)}));
 }catch(error){
  if(error instanceof DriveError&&error.code==='drive/reconnect-required')await db().runTransaction(async tx=>{
   const current=(await tx.get(grantRef())).data() as Grant|undefined;
   if(current?.revision===value.revision)tx.update(grantRef(),{enabled:false,revision:value.revision+1});
  });
  throw error;
 }
 const access=await verifiedAccess(tokens.access_token,identity.googleSub);
 const current=(await grantRef().get()).data() as Grant|undefined;
 if(!current?.enabled||current.revision!==value.revision||current.googleSub!==identity.googleSub)throw new DriveError(409,'drive/connection-changed');
 res.json({...access,owner:OWNER,googleSub:identity.googleSub,mode:'server'});
}
async function disconnect(req:Request,res:Response){
 const identity=await owner(req);
 // Invalidate pending callbacks and sessions even if config/revocation is temporarily unavailable.
 const previous=await db().runTransaction(async tx=>{
  const value=(await tx.get(grantRef())).data() as Grant|undefined;
  tx.set(grantRef(),{revision:(value?.revision||0)+1,googleSub:identity.googleSub,enabled:false,revocationUntil:value?.pendingHash?Date.now()+TTL:(value?.revocationUntil||0),pendingHash:admin.firestore.FieldValue.delete()},{merge:true});
  return value;
 });
 clearCookie(res);
 const waiting=Boolean(previous?.pendingHash)||(previous?.revocationUntil||0)>Date.now();
 if(!previous?.refresh&&!OFFLINE_ENABLED){res.json({disconnected:true,revoked:true,googleRevoked:false});return;}
 try{
  const cfg=await config();await drainRevocations(cfg);
  if(previous?.refresh)await revoke(unseal(previous.refresh,cfg.key,`refresh:${OWNER}:${previous.googleSub}`));
  await db().runTransaction(async tx=>{
   const current=(await tx.get(grantRef())).data() as Grant|undefined;
   if(current?.revision===(previous?.revision||0)+1)tx.update(grantRef(),{refresh:admin.firestore.FieldValue.delete()});
  });
  if(waiting)throw new DriveError(409,'drive/revocation-pending');
  res.json({disconnected:true,revoked:true,googleRevoked:Boolean(previous?.refresh)});
 }catch{res.status(202).json({disconnected:true,revoked:false,code:'drive/revocation-pending'});}
}
export const velumDrive=onRequest({region:'us-central1',memory:'256MiB',timeoutSeconds:60,maxInstances:2,invoker:'public',cors:false},async(req,res)=>{
 res.set({'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin, Authorization, Cookie'});
 const path=req.path.replace(/^\/api\/drive/,'');
 try{
  if(req.method==='GET'&&path==='/health'){res.json({service:'velum-drive',version:'offline-v1',ready:OFFLINE_ENABLED});return;}
  if(req.method==='GET'&&path==='/callback'){await callback(req,res);return;}
  if(req.method!=='POST'){res.status(405).json({code:'drive/method-not-allowed'});return;}
  if(Number(req.get('content-length')||0)>2048)throw new DriveError(413,'drive/invalid-request');
  if(path==='/start')await start(req,res);
  else if(path==='/session')await session(req,res);
  else if(path==='/disconnect')await disconnect(req,res);
  else res.status(404).json({code:'drive/not-found'});
 }catch(error){
  const known=error instanceof DriveError;
  res.status(known?error.status:503).json({code:known?error.code:'drive/unavailable'});
 }
});
