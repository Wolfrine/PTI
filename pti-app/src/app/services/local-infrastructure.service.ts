import { isPlatformBrowser } from '@angular/common';
import { Injectable, NgZone, PLATFORM_ID, inject } from '@angular/core';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';
import { Observable, catchError, distinctUntilChanged, map, of, shareReplay, switchMap, take } from 'rxjs';
import { AuthService } from './auth.service';

export interface Capacity {
  usedBytes: number;
  totalBytes: number;
}

export type DriveLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

export type WorkerStatus = 'available' | 'idle' | 'working' | 'offline' | 'unknown';
export type WorkerEvidence = 'health' | 'heartbeat' | 'process' | 'task' | 'missing' | 'unavailable';
export type WorkerCondition = 'sign-in-required' | 'reported-error' | 'heartbeat-overdue';

export interface LocalWorker {
  id: string;
  status: WorkerStatus;
  lastSeenAt: number | null;
  evidence: WorkerEvidence;
  condition: WorkerCondition | null;
  queued: number | null;
  running: number | null;
  components: { id: string; observed: boolean | null }[];
}

export interface InfrastructureSample {
  at: number;
  cpuPercent: number | null;
  gpuPercent: number | null;
  memoryPercent: number | null;
}

export interface LocalInfrastructureSnapshot {
  collectedAt: number;
  workstation: {
    cpuPercent: number | null;
    memory: Capacity | null;
    gpuPercent: number | null;
    vram: Capacity | null;
    disks: Partial<Record<DriveLetter, Capacity>>;
    uptimeSeconds: number | null;
    cpuTemperatureC: number | null;
    gpuTemperatureC: number | null;
    network: { receivedBytesPerSecond: number; sentBytesPerSecond: number } | null;
  };
  workers: LocalWorker[];
  history: InfrastructureSample[];
}

export type LocalInfrastructureState =
  | { status: 'ready'; snapshot: LocalInfrastructureSnapshot; fromCache: boolean }
  | { status: 'loading' | 'unconnected' | 'unavailable'; fromCache: boolean };

export const PTI_INFRASTRUCTURE_OWNER = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';

const documentPath = (uid: string) => ['users', uid, 'resourceUsage', 'local-infrastructure'] as const;

const workerStatuses: readonly WorkerStatus[] = ['available', 'idle', 'working', 'offline', 'unknown'];
const workerEvidence: readonly WorkerEvidence[] = ['health', 'heartbeat', 'process', 'task', 'missing', 'unavailable'];
const workerConditions: readonly WorkerCondition[] = ['sign-in-required', 'reported-error', 'heartbeat-overdue'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function numberInRange(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function percent(value: unknown): number | null {
  return numberInRange(value, 0, 100);
}

function timestamp(value: unknown): number | null {
  return numberInRange(value, 1, 8_640_000_000_000_000);
}

function readCapacity(value: unknown): Capacity | null {
  const data = record(value);
  const totalBytes = numberInRange(data['totalBytes'], 1);
  const usedBytes = numberInRange(data['usedBytes'], 0, totalBytes ?? 0);
  return totalBytes === null || usedBytes === null ? null : { usedBytes, totalBytes };
}

function readDisks(value: unknown): LocalInfrastructureSnapshot['workstation']['disks'] {
  const disks: LocalInfrastructureSnapshot['workstation']['disks'] = {};
  for (const [letter, entry] of Object.entries(record(value))) {
    if (!/^[A-Z]$/.test(letter)) continue;
    const capacity = readCapacity(entry);
    if (capacity) disks[letter as DriveLetter] = capacity;
  }
  return disks;
}

function readNetwork(value: unknown): LocalInfrastructureSnapshot['workstation']['network'] {
  const data = record(value);
  const receivedBytesPerSecond = numberInRange(data['receivedBytesPerSecond'], 0);
  const sentBytesPerSecond = numberInRange(data['sentBytesPerSecond'], 0);
  return receivedBytesPerSecond === null || sentBytesPerSecond === null
    ? null
    : { receivedBytesPerSecond, sentBytesPerSecond };
}

function readId(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 48 ? value : null;
}

function readEnum<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.find(option => option === value) ?? fallback;
}

function readWorker(value: unknown, collectedAt: number): LocalWorker | null {
  const data = record(value);
  const id = readId(data['id']);
  if (!id) return null;
  const lastSeenAt = timestamp(data['lastSeenAt']);
  const components = new Map<string, LocalWorker['components'][number]>();

  for (const item of Array.isArray(data['components']) ? data['components'] : []) {
    const component = record(item);
    const componentId = readId(component['id']);
    if (componentId && !components.has(componentId)) {
      const observed = component['observed'];
      components.set(componentId, { id: componentId, observed: typeof observed === 'boolean' ? observed : null });
    }
  }

  return {
    id,
    status: readEnum(data['status'], workerStatuses, 'unknown'),
    lastSeenAt: lastSeenAt !== null && lastSeenAt <= collectedAt ? lastSeenAt : null,
    evidence: readEnum(data['evidence'], workerEvidence, 'unavailable'),
    condition: workerConditions.find(condition => condition === data['condition']) ?? null,
    queued: Number.isSafeInteger(data['queued']) ? numberInRange(data['queued'], 0) : null,
    running: Number.isSafeInteger(data['running']) ? numberInRange(data['running'], 0) : null,
    components: [...components.values()],
  };
}

function readSnapshot(value: unknown): LocalInfrastructureSnapshot | null {
  const data = record(value);
  const collectedAt = timestamp(data['collectedAt']);
  if (data['schemaVersion'] !== 1 || collectedAt === null || !isRecord(data['workstation']) ||
      !Array.isArray(data['workers']) || !Array.isArray(data['history'])) return null;

  const system = data['workstation'];
  const workers = new Map<string, LocalWorker>();
  const history = new Map<number, InfrastructureSample>();

  for (const item of data['workers']) {
    const worker = readWorker(item, collectedAt);
    if (worker && !workers.has(worker.id)) workers.set(worker.id, worker);
  }

  for (const item of data['history'].slice(-13)) {
    const point = record(item);
    const at = timestamp(point['at']);
    if (at !== null && at <= collectedAt) {
      history.set(at, {
        at,
        cpuPercent: percent(point['cpuPercent']),
        gpuPercent: percent(point['gpuPercent']),
        memoryPercent: percent(point['memoryPercent']),
      });
    }
  }

  return {
    collectedAt,
    workstation: {
      cpuPercent: percent(system['cpuPercent']),
      memory: readCapacity(system['memory']),
      gpuPercent: percent(system['gpuPercent']),
      vram: readCapacity(system['vram']),
      disks: readDisks(system['disks']),
      uptimeSeconds: numberInRange(system['uptimeSeconds'], 0),
      cpuTemperatureC: numberInRange(system['cpuTemperatureC'], -100, 200),
      gpuTemperatureC: numberInRange(system['gpuTemperatureC'], -100, 200),
      network: readNetwork(system['network']),
    },
    workers: [...workers.values()],
    history: [...history.values()].sort((first, second) => first.at - second.at),
  };
}

function documentState(snapshot: { exists(): boolean; data(): unknown }, fromCache: boolean): LocalInfrastructureState {
  if (!snapshot.exists()) return { status: fromCache ? 'loading' : 'unconnected', fromCache };
  const reading = readSnapshot(snapshot.data());
  return reading
    ? { status: 'ready', snapshot: reading, fromCache }
    : { status: 'unavailable', fromCache };
}

@Injectable({ providedIn: 'root' })
export class LocalInfrastructureService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);
  private readonly platform = inject(PLATFORM_ID);

  private loadOnce(): Observable<LocalInfrastructureState> {
    if (!isPlatformBrowser(this.platform)) return of({ status: 'loading', fromCache: false });

    return this.auth.user$.pipe(
      take(1),
      switchMap(async (user): Promise<LocalInfrastructureState> => {
        if (!user?.uid) return { status: 'unconnected', fromCache: false };
        // Lite uses a server-only document read with the same Firebase app and its auth session.
        const lite = await import('firebase/firestore/lite');
        const ref = lite.doc(lite.getFirestore(this.firestore.app), ...documentPath(user.uid));
        return documentState(await lite.getDoc(ref), false);
      }),
      catchError(() => of<LocalInfrastructureState>({ status: 'unavailable', fromCache: false })),
    );
  }

  watchHome(): Observable<LocalInfrastructureState> {
    if (!isPlatformBrowser(this.platform)) return of({ status: 'loading', fromCache: false });
    return this.auth.user$.pipe(
      map(user => user?.uid as string | undefined),
      distinctUntilChanged(),
      switchMap(uid => uid === PTI_INFRASTRUCTURE_OWNER ? this.watch() : this.loadOnce()),
    );
  }

  watch(): Observable<LocalInfrastructureState> {
    return isPlatformBrowser(this.platform) ? this.snapshot$ : of({ status: 'loading', fromCache: false });
  }

  private readonly snapshot$ = this.auth.user$.pipe(
      map(user => user?.uid as string | undefined),
      distinctUntilChanged(),
      switchMap(uid => {
        if (!uid) return of<LocalInfrastructureState>({ status: 'unconnected', fromCache: false });
        return new Observable<LocalInfrastructureState>(subscriber => {
          subscriber.next({ status: 'loading', fromCache: false });
          const ref = doc(this.firestore, ...documentPath(uid));
          return onSnapshot(ref, { includeMetadataChanges: true }, snapshot => this.zone.run(() => {
            const fromCache = snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites;
            subscriber.next(documentState(snapshot, fromCache));
          }), () => this.zone.run(() => subscriber.next({ status: 'unavailable', fromCache: false })));
        });
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
}
