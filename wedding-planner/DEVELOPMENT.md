# Wedding site maintainer guide

Requires Node 22.12+ and npm. Java 21 is required for the Firestore emulator. No new Firebase project, database or repository is used.

## Local preview

From `wedding-planner`, run `npm ci`, then `npm run dev`. Open the printed local URL for the invitation, `/family/` for sign-in, or `/family/?demo=1` for a clearly labelled synthetic preview. Preview changes remain in memory. The demonstration import is removed from production; `?demo=1` grants no production access.

Normal development family access defaults to the Auth/Firestore emulators at 9099/8085 using `demo-wedding-tests`. Start them from the repo root with `firebase emulators:start --only firestore,auth --project demo-wedding-tests --config firebase.wedding-tests.json`. The store/browser integration test creates its own synthetic accounts and workspace. Use `VITE_USE_EMULATORS=0` only when intentionally testing the live protected family workspace. No private data is cached persistently by Firestore.

## Shared family record

The protected owner is the connected PTI owner's existing Firebase UID, configured in `src/config.ts`. The release script verifies the owner's enabled, verified Firebase Auth identity and pins that account to **Admin** before publishing role rules. Neither the general PTI user document nor a client can change that protected identity.

Share `/family/`. Each verified account that enters family access registers its own identity and appears in **Family account menu → Manage family access** (`#/access`). New accounts await approval and cannot read the private plan; an admin selects a role and saves it. **Viewer** reads the plan, **Family** reads and edits it, and **Admin** also manages access. **Blocked** and **Awaiting approval** cannot open the plan. Existing `editor` invitations retain Family permissions. The owner always remains Admin and cannot be demoted or removed. Registration does not enumerate unrelated PTI accounts or reconstruct earlier family-site visits; the bootstrapped owner has no sign-in timestamp until actually entering the site.

Approvals and role changes update open sessions. Losing edit permission closes unsaved private editors; losing access clears private records and admin lists. Roles are enforced by Firestore rules as well as the page. Access changes send no message. The account menu also contains private export and sign-out.

Auth initializes with browser-local persistence first, with existing session/IndexedDB sign-ins available for migration, and explicitly selects local persistence before subscribing. This avoids an initialization-time switch between different storage listeners in newly opened tabs. Firebase retains the identity across browser restarts; each restored identity still registers and checks current membership online. Manual sign-out clears private views and propagates to other open tabs. Firestore remains memory-only. Clearing browser data, a different browser/origin, or invalid/revoked credentials can require sign-in again. See [Firebase persistence semantics](https://firebase.google.com/docs/auth/web/auth-state-persistence).

A logout-only `wedding-sign-out` storage event also clears a still-open legacy migration tab whose SDK listener began on session storage. It contains only a random notification value, never an identity or permission; receiving it invokes Firebase sign-out and clears private views. It cannot restore sign-in. A dedicated emulator regression reproduces the missing logout without the safeguard and passes with it.

`src/motion.ts` progressively enhances the public invitation with native SVG/Web Animations; no animation library or Firebase import is added to the public bundle. The one-off entrance settles fully when paused; the quiet ambient accent pauses offscreen/backgrounded and resumes on return. The optional `wedding-motion` local preference contains only `paused`/`playing`. OS reduced-motion removes animation and hides the unnecessary toggle. `Invitation ↗` is always visible in the authenticated header, including phones; the public return is labelled Family workspace.

The four home entrances use hash routes (`#/catering`, `#/guests`, `#/stays`, `#/tasks`) with record deep links and browser Back. Catering retains meals and food counters separately from the function programme. Record pages are read-first; menu, timing/venue, guest basics, food needs, stay, travel, decisions, and provider/costs use focused editors. Failed saves retain the open draft; cancelling discards it so reopening reads the latest shared revision.

The release script imports the documented proposals atomically only when the workspace does not exist. It never resets live edits. Guests start empty. Event times and venues are not invented. The public countdown targets the clearly labelled start of **18 January 2027 at midnight IST**, a date boundary rather than a ceremony time. All seed menus remain proposed; ambiguous items keep their verification markers. Subsequent records have atomic private history and revision checks. Archiving preserves records/history; exports include them. Confirmed, tentative, unknown and declined attendance remain separate per person/occasion. Nightly stay figures count people, not rooms or bookings.

## Guest publication

1. Obtain family approval for the public facts and each function's audience. Record operational changes privately first.
2. Edit only the approved public snapshot in `src/public-content.ts`. Times require an exact offset/UTC instant. Maps must be secure approved Google Maps links. Keep the countdown's labelled midnight-IST date boundary unless the family chooses another exact target; do not imply that it is an event time. Setting it to `null` removes the timer.
3. Review public wording and social metadata in both entry HTML files. When names/dates or art change, update `design/illustrated-pwa/share-card.html`, regenerate the versioned JPEG with `node scripts/share-image.mjs`, and update its absolute metadata URL. Keep the names/planned dates in the centre safe area. The image contains no countdown or private information.
4. Run tests/build/browser checks, review desktop and mobile, then release through the wedding workflow. Private edits do not publish themselves. Keep an available maintainer for urgent changes near the wedding.

The site discourages search indexing. Its open invitation is still public to anyone with the URL. Do not put guest lists, room allocations, dietary/health details, vendor costs, draft menus or internal contacts in the public snapshot. Hosting serves only `dist`, never this documentation/source directory.

## Verification

From `wedding-planner`: `npm test` and `npm run build`.

From the repo root, after installing dependencies:

```text
firebase emulators:exec --only firestore --project demo-wedding-tests --config firebase.wedding-tests.json "npm run test:rules --prefix wedding-planner"
firebase emulators:exec --only firestore,auth --project demo-wedding-tests --config firebase.wedding-tests.json "node wedding-planner/tests/store-browser.mjs && node wedding-planner/tests/session-browser.mjs"
node wedding-planner/tests/browser.mjs
node wedding-planner/tests/sharing-browser.mjs
node wedding-planner/tests/motion-browser.mjs
node wedding-planner/tests/pwa-browser.mjs
```

The store/browser test also needs `personal-functions` dependencies for the Admin SDK, configured strictly against emulators. Browser tests use the matching Playwright Chromium; optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed compatible Chromium. `.wedding-qa` outputs are local/CI artifacts and contain synthetic records only. The original 65 research scenarios remain a reference pack; these targeted tests do not claim all 65 have run.

The session test uses a real persistent Chromium profile, closes/reopens the browser process, checks old-session migration and an authenticated Invitation→Family round trip, then verifies revoked membership and cross-tab manual logout/restart. Its accounts/records are synthetic and emulator-only, and it removes only its own data/profile. This does not claim a human Google popup or a physical installed-phone restart. The production motion test samples actual animation time, early pause, reload preference, OS preference changes and a genuinely offscreen hero at1440/390/360. Current design/capture evidence is under `design/motion-session/`.

For reproducible design-state captures, start a fresh dev server and run `node design/botanical/capture-final.mjs` from `wedding-planner`. Its default origin is port 5177; set `WEDDING_REVIEW_ORIGIN` for another port and the Chromium environment variable above if needed. It intercepts only the local demo module with a documented-menu/synthetic-person fixture, writes state-identified images and a manifest, and never writes live wedding records. Actual revocation screenshots come from the emulator integration test.

## Release and recovery

`.github/workflows/wedding.yml` verifies pull requests and wedding branch pushes. Only a main-branch release provisions cloud resources. It uses the existing GitHub deployment credential, compares live rules with the exact reviewed baseline, protects `weddingData`, checks Google provider configuration, authorizes the wedding domains and initializes the record only if absent. Unknown rule drift stops provisioning. Concurrent identical reviewed rule releases are accepted.

Live authorization checks use temporary synthetic accounts and an isolated verification workspace, then remove them. They test registration isolation, all roles, protected owner, self-promotion denial, reads/writes, history, stale revisions and revocation. They do not claim a real human Google popup login. Hosting verification compares every deployed asset with the build and checks private/development source routes return 404. The countdown/access extension's visual evidence and exact candidate are in `design/countdown-access/`; its fixture renders are separate from emulator-backed role-transition tests.

Hosting-only recovery can release a previous reviewed wedding build through `hosting:wedding`. Do not restore older shared rules that omit wedding isolation while private data exists. Before any rule rollback, retain `weddingData` exclusion and its reviewed access block and rerun security regressions.

The service worker keeps a hash-verified complete public invitation version. Public navigations try the network first; an offline fallback explicitly shows its saved time. Family routes show a neutral reconnect page offline, and private application/data/Auth requests never enter its cache. Updates wait until all wedding windows close, preserving open drafts. For rollback, rebuild the chosen reviewed content with the current PWA generator and publish the stable `/sw.js` path too; simply removing the worker file does not unregister already installed workers. Verify the rollback online and offline and retain its version. Only `mahima-mayank-public-v1-` caches belong to this app. Browser storage eviction or never having visited online can prevent offline access; this is not a backup of the private plan.

CI builds committed LF text. A Windows working tree may produce CR-only differences in HTML, SVG and license files during a byte comparison. For a clean comparison, archive with `git -c core.autocrlf=false archive HEAD wedding-planner`, build that source with the locked dependencies, and compare its `dist` with Hosting. The countdown/access release retains both fingerprints and the exact CR-only deltas in `design/countdown-access/deployment-binding.json`; original screenshot acceptance keeps its own byte binding.

Current fonts are self-hosted Latin subsets with licenses in `public/fonts`. Add an appropriate licensed Devanagari font/subset before introducing Hindi copy; obtain family-approved text first.
