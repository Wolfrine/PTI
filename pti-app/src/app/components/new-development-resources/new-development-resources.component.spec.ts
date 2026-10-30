import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { CodexUsageService } from '../../services/codex-usage.service';
import { PlatformUsageService, PlatformUsageState } from '../../services/platform-usage.service';
import { NewDevelopmentResourcesComponent } from './new-development-resources.component';

describe('Development Resources on Home', () => {
  const absent = (): PlatformUsageState => ({ status: 'unconnected', reading: null, fromCache: false });
  const partial = (): PlatformUsageState => ({
    status: 'ready', fromCache: false,
    reading: {
      collectedAt: new Date().toISOString(),
      github: { status: 'partial', period: '2026-10', billedActionsMinutes: null, billedActionsUsd: null,
        workflowRuns24h: 4, failedRuns24h: 0, workflowRepoScope: 'Wolfrine/PTI' },
      firebase: { status: 'partial', projects: [
        { projectId: 'pti-app-2ab59', status: 'ok', reads24h: 300, writes24h: 12, deletes24h: 0 },
        { projectId: 'gtop-app', status: 'error', reads24h: null, writes24h: null, deletes24h: null },
      ] },
    },
  });
  const projectWide = (): PlatformUsageState => ({
    status: 'ready', fromCache: false,
    reading: {
      collectedAt: new Date().toISOString(),
      github: { status: 'ok', period: '2026-10', billedActionsMinutes: 41, billedActionsUsd: 0.32,
        workflowRuns24h: 99, failedRuns24h: 9, workflowRepoScope: 'Wolfrine/PTI', repositoryCount: 4, coveredRepoCount: 2,
        repos: [
          { repo: 'Wolfrine/PTI', status: 'ok', runs24h: 5, failed24h: 1 },
          { repo: 'Wolfrine/NoData', status: 'error', runs24h: null, failed24h: null },
        ] },
      firebase: { status: 'partial', dayPacific: '2026-10-30', nextResetAt: '2026-10-31T07:00:00.000Z', projects: [
        { projectId: 'pti-app-2ab59', status: 'ok', reads24h: 32000, writes24h: 1100, deletes24h: 2, databases: [
          { databaseId: '(default)', status: 'ok', freeTier: true, edition: 'STANDARD', readsToday: 25000, writesToday: 1000, deletesToday: 0 },
          { databaseId: 'paid', status: 'ok', freeTier: false, edition: 'STANDARD', readsToday: 700, writesToday: 5, deletesToday: 0 },
        ] },
        { projectId: 'gtop-app', status: 'error', reads24h: null, writes24h: null, deletes24h: null, databases: [
          { databaseId: '(default)', status: 'error', freeTier: true, edition: 'STANDARD', readsToday: null, writesToday: 0, deletesToday: null },
        ] },
      ] },
    },
  });
  const configure = async (stream: Observable<PlatformUsageState>) => {
    await TestBed.configureTestingModule({
      imports: [NewDevelopmentResourcesComponent],
      providers: [
        { provide: PlatformUsageService, useValue: { watch: () => stream } },
        { provide: CodexUsageService, useValue: { watch: () => of({ status: 'unconnected', reading: null, fromCache: false }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(NewDevelopmentResourcesComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('renders an empty snapshot without making missing usage look like zero', async () => {
    const fixture = await configure(of(absent()));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Awaiting first update');
    expect(text).toContain('No project reading yet');
    expect(text).toContain('No usage is assumed');
    expect(text).not.toContain('0 of 0');
    expect(text).not.toContain('Projects configured0');
    fixture.destroy();
  });

  it('labels partial data, project coverage and the narrow GitHub workflow scope', async () => {
    const fixture = await configure(of(partial()));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Some sources unavailable');
    expect(text).toContain('Partial');
    expect(text).toContain('Wolfrine/PTI');
    expect(text).toContain('4');
    expect(text).toContain('300');
    expect(text).toContain('Reads from 1 of 2 projects');
    expect(text).not.toContain('$0.00');
    fixture.destroy();
  });

  it('expands both provider breakdowns and reveals unavailable metrics explicitly', async () => {
    const fixture = await configure(of(partial()));
    const disclosures = fixture.nativeElement.querySelectorAll('details') as NodeListOf<HTMLDetailsElement>;
    expect(disclosures.length).toBe(2);
    disclosures[0].querySelector('summary')!.click();
    disclosures[1].querySelector('summary')!.click();
    fixture.detectChanges();
    expect(disclosures[0].open).toBeTrue();
    expect(disclosures[1].open).toBeTrue();
    expect(disclosures[0].textContent).toContain('Actions billed amount');
    expect(disclosures[0].textContent).toContain('Unavailable');
    expect(fixture.nativeElement.textContent).toContain('gtop-app');
    expect(disclosures[1].textContent).toContain('not billable usage');
    fixture.destroy();
  });

  it('shows repository coverage and per-database free-tier progress without pooling quotas', async () => {
    const fixture = await configure(of(projectWide()));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain(`5\u00a0reported runs`);
    expect(text).toContain('2 of 4 repositories covered');
    expect(text).toContain('Wolfrine/NoData');
    expect(text).toContain('Failed Unavailable');
    expect(text).toContain('41 min');
    expect(text).toContain('25,000');
    expect(text).toContain('Standard · free tier');
    expect(text).toContain('No free tier');
    expect(text).toContain('Pacific day 2026-10-30');
    expect(text).toContain('Resets at midnight Pacific');
    expect(text).toContain('not billable usage');
    const bars = fixture.nativeElement.querySelectorAll('.quota-track') as NodeListOf<HTMLElement>;
    expect(bars.length).toBe(6);
    expect(bars[0].getAttribute('aria-valuenow')).toBe('50');
    expect(bars[3].getAttribute('aria-valuenow')).toBeNull();
    expect(bars[4].getAttribute('aria-valuenow')).toBe('0');
    expect(text).not.toContain('100,000');
    fixture.destroy();
  });

  it('does not relabel fully unavailable or disconnected providers as partial coverage', async () => {
    const fixture = await configure(of(projectWide()));
    const component = fixture.componentInstance;
    expect(component.providerStatus(true, 'error')).toBe('Unavailable');
    expect(component.providerStatus(true, 'not-connected')).toBe('Not connected');
    expect(component.providerStatus(true, 'ok')).toBe('Partial coverage');
    fixture.destroy();
  });

  it('keeps above-limit counts exact, caps the bar, and labels the estimated excess', async () => {
    const state = projectWide();
    const project = state.reading!.firebase.projects[0];
    project.reads24h = 75120; project.writes24h = 21114;
    project.databases![0].readsToday = 75000; project.databases![0].writesToday = 21000;
    const fixture = await configure(of(state));
    const text = fixture.nativeElement.textContent as string;
    const bars = fixture.nativeElement.querySelectorAll('.quota-track') as NodeListOf<HTMLElement>;
    expect(text).toContain('75,000 / 50,000');
    expect(text).toContain('25,000 above estimated free-tier allowance');
    expect(text).toContain('1,000 above estimated free-tier allowance');
    expect(bars[0].getAttribute('aria-valuenow')).toBe('100');
    expect(bars[1].getAttribute('aria-valuenow')).toBe('100');
    expect(fixture.componentInstance.aboveFreeAllowance(50000, 'reads')).toBeNull();
    fixture.destroy();
  });

  it('clears old account data and unsubscribes when the dashboard is destroyed', async () => {
    const teardown = jasmine.createSpy('teardown');
    const state = new BehaviorSubject<PlatformUsageState>(partial());
    const stream = new Observable<PlatformUsageState>(subscriber => {
      const subscription = state.subscribe(subscriber);
      return () => { subscription.unsubscribe(); teardown(); };
    });
    const fixture = await configure(stream);
    expect(fixture.nativeElement.textContent).toContain('300');
    state.next(absent()); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('300');
    fixture.destroy();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
