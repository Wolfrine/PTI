# Qwen multi-reference RAM reproduction and cache admission

Single-agent owner-authorized native diagnostic, with image content kept outside
agent review. No source image or original instruction was viewed, captioned or
changed. This record omits instructions, source filenames, file IDs and media.
The requests use newly authored non-sexual everyday-clothing instructions and
the respective original ordered reference inputs. They are diagnostic variants,
not recoveries of the original images.

## Measured four-reference failure

`diag-clothed-4r-20261105-a747ea-1` used the original four-reference set, Qwen Image
2.1, 672x1536, seed 1615481530, 40 Euler/simple steps and CFG 1.0. The new instruction
is 311 characters. Owner-scoped job/input creation used the existing queue, exact
document readback and the normal listener/claim/download/offline inference path.
No recurring Firestore queries were added; monitoring read local diagnostics.

Reference preparation began at 15.531 seconds and instruction/reference encoding
at 129.828 seconds. Native encoding passes took 900.156 and 880.156 seconds.
First-step preparation began at 1912.469 seconds. At 1958.922 seconds the guard
recorded **5,075,075,072 bytes available RAM**, below **5,368,709,120 bytes (5 GiB)**.
No sampling callback completed and no PNG was produced. Cloud terminal state was
`failed/resource-guard` after 1985.925 seconds, including shutdown/publication.

Parent identity matched; all required queries succeeded. GPU query latency at the
trip was 79.117 ms. Peak whole-GPU use was 6406 MiB, peak GPU temperature 62 C,
below the existing 7500 MiB/78 C limits. At the trip, process RSS was 16,134,266,880
bytes and private commit 24,964,829,184 bytes. During first-step prefix preparation,
RSS rose from approximately 2.3 GiB to 15.0 GiB while RAM availability fell from
approximately 17.5 GiB to 4.73 GiB. The worker returned idle/listener-connected;
memory recovered after child exit. This is a measured RAM-floor breach, not a
telemetry timeout, parent failure, GPU limit breach or proof of CUDA OOM.

The original failures had no persisted predicate. Their exact historical causes
remain unproven; this diagnostic reproduces the same first-step failure class
with non-sexual instructions and measures its actual trigger.

## Source mechanism and targeted correction

The pinned native Qwen transformer has 32 layers, width 4096 and BF16 inference.
Its lossless CPU prefix K/V estimate is
`2 * layers * batch * prefixTokens * innerDim * elementBytes`. Reference grids
are flattened directly into the prefix; four native 96x42 grids require about
8 GiB of cache before accounting for model-resident pages and workspace. The
native `ensure_pin_budget` admission reserves its own RAM headroom, which does
not enforce this worker's 5 GiB floor plus future model residency/workspace.
The failure stack was still filling that prefix cache while copying a quantized
MLP weight to the GPU. These source facts explain the observed first-step growth;
the runtime retry must still verify the correction under the real workload.

The worker now admits CPU/default caching only when the complete estimated cache,
model footprint, unchanged 5 GiB floor and a 2 GiB workspace planning margin fit
available RAM together. Otherwise it selects the native `off/default` cache path,
recomputing the same prefix at original precision. No reference reduction, cache
quantization, resolution/seed/model/step change, new checkpoint or guard relaxation
is involved. Smaller jobs keep the cache when its full budget fits. This may
substantially increase sampling time; the original 7200-second limit remains.
Each real sampling callback also gains a local timestamp without more cloud writes.

The planning floor is imported from the existing guard's runtime constant. The
local diagnostic revision is 2; the approved cloud heartbeat version remains 2.3.1
and no rules schema is changed. Original failed jobs and source assets remain
unchanged. Native runtime/checkpoint installations remain read-only.

## Validation boundary

CPU-only deterministic cases cover four/five-reference budgets, boundary equality,
one-reference cache retention, dtype/batch/grid accounting, malformed metadata and
native option/conditioning preservation. A tiny two-timestep test against the
installed native transformer produced zero maximum absolute difference between
cached and recomputed outputs and proved the cache was filled. This is a numeric
fixture, with no reference photograph read and no image generated; it is not an
owner image-quality judgment. The real four-reference retry and, only after its
safe success, five-reference diagnostic are separate runtime acceptance gates.

Private local evidence is under
`F:\Workspace\Codex\2026-11-05\velum-qwen-diagnostic-a747ea\outputs`.
Deployment, retry outcomes, Private saves and remaining gaps must be reported
from their actual readbacks, not inferred from these tests or this source record.
