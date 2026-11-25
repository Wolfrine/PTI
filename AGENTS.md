## Owner-wide practical-verification rule (8 November 2026)

**First step whenever development resumes in this repository:** inspect existing automated test cases, test-only scripts, fixtures, mocks, synthetic runners, Playwright/Cypress/e2e scaffolding and test-only CI commands. Remove confirmed obsolete, duplicated, AI-generated or otherwise unwanted test-only assets and orphaned dependencies/config before introducing new features. Preserve Git recoverability and report material removals. Do not delete working product/runtime code, authentication/security enforcement, data-integrity controls, required build/deploy machinery or anything whose purpose is uncertain; investigate such cases first. Keep this audit proportional so it does not displace the actual task.

**Do not create or regenerate test cases by default.** No new unit/integration/e2e suites, Playwright automation, mock harnesses, test frameworks, benchmark fixtures or CI testing jobs unless the owner explicitly asks. Do not run test suites merely to produce passing counts. This current owner instruction supersedes older generic test-generation/test-run mandates.

**Verify what is actually built:** run the real application/site/game/service locally where possible, exercise authorized browser/desktop/mobile/device flows, and inspect actual behavior, appearance, touch, audio and outcomes. Use existing minimal build/lint sanity checks only as useful; minimize GitHub Actions. Report observable evidence and blockers honestly. Automated pass counts are not practical verification or owner acceptance.

# AGENTS

## Canonical storage - owner correction 18 November 2026

F: holds repositories/source/code and essential Git. H: holds models, runtimes/SDKs, caches, temp/scratch, generated assets/build outputs, reports and backups. Configure effective consumer paths before generating anything; a checkout on F: does not authorize F: outputs. Historical F-only artifact/model guidance is superseded. See `tools/local-codex/docs/storage-placement.md` for active compatibility exceptions and verified migration controls. Preserve live state, dirty work, credentials and denied targets.

**PTI's current dashboard is `/home`: the authenticated personal app launcher shown after Google sign-in.** It contains pinned/recent apps, categories, search and private Codex usage readings. Start with [README.md](README.md). The current launcher apps and delivery/data contracts are documented there.

Do not interpret "PTI dashboard" as CEO Command or the former time-investment dashboards. `/dashboard`, `/new-dashboard`, `/codex-command` and project-detail URLs are retired redirects to `/home`; their UI and exclusive code are removed. Their intent is retained only in [the retirement archive](docs/archive/retired-dashboards.md), with the historical source revision. Historical records and older design notes are evidence, not authority to revive those screens. Standalone domain/activity tools and all saved Firestore data remain intact.

## Owner's PTI release preference
- Follow the [owner-wide cloud cost rule](docs/cloud-cost-rule.md) before a cost-changing release. Use the existing release evidence for the forecast, approval and readback.
- For owner-authorized implementation changes, run relevant checks, commit directly to `main`, and verify the existing deployment workflow. Do not create or require pull requests unless the owner explicitly requests them.
- If verification is blocked or fails, report the precise limitation and resolve it before claiming completion. Do not describe an unverified visual state or an in-progress deployment as accepted.
- Local Codex uses authenticated private transport -> a small Windows helper -> official native Codex. Native Codex owns planning, useful subagents, Git and verification. New work starts fresh; continuation requires an explicit selected task/thread. General work stays in its selected native thread. The helper adds no module affinity/rotation, checkout/thread/continuation locks, writer/foreground reservations, artificial capacity/session/time limits, maintenance fences or resource scheduler. Preserve exact request deduplication and never replay ambiguous dispatch. Follow the [external one-shot activation runbook](tools/local-codex/docs/maintenance-upgrade.md), preserve active native executions and require installed hashes/readback plus fresh authenticated helper observations. Source changes are not installation proof; leave the independent quota collector unchanged.
- Local Codex owner correction, 2026-11-08: default **NO AI-generated tests, fixtures, QA scaffolding, Playwright or automatic e2e** without a new explicit owner instruction. This supersedes earlier bridge regression-test requests. Prioritize actual output and live functional observation; use minimal syntax/build checks as needed. Do not run full suites or trigger CI test runs for bridge maintenance/instruction changes. Preserve unrelated product tests and existing pipeline protections; avoid unnecessary GitHub Actions costs.
- Local Codex browser work uses official tools available in the executing native turn and their normal permission checks. Missing tools or an actual denial leave the exact verification step open while independent work continues. The owner authorized a browser-only handoff on 23 November 2026. An explicitly requested PC browser action may go from ordinary ChatGPT through Local Codex to a designated desktop executor and return its observed result to the originating request. Honor the scope of the originating request, the designated thread and the desktop browser's normal site permissions. A desktop thread's general tool permissions do not constitute a browser grant. The owner also authorized the independent PTI Owner Chrome tab integration. A user-reviewed page observation can return directly to its Local Codex task. The exception excludes general task transfer, copied identities or pipes, raw CDP/Playwright and retrying denied targets through another executor. Request `gpt-6.2-sol/xhigh` for new native work and verify actual execution metadata; preserve already-running work and report its real selection. See [current boundaries](tools/local-codex/docs/limitations.md).

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

## Velum standing test-media policy

- **Reference inputs:** For every Velum image generation, edit, model comparison, pose test or evaluation, use only existing owner-supplied source photographs from the verified Google Drive [**Private / References**](https://drive.google.com/drive/folders/1yDt_5NSv8fDYhZvOdsihdJwKQJuTzx66) folder (the `References` child of the exact `Private` folder below). Never manufacture, download, or substitute new/generated/stock reference photos for testing unless the owner explicitly requests it.
- **Outputs:** Every newly generated test image or revision must be saved to the owner's Google Drive [**Private**](https://drive.google.com/drive/folders/1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA) folder (not `Private > References` or `Poses`). Verify the saved destination before reporting success. Temporary local files are not sufficient.
- Do not modify, move, overwrite, or delete source reference images. Preserve private handling and source/output provenance. If the folder cannot be accessed, stop and report the specific blocker instead of substituting another input source.
- Apply these defaults without asking the owner to repeat them, including when handing off work to local Codex or another agent.
