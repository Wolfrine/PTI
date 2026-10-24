import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable } from 'rxjs';
import { CodexUsageService, UsageState } from '../../services/codex-usage.service';
import { NewCodexUsageComponent, readingStale, resetLabel, USAGE_STALE_MS, windowLabel } from './new-codex-usage.component';

describe('Codex usage display', () => {
  const now = Date.now();
  const fresh = (): UsageState => ({ status: 'ready', fromCache: false, reading: {
    allowance: { status: 'ok', lastSuccessAt: new Date(now).toISOString(), buckets: [{ limitId: 'codex', label: 'Codex', windows: [{ id: 'primary', usedPercent: 24, remainingPercent: 76, windowDurationMins: 10080, resetsAt: Math.floor(now / 1000) + 3600 }] }] },
    daily: { status: 'ok', lastSuccessAt: new Date(now).toISOString(), latest: { startDate: '2026-10-23', tokens: 1500 } },
  } });
  it('marks fifteen-minute readings stale and does not invent a reset balance', () => {
    expect(readingStale({ status: 'ok', lastSuccessAt: new Date(now - USAGE_STALE_MS).toISOString() }, now)).toBeTrue();
    expect(resetLabel(Math.floor(now / 1000) - 10, now)).toBe('Awaiting updated allowance');
    expect(resetLabel(null, now)).toBe('Reset time unavailable');
    expect(windowLabel(fresh().reading!.allowance.buckets[0].windows[0])).toBe('Weekly allowance');
  });
  it('does not endorse pre-reset percentages as up to date after their reset passes', () => {
    const component = new NewCodexUsageComponent({} as CodexUsageService, 'server' as unknown as object);
    component.state = fresh(); component.now = now;
    component.state.reading!.allowance.buckets[0].windows[0].resetsAt = Math.floor(now / 1000) - 60;
    expect(component.status).toBe('Awaiting allowance');
  });
  it('only labels a last good value when one is actually available to display', () => {
    const component = new NewCodexUsageComponent({} as CodexUsageService, 'server' as unknown as object);
    expect(component.sectionStatus({ status: 'error', lastSuccessAt: new Date(now).toISOString() }, false)).toBe('Update failed · no saved reading');
    expect(component.sectionStatus({ status: 'error', lastSuccessAt: new Date(now).toISOString() }, true)).toBe('Update failed · last good reading');
  });
  it('renders real counts with their source date, independent partial status and stale warning', async () => {
    const stream = new BehaviorSubject<UsageState>(fresh());
    await TestBed.configureTestingModule({ imports: [NewCodexUsageComponent], providers: [{ provide: CodexUsageService, useValue: { watch: () => stream } }] }).compileComponents();
    const fixture = TestBed.createComponent(NewCodexUsageComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('24');
    expect(fixture.nativeElement.textContent).toContain('76% remaining');
    expect(fixture.nativeElement.textContent).toContain('Reported for 2026-10-23');
    const partial = fresh(); partial.reading!.daily = { status: 'unsupported', lastSuccessAt: null, latest: null };
    stream.next(partial); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Partial');
    expect(fixture.nativeElement.textContent).toContain('Not supported by this Codex version');
    expect(fixture.nativeElement.textContent).not.toContain('1,500');
    fixture.componentInstance.now = now + USAGE_STALE_MS; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Stale reading');
    fixture.destroy();
  });
  it('unsubscribes its sole reading stream on navigation destruction', async () => {
    const teardown = jasmine.createSpy('teardown');
    const stream = new Observable<UsageState>(subscriber => { subscriber.next(fresh()); return teardown; });
    await TestBed.configureTestingModule({ imports: [NewCodexUsageComponent], providers: [{ provide: CodexUsageService, useValue: { watch: () => stream } }] }).compileComponents();
    const fixture = TestBed.createComponent(NewCodexUsageComponent); fixture.detectChanges(); fixture.destroy();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
  it('clears previous-account numbers when the service changes to a signed-out state', async () => {
    const stream = new BehaviorSubject<UsageState>(fresh());
    await TestBed.configureTestingModule({ imports: [NewCodexUsageComponent], providers: [{ provide: CodexUsageService, useValue: { watch: () => stream } }] }).compileComponents();
    const fixture = TestBed.createComponent(NewCodexUsageComponent); fixture.detectChanges();
    stream.next({ status: 'unconnected', reading: null, fromCache: false }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('1,500');
    expect(fixture.nativeElement.textContent).toContain('No reading yet'); fixture.destroy();
  });
});
