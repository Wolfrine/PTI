import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { Subscription } from 'rxjs';
import { CodexUsageService, ReadingSection, UsageState, UsageWindow } from '../../services/codex-usage.service';

export const USAGE_STALE_MS = 15 * 60 * 1000;
export function readingStale(section: ReadingSection, now: number): boolean {
  return !section.lastSuccessAt || now - Date.parse(section.lastSuccessAt) >= USAGE_STALE_MS;
}
export function windowLabel(window: UsageWindow): string {
  const mins = window.windowDurationMins;
  if (mins === null) return window.id === 'primary' ? 'Primary window' : 'Secondary window';
  if (mins === 10080) return 'Weekly allowance';
  if (mins % 1440 === 0) return `${mins / 1440}-day allowance`;
  if (mins % 60 === 0) return `${mins / 60}-hour allowance`;
  return `${mins}-minute allowance`;
}
export function resetLabel(resetsAt: number | null, now: number): string {
  if (resetsAt === null) return 'Reset time unavailable';
  const minutes = Math.ceil((resetsAt * 1000 - now) / 60000);
  if (minutes <= 0) return 'Awaiting updated allowance';
  if (minutes >= 1440) return `Resets in ${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h`;
  if (minutes >= 60) return `Resets in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `Resets in ${minutes}m`;
}

@Component({
  selector: 'app-new-codex-usage', standalone: true, imports: [CommonModule],
  templateUrl: './new-codex-usage.component.html', styleUrl: './new-codex-usage.component.scss',
})
export class NewCodexUsageComponent implements OnInit, OnDestroy {
  state: UsageState = { status: 'loading', reading: null, fromCache: false };
  now = Date.now();
  offline = typeof navigator !== 'undefined' && !navigator.onLine;
  readonly windowLabel = windowLabel;
  private subscription?: Subscription;
  private clock?: ReturnType<typeof setInterval>;
  private readonly connectivity = () => { this.offline = !navigator.onLine; };

  constructor(private readonly usage: CodexUsageService, @Inject(PLATFORM_ID) private readonly platform: object) {}
  ngOnInit(): void {
    if (!isPlatformBrowser(this.platform)) return;
    this.subscription = this.usage.watch().subscribe(state => { this.state = state; this.now = Date.now(); });
    this.clock = setInterval(() => { this.now = Date.now(); }, 30000);
    window.addEventListener('online', this.connectivity);
    window.addEventListener('offline', this.connectivity);
  }
  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.clock) clearInterval(this.clock);
    if (isPlatformBrowser(this.platform)) {
      window.removeEventListener('online', this.connectivity);
      window.removeEventListener('offline', this.connectivity);
    }
  }
  get status(): string {
    if (this.offline) return 'Offline';
    if (this.state.status === 'loading') return 'Connecting';
    if (this.state.status === 'unconnected') return this.state.fromCache ? 'Waiting for connection' : 'Not connected';
    if (!this.state.reading) return 'Unavailable';
    const { allowance, daily } = this.state.reading;
    if (!allowance.buckets.some(bucket => bucket.windows.length) && !daily.latest) return 'Unavailable';
    if ([allowance, daily].some(section => section.lastSuccessAt && readingStale(section, this.now))) return 'Stale';
    if (allowance.buckets.some(bucket => bucket.windows.some(window => window.resetsAt !== null && window.resetsAt * 1000 <= this.now))) return 'Awaiting allowance';
    if (allowance.status !== 'ok' || daily.status !== 'ok' || !allowance.buckets.some(bucket => bucket.windows.length) || !daily.latest) return 'Partial';
    return this.state.fromCache ? 'Cached' : 'Up to date';
  }
  get lastSuccess(): string | null {
    return [this.state.reading?.allowance.lastSuccessAt, this.state.reading?.daily.lastSuccessAt]
      .filter((value): value is string => !!value).sort().at(-1) ?? null;
  }
  get hasAllowanceWindows(): boolean { return this.state.reading?.allowance.buckets.some(bucket => bucket.windows.length > 0) ?? false; }
  get emptyMessage(): string {
    if (this.offline) return 'You are offline. Reconnect to load your last account reading.';
    if (this.state.status === 'loading') return 'Loading your private account readings…';
    if (this.state.status === 'unconnected') return this.state.fromCache
      ? 'Waiting for the server to confirm whether a monitor is connected.'
      : 'No reading yet. Run the local monitor setup on your Windows PC to connect this PTI account.';
    return 'Account readings are unavailable. Check the local monitor status and your PTI sign-in.';
  }
  sectionStatus(section: ReadingSection, hasSavedValue: boolean): string {
    if (section.lastSuccessAt && readingStale(section, this.now)) return 'Stale reading';
    if (section.status === 'unsupported') return 'Not supported by this Codex version';
    if (section.status === 'unavailable') return 'Not reported by Codex';
    if (section.status === 'error') return hasSavedValue ? 'Update failed · last good reading' : 'Update failed · no saved reading';
    return '';
  }
  reset(window: UsageWindow): string { return resetLabel(window.resetsAt, this.now); }
  progressPercent(window: UsageWindow): number { return Math.max(0, Math.min(100, window.usedPercent ?? 0)); }
}
