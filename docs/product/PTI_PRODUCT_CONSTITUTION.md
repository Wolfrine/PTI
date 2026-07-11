# PTI Product Constitution

Status: Active re-foundation baseline
Date: 2026-07-11

## Product Identity

PTI is an executive direction and execution system built around one principle:

> Time, attention, and agent capacity are investments. Their value is measured by the outcomes and learning they produce.

PTI began as Profitable Time Investment for personal domains, targets, tasks, and activity tracking. The CEO COE work extended that idea to projects and autonomous Codex execution, but the implementation separated the two into unrelated dashboards. The re-founded product joins them into one operating model.

Projects are context containers. Tasks are commitments. Neither is the primary unit of value. The primary unit is an outcome: a change worth producing, with evidence that can prove movement.

## North Star

PTI helps the CEO allocate scarce human and agent capacity to the most valuable outcomes, make timely decisions from traceable evidence, and close the loop from direction through execution to verified result and reusable learning.

Within five minutes, the executive home must answer:

1. What materially changed since the last review?
2. Which outcomes are advancing, slipping, or unsupported by fresh evidence?
3. Which decisions require human judgment now?
4. Which work can be delegated safely now?
5. What are active agents producing, and where can their outputs be inspected?
6. What proof supports each reported state?
7. Where is time and agent capacity being invested relative to intended priorities?

## Core Operating Loop

```text
evidence signal
-> interpretation
-> outcome impact
-> decision
-> commitment
-> sealed work packet
-> execution lane
-> submission and proof
-> independent evaluation
-> selection or rejection
-> release
-> outcome verification
-> learning and allocation adjustment
```

PTI is incomplete when it only displays state. It must help advance an item through this loop while preserving authority, evidence, and history.

## Product Principles

### Outcomes Before Projects

The home surface ranks outcome movement and decisions. Project metadata supports that judgment but does not dominate it.

### Evidence Before Confidence

Every material standing must identify its source, observed time, freshness, and confidence. Stale, contradictory, missing, and inferred states must be visible.

### Decisions Before Dashboards

The first screen is a decision and intervention surface, not a gallery of project cards or aggregate counts.

### Delegation With Boundaries

Agent work starts from a sealed packet containing impact context, discovery scope, delivery direction, repository, branch, allowed scope, forbidden scope, acceptance criteria, and evidence requirements.

### Independent Review Before Acceptance

An agent reporting completion is not evidence of completion. Outputs require tests, artifacts, previews, and an independent evaluation appropriate to their risk.

### Closure Before Activity

PTI should expose work that is active without proof, decisions without follow-through, completed tasks without outcome verification, and learnings not returned to project memory.

### Allocation Must Be Accountable

Planned and actual human time, agent capacity, and review attention should be attributable to outcomes. PTI should reveal allocation drift rather than reward visible busyness.

### Executive Density Without Theater

The interface should be quiet, legible, and information-dense. Visual treatment must improve comparison and judgment. Decorative control-room styling is not a substitute for operational capability.

## Primary Users

### CEO

Sets direction, allocates capacity, resolves tradeoffs, approves consequential work, selects among reviewed submissions, and verifies whether outcomes were achieved.

### Project PM Agent

Reads project-owned evidence, produces a provenance-backed project brief, receives CEO task packets, and tracks closure without silently changing implementation state.

### Builder Agent

Executes a sealed work packet in an isolated lane and returns code, artifacts, tests, preview evidence, limitations, and handoff notes.

### Reviewer Agent

Evaluates requirement match, evidence quality, technical risk, visual quality, security, regressions, and release readiness independently from the builder.

### System

Ingests evidence, detects freshness and contradictions, enforces lifecycle transitions, records audit history, and prepares decision-ready summaries without inventing facts.

## Non-Goals

PTI is not:

- a generic project portfolio dashboard
- a Git dirty-state monitor
- a card-based task tracker
- an AI chat shell
- a repository browser
- an unverified status-report generator
- a replacement for project-owned code, wiki, raw evidence, or technical documentation
- a system that grants agents random implementation access

## Authority Boundaries

- PTI owns ecosystem direction, operating records, allocation, decisions, work packets, evaluations, and cross-project standing.
- Project repositories own product memory, implementation, tests, releases, and detailed evidence.
- PM refreshes are read-first and write only to their project `.pm` space unless separately authorized.
- Builders work in isolated branches or previews.
- Production promotion requires an explicit release gate and verified rollback path.
- Missing authority is a visible blocked state, never silently bypassed.

## Success Definition

PTI is worthy when it repeatedly converts real ecosystem evidence into better allocation, faster decisions, safely delegated execution, independently verified releases, and durable learning with less manual coordination from the CEO.

It is not successful because a dashboard renders, a report exists, an agent ran, or a deployment completed.
