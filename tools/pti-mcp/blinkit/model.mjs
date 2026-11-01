// Our own adapter for Blinkit's first-party page tools. No HTTP endpoints or scraping.
import { createHash } from 'node:crypto';


export const hash = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
import {VERSION,sum,statusBucket,packQuantity,classify,projectDetail} from './projection.mjs';
export * from './projection.mjs';

export function normalizePurchase(detail, capturedAt, listPlacedText = null) {
  // Called by the server even if a caller bypasses our adapter. Classification is server-owned.
  const d = projectDetail(detail), foodItems = [], unknownItems = [], excluded = [];
  for (const line of d.contents.items) {
    if (line.excludedNonfood) { excluded.push(line.amount); continue; }
    const classification = classify(line.name);
    const item = { name: line.name, quantityText: line.quantityText, packQuantity: packQuantity(line.quantityText), unitPrice: null, amount: line.amount, classification };
    (classification.kind === 'food' ? foodItems : unknownItems).push(item);
  }
  const total = d.contents.bill.billTotal, lineTotal = sum(d.contents.items.map(i => i.amount));
  const payload = {
    provider: 'blinkit', reference: d.contents.reference, orderToken: d.order, phase: d.phase,
    statusText: d.statusText, etaText: d.etaText, refreshAfterMs: d.refreshAfterMs,
    placedText: d.contents.placedText, listPlacedText, purchasedAt: null,
    dateBasis: 'Exact first-party display; no verified source ISO purchase time. capturedAt is observation time, not purchase time.',
    foodItems, unknownItems, currency: 'INR', bill: d.contents.bill,
    reconciliation: { wholePurchaseTotal: total, foodLineAmount: sum(foodItems.map(i => i.amount)),
      excludedLineCount: excluded.length, excludedLineAmount: sum(excluded), unknownLineCount: unknownItems.length,
      unknownLineAmount: sum(unknownItems.map(i => i.amount)), allLineAmount: lineTotal,
      unallocatedBillAmount: total !== null && lineTotal !== null ? Math.round((total - lineTotal) * 100) / 100 : null,
      basis: 'Line amounts and whole bill only; charges, discounts and refunds are not allocated to food. Not food spend.' },
  };
  return {
    id: `blinkit-${hash(d.contents.reference).slice(0, 40)}`, payload, fingerprint: hash(canonical(payload)), capturedAt,
    provenance: { interface: 'first-party-page-webmcp', sourceUrl: 'https://blinkit.com/', instructionsUrl: 'https://blinkit.com/llms.txt',
      tools: ['list_orders', 'get_order'], normalizer: VERSION, capturedAt },
    needsReconciliation: ['live', 'unknown'].includes(statusBucket(d.phase)),
  };
}
