# Blinkit food backfill acceptance — 1 November 2026

This is a neutral operational checkpoint, not an import receipt. It contains no private order records, tokens, references, preview names or credentials.

| Evidence | Current truth |
| --- | --- |
| First-party list acquisition | Assistant observed 23 pages in the owner's authenticated ChatGPT Browser, 226 unique rows, pagination end reached, zero unreadable rows |
| Historical boundary | Assistant observed source history back to 3 November 2023; this is source-list coverage, not persisted food-detail coverage |
| Detail acquisition | Assistant acquired 69 details into browser memory; that memory is currently inaccessible |
| Outside food scope | Five rows intentionally excluded using actual nonfood-only previews; one sensitive nonfood detail read was rejected by automatic approval review and was not pursued |
| Real purchases imported | **Zero**, reverified after deployment through the authorized PTI connection; purchase query empty and purchase sync state absent. Neither supplied food record has passed actual persistence/readback |
| Cloud browser | Host removed the browser surface; further real acquisition or browser acceptance is blocked until the host restores it |
| Morsel sign-in | Original referrer gate repaired and probed after deployment; Google popup/normal owner sign-in remain unverified because Browser is unavailable |
| Local specialized-callback fallback | Existing local ADC was unavailable (`app/invalid-credential`); no credentials were exported/replaced and no generic writes attempted |

The assistant retrieved two real, sanitized, food-only detail observations through the owner's authenticated Blinkit browser session for acceptance. Their contents remain in task context only, never repository fixtures or reports. Preserve their supplied capture times, exact display-date text and `purchasedAt:null` when they can be imported. Test success and deployment must never be presented as those imports succeeding.

## Authorized independent repair

- Add the Morsel page WebMCP transport on the existing signed-in app, using short-lived Firebase ID tokens internally and the existing approved-owner checks. No plugin registry refresh is required for this page bridge.
- Retain the canonical specialized ingestion, deduplication, pause, revision and redaction logic. No generic write fallback or shared-rule change.
- Support explicit scope exclusions before detail reads. Store token plus neutral list context/reason/basis only. Preview-only exclusions say basket food contents are unknown; they are never purchases, food spend or enjoyment.
- Repair only Morsel's browser-key referrer configuration through the existing release identity, retaining API scope, other referrers and application restriction type. Fail closed on permission/configuration drift. Never alter the native key or IAM.
- Use `strict-origin` on Morsel Hosting so browser-restricted Firebase receives the origin without a page path.

## Remaining actual acceptance

1. **Verified:** release/configuration readback and harmless browser-origin Firebase probe. These checks do not prove Google popup or owner sign-in.
2. Host restores ChatGPT Browser and its retained tabs/memory, or explicitly reports that memory was lost.
3. Open/reload the existing Morsel page, click the observed **Sign in** control, and finish normal Google sign-in with the approved PTI account. No cookies or token strings need copying.
4. Discover `morsel_blinkit_context`, `morsel_blinkit_ingest`, `morsel_blinkit_sync` on that page. In the same browser tool runtime, import the two supplied observations, replay each, and read back exact line counts, whole totals, pack semantics, source dates/capture times and null purchase dates. Verify restaurant counters unchanged. Summarize only counts/hash IDs and checks.
5. Resume a server-checkpointed food-only scan. Record explicit five-row exclusions when their actual tokens/list context are available again; do not invent them from aggregate counts. Transfer acquired eligible details in bounded batches from browser memory to the Morsel page tool. Fetch full details for every remaining eligible/uncertain row, without reading explicitly excluded sensitive details.
6. Only after end reached and each unique row is persisted/verified duplicate, explicitly outside scope, or still unresolved, publish the corresponding coverage counts. Finish only with zero unresolved rows; keep live/unknown reconciliation explicit. A scoped completion does not establish the contents of excluded baskets or food consumption.

Deployment/test results belong in the release evidence; update this checkpoint only with verified real persistence. No autonomous schedule is authorized.

## Verified independent release

Source commit: `0fecb9b7326512982be38aac00b289b2a34989b9` on main.

- [PTI shared MCP run 41297117738](https://github.com/Wolfrine/PTI/actions/runs/41297117738): verify, native-auth/Morsel-referrer repair and deploy all passed. Cloud Run revision `pti-firestore-mcp-00043-bc5` serves 100% of traffic. Hosted canonical Blinkit registration and owner read/account denial checks passed without creating a purchase or run.
- [Morsel run 41297118401](https://github.com/Wolfrine/PTI/actions/runs/41297118401): desktop/phone sample interactions, sign-in-domain verification, deployment, committed asset matching, origin-only policy, and read-only page-backend owner/unsigned/outsider/fake-origin checks passed. This is CI transport evidence, not owner-browser tool registration or Google popup acceptance.
- Browser-key readback confirmed one intended Morsel referrer added, five existing referrers preserved and unchanged API targets. An independent invalid-refresh probe changed from HTTP 403 to expected HTTP 400 with the Morsel Referer; absent Referer still returns HTTP 403. No key was made unrestricted and no IAM or native-key changes were made by this repair.
- Independent byte checks matched live app/config/bridge/projection assets against the committed Git blobs, avoiding local Windows line-ending/response-decoding differences. Live `Referrer-Policy` is `strict-origin`. Unsigned approved-origin bridge requests return 401; fake-origin requests return 403.
- Post-deployment owner reads confirmed zero Blinkit purchases, absent purchase sync state, ingestion unpaused, and restaurant workspace order count still 97. No actual Blinkit order content was written by this task.
- Local checks: 124 MCP tests; 23 deployment-script selftests; 41 food/personal/page-bridge tests; 107 PTI frontend tests; MCP, Morsel and PTI builds. Morsel sample UI was checked at desktop 1440×1100 and mobile 390×844 / 320×740. All fixtures are synthetic. The authenticated cloud Browser remains unavailable.
