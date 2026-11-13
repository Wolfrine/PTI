# PTI Intelligence · capture intake (v1)

Canonical project plan and work statuses: [SM Intelligence Delivery Plan](https://chatgpt.com/space/page_c30716eb68848191a78dfd38a7a757e4). Project Space: [SM Intelligence](https://chatgpt.com/space/page_6af6bcbab7bc8191ad188da88d32501e).

## Implemented contract

- Routes: authenticated `/intelligence` Reading Tray; public `/intelligence/share` accepts Android PWA `share_target` `GET`, saves a short-lived draft in `sessionStorage`, removes the query from browser history and hands off to the guarded inbox. A signed-in Google account and current PWA installation are required. A URL pasted directly also works. No API connection to Instagram, YouTube or X is implied.
- Owner-only Firestore collection: `users/{uid}/intelligenceData/workspace/captures/{cap_<uuid>}`. Rules in `personal-harness/firestore.rules` exclude the namespace from PTI's general grant. All unknown Intelligence subcollections remain client-denied until purpose-built server paths and rules are reviewed.
- Each v1 capture has `schemaVersion=1`, source URL + normalized canonical URL, SHA-256 dedupe key, platform label, capture channel, title, shared text, user's note, project hint, owner triage status, `duplicateOf` if known, timestamps and monotonically increasing revision. The note and original context are retained, not overwritten by inferred agent content. Capturing an already seen source creates a new linked record.
- Owner triage transitions: `received → organized / archived`, reversible; direct updates only to `status`, `updatedAt`, `revision`. Hard deletes intentionally disabled.
- In the UI only the newest 80 records appear; pagination, semantic tagging, automatic summarization and research findings remain subsequent milestones. Search is client-side within those 80.

## Operational boundaries

- This version is a human-confirmed inbox, not a background AI worker. No external platform API, webhook, scheduler, autonomous account action, social publication or credential is connected.
- Android Share Target v1 uses `GET` and can expose shared link/text in the initial navigation URL before client cleanup; avoid sensitive message content. A service-worker-handled `POST` receiver is a separate reviewed iteration.
- Firebase promises await confirmed writes. Offline entry remains on screen until a connection is restored; the UI does not claim a background sync queue.
- A platform's ability to share content **to the inbox** differs from authorized API access to the user's feed, direct messages or broader search. Each social platform adapter will have its own OAuth/permission and quota evaluation, with explicit owner connection.
- Research jobs must store sources, discovery timestamp, model/provenance, bounded queries, human review and completion status separately from immutable incoming captures. Posting or managing public pages must stay approval-gated.

## Continuation order

1. Deploy the jointly reviewed Firestore rules and production Angular build; verify same account isolation and capture in a real signed-in PTI session on mobile.
2. Add topic taxonomy + agent classification as immutable derived records, with model confidence and accept/reject. Never mutate original capture text.
3. Add explicit research requests, source-grounded discovery worker, evidence snapshots and dedupe/rate limits.
4. Implement official YouTube read/search adapter; evaluate Meta professional account and X developer access before wiring any DMs.
5. Add supervised publishing approvals and an audit trail only after source and identity requirements are met.

For every milestone update the Space plan's status, start/end time, verification evidence, remaining blocker and handover owner. Keep GitHub Actions minimal; build locally and batch coherent releases.
