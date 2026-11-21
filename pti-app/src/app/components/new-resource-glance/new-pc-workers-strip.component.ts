import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import {
  capacityPercent,
  criticalDrive,
  driveHealth,
  formatBytes,
  hasCurrentWorkerSighting,
  localInfrastructureFreshnessMs,
} from '../../services/local-infrastructure-presentation';
import type { DriveHealth } from '../../services/local-infrastructure-presentation';
import type { LocalInfrastructureState, WorkerStatus } from '../../services/local-infrastructure.service';

type ReadingStatus = 'Checking' | 'Current' | 'Stale' | 'Unknown';

@Component({
  selector: 'app-new-pc-workers-strip',
  standalone: true,
  imports: [DatePipe, DecimalPipe, MatIconModule, RouterLink],
  templateUrl: './new-pc-workers-strip.component.html',
  styleUrl: './new-pc-workers-strip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewPcWorkersStripComponent {
  readonly state = input.required<LocalInfrastructureState>();
  readonly now = input.required<number>();
  readonly offline = input.required<boolean>();

  readonly status = computed<ReadingStatus>(() => {
    const state = this.state();
    if (state.status !== 'ready') return state.status === 'loading' && !this.offline() ? 'Checking' : 'Unknown';
    const age = this.now() - state.snapshot.collectedAt;
    if (age < 0) return 'Unknown';
    return age >= localInfrastructureFreshnessMs || state.fromCache || this.offline() ? 'Stale' : 'Current';
  });

  readonly collectedAt = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.snapshot.collectedAt : null;
  });

  private readonly reading = computed(() => {
    const state = this.state();
    return state.status === 'ready' && this.status() !== 'Unknown' ? state.snapshot : null;
  });

  readonly metrics = computed(() => {
    const system = this.reading()?.workstation;
    return [
      { label: 'CPU', percent: system?.cpuPercent ?? null },
      { label: 'RAM', percent: capacityPercent(system?.memory ?? null) },
      { label: 'GPU', percent: system?.gpuPercent ?? null },
      { label: 'VRAM', percent: capacityPercent(system?.vram ?? null) },
    ];
  });

  readonly workerTotal = computed(() => this.reading()?.workers.length ?? null);
  readonly workerCounts = computed<Record<WorkerStatus, number> | null>(() => {
    const workers = this.reading()?.workers;
    if (this.status() !== 'Current' || !workers?.length) return null;
    const now = this.now();
    const counts = { available: 0, idle: 0, working: 0, offline: 0, unknown: 0 };
    for (const worker of workers) {
      const status = worker.status === 'offline' || hasCurrentWorkerSighting(worker, now) ? worker.status : 'unknown';
      counts[status]++;
    }
    return counts;
  });

  readonly drive = computed(() => criticalDrive(driveHealth(this.reading()?.workstation.disks ?? {})));
  readonly driveLabels: Record<DriveHealth['severity'], string> = {
    critical: 'Critical',
    warning: 'Attention',
    normal: 'Normal',
  };
  readonly formatBytes = formatBytes;

  dateTime(at: number): string {
    return new Date(at).toISOString();
  }
}
