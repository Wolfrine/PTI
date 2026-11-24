import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Observable, concat, distinctUntilChanged, map, of, switchMap, timer } from 'rxjs';
import { AuthService } from './auth.service';
import { localInfrastructureFreshnessMs } from './local-infrastructure-presentation';
import { LocalInfrastructureService, LocalInfrastructureState, PTI_INFRASTRUCTURE_OWNER } from './local-infrastructure.service';

export { PTI_INFRASTRUCTURE_OWNER as GTOP_HOST_OWNER } from './local-infrastructure.service';

export type GtopHostReading = 'hidden' | 'loading' | 'unavailable' | 'stale' | 'available' | 'working' | 'offline';

function readHost(state: LocalInfrastructureState): Observable<GtopHostReading> {
  if (state.status === 'loading') return of('loading');
  if (state.status !== 'ready') return of('unavailable');
  if (state.fromCache) return of('stale');

  const { collectedAt, workers } = state.snapshot;
  const worker = workers.find(entry => entry.id === 'gt-papers');
  let reading: GtopHostReading = 'unavailable';
  let observedAt = collectedAt;

  if (worker?.evidence === 'heartbeat' && worker.lastSeenAt !== null &&
      (worker.status === 'available' || worker.status === 'working')) {
    reading = worker.status;
    observedAt = worker.lastSeenAt;
  } else if (worker?.status === 'offline' && worker.evidence === 'missing') {
    reading = 'offline';
  }

  const age = Date.now() - observedAt;
  if (age < 0 || age >= localInfrastructureFreshnessMs) return of('stale');
  // Expire the displayed reading locally even if the PC stops publishing.
  return concat(of(reading), timer(localInfrastructureFreshnessMs - age).pipe(map((): GtopHostReading => 'stale')));
}

@Injectable({ providedIn: 'root' })
export class GtopHostService {
  private readonly auth = inject(AuthService);
  private readonly infrastructure = inject(LocalInfrastructureService);
  private readonly platform = inject(PLATFORM_ID);

  watch(): Observable<GtopHostReading> {
    if (!isPlatformBrowser(this.platform)) return of('hidden');
    return this.auth.user$.pipe(
      map(user => user?.uid === PTI_INFRASTRUCTURE_OWNER),
      distinctUntilChanged(),
      switchMap(isOwner => isOwner ? this.infrastructure.watch().pipe(switchMap(readHost)) : of<GtopHostReading>('hidden')),
      distinctUntilChanged(),
    );
  }
}
