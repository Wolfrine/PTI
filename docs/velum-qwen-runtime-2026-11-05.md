# Qwen runtime diagnostics and bounded encoder trials

One-agent implementation in PTI on `main`. This record contains no private
prompt, source filename, reference ID or media. No original request/input document
was changed, no replacement job was submitted, and no image was generated or
uploaded. The original requested image edits were not executed. Recovery of both
images remains incomplete.

## Original failure evidence

Authenticated owner-scoped job reads confirmed the two terminal records, matching
308-character instructions, seed/model/dimensions, different ordered reference
sets, and `resource-guard`. The original source photographs remain unchanged.

| Original job | References | Total | Reference preparation | Multimodal instruction encoding | Recorded sampling phase |
| --- | ---: | ---: | ---: | ---: | ---: |
| `2w3lqvelcuSGpTDKfg4D` | 4 | 2046.868 s | 114.031 s | 1827.008 s | 60.353 s |
| `3TSNHOEz1G0N4kP2CMgL` | 5 | 2539.686 s | 132.465 s | 2268.575 s | 92.729 s |

Neither record supplies a completed step counter or output PNG. The old sampling
label included first-step preparation; it does not prove a completed sampler
step. The exact old guard predicate was not retained and remains unknown.

## Corrections

- Private `diagnostics.jsonl` records each threshold/operator/actual/pass result,
  required-query exceptions and latency, raw RAM/VRAM/GPU temperature/disk space,
  parent PID creation-time identity, process memory/page-fault counters, optional
  allocator peaks and timestamped stages. The first trip is closed to
  `guard-trip.json` before interruption. The parent retains bounded diagnostic
  events and its own timeout reason, and awaits child closure before returning.
- RAM startup/runtime minimums remain 6/5 GiB, F:/H: disk minimums 10/20 GiB,
  GPU memory maximum 7500 MiB, GPU temperature strictly below 78 C, and child
  timeout 7200 seconds. Allocator fraction, reserve, offload protections, CPU
  encoder/FP32 VAE placement and lossless CPU diffusion-prefix cache remain.
  Required-query failure remains fail-closed; supplemental process/allocator
  telemetry failure is recorded without replacing a safety reading.
- An incompletely imported Torch module cannot itself become a false resource
  trip. CPU encoding passes receive ordinal timing records without text/media.
  The local-only worker status identifies diagnostics revision 1; the approved
  cloud heartbeat/package version remains 2.3.1, requiring no rules change.
- Existing stage keys describe reference-plus-instruction encoding and first-step
  preparation. Sampling starts on the first positive native sampler callback.
  Local five-second resource sampling, 25-second coalesced publication, bounded
  realtime listeners and request/claim protection are unchanged. No new cloud
  resource-history stream or polling was added.

## Measurements and limits

The installed native CPU encoder was exercised using harmless text only, without
reference inputs, VAE decoding or image sampling. Existing H-drive checkpoints
and the pinned F-drive runtime were read; all new scripts/results are under
`F:\Workspace\Codex\2026-11-05\velum-qwen-runtime`. No checkpoint was downloaded.

The four-thread pilot took 376.485 seconds: imports 41.735 seconds, loading
13.968 seconds, first encoding pass 169.782 seconds, repeated in-process pass
148.141 seconds. Both finite `[1,18,4096]` tensors had the same SHA-256. The warm
pass was 12.7% faster than that process's first pass; this is **not a thread-count
gain, cold-start guarantee, multimodal result or end-to-end job improvement**.
OS file cache was uncontrolled. Peak total GPU use was 1023 MiB, GPU temperature
50 C, minimum available RAM 14.31 GiB; Torch GPU tensor allocations were zero.
No production guard tripped.

Subsequent four- and six-thread comparisons stopped at approximately 160.7 and
53.4 seconds on the experiment's desktop-load heuristic. The six-thread monitor
recorded 94.1% total CPU, 543.8% process CPU across 12 logical processors, and an
estimated 48.8% other CPU use, above its 20% threshold for three observations.
Memory/GPU safety predicates passed. A short checkpoint-free CPU operator probe
reported approximately 0.8–2.4% estimated background CPU use. The cause of the
encoder trial's load difference remains unresolved; no six-thread latency/fidelity
comparison or optimization gain is accepted. Four threads remains the default;
six is only a bounded local experimental environment option.

The diffusion prefix cache is separate from CPU multimodal text/reference
encoding. Its existing native configuration was preserved; a cache setting or
source implementation is not a measured cache hit. Windows swap/page-fault
counters do not establish disk paging traffic. CPU-package temperature is not
available from these probes. GPU first-step peak instrumentation has deterministic
coverage but was not exercised with actual image sampling in this task.

## Validation and delivery boundary

The exact staged candidate was exported for testing, excluding unrelated dirty
Research rules/workflow/preservation changes and untracked Research tests. Checks:
53 worker tests including 12 CPU-only Python contracts, 27 Firestore rules tests,
175 gallery tests, 107 PTI frontend tests, PTI build and Home contract. The initial
gallery run's sole failure was a missing unchanged workflow file in the export;
restoring it and rerunning all ten affected setup tests passed. PTI build warnings
concern existing bundle/style budgets and an unresolved stylesheet location.

Actual Chrome fixture renders were inspected at desktop and phone widths; see
the local evidence directory. They contain synthetic state, no private media or
cloud writes. The accepted Studio identity remains; this is mechanical QA with
no new aesthetic score or owner acceptance. CI/deployment and the idle worker
restart must be verified separately in the delivery result. No output/Drive/Studio
completion or owner visual acceptance is claimed by these checks.
