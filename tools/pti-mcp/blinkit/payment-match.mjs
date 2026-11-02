// Comparison evidence only. Never derive/store a purchase ISO from display text.
const local = value => Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
const day = p => `${p.year}-${p.month}-${p.day}`;
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
export function displayPaymentMatch(display,paymentAt,capturedAt){
 if(typeof display!=='string'||!Number.isFinite(Date.parse(paymentAt))||!Number.isFinite(Date.parse(capturedAt)))return {matched:false,reason:'unknown_source_date'};
 const clock=/\b(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i.exec(display);if(!clock||+clock[1]<1||+clock[1]>12||+clock[2]>59)return {matched:false,reason:'unknown_source_date'};
 const paid=local(paymentAt),seen=local(capturedAt);let displayDay;
 if(/\byesterday\b/i.test(display))displayDay=day(local(Date.parse(capturedAt)-86400000));
 else if(/\btoday\b/i.test(display))displayDay=day(seen);
 else{
  const date=/\b(\d{1,2})\s+([a-z]{3})[a-z]*\s*['’]?\s*(\d{4}|\d{2})\b/i.exec(display);
  if(!date||!months.includes(date[2].toLowerCase()))return {matched:false,reason:'unknown_source_date'};
  const year=date[3].length===2?2000+Number(date[3]):Number(date[3]);
  displayDay=`${year}-${String(months.indexOf(date[2].toLowerCase())+1).padStart(2,'0')}-${date[1].padStart(2,'0')}`;
 }
 const minute=(Number(clock[1])%12+(clock[3].toLowerCase()==='p'?12:0))*60+Number(clock[2]);
 const difference=Math.abs(minute-(Number(paid.hour)*60+Number(paid.minute)));
 return {matched:displayDay===day(paid)&&difference<=3,reason:'display_clock_and_capture_calendar',clockDifferenceMinutes:difference};
}
export function paymentMatch(event,row,detail,capturedAt){
 if(row?.order!==detail?.order)return {matched:false,reason:'order_token_mismatch'};
 if(Math.round((row?.total??NaN)*100)!==Math.round(event.amount*100)||Math.round((detail.contents?.bill?.billTotal??NaN)*100)!==Math.round(event.amount*100))return {matched:false,reason:'amount_mismatch'};
 const a=displayPaymentMatch(row.placedText,event.paymentAt,capturedAt),b=displayPaymentMatch(detail.contents?.placedText,event.paymentAt,capturedAt);
 return {matched:a.matched&&b.matched,reason:a.matched&&b.matched?'bill_total_and_display_time':!a.matched?a.reason:b.reason};
}
