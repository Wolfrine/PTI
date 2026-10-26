import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { GTOP_HOST_OWNER } from './gtop-host.service';
import { OnePieceHostReading, OnePieceHostService } from './one-piece-host.service';

describe('One Piece host connection', () => {
  const service = { workerId: 'sachit-windows', state: 'offline', starter: { state: 'online', lastSeenAt: null }, companion: { state: 'offline', lastSeenAt: null }, request: null, canStart: true };
  const owner = { uid: GTOP_HOST_OWNER, getIdToken: async () => 'synthetic-id-token' };
  const createHost = (users = new BehaviorSubject<any>(owner)) => new OnePieceHostService({ user$: users } as unknown as AuthService, 'browser' as unknown as object);

  it('does not fetch or expose the owner panel to other users or on the server', async () => {
    const host = createHost(new BehaviorSubject({ uid: 'other-user', getIdToken: async () => 'other-token' }));
    const fetchSpy = spyOn(globalThis, 'fetch');
    let reading: OnePieceHostReading | undefined;
    const subscription = host.watch().subscribe(value => reading = value);
    expect(reading?.status).toBe('hidden'); expect(fetchSpy).not.toHaveBeenCalled();
    await expectAsync(host.start('synthetic-request')).toBeRejectedWithError('Owner access required.');
    subscription.unsubscribe();
    new OnePieceHostService({ user$: new BehaviorSubject(owner) } as unknown as AuthService, 'server' as unknown as object).watch().subscribe(value => expect(value.status).toBe('hidden'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses the owner PTI token and fixed status/start endpoints without auto-starting', async () => {
    const host = createHost();
    const fetchSpy = spyOn(globalThis, 'fetch').and.callFake(async () => new Response(JSON.stringify({ service: { ...service, state: 'starting', canStart: false } }), { status: 200 }));
    const result = await host.start('synthetic-request');
    expect(result.service?.state).toBe('starting');
    expect(fetchSpy.calls.mostRecent().args[0]).toBe('https://us-central1-pti-app-2ab59.cloudfunctions.net/onePieceHost/start');
    const request = fetchSpy.calls.mostRecent().args[1]!;
    expect(request.method).toBe('POST'); expect(request.body).toBe(JSON.stringify({ clientRequestId: 'synthetic-request' }));
    expect((request.headers as Record<string, string>)['Authorization']).toBe('Bearer synthetic-id-token');
    await host.refresh(); expect(fetchSpy.calls.mostRecent().args[0]).toBe('https://us-central1-pti-app-2ab59.cloudfunctions.net/onePieceHost/status');
    expect(fetchSpy.calls.mostRecent().args[1]!.method).toBe('GET');
  });

  it('rejects unknown or malformed cloud states rather than inferring readiness', async () => {
    const host = createHost();
    const fetchSpy = spyOn(globalThis, 'fetch');
    for (const change of [{ state: 'perhaps' }, { workerId: 'unknown-pc' }, { companion: { state: 'loading' } }, { starter: { state: 'unknown' } }, { canStart: 'yes' }]) {
      fetchSpy.and.resolveTo(new Response(JSON.stringify({ service: { ...service, ...change } }), { status: 200 }));
      await expectAsync(host.refresh()).toBeRejectedWithError('One Piece status is unavailable.');
    }
  });

  it('pauses reads while hidden, resumes visibility and aborts a pending poll on sign-out', async () => {
    const hidden = spyOnProperty(document, 'hidden', 'get').and.returnValue(true);
    const users = new BehaviorSubject<any>(owner);
    const host = createHost(users);
    const fetchSpy = spyOn(globalThis, 'fetch').and.callFake(() => new Promise<Response>(() => {}));
    let reading: OnePieceHostReading | undefined;
    const subscription = host.watch().subscribe(value => reading = value);
    await Promise.resolve(); expect(fetchSpy).not.toHaveBeenCalled();
    hidden.and.returnValue(false); document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve(); await Promise.resolve();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const signal = fetchSpy.calls.mostRecent().args[1]!.signal!;
    expect(signal.aborted).toBeFalse();
    users.next(null); expect(reading?.status).toBe('hidden'); expect(signal.aborted).toBeTrue();
    subscription.unsubscribe();
  });

  it('prevents sending a start after sign-out while its token is still resolving', async () => {
    let resolveToken!: (value: string) => void;
    let enteredToken!: () => void;
    const tokenRequested = new Promise<void>(resolve => enteredToken = resolve);
    const token = new Promise<string>(resolve => resolveToken = resolve);
    const users = new BehaviorSubject<any>({ uid: GTOP_HOST_OWNER, getIdToken: () => { enteredToken(); return token; } });
    const host = createHost(users);
    const fetchSpy = spyOn(globalThis, 'fetch');
    const pending = host.start('synthetic-request');
    await tokenRequested; users.next(null); resolveToken('synthetic-token');
    await expectAsync(pending).toBeRejected(); expect(fetchSpy).not.toHaveBeenCalled();
  });
});
