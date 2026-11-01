export function harnessPolicy(job, configuration, selection) {
  const strategy = job.strategy ?? 'auto';
  if (!['auto', 'single', 'team'].includes(strategy)) throw Error('Choose harness strategy auto, single or team.');
  const limit = configuration.maxSubagentsPerTask ?? null;
  if (limit!==null&&(!Number.isSafeInteger(limit) || limit < 0)) throw Error('maxSubagentsPerTask must be null (no bridge limit) or a nonnegative integer.');
  const maxSubagents = strategy === 'single' ? 0 : limit;
  if (strategy === 'team' && maxSubagents===0) throw Error('Team strategy conflicts with the owner-configured prohibition on subagents.');
  const delegation = maxSubagents===null?'native subagents as useful, without a bridge-imposed count or nesting limit':`up to ${maxSubagents} native subagents, as explicitly configured by the owner`;
  const topology = strategy === 'single'
    ? 'Use one agent. Do not spawn subagents.'
    : strategy === 'team'
      ? `Use one coordinating parent with ${delegation} for independent evidence or implementation lanes. Give each child a narrow objective, explicit file ownership and output contract. Wait for and synthesize the actual results. If the task has no useful independent lanes, explain that and complete it with one agent.`
      : `Choose the useful topology for the task: one agent for narrow or serial work, or ${delegation} for independent evidence or implementation lanes. Give children explicit ownership and an output contract, then synthesize verified results. Agent count is not an outcome.`;
  return {
    strategy, maxSubagents,
    config: {
      'agents.enabled': maxSubagents !== 0,
      ...(maxSubagents!==null&&maxSubagents>0?{'agents.max_concurrent_threads_per_session':maxSubagents}:{}),
      'agents.default_subagent_model': selection.model,
      'agents.default_subagent_reasoning_effort': selection.effort,
    },
    instructions: `The owner has authorized this Local Codex harness to choose single-agent or native subagent execution for the current authorized task. ${topology} All earlier bridge-imposed count, execution-duration and nesting ceilings are withdrawn; only a current explicitly owner-selected limit applies. Every child and descendant must use ${selection.model} with reasoning effort ${selection.effort}; pass that pair explicitly when spawning. Do not choose a lower model, lower reasoning effort or custom agent role that overrides this pair. If unavailable or uncertain, stop and ask the owner. Children inherit this task's sandbox and scope; inspect tasks remain read-only throughout. No child may recursively call the Local Codex bridge or grant itself broader authority. Native Codex/account constraints are platform constraints; do not invent replacement caps or claim unlimited native capacity. Ask the owner before introducing any new harness restriction. Coordinate ownership so concurrent agents do not edit the same files. State the chosen topology, evidence, changed files, checks and remaining uncertainty in the parent result.`,
  };
}
