import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import { z } from 'zod';
import { assertUser } from './access.js';
const json = (value: unknown) => ({content:[{type:'text' as const,text:JSON.stringify(value)}]});
export function registerFoodTools(server: McpServer, db: Firestore, owner: string | undefined) {
 const root = (uid?: string) => { if(uid) assertUser(uid,owner); return db.doc(`users/${assertUser(owner||uid||'',owner)}/foodData/workspace`); };
 const loadCore = async () => { const path='./food-core.mjs'; return import(path); };
 server.registerTool('food_context', {
  title:'Read Morsel food context',description:'Read the private taste model, explicit feedback and recent Zomato orders. No emotional state, live menus or calibrated match percentages are inferred.',
  inputSchema:{uid:z.string().optional(),mood:z.string().optional(),hunger:z.enum(['Small','Regular','High']).optional(),budget:z.number().min(0).optional()},annotations:{readOnlyHint:true,destructiveHint:false}
 },async input=>{
  const ref=root(input.uid), core=await loadCore();
  const [profile,orders,feedback]=await Promise.all([ref.get(),ref.collection('orders').orderBy('receivedAt','desc').limit(501).get(),ref.collection('feedback').orderBy('createdAt','desc').limit(500).get()]);
  const rows=orders.docs.slice(0,500).map(d=>d.data()), reactions=feedback.docs.map(d=>d.data());
  return json({namespace:ref.path,settings:profile.data()||{},window:{limit:500,truncated:orders.size>500},...core.recommend(rows,reactions,input),recentOrders:rows.slice(0,15),rules:['Mood is explicit, never inferred from receipts.','Time is email receipt time in Asia/Kolkata.','Dish tags are name heuristics; quantities may describe shared meals.','Current menus, availability, prices and vegetarian ingredients require verification.']});
 });
 server.registerTool('food_ingest_email', {
  title:'Import a Zomato receipt',description:'Normalize an authenticated Zomato receipt and atomically deduplicate by provider order ID. Preserve source provenance; reject incomplete receipts and paused ingestion.',
  inputSchema:{uid:z.string().optional(),gmailMessageId:z.string(),from:z.string(),subject:z.string(),receivedAt:z.string(),text:z.string().max(100000)},annotations:{readOnlyHint:false,destructiveHint:false}
 },async input=>{
  const ref=root(input.uid),core=await loadCore(),order=core.normalizeEmail(input), orderRef=ref.collection('orders').doc(order.id);
  let duplicate=false;
  await db.runTransaction(async tx=>{
   const [settings,existing]=await Promise.all([tx.get(ref),tx.get(orderRef)]);
   if(settings.get('ingestionPaused')===true) throw new Error('Morsel ingestion is paused by its owner.');
   if(existing.exists){ duplicate=true; return; }
   const uniqueItems=[...new Map(order.items.map((i:any)=>[i.dishId,i])).values()] as any[];
   const entityRefs: DocumentReference[]=[ref.collection('restaurants').doc(order.restaurantId),...uniqueItems.map((i:any)=>ref.collection('dishes').doc(i.dishId))];
   const entities=await Promise.all(entityRefs.map(r=>tx.get(r)));
   tx.create(orderRef,order);
   tx.set(entityRefs[0],{id:order.restaurantId,name:order.restaurantName,outlet:order.outlet,orderCount:(entities[0].get('orderCount')||0)+1,lastAt:order.receivedAt},{merge:true});
   uniqueItems.forEach((item:any,index:number)=>tx.set(entityRefs[index+1],{...item,id:item.dishId,orderCount:(entities[index+1].get('orderCount')||0)+1,lastAt:order.receivedAt},{merge:true}));
   tx.set(ref,{schemaVersion:1,orderCount:(settings.get('orderCount')||0)+1,lastIngestedAt:new Date().toISOString(),lastSourceMessageId:input.gmailMessageId},{merge:true});
  });
  return json({ok:true,duplicate,orderId:order.id,namespace:ref.path});
 });
}
