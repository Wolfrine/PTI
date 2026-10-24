import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActivityReportComponent } from './activity-report.component';
import { ActivityService } from '../../services/activity.service';
import { LocalStorageService } from '../../services/local-storage.service';

describe('ActivityReportComponent', () => {
  let component: ActivityReportComponent;
  let fixture: ComponentFixture<ActivityReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityReportComponent],
      providers: [{ provide: ActivityService, useValue: { fetch30DayReport: () => Promise.resolve({ Reading: 1.5 }) } }, { provide: LocalStorageService, useValue: { isTimeDataForTodayAvailable: () => false, setActivityReport: () => undefined } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ActivityReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => component.activityChart?.destroy());

  it('retains the activity report rather than removing its chart with dashboard retirement', async () => {
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('canvas')).toBeTruthy();
    expect(component.barChartData.datasets[0].data).toEqual([1.5]);
  });
});
