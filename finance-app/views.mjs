import { PAGE_SIZE } from './finance-data.mjs';
import { historyView } from './history.mjs';
import { amountValid, categories, count, currentMonth, date, earnedIncomeLabel, escape, href, kinds, money, monthFrom, monthLabel, monthValid, pretty, signed, stableId, views } from './values.mjs';

const statusLabel = {
  observed: 'Source records observed', partial: 'Partial coverage', balanced: 'Ledger totals checked', repaired: 'Ledger totals repaired',
  open: 'Open', resolved: 'Resolved', posted: 'Posted', pending: 'Pending', review: 'Needs review', excluded: 'Excluded',
};
const value = (input) => typeof input === 'string' && input.trim() || amountValid(input) ? escape(input) : 'Unknown';
const label = (input) => escape(statusLabel[input] ?? pretty(input));
const kindLabel = (kind) => escape(kinds[kind] ?? pretty(kind));
const statusTone = (status) => ['observed', 'balanced', 'repaired'].includes(status) ? 'ok' : ['partial', 'review', 'open', 'pending'].includes(status) ? 'attention' : '';
const pill = (status, text) => `<span class="pill ${statusTone(status)}">${text ?? label(status)}</span>`;
const hasCoverage = (coverage) => amountValid(coverage?.inputCount) && coverage.inputCount > 0;
const coveragePill = (coverage) => coverage?.inProgressCount > 0 ? pill('pending', 'Intake in progress')
  : hasCoverage(coverage) && ['partial', 'observed'].includes(coverage.status) ? pill(coverage.status)
    : pill('', 'Source coverage unknown');
const action = (view, month, text) => `<a class="text-link" href="${href(view, month)}">${text} <span aria-hidden="true">↗</span></a>`;
const categoryHref = (category, month) => `${href('transactions', month)}&category=${encodeURIComponent(category)}&status=posted&scope=spending`;
const empty = (title, copy = '') => `<div class="empty"><p><strong>${title}</strong></p>${copy ? `<p>${copy}</p>` : ''}</div>`;
const error = (section) => `<div class="empty" role="alert"><p><strong>${section} could not load.</strong></p><button type="button" class="button" data-refresh>Retry</button></div>`;
const field = (name, text) => `<div><dt>${name}</dt><dd>${text}</dd></div>`;

function summary(data) {
  const counts = data?.counts;
  if (!counts || ![counts.transactions, counts.review, counts.pending, counts.excluded].every(amountValid)
    || counts.transactions - counts.review - counts.pending - counts.excluded <= 0) return null;
  // No source-period completeness assertion exists for an aggregate. A computed gross zero can simply mean no captured rows of that type.
  const reported = (key) => amountValid(data[key]) && data[key] !== 0 ? data[key] : undefined;
  const cashObserved = data.inflowPaisa > 0 || data.outflowPaisa > 0;
  const spendingObserved = data.spendPaisa > 0 || data.refundPaisa > 0;
  return {
    earnedIncomePaisa: reported('earnedIncomePaisa'), spendPaisa: reported('spendPaisa'), refundPaisa: reported('refundPaisa'),
    netSpendPaisa: spendingObserved ? data.netSpendPaisa : reported('netSpendPaisa'),
    cashflowPaisa: cashObserved ? data.cashflowPaisa : undefined,
    inflowPaisa: cashObserved ? reported('inflowPaisa') : undefined, outflowPaisa: cashObserved ? reported('outflowPaisa') : undefined,
    reimbursementPaisa: reported('reimbursementPaisa'), internalTransferPaisa: reported('internalTransferPaisa'),
    cardSettlementPaisa: reported('cardSettlementPaisa'), otherIncomePaisa: reported('otherIncomePaisa'),
    investmentContributionPaisa: reported('investmentContributionPaisa'), investmentWithdrawalPaisa: reported('investmentWithdrawalPaisa'),
    loanDrawPaisa: reported('loanDrawPaisa'), loanRepaymentPaisa: reported('loanRepaymentPaisa'), categories: data.categories,
  };
}

const primaryViews = ['today', 'library', 'overview', 'position', 'evidence'];
const evidenceViews = ['evidence', 'transactions', 'review', 'reports', 'sources', 'income'];
const positionViews = ['position', 'accounts', 'investments', 'debts'];

function panel(title, body, link = '', extra = '') {
  return `<section class="surface ${extra}"><header class="section-heading"><h2>${title}</h2>${link}</header>${body}</section>`;
}

export function navigation(route) {
  const current = evidenceViews.includes(route.view) ? 'evidence' : positionViews.includes(route.view) ? 'position'
    : route.view === 'decisions' ? 'library' : route.view;
  return `<div class="nav-group">${primaryViews.map((name) => `<a href="${href(name, name === 'today' ? currentMonth() : route.month)}"${current === name ? ` aria-current="${route.view === name ? 'page' : 'true'}"` : ''}>${views[name].nav}</a>`).join('')}</div>`;
}

function evidenceNavigation(route) {
  const sections = [['evidence', 'Overview'], ['transactions', 'Transactions'], ['review', 'Review'], ['reports', 'Monthly report'], ['sources', 'Sources']];
  return `<nav class="ledger-links section-nav" aria-label="Evidence views">${sections.map(([view, title]) =>
    `<a class="ledger-link" href="${href(view, route.month)}"${view === route.view ? ' aria-current="page"' : ''}>${title}</a>`).join('')}</nav>`;
}

export function heading(route, monthly) {
  const view = views[route.view];
  const coverage = monthly?.coverage?.status;
  const historyScope = route.view === 'overview' && route.historyMode !== 'classified'
    ? `&measure=${route.historyMode}${route.historyAccount ? `&account=${route.historyAccount}` : ''}` : '';
  const periodLink = (offset) => `${href(route.view, monthFrom(route.month, offset))}${historyScope}${route.positionKind ? `&kind=${route.positionKind}` : ''}`;
  const latestMonth = currentMonth();
  const period=view.month?`<nav class="period" aria-label="${route.view === 'position' ? 'Ledger activity month' : 'Reporting period'}">
   ${monthValid(monthFrom(route.month,-1))?`<a class="period-arrow" aria-label="Previous month" href="${escape(periodLink(-1))}">‹</a>`:''}
   <strong class="period-title">${monthLabel(route.month)}</strong>
   ${route.month < latestMonth && monthValid(monthFrom(route.month,1))?`<a class="period-arrow" aria-label="Next month" href="${escape(periodLink(1))}">›</a>`:''}
  </nav>`:'';
  const returnScope = route.historyReturnMode ? `&measure=${route.historyReturnMode}` : '';
  const returnAccount = route.historyReturnAccount ? `&account=${route.historyReturnAccount}` : '';
  const back = route.historyThrough ? `<a class="text-link" href="${href('overview', route.historyThrough.slice(0, 7))}&through=${route.historyThrough}&bucket=${route.month}${returnScope}${returnAccount}">Back to history</a>` : '';
  const publicationBack = route.fromPublication ? `<a class="text-link" href="${href('library', route.month)}&doc=${route.fromPublication}">Back to publication</a>` : '';
  const reportBack = route.fromReport ? action('reports', route.month, 'Back to monthly report') : '';
  const returnLink = back || publicationBack || reportBack ? `<div class="scope-line">${back}${publicationBack}${reportBack}</div>` : '';
  const range = route.period ? `<div class="scope-line"><strong>${datesOf(route.period)} · Inclusive dates</strong></div>` : '';
  const monthCoverage = ['review', 'transactions'].includes(route.view) && coverage && !route.reference
    ? `<div class="scope-line">${route.period ? '<span>Calendar-month coverage</span>' : ''}${coveragePill(monthly.coverage)}<span>Ledger updated ${date(monthly.updatedAt, true)}</span></div>` : '';
  const hasEvidenceNav = evidenceViews.includes(route.view);
  return `<header class="page-heading"><div class="heading-main"><h1>${view.title}</h1></div>${route.reference ? '' : period}</header>${hasEvidenceNav ? evidenceNavigation(route) : ''}${returnLink}${range}${monthCoverage}`;
}

function spending(monthly, month) {
  const items = Object.entries(summary(monthly)?.categories ?? {}).filter(([, total]) => amountValid(total) && total > 0).sort((a, b) => b[1] - a[1]);
  if (!items.length) return empty('No category totals available.');
  return `<ul class="category-list">${items.map(([category, amount]) => `<li><a href="${categoryHref(category, month)}"><span>${escape(pretty(category))}</span><span class="number">${money(amount)}</span></a><meter min="0" max="${items[0][1]}" value="${amount}" aria-label="${escape(pretty(category))}" aria-valuetext="${money(amount)}"></meter></li>`).join('')}</ul>`;
}

function ledgerRows(list, options = {}) {
  if (!list.length) return empty(options.emptyTitle ?? 'No transactions returned for this month.', options.emptyCopy ?? '');
  return `<div class="ledger-head" aria-hidden="true"><span>${options.review ? 'Item' : 'Merchant or entry'}</span><span>Date</span><span>${options.review ? 'Review reason' : 'Category'}</span><span>Amount</span></div>
    <ul class="ledger">${list.map((row) => `<li><button type="button" class="ledger-row" data-entry="${escape(row.eventId ?? row.id)}">
      <span class="record-name"><strong>${row.merchant ? value(row.merchant) : kindLabel(row.kind)}</strong><small>${row.account ? value(row.account) : 'Account unavailable'}</small></span>
      <span class="record-date">${date(row.occurredOn)}</span>
      <span class="record-category">${options.review ? value(row.reason) : label(row.category ?? row.kind)}${row.status && row.status !== 'posted' && !options.review ? `<small>${label(row.status)}</small>` : ''}</span>
      <span class="record-amount number ${row.direction === 'credit' ? 'credit' : ''}">${signed(row.amountPaisa, row.direction)}</span>
    </button></li>`).join('')}</ul>`;
}

function coverageNote(monthly, month) {
  if (!monthly) return `<div class="callout"><p><strong>No monthly ledger projection returned.</strong> ${action('sources', month, 'Inspect sources')}</p></div>`;
  if (monthly.coverage?.inProgressCount > 0) return `<div class="callout"><p><strong>Intake in progress.</strong> Recorded totals can change as inputs are processed. ${action('sources', month, 'Inspect coverage')}</p></div>`;
  if (hasCoverage(monthly.coverage) && monthly.coverage.status === 'partial') return `<div class="callout"><p><strong>Partial coverage.</strong> Shown totals cover processed records. ${action('sources', month, 'Inspect coverage')}</p></div>`;
  if (hasCoverage(monthly.coverage) && monthly.coverage.status === 'observed') return '<div class="callout neutral"><p>Totals reflect source records observed for this month.</p></div>';
  return `<div class="callout"><p><strong>Source coverage unknown.</strong> ${action('sources', month, 'Inspect sources')}</p></div>`;
}

function recurring(result) {
  if (!result.ok) return error('Recurring items');
  if (!result.data.list.length) return empty('No recurring items have been identified.', 'Only recurrence supported by source records appears here.');
  const list = (records) => `<ul class="compact-list">${records.map((row) => `<li><div><strong>${row.merchant ? value(row.merchant) : label(row.kind)}</strong><small>${value(row.account)} · ${date(row.lastOccurredOn)}</small></div><div><strong class="number">${money(row.amountPaisa)}</strong><small>${row.status === 'possible' ? 'Possible subscription' : 'Mandate observed'}</small></div></li>`).join('')}</ul>`;
  const [visible, remaining] = [result.data.list.slice(0, 6), result.data.list.slice(6)];
  return list(visible) + (remaining.length ? `<details class="more-records"><summary>Show ${count(remaining.length)} more</summary>${list(remaining)}</details>` : '')
    + (result.data.more ? '<p class="muted">Showing the latest 100 records.</p>' : '');
}

function evidence(route, result) {
  const month = route.month;
  const monthly = result.month?.data;
  const review = monthly?.counts?.review;
  const reviewCopy = amountValid(review) && review >= 0
    ? `<p class="review-summary">${review > 0 ? `${count(review)} ${review === 1 ? 'entry needs' : 'entries need'} classification or review.` : 'No review entries counted in this projection.'}</p>`
    : '<p class="review-summary">Review count is unknown for this month.</p>';
  const total = monthly?.counts?.transactions;
  const transactions = amountValid(total) && total >= 0
    ? `${count(total)} captured ${total === 1 ? 'entry' : 'entries'} in the monthly projection.` : 'Open the ledger to inspect the entries returned for this month.';
  const updated = monthly?.updatedAt ? `<p class="muted following">Projection updated ${date(monthly.updatedAt, true)}.</p>` : '';
  return `<p class="decision-intro">Trace a figure to its entries, check what the sources cover, and see which movements are still under review.</p>
    ${result.month.ok ? coverageNote(monthly, month) : error('Monthly projection')}
    <div class="overview-grid">
      ${panel('Captured ledger', `<p>${transactions}</p>${updated}`, action('transactions', month, 'Browse transactions'))}
      ${panel('Review queue', reviewCopy, action('review', month, 'Inspect review items'))}
      ${panel('Monthly report', '<p>Read the published analysis, the ledger totals it used, and its cited evidence.</p>', action('reports', month, 'Open report'))}
      ${panel('Source coverage', '<p>Check statement periods, import status, and gaps in the recorded evidence.</p>', action('sources', month, 'Inspect sources'))}
    </div>
    ${panel('Recurring evidence', recurring(result.recurring))}`;
}

function ledgerFilter(route,filters){
 if(route.view!=='transactions')return '';
 const base = href('transactions', route.month);
 const keep = (route.period ? `&from=${route.period.from}&to=${route.period.to}` : '')
   + (route.historyThrough ? `&historyThrough=${route.historyThrough}` : '')
   + (route.historyReturnMode ? `&measure=${route.historyReturnMode}` : '')
   + (route.historyReturnAccount ? `&account=${route.historyReturnAccount}` : '')
   + (route.fromReport ? '&report=monthly' : '');
 const tabs=[['All',base+keep,!filters.spending&&!filters.cash&&!filters.cashOutflow&&!filters.cashInflow&&!filters.kind&&!filters.status&&!filters.category],
  ['Expenses',base+keep+'&scope=spending',filters.spending],['Income',base+keep+'&kind=earned_income&status=posted',filters.kind==='earned_income'],
  ['Posted cash',base+keep+'&scope=cash',filters.cash||filters.cashInflow||filters.cashOutflow],['Unclassified',base+keep+'&kind=unknown',filters.kind==='unknown']];
 return '<nav class="ledger-links" aria-label="Ledger views">'+tabs.map(([label,url,active])=>'<a class="ledger-link" href="'+escape(url)+'"'+(active?' aria-current="true"':'')+'>'+label+'</a>').join('')+'</nav>';
}

function transactionView(route, result, filters, pageState) {
  const review = route.view === 'review';
  if (!result.rows.ok) return panel(review ? 'Review queue' : 'Ledger', error(review ? 'Review queue' : 'Transactions'));
  const rows = result.rows.data;
  const effectiveCategory = (item) => filters.spending ? item.category || (item.kind === 'fee' ? 'fees' : 'uncategorized') : item.category;
  const list = rows.list.filter((item) => (!filters.category || effectiveCategory(item) === filters.category)
    && (!filters.kind || item.kind === filters.kind) && (!filters.status || item.status === filters.status)
    && (!filters.spending || (item.status === 'posted' && ['spend', 'fee'].includes(item.kind)))
    && (!filters.cash || (item.status === 'posted' && item.accountKind === 'cash'))
    && (!filters.cashOutflow || (item.status === 'posted' && item.accountKind === 'cash' && item.direction === 'debit'))
    && (!filters.cashInflow || (item.status === 'posted' && item.accountKind === 'cash' && item.direction === 'credit'))
    && (!review || item.status === 'open'));
  const context = review ? 'Open reviews' : 'Ledger entries';
  const labelCount = `${count(list.length)} shown from ${count(rows.list.length)} loaded ${review ? 'review records' : 'transactions'}.`;
  const next = rows.more ? `<button type="button" class="button" data-more${pageState.loading ? ' disabled' : ''}>${pageState.loading ? 'Loading…' : `Load ${PAGE_SIZE} more`}</button>` : '';
  const scope = filters.cashInflow ? 'Posted cash credits.' : filters.cashOutflow ? 'Posted cash debits.' : filters.cash ? 'Posted cash-account movements.'
    : filters.spending ? 'Posted expenses and fees.' : filters.kind ? `${kinds[filters.kind]}${filters.status === 'posted' ? ' · Posted' : ''}.` : '';
  const filterNote = filters.category || filters.kind || filters.status || filters.spending || filters.cash || filters.cashOutflow || filters.cashInflow ? ' Filters apply to loaded entries.' : '';
  const rowState = rows.more || rows.list.length ? 'No matches in the loaded entries.' : review ? 'No review records returned for this month.' : route.period ? 'No transactions returned for these dates.' : 'No transactions returned for this month.';
  return panel(context, `${ledgerFilter(route, filters)}<p class="result-count" role="status">${scope ? `${escape(scope)} ` : ''}${labelCount}${filterNote}</p>
    ${ledgerRows(list, { review, emptyTitle: rowState })}
    ${next ? `<div class="list-footer">${next}${pageState.error ? '<p role="alert">More entries could not load. Try again.</p>' : ''}</div>` : ''}`);
}

function incomeView(route, result) {
  if (!result.month.ok) return panel('Classified income', error('Income totals'));
  const month = result.month.data;
  const totals = summary(month);
  return `${coverageNote(month, route.month)}
    <dl class="metrics" aria-label="Monthly income in Indian rupees">
      <div class="metric earned"><dt>Earned income</dt><dd>${earnedIncomeLabel(month, totals?.earnedIncomePaisa)}</dd></div>
      <div class="metric"><dt>Reimbursements</dt><dd>${money(totals?.reimbursementPaisa)}</dd></div>
      <div class="metric"><dt>Interest</dt><dd>${money(totals?.otherIncomePaisa)}</dd></div>
    </dl>${panel('Earned income entries', '<p class="muted">Open the month ledger with the earned-income filter applied.</p>', `<a class="text-link" href="${href('transactions', route.month)}&kind=earned_income&status=posted">View entries ↗</a>`)}
    ${panel('Reimbursement entries', '<p class="muted">Reimbursements are shown separately from earned income.</p>', `<a class="text-link" href="${href('transactions', route.month)}&kind=reimbursement&status=posted">View entries ↗</a>`)}
    ${panel('Interest entries', '<p class="muted">Interest is shown separately from earned income.</p>', `<a class="text-link" href="${href('transactions', route.month)}&kind=interest&status=posted">View entries ↗</a>`)}`;
}

function analysisNarrative(month) {
  const validVersion = (analysis) => analysis?.month === month.month
    && [analysis.version, analysis.ledgerVersion, analysis.reportVersion].every((version) => amountValid(version) && version > 0);
  const published = month.monthlyAnalysis;
  const current = validVersion(published) && published.ledgerVersion === month.version
    && published.reportVersion === month.reconciliation?.reportVersion && ['balanced', 'repaired'].includes(month.reconciliation?.status);
  const prior = validVersion(month.lastPublishedAnalysis) ? month.lastPublishedAnalysis : validVersion(published) ? published : null;
  const analysis = current ? published : prior;
  if (!analysis) return empty('No analysis is available for this month.');
  const age = current ? '' : `<div class="callout"><p><strong>Outdated analysis.</strong> These findings describe ledger version ${count(analysis.ledgerVersion)} and have not been verified against the current ledger. Links to ledger entries may show later revisions.</p></div>`;
  const headline = typeof analysis.headline === 'string' && analysis.headline.trim() ? `<p class="report-headline">${escape(analysis.headline)}</p>` : '';
  const readable = (items) => (Array.isArray(items) ? items : []).filter((item) => typeof item?.text === 'string' && item.text.trim());
  const findingLinks = (finding) => {
    if (categories.includes(finding.category)) {
      return `<div class="history-links"><a class="text-link" href="${categoryHref(finding.category, month.month)}&report=monthly">View ${current ? '' : 'current '}${escape(pretty(finding.category).toLowerCase())} entries</a></div>`;
    }
    const citations = (Array.isArray(finding.eventRevisions) ? finding.eventRevisions : [])
      .filter((entry) => stableId(entry?.eventId) && amountValid(entry.revision) && entry.revision > 0);
    const links = citations.length ? citations : (Array.isArray(finding.eventIds) ? finding.eventIds : [])
      .filter(stableId).map((eventId) => ({ eventId }));
    const hrefBase = `${href('transactions', month.month)}&report=monthly`;
    return links.length ? `<div class="history-links">${links.map(({ eventId, revision }, index) =>
      `<a class="text-link" href="${hrefBase}&entry=${eventId}${revision ? `&revision=${revision}` : ''}">Ledger entry ${index + 1}</a>`).join('')}</div>` : '';
  };
  const findings = readable(analysis.findings).map((finding) => `<li>${escape(finding.text)}${findingLinks(finding)}</li>`).join('');
  const gaps = readable(analysis.coverage?.gaps).map((gap) => `<li>${escape(gap.text)}</li>`).join('');
  const windows = (Array.isArray(analysis.sourceWindows) ? analysis.sourceWindows : []).filter((source) => stableId(source?.id));
  if (!headline && !findings && !gaps) return empty('The published analysis has no readable findings.');
  return `<div class="report-narrative">
    ${age}
    ${headline}
    <p class="muted">Published ${date(analysis.publishedAt, true)} · Analysis v${count(analysis.version)} · Reconciled report v${count(analysis.reportVersion)} · Ledger v${count(analysis.ledgerVersion)}</p>
    ${findings ? `<h3>Findings</h3><ul>${findings}</ul>` : ''}
    ${gaps ? `<h3>Coverage and gaps</h3><ul>${gaps}</ul>` : ''}
    ${windows.length ? `<h3>Cited source windows</h3><ul>${windows.map((source) =>
      `<li><a class="text-link" href="${href('sources', month.month)}&report=monthly&window=${source.id}">${label(source.sourceType)} · ${source.period ? datesOf(source.period) : 'Dates unavailable'}</a>
        <span class="muted"> · ${label(source.status)}</span></li>`).join('')}</ul>` : ''}
  </div>`;
}

function reports(route, result) {
  if (!result.month.ok) return panel('Monthly report', error('Monthly report'));
  const month = result.month.data;
  if (!month) return panel('Monthly report', empty('No report record for this month.', 'Open source coverage or browse another month.'), action('sources', route.month, 'Inspect coverage'));
  const totals = summary(month);
  const reconciliation = month.reconciliation?.reportVersion === month.version ? month.reconciliation : null;
  const report = `<dl class="facts">
    ${field('Earned income', earnedIncomeLabel(month, totals?.earnedIncomePaisa))}${field('Gross classified spending', money(totals?.spendPaisa))}
    ${field('Refunds', money(totals?.refundPaisa))}${field('Net classified spending', money(totals?.netSpendPaisa))}
    ${field('Reimbursements', money(totals?.reimbursementPaisa))}${field('Interest', money(totals?.otherIncomePaisa))}
    ${field('Internal transfers', money(totals?.internalTransferPaisa))}${field('Card settlements', money(totals?.cardSettlementPaisa))}
    ${field('Investment contributions', money(totals?.investmentContributionPaisa))}${field('Investment withdrawals', money(totals?.investmentWithdrawalPaisa))}
    ${field('Loan proceeds', money(totals?.loanDrawPaisa))}${field('Loan repayments', money(totals?.loanRepaymentPaisa))}
  </dl>`;
  const cash = `<dl class="facts">
    ${field('Posted credits', money(totals?.inflowPaisa))}${field('Posted debits', money(totals?.outflowPaisa))}
    ${field('Net posted movement', money(totals?.cashflowPaisa))}
  </dl><p class="muted following">Cash-account entries already posted in the captured ledger. Statement movements can include transfers and entries still under review.</p>`;
  const statementLink = `<a class="text-link" href="${href('overview', route.month)}&measure=statements&bucket=${route.month}">View bank statement movements</a>`;
  return `${coverageNote(month, route.month)}
    ${route.fromPublication ? '<p class="muted following">This is the current monthly ledger report for the cited month.</p>' : ''}
    ${panel('Monthly analysis', analysisNarrative(month), action('sources', route.month, 'Inspect coverage'))}
    ${panel('Classified ledger activity', report, action('transactions', route.month, 'Inspect entries'))}
    ${panel('Posted cash-account movements', cash, statementLink)}
    ${panel('Classified spending by category', spending(month, route.month))}
    ${panel('Ledger totals check', reconciliation ? `<dl class="facts">${field('Status', label(reconciliation.status))}${field('Checked at', date(reconciliation.reconciledAt, true))}${field('Version', value(reconciliation.reportVersion))}${field('Transaction count', count(reconciliation.transactionCount))}</dl><p class="muted following">This check compares report totals with captured ledger entries. See Sources for statement and import coverage.</p>` : empty('No current totals check is available.'), action('sources', route.month, 'View coverage'))}`;
}

function datesOf(period) {
  return period?.from && period?.to ? `${date(period.from)} – ${date(period.to)}` : 'Unavailable';
}

function sourceWindowList(windows) {
  return `<ul class="source-list">${windows.map((source) =>
    `<li><div class="source-title"><strong>${value(source.source)}</strong>${pill(source.status)}</div>
    <dl class="facts source-facts">${field('Source type', label(source.sourceType))}${field('Source period', source.period ? datesOf(source.period) : 'Dates unavailable')}
    ${field('Received', date(source.receivedAt, true))}</dl></li>`).join('')}</ul>`;
}

function reportReference(route, result) {
  const source = route.view === 'sources';
  const title = source ? 'Cited source window' : 'Cited ledger entry';
  if (!result.reference.ok) return panel(title, error(title));
  const record = result.reference.data;
  const belongs = source ? record && (!route.fromReport || (Array.isArray(record.months) && record.months.includes(route.month))) : record?.month === route.month;
  if (!belongs) return panel(title, empty('The cited record is unavailable for this month.'));
  if (source) return panel(title, sourceWindowList([record]));
  const revision = route.referenceRevision;
  const caption = revision ? `<p class="muted following">Cited ledger revision ${count(revision)}.${revision !== record.revision ? ` Showing the current revision ${count(record.revision)}.` : ''}</p>` : '';
  return panel(title, ledgerRows([record]) + caption);
}

function sources(route, result) {
  const coverage = result.month.data?.coverage;
  const monthEvidence = coverage ? `<dl class="facts">${field('Coverage', coveragePill(coverage))}${field('Input records', count(coverage.inputCount))}${field('In progress', count(coverage.inProgressCount))}${field('Partial', count(coverage.partialCount))}${field('Locked', count(coverage.lockedCount))}${field('Unparsed', count(coverage.unparsedCount))}${field('Excluded', count(coverage.excludedCount))}</dl>` : empty('No coverage record exists for this month.');
  const sourceRows = result.sources.ok ? result.sources.data.list : [];
  const sourceEvidence = !result.sources.ok ? error('Source status') : sourceRows.length ? `<ul class="source-list">${sourceRows.map((source) => `<li><div class="source-title"><strong>${value(source.source)}</strong>${pill(source.status, source.status === 'observed' ? 'Latest processed' : undefined)}</div><dl class="facts source-facts">${field('Source type', label(source.sourceType))}${field('Last received', date(source.lastReceivedAt, true))}${field('Last processed', date(source.lastProcessedAt, true))}${field('Last observed period', datesOf(source.lastObservedPeriod))}${field('Source records', count(source.inputCount))}${field('Locked', count(source.lockedCount))}${field('Unparsed', count(source.unparsedCount))}${field('Excluded', count(source.excludedCount))}${field('Partial', count(source.partialCount))}</dl></li>`).join('')}</ul>` : empty('No source status has been recorded.');
  const monthWindows = [...(result.windows.data?.list ?? [])].sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  const dated = (source) => Boolean(source.period?.from && source.period?.to);
  const windows = route.period ? monthWindows.filter((source) => dated(source)
    && source.period.from <= route.period.to && source.period.to >= route.period.from) : monthWindows;
  const undated = route.period ? monthWindows.filter((source) => !dated(source)) : [];
  const noWindows = route.period ? 'No recorded source windows overlap these dates in the records loaded.' : 'No source period records were returned for this month.';
  const windowEvidence = !result.windows.ok ? error('Source windows') : windows.length ? sourceWindowList(windows) : empty(noWindows);
  const historic = '<p class="muted">The historical import requested 22 November 2023 through 22 November 2026 inclusive, in India local time. It spans 37 calendar months, with both boundary months partial by date.</p>';
  const scan = result.scan.data?.lastScan;
  const scanEvidence = !result.scan.ok ? error('Automation status') : scan ? `<dl class="facts">
    ${field('Latest run', label(scan.status))}${field('Mode', label(scan.mode))}${field('Scan period', datesOf(scan.window))}${field('Run recorded', date(scan.processedAt, true))}
    ${field('Scan cursor', date(result.scan.data.cursor))}${field('Processed', count(scan.processed))}${field('Locked', count(scan.locked))}${field('Unparsed', count(scan.unparsed))}${field('Excluded', count(scan.excluded))}
    ${scan.reason ? field('Run note', label(scan.reason)) : ''}</dl>` : empty('No Gmail scan status is available.');
  return `${panel(monthLabel(route.month) + ' coverage', result.month.ok ? monthEvidence : error('Coverage'), action('reports', route.month, 'Monthly report'))}
    ${panel('Historical import period', historic)}${panel('Gmail automation health', scanEvidence)}
    ${panel('Source status', sourceEvidence + (result.sources.data?.more ? '<p class="muted">Showing a bounded selection of 100 sources.</p>' : ''))}
    ${panel(route.period ? 'Source windows overlapping these dates' : 'Source windows for this month', windowEvidence + (result.windows.data?.more ? '<p class="muted">Showing a bounded selection of 100 source windows for the calendar month.</p>' : ''))}
    ${undated.length ? panel('Month-linked sources with dates unavailable', sourceWindowList(undated)) : ''}`;
}

export function render(route, result, filters, pageState) {
  if (route.reference) return reportReference(route, result);
  switch (route.view) {
    case 'overview': return panel('History by month', historyView(route, result), '', 'history-panel');
    case 'evidence': return evidence(route, result);
    case 'transactions':
    case 'review': return transactionView(route, result, filters, pageState);
    case 'income': return incomeView(route, result);
    case 'reports': return reports(route, result);
    case 'sources': return sources(route, result);
  }
}

export function details(row){
 return `<div class="dialog-heading"><div><h2 id="detail-heading">${row.merchant?value(row.merchant):kindLabel(row.kind)}</h2><p class="detail-amount number">${signed(row.amountPaisa,row.direction)}</p></div>
 <button type="button" class="button" data-close-dialog>Close</button></div>
 <dl class="facts dialog-facts">
 ${field('Date',date(row.occurredOn))}${field('Account',value(row.account))}
 ${field('Type',kindLabel(row.kind))}${field('Category',label(row.category))}
 ${field('Status',label(row.status))}${row.reviewReason?field('Review reason',label(row.reviewReason)):''}
 ${field('Source',value(row.source))}${field('Source type',label(row.sourceType))}
 ${field('Ledger revision',count(row.revision))}${field('Updated at',date(row.updatedAt,true))}
 </dl><p class="muted following">Read-only evidence. Any correction is handled here in the Finance project and verified through PTI MCP.</p>`;
}
