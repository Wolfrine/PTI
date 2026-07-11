# PTI Executive Operating Model

Status: Target operating model
Date: 2026-07-11

## Review Cadences

### Continuous Evidence Intake

Project PM handoffs, Git/GitHub state, deployments, tests, agent runs, reviews, analytics, and manual observations enter PTI as immutable or versioned evidence records.

### Daily Direction Review

The daily review should take five to fifteen minutes:

1. inspect material changes since the last acknowledged review
2. resolve high-value decisions and exceptions
3. confirm or change capacity allocation
4. approve sealed work packets that are ready for execution
5. inspect submissions or releases awaiting judgment
6. acknowledge stale or contradictory evidence requiring refresh

### Weekly Allocation Review

Compare intended outcome priority with actual human time, agent runs, review effort, and delivered proof. Continue, change, pause, or stop investments explicitly.

### Release And Learning Review

For consequential releases, verify acceptance evidence, record the decision, observe the outcome, and return product-level learning to the owning project's memory.

## Lifecycle State Machines

### Signal

```text
observed -> interpreted -> linked_to_outcome -> acknowledged
         -> disputed
         -> expired
```

### Decision

```text
proposed -> ready -> decided
                   -> deferred
                   -> rejected
decided -> translated_to_commitment -> verified
```

### Commitment

```text
draft -> ready -> active -> submitted -> accepted -> outcome_verified
                      |          |          |
                      v          v          v
                   blocked    changes     reopened
                               requested
```

### Work Packet And Agent Execution

```text
draft -> sealed -> assigned -> running -> submitted -> evaluated
                                                   -> selected
                                                   -> rejected
                                                   -> combine_requested
selected -> release_ready -> released -> outcome_observed
```

Lifecycle transitions must append audit events. Destructive replacement of history is not allowed.

## Executive Prioritization

PTI should not derive priority from a manually assigned color alone. Ranking must expose its factors:

- strategic outcome value
- urgency or decision deadline
- cost of delay
- dependency reach
- confidence in current standing
- evidence freshness
- reversibility
- required human attention
- available execution capacity
- active risk and failure evidence

The system may calculate a recommendation, but the CEO can override it with a recorded rationale.

## Work Packet Contract

Every executable packet requires:

- outcome and expected impact
- IAC: impact area context
- ADS: autonomous discovery scope
- ODD: output delivery direction
- owning project and repository
- starting branch or worktree policy
- allowed and forbidden mutation scope
- acceptance criteria
- required technical, evidence, and visual checks
- expected artifacts and preview route
- risk class and release authority
- learning destination after completion

Packets that do not satisfy the contract remain `draft`; they cannot become agent-ready.

## Parallel Agent Competition

Parallel execution is optional and should be used when alternative approaches have meaningful value.

Each competing lane receives the same sealed requirement packet but can carry an explicit bias such as safety, visual quality, completeness, simplicity, or experimentation. Each lane must have an isolated branch or preview and stable submission ID.

Reviewers score evidence-backed dimensions rather than style preference alone:

- requirement match
- outcome contribution
- technical correctness
- maintainability
- security and data safety
- regression risk
- UX and accessibility when applicable
- proof completeness
- release readiness

The selection record stores the winner, rejected alternatives, useful parts worth combining, and rationale. Learning returns to project memory.

## Exception Handling

The home surface promotes exceptions when:

- an outcome has no fresh evidence
- evidence sources contradict each other
- a decision deadline is approaching
- work is active without an owner or acceptance criteria
- an agent run has no submission evidence
- a submission lacks independent review
- a release occurred without outcome verification
- actual capacity allocation diverges materially from priority
- an external authority or credential blocks progress

## Mobile Operating Boundary

Mobile must support review, decision, approval, rejection, delegation, and concise evidence inspection. Complex packet authoring, multi-output comparison, data-model administration, and release debugging may remain desktop-first.

## Minimum Complete Vertical Slice

The first accepted slice must demonstrate one real outcome across the full loop:

1. ingest current project evidence with provenance
2. surface a material change and decision
3. record the decision
4. create and seal a work packet
5. assign an execution lane
6. attach a real submission and verification evidence
7. record an independent evaluation
8. select or reject the submission
9. record release state or a justified release block
10. observe and record outcome evidence
11. return a learning or next action to durable project memory

Anything shorter is a component demo, not an operating-system slice.
