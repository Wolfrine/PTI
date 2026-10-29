// Called only by the existing deployment-identity acceptance workflow. Reuses
// its short-lived, already-configured owner session; never prints source data.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { atlasHash, atlasEvidenceSchema, atlasBatchSchema, atlasId } from '../dist/atlas-contract.js';

const parsed = result => {
  assert(!result.isError, 'Atlas deployed call failed.');
  return JSON.parse(result.content.find(part => part.type === 'text').text);
};
export async function verifyAtlasHost(client, db, uid) {
  assert(atlasId.safeParse(uid).success, 'Invalid Atlas acceptance owner.');
  const root = `users/${uid}/atlasData/workspace`;
  const tools = (await client.listTools()).tools.map(tool => tool.name);
  for (const name of ['atlas_context', 'atlas_import_evidence']) assert(tools.includes(name));
  const context = parsed(await client.callTool({ name: 'atlas_context', arguments: { collection: 'sources', limit: 5 } }));
  assert(context.root === root && context.collection === 'sources' && Array.isArray(context.items) && context.items.length <= 5, 'Atlas context must be bounded to the connected owner.');
  const denied = await client.callTool({ name: 'atlas_context', arguments: { uid: 'atlas-not-the-connected-owner', collection: 'evidence' } });
  assert(denied.isError && /outside this connection|Another account/.test(denied.content.find(p => p.type === 'text')?.text || ''), 'Atlas must reject another owner.');
  console.log('PASS: deployed Atlas discovery, bounded context and account boundary.');

  // Test only a generated unused path. An unexpected successful write fails the
  // check and is cleaned up using the same deployment identity in finally.
  const probe = db.doc(`${root}/runs/ci-generic-write-guard-${randomUUID()}`);
  assert(!(await probe.get()).exists);
  try {
    const result = await client.callTool({ name: 'firestore_create_document', arguments: { path: probe.path, data: { syntheticDeploymentProbe: true } } });
    assert(result.isError && /specialized tools|generic writes are disabled/.test(result.content.find(p => p.type === 'text')?.text || ''), 'Generic writes must not bypass Atlas.');
    assert(!(await probe.get()).exists);
  } finally { if ((await probe.get()).exists) await probe.delete(); }
  console.log('PASS: deployed generic connector cannot write Atlas. No probe record retained.');

  // Replay an existing added-only receipt. Verify the reconstructed hash BEFORE
  // calling the importer, so this acceptance check cannot stage new owner work.
  const runs = parsed(await client.callTool({ name: 'atlas_context', arguments: { collection: 'runs', limit: 50 } }));
  assert(runs.root === root && runs.collection === 'runs' && Array.isArray(runs.items) && runs.items.length <= 50, 'Invalid bounded Atlas receipt context.');
  const run = runs.items.find(r => r.inputCount > 0 && r.inputCount <= 20 && r.addedIds?.length === r.inputCount && r.duplicateIds?.length === 0 && r.conflictEventIds?.length === 0 && Array.isArray(r.sourceIds));
  assert(run, 'No replayable baseline receipt is available; seed and verify it before Atlas activation.');
  assert(atlasId.safeParse(run.runId).success && run.id === run.runId, 'Replay receipt document and run identities must match.');
  assert(Array.isArray(run.addedIds) && new Set(run.addedIds).size === run.inputCount && run.addedIds.every(id => typeof id === 'string' && /^ev_[a-f0-9]{64}$/.test(id)), 'Invalid replay evidence identities.');
  assert(run.sourceIds.length > 0 && run.sourceIds.length <= 20 && new Set(run.sourceIds).size === run.sourceIds.length && run.sourceIds.every(id => atlasId.safeParse(id).success), 'Invalid replay source identities.');
  const receiptRef = db.doc(`${root}/runs/${run.runId}`), before = await receiptRef.get();
  assert(before.exists && before.updateTime, 'Replay requires an existing immutable receipt; no new run may be created by acceptance.');
  const storedReceipt = before.data(), { id: _contextId, ...listedReceipt } = run;
  assert(atlasHash(storedReceipt) === atlasHash(listedReceipt), 'Replay receipt changed since context was read.');
  const records = [], originalEvidence = [];
  for (const id of run.addedIds) {
    const ref = db.doc(`${root}/evidence/${id}`), snapshot = await ref.get();
    assert(snapshot.exists && snapshot.updateTime, 'Replay evidence must already exist.');
    const evidence = atlasEvidenceSchema.safeParse(snapshot.data());
    assert(evidence.success && evidence.data.id === id, 'Replay evidence failed immutable identity validation.');
    records.push(evidence.data.record); originalEvidence.push({ ref, snapshot });
  }
  const validated = atlasBatchSchema.safeParse({ schemaVersion: 1, sourceScope: run.sourceScope, records });
  assert(validated.success, 'Replay batch must satisfy the deployed source contract.');
  const batch = validated.data;
  assert(atlasHash({ batch, sourceIds: [...run.sourceIds].sort() }) === run.inputHash, 'Replay must match the original captured input exactly.');
  const stillPresent = await receiptRef.get();
  assert(stillPresent.exists && stillPresent.updateTime && before.updateTime.isEqual(stillPresent.updateTime), 'Replay receipt changed before the call; acceptance will not submit a new run.');
  const replay = parsed(await client.callTool({ name: 'atlas_import_evidence', arguments: { runId: run.runId, sourceIds: run.sourceIds, batch } }));
  const { replayed, ...returnedReceipt } = replay;
  assert(replayed === true && atlasHash(returnedReceipt) === atlasHash(storedReceipt), 'Idempotent replay must return exactly the original receipt.');
  const after = await receiptRef.get();
  assert(after.exists && after.updateTime && before.updateTime.isEqual(after.updateTime), 'Idempotent replay must not rewrite the receipt.');
  for (const original of originalEvidence) {
    const current = await original.ref.get();
    assert(current.exists && current.updateTime && original.snapshot.updateTime.isEqual(current.updateTime), 'Idempotent replay must not rewrite referenced evidence.');
  }
  console.log(`PASS: deployed Atlas exact replay returned the original receipt; its ${records.length} referenced evidence records are unchanged.`);
}
