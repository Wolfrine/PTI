# Local Codex progress waiting — 30 October 2026

Continue the owner's archived Local Codex setup discussion. Reduce repeated task retrievals in ordinary ChatGPT while preserving subscription authentication, task identity, exact human approvals and the existing private plugin/connection. No UI or authentication scope changes.

## Cause verified

The 0.3.0 PC relay sends a progress snapshot every three seconds, including identical snapshots. The 0.3.1 hosted service updates `updatedAt` on every report. Its retrieval loop reads Firestore every second and returns early on that timestamp. Thus unchanged health traffic ends a nominal twenty-second wait after roughly three seconds.

## Version 0.3.2

- The hosted service changes the progress timestamp only for a changed snapshot/status. It remains compatible with the installed 0.3.0 worker.
- Ninety-second job leases renew when less than sixty seconds remain. Worker heartbeat and cancellation/answer controls retain their existing polling cadence. Transactions skip unchanged task writes.
- `get_task` uses a document listener, with twenty seconds as the default, zero for an immediate read, and a server maximum of fifty. Lease-only updates do not end the wait. New progress and human input return promptly. Queue expiry and lease loss have independent timers, so a silent worker cannot leave a wait hanging.
- Return, timeout, listener failure, request cancellation and HTTP disconnect remove listeners and timers. The initial listener snapshot covers changes between the initial read and attachment.
- The 0.3.2 PC relay persists a fingerprint only after a successful report, suppresses identical reports across restart, and retries failed uploads. Each new generation has its own claim/fingerprint.

Keep ordinary ChatGPT guidance at twenty seconds until fifty-second calls have been checked through that actual client. A Firestore listener does not itself resume an ordinary chat. OpenAI's [MCP Events documentation](https://developers.openai.com/plugins/build/mcp-events) currently lists Work chats/cloud and dots. This release does not introduce that separate integration.

## Verification and release

Both packages build successfully. The hosted package and Windows worker fixture suites pass, including duplicate reports, lease renewal, meaningful changes, approval states, cancellation, terminal states, quiet waits, expiry, attach races, disconnect/error cleanup, failed-upload retry and durable deduplication. These are synthetic protocol tests; they do not establish an actual ordinary-Chat fifty-second timeout or fresh real-model acceptance.

Release through the existing PTI shared MCP workflow from `main`. Activate the local worker only while idle using its existing windowless scheduled launcher; preserve config, credentials and history. The Velum task was active during preparation, so its worker must not be interrupted for this upgrade. Record deployment and live verification outcomes here before calling the release complete.
