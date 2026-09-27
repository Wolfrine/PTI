# PTI personal harness

PTI is the permanent home for rapid personal PWAs. Central is a design reference only. Preserve PTI, Velum and Luminary. No new database, master repo, duplicate collector or in-app model API.

## Architecture
- UI: `personal-app/` — Today, Capture, Threads and controls. Google sign-in and direct Firestore SDK; no server function required for saving, export or deletion.
- Data: existing project `pti-app-2ab59`, database `(default)`, private root `users/{uid}/personalData/workspace`. Never overwrite or recursively delete `users/{uid}`.
- Intelligence backend: the existing **Daily Intelligence Briefing** scheduled ChatGPT agent, not GitHub cron. It researches news, reads declared direction and explicit feedback through the scoped MCP, then publishes a validated edition. Read `agent.md` for its contract.
- MCP adapter: `personal-functions/index.cjs`; `personal_health`, `personal_context`, `personal_publish`. No arbitrary paths; captures excluded. Article thoughts reach the agent only when explicitly shared as feedback. Keys are owner-scoped, expiring and revocable.
- Deployment: `.github/workflows/personal.yml` verifies contracts, browser flows, real client authorization and live Hosting files. It updates the existing rules release; it never creates a database or enables billing. UI readiness and MCP readiness are separate.

## Start and test
`node personal-harness/create-app.mjs <slug> "App name"` creates an undeployed starter. Complete its purpose, data permissions, distinct interface and acceptance tests before deploying. Shared infrastructure does not imply identical screens.

Run `node --test personal-harness/core.test.mjs`, then `node personal-harness/build.mjs`. Browser checks: install `personal-functions` dependencies and Playwright Chromium, then `node personal-harness/browser-test.mjs`.

## Boundaries and status
Private records and credentials never belong in GitHub or public logs. Declared goals are authoritative; feedback changes selection, not the goals. No passive surveillance, advertising SDK, confidential employer data or inferred sensitive identity. Provider terms still apply.

Rules preserve the reviewed legacy access policy outside Personal and exclude Personal from that broad policy. A changed live ruleset must be reviewed rather than overwritten blindly. Failed publication retains the previous edition; a task prompt is not evidence of a successful MCP call.

The current Firebase project is on Spark; the existing Functions MCP deployment is blocked and its API-key secret is absent. This release does not upgrade billing. The scoped adapter still needs an authenticated host and connection to the scheduled agent. Check the actual deployment artifact and MCP health before claiming the full loop works.
