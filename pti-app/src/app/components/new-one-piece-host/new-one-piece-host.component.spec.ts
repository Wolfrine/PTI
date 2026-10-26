import { BehaviorSubject } from 'rxjs';
import { OnePieceHostReading, OnePieceHostService } from '../../services/one-piece-host.service';
import { NewOnePieceHostComponent, onePieceHostPresentation } from './new-one-piece-host.component';

describe('One Piece home PC panel', () => {
  const offline: OnePieceHostReading = { status: 'ready', checkedAt: null, service: { workerId: 'sachit-windows', state: 'offline', starter: { state: 'online', lastSeenAt: null }, companion: { state: 'offline', lastSeenAt: null }, request: null, canStart: true } };

  it('distinguishes ready, accepted start, missing starter, failure and unknown status', () => {
    expect(onePieceHostPresentation({ ...offline, service: { ...offline.service!, state: 'ready' } }).label).toBe('Ready to watch');
    expect(onePieceHostPresentation({ ...offline, service: { ...offline.service!, state: 'starting' } }).label).toBe('Starting…');
    expect(onePieceHostPresentation({ ...offline, service: { ...offline.service!, state: 'starter_offline' } }).detail).toContain('awake');
    expect(onePieceHostPresentation({ ...offline, service: { ...offline.service!, state: 'failed' } }).label).toBe('Could not start');
    expect(onePieceHostPresentation({ status: 'unavailable', service: null, checkedAt: null }).label).toBe('Status unavailable');
  });

  it('does not start on initialization and suppresses duplicate starts', async () => {
    const readings = new BehaviorSubject(offline);
    let resolveStart!: (value: OnePieceHostReading) => void;
    const start = jasmine.createSpy('start').and.callFake(() => new Promise<OnePieceHostReading>(resolve => resolveStart = resolve));
    const component = new NewOnePieceHostComponent({ watch: () => readings.asObservable(), start } as unknown as OnePieceHostService);
    component.ngOnInit(); expect(start).not.toHaveBeenCalled();
    const pending = component.start(); void component.start(); expect(start).toHaveBeenCalledTimes(1);
    expect(start.calls.mostRecent().args[0]).toMatch(/^[0-9a-f-]{36}$/);
    readings.next({ status: 'hidden', service: null, checkedAt: null });
    resolveStart({ ...offline, service: { ...offline.service!, state: 'starting', canStart: false } });
    await pending; expect(component.reading.status).toBe('hidden'); expect(component.canStart).toBeFalse();
    component.ngOnDestroy();
  });

  it('requires status confirmation after an uncertain start and reuses its request ID safely', async () => {
    const start = jasmine.createSpy('start').and.rejectWith(Error('Synthetic interruption'));
    const component = new NewOnePieceHostComponent({ watch: () => new BehaviorSubject(offline), start, refresh: async () => offline } as unknown as OnePieceHostService);
    component.ngOnInit(); await component.start();
    expect(component.reading.status).toBe('unavailable'); expect(component.canStart).toBeFalse(); expect(component.error).toContain('could not be confirmed');
    await component.start(); expect(start).toHaveBeenCalledTimes(1);
    await component.refresh(); await component.start(); expect(start).toHaveBeenCalledTimes(2);
    expect(start.calls.argsFor(1)[0]).toBe(start.calls.argsFor(0)[0]);
    component.ngOnDestroy();
  });
});
