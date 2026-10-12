# PTI Track — ChatGPT conversation capture data contract

## Purpose
Private source: `Wolfrine/chatgpt_harness/captures/chatgpt/YYYY/MM/DD/*.json`.
PTI Firestore stores an owner-readable mirror and compact index. The original record in GitHub is the evidence source; Firestore is a materialized view and must not overwrite the source.

### Firestore path
`users/{uid}/trackerData/workspace/chatTurns/{sourceFilenameWithoutDotJson}`

**Existing initial import:** four captures from October 12, 2026.

| Field | Meaning |
| --- | --- |
| `id`, `schemaVersion` | Stable filename-derived capture ID, schema version 1 |
| `sourceRepo`, `sourcePath`, `sourceUrl`, `sourceBlobSha` | GitHub source provenance, including original blob hash |
| `capturedAt`, `localDate` | Capture timestamp (not the message delivery timestamp), India-local date |
| `conversationId`, `conversationHint`, `groupingConfidence` | Verified ID if available; null and `hint-only` otherwise |
| `messages` | Two complete *source-authored* messages (user, assistant) including verbatim text and provenance |
| `userPreview`, `assistantPreview` | Compact list-view extracts, not canonical evidence |
| `coverage`, `captureStatus`, `deliveryVerified` | Source completeness, `partial` or `prepared-complete`, final UI never attested |
| `originNotes`, `indexedAt` | Source limitations and Firestore mirror creation time |

Records are created once per source file. No attempt should be made to infer missing messages, alter contents, or merge unrelated conversations. `conversationHint` is not proof of the session identity. `prepared-complete` refers only to the captured prepared answer; it does **not** establish that ChatGPT rendered or delivered identical content.

### Synchronization state
`users/{uid}/trackerData/workspace/sourceState/chatgptHarness` tracks the observed repository commit, seeded records, latest imported capture timestamp and coverage limits. The separate `sourceState/chatgpt` retains historical partial-source tracking. Do not overwrite or mark the old source exhaustive.

### Sync workflow requirements
Use the authenticated GitHub connector to list new private `captures/chatgpt` files, the authenticated PTI Apps connector to create missing `chatTurns` records, and a stable source filename as document ID. Check document existence before create; compare existing `sourceBlobSha` and `sourcePath` instead of overwriting. After successful writes update the `chatgptHarness` source cursor using the update-time precondition. Do not advance the cursor after partial failure. Skip user opt-out transcripts if any appear; report a source capture violation rather than multiplying the copy. Avoid committing credentials or invoking unsupported ChatGPT extraction.

### Interface agreement for Work
PTI Track remains owner-authenticated and client read-only; Firestore rules for `trackerData` already enforce this.

- Add a calm **Recent Discussions** panel, displaying no more than 3–5 items initially, with search/filter and an optional full-screen drilldown.
- Show exact user and assistant text on expansion, source link, capture time, capture completeness, and rendered-verification disclaimer.
- Use day grouping when conversation IDs are unavailable. Do not infer that similarly named hints are a single session.
- Keep this panel separate from Chronicle/Trace; do not duplicate each chat turn as a graph node or timeline event.
- Display observable *source sync status* separately from *conversation coverage*. A healthy sync is not proof that every ChatGPT conversation was captured.
- Keep `evidence/events/nodes/edges/assessments` unchanged unless adding separately justified, sourced semantic events.

Data design follows the PTI tracker agent's evidence-first, correction-preserving policy.
