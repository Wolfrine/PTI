import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { category, FinanceError, fingerprint, monthKey, sourceType, stableId } from './finance-contract.js';
import { aggregateFingerprint, type LedgerEvent, type Monthly } from './finance-projection.js';

const version = z.number().int().positive();
const analysisSourceInput = z.object({
  month: monthKey, ledgerVersion: version, reportVersion: version, reportId: stableId, sourceDigest: stableId,
}).strict();
const findingInput = z.discriminatedUnion('code', [
  z.object({ code: z.literal('income') }).strict(),
  z.object({ code: z.literal('spending') }).strict(),
  z.object({ code: z.literal('cashflow') }).strict(),
  z.object({ code: z.literal('financing') }).strict(),
  z.object({ code: z.literal('investments') }).strict(),
  z.object({ code: z.literal('category_share'), category }).strict(),
  z.object({ code: z.literal('spend_group'), eventIds: z.array(stableId).min(2).max(8)
    .describe('Distinct same-month posted expense or fee IDs from finance_context transactions.') }).strict(),
]);
export const publishMonthlyAnalysisInput = z.object({
  source: analysisSourceInput.describe('Exact analysisSource returned by finance_reconcile_month.'),
  findings: z.array(findingInput).min(1).max(8).describe('Choose relevant figures and cite up to 12 distinct event IDs across findings.'),
  sourceWindowIds: z.array(stableId).max(8).default([])
    .describe('Optional opaque IDs from finance_context source_windows for this month.'),
}).strict();

type AnalysisSource = z.output<typeof analysisSourceInput>;
type FindingInput = z.output<typeof findingInput>;
type PublishInput = z.output<typeof publishMonthlyAnalysisInput>;
type EventRevision = { eventId: string; revision: number };
type SpendEvidence = EventRevision & { amountPaisa: number };
type Finding = {
  code: FindingInput['code']; text: string; figures: Record<string, number | null>;
  category?: z.output<typeof category>; eventIds?: string[]; eventRevisions?: EventRevision[];
};
type Gap = { code: string; count: number | null; text: string };
type Coverage = {
  status: 'observed' | 'partial' | 'unknown'; inputCount: number | null;
  readableInputCount: number | null; completeness: 'unknown'; gaps: Gap[];
};
type SourceWindow = {
  id: string; sourceType: z.output<typeof sourceType>; status: z.output<typeof windowStatus>;
  period: z.output<typeof period> | null; updatedAt: string;
};
export type MonthlyAnalysis = {
  month: string; version: number; ledgerVersion: number; reportVersion: number; publishedAt: string;
  headline: string; findings: Finding[]; coverage: Coverage; source: AnalysisSource; sourceWindows: SourceWindow[];
};

const integer = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
function count(value: unknown) {
  const whole = integer(value);
  return whole !== null && whole >= 0 ? whole : null;
}
const rupees = new Intl.NumberFormat('en-IN');
const share = new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 1 });
function money(paisa: number) {
  const absolute = Math.abs(paisa);
  return `${paisa < 0 ? '−' : ''}₹${rupees.format(Math.floor(absolute / 100))}.${String(absolute % 100).padStart(2, '0')}`;
}
const portion = (amount: number | null, total: number | null) =>
  amount !== null && total !== null && total > 0 ? Math.round(amount / total * 1000) : null;

function analysisCoverage(report: Monthly): Coverage {
  const coverage = report.coverage;
  const inputCount = count(coverage.inputCount);
  const locked = count(coverage.lockedCount), unparsed = count(coverage.unparsedCount), excluded = count(coverage.excludedCount);
  const readable = inputCount !== null && locked !== null && unparsed !== null && excluded !== null
    ? count(inputCount - locked - unparsed - excluded) : null;
  const gaps: Gap[] = [{ code: 'household_coverage_unknown', count: null,
    text: 'Whole-household coverage is unknown. Reconciliation checks the captured ledger.' }];
  if (readable === null) gaps.push({ code: 'readable_inputs_unknown', count: null, text: 'The number of readable inputs is unknown.' });
  else if (readable === 0) gaps.push({ code: 'no_readable_inputs', count: 0, text: 'No readable source inputs were recorded for this month.' });
  const counters = [
    ['partial_documents', coverage.partialCount, 'partially captured source documents'],
    ['locked_documents', locked, 'locked source documents'],
    ['unparsed_documents', unparsed, 'unparsed source documents'],
    ['excluded_documents', excluded, 'excluded source documents'],
    ['open_intake', coverage.inProgressCount, 'open intake items'],
    ['pending_transactions', report.counts.pending, 'pending transactions'],
    ['review_transactions', report.counts.review, 'transactions awaiting review'],
    ['excluded_transactions', report.counts.excluded, 'excluded transactions'],
  ] as const;
  for (const [code, value, label] of counters) {
    const known = count(value);
    if (known !== 0) gaps.push({ code, count: known,
      text: known === null ? `The count of ${label} is unknown.` : `The ledger records ${known} ${label}.` });
  }
  return { status: (coverage.status === 'partial' || coverage.status === 'observed') && readable !== null
    ? coverage.status : 'unknown', inputCount, readableInputCount: readable, completeness: 'unknown', gaps };
}

function coverageBinding(coverage: Monthly['coverage']) {
  return [coverage.status, coverage.inputCount, coverage.partialCount, coverage.lockedCount,
    coverage.unparsedCount, coverage.excludedCount, coverage.inProgressCount];
}

async function readBoundReport(tx: Transaction, root: DocumentReference, current: Monthly, month: string, reportVersion: number) {
  if (current.coverage.inProgressCount > 0) throw new FinanceError('intake_in_progress');
  const reconciliation = current.reconciliation;
  if (current.month !== month || current.version !== reportVersion || reconciliation?.reportVersion !== reportVersion)
    throw new FinanceError('revision_conflict');
  const reportId = fingerprint(month, reportVersion);
  const doc = await tx.get(root.collection('reports').doc(reportId));
  const report = doc.data() as Monthly | undefined;
  if (!report) throw new FinanceError('not_found');
  const totals = aggregateFingerprint(report), coverage = fingerprint(coverageBinding(report.coverage));
  if (report.month !== month || report.version !== reportVersion || report.reconciliation?.reportVersion !== reportVersion ||
      totals !== aggregateFingerprint(current) || coverage !== fingerprint(coverageBinding(current.coverage)) ||
      report.reconciliation.status !== reconciliation.status || report.reconciliation.reconciledAt !== reconciliation.reconciledAt ||
      report.reconciliation.transactionCount !== reconciliation.transactionCount) throw new FinanceError('revision_conflict');
  // The month revision also invalidates changes to its finalized source-window evidence.
  const source: AnalysisSource = { month, ledgerVersion: current.version, reportVersion, reportId,
    sourceDigest: fingerprint('finance-analysis-source-v1', reportId, totals, coverage,
      reconciliation.status, reconciliation.reconciledAt, reconciliation.transactionCount) };
  return { report, source };
}

export async function getAnalysisSource(root: DocumentReference, month: string, reportVersion: number) {
  return root.firestore.runTransaction(async tx => {
    const current = (await tx.get(root.collection('months').doc(month))).data() as Monthly | undefined;
    if (!current) throw new FinanceError('not_found');
    return (await readBoundReport(tx, root, current, month, reportVersion)).source;
  }, { readOnly: true });
}

const windowStatus = z.enum(['observed', 'partial', 'locked', 'unparsed', 'excluded']);
const period = z.object({ from: z.iso.date(), to: z.iso.date() }).strict().refine(value => value.from <= value.to);
async function getSourceWindows(tx: Transaction, root: DocumentReference, month: string, ids: string[]): Promise<SourceWindow[]> {
  if (ids.length === 0) return [];
  const docs = await tx.getAll(...ids.map(id => root.collection('sourceWindows').doc(id)));
  return docs.map(doc => {
    const data = doc.data();
    if (!data || data.id !== doc.id || !Array.isArray(data.months) || !data.months.includes(month))
      throw new FinanceError('invalid_request');
    const type = sourceType.safeParse(data.sourceType), status = windowStatus.safeParse(data.status);
    const dates = period.nullable().safeParse(data.period ?? null);
    const updated = z.iso.datetime().safeParse(data.updatedAt);
    if (!type.success || !status.success || !dates.success || !updated.success) throw new FinanceError('invalid_request');
    return { id: doc.id, sourceType: type.data, status: status.data, period: dates.data, updatedAt: updated.data };
  });
}

function uniqueSorted(values: string[]) { return [...new Set(values)].sort(); }
function normalizeFindings(findings: FindingInput[]) {
  const normalized = new Map<string, FindingInput>();
  for (const finding of findings) {
    const selector = finding.code === 'spend_group' ? { code: finding.code, eventIds: uniqueSorted(finding.eventIds) } : finding;
    if (selector.code === 'spend_group' && selector.eventIds.length < 2) throw new FinanceError('invalid_request');
    const key = JSON.stringify(selector);
    normalized.set(key, selector);
  }
  return [...normalized.keys()].sort().map(key => normalized.get(key)!);
}

async function getSpendEvidence(tx: Transaction, root: DocumentReference, month: string, findings: FindingInput[]): Promise<Map<string, SpendEvidence>> {
  const ids = uniqueSorted(findings.flatMap(finding => finding.code === 'spend_group' ? finding.eventIds : []));
  if (ids.length === 0) return new Map();
  if (ids.length > 12) throw new FinanceError('invalid_request');
  const docs = await tx.getAll(...ids.map(id => root.collection('events').doc(id)));
  return new Map(docs.map(doc => {
    const row = doc.data() as LedgerEvent | undefined;
    if (!row || row.id !== doc.id || row.month !== month || row.occurredOn?.slice(0, 7) !== month || row.status !== 'posted' ||
        (row.kind !== 'spend' && row.kind !== 'fee') || count(row.amountPaisa) === null || row.amountPaisa === 0 || !version.safeParse(row.revision).success)
      throw new FinanceError('invalid_request');
    return [doc.id, { eventId: doc.id, revision: row.revision, amountPaisa: row.amountPaisa }];
  }));
}

const categoryLabels: Record<z.output<typeof category>, string> = {
  uncategorized: 'Uncategorized spending', groceries: 'Groceries', dining: 'Dining', transport: 'Transport',
  housing: 'Housing', utilities: 'Utilities', shopping: 'Shopping', health: 'Health', entertainment: 'Entertainment',
  travel: 'Travel', education: 'Education', subscriptions: 'Subscriptions', fees: 'Fees', tax: 'Tax', gifts: 'Gifts', other: 'Other spending',
};
function positive(value: unknown) {
  const safe = count(value);
  return safe === 0 ? null : safe;
}

function capturedFigures<const Key extends keyof Monthly>(report: Monthly, keys: readonly Key[]): Record<Key, number | null> {
  return Object.fromEntries(keys.map(key => [key, positive(report[key])])) as Record<Key, number | null>;
}

function makeFinding(finding: FindingInput, report: Monthly, events: Map<string, SpendEvidence>): Finding {
  const code = finding.code;
  const moneyText = (value: number | null, label: string) => value === null ? `${label} is unknown.` : `${label} was ${money(value)}.`;
  switch (code) {
    case 'income': {
      const figures = capturedFigures(report, ['earnedIncomePaisa', 'otherIncomePaisa', 'reimbursementPaisa']);
      return { code, figures, text: [moneyText(figures.earnedIncomePaisa, 'Captured earned income'),
        moneyText(figures.otherIncomePaisa, 'Recorded interest'), moneyText(figures.reimbursementPaisa, 'Recorded reimbursements'),
      ].join(' ') };
    }
    case 'spending': {
      const spendPaisa = positive(report.spendPaisa), refundPaisa = positive(report.refundPaisa);
      const netSpendPaisa = spendPaisa !== null || refundPaisa !== null ? integer(report.netSpendPaisa) : null;
      const figures = { spendPaisa, refundPaisa, netSpendPaisa };
      return { code, figures, text: [moneyText(figures.spendPaisa, 'Captured gross spending'),
        moneyText(figures.refundPaisa, 'Recorded refunds'), moneyText(figures.netSpendPaisa, 'Captured net spending')].join(' ') };
    }
    case 'cashflow': {
      const inflowPaisa = positive(report.inflowPaisa), outflowPaisa = positive(report.outflowPaisa);
      const cashflowPaisa = inflowPaisa !== null || outflowPaisa !== null ? integer(report.cashflowPaisa) : null;
      const figures = { inflowPaisa, outflowPaisa, cashflowPaisa };
      return { code, figures, text: [moneyText(figures.inflowPaisa, 'Captured cash inflow'),
        moneyText(figures.outflowPaisa, 'Captured cash outflow'), moneyText(figures.cashflowPaisa, 'Net cash movement')].join(' ') };
    }
    case 'financing': {
      const figures = capturedFigures(report, ['internalTransferInPaisa', 'internalTransferOutPaisa', 'cardSettlementPaisa', 'loanDrawPaisa', 'loanRepaymentPaisa']);
      return { code, figures, text: [moneyText(figures.internalTransferInPaisa, 'Captured transfers into cash accounts'),
        moneyText(figures.internalTransferOutPaisa, 'Captured transfers out of cash accounts'),
        moneyText(figures.cardSettlementPaisa, 'Captured cash-account card settlements'), moneyText(figures.loanDrawPaisa, 'Captured loan draws'),
        moneyText(figures.loanRepaymentPaisa, 'Captured principal repayments'),
      ].join(' ') };
    }
    case 'investments': {
      const figures = capturedFigures(report, ['investmentContributionPaisa', 'investmentWithdrawalPaisa']);
      return { code, figures, text: [moneyText(figures.investmentContributionPaisa, 'Captured investment contributions'),
        moneyText(figures.investmentWithdrawalPaisa, 'Captured investment withdrawals'),
      ].join(' ') };
    }
    case 'category_share': {
      const spendPaisa = count(report.spendPaisa);
      const amountPaisa = (spendPaisa ?? 0) > 0 ? count(report.categories[finding.category] ?? 0) : null;
      const spendShareTenthsPercent = portion(amountPaisa, spendPaisa);
      const label = categoryLabels[finding.category];
      const text = amountPaisa === null || spendShareTenthsPercent === null ? `Captured spending for ${label.toLowerCase()} is unknown.`
        : amountPaisa === 0 ? `The ledger captured gross spending and recorded no posted expenses in the ${label.toLowerCase()} category.`
        : `${label} accounted for ${share.format(spendShareTenthsPercent / 1000)} of captured gross spending (${money(amountPaisa)}).`;
      return { code, category: finding.category, figures: { amountPaisa, spendShareTenthsPercent }, text };
    }
    case 'spend_group': {
      const eventIds = finding.eventIds;
      const selected = eventIds.map(id => events.get(id)!);
      const amountPaisa = integer(selected.reduce((total, event) => total + event.amountPaisa, 0));
      const spendPaisa = count(report.spendPaisa);
      if (amountPaisa === null || spendPaisa === null || amountPaisa > spendPaisa) throw new FinanceError('revision_conflict');
      const spendShareTenthsPercent = portion(amountPaisa, spendPaisa)!;
      const eventRevisions = selected.map(({ eventId, revision }) => ({ eventId, revision }));
      return { code, eventIds, eventRevisions, figures: { amountPaisa, spendShareTenthsPercent },
        text: `The ${eventIds.length} selected posted expenses totaled ${money(amountPaisa)}, or ${share.format(spendShareTenthsPercent / 1000)} of captured gross spending.` };
    }
  }
}

export async function publishMonthlyAnalysis(root: DocumentReference, input: PublishInput) {
  const { month, ledgerVersion, reportVersion, reportId, sourceDigest } = input.source;
  const selectors = normalizeFindings(input.findings), windowIds = uniqueSorted(input.sourceWindowIds);
  const analysisId = fingerprint('finance-monthly-analysis-v1', month, ledgerVersion, reportVersion, reportId, sourceDigest, selectors, windowIds);
  const monthRef = root.collection('months').doc(month);
  const analysisRef = root.collection('monthlyAnalyses').doc(analysisId);
  return root.firestore.runTransaction(async tx => {
    const [monthDoc, receipt] = await tx.getAll(monthRef, analysisRef);
    const current = monthDoc.data() as Monthly | undefined;
    if (receipt.exists) return { ok: true, analysisId, analysis: receipt.get('analysis') as MonthlyAnalysis,
      replay: true, current: current?.version === ledgerVersion && current?.reconciliation?.reportVersion === reportVersion &&
        current?.monthlyAnalysis?.version === receipt.get('analysis.version') };
    if (!current) throw new FinanceError('not_found');
    const { report, source } = await readBoundReport(tx, root, current, month, reportVersion);
    if (source.ledgerVersion !== ledgerVersion || source.reportId !== reportId || source.sourceDigest !== sourceDigest)
      throw new FinanceError('revision_conflict');
    const sourceWindows = await getSourceWindows(tx, root, month, windowIds);
    const events = await getSpendEvidence(tx, root, month, selectors);
    const coverage = analysisCoverage(report);
    const all = count(report.counts.transactions), review = count(report.counts.review);
    const pending = count(report.counts.pending), excluded = count(report.counts.excluded);
    const posted = all !== null && review !== null && pending !== null && excluded !== null ? count(all - review - pending - excluded) : null;
    const headline = posted === null ? 'The number of captured posted transactions is unknown.'
      : posted === 0 ? 'No posted transactions were captured. Financial activity for the month is unknown.'
        : `${posted} posted ${posted === 1 ? 'transaction' : 'transactions'} in the captured ledger informed this analysis.`;
    const analysisVersion = (current.analysisVersion ?? 0) + 1;
    const analysis: MonthlyAnalysis = { month, version: analysisVersion, ledgerVersion, reportVersion,
      publishedAt: new Date().toISOString(), headline, findings: selectors.map(finding => makeFinding(finding, report, events)),
      coverage, source, sourceWindows };
    tx.create(analysisRef, { analysisId, analysis });
    tx.update(monthRef, { analysisVersion, monthlyAnalysis: analysis });
    return { ok: true, analysisId, analysis, replay: false, current: true };
  });
}
