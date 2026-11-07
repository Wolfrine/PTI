# Interactive QA capability broker

Owner-authorized implementation, 7 November 2026. One existing `local-codex` native parent; serial implementation because capability reporting, owner storage and reservation transitions share one contract. No Taleweald edits or existing task/session interruption.

## Implemented contract

Hosted MCP 0.4.5 adds `get_capabilities`, `request_interactive_qa`, `get_interactive_qa`, `list_interactive_qa`, `update_interactive_qa`. `bridge_status.capabilities` exposes the same status. Worker 0.4.8 optionally reports only sanitized browser-preflight facts in its heartbeat. Old workers remain compatible; missing telemetry stays unknown. Desktop/browser require manual handoff, speaker playback is unverified, and audio capture/analysis are unsupported. Online status and environment presence cannot establish authorization.

There is no verified official programmatic Desktop activation/delegation API in this implementation. It never launches a browser, controls a desktop, copies credentials/pipes, changes preflight, or calls Playwright/CDP. The official manual route remains ChatGPT desktop `@Chrome` / `@Browser` / `@Computer`, or Codex/Remote paired to that host with the relevant Computer Use/browser setup and awake/unlocked Windows. See [Browser](https://learn.chatgpt.com/docs/browser) and [Remote](https://learn.chatgpt.com/docs/remote-connections).

## Durable handoff and external run

All interfaces use the existing Local Codex owner OAuth resource/guard. Requests are stored under the existing server-only `_ptiLocalServices/local-codex/owners/{owner}/interactiveQaRequests/{id}` namespace. No Firestore client grants or rules changes are needed. Trusted Taleweald HTTPS origins with the Taleweald/Ragnarok project, or an explicitly available project from the worker allowlist, are accepted. Targets and artifact URLs must not contain credentials, query strings or fragments. This is metadata storage, never network access approval.

1. Call `get_capabilities`. `canPlayWithAudio:false` is truthful even while the worker is online.
2. Call `request_interactive_qa` with a stable `request_key`, project, revision, credential-free URL, exact build reference, objectives, and `device:{viewport,input,audio}`. A missing provider yields a persisted `requires_handoff`, never success. The default pending-record lifetime is 24 hours; `expires_at` can select another future time. This is not a model execution cap.
3. In an explicitly owner-authorized official Desktop session, read that exact request. `update_interactive_qa` with `action:begin` needs `session:{source_session_id,entrypoint,owner_consent_confirmed:true,foreground_exclusive_confirmed:true}`. It reserves the one physical foreground; it does not acquire a session. The response returns a `run.id` and a renewable 90-second lease. Use `action:renew` with `run_id` and a new stable operation key before expiry. This is a reservation lease, not a task duration limit.
4. Complete with matching `run_id`, `desktop_idle:true`, and `receipt:{gameplay_verdict,observations,visual_observed,audio_observed,observed_at,artifacts}`. Each actual artifact needs `kind`, credential-free `uri`, `sha256`, `captured_at`, and `capture_source`. Audio observation requires an audio artifact or video explicitly declaring `contains_audio:true`; a log or speaker claim is insufficient. No artifact is fetched or independently authenticated by the broker.
5. `action:fail` requires a reason and idle confirmation, with an optional truthful receipt. `expire` records overdue requests/runs. `release` abandons an uncompleted request; a held foreground can only be released after `desktop_idle:true`. Lease expiry never silently frees a possibly still-active external desktop. No operation stops the external session. Expired/failed/released records remain readable and paginated.

Begin and receipts are **owner-scoped operator attestations**, not cryptographic Desktop-session proof. `providerSessionVerified:false`, `playableTested:false`, receipt `verification:not-independently-verified`, and `owner_verdict:unreviewed` remain explicit. A completed report is distinct from accepted gameplay. Artifact timestamps are constrained to the run; visual/audio claims need corresponding references. Hash/reference validation does not establish captured bytes, listening or physical device acceptance.

## Delivery and rollback

Local deterministic checks were explicitly requested for this broker; they are synthetic protocol/security evidence, never playable QA. Preserve required existing checks. Deploy hosted schema support through the existing main pipeline before activating worker 0.4.8, because older hosts reject unknown heartbeat fields. Do not restart an active relay. The delivering task itself is active, so activation is deferred unless a separately verified idle window exists. Retain installed 0.4.7 as rollback; reverting hosted changes requires rolling the worker back first. No automatic idle helper or new scheduled job is introduced.

The new tools become available to connected web/mobile clients after hosted deployment and tool-schema refresh. Plugin source 0.4.6 includes usage guidance; committing that metadata is distinct from publishing/installing a plugin release.

## Local evidence

Both builds passed; 180 hosted tests and 60 Windows worker tests passed, and the Home contract passed. A real local built MCP client used production Firestore through standard administrator ADC to create/retry/read handoff `8ef2def60e54181e7b8b83b95a195bdf`; it remained `requires_handoff`, without a run or receipt. This verifies persistence and the local-built MCP contract, not deployed OAuth, browser control or gameplay. Evidence: `F:/Workspace/Codex/2026-11-07/local-codex-interactive-qa/outputs/practical-storage.json`. The existing v2 HTML artifact hash was independently re-read as `97efde4e37107fe372494a2f60e989143cc029fcc0f9329aa31b15b7c5be3b62`. The handoff first requires confirming that the requested hosted route actually serves that build; no hosting/playability assertion was made.

Installed worker 0.4.7 remained online with the delivering task active in native parent `01a1b6f2-9121-7412-b874-370f30fe57da`, resolved Sol/xhigh. Activation of built 0.4.8 was deferred. Hosted deployment and plugin publication remain separate delivery evidence to inspect after source commit.
