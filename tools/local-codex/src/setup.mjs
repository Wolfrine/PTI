import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {OWNER,firebaseAuthConfig,refresh,saveCredential} from './credentials.mjs';
const firebase=firebaseAuthConfig();
const nonce=randomBytes(24).toString('hex');let pairing=false;
const server=http.createServer(async(req,res)=>{
  const origin=`http://localhost:${server.address().port}`;
  const send=(status,value,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});res.end(type==='application/json'?JSON.stringify(value):value);};
  if(req.headers.host!==`localhost:${server.address().port}`){send(403,{error:'Invalid host.'});return;}
  if(req.method==='GET'&&req.url===`/setup/${nonce}`){
    res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}' https://www.gstatic.com https://apis.google.com; connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com; frame-src https://*.firebaseapp.com https://accounts.google.com; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
    send(200,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Local Codex</title><style nonce="${nonce}">body{font:18px system-ui;color:#292923;background:#faf8f3;max-width:600px;margin:10vh auto;padding:24px;line-height:1.6}button{font:inherit;background:#b44734;color:white;border:0;border-radius:12px;padding:14px 22px;cursor:pointer}small{display:block;color:#5e6056;margin:18px 0}#status{white-space:pre-wrap}</style><h1>Connect Local Codex</h1><p>Connect this PC to your private PTI job relay. Normal ChatGPT chats can then request local Codex work and retrieve the results.</p><small>Codex uses your existing ChatGPT sign-in. No OpenAI API key is requested. This Firebase session stays encrypted on this PC. Tasks require the PC to be awake and online.</small><button id="connect">Sign in with Google</button><p id="status" role="status"></p><script type="module" nonce="${nonce}">
import{initializeApp}from'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';import{getAuth,GoogleAuthProvider,signInWithPopup,setPersistence,inMemoryPersistence,signOut}from'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';const auth=getAuth(initializeApp(${JSON.stringify(firebase)}));await setPersistence(auth,inMemoryPersistence);const button=document.getElementById('connect'),status=document.getElementById('status');button.onclick=async()=>{button.disabled=true;try{const result=await signInWithPopup(auth,new GoogleAuthProvider());if(result.user.uid!==${JSON.stringify(OWNER)})throw Error('Use the PTI owner account.');const response=await fetch('/pair/${nonce}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:result.user.refreshToken})});if(!response.ok)throw Error('Connection failed. Try again.');await signOut(auth);status.textContent='Connected. Your credential is encrypted on this PC. You can close this tab.';}catch(error){status.textContent=error.message;button.disabled=false;}};
</script></html>`,'text/html; charset=utf-8');return;
  }
  if(req.method!=='POST'||req.url!==`/pair/${nonce}`||req.headers.origin!==origin||pairing){send(403,{error:'Invalid pairing request.'});return;}
  pairing=true;
  try{let body='';for await(const chunk of req){body+=chunk;if(body.length>32768)throw Error('Too large.');}const session=await refresh(JSON.parse(body).refreshToken);await saveCredential(session.refreshToken);send(200,{connected:true});console.log('Local Codex worker paired.');setTimeout(()=>server.close(()=>process.exit(0)),1000);}
  catch{pairing=false;send(400,{error:'Use the PTI owner Google account.'});}
});
server.requestTimeout=30000;server.headersTimeout=15000;
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
console.log(`http://localhost:${server.address().port}/setup/${nonce}`);
setTimeout(()=>server.close(()=>process.exit(1)),600000).unref();
