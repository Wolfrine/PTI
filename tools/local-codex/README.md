# Local Codex

Local Codex is a private transport from the existing ChatGPT plugin to a small Windows helper and official native Codex. The existing authenticated PTI connection carries requests, progress, genuine human questions and results. Native Codex owns planning, investigation, implementation, useful subagents, Git, critique and verification within the owner's request.

## Current execution contract

The 0.5.0 source contract replaces the former desktop handoff and resource-management layer. Start a fresh session for a distinct outcome. Give one native lead the objective, acceptance evidence and authorized scope, and keep its planning, review, repair and verification in that thread. `continue_task` explicitly continues a selected task; `start_task` with an explicit `thread_id` selects saved native history. There is no automatic desktop-chat transfer, module-parent selection or rotation. The helper adds no checkout, thread, continuation, writer or foreground reservations, capacity/session/time limits, maintenance fence or resource scheduler. Native Codex and account constraints still apply.

The 0.5.1 helper adds selected-thread native Goal controls and live queue/steer using the installed Codex 0.169.1+ app-server. See [lifecycle and recovery](plugin/skills/delegate-local-codex/references/relay-lifecycle.md) for receipt and execution semantics.

Use `bridge_status` and `list_projects` to verify the current helper and exact source checkout. Submit an authorized `inspect` or `edit` request with stable request identity, then observe that task through `get_task`. `list_tasks`, `list_codex_threads` and `read_codex_thread` provide discovery and read-only history. Use `respond_to_task` for the owner's actual answer and `cancel_task` for an explicit stop request. Record an outcome only when the owner supplies it.

The Windows relay flushes two revisioned copies of its delivery journal. After an interrupted write or a damaged copy, it restores the newest valid checkpoint and retains the damaged file beside the journal. Recovery reconciles exact native receipts for ambiguous offers. If every existing copy is invalid, it stops and preserves the journal for repair.

`request_key` is immutable exact input identity. Identical retries resolve to the existing operation; changed inputs cannot reuse its key. Optional `work_key` is descriptive only and never selects a parent or changes retry identity. When native dispatch may have occurred, an uncertain result remains unresolved until reconciled; never replay it under a new key. A wait timeout ends one status request, not the native task. A native writer/protocol denial remains an actual error: report it without a handoff or alternative submission.

Inspect stays read-only. Edit permission applies only to the current authorized task. Preserve unrelated work, native history, signed-in subscription authentication and required security/deployment controls. The bridge does not authorize publishing, sending messages, credential extraction or unrelated changes.

## Model, browser and evidence

New work requests `gpt-6.2-sol` with `xhigh`. Verify the signed-in catalog and actual native execution metadata. Configuration, a request field, a build or a heartbeat does not prove the model ran. Preserve already-running native executions; report their actual model separately.

Browser/desktop work uses official tools available to the executing native turn and their normal permission checks. A missing tool or actual denial leaves that verification step open. Continue independent work and state the exact omitted check. The owner permits a handoff of an explicitly requested browser action to a designated desktop executor. The current helper has no operation for this handoff. Keep general work in its thread and preserve the browser's site decisions. Use the official browser connection. [Browser details](plugin/skills/delegate-local-codex/references/browser-control.md) and [current limitations](docs/limitations.md) describe the evidence boundary.

Delivery requires actual changed files or artifacts, meaningful runtime observations and native terminal evidence. Transport completion, deployment and owner acceptance are separate claims. Do not create or run synthetic suites, fixtures or QA scaffolding by default; use practical verification and minimal useful syntax/build checks.

## Storage and activation

Repositories and source remain on F:. Operational state, releases, dependencies/caches, temporary work, build outputs, reports and backups belong on H:. Verify effective paths and resolved junction targets before generating outputs. Preserve platform-required Codex state and encrypted credentials. See [storage placement](docs/storage-placement.md) and [storage migration](docs/storage-migration.md).

Worker, hosted transport and private plugin have separate delivery evidence. Build the reviewed source, deploy the host through the existing main pipeline, then activate the helper with the [external one-shot runbook](docs/maintenance-upgrade.md). Preserve active native executions. Reuse the existing windowless helper lifecycle; create no schedule or resource manager. Require exact artifact hashes, installed-pointer readback and fresh authenticated local/hosted helper observations before claiming activation. Source changes are not installation proof.

The plugin source is in `plugin/`. Release 0.5.1 keeps the existing plugin identity, audience, App binding and `.app.json` metadata. Publication must update that existing private plugin and read it back. It must not create a replacement plugin or connection. `connection.json` records the transport contract; credentials remain private and are never part of plugin source.

## Review and history

[HARNESS.md](HARNESS.md) is the compact operating contract. The existing usage collector is independent: leave its schedule, runtime, private data and publication unchanged. Read its current observations only when relevant to an owner decision; do not add collectors, reset consumption or background reviews.

The files in [decisions/](decisions/) preserve historical observations and superseded designs, including module affinity, desktop queues, interactive-QA brokerage, Owner Chrome and guarded drain/fence releases. They are historical evidence, not current instructions. This README, HARNESS and active plugin references define the current contract; a historical tool count, version, path, limit or activation result does not establish current availability.
