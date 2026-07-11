import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActivityComponent } from './activity.component';
import { ActivityService } from '../../services/activity.service';
import { provideRouter } from '@angular/router';

describe('ActivityComponent', () => {
  let component: ActivityComponent;
  let fixture: ComponentFixture<ActivityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityComponent],
      providers: [{
        provide: ActivityService,
        useValue: {
          fetchCategories: async () => [],
          fetchActivities: async () => ({ activities: [], lastVisible: undefined }),
          fetch30DayReport: async () => ({}),
          addActivity: async () => undefined,
          addCategory: async () => undefined,
        },
      }, provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ActivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
