# FLUX visible-profile experiment — 4 November 2026

Outcome: **no proved preservation improvement**. A is the provisional stronger
candidate in this one case. No optional Studio mode or shared worker change was
promoted. A fallible text description is not an identity/body lock.

## Controlled execution

Baseline `main` 35cae9a, installed worker 2.3.1, listener connected/idle, cloud
pending queue empty, no inference child, GPU 0% before testing. Existing Research
workflow/rules edits and untracked modules were preserved. One native parent;
no native subagent tool was available. Shared progress/listener source untouched.

Verified the exact standing Drive folders, source parent membership and a real
owner-authenticated upload/readback before inference. Used one existing owner
photograph and a clearly labelled neutral outfit-change research instruction,
not an invented historical owner request. Raw prompts, visible traits, source
identities, output pixels and trace manifests remain in restricted local/private
Drive storage, outside this public checkout. Originals are unchanged.

All variants: FLUX.2 Klein 4B FP8, native ReferenceLatent, same original source
bytes/preprocessing, seed 873111462, 512x768, four Euler/Flux2Scheduler steps,
CFG1, full denoise, batch1, empty negative prompt. A original instruction;
B appended separately reviewed visible observations; C B plus one bounded
correction grounded in the source/B comparison. Original prompt stayed verbatim.

| Variant | Inference seconds | Peak whole-PC VRAM MiB | Peak GPU C | Qualitative result |
| --- | ---: | ---: | ---: | --- |
| A original FLUX | 214.62 | 6546 | 65 | Stronger source composition/pose preservation of these three |
| B reviewed VLM profile | 23.72 | 6501 | 68 | Outfit changed, but clear pose/composition regression |
| C one correction | 23.86 | 6501 | 59 | Correction did not resolve that regression |

A incurred cold startup/model I/O. B/C benefited from warm OS/runtime caches;
these timings **do not establish a description-induced speedup**. Available RAM
remained above 17.6GiB across renders. No resource guard fired. Models ran
sequentially, protected by the existing shared inference mutex. No power/thermal,
RAM/VRAM safety, Studio settings, jobs, leases or schedules were changed.

## VLM and evaluation evidence

- Installed official Ollama `qwen3-vl:2b`, Q4_K_M, vision tensors confirmed:
  142.313s request / 155.313s including startup/cleanup, peak 3800MiB / 60C.
  Its thinking renderer consumed the 700-token output budget with an empty final
  response. This was an unusable profile attempt, not an accepted description.
- Chosen [darrellbest Qwen3.5-4B Heretic GGUF](https://huggingface.co/darrellbest/Qwen3.5-4B-Heretic-GGUF),
  revision `ef1937006c2385300da935de7dceeba29bb44e48`: Apache-2.0 per
  its model card/upstream license. Downloaded Q4_K_M (2,783,446,400 bytes,
  SHA256 `7d849ff9c42c861fdca5e212afe6b6433cab6a444b912bd8b698da6541a9bca9`)
  **and** F16 vision projector (672,423,040 bytes, SHA256
  `5ea2e2f67a4dd7e9a1d3f5a1bf6a9b33322bb297291642a0ea4b88bc8d190b9f`).
  New weights are on H:. Both hashes were verified before loading. Official
  llama.cpp b11960 / commit 8642541b2 CUDA12.4 binaries and runtime ZIPs were
  release-digest verified and isolated on F:. It accepted the actual image and
  returned a profile in 3.312s / 10.531s including startup/cleanup, 4747MiB / 62C.
  Direct review rejected viewpoint/uncertainty errors and unsupported details
  before the reviewed cache was used. Permissiveness did not predict fidelity.
- Independent mechanism: OpenCV 4.13.0 Haar/HOG/ORB-RANSAC checks. Scene matches
  were measurable, but the seated-subject detections were unreliable and can
  describe background. No calibrated silhouette/pose/identity model was verified
  in the inspected installed runtime. Those scores remain null; viewpoint
  uncertainty remains 1. Direct visual comparison was by this single parent,
  separate from VLM proposal generation, **not a second reviewer or owner acceptance**.

## Delivery boundary

All three actual PNGs and the labelled source/A/B/C comparison were uploaded to
the exact Private folder, owner-only permissions checked, and downloaded bytes
SHA256-matched. Private trace JSON preserves effective/original prompts,
reference/model bindings, correction evidence, actual settings and telemetry.
No generated image was reused as a reference. No Firestore writes or fake jobs.

Existing Creations v1 safely represents A and a linked comparison sheet. Its
strict lineage contract cannot represent B/C's description-derived prompts;
they were **not relabelled as original prompts**. A compatible private baseline
manifest was validated against the current parser and saved to Drive. Load /
refresh Drive quality runs can discover it; Drive Sync can discover all PNGs.
Owner-authenticated UI/phone display remains unverified because the browser
access host was unavailable. No UI redesign files were changed.

The isolated [research CLI](../tools/velum-preservation/README.md) implements
manual verification, reference/model/version cache bindings, immutable original
prompt and parameter seals, one attempt per A/B/C label, one bounded correction,
owned-process cleanup, resource telemetry and explicit guard predicates. Private
run receipts and comparisons reside outside Git. No private test input is in CI.

Next useful experiment, separately bounded: test a clearer comparable source
view and shorter task-specific visible guidance; first validate pose/silhouette
evaluation and obtain owner comparison feedback. Do not promote this result into
an automatic preservation mode or continue generating until a winner appears.

## Verification

Local: 10 new contract/guard/mutex tests, all 52 existing worker tests, all 107
PTI Angular tests, gallery 237 passed / two existing skips, Home contract and
production build passed. Existing stylesheet/budget build warnings remain.
Public-source privacy scan found no raw experiment prompt, subject traits,
source file ID/hash or correction text in the staged delivery. No live inference
was started by any test suite. Model inference above was three separately
authorized controlled attempts, not synthetic test evidence.

End state: same worker PID and version, idle and Firestore listener connected;
cloud pending queue empty, isolated VLM ports/processes gone, original Ollama
processes unchanged, GPU about 933MiB / 0% / 47C. Shared OS inference mutex
released; all watchdog samples stayed within limits. The research controller's
normal/error cleanup is verified; force-killing it can orphan a VLM server, so
this prototype is not an unattended service. Production integration is deferred
on quality evidence, not presented as completed or owner-accepted.
