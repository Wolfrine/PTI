import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { registerAtlasTools } from './atlas.js';
import { atlasBatchSchema, atlasRecordSchema, atlasProgressSchema, atlasReviewSchema, canonical, evidenceId, fingerprint, prepareAtlasBootstrap, sourceIdentity, stageAtlasRecords, utcNanoseconds, validateSource, type AtlasRecord, type AtlasSource } from './atlas-contract.js';

const record = (patch: Partial<AtlasRecord> = {}): AtlasRecord => ({ sourceSystem: 'github', sourceLocator: 'https://github.com/example/atlas/blob/main/README.md', sourceRecordId: 'README.md', sourceRevision: 'revision-1', occurredAt: null, sourceUpdatedAt: '2026-10-20T10:00:00.000000001Z', capturedAt: '2026-10-29T08:00:00.440150Z', claim: 'A synthetic documented prototype exists; deployment is not established.', originalStatus: null, evidenceKind: 'primary_artifact', subjectIds: ['synthetic-subject'], projectId: 'synthetic-project', contribution: null, limitations: ['Synthetic test fixture.'], reviewStatus: 'pending', ...patch });
const batch = (records = [record()], completeness: 'partial' | 'complete' = 'partial') => ({ schemaVersion: 1 as const, sourceScope: { system: 'github', locator: 'https://github.com/example/atlas/', completeness, limitation: completeness === 'partial' ? 'Only selected files were inspected.' : '' }, records });
const source = (patch: Partial<AtlasSource> = {}): AtlasSource => ({ schemaVersion: 1, sourceId: 'synthetic-repo', system: 'github', locator: 'https://github.com/example/atlas/', recordLocatorPrefixes: ['https://github.com/example/atlas/'], recordLocators: [], enabled: true, revision: 1, updatedAt: Date.now(), lastEventId: 'source-consent-synthetic', ...patch });

function fixture() {
  const data = new Map<string, any>(), handlers = new Map<string, any>();
  const snap = (path: string) => ({ id: path.split('/').at(-1)!, exists: data.has(path), data: () => structuredClone(data.get(path)) });
  const makeQuery = (path: string, take = 100, after = ''): any => ({
    doc: (id: string) => makeRef(`${path}/${id}`), orderBy: () => makeQuery(path, take, after), limit: (n: number) => makeQuery(path, n, after), startAfter: (id: string) => makeQuery(path, take, id),
    get: async () => { const docs = [...data.keys()].filter(k => k.startsWith(`${path}/`) && k.slice(path.length + 1).indexOf('/') < 0 && k.slice(path.length + 1) > after).sort().slice(0, take).map(snap); return { docs, size: docs.length }; },
  });
  const makeRef = (path: string): any => ({ path, id: path.split('/').at(-1), collection: (name: string) => makeQuery(`${path}/${name}`), get: async () => snap(path) });
  let queue = Promise.resolve();
  const db: any = { doc: makeRef, runTransaction: (fn: any) => {
    const result = queue.then(async () => { const writes: any[] = []; let writing = false;
      const output = await fn({ get: async (r: any) => { if (writing) throw new Error('Read after write'); return snap(r.path); },
        create: (r: any, v: any) => { writing = true; writes.push({ type: 'create', path: r.path, value: structuredClone(v) }); },
        set: (r: any, v: any) => { writing = true; writes.push({ type: 'set', path: r.path, value: structuredClone(v) }); },
      });
      const staged = new Map(data);
      for (const w of writes) { if (w.type === 'create' && staged.has(w.path)) throw new Error('exists'); staged.set(w.path, w.value); }
      data.clear(); staged.forEach((v, k) => data.set(k, v)); return output;
    }); queue = result.then(() => undefined, () => undefined); return result;
  } };
  const server: any = { registerTool: (name: string, def: any, fn: any) => handlers.set(name, async (input: unknown) => fn(z.object(def.inputSchema).parse(input))) };
  registerAtlasTools(server, db, 'owner', 'synthetic-authorized-task');
  const root = 'users/owner/atlasData/workspace'; data.set(`${root}/sources/synthetic-repo`, source());
  const call = async (name: string, args: object) => JSON.parse((await handlers.get(name)(args)).content[0].text);
  const ingest = (runId = 'synthetic-run', value = batch()) => call('atlas_import_evidence', { runId, sourceIds: ['synthetic-repo'], batch: value });
  return { data, root, call, ingest };
}

describe('Atlas provenance contract', () => {
  it('retains exact micro/nanosecond timestamps and compares full precision', () => {
    expect(atlasRecordSchema.parse(record()).capturedAt).toBe('2026-10-29T08:00:00.440150Z');
    expect(utcNanoseconds('2026-01-01T00:00:00.000000002Z') - utcNanoseconds('2026-01-01T00:00:00.000000001Z')).toBe(1n);
    expect(utcNanoseconds('2026-01-01T00:00:00.1Z')).toBe(utcNanoseconds('2026-01-01T00:00:00.100000000Z'));
    expect(utcNanoseconds('1969-12-31T23:59:59.999999999Z')).toBe(-1n);
  });
  it.each(['2026-02-30T10:00:00Z', '2026-02-29T10:00:00.123456Z', '2026-01-01', '2026-01-01T00:00:60Z', '2026-01-01T00:00:00.1234567890Z', '2026-01-01T00:00:00+00:00'])('rejects invalid timestamp %s', value => expect(() => utcNanoseconds(value)).toThrow());
  it('rejects unsafe extras, invented mastery, unsupported sources and oversized input', () => {
    expect(() => atlasRecordSchema.parse({ ...record(), rawChats: 'forbidden' })).toThrow();
    expect(() => atlasRecordSchema.parse({ ...record(), credentials: 'forbidden' })).toThrow();
    expect(() => atlasRecordSchema.parse({ ...record(), reviewStatus: 'accepted' })).toThrow();
    expect(() => atlasRecordSchema.parse({ ...record(), sourceSystem: 'raw-chat-history' })).toThrow();
    expect(() => atlasBatchSchema.parse(batch(Array.from({ length: 21 }, () => record())))).toThrow();
    expect(() => atlasBatchSchema.parse({ ...batch(), sourceScope: { ...batch().sourceScope, limitation: '' } })).toThrow();
  });
  it('uses stable source identity and capture-independent deterministic content fingerprints', () => {
    const a = record(), b = record({ capturedAt: '2026-10-29T09:00:00Z' });
    expect(evidenceId(a)).toBe(evidenceId(b)); expect(fingerprint(a)).toBe(fingerprint(b));
    expect(sourceIdentity(a)).toBe(sourceIdentity(record({ sourceRevision: 'revision-2' })));
    expect(canonical({ z: 1, a: { q: 2, b: 3 } })).toBe('{"a":{"b":3,"q":2},"z":1}');
  });
  it('retains each revision and proposes supersession only for strictly later source time', () => {
    const first = stageAtlasRecords([record()], [], []);
    const later = stageAtlasRecords([record({ sourceRevision: 'revision-2', sourceUpdatedAt: '2026-10-20T10:00:00.000000002Z' })], [], first.heads);
    expect(later.added[0].supersedes).toBe(first.added[0].id);
    for (const date of [null, '2026-10-20T10:00:00Z', '2026-10-20T10:00:00.000000001Z']) {
      expect(stageAtlasRecords([record({ sourceRevision: 'revision-other', sourceUpdatedAt: date })], [], first.heads).added[0].supersedes).toBeNull();
    }
  });
  it('does not supersede timestamps equivalent at different fractional representations', () => {
    const initial = stageAtlasRecords([record({ sourceUpdatedAt: '2026-10-20T10:00:00.1Z' })], [], []);
    expect(stageAtlasRecords([record({ sourceRevision: 'next', sourceUpdatedAt: '2026-10-20T10:00:00.100000000Z' })], [], initial.heads).added[0].supersedes).toBeNull();
  });
  it('keeps unknown revisions content-addressed and flags changed explicit revisions', () => {
    const first = stageAtlasRecords([record()], [], []);
    const changed = stageAtlasRecords([record({ claim: 'A different claim at the same source version.' })], first.added, first.heads);
    expect(changed.added).toHaveLength(0); expect(changed.conflicts).toHaveLength(1);
    expect(evidenceId(record({ sourceRevision: null }))).not.toBe(evidenceId(record({ sourceRevision: null, claim: 'Changed content.' })));
  });
  it('separates declared progress and review status from evidence content', () => {
    const base = { schemaVersion: 1, revision: 1, updatedAt: Date.now(), lastEventId: 'event' };
    expect(atlasProgressSchema.parse({ ...base, subjectId: 'synthetic-subject', state: 'applying', note: '', basis: 'self-report' }).basis).toBe('self-report');
    expect(() => atlasProgressSchema.parse({ ...base, subjectId: 's', state: 'mastered', note: '', basis: 'inferred' })).toThrow();
    expect(atlasReviewSchema.parse({ ...base, evidenceId: evidenceId(record()), status: 'accepted', note: '' }).status).toBe('accepted');
  });
});

describe('Atlas source permissions', () => {
  it('allows a bounded repository and owner tracker collection, never all users or raw chat history', () => {
    expect(validateSource(source(), 'owner').enabled).toBe(true);
    expect(validateSource(source({ system: 'pti-tracker-firestore', recordLocatorPrefixes: ['users/owner/trackerData/workspace/evidence/'] }), 'owner').enabled).toBe(true);
    for (const prefix of ['https://', 'https://github.com/', 'https://github.com/example/', 'https://github.com/example/chatgpt_harness/']) expect(() => validateSource(source({ recordLocatorPrefixes: [prefix] }), 'owner')).toThrow();
    expect(() => validateSource(source({ system: 'pti-tracker-firestore', recordLocatorPrefixes: ['users/other/trackerData/workspace/evidence/'] }), 'owner')).toThrow();
  });
  it('requires exact Pages/Drive entries and excludes credentials in URLs', () => {
    expect(validateSource(source({ system: 'chatgpt-pages', recordLocatorPrefixes: [], recordLocators: ['https://chatgpt.com/space/page_synthetic'] }), 'owner').enabled).toBe(true);
    expect(() => validateSource(source({ system: 'chatgpt-pages', recordLocatorPrefixes: ['https://chatgpt.com/space/'] }), 'owner')).toThrow();
    expect(() => validateSource(source({ recordLocatorPrefixes: [], recordLocators: ['https://user:secret@github.com/example/atlas/'] }), 'owner')).toThrow();
    expect(() => validateSource(source({ recordLocatorPrefixes: [], recordLocators: ['https://github.com/example/atlas/%2e%2e/private'] }), 'owner')).toThrow();
  });
});

describe('Atlas MCP integration', () => {
  it('imports immutable pending evidence and retains bounded source coverage', async () => {
    const { data, root, ingest } = fixture(), result = await ingest();
    expect(result.addedIds).toHaveLength(1); expect(data.get(`${root}/evidence/${result.addedIds[0]}`).record).toEqual(record());
    const scopes = [...data.values()].filter(x => x.kind === 'scope'); expect(scopes[0].lastCompleteScanCapturedAt).toBeNull();
    expect([...data.keys()].some(k => /\/(progress|reviews)\//.test(k))).toBe(false);
  });
  it('replays identical run IDs without writes and rejects changed input for the same run', async () => {
    const { data, ingest } = fixture(); const first = await ingest(), before = structuredClone(data);
    expect((await ingest()).replayed).toBe(true); expect(data).toEqual(before);
    await expect(ingest('synthetic-run', batch([record({ claim: 'Different.' })]))).rejects.toThrow('different input');
    expect(data).toEqual(before); expect(first.replayed).toBe(false);
  });
  it('deduplicates recaptures even under different run IDs', async () => {
    const { data, root, ingest } = fixture(); const first = await ingest();
    const next = await ingest('again', batch([record({ capturedAt: '2026-10-29T12:00:00Z' })]));
    expect(next.addedIds).toHaveLength(0); expect(next.duplicateIds).toEqual(first.addedIds);
    expect(data.get(`${root}/evidence/${first.addedIds[0]}`).record.capturedAt).toBe(record().capturedAt);
  });
  it('retains same-revision conflicts and blocks later completed cursors even on empty scans', async () => {
    const { data, root, ingest } = fixture(); await ingest();
    const conflict = await ingest('changed', batch([record({ claim: 'Different same-version content.' })], 'complete'));
    expect(conflict.status).toBe('needs-review'); expect(conflict.conflictEventIds).toHaveLength(1);
    const again = await ingest('changed-again', batch([record({ claim: 'Different same-version content.', capturedAt: '2026-10-29T12:00:00Z' })], 'complete'));
    expect(again.unresolvedConflictCount).toBe(1);
    await ingest('empty-complete', batch([], 'complete'));
    expect([...data.values()].filter(x => x.kind === 'scope')[0].lastCompleteScanCapturedAt).toBeNull();
    expect([...data.values()].filter(x => x.kind === 'scope')[0].completeness).toBe('partial');
    expect(data.get(`${root}/evidence/${evidenceId(record())}`).record.claim).toBe(record().claim);
  });
  it('retains conflict blocking across different scopes', async () => {
    const { data, ingest } = fixture(); await ingest(); await ingest('conflict', batch([record({ claim: 'Changed.' })]));
    const other = batch([], 'complete'); other.sourceScope.locator = 'synthetic-other-scope'; await ingest('other-scope', other);
    expect([...data.values()].filter(x => x.kind === 'scope').every(x => x.lastCompleteScanCapturedAt === null)).toBe(true);
  });
  it('rejects corrupted retained identity heads without writing a revision', async () => {
    const f = fixture(); await f.ingest();
    const path = `${f.root}/sourceState/${sourceIdentity(record())}`;
    f.data.set(path, { ...f.data.get(path), newestSourceUpdatedAt: '2026-10-20T10:00:00.000000002Z' });
    const before = structuredClone(f.data);
    await expect(f.ingest('next', batch([record({ sourceRevision: 'revision-2' })]))).rejects.toThrow('predecessor');
    expect(f.data).toEqual(before);
  });
  it('rejects forged conflict linkage and incomplete state rather than advancing coverage', async () => {
    const f = fixture(); await f.ingest(); const changed = record({ claim: 'Changed.' });
    const result = await f.ingest('conflict', batch([changed]));
    const conflictPath = `${f.root}/events/${result.conflictEventIds[0]}`;
    f.data.set(conflictPath, { ...f.data.get(conflictPath), incomingRecord: record({ sourceRecordId: 'another-record', claim: 'Changed.' }) });
    await expect(f.ingest('conflict-repeat', batch([changed], 'complete'))).rejects.toThrow();
    f.data.delete(`${f.root}/sourceState/integrity`);
    await expect(f.ingest('after-state-loss', batch([record()], 'complete'))).rejects.toThrow('incomplete');
    expect([...f.data.values()].filter(x => x.kind === 'scope')[0].lastCompleteScanCapturedAt).toBeNull();
  });
  it('does not write anything when source consent is absent, disabled or cross-owner', async () => {
    const f = fixture(); f.data.delete(`${f.root}/sources/synthetic-repo`); const before = structuredClone(f.data);
    await expect(f.ingest()).rejects.toThrow('missing'); expect(f.data).toEqual(before);
    f.data.set(`${f.root}/sources/synthetic-repo`, source({ enabled: false })); await expect(f.ingest()).rejects.toThrow('allowlist');
    await expect(f.call('atlas_import_evidence', { uid: 'other', runId: 'test', sourceIds: ['synthetic-repo'], batch: batch() })).rejects.toThrow('outside');
    await expect(f.call('atlas_context', { uid: 'other' })).rejects.toThrow('outside');
  });
  it('enforces input validation before committing any batch', async () => {
    const f = fixture(), before = structuredClone(f.data);
    await expect(f.ingest('bad', batch([record({ capturedAt: 'not-a-date' })]))).rejects.toThrow();
    expect(f.data).toEqual(before);
  });
  it('preserves both concurrent runs without double-adding evidence', async () => {
    const f = fixture(), results = await Promise.all([f.ingest(), f.ingest()]);
    expect(results.map(r => r.replayed).sort()).toEqual([false, true]);
    expect([...f.data.keys()].filter(k => k.includes('/evidence/'))).toHaveLength(1);
  });
  it('provides bounded collection pagination without claiming whole knowledge coverage', async () => {
    const f = fixture();
    for (let i = 0; i < 3; i++) f.data.set(`${f.root}/progress/item-${i}`, { state: 'unknown' });
    const page = await f.call('atlas_context', { collection: 'progress', limit: 2 });
    expect(page.items).toHaveLength(2); expect(page.complete).toBe(false); expect(page.nextAfterId).toBe('item-1');
    const last = await f.call('atlas_context', { collection: 'progress', limit: 2, afterId: page.nextAfterId });
    expect(last.items).toHaveLength(1); expect(last.nextAfterId).toBeNull();
  });
});

describe('explicit first-import bootstrap plan', () => {
  it('produces create-only bounded source/event and evidence/state/run groups without I/O', () => {
    const plan = prepareAtlasBootstrap({ uid: 'owner', runId: 'bootstrap', sources: [source()], batch: batch(), capturedAt: '2026-10-29T10:00:00Z' });
    expect(plan.sourceWrites).toHaveLength(2); expect(plan.importWrites).toHaveLength(5);
    expect([...plan.sourceWrites, ...plan.importWrites].every(w => w.operation === 'create' && w.path.startsWith('users/owner/atlasData/workspace/'))).toBe(true);
    expect(plan.receipt.addedIds).toEqual([evidenceId(record())]);
    const evidence = plan.importWrites.find(w => w.path.includes('/evidence/'))!.data as any;
    expect(evidence.record.capturedAt).toBe(record().capturedAt);
  });
  it('rejects unapproved records, duplicate consent events and oversized atomic groups', () => {
    expect(() => prepareAtlasBootstrap({ uid: 'owner', runId: 'x', sources: [source({ enabled: false })], batch: batch() })).toThrow();
    expect(() => prepareAtlasBootstrap({ uid: 'owner', runId: 'x', sources: [source(), source({ sourceId: 'another' })], batch: batch() })).toThrow('distinct');
    expect(() => prepareAtlasBootstrap({ uid: 'owner', runId: 'x', sources: [source()], batch: batch(Array.from({ length: 10 }, (_, i) => record({ sourceRecordId: `file-${i}` }))) })).toThrow('atomic');
  });
});
