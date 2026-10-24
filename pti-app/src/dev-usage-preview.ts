// Local-only render harness. This entry is never imported by the production app.
import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NewHomeComponent } from './app/components/new-home/new-home.component';
import { CodexUsageService, UsageState } from './app/services/codex-usage.service';

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

@Component({
  selector: 'app-root', standalone: true, imports: [NewHomeComponent],
  template: `<aside style="font:12px Arial;padding:10px 16px;background:#ede2d2;color:#453a30;position:relative;z-index:99">LOCAL TEST FIXTURE · {{state}} · synthetic readings · no authentication or database access</aside><app-new-home />`,
})
class UsagePreviewComponent { readonly state = fixture; }

bootstrapApplication(UsagePreviewComponent, {
  providers: [provideRouter([]), { provide: CodexUsageService, useValue: { watch: () => of(reading) } }],
}).catch(error => console.error(error));
