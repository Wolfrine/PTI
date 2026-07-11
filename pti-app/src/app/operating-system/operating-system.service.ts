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
  EvidenceEnvelope,
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
  assertLifecycleTransition,
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
      const decision = decisionSnapshot.data() as OperatingDecision;
      assertLifecycleTransition('decision', decision.state, 'decided');
      if (!decision.options.some((option) => option.id === selectedOptionId)) {
        throw new Error(`Decision option ${selectedOptionId} does not exist.`);
      }

      transaction.update(decisionRef, {
        state: 'decided',
        selectedOptionId,
        rationale: rationale.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: 'ceo',
        auditVersion: decision.auditVersion + 1,
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
        fromState: decision.state,
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

  async recordDecision(decisionId: string, selectedOptionId: string, rationale: string): Promise<void> {
    const uid = this.requireOwner('record a decision');
    if (!rationale.trim()) throw new Error('Decision rationale is required.');
    const base = this.basePath(uid);
    const decisionRef = doc(this.firestore, `${base}/decisions/${decisionId}`);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(decisionRef);
      if (!snapshot.exists()) throw new Error(`Decision ${decisionId} does not exist.`);
      const current = snapshot.data() as OperatingDecision;
      assertLifecycleTransition('decision', current.state, 'decided');
      if (!current.options.some((option) => option.id === selectedOptionId)) {
        throw new Error(`Decision option ${selectedOptionId} does not exist.`);
      }
      transaction.update(decisionRef, {
        state: 'decided', selectedOptionId, rationale: rationale.trim(),
        updatedAt: serverTimestamp(), updatedBy: 'ceo', auditVersion: current.auditVersion + 1,
      });
      transaction.set(doc(this.firestore, `${base}/auditEvents/decision-${decisionId}-${Date.now()}`),
        this.auditRecord('decision', decisionId, 'decision_recorded', rationale, current.state, 'decided'));
    });
  }

  async transitionWorkPacket(packetId: string, toState: OperatingWorkPacket['state'], reason: string): Promise<void> {
    await this.transitionRecord('workPackets', 'workPacket', packetId, toState, reason);
  }

  async transitionRelease(releaseId: string, toState: OperatingRelease['state'], reason: string): Promise<void> {
    const uid = this.requireOwner('transition a release');
    const base = this.basePath(uid);
    const releaseRef = doc(this.firestore, `${base}/releases/${releaseId}`);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(releaseRef);
      if (!snapshot.exists()) throw new Error(`Release ${releaseId} does not exist.`);
      const release = snapshot.data() as OperatingRelease;
      assertLifecycleTransition('release', release.state, toState);
      if (toState === 'ready_for_production_approval' && (!release.evidenceRefs.length || !release.rollbackRef)) {
        throw new Error('Production approval requires preview evidence and a rollback reference.');
      }
      transaction.update(releaseRef, {
        state: toState, updatedAt: serverTimestamp(), updatedBy: 'ceo', auditVersion: release.auditVersion + 1,
      });
      transaction.set(doc(this.firestore, `${base}/auditEvents/release-${releaseId}-${Date.now()}`),
        this.auditRecord('release', releaseId, 'release_transitioned', reason, release.state, toState));
    });
  }

  private async transitionRecord(
    collectionName: 'workPackets', entity: 'workPacket', id: string, toState: string, reason: string,
  ): Promise<void> {
    const uid = this.requireOwner(`transition ${entity}`);
    if (!reason.trim()) throw new Error('A transition reason is required.');
    const base = this.basePath(uid);
    const recordRef = doc(this.firestore, `${base}/${collectionName}/${id}`);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(recordRef);
      if (!snapshot.exists()) throw new Error(`${entity} ${id} does not exist.`);
      const record = snapshot.data() as EvidenceEnvelope & { state: string };
      assertLifecycleTransition(entity, record.state, toState);
      transaction.update(recordRef, {
        state: toState, updatedAt: serverTimestamp(), updatedBy: 'ceo', auditVersion: record.auditVersion + 1,
      });
      transaction.set(doc(this.firestore, `${base}/auditEvents/${entity}-${id}-${Date.now()}`),
        this.auditRecord(entity, id, `${entity}_transitioned`, reason, record.state, toState));
    });
  }

  private auditRecord(entityType: string, entityId: string, eventType: string, reason: string, fromState: string, toState: string) {
    return {
      schemaVersion: 2, entityType, entityId, eventType, actor: 'ceo', reason: reason.trim(), fromState, toState,
      sourceRefs: [`${entityType}:${entityId}`], confidence: 'high', freshness: 'fresh', evidenceKind: 'real',
      observedAt: new Date().toISOString(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      createdBy: 'ceo', updatedBy: 'ceo', auditVersion: 1,
    };
  }

  private requireOwner(action: string): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error(`A signed-in owner is required to ${action}.`);
    return uid;
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
