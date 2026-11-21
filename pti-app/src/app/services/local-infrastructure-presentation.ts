import type { Capacity, LocalInfrastructureSnapshot, LocalWorker } from './local-infrastructure.service';

export const localInfrastructureFreshnessMs = 12 * 60_000;

const gib = 1024 ** 3;
const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function hasCurrentWorkerSighting(worker: LocalWorker, now: number): boolean {
  return worker.lastSeenAt !== null && worker.lastSeenAt <= now &&
    now - worker.lastSeenAt < localInfrastructureFreshnessMs &&
    worker.evidence !== 'missing' && worker.evidence !== 'unavailable' &&
    worker.condition !== 'heartbeat-overdue';
}

export interface DriveHealth {
  letter: string;
  capacity: Capacity;
  percent: number;
  freeBytes: number;
  severity: 'critical' | 'warning' | 'normal';
}

export function capacityPercent(capacity: Capacity | null): number | null {
  return capacity ? capacity.usedBytes / capacity.totalBytes * 100 : null;
}

export function formatBytes(bytes: number): string {
  const unit = bytes > 0 ? Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1) : 0;
  return `${decimal.format(bytes / 1024 ** unit)} ${units[unit]}`;
}

export function driveHealth(disks: LocalInfrastructureSnapshot['workstation']['disks']): DriveHealth[] {
  return Object.entries(disks).sort(([first], [second]) => first.localeCompare(second)).map(([letter, capacity]) => {
    const percent = capacity.usedBytes / capacity.totalBytes * 100;
    const freeBytes = capacity.totalBytes - capacity.usedBytes;
    // Small fixed partitions can have little absolute free space while still having ample room.
    const checkFreeBytes = capacity.totalBytes >= 32 * gib;
    let severity: DriveHealth['severity'] = 'normal';
    if (percent >= 95 || (checkFreeBytes && freeBytes < 2 * gib)) severity = 'critical';
    else if (percent >= 90 || (checkFreeBytes && freeBytes < 10 * gib)) severity = 'warning';
    return { letter, capacity, percent, freeBytes, severity };
  });
}

export function criticalDrive(drives: DriveHealth[]): DriveHealth | null {
  const severityRank = { critical: 2, warning: 1, normal: 0 };
  return [...drives].sort((first, second) => severityRank[second.severity] - severityRank[first.severity]
    || second.percent - first.percent || first.freeBytes - second.freeBytes)[0] ?? null;
}
