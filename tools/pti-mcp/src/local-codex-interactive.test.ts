import {describe,it,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {interactiveCapabilities,browserContextSchema} from './local-codex-capabilities.js';
import {InteractiveQaBroker,FirestoreInteractiveQaStore,type InteractiveQaStore,type QaRequest,type Foreground} from './local-codex-interactive.js';
import {CodexRelay,createCodexServer,heartbeatSchema,OWNER,type RelayStore} from './local-codex.js';

// Deliberately synthetic protocol cases. These never establish game/session acceptance.
class Memory implements InteractiveQaStore {
  requests=new Map<string,QaRequest>();foreground:Foreground|null=null;operations=new Map<string,any>();accesses=0;
  async read(_uid:string,id:string){this.accesses++;return structuredClone(this.requests.get(id));}
  async list(_uid:string,cursor:string|undefined,limit:number){this.accesses++;const rows=[...this.requests.values()].sort((a,b)=>b.updatedAt-a.updatedAt||b.id.localeCompare(a.id));const start=cursor?rows.findIndex(r=>r.id===cursor)+1:0,page=rows.slice(start,start+limit+1);return {requests:structuredClone(page.slice(0,limit)),nextCursor:page.length>limit?page[limit-1].id:null};}
  async update(uid:string,id:string,operationId:string,change:Parameters<InteractiveQaStore['update']>[3]){
    this.accesses++;const key=uid+id+operationId,next=change(structuredClone(this.requests.get(id)),structuredClone(this.foreground),this.operations.get(key));
    this.requests.set(id,structuredClone(next.request));this.foreground=structuredClone(next.foreground);this.operations.set(key,next.operation);return structuredClone(next.request);
  }
}
const input={request_key:'qa-example-one',project:'taleweald',revision:'synthetic-revision',url:'https://taleweald.firebaseapp.com/play/',build:'synthetic-unexecuted-artifact',objectives:['Observe movement and audible return consequence'],device:{viewport:'both',input:'both',audio:'required'}} as const;
const source={source_session_id:'synthetic-desktop-thread',entrypoint:'@Chrome',owner_consent_confirmed:true,foreground_exclusive_confirmed:true} as const;
function setup(){let now=1794070000000;const store=new Memory(),broker=new InteractiveQaBroker(store,OWNER,()=>now);return {store,broker,clock:()=>now,advance:(ms:number)=>now+=ms,request:()=>broker.request(OWNER,input,[])};}
async function begin(f:ReturnType<typeof setup>){const request=await f.request();return f.broker.update(OWNER,{request_id:request.request_id,request_key:'begin-example',action:'begin',session:source});}
function report(f:ReturnType<typeof setup>){const at=new Date(f.clock()).toISOString();return {gameplay_verdict:'playable_observed',observations:['Synthetic operator claim, never verified by broker'],visual_observed:true,audio_observed:true,observed_at:at,artifacts:[
  {kind:'screenshot',uri:'F:/synthetic/screen.png',sha256:'1'.repeat(64),captured_at:at,capture_source:'official-browser-tool'},
  {kind:'audio',uri:'F:/synthetic/audio.wav',sha256:'2'.repeat(64),captured_at:at,capture_source:'owner-recording'},
]};}
describe('truthful capabilities',()=>{
  it('never authorizes from online status, environment presence, old workers, or caller-supplied grants',()=>{
    const now=1794070000000;
    for(const worker of [undefined,{version:'0.4.7',at:now},{version:'0.4.8',at:now,browser_context:{executionContext:'standalone-app-server',status:'unverified',reason:'app-session-context-unverified',verified:false}},{version:'0.4.8',at:now-61000}]){
      const value=interactiveCapabilities(worker as any,now);expect(value).toMatchObject({canPlayWithAudio:false,officialProgrammaticSessionProviderSupported:false,desktop:{state:'requires_handoff',authorized:false},browser:{state:'requires_handoff',authorized:false},audio:{playback:{state:'unverified'},capture:{state:'unsupported'},analysis:{state:'unsupported'}}});
      expect(value.nextStep).toContain('Remote');expect(JSON.stringify(value)).not.toContain('SYNTHETIC_SECRET');
    }
    expect(browserContextSchema.safeParse({executionContext:'standalone-app-server',status:'authorized',verified:true,pipe:'SYNTHETIC_SECRET'}).success).toBe(false);
    expect(heartbeatSchema.safeParse({instanceId:'00000000-0000-4000-8000-000000000001',authMode:'chatgpt',version:'0.4.8',projects:[],browser_context:{executionContext:'standalone-app-server',status:'unverified',reason:'app-session-context-unverified',verified:false,pipe:'SYNTHETIC_SECRET'}}).success).toBe(false);
  });
});
describe('durable owner-scoped manual QA broker',()=>{
  it('persists an idempotent actionable handoff without an online worker, new model task, or automatic provider',async()=>{
    const f=setup(),first=await f.request();expect(first).toMatchObject({status:'requires_handoff',providerSessionVerified:false,playableTested:false,run:null,receipt:null,automaticActivation:false});
    expect(await new InteractiveQaBroker(f.store,OWNER,f.clock).request(OWNER,input,[])).toEqual(first);expect(f.store.requests.size).toBe(1);expect(f.store.foreground).toBeNull();
    await expect(f.broker.request(OWNER,{...input,revision:'different'},[])).rejects.toThrow('different QA request');
    await expect(f.broker.request(OWNER,{...input,project:'unknown',url:'https://untrusted.example/'},[])).rejects.toThrow('allowlisted');
    await expect(f.broker.request(OWNER,{...input,url:'https://taleweald.firebaseapp.com.attacker.example/'},[])).rejects.toThrow('allowlisted');
    const allowed=await f.broker.request(OWNER,{...input,request_key:'allowlisted-example',project:'scratch',url:'http://127.0.0.1:8000/'},[{key:'scratch',available:true}]);expect(allowed.status).toBe('requires_handoff');
  });
  it('denies foreign owner reads/writes before storage, including guessed request IDs',async()=>{
    const f=setup(),request=await f.request(),before=f.store.accesses;
    for(const action of [()=>f.broker.request('foreign',input,[]),()=>f.broker.get('foreign',request.request_id),()=>f.broker.list('foreign',{}),()=>f.broker.update('foreign',{request_id:request.request_id,request_key:'foreign-example',action:'release'})])await expect(action()).rejects.toThrow('not authorized');
    expect(f.store.accesses).toBe(before);
  });
  it('admits only one of simultaneous foreground claims from separate broker clients',async()=>{
    const f=setup(),first=await f.request(),second=await f.broker.request(OWNER,{...input,request_key:'competing-client'},[]),other=new InteractiveQaBroker(f.store,OWNER,f.clock);
    const results=await Promise.allSettled([f.broker.update(OWNER,{request_id:first.request_id,request_key:'begin-concurrent-one',action:'begin',session:source}),other.update(OWNER,{request_id:second.request_id,request_key:'begin-concurrent-two',action:'begin',session:source})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect([...f.store.requests.values()].filter(r=>r.status==='active')).toHaveLength(1);expect(f.store.foreground).not.toBeNull();
  });
  it('requires session consent, serializes one physical foreground, and retains expired reservations until confirmed idle release',async()=>{
    const f=setup(),request=await f.request();
    await expect(f.broker.update(OWNER,{request_id:request.request_id,request_key:'begin-no-session',action:'begin'})).rejects.toThrow('consent');
    const active=await begin(f),second=await f.broker.request(OWNER,{...input,request_key:'second-example'},[]);
    expect(active).toMatchObject({status:'active',authorizationProofKind:'owner-scoped-operator-attestation',providerSessionVerified:false,playableTested:false});
    await expect(f.broker.update(OWNER,{request_id:second.request_id,request_key:'begin-second',action:'begin',session:source})).rejects.toThrow('Foreground reserved');
    f.advance(90001);expect((await f.broker.get(OWNER,request.request_id)).status).toBe('expired');expect(f.store.requests.get(request.request_id)!.status).toBe('active');
    await f.broker.update(OWNER,{request_id:request.request_id,request_key:'expire-first',action:'expire'});
    await expect(f.broker.update(OWNER,{request_id:second.request_id,request_key:'begin-second',action:'begin',session:source})).rejects.toThrow('Foreground reserved');
    await expect(f.broker.update(OWNER,{request_id:request.request_id,request_key:'release-first',action:'release'})).rejects.toThrow('desktop_idle');
    await f.broker.update(OWNER,{request_id:request.request_id,request_key:'release-first',action:'release',desktop_idle:true});
    expect((await f.broker.update(OWNER,{request_id:second.request_id,request_key:'begin-second',action:'begin',session:source})).status).toBe('active');
    await expect(f.broker.update(OWNER,{request_id:request.request_id,request_key:'late-finish',action:'complete',run_id:active.run!.id,desktop_idle:true,receipt:report(f)})).rejects.toThrow('unexpired');
  });
  it('renews only the matching run, rejects incomplete/future/audio-free claims, and preserves operator provenance on completion',async()=>{
    const f=setup(),active=await begin(f),base={request_id:active.request_id,run_id:active.run!.id};
    await expect(f.broker.update(OWNER,{...base,run_id:'00000000-0000-4000-8000-000000000001',request_key:'wrong-run',action:'renew'})).rejects.toThrow('matching run_id');
    f.advance(50000);await f.broker.update(OWNER,{...base,request_key:'renew-first',action:'renew'});f.advance(50000);
    const receipt=report(f),complete={...base,request_key:'complete-first',action:'complete',desktop_idle:true};
    for(const bad of [{...receipt,artifacts:[]},{...receipt,audio_observed:false},{...receipt,observed_at:new Date(f.clock()+1).toISOString()},{...receipt,artifacts:[receipt.artifacts[0]]},{...receipt,artifacts:[{...receipt.artifacts[0],uri:'https://example.com/file?token=secret'}]}])await expect(f.broker.update(OWNER,{...complete,receipt:bad})).rejects.toThrow();
    const finished=await f.broker.update(OWNER,{...complete,receipt});expect(finished).toMatchObject({status:'completed',playableTested:false,providerSessionVerified:false,receipt:{source:'operator-reported',verification:'not-independently-verified',owner_verdict:'unreviewed',run_id:base.run_id}});expect(f.store.foreground).toBeNull();
    expect(await f.broker.update(OWNER,{...complete,receipt})).toEqual(finished);
    await expect(f.broker.update(OWNER,{...complete,receipt:{...receipt,observations:['changed']}})).rejects.toThrow('different QA update');
  });
  it('retains failed/released/expired handoffs and paginates without pretending they were tested',async()=>{
    const f=setup(),active=await begin(f);await f.broker.update(OWNER,{request_id:active.request_id,run_id:active.run!.id,request_key:'failure-first',action:'fail',desktop_idle:true,reason:'Official tool reported URL-policy denial; no retry.'});
    f.advance(1);const next=await f.broker.request(OWNER,{...input,request_key:'expires-example',expires_at:new Date(f.clock()+5).toISOString()},[]);f.advance(6);
    await f.broker.update(OWNER,{request_id:next.request_id,request_key:'expire-example',action:'expire'});
    const page=await f.broker.list(OWNER,{limit:1});expect(page.nextCursor).toBeTruthy();const rest=await f.broker.list(OWNER,{limit:1,cursor:page.nextCursor});expect(new Set([page.requests[0].request_id,rest.requests[0].request_id]).size).toBe(2);expect(page.requests[0].receipt).toBeNull();expect(rest.requests[0].status).toBe('failed');
  });
  it('preserves the server-only owner namespace and atomically reads/writes reservation and idempotency records',async()=>{
    const f=setup(),transactions:any[]=[];const docs=new Map<string,any>();
    const ref=(path:string):any=>({path,collection:(collection:string)=>({doc:(name:string)=>ref(path+'/'+collection+'/'+name)}),doc:(name:string)=>ref(path+'/'+name)});
    const db:any={doc:ref,runTransaction:async(fn:any)=>{const writes:any[]=[];const value=await fn({getAll:async(...refs:any[])=>refs.map(r=>({exists:docs.has(r.path),data:()=>structuredClone(docs.get(r.path))})),set:(r:any,v:any)=>writes.push(['set',r.path,v]),delete:(r:any)=>writes.push(['delete',r.path])});for(const [op,p,v] of writes){if(op==='set')docs.set(p,structuredClone(v));else docs.delete(p);}transactions.push(writes);return value;}};
    const broker=new InteractiveQaBroker(new FirestoreInteractiveQaStore(db,OWNER),OWNER,f.clock);const request=await broker.request(OWNER,input,[]);const active=await broker.update(OWNER,{request_id:request.request_id,request_key:'firestore-begin',action:'begin',session:source});
    expect(transactions[1].some((w:any)=>w[1].endsWith('/interactiveQaLocks/foreground'))).toBe(true);expect([...docs.keys()].every(p=>p.startsWith(`_ptiLocalServices/local-codex/owners/${OWNER}/`))).toBe(true);
    await broker.update(OWNER,{request_id:request.request_id,request_key:'firestore-begin',action:'begin',session:source});expect(transactions[2]).toEqual([]);expect(active.providerSessionVerified).toBe(false);
  });
  it('advertises hosted/mobile interfaces and retains the owner guard through MCP',async()=>{
    const f=setup(),store={interactive:f.store,worker:async()=>undefined} as unknown as RelayStore,relay=new CodexRelay(store,f.clock),server=createCodexServer(relay,OWNER),client=new Client({name:'synthetic-qa-contract',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
    try{
      const tools=(await client.listTools()).tools;for(const name of ['get_capabilities','request_interactive_qa','get_interactive_qa','list_interactive_qa','update_interactive_qa'])expect(tools.some(t=>t.name===name)).toBe(true);
      const result=await client.callTool({name:'get_capabilities',arguments:{}});expect(JSON.parse((result.content as any)[0].text).canPlayWithAudio).toBe(false);
      const queued=await client.callTool({name:'request_interactive_qa',arguments:input});expect(queued.isError).not.toBe(true);expect(JSON.parse((queued.content as any)[0].text).status).toBe('requires_handoff');
      await expect(new CodexRelay(store,f.clock).requestInteractiveQa('foreign',input)).rejects.toThrow('not authorized');
    }finally{await client.close();await server.close();}
  });
});
