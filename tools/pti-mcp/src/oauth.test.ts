import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Response } from 'express';
import { createHttpApp } from './http-app.js';
import { PtiOAuthProvider, MCP_SCOPE } from './oauth.js';
import { type AuthStore, type RecordValue, digest, now } from './auth-store.js';
import { assertCollectionPath, assertDocumentPath } from './access.js';

class MemoryStore implements AuthStore {
  records = new Map<string,RecordValue>();
  async get(kind:string,key:string) { return this.records.get(`${kind}/${key}`); }
  async put(kind:string,key:string,value:RecordValue) { this.records.set(`${kind}/${key}`,structuredClone(value)); }
  async consume(kind:string,key:string,validate:(value:RecordValue)=>void,writes:{kind:string;key:string;value:RecordValue}[]) {
    const value=this.records.get(`${kind}/${key}`);if(!value)throw new Error('Consumed');
    validate(value);this.records.delete(`${kind}/${key}`);
    for(const w of writes)this.records.set(`${w.kind}/${w.key}`,structuredClone(w.value));
    return value;
  }
}
const servers: Server[]=[];
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>s.close(()=>resolve()))));});
async function fixture() {
  let admin=true;
  const store=new MemoryStore();
  const provider=new PtiOAuthProvider(store,'https://pti.example',async()=>{if(!admin)throw new Error('No longer admin');});
  const client=await provider.clientsStore.registerClient!({redirect_uris:['https://chatgpt.com/connector_platform/oauth_redirect'],token_endpoint_auth_method:'none',client_name:'Test client'});
  const verifier='v'.repeat(64);
  const challenge=Buffer.from(digest(verifier),'hex').toString('base64url');
  let cookie='',requestId='';
  const response={cookie:(_name:string,value:string)=>{cookie=value;},redirect:(url:string)=>{requestId=new URL(url).searchParams.get('request')!;}} as unknown as Response;
  await provider.authorize(client,{redirectUri:client.redirect_uris[0],codeChallenge:challenge,state:'state1',scopes:[MCP_SCOPE],resource:new URL(provider.resource)},response);
  const finish=async(csrf=cookie)=>provider.approve(requestId,csrf,{uid:'admin',email:'admin@example.com',authenticatedAt:now()});
  const code=async()=>new URL(await finish()).searchParams.get('code')!;
  return {store,provider,client,verifier,requestId,finish,code,removeAdmin:()=>{admin=false;}};
}
async function serverFor(provider:PtiOAuthProvider) {
  const app=createHttpApp({provider,verifyIdentity:async()=>({uid:'admin',email:'admin@example.com',authenticatedAt:now()}),firebaseConfig:{},
    createServer:()=>{const server=new McpServer({name:'test',version:'1'});server.registerTool('test_read',{inputSchema:{}},()=>({content:[{type:'text',text:'ok'}]}));return server;}});
  const server=app.listen(0,'127.0.0.1');servers.push(server);
  await new Promise<void>(resolve=>server.on('listening',resolve));
  return `http://127.0.0.1:${(server.address() as {port:number}).port}`;
}
describe('Persistent OAuth authorization',()=>{
  it('restricts dynamic registration redirect origins',async()=>{
    const {provider}=await fixture();
    await expect(provider.clientsStore.registerClient!({redirect_uris:['https://attacker.example/callback']})).rejects.toThrow();
  });
  it('rejects cross-browser consent and non-admin identities',async()=>{
    const f=await fixture();await expect(f.finish('wrong')).rejects.toThrow();f.removeAdmin();await expect(f.finish()).rejects.toThrow();
  });
  it('consumes browser consent and authorization codes once',async()=>{
    const f=await fixture(),code=await f.code();await expect(f.finish()).rejects.toThrow();
    await f.provider.exchangeAuthorizationCode(f.client,code,undefined,f.client.redirect_uris[0]);
    await expect(f.provider.exchangeAuthorizationCode(f.client,code,undefined,f.client.redirect_uris[0])).rejects.toThrow();
  });
  it('rejects wrong client, redirect URI and resource without consuming code',async()=>{
    const f=await fixture(),code=await f.code();
    await expect(f.provider.exchangeAuthorizationCode({...f.client,client_id:'wrong'},code,undefined,f.client.redirect_uris[0])).rejects.toThrow();
    await expect(f.provider.exchangeAuthorizationCode(f.client,code,undefined,'https://wrong.example')).rejects.toThrow();
    await expect(f.provider.exchangeAuthorizationCode(f.client,code,undefined,f.client.redirect_uris[0],new URL('https://wrong.example/mcp'))).rejects.toThrow();
    const tokens=await f.provider.exchangeAuthorizationCode(f.client,code,undefined,f.client.redirect_uris[0]);expect(tokens.access_token).toBeTruthy();
  });
  it('rotates refresh tokens and revokes session on replay',async()=>{
    const f=await fixture();const first=await f.provider.exchangeAuthorizationCode(f.client,await f.code(),undefined,f.client.redirect_uris[0]);
    const second=await f.provider.exchangeRefreshToken(f.client,first.refresh_token!);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect((await f.provider.verifyAccessToken(second.access_token)).extra?.uid).toBe('admin');
    await expect(f.provider.exchangeRefreshToken(f.client,first.refresh_token!)).rejects.toThrow();
    await expect(f.provider.verifyAccessToken(second.access_token)).rejects.toThrow();
  });
  it('rejects scope escalation and revoked admin roles',async()=>{
    const f=await fixture();const token=await f.provider.exchangeAuthorizationCode(f.client,await f.code(),undefined,f.client.redirect_uris[0]);
    await expect(f.provider.exchangeRefreshToken(f.client,token.refresh_token!,['other'])).rejects.toThrow();
    f.removeAdmin();await expect(f.provider.verifyAccessToken(token.access_token)).rejects.toThrow();
    await expect(f.provider.exchangeRefreshToken(f.client,token.refresh_token!)).rejects.toThrow();
  });
  it('keeps the connection renewable after ten years and revocable at any time',async()=>{
    const f=await fixture(),started=Date.now();
    const first=await f.provider.exchangeAuthorizationCode(f.client,await f.code(),undefined,f.client.redirect_uris[0]);
    vi.spyOn(Date,'now').mockReturnValue(started+3650*86400000);
    await expect(f.provider.verifyAccessToken(first.access_token)).rejects.toThrow();
    const next=await f.provider.exchangeRefreshToken(f.client,first.refresh_token!);
    expect((await f.provider.verifyAccessToken(next.access_token)).extra?.uid).toBe('admin');
    await f.provider.revokeToken(f.client,{token:next.refresh_token!});
    await expect(f.provider.verifyAccessToken(next.access_token)).rejects.toThrow();
    await expect(f.provider.exchangeRefreshToken(f.client,next.refresh_token!)).rejects.toThrow();
  });
  it('continues detecting refresh replay beyond the former 90-day limit',async()=>{
    const f=await fixture(),started=Date.now();
    const first=await f.provider.exchangeAuthorizationCode(f.client,await f.code(),undefined,f.client.redirect_uris[0]);
    const next=await f.provider.exchangeRefreshToken(f.client,first.refresh_token!);
    vi.spyOn(Date,'now').mockReturnValue(started+365*86400000);
    await expect(f.provider.exchangeRefreshToken(f.client,first.refresh_token!)).rejects.toThrow('replay');
    await expect(f.provider.exchangeRefreshToken(f.client,next.refresh_token!)).rejects.toThrow();
  });
  it('does not allow access tokens or pending browser requests to opt out of expiry',async()=>{
    const f=await fixture();
    const pending=(await f.store.get('pending',f.requestId))!;
    await f.store.put('pending',f.requestId,{...pending,expiresAt:null});
    await expect(f.finish()).rejects.toThrow();
    await f.store.put('pending',f.requestId,pending);
    const token=await f.provider.exchangeAuthorizationCode(f.client,await f.code(),undefined,f.client.redirect_uris[0]);
    const grant=(await f.store.get('access',token.access_token))!;
    await f.store.put('access',token.access_token,{...grant,expiresAt:null});
    await expect(f.provider.verifyAccessToken(token.access_token)).rejects.toThrow();
  });
  it('rejects expired access tokens and revokes the whole connection',async()=>{
    const f=await fixture();const token=await f.provider.exchangeAuthorizationCode(f.client,await f.code(),undefined,f.client.redirect_uris[0]);
    const grant=(await f.store.get('access',token.access_token))!;
    await f.store.put('access',token.access_token,{...grant,expiresAt:now()-1});
    await expect(f.provider.verifyAccessToken(token.access_token)).rejects.toThrow();
    await f.provider.revokeToken(f.client,{token:token.refresh_token!});
    await expect(f.provider.exchangeRefreshToken(f.client,token.refresh_token!)).rejects.toThrow();
  });
  it('prevents MCP tools from reading or overwriting authentication records',()=>{
    expect(()=>assertDocumentPath('_ptiMcpAuth/clients/items/secret')).toThrow();
    expect(()=>assertCollectionPath('_ptiMcpAuth/clients/items')).toThrow();
    expect(()=>assertDocumentPath('users//admin')).toThrow();
  });
  it('checks PKCE through the actual HTTP token endpoint',async()=>{
    const f=await fixture(),base=await serverFor(f.provider),code=await f.code();
    const exchange=(verifier:string)=>fetch(`${base}/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:f.client.client_id,code,code_verifier:verifier,redirect_uri:f.client.redirect_uris[0],resource:f.provider.resource})});
    expect((await exchange('wrong'.repeat(16))).status).toBe(400);
    const success=await exchange(f.verifier);expect(success.status).toBe(200);
    const token=await success.json();expect(token.access_token).toBeTruthy();
    expect((await exchange(f.verifier)).status).toBe(400);
  });
  it('requires bearer authentication and serves a valid authenticated MCP handshake',async()=>{
    const f=await fixture(),base=await serverFor(f.provider);
    const unauth=await fetch(`${base}/mcp`,{method:'POST'});expect(unauth.status).toBe(401);expect(unauth.headers.get('www-authenticate')).toContain('resource_metadata');
    const tokens=await f.provider.exchangeAuthorizationCode(f.client,await f.code(),undefined,f.client.redirect_uris[0]);
    const response=await fetch(`${base}/mcp`,{method:'POST',headers:{Authorization:`Bearer ${tokens.access_token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}})});
    expect(response.status).toBe(200);expect((await response.json()).result.serverInfo.name).toBe('test');
    const badOrigin=await fetch(`${base}/mcp`,{method:'POST',headers:{Authorization:`Bearer ${tokens.access_token}`,Origin:'https://attacker.example'}});expect(badOrigin.status).toBe(403);
  });
});
