# Local Codex native sign-in regression

## Confirmed evidence

The scheduled Local Codex worker was running but its last accepted heartbeat was 2026-10-30 17:33:23 UTC. A native SecureToken refresh with its existing encrypted owner credential returned HTTP 403: `Requests from referer <empty> are blocked.` PTI's hosted health endpoint remained healthy. The Codex usage monitor recorded the same sign-in failure starting at 17:34:45 UTC; Velum's installed worker was reconnecting. GTOP and One Piece starter status was fresh and ready through their separate authentication path. This was not evidence that every PTI service or tool registration was down.

The original Firebase public web key was reused by the web application, Picker, Local Codex, usage monitor and Velum worker. Native processes cannot satisfy browser application restrictions through an authentic browser origin.

## Change history inspected

- Native chat `[PTI] Repair Velum Picker key after IAM grant`, thread `01a18dd3-229b-7290-9139-65ae3cfeedb5`, and commit `3e1631214c0d203436e999d6f38daa4f808d02b3`. GitHub run `41098619497`, deploy job `124213427260`, verified API-key restriction additions at 17:30:31 UTC, immediately before native heartbeat loss. The setup retained existing browser restrictions and appended Picker/Drive APIs and Velum/Docs referrers. This establishes the shared-key interaction and timing; it does not establish who originally applied the browser-only restriction.
- `[PTI] Diagnose Google Picker invalid developer key`, thread `01a18d99-fe97-7ea0-a83c-1f4d68d7ace5`, and the existing Drive authorization repair chat `01a18d72-dafe-7500-92f3-47dce2554d68` distinguish Google Drive scopes, Firebase identity, Picker key configuration and owner-device acceptance.
- `2464808b137d19faba951257f8b6aba2274a7670` changed Velum's browser Referrer-Policy to strict-origin-when-cross-origin.
- `06c7299a212e4a5738e4f37cfbfc0807a0426be1` added a Velum browser Referer to synthetic Firebase sign-ins in the Atlas and Personal Harness live-rule checks. Those checks can pass while actual native clients remain broken.
- `391e487a4077fb008aaa538c7ebb934ce171b79c` added guarded Velum remote-start requests and Windows recovery helper. A recovery/start button cannot repair a rejected native Firebase token refresh.

## Focused repair

Local Codex 0.3.3 separates native Firebase Authentication configuration from Velum's browser key, preserves encrypted credentials and task history, and enforces the owner's explicit GPT-6.1 Sol / xhigh preference on new and resumed work. The existing GitHub Actions identity provisions/reuses one deterministic key restricted to Firebase Authentication and SecureToken; it does not change IAM or existing keys. A negative credential probe must reach native SecureToken and receive the expected invalid-token rejection, rather than an API-key referrer rejection. The worker must then prove a real authenticated heartbeat and subscription model turn.

## Follow-up scope for the Velum conversation

After Local Codex acceptance, migrate the usage monitor and Velum native worker to an appropriate native Firebase auth key through their owning configuration/installers. Keep Firebase identity, Drive OAuth grants/scopes, Picker browser-key configuration, worker job authorization and model readiness distinct. Replace the spoofed-referrer CI assumption with explicit browser and native authentication checks. Validate the Velum start/recovery path against its real worker, and separately verify owner-device Picker/upload behavior. Do not undo the Drive scope repair, restart unrelated services, widen the original key, or infer phone acceptance from CI.

Live acceptance and release identifiers are recorded in the F-drive diagnosis outputs after deployment. This document records inspected history and intended repair; passing fixture tests alone does not establish restoration.
