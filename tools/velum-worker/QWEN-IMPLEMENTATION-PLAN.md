# Qwen 2.1 Studio implementation scope

Owner-approved Phase 1, 2026-11-03. This lane changes the worker and shared Studio contract only. The parent owns UI, Firestore rules, commits, deployment, activation and genuine inference acceptance. Existing Research changes and `research-preview.rules.test.mjs` remain untouched.

## Installed evidence inspected before edits

- Worker v2.2.0, PID 18612, creation time 2026-10-31: current local heartbeat reports idle with no active job. NVIDIA snapshot at 16:39 IST: 906 MiB, 0% utilization, 46 C.
- Read-only H engine: `H:\AI-ImageGen\velum-qwen21-research-20261103`; diffusion 7,256,783,064 bytes, Qwen3-VL encoder 6,312,105,364 bytes, VAE 675,509,688 bytes.
- Separate installed Python 3.12.2 environment has PyTorch 2.14.1+cu130. Existing pinned F ComfyUI checkout is `F:\Workspace\Support\LocalCodexBridge\scratch\qwen21-quality-20261103\ComfyUI`, revision `426f5eea52a7ece1dd599fff4cb6cd1f352ddd24` (v0.43.0). The older shared ComfyUI lacks the native 2.1 nodes and stays unchanged.
- Existing trial code uses native `TextEncodeQwenImage21`, `QwenImage21Cache`, explicit encoder/diffusion-family assertions, staged CPU encoding/VAE and disposable offloaded diffusion. Recorded genuine prior runs took 21.41 and 29.01 minutes. Existing Studio 30-minute guard cannot safely describe Qwen readiness.

## Changes

1. Add `qwen-image-2.1`, worker v2.3.0 and schema 4 while retaining schema 2/3 behavior and all older model/reference caps. Schema 4 keeps exact original `prompt`, explicit `effectivePrompt`, optional traceable pose lineage, and up to ten distinct Qwen image references including pose.
2. Add a separate offline Python adapter using the installed Qwen Python/runtime/weights, the existing shared inference lock and no model download or persistent GPU process. Keep RealVis/Realistic and the older ComfyUI engine unchanged.
3. Keep RAM/VRAM/thermal/disk guards. Give Qwen a bounded two-hour inference budget and parent timeout margin; existing models keep thirty minutes. Publish bounded stages/progress without prompt/media in status.
4. Preserve image signatures, SHA-256, per-image 2 MiB / 1024 edge / 1,048,576 pixels / five 600k-base64 chunks; sequential input fetching and actual native conditioning for every accepted image. Keep no-resample markers, exact PNG/result provenance and saved-output recovery.

## Verification

- Node contract tests: 0/1/10/11 Qwen refs, distinctness, role/pose binding, exact effective prompt, cap preservation, legacy and capability gates, chunk validation/recovery, adapter selection and timeout boundaries.
- Python CPU-only tests: request/reference validation, family guards, one native conditioning call with all ten inputs, explicit latent dimensions, exact prompt forwarding, stage/progress and provenance. Compile/import checks without model load.
- Existing worker and gallery contract suites; report failures precisely.
- No GPU inference, queue writes, worker restart/install, model/license downloads or commit in this lane. Source tests do not establish runtime, phone or owner visual acceptance.

## Source acceptance record (16:48 IST)

- Worker suite: 37 passed, zero failures. Gallery suite: 194 passed, two skipped, zero failures (196 total). CPU-only Python `qwen_test` + `media_test`: seven passed. Node syntax and in-memory Python compilation passed. `git diff --check` found no whitespace errors (existing CRLF conversion notices remain).
- Actual `qwenInstalled()` returned true using current asset sizes, exact source revision, native-node source presence, interpreter and installed Torch metadata; no model imported or warmed.
- Parent verified existing credential API privacy checks and bounded cloud active-job reads: no queued/running jobs at 16:43. This lane did not restore credentials concurrently or inspect authentication files.
- Worker remained installed v2.2.0 PID 18612 and idle. At 16:48 NVIDIA reported 0% utilization, 1077 MiB total memory, 48 C. This is a live desktop snapshot, not a Qwen inference measurement.
- Native canvas behavior and per-reference readiness manifests supersede initial fixed-canvas plan: Qwen derives the first reference's native 1024-squared canvas at 32-pixel multiples; reference aspect ratios are limited to 1:8..8:1. Schema-4 queue readiness checks ten per-image immutable manifests instead of attempting up to fifty chunk reads in one Firestore rule evaluation. Worker independently checks each ready manifest and actual bytes.
- Remaining: parent rules/UI integration, required project checks, main delivery/deployment, idle-only activation, actual bounded Qwen reference/pose roundtrip, saved-output/feedback and owner visual acceptance. Ten-reference end-to-end VRAM/latency remains unmeasured; boundary/native-forwarding tests use synthetic fixtures.
