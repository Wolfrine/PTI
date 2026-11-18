# Source on F:, artifacts on H:

Owner correction, 18 November 2026. This supersedes historical F-only model,
scratch, report and build guidance. Source/Git stays in its canonical F: checkout.
Models, runtimes/SDKs, caches, temporary work, generated assets, builds, reports
and backups belong on H:. Platform-required application state remains protected.

Use H:\Workspace\Caches, Temp, Builds, Models, Runtimes, SDKs, Generated,
Reports and Storage-Recovery. `src/storage.mjs` supplies Windows child-process
defaults while preserving explicit H: overrides. It does not change credentials,
native history, model/effort, project allowlists or permissions. Linux CI keeps
its existing runner-local paths. Native shell settings and user variables must
also be verified; an already running parent can retain its old environment.

Builds retain their existing relative artifact contract through verified H:
junctions. The build entry points refuse an existing physical F: output directory
instead of deleting it. This is a consumer-specific precondition, not a global
filesystem block. Angular's local cache is explicitly on H:. Firebase's relative
`pti-app/dist` contract and Linux CI are preserved.

Before a migration, check the exact resolved source/destination, live processes,
claims, file locks, free space and current consumer references. Inventory without
following reparse points; copy and independently verify every SHA-256; update
consumers; verify their real operation; then release only the authorized source.
Record exact bytes/timestamps and rollback instructions on H:. Stop on access
denial, concurrent changes or an unverified dependency. Never treat copied
source/Git in staging as disposable generated output.

The prior denied PTI Angular-cache removal remains excluded: preserve the F:
original and H:\F-Recovery-20261118-d1464c1a backup/receipt. No alternate shell,
controller, renamed command or permission change may retry that denied action.

The live bridge at F:\Workspace\Support\LocalCodexBridge is a temporary active
state exception: its leases, IPC, encrypted credentials, task history and immutable
loaded release cannot be moved inside their own claim. A later relocation or
worker activation requires the guarded maintenance drain and external one-shot
runbook, exact receipts and fresh heartbeats. Policy source/build is not activation.
Preserve Windows/Codex-managed state in its required platform location.

On 18 November, this repair also received pre-launch `blocked by policy`
responses for the bulk private-plugin source write and the verified Hunyuan
source-release command. Neither command executed; do not retry them in another
form. Copies/configuration are distinct from F: reclamation and plugin release.
The installed worker remains 0.4.14; 0.4.15 is source/build only until a separately
guarded activation can finish after this claim. The published plugin remains
0.4.20. Do not declare system-wide placement/recovery complete from these partial
changes. H: integrity/rollback receipts are under
H:\Workspace\Storage-Recovery\20261118-035cd542.
