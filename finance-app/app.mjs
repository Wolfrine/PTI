import { connectFinance } from './finance-data.mjs';
import { calendarPeriod, currentMonth, filtersFrom, historyPeriod, monthFrom, routeFrom } from './values.mjs';
import { details, heading, navigation, render } from './views.mjs';
import { historyDetails, historyRows } from './history.mjs';
import { renderDecisionWorkspace } from './decisions.mjs';

const byId = (id) => document.getElementById(id);
const gate = byId('gate');
const workspace = byId('workspace');
const viewHeading = byId('view-heading');
const content = byId('view-content');
const dialog = byId('transaction-dialog');
const authButton = byId('sign-in');
const gateMessage = byId('gate-message');
const retryAccess = byId('retry-access');
const menu = byId('menu-toggle');
const skipLink = document.querySelector('.skip-link');
const initialMonth = currentMonth();

let api;
let identity = null;
let owner = null;
let identityVersion = 0;
let viewVersion = 0;
let route = routeFrom(location.hash, initialMonth);
let filters = filtersFrom(location.hash, route);
let result;
let dialogEntry = null;
let detailVersion = 0;
const pageState = { loading: false, error: false };
const EDGE_LIMIT = 500;

function showGate(message, options = {}) {
  gateMessage.textContent = message;
  authButton.hidden = !options.signIn;
  retryAccess.hidden = !options.retry;
  byId('gate-sign-out').hidden = !identity;
  gate.hidden = false;
  workspace.hidden = true;
  skipLink.hidden = true;
}

function announce(message = '') {
  const notice = byId('notice');
  notice.textContent = message;
  notice.hidden = !message;
}

function clearWorkspace() {
  ++viewVersion;
  ++detailVersion;
  owner = null;
  result = null;
  dialogEntry = null;
  dialog.close();
  dialog.replaceChildren();
  content.replaceChildren();
  viewHeading.replaceChildren();
  byId('finance-nav').replaceChildren();
  announce();
}

function suspendAccess() {
  clearWorkspace();
  showGate('Finance could not confirm access to the ledger. Retry the connection or sign out.', { retry: true });
}

async function identify(user) {
  const version = ++identityVersion;
  identity = user;
  clearWorkspace();
  if (!user) {
    showGate('Sign in to open your private ledger.', { signIn: true });
    return;
  }
  if (!user.emailVerified || !user.providerData.some((provider) => provider.providerId === 'google.com')) {
    showGate('Finance requires a verified Google account with owner access.');
    return;
  }
  showGate('Checking access to Finance…');
  try {
    await api.verifyOwner(user.uid);
    if (version !== identityVersion) return;
    owner = user;
    workspace.hidden = false;
    skipLink.hidden = false;
    gate.hidden = true;
    await loadView();
  } catch (error) {
    if (version !== identityVersion) return;
    if (error.code === 'permission-denied') showGate('This Google account does not have access to Finance.');
    else showGate('Finance could not verify access. Check your connection and retry.', { retry: true });
  }
}

async function start() {
  try {
    api = await connectFinance();
    api.watchIdentity(identify);
  } catch {
    showGate('Sign-in could not load. Check your connection and retry.', { retry: true });
  }
}

async function capture(promise) {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    return { ok: false, error: error.code };
  }
}

function active(version, uid) {
  return version === viewVersion && uid === owner?.uid;
}

function renderView() {
  if (!owner || !result) return;
  viewHeading.innerHTML = heading(route, result.month?.data);
  content.innerHTML = ['today','decisions','library'].includes(route.view) ? renderDecisionWorkspace(route,result) : render(route,result,filters,pageState);
  const currentMark = content.querySelector('.history-mark[aria-pressed="true"]');
  if (currentMark) {
    const plot = content.querySelector('.history-scroll');
    plot.scrollLeft = currentMark.offsetLeft - (plot.clientWidth - currentMark.offsetWidth) / 2;
  }
  content.setAttribute('aria-busy', 'false');
}

async function loadView({ moveFocus = false } = {}) {
  if (!owner) return;
  const version = ++viewVersion;
  const uid = owner.uid;
  route = routeFrom(location.hash, route.month);
  filters = filtersFrom(location.hash, route);
  const { view, month } = route;
  const period = route.period ?? calendarPeriod(month);
  if (view === 'overview') route.history = historyPeriod(month, route.through);
  result = null;
  pageState.loading = false;
  pageState.error = false;
  viewHeading.innerHTML = heading(route);
  byId('finance-nav').innerHTML = navigation(route);
  menu.setAttribute('aria-expanded', 'false');
  content.setAttribute('aria-busy', 'true');
  content.innerHTML = '<div class="surface loading" role="status">Loading ledger…</div>';
  if (moveFocus) byId('page').focus();

  const tasks = {};
  const readMonth = (entryMonth) => api.detail(uid, 'months', entryMonth);
  if(['today','decisions','library'].includes(view)){
    tasks.planning=api.planning(owner,{action:'read'});
    if(view!=='library'){tasks.decisionMonths=api.monthRange(uid,monthFrom(currentMonth(),-12),currentMonth());tasks.balances=api.collection(uid,'balances');}
  }
  if (['overview', 'income', 'reports', 'sources', 'transactions', 'review'].includes(view)) tasks.month = readMonth(month);
  if (route.reference) tasks.reference = api.detail(uid, view === 'sources' ? 'sourceWindows' : 'transactions', route.reference);
  if (!route.reference && ['overview', 'transactions', 'review'].includes(view)) {
    tasks.rows = api.page(uid, view === 'review' ? 'reviews' : 'transactions', period, null);
  }
  if (view === 'overview') {
    const { buckets } = route.history;
    tasks.history = api.monthRange(uid, buckets[0].month, buckets.at(-1).month);
    for (const bucket of buckets.filter((entry) => entry.clipped)) {
      tasks[`edge:${bucket.month}`] = api.page(uid, 'transactions', bucket, null, EDGE_LIMIT);
    }
    tasks.recurring = api.collection(uid, 'recurring', 'lastOccurredOn');
  }
  if (['accounts', 'investments', 'debts'].includes(view)) tasks.balances = api.collection(uid, 'balances');
  if (view === 'sources' && !route.reference) {
    tasks.sources = api.collection(uid, 'sourceStatus');
    tasks.scan = api.detail(uid, 'scanStatus', 'gmail');
    tasks.windows = api.sourceWindows(uid, month);
  }

  const captured = await Promise.all(Object.entries(tasks).map(async ([name, task]) => [name, await capture(task)]));
  if (!active(version, uid)) return;
  if (captured.some(([, read]) => read.error === 'permission-denied' || read.error === 'unauthenticated' || read.error === 'owner_authorization_required' || read.error === 'sign_in_required')) {
    suspendAccess();
    return;
  }
  result = Object.fromEntries(captured);
  renderView();
}

async function loadMore() {
  if (!owner || !result?.rows?.data?.more || pageState.loading) return;
  const version = viewVersion;
  const uid = owner.uid;
  pageState.loading = true;
  pageState.error = false;
  renderView();
  const current = result.rows.data;
  const period = route.period ?? calendarPeriod(route.month);
  const next = await capture(api.page(uid, route.view === 'review' ? 'reviews' : 'transactions', period, current.cursor));
  if (!active(version, uid)) return;
  if (next.error === 'permission-denied' || next.error === 'unauthenticated') {
    suspendAccess();
    return;
  }
  pageState.loading = false;
  pageState.error = !next.ok;
  if (next.ok) {
    const known = new Set(current.list.map((row) => row.id));
    result.rows.data = { ...next.data, list: [...current.list, ...next.data.list.filter((row) => !known.has(row.id))] };
  }
  renderView();
  (content.querySelector('[data-more]') ?? content.querySelector('.ledger li:last-child .ledger-row'))?.focus({ preventScroll: true });
}

function dialogMessage(title, message) {
  // Both strings are internal status messages.
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="detail-heading">${title}</h2><button type="button" class="button" data-close-dialog>Close</button></div><p role="status">${message}</p>`;
}

async function openEntry(id) {
  if (!owner || dialog.open) return;
  const fromList = result?.rows?.data?.list.some((row) => (row.eventId ?? row.id) === id);
  const fromReport = route.view === 'transactions' && result?.reference?.data?.id === id && result.reference.data.month === route.month;
  if (!fromList && !fromReport) return;
  const version = ++detailVersion;
  const uid = owner.uid;
  dialogMessage('Transaction details', 'Loading source and classification…');
  dialog.showModal();
  const entry = await capture(api.detail(uid, 'transactions', id));
  if (version !== detailVersion || !dialog.open || uid !== owner?.uid) return;
  if (entry.error === 'permission-denied' || entry.error === 'unauthenticated') {
    suspendAccess();
    return;
  }
  if (!entry.ok || !entry.data) {
    dialogMessage('Transaction details', entry.ok ? 'This entry is no longer in the ledger.' : 'Details could not load. Close and try again.');
    return;
  }
  dialogEntry = entry.data;
  dialog.innerHTML = details(dialogEntry);
  dialog.querySelector('button').focus({ preventScroll: true });
}

authButton.addEventListener('click', async () => {
  authButton.disabled = true;
  gateMessage.textContent = 'Continue in the Google sign-in window.';
  try {
    await api.signIn();
  } catch (error) {
    gateMessage.textContent = error.code === 'auth/popup-blocked' ? 'Allow the Google sign-in popup and try again.'
      : error.code === 'auth/unauthorized-domain' ? 'This address is not configured for PTI sign-in. Open Finance from PTI Home.'
        : 'Google sign-in did not complete. Try again.';
  } finally {
    authButton.disabled = false;
  }
});

retryAccess.addEventListener('click', () => {
  if (api) void identify(identity);
  else void start();
});

async function signOut() {
  ++identityVersion;
  clearWorkspace();
  showGate('Signing out…');
  try {
    await api.signOut();
  } catch {
    showGate('Sign-out could not be confirmed. Try again.');
  }
}

for (const id of ['sign-out', 'gate-sign-out']) byId(id).addEventListener('click', signOut);
menu.addEventListener('click', () => menu.setAttribute('aria-expanded', String(menu.getAttribute('aria-expanded') !== 'true')));
skipLink.addEventListener('click', (event) => { event.preventDefault(); byId('page').focus(); });

window.addEventListener('hashchange', () => {
  announce();
  dialog.close();
  void loadView({ moveFocus: true });
});

byId('page').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button?.hasAttribute('data-refresh')) void loadView();
  if (button?.hasAttribute('data-more')) void loadMore();
  if (button?.dataset.entry) void openEntry(button.dataset.entry);
  if (button?.dataset.historyMonth && route.history && result?.history?.ok) {
    const selected = historyRows(route.history, result).find((bucket) => bucket.month === button.dataset.historyMonth);
    if (!selected) return;
    for (const mark of content.querySelectorAll('[data-history-month]')) mark.setAttribute('aria-pressed', String(mark === button));
    byId('history-detail').innerHTML = historyDetails(selected, route.history.to);
  }
});

dialog.addEventListener('click',event=>{if(event.target.closest('[data-close-dialog]'))dialog.close();});
dialog.addEventListener('close', () => {
  ++detailVersion;
  dialogEntry = null;
  dialog.replaceChildren();
});

void start();
