# Local Codex maintenance releases and self-updates

This is the canonical upgrade path for an existing Windows worker. `install.ps1` without a maintenance manifest is bootstrap only. Keep the same project/module parent, current model/effort, sign-in, configuration and history. Never copy credentials, broaden permissions, alter browser preflight or cancel another job to release a worker.

## Admission fence and external ownership

`start_task`, continuation/history admissions and `claimOne` transact on the same owner Firestore document. Drain writes its `maintenance` fence there: a concurrent admission/claim conflicts and retries against it. New work is explicitly rejected, not silently queued/dropped. Existing running/waiting tasks renew, receive answers, report and finish. Previously queued work makes drain refuse; never cancel it to create an upgrade window. Begin requires a fresh maintenance-aware hosted heartbeat (`maintenanceProtocol:1`, marker timestamp equal to heartbeat timestamp). Host 0.4.6 supports this protocol.

The executor requires every protected hosted task at the same generation and terminal, no other nonterminal jobs, no local relay claims, no live worker lock/PID and all protected worker processes exited. It then seals the fence transactionally. The gate stays closed through stop, pointer swap, heartbeat verification and rollback. Expiry never opens a sealed/unknown install. An idle snapshot is never a lock.

The current path is a **detached owner one-shot, not a scheduled job or polling loop**. `maintenance-detach.ps1` uses documented local [Win32_Process.Create](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/create-method-in-class-win32-process) with hidden/detached/job-breakaway flags and a minimal non-secret owner environment. Windows permits that creation or returns a refusal; no elevation/policy workaround is attempted. The WMI provider owns the child instead of Codex. No persistent WMI subscription, service or scheduler task is created. Frozen WScript → hidden PowerShell → Node verifies the same Windows SID and rejects any Codex/bridge-worker ancestor. Existing owner ADC is used normally through the SDK; no credential/session/environment secret is copied.

Drain/health observations use Firestore owner/jobs listeners, local file notifications and Windows process-handle `WaitForExit`, with one finite maintenance deadline and separate finite health deadlines. No periodic status-query timer. Existing work is never killed on timeout. The existing **PTI Local Codex Relay** lifecycle task is reused only after drain; no new recurring or one-shot scheduler entry is added.

## Release steps

1. Inspect `main`, dirty files, active/queued claims, installed pointer and prior receipt. Preserve unrelated work. Use minimal syntax/build checks and actual runtime observations. No generated tests, fixtures, Playwright/e2e scaffolding, full suites or CI test churn without fresh explicit instruction. Do not weaken required protections.
2. Build the actual worker locally if needed. The target is the existing seven-file build. For 0.4.10, PTI Owner Chrome is disabled by default: verify its configuration returns no MCP injection. Verify the repaired invocation scope by continuing an existing bridge chat, letting its writer exit, then using the same chat through the desktop app for real Chrome control. Do not create a chat merely for verification. Save actual evidence on F:.
3. Commit/push on `main`. No hosted redeploy is needed when the host protocol/schema is unchanged. For this local release use CI skip rather than synthetic suites; never dispatch/rerun Actions just to wait.
4. Stage a new immutable directory under the owner-private installation and an explicit future observation deadline. This bounds the updater, not model execution. Example (replace timestamp with a real future deadline):

   ```powershell
   node scripts/local-codex-maintenance.mjs --action stage --launch-method detached --directory F:\Workspace\Support\LocalCodexBridge\maintenance\0.4.9-release --deadline 2026-11-08T11:00:00+05:30 --routing-evidence F:\Workspace\Codex\2026-11-08\local-codex-049-activation\outputs\routing.json
   node scripts/local-codex-maintenance.mjs --action detach --manifest F:\Workspace\Support\LocalCodexBridge\maintenance\0.4.9-release\manifest.json
   ```

   Run from `tools/pti-mcp`. Stage pins seven target/prior file SHA-256 values/sizes; frozen helpers/routing report; installed stop/launchers; interpreters; Chrome provider files/pointers; source commit; owner; worker PIDs; rollback pointer. The launch pins the entire manifest SHA-256. This is hash integrity, not Authenticode signing. No config/authentication file is copied/replaced. `detach` acquires drain, invokes Windows creation and awaits the external executor's actual acknowledgement. Failed launch aborts only an unsealed drain; sealed/unknown state stays closed for recovery.
5. Inspect `launch.json`, `result.json` and `--action status` / `bridge_status.maintenance`. Require `externalProcessVerified:true`, correct owner/hash and `waiting-for-drain`. **Finish the delivering task.** Do not await activation inside its claim. No additional owner terminal command is needed normally. After actual exit, the executor seals, copies/verifies seven files, disables the existing relay trigger, calls its exact guarded stop script, swaps `active.json`, re-enables/starts that relay and verifies fresh local + hosted heartbeat/listener/version. It rechecks target/provider pins and protected task final states before clearing drain.
6. After task termination, read `result.json` and `bridge_status.lastMaintenance`. Success requires `activated-verified`, the requested observed version, fresh local/hosted heartbeat, listener connected, seven matching files and protected task terminal evidence. Waiting/installing is not activation. The executor records observations independently of the delivering agent's intent. Chrome's separate tab/site consent and gameplay/audio acceptance remain separate.

## Failure / recovery

- `aborted-before-install`: queued work, source/pin change, launch refusal, lost observation or pre-seal deadline. No active task was stopped. Resolve the cause and use a new stage; never reuse a consumed attempt.
- `rolled-back-verified`: failure after sealing restores the exact prior seven-file release/pointer under the fence. Admission reopens only after fresh old-worker local/hosted heartbeat/listener and task evidence. A changed Chrome provider is left intact while restoring the prior worker; rollback does not overwrite it.
- `recovery-required` or crashed executor: keep admission closed. From an external owner terminal, invoke the same pinned helper:

   ```powershell
   powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File F:\Workspace\Support\LocalCodexBridge\maintenance\0.4.9-release\maintenance-once.ps1 -Manifest F:\Workspace\Support\LocalCodexBridge\maintenance\0.4.9-release\manifest.json -ManifestSHA256 (Get-Content F:\Workspace\Support\LocalCodexBridge\maintenance\0.4.9-release\manifest.sha256) -Recover
   ```

   Compare the digest with the original launch receipt first. Recovery validates prior bytes/helpers even if Git HEAD moved. It refuses active claims, another maintenance owner, missing task evidence or unknown gate. Do not delete the fence, force a pointer while admission is open, copy credentials or kill processes by broad names. `--action abort` releases only an untouched unsealed drain. If normal owner authentication is unavailable, preserve fence/pointer/receipts and restore access normally.

The earlier 0.4.8 release used the successful one-time scheduler adapter; its verified receipt is historical evidence. Legacy `--launch-method scheduled` / `--action schedule` remains only for an explicitly requested scheduler run. Default detached stages refuse accidental scheduler execution.

## Compatibility and prior RCA

### Releases that change ChatGPT tools

Worker activation, hosted deployment, plugin publication and the saved ChatGPT connection metadata are separate delivery steps. For a tool/schema change, finish the deployed host checks, publish changed skills under the existing plugin identity, then open that plugin's **Manage → Local Codex Connection → Refresh tools** control. Verify the actual advertised inventory before dispatching from an existing conversation. Do not recreate the connection, change its permissions or create a chat just to refresh metadata.

On 8 November 2026 the existing connection still advertised 18 tools after host 0.4.9 and plugin 0.4.14 were live. Refresh tools changed it to 19, including `continue_desktop_chat`, while retaining the same account, App ID and permissions. A release is not end-to-end verified until the existing ChatGPT conversation invokes the tool, the existing native chat performs the requested action and the completed result is retrieved. A published skill alone does not update a cached tool catalog. Evidence: `F:/Workspace/Codex/2026-11-08/local-codex-repair/outputs/local-codex-refreshed-tools.jpg`.

For these releases, update all existing registered-tool and version expectations in `src/local-codex.test.ts`, `src/oauth.test.ts` and `scripts/verify-host.mjs` together. Preserve the authentication/resource-boundary checks. Native permission authorization may be `null` when an automatic route is available because the destination chat performs those checks; this must not be asserted as a fixed relay denial.

Plugin 0.4.8, hosted MCP 0.4.6 and worker 0.4.9 are separately versioned and compatible: this adapter changes no MCP tool/schema/App binding. **No separate plugin publication is needed** for activation or internal task-scoped Chrome routing. Published skill wording that says “schedule” describes the older adapter; this runbook's current command is `detach`. Do not create/publish another plugin from the worker.

The first two 0.4.8 attempts delivered a build without the shared fence/external executor; each follow-up acquired the claim that made self-restart unsafe. That engineering fix independently activated 0.4.8. The 0.4.9 delivery then deferred under a no-schedules directive. This detached adapter preserves the proven transaction/install/rollback path while removing the scheduler dependency and periodic checks. Future self-updates must arm the actual executor and finish their claim, rather than return another advisory-only deferral.
