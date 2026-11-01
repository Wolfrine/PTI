// Our own adapter for Blinkit's first-party page tools. No HTTP endpoints or scraping.
import { createHash } from 'node:crypto';

export const VERSION = 'blinkit-webmcp-v1';
export const hash = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const text = (value, max = 1000) => typeof value === 'string' && value.length <= max ? value : null;
const money = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10000000 ? value : null;
const sum = values => values.every(v => v !== null) ? Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100 : null;
export function phase(value) {
  return { kind: ['live', 'finished', 'unknown'].includes(value?.kind) ? value.kind : 'unknown', status: text(value?.status, 100) };
}
export function statusBucket(value) {
  return value.kind === 'finished' && ['delivered', 'cancelled', 'delivery_failed'].includes(value.status) ? value.status : value.kind === 'live' ? 'live' : 'unknown';
}
export function packQuantity(value) {
  const match = typeof value === 'string' && /\s[x×]\s*(\d+)\s*$/i.exec(value);
  return match && Number(match[1]) > 0 && Number(match[1]) <= 10000 ? Number(match[1]) : null;
}
// Deliberately small name heuristic. Nonfood wins over food words (lemon dishwash).
// Unmatched or ambiguous names stay unknown for owner review, never confident food.
const nonfood = /\b(keyboard|trimmer|shampoo|conditioner|toothpaste|toothbrush|detergent|dishwash\w*|soap|handwash|hand wash|saniti[sz]er|deodorant|perfume|razor|shaving|diaper\w*|sanitary|tampon\w*|menstrual|hair oil|face wash|body wash|face cream|body cream|lotion|skin care|skincare|personal care|household|moisturi[sz]\w*|sunscreen|lip balm|lipstick|makeup|nail polish|comb|hairbrush|cotton pads|cotton buds|cleaner|cleaning|disinfectant|toilet|laundry|fabric softener|bleach|air freshener|room freshener|floor|mop|broom|sponge|scouring|garbage|trash|tissue\w*|napkin\w*|foil|cling film|utensil\w*|cookware|frying pan|pressure cooker|strainer|towel|lamp|battery|batteries|charger|cable|earphone\w*|headphone\w*|pet food|dog food|cat food|incense|mosquito|repellent|medicine|tablet\w*|capsule\w*|supplement\w*)\b/i;
const food = /\b(lemon\w*|popcorn|namkeen|kaju|cashew\w*|peanut\w*|bhujia|milk|paneer|ghee|butter|cheese|yogurt|yoghurt|curd|rice|atta|flour|dal|lentil\w*|bean\w*|chickpea\w*|egg\w*|bread|biscuit\w*|cookie\w*|cereal\w*|oats|muesli|pasta|noodle\w*|chocolate\w*|coffee|tea|juice|soda|drinking water|mineral water|ice cream|chips|nachos|almond\w*|walnut\w*|pistachio\w*|raisin\w*|banana\w*|apple\w*|orange\w*|mango\w*|tomato\w*|potato\w*|onion\w*|carrot\w*|spinach|broccoli|cauliflower|cabbage|cucumber\w*|ginger|garlic|coriander|cumin|turmeric|chilli powder|pepper|salt|sugar|honey|jam|ketchup|sauce|cooking oil|olive oil|sunflower oil|mustard oil|coconut milk|chicken|mutton|fish|prawn\w*)\b/i;
export function classify(name) {
  const ambiguous = /\b(blossom|flower|fragrance|extract|essence)\b/i.test(name);
  const kind = nonfood.test(name) ? 'nonfood' : !ambiguous && food.test(name) ? 'food' : 'unknown';
  return { kind, basis: `product-name heuristic ${VERSION}: ${kind === 'nonfood' ? 'explicit nonfood term' : kind === 'food' ? 'explicit food term; ingredients unverified' : 'no unambiguous supported term; review required'}` };
}

// Allowlist projection: no session, userId, address, payment, raw response or preview names.
export function projectRow(row) {
  if (!text(row?.order, 500)) throw new Error('invalid_order_row');
  return { order: row.order, phase: phase(row.phase), statusText: text(row.statusText), placedText: text(row.placedText) };
}
export function projectPage(result, cursor = null) {
  if (!Array.isArray(result?.orders) || !Array.isArray(result?.live) || typeof result.truncated !== 'boolean') throw new Error('invalid_list_shape');
  if (![result.unreadableRows, result.unlistedLiveOrders].every(v => Number.isInteger(v) && v >= 0)) throw new Error('invalid_list_shape');
  if (!result.truncated && (typeof result.hasMore !== 'boolean' || !(result.nextCursor === null || text(result.nextCursor, 20000)))) throw new Error('invalid_cursor');
  return {
    cursor, orders: result.orders.map(projectRow), live: result.live.map(projectRow),
    hasMore: result.hasMore === true, nextCursor: result.nextCursor ?? null, truncated: result.truncated,
    unreadableRows: Number.isInteger(result.unreadableRows) && result.unreadableRows >= 0 ? result.unreadableRows : 0,
    unlistedLiveOrders: Number.isInteger(result.unlistedLiveOrders) && result.unlistedLiveOrders >= 0 ? result.unlistedLiveOrders : 0,
  };
}
function billLine(line) {
  // Retain financial facts, including refunds, without arbitrary names in bill labels/text.
  const label = text(line?.label, 300);
  const safe = label && /^(?:(?:MRP|product discount|item total|handling charge|delivery charges|bill total|refund|refunded|tax|GST|CGST|SGST|IGST|packaging|tip|coupon|savings|discount|platform fee|round(?:ing)? off|cashback|total|service charge|small cart fee|surge charge|other charge)s?)(?:\s*\([\d.%\s]{1,20}\))?$/i.test(label);
  const display = text(line?.text, 100);
  return { label: safe ? label : 'Other bill line', amount: money(line?.amount), text: display && /^(?:FREE|[+−-]?\s*[₹]?\s*[\d,.]+|(?:Rs\.?|INR)\s*[\d,.]+)$/i.test(display) ? display : null };
}
export function projectDetail(result) {
  if (!text(result?.order, 500)) throw new Error('invalid_detail_shape');
  if (result.contents?.kind !== 'read') throw new Error('contents_unavailable');
  const c = result.contents;
  if (!text(c.reference, 200) || !Array.isArray(c.items) || c.items.length > 200 || !c.bill || !Array.isArray(c.bill.lines) || c.bill.lines.length > 100) throw new Error('incomplete_detail');
  return {
    order: result.order, phase: phase(result.phase), statusText: text(result.statusText), etaText: text(result.etaText),
    refreshAfterMs: Number.isInteger(result.refreshAfterMs) && result.refreshAfterMs >= 0 ? result.refreshAfterMs : null,
    contents: { kind: 'read', reference: c.reference, placedText: text(c.placedText),
      items: c.items.map(i => {
        if (i?.excludedNonfood === true && i.name === null) return { name: null, quantityText: null, amount: money(i.amount), excludedNonfood: true };
        if (!text(i?.name, 500)) throw new Error('incomplete_item');
        const classification = classify(i.name);
        // Nonfood names are removed even from the request sent to PTI.
        return classification.kind === 'nonfood'
          ? { name: null, quantityText: null, amount: money(i.amount), excludedNonfood: true }
          : { name: i.name, quantityText: text(i.quantityText, 300), amount: money(i.amount), excludedNonfood: false };
      }), bill: { billTotal: money(c.bill.billTotal), lines: c.bill.lines.map(billLine) } },
  };
}

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
    dateBasis: 'Exact first-party display; year/source ISO unknown. capturedAt is observation time, not purchase time.',
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
