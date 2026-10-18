# PTI integration inspection — stage 1

Inspected against freshly fetched main `24b4805cf7294ac9850f2a8f0281e189779b5c42` in the isolated `codex/one-piece-family` worktree on 2026-10-18. This records the intended integration after the playback gate; none of these production files has been changed by the pilot.

## Existing artifact and release route

- `firebase.json` default Hosting serves `pti-app/dist/pti-app/browser`. It has a final `** → /index.html` rewrite and a sibling `/food` legacy route/redirect. A sibling app needs its own `/one-piece{,/**} → /one-piece/index.html` rewrite before the Angular fallback.
- `.github/workflows/firebase-deploy.yml` builds the Angular artifact, copies legacy food assets, and deploys the complete default Hosting target using the existing GitHub service-account secret. Add the One Piece build/copy step before that existing deploy; deploying a separate directory over the default target would remove the rest of PTI.
- The workflow also provisions the shared database and deploys other sibling sites. Preserve their paths and jobs; the pilot has not edited them. Local Firebase login is not a prerequisite for this existing release lane.
- `pti-app/ngsw-config.json` has no explicit navigation exclusions. Add `/one-piece/` and its nested routes to the root worker's navigation exclusions, and test upgrade from an already-installed PTI worker. A One Piece worker must be scoped to `/one-piece/` and cache only shell/catalogue assets.

## Authentication and authorization

- `pti-app/src/app/app.routes.ts` owns `/home` and other Angular routes, but no `/one-piece` route exists. Host the new PWA as a sibling artifact rather than mounting its watch URLs into Angular's route table.
- `login.component.ts` and `auth.service.ts` currently return through `router.navigate([redirectRoute])`. That is insufficient evidence of a safe full-page return to a sibling app including a query-string episode link. Implement and test an allowlisted same-origin sibling return while preserving existing PTI login behavior.
- Reuse the same Firebase project and browser authentication persistence; verify actual sign-in reuse instead of assuming that sharing an origin alone establishes it.
- `personal-harness/firestore.rules` has additive broad authenticated grants at both top-level collections and nested `users/{uid}/{collection}/...` paths. The proposed family namespace must be excluded from the applicable broad grant in addition to receiving explicit membership/profile rules. Test the deployed rule set in the emulator, including uninvited authenticated users and legacy-path preservation.
- No family identities, invitations, profile data, new database records or authorization rules have been created by this pilot.

## Network gate remains independent

Firebase Hosting can serve the PWA shell and metadata; it cannot make an unavailable LAN companion, untrusted certificate, incorrect source language, or unsupported TV subtitle path work. Keep the public shell route, authenticated PC control API, and receiver-scoped media access as distinct interfaces. Local naming was demonstrated on the PC and Sony receiver over HTTP; Android/PTI-origin access and trusted TLS remain unproved.

## Release acceptance still required

After feasibility passes: complete-site build, desktop/mobile rendered review, auth/deep links, installed-worker upgrade, PWA install, original PTI and sibling smoke tests, exact live assets/routes, private API/rule tests and rollback. This stage-1 document does not claim any of those checks passed.
