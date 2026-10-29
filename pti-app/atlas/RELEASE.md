# Civilization Atlas first PTI release

Release date: 29-Oct-2026. Live route: [PTI /atlas](https://pti-app-2ab59.web.app/atlas), also available from Home's Knowledge category. This is the first working Layer 1 + Layer 2 release, not a complete encyclopedia or implementation of all future layers.

## Published implementation

- Feature commit: [fcb4d708](https://github.com/Wolfrine/PTI/commit/fcb4d7080c03edea6abbc1948bfb67f9f8cceed8).
- Canonical app-discovery acceptance correction: [5a4039dc](https://github.com/Wolfrine/PTI/commit/5a4039dc50de3054cad280dfbdea24e8108e06a3).
- Successful frontend/rules release: [40880448326](https://github.com/Wolfrine/PTI/actions/runs/40880448326).
- Successful shared MCP release: [40880448313](https://github.com/Wolfrine/PTI/actions/runs/40880448313).
- Hosted MCP revision: `pti-firestore-mcp-00024-z4v`, serving all traffic at verification.

The initial MCP attempt stopped before deployment because an existing acceptance script expected exactly eight apps. Atlas made nine. The script now verifies unique canonical app IDs, with six offline regressions; the subsequent live deployment and acceptance succeeded. No security check was removed.

## Verified output

The application includes 12 sectors and 36 starting subjects: ten sourced seeds and 26 explicitly unpopulated outlines. Explore subjects, view sourced foundations and related subjects, review evidence, record a separate self-reported position, inspect immutable history/receipts, approve bounded sources, refresh/page data and export the loaded selection. Loading, partial, error and absent coverage remain explicit.

The private baseline was seeded only after owner-isolation verification. All created documents were read back. Hosted acceptance then replayed the already-existing run, received the exact original receipt and verified its evidence update times were unchanged. Private baseline payloads, owner UIDs and private source locators are not included in the Atlas release's public artifacts.

| Verification | Observed result |
| --- | --- |
| Angular application tests | 83 passed |
| MCP unit/integration tests | 58 passed |
| Replay-only hosted acceptance helper | 9 offline regressions passed |
| Canonical app-discovery verifier | 6 offline regressions passed |
| Public asset-graph verifier | 10 offline regressions passed |
| Synthetic browser workflows | 10 passed |
| Responsive/contrast state cases | 22; no overflow/clipped controls, runtime errors or computed text-contrast failures |
| Live client privacy and atomic history | 23 passed; synthetic probes and identities removed |
| Hosted account-boundary and replay checks | Passed; generic Atlas writes rejected, original evidence unchanged |
| Build | Production and synthetic-preview builds passed; existing soft size warnings retained, hard budgets not raised |

## Public production identity

The read-only comparison of the deployed build with the reviewed local candidate verified the exact source marker and seven generated assets: five byte-identical, two differing only in proven generated-filename references. Three generated files had different names between the local Node 24 and CI Node 22 builds. The complete entry HTML also matched after that same filename mapping; source code and dependency edges did not differ. See [production-asset-verification.json](../design/atlas/production-asset-verification.json).

The verifier rejects altered source, new/missing/unmapped dependencies, ambiguous mappings, changed dependency edges and injected or otherwise changed entry HTML. CI retains both its offline regression suite and post-deployment verification. Filename relinking is not described as raw byte identity.

## Design and verification limits

Three visual directions were compared and five substantive implementation/review cycles completed. Independent critic overall 8.3, parent overall 8.2; all critical dimensions reached eight. [Design evidence](../design/atlas/README.md) binds the candidate, 17 final renders and role-specific judgments. These are agent reviews, not owner acceptance.

Visual and interaction tests used clearly labeled synthetic fixtures. A signed-in owner-browser session was unavailable; no such inspection is claimed. Actual private persistence, live rules, account boundaries and deployed MCP replay were verified separately. Computed solid-color text contrast is a bounded audit, not a full accessibility certification.

The source importer is not a crawler. Agents still retrieve permitted source records through their configured connectors, then import with the existing PTI tools. A stale ChatGPT tool catalog may require refreshing the PTI connection before the newly added tool names appear. No separate plugin, paid service, domain, scheduler or whole-account source permission was added.

Next substantive work is deeper sourced Layer 1 content and bounded Layer 2 evidence/review. External comparison, exploratory hypotheses and TV automation remain later, as agreed in [PLAN.md](PLAN.md).
