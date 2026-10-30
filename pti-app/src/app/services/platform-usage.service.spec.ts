import { readPlatformUsageDocument } from './platform-usage.service';

describe('PlatformUsageService document boundary', () => {
  const reading = () => ({
    schemaVersion: 1,
    source: 'pti-platform-usage',
    collectedAt: '2026-10-30T07:00:00.000Z',
    github: { status: 'partial', period: '2026-10', billedActionsMinutes: null, billedActionsUsd: null,
      workflowRuns24h: 13, failedRuns24h: 2, workflowRepoScope: 'Wolfrine/PTI' },
    firebase: { status: 'ok', projects: [
      { projectId: 'pti-app-2ab59', status: 'ok', reads24h: 1703, writes24h: 42, deletes24h: 0 },
    ] },
  });

  it('reads only the specified private snapshot schema', () => {
    expect(readPlatformUsageDocument(reading())?.github.workflowRuns24h).toBe(13);
    expect(readPlatformUsageDocument({ ...reading(), source: 'other' })).toBeNull();
    expect(readPlatformUsageDocument({ ...reading(), collectedAt: 'yesterday' })).toBeNull();
  });

  it('does not mistake unavailable API responses for real zero usage', () => {
    const parsed = readPlatformUsageDocument({ ...reading(), github: { ...reading().github,
      billedActionsMinutes: '0', workflowRuns24h: -1, failedRuns24h: 0 },
      firebase: { status: 'partial', projects: [
        { projectId: 'pti-app-2ab59', status: 'error', reads24h: undefined, writes24h: Infinity, deletes24h: 0 },
      ] } });
    expect(parsed?.github.billedActionsMinutes).toBeNull();
    expect(parsed?.github.workflowRuns24h).toBeNull();
    expect(parsed?.github.failedRuns24h).toBe(0);
    expect(parsed?.firebase.projects[0].reads24h).toBeNull();
    expect(parsed?.firebase.projects[0].writes24h).toBeNull();
    expect(parsed?.firebase.projects[0].deletes24h).toBe(0);
  });

  it('rejects untrusted project identifiers and unexpected scope claims', () => {
    const parsed = readPlatformUsageDocument({ ...reading(), github: { ...reading().github, workflowRepoScope: 'another/repo' },
      firebase: { status: 'ok', projects: [
        { projectId: '<script>', status: 'ok', reads24h: 10, writes24h: 5 },
        { projectId: 'gtop-app', status: 'ok', reads24h: 10, writes24h: 5, deletes24h: null },
      ] } });
    expect(parsed?.github.workflowRepoScope).toBe('');
    expect(parsed?.firebase.projects.length).toBe(1);
    expect(parsed?.firebase.projects[0].projectId).toBe('gtop-app');
  });

  it('keeps repository and database usage optional for older snapshots', () => {
    const parsed = readPlatformUsageDocument(reading());
    expect(parsed?.github.repos).toBeUndefined();
    expect(parsed?.firebase.projects[0].databases).toBeUndefined();
    expect(parsed?.firebase.dayPacific).toBeUndefined();
    expect(parsed?.firebase.nextResetAt).toBeUndefined();
  });

  it('parses repo-wide readings and Pacific-day database metrics without coercing null to zero', () => {
    const parsed = readPlatformUsageDocument({ ...reading(),
      github: { ...reading().github, repositoryCount: 12, coveredRepoCount: 2, repos: [
        { repo: 'Wolfrine/PTI', status: 'ok', runs24h: 4, failed24h: 0 },
        { repo: 'Wolfrine/Unknown', status: 'error', runs24h: null, failed24h: undefined },
        { repo: '../private', status: 'ok', runs24h: 9, failed24h: 0 },
      ] },
      firebase: { status: 'partial', dayPacific: '2026-10-30', nextResetAt: '2026-10-31T07:00:00.000Z', projects: [
        { projectId: 'gtop-app', status: 'ok', reads24h: 1, writes24h: 0, deletes24h: 0, databases: [
          { databaseId: '(default)', freeTier: true, edition: 'STANDARD', status: 'ok', readsToday: 1234, writesToday: null, deletesToday: 0 },
          { databaseId: 'paid', freeTier: false, edition: 'STANDARD', status: 'ok', readsToday: 700, writesToday: 2, deletesToday: 0 },
          { databaseId: '../bad', freeTier: true, edition: 'STANDARD', status: 'ok', readsToday: 999, writesToday: 1, deletesToday: 0 },
        ] },
      ] },
    });
    expect(parsed?.github.repositoryCount).toBe(12);
    expect(parsed?.github.coveredRepoCount).toBe(2);
    expect(parsed?.github.repos?.length).toBe(2);
    expect(parsed?.github.repos?.[1].runs24h).toBeNull();
    expect(parsed?.github.repos?.[1].failed24h).toBeNull();
    expect(parsed?.firebase.dayPacific).toBe('2026-10-30');
    expect(parsed?.firebase.nextResetAt).toBe('2026-10-31T07:00:00.000Z');
    expect(parsed?.firebase.projects[0].databases?.length).toBe(2);
    expect(parsed?.firebase.projects[0].databases?.[0].writesToday).toBeNull();
    expect(parsed?.firebase.projects[0].databases?.[0].deletesToday).toBe(0);
    expect(parsed?.firebase.projects[0].databases?.[1].freeTier).toBeFalse();
  });

  it('drops malformed optional Pacific reset dates instead of displaying them as verified', () => {
    const parsed = readPlatformUsageDocument({ ...reading(), firebase: {
      ...reading().firebase, dayPacific: '2026-02-30', nextResetAt: 'tomorrow',
    } });
    expect(parsed?.firebase.dayPacific).toBeUndefined();
    expect(parsed?.firebase.nextResetAt).toBeUndefined();
  });

  it('retains all project IDs within the collector cap', () => {
    const projects = Array.from({ length: 32 }, (_, index) => ({
      projectId: `project-${index}`, status: 'ok', reads24h: 0, writes24h: 0, deletes24h: 0,
    }));
    const parsed = readPlatformUsageDocument({ ...reading(), firebase: { status: 'ok', projects } });
    expect(parsed?.firebase.projects.length).toBe(32);
  });
});
