# PTI Firestore MCP

Repo-local STDIO MCP for PTI, modelled on the working GTOP pattern. It avoids Firebase Functions and therefore does not require upgrading the PTI Firebase project from Spark merely to give local Codex/agent sessions Firestore access.

## Setup

```bash
cd tools/pti-mcp
npm install
npm run build
```

Provide Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS` with access to `pti-app-2ab59`. The root `.codex/config.toml` registers the built server.

Environment:
- `PTI_FIREBASE_PROJECT_ID` — defaults to `pti-app-2ab59`
- `PTI_MCP_ACTOR` — audit actor label
- `PTI_MCP_TASK_REF` — optional task/run reference

## Tools

Generic bounded Firestore tools:
- `pti_health`
- `firestore_list_collections`
- `firestore_get_document`
- `firestore_query`
- `firestore_create_document`
- `firestore_update_document`
- `firestore_batch_write`
- `firestore_delete_document`

SEFPO-optimized tools:
- `sefpo_search` — compact search results instead of full documents
- `sefpo_get_context` — one context packet plus edges/evidence
- `sefpo_changes_since` — incremental delta retrieval
- `sefpo_create_draft` — atomic canonical unit + entities + context + change
- `sefpo_set_status` — revisioned validation state transition
- `sefpo_link_units` — explicit graph edge
- `sefpo_capture_inbox` — raw observation capture

Writes are audited to `mcpAuditLog`. Generic reads are bounded; destructive writes require update tokens and explicit confirmation.
