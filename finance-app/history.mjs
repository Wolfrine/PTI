import { amountValid, calendarPeriod, date, href, money, monthLabel, monthValid, signed } from './values.mjs';

const channels = [
  { key: 'earned', title: 'Earned income', filter: '&kind=earned_income' },
  { key: 'outflow', title: 'Cash outflow', filter: '&scope=cash-outflow' },
  { key: 'net', title: 'Net cash flow', filter: '&scope=cash' },
];

const gross = (value) => amountValid(value) && value > 0 ? value : undefined;
const net = (value, credits, debits) => (gross(credits) || gross(debits)) && amountValid(value) ? value : undefined;
const signedPaisa = (value) => value === 0 ? money(0) : signed(value, value < 0 ? 'debit' : 'credit');

function projectedAmounts(month) {
  const counts = month?.counts;
  if (!counts || !(counts.transactions - counts.review - counts.pending - counts.excluded > 0)) return {};
  return {
    earned: gross(month.earnedIncomePaisa),
    outflow: gross(month.outflowPaisa) ? -month.outflowPaisa : undefined,
    net: net(month.cashflowPaisa, month.inflowPaisa, month.outflowPaisa),
  };
}

function clippedAmounts(entries) {
  let earned = 0;
  let debits = 0;
  let credits = 0;
  for (const entry of entries) {
    if (entry.status !== 'posted' || !gross(entry.amountPaisa)) continue;
    if (entry.kind === 'earned_income') earned += entry.amountPaisa;
    if (entry.accountKind === 'cash') {
      if (entry.direction === 'credit') credits += entry.amountPaisa;
      if (entry.direction === 'debit') debits += entry.amountPaisa;
    }
  }
  return {
    earned: gross(earned),
    outflow: gross(debits) ? -debits : undefined,
    net: amountValid(credits) && amountValid(debits) ? net(credits - debits, credits, debits) : undefined,
  };
}

function coverageStatus(coverage) {
  if (coverage?.inProgressCount > 0) return { label: 'Intake in progress', tone: 'attention' };
  if (coverage?.inputCount > 0 && coverage.status === 'partial') return { label: 'Partial source coverage', tone: 'attention' };
  if (coverage?.inputCount > 0 && coverage.status === 'observed') return { label: 'Source records observed', tone: 'ok' };
  return { label: 'Source coverage unknown', tone: '' };
}

export function historyRows(period, result) {
  const months = new Map(result.history.data.map((entry) => [entry.id, entry]));
  return period.buckets.map((bucket) => {
    const month = months.get(bucket.month);
    const edge = result[`edge:${bucket.month}`];
    let amounts = projectedAmounts(month);
    let detail = !month ? 'No monthly ledger or coverage record was returned.' : '';
    if (bucket.clipped) {
      amounts = edge?.ok && !edge.data.more ? clippedAmounts(edge.data.list) : {};
      if (!edge?.ok) detail = 'The ledger read for these dates failed.';
      else if (edge.data.more) detail = 'This date span exceeds the bounded chart read. Open the posted ledger to browse it.';
      else if (!edge.data.list.some((entry) => entry.status === 'posted')) detail = 'No posted ledger entries were returned for these dates. Coverage is recorded for the calendar month.';
      else detail = 'Amounts come from posted ledger entries within these dates. Coverage is recorded for the calendar month.';
    }
    const observed = channels.some(({ key }) => amountValid(amounts[key]));
    return { ...bucket, ...coverageStatus(month?.coverage), amounts, observed, detail };
  });
}

const dateSpan = (row) => `${date(row.from)} – ${date(row.to)}`;

const bucketScope = (row, through) => `&from=${row.from}&to=${row.to}&historyThrough=${through}`;

function bucketLinks(row, through) {
  if (!monthValid(row.month)) return '';
  const scope = bucketScope(row, through);
  return `<nav class="history-links" aria-label="${monthLabel(row.month)} records">
    <a class="text-link" href="${href('transactions', row.month)}${scope}&status=posted">Posted ledger</a>
    <a class="text-link" href="${href('sources', row.month)}${scope}">Source coverage</a>
    <a class="text-link" href="${href('overview', row.month)}">Monthly overview</a>
  </nav>`;
}

function values(row, through, linkAmounts = false) {
  const ledger = `${href('transactions', row.month)}${bucketScope(row, through)}&status=posted`;
  return `<dl class="history-amounts">${channels.map(({ key, title, filter }) => {
    const value = row.amounts[key];
    const amount = signedPaisa(value);
    const target = linkAmounts && monthValid(row.month) && amountValid(value);
    return `<div><dt>${title}</dt><dd class="${key} number">${target
      ? `<a class="history-value-link" href="${ledger}${filter}" aria-label="${title}, ${amount}. See entries">${amount}</a>` : amount}</dd></div>`;
  }).join('')}</dl>`;
}

function bucketEvidence(row, heading) {
  return `<div class="history-bucket-title">
    ${heading ? `<h3>${monthLabel(row.month)}</h3>` : `<strong>${monthLabel(row.month)}</strong>`}
    <p>${dateSpan(row)}${row.clipped ? ' · Partial month dates' : ''}</p>
    <span class="pill ${row.tone}">${row.clipped && row.tone ? 'Calendar month: ' : ''}${row.label}</span>
  </div>`;
}

export function historyDetails(row, through) {
  return `${bucketEvidence(row, true)}${values(row, through, true)}
    ${row.detail ? `<p class="muted">${row.detail}</p>` : ''}
    ${bucketLinks(row, through)}`;
}

function mark(value, key, scale) {
  if (!amountValid(value)) return '<span class="history-lane"></span>';
  if (value === 0) return '<span class="history-lane"><i class="history-zero-mark"></i></span>';
  return `<span class="history-lane"><meter class="${key} ${value < 0 ? 'below' : 'above'}"
    min="0" max="${scale}" value="${Math.abs(value)}"></meter></span>`;
}

function chartRow(row, scale, current, index, length) {
  const axisLabel = index === 0 || index === length - 1 || row.month.endsWith('-01');
  const name = `${monthLabel(row.month)}, ${row.clipped ? 'partial dates, ' : ''}${row.label}${row.observed ? '' : ', no chart values'}`;
  return `<button type="button" class="history-mark${row.clipped || row.tone === 'attention' ? ' attention' : ''}" data-history-month="${row.month}"
    aria-pressed="${row === current}" aria-label="${name}" aria-controls="history-detail">
    <span class="history-column" aria-hidden="true">
      ${channels.map(({ key }) => mark(row.amounts[key], key, scale)).join('')}
      ${row.observed ? '' : '<i class="history-missing-mark"></i>'}
    </span>
    <span class="history-axis-label" aria-hidden="true">${axisLabel ? `${monthLabel(row.month, true)} ${row.month.slice(2, 4)}` : ''}</span>
  </button>`;
}

export function historyView(route, result) {
  const period = route.history;
  const month = calendarPeriod(route.month);
  const overview = `<div class="history-heading">
    <div><p class="history-range">${dateSpan(period)}</p><p class="muted">36 months · Inclusive dates · India time</p></div>
    <form id="history-form" class="history-form">
      <label>History end date <input type="date" name="through" min="${month.from}" max="${month.to}" value="${period.to}" required></label>
      <button type="submit" class="button">Update</button>
    </form>
  </div>`;
  if (!result.history.ok) return overview + '<div class="empty" role="alert"><p><strong>Monthly history could not load.</strong></p><button type="button" class="button" data-refresh>Retry</button></div>';

  const rows = historyRows(period, result);
  const current = rows.find((row) => row.month === route.bucket) ?? rows.at(-1);
  const scale = Math.max(1, ...rows.flatMap((row) => Object.values(row.amounts).filter(amountValid).map(Math.abs)));
  return overview + `<ul class="chart-key" aria-label="History series">${channels.map(({ key, title }) => `<li class="${key}">${title}</li>`).join('')}</ul>
    <p class="history-note muted">Amounts reflect recorded entries. Net cash flow is cash credits minus cash debits. Amber ticks flag partial dates or a source issue. Dots at the bottom mark months with no available values.</p>
    <div class="history-chart">
      <span class="history-zero" aria-hidden="true">${money(0)}</span>
      <div class="history-scroll" tabindex="0" role="group" aria-label="Monthly history, select a month to see amounts and sources">
        <div class="history-plot">${rows.map((row, index) => chartRow(row, scale, current, index, rows.length)).join('')}</div>
      </div>
    </div>
    <p class="muted history-scroll-hint">Scroll the chart for earlier months or open the month list.</p>
    <div class="history-detail" id="history-detail" aria-live="polite">${historyDetails(current, period.to)}</div>
    <details class="more-records history-list">
      <summary>All 37 calendar months · dates and amounts</summary>
      <ol>${[...rows].reverse().map((row) => `<li>${bucketEvidence(row)}${values(row, period.to)}${row.detail ? `<p class="muted">${row.detail}</p>` : ''}${bucketLinks(row, period.to)}</li>`).join('')}</ol>
    </details>`;
}
