import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { CredentialStore, refreshSession, verifyPrivateAccess } from './credentials.mjs';
import { FIREBASE_CONFIG, PROJECT, OWNER_UID } from './config.mjs';
import { MonitorError } from './core.mjs';

export async function setup(root, codexIdentity, { onReady = console.log, timeoutMs = 600_000 } = {}) {
  const credentials = new CredentialStore(root); await credentials.initialize();
  const nonce = randomBytes(24).toString('hex'); let pairing = false;
  let finish; const completed = new Promise((resolve, reject) => { finish = { resolve, reject }; });
  const server = http.createServer(async (request, response) => {
    const origin = `http://localhost:${server.address().port}`;
    const security = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' };
    function send(status, data, type = 'application/json') { response.writeHead(status, { ...security, 'Content-Type': type }); response.end(type === 'application/json' ? JSON.stringify(data) : data); }
    if (request.headers.host !== `localhost:${server.address().port}`) { send(403, { error: 'Invalid setup origin.' }); return; }
    if (request.method === 'GET' && request.url === `/setup/${nonce}`) {
      response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}' https://www.gstatic.com https://apis.google.com; connect-src https://*.googleapis.com https://*.firebaseapp.com ${origin}; frame-src https://*.firebaseapp.com https://accounts.google.com; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
      send(200, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect PTI usage monitor</title><style nonce="${nonce}">body{font:18px system-ui;color:#292923;background:#faf8f3;max-width:600px;margin:12vh auto;padding:24px;line-height:1.6}button{font:inherit;background:#b44734;color:white;border:0;border-radius:12px;padding:14px 22px;cursor:pointer}small{display:block;color:#5e6056;margin:18px 0}#status{white-space:pre-wrap}</style><h1>Connect your PTI Home</h1><p>Sign in to your existing PTI account once. This Windows account will publish your Codex allowance and daily token readings every five minutes while you are signed in.</p><small>Your Firebase refresh credential stays encrypted on this PC. Your Codex login stays in Codex. No AI inference or tool tracking.</small><button id="connect">Sign in with Google</button><p id="status" role="status"></p><script type="module" nonce="${nonce}">
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,setPersistence,inMemoryPersistence,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
const auth=getAuth(initializeApp(${JSON.stringify(FIREBASE_CONFIG)}));await setPersistence(auth,inMemoryPersistence);
const button=document.getElementById('connect'),status=document.getElementById('status');
button.onclick=async()=>{button.disabled=true;status.textContent='Opening Google sign-in…';try{const result=await signInWithPopup(auth,new GoogleAuthProvider());if(result.user.uid!==${JSON.stringify(OWNER_UID)})throw new Error('Use the PTI owner account.');status.textContent='Checking private access…';const response=await fetch('/pair/${nonce}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:result.user.refreshToken})});const data=await response.json();if(!response.ok)throw new Error(data.error);await signOut(auth);status.textContent='Connected. The credential is encrypted on this PC. You can close this tab.';}catch(error){status.textContent=error.message||'Connection failed. Try again.';button.disabled=false;}};
</script></html>`, 'text/html; charset=utf-8'); return;
    }
    if (request.method !== 'POST' || request.url !== `/pair/${nonce}` || request.headers.origin !== origin || !/^application\/json\b/.test(request.headers['content-type'] || '') || pairing) { send(403, { error: 'Invalid setup request.' }); return; }
    pairing = true;
    try {
      const chunks = []; let length = 0;
      for await (const chunk of request) { length += chunk.length; if (length > 32768) throw new MonitorError('firebase-login-required'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const session = await refreshSession(input.refreshToken);
      const privacyVerifiedAt = await verifyPrivateAccess(session.idToken);
      await credentials.save({ version: 1, projectId: PROJECT, uid: OWNER_UID, refreshToken: session.refreshToken,
        codexFingerprint: codexIdentity.fingerprint, codexAccountIdFingerprint: codexIdentity.accountIdFingerprint,
        privacyVerifiedAt, pairedAt: new Date().toISOString() });
      response.once('finish', () => finish.resolve({ connected: true, privacyVerifiedAt }));
      send(200, { connected: true });
    } catch (error) {
      pairing = false; send(400, { error: error.code === 'private-rules-not-verified' ? 'Private rules are not verified yet. Deploy the reviewed rules first.' : error.code === 'firebase-account-mismatch' ? 'Use the PTI owner account.' : 'Connection failed. Check your sign-in and try again.' });
    }
  });
  server.requestTimeout = 30_000; server.headersTimeout = 15_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  onReady(`http://localhost:${server.address().port}/setup/${nonce}`);
  const timer = setTimeout(() => finish.reject(new MonitorError('firebase-login-required')), timeoutMs);
  try { return await completed; } finally {
    clearTimeout(timer); server.closeIdleConnections();
    const forceClose = setTimeout(() => server.closeAllConnections(), 1000);
    await new Promise(resolve => server.close(resolve)); clearTimeout(forceClose);
  }
}
