# PTI Development Resources — usage snapshot

PTI `/home` presents the Codex **weekly allowance** alongside project-wide GitHub and Firebase usage. Daily token totals were removed because they are not actionable. The panels remain a private orientation surface—not a replacement for provider billing consoles.

## Data and scope

The GitHub Actions workflow `.github/workflows/platform-usage.yml` refreshes at 02:17 and 14:17 UTC and is manually runnable. The existing verified Firebase deployment also attempts one initial refresh. It reads an **owner-only project registry** at `users/{ownerUid}/resourceUsage/config`, then performs provider reads and **one Admin SDK snapshot write** to `users/{ownerUid}/resourceUsage/current` in the existing `pti-app-2ab59` Firestore. The PWA subscribes only to the snapshot. No new database, cloud service, model request or browser-side API token is involved.

| Source | Available now | Important boundary |
| --- | --- | --- |
| GitHub Actions REST | Trailing-24h workflow runs and failures **per active repository**, with reporting coverage | The authenticated PTI workflow token may read only PTI and public repositories. Private repositories require an optional owner-scoped Actions-read token; inaccessible repositories stay visibly unconnected. Counts are partial whenever coverage is incomplete. |
| GitHub billing REST | Account-billed Actions minutes and USD net amount, calendar month | Requires optional account Plan permission. Free/public runner usage and quotas are not equivalent to billed minutes. |
| Google Cloud Monitoring | Successful Firestore reads, writes and deletes over the trailing 24h and since **Pacific midnight**, by permitted project/database | These are operation counts, **not exact billed Firestore operations**. Empty time series are unavailable, not zero. |
| Firestore Admin databases REST | Actual database `freeTier` flag and edition, read-only | Comparison is shown only when the database is verified **Standard + freeTier=true**. Metadata access failure means unknown eligibility, not free. |

Firestore Standard daily free quota is **50,000 document reads**, **20,000 writes**, **20,000 deletes** for **one eligible database per project**, reset around midnight Pacific time. Named or ineligible databases do not share a combined free quota. The page shows the reported operation count versus these allowances, with an estimated above-limit indication when relevant; it cannot assert that the difference is exactly billable. Index entries, other billing operations, storage and bandwidth can change actual cost. See [Google's Firestore pricing](https://cloud.google.com/firestore/pricing).

Hosting transfer, Cloud Storage, Functions totals, remaining GitHub quota and actual Google Cloud billing costs are not claimed as connected yet. Firebase's exact billed cost can differ from the Firestore usage dashboard; consult Cloud Billing for financial decisions.

## Connected credentials and expansion

- `FIREBASE_SERVICE_ACCOUNT` — already used by PTI deployment; the collector uses its Admin authority only after verifying that the live Firestore rules exactly match this repo's owner-only source. For other Firebase projects, grant this same identity **Cloud Monitoring Viewer** (for `monitoring.timeSeries.list`) and read-only permission to list Firestore databases (for `datastore.databases.list`). Without grants, those project/database values stay unavailable. **No IAM changes have been made to other projects**.
- `GITHUB_TOKEN` — the workflow's own read-only GitHub token, permitted to read **Wolfrine/PTI** workflow runs and potentially public repositories. No additional token needed for PTI-only coverage.
- Optional repository secret `PTI_GITHUB_USAGE_TOKEN` — an owner-authorized fine-grained read-only GitHub token granting **Actions:read** for all desired repositories and **Plan:read** for account billing. When present, the collector can also discover newly created repositories from the owner account. Otherwise the private registry supplies the known repo names, with inaccessible ones flagged. Never store any token in Firestore or Angular.
- `users/{ownerUid}/resourceUsage/config` — the authenticated owner-private registry of verified repository names and Firebase project IDs. Its initial audit found **23 accessible GitHub repositories (22 active, one archived)** and **nine distinct Firebase IDs** from checked repository config/deployment workflows on 30-Oct-2026. This is not proof that the owner has no other Firebase projects or repositories. The public PTI repo deliberately contains **none of the private repository inventory**. The registry is read each refresh; new Firebase projects can be added after verification, and new GitHub repos are automatically discovered once the scoped token allows it.
- Optional repository variable `PTI_FIREBASE_PROJECT_IDS` — comma-separated extra IDs to query, merged with the private registry and PTI. The collector does not assume that every GitHub repo has its own Firebase project.

The PTI hosting/Firestore project continues to require only its existing service account. For **all projects to show actual readings**, read-only grants must be provided per external Firebase project and the optional GitHub token must cover the desired private repositories. The UI intentionally shows coverage, missing access and unknown data instead of invented zeros.

Refresh manually from GitHub Actions → **Refresh private PTI platform usage** → Run workflow. Inspect status and the private Home panel after completion. The first new snapshot appears only after a verified release or refresh workflow successfully publishes under the expected live rules.

## Security, cost and tests

The rule's parent recursive match explicitly excludes `resourceUsage`, and the dedicated match grants reads only to the document owner's authenticated account and denies all client writes, including the owner. `verify-live-rules.mjs` uses temporary synthetic identities to exercise these boundaries before the normal Firebase deployment is declared successful.

`node personal-functions/platform-usage-core.test.mjs` covers unavailable values, inventory validation, per-repo scope, pagination, Pacific-day boundaries including both DST transitions, per-database Monitoring aggregation, verified free-tier eligibility and partial permissions. The usual Angular tests cover untrusted Firestore parsing and display states.

This adds approximately two GitHub-hosted jobs per day, one small registry read and a single Firestore snapshot write per completed job. Each refresh makes bounded GitHub and Google Cloud Monitoring API calls for the registered projects. Google Cloud Monitoring API requests and GitHub Actions may have applicable usage charges; verify them against the provider console if a strict zero-cost requirement applies. No repeated direct provider queries occur on each page load.
