import assert from 'node:assert/strict';

// Read-only live acceptance. Synthetic cross-account arguments must be rejected
// before any writes. Never submit synthetic purchases to the real owner workspace.
export async function verifyBlinkitHost(client) {
  const names = (await client.listTools()).tools.map(t => t.name);
  for (const name of ['food_blinkit_context', 'food_blinkit_ingest', 'food_blinkit_sync','food_blinkit_events']) assert(names.includes(name), `${name} is not deployed`);
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert(!result.isError, `${name} failed`);
    return JSON.parse(result.content.find(c => c.type === 'text').text);
  };
  const data = await call('food_blinkit_context', { limit: 1 });
  assert.equal(typeof data.ingestionPaused, 'boolean');
  assert(Array.isArray(data.purchases) && Array.isArray(data.products));
  assert.equal(typeof data.window.complete, 'boolean');
  assert(data.namespace.endsWith('/foodData/workspace'));
  const queue=await call('food_blinkit_events',{action:'context',limit:1});assert.equal(typeof queue.ingestionPaused,'boolean');assert(Array.isArray(queue.events));
  const catalog = await call('pti_app_context', { appId: 'food' });
  // Discovery wrapper shape is checked by verify-data; the tool names must be visible here too.
  const catalogText = JSON.stringify(catalog);
  for (const name of ['purchases', 'purchaseSyncRuns', 'purchaseSyncState', 'food_blinkit_sync']) assert(catalogText.includes(name));
  const foreign = 'synthetic-blinkit-other-owner';
  for (const [name, args] of [
    ['food_blinkit_context', { uid: foreign }],
    ['food_blinkit_sync', { uid: foreign, action: 'start', runId: 'synthetic-denied-run' }],
    ['food_blinkit_ingest', { uid: foreign, capturedAt: '2026-01-01T00:00:00Z', detail: {
      order: 'synthetic-denied-row', phase: { kind: 'finished', status: 'delivered' },
      contents: { kind: 'read', reference: 'SYNTHETIC-DENIED', items: [{ name: 'Lemon', quantityText: '100 g x 1', amount: 10 }], bill: { billTotal: 10, lines: [] } },
    } }],
  ]) assert((await client.callTool({ name, arguments: args })).isError, `${name} accepted another account`);
  console.log('PASS: deployed Blinkit tool registration, canonical discovery, owner-scoped purchase context and cross-account denials. No purchase or run created.');
}
