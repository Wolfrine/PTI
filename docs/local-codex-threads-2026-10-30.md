# Local Codex thread continuity and history — 30 October 2026

Owner-authorized update to the existing private Local Codex plugin and PTI relay. Keep ordinary ChatGPT as the discussion surface, reuse Codex context for follow-ups, recover older desktop/mobile work, and reduce prompt-sized titles and unnecessary Scratch threads. Preserve existing owner chats and the plugin/App/OAuth identities.

## Implementation

- Version 0.3.0 adds `list_tasks`, `list_codex_threads`, `read_codex_thread`, `resume_codex_thread` and `organize_codex_thread`, retaining the original seven tools.
- Version 0.3.1 adds actual busy/active-task status and refuses unrelated submissions while the worker is occupied, without storing them. The 0.3.0 worker remains compatible. The live acceptance harness waits for owner work to finish before submitting a probe. This correction followed an observed test request expiring behind a newly resumed owner edit; that request was cancelled by its cleanup and no Codex thread was created for it.
- A stable work key reuses the task for one outcome/project/mode. Reusing a task does not silently submit a new prompt; the caller explicitly continues it. Exact request-key retries still reject changed arguments. The plugin retains identifiers and searches existing work before creating another thread.
- New threads get short `[Project] Outcome` titles and run in the selected allowlisted repository. Inspection remains read-only. Explicitly authorized inspection-to-edit work can resume the same native thread in a new task/authorization record.
- Saved Codex history uses the installed app-server protocol without a model or shell execution. Reads include bounded user/assistant messages, omit tool output/attachments, and return pagination/truncation signals. Historical content is source material, not new authority. Current user intent and project/mode govern resumption.
- Selected idle chats can be renamed, archived or restored. Deletion and bulk archive are not exposed. Existing active bridge tasks are protected, and native thread locks serialize bridge resumes. Native archive behavior may also archive descendant threads; use only for human-selected finished work.
- History operations use the existing owner-authenticated lease queue and return operation IDs polled by `get_task`. Results/receipts remain in the existing private owner storage/runtime. Offline requests are rejected, and old workers cannot accept new operations until upgraded.

## Limits

The installed CLI schema does not expose a saved-project membership mutation. Changing a thread title or resuming it in a selected directory is not a desktop sidebar project move. Current repository context comes from the explicit working directory and its guidance. The recent bridge-task finder filters the newest 100 task records; the native-history finder provides cursors. Work keys are explicit identities retained by ChatGPT, not an automatically supplied ChatGPT conversation ID. The worker uses the existing subscription sign-in, with no inference API key or tunnel.

## Verification

- Worker MCP fixture: 12 protocol checks passed, including stable work reuse, active-thread protection, same-thread resumption, bounded history reads excluding command output, rename and reversible archive. Subscription/environment and Windows atomic-write checks passed.
- Hosted backend: build passed; all 64 tests across seven files passed, including the expanded twelve-tool OAuth/resource boundary, work-key behavior, non-model operation leases and old-worker refusal.
- Real installed CLI: the new no-model history reader found and read the prior normal-Chat acceptance thread `01a187ac-34e8-7f02-b33e-60f96864de13`, including its real marker and visible messages.
- Source `835ebce` deployed successfully through [PTI shared MCP run 41021286071](https://github.com/Wolfrine/PTI/actions/runs/41021286071). The consent wording correction `231563a` also passed [run 41023010605](https://github.com/Wolfrine/PTI/actions/runs/41023010605); the deployed `/consent` page was visually inspected at desktop and 390 × 844 mobile size, with no horizontal overflow. Screenshots are in the F-drive release outputs.
- Plugin 0.3.0 release `pluginrel_6ae44b118cdc8191a2b931165851ae2d` was saved and read back; both manifests' metadata and the required App binding were compared against the prior release and preserved. The private audience is unchanged. [A fresh normal Chat](https://chatgpt.com/c/6ae44b63-b0d8-83e8-a708-5e5d73fa246b), with Chat selected and Work unselected, successfully called the newly registered `list_tasks` tool and the live bridge status.
- The idle-only installer waited for the prior turn to end, installed `releases/0.3.0-20261030075941`, and started the real scheduled WScript launcher. Its 0.3.0 authenticated heartbeat was online at `2026-10-30T08:00:01.083Z`. The owner subsequently continued their prior edit as generation 2; its task/local-thread history was preserved. A runtime on C (`C:\Program Files\nodejs\node.exe`) is an existing installed-binary platform exception; all new source/runtime code/evidence is on F.
- Remaining full live continuity/history acceptance will be recorded when the active owner work allows it. Fixture tests alone do not establish deployed or physical-phone behavior.
