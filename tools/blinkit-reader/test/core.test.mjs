import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewScope,processPayment} from '../src/core.mjs';
import {displayPaymentMatch} from '../src/canonical/payment-match.mjs';
import {normalizePurchase} from '../src/canonical/model.mjs';
const at='2026-11-02T12:00:00.000Z';
const event={eventId:'blinkit-gmail-aabbccddeeff0011',amount:100,currency:'INR',paymentAt:'2026-11-02T17:30:12+05:30'};
const row={order:'synthetic-fresh-row',total:100,placedText:'Today, 5:30 pm',itemNames:['Lemon','Popcorn']};
const detail={order:row.order,phase:{kind:'finished',status:'delivered'},statusText:'Delivered',contents:{kind:'read',reference:'SYNTHETIC-READER-ONE',placedText:'placed today, 5:30 PM',items:[{name:'Lemon',quantityText:'200 g x 1',amount:20},{name:'Cheese Popcorn',quantityText:'3 x 35 g x 1',amount:70}],bill:{billTotal:100,lines:[{label:'Handling charge',amount:10,text:'+₹10'}]}}};
function fixture({rows=[row],sourceDetail=detail}={}){
 let purchase=null,attempted=0,claimCount=0,reads=0,scans=0,deferred=[];
 const persistence={events:async args=>{
  if(args.action==='claim'){claimCount++;return {event,lease:'synthetic-lease'};}
  deferred.push(args.code);return {status:args.code==='nonfood_only_preview'?'outside_food_scope':'retry_wait'};
 },context:async()=>({purchases:purchase?[purchase]:[]}),ingest:async args=>{
  attempted++;const r=args.records[0];assert.equal(r.detail.order,row.order);assert.equal(r.sourceRow.order,row.order);assert.equal(r.eventLease,'synthetic-lease');
  const normalized=normalizePurchase(r.detail,r.capturedAt,r.listPlacedText),duplicate=!!purchase;
  purchase={...normalized.payload,id:normalized.id,fingerprint:normalized.fingerprint,capturedAt:r.capturedAt,needsReconciliation:false,revision:1};
  return {ok:true,results:[{ok:true,purchaseId:purchase.id,duplicate,revision:1}]};
 }};
 const source={list:async()=>{scans++;return {orders:rows,live:[],nextCursor:null,truncated:false,unreadableRows:0,unlistedLiveOrders:0};},detail:async()=>{reads++;return sourceDetail;}};
 return {source,persistence,run:()=>processPayment({eventId:event.eventId,persistence,source,now:()=>at}),counts:()=>({attempted,reads,scans,claimCount,deferred})};
}
test('fresh listed detail imports, reads back canonical pack/total shape and replay remains duplicate',async()=>{
 const f=fixture();const first=await f.run();assert.equal(first.readbackVerified,true);assert.equal(first.foodLineCount,2);assert.equal(first.duplicate,false);
 const replay=await f.run();assert.equal(replay.duplicate,true);assert.equal(replay.readbackVerified,true);assert.equal(f.counts().reads,2);
});
test('unknown/ambiguous matches defer without a detail read, and absent source is retried',async()=>{
 for(const rows of [[row,{...row,order:'synthetic-second-row'}],[{...row,placedText:'unavailable'}],[]]){
  const f=fixture({rows});await f.run();assert.equal(f.counts().reads,0);assert.equal(f.counts().attempted,0);assert.equal(f.counts().deferred.length,1);
 }
});
test('scope decisions precede details and never infer food from missing words',async()=>{
 assert.equal(previewScope(['Keyboard','Steel Strainer']),'outside');assert.equal(previewScope(['Mystery Box']),'review');assert.equal(previewScope([]),'review');assert.equal(previewScope(['Lemon','Synthetic Shampoo']),'review');
 const f=fixture({rows:[{...row,itemNames:['Synthetic Keyboard']}]});assert.equal((await f.run()).status,'outside_food_scope');assert.equal(f.counts().reads,0);
});
test('relative dates are comparison-only, with explicit day/clock ambiguity rejected',()=>{
 assert.equal(displayPaymentMatch('Yesterday, 5:30 PM','2026-11-01T17:30:12+05:30',at).matched,true);
 assert.equal(displayPaymentMatch("placed on Sun, 01 Nov'26, 5:30 PM",'2026-11-01T17:30:12+05:30',at).matched,true);
 assert.equal(displayPaymentMatch('Yesterday, 5:30 PM',event.paymentAt,at).matched,false);
 assert.equal(displayPaymentMatch('Today, 8:30 PM',event.paymentAt,at).matched,false);
 assert.equal(displayPaymentMatch('5:30 PM',event.paymentAt,at).reason,'unknown_source_date');
});
test('recent paging is bounded and repeated opaque cursors cannot cause full backfill',async()=>{
 const f=fixture({rows:[]});let calls=0;f.source.list=async()=>{calls++;return {orders:[],live:[],nextCursor:'same opaque /+=cursor',truncated:false,unreadableRows:0,unlistedLiveOrders:0};};await f.run();assert.equal(calls,2);assert.equal(f.counts().attempted,0);
});
test('lost ingest reply never pretends a verified import; pending lease is recovered by canonical state',async()=>{
 const f=fixture();f.persistence.ingest=async()=>{throw Error('synthetic lost response');};f.persistence.events=async args=>{if(args.action==='claim')return {event,lease:'synthetic'};throw Error('lease cleared after commit');};
 assert.equal((await f.run()).status,'checkpoint_required');
});
test('near-live incomplete display/preview retries rather than becoming a false permanent review',async()=>{
 for(const patch of [{placedText:'Just now',phase:{kind:'live'}},{itemNames:[],phase:{kind:'live'}}]){const f=fixture({rows:[{...row,...patch}]});await f.run();assert.deepEqual(f.counts().deferred,['not_yet_listed']);assert.equal(f.counts().reads,0);}
});
