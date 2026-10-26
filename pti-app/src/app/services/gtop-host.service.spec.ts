import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { GTOP_HOST_OWNER, GtopHostReading, GtopHostService } from './gtop-host.service';

describe('GTOP host connection', () => {
  const service = { workerId: 'sachit-windows', state: 'offline', starter: { state: 'online', lastSeenAt: null }, worker: { state: 'offline', lastSeenAt: null, modelReady: false }, request: null, canStart: true };
  it('does not fetch status or expose the owner panel for other users', async () => {
    const users = new BehaviorSubject({ uid: 'other-user', getIdToken: async () => 'other-token' });
    const host = new GtopHostService({ user$: users } as unknown as AuthService, 'browser' as unknown as object);
    const fetchSpy = spyOn(globalThis, 'fetch');
    let reading: GtopHostReading | undefined;
    const subscription = host.watch().subscribe(value => reading = value);
    expect(reading?.status).toBe('hidden');expect(fetchSpy).not.toHaveBeenCalled();
    await expectAsync(host.start('synthetic-request')).toBeRejectedWithError('Owner access required.');
    subscription.unsubscribe();
  });
  it('uses the current owner token for fixed status/start endpoints and preserves accepted starting state', async () => {
    const user = { uid: GTOP_HOST_OWNER, getIdToken: async () => 'synthetic-id-token' };
    const host = new GtopHostService({ user$: new BehaviorSubject(user) } as unknown as AuthService, 'browser' as unknown as object);
    const fetchSpy = spyOn(globalThis, 'fetch').and.callFake(async () => new Response(JSON.stringify({ service: { ...service, state: 'starting', canStart: false } }), { status: 200 }));
    const result = await host.start('synthetic-request');
    expect(result.service?.state).toBe('starting');
    expect(fetchSpy.calls.mostRecent().args[0]).toBe('https://gtop-question-papers.web.app/api/host/start');
    const request = fetchSpy.calls.mostRecent().args[1]!;
    expect(request.method).toBe('POST');expect(request.body).toBe(JSON.stringify({ clientRequestId: 'synthetic-request' }));
    expect((request.headers as Record<string, string>)['Authorization']).toBe('Bearer synthetic-id-token');
    await host.refresh();expect(fetchSpy.calls.mostRecent().args[0]).toContain('/host/status');
  });
  it('keeps unknown cloud states unavailable instead of inferring readiness', async () => {
    const host = new GtopHostService({ user$: new BehaviorSubject({ uid: GTOP_HOST_OWNER, getIdToken: async () => 'synthetic' }) } as unknown as AuthService, 'browser' as unknown as object);
    spyOn(globalThis, 'fetch').and.resolveTo(new Response(JSON.stringify({ service: { ...service, state: 'perhaps' } }), { status: 200 }));
    await expectAsync(host.refresh()).toBeRejectedWithError('Assistant status is unavailable.');
  });
  it('pauses reads while hidden and aborts an outstanding read when the owner signs out', async () => {
    const hidden = spyOnProperty(document, 'hidden', 'get').and.returnValue(true);
    const users = new BehaviorSubject<any>({ uid: GTOP_HOST_OWNER, getIdToken: async () => 'synthetic' });
    const host = new GtopHostService({ user$: users } as unknown as AuthService, 'browser' as unknown as object);
    const fetchSpy = spyOn(globalThis, 'fetch').and.callFake(() => new Promise<Response>(() => {}));
    let reading: GtopHostReading | undefined;
    const subscription = host.watch().subscribe(value => reading = value);
    await Promise.resolve();expect(fetchSpy).not.toHaveBeenCalled();
    hidden.and.returnValue(false);document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();await Promise.resolve();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const signal = fetchSpy.calls.mostRecent().args[1]!.signal!;
    expect(signal.aborted).toBeFalse();
    users.next(null);expect(reading?.status).toBe('hidden');expect(signal.aborted).toBeTrue();
    subscription.unsubscribe();
  });
});
