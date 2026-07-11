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
      providers: [
        { provide: ActivityService, useValue: { fetch30DayReport: async () => ({}) } },
        {
          provide: LocalStorageService,
          useValue: {
            isTimeDataForTodayAvailable: () => false,
            getActivityReport: () => ({}),
            setActivityReport: () => undefined,
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ActivityReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
