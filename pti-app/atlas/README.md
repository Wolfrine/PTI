# Civilization Atlas in PTI

Civilization Atlas lives **inside PTI**, not in another repository or application hub.

| Output | Owning location |
| --- | --- |
| Website | `https://pti-app-2ab59.web.app/atlas`, behind PTI's existing Google sign-in |
| Launcher | `/home` → Civilization Atlas, Knowledge category; existing pins remain unchanged |
| Code and releases | `Wolfrine/PTI`, `main`, existing Firebase and hosted-MCP workflows |
| Frontend | `pti-app/src/app/components/new-atlas/` and `services/atlas.*` |
| Public knowledge seed | `services/atlas.catalog.ts`: 12 sectors, 36 subjects, explicitly bounded seed/outline coverage |
| Private account data | `users/{uid}/atlasData/workspace`; authenticated owner only |
| Agent integration | Existing PTI connection, `tools/pti-mcp/src/atlas*.ts` |
| Project decisions | The private Civilization Atlas Space; not raw discussion capture in this public repository |

## What the first release does

1. Explore sectors, open a subject, inspect sourced foundations and related subjects.
2. See project evidence alongside the subject, with exact source, revision, dates and limitations.
3. Link, dismiss or request context for evidence. **Linked is not verified mastery.**
4. Declare a personal position: Unassessed, Exploring, Learning, Practicing, Applied or Paused. It is explicitly self-reported.
5. Retain immutable before/after history for reviews, progression and source consent.
6. Approve bounded sources, pause future capture, and manually initiate a connected agent using the on-screen prompt.
7. Refresh or page bounded collections and export the loaded selection. Partial/unloaded state remains visible.

The initial private baseline is a bounded, pending selection. It is not an exhaustive inventory of the owner's work, an automatic assessment of competence, or a real-time source scan. Private baseline files and account identifiers must never be committed to this public repository.

## Agent startup and capture

Follow [AGENT.md](AGENT.md). Start with `pti_apps_list`, `pti_app_context` for Atlas and `atlas_context` for enabled sources. Imports use `atlas_import_evidence`, at most 20 records per run. Source approvals support up to 8 exact locations and 4 bounded GitHub/owner-Tracker prefixes per source. A page or collection's `complete` flag describes pagination only, not human knowledge or all project activity.

No schedule, background crawler, paid inference service, new Firebase project or new domain is introduced. The browser reads six private collections in bounded pages, caches only in memory, and clears them on account changes. It does not maintain a full-store listener or scan other apps on page load.

## Delivery and safety

Rules are deployed and tested **before any private Atlas seed is written**, because the pre-Atlas legacy wildcard otherwise permits authenticated access to unexcluded namespaces. The rules isolate Atlas while preserving sibling namespaces. Evidence, capture receipts and source state are server-written; owner edits to reviews/progression/consent require an atomic immutable event. Generic Admin-backed connector writes reject Atlas after the specialized MCP release.

The one-time bootstrap uses `prepareAtlasBootstrap`: an offline, create-only plan. It does not grant access or bypass rules. Every target must first be absent, each bounded group is atomic, and every document is read back before activation is claimed.

### Verification

```sh
npm test --prefix pti-app -- --watch=false --browsers=ChromeHeadless
npm run build --prefix pti-app -- --configuration production
npm test --prefix tools/pti-mcp
node --test tools/pti-mcp/scripts/verify-atlas-host.selftest.mjs
node tools/codex-usage-monitor/scripts/check-home-contract.mjs
node apps/one-piece/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only firestore --project demo-atlas-tests --config firebase.one-piece-tests.json 'node --test personal-harness/tests/atlas.rules.test.mjs'
```

The emulator requires Java 21 and the existing locked One Piece test dependencies. `node tools/pti-mcp/scripts/verify-atlas-live-rules.mjs` runs only in the authorized deployment context: it uses two temporary synthetic identities, proves isolation and atomic history, and removes its exact generated documents and identities. Never substitute an owner's token or private data for the synthetic probe.

Local visual/interaction testing uses the separate `atlas-preview` build configuration and `src/dev-atlas-preview.ts`. This entry contains synthetic data and is **not** imported by production `main.ts`. It is not an authentication bypass. Keep production and preview output directories distinct.

With that preview served on loopback and Playwright available, `node atlas/tests/browser-qa.cjs http://127.0.0.1:4206/ /tmp/atlas-qa.json` runs the interaction, keyboard, responsive and computed text-contrast checks from `pti-app`. `CHROME_BIN` can point to an installed Chromium. `atlas/tests/capture.cjs` captures the state-identified synthetic review set. Both refuse a non-loopback target. Production persistence and account isolation are tested separately; a synthetic UI test is not a signed-in owner browser inspection.

## Deliberately later

The agreed sequence is (1) humanity's established knowledge, (2) our knowledge/work, then (3) changes elsewhere and comparison, and only then (4) new connections/ideas. This release builds the first two foundations. Automated world monitoring, broad content ingestion, AI competence scoring, TV casting/scheduling and speculative ideation are not silently included. Their next activities and acceptance criteria are in [PLAN.md](PLAN.md).
