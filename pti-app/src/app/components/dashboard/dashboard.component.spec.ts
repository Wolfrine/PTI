import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardComponent } from './dashboard.component';
import { DomainService } from '../../services/domain.service';
import { AuthService } from '../../services/auth.service';
import { TargetTaskService } from '../../services/target-task.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { ActivityService } from '../../services/activity.service';
import { of } from 'rxjs';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: DomainService, useValue: { getDomains: () => of([]) } },
        {
          provide: AuthService,
          useValue: {
            user$: of(null),
            initGoogleOneTap: () => undefined,
            checkUserSession: () => undefined,
            signOut: async () => undefined,
          },
        },
        { provide: TargetTaskService, useValue: { getCompletedTasksSince: async () => [] } },
        { provide: ActivityService, useValue: { fetch30DayReport: async () => ({}) } },
        {
          provide: LocalStorageService,
          useValue: {
            isTimeDataForTodayAvailable: () => true,
            getTimeSpentLastNDays: () => 0,
            setTimeSpentLastNDays: () => undefined,
            setTimeDataForToday: () => undefined,
            getActivityReport: () => ({}),
            setActivityReport: () => undefined,
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
