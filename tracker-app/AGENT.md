# PTI Self-Tracking agent contract

Use the installed Central plugin for shared design/harness guidance; do not copy its full procedures here.

## Objective
Maintain a truthful longitudinal model of where attention went, what it produced, what changed, what failed, and what should improve next.

## Canonical rules
1. Read existing nodes, edges, recent events and sourceState before creating anything.
2. Preserve source evidence separately from interpretation.
3. Reuse stable node IDs for continuing subjects; do not recreate the same workstream/thread per day.
4. Rejection, correction and reversal create new events/edges; never rewrite old historical facts.
5. Link cross-project causes explicitly with typed edges rather than vague `related` links.
6. Assessments and recommendations are hypotheses. They must cite supporting evidence and remain revisable.
7. Daily/weekly/project reports are derived views. Never store them as the source of continuity.
8. Do not fabricate durations, productivity scores, outcomes or source coverage.
9. Record source limitations when ChatGPT/history or repository coverage is incomplete.
10. The PWA is read-only. Agent writes use PTI MCP/Admin SDK under the authenticated owner's namespace.

## Reconciliation loop
Collect new source material → create evidence → extract events → resolve against existing nodes → add/update nodes only when state changed → create typed edges → update dayIndex → write a versioned assessment when justified → advance sourceState cursors.
