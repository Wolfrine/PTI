export const categories = [
  'uncategorized', 'groceries', 'dining', 'transport', 'housing', 'utilities', 'shopping',
  'health', 'entertainment', 'travel', 'education', 'subscriptions', 'fees', 'tax', 'gifts', 'other',
];

export const kinds = {
  earned_income: 'Earned income', spend: 'Expense', refund: 'Refund', card_settlement: 'Card settlement',
  reimbursement: 'Reimbursement', internal_transfer: 'Internal transfer', investment_contribution: 'Investment contribution',
  investment_withdrawal: 'Investment withdrawal', loan_draw: 'Loan proceeds', loan_repayment: 'Loan repayment',
  fee: 'Fee', interest: 'Interest', unknown: 'Unclassified',
};

export const views = {
  today: { title: 'Your money, your decisions', nav: 'Today', icon: 'overview' },
  decisions: { title: 'Decisions and plans', nav: 'Decisions', icon: 'review' },
  library: { title: 'Your finance library', nav: 'Library', icon: 'reports' },
  overview: { title: 'Monthly overview', nav: 'Monthly history', icon: 'overview', month: true },
  transactions: { title: 'Transactions', nav: 'Transactions', icon: 'transactions', month: true },
  review: { title: 'Needs review', nav: 'Review', icon: 'review', month: true },
  accounts: { title: 'Accounts', nav: 'Accounts', icon: 'accounts' },
  income: { title: 'Income', nav: 'Income', icon: 'income', month: true },
  investments: { title: 'Investments', nav: 'Investments', icon: 'investments' },
  debts: { title: 'Debts', nav: 'Debts', icon: 'debts' },
  reports: { title: 'Monthly reports', nav: 'Reports', icon: 'reports', month: true },
  sources: { title: 'Sources and coverage', nav: 'Sources', icon: 'sources', month: true },
};

const zone = 'Asia/Kolkata';
const india = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const integer = new Intl.NumberFormat('en-IN');
const monthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortMonthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });
const dayFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone });
const momentFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone });
const indiaDate = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone });
const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => replacements[character]);
export const pretty = (value) => {
  const label = String(value ?? '').replaceAll('_', ' ');
  return label ? label[0].toUpperCase() + label.slice(1) : 'Unavailable';
};
export const monthValid = (month) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(month ?? '');
export const amountValid = Number.isSafeInteger;
export const stableId = (id) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
export function money(paisa) {
  if (!amountValid(paisa)) return 'Unavailable';
  const whole = Math.trunc(paisa / 100);
  const fraction = String(Math.abs(paisa % 100)).padStart(2, '0');
  return india.formatToParts(whole).map((part) => part.type === 'fraction' ? fraction : part.value).join('');
}
export const signed = (paisa, direction) => {
  if (!amountValid(paisa)) return 'Unavailable';
  const sign = direction === 'credit' ? '+' : direction === 'debit' ? '−' : '';
  return sign + money(Math.abs(paisa));
};
export const count = (value) => Number.isSafeInteger(value) && value >= 0 ? integer.format(value) : 'Unavailable';

function parsedDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return new Date(value);
  if (typeof value?.toDate === 'function') return value.toDate();
  return new Date(NaN);
}

export function date(value, withTime = false) {
  const parsed = parsedDate(value);
  return Number.isFinite(parsed.getTime()) ? (withTime ? momentFormatter : dayFormatter).format(parsed) : 'Unavailable';
}

export function currentDate() {
  const parts = Object.fromEntries(indiaDate.formatToParts().map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export const currentMonth = () => currentDate().slice(0, 7);

export function dateValid(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function monthFrom(month, offset = 0) {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function monthLabel(month, short = false) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')
    ? (short ? shortMonthFormatter : monthFormatter).format(new Date(`${month}-01T00:00:00Z`))
    : 'Unavailable';
}

export function calendarPeriod(month) {
  const [year, index] = month.split('-').map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10) };
}

function dateInMonth(month, day) {
  const lastDay = Number(calendarPeriod(month).to.slice(8));
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function historyPeriod(month, through) {
  const to = through ?? dateInMonth(month, Number(currentDate().slice(8)));
  const firstMonth = monthFrom(month, -36);
  const from = dateInMonth(firstMonth, Number(to.slice(8)));
  const buckets = Array.from({ length: 37 }, (_, offset) => {
    const key = monthFrom(firstMonth, offset);
    const calendar = calendarPeriod(key);
    const start = from > calendar.from ? from : calendar.from;
    const end = to < calendar.to ? to : calendar.to;
    return { month: key, from: start, to: end, clipped: start !== calendar.from || end !== calendar.to };
  });
  return { from, to, buckets };
}

export function routeFrom(hash, fallbackMonth) {
  const [view, search] = hash.replace(/^#\/?/, '').split('?', 2);
  const params = new URLSearchParams(search);
  const requestedMonth = params.get('month');
  const month = monthValid(requestedMonth) ? requestedMonth : fallbackMonth;
  const route = { view: Object.hasOwn(views, view) ? view : 'today', month };
  if(route.view==='library'){const doc=params.get('doc');if(typeof doc==='string'&&/^[a-z][a-z0-9-]{7,79}$/.test(doc))route.publication=doc;}
  const through = params.get('through');
  if (route.view === 'overview') {
    if (dateValid(through) && through.startsWith(`${month}-`)) route.through = through;
    const bucket = params.get('bucket');
    if (monthValid(bucket)) route.bucket = bucket;
  }
  if (['transactions', 'sources'].includes(route.view)) {
    const from = params.get('from');
    const to = params.get('to');
    const back = params.get('historyThrough');
    if (dateValid(from) && dateValid(to) && from.startsWith(`${month}-`) && to.startsWith(`${month}-`) && from <= to) {
      route.period = { from, to };
    }
    if (route.period && dateValid(back) && monthValid(back.slice(0, 7))) route.historyThrough = back;
    const reference = params.get(route.view === 'sources' ? 'window' : 'entry');
    if (params.get('report') === 'monthly') {
      route.fromReport = true;
      if (stableId(reference)) route.reference = reference;
      const revision = params.get('revision');
      if (/^[1-9]\d*$/.test(revision ?? '') && amountValid(Number(revision))) route.referenceRevision = Number(revision);
    }
  }
  return route;
}

export const href = (view, month) => `#${view}?month=${month}`;

export function filtersFrom(hash, route) {
  if (route.view !== 'transactions') return {};
  const params = new URLSearchParams(hash.split('?', 2)[1]);
  const category = params.get('category');
  const kind = params.get('kind');
  const status = params.get('status');
  return {
    category: categories.includes(category) ? category : '',
    kind: Object.hasOwn(kinds, kind) ? kind : '',
    status: ['posted', 'pending', 'review', 'excluded'].includes(status) ? status : '',
    spending: params.get('scope') === 'spending',
    cash: params.get('scope') === 'cash',
    cashOutflow: params.get('scope') === 'cash-outflow',
  };
}
