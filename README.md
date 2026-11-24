# PTI Home

PTI is the authenticated home for the owner's personal apps. **The current dashboard is `/home`**, the app launcher shown after Google sign-in at https://pti-app-2ab59.web.app/home. It contains pinned/recent apps, search, categories and private Codex usage readings from the owner's Windows PC.

Start with [AGENTS.md](AGENTS.md) before implementation. The current Home design contract is [pti-app/design/codex-usage-review.md](pti-app/design/codex-usage-review.md); [monitor setup and removal](tools/codex-usage-monitor/README.md) describe the local collector and Windows task.

## Current surfaces

- `/home`: the dashboard and app launcher. It includes private Codex and [Development Resources](docs/platform-usage.md) readings. Its curated apps include Self-Tracking, Morsel, Venture, Personal, Luminary, SEFPO Lab, Civilization Atlas, Wedding Planner, One Piece, Noveliaa, GTOP, Growth Tutorials Hub, Growth Tutorials and Luminar Robotics. StoryForge and other source-only or not-yet-verified work appear on the workbench instead. Velum remains deliberately absent from the curated directory.
- `/atlas`: [Civilization Atlas](pti-app/atlas/README.md), a guarded PTI feature connecting a bounded public knowledge map with private project evidence and explicitly self-reported progression. Its [agent contract](pti-app/atlas/AGENT.md) uses the existing PTI MCP and owner-only Atlas namespace.
- **Finance** is the dedicated household ledger accessible from Home. Its recorded totals, source coverage and corrections live in the owner workspace, with Gmail intake and month close through PTI MCP. See the [Finance release and data contract](docs/finance/README.md).
- `/` and `/login`: the existing Google sign-in flow; normal authenticated return is `/home`.
- `/domains`, `/domains/:domainId`, `/activities`: retained standalone legacy tools. Their saved data remains intact, but they are not the dashboard or launcher entries.

`/dashboard`, `/new-dashboard`, `/codex-command` and its project-detail URLs are retired redirects to `/home`. Their components and exclusive services were removed. **Do not revive CEO Command or infer current product direction from old PM snapshots, Git history or historical design notes.** The prior time-investment/CEO intent is preserved in [one retirement archive](docs/archive/retired-dashboards.md).

## Data and delivery

Use the existing `pti-app-2ab59` Firebase project, default Firestore database and Google authentication. Codex readings use `users/{uid}/codexProjects/codex-usage` with credentials encrypted locally under Windows DPAPI. The separately scheduled infrastructure summary uses the owner-only, server-written `users/{uid}/resourceUsage/current` document; provider credentials stay in GitHub Actions secrets and are never sent to the browser. No model inference, session scraping, tool tracking or additional database is involved.

Frontend: `cd pti-app`, `npm ci`, `npm test -- --watch=false --browsers=ChromeHeadless`, `npm run build`. Collector: `cd tools/codex-usage-monitor`, `npm ci`, `npm test`, `npm run probe`. The probe reads real account usage without publishing.

The owner-only GT Papers card on Home shares the existing PC & workers snapshot and links to GT Papers. Start and recovery are managed on the Windows host. The [local service initiator](tools/local-service-initiator/README.md) still handles explicit One Piece starts. Keep it enabled for One Piece during heavy-process cleanup.

For authorized changes, test and commit directly to `main`. `.github/workflows/firebase-deploy.yml` retains the existing checks and Firebase deployment identity, deploys guarded shared rules, verifies real client privacy, and publishes Hosting. A passing build is separate from an authenticated live Home inspection and a verified local scheduled reading.

## Repository housekeeping

Keep app source, active deployment/MCP paths, tests, original artwork and current acceptance records in the working tree. Generated hosting caches, retired PM/preview adapters and unstarted visual-experiment scaffolding were removed. Superseded screenshots and repeated test logs remain available in [the pre-cleanup revision](https://github.com/Wolfrine/PTI/tree/78553b47adfd7105da410e1a9f6cf66fb36c29b9); historical document links point there. Current evidence referenced by code, tests or acceptance metadata remains tracked. Luminary's selectable experience versions are unchanged.
