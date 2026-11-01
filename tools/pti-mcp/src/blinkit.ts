import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { assertUser } from './access.js';

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const uid = z.string().optional();
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const cursor = z.string().min(1).max(20000).nullable();
const nullableText = (max = 1000) => z.string().max(max).nullable().default(null);
const amount = z.number().finite().min(-10000000).max(10000000).nullable().default(null);
const phase = z.object({ kind: z.enum(['live', 'finished', 'unknown']), status: nullableText(100) });
const row = z.object({ order: z.string().min(1).max(500), phase, statusText: nullableText(), placedText: nullableText() });
const detail = z.object({
  order: z.string().min(1).max(500), phase, statusText: nullableText(), etaText: nullableText(),
  refreshAfterMs: z.number().int().min(0).max(86400000).nullable().default(null),
  contents: z.object({ kind: z.literal('read'), reference: z.string().min(1).max(200), placedText: nullableText(),
    items: z.array(z.object({ name: z.string().min(1).max(500).nullable(), quantityText: nullableText(300), amount,
      excludedNonfood: z.boolean().default(false) }).refine(v => v.name !== null || v.excludedNonfood, 'Only redacted nonfood may omit its name.')).max(200),
    bill: z.object({ billTotal: amount, lines: z.array(z.object({ label: z.string().max(300), amount, text: nullableText(100) })).max(100) }),
  }),
});
const page = z.object({
  cursor, orders: z.array(row).max(10), live: z.array(row).max(20), hasMore: z.boolean(), nextCursor: cursor, truncated: z.boolean(),
  unreadableRows: z.number().int().min(0).max(10000), unlistedLiveOrders: z.number().int().min(0).max(10000),
});
const errorCode = z.enum(['not_answered', 'order_not_found', 'needs_login', 'needs_location', 'disabled', 'rate_limited', 'truncated', 'unreadable_rows', 'repeated_cursor', 'invalid_list_shape', 'invalid_cursor', 'read_tool_discovery_failed', 'order_token_mismatch', 'incomplete_detail', 'incomplete_item', 'contents_unavailable', 'transient', 'persistence_or_revision_conflict']);
const rules = [
  'First-party Blinkit page WebMCP reads only: get_session, list_orders, get_order. Discover suffixed names each document/turn. No scraping, REST endpoints, cart, address, payment or login writes.',
  'Purchases are separate from restaurant receipts, dish/restaurant frequencies, recommendations and confirmed taste. Purchase never establishes consumption, enjoyment or nutrition.',
  'Food/unknown classification uses a conservative product-name heuristic. Unknown lines require review. Nonfood names, sessions, account IDs, address and payment data are excluded.',
  'Whole bill total includes excluded items and charges/refunds. Food line amounts are not food spend. Exact display dates have no known year/ISO; capturedAt is observation time.',
  'History is complete only after end-of-pagination and all listed details persisted or verified identical. Live/unknown orders and unlisted live orders remain reconciliation work. No autonomous schedule.',
];
const loadModel = async () => { const path = './blinkit/model.mjs'; return import(path); };

export function registerBlinkitTools(server: McpServer, db: Firestore, owner: string | undefined) {
  const root = (requested?: string) => {
    if (requested) assertUser(requested, owner);
    return db.doc(`users/${assertUser(owner || requested || '', owner)}/foodData/workspace`);
  };
  const settle = (run: any) => {
    if (!run.pending.length) { run.cursor = run.nextCursor; run.endReached = run.nextCursor === null; }
    return run;
  };

  server.registerTool('food_blinkit_ingest', {
    title: 'Import a first-party Blinkit food purchase',
    description: 'Persist full order detail read through Blinkit page WebMCP, with nonfood names redacted. Atomically deduplicate by provider/reference; changed payloads require current expectedRevision and a later capture. Preserve immutable revisions and whole-bill reconciliation. Never infer consumption. Use food_blinkit_sync to checkpoint historical import.',
    inputSchema: { uid, detail, capturedAt: z.iso.datetime({ offset: true }), listPlacedText: nullableText(), runId: id.optional(), expectedRevision: z.number().int().positive().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async input => {
    const ref = root(input.uid), model = await loadModel();
    if (Date.parse(input.capturedAt) > Date.now() + 300000) throw new Error('Capture time cannot be in the future.');
    const purchase = model.normalizePurchase(input.detail, input.capturedAt, input.listPlacedText);
    const purchaseRef = ref.collection('purchases').doc(purchase.id), stateRef = ref.collection('purchaseSyncState').doc('blinkit');
    const runRef = input.runId ? ref.collection('purchaseSyncRuns').doc(input.runId) : null;
    const result = await db.runTransaction(async tx => {
      const [settings, existingSnap, stateSnap, runSnap] = await Promise.all([
        tx.get(ref), tx.get(purchaseRef), tx.get(stateRef), runRef ? tx.get(runRef) : Promise.resolve(null),
      ]);
      if (settings.get('ingestionPaused') === true) throw new Error('Morsel ingestion is paused by its owner.');
      const existing = existingSnap.data(), state: any = stateSnap.data() || {}, run: any = runSnap?.data();
      if (runRef && !run) throw new Error('Start the sync run before ingesting its pending rows.');
      const pending = run?.pending.find((p: any) => p.order === input.detail.order);
      if (runRef && !pending && !existing) throw new Error('This order is not pending in this run.');
      if (existing && (!Number.isInteger(existing.revision) || !existing.fingerprint)) throw new Error('Unversioned purchase requires repair; refusing unsafe overwrite.');
      const duplicate = existing?.fingerprint === purchase.fingerprint;
      if (existing && !duplicate) {
        if (input.expectedRevision !== existing.revision) throw new Error(`Changed purchase conflict. Read food_blinkit_context, review changes, then pass expectedRevision ${existing.revision}.`);
        if (Date.parse(input.capturedAt) <= Date.parse(existing.capturedAt)) throw new Error('A changed revision needs a strictly later capture time.');
      }
      const revision = duplicate ? existing!.revision : (existing?.revision || 0) + 1;
      const at = new Date().toISOString();
      if (!duplicate) {
        const record = { ...purchase.payload, id: purchase.id, schemaVersion: 1, revision, fingerprint: purchase.fingerprint,
          capturedAt: input.capturedAt, provenance: purchase.provenance, needsReconciliation: purchase.needsReconciliation,
          firstImportedAt: existing?.firstImportedAt || at, updatedAt: at };
        tx.set(purchaseRef, record);
        tx.create(purchaseRef.collection('revisions').doc(String(revision).padStart(10, '0')), {
          ...record, previousFingerprint: existing?.fingerprint || null, runId: input.runId || null,
        });
        const counts = { ...(state.statusCounts || {}) }, bucket = model.statusBucket(record.phase);
        if (existing) { const previous = model.statusBucket(existing.phase); counts[previous] = Math.max(0, (counts[previous] || 0) - 1); }
        counts[bucket] = (counts[bucket] || 0) + 1;
        tx.set(stateRef, { ...state, provider: 'blinkit', purchaseCount: (state.purchaseCount || 0) + (existing ? 0 : 1),
          revisionCount: (state.revisionCount || 0) + 1, statusCounts: counts, lastPersistedAt: at });
      }
      if (runRef && pending) {
        const next = settle({ ...run, pending: run.pending.filter((p: any) => p.order !== input.detail.order),
          verifiedRows: run.verifiedRows + 1, duplicateRows: run.duplicateRows + (duplicate ? 1 : 0),
          revision: run.revision + 1, updatedAt: at, status: 'running', lastError: null });
        tx.set(runRef, next);
      }
      return { ok: true, duplicate, purchaseId: purchase.id, revision, fingerprint: purchase.fingerprint,
        needsReconciliation: duplicate ? existing!.needsReconciliation : purchase.needsReconciliation };
    });
    return json(result);
  });

  server.registerTool('food_blinkit_context', {
    title: 'Read Blinkit purchases, products and sync progress',
    description: 'Owner-scoped purchase/product query, guarded revision context and resumable Blinkit run. Product matching scans one explicit page; continue nextAfter even if matches are empty. Reconciliation scope includes live/unknown purchases. Does not affect meal/taste counts.',
    inputSchema: { uid, runId: id.optional(), purchaseId: id.optional(), product: z.string().min(1).max(200).optional(),
      scope: z.enum(['all', 'reconciliation']).default('all'), after: id.optional(), limit: z.number().int().min(1).max(100).default(20) },
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, async input => {
    const ref = root(input.uid);
    const [settings, state, run] = await Promise.all([ref.get(), ref.collection('purchaseSyncState').doc('blinkit').get(),
      input.runId ? ref.collection('purchaseSyncRuns').doc(input.runId).get() : Promise.resolve(null)]);
    let purchases: any[], nextAfter: string | null = null, revisions: any[] | undefined;
    if (input.purchaseId) {
      const purchaseRef = ref.collection('purchases').doc(input.purchaseId), snap = await purchaseRef.get();
      purchases = snap.exists ? [snap.data()] : [];
      const history = await purchaseRef.collection('revisions').orderBy('__name__', 'desc').limit(10).get();
      revisions = history.docs.map(d => d.data());
    } else {
      let q: any = ref.collection('purchases');
      if (input.scope === 'reconciliation') q = q.where('needsReconciliation', '==', true);
      q = q.orderBy('__name__'); if (input.after) q = q.startAfter(input.after);
      const snap = await q.limit(input.limit + 1).get();
      purchases = snap.docs.slice(0, input.limit).map((d: any) => d.data());
      if (snap.size > input.limit) nextAfter = snap.docs[input.limit - 1].id;
    }
    const needle = input.product?.toLocaleLowerCase();
    const products = purchases.flatMap(p => [...p.foodItems, ...p.unknownItems].filter(i => !needle || i.name.toLocaleLowerCase().includes(needle)).map(item => ({
      purchaseId: p.id, reference: p.reference, phase: p.phase, placedText: p.placedText, purchasedAt: null, capturedAt: p.capturedAt, item,
    })));
    return json({ namespace: ref.path, ingestionPaused: settings.get('ingestionPaused') === true,
      state: state.data() || null, run: run?.data() || null, purchases: needle ? purchases.filter(p => products.some(i => i.purchaseId === p.id)) : purchases,
      products, ...(revisions ? { revisions, revisionWindow: 'latest 10; older immutable revisions remain under purchase/revisions' } : {}),
      window: { scanned: purchases.length, nextAfter, complete: nextAfter === null, basis: 'document ID page, not purchase chronology' }, rules });
  });

  server.registerTool('food_blinkit_sync', {
    title: 'Checkpoint a manual Blinkit purchase sync',
    description: 'Start a bounded history or reconciliation run; stage a redacted first-party list page before any details; retain failed rows; finish only after end reached and every row verified by specialized ingest. Revision guard protects checkpoints. Never schedules or calls Blinkit. Read current run through food_blinkit_context.',
    inputSchema: { uid, action: z.enum(['start', 'page', 'fail', 'block', 'finish']), runId: id,
      mode: z.enum(['history', 'reconcile']).default('history'), expectedRevision: z.number().int().positive().optional(),
      page: page.optional(), order: z.string().min(1).max(500).optional(), errorCode: errorCode.optional() },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async input => {
    const ref = root(input.uid), runRef = ref.collection('purchaseSyncRuns').doc(input.runId), stateRef = ref.collection('purchaseSyncState').doc('blinkit');
    const model = await loadModel();
    const result = await db.runTransaction(async tx => {
      const [settings, snap, stateSnap] = await Promise.all([tx.get(ref), tx.get(runRef), tx.get(stateRef)]);
      if (settings.get('ingestionPaused') === true) throw new Error('Morsel ingestion is paused by its owner.');
      const state: any = stateSnap.data() || {}, current: any = snap.data(), at = new Date().toISOString();
      if (input.action === 'start') {
        if (current) {
          if (current.mode !== input.mode) throw new Error('Run ID already exists with a different mode.');
          return { ok: true, run: current };
        }
        const run = { runId: input.runId, provider: 'blinkit', mode: input.mode, revision: 1, cursor: null, nextCursor: null,
          pending: [], pageCount: 0, listedRows: 0, verifiedRows: 0, duplicateRows: 0, repeatedRows: 0,
          unlistedLiveOrders: 0, endReached: false, historyComplete: false, status: 'running', lastError: null, startedAt: at, updatedAt: at };
        tx.create(runRef, run); return { ok: true, run };
      }
      if (!current) throw new Error('Run not found. Start it first.');
      if (input.expectedRevision !== current.revision) throw new Error('Sync revision conflict; reread the run before continuing.');
      if (current.historyComplete) {
        if (input.action === 'finish') return { ok: true, run: current };
        throw new Error('This scan has finished. Start a new run to reconcile fresh page reads.');
      }
      const run: any = { ...current, revision: current.revision + 1, updatedAt: at };
      if (input.action === 'page') {
        const p = input.page;
        if (!p) throw new Error('A redacted list page is required.');
        if (p.truncated || p.unreadableRows) throw new Error('Incomplete page: retry the same cursor; never advance.');
        if (p.hasMore !== (p.nextCursor !== null)) throw new Error('hasMore and nextCursor disagree.');
        if (run.pending.length || run.endReached || p.cursor !== run.cursor) throw new Error('Resolve pending rows and use the exact saved cursor.');
        if (p.nextCursor !== null && p.nextCursor === p.cursor) throw new Error('repeated_cursor');
        const pageId = model.hash(p.cursor === null ? 'start' : `cursor:${p.cursor}`), pageRef = runRef.collection('pages').doc(pageId);
        const [previous, nextSeen] = await Promise.all([tx.get(pageRef), p.nextCursor === null ? Promise.resolve(null) : tx.get(runRef.collection('pages').doc(model.hash(`cursor:${p.nextCursor}`)))]);
        if (previous.exists || nextSeen?.exists) throw new Error('repeated_cursor');
        const rows = new Map<string, any>();
        // Live context takes precedence if the same order is repeated across both lists.
        for (const r of [...p.orders, ...p.live]) rows.set(r.order, r);
        run.pending = [...rows.values()].map(r => ({ ...r, attempts: 0, lastError: null }));
        run.nextCursor = p.nextCursor; run.pageCount++; run.listedRows += rows.size;
        run.repeatedRows += p.orders.length + p.live.length - rows.size;
        run.unlistedLiveOrders = Math.max(run.unlistedLiveOrders, p.unlistedLiveOrders);
        run.status = 'running'; run.lastError = null;
        settle(run);
        tx.create(pageRef, { pageId, stagedAt: at, rowCount: rows.size, repeatedRows: p.orders.length + p.live.length - rows.size,
          hasMore: p.hasMore, unlistedLiveOrders: p.unlistedLiveOrders }); // no redundant cursors/names/session blobs
        tx.set(stateRef, { ...state, provider: 'blinkit', unlistedLiveOrders: p.unlistedLiveOrders, lastListObservedAt: at });
      } else if (input.action === 'fail') {
        if (!input.errorCode || !run.pending.some((p: any) => p.order === input.order)) throw new Error('Name a pending order and a bounded error code.');
        run.pending = run.pending.map((p: any) => p.order === input.order ? { ...p, attempts: p.attempts + 1, lastError: input.errorCode } : p);
        run.status = 'partial'; run.lastError = input.errorCode;
      } else if (input.action === 'block') {
        if (!input.errorCode) throw new Error('A bounded error code is required.');
        run.status = 'blocked'; run.lastError = input.errorCode;
      } else if (input.action === 'finish') {
        if (!run.endReached || run.pending.length || run.listedRows !== run.verifiedRows) throw new Error('Cannot finish: history end and all persisted/identical rows must be verified.');
        run.historyComplete = true; run.completedAt = at;
        const unresolved = (state.statusCounts?.live || 0) + (state.statusCounts?.unknown || 0) + run.unlistedLiveOrders;
        run.status = unresolved ? 'history_complete_reconciliation_pending' : 'complete';
        tx.set(stateRef, { ...state, provider: 'blinkit', ...(run.mode === 'history' ? { lastHistoryRunId: input.runId, lastHistoryScanCompletedAt: at } : { lastReconciliationRunId: input.runId, lastReconciliationScanCompletedAt: at }),
          lastScanStatus: run.status });
      }
      tx.set(runRef, run);
      return { ok: true, run };
    });
    return json(result);
  });
}
