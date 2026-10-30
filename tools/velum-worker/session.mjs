// Separate, memory-only PTI owner session. Never reads monitor credentials.
import http from 'node:http';
import {randomBytes} from 'node:crypto';
export const PROJECT='pti-app-2ab59', OWNER_UID='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
export const CONFIG={apiKey:'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',authDomain:'pti-app-2ab59.firebaseapp.com',projectId:PROJECT,appId:'1:185802494856:web:5e9777771492528c6e203d'};
export async function refreshSession(refreshToken,fetchImpl=fetch) {
  if(typeof refreshToken!=='string'||refreshToken.length<20||refreshToken.length>16384)throw new Error('owner-login-required');
  const response=await fetchImpl(`https://securetoken.googleapis.com/v1/token?key=${CONFIG.apiKey}`,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken}),redirect:'error',signal:AbortSignal.timeout(15000),
  });
  if(!response.ok) {await response.body?.cancel();throw new Error('owner-login-required');}
  const value=await response.json();
  const seconds=Number(value.expires_in);
  if(value.user_id!==OWNER_UID||![PROJECT,'185802494856'].includes(String(value.project_id))||typeof value.id_token!=='string'||value.id_token.length<20||typeof value.refresh_token!=='string'||!Number.isFinite(seconds)||seconds<60||seconds>7200)throw new Error('owner-account-required');
  return {idToken:value.id_token,refreshToken:value.refresh_token,expiresAt:Date.now()+seconds*1000};
}
export function pairingPage() {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Velum PC worker</title>
<style>body{margin:40px auto;padding:20px;max-width:480px;background:#100c0e;color:#f6eff1;font:16px/1.6 system-ui}h1{font:36px Georgia}button{padding:14px 20px;font:inherit}small{display:block;margin-top:24px;color:#b8a9ae}</style>
<h1>Connect this PC</h1><p>Use your PTI owner Google account to connect Velum Studio for this worker session. No Drive permission is requested.</p>
<p>The session stays in this worker's memory and is discarded when it exits. Existing monitors and sign-ins are unchanged.</p>
<button id="connect">Sign in to PTI</button><p id="status" role="status"></p><small>Only queued requests you submit in Velum can start an image. Closing this page after connection is safe. No startup task is installed.</small>
<script type="module">
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,setPersistence,inMemoryPersistence,signInWithPopup,signOut} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
const auth=getAuth(initializeApp(${JSON.stringify(CONFIG)}));await setPersistence(auth,inMemoryPersistence);
const connect=document.getElementById('connect'),status=document.getElementById('status');
connect.onclick=async()=>{connect.disabled=true;try{const {user}=await signInWithPopup(auth,new GoogleAuthProvider());
if(user.uid!==${JSON.stringify(OWNER_UID)})throw Error('Use the PTI owner account.');
const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json','X-Velum-Pair':'1'},body:JSON.stringify({refreshToken:user.refreshToken})});
if(!r.ok)throw Error('Connection failed. Check the worker status.');await signOut(auth);status.textContent='Connected. You can close this page and open Studio on your phone.';
}catch(e){status.textContent=e.message;connect.disabled=false;}};
</script></html>`;
}
export function pairOwner({onUrl,timeoutMs=600000,verify=async()=>{}}={}) {
  return new Promise((resolve,reject)=>{
    const nonce=randomBytes(24).toString('hex');let busy=false,settled=false;
    const server=http.createServer(async(req,res)=>{
      const host=`localhost:${server.address().port}`;
      res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
      if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!==host||req.url!==`/${nonce}`){res.writeHead(404);res.end();return;}
      if(req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pairingPage());return;}
      if(req.method!=='POST'||req.headers.origin!==`http://${host}`||req.headers['x-velum-pair']!=='1'||busy){res.writeHead(403);res.end();return;}
      busy=true;req.setTimeout(15000,()=>req.destroy());
      try {
        let body='';for await(const chunk of req){body+=chunk;if(body.length>20000)throw new Error('invalid-session');}
        const session=await refreshSession(JSON.parse(body).refreshToken);await verify(session);
        settled=true;clearTimeout(timer);res.end('connected');server.close();resolve(session);
      } catch {busy=false;res.writeHead(403);res.end('owner-login-required');}
    });
    const timer=setTimeout(()=>{server.close();if(!settled)reject(new Error('owner-login-required'));},timeoutMs);
    server.on('error',()=>{clearTimeout(timer);reject(new Error('pairing-unavailable'));});
    server.listen(0,'127.0.0.1',()=>onUrl?.(`http://localhost:${server.address().port}/${nonce}`));
  });
}
