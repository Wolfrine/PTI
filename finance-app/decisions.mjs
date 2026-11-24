import {
  amountValid, calendarPeriod, count, currentDate, date, dateValid, escape, href,
  monthLabel, monthValid, pretty, publicationIdValid, publicationKinds, stableId,
} from './values.mjs';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const publicationMonth = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
const publicationLabels = { report: 'Reports', decision: 'Decisions', plan: 'Plans', insight: 'Insights', tracking: 'Tracking' };
const positionLabels = { cash: 'Cash', investment: 'Investments', debt: 'Debt' };
const positionViews = { accounts: 'cash', investments: 'investment', debts: 'debt' };
const basisLabels = {
  closing_balance: 'Statement closing balance',
  available_balance: 'Reported available balance',
  market_value: 'Reported market value',
  amount_due: 'Statement amount due',
  outstanding_principal: 'Outstanding principal',
};
const publicationStatuses = ['published', 'provisional', 'watching', 'resolved'];
const maxPublications = 50;

const data = (read) => read?.ok ? read.data : null;
const array = (value) => Array.isArray(value) ? value : [];
const money = (amount) => amountValid(amount) ? currency.format(amount / 100) : 'Unavailable';
const timestampValid = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const dateMarkup = (value) => `<time datetime="${escape(value)}">${escape(date(value))}</time>`;
const timeMarkup = (value) => `<time datetime="${escape(value)}">${escape(date(value, true))} IST</time>`;
const textLink = (url, label) => `<a class="text-link" href="${escape(url)}">${escape(label)}</a>`;
const accountLabel = (value) => pretty(value.replaceAll('-', ' '));
const retry = (label) => `<button type="button" class="button" data-refresh>${escape(label)}</button>`;
const note = (text) => `<p class="brief-note">${escape(text)}</p>`;

function section(title, body, action = '') {
  return `<section class="brief-section">
    <header class="section-heading"><h2>${escape(title)}</h2>${action}</header>
    ${body}
  </section>`;
}

function message(title, text, action = '') {
  return `<div class="brief-message"><h2>${escape(title)}</h2>${note(text)}${action}</div>`;
}

function listFilter(label, choices, selected, makeHref) {
  return `<nav class="brief-filters" aria-label="${escape(label)}">${choices.map(([key, name]) =>
    `<a href="${escape(makeHref(key))}"${key === selected ? ' aria-current="true"' : ''}>${escape(name)}</a>`
  ).join('')}</nav>`;
}

function libraryHref(month, kind, publication) {
  return href('library', month) + (kind ? `&kind=${kind}` : '') + (publication ? `&doc=${publication}` : '');
}

function snapshotHref(month, kind) {
  return href('position', month) + (kind ? `&kind=${kind}` : '');
}

function statementHref(month, id, publication) {
  return `${href('sources', month)}&window=${id}${publication ? `&publication=${publication}` : ''}`;
}

function publicationSource(source, publication, statements) {
  const label = source.label;
  if (source.type === 'ledger_month') {
    return sourceItem(textLink(`${href('reports', source.id)}&publication=${publication.id}`, label),
      `Ledger month · ${escape(monthLabel(source.id))}`);
  }
  if (source.type === 'statement_window') {
    const verified = statements.find((statement) => statement.sourceWindowId === source.id);
    const month = verified?.month ?? publication.asOf.slice(0, 7);
    return sourceItem(textLink(statementHref(month, source.id, publication.id), label), 'Statement window');
  }
  return sourceItem(escape(label), `Finance project discussion · ${dateMarkup(source.date)}`);
}

function sourceItem(title, context) {
  return `<li><div class="brief-source-title">${title}</div><small>${context}</small></li>`;
}

function sourceValid(source) {
  if (typeof source?.label !== 'string' || !source.label.trim()) return false;
  return (source.type === 'ledger_month' && monthValid(source.id))
    || (source.type === 'statement_window' && stableId(source.id))
    || (source.type === 'project_discussion' && dateValid(source.date));
}

function publicationValid(record) {
  return publicationIdValid(record?.id) && publicationKinds.includes(record.kind)
    && publicationStatuses.includes(record.status) && typeof record.title === 'string' && record.title.trim()
    && typeof record.summary === 'string' && record.summary.trim()
    && dateValid(record.asOf) && timestampValid(record.publishedAt);
}

function publicationRecords(planning) {
  if (!Array.isArray(planning?.publications)) return null;
  return planning.publications.filter(publicationValid).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
}

function statementRecords(planning, evidence, today) {
  const projected = array(evidence?.ledgerMonths).flatMap((month) =>
    array(month?.verifiedStatementCash?.accounts).filter((account) =>
      account?.arithmeticVerified === true && account.sourceKind === 'verified_bank_statement'));
  const verified = array(planning?.statementFacts).filter((fact) => fact && [fact.openingPaisa, fact.closingPaisa,
    fact.creditPaisa, fact.debitPaisa].every(amountValid)
    && fact.openingPaisa + fact.creditPaisa - fact.debitPaisa === fact.closingPaisa).map((fact) => ({
    account: fact.account, month: fact.month, sourceWindowId: fact.sourceWindowId,
    period: { from: fact.from, to: fact.to }, creditsPaisa: fact.creditPaisa, debitsPaisa: fact.debitPaisa,
  }));
  return [...projected, ...verified].filter((fact) =>
    typeof fact.account === 'string' && fact.account.trim() && monthValid(fact.month)
    && stableId(fact.sourceWindowId) && dateValid(fact.period?.from) && dateValid(fact.period?.to)
    && fact.period.from.startsWith(fact.month) && fact.period.to.startsWith(fact.month)
    && fact.period.from <= fact.period.to && fact.period.to <= today
    && amountValid(fact.creditsPaisa) && fact.creditsPaisa >= 0 && amountValid(fact.debitsPaisa) && fact.debitsPaisa >= 0
  ).sort((a, b) => b.period.to.localeCompare(a.period.to) || a.period.from.localeCompare(b.period.from));
}

function sortedSnapshots(balances, evidence, today) {
  const position = evidence?.position;
  const fromProjection = [
    ...array(position?.cashSnapshots), ...array(position?.investmentSnapshots), ...array(position?.debtSnapshots),
  ];
  const rows = new Map();
  for (const snapshot of [...fromProjection, ...array(balances?.list)]) {
    if (typeof snapshot?.account !== 'string' || !snapshot.account.trim() || !Object.hasOwn(positionLabels, snapshot.kind)
      || !dateValid(snapshot.asOf) || snapshot.asOf > today || !amountValid(snapshot.amountPaisa)) continue;
    const key = JSON.stringify([snapshot.kind, snapshot.account, snapshot.basis ?? null]);
    const previous = rows.get(key);
    if (!previous || snapshot.asOf >= previous.asOf) rows.set(key, snapshot);
  }
  return [...rows.values()].sort((a, b) => b.asOf.localeCompare(a.asOf) || a.account.localeCompare(b.account));
}

function selectedLedger(month, monthly, evidence) {
  const projected = array(evidence?.ledgerMonths).find((record) => record?.month === month);
  const counts = monthly?.counts;
  const countFields = [counts?.transactions, counts?.review, counts?.pending, counts?.excluded];
  const posted = countFields.every((value) => amountValid(value) && value >= 0)
    ? Math.max(0, counts.transactions - counts.review - counts.pending - counts.excluded)
    : null;
  return {
    month, projected,
    exists: Boolean(monthly || projected),
    updatedAt: monthly?.updatedAt,
    posted: projected ? projected.counts?.posted : posted,
    review: projected ? projected.counts?.review : counts?.review,
    coverage: projected ? projected.sourceCoverage : monthly?.coverage?.inputCount > 0 ? monthly.coverage.status : null,
    warnings: [
      ['locked', projected ? projected.coverageWarnings?.lockedCount : monthly?.coverage?.lockedCount],
      ['unparsed', projected ? projected.coverageWarnings?.unparsedCount : monthly?.coverage?.unparsedCount],
      ['still processing', projected ? projected.coverageWarnings?.inProgressCount : monthly?.coverage?.inProgressCount],
    ],
  };
}

function briefModel(route, result) {
  const planning = data(result?.planning);
  const available = data(result?.financialEvidence);
  const evidence = available?.schemaVersion === 1 ? available : null;
  const today = currentDate();
  const month = route.view !== 'today' && monthValid(route.month) ? route.month : today.slice(0, 7);
  const publications = publicationRecords(planning);
  const replacement = new Map();
  for (const doc of publications ?? []) {
    if (publicationIdValid(doc.supersedes) && doc.supersedes !== doc.id && !replacement.has(doc.supersedes)) {
      replacement.set(doc.supersedes, doc);
    }
  }
  const balances = data(result?.balances);
  const monthly = data(result?.month);
  return {
    today, month, planning, evidence, publications, replacement, balances, monthly,
    monthReadFailed: result?.month?.ok === false,
    ledger: selectedLedger(month, monthly, evidence),
    statements: statementRecords(planning, evidence, today),
    snapshots: sortedSnapshots(balances, evidence, today),
  };
}

function statusTag(status) {
  if (status === 'published') return '';
  return `<span class="brief-status brief-status-${status}">${escape(pretty(status))}</span>`;
}

function lead({ label, title, summary, provenance, action = '', extra = '', effective = '' }, today) {
  return `<section class="brief-lead">
    <header class="brief-masthead"><span>${escape(label)}</span>${dateMarkup(today)}</header>
    <div class="brief-lead-grid">
      <div class="brief-lead-story"><h2>${escape(title)}</h2>${effective}<p>${escape(summary)}</p>${extra}${action}</div>
      ${provenance ? `<div class="brief-lead-source">${provenance}</div>` : ''}
    </div>
  </section>`;
}

function publicationDates(publication) {
  return `<dl class="brief-dates">
    <div><dt>Effective date</dt><dd>${dateMarkup(publication.asOf)}</dd></div>
    <div><dt>Published</dt><dd>${timeMarkup(publication.publishedAt)}</dd></div>
  </dl>`;
}

function statementAmounts(statement) {
  return `<dl class="brief-statement-amounts">
    <div><dt>Bank credits</dt><dd>${escape(money(statement.creditsPaisa))}</dd></div>
    <div><dt>Bank debits</dt><dd>${escape(money(statement.debitsPaisa))}</dd></div>
  </dl>`;
}

function statementScope(statement) {
  const calendar = calendarPeriod(statement.month);
  const coverage = statement.period.from === calendar.from && statement.period.to === calendar.to
    ? 'Full statement month' : 'Partial statement month';
  return `<p class="brief-note">${escape(accountLabel(statement.account))} · ${escape(coverage)}<br>
    ${dateMarkup(statement.period.from)} to ${dateMarkup(statement.period.to)}</p>`;
}

function latestLedgerFact(model) {
  if (model.ledger.posted > 0 && model.month <= model.today.slice(0, 7)) return model.ledger;
  const recorded = array(model.evidence?.ledgerMonths).filter((row) => monthValid(row?.month)
    && row.month <= model.today.slice(0, 7) && Number.isSafeInteger(row.counts?.posted) && row.counts.posted > 0
  ).sort((a, b) => b.month.localeCompare(a.month))[0];
  return recorded ? selectedLedger(recorded.month, null, model.evidence) : null;
}

function relevantPublications(model) {
  const effective = model.publications?.filter((record) => record.asOf <= model.today) ?? [];
  const replaced = new Set(effective.map((record) => record.supersedes));
  return effective.filter((record) => !replaced.has(record.id));
}

function todayLead(model, publication) {
  if (publication) {
    const sources = array(publication.sources).filter(sourceValid);
    return lead({
      label: `Latest from the Finance project / ${pretty(publication.kind)}`,
      title: publication.title,
      summary: publication.summary,
      effective: `<p class="brief-effective">Effective ${dateMarkup(publication.asOf)} ${statusTag(publication.status)}</p>`,
      provenance: `<p class="brief-note">Published ${timeMarkup(publication.publishedAt)}</p>`
        + (sources.length ? `<ul class="brief-sources">${publicationSource(sources[0], publication, model.statements)}</ul>` : ''),
      action: textLink(libraryHref(model.month, '', publication.id), 'Read publication'),
    }, model.today);
  }

  const statement = model.statements[0];
  const ledger = latestLedgerFact(model);
  if (statement && (!ledger || statement.month >= ledger.month)) {
    return lead({
      label: 'Latest verified statement',
      title: 'Bank movements reconciled through ' + date(statement.period.to),
      summary: 'Opening and closing balances agree with the recorded credits and debits for this account.',
      extra: statementAmounts(statement),
      provenance: statementScope(statement) + note('Bank movements include transfers and repayments alongside expenses.'),
      action: textLink(statementHref(statement.month, statement.sourceWindowId), 'Open statement source'),
    }, model.today);
  }

  if (ledger) {
    return lead({
      label: 'Recorded ledger fact',
      title: `${count(ledger.posted)} posted ${ledger.posted === 1 ? 'entry' : 'entries'} in ${monthLabel(ledger.month)}`,
      summary: 'This is the count of posted entries in the captured monthly ledger.',
      provenance: note(coverageText(ledger)) + (timestampValid(ledger.updatedAt)
        ? `<p class="brief-note">Ledger updated ${timeMarkup(ledger.updatedAt)}</p>` : ''),
      action: textLink(href('reports', ledger.month), 'Open monthly report'),
    }, model.today);
  }

  const snapshot = model.snapshots[0];
  if (snapshot) {
    return lead({
      label: 'Latest recorded position',
      title: accountLabel(snapshot.account) + ' snapshot from ' + date(snapshot.asOf),
      summary: `${Object.hasOwn(basisLabels, snapshot.basis) ? basisLabels[snapshot.basis] : 'Recorded snapshot'} · ${money(snapshot.amountPaisa)}`,
      provenance: note('A dated record for this account.') + (snapshot.sourceType ? note(pretty(snapshot.sourceType)) : ''),
      action: textLink(snapshotHref(model.month, snapshot.kind), 'Open position'),
    }, model.today);
  }

  return lead({
    label: 'Finance brief',
    title: 'No dated record is available',
    summary: model.publications ? 'No dated evidence was returned for this brief.'
      : 'The Finance project publications could not load, and no dated financial record was available.',
    action: model.publications ? textLink(href('sources', model.month), 'Check sources') : retry('Retry records'),
  }, model.today);
}

function datedBills(model) {
  return array(model.planning?.profile?.bills).filter((bill) => typeof bill?.title === 'string' && bill.title.trim()
    && dateValid(bill.due) && amountValid(bill.amountPaisa)).sort((a, b) => a.due.localeCompare(b.due));
}

function briefRow(title, context, amount = '') {
  return `<li class="brief-list-row"><div><strong>${escape(title)}</strong><p>${context}</p></div>
    ${amount ? `<span class="brief-row-value">${escape(amount)}</span>` : ''}</li>`;
}

const briefList = (rows) => `<ul class="brief-list">${rows.join('')}</ul>`;

function billRow(bill) {
  return briefRow(bill.title, `Recorded due ${dateMarkup(bill.due)} · ${escape(pretty(bill.state))}`, money(bill.amountPaisa));
}

function coverageText(ledger) {
  if (ledger.warnings.some(([label, value]) => label === 'still processing' && value > 0)) return 'Intake is in progress. Recorded activity can change.';
  if (ledger.coverage === 'observed') return 'Coverage reflects source records observed for this month.';
  if (ledger.coverage === 'partial' && (ledger.posted > 0 || ledger.review > 0 || ledger.warnings.some(([, value]) => value > 0))) {
    return 'Coverage is partial. Recorded activity reflects only the entries processed.';
  }
  return ledger.exists ? 'Source coverage is unknown for this month.' : 'No ledger coverage record was returned for this month.';
}

function coverageRows(model) {
  const ledger = model.ledger;
  const review = ledger.review > 0
    ? briefRow(`${count(ledger.review)} ${ledger.review === 1 ? 'entry needs' : 'entries need'} review`,
      textLink(href('review', ledger.month), 'Inspect classifications'))
    : '';
  const issues = ledger.warnings.filter(([, value]) => Number.isSafeInteger(value) && value > 0)
    .map(([label, value]) => `${count(value)} ${label}`);
  const coverage = escape(coverageText(ledger)) + (issues.length ? ` ${escape(issues.join(' · '))}.` : '');
  const updated = timestampValid(ledger.updatedAt) ? `<p class="brief-note">Ledger updated ${timeMarkup(ledger.updatedAt)}</p>` : '';
  return briefList([briefRow(monthLabel(ledger.month) + ' source coverage', coverage), review].filter(Boolean)) + updated;
}

function todayPage(model) {
  const publications = relevantPublications(model);
  const publication = publications[0];
  const plan = publications.find((record) => record.kind === 'plan' && record.status !== 'resolved' && record !== publication);
  const watching = publications.find((record) => record.status === 'watching' && record !== publication && record !== plan);
  const bills = datedBills(model).filter((bill) => bill.state === 'open');
  const records = bills.slice(0, 4).map(billRow);
  if (plan) {
    records.push(`<li class="brief-list-row"><div>
      ${textLink(libraryHref(model.month, '', plan.id), plan.title)}
      <p>${escape(pretty(plan.status))} plan · Effective ${dateMarkup(plan.asOf)}</p>
    </div></li>`);
  }
  if (watching) {
    records.push(`<li class="brief-list-row"><div>
      ${textLink(libraryHref(model.month, '', watching.id), watching.title)}
      <p>Watching · Effective ${dateMarkup(watching.asOf)}</p>
    </div></li>`);
  }
  const savedAt = bills.length && timestampValid(model.planning?.updatedAt)
    ? `<p class="brief-note">Saved commitments recorded ${timeMarkup(model.planning.updatedAt)}</p>` : '';
  const commitments = model.planning
    ? (records.length ? briefList(records) : note('No dated commitments are recorded as open in the saved plan.'))
      + (bills.length > 4 ? note(`Showing the next 4 of ${count(bills.length)} open recorded commitments.`) : '') + savedAt
    : note('The saved plan could not be read.') + retry('Retry planning records');
  const statement = model.statements[0];
  const supportingStatement = statement && (publication || latestLedgerFact(model)?.month > statement.month)
    ? section('Latest verified bank statement',
      `<div class="brief-evidence-row">${statementScope(statement)}${statementAmounts(statement)}</div>
        ${note('Bank movements include transfers and repayments alongside expenses.')}`,
      textLink(statementHref(statement.month, statement.sourceWindowId), 'Open statement source'))
    : '';
  return `<div class="brief-workspace">
    ${todayLead(model, publication)}
    <div class="brief-spread">
      ${section('Commitments and plans', commitments, model.planning ? textLink(href('decisions', model.month), 'Decisions and plans') : '')}
      ${section('Coverage and review', coverageRows(model), textLink(href('sources', model.month), 'View coverage'))}
    </div>
    ${supportingStatement}
  </div>`;
}

function timeline(records, model, kind = '') {
  const groups = new Map();
  for (const publication of records) {
    const month = publicationMonth.format(new Date(publication.publishedAt));
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(publication);
  }
  return [...groups].map(([month, publications]) => `<section class="publication-month">
    <h2>${escape(month)}</h2>
    <ol>${publications.map((publication) => {
      const sources = array(publication.sources).filter(sourceValid);
      const sourceCount = sources.length ? `${count(sources.length)} ${sources.length === 1 ? 'source' : 'sources'}` : 'Sources unavailable';
      const superseded = model.replacement.has(publication.id);
      const topic = typeof publication.topic === 'string' && publication.topic.trim() ? `<span>${escape(publication.topic)}</span>` : '';
      return `<li class="publication-index-row">
        <div class="publication-index-date"><span>Published</span> ${dateMarkup(publication.publishedAt)}</div>
        <article>
          <div class="publication-index-meta">
            <span>${escape(pretty(publication.kind))}</span>${topic}${statusTag(publication.status)}
            ${superseded ? '<span class="brief-status">Superseded</span>' : ''}
          </div>
          <h3><a href="${escape(libraryHref(model.month, kind, publication.id))}">${escape(publication.title)}</a></h3>
          <p class="publication-excerpt">${escape(publication.summary)}</p>
          <p class="publication-index-source">Effective ${dateMarkup(publication.asOf)} · ${escape(sourceCount)}</p>
        </article>
      </li>`;
    }).join('')}</ol>
  </section>`).join('');
}

function publicationReader(publication, model, kind) {
  const list = libraryHref(model.month, kind);
  const sources = array(publication.sources).filter(sourceValid);
  const points = array(publication.points).filter((point) =>
    typeof point?.heading === 'string' && point.heading.trim() && typeof point?.text === 'string' && point.text.trim());
  const superseding = model.replacement.get(publication.id);
  const prior = model.publications?.find((doc) => doc.id === publication.supersedes);
  const revision = superseding
    ? `<div class="publication-revision"><p>This record was superseded.</p>${textLink(libraryHref(model.month, kind, superseding.id), superseding.title)}</div>`
    : '';
  const previous = publicationIdValid(publication.supersedes)
    ? `<p class="publication-previous">Supersedes ${textLink(libraryHref(model.month, kind, publication.supersedes),
        prior?.title ?? 'previous publication')}</p>` : '';
  return `<div class="brief-workspace">
    <p class="publication-return">${textLink(list, kind ? `Back to ${publicationLabels[kind].toLowerCase()}` : 'All publications')}</p>
    <article class="publication-document">
      <header class="publication-document-heading">
        <div class="publication-index-meta"><span>${escape(pretty(publication.kind))}</span>${statusTag(publication.status)}</div>
        <h2>${escape(publication.title)}</h2>
        ${publicationDates(publication)}
      </header>
      ${revision}
      <div class="publication-reading">
        <p class="publication-summary">${escape(publication.summary)}</p>
        ${points.map((point) => `<section class="publication-section"><h3>${escape(point.heading)}</h3><p>${escape(point.text)}</p></section>`).join('')}
        <section class="publication-evidence">
          <h3>Sources</h3>
          ${sources.length ? `<ul class="brief-sources">${sources.map((source) => publicationSource(source, publication, model.statements)).join('')}</ul>`
            : note('Source details are unavailable for this publication.')}
          ${previous}
        </section>
      </div>
    </article>
  </div>`;
}

function publicationsPage(route, model) {
  const kind = publicationKinds.includes(route.publicationKind) ? route.publicationKind : '';
  if (route.publication) {
    const selected = model.planning?.selectedPublication;
    const exact = selected?.id === route.publication && publicationValid(selected) ? selected : null;
    const publication = exact ?? model.publications?.find((record) => record.id === route.publication);
    if (publication) return publicationReader(publication, model, kind);
    const back = textLink(libraryHref(model.month, kind), 'Back to publications');
    if (Object.hasOwn(model.planning ?? {}, 'selectedPublication') && selected === null) {
      return message('Publication not found', 'No record matched this publication link.', back);
    }
    if (model.publications) {
      return message('Publication unavailable', 'This record was outside the publications currently available.', back);
    }
  }
  if (!model.publications) {
    return message('Publications could not load', 'The private Finance project records could not be read.', retry('Retry publications'));
  }

  const loaded = model.publications;
  const visible = kind ? loaded.filter((publication) => publication.kind === kind) : loaded;
  const choices = [['', 'All'], ...publicationKinds.map((key) => [key, publicationLabels[key]])];
  const countLabel = kind ? `${count(visible.length)} of ${count(loaded.length)} loaded publications.`
    : `${count(loaded.length)} ${loaded.length === 1 ? 'publication' : 'publications'} loaded.`;
  const empty = kind
    ? message(kind === 'tracking' ? 'No tracking records in this list' : `No ${publicationLabels[kind].toLowerCase()} in this list`,
      'View the other publication types in the recent list.',
      textLink(libraryHref(model.month), 'Show all publications'))
    : message('No publications yet', 'Records published from the Finance project will appear here.');
  return `<div class="brief-workspace">
    ${listFilter('Publication type', choices, kind, (key) => libraryHref(model.month, key))}
    <p class="publication-bounds">${escape(countLabel)} Up to the latest ${maxPublications} records, ordered by publication date.</p>
    ${visible.length ? timeline(visible, model, kind) : empty}
  </div>`;
}

function readOnlyDecisions(model) {
  if (!model.planning) {
    return message('Planning records could not load', 'The saved Finance project plan could not be read.', retry('Retry planning records'));
  }

  const profile = model.planning.profile ?? {};
  const bills = datedBills(model);
  const goals = array(profile.goals).filter((goal) => typeof goal?.title === 'string' && dateValid(goal.due));
  const scenarios = array(profile.scenarios).filter((scenario) => typeof scenario?.title === 'string');
  const records = model.publications?.filter((publication) => ['decision', 'plan', 'tracking'].includes(publication.kind)) ?? [];
  const activity = [
    bills.length ? briefList(bills.map(billRow)) : note('No dated payments in the saved plan.'),
    goals.length ? briefList(goals.map((goal) =>
      briefRow(goal.title, `Target date ${dateMarkup(goal.due)} · Goal ${escape(money(goal.targetPaisa))}`, `${money(goal.savedPaisa)} saved`))) : '',
    scenarios.length ? briefList(scenarios.map((scenario) =>
      briefRow(scenario.title, escape(pretty(scenario.state)), money(scenario.pricePaisa)))) : '',
  ].join('');
  const savedAt = timestampValid(model.planning.updatedAt)
    ? `<p class="brief-note">Saved plan last recorded ${timeMarkup(model.planning.updatedAt)}</p>` : '';
  return `<div class="brief-workspace">
    ${section('From the Finance project', records.length
      ? briefList(records.map((doc) => `<li class="brief-list-row"><div>
          ${textLink(libraryHref(model.month, '', doc.id), doc.title)}
          <p>${escape(pretty(doc.kind))} · Published ${dateMarkup(doc.publishedAt)}${model.replacement.has(doc.id) ? ' · Superseded' : ''}</p>
        </div></li>`))
      : note(model.publications ? 'No decisions, plans or tracking records in the loaded publications.' : 'Publications are unavailable.'),
    textLink(libraryHref(model.month), 'All publications'))}
    ${section('Previously saved plan', savedAt + activity)}
  </div>`;
}

function snapshotRow(snapshot) {
  const basis = Object.hasOwn(basisLabels, snapshot.basis) ? basisLabels[snapshot.basis] : 'Basis unavailable';
  const source = typeof snapshot.sourceType === 'string' ? ` · ${escape(pretty(snapshot.sourceType))}` : '';
  return briefRow(accountLabel(snapshot.account),
    `${escape(basis)}${source}<br>As of ${dateMarkup(snapshot.asOf)}`, money(snapshot.amountPaisa));
}

function positionSnapshots(model, kind) {
  const matches = model.snapshots.filter((snapshot) => snapshot.kind === kind);
  if (matches.length) return briefList(matches.map(snapshotRow));
  if (!model.balances && !model.evidence) return note('Balance snapshots could not load.');
  if (!model.balances || model.balances.more) return note('No snapshots of this kind were returned in the available records.');
  const empty = {
    cash: 'No recorded bank balance snapshots are available.',
    investment: 'No dated investment market values are recorded.',
    debt: 'No statement amounts due or outstanding principal snapshots are recorded.',
  };
  return note(empty[kind]);
}

function positionActivity(model, selected) {
  const { ledger, monthly } = model;
  const { projected } = ledger;
  const entries = {
    cash: [
      ['Posted cash inflow', projected ? projected.postedCash?.inflowPaisa : monthly?.inflowPaisa, 'scope=cash-inflow'],
      ['Posted cash outflow', projected ? projected.postedCash?.outflowPaisa : monthly?.outflowPaisa, 'scope=cash-outflow'],
    ],
    investment: [
      ['Investment contributions', monthly?.investmentContributionPaisa, 'kind=investment_contribution'],
      ['Investment withdrawals', monthly?.investmentWithdrawalPaisa, 'kind=investment_withdrawal'],
    ],
    debt: [
      ['Loan proceeds', monthly?.loanDrawPaisa, 'kind=loan_draw'],
      ['Loan repayments', projected ? projected.reportedRepayments?.loanPaisa : monthly?.loanRepaymentPaisa, 'kind=loan_repayment'],
      ['Card settlements', projected ? projected.reportedRepayments?.cardPaisa : monthly?.cardSettlementPaisa, 'kind=card_settlement'],
    ],
  };
  const scoped = selected ? entries[selected] : Object.values(entries).flat();
  const rows = ledger.posted > 0 ? scoped.filter(([, amount]) => amountValid(amount) && amount > 0) : [];
  const coverage = `<p class="brief-note">${escape(model.monthReadFailed && !ledger.exists ? 'The monthly ledger could not load.' : coverageText(ledger))}${timestampValid(ledger.updatedAt)
    ? ` Ledger updated ${timeMarkup(ledger.updatedAt)}.` : ''}</p>`;
  const activityHref = (query) => `${href('transactions', ledger.month)}&status=posted&${query}`;
  const list = rows.length ? briefList(rows.map(([label, amount, query]) =>
    `<li class="brief-list-row">
      <div>${textLink(activityHref(query), label)}</div>
      <span class="brief-row-value">${escape(money(amount))}</span>
    </li>`)) : note(ledger.exists ? 'No classified amounts are available for this view and month.' : 'Monthly activity is unavailable.');
  const available = ledger.posted > 0 ? scoped.filter(([, amount]) => !amountValid(amount)) : [];
  const links = available.length ? `<div class="brief-activity-links">${available.map(([label, , query]) =>
    textLink(activityHref(query), `Browse ${label.toLowerCase()}`)).join('')}</div>` : '';
  const retryMonth = model.monthReadFailed ? retry('Retry monthly ledger') : '';
  return section('Recorded ledger activity · ' + monthLabel(ledger.month), coverage + list + links + retryMonth,
    textLink(href('sources', ledger.month), 'View coverage'));
}

function positionPage(route, model) {
  const selected = Object.hasOwn(positionLabels, route.positionKind) ? route.positionKind : positionViews[route.view] ?? '';
  const kinds = selected ? [selected] : Object.keys(positionLabels);
  const choices = [['', 'All'], ...Object.entries(positionLabels)];
  const details = kinds.map((kind) => section(positionLabels[kind], positionSnapshots(model, kind))).join('');
  const bounded = model.balances?.more ? note('The balance collection returned a bounded list of 100 records.')
    : !model.balances && model.evidence ? note('The Finance evidence read returns one snapshot per account and may omit other bases for that account.')
      : '';
  return `<div class="brief-workspace">
    ${listFilter('Position categories', choices, selected, (kind) => snapshotHref(model.month, kind))}
    <div class="position-scope">
      ${note('Snapshots show the latest dated evidence returned for each position. The selected month applies to ledger activity below.')}
      ${bounded}
    </div>
    ${details}
    ${!model.balances && !model.evidence ? retry('Retry balance records') : ''}
    ${positionActivity(model, selected)}
  </div>`;
}

export function renderDecisionWorkspace(route, result) {
  const model = briefModel(route, result);
  if (route.view === 'library') return publicationsPage(route, model);
  if (route.view === 'decisions') return readOnlyDecisions(model);
  if (route.view === 'position' || Object.hasOwn(positionViews, route.view)) return positionPage(route, model);
  return todayPage(model);
}
