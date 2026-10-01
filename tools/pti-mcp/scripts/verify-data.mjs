import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../dist/index.js';
const user = await getAuth().getUserByEmail('schttewary@gmail.com');
assert(!user.disabled && user.emailVerified, 'The approved PTI owner must be active and verified.');
const server = createMcpServer({ uid: user.uid, actor: 'PTI MCP connection verification', taskReference: process.env.GITHUB_SHA });
const client = new Client({ name: 'pti-acceptance', version: '1' });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(a), client.connect(b)]);
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  assert(!result.isError, `${name} failed`);
  const text = result.content.find(x => x.type === 'text').text;
  try { return JSON.parse(text); } catch { return text; }
};
const path = `users/${user.uid}/mcpConnectionChecks/${randomUUID()}`;
let created = false;
try {
  const catalog = await call('pti_apps_list', {});
  assert.equal(catalog.apps.length, 8);
  for (const collection of ['domains', 'luminaryData/observations/items', 'personalData/workspace/feedback', 'sefpoData/workspace/units', 'ventureData/workspace/discoveries', 'foodData/workspace/orders', 'trackerData/workspace/events']) {
    await call('firestore_query', { collectionPath: `users/${user.uid}/${collection}`, limit: 1 });
  }
  const first = await call('firestore_create_document', { path, data: { connectionCheck: true, stage: 'created' } });
  created = true;
  await call('firestore_update_document', { path, expectedUpdateToken: first.updateToken, data: { stage: 'updated' } });
  const read = await call('firestore_get_document', { path });
  assert.equal(read.stage, 'updated');
  await call('firestore_delete_document', { path, expectedUpdateToken: read.updateToken, confirmation: `DELETE ${path}` });
  created = false;
  assert.equal(await call('firestore_get_document', { path }), null);
  const food = await call('food_context', {});
  assert(food.profile.orderCount >= 93);
  assert(Array.isArray(food.taste.observations));
  const meal = await call('food_plan',{craving:'Comforting, but not too rich',mood:'Comfort'});
  assert(meal.plans.length>0);
  assert(meal.plans.every(p=>p.items.every(i=>i.restaurantId===p.restaurantId)));
  const toolNames=(await client.listTools()).tools.map(t=>t.name);
  for(const name of ['food_plan','food_record_learning','food_publish_research'])assert(toolNames.includes(name));
  const receipt = food.recentOrders[0];
  const dedupe = await call('food_ingest_email', {gmailMessageId:receipt.source.gmailMessageId,from:'noreply@zomato.com',subject:receipt.source.subject,receivedAt:receipt.receivedAt,text:`ORDER ID: ${receipt.orderId}\nDelivered\n${receipt.restaurantName}\n${receipt.items.map(i=>`${i.quantity} X ${i.name}`).join('\n')}\nTotal paid - ₹${receipt.total}`});
  assert.equal(dedupe.duplicate,true);
  console.log('PASS: eight-app discovery, seven real app collection reads, shared meal model, food tool discovery and duplicate receipt rejection, owner-scoped create/update/read/delete and deletion verification. No private records printed.');
} finally {
  if (created) {
    const remaining = await call('firestore_get_document', { path });
    if (remaining) await call('firestore_delete_document', { path, expectedUpdateToken: remaining.updateToken, confirmation: `DELETE ${path}` });
  }
  await client.close(); await server.close();
}
