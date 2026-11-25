# PTI Development Resources — usage snapshot

PTI `/home` presents the Codex **weekly allowance** alongside project-wide GitHub and Firebase usage, plus a separate Google Cloud spend strip. Daily token totals were removed because they are not actionable. The panels remain a private orientation surface—not a replacement for provider billing consoles.

## Data and scope

The GitHub Actions workflow `.github/workflows/platform-usage.yml` refreshes at 02:17 and 14:17 UTC and is manually runnable. The existing verified Firebase deployment also attempts one initial refresh. It reads an **owner-only project registry** at `users/{ownerUid}/resourceUsage/config`, then performs provider reads and **one Admin SDK snapshot write** to `users/{ownerUid}/resourceUsage/current` in the existing `pti-app-2ab59` Firestore. The PWA subscribes only to the snapshot. The PTI code adds no new scheduled job, model request or browser-side API token; enabling the optional BigQuery export is a separately authorized cloud setup.

| Source | Available now | Important boundary |
| --- | --- | --- |
| GitHub Actions REST | Trailing-24h workflow runs and failures **per active repository**, with reporting coverage | The authenticated PTI workflow token may read only PTI and public repositories. Private repositories require an optional owner-scoped Actions-read token; inaccessible repositories stay visibly unconnected. Counts are partial whenever coverage is incomplete. |
| GitHub billing REST | Account-billed Actions minutes and USD net amount, calendar month | Requires optional account Plan permission. Free/public runner usage and quotas are not equivalent to billed minutes. |
| Google Cloud Monitoring | Successful Firestore reads, writes and deletes over the trailing 24h and since **Pacific midnight**, by permitted project/database | These are operation counts, **not exact billed Firestore operations**. Empty time series are unavailable, not zero. |
| Firestore Admin databases REST | Actual database `freeTier` flag and edition, read-only | Comparison is shown only when the database is verified **Standard + freeTier=true**. Metadata access failure means unknown eligibility, not free. |
| Standard Cloud Billing export to BigQuery (optional) | Invoice-month regular charges, signed credits/discounts, taxes/adjustments, net total, project/service breakdown, previous-reading change and export timestamp | Requires one-time Cloud Billing export setup and read-only data access. All figures retain the export currency; the first rows may be delayed. No export = **Not connected**, not zero. |

Firestore Standard daily free quota is **50,000 document reads**, **20,000 writes**, **20,000 deletes** for **one eligible database per project**, reset around midnight Pacific time. Named or ineligible databases do not share a combined free quota. The page shows the reported operation count versus these allowances, with an estimated above-limit indication when relevant; it cannot assert that the difference is exactly billable. Index entries, other billing operations, storage and bandwidth can change actual cost. See [Google's Firestore pricing](https://cloud.google.com/firestore/pricing).

Hosting transfer, Cloud Storage, Functions totals and actual Google Cloud billing are covered **only when** the account's Standard Cloud Billing export is connected. Remaining GitHub quota is not tracked. Firebase's exact billed cost can differ from the Firestore usage dashboard; consult Cloud Billing for financial decisions.

## Connecting actual Google Cloud charges

Follow the [owner-wide cloud cost rule](cloud-cost-rule.md) before proposing a paid export or expanding collection. Present the forecast before requesting approval.

1. As a billing-account administrator, enable **Standard usage cost export** under Google Cloud Console → Billing → Billing export, choosing a BigQuery dataset. This is an explicit Google Cloud setup decision: BigQuery storage and query usage may be chargeable. Do not create a dataset just for the PTI code release without owner approval. See [Google's setup instructions](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-setup).
2. Enable the BigQuery API on the chosen query project if needed. Grant the existing PTI collector service account **BigQuery Job User** on that project and **BigQuery Data Viewer** on the export dataset. This is separate from the current Firestore/Monitoring grants.
3. Add `billingExport` to the existing owner-only `users/{ownerUid}/resourceUsage/config` document, without removing any existing registry fields:

   ```json
   {
     "billingExport": {
       "table": "EXPORT_PROJECT.DATASET.gcp_billing_export_v1_BILLING_ACCOUNT_ID",
       "queryProject": "QUERY_PROJECT",
       "location": "US"
     }
   }
   ```

   Replace placeholders with the exact enabled table, project and dataset location (`US`, `EU`, or a supported region). This config is private, not committed into this public repository. The collector makes **zero BigQuery calls** until it sees a valid configuration; an invalid one is reported as an error.
4. Manually run the existing **Refresh private PTI platform usage** GitHub workflow, then inspect `/home` → **Google Cloud spend**. Its cached snapshot is owner-only. The normal refresh stays at twice daily; opening PTI never starts a provider query.
5. Independently set **Cloud Billing Budgets & alerts** in Google's console with an owner-chosen monthly threshold and email recipients. PTI currently labels alerts **not verified** because its collector does not inspect billing budgets; verify their actual state in Google's console. Ordinary alerts can be delayed and are not spending caps. [Budget instructions](https://docs.cloud.google.com/billing/docs/how-to/budgets).

The SQL reads the current UTC **invoice month** across all projects linked to the export's billing account. It sums `cost` for regular charges, signed `credits.amount`, and all non-regular cost types (taxes, adjustments, rounding) to obtain the current net. It also groups net by service and project. A single BigQuery query per refresh is capped at **100 MiB scanned** (`maximumBytesBilled`); if Google estimates more bytes or access is missing, it fails visibly, instead of allowing unlimited scanning. An export can take hours or days to populate, and BigQuery has its own usage-based charges; even a scan cap cannot cap dataset storage costs. Always reconcile the final amount with the eventual Google Cloud invoice. See [Standard export fields](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/standard-usage) and [Google's billing-query examples](https://docs.cloud.google.com/billing/docs/how-to/bq-examples).

Cloud Run **spend-cap budgets**, where available, are a different optional protection: their limits use **gross estimated spend before credits** and can pause new Cloud Run requests. Do not enable them automatically for Local Codex; an unsuitable cap could interrupt its bridge even when net cost stays low. See [Google's spend-cap guidance](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps).

## Connected credentials and expansion

- `FIREBASE_SERVICE_ACCOUNT` — already used by PTI deployment; the collector uses its Admin authority only after verifying that the live Firestore rules exactly match this repo's owner-only source. For other Firebase projects, grant this same identity **Cloud Monitoring Viewer** (for `monitoring.timeSeries.list`) and read-only permission to list Firestore databases (for `datastore.databases.list`). Without grants, those project/database values stay unavailable. **No IAM changes have been made to other projects**.
- `GITHUB_TOKEN` — the workflow's own read-only GitHub token, permitted to read **Wolfrine/PTI** workflow runs and potentially public repositories. No additional token needed for PTI-only coverage.
- Optional repository secret `PTI_GITHUB_USAGE_TOKEN` — an owner-authorized fine-grained read-only GitHub token granting **Actions:read** for all desired repositories and **Plan:read** for account billing. When present, the collector can also discover newly created repositories from the owner account. Otherwise the private registry supplies the known repo names, with inaccessible ones flagged. Never store any token in Firestore or Angular.
- `users/{ownerUid}/resourceUsage/config` — the authenticated owner-private registry of verified repository names and Firebase project IDs. Its initial audit found **23 accessible GitHub repositories (22 active, one archived)** and **nine distinct Firebase IDs** from checked repository config/deployment workflows on 30-Oct-2026. This is not proof that the owner has no other Firebase projects or repositories. The public PTI repo deliberately contains **none of the private repository inventory**. The registry is read each refresh; new Firebase projects can be added after verification, new **public** GitHub repos are discovered from the public owner listing, and new **private** repos are discovered once the scoped token permits it.
- Optional repository variable `PTI_FIREBASE_PROJECT_IDS` — comma-separated extra IDs to query, merged with the private registry and PTI. The collector does not assume that every GitHub repo has its own Firebase project.

The PTI hosting/Firestore project continues to require only its existing service account. For **all projects to show actual readings**, read-only grants must be provided per external Firebase project and the optional GitHub token must cover the desired private repositories. The UI intentionally shows coverage, missing access and unknown data instead of invented zeros.

Refresh manually from GitHub Actions → **Refresh private PTI platform usage** → Run workflow. Inspect status and the private Home panel after completion. The first new snapshot appears only after a verified release or refresh workflow successfully publishes under the expected live rules.

## Security, cost and tests

The rule's parent recursive match explicitly excludes `resourceUsage`, and the dedicated match grants reads only to the document owner's authenticated account and denies all client writes, including the owner. `verify-live-rules.mjs` uses temporary synthetic identities to exercise these boundaries before the normal Firebase deployment is declared successful.

`node personal-functions/platform-usage-core.test.mjs` covers unavailable values, inventory validation, per-repo scope, pagination, Pacific-day boundaries including both DST transitions, per-database Monitoring aggregation, verified free-tier eligibility and partial permissions. The usual Angular tests cover untrusted Firestore parsing and display states.

This adds approximately two GitHub-hosted jobs per day, one small registry read and a single Firestore snapshot write per completed job (plus one prior-snapshot read when billing has been obtained). Each refresh makes bounded GitHub and Google Cloud Monitoring API calls for the registered projects, plus **at most one capped BigQuery query if configured**. Google Cloud Monitoring API requests, BigQuery and GitHub Actions may have applicable usage charges; verify them against the provider console if a strict zero-cost requirement applies. No repeated direct provider queries occur on each page load.
