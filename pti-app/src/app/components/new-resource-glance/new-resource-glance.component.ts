import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CodexUsageService, UsageState, UsageWindow } from '../../services/codex-usage.service';
import { PlatformUsageReading, PlatformUsageService, PlatformUsageState } from '../../services/platform-usage.service';
import { readingStale, resetLabel, windowLabel } from '../new-codex-usage/new-codex-usage.component';

interface FirebaseQuotaPeak {
  percent: number;
  projectId: string;
  databaseId: string;
  metric: 'reads' | 'writes' | 'deletes';
}

const DAILY_LIMITS = { reads: 50_000, writes: 20_000, deletes: 20_000 } as const;
const PLATFORM_STALE_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-new-resource-glance',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterLink],
  templateUrl: './new-resource-glance.component.html',
  styleUrl: './new-resource-glance.component.scss',
})
export class NewResourceGlanceComponent implements OnInit, OnDestroy {
  codex: UsageState = { status: 'loading', reading: null, fromCache: false };
  platform: PlatformUsageState = { status: 'loading', reading: null, fromCache: false };
  now = Date.now();
  offline = false;
  private readonly subscriptions = new Subscription();
  private clock?: ReturnType<typeof setInterval>;
  private readonly connectivity = () => { this.offline = !navigator.onLine; };

  constructor(
    private readonly codexUsage: CodexUsageService,
    private readonly platformUsage: PlatformUsageService,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.connectivity();
    this.subscriptions.add(this.codexUsage.watch().subscribe(state => { this.codex = state; this.now = Date.now(); }));
    this.subscriptions.add(this.platformUsage.watch().subscribe(state => { this.platform = state; this.now = Date.now(); }));
    this.clock = setInterval(() => { this.now = Date.now(); }, 60_000);
    window.addEventListener('online', this.connectivity);
    window.addEventListener('offline', this.connectivity);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.clock) clearInterval(this.clock);
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('online', this.connectivity);
      window.removeEventListener('offline', this.connectivity);
    }
  }

  get codexWindow(): UsageWindow | null {
    const windows = this.codex.reading?.allowance.buckets.flatMap(bucket => bucket.windows) ?? [];
    return windows.find(window => window.id === 'primary' && window.windowDurationMins === 10_080 && window.remainingPercent !== null)
      ?? windows.find(window => window.windowDurationMins === 10_080 && window.remainingPercent !== null)
      ?? windows.find(window => window.id === 'primary' && window.remainingPercent !== null)
      ?? windows.find(window => window.remainingPercent !== null)
      ?? null;
  }

  get codexStatus(): string {
    if (this.offline) return 'Offline';
    if (this.codex.status === 'loading') return 'Loading';
    if (this.codex.status === 'unconnected') return 'Not connected';
    const allowance = this.codex.reading?.allowance;
    if (!allowance || !this.codexWindow) return 'Unavailable';
    if (!allowance.lastSuccessAt) return 'Undated';
    if (readingStale(allowance, this.now)) return 'Stale';
    if (this.codexWindow.resetsAt !== null && this.codexWindow.resetsAt * 1000 <= this.now) return 'Reset due';
    if (allowance.status !== 'ok') return 'Partial';
    return this.codex.fromCache ? 'Cached' : 'Current';
  }

  get codexContext(): string {
    const window = this.codexWindow;
    if (!window) return this.codex.status === 'loading' ? 'Checking allowance…' : 'No allowance reported';
    return `${windowLabel(window)} · ${resetLabel(window.resetsAt, this.now)}`;
  }

  get codexUsedPercent(): number { return Math.max(0, Math.min(100, this.codexWindow?.usedPercent ?? 0)); }

  get github(): PlatformUsageReading['github'] | null { return this.platform.reading?.github ?? null; }

  get githubRepoWide(): boolean { return Array.isArray(this.github?.repos); }

  get githubRuns(): number | null {
    if (!this.github) return null;
    if (!this.githubRepoWide) return this.github.workflowRuns24h;
    const values = (this.github.repos ?? []).map(repo => repo.runs24h).filter((n): n is number => n !== null);
    return values.length ? values.reduce((sum, n) => sum + n, 0) : null;
  }

  get githubFailures(): number | null {
    if (!this.github) return null;
    if (!this.githubRepoWide) return this.github.failedRuns24h;
    const values = (this.github.repos ?? []).map(repo => repo.failed24h).filter((n): n is number => n !== null);
    return values.length ? values.reduce((sum, n) => sum + n, 0) : null;
  }

  get githubCoverage(): string {
    if (!this.github) return 'Coverage unavailable';
    const covered = this.github.coveredRepoCount;
    const total = this.github.repositoryCount;
    if (typeof covered === 'number' && typeof total === 'number') return `${covered}/${total} repos covered`;
    if (typeof covered === 'number') return `${covered} repos covered`;
    if (this.githubRepoWide) return `${this.github.repos?.length ?? 0} repos reported`;
    return this.github.workflowRepoScope ? `Scope: ${this.github.workflowRepoScope}` : 'PTI-only snapshot';
  }

  get githubStatus(): string { return this.providerStatus(this.github?.status); }
  get firebaseStatus(): string { return this.providerStatus(this.platform.reading?.firebase.status); }

  private providerStatus(status: 'ok' | 'partial' | 'not-connected' | 'error' | undefined): string {
    if (this.offline) return 'Offline';
    if (this.platform.status === 'loading') return 'Loading';
    if (this.platform.status === 'unconnected' || status === 'not-connected') return 'Not connected';
    if (this.platform.status !== 'ready' || !status || status === 'error') return 'Unavailable';
    const date = Date.parse(this.platform.reading?.collectedAt ?? '');
    if (!Number.isFinite(date)) return 'Undated';
    if (this.now - date >= PLATFORM_STALE_MS) return 'Stale';
    if (status === 'partial') return 'Partial';
    return this.platform.fromCache ? 'Cached' : 'Current';
  }

  get firebasePeak(): FirebaseQuotaPeak | null {
    const projects = this.platform.reading?.firebase.projects ?? [];
    let peak: FirebaseQuotaPeak | null = null;
    for (const project of projects) {
      for (const database of project.databases ?? []) {
        if (database.freeTier !== true || database.edition?.toLowerCase() !== 'standard') continue;
        const metrics: Array<['reads' | 'writes' | 'deletes', number | null]> = [
          ['reads', database.readsToday], ['writes', database.writesToday], ['deletes', database.deletesToday],
        ];
        for (const [metric, value] of metrics) {
          if (value === null || !Number.isFinite(value)) continue;
          const percent = value / DAILY_LIMITS[metric] * 100;
          if (!peak || percent > peak.percent) peak = { percent, projectId: project.projectId, databaseId: database.databaseId, metric };
        }
      }
    }
    return peak;
  }

  get firebaseReporting(): string {
    const projects = this.platform.reading?.firebase.projects;
    if (!projects) return 'Project coverage unavailable';
    const reported = projects.filter(project =>
      project.reads24h !== null || project.writes24h !== null || project.deletes24h !== null).length;
    return `${reported}/${projects.length} projects with 24h metrics`;
  }

  get firebasePeakContext(): string {
    const peak = this.firebasePeak;
    if (!peak) return this.platform.status === 'loading' ? 'Checking daily quotas…' : 'No confirmed daily quota sample';
    const pacificDay = this.platform.reading?.firebase.dayPacific;
    return `${peak.projectId} / ${peak.databaseId} · ${peak.metric} · ${pacificDay ? `${pacificDay} PT` : 'day unavailable'}`;
  }

  get githubStatusWarning(): boolean { return ['Partial', 'Stale', 'Unavailable', 'Offline'].includes(this.githubStatus); }
  get firebaseStatusWarning(): boolean { return ['Partial', 'Stale', 'Unavailable', 'Offline'].includes(this.firebaseStatus); }
  get codexStatusWarning(): boolean { return ['Partial', 'Stale', 'Reset due', 'Unavailable', 'Offline'].includes(this.codexStatus); }
}
