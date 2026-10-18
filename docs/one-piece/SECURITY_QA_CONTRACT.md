# One Piece security, session and QA contract

Implementation guidance reviewed on 18 October 2026. This is a contract for the next implementation, not evidence that its controls exist. The owner has accepted visible cold preparation and requested local DNS. The warm/start/seek targets remain 5 seconds. Transport acceptance is still a separate gate.

## Existing facts and concrete risks

- `personal-harness/firestore.rules:6` excludes `users` from the broad top-level grant, but line 9 permits every authenticated account to read/write most nested user collections. Add `onePieceData` to that exclusion **before** relying on new private rules. Firestore matching grants are additive; an explicit deny cannot override this legacy allow.
- `pti-app/src/app/components/login/login.component.ts:31` accepts any redirect beginning `/`; its line 20 and `services/auth.service.ts:107` use Angular navigation. A sibling PWA needs one shared, allowlisted full-page return helper. Do not change that test to `location.assign(rawRedirect)`.
- `firebase.json:69` serves the complete Angular artifact; its final rewrite at line 85 is the fallback. Place the sibling rewrite before it. The existing global CORS headers at lines 20–25 are not a companion authorization policy and must not be copied into a credentialed LAN API.
- `personal-functions/provision.mjs:21–34` rejects unreviewed live-rule predecessors. The inspected base rules hash is `dadc6f768a121dc8a126b324bd8b58a5943b9f07ef579f9b0db8ea8af4975c61`. `.github/workflows/firebase-deploy.yml:99–100` currently supplies an older predecessor. Review the actual live baseline and preserve that overwrite guard when adding One Piece; never approve whichever live hash happens to be returned automatically.

## Family identity and Firestore boundary

Use `users/{ownerUid}/onePieceData/workspace`, following PTI's existing app namespaces. V1 has one viewing profile per invited Google account, with `profileId == Firebase uid`; there is no cross-account profile switcher.

| Record | Read/write contract |
| --- | --- |
| Workspace | Verified owner creates/bootstrap once; invited active accounts can read the minimal family/config metadata. Owner alone edits settings. No credentials, private LAN bearer tickets or raw engine URLs. |
| `members/{lowercaseVerifiedEmail}` | Owner manages invitations, role (`owner`, `member`, `blocked`) and labels. Each verified account can get its own membership record; members cannot list/invite/elevate others. Bind its UID once to the authenticated account; reject a conflicting UID. |
| `profiles/{uid}` | Account reads/updates its own bounded preferences and display label. Owner may administer labels, but cannot write another person's playback state. |
| `profiles/{uid}/progress/{episodeId}` | Only that active member reads/writes its progress; server writes use that same user's Firebase identity. Validate the schema, canonical episode ID and revision/generation. |
| `leases/{uid}` | Only the matching active member can read/claim/renew its viewing lease. Owner membership administration does not grant access to another member's progress or lease. |

All rules require a verified Google identity and the family owner UID fixed in the deployed app/paired companion configuration. Nonmembers, unverified accounts, blocked accounts and unknown nested documents are denied. Rules use an explicit field allowlist and bounds, not unrestricted member writes. Keep invitation emails canonical and require both the verified email and immutable bound UID after first claim. Profile preferences must not contain markup or arbitrary resource URLs.

First-use workspace setup must be explicit and authenticated; never let the first remote/LAN request choose the family's owner. A one-use local pairing code opens setup for at most five minutes, with bounded attempts. Once paired, ownership cannot change through the public API. Family invitations are records created by the owner; creating those records does not send email without an explicit user request.

## Companion authentication and unattended viewing

Normal API calls carry a current Firebase ID token in `Authorization`, through an accepted trusted control transport. Verify signature using Google's public signing keys, RS256 only, key ID, project audience, securetoken issuer, expiry/issued-at/auth-time, nonempty UID, verified email and Google provider. Cache keys only for their published lifetime; do not accept unsigned tokens or a token from another Firebase project. Then read the exact family membership using the caller's Firebase ID token. No Admin SDK credential or service-account key is needed for that read.

Use Firestore REST with Firebase **user ID tokens**, so the deployed rules remain authoritative. Do not use `gcloud`/service-account OAuth as an unnoticed substitute: those calls use IAM and bypass the client rules. [Firebase REST authorization](https://firebase.google.com/docs/firestore/use-rest-api), [ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

For a short browser session, caller tokens suffice. The complete unattended Cast requirement extends beyond the sender's one-hour ID-token lifetime: do not assume Android keeps browser token refresh running while asleep. Durable progress on H: can survive a temporary cloud outage, but alone cannot provide fresh cloud membership checks or self-only Firestore synchronization indefinitely.

For production unattended Cast, provision a separate **user session for each paired viewer** once: after fresh Google reauthentication, send the short-lived Google provider credential and current Firebase ID token through the trusted pairing endpoint. Exchange the provider credential with Firebase `accounts:signInWithIdp`; require the returned UID/project/verified email to match the authenticated caller before retaining anything. This uses the existing Firebase Google provider/client; no new Google OAuth console application is required. Store the newly issued refresh credential only in the PC protected store, bound to this family and UID. Never copy `user.refreshToken` from browser storage, return refresh credentials to a receiver, or put credentials in URLs/logs. [Official credential exchange and refresh API](https://firebase.google.com/docs/reference/rest/auth).

Protect retained credentials with Windows DPAPI under the actual runtime identity and restrictive ACLs; test that identity after reboot. Refresh before expiry and atomically retain any rotated token. API routes never expose a generic Firestore or arbitrary-URL proxy. A viewer's local disconnect/revoke action destroys that viewer's retained credential and revokes its local leases/tickets. Owner blocking is checked at session creation, transition and at most every 60 seconds during playback. A failed/expired Google refresh cannot silently become indefinite authorization. Do not claim instant global Firebase-account revocation from offline JWT signature checks; distinguish local ticket revocation, family blocking and Firebase session invalidation.

Until control TLS is accepted, no Firebase/Google bearer credential may be sent over LAN HTTP. If private-CA trust fails on the actual receiver, review a concrete hybrid separately: trusted authenticated control plus bounded LAN HTTP media capabilities. The successful HTTP clip proves that media transport works, not that this production security tradeoff has been accepted.

## Small API and receiver capabilities

The backend derives `uid/profileId` from verified identity, never from an arbitrary body field. Only catalogue episode IDs and enumerated destination/track capabilities are accepted.

| Operation | Required behavior |
| --- | --- |
| `GET /v1/health` | Minimal public availability only; no account, path, engine credential or media capability. |
| `POST /v1/pair` | Trusted transport, one-use local challenge, verified identity, immutable configured owner/family; optional fresh Google credential creates only the caller's user session. |
| `POST /v1/sessions` | Episode ID, expected lease generation, destination and explicit takeover flag. Return preparation state/session ID/effective tracks; no engine administrator URL. Missing 590 and outside-source IDs are explicit outcomes. |
| `GET /v1/sessions/{id}` | Only its owner; effective episode, preparation progress, source mode, position and lease generation. |
| `POST /v1/sessions/{id}/events` | Current generation and increasing event revision; authoritative-position rules below. |
| `POST /v1/sessions/{id}/renew` | Fresh identity/membership; rotate finite media authorization. No blind indefinite renewal. |
| `DELETE /v1/sessions/{id}` | Revoke its media capabilities, release cache pins and cancel only work no other viewer needs. |
| Media/caption GET/HEAD | Receiver-compatible scoped capability; no Firebase token/cookie required by the TV. Exact assets, ranges and MIME/CORS behavior. |

Use cryptographically random opaque media capabilities (at least 192 bits; store only hashes). Each authorizes one family/profile/session generation, one episode and prepared rendition/subtitle assets. Default lifetime is two hours, with an absolute four-hour session delegation requiring a fresh authenticated renewal from the app. Queue entries use separate episode scopes; renewing/adding entries requires a live permitted delegation and membership check. An expired, blocked, closed or taken-over session cannot gain new media access. Record redacted ticket IDs only; omit capability URLs from access logs and use `Referrer-Policy: no-referrer`/`Cache-Control: no-store`.

Rewrite every nested manifest, segment and subtitle URL into this capability namespace; never leak Jellyfin API keys through a child playlist. Resolve only generated allowlisted engine assets under loopback engine endpoints; reject traversal, encoded separators, arbitrary URLs and path-prefix escapes. Validate byte ranges, final source size/checksums, short/oversized responses and cancellation. Apply exact origin CORS separately to the PTI sender and actual receiver origin; CORS is not authentication. A local DNS name is not a trust proof or an authorization boundary.

## Viewing leases and progress merge

Maintain durable H: state with one active lease per UID. A lease contains an opaque session ID, generation, destination and bounded expiry. A new device receives `409 active-session` with enough information to offer takeover; it must not silently steal the profile. Explicit takeover atomically increments generation and revokes all old session tickets/writes. Three different UIDs can watch independently.

Progress uses `{episodeId, sessionId, generation, authorityEpoch, revision, positionSeconds, durationSeconds, watched, reason}`. The companion owns accepted ordering; source-independent IDs preserve progress after a source changes. Validate finite position/duration against probed media duration. Persist locally before acknowledging; mirror to Firestore with update-time/revision preconditions and retain an outbox on cloud failure.

- Accept a higher revision in the current generation even when its position decreases for a deliberate seek/restart. **Never merge using max(position)** or client wall-clock timestamps.
- Reject duplicate/older revisions and every old-generation event after takeover. A delayed heartbeat cannot undo a newer rewind or next-episode transition.
- While local playback is active, accepted browser events own position. While casting, actual receiver episode/time/track state owns position; phone estimates do not overwrite it. A Cast seek command is acknowledged from receiver state, not from the sender button click.
- Every destination change rotates `authorityEpoch`. Events must carry the current epoch and the authority matching that destination, so late local or receiver messages cannot survive a local→Cast→local handoff. Revision remains increasing within the viewing lease.
- An offline client outbox is offered back through the companion's ordering checks; it cannot overwrite a newer generation just because its timestamp is later. Keep rejected entries inspectable until reconciliation; do not silently lose a deliberate rewind.
- On companion restart, retain accepted progress and preparation integrity; require fresh identity/membership before resuming control. Restore cache pins only for valid leases. Do not revive stale receiver ownership or continue a revoked ticket automatically.

## Verification that decides acceptance

| Test | Required observed result |
| --- | --- |
| Real rules emulator with complete shared rules | Anonymous, stranger, unverified, blocked and another family's accounts cannot read/write the namespace. Invited member cannot elevate role, alter another profile/lease/progress, add fields or exploit the legacy catchall. Owner invitation/labels and self-progress work. Existing Wedding/Venture boundaries still pass. |
| Authentication negatives | Wrong project/issuer/algorithm, expired/future token, wrong Google-credential UID, exhausted pairing code and stale membership all rejected. No Firebase/Admin credential in browser bundle, response, child manifest, evidence or log. |
| Paired Cast beyond token expiry | Sender asleep beyond one hour; next episode and progress continue using refreshed PC user credentials, membership is still rechecked, and that person's Firestore mirror catches up without another user's identity. A revoked refresh or owner-blocked member stops authorization according to the stated bounds. |
| Ticket negatives | Wrong episode/rendition, old generation, expiry, revocation, tampering, traversal and external URL rejected; nested HLS/captions retain only the correct finite capability. |
| Ordering | Two devices race; explicit takeover wins atomically. Delayed heartbeat after rewind does not advance position. Resume after restart and cross-source transition retains episode/position; duplicate events are idempotent. |
| Cache concurrency | Three UIDs/current+next, duplicate preparation, cancellation, active-file pinning, admission reservations including conversion/subtitle temporaries, source-size change and disk pressure all stay below 20 GiB. No series-wide scans. |
| Product/device | Actual full streams and timed captions from both sources; 589 missing boundary, exact 1000→1001, 1085 end; Cast sleep/reconnect/control, HDMI, 60-minute three-stream load, Android/desktop install and live PTI deep links/worker upgrade. Headless segments and short clips do not replace these checks. |
| Release | Complete Hosting artifact, allowlisted login return (`//`, backslash, external/encoded traversal rejected), same-project sign-in reuse, existing PTI/sibling smoke tests, exact live assets and reversible release. The rules deployment refuses an unreviewed live predecessor. |

## Design staffing and independent QA

Loaded Central `visual-design-director` **0.1.0**, release base `ba1235fe7b220842778414f3f70fca38e7df4c53`, with designer/critic role guides. The available workflow explicitly separates parent, designer and independent visual critic; QA may be parent or this review lane, but cannot be the designer/critic. Existing `system-worker` and `quality-checker` roles can be assigned those responsibilities without inventing new tools or model availability.

After the network gate clears, use actual reference images, three materially different directions, independent selection, and the required substantive rendered review cycles. QA separately checks real playback, auth, responsiveness, keyboard/touch, errors, state continuity and installed-app behavior. Build/test success and this security contract do not establish a visual score or product acceptance.

## Initial module review closure

Independent rerun: `node --test apps/one-piece/companion/test/auth.test.mjs apps/one-piece/companion/test/progress.test.mjs` — **9/9 passed**. Four initial findings are closed: missing-590 availability validation, destination writer epochs/exact authority, bounded malformed/rejected identity responses, and failed signing-key refresh backoff. Hashed UID filenames avoid Windows case collisions; atomic writes now remove temporary files on write/sync/rename failure. This closes the inspected module findings only. Integrated API authorization, Firestore rules, cloud synchronization, ticket enforcement and actual device/session behavior still need their acceptance tests.

## Integrated API review snapshot

Independent command from the companion directory: `node --test test/api.test.mjs test/cloud-progress.test.mjs test/integration.review.test.mjs` — **5 passed, 2 failed**. Existing API/cloud fixture tests passed; the two new independent regressions reproduce these open findings:

- **P2 — closed-lease cloud progress:** `cloud-progress.mjs` reports `state: synced` even when `perform` returns `synced: false` for a closed or expired lease. Pending durable progress is not committed in that path. Preserve truthful pending status and make final accepted progress flushable after closure.
- **P2 — next-episode retry:** `api.mjs` retains a failed `ensureQueue` promise indefinitely. One temporary cache-pressure or source failure prevents later queue/Next attempts for that session from reaching the recovered media engine. Preserve in-flight deduplication while permitting a bounded retry after failure.

These tests use explicit fixtures; they do not claim real Firestore or TV acceptance. The runtime import, private setup IPC and authenticated health-path wiring identified during the same review have since been corrected in inspected code; actual managed boot, pairing delivery and recovery remain integration acceptance checks. No production code was changed by this review lane.

### Follow-up closure and offline-final-write gap

The original two regression tests now pass independently: cloud status remains pending when no commit occurred, and failed queue preparation is removed so a later attempt reaches the media engine. The session-close route also attempts a forced final cloud flush before closing.

The expanded command above now returns **8 passed, 1 failed**. A new actual HTTP fixture confirms manual selection while casting pauses the old authority, retains the Cast destination with a fresh epoch, rejects delayed old receiver progress, and suppresses the asynchronous TV load if the viewer returns to local playback while preparation is pending.

One **P2 remains open:** if the final cloud flush fails during an outage, closing removes the active lease and API state. Later `CloudProgress.perform` returns before committing the durable outbox without an active lease; the server's periodic retry also enumerates only remaining API states. The new real-ProgressStore/fixture-cloud regression `final offline progress can be mirrored after its viewing lease closes` fails after connectivity returns. Accepted progress is retained on disk, but automatic cloud recovery after closure is not implemented. Provide a durable pending-user retry and final-write authority that does not resurrect playback, tickets or receiver control. These are functional fixtures, not observed physical-TV or real Firestore proof.
