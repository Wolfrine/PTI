# GTOP quiet supervision: plan and acceptance

Owner approved PTI starter source, installed runtime and main-first delivery on 2026-11-02. Single agent. No GTOP/bridge/UI edits or inference. Preserve unrelated dirty Velum/workflow/rules files and running optional services.

## Plan before implementation

1. Measure installed 1.2.0 mailbox publications and inspect scheduler, native process identities and existing worker health/transport files. Confirm the production `assistantJobs` queue has no queued/running/validating jobs before runtime maintenance.
2. Separate local supervision from the remote mailbox. Use cheap local PID/exit-record checks with periodic exact identity verification; expedite confirmed worker stops. Keep a 60-second healthy mailbox heartbeat because the unchanged GTOP contract expires starter availability after 90 seconds. Use 15-second stopped/start/repair polling and bounded failure backoff. Never restart a live, unknown or unhealthy-but-running worker.
3. Persist recovery intent only for an observed owned worker or authorized successful Start. After confirmed absence, require a successful authenticated mailbox round trip before recovery, coalesce launch attempts, and back off failures. Preserve intent across reboot; preserve existing dynamic Codex resolution, dedicated model/port, native mutexes and protected pairing. Accept an owned previous-release host during starter upgrades without rewriting its active runner contract.
4. Add targeted deterministic quiet/recovery/auth/network tests and installed counters. Install the committed version through the existing hidden scheduler, preserve One Piece configuration and service processes, observe a quiet interval, and verify the main deployment workflow.

## Contract and cost boundary

The existing `/worker/service/poll` is a Start mailbox and starter heartbeat, not a free health endpoint. Current GTOP source uses two transaction reads and one write per call (formerly one additional gateway read). A theoretical 15-second cadence is 5,760 calls/day, 11,520 reads and 5,760 writes. A 60-second healthy cadence is at most 1,440 scheduled calls/day, about 2,880 reads and 1,440 writes: 75% lower, excluding startup, acknowledgements, failures and transaction retries. Actual 1.2.0 cadence includes expensive local snapshots and network time, so measure it separately. Zero healthy remote writes would make the unchanged 90-second starter status false; changing that server contract is outside this task. GTOP's own 30-second heartbeat and One Piece polling remain separate.

## Inspected evidence and pre-install checks

- PTI main started at `621878364eae39535143804cc452b53bae1bcbe8`. Existing dirty workflow/rules and untracked Velum work are excluded from this change.
- Installed `1.2.0-7e29cf8`: starter PID 1736; worker PID 29288/native host 8164; dedicated Ollama PID 22240/host 27256; optional One Piece host PID 28296. Physical installation is F, not a junction. Existing Ollama application and model root remain C/H runtime dependencies.
- Scheduler action is `wscript.exe //B //NoLogo` -> `run-hidden.vbs` -> hidden PowerShell `run.ps1` -> F Node. Interactive limited-user logon + one-minute trigger, `IgnoreNew`, per-user mutex, unlimited task lifetime, three one-minute task-failure retries. The repeated trigger reports `0x800710E0` while the original invocation/process remains running; process/publication evidence is required separately.
- GTOP production `assistantJobs` bounded query for queued/running/validating returned `[]`. Existing transport reported both busy flags false, one listener session, zero listener errors; local worker health was available with the model unloaded.
- A 125.359-second installed baseline captured eight distinct `lastPollAt` timestamps (seven new publications); seven complete timestamp gaps averaged 18.69 seconds. Extrapolated baseline is about 4,622 calls/day, 9,245 reads and 4,622 writes. These are cadence estimates, not provider billing measurements. Baseline JSON stays private/local at `.qa/baseline.json`.
- Read-only preflight with the new observer returned `state:running, healthy:true` for the actual installed worker, with one identity scan and no launch.

## Installed acceptance

Source implementation commit: `a4a2271edd136e86e435413fe9d8ec9e2c1eb1df`. Installed via the existing PTI installer at 2026-11-02 10:28:02 UTC as `releases\1.3.0-a4a2271`, preserving the existing F-drive GTOP paths, dedicated endpoint, H-drive model root and enabled One Piece capability. All six installed source modules match repository SHA256 hashes. Node 24.22.1 was reused with the same binary hash; no runtime replacement/download was required.

- PASS: 47 targeted starter tests on Windows/Node 24.22.1; all module syntax checks; installer PowerShell syntax; Home guidance contract; scoped diff whitespace check. The starter has no build script/dependencies. No broad local UI suite or browser checks were needed; the existing main workflow retains its required checks/builds.
- PASS, synthetic: a quiet 24-hour simulation has 43,200 local checks, exactly 1,440 mailbox calls and no starts. Simulated owned-worker death expedites authentication/recovery within the next tick, with concurrent ticks producing exactly one launch. Tests cover durable reboot intent, auth/network loss, bounded failed-launch retries, unknown/live-but-unhealthy processes, restored model health, prior-release dispatcher reuse and current Codex resolution. These do not claim a real PC reboot, forced production worker death, model move or live upgrade experiment.
- PASS, actual scheduler/runtime: new starter PID 27780 launched under the scheduled hidden script; one matching initiator process remained running across minute triggers. GTOP worker 29288/host 8164, Ollama 22240/host 27256, and One Piece host 28296 retained PIDs and creation times. No existing service was restarted. Both independent publications report ready with no error. Recovery intent is durable.
- PASS, synthetic native window probe during installation: GUI host and console-subsystem child both had `GetConsoleWindow()==0`, with the input desktop unchanged. Actual managed service main-window handles are zero. Physical full-screen/game acceptance was not performed.
- PASS, actual 130.344-second quiet sample: local checks +60, actual GTOP mailbox HTTP calls +2, identity scans +4, mailbox failures +0, recovery attempts +0, recoveries +0. Three observed publication timestamps give two full gaps averaging 64.3925 seconds. Starter stayed `ready`, `running`, locally healthy, same PID. `.qa/after.json` and `.qa/summary.json` retain private local measurements.
- A separate 78.727-second transport comparison has GTOP claim calls +0, jobs +0 and listener sessions +0. Busy flags remained false and dedicated `/api/ps` was empty. GTOP's own heartbeat/listener source and bridge were not changed. No paper or GPU inference was requested.

| Starter mailbox only | Calls/day | Estimated reads/day | Estimated writes/day |
| --- | ---: | ---: | ---: |
| Former nominal 15s | 5,760 | 11,520 | 5,760 |
| Measured 1.2.0 cadence extrapolated | 4,622 | 9,245 | 4,622 |
| New healthy scheduled upper rate | 1,440 | 2,880 | 1,440 |
| Measured 1.3.0 cadence extrapolated | 1,342 | 2,684 | 1,342 |

Measured cadence reduction is about 71%; scheduled-rate reduction is 75%. Estimates exclude session authentication, GTOP's unchanged 30-second heartbeat, One Piece, startup/repair/ACK traffic, transaction retries and user activity. These samples are not a day-long provider billing measurement.

Main delivery uses the unchanged Firebase workflow after pushing the implementation and this acceptance record. Its final run/result is checked separately in the delivery response. Unrelated dirty workflow/rules hashes remained unchanged during installation. Remaining boundaries: the existing gateway can retain worker status for up to 90 seconds after heartbeat loss; zero healthy starter writes requires a separate GTOP contract change. Alive model/config faults report unavailable without destructive repair; recovery when storage returns is covered synthetically and remains the existing GTOP health loop's responsibility. Startup verification is not paper-delivery acceptance.
