import { FieldPath, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { FinanceError, fingerprint, type Entry, type Coverage, type SourceType } from './finance-contract.js';

export interface LedgerEvent {
  id: string;
  occurredOn: string;
  month: string;
  kind: Entry['kind'];
  status: NonNullable<Entry['status']>;
  direction: Entry['direction'];
  account: string | null;
  accountKind: Entry['accountKind'] | null;
  amountPaisa: number;
  category: Entry['category'] | null;
  merchant: string | null;
  source: string;
  sourceType: SourceType;
  revision: number;
  updatedAt: string;
  evidenceCount: number;
  sourceTypes: SourceType[];
  evidenceMessages: string[];
  ownerCorrected: boolean;
  duplicateOf: string | null;
  reviewReason: string | null;
}

const figures = ['earnedIncomePaisa', 'spendPaisa', 'refundPaisa', 'netSpendPaisa', 'cashflowPaisa',
  'inflowPaisa', 'outflowPaisa', 'reimbursementPaisa', 'internalTransferPaisa', 'cardSettlementPaisa',
  'investmentContributionPaisa', 'investmentWithdrawalPaisa', 'otherIncomePaisa', 'internalTransferInPaisa', 'internalTransferOutPaisa', 'loanDrawPaisa', 'loanRepaymentPaisa'] as const;
type Figure = typeof figures[number];
export function blankMonthly(month: string) {
  return {
    month, version: 0, updatedAt: null as string | null,
    earnedIncomePaisa: 0, spendPaisa: 0, refundPaisa: 0, netSpendPaisa: 0, cashflowPaisa: 0,
    inflowPaisa: 0, outflowPaisa: 0, reimbursementPaisa: 0, internalTransferPaisa: 0, internalTransferInPaisa: 0, internalTransferOutPaisa: 0,
    cardSettlementPaisa: 0, investmentContributionPaisa: 0, investmentWithdrawalPaisa: 0,
    otherIncomePaisa: 0, loanDrawPaisa: 0, loanRepaymentPaisa: 0,
    counts: { transactions: 0, review: 0, pending: 0, excluded: 0 },
    categories: {} as Record<string, number>,
    coverage: { status: 'partial' as 'observed' | 'partial', inputCount: 0, partialCount: 0,
      lockedCount: 0, unparsedCount: 0, excludedCount: 0, inProgressCount: 0 },
    reconciliation: null as null | { status: 'balanced' | 'repaired'; reconciledAt: string;
      reportVersion: number; transactionCount: number },
  };
}
export type Monthly = ReturnType<typeof blankMonthly>;

function sum(value: number, delta: number) {
  if (!Number.isSafeInteger(value + delta)) throw new FinanceError('reconciliation_limit');
  return value + delta;
}
export function addEvent(month: Monthly, event: LedgerEvent, sign = 1) {
  month.counts.transactions += sign;
  if (event.status !== 'posted') {
    month.counts[event.status] += sign;
    return;
  }
  const amount = sign * event.amountPaisa;
  const add = (key: Figure, delta = amount) => { month[key] = sum(month[key], delta); };
  if (event.accountKind === 'cash') {
    add(event.direction === 'credit' ? 'inflowPaisa' : 'outflowPaisa');
    add('cashflowPaisa', event.direction === 'credit' ? amount : -amount);
  }
  switch (event.kind) {
    case 'earned_income': add('earnedIncomePaisa'); break;
    case 'interest': add('otherIncomePaisa'); break;
    case 'refund': add('refundPaisa'); add('netSpendPaisa', -amount); break;
    case 'reimbursement': add('reimbursementPaisa'); break;
    case 'internal_transfer':
      if (event.accountKind === 'cash') {
        add(event.direction === 'credit' ? 'internalTransferInPaisa' : 'internalTransferOutPaisa');
        if (event.direction === 'debit') add('internalTransferPaisa');
      }
      break;
    case 'card_settlement':
      if (event.accountKind === 'cash') add('cardSettlementPaisa');
      break;
    case 'investment_contribution': add('investmentContributionPaisa'); break;
    case 'investment_withdrawal': add('investmentWithdrawalPaisa'); break;
    case 'loan_draw': add('loanDrawPaisa'); break;
    case 'loan_repayment': add('loanRepaymentPaisa'); break;
    case 'spend':
    case 'fee': {
      add('spendPaisa');
      add('netSpendPaisa');
      const key = event.category || (event.kind === 'fee' ? 'fees' : 'uncategorized');
      const total = sum(month.categories[key] || 0, amount);
      if (total) month.categories[key] = total;
      else delete month.categories[key];
      break;
    }
  }
}

export function changeCoverage(month: Monthly, coverage: Coverage, sign = 1) {
  month.coverage.inputCount += sign;
  if (coverage === 'partial') month.coverage.partialCount += sign;
  if (coverage === 'locked') month.coverage.lockedCount += sign;
  if (coverage === 'unparsed') month.coverage.unparsedCount += sign;
  if (coverage === 'excluded') month.coverage.excludedCount += sign;
  evaluateCoverage(month);
}

function evaluateCoverage(month: Monthly) {
  const { inputCount, partialCount, lockedCount, unparsedCount, excludedCount, inProgressCount } = month.coverage;
  month.coverage.status = inputCount && !(partialCount || lockedCount || unparsedCount || excludedCount || inProgressCount)
    ? 'observed' : 'partial';
}
export function changeInProgress(month: Monthly, delta: number) {
  month.coverage.inProgressCount = (month.coverage.inProgressCount || 0) + delta;
  evaluateCoverage(month);
}

export function versionMonth(month: Monthly, now: string) {
  month.version++;
  month.updatedAt = now;
  month.reconciliation = null;
}

export function aggregateFingerprint(month: Monthly) {
  return fingerprint(figures.map(key => month[key]), month.counts,
    Object.entries(month.categories).sort(([first], [second]) => first.localeCompare(second)));
}

export function monthlyFrom(data: FirebaseFirestore.DocumentData | undefined, month: string): Monthly {
  return (data as Monthly | undefined) || blankMonthly(month);
}

export async function loadMonths(tx: Transaction, root: DocumentReference, keys: string[]) {
  const unique = [...new Set(keys)];
  const docs = await tx.getAll(...unique.map(key => root.collection('months').doc(key)));
  return new Map(docs.map(doc => [doc.id, monthlyFrom(doc.data(), doc.id)]));
}

export function persistEvent(
  tx: Transaction, root: DocumentReference, before: LedgerEvent | undefined, after: LedgerEvent,
  months: Map<string, Monthly>, audit: Record<string, unknown>,
) {
  if (before) addEvent(months.get(before.month)!, before, -1);
  addEvent(months.get(after.month)!, after);
  for (const [key, month] of months) {
    versionMonth(month, after.updatedAt);
    tx.set(root.collection('months').doc(key), month);
  }
  tx.set(root.collection('events').doc(after.id), after);
  const { ownerCorrected, evidenceMessages, sourceTypes, ...projection } = after;
  tx.set(root.collection('transactions').doc(after.id), projection);
  if (after.reviewReason || before?.reviewReason || before?.status === 'review') {
    tx.set(root.collection('reviews').doc(after.id), {
      id: after.id, eventId: after.id, revision: after.revision, occurredOn: after.occurredOn, month: after.month,
      amountPaisa: after.amountPaisa, kind: after.kind, reason: after.reviewReason || before?.reviewReason || 'owner_resolved',
      status: after.status === 'review' ? 'open' : 'resolved', merchant: after.merchant, category: after.category,
      account: after.account, direction: after.direction, duplicateOf: after.duplicateOf, updatedAt: after.updatedAt,
    });
  }
  const recurring = root.collection('recurring').doc(after.id);
  if ((after.sourceType === 'mandate' && after.status !== 'excluded') ||
      (after.category === 'subscriptions' && after.merchant && after.status === 'posted')) {
    tx.set(recurring, {
      id: after.id, account: after.account, merchant: after.merchant, amountPaisa: after.amountPaisa,
      status: after.sourceType === 'mandate' ? 'observed' : 'possible', kind: after.sourceType === 'mandate' ? 'mandate' : 'subscription',
      lastOccurredOn: after.occurredOn, occurrences: 1, updatedAt: after.updatedAt,
    });
  } else if (before?.sourceType === 'mandate' || before?.category === 'subscriptions') tx.delete(recurring);
  tx.create(root.collection('revisions').doc(fingerprint(after.id, after.revision)), {
    id: after.id, revision: after.revision, before: before || null, after, ...audit,
  });
}

const pageSize = 150;
const maxPages = 20;
export async function reconcileMonth(root: DocumentReference, month: string, actor: string) {
  const monthRef = root.collection('months').doc(month);
  const initial = await monthRef.get();
  if (!initial.exists) throw new FinanceError('not_found');
  const projected = monthlyFrom(initial.data(), month);
  if (projected.coverage.inProgressCount > 0) throw new FinanceError('intake_in_progress');
  if (projected.reconciliation) return projected.reconciliation;
  const recomputed = blankMonthly(month);
  const query = root.collection('events').where('month', '==', month).orderBy(FieldPath.documentId());
  let cursor: string | undefined;
  for (let index = 0; ; index++) {
    const batch = await (cursor ? query.startAfter(cursor) : query).limit(pageSize).get();
    if (!batch.empty && index === maxPages) throw new FinanceError('reconciliation_limit');
    for (const doc of batch.docs) addEvent(recomputed, doc.data() as LedgerEvent);
    if (batch.size < pageSize) break;
    cursor = batch.docs.at(-1)!.id;
  }
  return root.firestore.runTransaction(async tx => {
    const current = monthlyFrom((await tx.get(monthRef)).data(), month);
    if (current.version !== projected.version) throw new FinanceError('revision_conflict');
    if (current.reconciliation) return current.reconciliation;
    const reconciledAt = new Date().toISOString(), reportVersion = current.version + 1;
    const status = aggregateFingerprint(current) === aggregateFingerprint(recomputed) ? 'balanced' : 'repaired';
    const reconciliation = { status, reconciledAt, reportVersion, transactionCount: recomputed.counts.transactions } as const;
    const next = { ...recomputed, version: reportVersion, updatedAt: reconciledAt, coverage: current.coverage, reconciliation };
    tx.set(monthRef, next);
    tx.create(root.collection('reports').doc(fingerprint(month, reportVersion)), { ...next, actor });
    return reconciliation;
  });
}