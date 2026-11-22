import { createHash } from 'node:crypto';
import { z } from 'zod';

export const FINANCE_OWNER = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
export const FINANCE_EMAIL = 'schttewary@gmail.com';
export const FINANCE_CHECKPOINT = 'pti-finance-v1';
export const FINANCE_START = '2023-11-22';
export const financeRoot = (uid: string) => 'users/' + uid + '/financeData/workspace';
export function financeOwner(uid?: string, email?: string) {
  return uid === FINANCE_OWNER && email?.toLowerCase() === FINANCE_EMAIL;
}

export function fingerprint(...parts: unknown[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
export const stableId = z.string().regex(/^[a-f0-9]{64}$/);
const opaqueId = z.string().regex(/^[A-Za-z0-9_-]{1,96}$/);
const slug = z.string().regex(/^[a-z][a-z0-9_-]{1,47}$/);
const account = z.string().regex(/^[a-z][a-z0-9_-]{1,47}$/).refine(value => !/\d{5}/.test(value));
const rowKey = z.string().regex(/^[a-zA-Z0-9_.:-]{1,96}$/);
export const monthKey = z.string().regex(/^20\d\d-(0[1-9]|1[0-2])$/);
const day = z.iso.date().refine(value => monthKey.safeParse(value.slice(0, 7)).success);
const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
const window = z.object({ from: day, to: day }).strict().refine(value => value.from <= value.to);
const paisa = z.number().int().positive().max(100_000_000_000_000);
const stockPaisa = z.number().int().min(-100_000_000_000_000).max(100_000_000_000_000);
// This channel accepts short sanitized labels, not notes, mail text or identifiers.
const label = z.string().trim().min(1).max(100).refine(value => !/[\p{Cc}\p{Cf}@<>]|\d{5}|https?:/iu.test(value));
export const category = z.enum(['uncategorized', 'groceries', 'dining', 'transport', 'housing', 'utilities', 'shopping', 'health', 'entertainment', 'travel', 'education', 'subscriptions', 'fees', 'tax', 'gifts', 'other']);
export const kind = z.enum(['earned_income', 'spend', 'refund', 'card_settlement', 'reimbursement', 'internal_transfer', 'investment_contribution', 'investment_withdrawal', 'loan_draw', 'loan_repayment', 'fee', 'interest', 'unknown']);
export const status = z.enum(['posted', 'pending', 'review', 'excluded']);
export const direction = z.enum(['credit', 'debit']);
const stockKind = z.enum(['cash', 'debt', 'investment']);
export const sourceType = z.enum(['bank_alert', 'bank_statement', 'card_alert', 'card_statement', 'merchant_receipt', 'investment_statement', 'mandate', 'other']);
const coverage = z.enum(['observed', 'partial', 'locked', 'unparsed', 'excluded']);
const sourceDateFields = { source: slug, sourceType, receivedAt: instant };
const referenceNamespace = z.string().regex(/^(upi|neft|imps|rtgs|[a-z][a-z0-9_-]{1,36}-(rrn|txn|order|payment))$/);
const reference = z.object({
  namespace: referenceNamespace,
  value: z.string().regex(/^[A-Za-z0-9_-]{6,48}$/),
}).strict();
const entry = z.object({
  rowKey, occurredOn: day, amountPaisa: paisa, direction, kind, status: status.optional(),
  category: category.optional(), merchant: label.optional(), account: account.optional(),
  accountKind: stockKind.optional(), references: z.array(reference).max(4).default([]),
}).strict();
const stock = z.object({
  account, kind: stockKind, amountPaisa: stockPaisa, asOf: day,
  basis: z.enum(['closing_balance', 'available_balance', 'amount_due', 'outstanding_principal', 'market_value']).optional(),
}).strict();
export const ingestInput = z.object({
  ...sourceDateFields, messageId: opaqueId, parserVersion: slug,
  ownerScope: z.enum(['confirmed', 'uncertain', 'excluded']),
  edition: z.number().int().positive().max(100).default(1),
  part: z.number().int().positive().max(200).default(1),
  finalPart: z.boolean().default(true),
  period: window.optional(), coverage,
  entries: z.array(entry).max(20).default([]),
  balances: z.array(stock).max(10).default([]),
}).strict();
export const correctionInput = z.object({
  requestId: opaqueId, eventId: stableId, expectedRevision: z.number().int().positive(),
  kind: kind.optional(), category: category.optional(), status: z.enum(['posted', 'excluded']).optional(),
  duplicateOf: stableId.optional(), reason: label,
}).strict().refine(value => value.kind || value.category || value.status || value.duplicateOf);
export const contextInput = z.object({
  month: monthKey.optional(),
  section: z.enum(['overview', 'transactions', 'reviews', 'sources', 'source_windows', 'balances', 'recurring', 'operations']).default('overview'),
  limit: z.number().int().min(1).max(60).default(20),
  after: opaqueId.optional(),
  messageId: opaqueId.optional(),
}).strict();
export const scanInput = z.object({
  runId: opaqueId, window, mode: z.enum(['backfill', 'daily']),
  status: z.enum(['complete', 'partial', 'failed']),
  expectedCursor: day.nullable().optional(),
  nextCursor: day.optional(),
  processed: z.number().int().nonnegative().max(10000),
  locked: z.number().int().nonnegative().max(10000),
  unparsed: z.number().int().nonnegative().max(10000),
  excluded: z.number().int().nonnegative().max(10000),
  reason: z.enum(['connector_error', 'time_limit', 'page_limit', 'attachment_unavailable', 'scope_uncertain', 'other']).optional(),
}).strict();

export type IngestInput = z.output<typeof ingestInput>;
export type Entry = IngestInput['entries'][number];
export type Stock = IngestInput['balances'][number];
export type SourceType = IngestInput['sourceType'];
export type Coverage = IngestInput['coverage'];
export type CorrectionInput = z.output<typeof correctionInput>;
export type ContextInput = z.output<typeof contextInput>;
export type ScanInput = z.output<typeof scanInput>;

export class FinanceError extends Error {
  constructor(public readonly code: 'invalid_request' | 'revision_conflict' | 'not_found' | 'reconciliation_limit' | 'intake_in_progress') { super(code); }
}
export function indiaDate(instant: string) {
  return new Date(Date.parse(instant) + 330 * 60 * 1000).toISOString().slice(0, 10);
}
export function monthsBetween(from: string, to: string) {
  const months: string[] = [];
  const date = new Date(from.slice(0, 7) + '-01T00:00:00Z');
  while (date.toISOString().slice(0, 7) <= to.slice(0, 7)) {
    if (months.length === 13) throw new FinanceError('invalid_request');
    months.push(date.toISOString().slice(0, 7));
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return months;
}

export function compatibleDirection(kind: Entry['kind'], direction: Entry['direction']) {
  if (['earned_income', 'refund', 'reimbursement', 'investment_withdrawal', 'loan_draw', 'interest'].includes(kind)) return direction === 'credit';
  if (['spend', 'investment_contribution', 'loan_repayment', 'fee'].includes(kind)) return direction === 'debit';
  return true; // Transfers and card settlements may report either side.
}
export function isLoanKind(kind: Entry['kind']) {
  return kind === 'loan_draw' || kind === 'loan_repayment';
}
export function validateIngest(input: IngestInput) {
  const today = indiaDate(new Date().toISOString());
  const hasData = input.entries.length > 0 || input.balances.length > 0;
  if ((input.ownerScope !== 'confirmed' && (hasData || input.coverage !== 'excluded')) ||
      (hasData && ['locked', 'unparsed', 'excluded'].includes(input.coverage)) ||
      (['locked', 'unparsed', 'excluded'].includes(input.coverage) && (!input.finalPart || input.part !== 1)) ||
      new Set(input.entries.map(row => row.rowKey)).size !== input.entries.length) throw new FinanceError('invalid_request');
  if (input.period) monthsBetween(input.period.from, input.period.to);
  for (const row of input.entries) {
    if (!compatibleDirection(row.kind, row.direction) || row.occurredOn < FINANCE_START ||
        (row.occurredOn > today && row.status !== 'pending' && input.sourceType !== 'mandate') ||
        (isLoanKind(row.kind) && (!row.account || !input.sourceType.startsWith('bank_'))) ||
        (input.period && (row.occurredOn < input.period.from || row.occurredOn > input.period.to))) throw new FinanceError('invalid_request');
    if (row.accountKind && (!row.account ||
        (input.sourceType.startsWith('bank_') && row.accountKind !== 'cash') ||
        (input.sourceType.startsWith('card_') && row.accountKind !== 'debt') ||
        (input.sourceType === 'investment_statement' && row.accountKind !== 'investment'))) throw new FinanceError('invalid_request');
  }
  if (input.balances.some(value =>
    value.asOf < FINANCE_START || value.asOf > today ||
    (input.sourceType === 'bank_alert' && value.basis !== 'available_balance') ||
    (value.kind === 'cash' && value.basis && !['closing_balance', 'available_balance'].includes(value.basis)) ||
    (value.kind === 'debt' && (input.sourceType === 'bank_statement'
      ? value.basis !== 'outstanding_principal' : value.basis && value.basis !== 'amount_due')) ||
    (value.kind === 'investment' && value.basis && value.basis !== 'market_value') ||
    (value.kind === 'cash' && !['bank_alert', 'bank_statement'].includes(input.sourceType)) ||
    (value.kind === 'debt' && !['bank_statement', 'card_statement'].includes(input.sourceType)) ||
    (value.kind === 'investment' && input.sourceType !== 'investment_statement') ||
    (input.period && (value.asOf < input.period.from || value.asOf > input.period.to)))) throw new FinanceError('invalid_request');
}