# PTI shared MCP

One server for PTI, Luminary, Personal / Daily Intelligence and SEFPO, using the existing `pti-app-2ab59` default Firestore database. `pti_apps_list` discovers apps; `pti_app_context` returns their canonical paths. Add future apps in `src/apps.ts`.

**Velum exception:** its media is in Google Drive and its votes/view history are browser-local. Discovery reports this accurately; this server cannot access those stores until a Drive/sync adapter is implemented.

## Local agents

`npm ci && npm run build` in this directory. The existing `.codex/config.toml` starts `dist/index.js` over STDIO. Supply Application Default Credentials for PTI. `PTI_MCP_ACTOR` and `PTI_MCP_TASK_REF` label audit records. Local credentials retain their existing project access; authentication records remain blocked.

## ChatGPT plugin

The HTTP service uses the same OAuth/Cloud Run architecture as GTOP's working hosted connector (GTOP PR #47), with account ownership enforced for every hosted tool. Google sign-in uses the existing PTI Firebase Auth project. Only `PTI_MCP_ALLOWED_EMAILS` can connect. PKCE, one-use codes, rotating refresh tokens, replay detection, revocation and persistent grants protect the connection.

Connections have no time limit and remain active until revoked. Hourly access tokens refresh automatically; there is no periodic reconnection requirement imposed by this server.

Hosted endpoint: `https://pti-firestore-mcp-185802494856.asia-south1.run.app/mcp`.

Deployment: `.github/workflows/pti-hosted-mcp.yml` builds/tests, checks existing billing, isolates the OAuth namespace, deploys and verifies HTTPS discovery. It never enables billing or creates a Firestore database. Cloud Run needs active project billing and the existing deployment identity needs Cloud Run/Artifact Registry permissions. A green build alone does not mean the plugin is connected.

After successful deployment: ChatGPT → Plugins → + → name **PTI Apps**, description **Access PTI, Luminary, Personal and SEFPO through one private account-scoped connection**, endpoint above, OAuth. Sign in with the approved PTI Google account. Verify `pti_apps_list`, an owned document read, and a temporary create/update/delete before marking connected. Use Refresh after tool metadata changes.

## Tools and boundaries

- Discovery: `pti_health`, `pti_apps_list`, `pti_app_context`.
- Generic Firestore: list collections, get, bounded query, create, update, batch, delete. Hosted paths must belong to the connected UID. Update tokens prevent stale writes; deletes require exact path confirmation.
- SEFPO: compact search/context/change retrieval, draft creation, status transitions, links and inbox capture.
- Daily Intelligence: `personal_context` reads preferences, explicit feedback and opted-in thread titles; `personal_publish` validates five items and checks pause, topic selection, generation and preference version transactionally. Existing scheduled agents should use these tools; no new schedule is created.
- Authentication keys and OAuth storage cannot be read or changed by data tools. Audit records are server-managed.

Verify locally: `npm run build && npm test`; also `node --test ../../personal-harness/core.test.mjs`.

## Deployment status

Deployed on 29 September 2026 after the owner granted repository-scoped Artifact Registry Writer to the existing Firebase deployment identity on `asia-east1/firebaseapphosting-images`. Image upload, OAuth record isolation, sign-in origin registration and Cloud Run deployment succeeded. No new key, database or billing change was required.

Use the latest `PTI shared MCP` workflow result as deployment evidence. ChatGPT OAuth linking is separate; verify authenticated tools before claiming the plugin is connected.

## Morsel receipt capture and recovery

Receipt automation uses the existing Gmail event task and account-scoped PTI connection. Server deployment does not refresh ChatGPT's cached tool list: after adding tools, use **PTI Apps → Manage → Refresh tools** and verify the imported tool names. Check actual saved receipts; a completed task whose reply says “not imported” is a failed product outcome.

For every event, fetch the actual Gmail message and authenticate the Zomato sender. Read food app context and workspace settings; honour `ingestionPaused`. Prefer `food_ingest_email`, then read back `orders/zomato-{orderId}`, items, amount and source message ID. Never infer consumption or enjoyment.

Also reconcile missed receipts since `integration.receiptCapture.lastCompleteReceivedAt` with a 48-hour overlap. If unset, begin at the latest saved receipt date with that overlap. Include older explicitly pending message IDs. Fetch every page; deduplicate by provider order ID. Advance the watermark to the scan start time only after every eligible receipt in that window is verified persisted or is an identical existing order. Retain unresolved Gmail IDs and reasons without advancing past their window. Inbox/unread labels are not import state.

If the specialized tool is absent from the connected list while generic PTI writes work, use this constrained recovery:

1. Fetch and execute the repository's actual `food-app/core.mjs` `normalizeEmail` on the verified sender, immutable Gmail ID, subject, actual receipt timestamp and body. Do not reproduce its IDs/classification by guesswork. Record the source blob SHA.
2. Read the deterministic order path; an identical saved receipt is a no-op. Flag mismatches. Read current workspace and all affected dish/restaurant documents with update tokens.
3. Use one `firestore_batch_write` (at most 20 writes) with a create-only receipt, creates for new entities, token-guarded updates for existing entities and workspace, and counters incremented once per unique dish/restaurant per new order. Preserve existing fields and use the latest receipt time for `lastAt`. The workspace token protects the pause check. On conflict, refetch and recompute; never blindly replay counters.
4. Preserve receipt fields and provenance; add `source.captureMethod=canonical-parser-atomic-plugin-batch` and `source.normalizationBlobSha`. Do not change feedback/preferences or guess session matches. If chosen sessions could need linking, record the imported order IDs under `integration.receiptCapture.pendingSessionOrderIds` for the specialized reconciliation; receipt capture can succeed while plan linkage remains explicitly pending.
5. Read back every affected document and verify counts. If the receipt cannot fit an atomic batch or safe persistence is unavailable, retain its message ID and reason as pending where possible; report exactly what remains unsaved.

This fallback repairs stale metadata without alternate credentials, broader access, a second database or a duplicate schedule. Private receipt contents stay in owner-scoped Firestore, never in this repository.
