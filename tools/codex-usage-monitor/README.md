# Local Codex usage → PTI Home

**UI:** https://pti-app-2ab59.web.app/home, the personal app launcher after Google sign-in. The old CEO/time dashboards are retired; see [current root contract](../../README.md).

This monitor performs no AI inference. Every five minutes it launches the installed desktop Codex package's app-server over stdio, calls `account/read`, `account/rateLimits/read` and supported `account/usage/read`, closes its child, and publishes one owner-scoped document using the Firebase user SDK. It does not parse sessions, conversations or tools. The old PATH CLI is deliberately ignored.

## Setup on Windows

Version 1.0.1 requires the dedicated native Firebase Authentication key configuration produced by `tools/pti-mcp/scripts/configure-native-auth.mjs` through the existing cloud CI identity. Pass the local public artifact to `install.ps1 -NativeAuthConfig <path>`; subsequent upgrades reuse the installed `native-auth.json` and package it beside each release. Do not commit the artifact or use the browser/Picker key. Native requests never send a fabricated Referer. A 403 reports `firebase-auth-key-restricted`, separately from `firebase-login-required`; a valid existing DPAPI refresh credential needs no new interactive sign-in. Credentials and Codex identity binding stay outside versioned releases.

Requirements: your existing Codex desktop login, Node.js20+, npm, Windows Task Scheduler and one interactive Google login to the existing PTI owner account. No service-account key, Windows password, new database or paid service is needed. Existing project/database: `pti-app-2ab59` / `(default)`.

1. Deploy current `main` through `.github/workflows/firebase-deploy.yml`. Its guarded rules release and synthetic real-client privacy checks must pass first. Do not bypass a rules-baseline rejection.
2. From this folder run `npm ci`, `npm test`, `npm run probe`. Probe prints only normalized real allowance readings and the latest source-dated daily token count; it does not publish.
3. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Setup`. Open the printed **localhost** setup URL, then sign in with Google. The one-use setup page accepts only the PTI owner UID and tests anonymous/other-UID denial before saving the credential. It listens only on loopback and closes after success or ten minutes. If Google requires human interaction, complete it in the browser; never paste a token into chat.
4. The installer registers **PTI Codex Usage Monitor** with five-minute and logon triggers. Windows Script Host starts `run.ps1` with its window hidden from creation; launching PowerShell directly with `-WindowStyle Hidden` can briefly flash a console before PowerShell processes that option. The launcher waits for completion and returns the runner's exit code, preserving Task Scheduler's overlap prevention and result reporting. It runs while your Windows account is signed in, including while locked; it does not run while signed out, store a Windows password, or wake the PC. `StartWhenAvailable` catches missed runs after resume/login. The task has a three-minute cap and ignores overlapping invocations.
5. Run `status.ps1` and check Home after a task completion. Verify a second scheduled update; successful installation alone is not a verified reading.

`install.ps1 -NoSchedule` installs a runtime without changing the scheduler, useful for inspection before pairing. Then run installed `setup.ps1`, and rerun `install.ps1` to register the task. For upgrades, rerun the installer from tested `main`; credentials remain outside versioned releases.

## Local files and credentials

Runtime: `F:\Workspace\Support\PTI\codex-usage-monitor\releases\<version>-<revision>`. New installations, upgrades, setup/status/removal commands and direct CLI use default to this F-drive root. The stable `run.ps1` reads its installation's `active.json` and an absolute Node path, so switching repository branches has no effect. `data\credential.json` holds only a current-user-DPAPI encrypted envelope; local account binding and the Firebase refresh token are inside it. The DPAPI/DACL helper is the existing PTI One Piece helper copied unchanged for portable packaging. Directory ACLs allow the current Windows identity and SYSTEM. No credential is committed, logged or placed in a scheduled command line.

`data\runtime.json` contains only normalized snapshots, package/capability metadata and the newest pending snapshot. `events.json` retains at most100 fixed-code outcomes. The script refreshes Firebase tokens through the official Secure Token endpoint, saves rotated refresh tokens encrypted, then continues the user session with `initializeServerApp` and Firestore Lite. No Admin SDK is used by the local collector. Identity/project mismatch stops publication; a revoked session requires `setup.ps1` again.

For an existing `%LOCALAPPDATA%\PTI\codex-usage-monitor` installation, pause its schedule and migrate the complete installation to the F-drive root with its protected ACLs before upgrading. Verify file hashes and retain the same Windows identity so DPAPI remains usable. A compatibility junction may retain the old path; scheduled actions should use the physical F path. Do not discard credentials or assume changing the task path alone moves them. Verify a real publication after re-enabling the existing schedule. Removal also deletes an old compatibility junction only when it points to this exact installation.

Cloud document: `users/5PbKbpGf3AbarNrp6pyqJ5C5Ziu2/codexProjects/codex-usage`. It contains schema/source/version, separate allowance/daily statuses and observation timestamps, normalized allowance windows, at most30 returned daily dates, and a server publication timestamp. It excludes credentials, raw account IDs, credits, earned resets, conversations and tool activity. Published readings are private to that PTI account. The rule excludes the reserved project from the legacy recursive grant; an added owner rule alone would not be sufficient.

## Behavior and recovery

- Normally one write per successful poll:288/day if continuously signed in. No database read-before-write or snapshot history. Repeated identical total failures do not repeatedly publish; successful observations heartbeat even when values are unchanged.
- Prefer multi-bucket rate limits; legacy fallback adds no synthetic windows. Used percentage is source-reported; remaining is clamped to0–100. Missing values remain unavailable. Over100% usage remains visible as reported.
- Daily tokens are dated activity counts, not a token balance. Missing today is not zero, and API date boundaries are not relabeled as local dates.
- Source timeouts have two transient retries. Firebase/network errors have bounded retries; auth errors do not. A150-second overall deadline and the task's three-minute limit bound each invocation. The runner owns a Windows mutex plus a PID lease. If interrupted, the next run recovers a dead lease and kills only a child matching the recorded PID, parent, executable, command line and creation window.
- Restart recovery polls a fresh reading before publishing; it does not replay an older pending reading over newer source data. Last good section values retain their actual observation times on partial failure.
- Home labels stale after15minutes without a successful observation, offline/cached views, unsupported/unavailable data and never-connected state. Reset countdowns run in the browser without database writes; elapsed reset time becomes “Awaiting updated allowance.”

## Checks and removal

`npm test` covers protocol framing/deadlines, real-shape normalization, partial failures, capability reprobe, identity binding, credential renewal, duplicate/dead leases, atomic local writes and fresh-process recovery. Synthetic test values never become real account readings. Shared rules tests run through the existing One Piece emulator command; CI also exercises temporary real Firebase identities and cleans up their synthetic documents/users.

Run `status.ps1` for task timestamps/results and sanitized collector status. To run manually: `& 'F:\Workspace\Support\PTI\codex-usage-monitor\run.ps1' -Command run`. After changing a Codex login or revoking Firebase access, run setup again.

Run `remove.ps1` to stop/unregister only this task and remove the installed runtime, local state and encrypted refresh credential. It checks the absolute target and refuses a junction. It does not sign out the Codex app, revoke other PTI sessions or delete retained cloud readings; those naturally become stale. No actual Windows reboot is claimed unless a release record says it was observed.

See [release verification](../../docs/codex-usage-release.md) for actual installed/deployed status and any remaining access blockers.
