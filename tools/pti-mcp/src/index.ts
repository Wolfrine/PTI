#!/usr/bin/env node
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore, type Query, type Transaction } from "firebase-admin/firestore";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assertPath, assertUser } from "./access.js";
import { appCatalog } from "./apps.js";
import { registerFoodTools } from "./food.js";
import { registerPersonalTools } from "./personal.js";
import { z } from "zod";

const projectId =
  process.env.PTI_FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  "pti-app-2ab59";
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });

const db = getFirestore();
export function createMcpServer(context: { uid?: string; email?: string; actor?: string; taskReference?: string; transport?: string } = {}) {
const actor = context.actor || process.env.PTI_MCP_ACTOR || "pti-agent";
const taskReference = context.taskReference || process.env.PTI_MCP_TASK_REF || null;

const server = new McpServer(
  { name: "pti-firestore", version: "0.2.0" },
  { capabilities: { tools: {} }, instructions: "Start with pti_apps_list to discover apps, storage and supported access. Hosted tools are restricted to your connected PTI account. Use personal_context/personal_publish for Daily Intelligence, preserving pause and feedback preferences. Velum media and local votes require its separate Drive/browser connection. Read documents before updating; use update tokens." },
);

const readOnly = { readOnlyHint: true, destructiveHint: false };
const write = { readOnlyHint: false, destructiveHint: false };
const destructive = { readOnlyHint: false, destructiveHint: true };

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(serialize(value), null, 2) }],
});
const message = (value: string) => ({
  content: [{ type: "text" as const, text: value }],
});

function assertDocumentPath(value: string): string { return assertPath(value, 'document', context.uid); }
function assertCollectionPath(value: string): string { return assertPath(value, 'collection', context.uid); }
function assertUid(value: string): string { return assertUser(value, context.uid); }
function boundedLimit(value?: number, max = 100): number {
  return Math.min(Math.max(Math.floor(value || 50), 1), max);
}
function root(uid: string): string {
  return `users/${assertUid(uid)}/sefpoData/workspace`;
}
function bucket(uid: string, name: string): string {
  return `${root(uid)}/${name}`;
}
function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 72) || "entity"
  );
}
function updateToken(value?: Timestamp): string | null {
  if (!value) return null;
  return `${value.seconds}:${String(value.nanoseconds).padStart(9, "0")}`;
}
function timestampFromToken(value: string): Timestamp {
  const match = /^(\d+):(\d{1,9})$/.exec(value);
  if (!match) throw new Error("Invalid update token.");
  return new Timestamp(Number(match[1]), Number(match[2]));
}
function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (
    value &&
    typeof value === "object" &&
    "seconds" in value &&
    "nanoseconds" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) return (value as Timestamp).toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>))
      out[key] = serialize(item);
    return out;
  }
  return value;
}
function serializeRecord(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return serialize(value || {}) as Record<string, unknown>;
}
async function snapshot(path: string): Promise<Record<string, unknown> | null> {
  const item = await db.doc(assertDocumentPath(path)).get();
  if (!item.exists) return null;
  return {
    ...serializeRecord(item.data()),
    id: item.id,
    path: item.ref.path,
    updateTime: item.updateTime?.toDate().toISOString() || null,
    updateToken: updateToken(item.updateTime),
  } as Record<string, unknown>;
}
async function audit(
  tool: string,
  target: string,
  before: unknown,
  after: unknown,
  input: unknown,
): Promise<void> {
  await db.collection("mcpAuditLog").add({
    actor,
    taskReference,
    tool,
    target,
    before: serialize(before),
    after: serialize(after),
    input: serialize(input),
    createdAt: FieldValue.serverTimestamp(),
  });
}

server.registerTool(
  "pti_health",
  {
    title: "PTI Firestore health",
    description: "Verify PTI MCP, current account and target Firebase project.",
    inputSchema: {},
    annotations: readOnly,
  },
  async () =>
    json({
      ok: true,
      service: "pti-firestore",
      projectId,
      database: "(default)",
      transport: context.transport || "stdio",
      uid: context.uid || null,
      sefpoNamespace: "users/{uid}/sefpoData/workspace",
    }),
);

server.registerTool(
  "firestore_list_collections",
  {
    title: "List Firestore collections",
    description: "List root collections or subcollections below one document.",
    inputSchema: { documentPath: z.string().optional() },
    annotations: readOnly,
  },
  async ({ documentPath }) => {
    if (!documentPath && context.uid) return json([`users/${context.uid}`]);
    const collections = documentPath
      ? await db.doc(assertDocumentPath(documentPath)).listCollections()
      : await db.listCollections();
    return json(collections.map((item: any) => item.path).filter((path: string) => { try { assertCollectionPath(path); return true; } catch { return false; } }));
  },
);

server.registerTool(
  "firestore_get_document",
  {
    title: "Get Firestore document",
    description: "Read one document with a stable update token.",
    inputSchema: { path: z.string().min(1) },
    annotations: readOnly,
  },
  async ({ path }) => json(await snapshot(path)),
);

const filterSchema = z.object({
  field: z.string().min(1),
  op: z.enum([
    "==", "!=", "<", "<=", ">", ">=",
    "array-contains", "in", "not-in", "array-contains-any",
  ]),
  value: z.unknown(),
});

server.registerTool(
  "firestore_query",
  {
    title: "Query Firestore collection",
    description: "Run a bounded query; defaults to 50 and never returns more than 100 documents.",
    inputSchema: {
      collectionPath: z.string().min(1),
      filters: z.array(filterSchema).max(10).default([]),
      orderBy: z
        .object({ field: z.string().min(1), direction: z.enum(["asc", "desc"]).default("asc") })
        .optional(),
      limit: z.number().int().positive().max(100).default(50),
    },
    annotations: readOnly,
  },
  async ({ collectionPath, filters, orderBy, limit }) => {
    let q: Query = db.collection(assertCollectionPath(collectionPath));
    for (const filter of filters) q = q.where(filter.field, filter.op, filter.value);
    if (orderBy) q = q.orderBy(orderBy.field, orderBy.direction);
    const result = await q.limit(boundedLimit(limit)).get();
    return json(
      result.docs.map((item: any) => ({
        ...serializeRecord(item.data()),
        id: item.id,
        path: item.ref.path,
        updateTime: item.updateTime.toDate().toISOString(),
        updateToken: updateToken(item.updateTime),
      })),
    );
  },
);

server.registerTool(
  "firestore_create_document",
  {
    title: "Create Firestore document",
    description: "Create one explicit unused document path.",
    inputSchema: {
      path: z.string().min(1),
      data: z.record(z.string(), z.unknown()),
    },
    annotations: write,
  },
  async (input) => {
    const path = assertDocumentPath(input.path);
    await db.doc(path).create({
      ...input.data,
      createdAt: input.data["createdAt"] ?? FieldValue.serverTimestamp(),
      updatedAt: input.data["updatedAt"] ?? FieldValue.serverTimestamp(),
    });
    const after = await snapshot(path);
    await audit("firestore_create_document", path, null, after, input);
    return json(after);
  },
);

server.registerTool(
  "firestore_update_document",
  {
    title: "Update Firestore document",
    description: "Update one document using a required update-time precondition.",
    inputSchema: {
      path: z.string().min(1),
      expectedUpdateToken: z.string().min(1),
      data: z.record(z.string(), z.unknown()),
    },
    annotations: write,
  },
  async (input) => {
    const path = assertDocumentPath(input.path);
    const before = await snapshot(path);
    if (!before) throw new Error("Document not found.");
    await db.doc(path).update(
      { ...input.data, updatedAt: FieldValue.serverTimestamp() },
      { lastUpdateTime: timestampFromToken(input.expectedUpdateToken) },
    );
    const after = await snapshot(path);
    await audit("firestore_update_document", path, before, after, input);
    return json(after);
  },
);

const writeOperation = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), path: z.string(), data: z.record(z.string(), z.unknown()) }),
  z.object({ operation: z.literal("update"), path: z.string(), expectedUpdateToken: z.string(), data: z.record(z.string(), z.unknown()) }),
  z.object({ operation: z.literal("delete"), path: z.string(), expectedUpdateToken: z.string(), confirmation: z.string() }),
]);

server.registerTool(
  "firestore_batch_write",
  {
    title: "Batch Firestore writes",
    description: "Atomically create, update or delete up to 20 explicit document paths.",
    inputSchema: { writes: z.array(writeOperation).min(1).max(20) },
    annotations: destructive,
  },
  async ({ writes }) => {
    const batch = db.batch();
    const before: Record<string, unknown> = {};
    for (const item of writes) {
      const path = assertDocumentPath(item.path);
      const ref = db.doc(path);
      before[path] = await snapshot(path);
      if (item.operation === "create") batch.create(ref, item.data);
      if (item.operation === "update")
        batch.update(ref, item.data, { lastUpdateTime: timestampFromToken(item.expectedUpdateToken) });
      if (item.operation === "delete") {
        if (item.confirmation !== `DELETE ${path}`) throw new Error(`Confirmation must be "DELETE ${path}".`);
        batch.delete(ref, { lastUpdateTime: timestampFromToken(item.expectedUpdateToken) });
      }
    }
    await batch.commit();
    await audit("firestore_batch_write", writes.map((item: any) => item.path).join(", "), before, null, { writes });
    return message(`Committed ${writes.length} Firestore writes.`);
  },
);

server.registerTool(
  "firestore_delete_document",
  {
    title: "Delete Firestore document",
    description: "Delete one explicit document with update token and exact confirmation. Does not recursively delete subcollections.",
    inputSchema: {
      path: z.string().min(1),
      expectedUpdateToken: z.string().min(1),
      confirmation: z.string().min(1),
    },
    annotations: destructive,
  },
  async (input) => {
    const path = assertDocumentPath(input.path);
    if (input.confirmation !== `DELETE ${path}`) throw new Error(`Confirmation must be "DELETE ${path}".`);
    const before = await snapshot(path);
    if (!before) throw new Error("Document not found.");
    await db.doc(path).delete({ lastUpdateTime: timestampFromToken(input.expectedUpdateToken) });
    await audit("firestore_delete_document", path, before, null, input);
    return message(`Deleted ${path}.`);
  },
);

server.registerTool(
  "sefpo_search",
  {
    title: "Search SEFPO knowledge",
    description: "Return compact SEFPO results for agent retrieval without expanding full canonical documents.",
    inputSchema: {
      uid: z.string().min(1),
      query: z.string().default(""),
      status: z.enum(["draft", "validated", "disputed"]).optional(),
      limit: z.number().int().positive().max(50).default(20),
    },
    annotations: readOnly,
  },
  async ({ uid, query: needleInput, status, limit }) => {
    const take = boundedLimit(limit, 50);
    const scan = Math.min(Math.max(take * 5, 50), 250);
    let q: Query = db.collection(bucket(uid, "units")).orderBy("updatedAt", "desc").limit(scan);
    const result = await q.get();
    const needle = needleInput.trim().toLowerCase();
    const items = result.docs
      .map((item: any) => ({ id: item.id, ...item.data() }))
      .filter((item: Record<string, unknown>) => !status || item["status"] === status)
      .filter((item: Record<string, unknown>) => !needle || String(item["searchText"] || item["title"] || "").toLowerCase().includes(needle))
      .slice(0, take)
      .map((item: Record<string, unknown>) => ({
        id: item["id"],
        title: item["title"],
        status: item["status"],
        confidence: item["confidence"],
        subject: (item["subject"] as Array<Record<string, unknown>> | undefined)?.map((x) => x["label"] || x["entityId"]),
        event: (item["event"] as Record<string, unknown> | undefined)?.["summary"],
        outputs: (item["outputs"] as Array<Record<string, unknown>> | undefined)?.map((x) => x["label"] || x["entityId"]),
        updatedAt: item["updatedAt"],
      }));
    return json(items);
  },
);

server.registerTool(
  "sefpo_get_context",
  {
    title: "Get SEFPO context packet",
    description: "Return one denormalized context packet plus canonical metadata, graph edges and evidence.",
    inputSchema: {
      uid: z.string().min(1),
      unitId: z.string().min(1),
      edgeLimit: z.number().int().positive().max(50).default(20),
    },
    annotations: readOnly,
  },
  async ({ uid, unitId, edgeLimit }) => {
    const unitPath = `${bucket(uid, "units")}/${unitId}`;
    const contextPath = `${bucket(uid, "context")}/${unitId}`;
    const [unit, context, outgoing, incoming] = await Promise.all([
      snapshot(unitPath),
      snapshot(contextPath),
      db.collection(bucket(uid, "edges")).where("fromId", "==", unitId).limit(edgeLimit).get(),
      db.collection(bucket(uid, "edges")).where("toId", "==", unitId).limit(edgeLimit).get(),
    ]);
    if (!unit) throw new Error("SEFPO unit not found.");
    const refs = Array.isArray(unit["evidenceRefs"]) ? (unit["evidenceRefs"] as string[]).slice(0, 20) : [];
    const evidence = await Promise.all(refs.map((id) => snapshot(`${bucket(uid, "evidence")}/${id}`)));
    return json({
      context,
      canonical: {
        id: unit["id"], title: unit["title"], status: unit["status"], confidence: unit["confidence"],
        revision: unit["revision"], updatedAt: unit["updatedAt"], updateToken: unit["updateToken"],
      },
      edges: [
        ...outgoing.docs.map((item: any) => ({ id: item.id, ...item.data() })),
        ...incoming.docs.map((item: any) => ({ id: item.id, ...item.data() })),
      ],
      evidence: evidence.filter(Boolean),
    });
  },
);

server.registerTool(
  "sefpo_changes_since",
  {
    title: "Get SEFPO changes since cursor",
    description: "Incremental knowledge delta so agents do not reread the whole store.",
    inputSchema: {
      uid: z.string().min(1),
      since: z.string().min(1),
      limit: z.number().int().positive().max(200).default(100),
    },
    annotations: readOnly,
  },
  async ({ uid, since, limit }) => {
    if (Number.isNaN(new Date(since).valueOf())) throw new Error("since must be an ISO date/time.");
    const result = await db
      .collection(bucket(uid, "changes"))
      .where("changedAt", ">", since)
      .orderBy("changedAt", "asc")
      .limit(boundedLimit(limit, 200))
      .get();
    return json({
      items: result.docs.map((item: any) => ({ id: item.id, ...item.data() })),
      nextCursor: result.docs.at(-1)?.data()?.["changedAt"] || since,
    });
  },
);

const sefpoDraftSchema = {
  uid: z.string().min(1),
  title: z.string().min(1).max(180),
  subject: z.string().min(1).max(500),
  event: z.string().min(1).max(2000),
  factors: z.array(z.string().min(1).max(500)).min(1).max(20),
  process: z.string().min(1).max(5000),
  outputs: z.array(z.string().min(1).max(500)).min(1).max(20),
  scope: z.string().max(3000).default(""),
  confidence: z.number().min(0).max(1).default(0.5),
  evidenceUrls: z.array(z.string().url()).max(20).default([]),
};

server.registerTool(
  "sefpo_create_draft",
  {
    title: "Create SEFPO draft",
    description: "Atomically create a canonical unit, shared entities, context packet, evidence records and change record.",
    inputSchema: sefpoDraftSchema,
    annotations: write,
  },
  async (input) => {
    const uid = assertUid(input.uid);
    const unitRef = db.collection(bucket(uid, "units")).doc();
    const createdAt = new Date().toISOString();
    const subjectId = slug(input.subject);
    const factors = input.factors.map((label) => ({ entityId: slug(label), label, relation: "influences" }));
    const outputs = input.outputs.map((label) => ({ entityId: slug(label), label, effect: "unspecified" }));
    const entityRefs = [...new Set([subjectId, ...factors.map((x) => x.entityId), ...outputs.map((x) => x.entityId)])];
    const evidenceRefs = input.evidenceUrls.map(() => db.collection(bucket(uid, "evidence")).doc());
    const searchText = [input.title, input.subject, input.event, ...input.factors, input.process, ...input.outputs, input.scope].join(" ").toLowerCase();
    const unit = {
      schemaVersion: 1,
      id: unitRef.id,
      title: input.title,
      subject: [{ entityId: subjectId, label: input.subject, role: "target" }],
      event: { type: "event", summary: input.event },
      factors,
      process: { summary: input.process, steps: [] },
      outputs,
      scope: { summary: input.scope, conditions: [] },
      confidence: input.confidence,
      status: "draft",
      entityRefs,
      evidenceRefs: evidenceRefs.map((x) => x.id),
      revision: 1,
      searchText,
      createdAt,
      updatedAt: createdAt,
      createdBy: actor,
      updatedBy: actor,
    };
    const context = {
      schemaVersion: 1,
      unitId: unitRef.id,
      title: input.title,
      status: "draft",
      summary: `${input.subject} — ${input.event} → ${input.outputs.join(", ")}`,
      sefpo: {
        subject: input.subject,
        event: input.event,
        factors: input.factors.join("\n"),
        process: input.process,
        output: input.outputs.join("\n"),
      },
      entityRefs,
      evidenceRefs: evidenceRefs.map((x) => x.id),
      confidence: input.confidence,
      scope: { summary: input.scope },
      searchText,
      updatedAt: createdAt,
    };
    const batch = db.batch();
    batch.create(unitRef, unit);
    batch.set(db.doc(`${bucket(uid, "context")}/${unitRef.id}`), context);
    const entities = [
      { id: subjectId, label: input.subject, role: "subject" },
      ...factors.map((x) => ({ id: x.entityId, label: x.label, role: "factor" })),
      ...outputs.map((x) => ({ id: x.entityId, label: x.label, role: "output" })),
    ];
    for (const entity of entities)
      batch.set(db.doc(`${bucket(uid, "entities")}/${entity.id}`), {
        label: entity.label,
        normalized: entity.label.toLowerCase(),
        roles: FieldValue.arrayUnion(entity.role),
        updatedAt: createdAt,
      }, { merge: true });
    evidenceRefs.forEach((ref, index) =>
      batch.create(ref, {
        type: "url",
        url: input.evidenceUrls[index],
        unitId: unitRef.id,
        label: input.title,
        stance: "supports",
        createdAt,
      }),
    );
    const changeRef = db.collection(bucket(uid, "changes")).doc();
    batch.create(changeRef, {
      objectType: "unit",
      objectId: unitRef.id,
      change: "created",
      label: `Created · ${input.title}`,
      revision: 1,
      changedAt: createdAt,
      actor,
    });
    await batch.commit();
    const after = await snapshot(unitRef.path);
    await audit("sefpo_create_draft", unitRef.path, null, after, input);
    return json(after);
  },
);

server.registerTool(
  "sefpo_set_status",
  {
    title: "Set SEFPO validation status",
    description: "Revisioned state transition using the canonical unit update token.",
    inputSchema: {
      uid: z.string().min(1),
      unitId: z.string().min(1),
      expectedUpdateToken: z.string().min(1),
      status: z.enum(["draft", "validated", "disputed"]),
      note: z.string().max(2000).default(""),
    },
    annotations: write,
  },
  async (input) => {
    const unitPath = `${bucket(input.uid, "units")}/${input.unitId}`;
    const unitRef = db.doc(unitPath);
    const contextRef = db.doc(`${bucket(input.uid, "context")}/${input.unitId}`);
    const changeRef = db.collection(bucket(input.uid, "changes")).doc();
    const before = await snapshot(unitPath);
    if (!before) throw new Error("SEFPO unit not found.");
    const updatedAt = new Date().toISOString();
    await db.runTransaction(async (tx: Transaction) => {
      const current = await tx.get(unitRef);
      if (!current.exists || updateToken(current.updateTime) !== input.expectedUpdateToken)
        throw new Error("SEFPO unit changed after it was read. Fetch fresh context and retry.");
      const revision = Number(current.data()?.["revision"] || 1) + 1;
      tx.update(unitRef, { status: input.status, revision, updatedAt, updatedBy: actor });
      tx.set(contextRef, { status: input.status, updatedAt }, { merge: true });
      tx.create(changeRef, {
        objectType: "unit",
        objectId: input.unitId,
        change: "status_changed",
        label: `${current.data()?.["title"] || input.unitId} · ${input.status}`,
        note: input.note,
        revision,
        changedAt: updatedAt,
        actor,
      });
    });
    const after = await snapshot(unitPath);
    await audit("sefpo_set_status", unitPath, before, after, input);
    return json(after);
  },
);

server.registerTool(
  "sefpo_link_units",
  {
    title: "Link SEFPO units",
    description: "Create an explicit graph edge between two canonical units.",
    inputSchema: {
      uid: z.string().min(1),
      fromId: z.string().min(1),
      toId: z.string().min(1),
      relation: z.string().min(1).max(120),
      confidence: z.number().min(0).max(1).default(0.5),
      note: z.string().max(1000).default(""),
    },
    annotations: write,
  },
  async (input) => {
    if (input.fromId === input.toId) throw new Error("A unit cannot link to itself.");
    const [from, to] = await Promise.all([
      snapshot(`${bucket(input.uid, "units")}/${input.fromId}`),
      snapshot(`${bucket(input.uid, "units")}/${input.toId}`),
    ]);
    if (!from || !to) throw new Error("Both SEFPO units must exist.");
    const edgeRef = db.collection(bucket(input.uid, "edges")).doc();
    const changedAt = new Date().toISOString();
    const edge = { fromId: input.fromId, toId: input.toId, relation: input.relation, confidence: input.confidence, note: input.note, active: true, createdAt: changedAt, updatedAt: changedAt, createdBy: actor };
    const batch = db.batch();
    batch.create(edgeRef, edge);
    batch.create(db.collection(bucket(input.uid, "changes")).doc(), {
      objectType: "edge", objectId: edgeRef.id, change: "linked",
      label: `${from["title"]} → ${input.relation} → ${to["title"]}`,
      changedAt, actor,
    });
    await batch.commit();
    await audit("sefpo_link_units", edgeRef.path, null, edge, input);
    return json({ id: edgeRef.id, ...edge });
  },
);

server.registerTool(
  "sefpo_capture_inbox",
  {
    title: "Capture SEFPO inbox item",
    description: "Store a raw observation or source without prematurely forcing it into the SEFPO schema.",
    inputSchema: {
      uid: z.string().min(1),
      text: z.string().min(1).max(12000),
      sourceUrl: z.string().url().optional(),
      kind: z.enum(["observation", "source", "question", "idea"]).default("observation"),
    },
    annotations: write,
  },
  async (input) => {
    const ref = db.collection(bucket(input.uid, "inbox")).doc();
    const value = { text: input.text, sourceUrl: input.sourceUrl || "", kind: input.kind, status: "unprocessed", createdAt: new Date().toISOString(), createdBy: actor };
    await ref.create(value);
    await audit("sefpo_capture_inbox", ref.path, null, value, input);
    return json({ id: ref.id, ...value });
  },
);

server.registerTool("pti_apps_list", {
  title: "Discover PTI apps", description: "List every registered PTI app, its data location, access capabilities and limitations.",
  inputSchema: {}, annotations: readOnly,
}, async () => json({ projectId, database: "(default)", uid: context.uid || null, apps: appCatalog(context.uid) }));
server.registerTool("pti_app_context", {
  title: "Get PTI app data map", description: "Get an app's canonical collections and specialized tools before querying or changing its data.",
  inputSchema: { appId: z.string(), uid: z.string().optional() }, annotations: readOnly,
}, async ({ appId, uid }) => {
  const owner = context.uid || (uid ? assertUid(uid) : undefined);
  if (uid) assertUid(uid);
  const app = appCatalog(owner).find(app => app.id === appId);
  if (!app) throw new Error("Unknown app; call pti_apps_list.");
  return json(app);
});
registerPersonalTools(server, db, context.uid, audit);
registerFoodTools(server, db, context.uid);
return server;
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  await createMcpServer().connect(new StdioServerTransport());
}
