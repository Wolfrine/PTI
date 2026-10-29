import { Injectable, InjectionToken, OnDestroy, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, documentId, getDocs, limit, orderBy, query, QueryDocumentSnapshot, runTransaction, startAfter } from 'firebase/firestore';
import {
  ATLAS_COLLECTIONS, ATLAS_PROGRESS_LABELS, ATLAS_REVIEW_LABELS, AtlasCollection, AtlasProgressState,
  AtlasReviewStatus, AtlasSnapshot, AtlasSourceInput, atlasSafeId, emptyAtlasSnapshot,
} from './atlas.models';

// A narrow SDK seam permits account-switch/race tests without a live account.
// Production always resolves these real Firebase operations; no session bypass.
export const ATLAS_FIREBASE_CLIENT = new InjectionToken('ATLAS_FIREBASE_CLIENT', {
  providedIn: 'root',
  factory: () => ({ onAuthStateChanged, collection, doc, documentId, getDocs, limit, orderBy, query, runTransaction, startAfter }),
});

@Injectable({ providedIn: 'root' })
export class AtlasService implements OnDestroy {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly client = inject(ATLAS_FIREBASE_CLIENT);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly snapshot = signal<AtlasSnapshot>(emptyAtlasSnapshot());
  private uid: string | null = null;
  private generation = 0;
  private readonly cursors = new Map<AtlasCollection, QueryDocumentSnapshot>();
  private readonly busyCollections = new Set<AtlasCollection>();
  private unsubscribe: () => void;

  constructor() {
    this.unsubscribe = this.client.onAuthStateChanged(this.auth, user => {
      if (user?.uid === this.uid) return;
      this.generation++;
      this.uid = user?.uid ?? null;
      this.cursors.clear(); this.busyCollections.clear();
      this.snapshot.set(emptyAtlasSnapshot()); this.error.set(null);
      if (this.uid) void this.refresh();
      else this.loading.set(false);
    });
  }

  ngOnDestroy(): void { this.generation++; this.unsubscribe(); this.snapshot.set(emptyAtlasSnapshot()); }

  async refresh(): Promise<void> {
    if (!this.uid) { this.loading.set(false); return; }
    const generation = ++this.generation;
    this.loading.set(true); this.error.set(null);
    this.cursors.clear(); this.busyCollections.clear();
    try {
      const reads = await Promise.all(ATLAS_COLLECTIONS.map(async name => [name, await this.readPage(name)] as const));
      if (generation !== this.generation) return;
      const next = emptyAtlasSnapshot();
      for (const [name, page] of reads) {
        (next[name] as unknown[]) = page.items;
        next.hasMore[name] = page.hasMore;
        if (page.last) this.cursors.set(name, page.last);
      }
      next.loadedAt = new Date().toISOString(); this.snapshot.set(next);
    } catch { if (generation === this.generation) this.error.set('Your Atlas could not be loaded. Check your connection and try again. Previous readings, if shown, have not been refreshed.'); }
    finally { if (generation === this.generation) this.loading.set(false); }
  }

  async loadMore(name: AtlasCollection): Promise<void> {
    if (!this.uid || this.busyCollections.has(name) || !this.snapshot().hasMore[name]) return;
    const generation = this.generation;
    this.busyCollections.add(name); this.error.set(null);
    try {
      const page = await this.readPage(name, this.cursors.get(name));
      if (generation !== this.generation) return;
      this.snapshot.update(current => ({ ...current,
        [name]: [...new Map([...current[name], ...page.items].map(item => [item.id, item])).values()],
        hasMore: { ...current.hasMore, [name]: page.hasMore },
      }));
      if (page.last) this.cursors.set(name, page.last);
    } catch { if (generation === this.generation) this.error.set('More records could not be loaded. The visible selection is incomplete. Please retry.'); }
    finally { this.busyCollections.delete(name); }
  }

  async setProgress(subjectId: string, state: AtlasProgressState, note: string): Promise<void> {
    if (!Object.hasOwn(ATLAS_PROGRESS_LABELS, state)) throw new Error('Choose a valid progression state.');
    await this.change('progress', subjectId, { subjectId, state, note: this.note(note), basis: 'self-report' });
  }

  async reviewEvidence(evidenceId: string, status: AtlasReviewStatus, note: string): Promise<void> {
    if (!Object.hasOwn(ATLAS_REVIEW_LABELS, status)) throw new Error('Choose a valid review decision.');
    await this.change('review', evidenceId, { evidenceId, status, note: this.note(note) });
  }

  async setSource(source: AtlasSourceInput): Promise<void> {
    await this.change('source', source.sourceId, {
      sourceId: source.sourceId, system: source.system, locator: source.locator,
      recordLocatorPrefixes: [...source.recordLocatorPrefixes], recordLocators: [...source.recordLocators], enabled: source.enabled,
    });
  }

  exportData(): void {
    const data = { schemaVersion: 1, kind: 'atlas-owner-export', exportedAt: new Date().toISOString(),
      coverage: Object.values(this.snapshot().hasMore).some(Boolean) ? 'loaded-selection-only' : 'loaded-collections',
      ...this.snapshot(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'civilization-atlas-export.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async readPage(name: AtlasCollection, after?: QueryDocumentSnapshot) {
    const uid = this.uid;
    if (!uid) throw new Error('Sign in to load Atlas.');
    const ref = this.client.collection(this.firestore, `users/${uid}/atlasData/workspace/${name}`);
    const pageSize = 50;
    const constraints = [this.client.orderBy(this.client.documentId()), ...(after ? [this.client.startAfter(after)] : []), this.client.limit(pageSize + 1)];
    const result = await this.client.getDocs(this.client.query(ref, ...constraints));
    const visible = result.docs.slice(0, pageSize);
    return { items: visible.map(item => ({ ...item.data(), id: item.id })), last: visible.at(-1), hasMore: result.docs.length > pageSize };
  }

  private note(value: string): string {
    if (typeof value !== 'string' || value.length > 2000) throw new Error('Keep the note within 2,000 characters.');
    return value.trim();
  }

  private async change(kind: 'progress' | 'review' | 'source', targetId: string, fields: Record<string, unknown>): Promise<void> {
    const uid = this.uid;
    if (!uid || this.auth.currentUser?.uid !== uid) throw new Error('Sign in to save your Atlas.');
    if (!atlasSafeId(targetId)) throw new Error('Invalid Atlas record.');
    if (this.saving()) throw new Error('Wait for the current save to finish.');
    const collectionName = kind === 'review' ? 'reviews' : kind === 'source' ? 'sources' : 'progress';
    const expectedRevision = this.snapshot()[collectionName].find(item => item.id === targetId)?.revision ?? 0;
    const ref = this.client.doc(this.firestore, `users/${uid}/atlasData/workspace/${collectionName}/${targetId}`);
    const eventId = `owner_${crypto.randomUUID()}`;
    const eventRef = this.client.doc(this.firestore, `users/${uid}/atlasData/workspace/events/${eventId}`);
    const createdAt = Date.now();
    this.saving.set(true); this.error.set(null);
    try {
      await this.client.runTransaction(this.firestore, async transaction => {
        const current = await transaction.get(ref);
        const before = current.exists() ? current.data() : null;
        if ((before?.['revision'] ?? 0) !== expectedRevision) throw new Error('ATLAS_REVISION_CONFLICT');
        if (this.auth.currentUser?.uid !== uid) throw new Error('ATLAS_ACCOUNT_CHANGED');
        const revision = expectedRevision + 1;
        const after = { schemaVersion: 1, ...fields, revision, updatedAt: createdAt, lastEventId: eventId };
        transaction.set(ref, after);
        transaction.set(eventRef, { schemaVersion: 1, eventId, kind, targetId, revision, createdAt, before, after });
      });
      if (this.uid === uid) await this.refresh();
    } catch (cause) {
      const message = cause instanceof Error && cause.message === 'ATLAS_REVISION_CONFLICT'
        ? 'This record changed elsewhere. Refresh Atlas before saving again.'
        : 'The change was not saved. Check your connection and permissions, then retry.';
      if (this.uid === uid) this.error.set(message);
      throw new Error(message);
    } finally { this.saving.set(false); }
  }
}
