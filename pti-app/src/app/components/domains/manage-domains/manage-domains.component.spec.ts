import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageDomainsComponent } from './manage-domains.component';
import { DomainService } from '../../../services/domain.service';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

describe('ManageDomainsComponent', () => {
  let component: ManageDomainsComponent;
  let fixture: ComponentFixture<ManageDomainsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageDomainsComponent],
      providers: [provideRouter([]), { provide: DomainService, useValue: { getDomains: () => of([]) } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageDomainsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('retains domain management and a Home breadcrumb', () => {
    expect(fixture.nativeElement.querySelector('a[href="/home"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Manage Domains');
  });
});
