# Local Codex maintenance releases and self-updates

This is the canonical upgrade path for an existing Windows installation. `install.ps1` without a maintenance manifest is initial bootstrap only. The private plugin, hosted MCP and Windows worker are separate releases; a published plugin does not activate a worker. Keep the current project/module parent and model/effort. Never copy credentials, broaden permissions, cancel unrelated work, or change browser authorization to perform an upgrade.

## Why the previous two attempts stopped

The tested 0.4.8 runtime was delivered without an admission fence or an external executor. Each follow-up acquired the very claim that made immediate self-restart unsafe. The old helper merely checked an idle snapshot and was hardcoded to 0.4.7. Treating that gap as advisory maintenance deferred the actual engineering fix. This procedure closes the shared admission/claim race and schedules the executor outside the worker's process tree, so the delivering task can finish normally and the upgrade can proceed automatically afterward.

## Safety contract

- `start_task`, continuations and history-operation admissions already transact on the owner Firestore record. Their shared admission function now rejects a non-null `maintenance` fence. `claimOne` checks the same record inside its transaction, including previously reserved claims. A concurrent admission/claim and drain conflict on that record and retry; an idle snapshot is never the fence.
- Drain acquisition requires a fresh heartbeat written by maintenance-aware hosted code (`maintenanceProtocol:1` stamped with the heartbeat). Pre-existing queued jobs cause refusal rather than being dropped or allowed to expire during maintenance. Existing running/waiting jobs can renew, answer approvals and finish normally. Read-only status/result operations remain usable. No task, parent or subagent count/duration cap is added.
- Before installation, the external process requires all hosted jobs terminal, each protected task present at the same generation, no local relay claims, and no live local worker lock/PID. It then seals the fence transactionally. New submissions and claims remain blocked through stop, pointer swap, health verification and rollback.
- The staged payload contains exactly seven immutable files, with SHA-256/size checks before and after copy. Helpers, installed stop/launchers, source commit and prior release are pinned too. This is hash integrity, **not Authenticode signing**; the current scripts are unsigned. No authentication/config file is staged or replaced. The existing limited-user, windowless relay scheduled task is reused.
- The updater verifies it has no Codex/bridge-worker ancestor and runs as the same Windows owner. The one-shot is owned by Task Scheduler, not the delivering task. It uses existing administrator ADC through the SDK for the same server-only owner record; it does not extract or copy credentials or introduce another service identity.
- A maintenance observation deadline bounds this one-shot only. It never kills an existing model task when the deadline arrives. Before sealing, timeout aborts drain without installing. After sealing, failure rolls back under the closed fence. A process crash leaves a sticky fence and an explicit recovery route; elapsed time never opens admission during an unknown pointer state.

## Normal release / self-update

1. Inspect repo/branch/dirty work, active claims, installed pointer and existing release evidence. Preserve unrelated work. Change runtime version only when runtime code requires it. Build/test locally for the actual change, including admission/claim race and rollback regressions. Commit once on `main` and push through the existing workflow. Do not dispatch/re-run GitHub Actions merely to wait or to do instructions-only work.
2. If hosted gate code changed, wait for the existing shared MCP deployment/verification to succeed. The operator CLI also refuses drain until the live worker heartbeat proves the maintenance-aware server has processed it. Hosted code is 0.4.6 for this mechanism; the already built worker target remains 0.4.8.
3. Run the operator CLI from `tools/pti-mcp` using a **new physical F-drive stage directory** and an explicit future maintenance deadline. A typical 30-minute observation window is sufficient for a nearly finished delivering task; choose one appropriate to existing work. This window is not a model execution limit.

   ```powershell
   node scripts/local-codex-maintenance.mjs --action stage --directory F:\Workspace\Codex\2026-11-08\local-codex-maintenance-048\stage --deadline 2026-11-08T02:00:00+05:30
   node scripts/local-codex-maintenance.mjs --action schedule --manifest F:\Workspace\Codex\2026-11-08\local-codex-maintenance-048\stage\manifest.json
   ```

   Replace the example timestamp with a future deadline. Staging copies the tested build and frozen helpers, pins the entire manifest SHA-256 in the task action, pins the current commit and preserves the exact prior release/pointer. Schedule atomically acquires drain and registers one limited interactive-owner Task Scheduler invocation, with no repetition and a hidden WScript/PowerShell launcher. Registration failure aborts the still-unsealed drain. No persistent polling service is created.
4. Verify the registered task/action and live `bridge_status.maintenance` (or the CLI `--action status`). **Finish the delivering bridge task.** Do not await 0.4.8 inside the task whose claim must finish; do not launch another model task to perform the switch. Existing jobs are allowed to finish. The external process observes Firestore/local file events with a bounded settling/deadline fallback.
5. The external updater seals after actual exit, copies/verifies the release, disables the existing relay trigger, invokes its exact guarded stop script, atomically switches `active.json`, enables/starts the same windowless task, and checks both fresh local status and the independent hosted worker heartbeat. It records protected task final states and checks seven installed hashes before atomically releasing drain. It removes only its exact owned one-shot task.
6. Read `stage/result.json` and `bridge_status.lastMaintenance` after the delivering task terminates. Success requires `outcome:activated-verified`, observed worker version 0.4.8, fresh heartbeat/listener, seven matching files and preserved task records. A scheduled/waiting/installing state is not activation. Browser/gameplay/audio acceptance remains separate and unavailable without the official Desktop session.

## Failure, recovery and maintenance-window fallback

- `aborted-before-install`: source changed, accepted queued work exists, observation deadline elapsed, or a pre-seal check refused. Nothing was stopped. Drain is released; resolve the cause and use a new stage. Do not cancel another job to make the window fit.
- `rolled-back-verified`: the old pointer/release was restored under the closed fence, the old worker's fresh local/hosted heartbeat was observed, and admission was reopened. Preserve the failed new release and logs.
- `recovery-required` or a crashed helper: keep admission closed. From an **external owner terminal**, run the same staged helper in explicit recovery mode:

   ```powershell
   powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File F:\Workspace\Codex\2026-11-08\local-codex-maintenance-048\stage\maintenance-once.ps1 -Manifest F:\Workspace\Codex\2026-11-08\local-codex-maintenance-048\stage\manifest.json -ManifestSHA256 (Get-Content F:\Workspace\Codex\2026-11-08\local-codex-maintenance-048\stage\manifest.sha256) -Recover
   ```

   Compare the recorded manifest SHA-256 with the original stage/task receipt before recovery. Recovery validates staged/prior bytes even if repo HEAD has since moved. It aborts an untouched drain or, once sealed and idle, restores the old pointer and verifies the old worker before releasing the fence. It refuses active claims, a different maintenance owner, unknown task evidence, or a missing/unrecognized gate. It never treats uncertainty as idle. If host/ADC access is unavailable, preserve the fence, logs and pointer; restore access through normal owner authentication, not credential copying.
- The read-only CLI `--action status` exposes the gate and nonterminal job metadata. CLI `--action abort` releases only an unsealed drain; it cannot open a sealed/interrupted install. Do not delete the Firestore fence by hand to bypass recovery.
- A coordinated manual window still uses this same transaction fence and external helper. The unsupported fallback is an idle check followed by an immediate installer/`taskkill`. Never restore a pointer while admission is open or use broad process-name termination.

## Plugin instructions

The private personal plugin was already published as 0.4.6 from b776b47. This runbook's skill-source update bumps source to 0.4.7; the host owner handles any subsequent update through official Plugin Creator, preserving identity, App binding and audience. Do not publish it again in the worker, create another plugin, or use browser-session credentials. Refresh stale tool metadata rather than creating another native parent.
