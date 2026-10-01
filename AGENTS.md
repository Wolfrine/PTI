# AGENTS

This repository contains an Angular application "PTI App" for tracking time investment across domains using Firebase/Firestore and Google authentication. Components include login, dashboard, domain management, activities, and activity reports. Services manage domains, targets/tasks, activities, and local storage. The app uses Angular's standalone component architecture and Chart.js for visualisations.

## UI development guidelines
- Existing pages are basic; redesigned pages live alongside them using Angular Material.
- When creating redesigned pages, prefix component and route names with `new-`.
- Reuse the existing Firebase authentication flow. New executive/Codex workflow data belongs under `users/{uid}/codexProjects/{projectId}`.
- Run `npm test` and `npm run build` before committing.
- The login flow stays unchanged; provide links to Material redesigns (e.g., `new-dashboard`) from authenticated pages like the existing dashboard.
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

## CEO command operating model
- PTI is the CEO COE: the hosted visual command surface, operating registry, and instruction home for mobile-accessible Codex planning and portfolio review.
- `ops-forge` is archived legacy work. Do not use it as an active operating root, process source, MCP source, dashboard source, or automation source unless the user explicitly revives it.
- The canonical ecosystem registry and refresh rules live under `docs/ceo-coe/`.
- Start every implementation by identifying the owning repo, active branch, dirty worktree state, and deploy lane.
- Use broad F-drive scanning for discovery only; implementation should happen inside the owning repo unless a cross-repo change is explicitly required.
- Preserve unrelated dirty files. If a repo already has user or agent changes, inspect and work around them instead of reverting.
- Keep project action items in Firestore so the PTI dashboard, Codex chats, and MCP tools share the same tracker.
- The Firebase Functions MCP endpoint is the agent access layer for PTI Firestore. Keep it token-gated and verify `tools/list` plus a real `tools/call` before treating it as available.
