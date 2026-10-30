# PTI Track — ChatGPT capture index (Firestore primary v3)

## Active capture path

Custom Instructions → ChatGPT Harness save-conversation skill → authenticated PTI Apps `chat_capture_turn` → Firestore. No GitHub write for newly captured live turns after activation.

- `chat_capture_turn` makes one atomic transaction: create-only `chatTurns/{turn_id}` with exact user and prepared assistant text, plus create/update `chatConversations/{harness_conversation_id}`.
- The authenticated owner is taken from the PTI MCP connection. The caller never supplies an owner UID or an arbitrary Firestore path.
- Each turn ID is unique and stable across retries; conflicting text cannot overwrite previously captured text.
- The tool returns the canonical harness conversation ID. The skill must keep it in current chat context. A new ID is permitted only for a genuinely first capture. Missing/ambiguous previously established IDs must fail closed, not silently split or merge chats.
- The source is `chatgpt_harness_firestore`, `schemaVersion:3`. `deliveryVerified:false` remains mandatory: saved assistant text is prepared Markdown, not an independently verified UI transcript.
- Storage time is the server capture time, not a fabricated user-message or delivery timestamp.
- The single Firestore turn document has a conservative 700KB inline-payload limit. Larger source material must fail without truncation; an external blob strategy is future work.
- Do not store hidden instructions, private tool results, chain-of-thought, credentials, or attachments not explicitly verified.
- New skill instructions preserve the existing ask-once-per-chat recording consent policy and immediate opt-out. A model-invoked skill is best-effort, not a universal ChatGPT lifecycle hook.

## Firestore model

Owner root: `users/{uid}/trackerData/workspace`.

| Collection | Purpose |
| --- | --- |
| `chatConversations/{harness_conversation_id}` | Mutable conversation metadata/index (title, identity quality, last capture, count). Summaries/classifications are derived and must be correctable. |
| `chatTurns/{turn_id}` | Immutable text evidence per user/assistant turn; exact original content and provenance/coverage. |
| `sourceState/chatgptHarness` | Legacy GitHub-import cursor and coverage; not the source of truth for new direct captures. |

The owner-only Tracker client reads; writes use authenticated PTI MCP/Admin SDK. Current Firestore client rules deny all Tracker client writes, preserving the existing security boundary. Raw private conversation content must never be committed to the PTI code repository.

## Legacy import and cutover

The previous canonical GitHub format (`Wolfrine/chatgpt_harness/conversations/chatgpt/YYYY/MM/<id>.json`) and pre-v2 records (`captures/chatgpt/`) remain **legacy read-only evidence**. Import on a per-conversation basis after schema/provenance validation, compare any pre-existing Firestore records, preserve original GitHub file references and turn IDs, and never duplicate or rewrite a conflicting turn. Track precise completeness and missed/partial records. Existing GitHub history must not be removed during this migration.

**Switch live skill routing only after `chat_capture_turn` is visible through the connected hosted MCP, owner-scoped read/write acceptance passes, duplicate/conflict behaviour passes, and fresh records are read back.** Until then, the old capture workflow remains active; do not silently claim the switch is completed.

## Historical v2 contract

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
