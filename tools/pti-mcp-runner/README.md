# PTI MCP through GitHub Actions

This adapter mirrors the proven GTOP route for agents that can access GitHub but do not have PTI Firebase credentials in their chat runtime.

The workflow starts the real `tools/pti-mcp` STDIO server, discovers its advertised tools and executes only the committed request. Firestore credentials remain in GitHub Actions; database results are saved as a private one-day artifact rather than printed to logs.

## Request route

- Branch: `codex/pti-mcp-access`
- Trigger file: `tools/pti-mcp-runner/request.json`
- Workflow: `PTI MCP access`
- A request expires within 24 hours and declares `read` or `write` mode.
- Read mode rejects every tool not advertised as read-only.
- Write operations retain the MCP's update-token and explicit-delete safeguards.
- `kind: verify` creates, updates, reads and deletes one random `mcpConnectionChecks` document, verifies absence, and attempts cleanup if a later step fails.
- Automatic workflow reruns are rejected; submit a fresh request after inspecting a failure.

This is an asynchronous authenticated bridge, not a public MCP endpoint and not a native ChatGPT plugin.
