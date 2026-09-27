# PTI personal harness

PTI is the permanent home for rapid, personal PWAs. Central supplies design guidance only. Preserve PTI, Velum and Luminary. No new master repository, duplicate wiki or in-app model API.

## Start here
- First app: `personal-app/` (Today, Capture, Threads). Its local visual contract is `personal-app/design/README.md`.
- Runtime: `personal-functions/`; isolated Firestore database `personal` inside existing project `pti-app-2ab59`. Existing default database/rules/functions/Hosting targets are not replaced.
- Deploy: `.github/workflows/personal.yml` with `firebase.personal.json`. Only deploy after tests. Failed source collection retains the previous valid edition.
- New app: `node personal-harness/create-app.mjs <slug> "App name"`. Complete the generated contract before implementing/deploying. Shared infrastructure does not require identical interfaces.
- Test: `node --test personal-harness/core.test.mjs`; build: `node personal-harness/build.mjs`; browser checks: `node personal-harness/browser-test.mjs` after installing `personal-functions` dependencies and Playwright Chromium.

## Boundaries
User records are private runtime data, never GitHub content. Declared direction is authoritative; explicit source feedback influences selection within it. Original captures, declared settings and published interpretations remain separate. No passive browsing/music surveillance, ad SDK, confidential employer data or in-app LLM calls. Credentials are never logged or committed. Provider terms still apply.

## Current loop
Daily GitHub source collector at approximately 08:00 Asia/Kolkata: allowlisted RSS → canonical-URL deduplication → dated candidates → topic/geography constraints → bounded explicit source feedback → validated five-item edition. It is a deterministic source collector, not an LLM. It does not interpret free-text directions or check the truth of a publisher's claims. The interface says so. Inadequate sources fail visibly rather than fabricating content. Region labels describe source scope, not necessarily the event location.

An external reviewing agent can use the separate account-scoped MCP endpoint `/mcp`. The owner creates a 30-day key in Settings; connecting it to an external host is a separate step. Available tools: `personal_health`, `personal_context`, `personal_publish`. Context excludes captures and includes only opted-in question titles. Publication checks current settings version/generation and paused state in a transaction. No arbitrary paths or generic Firestore writes. Read `agent.md` only for that task.

## Release and next steps
First release implements capture, questions, explicit feedback, direction editing, pause, export, deletion, scoped MCP, source collection and deployment/security/browser checks. Keep actual run/deployment results as the status source; a workflow file alone is not proof of execution.

Next: connect and test an external reasoning agent through the scoped endpoint; improve evidence-based curation; create a second distinct research experience from a demonstrated need. Spotify/YouTube and cross-app personal profiling are not enabled. Existing general PTI MCP is not redirected into this database.
