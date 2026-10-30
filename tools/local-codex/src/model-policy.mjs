export const DEFAULT_MODEL = 'gpt-6.1-sol';
export const DEFAULT_EFFORT = 'xhigh';
const efforts = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const choiceRequired = detail => Error(`${detail} Ask the owner which model and reasoning effort to use; no fallback was started.`);

export function modelSelection(configuration = {}) {
  const model = configuration.model ?? DEFAULT_MODEL;
  const effort = configuration.reasoningEffort ?? DEFAULT_EFFORT;
  if (typeof model !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(model) || !efforts.has(effort)) {
    throw choiceRequired('The configured model or reasoning effort is invalid.');
  }
  return {model, effort};
}

export async function requireModel(rpc, selection) {
  let cursor = null;
  const seen = new Set();
  for (let page = 0; page < 20; page++) {
    let result;
    try { result = await rpc('model/list', {limit: 100, includeHidden: false, cursor}); }
    catch { throw choiceRequired('The signed-in Codex model catalog could not be verified.'); }
    const model = result.data?.find(item => item.model === selection.model);
    if (model) {
      if (model.upgrade && model.upgrade !== selection.model) {
        throw choiceRequired(`The catalog recommends upgrading ${selection.model}; confirm the desired model and intelligence level.`);
      }
      if (!model.supportedReasoningEfforts?.some(item => item.reasoningEffort === selection.effort)) {
        throw choiceRequired(`${selection.model} does not advertise reasoning effort ${selection.effort}.`);
      }
      return;
    }
    cursor = result.nextCursor;
    if (!cursor || seen.has(cursor)) break;
    seen.add(cursor);
  }
  throw choiceRequired(`${selection.model} is not available in the signed-in Codex catalog.`);
}

export function verifyModel(started, selection) {
  if (started.model !== selection.model || started.reasoningEffort !== selection.effort) {
    throw choiceRequired(`Codex returned ${started.model || 'an unknown model'} / ${started.reasoningEffort || 'an unknown effort'} instead of ${selection.model} / ${selection.effort}.`);
  }
}
