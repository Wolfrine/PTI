# One Piece PTI integration implementation

## Current integration update — 18 October 2026, 13:05 UTC

The implementation is committed as `27d48d61618d39b7d61e167d7be7709bd9b25052` and published for draft review in PR43, not deployed. Main advanced during this session to `203f81a42db943a6be8c199d9dafdb44a3639d0a`, introducing the accepted personal hub. The merge preserves its HTML, SCSS, global styles, illustration, index and documentation. Only the hub's application data/launch handler changes: add One Piece with full-document navigation and the old-worker bypass, and remove its obsolete development-project link. Existing pin defaults/storage and other app links remain intact.

The merged complete Angular production build passed in 26.015 seconds. Besides the two existing stylesheet-budget warnings, upstream's absolute home stylesheet produces an inlining warning. Its actual production asset exists and matches source; the isolated component browser loaded/applied it successfully. Exact legacy food files and the One Piece child were restored after Angular's clean build. The child fingerprint remains exactly `2b9695d3d712208858675d6bb8847b40f790544a49317f4065e24b33c347282a`.

Independent [launcher QA](evidence/home-integration/README.md) rendered the actual merged Angular component in an H-only fixture with no Firebase/login bypass in production. Desktop/mobile directory, search, optional pin/recent states and plain/Ctrl/middle document navigation passed. The parent independently viewed all seven saved PNGs. This is scoped component evidence; signed-in live PTI and installed-worker upgrade remain release checks. Staged web/build/catalog bytes match the rendered working candidate; three byte-bound CRLF files are preserved explicitly in `.gitattributes`.

Fresh read-only preflight at **13:02:02.497 UTC** confirms unchanged reviewed rules SHA `4dadb9232ddfa27ca6f09bae844adb8cff3d3a4854a6d034a9f221d1d1525c0b`. The current Hosting rollback predecessor is now version **f9215f5f228de12a**, released **12:45:37.880 UTC**, superseding the earlier October15 website version. No database data was read or written. A Hosting fallback must preserve the new family privacy exclusion.

The first H package contains132 verified files/2,355,387bytes and has not been activated. The true three-decoder hour is running **12:51:13.808–13:51:13.808 UTC**, not yet accepted. A read-only PR workflow now checks fixtures, the complete shared rules emulator, complete-site build and exact accepted child candidate before deployment; it has no cloud credentials or deployment step.

The remainder of this document is the historical integration-lane report; the update above supersedes its pending build/launcher/preflight statements.

Implementation in `codex/one-piece-family`, based on `24b4805cf7294ac9850f2a8f0281e189779b5c42`. This document records local integration work and checks on 18 October 2026. It does not claim a deployed PWA, accepted LAN transport, signed-in browser verification, or family-data provisioning.

## Namespace and identity

The complete shared `personal-harness/firestore.rules` now excludes `onePieceData` from the authenticated legacy nested grant. The new block is confined to `users/{ownerUid}/onePieceData/workspace`; the final deny and all sibling app blocks are preserved. Unknown documents and descendants have no grant.

Every One Piece identity must have a verified email and Firebase `sign_in_provider == google.com`. The authenticated UID matching the namespace owner can create its own workspace; the paired companion and deployed app must both fix that owner UID. The rules do not let a caller create a workspace at another UID's path. A local pairing challenge and explicit owner confirmation remain the companion's separate responsibility.

An active family member needs the lowercase verified email, its immutable claimed UID, `role: member`, `active: true`, and an active matching workspace. The owner manages invitations and labels. A verified invitee can get its own invitation and claim an empty UID once, without changing its role or other invitation fields. Members cannot list invitations or grant access. A blocked account can inspect its own invitation status but cannot use workspace, profile, progress or lease data.

All fields below are required and are also the complete field allowlist. Times are integer Unix milliseconds, bounded to five minutes beyond Firestore request time. Revisions/generations/epochs are safe positive integers unless stated otherwise. Ordering never uses those wall-clock values.

| Document | Exact fields and bounds |
| --- | --- |
| workspace | `schemaVersion: 1`, `ownerUid`, `active`, `label` (1–80 characters, no angle brackets), `revision`, `createdAt`, `updatedAt`. Owner writes only; `createdAt` immutable; update revision exactly previous + 1. |
| members/{lowercaseEmail} | `email` (canonical, maximum 254), `uid` (empty before claim; otherwise 1–128 ASCII UID characters), `role` (`owner`, `member`, `blocked`), `active`, `name` (maximum 80, no angle brackets), `invitedBy` (owner UID), `invitedAt`, `updatedAt`, `revision`. Invite metadata and bound UID remain immutable. Owner role is restricted to the namespace owner's UID and verified email. |
| profiles/{uid} | `uid`, `displayName` (maximum 80, no angle brackets), `audioLanguage` (`ja`, `en`), `subtitleLanguage` (`en`, `off`), `autoplay`, `showTitles`, `revision`, `updatedAt`. Self writes preferences. Owner may read a profile and update only its display label/revision/time; owner cannot write another viewer's playback state. Defaults in the app are Japanese/full English, spoiler titles off. Probed track validation stays in the media coordinator. |
| leases/{uid} | `sessionId` (16–128 characters), `deviceId` (1–128), `destination` (`local`, `cast`, `hdmi`), `generation`, `authorityEpoch`, `revision` (zero or greater), `expiresAt`, `updatedAt`. Expiry is bounded between five minutes before and four hours after request time. Self get/write only; no list or delete. |
| profiles/{uid}/progress/{episodeId} | `episodeId`, `sessionId`, `generation`, `authorityEpoch`, `revision`, `positionSeconds`, `durationSeconds`, `watched`, `reason`, `updatedAt`. Canonical IDs 0001–1085 excluding 0590. Finite position 0–duration, duration >0 and <=21600 seconds. Reasons: `heartbeat`, `pause`, `seek`, `restart`, `ended`, `transition`, `mark-watched`. Self get/list/write only; no delete. |

Workspace, invitation and preference updates increment revision by exactly one. Lease/progress records are a latest-state mirror of accepted PC state, rather than a cloud event journal:

- Initial lease projection can contain any valid current generation/epoch/revision. A later generation must increase and use a different session ID. Within a generation, session/device are immutable, revision cannot decrease, and authority epoch cannot decrease. An equal epoch requires the same destination. A higher epoch permits missed handoffs, including a round trip back to the same destination.
- Progress must match the current or same-batch `getAfter` lease's session/generation/epoch/revision and an unexpired lease. Update generation increases, or same-generation revision strictly increases without reducing authority epoch. The only equal-revision retry accepted is a byte-for-byte equivalent record, to handle a committed write whose HTTP acknowledgement was lost.
- The companion enforces every event transition and projects an explicit field allowlist, excluding its internal `lastEventHash`. A durable outbox may fast-forward the cloud mirror after missed transitions; original accepted event ordering stays on H:. Position can decrease after an accepted rewind; `max(position)` is never the merge rule.

## Login, worker and Hosting integration

`pti-app/src/app/services/login-return.ts` is shared by the existing-session login component and popup sign-in. It allows `/one-piece/` and its nested same-origin paths through a full document navigation, retaining episode/query/fragment information. Existing PTI routes use Angular `navigateByUrl`, preserving their queries. External/protocol-relative paths, backslashes, controls, encoded separators, traversal, layered encoding, unknown routes and malformed escapes fall back to `/home`. A popup-in-progress flag avoids duplicate navigation from the component's auth subscription.

The existing authenticated `/home` launch grid gets one One Piece tile using its existing layout and styling. This is the only launcher UI change. The root Angular worker excludes both `/one-piece` and every nested `/one-piece/**` navigation; the generated production `ngsw.json` was inspected for both exclusion regexes. Installed-worker upgrade behavior still needs a real browser check.

`firebase.json` keeps the complete `pti-app/dist/pti-app/browser` default artifact and all five existing targets. The sibling rewrite precedes Angular's catchall. Scoped headers apply no-referrer, nosniff, frame denial, shell revalidation and `/one-piece/` service-worker scope. Existing sibling routes and legacy food handling stay present.

## Build and CI

`apps/one-piece/package.json` and its committed lock pin Firebase **13.0.0**, rules-unit-testing **6.0.0**, hls.js **1.7.3**, esbuild **0.25.12**, and firebase-tools **15.34.0**. npm registry inspection confirmed rules-unit-testing 6's Firebase `^13.0.0` peer requirement. Existing Angular and Wedding/Venture package manifests and locks were not upgraded.

`scripts/build.mjs` refuses to run without an existing Angular `index.html`. It bundles `web/src/main.mjs` with `__DEV__` defined as false, rewrites the module entry, copies static shell assets and appends only the `one-piece/` subtree to the complete artifact. It never changes the default Hosting public directory. Public `catalog.json` is derived from the real inspected source inventory and contains only episode number/ID, availability and title provenance; source URLs, original filenames, checksums and rendition candidates are omitted. Its 1,084 listed episodes and missing 590 remain real inventory facts, not universal playback claims.

The main Firebase workflow installs/builds this sibling after the Angular build and legacy food copy. A separate prerequisite runs new integration tests and the real emulator with the complete shared rules plus existing Wedding/Venture suites. `firebase.one-piece-tests.json` and `scripts/test-emulator.mjs` deliberately use a `demo-` project; no live database is used.

Local package trees are stored on H: with NTFS junctions at their normal repo `node_modules` locations: `integration-dependencies`, `pti-angular-dependencies`, and `sibling-rules-dependencies`. The existing sibling SDK fixtures still use Firebase 12.19.0/rules 5.0.0. Media and engine state are outside this integration lane.

## Verification and remaining gates

| Check | Observed result |
| --- | --- |
| New auth/catalogue/build integration tests | **6/6 pass**. Tests include unsafe redirects, all current Angular login routes, episode deep links, exact real catalogue availability, complete-artifact preservation, and removal of a synthetic dev-auth branch in a production bundle. |
| Java 21 real Firestore emulator, complete shared rules | **37/37 pass**: 15 One Piece, 13 existing Wedding, 9 existing Venture. New tests cover anonymous/stranger/unverified/non-Google/blocked accounts, immutable invite claims, self-only data, extra fields, bad values, legacy catchall isolation, offline generation/epoch projection, rewinds and idempotent acknowledgement retries. All identities and writes are synthetic local fixtures. Transcript: `evidence/integration/rules-emulator.txt`. |
| Angular production build | **Pass**. Existing stylesheet-budget warnings remain for Codex Command (7.69 kB) and Codex Project Detail (5.39 kB). No Angular dependency/lock change. |
| Existing Angular component unit suite | **1 pass, 8 failures**: existing specs omit Auth/Firestore providers. An untouched `git archive` of base commit `24b4805` was separately executed on H: and returned the identical **1 pass, 8 failures**. These pre-existing specs are not silently repaired or excluded. Baseline transcript remains local at `H:/PTI-OnePiece/pti-baseline-qa/baseline-angular-tests.txt`. |
| Actual One Piece production shell build | **Pending**: gated `web/` implementation has not been authored. The build is verified using an explicitly synthetic shell fixture only. |
| Desktop/mobile rendered `/home` tile and actual sign-in/deep-link reuse | **Pending parent browser QA**. Compilation and helper tests do not establish rendered acceptance or shared Firebase-session behavior. |
| Installed root-worker upgrade; install/device/HDMI/Cast | **Not run in this integration lane**. |
| Deployment and live Firestore writes | **Not performed**. No invitations, workspace, family data, database, DNS account, CA or certificate was provisioned by this lane. |

The release safety hazard remains explicit: `personal-functions/provision.mjs` does not currently allow the inspected base rules hash `dadc6f768a121dc8a126b324bd8b58a5943b9f07ef579f9b0db8ea8af4975c61`, and the workflow still supplies an older `3bb47c` predecessor. The guard was preserved. A release must inspect/review the actual live predecessor before a narrowly justified update; accepting an arbitrary observed live hash is prohibited.

### Parent release preflight closure

On 2026-10-18 at 08:51:50.938Z, [read-only Actions preflight 39113060280](https://github.com/Wolfrine/PTI/actions/runs/39113060280) used the existing deployment identity to read the active ruleset metadata/source only. Active ruleset `e3b21b48-8f50-40d7-80d9-a3b2c782efb8` has SHA256 `4dadb9232ddfa27ca6f09bae844adb8cff3d3a4854a6d034a9f221d1d1525c0b`, exactly matching the reviewed base commit's Git blob. The earlier `dadc...` is the Windows CRLF working-tree hash; Linux CI deploys the LF Git blob. No database data was read and no writes performed.

The parent then changed only the workflow's approved-predecessor file from the stale `3bb47c` source to fixed base commit `24b4805cf7294ac9850f2a8f0281e189779b5c42`. The existing live-hash guard and its release-race recheck remain intact. A later external rules change still refuses release. No arbitrary live hash was added to the provisioner's hardcoded allowlist. This closes the identified predecessor mismatch, not the final deployment acceptance gate.
