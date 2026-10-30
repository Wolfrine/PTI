# Velum PC worker

This first pass accepts explicit Studio text-to-image requests through the owner's existing PTI Firebase project. The phone talks outbound to Firebase; it never connects to a PC port. Drive remains read-only. There is no prompt enhancer, hidden suffix, aesthetic correction, content-based negative prompt, automatic gallery save, or image editing mode. The owner is the visual acceptor. Submission requires lawful, consensual adult use.

## Start a finite session

From the PTI checkout on main, run `./tools/velum-worker/start.ps1`. It launches a hidden Node process through Windows Script Host and changes no scheduled task or existing service. Open the local URL in `tools/velum-worker/.runtime/pairing-url.txt` within ten minutes, then click **Sign in to PTI** using the owner account. The separate Firebase session stays only in worker memory, expires when the worker exits, and requests no Drive scope. No monitor credential is read, copied, or repurposed. Pairing listens only on loopback with an unguessable path, exact Host/Origin checks, bounded body and timeout; it closes after successful pairing. No ComfyUI listener exists.

The worker polls every ten seconds for up to four hours, finishing a current bounded job before exit. Close/stop this worker only to end a session; inference watches its parent and releases itself if that parent disappears. A stale `.runtime/worker.lock` after a crash requires checking that its exact PID has ended before removing that one lock. Do not stop other services to recover it. A new session requires a new interactive owner sign-in; no persistent refresh credential is installed.

Studio is enabled only after an owner-authenticated read succeeds and anonymous/other-account reads are denied. A missing rules release fails closed. The cloud namespace is `users/{ownerUid}/velumStudio/workspace`: `status/pc`, `jobs/{id}`, immutable image `jobs/{id}/chunks/{index}`, and `feedback/{id}`. The shared legacy allow excludes `velumStudio`. Job prompt/seed/model/consent are immutable. Claims use Firestore update-time preconditions; interrupted jobs fail visibly and never silently resample.

## Models and resources

Exactly four models are recognized: Z-Image Turbo NVFP4, FLUX.2 Klein 4B FP8, RealVisXL 5 FP16 and Realistic Vision 6 FP16. Installed files and supporting encoders/VAEs must match the byte sizes of the already-tested assets under `H:\AI-ImageGen\portrait-pilot\models`. This is a presence/size check, not a fresh cryptographic weight audit. No models or runtimes are downloaded.

Inference reuses `F:\Workspace\Support\tools\local-image-gen\ComfyUI` and its existing venv. Each job runs offline in a disposable hidden Python process, holds a shared OS inference lock, uses dynamic/offloaded loading, staged Qwen encoding for FLUX/Z-Image and tiled VAE decoding. No inference occurs while idle. Guards require 6 GiB RAM at start, stop below 5 GiB RAM, above 7500 MiB total GPU memory, at 78 C, below 20 GiB H-drive free space, or after thirty minutes. Only the worker's own inference process is interrupted. Sampling failure is never an image-quality verdict.

Prompts pass unchanged to CLIPTextEncode. SDXL/SD1.5 use an empty negative prompt; FLUX/Z-Image use the architecture's zero conditioning. Seeds, sampler, dimensions and settings are retained in each genuine PNG and job manifest. Outputs/cache/temp stay under `H:\AI-ImageGen\portrait-pilot\velum-studio`; source and runtime status stay on F. Model resources are released by process exit after every job.

## Private results and limits

Full original PNG bytes are transferred through owner-only Firestore chunks (600,000 base64 characters each, at most sixteen, 7.2 MB original maximum). Browser preview verifies size, PNG signature and SHA-256 before displaying a blob URL. This bounded first pass uses Firestore read/write/storage quota; drafts remain until explicitly removed. It does not create a public download URL or upload private media to Hosting/GitHub. **Download image** is explicit; gallery save is not implemented. Feedback records Keep/Iterate/Reject and the owner's exact notes; it never changes later prompts automatically.

Queued requests expire after fifteen minutes. Studio distinguishes verified installation, a fresh worker heartbeat, connectivity, active work and errors. The worker must be awake, online, signed in and running; the PWA cannot wake it or start it when stopped.

## Checks

`node --test tools/velum-worker/worker.test.mjs` tests raw text, lifetime/claim state, byte transport and owner/project binding. Rules tests run through the existing One Piece Firestore emulator and the existing Firebase workflow. `node tools/velum-worker/smoke.mjs` is an explicit real local inference test, writes a genuine PNG on H, and never publishes to Firebase. It is not UI QA or phone-to-PC acceptance.

End-to-end acceptance requires the separate PC sign-in, a real Studio submission, genuine returned image, and saved owner feedback. Browser fixtures, tests and a successful deployment do not establish that flow or owner visual approval. Optional image editing remains deferred.
