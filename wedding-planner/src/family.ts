import { createWeddingStore, type StoreState } from './store';
import {
  empty,
  escapeHtml as esc,
  formatDate,
  formatTime,
  localInput,
  toInstant,
  attendanceCounts,
  stayDemand,
  type CollectionName,
  type Payload,
  type WeddingRecord,
  type EventRecord,
  type GuestRecord,
} from './model';
import { brand, leaf, icon, badge, menuMarkup, foodIllustration } from './presentation';
import {parseMenu,filterMenu} from './menu';
import {foodArt} from './food-art';
import {startPwa} from './pwa';
import { ownerUid } from './config';
const root = document.querySelector<HTMLDivElement>('#app')!,
  dialog = document.querySelector<HTMLDialogElement>('#editor')!;
let current: StoreState,
  guestSearch = '',
  dayFilter = 'all',
  menuSearch = '',
  taskFilter = 'open',
  compareA = '',
  compareB = '',
  accessSearch = '',
  accessFilter = 'all',
  returnFocus: HTMLElement | null = null,
  toastTimer: ReturnType<typeof setTimeout>;
type Draft = { base: Payload; revision?: number; fields: Payload };
const drafts = new Map<string, Draft>();
type AccessRole = 'pending' | 'viewer' | 'family' | 'admin' | 'blocked';
const roleDrafts = new Map<string, { role: AccessRole; expectedRole: string }>();
const roleErrors = new Map<string, string>();
const roleSaving = new Set<string>();
let activeDraftKey: string | null = null;
const store = createWeddingStore((state) => {
  current = state;
  render();
});
const path = () => {
  try {
    return location.hash
      .replace(/^#\/?/, '')
      .split('?')[0]
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
  } catch {
    return ['home'];
  }
};
const href = (s: string) => `#/${s}`,
  idPath = (base: string, id: string) =>
    href(`${base}/${encodeURIComponent(id)}`);
const edit = (c: CollectionName, id: string, s: string, label: string) =>
  current.canEdit ? `<button class="text-button" data-edit="${c}" data-id="${esc(id)}" data-section="${s}">${label} <span aria-hidden="true">↗</span></button>` : '';
const add = (c: CollectionName, label: string, s: string) =>
  current.canEdit ? `<button class="button" data-add="${c}" data-section="${s}"><span aria-hidden="true">+</span> ${label}</button>` : '';
const eventTitle = (id: string) =>
  current.records.events.find((e) => e.id === id)?.title ||
  (id ? 'Archived occasion' : 'Across the celebration');
const eventHref = (e: EventRecord) =>
  idPath(e.kind === 'function' ? 'occasions' : 'catering', e.id);
const emptyView = (title: string, text: string, action = '') =>
  `<div class="empty-state">${leaf}<h2>${title}</h2><p>${text}</p>${action}</div>`;
const crumbs = (a: [string, string?][]) =>
  `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="#/home">Family home</a>${a.map(([s, to]) => `<span aria-hidden="true">›</span>${to ? `<a href="${to}">${esc(s)}</a>` : `<span aria-current="page">${esc(s)}</span>`}`).join('')}</nav>`;
const pageHead = (title: string, sub = '', action = '') =>
  `<div class="page-heading"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${action}</div>`;
const stamp = (r: WeddingRecord) =>
  `<details class="record-source"><summary>Source & update details</summary>${'source' in r && r.source ? `<p>${esc(r.source)}</p>` : ''}<p>Updated ${esc(formatTime(r.updatedAt))} · revision ${r.revision}</p></details>`;
const fact = (label: string, value: string) =>
  `<div${value.length > 22 ? ' class="fact-long"' : ''}><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
const menuSearchbar = () => `<div class="menu-searchbar"><label for="menu-search" class="sr-only">Search dishes or categories</label><input id="menu-search" type="search" placeholder="Find a dish or category" value="${esc(menuSearch)}" autocomplete="off">${menuSearch ? '<button type="button" class="text-button" data-clear-menu>Clear</button>' : ''}</div>`;
const serviceIllustration = (event: EventRecord) => foodArt(event.title).key === 'setting'
  ? foodIllustration('',parseMenu(event.menuText).sections[0]?.title || '', 'service-art')
  : foodIllustration(event.title,'','service-art');
function header() {
  return `<header class="app-header">${brand('#/home')}<a class="family-brand" href="#/home"><strong>Family workspace</strong><span>MAHIMA & MAYANK</span></a><a class="invitation-link" href="/">The invitation ↗</a><details class="account-menu"><summary aria-label="Family account menu">${esc((current.user?.displayName || current.user?.email || 'F').slice(0, 1).toUpperCase())}</summary><div class="account-menu-panel"><p>${esc(current.user?.displayName || 'Family member')}<small>${current.isAdmin ? 'Admin' : current.canEdit ? 'Family' : 'Viewer'}</small></p>${current.isAdmin ? '<a class="text-button" href="#/access">Manage family access</a>' : ''}<button class="text-button" type="button" data-pwa-install>Install wedding app</button><button class="text-button" data-action="export">Export private plan</button><button class="text-button" data-action="sign-out">Sign out</button></div></details></header>`;
}
function accessPage() {
  if (!current.isAdmin) return `${crumbs([['Family access']])}${emptyView('Admins manage family access.', 'Your account can open the plan with its current role. Speak with an admin if your access needs to change.', '<a class="button button-secondary" href="#/home">Back to family home</a>')}`;
  const people = new Map<string, { email: string; name: string; uid?: string; lastSeenAt?: string; role: string }>();
  for (const profile of current.accessRequests) {
    const email = profile.email.toLowerCase();
    const member = current.members.find(m => m.email.toLowerCase() === email);
    const previous = people.get(email);
    if (!previous || (profile.lastSeenAt || '') > (previous.lastSeenAt || '')) people.set(email, { ...profile, role: profile.uid === ownerUid ? 'admin' : member?.role || 'pending' });
  }
  for (const member of current.members) if (!people.has(member.email.toLowerCase())) people.set(member.email.toLowerCase(), { ...member, role: member.role });
  if (current.isOwner && current.user?.email && ![...people.values()].some(p => p.uid === ownerUid)) people.set(current.user.email.toLowerCase(), { uid: ownerUid, email: current.user.email, name: current.user.displayName || 'Workspace owner', role: 'admin' });
  if (![...people.values()].some(p => p.uid === ownerUid)) people.set('__protected_owner__', { uid: ownerUid, email: '', name: 'Workspace owner', role: 'admin' });
  const normalizedRole = (role: string) => role === 'editor' ? 'family' : role as AccessRole;
  const roleName = (role: string) => ({ pending: 'Awaiting approval', viewer: 'Viewer', family: 'Family', editor: 'Family', admin: 'Admin', blocked: 'Blocked' })[role as AccessRole] || role;
  const rows = [...people.values()].sort((a,b) => Number(b.uid === ownerUid) - Number(a.uid === ownerUid) || Number(b.role === 'pending') - Number(a.role === 'pending') || (a.name || a.email).localeCompare(b.name || b.email));
  const filtered = rows.filter(p => (`${p.name} ${p.email}`.toLowerCase().includes(accessSearch.toLowerCase())) && (accessFilter === 'all' || accessFilter === 'pending' && p.role === 'pending' || accessFilter === 'active' && !['pending','blocked'].includes(p.role) || accessFilter === 'blocked' && p.role === 'blocked'));
  const pending = rows.filter(p => p.role === 'pending').length;
  return `${crumbs([['Family access']])}${pageHead('Family access.')}<div class="access-intro"><p>Choose who can read, plan or manage access. Accounts appear after Google sign-in.</p><details class="role-guide"><summary>What each role can do</summary><dl>${[['Admin','Read and edit the plan, and manage family access.'],['Family','Read and edit the plan.'],['Viewer','Read the plan without making changes.'],['Awaiting approval','Signed in, without access to the private plan.'],['Blocked','Cannot open the private plan.']].map(([role, text]) => `<div><dt>${role}</dt><dd>${text}</dd></div>`).join('')}</dl></details></div><div class="access-toolbar"><div class="filter-tabs" aria-label="Filter family accounts">${[['all','All accounts'],['pending',`Awaiting approval${pending ? ` · ${pending}` : ''}`],['active','With access'],['blocked','Blocked']].map(([value,label]) => `<button data-access-filter="${value}" class="${accessFilter === value ? 'selected' : ''}">${label}</button>`).join('')}</div><label class="search-field"><span class="sr-only">Search family accounts</span><input id="access-search" placeholder="Search names or emails" value="${esc(accessSearch)}"></label></div><div class="access-list panel"><div class="access-column-head" aria-hidden="true"><span>Google account</span><span>Current role</span><span>Change access</span></div>${filtered.length ? filtered.map(person => {
    const owner = person.uid === ownerUid;
    const value = roleDrafts.get(person.email)?.role || normalizedRole(person.role);
    const label = roleName(person.role);
    return `<article class="access-row${owner ? ' access-owner' : ''}" data-access-email="${esc(person.email)}"><div class="access-person"><span class="person-initial" aria-hidden="true">${esc((person.name || person.email).slice(0,1))}</span><div><h2>${esc(person.name || person.email)}</h2><p>${esc(person.email || 'Protected account')}</p>${person.lastSeenAt ? `<small>Signed in ${esc(formatTime(person.lastSeenAt))}</small>` : owner ? '<small>Always has admin access</small>' : '<small>Invited account · not signed in yet</small>'}</div></div><div class="access-current"><span class="role-label role-${owner ? 'admin' : normalizedRole(person.role)}">${owner ? 'Admin' : label}</span>${owner ? '<small>Workspace owner</small>' : ''}</div>${owner ? `<div class="protected-access">${icon('lock')}<span>Protected access</span></div>` : `<form class="role-form" data-role-form="${esc(person.email)}"><label class="sr-only" for="role-${esc(person.email)}">Role for ${esc(person.name || person.email)}</label><select id="role-${esc(person.email)}" data-role-email="${esc(person.email)}" data-current-role="${esc(person.role)}"${roleSaving.has(person.email) ? ' disabled' : ''}>${(['pending','viewer','family','admin','blocked'] as AccessRole[]).map(role => `<option value="${role}"${value === role ? ' selected' : ''}>${roleName(role)}</option>`).join('')}</select><button class="button button-secondary" type="submit" data-role-save="${esc(person.email)}"${roleSaving.has(person.email) || value === normalizedRole(person.role) ? ' disabled' : ''}>${roleSaving.has(person.email) ? 'Saving…' : 'Save'}</button>${roleErrors.has(person.email) ? `<div class="role-error"><p role="alert">${esc(roleErrors.get(person.email)!)}</p><button type="button" class="text-button" data-role-reset="${esc(person.email)}">Use current role</button></div>` : ''}</form>`}</article>`;
  }).join('') : emptyView(accessSearch ? 'No matching accounts.' : 'No accounts in this group.', accessSearch ? 'Try another name or email.' : 'Accounts appear here when someone signs in with Google.', '<button class="button button-secondary" data-action="clear-access">Show all accounts</button>')}</div>`;
}
function render() {
  if (!current) return;
  if (!current.isAdmin) {
    roleDrafts.clear();
    roleErrors.clear();
  }
  if (!current.canEdit && dialog.open) {
    dialog.close();
    dialog.innerHTML = '';
    drafts.clear();
  }
  if (current.access !== 'ready') {
    clearTimeout(toastTimer);
    const notice = document.querySelector<HTMLElement>('#toast');
    if (notice) { notice.textContent = ''; notice.classList.remove('visible'); }
    drafts.clear();
    if (dialog.open) dialog.close();
    dialog.innerHTML = '';
    const pending = current.access === 'pending';
    const blocked = current.role === 'blocked';
    root.innerHTML = `<header class="app-header login-header">${brand('/')}<a class="invitation-link" href="/">The invitation ↗</a></header><main id="workspace" class="login-main"><div class="login-scene" aria-hidden="true"></div><section class="login-copy"><p class="eyebrow">MAHIMA & MAYANK · FAMILY</p><h1>${pending ? 'You’re signed in.' : blocked ? 'Family access is paused.' : 'Welcome, family.'}</h1><p>${pending ? 'An admin will review your account before you can open the private family plan.' : blocked ? 'This account cannot open the private family plan. Please speak with a family admin if you need access.' : 'A shared place for the people and details behind the celebration.'}</p>${current.access === 'loading' ? '<p class="loading" role="status">Opening the family workspace…</p>' : current.user ? `<div class="signed-in-identity"><span class="identity-initial">${esc((current.user.displayName || current.user.email || 'F').slice(0,1))}</span><div><strong>${esc(current.user.displayName || 'Google account')}</strong><span>${esc(current.user.email || '')}</span></div><span class="role-label role-${pending ? 'pending' : blocked ? 'blocked' : 'viewer'}">${pending ? 'Awaiting approval' : blocked ? 'Blocked' : 'Access unavailable'}</span></div>${pending ? '<p class="small-copy">This page will open the workspace when your access is approved.</p>' : ''}` : '<button class="button google-button" data-action="sign-in"><b aria-hidden="true">G</b> Continue with Google</button><p class="small-copy">Sign in to request family access.</p>'}${current.error && !pending && !blocked ? `<div class="inline-alert" role="alert">${esc(current.error)}</div>` : ''}${current.user ? '<button class="text-button" data-action="sign-out">Use another account</button>' : ''}</section></main>`;
    bind();
    return;
  }
  const [s = 'home', id, sub] = path();
  let html = '';
  if (s === 'home') html = home();
  else if (s === 'catering')
    html = id === 'compare' ? compareMenus() : id ? mealDetail(id) : catering();
  else if (s === 'occasions') html = id ? occasionDetail(id) : home();
  else if (s === 'guests') html = id ? guestDetail(id) : guests();
  else if (s === 'stays') html = id ? stayDetail(id) : stays();
  else if (s === 'tasks')
    html =
      id === 'decision' && sub
        ? decisionDetail(sub)
        : id === 'arrangement' && sub
          ? arrangementDetail(sub)
          : tasks();
  else if (s === 'attendance') html = attendance(id);
  else if (s === 'access') html = accessPage();
  else
    html = emptyView(
      'This page has moved.',
      'Return to the family home to find the current plan.',
      '<a class="button" href="#/home">Family home</a>',
    );
  root.innerHTML = `${current.demo ? '<div class="demo-banner">LOCAL PREVIEW · Example records · Changes stay in this tab</div>' : ''}${header()}<main id="workspace" class="family-main">${current.offline ? '<div class="inline-alert" role="alert">You are offline. Reconnect before saving changes.</div>' : ''}${!current.canEdit ? '<p class="viewer-notice">'+icon('lock')+'<span><strong>Viewer access</strong> · You can read the family plan. An admin can change your role.</span></p>' : ''}${html}</main>`;
  bind();
}
function home() {
  const functions = current.records.events
    .filter((e) => e.kind === 'function')
    .sort(
      (a, b) =>
        (a.date || '9999').localeCompare(b.date || '9999') ||
        a.startAt.localeCompare(b.startAt),
    );
  const entrances = [
    ['catering', 'food', 'Catering', 'Menus, meals & hospitality'],
    ['guests', 'guests', 'Guests', 'People, households & attendance'],
    ['stays', 'stay', 'Stays & Travel', 'Arrivals, rooms & getting there'],
    [
      'tasks',
      'tasks',
      'Tasks & Decisions',
      'Responsibilities & things to agree',
    ],
  ];
  return `<section class="family-welcome"><div><p class="eyebrow">18–20 JANUARY 2027</p><h1>Welcome, family.</h1></div><div class="welcome-scene" aria-hidden="true"></div></section><section class="timeline panel"><div class="section-heading"><h2>${icon('calendar')}The celebration</h2>${add('events', 'Add', 'function')}</div>${functions.length ? functions.map((e) => `<a class="timeline-event" href="${eventHref(e)}"><div class="timeline-date"><strong>${e.date ? Number(e.date.slice(-2)) : '—'}</strong><small>${e.date ? esc(new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(e.date + 'T12:00:00Z'))) : 'DATE'}</small></div><div class="timeline-info"><h3>${esc(e.title)}</h3><p>${!e.startAt && !e.venue ? 'Timing & venue to confirm' : (e.startAt ? esc(formatTime(e.startAt)) : 'Timing to confirm') + ' · ' + esc(e.venue || 'Venue to confirm')}</p></div>${badge(e.status)}<span class="row-arrow" aria-hidden="true">›</span></a>`).join('') : emptyView('The programme is taking shape.', 'Record functions as they are discussed. Meals and food counters have their own place in Catering.')}</section><div class="entrances">${entrances.map(([to, name, title, text]) => `<a class="entrance entrance-${name}" href="#/${to}"><span class="entrance-icon">${icon(name)}</span><div><h2>${title}</h2><p>${text}</p></div><span class="card-arrow" aria-hidden="true">↗</span></a>`).join('')}</div>`;
}
function catering() {
  const services = current.records.events
    .filter((e) => e.kind !== 'function' || e.menuText.trim())
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const dates = [...new Set(services.map((e) => e.date))].sort((a, b) =>
    (a || '9999').localeCompare(b || '9999'),
  );
  if (dayFilter !== 'all' && !dates.includes(dayFilter)) dayFilter = 'all';
  const filtered = services.filter(
      (e) => (dayFilter === 'all' || e.date === dayFilter) && (!menuSearch.trim() || filterMenu(parseMenu(e.menuText),menuSearch).length || e.title.toLocaleLowerCase().includes(menuSearch.toLocaleLowerCase())),
    ),
    groups = new Map<string, EventRecord[]>();
  for (const e of filtered)
    groups.set(e.date, [...(groups.get(e.date) || []), e]);
  return `${crumbs([['Catering']])}<div class="catering-head">${pageHead('Catering.', 'Meals, menus & food counters.', add('events', 'Add service', 'service'))}</div><div class="list-toolbar"><div class="filter-tabs" aria-label="Filter catering by day"><button data-day="all" class="${dayFilter === 'all' ? 'selected' : ''}">Whole stay</button>${dates.map((d) => `<button data-day="${d}" class="${dayFilter === d ? 'selected' : ''}">${d ? esc(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'))) : 'Undated'}</button>`).join('')}</div><a class="text-button" href="#/catering/compare">Compare menus ↗</a></div>${menuSearchbar()}${
    filtered.length
      ? `<div class="catering-days">${[...groups]
          .map(([date, rows]) => {
            const same = rows.every((e) => e.status === rows[0].status);
            return `<section class="catering-day panel"><div class="day-heading"><h2>${esc(date ? formatDate(date) : 'Date to confirm')}</h2>${same ? badge(rows[0].status) : ''}</div>${rows.map((e) => `<a class="catering-row" href="${idPath('catering', e.id)}">${serviceIllustration(e)}<div><h3>${esc(e.title)}</h3><p>${e.kind === 'food-counter' ? 'Food counter' : e.kind === 'meal' ? 'Meal' : 'Function & catering'} · ${e.menuText ? 'Menu recorded' : 'Menu to plan'}</p></div>${same ? '' : badge(e.status)}<span class="row-arrow" aria-hidden="true">›</span></a>`).join('')}</section>`;
          })
          .join('')}</div>`
      : emptyView(
          menuSearch ? 'No matching meals or menus.' : 'A thoughtful meal starts here.',
          menuSearch ? 'Try another dish or category, or clear the search.' : 'Record a proposed meal or food counter, then plan its menu.',
          menuSearch ? '<button class="button button-secondary" data-clear-menu>Clear search</button>' : add('events', 'Add a service', 'service'),
        )
  }`;
}
function mealDetail(id: string) {
  const e = current.records.events.find((e) => e.id === id);
  if (!e) return missing('Catering', 'catering');
  return `${crumbs([['Catering', href('catering')], ['Menu']])}<div class="detail-heading"><div><p class="eyebrow">${esc(e.date ? formatDate(e.date) : 'DATE TO CONFIRM')}</p><h1>${esc(e.title)}</h1></div>${badge(e.status)}</div><div class="meal-layout"><section class="reading-menu panel"><div class="section-heading"><h2>Menu</h2>${edit('events', e.id, 'menu', 'Edit menu')}</div>${menuSearchbar()}${menuMarkup(e.menuText,{query:menuSearch})}<p class="art-caption">Illustrations are indicative; the written menu is the reference.</p><details class="recorded-menu"><summary>Menu as recorded</summary><pre>${esc(e.menuText)}</pre></details></section><aside class="detail-aside"><section class="service-context panel"><h2>Service details</h2>${e.startAt || e.venue || e.owner ? `<dl class="facts">${fact('Service time', e.startAt ? formatTime(e.startAt) : 'To confirm')}${fact('Venue', e.venue || 'To confirm')}${fact('Family owner', e.owner || 'To assign')}</dl>` : '<p>Timing, venue and family owner to confirm.</p>'}${edit('events', e.id, 'timing', 'Edit timing & venue')}</section><a class="context-action" href="${idPath('attendance', e.id)}">${icon('guests')}<span>${current.canEdit ? 'Manage attendance' : 'View attendance'}</span><span aria-hidden="true">↗</span></a>${relatedArrangements(e.id)}${e.notes ? `<details class="context-notes"><summary>Planning notes</summary><p>${esc(e.notes)}</p>${edit('events', e.id, 'notes', 'Edit notes')}</details>` : ''}${stamp(e)}</aside></div>`;
}
function occasionDetail(id: string) {
  const e = current.records.events.find((e) => e.id === id);
  if (!e) return missing('Family home', 'home');
  return `${crumbs([[e.title]])}<div class="detail-heading"><div><p class="eyebrow">${esc(e.date ? formatDate(e.date) : 'DATE TO CONFIRM')}</p><h1>${esc(e.title)}</h1></div>${badge(e.status)}</div><div class="read-grid"><section class="panel read-card"><div class="section-heading"><h2>The occasion</h2>${edit('events', e.id, 'timing', 'Edit details')}</div><dl class="facts">${fact('Starts', e.startAt ? formatTime(e.startAt) : 'Time to confirm')}${e.arrivalAt ? fact('Arrival from', formatTime(e.arrivalAt)) : ''}${fact('Venue', e.venue || 'To confirm')}${e.address ? fact('Address', e.address) : ''}${fact('Family owner', e.owner || 'To assign')}${e.audience ? fact('For', e.audience) : ''}</dl>${e.mapUrl ? `<a class="text-button" href="${esc(e.mapUrl)}" target="_blank" rel="noopener">Open directions ↗</a>` : ''}</section><div><a class="context-action" href="${idPath('catering', e.id)}">${icon('food')}<span>Catering & menu</span><span>↗</span></a><a class="context-action" href="${idPath('attendance', e.id)}">${icon('guests')}<span>${current.canEdit ? 'Manage attendance' : 'View attendance'}</span><span>↗</span></a>${relatedArrangements(e.id)}</div></div>${e.notes ? `<section class="panel read-card lower"><h2>Planning notes</h2><p class="preserve-lines">${esc(e.notes)}</p>${edit('events', e.id, 'notes', 'Edit notes')}</section>` : ''}${stamp(e)}`;
}
function compareMenus() {
  const events = current.records.events
    .filter((e) => e.menuText.trim())
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  if (!events.length)
    return `${crumbs([['Catering', href('catering')], ['Compare menus']])}${emptyView('Menus are still to come.', 'Record a menu first, then compare it with another occasion.', '<a class="button" href="#/catering">Open catering</a>')}`;
  if (!events.some((e) => e.id === compareA))
    compareA = events.find((e) => e.kind === 'function')?.id || events[0].id;
  if (!events.some((e) => e.id === compareB) || compareB === compareA)
    compareB =
      events.find((e) => e.id !== compareA && !e.date)?.id ||
      events.find((e) => e.id !== compareA)?.id ||
      '';
  const selected = [
    events.find((e) => e.id === compareA),
    events.find((e) => e.id === compareB),
  ].filter((e): e is EventRecord => !!e);
  const selector = (key: string, value: string, label: string) =>
    `<label>${label}<select data-compare="${key}" aria-label="${label}">${events.map((e) => `<option value="${esc(e.id)}"${e.id === value ? ' selected' : ''}>${esc(e.title)} · ${esc(e.date ? formatDate(e.date) : 'Undated')}</option>`).join('')}</select><small class="compare-selected-date">${esc(events.find(e=>e.id===value)?.date ? formatDate(events.find(e=>e.id===value)!.date) : 'Date to confirm')}</small></label>`;
  return `${crumbs([['Catering', href('catering')], ['Compare menus']])}${pageHead('Two menus, together.', 'Choose the meals or occasions you want to compare.')}<div class="compare-controls">${selector('a', compareA, 'First menu')}${selector('b', compareB, 'Compare with')}</div>${menuSearchbar()}<div class="comparison-grid">${selected.map((e) => `<section class="panel reading-menu"><div class="record-topline"><span>${esc(e.date ? formatDate(e.date) : 'Date to confirm')}</span>${badge(e.status)}</div><h2><a href="${idPath('catering', e.id)}">${esc(e.title)} ↗</a></h2>${menuMarkup(e.menuText,{query:menuSearch,compact:true})}</section>`).join('')}</div>`;
}
function guests() {
  const all = current.records.guests,
    filtered = all.filter((g) =>
      `${g.name} ${g.household} ${g.family}`
        .toLowerCase()
        .includes(guestSearch.toLowerCase()),
    ),
    groups = new Map<string, GuestRecord[]>();
  for (const g of filtered) {
    const key = g.household || 'Household to assign';
    groups.set(key, [...(groups.get(key) || []), g]);
  }
  return `${crumbs([['Guests']])}${pageHead('Guests.', 'People grouped by household.', add('guests', 'Add a guest', 'basics'))}<div class="list-toolbar"><p class="list-count">${all.length} ${all.length === 1 ? 'person' : 'people'} · ${new Set(all.map((g) => g.household).filter(Boolean)).size} named ${new Set(all.map((g) => g.household).filter(Boolean)).size === 1 ? 'household' : 'households'}</p><label class="search-field"><span class="sr-only">Search guests or households</span><input id="guest-search" value="${esc(guestSearch)}" placeholder="Search names or households"></label></div>${filtered.length ? [...groups].map(([household, people]) => `<section class="household"><div class="household-heading"><h2>${esc(household)}</h2><span>${people.length} ${people.length === 1 ? 'person' : 'people'}</span></div><div class="people-list panel">${people.map((g) => `<a class="person-row" href="${idPath('guests', g.id)}"><span class="person-initial" aria-hidden="true">${esc(g.name.slice(0, 1))}</span><div><h3>${esc(g.name)}</h3><p>${esc(g.family || 'Family group to add')}${g.dietary ? ' · Food needs recorded' : ''}</p></div><span class="row-arrow" aria-hidden="true">›</span></a>`).join('')}</div></section>`).join('') : emptyView(guestSearch ? 'No matching guests.' : 'A place for everyone.', guestSearch ? 'Try another name or clear the search.' : 'Add people and group them by household.', guestSearch ? '<button class="button button-secondary" data-action="clear-search">Clear search</button>' : add('guests', 'Add the first guest', 'basics'))}`;
}
function guestDetail(id: string) {
  const g = current.records.guests.find((g) => g.id === id);
  if (!g) return missing('Guests', 'guests');
  return `${crumbs([['Guests', href('guests')], [g.name]])}${pageHead(esc(g.name), esc(g.household || 'Household to assign'))}<div class="read-grid"><section class="panel read-card"><div class="section-heading"><h2>Guest details</h2>${edit('guests', g.id, 'basics', 'Edit basics')}</div><dl class="facts">${fact('Household', g.household || 'To assign')}${fact('Family group', g.family || 'To add')}${fact('Contact', g.phone || 'Not recorded')}</dl></section><section class="panel read-card sage"><div class="section-heading"><h2>Food & hospitality</h2>${edit('guests', g.id, 'food', 'Edit food needs')}</div><p class="preserve-lines">${esc(g.dietary || 'No food preferences or needs recorded.')}</p></section></div><div class="context-actions"><a class="context-action" href="${idPath('stays', g.id)}">${icon('stay')}<span>Stay & travel details</span><span>↗</span></a><div class="attendance-picker panel"><label for="guest-occasion">Attendance by occasion</label><select id="guest-occasion"><option value="">Choose an occasion or meal</option>${current.records.events.map((e) => `<option value="${esc(e.id)}">${esc(e.title)} · ${esc(e.date ? formatDate(e.date) : 'Undated')}</option>`).join('')}</select></div></div>${g.notes ? `<section class="context-notes"><h2>Notes</h2><p>${esc(g.notes)}</p>${edit('guests', g.id, 'notes', 'Edit note')}</section>` : ''}${!g.notes ? edit('guests', g.id, 'notes', 'Add a note') : ''}${stamp(g)}`;
}
function stays() {
  const guests = current.records.guests,
    nights = stayDemand(guests);
  return `${crumbs([['Stays & Travel']])}${pageHead('Stays & Travel.', 'Rooms, dates & travel.')}<section class="panel night-summary"><div class="section-heading"><h2>People staying each night</h2><span>Checkout night excluded</span></div>${
    Object.keys(nights).length
      ? `<div class="stay-nights">${Object.entries(nights)
          .sort()
          .map(
            ([d, n]) =>
              `<div><span>${esc(formatDate(d))}</span><strong>${n}</strong><small>people with stay dates</small></div>`,
          )
          .join('')}</div>`
      : '<p class="empty-inline">Nightly needs will appear when stay dates are recorded.</p>'
  }<p class="small-copy">These are people with recorded dates, not confirmed rooms.</p></section><div class="stay-list">${guests.length ? guests.map((g) => `<a class="stay-person panel" href="${idPath('stays', g.id)}"><div><h2>${esc(g.name)}</h2><p>${esc(g.household || 'Household to assign')}</p></div><div><strong>${esc(g.accommodation || 'Stay to arrange')}</strong><p>${g.stayFrom && g.stayUntil ? esc(formatDate(g.stayFrom)) + ' → ' + esc(formatDate(g.stayUntil)) : 'Stay dates to confirm'}${g.room ? ' · ' + esc(g.room) : ''}</p>${g.transport ? `<p>${esc(g.transport)}</p>` : ''}</div><span class="row-arrow" aria-hidden="true">›</span></a>`).join('') : emptyView('Start with the guest book.', 'Add the person first, then record their stay and travel.', '<a class="button" href="#/guests">Open guests</a>')}</div>`;
}
function stayDetail(id: string) {
  const g = current.records.guests.find((g) => g.id === id);
  if (!g) return missing('Stays & Travel', 'stays');
  return `${crumbs([['Stays & Travel', href('stays')], [g.name]])}${pageHead(esc(g.name), esc(g.household || 'Stay & travel'))}<div class="read-grid"><section class="panel read-card sage"><div class="section-heading"><h2>Their stay</h2>${edit('guests', g.id, 'stay', 'Edit stay')}</div><dl class="facts">${fact('First night', g.stayFrom ? formatDate(g.stayFrom) : 'To confirm')}${fact('Checkout', g.stayUntil ? formatDate(g.stayUntil) : 'To confirm')}${fact('Accommodation', g.accommodation || 'To arrange')}${fact('Room / allocation', g.room || 'Not recorded')}</dl></section><section class="panel read-card blush"><div class="section-heading"><h2>Getting here & home</h2>${edit('guests', g.id, 'travel', 'Edit travel')}</div><dl class="facts">${fact('Arrival', g.arrivalAt ? formatTime(g.arrivalAt) : 'To confirm')}${fact('Departure', g.departureAt ? formatTime(g.departureAt) : 'To confirm')}</dl><p class="preserve-lines">${esc(g.transport || 'Transport arrangements to confirm.')}</p></section></div><a class="text-button lower" href="${idPath('guests', g.id)}">View guest & food details ↗</a>${stamp(g)}`;
}
function tasks() {
  const group =
    new URLSearchParams(location.hash.split('?')[1] || '').get('tab') ===
    'responsibilities'
      ? 'responsibilities'
      : 'decisions';
  const decisions = current.records.decisions.filter(
      (d) => taskFilter === 'all' || d.status !== 'confirmed',
    ),
    arrangements = current.records.arrangements.filter(
      (a) => taskFilter === 'all' || a.status !== 'confirmed',
    );
  const rows = group === 'decisions' ? decisions : arrangements;
  return `${crumbs([['Tasks & Decisions']])}${pageHead('Tasks & Decisions.')}<div class="task-navigation"><nav class="group-tabs" aria-label="Task groups"><a href="#/tasks" class="${group === 'decisions' ? 'selected' : ''}"${group === 'decisions' ? ' aria-current="page"' : ''}>Family decisions <span>${decisions.length}</span></a><a href="#/tasks?tab=responsibilities" class="${group === 'responsibilities' ? 'selected' : ''}"${group === 'responsibilities' ? ' aria-current="page"' : ''}>Responsibilities <span>${arrangements.length}</span></a></nav><div class="filter-tabs"><button data-task-filter="open" class="${taskFilter === 'open' ? 'selected' : ''}">Still to settle</button><button data-task-filter="all" class="${taskFilter === 'all' ? 'selected' : ''}">Everything</button></div></div><section class="task-group"><div class="section-heading"><p class="list-count">${rows.length} ${group === 'decisions' ? (rows.length === 1 ? 'question' : 'questions') : (rows.length === 1 ? 'responsibility' : 'responsibilities')}</p>${group === 'decisions' ? add('decisions', 'Add question', 'new-question') : add('arrangements', 'Add task', 'arrangement')}</div>${rows.length ? `<div class="compact-tasks panel">${rows.map((row) => `<a class="compact-task" href="${idPath(group === 'decisions' ? 'tasks/decision' : 'tasks/arrangement', row.id)}"><div><h3>${esc(row.title)}</h3><p>${esc(row.owner || 'Owner to assign')}${row.due ? ' · ' + esc(formatDate(row.due)) : ''}</p></div>${badge(row.status)}<span class="row-arrow" aria-hidden="true">›</span></a>`).join('')}</div>` : emptyView('Nothing waiting here.', 'Record a question or responsibility as it arises.')}</section>`;
}
function decisionDetail(id: string) {
  const d = current.records.decisions.find((d) => d.id === id);
  if (!d) return missing('Tasks & Decisions', 'tasks');
  return `${crumbs([['Tasks & Decisions', href('tasks')], [d.title]])}<div class="detail-heading"><h1>${esc(d.title)}</h1>${badge(d.status)}</div><section class="panel read-card decision-reading"><div class="section-heading"><h2>The question</h2>${edit('decisions', d.id, 'decision', d.resolution ? 'Edit decision' : 'Record decision')}</div><p class="preserve-lines">${esc(d.proposal || 'No proposal recorded yet.')}</p>${d.resolution ? `<div class="resolution"><h2>The agreed decision</h2><p>${esc(d.resolution)}</p></div>` : ''}<dl class="facts">${fact('Family owner', d.owner || 'To assign')}${d.due ? fact('Needed by', formatDate(d.due)) : ''}${d.eventId ? fact('Related occasion', eventTitle(d.eventId)) : ''}</dl>${edit('decisions', d.id, 'question', 'Edit question & owner')}</section>${stamp(d)}`;
}
function arrangementDetail(id: string) {
  const a = current.records.arrangements.find((a) => a.id === id);
  if (!a) return missing('Tasks & Decisions', 'tasks');
  const money = (v: number | null) =>
    v === null
      ? 'Not recorded'
      : new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        }).format(v);
  return `${crumbs([['Tasks & Decisions', href('tasks?tab=responsibilities')], [a.title]])}<div class="detail-heading"><div><p class="eyebrow">${esc(a.category)}</p><h1>${esc(a.title)}</h1></div>${badge(a.status)}</div><div class="read-grid"><section class="panel read-card"><div class="section-heading"><h2>The arrangement</h2>${edit('arrangements', a.id, 'arrangement', 'Edit task')}</div><p class="preserve-lines">${esc(a.notes || 'No additional notes yet.')}</p><dl class="facts">${fact('Family owner', a.owner || 'To assign')}${a.due ? fact('Needed by', formatDate(a.due)) : ''}${a.eventId ? fact('Related occasion', eventTitle(a.eventId)) : ''}</dl></section><section class="panel read-card sage"><div class="section-heading"><h2>Provider & costs</h2>${edit('arrangements', a.id, 'provider', 'Edit details')}</div><dl class="facts">${fact('Provider', a.vendor || 'To confirm')}${fact('Contact', a.contact || 'Not recorded')}${fact('Agreed amount', money(a.agreedAmount))}${fact('Paid so far', money(a.paidAmount))}</dl></section></div>${stamp(a)}`;
}
function relatedArrangements(id: string) {
  const rows = current.records.arrangements.filter((a) => a.eventId === id);
  return rows.length
    ? `<section class="related-tasks"><h2>Related arrangements</h2>${rows.map((a) => `<a class="context-action" href="${idPath('tasks/arrangement', a.id)}">${icon('tasks')}<span>${esc(a.title)}</span><span>↗</span></a>`).join('')}</section>`
    : '';
}
function attendance(id?: string) {
  const e = current.records.events.find((e) => e.id === id);
  if (!e) return missing('Guests', 'guests');
  const counts = attendanceCounts(current.records, e.id);
  return `${crumbs([['Guests', href('guests')], ['Attendance']])}${pageHead('Who’s joining?', `${esc(e.title)} · ${esc(e.date ? formatDate(e.date) : 'Date to confirm')}`)}<div class="attendance-strip">${Object.entries(
    counts,
  )
    .map(([s, n]) => `<span><b>${n}</b> ${s}</span>`)
    .join('')}</div><div class="attendance-list panel">${
    current.records.guests.length
      ? current.records.guests
          .map((g) => {
            const a = current.records.attendance.find(
              (a) => a.eventId === e.id && a.guestId === g.id,
            );
            return `<div class="attendance-person"><label for="attendance-${esc(g.id)}"><strong>${esc(g.name)}</strong><small>${esc(g.household || 'Household to assign')}</small></label>${current.canEdit ? `<select id="attendance-${esc(g.id)}" data-guest="${esc(g.id)}" data-event="${esc(e.id)}">${['unknown', 'tentative', 'confirmed', 'declined'].map((s) => `<option${(a?.status || 'unknown') === s ? ' selected' : ''}>${s}</option>`).join('')}</select>` : `<span class="attendance-status">${esc(a?.status || 'unknown')}</span>`}</div>`;
          })
          .join('')
      : emptyView(
          'The guest book is still to come.',
          'Add people first, then record attendance for this occasion.',
          '<a class="button" href="#/guests">Open guests</a>',
        )
  }</div>`;
}
function missing(label: string, to: string) {
  return `${crumbs([[label, href(to)], ['Item unavailable']])}${emptyView('This item is no longer here.', 'It may have been archived. Return to the list to find the current plan.', `<a class="button" href="#/${to}">Back to ${label}</a>`)}`;
}
type Field = {
  key: string;
  label: string;
  type?: string;
  wide?: boolean;
  options?: [string, string][];
  required?: boolean;
  hint?: string;
};
const statusOptions: [string, string][] = [
  ['unresolved', 'Open'],
  ['proposed', 'Proposed'],
  ['confirmed', 'Confirmed'],
];
function fieldList(c: CollectionName, s: string): Field[] {
  if (s === 'notes')
    return [
      { key: 'notes', label: 'Planning notes', type: 'textarea', wide: true },
      ...(c === 'events'
        ? [{ key: 'source', label: 'Source / confirmation', wide: true }]
        : []),
    ];
  const title: Field = {
      key: c === 'guests' ? 'name' : 'title',
      label:
        c === 'guests'
          ? 'Guest name'
          : c === 'decisions'
            ? 'Decision / question'
            : c === 'arrangements'
              ? 'Task'
              : 'Name',
      required: true,
      wide: true,
    },
    owner: Field = { key: 'owner', label: 'Responsible family member' },
    status: Field = { key: 'status', label: 'Status', options: statusOptions },
    event: Field = {
      key: 'eventId',
      label: 'Related occasion',
      options: [
        ['', 'Across the celebration'],
        ...current.records.events.map(
          (e) => [e.id, e.title] as [string, string],
        ),
      ],
    };
  if (c === 'events') {
    if (s === 'menu')
      return [
        {
          key: 'menuText',
          label: 'Proposed menu',
          type: 'textarea',
          wide: true,
          hint: 'Keep unclear readings marked for family verification.',
        },
      ];
    if (s === 'function' || s === 'service')
      return [
        title,
        ...(s === 'service'
          ? [
              {
                key: 'kind',
                label: 'Service type',
                options: [
                  ['meal', 'Meal'],
                  ['food-counter', 'Food counter'],
                ],
              } as Field,
            ]
          : []),
        { key: 'date', label: 'Date', type: 'date' },
        owner,
        status,
      ];
    return [
      title,
      { key: 'date', label: 'Date', type: 'date' },
      status,
      {
        key: 'startAt',
        label: 'Starts at · India time',
        type: 'datetime-local',
      },
      {
        key: 'arrivalAt',
        label: 'Arrival from · India time',
        type: 'datetime-local',
      },
      { key: 'venue', label: 'Venue', wide: true },
      { key: 'address', label: 'Address', wide: true },
      { key: 'mapUrl', label: 'Google Maps link', type: 'url', wide: true },
      owner,
      { key: 'audience', label: 'Who is this occasion for?', wide: true },
    ];
  }
  if (c === 'guests') {
    if (s === 'food')
      return [
        {
          key: 'dietary',
          label: 'Food preferences or needs',
          type: 'textarea',
          wide: true,
        },
      ];
    if (s === 'stay')
      return [
        { key: 'stayFrom', label: 'First night', type: 'date' },
        { key: 'stayUntil', label: 'Checkout date', type: 'date' },
        { key: 'accommodation', label: 'Accommodation', wide: true },
        { key: 'room', label: 'Room / allocation', wide: true },
      ];
    if (s === 'travel')
      return [
        {
          key: 'arrivalAt',
          label: 'Arrival · India time',
          type: 'datetime-local',
        },
        {
          key: 'departureAt',
          label: 'Departure · India time',
          type: 'datetime-local',
        },
        {
          key: 'transport',
          label: 'Transport arrangements',
          type: 'textarea',
          wide: true,
        },
      ];
    return [
      title,
      { key: 'household', label: 'Household' },
      { key: 'family', label: 'Family group' },
      { key: 'phone', label: 'Contact number', type: 'tel' },
    ];
  }
  if (c === 'decisions') {
    if (s === 'decision')
      return [
        {
          key: 'resolution',
          label: 'Agreed decision',
          type: 'textarea',
          wide: true,
        },
        status,
      ];
    if (s === 'new-question')
      return [
        title,
        {
          key: 'proposal',
          label: 'Proposal / question',
          type: 'textarea',
          wide: true,
        },
      ];
    return [
      title,
      {
        key: 'proposal',
        label: 'Proposal / question',
        type: 'textarea',
        wide: true,
      },
      owner,
      { key: 'due', label: 'Needed by', type: 'date' },
      event,
    ];
  }
  if (s === 'provider')
    return [
      { key: 'vendor', label: 'Provider / vendor' },
      { key: 'contact', label: 'Provider contact' },
      { key: 'agreedAmount', label: 'Agreed amount · ₹', type: 'number' },
      { key: 'paidAmount', label: 'Paid so far · ₹', type: 'number' },
    ];
  return [
    title,
    { key: 'category', label: 'Category' },
    owner,
    status,
    event,
    { key: 'due', label: 'Needed by', type: 'date' },
    {
      key: 'notes',
      label: 'Notes and responsibilities',
      type: 'textarea',
      wide: true,
    },
  ];
}
function fieldMarkup(f: Field, value: unknown) {
  const v = ['startAt', 'arrivalAt', 'departureAt'].includes(f.key)
    ? localInput(String(value || ''))
    : (value ?? '');
  if (
    f.key === 'eventId' &&
    f.options &&
    v &&
    !f.options.some(([k]) => k === v)
  )
    f = {
      ...f,
      options: [
        ...f.options,
        [String(v), 'Previously linked occasion (archived)'],
      ],
    };
  const common = `name="${f.key}" id="field-${f.key}"${f.required ? ' required' : ''}`;
  return `<div class="field${f.wide ? ' field-wide' : ''}"><label for="field-${f.key}">${f.label}</label>${f.options ? `<select ${common}>${f.options.map(([key, label]) => `<option value="${esc(key)}"${key === v ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>` : f.type === 'textarea' ? `<textarea ${common} rows="${f.key === 'menuText' ? 14 : 4}">${esc(v)}</textarea>` : `<input ${common} type="${f.type || 'text'}" value="${esc(v)}"${f.type === 'number' ? ' min="0" step="0.01"' : ''}>`}${f.hint ? `<small>${f.hint}</small>` : ''}</div>`;
}
function openEditor(c: CollectionName, id: string | undefined, s: string) {
  if (!current.canEdit) return;
  const record = id ? current.records[c].find((r) => r.id === id) : undefined;
  if (id && !record) {
    toast('This item is no longer available.');
    return;
  }
  const key = `${c}:${id || 'new'}:${s}`;
  activeDraftKey = key;
  let draft = drafts.get(key);
  if (!draft) {
    draft = {
      base: { ...empty[c], ...record },
      revision: record?.revision,
      fields: {},
    };
    if (c === 'events' && !record)
      draft.base.kind = s === 'function' ? 'function' : 'meal';
    drafts.set(key, draft);
  }
  const fields = fieldList(c, s),
    values = { ...draft.base, ...draft.fields };
  const title =
    (
      {
        menu: 'Edit the menu.',
        timing: 'Timing & venue.',
        basics: record ? 'Guest details.' : 'Add a guest.',
        food: 'Food & hospitality.',
        stay: 'Their stay.',
        travel: 'Getting here & home.',
        decision: 'Record the decision.',
        question: 'The question & owner.',
        'new-question': 'A family question.',
        arrangement: record ? 'Edit task.' : 'A new responsibility.',
        provider: 'Provider & costs.',
        notes: 'Planning notes.',
        function: 'Add an occasion.',
        service: 'Add a service.',
      } as Record<string, string>
    )[s] || 'Edit details.';
  const saveLabel =
    s === 'notes'
      ? 'Save notes'
      : s === 'menu'
        ? 'Save menu'
        : s === 'stay'
          ? 'Save stay'
          : s === 'travel'
            ? 'Save travel'
            : c === 'guests'
              ? 'Save guest'
              : c === 'decisions'
                ? s === 'decision'
                  ? 'Save decision'
                  : 'Save question'
                : c === 'arrangements'
                  ? 'Save task'
                  : 'Save details';
  dialog.className = s === 'menu' ? 'menu-editor' : '';
  dialog.innerHTML = `<form class="record-form"><div class="dialog-heading"><div><p class="eyebrow">${esc(record && 'title' in record ? record.title : record && 'name' in record ? record.name : 'THE FAMILY PLAN')}</p><h2 id="editor-title">${title}</h2></div><button type="button" class="icon-button" data-close aria-label="Close editor">×</button></div><div class="editor-scroll"><div class="form-fields">${fields.map((f) => fieldMarkup(f, values[f.key])).join('')}</div></div><div id="form-error" role="alert"></div><div class="dialog-actions">${record && ['decision', 'arrangement', 'basics', 'timing'].includes(s) ? '<button type="button" class="text-button archive-button" id="archive-record">Archive</button>' : ''}<button type="button" class="button button-secondary" data-close>Cancel</button><button class="button" type="submit">${saveLabel}</button></div></form>`;
  returnFocus = document.activeElement as HTMLElement;
  dialog.showModal();
  const form = dialog.querySelector<HTMLFormElement>('form')!;
  form.addEventListener('input', () => {
    draft!.fields = Object.fromEntries(new FormData(form).entries());
  });
  dialog
    .querySelectorAll('[data-close]')
    .forEach((b) => b.addEventListener('click', () => dialog.close()));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!current.canEdit) return;
    const b = form.querySelector<HTMLButtonElement>('[type=submit]')!,
      data = Object.fromEntries(new FormData(form).entries());
    draft!.fields = data;
    const payload = { ...draft!.base, ...data };
    for (const k of ['startAt', 'arrivalAt', 'departureAt'])
      if (k in data) payload[k] = toInstant(String(data[k]));
    b.disabled = true;
    b.textContent = 'Saving…';
    try {
      await store.save(c, payload, id, draft!.revision);
      drafts.delete(key);
      if (current.access === 'ready' && form.isConnected && dialog.open) {
        dialog.close();
        toast('Saved to the family plan.');
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not save. Your changes are still here.';
      if (current.access === 'ready' && form.isConnected && dialog.open) {
        form.querySelector('#form-error')!.textContent = message;
        if (message.includes('Record the decision')) {
          const field = form.querySelector<HTMLElement>('[name=resolution]');
          field?.focus();
          field?.scrollIntoView({ block: 'center' });
        }
      }
    } finally {
      b.disabled = false;
      b.textContent = saveLabel;
    }
  });
  let archiveReady = false;
  dialog
    .querySelector('#archive-record')
    ?.addEventListener('click', async (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      if (!archiveReady) {
        archiveReady = true;
        b.textContent = 'Confirm archive';
        return;
      }
      if (!current.canEdit) return;
      b.disabled = true;
      try {
        await store.archive(c, id!, record!.revision);
        drafts.delete(key);
        dialog.close();
        toast('Archived in the family plan.');
      } catch (error) {
        if (
          current.access === 'ready' &&
          dialog.open &&
          dialog.querySelector('#form-error')
        )
          dialog.querySelector('#form-error')!.textContent =
            error instanceof Error ? error.message : 'Could not archive.';
        b.disabled = false;
      }
    });
}
function toast(message: string) {
  clearTimeout(toastTimer);
  const node = document.querySelector<HTMLElement>('#toast')!;
  node.textContent = message;
  node.classList.add('visible');
  toastTimer = setTimeout(() => node.classList.remove('visible'), 2400);
}
function bind() {
  root.querySelector<HTMLInputElement>('#menu-search')?.addEventListener('input',event=>{
    const input=event.currentTarget as HTMLInputElement;
    const start=input.selectionStart,end=input.selectionEnd;
    menuSearch=input.value; render();
    const next=root.querySelector<HTMLInputElement>('#menu-search')!;
    next.focus();next.setSelectionRange(start,end);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-clear-menu]').forEach(button=>button.addEventListener('click',()=>{
    menuSearch='';render();root.querySelector<HTMLInputElement>('#menu-search')?.focus();
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-role-reset]').forEach(button => button.addEventListener('click', () => {
    const email = button.dataset.roleReset!;
    roleDrafts.delete(email); roleErrors.delete(email); render();
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-access-filter]').forEach(button => button.addEventListener('click', () => {
    accessFilter = button.dataset.accessFilter!;
    render();
  }));
  root.querySelector<HTMLInputElement>('#access-search')?.addEventListener('input', event => {
    const input = event.currentTarget as HTMLInputElement;
    accessSearch = input.value;
    const cursor = input.selectionStart;
    render();
    const next = root.querySelector<HTMLInputElement>('#access-search')!;
    next.focus(); next.setSelectionRange(cursor, cursor);
  });
  root.querySelectorAll<HTMLSelectElement>('[data-role-email]').forEach(select => select.addEventListener('change', () => {
    if (!current.isAdmin) return;
    const email = select.dataset.roleEmail!;
    roleDrafts.set(email, { role: select.value as AccessRole, expectedRole: roleDrafts.get(email)?.expectedRole || select.dataset.currentRole! });
    roleErrors.delete(email);
    const button = select.form?.querySelector<HTMLButtonElement>('[data-role-save]');
    if (button) button.disabled = select.value === (select.dataset.currentRole === 'editor' ? 'family' : select.dataset.currentRole);
  }));
  root.querySelectorAll<HTMLFormElement>('[data-role-form]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!current.isAdmin) return;
    const email = form.dataset.roleForm!, draft = roleDrafts.get(email);
    if (!draft || roleSaving.has(email)) return;
    roleSaving.add(email); roleErrors.delete(email); render();
    try {
      await store.assignRole(email, draft.role, draft.expectedRole);
      roleDrafts.delete(email);
      if (current.access === 'ready') toast('Family access updated.');
    } catch (error) {
      if (current.access === 'ready' && current.isAdmin) roleErrors.set(email, error instanceof Error ? error.message : 'Could not update access. Please try again.');
    } finally {
      roleSaving.delete(email);
      if (current.access === 'ready') render();
    }
  }));
  root.querySelectorAll<HTMLSelectElement>('[data-compare]').forEach((select) =>
    select.addEventListener('change', () => {
      if (select.dataset.compare === 'a') compareA = select.value;
      else compareB = select.value;
      render();
    }),
  );
  root
    .querySelectorAll<HTMLButtonElement>('[data-add]')
    .forEach((b) =>
      b.addEventListener('click', () =>
        openEditor(
          b.dataset.add as CollectionName,
          undefined,
          b.dataset.section || 'basics',
        ),
      ),
    );
  root
    .querySelectorAll<HTMLButtonElement>('[data-edit]')
    .forEach((b) =>
      b.addEventListener('click', () =>
        openEditor(
          b.dataset.edit as CollectionName,
          b.dataset.id,
          b.dataset.section || 'basics',
        ),
      ),
    );
  root.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((b) =>
    b.addEventListener('click', () => {
      dayFilter = b.dataset.day!;
      render();
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-task-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      taskFilter = b.dataset.taskFilter!;
      render();
    }),
  );
  root
    .querySelector<HTMLInputElement>('#guest-search')
    ?.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      guestSearch = input.value;
      const start = input.selectionStart;
      render();
      const next = root.querySelector<HTMLInputElement>('#guest-search')!;
      next.focus();
      next.setSelectionRange(start, start);
    });
  root
    .querySelector<HTMLSelectElement>('#guest-occasion')
    ?.addEventListener('change', (e) => {
      const id = (e.currentTarget as HTMLSelectElement).value;
      if (id) location.hash = idPath('attendance', id);
    });
  root
    .querySelectorAll<HTMLSelectElement>('select[data-guest]')
    .forEach((select) =>
      select.addEventListener('change', async () => {
        if (!current.canEdit) return;
        select.disabled = true;
        const guestId = select.dataset.guest!,
          eventId = select.dataset.event!,
          previous = current.records.attendance.find(
            (a) => a.guestId === guestId && a.eventId === eventId,
          );
        try {
          await store.save(
            'attendance',
            { guestId, eventId, status: select.value },
            previous?.id,
            previous?.revision,
          );
        } catch (error) {
          if (select.isConnected) select.value = previous?.status || 'unknown';
          if (current.access === 'ready')
            toast(
              error instanceof Error
                ? error.message
                : 'Could not save attendance.',
            );
        } finally {
          select.disabled = false;
        }
      }),
    );
  root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        if (b.dataset.action === 'clear-search') {
          guestSearch = '';
          render();
        } else if (b.dataset.action === 'sign-in') await store.signIn();
        else if (b.dataset.action === 'sign-out') await store.signOut();
        else if (b.dataset.action === 'clear-access') { accessSearch = ''; accessFilter = 'all'; render(); }
        else if (b.dataset.action === 'export') {
          const blob = new Blob([await store.exportData()], {
              type: 'application/json',
            }),
            url = URL.createObjectURL(blob),
            a = document.createElement('a');
          a.href = url;
          a.download = `mahima-mayank-private-plan-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Please try again.');
      }
    }),
  );
}
dialog.addEventListener('close', () => {
  if (activeDraftKey) {
    drafts.delete(activeDraftKey);
    activeDraftKey = null;
  }
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  else {
    const main = root.querySelector<HTMLElement>('#workspace');
    if (main) {
      main.tabIndex = -1;
      main.focus({ preventScroll: true });
    }
  }
});
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  }
});
document
  .querySelector<HTMLAnchorElement>('.skip-link')
  ?.addEventListener('click', (e) => {
    e.preventDefault();
    const main = root.querySelector<HTMLElement>('#workspace');
    if (main) {
      main.tabIndex = -1;
      main.focus({ preventScroll: true });
      main.scrollIntoView({ block: 'start' });
    }
  });
addEventListener('hashchange', () => {
  if (dialog.open) dialog.close();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
});
if (!location.hash) history.replaceState(null, '', '#/home');
startPwa();
void store.start();
