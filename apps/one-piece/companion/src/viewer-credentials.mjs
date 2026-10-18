import { createHash } from 'node:crypto';
import { lstat, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { decodeJwt } from 'jose';
import { AccessError, FirebaseIdentity, FamilyAccess, boundedJson } from './auth.mjs';
import { atomicJson } from './progress.mjs';
import { WindowsProtection } from './dpapi.mjs';

const REQUEST_URI = 'https://pti-app-2ab59.web.app/one-piece/';
const SIGN_IN = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp';
const REFRESH = 'https://securetoken.googleapis.com/v1/token';
const FILE_LIMIT = 128 * 1024;
const TOKEN_LIMIT = 16_384;
const MEMBERSHIP_MS = 60_000;
const REFRESH_EARLY_MS = 60_000;
const uidValid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const emailValid = value => typeof value === 'string' && value.length <= 254 && value === value.toLowerCase() && /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(value);
const tokenValid = value => typeof value === 'string' && value.length >= 1 && value.length <= TOKEN_LIMIT && !/[\s\x00-\x1f\x7f]/.test(value);
const exactKeys = (record, keys) => record && !Array.isArray(record) && typeof record === 'object' && Object.keys(record).length === keys.length && keys.every(key => Object.hasOwn(record, key));
const unavailable = () => new AccessError('viewer-credential-unavailable', 503);

/** Server-only per-viewer Firebase user sessions. Never serialize getAuthorized() to HTTP.
 * Caller owns trusted transport, one-use pairing challenge and ticket revocation.
 * Production root must be a private directory on H:, outside Hosting/cache assets.
 */
export class ViewerCredentials {
  #root; #projectId; #projectNumber; #ownerUid; #apiKey; #identity; #family; #fetch;
  #protect; #unprotect; #secureDirectory; #clock; #deadlineMs; #ready;
  #cache = new Map(); #queues = new Map();
  constructor({ root, projectId, projectNumber = projectId === 'pti-app-2ab59' ? '185802494856' : undefined, ownerUid, apiKey, identity, family, fetchImpl = fetch,
    protect, unprotect, secureDirectory, clock = () => Date.now(), deadlineMs = 8_000 } = {}) {
    if (typeof root !== 'string' || !path.isAbsolute(root) || root.length > 2048
        || !/^[a-z][a-z0-9-]{4,62}$/.test(projectId ?? '') || !/^[1-9]\d{5,19}$/.test(projectNumber ?? '') || !uidValid(ownerUid)
        || typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(apiKey)
        || !Number.isInteger(deadlineMs) || deadlineMs < 50 || deadlineMs > 30_000) throw new Error('Invalid viewer credential configuration');
    const injected = [protect, unprotect, secureDirectory].some(value => value !== undefined);
    if (injected && ![protect, unprotect, secureDirectory].every(value => typeof value === 'function')) throw new Error('Inject all protected-store operations together');
    if (!injected && !/^H:[\\/]/i.test(root)) throw new Error('Viewer credentials require a private H: directory');
    const protection = injected ? null : new WindowsProtection();
    this.#root = path.resolve(root); this.#projectId = projectId; this.#projectNumber = projectNumber; this.#ownerUid = ownerUid; this.#apiKey = apiKey;
    this.#identity = identity ?? new FirebaseIdentity({ projectId, fetchImpl, clock });
    this.#family = family ?? new FamilyAccess({ projectId, ownerUid, fetchImpl });
    if (typeof this.#identity.verify !== 'function' || typeof this.#family.requireMember !== 'function'
        || typeof fetchImpl !== 'function' || typeof clock !== 'function') throw new Error('Invalid viewer credential dependencies');
    if (this.#identity.projectId !== undefined && this.#identity.projectId !== projectId
        || this.#family.projectId !== undefined && this.#family.projectId !== projectId
        || this.#family.ownerUid !== undefined && this.#family.ownerUid !== ownerUid) throw new Error('Viewer identity/family configuration mismatch');
    this.#protect = protect ?? protection.protect.bind(protection);
    this.#unprotect = unprotect ?? protection.unprotect.bind(protection);
    this.#secureDirectory = secureDirectory ?? protection.secureDirectory.bind(protection);
    this.#fetch = fetchImpl; this.#clock = clock; this.#deadlineMs = deadlineMs;
  }
  #uid(uid) { if (!uidValid(uid)) throw new AccessError('invalid-profile', 400); return uid; }
  #file(uid) { return path.join(this.#root, `viewer-${createHash('sha256').update(this.#uid(uid)).digest('hex')}.json`); }
  #entropy(uid) { return createHash('sha256').update(JSON.stringify(['pti-one-piece-viewer-v1', this.#projectId, this.#ownerUid, uid])).digest(); }
  async #directory() {
    if (!this.#ready) this.#ready = Promise.resolve().then(() => this.#secureDirectory(this.#root)).catch(() => { this.#ready = null; throw unavailable(); });
    await this.#ready;
  }
  async #serialized(uid, action) {
    this.#uid(uid);
    const prior = this.#queues.get(uid) ?? Promise.resolve();
    const result = prior.then(action); const tail = result.catch(() => {});
    this.#queues.set(uid, tail);
    try { return await result; } finally { if (this.#queues.get(uid) === tail) this.#queues.delete(uid); }
  }
  #remember(uid, identity, checkedAt) {
    this.#cache.delete(uid);
    if (this.#cache.size >= 64) this.#cache.delete(this.#cache.keys().next().value);
    this.#cache.set(uid, { identity, checkedAt });
  }
  async #request(endpoint, contentType, body) {
    const controller = new AbortController(); let response; let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AccessError('viewer-identity-unavailable', 503)); }, this.#deadlineMs); });
    try {
      return await Promise.race([timeout, (async () => {
        try { response = await this.#fetch(`${endpoint}?key=${encodeURIComponent(this.#apiKey)}`, {
          method: 'POST', headers: { 'Content-Type': contentType, Accept: 'application/json' },
          body, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
        }); } catch { throw new AccessError('viewer-identity-unavailable', 503); }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw new AccessError([400, 401, 403].includes(response.status) ? 'viewer-reauthentication-required' : 'viewer-identity-unavailable', [400, 401, 403].includes(response.status) ? 401 : 503);
        }
        return boundedJson(response, 64 * 1024);
      })()]);
    } finally {
      clearTimeout(timer); controller.abort();
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
    }
  }
  #freshGoogle(token) {
    if (!tokenValid(token) || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new AccessError('fresh-google-credential-required', 400);
    try {
      // These claims only reject stale input. Firebase's exchange verifies the Google
      // signature/audience; no authorization is based on this unverified decoding.
      const claims = decodeJwt(token); const now = this.#clock() / 1000;
      if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
          || !Number.isInteger(claims.iat) || claims.iat > now || now - claims.iat > 300
          || !Number.isInteger(claims.exp) || claims.exp <= now || claims.exp - claims.iat > 3600
          || claims.exp <= claims.iat) throw new Error('stale');
    } catch { throw new AccessError('fresh-google-credential-required', 400); }
  }
  async #verified(token, uid, email) {
    if (!tokenValid(token)) throw new AccessError('viewer-identity-mismatch', 401);
    const value = await this.#identity.verify(token);
    if (!uidValid(value.uid) || !emailValid(value.email) || value.uid !== uid || value.email !== email
        || value.token !== token || !Number.isFinite(value.expiresAt) || value.expiresAt <= this.#clock() + REFRESH_EARLY_MS) throw new AccessError('viewer-identity-mismatch', 401);
    return value;
  }
  async #member(identity) {
    const member = await this.#family.requireMember(identity);
    if (member.uid !== identity.uid || member.email !== identity.email || member.token !== identity.token
        || !['owner', 'member'].includes(member.role)) throw new AccessError('viewer-identity-mismatch', 403);
    return Object.freeze({ uid: identity.uid, email: identity.email, token: identity.token, expiresAt: identity.expiresAt, role: member.role });
  }
  async #save(uid, email, refreshToken) {
    if (!tokenValid(refreshToken)) throw new AccessError('invalid-viewer-credential-response', 503);
    const bytes = Buffer.from(JSON.stringify({ version: 1, projectId: this.#projectId, ownerUid: this.#ownerUid, uid, email, refreshToken }), 'utf8');
    let encrypted;
    try {
      encrypted = await this.#protect(bytes, this.#entropy(uid));
      if (!Buffer.isBuffer(encrypted) || !encrypted.length || encrypted.length > 96 * 1024 || encrypted.equals(bytes)) throw unavailable();
      await atomicJson(this.#file(uid), { version: 1, protection: 'windows-dpapi-current-user', ciphertext: encrypted.toString('base64') });
    } catch { throw unavailable(); }
    finally { bytes.fill(0); if (Buffer.isBuffer(encrypted)) encrypted.fill(0); }
  }
  async #load(uid) {
    await this.#directory(); const file = this.#file(uid); let handle; let encoded; let clear;
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > FILE_LIMIT) throw unavailable();
      handle = await open(file, 'r'); const opened = await handle.stat();
      if (!opened.isFile() || opened.nlink !== 1 || opened.size > FILE_LIMIT || opened.ino !== info.ino || opened.dev !== info.dev) throw unavailable();
      encoded = Buffer.alloc(FILE_LIMIT + 1); let bytesRead = 0;
      while (bytesRead < encoded.length) {
        const read = await handle.read(encoded, bytesRead, encoded.length - bytesRead, bytesRead);
        if (!read.bytesRead) break; bytesRead += read.bytesRead;
      }
      if (bytesRead > FILE_LIMIT) throw unavailable();
      const envelope = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(encoded.subarray(0, bytesRead)));
      if (!exactKeys(envelope, ['version', 'protection', 'ciphertext']) || envelope.version !== 1 || envelope.protection !== 'windows-dpapi-current-user'
          || typeof envelope.ciphertext !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(envelope.ciphertext)
          || envelope.ciphertext.length < 4 || envelope.ciphertext.length > FILE_LIMIT - 200) throw unavailable();
      const encrypted = Buffer.from(envelope.ciphertext, 'base64');
      try { clear = await this.#unprotect(encrypted, this.#entropy(uid)); } finally { encrypted.fill(0); }
      if (!Buffer.isBuffer(clear) || !clear.length || clear.length > 32 * 1024) throw unavailable();
      const record = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(clear));
      if (!exactKeys(record, ['version', 'projectId', 'ownerUid', 'uid', 'email', 'refreshToken']) || record.version !== 1
          || record.projectId !== this.#projectId || record.ownerUid !== this.#ownerUid || record.uid !== uid
          || !emailValid(record.email) || !tokenValid(record.refreshToken)) throw unavailable();
      return record;
    } catch (error) { if (error.code === 'ENOENT') throw new AccessError('viewer-not-paired', 401); throw unavailable(); }
    finally { await handle?.close().catch(() => {}); encoded?.fill(0); if (Buffer.isBuffer(clear)) clear.fill(0); }
  }
  async #destroy(uid) {
    this.#cache.delete(uid);
    try { await unlink(this.#file(uid)); } catch (error) { if (error.code !== 'ENOENT') throw unavailable(); }
  }
  async pairGoogle(actor, googleIdToken) {
    this.#uid(actor?.uid); this.#freshGoogle(googleIdToken);
    return this.#serialized(actor.uid, async () => {
      const caller = await this.#verified(actor.token, actor.uid, actor.email);
      await this.#member(caller); await this.#directory();
      const response = await this.#request(SIGN_IN, 'application/json', JSON.stringify({
        postBody: new URLSearchParams({ id_token: googleIdToken, providerId: 'google.com' }).toString(),
        requestUri: REQUEST_URI, returnSecureToken: true, returnIdpCredential: false,
      }));
      if (response?.localId !== caller.uid || typeof response.email !== 'string' || response.email.toLowerCase() !== caller.email
          || response.providerId !== 'google.com' || response.needConfirmation === true || !tokenValid(response.refreshToken)
          || !/^\d{1,5}$/.test(String(response.expiresIn)) || Number(response.expiresIn) < 61 || Number(response.expiresIn) > 7200) throw new AccessError('viewer-identity-mismatch', 401);
      const verified = await this.#verified(response.idToken, caller.uid, caller.email);
      const member = await this.#member(verified);
      await this.#save(caller.uid, caller.email, response.refreshToken);
      this.#remember(caller.uid, member, this.#clock());
      return Object.freeze({ uid: caller.uid, email: caller.email, paired: true });
    });
  }
  async getAuthorized(uid) {
    return this.#serialized(uid, async () => {
      const now = this.#clock(); const cached = this.#cache.get(uid);
      try {
        if (cached && cached.identity.expiresAt > now + REFRESH_EARLY_MS) {
          if (now >= cached.checkedAt && now - cached.checkedAt < MEMBERSHIP_MS) return cached.identity;
          const verified = await this.#verified(cached.identity.token, uid, cached.identity.email);
          const member = await this.#member(verified); this.#remember(uid, member, this.#clock()); return member;
        }
        this.#cache.delete(uid);
        const record = await this.#load(uid);
        const response = await this.#request(REFRESH, 'application/x-www-form-urlencoded', new URLSearchParams({ grant_type: 'refresh_token', refresh_token: record.refreshToken }).toString());
        // Firebase's official REST sample calls this project_id but returns the
        // numeric project number. Never accept an arbitrary numeric project.
        if (response?.user_id !== uid || ![this.#projectId, this.#projectNumber].includes(response.project_id) || response.token_type !== 'Bearer'
            || !tokenValid(response.refresh_token) || !/^\d{1,5}$/.test(String(response.expires_in))
            || Number(response.expires_in) < 61 || Number(response.expires_in) > 7200) throw new AccessError('viewer-identity-mismatch', 401);
        const verified = await this.#verified(response.id_token, uid, record.email);
        // Preserve every verified rotation, even if the subsequent membership
        // read has a temporary outage. This grants no authorization by itself.
        await this.#save(uid, record.email, response.refresh_token);
        const member = await this.#member(verified);
        this.#remember(uid, member, this.#clock()); return member;
      } catch (error) {
        this.#cache.delete(uid);
        if ([401, 403].includes(error.status) && error.code !== 'viewer-not-paired') await this.#destroy(uid);
        if (error instanceof AccessError) throw error;
        throw unavailable();
      }
    });
  }
  async revoke(uid) { return this.#serialized(uid, async () => { await this.#directory(); await this.#destroy(uid); return Object.freeze({ uid, paired: false }); }); }
}
