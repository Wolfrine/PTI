import {createHash} from 'node:crypto';

/** One-time import of the documented proposals. Never imports research fixtures. */
export function weddingSeed(text) {
  const defaults={title:'',kind:'meal',date:'',startAt:'',arrivalAt:'',venue:'',address:'',mapUrl:'',owner:'',status:'proposed',audience:'',menuText:'',notes:'',source:''};
  const section=text.split('## 3. Initial proposed menus')[1]?.split('## 4. Cross-event')[0];
  if(!section)throw Error('Wedding Record menu headings changed. Review the import before running it.');
  const events=[];
  for(const block of section.split(/\n### /).slice(1)) {
    const [heading,...lines]=block.split('\n');
    const title=heading.replaceAll('**','').trim();
    const day=/^(18|19|20) January/.exec(title)?.[1];
    const photo=title.includes('Sangeet')?'1000154329.jpg':title.includes('Reception')?'1000154326.jpg':day==='18'?'1000154325.jpg':day==='19'?'1000154328.jpg':'1000154327.jpg';
    const rows=lines.filter(l=>l.startsWith('|')).map(l=>l.split('|').slice(1,-1).map(v=>v.trim().replaceAll('**',''))).filter(r=>r.length===2&&!r[0].includes('---')&&!['Category','Open question'].includes(r[0]));
    const notes=['Proposed from the handwritten catering record. Times, venues and catering approval are not confirmed.'];
    if(title.includes('Carnival'))notes.push('The sheet labels a food section Carnival; a standalone function and service time are not established.');
    if(title.includes('Reception'))notes.push('The Reception sheet is undated. Do not assign it to 19 or 20 January without family confirmation.');
    if(day==='20')notes.push('Guest tiffin box is an open question, with no contents or recipients confirmed.');
    events.push({...defaults,id:day?`${day}-${events.length+1}`:'reception-undated',title:day?title.split(' — ').slice(1).join(' — '):'Reception',kind:title.includes('Sangeet')||title.includes('Reception')?'function':title.includes('Carnival')?'food-counter':'meal',date:day?`2027-01-${day}`:'',menuText:rows.map(([category,items])=>`${category}: ${items}`).join('\n'),notes:notes.join('\n'),source:`Wedding Record, section 3; ${photo}. Original image is a conversation attachment, not committed to the repository.`});
  }
  if(events.length!==10)throw Error(`Expected 10 documented services; found ${events.length}. Review the import.`);
  const decisions=[
    ['programme','Confirm the celebration programme','Confirm ceremony, baraat arrival, procession and vidai dates, order, times, event audiences and family-approved wording.'],
    ['reception-date','Place the Reception in the programme','The Reception menu is undated. Confirm its date, time, venue and audience.'],
    ['venues','Confirm venues and directions','Record the city, venue addresses, correct entrance/map pins and approved guest contact.'],
    ['menu-variety','Review the menus across the stay','Use the source-backed menu review to discuss the 19 January dals, Sangeet dairy-led starters, repeated dinner counters, Reception desserts and 20 January breakfast sweets. Verify recipes and audience overlap first. Preserve favourites and comfort staples; no selection is automatically changed.'],
    ['menu-readings','Check unclear menu readings','Verify dal lapeta, aloo gunda and the unclear Reception barbecue, dosa and chilli items with the family/caterer.'],
    ['tiffin','Decide on departure tiffin boxes','Establish whether packed food is needed, for whom, and at what departure time.'],
    ['hospitality','Plan guest hospitality','Confirm attendance by occasion, stay nights, arrivals/departures, transport, food requests and family owners as information arrives.'],
  ].map(([id,title,proposal])=>({id,title,eventId:'',owner:'',status:'unresolved',due:'',proposal,resolution:'',source:'Wedding Record, sections 1, 4 and 5.'}));
  return {events,decisions,sourceHash:createHash('sha256').update(text).digest('hex')};
}
