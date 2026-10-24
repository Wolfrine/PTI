# AGENTS

**PTI's current dashboard is `/home`: the authenticated personal app launcher shown after Google sign-in.** It contains pinned/recent apps, categories, search and private Codex usage readings. Start with [README.md](README.md). The nine current launcher apps and delivery/data contracts are documented there.

Do not interpret "PTI dashboard" as CEO Command or the former time-investment dashboards. `/dashboard`, `/new-dashboard`, `/codex-command` and project-detail URLs are retired redirects to `/home`; their UI and exclusive code are removed. Their intent is retained only in [the retirement archive](docs/archive/retired-dashboards.md), with the historical source revision. Dated `.pm` records and older design notes are historical evidence, not authority to revive those screens. Standalone domain/activity tools and all saved Firestore data remain intact.

For changes in `visual-experiments/**`, follow [visual-experiments/AGENTS.md](visual-experiments/AGENTS.md) instead of the PTI Angular UI guidelines and Central design procedure below. Repo-wide security, data and deployment restrictions still apply.

## Owner's PTI release preference
- For owner-authorized implementation changes, run relevant checks, commit directly to `main`, and verify the existing deployment workflow. Do not create or require pull requests unless the owner explicitly requests them.
- If verification is blocked or fails, report the precise limitation and resolve it before claiming completion. Do not describe an unverified visual state or an in-progress deployment as accepted.

## UI development guidelines
- Extend the existing warm-light Home direction; read `pti-app/design/codex-usage-review.md` and its evidence before changing the dashboard.
- When creating redesigned pages, prefix component and route names with `new-`.
- Reuse the existing Firebase authentication flow. Codex usage lives only at `users/{uid}/codexProjects/codex-usage`; never publish credentials, raw account identifiers, conversation content or tool telemetry.
- Run `npm test` and `npm run build` before committing.
- Normal login returns to `/home`. Preserve safe sibling-app login returns and redirect retired dashboard bookmarks to Home. Never add a production authentication bypass.
- Any UI/dashboard/page change is incomplete until it has been visually checked in browser on desktop and mobile-sized viewports.
- If the task depends on visual judgment, route implementation through a rendered-browser/Codex loop rather than treating Chat-generated code as visually accepted. Correct known material defects and rerender before completion.

### Shared design protocol

For any UI, UX, layout, styling, landing-page, dashboard, motion, or visual-quality work:

1. Before work, read the shared design operating standard in `Wolfrine/Central/design/README.md`, `Wolfrine/Central/design/UI_AGENT_PROTOCOL.md`, `Wolfrine/Central/design/EXECUTION_ROUTING.md`, `Wolfrine/Central/design/DESIGN_REVIEW_LOOP.md`, and `Wolfrine/Central/design/skills/visual-design-director/SKILL.md`.
2. Read the nearest repo-local `design/` memory before changing visuals.
3. Route by evidence needed: deterministic edits may use Chat + GitHub; visually judged implementation should use Codex/browser; Work is for larger research/audit before implementation.
4. For L3/L4 or high-ambition work, do not start implementation from adjectives alone. Build a compact reference pack from real examples and consult Central design intelligence, anti-patterns, failures and evaluation guidance.
5. Produce materially different art-direction candidates before committing to a new high-ambition visual language.
6. For design creation/change, assign a designer and a separate visual critic/creative director. Keep UI QA as a separate verdict/phase: overflow, focus, accessibility, tests and flow correctness cannot raise the visual-direction score.
7. For new/rejected/generic/high-ambition work, complete the visual-direction gate before starting the 5–10 implementation cycles: actual reference images/recordings, perception packet, at least three materially different direction candidates, side-by-side comparison, then implementation. Run at least five substantive implementation/review cycles after direction selection, extending toward ten until every declared critical visual dimension independently reaches 8+/10 and QA blockers are resolved. Record dimension scores, concrete feedback, changes and evidence. Review actual desktop/mobile renders and relevant interactions/motion; code review and build success do not establish visual quality.
8. Do not claim the design gate passed if independent or rendered verification is unavailable. Read-only audits and policy maintenance stay within the requested scope.
9. Save meaningful acceptance/rejection decisions and the review-cycle record back into repo-local design memory.
10. Keep the project contract compact; do not make every implementation agent read the full Central design corpus.

For Luminary specifically, `luminary-observer/design/` is the current design-governance source. The Living Instrument v1 visual direction is a rejected exploration. Preserve valid product/data constraints, but do not extend its dark-glow/orbit/network styling by default.

## Repository ownership and operating model
- PTI is the personal app hub; `/home` is its dashboard. Retired CEO process/registry documents are archived in Git and summarized by the single retirement archive. Active sub-apps retain their own operating contracts.
- `ops-forge` is archived legacy work. Do not use it as an active operating root, process source, MCP source, dashboard source, or automation source unless the user explicitly revives it.
- Start every implementation by identifying the owning repo, active branch, dirty worktree state, and deploy lane.
- Use broad F-drive scanning for discovery only; implementation should happen inside the owning repo unless a cross-repo change is explicitly required.
- Preserve unrelated dirty files. If a repo already has user or agent changes, inspect and work around them instead of reverting.
- Preserve historical project/action-item Firestore records; retiring their UI does not authorize data deletion.
- The account-scoped hosted PTI MCP and repo-local `tools/pti-mcp/` are the current agent data paths. Verify authentication and a real read before treating a connection as available; the legacy default-site `/mcp` URL is not a verified unattended route.
- The local usage monitor uses a private Firebase user session because no unattended MCP credential was available. Follow `tools/codex-usage-monitor/README.md`; it is an OS task with no inference. Keep its credential local under current-user DPAPI, use one reading document, and verify owner-only rules before publication.
- Run `node tools/codex-usage-monitor/scripts/check-home-contract.mjs` to detect conflicting active dashboard guidance before delivery.
