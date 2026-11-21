import { DatePipe, NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { fromEvent, map, merge, of, timer } from 'rxjs';
import {
  Capacity,
  InfrastructureSample,
  LocalInfrastructureService,
  LocalInfrastructureState,
  LocalWorker,
  WorkerCondition,
  WorkerEvidence,
  WorkerStatus,
} from '../../services/local-infrastructure.service';

type Tab = 'overview' | 'workers' | 'activity';
type Tone = 'online' | 'attention' | 'neutral';
type Observation = 'current' | 'overdue' | 'old' | 'cached' | 'future';
type HistoryMetric = Exclude<keyof InfrastructureSample, 'at'>;

interface Metric {
  label: string;
  value: string | null;
  total?: string;
  percent: number | null;
}

interface ChartPoint {
  x: number;
  y: number;
}

interface WorkerPresentation {
  name: string;
  purpose?: string;
  homeControl?: boolean;
}

const workerPresentation: Readonly<Partial<Record<string, WorkerPresentation>>> = {
  'local-codex': { name: 'Local Codex', purpose: 'Runs authorized work in native Codex' },
  'codex-usage': { name: 'Codex usage monitor', purpose: 'Updates PTI with account allowance readings' },
  'gt-papers': { name: 'GT Papers', purpose: 'Processes question papers locally', homeControl: true },
  'gt-checking': { name: 'GT Checking', purpose: 'Checks scanned answers locally' },
  'service-initiator': { name: 'Local Service Initiator', purpose: 'Receives companion start requests from PTI' },
  'velum-studio': { name: 'Velum Studio', purpose: 'Runs local image generation and edits' },
  'taleweald-models': { name: 'Taleweald Model Worker', purpose: 'Image3D geometry and UltraTex textures' },
  'morsel-blinkit': { name: 'Morsel Blinkit', purpose: 'Runs local Blinkit tasks' },
  'one-piece': { name: 'One Piece companion', purpose: 'Serves and prepares media on the home PC', homeControl: true },
  'taleweald-ops': { name: 'Taleweald Ops', purpose: 'Runs Taleweald desktop operations and maintenance' },
  'android-auto': { name: 'Android Auto Diagnostics', purpose: 'Archives trip diagnostics locally' },
};

const componentNames: Readonly<Partial<Record<string, string>>> = {
  'ollama-gt': 'Ollama · GT Papers',
  'ollama-checking': 'Ollama · GT Checking',
  comfyui: 'ComfyUI',
  blender: 'Blender',
  jellyfin: 'Jellyfin',
  caddy: 'Caddy',
};

const statusLabels: Record<WorkerStatus, string> = {
  available: 'Available',
  idle: 'Idle',
  working: 'Working',
  offline: 'Offline',
  unknown: 'Unknown',
};

const evidenceLabels: Record<WorkerEvidence, string> = {
  health: 'Health report',
  heartbeat: 'Heartbeat',
  process: 'Process observation',
  task: 'Windows task observation',
  missing: 'Expected signal absent',
  unavailable: 'Source unavailable',
};

const conditionLabels: Record<WorkerCondition, string> = {
  'sign-in-required': 'Sign-in required',
  'reported-error': 'Reported an error',
  'heartbeat-overdue': 'Heartbeat overdue',
};

const chartMetrics: readonly { key: HistoryMetric; label: string }[] = [
  { key: 'cpuPercent', label: 'CPU' },
  { key: 'gpuPercent', label: 'GPU' },
  { key: 'memoryPercent', label: 'Memory' },
];

const minute = 60_000;
const chartWindow = 60 * minute;
const maximumChartGap = 8 * minute;
const overdueAfter = 12 * minute;
const oldAfter = 20 * minute;
const overviewWorkerLimit = 9;
const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const capacityNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function readTab(value: string | null): Tab {
  return value === 'workers' || value === 'activity' ? value : 'overview';
}

function percentage(value: number | null): string | null {
  return value === null ? null : `${integer.format(value)}%`;
}

function capacityMetric(label: string, capacity: Capacity | null): Metric {
  if (!capacity) return { label, value: null, percent: null };
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const unit = Math.min(Math.floor(Math.log2(capacity.totalBytes) / 10), units.length - 1);
  const divisor = 1024 ** unit;
  return {
    label,
    value: capacityNumber.format(capacity.usedBytes / divisor),
    total: `${capacityNumber.format(capacity.totalBytes / divisor)} ${units[unit]}`,
    percent: 100 * capacity.usedBytes / capacity.totalBytes,
  };
}

function rate(value: number | null): string {
  if (value === null) return 'Unavailable';
  if (value >= 1024 ** 3) return `${decimal.format(value / 1024 ** 3)} GiB/s`;
  if (value >= 1024 ** 2) return `${decimal.format(value / 1024 ** 2)} MiB/s`;
  if (value >= 1024) return `${decimal.format(value / 1024)} KiB/s`;
  return `${decimal.format(value)} B/s`;
}

function temperature(value: number | null): string {
  return value === null ? 'Unavailable' : `${decimal.format(value)} °C`;
}

function uptime(seconds: number | null): string {
  if (seconds === null) return 'Unavailable';
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor(seconds / 3_600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  if (days) return `${integer.format(days)}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return minutes ? `${minutes}m` : 'Under 1m';
}

function titleFromId(id: string): string {
  return id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function chart(values: InfrastructureSample[], key: HistoryMetric, now: number) {
  const segments: ChartPoint[][] = [];
  let segment: ChartPoint[] | undefined;
  let latest: InfrastructureSample | null = null;
  let count = 0;
  for (const sample of values) {
    const value = sample[key];
    if (value === null) {
      segment = undefined;
      continue;
    }
    if (!segment || latest === null || sample.at - latest.at > maximumChartGap) {
      segment = [];
      segments.push(segment);
    }
    segment.push({
      x: 3 + 294 * (1 - (now - sample.at) / chartWindow),
      y: 37 - 34 * value / 100,
    });
    latest = sample;
    count++;
  }
  return {
    lines: segments.filter(points => points.length > 1).map(points => points.map(point => `${point.x},${point.y}`).join(' ')),
    dots: segments.filter(points => points.length === 1).map(points => points[0]),
    latest: latest === null ? null : percentage(latest[key]),
    oldAt: latest !== null && now - latest.at >= overdueAfter ? latest.at : null,
    count,
  };
}

@Component({
  selector: 'app-new-local-infrastructure',
  standalone: true,
  imports: [DatePipe, MatIconModule, NgTemplateOutlet, RouterLink],
  templateUrl: './new-local-infrastructure.component.html',
  styleUrl: './new-local-infrastructure.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewLocalInfrastructureComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly listening = inject(LocalInfrastructureService);
  private readonly now = toSignal(this.browser ? timer(0, 15_000).pipe(map(() => Date.now())) : of(Date.now()), {
    initialValue: Date.now(),
  });
  private readonly offline = toSignal(
    this.browser ? merge(fromEvent(window, 'online'), fromEvent(window, 'offline')).pipe(map(() => !navigator.onLine)) : of(false),
    { initialValue: this.browser && !navigator.onLine },
  );
  private readonly state = toSignal(this.listening.watch(), {
    initialValue: { status: 'loading', fromCache: false } as LocalInfrastructureState,
  });
  readonly snapshot = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.snapshot : null;
  });
  private readonly readingClock = computed(() => {
    this.snapshot();
    return Math.max(this.now(), Date.now());
  });
  readonly tab = toSignal(this.route.queryParamMap.pipe(map(params => readTab(params.get('tab')))), {
    initialValue: readTab(this.route.snapshot.queryParamMap.get('tab')),
  });
  readonly tabs = [
    { label: 'Overview', key: 'overview', query: { tab: null } },
    { label: 'Workers', key: 'workers', query: { tab: 'workers' } },
    { label: 'Activity', key: 'activity', query: { tab: 'activity' } },
  ] as const;

  readonly observation = computed<Observation | null>(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return null;
    const age = this.readingClock() - snapshot.collectedAt;
    if (age < 0) return 'future';
    if (age >= oldAfter) return 'old';
    if (this.offline() || this.state().fromCache) return 'cached';
    return age >= overdueAfter ? 'overdue' : 'current';
  });

  readonly freshness = computed<{ label: string; tone: Tone; note?: string }>(() => {
    switch (this.observation()) {
      case 'current': return { label: 'PC online', tone: 'online' };
      case 'overdue': return { label: 'Update overdue', tone: 'attention', note: 'The next PC reading is overdue. Showing the last recorded values.' };
      case 'old': return { label: 'PC status unknown', tone: 'attention', note: 'No recent PC reading. Showing the last recorded values.' };
      case 'cached': return { label: 'Saved reading', tone: 'neutral', note: 'Showing a saved reading. The PC’s current state is unknown.' };
      case 'future': return { label: 'PC status unknown', tone: 'attention', note: 'The PC’s reported time is ahead of this device. Showing the recorded values.' };
      default:
        if (this.offline()) return { label: 'Browser offline', tone: 'neutral' };
        if (this.state().status === 'loading') return { label: 'Checking for readings', tone: 'neutral' };
        return { label: 'PC status unknown', tone: 'neutral' };
    }
  });

  readonly empty = computed(() => {
    if (this.offline()) return { heading: 'Browser offline', detail: 'There is no saved reading for this device. Reconnect to check for a PC reading.' };
    if (this.state().status === 'loading') return { heading: 'Checking for readings', detail: 'Looking for the latest reading from your home PC.' };
    if (this.state().status === 'unavailable') return { heading: 'Readings unavailable', detail: 'PTI could not read the latest snapshot. The home PC’s state is unknown.' };
    return { heading: 'No readings yet', detail: 'This page will update when your home PC sends its first reading.' };
  });

  readonly metrics = computed<Metric[]>(() => {
    const system = this.snapshot()?.workstation;
    if (!system) return [];
    return [
      { label: 'CPU', value: percentage(system.cpuPercent), percent: system.cpuPercent },
      capacityMetric('RAM', system.memory),
      { label: 'NVIDIA GPU', value: percentage(system.gpuPercent), percent: system.gpuPercent },
      capacityMetric('VRAM', system.vram),
      capacityMetric('F: drive', system.disks.F),
      capacityMetric('H: drive', system.disks.H),
    ];
  });

  readonly systemRows = computed(() => {
    const system = this.snapshot()?.workstation;
    if (!system) return [];
    return [
      { label: 'Uptime', value: uptime(system.uptimeSeconds) },
      { label: 'CPU temperature', value: temperature(system.cpuTemperatureC) },
      { label: 'GPU temperature', value: temperature(system.gpuTemperatureC) },
      { label: 'Network down', value: rate(system.network?.receivedBytesPerSecond ?? null) },
      { label: 'Network up', value: rate(system.network?.sentBytesPerSecond ?? null) },
      { label: 'PC state', value: this.observation() === 'current' ? 'Awake at last reading' : 'Unknown' },
    ];
  });

  readonly workerFilter = signal<'all' | 'attention'>('all');
  readonly workers = computed(() => (this.snapshot()?.workers ?? []).map(worker => {
    const knownWorker = Object.hasOwn(workerPresentation, worker.id) ? workerPresentation[worker.id] : undefined;
    const about = knownWorker ?? { name: titleFromId(worker.id) };
    const reported = this.workerStatus(worker);
    return {
      ...worker,
      ...about,
      ...reported,
      seen: worker.lastSeenAt === null ? 'No last sighting' : this.age(worker.lastSeenAt),
      evidenceLabel: evidenceLabels[worker.evidence],
      conditionLabel: worker.condition ? conditionLabels[worker.condition] : null,
      components: worker.components.map(component => ({
        ...component,
        name: Object.hasOwn(componentNames, component.id)
          ? componentNames[component.id]
          : titleFromId(component.id),
        label: component.observed === null ? 'Unknown' : component.observed ? 'Observed' : 'Not observed',
      })),
    };
  }));
  private readonly filteredWorkers = computed(() => this.workerFilter() === 'attention'
    ? this.workers().filter(worker => worker.needsAttention)
    : this.workers());
  readonly visibleWorkers = computed(() => this.tab() === 'overview'
    ? this.filteredWorkers().slice(0, overviewWorkerLimit)
    : this.filteredWorkers());

  private readonly samples = computed(() => {
    const now = this.readingClock();
    return (this.snapshot()?.history ?? []).filter(sample => sample.at >= now - chartWindow && sample.at <= now);
  });
  readonly charts = computed(() => chartMetrics.map(metric => ({
    ...metric,
    ...chart(this.samples(), metric.key, this.readingClock()),
  })));
  readonly hasChartValues = computed(() => this.charts().some(metric => metric.count > 0));
  readonly recentSamples = computed(() => [...this.samples()].reverse());

  readonly percentage = percentage;

  age(at: number): string {
    const elapsed = this.readingClock() - at;
    if (elapsed < 0) return 'Time ahead of this device';
    const minutes = Math.floor(elapsed / minute);
    if (!minutes) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return `${integer.format(Math.floor(minutes / 1440))}d ago`;
  }

  dateTime(at: number): string {
    return new Date(at).toISOString();
  }

  private workerStatus(worker: LocalWorker): { label: string; tone: Tone; needsAttention: boolean } {
    if (worker.status === 'unknown') return { label: 'Unknown', tone: 'neutral', needsAttention: true };
    const active = worker.status !== 'offline';
    const sightingOverdue = worker.lastSeenAt === null || this.readingClock() - worker.lastSeenAt >= overdueAfter;
    const lastReport = this.observation() !== 'current' || (active && sightingOverdue);
    const needsAttention = !!worker.condition || lastReport || !active;
    if (lastReport) return { label: `Last reported: ${statusLabels[worker.status].toLowerCase()}`, tone: 'neutral', needsAttention };
    return { label: statusLabels[worker.status], tone: needsAttention ? 'attention' : 'online', needsAttention };
  }
}
