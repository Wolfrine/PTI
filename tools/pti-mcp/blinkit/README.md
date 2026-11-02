# Morsel Blinkit purchase connector

Our own connector to **Blinkit's first-party page WebMCP**. Source contract: [blinkit.com/llms.txt](https://blinkit.com/llms.txt), checked 1 November 2026. There is no standalone REST endpoint. No community Blinkit MCP package, code, endpoint, scraping, credentials or cookie transfer is used.

Backend, orchestration and an additive nonvisual Morsel page WebMCP bridge; no visual redesign. Hosted tools are `food_blinkit_context`, `food_blinkit_ingest`, `food_blinkit_sync` and `food_blinkit_events`. The separately authorized [owner-PC reader](../../blinkit-reader/README.md) consumes minimal payment wake-ups with a persistent normal browser profile; this lane does not create Gmail automation. Historical backfill is separate. Deployment uses existing `pti-hosted-mcp.yml` and `morsel-deploy.yml` lanes. Server deployment, page registration, local reader readiness and actual persistence are separate acceptance gates.

## Email wake-ups and the owner PC

The parent creates only minimal verified Blinkit payment metadata under `purchaseEvents/blinkit-gmail-{gmailMessageId}` using the existing generic create tool; see the exact strict schema in [the reader contract](../../blinkit-reader/README.md#queue-contract-for-the-parent). Non-Blinkit events are no-ops. No mail body, account suffix, VPA, UPI reference or item guesses. Generic queue updates/batches and worker-state writes are blocked; no generic purchase write fallback exists.

`food_blinkit_events` / `morsel_blinkit_events` provide owner/pause-guarded context, leases, retry/review outcomes and readiness. A canonical ingest with `eventId`, `eventLease` and a fresh minimal `sourceRow` matches amount/display time and atomically persists/duplicates/revises the purchase **and** acknowledges the event. Initial source reads are bounded to three recent pages, full eligible detail and explicit preview scope; no historical completion is implied. Exact display dates and `purchasedAt:null` remain intact. Source 403/human verification or normal login can block unattended acceptance; never bypass them. Existing local browser readiness is not a saved-purchase claim.

## Same-browser transfer when the plugin registry is stale

Open **https://pti-app-2ab59-morsel.web.app/** beside Blinkit in the same ChatGPT Browser runtime. Use its existing **Sign in** button and normal approved Google account login. No token, cookie or credential transfer is needed. Morsel's original browser key is retained; the release checks only its exact Morsel referrer pattern and preserves all other restrictions/API targets. Hosting sends `strict-origin` so Firebase receives the origin without a page path. A harmless invalid-refresh probe verifies referrer acceptance, never owner Google sign-in. If the cloud browser is unavailable, actual acceptance remains blocked; do not switch sessions or export cookies.

After owner authorization, discover **`morsel_blinkit_context`**, **`morsel_blinkit_ingest`**, **`morsel_blinkit_sync`** on the Morsel page. These tools are registered through `document.modelContext.registerTool` with `AbortSignal` cleanup, per [Chrome's official lifecycle documentation](https://developer.chrome.com/docs/modern-web-guidance/guides/webmcp/agentic-javascript-tools). They unregister and cancel pending requests on sign-out, account change or page unload. Execution rechecks the current user. No cross-origin iframe exposure is granted.

The page makes bounded JSON POSTs to the existing Cloud Run `/morsel/blinkit` endpoint. It obtains a short-lived Firebase ID token internally for each request; tokens never enter tool arguments/results, URLs, local bridge storage or logs. The server requires the exact Morsel Origin, verifies the Firebase token including revocation and approved-owner status, derives the UID, rejects caller-supplied UID, limits bodies to 256 KiB, and invokes only canonical Blinkit tools in an isolated in-memory MCP client. No generic Firestore write path or new rule is involved. `capabilities` returns canonical schemas after owner authorization; `context` and `sync` use the same inputs as hosted tools. `ingest` takes at most ten `{detail,capturedAt,listPlacedText?,runId?,expectedRevision?}` records, projects/redacts in the page and revalidates on the server. Individual records commit independently; response indexes identify successes/conflicts and replay is safe. An HTTP timeout never proves no commit: read back context before retrying.

Already acquired flat browser observations can be transferred **inside that same browser runtime**, without asking the owner to relay them:

```javascript
// acquired is the existing in-memory first-party FOOD observation array.
// Preserve supplied capture times; never replace them with a new transfer timestamp.
const records = acquired.slice(offset, offset + 10).map(({capturedAt,...detail}) => ({detail,capturedAt}));
// Call the newly discovered Morsel-page morsel_blinkit_ingest tool with {records}.
// Replay the same inputs, then use morsel_blinkit_context for actual readback.
```

Use `morsel_blinkit_sync` with the same run actions below. Page registration does not need the stale PTI plugin tool list to be refreshed. Signed-out, disallowed-account, fake-origin and revoked-token requests cannot write. No page tool logs private data. When using the plugin directly, its metadata refresh is optional and separate.

## Before the first actual import

The owner has already signed in normally in ChatGPT Browser. That browser session is not available to Local Codex. No credentials, OTPs or cookies are needed from the owner for the backend. If the browser later reports anonymous/needs_login, the owner signs in normally again. Order history reads were observed to work without a selected address: **do not set an address/location to import history**.

1. Prefer the same-browser page bridge above if the hosted tool names are absent and no metadata refresh action exists. With an available plugin refresh, confirm `pti_apps_list`, `pti_app_context({appId:"food"})`, then `food_blinkit_context({runId:"blinkit-history-20261101-01",limit:1})`. Stop if `ingestionPaused` is true. An existing run must be resumed with its saved cursor/pending rows; do not restart at a cursor remembered from conversation.
2. In the owner's existing Blinkit browser document, use the browser's actual tool discovery. Discover **one exact current name** for each of `get_session`, `list_orders`, `get_order`; actual names have document-specific `__UUID` suffixes. Rediscover on every new document/turn. Ambiguous/missing tools are a blocker. Do not hardcode the previously observed suffix or invent a browser driver.
3. Call only those three read tools, one at a time. `get_session` must report `session.login.kind === "logged_in"` (some callers expose login under result). Keep the session in memory only. Do not forward it to PTI. No cart/address/payment/login writes, purchases or messages.

Ready-to-call first write (after the context/pause check):

```json
{"action":"start","runId":"blinkit-history-20261101-01","mode":"history"}
```

Call this on **`food_blinkit_sync`**. It creates an empty import checkpoint, not purchases. `start` with the same runId/mode returns the existing run. Do not claim orders imported from a started run.

## Precise ChatGPT Browser recipe

This works as a manual tool loop when the chat runtime cannot load repository modules. The reusable Node module `connector.mjs` implements the same loop when actual browser tool discovery/calling and PTI persistence functions can be injected. It does not supply a generic local browser WebMCP driver.

Decode Blinkit's `tools.call` result before interpreting it. The observed return is a **JSON string containing an MCP response**, whose `structuredContent` holds `{ok,session,result}`. Some transports wrap that string in `content[type=text].text`. `decodeEnvelope` handles these wrappers; do not assume `result.orders` exists at the outer layer. Check `ok`; retain only bounded error codes in checkpoints. A raw session, error/recovery text or response blob must never be stored in PTI/Git/log files.

For each bounded invocation (default two new pages / twenty detail reads, maximum ten / one hundred):

1. Read `food_blinkit_context({runId,limit:1})`. If absent, call `start`. Read current run revision before every sync mutation. Honor pause both here and transactionally in writes.
2. **Resume pending rows first.** Otherwise call discovered `list_orders` with `{limit:10}` at null cursor, or `{limit:10,cursor:run.cursor}`. Pass the opaque cursor byte-for-byte; never decode/rebuild it. A non-null `nextCursor` means older history remains. `truncated:true` has no usable cursor: repeat the same input once at limit 10; persistent truncation blocks the run. Never treat missing cursor as end when truncated. Unreadable rows block advancement and require rereading that page.
3. Stage the list page using `food_blinkit_sync` **before** fetching any details:

```javascript
// p is the decoded first-party result. currentRevision comes from the latest PTI run.
const projectRow = r => ({
  order: r.order,
  phase: {kind:r.phase?.kind || 'unknown', status:r.phase?.status ?? null},
  statusText: r.statusText ?? null, placedText: r.placedText ?? null
});
const input = {
  action:'page', runId, expectedRevision:currentRevision,
  page:{cursor:run.cursor, orders:p.orders.map(projectRow), live:p.live.map(projectRow),
    hasMore:p.hasMore, nextCursor:p.nextCursor, truncated:p.truncated,
    unreadableRows:p.unreadableRows, unlistedLiveOrders:p.unlistedLiveOrders}
};
// Call food_blinkit_sync(input). Do not copy itemNames or session.
```

4. Apply explicit scope decisions **before any detail read**. For a token verified outside the authorized food scope, call `food_blinkit_sync({action:"exclude",runId,expectedRevision,exclusions:[{order,reason:"outside_food_scope",basis:"explicit_verified_scope"}]})`. For an explicit nonfood-only preview exclusion use `reason:"nonfood_only_preview",basis:"preview_only"`. No preview names or fake order reference are sent/stored. These are deliberate decisions from actual preview evidence, not inference from missing food words. Never read sensitive excluded details. Ambiguous/mixed rows remain eligible or unresolved; do not pretend their food contents are known.

   For each remaining eligible token, call discovered `get_order({order:pending.order})`. **Full detail is required for imported purchases**: `list_orders.itemNames` is only a preview and can omit lines. Include cancelled, delivery_failed, live and unknown context too. If `contents.kind === "unavailable"`, repeat exactly once. On transient/unavailable/rate-limited reads retry once, observing `retryAfterMs`; for delays over one minute pause and resume later. Do not spin. `order_not_found` requires a fresh list token; retain the old pending row rather than silently deleting it.
5. Use `model.mjs` **`projectDetail`** on the decoded result to allowlist fields and remove nonfood names before sending it to PTI. It returns only `order`, `phase`, `statusText`, `etaText`, `refreshAfterMs`, and `contents:{kind,reference,placedText,items,bill}`. It drops session/userId/address/payment fields. Each food/unknown item is `{name,quantityText,amount,excludedNonfood:false}`. Each clearly nonfood item becomes `{name:null,quantityText:null,amount,excludedNonfood:true}`. Classification and financial-label sanitization run again on the server. If modules cannot be executed, read the canonical `model.mjs` source at the deployed commit and reproduce this exact projection; leave ambiguous names as unknown, never make a confident food/nonfood guess from a brand alone. The server recognizes explicit nonfood terms even if a named line is forwarded, but redaction should happen before the PTI request.
6. Call **`food_blinkit_ingest`** with:

```javascript
({runId, detail:projectDetail(decoded.result),
  capturedAt:new Date().toISOString(), listPlacedText:pending.placedText})
```

`capturedAt` is when this detail was observed; it is never the purchase date. The service stores all detail food/unknown lines, exact quantity/display-date text, phase and whole-bill evidence. An identical fingerprint returns `duplicate:true`. New/changed persistence and removal from run.pending are **one transaction**. If an MCP response is lost, reread context; a cleared pending token proves the transaction committed. Never blindly advance the cursor on a client-side success assumption.

7. On a failed detail call or ingest, reread the run, then call `food_blinkit_sync({action:"fail",runId,expectedRevision,order,errorCode})` if the token is still pending. Codes include `not_answered`, `order_not_found`, `needs_login`, `rate_limited`, `transient`, `persistence_or_revision_conflict`; no raw failure text. Use `action:"block"` for list/discovery failures (`truncated`, `unreadable_rows`, `repeated_cursor`, etc.). Leave pending intact. A pause rejection may prevent even a failure checkpoint; the already staged page still retains its tokens safely.
8. When all rows on a page have been persisted/verified identical, the service advances the cursor. Continue until the bounded invocation is exhausted. Return saved runId, pending count, cursor-present flag, verifiedRows and blockers. Do not expose raw cursors/order tokens unnecessarily in summaries. Resume the same run next turn.
9. Only when `endReached:true`, pending is empty, `listedRows === verifiedRows + excludedRows`, and unique `coverage.unresolved === 0`, call `food_blinkit_sync({action:"finish",runId,expectedRevision})`. The server enforces these conditions. `coverage` distinguishes unique `scanned`, `persisted`, `outsideScope`, `unresolved` and `previewOnlyExclusions`; repeated page appearances do not inflate unique coverage. `historyComplete:true` means declared **food-scope coverage**, never complete contents of excluded baskets. `food_scope_complete` explicitly labels completion with exclusions and `allOrderDetailsKnown:false`. Live/unknown/unlisted orders retain `history_complete_reconciliation_pending`. Future status/refund changes still need reconciliation.
10. Read back purchase/product context and the run; verify actual saved data/counts before reporting an import. An existing receipt in a preview, twenty read rows, a tool registration or a successful deployment is not persistence evidence.

## Reusable coordinator injection

```javascript
import {createBlinkitReader, syncBlinkitBatch} from './connector.mjs';
const reader = createBlinkitReader({
  discoverTools, // actual browser document's discovery, returns [{name}, ...]
  callTool,      // actual authorized browser tool caller: async (exactName,args) => raw
  sleep         // waits only the first-party retry delay; no writes
});
const result = await syncBlinkitBatch({reader, runId:'blinkit-history-20261101-01',
  persistence:{
    context: args => callPti('food_blinkit_context',{...args,limit:1}),
    sync: args => callPti('food_blinkit_sync',args),
    ingest: args => callPti('food_blinkit_ingest',args)
  }, maxPages:2, maxDetails:20,
  scopePolicy: row => explicitOutsideTokens.has(row.order)
    ? {reason:'nonfood_only_preview',basis:'preview_only'} : null});
```

`callPti` is injected, decodes the PTI MCP text JSON, and **throws on isError**. It never uses alternate credentials. All reads and writes are sequential. On a transport/checkpoint failure the invocation may throw: durable context is the restart source. `syncBlinkitBatch` does not automatically approve changed-payload conflicts.

## Data, revisions and queries

Everything is beneath the connected owner's `users/{uid}/foodData/workspace` in the existing default Firestore database:

| Path | Purpose |
| --- | --- |
| `purchases/blinkit-{sha256(reference)[0:40]}` | Latest redacted purchase, provider/reference identity, token needed for reconciliation, revision/fingerprint/provenance |
| `purchases/{id}/revisions/{padded revision}` | Immutable redacted snapshots, preceding fingerprint and optional run ID |
| `purchaseSyncRuns/{runId}` | Exact resumable cursor, pending minimal list rows and bounded failure codes, verified counts, scan completion |
| `purchaseSyncRuns/{runId}/pages/{cursor hash}` | Visited-cursor detection and neutral page metadata; no preview names or sessions |
| `purchaseSyncRuns/{runId}/coverage/{token hash}` | Unique row disposition; exclusions store token, neutral phase/display context, bounded reason/basis and `foodContentsKnown:false`; never an imported purchase |
| `purchaseSyncState/blinkit` | Purchase/revision/status counters and last completed history/reconciliation scan; no purchase-date watermark |

The namespace is isolated from `orders`, `dishes`, `restaurants`, taste, sessions and recommendation counts. Generic MCP writes cannot bypass its specialized tools. Existing restaurant data/workspace settings are never rewritten. `ingestionPaused` is read within every write transaction, including replay and sync checkpoints.

Deduplication uses **provider + order reference**, not an item/preview, capture timestamp or browser account identifier. A fresh token for the same reference cannot create a second purchase. Identical replay does not write a purchase revision or increment counters. Changed payload, status, token, display date or bill/refund evidence requires `expectedRevision` equal to the current revision and a strictly later detail capture. Read `food_blinkit_context({purchaseId})`, compare the latest snapshot (and last ten immutable revisions), then deliberately approve a current-source correction by calling ingest with that revision. A concurrent update rejects the stale guard. Never auto-approve a conflict or overwrite with older evidence.

Food classification is a deliberately limited product-name heuristic, explicitly recorded per line. Ingredients, vegetarian status, consumption, enjoyment and nutrition are unverified. Unknown lines retain their names/amounts for owner review. Clearly nonfood names, quantities and private session/address/payment fields are not retained. Excluded nonfood contributes only line count and known amount; unknown amounts remain null. Redacted exclusion relies on the injected caller using the canonical classifier. Financial labels are allowlisted; unfamiliar labels become `Other bill line` while their amount remains. Unsupported source fields are not copied as raw blobs.

Exact `quantityText` is retained. The final ` x N`/` × N` alone gives a conservative pack count: `3 x 35 g x 1` → one multipack; `35 g x 5` → five packs. Unclear quantity → null. No unit price is manufactured. Exact display dates, including any source-displayed year, are retained with supplied observation/provenance time and `purchasedAt:null`; no source ISO date is invented. Relative display dates may change on reread, requiring a reviewed revision.

`bill.billTotal`/`reconciliation.wholePurchaseTotal` covers the **whole basket**. Food/unknown/excluded line sums and any unallocated amount are arithmetic reconciliation only. No charges, discounts or signed refund amounts are allocated to food, and no figure is labeled food spend. A purchase with only excluded items still persists neutral purchase/status/bill context so history accounting remains honest.

Product query: `food_blinkit_context({product:"peanut",limit:20})`. It scans one document-ID page and returns matched food/unknown lines with purchase phase and provenance. Continue `after:window.nextAfter` until null **even on an empty match page**. Counts are purchase counts, never meals eaten. `scope:"reconciliation"` pages live/unknown purchases. Use each saved token with fresh browser tool discovery to read latest detail and ingest a guarded revision; take note of `refreshAfterMs`, but do not install autonomous polling. Fresh list reads are needed to resolve unlisted live counts. A new `mode:"reconcile"` run records a fresh scan without replacing historical coverage.

## Verification, delivery and rollback

Run `npm run build && npm test` in `tools/pti-mcp`, the existing MCP script selftests, and `node --test personal-harness/core.test.mjs food-app/*.test.mjs` at repo root. Blinkit tests use clearly synthetic orders with sanitized observed **shapes**, never private source orders. Tests cover deployable tool schemas/registration, owner denial, pause, concurrent replay, revision/counter/refund updates, status preservation, food/nonfood/unknown, pack/null/date behavior, full detail vs preview, envelope decoding, pagination, truncation, cursor cycles, retry limits, partial restart/lost-response recovery and redaction.

The existing workflow's authenticated host verifier checks Blinkit registration, canonical discovery, real owner reads and account denials without importing purchases. Morsel deployment verifies page assets and origin-only policy. Tests also cover bounded HTTP transport, origin/auth/UID/oversize/pause denial, page logout/cancellation/redaction, explicit exclusions and unique coverage. `configure-morsel-auth.selftest.mjs` checks exact referrer updates, retained API targets, etag concurrency and IAM/probe failure. No synthetic test establishes owner-browser end-to-end acceptance.

Rollback uses an ordinary scoped revert on `main` and the same hosted-MCP/Morsel lanes. Retain purchases/revisions/runs; never delete them as part of rollback. To stop imports, the owner can use the existing Morsel pause setting. Preserve unrelated API-key restrictions and commits; do not roll back the referrer repair by replacing the entire key configuration. No new rules, schedule, credential or owner authority is required.

Remaining acceptance: actual historical import from the owner's browser session, readback of real persisted purchases, and continued owner-driven status/refund reconciliation. Opaque tokens/cursors may expire or change across browser sessions; those failures remain explicit pending work and are never treated as successful coverage. New first-party shapes require a reviewed adapter change. Refreshing ChatGPT tool metadata is separate from deployment. Local Codex has no access to the owner's Blinkit browser session.
