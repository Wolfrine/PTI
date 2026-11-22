import { FieldPath, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import {
  FINANCE_START, FinanceError, compatibleDirection, fingerprint, indiaDate, isLoanKind, monthsBetween, validateIngest,
  type ContextInput, type CorrectionInput, type Coverage, type Entry, type IngestInput, type ScanInput,
  type SourceType, type Stock,
} from './finance-contract.js';
import { changeCoverage, changeInProgress, loadMonths, persistEvent, type LedgerEvent, versionMonth } from './finance-projection.js';

type RowResult = 'recorded' | 'linked' | 'review' | 'unchanged';
type ActiveCoverage = { months: string[]; coverage: Coverage };
type Progress = {
  edition: number; parserVersion: string; nextPart: number; closed: boolean;
  months: string[]; coverage: Coverage; lastActive: ActiveCoverage | null;
};
type CandidateIndex = { eventIds: string[]; overflow: boolean };
type StockProjection = Stock & { id: string; source: string; sourceType: SourceType; receivedAt: string; updatedAt: string; messageDigest: string; edition: number };
const neighborLimit = 12;
const weakWindowDays = 3;
const editionKey = (message: string, edition: number) => fingerprint(message, edition);
function candidateDay(day: string, offset: number) {
  return new Date(Date.parse(day) + offset * 86_400_000).toISOString().slice(0, 10);
}
const ranks: Record<SourceType, number> = {
  bank_alert: 2, card_alert: 2, bank_statement: 3, card_statement: 3,
  merchant_receipt: 1, investment_statement: 3, mandate: 0, other: 0,
};

function financialAccount(row: Entry, source: SourceType): LedgerEvent['accountKind'] {
  if (!row.account || ['merchant_receipt', 'mandate', 'other'].includes(source)) return null;
  if (source.startsWith('bank_')) return 'cash';
  if (source.startsWith('card_')) return 'debt';
  return 'investment';
}
function indexValue(data: FirebaseFirestore.DocumentData | undefined): CandidateIndex {
  return (data as CandidateIndex | undefined) || { eventIds: [], overflow: false };
}
function insertCandidate(index: CandidateIndex, eventId: string) {
  if (index.eventIds.includes(eventId)) return index;
  if (index.eventIds.length >= neighborLimit) return { ...index, overflow: true };
  return { ...index, eventIds: [...index.eventIds, eventId] };
}
function compatibleEvent(event: LedgerEvent, row: Entry, input: IngestInput, message: string) {
  if (event.evidenceMessages.includes(message) || event.duplicateOf || event.status === 'excluded' || row.status === 'excluded' ||
      ['mandate', 'other'].includes(event.sourceType) || ['mandate', 'other'].includes(input.sourceType)) return false;
  if (event.amountPaisa !== row.amountPaisa || event.direction !== row.direction ||
      (event.kind !== row.kind && event.kind !== 'unknown' && row.kind !== 'unknown')) return false;
  const incomingAccountType = financialAccount(row, input.sourceType);
  if (event.account && row.account && event.account !== row.account) return false;
  if (event.accountKind && incomingAccountType && event.accountKind !== incomingAccountType) return false;
  return Math.abs(Date.parse(event.occurredOn) - Date.parse(row.occurredOn)) <= 7 * 86_400_000;
}

function makeEvent(row: Entry, input: IngestInput, id: string, message: string, ambiguous: boolean, now: string): LedgerEvent {
  const accountKind = financialAccount(row, input.sourceType);
  const reason = ambiguous ? 'possible_duplicate'
    : input.sourceType === 'merchant_receipt' ? 'unmatched_receipt'
    : input.sourceType === 'mandate' ? 'mandate_requires_review'
    : row.kind === 'unknown' ? 'classification_uncertain'
    : !accountKind ? 'account_unconfirmed'
    : row.status === 'review' ? 'source_requires_review' : null;
  const pending = row.status === 'pending' || (input.sourceType.endsWith('_alert') && !row.status);
  const normalizedStatus = row.status === 'excluded' ? 'excluded' : pending ? 'pending'
    : reason ? 'review' : 'posted';
  return {
    id, occurredOn: row.occurredOn, month: row.occurredOn.slice(0, 7), amountPaisa: row.amountPaisa,
    kind: row.kind, direction: row.direction, status: normalizedStatus, category: row.category || null,
    merchant: row.merchant || null, account: row.account || null, accountKind, source: input.source,
    sourceType: input.sourceType, revision: 1, evidenceCount: 1, evidenceMessages: [message],
    sourceTypes: [input.sourceType], ownerCorrected: false, duplicateOf: null,
    reviewReason: normalizedStatus === 'review' ? reason : null, updatedAt: now,
  };
}

function attachEvidence(before: LedgerEvent, candidate: LedgerEvent, message: string, now: string, competingPosted: boolean): LedgerEvent {
  const incomingIsStatement = candidate.sourceType.endsWith('_statement');
  const beforeIsStatement = before.sourceType.endsWith('_statement');
  const matchesPending = candidate.status === 'pending' || before.status === 'pending';
  const preferred = candidate.accountKind && (!before.accountKind || ranks[candidate.sourceType] > ranks[before.sourceType]) &&
    (!matchesPending || incomingIsStatement) ? candidate : before;
  const competing = before.status !== 'posted' && preferred.status === 'posted' && competingPosted;
  const nextStatus = before.ownerCorrected || (before.status === 'posted' && preferred.status === 'pending') ? before.status
    : competing ? 'review' : preferred.status;
  return {
    ...preferred, id: before.id, status: nextStatus,
    kind: before.ownerCorrected ? before.kind : preferred.kind, ownerCorrected: before.ownerCorrected,
    duplicateOf: before.duplicateOf, category: before.ownerCorrected ? before.category : preferred.category || before.category || candidate.category,
    merchant: preferred.merchant || before.merchant || candidate.merchant,
    evidenceCount: before.evidenceCount + 1, sourceTypes: [...new Set([...before.sourceTypes, candidate.sourceType])],
    evidenceMessages: [...before.evidenceMessages, message], revision: before.revision + 1,
    reviewReason: before.ownerCorrected ? before.reviewReason : competing ? 'possible_duplicate' : preferred.reviewReason, updatedAt: now,
  };
}

function cleanRow(row: Entry) {
  const { references, ...fields } = row;
  const referenceIds = [...new Set(references.map(ref => fingerprint(ref.namespace, ref.value)))].sort();
  return { ...fields, referenceIds };
}

async function postRow(root: DocumentReference, input: IngestInput, row: Entry, message: string, partKey: string): Promise<RowResult> {
  const sanitized = cleanRow(row);
  const rowDigest = fingerprint(sanitized);
  const physicalId = fingerprint(message, row.rowKey);
  const rowRef = root.collection('physicalRows').doc(physicalId);
  const observedRef = root.collection('rowReceipts').doc(fingerprint(partKey, physicalId));
  const neighborRefs = Array.from({ length: weakWindowDays * 2 + 1 }, (_, index) => {
    const day = candidateDay(row.occurredOn, index - weakWindowDays);
    return root.collection('candidates').doc(fingerprint(day, row.direction, row.amountPaisa));
  });
  const refDocs = sanitized.referenceIds.map(id => root.collection('referenceIndex').doc(id));

  return root.firestore.runTransaction(async tx => {
    const [receipt, physical] = await tx.getAll(observedRef, rowRef);
    if (receipt.exists) return receipt.get('result') as RowResult;
    const now = new Date().toISOString();
    if (physical.exists) {
      const existingId = physical.get('eventId') as string;
      const before = (await tx.get(root.collection('events').doc(existingId))).data() as LedgerEvent | undefined;
      if (!before) throw new FinanceError('revision_conflict');
      const result = rowDigest === physical.get('rowDigest') || rowDigest === physical.get('lastObservedDigest') ? 'unchanged' : 'review';
      if (result === 'review') {
        const months = await loadMonths(tx, root, [before.month]);
        const after = {
          ...before, status: 'review', reviewReason: 'changed_source_row', revision: before.revision + 1, updatedAt: now,
        } satisfies LedgerEvent;
        persistEvent(tx, root, before, after, months, { operation: 'reparse_conflict', physicalId, partKey });
      }
      tx.update(rowRef, { lastObservedDigest: rowDigest, activeEdition: editionKey(message, input.edition) });
      tx.create(observedRef, { physicalId, eventId: existingId, partKey, rowDigest, result, observation: sanitized, processedAt: now });
      return result;
    }

    const lookup = await tx.getAll(...neighborRefs, ...refDocs);
    const neighbors = lookup.slice(0, neighborRefs.length).map(item => indexValue(item.data()));
    const indices = lookup.slice(neighborRefs.length).map(item => indexValue(item.data()));
    const strongIds = new Set(indices.flatMap(index => index.eventIds));
    const allIds = [...new Set([...neighbors.flatMap(index => index.eventIds), ...strongIds])];
    const evidence = allIds.length
      ? (await tx.getAll(...allIds.map(id => root.collection('events').doc(id)))).flatMap(doc => doc.exists ? [doc.data() as LedgerEvent] : [])
      : [];
    const compatible = evidence.filter(event => compatibleEvent(event, row, input, message));
    const exact = compatible.filter(event => strongIds.has(event.id));
    const ambiguousStrong = strongIds.size !== exact.length || indices.some(index => index.overflow);
    const matched = exact.length === 1 && !ambiguousStrong && exact[0].evidenceMessages.length < 60 ? exact[0] : undefined;
    const weak = compatible.filter(event =>
      !event.sourceTypes.includes(input.sourceType) || input.sourceType.endsWith('_statement'));
    const ambiguous = !matched && (strongIds.size > 0 || ambiguousStrong ||
      ((weak.length > 0 || neighbors.some(index => index.overflow)) && !['mandate', 'other'].includes(input.sourceType)));
    const candidate = makeEvent(row, input, physicalId, message, ambiguous, now);
    const after = matched ? attachEvidence(matched, candidate, message, now,
      weak.some(event => event.id !== matched.id && event.status === 'posted')) : candidate;
    const months = await loadMonths(tx, root, matched ? [matched.month, after.month] : [after.month]);
    const result: RowResult = after.status === 'review' ? 'review' : matched ? 'linked' : 'recorded';
    persistEvent(tx, root, matched, after, months, { operation: matched ? 'attach_evidence' : 'capture', physicalId, partKey });
    tx.create(rowRef, { id: physicalId, message, rowKey: row.rowKey, rowDigest, eventId: after.id, createdAt: now,
      activeEdition: editionKey(message, input.edition) });
    tx.create(observedRef, { physicalId, eventId: after.id, partKey, rowDigest, result, observation: sanitized, processedAt: now });
    tx.set(neighborRefs[weakWindowDays], insertCandidate(neighbors[weakWindowDays], after.id));
    for (const [index, ref] of refDocs.entries()) tx.set(ref, insertCandidate(indices[index], after.id));
    return result;
  });
}

async function flagMissingRows(root: DocumentReference, message: string, edition: number, partKey: string) {
  const previous = editionKey(message, edition - 1);
  const page = await root.collection('physicalRows').where('activeEdition', '==', previous).limit(21).get();
  for (const doc of page.docs.slice(0, 20)) {
    await root.firestore.runTransaction(async tx => {
      const row = await tx.get(doc.ref);
      if (row.get('activeEdition') !== previous) return;
      const before = (await tx.get(root.collection('events').doc(row.get('eventId') as string))).data() as LedgerEvent | undefined;
      if (!before) throw new FinanceError('revision_conflict');
      const now = new Date().toISOString();
      if (before.evidenceMessages.length === 1 && before.status !== 'excluded') {
        const months = await loadMonths(tx, root, [before.month]);
        const after = {
          ...before, status: 'review', reviewReason: 'row_missing_from_reparse', revision: before.revision + 1, updatedAt: now,
        } satisfies LedgerEvent;
        persistEvent(tx, root, before, after, months, { operation: 'reparse_omission', physicalId: row.id, partKey });
      }
      tx.update(doc.ref, { activeEdition: null });
      tx.create(root.collection('rowReceipts').doc(fingerprint(partKey, row.id, 'omitted')), {
        physicalId: row.id, eventId: before.id, partKey, result: 'omitted', processedAt: now,
      });
    });
  }
  return page.size > 20;
}

function partMonths(input: IngestInput) {
  return new Set([
    ...(input.period ? monthsBetween(input.period.from, input.period.to) : []),
    ...input.entries.map(row => row.occurredOn.slice(0, 7)),
    ...input.balances.map(stock => stock.asOf.slice(0, 7)),
    ...(!input.period && !input.entries.length && !input.balances.length ? [indiaDate(input.receivedAt).slice(0, 7)] : []),
  ]);
}

const stockRef = (root: DocumentReference, value: Stock) =>
  root.collection('balances').doc(fingerprint(value.account, value.kind, stockBasis(value)));
function stockBasis(stock: Stock) {
  return stock.basis || (stock.kind === 'cash' ? 'closing_balance' : stock.kind === 'debt' ? 'amount_due' : 'market_value');
}
function afterStock(candidate: StockProjection, existing: StockProjection | undefined) {
  if (!existing) return true;
  if (candidate.asOf !== existing.asOf) return candidate.asOf > existing.asOf;
  if (ranks[candidate.sourceType] !== ranks[existing.sourceType]) return ranks[candidate.sourceType] > ranks[existing.sourceType];
  if (candidate.messageDigest === existing.messageDigest) return candidate.edition > existing.edition;
  return candidate.receivedAt > existing.receivedAt;
}
function sourceCoverage(data: FirebaseFirestore.DocumentData, coverage: Coverage, direction = 1) {
  const key = { observed: 'observedCount', partial: 'partialCount', locked: 'lockedCount', unparsed: 'unparsedCount', excluded: 'excludedCount' }[coverage];
  data.inputCount = (data.inputCount || 0) + direction;
  data[key] = (data[key] || 0) + direction;
}

export async function ingestMail(root: DocumentReference, input: IngestInput) {
  validateIngest(input);
  if (new Set(input.balances.map(value => value.account + ':' + value.kind + ':' + stockBasis(value))).size !== input.balances.length)
    throw new FinanceError('invalid_request');
  const message = fingerprint(input.messageId);
  const partKey = fingerprint(message, input.edition, input.part);
  const envelope = { id: message, messageId: input.messageId, receivedAt: input.receivedAt, source: input.source, sourceType: input.sourceType };
  const digest = fingerprint(envelope, input.parserVersion, input.ownerScope, input.edition, input.part, input.finalPart, input.period || null,
    input.coverage, input.entries.map(cleanRow), input.balances);
  const progressRef = root.collection('mailProgress').doc(message);
  const envelopeRef = root.collection('mailEnvelopes').doc(message);
  const partRef = root.collection('mailParts').doc(partKey);
  const receiptRef = root.collection('mailPartReceipts').doc(partKey);
  const prepared = await root.firestore.runTransaction(async tx => {
    const [prior, mail, part, receipt] = await tx.getAll(progressRef, envelopeRef, partRef, receiptRef);
    if (mail.exists && mail.get('digest') !== fingerprint(envelope)) throw new FinanceError('revision_conflict');
    if (part.exists && part.get('digest') !== digest) throw new FinanceError('revision_conflict');
    if (receipt.exists) return receipt.data();
    const head = prior.data() as Progress | undefined;
    const continuation = head?.edition === input.edition;
    const validNext = head && (continuation
      ? !head.closed && input.part === head.nextPart && head.parserVersion === input.parserVersion
      : head.closed && input.edition === head.edition + 1 && input.part === 1 && head.parserVersion !== input.parserVersion);
    if ((!head && (input.edition !== 1 || input.part !== 1)) || (head && !validNext)) throw new FinanceError('revision_conflict');
    const months = new Set([...(continuation ? head.months : []), ...partMonths(input)]);
    if (months.size > 13) throw new FinanceError('invalid_request');
    const carriedDrafts = continuation ? head.months : [];
    const editionDrafts = new Set([...months, ...(head?.lastActive?.months || [])]);
    const priorDrafts = continuation ? [...carriedDrafts, ...(head.lastActive?.months || [])] : [];
    const startedMonths = part.exists ? [] : [...editionDrafts].filter(month => !priorDrafts.includes(month));
    const drafts = startedMonths.length ? await loadMonths(tx, root, startedMonths) : null;
    const now = new Date().toISOString();
    if (drafts) for (const [key, month] of drafts) {
      changeInProgress(month, 1);
      versionMonth(month, now);
      tx.set(root.collection('months').doc(key), month);
    }
    if (!mail.exists) tx.create(envelopeRef, { ...envelope, digest: fingerprint(envelope), createdAt: now });
    if (!part.exists) tx.create(partRef, {
      message, edition: input.edition, part: input.part, finalPart: input.finalPart,
      parserVersion: input.parserVersion, ownerScope: input.ownerScope, period: input.period || null,
      coverage: input.coverage, digest, stockCount: input.balances.length, rowCount: input.entries.length, months: [...months],
      startedAt: now,
    });
    return null;
  });
  if (prepared) return { ...prepared, replay: true };

  const rows = { recorded: 0, linked: 0, review: 0, unchanged: 0 };
  for (const row of input.entries) rows[await postRow(root, input, row, message, partKey)]++;
  if (input.edition > 1 && input.finalPart && await flagMissingRows(root, message, input.edition, partKey)) {
    return { ok: true, message, edition: input.edition, part: input.part, finalized: false, continuationRequired: true };
  }

  return root.firestore.runTransaction(async tx => {
    const [prior, part, receipt] = await tx.getAll(progressRef, partRef, receiptRef);
    if (receipt.exists) return { ...receipt.data(), replay: true };
    const head = prior.data() as Progress | undefined;
    if (head && (head.edition === input.edition ? head.nextPart !== input.part : head.edition + 1 !== input.edition))
      throw new FinanceError('revision_conflict');
    const now = new Date().toISOString();
    const months = part.get('months') as string[];
    const coverage = head?.edition === input.edition && head.coverage === 'partial' ? 'partial' : input.coverage;
    const oldCoverage = head?.lastActive || null;
    const state: Progress = {
      edition: input.edition, parserVersion: input.parserVersion, nextPart: input.part + 1,
      closed: input.finalPart, months, coverage, lastActive: input.finalPart ? { months, coverage } : oldCoverage,
    };
    const periodTotals = input.finalPart ? await loadMonths(tx, root, [...months, ...(oldCoverage?.months || [])]) : null;
    const sourceId = input.source + '-' + input.sourceType;
    const sourceRef = root.collection('sourceStatus').doc(sourceId);
    const sourceDoc = input.finalPart ? await tx.get(sourceRef) : null;
    const stockRefs = input.balances.map(value => stockRef(root, value));
    const stockDocs = stockRefs.length ? await tx.getAll(...stockRefs) : [];

    if (periodTotals) {
      for (const [key, month] of periodTotals) {
        changeInProgress(month, -1);
        if (oldCoverage?.months.includes(key)) changeCoverage(month, oldCoverage.coverage, -1);
        if (months.includes(key)) changeCoverage(month, coverage);
        versionMonth(month, now);
        tx.set(root.collection('months').doc(key), month);
      }
      const source = sourceDoc?.data() || {
        id: sourceId, source: input.source, sourceType: input.sourceType, inputCount: 0,
        lockedCount: 0, unparsedCount: 0, excludedCount: 0, partialCount: 0, observedCount: 0,
      };
      if (oldCoverage) sourceCoverage(source, oldCoverage.coverage, -1);
      sourceCoverage(source, coverage);
      if (!source.lastReceivedAt || input.receivedAt >= source.lastReceivedAt) {
        source.status = coverage;
        source.coverage = coverage;
        source.lastReceivedAt = input.receivedAt;
      }
      const sourceWindow = root.collection('sourceWindows').doc(message);
      tx.set(sourceWindow, {
        id: message, source: input.source, sourceType: input.sourceType, status: coverage,
        receivedAt: input.receivedAt, period: input.period || null, months, updatedAt: now,
      });
      tx.set(sourceRef, { ...source, lastProcessedAt: now, updatedAt: now,
        lastObservedPeriod: input.receivedAt >= source.lastReceivedAt ? input.period || null : source.lastObservedPeriod || null });
    }
    for (const [index, stock] of input.balances.entries()) {
      const ref = stockRefs[index], before = stockDocs[index].data() as StockProjection | undefined;
      const projection = {
        ...stock, id: ref.id, source: input.source, sourceType: input.sourceType, basis: stockBasis(stock),
        receivedAt: input.receivedAt, updatedAt: now, messageDigest: message, edition: input.edition,
      };
      tx.create(root.collection('balanceEvidence').doc(fingerprint(partKey, ref.id)), { ...projection, message, partKey });
      if (afterStock(projection, before)) {
        tx.set(ref, projection);
      }
    }
    tx.set(progressRef, state);
    const result = { ok: true, message, edition: input.edition, part: input.part,
      finalized: input.finalPart, rows, coverage, months, processedAt: now };
    tx.create(receiptRef, result);
    return { ...result, replay: false };
  });
}

export async function correctEvent(root: DocumentReference, input: CorrectionInput, actor: string) {
  const event = root.collection('events').doc(input.eventId);
  const request = root.collection('corrections').doc(fingerprint(input.requestId));
  return root.firestore.runTransaction(async tx => {
    const [receipt, current] = await tx.getAll(request, event);
    const digest = fingerprint(input);
    if (receipt.exists) {
      if (receipt.get('digest') !== digest) throw new FinanceError('revision_conflict');
      return { ok: true, eventId: input.eventId, revision: receipt.get('revision') as number };
    }
    if (!current.exists) throw new FinanceError('not_found');
    const before = current.data() as LedgerEvent;
    if (before.revision !== input.expectedRevision) throw new FinanceError('revision_conflict');
    const nextStatus = input.duplicateOf ? 'excluded' : input.status || before.status;
    const nextKind = input.kind || before.kind;
    if ((nextStatus === 'posted' && (nextKind === 'unknown' || before.sourceType === 'mandate')) ||
      !compatibleDirection(nextKind, before.direction) ||
      (isLoanKind(nextKind) && before.accountKind !== 'cash') || input.duplicateOf === input.eventId ||
      (input.duplicateOf && input.status === 'posted')) throw new FinanceError('invalid_request');
    if (input.duplicateOf) {
      const target = (await tx.get(root.collection('events').doc(input.duplicateOf))).data() as LedgerEvent | undefined;
      if (!target || target.duplicateOf || target.status === 'excluded' ||
          target.amountPaisa !== before.amountPaisa || target.direction !== before.direction) throw new FinanceError('invalid_request');
    }
    const months = await loadMonths(tx, root, [before.month]);
    const after: LedgerEvent = {
      ...before, status: nextStatus, kind: nextKind, category: input.category || before.category,
      duplicateOf: input.duplicateOf || (nextStatus === 'excluded' ? before.duplicateOf : null),
      ownerCorrected: true, revision: before.revision + 1, updatedAt: new Date().toISOString(),
    };
    persistEvent(tx, root, before, after, months, { operation: 'owner_correction', actor, reason: input.reason });
    tx.create(request, { digest, eventId: input.eventId, revision: after.revision, createdAt: after.updatedAt });
    return { ok: true, eventId: input.eventId, revision: after.revision };
  });
}

function nextDay(day: string) {
  return new Date(Date.parse(day) + 86_400_000).toISOString().slice(0, 10);
}
export async function commitScan(root: DocumentReference, input: ScanInput) {
  const stateRef = root.collection('scanStatus').doc('gmail');
  const runRef = root.collection('scanRuns').doc(input.runId);
  const digest = fingerprint(input);
  if (input.window.from < FINANCE_START || input.window.to > indiaDate(new Date().toISOString()) ||
      (input.nextCursor && (input.status !== 'complete' || input.window.to !== input.nextCursor || input.expectedCursor === undefined)))
    throw new FinanceError('invalid_request');
  return root.firestore.runTransaction(async tx => {
    const [prior, run] = await tx.getAll(stateRef, runRef);
    if (run.exists) {
      if (run.get('digest') !== digest) throw new FinanceError('revision_conflict');
      return { ...run.data(), replay: true };
    }
    const cursor = prior.get('cursor') as string | null | undefined || null;
    if (input.nextCursor && (cursor !== input.expectedCursor ||
        (cursor && (input.nextCursor <= cursor || input.window.from > nextDay(cursor))))) throw new FinanceError('revision_conflict');
    const updatedAt = new Date().toISOString();
    const scan = { ...input, cursor: input.nextCursor || cursor, processedAt: updatedAt };
    tx.create(runRef, { ...scan, digest });
    tx.set(stateRef, { id: 'gmail', cursor: scan.cursor, lastScan: scan, updatedAt });
    return { ...scan, replay: false };
  });
}

export async function financeContext(root: DocumentReference, input: ContextInput) {
  const { section, limit, after, month, messageId } = input;
  if (['transactions', 'reviews'].includes(section) && !month) throw new FinanceError('invalid_request');
  if (section === 'operations') {
    const [status, checkpoint] = await Promise.all([
      root.collection('scanStatus').doc('gmail').get(), root.collection('projects').doc('pti-finance-v1').get(),
    ]);
    const messageProgress = messageId ? (await root.collection('mailProgress').doc(fingerprint(messageId)).get()).data() || null : undefined;
    return { ok: true, section, scan: status.data() || null, checkpoint: { exists: checkpoint.exists }, messageProgress };
  }
  if (section === 'overview' && month) {
    const [summary, scan] = await Promise.all([root.collection('months').doc(month).get(), root.collection('scanStatus').doc('gmail').get()]);
    return { ok: true, section, month, summary: summary.data() || null, scan: scan.data() || null };
  }
  const name = { overview: 'months', sources: 'sourceStatus', source_windows: 'sourceWindows', transactions: 'transactions', reviews: 'reviews', balances: 'balances', recurring: 'recurring' }[section];
  let query: FirebaseFirestore.Query = root.collection(name);
  if (month && ['transactions', 'reviews'].includes(section)) query = query.where('month', '==', month);
  if (month && section === 'source_windows') query = query.where('months', 'array-contains', month);
  const descending = section === 'overview';
  query = query.orderBy(FieldPath.documentId(), descending ? 'desc' : 'asc');
  if (after) query = query.startAfter(after);
  const result = await query.limit(limit + 1).get();
  const page = result.docs.slice(0, limit);
  return { ok: true, section, month: month || null, items: page.map(doc => doc.data()),
    next: result.size > limit ? page.at(-1)?.id : null };
}
