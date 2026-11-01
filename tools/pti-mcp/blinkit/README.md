# Morsel Blinkit purchase connector

Our own connector to **Blinkit's first-party page WebMCP**. Source contract: [blinkit.com/llms.txt](https://blinkit.com/llms.txt), checked 1 November 2026. There is no standalone REST endpoint. No community Blinkit MCP package, code, endpoint, scraping, credentials or cookie transfer is used.

Backend and orchestration only; Morsel's restaurant studio and UI are unchanged. No scheduler is installed. The three hosted tools are `food_blinkit_context`, `food_blinkit_ingest`, `food_blinkit_sync`. Deployment uses the existing `pti-hosted-mcp.yml` workflow. Server deployment and ChatGPT's cached tool metadata are separate gates.

## Before the first actual import

The owner has already signed in normally in ChatGPT Browser. That browser session is not available to Local Codex. No credentials, OTPs or cookies are needed from the owner for the backend. If the browser later reports anonymous/needs_login, the owner signs in normally again. Order history reads were observed to work without a selected address: **do not set an address/location to import history**.

1. Refresh **PTI Apps → Manage → Refresh tools** if the three tool names are absent. Confirm `pti_apps_list`, `pti_app_context({appId:"food"})`, then `food_blinkit_context({runId:"blinkit-history-20261101-01",limit:1})`. Stop if `ingestionPaused` is true. An existing run must be resumed with its saved cursor/pending rows; do not restart at a cursor remembered from conversation.
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

4. For each returned pending token, call discovered `get_order({order:pending.order})`. **Always fetch detail**: `list_orders.itemNames` is only a preview and can omit lines. Include cancelled, delivery_failed, live and unknown rows too. If `contents.kind === "unavailable"`, repeat exactly once. On transient/unavailable/rate-limited reads retry once, observing `retryAfterMs`; for delays over one minute pause and resume later. Do not spin. `order_not_found` requires a fresh list token; keep the old pending row, reread its page or start a new discovery run, and report the unresolved token for explicit repair rather than silently deleting it.
5. Use `model.mjs` **`projectDetail`** on the decoded result to allowlist fields and remove nonfood names before sending it to PTI. It returns only `order`, `phase`, `statusText`, `etaText`, `refreshAfterMs`, and `contents:{kind,reference,placedText,items,bill}`. It drops session/userId/address/payment fields. Each food/unknown item is `{name,quantityText,amount,excludedNonfood:false}`. Each clearly nonfood item becomes `{name:null,quantityText:null,amount,excludedNonfood:true}`. Classification and financial-label sanitization run again on the server. If modules cannot be executed, read the canonical `model.mjs` source at the deployed commit and reproduce this exact projection; leave ambiguous names as unknown, never make a confident food/nonfood guess from a brand alone. The server recognizes explicit nonfood terms even if a named line is forwarded, but redaction should happen before the PTI request.
6. Call **`food_blinkit_ingest`** with:

```javascript
({runId, detail:projectDetail(decoded.result),
  capturedAt:new Date().toISOString(), listPlacedText:pending.placedText})
```

`capturedAt` is when this detail was observed; it is never the purchase date. The service stores all detail food/unknown lines, exact quantity/display-date text, phase and whole-bill evidence. An identical fingerprint returns `duplicate:true`. New/changed persistence and removal from run.pending are **one transaction**. If an MCP response is lost, reread context; a cleared pending token proves the transaction committed. Never blindly advance the cursor on a client-side success assumption.

7. On a failed detail call or ingest, reread the run, then call `food_blinkit_sync({action:"fail",runId,expectedRevision,order,errorCode})` if the token is still pending. Codes include `not_answered`, `order_not_found`, `needs_login`, `rate_limited`, `transient`, `persistence_or_revision_conflict`; no raw failure text. Use `action:"block"` for list/discovery failures (`truncated`, `unreadable_rows`, `repeated_cursor`, etc.). Leave pending intact. A pause rejection may prevent even a failure checkpoint; the already staged page still retains its tokens safely.
8. When all rows on a page have been persisted/verified identical, the service advances the cursor. Continue until the bounded invocation is exhausted. Return saved runId, pending count, cursor-present flag, verifiedRows and blockers. Do not expose raw cursors/order tokens unnecessarily in summaries. Resume the same run next turn.
9. Only when `endReached:true`, pending is empty and `listedRows === verifiedRows`, call `food_blinkit_sync({action:"finish",runId,expectedRevision})`. The server enforces these conditions. `historyComplete:true` can coexist with `status:"history_complete_reconciliation_pending"` for live/unknown/unlisted orders. **Only `status:"complete"` means no such reconciliation was known at scan completion.** A completed history scan is not a guarantee that future status/refund changes have been read.
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
  }, maxPages:2, maxDetails:20});
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
| `purchaseSyncState/blinkit` | Purchase/revision/status counters and last completed history/reconciliation scan; no purchase-date watermark |

The namespace is isolated from `orders`, `dishes`, `restaurants`, taste, sessions and recommendation counts. Generic MCP writes cannot bypass its specialized tools. Existing restaurant data/workspace settings are never rewritten. `ingestionPaused` is read within every write transaction, including replay and sync checkpoints.

Deduplication uses **provider + order reference**, not an item/preview, capture timestamp or browser account identifier. A fresh token for the same reference cannot create a second purchase. Identical replay does not write a purchase revision or increment counters. Changed payload, status, token, display date or bill/refund evidence requires `expectedRevision` equal to the current revision and a strictly later detail capture. Read `food_blinkit_context({purchaseId})`, compare the latest snapshot (and last ten immutable revisions), then deliberately approve a current-source correction by calling ingest with that revision. A concurrent update rejects the stale guard. Never auto-approve a conflict or overwrite with older evidence.

Food classification is a deliberately limited product-name heuristic, explicitly recorded per line. Ingredients, vegetarian status, consumption, enjoyment and nutrition are unverified. Unknown lines retain their names/amounts for owner review. Clearly nonfood names, quantities and private session/address/payment fields are not retained. Excluded nonfood contributes only line count and known amount; unknown amounts remain null. Redacted exclusion relies on the injected caller using the canonical classifier. Financial labels are allowlisted; unfamiliar labels become `Other bill line` while their amount remains. Unsupported source fields are not copied as raw blobs.

Exact `quantityText` is retained. The final ` x N`/` × N` alone gives a conservative pack count: `3 x 35 g x 1` → one multipack; `35 g x 5` → five packs. Unclear quantity → null. No unit price is manufactured. Exact display dates are retained with observation/provenance time and `purchasedAt:null`; no year is invented. Relative display dates may change on reread, requiring a reviewed revision.

`bill.billTotal`/`reconciliation.wholePurchaseTotal` covers the **whole basket**. Food/unknown/excluded line sums and any unallocated amount are arithmetic reconciliation only. No charges, discounts or signed refund amounts are allocated to food, and no figure is labeled food spend. A purchase with only excluded items still persists neutral purchase/status/bill context so history accounting remains honest.

Product query: `food_blinkit_context({product:"peanut",limit:20})`. It scans one document-ID page and returns matched food/unknown lines with purchase phase and provenance. Continue `after:window.nextAfter` until null **even on an empty match page**. Counts are purchase counts, never meals eaten. `scope:"reconciliation"` pages live/unknown purchases. Use each saved token with fresh browser tool discovery to read latest detail and ingest a guarded revision; take note of `refreshAfterMs`, but do not install autonomous polling. Fresh list reads are needed to resolve unlisted live counts. A new `mode:"reconcile"` run records a fresh scan without replacing historical coverage.

## Verification, delivery and rollback

Run `npm run build && npm test` in `tools/pti-mcp`, the existing MCP script selftests, and `node --test personal-harness/core.test.mjs food-app/*.test.mjs` at repo root. Blinkit tests use clearly synthetic orders with sanitized observed **shapes**, never private source orders. Tests cover deployable tool schemas/registration, owner denial, pause, concurrent replay, revision/counter/refund updates, status preservation, food/nonfood/unknown, pack/null/date behavior, full detail vs preview, envelope decoding, pagination, truncation, cursor cycles, retry limits, partial restart/lost-response recovery and redaction.

The existing workflow's authenticated host verifier now also checks Blinkit tool registration, canonical discovery, a real owner-scoped read and cross-account denials. It does not import a purchase or create a run. Backend test success and CI tool registration do not establish owner-browser end-to-end import acceptance.

Rollback uses an ordinary scoped revert on `main` and the same hosted-MCP lane. Retain purchases/revisions/runs; never delete them as part of rollback. To stop imports, the owner can use the existing Morsel pause setting. No new rules, workflow, UI, scheduler or credentials are required. Do not revert unrelated commits or dirty files.

Remaining acceptance: actual historical import from the owner's browser session, readback of real persisted purchases, and continued owner-driven status/refund reconciliation. Opaque tokens/cursors may expire or change across browser sessions; those failures remain explicit pending work and are never treated as successful coverage. New first-party shapes require a reviewed adapter change. Refreshing ChatGPT tool metadata is separate from deployment. Local Codex has no access to the owner's Blinkit browser session.
