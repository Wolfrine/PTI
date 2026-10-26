// Local-only render harness. This entry is never imported by the production app.
import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { NewHomeComponent } from './app/components/new-home/new-home.component';
import { CodexUsageService, UsageState } from './app/services/codex-usage.service';
import { GtopHostService, GtopHostReading, GtopHostStatus } from './app/services/gtop-host.service';
import { OnePieceHostService, OnePieceHostReading, OnePieceHostStatus } from './app/services/one-piece-host.service';

const query = new URLSearchParams(location.search);
const fixture = query.get('state') ?? 'fresh';
const now = Date.now();
const success = new Date(now - (fixture === 'stale' ? 20 * 60000 : 60000)).toISOString();
const reading: UsageState = {
  status: 'ready', fromCache: fixture === 'cached' || fixture === 'offline',
  reading: {
    allowance: { status: 'ok', lastSuccessAt: success, buckets: [{ limitId: 'codex', label: 'Codex', windows: [
      { id: 'primary', usedPercent: 37, remainingPercent: 63, windowDurationMins: 10080, resetsAt: Math.floor(now / 1000) + (fixture === 'expired' ? -60 : 207000) },
    ] }] },
    daily: { status: 'ok', lastSuccessAt: success, latest: { startDate: '2026-10-23', tokens: 1234567 } },
  },
};
if (fixture === 'multiple' || fixture === 'long') reading.reading!.allowance.buckets[0].windows.push({ id: 'secondary', usedPercent: 82.5, remainingPercent: 17.5, windowDurationMins: 300, resetsAt: Math.floor(now / 1000) + 8300 });
if (fixture === 'long') reading.reading!.allowance.buckets[0].label = 'Codex review and extended account allowance';
if (fixture === 'over') { const window = reading.reading!.allowance.buckets[0].windows[0]; window.usedPercent = 120; window.remainingPercent = 0; }
if (fixture === 'unsupported') reading.reading!.daily = { status: 'unsupported', lastSuccessAt: null, latest: null };
if (fixture === 'partial') reading.reading!.daily = { status: 'error', lastSuccessAt: success, latest: null };
if (fixture === 'unavailable') { reading.reading!.allowance = { status: 'unavailable', lastSuccessAt: null, buckets: [] }; reading.reading!.daily = { status: 'unavailable', lastSuccessAt: null, latest: null }; }
if (['loading', 'unconnected', 'error'].includes(fixture)) { reading.status = fixture === 'error' ? 'unavailable' : fixture as 'loading' | 'unconnected'; reading.reading = null; }
if (fixture === 'offline') Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
const hostFixture = query.get('host') ?? 'offline';
const hostService: GtopHostStatus = {
  workerId: 'sachit-windows', state: hostFixture === 'ready' || hostFixture === 'idle' ? 'ready' : hostFixture === 'starting' ? 'starting' : hostFixture === 'failed' ? 'failed' : hostFixture === 'starter-offline' ? 'starter_offline' : 'offline',
  starter: { state: hostFixture === 'starter-offline' ? 'offline' : 'online', lastSeenAt: success },
  worker: { state: ['ready', 'idle'].includes(hostFixture) ? 'ready' : 'offline', modelReady: hostFixture === 'ready', lastSeenAt: success },
  request: null, canStart: ['offline', 'failed'].includes(hostFixture),
};
const hostReading = new BehaviorSubject<GtopHostReading>({ status: hostFixture === 'hidden' ? 'hidden' : hostFixture === 'loading' ? 'loading' : hostFixture === 'error' ? 'unavailable' : 'ready', service: ['hidden', 'loading', 'error'].includes(hostFixture) ? null : hostService, checkedAt: success });
const hostPreview = {
  watch: () => hostReading.asObservable(),
  refresh: async () => hostReading.value,
  start: async () => {
    const next: GtopHostReading = { status: 'ready', service: { ...hostService, state: 'starting', canStart: false }, checkedAt: new Date().toISOString() };
    hostReading.next(next);
    setTimeout(() => hostReading.next({ ...next, service: { ...hostService, state: 'ready', canStart: false, worker: { ...hostService.worker, state: 'ready', modelReady: false } } }), 8000);
    return next;
  },
};
const onePieceFixture = query.get('onePiece') ?? 'hidden';
const onePieceService: OnePieceHostStatus = {
  workerId: 'sachit-windows',
  state: onePieceFixture === 'ready' ? 'ready' : onePieceFixture === 'starting' ? 'starting' : onePieceFixture === 'failed' ? 'failed' : onePieceFixture === 'starter-offline' ? 'starter_offline' : 'offline',
  starter: { state: onePieceFixture === 'starter-offline' ? 'offline' : 'online', lastSeenAt: success },
  companion: { state: onePieceFixture === 'ready' ? 'ready' : 'offline', lastSeenAt: success },
  request: null, canStart: ['offline', 'failed'].includes(onePieceFixture),
};
const onePieceReading = new BehaviorSubject<OnePieceHostReading>({ status: onePieceFixture === 'hidden' ? 'hidden' : onePieceFixture === 'loading' ? 'loading' : onePieceFixture === 'error' ? 'unavailable' : 'ready', service: ['hidden', 'loading', 'error'].includes(onePieceFixture) ? null : onePieceService, checkedAt: success });
const onePiecePreview = {
  watch: () => onePieceReading.asObservable(),
  refresh: async () => onePieceReading.value,
  start: async () => {
    const next: OnePieceHostReading = { status: 'ready', service: { ...onePieceService, state: 'starting', canStart: false }, checkedAt: new Date().toISOString() };
    onePieceReading.next(next);
    setTimeout(() => onePieceReading.next({ ...next, service: { ...onePieceService, state: 'ready', canStart: false, companion: { ...onePieceService.companion, state: 'ready' } } }), 8000);
    return next;
  },
};

@Component({
  selector: 'app-root', standalone: true, imports: [NewHomeComponent],
  template: `<aside style="font:12px Arial;padding:10px 16px;background:#ede2d2;color:#453a30;position:relative;z-index:99">LOCAL TEST FIXTURE · {{state}} · assistant {{host}} · One Piece {{onePiece}} · synthetic readings · no authentication or database access</aside><app-new-home />`,
})
class UsagePreviewComponent { readonly state = fixture; readonly host = hostFixture; readonly onePiece = onePieceFixture; }

bootstrapApplication(UsagePreviewComponent, {
  providers: [provideRouter([]), { provide: CodexUsageService, useValue: { watch: () => of(reading) } }, { provide: GtopHostService, useValue: hostPreview }, { provide: OnePieceHostService, useValue: onePiecePreview }],
}).catch(error => console.error(error));
