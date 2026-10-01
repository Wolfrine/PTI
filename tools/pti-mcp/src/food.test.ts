import {it,expect} from 'vitest';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
// Exercise the deployable module and copied shared model, rather than a second implementation.
import {registerFoodTools} from '../dist/food.js';
class MemoryDb {
 rows=new Map<string,any>();
 doc(path:string){const db=this;return {path,id:path.split('/').at(-1),collection:(n:string)=>db.collection(path+'/'+n),get:async()=>db.snapshot(path),set:async(v:any)=>db.rows.set(path,v)};}
 collection(path:string){const db=this;return {path,doc:(id:string)=>db.doc(path+'/'+id),orderBy:(field:string)=>({limit:(limit:number)=>({path,field,limit,get:async()=>db.query(path,field,limit)})})};}
 snapshot(path:string){const data=this.rows.get(path);return {id:path.split('/').at(-1),exists:!!data,data:()=>data,get:(field:string)=>data?.[field]};}
 query(path:string,field:string,limit:number){const docs=[...this.rows.keys()].filter(k=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')).map(k=>this.snapshot(k)).sort((a,b)=>String(b.get(field)).localeCompare(String(a.get(field)))).slice(0,limit);return {docs,size:docs.length};}
 async runTransaction(fn:any){const pending:any[]=[];const db=this;await fn({get:async(r:any)=>r.field?db.query(r.path,r.field,r.limit):db.snapshot(r.path),create:(r:any,v:any)=>pending.push([r.path,v]),set:(r:any,v:any,o:any)=>pending.push([r.path,o?.merge?{...db.rows.get(r.path),...v}:v]),update:(r:any,v:any)=>pending.push([r.path,{...db.rows.get(r.path),...v}])});pending.forEach(([k,v])=>db.rows.set(k,v));}
}
const root='users/owner/foodData/workspace';
const email={gmailMessageId:'abcdef001',from:'noreply@zomato.com',subject:'Your Zomato order from Veg Table',receivedAt:'2026-10-01T12:00:00Z',text:'ORDER ID: 987654321\nDelivered\nVeg Table\nKharghar\n1 X Dal Tadka\n1 X Roti\nTotal paid - ₹500'};
async function setup(){const db=new MemoryDb(),server=new McpServer({name:'food-test',version:'1'});registerFoodTools(server,db as any,'owner');const client=new Client({name:'test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);const call=async(name:string,args:any)=>{const r=await client.callTool({name,arguments:args});return {error:r.isError===true,value:JSON.parse(r.content.find((c:any)=>c.type==='text')?.text||'null')};};const raw=async(name:string,args:any)=>client.callTool({name,arguments:args});return {db,client,server,call,raw,close:async()=>{await client.close();await server.close()}};}
it('deployable food tools atomically ingest, deduplicate, reconcile and respect pause',async()=>{
 const t=await setup();try{
  const model=await import('../dist/food/core.mjs');
  t.db.rows.set(root,{orderCount:0});t.db.rows.set(root+'/sessions/plan',{id:'plan',restaurantId:model.entityId('Veg Table'),dishIds:[model.entityId('Dal Tadka'),model.entityId('Roti')],status:'chosen',createdAt:'2026-10-01T11:00:00Z'});
  const first=await t.call('food_ingest_email',email);expect(first.error).toBe(false);expect(first.value.linkedSessionId).toBe('plan');expect(t.db.rows.get(root+'/sessions/plan').status).toBe('receipt-linked');expect(t.db.rows.get(root).orderCount).toBe(1);
  const duplicate=await t.call('food_ingest_email',email);expect(duplicate.value.duplicate).toBe(true);expect(t.db.rows.get(root).orderCount).toBe(1);expect([...t.db.rows.keys()].some(k=>k.includes('/learning/'))).toBe(false);
  t.db.rows.set(root,{ingestionPaused:true,orderCount:1});expect((await t.raw('food_ingest_email',{...email,text:email.text.replace('987654321','987654322')})).isError).toBe(true);expect(t.db.rows.get(root).orderCount).toBe(1);
 }finally{await t.close()}
});
it('agents share app plans, require confirmed actual dish feedback, and preserve research provenance',async()=>{
 const t=await setup();try{
  expect((await t.raw('food_plan',{uid:'outsider'})).isError).toBe(true);
  await t.call('food_ingest_email',email);const plan=await t.call('food_plan',{craving:'Soft, not too rich',mood:'Comfort'});expect(plan.value.profile.orderCount).toBe(1);expect(plan.value.taste.confirmedMeals).toBe(0);expect(plan.value.plans.length).toBeGreaterThan(0);
  const receipt=plan.value.recentOrders[0],args={orderId:receipt.id,dishId:receipt.items[0].dishId,eaten:true,reaction:'loved',reason:'taste',mood:'Comfort'};
  expect((await t.raw('food_record_learning',args)).isError).toBe(true);expect((await t.raw('food_record_learning',{...args,confirmedByUser:true,dishId:'invented'})).isError).toBe(true);
  const saved=await t.call('food_record_learning',{...args,confirmedByUser:true});expect(saved.value.learnsEnjoyment).toBe(true);
  const after=await t.call('food_context',{});expect(after.value.taste.confirmedMeals).toBe(1);
  const research={name:'New Place',url:'https://example.com/menu',checkedAt:new Date().toISOString(),items:[{name:'Idli',price:null,vegetarian:null}]};
  expect((await t.call('food_publish_research',research)).value.itemCount).toBe(1);expect((await t.raw('food_publish_research',{...research,checkedAt:'2099-01-01T00:00:00Z'})).isError).toBe(true);
  const discovered=await t.call('food_plan',{});expect(discovered.value.candidates.find((d:any)=>d.restaurant==='New Place').price).toBeNull();
 }finally{await t.close()}
});
