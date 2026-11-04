# Velum Scene Lab — private plugin

The source of this private plugin lives alongside PTI's shared MCP code. The plugin uses `.app.json` to depend on the owner's **existing ChatGPT PTI Apps** connection. It deliberately declares no `mcp.json` or local executable: this keeps it usable in ordinary ChatGPT web/mobile chats instead of marking an imported MCP package as Desktop only. The specialized tools themselves remain hosted on the existing authenticated PTI Cloud Run MCP server.

Workflow:

1. `velum_prompt_pick` draws uniformly from the manifest's available prompt IDs, avoiding the last 15 selected IDs if alternatives exist. It writes one `selections/{uuid}` document for later feedback.
2. The agent uses the chosen prompt with the currently available image generator and user-authorized adult reference images. It asks the owner to rate the actual generated image on a 1–5 scale.
3. `velum_prompt_rate` writes an immutable `ratings/{selectionId}` record, linked to prompt ID/version and optional stable image reference. `velum_prompt_feedback` reads recent ratings for follow-up analysis.

Canonical Firestore data stays under `users/{uid}/velumPromptData/workspace`. Prompt text, feedback and selection history are private per the connected owner. Existing Drive media and browser-local Velum votes are unchanged. Do not upload original reference photos to Firestore.

The prompt catalog is populated separately through the owner-authenticated PTI Apps MCP. Updates to it do not require a plugin version bump. If the MCP tool list is stale after deployment, refresh/reconnect this plugin or PTI Apps before testing.
