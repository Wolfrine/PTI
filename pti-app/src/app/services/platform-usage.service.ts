import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { doc, onSnapshot } from 'firebase/firestore';
import { Observable, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

export type PlatformSectionStatus = 'ok' | 'partial' | 'not-connected' | 'error';

export interface CloudBillingReading {
  status: PlatformSectionStatus;
  invoiceMonth: string;
  currency: string | null;
  gross: number | null;
  credits: number | null;
  otherCharges: number | null;
  net: number | null;
  latestExportAt: string | null;
  changeSincePrevious: number | null;
  reason: 'export-not-configured' | 'invalid-export-configuration' | 'missing-query-credentials' | 'export-query-failed' | 'awaiting-export' | null;
  projects: CloudBillingBreakdown[];
  services: CloudBillingBreakdown[];
}

export interface CloudBillingBreakdown {
  name: string;
  gross: number;
  credits: number;
  otherCharges: number;
  net: number;
}

export interface PlatformUsageReading {
  collectedAt: string;
  cloudBilling: CloudBillingReading | null;
  github: {
    status: PlatformSectionStatus;
    period: string;
    billedActionsMinutes: number | null;
    billedActionsUsd: number | null;
    workflowRuns24h: number | null;
    failedRuns24h: number | null;
    workflowRepoScope: string;
    repos?: Array<{ repo: string; status: 'ok' | 'error' | 'not-connected'; runs24h: number | null; failed24h: number | null }>;
    repositoryCount?: number | null;
    coveredRepoCount?: number | null;
  };
  firebase: {
    status: PlatformSectionStatus;
    projects: Array<{
      projectId: string;
      status: Exclude<PlatformSectionStatus, 'partial'>;
      reads24h: number | null;
      writes24h: number | null;
      deletes24h: number | null;
      databases?: Array<{
        databaseId: string;
        freeTier: boolean | null;
        edition: string | null;
        status: 'ok' | 'error' | 'not-connected';
        readsToday: number | null;
        writesToday: number | null;
        deletesToday: number | null;
      }>;
    }>;
    dayPacific?: string | null;
    nextResetAt?: string | null;
  };
}

export interface PlatformUsageState {
  status: 'loading' | 'ready' | 'unconnected' | 'unavailable';
  reading: PlatformUsageReading | null;
  fromCache: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const status = (value: unknown): PlatformSectionStatus =>
  value === 'ok' || value === 'partial' || value === 'not-connected' || value === 'error' ? value : 'error';
const amount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const signedAmount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = (value: unknown): number | null =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
const itemStatus = (value: unknown): 'ok' | 'error' | 'not-connected' =>
  value === 'ok' ? 'ok' : value === 'not-connected' || value === 'not_connected' ? 'not-connected' : 'error';
const nonEmptyString = (value: unknown, maxLength = 120): string | null =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength ? value.trim() : null;
const validIsoDateTime = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const validPacificDay = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
};

const billingReason = (value: unknown): CloudBillingReading['reason'] =>
  value === 'export-not-configured' || value === 'invalid-export-configuration' ||
  value === 'missing-query-credentials' || value === 'export-query-failed' || value === 'awaiting-export' ? value : null;

function billingBreakdown(value: unknown): CloudBillingBreakdown[] {
  return (Array.isArray(value) ? value : []).slice(0, 50).flatMap(item => {
    const entry = record(item);
    const name = nonEmptyString(entry['name']);
    const gross = signedAmount(entry['gross']);
    const credits = signedAmount(entry['credits']);
    const otherCharges = signedAmount(entry['otherCharges']);
    const net = signedAmount(entry['net']);
    return name !== null && gross !== null && credits !== null && otherCharges !== null && net !== null
      ? [{ name, gross, credits, otherCharges, net }] : [];
  });
}

function readCloudBilling(value: unknown): CloudBillingReading | null {
  if (!isRecord(value) || value['source'] !== 'cloud-billing-bigquery-standard') return null;
  const invoiceMonth = value['invoiceMonth'];
  if (typeof invoiceMonth !== 'string' || !/^\d{4}(?:0[1-9]|1[0-2])$/.test(invoiceMonth)) return null;
  const currency = typeof value['currency'] === 'string' && /^[A-Z]{3}$/.test(value['currency']) ? value['currency'] : null;
  return {
    status: status(value['status']), invoiceMonth, currency,
    gross: signedAmount(value['gross']), credits: signedAmount(value['credits']),
    otherCharges: signedAmount(value['otherCharges']), net: signedAmount(value['net']),
    latestExportAt: validIsoDateTime(value['latestExportAt']),
    changeSincePrevious: signedAmount(value['changeSincePrevious']),
    reason: billingReason(value['reason']),
    projects: billingBreakdown(value['projects']), services: billingBreakdown(value['services']),
  };
}

// Never turn absent API metrics into zero. Cached values are source-labelled, not billable truth.
export function readPlatformUsageDocument(value: unknown): PlatformUsageReading | null {
  const data = record(value);
  if (data['schemaVersion'] !== 1 || data['source'] !== 'pti-platform-usage') return null;
  if (typeof data['collectedAt'] !== 'string' || !Number.isFinite(Date.parse(data['collectedAt']))) return null;
  const github = record(data['github']);
  const firebase = record(data['firebase']);
  const repos = Array.isArray(github['repos']) ? github['repos'].slice(0, 100).flatMap(item => {
    const repo = record(item);
    const name = nonEmptyString(repo['repo']);
    if (!name || name.includes('..') || name.startsWith('/') || name.includes('\\')) return [];
    return [{ repo: name, status: itemStatus(repo['status']), runs24h: count(repo['runs24h']), failed24h: count(repo['failed24h']) }];
  }) : undefined;
  const parsedProjects = (Array.isArray(firebase['projects']) ? firebase['projects'] : []).slice(0, 40).flatMap(item => {
    const project = record(item);
    const projectId = project['projectId'];
    if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{3,40}$/.test(projectId)) return [];
    const state = status(project['status']);
    const databases = Array.isArray(project['databases']) ? project['databases'].slice(0, 20).flatMap(dbItem => {
      const database = record(dbItem);
      const databaseId = nonEmptyString(database['databaseId'], 120);
      if (!databaseId || databaseId.includes('..') || databaseId.startsWith('/') || databaseId.includes('\\')) return [];
      return [{
        databaseId,
        freeTier: typeof database['freeTier'] === 'boolean' ? database['freeTier'] : null,
        edition: nonEmptyString(database['edition'], 60),
        status: itemStatus(database['status']),
        readsToday: count(database['readsToday']),
        writesToday: count(database['writesToday']),
        deletesToday: count(database['deletesToday']),
      }];
    }) : undefined;
    return [{
      projectId,
      status: state === 'partial' ? 'error' as const : state,
      reads24h: count(project['reads24h']),
      writes24h: count(project['writes24h']),
      deletes24h: count(project['deletes24h']),
      ...(databases === undefined ? {} : { databases }),
    }];
  });
  return {
    collectedAt: data['collectedAt'],
    cloudBilling: readCloudBilling(data['cloudBilling']),
    github: {
      status: status(github['status']),
      period: typeof github['period'] === 'string' && /^\d{4}-\d{2}$/.test(github['period']) ? github['period'] : '',
      billedActionsMinutes: amount(github['billedActionsMinutes']),
      billedActionsUsd: amount(github['billedActionsUsd']),
      workflowRuns24h: count(github['workflowRuns24h']),
      failedRuns24h: count(github['failedRuns24h']),
      workflowRepoScope: github['workflowRepoScope'] === 'Wolfrine/PTI' ? 'Wolfrine/PTI' : '',
      ...(repos === undefined ? {} : { repos }),
      ...(count(github['repositoryCount']) === null ? {} : { repositoryCount: count(github['repositoryCount']) }),
      ...(count(github['coveredRepoCount']) === null ? {} : { coveredRepoCount: count(github['coveredRepoCount']) }),
    },
    firebase: {
      status: status(firebase['status']),
      projects: parsedProjects,
      ...(validPacificDay(firebase['dayPacific']) ? { dayPacific: validPacificDay(firebase['dayPacific']) } : {}),
      ...(validIsoDateTime(firebase['nextResetAt']) ? { nextResetAt: validIsoDateTime(firebase['nextResetAt']) } : {}),
    },
  };
}

@Injectable({ providedIn: 'root' })
export class PlatformUsageService {
  constructor(private readonly firestore: Firestore, private readonly auth: AuthService,
    private readonly zone: NgZone, @Inject(PLATFORM_ID) private readonly platform: object) {}

  watch(): Observable<PlatformUsageState> {
    if (!isPlatformBrowser(this.platform)) return of({ status: 'loading', reading: null, fromCache: false });
    return this.auth.user$.pipe(
      map(user => user?.uid as string | undefined), distinctUntilChanged(),
      switchMap(uid => !uid ? of<PlatformUsageState>({ status: 'unconnected', reading: null, fromCache: false })
        : new Observable<PlatformUsageState>(subscriber => {
          subscriber.next({ status: 'loading', reading: null, fromCache: false });
          return onSnapshot(doc(this.firestore, `users/${uid}/resourceUsage/current`), { includeMetadataChanges: true },
            snapshot => this.zone.run(() => {
              const reading = snapshot.exists() ? readPlatformUsageDocument(snapshot.data()) : null;
              subscriber.next({ status: snapshot.exists() ? reading ? 'ready' : 'unavailable' : 'unconnected',
                reading, fromCache: snapshot.metadata.fromCache });
            }),
            () => this.zone.run(() => subscriber.next({ status: 'unavailable', reading: null, fromCache: false })));
        })));
  }
}
