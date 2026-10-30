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

Both packages build successfully. All **78 hosted tests** pass. The Windows worker suite passes its twelve protocol checks and four progress/subscription/state checks. Coverage includes duplicate reports, lease renewal, meaningful changes, approval states, cancellation, terminal states, quiet waits, expiry, attach races, disconnect/error cleanup, failed-upload retry and durable deduplication. These are synthetic protocol tests.

Source **d01bbf984440e1893c6251dc1baaf94d1a8d0507** was pushed directly to `main`. [PTI shared MCP run 41043488143](https://github.com/Wolfrine/PTI/actions/runs/41043488143) passed verification, deployed, and passed the public authentication-boundary check. The existing Firebase classifier/release [run 41043488132](https://github.com/Wolfrine/PTI/actions/runs/41043488132) also passed.

The installer initially refused to stop the active Velum task. After that generation finished, it installed `releases/0.3.2-20261030105246` and started the existing windowless scheduled WScript launcher. The installed relay, worker and server SHA-256 values match the tested bundles. Authenticated live status confirms hosted **0.3.2**, worker **0.3.2**, subscription authentication and a fresh heartbeat. Velum subsequently resumed as generation 2; its ID and context were preserved, and its unrelated edits were left intact.

The scheduled task is Running and publishes results. Its latest repeated-start result is `0x800710E0`; Task Scheduler operational history is disabled, so its reason was not established from events. No scheduler configuration was changed to investigate it. The authenticated heartbeat, installed-release identity and live task progress establish the running worker; a zero terminal scheduler exit is not claimed for this continuous service.

A read-only live OAuth check observed a running real owner task over twelve seconds: visible content and its `updatedAt` timestamp stayed identical while health traffic continued. A separate registered `get_task(wait_seconds:20)` call took **23,540 ms including client/relay overhead** and returned the same running state and progress timestamp. Thus routine reports no longer wake the wait early. No model or test task was started for these checks, and the temporary verification grant was revoked. Evidence and the verification script are under `F:\Workspace\Codex\2026-10-30\local-codex-progress`.

Remaining acceptance limit: fifty-second waits pass protocol tests and are advertised by the deployed server, but have not been verified in an ordinary ChatGPT chat. Keep normal-chat guidance at twenty seconds. No final visual or implementation acceptance of Velum is implied by observing its live run.

## ChatGPT package correction

The first release updated the hosted service and installed worker, while the separate ChatGPT package remained 0.3.1. The owner reported that mismatch. The existing private personal **Local Codex** plugin (`plugins_6ae2fecacc50819182147ace33f8cc3e`) is now published as **0.3.2**, release `pluginrel_6ae4869e7b388191bb14b2a20fa5831e`: [Local Codex](https://chatgpt.com/plugins/plugins_6ae2fecacc50819182147ace33f8cc3e).

Both manifests and the task-completion skill were updated. The skill explains meaningful-progress waiting, the twenty-second default, immediate-read use, the unverified fifty-second ordinary-chat limit, and the absence of an unsolicited ordinary-chat wake-up. Archive validation and source read-back confirmed both manifests' non-version metadata, the default prompt, all five retained files, the required App binding, private visibility and personal scope were preserved. No authentication or connection was replaced. This verifies the saved ChatGPT release; it does not prove that an already-open chat has reloaded its label or instructions.

The partial update archive and preservation/read-back evidence are in the existing F-drive release outputs as `local-codex-0.3.2-update.zip`, `plugin-package-verification.json` and `plugin-release-verification.json`.
