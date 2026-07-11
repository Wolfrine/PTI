import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageDomainsComponent } from './manage-domains.component';
import { DomainService } from '../../../services/domain.service';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';

describe('ManageDomainsComponent', () => {
  let component: ManageDomainsComponent;
  let fixture: ComponentFixture<ManageDomainsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageDomainsComponent],
      providers: [{
        provide: DomainService,
        useValue: {
          getDomains: () => of([]),
          addDomain: async () => undefined,
          updateDomain: async () => undefined,
          deleteDomain: async () => undefined,
        },
      }, provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageDomainsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
