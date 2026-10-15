export const collections = ['events', 'guests', 'attendance', 'arrangements', 'decisions'] as const;
export type CollectionName = typeof collections[number];
export type Status = 'unresolved' | 'proposed' | 'confirmed';
export type AttendanceStatus = 'unknown' | 'tentative' | 'confirmed' | 'declined';
export interface Stamp {
  id: string; revision: number; createdAt: string; createdBy: string;
  updatedAt: string; updatedBy: string; archived: boolean; lastChangeId: string;
}
export interface EventRecord extends Stamp {
  title: string; kind: 'function' | 'meal' | 'food-counter'; date: string;
  startAt: string; arrivalAt: string; venue: string; address: string; mapUrl: string;
  owner: string; status: Status; audience: string; menuText: string; notes: string; source: string;
}
export interface GuestRecord extends Stamp {
  name: string; household: string; family: string; phone: string; dietary: string;
  arrivalAt: string; departureAt: string; stayFrom: string; stayUntil: string;
  accommodation: string; room: string; transport: string; notes: string;
}
export interface AttendanceRecord extends Stamp {
  guestId: string; eventId: string; status: AttendanceStatus;
}
export interface ArrangementRecord extends Stamp {
  title: string; category: string; eventId: string; owner: string; status: Status;
  due: string; vendor: string; contact: string; agreedAmount: number | null; paidAmount: number | null; notes: string;
}
export interface DecisionRecord extends Stamp {
  title: string; eventId: string; owner: string; status: Status; due: string;
  proposal: string; resolution: string; source: string;
}
export interface RecordMap {
  events: EventRecord; guests: GuestRecord; attendance: AttendanceRecord;
  arrangements: ArrangementRecord; decisions: DecisionRecord;
}
export type WeddingRecord = RecordMap[CollectionName];
export type Payload = Record<string, unknown>;
export type Records = { [K in CollectionName]: RecordMap[K][] };
export const emptyRecords = (): Records => ({ events: [], guests: [], attendance: [], arrangements: [], decisions: [] });
export const empty = {
  events: {title:'',kind:'function',date:'',startAt:'',arrivalAt:'',venue:'',address:'',mapUrl:'',owner:'',status:'proposed',audience:'',menuText:'',notes:'',source:''},
  guests: {name:'',household:'',family:'',phone:'',dietary:'',arrivalAt:'',departureAt:'',stayFrom:'',stayUntil:'',accommodation:'',room:'',transport:'',notes:''},
  attendance: {guestId:'',eventId:'',status:'unknown'},
  arrangements: {title:'',category:'General',eventId:'',owner:'',status:'proposed',due:'',vendor:'',contact:'',agreedAmount:null,paidAmount:null,notes:''},
  decisions: {title:'',eventId:'',owner:'',status:'unresolved',due:'',proposal:'',resolution:'',source:''},
} as const;

const max: Record<string,number> = {title:180,name:180,household:180,family:120,phone:80,dietary:1200,notes:6000,menuText:16000,source:2000,resolution:6000,proposal:6000,venue:500,address:1200,mapUrl:2000,owner:180,audience:500,accommodation:500,room:180,transport:1200,category:120,vendor:300,contact:500};
const dateFields = ['date','stayFrom','stayUntil','due'];
const timeFields = ['startAt','arrivalAt','departureAt'];
export function validDate(s: string): boolean {
  const parsed = new Date(`${s}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === s;
}
export function validInstant(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s) && validDate(s.slice(0,10)) && Number(s.slice(11,13))<24 && Number.isFinite(Date.parse(s));
}
export function safeMapUrl(s: string): boolean {
  if (!s) return true;
  try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password && ['maps.google.com','www.google.com','google.com','maps.app.goo.gl','goo.gl'].includes(u.hostname); }
  catch { return false; }
}
export function validateRecord(collection: CollectionName, raw: Payload): Payload {
  const defaults: Payload = empty[collection];
  const out: Payload = {};
  for (const [k,v] of Object.entries(defaults)) {
    const input = raw[k] ?? v;
    if (k === 'agreedAmount' || k === 'paidAmount') {
      if (input === '' || input == null) out[k] = null;
      else { const n = typeof input === 'number' ? input : Number(input); if (!Number.isFinite(n) || n < 0 || n > 1e9) throw Error('Amounts must be non-negative numbers.'); out[k] = n; }
    } else { if (typeof input !== 'string') throw Error(`Invalid ${k}.`); const s=input.trim(); if (s.length > (max[k] ?? 180)) throw Error(`${k} is too long.`); out[k]=s; }
  }
  const title = collection === 'guests' ? out.name : collection === 'attendance' ? out.guestId : out.title;
  if (!title) throw Error(collection === 'guests' ? 'Enter a guest name.' : 'Enter a title.');
  for (const k of dateFields) if (out[k] && !validDate(out[k] as string)) throw Error('Use a valid calendar date.');
  for (const k of timeFields) if (out[k] && !validInstant(out[k] as string)) throw Error('Choose a date and time, including the timezone.');
  if (out.status && !(collection === 'attendance' ? ['unknown','tentative','confirmed','declined'] : ['unresolved','proposed','confirmed']).includes(out.status as string)) throw Error('Choose a valid status.');
  if (collection === 'events' && !['function','meal','food-counter'].includes(out.kind as string)) throw Error('Choose the type of occasion.');
  if (out.mapUrl && !safeMapUrl(out.mapUrl as string)) throw Error('Use a secure Google Maps link.');
  if (collection === 'attendance' && (!out.eventId || !out.guestId)) throw Error('Choose a guest and occasion.');
  if (collection === 'decisions' && out.status === 'confirmed' && !out.resolution) throw Error('Record the decision before confirming it.');
  if (out.stayFrom && out.stayUntil && String(out.stayUntil) <= String(out.stayFrom)) throw Error('Checkout must follow the first stay night.');
  if (out.arrivalAt && out.departureAt && Date.parse(out.departureAt as string) <= Date.parse(out.arrivalAt as string)) throw Error('Departure must follow arrival.');
  return out;
}
export function attendanceCounts(records: Records, eventId: string) {
  const active = new Set(records.guests.filter(g=>!g.archived).map(g=>g.id));
  const counts = {unknown:0,tentative:0,confirmed:0,declined:0};
  const rows = new Map<string,AttendanceRecord>();
  for (const a of records.attendance) if (!a.archived && a.eventId===eventId && active.has(a.guestId)) rows.set(a.guestId,a);
  for (const g of active) counts[rows.get(g)?.status ?? 'unknown']++;
  return counts;
}
export function stayDemand(guests: GuestRecord[]) {
  const nights: Record<string,number> = {};
  for (const guest of guests.filter(g=>!g.archived && g.stayFrom && g.stayUntil)) {
    if (!validDate(guest.stayFrom) || !validDate(guest.stayUntil) || guest.stayUntil<=guest.stayFrom) continue;
    for (let d=new Date(`${guest.stayFrom}T12:00:00Z`), n=0; d.toISOString().slice(0,10)<guest.stayUntil && n<366; d.setUTCDate(d.getUTCDate()+1),n++) {
      const key=d.toISOString().slice(0,10); nights[key]=(nights[key]??0)+1;
    }
  }
  return nights;
}
export function formatDate(date: string) {
  return date && validDate(date) ? new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(`${date}T12:00:00Z`)) : 'Date to confirm';
}
export function formatTime(instant: string) {
  return instant && validInstant(instant) ? new Intl.DateTimeFormat('en-IN',{hour:'numeric',minute:'2-digit',day:'numeric',month:'short',timeZone:'Asia/Kolkata'}).format(new Date(instant))+' IST' : 'Time to confirm';
}
export function toInstant(input: string): string { return input ? (validInstant(input) ? input : `${input}:00+05:30`.replace(':00:00+05:30',':00+05:30')) : ''; }
export function localInput(instant: string): string {
  if (!instant || !validInstant(instant)) return '';
  return new Date(Date.parse(instant)+330*60000).toISOString().slice(0,16);
}
export function escapeHtml(value: unknown): string { return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
