# One Piece quiet control

Scope: PTI's fixed One Piece start mailbox and the independent One Piece initiator loop, prepared as starter 1.3.1. No GTOP API semantics, worker, playback, identity, rules, workflow or installer changes. A dedicated maker implemented this lane and independent review checked the integration. Hosted deployment and installed activation are separate evidence in the parent delivery record; fixtures do not establish locked-session or playback acceptance.

## Plan and transport decision

The current initiator sends one `/poll` about every 15 seconds plus request/health overhead; the supplied audit baseline was approximately 225 calls/hour. Each successful call reads one mailbox document transactionally and previously wrote it unconditionally. Server status expires after 60 seconds, so eliminating all idle heartbeats would make a locked but reachable PC appear offline and disable cloud Start.

An authenticated server event stream was considered because the existing GTOP worker Firebase token cannot authenticate a PTI client Firestore SDK listener. The function is first generation, with `maxInstances:2`, single-request instances and a 30-second timeout. A persistent stream would need a timeout change, occupy one instance continuously, and receive additional billable reads for the same mailbox's heartbeat writes. That tradeoff does not justify new streaming infrastructure for this bounded correction.

1. Coalesce unchanged heartbeat writes on the server at 30 seconds. Keep the transaction read and authoritative command response on every poll. Persist readiness/version changes, matching pending-request acknowledgements and expiry immediately. Replayed Start IDs are read-only no-ops. Decisions take their timestamp inside the transaction callback, including retries/serialization.
2. Prepare the initiator to retain a 15-second health-check loop and 15-second stopped mailbox cadence, but poll every 30 seconds while ready. A health change expedites the next authenticated poll. Reuse the just-measured health sample for that poll; acknowledgement and recovery paths still measure again. Authentication/network failures back off from 15 to 60 seconds, and health changes cannot bypass that backoff.
3. Preserve the durable-before-launch attempt record, matching-only acknowledgements, fixed task, existing `IgnoreNew`/native mutex behavior, 75-second start deadline and independent startup heartbeats. No stop/restart capability is added. The normal signed-in locked-session scheduler behavior is unchanged.

## Truth and cost boundary

An unchanged poll returns the stored heartbeat timestamp; it does not manufacture a fresher `lastSeenAt`. The 60-second expiry and `starter_offline`/companion-offline behavior remain unchanged. Server coalescing can benefit the old installed client without restarting it. The adaptive source cadence requires a later starter installation/activation.

For an unchanged interval of `T` seconds and a nominal client period `p`, poll reads are approximately `T/p` (one read per successful attempt, excluding transaction retries). Previously writes were also `T/p`. With coalescing, writes occur only on the first poll at least 30 seconds after the last persisted heartbeat: for exact periodic polling, approximately `T / (p * ceil(30/p))`. Immediate state/request changes add writes.

| Synthetic steady state | Calls/reads per hour | Writes per hour |
| --- | ---: | ---: |
| Old nominal 15-second client + old server | 240 | 240 |
| Old nominal 15-second client + corrected server | 240 | 120 |
| Prepared healthy 30-second client + corrected server | 120 | 120 |
| Prepared stopped 15-second client + corrected server | 240 | 120 |

Thus server-only activation halves nominal idle writes while retaining reads. Activating the prepared healthy client halves nominal reads too. If the supplied measured 225/hour cadence were perfectly periodic at 16 seconds, the corrected server would write about 112.5/hour; real jitter changes which poll crosses the 30-second boundary. These are formulas and synthetic cadence estimates, not provider billing or post-deployment measurements. Owner status reads, Start activity/dedupe writes, startup keepalives/ACKs, retries, authentication and GTOP's separate traffic are excluded. No new listener, collection or index is introduced.

The prepared local `one-piece-status.json` distinguishes `checkedAt` from the unchanged `lastPollAt` when a healthy poll is skipped. `counters.localChecks` counts supervisor checks; `counters.remoteCalls` counts actual One Piece `/poll` attempts, including startup keepalives and acknowledgements, after token acquisition. These counters do not assert Firestore billing or successful publication.

## Verification and activation gate

Synthetic tests cover 24 hours of healthy scheduling (5,760 health checks and 2,880 mailbox polls), stopped discovery, immediate health transitions, coalesced concurrent checks, post-start readiness and bounded failure recovery. Server cases cover no-op writes/persisted freshness, immediate version/readiness/ACK/expiry writes, repeated Start/poll concurrency, transaction-time timestamps, 60-second status expiry and existing auth/schema/idempotency behavior. Existing starter tests retain interrupted/lost-ack recovery, no duplicate launch, fixed-target validation and no healthy companion restart coverage.

PASS: `npm run test:one-piece-host` built the functions TypeScript and passed all 12 server tests. The supported F-drive Node 24.22.1 binary separately passed the same 12 server tests and all 51 starter tests. Both changed initiator modules passed syntax checks; the Home guidance contract and scoped diff whitespace checks passed. These tests use fixtures and local HTTP servers, not production requests. The parent owns integration checks and delivery.

Before installed acceptance, use the existing main pipeline to deploy the server correction, verify the authenticated gateway behavior and measure real read/write cadence without stopping playback. An idle initiator cutover must preserve the current GTOP worker/runner and One Piece companion process identities, then verify an actual hidden scheduled invocation, locked-session cloud Start when safely stopped, reconnect/offline expiry, and current-viewer continuity separately. If any safe runtime gate is unavailable, report it as pending rather than claiming it passed.
