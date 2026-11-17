export const DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const DRIVE_METADATA_SCOPE = 'https://www.googleapis.com/auth/drive.metadata';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
// Save creates originals through Velum. Library moves use metadata access.
export const CONNECT_SCOPES = Object.freeze([DRIVE_READ_SCOPE, DRIVE_METADATA_SCOPE, DRIVE_FILE_SCOPE]);

const OWNER_UID = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
const CLIENT_ID = '185802494856-rn0q6qi5goj0mifha0bkah55slu3kvju.apps.googleusercontent.com';
const SESSION_KEY = 'velum-drive-access-v2';
const TOKEN_MARGIN_MS = 60000;
const MAX_TOKEN_AGE_MS = 50 * 60 * 1000;

function reconnectError() {
  return Object.assign(new Error('Reconnect Drive to continue this action.'), {code:'drive/reconnect-required'});
}

export function createDriveAccess({auth, requestAccess, fetchImpl=fetch,
  storage=globalThis.sessionStorage, backupStorage=globalThis.localStorage}) {
  let epoch = 0;
  let authorizationVersion = 0;
  let active = null;
  let connecting = null;
  let restoring = null;
  const controllers = new Set();

  function identity() {
    const user = auth.currentUser;
    const googleUid = user?.providerData?.find(provider => provider.providerId === 'google.com')?.uid;
    if (user?.uid !== OWNER_UID || !googleUid) throw new Error('The Velum owner Google account is required.');
    return {uid:user.uid, googleUid};
  }

  function check(generation, expectedGoogleUid) {
    if (generation !== epoch) throw new Error('Velum is locked. Unlock and reconnect Drive.');
    const owner = identity();
    if (expectedGoogleUid && owner.googleUid !== expectedGoogleUid) throw new Error('The connected Google account changed.');
    return owner;
  }

  function removeSession() {
    for (const cache of [storage, backupStorage]) {
      try {
        cache?.removeItem(SESSION_KEY);
        cache?.removeItem('velum-drive-token');
        cache?.removeItem('velum-drive-token-at');
        cache?.removeItem('velum-drive-token-cache');
        cache?.removeItem('velum-drive-token-at-cache');
      } catch {}
    }
  }

  function invalidate() {
    active = null;
    removeSession();
  }

  function has(scopes=CONNECT_SCOPES) {
    if (!active || Date.now() >= active.expiresAt) return false;
    try {
      const owner = identity();
      return active.uid === owner.uid && active.googleUid === owner.googleUid
        && scopes.every(scope => active.scopes.includes(scope));
    } catch {
      return false;
    }
  }

  function require(scopes=CONNECT_SCOPES) {
    identity();
    if (!has(scopes)) throw reconnectError();
    return active.token;
  }

  function getOperationGuard() {
    const generation = epoch;
    const googleUid = active?.googleUid;
    return () => check(generation, googleUid);
  }

  async function verify(token, generation, version, originalExpiry=Infinity) {
    const owner = check(generation);
    if (typeof token !== 'string' || !token) throw reconnectError();
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const response = await fetchImpl('https://oauth2.googleapis.com/tokeninfo', {
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({access_token:token}),
        cache:'no-store',
        credentials:'omit',
        signal:controller.signal
      });
      check(generation, owner.googleUid);
      if (!response.ok) throw reconnectError();
      const info = await response.json();
      check(generation, owner.googleUid);
      if (version !== authorizationVersion) throw reconnectError();
      const audience = info.aud || info.audience || info.issued_to;
      const subject = info.sub || info.user_id;
      const scopes = String(info.scope || '').split(/\s+/).filter(Boolean);
      const remainingMs = Number(info.expires_in) * 1000;
      if (audience !== CLIENT_ID || subject !== owner.googleUid
        || !CONNECT_SCOPES.every(scope => scopes.includes(scope))
        || !Number.isFinite(remainingMs) || remainingMs <= TOKEN_MARGIN_MS) {
        throw reconnectError();
      }
      const expiresAt = Math.min(originalExpiry,
        Date.now() + Math.min(remainingMs - TOKEN_MARGIN_MS, MAX_TOKEN_AGE_MS));
      if (expiresAt <= Date.now()) throw reconnectError();
      const verified = {
        version:2,
        uid:owner.uid,
        googleUid:owner.googleUid,
        token,
        scopes,
        expiresAt
      };
      active = verified;
      for (const cache of [storage, backupStorage]) {
        try { cache?.setItem(SESSION_KEY, JSON.stringify(verified)); } catch {}
      }
      return verified;
    } finally {
      controller.abort();
      controllers.delete(controller);
    }
  }

  function connect() {
    if (has()) return Promise.resolve();
    if (connecting?.generation === epoch) return connecting.promise;
    const generation = epoch;
    const version = ++authorizationVersion;
    invalidate();
    // The SDK popup starts on this call stack, before any network preflight.
    let requested;
    try { requested = requestAccess([...CONNECT_SCOPES]); }
    catch (error) { return Promise.reject(error); }
    const promise = Promise.resolve(requested).then(async credential => {
      check(generation);
      await verify(credential?.accessToken, generation, version);
    }).finally(() => {
      if (connecting?.promise === promise) connecting = null;
    });
    connecting = {generation, promise};
    return promise;
  }

  function ensure(scopes=CONNECT_SCOPES) {
    if (has(scopes)) return Promise.resolve();
    return connect().then(() => { require(scopes); });
  }

  function restore() {
    if (has()) return Promise.resolve(true);
    if (connecting?.generation === epoch) return connecting.promise.then(() => true, () => false);
    if (restoring?.generation === epoch) return restoring.promise;
    const generation = epoch;
    const version = authorizationVersion;
    const promise = (async () => {
      try {
        const owner = identity();
        let saved;
        for (const cache of [storage, backupStorage]) {
          let candidate;
          try { candidate = JSON.parse(cache?.getItem(SESSION_KEY) || 'null'); } catch { continue; }
          if (candidate?.version === 2 && candidate.uid === owner.uid && candidate.googleUid === owner.googleUid
            && Number.isFinite(candidate.expiresAt) && candidate.expiresAt > Date.now()) {
            saved = candidate;
            break;
          }
        }
        if (!saved) {
          if (generation === epoch && version === authorizationVersion) invalidate();
          return false;
        }
        await verify(saved.token, generation, version, saved.expiresAt);
        return true;
      } catch {
        if (generation === epoch && version === authorizationVersion) invalidate();
        return false;
      } finally {
        if (!active && generation === epoch && version === authorizationVersion) removeSession();
      }
    })().finally(() => {
      if (restoring?.promise === promise) restoring = null;
    });
    restoring = {generation, promise};
    return promise;
  }

  async function request(url, options={}, scopes=[DRIVE_READ_SCOPE]) {
    const token = require(scopes);
    const generation = epoch;
    const googleUid = active.googleUid;
    const controller = new AbortController();
    const abort = () => controller.abort();
    const finish = () => {
      controllers.delete(controller);
      options.signal?.removeEventListener('abort', abort);
    };
    controllers.add(controller);
    options.signal?.addEventListener('abort', abort, {once:true});
    if (options.signal?.aborted) controller.abort();
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    try {
      const response = await fetchImpl(url, {...options, headers, signal:controller.signal});
      check(generation, googleUid);
      if (response.status === 401) {
        if (active?.token === token) invalidate();
        await response.body?.cancel();
        throw reconnectError();
      }
      if (!response.ok) {
        await response.body?.cancel();
        finish();
      }
      if (!response.body || response.headers.get('Content-Length') === '0') finish();
      const guardResult = async operation => {
        try {
          const result = await operation();
          check(generation, googleUid);
          return result;
        } catch (error) {
          controller.abort();
          throw error;
        } finally { finish(); }
      };
      const body = response.body && new Proxy(response.body, {get(target, property) {
        if (property === 'cancel') return reason => guardResult(() => target.cancel(reason));
        if (property === 'getReader') return (...args) => {
          const reader = target.getReader(...args);
          return new Proxy(reader, {get(source, method) {
            if (method === 'cancel') return reason => guardResult(() => source.cancel(reason));
            if (method === 'read') return async () => {
              try {
                const result = await source.read();
                check(generation, googleUid);
                if (result.done) finish();
                return result;
              } catch (error) { controller.abort(); finish(); throw error; }
            };
            const value = Reflect.get(source, method, source);
            return typeof value === 'function' ? value.bind(source) : value;
          }});
        };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }});
      return new Proxy(response, {get(target, property) {
        if (property === 'body') return body;
        if (['json','text','blob','arrayBuffer','formData'].includes(property)) {
          return () => guardResult(() => target[property]());
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }});
    } catch (error) {
      controller.abort();
      finish();
      throw error;
    }
  }

  function cancelPending() {
    epoch++;
    authorizationVersion++;
    for (const controller of controllers) controller.abort();
    controllers.clear();
  }

  function clear() {
    cancelPending();
    invalidate();
  }

  return {connect, ensure, restore, require, request, has, getToken:require, getOperationGuard, cancelPending, clear};
}
