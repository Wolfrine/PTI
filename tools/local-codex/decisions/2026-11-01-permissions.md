# Preserve the owner's trusted execution policy

## Evidence and authority

The owner reported unnecessary permissions and incomplete GTOP/PTI delivery and requested correction of the harness and its daily review. The native owner's current configuration and the actual scheduled review turn on 2026-11-01 both resolve `gpt-6.1-sol` / `xhigh`, approval `never`, sandbox `danger-full-access`. The bridge 0.4.0 source instead hardcoded edit jobs as workspace-write/on-request. Its resolved sandbox check enforced that narrower policy.

The seven-day metadata review at 08:01 UTC contained 14 ordinary-work runs (12 then had duration/token observations), nine acceptance runs and 24 unclassified historical runs, with no explicit owner verdicts. One ordinary PTI run, local ID `4f8584ac94dc9344c518da290e296ff7`, was interrupted at its 30-minute bound after 688,985 ms of human wait and an approval request. This is execution evidence, not a claim of owner satisfaction or total token cost. GTOP jobs also reported out-of-root and historical-mode restrictions; their protocol-completed responses did not prove a repair.

A scoped history check on native thread `01a195d4-0b6d-7643-b7a9-6808d9f686f0` found an initial inspect developer message and a subsequent edit sandbox context, without an appended current edit developer message. The worker already supplied `developerInstructions` on resume; simply adding the same field again would not fix that observed history behavior.

The 10:30 IST review occurred before the new failures. Its unchanged/no-change result was correct for the evidence then. The previous candidate threshold of three failed/interrupted runs did not flag the later single substantial approval stall.

## Change and expected benefit

Version 0.4.1 uses Full Access/never for authorized edits and read-only/never for inspections. It validates both resolved permissions plus model/effort before a model turn. On resumption it appends trusted current-mode instructions with the official `thread/inject_items` method after validation. An unavailable or unacknowledged refresh fails before inference. Prompts and historical content are never promoted into developer instructions.

Full Access is runtime permission, not additional task authority or filesystem isolation. Project selection, current user scope, F-drive storage, resource locks, human questions, model/caps and task/generation identity remain intact. Explicitly scoped cross-project/runtime changes still require ownership coordination. Existing active jobs are preserved during installation.

The metadata review now includes observed approval/question counts and new per-generation permission metadata. An interrupted ordinary work run with approval requests, no question requests, and at least five minutes of wait becomes an investigation candidate. Missing old measurements stay unknown. This does not auto-approve a request, classify legitimate human questions as faults, or fabricate owner feedback. The saved daily prompt verifies the actual reviewer's Sol/xhigh metadata and investigates this signal.

Expected benefit: remove policy-induced approval waits and stale inspect restrictions for already-authorized work, and surface a substantial approval stall earlier. No time/token savings or improved owner satisfaction have been measured.

## Checks and risk

The Windows worker suite passed 34 subtests, including 14 MCP integration checks. Added failed cases cover wrong/missing permissions and rejected history injection before inference; prior-success checks cover read-only inspection, human questions, cancellation, task continuation, workspace locks, model refusal and child selection. Native no-inference protocol probing accepted injection with the expected policy.

A real Sol/xhigh acceptance used native thread `01a19627-be31-7b11-a75e-5659981800a9`: first read-only inspection, then a distinct authorized edit job on the same thread. Edit resolved dangerFullAccess/never, refreshed instructions, wrote the exact probe bytes to an authorized sibling path outside its selected project, and completed two commands with zero tool failures and zero approvals. Only disposable F-drive acceptance artifacts were written. The source review against real metadata now identifies the PTI approval-wait interruption. Acceptance probes are not ordinary-work effectiveness evidence.

Main regression risks: broader runtime access accidentally mistaken for broader authority, a runtime dropping instruction injection support, or disruption from upgrading during active owner work. Preserve scope and concurrency ownership, fail before inference on policy/injection mismatch, and install only when idle. Retain the change if the installed live path reproduces acceptance; revise/reject it on a permission mismatch, an edit retaining stale inspection policy, a widened inspection, or failed prior-success checks. Roll back to the previous installed release during an idle window if those conditions appear; do not silently fall back mid-task or cancel other work. Installation/publication/deployment evidence is recorded separately under the F-drive acceptance outputs.
