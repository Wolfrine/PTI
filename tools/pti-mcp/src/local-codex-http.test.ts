import {describe,it,expect} from 'vitest';
import {createHttpApp,protocolRejectionReason} from './http-app.js';
import {PtiOAuthProvider,CODEX_SCOPE} from './oauth.js';
import {CodexRelay,OWNER,type RelayStore} from './local-codex.js';

describe('Local Codex protocol rejection diagnostics',()=>{
  it('rejects unsupported non-initialize versions without database reads, but still authenticates negotiation and every valid request',async()=>{
    const records=new Map<string,any>([
      ['access/fixture',{expiresAt:Math.floor(Date.now()/1000)+300,sessionId:'fixture',resource:'https://pti.example/local-codex/mcp',uid:OWNER,clientId:'fixture',scopes:[CODEX_SCOPE],authenticatedAt:0}],
      ['sessions/fixture',{expiresAt:null,revoked:false}],
    ]);
    let reads=0,checks=0,workerReads=0;
    const provider=new PtiOAuthProvider({get:async(kind:string,key:string)=>{reads++;return records.get(`${kind}/${key}`);},put:async()=>{},consume:async()=>{throw Error('Unused');}},'https://pti.example',async()=>{checks++;});
    const events:unknown[]=[];
    const app=createHttpApp({provider,codex:new CodexRelay({worker:async()=>{workerReads++;return undefined;}} as unknown as RelayStore),verifyIdentity:async()=>{throw Error('Unused');},firebaseConfig:{},createServer:()=>{throw Error('Unused');},onProtocolRejection:event=>events.push(event)});
    const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
    const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/local-codex/mcp`;
    const rpc=(body:unknown,version='2025-11-25',token='fixture',origin?:string)=>fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':version,...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
    const call={jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'bridge_status',arguments:{}}};
    try{
      const rejected=await rpc(call,'2099-01-01');expect(rejected.status).toBe(400);
      expect((await rejected.json()).error.code).toBe(-32000);expect(reads).toBe(0);expect(checks).toBe(0);expect(workerReads).toBe(0);
      const emptyVersion=await rpc(call,'');expect(emptyVersion.status).toBe(400);await emptyVersion.text();expect(reads).toBe(0);expect(workerReads).toBe(0);
      const init=await rpc({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2099-01-01',capabilities:{},clientInfo:{name:'fixture',version:'1'}}},'2099-01-01');
      expect(init.status).toBe(200);expect((await init.json()).result.protocolVersion).not.toBe('2099-01-01');expect(reads).toBe(2);expect(checks).toBe(1);
      const accepted=await rpc(call);expect(accepted.status).toBe(200);await accepted.text();expect(reads).toBe(4);expect(checks).toBe(2);expect(workerReads).toBe(1);
      records.get('sessions/fixture').revoked=true;
      const revoked=await rpc(call);expect(revoked.status).toBe(401);await revoked.text();expect(reads).toBe(6);expect(checks).toBe(2);expect(workerReads).toBe(1);
      const invalid=await rpc(call,'2025-11-25','absent');expect(invalid.status).toBe(401);await invalid.text();expect(reads).toBe(7);
      const badProtocolAndToken=await rpc(call,'2099-01-01','absent');expect(badProtocolAndToken.status).toBe(400);await badProtocolAndToken.text();expect(reads).toBe(7);expect(workerReads).toBe(1);
      records.get('sessions/fixture').revoked=false;records.get('access/fixture').uid='foreign';
      const foreign=await rpc(call);expect(foreign.status).toBe(403);await foreign.text();expect(workerReads).toBe(1);
      const before=reads,origin=await rpc(call,'2099-01-01','fixture','https://attacker.example');expect(origin.status).toBe(403);await origin.text();expect(reads).toBe(before);
      records.get('access/fixture').uid=OWNER;
      for(const [headers,body,expected] of [
        [{'MCP-Protocol-Version':'2099-01-01'},JSON.stringify(call),401],
        [{Authorization:'Bearer absent','Content-Type':'application/json'},'{',401],
        [{Authorization:'Bearer fixture','Content-Type':'application/json'},'{',400],
        [{Authorization:'Bearer fixture','Content-Type':'application/json','MCP-Protocol-Version':'2099-01-01'},JSON.stringify(call),406],
        [{Authorization:'Bearer fixture','Content-Type':'text/plain',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2099-01-01'},JSON.stringify(call),415],
      ] as const){
        const result=await fetch(url,{method:'POST',headers,body});expect(result.status).toBe(expected);await result.text();
      }
      const oversized=await rpc(Array.from({length:101},()=>({jsonrpc:'2.0',method:'notifications/initialized'})),'2099-01-01');
      expect(oversized.status).toBe(400);expect((await oversized.json()).error.code).toBe(-32600);
      const missingVersion=await fetch(url,{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify(call)});
      expect(missingVersion.status).toBe(200);await missingVersion.text();
      for(const [token,expected] of [['absent',401],['fixture',405]] as const){const result=await fetch(url,{method:'GET',headers:{Authorization:`Bearer ${token}`}});expect(result.status).toBe(expected);await result.text();}
      expect(JSON.stringify(events)).not.toContain('2099');
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
  it('keeps authorization and response semantics while identifying rejected initialize batches',async()=>{
    const records=new Map<string,any>([
      ['access/fixture',{expiresAt:Math.floor(Date.now()/1000)+300,sessionId:'fixture',resource:'https://pti.example/local-codex/mcp',uid:OWNER,clientId:'fixture',scopes:[CODEX_SCOPE],authenticatedAt:0}],
      ['sessions/fixture',{expiresAt:null,revoked:false}],
    ]);
    let reads=0,checks=0;
    const provider=new PtiOAuthProvider({get:async(kind:string,key:string)=>{reads++;return records.get(`${kind}/${key}`);},put:async()=>{},consume:async()=>{throw Error('Unused');}},'https://pti.example',async()=>{checks++;});
    const events:unknown[]=[];
    const app=createHttpApp({provider,codex:new CodexRelay({worker:async()=>undefined} as unknown as RelayStore),verifyIdentity:async()=>{throw Error('Unused');},firebaseConfig:{},createServer:()=>{throw Error('Unused');},onProtocolRejection:event=>events.push(event)});
    const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
    const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/local-codex/mcp`;
    const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'fixture',version:'1'}}};
    const rpc=(body:unknown,token='fixture')=>fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify(body)});
    try{
      const batch=await rpc([init,{jsonrpc:'2.0',method:'notifications/initialized'}]);
      expect(batch.status).toBe(400);await batch.text();
      expect(events).toEqual([{event:'mcp_protocol_rejected',route:'local-codex',reason:'initialize_batch',stage:'transport'}]);
      const initialized=await rpc(init);expect(initialized.status).toBe(200);await initialized.text();
      const notice=await rpc({jsonrpc:'2.0',method:'notifications/initialized'});expect(notice.status).toBe(202);await notice.text();
      const status=await rpc({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'bridge_status',arguments:{}}});expect(status.status).toBe(200);await status.text();
      expect(reads).toBe(8);expect(checks).toBe(4);
      records.get('sessions/fixture').revoked=true;
      const revoked=await rpc({jsonrpc:'2.0',id:3,method:'tools/list'});expect(revoked.status).toBe(401);await revoked.text();
      expect(reads).toBe(10);expect(checks).toBe(4);expect(events).toHaveLength(1);
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
  it('never emits private request values or unknown SDK error strings',()=>{
    for(const message of ['PRIVATE TOKEN AND PROMPT','Parse error: PRIVATE','Bad Request: Unsupported protocol version: PRIVATE']){
      expect(protocolRejectionReason(Error(message))).not.toContain('PRIVATE');
    }
  });
});
