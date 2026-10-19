import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AuthService } from './services/auth.service';
import { AppComponent } from './app.component';

describe('PTI app updates', () => {
  let events: Subject<any>;
  let updates: { isEnabled: boolean; versionUpdates: Subject<any>; checkForUpdate: jasmine.Spy; activateUpdate: jasmine.Spy };
  beforeEach(async () => {
    events = new Subject();
    updates = { isEnabled: true, versionUpdates: events, checkForUpdate: jasmine.createSpy().and.resolveTo(false), activateUpdate: jasmine.createSpy().and.resolveTo(true) };
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), {provide: SwUpdate, useValue: updates}, {provide: AuthService, useValue: {initGoogleOneTap() {}, checkUserSession() {}}}]
    }).compileComponents();
  });

  it('offers an explicit update only after the new version is ready', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges(); tick(1000);
    expect(updates.checkForUpdate).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.app-update')).toBeNull();
    events.next({type: 'VERSION_READY'}); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.app-update button').textContent).toContain('Update PTI');
    expect(updates.activateUpdate).not.toHaveBeenCalled();
  }));
  it('keeps the current app usable when activation fails', fakeAsync(() => {
    updates.activateUpdate.and.rejectWith(new Error('offline'));
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges(); tick(1000);
    events.next({type: 'VERSION_READY'}); fixture.detectChanges();
    fixture.nativeElement.querySelector('.app-update button').click(); tick(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.app-update').textContent).toContain('Reconnect and try again');
    expect(fixture.nativeElement.querySelector('button').disabled).toBeFalse();
  }));
});
