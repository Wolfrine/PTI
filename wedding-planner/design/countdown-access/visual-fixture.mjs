import { recordFixture } from '../../tests/fixtures.mjs';
import { ownerUid } from '../../src/config.ts';

/** Browser request interception only. This module is never imported by app/build code. */
export async function visualStoreSource(mode = 'admin', options = {}) {
  const records = await recordFixture();
  const now = '2026-10-15T10:15:00Z';
  const entries = [
    ['Synthetic protected owner', 'owner@example.test', 'admin', ownerUid],
    ['Example account awaiting approval', 'awaiting-approval@example.test', 'pending'],
    ['Example relative with a longer family name', 'a.longer.google.account@example.test', 'pending'],
    ['Example planning admin', 'planning-admin@example.test', 'admin'],
    ['Example family member', 'family-member@example.test', 'family'],
    ['Example legacy invitation', 'earlier-invitation@example.test', 'editor'],
    ['Example read-only relative', 'viewer@example.test', 'viewer'],
    ['Example blocked account', 'blocked@example.test', 'blocked'],
    ['Example hospitality helper', 'hospitality@example.test', 'family'],
    ['Example travel coordinator', 'travel@example.test', 'family'],
  ];
  const accessRequests = entries.map(([name,email,role,uid],index) => ({id:uid || `synthetic-account-${index}`,uid:uid || `synthetic-account-${index}`,name,email,firstSeenAt:now,lastSeenAt:now}));
  const members = entries.filter(e => e[2] !== 'pending').map(([name,email,role]) => ({id:email,email,name,role,invitedAt:now,invitedBy:'synthetic-admin'}));
  const role = ['viewer','pending','blocked','family'].includes(mode) ? mode : 'admin';
  const state = {user:{uid:'synthetic-admin',displayName:'Example planning admin',email:'planning-admin@example.test'},isOwner:false,isAdmin:role==='admin',canEdit:['admin','family'].includes(role),role,loading:mode==='loading',access:mode==='loading'?'loading':role==='pending'?'pending':role==='blocked'?'denied':'ready',offline:mode==='offline',error:role==='blocked'?'Your family access has been blocked. Contact a family admin.':'',records:['pending','blocked','loading'].includes(mode)?{events:[],guests:[],attendance:[],arrangements:[],decisions:[]}:records,members:role==='admin'?members:[],accessRequests:role==='admin'?accessRequests:[],demo:true,truncated:false};
  return `export function createWeddingStore(onChange){let state=${JSON.stringify(state)};const emit=()=>{store.state=state;onChange(state)};globalThis.__visualSetRole=(role)=>{state={...state,role,isAdmin:role==='admin',canEdit:['admin','family'].includes(role),access:role==='pending'?'pending':role==='blocked'?'denied':'ready',records:['pending','blocked'].includes(role)?{events:[],guests:[],attendance:[],arrangements:[],decisions:[]}:state.records,members:role==='admin'?state.members:[],accessRequests:role==='admin'?state.accessRequests:[]};emit()};const store={state,async start(){emit()},async signIn(){},async signOut(){state={...state,user:null,access:'signed-out',role:'pending',canEdit:false,isAdmin:false,members:[],accessRequests:[],records:{events:[],guests:[],attendance:[],arrangements:[],decisions:[]}};emit()},async assignRole(email,role,expectedRole){await new Promise(r=>setTimeout(r,${options.delay || 500}));if(${JSON.stringify(options.error || '')})throw Error(${JSON.stringify(options.error || '')});const before=state.members.find(m=>m.email===email);if((before?.role||'pending')!==expectedRole)throw Error('This account changed. Review its current role before saving.');state={...state,members:[...state.members.filter(m=>m.email!==email),...(role==='pending'?[]:[{id:email,email,name:state.accessRequests.find(p=>p.email===email)?.name||'',role,invitedAt:'${now}',invitedBy:'synthetic-admin'}])]};emit()},async exportData(){return '{}'},async save(){throw Error('This visual fixture does not save wedding data.')},async archive(){throw Error('This visual fixture does not archive wedding data.')}};return store;}`;
}
