# CEO Refresh Protocol

The CEO refresh is a read-first operating pass across the ecosystem. It exists to keep the PTI CEO dashboard accurate.

## Authority

PTI is the CEO COE. Do not use `ops-forge` for active process, dashboard, MCP, registry, or refresh work. `ops-forge` is archived under `F:\Workspace\Archive\legacy\Codex-Operations\ops-forge`.

## Refresh Inputs

Use these sources in order:

1. `docs/ceo-coe/ecosystem-registry.json`
2. live Git state from the local path in the registry
3. GitHub remote and branch state when network/tool access is available
4. PTI Firestore project snapshots and action items
5. project-local wiki/docs when the task requires business/product context

Do not full-scan F drive as the primary source. Broad F-drive scanning is discovery only.

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
- which project should be touched next
- what is blocked
- what can be done from mobile
- which action items are ready for Codex

The dashboard should remain executive-level. Detailed implementation belongs in the owning repo.

## Skill Target

Create a dedicated Codex skill named `ceo-ecosystem-refresh` with this job:

1. read this protocol
2. read `ecosystem-registry.json`
3. inspect each active project
4. summarize current standing
5. update PTI dashboard/tracker data when instructed
6. report stale registry entries and archive candidates

The skill should use `ui-visual-verifier` whenever a dashboard-facing UI or data change is made.
