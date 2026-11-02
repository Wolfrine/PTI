import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMorselBlinkitBridge} from './blinkit-webmcp.mjs';
const origin='https://pti-app-2ab59-morsel.web.app';
function fixture({fakeOrigin=false}={}){
 const registered=new Map(),requests=[],signals=[],user={uid:'synthetic-owner',getIdToken:async()=>'synthetic-private-token'};let current=user;
 const document={modelContext:{registerTool:async(tool,{signal})=>{registered.set(tool.name,tool);signals.push(signal);signal.addEventListener('abort',()=>registered.delete(tool.name));}}};
 const bridge=createMorselBlinkitBridge({document,location:{origin:fakeOrigin?'https://fake.example':origin},getCurrentUser:()=>current,fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);requests.push({url,options,body});
  if(body.action==='capabilities')return Response.json({ok:true,tools:['context','ingest','sync','events'].map(a=>({name:'food_blinkit_'+a,description:'Synthetic',inputSchema:{type:'object',properties:{}}}))});
  return Response.json({ok:true,processed:body.args.records?.length});
 }});
 return {bridge,registered,requests,signals,user,logout:()=>{current=null;}};
}
test('tools register only after owner authorization and exact origin, then unregister on logout',async()=>{
 const f=fixture();assert.equal((await f.bridge.setUser(null)).registered,false);assert.equal(f.requests.length,0);
 assert.equal((await f.bridge.setUser(f.user)).registered,true);assert.equal(f.registered.size,4);const stale=f.registered.get('morsel_blinkit_context');
 f.logout();await f.bridge.setUser(null);assert.equal(f.registered.size,0);assert(f.signals.every(s=>s.aborted));assert.equal((await stale.execute({})).error.code,'sign_in_required');
 const fake=fixture({fakeOrigin:true});assert.equal((await fake.bridge.setUser(fake.user)).registered,false);assert.equal(fake.requests.length,0);
});
test('canonical projection redacts nonfood/private fields before bounded transport; tokens never enter results',async()=>{
 const f=fixture();await f.bridge.setUser(f.user);
 const tool=f.registered.get('morsel_blinkit_ingest');
 const detail={order:'synthetic-row',phase:{kind:'finished',status:'delivered'},session:{userId:'synthetic-private-user'},contents:{kind:'read',reference:'SYNTHETIC',paymentMode:'private-mode',addressLabel:'private-address',items:[{name:'Lemon',quantityText:'200 g x 1',amount:10},{name:'Synthetic Shampoo',quantityText:'one',amount:20}],bill:{billTotal:30,lines:[]}}};
 const result=await tool.execute({records:[{detail,capturedAt:'2026-01-01T00:00:00Z'}]});assert.equal(result.ok,true);
 const req=f.requests.at(-1);for(const value of ['private-mode','private-address','Shampoo','synthetic-private-user','synthetic-private-token'])assert(!JSON.stringify(req.body).includes(value));
 assert.equal(req.options.headers.Authorization,'Bearer synthetic-private-token');assert.equal(req.options.credentials,'omit');assert(!JSON.stringify(result).includes('token'));
 assert.deepEqual(req.body.args.records[0].detail.contents.items[1],{name:null,quantityText:null,amount:20,excludedNonfood:true});
 assert.equal((await tool.execute({records:Array(11).fill({})})).error.code,'bounded_records_required');
 f.bridge.dispose();assert.equal(f.registered.size,0);
});
test('registration and in-flight requests abort if auth changes; denied backend never registers tools',async()=>{
 let current={uid:'one',getIdToken:async()=>'synthetic'},resolve,signal;
 const registrations=[];
 const bridge=createMorselBlinkitBridge({document:{modelContext:{registerTool:async t=>registrations.push(t)}},location:{origin},getCurrentUser:()=>current,
  fetchImpl:(_u,options)=>{signal=options.signal;return new Promise(r=>resolve=r);}});
 const pending=bridge.setUser(current);await new Promise(r=>setTimeout(r,0));current=null;await bridge.setUser(null);assert(signal.aborted);
 resolve(Response.json({ok:true,tools:[]}));assert.equal((await pending).registered,false);assert.equal(registrations.length,0);
 const denied=createMorselBlinkitBridge({document:{modelContext:{registerTool:async t=>registrations.push(t)}},location:{origin},getCurrentUser:()=>({uid:'one'}),fetchImpl:async()=>Response.json({ok:false,error:{code:'owner_authorization_required'}})});
 assert.equal((await denied.setUser({uid:'one',getIdToken:async()=>'synthetic'})).registered,false);assert.equal(registrations.length,0);
});
