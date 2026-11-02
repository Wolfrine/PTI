// Comparison evidence only. Never derive/store a purchase ISO from display text.
const local = value => Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
const day = p => `${p.year}-${p.month}-${p.day}`;
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
export function displayArrivalMatch(display,emailReceivedAt,capturedAt,transactionDateText){
 if(typeof display!=='string'||!Number.isFinite(Date.parse(emailReceivedAt))||!Number.isFinite(Date.parse(capturedAt)))return {matched:false,reason:'unknown_source_date'};
 const clock=/\b(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i.exec(display);if(!clock||+clock[1]<1||+clock[1]>12||+clock[2]>59)return {matched:false,reason:'unknown_source_date'};
 const seen=local(capturedAt);let displayDay;
 if(/\byesterday\b/i.test(display))displayDay=day(local(Date.parse(capturedAt)-86400000));
 else if(/\btoday\b/i.test(display))displayDay=day(seen);
 else{
  const date=/\b(\d{1,2})\s+([a-z]{3})[a-z]*\s*['’]?\s*(\d{4}|\d{2})\b/i.exec(display);
  if(!date||!months.includes(date[2].toLowerCase()))return {matched:false,reason:'unknown_source_date'};
  const year=date[3].length===2?2000+Number(date[3]):Number(date[3]);
  displayDay=`${year}-${String(months.indexOf(date[2].toLowerCase())+1).padStart(2,'0')}-${date[1].padStart(2,'0')}`;
 }
 const minute=(Number(clock[1])%12+(clock[3].toLowerCase()==='p'?12:0))*60+Number(clock[2]);
 const bank=/^(\d{2})-(\d{2})-(\d{2})$/.exec(transactionDateText||'');
 if(!bank)return {matched:false,reason:'unknown_source_date'};
 const bankMatches=displayDay.slice(2,4)===bank[3]&&displayDay.slice(5,7)===bank[2]&&displayDay.slice(8,10)===bank[1];
 // The comparison is approximate; email arrival is not transaction time.
 const comparison=Date.parse(`${displayDay}T${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}:00+05:30`);
 const difference=Math.abs(Math.floor(comparison/60000)-Math.floor(Date.parse(emailReceivedAt)/60000));
 return {matched:bankMatches&&Number.isFinite(difference)&&difference<=3,reason:'display_date_and_email_arrival_proximity',clockDifferenceMinutes:difference};
}
export function paymentMatch(event,row,detail,capturedAt){
 if(row?.order!==detail?.order)return {matched:false,reason:'order_token_mismatch'};
 if(Math.round((row?.total??NaN)*100)!==Math.round(event.amount*100)||Math.round((detail.contents?.bill?.billTotal??NaN)*100)!==Math.round(event.amount*100))return {matched:false,reason:'amount_mismatch'};
 const a=displayArrivalMatch(row.placedText,event.emailReceivedAt,capturedAt,event.transactionDateText),b=displayArrivalMatch(detail.contents?.placedText,event.emailReceivedAt,capturedAt,event.transactionDateText);
 return {matched:a.matched&&b.matched,reason:a.matched&&b.matched?'bill_total_display_date_and_email_arrival_proximity':!a.matched?a.reason:b.reason};
}
