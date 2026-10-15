import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attendanceCounts, empty, emptyRecords, stayDemand, validateRecord, validDate, validInstant, safeMapUrl, localInput, toInstant, type GuestRecord, type AttendanceRecord} from '../src/model.ts';
import {weddingSeed} from '../scripts/seed-record.mjs';
import {publicContent,renderInvitation,validatePublicContent} from '../src/public-content.ts';
import {countdownParts} from '../src/public.ts';

const stamp={revision:1,createdAt:'',createdBy:'',updatedAt:'',updatedBy:'',archived:false,lastChangeId:''};
const guest=(id:string,household='One household')=>({...empty.guests,...stamp,id,name:id,household}) as GuestRecord;
test('counts real people by occasion, keeps unknown/tentative distinct, ignores archived people',()=>{
  const records=emptyRecords();records.guests=[guest('one'),guest('two'),{...guest('removed'),archived:true}];
  records.attendance=[{...empty.attendance,...stamp,id:'one--sangeet',guestId:'one',eventId:'sangeet',status:'confirmed'},{...empty.attendance,...stamp,id:'two--reception',guestId:'two',eventId:'reception',status:'tentative'},{...empty.attendance,...stamp,id:'removed--sangeet',guestId:'removed',eventId:'sangeet',status:'confirmed'}] as AttendanceRecord[];
  assert.deepEqual(attendanceCounts(records,'sangeet'),{confirmed:1,unknown:1,tentative:0,declined:0});
  assert.deepEqual(attendanceCounts(records,'reception'),{confirmed:0,unknown:1,tentative:1,declined:0});
});
test('nightly demand excludes checkout and counts people rather than rooms',()=>{
  const people=[{...guest('one'),stayFrom:'2027-01-18',stayUntil:'2027-01-20'},{...guest('two'),stayFrom:'2027-01-19',stayUntil:'2027-01-20'}];
  assert.deepEqual(stayDemand(people),{'2027-01-18':1,'2027-01-19':2});
});
test('calendar, instant and maps validations reject invented/unsafe values',()=>{
  assert.equal(validDate('2027-02-30'),false);assert.equal(validDate('2027-01-18'),true);
  assert.equal(validInstant('2027-01-18T19:00'),false);assert.equal(validInstant('2027-01-18T19:00:00+05:30'),true);
  assert.equal(safeMapUrl('javascript:alert(1)'),false);assert.equal(safeMapUrl('https://maps.google.com.evil.test/'),false);assert.equal(safeMapUrl('https://maps.app.goo.gl/example'),true);
  assert.throws(()=>validateRecord('guests',{name:'Guest',stayFrom:'2027-01-20',stayUntil:'2027-01-18'}),/Checkout/);
});
test('India wall time round-trips independently of machine timezone',()=>{
  const instant=toInstant('2027-01-18T19:30');assert.equal(instant,'2027-01-18T19:30:00+05:30');
  assert.equal(localInput(instant),'2027-01-18T19:30');assert.equal(localInput('2027-01-18T14:00:00Z'),'2027-01-18T19:30');
});
test('confirmation records an actual decision and preserves amount meaning',()=>{
  assert.throws(()=>validateRecord('decisions',{title:'Venue',status:'confirmed'}),/Record the decision/);
  assert.throws(()=>validateRecord('arrangements',{title:'Catering',paidAmount:-1}),/non-negative/);
  const item=validateRecord('arrangements',{title:'Catering',agreedAmount:100,paidAmount:25});assert.equal(Number(item.agreedAmount)-Number(item.paidAmount),75);
});
test('one-time import preserves all menus and uncertainty without fixture data',async()=>{
  const text=await readFile(new URL('../WEDDING_RECORD.md',import.meta.url),'utf8');const seed=weddingSeed(text);
  assert.equal(seed.events.length,10);assert.ok(seed.events.every(e=>e.status==='proposed'&&!e.startAt&&!e.venue));
  assert.equal(seed.events.find(e=>e.title==='Reception')?.date,'');
  const carnival=seed.events.find(e=>e.title.includes('Carnival'));assert.equal(carnival?.kind,'food-counter');assert.ok(carnival?.notes.includes('not established'));
  assert.ok(seed.events.some(e=>e.menuText.includes('dal lapeta (verify exact name)')));
  assert.ok(!seed.events.some(e=>e.menuText.includes('Hot and Sour')));
  assert.ok(seed.decisions.some(d=>d.id==='tiffin'));assert.ok(seed.events.every(e=>!e.menuText.includes('Guest tiffin box')));
});
test('public snapshot remains truthful and contains no proposed private menus',()=>{
  assert.equal(publicContent.events.length,0);assert.equal(publicContent.countdown,null);assert.equal(publicContent.contact,null);
  const html=renderInvitation(publicContent);assert.match(html,/CELEBRATIONS PLANNED FOR/);assert.match(html,/Mahima/);assert.match(html,/Mayank/);assert.ok(!html.includes('Paneer'));assert.ok(!html.includes('Reception'));
  const bad=structuredClone(publicContent);bad.countdown={label:'Example',at:'2027-01-18T19:00'};assert.throws(()=>validatePublicContent(bad),/timezone/);
  bad.countdown={label:'Example',at:'2027-02-30T19:00:00+05:30'};assert.throws(()=>validatePublicContent(bad),/timezone/);
});
test('a released occasion renders safe practical details and a post-midnight instant',()=>{
  const c=structuredClone(publicContent);c.events=[{title:'Synthetic verification occasion',date:'2027-01-19',startAt:'2027-01-20T00:30:00+05:30',arrivalAt:'2027-01-19T23:30:00+05:30',venue:'Synthetic venue',address:'Synthetic address',mapUrl:'https://maps.google.com/?q=synthetic',note:'Test only'}];
  const html=renderInvitation(c);assert.match(html,/Directions/);assert.match(html,/12:30 am IST/i);assert.match(html,/Arrival from/);
  c.events[0].mapUrl='javascript:alert(1)';assert.throws(()=>renderInvitation(c),/Maps/);
});
test('countdown follows the exact instant independent of viewer timezone and stops at zero',()=>{
  const target='2027-01-18T19:30:00+05:30',now=Date.parse('2027-01-18T13:00:00Z');
  assert.deepEqual(countdownParts(target,now),{days:0,hours:1,minutes:0,seconds:0,complete:false});
  assert.equal(countdownParts('2027-01-18T19:30',now),null);assert.equal(countdownParts(target,Date.parse(target)).complete,true);
  assert.equal(countdownParts(target,Date.parse(target)+10000).seconds,0);
});
