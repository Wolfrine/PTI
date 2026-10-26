# Local GT Papers service initiator

PTI Home and GT Papers can request **Start assistant** through one authenticated GTOP gateway mailbox. PTI's existing usage collector remains unchanged. This separate starter has no AI inference and no public PC endpoint. It polls outbound every 15 seconds (backs off to 60 seconds after failures). Worker readiness still comes from the worker's own fresh heartbeat; a live starter or an accepted launch never implies that the assistant is online.

The PTI route verifies a Firebase ID token from project `pti-app-2ab59` and the fixed owner's UID. The GTOP route retains its invited-admin and worker-owner checks. Both select only `sachit-windows`; clients cannot send executable paths, shell commands, stop/restart instructions or deployment actions. Server-side requests expire after two minutes. Claimed requests replay until acknowledged; a durable local attempt record prevents a second launch after a crash or lost response. Only enumerated failure codes leave the PC.

## Installation and lifecycle

Run `npm test` here, then `./install.ps1` under Sachit's Windows identity. `-NoSchedule` installs without registering/starting the new task. Installation reuses the existing GTOP current-user DPAPI pairing by reading its private config at runtime, without copying/decrypting credentials into another store or changing any identity/IAM settings.

The installer creates `F:\Workspace\Support\PTI\local-service-initiator` with an owner+SYSTEM DACL, a versioned dependency-free Node release, settings and small local state. An existing Node22+ executable is copied to its F-drive runtime directory and verified by SHA256; no runtime download or global upgrade is needed. The existing installed Ollama application binary remains in its Windows application location. GTOP source/config/model/job files stay at the existing H-drive paths, explicitly permitted by the owner for this release. The model directory is passed explicitly; the stale user-level Ollama storage environment variable is not used.

**PTI Local Service Initiator** runs through `wscript.exe //B //NoLogo` and hidden children. It uses an interactive-user logon trigger plus a one-minute recovery trigger, `IgnoreNew`, a per-user mutex, no wake timer, no saved Windows password and no elevation. The starter stays alive while signed in, including a locked session. It does not launch GTOP automatically: an unexpired authorized Start request is required. A terminated starter recovers on the next trigger. A signed-out, asleep, offline or powered-off PC cannot be started by a cloud button.

On a request, the starter ensures a loopback Ollama dispatcher serves the configured existing model, then starts the fixed controller entry with the existing protected config. Both console programs now run through a tiny Windows GUI-subsystem host with `UseShellExecute=false` and `CreateNoWindow=true`, redirecting their logs. This replaces the detached Node/file-handle launch and the `Start-Process -WindowStyle Hidden` worker path that could flash CMD windows. The host is built locally with the installed Windows .NET Framework compiler; no vendor binary, registry, game, focus or desktop setting is changed. See [native host and deterministic console probe](native/README.md). Each install runs the probe before registering the task. The native hosts retain their child log readers and have per-user role mutexes; the initiator can recover without creating duplicate service processes.

The starter never downloads or warms a model. The existing on-demand adapter loads Qwen for conversation and unloads it afterward. Codex starts only for authorized application jobs. The former paper-generation scheduler remains stopped. A no-console probe establishes process behavior; physical full-screen game acceptance still belongs to the owner.

Use installed `status.ps1` for sanitized task/publication state. A fresh starter heartbeat, actual task invocation, worker heartbeat after a real Start request and an empty Ollama `/api/ps` must be checked separately. Duplicate button clicks, a successful build, fixture renders and a task registration alone are not release acceptance.

To pause the starter, disable this exact task in Task Scheduler. To remove its schedule, stop/unregister only **PTI Local Service Initiator**. Keep private state and the existing GTOP installation until separately reviewed; this tool has no destructive uninstall command. Pausing/removing the starter does not stop a running GTOP worker.

## Verification

`npm test` exercises fixed target validation, expired/unsupported requests, durable-before-launch recording, duplicate/replay prevention, interrupted-start recovery, safe failure codes and lost-ack recovery. These are synthetic unit cases. Backend tests in `Wolfrine/gtop-app/assistant-service` cover token/owner authorization, stale status, mailbox expiry, cooldown and server acknowledgements. UI fixtures are labelled and excluded from production entries.

Firebase reads/writes and gateway requests use the existing projects and quotas. This is low-memory control plumbing, not zero database traffic; polling is bounded and model inference is absent while idle.
