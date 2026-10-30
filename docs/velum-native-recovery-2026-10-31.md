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

The local production build was attempted but blocked retrieving Google Fonts (`EACCES`); the elevated build request was rejected. The reviewed Velum installer was attempted with `-NoStart`, failed protecting the existing runtime directory (`Access is denied`), and stopped before configuration/task installation. Its elevated rerun was also rejected. The task protocol now requests the Windows-user permissions required for installation and live acceptance. No protected credential was read or rewritten by that failed installer.

Pending: main commit/pipeline verification; idle-only Worker replacement with v2.2.0; installed Recovery task/capability and fixed-request acknowledgment; legitimate encrypted Velum and monitor refreshes; two real owner-scoped monitor publications and Task Scheduler result 0. Do not treat fixture results or the native negative probe as proof of those outcomes. Owner-device Google Picker/Drive upload acceptance remains separate.

Local sanitized evidence and check logs are under `.velum-qa/native-recovery/` (Git ignored). Auth configuration remains local and Git ignored. Continue only after the pending runtime permission is granted; never route around the protected-directory denial or restart active inference.
