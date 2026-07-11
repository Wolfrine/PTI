import {
  OperatingOutcome,
  OperatingSystemData,
  assertLifecycleTransition,
  deriveExecutiveSummary,
  isWorkPacketSealable,
  priorityScore,
} from './operating-system.models';

describe('PTI operating-system derivations', () => {
  it('rejects lifecycle skips while allowing the next valid state', () => {
    expect(() => assertLifecycleTransition('workPacket', 'running', 'submitted')).not.toThrow();
    expect(() => assertLifecycleTransition('workPacket', 'running', 'release_ready'))
      .toThrowError('Invalid workPacket transition: running -> release_ready.');
    expect(() => assertLifecycleTransition('release', 'previewed', 'released'))
      .toThrowError('Invalid release transition: previewed -> released.');
  });

  it('prioritizes strategic value, urgency, and cost of delay explicitly', () => {
    const outcome = {
      priorityFactors: {
        strategicValue: 5,
        urgency: 4,
        costOfDelay: 3,
        dependencyReach: 2,
        reversibility: 1,
      },
    } as OperatingOutcome;

    expect(priorityScore(outcome)).toBe(32);
  });

  it('derives executive queues from underlying records', () => {
    const data = {
      signals: [
        { freshness: 'fresh', contradictionState: 'clear' },
        { freshness: 'stale', contradictionState: 'unresolved' },
      ],
      decisions: [{ state: 'ready' }],
      workPackets: [{ state: 'sealed' }],
      commitments: [{ state: 'submitted' }],
      agentRuns: [{ state: 'running' }],
    } as OperatingSystemData;

    expect(deriveExecutiveSummary(data)).toEqual({
      freshSignals: 1,
      staleSignals: 1,
      conflictingSignals: 1,
      decisionReady: 1,
      delegatablePackets: 1,
      awaitingVerification: 1,
      activeRuns: 1,
    });
  });

  it('rejects a packet without complete scope and evidence requirements', () => {
    const packet = {
      impactAreaContext: 'PTI Today surface',
      autonomousDiscoveryScope: 'Inspect PTI only',
      outputDeliveryDirection: 'Verified preview',
      repository: 'Wolfrine/PTI',
      allowedScope: ['PTI branch'],
      forbiddenScope: [],
      acceptanceCriteria: ['Build passes'],
      requiredArtifacts: ['Desktop screenshot'],
    };

    expect(isWorkPacketSealable(packet)).toBeFalse();
  });
});
