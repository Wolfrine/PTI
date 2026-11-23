// Availability is established by official tool discovery in the current native
// turn, never by environment identities, extension health or another session.
export function browserContextPreflight() {
  return {executionContext:'standalone-app-server',status:'unverified',reason:'official-tool-discovery-required',verified:false};
}
export const browserContextReport = browserContextPreflight;
export function browserContextInstructions() {
  return 'Discover optional official browser and Computer Use tools within this native turn when the task requires them. Use their normal entry point and permission checks if available. A site or action denial ends that action. If this turn lacks a browser host, report the missing capability and continue independent work. The owner permits an explicitly requested browser-only handoff to a designated desktop executor under its normal site permissions. The optional independent PTI Owner Chrome tab-sharing tools can return a human-reviewed observation when configured, without transferring the native conversation. For explicit Local Codex browser requests, discover pti_owner_tab.request_page and read_result. Keep the general task in its thread and return only observed results. Never impersonate an app session, copy browser identities or pipes, bypass URL policy, extract credentials, or substitute raw Playwright/CDP. Full Access and installed software do not prove browser control.';
}
