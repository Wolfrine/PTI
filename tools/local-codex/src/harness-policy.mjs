export function harnessPolicy(_job, _configuration, selection) {
  return {
    config: {
      'agents.enabled': true,
      'agents.default_subagent_model': selection.model,
      'agents.default_subagent_reasoning_effort': selection.effort,
    },
    instructions: `Use native Codex planning, subagents and Git when useful. Native subagents inherit this task's scope and sandbox; choose ${selection.model} with reasoning effort ${selection.effort} for delegated work. Give independent lanes explicit ownership and check returned evidence. The bridge imposes no agent count, nesting, duration, checkout, thread, module or scheduling limits. Native runtime and account limits remain authoritative.`,
  };
}
