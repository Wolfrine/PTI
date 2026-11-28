---
name: delegate-local-codex
description: Browser appearance reviews and Local Codex work. Use when asked to check how an owner-operated site or landing page looks or behaves in a browser, or to delegate Windows project work and follow it through implementation and verification.
---

# Local Codex

For a browser review, read [browser control](references/browser-control.md) before choosing an executor. Start from the requested site, action and visual evidence. Follow the requesting chat’s Browser guidance. Use the private connection when the work needs native Codex or the authorized Windows environment.

For native tasks, check bridge_status and select the authorized checkout with list_projects. Find the existing task or thread for the same outcome before starting fresh. Honor the requested native thread or executor. For PC browser work, send the site, requested interaction and observable outcome to the selected worker and return its observations via get_task.

Give the lead one compact contract:

- **Objective** - what the owner wants to be true.
- **Acceptance** - what actual artifact, behavior or evidence will show it.
- **Scope and constraints** - checkout, inspect/edit authority, relevant source, permissions and explicit stop conditions.

Native Codex owns the plan, useful independent subagents, implementation, integration, Git, critique, practical verification and correction. Use native Plan when helpful. Keep these phases with the same lead. Supervise consequential milestones and relay real owner decisions. Let Codex recover from routine problems within scope and continue independent work when a genuine dependency is blocked.

- Start a distinct outcome with start_task. Use continue_task for feedback, verification or repair in the same saved thread. If starting from an explicitly selected saved thread ID, pass it to start_task. An optional work_key describes work without choosing the thread.
- For native Plan, check get_capabilities for nativePlan. Set collaboration_mode to plan and mode to inspect when starting. Show the completed native_plan and use continue_task on its task for revisions. Wait for explicit owner approval of the final revision, scope and any token budget. Then continue that exact plan task with approved_goal carrying its plan_turn_id, plan_item_id and objective. Use edit only if authorized. Observe the new task with get_task and verify that its native thread ID matches the planning thread.
- During execution, use follow_up_task on the observed active_turn_id. Queue ordinary follow-up for Codex to consume when ready. Steer only to correct the current turn. Observe the operation acknowledgement and the source task's turn evidence.
- With explicit owner authorization, use a native Goal when the outcome needs durable, iterative completion. Use set_goal, get_goal and clear_goal on the selected task. Use continue_task with resume_goal only to resume an authorized saved Goal after its worker settles. Codex owns continuation and lifecycle. Review the Goal status and token counters separately from turn completion.
- Request gpt-6.2-sol/xhigh for new work and verify returned model and effort. Use get_task for meaningful progress, exact native turns, genuine questions and terminal evidence. Forward actual owner answers with respond_to_task.
- Evaluate the deliverable against acceptance. A task or control receipt shows native execution or acknowledgement. Product-quality evidence comes from the actual result. Record accepted, needs_rework or abandoned only from the owner's explicit verdict on the correct task generation.

Preserve exact request identity. Retry identical inputs with the same request_key and reconcile uncertain delivery before any new request. Preserve current authorization, private data, history and active work. Inspect stays read-only. Never recursively call the bridge. Browser work requires its official tools and permission checks. Keep source on F: and runtime/artifacts on H:.

Use [lifecycle and recovery](references/relay-lifecycle.md) for a protocol error or release, [browser control](references/browser-control.md) for browser work and [activity routing](references/activity-routing.md) when model or allowance evidence matters.
