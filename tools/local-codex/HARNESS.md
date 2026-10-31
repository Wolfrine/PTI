# Local Codex harness

Owner instruction, 2026-10-31: provision effective local Codex use through the existing plugin; choose independent agents or a parent with subagents as useful; periodically analyze actual usage and improve the harness. This applies to the Local Codex plugin/runtime. It does not authorize unrelated product changes or override a task's scope.

## Execution contract

- Use one parent for a narrow task or serial dependency chain (`single`). Use one synthesizing parent with native subagents for one outcome with independent evidence or implementation lanes (`team`). `auto` lets the parent choose the smallest useful topology. Distinct user outcomes/chats can run independent parents concurrently.
- Start with three parent slots and at most two children per parent. This is a bounded starting policy, not a measured optimum. A single task still owns one slot while awaiting human input. Each job retains its own generation, native thread, lease, approvals, cancellation, progress and result. No task may consume another task's controls or be cancelled to free capacity for unrelated work.
- Admission is atomic and counts queued and claimed work. Full capacity or conflicts reject the new request without queueing it. The nearest physical Git working copy is the file resource; aliases, nested projects and case differences cannot bypass exclusion. Concurrent inspections are allowed. An edit excludes other reads/writes in the same/nested resource. Native thread reuse is exclusive. Do not automatically create worktrees/branches. Shared deployments and external resources still require explicit task ownership.
- All parents and children use the owner's current `gpt-6.1-sol` / `xhigh` preference. Check live catalog support and resolved metadata. Unknown child execution details remain unknown. Stop on an observed mismatch or reroute; ask the owner rather than using a lower model or effort. A role file must not quietly override the pair.
- Children receive narrow lanes, non-overlapping file ownership, output contracts and checks. They inherit parent permissions, cannot recursively use the bridge or spawn a further layer, and cannot expand scope. The parent waits, reviews contradictions, integrates and returns the outcome. A launch alone is not evidence.
- Preserve F-drive source/state/report placement, existing ChatGPT subscription and Firebase owner authorization, main-first delivery, pending human decisions and native chat history. Install/deploy the hosted protocol before upgrading an idle worker.

## Effectiveness loop

The daily 10:30 Asia/Kolkata heartbeat runs the deterministic seven-day review documented in README. The review uses owner-scoped bridge metadata and bounded per-generation local telemetry. It records timing, human-wait time, command/tool failures, child activity and selected settings, with latest-response token observations when available. It omits prompts, final answers, command text/output, credentials and unrelated chats. It excludes declared acceptance probes from ordinary-work metrics. Older missing fields remain unknown.

`record_task_outcome(task_id, generation, outcome)` records only an explicit human `accepted`, `needs_rework` or `abandoned` verdict for that completed generation. Silence, successful execution, passing tests and a deployment are not acceptance. Owner-scoped outcome history is bounded and generation-bound. The private worker review endpoint returns sanitized metadata only. Account-wide allowance is headroom, never task attribution.

The report separates ordinary work, acceptance probes, missing coverage and observational comparisons. Initially there is no basis to claim that this harness reduces time/tokens or improves owner outcomes. Admission rejection/retry counts and full-generation token cost are not yet measured. A review with sparse or unchanged data records no change.

For a repeated, supported problem or explicit durable owner instruction, promote at most one bounded improvement per review. Record the evidence and sample size, hypothesis, smallest change, expected benefit, regression risk, failed-case and previous-success checks, actual result, retain/revise/reject decision and rollback condition. Substantial changes get an independent review when available. Preserve the existing source/release process and guarded plugin identity; verify affected live behavior. Do not auto-change models, auth, permissions, unrelated products/global rules, or raise parent/child caps above the approved defaults. Keep rejected/retired candidates with concise reasons rather than growing instruction noise.

## Initial evidence and acceptance

The inspected pre-harness baseline had 29 task records: 24 completed, four interrupted and one failed. Eleven had continuation history; nine looked like tests/acceptance by historical labels. Those counts are execution states, not owner satisfaction. No old record had distinct execution timing or token counters, and effort was absent on 24 records. The account monitor was healthy; its totals cannot be allocated to this bridge.

Release acceptance requires fixture fault/concurrency tests plus live overlapping parent tasks, isolated cancellation, same-thread continuation and a bounded native child/synthesis. Scheduler registration/read-back and a real metadata review are separate checks. These establish operation, not long-term effectiveness. Source decisions and release evidence are kept in the F-drive harness outputs; future reviews live under the installed bridge's `harness/reviews` directory.
