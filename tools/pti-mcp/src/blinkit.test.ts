import { afterEach, describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
// Test the built/deployable files, including the adapter actually copied into the image.
import { registerBlinkitTools } from '../dist/blinkit.js';
import { assertWritablePath } from './access.js';
import { appCatalog } from './apps.js';
import express from 'express';
import {morselBlinkitRouter,MORSEL_ORIGIN} from '../dist/morsel-blinkit-http.js';
// @ts-ignore JavaScript connector is deliberately reusable without the MCP server.
import { normalizePurchase, projectDetail, packQuantity, classify } from '../dist/blinkit/model.mjs';
// @ts-ignore
import { createBlinkitReader, decodeEnvelope, discoverReadTools, syncBlinkitBatch } from '../dist/blinkit/connector.mjs';

const root = 'users/owner/foodData/workspace', at = '2026-10-01T12:00:00.000Z', later = '2026-10-02T12:00:00.000Z';
// Entirely synthetic orders. Only the envelope/field structure follows observed first-party tools.
const detail = (token = 'synthetic-row-1', patch: any = {}): any => ({
  order: token, phase: { kind: 'finished', status: 'delivered' }, statusText: 'Arrived in 15 minutes',
  contents: { kind: 'read', reference: `SYNTHETIC-${token}`, placedText: 'placed today, 2:00 PM',
    paymentMode: 'SYNTHETIC-PAYMENT-PRIVATE', addressLabel: 'SYNTHETIC-ADDRESS-PRIVATE',
    items: [{ name: 'Lemon', quantityText: '200 g x 1', amount: 20 },
      { name: 'Cheese Popcorn', quantityText: '3 x 35 g x 1', amount: 80 },
      { name: 'Peanuts', quantityText: '200 g x 2', amount: 40 },
      { name: 'Synthetic Keyboard', quantityText: '1 unit x 1', amount: 100 },
      { name: 'Synthetic Hair Trimmer', quantityText: '1 unit x 1', amount: 50 },
      { name: 'Mystery Botanical Blend', quantityText: 'bundle', amount: null }],
    bill: { billTotal: 300, lines: [{ label: 'Item total', amount: 290, text: '₹290' }, { label: 'Handling charge', amount: 10, text: '+₹10' }, { label: 'Bill total', amount: 300, text: '₹300' }] },
  }, ...patch,
});
const row = (order = 'synthetic-row-1', patch = {}) => ({ order, phase: { kind: 'finished', status: 'delivered' }, statusText: 'Delivered', placedText: 'Today, 2:00 pm', itemNames: ['Lemon'], ...patch });
const page = (orders: any[] = [row()], cursor: string | null = null, nextCursor: string | null = null, patch = {}) => ({ cursor, orders, live: [], hasMore: nextCursor !== null, nextCursor, truncated: false, unreadableRows: 0, unlistedLiveOrders: 0, ...patch });
const envelope = (result: any, session: any = { userId: 'SYNTHETIC-USER-PRIVATE', login: { kind: 'logged_in' } }) => JSON.stringify({ structuredContent: { ok: true, session, result } });

class MemoryDb {
  rows = new Map<string, any>(); queue = Promise.resolve();
  snap(path: string): any { const value = structuredClone(this.rows.get(path)); return { id: path.split('/').at(-1), exists: value !== undefined, data: () => value, get: (field: string) => value?.[field] }; }
  doc(path: string): any { return { path, id: path.split('/').at(-1), collection: (name: string) => this.query(path + '/' + name), get: async () => this.snap(path) }; }
  query(path: string, take = 100, after = '', direction = 'asc', filter?: [string, any]): any {
    return { path, doc: (id: string) => this.doc(path + '/' + id), orderBy: (_: string, dir = 'asc') => this.query(path, take, after, dir, filter),
      startAfter: (id: string) => this.query(path, take, id, direction, filter), limit: (n: number) => this.query(path, n, after, direction, filter),
      where: (field: string, _: string, value: any) => this.query(path, take, after, direction, [field, value]),
      get: async () => { let keys = [...this.rows.keys()].filter(k => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/') && k.slice(path.length + 1) > after).sort();
        if (direction === 'desc') keys.reverse(); let docs = keys.map(k => this.snap(k)); if (filter) docs = docs.filter(d => d.get(filter[0]) === filter[1]); docs = docs.slice(0, take); return { docs, size: docs.length }; },
    };
  }
  runTransaction(fn: any): any {
    const result = this.queue.then(async () => {
      const writes: any[] = []; let writing = false;
      const output = await fn({ get: async (ref: any) => { if (writing) throw new Error('Read after write'); return this.snap(ref.path); },
        create: (ref: any, value: any) => { writing = true; writes.push([ref.path, structuredClone(value), true]); },
        set: (ref: any, value: any) => { writing = true; writes.push([ref.path, structuredClone(value), false]); } });
      const staged = new Map(this.rows);
      for (const [path, value, create] of writes) { if (create && staged.has(path)) throw new Error('Already exists'); staged.set(path, value); }
      this.rows = staged; return output;
    }); this.queue = result.then(() => undefined, () => undefined); return result;
  }
}
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });
async function fixture() {
  const db = new MemoryDb(); db.rows.set(root, { ingestionPaused: false, orderCount: 97, integration: { type: 'gmail-event' } });
  const server = new McpServer({ name: 'synthetic-blinkit-test', version: '1' }); registerBlinkitTools(server, db as any, 'owner');
  const client = new Client({ name: 'synthetic-test', version: '1' }), [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]); cleanups.push(async () => { await client.close(); await server.close(); });
  const raw = (name: string, args: any) => client.callTool({ name, arguments: args });
  const call = async (name: string, args: any) => { const result = await raw(name, args), text = (result.content as any[]).find(c => c.type === 'text')?.text;
    if (result.isError) throw new Error(text); return JSON.parse(text); };
  const context = (args: any = {}) => call('food_blinkit_context', args), sync = (args: any) => call('food_blinkit_sync', args);
  const ingest = (args: any = {}) => call('food_blinkit_ingest', { detail: detail(), capturedAt: at, ...args });
  const persistence = { context, sync, ingest };
  return { db, client, raw, call, context, sync, ingest, persistence };
}
async function step(t: any, action: string, extra: any = {}, runId = 'synthetic-run') {
  const { run } = await t.context({ runId }); return t.sync({ action, runId, expectedRevision: run.revision, ...extra });
}
const reader = (callTool: any, suffix = '__synthetic_uuid_1') => createBlinkitReader({ discoverTools: async () => ['get_session', 'list_orders', 'get_order', 'set_cart_items'].map(n => ({ name: n + suffix })), callTool, sleep: async () => {} });

describe('Blinkit minimization and normalization', () => {
  it.each([['3 x 35 g x 1', 1], ['35 g x 5', 5], ['200 g x 2', 2], ['1 kg × 3', 3], ['35 g', null], ['2 packs', null], ['x 1.5', null], ['100 g x 0', null], [null, null]])('conservatively parses %s', (value, expected) => expect(packQuantity(value)).toBe(expected));
  it('keeps full details over preview, exact dates, unknown amounts, and neutral nonfood reconciliation', () => {
    const p = normalizePurchase(detail(), at, 'Today, 2:00 pm');
    expect(p.payload.foodItems).toHaveLength(3); expect(p.payload.unknownItems).toHaveLength(1);
    expect(p.payload.reconciliation).toMatchObject({ wholePurchaseTotal: 300, foodLineAmount: 140, excludedLineCount: 2, excludedLineAmount: 150, allLineAmount: null, unallocatedBillAmount: null });
    expect(p.payload.foodItems[1]).toMatchObject({ packQuantity: 1, unitPrice: null, quantityText: '3 x 35 g x 1' });
    expect(p.payload.purchasedAt).toBeNull(); expect(p.payload.placedText).toBe('placed today, 2:00 PM'); expect(p.provenance.capturedAt).toBe(at);
    const serialized = JSON.stringify(p); for (const secret of ['Keyboard', 'Trimmer', 'PAYMENT', 'ADDRESS', 'userId', 'addressLabel', 'paymentMode']) expect(serialized).not.toContain(secret);
    expect(normalizePurchase(projectDetail(detail()), later, 'Today, 2:00 pm').fingerprint).toBe(p.fingerprint);
  });
  it('does not classify personal-care food words as food or invent confident classification', () => {
    for (const name of ['Lemon Dishwash Gel', 'Coconut Hair Oil', 'Milk Soap', 'Salt Lamp', 'Pet Food', 'Vitamin Tablets']) expect(classify(name).kind).toBe('nonfood');
    for (const name of ['Mystery Botanical Blend', 'Cream', 'Oil', 'Water', 'Orange Blossom']) {
      expect(classify(name).kind).toBe('unknown');
    }
  });
  it('keeps signed refund facts and sanitizes arbitrary bill labels and display blobs', () => {
    const d = detail(); d.contents.bill.lines.push({ label: 'Refund', amount: -40, text: '-₹40' }, { label: 'SYNTHETIC-ADDRESS-PRIVATE', amount: 0, text: 'SYNTHETIC-PAYMENT-PRIVATE' });
    const p = normalizePurchase(d, at); expect(p.payload.bill.lines.at(-2)).toEqual({ label: 'Refund', amount: -40, text: '-₹40' });
    expect(p.payload.bill.lines.at(-1)).toEqual({ label: 'Other bill line', amount: 0, text: null });
  });
});

describe('deployed MCP purchase transactions', () => {
  it('runs deployment acceptance with real tool handlers without creating synthetic owner data', async () => {
    const t = await fixture(), before = structuredClone(t.db.rows);
    // @ts-ignore The workflow imports this same JavaScript verifier.
    const { verifyBlinkitHost } = await import('../scripts/verify-blinkit-host.mjs');
    await verifyBlinkitHost({ listTools: () => t.client.listTools(), callTool: (args: any) => args.name === 'pti_app_context'
      ? Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(appCatalog('owner').find(a => a.id === 'food')) }] }) : t.client.callTool(args) });
    expect(t.db.rows).toEqual(before);
  });
  it('denies all cross-account tools, pause and generic writes before modifying state', async () => {
    const t = await fixture();
    for (const [name, args] of [['food_blinkit_context', {}], ['food_blinkit_ingest', { detail: detail(), capturedAt: at }], ['food_blinkit_sync', { action: 'start', runId: 'test' }]] as const)
      expect((await t.raw(name, { ...args, uid: 'another-owner' })).isError).toBe(true);
    t.db.rows.set(root, { ingestionPaused: true, orderCount: 97 });
    await expect(t.ingest()).rejects.toThrow('paused'); await expect(t.sync({ action: 'start', runId: 'test' })).rejects.toThrow('paused');
    expect((await t.context()).ingestionPaused).toBe(true); expect(t.db.rows.size).toBe(1);
    for (const path of ['purchases/test', 'purchases/test/revisions/1', 'purchaseSyncRuns/test', 'purchaseSyncState/blinkit']) expect(() => assertWritablePath(`${root}/${path}`, 'document', 'owner')).toThrow('specialized');
    expect(assertWritablePath(`${root}/orders/zomato-test`, 'document', 'owner')).toContain('/orders/');
  });
  it('counts once under concurrent replay, guards changed revisions, retains refund provenance, never changes restaurant state', async () => {
    const t = await fixture(), workspace = structuredClone(t.db.rows.get(root));
    const results = await Promise.all(Array.from({ length: 4 }, () => t.ingest()));
    expect(results.filter(r => !r.duplicate)).toHaveLength(1); const saved = results[0];
    expect(t.db.rows.get(root + '/purchaseSyncState/blinkit')).toMatchObject({ purchaseCount: 1, revisionCount: 1, statusCounts: { delivered: 1 } });
    const d = detail(); d.phase = { kind: 'finished', status: 'cancelled' }; d.contents.bill.lines.push({ label: 'Refund', amount: -300, text: '-₹300' });
    const before = structuredClone(t.db.rows);
    await expect(t.ingest({ detail: d, capturedAt: later })).rejects.toThrow('conflict'); expect(t.db.rows).toEqual(before);
    await expect(t.ingest({ detail: d, capturedAt: at, expectedRevision: 1 })).rejects.toThrow('later capture');
    const updated = await t.ingest({ detail: d, capturedAt: later, expectedRevision: 1 }); expect(updated.revision).toBe(2);
    await expect(t.ingest({ detail: detail(), capturedAt: '2026-10-03T12:00:00Z', expectedRevision: 1 })).rejects.toThrow('conflict');
    expect(t.db.rows.get(root + '/purchaseSyncState/blinkit')).toMatchObject({ purchaseCount: 1, revisionCount: 2, statusCounts: { delivered: 0, cancelled: 1 } });
    const ctx = await t.context({ purchaseId: saved.purchaseId }); expect(ctx.revisions.map((r: any) => r.revision)).toEqual([2, 1]);
    expect(ctx.revisions[0].previousFingerprint).toBe(saved.fingerprint); expect(ctx.revisions[0].bill.lines.at(-1).amount).toBe(-300);
    expect(t.db.rows.get(root)).toEqual(workspace); expect([...t.db.rows.keys()].some(k => /\/(orders|dishes|restaurants|learning|feedback|sessions)\//.test(k))).toBe(false);
    const serialized = JSON.stringify([...t.db.rows]); for (const secret of ['Keyboard', 'Trimmer', 'PAYMENT', 'ADDRESS', 'session', 'userId']) expect(serialized).not.toContain(secret);
  });
  it('supports product paging and preserves cancelled, delivery_failed, live and unknown context', async () => {
    const t = await fixture();
    for (const [i, phase] of [{ kind: 'finished', status: 'cancelled' }, { kind: 'finished', status: 'delivery_failed' }, { kind: 'live', status: 'packing' }, { kind: 'unknown', status: null }].entries())
      await t.ingest({ detail: detail(`synthetic-row-${i}`, { phase }) });
    const first = await t.context({ limit: 2, product: 'popcorn' }); expect(first.products).toHaveLength(2); expect(first.window.nextAfter).toBeTruthy();
    const second = await t.context({ limit: 2, after: first.window.nextAfter, product: 'not in any basket' }); expect(second.products).toEqual([]); expect(second.window).toMatchObject({ scanned: 2, complete: true });
    const queue = await t.context({ scope: 'reconciliation' }); expect(queue.purchases).toHaveLength(2);
    expect(queue.state.statusCounts).toMatchObject({ cancelled: 1, delivery_failed: 1, live: 1, unknown: 1 });
    await expect(t.ingest({ capturedAt: '2099-01-01T00:00:00Z' })).rejects.toThrow('future');
  });
  it('deduplicates the stable reference when an opaque row token changes, and reconciles live status under the guard', async () => {
    const t = await fixture(), first = detail('synthetic-old-token', { phase: { kind: 'live', status: 'packing' } });
    const saved = await t.ingest({ detail: first });
    const fresh = detail('synthetic-fresh-token'); fresh.contents.reference = first.contents.reference;
    await expect(t.ingest({ detail: fresh, capturedAt: later })).rejects.toThrow('conflict');
    const updated = await t.ingest({ detail: fresh, capturedAt: later, expectedRevision: saved.revision });
    expect(updated.purchaseId).toBe(saved.purchaseId); expect(updated.needsReconciliation).toBe(false);
    expect((await t.context()).state).toMatchObject({ purchaseCount: 1, revisionCount: 2, statusCounts: { live: 0, delivered: 1 } });
    expect((await t.context({ scope: 'reconciliation' })).purchases).toEqual([]);
  });
  it('keeps an already staged checkpoint safe when the owner pauses midway through a batch', async () => {
    const t = await fixture(); await t.sync({ action: 'start', runId: 'synthetic-run' });
    await step(t, 'page', { page: page() });
    t.db.rows.set(root, { ...t.db.rows.get(root), ingestionPaused: true });
    const before = structuredClone(t.db.rows);
    await expect(t.ingest({ runId: 'synthetic-run' })).rejects.toThrow('paused');
    await expect(step(t, 'fail', { order: 'synthetic-row-1', errorCode: 'transient' })).rejects.toThrow('paused');
    expect(t.db.rows).toEqual(before); expect((await t.context({ runId: 'synthetic-run' })).run.pending).toHaveLength(1);
  });
  it('retains page context until every detail is persisted, rejects cursor cycles and premature completion', async () => {
    const t = await fixture(); await t.sync({ action: 'start', runId: 'synthetic-run' });
    await expect(step(t, 'finish')).rejects.toThrow('Cannot finish');
    await expect(step(t, 'page', { page: page([row()], null, null, { truncated: true }) })).rejects.toThrow('Incomplete');
    await expect(step(t, 'page', { page: page([row()], null, null, { unreadableRows: 1 }) })).rejects.toThrow('Incomplete');
    await step(t, 'page', { page: page([row(), row()], null, 'opaque +/=cursor') });
    const pending = (await t.context({ runId: 'synthetic-run' })).run; expect(pending.pending).toHaveLength(1); expect(pending.repeatedRows).toBe(1);
    await expect(t.sync({ action: 'block', runId: 'synthetic-run', expectedRevision: 1, errorCode: 'transient' })).rejects.toThrow('revision');
    await expect(step(t, 'page', { page: page([], 'opaque +/=cursor', null) })).rejects.toThrow('pending');
    await step(t, 'fail', { order: 'synthetic-row-1', errorCode: 'not_answered' });
    expect((await t.context({ runId: 'synthetic-run' })).run.pending[0]).toMatchObject({ attempts: 1, lastError: 'not_answered', placedText: 'Today, 2:00 pm' });
    await t.ingest({ runId: 'synthetic-run', listPlacedText: 'Today, 2:00 pm' });
    expect((await t.context({ runId: 'synthetic-run' })).run.cursor).toBe('opaque +/=cursor');
    await expect(step(t, 'page', { page: page([], 'opaque +/=cursor', 'opaque +/=cursor') })).rejects.toThrow('repeated_cursor');
    await step(t, 'page', { page: page([], 'opaque +/=cursor', 'cycle-next') });
    await expect(step(t, 'page', { page: page([], 'cycle-next', 'opaque +/=cursor') })).rejects.toThrow('repeated_cursor');
    await step(t, 'page', { page: page([], 'cycle-next', null) });
    const finished = await step(t, 'finish'); expect(finished.run.status).toBe('complete'); expect(finished.run.verifiedRows).toBe(1);
  });
  it('does not call a historical scan complete while live/unknown or unlisted live work remains', async () => {
    const t = await fixture(); await t.sync({ action: 'start', runId: 'synthetic-run' });
    await step(t, 'page', { page: page([row()], null, null, { live: [row('synthetic-live', { phase: { kind: 'live', status: 'packing' } })], unlistedLiveOrders: 1 }) });
    await t.ingest({ runId: 'synthetic-run', listPlacedText: 'Today, 2:00 pm' });
    await t.ingest({ runId: 'synthetic-run', detail: detail('synthetic-live', { phase: { kind: 'live', status: 'packing' } }), listPlacedText: 'Today, 2:00 pm' });
    const finished = await step(t, 'finish'); expect(finished.run).toMatchObject({ historyComplete: true, status: 'history_complete_reconciliation_pending', unlistedLiveOrders: 1 });
  });
});

describe('our read-only WebMCP adapter and durable coordinator', () => {
  it('never detail-reads explicit scope exclusions and records honest food-only coverage',async()=>{
    const t=await fixture(),calls:any[]=[];
    const r=reader(async(name:string,args:any)=>{
      calls.push([name,args]);if(name.startsWith('get_session'))return envelope({});
      if(name.startsWith('list_orders'))return envelope(page([row(),row('synthetic-excluded-a',{itemNames:['SYNTHETIC PRIVATE PERSONAL PRODUCT']}),row('synthetic-excluded-b')]));
      expect(args.order).toBe('synthetic-row-1');return envelope(detail(args.order));
    });
    const explicit=new Set(['synthetic-excluded-a','synthetic-excluded-b']);
    const result=await syncBlinkitBatch({reader:r,persistence:t.persistence,runId:'food-scope-run',now:()=>at,
      scopePolicy:(r:any)=>explicit.has(r.order)?{reason:'nonfood_only_preview',basis:'preview_only'}:null});
    expect(result.complete).toBe(true);expect(result.run).toMatchObject({allOrderDetailsKnown:false,verifiedRows:1,excludedRows:2,coverage:{scanned:3,persisted:1,outsideScope:2,unresolved:0,previewOnlyExclusions:2}});
    expect(calls.filter(([n])=>n.startsWith('get_order'))).toHaveLength(1);
    const ctx=await t.context({runId:'food-scope-run'});expect(ctx.state.purchaseCount).toBe(1);expect(ctx.scopeExclusions).toHaveLength(2);
    expect(ctx.scopeExclusions.every((r:any)=>r.detailRead===false&&r.foodContentsKnown===false&&!('reference'in r))).toBe(true);
    expect(JSON.stringify([...t.db.rows])).not.toContain('SYNTHETIC PRIVATE PERSONAL PRODUCT');
    await expect(t.ingest({runId:'food-scope-run',detail:detail('synthetic-excluded-a')})).rejects.toThrow('outside food scope');
  });
  it('does not exclude a previously persisted token or an unstaged token and never guesses from absent food words',async()=>{
    const t=await fixture();await t.sync({action:'start',runId:'synthetic-run'});await step(t,'page',{page:page()});
    const before=structuredClone(t.db.rows);
    await expect(step(t,'exclude',{exclusions:[{order:'not-listed',reason:'outside_food_scope',basis:'explicit_verified_scope'}]})).rejects.toThrow('unresolved');expect(t.db.rows).toEqual(before);
    await t.ingest({runId:'synthetic-run'});
    await expect(step(t,'exclude',{exclusions:[{order:'synthetic-row-1',reason:'outside_food_scope',basis:'explicit_verified_scope'}]})).rejects.toThrow('unresolved');
    let reads=0;const r=reader(async(name:string,args:any)=>name.startsWith('get_session')?envelope({}):name.startsWith('list_orders')?envelope(page([row('synthetic-unknown',{itemNames:[]})])):(reads++,envelope(detail(args.order))));
    expect((await syncBlinkitBatch({reader:r,persistence:t.persistence,runId:'no-guess-run',now:()=>at})).complete).toBe(true);expect(reads).toBe(1);
  });
  it('discovers fresh suffixed names, decodes JSON-string MCP envelopes and refuses ambiguity or anonymous login', async () => {
    expect(decodeEnvelope(envelope({ value: 1 })).result.value).toBe(1);
    expect(decodeEnvelope({ content: [{ type: 'text', text: envelope({ value: 2 }) }] }).result.value).toBe(2);
    expect(() => decodeEnvelope('not JSON')).toThrow('invalid_envelope');
    expect(() => discoverReadTools(['get_session__a', 'get_session__b', 'list_orders__a', 'get_order__a'])).toThrow('discovery');
    const seen: string[] = [];
    const r = reader(async (name: string) => { seen.push(name); return envelope({}); }); await r.open(); expect(seen).toEqual(['get_session__synthetic_uuid_1']);
    await expect(reader(async () => envelope({}, { login: { kind: 'anonymous' } })).open()).rejects.toThrow('needs_login');
    expect(seen.every(n => !/cart|address|otp|payment/.test(n))).toBe(true);
  });
  it('paginates limit10 with opaque cursors unchanged, retries truncated and unavailable once, imports details beyond preview, and replays safely', async () => {
    const t = await fixture(), calls: any[] = []; let listReads = 0, detailReads = 0;
    const r = reader(async (name: string, args: any) => {
      calls.push([name, args]); if (name.startsWith('get_session')) return envelope({});
      if (name.startsWith('list_orders')) { listReads++; if (listReads === 1) return envelope({ ...page(), truncated: true, nextCursor: undefined });
        return envelope(args.cursor ? page([row('synthetic-row-2')], args.cursor, null) : page([row()], null, 'opaque +/=cursor')); }
      detailReads++; if (detailReads === 1) return envelope({ order: args.order, contents: { kind: 'unavailable', reason: 'not_answered' } });
      return envelope(detail(args.order));
    });
    const result = await syncBlinkitBatch({ reader: r, persistence: t.persistence, runId: 'synthetic-run', now: () => at });
    expect(result).toMatchObject({ historyComplete: true, complete: true, pages: 2, details: 2 }); expect(detailReads).toBe(3);
    expect(calls.filter(([name]) => name.startsWith('list_orders')).map(([, args]) => args)).toEqual([{ limit: 10 }, { limit: 10 }, { limit: 10, cursor: 'opaque +/=cursor' }]);
    expect((await t.context()).state.purchaseCount).toBe(2); expect((await t.context()).purchases[0].foodItems).toHaveLength(3);
    await syncBlinkitBatch({ reader: r, persistence: t.persistence, runId: 'synthetic-replay', now: () => later });
    expect((await t.context()).state).toMatchObject({ purchaseCount: 2, revisionCount: 2 });
  });
  it('keeps failed details pending and resumes after interruption without rescanning or skipping rows', async () => {
    const t = await fixture(); let fail = true, lists = 0, detailCalls = 0;
    const makeReader = () => reader(async (name: string, args: any) => {
      if (name.startsWith('get_session')) return envelope({});
      if (name.startsWith('list_orders')) { lists++; return envelope(page([row(), row('synthetic-row-2')])); }
      detailCalls++; return fail && args.order === 'synthetic-row-2' ? envelope({ order: args.order, contents: { kind: 'unavailable' } }) : envelope(detail(args.order));
    }, '__fresh_each_turn');
    const first = await syncBlinkitBatch({ reader: makeReader(), persistence: t.persistence, runId: 'synthetic-run', now: () => at });
    expect(first.run).toMatchObject({ historyComplete: false, verifiedRows: 1, status: 'partial' }); expect(first.run.pending[0].order).toBe('synthetic-row-2');
    expect(detailCalls).toBe(3); expect((await t.context()).state.purchaseCount).toBe(1);
    fail = false;
    const resumed = await syncBlinkitBatch({ reader: makeReader(), persistence: t.persistence, runId: 'synthetic-run', now: () => later });
    expect(resumed.complete).toBe(true); expect(lists).toBe(1); expect((await t.context()).state.purchaseCount).toBe(2);
  });
  it('recovers a lost ingest response from durable state, and checkpoints bounded batches', async () => {
    const t = await fixture(); let lists = 0, lost = true;
    const r = reader(async (name: string, args: any) => name.startsWith('get_session') ? envelope({}) : name.startsWith('list_orders')
      ? (lists++, envelope(lists === 1 ? page([row()], null, 'next') : page([row('synthetic-row-2')], 'next', null))) : envelope(detail(args.order)));
    const persistence = { ...t.persistence, ingest: async (args: any) => { const result = await t.ingest(args); if (lost) { lost = false; throw new Error('synthetic lost response'); } return result; } };
    const first = await syncBlinkitBatch({ reader: r, persistence, runId: 'synthetic-run', maxDetails: 1, now: () => at });
    expect(first.run).toMatchObject({ cursor: 'next', pending: [], verifiedRows: 1, historyComplete: false });
    const next = await syncBlinkitBatch({ reader: r, persistence, runId: 'synthetic-run', now: () => later }); expect(next.complete).toBe(true); expect((await t.context()).state.purchaseCount).toBe(2);
  });
  it('does not finish on repeated/truncated/unreadable pages and retries only once on transient errors', async () => {
    const t = await fixture(); let tries = 0;
    const r = reader(async (name: string) => name.startsWith('get_session') ? envelope({}) : (tries++, envelope({ ...page(), truncated: true })));
    const result = await syncBlinkitBatch({ reader: r, persistence: t.persistence, runId: 'truncated-run' });
    expect(result.run).toMatchObject({ cursor: null, historyComplete: false, lastError: 'truncated' }); expect(tries).toBe(2);
    const repeated = reader(async (name: string, args: any) => name.startsWith('get_session') ? envelope({}) : envelope(page([], args.cursor || null, 'same')));
    const cycle = await syncBlinkitBatch({ reader: repeated, persistence: t.persistence, runId: 'cycle-run' }); expect(cycle.run).toMatchObject({ status: 'blocked', historyComplete: false, lastError: 'repeated_cursor' });
    const unreadable = reader(async () => envelope(page([], null, null, { unreadableRows: 1 })));
    const gap = await syncBlinkitBatch({ reader: unreadable, persistence: t.persistence, runId: 'gap-run' }); expect(gap.run.lastError).toBe('unreadable_rows');
    let attempts = 0, waited = 0;
    const limited = createBlinkitReader({ discoverTools: async () => ['get_session', 'list_orders', 'get_order'], sleep: async (ms: number) => { waited += ms; },
      callTool: async () => { attempts++; return JSON.stringify({ structuredContent: { ok: false, error: { code: 'rate_limited', retryAfterMs: 10, Recovery: 'SYNTHETIC PRIVATE TEXT' } } }); } });
    await expect(limited.open()).rejects.toThrow('rate_limited'); expect(attempts).toBe(2); expect(waited).toBe(10);
  });
});

describe('Morsel protected page transport',()=>{
  async function httpFixture(){
    const t=await fixture();let allowed=true,verified=0;
    const app=express();app.use('/morsel/blinkit',morselBlinkitRouter({
      verifyIdentity:async(token:string)=>{verified++;if(token!=='synthetic-owner')throw Error('invalid');return {uid:'owner',email:'owner@example.invalid',authenticatedAt:1};},
      checkUser:async()=>{if(!allowed)throw Error('revoked');},
      createServer:({uid}:any)=>{const s=new McpServer({name:'synthetic-page-test',version:'1'});registerBlinkitTools(s,t.db as any,uid);return s;},
    }));
    const listener=app.listen(0,'127.0.0.1');await new Promise<void>(r=>listener.on('listening',r));cleanups.push(()=>new Promise<void>(r=>listener.close(()=>r())));
    const url='http://127.0.0.1:'+(listener.address()as any).port+'/morsel/blinkit';
    const post=(body:any,headers:any={})=>fetch(url,{method:'POST',headers:{Origin:MORSEL_ORIGIN,Authorization:'Bearer synthetic-owner','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
    return {...t,url,post,revoke:()=>{allowed=false;},verified:()=>verified};
  }
  it('denies unsigned, fake-origin, revoked and account-injection requests without writes',async()=>{
    const t=await httpFixture();const before=structuredClone(t.db.rows);
    expect((await t.post({action:'context'},{Origin:'https://fake.example'})).status).toBe(403);expect(t.verified()).toBe(0);
    expect((await t.post({action:'context'},{Authorization:''})).status).toBe(401);
    expect((await t.post({action:'context'},{Authorization:'Bearer expired'})).status).toBe(403);
    expect((await t.post({action:'context',args:{uid:'another-owner'}})).status).toBe(400);
    expect((await t.post({action:'ingest',args:{records:Array(11).fill({})}})).status).toBe(400);
    expect((await t.post({action:'ingest',args:{records:[{uid:'another-owner'}]}})).status).toBe(400);
    expect((await t.post({action:'context',args:{large:'x'.repeat(270000)}})).status).toBe(413);
    t.revoke();expect((await t.post({action:'context'})).status).toBe(403);expect(t.db.rows).toEqual(before);
  });
  it('uses canonical tools for bounded bulk replay, context and pause, with strict CORS',async()=>{
    const t=await httpFixture();
    const preflight=await fetch(t.url,{method:'OPTIONS',headers:{Origin:MORSEL_ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization, content-type'}});expect(preflight.status).toBe(204);expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(MORSEL_ORIGIN);expect(preflight.headers.has('Access-Control-Allow-Credentials')).toBe(false);
    expect((await fetch(t.url,{method:'OPTIONS',headers:{Origin:MORSEL_ORIGIN,'Access-Control-Request-Method':'DELETE'}})).status).toBe(403);
    const cap=await (await t.post({action:'capabilities'})).json();expect(cap.tools).toHaveLength(3);expect(cap.tools.every((x:any)=>!x.inputSchema.properties.uid)).toBe(true);
    const args={records:[{detail:detail(),capturedAt:at},{detail:detail('synthetic-page-two'),capturedAt:at}]};
    const first=await(await t.post({action:'ingest',args})).json();expect(first).toMatchObject({ok:true,processed:2});
    const replay=await(await t.post({action:'ingest',args})).json();expect(replay.results.every((r:any)=>r.duplicate)).toBe(true);
    const context=await(await t.post({action:'context',args:{limit:2}})).json();expect(context.state.purchaseCount).toBe(2);expect(context.products).toHaveLength(8);
    t.db.rows.set(root,{ingestionPaused:true,orderCount:97});
    const paused=await(await t.post({action:'ingest',args})).json();expect(paused.results.every((r:any)=>r.error.code==='ingestion_paused')).toBe(true);expect(t.db.rows.get(root+'/purchaseSyncState/blinkit').purchaseCount).toBe(2);
  });
});
