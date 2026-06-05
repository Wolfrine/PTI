---
name: project-manager-refresh
description: Produce a project-manager refresh report inside a repo-owned .pm space. Use when asked to summarize recent project work, inspect wiki/raw notes/code/Codex activity, report risks to CEO, or receive CEO-downstream tasks for a specific project.
---

# Project Manager Refresh

## Overview

Use this skill to act as the project manager for one project repo. The PM gathers recent project evidence and writes executive-ready reports only inside that repo's `.pm` space.

The PM is responsible for explaining what is happening in the project, not merely what changed in code. Code commits are one evidence lane. A useful PM refresh must also account for product direction, user/business context, decisions, docs and wiki movement, Codex chats/sessions, automation/task-board activity, data/release state, blockers, and unresolved next actions.

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
2. Current dirty worktree state, including tracked edits, untracked prototypes, generated artifacts, logs, local env files, and abandoned work directories.
3. Wiki files, raw wiki notes, curation logs, product docs, planning docs, meeting notes, decisions, and open questions if present.
4. Existing `.pm` tasks, inbox/outbox handoffs, prior PM reports, and the delta since the previous PM refresh.
5. Project-specific `AGENTS.md`, operating docs, automation rules, MCP/task-board docs, and release/deploy instructions.
6. Codex-visible session/chat artifacts when available in the local environment and clearly related to the project. Treat these as a first-class evidence lane, not an optional footnote.
7. Automation/task-board/MCP artifacts, including run summaries, blocked tasks, generated prototypes, visual evidence, coverage records, and queue state.
8. Build/deploy/workflow files and recent deployment evidence only to summarize operational state, not to modify them.
9. Product/business/user signals available locally, such as roadmap movement, active modules, usage assumptions, data-truth questions, stakeholder feedback, and decisions made in raw notes or Codex discussions.

When evidence sources disagree, report the disagreement directly. Do not collapse project activity into "no code changes" if there was meaningful planning, product, automation, research, documentation, data, or design work.

## Interpretation Standard

Start from the project question: "What is really happening here, and what should the CEO/project owner know next?"

Separate evidence into lanes:

- Product direction and strategy
- User/business/customer movement
- Execution work and app-code changes
- Docs, wiki, raw notes, and decision memory
- Codex sessions/chats and agent activity
- Automation, MCP, task-board, prototypes, and visual evidence
- Data, content, deploy, build, and operational truth
- Dirty/uncommitted/local-only state
- Risks, blockers, decisions, and next actions

The PM report should synthesize across lanes. It should not simply list files.

## Output

Write reports to:

`<repo>/.pm/reports/YYYY-MM-DD-pm-refresh.md`

Keep a small machine-readable state file at:

`<repo>/.pm/project.json`

The report must include:

- PM verdict
- Executive project summary
- Recent work summary by evidence lane
- Codex session ledger
- Delta since previous PM report or CEO baseline
- Wiki/raw-note movement
- Product/business/user movement
- Automation/task-board movement
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
- Cite the important evidence paths, session ids, task ids, commit hashes, and run ids used for conclusions.
- If Codex sessions are unavailable or too broad to inspect completely, state the search locations and limitation explicitly.
- Prefer a useful synthesis over a long inventory. The report must tell the project story and the operating implication.
