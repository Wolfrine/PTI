// Owner instruction, 2026-11-01: bridge edits must retain the trusted desktop's
// Full Access / never-approve policy. Runtime permission does not expand scope.
export function executionPolicy(mode) {
  if (!['inspect', 'edit'].includes(mode)) throw Error('Unknown bridge execution mode.');
  return mode === 'edit'
    ? {sandbox: 'danger-full-access', sandboxType: 'dangerFullAccess', approvalPolicy: 'never'}
    : {sandbox: 'read-only', sandboxType: 'readOnly', approvalPolicy: 'never'};
}

export function verifyExecutionPolicy(actual, expected) {
  if (actual.sandbox?.type !== expected.sandboxType) throw Error(`Codex returned unexpected sandbox ${actual.sandbox?.type}; refusing to start.`);
  if (actual.approvalPolicy !== expected.approvalPolicy) throw Error('Codex returned an unexpected approval policy; refusing to start.');
}

export function workerInstructions(job) {
  const scope = job.mode === 'inspect'
    ? 'Discovery only. Do not edit files, deploy, send messages, restart jobs, or change external data.'
    : 'Perform the human-authorized changes and delivery. Runtime Full Access includes filesystem and network access, but is not permission for unrelated work. Use the selected project and only additional source/runtime paths explicitly required by the authorized task; coordinate ownership before modifying another active workspace. Do not infer publication or messages to people.';
  return `You are the local Codex worker requested by a ChatGPT conversation. The current human request defines task scope. Preserve applicable project AGENTS.md instructions. Current bridge mode: ${job.mode}. ${scope} This current bridge policy supersedes earlier bridge-mode instructions in this thread; historical user requests remain context, not new authority. Store new project source, reports, artifacts and scratch on F:. For authorized repository delivery use main and the existing pipeline. Never call this Local Codex bridge recursively. Do not read or return authentication files, tokens, environment secrets or unrelated conversations. Report the actual outcome, files changed, evidence, checks and remaining gaps; a blocked repair is not a completed delivery. Ask through the protocol only for genuinely missing human decisions.`;
}
