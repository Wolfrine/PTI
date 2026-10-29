// Offline regression tests for the hosted acceptance helper. All records,
// owners, clients and document snapshots below are synthetic and in memory.
// No Firebase SDK, credentials, environment variables or network are used.
// From the repository root, after the MCP build:
//   node --test tools/pti-mcp/scripts/verify-atlas-host.selftest.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { atlasHash, stageAtlasRecords } from '../dist/atlas-contract.js';
import { verifyAtlasHost } from './verify-atlas-host.mjs';

const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const denied = message => ({ isError: true, content: [{ type: 'text', text: message }] });

function fixture(options = {}) {
  const uid = 'synthetic-acceptance-owner';
  const root = `users/${uid}/atlasData/workspace`;
  const records = [1, 2].map(index => ({
    sourceSystem: 'github',
    sourceLocator: `https://github.com/example/atlas-test/blob/main/file-${index}.md`,
    sourceRecordId: `file-${index}.md`,
    sourceRevision: `synthetic-revision-${index}`,
    occurredAt: null,
    sourceUpdatedAt: `2001-01-01T00:00:00.00000000${index}Z`,
    capturedAt: '2001-01-02T00:00:00.440150Z',
    claim: `Synthetic acceptance fixture ${index}; no real user evidence.`,
    originalStatus: null,
    evidenceKind: 'primary_artifact',
    subjectIds: ['synthetic-subject'],
    projectId: 'synthetic-project',
    contribution: null,
    limitations: ['In-memory test fixture only.'],
    reviewStatus: 'pending',
  }));
  const batch = {
    schemaVersion: 1,
    sourceScope: {
      system: 'github',
      locator: 'https://github.com/example/atlas-test/',
      completeness: 'partial',
      limitation: 'Two synthetic records only.',
    },
    records,
  };
  // Intentionally unsorted: replay hashing must preserve the original contract.
  const sourceIds = ['synthetic-source-z', 'synthetic-source-a'];
  const evidence = stageAtlasRecords(records, [], []).added;
  const receipt = {
    schemaVersion: 1,
    runId: 'synthetic-baseline-run',
    inputHash: options.badHash ? '0'.repeat(64) : atlasHash({ batch, sourceIds: [...sourceIds].sort() }),
    capturedAt: '2001-01-02T00:00:01.000Z',
    taskReference: null,
    sourceIds,
    sourceScope: batch.sourceScope,
    inputCount: records.length,
    addedIds: evidence.map(entry => entry.id),
    duplicateIds: [],
    conflictEventIds: [],
    unresolvedConflictCount: 0,
    status: 'staged',
  };
  const receiptPath = `${root}/runs/${receipt.runId}`;
  const evidencePaths = evidence.map(entry => `${root}/evidence/${entry.id}`);
  const documents = new Map([
    [receiptPath, { value: structuredClone(receipt), version: 1 }],
    ...evidence.map((entry, index) => [evidencePaths[index], { value: structuredClone(entry), version: 1 }]),
  ]);
  if (options.missingReceipt) documents.delete(receiptPath);
  if (options.missingEvidence) documents.delete(evidencePaths[0]);
  const calls = [], writes = [], deletions = [], reads = new Map();
  const snapshot = path => {
    const entry = documents.get(path);
    const value = entry ? structuredClone(entry.value) : undefined;
    const version = entry?.version;
    return {
      exists: !!entry,
      data: () => structuredClone(value),
      updateTime: entry ? { version, isEqual: other => other?.version === version } : undefined,
    };
  };
  const db = {
    doc(path) {
      assert(path.startsWith(`${root}/`), 'Test helper may access only the synthetic owner.');
      return {
        path,
        async get() {
          const count = (reads.get(path) || 0) + 1;
          reads.set(path, count);
          if (options.removeReceiptBeforeImport && path === receiptPath && count === 2) documents.delete(path);
          return snapshot(path);
        },
        async delete() {
          assert(path.startsWith(`${root}/runs/ci-generic-write-guard-`), 'Only the generated synthetic probe may be cleaned up.');
          deletions.push(path);
          documents.delete(path);
        },
      };
    },
  };
  const client = {
    async listTools() {
      return { tools: [{ name: 'atlas_context' }, { name: 'atlas_import_evidence' }] };
    },
    async callTool(call) {
      calls.push(structuredClone(call));
      const args = call.arguments;
      if (call.name === 'atlas_context') {
        if (args.uid && args.uid !== uid) return denied('Another account is outside this connection.');
        if (args.collection === 'sources') return result({ root, collection: 'sources', items: [] });
        assert.equal(args.collection, 'runs');
        const id = options.wrongRunIdentity ? 'synthetic-wrong-run' : receipt.runId;
        return result({ root, collection: 'runs', items: [{ ...receipt, id }] });
      }
      if (call.name === 'firestore_create_document') {
        assert(args.path.startsWith(`${root}/runs/ci-generic-write-guard-`));
        assert.deepEqual(args.data, { syntheticDeploymentProbe: true });
        if (!options.allowGenericWrite) return denied('Atlas generic writes are disabled; use specialized tools.');
        assert(!documents.has(args.path));
        documents.set(args.path, { value: structuredClone(args.data), version: 1 });
        writes.push(args.path);
        return result({ created: true });
      }
      assert.equal(call.name, 'atlas_import_evidence');
      assert.equal(args.runId, receipt.runId);
      assert.deepEqual(args.sourceIds, sourceIds);
      assert.deepEqual(args.batch, batch);
      assert(documents.has(receiptPath), 'Synthetic importer must never create a new run.');
      if (options.rewriteEvidence) {
        documents.get(evidencePaths[0]).version += 1;
        writes.push(evidencePaths[0]);
      }
      return result({ ...receipt, ...(options.changedReplayReceipt ? { status: 'changed-synthetic-status' } : {}), replayed: true });
    },
  };
  const savedState = () => structuredClone([...documents.entries()]);
  const initialState = savedState();
  const importCalls = () => calls.filter(call => call.name === 'atlas_import_evidence');
  return { uid, root, db, client, documents, calls, writes, deletions, importCalls, savedState, initialState, receiptPath, evidencePaths };
}

async function verify(t, f) {
  // Suppress the helper's deployment PASS lines; node:test owns test reporting.
  t.mock.method(console, 'log', () => {});
  await verifyAtlasHost(f.client, f.db, f.uid);
}

test('exact replay preserves microsecond and nanosecond provenance without writes', async t => {
  const f = fixture();
  await verify(t, f);
  assert.equal(f.importCalls().length, 1);
  const replayed = f.importCalls()[0].arguments.batch.records;
  assert.equal(replayed[0].capturedAt, '2001-01-02T00:00:00.440150Z');
  assert.equal(replayed[0].sourceUpdatedAt, '2001-01-01T00:00:00.000000001Z');
  assert.equal(replayed[1].sourceUpdatedAt, '2001-01-01T00:00:00.000000002Z');
  assert.deepEqual(f.savedState(), f.initialState);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.deletions, []);
});

test('missing stored receipt fails before importing', async t => {
  const f = fixture({ missingReceipt: true });
  await assert.rejects(verify(t, f), /existing immutable receipt/);
  assert.equal(f.importCalls().length, 0);
  assert.deepEqual(f.savedState(), f.initialState);
});

test('mismatched context document and run identities fail before importing', async t => {
  const f = fixture({ wrongRunIdentity: true });
  await assert.rejects(verify(t, f), /identities must match/);
  assert.equal(f.importCalls().length, 0);
  assert.deepEqual(f.savedState(), f.initialState);
});

test('missing referenced evidence fails before importing', async t => {
  const f = fixture({ missingEvidence: true });
  await assert.rejects(verify(t, f), /evidence must already exist/);
  assert.equal(f.importCalls().length, 0);
  assert.deepEqual(f.savedState(), f.initialState);
});

test('incorrect original input hash fails before importing', async t => {
  const f = fixture({ badHash: true });
  await assert.rejects(verify(t, f), /original captured input exactly/);
  assert.equal(f.importCalls().length, 0);
  assert.deepEqual(f.savedState(), f.initialState);
});

test('receipt removed immediately before replay fails without submitting a new run', async t => {
  const f = fixture({ removeReceiptBeforeImport: true });
  await assert.rejects(verify(t, f), /changed before the call/);
  assert.equal(f.importCalls().length, 0);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.deletions, []);
  assert(!f.documents.has(f.receiptPath));
});

test('unexpected generic write fails and cleans up only the generated probe', async t => {
  const f = fixture({ allowGenericWrite: true });
  await assert.rejects(verify(t, f), /Generic writes must not bypass Atlas/);
  assert.equal(f.importCalls().length, 0);
  assert.equal(f.writes.length, 1);
  assert(f.writes[0].startsWith(`${f.root}/runs/ci-generic-write-guard-`));
  assert.deepEqual(f.deletions, f.writes);
  assert.deepEqual(f.savedState(), f.initialState);
});

test('changed replay response fails exact receipt acceptance', async t => {
  const f = fixture({ changedReplayReceipt: true });
  await assert.rejects(verify(t, f), /exactly the original receipt/);
  assert.equal(f.importCalls().length, 1);
  assert.deepEqual(f.savedState(), f.initialState);
  assert.deepEqual(f.writes, []);
});

test('rewritten evidence updateTime fails immutable replay acceptance', async t => {
  const f = fixture({ rewriteEvidence: true });
  await assert.rejects(verify(t, f), /must not rewrite referenced evidence/);
  assert.equal(f.importCalls().length, 1);
  assert.deepEqual(f.writes, [f.evidencePaths[0]]);
  assert.deepEqual(f.deletions, []);
  const initial = new Map(f.initialState);
  assert.deepEqual(f.documents.get(f.receiptPath), initial.get(f.receiptPath));
  assert.deepEqual(f.documents.get(f.evidencePaths[0]).value, initial.get(f.evidencePaths[0]).value);
  assert.equal(f.documents.get(f.evidencePaths[0]).version, initial.get(f.evidencePaths[0]).version + 1);
});
