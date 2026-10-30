import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { doc, onSnapshot } from 'firebase/firestore';
import { Observable, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

export type PlatformSectionStatus = 'ok' | 'partial' | 'not-connected' | 'error';

export interface PlatformUsageReading {
  collectedAt: string;
  github: {
    status: PlatformSectionStatus;
    period: string;
    billedActionsMinutes: number | null;
    billedActionsUsd: number | null;
    workflowRuns24h: number | null;
    failedRuns24h: number | null;
    workflowRepoScope: string;
  };
  firebase: {
    status: PlatformSectionStatus;
    projects: Array<{
      projectId: string;
      status: Exclude<PlatformSectionStatus, 'partial'>;
      reads24h: number | null;
      writes24h: number | null;
      deletes24h: number | null;
    }>;
  };
}

export interface PlatformUsageState {
  status: 'loading' | 'ready' | 'unconnected' | 'unavailable';
  reading: PlatformUsageReading | null;
  fromCache: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const status = (value: unknown): PlatformSectionStatus =>
  value === 'ok' || value === 'partial' || value === 'not-connected' || value === 'error' ? value : 'error';
const amount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const count = (value: unknown): number | null =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;

// Never turn absent API metrics into zero. Cached values are source-labelled, not billable truth.
export function readPlatformUsageDocument(value: unknown): PlatformUsageReading | null {
  const data = record(value);
  if (data['schemaVersion'] !== 1 || data['source'] !== 'pti-platform-usage') return null;
  if (typeof data['collectedAt'] !== 'string' || !Number.isFinite(Date.parse(data['collectedAt']))) return null;
  const github = record(data['github']);
  const firebase = record(data['firebase']);
  return {
    collectedAt: data['collectedAt'],
    github: {
      status: status(github['status']),
      period: typeof github['period'] === 'string' && /^\d{4}-\d{2}$/.test(github['period']) ? github['period'] : '',
      billedActionsMinutes: amount(github['billedActionsMinutes']),
      billedActionsUsd: amount(github['billedActionsUsd']),
      workflowRuns24h: count(github['workflowRuns24h']),
      failedRuns24h: count(github['failedRuns24h']),
      workflowRepoScope: github['workflowRepoScope'] === 'Wolfrine/PTI' ? 'Wolfrine/PTI' : '',
    },
    firebase: {
      status: status(firebase['status']),
      projects: (Array.isArray(firebase['projects']) ? firebase['projects'] : []).slice(0, 30).flatMap(item => {
        const project = record(item);
        const projectId = project['projectId'];
        if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{3,40}$/.test(projectId)) return [];
        const state = status(project['status']);
        return [{
          projectId,
          status: state === 'partial' ? 'error' as const : state,
          reads24h: count(project['reads24h']),
          writes24h: count(project['writes24h']),
          deletes24h: count(project['deletes24h']),
        }];
      }),
    },
  };
}

@Injectable({ providedIn: 'root' })
export class PlatformUsageService {
  constructor(private readonly firestore: Firestore, private readonly auth: AuthService,
    private readonly zone: NgZone, @Inject(PLATFORM_ID) private readonly platform: object) {}

  watch(): Observable<PlatformUsageState> {
    if (!isPlatformBrowser(this.platform)) return of({ status: 'loading', reading: null, fromCache: false });
    return this.auth.user$.pipe(
      map(user => user?.uid as string | undefined), distinctUntilChanged(),
      switchMap(uid => !uid ? of<PlatformUsageState>({ status: 'unconnected', reading: null, fromCache: false })
        : new Observable<PlatformUsageState>(subscriber => {
          subscriber.next({ status: 'loading', reading: null, fromCache: false });
          return onSnapshot(doc(this.firestore, `users/${uid}/resourceUsage/current`), { includeMetadataChanges: true },
            snapshot => this.zone.run(() => {
              const reading = snapshot.exists() ? readPlatformUsageDocument(snapshot.data()) : null;
              subscriber.next({ status: snapshot.exists() ? reading ? 'ready' : 'unavailable' : 'unconnected',
                reading, fromCache: snapshot.metadata.fromCache });
            }),
            () => this.zone.run(() => subscriber.next({ status: 'unavailable', reading: null, fromCache: false })));
        })));
  }
}
