# Local Codex from normal ChatGPT chats

The private Local Codex plugin calls `/local-codex/mcp` on PTI's existing Cloud Run service. Seven job tools delegate work to an outbound Windows worker. The discussion stays in the normal ChatGPT conversation, including on web/mobile clients that support the connected plugin.

The worker launches the installed Codex CLI's app-server using the Windows user's **ChatGPT subscription sign-in**. It rejects API-key authentication and removes model API credential/endpoint overrides from child environments. Codex credentials never leave the PC. PTI Firebase OAuth authorizes the relay; a separate current-user DPAPI credential authorizes the worker. This is not an OpenAI inference API integration.

## Operation

Source: `tools/local-codex`; installation: `F:\Workspace\Support\LocalCodexBridge`. Existing config and task history are preserved. `config.json` contains the F-drive project allowlist. Omit `codexPath` to select the newest installed desktop runtime. Platform-managed Codex binaries, sign-in and session state retain their required Windows locations.

Build with `npm ci --ignore-scripts`, `npm run build`, then `npm test` on Windows. Run `install.ps1 -NoSchedule`, then the installed `run.ps1 -Command setup` to pair through Google. Run `install.ps1` to register **PTI Local Codex Relay**. Its `wscript.exe` launcher hides PowerShell and descendants from creation; scheduler overlap protection and a worker lock prevent concurrent instances. It starts at login and retries every minute, while the user is signed in. Check installed `data/status.json` and authenticated `bridge_status` for live availability. Stop the named scheduled task to stop accepting work; active child work also stops if connectivity is lost for 45 seconds. Do not delete task history when upgrading.

The PC must be awake, online and signed into ChatGPT. Submission requires a heartbeat younger than 60 seconds. Unclaimed jobs expire after two minutes; claimed jobs have a renewable 90-second lease. A lost lease reports interruption and cannot renew later. Resume explicitly with `continue_task`; it retains project/mode. Reuse an exact request key on retries. Cancellation cannot undo completed edits.

## Authorization and evidence

Only the approved PTI owner can use the endpoint. OAuth scope `local-codex:jobs` is bound to the `/local-codex/mcp` resource and cannot call root PTI tools. Worker routes require a verified owner Firebase ID token. Queue records live in the existing server-only `_ptiLocalServices` namespace, also rejected by generic PTI data tools. No Firestore rule expansion is required.

`inspect` is the default, with the CLI read-only sandbox. `edit` uses workspace-write and requires user intent. Project instructions apply. Pending questions and approvals are returned to chat; only an actual human response may be forwarded. Work uses main and existing pipelines when delivery is authorized. The bridge does not expose unrelated Codex chats or recursively delegate to itself.

Tests cover OAuth/resource isolation, offline rejection, expiry, idempotency, lease loss, continuation, cancellation, questions, approvals, F-drive enforcement, edit concurrency and API-auth refusal. Fixture results are synthetic protocol tests. Live acceptance must separately demonstrate a scheduled heartbeat and a real Codex result through the deployed relay. A Connected badge alone is insufficient, and desktop/mobile layout checks do not prove physical mobile execution.

The plugin source is in `plugin/`. Update the existing private plugin identity with these remote manifests; remove obsolete packaged `server.mjs` and `worker.mjs`. Do not create a second plugin or publish credentials. The older desktop marketplace package can be disabled after the remote release is connected; preserve its history.
