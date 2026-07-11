# PTI Current-System Audit

Date: 2026-07-11
Branch: `codex/pti-refoundation`
Purpose: Evidence baseline for the PTI re-foundation

## Verdict

The existing PTI repository contains useful foundations, but the CEO command plane is not an operating system. It is a visually themed, mostly static portfolio registry with a shallow Firestore notes layer.

The implementation does not close the documented loop from evidence through decision, bounded delegation, parallel agent work, independent review, selection, release, outcome verification, and learning.

## Vision Translation Failure

The original PTI product tracks time invested against life domains, targets, tasks, and activities. The later CEO COE vision extends the same investment logic to project attention and Codex execution. The app currently exposes them as two separate launch tiles and unrelated data models.

Evidence:

- Original time-investment services use `users/{uid}/domains`, nested targets/tasks, and `users/{uid}/activities`.
- The home component offers separate `CEO Command Dashboard` and `PTI Dashboard` destinations.
- CEO action notes use `users/{uid}/codexProjects/{projectId}/actionItems` without outcome or allocation relationships.

This separation prevents PTI from answering whether human and agent capacity is aligned with strategic outcomes.

## Product And UX Findings

### Missing Execution System

The documented vision requires sealed work packets, isolated agent lanes, submissions, previews, review scores, winner selection, merge state, and learning capture. None of those are first-class records or usable workflows in the current UI.

The command page exposes:

- highest-risk project
- manually described required decision
- active blockers
- aggregate portfolio counts
- project cards
- recent free-text action notes

The project detail exposes a generic signal form and four note buckets. It does not expose changed evidence, outcome impact, decision options, commitments, packets, agent outputs, evaluation, release proof, or learning.

### Weak Executive Priority

The current `highestRisk` is the first project after sorting manually assigned tones and statuses. Strategic value, urgency, cost of delay, dependency reach, confidence, evidence freshness, reversibility, and available capacity are absent.

Git dirty state is useful operational evidence, but it has become a primary CEO signal without proof that it is the highest-value intervention.

### No Change Intelligence

The screenshots show current labels but not deltas. The CEO cannot see what changed since the last review, which blockers resolved, which claims became stale, or where sources contradict each other.

### Visual Shell Exceeds Operational Depth

The latest stored screenshots are readable and responsive enough to demonstrate a dashboard shell. The decorative dark control-room background, large hero, and repeated cards consume attention without adding decision capability. The detail page prioritizes data entry over comprehension.

## Data Integrity Findings

### Static And Duplicated Portfolio Truth

Portfolio facts are hardcoded in both:

- `new-codex-command.component.ts`
- `codex-projects.data.ts`

The registry is also maintained separately in JSON and Markdown. Component initialization writes hardcoded project snapshots into Firestore, so a page load can make stale source-code assertions appear like live database truth.

### Provenance Is Missing

Project snapshots and action items do not require source references, observed time, freshness, confidence, or contradiction state. A standing is stored as prose, not as a derivation from evidence.

### Shallow Action Model

An action item contains kind, text, status, source, project, and timestamps. It has no outcome, decision, owner, target proof, work packet, acceptance criteria, due state, dependency, agent run, submission, evaluation, release, or learning relationship.

### Legacy PTI Data Quality

The original domain, target, task, and activity services rely heavily on `any`, client-side nested collection scans, local-storage reporting caches, and debug logging. These records are valuable historical product data, but the implementation is not a reliable executive allocation ledger yet.

## Infrastructure Findings

### GitHub

Verified:

- GitHub CLI `2.92.0` is installed.
- The CLI had no stored `gh` login.
- Git remote access works through Windows Git Credential Manager.
- `scripts/gh-with-gcm.cmd` now obtains that existing credential at runtime without persisting or printing it.
- GitHub API access to `Wolfrine/PTI` is verified with `ADMIN` repository permission.

### Firebase CLI And Admin

Verified:

- Local Firebase CLI was upgraded from `13.33.0` to `15.23.0`; the `.cmd` entrypoint avoids the machine PowerShell script-policy wrapper issue.
- Local Firebase CLI has no interactive user session or Application Default Credentials.
- GitHub repository secret `FIREBASE_SERVICE_ACCOUNT` exists.
- GitHub Actions run `29149071301` passed reversible Firebase Admin Firestore write, read, and delete against `pti-app-2ab59`.
- Firebase project enumeration and Hosting site enumeration succeed with the service account.
- Historical workflow evidence shows Hosting deployment succeeds.

### Cloud Functions And MCP

Verified limitation:

- The service account cannot list or deploy Cloud Functions.
- Historical deployment run `27012771387` failed with HTTP 403 while checking `cloudfunctions.googleapis.com` through Service Usage.
- The current workflow hides this failure with `continue-on-error`.
- `https://pti-app-2ab59.web.app/mcp` returned HTTP 404 on 2026-07-11.
- Repository secret listing showed `FIREBASE_SERVICE_ACCOUNT` but not `PTI_MCP_API_KEYS`.

Therefore the documented MCP layer is code and intent, not a deployed operational capability. Cloud Functions requires a separate IAM correction. The Firestore and Hosting vertical slice can proceed independently through the verified Admin workflow.

The current MCP design must not be deployed unchanged. A single shared API key authorizes generic get, list, query, create, set, update, delete, and batch operations against arbitrary valid Firestore paths and accepts caller-supplied user IDs. Segment validation is not an ownership boundary. The replacement MCP must begin with narrow, owner-scoped, read-only operating tools and explicit audit records.

### Security Unknowns

- Firestore rules are not present in this repository, so deployed rule quality is not locally auditable.
- The command component performs an additional client-side email check, but client checks are not authorization controls.
- Production Firebase web configuration is intentionally public client configuration; it must be protected by Auth and Firestore rules.

### Additional Consistency Failures

- Angular action completion writes `status: completed`; the MCP completion path writes and filters a separate `completed` boolean. The two surfaces can disagree about the same record.
- Original PTI task completion, activity creation, and aggregate updates are separate client operations rather than one atomic transaction.
- Domain deletion does not cascade into target/task subcollections and can leave orphaned data.
- Local analytics cache keys are not user-scoped.
- The current frontend test suite is not healthy: the independent audit observed eight failures and one success, primarily from missing Auth/Firestore test providers. Existing CI does not run the frontend tests.

## Foundations Worth Preserving

- Google/Firebase authentication flow
- Angular standalone-component foundation
- user-scoped Firestore data
- Firebase Hosting deployment lane
- verified Firebase Admin secret for controlled migrations
- original PTI domains, targets, tasks, activities, and time-investment history
- CEO registry and PM-up/CEO-down concepts as historical inputs
- IAC, ADS, and ODD packet framing
- repository ownership and isolated-agent execution rules
- existing desktop/mobile screenshot harness as historical visual evidence

## Required Replacement

- Replace hardcoded project truth with provenance-backed operating records.
- Replace project-card-first navigation with change, outcome, decision, and exception surfaces.
- Replace generic action notes with decisions, commitments, work packets, runs, submissions, evaluations, releases, and learnings.
- Replace manual tone ranking with transparent prioritization factors and human override rationale.
- Replace optimistic MCP claims with capability checks and explicit authority states.
- Connect original time/activity records to outcome allocation rather than maintaining a disconnected legacy dashboard.

## First Vertical Slice

The PTI re-foundation itself is the first real outcome:

1. user decision: proceed autonomously with the best coherent vision
2. evidence: repository audit, UX review, Firebase/GitHub probes, current implementation state
3. commitment: build a real-data PTI executive operating loop on an isolated branch
4. work packet: constitution, scope, acceptance gates, and verification requirements
5. execution: main implementation lane plus independent vision, technical, UX, and data lanes
6. submission: branch, preview, tests, screenshots, migration report, and limitations
7. evaluation: independent product, technical, data, and visual review
8. selection: release-readiness decision
9. release: preview first; production only after the authority gate
10. outcome evidence: accepted operating workflow, not merely a deployed page
11. learning: update PTI product memory and future agent instructions

## Real Versus Reference-Only

Real:

- repository and Git history inspected locally
- current branch and remote facts
- Firebase Admin write/read/delete result
- Hosting/project access result
- GitHub repository-admin API result
- HTTP 404 from the hosted MCP route
- stored rendered screenshots of the prior UI

Reference-only or historical:

- June 5 PM standings until refreshed
- hardcoded component standings
- stored screenshots as representations of the previous build, not proof of current production state
- MCP code without a deployed reachable function
