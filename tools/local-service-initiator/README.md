# Local PTI service initiator

**PTI Local Service Initiator** receives authenticated One Piece start requests through its existing PTI mailbox. It uses the current-user DPAPI worker pairing and the existing windowless, single-instance Windows task.

GT Papers runs through its native Windows host. The initiator skips the retired Papers start mailbox and leaves the native worker lifecycle to its host. Installed `status.ps1` reports the retirement and the independent One Piece status. PTI Home displays Papers readiness from the owner-only Local Infrastructure snapshot.

The [historical supervision record](QUIET-SUPERVISION-2026-11-02.md) documents the prior Papers runner and mailbox. Keep existing private state and native release dependencies while they are in use.

### One Piece start control (1.1.0)

Install with `./install.ps1 -EnableOnePiece` to enable the One Piece capability. PTI Home shows the owner **One Piece home PC** and **Start One Piece** when the companion is offline. Opening Home reads status; it never starts a service. The PC must be signed in, awake and online, with **PTI Local Service Initiator** enabled. Keep this small starter during heavy-process cleanup: it has no inference or media conversion. A completely stopped starter cannot receive a request; its existing minute recovery trigger restores it.

The existing GTOP worker identity authenticates a separate fixed PTI gateway; signed project/worker claims are checked independently from PTI owner tokens. The server-only `_ptiLocalServices/one-piece` mailbox accepts one start action with a two-minute expiry and transactionally deduplicates requests. Commands and paths cannot be submitted. No new pairing secret, public LAN listener, identity or administrator credential is installed. Fresh four-service/HTTPS health determines readiness. One Piece heartbeats continue during startup.

The [2026-11-03 quiet-control correction](ONE-PIECE-QUIET-CONTROL-2026-11-03.md) prepares 30-second server coalescing for unchanged heartbeats while retaining immediate state/ACK/expiry writes and the existing 60-second freshness limit. Prepared initiator source checks health every 15 seconds, polls every 30 seconds while ready and every 15 seconds while stopped, and retains bounded remote failure backoff. Server deployment and installed source activation are separate gates; this source record does not assert either is active. Replayed polls still read the mailbox, and unchanged responses retain the real persisted timestamp.

All managed One Piece starts use the existing **PTI-OnePiece-Companion** task with `IgnoreNew`. Installation changes only its next action to the F-drive windowless native host, preserving triggers, principal and settings. It does not stop a viewer. That host runs the existing `H:\PTI-OnePiece\runtime\launch-current.mjs` with the existing pinned H-drive Node executable. The H-drive companion, cache, protected credentials and media binaries remain operational dependencies, without relocation or upgrade. The existing F-drive launcher and its protected state are active compatibility dependencies.

Existing H-drive admin scripts predate the native task action. For subsequent maintenance use this F repository's `apps/one-piece/companion/scripts/stop-runtime.ps1` and `install-startup-task.ps1`, which validate/preserve the native action and retain legacy compatibility. Previous task action metadata remains in the private F installation for rollback. Neither cloud API nor starter offers stop/restart. The 75-second elapsed start deadline never kills a running service. Profiles, subtitles, cache and Cast are unchanged. `status.ps1` includes separate One Piece publication state. Stopped-companion startup, synthetic console tests and current-viewer continuity are separate acceptance checks.

`npm test` exercises fixed target validation, expired/unsupported requests, durable-before-launch recording, duplicate/replay prevention, interrupted-start recovery, safe failure codes and lost-ack recovery. These are synthetic unit cases. Backend tests in `Wolfrine/gtop-app/assistant-service` cover token/owner authorization, stale status, mailbox expiry, cooldown and server acknowledgements. UI fixtures are labelled and excluded from production entries.

Firebase reads/writes and gateway requests use the existing projects and quotas. This is low-memory control plumbing, not zero database traffic; polling is bounded and model inference is absent while idle.

The required gateway deploy is scoped to `functions:onePieceHost`. Firebase's CLI may warn that the existing CI identity cannot configure generated build-image cleanup. That housekeeping warning does not imply a failed function update; the subsequent live gateway check remains mandatory. No extra IAM role is granted. Registry cleanup remains an administrator follow-up if the warning persists; no seven-day policy is claimed to have been installed.
