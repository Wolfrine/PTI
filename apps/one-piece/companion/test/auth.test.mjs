import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { AccessError, FirebaseIdentity, FamilyAccess, boundedJson } from '../src/auth.mjs';

const now = 1_792_000_000;
const { publicKey, privateKey } = await generateKeyPair('RS256');
const identity = new FirebaseIdentity({ projectId: 'pti-app-2ab59', clock: () => now * 1000, keyResolver: () => publicKey });
async function token(patch = {}, header = {}) {
  return new SignJWT({ sub: 'viewer-uid', email: 'Family@Example.com', email_verified: true,
    auth_time: now - 100, iat: now - 5, exp: now + 3595,
    aud: 'pti-app-2ab59', iss: 'https://securetoken.google.com/pti-app-2ab59',
    firebase: { sign_in_provider: 'google.com' }, ...patch })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key', ...header }).sign(privateKey);
}
test('valid signed Google token normalizes email and retains immutable uid', async () => {
  const result = await identity.verify(await token());
  assert.equal(result.uid, 'viewer-uid'); assert.equal(result.email, 'family@example.com');
  assert.ok(Object.isFrozen(result));
});
test('identity rejects other project/issuer, expired/future claims and unverified/nonGoogle identities', async () => {
  for (const patch of [ { aud: 'other-project' }, { iss: 'https://attacker.invalid' }, { exp: now - 1 },
    { iat: now + 1 }, { auth_time: now + 1 }, { sub: '' }, { email_verified: false },
    { firebase: { sign_in_provider: 'password' } }, { exp: now + 100_000 } ]) {
    await assert.rejects(identity.verify(await token(patch)), AccessError);
  }
  const valid = await token();
  const parts = valid.split('.'); parts[1] = Buffer.from('{}').toString('base64url');
  await assert.rejects(identity.verify(parts.join('.')), AccessError);
  await assert.rejects(identity.verify('unsigned'), AccessError);
});
const doc = fields => new Response(JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k,v]) => [k, typeof v === 'boolean' ? {booleanValue:v} : {stringValue:v}])) }));
test('family access binds verified email AND uid, blocks role escalation and missing workspace', async () => {
  const actor = { uid: 'viewer-uid', email: 'family@example.com', token: 'signed-user-token' };
  const requests=[];
  const access = new FamilyAccess({ projectId: 'pti-app-2ab59', ownerUid: 'owner-uid', fetchImpl: async (url, init) => {
    requests.push({url,init}); return doc(url.endsWith('/workspace')?{ownerUid:'owner-uid',active:true}:{role:'member',active:true,email:actor.email,uid:actor.uid});
  }});
  assert.equal((await access.requireMember(actor)).role,'member');
  assert.equal(requests.length,2);
  assert.ok(requests.every(request=>request.init.headers.Authorization==='Bearer signed-user-token'));
  assert.ok(requests[0].url.endsWith('/members/family%40example.com'));
  assert.ok(requests[1].url.endsWith('/workspace'));
  for (const record of [ {role:'owner',active:true,email:actor.email,uid:actor.uid},
    {role:'member',active:false,email:actor.email,uid:actor.uid},
    {role:'member',active:true,email:actor.email,uid:'another-uid'} ]) {
    access.fetch = async () => doc(record);
    await assert.rejects(access.requireMember(actor), {code:'not-invited'});
  }
  access.fetch = async () => new Response('',{status:404});
  await assert.rejects(access.requireMember({...actor,uid:'owner-uid'}),{code:'not-invited'});
});
test('a valid invitation cannot authorize playback for a disabled, missing or different household',async()=>{
 const actor={uid:'viewer-uid',email:'family@example.com',token:'synthetic-user-token'};
 const member={role:'member',active:true,email:actor.email,uid:actor.uid};
 for(const workspace of [{ownerUid:'owner-uid',active:false},{ownerUid:'another-owner',active:true},null,403,404,503]){
  const access=new FamilyAccess({projectId:'pti-app-2ab59',ownerUid:'owner-uid',fetchImpl:async url=>
   url.includes('/members/')?doc(member):typeof workspace==='number'?new Response('',{status:workspace}):doc(workspace??{})});
  await assert.rejects(access.requireMember(actor),{code:workspace===503?'membership-unavailable':'family-unavailable'});
 }
});
test('identity/membership oversized streamed responses stop before unbounded consumption', async () => {
  let cancelled=false;
  const stream = new ReadableStream({pull(c){c.enqueue(new Uint8Array(100));},cancel(){cancelled=true;}});
  await assert.rejects(boundedJson(new Response(stream),50), {code:'invalid-identity-response'});
  assert.equal(cancelled,true);
});

test('pending invitations and owner setup are opt-in metadata states, never playback membership',async()=>{
 const actor={uid:'viewer',email:'family@example.com',token:'fixture'};
 const access=new FamilyAccess({projectId:'pti-app-2ab59',ownerUid:'owner',fetchImpl:async()=>doc({role:'member',active:true,email:actor.email,uid:''})});
 await assert.rejects(access.requireMember(actor),{code:'not-invited'});
 assert.equal((await access.requireMember(actor,{allowPending:true})).needsClaim,true);
 access.fetch=async()=>new Response('',{status:404});
 await assert.rejects(access.requireMember({...actor,uid:'owner'}),{code:'not-invited'});
 assert.equal((await access.requireMember({...actor,uid:'owner'},{allowOwnerSetup:true})).needsWorkspace,true);
 access.fetch=async()=>new Response('',{status:403});
 assert.equal((await access.requireMember({...actor,uid:'owner'},{allowOwnerSetup:true})).needsWorkspace,true);
 await assert.rejects(access.requireMember({...actor,uid:'owner'}),{code:'not-invited'});
});
test('malformed membership records fail safely and rejected response streams are cancelled',async()=>{
  const actor={uid:'viewer-uid',email:'family@example.com',token:'signed-user-token'};
  const access=new FamilyAccess({projectId:'pti-app-2ab59',ownerUid:'owner-uid'});
  for(const body of [null,{fields:null},{fields:{role:null}},{fields:{role:{stringValue:12}}}]){
    access.fetch=async()=>new Response(JSON.stringify(body));
    await assert.rejects(access.requireMember(actor),{code:'invalid-membership-response',status:503});
  }
  let cancelled=false;
  access.fetch=async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:403});
  await assert.rejects(access.requireMember(actor),{code:'not-invited'});assert.equal(cancelled,true);
});
test('signing-key outage backoff bounds upstream requests even with an empty/expired cache',async()=>{
  let milliseconds=now*1000;let calls=0;let cancels=0;
  const verifier=new FirebaseIdentity({projectId:'pti-app-2ab59',clock:()=>milliseconds,fetchImpl:async()=>{
    calls++;return new Response(new ReadableStream({cancel(){cancels++;}}),{status:503});
  }});
  for(let i=0;i<3;i++)await assert.rejects(verifier.resolveKey({alg:'RS256',kid:`unknown-${i}`}),{code:'identity-unavailable',status:503});
  assert.equal(calls,1);assert.equal(cancels,1);
  milliseconds+=30_001;
  await assert.rejects(verifier.resolveKey({alg:'RS256',kid:'retry'}),{code:'identity-unavailable',status:503});
  assert.equal(calls,2);
});
