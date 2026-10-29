import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AtlasEvidence, emptyAtlasSnapshot } from '../../services/atlas.models';
import { AtlasService } from '../../services/atlas.service';
import { NewAtlasComponent } from './new-atlas.component';

describe('Civilization Atlas presentation truth', () => {
  let component: NewAtlasComponent;
  let service: {
    snapshot: WritableSignal<ReturnType<typeof emptyAtlasSnapshot>>;
    saving: WritableSignal<boolean>;
    loading: WritableSignal<boolean>;
    error: WritableSignal<string | null>;
    setProgress: jasmine.Spy; reviewEvidence: jasmine.Spy;
  };
  const evidence = (): AtlasEvidence => ({
    id: 'ev_synthetic', identity: 'synthetic', fingerprint: 'synthetic', supersedes: null,
    record: { sourceSystem: 'user-report', sourceLocator: 'owner-report/synthetic', sourceRecordId: 'synthetic',
      sourceRevision: null, occurredAt: null, sourceUpdatedAt: null, capturedAt: '2026-10-29T00:00:00Z',
      claim: 'Synthetic evidence for a component test.', originalStatus: null, evidenceKind: 'user_report',
      subjectIds: ['software-engineering'], projectId: 'Synthetic project', contribution: null,
      limitations: ['Synthetic test only.'], reviewStatus: 'pending' },
  });

  beforeEach(() => {
    service = { snapshot: signal<ReturnType<typeof emptyAtlasSnapshot>>({ ...emptyAtlasSnapshot(), loadedAt: '2026-10-29T00:00:00Z' }), saving: signal(false), loading: signal(false),
      error: signal<string | null>(null), setProgress: jasmine.createSpy().and.resolveTo(),
      reviewEvidence: jasmine.createSpy().and.resolveTo() };
    TestBed.configureTestingModule({ providers: [
      { provide: AtlasService, useValue: service },
      { provide: Router, useValue: { navigate: jasmine.createSpy().and.resolveTo(true) } },
      { provide: ActivatedRoute, useValue: { queryParamMap: new BehaviorSubject(convertToParamMap({})) } },
    ] });
    component = TestBed.runInInjectionContext(() => new NewAtlasComponent());
    component.ngOnInit();
  });

  it('does not call an unloaded review pending or permit overwriting it', async () => {
    const item = evidence();
    service.snapshot.update(snapshot => ({ ...snapshot, evidence: [item], hasMore: { ...snapshot.hasMore, reviews: true } }));
    expect(component.reviewLabel(item)).toBe('Review not loaded');
    expect(component.awaitingEvidence()).toEqual([]);
    expect(component.visibleEvidence()).toEqual([]);
    await component.review(item, 'accepted');
    expect(service.reviewEvidence).not.toHaveBeenCalled();
  });

  it('does not turn an unloaded position into an editable unassessed self-report', async () => {
    component.subjectId.set('software-engineering');
    service.snapshot.update(snapshot => ({ ...snapshot, hasMore: { ...snapshot.hasMore, progress: true } }));
    expect(component.positionLabel('software-engineering')).toBe('Position not loaded');
    await component.saveProgress();
    expect(service.setProgress).not.toHaveBeenCalled();
  });

  it('uses pending only after the relevant review collection is fully loaded', () => {
    const item = evidence();
    service.snapshot.update(snapshot => ({ ...snapshot, evidence: [item] }));
    expect(component.reviewLabel(item)).toBe('Awaiting review');
    expect(component.awaitingEvidence().length).toBe(1);
  });

  it('labels accepted evidence Linked rather than a verified outcome or mastery', () => {
    const item = evidence();
    service.snapshot.update(snapshot => ({ ...snapshot, evidence: [item], reviews: [{
      id: item.id, evidenceId: item.id, schemaVersion: 1, revision: 1,
      updatedAt: 1, lastEventId: 'synthetic-event', status: 'accepted', note: '',
    }] }));
    expect(component.reviewLabel(item)).toBe('Linked');
    expect(component.positionLabel('software-engineering')).toBe('Unassessed');
  });

  it('removes dismissed evidence from work markers without discarding provenance', () => {
    const item = evidence();
    service.snapshot.update(snapshot => ({ ...snapshot, evidence: [item], reviews: [{
      id: item.id, evidenceId: item.id, schemaVersion: 1, revision: 1,
      updatedAt: 1, lastEventId: 'synthetic-event', status: 'rejected', note: '',
    }] }));
    expect(component.workEvidenceFor('software-engineering')).toEqual([]);
    expect(component.evidenceFor('software-engineering')).toEqual([item]);
    expect(component.workSubjects()).toEqual([]);
  });

  it('keeps long source permissions exact while offering a concise summary', () => {
    const locator = 'https://example.org/source?scope=' + 'synthetic-'.repeat(30);
    expect(component.sourceSummary(locator)).toBe('example.org');
    expect(locator.length).toBeGreaterThan(200);
  });

  it('never shows save success after a rejected mutation', async () => {
    component.subjectId.set('software-engineering');
    service.setProgress.and.rejectWith(new Error('Synthetic conflict'));
    await component.saveProgress();
    expect(component.notice()).toBe('');
    expect(service.error()).toBeNull();
    expect(component.actionError()).toBe('Synthetic conflict');
  });

  it('clears private drafts when the owner snapshot resets', () => {
    TestBed.flushEffects();
    component.progressNote = 'Synthetic unsaved private note';
    component.progressDirty = true;
    component.reviewNotes['ev_synthetic'] = 'Synthetic review draft';
    service.snapshot.set(emptyAtlasSnapshot());
    TestBed.flushEffects();
    expect(component.progressNote).toBe('');
    expect(component.reviewNotes).toEqual({});
    expect(component.progressDirty).toBeFalse();
    expect(component.positionLabel('software-engineering')).toBe('Position not loaded');
  });

  it('uses singular counts without changing their scope', () => {
    expect(component.countLabel(1, 'loaded record')).toBe('1 loaded record');
    expect(component.countLabel(1, 'bounded prefix', 'bounded prefixes')).toBe('1 bounded prefix');
    expect(component.countLabel(0, 'bounded prefix', 'bounded prefixes')).toBe('0 bounded prefixes');
  });

  it('preserves missing dates and rejects unsafe source links', () => {
    expect(component.date(null)).toBe('Date not recorded');
    expect(component.time('not-a-date')).toBe('Time not recorded');
    expect(component.safeUrl('javascript:alert(1)')).toBeNull();
    expect(component.safeUrl('https://user:password@example.org')).toBeNull();
  });

  it('does not confuse search scope with catalogue completeness', () => {
    component.sectorId.set('computing');
    component.query.set('engineering');
    expect(component.matchingSubjects().every(subject => subject.sectorId === 'computing')).toBeTrue();
    component.query.set('no synthetic match expected');
    expect(component.matchingSubjects()).toEqual([]);
    expect(component.subjects.length).toBeGreaterThan(0);
  });
});
