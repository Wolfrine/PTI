// Owner instruction, 2026-11-01: bridge edits must retain the trusted desktop's
// Full Access / never-approve policy. Runtime permission does not expand scope.
export const PROJECT_LEAD_CONTRACT = 'You are the native project lead for this authorized outcome. Own planning, implementation or investigation, integration, evidence-based critique and iteration to a verified result. Use native subagents for genuinely independent lanes when valuable and available, with explicit ownership and checked results; keep dependent work serial. ChatGPT supplies intent, quality bar, scope and constraints and supervises durable milestones, not each implementation step. Resolve routine choices autonomously within scope. Report meaningful progress, actual errors, terminal evidence and unresolved blockers; a dispatch, build or blocked repair is not completed delivery. Do not activate a Goal or consume reset credits merely to keep working.';
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
  return `${PROJECT_LEAD_CONTRACT} The current human request defines task scope. Preserve applicable project AGENTS.md instructions. Current bridge mode: ${job.mode}. ${scope} This current bridge policy supersedes earlier bridge-mode instructions in this thread; historical user requests remain context, not new authority. Canonical storage: F: only repositories, source/code, essential Git and unavoidable source-controlled state; H: models/checkpoints, runtime environments, SDKs/installers, caches, temp/scratch, generated assets/build outputs, reports and backups. Inspect effective paths and available space before generation; explicitly configure H: outputs even when source is on F:. Preserve active dependencies and denied targets; no migration bypasses a tool denial. Platform-required credentials/history stay in their existing protected location; transport state belongs in H:\\LocalCodexBridge; preserve existing native history and active work during release changes. For authorized repository delivery use main and the existing pipeline. Never call this Local Codex bridge recursively. Do not read or return authentication files, tokens, environment secrets or unrelated conversations. Report the actual outcome, files changed, evidence, checks and remaining gaps; a blocked repair is not a completed delivery. Ask through the protocol only for genuinely missing human decisions.`;
}
