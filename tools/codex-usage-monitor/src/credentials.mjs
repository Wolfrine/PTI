import path from 'node:path';
import { createHash } from 'node:crypto';
import { initializeServerApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore/lite';
import { WindowsProtection } from './dpapi.mjs';
import { atomicJson, readJson } from './store.mjs';
import { MonitorError } from './core.mjs';
import { DOCUMENT, FIREBASE_CONFIG, OWNER_UID, PROJECT } from './config.mjs';

const entropy = createHash('sha256').update(`pti-codex-usage-v1:${PROJECT}:${OWNER_UID}`).digest();
const tokenValid = value => typeof value === 'string' && value.length > 20 && value.length < 16384 && !/\s/.test(value);
export class CredentialStore {
  constructor(root, protection = new WindowsProtection()) { this.root = root; this.protection = protection; }
  async initialize() { await this.protection.secureDirectory(this.root); }
  async save(value) {
    if (value?.uid !== OWNER_UID || value.projectId !== PROJECT || !tokenValid(value.refreshToken) || !/^[0-9a-f]{64}$/.test(value.codexFingerprint || '')) throw new MonitorError('firebase-account-mismatch');
    const clear = Buffer.from(JSON.stringify(value)); let encrypted;
    try { encrypted = await this.protection.protect(clear, entropy); await atomicJson(path.join(this.root, 'credential.json'), { version: 1, protection: 'windows-dpapi-current-user', ciphertext: encrypted.toString('base64') }); }
    finally { clear.fill(0); encrypted?.fill(0); }
  }
  async load() {
    const envelope = await readJson(path.join(this.root, 'credential.json'));
    if (!envelope) throw new MonitorError('firebase-login-required');
    if (envelope.version !== 1 || envelope.protection !== 'windows-dpapi-current-user' || typeof envelope.ciphertext !== 'string') throw new MonitorError('protected-store-unavailable');
    let clear;
    try {
      clear = await this.protection.unprotect(Buffer.from(envelope.ciphertext, 'base64'), entropy);
      const value = JSON.parse(clear.toString('utf8'));
      if (value.uid !== OWNER_UID || value.projectId !== PROJECT || !tokenValid(value.refreshToken) || !/^[0-9a-f]{64}$/.test(value.codexFingerprint || '')) throw new MonitorError('firebase-account-mismatch');
      return value;
    } finally { clear?.fill(0); }
  }
}
export async function refreshSession(refreshToken, { fetchImpl = fetch } = {}) {
  if (!tokenValid(refreshToken)) throw new MonitorError('firebase-login-required');
  let response;
  try {
    response = await fetchImpl(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
  } catch { throw new MonitorError('firebase-unavailable', { transient: true }); }
  if (!response.ok) { await response.body?.cancel(); throw new MonitorError([400, 401, 403].includes(response.status) ? 'firebase-login-required' : 'firebase-unavailable', { transient: response.status >= 500 || response.status === 429 }); }
  const text = await response.text(); if (text.length > 65536) throw new MonitorError('firebase-account-mismatch');
  let value; try { value = JSON.parse(text); } catch { throw new MonitorError('firebase-unavailable', { transient: true }); }
  if (value.user_id !== OWNER_UID || ![PROJECT, '185802494856'].includes(String(value.project_id)) || !tokenValid(value.id_token) || !tokenValid(value.refresh_token)) throw new MonitorError('firebase-account-mismatch');
  return { idToken: value.id_token, refreshToken: value.refresh_token };
}
export async function withFirebase(idToken, operation) {
  const app = initializeServerApp(FIREBASE_CONFIG, { authIdToken: idToken });
  try {
    const auth = getAuth(app); await auth.authStateReady();
    if (auth.currentUser?.uid !== OWNER_UID) throw new MonitorError('firebase-account-mismatch');
    return await operation(getFirestore(app));
  } catch (error) {
    if (error instanceof MonitorError) throw error;
    throw new MonitorError(error.code?.includes('permission-denied') ? 'firebase-permission-denied' : 'firebase-unavailable', { transient: ['unavailable', 'deadline-exceeded', 'resource-exhausted'].some(code => error.code?.includes(code)) });
  } finally { await deleteApp(app); }
}
export async function verifyPrivateAccess(idToken, { fetchImpl = fetch } = {}) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/`;
  // Reading a different UID's reserved path must be denied even when it is absent.
  // This specifically detects the legacy recursive signed-in allow overlap.
  const checks = [
    [DOCUMENT, null],
    ['users/pti-usage-privacy-other-account/codexProjects/codex-usage', idToken],
    ['users/pti-usage-privacy-other-account/codexProjects/codex-usage/private/probe', idToken],
  ];
  for (const [target, token] of checks) {
    const response = await fetchImpl(base + target, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15000), redirect: 'error' });
    await response.body?.cancel();
    if (response.status !== 403) throw new MonitorError('private-rules-not-verified');
  }
  await withFirebase(idToken, db => getDoc(doc(db, DOCUMENT)));
  return new Date().toISOString();
}
export async function publish(idToken, snapshot) {
  // Lite SDK has no durable offline write queue; the collector owns the one pending snapshot.
  return withFirebase(idToken, db => setDoc(doc(db, DOCUMENT), { ...snapshot, publishedAt: serverTimestamp() }));
}
