import {displayArrivalMatch,paymentMatch} from './canonical/payment-match.mjs';
import {classify,normalizePurchase} from './canonical/model.mjs';
const sensitive=/\b(shampoo|trimmer|sanitary|tampon|menstrual|condom|pregnancy|medicine|tablet|capsule|personal care|body wash|hair oil|razor|deodorant|conditioner|toothpaste|toothbrush|skin care|skincare|face wash|face cream|body cream|lotion|moisturi[sz]\w*|sunscreen|lip balm|lipstick|makeup|supplement|medical|intimate)\b/i;
export function previewScope(names){
 if(!Array.isArray(names)||!names.length||names.some(n=>typeof n!=='string'))return 'review';
 if(names.some(n=>sensitive.test(n)))return names.every(n=>classify(n).kind==='nonfood')?'outside':'review';
 if(names.every(n=>classify(n).kind==='nonfood'))return 'outside';
 return names.some(n=>classify(n).kind==='food')?'eligible':'review';
}
export async function processPayment({eventId,persistence,source,now=()=>new Date().toISOString(),replay=false}){
 const claim=await persistence.events({action:'claim',eventId,replay});if(!claim.lease)return {status:'already_imported',duplicate:true};
 const {event,lease}=claim;
 const defer=async code=>{const r=await persistence.events({action:'defer',eventId,lease,code});return {status:r.status,code};};
 try{
  const linked=event.purchaseId?(await persistence.context({purchaseId:event.purchaseId})).purchases[0]:null;
  let cursor=null,uncertain=false,unknownLive=false,unlisted=false;const cursors=new Set(),rows=new Map();
  for(let page=0;page<3;page++){
   if(cursors.has(cursor))return defer('transient');cursors.add(cursor);
   const batch=await source.list(cursor);if(batch.truncated||batch.unreadableRows)return defer('transient');
   unlisted ||= batch.unlistedLiveOrders>0;
   for(const row of [...batch.orders,...batch.live]){
    if(linked&&row.order===linked.orderToken){rows.set(row.order,row);continue;}
    if(linked)continue;
    if(Math.round((row.total??NaN)*100)!==Math.round(event.amount*100))continue;
    const match=displayArrivalMatch(row.placedText,event.emailReceivedAt,now(),event.transactionDateText);
    if(match.matched)rows.set(row.order,row);else if(match.reason==='unknown_source_date'){if(row.phase?.kind==='live')unknownLive=true;else uncertain=true;}
   }
   if(batch.nextCursor===null)break;cursor=batch.nextCursor;
  }
  if(unlisted)return defer('not_yet_listed');
  if(rows.size&&(uncertain||unknownLive))return defer(unknownLive?'not_yet_listed':'ambiguous_match');
  if(rows.size>1)return defer('ambiguous_match');
  if(!rows.size)return defer(unknownLive?'not_yet_listed':uncertain?'unknown_source_date':'not_yet_listed');
  const row=[...rows.values()][0],scope=previewScope(row.itemNames);
  if(scope==='outside')return defer(linked?'preview_needs_review':'nonfood_only_preview');
  if(scope!=='eligible')return defer(row.phase?.kind==='live'&&!row.itemNames?.length?'not_yet_listed':'preview_needs_review');
  const detail=await source.detail(row.order),capturedAt=now();
  if(!linked&&!paymentMatch(event,row,detail,capturedAt).matched)return defer('unknown_source_date');
  const expected=normalizePurchase(detail,capturedAt,row.placedText),current=linked||(await persistence.context({purchaseId:expected.id})).purchases[0];
  if(linked&&expected.id!==linked.id)return defer('revision_conflict');
  const response=await persistence.ingest({records:[{eventId,eventLease:lease,detail,capturedAt,listPlacedText:row.placedText,sourceRow:{order:row.order,total:row.total??null,placedText:row.placedText},...(current?{expectedRevision:current.revision}:{})}]});
  const saved=response.results?.[0];if(!saved?.ok)return defer(saved?.error?.code==='revision_conflict'?'revision_conflict':'transient');
  const readback=await persistence.context({purchaseId:saved.purchaseId}),purchase=readback.purchases[0];
  if(!purchase||purchase.fingerprint!==expected.fingerprint||purchase.purchasedAt!==null||purchase.capturedAt!==capturedAt&&!saved.duplicate)throw Error('readback_not_verified');
  return {status:purchase.needsReconciliation?'reconcile_pending':'imported',purchaseId:saved.purchaseId,duplicate:saved.duplicate,revision:saved.revision,foodLineCount:purchase.foodItems.length,unknownLineCount:purchase.unknownItems.length,readbackVerified:true};
 }catch(error){
  const code=error?.code==='needs_login'?'blinkit_login_required':error?.code==='source_access_denied'?'source_access_denied':'transient';
  // If ingest committed but the reply was lost, the event lease is cleared. Do
  // not overwrite its result; a canonical context/claim recovers it next cycle.
  try{return await defer(code);}catch{return {status:'checkpoint_required',code};}
 }
}
