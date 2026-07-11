# PTI Executive Experience Specification

Status: Implementation target
Date: 2026-07-11

## Experience Objective

PTI should feel like a disciplined executive operating workspace: quiet, dense, current, and decisive. It should minimize the time between noticing a meaningful change and taking a bounded, traceable action.

The first viewport is not a welcome page, project gallery, or analytics hero. It is the current executive brief.

## Primary Navigation

- `Today`: changes, decisions, delegations, verification, exceptions
- `Outcomes`: value, movement, allocation, confidence, proof
- `Execution`: commitments and sealed work packets
- `Agents`: runs, submissions, comparisons, evaluations, selection
- `Evidence`: signals, provenance, contradictions, freshness
- `Projects`: ownership contexts and deeper dossiers

Navigation uses a compact rail on desktop and a bottom bar or compact menu on mobile. The active section and unresolved count must remain visible.

## Today Surface

### Context Bar

Always visible at the top:

- current review time
- last successful evidence refresh
- fresh, stale, and conflicting source counts
- active execution lanes
- global refresh status

The context bar must never imply live data when the latest observation is historical.

### Executive Brief

The first desktop viewport has four operating columns or lanes, ordered by required judgment:

1. `Decide`: decision-ready questions with deadline, impact, recommendation, and evidence confidence
2. `Changed`: material deltas since the last acknowledged review
3. `Delegate`: sealed packets ready for an agent or human lane
4. `Verify`: submissions, releases, or claimed outcomes awaiting independent proof

Each row exposes one primary action and one evidence affordance. Detail opens in a side panel or focused route without destroying review context.

### Exceptions

A compact exception strip appears when needed:

- stale outcome
- contradictory evidence
- unowned commitment
- active run without recent signal
- submission without review
- release without outcome observation
- allocation drift
- authority or credential blocker

Exceptions are not mixed with ordinary project status.

### Outcome Pulse

Below the first viewport, outcomes appear as a compact table or list with:

- outcome and owning context
- priority and rationale
- movement since last review
- confidence and freshness
- planned versus actual allocation
- next proof point
- current intervention

No decorative progress percentage is shown unless it has a defined denominator and source.

## Outcome Dossier

The default dossier answers:

- What change are we trying to produce?
- Why is it valuable now?
- What evidence supports the current state?
- What changed recently?
- What decisions and commitments shape it?
- Where are human time and agent capacity invested?
- What proof would establish success or failure?

Sections:

- brief and success evidence
- movement timeline
- decisions
- commitments and dependencies
- allocation
- project links
- verification and learning

## Agent Workbench

The agent workbench is a real comparison surface, not an activity log.

### Work Packet View

- IAC, ADS, ODD
- allowed and forbidden scope
- repository and branch/worktree policy
- acceptance criteria
- risk and release authority
- required artifacts

### Run Matrix

Each run row shows:

- role or execution bias
- state and recency
- branch/worktree
- submission and preview
- build/test result
- evidence completeness
- independent review state

### Submission Comparison

Desktop supports side-by-side comparison of two or more submissions. Mobile supports one-at-a-time review with a fixed comparison summary.

Dimensions include requirement match, outcome contribution, correctness, maintainability, security, regression risk, UX when applicable, proof completeness, and release readiness.

The CEO can select, reject, or request combination. The action requires rationale and creates an audit event.

## Evidence Drawer

Every material state can open an evidence drawer containing:

- source type and location
- exact observed time
- freshness state
- confidence
- extracted claim
- derivation chain
- contradictory or superseding sources
- raw source link when available

The drawer distinguishes real, inferred, mock, concept, and reference-only artifacts.

## Project Dossier

Projects are operational contexts, not the main portfolio hierarchy.

Tabs:

- `Overview`: role, owners, repositories, current outcome links, latest changes
- `Work`: commitments and packets
- `Agents`: runs and submissions
- `Evidence`: PM handoffs, Git/GitHub, deployment, tests, analytics
- `History`: decisions, releases, learnings, audit events

The primary CTA depends on state, for example `Review decision`, `Seal packet`, `Inspect submission`, or `Refresh evidence`. A generic add-note form is secondary.

## Mobile Experience

The first mobile viewport contains:

- freshness and conflict state
- one highest-value required decision
- one material change or exception
- clear `Decide`, `Delegate`, or `Verify` action

Below it:

- swipe-free stacked queues for Decide, Changed, Delegate, Verify
- concise outcome pulse
- recent verified movement

Mobile must support:

- inspecting concise evidence
- choosing or deferring a decision
- approving/rejecting a packet
- selecting an agent submission after review
- acknowledging an exception

Complex packet authoring and multi-column comparison remain desktop-first.

## Visual Language

- neutral light workspace with high-contrast text
- compact dark navigation rail, not a full-page dark theme
- limited semantic colors: red for urgent failure, amber for attention, green for verified movement, blue for active execution, gray for unavailable/stale context
- no background photography, glassmorphism, gradient decoration, or oversized hero typography
- 4px to 8px radii
- stable row heights and responsive constraints
- icons for familiar actions, always with accessible labels/tooltips where needed
- tabular numerals for counts, dates, confidence, and allocation
- text density appropriate to executive scanning; no explanatory marketing copy inside the product

## Required States

Every operating surface designs and verifies:

- loading
- empty with next valid action
- partial data
- stale data
- conflicting data
- unauthorized
- offline/cached
- failed refresh
- blocked by authority
- complete with verification

## First-Slice Screens

The first implementation includes:

1. `Today` executive brief using the 2026-07-11 real baseline
2. PTI re-foundation outcome dossier
3. PTI re-foundation work packet and active agent runs
4. evidence drawer for GitHub, Firebase Admin, UX audit, and Functions IAM blocker
5. release-readiness decision showing passed and blocked gates

GTOP appears as a real pending outcome with stale/historical evidence clearly labeled. It is not represented as actively fixed by this PTI implementation.
