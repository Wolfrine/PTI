# Chrome controller routing

The owner requested a correction after repeated Windows Computer Use URL-confidence stops and manual-navigation handoffs. Scope is the existing Local Codex delegation skill and operating guidance.

## Observed evidence

Desktop chat `01a1b991-dfc9-7550-9c6d-bb334fb9201c` on Windows, app 26.1027.3384.0, observed two turn-ending native-input failures around Chrome's Extensions page. Entering `chrome://extensions` and later sending Ctrl+T from that page both triggered the URL-confidence stop. Reading the accessibility tree worked. The internal policy implementation and exact cause remain unknown.

The same chat had already opened and captured example.com through the official Chrome extension. On a later authorized turn, with Chrome still displaying Extensions, its supported browser API opened `https://taleweald.firebaseapp.com/play/` successfully and read the rendered Firebase 404. Navigating to the site's root reached `/ops/` and exposed the Google sign-in control. These are real browser observations. They establish the supported navigation route and a stale play URL. They do not establish gameplay or the independent PTI provider's control.

Chrome exposed PTI Owner Chrome 0.1.1, ID `njjcfpeiadgkanlcmifkjcifihccfigo`, as enabled after the owner's installation. The bridge worker was online at 0.4.9 and the independent native connection file was present. Its task-specific grant and actual input/capture remain separate acceptance gates.

## Decision

Prefer the connected official browser/tab API for browser navigation in a desktop chat. Use PTI's task-scoped Chrome tools in standalone jobs. Preserve the exact local browser choice and each provider's own authorization. Replace repetitive manual-navigation instructions with autonomous execution through the supported authorized entry point.

Honor explicit policy denials and turn-ending stops. A stopped action cannot be retried through another tool or transport. Later authorized work must reassess target and capabilities through normal permission checks. Required owner consent and authentication remain explicit.

This guidance change addresses the observed controller-selection failure. It does not modify OpenAI's URL-verification implementation. No synthetic tests or fixtures were created or run. Existing Local Codex test consumers were inspected and retained as pipeline safeguards. The actual failed path and the previously successful path were compared using this chat's observations. Independent review was not performed for this small instruction change.

Expected benefit is fewer native Chrome failures and avoidable handoffs. The regression risk is overgeneralizing a successful desktop route to a standalone worker or bypassing a genuine denial. The skill explicitly distinguishes both. Retain the correction while the supported browser route remains available. Revise it if official capabilities change or practical observations contradict it.
