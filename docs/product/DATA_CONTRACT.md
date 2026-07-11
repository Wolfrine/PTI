# PTI Operating Data Contract

Status: Target schema v2
Date: 2026-07-11

## Storage Boundary

User-scoped operating records remain under:

```text
users/{uid}/operatingSystem/{collection}/{documentId}
```

Existing `users/{uid}/codexProjects` and original PTI domain/activity collections remain readable during migration. They are not the target source of truth.

## Common Record Envelope

Every material record includes:

- `id`: stable semantic or generated identifier
- `schemaVersion`: integer contract version
- `createdAt`, `updatedAt`: server timestamps
- `createdBy`, `updatedBy`: actor reference
- `sourceRefs`: evidence identifiers or source paths
- `confidence`: `high`, `medium`, `low`, or `unknown`
- `freshness`: `fresh`, `aging`, `stale`, `expired`, or `unknown`
- `observedAt`: when the underlying fact was observed
- `auditVersion`: monotonic update number where practical

Derived summaries must declare `derivedFrom` and `computedAt`.

## Core Entities

### `projects`

Context and ownership boundary: repository, product role, PM space, deployment lanes, current evidence health, and lifecycle status. Project standings are derived from evidence and explicit decisions rather than embedded prose alone.

### `outcomes`

Desired changes with value, horizon, success evidence, current confidence, owner, affected projects, priority factors, and allocation intent.

### `signals`

Immutable or versioned observations from PM reports, Git/GitHub, tests, deployments, analytics, manual notes, agent submissions, or external systems.

### `decisions`

Decision question, options, recommendation, evidence, deadline, authority, selected option, rationale, and resulting commitments.

### `commitments`

Accountable promises linked to an outcome and decision, with owner, target proof, lifecycle state, due date, blockers, and closure evidence.

### `workPackets`

Sealed executable requirements containing IAC, ADS, ODD, scope boundaries, acceptance criteria, delivery lane, risk class, and learning destination.

### `agentRuns`

Execution instances with agent identity/role, packet, branch/worktree, start/end time, status, logs or thread references, and submission IDs.

### `submissions`

Code/artifact references, preview URLs, verification evidence, limitations, and claimed requirement coverage.

### `evaluations`

Independent reviews tied to a submission and rubric version, with dimension scores, findings, evidence, recommendation, and reviewer independence declaration.

### `releases`

Selected submission, target environment, approval, deployment/build evidence, rollback reference, observed release state, and outcome-verification status.

### `allocations`

Planned and actual investment of human time, agent runs, review capacity, or other execution resources against outcomes and periods.

### `learnings`

Implementation-independent lessons, rejected approaches, reusable patterns, project-memory destination, and proof that curation occurred.

### `auditEvents`

Append-only lifecycle transitions and material mutations with actor, reason, previous state reference, next state, and timestamp.

## Relationships

```text
project <-> outcome
outcome -> signal
signal -> decision
decision -> commitment
commitment -> workPacket
workPacket -> agentRun -> submission -> evaluation
evaluation -> selection -> release -> signal
release -> learning -> project memory
outcome -> allocation
all material entities -> auditEvent
```

## Provenance Rules

- A prose standing without a source reference is an assertion, not evidence.
- A local Git observation records repository, branch, commit, command class, and observed time.
- PM reports remain source documents; parsed summaries point back to the exact report.
- Agent output becomes a submission only when its artifacts or quoted evidence are persisted.
- Generated, mock, concept, and reference-only artifacts are labeled explicitly.
- Contradictory sources are preserved and flagged; newer evidence does not silently erase disagreement.

## Migration Rules

1. Import the canonical registry as project identity records, marking its 2026-06-05 facts stale.
2. Import current local/GitHub observations as newer signals rather than overwriting historical snapshots.
3. Convert existing `codexProjects/{projectId}/actionItems` into commitments only when ownership and expected proof can be inferred; otherwise retain them as legacy notes.
4. Preserve original PTI domains, targets, tasks, and activities. Link future allocation records to them where they represent human time investment.
5. Never fabricate missing completion evidence during migration.
6. Make migrations idempotent and emit a versioned migration report.
