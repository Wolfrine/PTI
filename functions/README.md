# PTI MCP Firebase Function

This function exposes a JSON-RPC MCP-compatible endpoint at `/mcp` with bearer-token authentication.

## Environment

- `PTI_MCP_API_KEYS`: one or more API keys (comma/semicolon/newline separated, or a JSON array)

Examples:

```bash
PTI_MCP_API_KEYS="alpha,beta,gamma"
# or
PTI_MCP_API_KEYS='["alpha","beta"]'
```

### Deployment notes

For GitHub Actions deployment, add repository secret `PTI_MCP_API_KEYS`; the workflow writes `functions/.env` before `firebase deploy`.

For local deploys, create `functions/.env` with the same key before invoking:

```bash
firebase deploy --only functions:mcp --project pti-app-2ab59
```

In CI this repository uses the existing `FIREBASE_SERVICE_ACCOUNT` GitHub secret.

## MCP Tools

- `pti.firestore.get`
- `pti.firestore.list`
- `pti.firestore.query`
- `pti.firestore.create`
- `pti.firestore.set`
- `pti.firestore.update`
- `pti.firestore.delete`
- `pti.firestore.batch_write`
- `pti.firestore.schema_sample`
- `pti.projects.list`
- `pti.actions.list` (`users/{uid}/codexProjects/{projectId}/actionItems`)
- `pti.actions.add`
- `pti.actions.update`
- `pti.actions.complete`

All Firestore write/update operations are executed with `firebase-admin` on the default project.
