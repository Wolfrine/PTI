# Wedding site maintainer guide

Requires Node 22.12+ and npm. Java 21 is required for the Firestore emulator. No new Firebase project, database or repository is used.

## Local preview

From `wedding-planner`, run `npm ci`, then `npm run dev`. Open the printed local URL for the invitation, `/family/` for sign-in, or `/family/?demo=1` for a clearly labelled synthetic preview. Preview changes remain in memory. The demonstration import is removed from production; `?demo=1` grants no production access.

Normal development family access defaults to the Auth/Firestore emulators at 9099/8085 using `demo-wedding-tests`. Start them from the repo root with `firebase emulators:start --only firestore,auth --project demo-wedding-tests --config firebase.wedding-tests.json`. The store/browser integration test creates its own synthetic accounts and workspace. Use `VITE_USE_EMULATORS=0` only when intentionally testing the live protected family workspace. No private data is cached persistently by Firestore.

## Shared family record

The protected owner is the connected PTI owner's existing Firebase UID, configured in `src/config.ts`. The release script verifies the owner's enabled, verified Firebase Auth identity and pins that account to **Admin** before publishing role rules. Neither the general PTI user document nor a client can change that protected identity.

Share `/family/`. Each verified account that enters family access registers its own identity and appears in **Family account menu → Manage family access** (`#/access`). New accounts await approval and cannot read the private plan; an admin selects a role and saves it. **Viewer** reads the plan, **Family** reads and edits it, and **Admin** also manages access. **Blocked** and **Awaiting approval** cannot open the plan. Existing `editor` invitations retain Family permissions. The owner always remains Admin and cannot be demoted or removed. Registration does not enumerate unrelated PTI accounts or reconstruct earlier family-site visits; the bootstrapped owner has no sign-in timestamp until actually entering the site.

Approvals and role changes update open sessions. Losing edit permission closes unsaved private editors; losing access clears private records and admin lists. Roles are enforced by Firestore rules as well as the page. Access changes send no message. The account menu also contains private export and sign-out.

The four home entrances use hash routes (`#/catering`, `#/guests`, `#/stays`, `#/tasks`) with record deep links and browser Back. Catering retains meals and food counters separately from the function programme. Record pages are read-first; menu, timing/venue, guest basics, food needs, stay, travel, decisions, and provider/costs use focused editors. Failed saves retain the open draft; cancelling discards it so reopening reads the latest shared revision.

The release script imports the documented proposals atomically only when the workspace does not exist. It never resets live edits. Guests start empty. Event times and venues are not invented. The public countdown targets the clearly labelled start of **18 January 2027 at midnight IST**, a date boundary rather than a ceremony time. All seed menus remain proposed; ambiguous items keep their verification markers. Subsequent records have atomic private history and revision checks. Archiving preserves records/history; exports include them. Confirmed, tentative, unknown and declined attendance remain separate per person/occasion. Nightly stay figures count people, not rooms or bookings.

## Guest publication

1. Obtain family approval for the public facts and each function's audience. Record operational changes privately first.
2. Edit only the approved public snapshot in `src/public-content.ts`. Times require an exact offset/UTC instant. Maps must be secure approved Google Maps links. Keep the countdown's labelled midnight-IST date boundary unless the family chooses another exact target; do not imply that it is an event time. Setting it to `null` removes the timer.
3. Review the public wording and social metadata in `index.html`. When public names/dates or art change, regenerate `public/share.png` with `node scripts/share-image.mjs` after installing the matching Playwright Chromium browser. The image is a native rendering of the invitation, not reference artwork.
4. Run tests/build/browser checks, review desktop and mobile, then release through the wedding workflow. Private edits do not publish themselves. Keep an available maintainer for urgent changes near the wedding.

The site discourages search indexing. Its open invitation is still public to anyone with the URL. Do not put guest lists, room allocations, dietary/health details, vendor costs, draft menus or internal contacts in the public snapshot. Hosting serves only `dist`, never this documentation/source directory.

## Verification

From `wedding-planner`: `npm test` and `npm run build`.

From the repo root, after installing dependencies:

```text
firebase emulators:exec --only firestore --project demo-wedding-tests --config firebase.wedding-tests.json "npm run test:rules --prefix wedding-planner"
firebase emulators:exec --only firestore,auth --project demo-wedding-tests --config firebase.wedding-tests.json "node wedding-planner/tests/store-browser.mjs"
node wedding-planner/tests/browser.mjs
```

The store/browser test also needs `personal-functions` dependencies for the Admin SDK, configured strictly against emulators. Browser tests use the matching Playwright Chromium; optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed compatible Chromium. `.wedding-qa` outputs are local/CI artifacts and contain synthetic records only. The original 65 research scenarios remain a reference pack; these targeted tests do not claim all 65 have run.

For reproducible design-state captures, start a fresh dev server and run `node design/botanical/capture-final.mjs` from `wedding-planner`. Its default origin is port 5177; set `WEDDING_REVIEW_ORIGIN` for another port and the Chromium environment variable above if needed. It intercepts only the local demo module with a documented-menu/synthetic-person fixture, writes state-identified images and a manifest, and never writes live wedding records. Actual revocation screenshots come from the emulator integration test.

## Release and recovery

`.github/workflows/wedding.yml` verifies pull requests and wedding branch pushes. Only a main-branch release provisions cloud resources. It uses the existing GitHub deployment credential, compares live rules with the exact reviewed baseline, protects `weddingData`, checks Google provider configuration, authorizes the wedding domains and initializes the record only if absent. Unknown rule drift stops provisioning. Concurrent identical reviewed rule releases are accepted.

Live authorization checks use temporary synthetic accounts and an isolated verification workspace, then remove them. They test registration isolation, all roles, protected owner, self-promotion denial, reads/writes, history, stale revisions and revocation. They do not claim a real human Google popup login. Hosting verification compares every deployed asset with the build and checks private/development source routes return 404. The countdown/access extension's visual evidence and exact candidate are in `design/countdown-access/`; its fixture renders are separate from emulator-backed role-transition tests.

Hosting-only recovery can release a previous reviewed wedding build through `hosting:wedding`. Do not restore older shared rules that omit wedding isolation while private data exists. Before any rule rollback, retain `weddingData` exclusion and its reviewed access block and rerun security regressions. No service worker caches obsolete invitation details.

Current fonts are self-hosted Latin subsets with licenses in `public/fonts`. Add an appropriate licensed Devanagari font/subset before introducing Hindi copy; obtain family-approved text first.
