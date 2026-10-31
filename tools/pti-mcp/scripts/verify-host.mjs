import assert from 'node:assert/strict';
const origin = process.env.PUBLIC_ORIGIN;
assert(origin);
const get = async path => { const response = await fetch(origin + path, { signal: AbortSignal.timeout(30000) }); assert.equal(response.status, 200, path); return response.json(); };
assert.equal((await get('/health')).service, 'pti-firestore-mcp');
const oauth = await get('/.well-known/oauth-authorization-server');
assert.equal(new URL(oauth.issuer).href, new URL(origin).href);
assert(oauth.code_challenge_methods_supported.includes('S256'));
const metadata = await get('/.well-known/oauth-protected-resource/mcp');
assert.equal(metadata.resource, `${origin}/mcp`);
const unauth = await fetch(`${origin}/mcp`, { method: 'POST', signal: AbortSignal.timeout(30000) });
assert.equal(unauth.status, 401);
assert(unauth.headers.get('www-authenticate').includes('resource_metadata'));
const codexMetadata=await get('/.well-known/oauth-protected-resource/local-codex/mcp');
assert.equal(codexMetadata.resource,`${origin}/local-codex/mcp`);
assert.deepEqual(codexMetadata.scopes_supported,['local-codex:jobs']);
assert.equal((await fetch(`${origin}/local-codex/mcp`,{method:'POST'})).status,401);
console.log('HTTPS discovery, PKCE metadata and unauthenticated access rejection passed. User OAuth connection still required.');
// Deployment-identity acceptance check. The existing CI admin credential grants a
// five-minute test session to the already approved owner; both records are deleted.
// No user OAuth connection is replaced or reused, and no token is printed.
await import('../dist/index.js');
const {getAuth}=await import('firebase-admin/auth');
const {getFirestore}=await import('firebase-admin/firestore');
const {secret,digest,now}=await import('../dist/auth-store.js');
const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
const user=await getAuth().getUserByEmail('schttewary@gmail.com');assert(user.emailVerified&&!user.disabled);
const db=getFirestore(),token=secret(),sessionId=secret();
const accessRef=db.doc(`_ptiMcpAuth/access/items/${digest(token)}`),sessionRef=db.doc(`_ptiMcpAuth/sessions/items/${digest(sessionId)}`);
const codexToken=secret(),codexSessionId=secret();
const codexAccess=db.doc(`_ptiMcpAuth/access/items/${digest(codexToken)}`),codexSession=db.doc(`_ptiMcpAuth/sessions/items/${digest(codexSessionId)}`);
let client,codexClient;
try{
 const batch=db.batch();batch.set(sessionRef,{expiresAt:now()+300,revoked:false});batch.set(accessRef,{uid:user.uid,email:user.email,authenticatedAt:now(),clientId:'morsel-deployment-check',scopes:['pti:apps'],sessionId,resource:origin+'/mcp',expiresAt:now()+300});await batch.commit();
 client=new Client({name:'morsel-live-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}}));
 const names=(await client.listTools()).tools.map(t=>t.name);for(const name of ['food_context','food_plan','food_record_learning','food_publish_research','food_ingest_email','venture_context','venture_claim_research','venture_publish_research'])assert(names.includes(name));
 const result=await client.callTool({name:'food_plan',arguments:{craving:'Comforting, not too rich',mood:'Comfort'}});assert(!result.isError);const data=JSON.parse(result.content.find(c=>c.type==='text').text);assert(data.profile.orderCount>=93);assert(data.plans.length>0);assert(data.plans.every(p=>p.items.every(i=>i.restaurantId===p.restaurantId)));
 console.log('PASS: deployed authenticated tools/list and food_plan share real owner history and the coherent meal model.');
 const venture=await client.callTool({name:'venture_context',arguments:{}});assert(!venture.isError);const studio=JSON.parse(venture.content.find(c=>c.type==='text').text);assert.equal(studio.root,`users/${user.uid}/ventureData/workspace`);for(const name of ['threads','messages','branches','researchTasks','findings','decisions','experiments','opportunities'])assert(Array.isArray(studio[name]));assert(studio.messages.every(m=>!m.audioData));
 console.log('PASS: deployed Venture tools are listed and authenticated context reads the owner workspace without exposing audio payloads.');
 const {verifyAtlasHost}=await import('./verify-atlas-host.mjs');
 await verifyAtlasHost(client,db,user.uid);
 const cb=db.batch();cb.set(codexSession,{expiresAt:now()+300,revoked:false});cb.set(codexAccess,{uid:user.uid,email:user.email,authenticatedAt:now(),clientId:'local-codex-deployment-check',scopes:['local-codex:jobs'],sessionId:codexSessionId,resource:origin+'/local-codex/mcp',expiresAt:now()+300});await cb.commit();
 codexClient=new Client({name:'local-codex-live-acceptance',version:'1'});await codexClient.connect(new StreamableHTTPClientTransport(new URL(origin+'/local-codex/mcp'),{requestInit:{headers:{Authorization:'Bearer '+codexToken}}}));
 const codexNames=(await codexClient.listTools()).tools.map(t=>t.name).sort();assert.deepEqual(codexNames,['bridge_status','cancel_task','continue_task','get_task','list_codex_threads','list_projects','list_tasks','organize_codex_thread','read_codex_thread','record_task_outcome','respond_to_task','resume_codex_thread','start_task']);
 const health=await codexClient.callTool({name:'bridge_status',arguments:{}});assert(!health.isError);assert.equal(JSON.parse(health.content.find(c=>c.type==='text').text).openaiApiKeyRequired,false);
 assert.equal((await fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+codexToken}})).status,403);
 assert.equal((await fetch(origin+'/local-codex/mcp',{method:'POST',headers:{Authorization:'Bearer '+token}})).status,403);
 console.log('PASS: Local Codex has exactly thirteen authenticated work/history/outcome tools, and PTI/Codex tokens cannot cross resources. No local job was submitted.');
}finally{await client?.close().catch(()=>{});await codexClient?.close().catch(()=>{});const batch=db.batch();for(const ref of [accessRef,sessionRef,codexAccess,codexSession])batch.delete(ref);await batch.commit();}
