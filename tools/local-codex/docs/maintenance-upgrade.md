# External helper release activation

Use this runbook for an owner-authorized Local Codex helper release. Worker, hosted transport and private plugin are separate releases. Source changes, a build, a staged payload or a launched updater do not prove installation.

## Prepare

1. Verify the canonical F: checkout, main revision and dirty ownership. Preserve unrelated work. Inspect effective paths and free space before building. Put dependencies/caches, build payload, release files, receipts and rollback copies on H:.
2. Build the reviewed payload with the repository's current build entry point. Record source revision and exact SHA-256 file inventory. Keep the previous installed release and encrypted configuration/state recoverable. Never expose credential contents.
3. Deploy the matching hosted transport through the existing main pipeline and verify its actual deployed contract. Update the existing private plugin only when authorized, preserving identity, audience, App binding and `.app.json` metadata.

## Activate once, externally

From the canonical PTI repository, stage the reviewed H: payload with:

```powershell
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tools/local-codex/install.ps1 -NoSchedule -InstallRoot H:\LocalCodexBridge
```

`-NoSchedule` leaves the existing scheduled task unchanged. The installer verifies the exact seven-file payload, preserves existing configuration/credential state and records the installed release, source SHA and Node path in `active.json`. Inspect the inventory and pointer rather than assuming the command succeeded. Existing private state must be copied/verified opaquely before switching from another root; this staging command is not a storage migration.

Activate through the reviewed external one-shot operator, outside the delivering native process. Launch it windowlessly with hidden children. Retarget only the existing helper task's action to the verified H: windowless launcher; preserve its principal, triggers and settings. No `Register-ScheduledTask -Force`, replacement task, recurring watcher, drain protocol, admission fence or resource manager. The installer without `-NoSchedule` may update that existing action; it must never create or retime a task.

Preserve actual running native executions and their result observation until native terminal evidence is available. Do not terminate Codex, other jobs or unrelated services. An actual unresolved installation/path/consumer condition is a concrete blocker to report; do not manufacture a global native-chat quiescence requirement.

The external operator verifies the staged file inventory/pointer and starts the helper through the existing windowless launcher. Preserve private authentication, task history and the prior release. If activation cannot complete, retain its exact error/receipt and restore only its own verified pointer/action changes where safe. Do not replay an ambiguously dispatched native request as part of recovery.

## Verify the result

Read the exact installed pointer and payload hashes. Observe fresh local helper status and owner-authenticated hosted status, including the loaded release. Verify a real authorized request and its native terminal result when execution behavior changed. Check actual native model/effort separately: `gpt-6.2-sol/xhigh` is requested, not proven by configuration.

Report source revision, payload inventory, installer receipt, installed release, actual observations, rollback state and unresolved gaps. A successful activation is distinct from publication, practical deliverable verification and owner acceptance.

Earlier drain/fence, module-enrollment, desktop-writer migration and recovery-controller procedures are superseded. Their decision records remain historical evidence. Use only the current reviewed installer interface; do not revive retired commands from history.
