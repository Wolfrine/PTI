# Local Codex relay — 29 October 2026

Implemented the private Local Codex plugin's remote transport so normal ChatGPT conversations can delegate to this PC's signed-in Codex CLI. The hosted relay is deployed through PTI's existing main pipeline; the outbound Windows worker is installed and scheduled. No OpenAI API key, model API billing integration, or Secure MCP Tunnel was added.

## Delivered

- Existing private plugin identity: [Local Codex](https://chatgpt.com/plugins/plugins_6ae2fecacc50819182147ace33f8cc3e), version **0.2.0**, release `pluginrel_6ae312415c9c8191a695caef4c967ea5`.
- Plugin source read-back confirmed remote `/local-codex/mcp`, `requires_local_executor: false`, the preserved author/default prompt/skill, and removal of obsolete packaged local server/worker files. Audience remains private/personal.
- Backend source: `tools/pti-mcp/src/local-codex.ts`, OAuth resource/scope isolation, authenticated owner worker routes, and protected queue storage under the existing server-only namespace. Existing Firestore rules were preserved.
- Worker/package source: `tools/local-codex`; installed runtime, protected credential, task history and scratch evidence under `F:\Workspace\Support\LocalCodexBridge`. The existing project allowlist and task history were retained. Platform-managed Codex binaries/auth/session state retain their required Windows locations.
- **PTI Local Codex Relay** uses `wscript.exe //B //NoLogo`, hidden PowerShell and hidden child processes. A real scheduler invocation started the installed release, published a cloud heartbeat and executed acceptance jobs. Stop/upgrade verifies the owned PID/executable/release path and terminates its process tree; the final task is running and idle.
- Remote pairing reused the same Windows user's existing DPAPI-protected PTI owner sign-in, refreshed and stored under separate relay DPAPI entropy. The monitor's files were unchanged. This shares the existing Firebase login's revocation lifecycle; Google pairing remains available for an independent login. Codex credentials remain on the PC.

Source commits: `a82bbe38a71a3af494587df02c9ec29ed46813a5` and `f88a1a2320091d63c6a6c02a3480c64ad6000e00` on main. The first deployed backend passed [CI and live owner access checks](https://github.com/Wolfrine/PTI/actions/runs/40849574863). The worker hardening passed the same verify job in [the following run](https://github.com/Wolfrine/PTI/actions/runs/40851354104).

## Evidence

Backend build and all 29 tests passed. Worker fixture checks passed for seven tools, F-drive path enforcement, default inspection, request deduplication, continuation, human questions/approvals, cancellation, edit concurrency and refusal of API-authenticated runtime execution. Additional tests passed for stripping API credentials/endpoint overrides and atomic state replacement under simulated Windows sharing locks. Existing Home contract, personal-harness and food regression checks passed.

Live acceptance used standard OAuth/PKCE, a temporary grant revoked in `finally`, the deployed endpoint, the scheduled worker and actual subscription-authenticated Codex inference (`account.type=chatgpt`, model `gpt-6.1-sol`). No tokens were printed or written in plaintext. The work used disposable scratch files rather than production project changes.

| Check | Observed result |
| --- | --- |
| Inspection and retry | Returned an exact random marker read from a scratch file; repeating the request key returned the same job. |
| Continuation | Same local thread retained the marker without rereading; cloud generation advanced and immutable inspect mode was retained. |
| Authorized edit | Created the exact requested scratch file; the acceptance runner independently read and compared its contents from disk. |
| Active cancellation | Running real Codex turn became interrupted. |
| Offline rejection | Disabled this relay's schedule and stopped its verified process tree; after heartbeat expiry, submission returned `Nothing was queued`. |
| Scheduled recovery | Re-enabled and started the task; authenticated cloud status returned online again. |
| Access boundary | Exactly seven Codex tools; PTI and Codex tokens could not cross resources. Foreign owners, stale generations and expired leases were rejected. |
| Responsive UI | Pairing and deployed consent screens visually checked at desktop and 390 × 844 mobile dimensions. |

Real model job IDs from the installed hardened worker: inspection/continuation `0de507686345f959d6122ff4437fea60`, edit `116d48486192df4e18ac256c3ebbf52c`, active cancellation `3f189a3a98ba393e1a3100f66c07553d`. Inspection and continuation used local thread `01a18704-0d8b-7880-b414-d908a35cb60b`. The later offline run completed at `2026-10-29T09:40:21.225Z`; its evidence is `scratch/relay-offline-acceptance.json`. Earlier complete real-model evidence is `scratch/relay-live-acceptance.json`; the later run's model tasks were independently checked in the preserved local task records after its test harness hit a PowerShell invocation-policy error before the offline step. That harness invocation was corrected, and the standalone offline check passed. Fixture protocol tests are synthetic; the model/file/offline checks above used the real deployed system.

## Initial ChatGPT acceptance gap

The remote release is saved and verified, but a fresh normal ChatGPT conversation and a physical phone invocation have **not** been verified. The browser available for inspecting the plugin was signed out of ChatGPT. Open the plugin link on the signed-in phone/web account and connect the updated plugin, then ask: **“Use Local Codex to list my available projects.”** This is a ChatGPT connection step; the PC setup is already installed. The older desktop marketplace package remains enabled pending confirmation of the remote connection, to avoid removing the existing path prematurely.

The PC must stay awake, online and signed into ChatGPT. Availability uses a 60-second heartbeat window; unclaimed requests expire after two minutes and lost leases require explicit continuation. All Codex use draws on the existing account's Codex allowance. Inspection is the default; edits require the user's request and pending human approvals are never invented by the bridge.

## Normal Chat registration correction

The subsequent signed-in Chrome check reproduced the reported failure in **Chat**, with Work unselected. [The read-only test conversation](https://chatgpt.com/c/6ae33721-12d8-83ee-a463-82016ac3e731) reported `TypeError: tools[name] is not a function` and `registered: false` for both requested tools. The worker remained online. The failure was missing tool registration, not an offline PC.

The original portable configuration used the legacy `http` transport name. Version 0.2.1 corrected this to `streamable-http` and declared OAuth/DCR, but the normal Chat plugin settings still exposed only the skill. The registered connection was therefore added through ChatGPT's supported Add custom MCP server flow, with discovery confirming the narrow resource and `local-codex:jobs` scope. The existing full plugin is now version **0.2.2**, release `pluginrel_6ae33ad69df48191a8cb77384dc03f1f`, with a required `.app.json` dependency on `asdk_app_6ae338a56d108191ac90e0812c7e8f16`. Its connection plugin is `plugin_asdk_app_6ae338a56d108191ac90e0812c7e8f16`. The portable/legacy direct MCP files were removed from this personal package to avoid a second independent auth path; server settings are recorded in `tools/local-codex/connection.json`. Identity, private audience, author and default prompt were preserved.

The PC's first Google account chooser closed without completing. The Codex consent flow now supplies the already approved owner's Google login hint, using Firebase's supported provider parameter. Authorization and scope checks are unchanged. The owner subsequently completed the connection on their phone, and the full plugin's required App displayed Connected in signed-in Chrome.

Source correction: `e3c87cf387d56e26bc3f9561a6085644d8c4d608` on main. Backend build and all 29 tests passed again. Both verify and deploy jobs succeeded in [PTI shared MCP run 40873447464](https://github.com/Wolfrine/PTI/actions/runs/40873447464); the deployed consent page was checked for the login hint.

## Signed-in normal Chat verification

After the phone connection, a fresh Chrome conversation was created with **Chat selected and Work unselected**, and the existing full Local Codex plugin attached. [The successful normal Chat test](https://chatgpt.com/c/6ae33dc9-a290-83e8-91ea-59c81cf14105) returned `bridge_status` with `online: true`, `authMode: chatgpt`, `transport: private-pti-relay`, `openaiApiKeyRequired: false` and `lastSeenAt: 2026-10-29T12:36:53.039Z`. `list_projects` returned all seven configured projects as available: scratch, PTI, Noveliaa, GTOP, Growth Tutorials, NovaSaga and Worldline. The conversation activity showed the Local Codex Connection integration in use. These first two checks started no local task.

The same normal Chat then started an `inspect` task in the scratch project and polled it to completion. Its prompt named a newly created probe file without revealing its contents. The CLI returned the exact random marker `normal-chat-cd35be5834ef4535af274bf215b1c291`; an independent disk read confirmed the marker. The local reply included Markdown around the marker, which the acceptance comparison extracted before exact matching. Cloud task `54c0bfab0f1efb00df0d514928defb50` maps to local task `4878eecad2ec8c79f458126e978a67e0`, thread `01a187ac-34e8-7f02-b33e-60f96864de13`, model `gpt-6.1-sol`, status `completed`, mode `inspect`, error `null`. This verifies the normal Chat → authenticated relay → scheduled PC worker → subscription Codex CLI → normal Chat round trip with a real file and real model execution. The CLI reported no changes.

Evidence: `F:\Workspace\Codex\2026-10-29\local-codex-bridge\outputs\browser-check\normal-chat-cli-acceptance.json`, `normal-chat-cli-success.jpg`, `plugin-connected.jpg` and the linked conversation. The evidence JSON retains the complete CLI reply and successful exact marker comparison. The probe file and task history remain in the configured scratch/runtime directories.

The earlier normal-web acceptance gap is closed. The owner confirmed phone OAuth completion; a task initiated directly from the physical phone has not been observed. The existing desktop marketplace package and its history remain intact.
