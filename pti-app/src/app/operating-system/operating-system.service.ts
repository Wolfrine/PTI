import { Injectable } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  runTransaction,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable, combineLatest, from, map, of, shareReplay, switchMap } from 'rxjs';
import {
  OperatingAgentRun,
  OperatingAllocation,
  OperatingAuditEvent,
  OperatingCommitment,
  OperatingDecision,
  OperatingEvaluation,
  OperatingLearning,
  OperatingOutcome,
  OperatingProject,
  OperatingRelease,
  OperatingSignal,
  OperatingSubmission,
  OperatingSystemData,
  OperatingWorkPacket,
  OperatingWorkspace,
} from './operating-system.models';

type OperatingCollection =
  | 'workspace'
  | 'projects'
  | 'outcomes'
  | 'signals'
  | 'decisions'
  | 'commitments'
  | 'workPackets'
  | 'agentRuns'
  | 'submissions'
  | 'evaluations'
  | 'releases'
  | 'allocations'
  | 'learnings'
  | 'auditEvents';

export interface DecisionCommitmentInput {
  id: string;
  title: string;
  outcomeId: string;
  owner: string;
  targetProof: string[];
  dueAt?: string;
}

@Injectable({ providedIn: 'root' })
export class OperatingSystemService {
  constructor(
    private readonly firestore: Firestore,
    private readonly auth: Auth,
  ) {}

  watch(previewMode = false): Observable<OperatingSystemData> {
    if (previewMode) {
      return from(
        fetch('/data/operating-system-baseline.json').then(async (response) => {
          if (!response.ok) {
            throw new Error(`Could not load PTI preview baseline (${response.status}).`);
          }
          return response.json() as Promise<OperatingSystemData>;
        }),
      ).pipe(shareReplay({ bufferSize: 1, refCount: true }));
    }

    return authState(this.auth).pipe(
      switchMap((user) => user ? this.watchUserWorkspace(user.uid) : of(this.emptyWorkspace())),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  async recordDecisionAndCommitment(
    decisionId: string,
    selectedOptionId: string,
    rationale: string,
    commitment: DecisionCommitmentInput,
  ): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) {
      throw new Error('A signed-in owner is required to record a decision.');
    }
    if (!rationale.trim() || !commitment.targetProof.length) {
      throw new Error('Decision rationale and commitment target proof are required.');
    }

    const base = this.basePath(uid);
    const decisionRef = doc(this.firestore, `${base}/decisions/${decisionId}`);
    const commitmentRef = doc(this.firestore, `${base}/commitments/${commitment.id}`);
    const auditRef = doc(this.firestore, `${base}/auditEvents/decision-${decisionId}-${Date.now()}`);

    await runTransaction(this.firestore, async (transaction) => {
      const decisionSnapshot = await transaction.get(decisionRef);
      if (!decisionSnapshot.exists()) {
        throw new Error(`Decision ${decisionId} does not exist.`);
      }

      transaction.update(decisionRef, {
        state: 'decided',
        selectedOptionId,
        rationale: rationale.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: 'ceo',
      });
      transaction.set(commitmentRef, {
        ...commitment,
        schemaVersion: 2,
        decisionId,
        state: 'active',
        blockerSignalIds: [],
        sourceRefs: [`decision:${decisionId}`],
        confidence: 'high',
        freshness: 'fresh',
        evidenceKind: 'real',
        observedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: 'ceo',
        updatedBy: 'ceo',
        auditVersion: 1,
      });
      transaction.set(auditRef, {
        schemaVersion: 2,
        entityType: 'decision',
        entityId: decisionId,
        eventType: 'decision_recorded',
        actor: 'ceo',
        reason: rationale.trim(),
        fromState: decisionSnapshot.data()['state'],
        toState: 'decided',
        sourceRefs: [`decision:${decisionId}`, `commitment:${commitment.id}`],
        confidence: 'high',
        freshness: 'fresh',
        evidenceKind: 'real',
        observedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: 'ceo',
        updatedBy: 'ceo',
        auditVersion: 1,
      });
    });
  }

  private watchUserWorkspace(uid: string): Observable<OperatingSystemData> {
    return combineLatest({
      workspaceRecords: this.watchCollection<OperatingWorkspace>(uid, 'workspace'),
      projects: this.watchCollection<OperatingProject>(uid, 'projects'),
      outcomes: this.watchCollection<OperatingOutcome>(uid, 'outcomes'),
      signals: this.watchCollection<OperatingSignal>(uid, 'signals'),
      decisions: this.watchCollection<OperatingDecision>(uid, 'decisions'),
      commitments: this.watchCollection<OperatingCommitment>(uid, 'commitments'),
      workPackets: this.watchCollection<OperatingWorkPacket>(uid, 'workPackets'),
      agentRuns: this.watchCollection<OperatingAgentRun>(uid, 'agentRuns'),
      submissions: this.watchCollection<OperatingSubmission>(uid, 'submissions'),
      evaluations: this.watchCollection<OperatingEvaluation>(uid, 'evaluations'),
      releases: this.watchCollection<OperatingRelease>(uid, 'releases'),
      allocations: this.watchCollection<OperatingAllocation>(uid, 'allocations'),
      learnings: this.watchCollection<OperatingLearning>(uid, 'learnings'),
      auditEvents: this.watchCollection<OperatingAuditEvent>(uid, 'auditEvents'),
    }).pipe(
      map(({ workspaceRecords, ...collections }) => ({
        workspace: workspaceRecords[0] ?? this.emptyWorkspace().workspace,
        ...collections,
      })),
    );
  }

  private watchCollection<T>(uid: string, name: OperatingCollection): Observable<T[]> {
    const records = collectionData(collection(this.firestore, `${this.basePath(uid)}/${name}`), {
      idField: 'id',
    });
    return records.pipe(
      map((items) => items.map((item) => this.normalizeFirestoreValue(item) as T)),
    );
  }

  private basePath(uid: string): string {
    return `users/${uid}/operatingSystems/default`;
  }

  private normalizeFirestoreValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeFirestoreValue(item));
    }
    if (value && typeof value === 'object') {
      const timestampCandidate = value as { toDate?: () => Date };
      if (typeof timestampCandidate.toDate === 'function') {
        return timestampCandidate.toDate().toISOString();
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, this.normalizeFirestoreValue(child)]),
      );
    }
    return value;
  }

  private emptyWorkspace(): OperatingSystemData {
    const now = new Date().toISOString();
    return {
      workspace: {
        id: 'default',
        schemaVersion: 2,
        name: 'PTI Executive Operating System',
        reviewLabel: 'No operating records available',
        lastSuccessfulRefreshAt: now,
        mode: 'live',
        createdAt: now,
        updatedAt: now,
        createdBy: 'system',
        updatedBy: 'system',
        sourceRefs: [],
        confidence: 'unknown',
        freshness: 'unknown',
        observedAt: now,
        evidenceKind: 'real',
        auditVersion: 1,
      },
      projects: [], outcomes: [], signals: [], decisions: [], commitments: [], workPackets: [],
      agentRuns: [], submissions: [], evaluations: [], releases: [], allocations: [], learnings: [], auditEvents: [],
    };
  }
}
