# Existing desktop Chrome and native app controls

Load only for actual browser/desktop work or authorization diagnostics. Keep the owner in the requesting ChatGPT chat and reuse the exact desktop-owned native module parent. The standalone relay's browser/audio flags are scoped to its own process; they do not deny the calling desktop chat's official tools.

## Entry and ownership

- With the supported worker and host, continue_desktop_chat queues a prompt to the existing signed-in Codex desktop chat through the official queue/app link. Read list_projects first for exact project/module/thread ownership, then list_tasks for competing work. The queue does not create a chat or transplant browser identity. A queued or started receipt is not proof that browsing or the task succeeded; read the exact native turn after execution.
- The desktop chat owns its current model, permissions, connected browser tabs and native tool checks. Its actual browser tools may operate authorized local Chrome in the same session, including when current tab shows chrome://extensions. No separate PTI Owner Chrome consent, interactive-QA broker or manual desktop opening is normally needed.
- bridge_status.capabilities.desktopHandoff can show state available and automaticActivation true while authorized remains null. The latter means destination permission checks were not performed by the bridge. Do not report it as a missing grant or infer a grant from handoff support.
- Do not use resume_codex_thread merely to reach browser tools: it launches a standalone session without the desktop chat's browser authorization. For authorized owner requests, use continue_desktop_chat or a real app-native continuation of the existing chat. Keep checkout, parent and previous exact turn identifiers.

## Select the actual controller

1. In a desktop chat exposing an official connected Chrome/tab API, use that API to select/open/navigate pages, interact and capture page evidence. Inspect the actual tools and URL after navigation before claiming an interaction or a playable view.
2. Use native Windows app input for native applications or controls the browser API cannot expose, only if the native URL/security policy permits it. Native address-bar keys or Ctrl+T can trigger a URL-confidence stop even when official Chrome navigation is allowed; do not repeat that failed path through other input channels.
3. Honor the owner's explicit browser, local Chrome profile and environment choice. PTI Owner Chrome is a separate optional standalone provider, disabled by default. Ask for its normal site/task consent only if the owner actually requests that provider and the existing desktop route cannot do the job. Do not install extensions or copy session identities solely for a check.
4. Cloud browser use is a distinct environment requiring its own authorization; it is not a substitute for an explicitly requested local Chrome session. A previous relay's inability to browse never proves later desktop browsing failed.

## Hard stops and evidence

- An actual URL-policy or native-tool denial is binding. Stop the rejected action and report the exact target and reason. Do not retry through shell input, a different controller, URL rewriting, a copied browser profile or modified policy. On a future owner-authorized turn, reassess supported entry points without bypassing a target-specific denial.
- If navigation leads to a 404, login, expired authorization or unexpected page, diagnose that specific page. Do not treat old tabs, screenshots or handoff receipts as proof of current access.
- The current chat's native permission checks authorize only the requested task; edit/full-access permission does not expand scope to arbitrary deployment, messages or unrelated websites. No browser-identity extraction, token copying or bypass of normal approvals.
- A browser controller's screenshot/image artifacts may stay in the native session; read_codex_thread exports textual history and can omit tool outputs and images. Retrieve actual artifacts through the owning tool where possible, or report that visual verification is unavailable. Do not claim gameplay, audio, owner experience or full visual QA from successful navigation alone.
- Interactive-QA records, PTI Owner Chrome, audio flags and the standalone bridge's preflight are optional or scoped metadata; do not impose them as mandatory gates to an already authorized official desktop Chrome task.

## Reconciliation with the relay

- get_task tracks the handoff and matching native turn, not arbitrary later app-owned turns. For disagreements, compare exact project/thread/turn IDs, timestamps and native history, with bridge-only and app-native records clearly separated.
- The supported queue retains pending input behind an active desktop writer. A start-observation timeout does not mean the command was dropped; do not submit a second copy with a new key. A stored interrupted export without terminal evidence remains unknown. Follow [relay lifecycle](relay-lifecycle.md) for uncertain delivery and active writers.

## Representative acceptance

An owner-authorized local Chrome check succeeds only when the existing desktop chat actually navigates/interacts through its current connected Chrome tool, the target page is observed, and the requested visible behavior/evidence is returned. A queue receipt, standalone capability flag or code-only patch is insufficient.
