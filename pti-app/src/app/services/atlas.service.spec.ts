import { TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { ATLAS_FIREBASE_CLIENT, AtlasService } from './atlas.service';
import { emptyAtlasSnapshot } from './atlas.models';

describe('Atlas account isolation, pagination and atomic owner updates', () => {
  let service: AtlasService;
  let observe: (user: { uid: string } | null) => void;
  let auth: { currentUser: { uid: string } | null };
  let client: any;
  let transaction: any;
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  const signIn = async (uid = 'synthetic-owner') => { auth.currentUser = { uid }; observe(auth.currentUser); await service.refresh(); };
  const record = (id: string, data = {}) => ({ id, data: () => data });
  beforeEach(() => {
    auth = { currentUser: null };
    transaction = { get: jasmine.createSpy().and.resolveTo({ exists: () => false }), set: jasmine.createSpy() };
    client = {
      onAuthStateChanged: (_: unknown, callback: typeof observe) => { observe = callback; return jasmine.createSpy('unsubscribe'); },
      collection: (_: unknown, path: string) => ({ path }), doc: (_: unknown, path: string) => ({ path }),
      documentId: () => '__name__', orderBy: (field: string) => ({ orderBy: field }), limit: (count: number) => ({ limit: count }),
      startAfter: (after: unknown) => ({ after }), query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
      getDocs: jasmine.createSpy().and.resolveTo({ docs: [] }),
      runTransaction: jasmine.createSpy().and.callFake(async (_: unknown, fn: (tx: unknown) => Promise<void>) => fn(transaction)),
    };
    TestBed.configureTestingModule({ providers: [AtlasService, { provide: Auth, useValue: auth }, { provide: Firestore, useValue: {} }, { provide: ATLAS_FIREBASE_CLIENT, useValue: client }] });
    service = TestBed.inject(AtlasService);
  });
  afterEach(() => TestBed.resetTestingModule());

  it('does not read until signed in and scopes every read to the current owner', async () => {
    observe(null); await service.refresh(); expect(client.getDocs).not.toHaveBeenCalled();
    await signIn();
    for (const [request] of client.getDocs.calls.allArgs()) {
      expect(request.ref.path).toMatch(/^users\/synthetic-owner\/atlasData\/workspace\//);
      expect(request.constraints).toContain({ limit: 51 });
    }
    expect(service.loading()).toBeFalse(); expect(service.snapshot().loadedAt).not.toBeNull();
  });
  it('clears private data immediately on sign-out', async () => {
    await signIn(); service.snapshot.set({ ...emptyAtlasSnapshot(), evidence: [record('private') as never] });
    auth.currentUser = null; observe(null);
    expect(service.snapshot().evidence).toEqual([]); expect(service.snapshot().loadedAt).toBeNull();
    await expectAsync(service.setProgress('software-engineering', 'learning', '')).toBeRejectedWithError('Sign in to save your Atlas.');
  });
  it('ignores a late read from the previous account', async () => {
    const pending: ((value: unknown) => void)[] = [];
    client.getDocs.and.callFake(() => new Promise(resolve => pending.push(resolve)));
    auth.currentUser = { uid: 'first' }; observe(auth.currentUser);
    auth.currentUser = null; observe(null);
    for (const resolve of pending) resolve({ docs: [record('late-private-record')] });
    await settle(); expect(service.snapshot()).toEqual(emptyAtlasSnapshot());
  });
  it('keeps pagination explicit and deduplicates loaded IDs', async () => {
    client.getDocs.and.callFake((q: any) => Promise.resolve({ docs: q.ref.path.endsWith('/evidence') ? Array.from({ length: 51 }, (_, i) => record(`e${i}`)) : [] }));
    await signIn(); expect(service.snapshot().evidence.length).toBe(50); expect(service.snapshot().hasMore.evidence).toBeTrue();
    client.getDocs.and.resolveTo({ docs: [record('e49'), record('e50')] });
    await service.loadMore('evidence');
    expect(service.snapshot().evidence.length).toBe(51); expect(service.snapshot().hasMore.evidence).toBeFalse();
  });
  it('preserves prior readings with a visible refresh failure', async () => {
    await signIn(); const previous = service.snapshot();
    client.getDocs.and.rejectWith(new Error('network failed')); await service.refresh();
    expect(service.snapshot()).toBe(previous); expect(service.error()).toContain('have not been refreshed');
  });
  it('writes a declaration and exact before/after history together', async () => {
    await signIn(); await service.setProgress('software-engineering', 'learning', '  Explicit self-report.  ');
    expect(transaction.set.calls.count()).toBe(2);
    const [target, after] = transaction.set.calls.argsFor(0), [eventRef, event] = transaction.set.calls.argsFor(1);
    expect(target.path).toBe('users/synthetic-owner/atlasData/workspace/progress/software-engineering');
    expect(after.subjectId).toBe('software-engineering'); expect(after.basis).toBe('self-report');
    expect(after.note).toBe('Explicit self-report.'); expect(after.revision).toBe(1);
    expect(event.before).toBeNull(); expect(event.after).toEqual(after);
    expect(eventRef.path).toBe(`users/synthetic-owner/atlasData/workspace/events/${after.lastEventId}`);
    expect(event.createdAt).toBe(after.updatedAt);
  });
  it('refuses stale revisions rather than overwriting another update', async () => {
    await signIn(); transaction.get.and.resolveTo({ exists: () => true, data: () => ({ revision: 2 }) });
    await expectAsync(service.setProgress('software-engineering', 'practicing', '')).toBeRejectedWithError('This record changed elsewhere. Refresh Atlas before saving again.');
    expect(transaction.set).not.toHaveBeenCalled(); expect(service.saving()).toBeFalse();
  });
  it('does not write across an account switch during a transaction', async () => {
    await signIn(); transaction.get.and.callFake(async () => { auth.currentUser = { uid: 'other' }; return { exists: () => false }; });
    await expectAsync(service.setProgress('software-engineering', 'learning', '')).toBeRejected();
    expect(transaction.set).not.toHaveBeenCalled();
  });
  it('validates IDs, notes, states and prevents concurrent saves before writing', async () => {
    await signIn();
    await expectAsync(service.setProgress('../other', 'learning', '')).toBeRejected();
    await expectAsync(service.setProgress('safe', 'mastered' as never, '')).toBeRejected();
    await expectAsync(service.setProgress('safe', 'learning', 'x'.repeat(2001))).toBeRejected();
    service.saving.set(true);
    await expectAsync(service.setProgress('safe', 'learning', '')).toBeRejected();
    expect(client.runTransaction).not.toHaveBeenCalled();
  });
  it('reviews preserve immutable source evidence instead of writing a verification flag', async () => {
    await signIn(); const id = `ev_${'a'.repeat(64)}`;
    await service.reviewEvidence(id, 'accepted', 'Relevant record, not personal mastery.');
    const [target, after] = transaction.set.calls.argsFor(0);
    expect(target.path).toContain(`/reviews/${id}`); expect(after.evidenceId).toBe(id); expect(after.status).toBe('accepted');
    expect(transaction.set.calls.allArgs().some(([ref]: any[]) => ref.path.includes('/evidence/'))).toBeFalse();
  });
});
