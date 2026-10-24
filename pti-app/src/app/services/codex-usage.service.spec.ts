import { readUsageDocument } from './codex-usage.service';

describe('Codex usage cloud contract', () => {
  const base = () => ({ schemaVersion: 1, source: 'codex-app-server',
    allowance: { status: 'ok', lastSuccessAt: '2026-10-24T07:00:00.000Z', buckets: [{ limitId: 'codex', label: 'Codex', windows: [{ id: 'primary', usedPercent: 26.5, remainingPercent: 999, windowDurationMins: 10080, resetsAt: 1793000000 }] }] },
    daily: { status: 'ok', lastSuccessAt: '2026-10-24T07:00:00.000Z', latest: { startDate: '2026-10-23', tokens: 0 } } });

  it('derives remaining percent while keeping the source date and real zero tokens', () => {
    const reading = readUsageDocument(base())!;
    expect(reading.allowance.buckets[0].windows[0].remainingPercent).toBe(73.5);
    expect(reading.daily.latest).toEqual({ startDate: '2026-10-23', tokens: 0 });
  });
  it('preserves reported overage while clamping only remaining allowance', () => {
    const input = base(); input.allowance.buckets[0].windows[0].usedPercent = 120;
    const window = readUsageDocument(input)!.allowance.buckets[0].windows[0];
    expect(window.usedPercent).toBe(120);
    expect(window.remainingPercent).toBe(0);
  });
  it('keeps every source allowance bucket instead of applying a display limit', () => {
    const input = base(); input.allowance.buckets = Array.from({ length: 25 }, (_, index) => ({ ...input.allowance.buckets[0], limitId: `limit-${index}` }));
    expect(readUsageDocument(input)!.allowance.buckets.length).toBe(25);
  });
  it('rejects another schema or source rather than interpreting it as current usage', () => {
    expect(readUsageDocument({ ...base(), schemaVersion: 2 })).toBeNull();
    expect(readUsageDocument({ ...base(), source: 'mock' })).toBeNull();
    expect(readUsageDocument(null)).toBeNull();
  });
  it('does not convert null percentages, dates, tokens or windows to zero', () => {
    const input: any = base();
    input.allowance.buckets[0].windows[0] = { id: 'primary', usedPercent: null, remainingPercent: 100, resetsAt: null };
    input.daily.latest = null;
    const reading = readUsageDocument(input)!;
    expect(reading.allowance.buckets[0].windows[0].usedPercent).toBeNull();
    expect(reading.allowance.buckets[0].windows[0].remainingPercent).toBeNull();
    expect(reading.allowance.buckets[0].windows[0].resetsAt).toBeNull();
    expect(reading.daily.latest).toBeNull();
  });
  it('handles invalid dates and unsafe token values without a render exception', () => {
    for (const date of ['2026-99-99', '2026-02-31']) {
      const input = base(); input.daily.latest.startDate = date;
      expect(readUsageDocument(input)!.daily.latest).toBeNull();
    }
    const input = base(); input.daily.latest.tokens = Number.MAX_SAFE_INTEGER + 1;
    expect(readUsageDocument(input)!.daily.latest).toBeNull();
  });
  it('preserves a last good section independently from an unavailable daily section', () => {
    const input: any = base(); input.daily = { status: 'unsupported', lastSuccessAt: null, latest: null };
    const reading = readUsageDocument(input)!;
    expect(reading.allowance.lastSuccessAt).toBe('2026-10-24T07:00:00.000Z');
    expect(reading.daily.status).toBe('unsupported');
    expect(reading.daily.lastSuccessAt).toBeNull();
  });
});
