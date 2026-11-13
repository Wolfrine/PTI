import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDocs, limit, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import {
  IntelligenceCapture, IntelligenceCaptureInput, IntelligenceStatus,
  canonicalIntelligenceUrl, intelligencePlatform, safeIntelligenceUrl,
} from './intelligence.models';

const PAGE_SIZE = 80;

@Injectable({ providedIn: 'root' })
export class IntelligenceService implements OnDestroy {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  readonly captures = signal<IntelligenceCapture[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = signal(false);
  private uid: string | null = null;
  private generation = 0;
  private readonly unsubscribe: () => void;

  constructor() {
    this.unsubscribe = onAuthStateChanged(this.auth, user => {
      if (this.uid === (user?.uid ?? null)) return;
      this.uid = user?.uid ?? null;
      this.generation++;
      this.captures.set([]);
      this.error.set(null);
      this.hasMore.set(false);
      if (this.uid) void this.refresh();
      else this.loading.set(false);
    });
  }

  ngOnDestroy(): void { this.generation++; this.unsubscribe(); }

  async refresh(): Promise<void> {
    const uid = this.uid;
    if (!uid) { this.loading.set(false); return; }
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    try {
      const ref = collection(this.firestore, `users/${uid}/intelligenceData/workspace/captures`);
      const snapshot = await getDocs(query(ref, orderBy('createdAt', 'desc'), limit(PAGE_SIZE + 1)));
      if (generation !== this.generation) return;
      this.hasMore.set(snapshot.docs.length > PAGE_SIZE);
      this.captures.set(snapshot.docs.slice(0, PAGE_SIZE).map(item => item.data() as IntelligenceCapture));
    } catch {
      if (generation === this.generation) this.error.set('The inbox could not be loaded. Check your connection and access, then refresh.');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  async capture(input: IntelligenceCaptureInput): Promise<{ id: string; duplicateOf: string }> {
    const uid = this.uid;
    if (!uid || this.auth.currentUser?.uid !== uid) throw new Error('Sign in to capture this item.');
    if (this.saving()) throw new Error('Please wait for the current save to finish.');
    const sourceUrl = safeIntelligenceUrl(input.sourceUrl);
    const title = input.title.trim().slice(0, 240);
    const sharedText = input.sharedText.trim().slice(0, 4000);
    const note = input.note.trim().slice(0, 2000);
    const projectHint = input.projectHint.trim().slice(0, 160);
    if (!sourceUrl && !sharedText && !note) throw new Error('Add a link, a shared message, or a note.');
    const canonicalUrl = canonicalIntelligenceUrl(sourceUrl);
    const dedupeBasis = canonicalUrl || sharedText.toLocaleLowerCase() || note.toLocaleLowerCase();
    this.saving.set(true);
    this.error.set(null);
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dedupeBasis));
      const dedupeKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const ref = collection(this.firestore, `users/${uid}/intelligenceData/workspace/captures`);
      const existing = await getDocs(query(ref, where('dedupeKey', '==', dedupeKey), limit(1)));
      if (this.auth.currentUser?.uid !== uid || this.uid !== uid) throw new Error('Account changed during capture. Please retry.');
      const duplicateOf = existing.docs[0]?.id ?? '';
      const id = `cap_${crypto.randomUUID().replace(/-/g, '')}`;
      const now = Date.now();
      const capture: IntelligenceCapture = {
        schemaVersion: 1, id, sourceUrl, canonicalUrl, dedupeKey,
        platform: intelligencePlatform(sourceUrl), sourceKind: input.sourceKind,
        title, sharedText, note, projectHint, status: 'received', duplicateOf,
        createdAt: now, updatedAt: now, revision: 1,
      };
      await setDoc(doc(ref, id), capture);
      if (this.uid === uid) await this.refresh();
      return { id, duplicateOf };
    } catch (cause) {
      const message = cause instanceof Error && ['Account changed during capture. Please retry.', 'Sign in to capture this item.'].includes(cause.message)
        ? cause.message : 'The capture could not be saved. Check your connection and permissions.';
      if (this.uid === uid) this.error.set(message);
      throw new Error(message);
    } finally { this.saving.set(false); }
  }

  async setStatus(item: IntelligenceCapture, status: IntelligenceStatus): Promise<void> {
    const uid = this.uid;
    if (!uid || this.auth.currentUser?.uid !== uid) throw new Error('Sign in to update this item.');
    if (!['received', 'organized', 'archived'].includes(status)) throw new Error('Choose a valid inbox state.');
    if (item.status === status) return;
    if (this.saving()) throw new Error('Please wait for the current save to finish.');
    this.saving.set(true);
    this.error.set(null);
    try {
      await updateDoc(doc(this.firestore, `users/${uid}/intelligenceData/workspace/captures/${item.id}`), {
        status, revision: item.revision + 1, updatedAt: Date.now(),
      });
      if (this.uid === uid) await this.refresh();
    } catch {
      if (this.uid === uid) this.error.set('The item may have changed elsewhere. Refresh the inbox and try again.');
      throw new Error('Could not update this capture.');
    } finally { this.saving.set(false); }
  }
}
