import { NgZone } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SignInState, signInErrorMessage } from './sign-in-feedback';

describe('Google sign-in feedback', () => {
  let service: AuthService;
  let state: SignInState;
  beforeEach(() => {
    spyOn(AuthService.prototype, 'checkUserSession');
    service = new AuthService({} as Auth, {} as Firestore, jasmine.createSpyObj<Router>('Router', ['navigate', 'navigateByUrl']), new NgZone({enableLongStackTrace:false}));
    service.signInState$.subscribe(value => state = value);
  });
  it('makes a popup API-key restriction visible and always clears busy state', async () => {
    const native = spyOn<any>(service, 'popupCredential').and.rejectWith({code:'auth/internal-error',message:'API_KEY_HTTP_REFERRER_BLOCKED secret-token-never-display'});
    await service.signInWithGoogle();
    expect(native).toHaveBeenCalledTimes(1); expect(state.busy).toBeFalse();
    expect(state.error).toContain('PTI sign-in is temporarily unavailable'); expect(state.error).not.toContain('secret-token');
  });
  it('shows One Tap credential failure through the same visible state', async () => {
    spyOn<any>(service, 'oneTapCredential').and.rejectWith({code:'auth/network-request-failed'});
    await service.handleCredentialResponse({credential:'synthetic-only'});
    expect(state.busy).toBeFalse(); expect(state.error).toContain('Check your connection');
  });
  it('shows One Tap initialization failure without preventing a popup retry', async () => {
    spyOn<any>(service, 'loadGoogleScript').and.rejectWith(new Error('synthetic script failure'));
    await service.initGoogleOneTap(); expect(state.error).toContain('Tap Continue with Google');
    spyOn<any>(service, 'popupCredential').and.rejectWith({code:'auth/popup-closed-by-user'});
    await service.signInWithGoogle(); expect(state.error).toContain('canceled'); expect(state.busy).toBeFalse();
  });
  it('allows one pending Google operation and clears the prior error on retry', async () => {
    const popup = spyOn<any>(service, 'popupCredential').and.rejectWith({code:'auth/popup-blocked'});
    await service.signInWithGoogle(); expect(state.error).toContain('Allow pop-ups');
    let fail!: (error: unknown) => void;
    popup.and.returnValue(new Promise((_resolve,reject) => fail = reject));
    const pending = service.signInWithGoogle(); expect(state.busy).toBeTrue(); expect(state.error).toBeNull();
    await service.signInWithGoogle(); await service.handleCredentialResponse({credential:'synthetic-only'});
    expect(popup).toHaveBeenCalledTimes(2);
    fail({code:'auth/popup-closed-by-user'}); await pending; expect(state.busy).toBeFalse();
  });
  it('uses bounded messages for cancellations, blocked popups and unknown errors', () => {
    expect(signInErrorMessage({code:'auth/cancelled-popup-request'})).toContain('canceled');
    expect(signInErrorMessage({code:'auth/popup-blocked'})).toContain('Allow pop-ups');
    expect(signInErrorMessage({code:'unknown',message:'private raw error'})).toBe('Google sign-in could not finish. Please try again.');
  });
});
