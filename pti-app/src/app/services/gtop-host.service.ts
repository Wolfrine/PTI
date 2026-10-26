import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, firstValueFrom, of, switchMap, take } from 'rxjs';
import { AuthService } from './auth.service';

export const GTOP_HOST_OWNER = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
const API = 'https://gtop-question-papers.web.app/api';
export interface GtopHostStatus {
  workerId: string;
  state: 'ready' | 'offline' | 'starting' | 'failed' | 'starter_offline';
  starter: { state: 'online' | 'offline'; lastSeenAt: string | null };
  worker: { state: string; lastSeenAt: string | null; modelReady: boolean };
  request: { id: string; state: string; requestedAt: string; expiresAt: string; errorCode: string | null } | null;
  canStart: boolean;
}
export interface GtopHostReading {
  status: 'hidden' | 'loading' | 'ready' | 'unavailable';
  service: GtopHostStatus | null;
  checkedAt: string | null;
}

// The owner-only UI is convenience; the gateway independently verifies the PTI token.
@Injectable({ providedIn: 'root' })
export class GtopHostService {
  constructor(private readonly auth: AuthService, @Inject(PLATFORM_ID) private readonly platform: object) {}

  watch(): Observable<GtopHostReading> {
    if (!isPlatformBrowser(this.platform)) return of({ status: 'hidden', service: null, checkedAt: null });
    return this.auth.user$.pipe(switchMap(user => user?.uid !== GTOP_HOST_OWNER
      ? of<GtopHostReading>({ status: 'hidden', service: null, checkedAt: null })
      : new Observable<GtopHostReading>(subscriber => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let controller: AbortController | undefined;
        let disposed = false;
        let generation = 0;
        const poll = async () => {
          if (disposed || document.hidden) return;
          const current = ++generation;
          controller = new AbortController();
          let starting = false;
          try {
            const reading = await this.request(user, '/host/status', undefined, controller.signal);
            if (disposed || document.hidden || current !== generation) return;
            starting = reading.service?.state === 'starting';
            subscriber.next(reading);
          } catch {
            if (!disposed && !document.hidden && current === generation) subscriber.next({ status: 'unavailable', service: null, checkedAt: null });
          } finally {
            if (current === generation) {
              controller = undefined;
              if (!disposed && !document.hidden) timer = setTimeout(poll, starting ? 5000 : 20000);
            }
          }
        };
        const visibility = () => {
          clearTimeout(timer);
          generation++;
          controller?.abort();
          if (!document.hidden) void poll();
        };
        subscriber.next({ status: 'loading', service: null, checkedAt: null });
        document.addEventListener('visibilitychange', visibility);
        void poll();
        return () => { disposed = true; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visibility); };
      })));
  }

  async refresh(): Promise<GtopHostReading> { return this.request(await this.owner(), '/host/status'); }
  async start(clientRequestId: string): Promise<GtopHostReading> {
    return this.request(await this.owner(), '/host/start', { clientRequestId });
  }
  private async owner() {
    const user = await firstValueFrom(this.auth.user$.pipe(take(1)));
    if (user?.uid !== GTOP_HOST_OWNER) throw new Error('Owner access required.');
    return user;
  }
  private async request(user: { getIdToken(): Promise<string> }, path: string, body?: unknown, signal?: AbortSignal): Promise<GtopHostReading> {
    const token = await user.getIdToken();
    const response = await fetch(API + path, {
      method: body ? 'POST' : 'GET', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in again.' : 'Assistant status could not be checked.');
    const result = await response.json();
    if (!result.service || !['ready', 'offline', 'starting', 'failed', 'starter_offline'].includes(result.service.state)
      || !['online', 'offline'].includes(result.service.starter?.state)
      || !['ready', 'loading', 'busy', 'offline'].includes(result.service.worker?.state)
      || typeof result.service.worker.modelReady !== 'boolean' || typeof result.service.canStart !== 'boolean') throw new Error('Assistant status is unavailable.');
    return { status: 'ready', service: result.service, checkedAt: new Date().toISOString() };
  }
}
