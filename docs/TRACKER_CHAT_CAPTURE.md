# PTI Track — ChatGPT capture index (v2)

## Canonical archive

**One JSON file per ChatGPT conversation** in the PRIVATE `Wolfrine/chatgpt_harness` repository:

`conversations/chatgpt/YYYY/MM/<harness_conversation_id>.json`

The file is **updated in place through GitHub commits** whenever a new exchange occurs; `turns[]` grows. The year/month is when capture began, not each turn's date. `harness_conversation_id` is synthetic when the real ChatGPT conversation ID is unavailable. Never group by title/topic/date alone. Uncertain identity must be reported, not guessed.

Schema: `Wolfrine/chatgpt_harness/schemas/live-conversation.schema.json`

Previous files at `captures/chatgpt/YYYY/MM/DD/*.json` are v1 **read-only legacy evidence**, retained for audit. Some v1 records were imperfect/incomplete. They may be represented as migrated turns with a `legacy_source` pointer, not silently rewritten.

## PTI Firestore model

Owner root: `users/{uid}/trackerData/workspace`

| Collection | What it contains |
| --- | --- |
| `chatConversations/{harness_conversation_id}` | One lightweight metadata/index record per canonical GitHub chat. Fields: sourcePath, sourceCommitSha/sourceBlobSha (latest inspected), turnCount, lastCapturedAt, capturedCoverage, identity/provisional-ID status. |
| `chatTurns/{turn_id}` | One immutable **materialized turn index** per new turn from `turns[]` with exact user and assistant texts, coverage, timestamp, parent harness conversation ID and a verifiable source revision. Existing v1 turn documents remain intact. |
| `sourceState/chatgptHarness` | Sync cursor, latest inspected repository commit, counts and coverage limitations; advance with update-time precondition only after all inserts/validations. |
| Existing `evidence`, `events`, `nodes`, `edges`, `assessments` | Independent semantic analysis, never the original transcript source. |

**Important:** Firestore may store separate `chatTurns` records for indexed queries even though GitHub stores ONE JSON file per chat. This does NOT mean the archive is split by turn. Do not duplicate large whole-conversation payloads in every index record.

## Reconciliation invariants

1. Read `sourceState/chatgptHarness` and the GitHub current main commit.
2. Discover new **or MODIFIED** v2 conversation files. Updating a v2 file is expected as new turns append.
3. Verify stable harness conversation identity and validate the full schema. Check that the already-indexed prefix of `turns[]` (IDs, roles, exact text, provenance) was **not modified or deleted**; GitHub prior revisions can provide audit evidence.
4. Each new `turn_id` is create-only in `chatTurns`. When a migrated v2 turn has `legacy_source`, compare its original messages with the v1 document and reuse the existing record if identical; preserve its old source link and provenance.
5. Update or create `chatConversations` metadata with the known verified turn count, only after inserts. A current Git blob SHA reflects latest revision, while per-turn source can point to the commit where first seen.
6. Advance source state with an update-time precondition only once all checks succeed. On partial failure, do not advance; retry by IDs without duplicate writes.
7. Never import opted-out chats, invent message IDs or ChatGPT-delivery timestamps, merge unrelated conversations, treat assistant-prepared Markdown as verified rendered UI, or interpret a healthy sync as 100% chat coverage.

## Interface for Work

Owner-only, read-only Firebase client (existing trackerData rules). Provide a **Recent Discussions** panel with 3–5 recent conversations as default, one row/card per **conversation**, not per turn. Drill down to ordered role-labeled messages on demand. Label a grouping as provisional when provider chat ID is unavailable. Distinguish sync health from total capture completeness. Do not clutter the Chronicle/Trace by generating one semantic graph node per chat turn.

Actual capture text stays private. No GitHub credentials or Firebase Admin keys in front-end code. Render source timestamps as capture times; preserve source fidelity and unknown fields.

## Deployment notes

The scheduled ChatGPT Firestore Sync task uses the connected private GitHub and PTI Apps tools. The legacy contract below is superseded by this v2 document. Both user messages and prepared assistant responses must be persisted with explicit coverage flags.
