// Local-only synthetic design/interaction harness. Never imported by main.ts.
// No Firebase, user session, account ID, or external write is used here.
import { Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, RouterOutlet } from '@angular/router';
import { NewAtlasComponent } from './app/components/new-atlas/new-atlas.component';
import { AtlasService } from './app/services/atlas.service';
import { AtlasEvidence, AtlasProgressState, AtlasReviewStatus, AtlasSourceInput, AtlasSnapshot, emptyAtlasSnapshot } from './app/services/atlas.models';

const fixture = new URLSearchParams(location.search).get('fixture') || 'populated';
const stamp = '2026-10-29T09:00:00.123456789Z';
const now = Date.parse('2026-10-29T09:00:00Z');
const makeEvidence = (index: number, subjectIds: string[], claim: string): AtlasEvidence => ({
  id: `ev_${String(index).padStart(64, 'a')}`, identity: `src_${String(index).padStart(64, 'b')}`,
  fingerprint: String(index).padStart(64, 'c'), supersedes: null,
  record: { sourceSystem: 'github', sourceLocator: `https://github.com/example/atlas-fixture/blob/main/record-${index}.md`,
    sourceRecordId: `record-${index}`, sourceRevision: 'synthetic-v1', occurredAt: null, sourceUpdatedAt: stamp, capturedAt: stamp,
    claim, originalStatus: index % 2 ? 'implemented' : 'discussed', evidenceKind: 'secondary_record',
    subjectIds, projectId: index < 4 ? 'Example learning toolkit' : 'Example design study', contribution: null,
    limitations: ['Synthetic visual-test fixture. A recorded project outcome does not establish personal understanding.'], reviewStatus: 'pending' },
});
const initial: AtlasSnapshot = emptyAtlasSnapshot();
if (!['empty', 'loading', 'error'].includes(fixture)) {
  initial.evidence = [
    makeEvidence(1, ['software-engineering', 'data-management'], 'A small learning toolkit added offline reading with explicit synchronization status.'),
    makeEvidence(2, ['education', 'agent-systems'], 'A bounded question-generation workflow was discussed. Its first classroom trial has not been assessed.'),
    makeEvidence(3, ['software-engineering', 'interaction-design'], 'A responsive learning interface was implemented; a recorded artifact is available for review.'),
    makeEvidence(4, ['robotics', 'materials-science'], 'A material and mechanism inventory was proposed before building a physical prototype.'),
    makeEvidence(5, ['creative-writing'], 'A short scene explored a character’s memories before an important public event.'),
    makeEvidence(6, ['spatial-design', 'circulation-design'], 'A spatial study compared movement through an entrance and its surrounding paths.'),
    makeEvidence(7, ['modular-design', 'simulation-games'], 'A modular construction study retained its source scale and recorded the unresolved constraints.'),
    makeEvidence(8, ['data-management'], 'A source-backed revision log was added to preserve earlier records rather than silently replace them.'),
  ];
  initial.sources = [{ id: 'synthetic-repo', schemaVersion: 1, sourceId: 'synthetic-repo', system: 'github', locator: 'https://github.com/example/atlas-fixture/', recordLocatorPrefixes: ['https://github.com/example/atlas-fixture/'], recordLocators: [], enabled: true, revision: 1, updatedAt: now, lastEventId: 'synthetic-source-event' }];
  initial.runs = [{ id: 'synthetic-run', schemaVersion: 1, runId: 'synthetic-run', capturedAt: stamp, inputCount: 8, addedIds: initial.evidence.map(e => e.id), duplicateIds: [], conflictEventIds: [], status: 'staged', sourceScope: { completeness: 'partial', limitation: 'Synthetic bounded selection only.' } }];
  initial.events = [{ id: 'synthetic-source-event', schemaVersion: 1, eventId: 'synthetic-source-event', kind: 'source', targetId: 'synthetic-repo', revision: 1, createdAt: now, before: null, after: { enabled: true } }];
}
if (fixture === 'reviewed') {
  initial.reviews = [{ id: initial.evidence[0].id, schemaVersion: 1, evidenceId: initial.evidence[0].id, status: 'accepted', note: 'Synthetic explicit link, not a mastery assessment.', revision: 1, updatedAt: now, lastEventId: 'synthetic-review-event' }];
  initial.progress = [{ id: 'software-engineering', schemaVersion: 1, subjectId: 'software-engineering', state: 'learning', note: 'Synthetic self-report for review testing.', basis: 'self-report', revision: 1, updatedAt: now, lastEventId: 'synthetic-progress-event' }];
}
if (fixture === 'long') {
  initial.evidence[0].record.claim = 'Long-source stress test: ' + 'A bounded evidence-backed observation retains the original context and the limits of what is known. '.repeat(7);
  initial.evidence[0].record.sourceLocator += '?reference=' + 'long-source-locator-'.repeat(18);
  initial.sources[0].locator += '?scope=' + 'long-human-readable-source-context-'.repeat(12);
  initial.evidence[0].record.subjectIds.push('not-in-editorial-catalog');
}
if (fixture === 'partial') initial.hasMore = { evidence: true, reviews: true, progress: true, events: true, sources: false, runs: true };
if (!['loading', 'error'].includes(fixture)) initial.loadedAt = stamp;
const snapshot = signal(initial), loading = signal(fixture === 'loading'), saving = signal(false);
const error = signal<string | null>(fixture === 'error' ? 'Your Atlas could not be loaded. Check your connection and try again. Previous readings, if shown, have not been refreshed.' : null);

function mutate(kind: 'progress' | 'review' | 'source', id: string, fields: Record<string, unknown>) {
  const collection = kind === 'progress' ? 'progress' : kind === 'review' ? 'reviews' : 'sources';
  const current = snapshot(), old = current[collection].find(entry => entry.id === id);
  const revision = (old?.revision || 0) + 1, eventId = `synthetic-${kind}-${revision}-${Date.now()}`, createdAt = Date.now();
  const next = { id, schemaVersion: 1, ...fields, revision, updatedAt: createdAt, lastEventId: eventId };
  snapshot.set({ ...current, [collection]: [...current[collection].filter(entry => entry.id !== id), next], events: [...current.events, { id: eventId, schemaVersion: 1, eventId, kind, targetId: id, revision, createdAt, before: old || null, after: next }] } as AtlasSnapshot);
}
const preview = {
  snapshot, loading, saving, error,
  refresh: async () => { loading.set(false); snapshot.update(s => ({ ...s, loadedAt: new Date().toISOString() })); },
  loadMore: async (name: keyof AtlasSnapshot['hasMore']) => { snapshot.update(s => ({ ...s, hasMore: { ...s.hasMore, [name]: false } })); },
  setProgress: async (id: string, state: AtlasProgressState, note: string) => mutate('progress', id, { subjectId: id, state, note, basis: 'self-report' }),
  reviewEvidence: async (id: string, status: AtlasReviewStatus, note: string) => mutate('review', id, { evidenceId: id, status, note }),
  setSource: async (source: AtlasSourceInput) => mutate('source', source.sourceId, source as unknown as Record<string, unknown>),
  exportData: () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ synthetic: true, ...snapshot() }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'synthetic-atlas-preview.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); },
};
@Component({ selector: 'app-root', standalone: true, imports: [RouterOutlet], template: `<aside style="position:fixed;bottom:3px;left:6px;z-index:50;font:9px system-ui;padding:3px 6px;background:rgba(233,230,220,.94);color:#455451;pointer-events:none">LOCAL SYNTHETIC FIXTURE · {{fixture}} · no authentication or database access</aside><router-outlet />` })
class AtlasPreview { readonly fixture = fixture; }
bootstrapApplication(AtlasPreview, { providers: [provideRouter([{ path: '', component: NewAtlasComponent }, { path: 'atlas', component: NewAtlasComponent }]), { provide: AtlasService, useValue: preview }] }).catch(error => console.error(error));
