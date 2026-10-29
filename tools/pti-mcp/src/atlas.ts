import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { assertUser } from './access.js';
import { atlasBatchSchema, atlasConflictEventSchema, atlasEvidenceSchema, atlasHeadSchema, atlasHash, atlasId, atlasIntegritySchema, atlasSourceStateSchema, evidenceId, sourceIdentity, stageAtlasRecords, validateSource, assertApprovedRecords, type AtlasEvidence } from './atlas-contract.js';

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const collectionName = z.enum(['evidence', 'reviews', 'progress', 'sources', 'events', 'runs', 'sourceState']);
export function registerAtlasTools(server: McpServer, db: Firestore, owner?: string, taskReference?: string | null) {
  const root = (uid?: string) => {
    const account = owner || (uid ? assertUser(uid) : null);
    if (!account) throw new Error('Provide the workspace owner uid.');
    if (uid) assertUser(uid, owner);
    return { account, ref: db.doc(`users/${account}/atlasData/workspace`) };
  };
  server.registerTool('atlas_context', {
    title: 'Read Civilization Atlas context', description: 'Read one bounded owner-private collection with explicit pagination. Evidence is immutable and pending; reviews link evidence, not verify mastery. Progress is an owner self-report. Read sources before capture. No returned page proves full subject coverage.',
    inputSchema: { uid: z.string().optional(), collection: collectionName.default('evidence'), limit: z.number().int().min(1).max(50).default(20), afterId: atlasId.optional() },
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async ({ uid, collection, limit, afterId }) => {
    const { ref } = root(uid);
    let query = ref.collection(collection).orderBy(FieldPath.documentId()).limit(limit + 1);
    if (afterId) query = query.startAfter(afterId);
    const snap = await query.get(), docs = snap.docs.slice(0, limit);
    return json({ schemaVersion: 1, root: ref.path, collection, items: docs.map(d => ({ ...d.data(), id: d.id })), nextAfterId: snap.size > limit ? docs.at(-1)!.id : null, complete: snap.size <= limit, completenessMeaning: 'Only this collection page, never knowledge or source coverage.' });
  });
  server.registerTool('atlas_import_evidence', {
    title: 'Import approved Civilization Atlas evidence', description: 'Atomically stage at most 20 records from explicit owner-approved bounded sources. Same runId/input replays safely. Evidence stays immutable and pending; changed content at one revision becomes a durable conflict. Does not change self-reported progress or evidence reviews.',
    inputSchema: { uid: z.string().optional(), runId: atlasId, sourceIds: z.array(atlasId).min(1).max(20).refine(a => new Set(a).size === a.length), batch: atlasBatchSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, async ({ uid, runId, sourceIds, batch }) => {
    const { account, ref } = root(uid), inputHash = atlasHash({ batch, sourceIds: [...sourceIds].sort() });
    if (Buffer.byteLength(JSON.stringify(batch), 'utf8') > 500000) throw new Error('Atlas batch exceeds the 500 KB bound.');
    const now = new Date().toISOString(), createdAt = Date.now(), runRef = ref.collection('runs').doc(runId);
    return json(await db.runTransaction(async tx => {
      const existingRun = await tx.get(runRef);
      if (existingRun.exists) {
        const saved = existingRun.data()!;
        if (saved.inputHash !== inputHash) throw new Error('Run ID already belongs to different input. Use a new run ID.');
        return { ...saved, replayed: true };
      }
      const sources = await Promise.all(sourceIds.map(id => tx.get(ref.collection('sources').doc(id))));
      const policies = sources.map((s, i) => {
        if (!s.exists) throw new Error('Owner-approved source configuration is missing.');
        const source = validateSource(s.data(), account);
        if (source.sourceId !== sourceIds[i]) throw new Error('Source policy identity mismatch.');
        return source;
      });
      assertApprovedRecords(batch.records, policies, account);
      const ids = [...new Set(batch.records.map(evidenceId))], identities = [...new Set(batch.records.map(sourceIdentity))];
      const scopeId = `scope_${atlasHash([batch.sourceScope.system, batch.sourceScope.locator])}`;
      const state = ref.collection('sourceState'), integrityRef = state.doc('integrity'), scopeRef = state.doc(scopeId);
      const [evidence, heads, integrity, priorScope] = await Promise.all([
        Promise.all(ids.map(id => tx.get(ref.collection('evidence').doc(id)))),
        Promise.all(identities.map(id => tx.get(state.doc(id)))), tx.get(integrityRef), tx.get(scopeRef),
      ]);
      if (!integrity.exists && (evidence.some(s => s.exists) || heads.some(s => s.exists))) throw new Error('Atlas source state is incomplete; review the prior import before continuing.');
      const savedHeads = heads.filter(s => s.exists).map(s => atlasHeadSchema.parse(s.data()));
      const priorEvidence = await Promise.all(savedHeads.map(h => tx.get(ref.collection('evidence').doc(h.newestEvidenceId))));
      savedHeads.forEach((h, i) => {
        if (!priorEvidence[i].exists) throw new Error('Source revision predecessor is missing.');
        const previous = atlasEvidenceSchema.parse(priorEvidence[i].data());
        if (previous.id !== h.newestEvidenceId || previous.identity !== h.identity || previous.record.sourceUpdatedAt !== h.newestSourceUpdatedAt) throw new Error('Source revision predecessor does not match its immutable evidence.');
      });
      const plan = stageAtlasRecords(batch.records, evidence.filter(s => s.exists).map(s => s.data() as AtlasEvidence), savedHeads);
      const conflictIds = [...new Set(plan.conflicts.map(c => c.eventId))];
      const oldConflicts = await Promise.all(conflictIds.map(id => tx.get(ref.collection('events').doc(id))));
      // Every read precedes writes; transaction retries protect allowlist changes,
      // identity heads, conflict counts and concurrent idempotent runs together.
      const previousCount = integrity.exists ? atlasIntegritySchema.parse(integrity.data()).unresolvedConflictCount : 0;
      const oldScope = priorScope.exists ? atlasSourceStateSchema.parse(priorScope.data()) : null;
      if (oldScope && (oldScope.scopeId !== scopeId || oldScope.system !== batch.sourceScope.system || oldScope.locator !== batch.sourceScope.locator)) throw new Error('Source scope identity mismatch.');
      for (const saved of oldConflicts.filter(s => s.exists)) if (atlasConflictEventSchema.parse(saved.data()).eventId !== saved.id) throw new Error('Conflict event path does not match its identity.');
      if (oldConflicts.filter(s => s.exists).length > previousCount) throw new Error('Retained conflict counter is inconsistent with immutable events.');
      const newConflictIds = conflictIds.filter((_, i) => !oldConflicts[i].exists);
      const unresolved = previousCount + newConflictIds.length;
      const complete = batch.sourceScope.completeness === 'complete' && unresolved === 0;
      for (const entry of plan.added) tx.create(ref.collection('evidence').doc(entry.id), entry);
      for (const head of plan.heads) tx.set(state.doc(head.identity), head);
      for (const id of newConflictIds) {
        const conflict = plan.conflicts.find(c => c.eventId === id)!;
        tx.create(ref.collection('events').doc(id), { schemaVersion: 1, ...conflict, kind: 'evidence-conflict', status: 'pending', runId, createdAt });
      }
      tx.set(integrityRef, { kind: 'integrity', unresolvedConflictCount: unresolved, updatedAt: now });
      tx.set(scopeRef, { kind: 'scope', scopeId, system: batch.sourceScope.system, locator: batch.sourceScope.locator, lastAttemptAt: now, lastCompleteScanCapturedAt: complete ? now : oldScope?.lastCompleteScanCapturedAt ?? null, completeness: complete ? 'complete' : 'partial', limitation: [batch.sourceScope.limitation, ...(unresolved ? ['Unresolved staging conflicts prevent completed capture.'] : [])].filter(Boolean).join(' '), coverageBasis: 'caller-declared', revision: (oldScope?.revision || 0) + 1 });
      const result = { schemaVersion: 1, runId, inputHash, capturedAt: now, taskReference: taskReference || null, sourceIds, sourceScope: batch.sourceScope, inputCount: batch.records.length, addedIds: plan.added.map(e => e.id), duplicateIds: plan.duplicates, conflictEventIds: conflictIds, unresolvedConflictCount: unresolved, status: plan.conflicts.length ? 'needs-review' : 'staged' };
      tx.create(runRef, result);
      return { ...result, replayed: false };
    }));
  });
}
