# CEO Refresh Protocol

The CEO refresh is a read-first operating pass across the ecosystem. It exists to keep the PTI CEO dashboard accurate.

## Authority

PTI is the CEO COE. Do not use `ops-forge` for active process, dashboard, MCP, registry, or refresh work. `ops-forge` is archived under `F:\Workspace\Archive\legacy\Codex-Operations\ops-forge`.

## Refresh Inputs

Use these sources in order:

1. `docs/ceo-coe/ecosystem-registry.json`
2. project PM handoffs from `<repo>/.pm/outbox/`
3. project PM reports from `<repo>/.pm/reports/`
4. live Git state from the local path in the registry
5. GitHub remote and branch state when network/tool access is available
6. PTI Firestore project snapshots and action items
7. project-local wiki/docs when the task requires business/product context

Do not full-scan F drive as the primary source. Broad F-drive scanning is discovery only.

## PM Up / CEO Down Loop

The CEO refresh should work in both directions:

- Upward: project repo evidence -> project PM refresh -> `.pm/outbox` CEO handoff -> PTI CEO dashboard.
- Downward: user/CEO objective -> PTI CEO task packet -> target project PM `.pm/inbox` -> project-specific Codex work packet.

Project PMs own only the `.pm` space in their repo. They may read project evidence, but they do not edit code, wiki, raw notes, docs, tests, config, or generated assets during PM refresh work.

Each active PM-enabled repo should keep:

- `.pm/AGENTS.md`
- `.pm/project.json`
- `.pm/reports/YYYY-MM-DD-pm-refresh.md`
- `.pm/outbox/YYYY-MM-DD-ceo-handoff.json`
- `.pm/inbox/` for CEO-downstream task packets
- `.pm/tasks/` for PM-created implementation packets

The CEO skill reads PM reports; it does not overwrite PM-owned files unless explicitly acting as that project PM.

## Refresh Checks Per Project

For every active or controlled project, collect:

- project id and name
- local path exists or missing
- GitHub remote URL
- current branch
- latest local commit
- dirty or clean state
- ahead/behind state when available
- detected deploy lane or workflow
- open PTI action items
- wiki/docs presence when relevant
- CEO standing
- next recommended action

## Mutation Rules

Default refresh mode is read-only for project repos.

Allowed updates during refresh:

- PTI registry files
- PTI dashboard project standing
- PTI Firestore project snapshots
- PTI Firestore project action items
- PTI docs that describe the operating model

Not allowed unless explicitly requested:

- changing code in non-PTI project repos
- committing project work in non-PTI repos
- reviving archived repos
- using `ops-forge` as a process source

## Dashboard Update Rule

After each meaningful refresh, PTI should reflect:

- which projects are active, support, control, unknown, or archived
- where dirty work exists
- what PM reports say for PM-enabled projects
- which project should be touched next
- what is blocked
- what can be done from mobile
- which action items are ready for Codex

The dashboard should remain executive-level. Detailed implementation belongs in the owning repo.

## Skill Target

Create a dedicated Codex skill named `ceo-ecosystem-refresh` with this job:

1. read this protocol
2. read `ecosystem-registry.json`
3. read latest PM handoffs where available
4. inspect each active project when PM reports are missing or stale
5. summarize current standing
6. update PTI dashboard/tracker data when instructed
7. report stale registry entries and archive candidates

The skill should use `ui-visual-verifier` whenever a dashboard-facing UI or data change is made.
