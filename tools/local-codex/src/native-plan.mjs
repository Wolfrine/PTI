import {z} from 'zod';

export const collaborationModeSchema = z.enum(['plan', 'default']);
export const approvedGoalSchema = z.object({
  plan_turn_id: z.string().uuid(),
  plan_item_id: z.string().min(1).max(256),
  objective: z.string().trim().min(1).max(4000),
  token_budget: z.number().int().positive().optional(),
}).strict();

export function collaborationMode(mode, {model, effort}) {
  return {mode, settings: {model, reasoning_effort: effort, developer_instructions: null}};
}

export async function supportsNativePlan(rpc) {
  const {data} = await rpc('collaborationMode/list', {});
  return ['plan', 'default'].every(mode => data?.some(preset => preset.mode === mode));
}

export function proposedPlan(threadId, turnId, item) {
  if (item?.type !== 'plan' || typeof item.text !== 'string' || !item.text.trim() || !item.id) return null;
  return {thread_id: threadId, turn_id: turnId, item_id: item.id, text: item.text};
}

export async function verifyApprovedPlan(rpc, threadId, approval) {
  const {data} = await rpc('thread/turns/list', {threadId, limit: 1, sortDirection: 'desc', itemsView: 'full'});
  const turn = data?.[0];
  const item = turn?.items?.findLast(value => value.type === 'plan');
  if (turn?.status !== 'completed' || turn.id !== approval.plan_turn_id || item?.id !== approval.plan_item_id) {
    throw Error('The approved plan is no longer the latest completed native turn. Review the current plan before execution.');
  }
}
