# PTI Self-Tracking

Independent PTI PWA for connected operating history. It does not modify the core PTI UI or data model.

## Canonical data
Private root: `users/{uid}/trackerData/workspace`.

The browser is read-only. Canonical writes belong to connected agents through PTI MCP/Admin SDK.

- `evidence`: immutable source-backed material.
- `events`: chronological facts extracted from evidence.
- `nodes`: persistent semantic objects across days.
- `edges`: typed relationships between nodes/events.
- `assessments`: revisable interpretations, separate from evidence.
- `dayIndex`: derived day references for fast rendering.
- `sourceState`: ingestion coverage/cursors.
- `runs`: reconciliation/audit runs.

Daily reports are views over this model, never primary storage.

## Screens
- **Chronicle** — multi-day workstream continuity and carry-forward.
- **Trace** — typed causal/semantic relationships.
- **Investment** — leverage, rework, continuity, closure and reach signals without invented time precision.
- **Node Detail** — full evolution/evidence/context for one persistent object.
- **Search** — connected retrieval across nodes, events and evidence.

## Verification
`node --check tracker-app/app.js && node --check tracker-app/model.mjs && node --test tracker-app/tests/model.test.mjs`

Hosting target: `https://pti-app-2ab59-tracker.web.app`.
