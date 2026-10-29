---
name: delegate-local-codex
description: Use when the user wants this PC's local Codex to inspect a project, perform authorized engineering work, run checks, or continue a task while the current ChatGPT conversation remains the discussion surface.
---

# Use Local Codex from a conversation

Keep the conversation here. Delegate the concrete local task, then bring back its evidence and result.

1. Call `bridge_status` and `list_projects`. Match the requested project to an available key. Ask only if several plausible targets remain. Never invent paths or claim the PC is connected from a plugin badge alone. If the tools are absent from the session, report missing ChatGPT tool registration or sign-in; this does not establish whether the PC is offline. Only an actual status result establishes worker availability.
2. Send a self-contained prompt containing the user's goal, relevant context and source references, constraints, requested deliverable, and verification criteria. Only forward information needed for this task. Do not forward credentials or unrelated chat history.
3. Call `start_task` with a unique stable `request_key`. Reuse that same key and same arguments if a call times out or its outcome is uncertain. Use `inspect` for questions, review, diagnosis, planning, and discovery. Use `edit` only when the human requested implementation or file changes. Mode cannot change on continuation; start an edit task when separately authorized.
4. Keep the returned task ID. Call `get_task` with `wait_seconds: 20` while queued or running. Give concise progress updates. A queued task is not a finished task.
5. If `waiting_for_user`, show the exact question or approval scope. Send `respond_to_task` only after the human answers. Never infer an approval, invent answers, or broaden a permission. Approvals apply to the single displayed action, with no persistent approval rule.
6. On completion, summarize the actual returned result, files changed, checks, and remaining limitations. Clearly attribute this to local Codex. If failed/interrupted, state the reported cause. Do not claim deployment or acceptance without evidence.
7. Use `continue_task` to carry authorized follow-up into the same bridge-created thread and project; give each distinct follow-up a fresh request key. `cancel_task` requests cancellation; poll the terminal status. It does not undo edits.

The bridge cannot read arbitrary existing Codex conversations. It only exposes task IDs it created. It uses the PC's existing ChatGPT subscription sign-in and configured Codex model. No OpenAI API key is used. Normal web/mobile chats call the hosted PTI job relay; an outbound worker on the PC executes tasks and returns results. The PC must be awake, online and signed in. If unavailable, report that and stop: do not queue work for later or suggest an API key. Unclaimed requests expire. A lost worker lease interrupts the job; continue only when the human requests resumption.

Respect project instructions and the user's F-drive storage and main-first delivery rules. Inspection does not authorize edits, deployment, messages, or scheduled-job changes. Never invoke this bridge from a delegated worker recursively.
