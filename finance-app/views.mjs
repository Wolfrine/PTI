import { PAGE_SIZE } from './finance-data.mjs';
import { historyView } from './history.mjs';
import { amountValid, categories, count, date, escape, href, kinds, money, monthFrom, monthLabel, monthValid, pretty, signed, stableId, views } from './values.mjs';

const statusLabel = {
  observed: 'Observed coverage', partial: 'Partial coverage', balanced: 'Ledger totals checked', repaired: 'Ledger totals repaired',
  open: 'Open', resolved: 'Resolved', posted: 'Posted', pending: 'Pending', review: 'Needs review', excluded: 'Excluded',
};
const value = (input) => escape(input === '' || input == null ? 'Unavailable' : input);
const label = (input) => escape(statusLabel[input] ?? pretty(input));
const kindLabel = (kind) => escape(kinds[kind] ?? pretty(kind));
const statusTone = (status) => ['observed', 'balanced', 'repaired'].includes(status) ? 'ok' : ['partial', 'review', 'open', 'pending'].includes(status) ? 'attention' : '';
const pill = (status, text) => `<span class="pill ${statusTone(status)}">${text ?? label(status)}</span>`;
const action = (view, month, text) => `<a class="text-link" href="${href(view, month)}">${text} <span aria-hidden="true">↗</span></a>`;
const categoryHref = (category, month) => `${href('transactions', month)}&category=${encodeURIComponent(category)}&status=posted&scope=spending`;
const empty = (title, copy = '') => `<div class="empty"><p><strong>${title}</strong></p>${copy ? `<p>${copy}</p>` : ''}</div>`;
const error = (section) => `<div class="empty" role="alert"><p><strong>${section} could not load.</strong></p><button type="button" class="button" data-refresh>Retry</button></div>`;
const field = (name, text) => `<div><dt>${name}</dt><dd>${text}</dd></div>`;
const optionList = (items, current = '') => items.map(([key, name]) => `<option value="${escape(key)}"${key === current ? ' selected' : ''}>${escape(name)}</option>`).join('');

function summary(data) {
  const counts = data?.counts;
  if (!data?.coverage?.status || !counts || !(counts.transactions - counts.review - counts.pending - counts.excluded > 0)) return null;
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

function panel(title, body, link = '', extra = '') {
  return `<section class="surface ${extra}"><header class="section-heading"><h2>${title}</h2>${link}</header>${body}</section>`;
}

export function navigation(route) {
  const groups = [
    ['overview', 'transactions', 'review'],
    ['accounts', 'income', 'investments', 'debts'],
    ['reports', 'sources'],
  ];
  return groups.map((group) => `<div class="nav-group">${group.map((name) => `<a href="${href(name, route.month)}"${route.view === name ? ' aria-current="page"' : ''}>${views[name].nav}</a>`).join('')}</div>`).join('');
}

export function heading(route, monthly) {
  const view = views[route.view];
  const coverage = monthly?.coverage?.status;
  const period = view.month ? `<form class="period" id="period-form">
    ${monthValid(monthFrom(route.month, -1)) ? `<a class="period-arrow" aria-label="Previous month" href="${href(route.view, monthFrom(route.month, -1))}">‹</a>` : ''}
    <label for="period-month" class="sr-only">Reporting month</label>
    <input id="period-month" type="month" name="month" value="${route.month}" min="2000-01" max="2099-12" required>
    <button type="submit" class="button">Go</button>
    ${monthValid(monthFrom(route.month, 1)) ? `<a class="period-arrow" aria-label="Next month" href="${href(route.view, monthFrom(route.month, 1))}">›</a>` : ''}
  </form>` : '';
  const back = route.historyThrough ? `<a class="text-link" href="${href('overview', route.historyThrough.slice(0, 7))}&through=${route.historyThrough}&bucket=${route.month}">Back to history</a>` : '';
  const returnLink = route.fromReport ? `<div class="scope-line">${action('reports', route.month, 'Back to monthly report')}</div>` : '';
  const range = route.period ? `<div class="scope-line"><strong>${datesOf(route.period)} · Inclusive dates</strong>${back}</div>` : '';
  const sourceLink = route.view === 'sources' || route.period ? '' : action('sources', route.month, 'View coverage');
  const monthCoverage = view.month && coverage ? `<div class="scope-line">${route.period ? '<span>Calendar month</span>' : ''}${pill(coverage)}<span>Ledger updated ${date(monthly.updatedAt, true)}</span>${sourceLink}</div>` : '';
  return `<header class="page-heading"><div class="heading-main"><h1>${view.title}</h1>${view.month ? `<span class="period-label">${monthLabel(route.month)}</span>` : ''}</div>${period}</header>${returnLink}${range}${monthCoverage}`;
}

function metrics(monthly) {
  const totals = summary(monthly);
  return `<dl class="metrics" aria-label="Monthly totals in Indian rupees">
    <div class="metric earned"><dt>Earned income</dt><dd>${money(totals?.earnedIncomePaisa)}</dd></div>
    <div class="metric spent"><dt>Net expenses</dt><dd>${money(totals?.netSpendPaisa)}</dd></div>
    <div class="metric net"><dt>Net cash flow</dt><dd>${money(totals?.cashflowPaisa)}</dd></div>
  </dl>`;
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
  if (!monthly) return `<div class="callout"><p><strong>Monthly coverage is unavailable.</strong> ${action('sources', month, 'Inspect sources')}</p></div>`;
  if (monthly.coverage?.status === 'partial') return `<div class="callout"><p><strong>Partial coverage.</strong> Shown totals cover processed records. ${action('sources', month, 'Inspect coverage')}</p></div>`;
  if (monthly.coverage?.status === 'observed') return '<div class="callout neutral"><p>Totals reflect source records observed for this month.</p></div>';
  return '<div class="callout"><p>Coverage status is unavailable for this report.</p></div>';
}

function recurring(result) {
  if (!result.ok) return error('Recurring items');
  if (!result.data.list.length) return empty('No recurring items have been identified.', 'Only recurrence supported by source records appears here.');
  const list = (records) => `<ul class="compact-list">${records.map((row) => `<li><div><strong>${row.merchant ? value(row.merchant) : label(row.kind)}</strong><small>${value(row.account)} · ${date(row.lastOccurredOn)}</small></div><div><strong class="number">${money(row.amountPaisa)}</strong><small>${row.status === 'possible' ? 'Possible subscription' : 'Mandate observed'}</small></div></li>`).join('')}</ul>`;
  const [visible, remaining] = [result.data.list.slice(0, 6), result.data.list.slice(6)];
  return list(visible) + (remaining.length ? `<details class="more-records"><summary>Show ${count(remaining.length)} more</summary>${list(remaining)}</details>` : '')
    + (result.data.more ? '<p class="muted">Showing the latest 100 records.</p>' : '');
}

function overview(route, result) {
  const month = route.month;
  const monthly = result.month.data;
  const review = monthly?.counts?.review;
  const reviewCopy = Number.isSafeInteger(review) ? `${count(review)} ${review === 1 ? 'item' : 'items'} to review` : 'Review count unavailable';
  const recent = result.rows.data?.list.filter((row) => row.status === 'posted').slice(0, 6);
  const recentBody = result.rows.ok ? ledgerRows(recent, { emptyTitle: 'No posted entries among the transactions loaded for this overview.' }) : error('Transactions');
  return `${result.month.ok ? coverageNote(monthly, month) : error('Monthly totals')}${metrics(monthly)}
    ${panel('Income and cash flow history', historyView(route, result), action('reports', month, 'Monthly report'), 'history-panel')}
    <div class="overview-grid">
      ${panel('Recent posted transactions', recentBody, action('transactions', month, 'All transactions'))}
      ${panel('Spending by category', spending(monthly, month), '', 'spend-panel')}
    </div>
    <div class="overview-grid followups">${panel('Recurring items', recurring(result.recurring))}${panel('Review queue', `<p class="review-summary">${reviewCopy}</p>`, action('review', month, 'Open review'))}</div>`;
}

function ledgerFilter(route, filters) {
  if (route.view !== 'transactions') return '';
  const categoryOptions = [['', 'All categories'], ...categories.map((category) => [category, pretty(category)])];
  const kindOptions = [['', 'All types'], ...Object.entries(kinds)];
  const scope = filters.spending ? 'spending' : filters.cashOutflow ? 'cash-outflow' : filters.cash ? 'cash' : '';
  const scopeDescription = filters.spending ? 'Showing expenses and fees.' : filters.cashOutflow ? 'Showing posted cash account debits.' : filters.cash ? 'Showing posted cash account movements.' : '';
  const scopeFields = route.period ? `<input name="from" type="hidden" value="${route.period.from}"><input name="to" type="hidden" value="${route.period.to}">` : '';
  const historyField = route.historyThrough ? `<input name="historyThrough" type="hidden" value="${route.historyThrough}">` : '';
  const reportField = route.fromReport ? '<input name="report" type="hidden" value="monthly">' : '';
  const clearHref = href('transactions', route.month) + (route.fromReport ? '&report=monthly' : '')
    + (route.period ? `&from=${route.period.from}&to=${route.period.to}` : '')
    + (route.historyThrough ? `&historyThrough=${route.historyThrough}` : '');
  return `${scopeDescription ? `<p class="muted">${scopeDescription}</p>` : ''}<form id="ledger-filter" class="ledger-filter">${scopeFields}${historyField}${reportField}${scope ? `<input name="scope" type="hidden" value="${scope}">` : ''}<label>Category<select name="category">${optionList(categoryOptions, filters.category)}</select></label>
    <label>Type<select name="kind">${optionList(kindOptions, filters.kind)}</select></label>
    <label>Status<select name="status">${optionList([['', 'All statuses'], ['posted', 'Posted'], ['pending', 'Pending'], ['review', 'Needs review'], ['excluded', 'Excluded']], filters.status)}</select></label>
    <div class="filter-actions"><button class="button" type="submit">Apply</button>${filters.category || filters.kind || filters.status || scope ? `<a class="text-link" href="${clearHref}">Clear filters</a>` : ''}</div></form>`;
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
    && (!review || item.status === 'open'));
  const context = review ? 'Open reviews' : 'Ledger entries';
  const labelCount = `${count(list.length)} shown from ${count(rows.list.length)} loaded ${review ? 'review records' : 'transactions'}.`;
  const next = rows.more ? `<button type="button" class="button" data-more${pageState.loading ? ' disabled' : ''}>${pageState.loading ? 'Loading…' : `Load ${PAGE_SIZE} more`}</button>` : '';
  const filterNote = filters.category || filters.kind || filters.status || filters.spending || filters.cash || filters.cashOutflow ? ' Filters apply to loaded entries.' : '';
  const rowState = rows.more || rows.list.length ? 'No matches in the loaded entries.' : review ? 'No review records returned for this month.' : route.period ? 'No transactions returned for these dates.' : 'No transactions returned for this month.';
  return panel(context, `${ledgerFilter(route, filters)}<p class="result-count" role="status">${labelCount}${filterNote}</p>
    ${ledgerRows(list, { review, emptyTitle: rowState })}
    ${next ? `<div class="list-footer">${next}${pageState.error ? '<p role="alert">More entries could not load. Try again.</p>' : ''}</div>` : ''}`);
}

function balances(result, kind) {
  if (!result.ok) return error('Balance snapshots');
  const rows = result.data.list.filter((row) => !kind || row.kind === kind);
  if (!rows.length) return empty('No balance snapshots are available.', 'Balances appear when a source reports them.');
  return `<ul class="compact-list snapshots">${rows.map((row) => `<li><div><strong>${value(row.account)}</strong><small>${label(row.basis)} · ${value(row.source)}</small></div><div><strong class="number">${money(row.amountPaisa)}</strong><small>As of ${date(row.asOf)}</small></div></li>`).join('')}</ul>${result.data.more ? '<p class="muted">Showing the first 100 source records.</p>' : ''}`;
}

function incomeView(route, result) {
  const month = result.month.data;
  const totals = summary(month);
  return `${result.month.ok ? coverageNote(month, route.month) : error('Income totals')}
    <dl class="metrics" aria-label="Monthly income in Indian rupees">
      <div class="metric earned"><dt>Earned income</dt><dd>${money(totals?.earnedIncomePaisa)}</dd></div>
      <div class="metric"><dt>Reimbursements</dt><dd>${money(totals?.reimbursementPaisa)}</dd></div>
      <div class="metric"><dt>Interest</dt><dd>${money(totals?.otherIncomePaisa)}</dd></div>
    </dl>${panel('Earned income entries', '<p class="muted">Open the month ledger with the earned-income filter applied.</p>', `<a class="text-link" href="${href('transactions', route.month)}&kind=earned_income&status=posted">View entries ↗</a>`)}
    ${panel('Reimbursement entries', '<p class="muted">Reimbursements are shown separately from earned income.</p>', `<a class="text-link" href="${href('transactions', route.month)}&kind=reimbursement&status=posted">View entries ↗</a>`)}
    ${panel('Interest entries', '<p class="muted">Interest is shown separately from earned income.</p>', `<a class="text-link" href="${href('transactions', route.month)}&kind=interest&status=posted">View entries ↗</a>`)}`;
}

function analysisNarrative(month) {
  const analysis = month?.monthlyAnalysis;
  if (!analysis) return empty('No analysis has been published for this month.');
  if (analysis.month !== month.month || !amountValid(analysis.ledgerVersion) || !amountValid(analysis.reportVersion)
    || analysis.ledgerVersion !== month.version || analysis.reportVersion !== month.reconciliation?.reportVersion) {
    return empty('Analysis is awaiting the current ledger version.');
  }
  const headline = typeof analysis.headline === 'string' && analysis.headline.trim() ? `<p class="report-headline">${escape(analysis.headline)}</p>` : '';
  const readable = (items) => (Array.isArray(items) ? items : []).filter((item) => typeof item?.text === 'string' && item.text.trim());
  const findingLinks = (finding) => {
    if (categories.includes(finding.category)) {
      return `<div class="history-links"><a class="text-link" href="${categoryHref(finding.category, month.month)}&report=monthly">View ${escape(pretty(finding.category).toLowerCase())} entries</a></div>`;
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
  const month = result.month.data;
  const totals = summary(month);
  const reconciliation = month?.reconciliation;
  const report = `<dl class="facts">
    ${field('Earned income', money(totals?.earnedIncomePaisa))}${field('Gross expenses', money(totals?.spendPaisa))}
    ${field('Refunds', money(totals?.refundPaisa))}${field('Net expenses', money(totals?.netSpendPaisa))}
    ${field('Cash inflow', money(totals?.inflowPaisa))}${field('Cash outflow', money(totals?.outflowPaisa))}
    ${field('Net cash flow', money(totals?.cashflowPaisa))}${field('Reimbursements', money(totals?.reimbursementPaisa))}
    ${field('Internal transfers', money(totals?.internalTransferPaisa))}${field('Card settlements', money(totals?.cardSettlementPaisa))}
    ${field('Investment contributions', money(totals?.investmentContributionPaisa))}${field('Investment withdrawals', money(totals?.investmentWithdrawalPaisa))}
    ${field('Loan proceeds', money(totals?.loanDrawPaisa))}${field('Loan repayments', money(totals?.loanRepaymentPaisa))}
  </dl>`;
  return `${result.month.ok ? coverageNote(month, route.month) : error('Monthly report')}
    ${panel('Monthly analysis', result.month.ok ? analysisNarrative(month) : error('Monthly analysis'), action('sources', route.month, 'Inspect coverage'))}
    ${panel('Income and expenses', report, action('transactions', route.month, 'Inspect entries'))}
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
  const belongs = source ? Array.isArray(record?.months) && record.months.includes(route.month) : record?.month === route.month;
  if (!belongs) return panel(title, empty('The cited record is unavailable for this month.'));
  if (source) return panel(title, sourceWindowList([record]));
  const revision = route.referenceRevision;
  const caption = revision ? `<p class="muted following">Cited ledger revision ${count(revision)}.${revision !== record.revision ? ` Showing the current revision ${count(record.revision)}.` : ''}</p>` : '';
  return panel(title, ledgerRows([record]) + caption);
}

function sources(route, result) {
  const coverage = result.month.data?.coverage;
  const monthEvidence = coverage ? `<dl class="facts">${field('Coverage', pill(coverage.status))}${field('Input records', count(coverage.inputCount))}${field('In progress', count(coverage.inProgressCount))}${field('Partial', count(coverage.partialCount))}${field('Locked', count(coverage.lockedCount))}${field('Unparsed', count(coverage.unparsedCount))}${field('Excluded', count(coverage.excludedCount))}</dl>` : empty('No coverage record exists for this month.');
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
    case 'overview': return overview(route, result);
    case 'transactions':
    case 'review': return transactionView(route, result, filters, pageState);
    case 'income': return incomeView(route, result);
    case 'accounts': return panel('Balance snapshots', balances(result.balances));
    case 'investments': return panel('Investment snapshots', balances(result.balances, 'investment'), `<a class="text-link" href="${href('transactions', route.month)}&kind=investment_contribution&status=posted">Contributions ↗</a>`);
    case 'debts': return panel('Debt snapshots', balances(result.balances, 'debt'), `<a class="text-link" href="${href('transactions', route.month)}&kind=loan_repayment&status=posted">Loan repayments ↗</a>`);
    case 'reports': return reports(route, result);
    case 'sources': return sources(route, result);
  }
}

export function details(row, editable) {
  const creditKinds = ['earned_income', 'refund', 'reimbursement', 'investment_withdrawal', 'interest', 'loan_draw'];
  const debitKinds = ['spend', 'investment_contribution', 'fee', 'loan_repayment'];
  const forbidden = row.direction === 'credit' ? debitKinds : creditKinds;
  const classifications = Object.entries(kinds).filter(([key]) => key === row.kind
    || (!forbidden.includes(key) && (!key.startsWith('loan_') || row.accountKind === 'cash')));
  return `<div class="dialog-heading"><div><h2 id="detail-heading">${row.merchant ? value(row.merchant) : kindLabel(row.kind)}</h2><p class="detail-amount number">${signed(row.amountPaisa, row.direction)}</p></div><form method="dialog"><button class="button" type="submit">Close</button></form></div>
    <dl class="facts dialog-facts">${field('Date', date(row.occurredOn))}${field('Account', value(row.account))}${field('Type', kindLabel(row.kind))}${field('Category', label(row.category))}${field('Status', label(row.status))}${row.reviewReason ? field('Review reason', label(row.reviewReason)) : ''}${field('Source', value(row.source))}${field('Source type', label(row.sourceType))}${field('Ledger revision', count(row.revision))}${field('Updated at', date(row.updatedAt, true))}</dl>
    ${editable ? `<form id="correction-form" class="correction-form"><h3>Correct this entry</h3>
      <label>Classification<select name="kind">${optionList(classifications, row.kind)}</select></label>
      <label>Category<select name="category">${optionList([['', 'Keep current category'], ...categories.map((category) => [category, pretty(category)])], row.category)}</select></label>
      <label>Decision<select name="status">${optionList([['posted', 'Post as classified'], ['excluded', 'Exclude from ledger totals']], row.status === 'excluded' ? 'excluded' : 'posted')}</select></label>
      <label>Reason<textarea name="reason" required maxlength="100" rows="2" aria-describedby="correction-help"></textarea></label>
      <p class="muted" id="correction-help">Use a short reason without account numbers, email addresses or links.</p>
      <button class="button primary" type="submit">Save correction</button><p class="form-message" role="status"></p>
    </form>` : ''}`;
}
