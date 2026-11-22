# PTI Finance

PTI Finance reconstructs the household's own financial activity in the existing PTI Firebase project. The requested historical window is 22 November 2023 through 22 November 2026 inclusive in Asia/Kolkata. It spans 36 elapsed months and touches 37 calendar months. The two November bookends are partial periods. Email received during a period is discovery evidence. The transaction and statement dates determine ledger and coverage periods.

The application uses the dedicated Finance Hosting site, Firebase Google sign-in and the Finance-only owner namespace at `users/{uid}/financeData/workspace`. The project checkpoint at `projects/pti-finance-v1` carries the original acceptance stages and runtime receipts.

| Phase | Evidence and remaining gate |
| --- | --- |
| 1. Discovery and coverage | Authenticated Gmail searches observed bank, card, CDSL and merchant sources. Five real UPI alerts passed canonical normalization. Four supported PDF parts failed extraction. See [Gmail intake](gmail.md). |
| 2. Central design and UX | Three structural directions reviewed against Central, PTI Home and product references. Monthly statement selected. Authenticated desktop and mobile renders and critique cycles remain open. See [design](design.md). |
| 3. Ledger and reconciliation | Owner rules, immutable intake, revisioned entries and monthly projections shipped. The review exclusion was verified in memory with the five real alerts. Authenticated intake, replay and issuer reconciliation remain open. See [MCP contract](mcp.md). |
| 4. Production application | Finance Hosting and the PTI Home bundles were verified live. The official browser host was unavailable. The owner sign-in, navigation, corrections and desktop/mobile layouts still need browser inspection. |
| 5. Gmail and monthly automation | The authenticated PTI app catalog lists the five Finance methods. This native connection's callable tool list has yet to refresh. No Gmail rows, monthly closes or schedules were published as of the release check. |
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
