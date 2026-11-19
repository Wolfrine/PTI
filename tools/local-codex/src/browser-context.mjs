// Availability is established by official tool discovery in the current native
// turn, never by environment identities, extension health or another session.
export function browserContextPreflight() {
  return {executionContext:'standalone-app-server',status:'unverified',reason:'official-tool-discovery-required',verified:false};
}
export const browserContextReport = browserContextPreflight;
export function browserContextInstructions() {
  return 'Discover optional official browser and Computer Use tools within this native turn when the task requires them. Use their normal entry point and permission checks if available. If unavailable or denied, stop that browser step, report the exact unverified gate and continue independently possible work. Do not automatically hand work to another chat, impersonate an app session, copy browser identities or pipes, bypass URL policy, extract credentials, or substitute raw Playwright/CDP. Full Access and installed software do not prove browser control.';
}
