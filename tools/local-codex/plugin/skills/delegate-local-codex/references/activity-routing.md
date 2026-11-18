# Activity routing and native project leadership

Owner operating model, 18 November 2026. Adapt this decision aid to evidence; it is not an automatic dispatcher, numeric quota gate or permission grant. Prefer the least expensive route that can deliver the owner's quality bar with verifiable evidence.

## Decide before contacting the PC

Establish current intent, deliverable, risk/quality bar, actual deadline and forthcoming owner-authorized priorities. Default to ChatGPT when its actual tools and context can complete the work. Length alone, a coding keyword, available quota or an idle PC is not a reason to delegate. Small answers need no PC/usage probe.

| Activity/evidence | Usual route | Reconsider when |
|---|---|---|
| Discussion, explanation, small draft/edit in supplied context | ChatGPT | Native files or rendered/reproducible evidence becomes necessary |
| Connected research, account data, Docs/Sheets | ChatGPT with existing authenticated tools | Required data/compute is PC-only or large local processing materially helps |
| Allowance/routing question | Existing PTI Apps usage read | Native diagnosis is needed for missing/inconsistent collector data |
| Repo implementation, builds, Git, Windows/runtime diagnosis | Native project lead | ChatGPT's connected repo tools can fully deliver with all required checks and less context overhead |
| Substantial uncertain engineering/investigation | Native lead when execution, continuity or native collaboration improves evidence | Existing ChatGPT tools/context suffice, or PC contention outweighs benefit |
| Local GPU, PC files, Windows, desktop Chrome | Authorized native tools in existing module chat | A connected tool here demonstrably provides the exact capability and authorization |
| High-risk or experiential acceptance | Route where real verification can occur | Missing tools/access: report the omitted gate; build/source is insufficient |
| Optional long batch/review | Compare priorities, continuity, readiness and allowance/reset timing | Defer to regular reset when deadline permits; preserve resources for imminent authorized work |

Strong native context can outweigh a theoretical token saving. Avoid repeated discovery and splitting dependent work across chats. Use native subagents for genuinely independent lanes with ownership, integration and checked results when valuable and available. No duplicate parent or lower-model child.

## Existing allowance path

Use PTI Apps `pti_health`, `pti_app_context(appId:"pti")`, then `firestore_get_document` on `users/<authenticated owner UID>/codexProjects/codex-usage`. Canonical app is **pti**. This is collector-owned: ChatGPT reads it, never writes inferred readings. No second collector, credentials, store or schedule. The installed five-minute helper observes; it does not run inference.

- Check source/version, section status, `lastSuccessAt` and observation/publication times. Existing Home freshness contract is 15 minutes. A fresh publication/other section does not refresh an older successful section.
- `allowance.buckets[].windows[]` has source used%, clamped remaining%, duration in minutes and Unix-seconds `resetsAt`. Read the actual duration/bucket; primary need not be short. Do not sum overlapping headroom. An elapsed reset timestamp requires a new reading, not assumed replenishment.
- Collector 1.0.2 adds `allowance.earnedResets`: status, authoritative `availableCount`, observation time, sanitized type/status/expiry details, `detailsComplete` and `earliestReportedExpiryAt`. Missing/null is unknown; known zero is none. Partial details do not establish the earliest expiry among all credits. No opaque IDs, descriptions, account identity or redemption controls are published.
- Earned resets are contingency information, not already-added allowance, paid credit balance or permission to redeem. No automatic consumption; only explicit owner instruction authorizes it. Near-expiry availability may inform a proposal, never gratuitous work or forced redemption.
- Daily/latest dated token counts are activity, not remaining quota or weighted billing. Preserve source dates and missing-today semantics. **Do not infer ordinary ChatGPT Chat allowance from Codex counters.** Separate ChatGPT Work/Codex metering from ordinary chat; inspect the actual surface before shared-limit claims.

Combine freshness/headroom/reset timing with expected effort/duration, risk, machine availability, actual queue/checkout ownership, native continuity, imminent authorized priorities and observed effectiveness. Low headroom may favor an adequate ChatGPT route or postponing optional batches; it cannot make PC-only work possible in ChatGPT. Unknown headroom is disclosed uncertainty, not zero or a reason for repeated owner prompts. Do not invent token predictions or a universal usage-% threshold. A task near a regular reset need not consume an earned one.

Use existing scoped effectiveness evidence and explicit owner feedback. Completion is not acceptance. Latest-response counters omit work and can overlap: no full-task cost conversion or claimed savings from them. Missing/stale coverage remains unknown. Adapt from repeated actual outcomes, without a new schedule or speculative score.

## Intent handoff and native ownership

Use the main skill's compact outcome contract and same-parent lifecycle; steer an existing task only for material new constraints. Native leadership owns the plan and integration without expanding authority.

For admission, exact parent/turn identity, bounded `get_task` waits and nonterminal recovery, follow the main delegation skill and its [relay lifecycle](relay-lifecycle.md). Keep supervision active only during the current ChatGPT turn; do not imply a later automatic wake-up.

## Verified model and Goal boundaries

On 18 November, installed signed-in Codex 0.166.0-alpha.5.1 `model/list` returned `gpt-6.2-sol` and `gpt-6.2-astra`, both with `xhigh`. The owner subsequently authorized migration: **default `gpt-6.2-sol/xhigh` for new bridge work; explicitly select `gpt-6.2-astra/xhigh` for the hardest reasoning/engineering when justified.** This dated catalog evidence supports compatibility, but does not prove Windows configuration, already-running work or existing native desktop chats have migrated. Production selection must recheck the current live model/effort catalog and the returned start/resume selection.

Choose Sol for everyday or multi-step work, Astra for unusually demanding integration, uncertainty or quality work, using real allowance, reset timing, priorities and effectiveness evidence rather than invented cost weights or a universal quota threshold. A model choice is per outcome, not an automatic response to a low token counter. Queue prompts inherit the desktop chat's current model and cannot silently set it; migrate such chats through supported native model controls, preserving their IDs/history. Parent and children must use the explicitly selected verified pair. Never downgrade, upgrade or override without authorization and real model evidence.

The same native parent accepted a finite official `create_goal` → `get_goal` → `update_goal(complete)` → inactive readback, with no continuation loop and zero Goal-accounted tokens. Documented `thread/goal/get` also worked. Sending `/goal` as queue text was **not verified** and must never be described as activation.

Prefer ordinary native lead execution for routed work. Goals require explicit owner intent, measurable finish/verification and stopping conditions; use an owner-supplied budget only when actually supplied. Native Goal control is distinct from relay support: 0.4.13/0.4.14 handoffs track the matching native **turn**, not every later Goal continuation. Until Goal-aware terminal supervision is implemented and observed, do not select a multi-turn Goal for a relay-supervised job or equate `get_task: completed` with Goal completion. Never leave an autonomous Goal running as a pilot or evade permission/allowance/writer ownership with it.

Official references: [app-server fields/Goal API](https://learn.chatgpt.com/docs/app-server), [Goals](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex), [GPT-6.2 launch and Codex use](https://learn.chatgpt.com/docs/whats-new/gpt-62-astra-sol).
