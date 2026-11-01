# Blinkit food backfill acceptance — 1 November 2026

This is a neutral operational checkpoint, not an import receipt. It contains no private order records, tokens, references, preview names or credentials.

| Evidence | Current truth |
| --- | --- |
| First-party list acquisition | Owner's ChatGPT Browser observed 23 pages, 226 unique rows, pagination end reached, zero unreadable rows |
| Historical boundary | Owner observed source history back to 3 November 2023; this is source-list coverage, not persisted food-detail coverage |
| Detail acquisition | Owner reported 69 details acquired into browser memory; that memory is currently inaccessible |
| Outside food scope | Five rows intentionally excluded using actual nonfood-only previews; one sensitive nonfood detail read was rejected by automatic approval review and was not pursued |
| Real purchases imported | **Zero** at this checkpoint; neither of the two supplied food acceptance records has passed actual persistence/readback |
| Cloud browser | Host removed the browser surface; further real acquisition or browser acceptance is blocked until the host restores it |
| Morsel sign-in | Owner observed Firebase referrer rejection before Google popup; Morsel is signed out |
| Local specialized-callback fallback | Existing local ADC was unavailable (`app/invalid-credential`); no credentials were exported/replaced and no generic writes attempted |

The owner supplied two real, sanitized, food-only detail observations for acceptance. Their contents remain in task context only, never repository fixtures or reports. Preserve their supplied capture times, exact display-date text and `purchasedAt:null` when they can be imported. Test success and deployment must never be presented as those imports succeeding.

## Authorized independent repair

- Add the Morsel page WebMCP transport on the existing signed-in app, using short-lived Firebase ID tokens internally and the existing approved-owner checks. No plugin registry refresh is required for this page bridge.
- Retain the canonical specialized ingestion, deduplication, pause, revision and redaction logic. No generic write fallback or shared-rule change.
- Support explicit scope exclusions before detail reads. Store token plus neutral list context/reason/basis only. Preview-only exclusions say basket food contents are unknown; they are never purchases, food spend or enjoyment.
- Repair only Morsel's browser-key referrer configuration through the existing release identity, retaining API scope, other referrers and application restriction type. Fail closed on permission/configuration drift. Never alter the native key or IAM.
- Use `strict-origin` on Morsel Hosting so browser-restricted Firebase receives the origin without a page path.

## Remaining actual acceptance

1. Confirm release/configuration readback and harmless browser-origin Firebase probe. These checks do not prove Google popup or owner sign-in.
2. Host restores ChatGPT Browser and its retained tabs/memory, or explicitly reports that memory was lost.
3. Open/reload the existing Morsel page, click the observed **Sign in** control, and finish normal Google sign-in with the approved PTI account. No cookies or token strings need copying.
4. Discover `morsel_blinkit_context`, `morsel_blinkit_ingest`, `morsel_blinkit_sync` on that page. In the same browser tool runtime, import the two supplied observations, replay each, and read back exact line counts, whole totals, pack semantics, source dates/capture times and null purchase dates. Verify restaurant counters unchanged. Summarize only counts/hash IDs and checks.
5. Resume a server-checkpointed food-only scan. Record explicit five-row exclusions when their actual tokens/list context are available again; do not invent them from aggregate counts. Transfer acquired eligible details in bounded batches from browser memory to the Morsel page tool. Fetch full details for every remaining eligible/uncertain row, without reading explicitly excluded sensitive details.
6. Only after end reached and each unique row is persisted/verified duplicate, explicitly outside scope, or still unresolved, publish the corresponding coverage counts. Finish only with zero unresolved rows; keep live/unknown reconciliation explicit. A scoped completion does not establish the contents of excluded baskets or food consumption.

Deployment/test results belong in the release evidence; update this checkpoint only with verified real persistence. No autonomous schedule is authorized.
