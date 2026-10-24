import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore } from '@angular/fire/firestore';
import { doc, onSnapshot } from 'firebase/firestore';
import { Observable, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

export type ReadingStatus = 'ok' | 'error' | 'unavailable' | 'unsupported';
export interface UsageWindow {
  id: 'primary' | 'secondary';
  usedPercent: number | null;
  remainingPercent: number | null;
  windowDurationMins: number | null;
  resetsAt: number | null;
}
export interface UsageBucket { limitId: string; label: string; windows: UsageWindow[]; }
export interface ReadingSection { status: ReadingStatus; lastSuccessAt: string | null; }
export interface UsageDocument {
  allowance: ReadingSection & { buckets: UsageBucket[] };
  daily: ReadingSection & { latest: { startDate: string; tokens: number } | null };
}
export interface UsageState {
  status: 'loading' | 'ready' | 'unconnected' | 'unavailable';
  reading: UsageDocument | null;
  fromCache: boolean;
}

const statuses: ReadingStatus[] = ['ok', 'error', 'unavailable', 'unsupported'];
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const percent = (value: unknown): number | null => finite(value) && value >= 0 ? value : null;
const timestamp = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const section = (value: Record<string, any>): ReadingSection => ({
  status: statuses.includes(value['status']) ? value['status'] : 'unavailable',
  lastSuccessAt: timestamp(value['lastSuccessAt']),
});

// Cloud values are untrusted. Null/malformed fields stay unavailable, never zero.
export function readUsageDocument(value: unknown): UsageDocument | null {
  const data = record(value);
  if (data['schemaVersion'] !== 1 || data['source'] !== 'codex-app-server') return null;
  const allowance = record(data['allowance']);
  const daily = record(data['daily']);
  const latest = record(daily['latest']);
  const validDate = typeof latest['startDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(latest['startDate'])
    && Number.isFinite(Date.parse(latest['startDate'])) && new Date(latest['startDate']).toISOString().slice(0, 10) === latest['startDate'];
  return {
    allowance: { ...section(allowance), buckets: (Array.isArray(allowance['buckets']) ? allowance['buckets'] : []).map((item: unknown) => {
      const bucket = record(item);
      return {
        limitId: typeof bucket['limitId'] === 'string' ? bucket['limitId'] : '',
        label: typeof bucket['label'] === 'string' && bucket['label'].trim() ? bucket['label'].slice(0, 100) : 'Codex allowance',
        windows: (Array.isArray(bucket['windows']) ? bucket['windows'] : []).map((item: unknown) => {
          const window = record(item);
          const used = percent(window['usedPercent']);
          return {
            id: window['id'] === 'secondary' ? 'secondary' as const : 'primary' as const,
            usedPercent: used,
            remainingPercent: used === null ? null : Math.max(0, Math.min(100, Math.round((100 - used) * 100) / 100)),
            windowDurationMins: finite(window['windowDurationMins']) && window['windowDurationMins'] > 0 ? window['windowDurationMins'] : null,
            resetsAt: finite(window['resetsAt']) && window['resetsAt'] > 0 ? window['resetsAt'] : null,
          };
        }),
      };
    }) },
    daily: { ...section(daily), latest: validDate && Number.isSafeInteger(latest['tokens']) && latest['tokens'] >= 0
      ? { startDate: latest['startDate'], tokens: latest['tokens'] } : null },
  };
}

@Injectable({ providedIn: 'root' })
export class CodexUsageService {
  constructor(private readonly firestore: Firestore, private readonly auth: AuthService,
    private readonly zone: NgZone, @Inject(PLATFORM_ID) private readonly platform: object) {}

  watch(): Observable<UsageState> {
    if (!isPlatformBrowser(this.platform)) return of({ status: 'loading', reading: null, fromCache: false });
    return this.auth.user$.pipe(
      map(user => user?.uid as string | undefined), distinctUntilChanged(),
      switchMap(uid => !uid ? of<UsageState>({ status: 'unconnected', reading: null, fromCache: false })
        : new Observable<UsageState>(subscriber => {
          subscriber.next({ status: 'loading', reading: null, fromCache: false });
          return onSnapshot(doc(this.firestore, `users/${uid}/codexProjects/codex-usage`), { includeMetadataChanges: true },
            snapshot => this.zone.run(() => {
              const reading = snapshot.exists() ? readUsageDocument(snapshot.data()) : null;
              subscriber.next({ status: snapshot.exists() ? reading ? 'ready' : 'unavailable' : 'unconnected', reading, fromCache: snapshot.metadata.fromCache });
            }),
            () => this.zone.run(() => subscriber.next({ status: 'unavailable', reading: null, fromCache: false })));
        })));
  }
}
