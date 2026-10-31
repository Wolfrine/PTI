# Velum and usage-monitor native authentication recovery

## Evidence and scope

The October 31 owner-authorized repair continues the incident in `tools/local-codex/AUTH-INCIDENT-2026-10-31.md`. Local Codex 0.3.3 is a separate protected service and is outside this change. Its source, installed configuration, model selection, relay and DPAPI credentials were not changed.

Initial live checks found Velum v2.0.0 reconnecting with an empty active job, no Recovery task, and the usage monitor v1.0.0-78553b4 Ready with last result 1. Firestore job `wfu26NntGmVFnkVMI8rF` remained queued with inputs ready; a bounded running-job query returned no documents. No Velum inference process was present. The existing request is preserved, with no extra image job submitted.

The public native configuration was recovered from the prior successful CI setup artifact under `F:\Workspace\Codex\2026-10-31\local-tools-diagnosis\outputs\native-auth`. A fresh SecureToken request with an intentionally invalid refresh token, no Referer and the dedicated key returned HTTP 400 `INVALID_REFRESH_TOKEN` at 2026-10-30T22:35:09.841Z. This proves native endpoint reachability, separately from legitimate encrypted-session renewal. No raw key or credential is included here.

## Repository changes

- Velum reads only its local `.runtime/native-auth.json`; usage-monitor v1.0.1 packages its dedicated configuration alongside the release. Both installers validate the exact project/key-resource/API-target metadata and retain encrypted identities.
- HTTP 403 authentication failures have distinct key-restriction codes instead of asking for a new login. There is no native browser-key fallback or fabricated Referer.
- The Velum installer registers both tasks even when the Worker task exists. Recovery uses a windowless Windows Script Host launcher, waits for its fixed helper, and returns the real exit result. Firestore still selects only the fixed worker-start action.
- Live usage/Atlas rules checks obtain the existing auth-only key using the existing CI principal and exchange synthetic custom tokens without a Referer. Velum's browser/Picker restrictions remain a separate cloud configuration check. No Firestore rules, IAM or Drive scope was changed.

## Checks and remaining acceptance

Worker/recovery/reference/backfill/native-configuration tests: 29 passed. Monitor tests: 23 passed. Angular headless tests: 100 passed. Home contract, PowerShell parsing, recovery-launcher missing-argument rejection and `git diff --check` passed. One initial Windows launcher test was cancelled before its stdout promise resolved; the isolated rerun and complete rerun passed. No model inference was used by these tests.

The local production build was initially blocked retrieving Google Fonts (`EACCES`), and installer elevation was initially rejected. The owner subsequently explicitly approved the push and Windows installers, and added PTI mobile login to the scope. Commit `18bcf66` was pushed directly to main. [Firebase CI/deployment](https://github.com/Wolfrine/PTI/actions/runs/41178326759) and [shared MCP verification](https://github.com/Wolfrine/PTI/actions/runs/41178326752) both passed, including the production build and native no-Referer rules checks.

## Windows acceptance after approval

- Idle-only maintenance preserved the same pinned anonymous Velum identity and installed both named tasks with `install.ps1 -NoStart -NativeAuthConfig <existing-artifact>`. The one-minute scheduled invocation subsequently published a real v2.2.0 cloud heartbeat with `capabilities.recoveryControl: true`. The Recovery task's real invocation returned 0. No Local Codex process was stopped or changed.
- The existing image request automatically ran on reconnect and failed with `resource-guard` after about 28 seconds while importing Torch. The retained local failure records a guard-triggered `KeyboardInterrupt`; it does not identify which guard condition fired. No extra image request or retry was submitted, no cloud job was canceled/deleted, and resource guards were not loosened. The worker returned to idle and continued cloud heartbeats.
- The monitor installer initially timed out reapplying its inherited DACL across old installed releases. A fresh-directory protection probe passed in 591 ms; the existing root's protected CurrentUser/SYSTEM DACL read in 55 ms and was already exact. The installer now verifies that exact ACL before reusing it, otherwise retaining the existing helper. Six in-memory ACL tests reject extra principals, inherited/incomplete access and a different owner. The DPAPI helper and encrypted credential format are unchanged.
- Installed monitor v1.0.1-18bcf66 refreshed the existing owner session without manual sign-in. Real owner-scoped cloud publications at **2026-10-31T07:03:50.119Z** and **07:08:50.834Z** both reported allowance `ok` and daily `ok`. The first was the install-triggered scheduled invocation; the second was the natural five-minute trigger. Task Scheduler returned 0.
- A test write of the fixed recovery request was rejected by the MCP tool. No request was created and the worker was not stopped for that optional test. Task execution/capability is verified; a full remote-button acknowledgment and start remains a separate acceptance check.

## PTI mobile sign-in repair

The added inspection established browser-key referrer denials for both PTI Hosting origins, while the Velum origin reached Firebase Auth. The cloud setup now appends only `https://pti-app-2ab59.web.app/*` and `https://pti-app-2ab59.firebaseapp.com/*`, preserves every existing restriction/API target/method, verifies exact readback, and probes Identity Toolkit and SecureToken from both PTI origins and Velum with intentionally invalid credentials. Missing Picker/Drive API targets fail instead of being widened. Three idempotency/preservation/probe tests pass.

The real login component now displays busy, canceled/blocked-popup, network and configuration failures for popup and One Tap. Messages contain no raw Firebase diagnostics or credentials. Normal Home and safe sibling-app returns are retained. Angular tests now pass **107/107**. The actual component was built and rendered using a local-only synthetic state harness at 1440x1000, 390x844 and 320x640: ready/busy/error states, disabled repeated taps, accessible feedback, retry and no horizontal overflow. No production auth bypass or owner sign-in simulation was used. See `pti-app/design/login-recovery-2026-10-31.md`.

The first login deployment at `58cefe9` stopped in the cross-app One Piece harness before PTI/Velum deployment: its isolated TypeScript VM omitted the new Angular CommonModule/DestroyRef imports and observable pipe. The harness now provides those boundaries while retaining its before-auth sibling-return assertions. All **85 One Piece tests** pass locally; no One Piece production source changed. [Stopped run](https://github.com/Wolfrine/PTI/actions/runs/41179626133).

At this source revision, the new browser-key/login deployment and its post-deployment HTTP probes still require the existing main pipeline; do not infer those results from local tests. Owner-mobile Google login and Google Picker/Drive upload acceptance remain separate. Local sanitized publication evidence/check logs are under `.velum-qa/native-recovery/`; local rendered evidence is under `.codex-usage-qa/` (both Git ignored). Auth configuration stays local and Git ignored.
