# GTOP runner startup recovery: PTI source lane

## Authority and evidence

Owner-authorized source/tests/RCA in `F:\Workspace\Programs\Independent-Products\PTI` only. Single-agent execution; the concurrent GTOP task owns GTOP-app source, incident notes, consumer changes and real-job recovery. Initial branch was `main` at `da78b3e`, with only pre-existing untracked root `node_modules/`; that directory is preserved. No GTOP-app source or private pairing/auth files were read or changed in this lane.

The owner supplied the 2026-11-01 runtime diagnosis: `sachit-windows` failed `model_unavailable`; SEFPO owns a model-empty dispatcher on 11434, with its user-level `OLLAMA_MODELS` pointing to SEFPO storage, while GTOP Qwen weights remain at `H:\GTOP-Local-AI\models\ollama`. GTOP also pins a retired desktop Codex build. These runtime facts were supplied evidence, not remeasured recovery claims. Earlier incident memory described the same unresolved storage mismatch; no runtime recovery was inferred from it.

Direct source inspection established the PTI defect:

- Initiator 1.1.0's `src/windows.mjs` fetched tags and inspected listeners on 11434, then accepted any model-serving dispatcher without verifying its model-directory/native ownership.
- `src/main.mjs` and `install.ps1` required the worker endpoint to be 11434; `native/NativeLauncher.cs` set the same port even though it correctly passed an explicit model directory when it launched a new dispatcher.
- Thus an already occupied shared port bypassed the explicit GTOP storage startup path. An empty tag list produced `model_unavailable`; changing the global environment or killing SEFPO would be an unsafe repair.
- Existing worker checks relied on a compatibility PID file and, in the common check, PID existence. That did not establish executable identity, handle PID reuse, or detect a running legacy worker when its record was missing.
- PTI did not resolve/pass a Codex path; the GTOP consumer's obsolete build pin therefore needs the documented consumer change, not a secret/config edit by this lane.

## Source repair

1. Add a dedicated explicit loopback endpoint (default 11435), reject 11434/aliases/wildcard/auth/paths, and require the original GTOP model root. Set environment only on the new hidden child; leave machine/user variables and SEFPO untouched.
2. Verify listeners against native host/child PID, executable and creation timestamps plus endpoint/model-root records. Refuse unknown ownership and pre-existing incompatible workers. Scan exact worker main/config arguments even without `process.json`; retain durable mailbox recording, per-user mutexes and coalesce in-flight starts. Native Ollama rechecks port occupancy under its mutex.
3. Retry only transient owned-dispatcher health failures under a 75-second elapsed start budget/45-second dispatcher sub-budget. Emit fixed local actionable diagnostics without exporting private exception text. Model tags do not imply loaded-model/heartbeat/paper readiness.
4. Resolve desktop Codex using a credential-free, version-independent helper. Pass the current executable and helper path through [contract v1](GTOP-RUNNER-CONTRACT.md). Require the GTOP consumer marker and exact endpoint alignment; the consumer must resolve per job and never silently restore its obsolete pin.
5. Preserve the existing gateway/DPAPI identity and windowless native launch. No production auth, UI, other-app source or retired scheduler changes.

## Changed files

All paths below are relative to `tools/local-service-initiator/`:

- `src/gtop-runner.mjs`: endpoint/model ownership validation, credential-free Codex resolver, versioned safe contract, actionable local diagnostics.
- `src/windows.mjs`: owned startup/health, process identity, bounded retries and duplicate prevention.
- `src/core.mjs`, `src/main.mjs`, `package.json`: version 1.2.0, endpoint settings and removal of the shared-port pairing constraint. Worker-specific contract failure is handled on authorized Start, preserving independent polling.
- `native/NativeLauncher.cs`: dedicated endpoint/port conflict checks, worker contract/environment, timestamp ownership metadata. Other capability launch logic is unchanged.
- `install.ps1`: explicit endpoint prerequisite and existing GTOP model-root check; no runtime installation was executed.
- `test/gtop-runner.test.mjs`, `test/core.test.mjs`, `native/test.ps1`: runner failure/retry/identity/contract tests, actual PowerShell parsing with synthetic cmdlets, native endpoint/environment checks.
- `.gitignore`: repo-local `.qa/` build/probe/test artifacts and exact scratch directories.
- `README.md`, `native/README.md`, `GTOP-RUNNER-CONTRACT.md`, this RCA: operational contract, exact consumer handoff and evidence boundary.

## Verification and delivery

- Node 24.22.1 from the existing F-drive runtime: `npm test` in this tool passed all **34** tests. Tests include synthetic process/network cases and actual Windows PowerShell execution with synthetic process/listener cmdlets. They start no real model/controller/Codex job.
- Local .NET Framework compilation and `native/test.ps1` passed. Native probe reported GUI host/console child `consoleWindow:0`, unchanged `Default` input desktop, `createNoWindow:true`, `passed:true`. Artifacts stay in this tool's ignored `.qa/native/`; this is synthetic console acceptance only.
- Read-only invocation of `resolveCodexExecutable()` found an existing installed executable (build folder `22cfb1d302613eae`) without launching it or reading credentials. This is discovery, not GTOP job acceptance.
- Home contract check, installer PowerShell AST parse (without installer execution) and Git whitespace checks passed.
- Required PTI app checks passed using the existing Node 20.13.1 app runtime: `npm test -- --watch=false --browsers=ChromeHeadless` (**107 SUCCESS**, exit 0) and `npm run build` (exit 0). Angular reported nonfatal style-budget warnings in unchanged UI files and an unresolved `F:\assets\styles\pti-home.css` stylesheet reference. Karma reported a browser-teardown warning after all tests passed. UI source was not changed.
- Source delivery uses direct `main` and the existing `.github/workflows/firebase-deploy.yml`; it already runs this tool's test suite. No pipeline/auth/app changes were made. The local GitHub CLI has no session; read-only connected GitHub access was verified instead. The source commit and subsequent push/workflow outcome belong to the owner-facing delivery report and repo-local ignored `.qa/delivery.json`, so CI evidence cannot be confused with runtime installation.

## Permission and runtime gap

The effective write allowlist is this PTI project; installed initiator/GTOP runtime/model locations and Task Scheduler are outside it. No installer, runtime deployment/restart, process takeover, model load, global environment change, real job replay or retired creator activation was attempted. Native build/probe outputs are physically under this PTI repo on F. The installed services still require a legitimately permitted operator, the GTOP consumer migration and real scheduled/heartbeat/job checks in the consumption contract. Existing runtime and paper readiness are unverified by this source delivery.
