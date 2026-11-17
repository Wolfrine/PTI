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
  storage=globalThis.sessionStorage, backupStorage=globalThis.localStorage, backend=false}) {
  let epoch = 0;
  let authorizationVersion = 0;
  let active = null;
  let connecting = null;
  let restoring = null;
  const controllers = new Set();
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
  if(backend)void fetchImpl('/api/drive/health',{cache:'no-store',credentials:'same-origin'})
    .then(async response=>{if(response.ok){const value=await response.json();backendReady=value.ready===true?true:value.ready===false?false:null;}}).catch(()=>{});

  async function serverRequest(path,generation){
    const owner=check(generation),user=auth.currentUser;
    const idToken=await user.getIdToken();check(generation,owner.googleUid);
    const controller=new AbortController();controllers.add(controller);
    try{
      const response=await fetchImpl(`/api/drive/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${idToken}`},body:'{}',credentials:'same-origin',cache:'no-store',signal:controller.signal});
      check(generation,owner.googleUid);
      const value=await response.json();check(generation,owner.googleUid);
      if(!response.ok)throw Object.assign(new Error(value.code==='drive/not-configured'?'Secure renewal setup is pending. A temporary Drive session is available.':'Drive connection needs attention.'),{code:value.code||'drive/unavailable'});
      return value;
    }finally{controllers.delete(controller);}
  }
  async function serverSession(generation){
    const value=await serverRequest('session',generation),owner=check(generation);
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
    if(disconnectPending)return Promise.reject(Object.assign(new Error('Disconnect is still pending. Retry Disconnect before connecting again.'),{code:'drive/disconnect-pending'}));
    if (has()) return Promise.resolve();
    if (connecting?.generation === epoch) return connecting.promise;
    const generation = epoch;
    const version = ++authorizationVersion;
    invalidate();
    // The SDK popup starts on this call stack, before any network preflight.
    let requested;
    const temporaryRequest=!backend||(!serverMode&&temporaryAllowed);
    try {
      if(backend&&!temporaryRequest&&auth.currentUser)requested=Promise.resolve(null);
      else requested=requestAccess(temporaryRequest?[...CONNECT_SCOPES]:[]);
    }
    catch (error) { return Promise.reject(error); }
    const promise = Promise.resolve(requested).then(async credential => {
      check(generation);
      if(backend){
        try{await connectServer(generation);return;}
        catch(error){
          // Only an authenticated, explicit unconfigured response permits the labeled temporary path.
          if(serverMode||error?.code!=='drive/not-configured')throw error;
          backendReady=false;temporaryAllowed=true;
          if(!temporaryRequest)throw Object.assign(new Error('Secure renewal setup is pending. Connect a temporary Drive session to continue.'),{code:'drive/temporary-session-required'});
        }
      }
      await verify(credential?.accessToken, generation, version);
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

  function restoreCached() {
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

  function restore(){
    if(disconnectPending)return Promise.reject(Object.assign(new Error('Disconnect is pending. Retry Disconnect to finish revoking access.'),{code:'drive/disconnect-pending'}));
    if(has())return Promise.resolve(true);
    if(!backend)return restoreCached();
    if(connecting?.generation===epoch)return connecting.promise.then(()=>true,()=>false);
    if(restoring?.generation===epoch)return restoring.promise;
    const generation=epoch;
    const promise=serverSession(generation).then(()=>true).catch(async error=>{
      if(generation!==epoch)throw error;
      if(!serverMode&&error?.code==='drive/not-configured'){
        backendReady=false;temporaryAllowed=true;
        // Do not let this wrapper's restoring marker recursively wait on itself.
        restoring=null;return restoreCached();
      }
      throw error;
    }).finally(()=>{if(restoring?.promise===promise)restoring=null;});
    restoring={generation,promise};return promise;
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
      check(generation, googleUid);
      if (response.status === 401) {
        if (active?.token === token) invalidate();
        await response.body?.cancel();
        if(backend&&serverMode&&!retried){finish();check(generation,googleUid);return request(url,options,scopes,true);}
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
    active=null;
    for (const controller of controllers) controller.abort();
    controllers.clear();
  }

  function clear() {
    cancelPending();
    // Privacy lock clears memory/transfers. The server grant is revoked only by Disconnect.
    active=null;
  }

  async function disconnect(){
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
    let serverRevoked=!backend,temporaryRevoked=!temporaryRevocationExpected,googleRevoked=false;
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
    if(serverRevoked&&temporaryRevoked){disconnectPending=false;try{backupStorage?.removeItem('velum-drive-disconnect-pending-v1');}catch{}}
    return {disconnected:true,revoked:!disconnectPending,googleRevoked};
  }

  return {connect, ensure, restore, require, request, has, getToken:require, getOperationGuard, cancelPending, clear,disconnect,get disconnectPending(){return disconnectPending;},get mode(){return serverMode?'server':backendReady===false?'temporary':'checking';}};
}
