import {readFile} from 'node:fs/promises';
import {before,after,test} from 'node:test';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,writeBatch} from 'firebase/firestore';
const root='users/owner/weddingData/workspace',at='2026-10-15T10:00:00.000Z';let env;
const client=(uid,email=`${uid}@example.test`,verified=true)=>env.authenticatedContext(uid,{email,email_verified:verified}).firestore();
const defaults={title:'An occasion',kind:'function',date:'',startAt:'',arrivalAt:'',venue:'',address:'',mapUrl:'',owner:'',status:'proposed',audience:'',menuText:'Private menu',notes:'',source:''};
const stamp=(actor,rev=1,changeId='change')=>({revision:rev,createdAt:at,createdBy:actor,updatedAt:at,updatedBy:actor,archived:false,lastChangeId:changeId});
async function change(db,kind,id,data,before=null){const b=writeBatch(db);b.set(doc(db,`${root}/${kind}/${id}`),data);b.set(doc(db,`${root}/history/${data.lastChangeId}`),{collection:kind,recordId:id,revision:data.revision,actor:data.updatedBy,at:data.updatedAt,before,after:data,action:before?'updated':'created'});return b.commit();}
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-wedding-tests',firestore:{host:'127.0.0.1',port:8085,rules:await readFile(new URL('../../personal-harness/firestore.rules',import.meta.url),'utf8')}});
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();await setDoc(doc(d,root),{schemaVersion:1,ownerEmail:'owner@example.test'});
  await setDoc(doc(d,root+'/members/member@example.test'),{email:'member@example.test',name:'Member',role:'editor',invitedAt:at,invitedBy:'owner'});
  for(const [id,role] of [['owner','admin'],['manager','admin'],['reader','viewer'],['relative','family'],['blocked','blocked']])await setDoc(doc(d,root+'/members/'+id+'@example.test'),{email:id+'@example.test',name:id,role,invitedAt:at,invitedBy:'owner'});
  await setDoc(doc(d,root+'/events/seed'),{...defaults,...stamp('owner',1,'seed-import')});
  await setDoc(doc(d,root+'/guests/person'),{name:'Example guest',household:'Example',family:'',phone:'',dietary:'',arrivalAt:'',departureAt:'',stayFrom:'',stayUntil:'',accommodation:'',room:'',transport:'',notes:'',...stamp('owner',1,'seed-import')});
 });
});
after(()=>env?.cleanup());
test('anonymous and signed-in non-family accounts cannot read any wedding data',async()=>{
 for(const d of [env.unauthenticatedContext().firestore(),client('stranger')]){
  await assertFails(getDoc(doc(d,root)));await assertFails(getDoc(doc(d,root+'/events/seed')));
  await assertFails(getDocs(collection(d,root+'/guests')));await assertFails(getDocs(collection(d,root+'/history')));
 }
});
test('owner and invited verified accounts can read; unverified membership is insufficient',async()=>{
 await assertSucceeds(getDoc(doc(client('owner'),root)));
 await assertSucceeds(getDoc(doc(client('member'),root+'/events/seed')));
 await assertFails(getDoc(doc(client('member','member@example.test',false),root)));
});
test('membership and workspace metadata cannot be escalated by members',async()=>{
 const d=client('member');await assertFails(setDoc(doc(d,root+'/members/stranger@example.test'),{email:'stranger@example.test',name:'Stranger',role:'editor',invitedAt:at,invitedBy:'member'}));
 await assertFails(getDocs(collection(d,root+'/members')));await assertFails(updateDoc(doc(d,root),{schemaVersion:2}));
 await assertFails(getDoc(doc(d,'users/owner/personalData/workspace')));await assertFails(getDoc(doc(d,'users/owner/ventureData/workspace')));
});
test('family edits persist across independent sessions with immutable authorship/history',async()=>{
 const data={...defaults,...stamp('member',1,'new-event')};
 await assertSucceeds(change(client('member'),'events','new-event',data));
 const original=await getDoc(doc(client('owner'),root+'/events/new-event'));
 const next={...original.data(),title:'Updated title',revision:2,updatedBy:'owner',lastChangeId:'update-event'};
 await assertSucceeds(change(client('owner'),'events','new-event',next,original.data()));
 await assertSucceeds(getDoc(doc(client('member'),root+'/history/update-event')));
 await assertFails(updateDoc(doc(client('owner'),root+'/history/update-event'),{actor:'member'}));
 await assertFails(change(client('member'),'events','new-event',{...next,createdBy:'stranger',updatedBy:'member',revision:3,lastChangeId:'forged-author'},next));
});
test('a private record requires a matching atomic history entry; stale revisions fail',async()=>{
 await assertFails(setDoc(doc(client('owner'),root+'/events/unlogged'),{...defaults,...stamp('owner')}));
 const before=(await getDoc(doc(client('owner'),root+'/events/seed'))).data();
 await assertFails(change(client('owner'),'events','seed',{...before,revision:1,lastChangeId:'stale'},before));
 await assertFails(change(client('owner'),'events','malformed',{...defaults,...stamp('owner',1,'bad'),kind:'mandatory-ritual'},null));
});
test('attendance is unique per actual person and event; unknown references fail',async()=>{
 const record={guestId:'person',eventId:'seed',status:'tentative',...stamp('member',1,'attendance')};
 await assertSucceeds(change(client('member'),'attendance','person--seed',record));
 await assertFails(change(client('member'),'attendance','duplicate',{...record,lastChangeId:'duplicate'}));
 await assertFails(change(client('member'),'attendance','missing--seed',{...record,guestId:'missing',lastChangeId:'missing-guest'}));
});
test('decision confirmation, money and map inputs have server-side guards',async()=>{
 await assertFails(change(client('owner'),'decisions','unexplained',{title:'Venue',eventId:'',owner:'',status:'confirmed',due:'',proposal:'Discuss',resolution:'',source:'',...stamp('owner',1,'decision')}));
 await assertFails(change(client('owner'),'arrangements','negative',{title:'Vendor',category:'General',eventId:'',owner:'',status:'proposed',due:'',vendor:'',contact:'',agreedAmount:-1,paidAmount:0,notes:'',...stamp('owner',1,'money')}));
 await assertFails(change(client('owner'),'events','bad-map',{...defaults,mapUrl:'javascript:alert(1)',...stamp('owner',1,'map')}));
});
test('archive retains the record and history; direct destruction is disallowed',async()=>{
 const d=client('owner'),arrangement={title:'Linked vendor',category:'General',eventId:'seed',owner:'',status:'proposed',due:'',vendor:'',contact:'',agreedAmount:100,paidAmount:25,notes:'',...stamp('owner',1,'linked-vendor')};
 await assertSucceeds(change(d,'arrangements','linked-vendor',arrangement));
 const before=(await getDoc(doc(d,root+'/events/seed'))).data(),next={...before,archived:true,revision:2,lastChangeId:'archived'};
 await assertSucceeds(change(d,'events','seed',next,before));
 await assertSucceeds(change(d,'arrangements','linked-vendor',{...arrangement,paidAmount:50,revision:2,lastChangeId:'linked-payment'},arrangement));
 await assertFails(change(d,'arrangements','new-archived-link',{...arrangement,lastChangeId:'new-archived-link'}));
 const attendance=(await getDoc(doc(d,root+'/attendance/person--seed'))).data();
 await assertSucceeds(change(d,'attendance','person--seed',{...attendance,updatedBy:'owner',revision:2,archived:true,lastChangeId:'archived-attendance'},attendance));
 await assertFails(deleteDoc(doc(d,root+'/events/seed')));
});
test('membership removal revokes future root/collection reads and writes',async()=>{
 const owner=client('owner');await assertSucceeds(deleteDoc(doc(owner,root+'/members/member@example.test')));
 const revoked=client('member');await assertFails(getDoc(doc(revoked,root)));await assertFails(getDocs(collection(revoked,root+'/events')));
 await assertFails(change(revoked,'events','after-revocation',{...defaults,...stamp('member',1,'revoked')}));
});

test('verified sign-ins register only their own identity without gaining plan access',async()=>{
 const profile={uid:'requester',email:'requester@example.test',name:'Synthetic requester',firstSeenAt:at,lastSeenAt:at},d=client('requester');
 await assertSucceeds(setDoc(doc(d,root+'/accessRequests/requester'),profile));
 await assertSucceeds(getDoc(doc(d,root+'/accessRequests/requester')));
 await assertFails(getDoc(doc(d,root)));await assertFails(getDocs(collection(d,root+'/accessRequests')));
 await assertFails(setDoc(doc(d,root+'/accessRequests/another'),{...profile,uid:'another'}));
 await assertFails(updateDoc(doc(d,root+'/accessRequests/requester'),{role:'admin'}));
 await assertFails(updateDoc(doc(d,root+'/accessRequests/requester'),{email:'owner@example.test'}));
 await assertFails(updateDoc(doc(d,root+'/accessRequests/requester'),{firstSeenAt:'2020-01-01T00:00:00Z'}));
 await assertSucceeds(updateDoc(doc(d,root+'/accessRequests/requester'),{name:'Updated synthetic name',lastSeenAt:'2026-10-16T10:00:00Z'}));
 await assertFails(setDoc(doc(client('unverified','unverified@example.test',false),root+'/accessRequests/unverified'),{...profile,uid:'unverified',email:'unverified@example.test'}));
});

test('roles enforce Viewer read-only, Family edit and Blocked denial on the server',async()=>{
 await assertSucceeds(getDoc(doc(client('reader'),root+'/events/seed')));
 await assertFails(change(client('reader'),'events','viewer-write',{...defaults,...stamp('reader',1,'viewer-write')}));
 await assertSucceeds(change(client('relative'),'events','family-write',{...defaults,...stamp('relative',1,'family-write')}));
 await assertFails(getDoc(doc(client('blocked'),root)));
 await assertFails(getDocs(collection(client('blocked'),root+'/events')));
 await assertFails(change(client('blocked'),'events','blocked-write',{...defaults,...stamp('blocked',1,'blocked-write')}));
 await assertFails(getDocs(collection(client('reader'),root+'/members')));
});

test('admins can assign roles but members cannot self-promote, including atomic batches',async()=>{
 const manager=client('manager'),ref=doc(manager,root+'/members/requester@example.test');
 await assertSucceeds(getDocs(collection(manager,root+'/accessRequests')));
 await assertSucceeds(setDoc(ref,{email:'requester@example.test',name:'Synthetic requester',role:'viewer',invitedAt:at,invitedBy:'manager',updatedAt:at,updatedBy:'manager'}));
 await assertSucceeds(getDoc(doc(client('requester'),root)));
 await assertFails(updateDoc(doc(client('requester'),root+'/members/requester@example.test'),{role:'admin',updatedBy:'requester'}));
 const intruder=client('intruder'),batch=writeBatch(intruder);
 batch.set(doc(intruder,root+'/accessRequests/intruder'),{uid:'intruder',email:'intruder@example.test',name:'Synthetic intruder',firstSeenAt:at,lastSeenAt:at});
 batch.set(doc(intruder,root+'/members/intruder@example.test'),{email:'intruder@example.test',name:'Synthetic intruder',role:'admin',invitedAt:at,invitedBy:'intruder'});
 await assertFails(batch.commit());
 await assertSucceeds(updateDoc(ref,{role:'blocked'}));
 await assertFails(getDoc(doc(client('requester'),root)));
});

test('the canonical owner cannot be demoted or deleted by any client admin',async()=>{
 for(const actor of ['manager','owner']){
  const d=client(actor),ref=doc(d,root+'/members/owner@example.test');
  await assertFails(updateDoc(ref,{role:'blocked'}));await assertFails(deleteDoc(ref));
  await assertFails(updateDoc(doc(d,root),{ownerEmail:'manager@example.test'}));
 }
 await assertSucceeds(getDoc(doc(client('owner'),root)));
});
