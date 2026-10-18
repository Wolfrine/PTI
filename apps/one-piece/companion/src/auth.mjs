import { importX509, jwtVerify } from 'jose';

const CERTS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/';
export async function boundedJson(response, maximum = 128 * 1024) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    await response.body?.cancel(); throw new AccessError('invalid-identity-response', 503);
  }
  const chunks = []; let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        total += value.byteLength;
        if (total > maximum) { await reader.cancel(); throw new AccessError('invalid-identity-response', 503); }
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      if (error instanceof AccessError) throw error;
      throw new AccessError('identity-unavailable', 503);
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new AccessError('invalid-identity-response', 503); }
}
export class AccessError extends Error {
  constructor(code, status = 401) { super(code); this.code = code; this.status = status; }
}

/** Public signing keys only. This class never obtains an Admin credential. */
export class FirebaseIdentity {
  constructor({ projectId, fetchImpl = fetch, clock = () => Date.now(), keyResolver } = {}) {
    if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId ?? '')) throw new Error('Invalid Firebase project');
    this.projectId = projectId; this.fetch = fetchImpl; this.clock = clock;
    this.keys = new Map(); this.expires = 0; this.inflight = null; this.lastKeyMiss = 0; this.refreshRetryAt = 0;
    this.keyResolver = keyResolver ?? ((header) => this.resolveKey(header));
  }
  async resolveKey(header) {
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 200) throw new AccessError('invalid-token');
    const now = this.clock();
    if (now >= this.expires || !this.keys.has(header.kid)) {
      if (now < this.refreshRetryAt) throw new AccessError('identity-unavailable',503);
      // At most one unknown-key refresh per minute; do not let attacker-chosen kids amplify requests.
      if (now < this.expires && now - this.lastKeyMiss < 60_000) throw new AccessError('unknown-signing-key');
      if (!this.inflight) {
        this.lastKeyMiss = now;
        this.inflight = this.loadKeys().then(() => { this.refreshRetryAt = 0; }).catch(error => {
          this.refreshRetryAt = this.clock()+30_000;
          if (error instanceof AccessError) throw error;
          throw new AccessError('identity-unavailable',503);
        }).finally(() => { this.inflight = null; });
      }
      await this.inflight;
    }
    const key = this.keys.get(header.kid);
    if (!key) throw new AccessError('unknown-signing-key');
    return key;
  }
  async loadKeys() {
    let response;
    try { response = await this.fetch(CERTS, { signal: AbortSignal.timeout(8_000), redirect: 'error' }); }
    catch { throw new AccessError('identity-unavailable', 503); }
    if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new AccessError('identity-unavailable', 503); }
    const certs = await boundedJson(response);
    if (!certs || Array.isArray(certs) || typeof certs !== 'object' || Object.keys(certs).length > 20) throw new AccessError('invalid-signing-keys', 503);
    const keys = new Map();
    for (const [kid, cert] of Object.entries(certs)) {
      if (typeof cert !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(kid)) throw new AccessError('invalid-signing-keys', 503);
      keys.set(kid, await importX509(cert, 'RS256'));
    }
    if (!keys.size || keys.size > 20) throw new AccessError('invalid-signing-keys', 503);
    const maxAge = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 300);
    this.keys = keys; this.expires = this.clock() + Math.min(maxAge, 86_400) * 1000;
  }
  async verify(token) {
    if (typeof token !== 'string' || token.length > 16_384 || token.split('.').length !== 3) throw new AccessError('invalid-token');
    try {
      const now = this.clock();
      const { payload } = await jwtVerify(token, this.keyResolver, {
        algorithms: ['RS256'], audience: this.projectId,
        issuer: `https://securetoken.google.com/${this.projectId}`,
        currentDate: new Date(now), requiredClaims: ['exp', 'iat', 'sub', 'auth_time'],
      });
      const seconds = now / 1000;
      if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128
          || !Number.isInteger(payload.iat) || payload.iat > seconds
          || !Number.isInteger(payload.auth_time) || payload.auth_time > seconds || payload.auth_time > payload.iat
          || !Number.isInteger(payload.exp) || payload.exp - payload.iat > 7200
          || payload.auth_time < 0 || payload.iat < 0
          || payload.email_verified !== true || typeof payload.email !== 'string'
          || payload.email.length > 254 || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(payload.email)
          || payload.firebase?.sign_in_provider !== 'google.com') throw new AccessError('verified-google-account-required');
      return Object.freeze({ uid: payload.sub, email: payload.email.toLowerCase(), expiresAt: payload.exp * 1000, token });
    } catch (error) {
      if (error instanceof AccessError) throw error;
      throw new AccessError('invalid-token');
    }
  }
}

function plainFields(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)
      || document.fields !== undefined && (!document.fields || typeof document.fields !== 'object' || Array.isArray(document.fields))) throw new AccessError('invalid-membership-response',503);
  const result = Object.create(null);
  for (const [key, value] of Object.entries(document.fields ?? {})) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1) throw new AccessError('invalid-membership-response',503);
    if ('stringValue' in value) {
      if (typeof value.stringValue !== 'string') throw new AccessError('invalid-membership-response',503);
      result[key] = value.stringValue;
    } else if ('booleanValue' in value) {
      if (typeof value.booleanValue !== 'boolean') throw new AccessError('invalid-membership-response',503);
      result[key] = value.booleanValue;
    } else if ('integerValue' in value) {
      if (!/^-?\d+$/.test(value.integerValue) || !Number.isSafeInteger(Number(value.integerValue))) throw new AccessError('invalid-membership-response',503);
      result[key] = Number(value.integerValue);
    }
  }
  return result;
}
export class FamilyAccess {
  constructor({ projectId, ownerUid, fetchImpl = fetch } = {}) {
    if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId ?? '') || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid ?? '')) throw new Error('Invalid family configuration');
    this.projectId = projectId; this.ownerUid = ownerUid; this.fetch = fetchImpl;
    this.root = `${FIRESTORE}${projectId}/databases/(default)/documents/users/${encodeURIComponent(ownerUid)}/onePieceData/workspace`;
  }
  async requireMember(identity, { allowPending = false, allowOwnerSetup = false } = {}) {
    if (!identity?.token || !identity.uid || !identity.email) throw new AccessError('authentication-required');
    // Even the owner needs a configured active workspace; a Firebase identity alone is insufficient.
    const path = identity.uid === this.ownerUid ? this.root : `${this.root}/members/${encodeURIComponent(identity.email)}`;
    let response;
    try { response = await this.fetch(path, { headers: { Authorization: `Bearer ${identity.token}` }, signal: AbortSignal.timeout(8_000), redirect: 'error' }); }
    catch { throw new AccessError('membership-unavailable', 503); }
    if ([401, 403, 404].includes(response.status)) {
      await response.body?.cancel().catch(() => {});
      // Rules may deny GET of a not-yet-created workspace with 403. This is only
      // setup metadata: creating an existing/disabled workspace still fails rules.
      if ([403,404].includes(response.status) && allowOwnerSetup && identity.uid === this.ownerUid) return {...identity,role:'owner',needsWorkspace:true};
      throw new AccessError('not-invited', 403);
    }
    if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new AccessError('membership-unavailable', 503); }
    const record = plainFields(await boundedJson(response, 64 * 1024));
    if (identity.uid === this.ownerUid) {
      if (record.ownerUid !== this.ownerUid || record.active !== true) throw new AccessError('family-unavailable', 403);
      return { ...identity, role: 'owner' };
    }
    if (allowPending && record.role === 'member' && record.active === true && record.uid === '' && record.email === identity.email) return {...identity,role:'invited',needsClaim:true};
    if (record.role !== 'member' || record.active !== true || record.uid !== identity.uid || record.email !== identity.email) throw new AccessError('not-invited', 403);
    // A viewer can read their own invitation even while the household is disabled.
    // Invitation metadata alone must therefore never authorize media playback.
    let workspaceResponse;
    try { workspaceResponse = await this.fetch(this.root, { headers: { Authorization: `Bearer ${identity.token}` }, signal: AbortSignal.timeout(8_000), redirect: 'error' }); }
    catch { throw new AccessError('membership-unavailable', 503); }
    if (!workspaceResponse.ok) {
      await workspaceResponse.body?.cancel().catch(() => {});
      if ([401,403,404].includes(workspaceResponse.status)) throw new AccessError('family-unavailable',403);
      throw new AccessError('membership-unavailable',503);
    }
    const workspace = plainFields(await boundedJson(workspaceResponse,64*1024));
    if (workspace.ownerUid !== this.ownerUid || workspace.active !== true) throw new AccessError('family-unavailable',403);
    return { ...identity, role: 'member' };
  }
}

export function bearerToken(headers) {
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(headers.authorization ?? '');
  if (!match) throw new AccessError('authentication-required');
  return match[1];
}
