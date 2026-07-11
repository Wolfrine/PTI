# PTI Re-foundation Release Report

Status: Ready for preview
Date: 2026-07-11
Branch: `codex/pti-refoundation`

## Scope Delivered

- Recovered and codified PTI's time, attention, outcome, decision, delegation, verification, and learning vision.
- Replaced the registry-style command page with an outcome-first executive operating surface.
- Added typed, provenance-bearing operating records and owner-scoped Firestore persistence.
- Added auditable owner actions for decisions, work-packet transitions, and release approval requests.
- Added lifecycle transition guards, versioned Firestore rules/indexes, seed reconciliation, and isolated Hosting preview automation.
- Preserved production and rejected deployment of the unsafe generic arbitrary-path MCP implementation.

## Evidence

- Firebase Admin reversible write/read/delete: GitHub Actions run `29150505966`.
- Firestore seed reconciliation: run `29150644932`, 24 expected documents before the accepted-review records were added.
- Accepted preview build/deploy: run `29150876380`.
- Preview: <https://pti-app-2ab59--pti-refoundation-y13o3pjz.web.app>
- Independent review v1: changes requested for inspect-only actions and unenforced lifecycle transitions.
- Independent review v2: preview acceptance passed after commit `9003cbe`.
- Final visual evidence: `.codex-visual-checks/pti-refoundation/final-accepted-desktop.png` and `final-accepted-mobile-390.png`.

## Verification

- Angular browser tests: 13 passed.
- Angular production build: passed; one pre-existing style-budget warning remains in `codex-project-detail`.
- Functions TypeScript build: passed on Node 22 configuration.
- Firestore emulator rules: 4 passed, including cross-user, anonymous, and outside-owner denial.
- Responsive inspection: 1440x1000 and 390x844, zero horizontal overflow.
- Hosted preview login boundary: verified; command routes remain owner-authenticated.

## Data Classification

The owner Firestore operating ledger, GitHub/Firebase probes, workflow runs, preview URL, review results, and screenshots are real observed evidence. The development-only `/codex-command-preview` route renders the same versioned baseline fixture for safe unauthenticated inspection and disables mutations; it is reference-only and excluded from production routing.

## Remaining Gates

- Production promotion requires the explicit CEO decision currently shown in the Decide queue.
- Firestore rules are versioned and emulator-tested but are not deployed until production approval.
- Cloud Functions and MCP remain blocked by missing Service Usage/Functions IAM. The generic MCP must not be deployed even after IAM is granted; it needs purpose-specific least-privilege tools.
- Eight moderate transitive dependency advisories remain in the legacy Google Cloud dependency chain; no high or critical production advisories remain.
