export type AtlasProgressState = 'unknown' | 'aware' | 'learning' | 'practicing' | 'applying' | 'paused';
export type AtlasReviewStatus = 'accepted' | 'rejected' | 'needs-context';
export type AtlasCollection = 'evidence' | 'reviews' | 'progress' | 'events' | 'sources' | 'runs';
export const ATLAS_SOURCE_SYSTEMS = ['github', 'chatgpt-pages', 'pti-tracker-firestore', 'google-drive-spreadsheet', 'google-drive-document', 'web-primary-source', 'user-report'] as const;

export interface AtlasEvidenceRecord {
  sourceSystem: string; sourceLocator: string; sourceRecordId: string;
  sourceRevision: string | null; occurredAt: string | null; sourceUpdatedAt: string | null;
  capturedAt: string; claim: string; originalStatus: string | null;
  evidenceKind: 'primary_artifact' | 'secondary_record' | 'user_report' | 'proposal';
  subjectIds: string[]; projectId: string; contribution: string | null;
  limitations: string[]; reviewStatus: 'pending';
}
export interface AtlasEvidence {
  id: string; identity: string; fingerprint: string; supersedes: string | null;
  record: AtlasEvidenceRecord;
}
export interface AtlasRevision {
  id: string; schemaVersion: 1; revision: number; updatedAt: number; lastEventId: string;
}
export interface AtlasProgress extends AtlasRevision {
  subjectId: string; state: AtlasProgressState; note: string; basis: 'self-report';
}
export interface AtlasReview extends AtlasRevision { evidenceId: string; status: AtlasReviewStatus; note: string; }
export interface AtlasSource extends AtlasRevision {
  sourceId: string; system: string; locator: string;
  recordLocatorPrefixes: string[]; recordLocators: string[]; enabled: boolean;
}
export type AtlasSourceInput = Omit<AtlasSource, 'id' | 'schemaVersion' | 'revision' | 'updatedAt' | 'lastEventId'>;
export interface AtlasEvent {
  id: string; schemaVersion: 1; eventId: string;
  kind: 'progress' | 'review' | 'source' | 'evidence-conflict';
  targetId: string; revision?: number; createdAt: number;
  before?: Record<string, unknown> | null; after?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface AtlasRun {
  id: string; schemaVersion?: 1; runId?: string; capturedAt?: string;
  inputHash?: string; taskReference?: string | null; sourceIds?: string[];
  sourceScope?: { system?: string; locator?: string; completeness?: 'partial' | 'complete'; limitation?: string };
  inputCount?: number; addedIds?: string[]; duplicateIds?: string[]; conflictEventIds?: string[];
  unresolvedConflictCount?: number; status?: 'staged' | 'needs-review';
  [key: string]: unknown;
}
export interface AtlasSnapshot {
  evidence: AtlasEvidence[]; reviews: AtlasReview[]; progress: AtlasProgress[];
  events: AtlasEvent[]; sources: AtlasSource[]; runs: AtlasRun[];
  loadedAt: string | null; hasMore: Record<AtlasCollection, boolean>;
}
export interface AtlasSector {
  id: string; title: string; subtitle: string; color: string; subjectIds: string[];
}
export interface AtlasSubject {
  id: string; sectorId: string; title: string; summary: string;
  known: string[]; questions: string[]; sources: { label: string; url: string }[];
  relatedIds: string[]; coverage: 'seed' | 'outline';
}

export const ATLAS_COLLECTIONS: AtlasCollection[] = ['evidence', 'reviews', 'progress', 'events', 'sources', 'runs'];
export const ATLAS_PROGRESS_LABELS: Record<AtlasProgressState, string> = {
  unknown: 'Unassessed', aware: 'Exploring', learning: 'Learning', practicing: 'Practicing', applying: 'Applied', paused: 'Paused',
};
export const ATLAS_REVIEW_LABELS: Record<AtlasReviewStatus, string> = {
  accepted: 'Linked', rejected: 'Dismissed', 'needs-context': 'Needs context',
};
export function emptyAtlasSnapshot(): AtlasSnapshot {
  return { evidence: [], reviews: [], progress: [], events: [], sources: [], runs: [], loadedAt: null,
    hasMore: { evidence: false, reviews: false, progress: false, events: false, sources: false, runs: false } };
}

export function atlasSafeId(value: string): boolean { return /^[A-Za-z0-9_-]{1,128}$/.test(value); }

export function atlasSafeSourceUrl(value: string): string | null {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
