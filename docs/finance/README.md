# PTI Finance

PTI Finance reconstructs the household's own financial activity in the existing PTI Firebase project. The requested historical window is 22 November 2023 through 22 November 2026 inclusive in Asia/Kolkata. It spans 36 elapsed months and touches 37 calendar months. The two November bookends are partial periods. Email received during a period is discovery evidence. The transaction and statement dates determine ledger and coverage periods.

The application uses the dedicated Finance Hosting site, Firebase Google sign-in and the Finance-only owner namespace at `users/{uid}/financeData/workspace`. The project checkpoint at `projects/pti-finance-v1` carries the original acceptance stages and runtime receipts.

| Phase | Evidence and remaining gate |
| --- | --- |
| 1. Discovery and coverage | Native Gmail searches and metadata reads verified bank, card, CDSL and merchant sources. Historical reconstruction needs authenticated intake and month-level reconciliation. See [Gmail intake](gmail.md). |
| 2. Central design and UX | Three structural directions reviewed against Central, PTI Home and product references. Monthly statement selected. Authenticated desktop and mobile renders and critique cycles remain open. See [design](design.md). |
| 3. Ledger and reconciliation | Owner namespace, immutable evidence, revisioned entries and monthly projections. A recorded month needs source-level coverage and reconciliation evidence. |
| 4. Production application | Firebase Auth and Hosting, a Finance entry on PTI Home and the review workflow. The production Google session and device layouts require practical inspection. |
| 5. Gmail and monthly automation | The connected PTI tool list and real read/write/replay evidence gate activation of the two jobs. See [Gmail intake](gmail.md). |
| 6. Independent audit and release | Requires release revision, live assets, Firebase owner/outsider checks, traceable totals and actual authenticated browser views. |

## Release

The existing PTI shared MCP workflow publishes the account-scoped host from `main`. The Finance Hosting workflow uses the same Firebase delivery identity as PTI and the standalone Morsel lane. It builds only the Finance assets, authorizes the two Finance domains and verifies served bytes. PTI Home follows the existing Home Hosting workflow.

Use the existing shared Firestore rules publication workflow with `change_scope=finance` and the exact inspected production ruleset name. The Finance scope preserves unrelated live rules and applies the Finance block and the matching legacy wildcard exclusion. The Finance deployment needs that revision in production before any intake writes.

On 22 November 2026, the shared rules check passed for `cf3624f69b931e124648c9e4b0d9f407b1a7a6d2`. The reviewed Finance-only publisher ran against the exact prior production ruleset from `caf030523599d1902f595ea9fca4effb3e784727`, using the existing owner ADC because the connected GitHub tool supports workflow reads. Its readback confirmed live ruleset `43ce8d09-7250-4cbb-aa10-120d82bc1300`. The Finance write gate also requires deployment of the legacy Firebase Functions MCP Finance exclusion. [Shared rules verification](https://github.com/Wolfrine/PTI/actions/runs/45042919595)

For a local Finance build, run `node finance-app/scripts/build.mjs --out H:/Workspace/Builds/PTI/finance-production`. Keep cloud rule release, Hosting asset identity, tool discovery, recorded data and actual browser verification as distinct evidence in the project checkpoint.
