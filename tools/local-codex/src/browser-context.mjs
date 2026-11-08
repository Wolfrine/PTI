const recovery = 'Continue the existing project/module chat in the ChatGPT desktop app on this PC and use @Chrome. Where the current app provides an authorized continuation tool, use it after the bridge run releases its writer; do not ask the owner to perform routine navigation. From mobile, use Codex (Remote in older apps) connected to this same desktop host, with Computer Use enabled and its Chrome extension installed. Keep the Windows session awake and unlocked.';

// Presence only: never retain, return, discover or connect to a pipe/identity.
// A standalone app-server is not an app-owned browser session. Even inherited
// prerequisites cannot establish that an authorized browser host is usable.
export function browserContextPreflight(env = process.env) {
  const present = name => typeof env[name] === 'string' && env[name].trim().length > 0;
  const pipe = present('BROWSER_USE_ACCESS_PIPE_PATH');
  const identity = present('BROWSER_USE_ACCESS_VERIFYING_IDENTITY');
  return {
    executionContext: 'standalone-app-server',
    status: pipe && identity ? 'unverified' : 'unavailable',
    reason: pipe && identity ? 'app-session-context-unverified' : pipe || identity ? 'incomplete-app-session-context' : 'missing-app-session-context',
    verified: false,
    recovery,
    documentation: ['https://learn.chatgpt.com/docs/browser', 'https://learn.chatgpt.com/docs/remote-connections'],
  };
}

// Fixed wire contract. Never send the child environment or a caller-supplied grant.
export function browserContextReport(env = process.env) {
  const {executionContext,status,reason,verified}=browserContextPreflight(env);
  return {executionContext,status,reason,verified};
}

export function browserContextInstructions(context) {
  const scope = 'Invocation scope: the following preflight describes only the current standalone bridge run. If this same native chat is later continued through the official desktop app, these standalone-only availability restrictions do not apply to that desktop invocation. Re-evaluate the actual official tools through their normal permission checks in that app-owned invocation; never transfer or fabricate its authorization. Retained preflight history is not a permanent restriction on a chat.';
  const access = context.status === 'unavailable'
    ? 'App-session environment metadata is missing or incomplete. This presence-only diagnostic is not a permission decision and must not prohibit an available official browser/Computer Use tool. If an official tool is available in the current invocation, use its normal entry point to determine actual access; if no such tool is available, continue through the existing app-owned chat when authorized.'
    : 'App-session prerequisites are present but browser access is unverified. Their presence does not prove an authorized live host. Only an available official browser tool can verify access through its normal entry point; if it reports host unavailable or a policy denial, stop that browser step without retrying.';
  return `${scope} Browser context preflight: this invocation was launched by the Local Codex bridge app-server --stdio. ${access} Full Access, installed Chrome, a healthy extension and a connected Firestore relay do not establish browser control. Only an available official browser tool can verify actual access through its normal permission checks; on an actual host-unavailable or policy-denial response, stop that browser step without retrying. Continue independently possible coding, CLI and non-browser work. If required browser control or rendered browser verification is unavailable, state the specific unavailable step and this recovery path immediately; do not claim browser or visual acceptance. ${context.recovery} This bridge has no automatic app-owned session routing. Do not copy, forge, recover or inject browser identities/pipes, bypass Windows URL policy, extract credentials, or substitute raw Playwright/CDP. A native URL-policy failure remains a separate upstream limitation, not evidence of a broken Chrome extension.`;
}
