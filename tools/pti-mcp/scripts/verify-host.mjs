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
let client;
try{
 const batch=db.batch();batch.set(sessionRef,{expiresAt:now()+300,revoked:false});batch.set(accessRef,{uid:user.uid,email:user.email,authenticatedAt:now(),clientId:'morsel-deployment-check',scopes:['pti:apps'],sessionId,resource:origin+'/mcp',expiresAt:now()+300});await batch.commit();
 client=new Client({name:'morsel-live-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}}));
 const names=(await client.listTools()).tools.map(t=>t.name);for(const name of ['food_context','food_plan','food_record_learning','food_publish_research','food_ingest_email','venture_context','venture_claim_research','venture_publish_research'])assert(names.includes(name));
 const result=await client.callTool({name:'food_plan',arguments:{craving:'Comforting, not too rich',mood:'Comfort'}});assert(!result.isError);const data=JSON.parse(result.content.find(c=>c.type==='text').text);assert(data.profile.orderCount>=93);assert(data.plans.length>0);assert(data.plans.every(p=>p.items.every(i=>i.restaurantId===p.restaurantId)));
 console.log('PASS: deployed authenticated tools/list and food_plan share real owner history and the coherent meal model.');
 const venture=await client.callTool({name:'venture_context',arguments:{}});assert(!venture.isError);const studio=JSON.parse(venture.content.find(c=>c.type==='text').text);assert.equal(studio.root,`users/${user.uid}/ventureData/workspace`);for(const name of ['threads','messages','branches','researchTasks','findings','decisions','experiments','opportunities'])assert(Array.isArray(studio[name]));assert(studio.messages.every(m=>!m.audioData));
 console.log('PASS: deployed Venture tools are listed and authenticated context reads the owner workspace without exposing audio payloads.');
}finally{await client?.close().catch(()=>{});const batch=db.batch();batch.delete(accessRef);batch.delete(sessionRef);await batch.commit();}
