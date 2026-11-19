# Request lifecycle and recovery

The authenticated transport delivers the owner's request to the Windows helper and official native Codex. It records dispatch/progress/questions/results. It does not manage module affinity, desktop handoff, native writers, foreground ownership, checkout reservations or resource scheduling.

## Identity and continuation

- Verify the exact catalog project and authorized source checkout. Preserve unrelated work and coordinate overlapping files through native Codex ownership. Inspect remains read-only; edit requires current owner authorization.
- New work starts a fresh native session. `continue_task` creates a distinct linked request for the selected task's native thread; follow the returned new ID while the original request remains unchanged. `start_task` with an explicit `thread_id` resumes the selected native history. Do not select, rotate or transfer a parent automatically.
- Retain request/task/generation/thread/turn identifiers actually returned. `request_key` fixes exact input identity; an identical retry uses that key and inputs. Optional `work_key` is descriptive only. Changed inputs require a genuinely new authorized request. Deduplication is delivery integrity, not permission for another native execution.
- If dispatch may have happened but its outcome is unknown, reconcile the original operation and native evidence. Never resend uncertain work under a fresh identity. Read-only history failure does not undo dispatch. A stale `interrupted` export without terminal evidence remains unknown.

## Observation and human decisions

- Choose `get_task` waits within the current tool schema. A request timeout does not impose a native execution deadline. Helper heartbeat establishes transport liveness, not task progress or completion.
- `list_codex_threads` and `read_codex_thread` are read-only discovery. Check exact thread/turn IDs, pagination, truncation and omitted artifacts before using history as evidence. Do not rename, archive, organize or move chats through the bridge.
- Forward a genuine `waiting_for_user` question and use `respond_to_task` with the owner's answer. Do not invent permission from elapsed time. Do not ask about routine implementation choices already authorized.
- `cancel_task` requests supported native cancellation. Confirm terminal outcome; report running/unresolved state when stopping is unavailable. Do not infer rollback of edits already made.
- Use `record_task_outcome` only for explicit owner `accepted`, `needs_rework` or `abandoned` feedback on the correct generation. Task completion and silence do not establish acceptance.

## Actual errors and releases

Report a native protocol, writer, authentication, path, model or permission error directly. Native constraints remain platform constraints. Do not bypass an error with another chat, another request key, deleted state, alternate controller or unrelated process stop. Missing browser tools are a stated verification gap, as described in [browser control](browser-control.md).

Worker/helper, hosted transport and plugin releases are distinct. Follow the owning repository's external one-shot activation runbook. Preserve active native executions, exact payload hashes, rollback source and private authentication; reuse the existing windowless helper lifecycle. No new schedule, custom drain/fence or resource manager. Activation requires installed readback and fresh authenticated observations. Source/build/publication alone is insufficient.

Keep source on F: and operational state, temporary work, build outputs, reports and backups on H:. Preserve native/platform-required state. Update the existing private plugin and connection with identity, audience, App binding and `.app.json` metadata unchanged. Leave the independent quota collector untouched.
