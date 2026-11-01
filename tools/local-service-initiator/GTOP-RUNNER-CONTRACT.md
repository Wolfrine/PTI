# GTOP runner consumption contract v1

PTI source lane, 2026-11-01. This is the handoff to the concurrent GTOP harness lane; it does not change GTOP source, private config, installed services or credentials. PTI initiator 1.2.0 requires the consumer below before installation/cutover. No startup/health test is paper-delivery acceptance.

## Configuration and ownership

| Value | Required consumer behavior |
| --- | --- |
| Worker `workerId` | Keep `sachit-windows`. |
| Worker `runnerContractVersion` | Set numeric `1` only after implementing this contract. Missing/older versions fail closed. |
| Worker `ollama` and initiator `ollamaEndpoint` | Identical explicit URL, default `http://127.0.0.1:11435`. Only `http://127.0.0.1:<1024..65535>` is allowed; 11434, aliases, paths and credentials are rejected. |
| Initiator `modelDirectory` | Existing `H:\GTOP-Local-AI\models\ollama`. No machine/user environment mutation, copying, pulling or deleting weights. |
| Worker `model` | Existing exact installed model name, diagnosed as `qwen3.5:4b-q4_K_M`. The starter checks `/api/tags`, never warms a model. |

Port 11434 remains outside this capability. If 11435 is occupied by anything without matching native ownership records, startup returns `port_in_use`. It never adopts an arbitrary Ollama merely because its tags contain Qwen. A different dedicated port is permitted when both configurations agree. A running legacy worker/native host causes a conflict; the starter never kills or restarts it. An idle cutover must be handled under the runtime owner's separate legitimate permissions.

The existing gateway/DPAPI pairing remains unchanged. The installer checks prerequisites before installing; it does not rewrite protected GTOP configuration. Do not run it to bypass the PTI-only allowlist.

## Native launch inputs and consumer obligations

Immediately before worker launch PTI atomically publishes the private, credential-free file `F:\Workspace\Support\PTI\local-service-initiator\data\gtop-runner.json`. Fixed native mode `worker` validates it against initiator/worker settings and supplies:

| Environment variable | Meaning |
| --- | --- |
| `GTOP_RUNNER_CONTRACT` | Absolute path to JSON with `schemaVersion:1`, `id` (SHA-256 identity), `workerId`, `workerConfig`, `ollamaEndpoint`, `modelDirectory`, `model`, `codexExecutable`, `codexResolverModule`. |
| `GTOP_OLLAMA_ENDPOINT` | Same endpoint as the JSON and worker `ollama`; consumer must reject mismatch. |
| `GTOP_CODEX_EXECUTABLE` | Existing desktop Codex executable resolved at start. No app version/hash is embedded in PTI source/settings. |
| `GTOP_CODEX_RESOLVER` | Absolute path to the release's credential-free `src/gtop-runner.mjs` helper. |

GTOP must read and validate v1 at startup, require the matching worker/config/endpoint/model, and use this endpoint for **all** Ollama tags/ps/generation/unload/health calls. Do not fall back to port 11434 when the contract is present or invalid. Reject a malformed contract without launching a job.

For each Codex job, import `GTOP_CODEX_RESOLVER` using `pathToFileURL()` and call its exported async `resolveCodexExecutable()`. The helper only enumerates the current user's `LOCALAPPDATA\OpenAI\Codex\bin\*\codex.exe`, picks the newest existing executable by modification time (stable path tie-break), and tolerates removed update directories. It reads no authentication/config/history and launches no Codex inference. Resolve again for every job so an app update while the worker stays alive cannot leave a stale build pin.

If the helper is unavailable in a compatible older launcher, the consumer may use the contract/environment `codexExecutable` only after verifying it still exists. A failed helper or missing executable must be actionable and must not silently resurrect the obsolete worker-config build path. PTI's v1.2 native launch always provides the helper; it is validated as the sibling release source, and absence fails closed. Consumers started outside PTI should use their equivalent dynamic helper and explicit owned endpoint; they must never mutate global Ollama settings to emulate this contract.

Preserve on-demand behavior: `keep_alive:0`, explicit unload in `finally` and cancellation/error paths, no startup warm-up; model residency comes from `/api/ps`. Codex is launched only for authorized application jobs. The retired two-hour creator stays stopped.

## Health, deduplication and errors

The starter checks the exact configured port, loopback binding, native host/child executable identity, creation timestamps (PID reuse protection), model-directory/endpoint metadata, and exact worker main/config arguments. It scans the matching worker command line even when legacy `process.json` is absent. The native host rechecks port occupancy under its per-user role mutex before creating Ollama. The mailbox attempt record, initiator mutex, native role mutexes and in-flight start coalescing remain in effect. Unknown/busy ownership is a refusal, never a takeover.

One start has a 75-second elapsed budget, including bounded process inspection and native confirmation; dispatcher retry has a 45-second sub-budget. Transient owned-dispatcher failures retry without another launch. Missing installed model, conflicting listener or old worker contract is a terminal actionable failure for that request. No automatic restart, repeated inference or weights download is attempted.

`data\gtop-startup.json` gives a fixed local `reason`/`action` and safe endpoint. `launch_verified` means an owned worker process was observed, **not** a ready heartbeat or completed paper. Existing public failure codes stay `configuration_invalid`, `port_in_use`, `model_unavailable`, `worker_start_timeout`, `start_failed`; private diagnostic text/paths never enter the gateway ACK. `worker-host.json` and `ollama-host.json` add `childStartedAt`, `helperStartedAt`, `ollamaEndpoint`, `modelDirectory`; the worker record also has `runnerContractId`.

## Required runtime acceptance (not performed by this source lane)

1. GTOP lane implements/validates consumption, updates its protected endpoint/version without changing pairing, and confirms no active application work before an authorized cutover.
2. A permitted runtime operator installs this main revision, preserving existing optional One Piece settings. Repository checks do not install the runtime.
3. Check an actual scheduled invocation is windowless, then one unexpired authorized Start request. Verify GTOP owns only its dedicated listener, SEFPO's 11434/PID/environment is unchanged, the fresh GTOP heartbeat is ready, and the dedicated `/api/ps` is empty while idle.
4. Verify one authorized real job resolves the current Codex executable and uses the GTOP endpoint. Preserve original failed jobs/messages; any recovery/requeue belongs to the GTOP lane with ownership/freshness/duplicate-work checks.

The PTI source-only allowlist excludes the installed `F:\Workspace\Support\PTI\local-service-initiator`, GTOP runtime/config, model root and Task Scheduler writes. Installation/restart and real readiness remain unverified until a legitimately permitted runtime operator performs them.
