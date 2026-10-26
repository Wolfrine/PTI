import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, firstValueFrom, of, switchMap, take } from 'rxjs';
import { AuthService } from './auth.service';
import { GTOP_HOST_OWNER } from './gtop-host.service';

const API = 'https://us-central1-pti-app-2ab59.cloudfunctions.net/onePieceHost';
export interface OnePieceHostStatus {
  workerId: 'sachit-windows';
  state: 'ready' | 'offline' | 'starting' | 'failed' | 'starter_offline';
  starter: { state: 'online' | 'offline'; lastSeenAt: string | null };
  companion: { state: 'ready' | 'offline'; lastSeenAt: string | null };
  request: { id: string; state: string; requestedAt: string; expiresAt: string; errorCode: string | null } | null;
  canStart: boolean;
}
export interface OnePieceHostReading {
  status: 'hidden' | 'loading' | 'ready' | 'unavailable';
  service: OnePieceHostStatus | null;
  checkedAt: string | null;
}

// This panel is a convenience. The gateway independently authorizes every request.
@Injectable({ providedIn: 'root' })
export class OnePieceHostService {
  constructor(private readonly auth: AuthService, @Inject(PLATFORM_ID) private readonly platform: object) {}

  watch(): Observable<OnePieceHostReading> {
    if (!isPlatformBrowser(this.platform)) return of({ status: 'hidden', service: null, checkedAt: null });
    return this.auth.user$.pipe(switchMap(user => user?.uid !== GTOP_HOST_OWNER
      ? of<OnePieceHostReading>({ status: 'hidden', service: null, checkedAt: null })
      : new Observable<OnePieceHostReading>(subscriber => {
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
            const reading = await this.request(user, '/status', undefined, controller.signal);
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

  async refresh(): Promise<OnePieceHostReading> { return this.request(await this.owner(), '/status'); }
  async start(clientRequestId: string): Promise<OnePieceHostReading> {
    return this.request(await this.owner(), '/start', { clientRequestId });
  }
  private async owner() {
    const user = await firstValueFrom(this.auth.user$.pipe(take(1)));
    if (user?.uid !== GTOP_HOST_OWNER) throw new Error('Owner access required.');
    return user;
  }
  private async request(user: { uid: string; getIdToken(): Promise<string> }, path: string, body?: unknown, signal?: AbortSignal): Promise<OnePieceHostReading> {
    const account = new AbortController();
    const current = this.auth.user$.subscribe(value => { if (value?.uid !== user.uid) account.abort(); });
    const deadline = AbortSignal.any([account.signal, AbortSignal.timeout(20000), ...(signal ? [signal] : [])]);
    try {
      const token = await user.getIdToken();
      deadline.throwIfAborted();
      const response = await fetch(API + path, {
        method: body ? 'POST' : 'GET', signal: deadline,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in again.' : 'One Piece status could not be checked.');
      const result = await response.json();
      deadline.throwIfAborted();
      if (!result.service || result.service.workerId !== 'sachit-windows'
        || !['ready', 'offline', 'starting', 'failed', 'starter_offline'].includes(result.service.state)
        || !['online', 'offline'].includes(result.service.starter?.state)
        || !['ready', 'offline'].includes(result.service.companion?.state)
        || typeof result.service.canStart !== 'boolean') throw new Error('One Piece status is unavailable.');
      return { status: 'ready', service: result.service, checkedAt: new Date().toISOString() };
    } finally { current.unsubscribe(); }
  }
}
