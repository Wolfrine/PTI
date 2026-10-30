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
});
