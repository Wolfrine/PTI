---
name: ceo-ecosystem-refresh
description: Refresh the PTI CEO COE ecosystem view across GitHub-backed F-drive projects. Use when asked to review all projects, update CEO dashboard standing, sync project registry/action items, detect stale roots, or prepare ecosystem-level next actions.
---

# CEO Ecosystem Refresh

## Overview

Use this skill to perform an ecosystem-level CEO refresh with PTI as the source of truth. The refresh reads registered project state, checks local Git facts, and updates PTI-owned dashboard/tracker records when instructed.

## Authority

PTI is the CEO COE. Do not use `ops-forge` as an active operating root, process source, dashboard source, MCP source, or automation source unless the user explicitly revives it.

Canonical PTI files:

- `docs/ceo-coe/ecosystem-registry.json`
- `docs/ceo-coe/ECOSYSTEM_REGISTRY.md`
- `docs/ceo-coe/CEO_REFRESH_PROTOCOL.md`
- `AGENTS.md`

## Workflow

1. Read PTI `AGENTS.md` and the CEO COE registry/protocol files.
2. Treat the registry as the primary project list. Use broad F-drive scanning only for discovery or stale-entry detection.
3. For each active or controlled project, inspect local path existence, Git remote, branch, latest commit, dirty state, and ahead/behind state when practical.
4. Compare facts against PTI dashboard data and Firestore/action-item data if access is available.
5. Report verified facts separately from assumptions.
6. Update only PTI-owned registry, dashboard data, docs, or tracker records unless the user explicitly asks for project-repo changes.
7. If dashboard-facing files change, use `ui-visual-verifier` before claiming the dashboard is complete.

## Read-Only Default

Refresh work must not edit non-PTI project repos by default. Project repo mutations require a separate explicit implementation request.

Allowed during refresh:

- PTI registry updates
- PTI CEO dashboard standing updates
- PTI Firestore project snapshots/action items, if MCP or credentials are available
- PTI operating docs

Not allowed unless explicitly requested:

- using archived `ops-forge`
- changing code in non-PTI repos
- committing non-PTI repo changes
- reviving archived repos
- treating scratch roots as portfolio projects

## Output Shape

When reporting a refresh, include:

- current portfolio summary
- dirty roots
- stale registry/dashboard entries
- archived or scratch roots that should stay excluded
- project-wise next actions
- what PTI files or tracker records were updated
- any dashboard visual verification status

Keep the result executive-level. Detailed implementation belongs in the owning repo.
