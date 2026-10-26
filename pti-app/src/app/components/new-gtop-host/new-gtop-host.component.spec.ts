import { BehaviorSubject } from 'rxjs';
import { GtopHostReading, GtopHostService } from '../../services/gtop-host.service';
import { NewGtopHostComponent, hostPresentation } from './new-gtop-host.component';

describe('GT Papers assistant Home panel', () => {
  const offline: GtopHostReading = { status: 'ready', checkedAt: null, service: { workerId: 'sachit-windows', state: 'offline', starter: { state: 'online', lastSeenAt: null }, worker: { state: 'offline', lastSeenAt: null, modelReady: false }, request: null, canStart: true } };
  it('distinguishes unavailable PC, accepted start and unloaded idle model', () => {
    expect(hostPresentation({ ...offline, service: { ...offline.service!, state: 'starter_offline' } }).detail).toContain('awake');
    expect(hostPresentation({ ...offline, service: { ...offline.service!, state: 'starting' } }).label).toBe('Starting…');
    const idle = hostPresentation({ ...offline, service: { ...offline.service!, state: 'ready' } });
    expect(idle.label).toBe('Available');expect(idle.detail).toContain('loads when a request arrives');
    expect(hostPresentation({ status: 'unavailable', service: null, checkedAt: null }).label).toBe('Status unavailable');
  });
  it('prevents duplicate starts and clears private status when signed out', async () => {
    const readings = new BehaviorSubject(offline);
    let resolveStart!: (value: GtopHostReading) => void;
    const start = jasmine.createSpy('start').and.callFake(() => new Promise<GtopHostReading>(resolve => resolveStart = resolve));
    const component = new NewGtopHostComponent({ watch: () => readings.asObservable(), start } as unknown as GtopHostService);
    component.ngOnInit();
    const pending = component.start();void component.start();expect(start).toHaveBeenCalledTimes(1);
    readings.next({ status: 'hidden', service: null, checkedAt: null });
    resolveStart({ ...offline, service: { ...offline.service!, state: 'starting', canStart: false } });
    await pending;expect(component.reading.status).toBe('hidden');expect(component.canStart).toBeFalse();
    component.ngOnDestroy();
  });
  it('requires status confirmation after an uncertain start response', async () => {
    const component = new NewGtopHostComponent({ watch: () => new BehaviorSubject(offline), start: async () => { throw Error('Synthetic network interruption'); } } as unknown as GtopHostService);
    component.ngOnInit();await component.start();
    expect(component.reading.status).toBe('unavailable');expect(component.canStart).toBeFalse();expect(component.error).toContain('could not be confirmed');component.ngOnDestroy();
  });
});
