import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { NewCodexUsageComponent } from '../new-codex-usage/new-codex-usage.component';
import { PlatformUsageReading, PlatformUsageService, PlatformUsageState } from '../../services/platform-usage.service';

const FREE_TIER_LIMITS = { reads: 50_000, writes: 20_000, deletes: 20_000 } as const;

@Component({
  selector: 'app-new-development-resources',
  standalone: true,
  imports: [CommonModule, NewCodexUsageComponent],
  templateUrl: './new-development-resources.component.html',
  styleUrl: './new-development-resources.component.scss',
})
export class NewDevelopmentResourcesComponent implements OnInit, OnDestroy {
  state: PlatformUsageState = { status: 'loading', reading: null, fromCache: false };
  private subscription?: Subscription;

  constructor(private readonly usage: PlatformUsageService) {}

  ngOnInit(): void { this.subscription = this.usage.watch().subscribe(state => this.state = state); }
  ngOnDestroy(): void { this.subscription?.unsubscribe(); }

  get reading(): PlatformUsageReading | null { return this.state.reading; }
  get github(): PlatformUsageReading['github'] | null { return this.reading?.github ?? null; }
  get firebase(): PlatformUsageReading['firebase'] | null { return this.reading?.firebase ?? null; }
  get githubRepos(): NonNullable<PlatformUsageReading['github']['repos']> { return this.github?.repos ?? []; }
  get hasProjectWideGithub(): boolean { return Array.isArray(this.github?.repos); }
  get githubHasPartialCoverage(): boolean {
    const total = this.github?.repositoryCount;
    const covered = this.github?.coveredRepoCount;
    return this.github?.status !== 'ok' || this.githubRepos.some(repo => repo.status !== 'ok') ||
      (typeof total === 'number' && typeof covered === 'number' && covered < total);
  }
  get firebaseHasPartialCoverage(): boolean {
    return this.firebase?.status !== 'ok' || (this.firebase?.projects ?? []).some(project =>
      project.status !== 'ok' || (project.databases ?? []).some(database => database.status !== 'ok'));
  }

  repoTotal(metric: 'runs24h' | 'failed24h'): number | null {
    const values = this.githubRepos.map(repo => repo[metric]).filter((value): value is number => value !== null);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  }

  get repositoryCoverage(): string {
    const total = this.github?.repositoryCount;
    const covered = this.github?.coveredRepoCount;
    if (typeof total === 'number' && typeof covered === 'number') return `${covered} of ${total} repositories covered`;
    if (typeof covered === 'number') return `${covered} repositories covered`;
    if (typeof total === 'number') return `${total} repositories in account`;
    return this.githubRepos.length ? `${this.githubRepos.length} repositories reported` : 'No repository coverage reported';
  }

  get supportedDatabaseCount(): number {
    return (this.firebase?.projects ?? []).reduce((total, project) => total + (project.databases ?? []).filter(database => this.hasFreeTierQuota(database)).length, 0);
  }

  get databaseCount(): number {
    return (this.firebase?.projects ?? []).reduce((total, project) => total + (project.databases?.length ?? 0), 0);
  }

  get statusLabel(): string {
    if (this.state.status === 'loading') return 'Checking sources';
    if (this.state.status === 'unconnected') return 'Awaiting first update';
    if (this.state.status !== 'ready' || !this.reading) return 'Reading unavailable';
    if (Date.now() - Date.parse(this.reading.collectedAt) > 24 * 60 * 60 * 1000) return 'Update overdue';
    if (this.githubHasPartialCoverage || this.firebaseHasPartialCoverage) return 'Some sources unavailable';
    return this.state.fromCache ? 'Saved snapshot' : 'Latest snapshot';
  }

  sourceStatus(status: string | undefined): string {
    if (this.state.status !== 'ready') return this.state.status === 'loading' ? 'Loading' : this.state.status === 'unavailable' ? 'Unavailable' : 'Not connected';
    switch (status) {
      case 'ok': return 'Connected';
      case 'partial': return 'Partial';
      case 'error': return 'Unavailable';
      default: return 'Not connected';
    }
  }

  providerStatus(isPartial: boolean, status: string | undefined): string {
    if (this.state.status !== 'ready') return this.sourceStatus(status);
    if (status === 'error') return 'Unavailable';
    if (status === 'not-connected' || status === 'not_connected') return 'Not connected';
    if (status === 'partial') return 'Partial';
    return isPartial ? 'Partial coverage' : this.sourceStatus(status);
  }

  get readReportingProjectCount(): number {
    return (this.firebase?.projects ?? []).filter(project => project.reads24h !== null).length;
  }

  get totalFirebaseReads(): number | null {
    const values = (this.firebase?.projects ?? []).map(project => project.reads24h).filter((value): value is number => value !== null);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  }

  get totalFirebaseWrites(): number | null {
    const values = (this.firebase?.projects ?? []).map(project => project.writes24h).filter((value): value is number => value !== null);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  }

  get firebaseScope(): string {
    if (!this.firebase) return 'No project reading yet';
    if (!this.firebase.projects.length) return 'No project readings yet';
    return `Reads from ${this.readReportingProjectCount} of ${this.firebase.projects.length} projects`;
  }

  hasFreeTierQuota(database: NonNullable<PlatformUsageReading['firebase']['projects'][number]['databases']>[number]): boolean {
    return database.freeTier === true && database.edition?.toLowerCase() === 'standard';
  }

  databaseLimit(metric: keyof typeof FREE_TIER_LIMITS): number { return FREE_TIER_LIMITS[metric]; }
  databasePercent(value: number | null, limit: number): number { return value === null ? 0 : Math.min(100, value / limit * 100); }
  aboveFreeAllowance(value: number | null, metric: keyof typeof FREE_TIER_LIMITS): number | null {
    if (value === null) return null;
    const excess = value - FREE_TIER_LIMITS[metric];
    return excess > 0 ? excess : null;
  }
  databaseValue(value: number | null): string { return value === null ? 'Unavailable' : value.toLocaleString(); }

  databaseTier(database: NonNullable<PlatformUsageReading['firebase']['projects'][number]['databases']>[number]): string {
    if (database.freeTier === true && database.edition?.toLowerCase() === 'standard') return 'Standard · free tier';
    if (database.freeTier === false) return 'No free tier';
    if (database.edition && database.edition.toLowerCase() !== 'standard') return `${database.edition} · no free quota`;
    return 'Free-tier eligibility unavailable';
  }

  databaseTierNote(database: NonNullable<PlatformUsageReading['firebase']['projects'][number]['databases']>[number]): string {
    if (database.freeTier === false) return 'No free-tier quota applies to this database.';
    if (database.edition && database.edition.toLowerCase() !== 'standard') return `${database.edition} is outside the Standard free-tier limits.`;
    return 'No free-tier progress is shown because Standard edition and free-tier eligibility are not confirmed.';
  }
}
