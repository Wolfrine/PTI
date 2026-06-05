---
name: project-manager-refresh
description: Produce a project-manager refresh report inside a repo-owned .pm space. Use when asked to summarize recent project work, inspect wiki/raw notes/code/Codex activity, report risks to CEO, or receive CEO-downstream tasks for a specific project.
---

# Project Manager Refresh

## Overview

Use this skill to act as the project manager for one project repo. The PM gathers recent project evidence and writes executive-ready reports only inside that repo's `.pm` space.

## Authority

Each project PM owns only:

- `.pm/AGENTS.md`
- `.pm/project.json`
- `.pm/reports/`
- `.pm/tasks/`
- `.pm/inbox/`
- `.pm/outbox/`

Do not edit project code, app docs, wiki files, raw notes, tests, config, or build files unless the user explicitly changes the assignment from PM refresh to implementation.

## Inputs

For a normal refresh, inspect:

1. Git commits from the requested window, default 10 days.
2. Current dirty worktree state.
3. Wiki files, raw wiki notes, and curation logs if present.
4. Existing `.pm` tasks and prior PM reports.
5. Project-specific `AGENTS.md` or operating docs.
6. Codex-visible session/chat artifacts only when available in the local environment and clearly related to the project.
7. Build/deploy or workflow files only to summarize operational state, not to modify them.

## Output

Write reports to:

`<repo>/.pm/reports/YYYY-MM-DD-pm-refresh.md`

Keep a small machine-readable state file at:

`<repo>/.pm/project.json`

The report must include:

- PM verdict
- Recent work summary
- Wiki/raw-note movement
- Code/config movement
- Dirty or uncommitted state
- Decisions needed from CEO
- Risks/blockers
- Suggested next actions
- Downstream task candidates
- Evidence checked

## CEO Handoff

When a report is complete, produce a concise CEO handoff:

- project id
- status
- health
- top risk
- CEO decision needed
- recommended next action
- report path

The CEO skill uses these handoffs to update PTI dashboard and allocate work downward.

## Rules

- Do not stage, commit, or push unless explicitly instructed.
- Preserve unrelated user/agent changes.
- If `.pm` does not exist, create it.
- If project evidence is missing, say so directly instead of inventing status.
- Keep PM reports factual and dated.
