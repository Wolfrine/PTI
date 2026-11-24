import { amountValid, calendarPeriod, count, currentDate, date, dateValid, escape, href, money, monthLabel, monthValid, noEarnedIncomeRecorded, signed, stableId } from './values.mjs';

const modes = {
  classified: {
    title: 'Income and spending',
    note: 'Posted earned income and gross classified spending, including fees. Refunds are shown separately in the ledger.',
    series: [
      { key: 'earned', label: 'Earned income', absent: noEarnedIncomeRecorded, filter: 'kind=earned_income', plot: 1 },
      { key: 'spending', label: 'Gross classified spending', absent: 'No spending recorded', filter: 'scope=spending', plot: -1 },
    ],
  },
  posted: {
    title: 'Posted cash movement',
    note: 'Cash-account entries posted to the ledger. Net movement is credits minus debits.',
    series: [
      { key: 'credits', label: 'Cash credits', absent: 'No credits recorded', filter: 'scope=cash-inflow', plot: 1 },
      { key: 'debits', label: 'Cash debits', absent: 'No debits recorded', filter: 'scope=cash-outflow', plot: -1 },
      { key: 'net', label: 'Net cash movement', filter: 'scope=cash', plot: 1 },
    ],
  },
  statements: {
    title: 'Bank statements',
    note: 'Bank movements and balances for each verified account and statement period.',
  },
};

const statementFields = [
  { key: 'opening', label: 'Opening balance' },
  { key: 'credits', label: 'Bank credits' },
  { key: 'debits', label: 'Bank debits' },
  { key: 'net', label: 'Net bank movement' },
  { key: 'closing', label: 'Closing balance' },
];
const statementMovements = statementFields.slice(1, 4);

const nonnegative = (value) => amountValid(value) && value >= 0;
const accountValid = (value) => typeof value === 'string' && /^[a-z][a-z0-9_-]{1,47}$/.test(value) && !/\d{5}/.test(value);
const dateSpan = ({ from, to }) => `${date(from)} – ${date(to)}`;
const balance = (paisa) => paisa < 0 ? signed(paisa, 'debit') : money(paisa);
const movement = (paisa) => !amountValid(paisa) || paisa === 0 ? money(paisa) : signed(paisa, paisa < 0 ? 'debit' : 'credit');

function historyMeasure(mode, account) {
  return (mode === 'classified' ? '' : `&measure=${mode}`) + (mode === 'statements' && accountValid(account) ? `&account=${account}` : '');
}

function historyHref(route, mode, bucket, account) {
  return href('overview', route.month) + `&through=${route.history.to}`
    + (monthValid(bucket) ? `&bucket=${bucket}` : '') + historyMeasure(mode, account);
}

function backParams(route, mode, account) {
  return `&historyThrough=${route.history.to}${historyMeasure(mode, account)}`;
}

function dateScope(row, route, mode) {
  return `&from=${row.from}&to=${row.to}${backParams(route, mode)}`;
}

function cashNet(credits, debits, net) {
  if (!nonnegative(credits) || !nonnegative(debits) || !amountValid(net) || net !== credits - debits) return undefined;
  return net !== 0 || (credits > 0 && debits > 0) ? net : undefined;
}

function projectedAmounts(month) {
  const { transactions, review, pending, excluded } = month?.counts ?? {};
  if (![transactions, review, pending, excluded].every(nonnegative)) return {};
  const posted = transactions - review - pending - excluded;
  if (posted < 0) return {};

  const recorded = (value) => nonnegative(value) && (posted > 0 || value === 0) ? value : undefined;
  const credits = recorded(month.inflowPaisa);
  const debits = recorded(month.outflowPaisa);
  return {
    earned: recorded(month.earnedIncomePaisa),
    spending: recorded(month.spendPaisa),
    credits,
    debits,
    net: cashNet(credits, debits, month.cashflowPaisa),
  };
}

function clippedAmounts(rows, bucket) {
  const amounts = { earned: 0, spending: 0, credits: 0, debits: 0 };
  let posted = 0;
  for (const row of rows) {
    if (row.status !== 'posted' || row.occurredOn < bucket.from || row.occurredOn > bucket.to || !dateValid(row.occurredOn)) continue;
    if (!nonnegative(row.amountPaisa) || row.amountPaisa === 0) continue;
    const amount = row.amountPaisa;
    posted++;
    if (row.kind === 'earned_income') amounts.earned += amount;
    if (row.kind === 'spend' || row.kind === 'fee') amounts.spending += amount;
    if (row.accountKind === 'cash' && row.direction === 'credit') amounts.credits += amount;
    if (row.accountKind === 'cash' && row.direction === 'debit') amounts.debits += amount;
  }
  const { credits, debits } = amounts;
  return { amounts: { ...amounts, net: cashNet(credits, debits, credits - debits) }, posted };
}

function coverageStatus(coverage) {
  if (coverage?.inProgressCount > 0) return { label: 'Intake in progress', tone: 'attention' };
  if (coverage?.inputCount > 0 && coverage.status === 'partial') return { label: 'Partial source coverage', tone: 'attention' };
  if (coverage?.inputCount > 0 && coverage.status === 'observed') return { label: 'Source records observed', tone: 'ok' };
  return { label: 'Source coverage unknown', tone: '' };
}

function ledgerRows(period, result) {
  const read = result.history?.ok && Array.isArray(result.history.data);
  const months = new Map((read ? result.history.data : []).map((entry) => [entry.id, entry]));
  return period.buckets.map((bucket) => {
    const month = months.get(bucket.month);
    const coverage = coverageStatus(month?.coverage);
    if (!bucket.clipped) {
      if (!read) return { ...bucket, amounts: {}, label: 'Monthly read failed', tone: 'attention' };
      if (!month) return { ...bucket, amounts: {}, label: 'No monthly ledger record', tone: '' };
      return { ...bucket, amounts: projectedAmounts(month), ...coverage };
    }
    const edge = result[`edge:${bucket.month}`];
    if (!edge?.ok || !Array.isArray(edge.data?.list)) {
      return { ...bucket, amounts: {}, label: 'Dated ledger read failed', tone: 'attention' };
    }
    if (edge.data.more !== false) {
      return { ...bucket, amounts: {}, label: 'Dated ledger read incomplete', tone: 'attention',
        detail: 'Open the posted ledger to browse entries for these dates.' };
    }
    const { amounts, posted } = clippedAmounts(edge.data.list, bucket);
    return { ...bucket, amounts, label: `Calendar month · ${coverage.label}`, tone: coverage.tone,
      detail: posted ? '' : 'No posted ledger entries were returned for these dates.' };
  });
}

function verifiedStatement(raw, legacy) {
  if (!raw || (!legacy && (raw.sourceKind !== 'verified_bank_statement' || raw.arithmeticVerified !== true))) return null;
  const { month, account, rows, sourceWindowId } = raw;
  const { from, to } = (legacy ? raw : raw.period) ?? {};
  const opening = raw.openingPaisa;
  const closing = raw.closingPaisa;
  const credits = legacy ? raw.creditPaisa : raw.creditsPaisa;
  const debits = legacy ? raw.debitPaisa : raw.debitsPaisa;
  if (!monthValid(month) || !accountValid(account) || !stableId(sourceWindowId)
    || !dateValid(from) || !dateValid(to) || from > to || !from.startsWith(month) || !to.startsWith(month)
    || ![credits, debits, rows].every(nonnegative) || !amountValid(opening) || !amountValid(closing)
    || opening + credits - debits !== closing || !amountValid(closing - opening)) return null;

  const calendar = calendarPeriod(month);
  return {
    month, account, from, to, sourceWindowId, rows, partial: from !== calendar.from || to !== calendar.to,
    amounts: { opening, credits, debits, net: closing - opening, closing },
  };
}

function statementRecords(result, period) {
  const planning = result.planning?.ok ? result.planning.data : null;
  const model = result.financialEvidence?.ok ? result.financialEvidence.data : null;
  const hasModel = model?.schemaVersion === 1 && Array.isArray(model.ledgerMonths);
  const hasLegacy = Array.isArray(planning?.statementFacts);
  const projected = hasModel ? model.ledgerMonths.flatMap((month) => {
    const accounts = month?.verifiedStatementCash?.accounts;
    return Array.isArray(accounts) ? accounts.map((record) => verifiedStatement(record, false)) : [];
  }) : [];
  const legacy = hasLegacy ? planning.statementFacts.map((record) => verifiedStatement(record, true)) : [];
  const records = new Map();
  const today = currentDate();
  // The v1 response only attaches verified statements to months with a ledger projection.
  for (const record of [...projected, ...legacy]) {
    if (!record || record.from > period.to || record.to < period.from || record.to > today) continue;
    const id = [record.sourceWindowId, record.account, record.from, record.to].join('|');
    if (!records.has(id)) records.set(id, { ...record, extendsRange: record.from < period.from || record.to > period.to });
  }
  return {
    read: hasModel || hasLegacy,
    records: [...records.values()].sort((a, b) => b.to.localeCompare(a.to) || a.account.localeCompare(b.account)),
  };
}

function modeNav(route, mode) {
  return `<nav class="fin-history-modes" aria-label="History view">${Object.entries(modes).map(([key, value]) =>
    `<a href="${escape(historyHref(route, key, route.bucket, route.historyAccount))}"${key === mode ? ' aria-current="page"' : ''}>${value.title}</a>`).join('')}</nav>`;
}

function amountText(value, field) {
  if (field.absent && value === 0) return field.absent;
  return field.key === 'net' ? movement(value) : balance(value);
}

function amountList(amounts, fields, ledger = '') {
  return `<dl class="fin-history-values">${fields.map((field) => {
    const value = amounts[field.key];
    const supported = amountValid(value) && (!field.absent || value > 0);
    const text = amountText(value, field);
    const target = ledger && field.filter && supported ? escape(`${ledger}&${field.filter}`) : '';
    return `<div><dt>${field.label}</dt><dd class="${supported ? 'number' : 'fin-history-amount-state'}">${target
      ? `<a class="fin-history-value-link" href="${target}" aria-label="${field.label}, ${text}. View posted entries">${text}</a>` : text}</dd></div>`;
  }).join('')}</dl>`;
}

function ledgerLinks(row, route, mode) {
  if (!monthValid(row.month)) return '';
  const scope = dateScope(row, route, mode);
  return `<nav class="fin-history-links" aria-label="Records for ${monthLabel(row.month)}">
    <a class="text-link" href="${escape(href('transactions', row.month) + scope + '&status=posted')}">Posted ledger</a>
    <a class="text-link" href="${escape(href('sources', row.month) + scope)}">Source coverage</a>
    <a class="text-link" href="${escape(href('reports', row.month) + backParams(route, mode))}">Monthly report</a>
  </nav>`;
}

function periodLabel(row) {
  return `<p class="fin-history-dates">${dateSpan(row)}${row.clipped ? ' · Partial month dates' : ''}</p>`;
}

function statementHistoryDates(row) {
  if (row.records.length === 1 && row.records[0].from === row.from && row.records[0].to === row.to) return '';
  return `<p class="fin-history-dates">History dates · ${dateSpan(row)}</p>`;
}

function statusPill(row) {
  return `<span class="pill ${row.tone}">${row.label}</span>`;
}

function ledgerSelection(row, route, mode, fields) {
  const ledger = monthValid(row.month) ? href('transactions', row.month) + dateScope(row, route, mode) + '&status=posted' : '';
  return `<section class="fin-history-selection" id="history-selected-month" aria-labelledby="history-month-title" tabindex="-1">
    <div class="fin-history-selection-head">
      <div><h3 id="history-month-title">${monthLabel(row.month)}</h3>${periodLabel(row)}</div>
      ${statusPill(row)}
    </div>
    ${amountList(row.amounts, fields, ledger)}
    ${row.detail ? `<p class="muted">${row.detail}</p>` : ''}
    ${ledgerLinks(row, route, mode)}
  </section>`;
}

function plotValue(row, field) {
  const value = row.amounts[field.key];
  return amountValid(value) && (!field.absent || value > 0) ? value * field.plot : undefined;
}

function mark(value, key, scale) {
  if (!amountValid(value)) return '<span class="fin-history-lane"></span>';
  if (value === 0) return '<span class="fin-history-lane"><span class="fin-history-observed-zero"></span></span>';
  return `<span class="fin-history-lane"><meter class="${key} ${value < 0 ? 'below' : 'above'}"
    min="0" max="${scale}" value="${Math.abs(value)}"></meter></span>`;
}

function ledgerChart(rows, current, route, mode, fields) {
  const plotted = rows.flatMap((row) => fields.map((field) => plotValue(row, field)).filter(amountValid));
  if (!plotted.length) return '';
  const scale = Math.max(1, ...plotted.map(Math.abs));
  return `<div class="fin-history-trend">
    <button type="button" class="plain text-link" data-history-list>Skip chart to month list</button>
    <ul class="fin-history-key" aria-label="Chart series">${fields.map(({ key, label }) => `<li class="${key}">${label}</li>`).join('')}</ul>
    <div class="fin-history-chart">
      <div class="fin-history-axis" aria-hidden="true"><span>${money(scale)}</span><span>${money(0)}</span><span>${signed(scale, 'debit')}</span></div>
      <div class="fin-history-plot" aria-label="Select a month" role="group">
        ${rows.map((row, index) => {
          const values = fields.map((field) => plotValue(row, field));
          const name = `${monthLabel(row.month)}, ${dateSpan(row)}. ${row.label}. ${fields.map((field) => `${field.label}, ${amountText(row.amounts[field.key], field)}`).join('. ')}`;
          const classname = `fin-history-point${row.clipped || row.tone === 'attention' ? ' attention' : ''}`;
          const label = index % 6 === 0 ? `<span class="fin-history-tick ${index === 0 ? 'first' : index === rows.length - 1 ? 'last' : ''}">${monthLabel(row.month, true)} ’${row.month.slice(2, 4)}</span>` : '';
          const point = `<span class="fin-history-bars" aria-hidden="true">${values.map((value, i) => mark(value, fields[i].key, scale)).join('')}
            ${values.some(amountValid) ? '' : '<span class="fin-history-gap"></span>'}
            ${label}
          </span>`;
          return monthValid(row.month)
            ? `<a class="${classname}" href="${escape(historyHref(route, mode, row.month))}" aria-label="${escape(name)}"${row === current ? ' aria-current="true"' : ''}>${point}</a>`
            : `<span class="${classname}" aria-hidden="true">${point}</span>`;
        }).join('')}
      </div>
    </div>
    <p class="muted fin-history-chart-note">${mode === 'classified' ? 'Spending appears' : 'Debits appear'} below zero. Amber marks flag partial dates or source issues. Hollow dots mark months without plotted amounts.</p>
  </div>`;
}

function monthLink(row, current, route, mode, account) {
  return monthValid(row.month)
    ? `<a class="fin-history-month-link" href="${escape(historyHref(route, mode, row.month, account))}"${row === current ? ' aria-current="true"' : ''}>${monthLabel(row.month)}</a>`
    : `<strong>${monthLabel(row.month)}</strong>`;
}

function ledgerList(rows, current, route, mode, fields) {
  return `<section class="fin-history-months" id="history-month-list" aria-labelledby="history-months-title" tabindex="-1">
    <h3 id="history-months-title">Month by month</h3>
    <ol>${[...rows].reverse().map((row) => `<li class="fin-history-month-row${row === current ? ' selected' : ''}">
      <div class="fin-history-month-label">${monthLink(row, current, route, mode)}${periodLabel(row)}${statusPill(row)}</div>
      ${amountList(row.amounts, fields)}
    </li>`).join('')}</ol>
  </section>`;
}

function loadFailure(text) {
  return `<div class="fin-history-alert" role="alert"><p>${text}</p><button type="button" class="button" data-refresh>Retry</button></div>`;
}

function ledgerHistory(route, result, mode) {
  const fields = modes[mode].series;
  const rows = ledgerRows(route.history, result);
  const current = rows.find((row) => row.month === route.bucket) ?? rows.at(-1);
  return `${result.history?.ok ? '' : loadFailure('Calendar-month ledger records could not load.')}
    ${ledgerSelection(current, route, mode, fields)}
    ${ledgerChart(rows, current, route, mode, fields)}
    ${ledgerList(rows, current, route, mode, fields)}`;
}

function statementCard(record, route, account, detail) {
  const source = href('sources', record.month) + `&window=${record.sourceWindowId}${backParams(route, 'statements', account)}`;
  const fields = detail ? statementFields : statementMovements;
  const period = dateSpan(record);
  return `<div class="fin-history-statement">
    <p class="fin-history-statement-period"><strong>${period}</strong>
      ${record.partial ? '<span>Partial calendar month</span>' : ''}</p>
    ${record.extendsRange ? '<p class="fin-history-statement-warning">Statement dates extend outside the selected history range.</p>' : ''}
    ${amountList(record.amounts, fields)}
    ${detail ? `<div class="fin-history-links"><span class="muted">${count(record.rows)} ${record.rows === 1 ? 'statement row' : 'statement rows'}</span>
      <a class="text-link" href="${escape(source)}" aria-label="Open verified source window for ${escape(account)}, ${period}">Open verified source window</a></div>` : ''}
  </div>`;
}

function statementHistory(route, result) {
  const { read, records } = statementRecords(result, route.history);
  if (!read) return loadFailure('Verified statements could not load.');
  const accounts = [...new Set(records.map((record) => record.account))];
  const account = accountValid(route.historyAccount) ? route.historyAccount : accounts[0];
  if (!account) return '<p class="fin-history-empty">No verified statements were returned for these dates.</p>';
  const accountRecords = records.filter((record) => record.account === account);
  const rows = route.history.buckets.map((bucket) => ({
    ...bucket, records: accountRecords.filter((record) => record.month === bucket.month),
  }));
  const current = rows.find((row) => row.month === (route.bucket ?? accountRecords[0]?.month)) ?? rows.at(-1);
  const choices = accounts.includes(account) ? accounts : [account, ...accounts];
  return `${choices.length > 1 ? `<nav class="fin-history-accounts" aria-label="Statement accounts">${choices.map((choice) =>
    `<a href="${escape(historyHref(route, 'statements', route.bucket, choice))}"${choice === account ? ' aria-current="true"' : ''}>${escape(choice)}</a>`).join('')}</nav>` : ''}
    <section class="fin-history-selection" id="history-selected-month" aria-labelledby="history-month-title" tabindex="-1">
      <div class="fin-history-selection-head">
        <div><h3 id="history-month-title">${monthLabel(current.month)}</h3>${statementHistoryDates(current)}</div>
        <p class="fin-history-account">${escape(account)}</p>
      </div>
      ${current.records.length ? current.records.map((record) => statementCard(record, route, account, true)).join('')
        : '<p class="fin-history-empty">No verified statement was returned for this account and month.</p>'}
    </section>
    <section class="fin-history-months" aria-labelledby="history-months-title">
      <h3 id="history-months-title">Month by month</h3>
      <ol>${[...rows].reverse().map((row) => `<li class="fin-history-month-row fin-history-statement-row${row === current ? ' selected' : ''}">
        <div class="fin-history-month-label">${monthLink(row, current, route, 'statements', account)}${statementHistoryDates(row)}
          ${row.records.length ? '<p><span class="pill ok">Verified statement</span></p>' : '<p class="muted">No verified statement</p>'}</div>
        ${row.records.length ? `<div class="fin-history-statement-list">${row.records.map((record) => statementCard(record, route, account, false)).join('')}</div>` : ''}
      </li>`).join('')}</ol>
    </section>`;
}

export function historyView(route, result) {
  const mode = Object.hasOwn(modes, route.historyMode) ? route.historyMode : 'classified';
  return `<div class="fin-history">
    <div class="fin-history-range"><strong>${dateSpan(route.history)}</strong><span>36 months · India time</span></div>
    ${modeNav(route, mode)}
    <p class="fin-history-note muted">${modes[mode].note}</p>
    ${mode === 'statements' ? statementHistory(route, result) : ledgerHistory(route, result, mode)}
  </div>`;
}
