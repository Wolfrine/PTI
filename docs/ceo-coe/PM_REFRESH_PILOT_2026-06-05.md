# PM Refresh Pilot - 2026-06-05

The first PM refresh pilot ran on projects with committed or modified work in the last 10 days.

## Scope

PM spaces were created in:

- `F:\Workspace\Programs\Independent-Products\PTI\.pm`
- `F:\Central\.pm`
- `F:\Workspace\Programs\Growth-Tutorials\gtop-app\.pm`
- `F:\Workspace\NovaSaga\.pm`

Each PM subagent was instructed to write only inside its repo's `.pm` space.

## CEO Handoffs

| Project | PM health | CEO status | Top CEO action |
| --- | --- | --- | --- |
| PTI | amber | live-but-dirty | Promote the PM-enabled pilot and fix token-gated MCP route. |
| Central / Aesthetic India | yellow | active_needs_ceo_attention | Verify replacement supervisor and confirm one approved backlog item publishes. |
| gtop-app | at-risk | blocked-for-execution | Repair builder checkout/index-lock blocker, resume Live Quiz first, and run question-bank truth snapshot in parallel. |
| NovaSaga | amber | foundation_refresh_complete | Run protagonist and Book 1 spine definition before broad archive curation continues. |

## Result

The model worked.

- PM agents produced project-specific summaries without editing implementation files.
- CEO can now read `.pm/outbox/*-ceo-handoff.json` before updating the dashboard.
- Downward task allocation can be represented as files in `.pm/inbox/`.
- Implementation should not start from PM reports directly; CEO should convert accepted recommendations into explicit task packets.

## PM Quality Correction

The GTOP PM refresh exposed a quality bar issue: a PM report must not reduce project movement to code commits.

The corrected GTOP read is:

- GTOP is in product-memory and execution-unblock mode.
- Wiki/raw-note work materially clarified the product around practice intelligence, question-bank quality, learning diagnosis, Student Pulse, and Live Practice.
- Automation created or maintained Reports, Quiz Run, and Live Quiz tasks, including a Live Quiz control-room prototype.
- Implementation is blocked before app edits because the builder lane cannot switch to `codex/gtop-dev-lab` due to `.git/index.lock` permission errors.
- CEO should fix the builder lane, resume Live Quiz first, and assign question-bank truth work in parallel.

Future PM reports must synthesize product direction, user/business context, Codex sessions, automation/task-board work, prototypes, docs/wiki/raw notes, data/content truth, code/build/deploy movement, dirty local state, risks, and CEO decisions.

## Next Improvements

- Fix PTI MCP `/mcp` route so PM and CEO updates can also flow through Firestore.
- Add a CEO refresh script or MCP tool that reads all PM handoffs and produces one dashboard-ready summary.
- Add dashboard UI for PM report freshness, health, CEO decision needed, and downstream task count.
