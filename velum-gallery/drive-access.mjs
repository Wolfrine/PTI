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
  let disconnecting = null;
  let lateRevocations = 0;
  let lateGoogleRevoked = false;
  let serverMode=false,backendReady=null,temporaryAllowed=false,pendingTemporaryRevocation='',disconnectPending=false;
  try{disconnectPending=backupStorage?.getItem('velum-drive-disconnect-pending-v1')==='1';}catch{}
  let temporaryRevocationExpected=false,pendingTemporaryGoogleUid='',pendingTemporaryExpiry=0;
  try{
    temporaryRevocationExpected=backupStorage?.getItem('velum-drive-revoke-expected-v1')==='1';
    const pending=JSON.parse(storage?.getItem('velum-drive-revoke-v1')||'null');
    if(typeof pending?.token==='string'&&typeof pending.googleUid==='string'&&Number.isFinite(pending.expiresAt)){
      pendingTemporaryRevocation=pending.token;pendingTemporaryGoogleUid=pending.googleUid;pendingTemporaryExpiry=pending.expiresAt;
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
  async function serverSession(generation,version=authorizationVersion){
    const value=await serverRequest('session',generation),owner=check(generation);
    if (version !== authorizationVersion) throw reconnectError();
    if(value.mode!=='server'||value.owner!==owner.uid||value.googleSub!==owner.googleUid||!CONNECT_SCOPES.every(scope=>value.scopes?.includes(scope))||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now()+60000)throw reconnectError();
    serverMode=true;backendReady=true;
    temporaryAllowed=false;
    try{backupStorage?.setItem('velum-drive-server-active-v1','1');}catch{}
    removeSession();
    active={uid:owner.uid,googleUid:owner.googleUid,token:value.accessToken,scopes:value.scopes,expiresAt:Math.min(value.expiresAt,Date.now()+MAX_TOKEN_AGE_MS)};
    if(typeof active.token!=='string'||!active.token){active=null;throw reconnectError();}
  }
  async function connectServer(generation){
    try{await serverSession(generation);return;}
    catch(error){if(error?.code!=='drive/reconnect-required')throw error;}
    const value=await serverRequest('start',generation);check(generation);
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
            if(value.expiresAt>=pendingTemporaryExpiry){pendingTemporaryRevocation=value.token;pendingTemporaryGoogleUid=value.googleUid;pendingTemporaryExpiry=value.expiresAt;}
            backupStorage?.setItem('velum-drive-temporary-grant-v1','1');
            storage?.setItem('velum-drive-revoke-v1',JSON.stringify({token:pendingTemporaryRevocation,googleUid:pendingTemporaryGoogleUid,expiresAt:pendingTemporaryExpiry}));
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
    const gestureNeedsToken = !backend || (!serverMode && backendReady !== true);
    const temporaryRequest = !backend || (!serverMode && (backendReady === false || temporaryAllowed || backendReady === null));
    if (disconnectPending) {
      if (!temporaryRequest) return Promise.reject(Object.assign(new Error('Server revocation is pending. Retry Disconnect before reconnecting.'), {code:'drive/disconnect-pending'}));
      // An explicit new temporary connection supersedes an unconfirmed local disconnect.
      disconnectPending = false;
      try { backupStorage?.removeItem('velum-drive-disconnect-pending-v1'); } catch {}
    }
    if (has()) return Promise.resolve();
    if (connecting?.generation === epoch) return connecting.promise;
    const generation = epoch;
    const version = ++authorizationVersion;
    cancelledGrantIds.clear();
    invalidate();
    let requested;
    try {
      if (!auth.currentUser) requested = signIn([...CONNECT_SCOPES]);
      // Unknown health must not consume the gesture before GIS opens.
      else if (gestureNeedsToken) requested = requestAccess([...CONNECT_SCOPES]);
      else requested = Promise.resolve(null);
    } catch (error) { return Promise.reject(error); }
    const promise = Promise.resolve(requested).then(async credential => {
      const owner = check(generation, requestedOwner?.googleUid);
      await ready;
      check(generation, owner.googleUid);
      if (version !== authorizationVersion) throw reconnectError();
      if (!backend || (!serverMode && (backendReady === false || temporaryAllowed))) {
        await verify(credential?.accessToken, generation, version);
        return;
      }
      try { await connectServer(generation); }
      catch (error) {
        if (serverMode || error?.code !== 'drive/not-configured') throw error;
        backendReady = false;
        temporaryAllowed = true;
        if (credential?.accessToken) await verify(credential.accessToken, generation, version);
        else throw Object.assign(new Error('Connect Drive to continue with your Google account.'), {code:'drive/connect-required'});
      }
    }).catch(error => {
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
    if (disconnectPending) return Promise.reject(Object.assign(new Error('Disconnect is pending. Retry Disconnect to finish revoking access.'), {code:'drive/disconnect-pending'}));
    if (has()) return Promise.resolve(true);
    if (connecting?.generation === epoch) return connecting.promise.then(() => has(), () => false);
    if (restoring?.generation === epoch) return restoring.promise;
    let owner;
    try { owner = identity(); } catch { return Promise.resolve(false); }
    const generation = epoch;
    const version = authorizationVersion;
    const promise = (async () => {
      if (backend) await ready;
      check(generation, owner.googleUid);
      if (connecting?.generation === generation) return connecting.promise.then(() => has(), () => false);
      if (version !== authorizationVersion || has()) return has();
      let restored;
      if (!backend || (!serverMode && backendReady === false)) {
        restored = await restoreCached(generation, version);
      } else {
        try {
          await serverSession(generation, version);
          restored = true;
        } catch (error) {
          if (generation !== epoch || version !== authorizationVersion || serverMode || error?.code !== 'drive/not-configured') throw error;
          backendReady = false;
          temporaryAllowed = true;
          restored = await restoreCached(generation, version);
        }
      }
      check(generation, owner.googleUid);
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
    cancelPending();
    // Privacy lock clears memory/transfers. The server grant is revoked only by Disconnect.
    active=null;
  }

  async function performDisconnect(){
    for (const id of cancelAccessRequest('disconnect')) cancelledGrantIds.add(id);
    if(!serverMode&&!active?.token){
      try{
        const saved=JSON.parse(storage?.getItem(SESSION_KEY)||backupStorage?.getItem(SESSION_KEY)||'null'),owner=identity();
        if(saved?.uid===owner.uid&&saved.googleUid===owner.googleUid&&typeof saved.token==='string'&&saved.expiresAt>=pendingTemporaryExpiry){pendingTemporaryRevocation=saved.token;pendingTemporaryGoogleUid=saved.googleUid;pendingTemporaryExpiry=saved.expiresAt;}
      }catch{}
    }
    try{temporaryRevocationExpected=temporaryRevocationExpected||backupStorage?.getItem('velum-drive-temporary-grant-v1')==='1';}catch{}
    if(!serverMode&&active?.token){
      pendingTemporaryRevocation=active.token;temporaryRevocationExpected=true;
      pendingTemporaryGoogleUid=active.googleUid;pendingTemporaryExpiry=active.expiresAt;
      try{
        storage?.setItem('velum-drive-revoke-v1',JSON.stringify({token:active.token,googleUid:active.googleUid,expiresAt:active.expiresAt}));
        backupStorage?.setItem('velum-drive-revoke-expected-v1','1');
      }catch{}
    }
    clear();removeSession();
    disconnectPending=true;
    try{backupStorage?.setItem('velum-drive-disconnect-pending-v1','1');}catch{}
    let serverRevoked=!backend,temporaryRevoked=!temporaryRevocationExpected,googleRevoked=lateGoogleRevoked;
    try{if(backend){const value=await serverRequest('disconnect',epoch);serverRevoked=value.revoked===true;googleRevoked=value.googleRevoked===true;}}catch{}
    if(googleRevoked){
      pendingTemporaryRevocation='';temporaryRevocationExpected=false;temporaryRevoked=true;
      try{storage?.removeItem('velum-drive-revoke-v1');backupStorage?.removeItem('velum-drive-revoke-expected-v1');backupStorage?.removeItem('velum-drive-temporary-grant-v1');}catch{}
    }
    if(pendingTemporaryRevocation){
      try{
        if(identity().googleUid!==pendingTemporaryGoogleUid)throw new Error('The Google identity changed before revocation.');
        const response=await fetchImpl('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:pendingTemporaryRevocation}),credentials:'omit',cache:'no-store'});
        temporaryRevoked=response.ok;
        googleRevoked=googleRevoked||response.ok;
        if(temporaryRevoked){
          pendingTemporaryRevocation='';temporaryRevocationExpected=false;
          try{storage?.removeItem('velum-drive-revoke-v1');backupStorage?.removeItem('velum-drive-revoke-expected-v1');backupStorage?.removeItem('velum-drive-temporary-grant-v1');}catch{}
        }
      }catch{}
    }
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
      pendingTemporaryRevocation = accessToken;
      pendingTemporaryGoogleUid = googleUid;
      pendingTemporaryExpiry = Date.now() + MAX_TOKEN_AGE_MS;
      temporaryRevocationExpected = true;
      try {
        backupStorage?.setItem('velum-drive-revoke-expected-v1','1');
        storage?.setItem('velum-drive-revoke-v1',JSON.stringify({token:accessToken,googleUid,expiresAt:pendingTemporaryExpiry}));
      } catch {}
      const response = await fetchImpl('https://oauth2.googleapis.com/revoke',{
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({token:accessToken}), credentials:'omit', cache:'no-store',
        signal:AbortSignal.timeout(15000)
      });
      if (response.ok) {
        lateGoogleRevoked = true;
        temporaryRevocationExpected = false;
        pendingTemporaryRevocation = '';
        try {
          storage?.removeItem('velum-drive-revoke-v1');
          backupStorage?.removeItem('velum-drive-revoke-expected-v1');
          backupStorage?.removeItem('velum-drive-temporary-grant-v1');
        } catch {}
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
