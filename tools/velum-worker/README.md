# Velum PC worker

This first pass accepts explicit Studio text-to-image requests through the owner's existing PTI Firebase project. The phone talks outbound to Firebase; it never connects to a PC port. Drive remains read-only. There is no prompt enhancer, hidden suffix, aesthetic correction, content-based negative prompt, automatic gallery save, or image editing mode. The owner is the visual acceptor. Submission requires lawful, consensual adult use.

## Unattended remote operation

The PC has its own Firebase anonymous identity, separate from the owner's Google login. Its public UID is pinned in `velum-gallery/device-config.mjs` and the security rules by trusted installation. Its refresh token and random 256-bit enrollment grant are stored only in `.runtime/device.dpapi`, encrypted with Windows DPAPI CurrentUser and restricted to that Windows user and SYSTEM. Tokens are never printed, committed, sent to Hosting, or stored as cloud documents. Refresh rotation is saved atomically before the replacement session is used. No monitor credential, browser token, Admin key, Drive permission, public PC port or local browser sign-in is used.

Open Velum Studio on the phone using the PTI owner account and choose **Approve this PC** once. Only the exact pinned device can request this owner-only binding; an unrelated account cannot impersonate it by copying a machine label or grant hash. Pending grants expire after 24 hours and renew automatically; approval does not expire with the grant. Only the owner can revoke or explicitly re-enable the binding. The device cannot approve itself, replace its approved binding or revive a revoked identity. Revocation blocks cloud access immediately and the worker checks during inference at most every 15 seconds, aborting only its own child. Reboots, refreshes and routine network outages require no new owner approval.

Run `./tools/velum-worker/install.ps1` once for installation. It registers only **PTI Velum Studio Worker**, a dedicated windowless native host with an interactive-user logon trigger and one-minute recovery trigger, IgnoreNew, no time limit and a per-user mutex. Idle operation polls outbound every 15 seconds, publishes at most one normal heartbeat per minute and loads no GPU model. Network/auth failures back off up to two minutes and retry without deleting the protected identity. `start.ps1` requests this task; it does not start another login session. No existing task or service is changed.

This non-elevated installation runs while the Windows user is signed in, including a locked screen, and resumes at the next logon. **Powered on but signed out, or rebooted before Windows logon, is not enough.** Pre-logon service startup requires a separate privileged installation and an appropriate protected-secret principal; it is not claimed here. Sleeping, offline or powered-off PCs cannot infer or be woken by the PWA.

The cloud namespace is `users/{ownerUid}/velumStudio/workspace`: `devices/{deviceUid}`, `status/pc`, `jobs/{id}`, immutable `jobs/{id}/chunks/{index}`, and owner-only `feedback/{id}`. Only the owner creates jobs. The approved device can read assigned jobs and publish status/output, never create requests, edit raw prompts/seeds or forge owner feedback. Legacy generic grants reject anonymous accounts and the pinned device UID even after provider linking. A missing rules release fails closed. Claims use Firestore update-time preconditions. Interrupted claims with no valid saved output fail visibly; saved output uploads resume after reconnect/restart without resampling.

## Models and resources

Exactly four models are recognized: Z-Image Turbo NVFP4, FLUX.2 Klein 4B FP8, RealVisXL 5 FP16 and Realistic Vision 6 FP16. Installed files and supporting encoders/VAEs must match the byte sizes of the already-tested assets under `H:\AI-ImageGen\portrait-pilot\models`. This is a presence/size check, not a fresh cryptographic weight audit. No models or runtimes are downloaded.

Inference reuses `F:\Workspace\Support\tools\local-image-gen\ComfyUI` and its existing venv. Each job runs offline in a disposable hidden Python process, holds a shared OS inference lock, uses dynamic/offloaded loading, staged Qwen encoding for FLUX/Z-Image and tiled VAE decoding. No inference occurs while idle. Guards require 6 GiB RAM at start, stop below 5 GiB RAM, above 7500 MiB total GPU memory, at 78 C, below 20 GiB H-drive free space, or after thirty minutes. Only the worker's own inference process is interrupted. Sampling failure is never an image-quality verdict.

Prompts pass unchanged to CLIPTextEncode. SDXL/SD1.5 use an empty negative prompt; FLUX/Z-Image use the architecture's zero conditioning. Seeds, sampler, dimensions and settings are retained in each genuine PNG and job manifest. Outputs/cache/temp stay under `H:\AI-ImageGen\portrait-pilot\velum-studio`; source and runtime status stay on F. Model resources are released by process exit after every job.

## Private results and limits

Full original PNG bytes are transferred through owner-only Firestore chunks (600,000 base64 characters each, at most sixteen, 7.2 MB original maximum). Browser preview verifies size, PNG signature and SHA-256 before displaying a blob URL. This bounded first pass uses Firestore read/write/storage quota; drafts remain until explicitly removed. It does not create a public download URL or upload private media to Hosting/GitHub. **Download image** is explicit; gallery save is not implemented. Feedback records Keep/Iterate/Reject and the owner's exact notes; it never changes later prompts automatically.

Owner requests can queue while an approved PC is offline and expire after seven days. Studio distinguishes approval, verified installation, a fresh worker heartbeat, connectivity, active work and errors. Installation hints survive a stale heartbeat; an offline PC is never presented as online. Work begins automatically when the Windows session is awake and online again.

## Checks

`node --test tools/velum-worker/worker.test.mjs` tests raw text, byte transport, device/project/provider binding, persisted sign-in, real Windows DPAPI, interrupted/reconnected output delivery and no-resample recovery. Rules tests cover owner/device isolation, immutable prompts, pending-grant expiry, revoke/re-enable, offline queue expiry and legacy denial. They run through the existing One Piece emulator and Firebase workflow. `smoke.mjs` remains an explicit engine test; the existing successful bounded FLUX smoke is reused as evidence, not rerun for UI QA.

End-to-end acceptance requires the one-time **remote Velum owner approval**, an actual Studio submission, genuine returned image and saved owner feedback. Local interactive sign-in is not part of this architecture. Fixtures and deployment do not establish owner visual approval. Optional image editing remains deferred.
