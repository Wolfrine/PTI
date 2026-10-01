import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import { z } from 'zod';
import { assertUser } from './access.js';
const json = (value: unknown) => ({content:[{type:'text' as const,text:JSON.stringify(value)}]});
const moods=z.enum(['Comfort','Light','Spicy','Indulgent','Familiar','Explore','Quick','Proper meal']);
const signal=z.enum(['smoky','spicy','tangy','crispy','soft','rich','lighter','paneer','cheese','noodles','rice','bread']);
const date=z.string().refine(v=>Number.isFinite(Date.parse(v)), 'Use an ISO date.');
const planInput={uid:z.string().optional(),craving:z.string().max(500).optional(),mood:moods.optional(),hunger:z.enum(['Small','Regular','High']).optional(),budget:z.number().min(0).max(99999).optional(),diners:z.number().int().min(1).max(6).optional(),mode:z.enum(['delivery','dine-in']).optional(),wants:z.array(signal).max(12).optional(),avoid:z.array(signal).max(12).optional()};
const rules=['Food mood and preferences are explicit, never inferred emotional states.','Receipt time is email arrival time in Asia/Kolkata, not order time.','Repeated orders are weak clues; only confirmed personal consumption learns enjoyment.','Food qualities and pairing rules use dish-name heuristics, not verified ingredients or nutrition.','Sourced listings age after 14 days. Live availability, portions and final prices require checking.','The app and agents consume the same durable records and meal model. No LLM provider is embedded in the app.'];
export function registerFoodTools(server: McpServer, db: Firestore, owner: string | undefined) {
 const root=(uid?:string)=>{if(uid)assertUser(uid,owner);return db.doc(`users/${assertUser(owner||uid||'',owner)}/foodData/workspace`);};
 const loadCore=async()=>{const path='./food-core.mjs';return import(path);};
 const loadStudio=async()=>{const path='./food/intelligence.mjs';return import(path);};
 const loadPlaces=async()=>{const path='./food/places.mjs';return import(path);};
 async function readState(ref:DocumentReference){
  const [settings,...snaps]=await Promise.all([ref.get(),...['orders','feedback','learning','preferences','sessions','memories','research'].map(name=>ref.collection(name).orderBy(name==='orders'?'receivedAt':'createdAt','desc').limit(name==='orders'?501:301).get())]);
  const names=['orders','feedback','learning','preferences','sessions','memories','research'];
  const state:any={settings:settings.data()||{},window:{orders:500,otherCollections:300,truncated:snaps.some((s,i)=>s.size>(i===0?500:300))}};
  snaps.forEach((s,i)=>state[names[i]]=s.docs.slice(0,i===0?500:300).map(d=>({...d.data(),id:d.id})));
  return state;
 }
 async function context(input:any){
  const ref=root(input.uid),[state,model,catalog]=await Promise.all([readState(ref),loadStudio(),loadPlaces()]);
  const output=model.mealStudio({...state,research:[...catalog.places,...state.research],context:{...input,vegetarian:state.settings.vegetarian!==false,proactive:state.settings.proactive===true}});
  return {namespace:ref.path,settings:state.settings,window:state.window,...output,recentOrders:state.orders.slice(0,15),preferences:state.preferences,sessions:state.sessions.slice(0,10),memories:state.memories,rules};
 }
 server.registerTool('food_context', {title:'Read the personal food studio',description:'Read shared meal intelligence, confirmed taste evidence, editable preferences, chosen plans, rituals and recent receipts. Receipt frequency never implies individual enjoyment.',inputSchema:planInput,annotations:{readOnlyHint:true,destructiveHint:false}},async input=>json(await context(input)));
 server.registerTool('food_plan', {title:'Shape a meal from a craving',description:'Interpret editable food cues and exclusions; compose coherent same-restaurant meals with familiar, deliberate-twist and exploration directions. Price, source freshness and practical uncertainties remain explicit. Read-only; choosing a plan does not place an order.',inputSchema:planInput,annotations:{readOnlyHint:true,destructiveHint:false}},async input=>json(await context(input)));
 server.registerTool('food_record_learning', {
  title:'Save confirmed personal dish feedback',description:'Save only user-confirmed feedback about a real dish on a delivered receipt. Other diners and convenience are distinguished. Never invent consumption, reactions, mood or lasting preferences from an email.',
  inputSchema:{uid:z.string().optional(),orderId:z.string().min(1),dishId:z.string().min(1),confirmedByUser:z.literal(true),eaten:z.boolean(),reaction:z.enum(['loved','good','okay','never']),reason:z.enum(['taste','convenience','other']),mood:moods,note:z.string().max(1000).default('')},annotations:{readOnlyHint:false,destructiveHint:false}
 },async input=>{
  const ref=root(input.uid),core=await loadCore(),order=await ref.collection('orders').doc(input.orderId).get();
  if(!order.exists||order.get('status')!=='delivered'||!order.get('items')?.some((i:any)=>i.dishId===input.dishId))throw new Error('Choose a dish on an actual delivered receipt.');
  const data={id:core.entityId(input.orderId+'__'+input.dishId),orderId:input.orderId,dishId:input.dishId,restaurantId:order.get('restaurantId'),eaten:input.eaten,reaction:input.reaction,reason:input.reason,mood:input.mood,note:input.note,createdAt:new Date().toISOString()};
  await ref.collection('learning').doc(data.id).set(data);
  return json({ok:true,record:data,learnsEnjoyment:input.eaten&&input.reason!=='other'});
 });
 server.registerTool('food_publish_research', {
  title:'Publish sourced restaurant menu evidence',description:'Store menu facts actually checked by the connected agent. Require an HTTPS source and retrieval date. Use null for unknown price or vegetarian status; do not infer availability. This refreshes the shared discovery and meal studio.',
  inputSchema:{uid:z.string().optional(),name:z.string().min(1).max(300),outlet:z.string().max(1000).default(''),url:z.string().url().refine(v=>v.startsWith('https://')),checkedAt:date,mode:z.enum(['delivery','dine-in','both']).default('both'),note:z.string().max(2000).default(''),items:z.array(z.object({name:z.string().min(1).max(300),vegetarian:z.boolean().nullable(),price:z.number().min(0).max(99999).nullable()})).min(1).max(100)},annotations:{readOnlyHint:false,destructiveHint:false}
 },async input=>{
  const ref=root(input.uid),core=await loadCore();
  if(Date.parse(input.checkedAt)>Date.now()+300000)throw new Error('Research cannot have a future retrieval date.');
  const {uid,...data}=input,record={...data,id:core.entityId(input.name),createdAt:new Date().toISOString()};
  await ref.collection('research').doc(record.id).set(record);
  return json({ok:true,restaurantId:record.id,itemCount:record.items.length});
 });
 server.registerTool('food_ingest_email', {
  title:'Import and reconcile a Zomato receipt',description:'Normalize an authenticated receipt and atomically deduplicate by provider order ID. Respect paused ingestion. Link a chosen meal only when exactly one recent plan contains the same restaurant and all its dishes. Receipt linkage does not imply consumption or enjoyment.',
  inputSchema:{uid:z.string().optional(),gmailMessageId:z.string(),from:z.string(),subject:z.string(),receivedAt:date,text:z.string().max(100000)},annotations:{readOnlyHint:false,destructiveHint:false}
 },async input=>{
  const ref=root(input.uid),[core,model]=await Promise.all([loadCore(),loadStudio()]),order=core.normalizeEmail(input),orderRef=ref.collection('orders').doc(order.id);
  let duplicate=false,linkedSessionId:string|null=null;
  await db.runTransaction(async tx=>{
   const [settings,existing]=await Promise.all([tx.get(ref),tx.get(orderRef)]);
   if(settings.get('ingestionPaused')===true)throw new Error('Morsel ingestion is paused by its owner.');
   if(existing.exists){duplicate=true;return;}
   const uniqueItems=[...new Map(order.items.map((i:any)=>[i.dishId,i])).values()] as any[];
   const entityRefs:DocumentReference[]=[ref.collection('restaurants').doc(order.restaurantId),...uniqueItems.map((i:any)=>ref.collection('dishes').doc(i.dishId))];
   // All reads precede writes; receipt, entity counts and plan reconciliation are one transaction.
   const [entities,sessions]=await Promise.all([Promise.all(entityRefs.map(r=>tx.get(r))),tx.get(ref.collection('sessions').orderBy('createdAt','desc').limit(300))]);
   const match=order.status==='delivered'?model.matchingSession(order,sessions.docs.map(d=>({...d.data(),id:d.id}))):null;
   tx.create(orderRef,order);
   tx.set(entityRefs[0],{id:order.restaurantId,name:order.restaurantName,outlet:order.outlet,orderCount:(entities[0].get('orderCount')||0)+1,lastAt:order.receivedAt},{merge:true});
   uniqueItems.forEach((item:any,index:number)=>tx.set(entityRefs[index+1],{...item,id:item.dishId,orderCount:(entities[index+1].get('orderCount')||0)+1,lastAt:order.receivedAt},{merge:true}));
   if(match){linkedSessionId=match.id;tx.update(ref.collection('sessions').doc(match.id),{status:'receipt-linked',linkedOrderId:order.id,linkedAt:new Date().toISOString()});}
   tx.set(ref,{schemaVersion:2,orderCount:(settings.get('orderCount')||0)+1,lastIngestedAt:new Date().toISOString(),lastSourceMessageId:input.gmailMessageId},{merge:true});
  });
  return json({ok:true,duplicate,orderId:order.id,linkedSessionId,namespace:ref.path});
 });
}
