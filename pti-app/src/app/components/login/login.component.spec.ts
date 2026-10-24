import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  const auth = { getUser: () => of(null), initGoogleOneTap: jasmine.createSpy('initGoogleOneTap'), signInWithGoogle: jasmine.createSpy('signInWithGoogle').and.resolveTo() };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }, { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ redirect: '/codex-command/projects/old' }) } } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps Google sign-in and sends retired return destinations to Home', () => {
    fixture.nativeElement.querySelector('.signin-btn').click();
    expect(auth.signInWithGoogle).toHaveBeenCalledWith('/home');
  });
});
