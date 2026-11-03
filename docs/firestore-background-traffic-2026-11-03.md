# PTI background Firestore correction, 3 November 2026

Owner authorized PTI-only corrections following the read-only audit. Preserve
authentication/revocation, data, schedules, One Piece playback/Start, GTOP APIs,
Local Codex active sessions and Velum P017 inference. No GTOP/Noveliaa changes.

## Evidence and decisions before implementation

The direct Monitoring baseline at 00:00-01:00 UTC on 3 November was 626 successful
reads and 411 writes in PTI's default database. Request logs contained 225 One
Piece function executions and 118 successful Local Codex syncs. The active
06:00-07:00 hour had 816 Local Codex MCP requests, including 204 HTTP 400s, and
82 reports. Each valid MCP request reads its access grant and revocation session.
Do not compare these successful-operation metrics directly with all billable
query minima, index reads or security-rule dependency charges.

Topology: the PTI parent implemented Local Codex and integrated delivery; native
gpt-6.1-sol/xhigh makers owned One Piece and Velum independently. Makers reviewed
each other's work and the parent's Local Codex changes. No child installed or
restarted a production runtime.

1. One Piece: preserve the existing command mailbox and 60-second status expiry.
   Skip unchanged heartbeat writes until 30 seconds; persist state/version/ACK/
   request expiry immediately. Duplicate Start IDs do not write. Existing clients
   benefit after server deployment without restarting the starter. Prepared
   initiator 1.3.1 checks local health every 15 seconds, polling every 30 seconds
   while healthy and every 15 seconds while stopped. Failure backoff stays bounded.
   A permanent HTTP listener was rejected: this first-generation function has two
   instances and a short timeout; held streams consume capacity and compute, and
   listening to heartbeats adds reads. See the initiator's detailed quiet-control
   decision and deterministic operation-count tests.
2. Local Codex: return 40-second maintenance only for an explicitly connected,
   idle listener with no admitted jobs. Active/disconnected maintenance stays
   30 seconds; markers still wake immediately and lease/online cutoffs are
   unchanged. Existing installed listener relays consume this response field.
   No authorization cache or token/session/revocation policy changes.
3. Velum: exact device-scoped queued/running subscriptions wake the existing
   serialized REST claim path. Approval, revocation, update-time claims, durable
   no-resample recovery and active 15-second approval guard remain. Connected
   quiet maintenance has no queue sweeps; disconnected fallback is once/minute.
   Listeners still read initial results and updates, including active progress.
   Token refresh remains in the existing protected device session path. Backoff
   gates are 5-120 seconds, visited on minute maintenance or active checks; this
   does not guarantee an exact five-second reconnect.

## HTTP 400 investigation

Existing request logs expose status/size, not the JSON-RPC rejection reason.
The first correction deployed sanitized diagnostics as revision
`pti-firestore-mcp-00053-mtd`. At 08:34:15 UTC it had emitted seven
`unsupported_protocol` rejections since 08:33 UTC, establishing the production
cause. An earlier local initialize-batch reproduction matched the status pattern
but was not the observed production cause.

The follow-up preflight rejects valid JSON-RPC non-initialize messages with an
unsupported protocol version before reading Firestore authorization records. It
keeps the SDK's same 400 JSON-RPC error, never executes a tool, and never accepts
an unsupported version. Origin/Bearer-syntax/header/body/batch checks retain
their existing behavior; initialization still negotiates through the SDK. Every
potentially accepted request still reads its access grant and session and checks
current user, scope, resource, owner and revocation. There is no authorization
cache. The explicit denial-only precedence change is an unknown/revoked token
combined with an unsupported version: it now returns 400 rather than 401, with
no protected action or data. Missing credentials still challenge with 401.

Diagnostics record only fixed event/route/reason/stage categories, never headers,
tokens, identifiers, bodies or error strings. A preflight rejection avoids two
authorization-document reads relative to the prior valid-token path: the old
204/hour sample implies 408 fewer reads/hour if that request mix persists.
This is a source/test cost model, not measured billing. A 400 response itself is
required for unsupported versions by the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#protocol-version-header).

## Expected changes, not measured billing

| Quiet state | Model before | Model after |
| --- | --- | --- |
| One Piece, existing 15-second client | 240R/240W per hour | 240R/120W per hour |
| One Piece, prepared healthy client | 240R/240W per hour | 120R/120W per hour |
| Connected idle Local Codex maintenance | 2,880R/2,880W per day | 2,160R/2,160W per day |
| Velum connected idle queue sweeps | 11,520 minimum empty-query read charges/day at nominal cadence | No periodic queue sweep; initial/update/reconnect deliveries remain |

These exclude latency, retries, state changes, active jobs and listener/rule
deliveries. Installed Velum acceptance requires a safely idle cutover coordinated
with active P017 work; emulator success is not actual device-token acceptance.
Source, CI, hosted deployment, installed activation and live measurements must be
reported separately in the delivery record.

## Local verification before delivery

PASS on the existing supported F-drive Node 24.22.1 runtime: hosted MCP 159 tests
and TypeScript build; Local Codex worker 51 tests and bundled build; starter 51
tests; One Piece gateway 12 tests and functions build; Velum 34 deterministic
tests and 17 emulator tests; Angular 107 ChromeHeadless tests and production
build; Home guidance contract and scoped whitespace checks. Independent reviews
found no blocking source-safety defects. The first emulator startup timed out;
the corrected locale invocation and full suite passed and its child stopped.

Angular retained stylesheet-budget warnings and an unresolved absolute
`/assets/styles/pti-home.css` build warning. No UI source was changed and no new
visual acceptance is claimed. Existing dirty shared rules/workflow files and
untracked research-preview work were excluded from this delivery.
