import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelSelection, requireModel, verifyModel} from '../src/model-policy.mjs';
const selection = {model: 'gpt-6.1-sol', effort: 'xhigh'};
const model = {model: selection.model, supportedReasoningEfforts: [{reasoningEffort: 'xhigh'}]};
test('owner preference defaults explicitly to Sol 6.1 / xhigh and validates configured alternatives', () => {
  assert.deepEqual(modelSelection(), selection);
  assert.deepEqual(modelSelection({model: 'owner-selected-model', reasoningEffort: 'high'}), {model: 'owner-selected-model', effort: 'high'});
  assert.throws(() => modelSelection({reasoningEffort: 'extra-high'}), /Ask the owner/);
});
test('catalog pagination checks exact model and advertised effort without choosing a lower default', async () => {
  const cursors = [];
  await requireModel(async (_method, args) => {cursors.push(args.cursor); return args.cursor ? {data: [model], nextCursor: null} : {data: [{model: 'lower-default'}], nextCursor: 'next'};}, selection);
  assert.deepEqual(cursors, [null, 'next']);
});
test('missing model, unsupported effort, and catalog failures ask owner with no fallback', async () => {
  for (const rpc of [async () => ({data: [], nextCursor: null}), async () => ({data: [{...model, supportedReasoningEfforts: [{reasoningEffort: 'medium'}]}]}), async () => ({data: [{...model, upgrade: 'newer-model'}]}), async () => {throw Error('offline');}]) {
    await assert.rejects(requireModel(rpc, selection), /Ask the owner.*no fallback/);
  }
});
test('runtime substitution or missing confirmation is refused before inference', () => {
  verifyModel({model: selection.model, reasoningEffort: 'xhigh'}, selection);
  for (const actual of [{model: 'lower-model', reasoningEffort: 'xhigh'}, {model: selection.model, reasoningEffort: 'medium'}, {model: selection.model}]) assert.throws(() => verifyModel(actual, selection), /no fallback/);
});
