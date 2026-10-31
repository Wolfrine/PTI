import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { SignInState, signInErrorMessage } from '../../services/sign-in-feedback';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  const state = new BehaviorSubject<SignInState>({ busy: false, error: null });
  const auth = { signInState$: state.asObservable(), getUser: () => of(null), initGoogleOneTap: jasmine.createSpy('initGoogleOneTap'), signInWithGoogle: jasmine.createSpy('signInWithGoogle').and.resolveTo() };

  beforeEach(async () => {
    state.next({ busy: false, error: null });
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
  it('shows progress and disables repeated taps while Google is pending', () => {
    state.next({ busy: true, error: null }); fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.signin-btn');
    expect(button.disabled).toBeTrue(); expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toContain('Signing in');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Waiting for Google');
  });
  it('shows an accessible, retryable error for popup and browser-key failures', () => {
    for (const code of ['auth/popup-closed-by-user', 'auth/popup-blocked', 'auth/app-not-authorized']) {
      state.next({ busy: false, error: signInErrorMessage({code}) }); fixture.detectChanges();
      const button = fixture.nativeElement.querySelector('.signin-btn'), alert = fixture.nativeElement.querySelector('[role="alert"]');
      expect(button.disabled).toBeFalse(); expect(button.getAttribute('aria-describedby')).toBe(alert.id);
      expect(alert.textContent.trim()).toBe(signInErrorMessage({code}));
    }
    state.next({ busy: true, error: null }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });
});
