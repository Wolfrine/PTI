export type Confidence = 'high' | 'medium' | 'low' | 'unknown';
export type Freshness = 'fresh' | 'aging' | 'stale' | 'expired' | 'unknown';
export type EvidenceKind = 'real' | 'inferred' | 'mock' | 'concept' | 'reference_only';
export type PriorityBand = 'critical' | 'high' | 'medium' | 'low';

export interface EvidenceEnvelope {
  id: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  sourceRefs: string[];
  confidence: Confidence;
  freshness: Freshness;
  observedAt: string;
  evidenceKind: EvidenceKind;
  auditVersion: number;
}

export interface OperatingWorkspace extends EvidenceEnvelope {
  name: string;
  reviewLabel: string;
  lastSuccessfulRefreshAt: string;
  mode: 'live' | 'preview';
}

export interface OperatingProject extends EvidenceEnvelope {
  name: string;
  role: string;
  lifecycle: 'live' | 'active' | 'control' | 'support' | 'paused' | 'archived';
  localPath: string;
  repository?: string;
  branch?: string;
  workingTree?: string;
  deployment?: string;
}

export interface OutcomePriority {
  strategicValue: number;
  urgency: number;
  costOfDelay: number;
  dependencyReach: number;
  reversibility: number;
}

export interface OperatingOutcome extends EvidenceEnvelope {
  title: string;
  summary: string;
  projectIds: string[];
  state: 'proposed' | 'active' | 'at_risk' | 'blocked' | 'verifying' | 'achieved' | 'stopped';
  priority: PriorityBand;
  priorityFactors: OutcomePriority;
  expectedEvidence: string[];
  nextProofPoint: string;
  movement: 'advanced' | 'unchanged' | 'regressed' | 'unknown';
  movementSummary: string;
}

export interface OperatingSignal extends EvidenceEnvelope {
  title: string;
  claim: string;
  sourceType: 'user_direction' | 'repository' | 'git' | 'github' | 'firebase' | 'pm_report' | 'agent_review' | 'http_probe';
  sourceUri: string;
  projectIds: string[];
  outcomeIds: string[];
  materiality: 'material' | 'supporting';
  contradictionState: 'clear' | 'contradicted' | 'superseded' | 'unresolved';
}

export interface DecisionOption {
  id: string;
  label: string;
  consequence: string;
}

export interface OperatingDecision extends EvidenceEnvelope {
  question: string;
  outcomeIds: string[];
  options: DecisionOption[];
  recommendation?: string;
  selectedOptionId?: string;
  rationale?: string;
  authority: 'ceo' | 'system' | 'project_owner';
  state: 'proposed' | 'ready' | 'decided' | 'deferred' | 'rejected' | 'verified';
  dueAt?: string;
}

export interface OperatingCommitment extends EvidenceEnvelope {
  title: string;
  outcomeId: string;
  decisionId?: string;
  owner: string;
  state: 'draft' | 'ready' | 'active' | 'blocked' | 'submitted' | 'changes_requested' | 'accepted' | 'outcome_verified' | 'cancelled';
  targetProof: string[];
  dueAt?: string;
  blockerSignalIds: string[];
}

export interface OperatingWorkPacket extends EvidenceEnvelope {
  title: string;
  outcomeId: string;
  commitmentId: string;
  state: 'draft' | 'sealed' | 'assigned' | 'running' | 'submitted' | 'evaluated' | 'selected' | 'rejected' | 'release_ready';
  impactAreaContext: string;
  autonomousDiscoveryScope: string;
  outputDeliveryDirection: string;
  repository: string;
  branchPolicy: string;
  allowedScope: string[];
  forbiddenScope: string[];
  acceptanceCriteria: string[];
  requiredArtifacts: string[];
  riskClass: 'low' | 'medium' | 'high' | 'critical';
}

export interface OperatingAgentRun extends EvidenceEnvelope {
  label: string;
  workPacketId: string;
  role: 'system_worker' | 'evidence_researcher' | 'quality_checker' | 'explorer' | 'main';
  state: 'queued' | 'running' | 'submitted' | 'completed' | 'failed' | 'stopped';
  executionLane: string;
  startedAt: string;
  endedAt?: string;
  submissionIds: string[];
  summary: string;
}

export interface OperatingSubmission extends EvidenceEnvelope {
  title: string;
  workPacketId: string;
  agentRunId: string;
  state: 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected' | 'changes_requested';
  artifactRefs: string[];
  verificationRefs: string[];
  limitations: string[];
}

export interface OperatingEvaluation extends EvidenceEnvelope {
  submissionId: string;
  reviewerRunId: string;
  state: 'draft' | 'complete';
  recommendation: 'accept' | 'reject' | 'changes_requested' | 'combine';
  scores: Record<string, number>;
  findings: string[];
}

export interface OperatingRelease extends EvidenceEnvelope {
  outcomeId: string;
  submissionId?: string;
  state: 'planned' | 'ready_for_preview' | 'previewed' | 'ready_for_production_approval' | 'released' | 'blocked_by_product' | 'blocked_by_evidence' | 'blocked_by_quality' | 'blocked_by_security' | 'blocked_by_authority';
  environment: 'local' | 'preview' | 'production';
  evidenceRefs: string[];
  rollbackRef?: string;
}

export interface OperatingAllocation extends EvidenceEnvelope {
  outcomeId: string;
  period: string;
  resourceType: 'human_time' | 'agent_run' | 'review_attention';
  planned: number;
  actual: number;
  unit: 'hours' | 'runs' | 'reviews';
}

export interface OperatingLearning extends EvidenceEnvelope {
  outcomeId: string;
  title: string;
  lesson: string;
  destination: string;
  curationState: 'captured' | 'handed_off' | 'curated';
}

export interface OperatingAuditEvent extends EvidenceEnvelope {
  entityType: string;
  entityId: string;
  eventType: string;
  actor: string;
  reason: string;
  fromState?: string;
  toState?: string;
}

export interface OperatingSystemData {
  workspace: OperatingWorkspace;
  projects: OperatingProject[];
  outcomes: OperatingOutcome[];
  signals: OperatingSignal[];
  decisions: OperatingDecision[];
  commitments: OperatingCommitment[];
  workPackets: OperatingWorkPacket[];
  agentRuns: OperatingAgentRun[];
  submissions: OperatingSubmission[];
  evaluations: OperatingEvaluation[];
  releases: OperatingRelease[];
  allocations: OperatingAllocation[];
  learnings: OperatingLearning[];
  auditEvents: OperatingAuditEvent[];
}

export interface ExecutiveSummary {
  freshSignals: number;
  staleSignals: number;
  conflictingSignals: number;
  decisionReady: number;
  delegatablePackets: number;
  awaitingVerification: number;
  activeRuns: number;
}

export function priorityScore(outcome: OperatingOutcome): number {
  const factors = outcome.priorityFactors;
  return factors.strategicValue * 3
    + factors.urgency * 2
    + factors.costOfDelay * 2
    + factors.dependencyReach
    + factors.reversibility;
}

export function deriveExecutiveSummary(data: OperatingSystemData): ExecutiveSummary {
  return {
    freshSignals: data.signals.filter((signal) => signal.freshness === 'fresh').length,
    staleSignals: data.signals.filter((signal) => ['stale', 'expired'].includes(signal.freshness)).length,
    conflictingSignals: data.signals.filter((signal) => signal.contradictionState !== 'clear').length,
    decisionReady: data.decisions.filter((decision) => decision.state === 'ready').length,
    delegatablePackets: data.workPackets.filter((packet) => packet.state === 'sealed').length,
    awaitingVerification: data.commitments.filter((commitment) => ['submitted', 'accepted'].includes(commitment.state)).length,
    activeRuns: data.agentRuns.filter((run) => ['queued', 'running'].includes(run.state)).length,
  };
}

type SealableWorkPacket = Pick<
  OperatingWorkPacket,
  | 'impactAreaContext'
  | 'autonomousDiscoveryScope'
  | 'outputDeliveryDirection'
  | 'repository'
  | 'allowedScope'
  | 'forbiddenScope'
  | 'acceptanceCriteria'
  | 'requiredArtifacts'
>;

export function isWorkPacketSealable(packet: SealableWorkPacket): boolean {
  return Boolean(
    packet.impactAreaContext.trim()
    && packet.autonomousDiscoveryScope.trim()
    && packet.outputDeliveryDirection.trim()
    && packet.repository.trim()
    && packet.allowedScope.length
    && packet.forbiddenScope.length
    && packet.acceptanceCriteria.length
    && packet.requiredArtifacts.length,
  );
}
