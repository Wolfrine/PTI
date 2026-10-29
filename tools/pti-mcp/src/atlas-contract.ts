import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ATLAS_SOURCE_SYSTEMS = ['github', 'chatgpt-pages', 'pti-tracker-firestore', 'google-drive-spreadsheet', 'google-drive-document', 'web-primary-source', 'user-report'] as const;
export const atlasId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const text = (max = 20000) => z.string().max(max).refine(value => value.trim().length > 0, 'Nonblank text required.');

// Do not normalize provenance timestamps: Pages can return microseconds and
// Firestore revisions can differ by a single nanosecond.
export function utcNanoseconds(value: string): bigint {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!m) throw new Error('Expected a full UTC timestamp with 1–9 optional fractional digits.');
  const whole = `${m[1]}.000Z`, date = new Date(whole);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== whole) throw new Error('Invalid calendar timestamp.');
  return BigInt(date.getTime()) * 1000000n + BigInt((m[2] || '').padEnd(9, '0'));
}
const utc = z.string().refine(value => { try { utcNanoseconds(value); return true; } catch { return false; } }, 'Invalid full UTC timestamp.');
const uniqueText = (max: number, length = 2000) => z.array(text(length)).max(max).refine(xs => new Set(xs).size === xs.length, 'Duplicate values are not allowed.');
export const atlasRecordSchema = z.strictObject({
  sourceSystem: z.enum(ATLAS_SOURCE_SYSTEMS), sourceLocator: text(2000), sourceRecordId: text(2000),
  sourceRevision: text(2000).nullable(), occurredAt: utc.nullable(), sourceUpdatedAt: utc.nullable(), capturedAt: utc,
  claim: text(), originalStatus: text(2000).nullable(),
  evidenceKind: z.enum(['primary_artifact', 'secondary_record', 'user_report', 'proposal']),
  subjectIds: uniqueText(30, 200), projectId: text(200), contribution: text(2000).nullable(),
  limitations: uniqueText(30), reviewStatus: z.literal('pending'),
});
export const atlasScopeSchema = z.strictObject({ system: text(200), locator: text(2000), completeness: z.enum(['partial', 'complete']), limitation: z.string().max(6000) })
  .refine(s => s.completeness === 'complete' || s.limitation.trim().length > 0, 'Partial capture requires a limitation.');
export const atlasBatchSchema = z.strictObject({ schemaVersion: z.literal(1), sourceScope: atlasScopeSchema, records: z.array(atlasRecordSchema).max(20) });
export type AtlasRecord = z.infer<typeof atlasRecordSchema>;
export type AtlasBatch = z.infer<typeof atlasBatchSchema>;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const atlasHash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
// sourceLocator MUST remain stable across revisions. Exact version belongs in
// sourceRevision, not a changing blob/<commit>/ URL. No heuristic URL rewrites.
export const sourceIdentity = (r: AtlasRecord) => `src_${atlasHash([r.sourceSystem, r.sourceLocator, r.sourceRecordId])}`;
export function fingerprint(r: AtlasRecord): string {
  const { capturedAt: _capture, ...meaning } = r;
  return atlasHash({ ...meaning, subjectIds: [...r.subjectIds].sort(), limitations: [...r.limitations].sort() });
}
export const evidenceId = (r: AtlasRecord) => `ev_${atlasHash([sourceIdentity(r), r.sourceRevision === null ? ['content', fingerprint(r)] : ['revision', r.sourceRevision]])}`;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const atlasEvidenceSchema = z.strictObject({
  id: z.string().regex(/^ev_[a-f0-9]{64}$/), identity: z.string().regex(/^src_[a-f0-9]{64}$/), fingerprint: digest,
  supersedes: z.string().regex(/^ev_[a-f0-9]{64}$/).nullable(), record: atlasRecordSchema,
}).refine(e => e.id === evidenceId(e.record) && e.identity === sourceIdentity(e.record) && e.fingerprint === fingerprint(e.record), 'Evidence content or identity mismatch.');
export type AtlasEvidence = z.infer<typeof atlasEvidenceSchema>;
export const atlasHeadSchema = z.strictObject({ kind: z.literal('identity'), identity: z.string().regex(/^src_[a-f0-9]{64}$/), newestEvidenceId: z.string().regex(/^ev_[a-f0-9]{64}$/), newestSourceUpdatedAt: utc, revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) });
export type AtlasHead = z.infer<typeof atlasHeadSchema>;
export interface AtlasConflict { existingEvidenceId: string; incomingRecord: AtlasRecord; fingerprint: string; eventId: string }
export const atlasIntegritySchema = z.strictObject({ kind: z.literal('integrity'), unresolvedConflictCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), updatedAt: utc });
export const atlasSourceStateSchema = z.strictObject({ kind: z.literal('scope'), scopeId: z.string().regex(/^scope_[a-f0-9]{64}$/), system: text(200), locator: text(2000), lastAttemptAt: utc, lastCompleteScanCapturedAt: utc.nullable(), completeness: z.enum(['partial', 'complete']), limitation: z.string().max(6200), coverageBasis: z.literal('caller-declared'), revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) });
export const atlasConflictEventSchema = z.strictObject({ schemaVersion: z.literal(1), eventId: z.string().regex(/^conflict_[a-f0-9]{64}$/), kind: z.literal('evidence-conflict'), status: z.literal('pending'), runId: atlasId, createdAt: z.number().int().nonnegative(), existingEvidenceId: z.string().regex(/^ev_[a-f0-9]{64}$/), incomingRecord: atlasRecordSchema, fingerprint: digest })
  .refine(e => e.existingEvidenceId === evidenceId(e.incomingRecord) && e.fingerprint === fingerprint(e.incomingRecord) && e.eventId === `conflict_${atlasHash([e.existingEvidenceId, e.fingerprint])}`, 'Conflict event identity or content mismatch.');

const humanBase = { schemaVersion: z.literal(1), revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), lastEventId: atlasId };
export const atlasProgressSchema = z.strictObject({ ...humanBase, subjectId: atlasId, state: z.enum(['unknown', 'aware', 'learning', 'practicing', 'applying', 'paused']), note: z.string().max(4000), basis: z.literal('self-report') });
export const atlasReviewSchema = z.strictObject({ ...humanBase, evidenceId: z.string().regex(/^ev_[a-f0-9]{64}$/), status: z.enum(['accepted', 'rejected', 'needs-context']), note: z.string().max(4000) });
export const atlasSourceSchema = z.strictObject({ ...humanBase, sourceId: atlasId, system: z.enum(ATLAS_SOURCE_SYSTEMS), locator: text(2000), recordLocatorPrefixes: uniqueText(4), recordLocators: uniqueText(8), enabled: z.boolean() })
  .refine(s => s.recordLocatorPrefixes.length + s.recordLocators.length > 0, 'Specify bounded source locations.');
export type AtlasSource = z.infer<typeof atlasSourceSchema>;

function httpsUrl(value: string): URL | null {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.hash ? u : null; } catch { return null; }
}
export function validSourceLocation(system: string, locator: string, owner: string, prefix = false): boolean {
  if (!locator || locator !== locator.trim() || locator.includes('\\') || /[\u0000-\u0020]/.test(locator) || /(?:^|\/)\.\.(?:\/|$)/.test(locator) || /%(?:2e|2f|5c)/i.test(locator)) return false;
  if (system === 'pti-tracker-firestore') {
    const base = `users/${owner}/trackerData/workspace/`;
    if (!locator.startsWith(base)) return false;
    const rest = locator.slice(base.length);
    return prefix ? /^(evidence|events|nodes|edges|assessments|dayIndex|sourceState|runs)\/$/.test(rest)
      : /^(evidence|events|nodes|edges|assessments|dayIndex|sourceState|runs)\/[A-Za-z0-9_-]{1,200}$/.test(rest);
  }
  if (system === 'user-report') return !prefix && /^owner-report\/[A-Za-z0-9_-]{1,128}$/.test(locator);
  const u = httpsUrl(locator);
  if (!u) return false;
  if (system === 'github') {
    if (u.hostname !== 'github.com' || u.search || /\/chatgpt_harness(?:\/|$)/i.test(u.pathname)) return false;
    return prefix ? /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:[^?#]*\/)?$/.test(u.pathname)
      : /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[^?#]*)?$/.test(u.pathname);
  }
  if (prefix) return false; // No whole Drive, Pages, arbitrary-web or chat grants.
  if (system === 'chatgpt-pages') return u.hostname === 'chatgpt.com' && /^\/space\/page_[a-z0-9]+$/.test(u.pathname) && !u.search;
  if (system === 'google-drive-spreadsheet') return u.hostname === 'docs.google.com' && /^\/spreadsheets\/d\/[A-Za-z0-9_-]+(?:\/[^?#]*)?$/.test(u.pathname);
  if (system === 'google-drive-document') return u.hostname === 'docs.google.com' && /^\/document\/d\/[A-Za-z0-9_-]+(?:\/[^?#]*)?$/.test(u.pathname);
  return system === 'web-primary-source' && !['chatgpt.com', 'chat.openai.com', 'docs.google.com', 'drive.google.com'].includes(u.hostname);
}
export function validateSource(value: unknown, owner: string): AtlasSource {
  const source = atlasSourceSchema.parse(value);
  if (!source.recordLocatorPrefixes.every(p => validSourceLocation(source.system, p, owner, true)) || !source.recordLocators.every(p => validSourceLocation(source.system, p, owner))) throw new Error('Source policy contains an unbounded or unauthorized locator.');
  return source;
}
export function assertApprovedRecords(records: AtlasRecord[], sources: AtlasSource[], owner: string): void {
  for (const r of records) if (!validSourceLocation(r.sourceSystem, r.sourceLocator, owner) || !sources.some(s => s.enabled && s.system === r.sourceSystem && (s.recordLocators.includes(r.sourceLocator) || s.recordLocatorPrefixes.some(p => r.sourceLocator.startsWith(p))))) throw new Error('Evidence source is not enabled in the owner-approved source allowlist.');
}

export function stageAtlasRecords(records: AtlasRecord[], existing: AtlasEvidence[], heads: AtlasHead[]) {
  const byId = new Map(existing.map(e => [e.id, atlasEvidenceSchema.parse(e)]));
  const newest = new Map(heads.map(h => {
    atlasHeadSchema.parse(h); return [h.identity, { ...h }] as const;
  }));
  const added: AtlasEvidence[] = [], duplicates: string[] = [], conflicts: AtlasConflict[] = [];
  const changedHeads = new Map<string, AtlasHead>();
  for (const r of records) {
    atlasRecordSchema.parse(r);
    const id = evidenceId(r), identity = sourceIdentity(r), fp = fingerprint(r), found = byId.get(id);
    if (found) {
      if (found.fingerprint === fp) duplicates.push(id);
      else conflicts.push({ existingEvidenceId: id, incomingRecord: r, fingerprint: fp, eventId: `conflict_${atlasHash([id, fp])}` });
      continue;
    }
    const previous = newest.get(identity);
    const later = r.sourceUpdatedAt !== null && (!previous || utcNanoseconds(r.sourceUpdatedAt) > utcNanoseconds(previous.newestSourceUpdatedAt));
    const entry: AtlasEvidence = { id, identity, fingerprint: fp, supersedes: later && previous ? previous.newestEvidenceId : null, record: r };
    added.push(entry); byId.set(id, entry);
    if (later) { const head: AtlasHead = { kind: 'identity', identity, newestEvidenceId: id, newestSourceUpdatedAt: r.sourceUpdatedAt!, revision: (previous?.revision || 0) + 1 }; newest.set(identity, head); changedHeads.set(identity, head); }
  }
  return { added, duplicates, conflicts, heads: [...changedHeads.values()] };
}

/** Offline, create-only plan for an explicitly authorized first import. This
 * does not authenticate, read, write, bypass rules or assume an empty account.
 * Caller must confirm each target is absent; apply each group atomically through
 * its already-authorized connector and read back before declaring completion. */
export function prepareAtlasBootstrap(input: { uid: string; runId: string; sources: unknown[]; batch: unknown; capturedAt?: string; taskReference?: string | null }) {
  const uid = atlasId.parse(input.uid), runId = atlasId.parse(input.runId), batch = atlasBatchSchema.parse(input.batch);
  const capturedAt = input.capturedAt || new Date().toISOString(); utcNanoseconds(capturedAt);
  const sources = input.sources.map(source => validateSource(source, uid)), sourceIds = sources.map(s => s.sourceId);
  if (!sources.length || sources.length > 10 || new Set(sourceIds).size !== sourceIds.length || sources.some(s => s.revision !== 1 || !s.enabled)) throw new Error('Bootstrap requires 1–10 unique enabled source configurations at revision 1.');
  assertApprovedRecords(batch.records, sources, uid);
  const root = `users/${uid}/atlasData/workspace`, plan = stageAtlasRecords(batch.records, [], []);
  if (plan.conflicts.length) throw new Error('Resolve conflicting initial evidence before bootstrap.');
  const create = (collection: string, id: string, data: unknown) => ({ operation: 'create' as const, path: `${root}/${collection}/${id}`, data });
  const sourceWrites = sources.flatMap(source => [create('sources', source.sourceId, source), create('events', source.lastEventId, { schemaVersion: 1, eventId: source.lastEventId, kind: 'source', targetId: source.sourceId, revision: 1, createdAt: source.updatedAt, before: null, after: source })]);
  if (new Set(sourceWrites.map(w => w.path)).size !== sourceWrites.length) throw new Error('Source consent events must have distinct IDs.');
  const scopeId = `scope_${atlasHash([batch.sourceScope.system, batch.sourceScope.locator])}`;
  const receipt = { schemaVersion: 1, runId, inputHash: atlasHash({ batch, sourceIds: [...sourceIds].sort() }), capturedAt, taskReference: input.taskReference || null, sourceIds, sourceScope: batch.sourceScope, inputCount: batch.records.length, addedIds: plan.added.map(e => e.id), duplicateIds: plan.duplicates, conflictEventIds: [] as string[], unresolvedConflictCount: 0, status: 'staged' };
  const importWrites = [
    ...plan.added.map(e => create('evidence', e.id, e)), ...plan.heads.map(h => create('sourceState', h.identity, h)),
    create('sourceState', 'integrity', { kind: 'integrity', unresolvedConflictCount: 0, updatedAt: capturedAt }),
    create('sourceState', scopeId, { kind: 'scope', scopeId, system: batch.sourceScope.system, locator: batch.sourceScope.locator, lastAttemptAt: capturedAt, lastCompleteScanCapturedAt: batch.sourceScope.completeness === 'complete' ? capturedAt : null, completeness: batch.sourceScope.completeness, limitation: batch.sourceScope.limitation, coverageBasis: 'caller-declared', revision: 1 }), create('runs', runId, receipt),
  ];
  if (sourceWrites.length > 20 || importWrites.length > 20) throw new Error('Bootstrap exceeds atomic connector group bound; use atlas_import_evidence instead.');
  return { schemaVersion: 1, createOnly: true, sourceWrites, importWrites, receipt };
}
