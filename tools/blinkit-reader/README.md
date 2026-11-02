# Owner-PC first-party Blinkit payment reader

This lane consumes minimal email wake-ups. It does **not** read Gmail, create mail automation or enqueue the parent's real source event. It uses only Blinkit's first-party page `get_session`, `list_orders`, `get_order` tools, discovered anew on the current document, and Morsel's canonical page/backend tools. No scraping, private/guessed endpoints, community Blinkit connector, cookie export, alternate credentials, address/cart/payment changes or inference. Historical backfill remains separate.

## Queue contract for the parent

Create one document using the existing authenticated `firestore_create_document` tool:

`users/{ownerUid}/foodData/workspace/purchaseEvents/blinkit-gmail-{gmailMessageId}`

```json
{
  "schemaVersion": 1,
  "kind": "payment-alert",
  "provider": "blinkit",
  "merchant": "Blinkit",
  "gmailMessageId": "aabbccddeeff0011",
  "amount": 100,
  "currency": "INR",
  "emailReceivedAt": "2026-11-02T12:00:12Z",
  "transactionDateText": "02-11-26",
  "transactionTimezone": "Asia/Kolkata",
  "observedAt": "2026-11-02T12:01:00Z",
  "status": "pending"
}
```

This example is synthetic. Use Gmail's actual arrival timestamp, the bank's exact displayed transaction date, and the actual observation time. Email arrival is an approximate wake-up time, never an exact payment or purchase time. The parent authenticates the real mail and verifies the merchant exactly Blinkit from the body before creation. Non-Blinkit events are silent no-ops. Never include the mail body, account/card suffix, VPA, UPI reference, credentials or unrelated identifiers. A payment proves neither items nor consumption. Do not write a purchase from an email alert.

The hosted generic create tool routes this exact namespace through strict canonical validation and a pause-checked transaction. The deterministic ID deduplicates the Gmail message; identical replay preserves its existing state, conflicting immutable metadata is rejected. A duplicate create response may also be handled by reading the existing document. Do not update/delete/recreate it. Generic updates, batches and worker-state writes are denied. Only event creation is allowed through the old cached generic tool; purchase writes remain specialized-only.

Worker-managed fields include attempts, lease hash/expiry, retry time, result and linked purchase ID. Lease values stay in memory; no authentication token or raw source blob is persisted by the worker. Event outcome is `pending`, `processing`, `retry_wait`, `reconcile_pending`, `imported`, `needs_review` or `outside_food_scope`. `purchaseWorkerState/local` holds bounded readiness and a server observation time. These are separate from restaurant orders, dishes, taste and recommendation counts.

## Supported runtime and authentication

Installed Chrome 156 and the existing F-drive Node 24 are used. Chrome's documented `--enable-features=WebMCP` is enabled only for this dedicated profile/process; sandbox and normal HTTPS/origin checks remain enabled. The runtime uses the official `document.modelContext.getTools()/executeTool()` API; no polyfill or agent impersonation. Sources: [Blinkit first-party instructions](https://blinkit.com/llms.txt), [Chrome imperative API](https://developer.chrome.com/docs/modern-web-guidance/guides/webmcp/agentic-javascript-tools), [Google Puppeteer WebMCP prerequisites](https://pptr.dev/guides/webmcp).

Normal persistent browser profile: `F:\Workspace\Support\PTI\blinkit-reader\browser-profile`. Chrome owns its normal login storage. Our code never reads/copies credential files, cookies, local storage, Firebase tokens or another profile. Morsel's page obtains its own short-lived Firebase token internally and calls the protected owner backend, so the worker needs no service-account key or separate native credential. Existing owner authorization, pause and canonical ingestion remain mandatory.

**Observed feasibility:** installed Chrome exposes the API with the documented feature flag. The initial fresh-profile Blinkit navigation returned HTTP 403 and a human-verification page, with no registered tools. This is a real source barrier. No challenge was automated and no browser/security masking was used. Morsel is not authenticated in this new profile. A source read or purchase import has not been accepted from these observations.

After installation run:

```powershell
& 'F:\Workspace\Support\PTI\blinkit-reader\setup.ps1'
```

It stops only this worker gracefully and opens **normal visible Chrome** with Blinkit and Morsel. The owner handles any normal human verification, then the Blinkit phone/OTP sign-in directly in the site, and Morsel's normal approved Google sign-in. Never send a phone code, token or cookie to chat or this program. No location/address is needed for order history. Close this dedicated browser window when done; the reader resumes automatically using the same profile. If verification/login cannot be completed, remain blocked; do not bypass it. Headless read acceptance must then be checked independently—normal login alone does not prove unattended site access.

## Processing and recovery

The daemon polls the owner event queue through Morsel's `morsel_blinkit_events` page tool. Before source reads it checks pause and normal first-party login. At most three recent pages are read, each at limit 10 with untouched opaque cursor, duplicate/cursor-cycle detection and one truncated/transient/unavailable retry. No full backfill. Email can precede list availability: unmatched events use exponential server backoff from one minute to one hour, not a false completed result.

A new event needs one unique candidate matching **whole bill total, bank/displayed date, and email-arrival proximity**. Today/yesterday are resolved against actual capture-local calendar only for comparison; no purchase ISO is synthesized. Explicitly year-dated displays can be compared as displayed. Missing/uncertain dates or multiple candidates retain review. Full detail must independently match the amount/time and come from a fresh list token. A linked live order can reconcile only the same canonical reference from a fresh list/detail, with the current revision guard.

Preview scope is conservative: known nonfood-only previews are recorded as outside scope without a detail call; uncertain or mixed sensitive previews need review. Missing food words never silently imply nonfood. No preview names are stored with scope failures. Eligible details always use the canonical projection, retain exact pack text/null unit prices and unknown lines, and preserve whole-basket bills without calling them food spend.

The specialized ingest transaction reads the active event lease and pause alongside purchase/state, verifies fresh source/match evidence, then atomically saves/deduplicates/revises the purchase and acknowledges the event. Concurrent replay counts once. Live/unknown results retain `reconcile_pending` and respect at least the page refresh cadence. A lost reply is recovered from canonical state; it never authorizes advancing counts or declaring an import. Every claimed success is read back and compared with the canonical fingerprint. The worker does not infer consumption, likes or nutrition.

## Install, run and inspect

From this directory, using existing F-drive Node/npm: `npm ci --ignore-scripts`, `npm test`, then `install.ps1`. The install bundles the actual shared canonical modules, copies a versioned release under the F support root, protects the new runtime for the current Windows user/SYSTEM, and registers **PTI Blinkit Reader**. It follows PTI's existing windowless Task Scheduler pattern: `wscript.exe` hides PowerShell from creation, child Node uses `CreateNoWindow`, the launcher waits for its exit, overlap is `IgnoreNew`, and logon/minute triggers recover a stopped daemon. It runs only while this Windows user is signed in and the PC awake. It never changes GTOP, Local Codex, the service starter or mail automation.

`status.ps1` shows neutral local readiness, PID, last cycle, processed/readback counts and Task Scheduler state. No private products, bank details, source response or auth value enters logs. `stop.ps1` closes only this worker's browser context to interrupt pending calls, then exits gracefully; it does not kill unrelated processes. Each tool call also has a 45-second abort timeout. An interrupted server commit remains recoverable from the canonical event. `resume.ps1` restarts this exact task. Browser profile contention is explicit, never solved by killing another Chrome or copying a profile. After a source 403 the daemon does not keep retrying that barrier; use normal setup and restart after the owner resolves it.

To request acceptance replay of an already queued event, use installed `run.ps1 -Command replay -EventId <deterministic event id>`. This requests work from the running daemon; it does **not** prove processing. Check the event's canonical duplicate result, saved purchase, unchanged purchase/restaurant counts and local `lastReadbackVerified`/`lastDuplicate`. Replay never creates another source event.

Local `data/status.json`, `worker.lock`, stop/replay requests and Chrome profile are runtime-only. The queue context scans bounded document-ID pages; its cursor cycles through larger queues without treating an empty match page as complete. Neither source nor email credentials are stored by our code. Dependencies, scratch and artifacts belong on F. Chrome remains an installed platform binary.

## Acceptance and rollback

Tests use synthetic fixtures for amount/date/scope matching, retry/replay, canonical event leases, pause/owner denial, atomic counters/revisions and redaction. They do not establish a real import. Required real acceptance is fresh authenticated `list_orders` token → full eligible `get_order` detail → canonical saved purchase → PTI readback → duplicate event replay, with restaurant counters unchanged. Installation, a running task, an authenticated browser or test success alone is insufficient. Human verification/auth can block that last gate; report the actual status and minimum owner action.

`node scripts/verify-browser.mjs --scratch F:\Workspace\Codex\<task>\browser-api --chrome "C:\Program Files\Google\Chrome\Application\chrome.exe"` exercises the production adapter's discovery/execution against clearly synthetic localhost tools in a separate F-drive test profile. It verifies the installed browser API, suffix changes, unregister lifecycle, interrupted read and read-only denial, without opening either service or accessing owner login state.

The parent's Gmail automation and actual enqueue are deliberately not created by this lane. Preserve failed/pending events. To stop capture, use the existing Morsel ingestion pause or this worker's stop script. Roll back a release by switching only its validated `active.json` release path, retaining the browser profile and canonical queue/purchases. Do not delete a profile or revoke sessions as routine rollback. Remove/disable only **PTI Blinkit Reader** if requested.

## Email time precision

The bank alert has a displayed transaction date, not an exact transaction clock. Use `hdfc-payment-alert.mjs` (under `tools/pti-mcp/blinkit/`) to extract only authenticated Blinkit debit evidence. Queue sources contain `emailReceivedAt`, exact `transactionDateText` and `transactionTimezone`; they never contain an invented `paymentAt`. Matching compares the order's displayed date with that bank date and allows only a unique bill-total match within three minutes of Gmail arrival, including a midnight boundary. This is comparison evidence only; `purchasedAt` remains null. Uncertain or delayed matches stay unresolved. Queue writes reject missing/paused workspaces and raw financial identifiers.
