import {describe,it,expect} from 'vitest';
import {createHttpApp,protocolRejectionReason} from './http-app.js';
import {PtiOAuthProvider,CODEX_SCOPE} from './oauth.js';
import {CodexRelay,OWNER,type RelayStore} from './local-codex.js';

describe('Local Codex protocol rejection diagnostics',()=>{
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
      expect(events).toEqual([{event:'mcp_protocol_rejected',route:'local-codex',reason:'initialize_batch'}]);
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
