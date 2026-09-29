# PTI personal harness

PTI is the permanent home for rapid personal PWAs. Central is a design reference only. Preserve PTI, Velum and Luminary. No new database, duplicate collector or in-app model API.

## Architecture
- `personal-app/`: Today, Capture, Threads, Reflection and controls. Google session sign-in; direct Firestore SDK.
- Existing project `pti-app-2ab59`, database `(default)`, private root `users/{uid}/personalData/workspace`. Never overwrite or recursively delete `users/{uid}`.
- Existing Daily Intelligence Briefing task is the intelligence backend: research, explicit feedback, verified publication. Read `agent.md` for the compact contract.
- Shared OAuth MCP: `tools/pti-mcp/`. `pti_apps_list`, `pti_health`, `personal_context`, `personal_publish`; connected-owner scoped. Captures excluded. Reflection can accompany publication, validated against the day's actual feedback in the transaction.
- Data collections: captures, threads, feedback, editions, runs, reflections. Client may read/delete its agent outputs, not forge them. Reset feedback rotates generation and removes dependent reflections.
- `.github/workflows/personal.yml` tests contracts, browser flows, real client authorization and live Hosting files. Existing rules release only; reviewed-source guard prevents blind overwrite. Shared MCP deploy is `.github/workflows/pti-hosted-mcp.yml`.

## Start / verify
`node personal-harness/create-app.mjs <slug> "App name"` creates an undeployed starter. Define purpose, permissions, distinctive interface and acceptance tests first.
`node --test personal-harness/*.test.mjs`; `node personal-harness/build.mjs`; install personal-functions dependencies and Playwright Chromium, then `node personal-harness/browser-test.mjs`.

Private records and credentials never belong in GitHub or public logs. Declared goals are authoritative. No advertising trackers, passive surveillance, confidential employer data or inferred sensitive identity. Provider terms still apply. Source images, generated illustrations and native fallback sketches are distinguished. A primary source is not automatically independent verification.

Live account-scoped MCP reads and edition publishing were verified on 29 September 2026. New feature/deployment status must be read from actual workflow outcomes and current run records, not inferred from these instructions.
