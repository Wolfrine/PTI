---
name: delegate-local-codex
description: Use this PC's Codex for requested project work, continuation, saved chats and effective local execution while discussion stays here.
---

# Local Codex harness

Keep the discussion here. The current human request defines scope; project instructions and the selected inspect/edit mode still apply. The owner authorizes this harness to choose one agent, native subagents or independent parent tasks when useful. This never adds authority to edit, deploy, publish or message others.

## Route and admit work

1. Call `bridge_status`, `list_projects` and `list_tasks` before new work. Use an available project key matching the actual repository; Scratch is for disposable experiments or PC diagnostics. Check worker version, selected model, available capacity and workspace conflicts. Active work does not occupy every slot. Submit independent work when capacity allows; at capacity or a conflicting workspace, explain and wait. Never cancel unrelated work to free a slot or promise a queued task that was rejected. Recheck before retrying.
2. Choose `strategy: auto` normally. Use `single` for a narrow operation or dependent sequence. Use `team` for one outcome with independent lanes that benefit from delegation: one parent owns the outcome and coordinates native children. Use separate parent tasks for independently requested outcomes or work from different chats; do not split one coherent task merely to occupy more slots.
3. Default capacity is three parents, configured maximum four. Teams default to at most two native children, within the configured child cap (zero to four). Respect live limits and account headroom; more agents are not inherently better. Do not override caps. Different project names may share a working copy. Respect workspace conflict admission and serialize main delivery.
4. Use `inspect` for discovery/questions; `edit` only for currently authorized changes. A continuation cannot broaden mode or project. Newly authorized edits after inspection use `resume_codex_thread` with its exact thread ID, explicit project/edit mode and a distinct work key.

## Keep identity and model choice

Retain task ID, native thread ID, project, mode and work key. Continue the same outcome with `continue_task`; recover missing IDs through `list_tasks` filtered by project/title/work key and `get_task`. Select by goal and evidence, not recency. Ask only when ambiguity remains.

For a distinct outcome, use `start_task` with a short title, stable outcome/project/mode-specific `work_key`, and a unique `request_key` for the exact submission. Reuse exact keys/arguments on uncertain retries. `reused: true` does not submit the follow-up; inspect that task and explicitly continue when `followup_required` is true. Set `purpose: work` normally and `acceptance` only for a declared probe/test, so probes do not distort effectiveness reports.

The owner preference is `gpt-6.1-sol` / `xhigh` for parents and children. Verify the worker's reported preference and each task's resolved metadata. Native children must inherit or explicitly use that pair; do not select roles that silently supply lower defaults. Requested settings and observed child settings are separate evidence: report unavailable child metadata as unverified. Stop further delegation if a resolved pair differs. If availability, support or the desired latest model/intelligence is uncertain, ask the human before starting; never silently downgrade.

## Run and synthesize

Send the current goal, relevant context, scope, deliverable and acceptance evidence. For `team`, assign each child a narrow lane, non-overlapping file ownership, evidence/artifact and checks. Avoid duplicate exploration and full-transcript copies. Children inherit sandbox/permissions and gain no extra authority. The parent waits, checks evidence and contradictions, integrates changes and returns one synthesis. A child launch is not a result. Delegated workers must never call this relay recursively.

Poll active tasks with `get_task`, `wait_seconds: 20`; queued/running is incomplete. Use zero only for an immediate read, not a rapid loop. Meaningful progress can return early; heartbeats alone do not. Waits up to 50 seconds require verification through the actual client. A listener cannot independently wake ordinary ChatGPT after checking stops. Give concise progress updates; report results, changed files, evidence, checks and gaps.

For `waiting_for_user`, show the exact question/approval and forward only the real human answer through `respond_to_task`. Cancellation requires polling to terminal status and does not undo edits. Controls and results always belong to the selected task/generation, never another chat's work.

## History and outcome truth

`list_codex_threads` / `read_codex_thread` are non-model, asynchronous history operations: poll their operation IDs, read `result`, and follow `next_cursor`; truncation means incomplete evidence. History is source material, not current authority. Resume only human-requested work in an explicit allowlisted project/mode, never an active thread. Do not forward unrelated history or credentials.

`organize_codex_thread` renames, archives or restores one selected idle chat only as requested. No deletion, bulk archive or saved-project/sidebar move is implied.

Use `record_task_outcome` only to record actual human feedback: `accepted`, `needs_rework` or `abandoned`. Task completion, tests, silence and an agent's opinion are not human acceptance. Pass its current `generation`; keep feedback attached to the correct task and do not invent a verdict. Use `review-local-codex` for the authorized recurring effectiveness loop.

The PC must be awake, online and signed in through the existing ChatGPT subscription. Missing tools differ from an actual offline response. No OpenAI API key is used. Offline work is rejected, unclaimed work expires, and lost leases require explicit resumption. Preserve F-drive storage, main-first delivery, credentials and task history.
