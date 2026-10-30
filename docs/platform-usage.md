# PTI Development Resources — usage snapshot

PTI `/home` presents Codex alongside GitHub and Firebase. The new panels are a compact, private summary—not a replacement for provider billing consoles.

## Data and scope

The GitHub Actions workflow `.github/workflows/platform-usage.yml` refreshes at 02:17 and 14:17 UTC and is manually runnable. The existing verified Firebase deployment also attempts one initial refresh. It performs provider reads, then **one Admin SDK write** to `users/{ownerUid}/resourceUsage/current` in the existing `pti-app-2ab59` Firestore. The PWA subscribes to that one document. No new database, cloud service, model request or browser-side API token is involved.

| Source | Available now | Important boundary |
| --- | --- | --- |
| GitHub Actions REST | PTI repository runs and failures, trailing 24h | Workflow status is not account-wide billable minutes. |
| GitHub billing REST | Account-billed Actions minutes and USD net amount, calendar month | Requires optional account Plan permission. Free/public runner usage and quotas are not equivalent to billed minutes. |
| Google Cloud Monitoring | Successful Firestore reads, writes and deletes over the trailing 24h, per permitted project | These are monitoring counts, **not exact billed Firestore operations**. Empty time series are unavailable, not zero. |

Hosting transfer, Cloud Storage, Functions totals, remaining GitHub quota and actual Google Cloud billing costs are not claimed as connected yet. Firebase's exact billed cost can differ from the Firestore usage dashboard; consult Cloud Billing for financial decisions.

## Connected credentials and expansion

- `FIREBASE_SERVICE_ACCOUNT` — already used by PTI deployment; the collector uses its Admin authority only after verifying that the live Firestore rules exactly match this repo's owner-only source. The same identity needs Cloud Monitoring `monitoring.timeSeries.list` for each Firebase project it should query. Missing grants produce an unavailable state, not a failure that opens data access.
- `GITHUB_TOKEN` — the workflow's own GitHub token, permitted to read **Wolfrine/PTI** workflow runs. No additional token needed for that metric.
- Optional repository secret `PTI_GITHUB_USAGE_TOKEN` — an account-authorized read-only GitHub token with user Plan billing read permission. Enables the account-wide paid Actions usage section; otherwise it stays explicitly unconnected. Never store it in Firestore or Angular.
- Optional repository variable `PTI_FIREBASE_PROJECT_IDS` — comma-separated project IDs whose Cloud Monitoring permissions have been verified (PTI itself is always included). Projects without valid IAM remain marked unavailable. The collector does not assume that every GitHub repo corresponds to a Firebase project.

Refresh manually from GitHub Actions → **Refresh private PTI platform usage** → Run workflow. Inspect status and the private Home panel after completion. The first new snapshot appears only after a verified release or refresh workflow successfully publishes under the expected live rules.

## Security, cost and tests

The rule's parent recursive match explicitly excludes `resourceUsage`, and the dedicated match grants reads only to the document owner's authenticated account and denies all client writes, including the owner. `verify-live-rules.mjs` uses temporary synthetic identities to exercise these boundaries before the normal Firebase deployment is declared successful.

`node personal-functions/platform-usage-core.test.mjs` covers unavailable values, statuses, source scope, pagination, monitoring aggregation and partial access. The usual Angular tests cover untrusted Firestore parsing and display states.

This adds approximately two short GitHub-hosted jobs per day and a single Firestore document write per completed job. Google Cloud Monitoring API requests and GitHub Actions may have applicable usage charges; verify them against the provider console if a strict zero-cost requirement applies. No repeated direct provider queries occur on each page load.
