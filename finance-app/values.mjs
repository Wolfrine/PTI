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
  overview: { title: 'Monthly overview', nav: 'Overview', icon: 'overview', month: true },
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
const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => replacements[character]);
export const pretty = (value) => {
  const label = String(value ?? '').replaceAll('_', ' ');
  return label ? label[0].toUpperCase() + label.slice(1) : 'Unavailable';
};
export const monthValid = (month) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(month ?? '');
export const amountValid = Number.isSafeInteger;
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

export function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: '2-digit', timeZone: zone }).formatToParts();
  return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}`;
}

export function monthFrom(month, offset = 0) {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function monthLabel(month, short = false) {
  return monthValid(month) ? (short ? shortMonthFormatter : monthFormatter).format(new Date(`${month}-01T00:00:00Z`)) : 'Unavailable';
}

export function routeFrom(hash, fallbackMonth) {
  const [view, search] = hash.replace(/^#\/?/, '').split('?', 2);
  const requestedMonth = new URLSearchParams(search).get('month');
  return { view: Object.hasOwn(views, view) ? view : 'overview', month: monthValid(requestedMonth) ? requestedMonth : fallbackMonth };
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
  };
}
