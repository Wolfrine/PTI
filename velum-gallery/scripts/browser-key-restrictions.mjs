import {isDeepStrictEqual} from 'node:util';

export const PTI_REFERRERS = ['https://pti-app-2ab59.web.app/*', 'https://pti-app-2ab59.firebaseapp.com/*'];

export function appendPtiReferrers(current) {
  if (!Array.isArray(current?.browserKeyRestrictions?.allowedReferrers)) throw new Error('Expected the existing browser-restricted web key; refusing to replace application restrictions.');
  const restrictions = structuredClone(current);
  const referrers = restrictions.browserKeyRestrictions.allowedReferrers;
  const additions = PTI_REFERRERS.filter(origin => !referrers.includes(origin));
  referrers.push(...additions);
  return {restrictions, additions};
}

export function verifyBrowserRestrictions(expected, actual) {
  const normalize = value => {
    const copy = structuredClone(value);
    if (copy.browserKeyRestrictions?.allowedReferrers) copy.browserKeyRestrictions.allowedReferrers.sort();
    if (copy.apiTargets) {
      for (const target of copy.apiTargets) target.methods?.sort();
      copy.apiTargets.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return copy;
  };
  if (!isDeepStrictEqual(normalize(expected), normalize(actual))) throw new Error('Browser key readback differs from the exact intended restrictions; release stopped.');
}

// Synthetic browser-origin configuration probes, not an owner Google login or
// a native-worker acceptance test. Native SecureToken is verified separately.
export async function probeBrowserAuth(apiKey, {fetchImpl=fetch, origins=[...PTI_REFERRERS.map(value=>value.slice(0,-1)), 'https://pti-app-2ab59-velum.web.app/']}={}) {
  const results=[];
  for (const origin of origins) {
    for (const endpoint of ['identitytoolkit','securetoken']) {
      const url=endpoint==='identitytoolkit' ? 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp' : 'https://securetoken.googleapis.com/v1/token';
      const response=await fetchImpl(`${url}?key=${apiKey}`, {
        method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{Referer:origin,'Content-Type':endpoint==='identitytoolkit'?'application/json':'application/x-www-form-urlencoded'},
        body:endpoint==='identitytoolkit'?JSON.stringify({requestUri:origin,postBody:'id_token=invalid-browser-configuration-probe&providerId=google.com',returnSecureToken:true}):new URLSearchParams({grant_type:'refresh_token',refresh_token:'invalid-browser-configuration-probe'})
      });
      const body=await response.json();
      const expected=endpoint==='identitytoolkit'?'INVALID_IDP_RESPONSE':'INVALID_REFRESH_TOKEN';
      if(response.status!==400 || !body.error?.message?.startsWith(expected)) throw new Error(`Browser ${endpoint} probe failed for ${origin} (HTTP ${response.status}); expected an invalid-token rejection.`);
      results.push({origin,endpoint,status:response.status,result:expected});
    }
  }
  return results;
}
