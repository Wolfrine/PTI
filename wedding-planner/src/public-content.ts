import { validDate, validInstant, safeMapUrl } from './model';
import { brand, leaf, icon } from './presentation';
/** Developer-reviewed public snapshot. Never import family records or catering seed data here. */
export interface PublicEvent {
  title: string;
  date: string;
  startAt: string;
  arrivalAt?: string;
  venue: string;
  address: string;
  mapUrl: string;
  note: string;
}
export interface PublicInvitation {
  couple: { first: string; surname: string }[];
  dates: { start: string; end: string; label: string; planned: boolean };
  events: PublicEvent[];
  countdown: { label: string; at: string } | null;
  contact: { name: string; phone: string } | null;
}
export const publicContent: PublicInvitation = {
  couple: [
    { first: 'Mahima', surname: 'Mishra' },
    { first: 'Mayank', surname: 'Awasthi' },
  ],
  dates: {
    start: '2027-01-18',
    end: '2027-01-20',
    label: '18–20 January 2027',
    planned: true,
  },
  events: [],
  countdown: null,
  contact: null,
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
const date = (d: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${d}T12:00:00Z`));
const time = (d: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(d)) + ' IST';
export function validatePublicContent(c: PublicInvitation): void {
  if (
    c.couple.length !== 2 ||
    c.couple.some((p) => !p.first.trim() || !p.surname.trim())
  )
    throw Error('The public invitation needs two complete names.');
  if (
    !validDate(c.dates.start) ||
    !validDate(c.dates.end) ||
    c.dates.end < c.dates.start ||
    !c.dates.label.trim()
  )
    throw Error('The public celebration dates are invalid.');
  for (const e of c.events) {
    if (!e.title.trim() || !validDate(e.date))
      throw Error('Each public occasion needs a title and valid date.');
    if (
      (e.startAt && !validInstant(e.startAt)) ||
      (e.arrivalAt && !validInstant(e.arrivalAt))
    )
      throw Error('Public times need a valid date, time and timezone.');
    if (!safeMapUrl(e.mapUrl))
      throw Error('Public directions must use a secure Google Maps link.');
  }
  if (
    c.countdown &&
    (!c.countdown.label.trim() || !validInstant(c.countdown.at))
  )
    throw Error(
      'The countdown needs an approved label and exact time with timezone.',
    );
  if (
    c.contact &&
    (!c.contact.name.trim() || !/^\+?[\d ()-]{5,25}$/.test(c.contact.phone))
  )
    throw Error('The public contact needs a name and valid phone number.');
}
export function renderInvitation(c: PublicInvitation) {
  validatePublicContent(c);
  const [a, b] = c.couple;
  return `<a class="skip-link" href="#celebration">Skip to celebration details</a><header class="app-header public-header">${brand('/')}<span class="header-note">A CELEBRATION OF TOGETHERNESS</span><a class="family-access" href="/family/">${icon('lock')}Family access</a></header><main class="guest-main"><section class="garden-hero" aria-labelledby="couple-names"><div class="scene" aria-hidden="true"></div><div class="invitation-copy"><p class="eyebrow">THE WEDDING OF</p><h1 id="couple-names">${escape(a.first)} ${escape(a.surname)}<i aria-label="and">&</i>${escape(b.first)} ${escape(b.surname)}</h1><div class="botanical-divider">${leaf}</div><p class="date-caption">${c.dates.planned ? 'CELEBRATIONS PLANNED FOR' : 'JOIN US ON'}</p><p class="hero-date">${escape(c.dates.label)}</p><p class="guest-welcome">We look forward to celebrating with you.</p></div></section>${c.countdown ? `<section class="countdown" aria-label="Countdown to ${escape(c.countdown.label)}"><p class="eyebrow">${escape(c.countdown.label)}</p><div data-countdown data-target="${escape(c.countdown.at)}"></div></section>` : ''}<section id="celebration" class="public-celebration">${c.events.length ? `<div class="public-section-title"><h2>Our celebration</h2><p>The moments we look forward to sharing with you.</p></div><div class="public-events">${c.events.map((e) => `<article class="public-event panel"><p class="eyebrow">${escape(date(e.date))}</p><h3>${escape(e.title)}</h3><p>${escape(e.startAt ? time(e.startAt) : 'Time to follow')}${e.arrivalAt ? ' · Arrival from ' + escape(time(e.arrivalAt)) : ''}</p><p>${escape(e.venue || 'Venue details to follow')}</p>${e.address ? `<p>${escape(e.address)}</p>` : ''}${e.mapUrl ? `<a class="text-button" href="${escape(e.mapUrl)}" target="_blank" rel="noopener">Directions ↗</a>` : ''}${e.note ? `<p>${escape(e.note)}</p>` : ''}</article>`).join('')}</div>` : `<div class="guest-pending"><span class="pending-icon">${icon('calendar')}</span><div><h2>The days are coming together.</h2><p>Our programme, venues and visiting details will be shared here.</p></div><span class="details-label">Details to follow</span></div>`}${c.contact ? `<div class="public-contact"><h2>A helping hand</h2><p>${escape(c.contact.name)} · <a href="tel:${escape(c.contact.phone.replace(/[^+\d]/g, ''))}">${escape(c.contact.phone)}</a></p></div>` : ''}</section></main><footer class="guest-footer">${leaf}<span>With love, and with you.</span></footer>`;
}
