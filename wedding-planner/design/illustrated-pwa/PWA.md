# One wedding app — install and public offline behavior

Implemented on `codex/wedding-illustrated-pwa`, base `77f2d11`. This is the PWA worker's implementation and self-QA record; independent visual direction/release acceptance belongs to the parent and critic. No production writes, commit or deployment were performed by this worker.

## Delivered behavior

- One manifest identity: `id`, `start_url` and scope `/`; **Mahima & Mayank**, short name **M&M Wedding**, standalone. The parent-provided 192/512, maskable and Apple icons are reused, with a Family planning shortcut. Both entry points call the same guarded `startPwa()`.
- Install controls use delegated `[data-pwa-install]` events, so the dynamic family account menu works. Chrome's deferred prompt is invoked only after a click. iOS/browser instructions open on request. Standalone/installed state hides controls; no automatic installation nag was added.
- A build plugin follows the actual final Rollup public import/dynamic-import/CSS/resource graph. It explicitly rejects family/store/demo/Firebase chunks. Manifest icon resources and the neutral offline page are included. Food images and private application chunks are excluded. Social metadata is not a browser-rendered offline dependency; the parent owns its sharing image.
- Installation downloads and SHA-256 verifies every asset before populating a new immutable version cache. The worker can activate only after all cache writes and local saved-time metadata succeed. An incomplete update cannot become the active fallback.
- Public navigation tries the network for three seconds, then returns the complete active-version invitation, with a saved-time notice and its running countdown. Online future HTML never replaces that fallback in place. Requests belonging to a cached fallback prefer its version's saved assets.
- Offline `/family` navigation receives only the neutral reconnect page and a link to the saved public invitation. Auth, Firestore and `/__/` requests are never intercepted or cached. Family/Auth/Firebase code and records never enter the PWA cache. Existing authentication and private-store behavior were not changed.
- Updates wait naturally. A quiet dismissible notice appears; there is no `skipWaiting`, automatic reload, draft discard or forced update action. Old caches are removed only when the new worker activates, and only within the wedding-owned prefix.
- Existing Hosting privacy/security headers remain. Worker and manifest responses explicitly bypass stale HTTP caches; the worker is scoped to `/`.

## Reproducibility

The cache version hashes the sorted public asset paths/digests plus canonical-LF generator source. It contains no build clock or random value. Worker-only repairs also change the version. Installation's saved time is produced at runtime and stored only in that browser's cache metadata.

Initial observed build: version `4b91f79c4584eac82739`, **20 public assets / 602,847 bytes**, no food or family/Firebase chunks. This historical worker-QA build is not final acceptance of subsequent combined candidates. Final Rollup imports are read in `writeBundle`, after Vite's final filenames are settled. Generated worker/graph files use LF. The repair below identifies the latest build tested by this worker.

## Verification observed

- TypeScript and production Vite build passed with the existing private Firestore chunk-size advisory.
- All **17** model/menu tests passed, including the existing exact countdown tests. Browser-only imports preserve the ability to import countdown helpers from Node tests.
- `node wedding-planner/tests/pwa-browser.mjs`: **6 acceptance scenarios passed**, most recent full run `008187`, exit 0. CI now runs this test after its existing browser suite.
- Coverage: manifest identity, hash-complete graph; no private cache entries even after the online family shell loads; auth endpoint exclusion; offline artwork/fonts/live countdown and saved-time notice; neutral offline family page; broken-update rejection; two natural version updates A→B→C; open editor DOM/draft preserved; older coherent fallback retained while an update waits; unrelated application cache retained; delegated native-prompt handling; iOS guidance; installed-control hiding.
- The update editor is an explicitly synthetic draft placed in the actual signed-out family shell. It demonstrates no reload/dialog loss from waiting service-worker updates, not authenticated wedding editing or real private records. Version markers exist only in the local HTTP test server's copies, never in source or the production build.
- Local Chromium screenshots personally inspected at **1440×1000** and **390×844**: offline invitation on desktop/phone and install guidance on desktop/phone. Text fits, no horizontal overflow, dialog focus stays inside the helper, the notice stays secondary, and the invitation's existing hierarchy remains visible. Evidence: repo-root `.wedding-qa/pwa/`, including `results.json`, `offline-*.png`, `install-help-*.png`, `waiting-update-desktop.png`.

## Remaining acceptance boundaries

Native system installation was simulated through the browser event contract; a real device's installation, iOS Share sheet, WhatsApp preview and human Google popup login were not exercised. No private offline capability is promised. The parent must rerun the final combined build/browser suite after all concurrent assets/styles land and complete independent visual review and normal deployment verification.

## Offline-family regression and repair

The later combined candidate `72e60db1708bba2a625c` failed offline family navigation with the parent's bundled Playwright Chromium (`148.0.7778.96`, chromium-1223), although the installed Chrome used for initial worker QA passed. That candidate is **not accepted** by this record. The parent also invalidated its associated source freeze.

Failure reproduced twice with the matching browser (sessions `933d23` and `252358`). Actual response/body evidence showed a fresh **200 / 2,709-byte live family shell**, not the cached neutral page. Both page and service-worker `navigator.onLine` were false; the local server nevertheless logged a `/family/` request from the worker. The private module could not load offline, so the shell contained no rendered heading. The **644-byte neutral HTML was still present and correct in CacheStorage**. There were no page errors. This identifies network behavior, not an absent/incorrect cache, CSS hiding or neutral-response parse failure. Retained evidence: `.wedding-qa/pwa/private-offline-failure-before-fix.json`.

The generated network helper now honors an explicit worker offline state before attempting a fetch. When the worker reports online, it retains the three-second network-first/failure fallback behavior. No family response or Firebase code is cached. The test now requires the exact neutral HTML body, status 200, a service-worker response, zero new family network requests while explicitly offline, and zero private-shell elements; failure-only diagnostics retain response headers/body, document, worker/page online flags, network requests and errors.

The repaired build is `6b412cdc59d2ebd91615`. TypeScript/Vite build passed. All six PWA scenarios passed with the parent's exact bundled Chromium, followed by two repeated runs (sessions `52038`/`65e6fb` and `84105`), retaining the full install/update/privacy assertions. Positive evidence `.wedding-qa/pwa/private-offline-after-fix.json` records 200, `fromServiceWorker: true`, the exact neutral body, zero private-shell elements, zero family network requests and zero errors. Only the owned generator/test/report were changed for this repair. Parent regeneration of the final canonical build/fingerprint and final capture remains required; no final combined-candidate acceptance is inferred here.
