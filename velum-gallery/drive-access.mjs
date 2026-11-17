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
const CONNECT_INTENT_KEY = 'velum-drive-connect-intent-v1';
const CONNECT_INTENT_MAX_AGE_MS = 10 * 60 * 1000;
const DISCONNECT_GENERATION_KEY = 'velum-drive-disconnect-generation-v1';

function reconnectError() {
  return Object.assign(new Error('Reconnect Drive to continue this action.'), {code:'drive/reconnect-required'});
}

export function createDriveAccess({auth, requestAccess, signIn=requestAccess,
  cancelAccessRequest=()=>[], onConnectRequired=()=>{}, fetchImpl=fetch,
  storage=globalThis.sessionStorage, backupStorage=globalThis.localStorage, backend=false}) {
  let epoch = 0;
  let authorizationVersion = 0;
  let active = null;
  let connecting = null;
  let restoring = null;
  const controllers = new Set();
  const cancelledGrantIds = new Set();
  const temporaryRevocations = new Map();
  let disconnecting = null;
  let lateRevocations = 0;
  let lateGoogleRevoked = false;
  let explicitConnectIntent;
  let serverMode=false,backendReady=null,temporaryAllowed=false,pendingTemporaryRevocation='',disconnectPending=false;
  try{disconnectPending=backupStorage?.getItem('velum-drive-disconnect-pending-v1')==='1';}catch{}
  let temporaryRevocationExpected=false,pendingTemporaryGoogleUid='',pendingTemporaryExpiry=0;
  try{
    temporaryRevocationExpected=backupStorage?.getItem('velum-drive-revoke-expected-v1')==='1';
    const pending=JSON.parse(storage?.getItem('velum-drive-revoke-v1')||'null');
    const credentials = Array.isArray(pending?.credentials) ? [...pending.credentials, pending] : [pending];
    for (const credential of credentials) {
      if ((credential?.uid === undefined || credential.uid === OWNER_UID)
        && typeof credential?.token === 'string' && credential.token
        && typeof credential.googleUid === 'string' && credential.googleUid
        && Number.isFinite(credential.expiresAt)) {
        rememberTemporaryRevocation(credential.token, credential.googleUid, credential.expiresAt, false);
      }
    }
  }catch{}
  try{serverMode=backend&&backupStorage?.getItem('velum-drive-server-active-v1')==='1';}catch{}
  const ready = probeHealth();

  function backendError() {
    return Object.assign(new Error('The saved Drive connection is temporarily unavailable. Try Connect Drive again.'), {code:'drive/unavailable'});
  }

  async function probeHealth() {
    if (!backend) return;
    try {
      const response = await fetchImpl('/api/drive/health', {
        cache:'no-store', credentials:'same-origin', signal:AbortSignal.timeout(10000)
      });
      if (!response.ok) throw backendError();
      const value = await response.json();
      if (value?.service !== 'velum-drive' || typeof value.ready !== 'boolean') throw backendError();
      backendReady = value.ready;
    } catch {
      // A saved server connection remains server-only through an outage.
      if (!serverMode) backendReady = false;
    }
  }

  async function serverRequest(path,generation){
    const owner=check(generation),user=auth.currentUser;
    const idToken=await user.getIdToken();check(generation,owner.googleUid);
    const controller=new AbortController();controllers.add(controller);
    try{
      const response=await fetchImpl(`/api/drive/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${idToken}`},body:'{}',credentials:'same-origin',cache:'no-store',signal:controller.signal});
      check(generation,owner.googleUid);
      let value;
      try { value=await response.json(); } catch { throw backendError(); }
      check(generation,owner.googleUid);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw backendError();
      if(!response.ok){
        const messages={
          'drive/not-configured':'Secure renewal setup is pending. A temporary Drive session is available.',
          'drive/revocation-pending':'Drive is finishing a previous disconnect. Its recovery window can take up to ten minutes.',
          'drive/connect-in-progress':'A Drive connection is already in progress. Finish that connection before trying again.',
          'drive/reconnect-required':'The saved Drive grant needs to be connected again.',
          'drive/owner-sign-in-required':'Sign in to the Velum owner account again to renew Drive access.',
          'drive/google-unavailable':'Google could not renew the saved Drive connection. Try again.',
          'drive/configuration-unavailable':'The saved Drive connection is temporarily unavailable. Try again.'
        };
        throw Object.assign(new Error(messages[value.code]||`Drive could not complete this connection (${response.status}).`),{code:value.code||'drive/unavailable',status:response.status,stage:path});
      }
      return value;
    }finally{controllers.delete(controller);}
  }
  function disconnectGeneration() {
    try { return backupStorage?.getItem(DISCONNECT_GENERATION_KEY) || ''; }
    catch { return null; }
  }

  function checkDisconnectGeneration(expected) {
    if (disconnectGeneration() !== expected) throw pendingDisconnectError();
  }

  function rememberConnectIntent(owner, requestedDisconnectGeneration) {
    explicitConnectIntent = {
      version:1, uid:owner.uid, googleUid:owner.googleUid, requestedAt:Date.now(),
      disconnectGeneration:requestedDisconnectGeneration
    };
    try { storage?.setItem(CONNECT_INTENT_KEY, JSON.stringify(explicitConnectIntent)); } catch {}
  }

  function clearConnectIntent() {
    explicitConnectIntent = null;
    try { storage?.removeItem(CONNECT_INTENT_KEY); } catch {}
  }

  function hasConnectIntent(owner) {
    if (explicitConnectIntent === undefined) {
      try { explicitConnectIntent = JSON.parse(storage?.getItem(CONNECT_INTENT_KEY) || 'null'); }
      catch { explicitConnectIntent = null; }
    }
    const intent = explicitConnectIntent;
    const age = Date.now() - intent?.requestedAt;
    return intent?.version === 1 && intent.uid === owner.uid && intent.googleUid === owner.googleUid
      && typeof intent.disconnectGeneration === 'string' && intent.disconnectGeneration === disconnectGeneration()
      && Number.isSafeInteger(intent.requestedAt) && age >= 0 && age < CONNECT_INTENT_MAX_AGE_MS;
  }

  function clearPendingDisconnect() {
    disconnectPending = false;
    try { backupStorage?.removeItem('velum-drive-disconnect-pending-v1'); } catch {}
  }

  function persistTemporaryRevocations() {
    const credentials = [...temporaryRevocations.values()];
    const selected = credentials.find(value => value.token === pendingTemporaryRevocation
      && value.googleUid === pendingTemporaryGoogleUid) || credentials[credentials.length - 1];
    if (!selected) {
      pendingTemporaryRevocation = '';
      pendingTemporaryGoogleUid = '';
      pendingTemporaryExpiry = 0;
      temporaryRevocationExpected = false;
      try {
        storage?.removeItem('velum-drive-revoke-v1');
        backupStorage?.removeItem('velum-drive-revoke-expected-v1');
        backupStorage?.removeItem('velum-drive-temporary-grant-v1');
      } catch {}
      return;
    }
    pendingTemporaryRevocation = selected.token;
    pendingTemporaryGoogleUid = selected.googleUid;
    pendingTemporaryExpiry = selected.expiresAt;
    temporaryRevocationExpected = true;
    const record = value => ({uid:OWNER_UID, token:value.token, googleUid:value.googleUid, expiresAt:value.expiresAt});
    try {
      storage?.setItem('velum-drive-revoke-v1', JSON.stringify({...record(selected), credentials:credentials.map(record)}));
      backupStorage?.setItem('velum-drive-revoke-expected-v1', '1');
      backupStorage?.setItem('velum-drive-temporary-grant-v1', '1');
    } catch {}
  }

  function rememberTemporaryRevocation(token, googleUid, expiresAt, persist=true) {
    const key = JSON.stringify([googleUid, token]);
    let credential = temporaryRevocations.get(key);
    if (!credential) {
      credential = {key, token, googleUid, expiresAt};
      temporaryRevocations.set(key, credential);
    }
    if (!pendingTemporaryRevocation || expiresAt >= pendingTemporaryExpiry) {
      pendingTemporaryRevocation = token;
      pendingTemporaryGoogleUid = googleUid;
      pendingTemporaryExpiry = expiresAt;
    }
    temporaryRevocationExpected = true;
    if (persist) persistTemporaryRevocations();
    return credential;
  }

  function completeTemporaryRevocation(credential) {
    if (temporaryRevocations.get(credential.key) !== credential) return;
    temporaryRevocations.delete(credential.key);
    persistTemporaryRevocations();
  }

  function pendingDisconnectError() {
    return Object.assign(new Error('Disconnect is pending. Finish its revocation before reconnecting.'), {code:'drive/disconnect-pending'});
  }

  function checkDisconnectRecovery(owner) {
    if (!backend || !hasConnectIntent(owner) || disconnecting || lateRevocations > 0
      || cancelledGrantIds.size > 0 || temporaryRevocations.size > 0 || pendingTemporaryRevocation) {
      throw pendingDisconnectError();
    }
  }

  async function serverSession(generation,version=authorizationVersion,recoverDisconnect=false,requestedDisconnectGeneration=disconnectGeneration()){
    const requestedOwner = check(generation);
    checkDisconnectGeneration(requestedDisconnectGeneration);
    if (recoverDisconnect) checkDisconnectRecovery(requestedOwner);
    const value=await serverRequest('session',generation),owner=check(generation,requestedOwner.googleUid);
    checkDisconnectGeneration(requestedDisconnectGeneration);
    if (version !== authorizationVersion) throw reconnectError();
    if(value.mode!=='server'||value.owner!==owner.uid||value.googleSub!==owner.googleUid||!CONNECT_SCOPES.every(scope=>value.scopes?.includes(scope))||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now()+60000||typeof value.accessToken!=='string'||!value.accessToken)throw reconnectError();
    if (recoverDisconnect) checkDisconnectRecovery(owner);
    serverMode=true;backendReady=true;
    temporaryAllowed=false;
    try{backupStorage?.setItem('velum-drive-server-active-v1','1');}catch{}
    removeSession();
    active={uid:owner.uid,googleUid:owner.googleUid,token:value.accessToken,scopes:value.scopes,expiresAt:Math.min(value.expiresAt,Date.now()+MAX_TOKEN_AGE_MS)};
    lateGoogleRevoked = false;
    if (recoverDisconnect) {
      // Explicit owner intent can supersede a legacy marker with no credential.
      persistTemporaryRevocations();
      clearPendingDisconnect();
    }
    clearConnectIntent();
  }
  async function connectServer(generation,version=authorizationVersion,recoverDisconnect=false,requestedDisconnectGeneration=disconnectGeneration()){
    const requestedOwner = check(generation);
    checkDisconnectGeneration(requestedDisconnectGeneration);
    try{await serverSession(generation,version,recoverDisconnect,requestedDisconnectGeneration);return;}
    catch(error){if(error?.code!=='drive/reconnect-required')throw error;}
    check(generation, requestedOwner.googleUid);
    checkDisconnectGeneration(requestedDisconnectGeneration);
    if (version !== authorizationVersion) throw reconnectError();
    if (recoverDisconnect) checkDisconnectRecovery(check(generation));
    const value=await serverRequest('start',generation);
    check(generation, requestedOwner.googleUid);
    checkDisconnectGeneration(requestedDisconnectGeneration);
    if (version !== authorizationVersion) throw reconnectError();
    if (recoverDisconnect) checkDisconnectRecovery(requestedOwner);
    const url=new URL(value.authorizeUrl);
    if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth'||url.searchParams.get('client_id')!==CLIENT_ID||url.searchParams.get('redirect_uri')!=='https://pti-app-2ab59-velum.web.app/api/drive/callback')throw new Error('Drive returned an invalid connection address.');
    location.assign(url.href);
    // Same-tab authorization returns through the fixed callback; never report a grant before it exists.
    return new Promise(()=>{});
  }

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
    if(!serverMode){
      for(const cache of [storage,backupStorage]){
        try{
          const value=JSON.parse(cache?.getItem(SESSION_KEY)||'null');
          if(value?.version===2&&value.uid===OWNER_UID&&typeof value.googleUid==='string'&&typeof value.token==='string'&&value.token&&Number.isFinite(value.expiresAt)){
            temporaryRevocationExpected=true;
            rememberTemporaryRevocation(value.token, value.googleUid, value.expiresAt);
            backupStorage?.setItem('velum-drive-temporary-grant-v1','1');
          }
        }catch{}
      }
    }
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
    const requestedDisconnectGeneration = disconnectGeneration();
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
      checkDisconnectGeneration(requestedDisconnectGeneration);
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
      lateGoogleRevoked=false;
      temporaryRevocationExpected=true;pendingTemporaryRevocation=verified.token;pendingTemporaryGoogleUid=verified.googleUid;pendingTemporaryExpiry=verified.expiresAt;
      try{backupStorage?.setItem('velum-drive-temporary-grant-v1','1');}catch{}
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
    let requestedOwner;
    if (auth.currentUser) {
      try { requestedOwner = identity(); } catch (error) { return Promise.reject(error); }
    }
    if (disconnecting) return Promise.reject(new Error('Finishing Disconnect. Try Connect Drive again when it finishes.'));
    if (lateRevocations > 0) return Promise.reject(new Error('Google is finishing Disconnect. Use Connect Drive again when it finishes.'));
    const recoverDisconnect = disconnectPending;
    const gestureNeedsToken = !backend || (!serverMode && backendReady !== true);
    const temporaryRequest = !backend || (!serverMode && (backendReady === false || temporaryAllowed || backendReady === null));
    if (!recoverDisconnect && has()) return Promise.resolve();
    if (connecting?.generation === epoch) return connecting.promise;
    const generation = epoch;
    const version = ++authorizationVersion;
    const requestedDisconnectGeneration = disconnectGeneration();
    if (!recoverDisconnect) cancelledGrantIds.clear();
    invalidate();
    let requested;
    try {
      if (!auth.currentUser) requested = signIn(recoverDisconnect && !temporaryRequest ? [] : [...CONNECT_SCOPES]);
      // Unknown health must not consume the gesture before GIS opens.
      else if (gestureNeedsToken) requested = requestAccess([...CONNECT_SCOPES]);
      else requested = Promise.resolve(null);
    } catch (error) { return Promise.reject(error); }
    const promise = Promise.resolve(requested).then(async credential => {
      const owner = check(generation, requestedOwner?.googleUid);
      checkDisconnectGeneration(requestedDisconnectGeneration);
      await ready;
      check(generation, owner.googleUid);
      if (version !== authorizationVersion) throw reconnectError();
      checkDisconnectGeneration(requestedDisconnectGeneration);
      if (!backend || (!serverMode && (backendReady === false || temporaryAllowed))) {
        await verify(credential?.accessToken, generation, version);
        check(generation, owner.googleUid);
        checkDisconnectGeneration(requestedDisconnectGeneration);
        if (recoverDisconnect) {
          cancelledGrantIds.clear();
          clearPendingDisconnect();
        }
        clearConnectIntent();
        return;
      }
      rememberConnectIntent(owner, requestedDisconnectGeneration);
      if (recoverDisconnect) {
        checkDisconnectRecovery(owner);
        await connectServer(generation, version, true, requestedDisconnectGeneration);
        return;
      }
      try { await connectServer(generation, version, false, requestedDisconnectGeneration); }
      catch (error) {
        if (serverMode || error?.code !== 'drive/not-configured') throw error;
        backendReady = false;
        temporaryAllowed = true;
        if (credential?.accessToken) await verify(credential.accessToken, generation, version);
        else throw Object.assign(new Error('Connect Drive to continue with your Google account.'), {code:'drive/connect-required'});
      }
    }).catch(error => {
      if (generation === epoch && version === authorizationVersion) clearConnectIntent();
      if (generation === epoch && error?.code !== 'drive/cancelled') onConnectRequired(error);
      throw error;
    }).finally(() => {
      if (connecting?.promise === promise) connecting = null;
    });
    connecting = {generation, promise};
    return promise;
  }

  function ensure(scopes=CONNECT_SCOPES) {
    if (has(scopes)) return Promise.resolve();
    return restore().then(() => { require(scopes); });
  }

  async function restoreCached(generation, version) {
    try {
      const owner = check(generation);
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
  }

  function restore() {
    if (connecting?.generation === epoch) return connecting.promise.then(() => has(), () => false);
    if (restoring?.generation === epoch) return restoring.promise;
    let owner;
    try { owner = identity(); } catch { return Promise.resolve(false); }
    const recoverDisconnect = disconnectPending;
    if (recoverDisconnect && !hasConnectIntent(owner)) return Promise.reject(pendingDisconnectError());
    if (!recoverDisconnect && has()) return Promise.resolve(true);
    const generation = epoch;
    const version = authorizationVersion;
    const requestedDisconnectGeneration = disconnectGeneration();
    const promise = (async () => {
      if (backend) await ready;
      check(generation, owner.googleUid);
      checkDisconnectGeneration(requestedDisconnectGeneration);
      if (connecting?.generation === generation) return connecting.promise.then(() => has(), () => false);
      if (version !== authorizationVersion || (!recoverDisconnect && has())) return has();
      let restored;
      if (recoverDisconnect) {
        await serverSession(generation, version, true, requestedDisconnectGeneration);
        restored = true;
      } else if (!backend || (!serverMode && backendReady === false)) {
        restored = await restoreCached(generation, version);
      } else {
        try {
          await serverSession(generation, version, false, requestedDisconnectGeneration);
          restored = true;
        } catch (error) {
          if (generation !== epoch || version !== authorizationVersion || serverMode || error?.code !== 'drive/not-configured') throw error;
          backendReady = false;
          temporaryAllowed = true;
          restored = await restoreCached(generation, version);
        }
      }
      check(generation, owner.googleUid);
      checkDisconnectGeneration(requestedDisconnectGeneration);
      if (connecting?.generation === generation) return connecting.promise.then(() => has(), () => false);
      return version === authorizationVersion ? restored : has();
    })().catch(error => {
      if (generation === epoch && version !== authorizationVersion) {
        if (connecting?.generation === generation) return connecting.promise.then(() => has(), () => false);
        return has();
      }
      throw error;
    }).finally(() => {
      if (restoring?.promise === promise) restoring = null;
    });
    restoring = {generation, promise};
    return promise;
  }

  async function request(url, options={}, scopes=[DRIVE_READ_SCOPE], retried=false) {
    const before=epoch;
    await ensure(scopes);check(before);
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
      let driveFailure;
      check(generation, googleUid);
      if (response.status === 401) {
        if (active?.token === token) invalidate();
        await response.body?.cancel();
        if(backend&&serverMode&&!retried){finish();check(generation,googleUid);return request(url,options,scopes,true);}
        throw reconnectError();
      }
      if (!response.ok) {
        // Preserve a small Google error summary before closing the response.
        // Expected upload statuses still reach their existing callers unchanged.
        const payload=await response.clone().json().catch(()=>null);
        check(generation,googleUid);
        const detail=payload?.error;
        const candidate=detail?.errors?.[0]?.reason||detail?.status||'';
        driveFailure={
          reason:typeof candidate==='string'&&/^[\w.-]{1,80}$/.test(candidate)?candidate:'',
          message:typeof detail?.message==='string'?detail.message.replace(/[\r\n\t]+/g,' ').slice(0,240):''
        };
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
        if (property === 'driveFailure') return driveFailure;
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
    active=null;
    cancelAccessRequest('lock');
    for (const controller of controllers) controller.abort();
    controllers.clear();
  }

  function clear() {
    clearConnectIntent();
    cancelPending();
    // Privacy lock clears memory/transfers. The server grant is revoked only by Disconnect.
    active=null;
  }

  async function revokeTemporaryToken(token) {
    const response = await fetchImpl('https://oauth2.googleapis.com/revoke', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({token}), credentials:'omit', cache:'no-store',
      signal:AbortSignal.timeout(15000)
    });
    if (response.ok) return {complete:true, googleRevoked:true};
    if (response.status === 400) {
      const value = await response.json().catch(() => null);
      if (value?.error === 'invalid_token') return {complete:true, googleRevoked:false};
    }
    return {complete:false, googleRevoked:false};
  }

  async function performDisconnect(){
    clearConnectIntent();
    const disconnectId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try { backupStorage?.setItem(DISCONNECT_GENERATION_KEY, disconnectId); } catch {}
    for (const id of cancelAccessRequest('disconnect')) cancelledGrantIds.add(id);
    if(!serverMode&&!active?.token){
      try{
        const saved=JSON.parse(storage?.getItem(SESSION_KEY)||backupStorage?.getItem(SESSION_KEY)||'null'),owner=identity();
        if(saved?.uid===owner.uid&&saved.googleUid===owner.googleUid&&typeof saved.token==='string'&&saved.expiresAt>=pendingTemporaryExpiry){pendingTemporaryRevocation=saved.token;pendingTemporaryGoogleUid=saved.googleUid;pendingTemporaryExpiry=saved.expiresAt;}
      }catch{}
    }
    try{temporaryRevocationExpected=temporaryRevocationExpected||backupStorage?.getItem('velum-drive-temporary-grant-v1')==='1';}catch{}
    if(!serverMode&&active?.token){
      rememberTemporaryRevocation(active.token, active.googleUid, active.expiresAt);
    }
    clear();removeSession();
    disconnectPending=true;
    try{backupStorage?.setItem('velum-drive-disconnect-pending-v1','1');}catch{}
    if (pendingTemporaryRevocation) rememberTemporaryRevocation(pendingTemporaryRevocation, pendingTemporaryGoogleUid, pendingTemporaryExpiry);
    let serverRevoked=!backend,googleRevoked=lateGoogleRevoked;
    try{if(backend){const value=await serverRequest('disconnect',epoch);serverRevoked=value.revoked===true;googleRevoked=googleRevoked||value.googleRevoked===true;}}catch{}
    for (const credential of [...temporaryRevocations.values()]) {
      try{
        if(identity().googleUid!==credential.googleUid)throw new Error('The Google identity changed before revocation.');
        const result = await revokeTemporaryToken(credential.token);
        googleRevoked=googleRevoked||result.googleRevoked;
        if(result.complete) completeTemporaryRevocation(credential);
      }catch{}
    }
    if (googleRevoked && temporaryRevocations.size === 0 && !pendingTemporaryRevocation) {
      persistTemporaryRevocations();
    }
    const temporaryRevoked = !temporaryRevocationExpected && temporaryRevocations.size === 0 && !pendingTemporaryRevocation;
    if(serverRevoked&&temporaryRevoked&&cancelledGrantIds.size===0){disconnectPending=false;try{backupStorage?.removeItem('velum-drive-disconnect-pending-v1');}catch{}}
    return {disconnected:true,revoked:!disconnectPending,googleRevoked};
  }

  function disconnect() {
    if (disconnecting) return disconnecting;
    const operation = performDisconnect().finally(() => {
      if (disconnecting === operation) disconnecting = null;
    });
    disconnecting = operation;
    return operation;
  }

  async function handleCancelledGrant({id, accessToken, googleUid}) {
    if (!cancelledGrantIds.has(id)) return;
    lateRevocations++;
    try {
      if (!accessToken) return;
      const credential = rememberTemporaryRevocation(accessToken, googleUid, Date.now() + MAX_TOKEN_AGE_MS);
      const result = await revokeTemporaryToken(accessToken);
      if (result.complete) {
        lateGoogleRevoked = lateGoogleRevoked || result.googleRevoked;
        completeTemporaryRevocation(credential);
      }
    } catch {} finally {
      cancelledGrantIds.delete(id);
      lateRevocations--;
    }
  }

  return {connect, ensure, restore, require, request, has, ready, handleCancelledGrant,
    getToken:require, getOperationGuard, cancelPending, clear, disconnect,
    get disconnectPending(){return disconnectPending;},
    get mode(){return serverMode?'server':backendReady===false?'temporary':'checking';}};
}
