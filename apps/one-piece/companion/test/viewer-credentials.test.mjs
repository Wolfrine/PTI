import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm, symlink, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { generateKeyPair, SignJWT } from 'jose';
import { FirebaseIdentity, FamilyAccess } from '../src/auth.mjs';
import { ViewerCredentials } from '../src/viewer-credentials.mjs';
import { WindowsProtection } from '../src/dpapi.mjs';

// Every account, token, HTTP response and key below is synthetic. No Firebase call,
// real Google credential, browser storage, family email, or H: credential is used.
const PROJECT = 'pti-app-2ab59';
const PROJECT_NUMBER = '185802494856';
const OWNER = 'fixture-owner';
const API_KEY = 'fixture-public-web-api-key-0001';
const START = 1_792_000_000_000;
const { publicKey, privateKey } = await generateKeyPair('RS256');
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const fields = value => ({ fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === 'boolean' ? { booleanValue: item } : { stringValue: item }])) });
const filename = uid => `viewer-${createHash('sha256').update(uid).digest('hex')}.json`;
async function idToken(now, uid = 'fixture-viewer', patch = {}) {
  const seconds = Math.floor(now / 1000);
  return new SignJWT({ sub: uid, email: `${uid.toLowerCase()}@example.test`, email_verified: true,
    auth_time: seconds - 10, iat: seconds, exp: seconds + 3600,
    aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`,
    firebase: { sign_in_provider: 'google.com' }, ...patch })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' }).sign(privateKey);
}
function googleToken(now, patch = {}) {
  const seconds = Math.floor(now / 1000);
  // The fake exchange stands in for Google's signature validation. This fixture
  // is never sent to Google and is not represented as a genuine provider token.
  return `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com', iat: seconds, exp: seconds + 3600, ...patch,
  })).toString('base64url')}.fixture-signature`;
}
async function fixture(t, overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'one-piece-viewer-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const key = randomBytes(32); let now = START;
  const state = { calls: [], blocked: false, householdActive: true, responsePatch: null, refreshPatch: null, refreshCount: 0,
    uid: 'fixture-viewer', failRefresh: null, failMembership: false, failProtect: false, protectedCalls: 0, secured: 0, receivedRefresh: [] };
  const protect = async (value, entropy) => {
    state.protectedCalls++;
    if (state.failProtect) throw new Error('fixture-encryption-failure');
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(entropy);
    const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  };
  const unprotect = async (value, entropy) => {
    const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
    decipher.setAAD(entropy); decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]);
  };
  const fetchImpl = async (url, init) => {
    state.calls.push({ url, method: init.method ?? 'GET', signal: init.signal, redirect: init.redirect });
    assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
    if (url.startsWith('https://firestore.googleapis.com/')) {
      if (state.failMembership) return json({}, 503);
      const raw = init.headers.Authorization.replace(/^Bearer /, '');
      const caller = await identity.verify(raw);
      if(url.endsWith('/workspace'))return json(fields({ownerUid:OWNER,active:state.householdActive}));
      return json(fields({ role: state.blocked ? 'blocked' : 'member', active: !state.blocked, uid: caller.uid, email: caller.email }));
    }
    assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store');
    if (url === `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${API_KEY}`) {
      assert.equal(init.headers['Content-Type'], 'application/json');
      const payload = JSON.parse(init.body);
      assert.deepEqual(Object.keys(payload).sort(), ['postBody', 'requestUri', 'returnIdpCredential', 'returnSecureToken'].sort());
      assert.equal(payload.requestUri, 'https://pti-app-2ab59.web.app/one-piece/');
      assert.equal(payload.returnSecureToken, true); assert.equal(payload.returnIdpCredential, false);
      const form = new URLSearchParams(payload.postBody);
      assert.equal(form.get('providerId'), 'google.com'); assert.equal(form.get('id_token'), googleToken(now));
      return json({ localId: state.uid, email: `${state.uid.toLowerCase()}@example.test`, providerId: 'google.com',
        idToken: await idToken(now, state.uid), refreshToken: `fixture-refresh-${state.uid}-initial`, expiresIn: '3600', ...state.responsePatch });
    }
    assert.equal(url, `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`);
    const form = new URLSearchParams(init.body);
    assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(form.get('grant_type'), 'refresh_token'); assert.ok(form.get('refresh_token').startsWith('fixture-refresh-'));
    state.receivedRefresh.push(form.get('refresh_token'));
    state.refreshCount++;
    if (state.failRefresh) return json({ error: { message: 'FIXTURE_INVALID_REFRESH' } }, state.failRefresh);
    const uid = /fixture-refresh-(.*)-(?:initial|rotation-\d+)$/.exec(form.get('refresh_token'))[1];
    return json({ user_id: uid, project_id: PROJECT_NUMBER, token_type: 'Bearer', id_token: await idToken(now, uid),
      refresh_token: `fixture-refresh-${uid}-rotation-${state.refreshCount}`, expires_in: '3600', ...state.refreshPatch });
  };
  const identity = new FirebaseIdentity({ projectId: PROJECT, clock: () => now, keyResolver: () => publicKey });
  const family = new FamilyAccess({ projectId: PROJECT, ownerUid: OWNER, fetchImpl });
  const config = { root, projectId: PROJECT, ownerUid: OWNER, apiKey: API_KEY, identity, family, fetchImpl,
    protect, unprotect, secureDirectory: async dir => { state.secured++; await mkdir(dir, { recursive: true }); }, clock: () => now, ...overrides };
  const store = new ViewerCredentials(config);
  return { root, state, store, config, protect, unprotect, identity,
    setNow: value => { now = value; }, advance: milliseconds => { now += milliseconds; },
    actor: async uid => { const token = await idToken(now, uid); return identity.verify(token); },
    google: () => googleToken(now),
    pair: async (uid = state.uid) => { state.uid = uid; return store.pairGoogle(await identity.verify(await idToken(now, uid)), googleToken(now)); },
  };
}

test('pairing exchanges a fresh provider credential, binds returned identity and retains only encrypted refresh', async t => {
  const f = await fixture(t);
  const result = await f.pair();
  assert.deepEqual(result, { uid: 'fixture-viewer', email: 'fixture-viewer@example.test', paired: true });
  assert.ok(Object.isFrozen(result)); assert.equal(f.state.protectedCalls, 1); assert.equal(f.state.secured, 1);
  const files = await readdir(f.root); assert.deepEqual(files, [filename('fixture-viewer')]);
  const content = await readFile(path.join(f.root, files[0]), 'utf8');
  for (const secret of ['fixture-refresh', 'example.test', 'idToken', 'refreshToken', f.google()]) assert.equal(content.includes(secret), false);
  assert.deepEqual(Object.keys(JSON.parse(content)), ['version', 'protection', 'ciphertext']);
  const member = await f.store.getAuthorized('fixture-viewer');
  assert.equal(member.uid, 'fixture-viewer'); assert.equal(member.role, 'member');
  assert.equal((await f.identity.verify(member.token)).uid, 'fixture-viewer');
  assert.equal(f.state.calls.length, 5); // two membership+workspace checks around the exchange
  assert.deepEqual(JSON.parse(JSON.stringify(f.store)), {}); // no enumerable secret/cache state
});

test('pairing rejects different UID/email/project/provider or invalid signed claims before any retained credential', async t => {
  const f = await fixture(t);
  for (const patch of [ { localId: 'fixture-other' }, { email: 'other@example.test' }, { providerId: 'password' },
    { needConfirmation: true }, { refreshToken: '' }, { expiresIn: '99999' },
    { idToken: await idToken(START, 'fixture-other') },
    { idToken: await idToken(START, undefined, { aud: 'wrong-project' }) },
    { idToken: await idToken(START, undefined, { email_verified: false }) },
    { idToken: await idToken(START, undefined, { firebase: { sign_in_provider: 'password' } }) } ]) {
    f.state.responsePatch = patch;
    await assert.rejects(f.pair()); assert.deepEqual(await readdir(f.root), []);
  }
  assert.equal(f.state.protectedCalls, 0);
});

test('untrusted/stale/malformed provider input and forged actors cannot reach credential exchange', async t => {
  const f = await fixture(t); const actor = await f.actor();
  for (const token of [ 'browser-refresh-token', '', 'a'.repeat(20_000), googleToken(START - 301_000),
    googleToken(START, { exp: START / 1000 - 1 }), googleToken(START, { iat: START / 1000 + 1 }),
    googleToken(START, { iss: 'https://attacker.invalid' }) ]) {
    await assert.rejects(f.store.pairGoogle(actor, token), { code: 'fresh-google-credential-required' });
  }
  await assert.rejects(f.store.pairGoogle({ ...actor, uid: 'wrong-viewer' }, f.google()), { code: 'viewer-identity-mismatch' });
  for (const uid of ['../escape', '..', 'a/b', 'a\\b', 'a%2Fb', '', 'a'.repeat(129)]) await assert.rejects(f.store.getAuthorized(uid), { code: 'invalid-profile' });
  assert.equal(f.state.calls.length, 0); assert.equal(f.state.protectedCalls, 0);
});

test('refresh happens before expiry, verifies identity, checks membership and atomically rotates across restart', async t => {
  const f = await fixture(t); await f.pair();
  f.advance(3_541_000);
  const before = await readFile(path.join(f.root, filename('fixture-viewer')), 'utf8');
  const authorized = await f.store.getAuthorized('fixture-viewer');
  assert.equal(f.state.refreshCount, 1); assert.ok(authorized.expiresAt > START + 3_600_000);
  const after = await readFile(path.join(f.root, filename('fixture-viewer')), 'utf8'); assert.notEqual(after, before);
  const freshProcess = new ViewerCredentials(f.config);
  const recovered = await freshProcess.getAuthorized('fixture-viewer');
  assert.equal(recovered.uid, 'fixture-viewer'); assert.equal(f.state.refreshCount, 2);
  assert.deepEqual(await readdir(f.root), [filename('fixture-viewer')]);
});

test('family blocking is rechecked at 60 seconds and removes retained credentials', async t => {
  const f = await fixture(t); await f.pair(); f.state.blocked = true;
  f.advance(59_999); assert.equal((await f.store.getAuthorized('fixture-viewer')).uid, 'fixture-viewer');
  f.advance(1); await assert.rejects(f.store.getAuthorized('fixture-viewer'), { code: 'not-invited', status: 403 });
  assert.deepEqual(await readdir(f.root), []);
  await assert.rejects(f.store.getAuthorized('fixture-viewer'), { code: 'viewer-not-paired' });
});
test('household suspension blocks a still-active invited viewer at the membership recheck',async t=>{
 const f=await fixture(t);await f.pair();f.state.householdActive=false;f.advance(60_000);
 await assert.rejects(f.store.getAuthorized('fixture-viewer'),{code:'family-unavailable',status:403});
 assert.deepEqual(await readdir(f.root),[]);
 await assert.rejects(f.store.getAuthorized('fixture-viewer'),{code:'viewer-not-paired'});
});

test('failed membership checks never reuse prior authorization; transient outage permits a later new check', async t => {
  const f = await fixture(t); await f.pair(); f.advance(60_000); f.state.failMembership = true;
  await assert.rejects(f.store.getAuthorized('fixture-viewer'), { code: 'membership-unavailable', status: 503 });
  f.state.failMembership = false; const result = await f.store.getAuthorized('fixture-viewer');
  assert.equal(result.uid, 'fixture-viewer'); assert.equal(f.state.refreshCount, 1);
});

test('a verified refresh rotation survives a later membership outage without authorizing playback', async t => {
  const f = await fixture(t); await f.pair(); f.advance(3_600_000); f.state.failMembership = true;
  await assert.rejects(f.store.getAuthorized('fixture-viewer'), { code: 'membership-unavailable' });
  f.state.failMembership = false;
  assert.equal((await new ViewerCredentials(f.config).getAuthorized('fixture-viewer')).uid, 'fixture-viewer');
  assert.deepEqual(f.state.receivedRefresh, ['fixture-refresh-fixture-viewer-initial', 'fixture-refresh-fixture-viewer-rotation-1']);
});

test('invalid refresh, wrong refreshed identity/project and blocked membership fail closed', async t => {
  for (const patch of [ { user_id: 'other' }, { project_id: 'wrong-project' }, { project_id: '999999999999' }, { token_type: 'Something' },
    { refresh_token: '' }, { id_token: await idToken(START + 3_600_000, 'other') },
    { id_token: await idToken(START + 3_600_000, undefined, { firebase: { sign_in_provider: 'password' } }) } ]) {
    const f = await fixture(t); await f.pair(); f.advance(3_600_000); f.state.refreshPatch = patch;
    await assert.rejects(f.store.getAuthorized('fixture-viewer'));
    assert.deepEqual(await readdir(f.root), []);
  }
  const f = await fixture(t); await f.pair(); f.advance(3_600_000); f.state.failRefresh = 400;
  await assert.rejects(f.store.getAuthorized('fixture-viewer'), { code: 'viewer-reauthentication-required' });
  assert.deepEqual(await readdir(f.root), []);
});

test('a failed refresh or failed encrypted rotation denies authorization with no plaintext fallback', async t => {
  const f = await fixture(t); await f.pair(); f.advance(3_600_000); f.state.failRefresh = 503;
  await assert.rejects(f.store.getAuthorized('fixture-viewer'), { code: 'viewer-identity-unavailable' });
  assert.equal((await readdir(f.root)).length, 1);
  f.state.failRefresh = null; f.state.failProtect = true;
  await assert.rejects(f.store.getAuthorized('fixture-viewer'), { code: 'viewer-credential-unavailable' });
  f.state.failProtect = false;
  assert.equal((await f.store.getAuthorized('fixture-viewer')).uid, 'fixture-viewer');
  const g = await fixture(t, { protect: async input => Buffer.from(input) });
  await assert.rejects(g.pair(), { code: 'viewer-credential-unavailable' }); assert.deepEqual(await readdir(g.root), []);
});

test('distinct viewers retain separate identities; Windows case variants have different private paths', async t => {
  const f = await fixture(t); await f.pair('FixtureViewer'); await f.pair('fixtureviewer');
  assert.equal((await readdir(f.root)).length, 2);
  const restarted = new ViewerCredentials(f.config);
  assert.equal((await restarted.getAuthorized('FixtureViewer')).uid, 'FixtureViewer');
  assert.equal((await restarted.getAuthorized('fixtureviewer')).uid, 'fixtureviewer');
  await f.store.revoke('FixtureViewer');
  await assert.rejects(f.store.getAuthorized('FixtureViewer'), { code: 'viewer-not-paired' });
  assert.equal((await f.store.getAuthorized('fixtureviewer')).uid, 'fixtureviewer');
});

test('revoke serializes with queued refreshes and deletes memory and disk; duplicates are harmless', async t => {
  const f = await fixture(t); await f.pair(); f.advance(3_600_000);
  const [one, two] = await Promise.all([f.store.getAuthorized('fixture-viewer'), f.store.getAuthorized('fixture-viewer')]);
  assert.equal(one.token, two.token); assert.equal(f.state.refreshCount, 1);
  const work = f.store.getAuthorized('fixture-viewer'); const revoked = f.store.revoke('fixture-viewer');
  await work; assert.deepEqual(await revoked, { uid: 'fixture-viewer', paired: false });
  await f.store.revoke('fixture-viewer'); assert.deepEqual(await readdir(f.root), []);
  await assert.rejects(f.store.getAuthorized('fixture-viewer'), { code: 'viewer-not-paired' });
});

test('ciphertext tampering, cross-UID/family swapping, extra fields and oversized files are rejected', async t => {
  const f = await fixture(t); await f.pair();
  const file = path.join(f.root, filename('fixture-viewer')); const original = await readFile(file, 'utf8');
  const mutations = [ JSON.stringify({ ...JSON.parse(original), unexpected: true }), 'x'.repeat(128 * 1024 + 1),
    JSON.stringify({ version: 1, protection: 'plaintext', ciphertext: 'c2VjcmV0' }),
    JSON.stringify({ ...JSON.parse(original), ciphertext: Buffer.from('ciphertext-tampering').toString('base64') }) ];
  for (const content of mutations) {
    await writeFile(file, content); const restarted = new ViewerCredentials(f.config);
    await assert.rejects(restarted.getAuthorized('fixture-viewer'), { code: 'viewer-credential-unavailable' });
  }
  await writeFile(file, original);
  await copyFile(file, path.join(f.root, filename('another-viewer')));
  await assert.rejects(new ViewerCredentials(f.config).getAuthorized('another-viewer'), { code: 'viewer-credential-unavailable' });
  const otherFamily = { ...f.config, ownerUid: 'another-owner', family: { requireMember: async x => ({ ...x, role: 'member' }) } };
  await assert.rejects(new ViewerCredentials(otherFamily).getAuthorized('fixture-viewer'), { code: 'viewer-credential-unavailable' });
});

test('oversized/slow identity responses are bounded and errors never repeat credentials', async t => {
  const f = await fixture(t); const realFetch = f.config.fetchImpl;
  let cancelled = false;
  const oversized = new ViewerCredentials({ ...f.config, fetchImpl: async (url, init) => {
    if (!url.startsWith('https://identitytoolkit.')) return realFetch(url, init);
    return new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(65_537)); }, cancel() { cancelled = true; } }));
  } });
  await assert.rejects(oversized.pairGoogle(await f.actor(), f.google()), { code: 'invalid-identity-response' });
  assert.equal(cancelled, true);
  const slow = new ViewerCredentials({ ...f.config, deadlineMs: 50, fetchImpl: async (url, init) => {
    if (!url.startsWith('https://identitytoolkit.')) return realFetch(url, init);
    return new Promise(() => {});
  } });
  const start = performance.now();
  await assert.rejects(slow.pairGoogle(await f.actor(), f.google()), error => error.code === 'viewer-identity-unavailable' && !JSON.stringify(error).includes('fixture-signature'));
  assert.ok(performance.now() - start < 2_000); assert.deepEqual(await readdir(f.root), []);
});

test('configuration rejects partial protection, mixed family/project and non-H production roots', async t => {
  const f = await fixture(t);
  assert.throws(() => new ViewerCredentials({ ...f.config, unprotect: undefined }), /Inject all/);
  assert.throws(() => new ViewerCredentials({ ...f.config, projectId: 'another-project', projectNumber: PROJECT_NUMBER }), /configuration mismatch/);
  assert.throws(() => new ViewerCredentials({ ...f.config, ownerUid: 'another-owner' }), /configuration mismatch/);
  assert.throws(() => new ViewerCredentials({ ...f.config, protect: undefined, unprotect: undefined, secureDirectory: undefined }), /private H:/);
  if (process.platform !== 'win32') assert.throws(() => new WindowsProtection(), { code: 'windows-dpapi-required' });
});

test('real Windows DPAPI CurrentUser roundtrip, entropy isolation and restrictive directory ACL use nonsecret canary only', { skip: process.platform !== 'win32' }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'one-piece-dpapi-canary-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const protection = new WindowsProtection(); const canary = Buffer.from('PUBLIC-TEST-CANARY-NOT-A-CREDENTIAL');
  const entropy = createHash('sha256').update('fixture-family-viewer').digest();
  await protection.secureDirectory(directory);
  const encrypted = await protection.protect(canary, entropy);
  assert.notDeepEqual(encrypted, canary);
  assert.equal(encrypted.includes(canary), false);
  assert.deepEqual(await protection.unprotect(encrypted, entropy), canary);
  await assert.rejects(protection.unprotect(encrypted, randomBytes(32)), { code: 'protected-store-unavailable' });
  const linkPath = path.join(directory, 'link');
  await symlink(directory, linkPath, 'junction');
  await assert.rejects(protection.secureDirectory(linkPath));
});
