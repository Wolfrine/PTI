import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { NewCodexUsageComponent } from '../new-codex-usage/new-codex-usage.component';
import { PlatformUsageReading, PlatformUsageService, PlatformUsageState } from '../../services/platform-usage.service';

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

  get statusLabel(): string {
    if (this.state.status === 'loading') return 'Checking sources';
    if (this.state.status === 'unconnected') return 'Awaiting first update';
    if (this.state.status !== 'ready' || !this.reading) return 'Reading unavailable';
    if (Date.now() - Date.parse(this.reading.collectedAt) > 24 * 60 * 60 * 1000) return 'Update overdue';
    if (this.github?.status !== 'ok' || this.firebase?.status !== 'ok') return 'Some sources unavailable';
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
}
