# PTI Acceptance Gates

Status: Required for re-foundation work
Date: 2026-07-11

## Product Gate

- The home surface answers the seven constitution questions using real or explicitly unavailable evidence.
- Outcomes and decisions outrank project cards and repository hygiene.
- At least one real outcome completes the minimum vertical slice.
- Original PTI allocation concepts are connected to outcome investment rather than exposed as an unrelated legacy dashboard.

## Evidence Gate

- Every material standing has source, observation time, freshness, and confidence.
- Stale, inferred, disputed, mock, and reference-only data are visibly distinct.
- Dashboard counts reconcile with their underlying records.
- Contradictions and failed probes remain visible.
- No agent run, report generation, commit, or deployment is treated as outcome completion by itself.

## Lifecycle Gate

- Invalid state transitions are rejected.
- Decisions create traceable commitments.
- Agent-ready work requires a sealed packet.
- Submissions require artifacts and verification evidence.
- Acceptance requires an independent evaluation.
- Releases require approval and rollback information appropriate to risk.
- Closed commitments require target proof or an explicit cancellation rationale.

## Security And Authority Gate

- No service-account JSON, API key, token, `.env`, or private credential is committed or logged.
- Firebase Admin operations are authenticated, scoped, reversible where possible, and auditable.
- Agent execution respects repository and branch boundaries.
- Production promotion is distinct from preview deployment.
- Missing IAM or external authority is reported as a blocker, not bypassed.

## Technical Gate

- Angular production build passes.
- Focused unit tests cover ranking, freshness, lifecycle transitions, and derived summaries.
- Firestore converters or typed repositories validate required fields.
- Migration is idempotent and produces a reconciliation report.
- Firebase Admin read/write/delete smoke checks pass.
- GitHub access checks pass without persisting plaintext credentials.
- Hosting preview or equivalent isolated rendered route is available.

## UX Gate

- The rendered experience is independently inspected at desktop and mobile widths.
- The first viewport exposes material changes, decisions, and primary actions.
- Evidence can be inspected without losing decision context.
- No generic project-card wall, decorative control-room background, nested card clutter, or unexplained scoring dominates the experience.
- Text, controls, tables, drawers, and state labels fit without overlap or horizontal overflow.
- Mobile supports decision, approval, rejection, delegation, and concise evidence inspection.
- Empty, loading, stale, error, unauthorized, and partial-data states are designed and verified.

## Operational Gate

- A CEO daily review can be completed without editing source files.
- A PM handoff can be ingested and acknowledged.
- A work packet can be created, sealed, assigned, and tracked.
- A reviewer can compare evidence and record a recommendation.
- A selected submission can move to release readiness with a visible authority gate.
- A release can produce outcome evidence and a durable learning handoff.

## Release Decision

Release readiness must be recorded as one of:

- `ready_for_preview`
- `ready_for_production_approval`
- `blocked_by_product`
- `blocked_by_evidence`
- `blocked_by_quality`
- `blocked_by_security`
- `blocked_by_authority`

No ambiguous `done` state is accepted.
