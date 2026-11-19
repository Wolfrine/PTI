---
name: delegate-local-codex
description: Use this PC's native Codex for authorized project inspection, implementation and explicit saved-session continuation through the private Local Codex transport.
---

# Local Codex

Use the existing private connection as authenticated transport to the PC helper and official native Codex. Keep discussion in the requesting chat. Native Codex owns planning, useful subagents, implementation or investigation, integration, Git, critique and practical verification within the owner's scope.

## Submit and observe

1. Use ChatGPT directly when its available tools/context can deliver the requested result and evidence. Use native Codex for PC-only work or when local execution materially helps. Read [activity routing](references/activity-routing.md) only when the route, allowance or model decision needs it.
2. Read `bridge_status` and `list_projects` to establish actual availability and the exact authorized source checkout. Inspect existing task evidence when an earlier dispatch may still be unresolved. Do not infer access, completion or installation from a capability label.
3. Start new work with `start_task` in a fresh native session, the authorized `inspect` or `edit` mode and stable `request_key`. Give the lead a compact outcome contract: goal, quality/acceptance evidence, source checkout, essential context, constraints and any owner-supplied deadline/stop condition. Native Codex chooses its execution plan. Use `continue_task` only for explicit continuation of a selected task and follow its returned new task ID; the original request remains unchanged. Set `start_task.thread_id` only when the caller explicitly selects that saved native history. Optional `work_key` is descriptive and never chooses a parent or changes exact retry identity.
4. Request `gpt-6.2-sol/xhigh` for new work. Verify live catalog support and actual native execution model/effort; a configuration field or status heartbeat is not execution proof. Report mismatch or unavailable evidence, preserving already-running work. Never silently substitute a model.
5. Observe the exact task through `get_task` using waits supported by the current schema. A timeout does not stop the native task. Forward meaningful progress, actual errors and genuine human decisions while this ChatGPT turn is active. For `waiting_for_user`, use `respond_to_task` with the owner's actual answer. Treat `cancel_task` as a request until terminal evidence confirms the outcome.
6. Judge delivery from actual output, runtime evidence and the native terminal result. Use read-only `list_codex_threads`/`read_codex_thread` when exact history is needed, respecting pagination and omitted artifacts. Record `accepted`, `needs_rework` or `abandoned` through `record_task_outcome` only for explicit owner feedback on the correct generation.

## Boundaries

- The transport/helper adds no desktop handoff, module-parent affinity or rotation, checkout/thread/continuation locks, writer/foreground reservations, artificial capacity/session/time limits, maintenance fence or resource scheduler. Native Codex/account constraints remain real. Report actual native errors directly.
- Identical retries resolve to the same request. Different inputs cannot reuse its key. When dispatch may have happened, keep the outcome unresolved and reconcile its exact evidence; never replay under a new key. See [lifecycle and recovery](references/relay-lifecycle.md).
- Inspect stays read-only. Edit authority comes from the current request. Preserve unrelated dirty work, credentials, native history and running executions. No publication, deployment, messages or unrelated work beyond the owner's authorization. A worker must never recursively call the bridge.
- Browser/desktop work uses official tools available in the executing turn and normal permission checks. Missing tools or actual denial leave an explicit gap; continue independent work. No automatic desktop-chat transfer, provider installation, browser identity copying or raw CDP/Playwright. Read [browser control](references/browser-control.md) for that work.
- Follow the owner's practical-verification rule: no generated tests, fixtures, mock/QA harnesses or automatic e2e without explicit current authorization. Use real output/behavior and minimal useful syntax/build checks; preserve required protections and minimize CI.
- Keep source/Git on F:. Operational state, releases, caches, builds, temporary files, reports and backups belong on H:. Preserve platform-required application state. Leave the independent quota collector and its schedule untouched; never consume a reset or activate a Goal just to keep working.
- Worker, host and plugin source, publication and live activation are separate. Use the owning repository's existing pipeline and external one-shot runbook, preserving active native executions. Update the existing private plugin; preserve its identity, audience, App binding and `.app.json` metadata exactly.

The PC must be awake, online and signed in. Native execution uses the existing ChatGPT subscription; no OpenAI API key is required. Missing tools/access remain stated limitations, never a promise of an automatic later handoff or wake-up.
