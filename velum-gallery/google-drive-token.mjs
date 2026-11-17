const CLIENT_ID = '185802494856-rn0q6qi5goj0mifha0bkah55slu3kvju.apps.googleusercontent.com';
let loading;

export function preloadGoogleIdentityServices() {
  if (globalThis.google?.accounts?.oauth2?.initTokenClient) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-velum-gis]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.velumGis = '1';
      document.head.append(script);
    }
    const timeout = setTimeout(() => finish(false), 15000);
    const finish = ready => {
      clearTimeout(timeout);
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', failed);
      if (ready && globalThis.google?.accounts?.oauth2?.initTokenClient) resolve();
      else {
        loading = null;
        script.remove();
        reject(new Error('Google connection could not load. Use Connect Drive to retry.'));
      }
    };
    const loaded = () => finish(true);
    const failed = () => finish(false);
    script.addEventListener('load', loaded, {once:true});
    script.addEventListener('error', failed, {once:true});
  });
  return loading;
}

export function createGoogleDriveTokenRequest({auth, onCancelledResult}) {
  let active = null;
  let intent = 0;
  const outstanding = new Set();
  const cancelledError = () => Object.assign(new Error('Drive connection was cancelled.'), {code:'drive/cancelled'});
  const connectionError = () => Object.assign(new Error('Connect Drive to continue. Google authorization was not completed.'), {code:'drive/connect-required'});

  function finish(request, response) {
    if (request.finished) return;
    request.finished = true;
    clearTimeout(request.timeout);
    outstanding.delete(request);
    if (active === request) active = null;
    if (request.cancelled) {
      if (request.cancelled === 'disconnect' && request.cancelIntent === intent) {
        void Promise.resolve(onCancelledResult?.({id:request.id, accessToken:response?.access_token || '', googleUid:request.googleUid})).catch(() => {});
      }
      return;
    }
    const user = auth.currentUser;
    const googleUid = user?.providerData?.find(provider => provider.providerId === 'google.com')?.uid;
    if (user?.uid !== request.uid || googleUid !== request.googleUid) {
      request.reject(cancelledError());
      return;
    }
    if (response?.error || typeof response?.access_token !== 'string' || !response.access_token) request.reject(connectionError());
    else request.resolve({accessToken:response.access_token});
  }

  function request(scopes) {
    if (active) return active.promise;
    const oauth = globalThis.google?.accounts?.oauth2;
    const user = auth.currentUser;
    const googleUid = user?.providerData?.find(provider => provider.providerId === 'google.com')?.uid;
    if (!oauth?.initTokenClient || !googleUid) {
      void preloadGoogleIdentityServices().catch(() => {});
      return Promise.reject(connectionError());
    }
    const operation = {id:++intent, uid:user.uid, googleUid, cancelled:'', finished:false};
    operation.promise = new Promise((resolve, reject) => {operation.resolve=resolve; operation.reject=reject;});
    active = operation;
    outstanding.add(operation);
    operation.timeout = setTimeout(() => {
      operation.cancelled ||= 'timeout';
      operation.reject(connectionError());
      if (active === operation) active = null;
    }, 120000);
    try {
      const client = oauth.initTokenClient({
        client_id:CLIENT_ID,
        scope:scopes.join(' '),
        include_granted_scopes:false,
        prompt:'',
        login_hint:googleUid,
        callback:response => finish(operation, response),
        error_callback:() => finish(operation, {error:'connection_failed'})
      });
      // Keep this on the actual Connect, Move or Save gesture stack.
      client.requestAccessToken({prompt:'', login_hint:googleUid});
    } catch {
      finish(operation, {error:'connection_failed'});
    }
    return operation.promise;
  }

  function cancel(reason='lock') {
    const ids = [];
    for (const operation of outstanding) {
      if (reason === 'disconnect' || operation.cancelled !== 'disconnect') operation.cancelled = reason;
      operation.cancelIntent = intent;
      operation.reject(cancelledError());
      ids.push(operation.id);
    }
    active = null;
    return ids;
  }

  return {request, cancel};
}
