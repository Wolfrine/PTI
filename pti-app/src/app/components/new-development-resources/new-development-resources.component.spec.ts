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
    expect(disclosures[1].textContent).toContain('gtop-app');
    expect(disclosures[1].textContent).toContain('exact billable operations');
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
