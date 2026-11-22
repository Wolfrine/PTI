# PTI Finance

PTI Finance reconstructs the household's own financial activity in the existing PTI Firebase project. The requested historical window is 22 November 2023 through 22 November 2026 inclusive in Asia/Kolkata. It spans 36 elapsed months and touches 37 calendar months. The two November bookends are partial periods. Email received during a period is discovery evidence. The transaction and statement dates determine ledger and coverage periods.

The application uses the dedicated Finance Hosting site, Firebase Google sign-in and the Finance-only owner namespace at `users/{uid}/financeData/workspace`. The project checkpoint at `projects/pti-finance-v1` carries the original acceptance stages and runtime receipts.

| Phase | Evidence and remaining gate |
| --- | --- |
| 1. Discovery and coverage | 2,231 HDFC candidates indexed across 37 months. Five real UPI alerts passed normalization. Five actual HDFC, CDSL and Groww PDFs recovered through raw Gmail MIME declared encryption. Posting rows and household statement coverage remain unavailable. See [Gmail intake](gmail.md). |
| 2. Central design and UX | Three structural directions reviewed against Central, PTI Home and product references. Monthly statement selected. Authenticated desktop and mobile renders and critique cycles remain open. See [design](design.md). |
| 3. Ledger and reconciliation | Owner rules, immutable intake, revisioned entries and monthly projections shipped. The review exclusion was verified in memory with the five real alerts. Authenticated intake, replay and issuer reconciliation remain open. See [MCP contract](mcp.md). |
| 4. Production application | Finance Hosting and the PTI Home bundles were verified live. The official browser host was unavailable. The owner sign-in, navigation, corrections and desktop/mobile layouts still need browser inspection. |
| 5. Gmail and monthly automation | The existing hourly Gmail Intake and monthly Review schedules are recorded in `automationReceipts`. First successful authenticated runs and ledger and monthly-analysis readback remain open. |
| 6. Independent audit and release | The independent source review led to fixes in cross-source deduplication, legacy endpoint isolation, navigation, and partial-month amounts. Remaining gates are authenticated read/write/replay, statement-level coverage and rendered verification. |

## Release

The existing PTI shared MCP workflow publishes the account-scoped host from `main`. The Finance Hosting workflow uses the same Firebase delivery identity as PTI and the standalone Morsel lane. It builds only the Finance assets, authorizes the two Finance domains and verifies served bytes. PTI Home follows the existing Home Hosting workflow.

Use the existing shared Firestore rules publication workflow with `change_scope=finance` and the exact inspected production ruleset name. The Finance scope preserves unrelated live rules and applies the Finance block and the matching legacy wildcard exclusion. The Finance deployment needs that revision in production before any intake writes.

On 22 November 2026, the shared rules check passed for `cf3624f69b931e124648c9e4b0d9f407b1a7a6d2`. The reviewed Finance-only publisher ran against the exact prior production ruleset from `caf030523599d1902f595ea9fca4effb3e784727`, using the existing owner ADC because the connected GitHub tool supports workflow reads. Its readback confirmed live ruleset `43ce8d09-7250-4cbb-aa10-120d82bc1300`. Before intake, verify that the legacy Firebase Functions MCP credential path is disabled or that the deployment serves the Finance exclusion. [Shared rules verification](https://github.com/Wolfrine/PTI/actions/runs/45042919595)

## Production evidence on 22 November 2026

- [Finance](https://pti-app-2ab59-finance.web.app/) served the seven app assets byte-for-byte from `ecb39f9854d0e8b5808db87c1058a70a860893d3`, with no-store and framing protection. The [PTI Home](https://pti-app-2ab59.web.app/home) bundles contained the Finance tile and site URL. [Finance Hosting run](https://github.com/Wolfrine/PTI/actions/runs/45043384740), [Home Hosting run](https://github.com/Wolfrine/PTI/actions/runs/45043384675)
- The hosted MCP published `7fa1d7442b4f902efbe17eaded46fbb7b9b166d6`. Authenticated PTI calls returned Finance app context and the existing project checkpoint. Generic ledger access was denied. The new correction endpoint returned 204 for the Finance CORS preflight, 401 for a signed-out Finance request and 403 for the PTI Home origin. An anonymous Firebase read of the checkpoint returned 403. [Hosted MCP run](https://github.com/Wolfrine/PTI/actions/runs/45043533818)
- The legacy Functions MCP skipped optional deployment because its CI key is absent. Live configuration names showed that the single serving revision has no `PTI_MCP_API_KEYS` environment variable. Its anonymous request returned 401. The source on `main` includes the Finance exclusion for future legacy releases. [Functions and Home deploy job](https://github.com/Wolfrine/PTI/actions/runs/45043533769/job/137273109387)
- Read-only Firestore aggregate queries found zero transactions and zero month documents. All 37 touched calendar month buckets remain uncovered. The browser host error and callable-tool inventory gap leave live owner/outsider behavior, importing a real message, replaying it, producing a month report and scheduling both jobs open.

For a local Finance build, run `node finance-app/scripts/build.mjs --out H:/Workspace/Builds/PTI/finance-production`. Keep cloud rule release, Hosting asset identity, tool discovery, recorded data and actual browser verification as distinct evidence in the project checkpoint.

## History and monthly analysis

Overview uses the selected India-local ending date to calculate a 36-month window. The original 22 November 2023 through 22 November 2026 window yields 37 buckets including the two clipped November boundaries. The app makes one bounded range query of calendar projections and uses bounded posted-ledger evidence for clipped date amounts. The selected bucket links to the ledger and source coverage for its dates. The chart and date list show the recorded earned income, cash outflow and net cash movement with unsupported values unavailable. Gmail search inventory alone supplies no chart amounts.

Reports reads the current analysis from the existing owner-readable month projection. `finance_publish_monthly_analysis` binds each version to the exact reconciled report and validates cited records against that month. It generates prose from selected finance measures and authorized ledger evidence. The immutable analysis remains auditable when new evidence supersedes its projection. See the exact [MCP publication contract](mcp.md).

### Continuation release on 22 November 2026

- Finance Hosting and the shared PTI MCP both passed at `cc436f96968166d7fecd2a6f0ca829406252f7c6`. All eight live browser assets matched the commit bytes. Runtime date calculation returned 37 monthly buckets, 35 complete calendar spans and the exact two clipped November ranges. Anonymous Firestore reads of the month and analysis paths returned `403`. The authenticated PTI catalog returned the monthly-analysis writer, and generic Finance reads returned the specialized-tools denial. [Finance Hosting workflow](https://github.com/Wolfrine/PTI/actions/runs/45045544863) · [Shared MCP workflow](https://github.com/Wolfrine/PTI/actions/runs/45045544852)
- The raw Gmail inspection recovered five authentic PDF parts in memory. All five trailers declared encryption and their ledger rows remain unavailable. The five eligible real UPI alerts normalized under the stricter sender check and remained in review. The indexed candidates still establish discovery coverage only. [Statement inspection record](gmail.md)
- The official browser reported “The browser access host is unavailable.” Independent source review covered chart geometry, date and coverage semantics, and citation paths. Authenticated desktop and mobile display and interactions remain unverified. [Design record](design.md)
- The connected native callable tool list did not expose the specialized Finance actions, so real ingestion, replay and monthly publication remain open. The latest checkpoint records zero imported months. Both existing schedules remain recorded with first successful runs pending verification. Refresh **PTI Apps → Manage → Refresh tools** in the authorized session before invoking either write path. [MCP contract](mcp.md)
