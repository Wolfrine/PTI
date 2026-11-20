# Request lifecycle and recovery

The authenticated transport delivers the owner's request to the Windows helper and official native Codex. It records dispatch/progress/questions/results. It does not manage module affinity, desktop handoff, native writers, foreground ownership, checkout reservations or resource scheduling.

## Identity and continuation

- Verify the exact catalog project and authorized source checkout. Preserve unrelated work and coordinate overlapping files through native Codex ownership. Inspect remains read-only; edit requires current owner authorization.
- Distinct work starts a fresh native session. Keep the same authorized outcome on the selected native thread. `continue_task` creates a distinct linked request for the selected task's native thread; follow the returned new ID while the original request remains unchanged. `start_task` with an explicit `thread_id` resumes the selected native history. Do not select, rotate or transfer a parent automatically.
- Retain request/task/generation/thread/turn identifiers actually returned. `request_key` fixes exact input identity; an identical retry uses that key and inputs. Optional `work_key` is descriptive only. Changed inputs require a genuinely new authorized request. Deduplication is delivery integrity, not permission for another native execution.
- If dispatch may have happened but its outcome is unknown, reconcile the original operation and native evidence. Never resend uncertain work under a fresh identity. Read-only history failure does not undo dispatch. A stale `interrupted` export without terminal evidence remains unknown.

## Native Goal and live input

- Use native Goal controls only on the selected task. Get, set (active/paused) and clear return operation IDs. Poll those IDs with get_task. Saved Goal edits run without resuming the thread. Activating a Goal requires an explicitly authorized live outcome and allows Codex to continue natively.
- follow_up_task accepts queue or steer with the exact active_turn_id. A queue receipt includes the native submission and client message IDs. The source task reports an observed successor turn when Codex consumes it. The primary native_turn_id stays fixed. native_terminal_turn_id identifies a successor if it supplied the final outcome.
- Steer never falls back to queue. Interruption can leave native queue entries pending. Inspect the same thread and use explicit official native queue controls when needed. A cold resume can itself dispatch pending input. Reconcile saved active Goals or queued messages on that thread before requesting a new bridge turn. An idle active Goal has no active turn until Codex starts one.
- Follow the original task for execution and human requests. Continue the same saved thread for further work after it settles.

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
