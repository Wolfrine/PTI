# PTI PM Refresh - 2026-06-05

Project id: `pti`  
Repo: `F:\Workspace\Programs\Independent-Products\PTI`  
Activity window: 2026-05-26 through 2026-06-05  
PM scope: read repo evidence, write only inside `.pm`

## PM Verdict

PTI is actively becoming the CEO COE and hosted command plane. The last 10 days show real movement on the Codex command dashboard, Firebase MCP endpoint, ecosystem registry, refresh protocol, and project wiki operating model.

Health is amber, not because the direction is weak, but because the repo is currently dirty and the operating model is ahead of its release hygiene. The CEO should treat PTI as live but require a short stabilization pass before using it as the unquestioned source of truth for downstream project allocation.

## Recent Work Summary

- 2026-05-30 added the Codex command portal, then iterated it into a portfolio dashboard and command landing surface.
- 2026-05-30 added Firebase Functions MCP support, with Firestore tools and project/action-item helpers under `users/{uid}/codexProjects/{projectId}`.
- 2026-05-30 updated Firebase deployment workflow around secrets, hosting-first deploy, and optional Functions deployment.
- 2026-05-31 elevated the PTI command dashboard experience, adding project detail routes and Firestore-backed project action-item workflows.
- 2026-05-31 added and expanded business/wiki operating notes for project wikis, raw-note capture, Codex agent competition, and IAC/ADS/ODD framing.
- 2026-06-01 updated the LLM wiki setup and curation protocol.
- 2026-06-05 established the PTI CEO COE refresh workflow, including CEO COE docs, ecosystem registry, agent rules, and dashboard project data updates.

## Wiki / Raw-Note Movement

- `docs/business/PROJECT_WIKI_NOTE.md` now defines the broader operating model: CEO dashboard, internal Codex agent workstreams, project wiki/knowledge graph, and IAC/ADS/ODD task framing.
- `docs/business/LLM_WIKI_SETUP_AND_CURATION_PROTOCOL.md` defines wiki/raw folder expectations, curation rules, inline linking standards, and anti-patterns.
- No root-level `wiki/` or `raw/` directories were found in this repo. PTI currently stores the wiki protocol under `docs/business`; a dedicated PTI wiki/raw implementation has not yet been created.
- The CEO COE docs under `docs/ceo-coe/` are active and currently include uncommitted PM-loop updates.

## Code / Config Movement

- Angular app movement centered on `new-codex-command`, `codex-project-detail`, `new-home`, login navigation, and routes.
- Dashboard data now lists PTI as the command plane, marks `ops-forge` archived, and shows registered projects with branch, dirty-state, deploy-lane, standing, and next action metadata.
- `CodexCommandNotesService` persists project snapshots and action items in Firestore under the authenticated user.
- Firebase Functions expose a token-gated JSON-RPC MCP endpoint with `tools/list`, `tools/call`, Firestore CRUD/query helpers, project listing, and action item helpers.
- `firebase.json` rewrites `/mcp` to the `mcp` function and otherwise serves the Angular app.
- `.github/workflows/firebase-deploy.yml` builds the Angular app and Functions, deploys Hosting when `FIREBASE_SERVICE_ACCOUNT` is present, and deploys Functions with `continue-on-error`.
- Visual verification artifacts exist under `.codex-visual-checks/`, including desktop and mobile screenshots for the command dashboard and redesign surfaces.

## Dirty Or Uncommitted State

Current branch: `main`  
Remote: `origin https://github.com/Wolfrine/PTI.git`  
Ahead/behind: `0 / 0` against `origin/main`

Uncommitted tracked files observed:

- `.agents/skills/ceo-ecosystem-refresh/SKILL.md`
- `docs/ceo-coe/CEO_REFRESH_PROTOCOL.md`
- `docs/ceo-coe/ECOSYSTEM_REGISTRY.md`
- `docs/ceo-coe/README.md`
- `docs/ceo-coe/ecosystem-registry.json`

Untracked paths observed:

- `.agents/skills/project-manager-refresh/`
- `.pm/`

The tracked dirty diff adds PM handoff intake to the CEO refresh protocol and marks selected projects as PM-enabled in the ecosystem registry. This looks aligned with the current PM/CEO operating model, but it is not yet committed release state.

## Decisions Needed From CEO

- Decide whether to accept the PM-enabled pilot model for PTI, Central/Aesthetic India, gtop-app, and NovaSaga.
- Decide whether PTI should immediately promote the uncommitted PM-loop docs/registry changes into the official CEO COE release.
- Decide whether PTI needs a dedicated `wiki/` and `raw/` folder now, or whether `docs/business` remains sufficient until more raw project material exists.
- Decide how strict Functions deploy success should be. The current workflow treats Functions as optional; that reduces Hosting blockage but can hide MCP deployment failure unless monitored separately.

## Risks / Blockers

- Top risk: PTI is the CEO source of truth while its CEO COE/PM-loop docs and PM space are dirty. Any CEO dashboard refresh should distinguish committed facts from in-progress PM governance changes.
- MCP availability is not fully proven by this PM pass. Repo instructions require verifying `tools/list` and a real `tools/call` before treating the endpoint as available; no live token-gated call was performed in this read-only PM refresh.
- The dashboard data is static in Angular files plus Firestore action-item sync. Registry/dashboard drift is possible unless the CEO refresh workflow consistently updates both registry docs and dashboard data.
- Functions deploy is `continue-on-error`; Hosting may publish even if MCP deploy fails.
- Wiki protocol is strong, but PTI has not yet implemented the recommended `wiki/` and `raw/` structure.

## Suggested Next Actions

- Stabilize PTI by reviewing the current dirty CEO COE/PM-loop changes and committing them if approved.
- Run or confirm Angular build and Firebase workflow status after the dirty state is resolved.
- Verify the deployed `/mcp` endpoint with `initialize`, `tools/list`, and one harmless `tools/call` such as `pti.health`.
- Decide whether to seed PTI's own `wiki/` and `raw/` directories or keep the protocol as documentation only for now.
- Add an explicit CEO dashboard maintenance checklist tying `ecosystem-registry.json`, `ECOSYSTEM_REGISTRY.md`, `new-codex-command.component.ts`, and `codex-projects.data.ts` together.

## Downstream Task Candidates

- PM task: create a repo-local PTI wiki/raw seed packet if CEO approves the dedicated wiki structure.
- Implementation task: add automated consistency checks between `ecosystem-registry.json` and Angular dashboard project data.
- Ops task: add a documented MCP smoke-test command and record latest verified MCP health in PTI PM or CEO COE docs.
- Release task: review, test, and commit the PM-loop CEO COE changes once approved.
- Dashboard task: surface latest PM handoff status per PM-enabled project after the CEO skill consumes `.pm/outbox` files.

## Evidence Checked

- `git status --short --branch`
- `git log --since=2026-05-26 --name-status`
- `git log --since=2026-05-26 --shortstat`
- `git diff --stat`
- `git diff` for dirty CEO COE docs, registry, and `ceo-ecosystem-refresh` skill
- `AGENTS.md`
- `.pm/AGENTS.md`
- `.pm/project.json`
- `.pm/README.md`
- `.pm/reports`, `.pm/tasks`, `.pm/inbox`, `.pm/outbox`
- `docs/business/PROJECT_WIKI_NOTE.md`
- `docs/business/LLM_WIKI_SETUP_AND_CURATION_PROTOCOL.md`
- `docs/ceo-coe/README.md`
- `docs/ceo-coe/CEO_REFRESH_PROTOCOL.md`
- `docs/ceo-coe/ECOSYSTEM_REGISTRY.md`
- `docs/ceo-coe/ecosystem-registry.json`
- `.agents/skills/ceo-ecosystem-refresh/SKILL.md`
- `.agents/skills/project-manager-refresh/SKILL.md`
- `.github/workflows/firebase-deploy.yml`
- `firebase.json`
- `functions/README.md`
- `functions/src/index.ts`
- `pti-app/package.json`
- `pti-app/src/app/app.routes.ts`
- `pti-app/src/app/components/new-codex-command/new-codex-command.component.ts`
- `pti-app/src/app/components/new-codex-command/new-codex-command.component.html`
- `pti-app/src/app/components/codex-project-detail/codex-project-detail.component.ts`
- `pti-app/src/app/components/codex-project-detail/codex-projects.data.ts`
- `pti-app/src/app/services/codex-command-notes.service.ts`
- `.codex-visual-checks/` screenshot inventory
