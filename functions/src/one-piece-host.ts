import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import express from 'express';
import { randomUUID } from 'node:crypto';

const OWNER_UID = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
const PTI_PROJECT = 'pti-app-2ab59';
const WORKER_PROJECT = 'gtop-app';
const WORKER_ID = 'sachit-windows';
const REQUEST_TTL_MS = 120_000;
const HEARTBEAT_TTL_MS = 60_000;
const START_COOLDOWN_MS = 15_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODES = new Set(['start_failed', 'configuration_invalid', 'companion_start_timeout']);
const ORIGINS = new Set([
    'https://pti-app-2ab59.web.app',
    'https://pti-app-2ab59.firebaseapp.com',
    'https://pti-app-2ab59-one-piece.web.app',
    'https://pti-app-2ab59-one-piece.firebaseapp.com',
]);

type ErrorCode = 'start_failed' | 'configuration_invalid' | 'companion_start_timeout';
type StartRequest = {
    id: string;
    clientRequestId: string;
    state: 'pending' | 'started' | 'failed' | 'expired';
    requestedAt: number;
    expiresAt: number;
    errorCode?: ErrorCode;
};
export type Mailbox = {
    schemaVersion: 1;
    heartbeat?: { at: number; version: string; companionReady: boolean; lastReadyAt?: number };
    request?: StartRequest;
    recentRequestIds: string[];
    lastStartAt?: number;
};
type Poll = {
    version: string;
    companionReady: boolean;
    lastStartResult?: { requestId: string; state: 'started' | 'failed'; errorCode?: ErrorCode };
};
export type MailboxStore = {
    read(): Promise<Mailbox | undefined>;
    transact<T>(update: (mailbox: Mailbox) => { mailbox: Mailbox; result: T }): Promise<T>;
};

export class HostError extends Error {
    constructor(public status: number, public code: string) { super(code); }
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HostError(400, 'invalid_request');
    return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: string[]): void {
    if (Object.keys(value).some(key => !allowed.includes(key))) throw new HostError(400, 'invalid_request');
}
function parseStart(body: unknown): string {
    const value = object(body);
    fields(value, ['clientRequestId']);
    if (typeof value.clientRequestId !== 'string' || !UUID.test(value.clientRequestId)) throw new HostError(400, 'invalid_request');
    return value.clientRequestId.toLowerCase();
}
function parsePoll(body: unknown): Poll {
    const value = object(body);
    fields(value, ['version', 'companionReady', 'lastStartResult']);
    if (typeof value.version !== 'string' || !/^[a-z0-9][a-z0-9._+-]{0,63}$/i.test(value.version) || typeof value.companionReady !== 'boolean') throw new HostError(400, 'invalid_request');
    const poll: Poll = { version: value.version, companionReady: value.companionReady };
    if (value.lastStartResult !== undefined) {
        const result = object(value.lastStartResult);
        fields(result, ['requestId', 'state', 'errorCode']);
        if (typeof result.requestId !== 'string' || !UUID.test(result.requestId) || !['started', 'failed'].includes(String(result.state))) throw new HostError(400, 'invalid_request');
        if (result.errorCode !== undefined && (result.state !== 'failed' || typeof result.errorCode !== 'string' || !ERROR_CODES.has(result.errorCode))) throw new HostError(400, 'invalid_request');
        poll.lastStartResult = { requestId: result.requestId.toLowerCase(), state: result.state as 'started' | 'failed' };
        if (result.state === 'failed') poll.lastStartResult.errorCode = (result.errorCode || 'start_failed') as ErrorCode;
    }
    return poll;
}

function emptyMailbox(): Mailbox { return { schemaVersion: 1, recentRequestIds: [] }; }
function freshHeartbeat(mailbox: Mailbox, now: number): boolean {
    const at = mailbox.heartbeat?.at;
    return typeof at === 'number' && at <= now + 5_000 && now - at <= HEARTBEAT_TTL_MS;
}
function liveRequest(mailbox: Mailbox, now: number): boolean {
    return mailbox.request?.state === 'pending' && mailbox.request.expiresAt > now;
}
function service(mailbox: Mailbox, now: number) {
    const online = freshHeartbeat(mailbox, now);
    const ready = online && mailbox.heartbeat?.companionReady === true;
    const pending = liveRequest(mailbox, now);
    const expired = mailbox.request?.state === 'pending' && !pending;
    const failed = mailbox.request?.state === 'failed' || mailbox.request?.state === 'expired' || expired;
    return {
        workerId: WORKER_ID,
        state: ready ? 'ready' : !online ? 'starter_offline' : pending ? 'starting' : failed ? 'failed' : 'offline',
        starter: { state: online ? 'online' : 'offline', lastSeenAt: mailbox.heartbeat ? new Date(mailbox.heartbeat.at).toISOString() : null },
        companion: { state: ready ? 'ready' : 'offline', lastSeenAt: mailbox.heartbeat?.lastReadyAt ? new Date(mailbox.heartbeat.lastReadyAt).toISOString() : null },
        request: mailbox.request ? {
            id: mailbox.request.id,
            state: expired ? 'expired' : mailbox.request.state,
            requestedAt: new Date(mailbox.request.requestedAt).toISOString(),
            expiresAt: new Date(mailbox.request.expiresAt).toISOString(),
            errorCode: expired ? 'companion_start_timeout' : mailbox.request.errorCode || null,
        } : null,
        canStart: online && !ready && !pending && (mailbox.lastStartAt === undefined || now - mailbox.lastStartAt >= START_COOLDOWN_MS),
    };
}

/** One bounded mailbox contains only this fixed service's heartbeat and start request. */
export function createOnePieceController(store: MailboxStore, now = Date.now, newId = randomUUID) {
    return {
        async status() { return { service: service(await store.read() || emptyMailbox(), now()) }; },
        async start(body: unknown) {
            const clientRequestId = parseStart(body);
            return store.transact(mailbox => {
                const at = now();
                // Repeated clicks and transport retries must never create another launch.
                if (mailbox.request?.clientRequestId === clientRequestId || mailbox.recentRequestIds.includes(clientRequestId)) {
                    return { mailbox, result: { service: service(mailbox, at) } };
                }
                if (liveRequest(mailbox, at) || (freshHeartbeat(mailbox, at) && mailbox.heartbeat?.companionReady)) {
                    mailbox.recentRequestIds = [...mailbox.recentRequestIds, clientRequestId].slice(-64);
                    return { mailbox, result: { service: service(mailbox, at) } };
                }
                if (!freshHeartbeat(mailbox, at)) throw new HostError(503, 'starter_offline');
                if (mailbox.lastStartAt !== undefined && at - mailbox.lastStartAt < START_COOLDOWN_MS) throw new HostError(429, 'start_cooldown');
                mailbox.request = { id: newId(), clientRequestId, state: 'pending', requestedAt: at, expiresAt: at + REQUEST_TTL_MS };
                mailbox.recentRequestIds = [...mailbox.recentRequestIds, clientRequestId].slice(-64);
                mailbox.lastStartAt = at;
                return { mailbox, result: { service: service(mailbox, at) } };
            });
        },
        async poll(body: unknown) {
            const poll = parsePoll(body);
            return store.transact(mailbox => {
                const at = now();
                const request = mailbox.request;
                const result = poll.lastStartResult;
                // A late/foreign acknowledgement cannot modify any current request.
                if (request?.state === 'pending') {
                    if (request.expiresAt <= at) {
                        request.state = 'expired'; request.errorCode = 'companion_start_timeout';
                    } else if (result?.requestId === request.id) {
                        request.state = result.state;
                        if (result.state === 'failed') request.errorCode = result.errorCode || 'start_failed';
                    }
                }
                mailbox.heartbeat = {
                    at, version: poll.version, companionReady: poll.companionReady,
                    ...(poll.companionReady ? { lastReadyAt: at } : mailbox.heartbeat?.lastReadyAt ? { lastReadyAt: mailbox.heartbeat.lastReadyAt } : {}),
                };
                return {
                    mailbox,
                    result: {
                        service: service(mailbox, at),
                        request: liveRequest(mailbox, at) ? { id: mailbox.request!.id, action: 'start' as const, expiresAt: new Date(mailbox.request!.expiresAt).toISOString() } : null,
                    },
                };
            });
        },
    };
}

type Token = { uid: string; aud?: unknown; iss?: unknown; assistantWorker?: unknown; workerId?: unknown };
type RouterDependencies = {
    controller: ReturnType<typeof createOnePieceController>;
    verifyOwner(token: string): Promise<Token>;
    verifyWorker(token: string): Promise<Token>;
};

export function createOnePieceRouter(dependencies: RouterDependencies) {
    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        res.set('X-Content-Type-Options', 'nosniff');
        res.vary('Origin');
        const origin = req.get('Origin');
        if (origin && !ORIGINS.has(origin)) { res.status(403).json({ error: 'origin_denied' }); return; }
        if (origin) res.set('Access-Control-Allow-Origin', origin);
        if (req.method === 'OPTIONS') {
            const headers = (req.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
            if (!origin || !['GET', 'POST'].includes(req.get('Access-Control-Request-Method') || '') || headers.some(value => !['authorization', 'content-type'].includes(value))) { res.status(403).json({ error: 'origin_denied' }); return; }
            res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.status(204).end(); return;
        }
        next();
    });
    app.use(express.json({ limit: '2kb', strict: true }));
    app.all('*', async (req, res) => {
        try {
            const path = req.path.replace(/\/$/, '') || '/';
            if (!['/status', '/start', '/poll'].includes(path)) throw new HostError(404, 'not_found');
            if ((path === '/status' && req.method !== 'GET') || (path !== '/status' && req.method !== 'POST')) throw new HostError(405, 'method_not_allowed');
            if (Object.keys(req.query).length || (path !== '/status' && !req.is('application/json'))) throw new HostError(400, 'invalid_request');
            const authorization = req.get('Authorization') || '';
            if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization) || authorization.length > 8192) throw new HostError(401, 'authentication_required');
            const token = authorization.slice(7);
            let identity: Token;
            try { identity = await (path === '/poll' ? dependencies.verifyWorker(token) : dependencies.verifyOwner(token)); }
            catch { throw new HostError(401, 'authentication_required'); }
            if (path === '/poll') {
                if (req.get('Origin') || identity.uid !== 'assistant-worker-sachit-windows' || identity.assistantWorker !== true || identity.workerId !== WORKER_ID || identity.aud !== WORKER_PROJECT || identity.iss !== `https://securetoken.google.com/${WORKER_PROJECT}`) throw new HostError(403, 'access_denied');
                res.json(await dependencies.controller.poll(req.body));
            } else {
                if (!req.get('Origin') || identity.uid !== OWNER_UID || identity.aud !== PTI_PROJECT || identity.iss !== `https://securetoken.google.com/${PTI_PROJECT}`) throw new HostError(403, 'access_denied');
                res.json(path === '/status' ? await dependencies.controller.status() : await dependencies.controller.start(req.body));
            }
        } catch (error) {
            res.status(error instanceof HostError ? error.status : 503).json({ error: error instanceof HostError ? error.code : 'service_unavailable' });
        }
    });
    app.use((error: { type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(error?.type === 'entity.too.large' ? 413 : 400).json({ error: 'invalid_request' });
    });
    return app;
}

function productionRouter() {
    const reference = admin.firestore().doc('_ptiLocalServices/one-piece');
    const store: MailboxStore = {
        async read() { return (await reference.get()).data() as Mailbox | undefined; },
        async transact(update) {
            return admin.firestore().runTransaction(async transaction => {
                const snapshot = await transaction.get(reference);
                const changed = update(snapshot.exists ? snapshot.data() as Mailbox : emptyMailbox());
                transaction.set(reference, { ...changed.mailbox, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                return changed.result;
            });
        },
    };
    // Verification uses Google's public signing keys; no GTOP data/IAM access is needed.
    const workerApp = admin.apps.find(app => app?.name === 'one-piece-worker-verifier') || admin.initializeApp({ projectId: WORKER_PROJECT }, 'one-piece-worker-verifier');
    return createOnePieceRouter({
        controller: createOnePieceController(store),
        verifyOwner: token => admin.auth().verifyIdToken(token, true),
        verifyWorker: token => workerApp.auth().verifyIdToken(token),
    });
}

let router: ReturnType<typeof productionRouter> | undefined;
export const onePieceHost = functions.runWith({ maxInstances: 2, memory: '256MB', timeoutSeconds: 30 }).https.onRequest((req, res) => {
    router ||= productionRouter();
    return router(req, res);
});
