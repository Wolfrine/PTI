# Mobile connection repair — 19 October 2026

The owner's phone was signed into PTI but showed an ambiguous account dialog and “Google confirmation did not finish.” The earlier phone health check established trusted DNS/TLS reachability, not successful authenticated PWA requests. The screenshot does not identify the exact failed request.

## Verified defects and repair

- Old installed workers cached fixed `app.js`/CSS URLs until a footer update action. New network HTML could therefore load an old bundle that still called the household-certificate hostname. The build now versions both bootstrap URLs by reproducible content hash. Tests execute the deployed legacy worker and demonstrate fresh navigation fetches the new version without activating a waiting worker. The new worker caches only exact current shell resources for offline use; media and private requests stay excluded. Active playback is not forcibly reloaded.
- Account settings always offered Google reconnection, regardless of PC or account state. One Home PC connection action now shows PC reachability and account playback readiness. Authenticated `/api/me` checks only the admitted UID's protected retained session; another device can reuse that pairing. Setup/pending invitation users do not trigger credential reads, membership denials remain denials, and no credential is serialized.
- Missing/revoked credentials alone enable Google confirmation. Provider/storage outages do not. Popup cancellation, blocked popup, wrong account, and PC request failure now have separate safe messages; duplicate confirmation clicks are disabled.
- Successful reconnect clears stale offline notices. Setup/invitation completion preserves pending setup states. An available app update is visible near the top as well as in account/connection settings.

## Evidence and scope

Frontend 61/61, companion 217/217 passed. Independent reviewer ran 66 focused integration/frontend/API tests and found no release blocker. Complete PTI production build passed with existing Angular stylesheet warnings. Parent inspected actual desktop 1440×1000 and mobile 390×844 browser renders. Ready, account, missing credential, unavailable credential and offline captures use clearly labelled synthetic fixture identity/progress; real catalogue/artwork. Exact production candidate and six image hashes are in `design/evidence/mobile-connection/fingerprint.json` and `design/acceptance.json`.

Independent review's two minor findings (generic unavailable label and setup dialog replacement) were corrected. This is a mechanical repair within the existing light/dark direction, not a renewed full visual-design acceptance.

The browser can still require local-network permission. A genuinely unpaired account still uses Firebase's Google popup; successful Android OAuth is not established by unit tests. Firebase documents mobile redirect as preferable, but switching requires compatible auth-domain/OAuth configuration, so this repair does not introduce an untested redirect migration. Sources: https://firebase.google.com/docs/auth/web/google-signin and https://firebase.google.com/docs/auth/web/redirect-best-practices .

The PC/runtime update, live hosted byte verification and signed-in playback regression are recorded after deployment in the session's user-facing evidence. Actual phone playback needs owner confirmation. No TV session was started; the existing TV end-of-episode issue remains separate. Media engine, source catalogue, H: cache, 20 GiB cache limit and Cast transport are unchanged.
