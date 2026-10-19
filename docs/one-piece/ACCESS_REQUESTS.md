# Family access: sign in, then owner approves

Owner request, 19 October 2026: family members should sign in with Google and appear for approval. The owner should not collect and type email addresses.

## Viewing flow

- A signed-in person without membership automatically submits one access request using their verified Google UID/email and account display name.
- They see a waiting screen. They cannot play, prepare media, discover/control TVs, read family progress or view other requests while waiting.
- The owner opens **Account → Family access**, sees pending names/emails and chooses **Approve** or **Decline**. The owner does not type an address. Existing members retain Pause/Enable controls.
- Approval binds the exact requesting UID to the canonical email membership in the same Firestore transaction that marks the request approved. The waiting app observes its own decision and refreshes admission once. Existing one-time Google playback-account confirmation remains when required.
- Declined requests are not recreated on login. A paused/blocked membership cannot be reactivated through a request retry; the owner uses the existing member controls.
- Existing invitations and saved progress remain compatible. No real member is approved by this implementation or its automated checks; approval belongs to the owner.

## Access boundary

Requests live at `users/{ownerUid}/onePieceData/workspace/accessRequests/{requestUid}` and contain only `uid,email,name,status,createdAt,updatedAt,revision`. A verified Google user may create only their own pending request with the email in their signed identity, and read only their own record. They cannot list, update, delete, self-approve or grant membership. The owner can list/review requests. Rules validate shape, times, immutable identity and revisions; an approved decision requires the same atomic member write. Unknown descendants remain denied, and the broad legacy grant still excludes `onePieceData`.

The companion exposes pending metadata only through authenticated `/api/me` setup admission. Owner identity comes from the fixed PC binding. Pending metadata never authorizes normal APIs or looks up retained playback credentials, and invalidates a prior positive membership cache entry. Media, Cast, episode/source and progress authority checks retain their existing behavior.

Requests and memberships remain in the existing Firebase project. There is no email sender, new account database, paid service, new public network endpoint or notification permission. The existing trusted home-network companion is still required. Public catalogue browsing while the PC is offline does not grant playback access.

## Release and evidence

Implementation lanes: backend `/root/family_request_backend`; rules/client `/root/onepiece_install_identity`; UI `/root/onepiece_hosting`; independent security/visual reviewer `/root/separate_pwa_review`; parent integration/QA `/root`.

This is a bounded workflow correction using the current light/dark theme, not a new visual direction. Central guidance version0.1.0, base `ba1235fe7b220842778414f3f70fca38e7df4c53`; desktop/mobile waiting, declined/paused and owner-review states require rendered verification. Synthetic accounts in local/emulator checks are labelled and do not create live family grants.

Shared rules release accepts only the exact previously deployed Git blob from `b00df300e4de29c5cbdeec1198ed1072538752b8`, SHA-256 `b93b23d0a6d5387fab7a76d9b5efbd802bb2047fa7b042b3a5ba08a3bd73ebb3`. A read-only PR preflight compares that predecessor to live rules before merge. Both existing provisioners retain their concurrent-release checks and may publish only the same reviewed target. An unknown live predecessor blocks publication.

Final candidate fingerprints, rendered captures, test outcomes, installed companion release and remaining live-device limits are recorded by the release evidence. No TV test, episode download, certificate change or real-family approval is part of this change.

### Candidate review

Final local checks passed:82 frontend/season/integration tests,225 companion tests and46 complete shared Firestore emulator tests. The independent reviewer separately passed57 frontend,31 backend and46 shared emulator tests. The Angular complete-site build and dedicated One Piece build succeeded with existing Angular stylesheet/budget warnings.

Parent and independent reviewer directly inspected desktop1440×1000 and mobile390×844 renders. Owner Approve/Decline actions updated the synthetic request count/membership; long names/emails wrapped without horizontal overflow. Waiting, declined, paused and request-error screens exposed identity, retry and sign-out while hiding playback. The approval-before-first-snapshot race refreshes admission once per revision. Unknown offline membership retains public catalogue browsing; known unapproved users stay gated. Background request updates patch only the request badge/dialog, preserving the player DOM.

These are scoped agent passes, not owner aesthetic approval or a claim of physical-family acceptance. Screenshots and hashes are in `design/evidence/access-requests/`; accounts and decisions there are synthetic. Actual Google sign-in and owner approval on family devices remains a post-release check. Existing playback-account confirmation, home Wi-Fi and PC availability remain dependencies.
