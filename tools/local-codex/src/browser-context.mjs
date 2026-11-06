const recovery = 'Open a chat in the ChatGPT desktop app on this PC and invoke @Chrome. From mobile, use Codex (Remote in older apps) connected to this same desktop host, with Computer Use enabled and its Chrome extension installed. Keep the Windows session awake and unlocked.';

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

export function browserContextInstructions(context) {
  const access = context.status === 'unavailable'
    ? 'App-owned browser authorization context is missing or incomplete. Official browser/Computer Use access is unavailable in this worker. Do not initialize browser tools, probe the browser host or retry "host unavailable" here.'
    : 'App-session prerequisites are present but browser access is unverified. Their presence does not prove an authorized live host. Only an available official browser tool can verify access through its normal entry point; if it reports host unavailable or a policy denial, stop that browser step without retrying.';
  return `Browser context preflight: this task runs in an independent Local Codex bridge app-server --stdio, not a desktop-owned session. ${access} Full Access, installed Chrome, a healthy extension and a connected Firestore relay do not establish browser control. Continue independently possible coding, CLI and non-browser work. If required browser control or rendered browser verification is unavailable, state the specific unavailable step and this recovery path immediately; do not claim browser or visual acceptance. ${context.recovery} This bridge has no automatic app-owned session routing. Do not copy, forge, recover or inject browser identities/pipes, bypass Windows URL policy, extract credentials, or substitute raw Playwright/CDP. A native URL-policy failure remains a separate upstream limitation, not evidence of a broken Chrome extension.`;
}
