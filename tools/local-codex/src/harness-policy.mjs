export function harnessPolicy(job, configuration, selection) {
  const strategy = job.strategy ?? 'auto';
  if (!['auto', 'single', 'team'].includes(strategy)) throw Error('Choose harness strategy auto, single or team.');
  const limit = configuration.maxSubagentsPerTask ?? 2;
  if (!Number.isInteger(limit) || limit < 0 || limit > 4) throw Error('maxSubagentsPerTask must be an integer between zero and four.');
  const maxSubagents = strategy === 'single' ? 0 : limit;
  if (strategy === 'team' && !maxSubagents) throw Error('Team strategy requires a positive configured subagent limit.');
  const topology = strategy === 'single'
    ? 'Use one agent. Do not spawn subagents.'
    : strategy === 'team'
      ? `Use one coordinating parent with up to ${maxSubagents} subagents for independent evidence or implementation lanes. Give each child a narrow objective, explicit file ownership and output contract. Wait for and synthesize the actual results. If the task has no useful independent lanes, explain that and complete it with one agent.`
      : `Choose the smallest useful topology: use one agent for narrow or serial tasks; use up to ${maxSubagents} subagents only when independent evidence or implementation lanes materially improve the result. Give children explicit ownership and an output contract, then synthesize verified results. Do not create agents just to increase agent count.`;
  return {
    strategy, maxSubagents,
    config: {
      'agents.enabled': maxSubagents > 0,
      'agents.max_concurrent_threads_per_session': Math.max(1, maxSubagents),
      'agents.default_subagent_model': selection.model,
      'agents.default_subagent_reasoning_effort': selection.effort,
    },
    instructions: `The owner has authorized this Local Codex harness to choose single-agent or bounded subagent execution for the current authorized task. ${topology} Every child must use ${selection.model} with reasoning effort ${selection.effort}; pass that pair explicitly when spawning. Do not choose a lower model, lower reasoning effort or custom agent role that overrides this pair. If unavailable or uncertain, stop and ask the owner. Children inherit this task's sandbox and scope; inspect tasks remain read-only throughout. No child may recursively call the Local Codex bridge, grant itself broader authority, or spawn another layer of agents. Coordinate ownership so concurrent children do not edit the same files. State the chosen topology, evidence, changed files, checks and remaining uncertainty in the parent result.`,
  };
}
