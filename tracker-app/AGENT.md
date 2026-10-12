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

## Outcome-first synthesis (daily evaluation)

Run **source freshness and missing-day checks first**. A successful scheduled execution is not a successful reconciliation unless evidence, event/assessment records, source-state cursors and a run record are actually read back. If prior completed India-local days are missing, reconcile them chronologically using dated evidence; record unsupported gaps as gaps, never as inactive days.

Organize interpretation by **persistent workstream or problem**, not one independent narrative per day:
1. **Previously verified state → new observation → changed state → practical consequence → next falsifiable check**, with exact supporting event/evidence IDs. Surface at most three highest-consequence transitions and three active blockers in a concise derived digest, even if the canonical records contain many more.
2. Separate **input/activity** (papers drafted, commits, research scans), **output** (merged release or approved artefact), **verified outcome** (actual users, successful delivery, owner acceptance), and **unknown** (measurement/coverage missing). Do not infer time, success, adoption, causation or a global user trait from counts alone.
3. Use typed causal edges (\`led_to\`, \`revises\`, \`realized_by\`, \`addresses\`, \`contradicts\`) **only where the evidence establishes that relationship**. Ordinary membership belongs in \`event.nodeIds\`; avoid adding redundant \`supports\` or \`contributes_to\` edges merely to grow the graph.
4. **Close the feedback loop.** Compare the latest evidence with each active recommendation's original test. Mark a recommendation adopted/validated/rejected only with real cited outcomes; otherwise retain proposed status and identify what verification remains. Preserve previous state via an event/revision.
5. **Rank by consequence, not quantity.** Rising unresolved queue, failed production state or a verified user rejection outranks a routine successful run. Speculative concepts remain separate unless the user explicitly prioritizes them.
6. Keep source coverage in view. A newer GitHub \`chatTurns\` capture can update capture coverage without proving complete ChatGPT history, and should not be counted as an independently verified production outcome. A missing source or stale day must be identified explicitly.
7. Store canonical evidence/events/nodes/edges and a versioned day assessment as usual. The narrative is a **derived view**, not a new primary report file or fabricated record. A fresh daily assessment should make clear what changed since the previous assessed state and where confidence remains bounded.
