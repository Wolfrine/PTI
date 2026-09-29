import express, { type ErrorRequestHandler } from 'express';
import { randomBytes } from 'node:crypto';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PtiOAuthProvider, MCP_SCOPE, type UserIdentity } from './oauth.js';

function escape(value: string) { return value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!)); }
export function createHttpApp(options: {
  provider: PtiOAuthProvider;
  verifyIdentity: (idToken: string) => Promise<UserIdentity>;
  createServer: (context: { uid: string; email: string; actor: string; taskReference: string; transport: string }) => McpServer;
  firebaseConfig: Record<string, string>;
}) {
  const { provider } = options;
  const app = express();
  app.disable('x-powered-by');
  // Cloud Run appends the actual peer to X-Forwarded-For.
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({ 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY' });
    next();
  });
  app.get('/health', (_req,res) => res.json({ service:'pti-firestore-mcp', version:'0.2.0', status:'ok' }));
  app.use(mcpAuthRouter({ provider, issuerUrl:new URL(provider.origin), resourceServerUrl:new URL(provider.resource),
    scopesSupported:[MCP_SCOPE], resourceName:'PTI Firestore', clientRegistrationOptions:{clientSecretExpirySeconds:0} }));
  app.get('/consent', async (req,res) => {
    const id = String(req.query.request || '');
    const pending = await provider.pending(id);
    const nonce = randomBytes(18).toString('base64url');
    res.set('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}' https://www.gstatic.com https://apis.google.com; style-src 'nonce-${nonce}'; connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com; frame-src https://*.firebaseapp.com https://accounts.google.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
    const config = JSON.stringify(options.firebaseConfig).replace(/</g,'\\u003c');
    const requestId = JSON.stringify(id).replace(/</g,'\\u003c');
    res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect PTI Firestore</title>
<style nonce="${nonce}">body{font:18px system-ui;max-width:620px;margin:12vh auto;padding:24px;color:#182637}button{font:inherit;padding:14px;background:#174aa6;color:white;border:0;border-radius:8px;cursor:pointer}#status{white-space:pre-wrap}</style>
<h1>Connect PTI Firestore</h1><p><strong>${escape(String(pending.clientName))}</strong> is requesting access to read, create, update and delete your PTI app data on your behalf.</p>
<p>Only the approved PTI account can connect. Tools access that account’s app data. Access expires after 90 days and can be revoked.</p>
<button id="connect">Sign in with Google and allow access</button><p id="status" role="status"></p>
<script type="module" nonce="${nonce}">
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, setPersistence, inMemoryPersistence } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
const auth=getAuth(initializeApp(${config}));
const button=document.getElementById('connect'), status=document.getElementById('status');
button.onclick=async()=>{button.disabled=true;try{
 await setPersistence(auth,inMemoryPersistence);
 const result=await signInWithPopup(auth,new GoogleAuthProvider());
 const response=await fetch('/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:${requestId},idToken:await result.user.getIdToken()})});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Connection failed');location.replace(data.redirect);
}catch(error){status.textContent=error.message;button.disabled=false;}};
</script></html>`);
  });
  app.post('/consent', express.json({limit:'16kb'}), async (req,res) => {
    if (req.get('origin') !== provider.origin) { res.status(403).json({error:'Invalid request origin'}); return; }
    const csrf = /(?:^|;\s*)__Host-pti-consent=([^;]+)/.exec(req.get('cookie') || '')?.[1];
    if (!csrf || typeof req.body?.idToken !== 'string' || typeof req.body?.requestId !== 'string') {
      res.status(400).json({error:'Invalid consent request'}); return;
    }
    try {
      const identity = await options.verifyIdentity(req.body.idToken);
      const redirect = await provider.approve(req.body.requestId, csrf, identity);
      res.clearCookie('__Host-pti-consent',{httpOnly:true,secure:true,sameSite:'lax',path:'/'});
      res.json({redirect});
    } catch { res.status(403).json({error:'An approved PTI account and a valid connection request are required.'}); }
  });
  app.use('/mcp', (req,res,next) => {
    const origin = req.get('origin');
    if (origin && origin !== provider.origin && !provider.redirectOrigins.includes(origin)) { res.status(403).end(); return; }
    next();
  }, requireBearerAuth({verifier:provider,requiredScopes:[MCP_SCOPE],resourceMetadataUrl:getOAuthProtectedResourceMetadataUrl(new URL(provider.resource))}));
  app.post('/mcp', express.json({limit:'1mb'}), async (req,res) => {
    const auth = req.auth!;
    const server = options.createServer({uid:String(auth.extra?.uid),email:String(auth.extra?.email),transport:'streamable-http',actor:`${String(auth.extra?.email || auth.extra?.uid)} (OAuth ${auth.clientId})`,taskReference:'authenticated-mcp'});
    const transport = new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{void transport.close(); void server.close();});
    await server.connect(transport);
    await transport.handleRequest(req,res,req.body);
  });
  app.all('/mcp', (_req,res) => {res.set('Allow','POST');res.status(405).end();});
  const errors: ErrorRequestHandler = (_err,_req,res,_next) => {
    if (!res.headersSent) res.status(400).json({error:'Invalid or expired request'});
  };
  app.use(errors);
  return app;
}

