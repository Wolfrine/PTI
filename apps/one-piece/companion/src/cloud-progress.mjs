import { AccessError, boundedJson } from './auth.mjs';

const leaseKeys=['sessionId','deviceId','destination','generation','authorityEpoch','revision','expiresAt','updatedAt'];
const progressKeys=['episodeId','sessionId','generation','authorityEpoch','revision','positionSeconds','durationSeconds','watched','reason','updatedAt'];
const pick=(object,keys)=>Object.fromEntries(keys.map(key=>[key,object[key]]));
export function firestoreFields(value) {
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,typeof item==='string'?{stringValue:item}:typeof item==='boolean'?{booleanValue:item}:Number.isSafeInteger(item)?{integerValue:String(item)}:Number.isFinite(item)?{doubleValue:item}:(()=>{throw new AccessError('invalid-cloud-value',500);})()]));
}
export function readFields(document) {
  if(!document?.fields||Array.isArray(document.fields))throw new AccessError('invalid-cloud-response',503);
  return Object.fromEntries(Object.entries(document.fields).map(([key,field])=>{
    if(!field||Object.keys(field).length!==1)throw new AccessError('invalid-cloud-response',503);
    if(typeof field.stringValue==='string')return[key,field.stringValue];
    if(typeof field.booleanValue==='boolean')return[key,field.booleanValue];
    if(/^-?\d+$/.test(field.integerValue)&&Number.isSafeInteger(Number(field.integerValue)))return[key,Number(field.integerValue)];
    if(typeof field.doubleValue==='number'&&Number.isFinite(field.doubleValue))return[key,field.doubleValue];
    throw new AccessError('invalid-cloud-response',503);
  }));
}

/** User-authorized Firestore replica. The PC's durable journal remains authoritative while offline. */
export class CloudProgress {
  constructor({projectId,ownerUid,credentials,store,fetchImpl=fetch,clock=()=>Date.now()}={}) {
    if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId??'')||!/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid??''))throw new Error('Invalid cloud progress configuration');
    Object.assign(this,{credentials,store,fetch:fetchImpl,clock});
    this.base=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    this.root=`projects/${projectId}/databases/(default)/documents/users/${ownerUid}/onePieceData/workspace`;
    this.path=`/users/${ownerUid}/onePieceData/workspace`;this.inflight=new Map();this.hydrated=new Set();this.statuses=new Map();this.lastAttempt=new Map();
  }
  async request(url,actor,init={}) {
    let response;
    try{response=await this.fetch(url,{...init,headers:{Authorization:`Bearer ${actor.token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});}catch{throw new AccessError('progress-sync-unavailable',503);}
    if(response.status===404&&(!init.method||init.method==='GET')){await response.body?.cancel();return null;}
    if(!response.ok){await response.body?.cancel();throw new AccessError([401,403].includes(response.status)?'progress-sync-denied':'progress-sync-unavailable',response.status===403?403:503);}
    return boundedJson(response,4*1024*1024);
  }
  async hydrate(uid,actor) {
    if(this.hydrated.has(uid))return;
    const leaseDoc=await this.request(`${this.base}${this.path}/leases/${encodeURIComponent(uid)}`,actor);
    const progress={};let pageToken='';let pages=0;
    do{
      const query=new URLSearchParams({pageSize:'1000',...(pageToken?{pageToken}:{})});
      const page=await this.request(`${this.base}${this.path}/profiles/${encodeURIComponent(uid)}/progress?${query}`,actor);
      for(const document of page?.documents??[]){const value=readFields(document);progress[value.episodeId]=value;}
      pageToken=page?.nextPageToken??'';
      if(++pages>3||typeof pageToken!=='string'||pageToken.length>8192)throw new AccessError('invalid-cloud-response',503);
    }while(pageToken);
    await this.store.hydrate(uid,{lease:leaseDoc?readFields(leaseDoc):null,progress});
    this.hydrated.add(uid);
  }
  status(uid){return this.statuses.get(uid)??{state:'local',message:'Progress is saved on this PC'};}
  sync(uid,{force=false}={}) {
    if(this.inflight.has(uid))return this.inflight.get(uid);
    if(!force&&this.clock()-(this.lastAttempt.get(uid)??-Infinity)<15000)return Promise.resolve({synced:false,scheduled:true});
    this.lastAttempt.set(uid,this.clock());
    const promise=this.perform(uid).then(result=>{this.statuses.set(uid,result.synced?{state:'synced',updatedAt:this.clock()}:{state:'pending',message:'Saved on this PC; cloud sync will retry'});return result;}).catch(error=>{
      this.statuses.set(uid,{state:'pending',code:error.code??'progress-sync-unavailable',message:'Saved on this PC; cloud sync will retry'});
      return {synced:false};
    }).finally(()=>this.inflight.delete(uid));
    this.inflight.set(uid,promise);return promise;
  }
  async perform(uid) {
    const initial=await this.store.snapshot(uid,{forSync:true});
    if(!initial.lease&&!Object.keys(await this.store.pending(uid)).length)return{synced:true,count:0};
    const actor=await this.credentials.getAuthorized(uid);
    await this.hydrate(uid,actor);
    const snapshot=await this.store.snapshot(uid,{forSync:true});
    const lease=snapshot.lease??(snapshot.closedLease?{...snapshot.closedLease,expiresAt:this.clock()+60000,updatedAt:this.clock()}:null);
    if(!lease||lease.expiresAt<=this.clock())return{synced:false};
    const pending=await this.store.pending(uid);
    const values=Object.values(pending);
    // Older offline records keep their position/reason/time, but project the CURRENT
    // authority revision. This is a latest-state replica, not a replay of revoked leases.
    const records=lease.revision>0?values:[];
    const writes=[];
    for(const record of records){
      const value={...record,sessionId:lease.sessionId,generation:lease.generation,authorityEpoch:lease.authorityEpoch,revision:lease.revision};
      writes.push({update:{name:`${this.root}/profiles/${uid}/progress/${record.episodeId}`,fields:firestoreFields(pick(value,progressKeys))}});
    }
    const leaseWrite={update:{name:`${this.root}/leases/${uid}`,fields:firestoreFields(pick(lease,leaseKeys))}};
    if(!writes.length)await this.request(`${this.base}:commit`,actor,{method:'POST',body:JSON.stringify({writes:[leaseWrite]})});
    for(let offset=0;offset<writes.length;offset+=200){
      await this.request(`${this.base}:commit`,actor,{method:'POST',body:JSON.stringify({writes:[leaseWrite,...writes.slice(offset,offset+200)]})});
      for(const record of records.slice(offset,offset+200))await this.store.acknowledge(uid,record.episodeId,record.generation,record.revision);
    }
    return{synced:true,count:records.length};
  }
}
