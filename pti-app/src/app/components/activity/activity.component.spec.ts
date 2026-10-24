import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActivityComponent } from './activity.component';
import { ActivityService } from '../../services/activity.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { provideRouter } from '@angular/router';

describe('ActivityComponent', () => {
  let component: ActivityComponent;
  let fixture: ComponentFixture<ActivityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityComponent],
      providers: [provideRouter([]), { provide: ActivityService, useValue: { fetchCategories: () => Promise.resolve([]), fetchActivities: () => Promise.resolve({ activities: [], lastVisible: null }), fetch30DayReport: () => Promise.resolve({}) } }, { provide: LocalStorageService, useValue: { isTimeDataForTodayAvailable: () => false, setActivityReport: () => undefined, setTimeDataForToday: () => undefined } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ActivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps the standalone activity form and links back to Home', () => {
    expect(fixture.nativeElement.querySelector('form')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/home"]')).toBeTruthy();
  });
});
