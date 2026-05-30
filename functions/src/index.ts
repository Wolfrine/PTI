import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import express, { NextFunction, Request, Response } from 'express';

admin.initializeApp();

const app = express();
app.use(express.json({ limit: '1mb' }));

const db = admin.firestore();
const FIREBASE_MCP_TOOLSET = new Set(parseApiKeys(process.env.PTI_MCP_API_KEYS));

app.use(authenticationMiddleware);
app.post('*', handleMcpRequest);
app.get('*', handleUnsupportedMethod);
app.delete('*', handleUnsupportedMethod);
app.patch('*', handleUnsupportedMethod);
app.put('*', handleUnsupportedMethod);

interface RpcRequest {
    jsonrpc?: '2.0';
    method?: string;
    id?: string | number | null;
    params?: Record<string, unknown>;
}

interface RpcError {
    code: number;
    message: string;
    data?: unknown;
}

interface RpcResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: unknown;
    error?: RpcError;
}

interface ToolDescriptor {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface McpSchemaValue {
    type: string;
    properties?: Record<string, McpSchemaValue>;
    item?: McpSchemaValue;
    required?: string[];
}

const MCP_TOOLS: ToolDescriptor[] = [
    {
        name: 'pti.health',
        description: 'Return PTI MCP service health and Firestore project identity.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'pti.firestore.get',
        description: 'Read one Firestore document.',
        inputSchema: {
            type: 'object',
            required: ['path'],
            properties: {
                path: {
                    type: 'string',
                    description: 'Document path, e.g. users/{uid}/codexProjects/{projectId}',
                },
            },
        },
    },
    {
        name: 'pti.firestore.list',
        description: 'List documents in a Firestore collection.',
        inputSchema: {
            type: 'object',
            required: ['collection'],
            properties: {
                collection: { type: 'string', description: 'Collection path' },
                orderBy: {
                    type: 'object',
                    properties: {
                        field: { type: 'string' },
                        direction: { type: 'string', enum: ['asc', 'desc'] },
                    },
                },
                limit: { type: 'number', description: '1..500' },
            },
        },
    },
    {
        name: 'pti.firestore.query',
        description: 'Run a filtered query against a Firestore collection.',
        inputSchema: {
            type: 'object',
            required: ['collection'],
            properties: {
                collection: { type: 'string', description: 'Collection path' },
                where: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['field', 'op', 'value'],
                        properties: {
                            field: { type: 'string' },
                            op: {
                                type: 'string',
                                description: 'Allowed: ==, !=, <, <=, >, >=, array-contains, in, not-in, array-contains-any',
                            },
                            value: {},
                        },
                    },
                },
                orderBy: {
                    type: 'object',
                    properties: {
                        field: { type: 'string' },
                        direction: { type: 'string', enum: ['asc', 'desc'] },
                    },
                },
                limit: { type: 'number', description: '1..500' },
            },
        },
    },
    {
        name: 'pti.firestore.create',
        description: 'Create a new document in a collection.',
        inputSchema: {
            type: 'object',
            required: ['collection', 'data'],
            properties: {
                collection: { type: 'string', description: 'Collection path' },
                data: { type: 'object' },
                docId: { type: 'string' },
            },
        },
    },
    {
        name: 'pti.firestore.set',
        description: 'Set (create/overwrite/merge) a document.',
        inputSchema: {
            type: 'object',
            required: ['path', 'data'],
            properties: {
                path: { type: 'string', description: 'Document path' },
                data: { type: 'object' },
                merge: { type: 'boolean' },
            },
        },
    },
    {
        name: 'pti.firestore.update',
        description: 'Update fields in one document.',
        inputSchema: {
            type: 'object',
            required: ['path', 'data'],
            properties: {
                path: { type: 'string', description: 'Document path' },
                data: { type: 'object' },
            },
        },
    },
    {
        name: 'pti.firestore.delete',
        description: 'Delete one document.',
        inputSchema: {
            type: 'object',
            required: ['path'],
            properties: {
                path: { type: 'string', description: 'Document path' },
            },
        },
    },
    {
        name: 'pti.firestore.batch_write',
        description:
            'Execute multiple writes (create/set/update/delete) in a single batch.',
        inputSchema: {
            type: 'object',
            required: ['writes'],
            properties: {
                writes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['operation', 'path'],
                        properties: {
                            operation: {
                                type: 'string',
                                enum: ['create', 'set', 'update', 'delete'],
                            },
                            path: { type: 'string' },
                            data: { type: 'object' },
                            docId: { type: 'string' },
                            merge: { type: 'boolean' },
                        },
                    },
                },
            },
        },
    },
    {
        name: 'pti.firestore.schema_sample',
        description:
            'Infer a simple schema shape for a document or first doc in a collection.',
        inputSchema: {
            type: 'object',
            required: ['path'],
            properties: {
                path: { type: 'string', description: 'Collection or document path' },
                maxDepth: { type: 'number', description: '1..8' },
            },
        },
    },
    {
        name: 'pti.projects.list',
        description:
            'List project docs for users/{uid}/codexProjects.',
        inputSchema: {
            type: 'object',
            required: ['uid'],
            properties: {
                uid: { type: 'string' },
                limit: { type: 'number', description: '1..500' },
            },
        },
    },
    {
        name: 'pti.actions.list',
        description:
            'List action items for users/{uid}/codexProjects/{projectId}/actionItems.',
        inputSchema: {
            type: 'object',
            required: ['uid', 'projectId'],
            properties: {
                uid: { type: 'string' },
                projectId: { type: 'string' },
                status: { type: 'string' },
                completed: { type: 'boolean' },
                limit: { type: 'number', description: '1..500' },
            },
        },
    },
    {
        name: 'pti.actions.add',
        description:
            'Add one action item under users/{uid}/codexProjects/{projectId}/actionItems.',
        inputSchema: {
            type: 'object',
            required: ['uid', 'projectId', 'action'],
            properties: {
                uid: { type: 'string' },
                projectId: { type: 'string' },
                actionId: { type: 'string' },
                action: { type: 'object', description: 'Action payload' },
            },
        },
    },
    {
        name: 'pti.actions.update',
        description:
            'Update an action item under users/{uid}/codexProjects/{projectId}/actionItems/{actionId}.',
        inputSchema: {
            type: 'object',
            required: ['uid', 'projectId', 'actionId', 'updates'],
            properties: {
                uid: { type: 'string' },
                projectId: { type: 'string' },
                actionId: { type: 'string' },
                updates: { type: 'object' },
            },
        },
    },
    {
        name: 'pti.actions.complete',
        description:
            'Mark an action item complete/incomplete under users/{uid}/codexProjects/{projectId}/actionItems/{actionId}.',
        inputSchema: {
            type: 'object',
            required: ['uid', 'projectId', 'actionId'],
            properties: {
                uid: { type: 'string' },
                projectId: { type: 'string' },
                actionId: { type: 'string' },
                complete: { type: 'boolean' },
            },
        },
    },
];

const MCP_TOOL_HANDLERS: Record<string, ToolHandler> = {
    'pti.health': async () => ({
        ok: true,
        service: 'pti-mcp',
        projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'unknown',
        tools: MCP_TOOLS.length,
    }),
    'pti.firestore.get': async (args) => {
        const path = getRequiredString(args, 'path');
        return getDocumentByPath(assertDocumentPath(path));
    },
    'pti.firestore.list': async (args) => {
        const collection = getRequiredString(args, 'collection');
        const limit = getOptionalPositiveInt(args, 'limit', 500);
        const orderBy = orderByFromInput(getOptionalObject(args, 'orderBy'));
        return listCollection(assertCollectionPath(collection), { limit, orderBy });
    },
    'pti.firestore.query': async (args) => {
        const collection = getRequiredString(args, 'collection');
        const where = parseWhereClauses(getOptionalArray(args, 'where'));
        const limit = getOptionalPositiveInt(args, 'limit', 500);
        const orderBy = orderByFromInput(getOptionalObject(args, 'orderBy'));
        return queryCollection(assertCollectionPath(collection), { where, orderBy, limit });
    },
    'pti.firestore.create': async (args) => {
        const collection = getRequiredString(args, 'collection');
        const data = getRequiredObject(args, 'data');
        const docId = getOptionalString(args, 'docId');
        return createDocument(assertCollectionPath(collection), data, docId);
    },
    'pti.firestore.set': async (args) => {
        const path = getRequiredString(args, 'path');
        const data = getRequiredObject(args, 'data');
        const merge = getOptionalBoolean(args, 'merge') ?? false;
        return setDocument(assertDocumentPath(path), data, merge);
    },
    'pti.firestore.update': async (args) => {
        const path = getRequiredString(args, 'path');
        const data = getRequiredObject(args, 'data');
        return updateDocument(assertDocumentPath(path), data);
    },
    'pti.firestore.delete': async (args) => {
        const path = getRequiredString(args, 'path');
        return deleteDocument(assertDocumentPath(path));
    },
    'pti.firestore.batch_write': async (args) => {
        const writes = getRequiredArray(args, 'writes');
        return batchWrite(writes);
    },
    'pti.firestore.schema_sample': async (args) => {
        const path = getRequiredString(args, 'path');
        const maxDepth = clampInt(getOptionalNumber(args, 'maxDepth'), 1, 8) ?? 4;
        return schemaSample(normalizePath(path), maxDepth);
    },
    'pti.projects.list': async (args) => {
        const uid = getRequiredString(args, 'uid');
        const limit = getOptionalPositiveInt(args, 'limit', 500);
        return listCollection(usersCodexProjectsPath(uid), { limit });
    },
    'pti.actions.list': async (args) => {
        const uid = getRequiredString(args, 'uid');
        const projectId = getRequiredString(args, 'projectId');
        return listActions(uid, projectId, {
            status: getOptionalString(args, 'status'),
            completed: getOptionalBoolean(args, 'completed'),
            limit: getOptionalPositiveInt(args, 'limit', 500),
        });
    },
    'pti.actions.add': async (args) => {
        const uid = getRequiredString(args, 'uid');
        const projectId = getRequiredString(args, 'projectId');
        const action = getRequiredObject(args, 'action');
        const actionId = getOptionalString(args, 'actionId');
        return addAction(uid, projectId, action, actionId);
    },
    'pti.actions.update': async (args) => {
        const uid = getRequiredString(args, 'uid');
        const projectId = getRequiredString(args, 'projectId');
        const actionId = getRequiredString(args, 'actionId');
        const updates = getRequiredObject(args, 'updates');
        return updateAction(uid, projectId, actionId, updates);
    },
    'pti.actions.complete': async (args) => {
        const uid = getRequiredString(args, 'uid');
        const projectId = getRequiredString(args, 'projectId');
        const actionId = getRequiredString(args, 'actionId');
        const complete = getOptionalBoolean(args, 'complete') ?? true;
        return completeAction(uid, projectId, actionId, complete);
    },
};

function authenticationMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!isAuthorized(req)) {
        res.status(401).json(rpcError(null, -32601, 'Unauthorized. Missing or invalid PTI_MCP_API_KEYS bearer token.'));
        return;
    }
    next();
}

function handleUnsupportedMethod(_req: Request, res: Response): void {
    res
        .status(405)
        .json(rpcError(null, -32000, 'Method not allowed for /mcp endpoint. Send POST JSON-RPC payload.'));
}

async function handleMcpRequest(req: Request, res: Response): Promise<void> {
    try {
        if (!isPayloadObject(req.body)) {
            res.status(400).json(rpcError(null, -32600, 'Invalid JSON-RPC payload.'));
            return;
        }

        if (Array.isArray(req.body)) {
            const responses = await Promise.all(req.body.map((entry) => handleRpcRequest(entry)));
            res.json(responses.filter(Boolean));
            return;
        }

        const response = await handleRpcRequest(req.body);
        res.json(response);
    } catch (error) {
        res.status(500).json(rpcError(null, -32000, 'Unexpected MCP processing error.', String(error)));
    }
}

async function handleRpcRequest(payload: RpcRequest | Record<string, unknown>): Promise<RpcResponse> {
    if (!payload || typeof payload !== 'object' || !('jsonrpc' in payload)) {
        return rpcError(null, -32600, 'Invalid JSON-RPC payload.');
    }

    const request = payload as RpcRequest;
    const id = request.id ?? null;

    if (request.jsonrpc !== '2.0') {
        return rpcError(id, -32600, 'jsonrpc field must be "2.0".');
    }
    if (!request.method || typeof request.method !== 'string') {
        return rpcError(id, -32600, 'method is required.');
    }

    try {
        switch (request.method) {
            case 'initialize':
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {},
                        },
                        serverInfo: {
                            name: 'pti-mcp',
                            version: '0.0.1',
                        },
                    },
                };
            case 'notifications/initialized':
                return { jsonrpc: '2.0', id, result: {} };
            case 'tools/list':
                return { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } };
            case 'tools/call': {
                const params = request.params ?? {};
                if (!isPlainObject(params)) {
                    return rpcError(id, -32602, 'tools/call params must be an object.');
                }
                const toolName = getRequiredString(params, 'name');
                const args = getOptionalObject(params, 'arguments');
                const handler = MCP_TOOL_HANDLERS[toolName];
                if (!handler) {
                    return rpcError(id, -32601, `Unknown tool: ${toolName}`);
                }
                const result = await handler(args);
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    },
                };
            }
            default:
                return rpcError(id, -32601, `Unknown method: ${request.method}`);
        }
    } catch (error) {
        if (error instanceof McpValidationError) {
            return rpcError(id, error.code, error.message, error.data);
        }
        return rpcError(id, -32000, 'Tool execution failed.', String((error as Error).message));
    }
}

function isPayloadObject(value: unknown): value is RpcRequest | RpcRequest[] {
    return typeof value === 'object' && value !== null;
}

function isAuthorized(req: Request): boolean {
    if (FIREBASE_MCP_TOOLSET.size === 0) {
        return false;
    }

    const authHeader = req.get('authorization') ?? '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = bearerMatch ? bearerMatch[1].trim() : req.get('x-api-key')?.trim();
    return Boolean(token && FIREBASE_MCP_TOOLSET.has(token));
}

function rpcError(id: string | number | null, code: number, message: string, data?: unknown): RpcResponse {
    return {
        jsonrpc: '2.0',
        id,
        error: {
            code,
            message,
            data,
        },
    };
}

function parseApiKeys(raw?: string): string[] {
    if (!raw) return [];
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return parsed
                .filter((entry): entry is string => typeof entry === 'string')
                .map((entry) => entry.trim())
                .filter(Boolean);
        }
    } catch {
        // Fall through and parse as comma/newline-delimited list.
    }

    return trimmed
        .split(/[,;\n\r]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function usersCodexProjectsPath(uid: string): string {
    return `users/${uid}/codexProjects`;
}

function actionsPath(uid: string, projectId: string): string {
    return `${usersCodexProjectsPath(uid)}/${projectId}/actionItems`;
}

function actionsDocumentPath(uid: string, projectId: string, actionId: string): string {
    return `${actionsPath(uid, projectId)}/${actionId}`;
}

function assertCollectionPath(path: string): string {
    const normalized = normalizePath(path);
    if (!normalized) throw new McpValidationError( -32602, 'Collection path is required.');
    if (splitPath(normalized).length % 2 === 0) {
        throw new McpValidationError(-32602, 'Expected a collection path (odd number of path segments).');
    }
    return normalized;
}

function assertDocumentPath(path: string): string {
    const normalized = normalizePath(path);
    if (!normalized) throw new McpValidationError(-32602, 'Document path is required.');
    if (splitPath(normalized).length % 2 !== 0) {
        throw new McpValidationError(-32602, 'Expected a document path (even number of path segments).');
    }
    return normalized;
}

function normalizePath(path: string): string {
    return path.trim().replace(/^\/+|\/+$/g, '');
}

function splitPath(path: string): string[] {
    return path.split('/').filter(Boolean);
}

async function getDocumentByPath(path: string) {
    const ref = db.doc(path);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
        return { path: ref.path, exists: false };
    }

    return {
        path: snapshot.ref.path,
        exists: true,
        id: snapshot.id,
        createTime: snapshot.createTime?.toDate().toISOString(),
        updateTime: snapshot.updateTime?.toDate().toISOString(),
        data: toSafeJson(snapshot.data() ?? null),
    };
}

async function listCollection(
    collectionPath: string,
    options: { orderBy?: { field: string; direction?: 'asc' | 'desc' }; limit?: number | undefined },
) {
    let query: FirebaseFirestore.Query = db.collection(collectionPath);
    if (options.orderBy) {
        query = query.orderBy(options.orderBy.field, options.orderBy.direction ?? 'asc');
    }
    if (typeof options.limit === 'number') {
        query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return {
        path: collectionPath,
        count: snapshot.size,
        documents: snapshot.docs.map((doc) => ({
            id: doc.id,
            path: doc.ref.path,
            data: toSafeJson(doc.data()),
        })),
    };
}

async function queryCollection(
    collectionPath: string,
    options: {
        where: Array<{ field: string; op: FirebaseFirestore.WhereFilterOp; value: unknown }>;
        orderBy?: { field: string; direction?: 'asc' | 'desc' };
        limit?: number | undefined;
    },
) {
    let query: FirebaseFirestore.Query = db.collection(collectionPath);
    for (const clause of options.where) {
        query = query.where(clause.field, clause.op, clause.value);
    }
    if (options.orderBy) {
        query = query.orderBy(options.orderBy.field, options.orderBy.direction ?? 'asc');
    }
    if (typeof options.limit === 'number') {
        query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return {
        path: collectionPath,
        count: snapshot.size,
        documents: snapshot.docs.map((doc) => ({
            id: doc.id,
            path: doc.ref.path,
            data: toSafeJson(doc.data()),
        })),
    };
}

async function createDocument(
    collectionPath: string,
    data: Record<string, unknown>,
    docId?: string,
) {
    const collectionRef = db.collection(collectionPath);
    const docRef = docId ? collectionRef.doc(docId) : collectionRef.doc();
    await docRef.set(data);
    const snapshot = await docRef.get();
    return {
        path: docRef.path,
        id: docRef.id,
        created: true,
        data: toSafeJson(snapshot.data() ?? {}),
    };
}

async function setDocument(path: string, data: Record<string, unknown>, merge: boolean) {
    const docRef = db.doc(path);
    await docRef.set(data, { merge });
    const snapshot = await docRef.get();
    return {
        path: docRef.path,
        id: docRef.id,
        merge,
        data: toSafeJson(snapshot.data() ?? {}),
    };
}

async function updateDocument(path: string, data: Record<string, unknown>) {
    const docRef = db.doc(path);
    await docRef.update(data);
    const snapshot = await docRef.get();
    return {
        path: docRef.path,
        id: docRef.id,
        updated: true,
        data: toSafeJson(snapshot.data() ?? {}),
    };
}

async function deleteDocument(path: string) {
    const docRef = db.doc(path);
    await docRef.delete();
    return {
        path: docRef.path,
        deleted: true,
    };
}

async function batchWrite(writes: Array<Record<string, unknown>>) {
    if (!writes.length) throw new McpValidationError(-32602, 'batch_write requires at least one operation.');
    if (writes.length > 500) throw new McpValidationError(-32602, 'batch_write supports up to 500 operations.');

    const batch = db.batch();
    const operations: Array<{ operation: string; path: string }> = [];

    for (const rawWrite of writes) {
        const operation = getRequiredString(rawWrite, 'operation') as 'create' | 'set' | 'update' | 'delete';
        const path = normalizePath(getRequiredString(rawWrite, 'path'));
        const data = getOptionalObject(rawWrite, 'data');
        const docId = getOptionalString(rawWrite, 'docId');
        const merge = getOptionalBoolean(rawWrite, 'merge') ?? false;

        switch (operation) {
            case 'create': {
                const collectionRef = db.collection(assertCollectionPath(path));
                const ref = docId ? collectionRef.doc(docId) : collectionRef.doc();
                batch.create(ref, data);
                operations.push({ operation, path: ref.path });
                break;
            }
            case 'set': {
                const ref = db.doc(assertDocumentPath(path));
                batch.set(ref, data, { merge });
                operations.push({ operation, path: ref.path });
                break;
            }
            case 'update': {
                const ref = db.doc(assertDocumentPath(path));
                batch.update(ref, data);
                operations.push({ operation, path: ref.path });
                break;
            }
            case 'delete': {
                const ref = db.doc(assertDocumentPath(path));
                batch.delete(ref);
                operations.push({ operation, path: ref.path });
                break;
            }
            default:
                throw new McpValidationError(-32602, `Unsupported batch_write operation: ${operation}`);
        }
    }

    await batch.commit();
    return { committed: true, operations };
}

async function schemaSample(path: string, maxDepth: number) {
    const normalized = normalizePath(path);
    const segments = splitPath(normalized);
    const isCollection = segments.length % 2 !== 0;

    if (isCollection) {
        const snapshot = await db.collection(normalized).limit(1).get();
        if (snapshot.empty) {
            return {
                path: normalized,
                kind: 'collection',
                sampleCount: 0,
                schema: { type: 'object', properties: {} } as McpSchemaValue,
            };
        }
        const first = snapshot.docs[0];
        return {
            path: first.ref.path,
            kind: 'collection',
            sampleCount: 1,
            schema: inferSchema(first.data(), maxDepth),
            sampleData: toSafeJson(first.data()),
        };
    }

    const snapshot = await db.doc(normalized).get();
    if (!snapshot.exists) {
        return { path: normalized, kind: 'document', exists: false };
    }
    return {
        path: snapshot.ref.path,
        kind: 'document',
        exists: true,
        schema: inferSchema(snapshot.data(), maxDepth),
        sampleData: toSafeJson(snapshot.data()),
    };
}

async function listActions(
    uid: string,
    projectId: string,
    filters: { status?: string; completed?: boolean; limit?: number },
) {
    let query: FirebaseFirestore.Query = db.collection(actionsPath(uid, projectId));
    if (typeof filters.status === 'string') {
        query = query.where('status', '==', filters.status);
    }
    if (typeof filters.completed === 'boolean') {
        query = query.where('completed', '==', filters.completed);
    }
    if (typeof filters.limit === 'number') {
        query = query.limit(filters.limit);
    }

    const snapshot = await query.get();
    return {
        uid,
        projectId,
        count: snapshot.size,
        actions: snapshot.docs.map((doc) => ({
            id: doc.id,
            path: doc.ref.path,
            data: toSafeJson(doc.data()),
        })),
    };
}

async function addAction(
    uid: string,
    projectId: string,
    action: Record<string, unknown>,
    actionId?: string,
) {
    const reference = actionId
        ? db.doc(actionsDocumentPath(uid, projectId, actionId))
        : db.collection(actionsPath(uid, projectId)).doc();
    const payload = {
        ...action,
        completed: action.completed ?? false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await reference.set(payload);
    return { uid, projectId, id: reference.id, path: reference.path, created: true };
}

async function updateAction(
    uid: string,
    projectId: string,
    actionId: string,
    updates: Record<string, unknown>,
) {
    const reference = db.doc(actionsDocumentPath(uid, projectId, actionId));
    await reference.update({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const snapshot = await reference.get();
    return {
        uid,
        projectId,
        actionId,
        updated: true,
        data: toSafeJson(snapshot.data() ?? {}),
    };
}

async function completeAction(
    uid: string,
    projectId: string,
    actionId: string,
    complete: boolean,
) {
    const reference = db.doc(actionsDocumentPath(uid, projectId, actionId));
    await reference.update({
        completed: complete,
        status: complete ? 'completed' : 'open',
        completedAt: complete ? admin.firestore.FieldValue.serverTimestamp() : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const snapshot = await reference.get();
    return {
        uid,
        projectId,
        actionId,
        completed: complete,
        data: toSafeJson(snapshot.data() ?? {}),
    };
}

function parseWhereClauses(raw: Array<Record<string, unknown>>) {
    return raw.map((entry) => {
        const field = getRequiredString(entry, 'field');
        const op = getRequiredString(entry, 'op') as FirebaseFirestore.WhereFilterOp;
        const value = entry.value;
        if (!isAllowedWhereOp(op)) {
            throw new McpValidationError(-32602, `Unsupported where operator '${op}'.`);
        }
        return { field, op, value };
    });
}

function isAllowedWhereOp(op: string): op is FirebaseFirestore.WhereFilterOp {
    return ['<', '<=', '==', '!=', '>=', '>', 'array-contains', 'in', 'not-in', 'array-contains-any'].includes(op);
}

function orderByFromInput(
    value?: Record<string, unknown>,
): { field: string; direction?: 'asc' | 'desc' } | undefined {
    if (!value || Object.keys(value).length === 0) {
        return undefined;
    }
    const field = getRequiredString(value, 'field');
    const direction = getString(value, 'direction') as 'asc' | 'desc' | undefined;
    if (direction && direction !== 'asc' && direction !== 'desc') {
        throw new McpValidationError(-32602, 'orderBy.direction must be "asc" or "desc".');
    }
    return { field, direction };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRequiredString(input: Record<string, unknown>, key: string): string {
    const value = getString(input, key);
    if (!value) {
        throw new McpValidationError(-32602, `Field '${key}' is required and must be non-empty.`);
    }
    return value;
}

function getString(input: Record<string, unknown>, key: string): string | undefined {
    const value = input[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getOptionalString(input: Record<string, unknown>, key: string): string | undefined {
    return getString(input, key);
}

function getOptionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
    const value = input[key];
    return typeof value === 'boolean' ? value : undefined;
}

function getOptionalNumber(input: Record<string, unknown>, key: string): number | undefined {
    const value = input[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getOptionalPositiveInt(input: Record<string, unknown>, key: string, max: number): number | undefined {
    const value = getOptionalNumber(input, key);
    if (typeof value === 'undefined') return undefined;
    if (!Number.isInteger(value) || value < 1 || value > max) {
        throw new McpValidationError(-32602, `Field '${key}' must be an integer between 1 and ${max}.`);
    }
    return value;
}

function getRequiredObject(input: Record<string, unknown>, key: string): Record<string, unknown> {
    const value = getOptionalObject(input, key);
    if (Object.keys(value).length === 0) {
        throw new McpValidationError(-32602, `Field '${key}' is required and must be a non-empty object.`);
    }
    return value;
}

function getOptionalObject(
    input: Record<string, unknown>,
    key: string,
): Record<string, unknown> {
    const value = input[key];
    if (typeof value === 'undefined') {
        return {};
    }
    if (!isPlainObject(value)) {
        throw new McpValidationError(-32602, `Field '${key}' must be an object.`);
    }
    return value as Record<string, unknown>;
}

function getRequiredArray(input: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
    const value = input[key];
    if (!Array.isArray(value)) {
        throw new McpValidationError(-32602, `Field '${key}' must be an array.`);
    }
    return value as Array<Record<string, unknown>>;
}

function getOptionalArray(input: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
    const value = input[key];
    if (typeof value === 'undefined') {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new McpValidationError(-32602, `Field '${key}' must be an array.`);
    }
    return value as Array<Record<string, unknown>>;
}

function clampInt(value: number | undefined, min: number, max: number): number | undefined {
    if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
    const rounded = Math.floor(value);
    if (rounded < min || rounded > max) return undefined;
    return rounded;
}

function toSafeJson(value: unknown): unknown {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (value instanceof admin.firestore.Timestamp) {
        return { _type: 'timestamp', value: value.toDate().toISOString() };
    }
    if (value instanceof admin.firestore.GeoPoint) {
        return { _type: 'geopoint', lat: value.latitude, lng: value.longitude };
    }
    if (value instanceof admin.firestore.DocumentReference) {
        return { _type: 'documentReference', path: value.path };
    }
    if (Array.isArray(value)) {
        return value.map(toSafeJson);
    }

    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        result[key] = toSafeJson(nested);
    }
    return result;
}

function inferSchema(value: unknown, depth: number): McpSchemaValue {
    if (depth <= 0) {
        return { type: 'any' };
    }
    if (value === null) {
        return { type: 'null' };
    }
    if (Array.isArray(value)) {
        return {
            type: 'array',
            item: inferSchema(value[0], depth - 1),
        };
    }
    if (value instanceof admin.firestore.Timestamp) {
        return { type: 'timestamp' };
    }
    if (value instanceof admin.firestore.GeoPoint) {
        return { type: 'geopoint' };
    }
    if (typeof value === 'string') {
        return { type: 'string' };
    }
    if (typeof value === 'boolean') {
        return { type: 'boolean' };
    }
    if (typeof value === 'number') {
        return { type: Number.isInteger(value) ? 'integer' : 'number' };
    }
    if (typeof value === 'object') {
        const properties: Record<string, McpSchemaValue> = {};
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
            properties[key] = inferSchema(nested, depth - 1);
        }
        return {
            type: 'object',
            properties,
            required: Object.keys(properties),
        };
    }
    return { type: typeof value };
}

class McpValidationError extends Error {
    public code: number;
    public data?: unknown;

    constructor(code: number, message: string, data?: unknown) {
        super(message);
        this.code = code;
        this.data = data;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export const mcp = functions.https.onRequest(app);
