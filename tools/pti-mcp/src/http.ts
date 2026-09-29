import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createMcpServer } from './index.js';
import { createHttpApp } from './http-app.js';
import { FirestoreAuthStore } from './auth-store.js';
import { PtiOAuthProvider } from './oauth.js';
const origin = process.env.PTI_MCP_PUBLIC_URL;
if (!origin || new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin) throw new Error('PTI_MCP_PUBLIC_URL must be a canonical HTTPS origin.');
const auth = getAuth(), db = getFirestore();
const allowedEmails = new Set((process.env.PTI_MCP_ALLOWED_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
if (!allowedEmails.size) throw new Error('PTI_MCP_ALLOWED_EMAILS must identify the approved PTI account.');
const checkUser = async (uid: string, authenticatedAt: number) => {
  const user = await auth.getUser(uid);
  if (!user.email || !user.emailVerified || !allowedEmails.has(user.email.toLowerCase()) || user.disabled ||
      Date.parse(user.tokensValidAfterTime || '1970-01-01T00:00:00Z') / 1000 > authenticatedAt) throw new Error('PTI account access was revoked.');
};
const provider = new PtiOAuthProvider(new FirestoreAuthStore(db), origin, checkUser);
const app = createHttpApp({ provider, createServer: createMcpServer,
  verifyIdentity: async token => {
    const identity = await auth.verifyIdToken(token, true);
    if (!identity.email_verified || !identity.email) throw new Error('Verified Google identity required.');
    return { uid: identity.uid, email: identity.email, authenticatedAt: identity.auth_time };
  },
  firebaseConfig: { apiKey: 'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs', authDomain: 'pti-app-2ab59.firebaseapp.com', projectId: 'pti-app-2ab59', appId: '1:185802494856:web:5e9777771492528c6e203d' },
});
const listener = app.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('PTI shared MCP ready'));
process.on('SIGTERM', () => listener.close(() => process.exit(0)));
